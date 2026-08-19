-- Item imports should compare only the SKUs in the uploaded workbook. Avoid
-- loading every existing tenant item and every packaging row into the Edge
-- Function before validating a bounded import batch.

begin;

create index if not exists "IX_WMS_Items_CustomerLowerSku"
  on public."WMS_Items" ("WMSItem_CustomerOrgID", lower("WMSItem_SKU"))
  where not "WMSItem_IsDeleted";

create or replace function public.warehouse_edge_existing_item_skus(
  p_customer_org_id uuid,
  p_skus text[]
)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(lower(item."WMSItem_SKU") order by lower(item."WMSItem_SKU")), array[]::text[])
  from public."WMS_Items" item
  where item."WMSItem_CustomerOrgID" = p_customer_org_id
    and not item."WMSItem_IsDeleted"
    and lower(item."WMSItem_SKU") = any(coalesce(p_skus, array[]::text[]));
$$;

revoke all on function public.warehouse_edge_existing_item_skus(uuid, text[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_existing_item_skus(uuid, text[]) to service_role;

comment on function public.warehouse_edge_existing_item_skus(uuid, text[]) is
  'Returns only existing case-insensitive SKUs for one customer and a bounded uploaded SKU set.';

commit;
