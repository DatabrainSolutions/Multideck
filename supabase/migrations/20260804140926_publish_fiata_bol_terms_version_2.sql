-- Publish the FIATA Bill of Lading template that includes the Standard
-- Conditions (1992) as real text on page 2. Version 1 remains available as a
-- rollback; only the template's current version pointer advances to version 2.
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

  select "DOCBT_ID"
  into template_id
  from public."DOCB_DocumentTemplates"
  where "DOCBT_Code" = 'FIATA_BOL'
  for update;

  if template_id is null then
    raise exception 'FIATA_BOL must be registered before publishing version 2';
  end if;

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
    2,
    'published',
    'carbone',
    'pdf',
    jsonb_build_object(
      'carbone', jsonb_build_object(
        'templateId', '1479694513787142653',
        'versionId', '7daa1ccea2f3fa7c76470589e501c3973d0f3aa65c3391c1c4cc706bb33f1513'
      ),
      'source', jsonb_build_object(
        'fileName', 'FIATA_Bill_Of_Lading_Carbone_Template_v2_with_terms.docx',
        'sha256', '9952808246e6b881e24388b421ad917ca2f142c294a193efcfd020895964eeca'
      ),
      'terms', jsonb_build_object(
        'title', 'Standard Conditions (1992) governing the FIATA MULTIMODAL TRANSPORT BILL OF LADING',
        'page', 2,
        'format', 'three-column-editable-text'
      )
    ),
    'Added the complete FIATA Standard Conditions (1992) as editable text on page 2 while preserving all page 1 Carbone tags.',
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

  update public."DOCB_DocumentTemplates"
  set "DOCBT_CurrentVersionNo" = 2,
      "DOCBT_StatusCode" = 'published',
      "DOCBT_Description" = 'FIATA Bill of Lading with customer-selectable job content and the complete Standard Conditions (1992) on page 2.',
      "DOCBT_SettingsJSON" = jsonb_set(
        jsonb_set(
          coalesce("DOCBT_SettingsJSON", '{}'::jsonb),
          '{outputFormats}',
          jsonb_build_array('pdf', 'docx'),
          true
        ),
        '{carbone}',
        jsonb_build_object(
          'templateId', '1479694513787142653',
          'versionId', '7daa1ccea2f3fa7c76470589e501c3973d0f3aa65c3391c1c4cc706bb33f1513'
        ),
        true
      ),
      "DOCBT_IsActive" = true,
      "DOCBT_UpdatedAt" = now(),
      "DOCBT_UpdatedBy" = coalesce(actor_user_id, "DOCBT_UpdatedBy")
  where "DOCBT_ID" = template_id;
end;
$$;
