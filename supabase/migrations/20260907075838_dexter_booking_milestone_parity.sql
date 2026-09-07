begin;
set local lock_timeout='5s';

create function public.multideck_dexter_domain_booking_milestone_types(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('recordId',"JMT_Code",'code',"JMT_Code",'name',"JMT_Name",
    'sourceTable','sys_JobMilestoneTypes') order by "JMT_SortOrder","JMT_Code"),'[]'::jsonb)
  from public."sys_JobMilestoneTypes" where "JMT_IsActive" and "JMT_Code"<>'customs_released'
    and (nullif(btrim(p_search),'') is null or "JMT_Code"=btrim(p_search) or "JMT_Name" ilike '%'||btrim(p_search)||'%');
$$;

create function public.multideck_dexter_domain_booking_milestones(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by reference,leg_number,created_at,milestone_id),'[]'::jsonb) from (
    select booking_api.route_milestone_values(m)||jsonb_build_object('recordId',m."JobRouteMilestone_ID",
      'name',coalesce(t."JMT_Name",m."JobRouteMilestone_Type"),'bookingId',j."Job_ID",'bookingReference',j."Job_BookingReference",
      'bookingUpdatedAt',j."Job_UpdatedAt",'routeUpdatedAt',r."JobRoute_UpdatedAt",'legNumber',r."JobRoute_OrderNo",
      'mode',r."JobRoute_ModeCode",'sourceTable','Job_RouteMilestones','sourceUrl','/bookings/'||lower(j."Job_BookingReference"),
      'targetLabel',j."Job_BookingReference"||' · Leg '||r."JobRoute_OrderNo"||' · '||coalesce(t."JMT_Name",m."JobRouteMilestone_Type")) result,
      j."Job_BookingReference" reference,r."JobRoute_OrderNo" leg_number,m."JobRouteMilestone_CreatedAt" created_at,m."JobRouteMilestone_ID" milestone_id
    from public."Job_RouteMilestones" m join public."Job_Routing" r on r."JobRoute_ID"=m."JobRouteMilestone_JobRouteID"
    join public."Job_Header" j on j."Job_ID"=r."Job_ID" and not j."Job_IsDeleted"
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID") and o."Company_ID"=p_company_id
    left join public."sys_JobMilestoneTypes" t on t."JMT_Code"=m."JobRouteMilestone_Type"
    where m."JobRouteMilestone_Type"<>'customs_released' and (nullif(btrim(p_search),'') is null
      or m."JobRouteMilestone_ID"::text=btrim(p_search) or r."JobRoute_ID"::text=btrim(p_search)
      or j."Job_ID"::text=btrim(p_search) or lower(j."Job_BookingReference")=lower(btrim(p_search)))
    order by j."Job_BookingReference",r."JobRoute_OrderNo",m."JobRouteMilestone_CreatedAt",m."JobRouteMilestone_ID"
    limit greatest(1,least(coalesce(p_take,10),25))
  ) selected;
$$;

-- A list of explicit field changes supports recording actual time and Completed
-- together, without replacing omitted planned/estimated fields. Both creation
-- and correction use the operator's real permission/stale/audit boundary.
create function public.multideck_dexter_action_record_booking_milestone(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;job_id uuid;milestone_id uuid;changes jsonb:='{}';entry jsonb;before_value jsonb;after_value jsonb;reference text;
begin
  select "Auth_User_ID" into actor from public."cmp_Users"
    where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or booking_api.has_permission(actor,'Bookings.Read') is not true
    or booking_api.has_permission(actor,'Bookings.Write') is not true then
    raise exception 'Booking milestone changes are not authorised.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object' or not(p_arguments ?& array[
    'target_id','route_id','milestone_id','type','expected_updated_at','expected_route_updated_at','expected_milestone_updated_at','changes','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) k where k not in
      ('target_id','route_id','milestone_id','type','expected_updated_at','expected_route_updated_at','expected_milestone_updated_at','changes','reason'))
    or jsonb_typeof(p_arguments->'changes') is distinct from 'array' then
    raise exception 'Provide the exact milestone changes and current source evidence.' using errcode='22023';end if;
  if jsonb_array_length(p_arguments->'changes') not between 1 and 8 then
    raise exception 'Choose between one and eight milestone field changes.' using errcode='22023';end if;
  for entry in select value from jsonb_array_elements(p_arguments->'changes') loop
    if jsonb_typeof(entry) is distinct from 'object' or not(entry ?& array['field','value'])
      or exists(select 1 from jsonb_object_keys(entry) k where k not in ('field','value'))
      or jsonb_typeof(entry->'field') is distinct from 'string' or changes ? (entry->>'field') then
      raise exception 'Each milestone field must appear once with an explicit value or clear.' using errcode='22023';end if;
    changes:=changes||jsonb_build_object(entry->>'field',entry->'value');
  end loop;
  job_id:=(p_arguments->>'target_id')::uuid;
  if p_arguments->'milestone_id'='null'::jsonb then milestone_id:=gen_random_uuid();
  else milestone_id:=(p_arguments->>'milestone_id')::uuid;end if;
  select booking_api.route_milestone_values(m) into before_value from public."Job_RouteMilestones" m
    where m."JobRouteMilestone_ID"=milestone_id and m."JobRouteMilestone_JobRouteID"::text=p_arguments->>'route_id';
  after_value:=booking_api.save_route_milestone(actor,job_id,jsonb_build_object('id',milestone_id,'routeId',p_arguments->'route_id',
    'type',p_arguments->'type','expectedUpdatedAt',p_arguments->'expected_updated_at',
    'expectedRouteUpdatedAt',p_arguments->'expected_route_updated_at','expectedMilestoneUpdatedAt',p_arguments->'expected_milestone_updated_at',
    'changes',changes,'reason',p_arguments->'reason'));
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID"=job_id;
  if before_value is distinct from after_value then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(p_company_id,job_id,'dexter_milestone_recorded','Approved routing milestone recorded',
        jsonb_build_object('milestoneId',milestone_id,'before',before_value,'after',after_value,'reason',p_arguments->>'reason','entryPoint','dexter'),p_user_id);
  end if;
  return jsonb_build_object('recordId',milestone_id,'bookingId',job_id,'bookingReference',reference,'before',before_value,'after',after_value,
    'updatedAt',(select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job_id),'sourceUrl','/bookings/'||lower(reference));
exception when invalid_text_representation then
  raise exception 'Choose valid Booking, route and milestone identities.' using errcode='22023';
end $$;

create function public._multideck_dexter_milestone_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare company uuid;reference text;job_id uuid;leg_number integer;name text;before_value jsonb;after_value jsonb;
begin
  if new."JobRouteMilestone_Source" is distinct from 'operator' or new."JobRouteMilestone_Type"='customs_released'
    or new."JobRouteMilestone_TrackingEventID" is not null then return new;end if;
  select o."Company_ID",j."Job_BookingReference",j."Job_ID",r."JobRoute_OrderNo",coalesce(t."JMT_Name",new."JobRouteMilestone_Type")
    into company,reference,job_id,leg_number,name from public."Job_Routing" r
    join public."Job_Header" j on j."Job_ID"=r."Job_ID" and not j."Job_IsDeleted"
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    left join public."sys_JobMilestoneTypes" t on t."JMT_Code"=new."JobRouteMilestone_Type"
    where r."JobRoute_ID"=new."JobRouteMilestone_JobRouteID";
  if company is null or not exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=company
    and w."AIDexterWatch_CapabilityCode"='booking_milestones' and w."AIDexterWatch_TargetID"=new."JobRouteMilestone_ID"
    and w."AIDexterWatch_StatusCode"='active') then return new;end if;
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.route_milestone_values(old) end;
  after_value:=booking_api.route_milestone_values(new);
  if before_value=after_value then return new;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_milestones','Job_RouteMilestones',new."JobRouteMilestone_ID",before_value,
      after_value||jsonb_build_object('bookingId',job_id,'bookingReference',reference,'legNumber',leg_number,'name',name,'sourceUrl','/bookings/'||lower(reference)));
  return new;
end $$;
create trigger "TR_Job_RouteMilestones_dexter_watch" after insert or update on public."Job_RouteMilestones"
  for each row execute function public._multideck_dexter_milestone_watch_change();

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values
  ('booking_milestones','Booking routing milestones','Exact saved milestones with independent planned, estimated and actual times, source and mode evidence. Search by exact Booking reference, Booking/leg/milestone ID. A limited list is not complete history. Customs release excluded.','multideck_dexter_domain_booking_milestones','["Bookings.Read"]','["operational"]'),
  ('booking_milestone_types','Operational milestone choices','Current active operational milestone codes and names. Read before proposing a new milestone. Customs release excluded.','multideck_dexter_domain_booking_milestone_types','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval") values
  ('record_booking_milestone','booking_milestones','Record or correct routing milestone','Always requires explicit approval, including Full access. For a new event read booking_routes and booking_milestone_types; milestone_id and expected_milestone_updated_at must be null. For a correction read the exact booking_milestones record and all three timestamps. Supply only changed fields. Completed requires actualAt; use one proposal for both. Explicit offset required; never infer a time. Provider/Customs edits, deletion, source changes and relabelling old-mode evidence are unavailable. Voiding retains history.',
    'multideck_dexter_action_record_booking_milestone',
    '{"type":"object","properties":{"target_id":{"type":"string"},"route_id":{"type":"string"},"milestone_id":{"type":["string","null"]},"type":{"type":"string"},"expected_updated_at":{"type":"string"},"expected_route_updated_at":{"type":"string"},"expected_milestone_updated_at":{"type":["string","null"]},"changes":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"object","properties":{"field":{"type":"string","enum":["status","plannedAt","estimatedAt","actualAt","locationUnlocode","location","externalReference","notes"]},"value":{"type":["string","null"]}},"required":["field","value"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","route_id","milestone_id","type","expected_updated_at","expected_route_updated_at","expected_milestone_updated_at","changes","reason"],"additionalProperties":false}',
    '["Bookings.Read","Bookings.Write"]','record_booking_milestone',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values
  ('booking_milestones','Booking milestone changes','Notify on a saved field change or a specific status on one exact operator-recorded milestone. Record a planned milestone first to follow its future completion. No deadline timers, tracking ingestion or autonomous writes.',
    '["status","plannedAt","estimatedAt","actualAt","locationUnlocode","location","externalReference","notes"]','["Bookings.Read"]');

do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='(''booking_allocations'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review milestone watch owner guard';end if;
  definition:=replace(definition,marker,'(''booking_milestones'',''booking_allocations'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  marker:='(''booking_allocations'',''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review milestone change-event semantics';end if;
  definition:=replace(definition,marker,'(''booking_milestones'',''booking_allocations'',''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  marker:='insert into public."AI_DexterWatchEvents" (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review milestone notification routing';end if;
  execute replace(definition,marker,$copy$
    if watch."AIDexterWatch_CapabilityCode"='booking_milestones' then
      v_event_body:=coalesce(new."AIDexterWatchSignal_NewJSON"->>'bookingReference','Booking')||' · Leg '
        ||coalesce(new."AIDexterWatchSignal_NewJSON"->>'legNumber','?')||' · '
        ||coalesce(new."AIDexterWatchSignal_NewJSON"->>'name','Milestone')||': '
        ||case watch."AIDexterWatch_RuleJSON"->>'field' when 'plannedAt' then 'planned time' when 'estimatedAt' then 'estimated time'
          when 'actualAt' then 'actual time' when 'locationUnlocode' then 'location code' when 'externalReference' then 'external reference'
          when 'status' then 'status' when 'location' then 'location' else 'notes' end||' changed. Review the saved milestone for details.';
      v_changed:=v_changed||jsonb_build_object('sourceUrl',new."AIDexterWatchSignal_NewJSON"->>'sourceUrl');
    end if;
    $copy$||marker);
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='(''replace_booking_allocations'',''update_quote_cargo'',''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review milestone mandatory approval guard';end if;
  execute replace(definition,marker,'(''record_booking_milestone'',''replace_booking_allocations'',''update_quote_cargo'',''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')');
end $patch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_milestones_20260907;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;record jsonb;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_milestones' then
    record:=public.multideck_dexter_domain_booking_milestones(context.company_id,p_target_id::text,1)->0;
    if public.multideck_dexter_can_read_cargo_watch(context.company_id) is not true or p_target_id is null
      or record->>'recordId' is distinct from p_target_id::text or record->>'source' is distinct from 'operator'
      or record->>'operatorEditable' is distinct from 'true' then
      raise exception 'Choose an exact active operator milestone in this workspace.' using errcode='42501';end if;
    if p_action is not null or (
      p_rule->>'operator'='changed' or (p_rule->>'operator'='eq' and p_rule->>'field'='status'
        and p_rule->>'value' in ('planned','completed','exception','voided'))) is not true then
      raise exception 'Watch a saved field change or a milestone reaching a specific status. Edits need fresh approval.' using errcode='22023';end if;
  end if;
  return public._multideck_dexter_create_watch_before_milestones_20260907(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Milestone watches require current Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'booking_milestones' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_milestones_20260907;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_milestones_20260907()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_milestones' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function public._multideck_dexter_milestone_watch_change(),
  public._multideck_dexter_create_watch_before_milestones_20260907(text,text,text,text,uuid,text,jsonb,jsonb),
  public._multideck_dexter_list_watches_before_milestones_20260907() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_booking_milestones(uuid,text,integer),
  public.multideck_dexter_domain_booking_milestone_types(uuid,text,integer),public.multideck_dexter_action_record_booking_milestone(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_milestones(uuid,text,integer),
  public.multideck_dexter_domain_booking_milestone_types(uuid,text,integer),public.multideck_dexter_action_record_booking_milestone(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
