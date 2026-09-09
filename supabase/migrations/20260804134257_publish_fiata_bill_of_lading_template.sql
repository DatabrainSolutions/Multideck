-- Register the first Carbone-backed Multideck template. The Carbone reference
-- was validated against docserver.multideck.app before this migration was made.
do $$
declare
  actor_user_id uuid;
  template_id uuid;
begin
  select app_user."User_ID"
  into actor_user_id
  from auth.users auth_user
  join public."cmp_Users" app_user on app_user."Auth_User_ID" = auth_user.id
  where lower(auth_user.email) = lower('lee@databrain.solutions')
  limit 1;

  insert into public."DOCB_DocumentTemplates" (
    "DOCBT_Code",
    "DOCBT_Name",
    "DOCBT_DataScopeCode",
    "DOCBT_StatusCode",
    "DOCBT_CurrentVersionNo",
    "DOCBT_DefaultRenderEngineCode",
    "DOCBT_DefaultOutputFormatCode",
    "DOCBT_LanguageCode",
    "DOCBT_Description",
    "DOCBT_SettingsJSON",
    "DOCBT_IsSystem",
    "DOCBT_IsUserEditable",
    "DOCBT_IsActive",
    "DOCBT_CreatedBy",
    "DOCBT_UpdatedBy"
  ) values (
    'FIATA_BOL',
    'FIATA Bill of Lading',
    'job',
    'published',
    1,
    'carbone',
    'pdf',
    'en',
    'FIATA Bill of Lading with customer-selectable job content and a terms and conditions page.',
    jsonb_build_object(
      'outputFormats', jsonb_build_array('pdf', 'docx'),
      'carbone', jsonb_build_object(
        'templateId', 'f8c86a70aaf164f03b0afc4a148bfaeabef39d0bbf8d982344eaf0b29612e0bc'
      )
    ),
    false,
    true,
    true,
    actor_user_id,
    actor_user_id
  )
  on conflict ("DOCBT_Code") do update
  set "DOCBT_Name" = excluded."DOCBT_Name",
      "DOCBT_DataScopeCode" = excluded."DOCBT_DataScopeCode",
      "DOCBT_StatusCode" = excluded."DOCBT_StatusCode",
      "DOCBT_CurrentVersionNo" = excluded."DOCBT_CurrentVersionNo",
      "DOCBT_DefaultRenderEngineCode" = excluded."DOCBT_DefaultRenderEngineCode",
      "DOCBT_DefaultOutputFormatCode" = excluded."DOCBT_DefaultOutputFormatCode",
      "DOCBT_LanguageCode" = excluded."DOCBT_LanguageCode",
      "DOCBT_Description" = excluded."DOCBT_Description",
      "DOCBT_SettingsJSON" = excluded."DOCBT_SettingsJSON",
      "DOCBT_IsUserEditable" = excluded."DOCBT_IsUserEditable",
      "DOCBT_IsActive" = excluded."DOCBT_IsActive",
      "DOCBT_UpdatedAt" = now(),
      "DOCBT_UpdatedBy" = coalesce(excluded."DOCBT_UpdatedBy", public."DOCB_DocumentTemplates"."DOCBT_UpdatedBy")
  returning "DOCBT_ID" into template_id;

  insert into public."DOCB_TemplateVersions" (
    "DOCBTV_TemplateID",
    "DOCBTV_VersionNo",
    "DOCBTV_StatusCode",
    "DOCBTV_RenderEngineCode",
    "DOCBTV_OutputFormatCode",
    "DOCBTV_TemplateSnapshotJSON",
    "DOCBTV_ChangeReason",
    "DOCBTV_PublishedAt",
    "DOCBTV_PublishedBy",
    "DOCBTV_CreatedBy"
  ) values (
    template_id,
    1,
    'published',
    'carbone',
    'pdf',
    jsonb_build_object(
      'carbone', jsonb_build_object(
        'templateId', 'f8c86a70aaf164f03b0afc4a148bfaeabef39d0bbf8d982344eaf0b29612e0bc'
      ),
      'source', jsonb_build_object(
        'fileName', 'FIATA_Bill_Of_Lading_Carbone_Template.docx'
      )
    ),
    'Initial FIATA Bill of Lading template supplied for the Multideck Document Builder.',
    now(),
    actor_user_id,
    actor_user_id
  )
  on conflict ("DOCBTV_TemplateID", "DOCBTV_VersionNo") do update
  set "DOCBTV_StatusCode" = excluded."DOCBTV_StatusCode",
      "DOCBTV_RenderEngineCode" = excluded."DOCBTV_RenderEngineCode",
      "DOCBTV_OutputFormatCode" = excluded."DOCBTV_OutputFormatCode",
      "DOCBTV_TemplateSnapshotJSON" = excluded."DOCBTV_TemplateSnapshotJSON",
      "DOCBTV_ChangeReason" = excluded."DOCBTV_ChangeReason",
      "DOCBTV_PublishedAt" = excluded."DOCBTV_PublishedAt",
      "DOCBTV_PublishedBy" = coalesce(excluded."DOCBTV_PublishedBy", public."DOCB_TemplateVersions"."DOCBTV_PublishedBy");
end;
$$;
