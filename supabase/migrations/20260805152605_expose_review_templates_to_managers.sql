-- Draft templates are visible only to people who can manage templates. They
-- remain excluded from all rendering and customer-document paths.
create or replace function document_api.workspace(caller_auth_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_user record;
  can_generate boolean;
  can_manage boolean;
begin
  select user_row."User_ID", user_row."Company_ID"
  into strict app_user
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  can_generate := document_api.has_permission(caller_auth_user_id, 'Documents.Generate');
  can_manage := document_api.has_permission(caller_auth_user_id, 'Documents.Manage');

  if not document_api.has_permission(caller_auth_user_id, 'Documents.Read') then
    raise exception 'document access is not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'permissions', jsonb_build_object('canGenerate', can_generate, 'canManageTemplates', can_manage),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', template."DOCBT_ID",
        'code', template."DOCBT_Code",
        'name', template."DOCBT_Name",
        'description', template."DOCBT_Description",
        'targetType', 'Job_Header',
        'outputFormats', case
          when jsonb_typeof(template."DOCBT_SettingsJSON" -> 'outputFormats') = 'array'
            then template."DOCBT_SettingsJSON" -> 'outputFormats'
          else jsonb_build_array(template."DOCBT_DefaultOutputFormatCode")
        end,
        'defaultOutputFormat', template."DOCBT_DefaultOutputFormatCode",
        'status', template."DOCBT_StatusCode",
        'version', template."DOCBT_CurrentVersionNo",
        'languageCode', template."DOCBT_LanguageCode",
        'updatedAt', template."DOCBT_UpdatedAt",
        'updatedBy', concat_ws(' ', updater."User_Firstname", updater."User_Lastname")
      ) order by template."DOCBT_StatusCode" desc, template."DOCBT_Name")
      from public."DOCB_DocumentTemplates" template
      left join public."cmp_Users" updater on updater."User_ID" = template."DOCBT_UpdatedBy"
      where (template."DOCBT_StatusCode" = 'published' or (can_manage and template."DOCBT_StatusCode" = 'draft'))
        and template."DOCBT_IsActive" = true
        and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
        and (
          template."DOCBT_OrgOfficeID" is null
          or exists (
            select 1 from public."cmp_Users_Offices" user_office
            join public."cmp_Offices" office on office."Office_ID" = user_office."Office_ID"
            where user_office."User_ID" = app_user."User_ID"
              and office."Company_ID" = app_user."Company_ID"
              and user_office."Office_ID" = template."DOCBT_OrgOfficeID"
          )
        )
    ), '[]'::jsonb),
    'generatedDocuments', coalesce((
      select jsonb_agg(document_row order by "createdAt" desc)
      from (
        select jsonb_build_object(
          'id', generated."DOCBGD_ID",
          'renderJobId', generated."DOCBGD_RenderJobID",
          'templateCode', template."DOCBT_Code",
          'templateName', template."DOCBT_Name",
          'targetType', render."DOCBRJ_TargetTable",
          'targetId', render."DOCBRJ_TargetID",
          'targetReference', concat(job."Job_Period", '-', job."Job_Number"),
          'customerName', customer."Org_Name",
          'fileName', generated."DOCBGD_FileName",
          'outputFormat', generated."DOCBGD_OutputFormatCode",
          'mimeType', generated."DOCBGD_MimeType",
          'fileSizeBytes', generated."DOCBGD_FileSizeBytes",
          'status', case render."DOCBRJ_StatusCode"
            when 'completed' then 'ready'
            when 'completed_with_warnings' then 'ready'
            when 'rendering' then 'rendering'
            when 'queued' then 'queued'
            else 'failed'
          end,
          'createdAt', generated."DOCBGD_CreatedAt",
          'createdBy', concat_ws(' ', creator."User_Firstname", creator."User_Lastname"),
          'failureReason', render."DOCBRJ_ErrorMessage"
        ) as document_row,
        generated."DOCBGD_CreatedAt" as "createdAt"
        from public."DOCB_GeneratedDocuments" generated
        join public."DOCB_RenderJobs" render on render."DOCBRJ_ID" = generated."DOCBGD_RenderJobID"
        join public."DOCB_DocumentTemplates" template on template."DOCBT_ID" = generated."DOCBGD_TemplateID"
        join public."Job_Header" job on job."Job_ID" = render."DOCBRJ_JobID" and job."Job_IsDeleted" = false
        join public."cmp_Users_Offices" user_office
          on user_office."User_ID" = app_user."User_ID" and user_office."Office_ID" = job."Job_OrgOfficeID"
        join public."cmp_Offices" office
          on office."Office_ID" = user_office."Office_ID" and office."Company_ID" = app_user."Company_ID"
        left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
        left join public."cmp_Users" creator on creator."User_ID" = generated."DOCBGD_CreatedBy"
        order by generated."DOCBGD_CreatedAt" desc
        limit 50
      ) recent
    ), '[]'::jsonb)
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'document identity is ambiguous' using errcode = '42501';
end;
$$;

revoke all on function document_api.workspace(uuid) from public, anon, authenticated;
grant execute on function document_api.workspace(uuid) to service_role;
