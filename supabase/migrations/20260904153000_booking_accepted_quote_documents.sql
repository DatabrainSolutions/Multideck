-- Keep the booking document feed aligned with the quote version history.
-- A generated PDF belongs to the quote immediately after confirmed delivery,
-- but it must not appear on the linked booking unless that exact version has
-- subsequently been accepted. Accepted historic versions remain visible for
-- audit, including while a newer accepted version awaits booking application.

begin;

create or replace function booking_api.workspace_documents(
  caller_auth_user_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  quote_reference text;
  documents_value jsonb;
begin
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode = '42501';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';

  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = requested_job_id
    and office."Company_ID" = app_user."Company_ID"
    and not job."Job_IsDeleted";

  if not found then
    raise exception 'That booking is outside this workspace.' using errcode = '42501';
  end if;

  if job_row."Job_SourceQuoteID" is not null then
    select coalesce(
      nullif(btrim(quote."CusQuoteHeader_CustomerReference"), ''),
      'Q-' || quote."CusQuoteHeader_Number"::text
    ) into quote_reference
    from public."CusQuote_Header" quote
    join public."cmp_Offices" quote_office
      on quote_office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = job_row."Job_SourceQuoteID"
      and quote_office."Company_ID" = app_user."Company_ID"
      and not quote."CusQuoteHeader_IsDeleted";
  end if;

  with job_documents as (
    select
      case
        when linked_customs.is_linked
          or lower(coalesce(document."JobDoc_Source", '')) like '%customs%'
          or lower(coalesce(document."JobDoc_DocTypeCodeSnapshot", '')) in (
            'commercial_invoice', 'commercial-invoice', 'invoice',
            'packing_list', 'packing-list', 'certificate_of_origin',
            'customs_declaration', 'import_declaration', 'export_declaration'
          )
          or lower(coalesce(document."JobDoc_DocTypeCodeSnapshot", '')) like 'customs_%'
        then 'customs'
        else 'job'
      end as category,
      coalesce(document."JobDoc_ReceivedAt", document."JobDoc_CreatedAt") as created_at,
      jsonb_strip_nulls(jsonb_build_object(
        'id', document."JobDoc_ID",
        'category', case
          when linked_customs.is_linked
            or lower(coalesce(document."JobDoc_Source", '')) like '%customs%'
            or lower(coalesce(document."JobDoc_DocTypeCodeSnapshot", '')) in (
              'commercial_invoice', 'commercial-invoice', 'invoice',
              'packing_list', 'packing-list', 'certificate_of_origin',
              'customs_declaration', 'import_declaration', 'export_declaration'
            )
            or lower(coalesce(document."JobDoc_DocTypeCodeSnapshot", '')) like 'customs_%'
          then 'customs'
          else 'job'
        end,
        'typeCode', document."JobDoc_DocTypeCodeSnapshot",
        'title', document."JobDoc_Title",
        'description', document."JobDoc_Description",
        'status', document."JobDoc_Status",
        'source', document."JobDoc_Source",
        'fileName', document."JobDoc_FileName",
        'mimeType', document."JobDoc_FileMimeType",
        'fileSizeBytes', document."JobDoc_FileSizeBytes",
        'version', document."JobDoc_VersionNo",
        'isCurrent', document."JobDoc_IsCurrentVersion",
        'documentDate', document."JobDoc_DocumentDate",
        'receivedAt', document."JobDoc_ReceivedAt",
        'createdAt', document."JobDoc_CreatedAt",
        'sourceRecordId', requested_job_id,
        'sourceReference', coalesce(
          linked_customs.reference,
          job_row."Job_BookingReference",
          'JOB-' || job_row."Job_Number"::text
        ),
        'metadata', document."JobDoc_MetadataJSON"
      )) as payload
    from public."Job_Documents" document
    left join lateral (
      select
        true as is_linked,
        coalesce(
          nullif(btrim(declaration."CUST_CustomsReferenceNumber"), ''),
          nullif(btrim(declaration."CUST_MasterReferenceNumber"), ''),
          nullif(btrim(declaration."CUST_LocalReferenceNumber"), '')
        ) as reference
      from public."Customs_Documents" customs_document
      join public."Customs_Declarations" declaration
        on declaration."CUST_id" = customs_document."CUSTD_CustomsID"
      where customs_document."CUSTD_JobDocumentID" = document."JobDoc_ID"
        and declaration."CUST_JobID" = requested_job_id
        and not declaration."CUST_IsDeleted"
      order by declaration."CUST_UpdatedAt" desc, customs_document."CUSTD_CreatedAt" desc
      limit 1
    ) linked_customs on true
    where document."JobDoc_JobID" = requested_job_id
      and not document."JobDoc_IsDeleted"
  ),
  quote_documents as (
    select
      'quote'::text as category,
      stored."DOCStoredObject_CreatedAt" as created_at,
      jsonb_strip_nulls(jsonb_build_object(
        'id', stored."DOCStoredObject_ID",
        'category', 'quote',
        'typeCode', 'quote_pdf',
        'title', stored."DOCStoredObject_OriginalFileName",
        'status', stored."DOCStoredObject_StatusCode",
        'source', 'quote_workflow',
        'fileName', stored."DOCStoredObject_OriginalFileName",
        'mimeType', stored."DOCStoredObject_MimeType",
        'fileSizeBytes', stored."DOCStoredObject_FileSizeBytes",
        'version', version."CusQuoteVersion_Number",
        'isCurrent', version."CusQuoteVersion_ID" = job_row."Job_SourceQuoteVersionID",
        'createdAt', stored."DOCStoredObject_CreatedAt",
        'sourceRecordId', job_row."Job_SourceQuoteID",
        'sourceReference', quote_reference,
        'metadata', jsonb_build_object(
          'storageProvider', stored."DOCStoredObject_ProviderCode",
          'aggregateType', stored."DOCStoredObject_AggregateType",
          'quoteVersionId', version."CusQuoteVersion_ID",
          'quoteVersionNumber', version."CusQuoteVersion_Number",
          'responseLinkId', link.response_link_id,
          'appliedToBooking', version."CusQuoteVersion_ID" = job_row."Job_SourceQuoteVersionID"
        )
      )) as payload
    from quote_api.customer_response_links link
    join public."CusQuote_Versions" version
      on version."CusQuoteVersion_ID" = link.quote_version_id
     and version."CusQuoteHeader_ID" = link.quote_id
    join public."DOC_StoredObjects" stored
      on stored."DOCStoredObject_ID" = link.quote_document_id
    join public."cmp_Users" creator
      on creator."User_ID" = stored."DOCStoredObject_CreatedBy"
    where job_row."Job_SourceQuoteID" is not null
      and link.quote_id = job_row."Job_SourceQuoteID"
      and link.company_id = app_user."Company_ID"
      and link.delivery_status_code = 'sent'
      and version."CusQuoteVersion_StatusCode" = 'accepted'
      and stored."DOCStoredObject_ConcernCode" = 'quote'
      and stored."DOCStoredObject_AggregateType" = 'CusQuote_Header'
      and stored."DOCStoredObject_AggregateID" = job_row."Job_SourceQuoteID"
      and stored."DOCStoredObject_MimeType" = 'application/pdf'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null
      and creator."Company_ID" = app_user."Company_ID"
  ),
  all_documents as (
    select category, created_at, payload from quote_documents
    union all
    select category, created_at, payload from job_documents
  )
  select coalesce(
    jsonb_agg(payload order by
      case category when 'quote' then 1 when 'job' then 2 else 3 end,
      created_at desc nulls last
    ),
    '[]'::jsonb
  ) into documents_value
  from all_documents;

  return documents_value;
exception
  when no_data_found or too_many_rows then
    raise exception 'Your workspace identity is incomplete.' using errcode = '42501';
end;
$$;

comment on function booking_api.workspace_documents(uuid, uuid) is
  'Returns tenant-scoped booking documents. Quote PDFs are included only for submitted versions that have been accepted; historic accepted PDFs remain visible and metadata identifies the version currently applied to the booking.';

revoke all on function booking_api.workspace_documents(uuid, uuid) from public, anon, authenticated;
grant execute on function booking_api.workspace_documents(uuid, uuid) to service_role;

commit;
