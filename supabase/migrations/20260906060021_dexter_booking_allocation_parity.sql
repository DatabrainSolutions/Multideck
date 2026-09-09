begin;
set local lock_timeout='5s';

-- Private, explicit evidence projection. No financial values or raw source JSON.
create function booking_api.allocation_review_values(job_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'allocations',coalesce((select jsonb_agg(booking_api.allocation_values(a)-'archived' order by a.id)
      from booking_api.cargo_equipment_allocations a where a.job_id=$1 and not a.is_deleted),'[]'::jsonb),
    'cargo',coalesce((select jsonb_agg(jsonb_build_object('id',c."JobCargo_ID",'description',c."JobCargo_Description",
      'packageQuantity',c."JobCargo_PackageQty"::text,'grossWeightKg',c."JobCargo_GrossKilos"::text,'volumeCbm',c."JobCargo_VolumeCBM"::text) order by c."JobCargo_ID")
      from public."Job_Cargo" c where c."JobCargo_JobID"=$1 and not c."JobCargo_IsDeleted"),'[]'::jsonb),
    'equipment',coalesce((select jsonb_agg(jsonb_build_object('id',e."JobContainers_ID",'number',e."JobContainer_Number",'type',e."JobContainer_TypeCodeSnapshot") order by e."JobContainers_ID")
      from public."Job_Containers" e where e."Job_ID"=$1 and not e."JobContainer_IsDeleted"),'[]'::jsonb),
    'routes',coalesce((select jsonb_agg(jsonb_build_object('id',r."JobRoute_ID",'order',r."JobRoute_OrderNo",'mode',r."JobRoute_ModeCode") order by r."JobRoute_ID")
      from public."Job_Routing" r where r."Job_ID"=$1),'[]'::jsonb))
$$;

create function public.multideck_dexter_domain_booking_allocations(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(evidence||jsonb_build_object('recordId',j."Job_ID",'bookingId',j."Job_ID",
    'bookingReference',j."Job_BookingReference",'allocationScope','booking_plan','updatedAt',j."Job_UpdatedAt",
    'reviewHash',md5(evidence::text),'complete',true,'sourceTable','booking_api.cargo_equipment_allocations',
    'sourceUrl','/bookings/'||lower(j."Job_BookingReference"),'targetLabel',j."Job_BookingReference"||' · Cargo allocation plan')),'[]'::jsonb)
  from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
  cross join lateral (select booking_api.allocation_review_values(j."Job_ID") evidence) plan
  where not j."Job_IsDeleted" and o."Company_ID"=p_company_id and nullif(btrim(p_search),'') is not null
    and (j."Job_ID"::text=btrim(p_search) or lower(j."Job_BookingReference")=lower(btrim(p_search)))
$$;

create function public.multideck_dexter_action_replace_booking_allocations(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;job public."Job_Header";before_value jsonb;after_value jsonb;saved jsonb;job_id uuid;
begin
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or not booking_api.has_permission(actor,'Bookings.Read') or not booking_api.has_permission(actor,'Bookings.Write') then
    raise exception 'Booking allocation changes are not authorised.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object' or not(p_arguments ?& array['target_id','expected_updated_at','expected_review_hash','allocations','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) key where key not in ('target_id','expected_updated_at','expected_review_hash','allocations','reason'))
    or jsonb_typeof(p_arguments->'reason') is distinct from 'string' or nullif(btrim(p_arguments->>'reason'),'') is null
    or length(p_arguments->>'reason')>2000 or jsonb_typeof(p_arguments->'allocations') is distinct from 'array'
    or jsonb_typeof(p_arguments->'expected_review_hash') is distinct from 'string' then
    raise exception 'Provide the complete reviewed allocation plan and a reason.' using errcode='22023';end if;
  job_id:=(p_arguments->>'target_id')::uuid;
  select j.* into job from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=job_id and not j."Job_IsDeleted" and o."Company_ID"=p_company_id for update of j;
  if not found then raise exception 'Choose a Booking in this workspace.' using errcode='42501';end if;
  before_value:=booking_api.allocation_review_values(job_id);
  if md5(before_value::text) is distinct from p_arguments->>'expected_review_hash' then
    raise exception 'Allocation evidence changed. Read it again and request fresh approval.' using errcode='40001';end if;
  -- Canonical transaction owns all membership, precision, quantity, retirement,
  -- scope and optimistic Job checks. Omitted identities are explicitly removed.
  saved:=public.booking_workflow_save(actor,job_id,jsonb_build_object('expectedUpdatedAt',p_arguments->'expected_updated_at','cargoAllocations',p_arguments->'allocations'));
  after_value:=booking_api.allocation_review_values(job_id);
  if before_value->'allocations' is distinct from after_value->'allocations' then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(p_company_id,job_id,'dexter_allocations_updated','Approved cargo allocation plan updated',
        jsonb_build_object('before',before_value->'allocations','after',after_value->'allocations','reason',btrim(p_arguments->>'reason')),p_user_id);
  end if;
  return jsonb_build_object('recordId',job_id,'bookingId',job_id,'bookingReference',job."Job_BookingReference",
    'before',before_value->'allocations','after',after_value->'allocations','updatedAt',saved#>'{booking,updatedAt}',
    'reviewHash',md5(after_value::text),'sourceUrl','/bookings/'||lower(job."Job_BookingReference"));
end $$;

-- One deterministic signal per successfully reconciled plan, not one per row
-- or intermediate slot swap. UI and Dexter share this boundary. Rolled-back
-- validation failures roll back signals/notifications too. No periodic model.
alter function booking_api.replace_cargo_allocations(uuid,uuid,jsonb) rename to replace_cargo_allocations_before_watches_20260906;
create function booking_api.replace_cargo_allocations(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare before_value jsonb;after_value jsonb;result jsonb;company uuid;reference text;
begin
  perform booking_api.cargo_allocation_state(caller_auth_user_id,requested_job_id);
  select o."Company_ID",j."Job_BookingReference" into company,reference from public."Job_Header" j
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=requested_job_id for update of j;
  before_value:=booking_api.allocation_review_values(requested_job_id)->'allocations';
  result:=booking_api.replace_cargo_allocations_before_watches_20260906(caller_auth_user_id,requested_job_id,payload);
  after_value:=booking_api.allocation_review_values(requested_job_id)->'allocations';
  if before_value is distinct from after_value and exists(select 1 from public."AI_DexterWatches" w
    where w."AIDexterWatch_CompanyID"=company and w."AIDexterWatch_CapabilityCode"='booking_allocations'
      and w."AIDexterWatch_TargetID"=requested_job_id and w."AIDexterWatch_StatusCode"='active') then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_allocations','booking_api.cargo_equipment_allocations',requested_job_id,
      jsonb_build_object('allocations',before_value),jsonb_build_object('allocations',after_value,'bookingReference',reference,
        'bookingId',requested_job_id,'sourceUrl','/bookings/'||lower(reference)));
  end if;
  return result;
end $$;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
values('booking_allocations','Booking cargo allocation plan','Read one complete plan by exact Booking reference or ID. Includes saved cargo/equipment/leg identities and cargo totals. Empty search returns no records. No prices, container totals, VGM or legacy quantity inference.',
  'multideck_dexter_domain_booking_allocations','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval")
values('replace_booking_allocations','booking_allocations','Review cargo allocation plan','Always requires explicit approval. Read a complete booking_allocations plan first. Retain unchanged rows; show every addition, edit and removal. Existing IDs remain stable; new rows need fresh UUIDs. Omitted rows are retired. Saves the complete plan atomically; no cargo, equipment totals, VGM or Quote changes.',
  'multideck_dexter_action_replace_booking_allocations',
  '{"type":"object","properties":{"target_id":{"type":"string"},"expected_updated_at":{"type":"string"},"expected_review_hash":{"type":"string"},"allocations":{"type":"array","maxItems":1000,"items":{"type":"object","properties":{"id":{"type":"string"},"cargoId":{"type":"string"},"containerId":{"type":"string"},"routeId":{"type":["string","null"]},"packageQuantity":{"type":["string","null"]},"grossWeightKg":{"type":["string","null"]},"volumeCbm":{"type":["string","null"]},"notes":{"type":["string","null"]}},"required":["id","cargoId","containerId","routeId","packageQuantity","grossWeightKg","volumeCbm","notes"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","expected_updated_at","expected_review_hash","allocations","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','replace_booking_allocations',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON")
values('booking_allocations','Booking cargo allocation plan','One notification for a saved allocation-plan change on the selected Booking. Includes additions, edits and removals. No autonomous edits or recurring AI calls. Legacy unquantified links and direct unsupported SQL edits are not this capability.',
  '["allocations"]','["Bookings.Read"]');

do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='(''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review allocation watch owner guard';end if;
  definition:=replace(definition,marker,'(''booking_allocations'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  marker:='(''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review allocation changed-event semantics';end if;
  definition:=replace(definition,marker,'(''booking_allocations'',''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  marker:='insert into public."AI_DexterWatchEvents" (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review allocation notification copy';end if;
  execute replace(definition,marker,$copy$
    if watch."AIDexterWatch_CapabilityCode"='booking_allocations' then
      v_event_body:=coalesce(new."AIDexterWatchSignal_NewJSON"->>'bookingReference',watch."AIDexterWatch_TargetLabel",'Booking')
        ||': cargo allocation plan changed ('||jsonb_array_length(new."AIDexterWatchSignal_OldJSON"->'allocations')
        ||' allocations before, '||jsonb_array_length(new."AIDexterWatchSignal_NewJSON"->'allocations')||' now). Review the Booking for details.';
      v_changed:=v_changed||jsonb_build_object('sourceUrl',new."AIDexterWatchSignal_NewJSON"->>'sourceUrl');
    end if;
    $copy$||marker);
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='(''update_quote_cargo'',''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review allocation mandatory approval guard';end if;
  execute replace(definition,marker,'(''replace_booking_allocations'',''update_quote_cargo'',''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')');
end $patch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_allocations_20260906;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_allocations' then
    if not public.multideck_dexter_can_read_cargo_watch(context.company_id) or p_target_id is null
      or jsonb_array_length(public.multideck_dexter_domain_booking_allocations(context.company_id,p_target_id::text,1))<>1 then
      raise exception 'Choose one exact Booking in this workspace.' using errcode='42501';end if;
    if p_action is not null or p_rule->>'operator' is distinct from 'changed' then
      raise exception 'Allocation watches notify on saved changes only. Edits need fresh approval.' using errcode='22023';end if;
  end if;
  return public._multideck_dexter_create_watch_before_allocations_20260906(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Allocation watches require Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'booking_allocations' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_allocations_20260906;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_allocations_20260906()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_allocations' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function booking_api.allocation_review_values(uuid),booking_api.replace_cargo_allocations_before_watches_20260906(uuid,uuid,jsonb),
  booking_api.replace_cargo_allocations(uuid,uuid,jsonb),public._multideck_dexter_create_watch_before_allocations_20260906(text,text,text,text,uuid,text,jsonb,jsonb),
  public._multideck_dexter_list_watches_before_allocations_20260906() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_booking_allocations(uuid,text,integer),public.multideck_dexter_action_replace_booking_allocations(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_allocations(uuid,text,integer),public.multideck_dexter_action_replace_booking_allocations(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
