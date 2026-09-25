-- Managers can reopen only a saved draft source from this tenant's private
-- template bucket. Published source versions remain immutable.
create function document_api.studio_template_draft_source(
  caller_auth_user_id uuid, requested_template_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected record;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'Document template management is not authorised.' using errcode = '42501';
  end if;
  select template."DOCBT_Code" template_code, version."DOCBTV_VersionNo" version_no,
    version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}' provider_template_id,
    version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' provider_version_id,
    stored."DOCStoredObject_Container" bucket, stored."DOCStoredObject_BlobName" path
  into selected
  from public."DOCB_DocumentTemplates" template
  join public."DOCB_TemplateVersions" version on version."DOCBTV_TemplateID" = template."DOCBT_ID"
  join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" =
    nullif(version."DOCBTV_TemplateSnapshotJSON" #>> '{source,storedObjectId}', '')::uuid
  where template."DOCBT_ID" = requested_template_id
    and template."DOCBT_IsActive" and template."DOCBT_IsUserEditable"
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
    and version."DOCBTV_StatusCode" = 'draft'
    and stored."DOCStoredObject_AggregateType" = 'document_template_version_source'
    and stored."DOCStoredObject_AggregateID" = version."DOCBTV_ID"
    and stored."DOCStoredObject_Container" = 'multideck-template-sources'
    and stored."DOCStoredObject_StatusCode" = 'active'
    and stored."DOCStoredObject_DeletedAt" is null
  order by version."DOCBTV_VersionNo" desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('templateCode', selected.template_code,
    'multideckVersion', selected.version_no,
    'carboneTemplateId', selected.provider_template_id,
    'carboneVersionId', selected.provider_version_id,
    'bucket', selected.bucket, 'path', selected.path);
end $$;

revoke all on function document_api.studio_template_draft_source(uuid,uuid) from public,anon,authenticated;
grant execute on function document_api.studio_template_draft_source(uuid,uuid) to service_role;
