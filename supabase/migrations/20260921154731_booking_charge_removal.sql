-- Private, staged removal transaction. Not deployable without the replacement
-- Quote-sync guards and UI. No public/Edge entry point or grants are introduced.
begin;
set local lock_timeout='5s';

create table booking_api.removed_charges (
 costing_line_id uuid primary key references booking_api.charge_origins(costing_line_id) on delete restrict,
 job_id uuid not null references public."Job_Header"("Job_ID") on delete restrict,
 before_state jsonb not null check(jsonb_typeof(before_state)='object'),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 removed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
 removed_at timestamptz not null default clock_timestamp()
);
alter table booking_api.removed_charges enable row level security;
revoke all on booking_api.removed_charges from public,anon,authenticated,service_role;
create trigger removed_charges_immutable before update or delete on booking_api.removed_charges
for each row execute function booking_api.charge_origin_immutable();

-- Provenance is historical evidence, so its identity outlives the active costing
-- row. Replace only our new foundation's FK with an audited-removal guard.
alter table booking_api.charge_origins drop constraint charge_origins_costing_line_id_fkey;
create function booking_api.guard_charge_origin_row() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=new.costing_line_id and "Job_ID"=new.job_id) then
  raise exception 'Charge origin requires the active line in the same Booking.' using errcode='23503';end if;
 return new;
end $$;
create trigger charge_origin_active_row before insert on booking_api.charge_origins
for each row execute function booking_api.guard_charge_origin_row();
revoke all on function booking_api.guard_charge_origin_row() from public,anon,authenticated,service_role;

create function booking_api.guard_mapped_charge_delete() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from booking_api.charge_origins where costing_line_id=old."JobCostingLine_ID") then
  if booking_api.charge_has_financial_evidence(old."JobCostingLine_ID") then
   raise exception 'This charge has financial evidence and cannot be removed.' using errcode='55000';end if;
  if not exists(select 1 from booking_api.removed_charges r where r.costing_line_id=old."JobCostingLine_ID"
    and r.job_id=old."Job_ID" and r.before_state=to_jsonb(old)) then
   raise exception 'Use the audited charge removal workflow.' using errcode='55000';end if;
 end if;
 return old;
end $$;
create trigger booking_mapped_charge_delete before delete on public."Job_Costing_Lines"
for each row execute function booking_api.guard_mapped_charge_delete();
revoke all on function booking_api.guard_mapped_charge_delete() from public,anon,authenticated,service_role;

create function booking_api.remove_operational_charge(caller_auth_user_id uuid,requested_job_id uuid,
 requested_line_id uuid,expected_line jsonb,requested_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype;
 line public."Job_Costing_Lines"%rowtype; result jsonb;
begin
 if caller_auth_user_id is null or not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
  raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into strict job from public."Job_Header" j join public."cmp_Offices" o
 on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 if lower(job."Job_Status") not in ('open','in_progress') then
  raise exception 'Charge removal requires an In progress Booking.' using errcode='55000';end if;
 if nullif(btrim(requested_reason),'') is null or length(requested_reason)>2000 then
  raise exception 'Explain why this charge is being removed.' using errcode='22023';end if;
 select * into strict line from public."Job_Costing_Lines" where "JobCostingLine_ID"=requested_line_id and "Job_ID"=requested_job_id for update;
 if expected_line is null or expected_line is distinct from to_jsonb(line) then
  raise exception 'The charge changed. Refresh before removing it.' using errcode='40001';end if;
 if line."JobCostingLine_DomainCode" is distinct from 'freight' then
  raise exception 'Only freight charges can be removed here.' using errcode='22023';end if;
 if not exists(select 1 from booking_api.charge_origins where costing_line_id=requested_line_id and job_id=requested_job_id) then
  raise exception 'Confirm the charge origin before removing it.' using errcode='55000';end if;
 if booking_api.charge_has_financial_evidence(requested_line_id) then
  raise exception 'This charge has financial evidence and needs a separate correction review.' using errcode='55000';end if;
 insert into booking_api.removed_charges(costing_line_id,job_id,before_state,reason,removed_by)
 values(requested_line_id,requested_job_id,to_jsonb(line),btrim(requested_reason),actor."User_ID")
 returning to_jsonb(removed_charges) into result;
 delete from public."Job_Costing_Lines" where "JobCostingLine_ID"=requested_line_id and "Job_ID"=requested_job_id;
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(actor."Company_ID",requested_job_id,'operational_charge_removed','Booking charge removed',
 jsonb_build_object('reason',btrim(requested_reason),'before',to_jsonb(line),'after',null,'costingLineId',requested_line_id),actor."User_ID");
 update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;
 return result;
exception when no_data_found or too_many_rows then
 raise exception 'The Booking or active charge is unavailable in this workspace.' using errcode='42501';
end $$;
revoke all on function booking_api.remove_operational_charge(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
commit;
