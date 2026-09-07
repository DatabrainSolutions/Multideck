begin;
set local lock_timeout='5s';

create function public.multideck_dexter_domain_booking_dangerous_goods(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by reference,line_number,record_id),'[]'::jsonb) from (
    select booking_api.cargo_dangerous_goods_values(d)||jsonb_build_object('recordId',d."JobCargoDG_ID",
      'bookingId',j."Job_ID",'bookingReference',j."Job_BookingReference",'bookingUpdatedAt',j."Job_UpdatedAt",
      'cargoUpdatedAt',c."JobCargo_UpdatedAt",'lineNumber',c."JobCargo_LineNo",'cargoDescription',c."JobCargo_Description",
      'sourceTable','Job_CargoDangerousGoods','sourceUrl','/bookings/'||lower(j."Job_BookingReference"),
      'targetLabel',j."Job_BookingReference"||' · Cargo '||c."JobCargo_LineNo"||' · '
        ||coalesce(d."JobCargoDG_UNNumber",d."JobCargoDG_ProperShippingName",'Dangerous-goods evidence')) result,
      j."Job_BookingReference" reference,c."JobCargo_LineNo" line_number,d."JobCargoDG_ID" record_id
    from public."Job_CargoDangerousGoods" d join public."Job_Cargo" c on c."JobCargo_ID"=d."JobCargoDG_JobCargoID" and not c."JobCargo_IsDeleted"
    join public."Job_Header" j on j."Job_ID"=c."JobCargo_JobID" and not j."Job_IsDeleted"
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID") and o."Company_ID"=p_company_id
    where nullif(btrim(p_search),'') is null or d."JobCargoDG_ID"::text=btrim(p_search)
      or c."JobCargo_ID"::text=btrim(p_search) or j."Job_ID"::text=btrim(p_search)
      or lower(j."Job_BookingReference")=lower(btrim(p_search))
    order by j."Job_BookingReference",c."JobCargo_LineNo",d."JobCargoDG_ID"
    limit greatest(1,least(coalesce(p_take,10),25))
  ) selected;
$$;

create function public.multideck_dexter_action_record_booking_dangerous_goods(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;job_id uuid;record_id uuid;changes jsonb:='{}';entry jsonb;before_value jsonb;after_value jsonb;reference text;
begin
  select "Auth_User_ID" into actor from public."cmp_Users"
    where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or booking_api.has_permission(actor,'Bookings.Read') is not true
    or booking_api.has_permission(actor,'Bookings.Write') is not true then
    raise exception 'Dangerous-goods changes are not authorised.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object' or not(p_arguments ?& array[
    'target_id','cargo_id','record_id','expected_updated_at','expected_cargo_updated_at','expected_record_updated_at','changes','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) k where k not in
      ('target_id','cargo_id','record_id','expected_updated_at','expected_cargo_updated_at','expected_record_updated_at','changes','reason'))
    or jsonb_typeof(p_arguments->'changes') is distinct from 'array' then
    raise exception 'Provide exact cargo evidence and the proposed field changes.' using errcode='22023';end if;
  if jsonb_array_length(p_arguments->'changes') not between 1 and 11 then
    raise exception 'Choose between one and eleven dangerous-goods field changes.' using errcode='22023';end if;
  for entry in select value from jsonb_array_elements(p_arguments->'changes') loop
    if jsonb_typeof(entry) is distinct from 'object' or not(entry ?& array['field','value'])
      or exists(select 1 from jsonb_object_keys(entry) k where k not in ('field','value'))
      or jsonb_typeof(entry->'field') is distinct from 'string' or changes ? (entry->>'field') then
      raise exception 'Each field needs one explicit supplied value or clear.' using errcode='22023';end if;
    changes:=changes||jsonb_build_object(entry->>'field',entry->'value');
  end loop;
  job_id:=(p_arguments->>'target_id')::uuid;
  record_id:=case when p_arguments->'record_id'='null'::jsonb then gen_random_uuid() else (p_arguments->>'record_id')::uuid end;
  select booking_api.cargo_dangerous_goods_values(d) into before_value from public."Job_CargoDangerousGoods" d
    where d."JobCargoDG_ID"=record_id and d."JobCargoDG_JobCargoID"::text=p_arguments->>'cargo_id';
  after_value:=booking_api.save_cargo_dangerous_goods(actor,job_id,jsonb_build_object('id',record_id,'cargoId',p_arguments->'cargo_id',
    'expectedUpdatedAt',p_arguments->'expected_updated_at','expectedCargoUpdatedAt',p_arguments->'expected_cargo_updated_at',
    'expectedRecordUpdatedAt',p_arguments->'expected_record_updated_at','changes',changes,'reason',p_arguments->'reason'));
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID"=job_id;
  if before_value is distinct from after_value then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(p_company_id,job_id,'dexter_dangerous_goods_recorded','Approved dangerous-goods evidence recorded',
        jsonb_build_object('dangerousGoodsId',record_id,'before',before_value,'after',after_value,'reason',p_arguments->>'reason','entryPoint','dexter'),p_user_id);
  end if;
  return jsonb_build_object('recordId',record_id,'bookingId',job_id,'bookingReference',reference,'before',before_value,'after',after_value,
    'updatedAt',(select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job_id),'sourceUrl','/bookings/'||lower(reference));
exception when invalid_text_representation then
  raise exception 'Choose valid Booking, cargo and dangerous-goods identities.' using errcode='22023';
end $$;

create function public._multideck_dexter_dangerous_goods_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare company uuid;reference text;job_id uuid;line_number integer;before_value jsonb;after_value jsonb;
begin
  if new."JobCargoDG_Source"<>'operator' then return new;end if;
  select o."Company_ID",j."Job_BookingReference",j."Job_ID",c."JobCargo_LineNo" into company,reference,job_id,line_number
    from public."Job_Cargo" c join public."Job_Header" j on j."Job_ID"=c."JobCargo_JobID" and not j."Job_IsDeleted"
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where c."JobCargo_ID"=new."JobCargoDG_JobCargoID" and not c."JobCargo_IsDeleted";
  if company is null or not exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=company
    and w."AIDexterWatch_CapabilityCode"='booking_dangerous_goods' and w."AIDexterWatch_TargetID"=new."JobCargoDG_ID"
    and w."AIDexterWatch_StatusCode"='active') then return new;end if;
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.cargo_dangerous_goods_values(old) end;
  after_value:=booking_api.cargo_dangerous_goods_values(new);
  if before_value=after_value then return new;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_dangerous_goods','Job_CargoDangerousGoods',new."JobCargoDG_ID",before_value,
      after_value||jsonb_build_object('bookingId',job_id,'bookingReference',reference,'lineNumber',line_number,'sourceUrl','/bookings/'||lower(reference)));
  return new;
end $$;
create trigger "TR_Job_CargoDangerousGoods_dexter_watch" after insert or update on public."Job_CargoDangerousGoods"
  for each row execute function public._multideck_dexter_dangerous_goods_watch_change();

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values
  ('booking_dangerous_goods','Booking dangerous-goods evidence','Supplied per-cargo records, source, unknown flags and retained void history. Exact Booking reference or Booking/cargo/record UUID search. Legacy flags are not proof of confirmation. Limited results are not complete history; no classification or compliance approval.','multideck_dexter_domain_booking_dangerous_goods','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval") values
  ('record_booking_dangerous_goods','booking_dangerous_goods','Record or correct dangerous-goods evidence','Always requires explicit approval, including Full access. Read the exact cargo and current Booking timestamp first. New records use null record_id and expected_record_updated_at; corrections require the exact saved record and all current timestamps. Supply only requested fields and sourceReference; never classify goods or infer flags. Null means Not recorded, not No. Legacy and voided records are read-only. Void alone to retain original evidence. Does not change the parent hazardous flag or any Quote.',
    'multideck_dexter_action_record_booking_dangerous_goods',
    '{"type":"object","properties":{"target_id":{"type":"string"},"cargo_id":{"type":"string"},"record_id":{"type":["string","null"]},"expected_updated_at":{"type":"string"},"expected_cargo_updated_at":{"type":"string"},"expected_record_updated_at":{"type":["string","null"]},"changes":{"type":"array","minItems":1,"maxItems":11,"items":{"type":"object","properties":{"field":{"type":"string","enum":["unNumber","properShippingName","class","packingGroup","flashPoint","marinePollutant","limitedQuantity","emergencyContact","notes","sourceReference","status"]},"value":{"type":["string","boolean","null"]}},"required":["field","value"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","cargo_id","record_id","expected_updated_at","expected_cargo_updated_at","expected_record_updated_at","changes","reason"],"additionalProperties":false}',
    '["Bookings.Read","Bookings.Write"]','record_booking_dangerous_goods',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values
  ('booking_dangerous_goods','Dangerous-goods evidence changes','Notify on a saved field change on one exact active operator record. No compliance assessment, timers or autonomous writes.',
    '["unNumber","properShippingName","class","packingGroup","flashPoint","marinePollutant","limitedQuantity","emergencyContact","notes","sourceReference","status"]','["Bookings.Read"]');

do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='(''booking_milestones'',''booking_allocations'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review DG watch owner guard';end if;
  definition:=replace(definition,marker,'(''booking_dangerous_goods'',''booking_milestones'',''booking_allocations'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  marker:='(''booking_milestones'',''booking_allocations'',''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review DG change semantics';end if;
  definition:=replace(definition,marker,'(''booking_dangerous_goods'',''booking_milestones'',''booking_allocations'',''quote_cargo'',''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  marker:='insert into public."AI_DexterWatchEvents" (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review DG notification routing';end if;
  execute replace(definition,marker,$copy$
    if watch."AIDexterWatch_CapabilityCode"='booking_dangerous_goods' then
      v_event_body:=coalesce(new."AIDexterWatchSignal_NewJSON"->>'bookingReference','Booking')||' · Cargo '
        ||coalesce(new."AIDexterWatchSignal_NewJSON"->>'lineNumber','?')||': dangerous-goods evidence changed. Review the saved source; this is not a compliance approval.';
      v_changed:=v_changed||jsonb_build_object('sourceUrl',new."AIDexterWatchSignal_NewJSON"->>'sourceUrl');
    end if;
    $copy$||marker);
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='(''record_booking_milestone'',''replace_booking_allocations'',''update_quote_cargo'',''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review DG mandatory approval guard';end if;
  execute replace(definition,marker,'(''record_booking_dangerous_goods'',''record_booking_milestone'',''replace_booking_allocations'',''update_quote_cargo'',''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')');
end $patch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_dg_20260907;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;record jsonb;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_dangerous_goods' then
    record:=public.multideck_dexter_domain_booking_dangerous_goods(context.company_id,p_target_id::text,1)->0;
    if public.multideck_dexter_can_read_cargo_watch(context.company_id) is not true or p_target_id is null
      or record->>'recordId' is distinct from p_target_id::text or record->>'operatorEditable' is distinct from 'true' then
      raise exception 'Choose an exact active operator dangerous-goods record in this workspace.' using errcode='42501';end if;
    if p_action is not null or (p_rule->>'operator'='changed') is not true then
      raise exception 'Watch a saved field change. Any edit needs fresh approval.' using errcode='22023';end if;
    p_target_label:=record->>'targetLabel';
  end if;
  return public._multideck_dexter_create_watch_before_dg_20260907(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Dangerous goods watches require current Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'booking_dangerous_goods' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_dg_20260907;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_dg_20260907()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_dangerous_goods' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function public._multideck_dexter_dangerous_goods_watch_change(),
  public._multideck_dexter_create_watch_before_dg_20260907(text,text,text,text,uuid,text,jsonb,jsonb),
  public._multideck_dexter_list_watches_before_dg_20260907() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_booking_dangerous_goods(uuid,text,integer),
  public.multideck_dexter_action_record_booking_dangerous_goods(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_dangerous_goods(uuid,text,integer),
  public.multideck_dexter_action_record_booking_dangerous_goods(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
