import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = (name) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
function functionSql(source, name) {
  const start = source.indexOf(`create or replace function ${name}(`)
  assert.ok(start >= 0, name)
  const end = source.indexOf('$$;', source.indexOf('as $$', start))
  assert.ok(end >= start, name)
  return source.slice(start, end + 3)
}

// Used only inside the disposable PostgreSQL fixture. Real save, measurements,
// domain dispatch, watch creation, evaluation, tables and owner RLS are exercised.
// Auth/permission resolution, unrelated domains and the broad workspace read are
// isolated fixtures, not proof of deployed tenant Auth/RLS or an AI conversation.
export function cargoDexterFixture(table) {
  const watches = migration('20260802140000_dexter_watching_for_you')
  const security = migration('20260816120000_dexter_security_hardening')
  const measurements = migration('20260902153715_booking_multi_leg_routes_and_cargo_dimensions')
  return `
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    alter table public."cmp_Users" add primary key ("User_ID");
    create table public."cmp_Company"("Company_ID" uuid primary key);
    insert into public."cmp_Company" select distinct "Company_ID" from public."cmp_Users";
    ${watches.slice(0, watches.indexOf('insert into public."sys_AIDexterWatchCapabilities"'))}
    alter table public."AI_DexterWatches"
      add "AIDexterWatch_HealthStatusCode" text default 'starting',
      add "AIDexterWatch_LastSourceCheckAt" timestamptz,
      add "AIDexterWatch_LastHealthError" text;
    ${table('sys_AIDexterDataDomains')}
    ${table('sys_AIDexterActions')}
    alter table public."sys_AIDexterActions" add "AIDexterAction_AlwaysRequiresApproval" boolean not null default false;
    alter table public."sys_AIDexterDataDomains" add primary key("AIDexterDomain_Code");
    alter table public."sys_AIDexterActions" add primary key("AIDexterAction_Code");
    ${security.slice(security.indexOf('alter table public."sys_AIDexterDataDomains"'), security.indexOf('-- Provider email effects'))}
    ${table('Comm_Notifications')}
    create function public._multideck_dexter_context() returns table(user_id uuid, company_id uuid)
      language sql stable as $$select "User_ID","Company_ID" from public."cmp_Users" where "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active'$$;
    create function public._multideck_dexter_has_permissions(uuid,jsonb) returns boolean language sql stable as $$
      select exists(select 1 from public."cmp_Users" u where u."User_ID"=$1 and u."User_AccessStatus"='active'
        and booking_api.has_permission(u."Auth_User_ID",'Bookings.Read'))$$;
    create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
    create function public._multideck_crm_deal_is_operator_visible(uuid,uuid) returns boolean language sql as $$select false$$;
    create function booking_api.customs_access(uuid,uuid,boolean) returns boolean language sql as $$select false$$;
    create table public."OPS_UserTasks"("TodoTask_ID" uuid,"TodoTask_CompanyID" uuid,"TodoTask_OwnerUserID" uuid,"TodoTask_IsDeleted" boolean);
    ${functionSql(security, 'public.multideck_dexter_query_domain')}
    ${functionSql(watches, 'public.multideck_dexter_list_watches')}
    ${functionSql(migration('20260820151500_job_customs_dexter_parity'), 'public.multideck_dexter_create_watch')}
    ${functionSql(watches, 'public._multideck_dexter_watch_matches')}
    ${functionSql(migration('20260802150818_dexter_email_watch_reliability'), 'public._multideck_dexter_evaluate_watch_signal')}
    create trigger evaluate_watch after insert on public."AI_DexterWatchSignals"
      for each row execute function public._multideck_dexter_evaluate_watch_signal();
    create schema private;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
    create function public._multideck_dexter_can_manage(uuid) returns boolean language sql stable as $$select booking_api.has_permission($1,'Bookings.Write')$$;
    create table public."AI_Conversations"("AICNV_ID" uuid primary key,"AICNV_CompanyID" uuid,"AICNV_OwnerUserID" uuid,"AICNV_Channel" text,"AICNV_EndedAt" timestamptz);
    ${table('AI_DexterActionAudit')}
    ${security.slice(security.indexOf('create table if not exists public."AI_DexterConversationGrants"'), security.indexOf('alter table public."AI_DexterConversationGrants" enable row level security'))}
    alter table public."AI_DexterPreparedActions" add "AIDexterPrepared_ApprovedAt" timestamptz;
    ${functionSql(security, 'public._multideck_dexter_deny_prepared_action')}
    ${functionSql(security, 'public.multideck_dexter_execute_prepared_action')}
    revoke all on function public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid) from public,anon,authenticated;
    grant execute on function public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid) to service_role;
    ${functionSql(migration('20260830230000_security_scan_high_risk_hardening'), 'public.multideck_dexter_approve_prepared_action')}
    ${migration('20260906171016_dexter_approval_request_role_compatibility')}
    ${functionSql(migration('20260831001000_security_scan_mandatory_approval_registry_fallback'), 'private.multideck_dexter_guard_mandatory_approval')}
    create trigger mandatory_approval before update on public."AI_DexterPreparedActions"
      for each row execute function private.multideck_dexter_guard_mandatory_approval();
    ${functionSql(measurements, 'booking_api.save_booking_cargo_measurements')}
    create function booking_api.workspace_extended(uuid,text) returns jsonb language sql stable as $$
      select jsonb_build_object('booking',jsonb_build_object('jobId',j."Job_ID",'updatedAt',j."Job_UpdatedAt"),
        'cargo',(select jsonb_agg(booking_api.cargo_public_values(c) || jsonb_build_object(
          'declaredValue',c."JobCargo_DeclaredValueAmount",'declaredValueCurrency',c."JobCargo_DeclaredValueCurrencyCodeSnapshot")
          order by c."JobCargo_LineNo") from public."Job_Cargo" c where c."JobCargo_JobID"=j."Job_ID" and not c."JobCargo_IsDeleted"))
      from public."Job_Header" j where j."Job_BookingReference"=$2
    $$;
    create function public.booking_workflow_save(uuid,uuid,jsonb) returns jsonb language plpgsql as $$begin
      perform booking_api.save_booking($1,$2,$3);
      perform booking_api.save_booking_cargo_measurements($1,$2,$3);
      return booking_api.workspace_extended($1,(select "Job_BookingReference" from public."Job_Header" where "Job_ID"=$2));
    end;$$;
  `
}

export const cargoDexterMigration = migration('20260905112211_dexter_booking_cargo_parity')
// workspace_extended references the pure projection before the complete migration.
export const cargoProjection = functionSql(cargoDexterMigration, 'booking_api.cargo_public_values')

export const cargoDexterAssertions = `
do $test$
declare
  actor uuid := '10000000-0000-4000-8000-000000000001';
  company uuid; office uuid; job uuid; line1 uuid; line2 uuid; other_job uuid;
  other_company uuid := gen_random_uuid(); other_user uuid := gen_random_uuid(); other_office uuid := gen_random_uuid(); other_line uuid;
  result jsonb; proposal jsonb; watcher uuid; threshold_watch uuid; before_count integer; before_audit integer;
  baseline_first jsonb; bad jsonb; prior_stamp timestamptz;
  mode_value text; session_id uuid; intent_id uuid; grant_id uuid; prepared_id uuid; before_execution integer;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Office_ID" into office from public."cmp_Offices" where "Company_ID"=company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  select "JobCargo_ID" into line1 from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted" order by "JobCargo_LineNo" limit 1;
  select "JobCargo_ID" into line2 from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted" order by "JobCargo_LineNo" offset 1 limit 1;
  insert into public."cmp_Company" values(other_company);
  insert into public."cmp_Users" values(other_user,other_company,other_user,'active');
  insert into public."cmp_Offices" values(other_office,other_company);
  update public."Job_Header" set "Job_OfficeID"=other_office where "Job_ID"=other_job;
  select "JobCargo_ID" into other_line from public."Job_Cargo" where "JobCargo_JobID"=other_job limit 1;
  perform set_config('test.actor',actor::text,false);
  if has_function_privilege('anon','public.multideck_dexter_action_update_booking_cargo(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.multideck_dexter_action_update_booking_cargo(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.multideck_dexter_domain_booking_cargo(uuid,text,integer)','execute') then
    raise exception 'Direct cargo helper exposed to browser roles'; end if;
  result := public.multideck_dexter_query_domain('booking_cargo','TEST1',25)->'data';
  if jsonb_array_length(result)<>2 or result->0 ? 'declaredValue' or result->0 ? 'cargoData' then
    raise exception 'Cargo domain cardinality or financial boundary incorrect'; end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_cargo(company,other_line::text,25))<>0 then
    raise exception 'Foreign cargo read leaked'; end if;
  select to_jsonb(c) into baseline_first from public."Job_Cargo" c where "JobCargo_ID"=line1;
  update public."Job_Cargo" set "JobCargo_DeclaredValueAmount"=500,"JobCargo_DeclaredValueCurrencyCodeSnapshot"='GBP' where "JobCargo_ID"=line2;
  -- now() is fixed within a transaction; set a historical timestamp to prove staleness.
  update public."Job_Header" set "Job_UpdatedAt"=now()-interval '1 day' where "Job_ID"=job;
  select "Job_UpdatedAt" into prior_stamp from public."Job_Header" where "Job_ID"=job;
  proposal := jsonb_build_object('target_id',job,'cargo_id',line2,'expected_updated_at',prior_stamp,
    'field','grossWeightKg','value','42','reason','Customer corrected the packing list');
  result := public.multideck_dexter_create_watch('booking_cargo','Weight changed','Cargo watch','Watch weight',line2,'TEST1 cargo 2','{"field":"grossWeightKg","operator":"changed"}');
  watcher := (result->>'id')::uuid;
  result := public.multideck_dexter_action_update_booking_cargo(company,actor,proposal);
  if (result->>'after')::numeric<>42 or result->>'recordId'<>line2::text or result->>'updatedAt' is null then raise exception 'Wrong cargo updated or missing evidence: %',result; end if;
  if (select "JobCargo_DeclaredValueAmount" from public."Job_Cargo" where "JobCargo_ID"=line2)<>500 then raise exception 'Commercial field lost'; end if;
  if (select "JobCargo_Description" from public."Job_Cargo" where "JobCargo_ID"=line1) is distinct from baseline_first->>'JobCargo_Description' then raise exception 'First line overwritten'; end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'First change missing or duplicated'; end if;
  begin
    perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal);
    raise exception 'Stale approval accepted';
  exception when serialization_failure then null; end;
  proposal := proposal || jsonb_build_object('expected_updated_at',result->>'updatedAt');
  select count(*) into before_audit from booking_api.events;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('cargo_id',other_line),jsonb_build_object('target_id',other_job),
    '{"field":"sellPrice"}'::jsonb,'{"field":"grossWeightKg","value":"-1"}',
    '{"field":"grossWeightKg","value":"NaN"}','{"field":"grossWeightKg","value":"Infinity"}',
    '{"field":"description","value":null}','{"field":"isHazardous","value":null}',
    '{"field":"countryOfOrigin","value":"UKK"}','{"field":"lengthUnit","value":"feet"}',
    '{"unexpected":true}','{"value":42}','{"reason":""}')) loop
    begin
      perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || bad);
      raise exception 'Invalid proposal accepted: %',bad;
    exception when insufficient_privilege or invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.multideck_dexter_action_update_booking_cargo(company,other_user,proposal);
    raise exception 'Foreign actor accepted';
  exception when insufficient_privilege then null; end;
  if before_audit<>(select count(*) from booking_api.events) then raise exception 'Rejected action mutated audit'; end if;
  result := public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"43"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Second distinct change suppressed'; end if;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"43"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'No-op notified'; end if;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"field":"length","value":"25"}');
  if (select "JobCargo_Length" from public."Job_Cargo" where "JobCargo_ID"=line2)<>25 then raise exception 'Typed dimension not saved'; end if;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"field":"length","value":null}');
  if (select "JobCargo_Length" from public."Job_Cargo" where "JobCargo_ID"=line2) is not null then raise exception 'Clear ignored'; end if;
  result := public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"field":"countryOfOrigin","value":"gb"}');
  if result->>'after'<>'GB' then raise exception 'Normalised result incorrect'; end if;
  perform set_config('request.jwt.claim.role','service_role',false);
  foreach mode_value in array array['approve','full'] loop
    session_id:=gen_random_uuid(); grant_id:=null;
    if mode_value='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;
    end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256",
      "AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["update_booking_cargo"]','freight',mode_value,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID",
      "AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID",
      "AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'update_booking_cargo',proposal || jsonb_build_object('field','commodity','value',mode_value),job,
        'Update cargo commodity','Explicit proposal',mode_value,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into before_execution from booking_api.events;
    begin
      result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if coalesce((result->>'updated')::boolean,false) then raise exception 'Executor accepted unapproved cargo action'; end if;
    exception when insufficient_privilege then null; end;
    if before_execution<>(select count(*) from booking_api.events) then raise exception 'Unapproved executor mutated cargo'; end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Cannot approve pending cargo action'; end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated' is distinct from 'true' or result#>>'{result,after}'<>mode_value then raise exception 'Approved executor failed: %',result; end if;
    select count(*) into before_execution from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed' is distinct from 'true' or before_execution<>(select count(*) from booking_api.events) then raise exception 'Retry repeated cargo mutation'; end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,other_company,other_user,null);
    if result#>>'{error,code}' is distinct from 'prepared_action_unavailable' then raise exception 'Cross-scope prepared action accessible'; end if;
  end loop;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"44"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Paused watch fired'; end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"45"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'Resumed watch silent'; end if;
  result := public.multideck_dexter_create_watch('booking_cargo','Threshold','Watch','Watch',line2,'Cargo 2','{"field":"grossWeightKg","operator":"gt","value":"100"}');
  threshold_watch := (result->>'id')::uuid;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"46"}');
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=threshold_watch) then raise exception 'Nonmatching threshold fired'; end if;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"100.01"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=threshold_watch)<>1 then raise exception 'Matching decimal threshold silent'; end if;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal || '{"value":"100.01"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=threshold_watch)<>1 then raise exception 'Decimal no-op notified'; end if;
  select count(*) into before_count from public."AI_DexterWatchEvents";
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  update public."Job_Cargo" set "JobCargo_GrossKilos"=200 where "JobCargo_ID"=line2;
  if before_count<>(select count(*) from public."AI_DexterWatchEvents") then raise exception 'Revoked owner notified'; end if;
  begin
    perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal);
    raise exception 'Revoked owner wrote';
  exception when insufficient_privilege then null; end;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  -- A current owner must be able to read before testing the revoked-role case.
  grant select on public."cmp_Users" to authenticated;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Owner history inaccessible'; end if;
  reset role;
  create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
  if jsonb_array_length(public.multideck_dexter_list_watches())<>0 then raise exception 'Privileged list leaked after permission loss'; end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches") or exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'History leaked after permission loss'; end if;
  reset role;
  create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select $1 = '10000000-0000-4000-8000-000000000001'::uuid$$;
  begin
    perform public.multideck_dexter_create_watch('booking_cargo','Bad','Bad','Bad',other_line,'Other','{"field":"description","operator":"changed"}');
    raise exception 'Foreign watch target accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.multideck_dexter_create_watch('booking_cargo','Bad','Bad','Bad',line2,'Cargo','{"field":"description","operator":"changed"}','{"action":"update_booking_cargo"}');
    raise exception 'Watch mutation accepted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Watch evaluator swallowed an error'; end if;
  if not exists(select 1 from booking_api.events where event_type='dexter_cargo_updated' and metadata->>'reason'='Customer corrected the packing list' and actor_user_id=actor) then raise exception 'Approved reason audit missing'; end if;
  if exists(select 1 from public."Comm_Notifications" where "CommNotif_UserID"<>actor)
    or not exists(select 1 from public."Comm_Notifications" where "CommNotif_LinkTypeCode"='dexter_watch') then raise exception 'Notification ownership/routing incorrect'; end if;
  -- Exercise the actual owner RLS using a second authenticated identity.
  grant select on public."cmp_Users" to authenticated;
  perform set_config('test.actor',other_user::text,false);
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches") or exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Other owner read watch history'; end if;
  reset role;
end $test$;
`
