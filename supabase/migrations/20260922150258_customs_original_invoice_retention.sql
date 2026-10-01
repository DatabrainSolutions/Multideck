begin;

-- Register original bytes independently of the expiring OCR cache. Service-only:
-- the Edge handler supplies a verified caller and verifies the uploaded bytes.
create or replace function public.customs_retain_original_invoice(
  caller_auth_user_id uuid, requested_declaration_id uuid, requested_upload_id uuid,
  requested_file_name text, requested_mime_type text, requested_size bigint,
  requested_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor record;
  declaration record;
  existing record;
  blob_name text;
  stored_id uuid := gen_random_uuid();
  now_value timestamptz := clock_timestamp();
begin
  if not coalesce(public.customs_declaration_authorised(caller_auth_user_id, requested_declaration_id, true, true), false)
     or not coalesce(booking_api.has_permission(caller_auth_user_id, 'Customs.Write'), false) then
    raise exception 'This declaration cannot receive an invoice.' using errcode='42501';
  end if;
  select "User_ID", "Company_ID" into strict actor from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and coalesce("User_AccessStatus",'active')='active';
  select "CUST_JobID" into strict declaration from public."Customs_Declarations"
    where "CUST_id"=requested_declaration_id and not "CUST_IsDeleted" for update;
  if declaration."CUST_JobID" is not null and not exists (
    select 1 from public."Job_Header" job join public."cmp_Offices" office
      on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=declaration."CUST_JobID" and not job."Job_IsDeleted" and office."Company_ID"=actor."Company_ID"
  ) then
    raise exception 'The linked Booking is outside this workspace.' using errcode='42501';
  end if;
  if requested_upload_id is null or requested_size is null or requested_size <= 0 or requested_size > 10485760
     or requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$'
     or nullif(btrim(requested_file_name),'') is null or length(requested_file_name)>255
     or nullif(btrim(requested_mime_type),'') is null or length(requested_mime_type)>160 then
    raise exception 'Invalid original invoice metadata.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_upload_id::text, 0));
  select * into existing from public."Customs_Documents" where "CUSTD_id"=requested_upload_id;
  if found then
    if existing."CUSTD_CustomsID" <> requested_declaration_id
       or existing."CUSTD_DocumentCode" <> 'commercial_invoice_original'
       or existing."CUSTD_DocumentPayloadJSON"->>'sha256' is distinct from requested_sha256 then
      raise exception 'This upload identifier already belongs to another document.' using errcode='22023';
    end if;
    return jsonb_build_object('documentId',requested_upload_id,'reused',true);
  end if;
  blob_name := 'v2/customs/original-invoices/' || requested_declaration_id::text || '/' || requested_upload_id::text || '/' || requested_sha256;
  insert into public."DOC_StoredObjects" (
    "DOCStoredObject_ID","DOCStoredObject_ConcernCode","DOCStoredObject_AggregateType","DOCStoredObject_AggregateID",
    "DOCStoredObject_ProviderCode","DOCStoredObject_Container","DOCStoredObject_BlobName",
    "DOCStoredObject_OriginalFileName","DOCStoredObject_MimeType","DOCStoredObject_FileSizeBytes",
    "DOCStoredObject_SHA256","DOCStoredObject_StatusCode","DOCStoredObject_CreatedBy"
  ) values (stored_id,'customs','customs_declaration',requested_declaration_id,
    'supabase_storage','multideck-documents',blob_name,requested_file_name,requested_mime_type,requested_size,
    requested_sha256,'active',actor."User_ID");
  if declaration."CUST_JobID" is not null then
    -- Originals are evidence, not replacements for the current handover invoice.
    insert into public."Job_Documents" (
      "JobDoc_ID","JobDoc_JobID","JobDoc_DocTypeCodeSnapshot","JobDoc_Title","JobDoc_Status","JobDoc_Source",
      "JobDoc_FileName","JobDoc_FilePath","JobDoc_FileMimeType","JobDoc_FileSizeBytes",
      "JobDoc_IsCurrentVersion","JobDoc_IsPrimary","JobDoc_StoredObjectID","JobDoc_ReceivedAt",
      "JobDoc_MetadataJSON","JobDoc_CreatedBy","JobDoc_UpdatedBy"
    ) values (requested_upload_id,declaration."CUST_JobID",'commercial_invoice_original','Original commercial invoice','received','customs_invoice_import',
      left(requested_file_name,240),blob_name,requested_mime_type,requested_size,false,false,stored_id,now_value,
      jsonb_build_object('declarationId',requested_declaration_id,'sha256',requested_sha256,'retainedOriginal',true),actor."User_ID",actor."User_ID");
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(actor."Company_ID",declaration."CUST_JobID",'customs_invoice_original_retained','Original Customs invoice retained',
      jsonb_build_object('documentId',requested_upload_id,'declarationId',requested_declaration_id,'fileName',requested_file_name,'sha256',requested_sha256),actor."User_ID");
  end if;
  insert into public."Customs_Documents" (
    "CUSTD_id","CUSTD_CustomsID","CUSTD_DocumentRole","CUSTD_DocumentCode","CUSTD_DocumentReference",
    "CUSTD_JobDocumentID","CUSTD_DocumentPayloadJSON"
  ) values(requested_upload_id,requested_declaration_id,'supporting','commercial_invoice_original',left(requested_file_name,180),
    case when declaration."CUST_JobID" is not null then requested_upload_id end,
    jsonb_build_object('storedObjectId',stored_id,'fileName',requested_file_name,'mimeType',requested_mime_type,'sha256',requested_sha256,'retainedOriginal',true));
  insert into public."Customs_AuditLog" (
    "CUSTAU_CustomsID","CUSTAU_Action","CUSTAU_TableName","CUSTAU_RecordID","CUSTAU_ChangedBy",
    "CUSTAU_NewValues","CUSTAU_Source","CUSTAU_Notes"
  ) values(requested_declaration_id,'invoice_original_retained','Customs_Documents',requested_upload_id,caller_auth_user_id,
    jsonb_build_object('fileName',requested_file_name,'sha256',requested_sha256,'size',requested_size),
    'multideck_app','Original upload retained independently of temporary invoice extraction previews.');
  return jsonb_build_object('documentId',requested_upload_id,'reused',false);
end;
$$;
revoke all on function public.customs_retain_original_invoice(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.customs_retain_original_invoice(uuid,uuid,uuid,text,text,bigint,text) to service_role;
commit;
