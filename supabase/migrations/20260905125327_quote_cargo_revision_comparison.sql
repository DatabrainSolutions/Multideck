-- Internal comparison/planning boundary. This is deliberately not wired into
-- the public apply action until selective persistence and stale-review UX are
-- connected; existing whole-summary apply must not consume these plan items.
begin;

create function quote_api.cargo_line_map(lines jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(item->>'id',item-'id'),'{}'::jsonb)
  from jsonb_array_elements(quote_api.normalise_cargo_lines(lines,false)) item
$$;

create function booking_api.cargo_comparison_map(lines jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; item jsonb;
begin
  if jsonb_typeof(lines) is distinct from 'array' then raise exception 'Booking cargo must be a list.' using errcode='22023'; end if;
  -- Booking descriptions are unbounded operational text. Preserve them for
  -- comparison instead of imposing the Quote editor's 4,000-character limit.
  result:=quote_api.cargo_line_map((select coalesce(jsonb_agg(value-'description'),'[]'::jsonb) from jsonb_array_elements(lines)));
  for item in select value from jsonb_array_elements(lines) loop
    if item ? 'description' and jsonb_typeof(item->'description') not in ('string','null') then
      raise exception 'Booking cargo description must be text.' using errcode='22023'; end if;
    result:=jsonb_set(result,array[(item->>'id')::uuid::text,'description'],coalesce(to_jsonb(nullif(btrim(item->>'description'),'')),'null'::jsonb));
  end loop;
  return result;
end;
$$;

create function booking_api.cargo_revision_differences(baseline_lines jsonb, booking_lines jsonb, proposed_lines jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  baseline jsonb:=quote_api.cargo_line_map(baseline_lines);
  booking jsonb:=booking_api.cargo_comparison_map(booking_lines);
  proposed jsonb:=quote_api.cargo_line_map(proposed_lines);
  line_id text; field_name text; old_line jsonb; current_line jsonb; new_line jsonb;
  old_value jsonb; current_value jsonb; new_value jsonb; fields text[];
  result jsonb:='[]'; changed boolean; conflict boolean; operation text; label text;
  allowed_fields constant text[]:=array['description','commodity','packageQuantity','packageType','grossWeightKg','netWeightKg',
    'volumeCbm','chargeableWeightKg','length','width','height','lengthUnit','hsCode','countryOfOrigin','isHazardous','isTemperatureControlled'];
begin
  for line_id in select key from jsonb_object_keys(baseline||proposed) key order by key loop
    old_line:=baseline->line_id; current_line:=booking->line_id; new_line:=proposed->line_id;
    -- No Quote change means no sync warning, even if Booking cargo was edited
    -- or removed. Reordering alone is not a change to the goods themselves.
    if old_line is not distinct from new_line then continue; end if;
    operation:=case when new_line is null then 'remove' when old_line is null then 'add'
      when current_line is null then 'restore' else 'update' end;
    fields:=case when operation='update' then allowed_fields else array['line'] end;
    foreach field_name in array fields loop
      if field_name='line' then old_value:=old_line; current_value:=current_line; new_value:=new_line;
      else old_value:=old_line->field_name; current_value:=current_line->field_name; new_value:=new_line->field_name; end if;
      if old_value is not distinct from new_value then continue; end if;
      changed:=current_value is distinct from old_value;
      conflict:=changed and current_value is distinct from new_value;
      label:=case field_name
        when 'line' then initcap(operation)||' cargo line'
        when 'description' then 'Goods description' when 'commodity' then 'Commodity'
        when 'packageQuantity' then 'Packages / pieces' when 'packageType' then 'Package type'
        when 'grossWeightKg' then 'Gross weight (kg)' when 'netWeightKg' then 'Net weight (kg)'
        when 'volumeCbm' then 'Volume (CBM)' when 'chargeableWeightKg' then 'Chargeable weight (kg)'
        when 'lengthUnit' then 'Dimension unit' when 'hsCode' then 'HS code' when 'countryOfOrigin' then 'Country of origin'
        when 'isHazardous' then 'Hazardous cargo' when 'isTemperatureControlled' then 'Temperature controlled'
        else initcap(field_name) end;
      result:=result||jsonb_build_array(jsonb_build_object(
        'key','cargo:'||line_id||':'||field_name,'sourceLineId',line_id,'field',field_name,'operation',operation,
        'label',label,'section','Cargo','cargoDescription',coalesce(new_line->>'description',old_line->>'description','Cargo line'),
        'previousQuoteValue',old_value,'bookingValue',current_value,'newQuoteValue',new_value,
        'bookingChanged',changed,'conflict',conflict,'requiresConfirmation',conflict or operation in ('remove','restore'),
        'warningCode',case when operation='restore' then 'booking_cargo_removed' when conflict then 'booking_changed'
          when operation='remove' then 'cargo_removal' else null end,
        'recommendation',case when conflict or operation in ('remove','restore') then 'review' else 'apply' end));
    end loop;
  end loop;
  return result;
end;
$$;

create function booking_api.current_source_cargo_lines(requested_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cargo."JobCargo_SourceQuoteLineID",'description',cargo."JobCargo_Description",'commodity',cargo."JobCargo_Commodity",
    'packageQuantity',cargo."JobCargo_PackageQty",'packageType',cargo."JobCargo_PackageTypeCodeSnapshot",
    'grossWeightKg',cargo."JobCargo_GrossKilos",'netWeightKg',cargo."JobCargo_NettKilos",'volumeCbm',cargo."JobCargo_VolumeCBM",
    'chargeableWeightKg',cargo."JobCargo_CargoJSON"->'chargeableWeightKg',
    'length',cargo."JobCargo_Length",'width',cargo."JobCargo_Width",'height',cargo."JobCargo_Height",'lengthUnit',cargo."JobCargo_LengthUnit",
    'hsCode',cargo."JobCargo_HSCode",'countryOfOrigin',cargo."JobCargo_CountryOfOriginCodeSnapshot",
    'isHazardous',cargo."JobCargo_IsHazardous",'isTemperatureControlled',cargo."JobCargo_IsTemperatureControlled")
    order by cargo."JobCargo_LineNo",cargo."JobCargo_ID"),'[]'::jsonb)
  from public."Job_Cargo" cargo
  where cargo."JobCargo_JobID"=requested_job_id and not cargo."JobCargo_IsDeleted"
    and cargo."JobCargo_SourceQuoteLineID" is not null
$$;

create function booking_api.plan_quote_cargo_revision(
  requested_job_id uuid, baseline_version_id uuid, proposed_version_id uuid,
  selected_fields jsonb, observed_booking_lines jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  job_row record; baseline_lines jsonb; proposed_lines jsonb; current_lines jsonb;
  current_map jsonb; proposed_map jsonb; observed_differences jsonb; current_differences jsonb;
  item jsonb; observed_item jsonb; line_id text; field_name text; target jsonb; plans jsonb:='{}';
  selected text; selected_count integer; cargo_id uuid;
begin
  -- Private only: the future public review action must still check the caller,
  -- workspace and explicit selections. Lock order matches canonical Booking save.
  select * into strict job_row from public."Job_Header" where "Job_ID"=requested_job_id and not "Job_IsDeleted" for update;
  if job_row."Job_SourceQuoteVersionID" is distinct from baseline_version_id then
    raise exception 'The applied Quote version changed. Refresh the review.' using errcode='40001'; end if;
  select version."CusQuoteVersion_SnapshotJSON"#>'{quote,shipmentFacts,cargoLines}' into baseline_lines
    from public."CusQuote_Versions" version where version."CusQuoteVersion_ID"=baseline_version_id
      and version."CusQuoteHeader_ID"=job_row."Job_SourceQuoteID" and version."CusQuoteVersion_IsSubmitted";
  select version."CusQuoteVersion_SnapshotJSON"#>'{quote,shipmentFacts,cargoLines}' into proposed_lines
    from public."CusQuote_Versions" version join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID"=version."CusQuoteHeader_ID"
    where version."CusQuoteVersion_ID"=proposed_version_id and version."CusQuoteHeader_ID"=job_row."Job_SourceQuoteID"
      and version."CusQuoteVersion_IsSubmitted" and quote."CusQuoteHeader_AcceptedVersionID"=proposed_version_id
      and quote."CusQuoteHeader_LifecycleCode"='accepted' and not quote."CusQuoteHeader_IsDeleted";
  if baseline_lines is null or proposed_lines is null then
    raise exception 'Cargo revision needs structured submitted versions from this Booking and its latest accepted Quote.' using errcode='22023'; end if;
  if selected_fields is null or jsonb_typeof(selected_fields)<>'array' or jsonb_array_length(selected_fields) not between 1 and 8000 then
    raise exception 'Choose cargo fields to review.' using errcode='22023'; end if;
  select count(distinct value) into selected_count from jsonb_array_elements(selected_fields) item where jsonb_typeof(value)='string';
  if selected_count<>jsonb_array_length(selected_fields) then raise exception 'Cargo selections must be unique field keys.' using errcode='22023'; end if;
  current_lines:=booking_api.current_source_cargo_lines(requested_job_id);
  current_map:=booking_api.cargo_comparison_map(current_lines); proposed_map:=quote_api.cargo_line_map(proposed_lines);
  observed_differences:=booking_api.cargo_revision_differences(baseline_lines,observed_booking_lines,proposed_lines);
  current_differences:=booking_api.cargo_revision_differences(baseline_lines,current_lines,proposed_lines);
  for selected in select value from jsonb_array_elements_text(selected_fields) loop
    select value into item from jsonb_array_elements(current_differences) where value->>'key'=selected;
    select value into observed_item from jsonb_array_elements(observed_differences) where value->>'key'=selected;
    if item is null then raise exception 'That cargo field is not changed by this Quote revision.' using errcode='22023'; end if;
    if observed_item is null or item->'bookingValue' is distinct from observed_item->'bookingValue'
      or item->>'operation' is distinct from observed_item->>'operation' then
      raise exception 'Booking cargo changed since it was reviewed. Refresh before applying.' using errcode='40001'; end if;
    line_id:=item->>'sourceLineId'; field_name:=item->>'field';
    target:=coalesce(plans#>array[line_id,'values'],current_map->line_id);
    if field_name='line' then target:=proposed_map->line_id;
    else target:=jsonb_set(target,array[field_name],coalesce(item->'newQuoteValue','null'::jsonb),true); end if;
    select "JobCargo_ID" into cargo_id from public."Job_Cargo" where "JobCargo_JobID"=requested_job_id
      and "JobCargo_SourceQuoteLineID"=line_id::uuid and not "JobCargo_IsDeleted";
    plans:=jsonb_set(plans,array[line_id],jsonb_build_object('sourceLineId',line_id,'bookingCargoId',cargo_id,
      'operation',item->>'operation','values',target),true);
  end loop;
  -- The plan is not execution. It carries complete current values for each
  -- selected line, so unselected Booking changes are retained on persistence.
  return jsonb_build_object('jobId',requested_job_id,'baselineVersionId',baseline_version_id,'proposedVersionId',proposed_version_id,
    'selectedFields',selected_fields,'changes',(select coalesce(jsonb_agg(value order by key),'[]'::jsonb) from jsonb_each(plans)));
end;
$$;

revoke all on function quote_api.cargo_line_map(jsonb) from public,anon,authenticated,service_role;
revoke all on function booking_api.cargo_comparison_map(jsonb) from public,anon,authenticated,service_role;
revoke all on function booking_api.cargo_revision_differences(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function booking_api.current_source_cargo_lines(uuid) from public,anon,authenticated,service_role;
revoke all on function booking_api.plan_quote_cargo_revision(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
commit;
