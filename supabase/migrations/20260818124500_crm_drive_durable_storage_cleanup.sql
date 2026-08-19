-- Deleting Drive metadata and private Storage objects cannot share one database
-- transaction. Persist every object cleanup request before deleting metadata so
-- a storage failure is visible, retryable and never reported as fully complete.

begin;

create table if not exists public."CRM_DriveObjectCleanupQueue" (
  "DriveCleanup_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "DriveCleanup_Path" text not null,
  "DriveCleanup_RequestedAt" timestamptz not null default now(),
  "DriveCleanup_RequestedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "DriveCleanup_CleanedAt" timestamptz,
  constraint "UQ_CRM_DriveObjectCleanupQueue_company_path" unique ("Company_ID", "DriveCleanup_Path")
);

alter table public."CRM_DriveObjectCleanupQueue" enable row level security;

create index if not exists "IX_CRM_DriveObjectCleanupQueue_pending"
  on public."CRM_DriveObjectCleanupQueue"("Company_ID", "DriveCleanup_RequestedAt")
  where "DriveCleanup_CleanedAt" is null;

create or replace function public._crm_drive_enqueue_cleanup(
  p_company_id uuid,
  p_user_id uuid,
  p_paths text[]
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public."CRM_DriveObjectCleanupQueue"(
    "Company_ID", "DriveCleanup_Path", "DriveCleanup_RequestedBy"
  )
  select p_company_id, path, p_user_id
  from unnest(coalesce(p_paths, array[]::text[])) path
  where nullif(btrim(path), '') is not null
    and path like p_company_id::text || '/%'
  on conflict ("Company_ID", "DriveCleanup_Path") do update set
    "DriveCleanup_RequestedAt" = now(),
    "DriveCleanup_RequestedBy" = excluded."DriveCleanup_RequestedBy",
    "DriveCleanup_CleanedAt" = null
$$;

create or replace function public.crm_drive_delete_file(p_file_id uuid)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_user_id uuid;
  v_paths text[];
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');
  select actor."User_ID" into v_user_id
  from public."cmp_Users" actor
  where actor."Auth_User_ID" = (select auth.uid())
    and actor."Company_ID" = v_company_id
    and coalesce(actor."User_AccessStatus", 'active') = 'active'
  limit 1;

  select array_remove(array[file."DriveFile_StoragePath", file."DriveFile_ThumbnailPath"], null)
  into v_paths
  from public."CRM_DriveFiles" file
  where file."DriveFile_ID" = p_file_id
    and file."Company_ID" = v_company_id
  for update;

  if not found then
    raise exception 'This file no longer exists.' using errcode = 'P0002';
  end if;

  perform public._crm_drive_enqueue_cleanup(v_company_id, v_user_id, v_paths);
  delete from public."CRM_DriveFiles"
  where "DriveFile_ID" = p_file_id
    and "Company_ID" = v_company_id;
  return coalesce(v_paths, array[]::text[]);
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
  v_user_id uuid;
  v_paths text[];
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');
  select actor."User_ID" into v_user_id
  from public."cmp_Users" actor
  where actor."Auth_User_ID" = (select auth.uid())
    and actor."Company_ID" = v_company_id
    and coalesce(actor."User_AccessStatus", 'active') = 'active'
  limit 1;

  if not exists (
    select 1 from public."CRM_DriveFolders" folder
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
    from public."CRM_DriveFolders" child
    join tree on child."DriveFolder_ParentID" = tree."DriveFolder_ID"
    where child."Company_ID" = v_company_id
  )
  select coalesce(array_agg(path) filter (where path is not null), array[]::text[])
  into v_paths
  from (
    select file."DriveFile_StoragePath" path
    from public."CRM_DriveFiles" file
    join tree on tree."DriveFolder_ID" = file."DriveFile_FolderID"
    where file."Company_ID" = v_company_id
    union all
    select file."DriveFile_ThumbnailPath"
    from public."CRM_DriveFiles" file
    join tree on tree."DriveFolder_ID" = file."DriveFile_FolderID"
    where file."Company_ID" = v_company_id
  ) stored_objects;

  perform public._crm_drive_enqueue_cleanup(v_company_id, v_user_id, v_paths);
  delete from public."CRM_DriveFolders"
  where "DriveFolder_ID" = p_folder_id
    and "Company_ID" = v_company_id;
  return v_paths;
end;
$$;

create or replace function public.crm_drive_pending_cleanup()
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');
  return array(
    select queue."DriveCleanup_Path"
    from public."CRM_DriveObjectCleanupQueue" queue
    where queue."Company_ID" = v_company_id
      and queue."DriveCleanup_CleanedAt" is null
    order by queue."DriveCleanup_RequestedAt"
    limit 500
  );
end;
$$;

create or replace function public.crm_drive_complete_cleanup(p_paths text[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');
  update public."CRM_DriveObjectCleanupQueue" queue
  set "DriveCleanup_CleanedAt" = now()
  where queue."Company_ID" = v_company_id
    and queue."DriveCleanup_Path" = any(coalesce(p_paths, array[]::text[]))
    and queue."DriveCleanup_CleanedAt" is null;
end;
$$;

revoke all on table public."CRM_DriveObjectCleanupQueue" from public, anon, authenticated;
grant all on table public."CRM_DriveObjectCleanupQueue" to service_role;
revoke all on function public._crm_drive_enqueue_cleanup(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.crm_drive_delete_file(uuid) from public, anon;
revoke all on function public.crm_drive_delete_folder(uuid) from public, anon;
revoke all on function public.crm_drive_pending_cleanup() from public, anon;
revoke all on function public.crm_drive_complete_cleanup(text[]) from public, anon;
grant execute on function public.crm_drive_delete_file(uuid) to authenticated;
grant execute on function public.crm_drive_delete_folder(uuid) to authenticated;
grant execute on function public.crm_drive_pending_cleanup() to authenticated;
grant execute on function public.crm_drive_complete_cleanup(text[]) to authenticated;

-- Explicit Dexter exception: this queue contains internal storage-maintenance
-- work only. Operators and Dexter continue to see the existing deterministic
-- file-deleted watch event; exposing cleanup paths would leak private storage
-- structure without enabling a customer action.

commit;
