-- The existing registration function already saves edits as drafts without
-- moving the published pointer. Extend approval to promote that pending draft.
alter function document_api.approve_studio_template_version(uuid,uuid)
  rename to approve_studio_template_version_before_review_20260925;

create function document_api.approve_studio_template_version(
  caller_auth_user_id uuid, requested_template_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  template_row record;
  version_row record;
  actor_id uuid;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'Document template approval is not authorised.' using errcode = '42501';
  end if;
  select "User_ID" into strict actor_id from public."cmp_Users"
    where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  select * into strict template_row from public."DOCB_DocumentTemplates"
    where "DOCBT_ID" = requested_template_id and "DOCBT_IsActive" and "DOCBT_IsUserEditable"
      and "DOCBT_DefaultRenderEngineCode" = 'carbone' for update;

  if template_row."DOCBT_StatusCode" = 'draft' then
    return document_api.approve_studio_template_version_before_review_20260925(
      caller_auth_user_id, requested_template_id);
  end if;
  if template_row."DOCBT_StatusCode" <> 'published' then
    raise exception 'The template is not available for approval.' using errcode = '22023';
  end if;

  select * into strict version_row from public."DOCB_TemplateVersions"
  where "DOCBTV_TemplateID" = requested_template_id
    and "DOCBTV_StatusCode" = 'draft'
    and "DOCBTV_VersionNo" > template_row."DOCBT_CurrentVersionNo"
    and "DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' ~ '^[0-9a-f]{64}$'
    and "DOCBTV_TemplateSnapshotJSON" #>> '{source,provider}' = 'supabase_storage'
    and "DOCBTV_TemplateSnapshotJSON" #>> '{source,path}' is not null
  order by "DOCBTV_VersionNo" desc limit 1 for update;

  update public."DOCB_TemplateVersions" set "DOCBTV_StatusCode" = 'published',
    "DOCBTV_PublishedAt" = now(), "DOCBTV_PublishedBy" = actor_id
  where "DOCBTV_ID" = version_row."DOCBTV_ID";
  update public."DOCB_DocumentTemplates" set
    "DOCBT_CurrentVersionNo" = version_row."DOCBTV_VersionNo",
    "DOCBT_UpdatedAt" = now(), "DOCBT_UpdatedBy" = actor_id
  where "DOCBT_ID" = requested_template_id;
  return jsonb_build_object('templateCode', template_row."DOCBT_Code",
    'templateVersion', version_row."DOCBTV_VersionNo", 'status', 'published');
exception when no_data_found or too_many_rows then
  raise exception 'No reviewed template source is ready for approval.' using errcode = '42501';
end $$;

revoke all on function document_api.approve_studio_template_version(uuid,uuid) from public,anon,authenticated;
grant execute on function document_api.approve_studio_template_version(uuid,uuid) to service_role;
