-- Warehouse purchase orders: operator-entered and document-extracted headers and lines.
-- Browser clients use the authenticated Warehouse Edge Function. Header/line writes
-- remain atomic and service-role-only, with immutable events and deterministic watches.

begin;

create table if not exists public."WMS_PurchaseOrders" (
  "WMSPO_ID" uuid primary key default gen_random_uuid(),
  "WMSPO_FacilityID" uuid not null references public."WMS_Facilities"("WMSFacility_ID"),
  "WMSPO_CustomerOrgID" uuid not null references public."Org_Master"("Org_id"),
  "WMSPO_SupplierOrgID" uuid references public."Org_Master"("Org_id"),
  "WMSPO_WarehouseOrderID" uuid references public."WMS_Orders"("WMSOrder_ID"),
  "WMSPO_Number" varchar(120) not null,
  "WMSPO_StatusCode" varchar(30) not null default 'draft',
  "WMSPO_SupplierName" varchar(240) not null,
  "WMSPO_BuyerReference" varchar(160),
  "WMSPO_SupplierReference" varchar(160),
  "WMSPO_IssueDate" date,
  "WMSPO_ExpectedDeliveryDate" date,
  "WMSPO_CurrencyCode" varchar(3) not null default 'GBP',
  "WMSPO_DeliveryTerms" varchar(180),
  "WMSPO_PaymentTerms" varchar(180),
  "WMSPO_DeliveryAddress" text,
  "WMSPO_Notes" text,
  "WMSPO_NetAmount" numeric(18,4) not null default 0,
  "WMSPO_TaxAmount" numeric(18,4) not null default 0,
  "WMSPO_TotalAmount" numeric(18,4) not null default 0,
  "WMSPO_SourceFileName" varchar(240),
  "WMSPO_ExtractionModeCode" varchar(40),
  "WMSPO_ExtractionModel" varchar(120),
  "WMSPO_ExtractionMetadataJSON" jsonb not null default '{}'::jsonb,
  "WMSPO_Version" integer not null default 1,
  "WMSPO_CreatedAt" timestamptz not null default now(),
  "WMSPO_CreatedBy" uuid references public."cmp_Users"("User_ID"),
  "WMSPO_UpdatedAt" timestamptz not null default now(),
  "WMSPO_UpdatedBy" uuid references public."cmp_Users"("User_ID"),
  "WMSPO_IsDeleted" boolean not null default false,
  constraint "CK_WMS_PurchaseOrders_status" check ("WMSPO_StatusCode" in ('draft','issued','part_received','received','cancelled')),
  constraint "CK_WMS_PurchaseOrders_currency" check ("WMSPO_CurrencyCode" ~ '^[A-Z]{3}$'),
  constraint "CK_WMS_PurchaseOrders_amounts" check ("WMSPO_NetAmount" >= 0 and "WMSPO_TaxAmount" >= 0 and "WMSPO_TotalAmount" >= 0),
  constraint "CK_WMS_PurchaseOrders_extraction" check (jsonb_typeof("WMSPO_ExtractionMetadataJSON") = 'object')
);

create unique index if not exists "UX_WMS_PurchaseOrders_facility_number"
  on public."WMS_PurchaseOrders"("WMSPO_FacilityID", lower("WMSPO_Number")) where not "WMSPO_IsDeleted";
create index if not exists "IX_WMS_PurchaseOrders_facility_status"
  on public."WMS_PurchaseOrders"("WMSPO_FacilityID", "WMSPO_StatusCode", "WMSPO_UpdatedAt" desc);

create table if not exists public."WMS_PurchaseOrderLines" (
  "WMSPOLine_ID" uuid primary key default gen_random_uuid(),
  "WMSPOLine_PurchaseOrderID" uuid not null references public."WMS_PurchaseOrders"("WMSPO_ID") on delete cascade,
  "WMSPOLine_LineNo" integer not null,
  "WMSPOLine_ItemID" uuid references public."WMS_Items"("WMSItem_ID"),
  "WMSPOLine_SKU" varchar(120),
  "WMSPOLine_SupplierItemCode" varchar(120),
  "WMSPOLine_Description" varchar(800) not null,
  "WMSPOLine_OrderedQuantity" numeric(18,6) not null,
  "WMSPOLine_ReceivedQuantity" numeric(18,6) not null default 0,
  "WMSPOLine_UOMCode" varchar(20) not null default 'EA',
  "WMSPOLine_UnitPrice" numeric(18,6) not null default 0,
  "WMSPOLine_TaxRate" numeric(9,4) not null default 0,
  "WMSPOLine_NetAmount" numeric(18,4) not null default 0,
  "WMSPOLine_TaxAmount" numeric(18,4) not null default 0,
  "WMSPOLine_TotalAmount" numeric(18,4) not null default 0,
  "WMSPOLine_RequestedDeliveryDate" date,
  "WMSPOLine_MetadataJSON" jsonb not null default '{}'::jsonb,
  "WMSPOLine_CreatedAt" timestamptz not null default now(),
  constraint "UX_WMS_PurchaseOrderLines_order_line" unique ("WMSPOLine_PurchaseOrderID", "WMSPOLine_LineNo"),
  constraint "CK_WMS_PurchaseOrderLines_quantity" check ("WMSPOLine_OrderedQuantity" > 0 and "WMSPOLine_ReceivedQuantity" >= 0),
  constraint "CK_WMS_PurchaseOrderLines_money" check ("WMSPOLine_UnitPrice" >= 0 and "WMSPOLine_TaxRate" >= 0 and "WMSPOLine_NetAmount" >= 0 and "WMSPOLine_TaxAmount" >= 0 and "WMSPOLine_TotalAmount" >= 0),
  constraint "CK_WMS_PurchaseOrderLines_metadata" check (jsonb_typeof("WMSPOLine_MetadataJSON") = 'object')
);
create index if not exists "IX_WMS_PurchaseOrderLines_item" on public."WMS_PurchaseOrderLines"("WMSPOLine_ItemID");

create table if not exists public."WMS_PurchaseOrderEvents" (
  "WMSPOEvent_ID" uuid primary key default gen_random_uuid(),
  "WMSPOEvent_PurchaseOrderID" uuid not null references public."WMS_PurchaseOrders"("WMSPO_ID") on delete cascade,
  "WMSPOEvent_EventTypeCode" varchar(60) not null,
  "WMSPOEvent_EventAt" timestamptz not null default now(),
  "WMSPOEvent_FromStatusCode" varchar(30),
  "WMSPOEvent_ToStatusCode" varchar(30),
  "WMSPOEvent_Notes" text,
  "WMSPOEvent_MetadataJSON" jsonb not null default '{}'::jsonb,
  "WMSPOEvent_CreatedBy" uuid references public."cmp_Users"("User_ID"),
  constraint "CK_WMS_PurchaseOrderEvents_metadata" check (jsonb_typeof("WMSPOEvent_MetadataJSON") = 'object')
);
create index if not exists "IX_WMS_PurchaseOrderEvents_order_time" on public."WMS_PurchaseOrderEvents"("WMSPOEvent_PurchaseOrderID", "WMSPOEvent_EventAt" desc);

alter table public."WMS_PurchaseOrders" enable row level security;
alter table public."WMS_PurchaseOrderLines" enable row level security;
alter table public."WMS_PurchaseOrderEvents" enable row level security;
revoke all on public."WMS_PurchaseOrders", public."WMS_PurchaseOrderLines", public."WMS_PurchaseOrderEvents" from public, anon, authenticated;
grant select, insert, update, delete on public."WMS_PurchaseOrders", public."WMS_PurchaseOrderLines", public."WMS_PurchaseOrderEvents" to service_role;

create or replace function public.warehouse_edge_purchase_order_mutation(
  p_action text,
  p_purchase_order_id uuid,
  p_payload jsonb,
  p_actor_user_id uuid,
  p_allowed_facility_ids uuid[]
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_po public."WMS_PurchaseOrders"%rowtype;
  v_id uuid := coalesce(p_purchase_order_id, gen_random_uuid());
  v_facility_id uuid;
  v_customer_org_id uuid;
  v_supplier_org_id uuid;
  v_lines jsonb;
  v_line jsonb;
  v_item_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_net numeric;
  v_tax numeric;
  v_total numeric;
  v_net_total numeric := 0;
  v_tax_total numeric := 0;
  v_grand_total numeric := 0;
  v_line_no integer := 0;
  v_office_id uuid;
  v_order_id uuid;
  v_order_number text;
begin
  if p_action not in ('create','update','issue','cancel','create_inbound') then raise exception 'WMS400: Unsupported purchase order action.'; end if;
  if p_action in ('update','issue','cancel','create_inbound') then
    select * into v_po from public."WMS_PurchaseOrders" where "WMSPO_ID"=p_purchase_order_id and not "WMSPO_IsDeleted" for update;
    if not found or not coalesce(v_po."WMSPO_FacilityID"=any(p_allowed_facility_ids),false) then raise exception 'WMS404: Purchase order not found.'; end if;
  end if;

  if p_action in ('create','update') then
    if p_action='update' and (v_po."WMSPO_StatusCode" not in ('draft','issued') or v_po."WMSPO_WarehouseOrderID" is not null) then raise exception 'WMS409: This purchase order can no longer be edited.'; end if;
    v_facility_id := nullif(p_payload->>'facilityId','')::uuid;
    v_customer_org_id := nullif(p_payload->>'customerOrgId','')::uuid;
    v_supplier_org_id := nullif(p_payload->>'supplierOrgId','')::uuid;
    if v_facility_id is null or not coalesce(v_facility_id=any(p_allowed_facility_ids),false) then raise exception 'WMS403: Choose a warehouse in your company.'; end if;
    if v_customer_org_id is null or not exists(select 1 from public."Org_Master" where "Org_id"=v_customer_org_id) then raise exception 'WMS400: Choose the stock owner.'; end if;
    if coalesce(nullif(btrim(p_payload->>'number'),''),'')='' then raise exception 'WMS400: Enter a purchase order number.'; end if;
    if upper(coalesce(nullif(btrim(p_payload->>'currencyCode'),''),'GBP')) !~ '^[A-Z]{3}$' then raise exception 'WMS400: Enter a three-letter currency code.'; end if;
    v_lines := p_payload->'lines';
    if v_lines is null or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines)=0 then raise exception 'WMS400: Add at least one purchase order line.'; end if;

    if p_action='create' then
      insert into public."WMS_PurchaseOrders" (
        "WMSPO_ID","WMSPO_FacilityID","WMSPO_CustomerOrgID","WMSPO_SupplierOrgID","WMSPO_Number","WMSPO_StatusCode","WMSPO_SupplierName",
        "WMSPO_BuyerReference","WMSPO_SupplierReference","WMSPO_IssueDate","WMSPO_ExpectedDeliveryDate","WMSPO_CurrencyCode","WMSPO_DeliveryTerms",
        "WMSPO_PaymentTerms","WMSPO_DeliveryAddress","WMSPO_Notes","WMSPO_SourceFileName","WMSPO_ExtractionModeCode","WMSPO_ExtractionModel",
        "WMSPO_ExtractionMetadataJSON","WMSPO_CreatedBy","WMSPO_UpdatedBy"
      ) values (
        v_id,v_facility_id,v_customer_org_id,v_supplier_org_id,left(btrim(p_payload->>'number'),120),'draft',left(coalesce(btrim(p_payload->>'supplierName'),''),240),
        nullif(left(btrim(p_payload->>'buyerReference'),160),''),nullif(left(btrim(p_payload->>'supplierReference'),160),''),nullif(p_payload->>'issueDate','')::date,
        nullif(p_payload->>'expectedDeliveryDate','')::date,upper(coalesce(nullif(btrim(p_payload->>'currencyCode'),''),'GBP')),nullif(left(btrim(p_payload->>'deliveryTerms'),180),''),
        nullif(left(btrim(p_payload->>'paymentTerms'),180),''),nullif(btrim(p_payload->>'deliveryAddress'),''),nullif(btrim(p_payload->>'notes'),''),
        nullif(left(btrim(p_payload->>'sourceFileName'),240),''),nullif(left(btrim(p_payload->>'extractionMode'),40),''),nullif(left(btrim(p_payload->>'extractionModel'),120),''),
        coalesce(p_payload->'extractionMetadata','{}'::jsonb),p_actor_user_id,p_actor_user_id
      );
    else
      v_id := p_purchase_order_id;
      update public."WMS_PurchaseOrders" set
        "WMSPO_FacilityID"=v_facility_id,"WMSPO_CustomerOrgID"=v_customer_org_id,"WMSPO_SupplierOrgID"=v_supplier_org_id,
        "WMSPO_Number"=left(btrim(p_payload->>'number'),120),"WMSPO_SupplierName"=left(coalesce(btrim(p_payload->>'supplierName'),''),240),
        "WMSPO_BuyerReference"=nullif(left(btrim(p_payload->>'buyerReference'),160),''),"WMSPO_SupplierReference"=nullif(left(btrim(p_payload->>'supplierReference'),160),''),
        "WMSPO_IssueDate"=nullif(p_payload->>'issueDate','')::date,"WMSPO_ExpectedDeliveryDate"=nullif(p_payload->>'expectedDeliveryDate','')::date,
        "WMSPO_CurrencyCode"=upper(coalesce(nullif(btrim(p_payload->>'currencyCode'),''),'GBP')),"WMSPO_DeliveryTerms"=nullif(left(btrim(p_payload->>'deliveryTerms'),180),''),
        "WMSPO_PaymentTerms"=nullif(left(btrim(p_payload->>'paymentTerms'),180),''),"WMSPO_DeliveryAddress"=nullif(btrim(p_payload->>'deliveryAddress'),''),
        "WMSPO_Notes"=nullif(btrim(p_payload->>'notes'),''),"WMSPO_SourceFileName"=coalesce(nullif(left(btrim(p_payload->>'sourceFileName'),240),''),"WMSPO_SourceFileName"),
        "WMSPO_ExtractionModeCode"=coalesce(nullif(left(btrim(p_payload->>'extractionMode'),40),''),"WMSPO_ExtractionModeCode"),
        "WMSPO_ExtractionModel"=coalesce(nullif(left(btrim(p_payload->>'extractionModel'),120),''),"WMSPO_ExtractionModel"),
        "WMSPO_ExtractionMetadataJSON"=coalesce(p_payload->'extractionMetadata',"WMSPO_ExtractionMetadataJSON"),
        "WMSPO_Version"="WMSPO_Version"+1,"WMSPO_UpdatedAt"=now(),"WMSPO_UpdatedBy"=p_actor_user_id
      where "WMSPO_ID"=v_id;
      delete from public."WMS_PurchaseOrderLines" where "WMSPOLine_PurchaseOrderID"=v_id;
    end if;

    for v_line in select value from jsonb_array_elements(v_lines) loop
      v_line_no := v_line_no+1;
      v_item_id := nullif(v_line->>'itemId','')::uuid;
      if v_item_id is not null and not exists(select 1 from public."WMS_Items" where "WMSItem_ID"=v_item_id and "WMSItem_DefaultFacilityID"=v_facility_id and "WMSItem_CustomerOrgID"=v_customer_org_id and not "WMSItem_IsDeleted") then raise exception 'WMS400: A purchase order line uses an item outside this warehouse or stock owner.'; end if;
      v_quantity := coalesce(nullif(v_line->>'quantity','')::numeric,0);
      v_unit_price := greatest(coalesce(nullif(v_line->>'unitPrice','')::numeric,0),0);
      v_tax_rate := greatest(coalesce(nullif(v_line->>'taxRate','')::numeric,0),0);
      if v_quantity<=0 or coalesce(nullif(btrim(v_line->>'description'),''),'')='' or coalesce(nullif(btrim(v_line->>'uomCode'),''),'')='' then raise exception 'WMS400: Every line needs a description, quantity above zero and unit of measure.'; end if;
      v_net := round(v_quantity*v_unit_price,4); v_tax := round(v_net*v_tax_rate/100,4); v_total := v_net+v_tax;
      v_net_total := v_net_total+v_net; v_tax_total := v_tax_total+v_tax; v_grand_total := v_grand_total+v_total;
      insert into public."WMS_PurchaseOrderLines" (
        "WMSPOLine_PurchaseOrderID","WMSPOLine_LineNo","WMSPOLine_ItemID","WMSPOLine_SKU","WMSPOLine_SupplierItemCode","WMSPOLine_Description",
        "WMSPOLine_OrderedQuantity","WMSPOLine_UOMCode","WMSPOLine_UnitPrice","WMSPOLine_TaxRate","WMSPOLine_NetAmount","WMSPOLine_TaxAmount",
        "WMSPOLine_TotalAmount","WMSPOLine_RequestedDeliveryDate","WMSPOLine_MetadataJSON"
      ) values (
        v_id,v_line_no,v_item_id,nullif(left(btrim(v_line->>'sku'),120),''),nullif(left(btrim(v_line->>'supplierItemCode'),120),''),left(btrim(v_line->>'description'),800),
        v_quantity,upper(coalesce(nullif(btrim(v_line->>'uomCode'),''),'EA')),v_unit_price,v_tax_rate,v_net,v_tax,v_total,
        nullif(v_line->>'requestedDeliveryDate','')::date,coalesce(v_line->'metadata','{}'::jsonb)
      );
    end loop;
    update public."WMS_PurchaseOrders" set "WMSPO_NetAmount"=v_net_total,"WMSPO_TaxAmount"=v_tax_total,"WMSPO_TotalAmount"=v_grand_total where "WMSPO_ID"=v_id;
    insert into public."WMS_PurchaseOrderEvents" ("WMSPOEvent_PurchaseOrderID","WMSPOEvent_EventTypeCode","WMSPOEvent_ToStatusCode","WMSPOEvent_MetadataJSON","WMSPOEvent_CreatedBy")
      values(v_id,case when p_action='create' then 'created' else 'updated' end,coalesce(v_po."WMSPO_StatusCode",'draft'),jsonb_build_object('lineCount',v_line_no,'sourceFileName',p_payload->>'sourceFileName'),p_actor_user_id);
    return v_id;
  end if;

  if p_action='issue' then
    if v_po."WMSPO_StatusCode"<>'draft' then raise exception 'WMS409: Only a draft purchase order can be issued.'; end if;
    if exists(select 1 from public."WMS_PurchaseOrderLines" where "WMSPOLine_PurchaseOrderID"=v_po."WMSPO_ID" and "WMSPOLine_ItemID" is null) then raise exception 'WMS409: Match every line to a warehouse item before issuing.'; end if;
    update public."WMS_PurchaseOrders" set "WMSPO_StatusCode"='issued',"WMSPO_Version"="WMSPO_Version"+1,"WMSPO_UpdatedAt"=now(),"WMSPO_UpdatedBy"=p_actor_user_id where "WMSPO_ID"=v_po."WMSPO_ID";
    insert into public."WMS_PurchaseOrderEvents" ("WMSPOEvent_PurchaseOrderID","WMSPOEvent_EventTypeCode","WMSPOEvent_FromStatusCode","WMSPOEvent_ToStatusCode","WMSPOEvent_Notes","WMSPOEvent_CreatedBy") values(v_po."WMSPO_ID",'issued',v_po."WMSPO_StatusCode",'issued',nullif(btrim(p_payload->>'notes'),''),p_actor_user_id);
    return v_po."WMSPO_ID";
  end if;

  if p_action='cancel' then
    if v_po."WMSPO_StatusCode" in ('received','cancelled') or v_po."WMSPO_WarehouseOrderID" is not null then raise exception 'WMS409: This purchase order cannot be cancelled.'; end if;
    update public."WMS_PurchaseOrders" set "WMSPO_StatusCode"='cancelled',"WMSPO_Version"="WMSPO_Version"+1,"WMSPO_UpdatedAt"=now(),"WMSPO_UpdatedBy"=p_actor_user_id where "WMSPO_ID"=v_po."WMSPO_ID";
    insert into public."WMS_PurchaseOrderEvents" ("WMSPOEvent_PurchaseOrderID","WMSPOEvent_EventTypeCode","WMSPOEvent_FromStatusCode","WMSPOEvent_ToStatusCode","WMSPOEvent_Notes","WMSPOEvent_CreatedBy") values(v_po."WMSPO_ID",'cancelled',v_po."WMSPO_StatusCode",'cancelled',nullif(btrim(p_payload->>'notes'),''),p_actor_user_id);
    return v_po."WMSPO_ID";
  end if;

  if v_po."WMSPO_StatusCode"<>'issued' or v_po."WMSPO_WarehouseOrderID" is not null then raise exception 'WMS409: This purchase order is not ready for a new goods-in order.'; end if;
  if exists(select 1 from public."WMS_PurchaseOrderLines" where "WMSPOLine_PurchaseOrderID"=v_po."WMSPO_ID" and "WMSPOLine_ItemID" is null) then raise exception 'WMS409: Match every line to a warehouse item before creating goods-in work.'; end if;
  select "WMSFacility_OrgOfficeID" into v_office_id from public."WMS_Facilities" where "WMSFacility_ID"=v_po."WMSPO_FacilityID";
  v_order_id := gen_random_uuid(); v_order_number := left('PO-'||v_po."WMSPO_Number",80);
  if exists(select 1 from public."WMS_Orders" where "WMSOrder_FacilityID"=v_po."WMSPO_FacilityID" and lower("WMSOrder_OrderNumber")=lower(v_order_number) and not "WMSOrder_IsDeleted") then v_order_number:=left(v_order_number||'-'||substr(v_order_id::text,1,6),80); end if;
  insert into public."WMS_Orders" ("WMSOrder_ID","WMSOrder_FacilityID","WMSOrder_OrgOfficeID","WMSOrder_CustomerOrgID","WMSOrder_OrderNumber","WMSOrder_TypeCode","WMSOrder_StatusCode","WMSOrder_CustomerReference","WMSOrder_SupplierReference","WMSOrder_InboundFromOrgID","WMSOrder_RequestedDate","WMSOrder_Instructions","WMSOrder_MetadataJSON","WMSOrder_CreatedBy","WMSOrder_UpdatedBy")
    values(v_order_id,v_po."WMSPO_FacilityID",v_office_id,v_po."WMSPO_CustomerOrgID",v_order_number,'inbound','draft',v_po."WMSPO_BuyerReference",v_po."WMSPO_SupplierReference",v_po."WMSPO_SupplierOrgID",v_po."WMSPO_ExpectedDeliveryDate",v_po."WMSPO_Notes",jsonb_build_object('purchaseOrderId',v_po."WMSPO_ID",'purchaseOrderNumber',v_po."WMSPO_Number"),p_actor_user_id,p_actor_user_id);
  insert into public."WMS_OrderLines" ("WMSOrderLine_OrderID","WMSOrderLine_LineNo","WMSOrderLine_ItemID","WMSOrderLine_OrderedQuantity","WMSOrderLine_UOMCode","WMSOrderLine_GoodsValue","WMSOrderLine_CurrencyCode","WMSOrderLine_Instructions","WMSOrderLine_MetadataJSON")
    select v_order_id,"WMSPOLine_LineNo","WMSPOLine_ItemID","WMSPOLine_OrderedQuantity","WMSPOLine_UOMCode","WMSPOLine_NetAmount",v_po."WMSPO_CurrencyCode","WMSPOLine_Description",jsonb_build_object('purchaseOrderLineId',"WMSPOLine_ID") from public."WMS_PurchaseOrderLines" where "WMSPOLine_PurchaseOrderID"=v_po."WMSPO_ID" order by "WMSPOLine_LineNo";
  update public."WMS_PurchaseOrders" set "WMSPO_WarehouseOrderID"=v_order_id,"WMSPO_Version"="WMSPO_Version"+1,"WMSPO_UpdatedAt"=now(),"WMSPO_UpdatedBy"=p_actor_user_id where "WMSPO_ID"=v_po."WMSPO_ID";
  insert into public."WMS_PurchaseOrderEvents" ("WMSPOEvent_PurchaseOrderID","WMSPOEvent_EventTypeCode","WMSPOEvent_ToStatusCode","WMSPOEvent_MetadataJSON","WMSPOEvent_CreatedBy") values(v_po."WMSPO_ID",'goods_in_created','issued',jsonb_build_object('warehouseOrderId',v_order_id,'warehouseOrderNumber',v_order_number),p_actor_user_id);
  return v_po."WMSPO_ID";
exception when others then
  if sqlerrm like 'WMS%' then raise; end if;
  if sqlstate='23505' then raise exception 'WMS409: A purchase order with this number already exists in the warehouse.'; end if;
  raise exception 'WMS500: %',sqlerrm;
end; $$;

revoke all on function public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[]) to service_role;

create or replace function public._warehouse_sync_purchase_order_receipt()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_line_id uuid; v_po_id uuid; v_previous text; v_next text;
begin
  if new."WMSOrderLine_MetadataJSON"->>'purchaseOrderLineId' is null then return new; end if;
  v_line_id := (new."WMSOrderLine_MetadataJSON"->>'purchaseOrderLineId')::uuid;
  update public."WMS_PurchaseOrderLines" set "WMSPOLine_ReceivedQuantity"=least("WMSPOLine_OrderedQuantity",new."WMSOrderLine_ReceivedQuantity") where "WMSPOLine_ID"=v_line_id returning "WMSPOLine_PurchaseOrderID" into v_po_id;
  if v_po_id is null then return new; end if;
  select "WMSPO_StatusCode" into v_previous from public."WMS_PurchaseOrders" where "WMSPO_ID"=v_po_id for update;
  select case when bool_and("WMSPOLine_ReceivedQuantity">="WMSPOLine_OrderedQuantity") then 'received' when sum("WMSPOLine_ReceivedQuantity")>0 then 'part_received' else v_previous end into v_next from public."WMS_PurchaseOrderLines" where "WMSPOLine_PurchaseOrderID"=v_po_id;
  if v_next is distinct from v_previous then
    update public."WMS_PurchaseOrders" set "WMSPO_StatusCode"=v_next,"WMSPO_Version"="WMSPO_Version"+1,"WMSPO_UpdatedAt"=now() where "WMSPO_ID"=v_po_id;
    insert into public."WMS_PurchaseOrderEvents" ("WMSPOEvent_PurchaseOrderID","WMSPOEvent_EventTypeCode","WMSPOEvent_FromStatusCode","WMSPOEvent_ToStatusCode","WMSPOEvent_MetadataJSON") values(v_po_id,'receipt_progress',v_previous,v_next,jsonb_build_object('warehouseOrderLineId',new."WMSOrderLine_ID",'receivedQuantity',new."WMSOrderLine_ReceivedQuantity"));
  end if;
  return new;
end; $$;
drop trigger if exists "TR_WMS_OrderLines_purchase_order_receipt" on public."WMS_OrderLines";
create trigger "TR_WMS_OrderLines_purchase_order_receipt" after update of "WMSOrderLine_ReceivedQuantity" on public."WMS_OrderLines" for each row when (old."WMSOrderLine_ReceivedQuantity" is distinct from new."WMSOrderLine_ReceivedQuantity") execute function public._warehouse_sync_purchase_order_receipt();
revoke all on function public._warehouse_sync_purchase_order_receipt() from public,anon,authenticated;

create or replace function public._multideck_dexter_watch_purchase_order_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_company_id uuid; v_old jsonb:='{}'::jsonb; v_new jsonb:='{}'::jsonb;
begin
  select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSPO_FacilityID";
  if tg_op='UPDATE' then v_old:=jsonb_build_object('status',old."WMSPO_StatusCode",'totalAmount',old."WMSPO_TotalAmount",'expectedDeliveryDate',old."WMSPO_ExpectedDeliveryDate"); end if;
  v_new:=jsonb_build_object('purchaseOrderNumber',new."WMSPO_Number",'supplierName',new."WMSPO_SupplierName",'status',new."WMSPO_StatusCode",'totalAmount',new."WMSPO_TotalAmount",'currency',new."WMSPO_CurrencyCode",'expectedDeliveryDate',new."WMSPO_ExpectedDeliveryDate",'warehouseOrderId',new."WMSPO_WarehouseOrderID");
  if v_company_id is not null and exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company_id and watch."AIDexterWatch_CapabilityCode"='purchase_orders' and watch."AIDexterWatch_StatusCode"='active' and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."WMSPO_ID")) then
    insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company_id,'purchase_orders','WMS_PurchaseOrders',new."WMSPO_ID",v_old,v_new);
  end if;
  return new;
end; $$;
drop trigger if exists "TR_WMS_PurchaseOrders_dexter_watch" on public."WMS_PurchaseOrders";
create trigger "TR_WMS_PurchaseOrders_dexter_watch" after insert or update on public."WMS_PurchaseOrders" for each row execute function public._multideck_dexter_watch_purchase_order_change();
revoke all on function public._multideck_dexter_watch_purchase_order_change() from public,anon,authenticated;

insert into public."sys_AIDexterWatchCapabilities" ("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_IsActive","AIDexterWatchCapability_SortOrder") values
('purchase_orders','Purchase orders','Purchase order status, supplier, value, expected delivery and linked goods-in changes.','["status","purchaseOrderNumber","supplierName","totalAmount","currency","expectedDeliveryDate","warehouseOrderId"]'::jsonb,true,45)
on conflict ("AIDexterWatchCapability_Code") do update set "AIDexterWatchCapability_Name"=excluded."AIDexterWatchCapability_Name","AIDexterWatchCapability_Description"=excluded."AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON"=excluded."AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_SortOrder"=excluded."AIDexterWatchCapability_SortOrder";

create or replace function public.multideck_dexter_domain_purchase_orders(p_user_id uuid,p_search text default null,p_take integer default 10)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
with actor as (select "Company_ID" company_id from public."cmp_Users" where "User_ID"=p_user_id), facilities as (
  select facility."WMSFacility_ID" from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" join actor on actor.company_id=office."Company_ID" where not facility."WMSFacility_IsDeleted"
), rows as (
  select po.*,facility."WMSFacility_Code",customer."Org_Name" customer_name,
    (select jsonb_agg(jsonb_build_object('recordId',line."WMSPOLine_ID",'lineNumber',line."WMSPOLine_LineNo",'itemId',line."WMSPOLine_ItemID",'sku',line."WMSPOLine_SKU",'description',line."WMSPOLine_Description",'quantity',line."WMSPOLine_OrderedQuantity",'receivedQuantity',line."WMSPOLine_ReceivedQuantity",'uom',line."WMSPOLine_UOMCode",'unitPrice',line."WMSPOLine_UnitPrice",'totalAmount',line."WMSPOLine_TotalAmount") order by line."WMSPOLine_LineNo") from public."WMS_PurchaseOrderLines" line where line."WMSPOLine_PurchaseOrderID"=po."WMSPO_ID") lines
  from public."WMS_PurchaseOrders" po join facilities f on f."WMSFacility_ID"=po."WMSPO_FacilityID" join public."WMS_Facilities" facility on facility."WMSFacility_ID"=po."WMSPO_FacilityID" join public."Org_Master" customer on customer."Org_id"=po."WMSPO_CustomerOrgID"
  where not po."WMSPO_IsDeleted" and (coalesce(btrim(p_search),'')='' or concat_ws(' ',po."WMSPO_Number",po."WMSPO_SupplierName",po."WMSPO_BuyerReference",po."WMSPO_SupplierReference") ilike '%'||btrim(p_search)||'%') order by po."WMSPO_UpdatedAt" desc limit greatest(1,least(coalesce(p_take,10),25))
)
select coalesce(jsonb_agg(jsonb_build_object('recordId',"WMSPO_ID",'facilityId',"WMSPO_FacilityID",'facilityCode',"WMSFacility_Code",'customerOrgId',"WMSPO_CustomerOrgID",'customerName',customer_name,'purchaseOrderNumber',"WMSPO_Number",'supplierName',"WMSPO_SupplierName",'status',"WMSPO_StatusCode",'issueDate',"WMSPO_IssueDate",'expectedDeliveryDate',"WMSPO_ExpectedDeliveryDate",'currency',"WMSPO_CurrencyCode",'netAmount',"WMSPO_NetAmount",'taxAmount',"WMSPO_TaxAmount",'totalAmount',"WMSPO_TotalAmount",'warehouseOrderId',"WMSPO_WarehouseOrderID",'lines',coalesce(lines,'[]'::jsonb),'source',jsonb_build_object('table','WMS_PurchaseOrders','id',"WMSPO_ID",'observedAt',"WMSPO_UpdatedAt"))),'[]'::jsonb) from rows;
$$;
revoke all on function public.multideck_dexter_domain_purchase_orders(uuid,text,integer) from public,anon,authenticated;

insert into public."sys_AIDexterDataDomains" ("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt") values
('purchase_orders','Purchase orders','Warehouse purchase order headers, supplier details, dates, totals, matched item lines and linked goods-in orders.','multideck_dexter_domain_purchase_orders',45,true,now())
on conflict ("AIDexterDomain_Code") do update set "AIDexterDomain_Name"=excluded."AIDexterDomain_Name","AIDexterDomain_Description"=excluded."AIDexterDomain_Description","AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now();

create or replace function public.multideck_dexter_action_create_purchase_order(uuid,uuid,jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$ begin raise exception 'This action must be completed through the Warehouse Edge Function.' using errcode='42501'; end; $$;
revoke all on function public.multideck_dexter_action_create_purchase_order(uuid,uuid,jsonb) from public,anon,authenticated;

insert into public."sys_AIDexterActions" ("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt") values
('create_purchase_order','purchase_orders','Create purchase order','Create a reviewed draft purchase order through the Warehouse Edge Function. Approval is always required.','multideck_dexter_action_create_purchase_order','{"type":"object","properties":{"facility_id":{"type":"string"},"customer_org_id":{"type":"string"},"number":{"type":"string"},"supplier_name":{"type":"string"},"supplier_org_id":{"type":["string","null"]},"currency_code":{"type":"string"},"issue_date":{"type":["string","null"]},"expected_delivery_date":{"type":["string","null"]},"notes":{"type":["string","null"]},"lines":{"type":"array","items":{"type":"object","properties":{"item_id":{"type":["string","null"]},"sku":{"type":["string","null"]},"description":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"uom_code":{"type":"string"},"unit_price":{"type":"number","minimum":0},"tax_rate":{"type":"number","minimum":0}},"required":["item_id","sku","description","quantity","uom_code","unit_price","tax_rate"],"additionalProperties":false}}},"required":["facility_id","customer_org_id","number","currency_code","issue_date","expected_delivery_date","notes","lines"],"additionalProperties":false}'::jsonb,16,true,now())
on conflict ("AIDexterAction_Code") do update set "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode","AIDexterAction_Name"=excluded."AIDexterAction_Name","AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function","AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now();

commit;
