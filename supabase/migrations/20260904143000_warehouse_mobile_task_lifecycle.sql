-- A deliberately small warehouse execution layer:
--   * one customer item master may be enabled in several facilities;
--   * every warehouse order carries a typed operational source;
--   * receipts into receiving/staging create putaway work;
--   * outbound release allocates stock and creates pick work;
--   * dispatch consumes only stock that was actually picked.
-- Physical task confirmation remains an operator action through the Warehouse
-- Edge Function.  No client receives direct table or function access.

begin;

create table if not exists public."WMS_ItemFacilityAssignments" (
  "WMSItemFacility_ID" uuid primary key default gen_random_uuid(),
  "WMSItemFacility_ItemID" uuid not null references public."WMS_Items"("WMSItem_ID") on delete cascade,
  "WMSItemFacility_FacilityID" uuid not null references public."WMS_Facilities"("WMSFacility_ID"),
  "WMSItemFacility_IsDefault" boolean not null default false,
  "WMSItemFacility_IsActive" boolean not null default true,
  "WMSItemFacility_DefaultPutawayLocationID" uuid references public."WMS_Locations"("WMSLocation_ID"),
  "WMSItemFacility_DefaultPickLocationID" uuid references public."WMS_Locations"("WMSLocation_ID"),
  "WMSItemFacility_CreatedAt" timestamptz not null default now(),
  "WMSItemFacility_CreatedBy" uuid references public."cmp_Users"("User_ID"),
  "WMSItemFacility_UpdatedAt" timestamptz not null default now(),
  unique ("WMSItemFacility_ItemID", "WMSItemFacility_FacilityID")
);

create unique index if not exists "UX_WMS_ItemFacilityAssignments_default"
  on public."WMS_ItemFacilityAssignments" ("WMSItemFacility_ItemID")
  where "WMSItemFacility_IsDefault" and "WMSItemFacility_IsActive";
create index if not exists "IX_WMS_ItemFacilityAssignments_facility_item"
  on public."WMS_ItemFacilityAssignments" ("WMSItemFacility_FacilityID", "WMSItemFacility_ItemID")
  where "WMSItemFacility_IsActive";

insert into public."WMS_ItemFacilityAssignments" (
  "WMSItemFacility_ItemID", "WMSItemFacility_FacilityID", "WMSItemFacility_IsDefault",
  "WMSItemFacility_IsActive", "WMSItemFacility_CreatedBy"
)
select item."WMSItem_ID", item."WMSItem_DefaultFacilityID", true, true, item."WMSItem_CreatedBy"
from public."WMS_Items" item
where item."WMSItem_DefaultFacilityID" is not null
on conflict ("WMSItemFacility_ItemID", "WMSItemFacility_FacilityID") do update
set "WMSItemFacility_IsActive" = true,
    "WMSItemFacility_IsDefault" = true,
    "WMSItemFacility_UpdatedAt" = now();

alter table public."WMS_ItemFacilityAssignments" enable row level security;
revoke all on table public."WMS_ItemFacilityAssignments" from public, anon, authenticated;
grant select, insert, update, delete on table public."WMS_ItemFacilityAssignments" to service_role;

create or replace function public._warehouse_item_default_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new."WMSItem_DefaultFacilityID" is not null then
    insert into public."WMS_ItemFacilityAssignments" (
      "WMSItemFacility_ItemID", "WMSItemFacility_FacilityID", "WMSItemFacility_IsDefault",
      "WMSItemFacility_IsActive", "WMSItemFacility_CreatedBy"
    ) values (
      new."WMSItem_ID", new."WMSItem_DefaultFacilityID", true, true, new."WMSItem_CreatedBy"
    )
    on conflict ("WMSItemFacility_ItemID", "WMSItemFacility_FacilityID") do update
    set "WMSItemFacility_IsActive" = true,
        "WMSItemFacility_IsDefault" = true,
        "WMSItemFacility_UpdatedAt" = now();
  end if;
  return new;
end;
$$;
revoke all on function public._warehouse_item_default_assignment() from public, anon, authenticated;

drop trigger if exists "TR_WMS_Items_default_assignment" on public."WMS_Items";
create trigger "TR_WMS_Items_default_assignment"
after insert on public."WMS_Items"
for each row execute function public._warehouse_item_default_assignment();

create or replace function public.warehouse_edge_set_item_facilities(
  p_item_id uuid,
  p_default_facility_id uuid,
  p_facility_ids uuid[],
  p_actor_user_id uuid,
  p_allowed_facility_ids uuid[],
  p_allowed_organisation_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_item public."WMS_Items"%rowtype;
  v_facility_id uuid;
  v_requested uuid[] := array(select distinct unnest(coalesce(p_facility_ids, '{}'::uuid[])));
begin
  if p_actor_user_id is null then raise exception 'WMS403: Item facility changes are reserved for the warehouse team.'; end if;
  select * into v_item from public."WMS_Items"
  where "WMSItem_ID" = p_item_id and not "WMSItem_IsDeleted"
    and "WMSItem_CustomerOrgID" = any(coalesce(p_allowed_organisation_ids, '{}'::uuid[]))
  for update;
  if not found then raise exception 'WMS404: This item does not exist in your workspace.'; end if;
  if cardinality(v_requested) = 0 or not (p_default_facility_id = any(v_requested)) then
    raise exception 'WMS400: Choose at least one warehouse and include the default warehouse.';
  end if;
  if exists(select 1 from unnest(v_requested) requested where not requested = any(coalesce(p_allowed_facility_ids, '{}'::uuid[]))) then
    raise exception 'WMS403: Choose only warehouses available in your workspace.';
  end if;
  if exists(
    select 1 from public."WMS_ItemFacilityAssignments" assignment
    where assignment."WMSItemFacility_ItemID" = p_item_id
      and assignment."WMSItemFacility_IsActive"
      and not assignment."WMSItemFacility_FacilityID" = any(v_requested)
      and (
        exists(select 1 from public."WMS_InventoryBalances" balance where balance."WMSBalance_ItemID" = p_item_id and balance."WMSBalance_FacilityID" = assignment."WMSItemFacility_FacilityID" and balance."WMSBalance_OnHandQuantity" <> 0)
        or exists(select 1 from public."WMS_OrderLines" line join public."WMS_Orders" warehouse_order on warehouse_order."WMSOrder_ID" = line."WMSOrderLine_OrderID" where line."WMSOrderLine_ItemID" = p_item_id and warehouse_order."WMSOrder_FacilityID" = assignment."WMSItemFacility_FacilityID" and warehouse_order."WMSOrder_StatusCode" not in ('complete','cancelled') and not warehouse_order."WMSOrder_IsDeleted")
      )
  ) then raise exception 'WMS409: A warehouse with stock or open orders cannot be removed from this item.'; end if;

  update public."WMS_ItemFacilityAssignments"
  set "WMSItemFacility_IsActive" = false, "WMSItemFacility_IsDefault" = false, "WMSItemFacility_UpdatedAt" = now()
  where "WMSItemFacility_ItemID" = p_item_id and not "WMSItemFacility_FacilityID" = any(v_requested);
  update public."WMS_ItemFacilityAssignments"
  set "WMSItemFacility_IsDefault" = false, "WMSItemFacility_UpdatedAt" = now()
  where "WMSItemFacility_ItemID" = p_item_id;

  foreach v_facility_id in array v_requested loop
    insert into public."WMS_ItemFacilityAssignments" (
      "WMSItemFacility_ItemID", "WMSItemFacility_FacilityID", "WMSItemFacility_IsDefault",
      "WMSItemFacility_IsActive", "WMSItemFacility_CreatedBy"
    ) values (p_item_id, v_facility_id, v_facility_id = p_default_facility_id, true, p_actor_user_id)
    on conflict ("WMSItemFacility_ItemID", "WMSItemFacility_FacilityID") do update
    set "WMSItemFacility_IsActive" = true,
        "WMSItemFacility_IsDefault" = excluded."WMSItemFacility_IsDefault",
        "WMSItemFacility_UpdatedAt" = now();
  end loop;

  update public."WMS_Items"
  set "WMSItem_DefaultFacilityID" = p_default_facility_id,
      "WMSItem_UpdatedAt" = now()
  where "WMSItem_ID" = p_item_id;
  return p_item_id;
end;
$$;
revoke all on function public.warehouse_edge_set_item_facilities(uuid,uuid,uuid[],uuid,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_set_item_facilities(uuid,uuid,uuid[],uuid,uuid[],uuid[]) to service_role;

alter table public."WMS_Orders"
  add column if not exists "WMSOrder_SourceTypeCode" varchar(60),
  add column if not exists "WMSOrder_SourceReference" varchar(180),
  add column if not exists "WMSOrder_SourceRecordID" uuid;

update public."WMS_Orders" set
  "WMSOrder_SourceTypeCode" = case
    when "WMSOrder_TypeCode" = 'inbound' and "WMSOrder_MetadataJSON" ? 'purchaseOrderId' then 'customer_purchase_order'
    else 'manual_exception'
  end,
  "WMSOrder_SourceReference" = coalesce(
    nullif("WMSOrder_MetadataJSON"->>'purchaseOrderNumber',''),
    nullif("WMSOrder_CustomerReference",''),
    "WMSOrder_OrderNumber"
  ),
  "WMSOrder_SourceRecordID" = case
    when "WMSOrder_MetadataJSON"->>'purchaseOrderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ("WMSOrder_MetadataJSON"->>'purchaseOrderId')::uuid else null end
where "WMSOrder_SourceTypeCode" is null;

alter table public."WMS_Orders" alter column "WMSOrder_SourceTypeCode" set default 'manual_exception';
alter table public."WMS_Orders" alter column "WMSOrder_SourceTypeCode" set not null;
alter table public."WMS_Orders" alter column "WMSOrder_SourceReference" set not null;
alter table public."WMS_Orders" drop constraint if exists "CK_WMS_Orders_source_type";
alter table public."WMS_Orders" add constraint "CK_WMS_Orders_source_type" check (
  ("WMSOrder_TypeCode" = 'inbound' and "WMSOrder_SourceTypeCode" in ('customer_purchase_order','asn','transfer','return','manual_exception'))
  or ("WMSOrder_TypeCode" = 'outbound' and "WMSOrder_SourceTypeCode" in ('sales_order','transfer','return_to_supplier','disposal','manual_exception'))
);
create index if not exists "IX_WMS_Orders_source"
  on public."WMS_Orders" ("WMSOrder_SourceTypeCode", "WMSOrder_SourceRecordID", "WMSOrder_SourceReference");

create or replace function public._warehouse_order_source_defaults()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if nullif(btrim(new."WMSOrder_SourceTypeCode"),'') is null then
    new."WMSOrder_SourceTypeCode" := case
      when new."WMSOrder_TypeCode" = 'inbound' and new."WMSOrder_MetadataJSON" ? 'purchaseOrderId' then 'customer_purchase_order'
      else 'manual_exception' end;
  end if;
  new."WMSOrder_SourceReference" := coalesce(
    nullif(btrim(new."WMSOrder_SourceReference"),''),
    nullif(btrim(new."WMSOrder_MetadataJSON"->>'purchaseOrderNumber'),''),
    nullif(btrim(new."WMSOrder_CustomerReference"),''),
    new."WMSOrder_OrderNumber"
  );
  if new."WMSOrder_SourceRecordID" is null and new."WMSOrder_MetadataJSON"->>'purchaseOrderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new."WMSOrder_SourceRecordID" := (new."WMSOrder_MetadataJSON"->>'purchaseOrderId')::uuid;
  end if;
  return new;
end;
$$;
revoke all on function public._warehouse_order_source_defaults() from public, anon, authenticated;
drop trigger if exists "TR_WMS_Orders_source_defaults" on public."WMS_Orders";
create trigger "TR_WMS_Orders_source_defaults" before insert or update of "WMSOrder_SourceTypeCode", "WMSOrder_SourceReference", "WMSOrder_CustomerReference", "WMSOrder_MetadataJSON"
on public."WMS_Orders" for each row execute function public._warehouse_order_source_defaults();

insert into public."sys_WMSTaskTypes" ("WMSTaskType_Code","WMSTaskType_Name","WMSTaskType_Description","WMSTaskType_IsMobileTask","WMSTaskType_IsActive","WMSTaskType_SortOrder") values
  ('putaway','Put away','Move received stock from receiving or staging into a storage location.',true,true,20),
  ('pick','Pick','Pick allocated stock from its recorded warehouse location.',true,true,30)
on conflict ("WMSTaskType_Code") do update set "WMSTaskType_IsMobileTask"=true,"WMSTaskType_IsActive"=true;
insert into public."sys_WMSTaskStatuses" ("WMSTaskStatus_Code","WMSTaskStatus_Name","WMSTaskStatus_Description","WMSTaskStatus_IsOpen","WMSTaskStatus_IsFinal","WMSTaskStatus_IsActive","WMSTaskStatus_SortOrder") values
  ('queued','Queued','Ready for a warehouse operator.',true,false,true,10),
  ('in_progress','In progress','Part of the task has been confirmed.',true,false,true,20),
  ('complete','Complete','The physical warehouse task is complete.',false,true,true,30),
  ('cancelled','Cancelled','The task is no longer required.',false,true,true,40)
on conflict ("WMSTaskStatus_Code") do nothing;

alter table public."WMS_Tasks"
  add column if not exists "WMSTask_CompletedQuantity" numeric(18,6) not null default 0,
  add column if not exists "WMSTask_LotID" uuid references public."WMS_InventoryLots"("WMSLot_ID");
alter table public."WMS_Tasks" drop constraint if exists "CK_WMS_Tasks_completed_quantity";
alter table public."WMS_Tasks" add constraint "CK_WMS_Tasks_completed_quantity" check (
  "WMSTask_CompletedQuantity" >= 0 and ("WMSTask_Quantity" is null or "WMSTask_CompletedQuantity" <= "WMSTask_Quantity")
);

create unique index if not exists "UX_WMS_Tasks_putaway_receipt_line"
  on public."WMS_Tasks" (("WMSTask_MetadataJSON"->>'receiptLineId'))
  where "WMSTask_TypeCode" = 'putaway' and "WMSTask_MetadataJSON" ? 'receiptLineId';
create unique index if not exists "UX_WMS_Tasks_pick_balance_line"
  on public."WMS_Tasks" ("WMSTask_OrderLineID", "WMSTask_BalanceID")
  where "WMSTask_TypeCode" = 'pick' and "WMSTask_StatusCode" <> 'cancelled';

create or replace function public._warehouse_create_putaway_task()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_order public."WMS_Orders"%rowtype;
  v_balance_id uuid;
  v_location_type text;
  v_zone_type text;
  v_good numeric;
  v_task_id uuid;
begin
  v_good := new."WMSReceiptLine_ReceivedQuantity" - new."WMSReceiptLine_DamagedQuantity";
  if v_good <= 0 or new."WMSReceiptLine_TargetLocationID" is null then return new; end if;
  select location."WMSLocation_TypeCode", zone."WMSZone_TypeCode"
  into v_location_type, v_zone_type
  from public."WMS_Locations" location
  left join public."WMS_Zones" zone on zone."WMSZone_ID" = location."WMSLocation_ZoneID"
  where location."WMSLocation_ID" = new."WMSReceiptLine_TargetLocationID";
  if coalesce(v_location_type,'') not in ('staging','dock') and coalesce(v_zone_type,'') <> 'receiving' then
    raise exception 'WMS400: Receive stock into an active dock or staging location before putaway.';
  end if;
  select receipt_order.* into v_order
  from public."WMS_Receipts" receipt
  join public."WMS_Orders" receipt_order on receipt_order."WMSOrder_ID" = receipt."WMSReceipt_OrderID"
  where receipt."WMSReceipt_ID" = new."WMSReceiptLine_ReceiptID";
  select transaction."WMSTransaction_BalanceID" into v_balance_id
  from public."WMS_InventoryTransactions" transaction
  where transaction."WMSTransaction_ID" = new."WMSReceiptLine_InventoryTransactionID";
  v_task_id := gen_random_uuid();
  insert into public."WMS_Tasks" (
    "WMSTask_ID","WMSTask_FacilityID","WMSTask_OrderID","WMSTask_OrderLineID","WMSTask_JobID",
    "WMSTask_TypeCode","WMSTask_StatusCode","WMSTask_PriorityCode","WMSTask_Title","WMSTask_Instructions",
    "WMSTask_SourceLocationID","WMSTask_ItemID","WMSTask_BalanceID","WMSTask_HU_ID","WMSTask_Quantity",
    "WMSTask_CompletedQuantity","WMSTask_UOMCode","WMSTask_LotID","WMSTask_MetadataJSON","WMSTask_CreatedBy"
  ) values (
    v_task_id,v_order."WMSOrder_FacilityID",v_order."WMSOrder_ID",new."WMSReceiptLine_OrderLineID",v_order."WMSOrder_JobID",
    'putaway','queued',v_order."WMSOrder_PriorityCode",'Put away received '||new."WMSReceiptLine_UOMCode",'Scan the receiving location, stock, and destination location.',
    new."WMSReceiptLine_TargetLocationID",new."WMSReceiptLine_ItemID",v_balance_id,new."WMSReceiptLine_HU_ID",v_good,
    0,new."WMSReceiptLine_UOMCode",(select "WMSLot_ID" from public."WMS_InventoryBalances" where "WMSBalance_ID"=v_balance_id),
    jsonb_build_object('receiptId',new."WMSReceiptLine_ReceiptID",'receiptLineId',new."WMSReceiptLine_ID"),v_order."WMSOrder_UpdatedBy"
  );
  insert into public."WMS_TaskEvents" ("WMSTaskEvent_TaskID","WMSTaskEvent_EventTypeCode","WMSTaskEvent_ToStatusCode","WMSTaskEvent_MetadataJSON","WMSTaskEvent_EventBy")
  values(v_task_id,'created','queued',jsonb_build_object('receiptLineId',new."WMSReceiptLine_ID"),v_order."WMSOrder_UpdatedBy");
  return new;
end;
$$;
revoke all on function public._warehouse_create_putaway_task() from public, anon, authenticated;
drop trigger if exists "TR_WMS_ReceiptLines_create_putaway" on public."WMS_ReceiptLines";
create trigger "TR_WMS_ReceiptLines_create_putaway" after insert on public."WMS_ReceiptLines"
for each row execute function public._warehouse_create_putaway_task();

create or replace function public.warehouse_edge_create_order_mutation(
  p_payload jsonb,
  p_actor_user_id uuid,
  p_actor_portal_user_id uuid,
  p_allowed_facility_ids uuid[],
  p_allowed_organisation_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_order_id uuid := gen_random_uuid(); v_line_id uuid; v_advice_id uuid;
  v_facility public."WMS_Facilities"%rowtype; v_item public."WMS_Items"%rowtype; v_input jsonb;
  v_type text := lower(btrim(p_payload->>'typeCode'));
  v_source_type text := coalesce(nullif(lower(btrim(p_payload->>'sourceTypeCode')),''),'manual_exception');
  v_source_reference text := coalesce(nullif(btrim(p_payload->>'sourceReference'),''),nullif(btrim(p_payload->>'customerReference'),''));
  v_number text; v_quantity numeric; v_customs text; v_index integer := 0; v_now timestamptz := now();
begin
  if v_type not in ('inbound','outbound') then raise exception 'WMS400: Warehouse orders must be inbound or outbound.'; end if;
  if (v_type='inbound' and v_source_type not in ('customer_purchase_order','asn','transfer','return','manual_exception'))
    or (v_type='outbound' and v_source_type not in ('sales_order','transfer','return_to_supplier','disposal','manual_exception')) then
    raise exception 'WMS400: Choose a valid operational source type.';
  end if;
  if not ((p_payload->>'facilityId')::uuid = any(coalesce(p_allowed_facility_ids,'{}'::uuid[]))) then raise exception 'WMS403: Choose a warehouse in your workspace.'; end if;
  if not ((p_payload->>'customerOrgId')::uuid = any(coalesce(p_allowed_organisation_ids,'{}'::uuid[]))) then raise exception 'WMS403: Choose a valid customer.'; end if;
  if jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines') = 0 then raise exception 'WMS400: Add at least one item line.'; end if;
  select * into v_facility from public."WMS_Facilities" where "WMSFacility_ID"=(p_payload->>'facilityId')::uuid and "WMSFacility_IsActive" and not "WMSFacility_IsDeleted" for share;
  if not found then raise exception 'WMS400: Choose a warehouse in your workspace.'; end if;
  v_number:=upper(left(v_type,2))||'-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0');
  insert into public."WMS_Orders" (
    "WMSOrder_ID","WMSOrder_FacilityID","WMSOrder_OrgOfficeID","WMSOrder_CustomerOrgID","WMSOrder_OrderNumber","WMSOrder_TypeCode","WMSOrder_StatusCode","WMSOrder_PriorityCode",
    "WMSOrder_CustomerReference","WMSOrder_SourceTypeCode","WMSOrder_SourceReference","WMSOrder_SourceRecordID","WMSOrder_RequestedDate","WMSOrder_AppointmentStartAt","WMSOrder_AppointmentEndAt",
    "WMSOrder_VehicleReg","WMSOrder_ContainerNumber","WMSOrder_SealNumber","WMSOrder_Instructions","WMSOrder_MetadataJSON","WMSOrder_CreatedBy","WMSOrder_UpdatedBy"
  ) values (
    v_order_id,v_facility."WMSFacility_ID",v_facility."WMSFacility_OrgOfficeID",(p_payload->>'customerOrgId')::uuid,v_number,v_type,'booked',coalesce(nullif(btrim(p_payload->>'priorityCode'),''),'normal'),
    coalesce(nullif(btrim(p_payload->>'customerReference'),''),v_source_reference),v_source_type,coalesce(v_source_reference,'Manual request '||left(v_order_id::text,8)),nullif(p_payload->>'sourceRecordId','')::uuid,nullif(p_payload->>'requestedDate','')::date,
    nullif(p_payload->>'appointmentStartAt','')::timestamptz,nullif(p_payload->>'appointmentEndAt','')::timestamptz,nullif(btrim(p_payload->>'vehicleReg'),''),upper(nullif(btrim(p_payload->>'containerNumber'),'')),
    nullif(btrim(p_payload->>'sealNumber'),''),nullif(btrim(p_payload->>'instructions'),''),jsonb_build_object('sourceNotes',nullif(btrim(p_payload->>'sourceNotes'),'')),p_actor_user_id,p_actor_user_id
  );
  if p_actor_portal_user_id is not null and v_type='inbound' then
    v_advice_id:=gen_random_uuid();
    insert into public."WMS_InboundAdvices" ("WMSAdvice_ID","WMSAdvice_FacilityID","WMSAdvice_OrderID","WMSAdvice_AdviceNumber","WMSAdvice_StatusCode","WMSAdvice_CustomerOrgID","WMSAdvice_ExpectedArrivalAt","WMSAdvice_ContainerNumber","WMSAdvice_SealNumber","WMSAdvice_MetadataJSON","WMSAdvice_CreatedAt")
    values(v_advice_id,v_facility."WMSFacility_ID",v_order_id,'ASN-'||v_number,'booked',(p_payload->>'customerOrgId')::uuid,nullif(p_payload->>'appointmentStartAt','')::timestamptz,upper(nullif(btrim(p_payload->>'containerNumber'),'')),nullif(btrim(p_payload->>'sealNumber'),''),'{"source":"customer_portal"}',v_now);
  end if;
  for v_input in select value from jsonb_array_elements(p_payload->'lines') loop
    v_index:=v_index+1; v_quantity:=nullif(v_input->>'quantity','')::numeric;
    if coalesce(v_quantity,0)<=0 then raise exception 'WMS400: Quantity must be greater than zero.'; end if;
    select item.* into v_item from public."WMS_Items" item
    join public."WMS_ItemFacilityAssignments" assignment on assignment."WMSItemFacility_ItemID"=item."WMSItem_ID" and assignment."WMSItemFacility_FacilityID"=v_facility."WMSFacility_ID" and assignment."WMSItemFacility_IsActive"
    where item."WMSItem_ID"=(v_input->>'itemId')::uuid and item."WMSItem_CustomerOrgID"=(p_payload->>'customerOrgId')::uuid and item."WMSItem_IsActive" and not item."WMSItem_IsDeleted";
    if not found then raise exception 'WMS400: One or more selected items are not enabled in this warehouse.'; end if;
    perform public._warehouse_edge_validate_quantity(v_item."WMSItem_ID",v_quantity);
    v_customs:=coalesce(nullif(btrim(v_input->>'customsStatusCode'),''),v_facility."WMSFacility_DefaultCustomsStatusCode");
    if v_type='outbound' and (select coalesce(sum(balance."WMSBalance_AvailableQuantity"),0) from public."WMS_InventoryBalances" balance where balance."WMSBalance_FacilityID"=v_facility."WMSFacility_ID" and balance."WMSBalance_CustomerOrgID"=v_item."WMSItem_CustomerOrgID" and balance."WMSBalance_ItemID"=v_item."WMSItem_ID" and balance."WMSBalance_InventoryStatusCode"='available' and balance."WMSBalance_CustomsStatusCode"=v_customs and balance."WMSBalance_AvailableQuantity">0 and ((v_input->>'sourceLocationId') is null or balance."WMSBalance_LocationID"=(v_input->>'sourceLocationId')::uuid)) < v_quantity then raise exception 'WMS409: There is not enough available stock for this outbound line.'; end if;
    v_line_id:=gen_random_uuid();
    insert into public."WMS_OrderLines" ("WMSOrderLine_ID","WMSOrderLine_OrderID","WMSOrderLine_LineNo","WMSOrderLine_ItemID","WMSOrderLine_StatusCode","WMSOrderLine_OrderedQuantity","WMSOrderLine_UOMCode","WMSOrderLine_LotNumber","WMSOrderLine_ExpiryDate","WMSOrderLine_SourceLocationID","WMSOrderLine_TargetLocationID","WMSOrderLine_InventoryStatusCode","WMSOrderLine_CustomsStatusCode","WMSOrderLine_GoodsValue","WMSOrderLine_CurrencyCode","WMSOrderLine_Instructions","WMSOrderLine_MetadataJSON")
    values(v_line_id,v_order_id,v_index,v_item."WMSItem_ID",'open',v_quantity,upper(coalesce(nullif(btrim(v_input->>'uomCode'),''),v_item."WMSItem_BaseUOMCode")),nullif(btrim(v_input->>'lotNumber'),''),nullif(v_input->>'expiryDate','')::date,nullif(v_input->>'sourceLocationId','')::uuid,nullif(v_input->>'targetLocationId','')::uuid,'available',v_customs,nullif(v_input->>'goodsValue','')::numeric,upper(nullif(btrim(v_input->>'currencyCode'),'')),nullif(btrim(v_input->>'instructions'),''),'{}');
    if v_advice_id is not null then insert into public."WMS_InboundAdviceLines" ("WMSAdviceLine_ID","WMSAdviceLine_AdviceID","WMSAdviceLine_OrderLineID","WMSAdviceLine_LineNo","WMSAdviceLine_ItemID","WMSAdviceLine_ExpectedQuantity","WMSAdviceLine_UOMCode","WMSAdviceLine_LotNumber","WMSAdviceLine_ExpiryDate","WMSAdviceLine_CustomsStatusCode") values(gen_random_uuid(),v_advice_id,v_line_id,v_index,v_item."WMSItem_ID",v_quantity,upper(coalesce(nullif(btrim(v_input->>'uomCode'),''),v_item."WMSItem_BaseUOMCode")),nullif(btrim(v_input->>'lotNumber'),''),nullif(v_input->>'expiryDate','')::date,v_customs); end if;
  end loop;
  return v_order_id;
end;
$$;
revoke all on function public.warehouse_edge_create_order_mutation(jsonb,uuid,uuid,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_create_order_mutation(jsonb,uuid,uuid,uuid[],uuid[]) to service_role;

create or replace function public.warehouse_edge_release_order_mutation(
  p_order_id uuid, p_payload jsonb, p_actor_user_id uuid,
  p_allowed_facility_ids uuid[], p_allowed_organisation_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_order public."WMS_Orders"%rowtype; v_line public."WMS_OrderLines"%rowtype; v_balance public."WMS_InventoryBalances"%rowtype;
  v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid; v_needed numeric; v_take numeric; v_task_id uuid; v_now timestamptz:=now();
begin
  if p_actor_user_id is null then raise exception 'WMS403: Outbound release is reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and "WMSOrder_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and "WMSOrder_CustomerOrgID"=any(coalesce(p_allowed_organisation_ids,'{}'::uuid[])) and not "WMSOrder_IsDeleted" for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_TypeCode"<>'outbound' or v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This outbound order cannot be released.'; end if;
  if coalesce(v_order."WMSOrder_MetadataJSON"->'releaseRequestIds','[]'::jsonb) ? v_request_id::text then return p_order_id; end if;
  for v_line in select * from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and "WMSOrderLine_StatusCode"<>'cancelled' order by "WMSOrderLine_LineNo" for update loop
    v_needed:=v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_AllocatedQuantity";
    if v_needed<=0 then continue; end if;
    for v_balance in select * from public."WMS_InventoryBalances" where "WMSBalance_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSBalance_CustomerOrgID"=v_order."WMSOrder_CustomerOrgID" and "WMSBalance_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSBalance_InventoryStatusCode"='available' and "WMSBalance_CustomsStatusCode"=v_line."WMSOrderLine_CustomsStatusCode" and "WMSBalance_AvailableQuantity">0 and (v_line."WMSOrderLine_SourceLocationID" is null or "WMSBalance_LocationID"=v_line."WMSOrderLine_SourceLocationID") order by "WMSBalance_FirstReceiptAt", "WMSBalance_ID" for update loop
      exit when v_needed<=0; v_take:=least(v_needed,v_balance."WMSBalance_AvailableQuantity"); v_task_id:=gen_random_uuid();
      update public."WMS_InventoryBalances" set "WMSBalance_AllocatedQuantity"="WMSBalance_AllocatedQuantity"+v_take,"WMSBalance_AvailableQuantity"="WMSBalance_AvailableQuantity"-v_take,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      insert into public."WMS_Tasks" ("WMSTask_ID","WMSTask_FacilityID","WMSTask_OrderID","WMSTask_OrderLineID","WMSTask_JobID","WMSTask_TypeCode","WMSTask_StatusCode","WMSTask_PriorityCode","WMSTask_Title","WMSTask_Instructions","WMSTask_SourceLocationID","WMSTask_TargetLocationID","WMSTask_ItemID","WMSTask_BalanceID","WMSTask_HU_ID","WMSTask_Quantity","WMSTask_CompletedQuantity","WMSTask_UOMCode","WMSTask_LotID","WMSTask_MetadataJSON","WMSTask_CreatedBy")
      values(v_task_id,v_order."WMSOrder_FacilityID",p_order_id,v_line."WMSOrderLine_ID",v_order."WMSOrder_JobID",'pick','queued',v_order."WMSOrder_PriorityCode",'Pick stock for '||v_order."WMSOrder_OrderNumber",'Scan the source location and item before confirming the pick.',v_balance."WMSBalance_LocationID",v_line."WMSOrderLine_TargetLocationID",v_line."WMSOrderLine_ItemID",v_balance."WMSBalance_ID",v_balance."WMSBalance_HU_ID",v_take,0,v_line."WMSOrderLine_UOMCode",v_balance."WMSBalance_LotID",jsonb_build_object('releaseRequestId',v_request_id,'dispatchedQuantity',0),p_actor_user_id);
      insert into public."WMS_PickTasks" ("WMSPick_ID","WMSPick_TaskID","WMSPick_OrderLineID","WMSPick_BalanceID","WMSPick_SourceLocationID","WMSPick_TargetLocationID","WMSPick_QuantityToPick","WMSPick_QuantityPicked","WMSPick_UOMCode","WMSPick_StatusCode") values(gen_random_uuid(),v_task_id,v_line."WMSOrderLine_ID",v_balance."WMSBalance_ID",v_balance."WMSBalance_LocationID",v_line."WMSOrderLine_TargetLocationID",v_take,0,v_line."WMSOrderLine_UOMCode",'queued');
      insert into public."WMS_TaskEvents" ("WMSTaskEvent_TaskID","WMSTaskEvent_EventTypeCode","WMSTaskEvent_ToStatusCode","WMSTaskEvent_MetadataJSON","WMSTaskEvent_EventBy") values(v_task_id,'created','queued',jsonb_build_object('releaseRequestId',v_request_id),p_actor_user_id);
      v_needed:=v_needed-v_take;
    end loop;
    if v_needed>0 then raise exception 'WMS409: There is not enough available stock to release this order.'; end if;
    update public."WMS_OrderLines" set "WMSOrderLine_AllocatedQuantity"="WMSOrderLine_OrderedQuantity","WMSOrderLine_StatusCode"='allocated' where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID";
  end loop;
  update public."WMS_Orders" set "WMSOrder_StatusCode"='in_progress',"WMSOrder_MetadataJSON"=jsonb_set("WMSOrder_MetadataJSON",'{releaseRequestIds}',coalesce("WMSOrder_MetadataJSON"->'releaseRequestIds','[]'::jsonb)||to_jsonb(v_request_id::text),true),"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;
revoke all on function public.warehouse_edge_release_order_mutation(uuid,jsonb,uuid,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_release_order_mutation(uuid,jsonb,uuid,uuid[],uuid[]) to service_role;

create or replace function public.warehouse_edge_cancel_order_mutation(
  p_order_id uuid, p_actor_user_id uuid,
  p_allowed_facility_ids uuid[], p_allowed_organisation_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public."WMS_Orders"%rowtype; v_task public."WMS_Tasks"%rowtype; v_now timestamptz:=now();
begin
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and "WMSOrder_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and "WMSOrder_CustomerOrgID"=any(coalesce(p_allowed_organisation_ids,'{}'::uuid[])) and not "WMSOrder_IsDeleted" for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This order is already final.'; end if;
  if exists(select 1 from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and ("WMSOrderLine_ReceivedQuantity">0 or "WMSOrderLine_PickedQuantity">0 or "WMSOrderLine_DispatchedQuantity">0)) then raise exception 'WMS409: An order with received, picked, or dispatched stock cannot be cancelled.'; end if;
  if v_order."WMSOrder_TypeCode"='outbound' then
    for v_task in select * from public."WMS_Tasks" where "WMSTask_OrderID"=p_order_id and "WMSTask_TypeCode"='pick' and "WMSTask_StatusCode" not in ('complete','cancelled') for update loop
      update public."WMS_InventoryBalances" set "WMSBalance_AllocatedQuantity"=greatest(0,"WMSBalance_AllocatedQuantity"-v_task."WMSTask_Quantity"),"WMSBalance_AvailableQuantity"="WMSBalance_AvailableQuantity"+v_task."WMSTask_Quantity","WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_task."WMSTask_BalanceID";
      update public."WMS_Tasks" set "WMSTask_StatusCode"='cancelled',"WMSTask_CompletedAt"=v_now,"WMSTask_CompletedBy"=p_actor_user_id where "WMSTask_ID"=v_task."WMSTask_ID";
      update public."WMS_PickTasks" set "WMSPick_StatusCode"='cancelled' where "WMSPick_TaskID"=v_task."WMSTask_ID";
      insert into public."WMS_TaskEvents" ("WMSTaskEvent_TaskID","WMSTaskEvent_EventTypeCode","WMSTaskEvent_FromStatusCode","WMSTaskEvent_ToStatusCode","WMSTaskEvent_EventBy") values(v_task."WMSTask_ID",'cancelled',v_task."WMSTask_StatusCode",'cancelled',p_actor_user_id);
    end loop;
  end if;
  update public."WMS_OrderLines" set "WMSOrderLine_AllocatedQuantity"=0,"WMSOrderLine_StatusCode"='cancelled' where "WMSOrderLine_OrderID"=p_order_id;
  update public."WMS_Orders" set "WMSOrder_StatusCode"='cancelled',"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;
revoke all on function public.warehouse_edge_cancel_order_mutation(uuid,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_cancel_order_mutation(uuid,uuid,uuid[],uuid[]) to service_role;

create or replace function public.warehouse_edge_confirm_task_mutation(
  p_task_id uuid, p_payload jsonb, p_actor_user_id uuid, p_allowed_facility_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_task public."WMS_Tasks"%rowtype; v_item public."WMS_Items"%rowtype; v_location public."WMS_Locations"%rowtype;
  v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid; v_quantity numeric:=nullif(p_payload->>'quantity','')::numeric;
  v_target uuid:=nullif(p_payload->>'targetLocationId','')::uuid; v_previous text; v_completed numeric; v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'WMS403: Physical warehouse tasks are reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  select * into v_task from public."WMS_Tasks" where "WMSTask_ID"=p_task_id and "WMSTask_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) for update;
  if not found then raise exception 'WMS404: This warehouse task does not exist in your workspace.'; end if;
  if coalesce(v_task."WMSTask_MetadataJSON"->'confirmationRequestIds','[]'::jsonb) ? v_request_id::text then return p_task_id; end if;
  if v_task."WMSTask_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This warehouse task is already final.'; end if;
  if coalesce(v_quantity,0)<=0 or v_quantity>coalesce(v_task."WMSTask_Quantity",0)-v_task."WMSTask_CompletedQuantity" then raise exception 'WMS400: Check the confirmed task quantity.'; end if;
  select * into v_item from public."WMS_Items" where "WMSItem_ID"=v_task."WMSTask_ItemID";
  if nullif(btrim(p_payload->>'scannedItemCode'),'') is not null and lower(btrim(p_payload->>'scannedItemCode'))<>lower(v_item."WMSItem_SKU") and not exists(select 1 from public."WMS_ItemBarcodes" barcode where barcode."WMSItemBarcode_ItemID"=v_item."WMSItem_ID" and barcode."WMSItemBarcode_IsActive" and lower(barcode."WMSItemBarcode_Barcode")=lower(btrim(p_payload->>'scannedItemCode'))) then raise exception 'WMS409: The scanned item does not match this task.'; end if;
  if nullif(btrim(p_payload->>'scannedSourceLocationCode'),'') is not null and not exists(select 1 from public."WMS_Locations" location where location."WMSLocation_ID"=v_task."WMSTask_SourceLocationID" and (lower(location."WMSLocation_Code")=lower(btrim(p_payload->>'scannedSourceLocationCode')) or lower(coalesce(location."WMSLocation_Barcode",''))=lower(btrim(p_payload->>'scannedSourceLocationCode')))) then raise exception 'WMS409: The scanned source location does not match this task.'; end if;
  v_previous:=v_task."WMSTask_StatusCode";
  if v_task."WMSTask_TypeCode"='putaway' then
    if v_target is null then raise exception 'WMS400: Choose the putaway destination.'; end if;
    select * into v_location from public."WMS_Locations" where "WMSLocation_ID"=v_target and "WMSLocation_FacilityID"=v_task."WMSTask_FacilityID" and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted" and "WMSLocation_StatusCode"='available';
    if not found or v_location."WMSLocation_TypeCode" in ('staging','dock','quarantine') then raise exception 'WMS400: Choose an available storage or pick location.'; end if;
    if nullif(btrim(p_payload->>'scannedTargetLocationCode'),'') is not null and lower(btrim(p_payload->>'scannedTargetLocationCode')) not in (lower(v_location."WMSLocation_Code"),lower(coalesce(v_location."WMSLocation_Barcode",''))) then raise exception 'WMS409: The scanned destination does not match the chosen location.'; end if;
    v_result:=public.warehouse_edge_inventory_mutation('move_balance',jsonb_build_object('requestId',v_request_id,'facilityId',v_task."WMSTask_FacilityID",'balanceId',v_task."WMSTask_BalanceID",'targetLocationId',v_target,'quantity',v_quantity,'reasonCode','putaway_task','notes',nullif(btrim(p_payload->>'notes'),'')),p_actor_user_id,array[v_task."WMSTask_FacilityID"]);
    update public."WMS_Tasks" set "WMSTask_TargetLocationID"=v_target where "WMSTask_ID"=p_task_id;
  elsif v_task."WMSTask_TypeCode"='pick' then
    update public."WMS_PickTasks" set "WMSPick_QuantityPicked"="WMSPick_QuantityPicked"+v_quantity,"WMSPick_StatusCode"=case when "WMSPick_QuantityPicked"+v_quantity >= "WMSPick_QuantityToPick" then 'complete' else 'in_progress' end,"WMSPick_PickedAt"=case when "WMSPick_QuantityPicked"+v_quantity >= "WMSPick_QuantityToPick" then now() else "WMSPick_PickedAt" end,"WMSPick_PickedBy"=p_actor_user_id where "WMSPick_TaskID"=p_task_id;
  else raise exception 'WMS400: This task type cannot be confirmed here.'; end if;
  v_completed:=v_task."WMSTask_CompletedQuantity"+v_quantity;
  update public."WMS_Tasks" set "WMSTask_CompletedQuantity"=v_completed,"WMSTask_StatusCode"=case when v_completed>=coalesce("WMSTask_Quantity",0) then 'complete' else 'in_progress' end,"WMSTask_StartedAt"=coalesce("WMSTask_StartedAt",now()),"WMSTask_CompletedAt"=case when v_completed>=coalesce("WMSTask_Quantity",0) then now() else null end,"WMSTask_CompletedBy"=case when v_completed>=coalesce("WMSTask_Quantity",0) then p_actor_user_id else null end,"WMSTask_MetadataJSON"="WMSTask_MetadataJSON"||jsonb_build_object('confirmationRequestIds',coalesce("WMSTask_MetadataJSON"->'confirmationRequestIds','[]'::jsonb)||to_jsonb(v_request_id::text),'lastScan',jsonb_strip_nulls(jsonb_build_object('sourceLocationCode',nullif(btrim(p_payload->>'scannedSourceLocationCode'),''),'targetLocationCode',nullif(btrim(p_payload->>'scannedTargetLocationCode'),''),'itemCode',nullif(btrim(p_payload->>'scannedItemCode'),'')))) where "WMSTask_ID"=p_task_id;
  insert into public."WMS_TaskEvents" ("WMSTaskEvent_TaskID","WMSTaskEvent_EventTypeCode","WMSTaskEvent_FromStatusCode","WMSTaskEvent_ToStatusCode","WMSTaskEvent_Notes","WMSTaskEvent_MetadataJSON","WMSTaskEvent_EventBy") values(p_task_id,'confirmed',v_previous,case when v_completed>=coalesce(v_task."WMSTask_Quantity",0) then 'complete' else 'in_progress' end,nullif(btrim(p_payload->>'notes'),''),jsonb_strip_nulls(jsonb_build_object('requestId',v_request_id,'quantity',v_quantity,'sourceLocationCode',nullif(btrim(p_payload->>'scannedSourceLocationCode'),''),'targetLocationCode',nullif(btrim(p_payload->>'scannedTargetLocationCode'),''),'itemCode',nullif(btrim(p_payload->>'scannedItemCode'),''),'movement',v_result)),p_actor_user_id);
  if v_task."WMSTask_TypeCode"='pick' then
    update public."WMS_OrderLines" line set "WMSOrderLine_PickedQuantity"=(select coalesce(sum(pick."WMSPick_QuantityPicked"),0) from public."WMS_PickTasks" pick where pick."WMSPick_OrderLineID"=line."WMSOrderLine_ID"),"WMSOrderLine_StatusCode"=case when (select coalesce(sum(pick."WMSPick_QuantityPicked"),0) from public."WMS_PickTasks" pick where pick."WMSPick_OrderLineID"=line."WMSOrderLine_ID")>=line."WMSOrderLine_OrderedQuantity" then 'picked' else 'allocated' end where line."WMSOrderLine_ID"=v_task."WMSTask_OrderLineID";
  end if;
  return p_task_id;
end;
$$;
revoke all on function public.warehouse_edge_confirm_task_mutation(uuid,jsonb,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_confirm_task_mutation(uuid,jsonb,uuid,uuid[]) to service_role;

create or replace function public.warehouse_edge_dispatch_mutation(
  p_order_id uuid, p_payload jsonb, p_actor_user_id uuid,
  p_allowed_facility_ids uuid[], p_allowed_organisation_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_order public."WMS_Orders"%rowtype; v_line public."WMS_OrderLines"%rowtype; v_task public."WMS_Tasks"%rowtype; v_balance public."WMS_InventoryBalances"%rowtype;
  v_input jsonb; v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid; v_dispatch_id uuid; v_number text; v_quantity numeric; v_remaining numeric; v_take numeric; v_before numeric; v_complete boolean; v_now timestamptz:=now();
begin
  if p_actor_user_id is null then raise exception 'WMS403: Dispatch is reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and "WMSOrder_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and "WMSOrder_CustomerOrgID"=any(coalesce(p_allowed_organisation_ids,'{}'::uuid[])) and not "WMSOrder_IsDeleted" for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_TypeCode"<>'outbound' or v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This outbound order cannot be dispatched.'; end if;
  if exists(select 1 from public."WMS_Dispatches" where "WMSDispatch_OrderID"=p_order_id and "WMSDispatch_MetadataJSON"->>'requestId'=v_request_id::text) then return p_order_id; end if;
  if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines')=0 then raise exception 'WMS400: Add at least one dispatch line.'; end if;
  v_dispatch_id:=gen_random_uuid(); v_number:='DSP-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0');
  insert into public."WMS_Dispatches" ("WMSDispatch_ID","WMSDispatch_FacilityID","WMSDispatch_OrderID","WMSDispatch_JobID","WMSDispatch_DispatchNumber","WMSDispatch_StatusCode","WMSDispatch_VehicleReg","WMSDispatch_ContainerNumber","WMSDispatch_SealNumber","WMSDispatch_DispatchedAt","WMSDispatch_DispatchedBy","WMSDispatch_MetadataJSON") values(v_dispatch_id,v_order."WMSOrder_FacilityID",p_order_id,v_order."WMSOrder_JobID",v_number,'complete',coalesce(nullif(btrim(p_payload->>'vehicleReg'),''),v_order."WMSOrder_VehicleReg"),coalesce(upper(nullif(btrim(p_payload->>'containerNumber'),'')),v_order."WMSOrder_ContainerNumber"),coalesce(nullif(btrim(p_payload->>'sealNumber'),''),v_order."WMSOrder_SealNumber"),v_now,p_actor_user_id,jsonb_build_object('requestId',v_request_id,'notes',nullif(btrim(p_payload->>'notes'),'')));
  for v_input in select value from jsonb_array_elements(p_payload->'lines') loop
    select * into v_line from public."WMS_OrderLines" where "WMSOrderLine_ID"=(v_input->>'orderLineId')::uuid and "WMSOrderLine_OrderID"=p_order_id for update;
    if not found then raise exception 'WMS400: A dispatch line does not belong to this order.'; end if;
    v_quantity:=nullif(v_input->>'quantity','')::numeric;
    if coalesce(v_quantity,0)<=0 or v_quantity>v_line."WMSOrderLine_PickedQuantity"-v_line."WMSOrderLine_DispatchedQuantity" then raise exception 'WMS409: Dispatch only quantities that warehouse staff have picked.'; end if;
    v_remaining:=v_quantity;
    for v_task in select task.* from public."WMS_Tasks" task where task."WMSTask_TypeCode"='pick' and task."WMSTask_OrderLineID"=v_line."WMSOrderLine_ID" and task."WMSTask_CompletedQuantity">coalesce((task."WMSTask_MetadataJSON"->>'dispatchedQuantity')::numeric,0) order by task."WMSTask_CreatedAt",task."WMSTask_ID" for update loop
      exit when v_remaining<=0; v_take:=least(v_remaining,v_task."WMSTask_CompletedQuantity"-coalesce((v_task."WMSTask_MetadataJSON"->>'dispatchedQuantity')::numeric,0));
      select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=v_task."WMSTask_BalanceID" for update;
      if not found or v_balance."WMSBalance_OnHandQuantity"<v_take or v_balance."WMSBalance_AllocatedQuantity"<v_take then raise exception 'WMS409: Picked stock no longer matches its allocated balance.'; end if;
      v_before:=v_balance."WMSBalance_OnHandQuantity";
      update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"="WMSBalance_OnHandQuantity"-v_take,"WMSBalance_AllocatedQuantity"="WMSBalance_AllocatedQuantity"-v_take,"WMSBalance_UpdatedAt"=v_now,"WMSBalance_LastMovementAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      update public."WMS_Tasks" set "WMSTask_MetadataJSON"=jsonb_set("WMSTask_MetadataJSON",'{dispatchedQuantity}',to_jsonb(coalesce(("WMSTask_MetadataJSON"->>'dispatchedQuantity')::numeric,0)+v_take),true) where "WMSTask_ID"=v_task."WMSTask_ID";
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_LotID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_OrderID","WMSTransaction_OrderLineID","WMSTransaction_TaskID","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedBy") values(v_order."WMSOrder_FacilityID",v_balance."WMSBalance_ID",'dispatch',v_line."WMSOrderLine_ItemID",v_order."WMSOrder_CustomerOrgID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_HU_ID",v_take,v_line."WMSOrderLine_UOMCode",v_before,v_before-v_take,'available',v_line."WMSOrderLine_CustomsStatusCode",p_order_id,v_line."WMSOrderLine_ID",v_task."WMSTask_ID",'WMS_Dispatches',v_dispatch_id,v_number,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('requestId',v_request_id),'dispatch_picked_stock',v_request_id,p_actor_user_id);
      v_remaining:=v_remaining-v_take;
    end loop;
    if v_remaining>0 then raise exception 'WMS409: Picked stock evidence is incomplete for this dispatch.'; end if;
    update public."WMS_OrderLines" set "WMSOrderLine_DispatchedQuantity"="WMSOrderLine_DispatchedQuantity"+v_quantity,"WMSOrderLine_StatusCode"=case when "WMSOrderLine_DispatchedQuantity"+v_quantity>="WMSOrderLine_OrderedQuantity" then 'dispatched' else 'picked' end where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID";
  end loop;
  select bool_and("WMSOrderLine_DispatchedQuantity">="WMSOrderLine_OrderedQuantity") into v_complete from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and "WMSOrderLine_StatusCode"<>'cancelled';
  update public."WMS_Orders" set "WMSOrder_StatusCode"=case when v_complete then 'complete' else 'part_complete' end,"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;
revoke all on function public.warehouse_edge_dispatch_mutation(uuid,jsonb,uuid,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_dispatch_mutation(uuid,jsonb,uuid,uuid[],uuid[]) to service_role;

-- Item selectors now use active facility assignments rather than mistaking the
-- default facility for the only facility in which an item can be handled.
create or replace function public.warehouse_edge_item_selector_page(
  p_allowed_facility_ids uuid[], p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null, p_customer_org_id uuid default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,25),50)); v_offset integer:=greatest(0,coalesce(p_offset,0)); v_search text:=lower(nullif(btrim(p_search),'')); v_result jsonb;
begin
  if p_facility_id is null or p_customer_org_id is null or not p_facility_id=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) or (p_allowed_org_ids is not null and not p_customer_org_id=any(p_allowed_org_ids)) then return jsonb_build_object('rows','[]'::jsonb,'limit',v_limit,'offset',v_offset,'hasMore',false); end if;
  with candidates as materialized (
    select item.* from public."WMS_Items" item join public."WMS_ItemFacilityAssignments" assignment on assignment."WMSItemFacility_ItemID"=item."WMSItem_ID" and assignment."WMSItemFacility_FacilityID"=p_facility_id and assignment."WMSItemFacility_IsActive"
    where item."WMSItem_CustomerOrgID"=p_customer_org_id and item."WMSItem_IsActive" and not item."WMSItem_IsDeleted" and (v_search is null or strpos(lower(concat_ws(' ',item."WMSItem_SKU",item."WMSItem_Description")),v_search)>0)
    order by lower(item."WMSItem_SKU"),item."WMSItem_ID" limit v_limit+1 offset v_offset
  ), page as (select * from candidates order by lower("WMSItem_SKU"),"WMSItem_ID" limit v_limit)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',item."WMSItem_ID",'customerOrgId',item."WMSItem_CustomerOrgID",'facilityId',p_facility_id,'sku',item."WMSItem_SKU",'description',item."WMSItem_Description",'uomCode',item."WMSItem_BaseUOMCode",'quantityBasisCode',coalesce(item."WMSItem_QuantityBasisCode",'count'),'allowsFractionalQuantity',coalesce(item."WMSItem_AllowsFractionalQuantity",false),'requiresLot',item."WMSItem_RequiresLot",'requiresExpiry',item."WMSItem_RequiresExpiry") order by lower(item."WMSItem_SKU"),item."WMSItem_ID") from page item),'[]'::jsonb),'limit',v_limit,'offset',v_offset,'hasMore',(select count(*)>v_limit from candidates)) into v_result;
  return v_result;
end;
$$;
revoke all on function public.warehouse_edge_item_selector_page(uuid[],uuid[],uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.warehouse_edge_item_selector_page(uuid[],uuid[],uuid,uuid,text,integer,integer) to service_role;

create or replace function public.warehouse_edge_item_id_by_sku(p_allowed_facility_ids uuid[],p_allowed_org_ids uuid[] default null,p_sku text default null)
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select item."WMSItem_ID" from public."WMS_Items" item
  where btrim(coalesce(p_sku,''))<>'' and lower(item."WMSItem_SKU")=lower(btrim(p_sku))
    and (p_allowed_org_ids is null or item."WMSItem_CustomerOrgID"=any(p_allowed_org_ids)) and not item."WMSItem_IsDeleted"
    and exists(select 1 from public."WMS_ItemFacilityAssignments" assignment where assignment."WMSItemFacility_ItemID"=item."WMSItem_ID" and assignment."WMSItemFacility_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and assignment."WMSItemFacility_IsActive")
  order by item."WMSItem_ID" limit 1;
$$;
revoke all on function public.warehouse_edge_item_id_by_sku(uuid[],uuid[],text) from public,anon,authenticated;
grant execute on function public.warehouse_edge_item_id_by_sku(uuid[],uuid[],text) to service_role;

create or replace function public.warehouse_edge_items_page(
  p_allowed_facility_ids uuid[], p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null, p_search text default null,
  p_include_inactive boolean default false, p_sort text default 'sku',
  p_direction text default 'asc', p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),50)); v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_search text:=lower(nullif(btrim(p_search),'')); v_sort text:=case when p_sort in ('sku','item','facility','hs','uom','gross','status') then p_sort else 'sku' end;
  v_direction text:=case when lower(p_direction)='desc' then 'desc' else 'asc' end; v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids),0)=0 then return jsonb_build_object('rows','[]'::jsonb,'total',0,'limit',v_limit,'offset',v_offset); end if;
  with filtered as materialized (
    select item.*,organisation."Org_Name" customer_name,facility."WMSFacility_Name" facility_name
    from public."WMS_Items" item
    join public."WMS_Facilities" facility on facility."WMSFacility_ID"=item."WMSItem_DefaultFacilityID"
    join public."Org_Master" organisation on organisation."Org_id"=item."WMSItem_CustomerOrgID"
    where exists(select 1 from public."WMS_ItemFacilityAssignments" assignment where assignment."WMSItemFacility_ItemID"=item."WMSItem_ID" and assignment."WMSItemFacility_IsActive" and assignment."WMSItemFacility_FacilityID"=any(p_allowed_facility_ids) and (p_facility_id is null or assignment."WMSItemFacility_FacilityID"=p_facility_id))
      and (p_allowed_org_ids is null or item."WMSItem_CustomerOrgID"=any(p_allowed_org_ids)) and not item."WMSItem_IsDeleted" and (p_include_inactive or item."WMSItem_IsActive")
      and (v_search is null or strpos(lower(concat_ws(' ',item."WMSItem_SKU",item."WMSItem_Description",item."WMSItem_CommodityDescription",item."WMSItem_HSCode",organisation."Org_Name",facility."WMSFacility_Name")),v_search)>0)
  ), ranked as (
    select *,row_number() over(order by
      case when v_direction='asc' then case v_sort when 'sku' then lower("WMSItem_SKU") when 'item' then lower("WMSItem_Description") when 'facility' then lower(facility_name) when 'hs' then lower("WMSItem_HSCode") when 'uom' then lower("WMSItem_BaseUOMCode") end end asc nulls last,
      case when v_direction='desc' then case v_sort when 'sku' then lower("WMSItem_SKU") when 'item' then lower("WMSItem_Description") when 'facility' then lower(facility_name) when 'hs' then lower("WMSItem_HSCode") when 'uom' then lower("WMSItem_BaseUOMCode") end end desc nulls last,
      case when v_direction='asc' and v_sort='gross' then "WMSItem_GrossWeightKG" end asc nulls last,case when v_direction='desc' and v_sort='gross' then "WMSItem_GrossWeightKG" end desc nulls last,
      case when v_direction='asc' and v_sort='status' then "WMSItem_IsActive" end asc,case when v_direction='desc' and v_sort='status' then "WMSItem_IsActive" end desc,lower("WMSItem_SKU"),"WMSItem_ID") ordinal from filtered
  ), page as (select * from ranked where ordinal>v_offset and ordinal<=v_offset+v_limit)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
    'id',item."WMSItem_ID",'customerOrgId',item."WMSItem_CustomerOrgID",'customerOrgName',item.customer_name,'facilityId',item."WMSItem_DefaultFacilityID",'facilityName',item.facility_name,
    'sku',item."WMSItem_SKU",'description',item."WMSItem_Description",'commodityDescription',item."WMSItem_CommodityDescription",'hsCode',item."WMSItem_HSCode",'countryOfOriginCode',item."WMSItem_CountryOfOriginCode",'baseUomCode',item."WMSItem_BaseUOMCode",
    'quantityBasisCode',coalesce(item."WMSItem_QuantityBasisCode",'count'),'quantityScale',coalesce(item."WMSItem_QuantityScale",0),'minimumMovementQuantity',coalesce(item."WMSItem_MinimumMovementQuantity",1),'allowsFractionalQuantity',coalesce(item."WMSItem_AllowsFractionalQuantity",false),
    'uoms',coalesce((select jsonb_agg(jsonb_build_object('id',uom."WMSItemUOM_ID",'code',uom."WMSItemUOM_UOMCode",'quantityInBaseUom',uom."WMSItemUOM_QuantityInBaseUOM",'grossWeightKg',uom."WMSItemUOM_GrossWeightKG",'purchasing',uom."WMSItemUOM_IsPurchasingUOM",'stocking',uom."WMSItemUOM_IsStockingUOM",'selling',uom."WMSItemUOM_IsSellingUOM") order by uom."WMSItemUOM_UOMCode") from public."WMS_ItemUOMs" uom where uom."WMSItemUOM_ItemID"=item."WMSItem_ID"),'[]'::jsonb),
    'lengthM',item."WMSItem_LengthM",'widthM',item."WMSItem_WidthM",'heightM',item."WMSItem_HeightM",'netWeightKg',item."WMSItem_NetWeightKG",'grossWeightKg',item."WMSItem_GrossWeightKG",'isDangerousGoods',item."WMSItem_IsDangerousGoods",'isExciseGoods',item."WMSItem_IsExciseGoods",'isHighValue',item."WMSItem_IsHighValue",'isBondedEligible',item."WMSItem_IsBondedEligible",'requiresLot',item."WMSItem_RequiresLot",'requiresSerial',item."WMSItem_RequiresSerial",'requiresExpiry',item."WMSItem_RequiresExpiry",'temperatureMinC',item."WMSItem_TemperatureMinC",'temperatureMaxC',item."WMSItem_TemperatureMaxC",'isActive',item."WMSItem_IsActive",'createdAt',item."WMSItem_CreatedAt",'updatedAt',item."WMSItem_UpdatedAt") order by item.ordinal) from page item),'[]'::jsonb),'total',(select count(*) from filtered),'limit',v_limit,'offset',v_offset) into v_result;
  return v_result;
end;
$$;
revoke all on function public.warehouse_edge_items_page(uuid[],uuid[],uuid,text,boolean,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.warehouse_edge_items_page(uuid[],uuid[],uuid,text,boolean,text,text,integer,integer) to service_role;

create or replace function public.multideck_dexter_domain_warehouse_execution(
  p_company_id uuid, p_search text default null, p_take integer default 10
) returns jsonb language sql stable security definer set search_path=pg_catalog,public,auth as $$
with permitted as (
  select public._multideck_dexter_can_manage(user_row."User_ID") allowed
  from public."cmp_Users" user_row where user_row."Auth_User_ID"=auth.uid() and user_row."Company_ID"=p_company_id limit 1
), company_facilities as (
  select facility."WMSFacility_ID",facility."WMSFacility_Code",facility."WMSFacility_Name"
  from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" and office."Company_ID"=p_company_id
  where not facility."WMSFacility_IsDeleted"
), rows as (
  select jsonb_build_object(
    'recordId',task."WMSTask_ID",'taskType',task."WMSTask_TypeCode",'taskStatus',task."WMSTask_StatusCode",
    'quantity',task."WMSTask_Quantity",'completedQuantity',task."WMSTask_CompletedQuantity",'uomCode',task."WMSTask_UOMCode",
    'facilityId',facility."WMSFacility_ID",'facility',facility."WMSFacility_Code",'facilityName',facility."WMSFacility_Name",
    'orderId',warehouse_order."WMSOrder_ID",'orderNumber',warehouse_order."WMSOrder_OrderNumber",'orderType',warehouse_order."WMSOrder_TypeCode",
    'sourceTypeCode',warehouse_order."WMSOrder_SourceTypeCode",'sourceReference',warehouse_order."WMSOrder_SourceReference",'sourceRecordId',warehouse_order."WMSOrder_SourceRecordID",
    'customerOrgId',warehouse_order."WMSOrder_CustomerOrgID",'orderLineId',task."WMSTask_OrderLineID",
    'itemId',item."WMSItem_ID",'sku',item."WMSItem_SKU",'description',item."WMSItem_Description",
    'sourceLocationId',task."WMSTask_SourceLocationID",'sourceLocation',source_location."WMSLocation_Code",
    'targetLocationId',task."WMSTask_TargetLocationID",'targetLocation',target_location."WMSLocation_Code",
    'createdAt',task."WMSTask_CreatedAt",'completedAt',task."WMSTask_CompletedAt"
  ) value,task."WMSTask_CreatedAt" created_at
  from public."WMS_Tasks" task join company_facilities facility on facility."WMSFacility_ID"=task."WMSTask_FacilityID"
  left join public."WMS_Orders" warehouse_order on warehouse_order."WMSOrder_ID"=task."WMSTask_OrderID"
  left join public."WMS_Items" item on item."WMSItem_ID"=task."WMSTask_ItemID"
  left join public."WMS_Locations" source_location on source_location."WMSLocation_ID"=task."WMSTask_SourceLocationID"
  left join public."WMS_Locations" target_location on target_location."WMSLocation_ID"=task."WMSTask_TargetLocationID"
  where task."WMSTask_TypeCode" in ('putaway','pick') and (nullif(btrim(p_search),'') is null or concat_ws(' ',task."WMSTask_TypeCode",task."WMSTask_StatusCode",warehouse_order."WMSOrder_OrderNumber",warehouse_order."WMSOrder_SourceReference",item."WMSItem_SKU",item."WMSItem_Description",source_location."WMSLocation_Code",target_location."WMSLocation_Code") ilike '%'||btrim(p_search)||'%')
  order by task."WMSTask_CreatedAt" desc limit greatest(1,least(coalesce(p_take,10),25))
)
select case when coalesce((select allowed from permitted),false) then coalesce((select jsonb_agg(value order by created_at desc) from rows),'[]'::jsonb) else '[]'::jsonb end;
$$;
revoke all on function public.multideck_dexter_domain_warehouse_execution(uuid,text,integer) from public,anon,authenticated;

insert into public."sys_AIDexterDataDomains" ("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt") values
  ('warehouse_execution','Warehouse execution','Tenant-safe putaway and pick-task evidence with the typed operational source of the linked warehouse order.','multideck_dexter_domain_warehouse_execution',19,true,now())
on conflict ("AIDexterDomain_Code") do update set "AIDexterDomain_Name"=excluded."AIDexterDomain_Name","AIDexterDomain_Description"=excluded."AIDexterDomain_Description","AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now();
update public."sys_AIDexterDataDomains" set "AIDexterDomain_RequiredPermissionsJSON"='["Warehouse.Read"]'::jsonb,"AIDexterDomain_DataCategoriesJSON"='["business_record","warehouse_details"]'::jsonb,"AIDexterDomain_ScopeStrategy"='company' where "AIDexterDomain_Code"='warehouse_execution';

create or replace function public.multideck_dexter_action_release_warehouse_order(uuid,uuid,jsonb)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public._multideck_dexter_edge_action_only() $$;
revoke all on function public.multideck_dexter_action_release_warehouse_order(uuid,uuid,jsonb) from public,anon,authenticated;

insert into public."sys_AIDexterActions" ("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt") values
  ('release_warehouse_order','warehouse','Release warehouse order','Allocate available stock and create deterministic pick tasks for an exact outbound warehouse order.','multideck_dexter_action_release_warehouse_order','{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,107,true,now())
on conflict ("AIDexterAction_Code") do update set "AIDexterAction_Name"=excluded."AIDexterAction_Name","AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function","AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now();
update public."sys_AIDexterActions" set "AIDexterAction_RequiredPermissionsJSON"='["Warehouse.Write"]'::jsonb,"AIDexterAction_IntentFamily"='release_warehouse_order',"AIDexterAction_ScopeStrategy"='canonical',"AIDexterAction_HasExternalEffect"=true where "AIDexterAction_Code"='release_warehouse_order';

update public."sys_AIDexterActions" set "AIDexterAction_ParametersJSON"=
  jsonb_set(jsonb_set(jsonb_set("AIDexterAction_ParametersJSON",'{properties,sourceTypeCode}','{"type":["string","null"],"enum":["customer_purchase_order","asn","transfer","return","sales_order","return_to_supplier","disposal","manual_exception",null]}'::jsonb,true),'{properties,sourceReference}','{"type":["string","null"]}'::jsonb,true),'{properties,sourceRecordId}','{"type":["string","null"]}'::jsonb,true),
  "AIDexterAction_Description"='Create an inbound or outbound operational warehouse order with a typed customer source and item lines through Warehouse validation.',"AIDexterAction_UpdatedAt"=now()
where "AIDexterAction_Code"='create_warehouse_order';
update public."sys_AIDexterActions" set "AIDexterAction_ParametersJSON"=jsonb_set(jsonb_set("AIDexterAction_ParametersJSON",'{properties,facilityIds}','{"type":["array","null"],"items":{"type":"string"}}'::jsonb,true),'{properties,defaultFacilityId}','{"type":["string","null"]}'::jsonb,true),"AIDexterAction_UpdatedAt"=now() where "AIDexterAction_Code" in ('create_warehouse_item','update_warehouse_item');

-- Warehouse Watching remains deterministic and event-driven.  Existing order
-- triggers cover order status; this task trigger emits only real task changes.
create or replace function public._warehouse_task_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_old jsonb; v_new jsonb;
begin
  if tg_op='UPDATE' and old."WMSTask_StatusCode"=new."WMSTask_StatusCode" and old."WMSTask_CompletedQuantity"=new."WMSTask_CompletedQuantity" then return new; end if;
  select office."Company_ID" into v_company from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSTask_FacilityID";
  if v_company is null or not exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='warehouse' and watch."AIDexterWatch_StatusCode"='active' and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."WMSTask_ID")) then return new; end if;
  v_old:=case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('taskType',old."WMSTask_TypeCode",'status',old."WMSTask_StatusCode",'completedQuantity',old."WMSTask_CompletedQuantity") end;
  v_new:=jsonb_build_object('taskType',new."WMSTask_TypeCode",'status',new."WMSTask_StatusCode",'quantity',new."WMSTask_Quantity",'completedQuantity',new."WMSTask_CompletedQuantity",'facilityId',new."WMSTask_FacilityID",'orderId',new."WMSTask_OrderID");
  insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company,'warehouse','WMS_Tasks',new."WMSTask_ID",v_old,v_new);
  return new;
end;
$$;
revoke all on function public._warehouse_task_watch_signal() from public, anon, authenticated;
drop trigger if exists "TR_WMS_Tasks_watch_signal" on public."WMS_Tasks";
create trigger "TR_WMS_Tasks_watch_signal" after insert or update of "WMSTask_StatusCode","WMSTask_CompletedQuantity" on public."WMS_Tasks" for each row execute function public._warehouse_task_watch_signal();

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven warehouse order, inventory, exception, putaway and pick-task changes.',
  "AIDexterWatchCapability_FieldsJSON"=coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["taskType","completedQuantity"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='warehouse';

-- Keep Dexter's customer-facing names aligned with the Warehouse interface.
-- The established domain and action codes stay stable for compatibility.
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Name"='Expected receipts',
  "AIDexterDomain_Description"='Customer-provided expected inbound goods, their customer PO reference, supplier, dates, reference totals, matched warehouse items and linked inbound warehouse order.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='purchase_orders';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Name"='Expected receipts',
  "AIDexterWatchCapability_Description"='Expected receipt status, stock owner, expected goods, source supplier, reference values, expected delivery and linked inbound warehouse order changes.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='purchase_orders';

update public."sys_AIDexterActions" set
  "AIDexterAction_Name"='Create expected receipt',
  "AIDexterAction_Description"='Create a reviewed expected receipt from customer-provided inbound details through the Warehouse Edge Function. Approval is always required.',
  "AIDexterAction_UpdatedAt"=now()
where "AIDexterAction_Code"='create_purchase_order';

commit;
