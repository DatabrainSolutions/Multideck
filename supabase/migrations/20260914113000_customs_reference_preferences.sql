begin;

create table booking_api.customs_reference_settings (
  company_id uuid primary key references public."cmp_Company"("Company_ID"),
  settings jsonb not null default '{"eori":"","defaultOfficeId":"","officeEoris":{},"badges":[]}',
  version integer not null default 1,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
alter table booking_api.customs_reference_settings enable row level security;
create table booking_api.customs_reference_settings_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  actor_auth_user_id uuid not null,
  previous_settings jsonb,
  settings jsonb not null,
  created_at timestamptz not null default now()
);
alter table booking_api.customs_reference_settings_audit enable row level security;
revoke all on booking_api.customs_reference_settings, booking_api.customs_reference_settings_audit from public, anon, authenticated;
grant all on booking_api.customs_reference_settings, booking_api.customs_reference_settings_audit to service_role;

create function public.customs_reference_preferences(payload jsonb default null, expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor public."cmp_Users"%rowtype;
  is_admin boolean;
  current_row booking_api.customs_reference_settings%rowtype;
  old_settings jsonb;
  offices jsonb;
  entry record;
  badge jsonb;
  eori text;
  default_office text;
begin
  select * into actor from public."cmp_Users"
    where "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active' and "Company_ID" is not null;
  if actor."User_ID" is null then raise exception 'Your workspace identity is unavailable.' using errcode='42501'; end if;
  select exists(select 1 from public."cmp_Users_Roles" ur join public."sys_UserRoles" r
    on r."sys_UserRole_ID"=ur."sys_UserRole_ID"
    where ur."User_ID"=actor."User_ID" and lower(trim(r."sys_UserRole_Name")) in ('administrator','company admin')) into is_admin;
  if not is_admin and not coalesce(booking_api.has_permission(auth.uid(),'Customs.Read'),false) then
    raise exception 'Customs access is required.' using errcode='42501';
  end if;
  if payload is not null and not is_admin then
    raise exception 'Only tenant administrators can change customs preferences.' using errcode='42501';
  end if;
  -- Serialize first saves too, and detect stale admin forms.
  if payload is not null then perform pg_advisory_xact_lock(hashtextextended(actor."Company_ID"::text,731)); end if;
  select * into current_row from booking_api.customs_reference_settings where company_id=actor."Company_ID";
  if payload is not null then
    if expected_version is distinct from coalesce(current_row.version,0) then
      raise exception 'Customs preferences changed. Reload before saving.' using errcode='40001';
    end if;
    if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>100000
      or jsonb_typeof(payload->'officeEoris') is distinct from 'object'
      or jsonb_typeof(payload->'badges') is distinct from 'array' then
      raise exception 'Invalid customs preferences.' using errcode='22023';
    end if;
    eori:=coalesce(payload->>'eori','');
    if eori<>'' and (eori !~ '^[A-Z]{2}[A-Z0-9]{1,15}$' or (left(eori,2) in ('GB','XI') and eori !~ '^(GB|XI)[0-9]{12}$')) then
      raise exception 'Enter the full registered company EORI. GB and XI EORIs require 12 digits.' using errcode='22023';
    end if;
    default_office:=coalesce(payload->>'defaultOfficeId','');
    if default_office<>'' and not exists(select 1 from public."cmp_Offices" o where o."Office_ID"::text=default_office and o."Company_ID"=actor."Company_ID" and o."Office_IsActive") then
      raise exception 'Select an active office in this company.' using errcode='42501';
    end if;
    for entry in select key,value from jsonb_each_text(payload->'officeEoris') loop
      if jsonb_typeof(payload->'officeEoris'->entry.key) is distinct from 'string' then
        raise exception 'Office EORI must be a registered identifier or an empty string.' using errcode='22023';
      end if;
      if not exists(select 1 from public."cmp_Offices" o where o."Office_ID"::text=entry.key and o."Company_ID"=actor."Company_ID" and o."Office_IsActive") then
        raise exception 'Office EORI must belong to an active office in this company.' using errcode='42501';
      end if;
      if entry.value<>'' and (entry.value !~ '^[A-Z]{2}[A-Z0-9]{1,15}$' or (left(entry.value,2) in ('GB','XI') and entry.value !~ '^(GB|XI)[0-9]{12}$')) then
        raise exception 'Enter the full registered office EORI.' using errcode='22023';
      end if;
    end loop;
    if jsonb_array_length(payload->'badges')>100 then raise exception 'Use no more than 100 badge configurations.' using errcode='22023'; end if;
    for badge in select value from jsonb_array_elements(payload->'badges') loop
      if jsonb_typeof(badge) is distinct from 'object'
        or exists(select 1 from unnest(array['id','code','provider','portCode','portName']) field where jsonb_typeof(badge->field) is distinct from 'string')
        or coalesce(badge->>'id','') !~ '^[a-zA-Z0-9-]{1,40}$'
        or coalesce(badge->>'code','') !~ '^[A-Z0-9]{1,40}$'
        or length(trim(coalesce(badge->>'provider',''))) not between 1 and 80
        or coalesce(badge->>'portCode','') !~ '^[A-Z]{2}[A-Z0-9]{3}$'
        or length(trim(coalesce(badge->>'portName',''))) not between 1 and 180
        or jsonb_typeof(badge->'active') is distinct from 'boolean' then
        raise exception 'Each badge needs a code, provider, port name, UN/LOCODE and active state.' using errcode='22023';
      end if;
    end loop;
    if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(payload->'badges')) then
      raise exception 'Badge identifiers must be unique.' using errcode='22023';
    end if;
    old_settings:=current_row.settings;
    insert into booking_api.customs_reference_settings(company_id,settings,updated_by)
      values(actor."Company_ID",jsonb_build_object('eori',eori,'defaultOfficeId',default_office,'officeEoris',payload->'officeEoris','badges',payload->'badges'),auth.uid())
      on conflict(company_id) do update set settings=excluded.settings,version=booking_api.customs_reference_settings.version+1,updated_by=auth.uid(),updated_at=now()
      returning * into current_row;
    insert into booking_api.customs_reference_settings_audit(company_id,actor_auth_user_id,previous_settings,settings)
      values(actor."Company_ID",auth.uid(),old_settings,current_row.settings);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',"Office_ID",'name',"Office_Name") order by "Office_Name"),'[]'::jsonb)
    into offices from public."cmp_Offices" where "Company_ID"=actor."Company_ID" and "Office_IsActive";
  return jsonb_build_object('settings',coalesce(current_row.settings,'{"eori":"","defaultOfficeId":"","officeEoris":{},"badges":[]}'::jsonb),'version',coalesce(current_row.version,0),'offices',offices,'canManage',is_admin);
end $$;
revoke all on function public.customs_reference_preferences(jsonb,integer) from public,anon;
grant execute on function public.customs_reference_preferences(jsonb,integer) to authenticated;
commit;
