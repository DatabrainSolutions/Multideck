-- Draft outbound orders need exact availability totals for only the visible
-- item/location choices and entered lines. Keep that advisory read structured,
-- capped and service-role-only instead of returning every balance to the client.

begin;

create or replace function public.warehouse_edge_draft_order_availability(
  p_allowed_facility_ids uuid[],
  p_allowed_org_ids uuid[] default null,
  p_facility_id uuid default null,
  p_customer_org_id uuid default null,
  p_queries jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if p_facility_id is null
    or p_customer_org_id is null
    or not (p_facility_id = any(coalesce(p_allowed_facility_ids, '{}'::uuid[])))
    or (p_allowed_org_ids is not null and not (p_customer_org_id = any(p_allowed_org_ids)))
    or jsonb_typeof(p_queries) <> 'array'
    or jsonb_array_length(p_queries) > 100 then
    return '[]'::jsonb;
  end if;

  with requirements as materialized (
    select
      entry.value->>'key' as query_key,
      (entry.value->>'itemId')::uuid as item_id,
      nullif(entry.value->>'locationId', '')::uuid as location_id,
      nullif(btrim(entry.value->>'lotNumber'), '') as lot_number,
      coalesce(nullif(btrim(entry.value->>'customsStatusCode'), ''), 'free_circulation') as customs_status_code,
      coalesce(nullif(btrim(entry.value->>'uomCode'), ''), 'EA') as uom_code,
      entry.ordinality as position
    from jsonb_array_elements(p_queries) with ordinality as entry(value, ordinality)
  ), eligible as materialized (
    select requirement.*
    from requirements requirement
    join public."WMS_Items" item
      on item."WMSItem_ID" = requirement.item_id
      and item."WMSItem_DefaultFacilityID" = p_facility_id
      and item."WMSItem_CustomerOrgID" = p_customer_org_id
      and item."WMSItem_IsActive"
      and not item."WMSItem_IsDeleted"
  ), totals as (
    select
      requirement.query_key,
      requirement.uom_code,
      requirement.position,
      coalesce(sum(balance."WMSBalance_AvailableQuantity") filter (
        where requirement.lot_number is null
          or lot."WMSLot_LotNumber" = requirement.lot_number
      ), 0) as available
    from eligible requirement
    left join public."WMS_InventoryBalances" balance
      on balance."WMSBalance_FacilityID" = p_facility_id
      and balance."WMSBalance_CustomerOrgID" = p_customer_org_id
      and balance."WMSBalance_ItemID" = requirement.item_id
      and balance."WMSBalance_InventoryStatusCode" = 'available'
      and balance."WMSBalance_CustomsStatusCode" = requirement.customs_status_code
      and balance."WMSBalance_UOMCode" = requirement.uom_code
      and balance."WMSBalance_AvailableQuantity" > 0
      and (requirement.location_id is null or balance."WMSBalance_LocationID" = requirement.location_id)
    left join public."WMS_InventoryLots" lot
      on lot."WMSLot_ID" = balance."WMSBalance_LotID"
    group by requirement.query_key, requirement.uom_code, requirement.position
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', total.query_key,
    'available', total.available,
    'uomCode', total.uom_code
  ) order by total.position), '[]'::jsonb)
  into v_result
  from totals total;

  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_draft_order_availability(uuid[], uuid[], uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.warehouse_edge_draft_order_availability(uuid[], uuid[], uuid, uuid, jsonb) to service_role;

comment on function public.warehouse_edge_draft_order_availability(uuid[], uuid[], uuid, uuid, jsonb) is
  'Returns up to 100 exact stock totals for visible outbound-order choices without exposing inventory rows.';

commit;
