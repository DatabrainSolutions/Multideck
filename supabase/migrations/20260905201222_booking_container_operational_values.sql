begin;
set local lock_timeout='5s';

-- Exact text at the API boundary; numeric columns remain authoritative.
create function booking_api.normalise_container_operations(lines jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb; result jsonb:='[]'; key text; raw text; amount numeric; places integer; precision_digits integer; line_no integer:=0;
begin
  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines)>100 then
    raise exception 'Booking containers are invalid.' using errcode='22023';end if;
  for item in select value from jsonb_array_elements(lines) loop
    line_no:=line_no+1;
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Container % must be an object.',line_no using errcode='22023';end if;
    foreach key in array array['grossWeightKg','tareWeightKg','verifiedGrossMassKg','reeferSetPoint'] loop
      if not item ? key then continue;end if;
      if jsonb_typeof(item->key) not in ('string','number','null') then raise exception 'Container %: % must be a number.',line_no,key using errcode='22023';end if;
      raw:=nullif(btrim(item->>key),'');
      if raw is null then item:=jsonb_set(item,array[key],'null');continue;end if;
      if length(raw)>64 or raw !~ '^-?([0-9]+|[0-9]{1,3}(,[0-9]{3})+)([.][0-9]+)?$' then
        raise exception 'Container %: enter a valid decimal for %.',line_no,key using errcode='22023';end if;
      amount:=replace(raw,',','')::numeric;
      places:=case when key='reeferSetPoint' then 3 else 6 end;
      precision_digits:=case when key='reeferSetPoint' then 10 else 18 end;
      if (key<>'reeferSetPoint' and amount<0) or amount<>round(amount,places) or abs(amount)>=power(10::numeric,precision_digits-places) then
        raise exception 'Container %: % is outside its supported range or precision.',line_no,key using errcode='22023';end if;
      item:=jsonb_set(item,array[key],to_jsonb(amount::text));
    end loop;
    foreach key in array array['vgmMethod','reeferUnit'] loop
      if not item ? key then continue;end if;
      if jsonb_typeof(item->key) not in ('string','null') then raise exception 'Container %: choose a valid %.',line_no,key using errcode='22023';end if;
      raw:=nullif(btrim(item->>key),'');
      if raw is not null and ((key='vgmMethod' and raw not in ('1','2')) or (key='reeferUnit' and raw not in ('C','F'))) then
        raise exception 'Container %: choose a valid %.',line_no,key using errcode='22023';end if;
      item:=jsonb_set(item,array[key],coalesce(to_jsonb(raw),'null'::jsonb));
    end loop;
    result:=result||jsonb_build_array(item);
  end loop;
  return result;
end $$;

create function booking_api.container_operational_values(item public."Job_Containers")
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('grossWeightKg',item."JobContainer_GrossKilos"::text,
    'tareWeightKg',item."JobContainer_TareKilos"::text,'verifiedGrossMassKg',item."JobContainer_VGMKilos"::text,
    'vgmMethod',item."JobContainer_VGMMethod",'reeferSetPoint',item."JobContainer_ReeferSetPoint"::text,
    'reeferUnit',item."JobContainer_ReeferUnit");
$$;

-- Extend the existing stable-identity upsert, rather than a second save stage
-- that cannot reliably identify newly inserted rows. Missing keys preserve
-- typed values; explicit null clears them. No legacy JSON is inferred as VGM.
do $migration$
declare definition text; prefix text; anchor text; field record;
begin
  definition:=pg_get_functiondef('booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)'::regprocedure);
  anchor:='  if payload ? ''containers'' then';
  if strpos(definition,anchor)=0 then raise exception 'Expected stable equipment save boundary missing';end if;
  prefix:=left(definition,strpos(definition,anchor)-1);
  definition:=substr(definition,strpos(definition,anchor));
  definition:=replace(definition,anchor,anchor||E'\n    payload:=jsonb_set(payload,''{containers}'',booking_api.normalise_container_operations(payload->''containers''));');
  for field in select * from (values
    ('tareWeightKg','JobContainer_TareKilos','numeric'),
    ('verifiedGrossMassKg','JobContainer_VGMKilos','numeric'),
    ('vgmMethod','JobContainer_VGMMethod','text'),
    ('reeferSetPoint','JobContainer_ReeferSetPoint','numeric'),
    ('reeferUnit','JobContainer_ReeferUnit','text')
  ) fields(key,column_name,cast_type) loop
    anchor:='"JobContainer_Status", "JobContainer_GrossKilos",';
    if strpos(definition,anchor)=0 then raise exception 'Expected stable equipment insert columns missing';end if;
    definition:=replace(definition,anchor,format('%s %I,',anchor,field.column_name));
    anchor:='nullif(line->>''grossWeightKg'', '''')::numeric,';
    if strpos(definition,anchor)=0 then raise exception 'Expected stable equipment insert values missing';end if;
    definition:=replace(definition,anchor,anchor||format(' nullif(line->>%L, '''')::%s,',field.key,field.cast_type));
    anchor:='"JobContainer_GrossKilos" = excluded."JobContainer_GrossKilos",';
    if strpos(definition,anchor)=0 then raise exception 'Expected stable equipment upsert missing';end if;
    definition:=replace(definition,anchor,anchor||format(E'\n          %I = case when line ? %L then excluded.%I else public."Job_Containers".%I end,',field.column_name,field.key,field.column_name,field.column_name));
  end loop;
  anchor:='"JobContainer_GrossKilos" = excluded."JobContainer_GrossKilos",';
  definition:=replace(definition,anchor,'"JobContainer_GrossKilos" = case when line ? ''grossWeightKg'' then excluded."JobContainer_GrossKilos" else public."Job_Containers"."JobContainer_GrossKilos" end,');
  execute prefix||definition;
end $migration$;

-- Exact typed values override stale compatibility JSON in every full workspace.
alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_container_ops_20260905;
create function booking_api.workspace_extended(caller_auth_user_id uuid,requested_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; job_id uuid; rows jsonb; source_rows jsonb;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode='42501';end if;
  result:=booking_api.workspace_before_container_ops_20260905(caller_auth_user_id,requested_reference);
  job_id:=nullif(result#>>'{booking,jobId}','')::uuid;
  if not exists(select 1 from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    join public."cmp_Users" actor on actor."Company_ID"=office."Company_ID" and actor."Auth_User_ID"=caller_auth_user_id and actor."User_AccessStatus"='active'
    where job."Job_ID"=job_id and not job."Job_IsDeleted") then
    raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
  source_rows:=coalesce(nullif(result->'containers','null'::jsonb),'[]'::jsonb);
  if jsonb_typeof(source_rows) is distinct from 'array' then raise exception 'Equipment changed while loading. Reload the Booking.' using errcode='40001';end if;
  select coalesce(jsonb_agg(entry.value||booking_api.container_operational_values(container) order by entry.ordinal),'[]') into rows
    from jsonb_array_elements(source_rows) with ordinality entry(value,ordinal)
    join public."Job_Containers" container on container."JobContainers_ID"=nullif(entry.value->>'id','')::uuid
      and container."Job_ID"=job_id and not container."JobContainer_IsDeleted";
  if jsonb_array_length(rows)<>jsonb_array_length(source_rows) then raise exception 'Equipment changed while loading. Reload the Booking.' using errcode='40001';end if;
  return jsonb_set(result,'{containers}',rows);
end $$;

create function booking_api.audit_container_operations()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_values jsonb; after_values jsonb;
begin
  before_values:=case when tg_op='INSERT' then booking_api.container_operational_values(null::public."Job_Containers") else booking_api.container_operational_values(old) end;
  after_values:=booking_api.container_operational_values(new);
  if before_values is not distinct from after_values then return new;end if;
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    select office."Company_ID",new."Job_ID",'container_operations_changed','Container operational values changed.',
      jsonb_build_object('containerId',new."JobContainers_ID",'containerNumber',new."JobContainer_Number",'before',before_values,'after',after_values),new."JobContainer_UpdatedBy"
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=new."Job_ID";
  return new;
end $$;
create trigger audit_container_operations after insert or update on public."Job_Containers"
  for each row execute function booking_api.audit_container_operations();

revoke all on function booking_api.normalise_container_operations(jsonb),booking_api.container_operational_values(public."Job_Containers"),
  booking_api.audit_container_operations(),booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb),
  booking_api.workspace_before_container_ops_20260905(uuid,text) from public,anon,authenticated,service_role;
revoke all on function booking_api.workspace_extended(uuid,text) from public,anon,authenticated;
grant execute on function booking_api.workspace_extended(uuid,text) to service_role;
commit;
