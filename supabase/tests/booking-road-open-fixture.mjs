import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const original = read('20260820150000_booking_quote_customer_response')
const start = original.indexOf('create or replace function booking_api.open_booking(')
const end = original.indexOf('create or replace function booking_api.convert_accepted_quote(', start)
assert.ok(start >= 0 && end > start)

// Actual opener + current canonical save chain + new transaction wrapper.
// Number allocation and managed Auth remain explicit surrounding fixtures.
export const roadOpenFixture = `
alter table public."cmp_Offices" add column "Office_IsActive" boolean default true;
alter table public."Job_Header" add column "Job_CreateIdempotencyKey" uuid;
-- Match the existing draft-opening migration, not the older baseline.
alter table public."Job_Header" alter column "Job_Customer" drop not null;
insert into public."sys_JobStatuses" values ('draft',true);
create unique index road_open_request on public."Job_Header" ("Job_CreatedBy","Job_CreateIdempotencyKey") where not "Job_IsDeleted";
create sequence road_fixture_number start 10000;
alter table public."Job_Header" alter column "Job_Number" set default nextval('road_fixture_number');
create function booking_api.allocate_reference(uuid,text) returns text language sql as $$
  select 'ROAD-TEST-'||nextval('public.road_fixture_number')::text
$$;
${original.slice(start,end)}
${read('20260907114906_booking_road_draft_atomic_open')}
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; key uuid:=gen_random_uuid();
  first_result jsonb; reused jsonb; job uuid; before_events bigint; old_jobs jsonb; after_jobs jsonb;
begin
  perform set_config('test.actor',actor::text,false);
  select jsonb_object_agg("Job_ID"::text,to_jsonb(j)) into old_jobs from public."Job_Header" j;
  first_result:=public.booking_workflow_open_road(actor,key);
  job:=(first_result->>'jobId')::uuid;
  if first_result->>'reused'<>'false' or not exists(select 1 from public."Job_Header"
    where "Job_ID"=job and "Job_TransportModeSummary"='road' and "Job_Status"='draft'
    and "Job_Direction"='unknown' and "Job_Customer" is null and "Job_CreateIdempotencyKey"=key)
    then raise exception 'Road draft not durably initialised';end if;
  if (select count(*) from booking_api.events where job_id=job and actor_user_id=actor and event_type in ('created','saved'))<>2
    then raise exception 'Canonical creation/save audit missing';end if;
  select count(*) into before_events from booking_api.events;
  reused:=public.booking_workflow_open_road(actor,key);
  if reused->>'reused'<>'true' or reused->>'jobId'<>job::text or
    (select count(*) from booking_api.events)<>before_events then raise exception 'Replay duplicated draft or audit';end if;
  perform public.booking_workflow_save(actor,job,'{"mode":"air"}');
  select count(*) into before_events from booking_api.events;
  perform public.booking_workflow_open_road(actor,key);
  if (select "Job_TransportModeSummary" from public."Job_Header" where "Job_ID"=job)<>'air'
    or (select count(*) from booking_api.events)<>before_events then raise exception 'Replay overwrote operator edit';end if;
  select jsonb_object_agg("Job_ID"::text,to_jsonb(j)) into after_jobs from public."Job_Header" j where old_jobs ? "Job_ID"::text;
  if old_jobs is distinct from after_jobs then raise exception 'Road creation changed pre-existing jobs';end if;
  begin perform public.booking_workflow_open_road(gen_random_uuid(),gen_random_uuid());
    raise exception 'Unauthorised opening accepted';exception when insufficient_privilege then null;end;
  begin perform public.booking_workflow_open_road(actor,null);
    raise exception 'Missing request accepted';exception when invalid_parameter_value then null;end;
  if has_function_privilege('anon','public.booking_workflow_open_road(uuid,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.booking_workflow_open_road(uuid,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role','public.booking_workflow_open_road(uuid,uuid,text)','EXECUTE')
    then raise exception 'Road opener grants incorrect';end if;
end $test$;

-- A canonical-save failure must also roll back the preceding creation/audit.
create function public.road_fixture_fail() returns trigger language plpgsql as $$begin
  if new."Job_TransportModeSummary"='road' then raise exception 'Synthetic save failure' using errcode='22023';end if;
  return new;
end $$;
create trigger road_fixture_failure before update on public."Job_Header" for each row execute function public.road_fixture_fail();
do $test$
declare key uuid:=gen_random_uuid(); before_jobs bigint;before_events bigint;
begin
  select count(*) into before_jobs from public."Job_Header";
  select count(*) into before_events from booking_api.events;
  begin perform public.booking_workflow_open_road('10000000-0000-4000-8000-000000000001',key);
    raise exception 'Synthetic failure did not occur';exception when invalid_parameter_value then null;end;
  if exists(select 1 from public."Job_Header" where "Job_CreateIdempotencyKey"=key)
    or (select count(*) from public."Job_Header")<>before_jobs
    or (select count(*) from booking_api.events)<>before_events then raise exception 'Failed setup left partial draft/audit';end if;
end $test$;
drop trigger road_fixture_failure on public."Job_Header";
drop function public.road_fixture_fail();
`
