-- Own-issuer draft layouts only. No legal Originals, signatures or title transfers.
-- A tenant's existing custom template is retained. Provider registration and
-- reviewed activation happen through the authenticated template workflow.
begin;
set local lock_timeout = '5s';
insert into public."DOCB_DocumentTemplates" (
  "DOCBT_Code","DOCBT_Name","DOCBT_DataScopeCode","DOCBT_StatusCode",
  "DOCBT_DefaultRenderEngineCode","DOCBT_DefaultOutputFormatCode","DOCBT_LanguageCode",
  "DOCBT_Description","DOCBT_SettingsJSON","DOCBT_IsSystem","DOCBT_IsUserEditable","DOCBT_IsActive"
)
select code,name,'job','draft','carbone','pdf','en',description,
  '{"outputFormats":["pdf"],"documentPolicy":{"draftOnly":true,"finalIssueEnabled":false,"sourceMappingVersion":1}}'::jsonb,
  true,true,true
from (values
  ('HBL','House bill of lading','Own-issuer house bill of lading review draft. Authorised issuance, applicable terms and signature are not enabled.'),
  ('HAWB','House air waybill','Own-issuer house air waybill review draft. Airline master forms and authorised issuance are not enabled.')
) defaults(code,name,description)
on conflict ("DOCBT_Code") do nothing;

create or replace function document_api.freeze_transport_document_draft(
  caller_auth_user_id uuid, requested_render_job_id uuid, expected_review_token text,
  expected_source_hash text, mapped_dataset jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid; render record; source jsonb; issue jsonb; snapshot jsonb;
begin
  select u."User_ID" into strict actor_id from public."cmp_Users" u
  where u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active';
  select r.*,t."DOCBT_Code" code,v."DOCBTV_TemplateSnapshotJSON"#>>'{source,sha256}' source_hash into strict render
  from public."DOCB_RenderJobs" r join public."DOCB_DocumentTemplates" t on t."DOCBT_ID"=r."DOCBRJ_TemplateID"
  join public."DOCB_TemplateVersions" v on v."DOCBTV_ID"=r."DOCBRJ_TemplateVersionID" and v."DOCBTV_StatusCode"='published'
  where r."DOCBRJ_ID"=requested_render_job_id and r."DOCBRJ_CreatedBy"=actor_id and r."DOCBRJ_StatusCode"='rendering'
    and r."DOCBRJ_OutputFormatCode"='pdf' and t."DOCBT_IsActive" and t."DOCBT_StatusCode"='published'
    and t."DOCBT_Code" in ('FIATA_BOL_REFERENCE','JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859','MAWB','MNG_AWB','HBL','HAWB')
  for update of r;
  source:=document_api.transport_document_source(caller_auth_user_id,render."DOCBRJ_JobID");
  if expected_review_token is null or expected_review_token is distinct from source->>'reviewToken' then
    raise exception 'The Booking changed. Review the transport Draft again.' using errcode='40001'; end if;
  if expected_source_hash is null or expected_source_hash is distinct from render.source_hash then
    raise exception 'Publish a reviewed transport layout before generating a Draft.' using errcode='22023'; end if;
  if mapped_dataset#>>'{documentIssue,status}' is distinct from 'draft'
    or mapped_dataset#>>'{documentIssue,isLegalOriginal}' is distinct from 'false'
    or mapped_dataset#>>'{meta,transportMappingVersion}' is distinct from '1'
    or mapped_dataset#>>'{job,reference}' is distinct from source#>>'{job,bookingReference}' then
    raise exception 'Only the reviewed Draft transport mapping is supported.' using errcode='22023'; end if;
  if render.code in ('HBL','HAWB') and (
    mapped_dataset#>>'{meta,transportDocumentCode}' is distinct from render.code
    or mapped_dataset#>>'{meta,sourceJobId}' is distinct from render."DOCBRJ_JobID"::text
    or not exists (select 1 from jsonb_array_elements(source->'routing') route
      where route->>'id'=mapped_dataset#>>'{meta,sourceRouteId}'
        and lower(route->>'mode')=case when render.code='HBL' then 'sea' else 'air' end)
  ) then raise exception 'The reviewed shipment does not match this transport layout.' using errcode='22023'; end if;
  if render."DOCBRJ_RenderSettingsJSON" ? 'documentIssue' then
    raise exception 'The Draft has already been frozen.' using errcode='22023'; end if;
  issue:=jsonb_build_object('status','draft','label','DRAFT','selectedAt',now(),'selectedBy',actor_id,'policyVersion',2,'isLegalOriginal',false);
  snapshot:=mapped_dataset||jsonb_build_object('documentIssue',issue,
    'meta',coalesce(render."DOCBRJ_InputSnapshotJSON"->'meta','{}')||(mapped_dataset->'meta'));
  update public."DOCB_RenderJobs" set "DOCBRJ_InputSnapshotJSON"=snapshot,
    "DOCBRJ_RenderSettingsJSON"=coalesce("DOCBRJ_RenderSettingsJSON",'{}')||jsonb_build_object('documentIssue',issue,
      'transportReviewToken',expected_review_token,'transportMappingVersion',1,'transportSourceHash',expected_source_hash)
  where "DOCBRJ_ID"=requested_render_job_id;
  return snapshot;
exception when no_data_found or too_many_rows then
  raise exception 'Transport Draft generation is not authorised.' using errcode='42501';
end $$;
commit;

