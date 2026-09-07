import { readFileSync } from 'node:fs'
export const weightOverrideDexterFixture = readFileSync(new URL('../migrations/20260907131646_dexter_shipment_weight_override_parity.sql',import.meta.url),'utf8') + `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;proposal jsonb;result jsonb;watcher uuid;
  session_id uuid;grant_id uuid;intent_id uuid;prepared_id uuid;mode_value text;wanted text;events bigint;before_value text;
  before_cargo jsonb;before_quotes jsonb;
begin
  perform set_config('test.actor',actor::text,false);
  perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select jsonb_agg(to_jsonb(c)) into before_cargo from public."Job_Cargo" c where "JobCargo_JobID"=job;
  select jsonb_agg(to_jsonb(v)) into before_quotes from public."CusQuote_Versions" v;
  result:=public.multideck_dexter_create_watch('booking_shipment_value','Override changes','Internal test','Watch override',job,'TEST1','{"field":"chargeableWeightOverrideKg","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  foreach mode_value in array array['approve','full'] loop
    wanted:=case when mode_value='approve' then '12.1234567890123456789' else '13.1234567890123456789' end;
    proposal:=jsonb_build_object('target_id',job,'expected_updated_at',(select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job),'weightKg',wanted,'reason','Internal exact override test');
    session_id:=gen_random_uuid();grant_id:=null;
    if mode_value='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;
    end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["update_booking_weight_override"]','freight',mode_value,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'update_booking_weight_override',proposal,job,'Weight override','Explicit kg change',mode_value,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select "Job_EditableDetailsJSON"->>'chargeableWeightKg' into before_value from public."Job_Header" where "Job_ID"=job;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if result->>'updated'='true' then raise exception 'Unapproved override executed';end if;
    exception when insufficient_privilege then null;end;
    if (select "Job_EditableDetailsJSON"->>'chargeableWeightKg' from public."Job_Header" where "Job_ID"=job) is distinct from before_value then raise exception 'Unapproved override changed data';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Override approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated'<>'true' or result#>>'{result,after}'<>wanted then raise exception 'Approved override failed: %',result;end if;
    result:=public.multideck_dexter_query_domain('booking_shipment_value',job::text,1)#>'{data,0}';
    if result->>'chargeableWeightOverrideKg'<>wanted then raise exception 'Override domain read lost precision';end if;
    select count(*) into events from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed'<>'true' or events<>(select count(*) from booking_api.events) then raise exception 'Override replay mutated';end if;
  end loop;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Override watch changes missing or duplicated';end if;
  perform public.multideck_dexter_action_update_booking_weight_override(company,actor,proposal);
  perform public.booking_workflow_save(actor,job,'{"editableDetails":{"customerReference":"Unrelated watch test"}}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'No-op or unrelated override watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_weight_override(company,actor,proposal||'{"weightKg":"14"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Paused override watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_weight_override(company,actor,proposal||'{"weightKg":null}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'Resumed override clear missing';end if;
  begin perform public.multideck_dexter_action_update_booking_weight_override(company,gen_random_uuid(),proposal);raise exception 'Foreign actor allowed';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_update_booking_weight_override(company,actor,proposal||'{"weightKg":"-1"}');raise exception 'Negative override allowed';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_action_update_booking_weight_override(company,actor,proposal||jsonb_build_object('expected_updated_at','2000-01-01T00:00:00Z'));raise exception 'Stale override allowed';exception when serialization_failure then null;end;
  if (select jsonb_agg(to_jsonb(c)) from public."Job_Cargo" c where "JobCargo_JobID"=job) is distinct from before_cargo
    or (select jsonb_agg(to_jsonb(v)) from public."CusQuote_Versions" v) is distinct from before_quotes then raise exception 'Override changed cargo or Quote';end if;
  if has_function_privilege('authenticated','public.multideck_dexter_action_update_booking_weight_override(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Override action exposed';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
end $test$;
`
