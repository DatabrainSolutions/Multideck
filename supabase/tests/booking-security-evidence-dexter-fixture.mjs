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
do $screening_watch$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;cargo uuid;record_id uuid;
  watcher uuid;other_actor uuid;source jsonb;result jsonb;before_count integer;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID" into other_actor from public."cmp_Users" where "Company_ID"<>company limit 1;
  select e.id,e.cargo_id,c."JobCargo_JobID" into record_id,cargo,job from booking_api.cargo_security_evidence e
    join public."Job_Cargo" c on c."JobCargo_ID"=e.cargo_id where e.record_status='recorded' order by e.created_at desc limit 1;
  source:=public.multideck_dexter_query_domain('booking_security_evidence',record_id::text,1)#>'{data,0}';
  result:=public.multideck_dexter_create_watch('booking_security_evidence','Screening method changes','Supplied changes','Watch supplied method',
    record_id,'Wrong model label','{"field":"screeningMethod","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  if (select "AIDexterWatch_TargetLabel" from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher)<>source->>'targetLabel' then
    raise exception 'Unverified screening label retained';end if;
  perform public.booking_workflow_save_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"screeningMethod":"Changed supplied method"}'));
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Screening change not singular';end if;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher
    and "AIDexterWatchEvent_ChangedJSON"->>'sourceUrl'=source->>'sourceUrl') then raise exception 'Screening Booking source link missing';end if;
  if not exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=watcher and "CommNotif_UserID"=actor
    and "CommNotif_Body" like '%not clearance or agent verification.%') then raise exception 'Screening owner notification missing';end if;
  perform public.booking_workflow_save_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"notes":"Unrelated"}'));
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.booking_workflow_save_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"screeningMethod":"Paused change"}'));
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Paused/unrelated screening change fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.booking_workflow_save_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"screeningMethod":"Resumed"}'));
  perform public.booking_workflow_save_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"screeningMethod":"Resumed"}'));
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Resumed/no-op screening change incorrect';end if;
  begin perform public.multideck_dexter_create_watch('booking_security_evidence','Write','Invalid','Write',record_id,'Record',
    '{"field":"notes","operator":"changed"}','{}');raise exception 'Screening autonomous watch accepted';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_create_watch('booking_security_evidence','Wrong','Invalid','Wrong',gen_random_uuid(),'Record',
    '{"field":"notes","operator":"changed"}');raise exception 'Unknown screening target accepted';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_security_evidence','booking_api.cargo_security_evidence',record_id,'{"screeningMethod":"a"}','{"screeningMethod":"b"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Revoked screening owner notified';end if;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  perform set_config('test.actor',other_actor::text,false);set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Other user read screening event';end if;
  reset role;perform set_config('test.actor',actor::text,false);
  perform set_config('test.booking_access','off',false);
  if exists(select 1 from jsonb_array_elements(public.multideck_dexter_list_watches()) row where row->>'capability'='booking_security_evidence') then
    raise exception 'Revoked Booking access leaked screening watch';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='booking_security_evidence') then raise exception 'Screening watch RLS leaked';end if;
  reset role;perform set_config('test.booking_access','on',false);
  perform public.booking_workflow_save_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"recordStatus":"voided"}'));
  begin perform public.multideck_dexter_create_watch('booking_security_evidence','Voided','Invalid','Voided',record_id,'Record',
    '{"field":"notes","operator":"changed"}');raise exception 'Voided screening target accepted';exception when insufficient_privilege then null;end;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher and "AIDexterWatch_HealthStatusCode"='error') then
    raise exception 'Screening watch swallowed an error';end if;
end $screening_watch$;
`;
