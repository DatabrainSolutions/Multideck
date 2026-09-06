import { readFileSync } from 'node:fs'
export const routeCutoffMigration = readFileSync(new URL('../migrations/20260906143817_booking_route_cutoff_foundation.sql', import.meta.url), 'utf8')

export const routeCutoffAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;other_actor uuid;other_job uuid;
  sea uuid;air uuid;watcher uuid;result jsonb;source jsonb;proposal jsonb;bad jsonb;before_rows jsonb;before_count integer;
  session_id uuid;intent_id uuid;prepared_id uuid;mode_proposal jsonb;review jsonb;quote_before jsonb;foreign_route uuid;
begin
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  perform set_config('test.actor',actor::text,false);
  -- The production approval endpoint is server-only; emulate that caller here,
  -- without removing the real role or approval guards.
  perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID" into other_actor from public."cmp_Users" where "Company_ID"<>company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  select "Job_SourceSnapshotJSON" into quote_before from public."Job_Header" where "Job_ID"=job;
  select "JobRoute_ID" into foreign_route from public."Job_Routing" where "Job_ID"=other_job limit 1;
  source:='{"routes":[{"mode":"sea","origin":"Cutoff A","destination":"Cutoff B","cargoCutoffAt":"2026-09-18T10:30:45.123456+02:00","documentationCutoffAt":"2026-09-17T10:00Z","vgmCutoffAt":"2026-09-17T16:00Z"},{"mode":"air","origin":"Cutoff B","destination":"Cutoff C"}]}';
  perform booking_api.save_booking_route_legs(actor,job,source);
  select "JobRoute_ID" into sea from public."Job_Routing" where "Job_ID"=job and "JobRoute_OriginNameSnapshot"='Cutoff A';
  select "JobRoute_ID" into air from public."Job_Routing" where "Job_ID"=job and "JobRoute_OriginNameSnapshot"='Cutoff B';
  if exists(select 1 from public."Job_Routing" where "JobRoute_ID" in (sea,air) and
    ("JobRoute_PlannedDepartureAt" is not null or "JobRoute_ActualDepartureAt" is not null)) then raise exception 'Deadline invented a movement date';end if;
  result:=booking_api.workspace_extended(actor,'TEST1');
  if result->>'routeCutoffsSupported' is distinct from 'true' then raise exception 'UI persistence capability marker missing';end if;
  select line into result from jsonb_array_elements(result->'routes') line where line->>'id'=sea::text;
  if (result->>'cargoCutoffAt')::timestamptz is distinct from '2026-09-18T08:30:45.123456Z'::timestamptz
    or (result->>'vgmCutoffAt')::timestamptz is distinct from '2026-09-17T16:00Z'::timestamptz then raise exception 'Deadline workspace projection lost UTC precision: %',result;end if;
  if not exists(select 1 from booking_api.events where event_type='route_cutoffs_updated' and actor_user_id=actor
    and metadata->>'routeId'=sea::text and metadata#>>'{after,cargoCutoffAt}' is not null) then raise exception 'Deadline audit missing';end if;
  source:=jsonb_build_object('routes',jsonb_build_array((result-'cargoCutoffAt'-'documentationCutoffAt'-'vgmCutoffAt')||'{"vessel":"Keep deadlines"}'));
  perform booking_api.save_booking_route_legs(actor,job,source);
  if (select "JobRoute_CargoCutoffAt" from public."Job_Routing" where "JobRoute_ID"=sea) is distinct from '2026-09-18T08:30:45.123456Z'::timestamptz then raise exception 'Old client erased cut-off';end if;
  select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_rows from public."Job_Routing" r;
  for bad in select value from jsonb_array_elements('["2026-09-18","2026-09-18T10:00","tomorrow","infinity","2026-02-30T10:00Z","2026-09-18T24:00Z","2026-09-18T10:00+22:00",42,{},true]') loop
    begin perform booking_api.save_booking_route_legs(actor,job,jsonb_set(source,'{routes,0,cargoCutoffAt}',bad));
      raise exception 'Invalid deadline accepted: %',bad;exception when invalid_parameter_value then null;end;
  end loop;
  begin perform booking_api.save_booking_route_legs(other_actor,job,source);raise exception 'Other company wrote deadline';exception when insufficient_privilege then null;end;
  begin perform booking_api.save_booking_route_legs(actor,other_job,source);raise exception 'Foreign route deadline written';exception when insufficient_privilege then null;end;
  select count(*) into before_count from booking_api.events;
  begin
    perform booking_api.save_booking_route_legs(actor,job,jsonb_build_object('routes',jsonb_build_array(
      source#>'{routes,0}'||'{"cargoCutoffAt":"2026-09-19T12:00Z"}',
      jsonb_build_object('id',air,'mode','air','origin','Cutoff B','destination','Cutoff C','vgmCutoffAt','2026-09-18T12:00Z'))));
    raise exception 'Later invalid deadline accepted';exception when invalid_parameter_value then null;end;
  if before_count<>(select count(*) from booking_api.events) then raise exception 'Failed multi-leg deadline save left an audit event';end if;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r) then raise exception 'Rejected deadline mutated rows';end if;
  result:=public.multideck_dexter_query_domain('booking_routes',sea::text,1)#>'{data,0}';
  if (result->>'cargoCutoffAt')::timestamptz is distinct from '2026-09-18T08:30:45.123456Z'::timestamptz then raise exception 'Chat deadline read missing';end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_routes(company,foreign_route::text,1))<>0 then raise exception 'Foreign deadlines readable';end if;
  begin perform public.multideck_dexter_create_watch('booking_routes','Foreign','Foreign','Watch deadline',foreign_route,'Other leg','{"field":"cargoCutoffAt","operator":"changed"}');
    raise exception 'Foreign deadline watch created';exception when insufficient_privilege then null;end;
  proposal:=jsonb_build_object('target_id',job,'route_id',sea,'expected_updated_at',result->>'updatedAt',
    'expected_route_updated_at',result->>'routeUpdatedAt','field','cargoCutoffAt','value','2026-09-18T09:00Z','reason','Carrier advised the revised cargo cut-off');
  result:=public.multideck_dexter_create_watch('booking_routes','Cargo cut-off changed','Carrier deadline','Watch cargo cut-off',sea,'Sea leg','{"field":"cargoCutoffAt","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  session_id:=gen_random_uuid();
  insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
    values(company,actor,session_id,repeat('0',64),'["update_booking_route"]','freight','approve',now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
  insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
    values(company,actor,session_id,intent_id,'update_booking_route',proposal,job,'Update cargo cut-off','Carrier confirmed deadline','approve',now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
  select count(*) into before_count from booking_api.events;
  begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved deadline executed';end if;exception when insufficient_privilege then null;end;
  if before_count<>(select count(*) from booking_api.events) then raise exception 'Unapproved deadline wrote audit';end if;
  if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Deadline approval failed';end if;
  result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
  if result->>'updated' is distinct from 'true' or (result#>>'{result,after}')::timestamptz is distinct from '2026-09-18T09:00Z'::timestamptz then raise exception 'Approved deadline failed: %',result;end if;
  proposal:=proposal||jsonb_build_object('expected_updated_at',result#>>'{result,updatedAt}','expected_route_updated_at',result#>>'{result,routeUpdatedAt}');
  result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
  if result->>'replayed' is distinct from 'true' then raise exception 'Deadline retry not idempotent';end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Deadline watch not exactly once';end if;
  -- Non-matching and paused changes do not notify; resuming does.
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"field":"documentationCutoffAt","value":"2026-09-16T12:00Z"}');
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"2026-09-18T11:00Z"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Unmatched or paused deadline watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"2026-09-18T12:00Z"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Resumed deadline watch silent';end if;
  begin perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"2026-09-18"}');raise exception 'Chat inferred midnight deadline';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_action_update_booking_route(company,other_actor,proposal);raise exception 'Foreign actor changed deadline';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"expected_route_updated_at":"2000-01-01T00:00Z"}');raise exception 'Stale deadline proposal accepted';exception when serialization_failure then null;end;
  result:=public.multideck_dexter_query_domain('booking_routes',air::text,1)#>'{data,0}';
  begin perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||jsonb_build_object('route_id',air,
    'expected_updated_at',result->>'updatedAt','expected_route_updated_at',result->>'routeUpdatedAt','field','vgmCutoffAt'));raise exception 'Air VGM deadline accepted';exception when invalid_parameter_value then null;end;
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":null}');
  if (select "JobRoute_CargoCutoffAt" from public."Job_Routing" where "JobRoute_ID"=sea) is not null then raise exception 'Deadline clear ignored';end if;
  mode_proposal:=jsonb_build_object('target_id',job,'route_id',sea,'expected_updated_at',proposal->>'expected_updated_at',
    'expected_route_updated_at',proposal->>'expected_route_updated_at','mode','air','reason','New transport mode confirmed');
  review:=booking_api.dexter_route_mode_review(company,actor,mode_proposal);
  if jsonb_array_length(review->'changes')<>7 or review#>>'{arguments,mode_review,beforeCutoffs,vgmCutoffAt}' is null
    or review->>'description' not like '%cut-offs%' then raise exception 'Mode approval hid cleared deadlines';end if;
  update public."Job_Routing" set "JobRoute_VgmCutoffAt"='2026-09-17T15:00Z' where "JobRoute_ID"=sea;
  begin perform public.multideck_dexter_action_change_booking_route_mode(company,actor,review->'arguments');
    raise exception 'Changed deadline bypassed mode review evidence';exception when serialization_failure then null;end;
  -- A mode switch archives copied deadlines; none becomes current Air data.
  result:=booking_api.workspace_extended(actor,'TEST1');
  select line into result from jsonb_array_elements(result->'routes') line where line->>'id'=sea::text;
  perform booking_api.save_booking_route_legs(actor,job,jsonb_build_object('routes',jsonb_build_array(result||'{"mode":"air"}')));
  if (select "JobRoute_VgmCutoffAt" is not null or "JobRoute_DocumentationCutoffAt" is not null from public."Job_Routing" where "JobRoute_ID"=sea) then raise exception 'Mode switch retained current deadlines';end if;
  if not exists(select 1 from booking_api.events where event_type='route_cutoffs_updated' and metadata->>'routeId'=sea::text
    and metadata->>'previousMode'='sea' and metadata->>'mode'='air' and metadata#>>'{before,vgmCutoffAt}' is not null
    and metadata#>'{after,vgmCutoffAt}'='null'::jsonb) then raise exception 'Mode deadline history lost';end if;
  if has_function_privilege('anon','booking_api.parse_route_cutoff(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','booking_api.workspace_before_cutoffs_20260906(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.multideck_dexter_action_update_booking_route(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Deadline private helpers exposed';end if;
  if quote_before is distinct from (select "Job_SourceSnapshotJSON" from public."Job_Header" where "Job_ID"=job) then raise exception 'Deadline edit altered accepted Quote evidence';end if;
end $test$;
`
