import { readFileSync } from 'node:fs'
const migration = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')

// Extends the existing disposable stable-items fixture. Identity/permission
// resolution and the old broad workspace assembly remain explicit test doubles.
// Actual stable upsert, numeric gate, domain dispatch, approval executor, watch
// creation/evaluator, notifications and owner/history RLS run in PostgreSQL.
export const containerDexterFixture = `
  alter function booking_api.save_before_cargo_decimals_20260905(uuid,uuid,jsonb) rename to save_before_goods_value_20260905;
  create function booking_api.save_before_cargo_decimals_20260905(uuid,uuid,jsonb) returns jsonb language sql as $$
    select booking_api.save_before_goods_value_20260905($1,$2,$3)$$;
  revoke all on function booking_api.save_before_cargo_decimals_20260905(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
  -- The reduced original assembly gains equipment using the real API key shape.
  alter function booking_api.workspace_before_cargo_decimals_20260905(uuid,text) rename to fixture_workspace_before_containers;
  create function booking_api.workspace_before_cargo_decimals_20260905(uuid,text) returns jsonb language sql stable as $$
    select booking_api.fixture_workspace_before_containers($1,$2)||jsonb_build_object('containers',coalesce((
      select jsonb_agg(jsonb_build_object('id',c."JobContainers_ID",'number',c."JobContainer_Number",
        'type',c."JobContainer_TypeCodeSnapshot",'equipmentKind',c."JobContainer_EquipmentKind",'status',c."JobContainer_Status",
        'grossWeightKg',c."JobContainer_GrossKilos"::text,'data',c."JobContainer_JSON") order by c."JobContainers_ID")
      from public."Job_Containers" c join public."Job_Header" j on j."Job_ID"=c."Job_ID"
      where j."Job_BookingReference"=$2 and not c."JobContainer_IsDeleted"),'[]'::jsonb))$$;
  ${migration('20260905201222_booking_container_operational_values')}
  ${migration('20260905205443_dexter_booking_container_parity')}
`

export const containerDexterAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;container_id uuid;other_container uuid;
  other_actor uuid;other_company uuid;foreign_container uuid;watcher uuid;threshold_watch uuid;result jsonb;proposal jsonb;bad jsonb;
  before_count integer;before_audit integer;before_rows jsonb;mode_value text;session_id uuid;intent_id uuid;grant_id uuid;prepared_id uuid;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "User_ID","Company_ID" into other_actor,other_company from public."cmp_Users" where "Company_ID"<>company limit 1;
  perform set_config('test.actor',actor::text,false);
  select "JobContainers_ID" into foreign_container from public."Job_Containers" c
    join public."Job_Header" j on j."Job_ID"=c."Job_ID" where j."Job_BookingReference"='TEST2';
  perform public.booking_workflow_save(actor,job,'{"containers":[{"number":"FIRST","type":"20GP","grossWeightKg":"10"},{"number":"SECOND","type":"40RF","grossWeightKg":"20","verifiedGrossMassKg":"30","reeferSetPoint":"-18","reeferUnit":"C"}]}');
  select "JobContainers_ID" into container_id from public."Job_Containers" where "Job_ID"=job and "JobContainer_Number"='SECOND' and not "JobContainer_IsDeleted";
  select "JobContainers_ID" into other_container from public."Job_Containers" where "Job_ID"=job and "JobContainer_Number"='FIRST' and not "JobContainer_IsDeleted";
  update public."Job_Containers" set "JobContainer_JSON"="JobContainer_JSON"||'{"supplierCost":123,"verifiedGrossMassKg":"999","unexposed":"keep"}' where "JobContainers_ID"=container_id;
  result:=public.multideck_dexter_query_domain('booking_containers','SECOND',25)->'data';
  if jsonb_array_length(result)<>1 or result#>>'{0,recordId}'<>container_id::text
    or result#>>'{0,verifiedGrossMassKg}'<>'30.000000' or result->0 ?| array['supplierCost','data','JobContainer_JSON'] then
    raise exception 'Container evidence, cardinality or private boundary incorrect: %',result;end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_containers(company,foreign_container::text,25))<>0 then raise exception 'Foreign container read leaked';end if;
  proposal:=jsonb_build_object('target_id',job,'container_id',container_id,'expected_updated_at',result#>>'{0,updatedAt}',
    'expected_container_updated_at',result#>>'{0,containerUpdatedAt}','field','verifiedGrossMassKg','value','123456789012.123456','reason','Verified weighing evidence');
  result:=public.multideck_dexter_create_watch('booking_containers','VGM changed','Container watch','Watch VGM',container_id,'SECOND','{"field":"verifiedGrossMassKg","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  result:=public.multideck_dexter_action_update_booking_container(company,actor,proposal);
  if result->>'after'<>'123456789012.123456' or result->>'recordId'<>container_id::text then raise exception 'Exact approved value lost: %',result;end if;
  if (select "JobContainer_GrossKilos" from public."Job_Containers" where "JobContainers_ID"=other_container)<>10
    or (select "JobContainer_JSON"->>'unexposed' from public."Job_Containers" where "JobContainers_ID"=container_id)<>'keep' then raise exception 'Unselected evidence changed';end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'First container event missing/duplicated';end if;
  proposal:=proposal||jsonb_build_object('expected_updated_at',result->>'updatedAt','expected_container_updated_at',result->>'containerUpdatedAt');
  select count(*) into before_audit from booking_api.events;
  select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") into before_rows from public."Job_Containers" c;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('container_id',foreign_container),'{"field":"supplierCost"}'::jsonb,'{"value":"1.0000001"}',
    '{"value":"NaN"}','{"value":"1,00"}','{"value":"-1"}','{"value":true}','{"field":"vgmMethod","value":"3"}',
    '{"field":"reeferUnit","value":"K"}','{"reason":""}','{"unexpected":true}',
    '{"expected_updated_at":"2000-01-01T00:00:00Z"}','{"expected_container_updated_at":"2000-01-01T00:00:00Z"}')) loop
    begin perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||bad);raise exception 'Invalid container proposal accepted: %',bad;
    exception when insufficient_privilege or invalid_parameter_value or serialization_failure then null;end;
  end loop;
  begin perform public.multideck_dexter_action_update_booking_container(company,other_actor,proposal);raise exception 'Foreign actor edited';exception when insufficient_privilege then null;end;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") from public."Job_Containers" c)
    or before_audit<>(select count(*) from booking_api.events) then raise exception 'Rejected proposal mutated state/audit';end if;
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"40"}');
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"40.000000"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Distinct change suppressed or no-op notified';end if;
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"field":"reeferSetPoint","value":"-20.125"}');
  result:=public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"field":"reeferUnit","value":null}');
  if result->'after' is distinct from 'null'::jsonb then raise exception 'Explicit unit clear ignored';end if;
  result:=public.multideck_dexter_create_watch('booking_containers','Threshold','VGM threshold','Watch VGM',container_id,'SECOND','{"field":"verifiedGrossMassKg","operator":"gt","value":"100"}');
  threshold_watch:=(result->>'id')::uuid;
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"50"}');
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=threshold_watch) then raise exception 'Nonmatching threshold fired';end if;
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"100.000001"}');
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"101"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=threshold_watch)<>1 then raise exception 'Threshold edge semantics changed';end if;
  select count(*) into before_count from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"102"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count then raise exception 'Paused container watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_container(company,actor,proposal||'{"value":"103"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count+1 then raise exception 'Resumed container watch silent';end if;
  select count(*) into before_count from public."AI_DexterWatchEvents";
  update public."Job_Containers" set "JobContainer_VGMKilos"=900 where "JobContainers_ID"=other_container;
  if before_count<>(select count(*) from public."AI_DexterWatchEvents") then raise exception 'Unselected container triggered watch';end if;
  -- A source-only update must also invalidate approval, even if the job stamp stays fixed.
  update public."Job_Containers" set "JobContainer_UpdatedAt"=now()-interval '1 second' where "JobContainers_ID"=container_id;
  begin perform public.multideck_dexter_action_update_booking_container(company,actor,proposal);raise exception 'Source-only stale proposal executed';exception when serialization_failure then null;end;
  update public."Job_Containers" set "JobContainer_UpdatedAt"=(proposal->>'expected_container_updated_at')::timestamptz where "JobContainers_ID"=container_id;
  -- Real prepare/approve/execute boundary in both access modes, with retry deduplication.
  perform set_config('request.jwt.claim.role','service_role',false);
  foreach mode_value in array array['approve','full'] loop
    session_id:=gen_random_uuid();grant_id:=null;
    if mode_value='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256",
      "AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["update_booking_container"]','freight',mode_value,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID",
      "AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title",
      "AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'update_booking_container',proposal||jsonb_build_object('field','vgmMethod','value',case when mode_value='full' then '2' else '1' end),job,
        'Record weighing method','Verified evidence',mode_value,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into before_audit from booking_api.events;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved container action executed';end if;
    exception when insufficient_privilege then null;end;
    if before_audit<>(select count(*) from booking_api.events) then raise exception 'Unapproved action changed audit';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated' is distinct from 'true' then raise exception 'Approved container execution failed: %',result;end if;
    select count(*) into before_audit from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed' is distinct from 'true' or before_audit<>(select count(*) from booking_api.events) then raise exception 'Retry repeated mutation';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,other_company,other_actor,null);
    if result#>>'{error,code}' is distinct from 'prepared_action_unavailable' then raise exception 'Cross-scope proposal accessible';end if;
  end loop;
  begin perform public.multideck_dexter_create_watch('booking_containers','Bad','Bad','Bad',foreign_container,'Other','{"field":"vgmMethod","operator":"changed"}');raise exception 'Foreign watch allowed';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_containers','Bad','Bad','Bad',null,'All','{"field":"vgmMethod","operator":"changed"}');raise exception 'Untargeted watch allowed';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_containers','Bad','Bad','Bad',container_id,'SECOND','{"field":"vgmMethod","operator":"changed"}','{"action":"update_booking_container"}');raise exception 'Autonomous watch edit allowed';exception when insufficient_privilege then null;end;
  select count(*) into before_count from public."AI_DexterWatchEvents";
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  update public."Job_Containers" set "JobContainer_VGMKilos"=200 where "JobContainers_ID"=container_id;
  if before_count<>(select count(*) from public."AI_DexterWatchEvents") then raise exception 'Revoked owner notified';end if;
  begin perform public.multideck_dexter_action_update_booking_container(company,actor,proposal);raise exception 'Revoked actor edited';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  if not exists(select 1 from booking_api.events where event_type='dexter_container_updated' and actor_user_id=actor and metadata->>'reason'='Verified weighing evidence') then raise exception 'Approved reason audit missing';end if;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Watch evaluator swallowed error';end if;
  if not exists(select 1 from public."Comm_Notifications" where "CommNotif_UserID"=actor and "CommNotif_LinkTypeCode"='dexter_watch') then raise exception 'Notification missing';end if;
  if has_function_privilege('authenticated','public.multideck_dexter_domain_booking_containers(uuid,text,integer)','execute')
    or has_function_privilege('anon','public.multideck_dexter_action_update_booking_container(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.multideck_dexter_action_update_booking_container(uuid,uuid,jsonb)','execute') then raise exception 'Private adapter exposed';end if;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Current owner cannot read container history';end if;
  reset role;
  perform set_config('test.actor',other_actor::text,false);
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches") or exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Other user read container history';end if;
  reset role;
  perform set_config('test.actor',actor::text,false);
end $test$;
-- Permission loss precedes a fresh request, rather than redefining an inlined
-- SQL permission helper midway through the same cached PL/pgSQL request.
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
do $denial$
begin
  begin perform public.multideck_dexter_query_domain('booking_containers','SECOND',25);raise exception 'Domain read allowed after permission loss';exception when insufficient_privilege then null;end;
  if jsonb_array_length(public.multideck_dexter_list_watches())<>0 then raise exception 'Privileged watch list leaked after revocation';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches") or exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Watch history leaked after revocation';end if;
  reset role;
end $denial$;
`
