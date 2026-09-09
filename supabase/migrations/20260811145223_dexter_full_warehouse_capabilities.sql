-- Complete Dexter parity for the operator-owned Warehouse workspace.
-- Calendar remains a derived, read-only view of warehouse order dates.

begin;

create or replace function public.warehouse_edge_update_order_mutation(
  p_order_id uuid,
  p_payload jsonb,
  p_actor_user_id uuid,
  p_allowed_facility_ids uuid[],
  p_allowed_organisation_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public."WMS_Orders"%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'WMS403: Warehouse order changes are reserved for the warehouse team.';
  end if;

  select * into v_order
  from public."WMS_Orders"
  where "WMSOrder_ID" = p_order_id
    and not "WMSOrder_IsDeleted"
    and "WMSOrder_FacilityID" = any(p_allowed_facility_ids)
    and "WMSOrder_CustomerOrgID" = any(p_allowed_organisation_ids)
  for update;

  if not found then
    raise exception 'WMS404: This warehouse order does not exist in your workspace.';
  end if;
  if v_order."WMSOrder_StatusCode" in ('complete', 'cancelled') then
    raise exception 'WMS409: This order is already final.';
  end if;
  if not (
    p_payload ? 'priorityCode' or p_payload ? 'customerReference' or p_payload ? 'requestedDate' or
    p_payload ? 'vehicleReg' or p_payload ? 'containerNumber' or p_payload ? 'sealNumber' or
    p_payload ? 'instructions'
  ) then
    raise exception 'WMS400: Choose at least one order detail to change.';
  end if;

  update public."WMS_Orders" set
    "WMSOrder_PriorityCode" = case when p_payload ? 'priorityCode' then nullif(btrim(p_payload->>'priorityCode'), '') else "WMSOrder_PriorityCode" end,
    "WMSOrder_CustomerReference" = case when p_payload ? 'customerReference' then nullif(btrim(p_payload->>'customerReference'), '') else "WMSOrder_CustomerReference" end,
    "WMSOrder_RequestedDate" = case when p_payload ? 'requestedDate' then nullif(p_payload->>'requestedDate', '')::date else "WMSOrder_RequestedDate" end,
    "WMSOrder_VehicleReg" = case when p_payload ? 'vehicleReg' then nullif(btrim(p_payload->>'vehicleReg'), '') else "WMSOrder_VehicleReg" end,
    "WMSOrder_ContainerNumber" = case when p_payload ? 'containerNumber' then upper(nullif(btrim(p_payload->>'containerNumber'), '')) else "WMSOrder_ContainerNumber" end,
    "WMSOrder_SealNumber" = case when p_payload ? 'sealNumber' then nullif(btrim(p_payload->>'sealNumber'), '') else "WMSOrder_SealNumber" end,
    "WMSOrder_Instructions" = case when p_payload ? 'instructions' then nullif(btrim(p_payload->>'instructions'), '') else "WMSOrder_Instructions" end,
    "WMSOrder_UpdatedAt" = now(),
    "WMSOrder_UpdatedBy" = p_actor_user_id
  where "WMSOrder_ID" = p_order_id;

  return p_order_id;
end;
$$;

revoke all on function public.warehouse_edge_update_order_mutation(uuid, jsonb, uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_update_order_mutation(uuid, jsonb, uuid, uuid[], uuid[]) to service_role;

create or replace function public.multideck_dexter_domain_warehouse_calendar(
  p_company_id uuid,
  p_search text,
  p_take integer
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
with parameters as (
  select nullif(btrim(p_search), '') search, greatest(1, least(coalesce(p_take, 20), 50)) take
), company_facilities as (
  select facility.*
  from public."WMS_Facilities" facility
  join public."cmp_Offices" office
    on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
   and office."Company_ID" = p_company_id
  where not facility."WMSFacility_IsDeleted"
), calendar_rows as (
  select jsonb_build_object(
    'recordId', orders."WMSOrder_ID",
    'orderNumber', orders."WMSOrder_OrderNumber",
    'type', orders."WMSOrder_TypeCode",
    'status', orders."WMSOrder_StatusCode",
    'facility', facility."WMSFacility_Code",
    'facilityName', facility."WMSFacility_Name",
    'customerReference', orders."WMSOrder_CustomerReference",
    'requestedDate', orders."WMSOrder_RequestedDate",
    'appointmentStartAt', orders."WMSOrder_AppointmentStartAt",
    'appointmentEndAt', orders."WMSOrder_AppointmentEndAt",
    'vehicleReg', orders."WMSOrder_VehicleReg",
    'containerNumber', orders."WMSOrder_ContainerNumber",
    'readOnly', true
  ) value,
  coalesce(orders."WMSOrder_AppointmentStartAt", orders."WMSOrder_RequestedDate"::timestamptz) event_at
  from public."WMS_Orders" orders
  join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID"
  cross join parameters p
  where not orders."WMSOrder_IsDeleted"
    and orders."WMSOrder_StatusCode" <> 'cancelled'
    and coalesce(orders."WMSOrder_AppointmentStartAt", orders."WMSOrder_RequestedDate"::timestamptz) is not null
    and (
      p.search is null or concat_ws(' ', orders."WMSOrder_OrderNumber", orders."WMSOrder_CustomerReference",
        orders."WMSOrder_TypeCode", orders."WMSOrder_StatusCode", facility."WMSFacility_Code",
        facility."WMSFacility_Name", orders."WMSOrder_RequestedDate", orders."WMSOrder_AppointmentStartAt")
      ilike '%' || p.search || '%'
    )
  order by event_at asc
  limit (select take from parameters)
)
select case when public._multideck_dexter_can_manage(
  (select user_row."User_ID" from public."cmp_Users" user_row
   where user_row."Auth_User_ID" = auth.uid() and user_row."Company_ID" = p_company_id limit 1)
) then coalesce((select jsonb_agg(value order by event_at) from calendar_rows), '[]'::jsonb)
else '[]'::jsonb end;
$$;

revoke all on function public.multideck_dexter_domain_warehouse_calendar(uuid, text, integer) from public, anon, authenticated;

create or replace function public.multideck_dexter_domain_warehouse_orders(
  p_company_id uuid,
  p_search text,
  p_take integer
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
with parameters as (
  select nullif(btrim(p_search), '') search, greatest(1, least(coalesce(p_take, 10), 25)) take
), company_facilities as (
  select facility.*
  from public."WMS_Facilities" facility
  join public."cmp_Offices" office
    on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
   and office."Company_ID" = p_company_id
  where not facility."WMSFacility_IsDeleted"
), order_rows as (
  select jsonb_build_object(
    'recordId', orders."WMSOrder_ID",
    'orderNumber', orders."WMSOrder_OrderNumber",
    'type', orders."WMSOrder_TypeCode",
    'status', orders."WMSOrder_StatusCode",
    'priority', orders."WMSOrder_PriorityCode",
    'facilityId', orders."WMSOrder_FacilityID",
    'facility', facility."WMSFacility_Code",
    'facilityName', facility."WMSFacility_Name",
    'customerOrgId', orders."WMSOrder_CustomerOrgID",
    'customerReference', orders."WMSOrder_CustomerReference",
    'requestedDate', orders."WMSOrder_RequestedDate",
    'appointmentStartAt', orders."WMSOrder_AppointmentStartAt",
    'appointmentEndAt', orders."WMSOrder_AppointmentEndAt",
    'vehicleReg', orders."WMSOrder_VehicleReg",
    'containerNumber', orders."WMSOrder_ContainerNumber",
    'sealNumber', orders."WMSOrder_SealNumber",
    'instructions', orders."WMSOrder_Instructions",
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderLineId', line."WMSOrderLine_ID",
        'lineNumber', line."WMSOrderLine_LineNo",
        'itemId', line."WMSOrderLine_ItemID",
        'sku', item."WMSItem_SKU",
        'description', item."WMSItem_Description",
        'status', line."WMSOrderLine_StatusCode",
        'orderedQuantity', line."WMSOrderLine_OrderedQuantity",
        'receivedQuantity', line."WMSOrderLine_ReceivedQuantity",
        'dispatchedQuantity', line."WMSOrderLine_DispatchedQuantity",
        'remainingQuantity', greatest(0, line."WMSOrderLine_OrderedQuantity" - case when orders."WMSOrder_TypeCode" = 'inbound' then line."WMSOrderLine_ReceivedQuantity" else line."WMSOrderLine_DispatchedQuantity" end),
        'uomCode', line."WMSOrderLine_UOMCode",
        'lotNumber', line."WMSOrderLine_LotNumber",
        'expiryDate', line."WMSOrderLine_ExpiryDate",
        'sourceLocationId', line."WMSOrderLine_SourceLocationID",
        'targetLocationId', line."WMSOrderLine_TargetLocationID",
        'customsStatusCode', line."WMSOrderLine_CustomsStatusCode"
      ) order by line."WMSOrderLine_LineNo")
      from (
        select * from public."WMS_OrderLines" order_line
        where order_line."WMSOrderLine_OrderID" = orders."WMSOrder_ID"
        order by order_line."WMSOrderLine_LineNo"
        limit 100
      ) line
      join public."WMS_Items" item on item."WMSItem_ID" = line."WMSOrderLine_ItemID"
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recordId', receipt."WMSReceipt_ID", 'receiptNumber', receipt."WMSReceipt_ReceiptNumber",
        'status', receipt."WMSReceipt_StatusCode", 'receivedAt', receipt."WMSReceipt_ReceivedAt",
        'hasDiscrepancy', receipt."WMSReceipt_HasDiscrepancy", 'notes', receipt."WMSReceipt_Notes"
      ) order by receipt."WMSReceipt_CreatedAt")
      from (
        select * from public."WMS_Receipts" order_receipt
        where order_receipt."WMSReceipt_OrderID" = orders."WMSOrder_ID"
        order by order_receipt."WMSReceipt_CreatedAt" desc
        limit 25
      ) receipt
    ), '[]'::jsonb),
    'dispatches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recordId', dispatch."WMSDispatch_ID", 'dispatchNumber', dispatch."WMSDispatch_DispatchNumber",
        'status', dispatch."WMSDispatch_StatusCode", 'dispatchedAt', dispatch."WMSDispatch_DispatchedAt",
        'vehicleReg', dispatch."WMSDispatch_VehicleReg", 'containerNumber', dispatch."WMSDispatch_ContainerNumber",
        'sealNumber', dispatch."WMSDispatch_SealNumber"
      ) order by dispatch."WMSDispatch_CreatedAt")
      from (
        select * from public."WMS_Dispatches" order_dispatch
        where order_dispatch."WMSDispatch_OrderID" = orders."WMSOrder_ID"
        order by order_dispatch."WMSDispatch_CreatedAt" desc
        limit 25
      ) dispatch
    ), '[]'::jsonb)
  ) value, orders."WMSOrder_UpdatedAt" updated_at
  from public."WMS_Orders" orders
  join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID"
  cross join parameters p
  where not orders."WMSOrder_IsDeleted"
    and (p.search is null or concat_ws(' ', orders."WMSOrder_OrderNumber", orders."WMSOrder_CustomerReference",
      orders."WMSOrder_TypeCode", orders."WMSOrder_StatusCode", facility."WMSFacility_Code",
      orders."WMSOrder_ContainerNumber", orders."WMSOrder_VehicleReg") ilike '%' || p.search || '%')
  order by orders."WMSOrder_UpdatedAt" desc
  limit (select take from parameters)
)
select case when public._multideck_dexter_can_manage(
  (select user_row."User_ID" from public."cmp_Users" user_row
   where user_row."Auth_User_ID" = auth.uid() and user_row."Company_ID" = p_company_id limit 1)
) then coalesce((select jsonb_agg(value order by updated_at desc) from order_rows), '[]'::jsonb)
else '[]'::jsonb end;
$$;

revoke all on function public.multideck_dexter_domain_warehouse_orders(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'warehouse_calendar', 'Warehouse calendar',
  'Read-only warehouse schedule derived from inbound and outbound order requested dates and appointment windows. Calendar blocks are changed only by their underlying warehouse orders.',
  'multideck_dexter_domain_warehouse_calendar', 17, true, now()
) , (
  'warehouse_orders', 'Warehouse orders',
  'Detailed inbound and outbound warehouse orders with exact line identifiers, progress, receipts and dispatches for evidence-backed goods-in and goods-out work.',
  'multideck_dexter_domain_warehouse_orders', 18, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

do $$
declare function_name text;
begin
  foreach function_name in array array[
    'multideck_dexter_action_update_warehouse_order',
    'multideck_dexter_action_receive_warehouse_order',
    'multideck_dexter_action_dispatch_warehouse_order',
    'multideck_dexter_action_cancel_warehouse_order',
    'multideck_dexter_action_move_warehouse_inventory',
    'multideck_dexter_action_move_warehouse_handling_unit',
    'multideck_dexter_action_consolidate_warehouse_handling_units',
    'multideck_dexter_action_change_warehouse_inventory_status',
    'multideck_dexter_action_record_warehouse_sample',
    'multideck_dexter_action_resolve_warehouse_location_exception'
  ] loop
    execute format(
      'create or replace function public.%I(uuid, uuid, jsonb) returns jsonb language sql security definer set search_path = pg_catalog, public as $fn$ select public._multideck_dexter_edge_action_only() $fn$',
      function_name
    );
    execute format('revoke all on function public.%I(uuid, uuid, jsonb) from public, anon, authenticated', function_name);
  end loop;
end $$;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt"
) values
('update_warehouse_order','warehouse','Edit warehouse order','Edit the reference, priority, requested date, vehicle, container, seal or instructions on an exact non-final order.','multideck_dexter_action_update_warehouse_order',
 '{"type":"object","properties":{"target_id":{"type":"string"},"priorityCode":{"type":["string","null"]},"customerReference":{"type":["string","null"]},"requestedDate":{"type":["string","null"]},"vehicleReg":{"type":["string","null"]},"containerNumber":{"type":["string","null"]},"sealNumber":{"type":["string","null"]},"instructions":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","priorityCode","customerReference","requestedDate","vehicleReg","containerNumber","sealNumber","instructions","reason"],"additionalProperties":false}'::jsonb,111,true,now()),
('receive_warehouse_order','warehouse','Receive goods in','Post an evidence-backed receipt against an exact inbound warehouse order.','multideck_dexter_action_receive_warehouse_order',
 '{"type":"object","properties":{"target_id":{"type":"string"},"receivingLocationId":{"type":["string","null"]},"handlingUnitId":{"type":["string","null"]},"newHandlingUnit":{"type":["object","null"],"properties":{"typeCode":{"type":"string"},"code":{"type":["string","null"]},"sscc":{"type":["string","null"]},"externalReference":{"type":["string","null"]}},"required":["typeCode","code","sscc","externalReference"],"additionalProperties":false},"notes":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"items":{"type":"object","properties":{"orderLineId":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"damagedQuantity":{"type":"number","minimum":0},"missingQuantity":{"type":"number","minimum":0},"targetLocationId":{"type":["string","null"]},"lotNumber":{"type":["string","null"]},"batchNumber":{"type":["string","null"]},"manufactureDate":{"type":["string","null"]},"expiryDate":{"type":["string","null"]}},"required":["orderLineId","quantity","damagedQuantity","missingQuantity","targetLocationId","lotNumber","batchNumber","manufactureDate","expiryDate"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","receivingLocationId","handlingUnitId","newHandlingUnit","notes","lines","reason"],"additionalProperties":false}'::jsonb,112,true,now()),
('dispatch_warehouse_order','warehouse','Dispatch goods out','Post an evidence-backed dispatch against an exact outbound warehouse order.','multideck_dexter_action_dispatch_warehouse_order',
 '{"type":"object","properties":{"target_id":{"type":"string"},"vehicleReg":{"type":["string","null"]},"containerNumber":{"type":["string","null"]},"sealNumber":{"type":["string","null"]},"notes":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"items":{"type":"object","properties":{"orderLineId":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"sourceLocationId":{"type":["string","null"]},"lotId":{"type":["string","null"]}},"required":["orderLineId","quantity","sourceLocationId","lotId"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","vehicleReg","containerNumber","sealNumber","notes","lines","reason"],"additionalProperties":false}'::jsonb,113,true,now()),
('cancel_warehouse_order','warehouse','Cancel warehouse order','Cancel an exact non-final order only when no stock movement has been posted.','multideck_dexter_action_cancel_warehouse_order',
 '{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,114,true,now()),
('move_warehouse_inventory','warehouse','Move warehouse stock','Move an exact stock balance to an exact location or warehouse object.','multideck_dexter_action_move_warehouse_inventory',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"targetLocationId":{"type":"string"},"targetHandlingUnitId":{"type":["string","null"]},"actualSourceLocationId":{"type":["string","null"]},"reasonCode":{"type":"string"},"overrideReason":{"type":["string","null"]},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","quantity","targetLocationId","targetHandlingUnitId","actualSourceLocationId","reasonCode","overrideReason","notes","reason"],"additionalProperties":false}'::jsonb,115,true,now()),
('move_warehouse_handling_unit','warehouse','Move warehouse object','Move an exact pallet, carton or other warehouse object and its stock.','multideck_dexter_action_move_warehouse_handling_unit',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":"string"},"targetLocationId":{"type":"string"},"actualSourceLocationId":{"type":["string","null"]},"reasonCode":{"type":"string"},"overrideReason":{"type":["string","null"]},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","targetLocationId","actualSourceLocationId","reasonCode","overrideReason","notes","reason"],"additionalProperties":false}'::jsonb,116,true,now()),
('consolidate_warehouse_handling_units','warehouse','Consolidate warehouse objects','Move stock from exact source warehouse objects into one exact target object.','multideck_dexter_action_consolidate_warehouse_handling_units',
 '{"type":"object","properties":{"facilityId":{"type":"string"},"targetHandlingUnitId":{"type":"string"},"sourceHandlingUnitIds":{"type":"array","minItems":1,"items":{"type":"string"}},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["facilityId","targetHandlingUnitId","sourceHandlingUnitIds","notes","reason"],"additionalProperties":false}'::jsonb,117,true,now()),
('change_warehouse_inventory_status','warehouse','Change warehouse stock status','Move an exact stock quantity into an exact inventory status such as available, quarantine or damaged.','multideck_dexter_action_change_warehouse_inventory_status',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"targetStatusCode":{"type":"string"},"reasonCode":{"type":"string"},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","quantity","targetStatusCode","reasonCode","notes","reason"],"additionalProperties":false}'::jsonb,118,true,now()),
('record_warehouse_sample','warehouse','Record warehouse sample','Record an onsite or removed sample from an exact stock balance.','multideck_dexter_action_record_warehouse_sample',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"disposition":{"type":"string","enum":["onsite","removed"]},"targetStatusCode":{"type":["string","null"]},"reasonCode":{"type":"string"},"recipient":{"type":["string","null"]},"custodyReference":{"type":["string","null"]},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","quantity","disposition","targetStatusCode","reasonCode","recipient","custodyReference","notes","reason"],"additionalProperties":false}'::jsonb,119,true,now()),
('resolve_warehouse_location_exception','warehouse','Resolve warehouse location exception','Resolve an exact missing-stock location exception or request a separately approved loss adjustment.','multideck_dexter_action_resolve_warehouse_location_exception',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":"string"},"resolution":{"type":"string","enum":["found","data_error","request_loss","approve_loss"]},"actualLocationId":{"type":["string","null"]},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","resolution","actualLocationId","notes","reason"],"additionalProperties":false}'::jsonb,120,true,now())
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now();

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Warehouse orders, goods-in receipts, goods-out dispatches, inventory balances and movements, handling units and unresolved exceptions. Dexter can use explicit approval-safe actions for connected operational writes.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'warehouse';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Warehouse orders, goods-in receipts, goods-out dispatches, stock movements, facilities, locations, items, handling units and inventory exceptions.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'warehouse';

commit;
