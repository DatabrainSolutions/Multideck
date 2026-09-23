-- The item customer/SKU uniqueness constraint also reserves soft-deleted SKUs.
-- Preview must report those conflicts before an operator confirms the upload.
begin;

create index if not exists "IX_WMS_Items_CustomerLowerSkuReserved"
  on public."WMS_Items" ("WMSItem_CustomerOrgID", lower("WMSItem_SKU"));

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
  select coalesce(array_agg(distinct lower(item."WMSItem_SKU") order by lower(item."WMSItem_SKU")), array[]::text[])
  from public."WMS_Items" item
  where item."WMSItem_CustomerOrgID" = p_customer_org_id
    and lower(item."WMSItem_SKU") = any(coalesce(p_skus, array[]::text[]));
$$;

revoke all on function public.warehouse_edge_existing_item_skus(uuid, text[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_existing_item_skus(uuid, text[]) to service_role;

comment on function public.warehouse_edge_existing_item_skus(uuid, text[]) is
  'Returns only matching case-insensitive SKUs reserved by one customer, including soft-deleted items, for a bounded uploaded SKU set. Service-role only; the warehouse route authorises the customer and facility first.';

commit;
