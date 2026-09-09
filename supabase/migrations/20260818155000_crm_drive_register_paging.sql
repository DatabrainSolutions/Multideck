-- Keep Drive grids bounded at the database boundary.  The cursor is deliberately
-- opaque to the page: it contains the last (case-insensitive) name and UUID in
-- the deterministic name/id order used by both functions.

begin;

create index if not exists "IX_CRM_DriveFolders_company_parent_name_id"
  on public."CRM_DriveFolders" (
    "Company_ID",
    "DriveFolder_ParentID",
    lower("DriveFolder_Name"),
    "DriveFolder_ID"
  );

create index if not exists "IX_CRM_DriveFiles_company_folder_name_id"
  on public."CRM_DriveFiles" (
    "Company_ID",
    "DriveFile_FolderID",
    lower("DriveFile_Name"),
    "DriveFile_ID"
  );

create or replace function public.crm_drive_list_folders(
  p_parent_id uuid default null,
  p_limit integer default 48,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 48), 100));
begin
  perform public._crm_drive_require_permission('CRM.Drive.Read');

  return (
    with eligible as (
      select
        folder."DriveFolder_ID" as id,
        folder."DriveFolder_ParentID" as parent_id,
        folder."DriveFolder_Name" as name,
        folder."DriveFolder_ColourCode" as colour,
        folder."DriveFolder_IconCode" as icon,
        folder."DriveFolder_CreatedAt" as created_at,
        folder."DriveFolder_UpdatedAt" as updated_at
      from public."CRM_DriveFolders" as folder
      where folder."Company_ID" = v_company_id
        and folder."DriveFolder_ParentID" is not distinct from p_parent_id
        and (
          p_cursor is null
          or lower(folder."DriveFolder_Name") > lower(p_cursor->>'name')
          or (
            lower(folder."DriveFolder_Name") = lower(p_cursor->>'name')
            and folder."DriveFolder_ID" > (p_cursor->>'id')::uuid
          )
        )
      order by lower(folder."DriveFolder_Name"), folder."DriveFolder_ID"
      limit v_limit + 1
    ), page as (
      select * from eligible
      limit v_limit
    ), total as (
      select count(*)::bigint as value
      from public."CRM_DriveFolders" as folder
      where folder."Company_ID" = v_company_id
        and folder."DriveFolder_ParentID" is not distinct from p_parent_id
    ), last_page as (
      select page.name, page.id
      from page
      order by lower(page.name) desc, page.id desc
      limit 1
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', page.id,
          'parentId', page.parent_id,
          'name', page.name,
          'colour', page.colour,
          'icon', page.icon,
          'createdAt', page.created_at,
          'updatedAt', page.updated_at
        ) order by lower(page.name), page.id)
        from page
      ), '[]'::jsonb),
      'totalCount', (select total.value from total),
      'hasMore', (select count(*) > v_limit from eligible),
      'nextCursor', case
        when (select count(*) > v_limit from eligible) then (
          select jsonb_build_object('name', last_page.name, 'id', last_page.id)
          from last_page
        )
        else null
      end
    )
  );
end;
$$;

create or replace function public.crm_drive_list_files(
  p_folder_id uuid default null,
  p_limit integer default 48,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 48), 100));
begin
  perform public._crm_drive_require_permission('CRM.Drive.Read');

  return (
    with eligible as (
      select
        file."DriveFile_ID" as id,
        file."DriveFile_FolderID" as folder_id,
        file."DriveFile_Name" as name,
        file."DriveFile_MimeType" as mime_type,
        file."DriveFile_SizeBytes" as size_bytes,
        file."DriveFile_StoragePath" as storage_path,
        file."DriveFile_ThumbnailPath" as thumbnail_path,
        file."DriveFile_PreviewSeed" as preview_seed,
        file."DriveFile_PreviewWidth" as preview_width,
        file."DriveFile_PreviewHeight" as preview_height,
        file."DriveFile_CreatedAt" as created_at,
        file."DriveFile_UpdatedAt" as updated_at
      from public."CRM_DriveFiles" as file
      where file."Company_ID" = v_company_id
        and file."DriveFile_FolderID" is not distinct from p_folder_id
        and (
          p_cursor is null
          or lower(file."DriveFile_Name") > lower(p_cursor->>'name')
          or (
            lower(file."DriveFile_Name") = lower(p_cursor->>'name')
            and file."DriveFile_ID" > (p_cursor->>'id')::uuid
          )
        )
      order by lower(file."DriveFile_Name"), file."DriveFile_ID"
      limit v_limit + 1
    ), page as (
      select * from eligible
      limit v_limit
    ), total as (
      select count(*)::bigint as value
      from public."CRM_DriveFiles" as file
      where file."Company_ID" = v_company_id
        and file."DriveFile_FolderID" is not distinct from p_folder_id
    ), last_page as (
      select page.name, page.id
      from page
      order by lower(page.name) desc, page.id desc
      limit 1
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', page.id,
          'folderId', page.folder_id,
          'name', page.name,
          'mimeType', page.mime_type,
          'sizeBytes', page.size_bytes,
          'storagePath', page.storage_path,
          'thumbnailPath', page.thumbnail_path,
          'previewSeed', page.preview_seed,
          'previewWidth', page.preview_width,
          'previewHeight', page.preview_height,
          'createdAt', page.created_at,
          'updatedAt', page.updated_at
        ) order by lower(page.name), page.id)
        from page
      ), '[]'::jsonb),
      'totalCount', (select total.value from total),
      'hasMore', (select count(*) > v_limit from eligible),
      'nextCursor', case
        when (select count(*) > v_limit from eligible) then (
          select jsonb_build_object('name', last_page.name, 'id', last_page.id)
          from last_page
        )
        else null
      end
    )
  );
end;
$$;

create or replace function public.crm_drive_folder_path(p_folder_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_result jsonb;
begin
  perform public._crm_drive_require_permission('CRM.Drive.Read');
  if p_folder_id is null then return '[]'::jsonb; end if;

  with recursive ancestors as (
    select
      folder."DriveFolder_ID" as id,
      folder."DriveFolder_ParentID" as parent_id,
      folder."DriveFolder_Name" as name,
      folder."DriveFolder_ColourCode" as colour,
      folder."DriveFolder_IconCode" as icon,
      folder."DriveFolder_CreatedAt" as created_at,
      folder."DriveFolder_UpdatedAt" as updated_at,
      array[folder."DriveFolder_ID"]::uuid[] as visited,
      0 as depth
    from public."CRM_DriveFolders" as folder
    where folder."Company_ID" = v_company_id
      and folder."DriveFolder_ID" = p_folder_id
    union all
    select
      parent."DriveFolder_ID",
      parent."DriveFolder_ParentID",
      parent."DriveFolder_Name",
      parent."DriveFolder_ColourCode",
      parent."DriveFolder_IconCode",
      parent."DriveFolder_CreatedAt",
      parent."DriveFolder_UpdatedAt",
      ancestors.visited || parent."DriveFolder_ID",
      ancestors.depth + 1
    from ancestors
    join public."CRM_DriveFolders" as parent
      on parent."DriveFolder_ID" = ancestors.parent_id
     and parent."Company_ID" = v_company_id
    where ancestors.depth < 63
      and not parent."DriveFolder_ID" = any(ancestors.visited)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ancestors.id,
    'parentId', ancestors.parent_id,
    'name', ancestors.name,
    'colour', ancestors.colour,
    'icon', ancestors.icon,
    'createdAt', ancestors.created_at,
    'updatedAt', ancestors.updated_at
  ) order by ancestors.depth desc), '[]'::jsonb)
  into v_result
  from ancestors;

  return v_result;
end;
$$;

revoke all on function public.crm_drive_list_folders(uuid, integer, jsonb) from public, anon;
revoke all on function public.crm_drive_list_files(uuid, integer, jsonb) from public, anon;
revoke all on function public.crm_drive_folder_path(uuid) from public, anon;
grant execute on function public.crm_drive_list_folders(uuid, integer, jsonb) to authenticated, service_role;
grant execute on function public.crm_drive_list_files(uuid, integer, jsonb) to authenticated, service_role;
grant execute on function public.crm_drive_folder_path(uuid) to authenticated, service_role;

commit;
