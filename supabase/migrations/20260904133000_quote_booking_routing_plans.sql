-- Make quote routing plans version-aware without treating booking-only routing
-- as quote drift. Quote-owned legs are updated only after operator approval.

begin;

alter function booking_api.quote_sync_projection(jsonb)
  rename to quote_sync_projection_before_routing_plans_20260904;

create or replace function booking_api.quote_sync_projection(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with source as (
    select
      coalesce(snapshot->'quote', '{}'::jsonb) as quote,
      coalesce(snapshot#>'{quote,shipmentFacts}', '{}'::jsonb) as facts
  ), route_plan as (
    select case
      when jsonb_typeof(facts->'routingLegs')='array' and jsonb_array_length(facts->'routingLegs')>1 then (
        select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'order', item.ordinality,
          'mode', booking_api.normalise_mode(coalesce(nullif(leg->>'mode',''), quote->>'mode')),
          'origin', nullif(btrim(coalesce(leg#>>'{origin,unlocode}', leg#>>'{origin,place}')), ''),
          'originUnlocode', nullif(upper(btrim(leg#>>'{origin,unlocode}')), ''),
          'destination', nullif(btrim(coalesce(leg#>>'{destination,unlocode}', leg#>>'{destination,place}')), ''),
          'destinationUnlocode', nullif(upper(btrim(leg#>>'{destination,unlocode}')), ''),
          'plannedDepartureAt', nullif(btrim(leg->>'estimatedDeparture'), ''),
          'plannedArrivalAt', nullif(btrim(leg->>'estimatedArrival'), ''),
          'carrierId', nullif(leg->>'carrierId',''),
          'carrierName', nullif(btrim(leg->>'carrierName'),''),
          'serviceLevel', nullif(btrim(leg->>'serviceLevel'),'')
        )) order by item.ordinality), '[]'::jsonb)
        from jsonb_array_elements(facts->'routingLegs') with ordinality as item(leg, ordinality)
      )
      else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'order', 1,
        'mode', booking_api.normalise_mode(quote->>'mode'),
        'origin', nullif(btrim(quote->>'loadingPoint'), ''),
        'originUnlocode', nullif(upper(btrim(facts->>'originUnlocode')), ''),
        'destination', nullif(btrim(quote->>'dischargePoint'), ''),
        'destinationUnlocode', nullif(upper(btrim(facts->>'destinationUnlocode')), ''),
        'plannedDepartureAt', nullif(btrim(facts->>'estimatedDeparture'), ''),
        'plannedArrivalAt', nullif(btrim(facts->>'estimatedArrival'), ''),
        'carrierId', nullif(quote->>'carrierId',''),
        'carrierName', nullif(btrim(quote->>'carrierName'),''),
        'serviceLevel', nullif(btrim(quote->>'serviceLevel'),'')
      )))
    end as routes
    from source
  )
  select booking_api.quote_sync_projection_before_routing_plans_20260904(snapshot)
    || jsonb_build_object('routing', route_plan.routes)
  from route_plan
$$;

alter function booking_api.current_quote_sync_projection(uuid)
  rename to current_quote_sync_projection_before_routing_plans_20260904;

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
          'carrierName', carrier."Org_Name",
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

create or replace function booking_api.quote_sync_differences(
  baseline jsonb,
  booking jsonb,
  proposed jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with route_context as (
    select greatest(
      coalesce(jsonb_array_length(case when jsonb_typeof(baseline->'routing')='array' then baseline->'routing' else '[]'::jsonb end),0),
      coalesce(jsonb_array_length(case when jsonb_typeof(proposed->'routing')='array' then proposed->'routing' else '[]'::jsonb end),0)
    )>1 as has_multi_leg_plan
  ), fields(order_no, field_key, label, section_name) as (values
    (1,'direction','Direction','Job data'), (2,'mode','Mode','Job data'),
    (3,'shipmentType','Shipment type','Service'), (4,'serviceLevel','Service level','Service'),
    (5,'carrier','Carrier','Carrier & supplier'), (6,'supplier','Supplier','Carrier & supplier'),
    (7,'origin','Origin','Route & service'), (8,'destination','Destination','Route & service'),
    (9,'collectionAddress','Collection address','Route & service'), (10,'deliveryAddress','Delivery address','Route & service'),
    (11,'incoterm','Incoterm','Route & service'), (12,'incotermLocation','Named place','Route & service'),
    (13,'estimatedDeparture','ETD','Route & service'), (14,'estimatedArrival','ETA','Route & service'),
    (15,'routing','Routing plan','Route & service'),
    (16,'shipper','Shipper','Parties'), (17,'consignee','Consignee','Parties'),
    (18,'cargo','Goods','Goods'), (19,'equipment','Equipment / container','Goods'),
    (20,'customerNotes','Customer notes','Customer terms'), (21,'terms','Terms and conditions','Customer terms'),
    (22,'subjectToTerms','Subject to terms','Customer terms'), (23,'charges','Quote charges','Financials')
  ), comparison as (
    select
      fields.*,
      (booking->field_key) is distinct from (baseline->field_key) as booking_changed,
      (booking->field_key) is distinct from (baseline->field_key)
        and (booking->field_key) is distinct from (proposed->field_key) as has_conflict
    from fields cross join route_context
    where (proposed->field_key) is distinct from (baseline->field_key)
      and (field_key<>'routing' or has_multi_leg_plan)
      and not (
        has_multi_leg_plan
        and field_key in ('serviceLevel','carrier','origin','destination','estimatedDeparture','estimatedArrival')
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', field_key,
    'label', label,
    'section', section_name,
    'previousQuoteValue', baseline->field_key,
    'bookingValue', booking->field_key,
    'newQuoteValue', proposed->field_key,
    'bookingChanged', booking_changed,
    'conflict', has_conflict,
    'requiresConfirmation', field_key='mode' or has_conflict,
    'warningCode', case
      when field_key='mode' then 'mode_change'
      when has_conflict then 'booking_changed'
      else null
    end,
    'recommendation', case when field_key='mode' or has_conflict then 'review' else 'apply' end
  ) order by order_no), '[]'::jsonb)
  from comparison
$$;

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
  job_row record;
  version_row record;
  proposed_routes jsonb;
  leg jsonb;
  leg_order integer := 0;
  route_id uuid;
  applied_route_ids uuid[] := '{}'::uuid[];
  first_leg jsonb;
  last_leg jsonb;
  previous_routes jsonb;
begin
  select job.* into strict job_row
  from public."Job_Header" job
  where job."Job_ID"=requested_job_id and not job."Job_IsDeleted"
  for update;

  select version.* into strict version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID"=requested_version_id
    and version."CusQuoteHeader_ID"=job_row."Job_SourceQuoteID";

  proposed_routes := booking_api.quote_sync_projection(version_row."CusQuoteVersion_SnapshotJSON")->'routing';
  if jsonb_typeof(proposed_routes)<>'array' or jsonb_array_length(proposed_routes)<=1 then return; end if;

  select coalesce(jsonb_agg(to_jsonb(route.*) order by route."JobRoute_OrderNo", route."JobRoute_ID"), '[]'::jsonb)
  into previous_routes
  from public."Job_Routing" route
  where route."Job_ID"=requested_job_id
    and coalesce(route."JobRoute_Status", 'planned')<>'superseded'
    and route."JobRoute_RouteJSON"->>'source' in ('accepted_quote','accepted_quote_update');

  for leg in select value from jsonb_array_elements(proposed_routes) loop
    leg_order := leg_order + 1;
    if nullif(btrim(leg->>'origin'),'') is null or nullif(btrim(leg->>'destination'),'') is null then
      raise exception 'Every quoted routing leg needs an origin and destination.' using errcode='22023';
    end if;

    select route."JobRoute_ID" into route_id
    from public."Job_Routing" route
    where route."Job_ID"=requested_job_id
      and coalesce(route."JobRoute_Status", 'planned')<>'superseded'
      and route."JobRoute_RouteJSON"->>'source' in ('accepted_quote','accepted_quote_update')
    order by route."JobRoute_OrderNo", route."JobRoute_ID"
    offset greatest(leg_order-1,0) limit 1;

    if route_id is null then
      insert into public."Job_Routing" (
        "Job_ID","JobRoute_OrderNo","JobRoute_Status","JobRoute_ModeCode",
        "JobRoute_OriginUNLocode","JobRoute_OriginNameSnapshot",
        "JobRoute_DestinationUNLocode","JobRoute_DestinationNameSnapshot",
        "JobRoute_PlannedDepartureAt","JobRoute_PlannedArrivalAt","JobRoute_Carrier",
        "JobRoute_ServiceLevel","JobRoute_IsMainCarriage","JobRoute_RouteJSON","JobRoute_UpdatedBy"
      ) values (
        requested_job_id,leg_order,'planned',booking_api.normalise_mode(leg->>'mode'),
        left(nullif(upper(btrim(leg->>'originUnlocode')),''),10),left(nullif(btrim(leg->>'origin'),''),180),
        left(nullif(upper(btrim(leg->>'destinationUnlocode')),''),10),left(nullif(btrim(leg->>'destination'),''),180),
        nullif(leg->>'plannedDepartureAt','')::timestamptz,nullif(leg->>'plannedArrivalAt','')::timestamptz,
        nullif(leg->>'carrierId','')::uuid,left(nullif(btrim(leg->>'serviceLevel'),''),80),leg_order=1,
        jsonb_build_object('source','accepted_quote_update','quoteVersionId',requested_version_id),requested_actor_user_id
      ) returning "JobRoute_ID" into route_id;
    else
      update public."Job_Routing" route set
        "JobRoute_OrderNo"=leg_order,
        "JobRoute_Status"='planned',
        "JobRoute_ModeCode"=booking_api.normalise_mode(leg->>'mode'),
        "JobRoute_OriginUNLocode"=left(nullif(upper(btrim(leg->>'originUnlocode')),''),10),
        "JobRoute_OriginNameSnapshot"=left(nullif(btrim(leg->>'origin'),''),180),
        "JobRoute_DestinationUNLocode"=left(nullif(upper(btrim(leg->>'destinationUnlocode')),''),10),
        "JobRoute_DestinationNameSnapshot"=left(nullif(btrim(leg->>'destination'),''),180),
        "JobRoute_PlannedDepartureAt"=nullif(leg->>'plannedDepartureAt','')::timestamptz,
        "JobRoute_PlannedArrivalAt"=nullif(leg->>'plannedArrivalAt','')::timestamptz,
        "JobRoute_Carrier"=nullif(leg->>'carrierId','')::uuid,
        "JobRoute_ServiceLevel"=left(nullif(btrim(leg->>'serviceLevel'),''),80),
        "JobRoute_IsMainCarriage"=leg_order=1,
        "JobRoute_RouteJSON"=route."JobRoute_RouteJSON" || jsonb_build_object(
          'source','accepted_quote_update','quoteVersionId',requested_version_id
        ),
        "JobRoute_UpdatedAt"=now(),
        "JobRoute_UpdatedBy"=requested_actor_user_id
      where route."JobRoute_ID"=route_id and route."Job_ID"=requested_job_id;
    end if;
    applied_route_ids := array_append(applied_route_ids, route_id);
    route_id := null;
  end loop;

  update public."Job_Routing" route set
    "JobRoute_Status"='superseded',
    "JobRoute_RouteJSON"=route."JobRoute_RouteJSON" || jsonb_build_object(
      'supersededByQuoteVersionId',requested_version_id,'supersededAt',now()
    ),
    "JobRoute_UpdatedAt"=now(),
    "JobRoute_UpdatedBy"=requested_actor_user_id
  where route."Job_ID"=requested_job_id
    and route."JobRoute_RouteJSON"->>'source' in ('accepted_quote','accepted_quote_update')
    and not (route."JobRoute_ID"=any(applied_route_ids));

  first_leg := proposed_routes->0;
  last_leg := proposed_routes->(jsonb_array_length(proposed_routes)-1);
  update public."Job_Header" set
    "Job_OriginUNLocode"=coalesce(nullif(first_leg->>'originUnlocode',''), "Job_OriginUNLocode"),
    "Job_OriginNameSnapshot"=coalesce(nullif(first_leg->>'origin',''), "Job_OriginNameSnapshot"),
    "Job_DestinationUNLocode"=coalesce(nullif(last_leg->>'destinationUnlocode',''), "Job_DestinationUNLocode"),
    "Job_DestinationNameSnapshot"=coalesce(nullif(last_leg->>'destination',''), "Job_DestinationNameSnapshot"),
    "Job_ReadyDate"=case when first_leg->>'plannedDepartureAt' ~ '^\d{4}-\d{2}-\d{2}$' then (first_leg->>'plannedDepartureAt')::date else "Job_ReadyDate" end,
    "Job_RequiredDeliveryDate"=case when last_leg->>'plannedArrivalAt' ~ '^\d{4}-\d{2}-\d{2}$' then (last_leg->>'plannedArrivalAt')::date else "Job_RequiredDeliveryDate" end,
    "Job_UpdatedAt"=now(),
    "Job_UpdatedBy"=requested_actor_user_id
  where "Job_ID"=requested_job_id;

  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
  select office."Company_ID",job_row."Job_ID",'quote_routing_plan_applied',
    'The accepted quote routing plan was applied without changing booking-only routing legs.',
    jsonb_build_object('quoteVersionId',requested_version_id,'before',previous_routes,'after',proposed_routes),
    requested_actor_user_id
  from public."cmp_Offices" office
  where office."Office_ID"=coalesce(job_row."Job_OrgOfficeID",job_row."Job_OfficeID");
exception when no_data_found or too_many_rows then
  raise exception 'The accepted quote routing plan is unavailable.' using errcode='P0002';
end;
$$;

-- Keep the existing apply engine, but surround it with the quote-owned routing
-- update and refresh the returned workspace after the route rows are changed.
create or replace function public.booking_workflow_apply_quote_sync_confirmed(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_review_id uuid,
  requested_fields jsonb,
  confirm_mode_change boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row record;
  result jsonb;
  booking_reference text;
  actor_user_id uuid;
begin
  if requested_fields ? 'mode' and not coalesce(confirm_mode_change,false) then
    raise exception 'Confirm the mode change before applying it to the booking.' using errcode='22023';
  end if;
  if requested_fields ? 'routing' then
    select app_user."User_ID" into strict actor_user_id
    from public."cmp_Users" app_user
    where app_user."Auth_User_ID"=caller_auth_user_id and app_user."User_AccessStatus"='active';
    select review.* into strict review_row
    from booking_api.quote_sync_reviews review
    where review.review_id=requested_review_id and review.job_id=requested_job_id
      and review.status_code in ('pending','partially_applied');
    perform booking_api.apply_quote_routing_plan(
      requested_job_id,review_row.proposed_version_id,actor_user_id
    );
  end if;

  result := public.booking_workflow_apply_quote_sync(
    caller_auth_user_id,requested_job_id,requested_review_id,requested_fields
  );

  if requested_fields ? 'routing' then
    select job."Job_BookingReference" into strict booking_reference
    from public."Job_Header" job where job."Job_ID"=requested_job_id;
    result := result || jsonb_build_object(
      'workspace',booking_api.workspace_with_document_groups(caller_auth_user_id,booking_reference)
    );
  end if;
  return result;
exception when no_data_found or too_many_rows then
  raise exception 'The quote update review is unavailable in this workspace.' using errcode='P0002';
end;
$$;

-- A first-time accepted multi-leg quote must create the same quote-owned route
-- plan; later accepted versions remain review-only.
alter function booking_api.convert_accepted_quote(uuid,uuid,uuid)
  rename to convert_accepted_quote_before_routing_plans_20260904;

create or replace function booking_api.convert_accepted_quote(
  requested_quote_id uuid,
  requested_actor_user_id uuid default null,
  requested_response_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  accepted_version_id uuid;
  actor_user_id uuid;
begin
  result := booking_api.convert_accepted_quote_before_routing_plans_20260904(
    requested_quote_id,requested_actor_user_id,requested_response_id
  );
  if not coalesce((result->>'reused')::boolean,false) then
    select quote."CusQuoteHeader_AcceptedVersionID",
      coalesce(requested_actor_user_id,quote."CusQuoteHeader_SalesOwnerID",quote."CusQuoteHeader_LastEditedBy",quote."CusQuoteHeader_CreatedBy")
    into strict accepted_version_id,actor_user_id
    from public."CusQuote_Header" quote
    where quote."CusQuoteHeader_ID"=requested_quote_id;
    perform booking_api.apply_quote_routing_plan(
      (result->>'jobId')::uuid,accepted_version_id,actor_user_id
    );
  end if;
  return result;
exception when no_data_found or too_many_rows then
  raise exception 'The accepted quote routing plan is unavailable.' using errcode='P0002';
end;
$$;

-- Recalculate active reviews against the richer projection without touching a
-- booking or changing any decision already made by an operator.
update booking_api.quote_sync_reviews review set
  baseline_snapshot=booking_api.quote_sync_projection(coalesce((
    select version."CusQuoteVersion_SnapshotJSON"
    from public."CusQuote_Versions" version
    where version."CusQuoteVersion_ID"=review.applied_version_id
  ), '{}'::jsonb)),
  proposed_snapshot=booking_api.quote_sync_projection((
    select version."CusQuoteVersion_SnapshotJSON"
    from public."CusQuote_Versions" version
    where version."CusQuoteVersion_ID"=review.proposed_version_id
  )),
  booking_snapshot=booking_api.current_quote_sync_projection(review.job_id)
where review.status_code in ('pending','partially_applied');

update booking_api.quote_sync_reviews review set
  differences=booking_api.quote_sync_differences(
    review.baseline_snapshot,review.booking_snapshot,review.proposed_snapshot
  )
where review.status_code in ('pending','partially_applied');

create index if not exists "IX_quote_sync_reviews_applied_version"
  on booking_api.quote_sync_reviews(applied_version_id);
create index if not exists "IX_quote_sync_reviews_proposed_version"
  on booking_api.quote_sync_reviews(proposed_version_id);
create index if not exists "IX_quote_sync_reviews_company"
  on booking_api.quote_sync_reviews(company_id);
create index if not exists "IX_quote_sync_reviews_created_by"
  on booking_api.quote_sync_reviews(created_by);
create index if not exists "IX_quote_sync_reviews_decided_by"
  on booking_api.quote_sync_reviews(decided_by);
create index if not exists "IX_quote_sync_reviews_response"
  on booking_api.quote_sync_reviews(proposed_response_id);

revoke all on function booking_api.quote_sync_projection_before_routing_plans_20260904(jsonb) from public,anon,authenticated,service_role;
revoke all on function booking_api.current_quote_sync_projection_before_routing_plans_20260904(uuid) from public,anon,authenticated,service_role;
revoke all on function booking_api.quote_sync_projection(jsonb) from public,anon,authenticated;
revoke all on function booking_api.current_quote_sync_projection(uuid) from public,anon,authenticated;
revoke all on function booking_api.quote_sync_differences(jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function booking_api.apply_quote_routing_plan(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean) to service_role;
revoke all on function booking_api.convert_accepted_quote_before_routing_plans_20260904(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function booking_api.convert_accepted_quote(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid,uuid,uuid) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Canonical freight bookings, including accepted-quote provenance, applied quote version, quote-owned multi-leg routing and any operator-reviewable newer accepted quote. Booking-only operational legs remain separate. Applying a quote update is approval-only; mode changes always require explicit operator confirmation in Booking Details.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='bookings';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Freight booking summary status, route, quote-owned and operational routing legs, delivery, ownership, risk, job-related Customs handoff and newer accepted quote review availability. Quote updates require operator approval and mode changes require explicit confirmation.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='bookings';

commit;
