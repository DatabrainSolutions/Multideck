begin;

-- Profile preference writes are audited. Supply both the workspace user id and
-- the Supabase auth id before updating cmp_Users so the audit event satisfies
-- its workspace-user foreign key and retains the originating identity.
create or replace function public.set_current_user_language_preference(p_locale text)
returns table (locale text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_user_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_locale is null or p_locale not in ('en-GB', 'en-US') then
    raise exception 'The language is invalid.' using errcode = '22023';
  end if;

  select workspace_user."User_ID"
  into v_workspace_user_id
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = v_auth_user_id;

  if v_workspace_user_id is null then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  perform set_config('app.user_id', v_workspace_user_id::text, true);
  perform set_config('app.auth_user_id', v_auth_user_id::text, true);

  update public."cmp_Users"
  set "User_Locale" = p_locale
  where "User_ID" = v_workspace_user_id;

  return query select p_locale;
end
$$;

revoke all on function public.set_current_user_language_preference(text) from public, anon;
grant execute on function public.set_current_user_language_preference(text) to authenticated;

create or replace function public.set_current_user_keyboard_shortcuts(p_shortcuts jsonb)
returns table ("shortcuts" jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_user_id uuid;
  v_shortcuts jsonb := coalesce(p_shortcuts, '{}'::jsonb);
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_valid_keyboard_shortcuts(v_shortcuts) then
    raise exception 'The keyboard shortcut overrides are invalid.';
  end if;

  select workspace_user."User_ID"
  into v_workspace_user_id
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = v_auth_user_id;

  if v_workspace_user_id is null then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  perform set_config('app.user_id', v_workspace_user_id::text, true);
  perform set_config('app.auth_user_id', v_auth_user_id::text, true);

  update public."cmp_Users"
  set "User_KeyboardShortcuts" = case when v_shortcuts = '{}'::jsonb then null else v_shortcuts end
  where "User_ID" = v_workspace_user_id;

  return query select v_shortcuts;
end
$$;

revoke all on function public.set_current_user_keyboard_shortcuts(jsonb) from public, anon;
grant execute on function public.set_current_user_keyboard_shortcuts(jsonb) to authenticated;

commit;
