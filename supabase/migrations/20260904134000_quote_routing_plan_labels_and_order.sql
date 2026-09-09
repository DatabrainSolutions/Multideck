-- Preserve manually named carriers and keep booking-added legs ordered after
-- the accepted quote plan without changing their operational content.

begin;

create or replace function booking_api.current_quote_sync_projection(requested_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select booking_api.current_quote_sync_projection_before_routing_plans_20260904(requested_job_id)
    || jsonb_build_object(
      'routing', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'order', route."JobRoute_OrderNo",
          'mode', booking_api.normalise_mode(route."JobRoute_ModeCode"),
          'origin', nullif(btrim(coalesce(route."JobRoute_OriginUNLocode", route."JobRoute_OriginNameSnapshot")), ''),
          'originUnlocode', nullif(upper(btrim(route."JobRoute_OriginUNLocode")), ''),
          'destination', nullif(btrim(coalesce(route."JobRoute_DestinationUNLocode", route."JobRoute_DestinationNameSnapshot")), ''),
          'destinationUnlocode', nullif(upper(btrim(route."JobRoute_DestinationUNLocode")), ''),
          'plannedDepartureAt', to_char(route."JobRoute_PlannedDepartureAt"::date, 'YYYY-MM-DD'),
          'plannedArrivalAt', to_char(route."JobRoute_PlannedArrivalAt"::date, 'YYYY-MM-DD'),
          'carrierId', route."JobRoute_Carrier",
          'carrierName', coalesce(carrier."Org_Name", nullif(btrim(route."JobRoute_RouteJSON"->>'carrierName'),'')),
          'serviceLevel', nullif(btrim(route."JobRoute_ServiceLevel"), '')
        )) order by route."JobRoute_OrderNo", route."JobRoute_ID")
        from public."Job_Routing" route
        left join public."Org_Master" carrier on carrier."Org_id"=route."JobRoute_Carrier"
        where route."Job_ID"=requested_job_id
          and coalesce(route."JobRoute_Status", 'planned')<>'superseded'
          and route."JobRoute_RouteJSON"->>'source' in ('accepted_quote','accepted_quote_update')
      ), '[]'::jsonb)
    )
$$;

alter function booking_api.apply_quote_routing_plan(uuid,uuid,uuid)
  rename to apply_quote_routing_plan_before_labels_and_order_20260904;

create or replace function booking_api.apply_quote_routing_plan(
  requested_job_id uuid,
  requested_version_id uuid,
  requested_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposed_routes jsonb;
  quote_route_count integer;
begin
  perform booking_api.apply_quote_routing_plan_before_labels_and_order_20260904(
    requested_job_id,requested_version_id,requested_actor_user_id
  );

  select booking_api.quote_sync_projection(version."CusQuoteVersion_SnapshotJSON")->'routing'
  into strict proposed_routes
  from public."CusQuote_Versions" version
  join public."Job_Header" job
    on job."Job_ID"=requested_job_id
   and job."Job_SourceQuoteID"=version."CusQuoteHeader_ID"
  where version."CusQuoteVersion_ID"=requested_version_id;

  quote_route_count := case when jsonb_typeof(proposed_routes)='array' then jsonb_array_length(proposed_routes) else 0 end;
  if quote_route_count<=1 then return; end if;

  update public."Job_Routing" route set
    "JobRoute_RouteJSON"=route."JobRoute_RouteJSON" || jsonb_build_object(
      'carrierName', proposed_routes#>>array[(route."JobRoute_OrderNo"-1)::text,'carrierName']
    )
  where route."Job_ID"=requested_job_id
    and coalesce(route."JobRoute_Status", 'planned')<>'superseded'
    and route."JobRoute_RouteJSON"->>'source' in ('accepted_quote','accepted_quote_update')
    and route."JobRoute_OrderNo" between 1 and quote_route_count;

  with operational_order as (
    select route."JobRoute_ID",
      row_number() over (order by route."JobRoute_OrderNo",route."JobRoute_ID") as sequence_no
    from public."Job_Routing" route
    where route."Job_ID"=requested_job_id
      and coalesce(route."JobRoute_Status", 'planned')<>'superseded'
      and coalesce(route."JobRoute_RouteJSON"->>'source','') not in ('accepted_quote','accepted_quote_update')
  )
  update public."Job_Routing" route set
    "JobRoute_OrderNo"=(quote_route_count+operational_order.sequence_no)::integer,
    "JobRoute_UpdatedAt"=now(),
    "JobRoute_UpdatedBy"=requested_actor_user_id
  from operational_order
  where route."JobRoute_ID"=operational_order."JobRoute_ID";
exception when no_data_found or too_many_rows then
  raise exception 'The accepted quote routing plan is unavailable.' using errcode='P0002';
end;
$$;

revoke all on function booking_api.current_quote_sync_projection(uuid) from public,anon,authenticated;
revoke all on function booking_api.apply_quote_routing_plan_before_labels_and_order_20260904(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function booking_api.apply_quote_routing_plan(uuid,uuid,uuid) from public,anon,authenticated,service_role;

commit;
