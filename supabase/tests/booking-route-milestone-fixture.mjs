import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/20260906182852_booking_route_milestone_foundation.sql', import.meta.url), 'utf8')

// Uses real retained table shapes and the actual canonical workspace/save chain.
// Auth and broad workspace fixtures remain those of the parent suite, not a
// claim of hosted authentication, RLS or private-document storage verification.
export function routeMilestoneFixture(table) {
  return `
    alter table public."cmp_Users" add unique ("User_ID");
    ${table('sys_JobMilestoneTypes')}
    alter table public."sys_JobMilestoneTypes" add primary key ("JMT_Code");
    ${table('Job_RouteMilestones')}
    alter table public."Job_RouteMilestones" add primary key ("JobRouteMilestone_ID"),
      add foreign key ("JobRouteMilestone_JobRouteID") references public."Job_Routing" ("JobRoute_ID"),
      add foreign key ("JobRouteMilestone_Type") references public."sys_JobMilestoneTypes" ("JMT_Code");
    insert into public."sys_JobMilestoneTypes" ("JMT_Code","JMT_Name","JMT_SortOrder","JMT_IsActive") values
      ('departed','Departed',1,true),('arrived','Arrived',2,true),('exception','Exception',3,true),
      ('customs_released','Customs released',4,true),('inactive','Inactive test',5,false);
    ${migration}
    create function booking_api.fixture_milestone_payload(job uuid, leg uuid, milestone uuid, changes jsonb)
    returns jsonb language sql as $$
      select jsonb_build_object('id',milestone,'routeId',leg,'expectedUpdatedAt',j."Job_UpdatedAt",
        'expectedRouteUpdatedAt',r."JobRoute_UpdatedAt",'expectedMilestoneUpdatedAt',m."JobRouteMilestone_UpdatedAt",
        'type','departed','changes',changes,'reason','Synthetic operational evidence')
      from public."Job_Header" j join public."Job_Routing" r on r."Job_ID"=j."Job_ID" and r."JobRoute_ID"=leg
      left join public."Job_RouteMilestones" m on m."JobRouteMilestone_ID"=milestone where j."Job_ID"=job
    $$;
  `
}

export const routeMilestoneAssertions = `
do $test$
declare
  actor uuid:='10000000-0000-4000-8000-000000000001'; job uuid; other_job uuid; foreign_actor uuid;
  leg uuid; first_leg uuid; first_id uuid; milestone uuid; other_id uuid; foreign_leg uuid;
  mode text; bad jsonb; payload jsonb; result jsonb; readback jsonb; before_rows jsonb; permission_definition text;
  before_job jsonb; before_quotes jsonb; before_routes jsonb; before_audit bigint; before_stamp timestamptz;
begin
  perform set_config('test.actor',actor::text,false);
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  select "User_ID" into foreign_actor from public."cmp_Users" where "User_ID"<>actor limit 1;
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" v;
  if has_function_privilege('anon','public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)','execute')
    or has_function_privilege('service_role','booking_api.save_route_milestone(uuid,uuid,jsonb)','execute')
    or not has_function_privilege('service_role','public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)','execute') then
    raise exception 'Milestone save bypasses the service boundary'; end if;
  foreach mode in array array['sea','air','road','rail'] loop
    insert into public."Job_Routing" ("Job_ID","JobRoute_OrderNo","JobRoute_ModeCode","JobRoute_OriginNameSnapshot","JobRoute_DestinationNameSnapshot")
      values(job,10,mode,'Synthetic origin','Synthetic destination') returning "JobRoute_ID" into leg;
    milestone:=gen_random_uuid();
    if first_id is null then first_id:=milestone; first_leg:=leg; end if;
    payload:=booking_api.fixture_milestone_payload(job,leg,milestone,'{
      "plannedAt":"2026-09-01T09:00:00+01:00","estimatedAt":"2026-09-01T09:30:00+01:00",
      "actualAt":"2026-09-01T10:00:00+01:00","status":"completed","externalReference":"CONFIRMED-TEST"}');
    result:=public.booking_workflow_save_route_milestone(actor,job,payload);
    readback:=public.booking_workflow_workspace(actor,'TEST1');
    if result is distinct from readback then raise exception 'Milestone Save differs from Open'; end if;
    select m into readback from jsonb_array_elements(result->'routes') r,
      lateral jsonb_array_elements(r->'milestones') m where m->>'id'=milestone::text;
    if readback->>'recordedMode'<>mode or readback->>'source'<>'operator'
      or readback->>'createdBy'<>actor::text or readback->>'name'<>'Departed'
      or (readback->>'plannedAt')::timestamptz<>'2026-09-01T08:00Z'::timestamptz
      or (readback->>'estimatedAt')::timestamptz<>'2026-09-01T08:30Z'::timestamptz
      or (readback->>'actualAt')::timestamptz<>'2026-09-01T09:00Z'::timestamptz then
      raise exception 'Independent milestone dates/source/mode did not round-trip: %',readback; end if;
    if result->>'routeMilestonesSupported'<>'true' or result#>>'{documents,0,category}'<>'quote'
      or exists(select 1 from jsonb_array_elements(result->'milestoneTypes') t where t->>'code' in ('customs_released','inactive')) then
      raise exception 'Workspace capability/dictionary/document boundary failed'; end if;
    -- Repeating the original request is stale, not another event or duplicate row.
    begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
      raise exception 'Stale create repeated'; exception when serialization_failure then null; end;
  end loop;
  select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r;
  payload:=booking_api.fixture_milestone_payload(job,first_leg,first_id,'{"estimatedAt":null,"notes":"Dispatcher correction"}');
  perform public.booking_workflow_save_route_milestone(actor,job,payload);
  if exists(select 1 from public."Job_RouteMilestones" where "JobRouteMilestone_ID"=first_id and
    ("JobRouteMilestone_EstimatedAt" is not null or "JobRouteMilestone_PlannedAt"<>'2026-09-01T08:00Z'::timestamptz
      or "JobRouteMilestone_ActualAt"<>'2026-09-01T09:00Z'::timestamptz)) then raise exception 'Clear changed unselected dates'; end if;
  payload:=booking_api.fixture_milestone_payload(job,first_leg,first_id,'{"notes":"Dispatcher correction"}');
  select count(*) into before_audit from booking_api.events;
  select "Job_UpdatedAt" into before_stamp from public."Job_Header" where "Job_ID"=job;
  perform public.booking_workflow_save_route_milestone(actor,job,payload);
  if before_audit<>(select count(*) from booking_api.events) or before_stamp is distinct from
    (select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job) then raise exception 'No-op creates audit or stale conflict'; end if;
  select jsonb_agg(to_jsonb(m) order by "JobRouteMilestone_ID") into before_rows from public."Job_RouteMilestones" m;
  select to_jsonb(j) into before_job from public."Job_Header" j where "Job_ID"=job;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"changes":{"status":"completed","actualAt":null}}'::jsonb,
    '{"changes":{"status":"planned","plannedAt":"2026-09-01"}}',
    '{"changes":{"actualAt":"2026-02-30T10:00Z"}}','{"changes":{"actualAt":"2026-09-01T24:00Z"}}',
    '{"changes":{"actualAt":"2026-09-01T10:00"}}','{"changes":{"actualAt":"infinity"}}',
    '{"changes":{"actualAt":"2026-09-01T10:00+14:01"}}','{"changes":{"actualAt":42}}',
    '{"changes":{"source":"sinay"}}','{"changes":{"trackingEventId":null}}','{"changes":{"status":"invented"}}',
    '{"changes":{"notes":false}}','{"changes":{"plannedAt":{}}}',
    '{"type":"arrived"}','{"reason":""}','{"expectedUpdatedAt":"2000-01-01T00:00Z"}',
    '{"expectedRouteUpdatedAt":"2000-01-01T00:00Z"}','{"expectedMilestoneUpdatedAt":"2000-01-01T00:00Z"}',
    '{"expectedMilestoneUpdatedAt":null}','{"source":"operator"}',
    '{"id":"not-a-uuid"}','{"routeId":null}','{"changes":[]}',
    jsonb_build_object('changes',jsonb_build_object('externalReference',repeat('x',181)))
  )) loop
    begin perform public.booking_workflow_save_route_milestone(actor,job,payload||bad);
      raise exception 'Invalid milestone change accepted: %',bad; exception when invalid_parameter_value or serialization_failure then null; end;
  end loop;
  begin perform public.booking_workflow_save_route_milestone(foreign_actor,job,payload);
    raise exception 'Wrong actor accepted'; exception when insufficient_privilege then null; end;
  begin perform public.booking_workflow_save_route_milestone(actor,other_job,payload);
    raise exception 'Foreign Booking accepted'; exception when insufficient_privilege then null; end;
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
    raise exception 'Revoked actor accepted'; exception when insufficient_privilege then null; end;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  permission_definition:=pg_get_functiondef('booking_api.has_permission(uuid,text)'::regprocedure);
  foreach mode in array array['unknown','Bookings.Read','Bookings.Write'] loop
    execute format('create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as
      %L',case when mode='unknown' then 'select null::boolean' else format('select $2 <> %L',mode) end);
    begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
      raise exception 'Missing or unknown permission accepted: %',mode; exception when insufficient_privilege then null; end;
  end loop;
  execute permission_definition;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(m) order by "JobRouteMilestone_ID") from public."Job_RouteMilestones" m)
    or before_job is distinct from (select to_jsonb(j) from public."Job_Header" j where "Job_ID"=job)
    or before_audit<>(select count(*) from booking_api.events) then raise exception 'Denied edits changed rows or audit'; end if;
  -- Another leg is not interchangeable even within the same Booking.
  select "JobRoute_ID" into leg from public."Job_Routing" where "Job_ID"=job and "JobRoute_ID"<>first_leg limit 1;
  payload:=booking_api.fixture_milestone_payload(job,leg,first_id,'{"notes":"Wrong leg"}');
  begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
    raise exception 'Cross-leg evidence edited'; exception when insufficient_privilege then null; end;
  -- New Customs, unknown/inactive types, and provider evidence are not writable.
  payload:=booking_api.fixture_milestone_payload(job,first_leg,gen_random_uuid(),'{"notes":"New"}');
  foreach mode in array array['customs_released','inactive','unknown'] loop
    begin perform public.booking_workflow_save_route_milestone(actor,job,payload||jsonb_build_object('type',mode));
      raise exception 'Unavailable type accepted'; exception when invalid_parameter_value then null; end;
  end loop;
  insert into public."Job_RouteMilestones" ("JobRouteMilestone_JobRouteID","JobRouteMilestone_Type","JobRouteMilestone_Source","JobRouteMilestone_PayloadJSON")
    values(first_leg,'arrived','provider','{"privateProviderData":"keep"}') returning "JobRouteMilestone_ID" into other_id;
  payload:=booking_api.fixture_milestone_payload(job,first_leg,other_id,'{"notes":"Replace provider"}')-'type';
  begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
    raise exception 'Provider evidence edited'; exception when insufficient_privilege then null; end;
  result:=public.booking_workflow_workspace(actor,'TEST1');
  select m into readback from jsonb_array_elements(result->'routes') r,
    lateral jsonb_array_elements(r->'milestones') m where m->>'id'=other_id::text;
  if readback->>'operatorEditable' is distinct from 'false' or readback ? 'privateProviderData'
    or readback ? 'payloadJSON' then raise exception 'Provider read boundary failed'; end if;
  update public."Job_RouteMilestones" set "JobRouteMilestone_Source"=null where "JobRouteMilestone_ID"=other_id;
  if (select booking_api.route_milestone_values(m)->>'operatorEditable' from public."Job_RouteMilestones" m
    where "JobRouteMilestone_ID"=other_id) is distinct from 'false' then raise exception 'Unknown source presented as editable'; end if;
  if before_routes is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r) then
    raise exception 'Milestones changed route/transport dates or operational fields'; end if;
  -- A mode change preserves old evidence and prevents repurposing it.
  update public."Job_Routing" set "JobRoute_ModeCode"='air' where "JobRoute_ID"=first_leg;
  payload:=booking_api.fixture_milestone_payload(job,first_leg,first_id,'{"notes":"Relabel old Sea evidence"}');
  begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
    raise exception 'Old-mode evidence silently reused'; exception when invalid_parameter_value then null; end;
  payload:=payload||'{"changes":{"status":"voided"}}';
  perform public.booking_workflow_save_route_milestone(actor,job,payload);
  select booking_api.route_milestone_values(m) into readback from public."Job_RouteMilestones" m where "JobRouteMilestone_ID"=first_id;
  if readback->>'recordedMode'<>'sea' or readback->>'status'<>'voided' or readback->>'actualAt' is null
    or readback->>'operatorEditable'<>'false' then raise exception 'Voiding removed or changed history'; end if;
  payload:=booking_api.fixture_milestone_payload(job,first_leg,first_id,'{"status":"planned"}');
  begin perform public.booking_workflow_save_route_milestone(actor,job,payload);
    raise exception 'Voided evidence resurrected'; exception when invalid_parameter_value then null; end;
  if before_quotes is distinct from (select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" v) then
    raise exception 'Milestone workflow altered Quote history'; end if;
  if not exists(select 1 from booking_api.events where event_type='route_milestone_recorded' and actor_user_id=actor
    and metadata->>'milestoneId'=first_id::text and metadata#>>'{before,status}'='completed' and metadata#>>'{after,status}'='voided'
    and metadata->>'reason'='Synthetic operational evidence') then raise exception 'Before/after attributed correction history missing'; end if;
end $test$;
`
