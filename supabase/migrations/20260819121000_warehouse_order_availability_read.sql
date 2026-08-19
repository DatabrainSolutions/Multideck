-- Outbound dispatch only needs FIFO availability for the items on one order.
-- Keep that read service-role-only, facility scoped and capped instead of
-- transferring the tenant's complete inventory context to the browser.

begin;

create index if not exists "IX_WMS_Balances_OrderAvailability"
  on public."WMS_InventoryBalances" (
    "WMSBalance_FacilityID",
    "WMSBalance_CustomerOrgID",
    "WMSBalance_ItemID",
    "WMSBalance_CustomsStatusCode",
    "WMSBalance_FirstReceiptAt",
    "WMSBalance_ID"
  )
  include (
    "WMSBalance_LocationID",
    "WMSBalance_LotID",
    "WMSBalance_UOMCode",
    "WMSBalance_AvailableQuantity"
  )
  where "WMSBalance_InventoryStatusCode" = 'available'
    and "WMSBalance_AvailableQuantity" > 0;

create or replace function public.warehouse_edge_order_availability(
  p_allowed_facility_ids uuid[],
  p_order_id uuid,
  p_limit_per_item integer default 25,
  p_total_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_per_item integer := greatest(1, least(coalesce(p_limit_per_item, 25), 50));
  v_total integer := greatest(1, least(coalesce(p_total_limit, 500), 1000));
  v_result jsonb;
begin
  with selected_order as materialized (
    select
      warehouse_order."WMSOrder_ID" as order_id,
      warehouse_order."WMSOrder_FacilityID" as facility_id,
      warehouse_order."WMSOrder_CustomerOrgID" as customer_org_id
    from public."WMS_Orders" warehouse_order
    where warehouse_order."WMSOrder_ID" = p_order_id
      and warehouse_order."WMSOrder_FacilityID" = any(coalesce(p_allowed_facility_ids, '{}'::uuid[]))
      and warehouse_order."WMSOrder_TypeCode" = 'outbound'
      and not warehouse_order."WMSOrder_IsDeleted"
    limit 1
  ), order_items as materialized (
    select distinct
      order_line."WMSOrderLine_ItemID" as item_id,
      order_line."WMSOrderLine_CustomsStatusCode" as customs_status_code
    from selected_order
    join public."WMS_OrderLines" order_line
      on order_line."WMSOrderLine_OrderID" = selected_order.order_id
  ), ranked as (
    select
      balance."WMSBalance_ID" as id,
      balance."WMSBalance_ItemID" as item_id,
      balance."WMSBalance_LocationID" as location_id,
      location."WMSLocation_Code" as location_code,
      balance."WMSBalance_LotID" as lot_id,
      lot."WMSLot_LotNumber" as lot_number,
      lot."WMSLot_BatchNumber" as batch_number,
      balance."WMSBalance_CustomsStatusCode" as customs_status_code,
      balance."WMSBalance_UOMCode" as uom_code,
      balance."WMSBalance_AvailableQuantity" as available_quantity,
      balance."WMSBalance_FirstReceiptAt" as first_receipt_at,
      row_number() over (
        partition by balance."WMSBalance_ItemID", balance."WMSBalance_CustomsStatusCode"
        order by balance."WMSBalance_FirstReceiptAt" nulls last, balance."WMSBalance_ID"
      ) as item_rank
    from selected_order
    join order_items on true
    join public."WMS_InventoryBalances" balance
      on balance."WMSBalance_FacilityID" = selected_order.facility_id
      and balance."WMSBalance_CustomerOrgID" = selected_order.customer_org_id
      and balance."WMSBalance_ItemID" = order_items.item_id
      and balance."WMSBalance_CustomsStatusCode" = order_items.customs_status_code
      and balance."WMSBalance_InventoryStatusCode" = 'available'
      and balance."WMSBalance_AvailableQuantity" > 0
    left join public."WMS_InventoryLots" lot
      on lot."WMSLot_ID" = balance."WMSBalance_LotID"
    left join public."WMS_Locations" location
      on location."WMSLocation_ID" = balance."WMSBalance_LocationID"
  ), capped as (
    select *
    from ranked
    where item_rank <= v_per_item
    order by item_id, customs_status_code, item_rank
    limit v_total
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', entry.id,
    'itemId', entry.item_id,
    'locationId', entry.location_id,
    'locationCode', entry.location_code,
    'lotId', entry.lot_id,
    'lotNumber', entry.lot_number,
    'batchNumber', entry.batch_number,
    'customsStatusCode', entry.customs_status_code,
    'uomCode', entry.uom_code,
    'availableQuantity', entry.available_quantity
  ) order by entry.item_id, entry.customs_status_code, entry.item_rank), '[]'::jsonb)
  into v_result
  from capped entry;

  return v_result;
end;
$$;

revoke all on function public.warehouse_edge_order_availability(uuid[], uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_order_availability(uuid[], uuid, integer, integer) to service_role;

comment on function public.warehouse_edge_order_availability(uuid[], uuid, integer, integer) is
  'Returns capped FIFO stock choices for the outbound items on one authorised warehouse order.';

commit;
