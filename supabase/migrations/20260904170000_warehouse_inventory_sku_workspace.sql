-- Warehouse Inventory begins with one row per SKU and warehouse. Exact balance
-- lines remain available in a bounded detail payload, alongside deterministic
-- location and pallet breakdowns. Quantities are normalised to the item's base
-- UOM before aggregation so mixed receiving UOMs are never added directly.

begin;

create or replace function public.warehouse_edge_inventory_skus_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_search text default null,
  p_facet text default null,
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
      balance."WMSBalance_FacilityID" as facility_id,
      facility."WMSFacility_Code" as facility_code,
      facility."WMSFacility_Name" as facility_name,
      balance."WMSBalance_CustomerOrgID" as customer_org_id,
      organisation."Org_Name" as customer_name,
      balance."WMSBalance_ItemID" as item_id,
      item."WMSItem_SKU" as sku,
      item."WMSItem_Description" as item_description,
      item."WMSItem_BaseUOMCode" as base_uom_code,
      balance."WMSBalance_HU_ID" as handling_unit_id,
      balance."WMSBalance_LocationID" as location_id,
      balance."WMSBalance_OnHandQuantity" * coalesce(nullif(item_uom."WMSItemUOM_QuantityInBaseUOM", 0), 1) as on_hand,
      balance."WMSBalance_ReservedQuantity" * coalesce(nullif(item_uom."WMSItemUOM_QuantityInBaseUOM", 0), 1) as reserved,
      balance."WMSBalance_AllocatedQuantity" * coalesce(nullif(item_uom."WMSItemUOM_QuantityInBaseUOM", 0), 1) as allocated,
      balance."WMSBalance_HeldQuantity" * coalesce(nullif(item_uom."WMSItemUOM_QuantityInBaseUOM", 0), 1) as held,
      balance."WMSBalance_AvailableQuantity" * coalesce(nullif(item_uom."WMSItemUOM_QuantityInBaseUOM", 0), 1) as available,
      balance."WMSBalance_UpdatedAt" as updated_at
    from public."WMS_InventoryBalances" balance
    join public."WMS_Facilities" facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
    join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
    left join public."Org_Master" organisation on organisation."Org_id" = balance."WMSBalance_CustomerOrgID"
    left join public."WMS_ItemUOMs" item_uom
      on item_uom."WMSItemUOM_ItemID" = balance."WMSBalance_ItemID"
      and item_uom."WMSItemUOM_UOMCode" = balance."WMSBalance_UOMCode"
    where balance."WMSBalance_FacilityID" = any(p_allowed_facility_ids)
      and (p_allowed_org_ids is null or balance."WMSBalance_CustomerOrgID" = any(p_allowed_org_ids))
      and balance."WMSBalance_OnHandQuantity" <> 0
      and (v_search is null or strpos(lower(concat_ws(' ', item."WMSItem_SKU", item."WMSItem_Description", organisation."Org_Name", facility."WMSFacility_Name")), v_search) > 0)
  ), grouped as materialized (
    select
      facility_id, facility_code, facility_name, customer_org_id, customer_name,
      item_id, sku, item_description, base_uom_code,
      sum(on_hand) as on_hand,
      sum(reserved) as reserved,
      sum(allocated) as allocated,
      sum(held) as held,
      sum(available) as available,
      count(distinct handling_unit_id) filter (where handling_unit_id is not null) as pallet_count,
      count(distinct location_id) filter (where location_id is not null) as location_count,
      max(updated_at) as updated_at
    from base
    group by facility_id, facility_code, facility_name, customer_org_id, customer_name, item_id, sku, item_description, base_uom_code
  ), filtered as materialized (
    select * from grouped where v_facet is null or customer_name = v_facet
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_direction = 'asc' then case p_sort
          when 'stock-item' then lower(sku)
          when 'stock-customer' then lower(customer_name)
          when 'stock-warehouse' then lower(facility_name)
        end end asc nulls last,
        case when v_direction = 'desc' then case p_sort
          when 'stock-item' then lower(sku)
          when 'stock-customer' then lower(customer_name)
          when 'stock-warehouse' then lower(facility_name)
        end end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'stock-onHand' then on_hand end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'stock-onHand' then on_hand end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'stock-available' then available end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'stock-available' then available end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'stock-reserved' then reserved end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'stock-reserved' then reserved end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'stock-held' then held end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'stock-held' then held end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'stock-pallets' then pallet_count end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'stock-pallets' then pallet_count end desc nulls last,
        case when v_direction = 'asc' and p_sort = 'stock-locations' then location_count end asc nulls last,
        case when v_direction = 'desc' and p_sort = 'stock-locations' then location_count end desc nulls last,
        case when p_sort is null and v_direction = 'asc' then updated_at end asc,
        case when p_sort is null and v_direction = 'desc' then updated_at end desc,
        facility_id, item_id
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.item_id::text || ':' || row.facility_id::text,
      'facilityId', row.facility_id, 'facilityCode', row.facility_code, 'facilityName', row.facility_name,
      'customerOrgId', row.customer_org_id, 'customerName', row.customer_name,
      'itemId', row.item_id, 'sku', row.sku, 'itemDescription', row.item_description,
      'uomCode', row.base_uom_code, 'onHandQuantity', row.on_hand,
      'reservedQuantity', row.reserved, 'allocatedQuantity', row.allocated,
      'heldQuantity', row.held, 'availableQuantity', row.available,
      'palletCount', row.pallet_count, 'locationCount', row.location_count,
      'updatedAt', row.updated_at
    ) order by row.ordinal) from page row), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'offset', v_offset,
    'facets', coalesce((select jsonb_agg(value order by value) from (select distinct customer_name as value from grouped where customer_name is not null) values_for_facet), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.warehouse_edge_inventory_sku_detail(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null,
  p_item_id uuid default null,
  p_line_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_line_limit integer := greatest(1, least(coalesce(p_line_limit, 50), 50));
  v_result jsonb;
begin
  if p_facility_id is null or p_item_id is null or not (p_facility_id = any(p_allowed_facility_ids)) then
    return null;
  end if;

  with base as materialized (
    select
      balance.*,
      facility."WMSFacility_Code" as facility_code,
      facility."WMSFacility_Name" as facility_name,
      organisation."Org_Name" as customer_name,
      item."WMSItem_SKU" as sku,
      item."WMSItem_Description" as item_description,
      item."WMSItem_BaseUOMCode" as base_uom_code,
      location."WMSLocation_Code" as location_code,
      location."WMSLocation_TypeCode" as location_type_code,
      zone."WMSZone_Name" as zone_name,
      zone."WMSZone_TypeCode" as zone_type_code,
      handling_unit."WMSHU_Code" as handling_unit_code,
      handling_unit."WMSHU_TypeCode" as handling_unit_type_code,
      lot."WMSLot_LotNumber" as lot_number,
      lot."WMSLot_BatchNumber" as batch_number,
      lot."WMSLot_ManufactureDate" as manufacture_date,
      lot."WMSLot_ExpiryDate" as expiry_date,
      coalesce(inventory_status."WMSInventoryStatus_Name", balance."WMSBalance_InventoryStatusCode") as inventory_status_name,
      coalesce(nullif(item_uom."WMSItemUOM_QuantityInBaseUOM", 0), 1) as quantity_factor
    from public."WMS_InventoryBalances" balance
    join public."WMS_Facilities" facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
    join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
    left join public."Org_Master" organisation on organisation."Org_id" = balance."WMSBalance_CustomerOrgID"
    left join public."WMS_Locations" location on location."WMSLocation_ID" = balance."WMSBalance_LocationID"
    left join public."WMS_Zones" zone on zone."WMSZone_ID" = location."WMSLocation_ZoneID"
    left join public."WMS_HandlingUnits" handling_unit on handling_unit."WMSHU_ID" = balance."WMSBalance_HU_ID"
    left join public."WMS_InventoryLots" lot on lot."WMSLot_ID" = balance."WMSBalance_LotID"
    left join public."sys_WMSInventoryStatuses" inventory_status on inventory_status."WMSInventoryStatus_Code" = balance."WMSBalance_InventoryStatusCode"
    left join public."WMS_ItemUOMs" item_uom
      on item_uom."WMSItemUOM_ItemID" = balance."WMSBalance_ItemID"
      and item_uom."WMSItemUOM_UOMCode" = balance."WMSBalance_UOMCode"
    where balance."WMSBalance_FacilityID" = p_facility_id
      and balance."WMSBalance_FacilityID" = any(p_allowed_facility_ids)
      and balance."WMSBalance_ItemID" = p_item_id
      and (p_allowed_org_ids is null or balance."WMSBalance_CustomerOrgID" = any(p_allowed_org_ids))
      and balance."WMSBalance_OnHandQuantity" <> 0
  ), classified as materialized (
    select *,
      case
        when "WMSBalance_LocationID" is null then 'unlocated'
        when location_type_code = 'quarantine' then 'quarantine'
        when zone_type_code = 'picking' then 'pick_face'
        when location_type_code in ('staging', 'dock') or zone_type_code in ('receiving', 'packing', 'dispatch') then 'staging'
        else 'bulk_reserve'
      end as location_group_code
    from base
  ), location_totals as (
    select location_group_code,
      case location_group_code
        when 'pick_face' then 'Pick face'
        when 'bulk_reserve' then 'Bulk / reserve'
        when 'staging' then 'Staging'
        when 'quarantine' then 'Quarantine'
        else 'Unlocated'
      end as label,
      sum("WMSBalance_OnHandQuantity" * quantity_factor) as quantity
    from classified
    group by location_group_code
  ), storage_totals as (
    select storage_code, case when storage_code = 'loose' then 'Loose stock' else 'On pallets' end as label, quantity
    from (
      select case when "WMSBalance_HU_ID" is null then 'loose' else 'palletised' end as storage_code,
        sum("WMSBalance_OnHandQuantity" * quantity_factor) as quantity
      from classified
      group by 1
    ) grouped_storage
  ), pallet_totals as (
    select "WMSBalance_HU_ID" as id, handling_unit_code as code, handling_unit_type_code as type_code,
      location_code, sum("WMSBalance_OnHandQuantity" * quantity_factor) as quantity
    from classified
    where "WMSBalance_HU_ID" is not null
    group by "WMSBalance_HU_ID", handling_unit_code, handling_unit_type_code, location_code
  ), ordered_lines as (
    select *, row_number() over (order by "WMSBalance_AvailableQuantity" desc, location_code nulls last, "WMSBalance_ID") as ordinal
    from classified
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'facilityId', first_row."WMSBalance_FacilityID", 'facilityCode', first_row.facility_code, 'facilityName', first_row.facility_name,
      'customerOrgId', first_row."WMSBalance_CustomerOrgID", 'customerName', first_row.customer_name,
      'itemId', first_row."WMSBalance_ItemID", 'sku', first_row.sku, 'itemDescription', first_row.item_description,
      'uomCode', first_row.base_uom_code,
      'onHandQuantity', totals.on_hand,
      'reservedQuantity', totals.reserved,
      'allocatedQuantity', totals.allocated,
      'heldQuantity', totals.held,
      'availableQuantity', totals.available,
      'palletCount', totals.pallet_count,
      'locationCount', totals.location_count,
      'updatedAt', totals.updated_at
    ) from (select * from classified order by "WMSBalance_ID" limit 1) first_row
      cross join (select
        sum("WMSBalance_OnHandQuantity" * quantity_factor) as on_hand,
        sum("WMSBalance_ReservedQuantity" * quantity_factor) as reserved,
        sum("WMSBalance_AllocatedQuantity" * quantity_factor) as allocated,
        sum("WMSBalance_HeldQuantity" * quantity_factor) as held,
        sum("WMSBalance_AvailableQuantity" * quantity_factor) as available,
        count(distinct "WMSBalance_HU_ID") filter (where "WMSBalance_HU_ID" is not null) as pallet_count,
        count(distinct "WMSBalance_LocationID") filter (where "WMSBalance_LocationID" is not null) as location_count,
        max("WMSBalance_UpdatedAt") as updated_at
      from classified) totals),
    'locationBreakdown', coalesce((select jsonb_agg(jsonb_build_object('code', location_group_code, 'label', label, 'quantity', quantity) order by case location_group_code when 'pick_face' then 1 when 'bulk_reserve' then 2 when 'staging' then 3 when 'quarantine' then 4 else 5 end) from location_totals), '[]'::jsonb),
    'storageBreakdown', coalesce((select jsonb_agg(jsonb_build_object('code', storage_code, 'label', label, 'quantity', quantity) order by storage_code desc) from storage_totals), '[]'::jsonb),
    'pallets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'typeCode', type_code, 'locationCode', location_code, 'quantity', quantity) order by code) from pallet_totals), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line."WMSBalance_ID", 'facilityId', line."WMSBalance_FacilityID", 'facilityCode', line.facility_code,
      'facilityName', line.facility_name, 'customerOrgId', line."WMSBalance_CustomerOrgID", 'customerName', line.customer_name,
      'itemId', line."WMSBalance_ItemID", 'sku', line.sku, 'itemDescription', line.item_description,
      'locationId', line."WMSBalance_LocationID", 'locationCode', line.location_code,
      'locationTypeCode', line.location_type_code, 'zoneTypeCode', line.zone_type_code, 'zoneName', line.zone_name,
      'handlingUnitId', line."WMSBalance_HU_ID", 'handlingUnitCode', line.handling_unit_code,
      'handlingUnitTypeCode', line.handling_unit_type_code, 'lotId', line."WMSBalance_LotID",
      'lotNumber', line.lot_number, 'batchNumber', line.batch_number, 'manufactureDate', line.manufacture_date,
      'expiryDate', line.expiry_date, 'inventoryStatusCode', line."WMSBalance_InventoryStatusCode",
      'inventoryStatusName', line.inventory_status_name, 'customsStatusCode', line."WMSBalance_CustomsStatusCode",
      'uomCode', line."WMSBalance_UOMCode", 'onHandQuantity', line."WMSBalance_OnHandQuantity",
      'reservedQuantity', line."WMSBalance_ReservedQuantity", 'allocatedQuantity', line."WMSBalance_AllocatedQuantity",
      'heldQuantity', line."WMSBalance_HeldQuantity", 'availableQuantity', line."WMSBalance_AvailableQuantity",
      'baseQuantity', line."WMSBalance_OnHandQuantity" * line.quantity_factor,
      'isBonded', line."WMSBalance_IsBonded", 'firstReceiptAt', line."WMSBalance_FirstReceiptAt",
      'lastMovementAt', line."WMSBalance_LastMovementAt", 'updatedAt', line."WMSBalance_UpdatedAt"
    ) order by line.ordinal) from ordered_lines line where line.ordinal <= v_line_limit), '[]'::jsonb),
    'lineTotal', (select count(*) from classified),
    'lineLimit', v_line_limit
  ) into v_result;

  if v_result->'summary' = 'null'::jsonb then
    return null;
  end if;
  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_inventory_skus_page(uuid[],uuid[],text,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.warehouse_edge_inventory_sku_detail(uuid[],uuid[],uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_inventory_skus_page(uuid[],uuid[],text,text,text,text,integer,integer) to service_role;
grant execute on function public.warehouse_edge_inventory_sku_detail(uuid[],uuid[],uuid,uuid,integer) to service_role;

comment on function public.warehouse_edge_inventory_skus_page(uuid[],uuid[],text,text,text,text,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse SKU totals page capped at 50 rows and normalised to each item base UOM.';
comment on function public.warehouse_edge_inventory_sku_detail(uuid[],uuid[],uuid,uuid,integer)
is 'Service-role-only exact Warehouse SKU stock breakdown with deterministic aggregates and at most 50 exact balance lines.';

-- Dexter already reads the underlying inventory balances and its warehouse watch
-- is driven by real balance and movement events. This UI read model does not add
-- a new mutation or event source; keep the registry language aligned with the
-- SKU-first representation without introducing recurring LLM evaluation.
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Warehouse orders, goods-in receipts, goods-out dispatches, warehouse-specific SKU totals and exact inventory balances, movements, pallets and unresolved exceptions. Dexter can use explicit approval-safe actions for connected operational writes.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'warehouse';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Warehouse orders, goods-in receipts, goods-out dispatches, SKU stock changes, stock movements, facilities, locations, items, pallets and inventory exceptions.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'warehouse';

commit;
