-- PostgreSQL does not define min(uuid). Cast to text for the deterministic
-- tie-break selection, then restore the UUID before continuing.

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

  select count(*), min(template."DOCBT_ID"::text)::uuid
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
