-- Preserve the original Booking Confirmation while allowing reviewed layout copies.
-- All Booking variants use the same reviewed, customer-safe data contract.
begin;
set local lock_timeout = '5s';

create or replace function document_api.is_booking_confirmation_template_code(template_code text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(template_code ~ '^JOB_CONFIRMATION(_[A-Z0-9]+)*$', false)
$$;
revoke all on function document_api.is_booking_confirmation_template_code(text) from public,anon,authenticated;
grant execute on function document_api.is_booking_confirmation_template_code(text) to service_role;

-- A manager may copy the immutable published source into a separate draft.
-- The function returns only the authenticated tenant's private source location.
create function document_api.studio_booking_published_source(
  caller_auth_user_id uuid, requested_template_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected record;
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'Document template management is not authorised.' using errcode = '42501';
  end if;
  perform 1 from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id
    and user_row."User_AccessStatus" = 'active';
  if not found then
    raise exception 'Document template management is not authorised.' using errcode = '42501';
  end if;
  select t."DOCBT_Code" code, t."DOCBT_Name" name,
    stored."DOCStoredObject_Container" bucket,
    stored."DOCStoredObject_BlobName" path
  into strict selected
  from public."DOCB_DocumentTemplates" t
  join public."DOCB_TemplateVersions" v
    on v."DOCBTV_TemplateID" = t."DOCBT_ID"
    and v."DOCBTV_VersionNo" = t."DOCBT_CurrentVersionNo"
    and v."DOCBTV_StatusCode" = 'published'
  join public."DOC_StoredObjects" stored
    on stored."DOCStoredObject_ID" = nullif(v."DOCBTV_TemplateSnapshotJSON" #>> '{source,storedObjectId}', '')::uuid
  where t."DOCBT_ID" = requested_template_id
    and document_api.is_booking_confirmation_template_code(t."DOCBT_Code")
    and t."DOCBT_StatusCode" = 'published'
    and t."DOCBT_IsActive" and t."DOCBT_IsUserEditable"
    and stored."DOCStoredObject_AggregateType" = 'document_template_version_source'
    and stored."DOCStoredObject_AggregateID" = v."DOCBTV_ID"
    and stored."DOCStoredObject_Container" = 'multideck-template-sources'
    and stored."DOCStoredObject_StatusCode" = 'active'
    and stored."DOCStoredObject_DeletedAt" is null;
  return jsonb_build_object('code', selected.code, 'name', selected.name,
    'bucket', selected.bucket, 'path', selected.path);
exception when no_data_found or too_many_rows then
  raise exception 'The published Booking template source is unavailable.' using errcode = '42501';
end $$;
revoke all on function document_api.studio_booking_published_source(uuid,uuid) from public,anon,authenticated;
grant execute on function document_api.studio_booking_published_source(uuid,uuid) to service_role;

create or replace function document_api.prepare_booking_confirmation(
  caller_auth_user_id uuid, requested_render_job_id uuid,
  expected_review_token text, confirm_customer_prices boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  render record;
  review jsonb;
  safe_snapshot jsonb;
begin
  select u."User_ID" into strict actor_id from public."cmp_Users" u
  where u."Auth_User_ID" = caller_auth_user_id and u."User_AccessStatus" = 'active';
  select r.* into strict render from public."DOCB_RenderJobs" r
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = r."DOCBRJ_TemplateID"
  where r."DOCBRJ_ID" = requested_render_job_id and r."DOCBRJ_CreatedBy" = actor_id
    and r."DOCBRJ_StatusCode" = 'rendering' and document_api.is_booking_confirmation_template_code(t."DOCBT_Code")
    and r."DOCBRJ_OutputFormatCode" = 'pdf'
  for update of r;
  review := document_api.booking_confirmation_review(caller_auth_user_id, render."DOCBRJ_JobID");
  if expected_review_token is null or expected_review_token <> review->>'reviewToken' then
    raise exception 'The Booking changed. Review the latest information before generating the PDF.' using errcode = '40001';
  end if;
  if confirm_customer_prices and not (review->>'priceAvailable')::boolean then
    raise exception 'Customer prices are not ready to confirm on this Booking.' using errcode = '22023';
  end if;
  safe_snapshot := jsonb_build_object(
    'meta', jsonb_build_object('schemaVersion', 2),
    'customer', review->'customer',
    'bookingConfirmation', (review - 'reviewToken' - 'priceAvailable' - 'chargeLines' - 'chargeTotals')
      || jsonb_build_object('priceStatus', case when confirm_customer_prices then 'confirmed' else 'Price to be confirmed' end,
        'chargeLines', case when confirm_customer_prices then review->'chargeLines' else '[]'::jsonb end,
        'chargeTotals', case when confirm_customer_prices then review->'chargeTotals' else '[]'::jsonb end)
  );
  update public."DOCB_RenderJobs" set
    "DOCBRJ_InputSnapshotJSON" = safe_snapshot,
    "DOCBRJ_RenderSettingsJSON" = "DOCBRJ_RenderSettingsJSON" || jsonb_build_object(
      'bookingConfirmationReviewToken', expected_review_token,
      'customerPricesConfirmed', confirm_customer_prices)
  where "DOCBRJ_ID" = requested_render_job_id;
  return safe_snapshot;
exception
  when no_data_found or too_many_rows then
    raise exception 'Booking document generation is not authorised.' using errcode = '42501';
end $$;

create or replace function booking_api.workspace_documents(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  existing jsonb;
  generated jsonb;
begin
  existing := booking_api.workspace_documents_before_confirmation_20260924(caller_auth_user_id, requested_job_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d."DOCBGD_ID", 'category', 'job', 'typeCode', 'booking_confirmation',
    'title', 'Booking information', 'source', 'document_builder', 'status', 'ready',
    'fileName', d."DOCBGD_FileName", 'mimeType', d."DOCBGD_MimeType",
    'fileSizeBytes', d."DOCBGD_FileSizeBytes", 'version', d."DOCBGD_VersionNo",
    'isCurrent', d."DOCBGD_IsCurrentVersion", 'createdAt', d."DOCBGD_CreatedAt",
    'sourceRecordId', requested_job_id, 'sourceReference', j."Job_BookingReference",
    'metadata', jsonb_build_object('renderJobId', r."DOCBRJ_ID", 'templateVersionId', d."DOCBGD_TemplateVersionID", 'templateCode', t."DOCBT_Code", 'templateName', t."DOCBT_Name")
  ) order by d."DOCBGD_CreatedAt" desc, d."DOCBGD_ID" desc), '[]'::jsonb)
  into generated from public."DOCB_GeneratedDocuments" d
  join public."DOCB_RenderJobs" r on r."DOCBRJ_ID" = d."DOCBGD_RenderJobID"
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = d."DOCBGD_TemplateID"
  join public."Job_Header" j on j."Job_ID" = r."DOCBRJ_JobID"
  join public."cmp_Offices" o on o."Office_ID" = coalesce(j."Job_OrgOfficeID", j."Job_OfficeID")
  join public."cmp_Users" u on u."Company_ID" = o."Company_ID"
    and u."Auth_User_ID" = caller_auth_user_id and u."User_AccessStatus" = 'active'
  join public."cmp_Users_Offices" uo on uo."Office_ID" = o."Office_ID" and uo."User_ID" = u."User_ID"
  where r."DOCBRJ_JobID" = requested_job_id and document_api.is_booking_confirmation_template_code(t."DOCBT_Code")
    and r."DOCBRJ_StatusCode" in ('completed', 'completed_with_warnings')
    and document_api.has_permission(caller_auth_user_id, 'Documents.Read');
  return existing || generated;
end $$;

create or replace function document_api.complete_job_render(
  caller_auth_user_id uuid, requested_render_job_id uuid,
  generated_document_id uuid, storage_bucket text, storage_path text,
  original_file_name text, mime_type text, file_size_bytes bigint, sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_job_id uuid;
  next_version integer;
  result jsonb;
begin
  select r."DOCBRJ_JobID" into target_job_id from public."DOCB_RenderJobs" r
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = r."DOCBRJ_TemplateID"
  where r."DOCBRJ_ID" = requested_render_job_id and document_api.is_booking_confirmation_template_code(t."DOCBT_Code");
  if target_job_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(target_job_id::text || ':JOB_CONFIRMATION', 0));
    select coalesce(max(d."DOCBGD_VersionNo"), 0) + 1 into next_version
    from public."DOCB_GeneratedDocuments" d
    join public."DOCB_RenderJobs" r on r."DOCBRJ_ID" = d."DOCBGD_RenderJobID"
    join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = d."DOCBGD_TemplateID"
    where r."DOCBRJ_JobID" = target_job_id and document_api.is_booking_confirmation_template_code(t."DOCBT_Code");
  end if;
  result := document_api.complete_job_render_before_confirmation_20260924(
    caller_auth_user_id, requested_render_job_id, generated_document_id,
    storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, sha256);
  if target_job_id is not null then
    update public."DOCB_GeneratedDocuments" set "DOCBGD_VersionNo" = next_version
    where "DOCBGD_ID" = generated_document_id;
  end if;
  return result;
end $$;

revoke all on function document_api.prepare_booking_confirmation(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function document_api.prepare_booking_confirmation(uuid,uuid,text,boolean) to service_role;
revoke all on function booking_api.workspace_documents(uuid,uuid) from public,anon,authenticated;
grant execute on function booking_api.workspace_documents(uuid,uuid) to service_role;
revoke all on function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) to service_role;
commit;
