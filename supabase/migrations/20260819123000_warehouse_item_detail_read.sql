-- Item detail routes are addressed by human-readable SKU. Resolve that one ID
-- inside the actor's Warehouse scope before the Edge Function loads the item and
-- its packaging rows, instead of materialising every item and UOM first.

begin;

create index if not exists "IX_WMS_Items_DetailSku"
  on public."WMS_Items" (
    lower("WMSItem_SKU"),
    "WMSItem_DefaultFacilityID",
    "WMSItem_CustomerOrgID",
    "WMSItem_ID"
  )
  where not "WMSItem_IsDeleted";

create or replace function public.warehouse_edge_item_id_by_sku(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_sku text default null
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select item."WMSItem_ID"
  from public."WMS_Items" item
  where btrim(coalesce(p_sku, '')) <> ''
    and lower(item."WMSItem_SKU") = lower(btrim(p_sku))
    and item."WMSItem_DefaultFacilityID" = any(coalesce(p_allowed_facility_ids, '{}'::uuid[]))
    and (p_allowed_org_ids is null or item."WMSItem_CustomerOrgID" = any(p_allowed_org_ids))
    and not item."WMSItem_IsDeleted"
  order by item."WMSItem_ID"
  limit 1;
$$;

revoke all on function public.warehouse_edge_item_id_by_sku(uuid[], uuid[], text) from public, anon, authenticated;
grant execute on function public.warehouse_edge_item_id_by_sku(uuid[], uuid[], text) to service_role;

comment on function public.warehouse_edge_item_id_by_sku(uuid[], uuid[], text) is
  'Resolves one exact case-insensitive Warehouse item SKU inside an Edge-authenticated facility and organisation scope.';

commit;
