-- Warehouse inventory parity for Dexter chat and event-driven Watching for you.

update public."sys_AIDexterWatchCapabilities"
set
  "AIDexterWatchCapability_Description" = 'Warehouse orders, stock movements, handling units and inventory exceptions.',
  "AIDexterWatchCapability_FieldsJSON" = '["status","priority","releaseGateStatus","requestedDate","customerReference","containerNumber","exceptionStatus","severity","title","inventoryStatus","movementType","reason","quantity","uom","handlingUnitCode","locationCode"]'::jsonb
where "AIDexterWatchCapability_Code" = 'warehouse';

update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Description" = 'Facilities, orders, quantity-aware stock, pallet and handling-unit contents, movements and unresolved inventory exceptions.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'warehouse';

create or replace function public._multideck_dexter_watch_warehouse_inventory_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_source_id uuid;
  v_facility_id uuid;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'WMS_InventoryTransactions' then
    v_facility_id := new."WMSTransaction_FacilityID";
    v_source_id := coalesce(new."WMSTransaction_BalanceID", new."WMSTransaction_HU_ID", new."WMSTransaction_ID");
    v_new := jsonb_build_object(
      'movementType', new."WMSTransaction_TypeCode",
      'reason', new."WMSTransaction_ReasonCode",
      'quantity', new."WMSTransaction_Quantity",
      'uom', new."WMSTransaction_UOMCode",
      'inventoryStatus', new."WMSTransaction_InventoryStatusCode",
      'handlingUnitCode', (select hu."WMSHU_Code" from public."WMS_HandlingUnits" hu where hu."WMSHU_ID" = new."WMSTransaction_HU_ID"),
      'locationCode', (select location."WMSLocation_Code" from public."WMS_Locations" location where location."WMSLocation_ID" = new."WMSTransaction_ToLocationID"),
      'movementGroupId', new."WMSTransaction_MovementGroupID"
    );
  elsif tg_table_name = 'WMS_HandlingUnitEvents' then
    select hu."WMSHU_FacilityID", hu."WMSHU_ID",
      jsonb_build_object(
        'movementType', new."WMSHUEvent_EventTypeCode",
        'handlingUnitCode', hu."WMSHU_Code",
        'inventoryStatus', hu."WMSHU_InventoryStatusCode",
        'locationCode', location."WMSLocation_Code",
        'eventAt', new."WMSHUEvent_EventAt"
      )
    into v_facility_id, v_source_id, v_new
    from public."WMS_HandlingUnits" hu
    left join public."WMS_Locations" location on location."WMSLocation_ID" = new."WMSHUEvent_LocationID"
    where hu."WMSHU_ID" = new."WMSHUEvent_HU_ID";
  end if;

  select office."Company_ID" into v_company_id
  from public."WMS_Facilities" facility
  join public."cmp_Offices" office on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
  where facility."WMSFacility_ID" = v_facility_id;

  if v_company_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'warehouse'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (v_company_id, 'warehouse', tg_table_name, v_source_id, '{}'::jsonb, v_new);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_WMS_InventoryTransactions_dexter_watch" on public."WMS_InventoryTransactions";
create trigger "TR_WMS_InventoryTransactions_dexter_watch"
after insert on public."WMS_InventoryTransactions"
for each row execute function public._multideck_dexter_watch_warehouse_inventory_change();

drop trigger if exists "TR_WMS_HandlingUnitEvents_dexter_watch" on public."WMS_HandlingUnitEvents";
create trigger "TR_WMS_HandlingUnitEvents_dexter_watch"
after insert on public."WMS_HandlingUnitEvents"
for each row execute function public._multideck_dexter_watch_warehouse_inventory_change();

revoke all on function public._multideck_dexter_watch_warehouse_inventory_change() from public, anon, authenticated;

create or replace function public.multideck_dexter_domain_warehouse(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
with parameters as (
  select greatest(1, least(coalesce(p_take, 10), 15)) as take
), company_facilities as (
  select facility.* from public."WMS_Facilities" facility
  join public."cmp_Offices" office on office."Office_ID" = facility."WMSFacility_OrgOfficeID" and office."Company_ID" = p_company_id
  where not facility."WMSFacility_IsDeleted"
), order_rows as (
  select jsonb_build_object(
    'recordId', orders."WMSOrder_ID", 'orderNumber', orders."WMSOrder_OrderNumber", 'type', orders."WMSOrder_TypeCode",
    'status', orders."WMSOrder_StatusCode", 'priority', orders."WMSOrder_PriorityCode", 'facility', facility."WMSFacility_Code",
    'customerReference', orders."WMSOrder_CustomerReference", 'requestedDate', orders."WMSOrder_RequestedDate",
    'containerNumber', orders."WMSOrder_ContainerNumber", 'releaseGateStatus', orders."WMSOrder_ReleaseGateStatusCode",
    'searchEvidence', evidence.value - 'matched'
  ) value, coalesce((evidence.value->>'confidence')::numeric, 0) rank, orders."WMSOrder_UpdatedAt" updated_at
  from public."WMS_Orders" orders join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID"
  cross join lateral public._multideck_dexter_search_evidence(p_search, jsonb_build_object(
    'orderNumber', orders."WMSOrder_OrderNumber", 'customerReference', orders."WMSOrder_CustomerReference",
    'containerNumber', orders."WMSOrder_ContainerNumber", 'facility', facility."WMSFacility_Code", 'status', orders."WMSOrder_StatusCode"
  ), array['orderNumber','customerReference','containerNumber']::text[]) evidence(value)
  where not orders."WMSOrder_IsDeleted" and (evidence.value->>'matched')::boolean
  order by rank desc, updated_at desc limit (select take from parameters)
), inventory_rows as (
  select jsonb_build_object(
    'recordId', balance."WMSBalance_ID", 'facilityId', balance."WMSBalance_FacilityID",
    'sku', item."WMSItem_SKU", 'description', item."WMSItem_Description", 'quantityBasis', item."WMSItem_QuantityBasisCode",
    'facility', facility."WMSFacility_Code", 'locationCode', location."WMSLocation_Code",
    'handlingUnitCode', hu."WMSHU_Code", 'handlingUnitType', hu."WMSHU_TypeCode",
    'inventoryStatus', balance."WMSBalance_InventoryStatusCode", 'customsStatus', balance."WMSBalance_CustomsStatusCode",
    'onHand', balance."WMSBalance_OnHandQuantity", 'available', balance."WMSBalance_AvailableQuantity",
    'reserved', balance."WMSBalance_ReservedQuantity", 'held', balance."WMSBalance_HeldQuantity",
    'uom', balance."WMSBalance_UOMCode", 'isBonded', balance."WMSBalance_IsBonded",
    'lastMovementAt', balance."WMSBalance_LastMovementAt", 'searchEvidence', evidence.value - 'matched'
  ) value, coalesce((evidence.value->>'confidence')::numeric, 0) rank, balance."WMSBalance_UpdatedAt" updated_at
  from public."WMS_InventoryBalances" balance
  join company_facilities facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
  join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
  left join public."WMS_Locations" location on location."WMSLocation_ID" = balance."WMSBalance_LocationID"
  left join public."WMS_HandlingUnits" hu on hu."WMSHU_ID" = balance."WMSBalance_HU_ID"
  cross join lateral public._multideck_dexter_search_evidence(p_search, jsonb_build_object(
    'sku', item."WMSItem_SKU", 'description', item."WMSItem_Description", 'facility', facility."WMSFacility_Code",
    'locationCode', location."WMSLocation_Code", 'handlingUnitCode', hu."WMSHU_Code",
    'inventoryStatus', balance."WMSBalance_InventoryStatusCode"
  ), array['sku','handlingUnitCode','locationCode']::text[]) evidence(value)
  where not item."WMSItem_IsDeleted" and balance."WMSBalance_OnHandQuantity" > 0 and (evidence.value->>'matched')::boolean
  order by rank desc, updated_at desc limit (select take from parameters)
), handling_unit_rows as (
  select jsonb_build_object(
    'recordId', hu."WMSHU_ID", 'code', hu."WMSHU_Code", 'type', hu."WMSHU_TypeCode",
    'lifecycleStatus', hu."WMSHU_LifecycleStatusCode", 'inventoryStatus', hu."WMSHU_InventoryStatusCode",
    'facility', facility."WMSFacility_Code", 'locationCode', location."WMSLocation_Code",
    'lineCount', count(balance."WMSBalance_ID"), 'totalQuantity', coalesce(sum(balance."WMSBalance_OnHandQuantity"), 0),
    'searchEvidence', evidence.value - 'matched'
  ) value, coalesce((evidence.value->>'confidence')::numeric, 0) rank, hu."WMSHU_UpdatedAt" updated_at
  from public."WMS_HandlingUnits" hu join company_facilities facility on facility."WMSFacility_ID" = hu."WMSHU_FacilityID"
  left join public."WMS_Locations" location on location."WMSLocation_ID" = hu."WMSHU_LocationID"
  left join public."WMS_InventoryBalances" balance on balance."WMSBalance_HU_ID" = hu."WMSHU_ID" and balance."WMSBalance_OnHandQuantity" > 0
  cross join lateral public._multideck_dexter_search_evidence(p_search, jsonb_build_object(
    'handlingUnitCode', hu."WMSHU_Code", 'type', hu."WMSHU_TypeCode", 'facility', facility."WMSFacility_Code", 'locationCode', location."WMSLocation_Code"
  ), array['handlingUnitCode','locationCode']::text[]) evidence(value)
  where not hu."WMSHU_IsDeleted" and (evidence.value->>'matched')::boolean
  group by hu."WMSHU_ID", facility."WMSFacility_Code", location."WMSLocation_Code", evidence.value
  order by rank desc, updated_at desc limit (select take from parameters)
), exception_rows as (
  select jsonb_build_object(
    'recordId', exception."WMSException_ID", 'balanceId', exception."WMSException_BalanceID",
    'title', exception."WMSException_Title", 'description', exception."WMSException_Description",
    'type', exception."WMSException_TypeCode", 'status', exception."WMSException_StatusCode",
    'severity', exception."WMSException_SeverityCode", 'facility', facility."WMSFacility_Code",
    'expectedLocationCode', expected."WMSLocation_Code", 'actualLocationCode', actual."WMSLocation_Code",
    'raisedAt', exception."WMSException_RaisedAt", 'searchEvidence', evidence.value - 'matched'
  ) value, coalesce((evidence.value->>'confidence')::numeric, 0) rank, exception."WMSException_RaisedAt" raised_at
  from public."WMS_Exceptions" exception join company_facilities facility on facility."WMSFacility_ID" = exception."WMSException_FacilityID"
  left join public."WMS_Locations" expected on expected."WMSLocation_ID" = exception."WMSException_ExpectedLocationID"
  left join public."WMS_Locations" actual on actual."WMSLocation_ID" = exception."WMSException_ActualLocationID"
  cross join lateral public._multideck_dexter_search_evidence(p_search, jsonb_build_object(
    'title', exception."WMSException_Title", 'type', exception."WMSException_TypeCode", 'status', exception."WMSException_StatusCode",
    'facility', facility."WMSFacility_Code", 'expectedLocationCode', expected."WMSLocation_Code", 'actualLocationCode', actual."WMSLocation_Code"
  ), array['expectedLocationCode','actualLocationCode']::text[]) evidence(value)
  where exception."WMSException_ResolvedAt" is null and (evidence.value->>'matched')::boolean
  order by rank desc, raised_at desc limit (select take from parameters)
)
select jsonb_build_object(
  'overview', jsonb_build_object(
    'activeFacilities', (select count(*) from company_facilities where "WMSFacility_IsActive"),
    'openOrders', (select count(*) from public."WMS_Orders" orders join company_facilities f on f."WMSFacility_ID"=orders."WMSOrder_FacilityID" where not orders."WMSOrder_IsDeleted" and orders."WMSOrder_StatusCode" not in ('complete','cancelled')),
    'openExceptions', (select count(*) from public."WMS_Exceptions" exception join company_facilities f on f."WMSFacility_ID"=exception."WMSException_FacilityID" where exception."WMSException_ResolvedAt" is null),
    'openHandlingUnits', (select count(*) from public."WMS_HandlingUnits" hu join company_facilities f on f."WMSFacility_ID"=hu."WMSHU_FacilityID" where not hu."WMSHU_IsDeleted" and hu."WMSHU_LifecycleStatusCode" in ('open','sealed')),
    'heldStockQuantity', (select coalesce(sum(balance."WMSBalance_HeldQuantity"),0) from public."WMS_InventoryBalances" balance join company_facilities f on f."WMSFacility_ID"=balance."WMSBalance_FacilityID")
  ),
  'orders', coalesce((select jsonb_agg(value order by rank desc, updated_at desc) from order_rows),'[]'::jsonb),
  'inventory', coalesce((select jsonb_agg(value order by rank desc, updated_at desc) from inventory_rows),'[]'::jsonb),
  'handlingUnits', coalesce((select jsonb_agg(value order by rank desc, updated_at desc) from handling_unit_rows),'[]'::jsonb),
  'exceptions', coalesce((select jsonb_agg(value order by rank desc, raised_at desc) from exception_rows),'[]'::jsonb)
);
$$;

revoke all on function public.multideck_dexter_domain_warehouse(uuid, text, integer) from public, anon, authenticated;

-- This advertised action intentionally fails closed outside Agent Dexter's Edge
-- runtime. The Edge runtime delegates to the real warehouse validation boundary.
create or replace function public.multideck_dexter_action_quarantine_inventory(uuid, uuid, jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'This action must be completed through the Warehouse Edge Function.' using errcode = '42501';
end;
$$;
revoke all on function public.multideck_dexter_action_quarantine_inventory(uuid, uuid, jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt"
) values (
  'quarantine_inventory', 'warehouse', 'Quarantine warehouse stock',
  'Place an evidence-backed stock quantity into quarantine through the Warehouse Edge Function. Approval is required by default.',
  'multideck_dexter_action_quarantine_inventory',
  '{"type":"object","properties":{"target_id":{"type":"string","description":"The exact inventory balance recordId returned by the warehouse data tool."},"facility_id":{"type":"string","description":"The exact facilityId returned with the inventory balance."},"quantity":{"type":"number","exclusiveMinimum":0},"reason":{"type":"string"},"notes":{"type":["string","null"]}},"required":["target_id","facility_id","quantity","reason","notes"],"additionalProperties":false}'::jsonb,
  15, true, now()
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode", "AIDexterAction_Name"=excluded."AIDexterAction_Name",
  "AIDexterAction_Description"=excluded."AIDexterAction_Description", "AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON", "AIDexterAction_IsActive"=true,
  "AIDexterAction_UpdatedAt"=now();
