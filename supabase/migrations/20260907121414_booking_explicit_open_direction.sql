begin;
set local lock_timeout='5s';

-- One canonical creation implementation. Existing three-argument callers keep
-- their behaviour; new callers can supply direction before reserving a number.
create function booking_api.open_booking(
  caller_auth_user_id uuid, requested_idempotency_key uuid,
  requested_sequence_key text, requested_direction text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare app_user record;office_id uuid;booking_reference text;job_id uuid;existing_job record;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then
    raise exception 'Booking creation is not authorised.' using errcode='42501';end if;
  if requested_idempotency_key is null then raise exception 'A booking request key is required.' using errcode='22023';end if;
  if requested_direction is not null and requested_direction not in ('import','export','domestic','cross_trade') then
    raise exception 'Choose a valid Booking direction.' using errcode='22023';end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select job.* into existing_job from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_CreatedBy"=app_user."User_ID" and job."Job_CreateIdempotencyKey"=requested_idempotency_key
      and office."Company_ID"=app_user."Company_ID" and not job."Job_IsDeleted" limit 1;
  if found then return jsonb_build_object('jobId',existing_job."Job_ID",'bookingReference',existing_job."Job_BookingReference",'reused',true);end if;
  select office."Office_ID" into office_id from public."cmp_Offices" office
    where office."Company_ID"=app_user."Company_ID" and office."Office_IsActive" order by office."Office_ID" limit 1;
  if office_id is null then raise exception 'No active office is configured for this workspace.' using errcode='22023';end if;
  booking_reference:=booking_api.allocate_reference(app_user."Company_ID",requested_sequence_key,requested_direction);
  insert into public."Job_Header" (
    "Job_Period","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_OrgOfficeID","Job_Status","Job_Direction",
    "Job_TrackingStatus","Job_CurrentLocationNameSnapshot","Job_BookingReference","Job_CreateIdempotencyKey","Job_UpdatedBy"
  ) values (
    to_char(current_date,'YYYYMM'),app_user."User_ID",null,office_id,office_id,'draft',coalesce(requested_direction,'unknown'),
    'planning','Planning',booking_reference,requested_idempotency_key,app_user."User_ID"
  ) returning "Job_ID" into job_id;
  insert into booking_api.events(company_id,job_id,event_type,summary,actor_user_id)
    values(app_user."Company_ID",job_id,'created','Draft booking created.',app_user."User_ID");
  return jsonb_build_object('jobId',job_id,'bookingReference',booking_reference,'reused',false);
exception when unique_violation then
  select job.* into existing_job from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_CreatedBy"=app_user."User_ID" and job."Job_CreateIdempotencyKey"=requested_idempotency_key
      and office."Company_ID"=app_user."Company_ID" and not job."Job_IsDeleted" limit 1;
  if found then return jsonb_build_object('jobId',existing_job."Job_ID",'bookingReference',existing_job."Job_BookingReference",'reused',true);end if;
  raise;
end $$;

create or replace function booking_api.open_booking(caller_auth_user_id uuid,requested_idempotency_key uuid,requested_sequence_key text default 'default')
returns jsonb language sql security definer set search_path='' as $$
  select booking_api.open_booking(caller_auth_user_id,requested_idempotency_key,requested_sequence_key,null);
$$;
create function public.booking_workflow_open(caller_auth_user_id uuid,requested_idempotency_key uuid,requested_sequence_key text,requested_direction text)
returns jsonb language sql security definer set search_path='' as $$
  select booking_api.open_booking(caller_auth_user_id,requested_idempotency_key,requested_sequence_key,requested_direction);
$$;
create function public.booking_workflow_open_road(caller_auth_user_id uuid,requested_idempotency_key uuid,requested_sequence_key text,requested_direction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare opened jsonb;
begin
  opened:=booking_api.open_booking(caller_auth_user_id,requested_idempotency_key,requested_sequence_key,requested_direction);
  if (opened->>'reused')::boolean is false then
    perform public.booking_workflow_save(caller_auth_user_id,(opened->>'jobId')::uuid,'{"mode":"road"}');end if;
  return opened;
end $$;
revoke all on function booking_api.open_booking(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.booking_workflow_open(uuid,uuid,text,text),public.booking_workflow_open_road(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.booking_workflow_open(uuid,uuid,text,text),public.booking_workflow_open_road(uuid,uuid,text,text) to service_role;
commit;
