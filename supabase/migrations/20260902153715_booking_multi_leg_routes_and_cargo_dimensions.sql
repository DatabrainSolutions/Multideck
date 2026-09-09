-- Persist the richer booking editor without changing the accepted quote snapshot.
-- Multiple route legs are additive: existing operational legs are never removed
-- merely because they are absent from an editor payload.

begin;

create or replace function booking_api.save_booking_route_legs(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  leg jsonb;
  leg_id uuid;
  leg_order integer := 0;
  mode_value text;
  route_json jsonb;
begin
  if not (payload ? 'routes') then return; end if;
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode = '42501';
  end if;
  if jsonb_typeof(payload->'routes') <> 'array' or jsonb_array_length(payload->'routes') > 30 then
    raise exception 'Booking routing steps are invalid.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';

  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = requested_job_id
    and office."Company_ID" = app_user."Company_ID"
    and not job."Job_IsDeleted"
  for update;
  if not found then
    raise exception 'That booking is outside this workspace.' using errcode = '42501';
  end if;

  for leg in select value from jsonb_array_elements(payload->'routes') loop
    leg_order := leg_order + 1;
    if nullif(btrim(coalesce(leg->>'originUnlocode', leg->>'origin')), '') is null
       or nullif(btrim(coalesce(leg->>'destinationUnlocode', leg->>'destination')), '') is null then
      raise exception 'Each routing step needs an origin and destination.' using errcode = '22023';
    end if;
    leg_id := nullif(leg->>'id', '')::uuid;
    mode_value := booking_api.normalise_mode(coalesce(nullif(leg->>'mode', ''), job_row."Job_TransportModeSummary", 'road'));
    route_json := case when jsonb_typeof(leg->'routeData') = 'object' then leg->'routeData' else '{}'::jsonb end;

    if leg_id is not null and not exists (
      select 1 from public."Job_Routing" route
      where route."JobRoute_ID" = leg_id and route."Job_ID" = requested_job_id
    ) then
      raise exception 'That routing step does not belong to this booking.' using errcode = '42501';
    end if;

    if leg_id is null then
      insert into public."Job_Routing" (
        "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode",
        "JobRoute_OriginUNLocode", "JobRoute_OriginNameSnapshot", "JobRoute_OriginAddressSnapshot",
        "JobRoute_DestinationUNLocode", "JobRoute_DestinationNameSnapshot", "JobRoute_DestinationAddressSnapshot",
        "JobRoute_PlannedPickupAt", "JobRoute_PlannedDepartureAt", "JobRoute_PlannedArrivalAt", "JobRoute_PlannedDeliveryAt",
        "JobRoute_Carrier", "JobRoute_CarrierBookingReference", "JobRoute_MasterTransportReference",
        "JobRoute_HouseTransportReference", "JobRoute_ServiceLevel", "JobRoute_TransportMeansName",
        "JobRoute_Vessel", "JobRoute_VoyageNumber", "JobRoute_FlightNumber", "JobRoute_VehicleRegistration",
        "JobRoute_TrailerNumber", "JobRoute_RailService", "JobRoute_IsMainCarriage", "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
      ) values (
        requested_job_id, leg_order, coalesce(left(nullif(btrim(leg->>'status'), ''), 40), 'planned'), mode_value,
        upper(left(nullif(btrim(leg->>'originUnlocode'), ''), 10)), left(nullif(btrim(leg->>'origin'), ''), 180), nullif(btrim(leg->>'originAddress'), ''),
        upper(left(nullif(btrim(leg->>'destinationUnlocode'), ''), 10)), left(nullif(btrim(leg->>'destination'), ''), 180), nullif(btrim(leg->>'destinationAddress'), ''),
        nullif(leg->>'plannedPickupAt', '')::timestamptz, nullif(leg->>'plannedDepartureAt', '')::timestamptz,
        nullif(leg->>'plannedArrivalAt', '')::timestamptz, nullif(leg->>'plannedDeliveryAt', '')::timestamptz,
        nullif(leg->>'carrierId', '')::uuid, left(nullif(btrim(leg->>'carrierBookingReference'), ''), 160),
        left(nullif(btrim(leg->>'masterTransportReference'), ''), 160), left(nullif(btrim(leg->>'houseTransportReference'), ''), 160),
        left(nullif(btrim(leg->>'serviceLevel'), ''), 80), left(nullif(btrim(leg->>'transportMeansName'), ''), 160),
        left(nullif(btrim(leg->>'vessel'), ''), 50), left(nullif(btrim(leg->>'voyageNumber'), ''), 50),
        left(nullif(btrim(leg->>'flightNumber'), ''), 40), left(nullif(btrim(leg->>'vehicleRegistration'), ''), 80),
        left(nullif(btrim(leg->>'trailerNumber'), ''), 80), left(nullif(btrim(leg->>'railService'), ''), 80),
        coalesce((leg->>'isMainCarriage')::boolean, leg_order = 1), route_json, app_user."User_ID"
      );
    else
      update public."Job_Routing" route set
        "JobRoute_OrderNo" = leg_order,
        "JobRoute_Status" = coalesce(left(nullif(btrim(leg->>'status'), ''), 40), route."JobRoute_Status"),
        "JobRoute_ModeCode" = mode_value,
        "JobRoute_OriginUNLocode" = upper(left(nullif(btrim(leg->>'originUnlocode'), ''), 10)),
        "JobRoute_OriginNameSnapshot" = left(nullif(btrim(leg->>'origin'), ''), 180),
        "JobRoute_OriginAddressSnapshot" = nullif(btrim(leg->>'originAddress'), ''),
        "JobRoute_DestinationUNLocode" = upper(left(nullif(btrim(leg->>'destinationUnlocode'), ''), 10)),
        "JobRoute_DestinationNameSnapshot" = left(nullif(btrim(leg->>'destination'), ''), 180),
        "JobRoute_DestinationAddressSnapshot" = nullif(btrim(leg->>'destinationAddress'), ''),
        "JobRoute_PlannedPickupAt" = nullif(leg->>'plannedPickupAt', '')::timestamptz,
        "JobRoute_PlannedDepartureAt" = nullif(leg->>'plannedDepartureAt', '')::timestamptz,
        "JobRoute_PlannedArrivalAt" = nullif(leg->>'plannedArrivalAt', '')::timestamptz,
        "JobRoute_PlannedDeliveryAt" = nullif(leg->>'plannedDeliveryAt', '')::timestamptz,
        "JobRoute_Carrier" = nullif(leg->>'carrierId', '')::uuid,
        "JobRoute_CarrierBookingReference" = left(nullif(btrim(leg->>'carrierBookingReference'), ''), 160),
        "JobRoute_MasterTransportReference" = left(nullif(btrim(leg->>'masterTransportReference'), ''), 160),
        "JobRoute_HouseTransportReference" = left(nullif(btrim(leg->>'houseTransportReference'), ''), 160),
        "JobRoute_ServiceLevel" = left(nullif(btrim(leg->>'serviceLevel'), ''), 80),
        "JobRoute_TransportMeansName" = left(nullif(btrim(leg->>'transportMeansName'), ''), 160),
        "JobRoute_Vessel" = left(nullif(btrim(leg->>'vessel'), ''), 50),
        "JobRoute_VoyageNumber" = left(nullif(btrim(leg->>'voyageNumber'), ''), 50),
        "JobRoute_FlightNumber" = left(nullif(btrim(leg->>'flightNumber'), ''), 40),
        "JobRoute_VehicleRegistration" = left(nullif(btrim(leg->>'vehicleRegistration'), ''), 80),
        "JobRoute_TrailerNumber" = left(nullif(btrim(leg->>'trailerNumber'), ''), 80),
        "JobRoute_RailService" = left(nullif(btrim(leg->>'railService'), ''), 80),
        "JobRoute_IsMainCarriage" = coalesce((leg->>'isMainCarriage')::boolean, leg_order = 1),
        "JobRoute_RouteJSON" = route."JobRoute_RouteJSON" || route_json,
        "JobRoute_UpdatedAt" = now(),
        "JobRoute_UpdatedBy" = app_user."User_ID"
      where route."JobRoute_ID" = leg_id and route."Job_ID" = requested_job_id;
    end if;
  end loop;
end;
$$;

create or replace function booking_api.save_booking_cargo_measurements(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  line jsonb;
  line_number integer := 0;
begin
  if not (payload ? 'cargo') then return; end if;
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode = '42501';
  end if;
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = requested_job_id
    and office."Company_ID" = app_user."Company_ID"
    and not job."Job_IsDeleted";
  if not found then
    raise exception 'That booking is outside this workspace.' using errcode = '42501';
  end if;

  for line in select value from jsonb_array_elements(coalesce(payload->'cargo', '[]'::jsonb)) loop
    if nullif(btrim(line->>'description'), '') is not null then
      line_number := line_number + 1;
      update public."Job_Cargo" cargo set
        "JobCargo_Length" = nullif(line->>'length', '')::numeric,
        "JobCargo_Width" = nullif(line->>'width', '')::numeric,
        "JobCargo_Height" = nullif(line->>'height', '')::numeric,
        "JobCargo_LengthUnit" = coalesce(left(nullif(lower(btrim(line->>'lengthUnit')), ''), 20), 'cm'),
        "JobCargo_UpdatedAt" = now(),
        "JobCargo_UpdatedBy" = app_user."User_ID"
      where cargo."JobCargo_JobID" = requested_job_id
        and cargo."JobCargo_LineNo" = line_number
        and not cargo."JobCargo_IsDeleted";
    end if;
  end loop;
end;
$$;

create or replace function booking_api.workspace_extended(
  caller_auth_user_id uuid,
  requested_reference text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  booking_value jsonb;
  details jsonb;
  job_id uuid;
  is_favourite boolean;
  owner_name text;
  cargo_value jsonb;
begin
  result := booking_api.workspace(caller_auth_user_id, requested_reference);
  job_id := nullif(result->'booking'->>'jobId', '')::uuid;
  select
    coalesce(job."Job_EditableDetailsJSON", '{}'::jsonb),
    coalesce(nullif(btrim(concat_ws(' ', owner_user."User_Firstname", owner_user."User_Lastname")), ''), owner_user."User_Email")
  into details, owner_name
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  join public."cmp_Users" app_user on app_user."Company_ID" = office."Company_ID"
    and app_user."Auth_User_ID" = caller_auth_user_id
    and app_user."User_AccessStatus" = 'active'
  left join public."cmp_Users" owner_user on owner_user."User_ID" = job."Job_CreatedBy"
  where job."Job_ID" = job_id and not job."Job_IsDeleted";
  if details is null then details := '{}'::jsonb; end if;

  details := details || jsonb_strip_nulls(jsonb_build_object(
    'ownerName', coalesce(nullif(details->>'ownerName', ''), owner_name),
    'quoteType', coalesce(nullif(details->>'quoteType', ''), initcap(replace(result->'booking'->>'direction', '_', ' ')))
  ));

  select exists(
    select 1 from public."App_UserJobStars" star
    where star."User_ID" = caller_auth_user_id and star."Job_ID" = job_id
  ) into is_favourite;

  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'length', cargo."JobCargo_Length",
      'width', cargo."JobCargo_Width",
      'height', cargo."JobCargo_Height",
      'lengthUnit', cargo."JobCargo_LengthUnit"
    )) order by cargo."JobCargo_LineNo" nulls last
  ), result->'cargo')
  into cargo_value
  from jsonb_array_elements(coalesce(result->'cargo', '[]'::jsonb)) as item(value)
  left join public."Job_Cargo" cargo
    on cargo."JobCargo_ID" = nullif(item.value->>'id', '')::uuid
    and cargo."JobCargo_JobID" = job_id
    and not cargo."JobCargo_IsDeleted";

  booking_value := coalesce(result->'booking', '{}'::jsonb) || jsonb_build_object(
    'jobReference', coalesce(nullif(details->>'jobReference', ''), result->'booking'->>'jobReference'),
    'editableDetails', details || jsonb_build_object('isFavourite', coalesce(is_favourite, false))
  );
  result := jsonb_set(result, '{booking}', booking_value, true);
  return jsonb_set(result, '{cargo}', coalesce(cargo_value, '[]'::jsonb), true);
end;
$$;

create or replace function public.booking_workflow_save(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform booking_api.save_booking(caller_auth_user_id, requested_job_id, payload);
  perform booking_api.save_booking_route_legs(caller_auth_user_id, requested_job_id, payload);
  perform booking_api.save_booking_cargo_measurements(caller_auth_user_id, requested_job_id, payload);
  perform booking_api.save_booking_detail_fields(caller_auth_user_id, requested_job_id, payload);
  return booking_api.workspace_extended(caller_auth_user_id, (
    select "Job_BookingReference" from public."Job_Header" where "Job_ID" = requested_job_id
  ));
end;
$$;

-- Quote validity is a commercial control, not an operational schedule. The
-- accepted quote's dedicated ETD and ETA facts become the initial main-carriage
-- schedule. A booking operator can change those dates afterwards without this
-- trigger overwriting their work.
create or replace function booking_api.apply_accepted_quote_schedule_to_new_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_snapshot jsonb;
  schedule_facts jsonb;
  departure_text text;
  arrival_text text;
  valid_from_text text;
  deadline_text text;
  departure_date date;
  arrival_date date;
  legacy_departure date;
  legacy_arrival date;
begin
  if not coalesce(new."JobRoute_IsMainCarriage", false) then return new; end if;
  if exists (
    select 1 from public."Job_Routing" route
    where route."Job_ID" = new."Job_ID" and route."JobRoute_IsMainCarriage"
  ) then return new; end if;

  select job."Job_SourceSnapshotJSON"
  into source_snapshot
  from public."Job_Header" job
  where job."Job_ID" = new."Job_ID"
    and job."Job_SourceQuoteID" is not null
    and not job."Job_IsDeleted";
  if not found then return new; end if;

  schedule_facts := coalesce(
    source_snapshot #> '{acceptedSnapshot,quote,shipmentFacts}',
    source_snapshot #> '{quote,shipmentFacts}',
    '{}'::jsonb
  );
  departure_text := nullif(btrim(schedule_facts->>'estimatedDeparture'), '');
  arrival_text := nullif(btrim(schedule_facts->>'estimatedArrival'), '');
  valid_from_text := nullif(btrim(coalesce(
    source_snapshot #>> '{acceptedSnapshot,quote,validFrom}',
    source_snapshot #>> '{quote,validFrom}'
  )), '');
  deadline_text := nullif(btrim(coalesce(
    source_snapshot #>> '{acceptedSnapshot,quote,deadline}',
    source_snapshot #>> '{quote,deadline}'
  )), '');
  if departure_text ~ '^\d{4}-\d{2}-\d{2}$' then departure_date := departure_text::date; end if;
  if arrival_text ~ '^\d{4}-\d{2}-\d{2}$' then arrival_date := arrival_text::date; end if;
  if valid_from_text ~ '^\d{4}-\d{2}-\d{2}$' then legacy_departure := valid_from_text::date; end if;
  if deadline_text ~ '^\d{4}-\d{2}-\d{2}$' then legacy_arrival := deadline_text::date; end if;

  if new."JobRoute_PlannedDepartureAt" is null or new."JobRoute_PlannedDepartureAt"::date = legacy_departure then
    new."JobRoute_PlannedDepartureAt" := departure_date;
  end if;
  if new."JobRoute_PlannedArrivalAt" is null or new."JobRoute_PlannedArrivalAt"::date = legacy_arrival then
    new."JobRoute_PlannedArrivalAt" := arrival_date;
  end if;
  update public."Job_Header" set
    "Job_ReadyDate" = case
      when "Job_ReadyDate" is null or "Job_ReadyDate" = legacy_departure then departure_date
      else "Job_ReadyDate"
    end,
    "Job_RequiredDeliveryDate" = case
      when "Job_RequiredDeliveryDate" is null or "Job_RequiredDeliveryDate" = legacy_arrival then arrival_date
      else "Job_RequiredDeliveryDate"
    end,
    "Job_UpdatedAt" = now()
  where "Job_ID" = new."Job_ID"
    and (
      "Job_ReadyDate" is null or "Job_ReadyDate" = legacy_departure
      or "Job_RequiredDeliveryDate" is null or "Job_RequiredDeliveryDate" = legacy_arrival
    );
  return new;
end;
$$;

drop trigger if exists "TR_Job_Routing_accepted_quote_schedule" on public."Job_Routing";
create trigger "TR_Job_Routing_accepted_quote_schedule"
before insert on public."Job_Routing"
for each row execute function booking_api.apply_accepted_quote_schedule_to_new_route();

-- Correct quote-created bookings that still carry the legacy validity mapping,
-- while preserving dates that an operator has subsequently changed.
with quote_booking_schedule as (
  select
    job."Job_ID" as job_id,
    case when facts.estimated_departure ~ '^\d{4}-\d{2}-\d{2}$' then facts.estimated_departure::date end as estimated_departure,
    case when facts.estimated_arrival ~ '^\d{4}-\d{2}-\d{2}$' then facts.estimated_arrival::date end as estimated_arrival,
    case when facts.valid_from ~ '^\d{4}-\d{2}-\d{2}$' then facts.valid_from::date end as legacy_departure,
    case when facts.deadline ~ '^\d{4}-\d{2}-\d{2}$' then facts.deadline::date end as legacy_arrival
  from public."Job_Header" job
  cross join lateral (
    select
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,shipmentFacts,estimatedDeparture}', job."Job_SourceSnapshotJSON"#>>'{quote,shipmentFacts,estimatedDeparture}', '') as estimated_departure,
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,shipmentFacts,estimatedArrival}', job."Job_SourceSnapshotJSON"#>>'{quote,shipmentFacts,estimatedArrival}', '') as estimated_arrival,
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,validFrom}', job."Job_SourceSnapshotJSON"#>>'{quote,validFrom}', '') as valid_from,
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,deadline}', job."Job_SourceSnapshotJSON"#>>'{quote,deadline}', '') as deadline
  ) facts
  where job."Job_SourceQuoteID" is not null and not job."Job_IsDeleted"
)
update public."Job_Header" job set
  "Job_ReadyDate" = case
    when job."Job_ReadyDate" is null or job."Job_ReadyDate" = schedule.legacy_departure then schedule.estimated_departure
    else job."Job_ReadyDate"
  end,
  "Job_RequiredDeliveryDate" = case
    when job."Job_RequiredDeliveryDate" is null or job."Job_RequiredDeliveryDate" = schedule.legacy_arrival then schedule.estimated_arrival
    else job."Job_RequiredDeliveryDate"
  end,
  "Job_UpdatedAt" = now()
from quote_booking_schedule schedule
where job."Job_ID" = schedule.job_id
  and (
    job."Job_ReadyDate" is null or job."Job_ReadyDate" = schedule.legacy_departure
    or job."Job_RequiredDeliveryDate" is null or job."Job_RequiredDeliveryDate" = schedule.legacy_arrival
  );

with quote_booking_schedule as (
  select
    job."Job_ID" as job_id,
    case when facts.estimated_departure ~ '^\d{4}-\d{2}-\d{2}$' then facts.estimated_departure::date end as estimated_departure,
    case when facts.estimated_arrival ~ '^\d{4}-\d{2}-\d{2}$' then facts.estimated_arrival::date end as estimated_arrival,
    case when facts.valid_from ~ '^\d{4}-\d{2}-\d{2}$' then facts.valid_from::date end as legacy_departure,
    case when facts.deadline ~ '^\d{4}-\d{2}-\d{2}$' then facts.deadline::date end as legacy_arrival
  from public."Job_Header" job
  cross join lateral (
    select
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,shipmentFacts,estimatedDeparture}', job."Job_SourceSnapshotJSON"#>>'{quote,shipmentFacts,estimatedDeparture}', '') as estimated_departure,
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,shipmentFacts,estimatedArrival}', job."Job_SourceSnapshotJSON"#>>'{quote,shipmentFacts,estimatedArrival}', '') as estimated_arrival,
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,validFrom}', job."Job_SourceSnapshotJSON"#>>'{quote,validFrom}', '') as valid_from,
      coalesce(job."Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,deadline}', job."Job_SourceSnapshotJSON"#>>'{quote,deadline}', '') as deadline
  ) facts
  where job."Job_SourceQuoteID" is not null and not job."Job_IsDeleted"
)
update public."Job_Routing" route set
  "JobRoute_PlannedDepartureAt" = case
    when route."JobRoute_PlannedDepartureAt" is null or route."JobRoute_PlannedDepartureAt"::date = schedule.legacy_departure then schedule.estimated_departure
    else route."JobRoute_PlannedDepartureAt"
  end,
  "JobRoute_PlannedArrivalAt" = case
    when route."JobRoute_PlannedArrivalAt" is null or route."JobRoute_PlannedArrivalAt"::date = schedule.legacy_arrival then schedule.estimated_arrival
    else route."JobRoute_PlannedArrivalAt"
  end,
  "JobRoute_UpdatedAt" = now()
from quote_booking_schedule schedule
where route."Job_ID" = schedule.job_id
  and route."JobRoute_IsMainCarriage"
  and (
    route."JobRoute_PlannedDepartureAt" is null or route."JobRoute_PlannedDepartureAt"::date = schedule.legacy_departure
    or route."JobRoute_PlannedArrivalAt" is null or route."JobRoute_PlannedArrivalAt"::date = schedule.legacy_arrival
  );

-- The quote register now reports operational ETD/ETA independently from the
-- quote's Valid from and Valid to fields.
create or replace view public."App_Live_Quotes" with (security_invoker = true) as
select
  quote."CusQuoteHeader_ID",
  coalesce(nullif(btrim(quote."CusQuoteHeader_CustomerReference"), ''), 'Q-' || quote."CusQuoteHeader_Number") as "Quote_Reference",
  initcap(replace(coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft'), '_', ' ')) as "Quote_Status",
  case coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft')
    when 'accepted' then 'green' when 'sent' then 'teal'
    when 'calculated' then 'blue' when 'declined' then 'red'
    when 'ghosted' then 'neutral' else 'amber' end as "Quote_Status_Tone",
  coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot", '')::varchar(100) as "Customer_Name",
  coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra", '') as "Origin",
  coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra", '') as "Destination",
  schedule.estimated_departure as "Estimated_Departure",
  schedule.estimated_arrival as "Estimated_Arrival",
  coalesce(
    case when schedule.estimated_departure is not null and schedule.estimated_arrival is not null
      then (schedule.estimated_arrival - schedule.estimated_departure)::text || ' days' end,
    nullif(btrim(concat_ws(' ', quote."CusQuoteHeader_ShipmentFactsJSON"->>'transitDays', quote."CusQuoteHeader_ShipmentFactsJSON"->>'transitUnit')), ''),
    ''
  ) as "Transport_Time",
  initcap(coalesce(quote."CusQuoteHeader_ModeCode", '')) as "Transport_Mode",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'equipment', quote."CusQuoteHeader_ShipmentTypeCode", '')::varchar as "Equipment_Load",
  coalesce(quote."CusQuoteHeader_CollectionAddress", '') as "Pickup",
  coalesce(quote."CusQuoteHeader_DeliveryAddress", '') as "Delivery",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'routingVia', '') as "Routing_Via",
  coalesce(quote."CusQuoteHeader_Incoterm", '')::varchar as "Incoterms",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'namedPlace', '') as "Incoterms_Place",
  coalesce(quote."CusQuoteHeader_ServiceLevel", '')::varchar as "Service_Level",
  coalesce(quote."CusQuoteHeader_ShipmentTypeCode", '')::varchar as "Shipment_Type",
  coalesce(quote."CusQuoteHeader_CarrierNameSnapshot", carrier."Org_Name", '')::text as "Carrier",
  coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name", '')::text as "Supplier",
  coalesce(sales_owner."User_Firstname" || ' ' || sales_owner."User_Lastname", '') as "Sales_Owner",
  coalesce(created_by."User_Firstname" || ' ' || created_by."User_Lastname", '') as "Operations_Owner",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'quoteType', 'Spot') as "Quote_Type",
  initcap(coalesce(quote."CusQuoteHeader_Direction", '')) as "Direction",
  coalesce(quote."CusQuoteHeader_CustomerReference", '')::text as "Customer_Purchase_Order",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'shipperReference', '') as "Shipper_Reference",
  to_char(quote."CusQuoteHeader_ValidTo", 'DD Mon YYYY') as "Validity",
  to_char(quote."CusQuoteHeader_Deadline", 'DD Mon · HH24:MI') as "Estimated_Quote",
  coalesce(totals.sell, 0) as "Sell_Value",
  coalesce(totals.sell - totals.cost, 0) as "Estimated_Profit",
  coalesce(totals.cost, 0) as "Estimated_Cost",
  case when coalesce(totals.sell, 0) = 0 then null
    else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end as "Estimated_Margin",
  coalesce(quote."CusQuoteHeader_CurrencyCode", '')::varchar as "Currency",
  'Draft'::text as "Document_Status",
  initcap(replace(coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft'), '_', ' ')) as "Workflow_Stage",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'priority', '') as "Priority",
  case when quote."CusQuoteHeader_ShipmentFactsJSON"->>'priority' = 'Urgent'
    then 'red' else 'neutral' end as "Priority_Tone",
  coalesce(quote."CusQuoteHeader_RateSourceLabel", initcap(quote."CusQuoteHeader_RateSourceTypeCode"), '')::text as "Quote_Source",
  quote."CusQuoteHeader_CreatedDate"::timestamptz as "Created_At",
  coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate")::timestamptz as "Updated_At"
from public."CusQuote_Header" quote
left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
left join public."Org_Master" carrier on carrier."Org_id" = quote."CusQuoteHeader_CarrierID"
left join public."cmp_Users" sales_owner on sales_owner."User_ID" = quote."CusQuoteHeader_SalesOwnerID"
left join public."cmp_Users" created_by on created_by."User_ID" = quote."CusQuoteHeader_CreatedBy"
left join lateral (
  select
    case when quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture' ~ '^\d{4}-\d{2}-\d{2}$'
      then (quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture')::date end as estimated_departure,
    case when quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival' ~ '^\d{4}-\d{2}-\d{2}$'
      then (quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival')::date end as estimated_arrival
) schedule on true
left join lateral (
  select
    coalesce(sum(line."CusQuoteLine_CostAmountLocal"), 0) as cost,
    coalesce(sum(line."CusQuoteLine_RevenueAmountLocal"), 0) as sell
  from public."CusQuote_Lines" line
  where line."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
) totals on true
where not quote."CusQuoteHeader_IsDeleted";

grant select on public."App_Live_Quotes" to authenticated;

-- Extend the existing Dexter quote read domain without duplicating its mature
-- tenant, response and booking joins.
alter function public.multideck_dexter_domain_quotes(uuid, text, integer)
  rename to multideck_dexter_domain_quotes_before_route_schedule_20260902;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'estimatedDeparture', quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture',
      'estimatedArrival', quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival'
    )) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_domain_quotes_before_route_schedule_20260902(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join public."CusQuote_Header" quote
    on quote."CusQuoteHeader_ID" = nullif(item.value->>'recordId', '')::uuid
   and not quote."CusQuoteHeader_IsDeleted";
$$;

revoke all on function public.multideck_dexter_domain_quotes_before_route_schedule_20260902(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_quotes(uuid, text, integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quotes with response evidence, operational ETD and ETA, separate commercial validity, delivery evidence, linked booking provenance, outcomes, pricing and deterministic win intelligence.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Event-driven quote lifecycle, ETD, ETA, validity, customer response, delivery mode, recipient and linked-booking changes.',
  "AIDexterWatchCapability_FieldsJSON" = '["quoteNumber","status","lifecycle","deadline","validFrom","validTo","estimatedDeparture","estimatedArrival","origin","destination","customerDecision","deliveryMode","responseControlsEnabled","recipientSource","recipientEmail","quoteDocumentId","deliveryStatus","bookingReference"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

create or replace function public._multideck_dexter_quote_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  company_id uuid;
  source_id uuid := new."CusQuoteHeader_ID";
  latest_decision text;
  booking_reference text;
  old_json jsonb;
  new_json jsonb;
begin
  company_id := new."Org_ID";
  if company_id is null then
    select office."Company_ID" into company_id
    from public."cmp_Offices" office
    where office."Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  end if;
  select response.decision_code into latest_decision
  from quote_api.customer_responses response
  where response.quote_id = source_id
  order by response.created_at desc limit 1;
  select job."Job_BookingReference" into booking_reference
  from public."Job_Header" job
  where job."Job_SourceQuoteID" = source_id and not job."Job_IsDeleted"
  order by job."Job_CreatedDate" asc limit 1;

  old_json := case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
    'quoteNumber', old."CusQuoteHeader_CustomerReference",
    'status', case when old."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won' when old."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'Lost' else 'Open' end,
    'lifecycle', old."CusQuoteHeader_LifecycleCode",
    'deadline', old."CusQuoteHeader_Deadline",
    'validFrom', old."CusQuoteHeader_ValidFrom",
    'validTo', old."CusQuoteHeader_ValidTo",
    'estimatedDeparture', old."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture',
    'estimatedArrival', old."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival',
    'origin', coalesce(old."CusQuoteHeader_LoadingPoint", old."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(old."CusQuoteHeader_DischargePoint", old."CusQuoteHeader_DestinationExtra"),
    'customerDecision', case when old."CusQuoteHeader_LifecycleCode" is distinct from new."CusQuoteHeader_LifecycleCode" then null else latest_decision end,
    'bookingReference', case when old."CusQuoteHeader_LifecycleCode" = 'accepted' then booking_reference end
  ) end;
  new_json := jsonb_build_object(
    'quoteNumber', new."CusQuoteHeader_CustomerReference",
    'status', case when new."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won' when new."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'Lost' else 'Open' end,
    'lifecycle', new."CusQuoteHeader_LifecycleCode",
    'deadline', new."CusQuoteHeader_Deadline",
    'validFrom', new."CusQuoteHeader_ValidFrom",
    'validTo', new."CusQuoteHeader_ValidTo",
    'estimatedDeparture', new."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture',
    'estimatedArrival', new."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival',
    'origin', coalesce(new."CusQuoteHeader_LoadingPoint", new."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(new."CusQuoteHeader_DischargePoint", new."CusQuoteHeader_DestinationExtra"),
    'customerDecision', latest_decision,
    'bookingReference', booking_reference
  );

  if company_id is not null and old_json is distinct from new_json and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = company_id
      and watch."AIDexterWatch_CapabilityCode" = 'quotes'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = source_id)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (company_id, 'quotes', 'CusQuote_Header', source_id, old_json, new_json);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_dexter_watch" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_dexter_watch"
after insert or update on public."CusQuote_Header"
for each row execute function public._multideck_dexter_quote_watch_source_change();

revoke all on function booking_api.apply_accepted_quote_schedule_to_new_route() from public, anon, authenticated;
revoke all on function public._multideck_dexter_quote_watch_source_change() from public, anon, authenticated;

-- Dexter boundary: ordered route-leg edits need a purpose-built approval view
-- before they can be made safe as a chat write, and per-dimension watch signals
-- would be noisy while operators are building a cargo line. Keep both actions
-- explicitly unsupported for now; Dexter can still read the established booking
-- summary and must direct operators to Booking Details for these editing tasks.
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Canonical freight bookings, including accepted-quote provenance and the main route and cargo summary. Ordered routing-step and item-dimension editing is not supported in Dexter; direct the operator to Booking Details.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'bookings';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Freight booking summary status, route, delivery, ownership, risk and job-related Customs handoff changes. Ordered route-leg and cargo-dimension watches are not supported.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'bookings';

revoke all on function booking_api.save_booking_route_legs(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function booking_api.save_booking_cargo_measurements(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function booking_api.workspace_extended(uuid, text) from public, anon, authenticated;
revoke all on function public.booking_workflow_save(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function booking_api.save_booking_route_legs(uuid, uuid, jsonb) to service_role;
grant execute on function booking_api.save_booking_cargo_measurements(uuid, uuid, jsonb) to service_role;
grant execute on function booking_api.workspace_extended(uuid, text) to service_role;
grant execute on function public.booking_workflow_save(uuid, uuid, jsonb) to service_role;

commit;
