import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { milestoneDexterAssertions } from './booking-milestone-dexter-fixture.mjs'
const migration=readFileSync(new URL('../migrations/20260907142751_dexter_booking_security_evidence_parity.sql',import.meta.url),'utf8')
const end=milestoneDexterAssertions.indexOf('\ndo $test$')
assert.ok(end>0)
const approval=milestoneDexterAssertions.slice(0,end)
  .replaceAll('"JobRouteMilestone_ID"','id').replaceAll('public."Job_RouteMilestones"','booking_api.cargo_security_evidence')
  .replaceAll('record_booking_milestone','record_booking_security_evidence')
  .replaceAll('fixture_approve_milestone','fixture_approve_security_evidence')
// Actual approval/execute/replay RPCs, with explicit local identity fixtures.
// Watch lifecycle and hosted access remain separate release gates.
export const securityEvidenceDexterFixture=migration+approval+`
do $screening_adapter$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;cargo uuid;record_id uuid;
  proposal jsonb;result jsonb;source jsonb;bad jsonb;before_rows jsonb;before_audit bigint;before_quotes jsonb;
begin
  perform set_config('test.actor',actor::text,false);perform set_config('test.booking_access','on',false);
  perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "JobCargo_ID" into cargo from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted" limit 1;
  select jsonb_agg(to_jsonb(q) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" q;
  proposal:=jsonb_build_object('target_id',job,'cargo_id',cargo,'record_id',null,
    'expected_updated_at',(select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job),
    'expected_cargo_updated_at',(select "JobCargo_UpdatedAt" from public."Job_Cargo" where "JobCargo_ID"=cargo),
    'expected_record_updated_at',null,'reason','  Exact reason – supplied  ',
    'changes','[{"field":"screeningMethod","value":"  Supplied method  "},{"field":"sourceReference","value":"  Source – café : : 原文  "}]'::jsonb);
  result:=booking_api.fixture_approve_security_evidence(actor,company,job,proposal,'approve');
  record_id:=(result->>'recordId')::uuid;
  source:=public.multideck_dexter_query_domain('booking_security_evidence',record_id::text,1)#>'{data,0}';
  if source->>'screeningMethod'<>'  Supplied method  ' or source->>'sourceReference'<>'  Source – café : : 原文  '
    or source->>'sourceTable'<>'booking_api.cargo_security_evidence' or source->>'cargoId'<>cargo::text
    or source->'securityStatus'<>'null'::jsonb then raise exception 'Screening adapter source fidelity failed';end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_security_evidence(gen_random_uuid(),record_id::text,1))<>0 then
    raise exception 'Foreign company read screening';end if;
  proposal:=proposal||jsonb_build_object('record_id',record_id,'expected_updated_at',source->'bookingUpdatedAt',
    'expected_record_updated_at',source->'updatedAt','changes','[{"field":"notes","value":"Correction"}]'::jsonb);
  select jsonb_agg(to_jsonb(e) order by id) into before_rows from booking_api.cargo_security_evidence e;
  select count(*) into before_audit from booking_api.events;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"changes":[{"field":"notes","value":false}]}'::jsonb,
    '{"changes":[{"field":"notes","value":"a"},{"field":"notes","value":"b"}]}',
    '{"changes":[{"field":"sourceReference","value":null}]}',
    '{"changes":[{"field":"unknown","value":"a"}]}')) loop
    begin perform public.multideck_dexter_action_record_booking_security_evidence(company,actor,proposal||bad);
      raise exception 'Malformed screening adapter request accepted';exception when sqlstate '22023' then null;end;
  end loop;
  begin perform public.multideck_dexter_action_record_booking_security_evidence(gen_random_uuid(),actor,proposal);
    raise exception 'Wrong company wrote evidence';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_record_booking_security_evidence(company,actor,
    proposal||'{"expected_updated_at":"2000-01-01T00:00:00Z"}');
    raise exception 'Stale adapter write accepted';exception when sqlstate 'PT409' then null;end;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(e) order by id) from booking_api.cargo_security_evidence e)
    or before_audit<>(select count(*) from booking_api.events) then raise exception 'Denied adapter writes changed state';end if;
  result:=booking_api.fixture_approve_security_evidence(actor,company,job,proposal,'full');
  if result#>>'{after,notes}'<>'Correction' then raise exception 'Adapter correction failed';end if;
  if not exists(select 1 from booking_api.events where event_type='dexter_security_evidence_recorded'
    and actor_user_id=actor and metadata->>'evidenceId'=record_id::text
    and metadata->>'reason'='  Exact reason – supplied  ') then raise exception 'Adapter attributed audit missing';end if;
  if before_quotes is distinct from (select jsonb_agg(to_jsonb(q) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" q) then
    raise exception 'Adapter changed Quotes';end if;
  if has_function_privilege('authenticated','public.multideck_dexter_action_record_booking_security_evidence(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.multideck_dexter_domain_booking_security_evidence(uuid,text,integer)','EXECUTE') then
    raise exception 'Private adapter exposed';end if;
end $screening_adapter$;
`;
