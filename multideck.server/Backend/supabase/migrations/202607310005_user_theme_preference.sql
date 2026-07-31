begin;

alter table public."cmp_Users"
  add column if not exists "User_ThemeMode" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_ThemeMode'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_ThemeMode"
      check ("User_ThemeMode" is null or "User_ThemeMode" in ('light', 'dark'));
  end if;
end
$$;

alter table public."cmp_Users" enable row level security;

create or replace function public.get_current_user_theme_preference()
returns table (theme_mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_user."User_ThemeMode"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

revoke all on function public.get_current_user_theme_preference() from public, anon;
grant execute on function public.get_current_user_theme_preference() to authenticated;

create or replace function public.set_current_user_theme_preference(p_theme_mode text)
returns table (theme_mode text)
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

  if p_theme_mode is null or p_theme_mode not in ('light', 'dark') then
    raise exception 'The appearance mode is invalid.' using errcode = '22023';
  end if;

  update public."cmp_Users"
  set "User_ThemeMode" = p_theme_mode
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select p_theme_mode;
end
$$;

revoke all on function public.set_current_user_theme_preference(text) from public, anon;
grant execute on function public.set_current_user_theme_preference(text) to authenticated;

commit;
