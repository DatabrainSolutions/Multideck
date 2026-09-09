begin;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public."cmp_Users"
  add column if not exists "User_SidebarCollapsed" boolean,
  add column if not exists "User_SidebarLayout" jsonb;

-- The layout is opaque to the server, so the shape is pinned here instead: an object of
-- scope id -> { order: string[], pinned: string[] } with bounded keys and entries.
create or replace function private.is_valid_sidebar_layout(p_layout jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_scope record;
  v_list_name text;
  v_list jsonb;
  v_entry jsonb;
begin
  if p_layout is null then
    return true;
  end if;

  if jsonb_typeof(p_layout) <> 'object' then
    return false;
  end if;

  if (select count(*) from jsonb_object_keys(p_layout)) > 40 then
    return false;
  end if;

  for v_scope in select key, value from jsonb_each(p_layout) loop
    if length(v_scope.key) not between 1 and 120 then
      return false;
    end if;

    if jsonb_typeof(v_scope.value) <> 'object' then
      return false;
    end if;

    if (select count(*) from jsonb_object_keys(v_scope.value)) <> 2 then
      return false;
    end if;

    foreach v_list_name in array array['order', 'pinned'] loop
      v_list := v_scope.value -> v_list_name;

      if v_list is null or jsonb_typeof(v_list) <> 'array' then
        return false;
      end if;

      if jsonb_array_length(v_list) > 200 then
        return false;
      end if;

      for v_entry in select value from jsonb_array_elements(v_list) loop
        if jsonb_typeof(v_entry) <> 'string' then
          return false;
        end if;

        if length(v_entry #>> '{}') not between 1 and 120 then
          return false;
        end if;
      end loop;
    end loop;
  end loop;

  return true;
end
$$;

revoke all on function private.is_valid_sidebar_layout(jsonb) from public, anon;
grant execute on function private.is_valid_sidebar_layout(jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_SidebarLayout'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_SidebarLayout"
      check (private.is_valid_sidebar_layout("User_SidebarLayout"));
  end if;
end
$$;

alter table public."cmp_Users" enable row level security;

create or replace function public.get_current_user_sidebar_preferences()
returns table (
  "collapsed" boolean,
  "layout" jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(workspace_user."User_SidebarCollapsed", false),
    coalesce(workspace_user."User_SidebarLayout", '{}'::jsonb)
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

revoke all on function public.get_current_user_sidebar_preferences() from public, anon;
grant execute on function public.get_current_user_sidebar_preferences() to authenticated;

create or replace function public.set_current_user_sidebar_preferences(
  p_collapsed boolean,
  p_layout jsonb
)
returns table (
  "collapsed" boolean,
  "layout" jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_collapsed boolean := coalesce(p_collapsed, false);
  v_layout jsonb := coalesce(p_layout, '{}'::jsonb);
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_valid_sidebar_layout(v_layout) then
    raise exception 'The sidebar layout is invalid.';
  end if;

  update public."cmp_Users"
  set
    "User_SidebarCollapsed" = v_collapsed,
    "User_SidebarLayout" = case when v_layout = '{}'::jsonb then null else v_layout end
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select v_collapsed, v_layout;
end
$$;

revoke all on function public.set_current_user_sidebar_preferences(boolean, jsonb) from public, anon;
grant execute on function public.set_current_user_sidebar_preferences(boolean, jsonb) to authenticated;

commit;
