begin;
set local lock_timeout='5s';

-- Private helpers for the screening capability. Do not release until registry,
-- mandatory prepared-action approval and deterministic watch wiring are complete.
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

revoke all on function public.multideck_dexter_domain_booking_security_evidence(uuid,text,integer),
  public.multideck_dexter_action_record_booking_security_evidence(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_security_evidence(uuid,text,integer),
  public.multideck_dexter_action_record_booking_security_evidence(uuid,uuid,jsonb) to service_role;
commit;
