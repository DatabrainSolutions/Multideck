begin;
set local lock_timeout = '5s';

-- Optional version-owned extension. Existing submitted snapshots are untouched.
create function quote_api.cargo_handling(raw text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare data jsonb; kind text; item jsonb; field text; fields text[];
begin
  if nullif(btrim(raw),'') is null then return '{}'::jsonb; end if;
  if length(raw)>20000 then raise exception 'Cargo handling details are too long.' using errcode='22023'; end if;
  begin data:=raw::jsonb; exception when invalid_text_representation then
    raise exception 'Cargo handling details are invalid.' using errcode='22023'; end;
  if jsonb_typeof(data)<>'object' then raise exception 'Cargo handling must be an object.' using errcode='22023'; end if;
  for kind,item in select * from jsonb_each(data) loop
    fields:=case kind
      when 'hazardous' then array['unNumber','properShippingName','class','packingGroup','notes']
      when 'temperatureControlled' then array['setPoint','unit','notes']
      when 'oversized' then '{}'::text[] when 'fragile' then '{}'::text[] when 'foodGrade' then '{}'::text[] end;
    if fields is null or jsonb_typeof(item)<>'object' or jsonb_typeof(item->'tbc') is distinct from 'boolean'
       or jsonb_typeof(item->'details') is distinct from 'object' then
      raise exception 'Invalid cargo handling selection: %.',kind using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('tbc','details')) then
      raise exception 'Unsupported cargo handling data.' using errcode='22023'; end if;
    for field in select jsonb_object_keys(item->'details') loop
      if not field=any(fields) or jsonb_typeof(item->'details'->field)<>'string' or length(item->'details'->>field)>4000 then
        raise exception 'Invalid cargo handling field: %.',field using errcode='22023'; end if;
    end loop;
  end loop;
  return data;
end $$;
revoke all on function quote_api.cargo_handling(text) from public,anon,authenticated;
grant execute on function quote_api.cargo_handling(text) to service_role;

create function quote_api.cargo_handling_missing(line jsonb, allow_tbc boolean default false) returns text[]
language plpgsql immutable set search_path='' as $$
declare data jsonb:=quote_api.cargo_handling(line->>'handlingDetailsJson'); kind text; item jsonb; d jsonb; absent boolean; result text[]:='{}';
begin
  for kind,item in select * from jsonb_each(data) loop
    if allow_tbc and (item->>'tbc')::boolean then continue; end if;
    d:=item->'details'; absent:=(item->>'tbc')::boolean;
    if kind='hazardous' then
      absent:=absent or coalesce(d->>'unNumber','') !~ '^[0-9]{4}$'
        or coalesce(nullif(btrim(d->>'properShippingName'),''),'TBC') ~* '\mTBC\M'
        or coalesce(nullif(btrim(d->>'class'),''),'TBC') ~* '\mTBC\M'
        or coalesce(nullif(btrim(d->>'packingGroup'),''),'TBC') ~* '\mTBC\M';
    elsif kind='temperatureControlled' then
      absent:=absent or coalesce(d->>'setPoint','') !~ '^-?[0-9]+([.][0-9]+)?$' or upper(coalesce(d->>'unit','')) not in ('C','F');
    elsif kind='oversized' then
      absent:=absent or coalesce(line->>'length','') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(line->>'width','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(line->>'height','') !~ '^[0-9]+([.][0-9]+)?$';
      if not absent then absent:=(line->>'length')::numeric<=0 or (line->>'width')::numeric<=0 or (line->>'height')::numeric<=0; end if;
    else
      absent:=absent or coalesce(nullif(btrim(line->>'description'),''),'TBC') ~* '\mTBC\M';
    end if;
    if absent then result:=array_append(result,kind); end if;
  end loop;
  return result;
end $$;
revoke all on function quote_api.cargo_handling_missing(jsonb,boolean) from public,anon,authenticated;
grant execute on function quote_api.cargo_handling_missing(jsonb,boolean) to service_role;

do $migration$
declare definition text:=pg_get_functiondef('quote_api.normalise_cargo_lines(jsonb,boolean)'::regprocedure);
  anchor text:='    result := result || jsonb_build_array(normalised);';
begin
  if position(anchor in definition)=0 or position('handlingDetailsJson' in definition)>0 then raise exception 'Review cargo normalisation before extending it.'; end if;
  definition:=replace(definition,'''hsCode'',''countryOfOrigin'']','''hsCode'',''countryOfOrigin'',''handlingDetailsJson'']');
  if position('handlingDetailsJson' in definition)=0 then raise exception 'Cargo text-field declaration changed.'; end if;
  execute replace(definition,anchor,$patch$
    if nullif(btrim(item->>'handlingDetailsJson'),'') is not null then
      perform quote_api.cargo_handling(item->>'handlingDetailsJson');
      if coalesce((normalised->>'isHazardous')::boolean,false) <> (quote_api.cargo_handling(item->>'handlingDetailsJson') ? 'hazardous')
        or coalesce((normalised->>'isTemperatureControlled')::boolean,false) <> (quote_api.cargo_handling(item->>'handlingDetailsJson') ? 'temperatureControlled') then
        raise exception 'Cargo handling flags do not match the line details.' using errcode='22023';
      end if;
      if require_complete and cardinality(quote_api.cargo_handling_missing(normalised,true))>0 then
        raise exception 'Supply selected handling details or explicitly mark them TBC before issuing the Quote.' using errcode='22023';
      end if;
    end if;
$patch$||anchor);
end $migration$;

do $migration$
declare definition text:=pg_get_functiondef('quote_api.cargo_issue_missing(jsonb,text,text)'::regprocedure);
  anchor text:='    line_number := line_number + 1;';
begin
  if position(anchor in definition)=0 then raise exception 'Review Quote issue readiness before adding handling checks.'; end if;
  execute replace(definition,anchor,anchor||$patch$
    if cardinality(quote_api.cargo_handling_missing(item,true))>0 then
      missing:=array_append(missing,format('Cargo line %s: supply handling details or explicitly select Details TBC',line_number));
    end if;
$patch$);
end $migration$;

create function booking_api.validate_cargo_handling() returns trigger
language plpgsql set search_path='' as $$
declare data jsonb;
begin
  if nullif(btrim(new."JobCargo_CargoJSON"->>'handlingDetailsJson'),'') is not null then
    data:=quote_api.cargo_handling(new."JobCargo_CargoJSON"->>'handlingDetailsJson');
    if new."JobCargo_IsHazardous" is distinct from (data ? 'hazardous')
      or new."JobCargo_IsTemperatureControlled" is distinct from (data ? 'temperatureControlled') then
      raise exception 'Update the cargo line handling selections and details together.' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function booking_api.validate_cargo_handling() from public,anon,authenticated,service_role;
create trigger booking_handling_validate before insert or update on public."Job_Cargo"
  for each row execute function booking_api.validate_cargo_handling();

-- Readiness is per operational cargo line. Do not modify the accepted Quote.
create function booking_api.cargo_handling_missing(requested_job_id uuid) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare cargo record; labels text[]; result text[]:='{}'; label text;
begin
  for cargo in select * from public."Job_Cargo" where "JobCargo_JobID"=requested_job_id and not "JobCargo_IsDeleted" loop
    labels:=quote_api.cargo_handling_missing(cargo."JobCargo_CargoJSON" || jsonb_build_object(
      'description',cargo."JobCargo_Description",'length',cargo."JobCargo_Length",'width',cargo."JobCargo_Width",'height',cargo."JobCargo_Height"),false);
    foreach label in array labels loop
      result:=array_append(result,format('Cargo line %s: %s details required before operational readiness or completion',cargo."JobCargo_LineNo",label));
    end loop;
  end loop;
  return result;
end $$;
revoke all on function booking_api.cargo_handling_missing(uuid) from public,anon,authenticated,service_role;

-- Deferred until all cargo/header writes in the existing save transaction finish.
create function booking_api.check_cargo_handling_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare job_id uuid; state text; missing text[];
begin
  if tg_table_name='Job_Header' then job_id:=new."Job_ID"; else job_id:=new."JobCargo_JobID"; end if;
  select "Job_Status" into state from public."Job_Header" where "Job_ID"=job_id and not "Job_IsDeleted" for update;
  if state in ('booked','in_transit','arrived','delivered','completed','ready_for_invoice','complete') then
    missing:=booking_api.cargo_handling_missing(job_id);
    if cardinality(missing)>0 then raise exception 'Resolve cargo handling TBC details before operational readiness or completion.' using errcode='22023',detail=to_jsonb(missing)::text; end if;
  end if;
  return new;
end $$;
revoke all on function booking_api.check_cargo_handling_status() from public,anon,authenticated,service_role;
create constraint trigger booking_handling_status after insert or update on public."Job_Header"
  deferrable initially deferred for each row execute function booking_api.check_cargo_handling_status();
create constraint trigger booking_handling_cargo after insert or update on public."Job_Cargo"
  deferrable initially deferred for each row execute function booking_api.check_cargo_handling_status();

do $migration$
declare definition text:=pg_get_functiondef('booking_api.completion_readiness_for_job(uuid)'::regprocedure);
  anchor text:='  missing_count := jsonb_array_length(missing_value);';
begin
  if position(anchor in definition)=0 then raise exception 'Review Booking completion readiness before extending it.'; end if;
  execute replace(definition,anchor,$patch$
  total_checks := total_checks + 1;
  if cardinality(booking_api.cargo_handling_missing(requested_job_id))>0 then
    missing_value := missing_value || jsonb_build_array(jsonb_build_object('key','cargo_handling','label',array_to_string(booking_api.cargo_handling_missing(requested_job_id),'; '),'section','Cargo & equipment'));
  end if;
$patch$||anchor);
end $migration$;
commit;
