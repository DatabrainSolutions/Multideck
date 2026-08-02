begin;

create or replace function public.warehouse_edge_dashboard(
  p_company_id uuid,
  p_allowed_organisation_ids uuid[] default '{}'::uuid[],
  p_allowed_facility_ids uuid[] default '{}'::uuid[],
  p_movement_take integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facility_ids uuid[] := coalesce(p_allowed_facility_ids, '{}'::uuid[]);
  v_organisation_ids uuid[] := coalesce(p_allowed_organisation_ids, '{}'::uuid[]);
  v_orders jsonb := '[]'::jsonb;
  v_metrics jsonb := jsonb_build_object('onHandSkus', 0, 'availableSkus', 0, 'heldBalances', 0);
  v_movements jsonb := '[]'::jsonb;
begin
  if p_company_id is not null then
    select coalesce(array_agg(facility."WMSFacility_ID"), '{}'::uuid[])
    into v_facility_ids
    from public."WMS_Facilities" facility
    join public."cmp_Offices" office
      on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
    where office."Company_ID" = p_company_id
      and not facility."WMSFacility_IsDeleted";
  end if;

  if coalesce(array_length(v_facility_ids, 1), 0) = 0 then
    return jsonb_build_object('orders', v_orders, 'metrics', v_metrics, 'movements', v_movements);
  end if;

  with scoped_orders as materialized (
    select warehouse_order.*,
           facility."WMSFacility_Code" as facility_code,
           facility."WMSFacility_Name" as facility_name,
           organisation."Org_Name" as customer_name,
           order_type."WMSOrderType_Name" as type_name,
           order_status."WMSOrderStatus_Name" as status_name
    from public."WMS_Orders" warehouse_order
    join public."WMS_Facilities" facility
      on facility."WMSFacility_ID" = warehouse_order."WMSOrder_FacilityID"
    left join public."Org_Master" organisation
      on organisation."Org_id" = warehouse_order."WMSOrder_CustomerOrgID"
    left join public."sys_WMSOrderTypes" order_type
      on order_type."WMSOrderType_Code" = warehouse_order."WMSOrder_TypeCode"
    left join public."sys_WMSOrderStatuses" order_status
      on order_status."WMSOrderStatus_Code" = warehouse_order."WMSOrder_StatusCode"
    where warehouse_order."WMSOrder_FacilityID" = any(v_facility_ids)
      and not warehouse_order."WMSOrder_IsDeleted"
      and (
        p_company_id is not null
        or warehouse_order."WMSOrder_CustomerOrgID" = any(v_organisation_ids)
      )
    order by warehouse_order."WMSOrder_CreatedAt" desc
    limit 500
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', warehouse_order."WMSOrder_ID",
    'facilityId', warehouse_order."WMSOrder_FacilityID",
    'facilityCode', warehouse_order.facility_code,
    'facilityName', warehouse_order.facility_name,
    'officeId', warehouse_order."WMSOrder_OrgOfficeID",
    'officeName', null,
    'customerOrgId', warehouse_order."WMSOrder_CustomerOrgID",
    'customerName', coalesce(warehouse_order.customer_name, ''),
    'orderNumber', warehouse_order."WMSOrder_OrderNumber",
    'typeCode', warehouse_order."WMSOrder_TypeCode",
    'typeName', warehouse_order.type_name,
    'statusCode', warehouse_order."WMSOrder_StatusCode",
    'statusName', warehouse_order.status_name,
    'priorityCode', warehouse_order."WMSOrder_PriorityCode",
    'customerReference', warehouse_order."WMSOrder_CustomerReference",
    'requestedDate', warehouse_order."WMSOrder_RequestedDate",
    'appointmentStartAt', warehouse_order."WMSOrder_AppointmentStartAt",
    'appointmentEndAt', warehouse_order."WMSOrder_AppointmentEndAt",
    'vehicleReg', warehouse_order."WMSOrder_VehicleReg",
    'containerNumber', warehouse_order."WMSOrder_ContainerNumber",
    'sealNumber', warehouse_order."WMSOrder_SealNumber",
    'instructions', warehouse_order."WMSOrder_Instructions",
    'createdAt', warehouse_order."WMSOrder_CreatedAt",
    'updatedAt', warehouse_order."WMSOrder_UpdatedAt",
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', order_line."WMSOrderLine_ID",
        'lineNumber', order_line."WMSOrderLine_LineNo",
        'itemId', order_line."WMSOrderLine_ItemID",
        'sku', coalesce(item."WMSItem_SKU", ''),
        'description', coalesce(item."WMSItem_Description", ''),
        'statusCode', order_line."WMSOrderLine_StatusCode",
        'orderedQuantity', order_line."WMSOrderLine_OrderedQuantity",
        'receivedQuantity', order_line."WMSOrderLine_ReceivedQuantity",
        'pickedQuantity', order_line."WMSOrderLine_PickedQuantity",
        'packedQuantity', order_line."WMSOrderLine_PackedQuantity",
        'dispatchedQuantity', order_line."WMSOrderLine_DispatchedQuantity",
        'remainingQuantity', greatest(0, order_line."WMSOrderLine_OrderedQuantity" - case when warehouse_order."WMSOrder_TypeCode" = 'inbound' then order_line."WMSOrderLine_ReceivedQuantity" else order_line."WMSOrderLine_DispatchedQuantity" end),
        'uomCode', order_line."WMSOrderLine_UOMCode",
        'lotNumber', order_line."WMSOrderLine_LotNumber",
        'expiryDate', order_line."WMSOrderLine_ExpiryDate",
        'sourceLocationId', order_line."WMSOrderLine_SourceLocationID",
        'sourceLocationCode', source_location."WMSLocation_Code",
        'targetLocationId', order_line."WMSOrderLine_TargetLocationID",
        'targetLocationCode', target_location."WMSLocation_Code",
        'inventoryStatusCode', order_line."WMSOrderLine_InventoryStatusCode",
        'customsStatusCode', order_line."WMSOrderLine_CustomsStatusCode",
        'goodsValue', order_line."WMSOrderLine_GoodsValue",
        'currencyCode', order_line."WMSOrderLine_CurrencyCode",
        'instructions', order_line."WMSOrderLine_Instructions"
      ) order by order_line."WMSOrderLine_LineNo")
      from public."WMS_OrderLines" order_line
      left join public."WMS_Items" item
        on item."WMSItem_ID" = order_line."WMSOrderLine_ItemID"
      left join public."WMS_Locations" source_location
        on source_location."WMSLocation_ID" = order_line."WMSOrderLine_SourceLocationID"
      left join public."WMS_Locations" target_location
        on target_location."WMSLocation_ID" = order_line."WMSOrderLine_TargetLocationID"
      where order_line."WMSOrderLine_OrderID" = warehouse_order."WMSOrder_ID"
    ), '[]'::jsonb),
    'receipts', '[]'::jsonb,
    'dispatches', '[]'::jsonb
  ) order by warehouse_order."WMSOrder_CreatedAt" desc), '[]'::jsonb)
  into v_orders
  from scoped_orders warehouse_order;

  select jsonb_build_object(
    'onHandSkus', count(distinct balance."WMSBalance_ItemID") filter (where balance."WMSBalance_OnHandQuantity" > 0),
    'availableSkus', count(distinct balance."WMSBalance_ItemID") filter (where balance."WMSBalance_AvailableQuantity" > 0),
    'heldBalances', count(*) filter (where balance."WMSBalance_HeldQuantity" > 0 or balance."WMSBalance_InventoryStatusCode" <> 'available')
  )
  into v_metrics
  from public."WMS_InventoryBalances" balance
  where balance."WMSBalance_FacilityID" = any(v_facility_ids)
    and balance."WMSBalance_OnHandQuantity" <> 0
    and (
      p_company_id is not null
      or balance."WMSBalance_CustomerOrgID" = any(v_organisation_ids)
    );

  with recent_movements as materialized (
    select movement.*,
           facility."WMSFacility_Name" as facility_name,
           item."WMSItem_SKU" as item_sku,
           item."WMSItem_Description" as item_description,
           from_location."WMSLocation_Code" as from_location_code,
           to_location."WMSLocation_Code" as to_location_code,
           lot."WMSLot_LotNumber" as lot_number,
           lot."WMSLot_BatchNumber" as batch_number
    from public."WMS_InventoryTransactions" movement
    join public."WMS_Facilities" facility
      on facility."WMSFacility_ID" = movement."WMSTransaction_FacilityID"
    left join public."WMS_Items" item
      on item."WMSItem_ID" = movement."WMSTransaction_ItemID"
    left join public."WMS_Locations" from_location
      on from_location."WMSLocation_ID" = movement."WMSTransaction_FromLocationID"
    left join public."WMS_Locations" to_location
      on to_location."WMSLocation_ID" = movement."WMSTransaction_ToLocationID"
    left join public."WMS_InventoryLots" lot
      on lot."WMSLot_ID" = movement."WMSTransaction_LotID"
    where movement."WMSTransaction_FacilityID" = any(v_facility_ids)
      and (
        p_company_id is not null
        or movement."WMSTransaction_CustomerOrgID" = any(v_organisation_ids)
      )
    order by movement."WMSTransaction_CreatedAt" desc
    limit greatest(1, least(coalesce(p_movement_take, 50), 100))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', movement."WMSTransaction_ID",
    'facilityId', movement."WMSTransaction_FacilityID",
    'facilityName', movement.facility_name,
    'itemId', movement."WMSTransaction_ItemID",
    'sku', coalesce(movement.item_sku, ''),
    'itemDescription', coalesce(movement.item_description, ''),
    'typeCode', movement."WMSTransaction_TypeCode",
    'typeName', movement."WMSTransaction_TypeCode",
    'quantity', movement."WMSTransaction_Quantity",
    'uomCode', movement."WMSTransaction_UOMCode",
    'fromLocationCode', movement.from_location_code,
    'toLocationCode', movement.to_location_code,
    'lotNumber', movement.lot_number,
    'batchNumber', movement.batch_number,
    'reference', movement."WMSTransaction_Reference",
    'notes', movement."WMSTransaction_Notes",
    'createdAt', movement."WMSTransaction_CreatedAt"
  ) order by movement."WMSTransaction_CreatedAt" desc), '[]'::jsonb)
  into v_movements
  from recent_movements movement;

  return jsonb_build_object('orders', v_orders, 'metrics', v_metrics, 'movements', v_movements);
end;
$$;

revoke all on function public.warehouse_edge_dashboard(uuid, uuid[], uuid[], integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_dashboard(uuid, uuid[], uuid[], integer) to service_role;

commit;
