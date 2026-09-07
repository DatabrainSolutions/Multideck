import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { milestoneDexterAssertions } from './booking-milestone-dexter-fixture.mjs'

const migration = readFileSync(new URL('../migrations/20260907103421_dexter_booking_dangerous_goods_parity.sql', import.meta.url), 'utf8')
// Reuse the same prepared-action/approval/replay harness, changing only its
// allowlisted action and the table whose before/after evidence it checks.
const end = milestoneDexterAssertions.indexOf('\ndo $test$')
assert.ok(end > 0)
const approve = milestoneDexterAssertions.slice(0, end)
  .replaceAll('JobRouteMilestone_ID', 'JobCargoDG_ID').replaceAll('Job_RouteMilestones', 'Job_CargoDangerousGoods')
  .replaceAll('record_booking_milestone', 'record_booking_dangerous_goods')
  .replaceAll('fixture_approve_milestone', 'fixture_approve_dangerous_goods')

export const dangerousGoodsDexterFixture = migration + approve + `
do $dg_dexter$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;cargo uuid;record_id uuid;
  watcher uuid;other_actor uuid;source jsonb;proposal jsonb;result jsonb;mode text;before_count integer;
  before_quotes jsonb;before_routes jsonb;
begin
  perform set_config('test.actor',actor::text,false);perform set_config('test.booking_access','on',false);
  perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID" into other_actor from public."cmp_Users" where "Company_ID"<>company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" v;
  select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r;
  insert into public."Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description")
    values(job,91,'Synthetic Dexter evidence cargo') returning "JobCargo_ID" into cargo;
  foreach mode in array array['sea','air','road','rail','multimodal'] loop
    update public."Job_Header" set "Job_TransportModeSummary"=mode where "Job_ID"=job;
    source:=public.multideck_dexter_query_domain('booking_cargo',cargo::text,1)#>'{data,0}';
    proposal:=jsonb_build_object('target_id',job,'cargo_id',cargo,'record_id',null,
      'expected_updated_at',source->'updatedAt','expected_cargo_updated_at',source->'cargoUpdatedAt','expected_record_updated_at',null,
      'changes','[{"field":"unNumber","value":"1234"},{"field":"sourceReference","value":"Synthetic supplied record"}]'::jsonb,
      'reason','Record supplied evidence; not a shipment');
    result:=booking_api.fixture_approve_dangerous_goods(actor,company,job,proposal,case when mode='sea' then 'approve' else 'full' end);
    record_id:=(result->>'recordId')::uuid;
    source:=public.multideck_dexter_query_domain('booking_dangerous_goods',record_id::text,1)#>'{data,0}';
    if source->>'cargoId'<>cargo::text or source->>'sourceTable'<>'Job_CargoDangerousGoods'
      or source->'marinePollutant'<>'null'::jsonb or source->>'operatorEditable'<>'true' then raise exception 'DG sourced read failed';end if;
    result:=public.multideck_dexter_create_watch('booking_dangerous_goods','Supplied flag changes','Record changes','Watch supplied flag',
      record_id,'Model-authored incorrect label','{"field":"marinePollutant","operator":"changed"}');
    watcher:=(result->>'id')::uuid;
    if (select "AIDexterWatch_TargetLabel" from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher)<>source->>'targetLabel' then
      raise exception 'DG watch kept an unverified label';end if;
    proposal:=proposal||jsonb_build_object('record_id',record_id,'expected_updated_at',source->'bookingUpdatedAt',
      'expected_record_updated_at',source->'updatedAt','changes','[{"field":"marinePollutant","value":false}]'::jsonb);
    perform booking_api.fixture_approve_dangerous_goods(actor,company,job,proposal,'full');
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then
      raise exception 'DG unknown-to-No event did not fire once';end if;
    if not exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=watcher and "CommNotif_UserID"=actor
      and "CommNotif_Body" like '%not a compliance approval.%') then raise exception 'DG owner notification/copy missing';end if;
    perform public.booking_workflow_save_dangerous_goods(actor,job,booking_api.fixture_dg_payload(job,cargo,record_id,'{"notes":"Unrelated"}'));
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
    perform public.booking_workflow_save_dangerous_goods(actor,job,booking_api.fixture_dg_payload(job,cargo,record_id,'{"marinePollutant":true}'));
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Paused/unrelated DG event fired';end if;
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
    perform public.booking_workflow_save_dangerous_goods(actor,job,booking_api.fixture_dg_payload(job,cargo,record_id,'{"marinePollutant":null}'));
    perform public.booking_workflow_save_dangerous_goods(actor,job,booking_api.fixture_dg_payload(job,cargo,record_id,'{"marinePollutant":null}'));
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Resumed clear/no-op incorrect';end if;
  end loop;
  if jsonb_array_length(public.multideck_dexter_domain_booking_dangerous_goods(gen_random_uuid(),record_id::text,1))<>0 then
    raise exception 'Wrong workspace read DG';end if;
  begin perform public.multideck_dexter_create_watch('booking_dangerous_goods','Write','Invalid','Write',record_id,'Record',
    '{"field":"notes","operator":"changed"}','{}');raise exception 'DG autonomous watch accepted';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_create_watch('booking_dangerous_goods','Wrong','Invalid','Wrong',gen_random_uuid(),'Record',
    '{"field":"notes","operator":"changed"}');raise exception 'Unverified DG watch accepted';exception when insufficient_privilege then null;end;
  select count(*) into before_count from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher;
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_dangerous_goods','Job_CargoDangerousGoods',record_id,'{"marinePollutant":null}','{"marinePollutant":true}');
  if before_count<>(select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Revoked DG owner notified';end if;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  perform set_config('test.actor',other_actor::text,false);set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Other user read DG watch';end if;
  reset role;perform set_config('test.actor',actor::text,false);
  perform public.booking_workflow_save_dangerous_goods(actor,job,booking_api.fixture_dg_payload(job,cargo,record_id,'{"status":"voided"}'));
  begin perform public.multideck_dexter_create_watch('booking_dangerous_goods','Voided','Invalid','Voided',record_id,'Record',
    '{"field":"notes","operator":"changed"}');raise exception 'Voided DG watch accepted';exception when insufficient_privilege then null;end;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='booking_dangerous_goods'
    and "AIDexterWatch_HealthStatusCode"='error') then raise exception 'DG watch swallowed an error';end if;
  if before_quotes is distinct from (select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" v)
    or before_routes is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r) then
    raise exception 'DG Dexter lifecycle changed Quote or route evidence';end if;
  perform set_config('test.dg_watch',watcher::text,false);
end $dg_dexter$;
select set_config('test.booking_access','off',false);
do $denied$
begin
  begin perform public.multideck_dexter_query_domain('booking_dangerous_goods','TEST1',25);raise exception 'Revoked DG read accepted';exception when insufficient_privilege then null;end;
  if exists(select 1 from jsonb_array_elements(public.multideck_dexter_list_watches()) row where row->>'capability'='booking_dangerous_goods') then
    raise exception 'Revoked DG watch list leaked';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='booking_dangerous_goods') then raise exception 'Revoked DG watch RLS leaked';end if;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=current_setting('test.dg_watch')::uuid) then
    raise exception 'Revoked DG watch history leaked';end if;
  reset role;
end $denied$;
select set_config('test.booking_access','on',false);
`
