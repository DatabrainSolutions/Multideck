-- Warehouse inventory operations: product quantity semantics, handling units,
-- pallet consolidation, sampling, location discrepancies and immutable audit.
-- All mutation functions are service-role-only and are called by the authenticated
-- Warehouse Edge Function after it resolves the tenant user and facility scope.

alter table public."WMS_Items"
  add column if not exists "WMSItem_QuantityBasisCode" varchar(20) not null default 'count',
  add column if not exists "WMSItem_QuantityScale" smallint not null default 0,
  add column if not exists "WMSItem_MinimumMovementQuantity" numeric(18,6) not null default 1,
  add column if not exists "WMSItem_AllowsFractionalQuantity" boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='CK_WMS_Items_quantity_basis') then
    alter table public."WMS_Items" add constraint "CK_WMS_Items_quantity_basis"
      check ("WMSItem_QuantityBasisCode" in ('count','weight','volume'));
  end if;
  if not exists (select 1 from pg_constraint where conname='CK_WMS_Items_quantity_scale') then
    alter table public."WMS_Items" add constraint "CK_WMS_Items_quantity_scale"
      check ("WMSItem_QuantityScale" between 0 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname='CK_WMS_Items_minimum_movement') then
    alter table public."WMS_Items" add constraint "CK_WMS_Items_minimum_movement"
      check ("WMSItem_MinimumMovementQuantity" > 0);
  end if;
end $$;

alter table public."WMS_HandlingUnits"
  add column if not exists "WMSHU_LifecycleStatusCode" varchar(30) not null default 'open',
  add column if not exists "WMSHU_ConsumedIntoHU_ID" uuid,
  add column if not exists "WMSHU_ConsumedAt" timestamptz,
  add column if not exists "WMSHU_Version" integer not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='CK_WMS_HandlingUnits_lifecycle') then
    alter table public."WMS_HandlingUnits" add constraint "CK_WMS_HandlingUnits_lifecycle"
      check ("WMSHU_LifecycleStatusCode" in ('open','sealed','consumed','closed','investigation'));
  end if;
  if not exists (select 1 from pg_constraint where conname='FK_WMS_HandlingUnits_consumed_into') then
    alter table public."WMS_HandlingUnits" add constraint "FK_WMS_HandlingUnits_consumed_into"
      foreign key ("WMSHU_ConsumedIntoHU_ID") references public."WMS_HandlingUnits"("WMSHU_ID");
  end if;
end $$;

alter table public."WMS_InventoryTransactions"
  add column if not exists "WMSTransaction_MovementGroupID" uuid,
  add column if not exists "WMSTransaction_ReasonCode" varchar(80),
  add column if not exists "WMSTransaction_IdempotencyKey" uuid;

alter table public."WMS_Exceptions"
  add column if not exists "WMSException_ExpectedLocationID" uuid,
  add column if not exists "WMSException_ActualLocationID" uuid,
  add column if not exists "WMSException_MovementGroupID" uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='FK_WMS_Exceptions_expected_location') then
    alter table public."WMS_Exceptions" add constraint "FK_WMS_Exceptions_expected_location"
      foreign key ("WMSException_ExpectedLocationID") references public."WMS_Locations"("WMSLocation_ID");
  end if;
  if not exists (select 1 from pg_constraint where conname='FK_WMS_Exceptions_actual_location') then
    alter table public."WMS_Exceptions" add constraint "FK_WMS_Exceptions_actual_location"
      foreign key ("WMSException_ActualLocationID") references public."WMS_Locations"("WMSLocation_ID");
  end if;
end $$;

create table if not exists public."WMS_InventoryOperations" (
  "WMSOperation_ID" uuid primary key default gen_random_uuid(),
  "WMSOperation_RequestID" uuid not null unique,
  "WMSOperation_FacilityID" uuid not null references public."WMS_Facilities"("WMSFacility_ID"),
  "WMSOperation_ActionCode" varchar(60) not null,
  "WMSOperation_MovementGroupID" uuid not null,
  "WMSOperation_PayloadJSON" jsonb not null default '{}'::jsonb,
  "WMSOperation_ResultJSON" jsonb,
  "WMSOperation_CreatedAt" timestamptz not null default now(),
  "WMSOperation_CreatedBy" uuid references public."cmp_Users"("User_ID"),
  constraint "CK_WMS_InventoryOperations_payload" check (jsonb_typeof("WMSOperation_PayloadJSON")='object'),
  constraint "CK_WMS_InventoryOperations_result" check ("WMSOperation_ResultJSON" is null or jsonb_typeof("WMSOperation_ResultJSON")='object')
);

create index if not exists "IX_WMS_InventoryOperations_facility_created"
  on public."WMS_InventoryOperations"("WMSOperation_FacilityID","WMSOperation_CreatedAt" desc);
create index if not exists "IX_WMS_InventoryTransactions_movement_group"
  on public."WMS_InventoryTransactions"("WMSTransaction_MovementGroupID","WMSTransaction_CreatedAt");
create index if not exists "IX_WMS_HandlingUnits_open_location"
  on public."WMS_HandlingUnits"("WMSHU_FacilityID","WMSHU_LocationID")
  where not "WMSHU_IsDeleted" and "WMSHU_LifecycleStatusCode" in ('open','sealed','investigation');

alter table public."WMS_InventoryOperations" enable row level security;
revoke all on table public."WMS_InventoryOperations" from public,anon,authenticated;

insert into public."sys_WMSHandlingUnitTypes"
  ("WMSHUType_Code","WMSHUType_Name","WMSHUType_Description","WMSHUType_IsContainer","WMSHUType_IsActive","WMSHUType_SortOrder")
values
  ('pallet','Pallet','A pallet containing one or more stock lines or smaller handling units.',true,true,10),
  ('carton','Carton','A carton or box that may sit loose or on a pallet.',true,true,20),
  ('ibc','IBC','An intermediate bulk container whose contents are measured separately.',true,true,30),
  ('drum','Drum','A drum containing liquid, powder or granular stock.',true,true,40),
  ('tote','Tote','A reusable warehouse tote or small-parts container.',true,true,50),
  ('loose','Loose stock','A labelled stock unit without outer pallet packaging.',false,true,60)
on conflict ("WMSHUType_Code") do update set
  "WMSHUType_Name"=excluded."WMSHUType_Name","WMSHUType_Description"=excluded."WMSHUType_Description",
  "WMSHUType_IsActive"=true,"WMSHUType_SortOrder"=excluded."WMSHUType_SortOrder";

insert into public."sys_WMSInventoryStatuses"
  ("WMSInventoryStatus_Code","WMSInventoryStatus_Name","WMSInventoryStatus_Description","WMSInventoryStatus_IsAvailableCandidate","WMSInventoryStatus_IsActive","WMSInventoryStatus_SortOrder")
values
  ('sample','Sample','Stock isolated for quality or customer sampling.',false,true,45),
  ('unlocated','Unlocated','Stock expected on hand but not currently located.',false,true,46)
on conflict ("WMSInventoryStatus_Code") do update set
  "WMSInventoryStatus_Name"=excluded."WMSInventoryStatus_Name","WMSInventoryStatus_Description"=excluded."WMSInventoryStatus_Description",
  "WMSInventoryStatus_IsAvailableCandidate"=false,"WMSInventoryStatus_IsActive"=true;

insert into public."sys_WMSTransactionTypes"
  ("WMSTransactionType_Code","WMSTransactionType_Name","WMSTransactionType_Description","WMSTransactionType_AffectsOnHand","WMSTransactionType_DefaultSign","WMSTransactionType_IsActive","WMSTransactionType_SortOrder")
values
  ('split','Split','Part of a stock balance was separated into another handling unit or location.',false,0,true,31),
  ('consolidate','Consolidate','Stock was combined into a target pallet or handling unit.',false,0,true,32),
  ('sample','Sample withdrawal','Stock was withdrawn for sampling.',true,-1,true,51),
  ('location_exception','Location exception','Stock was placed under investigation after a location discrepancy.',false,0,true,81)
on conflict ("WMSTransactionType_Code") do update set
  "WMSTransactionType_Name"=excluded."WMSTransactionType_Name","WMSTransactionType_Description"=excluded."WMSTransactionType_Description",
  "WMSTransactionType_IsActive"=true;

insert into public."sys_WMSLocationTypes"
  ("WMSLocationType_Code","WMSLocationType_Name","WMSLocationType_Description","WMSLocationType_IsPickable","WMSLocationType_IsActive","WMSLocationType_SortOrder")
values ('investigation','Investigation','System-managed virtual location for stock whose physical position is unresolved.',false,true,80)
on conflict ("WMSLocationType_Code") do update set "WMSLocationType_IsActive"=true;

insert into public."sys_WMSExceptionTypes"
  ("WMSExceptionType_Code","WMSExceptionType_Name","WMSExceptionType_Description","WMSExceptionType_DefaultSeverityCode","WMSExceptionType_IsActive","WMSExceptionType_SortOrder")
values
  ('location_empty','Expected location empty','The scanned location was physically empty while Multideck expected stock.','high',true,10),
  ('unexpected_stock','Unexpected stock','Stock was found in a location where it was not expected.','high',true,20),
  ('location_override','Location override','The actual scanned location differed from the planned location.','medium',true,30),
  ('stock_damage','Stock damage','Damage was reported against stock already on hand.','high',true,40),
  ('stock_shortage','Stock shortage','A physical quantity was lower than the recorded quantity.','high',true,50),
  ('sample_withdrawal','Sample withdrawal','A controlled sample was removed from warehouse stock.','low',true,60)
on conflict ("WMSExceptionType_Code") do update set
  "WMSExceptionType_Name"=excluded."WMSExceptionType_Name","WMSExceptionType_Description"=excluded."WMSExceptionType_Description",
  "WMSExceptionType_DefaultSeverityCode"=excluded."WMSExceptionType_DefaultSeverityCode","WMSExceptionType_IsActive"=true;

insert into public."sys_WMSHoldTypes"
  ("WMSHoldType_Code","WMSHoldType_Name","WMSHoldType_Description","WMSHoldType_IsBlocking","WMSHoldType_IsActive","WMSHoldType_SortOrder")
values ('location_investigation','Location investigation','Stock is blocked while its physical location is investigated.',true,true,10)
on conflict ("WMSHoldType_Code") do update set "WMSHoldType_IsActive"=true;

insert into public."sys_WMSHoldStatuses"
  ("WMSHoldStatus_Code","WMSHoldStatus_Name","WMSHoldStatus_Description","WMSHoldStatus_IsOpen","WMSHoldStatus_IsBlocking","WMSHoldStatus_IsActive","WMSHoldStatus_SortOrder")
values
  ('open','Open','The hold is active and blocks stock use.',true,true,true,10),
  ('released','Released','The hold was resolved and released.',false,false,true,20)
on conflict ("WMSHoldStatus_Code") do update set "WMSHoldStatus_IsActive"=true;

insert into public."sys_WMSAdjustmentStatuses"
  ("WMSAdjustmentStatus_Code","WMSAdjustmentStatus_Name","WMSAdjustmentStatus_Description","WMSAdjustmentStatus_IsPosted","WMSAdjustmentStatus_IsFinal","WMSAdjustmentStatus_IsActive","WMSAdjustmentStatus_SortOrder")
values
  ('draft','Draft','The adjustment is awaiting review.',false,false,true,10),
  ('posted','Posted','The approved adjustment has been posted to inventory.',true,true,true,20),
  ('cancelled','Cancelled','The adjustment was cancelled without changing stock.',false,true,true,30)
on conflict ("WMSAdjustmentStatus_Code") do update set "WMSAdjustmentStatus_IsActive"=true;

insert into public."sys_WMSCycleCountStatuses"
  ("WMSCycleCountStatus_Code","WMSCycleCountStatus_Name","WMSCycleCountStatus_Description","WMSCycleCountStatus_IsFinal","WMSCycleCountStatus_IsActive","WMSCycleCountStatus_SortOrder")
values
  ('planned','Planned','The count or investigation is ready to be performed.',false,true,10),
  ('in_progress','In progress','The count is being performed.',false,true,20),
  ('complete','Complete','The count and any resulting review are complete.',true,true,30)
on conflict ("WMSCycleCountStatus_Code") do update set "WMSCycleCountStatus_IsActive"=true;

create or replace function public._warehouse_edge_sync_hu_contents(p_hu_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_hu_id is null then return; end if;
  delete from public."WMS_HandlingUnitContents" where "WMSHUContent_HU_ID"=p_hu_id;
  insert into public."WMS_HandlingUnitContents" (
    "WMSHUContent_ID","WMSHUContent_HU_ID","WMSHUContent_ItemID","WMSHUContent_LotID","WMSHUContent_SerialID",
    "WMSHUContent_Quantity","WMSHUContent_UOMCode","WMSHUContent_InventoryStatusCode","WMSHUContent_CustomsStatusCode","WMSHUContent_CreatedAt"
  )
  select gen_random_uuid(),p_hu_id,"WMSBalance_ItemID","WMSBalance_LotID","WMSBalance_SerialID",
    sum("WMSBalance_OnHandQuantity"),"WMSBalance_UOMCode","WMSBalance_InventoryStatusCode","WMSBalance_CustomsStatusCode",now()
  from public."WMS_InventoryBalances"
  where "WMSBalance_HU_ID"=p_hu_id and "WMSBalance_OnHandQuantity">0
  group by "WMSBalance_ItemID","WMSBalance_LotID","WMSBalance_SerialID","WMSBalance_UOMCode","WMSBalance_InventoryStatusCode","WMSBalance_CustomsStatusCode";
end; $$;

revoke all on function public._warehouse_edge_sync_hu_contents(uuid) from public,anon,authenticated;
grant execute on function public._warehouse_edge_sync_hu_contents(uuid) to service_role;

create or replace function public._warehouse_edge_validate_quantity(p_item_id uuid, p_quantity numeric)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_basis text;
  v_scale integer;
  v_minimum numeric;
  v_fractional boolean;
begin
  select "WMSItem_QuantityBasisCode","WMSItem_QuantityScale","WMSItem_MinimumMovementQuantity","WMSItem_AllowsFractionalQuantity"
  into v_basis,v_scale,v_minimum,v_fractional from public."WMS_Items" where "WMSItem_ID"=p_item_id and not "WMSItem_IsDeleted";
  if not found then raise exception 'WMS404: This product does not exist.'; end if;
  if p_quantity<v_minimum or round(p_quantity,v_scale)<>p_quantity then raise exception 'WMS400: The quantity does not match this product''s minimum movement or precision.'; end if;
  if v_basis='count' and not v_fractional and trunc(p_quantity)<>p_quantity then raise exception 'WMS400: This counted product must move in whole units.'; end if;
end; $$;

revoke all on function public._warehouse_edge_validate_quantity(uuid,numeric) from public,anon,authenticated;
grant execute on function public._warehouse_edge_validate_quantity(uuid,numeric) to service_role;

create or replace function public.warehouse_edge_inventory_mutation(
  p_action text,
  p_payload jsonb,
  p_actor_user_id uuid,
  p_allowed_facility_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_action text:=lower(btrim(p_action));
  v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid;
  v_facility_id uuid:=nullif(p_payload->>'facilityId','')::uuid;
  v_group_id uuid:=gen_random_uuid();
  v_now timestamptz:=now();
  v_result jsonb;
  v_existing jsonb;
  v_balance public."WMS_InventoryBalances"%rowtype;
  v_hu public."WMS_HandlingUnits"%rowtype;
  v_target_hu public."WMS_HandlingUnits"%rowtype;
  v_location public."WMS_Locations"%rowtype;
  v_target_location public."WMS_Locations"%rowtype;
  v_quantity numeric;
  v_before numeric;
  v_after numeric;
  v_destination_balance_id uuid;
  v_hu_id uuid;
  v_target_hu_id uuid;
  v_location_id uuid;
  v_target_location_id uuid;
  v_exception_id uuid;
  v_count_plan_id uuid;
  v_adjustment_id uuid;
  v_transaction_id uuid;
  v_code text;
  v_reason text;
  v_status text;
  v_resolution text;
  v_entry jsonb;
  v_affected jsonb:='[]'::jsonb;
  v_source_hu_ids uuid[];
begin
  if p_actor_user_id is null then raise exception 'WMS403: Inventory operations are reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  if v_facility_id is null or not (v_facility_id=any(p_allowed_facility_ids)) then raise exception 'WMS403: Choose a warehouse in your workspace.'; end if;

  select "WMSOperation_ResultJSON" into v_existing from public."WMS_InventoryOperations"
  where "WMSOperation_RequestID"=v_request_id;
  if found then return v_existing; end if;

  insert into public."WMS_InventoryOperations" (
    "WMSOperation_RequestID","WMSOperation_FacilityID","WMSOperation_ActionCode","WMSOperation_MovementGroupID",
    "WMSOperation_PayloadJSON","WMSOperation_CreatedAt","WMSOperation_CreatedBy"
  ) values (v_request_id,v_facility_id,v_action,v_group_id,p_payload,v_now,p_actor_user_id);

  if v_action='create_hu' then
    v_target_location_id:=nullif(p_payload->>'locationId','')::uuid;
    if v_target_location_id is not null then
      select * into v_target_location from public."WMS_Locations" where "WMSLocation_ID"=v_target_location_id and "WMSLocation_FacilityID"=v_facility_id and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted";
      if not found then raise exception 'WMS400: Choose an active location in this warehouse.'; end if;
    end if;
    if not exists(select 1 from public."sys_WMSHandlingUnitTypes" where "WMSHUType_Code"=lower(btrim(p_payload->>'typeCode')) and "WMSHUType_IsActive") then raise exception 'WMS400: Choose a valid warehouse object type.'; end if;
    v_hu_id:=gen_random_uuid();
    v_code:=upper(coalesce(nullif(btrim(p_payload->>'code'),''),'HU-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0')));
    insert into public."WMS_HandlingUnits" (
      "WMSHU_ID","WMSHU_FacilityID","WMSHU_ParentHU_ID","WMSHU_TypeCode","WMSHU_Code","WMSHU_SSCC","WMSHU_ExternalReference",
      "WMSHU_CustomerOrgID","WMSHU_LocationID","WMSHU_InventoryStatusCode","WMSHU_CustomsStatusCode","WMSHU_LifecycleStatusCode",
      "WMSHU_GrossWeightKG","WMSHU_NetWeightKG","WMSHU_VolumeCBM","WMSHU_CreatedAt","WMSHU_CreatedBy","WMSHU_UpdatedAt","WMSHU_IsDeleted"
    ) values (
      v_hu_id,v_facility_id,nullif(p_payload->>'parentHandlingUnitId','')::uuid,lower(btrim(p_payload->>'typeCode')),v_code,
      nullif(btrim(p_payload->>'sscc'),''),nullif(btrim(p_payload->>'externalReference'),''),nullif(p_payload->>'customerOrgId','')::uuid,
      v_target_location_id,'available',coalesce(nullif(btrim(p_payload->>'customsStatusCode'),''),'free_circulation'),'open',
      nullif(p_payload->>'grossWeightKg','')::numeric,nullif(p_payload->>'netWeightKg','')::numeric,nullif(p_payload->>'volumeCbm','')::numeric,
      v_now,p_actor_user_id,v_now,false
    );
    insert into public."WMS_HandlingUnitEvents" ("WMSHUEvent_ID","WMSHUEvent_HU_ID","WMSHUEvent_EventTypeCode","WMSHUEvent_EventAt","WMSHUEvent_LocationID","WMSHUEvent_Notes","WMSHUEvent_MetadataJSON","WMSHUEvent_CreatedBy")
      values(gen_random_uuid(),v_hu_id,'created',v_now,v_target_location_id,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('movementGroupId',v_group_id),p_actor_user_id);
    v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'handlingUnitId',v_hu_id,'code',v_code);

  elsif v_action='move_balance' then
    select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=(p_payload->>'balanceId')::uuid and "WMSBalance_FacilityID"=v_facility_id for update;
    if not found then raise exception 'WMS404: This stock balance does not exist in the warehouse.'; end if;
    v_target_location_id:=(p_payload->>'targetLocationId')::uuid;
    select * into v_target_location from public."WMS_Locations" where "WMSLocation_ID"=v_target_location_id and "WMSLocation_FacilityID"=v_facility_id and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted";
    if not found or v_target_location."WMSLocation_StatusCode"<>'available' then raise exception 'WMS400: Choose an available destination location.'; end if;
    if v_balance."WMSBalance_IsBonded" and not v_target_location."WMSLocation_AllowsBondedStock" then raise exception 'WMS409: Bonded stock cannot be moved into that location.'; end if;
    v_quantity:=(p_payload->>'quantity')::numeric;
    if v_quantity<=0 or v_quantity>v_balance."WMSBalance_OnHandQuantity" then raise exception 'WMS400: Check the movement quantity.'; end if;
    perform public._warehouse_edge_validate_quantity(v_balance."WMSBalance_ItemID",v_quantity);
    if (v_balance."WMSBalance_ReservedQuantity">0 or v_balance."WMSBalance_AllocatedQuantity">0) and v_quantity<v_balance."WMSBalance_OnHandQuantity" then raise exception 'WMS409: Allocated or reserved stock must be moved as a complete balance.'; end if;
    v_reason:=nullif(btrim(p_payload->>'reasonCode'),'');
    v_location_id:=coalesce(nullif(p_payload->>'actualSourceLocationId','')::uuid,v_balance."WMSBalance_LocationID");
    if v_location_id is distinct from v_balance."WMSBalance_LocationID" and nullif(btrim(p_payload->>'overrideReason'),'') is null then raise exception 'WMS400: Enter a reason for overriding the system source location.'; end if;
    if not exists(select 1 from public."WMS_Locations" where "WMSLocation_ID"=v_location_id and "WMSLocation_FacilityID"=v_facility_id and not "WMSLocation_IsDeleted") then raise exception 'WMS400: Scan a source location in this warehouse.'; end if;
    v_target_hu_id:=nullif(p_payload->>'targetHandlingUnitId','')::uuid;
    if v_target_hu_id is not null then
      select * into v_target_hu from public."WMS_HandlingUnits" where "WMSHU_ID"=v_target_hu_id and "WMSHU_FacilityID"=v_facility_id and not "WMSHU_IsDeleted" and "WMSHU_LifecycleStatusCode" in ('open','sealed') for update;
      if not found or (v_target_hu."WMSHU_CustomerOrgID" is not null and v_target_hu."WMSHU_CustomerOrgID" is distinct from v_balance."WMSBalance_CustomerOrgID") then raise exception 'WMS409: The target warehouse object is not compatible with this stock.'; end if;
    end if;
    v_before:=v_balance."WMSBalance_OnHandQuantity"; v_after:=v_before-v_quantity;
    update public."WMS_InventoryBalances" set
      "WMSBalance_OnHandQuantity"=v_after,
      "WMSBalance_HeldQuantity"=greatest(0,"WMSBalance_HeldQuantity"-case when "WMSBalance_InventoryStatusCode"='available' then 0 else v_quantity end),
      "WMSBalance_AvailableQuantity"=greatest(0,"WMSBalance_AvailableQuantity"-case when "WMSBalance_InventoryStatusCode"='available' then v_quantity else 0 end),
      "WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
    v_destination_balance_id:=gen_random_uuid();
    insert into public."WMS_InventoryBalances" (
      "WMSBalance_ID","WMSBalance_FacilityID","WMSBalance_CustomerOrgID","WMSBalance_ItemID","WMSBalance_LocationID","WMSBalance_LotID","WMSBalance_SerialID","WMSBalance_HU_ID",
      "WMSBalance_InventoryStatusCode","WMSBalance_CustomsStatusCode","WMSBalance_UOMCode","WMSBalance_OnHandQuantity","WMSBalance_ReservedQuantity","WMSBalance_AllocatedQuantity",
      "WMSBalance_HeldQuantity","WMSBalance_AvailableQuantity","WMSBalance_FirstReceiptAt","WMSBalance_LastMovementAt","WMSBalance_IsBonded","WMSBalance_CustomsEntryReference",
      "WMSBalance_StockValue","WMSBalance_CurrencyCode","WMSBalance_MetadataJSON","WMSBalance_CreatedAt","WMSBalance_UpdatedAt"
    ) values (
      v_destination_balance_id,v_facility_id,v_balance."WMSBalance_CustomerOrgID",v_balance."WMSBalance_ItemID",v_target_location_id,v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_target_hu_id,
      v_balance."WMSBalance_InventoryStatusCode",v_balance."WMSBalance_CustomsStatusCode",v_balance."WMSBalance_UOMCode",v_quantity,0,0,
      case when v_balance."WMSBalance_InventoryStatusCode"='available' then 0 else v_quantity end,case when v_balance."WMSBalance_InventoryStatusCode"='available' then v_quantity else 0 end,
      v_balance."WMSBalance_FirstReceiptAt",v_now,v_balance."WMSBalance_IsBonded",v_balance."WMSBalance_CustomsEntryReference",v_balance."WMSBalance_StockValue",v_balance."WMSBalance_CurrencyCode",
      jsonb_build_object('sourceBalanceId',v_balance."WMSBalance_ID",'movementGroupId',v_group_id),v_now,v_now
    );
    v_transaction_id:=gen_random_uuid();
    insert into public."WMS_InventoryTransactions" (
      "WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID",
      "WMSTransaction_FromLocationID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode",
      "WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID",
      "WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy"
    ) values (
      v_transaction_id,v_facility_id,v_balance."WMSBalance_ID",case when v_quantity<v_before then 'split' else 'move' end,v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",
      v_location_id,v_target_location_id,v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",coalesce(v_target_hu_id,v_balance."WMSBalance_HU_ID"),v_quantity,v_balance."WMSBalance_UOMCode",
      v_before,v_after,v_balance."WMSBalance_InventoryStatusCode",v_balance."WMSBalance_CustomsStatusCode",'WMS_InventoryOperations',v_request_id,
      'MOV-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('destinationBalanceId',v_destination_balance_id,'sourceHandlingUnitId',v_balance."WMSBalance_HU_ID",'targetHandlingUnitId',v_target_hu_id,'overrideReason',nullif(btrim(p_payload->>'overrideReason'),'')),
      v_group_id,coalesce(v_reason,'move'),v_request_id,v_now,p_actor_user_id
    );
    if v_location_id is distinct from v_balance."WMSBalance_LocationID" then
      insert into public."WMS_Exceptions" ("WMSException_ID","WMSException_FacilityID","WMSException_TypeCode","WMSException_StatusCode","WMSException_SeverityCode","WMSException_BalanceID","WMSException_Title","WMSException_Description","WMSException_RaisedAt","WMSException_RaisedBy","WMSException_MetadataJSON","WMSException_ExpectedLocationID","WMSException_ActualLocationID","WMSException_MovementGroupID")
      values(gen_random_uuid(),v_facility_id,'location_override','open','medium',v_destination_balance_id,'Location override recorded',nullif(btrim(p_payload->>'overrideReason'),''),v_now,p_actor_user_id,jsonb_build_object('requestId',v_request_id),v_balance."WMSBalance_LocationID",v_location_id,v_group_id);
    end if;
    perform public._warehouse_edge_sync_hu_contents(v_balance."WMSBalance_HU_ID"); perform public._warehouse_edge_sync_hu_contents(v_target_hu_id);
    v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'transactionId',v_transaction_id,'balanceId',v_destination_balance_id);

  elsif v_action='move_hu' then
    select * into v_hu from public."WMS_HandlingUnits" where "WMSHU_ID"=(p_payload->>'handlingUnitId')::uuid and "WMSHU_FacilityID"=v_facility_id and not "WMSHU_IsDeleted" and "WMSHU_LifecycleStatusCode" in ('open','sealed') for update;
    if not found then raise exception 'WMS404: This warehouse object is not available.'; end if;
    v_target_location_id:=(p_payload->>'targetLocationId')::uuid;
    select * into v_target_location from public."WMS_Locations" where "WMSLocation_ID"=v_target_location_id and "WMSLocation_FacilityID"=v_facility_id and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted";
    if not found or v_target_location."WMSLocation_StatusCode"<>'available' then raise exception 'WMS400: Choose an available destination location.'; end if;
    v_location_id:=coalesce(nullif(p_payload->>'actualSourceLocationId','')::uuid,v_hu."WMSHU_LocationID");
    if v_location_id is distinct from v_hu."WMSHU_LocationID" and nullif(btrim(p_payload->>'overrideReason'),'') is null then raise exception 'WMS400: Enter a reason for overriding the system source location.'; end if;
    for v_balance in select * from public."WMS_InventoryBalances" where "WMSBalance_HU_ID"=v_hu."WMSHU_ID" and "WMSBalance_OnHandQuantity">0 for update loop
      if v_balance."WMSBalance_IsBonded" and not v_target_location."WMSLocation_AllowsBondedStock" then raise exception 'WMS409: Bonded stock cannot be moved into that location.'; end if;
      update public."WMS_InventoryBalances" set "WMSBalance_LocationID"=v_target_location_id,"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy")
      values(gen_random_uuid(),v_facility_id,v_balance."WMSBalance_ID",'move',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_location_id,v_target_location_id,v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_hu."WMSHU_ID",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_InventoryStatusCode",v_balance."WMSBalance_CustomsStatusCode",'WMS_InventoryOperations',v_request_id,'MOV-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('systemSourceLocationId',v_hu."WMSHU_LocationID",'overrideReason',nullif(btrim(p_payload->>'overrideReason'),'')),v_group_id,coalesce(nullif(btrim(p_payload->>'reasonCode'),''),'move_hu'),v_request_id,v_now,p_actor_user_id);
    end loop;
    update public."WMS_HandlingUnits" set "WMSHU_LocationID"=v_target_location_id,"WMSHU_UpdatedAt"=v_now,"WMSHU_Version"="WMSHU_Version"+1 where "WMSHU_ID"=v_hu."WMSHU_ID";
    insert into public."WMS_HandlingUnitEvents" ("WMSHUEvent_ID","WMSHUEvent_HU_ID","WMSHUEvent_EventTypeCode","WMSHUEvent_EventAt","WMSHUEvent_LocationID","WMSHUEvent_Notes","WMSHUEvent_MetadataJSON","WMSHUEvent_CreatedBy") values(gen_random_uuid(),v_hu."WMSHU_ID",'moved',v_now,v_target_location_id,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('fromLocationId',v_hu."WMSHU_LocationID",'movementGroupId',v_group_id,'overrideReason',nullif(btrim(p_payload->>'overrideReason'),'')),p_actor_user_id);
    if v_location_id is distinct from v_hu."WMSHU_LocationID" then
      insert into public."WMS_Exceptions" ("WMSException_ID","WMSException_FacilityID","WMSException_TypeCode","WMSException_StatusCode","WMSException_SeverityCode","WMSException_Title","WMSException_Description","WMSException_RaisedAt","WMSException_RaisedBy","WMSException_MetadataJSON","WMSException_ExpectedLocationID","WMSException_ActualLocationID","WMSException_MovementGroupID")
      values(gen_random_uuid(),v_facility_id,'location_override','open','medium','Warehouse object location override recorded',nullif(btrim(p_payload->>'overrideReason'),''),v_now,p_actor_user_id,jsonb_build_object('requestId',v_request_id,'handlingUnitId',v_hu."WMSHU_ID"),v_hu."WMSHU_LocationID",v_location_id,v_group_id);
    end if;
    v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'handlingUnitId',v_hu."WMSHU_ID");

  elsif v_action='consolidate' then
    select array_agg(value::uuid) into v_source_hu_ids from jsonb_array_elements_text(p_payload->'sourceHandlingUnitIds');
    v_target_hu_id:=(p_payload->>'targetHandlingUnitId')::uuid;
    select * into v_target_hu from public."WMS_HandlingUnits" where "WMSHU_ID"=v_target_hu_id and "WMSHU_FacilityID"=v_facility_id and not "WMSHU_IsDeleted" and "WMSHU_LifecycleStatusCode"='open' for update;
    if not found or coalesce(array_length(v_source_hu_ids,1),0)=0 then raise exception 'WMS400: Choose a target and at least one source warehouse object.'; end if;
    if v_target_hu_id=any(v_source_hu_ids) then raise exception 'WMS400: The target pallet cannot also be a source pallet.'; end if;
    for v_hu in select * from public."WMS_HandlingUnits" where "WMSHU_ID"=any(v_source_hu_ids) order by "WMSHU_ID" for update loop
      if v_hu."WMSHU_FacilityID"<>v_facility_id or v_hu."WMSHU_LifecycleStatusCode"<>'open' or v_hu."WMSHU_CustomerOrgID" is distinct from v_target_hu."WMSHU_CustomerOrgID" then raise exception 'WMS409: Source pallets must be open and belong to the same warehouse and customer as the target.'; end if;
      for v_balance in select * from public."WMS_InventoryBalances" where "WMSBalance_HU_ID"=v_hu."WMSHU_ID" and "WMSBalance_OnHandQuantity">0 for update loop
        update public."WMS_InventoryBalances" set "WMSBalance_HU_ID"=v_target_hu_id,"WMSBalance_LocationID"=v_target_hu."WMSHU_LocationID","WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
        insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy")
        values(gen_random_uuid(),v_facility_id,v_balance."WMSBalance_ID",'consolidate',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_hu."WMSHU_LocationID",v_target_hu."WMSHU_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_target_hu_id,v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_InventoryStatusCode",v_balance."WMSBalance_CustomsStatusCode",'WMS_HandlingUnits',v_hu."WMSHU_ID",'CON-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('sourceHandlingUnitId',v_hu."WMSHU_ID",'targetHandlingUnitId',v_target_hu_id),v_group_id,'pallet_consolidation',v_request_id,v_now,p_actor_user_id);
      end loop;
      update public."WMS_HandlingUnits" set "WMSHU_LifecycleStatusCode"='consumed',"WMSHU_ConsumedIntoHU_ID"=v_target_hu_id,"WMSHU_ConsumedAt"=v_now,"WMSHU_LocationID"=null,"WMSHU_UpdatedAt"=v_now,"WMSHU_Version"="WMSHU_Version"+1 where "WMSHU_ID"=v_hu."WMSHU_ID";
      insert into public."WMS_HandlingUnitEvents" ("WMSHUEvent_ID","WMSHUEvent_HU_ID","WMSHUEvent_EventTypeCode","WMSHUEvent_EventAt","WMSHUEvent_LocationID","WMSHUEvent_Notes","WMSHUEvent_MetadataJSON","WMSHUEvent_CreatedBy") values(gen_random_uuid(),v_hu."WMSHU_ID",'consumed',v_now,v_target_hu."WMSHU_LocationID",nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('targetHandlingUnitId',v_target_hu_id,'movementGroupId',v_group_id),p_actor_user_id);
      perform public._warehouse_edge_sync_hu_contents(v_hu."WMSHU_ID");
    end loop;
    update public."WMS_HandlingUnits" set "WMSHU_UpdatedAt"=v_now,"WMSHU_Version"="WMSHU_Version"+1 where "WMSHU_ID"=v_target_hu_id;
    insert into public."WMS_HandlingUnitEvents" ("WMSHUEvent_ID","WMSHUEvent_HU_ID","WMSHUEvent_EventTypeCode","WMSHUEvent_EventAt","WMSHUEvent_LocationID","WMSHUEvent_Notes","WMSHUEvent_MetadataJSON","WMSHUEvent_CreatedBy") values(gen_random_uuid(),v_target_hu_id,'consolidated',v_now,v_target_hu."WMSHU_LocationID",nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('sourceHandlingUnitIds',to_jsonb(v_source_hu_ids),'movementGroupId',v_group_id),p_actor_user_id);
    perform public._warehouse_edge_sync_hu_contents(v_target_hu_id);
    v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'targetHandlingUnitId',v_target_hu_id,'sourceHandlingUnitIds',to_jsonb(v_source_hu_ids));

  elsif v_action in ('change_status','sample') then
    select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=(p_payload->>'balanceId')::uuid and "WMSBalance_FacilityID"=v_facility_id for update;
    if not found then raise exception 'WMS404: This stock balance does not exist.'; end if;
    v_quantity:=(p_payload->>'quantity')::numeric; v_reason:=nullif(btrim(p_payload->>'reasonCode'),'');
    if v_quantity<=0 or v_quantity>v_balance."WMSBalance_OnHandQuantity" then raise exception 'WMS400: Check the quantity.'; end if;
    perform public._warehouse_edge_validate_quantity(v_balance."WMSBalance_ItemID",v_quantity);
    if v_reason is null then raise exception 'WMS400: Choose a reason for this stock change.'; end if;
    if v_balance."WMSBalance_ReservedQuantity">0 or v_balance."WMSBalance_AllocatedQuantity">0 then raise exception 'WMS409: Release allocated or reserved stock before changing it.'; end if;
    v_status:=case when v_action='sample' and coalesce(p_payload->>'disposition','removed')='onsite' then 'sample' else lower(btrim(p_payload->>'targetStatusCode')) end;
    if v_action='sample' and coalesce(p_payload->>'disposition','removed')='removed' then
      v_before:=v_balance."WMSBalance_OnHandQuantity"; v_after:=v_before-v_quantity;
      update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"=v_after,"WMSBalance_HeldQuantity"=greatest(0,"WMSBalance_HeldQuantity"-case when "WMSBalance_InventoryStatusCode"='available' then 0 else v_quantity end),"WMSBalance_AvailableQuantity"=greatest(0,"WMSBalance_AvailableQuantity"-case when "WMSBalance_InventoryStatusCode"='available' then v_quantity else 0 end),"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      v_transaction_id:=gen_random_uuid();
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(v_transaction_id,v_facility_id,v_balance."WMSBalance_ID",'sample',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_balance."WMSBalance_HU_ID",v_quantity,v_balance."WMSBalance_UOMCode",v_before,v_after,v_balance."WMSBalance_InventoryStatusCode",v_balance."WMSBalance_CustomsStatusCode",'WMS_InventoryOperations',v_request_id,'SMP-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('recipient',nullif(btrim(p_payload->>'recipient'),''),'custodyReference',nullif(btrim(p_payload->>'custodyReference'),''),'disposition','removed'),v_group_id,v_reason,v_request_id,v_now,p_actor_user_id);
      insert into public."WMS_Exceptions" ("WMSException_ID","WMSException_FacilityID","WMSException_TypeCode","WMSException_StatusCode","WMSException_SeverityCode","WMSException_BalanceID","WMSException_Title","WMSException_Description","WMSException_RaisedAt","WMSException_RaisedBy","WMSException_ResolvedAt","WMSException_ResolvedBy","WMSException_MetadataJSON","WMSException_ActualLocationID","WMSException_MovementGroupID") values(gen_random_uuid(),v_facility_id,'sample_withdrawal','resolved','low',v_balance."WMSBalance_ID",'Sample withdrawal recorded',nullif(btrim(p_payload->>'notes'),''),v_now,p_actor_user_id,v_now,p_actor_user_id,jsonb_build_object('quantity',v_quantity,'uomCode',v_balance."WMSBalance_UOMCode",'recipient',nullif(btrim(p_payload->>'recipient'),'')),v_balance."WMSBalance_LocationID",v_group_id);
      perform public._warehouse_edge_sync_hu_contents(v_balance."WMSBalance_HU_ID");
      v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'transactionId',v_transaction_id);
    else
      if not exists(select 1 from public."sys_WMSInventoryStatuses" where "WMSInventoryStatus_Code"=v_status and "WMSInventoryStatus_IsActive") then raise exception 'WMS400: Choose a valid stock status.'; end if;
      v_before:=v_balance."WMSBalance_OnHandQuantity"; v_after:=v_before-v_quantity;
      update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"=v_after,"WMSBalance_HeldQuantity"=greatest(0,"WMSBalance_HeldQuantity"-case when "WMSBalance_InventoryStatusCode"='available' then 0 else v_quantity end),"WMSBalance_AvailableQuantity"=greatest(0,"WMSBalance_AvailableQuantity"-case when "WMSBalance_InventoryStatusCode"='available' then v_quantity else 0 end),"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      v_destination_balance_id:=gen_random_uuid();
      insert into public."WMS_InventoryBalances" ("WMSBalance_ID","WMSBalance_FacilityID","WMSBalance_CustomerOrgID","WMSBalance_ItemID","WMSBalance_LocationID","WMSBalance_LotID","WMSBalance_SerialID","WMSBalance_HU_ID","WMSBalance_InventoryStatusCode","WMSBalance_CustomsStatusCode","WMSBalance_UOMCode","WMSBalance_OnHandQuantity","WMSBalance_ReservedQuantity","WMSBalance_AllocatedQuantity","WMSBalance_HeldQuantity","WMSBalance_AvailableQuantity","WMSBalance_FirstReceiptAt","WMSBalance_LastMovementAt","WMSBalance_IsBonded","WMSBalance_CustomsEntryReference","WMSBalance_StockValue","WMSBalance_CurrencyCode","WMSBalance_MetadataJSON","WMSBalance_CreatedAt","WMSBalance_UpdatedAt") values(v_destination_balance_id,v_facility_id,v_balance."WMSBalance_CustomerOrgID",v_balance."WMSBalance_ItemID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_balance."WMSBalance_HU_ID",v_status,v_balance."WMSBalance_CustomsStatusCode",v_balance."WMSBalance_UOMCode",v_quantity,0,0,case when v_status='available' then 0 else v_quantity end,case when v_status='available' then v_quantity else 0 end,v_balance."WMSBalance_FirstReceiptAt",v_now,v_balance."WMSBalance_IsBonded",v_balance."WMSBalance_CustomsEntryReference",v_balance."WMSBalance_StockValue",v_balance."WMSBalance_CurrencyCode",jsonb_build_object('sourceBalanceId',v_balance."WMSBalance_ID",'movementGroupId',v_group_id),v_now,v_now);
      v_transaction_id:=gen_random_uuid();
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(v_transaction_id,v_facility_id,v_balance."WMSBalance_ID",'status_change',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_balance."WMSBalance_HU_ID",v_quantity,v_balance."WMSBalance_UOMCode",v_before,v_after,v_status,v_balance."WMSBalance_CustomsStatusCode",'WMS_InventoryOperations',v_request_id,'STS-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('fromStatusCode',v_balance."WMSBalance_InventoryStatusCode",'toStatusCode',v_status,'destinationBalanceId',v_destination_balance_id),v_group_id,v_reason,v_request_id,v_now,p_actor_user_id);
      if v_status='damaged' then insert into public."WMS_Exceptions" ("WMSException_ID","WMSException_FacilityID","WMSException_TypeCode","WMSException_StatusCode","WMSException_SeverityCode","WMSException_BalanceID","WMSException_Title","WMSException_Description","WMSException_RaisedAt","WMSException_RaisedBy","WMSException_MetadataJSON","WMSException_ActualLocationID","WMSException_MovementGroupID") values(gen_random_uuid(),v_facility_id,'stock_damage','open','high',v_destination_balance_id,'Damaged stock requires review',nullif(btrim(p_payload->>'notes'),''),v_now,p_actor_user_id,jsonb_build_object('quantity',v_quantity,'uomCode',v_balance."WMSBalance_UOMCode"),v_balance."WMSBalance_LocationID",v_group_id); end if;
      perform public._warehouse_edge_sync_hu_contents(v_balance."WMSBalance_HU_ID");
      v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'transactionId',v_transaction_id,'balanceId',v_destination_balance_id);
    end if;

  elsif v_action='report_empty' then
    v_location_id:=(p_payload->>'locationId')::uuid;
    select * into v_location from public."WMS_Locations" where "WMSLocation_ID"=v_location_id and "WMSLocation_FacilityID"=v_facility_id and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted" for update;
    if not found then raise exception 'WMS404: This location does not exist in the warehouse.'; end if;
    if not exists(select 1 from public."WMS_InventoryBalances" where "WMSBalance_LocationID"=v_location_id and "WMSBalance_OnHandQuantity">0) then raise exception 'WMS409: Multideck already records this location as empty.'; end if;
    select "WMSLocation_ID" into v_target_location_id from public."WMS_Locations" where "WMSLocation_FacilityID"=v_facility_id and "WMSLocation_Code"='SYSTEM-UNLOCATED' and not "WMSLocation_IsDeleted" limit 1;
    if v_target_location_id is null then
      v_target_location_id:=gen_random_uuid();
      insert into public."WMS_Locations" ("WMSLocation_ID","WMSLocation_FacilityID","WMSLocation_Code","WMSLocation_Barcode","WMSLocation_TypeCode","WMSLocation_StatusCode","WMSLocation_AllowsMultiSKU","WMSLocation_AllowsBondedStock","WMSLocation_AllowedCustomsStatusesJSON","WMSLocation_IsActive","WMSLocation_CreatedAt","WMSLocation_CreatedBy","WMSLocation_UpdatedAt","WMSLocation_IsDeleted") values(v_target_location_id,v_facility_id,'SYSTEM-UNLOCATED','SYSTEM-UNLOCATED','investigation','blocked',true,true,'[]',true,v_now,p_actor_user_id,v_now,false);
    end if;
    v_exception_id:=gen_random_uuid(); v_count_plan_id:=gen_random_uuid();
    insert into public."WMS_CycleCountPlans" ("WMSCountPlan_ID","WMSCountPlan_FacilityID","WMSCountPlan_Name","WMSCountPlan_StatusCode","WMSCountPlan_CountTypeCode","WMSCountPlan_PlannedStartAt","WMSCountPlan_CreatedAt","WMSCountPlan_CreatedBy") values(v_count_plan_id,v_facility_id,'Investigate empty location '||v_location."WMSLocation_Code",'planned','location',v_now,v_now,p_actor_user_id);
    for v_balance in select * from public."WMS_InventoryBalances" where "WMSBalance_LocationID"=v_location_id and "WMSBalance_OnHandQuantity">0 for update loop
      insert into public."WMS_CycleCountLines" ("WMSCountLine_ID","WMSCountLine_CountPlanID","WMSCountLine_BalanceID","WMSCountLine_LocationID","WMSCountLine_ItemID","WMSCountLine_SystemQuantity","WMSCountLine_CountedQuantity","WMSCountLine_VarianceQuantity","WMSCountLine_UOMCode","WMSCountLine_StatusCode","WMSCountLine_CountedAt","WMSCountLine_CountedBy","WMSCountLine_Notes") values(gen_random_uuid(),v_count_plan_id,v_balance."WMSBalance_ID",v_location_id,v_balance."WMSBalance_ItemID",v_balance."WMSBalance_OnHandQuantity",0,-v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",'counted',v_now,p_actor_user_id,'Location physically confirmed empty.');
      update public."WMS_InventoryBalances" set "WMSBalance_LocationID"=v_target_location_id,"WMSBalance_InventoryStatusCode"='unlocated',"WMSBalance_HeldQuantity"="WMSBalance_OnHandQuantity","WMSBalance_AvailableQuantity"=0,"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      insert into public."WMS_InventoryHolds" ("WMSHold_ID","WMSHold_FacilityID","WMSHold_BalanceID","WMSHold_ItemID","WMSHold_LotID","WMSHold_HU_ID","WMSHold_TypeCode","WMSHold_StatusCode","WMSHold_Quantity","WMSHold_UOMCode","WMSHold_Reason","WMSHold_PlacedAt","WMSHold_PlacedBy") values(gen_random_uuid(),v_facility_id,v_balance."WMSBalance_ID",v_balance."WMSBalance_ItemID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_HU_ID",'location_investigation','open',v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",coalesce(nullif(btrim(p_payload->>'notes'),''),'Location physically confirmed empty.'),v_now,p_actor_user_id);
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(gen_random_uuid(),v_facility_id,v_balance."WMSBalance_ID",'location_exception',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_location_id,v_target_location_id,v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_balance."WMSBalance_HU_ID",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_OnHandQuantity",'unlocated',v_balance."WMSBalance_CustomsStatusCode",'WMS_Exceptions',v_exception_id,'MIS-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('previousStatusCode',v_balance."WMSBalance_InventoryStatusCode",'cycleCountPlanId',v_count_plan_id),v_group_id,'location_empty',v_request_id,v_now,p_actor_user_id);
      v_affected:=v_affected||jsonb_build_array(jsonb_build_object('balanceId',v_balance."WMSBalance_ID",'quantity',v_balance."WMSBalance_OnHandQuantity",'uomCode',v_balance."WMSBalance_UOMCode",'previousStatusCode',v_balance."WMSBalance_InventoryStatusCode",'handlingUnitId',v_balance."WMSBalance_HU_ID"));
      if v_balance."WMSBalance_HU_ID" is not null then update public."WMS_HandlingUnits" set "WMSHU_LocationID"=v_target_location_id,"WMSHU_InventoryStatusCode"='unlocated',"WMSHU_LifecycleStatusCode"='investigation',"WMSHU_UpdatedAt"=v_now,"WMSHU_Version"="WMSHU_Version"+1 where "WMSHU_ID"=v_balance."WMSBalance_HU_ID"; end if;
    end loop;
    insert into public."WMS_Exceptions" ("WMSException_ID","WMSException_FacilityID","WMSException_TypeCode","WMSException_StatusCode","WMSException_SeverityCode","WMSException_Title","WMSException_Description","WMSException_RaisedAt","WMSException_RaisedBy","WMSException_MetadataJSON","WMSException_ExpectedLocationID","WMSException_MovementGroupID") values(v_exception_id,v_facility_id,'location_empty','open','high','Expected stock missing from '||v_location."WMSLocation_Code",coalesce(nullif(btrim(p_payload->>'notes'),''),'The location was scanned and physically confirmed empty.'),v_now,p_actor_user_id,jsonb_build_object('affected',v_affected,'cycleCountPlanId',v_count_plan_id,'unlocatedLocationId',v_target_location_id,'requestId',v_request_id),v_location_id,v_group_id);
    v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'exceptionId',v_exception_id,'cycleCountPlanId',v_count_plan_id,'affectedBalances',v_affected);

  elsif v_action='resolve_location_exception' then
    select "WMSException_ID","WMSException_StatusCode","WMSException_RaisedBy","WMSException_MetadataJSON","WMSException_ExpectedLocationID" into v_exception_id,v_status,v_hu_id,v_existing,v_location_id from public."WMS_Exceptions" where "WMSException_ID"=(p_payload->>'exceptionId')::uuid and "WMSException_FacilityID"=v_facility_id and "WMSException_TypeCode"='location_empty' for update;
    if not found or v_status='resolved' then raise exception 'WMS404: This location exception is not open.'; end if;
    v_resolution:=lower(btrim(p_payload->>'resolution'));
    if v_resolution in ('found','data_error') then
      v_target_location_id:=case when v_resolution='found' then (p_payload->>'actualLocationId')::uuid else v_location_id end;
      select * into v_target_location from public."WMS_Locations" where "WMSLocation_ID"=v_target_location_id and "WMSLocation_FacilityID"=v_facility_id and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted";
      if not found then raise exception 'WMS400: Scan the resolved physical location.'; end if;
      for v_entry in select value from jsonb_array_elements(v_existing->'affected') loop
        select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=(v_entry->>'balanceId')::uuid for update;
        if found and v_balance."WMSBalance_OnHandQuantity">0 then
          update public."WMS_InventoryBalances" set "WMSBalance_LocationID"=v_target_location_id,"WMSBalance_InventoryStatusCode"=v_entry->>'previousStatusCode',"WMSBalance_HeldQuantity"=case when v_entry->>'previousStatusCode'='available' then 0 else "WMSBalance_OnHandQuantity" end,"WMSBalance_AvailableQuantity"=case when v_entry->>'previousStatusCode'='available' then greatest(0,"WMSBalance_OnHandQuantity"-"WMSBalance_ReservedQuantity"-"WMSBalance_AllocatedQuantity") else 0 end,"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
          insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(gen_random_uuid(),v_facility_id,v_balance."WMSBalance_ID",'move',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_balance."WMSBalance_LocationID",v_target_location_id,v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_balance."WMSBalance_HU_ID",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_OnHandQuantity",v_entry->>'previousStatusCode',v_balance."WMSBalance_CustomsStatusCode",'WMS_Exceptions',v_exception_id,'RES-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('resolution',v_resolution),v_group_id,'location_exception_resolved',v_request_id,v_now,p_actor_user_id);
          update public."WMS_InventoryHolds" set "WMSHold_StatusCode"='released',"WMSHold_ReleasedAt"=v_now,"WMSHold_ReleasedBy"=p_actor_user_id,"WMSHold_ReleaseReason"=nullif(btrim(p_payload->>'notes'),'') where "WMSHold_BalanceID"=v_balance."WMSBalance_ID" and "WMSHold_StatusCode"='open';
          if v_balance."WMSBalance_HU_ID" is not null then update public."WMS_HandlingUnits" set "WMSHU_LocationID"=v_target_location_id,"WMSHU_InventoryStatusCode"=v_entry->>'previousStatusCode',"WMSHU_LifecycleStatusCode"='open',"WMSHU_UpdatedAt"=v_now,"WMSHU_Version"="WMSHU_Version"+1 where "WMSHU_ID"=v_balance."WMSBalance_HU_ID"; end if;
        end if;
      end loop;
      update public."WMS_Exceptions" set "WMSException_StatusCode"='resolved',"WMSException_ActualLocationID"=v_target_location_id,"WMSException_ResolvedAt"=v_now,"WMSException_ResolvedBy"=p_actor_user_id,"WMSException_MetadataJSON"="WMSException_MetadataJSON"||jsonb_build_object('resolution',v_resolution,'resolutionNotes',nullif(btrim(p_payload->>'notes'),''),'resolutionMovementGroupId',v_group_id) where "WMSException_ID"=v_exception_id;
      v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'exceptionId',v_exception_id,'status','resolved');
    elsif v_resolution='request_loss' then
      v_adjustment_id:=gen_random_uuid();
      insert into public."WMS_Adjustments" ("WMSAdjust_ID","WMSAdjust_FacilityID","WMSAdjust_AdjustmentNumber","WMSAdjust_StatusCode","WMSAdjust_ReasonCode","WMSAdjust_RequiresApproval","WMSAdjust_Notes","WMSAdjust_CreatedAt","WMSAdjust_CreatedBy") values(v_adjustment_id,v_facility_id,'ADJ-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0'),'draft','confirmed_loss',true,nullif(btrim(p_payload->>'notes'),''),v_now,p_actor_user_id);
      for v_entry in select value from jsonb_array_elements(v_existing->'affected') loop
        select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=(v_entry->>'balanceId')::uuid for update;
        if found and v_balance."WMSBalance_OnHandQuantity">0 then insert into public."WMS_AdjustmentLines" ("WMSAdjustLine_ID","WMSAdjustLine_AdjustmentID","WMSAdjustLine_BalanceID","WMSAdjustLine_ItemID","WMSAdjustLine_LineNo","WMSAdjustLine_PreviousQuantity","WMSAdjustLine_NewQuantity","WMSAdjustLine_AdjustmentQuantity","WMSAdjustLine_UOMCode","WMSAdjustLine_Notes") values(gen_random_uuid(),v_adjustment_id,v_balance."WMSBalance_ID",v_balance."WMSBalance_ItemID",(select count(*)+1 from public."WMS_AdjustmentLines" where "WMSAdjustLine_AdjustmentID"=v_adjustment_id),v_balance."WMSBalance_OnHandQuantity",0,-v_balance."WMSBalance_OnHandQuantity",v_balance."WMSBalance_UOMCode",nullif(btrim(p_payload->>'notes'),'')); end if;
      end loop;
      update public."WMS_Exceptions" set "WMSException_StatusCode"='pending_approval',"WMSException_MetadataJSON"="WMSException_MetadataJSON"||jsonb_build_object('resolution','request_loss','adjustmentId',v_adjustment_id,'lossRequestedBy',p_actor_user_id,'lossRequestedAt',v_now,'resolutionNotes',nullif(btrim(p_payload->>'notes'),'')) where "WMSException_ID"=v_exception_id;
      v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'exceptionId',v_exception_id,'adjustmentId',v_adjustment_id,'status','pending_approval');
    elsif v_resolution='approve_loss' then
      v_adjustment_id:=(v_existing->>'adjustmentId')::uuid;
      if v_adjustment_id is null or (v_existing->>'lossRequestedBy')::uuid=p_actor_user_id then raise exception 'WMS409: A different warehouse user must approve the stock loss.'; end if;
      for v_entry in select to_jsonb(line) from public."WMS_AdjustmentLines" line where line."WMSAdjustLine_AdjustmentID"=v_adjustment_id order by line."WMSAdjustLine_LineNo" for update loop
        select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=(v_entry->>'WMSAdjustLine_BalanceID')::uuid for update;
        if found and v_balance."WMSBalance_OnHandQuantity">0 then
          v_before:=v_balance."WMSBalance_OnHandQuantity"; v_transaction_id:=gen_random_uuid();
          update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"=0,"WMSBalance_ReservedQuantity"=0,"WMSBalance_AllocatedQuantity"=0,"WMSBalance_HeldQuantity"=0,"WMSBalance_AvailableQuantity"=0,"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
          insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_LotID","WMSTransaction_SerialID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(v_transaction_id,v_facility_id,v_balance."WMSBalance_ID",'adjustment_out',v_balance."WMSBalance_ItemID",v_balance."WMSBalance_CustomerOrgID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_SerialID",v_balance."WMSBalance_HU_ID",v_before,v_balance."WMSBalance_UOMCode",v_before,0,'unlocated',v_balance."WMSBalance_CustomsStatusCode",'WMS_Adjustments',v_adjustment_id,'LOSS-'||left(v_group_id::text,8),nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('exceptionId',v_exception_id,'approvedBy',p_actor_user_id),v_group_id,'confirmed_loss',v_request_id,v_now,p_actor_user_id);
          update public."WMS_AdjustmentLines" set "WMSAdjustLine_InventoryTransactionID"=v_transaction_id where "WMSAdjustLine_ID"=(v_entry->>'WMSAdjustLine_ID')::uuid;
        end if;
      end loop;
      update public."WMS_Adjustments" set "WMSAdjust_StatusCode"='posted',"WMSAdjust_PostedAt"=v_now,"WMSAdjust_PostedBy"=p_actor_user_id where "WMSAdjust_ID"=v_adjustment_id and "WMSAdjust_StatusCode"='draft';
      update public."WMS_Exceptions" set "WMSException_StatusCode"='resolved',"WMSException_ResolvedAt"=v_now,"WMSException_ResolvedBy"=p_actor_user_id,"WMSException_MetadataJSON"="WMSException_MetadataJSON"||jsonb_build_object('resolution','confirmed_loss','approvedBy',p_actor_user_id,'approvedAt',v_now,'resolutionMovementGroupId',v_group_id) where "WMSException_ID"=v_exception_id;
      v_result:=jsonb_build_object('requestId',v_request_id,'movementGroupId',v_group_id,'exceptionId',v_exception_id,'adjustmentId',v_adjustment_id,'status','resolved');
    else raise exception 'WMS400: Choose found, data error, request loss, or approve loss.'; end if;
  else
    raise exception 'WMS400: Unsupported inventory action.';
  end if;

  update public."WMS_InventoryOperations" set "WMSOperation_ResultJSON"=v_result where "WMSOperation_RequestID"=v_request_id;
  return v_result;
exception
  when others then
    if sqlerrm like 'WMS%' then raise; end if;
    raise exception 'WMS500: %',sqlerrm;
end; $$;

revoke all on function public.warehouse_edge_inventory_mutation(text,jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_inventory_mutation(text,jsonb,uuid,uuid[]) to service_role;

-- Dedicated receipt mutation so receiving and creating/assigning a pallet are one
-- transaction. The legacy order mutation remains responsible for create/dispatch/cancel.
create or replace function public.warehouse_edge_receive_mutation(
  p_order_id uuid,
  p_payload jsonb,
  p_actor_user_id uuid,
  p_allowed_facility_ids uuid[],
  p_allowed_organisation_ids uuid[]
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order public."WMS_Orders"%rowtype;
  v_line public."WMS_OrderLines"%rowtype;
  v_balance public."WMS_InventoryBalances"%rowtype;
  v_hu public."WMS_HandlingUnits"%rowtype;
  v_input jsonb;
  v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid;
  v_receipt_id uuid;
  v_hu_id uuid:=nullif(p_payload->>'handlingUnitId','')::uuid;
  v_balance_id uuid;
  v_lot_id uuid;
  v_location_id uuid;
  v_transaction_id uuid;
  v_primary_transaction_id uuid;
  v_now timestamptz:=now();
  v_number text;
  v_hu_code text;
  v_status text;
  v_quantity numeric;
  v_damaged numeric;
  v_missing numeric;
  v_part numeric;
  v_before numeric;
  v_index integer:=0;
  v_complete boolean;
begin
  if p_actor_user_id is null then raise exception 'WMS403: Goods receipt is reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  if exists(select 1 from public."WMS_Receipts" where "WMSReceipt_OrderID"=p_order_id and "WMSReceipt_MetadataJSON"->>'requestId'=v_request_id::text) then return p_order_id; end if;
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and not "WMSOrder_IsDeleted" and "WMSOrder_FacilityID"=any(p_allowed_facility_ids) and "WMSOrder_CustomerOrgID"=any(p_allowed_organisation_ids) for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_TypeCode"<>'inbound' or v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This inbound order cannot be received.'; end if;
  if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines')=0 then raise exception 'WMS400: Add at least one receipt line.'; end if;

  if v_hu_id is null and jsonb_typeof(p_payload->'newHandlingUnit')='object' then
    if not exists(select 1 from jsonb_array_elements(p_payload->'lines') line where coalesce(nullif(line->>'quantity','')::numeric,0)>0) then raise exception 'WMS400: A new pallet or warehouse object must contain received stock.'; end if;
    if not exists(select 1 from public."sys_WMSHandlingUnitTypes" where "WMSHUType_Code"=lower(btrim(p_payload->'newHandlingUnit'->>'typeCode')) and "WMSHUType_IsActive") then raise exception 'WMS400: Choose a valid pallet or warehouse object type.'; end if;
    v_hu_id:=gen_random_uuid();
    v_hu_code:=upper(coalesce(nullif(btrim(p_payload->'newHandlingUnit'->>'code'),''),'HU-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0')));
    insert into public."WMS_HandlingUnits" ("WMSHU_ID","WMSHU_FacilityID","WMSHU_TypeCode","WMSHU_Code","WMSHU_SSCC","WMSHU_ExternalReference","WMSHU_CustomerOrgID","WMSHU_InventoryStatusCode","WMSHU_CustomsStatusCode","WMSHU_LifecycleStatusCode","WMSHU_CreatedAt","WMSHU_CreatedBy","WMSHU_UpdatedAt","WMSHU_IsDeleted")
    values(v_hu_id,v_order."WMSOrder_FacilityID",lower(btrim(p_payload->'newHandlingUnit'->>'typeCode')),v_hu_code,nullif(btrim(p_payload->'newHandlingUnit'->>'sscc'),''),nullif(btrim(p_payload->'newHandlingUnit'->>'externalReference'),''),v_order."WMSOrder_CustomerOrgID",'available','free_circulation','open',v_now,p_actor_user_id,v_now,false);
    insert into public."WMS_HandlingUnitEvents" ("WMSHUEvent_ID","WMSHUEvent_HU_ID","WMSHUEvent_EventTypeCode","WMSHUEvent_EventAt","WMSHUEvent_Notes","WMSHUEvent_MetadataJSON","WMSHUEvent_CreatedBy") values(gen_random_uuid(),v_hu_id,'created',v_now,'Created during goods receipt.',jsonb_build_object('orderId',p_order_id,'requestId',v_request_id),p_actor_user_id);
  elsif v_hu_id is not null then
    select * into v_hu from public."WMS_HandlingUnits" where "WMSHU_ID"=v_hu_id and "WMSHU_FacilityID"=v_order."WMSOrder_FacilityID" and not "WMSHU_IsDeleted" and "WMSHU_LifecycleStatusCode"='open' for update;
    if not found or (v_hu."WMSHU_CustomerOrgID" is not null and v_hu."WMSHU_CustomerOrgID" is distinct from v_order."WMSOrder_CustomerOrgID") then raise exception 'WMS409: The selected pallet is not compatible with this receipt.'; end if;
  end if;

  v_receipt_id:=gen_random_uuid();
  v_number:='GRN-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0');
  insert into public."WMS_Receipts" ("WMSReceipt_ID","WMSReceipt_FacilityID","WMSReceipt_OrderID","WMSReceipt_JobID","WMSReceipt_ReceiptNumber","WMSReceipt_StatusCode","WMSReceipt_ReceivingLocationID","WMSReceipt_ReceivedAt","WMSReceipt_ReceivedBy","WMSReceipt_HasDiscrepancy","WMSReceipt_Notes","WMSReceipt_MetadataJSON","WMSReceipt_CreatedAt","WMSReceipt_CreatedBy")
  values(v_receipt_id,v_order."WMSOrder_FacilityID",p_order_id,v_order."WMSOrder_JobID",v_number,'complete',nullif(p_payload->>'receivingLocationId','')::uuid,v_now,p_actor_user_id,false,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('requestId',v_request_id,'handlingUnitId',v_hu_id),v_now,p_actor_user_id);

  for v_input in select value from jsonb_array_elements(p_payload->'lines') loop
    v_index:=v_index+1; v_primary_transaction_id:=null;
    select * into v_line from public."WMS_OrderLines" where "WMSOrderLine_ID"=(v_input->>'orderLineId')::uuid and "WMSOrderLine_OrderID"=p_order_id for update;
    if not found then raise exception 'WMS400: A received line does not belong to this order.'; end if;
    v_quantity:=coalesce(nullif(v_input->>'quantity','')::numeric,0);
    v_damaged:=coalesce(nullif(v_input->>'damagedQuantity','')::numeric,0);
    v_missing:=coalesce(nullif(v_input->>'missingQuantity','')::numeric,0);
    if v_quantity<0 or v_damaged<0 or v_missing<0 or v_damaged>v_quantity or v_quantity+v_missing<=0 or v_quantity+v_missing>v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_ReceivedQuantity" then raise exception 'WMS400: Check the received, damaged, and missing quantities.'; end if;
    if v_quantity>0 then perform public._warehouse_edge_validate_quantity(v_line."WMSOrderLine_ItemID",v_quantity); end if;
    if v_damaged>0 then perform public._warehouse_edge_validate_quantity(v_line."WMSOrderLine_ItemID",v_damaged); end if;
    if v_missing>0 then perform public._warehouse_edge_validate_quantity(v_line."WMSOrderLine_ItemID",v_missing); end if;
    v_location_id:=coalesce(nullif(v_input->>'targetLocationId','')::uuid,v_line."WMSOrderLine_TargetLocationID",nullif(p_payload->>'receivingLocationId','')::uuid);
    if v_quantity>0 and (v_location_id is null or not exists(select 1 from public."WMS_Locations" where "WMSLocation_ID"=v_location_id and "WMSLocation_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted")) then raise exception 'WMS400: Choose an active receiving location.'; end if;
    if v_hu_id is not null and v_location_id is not null then update public."WMS_HandlingUnits" set "WMSHU_LocationID"=v_location_id,"WMSHU_CustomerOrgID"=coalesce("WMSHU_CustomerOrgID",v_order."WMSOrder_CustomerOrgID"),"WMSHU_UpdatedAt"=v_now,"WMSHU_Version"="WMSHU_Version"+1 where "WMSHU_ID"=v_hu_id; end if;
    v_lot_id:=null;
    if coalesce(nullif(btrim(v_input->>'lotNumber'),''),nullif(btrim(v_input->>'batchNumber'),''),v_line."WMSOrderLine_LotNumber") is not null then
      select "WMSLot_ID" into v_lot_id from public."WMS_InventoryLots" where "WMSLot_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSLot_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSLot_LotNumber"=coalesce(nullif(btrim(v_input->>'lotNumber'),''),v_line."WMSOrderLine_LotNumber",nullif(btrim(v_input->>'batchNumber'),'')) limit 1;
      if v_lot_id is null then
        v_lot_id:=gen_random_uuid();
        insert into public."WMS_InventoryLots" ("WMSLot_ID","WMSLot_FacilityID","WMSLot_CustomerOrgID","WMSLot_ItemID","WMSLot_LotNumber","WMSLot_BatchNumber","WMSLot_ManufactureDate","WMSLot_ExpiryDate","WMSLot_CustomsStatusCode","WMSLot_AttributesJSON","WMSLot_CreatedAt") values(v_lot_id,v_order."WMSOrder_FacilityID",v_order."WMSOrder_CustomerOrgID",v_line."WMSOrderLine_ItemID",coalesce(nullif(btrim(v_input->>'lotNumber'),''),v_line."WMSOrderLine_LotNumber",btrim(v_input->>'batchNumber')),coalesce(nullif(btrim(v_input->>'batchNumber'),''),nullif(btrim(v_input->>'lotNumber'),'')),nullif(v_input->>'manufactureDate','')::date,coalesce(nullif(v_input->>'expiryDate','')::date,v_line."WMSOrderLine_ExpiryDate"),v_line."WMSOrderLine_CustomsStatusCode",'{}',v_now);
      end if;
    end if;
    foreach v_status in array array['available','damaged'] loop
      v_part:=case when v_status='available' then v_quantity-v_damaged else v_damaged end;
      if v_part<=0 then continue; end if;
      select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSBalance_CustomerOrgID"=v_order."WMSOrder_CustomerOrgID" and "WMSBalance_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSBalance_LocationID"=v_location_id and "WMSBalance_LotID" is not distinct from v_lot_id and "WMSBalance_HU_ID" is not distinct from v_hu_id and "WMSBalance_InventoryStatusCode"=v_status and "WMSBalance_CustomsStatusCode"=v_line."WMSOrderLine_CustomsStatusCode" and "WMSBalance_UOMCode"=v_line."WMSOrderLine_UOMCode" for update;
      if not found then
        v_balance_id:=gen_random_uuid(); v_before:=0;
        insert into public."WMS_InventoryBalances" ("WMSBalance_ID","WMSBalance_FacilityID","WMSBalance_CustomerOrgID","WMSBalance_ItemID","WMSBalance_LocationID","WMSBalance_LotID","WMSBalance_HU_ID","WMSBalance_InventoryStatusCode","WMSBalance_CustomsStatusCode","WMSBalance_UOMCode","WMSBalance_OnHandQuantity","WMSBalance_ReservedQuantity","WMSBalance_AllocatedQuantity","WMSBalance_HeldQuantity","WMSBalance_AvailableQuantity","WMSBalance_FirstReceiptAt","WMSBalance_LastMovementAt","WMSBalance_IsBonded","WMSBalance_MetadataJSON","WMSBalance_CreatedAt","WMSBalance_UpdatedAt") values(v_balance_id,v_order."WMSOrder_FacilityID",v_order."WMSOrder_CustomerOrgID",v_line."WMSOrderLine_ItemID",v_location_id,v_lot_id,v_hu_id,v_status,v_line."WMSOrderLine_CustomsStatusCode",v_line."WMSOrderLine_UOMCode",v_part,0,0,case when v_status='damaged' then v_part else 0 end,case when v_status='available' then v_part else 0 end,v_now,v_now,v_line."WMSOrderLine_CustomsStatusCode"<>'free_circulation','{}',v_now,v_now);
      else
        v_balance_id:=v_balance."WMSBalance_ID"; v_before:=v_balance."WMSBalance_OnHandQuantity";
        update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"="WMSBalance_OnHandQuantity"+v_part,"WMSBalance_HeldQuantity"="WMSBalance_HeldQuantity"+case when v_status='damaged' then v_part else 0 end,"WMSBalance_AvailableQuantity"="WMSBalance_AvailableQuantity"+case when v_status='available' then v_part else 0 end,"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance_id;
      end if;
      v_transaction_id:=gen_random_uuid(); v_primary_transaction_id:=coalesce(v_primary_transaction_id,v_transaction_id);
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_OrderID","WMSTransaction_OrderLineID","WMSTransaction_ReceiptID","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_MovementGroupID","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(v_transaction_id,v_order."WMSOrder_FacilityID",v_balance_id,'receipt',v_line."WMSOrderLine_ItemID",v_order."WMSOrder_CustomerOrgID",v_location_id,v_lot_id,v_hu_id,v_part,v_line."WMSOrderLine_UOMCode",v_before,v_before+v_part,v_status,v_line."WMSOrderLine_CustomsStatusCode",p_order_id,v_line."WMSOrderLine_ID",v_receipt_id,'WMS_Receipts',v_receipt_id,v_number,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('handlingUnitId',v_hu_id),v_request_id,case when v_status='damaged' then 'damaged_on_receipt' else 'goods_receipt' end,v_request_id,v_now,p_actor_user_id);
    end loop;
    insert into public."WMS_ReceiptLines" ("WMSReceiptLine_ID","WMSReceiptLine_ReceiptID","WMSReceiptLine_OrderLineID","WMSReceiptLine_ItemID","WMSReceiptLine_HU_ID","WMSReceiptLine_LineNo","WMSReceiptLine_ExpectedQuantity","WMSReceiptLine_ReceivedQuantity","WMSReceiptLine_DamagedQuantity","WMSReceiptLine_OverQuantity","WMSReceiptLine_ShortQuantity","WMSReceiptLine_UOMCode","WMSReceiptLine_LotNumber","WMSReceiptLine_ExpiryDate","WMSReceiptLine_TargetLocationID","WMSReceiptLine_InventoryTransactionID","WMSReceiptLine_CustomsStatusCode","WMSReceiptLine_CreatedAt") values(gen_random_uuid(),v_receipt_id,v_line."WMSOrderLine_ID",v_line."WMSOrderLine_ItemID",v_hu_id,v_index,v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_ReceivedQuantity",v_quantity,v_damaged,0,v_missing,v_line."WMSOrderLine_UOMCode",(select "WMSLot_LotNumber" from public."WMS_InventoryLots" where "WMSLot_ID"=v_lot_id),coalesce(nullif(v_input->>'expiryDate','')::date,v_line."WMSOrderLine_ExpiryDate"),v_location_id,v_primary_transaction_id,v_line."WMSOrderLine_CustomsStatusCode",v_now);
    if v_damaged>0 or v_missing>0 then update public."WMS_Receipts" set "WMSReceipt_HasDiscrepancy"=true where "WMSReceipt_ID"=v_receipt_id; end if;
    if v_missing>0 then insert into public."WMS_Exceptions" ("WMSException_ID","WMSException_FacilityID","WMSException_TypeCode","WMSException_StatusCode","WMSException_SeverityCode","WMSException_OrderID","WMSException_OrderLineID","WMSException_ReceiptID","WMSException_Title","WMSException_Description","WMSException_RaisedAt","WMSException_RaisedBy","WMSException_MetadataJSON","WMSException_ActualLocationID","WMSException_MovementGroupID") values(gen_random_uuid(),v_order."WMSOrder_FacilityID",'stock_shortage','open','high',p_order_id,v_line."WMSOrderLine_ID",v_receipt_id,'Inbound stock received short','Expected quantity was not physically received.',v_now,p_actor_user_id,jsonb_build_object('missingQuantity',v_missing,'uomCode',v_line."WMSOrderLine_UOMCode",'requestId',v_request_id),v_location_id,v_request_id); end if;
    update public."WMS_OrderLines" set "WMSOrderLine_ReceivedQuantity"="WMSOrderLine_ReceivedQuantity"+v_quantity,"WMSOrderLine_StatusCode"=case when v_missing>0 and "WMSOrderLine_ReceivedQuantity"+v_quantity+v_missing >= "WMSOrderLine_OrderedQuantity" then 'short' when "WMSOrderLine_ReceivedQuantity"+v_quantity >= "WMSOrderLine_OrderedQuantity" then 'received' else 'open' end,"WMSOrderLine_MetadataJSON"="WMSOrderLine_MetadataJSON"||case when v_missing>0 then jsonb_build_object('confirmedMissingQuantity',coalesce(("WMSOrderLine_MetadataJSON"->>'confirmedMissingQuantity')::numeric,0)+v_missing) else '{}'::jsonb end where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID";
  end loop;
  if v_hu_id is not null then perform public._warehouse_edge_sync_hu_contents(v_hu_id); insert into public."WMS_HandlingUnitEvents" ("WMSHUEvent_ID","WMSHUEvent_HU_ID","WMSHUEvent_EventTypeCode","WMSHUEvent_EventAt","WMSHUEvent_LocationID","WMSHUEvent_OrderID","WMSHUEvent_Notes","WMSHUEvent_MetadataJSON","WMSHUEvent_CreatedBy") values(gen_random_uuid(),v_hu_id,'received',v_now,(select "WMSHU_LocationID" from public."WMS_HandlingUnits" where "WMSHU_ID"=v_hu_id),p_order_id,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('receiptId',v_receipt_id,'requestId',v_request_id),p_actor_user_id); end if;
  select bool_and("WMSOrderLine_StatusCode" in ('received','short','cancelled')) into v_complete from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id;
  update public."WMS_Orders" set "WMSOrder_StatusCode"=case when v_complete then 'complete' else 'part_complete' end,"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
exception when others then if sqlerrm like 'WMS%' then raise; end if; raise exception 'WMS500: %',sqlerrm;
end; $$;

revoke all on function public.warehouse_edge_receive_mutation(uuid,jsonb,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_receive_mutation(uuid,jsonb,uuid,uuid[],uuid[]) to service_role;
