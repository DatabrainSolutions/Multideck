-- Approval is an explicit template-manager action. It promotes only the saved
-- Multideck version that has both a private source object and immutable
-- Carbone version reference; ordinary document users never approve templates.
create or replace function document_api.approve_studio_template_version(
  caller_auth_user_id uuid,
  requested_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user_id uuid;
  selected_template record;
  selected_version record;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'document template approval is not authorised' using errcode = '42501';
  end if;

  select user_row."User_ID"
  into strict app_user_id
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  select template.*
  into strict selected_template
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_ID" = requested_template_id
    and template."DOCBT_StatusCode" = 'draft'
    and template."DOCBT_IsActive" = true
    and template."DOCBT_IsUserEditable" = true
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
  for update;

  select version.*
  into strict selected_version
  from public."DOCB_TemplateVersions" version
  where version."DOCBTV_TemplateID" = selected_template."DOCBT_ID"
    and version."DOCBTV_VersionNo" = selected_template."DOCBT_CurrentVersionNo"
    and version."DOCBTV_StatusCode" = 'draft'
    and version."DOCBTV_RenderEngineCode" = 'carbone'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' ~ '^[0-9a-f]{64}$'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,provider}' = 'supabase_storage'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,path}' is not null
  for update;

  update public."DOCB_TemplateVersions" version
  set "DOCBTV_StatusCode" = 'published',
      "DOCBTV_PublishedAt" = now(),
      "DOCBTV_PublishedBy" = app_user_id,
      "DOCBTV_ChangeReason" = coalesce(version."DOCBTV_ChangeReason", 'Approved in the Multideck document builder.')
  where version."DOCBTV_ID" = selected_version."DOCBTV_ID";

  update public."DOCB_DocumentTemplates" template
  set "DOCBT_StatusCode" = 'published',
      "DOCBT_CurrentVersionNo" = selected_version."DOCBTV_VersionNo",
      "DOCBT_UpdatedAt" = now(),
      "DOCBT_UpdatedBy" = app_user_id
  where template."DOCBT_ID" = selected_template."DOCBT_ID";

  return jsonb_build_object(
    'templateCode', selected_template."DOCBT_Code",
    'templateVersion', selected_version."DOCBTV_VersionNo",
    'status', 'published'
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'document template approval is not authorised' using errcode = '42501';
end;
$$;

revoke all on function document_api.approve_studio_template_version(uuid, uuid) from public, anon, authenticated;
grant execute on function document_api.approve_studio_template_version(uuid, uuid) to service_role;
