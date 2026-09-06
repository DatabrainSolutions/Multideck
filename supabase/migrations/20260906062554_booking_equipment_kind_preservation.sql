-- Keep equipment identity independent of the current commercial/routing mode.
-- Existing private save, permission, stale-data and allocation boundaries remain.
begin;
set local lock_timeout = '5s';

create function booking_api.equipment_kind_for_save(item jsonb, requested_job_id uuid)
returns text language plpgsql stable set search_path = '' as $$
declare kind text; existing_kind text; existing_vgm numeric; existing_method text; field_name text;
begin
  foreach field_name in array array['number','type'] loop
    if item ? field_name and (jsonb_typeof(item->field_name) not in ('string','null')
      or length(btrim(item->>field_name))>case when field_name='number' then 50 else 40 end) then
      raise exception 'Equipment % must be text of at most % characters.',field_name,case when field_name='number' then 50 else 40 end using errcode='22023'; end if;
  end loop;
  if nullif(item->>'id','') is not null then
    select "JobContainer_EquipmentKind","JobContainer_VGMKilos","JobContainer_VGMMethod"
      into existing_kind,existing_vgm,existing_method from public."Job_Containers"
      where "JobContainers_ID"=(item->>'id')::uuid and "Job_ID"=requested_job_id and not "JobContainer_IsDeleted";
  end if;
  if item ? 'equipmentKind' and jsonb_typeof(item->'equipmentKind') is distinct from 'string' then
    raise exception 'Choose an equipment kind; it cannot be cleared.' using errcode='22023'; end if;
  kind:=case when item ? 'equipmentKind' then btrim(item->>'equipmentKind') else coalesce(existing_kind,'container') end;
  -- Retain exact pre-existing specialist values, but do not introduce unknown
  -- kinds or silently trim/truncate one kind into a different identity.
  if kind='' or length(kind)>40 or (kind not in ('container','uld','vehicle','trailer','wagon')
    and kind is distinct from existing_kind) then
    raise exception 'Choose Container, ULD, Vehicle, Trailer or Wagon. Existing specialist kinds may be retained.' using errcode='22023'; end if;
  if kind<>'container' and (
    (nullif(item->>'verifiedGrossMassKg','') is not null and (item->>'verifiedGrossMassKg')::numeric is distinct from existing_vgm)
    or (nullif(item->>'vgmMethod','') is not null and item->>'vgmMethod' is distinct from existing_method)) then
    raise exception 'VGM applies to freight containers, not this equipment kind. Existing evidence may be retained or cleared.' using errcode='22023'; end if;
  return kind;
end $$;

do $migration$
declare definition text; marker text; field record;
begin
  definition:=pg_get_functiondef('booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)'::regprocedure);
  marker:='coalesce(left(nullif(btrim(line->>''equipmentKind''), ''''), 40), ''container'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then
    raise exception 'Expected single equipment-kind save expression is missing'; end if;
  definition:=replace(definition,marker,'booking_api.equipment_kind_for_save(line, requested_job_id)');
  for field in select * from (values
    ('number','JobContainer_Number'),('type','JobContainer_TypeCodeSnapshot'),
    ('status','JobContainer_Status'),('notes','JobContainer_Notes')
  ) fields(key,column_name) loop
    marker:=format('%I = excluded.%I,',field.column_name,field.column_name);
    if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then
      raise exception 'Expected single equipment identity upsert is missing: %',field.key; end if;
    definition:=replace(definition,marker,format('%I = case when line ? %L then excluded.%I else public."Job_Containers".%I end,',field.column_name,field.key,field.column_name,field.column_name));
  end loop;
  execute definition;
end $migration$;

create function booking_api.equipment_identity_values(item public."Job_Containers")
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('number',item."JobContainer_Number",'type',item."JobContainer_TypeCodeSnapshot",
    'equipmentKind',item."JobContainer_EquipmentKind",'status',item."JobContainer_Status",'archived',item."JobContainer_IsDeleted");
$$;
create function booking_api.audit_equipment_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_value jsonb; after_value jsonb;
begin
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.equipment_identity_values(old) end;
  after_value:=booking_api.equipment_identity_values(new);
  if before_value=after_value then return new; end if;
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    select office."Company_ID",new."Job_ID",'equipment_identity_changed','Booking equipment identity changed.',
      jsonb_build_object('equipmentId',new."JobContainers_ID",'before',before_value,'after',after_value),new."JobContainer_UpdatedBy"
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=new."Job_ID";
  return new;
end $$;
create trigger audit_equipment_identity after insert or update on public."Job_Containers"
  for each row execute function booking_api.audit_equipment_identity();

-- The existing exact-equipment read/watch adapter already carries kind, type,
-- number, retirement and typed operational values. Keep stable capability codes
-- and saved watch rules; remove the misleading Container label for every row.
do $migration$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('public.multideck_dexter_domain_booking_containers(uuid,text,integer)'::regprocedure);
  marker:='||'' · Container ''||';
  if strpos(definition,marker)=0 then raise exception 'Expected equipment evidence label is missing'; end if;
  execute replace(definition,marker,'||'' · ''||case container."JobContainer_EquipmentKind" when ''container'' then ''Container'' when ''uld'' then ''ULD'' when ''vehicle'' then ''Vehicle'' when ''trailer'' then ''Trailer'' when ''wagon'' then ''Wagon'' else ''Equipment (''||container."JobContainer_EquipmentKind"||'')'' end||'' ''||');
end $migration$;
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Name"='Booking equipment',
  "AIDexterDomain_Description"='Exact active container, ULD, vehicle, trailer and wagon records: kind, number, type, weight and temperature evidence. No costs, margins or raw JSON. Adding/removing equipment and identity corrections currently require Booking Details.'
  where "AIDexterDomain_Code"='booking_containers';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Name"='Booking equipment',
  "AIDexterWatchCapability_Description"='Notify on saved field changes to one exact container, ULD, vehicle, trailer or wagon. Existing permissions and rules apply; no autonomous edits or recurring AI calls.'
  where "AIDexterWatchCapability_Code"='booking_containers';
update public."sys_AIDexterActions" set "AIDexterAction_Name"='Edit equipment operational field',
  "AIDexterAction_Description"='Propose one exact equipment weight or temperature field for explicit approval in both access modes. Read current Booking and equipment timestamps. VGM applies only to freight containers. Adding/removing equipment and identity/type corrections require Booking Details; allocation uses its own approved action.'
  where "AIDexterAction_Code"='update_booking_container';

revoke all on function booking_api.equipment_kind_for_save(jsonb,uuid),
  booking_api.equipment_identity_values(public."Job_Containers"),booking_api.audit_equipment_identity()
  from public,anon,authenticated,service_role;
commit;
