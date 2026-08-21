begin;

alter table quote_api.customer_response_links
  add column if not exists quote_document_id uuid
  references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete restrict;

create index if not exists customer_response_links_document_idx
  on quote_api.customer_response_links (quote_document_id)
  where quote_document_id is not null;

create or replace function quote_api.bind_customer_response_document(
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
  if link_row.status_code <> 'active' then
    raise exception 'That quote response link is no longer active.' using errcode = '22023';
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

create or replace function quote_api.customer_response_view(
  requested_token_hash text,
  requested_response_origin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link_row record;
  version_row record;
  quote_row record;
  response_row record;
begin
  if requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This quote link is invalid.' using errcode = 'P0002';
  end if;
  select link.* into link_row
  from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin then
    raise exception 'This quote link is not available on this workspace.' using errcode = 'P0002';
  end if;

  if link_row.status_code = 'active' and link_row.expires_at is not null and link_row.expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;
  if link_row.status_code = 'revoked' then return jsonb_build_object('state', 'revoked'); end if;
  select response.* into response_row
  from quote_api.customer_responses response
  where response.response_link_id = link_row.response_link_id;
  if found then
    return jsonb_build_object(
      'state', 'responded',
      'decision', response_row.decision_code,
      'respondedAt', response_row.created_at
    );
  end if;

  select version.* into strict version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID" = link_row.quote_version_id;
  select quote.* into strict quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = link_row.quote_id;

  return jsonb_build_object(
    'state', 'active',
    'expiresAt', link_row.expires_at,
    'recipientName', link_row.recipient_name,
    'recipientEmail', link_row.recipient_email,
    'documentId', link_row.quote_document_id,
    'quote', jsonb_build_object(
      'id', quote_row."CusQuoteHeader_ID",
      'reference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
      'versionNumber', version_row."CusQuoteVersion_Number",
      'snapshot', version_row."CusQuoteVersion_SnapshotJSON",
      'customerName', coalesce(
        version_row."CusQuoteVersion_SnapshotJSON"#>>'{quote,customerName}',
        quote_row."CusQuoteHeader_CustomerNameSnapshot"
      ),
      'contactName', coalesce(
        version_row."CusQuoteVersion_SnapshotJSON"#>>'{quote,contactName}',
        quote_row."CusQuoteHeader_ContactNameSnapshot"
      )
    )
  );
exception
  when no_data_found then
    raise exception 'This quote link is no longer available.' using errcode = 'P0002';
end;
$$;

create or replace function public.quote_workflow_bind_customer_response_document(
  requested_response_link_id uuid,
  requested_quote_document_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select quote_api.bind_customer_response_document(requested_response_link_id, requested_quote_document_id)
$$;

revoke all on function quote_api.bind_customer_response_document(uuid,uuid) from public, anon, authenticated;
revoke all on function quote_api.customer_response_view(text,text) from public, anon, authenticated;
revoke all on function public.quote_workflow_bind_customer_response_document(uuid,uuid) from public, anon, authenticated;
grant execute on function public.quote_workflow_bind_customer_response_document(uuid,uuid) to service_role;

commit;
