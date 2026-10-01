begin;
set local lock_timeout='5s';

-- Activation is tied to the precise Word source and version the manager saw.
-- The header lock serialises this with template version registration.
create function document_api.approve_reviewed_template_version(
  caller_auth_user_id uuid, requested_template_id uuid,
  reviewed_version_no integer, reviewed_source_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare version_row record;
begin
  perform document_api.authorize_studio_template_save(caller_auth_user_id,requested_template_id);
  perform 1 from public."DOCB_DocumentTemplates" where "DOCBT_ID"=requested_template_id for update;
  select "DOCBTV_VersionNo", "DOCBTV_TemplateSnapshotJSON" into strict version_row
    from public."DOCB_TemplateVersions" where "DOCBTV_TemplateID"=requested_template_id
      and "DOCBTV_StatusCode"='draft' order by "DOCBTV_VersionNo" desc limit 1 for update;
  if reviewed_version_no is null or reviewed_source_sha256 is null
    or reviewed_source_sha256 !~ '^[0-9a-f]{64}$'
    or version_row."DOCBTV_VersionNo"<>reviewed_version_no
    or version_row."DOCBTV_TemplateSnapshotJSON"#>>'{source,sha256}' is distinct from reviewed_source_sha256 then
    raise exception 'The template changed. Preview the latest saved draft before activating it.' using errcode='40001';
  end if;
  return document_api.approve_studio_template_version(caller_auth_user_id,requested_template_id);
exception when no_data_found or too_many_rows then
  raise exception 'No saved template draft is ready for review.' using errcode='42501';
end $$;
revoke all on function document_api.approve_reviewed_template_version(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function document_api.approve_reviewed_template_version(uuid,uuid,integer,text) to service_role;

-- Dexter template activation remains an explicit operator management action.
commit;

