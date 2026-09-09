begin;

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

alter table public."cmp_Users" enable row level security;

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

commit;
