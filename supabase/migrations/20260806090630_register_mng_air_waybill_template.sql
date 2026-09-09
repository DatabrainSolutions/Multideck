-- Register the carrier-specific two-page MNG Airlines Air Waybill as a normal
-- published Multideck template. The authenticated Document Studio bootstrap
-- immediately replaces this source-registration version with an immutable
-- Carbone provider version; no separate approval state is used.
do $$
declare
  actor_user_id uuid;
  template_id uuid;
begin
  select app_user."User_ID"
  into actor_user_id
  from auth.users auth_user
  join public."cmp_Users" app_user on app_user."Auth_User_ID" = auth_user.id
  where lower(auth_user.email) in (
    lower('harry@databrain.solutions'),
    lower('lee@databrain.solutions')
  )
  order by case when lower(auth_user.email) = lower('harry@databrain.solutions') then 0 else 1 end
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
    'MNG_AWB',
    'MNG Air Waybill',
    'job',
    'published',
    1,
    'carbone',
    'pdf',
    'en',
    'Two-page MNG Airlines Air Waybill with an exact carrier form and the complete Conditions of Contract.',
    jsonb_build_object(
      'outputFormats', jsonb_build_array('pdf', 'docx'),
      'source', jsonb_build_object(
        'fileName', 'MNG_Air_Waybill_Carbone_Template.docx',
        'provider', 'supabase_storage',
        'bucket', 'multideck-template-sources',
        'provisioningPath', 'system/mng-awb/v1/MNG_Air_Waybill_Carbone_Template.docx',
        'referenceFileName', 'SHEAXJ045060-891936_ABFWBJ0.pdf',
        'pageCount', 2,
        'status', 'published'
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
      "DOCBT_StatusCode" = 'published',
      "DOCBT_CurrentVersionNo" = greatest(public."DOCB_DocumentTemplates"."DOCBT_CurrentVersionNo", 1),
      "DOCBT_DefaultRenderEngineCode" = excluded."DOCBT_DefaultRenderEngineCode",
      "DOCBT_DefaultOutputFormatCode" = excluded."DOCBT_DefaultOutputFormatCode",
      "DOCBT_LanguageCode" = excluded."DOCBT_LanguageCode",
      "DOCBT_Description" = excluded."DOCBT_Description",
      "DOCBT_SettingsJSON" = public."DOCB_DocumentTemplates"."DOCBT_SettingsJSON" || excluded."DOCBT_SettingsJSON",
      "DOCBT_IsUserEditable" = true,
      "DOCBT_IsActive" = true,
      "DOCBT_UpdatedAt" = now(),
      "DOCBT_UpdatedBy" = coalesce(actor_user_id, public."DOCB_DocumentTemplates"."DOCBT_UpdatedBy")
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
      'schemaVersion', 1,
      'source', jsonb_build_object(
        'fileName', 'MNG_Air_Waybill_Carbone_Template.docx',
        'provider', 'supabase_storage',
        'bucket', 'multideck-template-sources',
        'provisioningPath', 'system/mng-awb/v1/MNG_Air_Waybill_Carbone_Template.docx',
        'referenceFileName', 'SHEAXJ045060-891936_ABFWBJ0.pdf',
        'pageCount', 2,
        'status', 'published'
      )
    ),
    'Initial two-page MNG Airlines Air Waybill recreated from SHEAXJ045060-891936_ABFWBJ0.pdf.',
    now(),
    actor_user_id,
    actor_user_id
  )
  on conflict ("DOCBTV_TemplateID", "DOCBTV_VersionNo") do update
  set "DOCBTV_TemplateSnapshotJSON" = excluded."DOCBTV_TemplateSnapshotJSON",
      "DOCBTV_ChangeReason" = excluded."DOCBTV_ChangeReason"
  where public."DOCB_TemplateVersions"."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}' is null;
end;
$$;
