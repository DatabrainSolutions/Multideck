-- Saving an edited source for an already-published template is a replacement
-- workflow, not a separate approval workflow. Keep draft behavior for any
-- genuinely unpublished template, but make a saved published template version
-- immediately current and usable.
create or replace function document_api.register_studio_template_version(
  caller_auth_user_id uuid,
  requested_template_id uuid,
  provider_template_id text,
  provider_version_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user_id uuid;
  selected_template record;
  matching_version record;
  next_version_no integer;
  saved_status text;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'document template management is not authorised' using errcode = '42501';
  end if;
  if provider_template_id !~ '^[0-9]{1,20}$'
     or provider_version_id !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid Carbone template identifiers' using errcode = '22023';
  end if;

  select user_row."User_ID"
  into strict app_user_id
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  select template.*
  into strict selected_template
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_ID" = requested_template_id
    and template."DOCBT_IsActive" = true
    and template."DOCBT_IsUserEditable" = true
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
  for update;

  saved_status := case
    when selected_template."DOCBT_StatusCode" = 'published' then 'published'
    else 'draft'
  end;

  select version."DOCBTV_ID", version."DOCBTV_VersionNo", version."DOCBTV_StatusCode"
  into matching_version
  from public."DOCB_TemplateVersions" version
  where version."DOCBTV_TemplateID" = selected_template."DOCBT_ID"
    and coalesce(
      version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}',
      case
        when version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}' ~ '^[0-9a-f]{64}$'
          then version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}'
      end
    ) = provider_version_id
  order by version."DOCBTV_VersionNo" desc
  limit 1;

  if matching_version."DOCBTV_ID" is not null then
    update public."DOCB_TemplateVersions" version
    set "DOCBTV_StatusCode" = case
          when saved_status = 'published' then 'published'
          else version."DOCBTV_StatusCode"
        end,
        "DOCBTV_PublishedAt" = case
          when saved_status = 'published' then coalesce(version."DOCBTV_PublishedAt", now())
          else version."DOCBTV_PublishedAt"
        end,
        "DOCBTV_PublishedBy" = case
          when saved_status = 'published' then coalesce(version."DOCBTV_PublishedBy", app_user_id)
          else version."DOCBTV_PublishedBy"
        end,
        "DOCBTV_TemplateSnapshotJSON" = version."DOCBTV_TemplateSnapshotJSON" || jsonb_build_object(
          'carbone', coalesce(version."DOCBTV_TemplateSnapshotJSON" -> 'carbone', '{}'::jsonb) || jsonb_build_object(
            'templateId', provider_template_id,
            'versionId', provider_version_id
          )
        )
    where version."DOCBTV_ID" = matching_version."DOCBTV_ID";

    next_version_no := matching_version."DOCBTV_VersionNo";
  else
    select coalesce(max(version."DOCBTV_VersionNo"), 0) + 1
    into next_version_no
    from public."DOCB_TemplateVersions" version
    where version."DOCBTV_TemplateID" = selected_template."DOCBT_ID";

    insert into public."DOCB_TemplateVersions" (
      "DOCBTV_TemplateID",
      "DOCBTV_VersionNo",
      "DOCBTV_StatusCode",
      "DOCBTV_RenderEngineCode",
      "DOCBTV_OutputFormatCode",
      "DOCBTV_TemplateSnapshotJSON",
      "DOCBTV_ChangeReason",
      "DOCBTV_CreatedBy",
      "DOCBTV_PublishedAt",
      "DOCBTV_PublishedBy"
    ) values (
      selected_template."DOCBT_ID",
      next_version_no,
      saved_status,
      'carbone',
      selected_template."DOCBT_DefaultOutputFormatCode",
      jsonb_build_object(
        'carbone', jsonb_build_object(
          'templateId', provider_template_id,
          'versionId', provider_version_id
        ),
        'source', jsonb_build_object(
          'origin', 'multideck-document-builder',
          'savedAt', now()
        )
      ),
      case
        when saved_status = 'published' then 'Saved as the current Multideck template version.'
        else 'Saved from the Multideck document builder.'
      end,
      app_user_id,
      case when saved_status = 'published' then now() else null end,
      case when saved_status = 'published' then app_user_id else null end
    );
  end if;

  update public."DOCB_DocumentTemplates" template
  set "DOCBT_CurrentVersionNo" = case
        when saved_status = 'published' then next_version_no
        else template."DOCBT_CurrentVersionNo"
      end,
      "DOCBT_SettingsJSON" = template."DOCBT_SettingsJSON" || jsonb_build_object(
        'carbone', coalesce(template."DOCBT_SettingsJSON" -> 'carbone', '{}'::jsonb) || jsonb_build_object(
          'templateId', provider_template_id
        )
      ),
      "DOCBT_UpdatedAt" = now(),
      "DOCBT_UpdatedBy" = app_user_id
  where template."DOCBT_ID" = selected_template."DOCBT_ID";

  return jsonb_build_object(
    'multideckTemplateId', selected_template."DOCBT_ID",
    'templateCode', selected_template."DOCBT_Code",
    'carboneTemplateId', provider_template_id,
    'carboneVersionId', provider_version_id,
    'multideckVersion', next_version_no,
    'status', saved_status
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'document template management is not authorised' using errcode = '42501';
end;
$$;

-- Promote the already-saved MAWB source that triggered this migration. It has
-- an immutable provider version and a private Supabase Storage source record.
do $$
declare
  template_row record;
  latest_version record;
begin
  select template.*
  into strict template_row
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_Code" = 'MAWB'
    and template."DOCBT_StatusCode" = 'published'
    and template."DOCBT_IsActive" = true
  for update;

  select version.*
  into strict latest_version
  from public."DOCB_TemplateVersions" version
  where version."DOCBTV_TemplateID" = template_row."DOCBT_ID"
    and version."DOCBTV_RenderEngineCode" = 'carbone'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' ~ '^[0-9a-f]{64}$'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,provider}' = 'supabase_storage'
    and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,path}' is not null
  order by version."DOCBTV_VersionNo" desc
  limit 1
  for update;

  update public."DOCB_TemplateVersions" version
  set "DOCBTV_StatusCode" = 'published',
      "DOCBTV_PublishedAt" = coalesce(version."DOCBTV_PublishedAt", now()),
      "DOCBTV_PublishedBy" = coalesce(version."DOCBTV_PublishedBy", template_row."DOCBT_UpdatedBy"),
      "DOCBTV_ChangeReason" = 'Exact supplied 12-page Master Air Waybill layout saved as the current template.'
  where version."DOCBTV_ID" = latest_version."DOCBTV_ID";

  update public."DOCB_DocumentTemplates" template
  set "DOCBT_CurrentVersionNo" = latest_version."DOCBTV_VersionNo",
      "DOCBT_UpdatedAt" = now()
  where template."DOCBT_ID" = template_row."DOCBT_ID";
exception
  when no_data_found or too_many_rows then
    raise exception 'The saved MAWB source is not ready to publish.' using errcode = '22023';
end;
$$;
