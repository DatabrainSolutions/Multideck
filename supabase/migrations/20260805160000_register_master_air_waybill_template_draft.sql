-- Register the carrier-review MAWB source without making it available for
-- operational rendering. A Carbone provider template/version and carrier
-- approval are required before this record may be published.
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
    'MAWB',
    'Master Air Waybill',
    'job',
    'draft',
    1,
    'carbone',
    'pdf',
    'en',
    'Carrier-review Master Air Waybill. It is not available for issue until carrier terms, commercial fields and signatory controls are approved.',
    jsonb_build_object(
      'outputFormats', jsonb_build_array('pdf', 'docx'),
      'source', jsonb_build_object(
        'fileName', 'Master_Air_Waybill_Carbone_Template.docx',
        'provider', 'supabase_storage',
        'bucket', 'multideck-template-sources',
        'provisioningPath', 'system/mawb/v1/Master_Air_Waybill_Carbone_Template.docx',
        'status', 'carrier-review',
        'requiresCarrierApproval', true,
        'requiresCarboneProviderVersion', true
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
      "DOCBT_Description" = excluded."DOCBT_Description",
      "DOCBT_SettingsJSON" = excluded."DOCBT_SettingsJSON",
      "DOCBT_IsUserEditable" = excluded."DOCBT_IsUserEditable",
      "DOCBT_UpdatedAt" = now(),
      "DOCBT_UpdatedBy" = coalesce(excluded."DOCBT_UpdatedBy", public."DOCB_DocumentTemplates"."DOCBT_UpdatedBy")
  where public."DOCB_DocumentTemplates"."DOCBT_StatusCode" = 'draft'
  returning "DOCBT_ID" into template_id;

  if template_id is null then
    select "DOCBT_ID"
    into template_id
    from public."DOCB_DocumentTemplates"
    where "DOCBT_Code" = 'MAWB'
      and "DOCBT_StatusCode" = 'draft';
  end if;

  if template_id is null then
    return;
  end if;

  insert into public."DOCB_TemplateVersions" (
    "DOCBTV_TemplateID",
    "DOCBTV_VersionNo",
    "DOCBTV_StatusCode",
    "DOCBTV_RenderEngineCode",
    "DOCBTV_OutputFormatCode",
    "DOCBTV_TemplateSnapshotJSON",
    "DOCBTV_ChangeReason",
    "DOCBTV_CreatedBy"
  ) values (
    template_id,
    1,
    'draft',
    'carbone',
    'pdf',
    jsonb_build_object(
      'schemaVersion', 1,
      'source', jsonb_build_object(
        'fileName', 'Master_Air_Waybill_Carbone_Template.docx',
        'provider', 'supabase_storage',
        'bucket', 'multideck-template-sources',
        'provisioningPath', 'system/mawb/v1/Master_Air_Waybill_Carbone_Template.docx',
        'status', 'carrier-review'
      )
    ),
    'Initial MAWB Carbone source recreated from SHEAXJ045060-259781_MAWBPP8T.pdf. Pending carrier approval and provider upload.',
    actor_user_id
  )
  on conflict ("DOCBTV_TemplateID", "DOCBTV_VersionNo") do update
  set "DOCBTV_TemplateSnapshotJSON" = excluded."DOCBTV_TemplateSnapshotJSON",
      "DOCBTV_ChangeReason" = excluded."DOCBTV_ChangeReason"
  where public."DOCB_TemplateVersions"."DOCBTV_StatusCode" = 'draft';
end;
$$;
