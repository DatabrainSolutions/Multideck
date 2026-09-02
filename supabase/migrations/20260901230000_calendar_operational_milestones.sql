-- Calendar reads operational dates through a service-only, company-scoped
-- contract. This keeps Bookings permission checks in the Edge Function while
-- making the underlying service-role query impossible to widen accidentally.

create or replace function public.multideck_calendar_job_milestones(
  p_company_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  job_id uuid,
  job_number integer,
  milestone_kind text,
  milestone_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with permitted_jobs as (
    select
      job."Job_ID" as job_id,
      job."Job_Number" as job_number,
      job."Job_ReadyDate" as ready_date,
      job."Job_RequiredDeliveryDate" as required_delivery_date,
      job."Job_PredictedDeliveryAt" as predicted_delivery_at,
      route.departure_at,
      route.arrival_at
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
     and office."Company_ID" = p_company_id
    left join lateral (
      select
        coalesce(leg."JobRoute_EstimatedDepartureAt", leg."JobRoute_PlannedDepartureAt") as departure_at,
        coalesce(leg."JobRoute_EstimatedArrivalAt", leg."JobRoute_PlannedArrivalAt") as arrival_at
      from public."Job_Routing" leg
      where leg."Job_ID" = job."Job_ID"
      order by leg."JobRoute_IsMainCarriage" desc, leg."JobRoute_OrderNo" nulls last, leg."JobRoute_ID"
      limit 1
    ) route on true
    where not coalesce(job."Job_IsDeleted", false)
  ), milestones as (
    select job_id, job_number, 'collection'::text as milestone_kind,
      (ready_date + time '12:00') at time zone 'UTC' as milestone_at
    from permitted_jobs where ready_date is not null
    union all
    select job_id, job_number, 'departure', departure_at
    from permitted_jobs where departure_at is not null
    union all
    select job_id, job_number, 'arrival', coalesce(arrival_at, predicted_delivery_at)
    from permitted_jobs where coalesce(arrival_at, predicted_delivery_at) is not null
    union all
    select job_id, job_number, 'delivery',
      (required_delivery_date + time '12:00') at time zone 'UTC'
    from permitted_jobs where required_delivery_date is not null
  )
  select job_id, job_number, milestone_kind, milestone_at
  from milestones
  where milestone_at >= p_start and milestone_at < p_end
  order by milestone_at, job_number, milestone_kind;
$$;

revoke all on function public.multideck_calendar_job_milestones(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.multideck_calendar_job_milestones(uuid, timestamptz, timestamptz) to service_role;

comment on function public.multideck_calendar_job_milestones(uuid, timestamptz, timestamptz)
is 'Returns company-scoped collection, departure, arrival and delivery ribbons for the bounded Calendar range. Service-role only; the caller must also enforce Bookings.Read.';
