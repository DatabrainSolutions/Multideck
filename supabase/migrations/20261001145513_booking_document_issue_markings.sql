-- Draft/Final Booking information, not legal transport-document issuance.
-- No published sources, role assignments or historic files are changed.
begin;
set local lock_timeout = '5s';

create function document_api.booking_document_issue_options(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  -- Reuse the real active-user/company/office/permission boundary and review.
  perform document_api.booking_confirmation_review(caller_auth_user_id, requested_job_id);
  return jsonb_build_object('protocolVersion', 1, 'bookingIssueStatuses', jsonb_build_array('draft','final'),
    'transportGenerationReady', false, 'originalIssuanceEnabled', false);
end $$;

create function document_api.apply_booking_document_issue(
  caller_auth_user_id uuid, requested_render_job_id uuid, requested_issue_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; render record; review jsonb; issue jsonb; snapshot jsonb;
begin
  if requested_issue_status is null or requested_issue_status not in ('draft','final') then
    raise exception 'Originals and copies require an approved issuing workflow. Choose Draft for review.' using errcode='22023';
  end if;
  if not document_api.has_permission(caller_auth_user_id, 'Documents.Generate') then
    raise exception 'Document generation is not authorised.' using errcode='42501';
  end if;
  select u."User_ID" into strict actor_id from public."cmp_Users" u
  where u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active';
  select r.*, t."DOCBT_Code" as template_code into strict render
  from public."DOCB_RenderJobs" r join public."DOCB_DocumentTemplates" t on t."DOCBT_ID"=r."DOCBRJ_TemplateID"
  where r."DOCBRJ_ID"=requested_render_job_id and r."DOCBRJ_CreatedBy"=actor_id
    and r."DOCBRJ_StatusCode"='rendering' and r."DOCBRJ_OutputFormatCode"='pdf'
    and document_api.is_booking_confirmation_template_code(t."DOCBT_Code")
  for update of r;
  review:=document_api.booking_confirmation_review(caller_auth_user_id, render."DOCBRJ_JobID");
  if render."DOCBRJ_RenderSettingsJSON"->>'bookingConfirmationReviewToken' is distinct from review->>'reviewToken' then
    raise exception 'The Booking changed. Review its current information before saving.' using errcode='40001';
  end if;
  if requested_issue_status='final' and coalesce((review->>'provisional')::boolean,true) then
    raise exception 'This provisional Booking can only generate a Draft.' using errcode='22023';
  end if;
  if render."DOCBRJ_RenderSettingsJSON" ? 'documentIssue' then
    raise exception 'The document issue selection has already been frozen.' using errcode='22023';
  end if;
  issue:=jsonb_build_object('status', requested_issue_status, 'label', upper(requested_issue_status),
    'selectedAt', now(), 'selectedBy', actor_id, 'policyVersion', 1, 'isLegalOriginal', false);
  snapshot:=render."DOCBRJ_InputSnapshotJSON" || jsonb_build_object('documentIssue',issue);
  update public."DOCB_RenderJobs" set "DOCBRJ_InputSnapshotJSON"=snapshot,
    "DOCBRJ_RenderSettingsJSON"=coalesce("DOCBRJ_RenderSettingsJSON",'{}'::jsonb)||jsonb_build_object('documentIssue',issue)
  where "DOCBRJ_ID"=requested_render_job_id;
  return snapshot;
exception when no_data_found or too_many_rows then
  raise exception 'Booking document generation is not authorised.' using errcode='42501';
end $$;

alter function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text)
  rename to complete_job_render_before_issue_20261001;
create function document_api.complete_job_render(
  caller_auth_user_id uuid, requested_render_job_id uuid, generated_document_id uuid,
  storage_bucket text, storage_path text, original_file_name text, mime_type text, file_size_bytes bigint, sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; issue jsonb;
begin
  result:=document_api.complete_job_render_before_issue_20261001(caller_auth_user_id, requested_render_job_id,
    generated_document_id, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, sha256);
  select r."DOCBRJ_RenderSettingsJSON"->'documentIssue' into issue
  from public."DOCB_RenderJobs" r where r."DOCBRJ_ID"=requested_render_job_id;
  if issue is not null then
    update public."DOCB_GeneratedDocuments"
    set "DOCBGD_MetadataJSON"=coalesce("DOCBGD_MetadataJSON",'{}'::jsonb)||jsonb_build_object('documentIssue',issue)
    where "DOCBGD_ID"=generated_document_id;
  end if;
  return result;
end $$;

alter function booking_api.workspace_documents(uuid,uuid) rename to workspace_documents_before_issue_20261001;
create function booking_api.workspace_documents(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare documents jsonb; result jsonb;
begin
  documents:=booking_api.workspace_documents_before_issue_20261001(caller_auth_user_id, requested_job_id);
  select coalesce(jsonb_agg(case when issue.status is null then item.value else item.value||jsonb_build_object(
    'documentIssueStatus',issue.status,
    'metadata',coalesce(item.value->'metadata','{}'::jsonb)||jsonb_build_object('documentIssue',issue.details)) end order by item.ordinality),'[]'::jsonb)
  into result from jsonb_array_elements(documents) with ordinality item(value,ordinality)
  left join lateral (
    select r."DOCBRJ_RenderSettingsJSON"#>>'{documentIssue,status}' status,
      r."DOCBRJ_RenderSettingsJSON"->'documentIssue' details
    from public."DOCB_GeneratedDocuments" d join public."DOCB_RenderJobs" r on r."DOCBRJ_ID"=d."DOCBGD_RenderJobID"
    where d."DOCBGD_ID"::text=item.value->>'id' and r."DOCBRJ_JobID"=requested_job_id
      and item.value->>'source'='document_builder'
  ) issue on true;
  return result;
end $$;

revoke all on function document_api.booking_document_issue_options(uuid,uuid) from public,anon,authenticated;
revoke all on function document_api.apply_booking_document_issue(uuid,uuid,text) from public,anon,authenticated;
revoke all on function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) from public,anon,authenticated;
revoke all on function booking_api.workspace_documents(uuid,uuid) from public,anon,authenticated;
grant execute on function document_api.booking_document_issue_options(uuid,uuid) to service_role;
grant execute on function document_api.apply_booking_document_issue(uuid,uuid,text) to service_role;
grant execute on function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) to service_role;
grant execute on function booking_api.workspace_documents(uuid,uuid) to service_role;
commit;
