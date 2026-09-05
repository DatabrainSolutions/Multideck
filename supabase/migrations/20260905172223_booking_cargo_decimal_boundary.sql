-- Exact transport values, with the existing numeric columns as authority.
-- No historical rows, column scales or financial permissions are changed.
begin;

create function booking_api.normalise_cargo_numbers(lines jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb; result jsonb:='[]'; key text; label text; raw text; amount numeric; places integer; line_no integer:=0;
begin
  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines)>200 then
    raise exception 'Booking cargo lines are invalid.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(lines) loop
    line_no:=line_no+1;
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Cargo line % is invalid.',line_no using errcode='22023'; end if;
    foreach key in array array['pieces','packageQuantity','grossWeightKg','netWeightKg','volumeCbm','length','width','height','declaredValue'] loop
      if not item ? key then continue; end if;
      label:=case key when 'pieces' then 'pieces' when 'packageQuantity' then 'packages / pieces'
        when 'grossWeightKg' then 'gross weight (kg)' when 'netWeightKg' then 'net weight (kg)'
        when 'volumeCbm' then 'volume (CBM)' when 'declaredValue' then 'cargo line value' else key end;
      if jsonb_typeof(item->key) not in ('string','number','null') then
        raise exception 'Cargo line %: % must be a number.',line_no,label using errcode='22023'; end if;
      raw:=nullif(btrim(item->>key),'');
      if raw is null then item:=jsonb_set(item,array[key],'null'); continue; end if;
      if length(raw)>64 or (raw !~ '^[0-9]+([.][0-9]+)?$' and raw !~ '^[0-9]{1,3}(,[0-9]{3})+([.][0-9]+)?$') then
        raise exception 'Cargo line %: % must be a non-negative decimal number.',line_no,label using errcode='22023'; end if;
      amount:=replace(raw,',','')::numeric;
      places:=case when key in ('packageQuantity','volumeCbm') then 6 when key='declaredValue' then 4 else 2 end;
      if amount<>round(amount,places) or amount>=power(10::numeric,18-places) then
        raise exception 'Cargo line %: % supports up to % whole digits and % decimal places.',line_no,label,18-places,places using errcode='22023'; end if;
      item:=jsonb_set(item,array[key],to_jsonb(amount::text));
    end loop;
    result:=result||jsonb_build_array(item);
  end loop;
  return result;
end $$;

create function booking_api.cargo_decimal_values(item public."Job_Cargo")
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'pieces',item."JobCargo_Qty"::text,'packageQuantity',item."JobCargo_PackageQty"::text,
    'grossWeightKg',item."JobCargo_GrossKilos"::text,'netWeightKg',item."JobCargo_NettKilos"::text,
    'volumeCbm',item."JobCargo_VolumeCBM"::text,'length',item."JobCargo_Length"::text,
    'width',item."JobCargo_Width"::text,'height',item."JobCargo_Height"::text,
    'declaredValue',item."JobCargo_DeclaredValueAmount"::text);
$$;

-- Keep the allowlisted Dexter projection unchanged except numeric JSON types.
-- Financial values remain excluded from this non-financial read/watch domain.
do $$
declare definition text:=pg_get_functiondef('booking_api.cargo_public_values(public."Job_Cargo")'::regprocedure); column_name text;
begin
  foreach column_name in array array['Qty','PackageQty','GrossKilos','NettKilos','VolumeCBM','Length','Width','Height'] loop
    if position('item."JobCargo_'||column_name||'"' in definition)=0 then
      raise exception 'Review cargo public projection before changing decimal transport.'; end if;
    definition:=replace(definition,'item."JobCargo_'||column_name||'"','item."JobCargo_'||column_name||'"::text');
  end loop;
  execute definition;
end $$;

alter function booking_api.save_booking(uuid,uuid,jsonb) rename to save_before_cargo_decimals_20260905;
create function booking_api.save_booking(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if payload ? 'cargo' then payload:=jsonb_set(payload,'{cargo}',booking_api.normalise_cargo_numbers(payload->'cargo')); end if;
  return booking_api.save_before_cargo_decimals_20260905(caller_auth_user_id,requested_job_id,payload);
end $$;

-- Normalise before all existing save stages, including dimensions and direction.
alter function public.booking_workflow_save(uuid,uuid,jsonb) rename to booking_workflow_save_before_cargo_decimals_20260905;
create function public.booking_workflow_save(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if payload ? 'cargo' then payload:=jsonb_set(payload,'{cargo}',booking_api.normalise_cargo_numbers(payload->'cargo')); end if;
  return public.booking_workflow_save_before_cargo_decimals_20260905(caller_auth_user_id,requested_job_id,payload);
end $$;

-- Older accepted-Quote paths call this stage directly after the canonical save.
-- They must receive the same precision checks as the full workspace endpoint.
alter function booking_api.save_booking_cargo_measurements(uuid,uuid,jsonb) rename to save_cargo_measurements_before_decimals_20260905;
create function booking_api.save_booking_cargo_measurements(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if payload ? 'cargo' then payload:=jsonb_set(payload,'{cargo}',booking_api.normalise_cargo_numbers(payload->'cargo')); end if;
  perform booking_api.save_cargo_measurements_before_decimals_20260905(caller_auth_user_id,requested_job_id,payload);
end $$;

-- Extend the final cargo projection, after older dimension overlays have run.
alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_cargo_decimals_20260905;
create function booking_api.workspace_extended(caller_auth_user_id uuid,requested_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; job_id uuid; exact_cargo jsonb; source_cargo jsonb;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode='42501'; end if;
  result:=booking_api.workspace_before_cargo_decimals_20260905(caller_auth_user_id,requested_reference);
  job_id:=nullif(result#>>'{booking,jobId}','')::uuid;
  if not exists(select 1 from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    join public."cmp_Users" actor on actor."Company_ID"=office."Company_ID" and actor."Auth_User_ID"=caller_auth_user_id and actor."User_AccessStatus"='active'
    where job."Job_ID"=job_id and not job."Job_IsDeleted") then
    raise exception 'That booking is outside this workspace.' using errcode='42501'; end if;
  source_cargo:=coalesce(nullif(result->'cargo','null'::jsonb),'[]'::jsonb);
  if jsonb_typeof(source_cargo) is distinct from 'array' then
    raise exception 'Cargo changed while loading. Reload the Booking.' using errcode='40001'; end if;
  select coalesce(jsonb_agg(entry.value||booking_api.cargo_decimal_values(cargo) order by entry.ordinal),'[]') into exact_cargo
    from jsonb_array_elements(source_cargo) with ordinality entry(value,ordinal)
    join public."Job_Cargo" cargo on cargo."JobCargo_ID"=nullif(entry.value->>'id','')::uuid and cargo."JobCargo_JobID"=job_id and not cargo."JobCargo_IsDeleted";
  if jsonb_array_length(exact_cargo)<>jsonb_array_length(source_cargo) then
    raise exception 'Cargo changed while loading. Reload the Booking.' using errcode='40001'; end if;
  return jsonb_set(result,'{cargo}',exact_cargo);
end $$;

revoke all on function booking_api.normalise_cargo_numbers(jsonb),booking_api.cargo_decimal_values(public."Job_Cargo"),
  booking_api.save_before_cargo_decimals_20260905(uuid,uuid,jsonb),
  public.booking_workflow_save_before_cargo_decimals_20260905(uuid,uuid,jsonb),
  booking_api.save_cargo_measurements_before_decimals_20260905(uuid,uuid,jsonb),
  booking_api.workspace_before_cargo_decimals_20260905(uuid,text) from public,anon,authenticated,service_role;
revoke all on function booking_api.save_booking(uuid,uuid,jsonb),public.booking_workflow_save(uuid,uuid,jsonb),
  booking_api.save_booking_cargo_measurements(uuid,uuid,jsonb),
  booking_api.workspace_extended(uuid,text) from public,anon,authenticated;
grant execute on function booking_api.save_booking(uuid,uuid,jsonb),public.booking_workflow_save(uuid,uuid,jsonb),
  booking_api.save_booking_cargo_measurements(uuid,uuid,jsonb),
  booking_api.workspace_extended(uuid,text) to service_role;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"=
  'Individual active cargo lines with exact cargo and booking IDs, quantities, dimensions and safety flags. Decimal measurements are returned as exact text: preserve every digit. Search by booking reference or cargo ID. No selling prices, costs or margins. Editing requires approval; allocation, removal and adding lines must use Booking Details.',
  "AIDexterDomain_UpdatedAt"=now() where "AIDexterDomain_Code"='booking_cargo';
update public."sys_AIDexterActions" set "AIDexterAction_Description"=
  'Propose one exact operational cargo field change for explicit approval. Read the current cargo line and booking updatedAt first. Preserve decimal text; never round a proposed value to pass validation. Quantities and measurements must be non-negative and fit the field precision. Null clears a nullable field. Cannot change prices, delete lines or replace allocations.',
  "AIDexterAction_UpdatedAt"=now() where "AIDexterAction_Code"='update_booking_cargo';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"=
  'Watch saved changes to an exact cargo line or permitted booking cargo. Decimal measurements retain exact text; numeric threshold rules are evaluated numerically. No recurring AI calls.',
  "AIDexterWatchCapability_UpdatedAt"=now() where "AIDexterWatchCapability_Code"='booking_cargo';
commit;
