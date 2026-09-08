begin;
create function private_live_gateway.scope(p_grant_id text)
returns table(customer_id bigint,customer_name text,organisation_id uuid,facility_id uuid)
language sql security definer set search_path='' as $$
select null::bigint,o."Org_Name"::text,g.organisation_id,f."WMSFacility_ID"
from private_live_gateway.customer_grants g join public."Org_Master" o on o."Org_id"=g.organisation_id
join public."WMS_CustomerFacilityAccess" a on a."WMSCustomerFacilityAccess_CustomerOrgID"=g.organisation_id and a."WMSCustomerFacilityAccess_IsActive"
join public."WMS_Facilities" f on f."WMSFacility_ID"=a."WMSCustomerFacilityAccess_FacilityID" and f."WMSFacility_ID"=any(g.facility_ids)
where g.id=p_grant_id and g.enabled and f."WMSFacility_IsActive" and not f."WMSFacility_IsDeleted";
$$;
revoke all on function private_live_gateway.scope(text) from public,anon,authenticated,service_role;
create function private_live_gateway.order_records(
  p_grant_id text,record_kind text,
  page_offset integer default 0,page_size integer default 50
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if record_kind is null or record_kind not in ('orders','purchase_order') or page_offset is null or page_offset<0 or page_offset>100000
    or page_size is null or page_size<1 or page_size>100 then raise exception 'Invalid register request' using errcode='22023'; end if;
  with scope as materialized(select * from private_live_gateway.scope(p_grant_id)),
  records as (
    select o."WMSOrder_ID" as id,o."WMSOrder_TypeCode"::text as kind,o."WMSOrder_OrderNumber"::text as number,
      o."WMSOrder_CustomerReference"::text as reference,o."WMSOrder_StatusCode"::text as status,o."WMSOrder_RequestedDate" as requested_date,
      o."WMSOrder_CreatedAt" as created_at,s.customer_id,s.customer_name,s.facility_id
    from scope s join public."WMS_Orders" o on o."WMSOrder_CustomerOrgID"=s.organisation_id and o."WMSOrder_FacilityID"=s.facility_id
    where record_kind='orders' and not o."WMSOrder_IsDeleted"
    union all
    select p."WMSPO_ID",'purchase_order',p."WMSPO_Number",p."WMSPO_BuyerReference",p."WMSPO_StatusCode",p."WMSPO_ExpectedDeliveryDate",
      p."WMSPO_CreatedAt",s.customer_id,s.customer_name,s.facility_id
    from scope s join public."WMS_PurchaseOrders" p on p."WMSPO_CustomerOrgID"=s.organisation_id and p."WMSPO_FacilityID"=s.facility_id
    where record_kind='purchase_order' and not p."WMSPO_IsDeleted"
  ), page as(select * from records order by created_at desc,id limit page_size+1 offset page_offset),
  numbered as(select *,row_number() over(order by created_at desc,id) as n from page)
  select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'number',r.number,'reference',r.reference,
    'status',r.status,'requestedDate',r.requested_date,'createdAt',r.created_at,'customerId',r.customer_id,'customerName',r.customer_name,
    'facilityId',r.facility_id,'facilityName',f."WMSFacility_Name") order by n) filter(where n<=page_size),'[]'::jsonb),
    'hasMore',count(*)>page_size,'offset',page_offset) into result
  from numbered r join public."WMS_Facilities" f on f."WMSFacility_ID"=r.facility_id;
  return result;
end;
$$;
create function private_live_gateway.order_detail(
  p_grant_id text, record_kind text, target_order_id uuid,
  page_offset integer default 0, page_size integer default 50
) returns jsonb language plpgsql security definer set search_path='' as $$
declare header jsonb; lines jsonb; owner_id uuid;
begin
  if record_kind is null or record_kind not in ('orders','purchase_order') or target_order_id is null
    or page_offset is null or page_offset<0 or page_offset>100000 or page_size is null or page_size<1 or page_size>100 then
    raise exception 'Invalid order detail request' using errcode='22023';
  end if;
  if record_kind='orders' then
    select jsonb_build_object('id',o."WMSOrder_ID",'number',o."WMSOrder_OrderNumber",'kind',o."WMSOrder_TypeCode",
      'reference',o."WMSOrder_CustomerReference",'status',o."WMSOrder_StatusCode",'requestedDate',o."WMSOrder_RequestedDate",
      'customerName',s.customer_name,'facilityName',f."WMSFacility_Name"),s.organisation_id into header,owner_id
    from private_live_gateway.scope(p_grant_id) s
    join public."WMS_Orders" o on o."WMSOrder_CustomerOrgID"=s.organisation_id and o."WMSOrder_FacilityID"=s.facility_id
    join public."WMS_Facilities" f on f."WMSFacility_ID"=s.facility_id
    where o."WMSOrder_ID"=target_order_id and not o."WMSOrder_IsDeleted";
  else
    select jsonb_build_object('id',p."WMSPO_ID",'number',p."WMSPO_Number",'kind','purchase_order',
      'reference',p."WMSPO_BuyerReference",'status',p."WMSPO_StatusCode",'requestedDate',p."WMSPO_ExpectedDeliveryDate",
      'customerName',s.customer_name,'facilityName',f."WMSFacility_Name"),s.organisation_id into header,owner_id
    from private_live_gateway.scope(p_grant_id) s
    join public."WMS_PurchaseOrders" p on p."WMSPO_CustomerOrgID"=s.organisation_id and p."WMSPO_FacilityID"=s.facility_id
    join public."WMS_Facilities" f on f."WMSFacility_ID"=s.facility_id
    where p."WMSPO_ID"=target_order_id and not p."WMSPO_IsDeleted";
  end if;
  if header is null then raise exception 'Order unavailable' using errcode='P0002'; end if;
  with eligible as (
    select l."WMSOrderLine_ID" as id,l."WMSOrderLine_LineNo" as line_no,i."WMSItem_SKU"::text as sku,
      i."WMSItem_Description"::text as description,l."WMSOrderLine_UOMCode"::text as uom,
      l."WMSOrderLine_OrderedQuantity" as ordered,l."WMSOrderLine_ReceivedQuantity" as received,
      l."WMSOrderLine_AllocatedQuantity" as allocated,l."WMSOrderLine_PickedQuantity" as picked,l."WMSOrderLine_DispatchedQuantity" as dispatched
    from public."WMS_OrderLines" l join public."WMS_Items" i on i."WMSItem_ID"=l."WMSOrderLine_ItemID" and i."WMSItem_CustomerOrgID"=owner_id
    where record_kind='orders' and l."WMSOrderLine_OrderID"=target_order_id
    union all
    select l."WMSPOLine_ID",l."WMSPOLine_LineNo",l."WMSPOLine_SKU",l."WMSPOLine_Description",l."WMSPOLine_UOMCode",
      l."WMSPOLine_OrderedQuantity",l."WMSPOLine_ReceivedQuantity",null::numeric,null::numeric,null::numeric
    from public."WMS_PurchaseOrderLines" l
    where record_kind='purchase_order' and l."WMSPOLine_PurchaseOrderID"=target_order_id
      and (l."WMSPOLine_ItemID" is null or exists(select 1 from public."WMS_Items" i where i."WMSItem_ID"=l."WMSPOLine_ItemID" and i."WMSItem_CustomerOrgID"=owner_id))
  ), page as(select * from eligible order by line_no,id limit page_size+1 offset page_offset),
  numbered as(select *,row_number() over(order by line_no,id) as n from page)
  select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('id',id,'lineNumber',line_no,'sku',sku,
    'description',description,'uom',uom,'ordered',ordered,'received',received,'allocated',allocated,'picked',picked,'dispatched',dispatched)
    order by n) filter(where n<=page_size),'[]'::jsonb),'hasMore',count(*)>page_size,'offset',page_offset) into lines from numbered;
  return jsonb_build_object('order',header,'lines',lines);
end;
$$;

revoke all on function private_live_gateway.order_records(text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function private_live_gateway.order_detail(text,text,uuid,integer,integer) from public,anon,authenticated,service_role;
create function public.live_gateway_query(p_key_id text,p_connection_id text,p_subject_id text,p_grant_id text,p_nonce uuid,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; g private_live_gateway.customer_grants%rowtype; page_offset integer; page_size integer;
begin
  if p_operation in ('warehouse.context','warehouse.stock','warehouse.products') then
    result:=public.live_gateway_read(p_key_id,p_connection_id,p_subject_id,p_grant_id,p_nonce,p_operation,p_input);
  elsif p_operation in ('warehouse.orders','warehouse.order.detail') then
    if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('kind','id','offset','limit'))
      or (p_operation='warehouse.orders' and p_input ? 'id') then raise exception 'Invalid order filter' using errcode='22023'; end if;
    perform public.live_gateway_read(p_key_id,p_connection_id,p_subject_id,p_grant_id,p_nonce,'warehouse.context','{}');
    update private_live_gateway.requests set operation=p_operation where key_id=p_key_id and nonce=p_nonce;
    if coalesce(p_input->>'offset','0')!~'^\d+$' or coalesce(p_input->>'limit','50')!~'^\d+$' then raise exception 'Invalid page' using errcode='22023'; end if;
    page_offset:=coalesce(p_input->>'offset','0')::integer; page_size:=coalesce(p_input->>'limit','50')::integer;
    if p_operation='warehouse.orders' then return private_live_gateway.order_records(p_grant_id,p_input->>'kind',page_offset,page_size); end if;
    return private_live_gateway.order_detail(p_grant_id,p_input->>'kind',(p_input->>'id')::uuid,page_offset,page_size);
  else raise exception 'Unsupported operation' using errcode='22023'; end if;
  select * into g from private_live_gateway.customer_grants where id=p_grant_id;
  if p_operation='warehouse.context' then
    select jsonb_build_object('assignments',coalesce(jsonb_agg(a||jsonb_build_object('canManageProducts',g.products_enabled,'canCreateOrders',g.orders_enabled,'canCreatePurchaseOrders',g.purchase_orders_enabled)),'[]')) into result from jsonb_array_elements(result->'assignments') a;
  elsif p_operation='warehouse.products' then
    result:=jsonb_set(result,'{rows}',(select coalesce(jsonb_agg(r||jsonb_build_object('canManage',g.products_enabled,'facilityId',(select s.facility_id from private_live_gateway.scope(p_grant_id) s
      join public."WMS_ItemFacilityAssignments" a on a."WMSItemFacility_FacilityID"=s.facility_id and a."WMSItemFacility_ItemID"=(r->>'id')::uuid and a."WMSItemFacility_IsActive"
      where nullif(p_input->>'facilityId','') is null or s.facility_id=(p_input->>'facilityId')::uuid order by s.facility_id limit 1))),'[]') from jsonb_array_elements(result->'rows') r));
  elsif p_operation='warehouse.stock' then
    result:=jsonb_set(result,'{rows}',(select coalesce(jsonb_agg(r||jsonb_build_object('facilityName',f."WMSFacility_Name")),'[]') from jsonb_array_elements(result->'rows') r join public."WMS_Facilities" f on f."WMSFacility_ID"=(r->>'facilityId')::uuid));
  end if;
  return result;
end;
$$;
revoke all on function public.live_gateway_query(text,text,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.live_gateway_query(text,text,text,text,uuid,text,jsonb) to service_role;
commit;
