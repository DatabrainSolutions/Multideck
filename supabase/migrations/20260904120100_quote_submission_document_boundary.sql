-- Make confirmed customer delivery the immutable quote-version boundary.
-- A prepared response link is deliberately unusable until the mail provider
-- confirms delivery and the workflow finalises the send transaction.

begin;

create or replace function quote_api.mark_quote_version_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_status_code <> 'sent'
     or new.status_code not in ('active', 'revoked') then
    return new;
  end if;

  update public."CusQuote_Versions"
  set "CusQuoteVersion_IsSubmitted" = true,
      "CusQuoteVersion_SubmittedAt" = coalesce("CusQuoteVersion_SubmittedAt", now()),
      "CusQuoteVersion_SubmittedBy" = coalesce("CusQuoteVersion_SubmittedBy", new.created_by),
      "CusQuoteVersion_StatusCode" = case
        when "CusQuoteVersion_StatusCode" in ('accepted', 'declined', 'changes_requested') then "CusQuoteVersion_StatusCode"
        else 'submitted'
      end
  where "CusQuoteVersion_ID" = new.quote_version_id
    and "CusQuoteHeader_ID" = new.quote_id;

  if not found then
    raise exception 'The quote version for this response link is unavailable.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_ResponseLinks_mark_version_submitted" on quote_api.customer_response_links;
create trigger "TR_CusQuote_ResponseLinks_mark_version_submitted"
after insert or update of delivery_status_code, status_code on quote_api.customer_response_links
for each row
when (new.delivery_status_code = 'sent' and new.status_code in ('active', 'revoked'))
execute function quote_api.mark_quote_version_submitted();

create or replace function public.quote_workflow_prepare_customer_response_v4(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_recipient_name text,
  requested_recipient_email text,
  requested_recipient_source text,
  requested_delivery_mode text,
  requested_response_origin text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  version_row record;
  readiness jsonb;
  link_id uuid;
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote issue is not authorised.' using errcode = '42501';
  end if;
  if requested_recipient_source not in ('saved', 'manual') then
    raise exception 'Choose a saved contact or a manual email address.' using errcode = '22023';
  end if;
  if requested_delivery_mode not in ('standard', 'simple') then
    raise exception 'Choose Standard or Simple quote delivery.' using errcode = '22023';
  end if;
  if requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The quote response token is invalid.' using errcode = '22023';
  end if;
  if requested_recipient_email is null
     or requested_recipient_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid customer email address.' using errcode = '22023';
  end if;
  if requested_response_origin is null or not (
    requested_response_origin ~ '^https://([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.multideck\.app$'
    or requested_response_origin ~ '^https?://(localhost|127\.0\.0\.1):3000$'
  ) then
    raise exception 'The quote response workspace is invalid.' using errcode = '22023';
  end if;
  if requested_expires_at is not null
     and (requested_expires_at <= now() or requested_expires_at > now() + interval '90 days') then
    raise exception 'Choose a quote response expiry within 90 days, or never.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted"
  for update of quote;
  if not found then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;

  readiness := booking_api.quote_readiness(requested_quote_id);
  if not coalesce((readiness->>'ready')::boolean, false) then
    raise exception 'Complete the required quote fields before sending it.' using errcode = '22023', detail = readiness::text;
  end if;

  select version.* into version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = requested_quote_id
    and version."CusQuoteVersion_IsCurrent"
  order by version."CusQuoteVersion_Number" desc
  limit 1
  for update;
  if not found then
    raise exception 'Save the quote before sending it.' using errcode = '22023';
  end if;
  if version_row."CusQuoteVersion_StatusCode" in ('accepted', 'declined', 'changes_requested') then
    raise exception 'Create a new quote version before sending another customer decision cycle.' using errcode = '22023';
  end if;

  insert into quote_api.customer_response_links (
    company_id, quote_id, quote_version_id, recipient_name, recipient_email,
    response_origin, token_hash, status_code, expires_at, revoked_at,
    delivery_status_code, delivery_mode_code, recipient_source_code, created_by
  ) values (
    app_user."Company_ID", requested_quote_id, version_row."CusQuoteVersion_ID",
    left(nullif(btrim(requested_recipient_name), ''), 180), lower(btrim(requested_recipient_email)),
    requested_response_origin, requested_token_hash, 'revoked', requested_expires_at, null,
    'pending', requested_delivery_mode, requested_recipient_source, app_user."User_ID"
  ) returning response_link_id into link_id;

  return jsonb_build_object(
    'responseLinkId', link_id,
    'quoteId', requested_quote_id,
    'quoteVersionId', version_row."CusQuoteVersion_ID",
    'versionNumber', version_row."CusQuoteVersion_Number",
    'reference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
    'expiresAt', requested_expires_at,
    'responseOrigin', requested_response_origin,
    'recipientEmail', lower(btrim(requested_recipient_email)),
    'deliveryMode', requested_delivery_mode,
    'recipientSource', requested_recipient_source
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

create or replace function public.quote_workflow_bind_pending_customer_response_document_v4(
  requested_response_link_id uuid,
  requested_quote_document_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row record;
begin
  select link.* into link_row
  from quote_api.customer_response_links link
  where link.response_link_id = requested_response_link_id
  for update;
  if not found then
    raise exception 'That quote response link could not be found.' using errcode = 'P0002';
  end if;
  if link_row.delivery_status_code <> 'pending' or link_row.status_code <> 'revoked' then
    raise exception 'That quote response is no longer awaiting delivery.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public."DOC_StoredObjects" stored
    join public."cmp_Users" creator
      on creator."User_ID" = stored."DOCStoredObject_CreatedBy"
    where stored."DOCStoredObject_ID" = requested_quote_document_id
      and stored."DOCStoredObject_ConcernCode" = 'quote'
      and stored."DOCStoredObject_AggregateType" = 'CusQuote_Header'
      and stored."DOCStoredObject_AggregateID" = link_row.quote_id
      and stored."DOCStoredObject_MimeType" = 'application/pdf'
      and stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_DeletedAt" is null
      and creator."Company_ID" = link_row.company_id
  ) then
    raise exception 'The quote PDF is outside this response link.' using errcode = '42501';
  end if;

  update quote_api.customer_response_links
  set quote_document_id = requested_quote_document_id
  where response_link_id = requested_response_link_id;
  return true;
end;
$$;

create or replace function public.quote_workflow_finalize_customer_response_v4(
  requested_response_link_id uuid,
  requested_provider_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row record;
  quote_row record;
  version_number integer;
  reissue boolean;
  final_status text;
begin
  select link.* into link_row
  from quote_api.customer_response_links link
  where link.response_link_id = requested_response_link_id
  for update;
  if not found then
    raise exception 'The quote response link was not found.' using errcode = 'P0002';
  end if;

  select quote.* into strict quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = link_row.quote_id
  for update;
  select version."CusQuoteVersion_Number" into strict version_number
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID" = link_row.quote_version_id
    and version."CusQuoteHeader_ID" = link_row.quote_id;

  if link_row.delivery_status_code = 'sent' then
    return jsonb_build_object(
      'responseLinkId', link_row.response_link_id,
      'quoteId', link_row.quote_id,
      'quoteVersionId', link_row.quote_version_id,
      'versionNumber', version_number,
      'reference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
      'expiresAt', link_row.expires_at,
      'recipientEmail', link_row.recipient_email,
      'deliveryMode', link_row.delivery_mode_code,
      'recipientSource', link_row.recipient_source_code
    );
  end if;
  if link_row.delivery_status_code <> 'pending' or link_row.status_code <> 'revoked' then
    raise exception 'That quote response is no longer awaiting delivery.' using errcode = '22023';
  end if;
  if link_row.quote_document_id is null then
    raise exception 'Attach the generated quote PDF before finalising delivery.' using errcode = '22023';
  end if;

  select exists (
    select 1 from quote_api.customer_response_links previous
    where previous.quote_id = link_row.quote_id
      and previous.response_link_id <> link_row.response_link_id
      and previous.delivery_status_code = 'sent'
  ) into reissue;

  update quote_api.customer_response_links
  set status_code = 'revoked', revoked_at = now()
  where quote_id = link_row.quote_id
    and response_link_id <> link_row.response_link_id
    and status_code = 'active';

  final_status := case when link_row.delivery_mode_code = 'standard' then 'active' else 'revoked' end;
  update quote_api.customer_response_links set
    status_code = final_status,
    revoked_at = case when final_status = 'revoked' then now() else null end,
    delivery_status_code = 'sent',
    delivery_provider_id = left(nullif(btrim(requested_provider_id), ''), 180),
    delivery_error = null
  where response_link_id = link_row.response_link_id;

  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = 'sent',
    "CusQuoteHeader_Status" = 4,
    "CusQuoteHeader_ContactEmailSnapshot" = case
      when link_row.recipient_source_code = 'saved' then link_row.recipient_email
      else "CusQuoteHeader_ContactEmailSnapshot"
    end,
    "CusQuoteHeader_ContactNameSnapshot" = case
      when link_row.recipient_source_code = 'saved' then coalesce(link_row.recipient_name, "CusQuoteHeader_ContactNameSnapshot")
      else "CusQuoteHeader_ContactNameSnapshot"
    end,
    "CusQuoteHeader_LastEditedBy" = link_row.created_by,
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = link_row.quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    link_row.company_id, link_row.quote_id, link_row.quote_version_id, 'customer_link_issued',
    case
      when link_row.delivery_mode_code = 'simple' then 'Simple quote email sent without customer response controls.'
      else 'Secure customer response link sent.'
    end,
    jsonb_build_object(
      'responseLinkId', link_row.response_link_id,
      'recipientEmail', link_row.recipient_email,
      'responseOrigin', link_row.response_origin,
      'expiresAt', link_row.expires_at,
      'deliveryMode', link_row.delivery_mode_code,
      'recipientSource', link_row.recipient_source_code,
      'responseControlsEnabled', link_row.delivery_mode_code = 'standard',
      'quoteDocumentId', link_row.quote_document_id,
      'versionNumber', version_number,
      'providerId', left(nullif(btrim(requested_provider_id), ''), 180),
      'reissue', reissue
    ),
    link_row.created_by
  );

  return jsonb_build_object(
    'responseLinkId', link_row.response_link_id,
    'quoteId', link_row.quote_id,
    'quoteVersionId', link_row.quote_version_id,
    'versionNumber', version_number,
    'reference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
    'expiresAt', link_row.expires_at,
    'responseOrigin', link_row.response_origin,
    'recipientEmail', link_row.recipient_email,
    'deliveryMode', link_row.delivery_mode_code,
    'recipientSource', link_row.recipient_source_code
  );
end;
$$;

create or replace function public.quote_workflow_fail_customer_response_v4(
  requested_response_link_id uuid,
  requested_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row record;
begin
  select link.* into link_row
  from quote_api.customer_response_links link
  where link.response_link_id = requested_response_link_id
  for update;
  if not found then
    raise exception 'The quote response link was not found.' using errcode = 'P0002';
  end if;
  if link_row.delivery_status_code = 'sent' then
    return false;
  end if;

  update quote_api.customer_response_links set
    status_code = 'revoked',
    revoked_at = coalesce(revoked_at, now()),
    delivery_status_code = 'failed',
    delivery_provider_id = null,
    delivery_error = left(coalesce(nullif(btrim(requested_error), ''), 'Quote email delivery failed.'), 2000)
  where response_link_id = requested_response_link_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    link_row.company_id, link_row.quote_id, link_row.quote_version_id, 'customer_delivery_failed',
    'Quote email delivery failed before submission.',
    jsonb_build_object(
      'responseLinkId', link_row.response_link_id,
      'recipientEmail', link_row.recipient_email,
      'deliveryMode', link_row.delivery_mode_code,
      'message', left(coalesce(nullif(btrim(requested_error), ''), 'Quote email delivery failed.'), 2000)
    ),
    link_row.created_by
  );
  return true;
end;
$$;

create or replace function public.quote_workflow_latest_customer_response_issue(
  caller_auth_user_id uuid,
  requested_quote_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_company_id uuid;
  issue jsonb;
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Read') then
    raise exception 'Quote access is not authorised.' using errcode = '42501';
  end if;
  select "Company_ID" into strict app_company_id
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';
  if not exists (
    select 1
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = requested_quote_id
      and office."Company_ID" = app_company_id
      and not quote."CusQuoteHeader_IsDeleted"
  ) then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'responseLinkId', link.response_link_id,
    'quoteDocumentId', link.quote_document_id,
    'deliveryMode', link.delivery_mode_code,
    'responseControlsEnabled', link.delivery_mode_code = 'standard',
    'recipientSource', link.recipient_source_code,
    'recipientName', link.recipient_name,
    'recipientEmail', link.recipient_email,
    'deliveryStatus', link.delivery_status_code,
    'responseStatus', link.status_code,
    'createdAt', link.created_at
  )) into issue
  from quote_api.customer_response_links link
  where link.quote_id = requested_quote_id
    and link.company_id = app_company_id
    and link.delivery_status_code = 'sent'
  order by link.created_at desc
  limit 1;

  return issue;
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

create or replace function public.quote_workflow_quote_documents(
  caller_auth_user_id uuid,
  requested_quote_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_company_id uuid;
  documents jsonb;
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Read') then
    raise exception 'Quote access is not authorised.' using errcode = '42501';
  end if;
  select "Company_ID" into strict app_company_id
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';
  if not exists (
    select 1
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = requested_quote_id
      and office."Company_ID" = app_company_id
      and not quote."CusQuoteHeader_IsDeleted"
  ) then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', stored."DOCStoredObject_ID",
    'versionId', link.quote_version_id,
    'versionNumber', version."CusQuoteVersion_Number",
    'fileName', stored."DOCStoredObject_OriginalFileName",
    'mimeType', stored."DOCStoredObject_MimeType",
    'fileSizeBytes', stored."DOCStoredObject_FileSizeBytes",
    'createdAt', stored."DOCStoredObject_CreatedAt",
    'recipientEmail', link.recipient_email,
    'deliveryMode', link.delivery_mode_code,
    'responseStatus', link.status_code,
    'container', stored."DOCStoredObject_Container",
    'blobName', stored."DOCStoredObject_BlobName"
  ) order by version."CusQuoteVersion_Number" desc, stored."DOCStoredObject_CreatedAt" desc), '[]'::jsonb)
  into documents
  from quote_api.customer_response_links link
  join public."CusQuote_Versions" version
    on version."CusQuoteVersion_ID" = link.quote_version_id
   and version."CusQuoteHeader_ID" = link.quote_id
  join public."DOC_StoredObjects" stored
    on stored."DOCStoredObject_ID" = link.quote_document_id
  where link.quote_id = requested_quote_id
    and link.company_id = app_company_id
    and link.delivery_status_code = 'sent'
    and stored."DOCStoredObject_ConcernCode" = 'quote'
    and stored."DOCStoredObject_AggregateType" = 'CusQuote_Header'
    and stored."DOCStoredObject_AggregateID" = requested_quote_id
    and stored."DOCStoredObject_MimeType" = 'application/pdf'
    and stored."DOCStoredObject_StatusCode" = 'active'
    and stored."DOCStoredObject_DeletedAt" is null;

  return documents;
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

revoke all on function quote_api.mark_quote_version_submitted() from public, anon, authenticated;
revoke all on function public.quote_workflow_prepare_customer_response_v4(uuid,uuid,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.quote_workflow_bind_pending_customer_response_document_v4(uuid,uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_finalize_customer_response_v4(uuid,text) from public, anon, authenticated;
revoke all on function public.quote_workflow_fail_customer_response_v4(uuid,text) from public, anon, authenticated;
revoke all on function public.quote_workflow_latest_customer_response_issue(uuid,uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_quote_documents(uuid,uuid) from public, anon, authenticated;

grant execute on function public.quote_workflow_prepare_customer_response_v4(uuid,uuid,text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.quote_workflow_bind_pending_customer_response_document_v4(uuid,uuid) to service_role;
grant execute on function public.quote_workflow_finalize_customer_response_v4(uuid,text) to service_role;
grant execute on function public.quote_workflow_fail_customer_response_v4(uuid,text) to service_role;
grant execute on function public.quote_workflow_latest_customer_response_issue(uuid,uuid) to service_role;
grant execute on function public.quote_workflow_quote_documents(uuid,uuid) to service_role;

comment on function public.quote_workflow_prepare_customer_response_v4(uuid,uuid,text,text,text,text,text,text,timestamptz)
is 'Stages an unusable quote response link without changing quote lifecycle, version immutability, or the previous active link.';
comment on function public.quote_workflow_finalize_customer_response_v4(uuid,text)
is 'After confirmed mail delivery, atomically freezes the version, records submission, and switches the active response link.';
comment on function public.quote_workflow_quote_documents(uuid,uuid)
is 'Returns tenant-authorised metadata for successfully delivered quote PDFs.';

commit;
