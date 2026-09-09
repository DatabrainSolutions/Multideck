-- The MAWB source and immutable Carbone version have already been saved.
-- Make it immediately available in the normal template row without a separate
-- carrier-review or approval stage in the document builder.
do $$
declare
  template_row record;
  version_row record;
begin
  select template.*
  into strict template_row
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_Code" = 'MAWB'
    and template."DOCBT_IsActive" = true
  for update;

  select version.*
  into strict version_row
  from public."DOCB_TemplateVersions" version
  where version."DOCBTV_TemplateID" = template_row."DOCBT_ID"
    and version."DOCBTV_VersionNo" = template_row."DOCBT_CurrentVersionNo"
    and version."DOCBTV_RenderEngineCode" = 'carbone'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' ~ '^[0-9a-f]{64}$'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,provider}' = 'supabase_storage'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,path}' is not null
  for update;

  update public."DOCB_TemplateVersions" version
  set "DOCBTV_StatusCode" = 'published',
      "DOCBTV_PublishedAt" = coalesce(version."DOCBTV_PublishedAt", now()),
      "DOCBTV_PublishedBy" = coalesce(version."DOCBTV_PublishedBy", template_row."DOCBT_UpdatedBy"),
      "DOCBTV_ChangeReason" = 'Master Air Waybill made available as a standard Multideck template.'
  where version."DOCBTV_ID" = version_row."DOCBTV_ID";

  update public."DOCB_DocumentTemplates" template
  set "DOCBT_StatusCode" = 'published',
      "DOCBT_Description" = 'Master Air Waybill with job-linked shipment data and the complete supplied carrier copy set.',
      "DOCBT_SettingsJSON" = jsonb_set(
        jsonb_set(
          coalesce(template."DOCBT_SettingsJSON", '{}'::jsonb),
          '{source,status}',
          '"ready"'::jsonb,
          true
        ),
        '{source,requiresCarrierApproval}',
        'false'::jsonb,
        true
      ),
      "DOCBT_UpdatedAt" = now()
  where template."DOCBT_ID" = template_row."DOCBT_ID";
exception
  when no_data_found or too_many_rows then
    raise exception 'The saved MAWB Carbone version is not ready to publish.' using errcode = '22023';
end;
$$;
