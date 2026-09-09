-- Exact equipment evidence, approved single-field edits and deterministic watches.
begin;
set local lock_timeout='5s';

create function booking_api.container_dexter_values(item public."Job_Containers")
returns jsonb language sql immutable set search_path='' as $$
  select booking_api.container_operational_values(item)||jsonb_build_object(
    'recordId',item."JobContainers_ID",'containerNumber',item."JobContainer_Number",
    'containerType',item."JobContainer_TypeCodeSnapshot",'equipmentKind',item."JobContainer_EquipmentKind",
    'status',item."JobContainer_Status",'archived',item."JobContainer_IsDeleted");
$$;

create function public.multideck_dexter_domain_booking_containers(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by booking_reference,container_id),'[]'::jsonb) from (
    select booking_api.container_dexter_values(container)||jsonb_build_object(
      'bookingId',job."Job_ID",'bookingReference',job."Job_BookingReference",
      'updatedAt',job."Job_UpdatedAt",'containerUpdatedAt',container."JobContainer_UpdatedAt",
      'sourceTable','Job_Containers','sourceUrl','/bookings/'||lower(job."Job_BookingReference"),
      'targetLabel',job."Job_BookingReference"||' · Container '||coalesce(nullif(container."JobContainer_Number",''),container."JobContainers_ID"::text)
    ) result,job."Job_BookingReference" booking_reference,container."JobContainers_ID" container_id
    from public."Job_Containers" container
    join public."Job_Header" job on job."Job_ID"=container."Job_ID" and not job."Job_IsDeleted"
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") and office."Company_ID"=p_company_id
    where not container."JobContainer_IsDeleted" and (
      nullif(btrim(p_search),'') is null or container."JobContainers_ID"::text=btrim(p_search)
      or job."Job_ID"::text=btrim(p_search) or job."Job_BookingReference" ilike '%'||btrim(p_search)||'%'
      or container."JobContainer_Number" ilike '%'||btrim(p_search)||'%')
    order by job."Job_BookingReference",container."JobContainers_ID"
    limit greatest(1,least(coalesce(p_take,10),25))
  ) selected;
$$;

create function public.multideck_dexter_action_update_booking_container(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_auth_id uuid; job_row public."Job_Header"; container_row public."Job_Containers";
  job_id uuid; container_id uuid; field_name text; field_value jsonb; lines jsonb; saved jsonb;
begin
  select "Auth_User_ID" into actor_auth_id from public."cmp_Users"
    where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor_auth_id is null or not booking_api.has_permission(actor_auth_id,'Bookings.Read')
    or not booking_api.has_permission(actor_auth_id,'Bookings.Write') then
    raise exception 'You do not have permission to edit booking containers.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object'
    or not (p_arguments ?& array['target_id','container_id','expected_updated_at','expected_container_updated_at','field','value','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) key where key not in
      ('target_id','container_id','expected_updated_at','expected_container_updated_at','field','value','reason'))
    or nullif(btrim(p_arguments->>'reason'),'') is null then
    raise exception 'Provide an exact container field change and its reason.' using errcode='22023';end if;
  job_id:=nullif(p_arguments->>'target_id','')::uuid;container_id:=nullif(p_arguments->>'container_id','')::uuid;
  field_name:=p_arguments->>'field';field_value:=p_arguments->'value';
  if field_name is null or field_name not in ('grossWeightKg','tareWeightKg','verifiedGrossMassKg','vgmMethod','reeferSetPoint','reeferUnit')
    or jsonb_typeof(field_value) not in ('string','null') then
    raise exception 'Choose an available container field and use exact text or null to clear it.' using errcode='22023';end if;
  -- Use the same decimal, range and enum validation as the Booking editor.
  field_value:=booking_api.normalise_container_operations(jsonb_build_array(jsonb_build_object(field_name,field_value)))->0->field_name;
  select job.* into job_row from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=job_id and office."Company_ID"=p_company_id and not job."Job_IsDeleted" for update of job;
  if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
  select * into container_row from public."Job_Containers"
    where "JobContainers_ID"=container_id and "Job_ID"=job_id and not "JobContainer_IsDeleted" for update;
  if not found then raise exception 'Choose an active container from this booking.' using errcode='42501';end if;
  if nullif(p_arguments->>'expected_updated_at','') is null
    or job_row."Job_UpdatedAt" is distinct from (p_arguments->>'expected_updated_at')::timestamptz
    or nullif(p_arguments->>'expected_container_updated_at','') is null
    or container_row."JobContainer_UpdatedAt" is distinct from (p_arguments->>'expected_container_updated_at')::timestamptz then
    raise exception 'The booking or container changed since this proposal. Read it again and request fresh approval.' using errcode='40001';end if;
  saved:=booking_api.workspace_extended(actor_auth_id,job_row."Job_BookingReference");
  select jsonb_agg(case when line->>'id'=container_id::text then line||jsonb_build_object(field_name,field_value) else line end order by ordinal)
    into lines from jsonb_array_elements(saved->'containers') with ordinality entries(line,ordinal);
  if not exists(select 1 from jsonb_array_elements(lines) line where line->>'id'=container_id::text) then
    raise exception 'The container workspace changed. Reload before approving.' using errcode='40001';end if;
  saved:=public.booking_workflow_save(actor_auth_id,job_id,jsonb_build_object('containers',lines));
  select booking_api.container_operational_values(container)->field_name into field_value
    from public."Job_Containers" container where "JobContainers_ID"=container_id;
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(p_company_id,job_id,'dexter_container_updated','Approved container field updated',
      jsonb_build_object('containerId',container_id,'field',field_name,
        'before',booking_api.container_operational_values(container_row)->field_name,'after',field_value,
        'reason',btrim(p_arguments->>'reason')),p_user_id);
  return jsonb_build_object('recordId',container_id,'bookingId',job_id,'bookingReference',job_row."Job_BookingReference",
    'field',field_name,'before',booking_api.container_operational_values(container_row)->field_name,'after',field_value,
    'updatedAt',saved#>'{booking,updatedAt}',
    'containerUpdatedAt',(select "JobContainer_UpdatedAt" from public."Job_Containers" where "JobContainers_ID"=container_id),
    'sourceUrl','/bookings/'||lower(job_row."Job_BookingReference"));
end $$;

create function public._multideck_dexter_container_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare company_id uuid; booking_reference text; before_value jsonb; after_value jsonb;
begin
  select office."Company_ID",job."Job_BookingReference" into company_id,booking_reference
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=new."Job_ID" and not job."Job_IsDeleted";
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.container_dexter_values(old) end;
  after_value:=booking_api.container_dexter_values(new);
  if before_value=after_value or company_id is null then return new;end if;
  if not exists(select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=company_id and watch."AIDexterWatch_CapabilityCode"='booking_containers'
      and watch."AIDexterWatch_StatusCode"='active' and watch."AIDexterWatch_TargetID"=new."JobContainers_ID") then return new;end if;
  insert into public."AI_DexterWatchSignals"(
    "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company_id,'booking_containers','Job_Containers',new."JobContainers_ID",before_value,
      after_value||jsonb_build_object('bookingReference',booking_reference,'bookingId',new."Job_ID",'sourceUrl','/bookings/'||lower(booking_reference)));
  return new;
end $$;
create trigger "TR_Job_Containers_dexter_watch" after insert or update on public."Job_Containers"
  for each row execute function public._multideck_dexter_container_watch_change();

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction",
  "AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values (
  'booking_containers','Booking containers','Exact active container IDs, typed weight verification and temperature evidence. Search by Booking reference, container number or ID. Decimal values are exact text. No costs, prices, margins or raw JSON.',
  'multideck_dexter_domain_booking_containers','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval") values (
  'update_booking_container','booking_containers','Edit container operational field',
  'Propose one exact container weight or temperature field for explicit approval, including in Full access. Read current booking and container timestamps first. Preserve decimal text. Never infer VGM from cargo weight or claim to certify or submit a declaration. No adding, removing, reallocating or commercial edits.',
  'multideck_dexter_action_update_booking_container',
  '{"type":"object","properties":{"target_id":{"type":"string","description":"Exact bookingId from booking_containers"},"container_id":{"type":"string","description":"Exact recordId from booking_containers"},"expected_updated_at":{"type":"string","description":"Exact updatedAt from the latest read"},"expected_container_updated_at":{"type":"string","description":"Exact containerUpdatedAt from the latest read"},"field":{"type":"string","enum":["grossWeightKg","tareWeightKg","verifiedGrossMassKg","vgmMethod","reeferSetPoint","reeferUnit"]},"value":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","container_id","expected_updated_at","expected_container_updated_at","field","value","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','update_booking_container',true);
insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values (
  'booking_containers','Booking containers','Notify on saved field changes to one exact container. Exact decimal text supports numeric thresholds. No autonomous edits or recurring AI calls.',
  '["containerNumber","containerType","equipmentKind","status","grossWeightKg","tareWeightKg","verifiedGrossMassKg","vgmMethod","reeferSetPoint","reeferUnit","archived"]','["Bookings.Read"]');

-- Extend only the existing cargo-specific security/event rules, preserving
-- unrelated capabilities, threshold latching and the prepared-action checks.
do $patch$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='watch_row."AIDexterWatch_CapabilityCode" <> ''booking_cargo''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review current watch owner guards before container parity';end if;
  definition:=replace(definition,marker,'watch_row."AIDexterWatch_CapabilityCode" not in (''booking_cargo'',''booking_containers'')');
  marker:='watch."AIDexterWatch_CapabilityCode" = ''booking_cargo''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review current watch changed semantics before container parity';end if;
  execute replace(definition,marker,'watch."AIDexterWatch_CapabilityCode" in (''booking_cargo'',''booking_containers'')');
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='v_prepared."AIDexterPrepared_ActionCode"=''update_booking_cargo''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review current prepared approval guards before container parity';end if;
  execute replace(definition,marker,'v_prepared."AIDexterPrepared_ActionCode" in (''update_booking_cargo'',''update_booking_container'')');
end $patch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb)
  rename to _multideck_dexter_create_watch_before_containers_20260905;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_containers' then
    if not public.multideck_dexter_can_read_cargo_watch(context.company_id) or p_target_id is null or not exists(
      select 1 from public."Job_Containers" container join public."Job_Header" job on job."Job_ID"=container."Job_ID" and not job."Job_IsDeleted"
      join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
      where container."JobContainers_ID"=p_target_id and not container."JobContainer_IsDeleted" and office."Company_ID"=context.company_id) then
      raise exception 'Choose an exact active container in this workspace.' using errcode='42501';end if;
    if p_action is not null then raise exception 'Container watches notify only. Edits require a fresh approved proposal.' using errcode='42501';end if;
  end if;
  return public._multideck_dexter_create_watch_before_containers_20260905(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Container watches require current Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using (
  "AIDexterWatch_CapabilityCode"<>'booking_containers' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
-- The existing watch-event restrictive policy resolves its parent watch, so it
-- also applies the new container guard to history. Match it in privileged lists.
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_containers_20260905;
create function public.multideck_dexter_list_watches()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record; result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_containers_20260905()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_containers' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;

revoke all on function booking_api.container_dexter_values(public."Job_Containers"),
  public._multideck_dexter_container_watch_change(),
  public._multideck_dexter_create_watch_before_containers_20260905(text,text,text,text,uuid,text,jsonb,jsonb),
  public._multideck_dexter_list_watches_before_containers_20260905() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_booking_containers(uuid,text,integer),
  public.multideck_dexter_action_update_booking_container(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_containers(uuid,text,integer),
  public.multideck_dexter_action_update_booking_container(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
