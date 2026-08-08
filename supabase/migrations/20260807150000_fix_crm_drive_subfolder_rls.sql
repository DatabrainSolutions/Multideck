-- A folder insert must verify that a requested parent belongs to the caller's
-- company. Performing that lookup directly inside the folder table's RLS policy
-- re-enters the same policy, which Postgres denies for nested-folder inserts.
-- Keep the lookup server-side and limited to this single ownership predicate.
create or replace function public.crm_drive_parent_belongs_to_current_company(p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."CRM_DriveFolders" as parent
    where parent."DriveFolder_ID" = p_parent_id
      and parent."Company_ID" = public.app_current_company_id()
  )
$$;

revoke all on function public.crm_drive_parent_belongs_to_current_company(uuid) from public, anon;
grant execute on function public.crm_drive_parent_belongs_to_current_company(uuid) to authenticated;

drop policy if exists "Drive folders are created inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are created inside the company"
on public."CRM_DriveFolders" for insert to authenticated
with check (
  "Company_ID" = public.app_current_company_id()
  and (
    "DriveFolder_ParentID" is null
    or public.crm_drive_parent_belongs_to_current_company("DriveFolder_ParentID")
  )
);
