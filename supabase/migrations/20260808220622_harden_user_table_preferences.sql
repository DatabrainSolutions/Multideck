begin;

-- The profile table historically had broad grants held behind RLS. This preference
-- needs a direct invoker update, so expose only its one column to signed-in users.
revoke update on table public."cmp_Users" from anon, authenticated;
grant update ("User_TablePinnedColumns") on table public."cmp_Users" to authenticated;

drop policy if exists "Users can update their own table pin preferences" on public."cmp_Users";
create policy "Users can update their own table pin preferences"
on public."cmp_Users"
for update
to authenticated
using ("Auth_User_ID" = (select auth.uid()))
with check ("Auth_User_ID" = (select auth.uid()));

create or replace function public.get_current_user_table_preferences()
returns table (
  "preferences" jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(workspace_user."User_TablePinnedColumns", '{}'::jsonb)
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

create or replace function public.set_current_user_table_preferences(p_preferences jsonb)
returns table (
  "preferences" jsonb
)
language plpgsql
security invoker
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

revoke all on function public.get_current_user_table_preferences() from public, anon;
grant execute on function public.get_current_user_table_preferences() to authenticated;

revoke all on function public.set_current_user_table_preferences(jsonb) from public, anon;
grant execute on function public.set_current_user_table_preferences(jsonb) to authenticated;

commit;
