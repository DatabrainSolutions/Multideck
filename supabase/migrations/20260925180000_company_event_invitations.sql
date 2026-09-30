-- Company Events: invitations.
--
-- An event is for everyone (the default), for specific colleagues, or for
-- specific departments. Invitation is the visibility boundary: colleagues who
-- are not invited cannot list, open, RSVP to, watch or load the image of the
-- event. Organisers always can. The one visibility function below is used by
-- every RPC, the private image policy, Dexter reads and watch evaluation, so
-- all of them change together.

begin;

alter table public.company_events add column audience text not null default 'everyone'
  check (audience in ('everyone','people','departments'));

create table public.company_event_invitees (
  event_id uuid not null references public.company_events(id) on delete cascade,
  kind text not null check (kind in ('user','department')),
  target_id uuid not null,
  primary key (event_id, kind, target_id)
);
create index company_event_invitees_target on public.company_event_invitees (kind, target_id);
alter table public.company_event_invitees enable row level security;
revoke all on public.company_event_invitees from public, anon, authenticated;
grant all on public.company_event_invitees to service_role;

create function private.company_event_invited(p_event public.company_events, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_event.audience = 'everyone'
    or (p_event.audience = 'people' and exists (
      select 1 from public.company_event_invitees i
      where i.event_id = p_event.id and i.kind = 'user' and i.target_id = p_user_id))
    or (p_event.audience = 'departments' and exists (
      select 1 from public.company_event_invitees i
      join public."cmp_Departments" d on d."Department_ID" = i.target_id and d."Company_ID" = p_event.company_id and d."Department_IsActive"
      join public."cmp_Users_Departments" m on m."Department_ID" = d."Department_ID"
      where i.event_id = p_event.id and i.kind = 'department' and m."User_ID" = p_user_id));
$$;

-- Active signed-in colleagues the event reaches; the same rule as visibility.
create function private.company_event_invited_count(p_event public.company_events)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public."cmp_Users" u
  where u."Company_ID" = p_event.company_id and u."Auth_User_ID" is not null
    and coalesce(u."User_AccessStatus",'active') = 'active'
    and private.company_event_invited(p_event, u."User_ID");
$$;

create or replace function private.company_event_visible(p_event public.company_events, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_event.status <> 'archived'
    and private.company_events_enabled(p_event.company_id)
    and exists (
      select 1 from public."cmp_Users" u
      where u."User_ID" = p_user_id and u."Company_ID" = p_event.company_id
        and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active') = 'active'
    )
    and (private.company_events_can_manage(p_user_id)
      or (p_event.status in ('published','cancelled') and private.company_event_invited(p_event, p_user_id)));
$$;

create function private.company_event_clean_invitees(p_company_id uuid, p_audience text, p_invitees jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_kind text; v_result jsonb;
begin
  if p_audience not in ('everyone','people','departments') then raise exception 'Choose who is invited.' using errcode = '22023'; end if;
  if p_audience = 'everyone' then return '[]'::jsonb; end if;
  v_kind := case p_audience when 'people' then 'user' else 'department' end;
  if p_invitees is null or jsonb_typeof(p_invitees) <> 'array' or jsonb_array_length(p_invitees) = 0 then
    raise exception '%', case when v_kind = 'user' then 'Choose at least one person to invite.' else 'Choose at least one department to invite.' end using errcode = '22023';
  end if;
  if jsonb_array_length(p_invitees) > 1000 then raise exception 'Invite no more than 1,000 people or departments.' using errcode = '22023'; end if;
  begin
    select coalesce(jsonb_agg(distinct jsonb_build_object('kind', v_kind, 'id', (item #>> '{}')::uuid)), '[]'::jsonb) into v_result
    from jsonb_array_elements(p_invitees) item;
  exception when others then
    raise exception 'Those invitations are not valid.' using errcode = '22023';
  end;
  if v_kind = 'user' and exists (
    select 1 from jsonb_array_elements(v_result) item
    where not exists (select 1 from public."cmp_Users" u where u."User_ID" = (item->>'id')::uuid and u."Company_ID" = p_company_id
      and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active') = 'active')
  ) then raise exception 'Someone you invited is no longer available in this workspace.' using errcode = '22023'; end if;
  if v_kind = 'department' and exists (
    select 1 from jsonb_array_elements(v_result) item
    where not exists (select 1 from public."cmp_Departments" d where d."Department_ID" = (item->>'id')::uuid and d."Company_ID" = p_company_id and d."Department_IsActive")
  ) then raise exception 'A department you invited is no longer available.' using errcode = '22023'; end if;
  return v_result;
end $$;

create or replace function private.company_event_save_for_actor(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  old public.company_events; saved public.company_events;
  v_title text := btrim(coalesce(p_payload->>'title',''));
  v_location text := btrim(coalesce(p_payload->>'location',''));
  v_details text := btrim(coalesce(p_payload->>'details',''));
  v_timezone text := coalesce(nullif(btrim(p_payload->>'timezone'),''),'Europe/London');
  v_image text := nullif(btrim(coalesce(p_payload->>'imagePath','')),'');
  v_audience text := coalesce(nullif(p_payload->>'audience',''),'everyone'); v_invitees jsonb;
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
  v_invitees := private.company_event_clean_invitees(p_company_id, v_audience, p_payload->'invitees');

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
      details = v_details, image_path = v_image, form_schema = v_form, form_version = v_form_version, audience = v_audience,
      edit_version = old.edit_version + 1, updated_by = p_user_id, updated_at = clock_timestamp()
    where id = old.id returning * into saved;
  else
    if coalesce(p_expected_version, 0) <> 0 then raise exception 'This event is not available.' using errcode = '42501'; end if;
    insert into public.company_events (id, company_id, title, starts_at, ends_at, timezone, location, details, image_path, form_schema, audience, created_by, updated_by)
    values (coalesce(p_event_id, gen_random_uuid()), p_company_id, v_title, v_starts, v_ends, v_timezone, v_location, v_details, v_image, v_form, v_audience, p_user_id, p_user_id)
    returning * into saved;
  end if;
  delete from public.company_event_invitees where event_id = saved.id;
  insert into public.company_event_invitees (event_id, kind, target_id)
  select saved.id, item->>'kind', (item->>'id')::uuid from jsonb_array_elements(v_invitees) item;
  insert into public.company_event_audit (company_id, event_id, actor_id, kind, details)
  values (p_company_id, saved.id, p_user_id, case when old.id is null then 'created' else 'updated' end,
    jsonb_build_object('editVersion', saved.edit_version, 'formVersion', saved.form_version, 'title', saved.title,
      'audience', saved.audience, 'invitees', jsonb_array_length(v_invitees)));
  return private.company_event_json(saved, p_user_id, true);
end $$;

create or replace function private.company_event_json(p_event public.company_events, p_viewer uuid, p_detail boolean)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_maybe integer;
  v_manager boolean := private.company_events_can_manage(p_viewer);
  v_mine public.company_event_rsvps;
  v_going integer;
  v_result jsonb;
begin
  select * into v_mine from public.company_event_rsvps r where r.event_id = p_event.id and r.user_id = p_viewer;
  select count(*) into v_going from public.company_event_rsvps r
    join public."cmp_Users" u on u."User_ID" = r.user_id and coalesce(u."User_AccessStatus",'active') = 'active'
    where r.event_id = p_event.id and r.status = 'going';
  select count(*) into v_maybe from public.company_event_rsvps r
    join public."cmp_Users" u on u."User_ID" = r.user_id and coalesce(u."User_AccessStatus",'active') = 'active'
    where r.event_id = p_event.id and r.status = 'maybe';
  v_result := jsonb_build_object(
    'id',p_event.id,'title',p_event.title,'startsAt',p_event.starts_at,'endsAt',p_event.ends_at,
    'timezone',p_event.timezone,'location',p_event.location,'details',p_event.details,
    'imagePath',p_event.image_path,'status',p_event.status,'cancellationNote',p_event.cancellation_note,
    'form',p_event.form_schema,'formVersion',p_event.form_version,'editVersion',p_event.edit_version,
    'publishedAt',p_event.published_at,'cancelledAt',p_event.cancelled_at,'updatedAt',p_event.updated_at,
    'goingCount',v_going,'maybeCount',v_maybe,'canManage',v_manager,
    'audience',p_event.audience,'invitedCount',private.company_event_invited_count(p_event),
    'myRsvp',case when v_mine.event_id is null then null else jsonb_build_object(
      'status',v_mine.status,'answers',v_mine.answers,'formVersion',v_mine.form_version,
      'needsUpdate',private.company_event_rsvp_needs_update(p_event.form_schema, v_mine),
      'updatedAt',v_mine.updated_at) end
  );
  if p_detail and v_manager then
    v_result := v_result || jsonb_build_object('invitees', coalesce((
      select jsonb_agg(jsonb_build_object('kind',i.kind,'id',i.target_id)) from public.company_event_invitees i where i.event_id = p_event.id
    ),'[]'::jsonb));
  end if;
  if p_detail then
    -- Everyone who has answered, with their answer and profile photo, so the
    -- event can show Going, Maybe and Not going as people rather than numbers.
    -- Answers to RSVP questions stay organiser-only (responses below).
    v_result := v_result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('userId',u."User_ID",
        'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email"),
        'status',r.status,
        'photoPath',case when u."User_ProfilePhotoBucket" = 'profile-photos' then u."User_ProfilePhotoPath" end)
        order by case r.status when 'going' then 0 when 'maybe' then 1 else 2 end, r.updated_at)
      from public.company_event_rsvps r join public."cmp_Users" u on u."User_ID" = r.user_id
      where r.event_id = p_event.id and coalesce(u."User_AccessStatus",'active') = 'active'
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

-- Who organisers can invite: active colleagues (with department membership and
-- profile photo) and active departments with their member counts.
create function public.company_events_directory()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v record;
begin
  select * into v from private.company_events_actor();
  if not v.can_manage then raise exception 'You need the Event organiser role to invite people.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('userId',u."User_ID",
        'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email"),
        'jobTitle',u."User_JobTitle",
        'photoPath',case when u."User_ProfilePhotoBucket" = 'profile-photos' then u."User_ProfilePhotoPath" end,
        'departmentIds',coalesce((select jsonb_agg(m."Department_ID") from public."cmp_Users_Departments" m
          join public."cmp_Departments" d on d."Department_ID" = m."Department_ID" and d."Department_IsActive"
          where m."User_ID" = u."User_ID"),'[]'::jsonb))
        order by lower(coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email")))
      from public."cmp_Users" u
      where u."Company_ID" = v.company_id and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active') = 'active'
    ),'[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('id',d."Department_ID",'name',d."Department_Name",
        'memberCount',(select count(*) from public."cmp_Users_Departments" m join public."cmp_Users" u on u."User_ID" = m."User_ID"
          where m."Department_ID" = d."Department_ID" and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active') = 'active'))
        order by lower(d."Department_Name"))
      from public."cmp_Departments" d where d."Company_ID" = v.company_id and d."Department_IsActive"
    ),'[]'::jsonb)
  );
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'private.company_event_invited(public.company_events,uuid)','private.company_event_invited_count(public.company_events)',
    'private.company_event_visible(public.company_events,uuid)','private.company_event_clean_invitees(uuid,text,jsonb)',
    'private.company_event_save_for_actor(uuid,uuid,uuid,integer,jsonb)','private.company_event_json(public.company_events,uuid,boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
revoke all on function public.company_events_directory() from public, anon;
grant execute on function public.company_events_directory() to authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Published company events the signed-in colleague is invited to (every event for Event organisers, including drafts): title, date and time, location, details, cancellation, going count and the colleague''s own RSVP. Individual RSVP form answers, invitations, image uploads, form building and publishing are unsupported in chat; open Events.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'company_events';

commit;
