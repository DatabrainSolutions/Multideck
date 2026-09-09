begin;
set local lock_timeout='5s';

-- Mode-specific evidence uses the actual leg mode, never the Booking header.
-- Retained off-mode fields remain stored and in audit, not presented as current.
create function booking_api.route_dexter_values(item public."Job_Routing")
returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
  select jsonb_build_object('recordId',item."JobRoute_ID",'legNumber',item."JobRoute_OrderNo",'mode',item."JobRoute_ModeCode",
    'status',item."JobRoute_Status",'origin',item."JobRoute_OriginNameSnapshot",'originUnlocode',item."JobRoute_OriginUNLocode",
    'destination',item."JobRoute_DestinationNameSnapshot",'destinationUnlocode',item."JobRoute_DestinationUNLocode",
    'plannedPickupAt',item."JobRoute_PlannedPickupAt",'plannedDepartureAt',item."JobRoute_PlannedDepartureAt",
    'plannedArrivalAt',item."JobRoute_PlannedArrivalAt",'plannedDeliveryAt',item."JobRoute_PlannedDeliveryAt",
    'carrierBookingReference',item."JobRoute_CarrierBookingReference",'masterTransportReference',item."JobRoute_MasterTransportReference",
    'houseTransportReference',item."JobRoute_HouseTransportReference",'serviceLevel',item."JobRoute_ServiceLevel",
    'transportMeansName',item."JobRoute_TransportMeansName",
    'vessel',case when item."JobRoute_ModeCode"='sea' then item."JobRoute_Vessel" end,
    'voyageNumber',case when item."JobRoute_ModeCode"='sea' then item."JobRoute_VoyageNumber" end,
    'flightNumber',case when item."JobRoute_ModeCode"='air' then item."JobRoute_FlightNumber" end,
    'vehicleRegistration',case when item."JobRoute_ModeCode" in ('road','courier') then item."JobRoute_VehicleRegistration" end,
    'trailerNumber',case when item."JobRoute_ModeCode" in ('road','courier') then item."JobRoute_TrailerNumber" end,
    'railService',case when item."JobRoute_ModeCode"='rail' then item."JobRoute_RailService" end);
$$;

create function public.multideck_dexter_domain_booking_routes(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by booking_reference,leg_number,route_id),'[]'::jsonb) from (
    select booking_api.route_dexter_values(route)||jsonb_build_object(
      'bookingId',job."Job_ID",'bookingReference',job."Job_BookingReference",'updatedAt',job."Job_UpdatedAt",
      'routeUpdatedAt',route."JobRoute_UpdatedAt",'sourceTable','Job_Routing','sourceUrl','/bookings/'||lower(job."Job_BookingReference"),
      'targetLabel',job."Job_BookingReference"||' · Leg '||route."JobRoute_OrderNo"||' · '||coalesce(route."JobRoute_ModeCode",'Unspecified')) result,
      job."Job_BookingReference" booking_reference,route."JobRoute_OrderNo" leg_number,route."JobRoute_ID" route_id
    from public."Job_Routing" route join public."Job_Header" job on job."Job_ID"=route."Job_ID" and not job."Job_IsDeleted"
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") and office."Company_ID"=p_company_id
    where nullif(btrim(p_search),'') is null or route."JobRoute_ID"::text=btrim(p_search) or job."Job_ID"::text=btrim(p_search)
      or job."Job_BookingReference" ilike '%'||btrim(p_search)||'%'
    order by job."Job_BookingReference",route."JobRoute_OrderNo",route."JobRoute_ID"
    limit greatest(1,least(coalesce(p_take,10),25))
  ) selected;
$$;

create function public.multideck_dexter_action_update_booking_route(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_auth_id uuid;job_row public."Job_Header";route_row public."Job_Routing";
  job_id uuid;route_id uuid;field_name text;field_value jsonb;text_value text;max_length integer;date_value timestamptz;
  lines jsonb;saved jsonb;result_values jsonb;
begin
  select "Auth_User_ID" into actor_auth_id from public."cmp_Users"
    where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor_auth_id is null or not booking_api.has_permission(actor_auth_id,'Bookings.Read')
    or not booking_api.has_permission(actor_auth_id,'Bookings.Write') then
    raise exception 'You do not have permission to edit booking routing.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object'
    or not (p_arguments ?& array['target_id','route_id','expected_updated_at','expected_route_updated_at','field','value','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) key where key not in
      ('target_id','route_id','expected_updated_at','expected_route_updated_at','field','value','reason'))
    or nullif(btrim(p_arguments->>'reason'),'') is null then
    raise exception 'Provide an exact routing field change and its reason.' using errcode='22023';end if;
  job_id:=nullif(p_arguments->>'target_id','')::uuid;route_id:=nullif(p_arguments->>'route_id','')::uuid;
  field_name:=p_arguments->>'field';field_value:=p_arguments->'value';text_value:=nullif(btrim(p_arguments->>'value'),'');
  if field_name is null or field_name not in ('carrierBookingReference','masterTransportReference','houseTransportReference',
    'serviceLevel','transportMeansName','vessel','voyageNumber','flightNumber','vehicleRegistration','trailerNumber','railService',
    'plannedPickupAt','plannedDepartureAt','plannedArrivalAt','plannedDeliveryAt') or jsonb_typeof(field_value) not in ('string','null') then
    raise exception 'That routing field is not available for this approved action.' using errcode='22023';end if;
  if field_name like 'planned%At' and text_value is not null then
    if text_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then date_value:=text_value::date::timestamp at time zone 'UTC';
    elsif text_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' then date_value:=text_value::timestamptz;
    else raise exception 'Use an ISO date or a timestamp with an explicit timezone.' using errcode='22023';end if;
    field_value:=to_jsonb(date_value);
  else
    max_length:=case when field_name in ('vessel','voyageNumber') then 50 when field_name='flightNumber' then 40
      when field_name in ('serviceLevel','vehicleRegistration','trailerNumber','railService') then 80 else 160 end;
    if length(text_value)>max_length then raise exception 'That routing value exceeds its supported length.' using errcode='22023';end if;
    field_value:=coalesce(to_jsonb(text_value),'null'::jsonb);
  end if;
  select job.* into job_row from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=job_id and office."Company_ID"=p_company_id and not job."Job_IsDeleted" for update of job;
  if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
  select * into route_row from public."Job_Routing" where "JobRoute_ID"=route_id and "Job_ID"=job_id for update;
  if not found then raise exception 'Choose an exact routing leg from this booking.' using errcode='42501';end if;
  if nullif(p_arguments->>'expected_updated_at','') is null or job_row."Job_UpdatedAt" is distinct from (p_arguments->>'expected_updated_at')::timestamptz
    or nullif(p_arguments->>'expected_route_updated_at','') is null or route_row."JobRoute_UpdatedAt" is distinct from (p_arguments->>'expected_route_updated_at')::timestamptz then
    raise exception 'The booking or routing leg changed. Read it again and request fresh approval.' using errcode='40001';end if;
  if (field_name in ('vessel','voyageNumber') and route_row."JobRoute_ModeCode" is distinct from 'sea')
    or (field_name='flightNumber' and route_row."JobRoute_ModeCode" is distinct from 'air')
    or (field_name in ('vehicleRegistration','trailerNumber') and coalesce(route_row."JobRoute_ModeCode",'') not in ('road','courier'))
    or (field_name='railService' and route_row."JobRoute_ModeCode" is distinct from 'rail') then
    raise exception 'That field does not belong to this leg mode. Review the exact leg in Booking Details.' using errcode='22023';end if;
  saved:=booking_api.workspace_extended(actor_auth_id,job_row."Job_BookingReference");
  select jsonb_agg(case when line->>'id'=route_id::text then line||jsonb_build_object(field_name,field_value) else line end order by ordinal)
    into lines from jsonb_array_elements(saved->'routes') with ordinality entries(line,ordinal);
  if not exists(select 1 from jsonb_array_elements(lines) line where line->>'id'=route_id::text) then
    raise exception 'The routing workspace changed. Reload before approving.' using errcode='40001';end if;
  saved:=public.booking_workflow_save(actor_auth_id,job_id,jsonb_build_object('routes',lines));
  select booking_api.route_dexter_values(route) into result_values from public."Job_Routing" route where "JobRoute_ID"=route_id;
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(p_company_id,job_id,'dexter_route_updated','Approved routing field updated',jsonb_build_object(
      'routeId',route_id,'field',field_name,'before',booking_api.route_dexter_values(route_row)->field_name,
      'after',result_values->field_name,'reason',btrim(p_arguments->>'reason')),p_user_id);
  return jsonb_build_object('recordId',route_id,'bookingId',job_id,'bookingReference',job_row."Job_BookingReference",
    'field',field_name,'before',booking_api.route_dexter_values(route_row)->field_name,'after',result_values->field_name,
    'updatedAt',saved#>'{booking,updatedAt}','routeUpdatedAt',(select "JobRoute_UpdatedAt" from public."Job_Routing" where "JobRoute_ID"=route_id),
    'sourceUrl','/bookings/'||lower(job_row."Job_BookingReference"));
end $$;

create function public._multideck_dexter_route_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare company_id uuid;booking_reference text;before_value jsonb;after_value jsonb;
begin
  select office."Company_ID",job."Job_BookingReference" into company_id,booking_reference
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=new."Job_ID" and not job."Job_IsDeleted";
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.route_dexter_values(old) end;after_value:=booking_api.route_dexter_values(new);
  if before_value=after_value or company_id is null then return new;end if;
  if not exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=company_id
    and watch."AIDexterWatch_CapabilityCode"='booking_routes' and watch."AIDexterWatch_StatusCode"='active'
    and watch."AIDexterWatch_TargetID"=new."JobRoute_ID") then return new;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company_id,'booking_routes','Job_Routing',new."JobRoute_ID",before_value,
      after_value||jsonb_build_object('bookingReference',booking_reference,'bookingId',new."Job_ID",'sourceUrl','/bookings/'||lower(booking_reference)));
  return new;
end $$;
create trigger "TR_Job_Routing_dexter_watch" after insert or update on public."Job_Routing" for each row execute function public._multideck_dexter_route_watch_change();

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
values('booking_routes','Booking routing legs','Exact routing legs, mode-specific references and planned dates. Search by Booking reference or exact route ID. Retained off-mode fields are not current evidence. No financial or raw JSON data.','multideck_dexter_domain_booking_routes','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function",
  "AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval")
values('update_booking_route','booking_routes','Edit routing leg field','Propose one operational reference or planned date on one exact leg. Always requires approval, including Full access. Read both timestamps first. No mode, location, carrier, ordering, adding/removing legs, actual/tracking dates or commercial edits. Mode changes require the Booking Details review.','multideck_dexter_action_update_booking_route',
  '{"type":"object","properties":{"target_id":{"type":"string","description":"Exact bookingId from booking_routes"},"route_id":{"type":"string","description":"Exact recordId from booking_routes"},"expected_updated_at":{"type":"string"},"expected_route_updated_at":{"type":"string"},"field":{"type":"string","enum":["carrierBookingReference","masterTransportReference","houseTransportReference","serviceLevel","transportMeansName","vessel","voyageNumber","flightNumber","vehicleRegistration","trailerNumber","railService","plannedPickupAt","plannedDepartureAt","plannedArrivalAt","plannedDeliveryAt"]},"value":{"type":["string","null"],"description":"Text, ISO date, timestamp with explicit timezone, or null to clear. Date-only values use midnight UTC."},"reason":{"type":"string"}},"required":["target_id","route_id","expected_updated_at","expected_route_updated_at","field","value","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','update_booking_route',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON")
values('booking_routes','Booking routing legs','Notify on persisted changes to one exact leg. No autonomous edits or recurring AI calls.',
  '["mode","status","origin","originUnlocode","destination","destinationUnlocode","plannedPickupAt","plannedDepartureAt","plannedArrivalAt","plannedDeliveryAt","carrierBookingReference","masterTransportReference","houseTransportReference","serviceLevel","transportMeansName","vessel","voyageNumber","flightNumber","vehicleRegistration","trailerNumber","railService"]','["Bookings.Read"]');

do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='(''booking_cargo'',''booking_containers'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review current watch guards before routing parity';end if;
  execute replace(definition,marker,'(''booking_cargo'',''booking_containers'',''booking_routes'')');
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='(''update_booking_cargo'',''update_booking_container'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review prepared approval guards before routing parity';end if;
  execute replace(definition,marker,'(''update_booking_cargo'',''update_booking_container'',''update_booking_route'')');
end $patch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_routes_20260905;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_routes' then
    if not public.multideck_dexter_can_read_cargo_watch(context.company_id) or p_target_id is null or not exists(
      select 1 from public."Job_Routing" route join public."Job_Header" job on job."Job_ID"=route."Job_ID" and not job."Job_IsDeleted"
      join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
      where route."JobRoute_ID"=p_target_id and office."Company_ID"=context.company_id) then
      raise exception 'Choose an exact routing leg in this workspace.' using errcode='42501';end if;
    if p_action is not null then raise exception 'Routing watches notify only. Edits need a fresh approved proposal.' using errcode='42501';end if;
  end if;
  return public._multideck_dexter_create_watch_before_routes_20260905(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Routing watches require current Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'booking_routes' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_routes_20260905;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_routes_20260905()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_routes' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function booking_api.route_dexter_values(public."Job_Routing"),public._multideck_dexter_route_watch_change(),
  public._multideck_dexter_create_watch_before_routes_20260905(text,text,text,text,uuid,text,jsonb,jsonb),public._multideck_dexter_list_watches_before_routes_20260905()
  from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_booking_routes(uuid,text,integer),public.multideck_dexter_action_update_booking_route(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_routes(uuid,text,integer),public.multideck_dexter_action_update_booking_route(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
