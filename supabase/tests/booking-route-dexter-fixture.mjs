import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const routing = read('20260902153715_booking_multi_leg_routes_and_cargo_dimensions')
function sqlFunction(name) {
  const start = routing.indexOf(`create or replace function ${name}(`)
  assert.ok(start >= 0, name)
  return routing.slice(start, routing.indexOf('\n$$;', start) + 4)
}
const workspace = read('20260820150500_booking_workspace_rpc')
const start = workspace.lastIndexOf('  select coalesce', workspace.indexOf("'id', route.\"JobRoute_ID\""))
const end = workspace.indexOf(';', workspace.indexOf('  into routes_value', start)) + 1
const projection = workspace.slice(start, end)
assert.ok(projection.includes('JobRoute_MasterTransportReference'))

// Same isolated Auth and broad workspace fixtures as the cargo/container suite.
// Route fields use the actual workspace projection; real route save, history
// trigger, orchestration, dispatch, approval and watch lifecycle execute here.
export function routeDexterFixture(table) {
  return `
    create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$
      select $1='10000000-0000-4000-8000-000000000001'::uuid$$;
    ${table('Job_Routing')}
    alter table public."Job_Header" add "Job_SourceSnapshotJSON" jsonb;
    alter table public."Job_Routing" add primary key("JobRoute_ID");
    ${sqlFunction('booking_api.save_booking_route_legs')}
    revoke all on function booking_api.save_booking_route_legs(uuid,uuid,jsonb) from public,anon,authenticated;
    ${read('20260905183528_booking_route_mode_reference_history')}
    create function booking_api.fixture_read_routes(target uuid) returns jsonb language plpgsql stable as $$
      declare job_row record;routes_value jsonb;
      begin select * into strict job_row from public."Job_Header" where "Job_ID"=target;
        ${projection} return routes_value;end;$$;
    alter function booking_api.workspace_before_container_ops_20260905(uuid,text) rename to fixture_workspace_before_routes;
    create function booking_api.workspace_before_container_ops_20260905(uuid,text) returns jsonb language sql stable as $$
      select booking_api.fixture_workspace_before_routes($1,$2)||jsonb_build_object('routes',booking_api.fixture_read_routes("Job_ID"))
      from public."Job_Header" where "Job_BookingReference"=$2$$;
    create function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) returns void language sql as $$select$$;
    ${sqlFunction('public.booking_workflow_save').replace('public.booking_workflow_save(', 'public.booking_workflow_save_before_cargo_decimals_20260905(')}
    ${read('20260905210719_dexter_booking_routing_parity')}
  `
}

export const routeDexterAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;other_job uuid;other_actor uuid;other_company uuid;
  sea uuid;air uuid;road uuid;rail uuid;foreign_route uuid;watcher uuid;mode_watch uuid;result jsonb;proposal jsonb;bad jsonb;
  before_rows jsonb;before_audit integer;before_count integer;source jsonb;mode_value text;leg record;
  session_id uuid;intent_id uuid;grant_id uuid;prepared_id uuid;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID","Company_ID" into other_actor,other_company from public."cmp_Users" where "Company_ID"<>company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  perform set_config('test.actor',actor::text,false);
  update public."Job_Header" set "Job_TransportModeSummary"='multimodal',"Job_SourceSnapshotJSON"='{"acceptedQuote":"original evidence"}' where "Job_ID"=job;
  source:='{"routes":[{"mode":"road","origin":"Depot","destination":"Port","trailerNumber":"TR-1","masterTransportReference":"CMR-1"},
    {"mode":"sea","origin":"Port","destination":"Hub","vessel":"Vessel A","voyageNumber":"V1","masterTransportReference":"MBL-1","houseTransportReference":"HBL-1","plannedDepartureAt":"2026-09-18T12:00:00Z","plannedArrivalAt":"2026-09-20T12:00:00Z"},
    {"mode":"air","origin":"Hub","destination":"Airport","flightNumber":"FL-1","vessel":"Retained old vessel"},
    {"mode":"rail","origin":"Airport","destination":"Inland","railService":"RAIL-1"}]}';
  perform public.booking_workflow_save(actor,job,source);
  select "JobRoute_ID" into sea from public."Job_Routing" where "Job_ID"=job and "JobRoute_ModeCode"='sea';
  select "JobRoute_ID" into air from public."Job_Routing" where "Job_ID"=job and "JobRoute_ModeCode"='air';
  select "JobRoute_ID" into road from public."Job_Routing" where "Job_ID"=job and "JobRoute_ModeCode"='road';
  select "JobRoute_ID" into rail from public."Job_Routing" where "Job_ID"=job and "JobRoute_ModeCode"='rail';
  insert into public."Job_Routing"("Job_ID","JobRoute_OrderNo","JobRoute_ModeCode","JobRoute_OriginNameSnapshot","JobRoute_DestinationNameSnapshot")
    values(other_job,1,'sea','Other A','Other B') returning "JobRoute_ID" into foreign_route;
  update public."Job_Routing" set "JobRoute_ActualDepartureAt"='2026-09-18T13:00:00Z',"JobRoute_RouteJSON"='{"supplierCost":900,"private":"keep"}' where "JobRoute_ID"=sea;
  result:=public.multideck_dexter_query_domain('booking_routes','TEST1',25)->'data';
  if jsonb_array_length(result)<>4 or result#>>'{1,recordId}'<>sea::text or result#>>'{1,vessel}'<>'Vessel A'
    or result#>'{2,vessel}' is distinct from 'null'::jsonb or result->1 ?| array['supplierCost','routeData','actualDepartureAt'] then raise exception 'Route domain identity/mode/private boundary failed: %',result;end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_routes(company,foreign_route::text,25))<>0 then raise exception 'Foreign route read leaked';end if;
  proposal:=jsonb_build_object('target_id',job,'route_id',sea,'expected_updated_at',result#>>'{1,updatedAt}',
    'expected_route_updated_at',result#>>'{1,routeUpdatedAt}','field','vessel','value','Vessel B','reason','Carrier confirmed the replacement service');
  result:=public.multideck_dexter_create_watch('booking_routes','Vessel changed','Routing watch','Watch vessel',sea,'Sea leg','{"field":"vessel","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  result:=public.multideck_dexter_action_update_booking_route(company,actor,proposal);
  if result->>'after'<>'Vessel B' or result->>'recordId'<>sea::text then raise exception 'Wrong route updated';end if;
  if (select "JobRoute_Vessel" from public."Job_Routing" where "JobRoute_ID"=air)<>'Retained old vessel'
    or (select "JobRoute_ActualDepartureAt" from public."Job_Routing" where "JobRoute_ID"=sea)<>'2026-09-18T13:00:00Z'::timestamptz
    or (select "JobRoute_RouteJSON"->>'private' from public."Job_Routing" where "JobRoute_ID"=sea)<>'keep'
    or (select "Job_SourceSnapshotJSON" from public."Job_Header" where "Job_ID"=job)<>'{"acceptedQuote":"original evidence"}'::jsonb then raise exception 'Unselected or accepted evidence overwritten';end if;
  proposal:=proposal||jsonb_build_object('expected_updated_at',result->>'updatedAt','expected_route_updated_at',result->>'routeUpdatedAt');
  select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_rows from public."Job_Routing" r;
  select count(*) into before_audit from booking_api.events;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('route_id',foreign_route),jsonb_build_object('target_id',other_job),'{"field":"mode","value":"air"}'::jsonb,
    '{"field":"flightNumber","value":"NO"}','{"field":"actualDepartureAt","value":"2026-09-19"}',
    '{"field":"plannedDepartureAt","value":"tomorrow"}','{"field":"plannedDepartureAt","value":"2026-09-18T12:00:00"}',
    '{"value":42}','{"reason":""}','{"unexpected":true}',jsonb_build_object('value',repeat('x',51)),
    '{"expected_route_updated_at":"2000-01-01T00:00:00Z"}','{"expected_updated_at":"2000-01-01T00:00:00Z"}')) loop
    begin perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||bad);raise exception 'Invalid route proposal accepted: %',bad;
    exception when insufficient_privilege or invalid_parameter_value or serialization_failure then null;end;
  end loop;
  begin perform public.multideck_dexter_action_update_booking_route(company,other_actor,proposal);raise exception 'Foreign actor wrote route';exception when insufficient_privilege then null;end;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r)
    or before_audit<>(select count(*) from booking_api.events) then raise exception 'Rejected route change mutated state/audit';end if;
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"Vessel C"}');
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"Vessel C"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Distinct route event suppressed or no-op duplicated';end if;
  result:=public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"field":"plannedDepartureAt","value":"2026-09-19"}');
  if (result->>'after')::timestamptz<>'2026-09-19T00:00:00Z'::timestamptz then raise exception 'Date-only timestamp not UTC';end if;
  result:=public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"field":"plannedDepartureAt","value":"2026-09-19T10:30:00+02:00"}');
  if (result->>'after')::timestamptz<>'2026-09-19T08:30:00Z'::timestamptz then raise exception 'Timestamp offset lost';end if;
  result:=public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"field":"houseTransportReference","value":null}');
  if result->'after' is distinct from 'null'::jsonb then raise exception 'Reference clear ignored';end if;
  for leg in select * from (values(air,'flightNumber','FL-APPROVED'),(road,'trailerNumber','TR-APPROVED'),(rail,'railService','RAIL-APPROVED')) fields(id,field,value) loop
    result:=public.multideck_dexter_query_domain('booking_routes',leg.id::text,1)#>'{data,0}';
    result:=public.multideck_dexter_action_update_booking_route(company,actor,jsonb_build_object('target_id',job,'route_id',leg.id,
      'expected_updated_at',result->>'updatedAt','expected_route_updated_at',result->>'routeUpdatedAt','field',leg.field,'value',leg.value,'reason','Confirmed leg details'));
    if result->>'after' is distinct from leg.value then raise exception 'Mode-specific approved edit failed: %',result;end if;
  end loop;
  -- A leg-only external change cannot slip past an unchanged Booking stamp.
  update public."Job_Routing" set "JobRoute_UpdatedAt"=now()-interval '1 second' where "JobRoute_ID"=sea;
  begin perform public.multideck_dexter_action_update_booking_route(company,actor,proposal);raise exception 'Source-only stale proposal accepted';exception when serialization_failure then null;end;
  update public."Job_Routing" set "JobRoute_UpdatedAt"=(proposal->>'expected_route_updated_at')::timestamptz where "JobRoute_ID"=sea;
  perform set_config('request.jwt.claim.role','service_role',false);
  foreach mode_value in array array['approve','full'] loop
    session_id:=gen_random_uuid();grant_id:=null;
    if mode_value='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["update_booking_route"]','freight',mode_value,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'update_booking_route',proposal||jsonb_build_object('field','voyageNumber','value',mode_value),job,'Change voyage','Confirmed service',mode_value,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into before_audit from booking_api.events;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved route edit executed';end if;exception when insufficient_privilege then null;end;
    if before_audit<>(select count(*) from booking_api.events) then raise exception 'Unapproved route action wrote';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Route approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated' is distinct from 'true' or result#>>'{result,after}'<>mode_value then raise exception 'Approved route edit failed: %',result;end if;
    select count(*) into before_audit from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed' is distinct from 'true' or before_audit<>(select count(*) from booking_api.events) then raise exception 'Route retry repeated mutation';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,other_company,other_actor,null);
    if result#>>'{error,code}' is distinct from 'prepared_action_unavailable' then raise exception 'Other owner accessed route proposal';end if;
  end loop;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"Vessel D"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Paused route watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_route(company,actor,proposal||'{"value":"Vessel E"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'Resumed route watch silent';end if;
  select count(*) into before_count from public."AI_DexterWatchEvents";
  update public."Job_Routing" set "JobRoute_FlightNumber"='FL-2' where "JobRoute_ID"=air;
  if before_count<>(select count(*) from public."AI_DexterWatchEvents") then raise exception 'Unselected leg fired route watch';end if;
  begin perform public.multideck_dexter_create_watch('booking_routes','Bad','Bad','Bad',foreign_route,'Other','{"field":"vessel","operator":"changed"}');raise exception 'Foreign route watched';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_routes','Bad','Bad','Bad',sea,'Sea','{"field":"vessel","operator":"changed"}','{"action":"update_booking_route"}');raise exception 'Autonomous route watch allowed';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  update public."Job_Routing" set "JobRoute_Vessel"='Vessel F' where "JobRoute_ID"=sea;
  if before_count<>(select count(*) from public."AI_DexterWatchEvents") then raise exception 'Revoked owner notified';end if;
  begin perform public.multideck_dexter_action_update_booking_route(company,actor,proposal);raise exception 'Revoked actor edited route';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  -- Persisted mode changes from the real Booking route stage also feed watches.
  -- The approval-only single-field Dexter action itself cannot change a mode.
  result:=public.multideck_dexter_create_watch('booking_routes','Mode changed','Routing mode','Watch mode',sea,'Sea leg','{"field":"mode","operator":"changed"}');
  mode_watch:=(result->>'id')::uuid;
  source:=jsonb_build_object('routes',booking_api.fixture_read_routes(job));
  source:=jsonb_set(source,'{routes,1,mode}','"air"');
  perform public.booking_workflow_save(actor,job,source);
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=mode_watch)<>1 then raise exception 'Persisted mode change did not notify';end if;
  if (select "JobRoute_MasterTransportReference" from public."Job_Routing" where "JobRoute_ID"=sea) is not null
    or (select "JobRoute_Vessel" from public."Job_Routing" where "JobRoute_ID"=sea)<>'Vessel F' then raise exception 'Mode change lost historical evidence or reinterpreted reference';end if;
  result:=public.multideck_dexter_query_domain('booking_routes',sea::text,1)#>'{data,0}';
  if result->'vessel' is distinct from 'null'::jsonb or result->>'mode'<>'air' then raise exception 'Off-mode vessel presented as current after mode change';end if;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Route evaluator swallowed an error';end if;
  if not exists(select 1 from booking_api.events where event_type='dexter_route_updated' and actor_user_id=actor and metadata->>'reason'='Carrier confirmed the replacement service') then raise exception 'Route audit evidence missing';end if;
  if has_function_privilege('authenticated','public.multideck_dexter_domain_booking_routes(uuid,text,integer)','execute') or has_function_privilege('authenticated','public.multideck_dexter_action_update_booking_route(uuid,uuid,jsonb)','execute') then raise exception 'Route adapter exposed';end if;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Route owner history inaccessible';end if;
  reset role;
  perform set_config('test.actor',other_actor::text,false);
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Other owner read route history';end if;
  reset role;
  perform set_config('test.actor',actor::text,false);
end $test$;
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
do $denial$
begin
  begin perform public.multideck_dexter_query_domain('booking_routes','TEST1',25);raise exception 'Revoked permission read route data';exception when insufficient_privilege then null;end;
  if jsonb_array_length(public.multideck_dexter_list_watches())<>0 then raise exception 'Route watch list leaked after permission loss';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches") or exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Route history leaked after permission loss';end if;
  reset role;
end $denial$;
`
