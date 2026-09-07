import { readFileSync } from 'node:fs'
export const milestoneDexterMigration = readFileSync(new URL('../migrations/20260907075838_dexter_booking_milestone_parity.sql', import.meta.url), 'utf8')

// The app prepares actions by inserting these scoped intent/prepared rows.
// This fixture drives the real approve/execute/replay RPCs, not a fake mutation.
export const milestoneDexterAssertions = `
create function booking_api.fixture_approve_milestone(actor uuid,company uuid,job uuid,args jsonb,access_mode text)
returns jsonb language plpgsql as $$
declare session_id uuid:=gen_random_uuid();intent_id uuid;grant_id uuid;prepared_id uuid;result jsonb;before_rows jsonb;before_count integer;
begin
  if access_mode='full' then
    insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
      values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;
  end if;
  insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
    values(company,actor,session_id,repeat('0',64),'["record_booking_milestone"]','freight',access_mode,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
  insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
    values(company,actor,session_id,intent_id,grant_id,'record_booking_milestone',args,job,'Review exact milestone','Synthetic operator-reviewed event',access_mode,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
  select jsonb_agg(to_jsonb(m) order by "JobRouteMilestone_ID") into before_rows from public."Job_RouteMilestones" m;
  select count(*) into before_count from booking_api.events;
  begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved milestone executed';end if;
  exception when insufficient_privilege then null;end;
  if before_count<>(select count(*) from booking_api.events) or before_rows is distinct from
    (select jsonb_agg(to_jsonb(m) order by "JobRouteMilestone_ID") from public."Job_RouteMilestones" m) then
    raise exception 'Unapproved milestone changed records';end if;
  if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Milestone approval failed';end if;
  result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
  if result->>'updated' is distinct from 'true' then raise exception 'Approved milestone failed: %',result;end if;
  select count(*) into before_count from booking_api.events;
  if public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null)->>'replayed' is distinct from 'true'
    or before_count<>(select count(*) from booking_api.events) then raise exception 'Replay duplicated milestone';end if;
  return result->'result';
end $$;

do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;other_job uuid;other_actor uuid;
  leg uuid;milestone uuid;watcher uuid;completion_watch uuid;mode text;access_mode text;result jsonb;source jsonb;proposal jsonb;bad jsonb;
  before_quotes jsonb;before_routes jsonb;before_rows jsonb;before_count integer;foreign_milestone uuid;foreign_leg uuid;permission_definition text;
begin
  perform set_config('test.actor',actor::text,false);perform set_config('test.booking_access','on',false);
  perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID" into other_actor from public."cmp_Users" where "Company_ID"<>company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" v;
  result:=public.multideck_dexter_query_domain('booking_milestone_types','',25)->'data';
  if not exists(select 1 from jsonb_array_elements(result) row where row->>'code'='departed')
    or exists(select 1 from jsonb_array_elements(result) row where row->>'code' in ('customs_released','inactive')) then raise exception 'Active type read failed';end if;
  foreach mode in array array['sea','air','road','rail'] loop
    insert into public."Job_Routing"("Job_ID","JobRoute_OrderNo","JobRoute_ModeCode","JobRoute_OriginNameSnapshot","JobRoute_DestinationNameSnapshot")
      values(job,20,mode,'Synthetic start','Synthetic finish') returning "JobRoute_ID" into leg;
    source:=public.multideck_dexter_query_domain('booking_routes',leg::text,1)#>'{data,0}';
    proposal:=jsonb_build_object('target_id',job,'route_id',leg,'milestone_id',null,'type','departed',
      'expected_updated_at',source->'updatedAt','expected_route_updated_at',source->'routeUpdatedAt','expected_milestone_updated_at',null,
      'changes','[{"field":"plannedAt","value":"2026-09-01T09:00+01:00"}]'::jsonb,'reason','Dispatcher confirmation');
    access_mode:=case when mode in ('sea','air') then 'approve' else 'full' end;
    result:=booking_api.fixture_approve_milestone(actor,company,job,proposal,access_mode);
    milestone:=(result->>'recordId')::uuid;
    source:=public.multideck_dexter_query_domain('booking_milestones',milestone::text,1)#>'{data,0}';
    if source->>'recordId'<>milestone::text or source->>'routeId'<>leg::text or source->>'mode'<>mode
      or source->>'recordedMode'<>mode or source->>'source'<>'operator' or source->>'name'<>'Departed'
      or source->>'actualAt' is not null then raise exception 'Scoped milestone read invented completion or lost evidence';end if;
    result:=public.multideck_dexter_create_watch('booking_milestones','Actual event recorded','Dispatcher evidence','Watch actual time',milestone,'Exact departed event','{"field":"actualAt","operator":"changed"}');
    watcher:=(result->>'id')::uuid;
    result:=public.multideck_dexter_create_watch('booking_milestones','Departure completed','Dispatcher evidence','Watch completion',milestone,'Exact departed event','{"field":"status","operator":"eq","value":"completed"}');
    completion_watch:=(result->>'id')::uuid;
    proposal:=proposal||jsonb_build_object('milestone_id',milestone,'expected_updated_at',source->'bookingUpdatedAt',
      'expected_route_updated_at',source->'routeUpdatedAt','expected_milestone_updated_at',source->'updatedAt',
      'changes','[{"field":"actualAt","value":"2026-09-01T10:30+01:00"},{"field":"status","value":"completed"}]'::jsonb);
    result:=booking_api.fixture_approve_milestone(actor,company,job,proposal,access_mode);
    if result#>>'{after,status}'<>'completed' or (result#>>'{after,plannedAt}')::timestamptz<>'2026-09-01T08:00Z'::timestamptz
      or result#>>'{after,estimatedAt}' is not null then raise exception 'Completion changed unrelated dates';end if;
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Actual event watch not exactly once';end if;
    if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher
      and "AIDexterWatchEvent_Body" like 'TEST1 · Leg 20 · Departed: actual time changed.%'
      and "AIDexterWatchEvent_ChangedJSON"->>'sourceUrl'='/bookings/test1') then raise exception 'Milestone notification copy or Booking link lost';end if;
    if (select count(*) from public."Comm_Notifications" where "CommNotif_TargetID"=watcher and "CommNotif_UserID"=actor
      and "CommNotif_LinkTypeCode"='dexter_watch' and "CommNotif_Body" like '%actual time changed.%')<>1 then raise exception 'Owner notification not singular';end if;
    -- The normal operator boundary triggers the same watcher. Unrelated notes do not.
    perform public.booking_workflow_save_route_milestone(actor,job,booking_api.fixture_milestone_payload(job,leg,milestone,'{"notes":"Unrelated note"}'));
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
    perform public.booking_workflow_save_route_milestone(actor,job,booking_api.fixture_milestone_payload(job,leg,milestone,'{"actualAt":"2026-09-01T11:00Z"}'));
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Non-matching or paused event notified';end if;
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
    perform public.booking_workflow_save_route_milestone(actor,job,booking_api.fixture_milestone_payload(job,leg,milestone,'{"status":"planned","actualAt":null}'));
    perform public.booking_workflow_save_route_milestone(actor,job,booking_api.fixture_milestone_payload(job,leg,milestone,'{"actualAt":null}'));
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Resumed clear or no-op event incorrect';end if;
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=completion_watch)<>1 then raise exception 'Completion condition repeated or matched Planned';end if;
    perform public.booking_workflow_save_route_milestone(actor,job,booking_api.fixture_milestone_payload(job,leg,milestone,'{"status":"completed","actualAt":"2026-09-01T11:00Z"}'));
    if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=completion_watch)<>2 then raise exception 'Completion condition did not rearm after correction';end if;
  end loop;
  select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r;
  source:=public.multideck_dexter_query_domain('booking_milestones',milestone::text,1)#>'{data,0}';
  proposal:=proposal||jsonb_build_object('expected_updated_at',source->'bookingUpdatedAt','expected_milestone_updated_at',source->'updatedAt',
    'changes','[{"field":"notes","value":"Valid correction"}]'::jsonb);
  select jsonb_agg(to_jsonb(m) order by "JobRouteMilestone_ID") into before_rows from public."Job_RouteMilestones" m;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"expected_updated_at":"2000-01-01T00:00Z"}'::jsonb,'{"expected_route_updated_at":"2000-01-01T00:00Z"}',
    '{"expected_milestone_updated_at":"2000-01-01T00:00Z"}','{"changes":[{"field":"status","value":"completed"},{"field":"actualAt","value":null}]}',
    '{"changes":[{"field":"notes","value":"a"},{"field":"notes","value":"b"}]}',
    '{"changes":[{"field":"source","value":"provider"}]}','{"changes":[{"field":"actualAt","value":"2026-09-01"}]}',
    '{"changes":[]}','{"milestone_id":"bad"}','{"extra":true}','{"type":"customs_released"}',jsonb_build_object('target_id',other_job))) loop
    begin perform public.multideck_dexter_action_record_booking_milestone(company,actor,proposal||bad);
      raise exception 'Invalid milestone proposal accepted: %',bad;exception when invalid_parameter_value or serialization_failure or insufficient_privilege then null;end;
  end loop;
  begin perform public.multideck_dexter_action_record_booking_milestone(company,other_actor,proposal);
    raise exception 'Foreign actor executed milestone';exception when insufficient_privilege then null;end;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(m) order by "JobRouteMilestone_ID") from public."Job_RouteMilestones" m) then
    raise exception 'Rejected proposal changed milestone';end if;
  select "JobRoute_ID" into foreign_leg from public."Job_Routing" where "Job_ID"=other_job limit 1;
  insert into public."Job_RouteMilestones"("JobRouteMilestone_JobRouteID","JobRouteMilestone_Type","JobRouteMilestone_Source","JobRouteMilestone_CreatedBy")
    values(foreign_leg,'departed','operator',other_actor) returning "JobRouteMilestone_ID" into foreign_milestone;
  if jsonb_array_length(public.multideck_dexter_domain_booking_milestones(company,foreign_milestone::text,1))<>0 then raise exception 'Foreign milestone read leaked';end if;
  begin perform public.multideck_dexter_create_watch('booking_milestones','Foreign','Foreign','Watch foreign',foreign_milestone,'Foreign','{"field":"actualAt","operator":"changed"}');
    raise exception 'Foreign watch accepted';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_milestones','Autonomous','Invalid','Watch event',milestone,'Event','{"field":"actualAt","operator":"changed"}','{}');
    raise exception 'Autonomous watch accepted';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_create_watch('booking_milestones','Timer','Invalid','Watch event',milestone,'Event','{"field":"actualAt","operator":"gt","value":"2026-09-01"}');
    raise exception 'Unsupported timer accepted';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_create_watch('booking_milestones','Missing condition','Invalid','Watch event',milestone,'Event','{"field":"status","operator":"eq","value":null}');
    raise exception 'Unknown status condition accepted';exception when invalid_parameter_value then null;end;
  select count(*) into before_count from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher;
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_milestones','Job_RouteMilestones',milestone,'{"actualAt":null}','{"actualAt":"2026-09-01T10:00Z"}');
  if before_count<>(select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Revoked owner notified';end if;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Owner cannot read watch history';end if;
  reset role;perform set_config('test.actor',other_actor::text,false);set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Other user read watch history';end if;
  reset role;perform set_config('test.actor',actor::text,false);
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='booking_milestones' and "AIDexterWatch_HealthStatusCode"='error') then
    raise exception 'Milestone watch swallowed an error';end if;
  if before_routes is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r)
    or before_quotes is distinct from (select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" v) then
    raise exception 'Milestone action changed route or submitted Quote evidence';end if;
  perform set_config('test.milestone_watch',watcher::text,false);
end $test$;
-- A new SQL statement sees the changed permission state. Replacing a SQL
-- permission function inside the same stable-read statement is not revocation.
select set_config('test.booking_access','off',false);
do $denied$
begin
  if booking_api.has_permission('10000000-0000-4000-8000-000000000001','Bookings.Read') is not false then
    raise exception 'Read-revocation fixture did not remove permission';end if;
  begin perform public.multideck_dexter_query_domain('booking_milestones','TEST1',25);raise exception 'Revoked read accepted';exception when insufficient_privilege then null;end;
  if exists(select 1 from jsonb_array_elements(public.multideck_dexter_list_watches()) row where row->>'capability'='booking_milestones') then raise exception 'Revoked watch list leaked';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='booking_milestones') then raise exception 'Revoked watch RLS leaked';end if;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=current_setting('test.milestone_watch')::uuid) then
    raise exception 'Revoked milestone history leaked';end if;
  reset role;
end $denied$;
select set_config('test.booking_access','on',false);
`
