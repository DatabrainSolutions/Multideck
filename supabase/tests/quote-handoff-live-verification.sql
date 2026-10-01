-- Shared-development verification only. Uses fictional, temporary party rows
-- on one non-cancelled Quote-sourced Booking. ROLLBACK retains no test data.
-- This checks the real deployed trigger/typed storage, not customer acceptance
-- or an entire Quote-to-Booking HTTP transaction. Never print customer payloads.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temporary table quote_handoff_results (check_name text, passed boolean);
do $verify$
declare
  job uuid; party uuid; operator_party uuid; retained_party uuid;
  before_job jsonb; before_parties jsonb; before_equipment jsonb;
  snapshot jsonb := '{"quote":{"mode":"Sea","shipmentType":"FCL","shipmentFacts":{"containerRequests":[{"type":"40GP","quantity":1}],"pieces":"24","packageType":"Cartons","grossWeightKg":"3000","volumeCbm":"5"}}}';
  rows jsonb; item jsonb;
begin
  rows := booking_api.quote_container_rows(snapshot);
  if jsonb_array_length(rows) <> 1 or rows#>>'{0,packages}' is distinct from '24'
    or rows#>>'{0,packageType}' is distinct from 'Cartons' or rows#>>'{0,volumeCbm}' is distinct from '5'
    or rows->0 ?| array['grossWeightKg','verifiedGrossMassKg'] then
    raise exception 'Single-container weight/quantities failed';
  end if;
  rows := booking_api.quote_container_rows(jsonb_set(snapshot,'{quote,shipmentFacts,containerRequests,0,quantity}','2'));
  if jsonb_array_length(rows) <> 2 then raise exception 'Physical container count lost'; end if;
  for item in select value from jsonb_array_elements(rows) loop
    if item ?| array['grossWeightKg','verifiedGrossMassKg','packages','volumeCbm'] then
      raise exception 'Multi-container allocation was invented';
    end if;
  end loop;
  insert into quote_handoff_results values ('deployed_container_projection',true);

  select j."Job_ID",to_jsonb(j) into job,before_job
  from public."Job_Header" j
  where j."Job_SourceQuoteID" is not null and not j."Job_IsDeleted"
    and j."Job_Status" <> 'cancelled' and not j."Job_ProvisionalCancelled"
  order by j."Job_ID" limit 1;
  if job is null then raise exception 'No eligible Quote-sourced Booking: do not silently skip'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p."JobParty_ID"),'[]') into before_parties
  from public."Job_Parties" p where p."JobParty_JobID"=job;
  select coalesce(jsonb_agg(to_jsonb(c) order by c."JobContainers_ID"),'[]') into before_equipment
  from public."Job_Containers" c where c."Job_ID"=job;

  insert into public."Job_Parties" ("JobParty_JobID","JobParty_Role","JobParty_Sequence","JobParty_IsPrimary","JobParty_NameSnapshot","JobParty_RawSnapshot")
  values (job,'shipper',2147483000,false,'Fictional handoff check',
    '{"contact":"Example Sender","email":"sender@example.test"}') returning "JobParty_ID" into party;
  if not exists(select 1 from public."Job_Parties" where "JobParty_ID"=party
    and "JobParty_ContactNameSnapshot"='Example Sender' and "JobParty_EmailSnapshot"='sender@example.test') then
    raise exception 'Real initial-party trigger/typed storage failed';
  end if;
  insert into quote_handoff_results values ('deployed_party_trigger_and_storage',true);

  insert into public."Job_Parties" ("JobParty_JobID","JobParty_Role","JobParty_Sequence","JobParty_IsPrimary","JobParty_NameSnapshot","JobParty_RawSnapshot","JobParty_EmailSnapshot")
  values (job,'consignee',2147483001,false,'Fictional explicit clear check',
    '{"role":"consignee","email":""}','') returning "JobParty_ID" into operator_party;
  if not exists(select 1 from public."Job_Parties" where "JobParty_ID"=operator_party
    and "JobParty_EmailSnapshot"='') then
    raise exception 'Later explicit email clear was refilled';
  end if;
  insert into public."Job_Parties" ("JobParty_JobID","JobParty_Role","JobParty_Sequence","JobParty_IsPrimary","JobParty_NameSnapshot","JobParty_RawSnapshot","JobParty_EmailSnapshot","JobParty_ContactNameSnapshot")
  values (job,'shipper',2147483002,false,'Fictional retained contact check',
    '{"email":"source@example.test","contact":"Source name"}','operator@example.test','Example Operator') returning "JobParty_ID" into retained_party;
  if not exists(select 1 from public."Job_Parties" where "JobParty_ID"=retained_party
    and "JobParty_EmailSnapshot"='operator@example.test' and "JobParty_ContactNameSnapshot"='Example Operator') then
    raise exception 'Explicit operator contact was overwritten';
  end if;
  insert into quote_handoff_results values ('operator_contacts_and_explicit_clear_preserved',true);
  if before_job is distinct from (select to_jsonb(j) from public."Job_Header" j where j."Job_ID"=job)
    or before_parties is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by p."JobParty_ID"),'[]')
      from public."Job_Parties" p where p."JobParty_JobID"=job and p."JobParty_ID" not in (party,operator_party,retained_party))
    or before_equipment is distinct from (select coalesce(jsonb_agg(to_jsonb(c) order by c."JobContainers_ID"),'[]')
      from public."Job_Containers" c where c."Job_ID"=job) then
    raise exception 'Existing Booking/party/container evidence changed';
  end if;
  insert into quote_handoff_results values ('existing_operational_evidence_unchanged',true);
  if has_function_privilege('anon','booking_api.fill_accepted_quote_party_contact()','EXECUTE')
    or has_function_privilege('authenticated','booking_api.fill_accepted_quote_party_contact()','EXECUTE')
    or has_function_privilege('service_role','booking_api.fill_accepted_quote_party_contact()','EXECUTE') then
    raise exception 'Private trigger was exposed as an action';
  end if;
  insert into quote_handoff_results values ('private_trigger_not_callable',true);
end $verify$;
select check_name,passed from quote_handoff_results order by check_name;
rollback;
