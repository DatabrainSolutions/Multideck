-- Job-free Word layout editing for template managers. Reading a source never
-- changes the approved version or makes a draft available for generation.
create function document_api.studio_template_layout_source(
  caller_auth_user_id uuid, requested_template_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected record;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage')
     or not exists (
       select 1 from public."cmp_Users"
       where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active'
     ) then
    raise exception 'Document template management is not authorised.' using errcode = '42501';
  end if;

  select template."DOCBT_Code" template_code, version."DOCBTV_VersionNo" version_no,
    version."DOCBTV_StatusCode" status_code,
    version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}' provider_template_id,
    version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' provider_version_id,
    stored."DOCStoredObject_Container" bucket, stored."DOCStoredObject_BlobName" path,
    stored."DOCStoredObject_OriginalFileName" file_name, stored."DOCStoredObject_MimeType" mime_type
  into selected
  from public."DOCB_DocumentTemplates" template
  join lateral (
    select candidate.* from public."DOCB_TemplateVersions" candidate
    where candidate."DOCBTV_TemplateID" = template."DOCBT_ID"
      and (
        (candidate."DOCBTV_StatusCode" = 'draft' and (
          template."DOCBT_StatusCode" = 'draft'
          or candidate."DOCBTV_VersionNo" > template."DOCBT_CurrentVersionNo"
        ))
        or (template."DOCBT_StatusCode" = 'published'
          and candidate."DOCBTV_StatusCode" = 'published'
          and candidate."DOCBTV_VersionNo" = template."DOCBT_CurrentVersionNo")
      )
    order by (candidate."DOCBTV_StatusCode" = 'draft') desc,
      candidate."DOCBTV_VersionNo" desc limit 1
  ) version on true
  join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" =
    nullif(version."DOCBTV_TemplateSnapshotJSON" #>> '{source,storedObjectId}', '')::uuid
  where template."DOCBT_ID" = requested_template_id
    and template."DOCBT_IsActive" and template."DOCBT_IsUserEditable"
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
    and template."DOCBT_StatusCode" in ('draft', 'published')
    and (template."DOCBT_OrgOfficeID" is null or exists (
      select 1 from public."cmp_Users" actor
      join public."cmp_Users_Offices" membership on membership."User_ID" = actor."User_ID"
      join public."cmp_Offices" office on office."Office_ID" = membership."Office_ID"
      where actor."Auth_User_ID" = caller_auth_user_id
        and office."Company_ID" = actor."Company_ID"
        and office."Office_ID" = template."DOCBT_OrgOfficeID"
    ))
    and stored."DOCStoredObject_AggregateType" = 'document_template_version_source'
    and stored."DOCStoredObject_AggregateID" = version."DOCBTV_ID"
    and stored."DOCStoredObject_Container" = 'multideck-template-sources'
    and stored."DOCStoredObject_StatusCode" = 'active'
    and stored."DOCStoredObject_DeletedAt" is null;
  if not found then return null; end if;

  return jsonb_build_object('templateCode', selected.template_code,
    'multideckVersion', selected.version_no, 'status', selected.status_code,
    'carboneTemplateId', selected.provider_template_id,
    'carboneVersionId', selected.provider_version_id,
    'bucket', selected.bucket, 'path', selected.path,
    'fileName', selected.file_name, 'mimeType', selected.mime_type);
end $$;

revoke all on function document_api.studio_template_layout_source(uuid,uuid) from public,anon,authenticated;
grant execute on function document_api.studio_template_layout_source(uuid,uuid) to service_role;
