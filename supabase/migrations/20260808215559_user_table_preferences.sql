begin;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public."cmp_Users"
  add column if not exists "User_TablePinnedColumns" jsonb;

-- Pin choices are an object of stable table ids to bounded arrays of column ids.
-- Other table layout choices remain device-local and are intentionally not accepted here.
create or replace function private.is_valid_table_pinned_columns(p_preferences jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_table record;
  v_column jsonb;
begin
  if p_preferences is null then
    return true;
  end if;

  if jsonb_typeof(p_preferences) <> 'object' then
    return false;
  end if;

  if (select count(*) from jsonb_object_keys(p_preferences)) > 100 then
    return false;
  end if;

  for v_table in select key, value from jsonb_each(p_preferences) loop
    if length(v_table.key) not between 1 and 120 then
      return false;
    end if;

    if jsonb_typeof(v_table.value) <> 'array' or jsonb_array_length(v_table.value) > 100 then
      return false;
    end if;

    for v_column in select value from jsonb_array_elements(v_table.value) loop
      if jsonb_typeof(v_column) <> 'string' then
        return false;
      end if;

      if length(v_column #>> '{}') not between 1 and 120 then
        return false;
      end if;
    end loop;
  end loop;

  return true;
end
$$;

revoke all on function private.is_valid_table_pinned_columns(jsonb) from public, anon;
grant execute on function private.is_valid_table_pinned_columns(jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_TablePinnedColumns'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_TablePinnedColumns"
      check (private.is_valid_table_pinned_columns("User_TablePinnedColumns"));
  end if;
end
$$;

comment on column public."cmp_Users"."User_TablePinnedColumns" is
  'Private per-operator table pin choices. UI-only preferences do not emit Watching for you events and are not exposed as Dexter actions.';

create or replace function public.get_current_user_table_preferences()
returns table (
  "preferences" jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(workspace_user."User_TablePinnedColumns", '{}'::jsonb)
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

revoke all on function public.get_current_user_table_preferences() from public, anon;
grant execute on function public.get_current_user_table_preferences() to authenticated;

create or replace function public.set_current_user_table_preferences(p_preferences jsonb)
returns table (
  "preferences" jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_preferences jsonb := coalesce(p_preferences, '{}'::jsonb);
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_valid_table_pinned_columns(v_preferences) then
    raise exception 'The table preferences are invalid.' using errcode = '22023';
  end if;

  update public."cmp_Users"
  set "User_TablePinnedColumns" = case when v_preferences = '{}'::jsonb then null else v_preferences end
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select v_preferences;
end
$$;

revoke all on function public.set_current_user_table_preferences(jsonb) from public, anon;
grant execute on function public.set_current_user_table_preferences(jsonb) to authenticated;

commit;
