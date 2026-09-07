begin;
set local lock_timeout='5s';

-- Screening capability, mandatory approved writes and deterministic watches.
-- Release only after current-schema rehearsal and combined feature verification.
create function public.multideck_dexter_domain_booking_security_evidence(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by reference,line_number,record_id),'[]'::jsonb) from (
    select booking_api.cargo_security_evidence_values(e)||jsonb_build_object(
      'recordId',e.id,'bookingId',j."Job_ID",'bookingReference',j."Job_BookingReference",
      'bookingUpdatedAt',j."Job_UpdatedAt",'cargoUpdatedAt',c."JobCargo_UpdatedAt",
      'lineNumber',c."JobCargo_LineNo",'cargoDescription',c."JobCargo_Description",
      'sourceTable','booking_api.cargo_security_evidence','sourceUrl','/bookings/'||lower(j."Job_BookingReference"),
      'targetLabel',j."Job_BookingReference"||' · Cargo '||c."JobCargo_LineNo"||' · Screening evidence') result,
      j."Job_BookingReference" reference,c."JobCargo_LineNo" line_number,e.id record_id
    from booking_api.cargo_security_evidence e
    join public."Job_Cargo" c on c."JobCargo_ID"=e.cargo_id and not c."JobCargo_IsDeleted"
    join public."Job_Header" j on j."Job_ID"=c."JobCargo_JobID" and not j."Job_IsDeleted"
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID") and o."Company_ID"=p_company_id
    where nullif(btrim(p_search),'') is null or e.id::text=btrim(p_search)
      or c."JobCargo_ID"::text=btrim(p_search) or j."Job_ID"::text=btrim(p_search)
      or lower(j."Job_BookingReference")=lower(btrim(p_search))
    order by j."Job_BookingReference",c."JobCargo_LineNo",e.id
    limit greatest(1,least(coalesce(p_take,10),25))
  ) selected;
$$;

create function public.multideck_dexter_action_record_booking_security_evidence(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;job_id uuid;record_id uuid;changes jsonb:='{}';entry jsonb;before_value jsonb;after_value jsonb;reference text;
begin
  select "Auth_User_ID" into actor from public."cmp_Users"
    where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or booking_api.has_permission(actor,'Bookings.Read') is not true
    or booking_api.has_permission(actor,'Bookings.Write') is not true then
    raise exception 'Screening evidence changes are not authorised.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object' or not(p_arguments ?& array[
    'target_id','cargo_id','record_id','expected_updated_at','expected_cargo_updated_at','expected_record_updated_at','changes','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) k where k not in
      ('target_id','cargo_id','record_id','expected_updated_at','expected_cargo_updated_at','expected_record_updated_at','changes','reason'))
    or jsonb_typeof(p_arguments->'changes') is distinct from 'array' then
    raise exception 'Provide exact cargo evidence and proposed field changes.' using errcode='22023';end if;
  if jsonb_array_length(p_arguments->'changes') not between 1 and 8 then
    raise exception 'Choose between one and eight screening field changes.' using errcode='22023';end if;
  for entry in select value from jsonb_array_elements(p_arguments->'changes') loop
    if jsonb_typeof(entry) is distinct from 'object' or not(entry ?& array['field','value'])
      or exists(select 1 from jsonb_object_keys(entry) k where k not in ('field','value'))
      or jsonb_typeof(entry->'field') is distinct from 'string' or changes ? (entry->>'field') then
      raise exception 'Each field needs one explicit supplied value or clear.' using errcode='22023';end if;
    changes:=changes||jsonb_build_object(entry->>'field',entry->'value');
  end loop;
  job_id:=(p_arguments->>'target_id')::uuid;
  record_id:=case when p_arguments->'record_id'='null'::jsonb then gen_random_uuid() else (p_arguments->>'record_id')::uuid end;
  -- Canonical writer owns permission/identity/stale validation, locking and audit.
  select booking_api.cargo_security_evidence_values(e) into before_value from booking_api.cargo_security_evidence e
    where e.id=record_id and e.cargo_id::text=p_arguments->>'cargo_id';
  after_value:=booking_api.save_cargo_security_evidence(actor,job_id,jsonb_build_object('id',record_id,'cargoId',p_arguments->'cargo_id',
    'expectedUpdatedAt',p_arguments->'expected_updated_at','expectedCargoUpdatedAt',p_arguments->'expected_cargo_updated_at',
    'expectedRecordUpdatedAt',p_arguments->'expected_record_updated_at','changes',changes,'reason',p_arguments->'reason'));
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID"=job_id;
  if before_value is distinct from after_value then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(p_company_id,job_id,'dexter_security_evidence_recorded','Approved screening evidence recorded',
        jsonb_build_object('evidenceId',record_id,'before',before_value,'after',after_value,'reason',p_arguments->>'reason','entryPoint','dexter'),p_user_id);
  end if;
  return jsonb_build_object('recordId',record_id,'bookingId',job_id,'bookingReference',reference,'before',before_value,'after',after_value,
    'updatedAt',(select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job_id),'sourceUrl','/bookings/'||lower(reference));
exception when invalid_text_representation then
  raise exception 'Choose valid Booking, cargo and screening evidence identities.' using errcode='22023';
end $$;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values
  ('booking_security_evidence','Booking screening evidence','Supplied cargo screening status, method, source and retained history. Search exact Booking reference or Booking/cargo/evidence UUID. Unknown stays not recorded; this is not clearance, agent verification or an air waybill. Limited results are not complete history.',
    'multideck_dexter_domain_booking_security_evidence','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval") values
  ('record_booking_security_evidence','booking_security_evidence','Record or correct screening evidence',
    'Always requires explicit approval, including Full access. Read exact booking_cargo before creation; use null record_id and expected_record_updated_at. Read exact booking_security_evidence and all current timestamps before correction. Preserve supplied text verbatim. Supply a source plus status, method or screening time. Use ISO time with explicit timezone, never infer one. Null clears optional fields. Void alone; retained records are read-only. This never certifies cargo, verifies an agent or changes Quotes or issued documents.',
    'multideck_dexter_action_record_booking_security_evidence',
    '{"type":"object","properties":{"target_id":{"type":"string"},"cargo_id":{"type":"string"},"record_id":{"type":["string","null"]},"expected_updated_at":{"type":"string"},"expected_cargo_updated_at":{"type":"string"},"expected_record_updated_at":{"type":["string","null"]},"changes":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"object","properties":{"field":{"type":"string","enum":["securityStatus","screeningMethod","screenedByName","agentReference","screenedAt","sourceReference","notes","recordStatus"]},"value":{"type":["string","null"]}},"required":["field","value"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","cargo_id","record_id","expected_updated_at","expected_cargo_updated_at","expected_record_updated_at","changes","reason"],"additionalProperties":false}',
    '["Bookings.Read","Bookings.Write"]','record_booking_security_evidence',true);

do $approval$
declare definition text;anchor text:='''record_booking_dangerous_goods''';
begin
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review screening mandatory approval guard';end if;
  execute replace(definition,anchor,anchor||',''record_booking_security_evidence''');
end $approval$;

revoke all on function public.multideck_dexter_domain_booking_security_evidence(uuid,text,integer),
  public.multideck_dexter_action_record_booking_security_evidence(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_security_evidence(uuid,text,integer),
  public.multideck_dexter_action_record_booking_security_evidence(uuid,uuid,jsonb) to service_role;
create function public._multideck_dexter_security_evidence_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare company uuid;reference text;job_id uuid;line_number integer;before_value jsonb;after_value jsonb;
begin
  select o."Company_ID",j."Job_BookingReference",j."Job_ID",c."JobCargo_LineNo" into company,reference,job_id,line_number
    from public."Job_Cargo" c join public."Job_Header" j on j."Job_ID"=c."JobCargo_JobID" and not j."Job_IsDeleted"
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where c."JobCargo_ID"=new.cargo_id and not c."JobCargo_IsDeleted";
  if company is null or not exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=company
    and w."AIDexterWatch_CapabilityCode"='booking_security_evidence' and w."AIDexterWatch_TargetID"=new.id
    and w."AIDexterWatch_StatusCode"='active') then return new;end if;
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.cargo_security_evidence_values(old) end;
  after_value:=booking_api.cargo_security_evidence_values(new);
  if before_value=after_value then return new;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_security_evidence','booking_api.cargo_security_evidence',new.id,before_value,
      after_value||jsonb_build_object('bookingId',job_id,'bookingReference',reference,'lineNumber',line_number,'sourceUrl','/bookings/'||lower(reference)));
  return new;
end $$;
create trigger cargo_security_evidence_dexter_watch after insert or update on booking_api.cargo_security_evidence
  for each row execute function public._multideck_dexter_security_evidence_watch_change();

insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values
  ('booking_security_evidence','Screening evidence changes','Notify on a saved field change on one exact active operator screening record. Not clearance or agent verification; no timers or autonomous writes.',
    '["securityStatus","screeningMethod","screenedByName","agentReference","screenedAt","sourceReference","notes","recordStatus"]','["Bookings.Read"]');

do $watch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='(''booking_dangerous_goods'',''booking_milestones'',''booking_allocations'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review screening watch owner guard';end if;
  definition:=replace(definition,marker,replace(marker,'(''booking_dangerous_goods''','(''booking_security_evidence'',''booking_dangerous_goods'''));
  marker:='(''booking_dangerous_goods'',''booking_milestones'',''booking_allocations'',''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review screening change semantics';end if;
  definition:=replace(definition,marker,replace(marker,'(''booking_dangerous_goods''','(''booking_security_evidence'',''booking_dangerous_goods'''));
  marker:='insert into public."AI_DexterWatchEvents" (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review screening notification routing';end if;
  execute replace(definition,marker,$copy$
    if watch."AIDexterWatch_CapabilityCode"='booking_security_evidence' then
      v_event_body:=coalesce(new."AIDexterWatchSignal_NewJSON"->>'bookingReference','Booking')||' · Cargo '
        ||coalesce(new."AIDexterWatchSignal_NewJSON"->>'lineNumber','?')||': screening evidence changed. Review the saved source; this is not clearance or agent verification.';
      v_changed:=v_changed||jsonb_build_object('sourceUrl',new."AIDexterWatchSignal_NewJSON"->>'sourceUrl');
    end if;
    $copy$||marker);
end $watch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_screening_20260907;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;record jsonb;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_security_evidence' then
    record:=public.multideck_dexter_domain_booking_security_evidence(context.company_id,p_target_id::text,1)->0;
    if public.multideck_dexter_can_read_cargo_watch(context.company_id) is not true or p_target_id is null
      or record->>'recordId' is distinct from p_target_id::text or record->>'operatorEditable' is distinct from 'true'
      or record->>'recordStatus' is distinct from 'recorded' then
      raise exception 'Choose an exact active screening evidence record in this workspace.' using errcode='42501';end if;
    if p_action is not null or (p_rule->>'operator'='changed') is not true then
      raise exception 'Watch a saved field change. Any edit needs fresh approval.' using errcode='22023';end if;
    p_target_label:=record->>'targetLabel';
  end if;
  return public._multideck_dexter_create_watch_before_screening_20260907(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Screening watches require current Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'booking_security_evidence' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_screening_20260907;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_screening_20260907()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_security_evidence' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function public._multideck_dexter_security_evidence_watch_change(),
  public._multideck_dexter_create_watch_before_screening_20260907(text,text,text,text,uuid,text,jsonb,jsonb),
  public._multideck_dexter_list_watches_before_screening_20260907() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
