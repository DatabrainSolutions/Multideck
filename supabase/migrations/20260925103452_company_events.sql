-- Company Events: company-wide social and team events with optional RSVP forms.
--
-- Every read and write goes through the authenticated RPCs below. Tables keep
-- RLS enabled with no browser grants. The company-wide switch is enforced in
-- every RPC, in the private image policies and in watch evaluation, so turning
-- Events off hides the data server-side as well as in navigation.
--
-- Roles: administrators and the new Event Organiser role hold Events.Manage
-- (create, edit, publish, cancel, read responses). Every active internal
-- colleague can browse published events and RSVP. Customer portal identities
-- are not cmp_Users and never reach these functions.

begin;

create schema if not exists private;

insert into public."sys_Permissions" ("sys_Permission_Value","sys_Permission_Group","sys_Permission_Name","sys_Permission_Description")
values ('Events.Manage','Events','Manage company events','Create, edit, publish and cancel company events, and read RSVP responses.')
on conflict ("sys_Permission_Value") do nothing;

insert into public."sys_UserRoles" ("sys_UserRole_Name")
select 'Event Organiser'
where not exists (select 1 from public."sys_UserRoles" where lower("sys_UserRole_Name") = 'event organiser');

insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID","sys_Permission_ID")
select r."sys_UserRole_ID", p."sys_Permission_ID"
from public."sys_UserRoles" r cross join public."sys_Permissions" p
where lower(r."sys_UserRole_Name") in ('administrator','company admin','event organiser')
  and p."sys_Permission_Value" = 'Events.Manage'
on conflict do nothing;

create table public.company_event_settings (
  company_id uuid primary key references public."cmp_Company"("Company_ID") on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references public."cmp_Users"("User_ID"),
  updated_at timestamptz not null default now()
);

create table public.company_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Europe/London',
  location text not null check (length(btrim(location)) between 1 and 240),
  details text not null default '' check (length(details) <= 8000),
  image_path text check (image_path is null or length(image_path) <= 200),
  status text not null default 'draft' check (status in ('draft','published','cancelled','archived')),
  cancellation_note text check (cancellation_note is null or length(cancellation_note) <= 400),
  form_schema jsonb not null default '[]'::jsonb check (jsonb_typeof(form_schema) = 'array' and pg_column_size(form_schema) < 60000),
  form_version integer not null default 1,
  edit_version integer not null default 1,
  created_by uuid not null references public."cmp_Users"("User_ID"),
  updated_by uuid not null references public."cmp_Users"("User_ID"),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  cancelled_at timestamptz,
  check (ends_at is null or ends_at > starts_at)
);
create index company_events_company_start on public.company_events (company_id, starts_at) where status <> 'archived';

create table public.company_event_rsvps (
  event_id uuid not null references public.company_events(id) on delete cascade,
  user_id uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  status text not null check (status in ('going','not_going')),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 40000),
  -- The form exactly as the colleague answered it. Later form edits never
  -- rewrite or reinterpret a saved response.
  form_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(form_snapshot) = 'array'),
  form_version integer not null default 1,
  last_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index company_event_rsvps_user on public.company_event_rsvps (user_id);

create table public.company_event_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_id uuid,
  actor_id uuid not null,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_event_audit_event on public.company_event_audit (event_id, created_at);

do $$ declare t text; begin
  foreach t in array array['company_event_settings','company_events','company_event_rsvps','company_event_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-event-images','company-event-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create function private.company_events_enabled(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.enabled from public.company_event_settings s where s.company_id = p_company_id), false);
$$;

create function private.company_events_can_manage(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public."cmp_Users" u
    join public."cmp_Users_Roles" ur on ur."User_ID" = u."User_ID"
    join public."sys_UserRole_Permissions" rp on rp."sys_UserRole_ID" = ur."sys_UserRole_ID"
    join public."sys_Permissions" p on p."sys_Permission_ID" = rp."sys_Permission_ID"
    where u."User_ID" = p_user_id
      and u."Auth_User_ID" is not null
      and coalesce(u."User_AccessStatus",'active') = 'active'
      and p."sys_Permission_Value" = 'Events.Manage'
  );
$$;

create function private.company_events_is_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public."cmp_Users" u
    join public."cmp_Users_Roles" ur on ur."User_ID" = u."User_ID"
    join public."sys_UserRoles" r on r."sys_UserRole_ID" = ur."sys_UserRole_ID"
    where u."User_ID" = p_user_id
      and u."Auth_User_ID" is not null
      and coalesce(u."User_AccessStatus",'active') = 'active'
      and lower(r."sys_UserRole_Name") in ('administrator','company admin')
  );
$$;

-- An active colleague of the event's company; drafts only for organisers.
create function private.company_event_visible(p_event public.company_events, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_event.status <> 'archived'
    and private.company_events_enabled(p_event.company_id)
    and exists (
      select 1 from public."cmp_Users" u
      where u."User_ID" = p_user_id and u."Company_ID" = p_event.company_id
        and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active') = 'active'
    )
    and (p_event.status in ('published','cancelled') or private.company_events_can_manage(p_user_id));
$$;

-- Resolves the signed-in colleague and requires Events to be on.
create function private.company_events_actor(p_require_enabled boolean default true)
returns table(user_id uuid, company_id uuid, can_manage boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from public._multideck_dexter_context();
  if p_require_enabled and not private.company_events_enabled(v.company_id) then
    raise exception 'Events are turned off for this workspace.' using errcode = '42501';
  end if;
  return query select v.user_id, v.company_id, private.company_events_can_manage(v.user_id);
end $$;

-- ---------------------------------------------------------------------------
-- RSVP form schema and answer validation
-- ---------------------------------------------------------------------------

create function private.company_event_clean_form(p_form jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_field jsonb; v_option jsonb; v_options jsonb;
  v_id text; v_type text; v_label text; v_option_id text; v_option_label text;
  v_ids text[] := '{}'; v_option_ids text[]; v_option_labels text[];
begin
  if p_form is null or p_form = 'null'::jsonb then return v_result; end if;
  if jsonb_typeof(p_form) <> 'array' then raise exception 'The RSVP form is not valid.' using errcode = '22023'; end if;
  if jsonb_array_length(p_form) > 20 then raise exception 'Add no more than 20 questions.' using errcode = '22023'; end if;
  for v_field in select value from jsonb_array_elements(p_form) loop
    if jsonb_typeof(v_field) <> 'object' then raise exception 'The RSVP form is not valid.' using errcode = '22023'; end if;
    v_id := coalesce(v_field->>'id','');
    v_type := coalesce(v_field->>'type','');
    v_label := btrim(coalesce(v_field->>'label',''));
    if v_id !~ '^[A-Za-z0-9_-]{1,40}$' or v_id = any(v_ids) then raise exception 'Each question needs a unique reference.' using errcode = '22023'; end if;
    if v_type not in ('short_text','long_text','number','date','yes_no','single_choice','multi_choice') then
      raise exception 'That question type is not supported.' using errcode = '22023';
    end if;
    if length(v_label) = 0 then raise exception 'Every question needs a label.' using errcode = '22023'; end if;
    if length(v_label) > 160 then raise exception 'Keep question labels under 160 characters.' using errcode = '22023'; end if;
    if jsonb_typeof(coalesce(v_field->'required','false'::jsonb)) <> 'boolean' then raise exception 'The RSVP form is not valid.' using errcode = '22023'; end if;
    v_ids := v_ids || v_id;
    v_options := '[]'::jsonb;
    if v_type in ('single_choice','multi_choice') then
      if jsonb_typeof(coalesce(v_field->'options','null'::jsonb)) <> 'array'
        or jsonb_array_length(v_field->'options') < 2 or jsonb_array_length(v_field->'options') > 20 then
        raise exception '"%" needs between 2 and 20 options.', v_label using errcode = '22023';
      end if;
      v_option_ids := '{}'; v_option_labels := '{}';
      for v_option in select value from jsonb_array_elements(v_field->'options') loop
        v_option_id := coalesce(v_option->>'id','');
        v_option_label := btrim(coalesce(v_option->>'label',''));
        if v_option_id !~ '^[A-Za-z0-9_-]{1,40}$' or v_option_id = any(v_option_ids) then raise exception 'Each option needs a unique reference.' using errcode = '22023'; end if;
        if length(v_option_label) = 0 or length(v_option_label) > 80 then raise exception 'Options in "%" need a label under 80 characters.', v_label using errcode = '22023'; end if;
        if lower(v_option_label) = any(v_option_labels) then raise exception 'Options in "%" must be different.', v_label using errcode = '22023'; end if;
        v_option_ids := v_option_ids || v_option_id;
        v_option_labels := v_option_labels || lower(v_option_label);
        v_options := v_options || jsonb_build_array(jsonb_build_object('id',v_option_id,'label',v_option_label));
      end loop;
    end if;
    v_result := v_result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',v_id,'type',v_type,'label',v_label,
      'required',coalesce((v_field->>'required')::boolean,false),
      'options',case when v_type in ('single_choice','multi_choice') then v_options end
    )));
  end loop;
  return v_result;
end $$;

create function private.company_event_clean_answers(p_form jsonb, p_answers jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_field jsonb; v_value jsonb; v_id text; v_type text; v_label text; v_text text; v_empty boolean; v_item jsonb;
  v_option_ids text[];
begin
  if p_answers is null or p_answers = 'null'::jsonb then p_answers := '{}'::jsonb; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Those answers are not valid.' using errcode = '22023'; end if;
  for v_field in select value from jsonb_array_elements(coalesce(p_form,'[]'::jsonb)) loop
    v_id := v_field->>'id'; v_type := v_field->>'type'; v_label := v_field->>'label';
    v_value := p_answers->v_id;
    v_empty := v_value is null or v_value = 'null'::jsonb
      or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
      or (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) = 0);
    if v_empty then
      if coalesce((v_field->>'required')::boolean,false) then
        raise exception 'Answer "%".', v_label using errcode = '22023';
      end if;
      continue;
    end if;
    select coalesce(array_agg(o->>'id'),'{}') into v_option_ids from jsonb_array_elements(coalesce(v_field->'options','[]'::jsonb)) o;
    if v_type in ('short_text','long_text') then
      if jsonb_typeof(v_value) <> 'string' then raise exception '"%" needs a text answer.', v_label using errcode = '22023'; end if;
      v_text := btrim(v_value #>> '{}');
      if length(v_text) > (case when v_type = 'short_text' then 240 else 4000 end) then
        raise exception 'Shorten your answer to "%".', v_label using errcode = '22023';
      end if;
      v_result := v_result || jsonb_build_object(v_id, v_text);
    elsif v_type = 'number' then
      begin
        v_text := v_value #>> '{}';
        if v_text !~ '^-?[0-9]{1,12}(\.[0-9]{1,4})?$' then raise exception using errcode = '22P02'; end if;
        v_result := v_result || jsonb_build_object(v_id, v_text::numeric);
      exception when others then
        raise exception '"%" needs a number.', v_label using errcode = '22023';
      end;
    elsif v_type = 'date' then
      begin
        v_text := v_value #>> '{}';
        if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode = '22007'; end if;
        v_result := v_result || jsonb_build_object(v_id, v_text::date::text);
      exception when others then
        raise exception '"%" needs a valid date.', v_label using errcode = '22023';
      end;
    elsif v_type = 'yes_no' then
      if jsonb_typeof(v_value) <> 'boolean' then raise exception 'Choose yes or no for "%".', v_label using errcode = '22023'; end if;
      v_result := v_result || jsonb_build_object(v_id, v_value);
    elsif v_type = 'single_choice' then
      if jsonb_typeof(v_value) <> 'string' or not ((v_value #>> '{}') = any(v_option_ids)) then
        raise exception 'Choose one of the options for "%".', v_label using errcode = '22023';
      end if;
      v_result := v_result || jsonb_build_object(v_id, v_value);
    elsif v_type = 'multi_choice' then
      if jsonb_typeof(v_value) <> 'array' then raise exception 'Choose options for "%".', v_label using errcode = '22023'; end if;
      for v_item in select value from jsonb_array_elements(v_value) loop
        if jsonb_typeof(v_item) <> 'string' or not ((v_item #>> '{}') = any(v_option_ids)) then
          raise exception 'Choose from the options for "%".', v_label using errcode = '22023';
        end if;
      end loop;
      v_result := v_result || jsonb_build_object(v_id, (select jsonb_agg(distinct x) from jsonb_array_elements(v_value) x));
    end if;
  end loop;
  return v_result;
end $$;

-- True when a saved response is missing a required answer in the current form.
create function private.company_event_rsvp_needs_update(p_form jsonb, p_rsvp public.company_event_rsvps)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_rsvp.status <> 'going' or jsonb_array_length(coalesce(p_form,'[]'::jsonb)) = 0 then return false; end if;
  perform private.company_event_clean_answers(p_form, p_rsvp.answers);
  return false;
exception when sqlstate '22023' then
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Read model
-- ---------------------------------------------------------------------------

create function private.company_event_json(p_event public.company_events, p_viewer uuid, p_detail boolean)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_manager boolean := private.company_events_can_manage(p_viewer);
  v_mine public.company_event_rsvps;
  v_going integer;
  v_result jsonb;
begin
  select * into v_mine from public.company_event_rsvps r where r.event_id = p_event.id and r.user_id = p_viewer;
  select count(*) into v_going from public.company_event_rsvps r
    join public."cmp_Users" u on u."User_ID" = r.user_id and coalesce(u."User_AccessStatus",'active') = 'active'
    where r.event_id = p_event.id and r.status = 'going';
  v_result := jsonb_build_object(
    'id',p_event.id,'title',p_event.title,'startsAt',p_event.starts_at,'endsAt',p_event.ends_at,
    'timezone',p_event.timezone,'location',p_event.location,'details',p_event.details,
    'imagePath',p_event.image_path,'status',p_event.status,'cancellationNote',p_event.cancellation_note,
    'form',p_event.form_schema,'formVersion',p_event.form_version,'editVersion',p_event.edit_version,
    'publishedAt',p_event.published_at,'cancelledAt',p_event.cancelled_at,'updatedAt',p_event.updated_at,
    'goingCount',v_going,'canManage',v_manager,
    'myRsvp',case when v_mine.event_id is null then null else jsonb_build_object(
      'status',v_mine.status,'answers',v_mine.answers,'formVersion',v_mine.form_version,
      'needsUpdate',private.company_event_rsvp_needs_update(p_event.form_schema, v_mine),
      'updatedAt',v_mine.updated_at) end
  );
  if p_detail then
    v_result := v_result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('userId',u."User_ID",
        'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email")) order by r.updated_at)
      from public.company_event_rsvps r join public."cmp_Users" u on u."User_ID" = r.user_id
      where r.event_id = p_event.id and r.status = 'going' and coalesce(u."User_AccessStatus",'active') = 'active'
    ),'[]'::jsonb));
    if v_manager then
      v_result := v_result || jsonb_build_object('responses', coalesce((
        select jsonb_agg(jsonb_build_object('userId',u."User_ID",
          'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email"),
          'status',r.status,'answers',r.answers,'form',r.form_snapshot,'formVersion',r.form_version,
          'needsUpdate',private.company_event_rsvp_needs_update(p_event.form_schema, r),'updatedAt',r.updated_at) order by r.updated_at desc)
        from public.company_event_rsvps r join public."cmp_Users" u on u."User_ID" = r.user_id
        where r.event_id = p_event.id
      ),'[]'::jsonb));
    end if;
  end if;
  return v_result;
end $$;

create function public.company_events_settings()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor(false);
  return jsonb_build_object('enabled',private.company_events_enabled(v.company_id),
    'canManage',v.can_manage,'canConfigure',private.company_events_is_admin(v.user_id));
end $$;

create function public.company_events_set_enabled(p_enabled boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor(false);
  if not private.company_events_is_admin(v.user_id) then
    raise exception 'Only workspace administrators can change this setting.' using errcode = '42501';
  end if;
  insert into public.company_event_settings (company_id, enabled, updated_by, updated_at)
  values (v.company_id, coalesce(p_enabled,false), v.user_id, now())
  on conflict (company_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now();
  insert into public.company_event_audit (company_id, actor_id, kind, details)
  values (v.company_id, v.user_id, case when p_enabled then 'feature_enabled' else 'feature_disabled' end, '{}'::jsonb);
  return public.company_events_settings();
end $$;

create function public.company_events_list()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor();
  return coalesce((
    select jsonb_agg(private.company_event_json(e, v.user_id, false) order by e.starts_at)
    from public.company_events e
    where e.company_id = v.company_id and private.company_event_visible(e, v.user_id)
  ),'[]'::jsonb);
end $$;

create function public.company_event_get(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v record; e public.company_events;
begin
  select * into v from private.company_events_actor();
  select * into e from public.company_events where id = p_event_id and company_id = v.company_id;
  if not found or not private.company_event_visible(e, v.user_id) then
    raise exception 'This event is not available.' using errcode = '42501';
  end if;
  return private.company_event_json(e, v.user_id, true);
end $$;

-- ---------------------------------------------------------------------------
-- Writes (shared by the browser RPCs and Dexter actions)
-- ---------------------------------------------------------------------------

create function private.company_event_save_for_actor(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  old public.company_events; saved public.company_events;
  v_title text := btrim(coalesce(p_payload->>'title',''));
  v_location text := btrim(coalesce(p_payload->>'location',''));
  v_details text := btrim(coalesce(p_payload->>'details',''));
  v_timezone text := coalesce(nullif(btrim(p_payload->>'timezone'),''),'Europe/London');
  v_image text := nullif(btrim(coalesce(p_payload->>'imagePath','')),'');
  v_form jsonb; v_starts timestamptz; v_ends timestamptz; v_form_version integer := 1; v_answered text[];
begin
  if not private.company_events_enabled(p_company_id) then raise exception 'Events are turned off for this workspace.' using errcode = '42501'; end if;
  if not private.company_events_can_manage(p_user_id) or not exists (select 1 from public."cmp_Users" where "User_ID" = p_user_id and "Company_ID" = p_company_id) then
    raise exception 'You need the Event organiser role to change events.' using errcode = '42501';
  end if;
  if v_title = '' then raise exception 'Add a title.' using errcode = '22023'; end if;
  if length(v_title) > 160 then raise exception 'Keep the title under 160 characters.' using errcode = '22023'; end if;
  if v_location = '' then raise exception 'Add a location.' using errcode = '22023'; end if;
  if length(v_location) > 240 then raise exception 'Keep the location under 240 characters.' using errcode = '22023'; end if;
  if length(v_details) > 8000 then raise exception 'Keep the details under 8,000 characters.' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then raise exception 'Choose a valid timezone.' using errcode = '22023'; end if;
  begin
    v_starts := (p_payload->>'startsAt')::timestamptz;
    v_ends := nullif(p_payload->>'endsAt','')::timestamptz;
  exception when others then
    raise exception 'Choose a valid date and time.' using errcode = '22023';
  end;
  if v_starts is null then raise exception 'Choose when the event starts.' using errcode = '22023'; end if;
  if v_ends is not null and v_ends <= v_starts then raise exception 'The end must be after the start.' using errcode = '22023'; end if;
  if v_image is not null and (
    v_image !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'company-event-images' and o.name = v_image)
  ) then
    raise exception 'Upload the event image again.' using errcode = '22023';
  end if;
  v_form := private.company_event_clean_form(p_payload->'form');

  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_event_id, gen_random_uuid())::text, 2509));
  if p_event_id is not null then
    select * into old from public.company_events where id = p_event_id and company_id = p_company_id for update;
  end if;
  if old.id is not null then
    if old.status in ('cancelled','archived') then raise exception 'Cancelled events cannot be edited.' using errcode = '55000'; end if;
    if old.edit_version <> coalesce(p_expected_version, -1) then
      raise exception 'This event changed while you were editing. Reload to see the latest version.' using errcode = '40001';
    end if;
    v_form_version := old.form_version;
    if v_form is distinct from old.form_schema then
      -- Saved answers keep their own snapshot. A question someone has answered
      -- cannot change type, because that would silently reinterpret the answer.
      select coalesce(array_agg(distinct key), '{}') into v_answered
      from public.company_event_rsvps r, jsonb_object_keys(r.answers) key where r.event_id = old.id;
      if exists (
        select 1 from jsonb_array_elements(old.form_schema) o join jsonb_array_elements(v_form) n on n->>'id' = o->>'id'
        where o->>'id' = any(v_answered) and o->>'type' <> n->>'type'
      ) then
        raise exception 'A question that has answers cannot change type. Add a new question instead.' using errcode = '22023';
      end if;
      v_form_version := old.form_version + 1;
    end if;
    update public.company_events set
      title = v_title, starts_at = v_starts, ends_at = v_ends, timezone = v_timezone, location = v_location,
      details = v_details, image_path = v_image, form_schema = v_form, form_version = v_form_version,
      edit_version = old.edit_version + 1, updated_by = p_user_id, updated_at = clock_timestamp()
    where id = old.id returning * into saved;
  else
    if coalesce(p_expected_version, 0) <> 0 then raise exception 'This event is not available.' using errcode = '42501'; end if;
    insert into public.company_events (id, company_id, title, starts_at, ends_at, timezone, location, details, image_path, form_schema, created_by, updated_by)
    values (coalesce(p_event_id, gen_random_uuid()), p_company_id, v_title, v_starts, v_ends, v_timezone, v_location, v_details, v_image, v_form, p_user_id, p_user_id)
    returning * into saved;
  end if;
  insert into public.company_event_audit (company_id, event_id, actor_id, kind, details)
  values (p_company_id, saved.id, p_user_id, case when old.id is null then 'created' else 'updated' end,
    jsonb_build_object('editVersion', saved.edit_version, 'formVersion', saved.form_version, 'title', saved.title));
  return private.company_event_json(saved, p_user_id, true);
end $$;

create function private.company_event_status_for_actor(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_status text, p_expected_version integer, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare old public.company_events; saved public.company_events;
begin
  if not private.company_events_enabled(p_company_id) then raise exception 'Events are turned off for this workspace.' using errcode = '42501'; end if;
  if not private.company_events_can_manage(p_user_id) then raise exception 'You need the Event organiser role to change events.' using errcode = '42501'; end if;
  select * into old from public.company_events where id = p_event_id and company_id = p_company_id for update;
  if not found or old.status = 'archived' then raise exception 'This event is not available.' using errcode = '42501'; end if;
  if p_expected_version is not null and old.edit_version <> p_expected_version then
    raise exception 'This event changed while you were editing. Reload to see the latest version.' using errcode = '40001';
  end if;
  if p_status = 'published' and old.status <> 'draft' then raise exception 'Only drafts can be published.' using errcode = '55000'; end if;
  if p_status = 'cancelled' and old.status <> 'published' then raise exception 'Only published events can be cancelled.' using errcode = '55000'; end if;
  if p_status = 'archived' and old.status <> 'draft' then raise exception 'Only drafts can be deleted.' using errcode = '55000'; end if;
  if p_status not in ('published','cancelled','archived') then raise exception 'That status is not supported.' using errcode = '22023'; end if;
  if length(coalesce(p_note,'')) > 400 then raise exception 'Keep the note under 400 characters.' using errcode = '22023'; end if;
  update public.company_events set status = p_status,
    published_at = case when p_status = 'published' then clock_timestamp() else published_at end,
    cancelled_at = case when p_status = 'cancelled' then clock_timestamp() else cancelled_at end,
    cancellation_note = case when p_status = 'cancelled' then nullif(btrim(coalesce(p_note,'')),'') else cancellation_note end,
    edit_version = old.edit_version + 1, updated_by = p_user_id, updated_at = clock_timestamp()
  where id = old.id returning * into saved;
  insert into public.company_event_audit (company_id, event_id, actor_id, kind, details)
  values (p_company_id, saved.id, p_user_id, p_status, jsonb_build_object('from', old.status));
  return private.company_event_json(saved, p_user_id, true);
end $$;

create function private.company_event_rsvp_for_actor(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_status text, p_answers jsonb, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare e public.company_events; mine public.company_event_rsvps; v_answers jsonb;
begin
  select * into e from public.company_events where id = p_event_id and company_id = p_company_id;
  if not found or not private.company_event_visible(e, p_user_id) then raise exception 'This event is not available.' using errcode = '42501'; end if;
  if p_status not in ('going','not_going') then raise exception 'Choose going or not going.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || p_user_id::text, 2510));
  select * into mine from public.company_event_rsvps where event_id = e.id and user_id = p_user_id for update;
  -- A retried request returns the saved state without writing twice.
  if mine.event_id is not null and p_request_id is not null and mine.last_request_id = p_request_id then
    return private.company_event_json(e, p_user_id, true);
  end if;
  if e.status = 'cancelled' then raise exception 'This event has been cancelled.' using errcode = '55000'; end if;
  if e.status <> 'published' then raise exception 'This event is not open for RSVPs yet.' using errcode = '55000'; end if;
  if coalesce(e.ends_at, e.starts_at) < now() then raise exception 'This event has already taken place.' using errcode = '55000'; end if;
  if p_status = 'going' then
    v_answers := private.company_event_clean_answers(e.form_schema, p_answers);
  else
    v_answers := coalesce(mine.answers, '{}'::jsonb);
  end if;
  insert into public.company_event_rsvps (event_id, user_id, company_id, status, answers, form_snapshot, form_version, last_request_id)
  values (e.id, p_user_id, p_company_id, p_status, v_answers, e.form_schema, e.form_version, p_request_id)
  on conflict (event_id, user_id) do update set status = excluded.status,
    answers = excluded.answers,
    form_snapshot = case when excluded.status = 'going' then excluded.form_snapshot else company_event_rsvps.form_snapshot end,
    form_version = case when excluded.status = 'going' then excluded.form_version else company_event_rsvps.form_version end,
    last_request_id = excluded.last_request_id, updated_at = clock_timestamp();
  insert into public.company_event_audit (company_id, event_id, actor_id, kind, details)
  values (p_company_id, e.id, p_user_id, 'rsvp_' || p_status, jsonb_build_object('formVersion', e.form_version));
  return private.company_event_json(e, p_user_id, true);
end $$;

create function public.company_event_save(p_event_id uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor();
  return private.company_event_save_for_actor(v.company_id, v.user_id, p_event_id, p_expected_version, p_payload);
end $$;

create function public.company_event_set_status(p_event_id uuid, p_status text, p_expected_version integer, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor();
  return private.company_event_status_for_actor(v.company_id, v.user_id, p_event_id, p_status, p_expected_version, p_note);
end $$;

create function public.company_event_rsvp(p_event_id uuid, p_status text, p_answers jsonb, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor();
  return private.company_event_rsvp_for_actor(v.company_id, v.user_id, p_event_id, p_status, p_answers, p_request_id);
end $$;

-- ---------------------------------------------------------------------------
-- Private event images
-- ---------------------------------------------------------------------------

create function private.can_read_company_event_image(p_object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public."cmp_Users" viewer
    join public.company_events e on e.company_id = viewer."Company_ID" and e.image_path = p_object_name
    where viewer."Auth_User_ID" = (select auth.uid())
      and private.company_event_visible(e, viewer."User_ID")
  ) or exists (
    -- Organisers can preview an image they uploaded before saving the event.
    select 1 from public."cmp_Users" viewer
    where viewer."Auth_User_ID" = (select auth.uid())
      and (storage.foldername(p_object_name))[1] = viewer."Auth_User_ID"::text
      and private.company_events_enabled(viewer."Company_ID")
      and private.company_events_can_manage(viewer."User_ID")
  );
$$;

create function private.can_upload_company_event_image(p_object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public."cmp_Users" viewer
    where viewer."Auth_User_ID" = (select auth.uid())
      and private.company_events_enabled(viewer."Company_ID")
      and private.company_events_can_manage(viewer."User_ID")
      and p_object_name ~ ('^' || viewer."Auth_User_ID"::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
  );
$$;

drop policy if exists "Colleagues can read visible event images" on storage.objects;
create policy "Colleagues can read visible event images" on storage.objects for select to authenticated
using (bucket_id = 'company-event-images' and (select private.can_read_company_event_image(name)));

drop policy if exists "Organisers can upload event images" on storage.objects;
create policy "Organisers can upload event images" on storage.objects for insert to authenticated
with check (bucket_id = 'company-event-images' and (select private.can_upload_company_event_image(name)));

-- ---------------------------------------------------------------------------
-- Dexter chat: read domain and allowlisted, approval-gated actions
-- ---------------------------------------------------------------------------

create function public.multideck_dexter_domain_company_events(p_company_id uuid, p_search text, p_take integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v record; v_search text := nullif(btrim(p_search),'');
begin
  select * into v from public._multideck_dexter_context();
  if v.company_id <> p_company_id then raise exception 'That event is outside this workspace.' using errcode = '42501'; end if;
  if not private.company_events_enabled(v.company_id) then
    return jsonb_build_array(jsonb_build_object('unsupported', true, 'message', 'Events are turned off for this workspace.'));
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'recordId',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'timezone',e.timezone,
      'location',e.location,'details',left(e.details,1200),'status',e.status,
      'hasRsvpForm',jsonb_array_length(e.form_schema) > 0,
      'requiredQuestions',(select count(*) from jsonb_array_elements(e.form_schema) f where (f->>'required')::boolean),
      'goingCount',(select count(*) from public.company_event_rsvps r where r.event_id = e.id and r.status = 'going'),
      'myRsvp',(select r.status from public.company_event_rsvps r where r.event_id = e.id and r.user_id = v.user_id),
      'sourceTable','company_events','sourceUrl','/events/' || e.id,'targetLabel',e.title
    ) order by e.starts_at)
    from (
      select * from public.company_events e
      where e.company_id = p_company_id and private.company_event_visible(e, v.user_id)
        and (v_search is null or e.title ilike '%' || left(v_search,100) || '%' or e.location ilike '%' || left(v_search,100) || '%' or e.id::text = v_search)
      order by (e.starts_at < now()), e.starts_at
      limit greatest(1, least(coalesce(p_take,10),25))
    ) e
  ),'[]'::jsonb);
end $$;

create function public.multideck_dexter_action_rsvp_company_event(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare e public.company_events;
begin
  select * into e from public.company_events where id = (p_arguments->>'target_id')::uuid and company_id = p_company_id;
  if found and p_arguments->>'status' = 'going' and exists (select 1 from jsonb_array_elements(e.form_schema) f where (f->>'required')::boolean) then
    raise exception 'This event has an RSVP form with required questions. Open it in Events to answer.' using errcode = '0A000';
  end if;
  return private.company_event_rsvp_for_actor(p_company_id, p_user_id, (p_arguments->>'target_id')::uuid, p_arguments->>'status', '{}'::jsonb, null);
end $$;

create function public.multideck_dexter_action_create_company_event_draft(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  -- Drafts only: images, RSVP forms and publishing stay in the Events screen.
  return private.company_event_save_for_actor(p_company_id, p_user_id, null, 0, jsonb_build_object(
    'title',p_arguments->>'title','startsAt',p_arguments->>'starts_at','endsAt',p_arguments->>'ends_at',
    'timezone',p_arguments->>'timezone','location',p_arguments->>'location','details',p_arguments->>'details','form','[]'::jsonb));
end $$;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt","AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy"
) values (
  'company_events','Company events',
  'Published company events (drafts for Event organisers): title, date and time, location, details, cancellation, going count and the signed-in colleague''s own RSVP. Individual RSVP form answers, image uploads, form building and publishing are unsupported in chat; open Events.',
  'multideck_dexter_domain_company_events',40,true,now(),'[]'::jsonb,'["company_events"]'::jsonb,'actor'
) on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name","AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction","AIDexterDomain_IsActive" = true,
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON" = excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy" = excluded."AIDexterDomain_ScopeStrategy","AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function",
  "AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"
) values
(
  'rsvp_company_event','company_events','RSVP to event',
  'Set the signed-in colleague''s own RSVP to one published event. Events with required RSVP questions must be answered in Events.',
  'multideck_dexter_action_rsvp_company_event',
  '{"type":"object","properties":{"target_id":{"type":"string"},"status":{"type":"string","enum":["going","not_going"]},"reason":{"type":"string"}},"required":["target_id","status","reason"],"additionalProperties":false}'::jsonb,
  40,true,now(),'[]'::jsonb,'company_event_rsvp','actor',false
),
(
  'create_company_event_draft','company_events','Draft company event',
  'Create an unpublished event draft for an Event organiser. Images, RSVP forms and publishing are completed in Events.',
  'multideck_dexter_action_create_company_event_draft',
  '{"type":"object","properties":{"title":{"type":"string"},"starts_at":{"type":"string","description":"ISO 8601 with offset."},"ends_at":{"type":["string","null"]},"timezone":{"type":["string","null"]},"location":{"type":"string"},"details":{"type":["string","null"]},"reason":{"type":"string"}},"required":["title","starts_at","ends_at","timezone","location","details","reason"],"additionalProperties":false}'::jsonb,
  41,true,now(),'["Events.Manage"]'::jsonb,'company_event_create','actor',false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode","AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description","AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON","AIDexterAction_IsActive" = true,
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect","AIDexterAction_UpdatedAt" = now();

-- ---------------------------------------------------------------------------
-- Watching for you: deterministic row events for one exact visible event
-- ---------------------------------------------------------------------------

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder","AIDexterWatchCapability_IsActive","AIDexterWatchCapability_UpdatedAt",
  "AIDexterWatchCapability_RequiredPermissionsJSON","AIDexterWatchCapability_ScopeStrategy"
) values (
  'company_events','Company events',
  'Saved changes to one event the watcher can see: time, location, title, status (published or cancelled) and going count. Reminders based on time passing are unsupported.',
  '["title","startsAt","location","status","goingCount"]'::jsonb,40,true,now(),'[]'::jsonb,'actor'
) on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy" = excluded."AIDexterWatchCapability_ScopeStrategy","AIDexterWatchCapability_UpdatedAt" = now();

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_company_events;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare ctx record; e public.company_events;
begin
  if lower(btrim(p_capability)) = 'company_events' then
    select * into ctx from public._multideck_dexter_context();
    select * into e from public.company_events where id = p_target_id and company_id = ctx.company_id;
    if p_target_id is null or not found or not private.company_event_visible(e, ctx.user_id) then
      raise exception 'Choose an event you can see before creating this watch.' using errcode = '42501';
    end if;
    if p_action is not null then raise exception 'Event watches notify only.' using errcode = '22023'; end if;
  end if;
  return public._multideck_dexter_create_watch_before_company_events(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
revoke all on function public._multideck_dexter_create_watch_before_company_events(text,text,text,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated, service_role;

create function private.company_event_watch_state(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title',e.title,'startsAt',e.starts_at,'location',e.location,'status',e.status,
    'goingCount',(select count(*) from public.company_event_rsvps r where r.event_id = e.id and r.status = 'going'))
  from public.company_events e where e.id = p_event_id;
$$;

create function private.company_event_watch_signal(p_company_id uuid, p_event_id uuid, p_old jsonb)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_new jsonb;
begin
  if not exists (
    select 1 from public."AI_DexterWatches" w
    where w."AIDexterWatch_CompanyID" = p_company_id and w."AIDexterWatch_CapabilityCode" = 'company_events'
      and w."AIDexterWatch_StatusCode" = 'active' and w."AIDexterWatch_TargetID" = p_event_id
  ) then return; end if;
  v_new := private.company_event_watch_state(p_event_id);
  if v_new is null or p_old is not distinct from v_new then return; end if;
  insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  values (p_company_id,'company_events','company_events',p_event_id,coalesce(p_old,'{}'::jsonb),v_new);
end $$;

create function private.company_events_watch_trigger()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    perform private.company_event_watch_signal(new.company_id, new.id, jsonb_build_object('title',old.title,'startsAt',old.starts_at,
      'location',old.location,'status',old.status,
      'goingCount',(select count(*) from public.company_event_rsvps r where r.event_id = old.id and r.status = 'going')));
  end if;
  return new;
end $$;
create trigger company_events_dexter_watch after update on public.company_events
for each row execute function private.company_events_watch_trigger();

create function private.company_event_rsvps_watch_trigger()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_row public.company_event_rsvps := coalesce(new, old); v_old jsonb; v_delta integer;
begin
  -- Reconstruct the pre-change count from this row's own transition.
  v_delta := (case when tg_op <> 'DELETE' and new.status = 'going' then 1 else 0 end)
           - (case when tg_op <> 'INSERT' and old.status = 'going' then 1 else 0 end);
  if v_delta = 0 then return null; end if;
  v_old := private.company_event_watch_state(v_row.event_id);
  if v_old is null then return null; end if;
  v_old := jsonb_set(v_old, '{goingCount}', to_jsonb((v_old->>'goingCount')::integer - v_delta));
  perform private.company_event_watch_signal(v_row.company_id, v_row.event_id, v_old);
  return null;
end $$;
create trigger company_event_rsvps_dexter_watch after insert or update or delete on public.company_event_rsvps
for each row execute function private.company_event_rsvps_watch_trigger();

-- Evaluation re-checks the watcher's current access, so revoking a colleague,
-- turning Events off or unpublishing a draft stops notifications immediately.
do $patch$
declare definition text; marker text;
begin
  definition := pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker := E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review the Dexter watch evaluator before enabling company event watches';
  end if;
  definition := replace(definition, marker, marker || $guard$
      and (watch_row."AIDexterWatch_CapabilityCode" <> 'company_events' or exists (
        select 1 from public.company_events watched_event
        where watched_event.id = watch_row."AIDexterWatch_TargetID"
          and watched_event.id = new."AIDexterWatchSignal_SourceID"
          and watched_event.company_id = watch_row."AIDexterWatch_CompanyID"
          and private.company_event_visible(watched_event, watch_row."AIDexterWatch_OwnerUserID")
      ))$guard$);
  marker := 'if v_matches and (';
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review the Dexter watch change evaluation before enabling company event watches';
  end if;
  definition := replace(definition, marker, marker || $repeat$
        (watch."AIDexterWatch_CapabilityCode" = 'company_events'
          and watch."AIDexterWatch_RuleJSON"->>'operator' = 'changed') or $repeat$);
  execute definition;
end $patch$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$ declare f text; begin
  foreach f in array array[
    'private.company_events_enabled(uuid)','private.company_events_can_manage(uuid)','private.company_events_is_admin(uuid)',
    'private.company_event_visible(public.company_events,uuid)','private.company_events_actor(boolean)',
    'private.company_event_clean_form(jsonb)','private.company_event_clean_answers(jsonb,jsonb)',
    'private.company_event_rsvp_needs_update(jsonb,public.company_event_rsvps)','private.company_event_json(public.company_events,uuid,boolean)',
    'private.company_event_save_for_actor(uuid,uuid,uuid,integer,jsonb)','private.company_event_status_for_actor(uuid,uuid,uuid,text,integer,text)',
    'private.company_event_rsvp_for_actor(uuid,uuid,uuid,text,jsonb,uuid)','private.can_read_company_event_image(text)',
    'private.can_upload_company_event_image(text)','private.company_event_watch_state(uuid)',
    'private.company_event_watch_signal(uuid,uuid,jsonb)','private.company_events_watch_trigger()','private.company_event_rsvps_watch_trigger()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant usage on schema private to authenticated;
grant execute on function private.can_read_company_event_image(text) to authenticated;
grant execute on function private.can_upload_company_event_image(text) to authenticated;

do $$ declare f text; begin
  foreach f in array array[
    'public.company_events_settings()','public.company_events_set_enabled(boolean)','public.company_events_list()',
    'public.company_event_get(uuid)','public.company_event_save(uuid,integer,jsonb)',
    'public.company_event_set_status(uuid,text,integer,text)','public.company_event_rsvp(uuid,text,jsonb,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.multideck_dexter_domain_company_events(uuid,text,integer)',
    'public.multideck_dexter_action_rsvp_company_event(uuid,uuid,jsonb)',
    'public.multideck_dexter_action_create_company_event_draft(uuid,uuid,jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
