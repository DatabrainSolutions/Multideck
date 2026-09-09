import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const original = read('20260820150000_booking_quote_customer_response')
const start = original.indexOf('create or replace function booking_api.normalise_mode(')
assert.ok(start >= 0)
const normalise = original.slice(start, original.indexOf('\n$$;', start) + 4)

// Extends the existing disposable SQL lifecycle with the real active dictionary,
// preparation trigger and mode action. Auth/broad workspace remain explicit fixtures.
export function routeModeDexterFixture(table) {
  return `
  create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$
    select $1='10000000-0000-4000-8000-000000000001'::uuid$$;
  ${table('sys_JobTransportModes')}
  insert into public."sys_JobTransportModes"("JTM_Code","JTM_Name","JTM_IsActive") values
    ('sea','Sea',true),('air','Air freight',true),('road','Road',true),('rail','Rail',true),
    ('multimodal','Multimodal',true),('retired','Retired service',false);
  ${normalise}
  ${read('20260905212002_dexter_route_mode_approval')}
  `
}

export const routeModeDexterAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;route uuid;foreign_route uuid;
  other_actor uuid;other_company uuid;session_id uuid;intent_id uuid;grant_id uuid;prepared_id uuid;watcher uuid;
  proposal jsonb;review jsonb;result jsonb;bad jsonb;before_refs jsonb;old_mode text;target_mode text;access_mode text;
  before_rows jsonb;before_target jsonb;before_job jsonb;before_cargo jsonb;before_containers jsonb;before_audit integer;case_name text;
  card public."AI_DexterPreparedActions";column_name text;watch_count integer:=0;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID","Company_ID" into other_actor,other_company from public."cmp_Users" where "Company_ID"<>company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "JobRoute_ID" into route from public."Job_Routing" where "Job_ID"=job and "JobRoute_OrderNo"=1;
  select "JobRoute_ID" into foreign_route from public."Job_Routing" where "Job_ID"<>job limit 1;
  perform set_config('test.actor',actor::text,false);
  perform set_config('request.jwt.claim.role','service_role',false);
  result:=public.multideck_dexter_create_watch('booking_routes','Mode review changed','Mode watch','Watch mode',route,'First leg','{"field":"mode","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  foreach case_name in array array['approve','full','references_stale','timestamp_stale','declined','expired'] loop
    update public."Job_Routing" set "JobRoute_TrailerNumber"='MODE-TRAILER',"JobRoute_MasterTransportReference"='MASTER-'||case_name,
      "JobRoute_HouseTransportReference"='HOUSE-'||case_name,"JobRoute_CarrierBookingReference"='CARRIER-'||case_name,
      "JobRoute_TransportMeansName"='SERVICE-'||case_name where "JobRoute_ID"=route;
    select "JobRoute_ModeCode" into old_mode from public."Job_Routing" where "JobRoute_ID"=route;
    target_mode:=case when old_mode='sea' then 'air' else 'sea' end;
    proposal:=jsonb_build_object('target_id',job,'route_id',route,
      'expected_updated_at',(select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job),
      'expected_route_updated_at',(select "JobRoute_UpdatedAt" from public."Job_Routing" where "JobRoute_ID"=route),
      'mode',case when target_mode='air' then ' AIR FREIGHT ' else 'SEA' end,'reason','Operator confirmed a new transport service',
      'mode_review','{"fromMode":"invented","beforeReferences":{}}'::jsonb,
      '_document_evidence',jsonb_build_object('type','uploaded_document_ocr','uploadId',gen_random_uuid(),'fileName','Revised service.pdf','target_id',foreign_route));
    review:=booking_api.dexter_route_mode_review(company,actor,proposal);
    before_refs:=review#>'{arguments,mode_review,beforeReferences}';
    if review#>>'{arguments,mode}'<>target_mode or review#>>'{arguments,mode_review,fromMode}'<>old_mode
      or jsonb_array_length(review->'changes')<>5 then raise exception 'Dictionary or review shape failed: %',review;end if;
    for bad in select value from jsonb_array_elements(jsonb_build_array(
      '{"mode":"retired"}'::jsonb,'{"mode":"made up"}','{"reason":""}','{"unexpected":true}','{"_document_evidence":true}',
      jsonb_build_object('route_id',foreign_route),jsonb_build_object('mode',old_mode),
      '{"expected_updated_at":"2000-01-01"}','{"expected_route_updated_at":"2000-01-01"}')) loop
      begin perform booking_api.dexter_route_mode_review(company,actor,proposal||bad);raise exception 'Invalid review accepted: %',bad;
      exception when insufficient_privilege or invalid_parameter_value or serialization_failure then null;end;
    end loop;
    begin perform booking_api.dexter_route_mode_review(company,other_actor,proposal);raise exception 'Foreign actor prepared mode change';exception when insufficient_privilege then null;end;
    session_id:=gen_random_uuid();grant_id:=null;access_mode:=case when case_name='full' then 'full' else 'approve' end;
    if access_mode='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["change_booking_route_mode"]','freight',access_mode,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    select count(*) into before_audit from booking_api.events;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_ChangesJSON","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'change_booking_route_mode',proposal,foreign_route,'Harmless change','Nothing is removed','[]',access_mode,now()+interval '20 minutes') returning * into card;
    prepared_id:=card."AIDexterPrepared_ID";
    if card."AIDexterPrepared_Title" is distinct from review->>'title'
      or card."AIDexterPrepared_Description" is distinct from review->>'description'
      or card."AIDexterPrepared_ChangesJSON" is distinct from review->'changes'
      or card."AIDexterPrepared_ArgumentsJSON" is distinct from review->'arguments'
      or card."AIDexterPrepared_TargetID"<>job
      or card."AIDexterPrepared_TargetJSON"->'recordIds'<>jsonb_build_array(job,route) then raise exception 'Model-supplied review/target escaped database binding';end if;
    foreach column_name in array array['AIDexterPrepared_Title','AIDexterPrepared_Description'] loop
      begin execute format('update public."AI_DexterPreparedActions" set %I=''Changed after review'' where "AIDexterPrepared_ID"=$1',column_name) using prepared_id;
        raise exception 'Review copy changed';exception when insufficient_privilege then null;end;
    end loop;
    begin update public."AI_DexterPreparedActions" set "AIDexterPrepared_ArgumentsJSON"=proposal where "AIDexterPrepared_ID"=prepared_id;
      raise exception 'Arguments tampered';exception when insufficient_privilege then null;end;
    begin update public."AI_DexterPreparedActions" set "AIDexterPrepared_ClientSessionID"=gen_random_uuid() where "AIDexterPrepared_ID"=prepared_id;
      raise exception 'Approval session moved';exception when insufficient_privilege then null;end;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved mode change executed';end if;
      exception when insufficient_privilege then null;end;
    if before_audit<>(select count(*) from booking_api.events) then raise exception 'Preparing/unapproved execution wrote operational data';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,other_company,other_actor,null);
    if result#>>'{error,code}' is distinct from 'prepared_action_unavailable' then raise exception 'Other owner accessed proposal';end if;
    if case_name='references_stale' then
      -- Deliberately unchanged source timestamp: reference binding must still fail.
      update public."Job_Routing" set "JobRoute_MasterTransportReference"='Changed after review' where "JobRoute_ID"=route;
    elsif case_name='timestamp_stale' then
      update public."Job_Routing" set "JobRoute_UpdatedAt"=now()-interval '1 second' where "JobRoute_ID"=route;
    elsif case_name='declined' then
      update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='declined' where "AIDexterPrepared_ID"=prepared_id;
    elsif case_name='expired' then
      update public."AI_DexterPreparedActions" set "AIDexterPrepared_ExpiresAt"=now()-interval '1 second' where "AIDexterPrepared_ID"=prepared_id;
    end if;
    select count(*) into before_audit from booking_api.events;
    select to_jsonb(r)-array['JobRoute_ModeCode','JobRoute_MasterTransportReference','JobRoute_HouseTransportReference',
      'JobRoute_CarrierBookingReference','JobRoute_TransportMeansName','JobRoute_RouteJSON','JobRoute_UpdatedAt','JobRoute_UpdatedBy']
      into before_target from public."Job_Routing" r where "JobRoute_ID"=route;
    select jsonb_agg(to_jsonb(r)-'JobRoute_UpdatedAt'-'JobRoute_UpdatedBy' order by "JobRoute_ID") into before_rows from public."Job_Routing" r where "Job_ID"=job and "JobRoute_ID"<>route;
    select to_jsonb(j)-'Job_UpdatedAt'-'Job_UpdatedBy' into before_job from public."Job_Header" j where "Job_ID"=job;
    select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_cargo from public."Job_Cargo" c;
    select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") into before_containers from public."Job_Containers" c;
    if case_name not in ('declined','expired') and not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Mode approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if case_name in ('approve','full') then
      if result->>'updated' is distinct from 'true' or result#>>'{result,after}'<>target_mode then raise exception 'Approved mode action failed: %',result;end if;
      if exists(select 1 from public."Job_Routing" where "JobRoute_ID"=route and ("JobRoute_ModeCode"<>target_mode
        or "JobRoute_MasterTransportReference" is not null or "JobRoute_HouseTransportReference" is not null
        or "JobRoute_CarrierBookingReference" is not null or "JobRoute_TransportMeansName" is not null
        or "JobRoute_RouteJSON" ? 'modeChangeReview')) then raise exception 'Mode/reset/one-use review failed';end if;
      if not exists(select 1 from booking_api.events where job_id=job and event_type='route_mode_changed'
        and metadata->>'routeId'=route::text and metadata->'beforeReferences'=before_refs and metadata->>'reviewed'='true'
        and metadata#>>'{previousTransport,trailerNumber}'='MODE-TRAILER') then raise exception 'Previous reference/transport history missing: %',
          (select jsonb_agg(metadata) from booking_api.events where job_id=job and event_type='route_mode_changed' and metadata->>'routeId'=route::text);end if;
      if not exists(select 1 from booking_api.events where event_type='dexter_route_mode_changed' and actor_user_id=actor
        and metadata->>'reason'=proposal->>'reason') then raise exception 'Approved reason/actor missing';end if;
      watch_count:=watch_count+1;
      select count(*) into before_audit from booking_api.events;
      result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if result->>'replayed' is distinct from 'true' or before_audit<>(select count(*) from booking_api.events) then raise exception 'Replay repeated mode change';end if;
    else
      if result->>'updated'='true' or before_audit<>(select count(*) from booking_api.events)
        or (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route)<>old_mode then raise exception 'Rejected proposal changed booking: %',result;end if;
      if case_name in ('references_stale','timestamp_stale') and result#>>'{error,code}' is distinct from '40001' then raise exception 'Wrong stale failure: %',result;end if;
    end if;
    if before_target is distinct from (select to_jsonb(r)-array['JobRoute_ModeCode','JobRoute_MasterTransportReference','JobRoute_HouseTransportReference',
      'JobRoute_CarrierBookingReference','JobRoute_TransportMeansName','JobRoute_RouteJSON','JobRoute_UpdatedAt','JobRoute_UpdatedBy'] from public."Job_Routing" r where "JobRoute_ID"=route)
      or before_rows is distinct from (select jsonb_agg(to_jsonb(r)-'JobRoute_UpdatedAt'-'JobRoute_UpdatedBy' order by "JobRoute_ID") from public."Job_Routing" r where "Job_ID"=job and "JobRoute_ID"<>route)
      or before_job is distinct from (select to_jsonb(j)-'Job_UpdatedAt'-'Job_UpdatedBy' from public."Job_Header" j where "Job_ID"=job)
      or before_cargo is distinct from (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c)
      or before_containers is distinct from (select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") from public."Job_Containers" c) then raise exception 'Unselected Booking/cargo/equipment/route values overwritten';end if;
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>watch_count then raise exception 'Mode watch missing or duplicated';end if;
  end loop;
  if has_function_privilege('authenticated','booking_api.dexter_route_mode_review(uuid,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.multideck_dexter_action_change_booking_route_mode(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.multideck_dexter_action_change_booking_route_mode(uuid,uuid,jsonb)','execute') then raise exception 'Private mode review/action exposed';end if;
end $test$;
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
do $denied$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  begin perform booking_api.dexter_route_mode_review(company,actor,'{}');raise exception 'Revoked actor prepared mode change';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_change_booking_route_mode(company,actor,'{}');raise exception 'Revoked actor changed mode';exception when insufficient_privilege then null;end;
end $denied$;
`
