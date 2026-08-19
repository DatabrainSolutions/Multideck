-- Role and access changes only need to know whether another active workspace
-- administrator exists. Keep that existence check in Postgres instead of
-- transferring every other active user ID to the Team Edge Function.

begin;

create index if not exists "IX_cmp_Users_CompanyAccessUser"
  on public."cmp_Users" ("Company_ID", "User_AccessStatus", "User_ID");

create index if not exists "IX_cmp_Users_Roles_UserRole"
  on public."cmp_Users_Roles" ("User_ID", "sys_UserRole_ID");

create or replace function public.multideck_other_active_admin_exists(
  p_company_id uuid,
  p_excluded_user_id uuid,
  p_role_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."cmp_Users" workspace_user
    join public."cmp_Users_Roles" user_role
      on user_role."User_ID" = workspace_user."User_ID"
    where workspace_user."Company_ID" = p_company_id
      and workspace_user."User_AccessStatus" = 'active'
      and workspace_user."User_ID" <> p_excluded_user_id
      and user_role."sys_UserRole_ID" = any(coalesce(p_role_ids, array[]::uuid[]))
    limit 1
  );
$$;

revoke all on function public.multideck_other_active_admin_exists(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.multideck_other_active_admin_exists(uuid, uuid, uuid[]) to service_role;

comment on function public.multideck_other_active_admin_exists(uuid, uuid, uuid[]) is
  'Returns whether another active user has one of the workspace administrator roles.';

commit;
