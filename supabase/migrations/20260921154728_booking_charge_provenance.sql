-- Staged private foundation. No existing data is backfilled and no API grants
-- are enabled until the complete charge review/release package is verified.
begin;
set local lock_timeout='5s';

create table booking_api.charge_origins (
 job_id uuid not null references public."Job_Header"("Job_ID") on delete restrict,
 costing_line_id uuid primary key references public."Job_Costing_Lines"("JobCostingLine_ID") on delete restrict,
 origin text not null check(origin in ('quote','booking')),
 quote_id uuid references public."CusQuote_Header"("CusQuoteHeader_ID") on delete restrict,
 quote_version_id uuid references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete restrict,
 quote_line_id text,
 source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
 recorded_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
 recorded_at timestamptz not null default clock_timestamp(),
 check ((origin='booking' and quote_id is null and quote_version_id is null and quote_line_id is null)
   or (origin='quote' and quote_id is not null and quote_version_id is not null and nullif(btrim(quote_line_id),'') is not null))
);
create unique index charge_origins_quote_line on booking_api.charge_origins(job_id,quote_id,quote_line_id) where origin='quote';
alter table booking_api.charge_origins enable row level security;
revoke all on booking_api.charge_origins from public,anon,authenticated,service_role;

create function booking_api.charge_origin_immutable() returns trigger
language plpgsql set search_path='' as $$begin
 raise exception 'Recorded charge origins are immutable; use an audited correction workflow.' using errcode='55000';
end $$;
create trigger charge_origins_immutable before update or delete on booking_api.charge_origins
for each row execute function booking_api.charge_origin_immutable();
revoke all on function booking_api.charge_origin_immutable() from public,anon,authenticated,service_role;

-- Financial evidence is deliberately conservative: even a draft document link
-- needs a separate correction, never silent unlinking by an operational editor.
create function booking_api.charge_has_financial_evidence(requested_line_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public."FIN_DocumentLineJobLinks" where "FINDocLineJob_JobCostingLineID"=requested_line_id)
 or exists(select 1 from public."FIN_Accruals" where "FINAccrual_JobCostingLineID"=requested_line_id)
 or exists(select 1 from public."FIN_WIPItems" where "FINWIP_JobCostingLineID"=requested_line_id)
 or exists(select 1 from public."FIN_AccrualWIPReleases" where "FINRelease_JobCostingLineID"=requested_line_id)
 or exists(select 1 from public."FIN_JobChargePeriodAllocations" where "FINChargePeriod_JobCostingLineID"=requested_line_id);
$$;
revoke all on function booking_api.charge_has_financial_evidence(uuid) from public,anon,authenticated,service_role;

-- Called only from a future authenticated, approved mapping endpoint. The full
-- database row supplied by the read endpoint is compared again under row lock.
-- It is an optimistic concurrency value, not an authorisation credential.
create function booking_api.record_charge_origin(
 caller_auth_user_id uuid, requested_job_id uuid, requested_line_id uuid,
 expected_line jsonb, requested_origin text, requested_quote_version_id uuid,
 requested_quote_line_id text, requested_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype;
 line public."Job_Costing_Lines"%rowtype; version public."CusQuote_Versions"%rowtype;
 source_value jsonb; result jsonb; matches integer;
begin
 if caller_auth_user_id is null or not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
  raise exception 'Booking changes are not authorised.' using errcode='42501'; end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into strict job from public."Job_Header" j join public."cmp_Offices" o
 on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 if lower(job."Job_Status") not in ('open','in_progress') then
  raise exception 'Charge mapping requires an In progress Booking.' using errcode='55000'; end if;
 if requested_origin is null or requested_origin not in ('quote','booking')
 or nullif(btrim(requested_reason),'') is null or length(requested_reason)>2000 then
  raise exception 'Choose a charge origin and explain the mapping.' using errcode='22023'; end if;
 select * into strict line from public."Job_Costing_Lines"
 where "JobCostingLine_ID"=requested_line_id and "Job_ID"=requested_job_id for update;
 if expected_line is null or expected_line is distinct from to_jsonb(line) then
  raise exception 'The charge changed. Refresh before matching its origin.' using errcode='40001'; end if;
 if line."JobCostingLine_DomainCode" is distinct from 'freight' then
  raise exception 'Only freight charges can be matched here.' using errcode='22023'; end if;
 if booking_api.charge_has_financial_evidence(requested_line_id) then
  raise exception 'This charge has financial evidence and needs a separate correction review.' using errcode='55000'; end if;
 if exists(select 1 from booking_api.charge_origins where costing_line_id=requested_line_id) then
  raise exception 'This charge already has a recorded origin.' using errcode='40001'; end if;
 if requested_origin='quote' then
  if line."JobCostingLine_SourceTable" is not null and line."JobCostingLine_SourceTable"<>'CusQuote_Versions' then
   raise exception 'A charge from another source cannot be relabelled as a Quote charge.' using errcode='22023'; end if;
  select v.* into strict version from public."CusQuote_Versions" v
  join public."CusQuote_Header" q on q."CusQuoteHeader_ID"=v."CusQuoteHeader_ID"
  where v."CusQuoteVersion_ID"=requested_quote_version_id and v."CusQuoteHeader_ID"=job."Job_SourceQuoteID"
  and not q."CusQuoteHeader_IsDeleted" and v."CusQuoteVersion_IsSubmitted" and v."CusQuoteVersion_StatusCode"='accepted';
  if line."JobCostingLine_SourceTable"='CusQuote_Versions' and line."JobCostingLine_SourceID" is distinct from requested_quote_version_id then
   raise exception 'The recorded source version must be preserved.' using errcode='22023'; end if;
  if line."JobCostingLine_SourceLineID" is not null and line."JobCostingLine_SourceLineID"::text is distinct from requested_quote_line_id then
   raise exception 'The recorded source line must be preserved.' using errcode='22023'; end if;
  select count(*) into matches from jsonb_array_elements(coalesce(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}','[]')) c
  where c->>'id'=requested_quote_line_id;
  if matches<>1 then raise exception 'Choose one unambiguous line from the accepted Quote.' using errcode='22023'; end if;
  select c into source_value from jsonb_array_elements(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') c where c->>'id'=requested_quote_line_id;
 else
  if requested_quote_version_id is not null or requested_quote_line_id is not null
    or (line."JobCostingLine_SourceTable" is not null and line."JobCostingLine_SourceTable"<>'booking_api.planning_charge_sets') then
   raise exception 'The recorded charge source must be preserved.' using errcode='22023'; end if;
  source_value:=to_jsonb(line);
 end if;
 insert into booking_api.charge_origins(job_id,costing_line_id,origin,quote_id,quote_version_id,quote_line_id,source_snapshot,recorded_by)
 values(requested_job_id,requested_line_id,requested_origin,
 case when requested_origin='quote' then job."Job_SourceQuoteID" end,requested_quote_version_id,requested_quote_line_id,source_value,actor."User_ID")
 returning to_jsonb(charge_origins) into result;
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(actor."Company_ID",requested_job_id,'charge_origin_recorded','Charge origin confirmed',
 jsonb_build_object('reason',btrim(requested_reason),'before',to_jsonb(line),'origin',result),actor."User_ID");
 update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;
 return result;
exception when no_data_found or too_many_rows then
 raise exception 'The Booking, charge or accepted Quote is unavailable in this workspace.' using errcode='42501';
end $$;
revoke all on function booking_api.record_charge_origin(uuid,uuid,uuid,jsonb,text,uuid,text,text) from public,anon,authenticated,service_role;
commit;
