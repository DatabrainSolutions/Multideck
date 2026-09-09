-- A location delete check only needs to know whether one open order references
-- the location. Keep that decision inside Postgres so the Edge Function never
-- transfers an unbounded history of order-line IDs.

begin;

create index if not exists "IX_WMS_OrderLines_SourceLocation_Order"
  on public."WMS_OrderLines" ("WMSOrderLine_SourceLocationID", "WMSOrderLine_OrderID")
  where "WMSOrderLine_SourceLocationID" is not null;

create index if not exists "IX_WMS_OrderLines_TargetLocation_Order"
  on public."WMS_OrderLines" ("WMSOrderLine_TargetLocationID", "WMSOrderLine_OrderID")
  where "WMSOrderLine_TargetLocationID" is not null;

create or replace function public.warehouse_edge_location_has_open_order(
  p_facility_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."WMS_OrderLines" order_line
    join public."WMS_Orders" warehouse_order
      on warehouse_order."WMSOrder_ID" = order_line."WMSOrderLine_OrderID"
    where warehouse_order."WMSOrder_FacilityID" = p_facility_id
      and not warehouse_order."WMSOrder_IsDeleted"
      and warehouse_order."WMSOrder_StatusCode" not in ('complete', 'cancelled')
      and (
        order_line."WMSOrderLine_SourceLocationID" = p_location_id
        or order_line."WMSOrderLine_TargetLocationID" = p_location_id
      )
    limit 1
  );
$$;

revoke all on function public.warehouse_edge_location_has_open_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.warehouse_edge_location_has_open_order(uuid, uuid) to service_role;

comment on function public.warehouse_edge_location_has_open_order(uuid, uuid) is
  'Returns whether one facility-scoped open warehouse order references a location without transferring order-line history.';

commit;
