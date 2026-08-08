-- Give Dexter an explicit freight-bookings source. Warehouse stays a separate
-- domain for dock orders, inventory and warehouse exceptions.

begin;

create or replace function public.multideck_dexter_domain_bookings(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_updated desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', job."Job_ID",
        'bookingReference', 'MD-' || job."Job_Number",
        'jobReference', 'JOB-' || job."Job_Number",
        'customerName', coalesce(customer."Org_Name", 'Unassigned customer'),
        'customerReference', coalesce(customer."Org_AccCode", ''),
        'status', case
          when job."Job_ClosedDate" is not null then 'Closed'
          when coalesce(job."Job_TrackingRiskScore", 0) >= 0.80 then 'Exception'
          when coalesce(job."Job_TrackingRiskScore", 0) >= 0.50 then 'Delayed'
          else 'On track'
        end,
        'jobStatus', job."Job_Status",
        'trackingStatus', job."Job_TrackingStatus",
        'riskScore', job."Job_TrackingRiskScore",
        'mode', upper(coalesce(job."Job_TransportModeSummary", 'road')),
        'direction', initcap(coalesce(job."Job_Direction", 'Domestic')),
        'origin', coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode", ''),
        'destination', coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode", ''),
        'route', concat_ws(
          ' → ',
          coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode"),
          coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode")
        ),
        'carrier', coalesce(carrier."Org_Name", 'Carrier pending'),
        'equipment', coalesce(cargo.description, 'Shipment'),
        'currentLocation', coalesce(job."Job_CurrentLocationNameSnapshot", 'Planning'),
        'requiredDeliveryDate', job."Job_RequiredDeliveryDate",
        'predictedDeliveryAt', job."Job_PredictedDeliveryAt",
        'departureDate', coalesce(route."JobRoute_EstimatedDepartureAt", route."JobRoute_PlannedDepartureAt")::date,
        'arrivalDate', coalesce(
          route."JobRoute_EstimatedArrivalAt",
          route."JobRoute_PlannedArrivalAt",
          job."Job_PredictedDeliveryAt"
        )::date,
        'updatedAt', job."Job_UpdatedAt",
        'searchEvidence', evidence.value - 'matched'
      ) as row_data,
      coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
      job."Job_UpdatedAt" as sort_updated
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
     and office."Company_ID" = p_company_id
    left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
    left join public."Org_Master" carrier on carrier."Org_id" = job."Job_Carrier"
    left join lateral (
      select routing.*
      from public."Job_Routing" routing
      where routing."Job_ID" = job."Job_ID"
      order by routing."JobRoute_OrderNo" nulls last
      limit 1
    ) route on true
    left join lateral (
      select max(cargo_row."JobCargo_Description") as description
      from public."Job_Cargo" cargo_row
      where cargo_row."JobCargo_JobID" = job."Job_ID"
        and not coalesce(cargo_row."JobCargo_IsDeleted", false)
    ) cargo on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'bookingReference', 'MD-' || job."Job_Number",
        'jobReference', 'JOB-' || job."Job_Number",
        'jobNumber', job."Job_Number",
        'customerName', customer."Org_Name",
        'customerReference', customer."Org_AccCode",
        'jobStatus', job."Job_Status",
        'trackingStatus', job."Job_TrackingStatus",
        'mode', job."Job_TransportModeSummary",
        'direction', job."Job_Direction",
        'origin', coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode"),
        'destination', coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode"),
        'carrier', carrier."Org_Name",
        'currentLocation', job."Job_CurrentLocationNameSnapshot"
      ),
      array['bookingReference', 'jobReference', 'jobNumber', 'customerReference']::text[]
    ) evidence(value)
    where not coalesce(job."Job_IsDeleted", false)
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, job."Job_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) bookings;
$$;

revoke all on function public.multideck_dexter_domain_bookings(uuid, text, integer)
from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code",
  "AIDexterDomain_Name",
  "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt"
) values (
  'bookings',
  'Freight bookings',
  'Freight jobs and bookings, including customer, route, mode, carrier, dates, tracking status and operational risk. This is separate from warehouse orders and dock activity.',
  'multideck_dexter_domain_bookings',
  15,
  true,
  now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code",
  "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder"
) values (
  'bookings',
  'Freight bookings',
  'Freight booking status, tracking, route, delivery, ownership and risk changes.',
  '["status","trackingStatus","riskScore","mode","direction","origin","destination","currentLocation","requiredDeliveryDate","predictedDeliveryAt","customerId","carrierId"]'::jsonb,
  15
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now();

create or replace function public._multideck_dexter_booking_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  select office."Company_ID"
  into v_company_id
  from public."cmp_Offices" office
  where office."Office_ID" = coalesce(new."Job_OrgOfficeID", new."Job_OfficeID");

  if v_company_id is null then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'status', old."Job_Status",
      'trackingStatus', old."Job_TrackingStatus",
      'riskScore', old."Job_TrackingRiskScore",
      'mode', old."Job_TransportModeSummary",
      'direction', old."Job_Direction",
      'origin', coalesce(old."Job_OriginNameSnapshot", old."Job_OriginUNLocode"),
      'destination', coalesce(old."Job_DestinationNameSnapshot", old."Job_DestinationUNLocode"),
      'currentLocation', old."Job_CurrentLocationNameSnapshot",
      'requiredDeliveryDate', old."Job_RequiredDeliveryDate",
      'predictedDeliveryAt', old."Job_PredictedDeliveryAt",
      'customerId', old."Job_Customer",
      'carrierId', old."Job_Carrier"
    );
  end if;

  v_new := jsonb_build_object(
    'bookingReference', 'MD-' || new."Job_Number",
    'status', new."Job_Status",
    'trackingStatus', new."Job_TrackingStatus",
    'riskScore', new."Job_TrackingRiskScore",
    'mode', new."Job_TransportModeSummary",
    'direction', new."Job_Direction",
    'origin', coalesce(new."Job_OriginNameSnapshot", new."Job_OriginUNLocode"),
    'destination', coalesce(new."Job_DestinationNameSnapshot", new."Job_DestinationUNLocode"),
    'currentLocation', new."Job_CurrentLocationNameSnapshot",
    'requiredDeliveryDate', new."Job_RequiredDeliveryDate",
    'predictedDeliveryAt', new."Job_PredictedDeliveryAt",
    'customerId', new."Job_Customer",
    'carrierId', new."Job_Carrier"
  );

  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID",
    "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON",
    "AIDexterWatchSignal_NewJSON"
  ) values (
    v_company_id,
    'bookings',
    tg_table_name,
    new."Job_ID",
    v_old,
    v_new
  );

  return new;
end;
$$;

revoke all on function public._multideck_dexter_booking_watch_source_change()
from public, anon, authenticated;

drop trigger if exists "TR_Job_Header_dexter_booking_watch" on public."Job_Header";
create trigger "TR_Job_Header_dexter_booking_watch"
after insert or update of
  "Job_Status",
  "Job_TrackingStatus",
  "Job_TrackingRiskScore",
  "Job_TransportModeSummary",
  "Job_Direction",
  "Job_OriginUNLocode",
  "Job_OriginNameSnapshot",
  "Job_DestinationUNLocode",
  "Job_DestinationNameSnapshot",
  "Job_CurrentLocationNameSnapshot",
  "Job_RequiredDeliveryDate",
  "Job_PredictedDeliveryAt",
  "Job_Customer",
  "Job_Carrier"
on public."Job_Header"
for each row execute function public._multideck_dexter_booking_watch_source_change();

commit;
