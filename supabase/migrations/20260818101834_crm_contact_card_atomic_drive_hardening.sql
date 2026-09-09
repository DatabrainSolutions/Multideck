-- CRM trust hardening: make contact-card saves atomic and keep Drive access
-- role-aware with canonical, company-owned storage paths.

begin;

/* ------------------------------------------------------ contact-card saves */

-- The browser used to call save/create and tenant-name visibility as two
-- independent RPCs.  This boundary keeps the existing validation and child
-- automation writes, then applies the attribution flag in the same transaction.
create or replace function public.multideck_contact_card_save_atomic(p_card jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_id uuid;
  v_existing_company uuid;
begin
  if jsonb_typeof(p_card) is distinct from 'object' then
    raise exception 'Contact card details are required.' using errcode = '22023';
  end if;

  select * into v_context from public._multideck_crm_context();
  begin
    v_id := nullif(p_card ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    v_id := null;
  end;
  if v_id is null then
    raise exception 'A card ID is required.' using errcode = '22023';
  end if;

  select card."Company_ID"
    into v_existing_company
  from public."CRM_ContactCards" as card
  where card."ContactCard_ID" = v_id;

  if v_existing_company is null then
    perform public.multideck_contact_card_create(p_card);
  elsif v_existing_company is distinct from v_context.company_id then
    raise exception 'Contact card not found.' using errcode = 'P0002';
  else
    perform public.multideck_contact_card_save(p_card);
  end if;

  update public."CRM_ContactCards"
  set "ContactCard_ShowTenantName" = coalesce((p_card ->> 'showTenantName')::boolean, true),
      "ContactCard_UpdatedAt" = now()
  where "ContactCard_ID" = v_id
    and "Company_ID" = v_context.company_id
    and "ContactCard_DeletedAt" is null;

  if not found then
    raise exception 'Contact card not found.' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke all on function public.multideck_contact_card_save_atomic(jsonb) from public, anon;
grant execute on function public.multideck_contact_card_save_atomic(jsonb) to authenticated;

/* ------------------------------------------------------------- Drive roles */

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('CRM.Drive.Read', 'Sales & CRM', 'Read CRM Drive', 'Open files and folders stored in the company CRM Drive.', false),
  ('CRM.Drive.Write', 'Sales & CRM', 'Change CRM Drive', 'Create, rename and remove files and folders in the company CRM Drive.', true)
on conflict ("sys_Permission_Value") do update
set "sys_Permission_Group" = excluded."sys_Permission_Group",
    "sys_Permission_Name" = excluded."sys_Permission_Name",
    "sys_Permission_Description" = excluded."sys_Permission_Description",
    "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

-- Viewers can inspect Drive; operators and managers can maintain it.  The
-- mapping is idempotent and does not grant access to roles introduced later.
with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'CRM.Drive.Read'),
    ('Administrator', 'CRM.Drive.Write'),
    ('Operations Manager', 'CRM.Drive.Read'),
    ('Operations Manager', 'CRM.Drive.Write'),
    ('Operator', 'CRM.Drive.Read'),
    ('Operator', 'CRM.Drive.Write'),
    ('Viewer', 'CRM.Drive.Read')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role
  on lower(role."sys_UserRole_Name") = lower(mapping.role_name)
join public."sys_Permissions" permission
  on permission."sys_Permission_Value" = mapping.permission_value
on conflict ("sys_UserRole_ID", "sys_Permission_ID") do nothing;

create or replace function public._crm_drive_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public."cmp_Users" as workspace_user
    join public."cmp_Users_Roles" as user_role
      on user_role."User_ID" = workspace_user."User_ID"
    join public."sys_UserRole_Permissions" as role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" as permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where workspace_user."User_ID" = public.app_current_workspace_user_id()
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
      and permission."sys_Permission_Value" = p_permission
  );
$$;

create or replace function public._crm_drive_require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public._crm_drive_has_permission(p_permission) then
    raise exception 'You do not have permission to use CRM Drive.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._crm_drive_has_permission(text) from public, anon, authenticated;
revoke all on function public._crm_drive_require_permission(text) from public, anon, authenticated;
grant execute on function public._crm_drive_has_permission(text) to authenticated;
grant execute on function public._crm_drive_require_permission(text) to authenticated;

-- Used from folder RLS below, so define it before the policies are compiled.
-- Security definer keeps the existence check company-scoped instead of exposing
-- a cross-company folder oracle through ordinary table permissions.
create or replace function public.crm_drive_parent_belongs_to_current_company(p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public._crm_drive_has_permission('CRM.Drive.Write')
    and exists (
      select 1
      from public."CRM_DriveFolders" as parent
      where parent."DriveFolder_ID" = p_parent_id
        and parent."Company_ID" = public.app_current_company_id()
    );
$$;

revoke all on function public.crm_drive_parent_belongs_to_current_company(uuid) from public, anon;
grant execute on function public.crm_drive_parent_belongs_to_current_company(uuid) to authenticated;

/* ------------------------------------------------------- path invariants */

-- Files are uploaded before their metadata row is inserted, so the storage
-- policy cannot require an existing row.  It can, however, require the only
-- two canonical shapes the client is allowed to create.
create or replace function public._crm_drive_storage_path_allowed(p_company_id uuid, p_path text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select p_company_id is not null
    and p_path is not null
    and p_path ~ ('^' || p_company_id::text || '/(files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}|thumbs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)$');
$$;

create or replace function public._crm_drive_file_path_allowed(p_file_id uuid, p_path text, p_thumbnail boolean)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select p_file_id is not null
    and p_path is not null
    and p_path ~ (
      '^' || case when p_thumbnail then '.*/thumbs/' else '.*/files/' end
      || p_file_id::text
      || case when p_thumbnail then '\\.webp$' else '\\.[a-z0-9]{1,8}$' end
    );
$$;

revoke all on function public._crm_drive_storage_path_allowed(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_drive_file_path_allowed(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public._crm_drive_storage_path_allowed(uuid, text) to authenticated;

-- Use path segments for the file-id check so the invariant stays readable and
-- does not depend on regular-expression escaping for the extension.
create or replace function public._crm_drive_file_path_allowed_v2(p_file_id uuid, p_path text, p_thumbnail boolean)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select p_file_id is not null
    and p_path is not null
    and case when p_thumbnail then
      split_part(p_path, '/', 2) = 'thumbs'
      and split_part(p_path, '/', 3) = p_file_id::text || '.webp'
    else
      split_part(p_path, '/', 2) = 'files'
      and split_part(p_path, '/', 3) like p_file_id::text || '.%'
      and substring(split_part(p_path, '/', 3) from length(p_file_id::text) + 2) ~ '^[a-z0-9]{1,8}$'
    end;
$$;

revoke all on function public._crm_drive_file_path_allowed_v2(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public._crm_drive_file_path_allowed_v2(uuid, text, boolean) to authenticated;

/* --------------------------------------------------------- folder policies */

drop policy if exists "Drive folders are readable inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are readable inside the company"
on public."CRM_DriveFolders" for select to authenticated
using (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Read')
);

drop policy if exists "Drive folders are created inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are created inside the company"
on public."CRM_DriveFolders" for insert to authenticated
with check (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and (
    "DriveFolder_ParentID" is null
    or public.crm_drive_parent_belongs_to_current_company("DriveFolder_ParentID")
  )
);

drop policy if exists "Drive folders are edited inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are edited inside the company"
on public."CRM_DriveFolders" for update to authenticated
using (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
)
with check (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and (
    "DriveFolder_ParentID" is null
    or public.crm_drive_parent_belongs_to_current_company("DriveFolder_ParentID")
  )
);

drop policy if exists "Drive folders are removed inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are removed inside the company"
on public."CRM_DriveFolders" for delete to authenticated
using (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
);

/* ------------------------------------------------------------ file policies */

drop policy if exists "Drive files are readable inside the company" on public."CRM_DriveFiles";
create policy "Drive files are readable inside the company"
on public."CRM_DriveFiles" for select to authenticated
using (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Read')
);

drop policy if exists "Drive files are created inside the company" on public."CRM_DriveFiles";
create policy "Drive files are created inside the company"
on public."CRM_DriveFiles" for insert to authenticated
with check (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and public._crm_drive_storage_path_allowed("Company_ID", "DriveFile_StoragePath")
  and public._crm_drive_file_path_allowed_v2("DriveFile_ID", "DriveFile_StoragePath", false)
  and ("DriveFile_ThumbnailPath" is null or (
    public._crm_drive_storage_path_allowed("Company_ID", "DriveFile_ThumbnailPath")
    and public._crm_drive_file_path_allowed_v2("DriveFile_ID", "DriveFile_ThumbnailPath", true)
  ))
  and (
    "DriveFile_FolderID" is null
    or exists (
      select 1 from public."CRM_DriveFolders" as folder
      where folder."DriveFolder_ID" = "CRM_DriveFiles"."DriveFile_FolderID"
        and folder."Company_ID" = public.app_current_company_id()
    )
  )
);

drop policy if exists "Drive files are edited inside the company" on public."CRM_DriveFiles";
create policy "Drive files are edited inside the company"
on public."CRM_DriveFiles" for update to authenticated
using (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
)
with check (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and public._crm_drive_storage_path_allowed("Company_ID", "DriveFile_StoragePath")
  and public._crm_drive_file_path_allowed_v2("DriveFile_ID", "DriveFile_StoragePath", false)
  and ("DriveFile_ThumbnailPath" is null or (
    public._crm_drive_storage_path_allowed("Company_ID", "DriveFile_ThumbnailPath")
    and public._crm_drive_file_path_allowed_v2("DriveFile_ID", "DriveFile_ThumbnailPath", true)
  ))
  and (
    "DriveFile_FolderID" is null
    or exists (
      select 1 from public."CRM_DriveFolders" as folder
      where folder."DriveFolder_ID" = "CRM_DriveFiles"."DriveFile_FolderID"
        and folder."Company_ID" = public.app_current_company_id()
    )
  )
);

drop policy if exists "Drive files are removed inside the company" on public."CRM_DriveFiles";
create policy "Drive files are removed inside the company"
on public."CRM_DriveFiles" for delete to authenticated
using (
  "Company_ID" = public.app_current_company_id()
  and public._crm_drive_has_permission('CRM.Drive.Write')
);

/* ----------------------------------------------------------- storage paths */

drop policy if exists "Company users can read drive objects" on storage.objects;
create policy "Company users can read drive objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'crm-drive'
  and public._crm_drive_has_permission('CRM.Drive.Read')
  and public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)
);

drop policy if exists "Company users can add drive objects" on storage.objects;
create policy "Company users can add drive objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'crm-drive'
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)
);

drop policy if exists "Company users can replace drive objects" on storage.objects;
create policy "Company users can replace drive objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'crm-drive'
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)
)
with check (
  bucket_id = 'crm-drive'
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)
);

drop policy if exists "Company users can remove drive objects" on storage.objects;
create policy "Company users can remove drive objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'crm-drive'
  and public._crm_drive_has_permission('CRM.Drive.Write')
  and public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)
);

/* ------------------------------------------------------------- RPC guards */

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
    coalesce(sum(file."DriveFile_SizeBytes"), 0),
    max(file."DriveFile_UpdatedAt")
  from subtree
  left join public."CRM_DriveFiles" as file
    on file."DriveFile_FolderID" = subtree.node_id
  group by subtree.root_id;
end;
$$;

create or replace function public.crm_drive_delete_folder(p_folder_id uuid)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_paths text[];
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');
  if v_company_id is null then
    raise exception 'Your account is not linked to a workspace.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public."CRM_DriveFolders" as folder
    where folder."DriveFolder_ID" = p_folder_id
      and folder."Company_ID" = v_company_id
  ) then
    raise exception 'This folder no longer exists.' using errcode = 'P0002';
  end if;

  with recursive tree as (
    select "DriveFolder_ID"
    from public."CRM_DriveFolders"
    where "DriveFolder_ID" = p_folder_id
      and "Company_ID" = v_company_id
    union all
    select child."DriveFolder_ID"
    from public."CRM_DriveFolders" as child
    join tree on child."DriveFolder_ParentID" = tree."DriveFolder_ID"
    where child."Company_ID" = v_company_id
  )
  select coalesce(array_agg(path) filter (where path is not null), array[]::text[])
  into v_paths
  from (
    select file."DriveFile_StoragePath" as path
    from public."CRM_DriveFiles" as file
    join tree on tree."DriveFolder_ID" = file."DriveFile_FolderID"
    where file."Company_ID" = v_company_id
    union all
    select file."DriveFile_ThumbnailPath"
    from public."CRM_DriveFiles" as file
    join tree on tree."DriveFolder_ID" = file."DriveFile_FolderID"
    where file."Company_ID" = v_company_id
  ) stored_objects;

  delete from public."CRM_DriveFolders"
  where "DriveFolder_ID" = p_folder_id
    and "Company_ID" = v_company_id;

  return v_paths;
end;
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_RequiredPermissionsJSON" = '["CRM.Drive.Read"]'::jsonb,
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'drive';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_RequiredPermissionsJSON" = '["CRM.Drive.Read"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'drive';

commit;
