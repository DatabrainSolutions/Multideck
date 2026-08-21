-- Persist each operator's starred jobs. Stars are a personal workspace
-- preference, not shared operational state on the job itself.

begin;

create table if not exists public."App_UserJobStars" (
  "User_ID" uuid not null,
  "Job_ID" uuid not null references public."Job_Header"("Job_ID") on delete cascade,
  "Created_At" timestamptz not null default now(),
  primary key ("User_ID", "Job_ID")
);

alter table public."App_UserJobStars" enable row level security;
revoke all on public."App_UserJobStars" from public, anon;
grant select, insert, delete on public."App_UserJobStars" to authenticated;

drop policy if exists "Operators can read their own job stars" on public."App_UserJobStars";
create policy "Operators can read their own job stars"
on public."App_UserJobStars" for select to authenticated
using ("User_ID" = auth.uid());

drop policy if exists "Operators can add their own job stars" on public."App_UserJobStars";
create policy "Operators can add their own job stars"
on public."App_UserJobStars" for insert to authenticated
with check ("User_ID" = auth.uid());

drop policy if exists "Operators can remove their own job stars" on public."App_UserJobStars";
create policy "Operators can remove their own job stars"
on public."App_UserJobStars" for delete to authenticated
using ("User_ID" = auth.uid());

create or replace function public.multideck_set_job_starred(
  p_booking_reference text,
  p_starred boolean
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_job_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select job."Job_ID" into v_job_id
  from public."Job_Header" job
  where not coalesce(job."Job_IsDeleted", false)
    and coalesce(job."Job_BookingReference", 'MD-' || job."Job_Number") = btrim(p_booking_reference)
  limit 1;

  if v_job_id is null then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;

  if coalesce(p_starred, false) then
    insert into public."App_UserJobStars" ("User_ID", "Job_ID")
    values (auth.uid(), v_job_id)
    on conflict ("User_ID", "Job_ID") do nothing;
  else
    delete from public."App_UserJobStars"
    where "User_ID" = auth.uid() and "Job_ID" = v_job_id;
  end if;

  return coalesce(p_starred, false);
end;
$$;

revoke all on function public.multideck_set_job_starred(text, boolean) from public, anon;
grant execute on function public.multideck_set_job_starred(text, boolean) to authenticated, service_role;

create or replace view public."App_Live_Bookings" with (security_invoker = true) as
select
  j."Job_ID",
  coalesce(j."Job_BookingReference", 'MD-' || j."Job_Number")::text as "Booking_Reference",
  coalesce(c."Org_Name", 'Unassigned customer') as "Customer_Name",
  concat_ws(' → ', coalesce(j."Job_OriginNameSnapshot", j."Job_OriginUNLocode"), coalesce(j."Job_DestinationNameSnapshot", j."Job_DestinationUNLocode")) as "Route",
  coalesce(carrier."Org_Name", 'Carrier pending') as "Carrier",
  coalesce(cargo.description, 'Shipment details needed') as "Equipment",
  upper(coalesce(j."Job_TransportModeSummary", 'Mode needed')) as "Mode",
  case when coalesce(j."Job_Direction", 'unknown') = 'unknown' then 'Direction needed' else initcap(replace(j."Job_Direction", '_', ' ')) end as "Direction",
  coalesce(cargo.description, 'Shipment details needed') as "Shipment_Type",
  ''::text as "Value_Display",
  coalesce(to_char(j."Job_PredictedDeliveryAt", 'DD Mon · HH24:MI'), to_char(j."Job_RequiredDeliveryDate", 'DD Mon')) as "Eta_Display",
  coalesce(j."Job_CurrentLocationNameSnapshot", 'Planning') as "Time_Display",
  case when j."Job_Status" = 'draft' then 'Draft' when coalesce(j."Job_TrackingRiskScore", 0) >= 0.80 then 'Exception' when coalesce(j."Job_TrackingRiskScore", 0) >= 0.50 then 'Delayed' else 'On track' end as "Status",
  case when j."Job_ClosedDate" is not null then 100 when j."Job_TrackingStatus" = 'in_transit' then 62 when j."Job_TrackingStatus" = 'delayed' then 48 when j."Job_Status" = 'draft' then 8 else 24 end as "Progress",
  'OP'::text as "Owner_Code",
  case when coalesce(j."Job_TrackingRiskScore", 0) >= 0.80 then 'red' when coalesce(j."Job_TrackingRiskScore", 0) >= 0.50 then 'amber' when j."Job_Status" = 'draft' then 'blue' else 'green' end as "Tone",
  ''::text as "Invoice_Reference", 'JOB-' || j."Job_Number" as "Job_Reference",
  coalesce(c."Org_AccCode", '') as "Customer_Reference", ''::text as "Supplier_Reference",
  coalesce(j."Job_OriginNameSnapshot", j."Job_OriginUNLocode", '') as "Origin",
  coalesce(j."Job_DestinationNameSnapshot", j."Job_DestinationUNLocode", '') as "Destination",
  coalesce(r."JobRoute_TransportMeansName", r."JobRoute_Vessel", '') as "Vessel",
  coalesce(r."JobRoute_EstimatedDepartureAt", r."JobRoute_PlannedDepartureAt")::date as "Departure_Date",
  coalesce(r."JobRoute_EstimatedArrivalAt", r."JobRoute_PlannedArrivalAt", j."Job_PredictedDeliveryAt")::date as "Arrival_Date",
  coalesce(r."JobRoute_VehicleRegistration", '') as "Vin",
  (star."Job_ID" is not null) as "Is_Favourite",
  jsonb_build_array(
    jsonb_build_object('label', 'Tracking', 'value', coalesce(j."Job_TrackingStatus", 'Planning')),
    jsonb_build_object('label', 'Source', 'value', case when j."Job_SourceQuoteID" is null then 'Direct booking' else 'Accepted quote' end)
  ) as "Custom_Fields",
  coalesce(j."Job_UpdatedAt", j."Job_CreatedDate"::timestamptz) as "Updated_At",
  coalesce(r."JobRoute_EstimatedDepartureAt", r."JobRoute_PlannedDepartureAt") as "Departure_At",
  coalesce(r."JobRoute_EstimatedArrivalAt", r."JobRoute_PlannedArrivalAt", j."Job_PredictedDeliveryAt") as "Arrival_At"
from public."Job_Header" j
left join public."Org_Master" c on c."Org_id" = j."Job_Customer"
left join public."Org_Master" carrier on carrier."Org_id" = j."Job_Carrier"
left join public."App_UserJobStars" star on star."Job_ID" = j."Job_ID" and star."User_ID" = auth.uid()
left join lateral (select rr.* from public."Job_Routing" rr where rr."Job_ID" = j."Job_ID" order by rr."JobRoute_OrderNo" nulls last limit 1) r on true
left join lateral (select max(cg."JobCargo_Description") as description from public."Job_Cargo" cg where cg."JobCargo_JobID" = j."Job_ID" and not coalesce(cg."JobCargo_IsDeleted", false)) cargo on true
where not coalesce(j."Job_IsDeleted", false);

comment on function public.multideck_set_job_starred(text, boolean)
is 'Persists the signed-in operator personal star for one exact canonical job.';

-- Dexter exception: starring is a private presentation preference, not an
-- operational job mutation or event that Watching for you should act on.

commit;
