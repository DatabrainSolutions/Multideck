-- Generate the next warehouse purchase-order number without transferring every
-- number to the Edge Function. The expression index keeps the numeric suffix
-- lookup fast even after a facility has accumulated a large order history.

begin;

create index if not exists "IX_WMS_PurchaseOrders_NumberSequence"
  on public."WMS_PurchaseOrders" (
    "WMSPO_FacilityID",
    lower(regexp_replace("WMSPO_Number", '-[0-9]+$', '')),
    ((substring("WMSPO_Number" from '([0-9]+)$'))::bigint) desc
  )
  where not "WMSPO_IsDeleted"
    and "WMSPO_Number" ~ '-[0-9]+$';

create or replace function public.warehouse_edge_next_purchase_order_number(
  p_allowed_facility_ids uuid[],
  p_facility_id uuid,
  p_prefix text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prefix text := left(btrim(coalesce(p_prefix, '')), 100);
  v_sequence bigint;
  v_sequence_text text;
begin
  if p_facility_id is null
    or not (p_facility_id = any(coalesce(p_allowed_facility_ids, '{}'::uuid[]))) then
    return null;
  end if;
  if v_prefix = '' then
    return null;
  end if;

  select (substring(purchase_order."WMSPO_Number" from '([0-9]+)$'))::bigint
    into v_sequence
  from public."WMS_PurchaseOrders" purchase_order
  where purchase_order."WMSPO_FacilityID" = p_facility_id
    and not purchase_order."WMSPO_IsDeleted"
    and purchase_order."WMSPO_Number" ~ '-[0-9]+$'
    and lower(regexp_replace(purchase_order."WMSPO_Number", '-[0-9]+$', '')) = lower(v_prefix)
  order by (substring(purchase_order."WMSPO_Number" from '([0-9]+)$'))::bigint desc
  limit 1;

  v_sequence_text := (coalesce(v_sequence, 0) + 1)::text;
  return v_prefix || '-' || lpad(v_sequence_text, greatest(4, length(v_sequence_text)), '0');
end;
$$;

revoke all on function public.warehouse_edge_next_purchase_order_number(uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.warehouse_edge_next_purchase_order_number(uuid[], uuid, text) to service_role;

comment on function public.warehouse_edge_next_purchase_order_number(uuid[], uuid, text) is
  'Returns one indexed next-number suggestion inside an Edge-authenticated warehouse scope.';

commit;
