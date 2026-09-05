-- Per-line operational cargo reads, approved edits and deterministic watches.
-- Deliberately excludes prices, supplier costs, allocation replacement and deletion.
begin;

create or replace function booking_api.cargo_public_values(item public."Job_Cargo")
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', item."JobCargo_ID", 'description', item."JobCargo_Description",
    'commodity', item."JobCargo_Commodity", 'pieces', item."JobCargo_Qty",
    'packageQuantity', item."JobCargo_PackageQty", 'packageType', item."JobCargo_PackageTypeCodeSnapshot",
    'grossWeightKg', item."JobCargo_GrossKilos", 'netWeightKg', item."JobCargo_NettKilos",
    'volumeCbm', item."JobCargo_VolumeCBM", 'length', item."JobCargo_Length",
    'width', item."JobCargo_Width", 'height', item."JobCargo_Height", 'lengthUnit', item."JobCargo_LengthUnit",
    'hsCode', item."JobCargo_HSCode", 'countryOfOrigin', item."JobCargo_CountryOfOriginCodeSnapshot",
    'isHazardous', item."JobCargo_IsHazardous", 'isTemperatureControlled', item."JobCargo_IsTemperatureControlled",
    'archived', item."JobCargo_IsDeleted"
  );
$$;

create or replace function public.multideck_dexter_domain_booking_cargo(p_company_id uuid, p_search text, p_take integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(result order by booking_reference, line_number), '[]'::jsonb) from (
    select booking_api.cargo_public_values(cargo) || jsonb_build_object(
      'recordId', cargo."JobCargo_ID", 'bookingId', job."Job_ID",
      'bookingReference', job."Job_BookingReference", 'lineNumber', cargo."JobCargo_LineNo",
      'updatedAt', job."Job_UpdatedAt", 'cargoUpdatedAt', cargo."JobCargo_UpdatedAt",
      'sourceTable', 'Job_Cargo', 'sourceUrl', '/bookings/' || lower(job."Job_BookingReference"),
      'targetLabel', job."Job_BookingReference" || ' · Cargo ' || cargo."JobCargo_LineNo"
    ) as result, job."Job_BookingReference" as booking_reference, cargo."JobCargo_LineNo" as line_number
    from public."Job_Cargo" cargo
    join public."Job_Header" job on job."Job_ID" = cargo."JobCargo_JobID" and not job."Job_IsDeleted"
    join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
      and office."Company_ID" = p_company_id
    where not cargo."JobCargo_IsDeleted" and (
      nullif(btrim(p_search), '') is null or cargo."JobCargo_ID"::text = btrim(p_search)
      or job."Job_ID"::text = btrim(p_search)
      or job."Job_BookingReference" ilike '%' || btrim(p_search) || '%'
      or cargo."JobCargo_Description" ilike '%' || btrim(p_search) || '%'
    )
    order by job."Job_BookingReference", cargo."JobCargo_LineNo"
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) selected;
$$;

create or replace function public.multideck_dexter_action_update_booking_cargo(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_auth_id uuid;
  job_row public."Job_Header";
  cargo_row public."Job_Cargo";
  target_id uuid := nullif(p_arguments->>'target_id', '')::uuid;
  cargo_id uuid := nullif(p_arguments->>'cargo_id', '')::uuid;
  field_name text := p_arguments->>'field';
  field_value jsonb := coalesce(p_arguments->'value', 'null'::jsonb);
  text_value text := p_arguments->>'value';
  numeric_value numeric;
  cargo_lines jsonb;
  saved jsonb;
begin
  select "Auth_User_ID" into actor_auth_id from public."cmp_Users"
  where "User_ID" = p_user_id and "Company_ID" = p_company_id and "User_AccessStatus" = 'active';
  if actor_auth_id is null or not booking_api.has_permission(actor_auth_id, 'Bookings.Write')
     or not booking_api.has_permission(actor_auth_id, 'Bookings.Read') then
    raise exception 'You do not have permission to edit booking cargo.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_arguments) is distinct from 'object'
    or not (p_arguments ?& array['target_id','cargo_id','expected_updated_at','field','value','reason']) or exists (
    select 1 from jsonb_object_keys(p_arguments) key where key not in ('target_id','cargo_id','expected_updated_at','field','value','reason')
  ) or nullif(btrim(p_arguments->>'reason'), '') is null then
    raise exception 'Provide an exact cargo field change and its reason.' using errcode = '22023';
  end if;
  select job.* into job_row from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = target_id and office."Company_ID" = p_company_id and not job."Job_IsDeleted"
  for update of job;
  if not found then raise exception 'That booking is outside this workspace.' using errcode = '42501'; end if;
  if nullif(p_arguments->>'expected_updated_at', '') is null
     or job_row."Job_UpdatedAt" is distinct from (p_arguments->>'expected_updated_at')::timestamptz then
    raise exception 'The booking changed since this proposal. Read it again and request fresh approval.' using errcode = '40001';
  end if;
  select * into cargo_row from public."Job_Cargo"
  where "JobCargo_ID" = cargo_id and "JobCargo_JobID" = target_id and not "JobCargo_IsDeleted";
  if not found then raise exception 'Choose an active cargo line from this booking.' using errcode = '42501'; end if;
  if field_name is null or field_name not in (
    'description','commodity','pieces','packageQuantity','packageType','grossWeightKg','netWeightKg','volumeCbm',
    'length','width','height','lengthUnit','hsCode','countryOfOrigin','isHazardous','isTemperatureControlled'
  ) then raise exception 'That cargo field is not available for Dexter editing.' using errcode = '22023'; end if;
  if jsonb_typeof(field_value) not in ('string','null') then
    raise exception 'Use a text value or null to clear the selected field.' using errcode = '22023';
  end if;
  if field_name in ('pieces','packageQuantity','grossWeightKg','netWeightKg','volumeCbm','length','width','height') then
    numeric_value := nullif(btrim(text_value), '')::numeric;
    if numeric_value < 0 or numeric_value::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Cargo quantities and measurements must be finite and non-negative.' using errcode = '22023';
    end if;
    field_value := coalesce(to_jsonb(numeric_value), 'null'::jsonb);
  elsif field_name in ('isHazardous','isTemperatureControlled') then
    if text_value is null or text_value not in ('true','false') then
      raise exception 'Cargo safety flags must explicitly be true or false.' using errcode = '22023';
    end if;
    field_value := to_jsonb(text_value::boolean);
  elsif field_name = 'description' and nullif(btrim(text_value), '') is null then
    raise exception 'A cargo line needs a goods description.' using errcode = '22023';
  elsif field_name = 'lengthUnit' and (text_value is null or text_value not in ('cm','m','in')) then
    raise exception 'Choose cm, m or in for the dimension unit.' using errcode = '22023';
  elsif field_name = 'countryOfOrigin' and text_value is not null and text_value !~ '^[A-Za-z]{2}$' then
    raise exception 'Use a two-letter country code.' using errcode = '22023';
  end if;
  -- Keep every other line and every unexposed commercial/safety field intact.
  saved := booking_api.workspace_extended(actor_auth_id, job_row."Job_BookingReference");
  select jsonb_agg(case when line->>'id' = cargo_id::text
    then line || jsonb_build_object(field_name, field_value) else line end order by ordinal)
    into cargo_lines from jsonb_array_elements(saved->'cargo') with ordinality as entries(line, ordinal);
  if not exists(select 1 from jsonb_array_elements(cargo_lines) line where line->>'id'=cargo_id::text) then
    raise exception 'The cargo workspace changed. Reload before approving.' using errcode='40001';
  end if;
  saved := public.booking_workflow_save(actor_auth_id, target_id, jsonb_build_object('cargo', cargo_lines));
  select booking_api.cargo_public_values(cargo)->field_name into field_value
    from public."Job_Cargo" cargo where cargo."JobCargo_ID"=cargo_id;
  return jsonb_build_object('recordId', cargo_id, 'bookingId', target_id,
    'bookingReference', job_row."Job_BookingReference", 'field', field_name,
    'before', booking_api.cargo_public_values(cargo_row)->field_name, 'after', field_value,
    'updatedAt', saved#>'{booking,updatedAt}', 'sourceUrl', '/bookings/' || lower(job_row."Job_BookingReference"));
end;
$$;

create or replace function public._multideck_dexter_cargo_watch_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare company_id uuid; booking_reference text; before_value jsonb; after_value jsonb;
begin
  select office."Company_ID", job."Job_BookingReference" into company_id, booking_reference
  from public."Job_Header" job join public."cmp_Offices" office
    on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = new."JobCargo_JobID" and not job."Job_IsDeleted";
  before_value := case when tg_op='INSERT' then '{}'::jsonb else booking_api.cargo_public_values(old) end;
  after_value := booking_api.cargo_public_values(new);
  if before_value = after_value or company_id is null then return new; end if;
  if not exists(select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=company_id and watch."AIDexterWatch_CapabilityCode"='booking_cargo'
      and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."JobCargo_ID")) then return new; end if;
  insert into public."AI_DexterWatchSignals"(
    "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
  ) values(company_id,'booking_cargo','Job_Cargo',new."JobCargo_ID",before_value,
    after_value || jsonb_build_object('bookingReference',booking_reference,'bookingId',new."JobCargo_JobID",
      'sourceUrl','/bookings/' || lower(booking_reference)));
  return new;
end;
$$;

drop trigger if exists "TR_Job_Cargo_dexter_watch" on public."Job_Cargo";
create trigger "TR_Job_Cargo_dexter_watch" after insert or update on public."Job_Cargo"
for each row execute function public._multideck_dexter_cargo_watch_change();

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction",
  "AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON"
) values ('booking_cargo','Booking cargo lines',
  'Individual active cargo lines with exact cargo and booking IDs, quantities, dimensions and safety flags. Search by booking reference or cargo ID. No selling prices, costs or margins. Editing requires approval; allocation, removal and adding lines must use Booking Details.',
  'multideck_dexter_domain_booking_cargo','["Bookings.Read"]','["operational"]')
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Description"=excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_RequiredPermissionsJSON"=excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now();

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily"
) values ('update_booking_cargo','booking_cargo','Edit booking cargo field',
  'Propose one exact operational cargo field change for explicit approval. Read the current cargo line and booking updatedAt first. Null clears a nullable field. Cannot change prices, delete lines or replace allocations.',
  'multideck_dexter_action_update_booking_cargo',
  '{"type":"object","properties":{"target_id":{"type":"string","description":"Exact bookingId from booking_cargo"},"cargo_id":{"type":"string","description":"Exact recordId from booking_cargo"},"expected_updated_at":{"type":"string","description":"Exact updatedAt from the latest booking_cargo read"},"field":{"type":"string","enum":["description","commodity","pieces","packageQuantity","packageType","grossWeightKg","netWeightKg","volumeCbm","length","width","height","lengthUnit","hsCode","countryOfOrigin","isHazardous","isTemperatureControlled"]},"value":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","cargo_id","expected_updated_at","field","value","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','update_booking_cargo')
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON"
) values ('booking_cargo','Booking cargo lines','Watch saved changes to an exact cargo line or permitted booking cargo. No recurring AI calls.',
  '["description","commodity","pieces","packageQuantity","packageType","grossWeightKg","netWeightKg","volumeCbm","length","width","height","lengthUnit","hsCode","countryOfOrigin","isHazardous","isTemperatureControlled","archived"]','["Bookings.Read"]')
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_FieldsJSON"=excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_RequiredPermissionsJSON"=excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_UpdatedAt"=now();

-- For this capability each distinct changed signal is an event, not a latched threshold.
-- Preserve the existing evaluator and all other capabilities' semantics.
do $$
declare definition text; previous text := 'if v_matches and not coalesce(v_previously_matched, false) then';
begin
  definition := pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  if position(previous in definition)=0 then
    raise exception 'Review the current watch evaluator before applying cargo watch parity.';
  end if;
  execute replace(definition, previous,
    'if v_matches and ((watch."AIDexterWatch_CapabilityCode" = ''booking_cargo'' and watch."AIDexterWatch_RuleJSON"->>''operator'' = ''changed'') or not coalesce(v_previously_matched, false)) then');
end $$;

revoke all on function booking_api.cargo_public_values(public."Job_Cargo") from public,anon,authenticated;
revoke all on function public.multideck_dexter_domain_booking_cargo(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_update_booking_cargo(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public._multideck_dexter_cargo_watch_change() from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_cargo(uuid,text,integer) to service_role;
grant execute on function public.multideck_dexter_action_update_booking_cargo(uuid,uuid,jsonb) to service_role;
commit;
