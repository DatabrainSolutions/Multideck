import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
function section(source, first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start)
  assert.ok(start >= 0 && end > start, `Missing SQL boundary: ${first}`)
  return source.slice(start, end)
}
const numbering = read('20260828135847_reconcile_directional_quote_booking_references')
// Actual sequence/reservation definitions and renderer/allocator functions.
// Company and collision-source tables augment the surrounding explicit fixture.
// Managed Auth/workspace permissions remain fixtures, not hosted denial proof.
export const openingDirectionFixture = `
alter table public."cmp_Company" add column "Company_Name" varchar(100) not null default 'Synthetic company';
alter table public."CusQuote_Header" add column "Org_ID" uuid, add column "CusQuoteHeader_CustomerReference" text;
alter table public."Org_Master" add column "Org_AccCode" text;
create table public."CRM_AccountProfiles" ("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false);
${section(read('20260819170000_reference_patterns'), 'create table if not exists quote_api.booking_reference_sequences', 'create or replace function quote_api.clean_reference_pattern')}
${section(read('20260820200000_reference_rule_safety_and_dexter'), 'create table if not exists quote_api.reference_reservations', 'insert into quote_api.reference_reservations')}
${section(numbering, 'create or replace function quote_api.clean_reference_pattern', '-- Keep an already-created')}
${section(numbering, 'create or replace function quote_api.render_reference_pattern', 'create or replace function quote_api.synchronise_company_references')}
insert into quote_api.booking_reference_sequences(company_id,sequence_key,label,pattern,next_number)
select "Company_ID",'default','Synthetic directional','J{DIRECTION:1}{NUMBER:7}',1 from public."cmp_Users"
where "User_ID"='10000000-0000-4000-8000-000000000001';

-- Reproduce the hosted defect with actual numbering before installing the fix.
do $test$
declare before_jobs bigint; before_events bigint;
begin
  select count(*) into before_jobs from public."Job_Header";
  select count(*) into before_events from booking_api.events;
  begin
    perform public.booking_workflow_open_road('10000000-0000-4000-8000-000000000001',gen_random_uuid());
    raise exception 'Old opener unexpectedly accepted directional numbering';
  exception when invalid_parameter_value then
    if sqlerrm<>'A valid direction is required for a directional reference rule.' then raise;end if;
  end;
  if (select count(*) from public."Job_Header")<>before_jobs or (select count(*) from booking_api.events)<>before_events
    or exists(select 1 from quote_api.reference_reservations)
    or exists(select 1 from quote_api.booking_reference_sequences where next_number<>1)
    then raise exception 'Failed legacy opening partially mutated state';end if;
end $test$;
${read('20260907121414_booking_explicit_open_direction')}
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; company uuid;
  direction text; code text; n integer:=1; key uuid; opened jsonb; replay jsonb; job uuid;
  old_jobs jsonb; events bigint; reservations bigint; counter bigint; bad text;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select jsonb_object_agg("Job_ID"::text,to_jsonb(j)) into old_jobs from public."Job_Header" j;
  foreach direction in array array['import','export','domestic','cross_trade'] loop
    code:=case direction when 'import' then 'I' when 'export' then 'E' when 'domestic' then 'D' else 'C' end;
    key:=gen_random_uuid(); opened:=public.booking_workflow_open_road(actor,key,'default',direction);
    job:=(opened->>'jobId')::uuid;
    if opened->>'bookingReference' is distinct from 'J'||code||lpad(n::text,7,'0')
      or opened->>'reused'<>'false' or not exists(select 1 from public."Job_Header"
        where "Job_ID"=job and "Job_Direction"=direction and "Job_TransportModeSummary"='road' and "Job_Status"='draft')
      then raise exception 'Direction/reference/durable Road draft mismatch: %',opened;end if;
    if not exists(select 1 from quote_api.reference_reservations where company_id=company
      and reference_value=opened->>'bookingReference' and reference_kind='booking') then raise exception 'Missing reservation';end if;
    perform public.booking_workflow_save(actor,job,'{"mode":"air","direction":"export"}');
    select count(*) into events from booking_api.events;
    replay:=public.booking_workflow_open_road(actor,key,'default','domestic');
    if replay->>'jobId'<>job::text or replay->>'reused'<>'true'
      or (select count(*) from booking_api.events)<>events
      or not exists(select 1 from public."Job_Header" where "Job_ID"=job and "Job_TransportModeSummary"='air' and "Job_Direction"='export')
      then raise exception 'Replay changed existing operator state';end if;
    n:=n+1;
  end loop;
  if old_jobs is distinct from (select jsonb_object_agg("Job_ID"::text,to_jsonb(j)) from public."Job_Header" j where old_jobs ? "Job_ID"::text)
    then raise exception 'Opening modified pre-existing jobs';end if;
  if not exists(select 1 from quote_api.booking_reference_sequences where company_id=company and sequence_key='default'
    and next_number=5 and pattern='J{DIRECTION:1}{NUMBER:7}' and label='Synthetic directional' and enabled)
    then raise exception 'Counter or configured rule changed incorrectly';end if;
  select count(*) into reservations from quote_api.reference_reservations;
  foreach bad in array array['','unknown','Import','cross-trade'] loop
    begin perform public.booking_workflow_open_road(actor,gen_random_uuid(),'default',bad);
      raise exception 'Invalid direction accepted';exception when invalid_parameter_value then null;end;
  end loop;
  begin perform public.booking_workflow_open_road(gen_random_uuid(),gen_random_uuid(),'default','import');
    raise exception 'Wrong actor accepted';exception when insufficient_privilege then null;end;
  if (select count(*) from quote_api.reference_reservations)<>reservations then raise exception 'Denied request reserved number';end if;
  -- Legacy callers remain usable with an explicitly non-directional sequence.
  insert into quote_api.booking_reference_sequences(company_id,sequence_key,label,pattern,next_number)
    values(company,'legacy','Legacy test','B-{NUMBER:4}',1);
  opened:=booking_api.open_booking(actor,gen_random_uuid(),'legacy');
  if opened->>'bookingReference'<>'B-0001' then raise exception 'Legacy overload changed';end if;
  -- Existing reservation collision skips rather than reusing or renaming it.
  insert into quote_api.reference_reservations(company_id,normalized_reference,reference_value,reference_kind)
    values(company,'JI0000005','JI0000005','quote');
  opened:=public.booking_workflow_open(actor,gen_random_uuid(),'default','import');
  if opened->>'bookingReference'<>'JI0000006' then raise exception 'Collision was not skipped';end if;
  foreach bad in array array['public.booking_workflow_open(uuid,uuid,text,text)','public.booking_workflow_open_road(uuid,uuid,text,text)'] loop
    if has_function_privilege('anon',bad,'EXECUTE') or has_function_privilege('authenticated',bad,'EXECUTE')
      or not has_function_privilege('service_role',bad,'EXECUTE') then raise exception 'Adapter grants incorrect';end if;
  end loop;
  if has_function_privilege('service_role','booking_api.open_booking(uuid,uuid,text,text)','EXECUTE')
    then raise exception 'Private helper exposed';end if;
end $test$;

create function public.direction_fixture_fail() returns trigger language plpgsql as $$begin
  if new."Job_TransportModeSummary"='road' then raise exception 'Synthetic save failure' using errcode='22023';end if;
  return new;
end $$;
create trigger direction_fixture_failure before update on public."Job_Header" for each row execute function public.direction_fixture_fail();
do $test$
declare before_state jsonb; after_state jsonb;
begin
  select jsonb_build_array((select jsonb_agg(to_jsonb(j) order by "Job_ID") from public."Job_Header" j),
    (select jsonb_agg(to_jsonb(e)) from booking_api.events e),
    (select jsonb_agg(to_jsonb(r) order by company_id,normalized_reference) from quote_api.reference_reservations r),
    (select jsonb_agg(to_jsonb(s) order by company_id,sequence_key) from quote_api.booking_reference_sequences s)) into before_state;
  begin perform public.booking_workflow_open_road('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'default','import');
    raise exception 'Save failure missing';exception when invalid_parameter_value then
      if sqlerrm<>'Synthetic save failure' then raise;end if;end;
  select jsonb_build_array((select jsonb_agg(to_jsonb(j) order by "Job_ID") from public."Job_Header" j),
    (select jsonb_agg(to_jsonb(e)) from booking_api.events e),
    (select jsonb_agg(to_jsonb(r) order by company_id,normalized_reference) from quote_api.reference_reservations r),
    (select jsonb_agg(to_jsonb(s) order by company_id,sequence_key) from quote_api.booking_reference_sequences s)) into after_state;
  if before_state is distinct from after_state then raise exception 'Failed save changed jobs/audit/reservations/counters';end if;
end $test$;
drop trigger direction_fixture_failure on public."Job_Header";
drop function public.direction_fixture_fail();
`
