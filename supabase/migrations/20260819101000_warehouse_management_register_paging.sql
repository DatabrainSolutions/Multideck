-- Service-role-only Warehouse management read models. The Edge Function passes
-- the actor's already-authorised facility/organisation ids; the functions then
-- search, sort, count and page without transferring full registers. No data is
-- created or modified by this migration.

begin;

create or replace function public.warehouse_edge_items_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null,
  p_search text default null,
  p_include_inactive boolean default false,
  p_sort text default 'sku',
  p_direction text default 'asc',
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
  v_sort text := case when p_sort in ('sku', 'item', 'facility', 'hs', 'uom', 'gross', 'status') then p_sort else 'sku' end;
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_result jsonb;
begin
  if coalesce(cardinality(p_allowed_facility_ids), 0) = 0 then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset);
  end if;

  with filtered as materialized (
    select
      item.*,
      organisation."Org_Name" as customer_name,
      facility."WMSFacility_Name" as facility_name
    from public."WMS_Items" item
    join public."WMS_Facilities" facility on facility."WMSFacility_ID" = item."WMSItem_DefaultFacilityID"
    join public."Org_Master" organisation on organisation."Org_id" = item."WMSItem_CustomerOrgID"
    where item."WMSItem_DefaultFacilityID" = any(p_allowed_facility_ids)
      and (p_allowed_org_ids is null or item."WMSItem_CustomerOrgID" = any(p_allowed_org_ids))
      and (p_facility_id is null or item."WMSItem_DefaultFacilityID" = p_facility_id)
      and not item."WMSItem_IsDeleted"
      and (p_include_inactive or item."WMSItem_IsActive")
      and (v_search is null or strpos(lower(concat_ws(' ',
        item."WMSItem_SKU", item."WMSItem_Description", item."WMSItem_CommodityDescription",
        item."WMSItem_HSCode", organisation."Org_Name", facility."WMSFacility_Name"
      )), v_search) > 0)
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_direction = 'asc' then case v_sort
          when 'sku' then lower("WMSItem_SKU")
          when 'item' then lower("WMSItem_Description")
          when 'facility' then lower(facility_name)
          when 'hs' then lower("WMSItem_HSCode")
          when 'uom' then lower("WMSItem_BaseUOMCode")
        end end asc nulls last,
        case when v_direction = 'desc' then case v_sort
          when 'sku' then lower("WMSItem_SKU")
          when 'item' then lower("WMSItem_Description")
          when 'facility' then lower(facility_name)
          when 'hs' then lower("WMSItem_HSCode")
          when 'uom' then lower("WMSItem_BaseUOMCode")
        end end desc nulls last,
        case when v_direction = 'asc' and v_sort = 'gross' then "WMSItem_GrossWeightKG" end asc nulls last,
        case when v_direction = 'desc' and v_sort = 'gross' then "WMSItem_GrossWeightKG" end desc nulls last,
        case when v_direction = 'asc' and v_sort = 'status' then "WMSItem_IsActive" end asc,
        case when v_direction = 'desc' and v_sort = 'status' then "WMSItem_IsActive" end desc,
        lower("WMSItem_SKU"), "WMSItem_ID"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item."WMSItem_ID",
      'customerOrgId', item."WMSItem_CustomerOrgID",
      'customerOrgName', item.customer_name,
      'facilityId', item."WMSItem_DefaultFacilityID",
      'facilityName', item.facility_name,
      'sku', item."WMSItem_SKU",
      'description', item."WMSItem_Description",
      'commodityDescription', item."WMSItem_CommodityDescription",
      'hsCode', item."WMSItem_HSCode",
      'countryOfOriginCode', item."WMSItem_CountryOfOriginCode",
      'baseUomCode', item."WMSItem_BaseUOMCode",
      'quantityBasisCode', coalesce(item."WMSItem_QuantityBasisCode", 'count'),
      'quantityScale', coalesce(item."WMSItem_QuantityScale", 0),
      'minimumMovementQuantity', coalesce(item."WMSItem_MinimumMovementQuantity", 1),
      'allowsFractionalQuantity', coalesce(item."WMSItem_AllowsFractionalQuantity", false),
      'uoms', coalesce((select jsonb_agg(jsonb_build_object(
        'id', uom."WMSItemUOM_ID", 'code', uom."WMSItemUOM_UOMCode",
        'quantityInBaseUom', uom."WMSItemUOM_QuantityInBaseUOM", 'grossWeightKg', uom."WMSItemUOM_GrossWeightKG",
        'purchasing', uom."WMSItemUOM_IsPurchasingUOM", 'stocking', uom."WMSItemUOM_IsStockingUOM",
        'selling', uom."WMSItemUOM_IsSellingUOM"
      ) order by uom."WMSItemUOM_UOMCode") from public."WMS_ItemUOMs" uom where uom."WMSItemUOM_ItemID" = item."WMSItem_ID"), '[]'::jsonb),
      'lengthM', item."WMSItem_LengthM", 'widthM', item."WMSItem_WidthM", 'heightM', item."WMSItem_HeightM",
      'netWeightKg', item."WMSItem_NetWeightKG", 'grossWeightKg', item."WMSItem_GrossWeightKG",
      'isDangerousGoods', item."WMSItem_IsDangerousGoods", 'isExciseGoods', item."WMSItem_IsExciseGoods",
      'isHighValue', item."WMSItem_IsHighValue", 'isBondedEligible', item."WMSItem_IsBondedEligible",
      'requiresLot', item."WMSItem_RequiresLot", 'requiresSerial', item."WMSItem_RequiresSerial",
      'requiresExpiry', item."WMSItem_RequiresExpiry", 'temperatureMinC', item."WMSItem_TemperatureMinC",
      'temperatureMaxC', item."WMSItem_TemperatureMaxC", 'isActive', item."WMSItem_IsActive",
      'createdAt', item."WMSItem_CreatedAt", 'updatedAt', item."WMSItem_UpdatedAt"
    ) order by item.ordinal) from page item), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'offset', v_offset
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.warehouse_edge_locations_page(
  p_allowed_facility_ids uuid[],
  p_facility_id uuid,
  p_search text default null,
  p_include_inactive boolean default false,
  p_sort text default 'code',
  p_direction text default 'asc',
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
  v_sort text := case when p_sort in ('code', 'zone', 'type', 'position', 'status') then p_sort else 'code' end;
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_result jsonb;
begin
  if p_facility_id is null or not (p_facility_id = any(coalesce(p_allowed_facility_ids, array[]::uuid[]))) then
    raise exception 'WMS403: You do not have access to this warehouse.';
  end if;

  with filtered as materialized (
    select
      location.*,
      zone."WMSZone_TypeCode" as zone_type_code,
      zone."WMSZone_Name" as zone_name,
      location_type."WMSLocationType_Name" as type_name,
      location_status."WMSLocationStatus_Name" as status_name,
      concat_ws(' ', location."WMSLocation_Aisle", location."WMSLocation_Bay", location."WMSLocation_Level", location."WMSLocation_Position") as position_text
    from public."WMS_Locations" location
    left join public."WMS_Zones" zone on zone."WMSZone_ID" = location."WMSLocation_ZoneID"
    left join public."sys_WMSLocationTypes" location_type on location_type."WMSLocationType_Code" = location."WMSLocation_TypeCode"
    left join public."sys_WMSLocationStatuses" location_status on location_status."WMSLocationStatus_Code" = location."WMSLocation_StatusCode"
    where location."WMSLocation_FacilityID" = p_facility_id
      and not location."WMSLocation_IsDeleted"
      and (p_include_inactive or location."WMSLocation_IsActive")
      and (v_search is null or strpos(lower(concat_ws(' ',
        location."WMSLocation_Code", location."WMSLocation_Barcode", location."WMSLocation_Aisle",
        location."WMSLocation_Bay", location."WMSLocation_Level", location."WMSLocation_Position", zone."WMSZone_Name"
      )), v_search) > 0)
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_direction = 'asc' then case v_sort
          when 'code' then lower("WMSLocation_Code") when 'zone' then lower(zone_name)
          when 'type' then lower(type_name) when 'position' then lower(position_text)
        end end asc nulls last,
        case when v_direction = 'desc' then case v_sort
          when 'code' then lower("WMSLocation_Code") when 'zone' then lower(zone_name)
          when 'type' then lower(type_name) when 'position' then lower(position_text)
        end end desc nulls last,
        case when v_direction = 'asc' and v_sort = 'status' then "WMSLocation_IsActive" end asc,
        case when v_direction = 'desc' and v_sort = 'status' then "WMSLocation_IsActive" end desc,
        lower("WMSLocation_Code"), "WMSLocation_ID"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', location."WMSLocation_ID", 'facilityId', location."WMSLocation_FacilityID",
      'code', location."WMSLocation_Code", 'barcode', location."WMSLocation_Barcode",
      'typeCode', location."WMSLocation_TypeCode", 'typeName', location.type_name,
      'statusCode', location."WMSLocation_StatusCode", 'statusName', location.status_name,
      'zoneId', location."WMSLocation_ZoneID", 'zoneTypeCode', location.zone_type_code, 'zoneName', location.zone_name,
      'aisle', location."WMSLocation_Aisle", 'bay', location."WMSLocation_Bay", 'level', location."WMSLocation_Level",
      'position', location."WMSLocation_Position", 'lengthM', location."WMSLocation_LengthM",
      'widthM', location."WMSLocation_WidthM", 'heightM', location."WMSLocation_HeightM",
      'maxWeightKg', location."WMSLocation_MaxWeightKG", 'maxVolumeCbm', location."WMSLocation_MaxVolumeCBM",
      'temperatureMinC', location."WMSLocation_TemperatureMinC", 'temperatureMaxC', location."WMSLocation_TemperatureMaxC",
      'allowsMultiSku', location."WMSLocation_AllowsMultiSKU", 'allowsBondedStock', location."WMSLocation_AllowsBondedStock",
      'isActive', location."WMSLocation_IsActive", 'createdAt', location."WMSLocation_CreatedAt",
      'updatedAt', location."WMSLocation_UpdatedAt"
    ) order by location.ordinal) from page location), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'offset', v_offset
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_items_page(uuid[],uuid[],uuid,text,boolean,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.warehouse_edge_locations_page(uuid[],uuid,text,boolean,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_items_page(uuid[],uuid[],uuid,text,boolean,text,text,integer,integer) to service_role;
grant execute on function public.warehouse_edge_locations_page(uuid[],uuid,text,boolean,text,text,integer,integer) to service_role;

comment on function public.warehouse_edge_items_page(uuid[],uuid[],uuid,text,boolean,text,text,integer,integer)
is 'Service-role-only, allowlist-scoped Warehouse items register page capped at 50 rows.';
comment on function public.warehouse_edge_locations_page(uuid[],uuid,text,boolean,text,text,integer,integer)
is 'Service-role-only, facility-allowlist-scoped Warehouse locations register page capped at 50 rows.';

-- Dexter exception: these functions only replace existing Warehouse UI list
-- transport. They add no capability or mutation and do not change the existing
-- Warehouse Dexter adapters or event-driven Watching for you sources.

commit;
