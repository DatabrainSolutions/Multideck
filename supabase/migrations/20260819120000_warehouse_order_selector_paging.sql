-- Bounded, service-role-only selector reads for Warehouse order and purchase
-- order actions. These functions return one small page and a has-more signal;
-- they never expose a whole item or location catalogue to the browser.

begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists "IX_WMS_Items_SelectorScope"
  on public."WMS_Items" (
    "WMSItem_DefaultFacilityID",
    "WMSItem_CustomerOrgID",
    lower("WMSItem_SKU"),
    "WMSItem_ID"
  )
  where "WMSItem_IsActive" and not "WMSItem_IsDeleted";

create index if not exists "IX_WMS_Items_SelectorSkuSearch"
  on public."WMS_Items"
  using gin (lower(coalesce("WMSItem_SKU", '')) extensions.gin_trgm_ops)
  where "WMSItem_IsActive" and not "WMSItem_IsDeleted";

create index if not exists "IX_WMS_Items_SelectorDescriptionSearch"
  on public."WMS_Items"
  using gin (lower(coalesce("WMSItem_Description", '')) extensions.gin_trgm_ops)
  where "WMSItem_IsActive" and not "WMSItem_IsDeleted";

create index if not exists "IX_WMS_Locations_SelectorScope"
  on public."WMS_Locations" (
    "WMSLocation_FacilityID",
    lower("WMSLocation_Code"),
    "WMSLocation_ID"
  )
  where "WMSLocation_IsActive" and not "WMSLocation_IsDeleted";

create index if not exists "IX_WMS_Locations_SelectorCodeSearch"
  on public."WMS_Locations"
  using gin (lower(coalesce("WMSLocation_Code", '')) extensions.gin_trgm_ops)
  where "WMSLocation_IsActive" and not "WMSLocation_IsDeleted";

create or replace function public.warehouse_edge_item_selector_page(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null,
  p_customer_org_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := lower(nullif(btrim(p_search), ''));
  v_pattern text;
  v_result jsonb;
begin
  if p_facility_id is null
    or p_customer_org_id is null
    or not (p_facility_id = any(coalesce(p_allowed_facility_ids, '{}'::uuid[])))
    or (p_allowed_org_ids is not null and not (p_customer_org_id = any(p_allowed_org_ids))) then
    return jsonb_build_object('rows', '[]'::jsonb, 'limit', v_limit, 'offset', v_offset, 'hasMore', false);
  end if;

  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  end if;

  with candidates as materialized (
    select
      item."WMSItem_ID" as id,
      item."WMSItem_CustomerOrgID" as customer_org_id,
      item."WMSItem_DefaultFacilityID" as facility_id,
      item."WMSItem_SKU" as sku,
      item."WMSItem_Description" as description,
      item."WMSItem_BaseUOMCode" as uom_code,
      item."WMSItem_QuantityBasisCode" as quantity_basis_code,
      item."WMSItem_AllowsFractionalQuantity" as allows_fractional_quantity,
      item."WMSItem_RequiresLot" as requires_lot,
      item."WMSItem_RequiresExpiry" as requires_expiry
    from public."WMS_Items" item
    where item."WMSItem_DefaultFacilityID" = p_facility_id
      and item."WMSItem_CustomerOrgID" = p_customer_org_id
      and item."WMSItem_IsActive"
      and not item."WMSItem_IsDeleted"
      and (
        v_search is null
        or lower(coalesce(item."WMSItem_SKU", '')) like v_pattern escape E'\\'
        or lower(coalesce(item."WMSItem_Description", '')) like v_pattern escape E'\\'
      )
    order by lower(item."WMSItem_SKU"), item."WMSItem_ID"
    limit v_limit + 1
    offset v_offset
  ), page as (
    select * from candidates
    order by lower(sku), id
    limit v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id,
      'customerOrgId', row.customer_org_id,
      'facilityId', row.facility_id,
      'sku', row.sku,
      'description', row.description,
      'uomCode', row.uom_code,
      'quantityBasisCode', coalesce(row.quantity_basis_code, 'count'),
      'allowsFractionalQuantity', coalesce(row.allows_fractional_quantity, false),
      'requiresLot', coalesce(row.requires_lot, false),
      'requiresExpiry', coalesce(row.requires_expiry, false)
    ) order by lower(row.sku), row.id) from page row), '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', (select count(*) > v_limit from candidates)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.warehouse_edge_location_selector_page(
  p_allowed_facility_ids uuid[],
  p_facility_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := lower(nullif(btrim(p_search), ''));
  v_pattern text;
  v_result jsonb;
begin
  if p_facility_id is null
    or not (p_facility_id = any(coalesce(p_allowed_facility_ids, '{}'::uuid[]))) then
    return jsonb_build_object('rows', '[]'::jsonb, 'limit', v_limit, 'offset', v_offset, 'hasMore', false);
  end if;

  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  end if;

  with candidates as materialized (
    select
      location."WMSLocation_ID" as id,
      location."WMSLocation_FacilityID" as facility_id,
      location."WMSLocation_Code" as code
    from public."WMS_Locations" location
    where location."WMSLocation_FacilityID" = p_facility_id
      and location."WMSLocation_IsActive"
      and not location."WMSLocation_IsDeleted"
      and (
        v_search is null
        or lower(coalesce(location."WMSLocation_Code", '')) like v_pattern escape E'\\'
      )
    order by lower(location."WMSLocation_Code"), location."WMSLocation_ID"
    limit v_limit + 1
    offset v_offset
  ), page as (
    select * from candidates
    order by lower(code), id
    limit v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id,
      'facilityId', row.facility_id,
      'code', row.code,
      'zoneName', null
    ) order by lower(row.code), row.id) from page row), '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', (select count(*) > v_limit from candidates)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_item_selector_page(uuid[], uuid[], uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_item_selector_page(uuid[], uuid[], uuid, uuid, text, integer, integer) to service_role;

revoke all on function public.warehouse_edge_location_selector_page(uuid[], uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_location_selector_page(uuid[], uuid, text, integer, integer) to service_role;

comment on function public.warehouse_edge_item_selector_page(uuid[], uuid[], uuid, uuid, text, integer, integer) is
  'Returns one tenant-scoped item selector page for Warehouse action dialogs.';

comment on function public.warehouse_edge_location_selector_page(uuid[], uuid, text, integer, integer) is
  'Returns one tenant-scoped location selector page for Warehouse action dialogs.';

commit;
