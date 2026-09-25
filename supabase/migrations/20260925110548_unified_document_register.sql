-- Read existing document records through their owning workflow boundaries.
-- The catalogue contains references only; the files stay in private Storage.
create or replace function document_api.unified_documents_page(
  caller_auth_user_id uuid,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  app_user record;
  search_term text := nullif(left(btrim(coalesce(p_search, '')), 120), '');
  page_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  page_offset integer := greatest(coalesce(p_offset, 0), 0);
  rows_json jsonb;
  row_count bigint;
begin
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';

  if not document_api.has_permission(caller_auth_user_id, 'Documents.Read') then
    raise exception 'Document access is not authorised.' using errcode = '42501';
  end if;

  with permitted_offices as (
    select distinct office."Office_ID"
    from public."cmp_Users_Offices" membership
    join public."cmp_Offices" office on office."Office_ID" = membership."Office_ID"
    where membership."User_ID" = app_user."User_ID"
      and office."Company_ID" = app_user."Company_ID"
  ), documents as (
    select generated."DOCBGD_ID" id, 'generated'::text kind,
      template."DOCBT_Name" type_name, generated."DOCBGD_FileName" file_name,
      job."Job_ID" source_id,
      coalesce(nullif(job."Job_BookingReference", ''), concat(job."Job_Period", '-', job."Job_Number")) source_reference,
      'booking'::text source_kind, customer."Org_Name" customer_name,
      generated."DOCBGD_CreatedAt" created_at, 'ready'::text status,
      generated."DOCBGD_VersionNo" version_no,
      generated."DOCBGD_MimeType" mime_type,
      generated."DOCBGD_FileSizeBytes" file_size, null::text source_direction
    from public."DOCB_GeneratedDocuments" generated
    join public."DOCB_RenderJobs" render on render."DOCBRJ_ID" = generated."DOCBGD_RenderJobID"
    join public."DOCB_DocumentTemplates" template on template."DOCBT_ID" = generated."DOCBGD_TemplateID"
    join public."Job_Header" job on job."Job_ID" = render."DOCBRJ_JobID" and not job."Job_IsDeleted"
    join permitted_offices office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
    where booking_api.has_permission(caller_auth_user_id, 'Bookings.Read')
      and render."DOCBRJ_StatusCode" in ('completed', 'completed_with_warnings')

    union all

    select document."JobDoc_ID", 'booking_attachment',
      coalesce(nullif(document."JobDoc_Title", ''), document."JobDoc_DocTypeCodeSnapshot"),
      document."JobDoc_FileName", job."Job_ID",
      coalesce(nullif(job."Job_BookingReference", ''), concat(job."Job_Period", '-', job."Job_Number")),
      'booking', customer."Org_Name", document."JobDoc_CreatedAt",
      document."JobDoc_Status", document."JobDoc_VersionNo",
      document."JobDoc_FileMimeType", document."JobDoc_FileSizeBytes", null::text
    from public."Job_Documents" document
    join public."Job_Header" job on job."Job_ID" = document."JobDoc_JobID" and not job."Job_IsDeleted"
    join permitted_offices office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" = document."JobDoc_StoredObjectID"
      and stored."DOCStoredObject_StatusCode" = 'active' and stored."DOCStoredObject_DeletedAt" is null
    left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
    where booking_api.has_permission(caller_auth_user_id, 'Bookings.Read')
      and not document."JobDoc_IsDeleted"

    union all

    select stored."DOCStoredObject_ID", 'quote_pdf', 'Customer Quote',
      stored."DOCStoredObject_OriginalFileName", quote."CusQuoteHeader_ID",
      coalesce(nullif(btrim(quote."CusQuoteHeader_CustomerReference"), ''),
        'Q-' || quote."CusQuoteHeader_Number"::text),
      'quote', customer."Org_Name", stored."DOCStoredObject_CreatedAt",
      version."CusQuoteVersion_StatusCode", version."CusQuoteVersion_Number",
      stored."DOCStoredObject_MimeType", stored."DOCStoredObject_FileSizeBytes", null::text
    from quote_api.customer_response_links link
    join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID" = link.quote_id
      and not quote."CusQuoteHeader_IsDeleted"
    join permitted_offices office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    join public."CusQuote_Versions" version on version."CusQuoteVersion_ID" = link.quote_version_id
      and version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" = link.quote_document_id
      and stored."DOCStoredObject_AggregateType" = 'CusQuote_Header'
      and stored."DOCStoredObject_AggregateID" = quote."CusQuoteHeader_ID"
      and stored."DOCStoredObject_ConcernCode" = 'quote'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null
    left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
    where quote_api.has_permission(caller_auth_user_id, 'Quotes.Read')
      and link.company_id = app_user."Company_ID"
      and link.delivery_status_code = 'sent'
    union all
    select stored."DOCStoredObject_ID", 'finance_pdf', 'Freight invoice',
      stored."DOCStoredObject_OriginalFileName", invoice."FINDoc_ID",
      coalesce(nullif(invoice."FINDoc_Number", ''), invoice."FINDoc_ID"::text),
      'finance', customer."Org_Name", stored."DOCStoredObject_CreatedAt",
      invoice."FINDoc_StatusCode", null::integer,
      stored."DOCStoredObject_MimeType", stored."DOCStoredObject_FileSizeBytes", null::text
    from public."DOC_StoredObjects" stored
    join public."FIN_Documents" invoice on invoice."FINDoc_ID" = stored."DOCStoredObject_AggregateID"
      and invoice."FINDoc_TypeCode" = 'sl_invoice'
      and invoice."FINDoc_StatusCode" in ('approved', 'submitted')
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = invoice."FINDoc_LegalEntityID"
      and entity."Company_ID" = app_user."Company_ID"
    left join public."Org_Master" customer on customer."Org_id" = invoice."FINDoc_PartyOrgID"
    where document_api.has_permission(caller_auth_user_id, 'Finance.Receivables.View')
      and stored."DOCStoredObject_AggregateType" = 'finance_document'
      and stored."DOCStoredObject_ConcernCode" = 'finance'
      and stored."DOCStoredObject_MimeType" = 'application/pdf'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null
    union all
    select file."CUSTD_ID", 'customs_declaration', 'Customs declaration',
      file."CUSTD_FileName", declaration."CUST_id",
      coalesce(nullif(declaration."CUST_LocalReferenceNumber", ''), file."CUSTD_MRN", declaration."CUST_id"::text),
      'customs', null::text, file."CUSTD_ReceivedAt",
      coalesce(file."CUSTD_ProviderStatus", 'received'), null::integer,
      file."CUSTD_MimeType", file."CUSTD_FileSizeBytes", declaration."CUST_Direction"
    from public."Customs_DeclarationDocuments" file
    join public."Customs_Declarations" declaration on declaration."CUST_id" = file."CUSTD_CustomsID"
      and not declaration."CUST_IsDeleted"
    where booking_api.has_permission(caller_auth_user_id, 'Customs.Read')
      and public.customs_declaration_authorised(caller_auth_user_id, declaration."CUST_id", false, false)
  ), filtered as (
    select distinct on (kind, id) * from documents
    where search_term is null or file_name ilike '%' || search_term || '%'
      or type_name ilike '%' || search_term || '%'
      or source_reference ilike '%' || search_term || '%'
      or customer_name ilike '%' || search_term || '%'
    order by kind, id, created_at desc
  )
  select count(*) into row_count from filtered;

  -- The query above is intentionally repeated through a simple CTE wrapper
  -- below so pagination is applied after every source has been combined.
  with permitted_offices as (
    select distinct office."Office_ID"
    from public."cmp_Users_Offices" membership
    join public."cmp_Offices" office on office."Office_ID" = membership."Office_ID"
    where membership."User_ID" = app_user."User_ID" and office."Company_ID" = app_user."Company_ID"
  ), documents as (
    select generated."DOCBGD_ID" id, 'generated'::text kind,
      template."DOCBT_Name" type_name, generated."DOCBGD_FileName" file_name,
      job."Job_ID" source_id,
      coalesce(nullif(job."Job_BookingReference", ''), concat(job."Job_Period", '-', job."Job_Number")) source_reference,
      'booking'::text source_kind, customer."Org_Name" customer_name,
      generated."DOCBGD_CreatedAt" created_at, 'ready'::text status,
      generated."DOCBGD_VersionNo" version_no,
      generated."DOCBGD_MimeType" mime_type, generated."DOCBGD_FileSizeBytes" file_size, null::text source_direction
    from public."DOCB_GeneratedDocuments" generated
    join public."DOCB_RenderJobs" render on render."DOCBRJ_ID" = generated."DOCBGD_RenderJobID"
    join public."DOCB_DocumentTemplates" template on template."DOCBT_ID" = generated."DOCBGD_TemplateID"
    join public."Job_Header" job on job."Job_ID" = render."DOCBRJ_JobID" and not job."Job_IsDeleted"
    join permitted_offices office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
    where booking_api.has_permission(caller_auth_user_id, 'Bookings.Read')
      and render."DOCBRJ_StatusCode" in ('completed', 'completed_with_warnings')
    union all
    select document."JobDoc_ID", 'booking_attachment',
      coalesce(nullif(document."JobDoc_Title", ''), document."JobDoc_DocTypeCodeSnapshot"),
      document."JobDoc_FileName", job."Job_ID",
      coalesce(nullif(job."Job_BookingReference", ''), concat(job."Job_Period", '-', job."Job_Number")),
      'booking', customer."Org_Name", document."JobDoc_CreatedAt",
      document."JobDoc_Status", document."JobDoc_VersionNo",
      document."JobDoc_FileMimeType", document."JobDoc_FileSizeBytes", null::text
    from public."Job_Documents" document
    join public."Job_Header" job on job."Job_ID" = document."JobDoc_JobID" and not job."Job_IsDeleted"
    join permitted_offices office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" = document."JobDoc_StoredObjectID"
      and stored."DOCStoredObject_StatusCode" = 'active' and stored."DOCStoredObject_DeletedAt" is null
    left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
    where booking_api.has_permission(caller_auth_user_id, 'Bookings.Read')
      and not document."JobDoc_IsDeleted"
    union all
    select stored."DOCStoredObject_ID", 'quote_pdf', 'Customer Quote',
      stored."DOCStoredObject_OriginalFileName", quote."CusQuoteHeader_ID",
      coalesce(nullif(btrim(quote."CusQuoteHeader_CustomerReference"), ''), 'Q-' || quote."CusQuoteHeader_Number"::text),
      'quote', customer."Org_Name", stored."DOCStoredObject_CreatedAt",
      version."CusQuoteVersion_StatusCode", version."CusQuoteVersion_Number",
      stored."DOCStoredObject_MimeType", stored."DOCStoredObject_FileSizeBytes", null::text
    from quote_api.customer_response_links link
    join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID" = link.quote_id
      and not quote."CusQuoteHeader_IsDeleted"
    join permitted_offices office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    join public."CusQuote_Versions" version on version."CusQuoteVersion_ID" = link.quote_version_id
      and version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" = link.quote_document_id
      and stored."DOCStoredObject_AggregateType" = 'CusQuote_Header'
      and stored."DOCStoredObject_AggregateID" = quote."CusQuoteHeader_ID"
      and stored."DOCStoredObject_ConcernCode" = 'quote'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null
    left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
    where quote_api.has_permission(caller_auth_user_id, 'Quotes.Read')
      and link.company_id = app_user."Company_ID" and link.delivery_status_code = 'sent'
    union all
    select stored."DOCStoredObject_ID", 'finance_pdf', 'Freight invoice',
      stored."DOCStoredObject_OriginalFileName", invoice."FINDoc_ID",
      coalesce(nullif(invoice."FINDoc_Number", ''), invoice."FINDoc_ID"::text),
      'finance', customer."Org_Name", stored."DOCStoredObject_CreatedAt",
      invoice."FINDoc_StatusCode", null::integer,
      stored."DOCStoredObject_MimeType", stored."DOCStoredObject_FileSizeBytes", null::text
    from public."DOC_StoredObjects" stored
    join public."FIN_Documents" invoice on invoice."FINDoc_ID" = stored."DOCStoredObject_AggregateID"
      and invoice."FINDoc_TypeCode" = 'sl_invoice'
      and invoice."FINDoc_StatusCode" in ('approved', 'submitted')
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = invoice."FINDoc_LegalEntityID"
      and entity."Company_ID" = app_user."Company_ID"
    left join public."Org_Master" customer on customer."Org_id" = invoice."FINDoc_PartyOrgID"
    where document_api.has_permission(caller_auth_user_id, 'Finance.Receivables.View')
      and stored."DOCStoredObject_AggregateType" = 'finance_document'
      and stored."DOCStoredObject_ConcernCode" = 'finance'
      and stored."DOCStoredObject_MimeType" = 'application/pdf'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null
    union all
    select file."CUSTD_ID", 'customs_declaration', 'Customs declaration',
      file."CUSTD_FileName", declaration."CUST_id",
      coalesce(nullif(declaration."CUST_LocalReferenceNumber", ''), file."CUSTD_MRN", declaration."CUST_id"::text),
      'customs', null::text, file."CUSTD_ReceivedAt",
      coalesce(file."CUSTD_ProviderStatus", 'received'), null::integer,
      file."CUSTD_MimeType", file."CUSTD_FileSizeBytes", declaration."CUST_Direction"
    from public."Customs_DeclarationDocuments" file
    join public."Customs_Declarations" declaration on declaration."CUST_id" = file."CUSTD_CustomsID"
      and not declaration."CUST_IsDeleted"
    where booking_api.has_permission(caller_auth_user_id, 'Customs.Read')
      and public.customs_declaration_authorised(caller_auth_user_id, declaration."CUST_id", false, false)
  ), filtered as (
    select distinct on (kind, id) * from documents
    where search_term is null or file_name ilike '%' || search_term || '%'
      or type_name ilike '%' || search_term || '%'
      or source_reference ilike '%' || search_term || '%'
      or customer_name ilike '%' || search_term || '%'
    order by kind, id, created_at desc
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.id desc), '[]'::jsonb)
    into rows_json
  from (select * from filtered order by created_at desc, id desc limit page_limit offset page_offset) page;

  return jsonb_build_object('rows', rows_json, 'total', row_count,
    'offset', page_offset, 'limit', page_limit);
exception when no_data_found or too_many_rows then
  raise exception 'Document identity is incomplete or ambiguous.' using errcode = '42501';
end $$;

revoke all on function document_api.unified_documents_page(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function document_api.unified_documents_page(uuid,text,integer,integer) to service_role;

create or replace function document_api.authorize_unified_download(
  caller_auth_user_id uuid,
  requested_kind text,
  requested_document_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  app_user record;
  selected record;
begin
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if not document_api.has_permission(caller_auth_user_id, 'Documents.Read') then
    raise exception 'Document access is not authorised.' using errcode = '42501';
  end if;

  if requested_kind = 'generated' then
    if not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
      raise exception 'Booking access is not authorised.' using errcode = '42501';
    end if;
    select generated."DOCBGD_StorageBucket" bucket,
      generated."DOCBGD_StoragePath" path,
      generated."DOCBGD_FileName" file_name into strict selected
    from public."DOCB_GeneratedDocuments" generated
    join public."DOCB_RenderJobs" render on render."DOCBRJ_ID" = generated."DOCBGD_RenderJobID"
    join public."Job_Header" job on job."Job_ID" = render."DOCBRJ_JobID"
    join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    join public."cmp_Users_Offices" membership on membership."Office_ID" = office."Office_ID"
      and membership."User_ID" = app_user."User_ID"
    where generated."DOCBGD_ID" = requested_document_id
      and not job."Job_IsDeleted"
      and office."Company_ID" = app_user."Company_ID"
      and render."DOCBRJ_StatusCode" in ('completed', 'completed_with_warnings')
      and generated."DOCBGD_StorageBucket" is not null
      and generated."DOCBGD_StoragePath" is not null;
  elsif requested_kind = 'booking_attachment' then
    if not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
      raise exception 'Booking access is not authorised.' using errcode = '42501';
    end if;
    select stored."DOCStoredObject_Container" bucket,
      stored."DOCStoredObject_BlobName" path,
      stored."DOCStoredObject_OriginalFileName" file_name
      into strict selected
    from public."Job_Documents" document
    join public."Job_Header" job on job."Job_ID" = document."JobDoc_JobID"
    join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    join public."cmp_Users_Offices" membership on membership."Office_ID" = office."Office_ID"
      and membership."User_ID" = app_user."User_ID"
    join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" = document."JobDoc_StoredObjectID"
    where document."JobDoc_ID" = requested_document_id
      and not document."JobDoc_IsDeleted" and not job."Job_IsDeleted"
      and office."Company_ID" = app_user."Company_ID"
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null;
  elsif requested_kind = 'customs_declaration' then
    if not booking_api.has_permission(caller_auth_user_id, 'Customs.Read') then
      raise exception 'Customs access is not authorised.' using errcode = '42501';
    end if;
    select file."CUSTD_StorageBucket" bucket,
      file."CUSTD_StoragePath" path,
      file."CUSTD_FileName" file_name into strict selected
    from public."Customs_DeclarationDocuments" file
    join public."Customs_Declarations" declaration on declaration."CUST_id" = file."CUSTD_CustomsID"
    where file."CUSTD_ID" = requested_document_id
      and not declaration."CUST_IsDeleted"
      and public.customs_declaration_authorised(caller_auth_user_id, declaration."CUST_id", false, false);
  elsif requested_kind = 'finance_pdf' then
    if not document_api.has_permission(caller_auth_user_id, 'Finance.Receivables.View') then
      raise exception 'Finance access is not authorised.' using errcode = '42501';
    end if;
    select stored."DOCStoredObject_Container" bucket,
      stored."DOCStoredObject_BlobName" path,
      stored."DOCStoredObject_OriginalFileName" file_name into strict selected
    from public."DOC_StoredObjects" stored
    join public."FIN_Documents" invoice on invoice."FINDoc_ID" = stored."DOCStoredObject_AggregateID"
      and invoice."FINDoc_TypeCode" = 'sl_invoice'
      and invoice."FINDoc_StatusCode" in ('approved', 'submitted')
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = invoice."FINDoc_LegalEntityID"
    where stored."DOCStoredObject_ID" = requested_document_id
      and entity."Company_ID" = app_user."Company_ID"
      and stored."DOCStoredObject_AggregateType" = 'finance_document'
      and stored."DOCStoredObject_ConcernCode" = 'finance'
      and stored."DOCStoredObject_MimeType" = 'application/pdf'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null;
  elsif requested_kind = 'quote_pdf' then
    if not quote_api.has_permission(caller_auth_user_id, 'Quotes.Read') then
      raise exception 'Quote access is not authorised.' using errcode = '42501';
    end if;
    select stored."DOCStoredObject_Container" bucket,
      stored."DOCStoredObject_BlobName" path,
      stored."DOCStoredObject_OriginalFileName" file_name
      into strict selected
    from quote_api.customer_response_links link
    join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID" = link.quote_id
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    join public."cmp_Users_Offices" membership on membership."Office_ID" = office."Office_ID"
      and membership."User_ID" = app_user."User_ID"
    join public."DOC_StoredObjects" stored on stored."DOCStoredObject_ID" = link.quote_document_id
    where stored."DOCStoredObject_ID" = requested_document_id
      and link.company_id = app_user."Company_ID"
      and link.delivery_status_code = 'sent'
      and not quote."CusQuoteHeader_IsDeleted"
      and office."Company_ID" = app_user."Company_ID"
      and stored."DOCStoredObject_ConcernCode" = 'quote'
      and stored."DOCStoredObject_AggregateType" = 'CusQuote_Header'
      and stored."DOCStoredObject_AggregateID" = quote."CusQuoteHeader_ID"
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null;
  else
    raise exception 'Unsupported document type.' using errcode = '22023';
  end if;

  return jsonb_build_object('bucket', selected.bucket, 'path', selected.path,
    'fileName', selected.file_name);
exception when no_data_found or too_many_rows then
  raise exception 'Document access is not authorised.' using errcode = '42501';
end $$;

revoke all on function document_api.authorize_unified_download(uuid,text,uuid) from public, anon, authenticated;
grant execute on function document_api.authorize_unified_download(uuid,text,uuid) to service_role;
