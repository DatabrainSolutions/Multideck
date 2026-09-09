create or replace function document_api.apply_job_render_content_selection(
  caller_auth_user_id uuid,
  requested_render_job_id uuid,
  requested_content_sections text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user_id uuid;
  render_job record;
  allowed_sections constant text[] := array['job', 'customer', 'shipper', 'consignee', 'cargo', 'routing'];
  selected_sections text[];
  selected_snapshot jsonb;
begin
  if caller_auth_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select user_row."User_ID"
  into strict app_user_id
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  select render.*
  into strict render_job
  from public."DOCB_RenderJobs" render
  where render."DOCBRJ_ID" = requested_render_job_id
    and render."DOCBRJ_CreatedBy" = app_user_id
    and render."DOCBRJ_StatusCode" = 'rendering'
  for update;

  if requested_content_sections is null
     or cardinality(requested_content_sections) = 0
     or cardinality(requested_content_sections) > cardinality(allowed_sections)
     or not ('job' = any(requested_content_sections))
     or exists (
       select 1
       from unnest(requested_content_sections) requested(section_code)
       where requested.section_code is null
          or not (requested.section_code = any(allowed_sections))
     )
     or cardinality(requested_content_sections) <> (
       select count(distinct requested.section_code)
       from unnest(requested_content_sections) requested(section_code)
     ) then
    raise exception 'invalid document content selection' using errcode = '22023';
  end if;

  select array_agg(allowed.section_code order by allowed.ordinality)
  into selected_sections
  from unnest(allowed_sections) with ordinality allowed(section_code, ordinality)
  where allowed.section_code = any(requested_content_sections);

  selected_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'meta', render_job."DOCBRJ_InputSnapshotJSON" -> 'meta',
    'selection', jsonb_build_object(
      'job', 'job' = any(selected_sections),
      'customer', 'customer' = any(selected_sections),
      'shipper', 'shipper' = any(selected_sections),
      'consignee', 'consignee' = any(selected_sections),
      'cargo', 'cargo' = any(selected_sections),
      'routing', 'routing' = any(selected_sections)
    ),
    'job', render_job."DOCBRJ_InputSnapshotJSON" -> 'job',
    'customer', case when 'customer' = any(selected_sections) then render_job."DOCBRJ_InputSnapshotJSON" -> 'customer' end,
    'shipper', case when 'shipper' = any(selected_sections) then render_job."DOCBRJ_InputSnapshotJSON" -> 'shipper' end,
    'consignee', case when 'consignee' = any(selected_sections) then render_job."DOCBRJ_InputSnapshotJSON" -> 'consignee' end,
    'cargo', case when 'cargo' = any(selected_sections) then render_job."DOCBRJ_InputSnapshotJSON" -> 'cargo' end,
    'routing', case when 'routing' = any(selected_sections) then render_job."DOCBRJ_InputSnapshotJSON" -> 'routing' end
  ));

  update public."DOCB_RenderJobs"
  set "DOCBRJ_InputSnapshotJSON" = selected_snapshot,
      "DOCBRJ_RenderSettingsJSON" = "DOCBRJ_RenderSettingsJSON" || jsonb_build_object('contentSections', to_jsonb(selected_sections))
  where "DOCBRJ_ID" = requested_render_job_id;

  return selected_snapshot;
exception
  when no_data_found or too_many_rows then
    raise exception 'document render selection is not authorised' using errcode = '42501';
end;
$$;

revoke all on function document_api.apply_job_render_content_selection(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function document_api.apply_job_render_content_selection(uuid, uuid, text[]) to service_role;
