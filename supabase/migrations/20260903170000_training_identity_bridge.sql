insert into public."sys_AuditEventTypes" ("AuditEventType_Code", "AuditEventType_Name", "AuditEventType_Description")
values ('training_identity_sync', 'Training identity synchronised', 'Main-authorised identity, role and office access synchronised into the paired Training project.')
on conflict ("AuditEventType_Code") do nothing;

-- Empty on main projects. Luke explicitly pairs ONLY the training database.
create table if not exists public.training_configuration (
  singleton boolean primary key default true check (singleton),
  main_project_url text not null,
  main_company_id uuid not null,
  training_company_id uuid not null references public."cmp_Company"("Company_ID")
);
create table if not exists public.training_identity_links (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references public."cmp_Users"("User_ID"),
  source_fingerprint text not null,
  synced_at timestamptz not null default now()
);
alter table public.training_configuration enable row level security;
alter table public.training_identity_links enable row level security;
revoke all on public.training_configuration, public.training_identity_links from public, anon, authenticated;
grant all on public.training_configuration, public.training_identity_links to service_role;

create table public.training_office_links (
  main_office_id uuid primary key,
  training_office_id uuid not null references public."cmp_Offices"("Office_ID")
);
alter table public.training_office_links enable row level security;
revoke all on public.training_office_links from public, anon, authenticated;
grant all on public.training_office_links to service_role;

-- The existing tenant Auth trigger provisions a local profile with a new
-- User_ID. Training must instead wait for the broker's same-ID profile sync.
-- Retain the existing Main trigger body and its normal insert/update behaviour.
create or replace function public.should_sync_main_auth_profile()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.training_configuration);
$$;
revoke all on function public.should_sync_main_auth_profile() from public, anon, authenticated;
grant execute on function public.should_sync_main_auth_profile() to service_role, supabase_auth_admin;
do $$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
    and tgname = 'on_auth_user_changed_sync_cmp_user') then
    if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_changed_sync_cmp_user'
      and tgfoid = to_regprocedure('public.sync_cmp_user_from_auth_user()')
      and tgqual is null) then
      raise exception 'Review the existing Auth profile trigger before installing Training';
    end if;
    drop trigger on_auth_user_changed_sync_cmp_user on auth.users;
    create trigger on_auth_user_changed_sync_cmp_user
      after insert or update of email, raw_user_meta_data on auth.users
      for each row when (public.should_sync_main_auth_profile())
      execute function public.sync_cmp_user_from_auth_user();
  end if;
end $$;

create or replace function public.assert_training_pair_v1(p_main_project_url text, p_main_company_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select training_company_id into target from public.training_configuration
  where singleton and main_project_url = p_main_project_url and main_company_id = p_main_company_id;
  if target is null then raise exception 'This database is not configured as the paired training workspace'; end if;
  return target;
end $$;
revoke all on function public.assert_training_pair_v1(text, uuid) from public, anon, authenticated;
grant execute on function public.assert_training_pair_v1(text, uuid) to service_role;

create or replace function public.sync_training_identity_v1(
  p_main_project_url text, p_main_company_id uuid, p_profile jsonb, p_roles jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target uuid := public.assert_training_pair_v1(p_main_project_url, p_main_company_id);
  actor uuid := (p_profile->>'authUserId')::uuid;
  v_user_id uuid := (p_profile->>'userId')::uuid;
  fingerprint text := md5(p_profile::text || p_roles::text);
  source_role jsonb;
  role_id uuid;
  changed boolean;
begin
  perform set_config('multideck.training_identity_sync', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended('training-identity:' || actor::text, 0));
  if exists (select 1 from public.training_identity_links l where l.auth_user_id = actor and l.user_id <> v_user_id)
    or exists (select 1 from public."cmp_Users" u where (u."User_ID" = v_user_id or u."Auth_User_ID" = actor)
      and not exists (select 1 from public.training_identity_links l where l.auth_user_id = actor and l.user_id = u."User_ID")) then
    raise exception 'Training identity conflicts with an existing record';
  end if;
  changed := not exists (select 1 from public.training_identity_links l where l.auth_user_id = actor and l.source_fingerprint = fingerprint);
  if jsonb_typeof(p_roles) <> 'array' then raise exception 'Invalid training roles'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_profile->'officeIds') as office(id)
    where not exists (select 1 from public.training_office_links l
      join public."cmp_Offices" o on o."Office_ID" = l.training_office_id
      where l.main_office_id = office.id::uuid and o."Company_ID" = target)
  ) then raise exception 'Map the main offices to this training company before granting access'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_roles) r, jsonb_array_elements_text(r->'permissions') as permission(value)
    where not exists (select 1 from public."sys_Permissions" p where p."sys_Permission_Value" = permission.value)
  ) then raise exception 'Training schema is missing a main workspace permission'; end if;

  insert into public."cmp_Users" ("User_ID", "Auth_User_ID", "Company_ID", "User_Email", "User_Firstname", "User_Lastname", "User_AccessStatus")
  values (v_user_id, actor, target, p_profile->>'email', p_profile->>'firstName', p_profile->>'lastName', 'active')
  on conflict ("User_ID") do update set
    "User_Email" = excluded."User_Email", "User_Firstname" = excluded."User_Firstname",
    "User_Lastname" = excluded."User_Lastname", "Company_ID" = target, "Auth_User_ID" = actor, "User_AccessStatus" = 'active'
  where ("cmp_Users"."Company_ID", "cmp_Users"."Auth_User_ID", "cmp_Users"."User_Email", "cmp_Users"."User_Firstname", "cmp_Users"."User_Lastname", "cmp_Users"."User_AccessStatus")
    is distinct from (target, actor, excluded."User_Email", excluded."User_Firstname", excluded."User_Lastname", 'active');

  for source_role in select * from jsonb_array_elements(p_roles) loop
    role_id := (source_role->>'id')::uuid;
    insert into public."sys_UserRoles" ("sys_UserRole_ID", "sys_UserRole_Name") values (role_id, source_role->>'name')
    on conflict ("sys_UserRole_ID") do update set "sys_UserRole_Name" = excluded."sys_UserRole_Name"
      where "sys_UserRoles"."sys_UserRole_Name" is distinct from excluded."sys_UserRole_Name";
    delete from public."sys_UserRole_Permissions" rp where rp."sys_UserRole_ID" = role_id
      and not exists (select 1 from public."sys_Permissions" p where p."sys_Permission_ID" = rp."sys_Permission_ID"
        and p."sys_Permission_Value" in (select jsonb_array_elements_text(source_role->'permissions')));
    insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
      select role_id, p."sys_Permission_ID" from public."sys_Permissions" p
      where p."sys_Permission_Value" in (select jsonb_array_elements_text(source_role->'permissions')) on conflict do nothing;
  end loop;
  delete from public."cmp_Users_Roles" ur where ur."User_ID" = v_user_id
    and ur."sys_UserRole_ID" not in (select (r->>'id')::uuid from jsonb_array_elements(p_roles) r);
  insert into public."cmp_Users_Roles" ("User_ID", "sys_UserRole_ID")
    select v_user_id, (r->>'id')::uuid from jsonb_array_elements(p_roles) r on conflict do nothing;
  delete from public."cmp_Users_Offices" uo where uo."User_ID" = v_user_id
    and uo."Office_ID" not in (select l.training_office_id from public.training_office_links l
      where l.main_office_id in (select value::uuid from jsonb_array_elements_text(p_profile->'officeIds')));
  insert into public."cmp_Users_Offices" ("User_ID", "Office_ID")
    select distinct v_user_id, l.training_office_id from public.training_office_links l
    where l.main_office_id in (select value::uuid from jsonb_array_elements_text(p_profile->'officeIds')) on conflict do nothing;
  insert into public.training_identity_links (auth_user_id, user_id, source_fingerprint)
    values (actor, v_user_id, fingerprint) on conflict (auth_user_id) do update
    set source_fingerprint = excluded.source_fingerprint, synced_at = now();
  if changed then
  insert into public."Audit_Events" ("AuditEvent_EventTypeCode", "AuditEvent_ActorTypeCode", "AuditEvent_UserID", "AuditEvent_AuthUserID",
    "AuditEvent_SourceApp", "AuditEvent_SourceModule", "AuditEvent_Action", "AuditEvent_Title", "AuditEvent_MetadataJSON")
    values ('training_identity_sync', 'user', v_user_id, actor, 'Multideck App', 'Training', 'sync_training_identity',
      'Training identity synchronised', jsonb_build_object('environment', 'training', 'sourceProject', p_main_project_url));
  end if;
end $$;
revoke all on function public.sync_training_identity_v1(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_training_identity_v1(text, uuid, jsonb, jsonb) to service_role;

-- Pairing enables these guards. Main databases (no configuration row) retain
-- their existing Auth and team lifecycle. Operational preferences stay editable.
create or replace function public.guard_training_access_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.training_configuration)
    and coalesce(current_setting('multideck.training_identity_sync', true), '') <> 'on' then
    raise exception 'Manage accounts and permissions in Main; Training inherits access';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_training_access_changes() from public, anon, authenticated;
create trigger training_profile_identity_guard before insert or delete or update of
  "User_ID", "Auth_User_ID", "Company_ID", "User_Email", "User_Firstname", "User_Lastname", "User_AccessStatus"
  on public."cmp_Users" for each row execute function public.guard_training_access_changes();
create trigger training_user_roles_guard before insert or update or delete
  on public."cmp_Users_Roles" for each row execute function public.guard_training_access_changes();
create trigger training_user_offices_guard before insert or update or delete
  on public."cmp_Users_Offices" for each row execute function public.guard_training_access_changes();
create trigger training_roles_guard before insert or update or delete
  on public."sys_UserRoles" for each row execute function public.guard_training_access_changes();
create trigger training_role_permissions_guard before insert or update or delete
  on public."sys_UserRole_Permissions" for each row execute function public.guard_training_access_changes();

-- A valid training bearer must not be convertible into separate credentials by
-- calling Auth directly. Only credentialless bridge identities may be created.
create or replace function public.guard_training_auth_credentials()
returns trigger language plpgsql security definer set search_path = '' as $$
declare source_url text;
begin
  select main_project_url into source_url from public.training_configuration where singleton;
  if source_url is null then return new; end if;
  -- GoTrue creates a random password when admin.createUser omits one, and
  -- writes app_metadata later in the same transaction. Remove that password.
  if tg_op = 'INSERT' then new.encrypted_password := null; end if;
  if new.email is distinct from new.id::text || '@training.multideck.invalid'
    or (new.raw_app_meta_data->>'training_main_project' is not null
      and new.raw_app_meta_data->>'training_main_project' is distinct from source_url)
    or coalesce(new.encrypted_password, '') <> '' or coalesce(new.phone, '') <> '' then
    raise exception 'Training authentication is available only through Main';
  end if;
  return new;
end $$;
revoke all on function public.guard_training_auth_credentials() from public, anon, authenticated;
create trigger training_auth_credentials_guard before insert or update on auth.users
  for each row execute function public.guard_training_auth_credentials();

create or replace function public.guard_training_auth_identities()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.training_configuration) then
    if tg_op = 'DELETE' or new.provider <> 'email'
      or new.identity_data->>'email' is distinct from new.user_id::text || '@training.multideck.invalid' then
      raise exception 'Link sign-in methods in Main, not Training';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_training_auth_identities() from public, anon, authenticated;
create trigger training_auth_identities_guard before insert or update or delete on auth.identities
  for each row execute function public.guard_training_auth_identities();

create or replace function public.guard_training_auth_factors()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.training_configuration) then
    raise exception 'Manage authentication factors and passkeys in Main';
  end if;
  return new;
end $$;
revoke all on function public.guard_training_auth_factors() from public, anon, authenticated;
create trigger training_mfa_guard before insert on auth.mfa_factors
  for each row execute function public.guard_training_auth_factors();
do $$ begin
  if to_regclass('auth.webauthn_credentials') is not null then
    execute 'create trigger training_passkeys_guard before insert on auth.webauthn_credentials
      for each row execute function public.guard_training_auth_factors()';
  end if;
end $$;
