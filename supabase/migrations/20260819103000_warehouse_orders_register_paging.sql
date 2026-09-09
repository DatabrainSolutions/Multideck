-- Bounded Warehouse order and purchase-order read models. The Warehouse Edge
-- Function supplies the actor's authorised facility/organisation allowlists;
-- PostgreSQL then filters, sorts, counts and returns at most one page. These
-- service-role-only functions do not create or modify operational data.

begin;

create or replace function public.warehouse_edge_dashboard_summary(
  p_company_id uuid,
  p_allowed_organisation_ids uuid[] default '{}'::uuid[],
  p_allowed_facility_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_facility_ids uuid[] := coalesce(p_allowed_facility_ids, '{}'::uuid[]);
  v_organisation_ids uuid[] := coalesce(p_allowed_organisation_ids, '{}'::uuid[]);
  v_ready_to_receive bigint := 0;
  v_ready_to_dispatch bigint := 0;
  v_stock_holds bigint := 0;
  v_past_due bigint := 0;
  v_booked_today bigint := 0;
  v_on_hand_skus bigint := 0;
  v_available_skus bigint := 0;
begin
  if p_company_id is not null then
    select coalesce(array_agg(facility."WMSFacility_ID"), '{}'::uuid[])
    into v_facility_ids
    from public."WMS_Facilities" facility
    join public."cmp_Offices" office on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
    where office."Company_ID" = p_company_id and not facility."WMSFacility_IsDeleted";
  end if;

  if coalesce(cardinality(v_facility_ids), 0) = 0 then
    return jsonb_build_object(
      'readyToReceive', 0, 'readyToDispatch', 0, 'stockHolds', 0,
      'pastDue', 0, 'bookedToday', 0, 'onHandSkus', 0, 'availableSkus', 0
    );
  end if;

  select
    count(*) filter (where warehouse_order."WMSOrder_TypeCode" = 'inbound'),
    count(*) filter (where warehouse_order."WMSOrder_TypeCode" = 'outbound'),
    count(*) filter (where coalesce(warehouse_order."WMSOrder_AppointmentStartAt"::date, warehouse_order."WMSOrder_RequestedDate") < current_date),
    count(*) filter (where coalesce(warehouse_order."WMSOrder_AppointmentStartAt"::date, warehouse_order."WMSOrder_RequestedDate") = current_date)
  into v_ready_to_receive, v_ready_to_dispatch, v_past_due, v_booked_today
  from public."WMS_Orders" warehouse_order
  join public."sys_WMSOrderStatuses" order_status
    on order_status."WMSOrderStatus_Code" = warehouse_order."WMSOrder_StatusCode"
  where warehouse_order."WMSOrder_FacilityID" = any(v_facility_ids)
    and not warehouse_order."WMSOrder_IsDeleted"
    and order_status."WMSOrderStatus_IsOpen"
    and (p_company_id is not null or warehouse_order."WMSOrder_CustomerOrgID" = any(v_organisation_ids));

  select
    count(*) filter (where balance."WMSBalance_HeldQuantity" > 0 or balance."WMSBalance_InventoryStatusCode" <> 'available'),
    count(distinct balance."WMSBalance_ItemID") filter (where balance."WMSBalance_OnHandQuantity" > 0),
    count(distinct balance."WMSBalance_ItemID") filter (where balance."WMSBalance_AvailableQuantity" > 0)
  into v_stock_holds, v_on_hand_skus, v_available_skus
  from public."WMS_InventoryBalances" balance
  where balance."WMSBalance_FacilityID" = any(v_facility_ids)
    and balance."WMSBalance_OnHandQuantity" <> 0
    and (balance."WMSBalance_HeldQuantity" > 0 or balance."WMSBalance_InventoryStatusCode" <> 'available')
    and (p_company_id is not null or balance."WMSBalance_CustomerOrgID" = any(v_organisation_ids));

  return jsonb_build_object(
    'readyToReceive', v_ready_to_receive,
    'readyToDispatch', v_ready_to_dispatch,
    'stockHolds', v_stock_holds,
    'pastDue', v_past_due,
    'bookedToday', v_booked_today,
    'onHandSkus', v_on_hand_skus,
    'availableSkus', v_available_skus
  );
end;
$$;

create or replace function public.warehouse_edge_calendar_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_start_date date default current_date,
  p_end_date date default current_date + 7,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_start date := coalesce(p_start_date, current_date);
  v_end date := least(coalesce(p_end_date, current_date + 7), coalesce(p_start_date, current_date) + 45);
  v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids), 0) = 0 or v_end <= v_start then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset);
  end if;

  with filtered as materialized (
    select
      warehouse_order.*,
      facility."WMSFacility_Code" as facility_code,
      facility."WMSFacility_Name" as facility_name,
      organisation."Org_Name" as customer_name,
      order_type."WMSOrderType_Name" as type_name,
      order_status."WMSOrderStatus_Name" as status_name,
      coalesce(warehouse_order."WMSOrder_AppointmentStartAt"::date, warehouse_order."WMSOrder_RequestedDate") as expected_date
    from public."WMS_Orders" warehouse_order
    join public."WMS_Facilities" facility on facility."WMSFacility_ID" = warehouse_order."WMSOrder_FacilityID"
    join public."Org_Master" organisation on organisation."Org_id" = warehouse_order."WMSOrder_CustomerOrgID"
    left join public."sys_WMSOrderTypes" order_type on order_type."WMSOrderType_Code" = warehouse_order."WMSOrder_TypeCode"
    left join public."sys_WMSOrderStatuses" order_status on order_status."WMSOrderStatus_Code" = warehouse_order."WMSOrder_StatusCode"
    where warehouse_order."WMSOrder_FacilityID" = any(p_allowed_facility_ids)
      and (p_allowed_org_ids is null or warehouse_order."WMSOrder_CustomerOrgID" = any(p_allowed_org_ids))
      and not warehouse_order."WMSOrder_IsDeleted"
      and warehouse_order."WMSOrder_StatusCode" <> 'cancelled'
      and coalesce(warehouse_order."WMSOrder_AppointmentStartAt"::date, warehouse_order."WMSOrder_RequestedDate") >= v_start
      and coalesce(warehouse_order."WMSOrder_AppointmentStartAt"::date, warehouse_order."WMSOrder_RequestedDate") < v_end
  ), ranked as (
    select *, row_number() over (
      order by expected_date, "WMSOrder_AppointmentStartAt" nulls last, "WMSOrder_OrderNumber", "WMSOrder_ID"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row."WMSOrder_ID", 'facilityId', row."WMSOrder_FacilityID",
      'facilityCode', row.facility_code, 'facilityName', row.facility_name,
      'officeId', row."WMSOrder_OrgOfficeID", 'officeName', null,
      'customerOrgId', row."WMSOrder_CustomerOrgID", 'customerName', row.customer_name,
      'orderNumber', row."WMSOrder_OrderNumber", 'typeCode', row."WMSOrder_TypeCode", 'typeName', row.type_name,
      'statusCode', row."WMSOrder_StatusCode", 'statusName', row.status_name,
      'priorityCode', row."WMSOrder_PriorityCode", 'customerReference', row."WMSOrder_CustomerReference",
      'requestedDate', row."WMSOrder_RequestedDate", 'appointmentStartAt', row."WMSOrder_AppointmentStartAt",
      'appointmentEndAt', row."WMSOrder_AppointmentEndAt", 'vehicleReg', row."WMSOrder_VehicleReg",
      'containerNumber', row."WMSOrder_ContainerNumber", 'sealNumber', row."WMSOrder_SealNumber",
      'instructions', row."WMSOrder_Instructions", 'createdAt', row."WMSOrder_CreatedAt",
      'updatedAt', row."WMSOrder_UpdatedAt", 'lines', '[]'::jsonb,
      'receipts', '[]'::jsonb, 'dispatches', '[]'::jsonb
    ) order by row.ordinal) from page row), '[]'::jsonb),
    'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.warehouse_edge_orders_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null,
  p_type_code text default null,
  p_status text default null,
  p_open_only boolean default false,
  p_search text default null,
  p_sort text default null,
  p_direction text default 'desc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := lower(nullif(btrim(p_search), ''));
  v_status text := nullif(btrim(p_status), '');
  v_direction text := case when lower(p_direction) = 'asc' then 'asc' else 'desc' end;
  v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids), 0) = 0 then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset, 'facets', '[]'::jsonb);
  end if;

  with base as materialized (
    select
      warehouse_order.*,
      facility."WMSFacility_Code" as facility_code,
      facility."WMSFacility_Name" as facility_name,
      organisation."Org_Name" as customer_name,
      order_type."WMSOrderType_Name" as type_name,
      order_status."WMSOrderStatus_Name" as status_name,
      order_status."WMSOrderStatus_IsOpen" as status_is_open,
      coalesce(line_totals.line_count, 0)::integer as line_count,
      coalesce(line_totals.ordered_quantity, 0) as ordered_quantity,
      coalesce(
        case when warehouse_order."WMSOrder_TypeCode" = 'inbound'
          then line_totals.received_quantity
          else line_totals.dispatched_quantity
        end,
        0
      ) as progressed_quantity
    from public."WMS_Orders" warehouse_order
    join public."WMS_Facilities" facility
      on facility."WMSFacility_ID" = warehouse_order."WMSOrder_FacilityID"
    join public."Org_Master" organisation
      on organisation."Org_id" = warehouse_order."WMSOrder_CustomerOrgID"
    left join public."sys_WMSOrderTypes" order_type
      on order_type."WMSOrderType_Code" = warehouse_order."WMSOrder_TypeCode"
    left join public."sys_WMSOrderStatuses" order_status
      on order_status."WMSOrderStatus_Code" = warehouse_order."WMSOrder_StatusCode"
    left join lateral (
      select
        count(*) as line_count,
        coalesce(sum(line."WMSOrderLine_OrderedQuantity"), 0) as ordered_quantity,
        coalesce(sum(line."WMSOrderLine_ReceivedQuantity"), 0) as received_quantity,
        coalesce(sum(line."WMSOrderLine_DispatchedQuantity"), 0) as dispatched_quantity
      from public."WMS_OrderLines" line
      where line."WMSOrderLine_OrderID" = warehouse_order."WMSOrder_ID"
    ) line_totals on true
    where warehouse_order."WMSOrder_FacilityID" = any(p_allowed_facility_ids)
      and (p_allowed_org_ids is null or warehouse_order."WMSOrder_CustomerOrgID" = any(p_allowed_org_ids))
      and (p_facility_id is null or warehouse_order."WMSOrder_FacilityID" = p_facility_id)
      and (p_type_code is null or warehouse_order."WMSOrder_TypeCode" = p_type_code)
      and not warehouse_order."WMSOrder_IsDeleted"
      and (not p_open_only or coalesce(order_status."WMSOrderStatus_IsOpen", false))
      and (
        v_search is null
        or strpos(lower(concat_ws(' ',
          warehouse_order."WMSOrder_OrderNumber",
          warehouse_order."WMSOrder_CustomerReference",
          warehouse_order."WMSOrder_VehicleReg",
          warehouse_order."WMSOrder_ContainerNumber",
          organisation."Org_Name",
          facility."WMSFacility_Code",
          facility."WMSFacility_Name"
        )), v_search) > 0
        or exists (
          select 1
          from public."WMS_OrderLines" search_line
          join public."WMS_Items" search_item on search_item."WMSItem_ID" = search_line."WMSOrderLine_ItemID"
          where search_line."WMSOrderLine_OrderID" = warehouse_order."WMSOrder_ID"
            and strpos(lower(concat_ws(' ', search_item."WMSItem_SKU", search_item."WMSItem_Description")), v_search) > 0
        )
      )
  ), filtered as materialized (
    select *
    from base
    where v_status is null or status_name = v_status or "WMSOrder_StatusCode" = v_status
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_direction = 'asc' then case p_sort
          when 'order' then lower("WMSOrder_OrderNumber")
          when 'customer' then lower(customer_name)
          when 'warehouse' then lower(facility_name)
          when 'direction' then lower(coalesce(type_name, "WMSOrder_TypeCode"))
          when 'status' then lower(coalesce(status_name, "WMSOrder_StatusCode"))
        end end asc nulls last,
        case when v_direction = 'desc' then case p_sort
          when 'order' then lower("WMSOrder_OrderNumber")
          when 'customer' then lower(customer_name)
          when 'warehouse' then lower(facility_name)
          when 'direction' then lower(coalesce(type_name, "WMSOrder_TypeCode"))
          when 'status' then lower(coalesce(status_name, "WMSOrder_StatusCode"))
        end end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'lines' then line_count end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'lines' then line_count end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'progress' then progressed_quantity / nullif(ordered_quantity, 0) end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'progress' then progressed_quantity / nullif(ordered_quantity, 0) end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'requested' then "WMSOrder_RequestedDate" end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'requested' then "WMSOrder_RequestedDate" end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'appointment' then "WMSOrder_AppointmentStartAt" end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'appointment' then "WMSOrder_AppointmentStartAt" end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'expected' then coalesce("WMSOrder_AppointmentStartAt", "WMSOrder_RequestedDate"::timestamp at time zone 'UTC') end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'expected' then coalesce("WMSOrder_AppointmentStartAt", "WMSOrder_RequestedDate"::timestamp at time zone 'UTC') end desc nulls last,
        case when p_sort is null and v_direction = 'asc' then "WMSOrder_UpdatedAt" end asc,
        case when p_sort is null and v_direction = 'desc' then "WMSOrder_UpdatedAt" end desc,
        "WMSOrder_ID"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row."WMSOrder_ID", 'facilityId', row."WMSOrder_FacilityID",
      'facilityCode', row.facility_code, 'facilityName', row.facility_name,
      'officeId', row."WMSOrder_OrgOfficeID", 'officeName', null,
      'customerOrgId', row."WMSOrder_CustomerOrgID", 'customerName', row.customer_name,
      'orderNumber', row."WMSOrder_OrderNumber", 'typeCode', row."WMSOrder_TypeCode",
      'typeName', row.type_name, 'statusCode', row."WMSOrder_StatusCode", 'statusName', row.status_name,
      'priorityCode', row."WMSOrder_PriorityCode", 'customerReference', row."WMSOrder_CustomerReference",
      'requestedDate', row."WMSOrder_RequestedDate", 'appointmentStartAt', row."WMSOrder_AppointmentStartAt",
      'appointmentEndAt', row."WMSOrder_AppointmentEndAt", 'vehicleReg', row."WMSOrder_VehicleReg",
      'containerNumber', row."WMSOrder_ContainerNumber", 'sealNumber', row."WMSOrder_SealNumber",
      'instructions', row."WMSOrder_Instructions", 'createdAt', row."WMSOrder_CreatedAt",
      'updatedAt', row."WMSOrder_UpdatedAt",
      'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', line."WMSOrderLine_ID", 'lineNumber', line."WMSOrderLine_LineNo",
        'itemId', line."WMSOrderLine_ItemID", 'sku', item."WMSItem_SKU",
        'description', item."WMSItem_Description", 'statusCode', line."WMSOrderLine_StatusCode",
        'orderedQuantity', line."WMSOrderLine_OrderedQuantity", 'receivedQuantity', line."WMSOrderLine_ReceivedQuantity",
        'pickedQuantity', line."WMSOrderLine_PickedQuantity", 'packedQuantity', line."WMSOrderLine_PackedQuantity",
        'dispatchedQuantity', line."WMSOrderLine_DispatchedQuantity",
        'remainingQuantity', case when line."WMSOrderLine_StatusCode" = 'short' then 0 else greatest(0,
          line."WMSOrderLine_OrderedQuantity" - case when row."WMSOrder_TypeCode" = 'inbound'
            then line."WMSOrderLine_ReceivedQuantity" else line."WMSOrderLine_DispatchedQuantity" end) end,
        'uomCode', line."WMSOrderLine_UOMCode", 'lotNumber', line."WMSOrderLine_LotNumber",
        'expiryDate', line."WMSOrderLine_ExpiryDate", 'sourceLocationId', line."WMSOrderLine_SourceLocationID",
        'sourceLocationCode', source_location."WMSLocation_Code", 'targetLocationId', line."WMSOrderLine_TargetLocationID",
        'targetLocationCode', target_location."WMSLocation_Code", 'inventoryStatusCode', line."WMSOrderLine_InventoryStatusCode",
        'customsStatusCode', line."WMSOrderLine_CustomsStatusCode", 'goodsValue', line."WMSOrderLine_GoodsValue",
        'currencyCode', line."WMSOrderLine_CurrencyCode", 'instructions', line."WMSOrderLine_Instructions"
      ) order by line."WMSOrderLine_LineNo")
        from public."WMS_OrderLines" line
        join public."WMS_Items" item on item."WMSItem_ID" = line."WMSOrderLine_ItemID"
        left join public."WMS_Locations" source_location on source_location."WMSLocation_ID" = line."WMSOrderLine_SourceLocationID"
        left join public."WMS_Locations" target_location on target_location."WMSLocation_ID" = line."WMSOrderLine_TargetLocationID"
        where line."WMSOrderLine_OrderID" = row."WMSOrder_ID"), '[]'::jsonb),
      'receipts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', receipt."WMSReceipt_ID", 'receiptNumber', receipt."WMSReceipt_ReceiptNumber",
        'statusCode', receipt."WMSReceipt_StatusCode", 'receivedAt', receipt."WMSReceipt_ReceivedAt",
        'hasDiscrepancy', receipt."WMSReceipt_HasDiscrepancy", 'notes', receipt."WMSReceipt_Notes"
      ) order by receipt."WMSReceipt_CreatedAt" desc)
        from public."WMS_Receipts" receipt where receipt."WMSReceipt_OrderID" = row."WMSOrder_ID"), '[]'::jsonb),
      'dispatches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', dispatch."WMSDispatch_ID", 'dispatchNumber', dispatch."WMSDispatch_DispatchNumber",
        'statusCode', dispatch."WMSDispatch_StatusCode", 'dispatchedAt', dispatch."WMSDispatch_DispatchedAt",
        'vehicleReg', dispatch."WMSDispatch_VehicleReg", 'containerNumber', dispatch."WMSDispatch_ContainerNumber",
        'sealNumber', dispatch."WMSDispatch_SealNumber"
      ) order by dispatch."WMSDispatch_CreatedAt" desc)
        from public."WMS_Dispatches" dispatch where dispatch."WMSDispatch_OrderID" = row."WMSOrder_ID"), '[]'::jsonb)
    ) order by row.ordinal) from page row), '[]'::jsonb),
    'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset,
    'facets', coalesce((select jsonb_agg(value order by value) from (
      select distinct coalesce(status_name, "WMSOrder_StatusCode") as value from base
    ) facet_values where value is not null), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.warehouse_edge_purchase_orders_page(
  p_allowed_facility_ids uuid[],
  p_facility_id uuid default null,
  p_status text default null,
  p_open_only boolean default false,
  p_search text default null,
  p_sort text default null,
  p_direction text default 'desc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := lower(nullif(btrim(p_search), ''));
  v_status text := nullif(btrim(p_status), '');
  v_direction text := case when lower(p_direction) = 'asc' then 'asc' else 'desc' end;
  v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids), 0) = 0 then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset, 'facets', '[]'::jsonb);
  end if;

  with base as materialized (
    select
      purchase_order.*,
      facility."WMSFacility_Code" as facility_code,
      facility."WMSFacility_Name" as facility_name,
      organisation."Org_Name" as customer_name,
      coalesce(line_totals.line_count, 0)::integer as line_count
    from public."WMS_PurchaseOrders" purchase_order
    join public."WMS_Facilities" facility on facility."WMSFacility_ID" = purchase_order."WMSPO_FacilityID"
    join public."Org_Master" organisation on organisation."Org_id" = purchase_order."WMSPO_CustomerOrgID"
    left join lateral (
      select count(*) as line_count
      from public."WMS_PurchaseOrderLines" line
      where line."WMSPOLine_PurchaseOrderID" = purchase_order."WMSPO_ID"
    ) line_totals on true
    where purchase_order."WMSPO_FacilityID" = any(p_allowed_facility_ids)
      and (p_facility_id is null or purchase_order."WMSPO_FacilityID" = p_facility_id)
      and not purchase_order."WMSPO_IsDeleted"
      and (not p_open_only or purchase_order."WMSPO_StatusCode" not in ('received', 'cancelled'))
      and (v_search is null or strpos(lower(concat_ws(' ',
        purchase_order."WMSPO_Number", purchase_order."WMSPO_SupplierName",
        purchase_order."WMSPO_BuyerReference", purchase_order."WMSPO_SupplierReference"
      )), v_search) > 0)
  ), filtered as materialized (
    select * from base where v_status is null or "WMSPO_StatusCode" = v_status
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_direction = 'asc' then case p_sort
          when 'number' then lower("WMSPO_Number")
          when 'supplier' then lower("WMSPO_SupplierName")
          when 'warehouse' then lower(facility_name)
          when 'status' then lower("WMSPO_StatusCode")
        end end asc nulls last,
        case when v_direction = 'desc' then case p_sort
          when 'number' then lower("WMSPO_Number")
          when 'supplier' then lower("WMSPO_SupplierName")
          when 'warehouse' then lower(facility_name)
          when 'status' then lower("WMSPO_StatusCode")
        end end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'delivery' then "WMSPO_ExpectedDeliveryDate" end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'delivery' then "WMSPO_ExpectedDeliveryDate" end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'lines' then line_count end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'lines' then line_count end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'total' then "WMSPO_TotalAmount" end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'total' then "WMSPO_TotalAmount" end desc nulls last,
        case when p_sort is null and v_direction = 'asc' then "WMSPO_UpdatedAt" end asc,
        case when p_sort is null and v_direction = 'desc' then "WMSPO_UpdatedAt" end desc,
        "WMSPO_ID"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row."WMSPO_ID", 'facilityId', row."WMSPO_FacilityID", 'facilityCode', row.facility_code,
      'facilityName', row.facility_name, 'customerOrgId', row."WMSPO_CustomerOrgID", 'customerName', row.customer_name,
      'supplierOrgId', row."WMSPO_SupplierOrgID", 'supplierName', row."WMSPO_SupplierName",
      'warehouseOrderId', row."WMSPO_WarehouseOrderID", 'number', row."WMSPO_Number",
      'statusCode', row."WMSPO_StatusCode", 'buyerReference', row."WMSPO_BuyerReference",
      'supplierReference', row."WMSPO_SupplierReference", 'issueDate', row."WMSPO_IssueDate",
      'expectedDeliveryDate', row."WMSPO_ExpectedDeliveryDate", 'currencyCode', row."WMSPO_CurrencyCode",
      'deliveryTerms', row."WMSPO_DeliveryTerms", 'paymentTerms', row."WMSPO_PaymentTerms",
      'deliveryAddress', row."WMSPO_DeliveryAddress", 'notes', row."WMSPO_Notes",
      'netAmount', row."WMSPO_NetAmount", 'taxAmount', row."WMSPO_TaxAmount", 'totalAmount', row."WMSPO_TotalAmount",
      'sourceFileName', row."WMSPO_SourceFileName", 'extractionMode', row."WMSPO_ExtractionModeCode",
      'extractionModel', row."WMSPO_ExtractionModel", 'extractionMetadata', row."WMSPO_ExtractionMetadataJSON",
      'version', row."WMSPO_Version", 'lineCount', row.line_count,
      'createdAt', row."WMSPO_CreatedAt", 'updatedAt', row."WMSPO_UpdatedAt",
      'lines', '[]'::jsonb, 'events', '[]'::jsonb
    ) order by row.ordinal) from page row), '[]'::jsonb),
    'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset,
    'facets', coalesce((select jsonb_agg(value order by value) from (
      select distinct "WMSPO_StatusCode" as value from base
    ) facet_values where value is not null), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_orders_page(uuid[],uuid[],uuid,text,text,boolean,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.warehouse_edge_purchase_orders_page(uuid[],uuid,text,boolean,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.warehouse_edge_dashboard_summary(uuid,uuid[],uuid[]) from public, anon, authenticated;
revoke all on function public.warehouse_edge_calendar_page(uuid[],uuid[],date,date,integer,integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_orders_page(uuid[],uuid[],uuid,text,text,boolean,text,text,text,integer,integer) to service_role;
grant execute on function public.warehouse_edge_purchase_orders_page(uuid[],uuid,text,boolean,text,text,text,integer,integer) to service_role;
grant execute on function public.warehouse_edge_dashboard_summary(uuid,uuid[],uuid[]) to service_role;
grant execute on function public.warehouse_edge_calendar_page(uuid[],uuid[],date,date,integer,integer) to service_role;

comment on function public.warehouse_edge_orders_page(uuid[],uuid[],uuid,text,text,boolean,text,text,text,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse operational order register page capped at 50 rows.';
comment on function public.warehouse_edge_purchase_orders_page(uuid[],uuid,text,boolean,text,text,text,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse purchase-order register page capped at 50 rows.';
comment on function public.warehouse_edge_dashboard_summary(uuid,uuid[],uuid[])
is 'Service-role-only, allowlist-scoped exact Warehouse dashboard metric summary.';
comment on function public.warehouse_edge_calendar_page(uuid[],uuid[],date,date,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse calendar range capped at 500 orders and 45 days.';

-- Dexter exception: these read models only replace existing Warehouse UI list
-- transport. They add no capability or mutation and do not change the existing
-- Warehouse Dexter adapters or event-driven Watching for you sources.

commit;
