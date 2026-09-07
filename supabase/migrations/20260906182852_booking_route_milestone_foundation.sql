begin;
set local lock_timeout = '5s';

-- Operator evidence, not a tracking importer or a Customs workflow. Existing
-- provider/legacy rows stay read-only; no inferred dates or historical backfill.
alter table public."Job_RouteMilestones"
  add column "JobRouteMilestone_RecordedMode" varchar(40),
  add column "JobRouteMilestone_CreatedBy" uuid references public."cmp_Users"("User_ID"),
  add column "JobRouteMilestone_UpdatedBy" uuid references public."cmp_Users"("User_ID"),
  add column "JobRouteMilestone_UpdatedAt" timestamptz not null default now();

create function booking_api.parse_milestone_time(value jsonb)
returns timestamptz language plpgsql immutable set search_path = '' set timezone = 'UTC' as $$
declare text_value text;
begin
  if value is null or value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(value) <> 'string' then
    raise exception 'A milestone time needs a date, time and explicit timezone, or can be cleared.' using errcode = '22023'; end if;
  text_value := nullif(btrim(value #>> '{}'), '');
  if text_value is null then return null; end if;
  if text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]{1,6})?)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$' then
    raise exception 'Enter the complete milestone date and time with an explicit timezone.' using errcode = '22023'; end if;
  return text_value::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then
  raise exception 'That milestone date, time or timezone is invalid.' using errcode = '22023';
end $$;

create function booking_api.route_milestone_values(item public."Job_RouteMilestones")
returns jsonb language sql stable set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'id', item."JobRouteMilestone_ID", 'routeId', item."JobRouteMilestone_JobRouteID",
    'type', item."JobRouteMilestone_Type", 'status', item."JobRouteMilestone_Status",
    'plannedAt', item."JobRouteMilestone_PlannedAt", 'estimatedAt', item."JobRouteMilestone_EstimatedAt",
    'actualAt', item."JobRouteMilestone_ActualAt", 'locationUnlocode', item."JobRouteMilestone_LocationUNLocode",
    'location', item."JobRouteMilestone_LocationNameSnapshot", 'externalReference', item."JobRouteMilestone_ExternalReference",
    'source', item."JobRouteMilestone_Source", 'notes', item."JobRouteMilestone_Notes",
    'recordedMode', item."JobRouteMilestone_RecordedMode", 'createdAt', item."JobRouteMilestone_CreatedAt",
    'createdBy', item."JobRouteMilestone_CreatedBy", 'updatedAt', item."JobRouteMilestone_UpdatedAt",
    'updatedBy', item."JobRouteMilestone_UpdatedBy",
    'operatorEditable', coalesce(item."JobRouteMilestone_Source" = 'operator'
      and item."JobRouteMilestone_CreatedBy" is not null and item."JobRouteMilestone_TrackingEventID" is null
      and item."JobRouteMilestone_Type" <> 'customs_released' and item."JobRouteMilestone_Status" <> 'voided', false));
$$;

-- The permission-checked workspace owns the scope; join only its returned legs.
alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_milestones_20260906;
create function booking_api.workspace_extended(caller_auth_user_id uuid, requested_reference text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; routes jsonb; job_id uuid; types jsonb;
begin
  result := booking_api.workspace_before_milestones_20260906(caller_auth_user_id, requested_reference);
  job_id := nullif(result #>> '{booking,jobId}', '')::uuid;
  if job_id is null then return result; end if;
  select coalesce(jsonb_agg(line || jsonb_build_object('updatedAt', route."JobRoute_UpdatedAt", 'milestones', (
    select coalesce(jsonb_agg(booking_api.route_milestone_values(m) || jsonb_build_object(
      'name', coalesce(t."JMT_Name", m."JobRouteMilestone_Type"))
      order by t."JMT_SortOrder", m."JobRouteMilestone_CreatedAt", m."JobRouteMilestone_ID"), '[]'::jsonb)
    from public."Job_RouteMilestones" m left join public."sys_JobMilestoneTypes" t on t."JMT_Code" = m."JobRouteMilestone_Type"
    where m."JobRouteMilestone_JobRouteID" = route."JobRoute_ID"
  )) order by ordinal), '[]'::jsonb) into routes
  from jsonb_array_elements(coalesce(result->'routes', '[]'::jsonb)) with ordinality entries(line, ordinal)
  join public."Job_Routing" route on route."JobRoute_ID"::text = line->>'id' and route."Job_ID" = job_id;
  select coalesce(jsonb_agg(jsonb_build_object('code', "JMT_Code", 'name', "JMT_Name") order by "JMT_SortOrder", "JMT_Code"), '[]'::jsonb)
  into types from public."sys_JobMilestoneTypes" where "JMT_IsActive" and "JMT_Code" <> 'customs_released';
  return jsonb_set(result, '{routes}', routes) || jsonb_build_object('routeMilestonesSupported', true, 'milestoneTypes', types);
end $$;

-- One exact-leg delta. Omitted fields are retained; explicit null clears.
-- Lock in the same job -> leg -> evidence order for human and approved AI edits.
create function booking_api.save_route_milestone(caller_auth_user_id uuid, requested_job_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  actor record; job_row public."Job_Header"; route_row public."Job_Routing";
  before_row public."Job_RouteMilestones"; item public."Job_RouteMilestones";
  milestone_id uuid; route_id uuid; changes jsonb; key text; value jsonb; text_value text; stamp timestamptz;
  is_new boolean; before_values jsonb; after_values jsonb;
begin
  select "User_ID", "Company_ID" into actor from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if not found or booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') is not true
    or booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') is not true then
    raise exception 'You do not have permission to record Booking milestones.' using errcode = '42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not (payload ?& array['id','routeId','expectedUpdatedAt','expectedRouteUpdatedAt','expectedMilestoneUpdatedAt','changes','reason'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in
      ('id','routeId','expectedUpdatedAt','expectedRouteUpdatedAt','expectedMilestoneUpdatedAt','type','changes','reason'))
    or jsonb_typeof(payload->'reason') is distinct from 'string'
    or nullif(btrim(payload->>'reason'), '') is null or length(payload->>'reason') > 2000
    or jsonb_typeof(payload->'changes') is distinct from 'object' then
    raise exception 'Choose an exact milestone and provide its changes and reason.' using errcode = '22023'; end if;
  if jsonb_typeof(payload->'id') is distinct from 'string' or jsonb_typeof(payload->'routeId') is distinct from 'string'
    or payload->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or payload->>'routeId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Choose valid milestone and routing leg identities.' using errcode = '22023'; end if;
  milestone_id := (payload->>'id')::uuid; route_id := (payload->>'routeId')::uuid;
  if milestone_id is null or route_id is null then
    raise exception 'Milestone and routing leg identities are required.' using errcode = '22023'; end if;
  changes := payload->'changes';
  if changes = '{}'::jsonb or exists(select 1 from jsonb_object_keys(changes) k where k not in
    ('status','plannedAt','estimatedAt','actualAt','locationUnlocode','location','externalReference','notes')) then
    raise exception 'That milestone field is not available for editing.' using errcode = '22023'; end if;
  select j.* into job_row from public."Job_Header" j
    join public."cmp_Offices" o on o."Office_ID" = coalesce(j."Job_OrgOfficeID", j."Job_OfficeID")
    where j."Job_ID" = requested_job_id and o."Company_ID" = actor."Company_ID" and not j."Job_IsDeleted" for update of j;
  if not found then raise exception 'That Booking is outside this workspace.' using errcode = '42501'; end if;
  select * into route_row from public."Job_Routing"
    where "JobRoute_ID" = route_id and "Job_ID" = requested_job_id for update;
  if not found then raise exception 'Choose a routing leg from this Booking.' using errcode = '42501'; end if;
  if booking_api.parse_milestone_time(payload->'expectedUpdatedAt') is null
    or job_row."Job_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedUpdatedAt')
    or booking_api.parse_milestone_time(payload->'expectedRouteUpdatedAt') is null
    or route_row."JobRoute_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedRouteUpdatedAt') then
    raise exception 'The Booking or leg changed. Reload before recording this milestone.' using errcode = '40001'; end if;
  select * into before_row from public."Job_RouteMilestones" where "JobRouteMilestone_ID" = milestone_id for update;
  is_new := not found;
  if is_new then
    if payload->'expectedMilestoneUpdatedAt' <> 'null'::jsonb then
      raise exception 'That milestone no longer exists. Reload the Booking.' using errcode = '40001'; end if;
    if jsonb_typeof(payload->'type') is distinct from 'string' or not exists (
      select 1 from public."sys_JobMilestoneTypes" where "JMT_Code" = payload->>'type' and "JMT_IsActive" and "JMT_Code" <> 'customs_released') then
      raise exception 'Choose an active operational milestone. Customs release is not available here.' using errcode = '22023'; end if;
    item."JobRouteMilestone_ID" := milestone_id; item."JobRouteMilestone_JobRouteID" := route_id;
    item."JobRouteMilestone_Type" := payload->>'type'; item."JobRouteMilestone_Status" := 'planned';
    item."JobRouteMilestone_Source" := 'operator'; item."JobRouteMilestone_PayloadJSON" := '{}';
    item."JobRouteMilestone_CreatedBy" := actor."User_ID"; item."JobRouteMilestone_CreatedAt" := clock_timestamp();
    item."JobRouteMilestone_RecordedMode" := route_row."JobRoute_ModeCode";
  else
    if before_row."JobRouteMilestone_JobRouteID" <> route_id
      or before_row."JobRouteMilestone_Source" is distinct from 'operator'
      or before_row."JobRouteMilestone_CreatedBy" is null
      or before_row."JobRouteMilestone_TrackingEventID" is not null
      or before_row."JobRouteMilestone_Type" = 'customs_released' then
      raise exception 'That milestone is outside this editable operational evidence.' using errcode = '42501'; end if;
    if before_row."JobRouteMilestone_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedMilestoneUpdatedAt') then
      raise exception 'This milestone changed. Reload before making a correction.' using errcode = '40001'; end if;
    if (payload ? 'type' and payload->>'type' is distinct from before_row."JobRouteMilestone_Type")
      or before_row."JobRouteMilestone_Status" = 'voided' then
      raise exception 'Keep the original evidence. Record a new milestone instead.' using errcode = '22023'; end if;
    if before_row."JobRouteMilestone_RecordedMode" is distinct from route_row."JobRoute_ModeCode"
      and changes <> '{"status":"voided"}'::jsonb then
      raise exception 'The leg mode changed. Retain or void the old evidence and record a new milestone.' using errcode = '22023'; end if;
    item := before_row;
  end if;
  for key, value in select * from jsonb_each(changes) loop
    if jsonb_typeof(value) not in ('string','null') then
      raise exception 'Milestone values must be text or an explicit clear.' using errcode = '22023'; end if;
    text_value := nullif(btrim(value #>> '{}'), '');
    if key in ('plannedAt','estimatedAt','actualAt') then
      stamp := booking_api.parse_milestone_time(value);
      if key = 'plannedAt' then item."JobRouteMilestone_PlannedAt" := stamp;
      elsif key = 'estimatedAt' then item."JobRouteMilestone_EstimatedAt" := stamp;
      else item."JobRouteMilestone_ActualAt" := stamp; end if;
    elsif key = 'status' then
      if text_value is null or text_value not in ('planned','completed','exception','voided') then
        raise exception 'Choose Planned, Completed, Exception or Voided.' using errcode = '22023'; end if;
      item."JobRouteMilestone_Status" := text_value;
    else
      if length(text_value) > (case when key = 'locationUnlocode' then 10 when key = 'notes' then 8000 else 180 end) then
        raise exception 'That milestone value exceeds its supported length.' using errcode = '22023'; end if;
      case key
        when 'locationUnlocode' then item."JobRouteMilestone_LocationUNLocode" := upper(text_value);
        when 'location' then item."JobRouteMilestone_LocationNameSnapshot" := text_value;
        when 'externalReference' then item."JobRouteMilestone_ExternalReference" := text_value;
        when 'notes' then item."JobRouteMilestone_Notes" := text_value;
      end case;
    end if;
  end loop;
  if item."JobRouteMilestone_Status" = 'completed' and item."JobRouteMilestone_ActualAt" is null then
    raise exception 'A completed milestone needs its actual event time.' using errcode = '22023'; end if;
  if is_new and item."JobRouteMilestone_Status" = 'voided' then
    raise exception 'Record a milestone before voiding it.' using errcode = '22023'; end if;
  before_values := case when is_new then '{}'::jsonb else booking_api.route_milestone_values(before_row) end;
  if not is_new and booking_api.route_milestone_values(item) = before_values then return before_values; end if;
  item."JobRouteMilestone_UpdatedBy" := actor."User_ID";
  item."JobRouteMilestone_UpdatedAt" := clock_timestamp();
  if is_new then
    insert into public."Job_RouteMilestones" select (item).*;
  else
    update public."Job_RouteMilestones" set
      "JobRouteMilestone_Status" = item."JobRouteMilestone_Status",
      "JobRouteMilestone_PlannedAt" = item."JobRouteMilestone_PlannedAt",
      "JobRouteMilestone_EstimatedAt" = item."JobRouteMilestone_EstimatedAt",
      "JobRouteMilestone_ActualAt" = item."JobRouteMilestone_ActualAt",
      "JobRouteMilestone_LocationUNLocode" = item."JobRouteMilestone_LocationUNLocode",
      "JobRouteMilestone_LocationNameSnapshot" = item."JobRouteMilestone_LocationNameSnapshot",
      "JobRouteMilestone_ExternalReference" = item."JobRouteMilestone_ExternalReference",
      "JobRouteMilestone_Notes" = item."JobRouteMilestone_Notes",
      "JobRouteMilestone_UpdatedBy" = item."JobRouteMilestone_UpdatedBy",
      "JobRouteMilestone_UpdatedAt" = item."JobRouteMilestone_UpdatedAt"
    where "JobRouteMilestone_ID" = milestone_id;
  end if;
  update public."Job_Header" set "Job_UpdatedAt" = item."JobRouteMilestone_UpdatedAt", "Job_UpdatedBy" = actor."User_ID"
    where "Job_ID" = requested_job_id;
  after_values := booking_api.route_milestone_values(item);
  insert into booking_api.events(company_id, job_id, event_type, summary, metadata, actor_user_id)
    values(actor."Company_ID", requested_job_id, 'route_milestone_recorded',
      case when is_new then 'Routing milestone recorded' else 'Routing milestone corrected' end,
      jsonb_build_object('routeId', route_id, 'milestoneId', milestone_id, 'before', before_values, 'after', after_values,
        'reason', btrim(payload->>'reason'), 'source', 'operator'), actor."User_ID");
  return after_values;
end $$;

create function public.booking_workflow_save_route_milestone(caller_auth_user_id uuid, requested_job_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reference text;
begin
  perform booking_api.save_route_milestone(caller_auth_user_id, requested_job_id, payload);
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID" = requested_job_id;
  return booking_api.workspace_with_document_groups(caller_auth_user_id, reference);
end $$;

revoke all on function booking_api.parse_milestone_time(jsonb),
  booking_api.route_milestone_values(public."Job_RouteMilestones"),
  booking_api.save_route_milestone(uuid,uuid,jsonb), booking_api.workspace_before_milestones_20260906(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function booking_api.workspace_extended(uuid,text), public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function booking_api.workspace_extended(uuid,text), public.booking_workflow_save_route_milestone(uuid,uuid,jsonb) to service_role;
commit;
