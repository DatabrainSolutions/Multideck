-- The customer is part of a quote's master identity. Older clients, Dexter or
-- direct workflow callers must not bypass the UI guard and reassign an
-- established quote to another customer.

begin;

create or replace function quote_api.save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_version_id uuid;
  prior_version_number integer;
  prior_version_is_submitted boolean := false;
  prior_lifecycle text;
  prior_customer_id uuid;
  requested_customer_id uuid := nullif(payload ->> 'customerId', '')::uuid;
  transient_version_id uuid;
  transient_version record;
  saved jsonb;
begin
  if requested_quote_id is not null then
    select
      quote."CusQuoteHeader_LifecycleCode",
      quote."CusQuoteHeader_CustomerID"
      into prior_lifecycle, prior_customer_id
    from public."CusQuote_Header" quote
    where quote."CusQuoteHeader_ID" = requested_quote_id
      and not quote."CusQuoteHeader_IsDeleted";

    if prior_customer_id is not null
       and requested_customer_id is distinct from prior_customer_id then
      raise exception 'Changing the customer requires a separate quote number.'
        using errcode = '22023';
    end if;

    select version."CusQuoteVersion_ID",
      version."CusQuoteVersion_Number",
      version."CusQuoteVersion_IsSubmitted"
      into prior_version_id, prior_version_number, prior_version_is_submitted
    from public."CusQuote_Versions" version
    where version."CusQuoteHeader_ID" = requested_quote_id
      and version."CusQuoteVersion_IsCurrent"
    order by version."CusQuoteVersion_Number" desc
    limit 1;

    prior_version_is_submitted := coalesce(prior_version_is_submitted, false)
      or coalesce(prior_lifecycle in ('sent', 'accepted', 'declined', 'ghosted', 'changes_requested'), false)
      or exists (
        select 1
        from quote_api.customer_response_links link
        where link.quote_id = requested_quote_id
          and link.quote_version_id = prior_version_id
      )
      or exists (
        select 1
        from quote_api.customer_responses response
        where response.quote_id = requested_quote_id
          and response.quote_version_id = prior_version_id
      );
  end if;

  saved := quote_api.save_quote_legacy_20260903(caller_auth_user_id, requested_quote_id, payload);
  transient_version_id := nullif(saved ->> 'versionId', '')::uuid;

  if requested_quote_id is not null
     and prior_version_id is not null
     and not prior_version_is_submitted
     and transient_version_id is not null
     and transient_version_id <> prior_version_id then
    select version.* into strict transient_version
    from public."CusQuote_Versions" version
    where version."CusQuoteVersion_ID" = transient_version_id;

    update public."CusQuote_Versions"
    set "CusQuoteVersion_IsCurrent" = false
    where "CusQuoteVersion_ID" = transient_version_id;

    update public."CusQuote_Versions"
    set "CusQuoteVersion_SnapshotJSON" = transient_version."CusQuoteVersion_SnapshotJSON",
        "CusQuoteVersion_StatusCode" = 'draft',
        "CusQuoteVersion_IsCurrent" = true
    where "CusQuoteVersion_ID" = prior_version_id;

    delete from public."CusQuote_Events"
    where "CusQuoteVersion_ID" = transient_version_id
      and "CusQuoteEvent_TypeCode" in ('created', 'saved');

    delete from public."CusQuote_Versions"
    where "CusQuoteVersion_ID" = transient_version_id;

    return saved || jsonb_build_object(
      'versionId', prior_version_id,
      'versionNumber', prior_version_number,
      'versionState', 'draft'
    );
  end if;

  if transient_version_id is not null and not prior_version_is_submitted then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_StatusCode" = 'draft',
        "CusQuoteVersion_IsSubmitted" = false,
        "CusQuoteVersion_SubmittedAt" = null,
        "CusQuoteVersion_SubmittedBy" = null
    where "CusQuoteVersion_ID" = transient_version_id;
    return saved || jsonb_build_object('versionState', 'draft');
  end if;

  if transient_version_id is not null then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_StatusCode" = 'draft',
        "CusQuoteVersion_IsSubmitted" = false,
        "CusQuoteVersion_SubmittedAt" = null,
        "CusQuoteVersion_SubmittedBy" = null
    where "CusQuoteVersion_ID" = transient_version_id;
    return saved || jsonb_build_object('versionState', 'draft');
  end if;

  return saved;
end;
$$;

revoke all on function quote_api.save_quote(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function quote_api.save_quote(uuid, uuid, jsonb)
  to service_role;

comment on function quote_api.save_quote(uuid, uuid, jsonb)
is 'Persists one mutable quote draft while preventing an established quote from being reassigned to another customer; create a separate master quote instead.';

commit;
