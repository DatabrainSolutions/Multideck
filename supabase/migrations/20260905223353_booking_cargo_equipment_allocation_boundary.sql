begin;
set local lock_timeout = '5s';

-- Quantified, optionally leg-specific allocations. The older
-- Job_PackCargoContainer table is an unquantified membership record: do not
-- invent quantities or routing scope from it, or rewrite its history.
create table booking_api.cargo_equipment_allocations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public."Job_Header"("Job_ID"),
  cargo_id uuid not null references public."Job_Cargo"("JobCargo_ID"),
  container_id uuid not null references public."Job_Containers"("JobContainers_ID"),
  route_id uuid references public."Job_Routing"("JobRoute_ID"),
  package_quantity numeric(18,6),
  gross_weight_kg numeric(18,2),
  volume_cbm numeric(18,6),
  notes text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null,
  updated_by uuid not null,
  active_cargo_id uuid generated always as (case when not is_deleted then cargo_id end) stored,
  route_scope_id uuid generated always as (coalesce(route_id,'00000000-0000-0000-0000-000000000000'::uuid)) stored,
  constraint allocation_active_slot unique (active_cargo_id,container_id,route_scope_id) deferrable initially deferred,
  constraint allocation_packages_valid check (package_quantity >= 0 and package_quantity <> 'NaN'::numeric),
  constraint allocation_weight_valid check (gross_weight_kg >= 0 and gross_weight_kg <> 'NaN'::numeric),
  constraint allocation_volume_valid check (volume_cbm >= 0 and volume_cbm <> 'NaN'::numeric),
  constraint allocation_notes_length check (length(notes) <= 2000)
);
create index cargo_allocations_job on booking_api.cargo_equipment_allocations(job_id);
create index cargo_allocations_cargo on booking_api.cargo_equipment_allocations(cargo_id);
create index cargo_allocations_container on booking_api.cargo_equipment_allocations(container_id);
create index cargo_allocations_route on booking_api.cargo_equipment_allocations(route_id) where route_id is not null;
alter table booking_api.cargo_equipment_allocations enable row level security;
revoke all on booking_api.cargo_equipment_allocations from public,anon,authenticated,service_role;

create function booking_api.allocation_values(item booking_api.cargo_equipment_allocations)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',item.id,'cargoId',item.cargo_id,'containerId',item.container_id,
    'routeId',item.route_id,'packageQuantity',item.package_quantity::text,
    'grossWeightKg',item.gross_weight_kg::text,'volumeCbm',item.volume_cbm::text,
    'notes',item.notes,'archived',item.is_deleted);
$$;

-- Called after all rows in a batch are saved, and by deferred constraints when
-- another workflow changes the underlying goods/equipment. Unknown quantities
-- remain unknown. A recorded partial amount may not exceed a known total.
create function booking_api.assert_cargo_allocations(requested_job_id uuid)
returns void language plpgsql set search_path='' as $$
declare invalid_cargo uuid;
begin
  if not exists(select 1 from booking_api.cargo_equipment_allocations where job_id=requested_job_id and not is_deleted) then return;end if;
  if exists(select 1 from booking_api.cargo_equipment_allocations a
    left join public."Job_Cargo" c on c."JobCargo_ID"=a.cargo_id and c."JobCargo_JobID"=a.job_id and not c."JobCargo_IsDeleted"
    left join public."Job_Containers" e on e."JobContainers_ID"=a.container_id and e."Job_ID"=a.job_id and not e."JobContainer_IsDeleted"
    left join public."Job_Routing" r on r."JobRoute_ID"=a.route_id and r."Job_ID"=a.job_id
    where a.job_id=requested_job_id and not a.is_deleted
      and (c."JobCargo_ID" is null or e."JobContainers_ID" is null or (a.route_id is not null and r."JobRoute_ID" is null))) then
    raise exception 'Remove or reassign cargo allocations before removing their cargo, equipment or routing leg.' using errcode='23514';
  end if;
  if exists(select 1 from booking_api.cargo_equipment_allocations where job_id=requested_job_id and not is_deleted
    group by cargo_id having bool_or(route_id is null) and bool_or(route_id is not null)) then
    raise exception 'Use either whole-journey or individual-leg allocations for each cargo line, not both.' using errcode='23514';
  end if;
  select a.cargo_id into invalid_cargo from booking_api.cargo_equipment_allocations a
    join public."Job_Cargo" c on c."JobCargo_ID"=a.cargo_id
    where a.job_id=requested_job_id and not a.is_deleted
    group by a.cargo_id,a.route_id,c."JobCargo_PackageQty",c."JobCargo_Qty",c."JobCargo_GrossKilos",c."JobCargo_VolumeCBM"
    having sum(a.package_quantity)>coalesce(c."JobCargo_PackageQty",c."JobCargo_Qty")
      or sum(a.gross_weight_kg)>c."JobCargo_GrossKilos" or sum(a.volume_cbm)>c."JobCargo_VolumeCBM" limit 1;
  if found then
    raise exception 'Cargo allocation exceeds its recorded packages, gross weight or volume. Review the allocations and cargo totals together.' using errcode='23514';
  end if;
end $$;

-- Every writer serialises on the same Job row. Canonical Booking saves already
-- acquire this lock; these guards also protect internal single-record writers.
create function booking_api.lock_allocation_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare job uuid; previous_job uuid; linked boolean:=false;
begin
  if tg_table_name='cargo_equipment_allocations' then
    job:=new.job_id; if tg_op='UPDATE' then previous_job:=old.job_id;end if;
    linked:=true;
  elsif tg_table_name='Job_Cargo' then
    job:=new."JobCargo_JobID"; previous_job:=old."JobCargo_JobID";
    if job is distinct from previous_job then select exists(select 1 from booking_api.cargo_equipment_allocations where cargo_id=old."JobCargo_ID") into linked;end if;
  else
    job:=new."Job_ID"; previous_job:=old."Job_ID";
    if job is distinct from previous_job then
      if tg_table_name='Job_Containers' then
        select exists(select 1 from booking_api.cargo_equipment_allocations where container_id=old."JobContainers_ID") into linked;
      else
        select exists(select 1 from booking_api.cargo_equipment_allocations where route_id=old."JobRoute_ID") into linked;
      end if;
    end if;
  end if;
  if linked and job is distinct from previous_job and tg_op='UPDATE' then
    raise exception 'Moving cargo, equipment or allocations to another Booking is not supported.' using errcode='23514';end if;
  perform 1 from public."Job_Header" where "Job_ID"=job for update;
  return new;
end $$;
create trigger lock_cargo_allocation_job before insert or update on booking_api.cargo_equipment_allocations
  for each row execute function booking_api.lock_allocation_job();
create trigger lock_cargo_allocation_totals before update of "JobCargo_PackageQty","JobCargo_Qty","JobCargo_GrossKilos","JobCargo_VolumeCBM","JobCargo_IsDeleted","JobCargo_JobID" on public."Job_Cargo"
  for each row execute function booking_api.lock_allocation_job();
create trigger lock_container_allocation_membership before update of "JobContainer_IsDeleted","Job_ID" on public."Job_Containers"
  for each row execute function booking_api.lock_allocation_job();
create trigger lock_route_allocation_membership before update of "Job_ID" on public."Job_Routing"
  for each row execute function booking_api.lock_allocation_job();

create function booking_api.check_allocation_job()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='cargo_equipment_allocations' then
    perform booking_api.assert_cargo_allocations(new.job_id);
  elsif tg_table_name='Job_Cargo' then
    perform booking_api.assert_cargo_allocations(new."JobCargo_JobID");
  else
    perform booking_api.assert_cargo_allocations(new."Job_ID");
  end if;
  return new;
end $$;
create constraint trigger check_cargo_allocations after insert or update on booking_api.cargo_equipment_allocations
  deferrable initially deferred for each row execute function booking_api.check_allocation_job();
create constraint trigger check_cargo_allocation_totals after update on public."Job_Cargo"
  deferrable initially deferred for each row execute function booking_api.check_allocation_job();
create constraint trigger check_container_allocations after update on public."Job_Containers"
  deferrable initially deferred for each row execute function booking_api.check_allocation_job();
create constraint trigger check_route_allocations after update on public."Job_Routing"
  deferrable initially deferred for each row execute function booking_api.check_allocation_job();

create function booking_api.audit_cargo_allocation()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_value jsonb; after_value jsonb;
begin
  before_value:=case when tg_op='UPDATE' then booking_api.allocation_values(old) else 'null'::jsonb end;
  after_value:=booking_api.allocation_values(new);
  if before_value is not distinct from after_value then return new;end if;
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    select office."Company_ID",new.job_id,'cargo_allocation_changed','Cargo equipment allocation changed.',
      jsonb_build_object('allocationId',new.id,'before',before_value,'after',after_value),new.updated_by
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=new.job_id;
  return new;
end $$;
create trigger audit_cargo_allocation after insert or update on booking_api.cargo_equipment_allocations
  for each row execute function booking_api.audit_cargo_allocation();

-- Private read contract for the editor and approved Dexter adapter. No browser
-- or service-role grants until those exact-identity adapters are wired together.
create function booking_api.cargo_allocation_state(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare job_row public."Job_Header"; allocations jsonb; legacy_links jsonb; balances jsonb;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode='42501';end if;
  select job.* into job_row from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    join public."cmp_Users" actor on actor."Company_ID"=office."Company_ID" and actor."Auth_User_ID"=caller_auth_user_id and actor."User_AccessStatus"='active'
    where job."Job_ID"=requested_job_id and not job."Job_IsDeleted";
  if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
  select coalesce(jsonb_agg(booking_api.allocation_values(a) order by a.created_at,a.id),'[]') into allocations
    from booking_api.cargo_equipment_allocations a where job_id=requested_job_id and not is_deleted;
  select coalesce(jsonb_agg(jsonb_build_object('cargoId',link."JobCargo_ID",'containerId',link."JobContainer_ID")
    order by link."JobCargo_ID",link."JobContainer_ID"),'[]') into legacy_links
    from public."Job_PackCargoContainer" link
    join public."Job_Cargo" c on c."JobCargo_ID"=link."JobCargo_ID" and c."JobCargo_JobID"=requested_job_id and not c."JobCargo_IsDeleted"
    join public."Job_Containers" e on e."JobContainers_ID"=link."JobContainer_ID" and e."Job_ID"=requested_job_id and not e."JobContainer_IsDeleted";
  select coalesce(jsonb_agg(jsonb_build_object('cargoId',cargo_id,'routeId',route_id,
    'remainingPackages',case when count_packages=line_count then (total_packages-packages)::text end,
    'remainingGrossWeightKg',case when count_weight=line_count then (total_weight-weight)::text end,
    'remainingVolumeCbm',case when count_volume=line_count then (total_volume-volume)::text end)
    order by cargo_id,route_id nulls first),'[]') into balances from (
      select a.cargo_id,a.route_id,count(*) line_count,count(a.package_quantity) count_packages,
        count(a.gross_weight_kg) count_weight,count(a.volume_cbm) count_volume,
        sum(a.package_quantity) packages,sum(a.gross_weight_kg) weight,sum(a.volume_cbm) volume,
        coalesce(c."JobCargo_PackageQty",c."JobCargo_Qty") total_packages,c."JobCargo_GrossKilos" total_weight,c."JobCargo_VolumeCBM" total_volume
      from booking_api.cargo_equipment_allocations a join public."Job_Cargo" c on c."JobCargo_ID"=a.cargo_id
      where a.job_id=requested_job_id and not a.is_deleted
      group by a.cargo_id,a.route_id,c."JobCargo_PackageQty",c."JobCargo_Qty",c."JobCargo_GrossKilos",c."JobCargo_VolumeCBM"
    ) totals;
  return jsonb_build_object('jobId',requested_job_id,'updatedAt',job_row."Job_UpdatedAt",'allocations',allocations,
    'balances',balances,'legacyUnquantifiedLinks',legacy_links);
end $$;

create function booking_api.replace_cargo_allocations(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor record; job_row public."Job_Header"; line jsonb; lines jsonb:='[]'; key text; raw text; amount numeric;
  item_id uuid; cargo uuid; equipment uuid; route uuid; old_item booking_api.cargo_equipment_allocations;
  retained uuid[]:='{}'; changed boolean:=false; did_change boolean; field_scale integer;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read')
    or not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('expectedUpdatedAt','allocations'))
    or jsonb_typeof(payload->'allocations') is distinct from 'array' or jsonb_array_length(payload->'allocations')>1000
    or jsonb_typeof(payload->'expectedUpdatedAt') is distinct from 'string' then
    raise exception 'Provide the saved Booking timestamp and cargo allocations.' using errcode='22023';end if;
  select "User_ID","Company_ID" into actor from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select job.* into job_row from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=requested_job_id and office."Company_ID"=actor."Company_ID" and not job."Job_IsDeleted" for update of job;
  if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
  if (payload->>'expectedUpdatedAt')::timestamptz is distinct from job_row."Job_UpdatedAt" then
    raise exception 'Booking changed. Reload before saving cargo allocations.' using errcode='40001';end if;
  for line in select value from jsonb_array_elements(payload->'allocations') loop
    if jsonb_typeof(line) is distinct from 'object' or exists(select 1 from jsonb_object_keys(line) k
      where k not in ('id','cargoId','containerId','routeId','packageQuantity','grossWeightKg','volumeCbm','notes')) then
      raise exception 'Cargo allocation contains unsupported fields.' using errcode='22023';end if;
    -- Stable client-generated UUIDs make the reviewed identity unambiguous.
    foreach key in array array['id','cargoId','containerId','routeId'] loop
      if key='routeId' and (not line ? key or line->key='null'::jsonb) then continue;end if;
      if jsonb_typeof(line->key) is distinct from 'string' or (line->>key) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (line->>key)::uuid='00000000-0000-0000-0000-000000000000'::uuid then
        raise exception 'Choose a saved cargo line, equipment and optional routing leg.' using errcode='22023';end if;
    end loop;
    item_id:=(line->>'id')::uuid; cargo:=(line->>'cargoId')::uuid; equipment:=(line->>'containerId')::uuid; route:=(line->>'routeId')::uuid;
    if item_id=any(retained) then raise exception 'Each cargo allocation needs a distinct identity.' using errcode='22023';end if;
    retained:=array_append(retained,item_id);
    select * into old_item from booking_api.cargo_equipment_allocations where id=item_id;
    if found and (old_item.job_id<>requested_job_id or old_item.is_deleted) then
      raise exception 'That cargo allocation is unavailable in this Booking.' using errcode='42501';end if;
    if not exists(select 1 from public."Job_Cargo" where "JobCargo_ID"=cargo and "JobCargo_JobID"=requested_job_id and not "JobCargo_IsDeleted")
      or not exists(select 1 from public."Job_Containers" where "JobContainers_ID"=equipment and "Job_ID"=requested_job_id and not "JobContainer_IsDeleted")
      or (route is not null and not exists(select 1 from public."Job_Routing" where "JobRoute_ID"=route and "Job_ID"=requested_job_id)) then
      raise exception 'Choose cargo, equipment and routing from this Booking.' using errcode='42501';end if;
    foreach key in array array['packageQuantity','grossWeightKg','volumeCbm'] loop
      if line ? key and jsonb_typeof(line->key) not in ('string','null') then
        raise exception 'Allocation quantities must use exact decimal text.' using errcode='22023';end if;
      raw:=nullif(btrim(line->>key),'');
      if raw is null then line:=jsonb_set(line,array[key],'null');continue;end if;
      if length(raw)>64 or raw !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception 'Enter a non-negative allocation quantity.' using errcode='22023';end if;
      amount:=raw::numeric; field_scale:=case key when 'grossWeightKg' then 2 else 6 end;
      if amount<>round(amount,field_scale) or amount>=power(10::numeric,18-field_scale) then
        raise exception 'Allocation quantity exceeds the supported range or precision.' using errcode='22023';end if;
      line:=jsonb_set(line,array[key],to_jsonb(amount::text));
    end loop;
    if line ? 'notes' and jsonb_typeof(line->'notes') not in ('string','null') then
      raise exception 'Allocation notes must be text.' using errcode='22023';end if;
    if length(line->>'notes')>2000 then raise exception 'Allocation notes must be 2000 characters or fewer.' using errcode='22023';end if;
    lines:=lines||jsonb_build_array(line);
  end loop;
  if exists(select 1 from jsonb_array_elements(lines) a group by (a->>'cargoId')::uuid,(a->>'containerId')::uuid,(a->>'routeId')::uuid having count(*)>1) then
    raise exception 'Use one allocation per cargo line, equipment and routing scope.' using errcode='22023';end if;
  update booking_api.cargo_equipment_allocations set is_deleted=true,updated_by=actor."User_ID",updated_at=clock_timestamp()
    where job_id=requested_job_id and not is_deleted and not(id=any(retained));
  changed:=found;
  for line in select value from jsonb_array_elements(lines) loop
    insert into booking_api.cargo_equipment_allocations(id,job_id,cargo_id,container_id,route_id,package_quantity,gross_weight_kg,volume_cbm,notes,created_by,updated_by)
      values((line->>'id')::uuid,requested_job_id,(line->>'cargoId')::uuid,(line->>'containerId')::uuid,(line->>'routeId')::uuid,
        (line->>'packageQuantity')::numeric,(line->>'grossWeightKg')::numeric,(line->>'volumeCbm')::numeric,nullif(btrim(line->>'notes'),''),actor."User_ID",actor."User_ID")
      on conflict (id) do update set cargo_id=excluded.cargo_id,container_id=excluded.container_id,route_id=excluded.route_id,
        package_quantity=excluded.package_quantity,gross_weight_kg=excluded.gross_weight_kg,volume_cbm=excluded.volume_cbm,
        notes=excluded.notes,updated_by=excluded.updated_by,updated_at=clock_timestamp()
      where cargo_equipment_allocations.job_id=requested_job_id and not cargo_equipment_allocations.is_deleted
        and (cargo_equipment_allocations.cargo_id,cargo_equipment_allocations.container_id,cargo_equipment_allocations.route_id,
        cargo_equipment_allocations.package_quantity,cargo_equipment_allocations.gross_weight_kg,cargo_equipment_allocations.volume_cbm,cargo_equipment_allocations.notes)
        is distinct from (excluded.cargo_id,excluded.container_id,excluded.route_id,excluded.package_quantity,excluded.gross_weight_kg,excluded.volume_cbm,excluded.notes);
    did_change:=found;changed:=changed or did_change;
    if not exists(select 1 from booking_api.cargo_equipment_allocations where id=(line->>'id')::uuid and job_id=requested_job_id and not is_deleted) then
      raise exception 'That cargo allocation is unavailable in this Booking.' using errcode='42501';end if;
  end loop;
  perform booking_api.assert_cargo_allocations(requested_job_id);
  if changed then update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;end if;
  return booking_api.cargo_allocation_state(caller_auth_user_id,requested_job_id)||jsonb_build_object('changed',changed);
end $$;

revoke all on function booking_api.allocation_values(booking_api.cargo_equipment_allocations),
  booking_api.assert_cargo_allocations(uuid),booking_api.lock_allocation_job(),booking_api.check_allocation_job(),
  booking_api.audit_cargo_allocation(),booking_api.cargo_allocation_state(uuid,uuid),
  booking_api.replace_cargo_allocations(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
commit;
