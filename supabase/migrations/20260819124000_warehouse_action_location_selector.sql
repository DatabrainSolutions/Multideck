-- Inventory action drawers reuse the order location selector, but also need the
-- location's operational status and type. Keep those attributes in the same
-- capped response rather than reopening the full handling-unit reference.

begin;

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
      location."WMSLocation_Code" as code,
      location."WMSLocation_StatusCode" as status_code,
      location."WMSLocation_TypeCode" as type_code
    from public."WMS_Locations" location
    where location."WMSLocation_FacilityID" = p_facility_id
      and location."WMSLocation_IsActive"
      and not location."WMSLocation_IsDeleted"
      and (v_search is null or lower(coalesce(location."WMSLocation_Code", '')) like v_pattern escape E'\\')
    order by lower(location."WMSLocation_Code"), location."WMSLocation_ID"
    limit v_limit + 1
    offset v_offset
  ), page as (
    select * from candidates order by lower(code), id limit v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id,
      'facilityId', row.facility_id,
      'code', row.code,
      'zoneName', null,
      'statusCode', row.status_code,
      'typeCode', row.type_code
    ) order by lower(row.code), row.id) from page row), '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', (select count(*) > v_limit from candidates)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_location_selector_page(uuid[], uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_location_selector_page(uuid[], uuid, text, integer, integer) to service_role;

comment on function public.warehouse_edge_location_selector_page(uuid[], uuid, text, integer, integer) is
  'Returns one capped tenant-scoped location selector page, including status and type for inventory actions.';

commit;
