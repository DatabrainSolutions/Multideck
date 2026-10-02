-- Every version owns its private source, even when restoring identical bytes.
-- A hash-only path incorrectly shared one catalogue object between versions.
CREATE OR REPLACE FUNCTION "document_api"."record_template_source"("caller_auth_user_id" "uuid", "requested_template_id" "uuid", "requested_version_no" integer, "source_bucket" "text", "source_path" "text", "source_file_name" "text", "source_mime_type" "text", "source_size_bytes" bigint, "source_sha256" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  app_user_id uuid;
  template_version_id uuid;
  stored_object_id uuid;
  stored_size_bytes bigint;
  source_extension text := lower(split_part(source_file_name, '.', array_length(string_to_array(source_file_name, '.'), 1)));
begin
  if caller_auth_user_id is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    raise exception 'document template management is not authorised' using errcode = '42501';
  end if;

  perform document_api.authorize_studio_template_save(caller_auth_user_id, requested_template_id);

  if requested_version_no < 1
     or source_bucket <> 'multideck-template-sources'
     or source_extension not in ('pdf', 'doc', 'docx', 'xls', 'xlsx')
     or source_path <> concat('templates/', requested_template_id, '/source/v', requested_version_no, '/', source_sha256, '.', source_extension)
     or length(source_file_name) < 5
     or length(source_file_name) > 255
     or position('/' in source_file_name) > 0
     or position(chr(92) in source_file_name) > 0
     or source_mime_type not in (
       'application/pdf',
       'application/msword',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     )
     or source_size_bytes <= 0
     or source_size_bytes > 15728640
     or source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid template source metadata' using errcode = '22023';
  end if;

  select user_row."User_ID"
  into strict app_user_id
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  select version."DOCBTV_ID"
  into strict template_version_id
  from public."DOCB_TemplateVersions" version
  join public."DOCB_DocumentTemplates" template
    on template."DOCBT_ID" = version."DOCBTV_TemplateID"
  where template."DOCBT_ID" = requested_template_id
    and version."DOCBTV_VersionNo" = requested_version_no
    and version."DOCBTV_StatusCode" = 'draft'
  for update of version;

  select nullif(source_object.metadata ->> 'size', '')::bigint
  into stored_size_bytes
  from storage.objects source_object
  where source_object.bucket_id = source_bucket
    and source_object.name = source_path;

  if stored_size_bytes is null or stored_size_bytes <> source_size_bytes then
    raise exception 'template source object is unavailable or inconsistent' using errcode = '22023';
  end if;

  insert into public."DOC_StoredObjects" (
    "DOCStoredObject_ConcernCode",
    "DOCStoredObject_AggregateType",
    "DOCStoredObject_AggregateID",
    "DOCStoredObject_ProviderCode",
    "DOCStoredObject_Container",
    "DOCStoredObject_BlobName",
    "DOCStoredObject_OriginalFileName",
    "DOCStoredObject_MimeType",
    "DOCStoredObject_FileSizeBytes",
    "DOCStoredObject_SHA256",
    "DOCStoredObject_CreatedBy"
  ) values (
    'document-builder',
    'document_template_version_source',
    template_version_id,
    'supabase_storage',
    source_bucket,
    source_path,
    source_file_name,
    source_mime_type,
    source_size_bytes,
    source_sha256,
    app_user_id
  )
  returning "DOCStoredObject_ID" into stored_object_id;

  update public."DOCB_TemplateVersions" version
  set "DOCBTV_TemplateSnapshotJSON" = jsonb_set(
    version."DOCBTV_TemplateSnapshotJSON",
    '{source}',
    coalesce(version."DOCBTV_TemplateSnapshotJSON" -> 'source', '{}'::jsonb) || jsonb_build_object(
      'provider', 'supabase_storage',
      'bucket', source_bucket,
      'path', source_path,
      'storedObjectId', stored_object_id,
      'fileName', source_file_name,
      'mimeType', source_mime_type,
      'sizeBytes', source_size_bytes,
      'sha256', source_sha256
    ),
    true
  )
  where version."DOCBTV_ID" = template_version_id;

  return jsonb_build_object(
    'storedObjectId', stored_object_id,
    'bucket', source_bucket,
    'path', source_path,
    'sha256', source_sha256
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'document template management is not authorised' using errcode = '42501';
end;
$_$;


revoke all on function document_api.record_template_source(uuid,uuid,integer,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function document_api.record_template_source(uuid,uuid,integer,text,text,text,text,bigint,text) to service_role;

