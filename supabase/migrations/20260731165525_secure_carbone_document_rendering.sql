
-- Secure gateway for Carbone-backed operational documents.
-- The browser never receives database credentials, Carbone credentials, storage paths,
-- or the immutable input snapshot. Only service_role may call this API; Edge Functions
-- first validate the caller's Supabase JWT and then pass the verified auth subject.

create schema if not exists document_api;

revoke all on schema document_api from public, anon, authenticated;
grant usage on schema document_api to service_role;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('Documents.Read', 'Documents', 'Read generated documents', 'View generated document history and request secure downloads.', false),
  ('Documents.Generate', 'Documents', 'Generate documents', 'Generate approved documents from authorised operational records.', false),
  ('Documents.Manage', 'Documents', 'Manage document templates', 'Create, version, approve, publish, and retire document templates.', true)
on conflict ("sys_Permission_Value") do update
set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Documents.Read'),
    ('Administrator', 'Documents.Generate'),
    ('Administrator', 'Documents.Manage'),
    ('Operations manager', 'Documents.Read'),
    ('Operations manager', 'Documents.Generate'),
    ('Operations manager', 'Documents.Manage'),
    ('Operator', 'Documents.Read'),
    ('Operator', 'Documents.Generate'),
    ('Viewer', 'Documents.Read')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role
  on role."sys_UserRole_Name" = mapping.role_name
join public."sys_Permissions" permission
  on permission."sys_Permission_Value" = mapping.permission_value
on conflict do nothing;

create or replace function document_api.has_permission(
  caller_auth_user_id uuid,
  permission_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" app_user
    join public."cmp_Users_Roles" user_role
      on user_role."User_ID" = app_user."User_ID"
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where app_user."Auth_User_ID" = caller_auth_user_id
      and permission."sys_Permission_Value" = permission_value
  );
$$;

create or replace function document_api.party_json(
  party_id uuid,
  address_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when organisation."Org_id" is null then null else jsonb_strip_nulls(jsonb_build_object(
    'id', organisation."Org_id",
    'name', organisation."Org_Name",
    'address', case when address."OrgAdd_ID" is null then null else jsonb_strip_nulls(jsonb_build_object(
      'id', address."OrgAdd_ID",
      'name', address."Org_NameOverride",
      'line1', address."OrgAdd_Line1",
      'line2', address."OrgAdd_Line2",
      'city', address."OrgAdd_TownCity",
      'countyOrState', address."OrgAdd_CountyState",
      'postalCode', address."OrgAdd_PostZipCode",
      'countryCode', address."OrgAdd_Country",
      'unlocode', address."OrgAdd_UNLOCODE",
      'email', address."OrgAdd_MainEmail",
      'phone', address."OrgAdd_MainPhone"
    )) end
  )) end
  from (select 1) seed
  left join public."Org_Master" organisation on organisation."Org_id" = party_id
  left join public."Org_Addresses" address
    on address."OrgAdd_ID" = address_id
   and address."Org_ID" = organisation."Org_id";
$$;

create or replace function document_api.prepare_job_render(
  caller_auth_user_id uuid,
  requested_template_code text,
  requested_job_id uuid,
  requested_output_format text,
  requested_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  job record;
  selected_template record;
  selected_version record;
  candidate_template_id uuid;
  candidate_count integer;
  max_specificity integer;
  carbone_reference text;
  input_snapshot jsonb;
  render_job_id uuid := gen_random_uuid();
  correlation_id uuid := gen_random_uuid();
begin
  if caller_auth_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select user_row."User_ID", user_row."Company_ID"
  into strict app_user
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  if app_user."Company_ID" is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Generate') then
    raise exception 'document generation is not authorised' using errcode = '42501';
  end if;

  select job_row.*
  into strict job
  from public."Job_Header" job_row
  join public."cmp_Offices" office
    on office."Office_ID" = job_row."Job_OrgOfficeID"
   and office."Company_ID" = app_user."Company_ID"
   and office."Office_IsActive" = true
  join public."cmp_Users_Offices" user_office
    on user_office."Office_ID" = office."Office_ID"
   and user_office."User_ID" = app_user."User_ID"
  where job_row."Job_ID" = requested_job_id
    and job_row."Job_IsDeleted" = false;

  if requested_output_format not in ('pdf', 'docx') then
    raise exception 'unsupported output format' using errcode = '22023';
  end if;

  select max(
    (case when template."DOCBT_OrgOfficeID" is not null then 8 else 0 end) +
    (case when template."DOCBT_LegalEntityID" is not null then 4 else 0 end) +
    (case when template."DOCBT_BrandID" is not null then 2 else 0 end) +
    (case when template."DOCBT_CustomerOrgID" is not null then 1 else 0 end)
  )
  into max_specificity
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_Code" = requested_template_code
    and template."DOCBT_StatusCode" = 'published'
    and template."DOCBT_IsActive" = true
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
    and (template."DOCBT_OrgOfficeID" is null or template."DOCBT_OrgOfficeID" = job."Job_OrgOfficeID")
    and (template."DOCBT_LegalEntityID" is null or template."DOCBT_LegalEntityID" = job."Job_LegalEntityID")
    and (template."DOCBT_BrandID" is null or template."DOCBT_BrandID" = job."Job_BrandID")
    and (template."DOCBT_CustomerOrgID" is null or template."DOCBT_CustomerOrgID" = job."Job_Customer");

  if max_specificity is null then
    raise exception 'no published template matches the requested job' using errcode = 'P0002';
  end if;

  select count(*), min(template."DOCBT_ID")
  into candidate_count, candidate_template_id
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_Code" = requested_template_code
    and template."DOCBT_StatusCode" = 'published'
    and template."DOCBT_IsActive" = true
    and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
    and (template."DOCBT_OrgOfficeID" is null or template."DOCBT_OrgOfficeID" = job."Job_OrgOfficeID")
    and (template."DOCBT_LegalEntityID" is null or template."DOCBT_LegalEntityID" = job."Job_LegalEntityID")
    and (template."DOCBT_BrandID" is null or template."DOCBT_BrandID" = job."Job_BrandID")
    and (template."DOCBT_CustomerOrgID" is null or template."DOCBT_CustomerOrgID" = job."Job_Customer")
    and (
      (case when template."DOCBT_OrgOfficeID" is not null then 8 else 0 end) +
      (case when template."DOCBT_LegalEntityID" is not null then 4 else 0 end) +
      (case when template."DOCBT_BrandID" is not null then 2 else 0 end) +
      (case when template."DOCBT_CustomerOrgID" is not null then 1 else 0 end)
    ) = max_specificity;

  if candidate_count <> 1 then
    raise exception 'template resolution is ambiguous' using errcode = '21000';
  end if;

  select template.*
  into strict selected_template
  from public."DOCB_DocumentTemplates" template
  where template."DOCBT_ID" = candidate_template_id;

  select version.*
  into strict selected_version
  from public."DOCB_TemplateVersions" version
  where version."DOCBTV_TemplateID" = selected_template."DOCBT_ID"
    and version."DOCBTV_VersionNo" = selected_template."DOCBT_CurrentVersionNo"
    and version."DOCBTV_StatusCode" = 'published'
    and version."DOCBTV_RenderEngineCode" = 'carbone';

  if requested_output_format <> selected_template."DOCBT_DefaultOutputFormatCode"
     and not coalesce(selected_template."DOCBT_SettingsJSON" -> 'outputFormats', '[]'::jsonb) ? requested_output_format then
    raise exception 'output format is not enabled for this template' using errcode = '22023';
  end if;

  carbone_reference := coalesce(
    selected_version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}',
    selected_version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}',
    selected_template."DOCBT_SettingsJSON" #>> '{carbone,templateId}'
  );

  if carbone_reference is null or carbone_reference !~ '^[A-Za-z0-9._-]{8,128}$' then
    raise exception 'published template has no valid Carbone template reference' using errcode = '22023';
  end if;

  input_snapshot := jsonb_build_object(
    'meta', jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', now(),
      'correlationId', correlation_id,
      'templateCode', selected_template."DOCBT_Code",
      'templateVersion', selected_version."DOCBTV_VersionNo",
      'languageCode', selected_template."DOCBT_LanguageCode"
    ),
    'job', jsonb_strip_nulls(jsonb_build_object(
      'id', job."Job_ID",
      'number', job."Job_Number",
      'period', job."Job_Period",
      'createdAt', job."Job_CreatedDate",
      'status', job."Job_Status",
      'direction', job."Job_Direction",
      'transportMode', job."Job_TransportModeSummary",
      'origin', jsonb_strip_nulls(jsonb_build_object('unlocode', job."Job_OriginUNLocode", 'name', job."Job_OriginNameSnapshot")),
      'destination', jsonb_strip_nulls(jsonb_build_object('unlocode', job."Job_DestinationUNLocode", 'name', job."Job_DestinationNameSnapshot")),
      'readyDate', job."Job_ReadyDate",
      'requiredDeliveryDate', job."Job_RequiredDeliveryDate",
      'officeId', job."Job_OrgOfficeID",
      'legalEntityName', job."Job_LegalEntityNameSnapshot",
      'brandName', job."Job_BrandNameSnapshot"
    )),
    'customer', document_api.party_json(job."Job_Customer", job."Job_CustomerAddress"),
    'shipper', document_api.party_json(job."Job_Shipper", job."Job_ShipperAddress"),
    'consignee', document_api.party_json(job."Job_Consignee", job."Job_ConsigneeAddress"),
    'cargo', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', cargo."JobCargo_ID",
        'lineNumber', cargo."JobCargo_LineNo",
        'commodity', cargo."JobCargo_Commodity",
        'description', cargo."JobCargo_Description",
        'packageType', cargo."JobCargo_PackageTypeCodeSnapshot",
        'packageQuantity', cargo."JobCargo_PackageQty",
        'grossWeight', cargo."JobCargo_GrossKilos",
        'netWeight', cargo."JobCargo_NettKilos",
        'weightUnit', cargo."JobCargo_WeightUnit",
        'volume', cargo."JobCargo_VolumeCBM",
        'volumeUnit', cargo."JobCargo_VolumeUnit",
        'marksAndNumbers', cargo."JobCargo_MarksNumbers",
        'hsCode', cargo."JobCargo_HSCode",
        'countryOfOrigin', cargo."JobCargo_CountryOfOriginCodeSnapshot",
        'isHazardous', cargo."JobCargo_IsHazardous"
      )) order by cargo."JobCargo_LineNo" nulls last, cargo."JobCargo_ID")
      from public."Job_Cargo" cargo
      where cargo."JobCargo_JobID" = job."Job_ID" and cargo."JobCargo_IsDeleted" = false
    ), '[]'::jsonb),
    'routing', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', route."JobRoute_ID",
        'sequence', route."JobRoute_OrderNo",
        'status', route."JobRoute_Status",
        'mode', route."JobRoute_ModeCode",
        'origin', jsonb_strip_nulls(jsonb_build_object('unlocode', route."JobRoute_OriginUNLocode", 'name', route."JobRoute_OriginNameSnapshot", 'terminal', route."JobRoute_OriginTerminal")),
        'destination', jsonb_strip_nulls(jsonb_build_object('unlocode', route."JobRoute_DestinationUNLocode", 'name', route."JobRoute_DestinationNameSnapshot", 'terminal', route."JobRoute_DestinationTerminal")),
        'plannedDepartureAt', route."JobRoute_PlannedDepartureAt",
        'estimatedDepartureAt', route."JobRoute_EstimatedDepartureAt",
        'actualDepartureAt', route."JobRoute_ActualDepartureAt",
        'plannedArrivalAt', route."JobRoute_PlannedArrivalAt",
        'estimatedArrivalAt', route."JobRoute_EstimatedArrivalAt",
        'actualArrivalAt', route."JobRoute_ActualArrivalAt",
        'vessel', route."JobRoute_Vessel",
        'voyageNumber', route."JobRoute_VoyageNumber",
        'flightNumber', route."JobRoute_FlightNumber",
        'carrierBookingReference', route."JobRoute_CarrierBookingReference",
        'masterTransportReference', route."JobRoute_MasterTransportReference",
        'houseTransportReference', route."JobRoute_HouseTransportReference",
        'isMainCarriage', route."JobRoute_IsMainCarriage"
      )) order by route."JobRoute_OrderNo" nulls last, route."JobRoute_ID")
      from public."Job_Routing" route
      where route."Job_ID" = job."Job_ID"
    ), '[]'::jsonb)
  );

  if input_snapshot #>> '{customer,id}' is null then
    raise exception 'job customer identity is missing or invalid' using errcode = '42501';
  end if;

  insert into public."DOCB_RenderJobs" (
    "DOCBRJ_ID", "DOCBRJ_TemplateID", "DOCBRJ_TemplateVersionID", "DOCBRJ_StatusCode",
    "DOCBRJ_RenderEngineCode", "DOCBRJ_OutputFormatCode", "DOCBRJ_TargetTable",
    "DOCBRJ_TargetID", "DOCBRJ_JobID", "DOCBRJ_InputSnapshotJSON",
    "DOCBRJ_RenderSettingsJSON", "DOCBRJ_StartedAt", "DOCBRJ_CreatedBy"
  ) values (
    render_job_id, selected_template."DOCBT_ID", selected_version."DOCBTV_ID", 'rendering',
    selected_version."DOCBTV_RenderEngineCode", requested_output_format, 'Job_Header',
    job."Job_ID", job."Job_ID", input_snapshot,
    jsonb_strip_nulls(jsonb_build_object('provider', 'carbone', 'correlationId', correlation_id, 'reason', nullif(trim(requested_reason), ''))),
    now(), app_user."User_ID"
  );

  return jsonb_build_object(
    'renderJobId', render_job_id,
    'templateId', selected_template."DOCBT_ID",
    'templateVersionId', selected_version."DOCBTV_ID",
    'templateCode', selected_template."DOCBT_Code",
    'carboneTemplateReference', carbone_reference,
    'outputFormat', requested_output_format,
    'languageCode', selected_template."DOCBT_LanguageCode",
    'jobId', job."Job_ID",
    'jobReference', concat(job."Job_Period", '-', job."Job_Number"),
    'companyId', app_user."Company_ID",
    'customerOrganisationId', job."Job_Customer",
    'customerName', input_snapshot #>> '{customer,name}',
    'actorUserId', app_user."User_ID",
    'dataset', input_snapshot
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'document identity or access is ambiguous' using errcode = '42501';
end;
$$;

create or replace function document_api.complete_job_render(
  caller_auth_user_id uuid,
  requested_render_job_id uuid,
  generated_document_id uuid,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  render_job record;
  actor_user_id uuid;
  customer_organisation_id uuid;
  stored_object_id uuid := gen_random_uuid();
begin
  select app_user."User_ID" into strict actor_user_id
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id;

  select render.* into strict render_job
  from public."DOCB_RenderJobs" render
  where render."DOCBRJ_ID" = requested_render_job_id
    and render."DOCBRJ_CreatedBy" = actor_user_id
    and render."DOCBRJ_StatusCode" = 'rendering';

  customer_organisation_id := (render_job."DOCBRJ_InputSnapshotJSON" #>> '{customer,id}')::uuid;

  insert into public."DOCB_GeneratedDocuments" (
    "DOCBGD_ID", "DOCBGD_RenderJobID", "DOCBGD_TemplateID", "DOCBGD_TemplateVersionID",
    "DOCBGD_OutputFormatCode", "DOCBGD_FileName", "DOCBGD_StorageBucket", "DOCBGD_StoragePath",
    "DOCBGD_MimeType", "DOCBGD_FileSizeBytes", "DOCBGD_SHA256", "DOCBGD_VersionNo",
    "DOCBGD_IsCurrentVersion", "DOCBGD_MetadataJSON", "DOCBGD_CreatedBy"
  ) values (
    generated_document_id, render_job."DOCBRJ_ID", render_job."DOCBRJ_TemplateID", render_job."DOCBRJ_TemplateVersionID",
    render_job."DOCBRJ_OutputFormatCode", original_file_name, storage_bucket, storage_path,
    mime_type, file_size_bytes, sha256, 1, true,
    jsonb_build_object('storedObjectId', stored_object_id, 'targetType', 'Job_Header', 'targetId', render_job."DOCBRJ_TargetID"),
    actor_user_id
  );

  insert into public."DOC_StoredObjects" (
    "DOCStoredObject_ID", "DOCStoredObject_ConcernCode", "DOCStoredObject_OrganisationID",
    "DOCStoredObject_AggregateType", "DOCStoredObject_AggregateID", "DOCStoredObject_ProviderCode",
    "DOCStoredObject_Container", "DOCStoredObject_BlobName", "DOCStoredObject_OriginalFileName",
    "DOCStoredObject_MimeType", "DOCStoredObject_FileSizeBytes", "DOCStoredObject_SHA256",
    "DOCStoredObject_StatusCode", "DOCStoredObject_CreatedBy"
  ) values (
    stored_object_id, 'generated', customer_organisation_id,
    'DOCB_GeneratedDocument', generated_document_id, 'supabase_storage',
    storage_bucket, storage_path, original_file_name,
    mime_type, file_size_bytes, sha256, 'active', actor_user_id
  );

  update public."DOCB_RenderJobs"
  set "DOCBRJ_StatusCode" = 'completed', "DOCBRJ_CompletedAt" = now(), "DOCBRJ_ErrorMessage" = null
  where "DOCBRJ_ID" = requested_render_job_id;

  return jsonb_build_object('generatedDocumentId', generated_document_id, 'storedObjectId', stored_object_id);
exception
  when no_data_found or too_many_rows then
    raise exception 'render completion is not authorised' using errcode = '42501';
end;
$$;

create or replace function document_api.fail_job_render(
  caller_auth_user_id uuid,
  requested_render_job_id uuid,
  safe_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
begin
  select app_user."User_ID" into strict actor_user_id
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id;

  update public."DOCB_RenderJobs"
  set "DOCBRJ_StatusCode" = 'failed',
      "DOCBRJ_CompletedAt" = now(),
      "DOCBRJ_ErrorMessage" = left(coalesce(safe_error_message, 'Document render failed'), 1000)
  where "DOCBRJ_ID" = requested_render_job_id
    and "DOCBRJ_CreatedBy" = actor_user_id
    and "DOCBRJ_StatusCode" in ('queued', 'rendering');
end;
$$;

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
      ) order by template."DOCBT_Name")
      from public."DOCB_DocumentTemplates" template
      left join public."cmp_Users" updater on updater."User_ID" = template."DOCBT_UpdatedBy"
      where template."DOCBT_StatusCode" = 'published'
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

create or replace function document_api.authorize_download(
  caller_auth_user_id uuid,
  requested_generated_document_id uuid
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
  if not document_api.has_permission(caller_auth_user_id, 'Documents.Read') then
    raise exception 'document download is not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'bucket', generated."DOCBGD_StorageBucket",
    'path', generated."DOCBGD_StoragePath",
    'fileName', generated."DOCBGD_FileName"
  )
  into strict result
  from public."DOCB_GeneratedDocuments" generated
  join public."DOCB_RenderJobs" render on render."DOCBRJ_ID" = generated."DOCBGD_RenderJobID"
  join public."Job_Header" job on job."Job_ID" = render."DOCBRJ_JobID" and job."Job_IsDeleted" = false
  join public."cmp_Users" app_user on app_user."Auth_User_ID" = caller_auth_user_id
  join public."cmp_Users_Offices" user_office
    on user_office."User_ID" = app_user."User_ID" and user_office."Office_ID" = job."Job_OrgOfficeID"
  join public."cmp_Offices" office
    on office."Office_ID" = user_office."Office_ID" and office."Company_ID" = app_user."Company_ID"
  where generated."DOCBGD_ID" = requested_generated_document_id
    and generated."DOCBGD_IsCurrentVersion" = true
    and generated."DOCBGD_StorageBucket" is not null
    and generated."DOCBGD_StoragePath" is not null;

  return result;
exception
  when no_data_found or too_many_rows then
    raise exception 'document download is not authorised' using errcode = '42501';
end;
$$;

revoke all on all functions in schema document_api from public, anon, authenticated;
grant execute on function document_api.prepare_job_render(uuid, text, uuid, text, text) to service_role;
grant execute on function document_api.complete_job_render(uuid, uuid, uuid, text, text, text, text, bigint, text) to service_role;
grant execute on function document_api.fail_job_render(uuid, uuid, text) to service_role;
grant execute on function document_api.workspace(uuid) to service_role;
grant execute on function document_api.authorize_download(uuid, uuid) to service_role;

insert into public."sys_DocBuilderRenderEngines" (
  "DOCBRE_Code", "DOCBRE_Name", "DOCBRE_Description", "DOCBRE_IsExternal", "DOCBRE_SortOrder", "DOCBRE_IsActive"
)
values (
  'carbone', 'Carbone', 'Carbone HTTP document rendering adapter.', true, 35, true
)
on conflict ("DOCBRE_Code") do update
set "DOCBRE_Name" = excluded."DOCBRE_Name",
    "DOCBRE_Description" = excluded."DOCBRE_Description",
    "DOCBRE_IsExternal" = excluded."DOCBRE_IsExternal",
    "DOCBRE_SortOrder" = excluded."DOCBRE_SortOrder",
    "DOCBRE_IsActive" = excluded."DOCBRE_IsActive";

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'multideck-generated',
  'multideck-generated',
  false,
  52428800,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Browser roles have no direct Storage policy. The Edge Functions use service_role only after
-- the document_api authorization functions approve the exact job/document relationship.
