begin;
do $$ begin
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public."WMS_Items"'::regclass
    and tgname='TR_WMS_Items_default_assignment' and tgenabled in ('O','A')) then
    raise exception 'Apply the App item-facility lifecycle before enabling gateway mutations'; end if;
end $$;
alter table private_live_gateway.customer_grants
  add column products_enabled boolean not null default false,
  add column orders_enabled boolean not null default false,
  add column purchase_orders_enabled boolean not null default false;
create table private_live_gateway.changes(
  connection_id text not null, subject_id text not null, grant_id text not null,
  organisation_id uuid not null, request_id uuid not null, operation text not null,
  input jsonb not null, before_value jsonb not null, result jsonb not null,
  source text not null default 'multideck.live.gateway',
  reason text not null default 'Customer submitted an authorised warehouse change',
  created_at timestamptz not null default now(),
  primary key(connection_id,subject_id,request_id)
);
alter table private_live_gateway.changes enable row level security;
revoke all on private_live_gateway.changes from public,anon,authenticated,service_role;
create function private_live_gateway.prevent_history_changes() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Gateway history is append-only' using errcode='55000'; end;
$$;
revoke all on function private_live_gateway.prevent_history_changes() from public,anon,authenticated;
create trigger gateway_changes_immutable before update or delete on private_live_gateway.changes
for each row execute function private_live_gateway.prevent_history_changes();

create function public.live_gateway_mutate(p_key_id text,p_connection_id text,p_subject_id text,p_grant_id text,p_nonce uuid,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<mutation>>
declare
  grant_row private_live_gateway.customer_grants%rowtype;
  replay private_live_gateway.changes%rowtype;
  org_id uuid; target_facility_id uuid; target_item_id uuid; request_id uuid;
  product_description text; product_sku text; product_uom text; expected_updated_at timestamptz;
  item public."WMS_Items"%rowtype; previous jsonb := '{}'; result jsonb;
  order_kind text; order_payload jsonb; line jsonb; operational_lines jsonb := '[]';
  quantity numeric; unit_price numeric; tax_rate numeric; payload jsonb; record_id uuid; reference text; status text;
begin
  if p_operation is null or p_operation not in ('warehouse.product.create','warehouse.product.rename','warehouse.order.submit')
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid operation' using errcode='22023'; end if;
  target_facility_id := (p_input->>'facilityId')::uuid;
  request_id := (p_input->>'requestId')::uuid;
  if request_id is null or target_facility_id is null then raise exception 'Request and warehouse required' using errcode='22023'; end if;
  -- Reuse the exact read authentication boundary and consume the transport nonce atomically.
  perform public.live_gateway_read(p_key_id,p_connection_id,p_subject_id,p_grant_id,p_nonce,'warehouse.stock',jsonb_build_object('facilityId',target_facility_id,'limit',1));
  update private_live_gateway.requests set operation=p_operation where key_id=p_key_id and nonce=p_nonce;
  -- Serialise writes/retries and permission edits on the verified grant.
  select * into grant_row from private_live_gateway.customer_grants where id=p_grant_id for update;
  org_id := grant_row.organisation_id;
  order_kind := p_input->>'kind';
  if not (case when p_operation='warehouse.order.submit' then
    case when order_kind='purchase_order' then grant_row.purchase_orders_enabled else grant_row.orders_enabled end
    else grant_row.products_enabled end) then raise exception 'Action denied' using errcode='42501'; end if;
  -- Serialise the request identity across grants, too; never repeat a write on a new grant.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection_id||':'||p_subject_id||':'||request_id::text,0));
  select * into replay from private_live_gateway.changes c where c.connection_id=p_connection_id and c.subject_id=p_subject_id and c.request_id=mutation.request_id;
  if found then
    if replay.grant_id<>p_grant_id or replay.organisation_id<>org_id or replay.operation<>p_operation or replay.input<>p_input then
      raise exception 'Request ID used for a different change' using errcode='40001'; end if;
    return replay.result;
  end if;
  if p_operation='warehouse.order.submit' then
    if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('facilityId','requestId','kind','payload')) then raise exception 'Unsupported order field' using errcode='22023'; end if;
    order_payload := p_input->'payload';
  if order_kind is null or order_kind not in ('purchase_order','inbound','outbound') or request_id is null
    or jsonb_typeof(order_payload) is distinct from 'object' then
    raise exception 'Invalid order request' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(order_payload) k where k not in ('reference','requestedDate','instructions','supplierName','currency','lines')) then
    raise exception 'Unsupported order field' using errcode='22023'; end if;
  if nullif(btrim(order_payload->>'reference'),'') is null or length(order_payload->>'reference')>120
    or length(coalesce(order_payload->>'instructions',''))>4000 or length(coalesce(order_payload->>'supplierName',''))>240
    or jsonb_typeof(order_payload->'lines') is distinct from 'array' then
    raise exception 'Provide a reference and item lines' using errcode='22023'; end if;
  if jsonb_array_length(order_payload->'lines') not between 1 and 100 then
    raise exception 'Supply between 1 and 100 item lines' using errcode='22023'; end if;
  if nullif(order_payload->>'requestedDate','') is null then
    raise exception 'Choose a requested date' using errcode='22023'; end if;
  perform (order_payload->>'requestedDate')::date;
  -- One line per product prevents per-line availability checks being bypassed by duplicates.
  if (select count(distinct value->>'itemId') from jsonb_array_elements(order_payload->'lines'))<>jsonb_array_length(order_payload->'lines') then
    raise exception 'Use one line per product' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(order_payload->'lines') loop
    if jsonb_typeof(line) is distinct from 'object' or exists(select 1 from jsonb_object_keys(line) k where k not in ('itemId','quantity','unitPrice','taxRate')) then
      raise exception 'Unsupported item line' using errcode='22023'; end if;
    select i.* into item from public."WMS_Items" i
      join public."WMS_ItemFacilityAssignments" a on a."WMSItemFacility_ItemID"=i."WMSItem_ID"
        and a."WMSItemFacility_FacilityID"=target_facility_id and a."WMSItemFacility_IsActive"
      where i."WMSItem_ID"=(line->>'itemId')::uuid and i."WMSItem_CustomerOrgID"=org_id and i."WMSItem_IsActive" and not i."WMSItem_IsDeleted";
    if not found then raise exception 'Product is not available for this customer and warehouse' using errcode='42501'; end if;
    if coalesce(line->>'quantity','')!~'^[0-9]+(\.[0-9]{1,6})?$' then raise exception 'Enter a positive quantity with at most six decimal places' using errcode='22023'; end if;
    quantity:=(line->>'quantity')::numeric;
    if quantity<=0 or quantity>=1000000000000 then raise exception 'Quantity out of range' using errcode='22023'; end if;
    perform public._warehouse_edge_validate_quantity(item."WMSItem_ID",quantity);
    unit_price:=coalesce(nullif(line->>'unitPrice','')::numeric,0);tax_rate:=coalesce(nullif(line->>'taxRate','')::numeric,0);
    if unit_price<0 or unit_price>=1000000000 or tax_rate<0 or tax_rate>100 or unit_price::text in ('NaN','Infinity','-Infinity') or tax_rate::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Invalid price or tax rate' using errcode='22023'; end if;
    operational_lines:=operational_lines||jsonb_build_array(jsonb_build_object('itemId',item."WMSItem_ID",'sku',item."WMSItem_SKU",
      'description',item."WMSItem_Description",'quantity',quantity,'uomCode',item."WMSItem_BaseUOMCode",'unitPrice',unit_price,'taxRate',tax_rate));
  end loop;
  if order_kind='purchase_order' then
    if coalesce(order_payload->>'currency','')!~'^[A-Z]{3}$' then raise exception 'Choose a currency' using errcode='22023'; end if;
    payload:=jsonb_build_object('facilityId',target_facility_id,'customerOrgId',org_id,'number',btrim(order_payload->>'reference'),
      'supplierName',coalesce(order_payload->>'supplierName',''),'currencyCode',order_payload->>'currency',
      'expectedDeliveryDate',order_payload->>'requestedDate','notes',order_payload->>'instructions','lines',operational_lines);
    record_id:=public.warehouse_edge_purchase_order_mutation('create',null,payload,null,array[target_facility_id]);
    perform public.warehouse_edge_purchase_order_mutation('issue',record_id,'{}',null,array[target_facility_id]);
    select p."WMSPO_Number",p."WMSPO_StatusCode" into reference,status from public."WMS_PurchaseOrders" p where p."WMSPO_ID"=record_id;
  else
    payload:=jsonb_build_object('facilityId',target_facility_id,'customerOrgId',org_id,'typeCode',order_kind,
      'sourceTypeCode','manual_exception','sourceNotes','Customer submitted through Multideck Live',
      'customerReference',btrim(order_payload->>'reference'),'requestedDate',order_payload->>'requestedDate',
      'instructions',order_payload->>'instructions','lines',operational_lines);
    record_id:=public.warehouse_edge_create_order_mutation(payload,null,null,array[target_facility_id],array[org_id]);
    select o."WMSOrder_OrderNumber",o."WMSOrder_StatusCode" into reference,status from public."WMS_Orders" o where o."WMSOrder_ID"=record_id;
  end if;
  result:=jsonb_build_object('id',record_id,'kind',order_kind,'number',reference,'status',status);

  else
    if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('facilityId','requestId','itemId','description','sku','uom','updatedAt')) then raise exception 'Unsupported product field' using errcode='22023'; end if;
    target_item_id := (p_input->>'itemId')::uuid;
    if (p_operation='warehouse.product.rename' and target_item_id is null) or (p_operation='warehouse.product.create' and target_item_id is not null) then raise exception 'Invalid product operation' using errcode='22023'; end if;
    product_description := p_input->>'description'; product_sku := p_input->>'sku'; product_uom := p_input->>'uom'; expected_updated_at := (p_input->>'updatedAt')::timestamptz;
    if nullif(btrim(product_description),'') is null or length(btrim(product_description))>240 then raise exception 'Invalid product name' using errcode='22023'; end if;
  if target_item_id is null then
    if expected_updated_at is not null or nullif(btrim(product_sku),'') is null or length(btrim(product_sku))>120
      or product_uom is null or upper(btrim(product_uom))!~'^[A-Z][A-Z0-9_/-]{0,19}$' then
      raise exception 'Enter a SKU and unit' using errcode='22023'; end if;
    insert into public."WMS_Items"("WMSItem_CustomerOrgID","WMSItem_DefaultFacilityID","WMSItem_SKU","WMSItem_Description","WMSItem_BaseUOMCode")
      values(org_id,target_facility_id,btrim(product_sku),btrim(product_description),upper(btrim(product_uom))) returning * into item;
  else
    select i.* into item from public."WMS_Items" i
      join public."WMS_ItemFacilityAssignments" a on a."WMSItemFacility_ItemID"=i."WMSItem_ID"
        and a."WMSItemFacility_FacilityID"=target_facility_id and a."WMSItemFacility_IsActive"
      where i."WMSItem_ID"=target_item_id and i."WMSItem_CustomerOrgID"=org_id and not i."WMSItem_IsDeleted" for update of i;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
    if expected_updated_at is null or item."WMSItem_UpdatedAt"<>expected_updated_at then
      raise exception 'Product changed; reload before renaming' using errcode='40001'; end if;
    if product_sku is not null or product_uom is not null then
      raise exception 'Renaming cannot change SKU or unit' using errcode='22023'; end if;
    previous := jsonb_build_object('description',item."WMSItem_Description");
    update public."WMS_Items" set "WMSItem_Description"=btrim(product_description),"WMSItem_UpdatedAt"=clock_timestamp()
      where "WMSItem_ID"=item."WMSItem_ID" returning * into item;
  end if;
  result := jsonb_build_object('id',item."WMSItem_ID",'facilityId',target_facility_id,
    'sku',item."WMSItem_SKU",'description',item."WMSItem_Description",'uom',item."WMSItem_BaseUOMCode",'updatedAt',item."WMSItem_UpdatedAt");

  end if;
  insert into private_live_gateway.changes(connection_id,subject_id,grant_id,organisation_id,request_id,operation,input,before_value,result)
    values(p_connection_id,p_subject_id,p_grant_id,org_id,request_id,p_operation,p_input,previous,result);
  return result;
end;
$$;
revoke all on function public.live_gateway_mutate(text,text,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.live_gateway_mutate(text,text,text,text,uuid,text,jsonb) to service_role;
commit;
