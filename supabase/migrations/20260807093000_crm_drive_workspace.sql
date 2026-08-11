-- Drive: the company's own private file workspace. Folders nest, each one carries
-- an operator-chosen colour and icon, and every uploaded file keeps a small
-- pre-rendered preview so a folder can paint its thumbnails before the signed
-- image URLs have finished loading.
--
-- Binary content lives in the private `crm-drive` bucket under the company's own
-- path prefix. These tables hold only metadata, and both the tables and the
-- bucket are scoped to the caller's company.

begin;

-- The workspace user behind the current Auth session. Used as a column default so
-- "who added this" is recorded by the database rather than trusted from the browser.
create or replace function public.app_current_workspace_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select "User_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid()) limit 1 $$;

revoke all on function public.app_current_workspace_user_id() from public, anon;
grant execute on function public.app_current_workspace_user_id() to authenticated;

/* ------------------------------------------------------------------- folders */

create table if not exists public."CRM_DriveFolders" (
  "DriveFolder_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null default public.app_current_company_id()
    references public."cmp_Company"("Company_ID") on delete cascade,
  "DriveFolder_ParentID" uuid references public."CRM_DriveFolders"("DriveFolder_ID") on delete cascade,
  "DriveFolder_Name" text not null,
  "DriveFolder_ColourCode" text not null default 'teal',
  "DriveFolder_IconCode" text not null default 'folder',
  "DriveFolder_CreatedBy" uuid default public.app_current_workspace_user_id()
    references public."cmp_Users"("User_ID") on delete set null,
  "DriveFolder_CreatedAt" timestamptz not null default now(),
  "DriveFolder_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CRM_DriveFolders_Name"
    check (length(btrim("DriveFolder_Name")) between 1 and 120),
  constraint "CK_CRM_DriveFolders_ColourCode"
    check ("DriveFolder_ColourCode" = any (array['teal','meadow','sky','ocean','indigo','violet','plum','rose','ember','graphite'])),
  constraint "CK_CRM_DriveFolders_IconCode"
    check ("DriveFolder_IconCode" = any (array['folder','image','file-text','palette','presentation','video','archive','sparkles','shield','tag','globe','package'])),
  constraint "CK_CRM_DriveFolders_NotItsOwnParent"
    check ("DriveFolder_ParentID" is null or "DriveFolder_ParentID" <> "DriveFolder_ID")
);

-- Two folders with the same name in the same place is an operator mistake, not a
-- feature: the drive would show two identical tiles with no way to tell them
-- apart. The root is keyed on a fixed sentinel because a null parent would make
-- every root folder unique to Postgres.
create unique index if not exists "UX_CRM_DriveFolders_sibling_name"
  on public."CRM_DriveFolders" (
    "Company_ID",
    coalesce("DriveFolder_ParentID", '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim("DriveFolder_Name"))
  );

create index if not exists "IX_CRM_DriveFolders_company_parent"
  on public."CRM_DriveFolders" ("Company_ID", "DriveFolder_ParentID", "DriveFolder_Name");

create index if not exists "IX_CRM_DriveFolders_created_by"
  on public."CRM_DriveFolders" ("DriveFolder_CreatedBy");

/* --------------------------------------------------------------------- files */

create table if not exists public."CRM_DriveFiles" (
  "DriveFile_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null default public.app_current_company_id()
    references public."cmp_Company"("Company_ID") on delete cascade,
  "DriveFile_FolderID" uuid references public."CRM_DriveFolders"("DriveFolder_ID") on delete cascade,
  "DriveFile_Name" text not null,
  "DriveFile_MimeType" text not null,
  "DriveFile_SizeBytes" bigint not null,
  "DriveFile_StoragePath" text not null unique,
  "DriveFile_ThumbnailPath" text,
  -- A ~1 KB blurred WebP written at upload time. It ships with the folder
  -- listing so tiles can paint their real content on first frame instead of
  -- flashing an empty box while signed thumbnail URLs are issued.
  "DriveFile_PreviewSeed" text,
  "DriveFile_PreviewWidth" integer,
  "DriveFile_PreviewHeight" integer,
  "DriveFile_CreatedBy" uuid default public.app_current_workspace_user_id()
    references public."cmp_Users"("User_ID") on delete set null,
  "DriveFile_CreatedAt" timestamptz not null default now(),
  "DriveFile_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CRM_DriveFiles_Name"
    check (length(btrim("DriveFile_Name")) between 1 and 255),
  constraint "CK_CRM_DriveFiles_MimeType"
    check ("DriveFile_MimeType" ~ '^[a-z]+/[a-zA-Z0-9.+_-]+$'),
  constraint "CK_CRM_DriveFiles_SizeBytes"
    check ("DriveFile_SizeBytes" between 1 and 52428800),
  constraint "CK_CRM_DriveFiles_PreviewSeed"
    check ("DriveFile_PreviewSeed" is null or ("DriveFile_PreviewSeed" like 'data:image/%' and length("DriveFile_PreviewSeed") <= 4000)),
  constraint "CK_CRM_DriveFiles_PreviewSize"
    check (
      ("DriveFile_PreviewWidth" is null and "DriveFile_PreviewHeight" is null)
      or ("DriveFile_PreviewWidth" between 1 and 30000 and "DriveFile_PreviewHeight" between 1 and 30000)
    )
);

create index if not exists "IX_CRM_DriveFiles_company_folder"
  on public."CRM_DriveFiles" ("Company_ID", "DriveFile_FolderID", "DriveFile_CreatedAt" desc);

create index if not exists "IX_CRM_DriveFiles_created_by"
  on public."CRM_DriveFiles" ("DriveFile_CreatedBy");

/* ------------------------------------------------------------------- touching */

create or replace function public._crm_drive_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'CRM_DriveFolders' then
    new."DriveFolder_UpdatedAt" := now();
    new."Company_ID" := old."Company_ID";
  else
    new."DriveFile_UpdatedAt" := now();
    new."Company_ID" := old."Company_ID";
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_DriveFolders_touch" on public."CRM_DriveFolders";
create trigger "TR_CRM_DriveFolders_touch"
  before update on public."CRM_DriveFolders"
  for each row execute function public._crm_drive_touch();

drop trigger if exists "TR_CRM_DriveFiles_touch" on public."CRM_DriveFiles";
create trigger "TR_CRM_DriveFiles_touch"
  before update on public."CRM_DriveFiles"
  for each row execute function public._crm_drive_touch();

/* ------------------------------------------------------------- table security */

alter table public."CRM_DriveFolders" enable row level security;
alter table public."CRM_DriveFiles" enable row level security;

revoke all on table public."CRM_DriveFolders" from public, anon;
revoke all on table public."CRM_DriveFiles" from public, anon;
grant select, insert, update, delete on table public."CRM_DriveFolders" to authenticated;
grant select, insert, update, delete on table public."CRM_DriveFiles" to authenticated;

drop policy if exists "Drive folders are readable inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are readable inside the company"
on public."CRM_DriveFolders" for select to authenticated
using ("Company_ID" = public.app_current_company_id());

drop policy if exists "Drive folders are created inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are created inside the company"
on public."CRM_DriveFolders" for insert to authenticated
with check (
  "Company_ID" = public.app_current_company_id()
  and (
    "DriveFolder_ParentID" is null
    -- Qualified by table name on purpose: the subquery aliases the same table, so an
    -- unqualified column here would resolve to the parent row instead of the new one.
    or exists (
      select 1 from public."CRM_DriveFolders" as parent
      where parent."DriveFolder_ID" = "CRM_DriveFolders"."DriveFolder_ParentID"
        and parent."Company_ID" = public.app_current_company_id()
    )
  )
);

drop policy if exists "Drive folders are edited inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are edited inside the company"
on public."CRM_DriveFolders" for update to authenticated
using ("Company_ID" = public.app_current_company_id())
with check ("Company_ID" = public.app_current_company_id());

drop policy if exists "Drive folders are removed inside the company" on public."CRM_DriveFolders";
create policy "Drive folders are removed inside the company"
on public."CRM_DriveFolders" for delete to authenticated
using ("Company_ID" = public.app_current_company_id());

drop policy if exists "Drive files are readable inside the company" on public."CRM_DriveFiles";
create policy "Drive files are readable inside the company"
on public."CRM_DriveFiles" for select to authenticated
using ("Company_ID" = public.app_current_company_id());

drop policy if exists "Drive files are created inside the company" on public."CRM_DriveFiles";
create policy "Drive files are created inside the company"
on public."CRM_DriveFiles" for insert to authenticated
with check (
  "Company_ID" = public.app_current_company_id()
  and "DriveFile_StoragePath" like public.app_current_company_id()::text || '/%'
  and ("DriveFile_ThumbnailPath" is null or "DriveFile_ThumbnailPath" like public.app_current_company_id()::text || '/%')
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
using ("Company_ID" = public.app_current_company_id())
with check ("Company_ID" = public.app_current_company_id());

drop policy if exists "Drive files are removed inside the company" on public."CRM_DriveFiles";
create policy "Drive files are removed inside the company"
on public."CRM_DriveFiles" for delete to authenticated
using ("Company_ID" = public.app_current_company_id());

/* ----------------------------------------------------------- storage security */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-drive',
  'crm-drive',
  false,
  52428800,
  array[
    'image/png','image/jpeg','image/webp','image/gif','image/avif','image/svg+xml','image/heic','image/tiff',
    'application/pdf','application/postscript','image/vnd.adobe.photoshop',
    'video/mp4','video/quicktime','video/webm',
    'text/plain','text/csv','application/json','application/zip',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'font/woff2','font/ttf','font/otf'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Company users can read drive objects" on storage.objects;
create policy "Company users can read drive objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'crm-drive'
  and (storage.foldername(name))[1] = public.app_current_company_id()::text
);

drop policy if exists "Company users can add drive objects" on storage.objects;
create policy "Company users can add drive objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'crm-drive'
  and (storage.foldername(name))[1] = public.app_current_company_id()::text
);

drop policy if exists "Company users can replace drive objects" on storage.objects;
create policy "Company users can replace drive objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'crm-drive'
  and (storage.foldername(name))[1] = public.app_current_company_id()::text
)
with check (
  bucket_id = 'crm-drive'
  and (storage.foldername(name))[1] = public.app_current_company_id()::text
);

drop policy if exists "Company users can remove drive objects" on storage.objects;
create policy "Company users can remove drive objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'crm-drive'
  and (storage.foldername(name))[1] = public.app_current_company_id()::text
);

/* --------------------------------------------------------------- folder stats */

-- What a folder tile has to say — how much is inside, and when it last changed —
-- counts the whole subtree, so it comes back in one round trip rather than one
-- request per tile.
create or replace function public.crm_drive_folder_stats(p_parent_id uuid default null)
returns table (
  "folderId" uuid,
  "folderCount" bigint,
  "fileCount" bigint,
  "byteTotal" bigint,
  "lastActivityAt" timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.crm_drive_folder_stats(uuid) from public, anon;
grant execute on function public.crm_drive_folder_stats(uuid) to authenticated;

/* ------------------------------------------------------------ folder deletion */

-- Deleting a folder cascades its rows, which would leave the stored objects
-- behind. The paths come back to the caller in the same round trip so the
-- browser can clear the bucket immediately after.
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
  select coalesce(
    array_agg(path) filter (where path is not null),
    array[]::text[]
  )
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

revoke all on function public.crm_drive_delete_folder(uuid) from public, anon;
grant execute on function public.crm_drive_delete_folder(uuid) to authenticated;

/* --------------------------------------------------------- Dexter read parity */

create or replace function public.multideck_dexter_domain_drive(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(row_data order by sort_updated desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', file."DriveFile_ID",
        'name', file."DriveFile_Name",
        'folder', coalesce(folder."DriveFolder_Name", 'Drive root'),
        'folderId', file."DriveFile_FolderID",
        'mimeType', file."DriveFile_MimeType",
        'sizeBytes', file."DriveFile_SizeBytes",
        'updatedAt', file."DriveFile_UpdatedAt",
        'addedBy', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), '')
      ) as row_data,
      file."DriveFile_UpdatedAt" as sort_updated
    from public."CRM_DriveFiles" as file
    left join public."CRM_DriveFolders" as folder
      on folder."DriveFolder_ID" = file."DriveFile_FolderID"
    left join public."cmp_Users" as owner
      on owner."User_ID" = file."DriveFile_CreatedBy"
    where file."Company_ID" = p_company_id
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', file."DriveFile_Name", folder."DriveFolder_Name", file."DriveFile_MimeType")
             ilike '%' || btrim(p_search) || '%'
      )
    order by file."DriveFile_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

revoke all on function public.multideck_dexter_domain_drive(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code",
  "AIDexterDomain_Name",
  "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt"
)
values (
  'drive',
  'Drive',
  'Files and folders stored in the company Drive, with the folder they sit in, size, type and who added them.',
  'multideck_dexter_domain_drive',
  38,
  true,
  now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

/* -------------------------------------------------------- Dexter watch parity */

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code",
  "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder"
)
values (
  'drive',
  'Drive',
  'Files added to or removed from a Drive folder, and new folders.',
  '["changeType","fileName","folderName","folderId","mimeType","sizeBytes"]',
  38
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now();

-- Watch evaluation stays event-driven: the row change itself writes the signal,
-- and nothing polls a model while the watch is idle.
create or replace function public._crm_drive_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_source_id uuid;
  v_folder_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'CRM_DriveFiles' then
    if tg_op = 'INSERT' then
      v_company_id := new."Company_ID";
      v_source_id := new."DriveFile_ID";
      v_folder_id := new."DriveFile_FolderID";
      v_new := jsonb_build_object(
        'changeType', 'file_added',
        'fileName', new."DriveFile_Name",
        'mimeType', new."DriveFile_MimeType",
        'sizeBytes', new."DriveFile_SizeBytes"
      );
    else
      v_company_id := old."Company_ID";
      v_source_id := old."DriveFile_ID";
      v_folder_id := old."DriveFile_FolderID";
      v_old := jsonb_build_object('fileName', old."DriveFile_Name");
      v_new := jsonb_build_object('changeType', 'file_removed', 'fileName', old."DriveFile_Name");
    end if;
  else
    v_company_id := new."Company_ID";
    v_source_id := new."DriveFolder_ID";
    v_folder_id := new."DriveFolder_ID";
    v_new := jsonb_build_object('changeType', 'folder_added', 'folderName', new."DriveFolder_Name");
  end if;

  if v_company_id is not null and exists (
    select 1 from public."AI_DexterWatches" as watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'drive'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_folder_id)
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID",
      "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON",
      "AIDexterWatchSignal_NewJSON"
    )
    values (
      v_company_id,
      'drive',
      tg_table_name,
      v_source_id,
      v_old,
      v_new
        || jsonb_build_object(
             'folderId', v_folder_id,
             'folderName', coalesce(
               (select folder."DriveFolder_Name" from public."CRM_DriveFolders" as folder where folder."DriveFolder_ID" = v_folder_id),
               'Drive root'
             )
           )
    );
  end if;

  return null;
end;
$$;

revoke all on function public._crm_drive_watch_signal() from public, anon, authenticated;

drop trigger if exists "TR_CRM_DriveFiles_dexter_watch" on public."CRM_DriveFiles";
create trigger "TR_CRM_DriveFiles_dexter_watch"
  after insert or delete on public."CRM_DriveFiles"
  for each row execute function public._crm_drive_watch_signal();

drop trigger if exists "TR_CRM_DriveFolders_dexter_watch" on public."CRM_DriveFolders";
create trigger "TR_CRM_DriveFolders_dexter_watch"
  after insert on public."CRM_DriveFolders"
  for each row execute function public._crm_drive_watch_signal();

comment on table public."CRM_DriveFolders" is 'Drive folders: the company''s own nested file structure, with a chosen colour and icon per folder.';
comment on table public."CRM_DriveFiles" is 'Drive files: metadata for private objects in the crm-drive bucket, including a small inline preview seed for instant thumbnails.';

commit;
