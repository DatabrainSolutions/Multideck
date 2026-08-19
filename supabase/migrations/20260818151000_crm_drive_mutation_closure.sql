-- Close the last direct-mutation escape hatch around CRM Drive metadata.
-- Deletes must always pass through the durable cleanup queue, while folder/file
-- edits must pass through permission-checked functions rather than raw table
-- updates. Upload inserts remain available behind the existing RLS policies.

begin;

revoke update, delete on table public."CRM_DriveFolders" from authenticated;
revoke update, delete on table public."CRM_DriveFiles" from authenticated;

create or replace function public.crm_drive_update_folder(
  p_folder_id uuid,
  p_name text default null,
  p_colour_code text default null,
  p_icon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_folder public."CRM_DriveFolders"%rowtype;
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');

  if p_name is null and p_colour_code is null and p_icon_code is null then
    raise exception 'Choose a folder change to save.' using errcode = '22023';
  end if;

  update public."CRM_DriveFolders" folder
  set
    "DriveFolder_Name" = case when p_name is null then folder."DriveFolder_Name" else btrim(p_name) end,
    "DriveFolder_ColourCode" = coalesce(p_colour_code, folder."DriveFolder_ColourCode"),
    "DriveFolder_IconCode" = coalesce(p_icon_code, folder."DriveFolder_IconCode")
  where folder."DriveFolder_ID" = p_folder_id
    and folder."Company_ID" = v_company_id
  returning folder.* into v_folder;

  if not found then
    raise exception 'This folder no longer exists.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_folder);
end;
$$;

create or replace function public.crm_drive_rename_file(
  p_file_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid := public.app_current_company_id();
  v_file public."CRM_DriveFiles"%rowtype;
begin
  perform public._crm_drive_require_permission('CRM.Drive.Write');

  update public."CRM_DriveFiles" file
  set "DriveFile_Name" = btrim(p_name)
  where file."DriveFile_ID" = p_file_id
    and file."Company_ID" = v_company_id
  returning file.* into v_file;

  if not found then
    raise exception 'This file no longer exists.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_file);
end;
$$;

revoke all on function public.crm_drive_update_folder(uuid, text, text, text) from public, anon;
revoke all on function public.crm_drive_rename_file(uuid, text) from public, anon;
grant execute on function public.crm_drive_update_folder(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.crm_drive_rename_file(uuid, text) to authenticated, service_role;

-- Dexter exception: these functions preserve the existing Drive rename and
-- customise actions; they do not introduce a new data domain or autonomous
-- watch event. Dexter continues to use the same CRM.Drive permission boundary.

commit;
