import { readFileSync } from 'node:fs'
export const chargeableDexterFixture = readFileSync(new URL('../migrations/20260907125533_dexter_chargeable_weight_parity.sql',import.meta.url),'utf8') + `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;cargo uuid;
  proposal jsonb;result jsonb;watcher uuid;mode_value text;wanted text;event_count bigint;audit_count bigint;
  session_id uuid;grant_id uuid;intent_id uuid;prepared_id uuid;
begin
  perform set_config('test.actor',actor::text,false);
  perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "JobCargo_ID" into cargo from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted";
  result:=public.multideck_dexter_create_watch('booking_cargo','Chargeable changed','Internal test','Watch line',cargo,'Test cargo','{"field":"chargeableWeightKg","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  foreach mode_value in array array['approve','full'] loop
    wanted:=case when mode_value='approve' then '12.1234567890123456789' else '13.1234567890123456789' end;
    proposal:=jsonb_build_object('target_id',job,'cargo_id',cargo,'expected_updated_at',
      (select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job),
      'field','chargeableWeightKg','value',wanted,'reason','Synthetic exact weight correction');
    session_id:=gen_random_uuid();grant_id:=null;
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
      values(company,actor,session_id,intent_id,grant_id,'update_booking_cargo',proposal,job,'Chargeable weight','Explicit test proposal',mode_value,now()+interval '20 minutes')
      returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into audit_count from booking_api.events;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved chargeable action executed';end if;
    exception when insufficient_privilege then null;end;
    if audit_count<>(select count(*) from booking_api.events) then raise exception 'Unapproved action mutated audit';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated'<>'true' or result#>>'{result,after}'<>wanted then raise exception 'Approved exact weight failed: %',result;end if;
    result:=public.multideck_dexter_query_domain('booking_cargo',cargo::text,25)->'data'->0;
    if result->>'chargeableWeightKg'<>wanted or jsonb_typeof(result->'chargeableWeightKg')<>'string'
      or result ? 'declaredValue' then raise exception 'Cargo read precision/access boundary failed';end if;
    select count(*) into audit_count from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed'<>'true' or audit_count<>(select count(*) from booking_api.events) then raise exception 'Approved replay duplicated mutation';end if;
  end loop;
  select count(*) into event_count from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher;
  if event_count<>2 then raise exception 'Chargeable changes missing or duplicated';end if;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal);
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal||'{"field":"description","value":"Unrelated description"}');
  if event_count<>(select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'No-op/unrelated change fired watch';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal||'{"value":"14"}');
  if event_count<>(select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Paused watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal||'{"value":null}');
  if event_count+1<>(select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Resumed clear not notified';end if;
  begin perform public.multideck_dexter_action_update_booking_cargo(company,gen_random_uuid(),proposal);
    raise exception 'Foreign actor allowed';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal||'{"value":"-1"}');
    raise exception 'Invalid chargeable value accepted';exception when invalid_parameter_value then null;end;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
end $test$;
`
