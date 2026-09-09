-- Expose the resolved Multideck template identity alongside the existing
-- authorised job data. The browser still receives no provider credentials.
create or replace function document_api.prepare_studio_job_session(
  caller_auth_user_id uuid,
  requested_template_code text,
  requested_job_number text,
  requested_content_sections text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_data jsonb;
  selected_template record;
  current_reference text;
  stable_template_id text;
  version_id text;
begin
  session_data := document_api.prepare_studio_job_session(
    caller_auth_user_id => caller_auth_user_id,
    requested_template_code => requested_template_code,
    requested_job_id => document_api.resolve_authorised_job_id_by_number(
      caller_auth_user_id,
      requested_job_number
    ),
    requested_content_sections => requested_content_sections
  );

  current_reference := session_data ->> 'carboneTemplateReference';

  select
    template."DOCBT_ID",
    template."DOCBT_DataScopeCode",
    template."DOCBT_SettingsJSON" #>> '{carbone,templateId}' as provider_template_id,
    version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' as provider_version_id
  into strict selected_template
  from public."DOCB_DocumentTemplates" template
  join public."DOCB_TemplateVersions" version
    on version."DOCBTV_TemplateID" = template."DOCBT_ID"
   and version."DOCBTV_VersionNo" = template."DOCBT_CurrentVersionNo"
  where template."DOCBT_Code" = session_data ->> 'templateCode'
    and coalesce(
      version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}',
      version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}',
      template."DOCBT_SettingsJSON" #>> '{carbone,templateId}'
    ) = current_reference;

  stable_template_id := case
    when selected_template.provider_template_id ~ '^[0-9]{1,20}$'
      then selected_template.provider_template_id
    else null
  end;
  version_id := coalesce(
    selected_template.provider_version_id,
    case when current_reference ~ '^[0-9a-f]{64}$' then current_reference end
  );

  return session_data || jsonb_strip_nulls(jsonb_build_object(
    'multideckTemplateId', selected_template."DOCBT_ID",
    'dataModuleCode', selected_template."DOCBT_DataScopeCode",
    'dataModuleName', case selected_template."DOCBT_DataScopeCode"
      when 'job' then 'Jobs'
      else initcap(replace(selected_template."DOCBT_DataScopeCode", '_', ' '))
    end,
    'carboneTemplateId', stable_template_id,
    'carboneVersionId', version_id
  ));
exception
  when no_data_found or too_many_rows then
    raise exception 'document studio template identity is ambiguous' using errcode = '42501';
end;
$$;

-- Check template-management permission before any provider-side save occurs.
create or replace function document_api.authorize_studio_template_save(
  caller_auth_user_id uuid,
  requested_template_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'document template management is not authorised' using errcode = '42501';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'templateId', template."DOCBT_ID",
    'templateCode', template."DOCBT_Code",
    'templateName', template."DOCBT_Name",
    'carboneTemplateId', case
      when template."DOCBT_SettingsJSON" #>> '{carbone,templateId}' ~ '^[0-9]{1,20}$'
        then template."DOCBT_SettingsJSON" #>> '{carbone,templateId}'
      else null
    end
  ))
  into strict result
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_ID" = requested_template_id
    and template."DOCBT_IsActive" = true
    and template."DOCBT_IsUserEditable" = true
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone';

  return result;
exception
  when no_data_found or too_many_rows then
    raise exception 'document template management is not authorised' using errcode = '42501';
end;
$$;

-- Record the stable Carbone template ID without silently replacing a published
-- version. Unchanged files enrich the current version metadata; edited files
-- become a Multideck draft until a separate publish action is approved.
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
    set "DOCBTV_TemplateSnapshotJSON" = version."DOCBTV_TemplateSnapshotJSON" || jsonb_build_object(
      'carbone', coalesce(version."DOCBTV_TemplateSnapshotJSON" -> 'carbone', '{}'::jsonb) || jsonb_build_object(
        'templateId', provider_template_id,
        'versionId', provider_version_id
      )
    )
    where version."DOCBTV_ID" = matching_version."DOCBTV_ID";

    next_version_no := matching_version."DOCBTV_VersionNo";
    saved_status := matching_version."DOCBTV_StatusCode";
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
      "DOCBTV_CreatedBy"
    ) values (
      selected_template."DOCBT_ID",
      next_version_no,
      'draft',
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
      'Saved from the Multideck document builder.',
      app_user_id
    );
    saved_status := 'draft';
  end if;

  update public."DOCB_DocumentTemplates" template
  set "DOCBT_SettingsJSON" = template."DOCBT_SettingsJSON" || jsonb_build_object(
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

revoke all on function document_api.prepare_studio_job_session(uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function document_api.authorize_studio_template_save(uuid, uuid) from public, anon, authenticated;
revoke all on function document_api.register_studio_template_version(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function document_api.prepare_studio_job_session(uuid, text, text, text[]) to service_role;
grant execute on function document_api.authorize_studio_template_save(uuid, uuid) to service_role;
grant execute on function document_api.register_studio_template_version(uuid, uuid, text, text) to service_role;
