-- Keep booking detail edits separate from the accepted quote snapshot.
-- The quote remains an immutable source record; these are operator-owned
-- booking overrides and are returned alongside the canonical workspace.

begin;

alter table public."Job_Header"
  add column if not exists "Job_EditableDetailsJSON" jsonb not null default '{}'::jsonb;

create or replace function booking_api.save_booking_detail_fields(
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
  details jsonb;
begin
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Booking details are required.' using errcode = '22023';
  end if;
  if payload ? 'editableDetails' and jsonb_typeof(payload->'editableDetails') <> 'object' then
    raise exception 'Booking detail overrides are invalid.' using errcode = '22023';
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
  details := coalesce(job_row."Job_EditableDetailsJSON", '{}'::jsonb) || coalesce((
    select jsonb_object_agg(entry.key, entry.value)
    from jsonb_each(coalesce(payload->'editableDetails', '{}'::jsonb)) entry
    where entry.key in (
      'jobReference', 'carrierName', 'ownerName', 'invoiceReference',
      'customerReference', 'supplierReference', 'shipmentType', 'quoteType',
      'customerPO', 'shipperReference', 'consigneeReference', 'hblMode',
      'incoterms', 'routingVia', 'chargeableWeightKg', 'customsIncluded',
      'termsAndConditions', 'subjectToTerms', 'customerNotes',
      'responseDeadline', 'isFavourite', 'progress', 'lastUpdated',
      'sourceId', 'documentsStatus', 'workflowStatus', 'routeSummary',
      'customFields'
    )
      or (entry.key like 'customField:%' and length(entry.key) <= 180)
  ), '{}'::jsonb);
  update public."Job_Header"
  set "Job_EditableDetailsJSON" = details,
      "Job_UpdatedAt" = now(),
      "Job_UpdatedBy" = app_user."User_ID"
  where "Job_ID" = requested_job_id;
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
begin
  result := booking_api.workspace(caller_auth_user_id, requested_reference);
  job_id := nullif(result->'booking'->>'jobId', '')::uuid;
  select coalesce(job."Job_EditableDetailsJSON", '{}'::jsonb)
    into details
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  join public."cmp_Users" app_user on app_user."Company_ID" = office."Company_ID"
    and app_user."Auth_User_ID" = caller_auth_user_id
    and app_user."User_AccessStatus" = 'active'
  where job."Job_ID" = job_id and not job."Job_IsDeleted";
  if details is null then details := '{}'::jsonb; end if;
  select exists(
    select 1 from public."App_UserJobStars" star
    where star."User_ID" = caller_auth_user_id and star."Job_ID" = job_id
  ) into is_favourite;
  booking_value := coalesce(result->'booking', '{}'::jsonb) || jsonb_build_object(
    'jobReference', coalesce(nullif(details->>'jobReference', ''), result->'booking'->>'jobReference'),
    'editableDetails', details || jsonb_build_object('isFavourite', coalesce(is_favourite, false))
  );
  return jsonb_set(result, '{booking}', booking_value, true);
end;
$$;

create or replace function public.booking_workflow_workspace(
  caller_auth_user_id uuid,
  requested_reference text
)
returns jsonb language sql stable security definer set search_path = ''
as $$ select booking_api.workspace_extended(caller_auth_user_id, requested_reference) $$;

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
  perform booking_api.save_booking_detail_fields(caller_auth_user_id, requested_job_id, payload);
  return booking_api.workspace_extended(caller_auth_user_id, (
    select "Job_BookingReference" from public."Job_Header" where "Job_ID" = requested_job_id
  ));
end;
$$;

revoke all on function booking_api.save_booking_detail_fields(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function booking_api.workspace_extended(uuid, text) from public, anon, authenticated;
revoke all on function public.booking_workflow_workspace(uuid, text) from public, anon, authenticated;
revoke all on function public.booking_workflow_save(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function booking_api.save_booking_detail_fields(uuid, uuid, jsonb) to service_role;
grant execute on function booking_api.workspace_extended(uuid, text) to service_role;
grant execute on function public.booking_workflow_workspace(uuid, text) to service_role;
grant execute on function public.booking_workflow_save(uuid, uuid, jsonb) to service_role;

commit;
