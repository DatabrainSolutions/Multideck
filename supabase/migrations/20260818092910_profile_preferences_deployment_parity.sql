begin;

-- Deployment-parity migration for the profile preferences used by every
-- authenticated Multideck session. The original language and keyboard
-- migrations were not applied to the linked test project, so this deliberately
-- repeats their idempotent schema and function definitions under a new version.

alter table public."cmp_Users"
  add column if not exists "User_Locale" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_Locale'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_Locale"
      check (
        "User_Locale" is null
        or "User_Locale" in ('en-GB', 'en-US')
      );
  end if;
end
$$;

create or replace function public.get_current_user_language_preference()
returns table (locale text)
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_user."User_Locale"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

revoke all on function public.get_current_user_language_preference() from public, anon;
grant execute on function public.get_current_user_language_preference() to authenticated;

create or replace function public.set_current_user_language_preference(p_locale text)
returns table (locale text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_locale is null or p_locale not in ('en-GB', 'en-US') then
    raise exception 'The language is invalid.' using errcode = '22023';
  end if;

  update public."cmp_Users"
  set "User_Locale" = p_locale
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select p_locale;
end
$$;

revoke all on function public.set_current_user_language_preference(text) from public, anon;
grant execute on function public.set_current_user_language_preference(text) to authenticated;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public."cmp_Users"
  add column if not exists "User_KeyboardShortcuts" jsonb;

create or replace function private.is_valid_keyboard_shortcuts(p_shortcuts jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_entry record;
begin
  if p_shortcuts is null then
    return true;
  end if;

  if jsonb_typeof(p_shortcuts) <> 'object' then
    return false;
  end if;

  if (select count(*) from jsonb_object_keys(p_shortcuts)) > 120 then
    return false;
  end if;

  for v_entry in select key, value from jsonb_each(p_shortcuts) loop
    if length(v_entry.key) not between 1 and 120 then
      return false;
    end if;

    if jsonb_typeof(v_entry.value) <> 'string' then
      return false;
    end if;

    if length(v_entry.value #>> '{}') > 120 then
      return false;
    end if;
  end loop;

  return true;
end
$$;

revoke all on function private.is_valid_keyboard_shortcuts(jsonb) from public, anon;
grant execute on function private.is_valid_keyboard_shortcuts(jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_KeyboardShortcuts'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_KeyboardShortcuts"
      check (private.is_valid_keyboard_shortcuts("User_KeyboardShortcuts"));
  end if;
end
$$;

alter table public."cmp_Users" enable row level security;

create or replace function public.get_current_user_keyboard_shortcuts()
returns table ("shortcuts" jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(workspace_user."User_KeyboardShortcuts", '{}'::jsonb)
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

revoke all on function public.get_current_user_keyboard_shortcuts() from public, anon;
grant execute on function public.get_current_user_keyboard_shortcuts() to authenticated;

create or replace function public.set_current_user_keyboard_shortcuts(p_shortcuts jsonb)
returns table ("shortcuts" jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_shortcuts jsonb := coalesce(p_shortcuts, '{}'::jsonb);
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_valid_keyboard_shortcuts(v_shortcuts) then
    raise exception 'The keyboard shortcut overrides are invalid.';
  end if;

  update public."cmp_Users"
  set "User_KeyboardShortcuts" = case when v_shortcuts = '{}'::jsonb then null else v_shortcuts end
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select v_shortcuts;
end
$$;

revoke all on function public.set_current_user_keyboard_shortcuts(jsonb) from public, anon;
grant execute on function public.set_current_user_keyboard_shortcuts(jsonb) to authenticated;

commit;
