-- Keep the Drive stats RPC's declared bigint contract aligned with PostgreSQL's
-- numeric result for sum(bigint). Without the explicit cast PostgREST rejects
-- every call, including an empty Drive, with SQLSTATE 42804.

create or replace function public.crm_drive_folder_stats(p_parent_id uuid default null)
returns table (
  "folderId" uuid,
  "folderCount" bigint,
  "fileCount" bigint,
  "byteTotal" bigint,
  "lastActivityAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public._crm_drive_require_permission('CRM.Drive.Read');
  return query
  with recursive subtree as (
    select folder."DriveFolder_ID" as root_id, folder."DriveFolder_ID" as node_id
    from public."CRM_DriveFolders" as folder
    where folder."Company_ID" = public.app_current_company_id()
      and folder."DriveFolder_ParentID" is not distinct from p_parent_id
    union all
    select parent.root_id, child."DriveFolder_ID"
    from subtree as parent
    join public."CRM_DriveFolders" as child
      on child."DriveFolder_ParentID" = parent.node_id
    where child."Company_ID" = public.app_current_company_id()
  )
  select
    subtree.root_id,
    count(distinct subtree.node_id) - 1,
    count(file."DriveFile_ID"),
    coalesce(sum(file."DriveFile_SizeBytes"), 0)::bigint,
    max(file."DriveFile_UpdatedAt")
  from subtree
  left join public."CRM_DriveFiles" as file
    on file."DriveFile_FolderID" = subtree.node_id
  group by subtree.root_id;
end;
$$;

revoke all on function public.crm_drive_folder_stats(uuid) from public, anon;
grant execute on function public.crm_drive_folder_stats(uuid) to authenticated, service_role;
