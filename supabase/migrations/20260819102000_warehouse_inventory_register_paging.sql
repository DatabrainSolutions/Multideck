-- Bounded Warehouse inventory read models. These service-role-only functions
-- receive the actor's already-authorised facility/organisation ids from the
-- Warehouse Edge Function, then search, sort, count and page in PostgreSQL.
-- They do not create or modify operational data.

begin;

create or replace function public.warehouse_edge_inventory_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_mode text default 'stock',
  p_item_id uuid default null,
  p_search text default null,
  p_facet text default null,
  p_include_zero boolean default false,
  p_open_only boolean default true,
  p_status_code text default null,
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
  v_mode text := case when p_mode in ('stock', 'movements', 'exceptions') then p_mode else 'stock' end;
  v_search text := lower(nullif(btrim(p_search), ''));
  v_facet text := nullif(btrim(p_facet), '');
  v_direction text := case when lower(p_direction) = 'asc' then 'asc' else 'desc' end;
  v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids), 0) = 0 then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset, 'facets', '[]'::jsonb);
  end if;

  if v_mode = 'stock' then
    with base as materialized (
      select
        balance.*,
        facility."WMSFacility_Code" as facility_code,
        facility."WMSFacility_Name" as facility_name,
        organisation."Org_Name" as customer_name,
        item."WMSItem_SKU" as sku,
        item."WMSItem_Description" as item_description,
        location."WMSLocation_Code" as location_code,
        handling_unit."WMSHU_Code" as handling_unit_code,
        handling_unit."WMSHU_TypeCode" as handling_unit_type_code,
        lot."WMSLot_LotNumber" as lot_number,
        lot."WMSLot_BatchNumber" as batch_number,
        lot."WMSLot_ManufactureDate" as manufacture_date,
        lot."WMSLot_ExpiryDate" as expiry_date,
        coalesce(inventory_status."WMSInventoryStatus_Name", balance."WMSBalance_InventoryStatusCode") as inventory_status_name
      from public."WMS_InventoryBalances" balance
      join public."WMS_Facilities" facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
      join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
      left join public."Org_Master" organisation on organisation."Org_id" = balance."WMSBalance_CustomerOrgID"
      left join public."WMS_Locations" location on location."WMSLocation_ID" = balance."WMSBalance_LocationID"
      left join public."WMS_HandlingUnits" handling_unit on handling_unit."WMSHU_ID" = balance."WMSBalance_HU_ID"
      left join public."WMS_InventoryLots" lot on lot."WMSLot_ID" = balance."WMSBalance_LotID"
      left join public."sys_WMSInventoryStatuses" inventory_status on inventory_status."WMSInventoryStatus_Code" = balance."WMSBalance_InventoryStatusCode"
      where balance."WMSBalance_FacilityID" = any(p_allowed_facility_ids)
        and (p_allowed_org_ids is null or balance."WMSBalance_CustomerOrgID" = any(p_allowed_org_ids))
        and (p_item_id is null or balance."WMSBalance_ItemID" = p_item_id)
        and (p_include_zero or balance."WMSBalance_OnHandQuantity" <> 0)
        and (v_search is null or strpos(lower(concat_ws(' ',
          item."WMSItem_SKU", item."WMSItem_Description", organisation."Org_Name", facility."WMSFacility_Name",
          balance."WMSBalance_InventoryStatusCode", balance."WMSBalance_CustomsStatusCode", location."WMSLocation_Code",
          handling_unit."WMSHU_Code", lot."WMSLot_LotNumber", lot."WMSLot_BatchNumber"
        )), v_search) > 0)
    ), filtered as materialized (
      select * from base where v_facet is null or inventory_status_name = v_facet
    ), ranked as (
      select *, row_number() over (
        order by
          case when v_direction = 'asc' then case p_sort
            when 'stock-item' then lower(sku) when 'stock-object' then lower(handling_unit_code)
            when 'stock-location' then lower(location_code) when 'stock-lot' then lower(coalesce(batch_number, lot_number))
            when 'stock-customer' then lower(customer_name) when 'stock-status' then lower(inventory_status_name)
          end end asc nulls last,
          case when v_direction = 'desc' then case p_sort
            when 'stock-item' then lower(sku) when 'stock-object' then lower(handling_unit_code)
            when 'stock-location' then lower(location_code) when 'stock-lot' then lower(coalesce(batch_number, lot_number))
            when 'stock-customer' then lower(customer_name) when 'stock-status' then lower(inventory_status_name)
          end end desc nulls last,
          case when v_direction = 'asc' and p_sort = 'stock-onHand' then "WMSBalance_OnHandQuantity" end asc nulls last,
          case when v_direction = 'desc' and p_sort = 'stock-onHand' then "WMSBalance_OnHandQuantity" end desc nulls last,
          case when v_direction = 'asc' and p_sort = 'stock-available' then "WMSBalance_AvailableQuantity" end asc nulls last,
          case when v_direction = 'desc' and p_sort = 'stock-available' then "WMSBalance_AvailableQuantity" end desc nulls last,
          case when p_sort is null and v_direction = 'asc' then "WMSBalance_UpdatedAt" end asc,
          case when p_sort is null and v_direction = 'desc' then "WMSBalance_UpdatedAt" end desc,
          "WMSBalance_ID"
      ) as ordinal
      from filtered
    ), page as (
      select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', row."WMSBalance_ID", 'facilityId', row."WMSBalance_FacilityID", 'facilityCode', row.facility_code,
        'facilityName', row.facility_name, 'customerOrgId', row."WMSBalance_CustomerOrgID", 'customerName', row.customer_name,
        'itemId', row."WMSBalance_ItemID", 'sku', row.sku, 'itemDescription', row.item_description,
        'locationId', row."WMSBalance_LocationID", 'locationCode', row.location_code,
        'handlingUnitId', row."WMSBalance_HU_ID", 'handlingUnitCode', row.handling_unit_code,
        'handlingUnitTypeCode', row.handling_unit_type_code, 'lotId', row."WMSBalance_LotID",
        'lotNumber', row.lot_number, 'batchNumber', row.batch_number, 'manufactureDate', row.manufacture_date,
        'expiryDate', row.expiry_date, 'inventoryStatusCode', row."WMSBalance_InventoryStatusCode",
        'inventoryStatusName', row.inventory_status_name, 'customsStatusCode', row."WMSBalance_CustomsStatusCode",
        'uomCode', row."WMSBalance_UOMCode", 'onHandQuantity', row."WMSBalance_OnHandQuantity",
        'reservedQuantity', row."WMSBalance_ReservedQuantity", 'allocatedQuantity', row."WMSBalance_AllocatedQuantity",
        'heldQuantity', row."WMSBalance_HeldQuantity", 'availableQuantity', row."WMSBalance_AvailableQuantity",
        'isBonded', row."WMSBalance_IsBonded", 'firstReceiptAt', row."WMSBalance_FirstReceiptAt",
        'lastMovementAt', row."WMSBalance_LastMovementAt", 'updatedAt', row."WMSBalance_UpdatedAt"
      ) order by row.ordinal) from page row), '[]'::jsonb),
      'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset,
      'facets', coalesce((select jsonb_agg(value order by value) from (select distinct inventory_status_name as value from base where inventory_status_name is not null) facet_values), '[]'::jsonb)
    ) into v_result;

  elsif v_mode = 'movements' then
    with base as materialized (
      select
        transaction.*,
        facility."WMSFacility_Name" as facility_name,
        item."WMSItem_SKU" as sku,
        item."WMSItem_Description" as item_description,
        from_location."WMSLocation_Code" as from_location_code,
        to_location."WMSLocation_Code" as to_location_code,
        lot."WMSLot_LotNumber" as lot_number,
        lot."WMSLot_BatchNumber" as batch_number,
        handling_unit."WMSHU_Code" as handling_unit_code
      from public."WMS_InventoryTransactions" transaction
      join public."WMS_Facilities" facility on facility."WMSFacility_ID" = transaction."WMSTransaction_FacilityID"
      join public."WMS_Items" item on item."WMSItem_ID" = transaction."WMSTransaction_ItemID"
      left join public."WMS_Locations" from_location on from_location."WMSLocation_ID" = transaction."WMSTransaction_FromLocationID"
      left join public."WMS_Locations" to_location on to_location."WMSLocation_ID" = transaction."WMSTransaction_ToLocationID"
      left join public."WMS_InventoryLots" lot on lot."WMSLot_ID" = transaction."WMSTransaction_LotID"
      left join public."WMS_HandlingUnits" handling_unit on handling_unit."WMSHU_ID" = transaction."WMSTransaction_HU_ID"
      where transaction."WMSTransaction_FacilityID" = any(p_allowed_facility_ids)
        and (p_allowed_org_ids is null or transaction."WMSTransaction_CustomerOrgID" = any(p_allowed_org_ids))
        and (p_item_id is null or transaction."WMSTransaction_ItemID" = p_item_id)
        and (v_search is null or strpos(lower(concat_ws(' ', item."WMSItem_SKU", item."WMSItem_Description",
          facility."WMSFacility_Name", transaction."WMSTransaction_Reference", transaction."WMSTransaction_Notes",
          from_location."WMSLocation_Code", to_location."WMSLocation_Code", lot."WMSLot_LotNumber",
          lot."WMSLot_BatchNumber", handling_unit."WMSHU_Code", transaction."WMSTransaction_ReasonCode"
        )), v_search) > 0)
    ), filtered as materialized (
      select * from base where v_facet is null or "WMSTransaction_TypeCode" = v_facet
    ), ranked as (
      select *, row_number() over (
        order by
          case when v_direction = 'asc' then case p_sort
            when 'movement-reference' then lower("WMSTransaction_Reference") when 'movement-item' then lower(sku)
            when 'movement-movement' then lower("WMSTransaction_TypeCode") when 'movement-reason' then lower("WMSTransaction_ReasonCode")
          end end asc nulls last,
          case when v_direction = 'desc' then case p_sort
            when 'movement-reference' then lower("WMSTransaction_Reference") when 'movement-item' then lower(sku)
            when 'movement-movement' then lower("WMSTransaction_TypeCode") when 'movement-reason' then lower("WMSTransaction_ReasonCode")
          end end desc nulls last,
          case when v_direction = 'asc' and p_sort = 'movement-quantity' then "WMSTransaction_Quantity" end asc nulls last,
          case when v_direction = 'desc' and p_sort = 'movement-quantity' then "WMSTransaction_Quantity" end desc nulls last,
          case when (p_sort is null or p_sort = 'movement-posted') and v_direction = 'asc' then "WMSTransaction_CreatedAt" end asc,
          case when (p_sort is null or p_sort = 'movement-posted') and v_direction = 'desc' then "WMSTransaction_CreatedAt" end desc,
          "WMSTransaction_ID"
      ) as ordinal
      from filtered
    ), page as (
      select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', row."WMSTransaction_ID", 'facilityId', row."WMSTransaction_FacilityID", 'facilityName', row.facility_name,
        'itemId', row."WMSTransaction_ItemID", 'sku', row.sku, 'itemDescription', row.item_description,
        'typeCode', row."WMSTransaction_TypeCode", 'typeName', row."WMSTransaction_TypeCode",
        'quantity', row."WMSTransaction_Quantity", 'uomCode', row."WMSTransaction_UOMCode",
        'fromLocationCode', row.from_location_code, 'toLocationCode', row.to_location_code,
        'lotNumber', row.lot_number, 'batchNumber', row.batch_number, 'reference', row."WMSTransaction_Reference",
        'notes', row."WMSTransaction_Notes", 'handlingUnitId', row."WMSTransaction_HU_ID",
        'handlingUnitCode', row.handling_unit_code, 'movementGroupId', row."WMSTransaction_MovementGroupID",
        'reasonCode', row."WMSTransaction_ReasonCode", 'metadata', coalesce(row."WMSTransaction_MetadataJSON", '{}'::jsonb),
        'createdAt', row."WMSTransaction_CreatedAt"
      ) order by row.ordinal) from page row), '[]'::jsonb),
      'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset,
      'facets', coalesce((select jsonb_agg(value order by value) from (select distinct "WMSTransaction_TypeCode" as value from base where "WMSTransaction_TypeCode" is not null) facet_values), '[]'::jsonb)
    ) into v_result;

  else
    with base as materialized (
      select
        exception.*,
        expected_location."WMSLocation_Code" as expected_location_code,
        actual_location."WMSLocation_Code" as actual_location_code
      from public."WMS_Exceptions" exception
      left join public."WMS_Locations" expected_location on expected_location."WMSLocation_ID" = exception."WMSException_ExpectedLocationID"
      left join public."WMS_Locations" actual_location on actual_location."WMSLocation_ID" = exception."WMSException_ActualLocationID"
      where exception."WMSException_FacilityID" = any(p_allowed_facility_ids)
        and (not p_open_only or exception."WMSException_StatusCode" <> 'resolved')
        and (p_status_code is null or exception."WMSException_StatusCode" = p_status_code)
        and (v_search is null or strpos(lower(concat_ws(' ', exception."WMSException_Title",
          exception."WMSException_Description", exception."WMSException_TypeCode", exception."WMSException_SeverityCode",
          expected_location."WMSLocation_Code", actual_location."WMSLocation_Code"
        )), v_search) > 0)
    ), filtered as materialized (
      select * from base where v_facet is null or "WMSException_SeverityCode" = v_facet
    ), ranked as (
      select *, row_number() over (
        order by
          case when v_direction = 'asc' then case p_sort
            when 'exception-exception' then lower("WMSException_Title") when 'exception-severity' then lower("WMSException_SeverityCode")
            when 'exception-expected' then lower(expected_location_code) when 'exception-status' then lower("WMSException_StatusCode")
          end end asc nulls last,
          case when v_direction = 'desc' then case p_sort
            when 'exception-exception' then lower("WMSException_Title") when 'exception-severity' then lower("WMSException_SeverityCode")
            when 'exception-expected' then lower(expected_location_code) when 'exception-status' then lower("WMSException_StatusCode")
          end end desc nulls last,
          case when (p_sort is null or p_sort = 'exception-raised') and v_direction = 'asc' then "WMSException_RaisedAt" end asc,
          case when (p_sort is null or p_sort = 'exception-raised') and v_direction = 'desc' then "WMSException_RaisedAt" end desc,
          "WMSException_ID"
      ) as ordinal
      from filtered
    ), page as (
      select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', row."WMSException_ID", 'facilityId', row."WMSException_FacilityID", 'typeCode', row."WMSException_TypeCode",
        'statusCode', row."WMSException_StatusCode", 'severityCode', row."WMSException_SeverityCode",
        'balanceId', row."WMSException_BalanceID", 'title', row."WMSException_Title",
        'description', row."WMSException_Description", 'expectedLocationId', row."WMSException_ExpectedLocationID",
        'expectedLocationCode', row.expected_location_code, 'actualLocationId', row."WMSException_ActualLocationID",
        'actualLocationCode', row.actual_location_code, 'movementGroupId', row."WMSException_MovementGroupID",
        'raisedAt', row."WMSException_RaisedAt", 'resolvedAt', row."WMSException_ResolvedAt",
        'metadata', coalesce(row."WMSException_MetadataJSON", '{}'::jsonb)
      ) order by row.ordinal) from page row), '[]'::jsonb),
      'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset,
      'facets', coalesce((select jsonb_agg(value order by value) from (select distinct "WMSException_SeverityCode" as value from base where "WMSException_SeverityCode" is not null) facet_values), '[]'::jsonb)
    ) into v_result;
  end if;

  return v_result;
end;
$$;

create or replace function public.warehouse_edge_handling_units_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_customer_org_id uuid default null,
  p_search text default null,
  p_facet text default null,
  p_include_consumed boolean default false,
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
  v_facet text := nullif(btrim(p_facet), '');
  v_direction text := case when lower(p_direction) = 'asc' then 'asc' else 'desc' end;
  v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids), 0) = 0 then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset, 'facets', '[]'::jsonb);
  end if;

  with base as materialized (
    select
      handling_unit.*,
      coalesce(unit_type."WMSHUType_Name", handling_unit."WMSHU_TypeCode") as type_name,
      organisation."Org_Name" as customer_name,
      location."WMSLocation_Code" as location_code,
      coalesce(inventory_status."WMSInventoryStatus_Name", handling_unit."WMSHU_InventoryStatusCode") as inventory_status_name,
      (select count(*) from public."WMS_InventoryBalances" balance where balance."WMSBalance_HU_ID" = handling_unit."WMSHU_ID" and balance."WMSBalance_OnHandQuantity" > 0) as contents_count
    from public."WMS_HandlingUnits" handling_unit
    left join public."sys_WMSHandlingUnitTypes" unit_type on unit_type."WMSHUType_Code" = handling_unit."WMSHU_TypeCode"
    left join public."Org_Master" organisation on organisation."Org_id" = handling_unit."WMSHU_CustomerOrgID"
    left join public."WMS_Locations" location on location."WMSLocation_ID" = handling_unit."WMSHU_LocationID"
    left join public."sys_WMSInventoryStatuses" inventory_status on inventory_status."WMSInventoryStatus_Code" = handling_unit."WMSHU_InventoryStatusCode"
    where handling_unit."WMSHU_FacilityID" = any(p_allowed_facility_ids)
      and (p_allowed_org_ids is null or handling_unit."WMSHU_CustomerOrgID" = any(p_allowed_org_ids))
      and (p_customer_org_id is null or handling_unit."WMSHU_CustomerOrgID" = p_customer_org_id)
      and not handling_unit."WMSHU_IsDeleted"
      and (p_include_consumed or handling_unit."WMSHU_LifecycleStatusCode" <> 'consumed')
      and (v_search is null or strpos(lower(concat_ws(' ', handling_unit."WMSHU_Code", handling_unit."WMSHU_SSCC",
        handling_unit."WMSHU_ExternalReference", organisation."Org_Name", location."WMSLocation_Code"
      )), v_search) > 0)
  ), filtered as materialized (
    select * from base where v_facet is null or type_name = v_facet
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_direction = 'asc' then case p_sort
          when 'object-object' then lower("WMSHU_Code") when 'object-customer' then lower(customer_name)
          when 'object-location' then lower(location_code) when 'object-status' then lower(inventory_status_name)
        end end asc nulls last,
        case when v_direction = 'desc' then case p_sort
          when 'object-object' then lower("WMSHU_Code") when 'object-customer' then lower(customer_name)
          when 'object-location' then lower(location_code) when 'object-status' then lower(inventory_status_name)
        end end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'object-contents' then contents_count end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'object-contents' then contents_count end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'object-weight' then "WMSHU_GrossWeightKG" end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'object-weight' then "WMSHU_GrossWeightKG" end desc nulls last,
        case when p_sort is null and v_direction = 'asc' then "WMSHU_UpdatedAt" end asc,
        case when p_sort is null and v_direction = 'desc' then "WMSHU_UpdatedAt" end desc,
        "WMSHU_ID"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row."WMSHU_ID", 'facilityId', row."WMSHU_FacilityID", 'parentHandlingUnitId', row."WMSHU_ParentHU_ID",
      'typeCode', row."WMSHU_TypeCode", 'typeName', row.type_name, 'code', row."WMSHU_Code", 'sscc', row."WMSHU_SSCC",
      'externalReference', row."WMSHU_ExternalReference", 'customerOrgId', row."WMSHU_CustomerOrgID",
      'customerName', row.customer_name, 'locationId', row."WMSHU_LocationID", 'locationCode', row.location_code,
      'inventoryStatusCode', row."WMSHU_InventoryStatusCode", 'inventoryStatusName', row.inventory_status_name,
      'customsStatusCode', row."WMSHU_CustomsStatusCode", 'lifecycleStatusCode', row."WMSHU_LifecycleStatusCode",
      'consumedIntoHandlingUnitId', row."WMSHU_ConsumedIntoHU_ID", 'grossWeightKg', row."WMSHU_GrossWeightKG",
      'netWeightKg', row."WMSHU_NetWeightKG", 'volumeCbm', row."WMSHU_VolumeCBM", 'sealed', row."WMSHU_IsSealed",
      'updatedAt', row."WMSHU_UpdatedAt",
      'contents', coalesce((select jsonb_agg(jsonb_build_object(
        'balanceId', balance."WMSBalance_ID", 'itemId', balance."WMSBalance_ItemID", 'sku', item."WMSItem_SKU",
        'description', item."WMSItem_Description", 'quantity', balance."WMSBalance_OnHandQuantity",
        'uomCode', balance."WMSBalance_UOMCode", 'statusCode', balance."WMSBalance_InventoryStatusCode",
        'customsStatusCode', balance."WMSBalance_CustomsStatusCode", 'lotNumber', lot."WMSLot_LotNumber",
        'batchNumber', lot."WMSLot_BatchNumber"
      ) order by item."WMSItem_SKU", balance."WMSBalance_ID")
        from public."WMS_InventoryBalances" balance
        join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
        left join public."WMS_InventoryLots" lot on lot."WMSLot_ID" = balance."WMSBalance_LotID"
        where balance."WMSBalance_HU_ID" = row."WMSHU_ID" and balance."WMSBalance_OnHandQuantity" > 0), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(event_payload order by event_at desc) from (
        select jsonb_build_object('id', event."WMSHUEvent_ID", 'typeCode', event."WMSHUEvent_EventTypeCode",
          'at', event."WMSHUEvent_EventAt", 'locationId', event."WMSHUEvent_LocationID", 'notes', event."WMSHUEvent_Notes",
          'metadata', coalesce(event."WMSHUEvent_MetadataJSON", '{}'::jsonb)) as event_payload,
          event."WMSHUEvent_EventAt" as event_at
        from public."WMS_HandlingUnitEvents" event where event."WMSHUEvent_HU_ID" = row."WMSHU_ID"
        order by event."WMSHUEvent_EventAt" desc limit 25
      ) recent_events), '[]'::jsonb)
    ) order by row.ordinal) from page row), '[]'::jsonb),
    'total', (select count(*) from filtered), 'limit', v_limit, 'offset', v_offset,
    'facets', coalesce((select jsonb_agg(value order by value) from (select distinct type_name as value from base where type_name is not null) facet_values), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_inventory_page(uuid[],uuid[],text,uuid,text,text,boolean,boolean,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.warehouse_edge_handling_units_page(uuid[],uuid[],uuid,text,text,boolean,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_inventory_page(uuid[],uuid[],text,uuid,text,text,boolean,boolean,text,text,text,integer,integer) to service_role;
grant execute on function public.warehouse_edge_handling_units_page(uuid[],uuid[],uuid,text,text,boolean,text,text,integer,integer) to service_role;

comment on function public.warehouse_edge_inventory_page(uuid[],uuid[],text,uuid,text,text,boolean,boolean,text,text,text,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse stock, movement and exception register page capped at 50 rows.';
comment on function public.warehouse_edge_handling_units_page(uuid[],uuid[],uuid,text,text,boolean,text,text,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse object register page capped at 50 rows with page-local contents and events.';

-- Dexter exception: these functions only replace existing Warehouse UI list
-- transport. They add no capability or mutation and do not change the existing
-- Warehouse Dexter adapters or event-driven Watching for you sources.

commit;
