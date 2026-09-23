-- Private staging only: explicit restoration is distinct from reopening a job.
begin;
set local lock_timeout='5s';
alter table booking_api.removed_charges drop constraint removed_charges_pkey;
alter table booking_api.removed_charges add column removal_id uuid not null default gen_random_uuid() primary key;
create index removed_charges_line_idx on booking_api.removed_charges(costing_line_id);
create table booking_api.charge_restorations (
 removal_id uuid primary key references booking_api.removed_charges(removal_id) on delete restrict,
 restored_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 restored_at timestamptz not null default clock_timestamp()
);
alter table booking_api.charge_restorations enable row level security;
revoke all on booking_api.charge_restorations from public,anon,authenticated,service_role;
create trigger charge_restorations_immutable before update or delete on booking_api.charge_restorations
for each row execute function booking_api.charge_origin_immutable();

create or replace function booking_api.guard_mapped_charge_delete() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from booking_api.charge_origins where costing_line_id=old."JobCostingLine_ID") then
  if booking_api.charge_has_financial_evidence(old."JobCostingLine_ID") then
   raise exception 'This charge has financial evidence and cannot be removed.' using errcode='55000';end if;
  if not exists(select 1 from booking_api.removed_charges r where r.costing_line_id=old."JobCostingLine_ID"
    and r.job_id=old."Job_ID" and r.before_state=to_jsonb(old)
    and not exists(select 1 from booking_api.charge_restorations s where s.removal_id=r.removal_id)) then
   raise exception 'Use the audited charge removal workflow.' using errcode='55000';end if;
 end if;
 return old;
end $$;

create function booking_api.guard_removed_charge_insert() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from booking_api.removed_charges r where r.costing_line_id=new."JobCostingLine_ID"
  and not exists(select 1 from booking_api.charge_restorations s where s.removal_id=r.removal_id)) then
  raise exception 'A removed charge requires explicit restoration.' using errcode='55000';end if;
 return new;
end $$;
create trigger booking_removed_charge_insert before insert on public."Job_Costing_Lines"
for each row execute function booking_api.guard_removed_charge_insert();
revoke all on function booking_api.guard_removed_charge_insert() from public,anon,authenticated,service_role;

create function booking_api.restore_operational_charge(caller_auth_user_id uuid,requested_job_id uuid,
 requested_removal_id uuid,expected_line jsonb,requested_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype;
 removed booking_api.removed_charges%rowtype; result jsonb;
begin
 if caller_auth_user_id is null or not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
  raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into strict job from public."Job_Header" j join public."cmp_Offices" o
 on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 if lower(job."Job_Status") not in ('open','in_progress') then
  raise exception 'Charge restoration requires an In progress Booking.' using errcode='55000';end if;
 if nullif(btrim(requested_reason),'') is null or length(requested_reason)>2000 then
  raise exception 'Explain why this charge is being restored.' using errcode='22023';end if;
 select * into strict removed from booking_api.removed_charges
 where removal_id=requested_removal_id and job_id=requested_job_id;
 if expected_line is null or expected_line is distinct from removed.before_state then
  raise exception 'The removal record changed. Refresh before restoring it.' using errcode='40001';end if;
 if exists(select 1 from booking_api.charge_restorations where removal_id=requested_removal_id)
  or exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=removed.costing_line_id) then
  raise exception 'This removal has already been restored.' using errcode='40001';end if;
 if booking_api.charge_has_financial_evidence(removed.costing_line_id) then
  raise exception 'This charge has financial evidence and needs a separate correction review.' using errcode='55000';end if;
 insert into booking_api.charge_restorations(removal_id,restored_by,reason)
 values(requested_removal_id,actor."User_ID",btrim(requested_reason));
 insert into public."Job_Costing_Lines"
 select * from jsonb_populate_record(null::public."Job_Costing_Lines",removed.before_state)
 returning to_jsonb("Job_Costing_Lines") into result;
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(actor."Company_ID",requested_job_id,'operational_charge_restored','Booking charge explicitly restored',
 jsonb_build_object('reason',btrim(requested_reason),'before',null,'after',result,'removalId',requested_removal_id,
 'costingLineId',removed.costing_line_id),actor."User_ID");
 update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;
 return result;
exception when no_data_found or too_many_rows then
 raise exception 'The Booking or removal record is unavailable in this workspace.' using errcode='42501';
end $$;
revoke all on function booking_api.restore_operational_charge(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
commit;
