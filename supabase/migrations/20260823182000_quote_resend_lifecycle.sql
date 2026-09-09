-- Allow an accepted quote to be revised and reissued as a new customer decision cycle.
-- The original accepted version and linked booking remain immutable evidence; the
-- latest delivered version and latest customer response own the current quote status.

begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'CusQuote_Header'
     ) then
    alter publication supabase_realtime add table public."CusQuote_Header";
  end if;
end;
$$;

create or replace function public.quote_workflow_save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_quote_id is not null
     and quote_api.has_permission(caller_auth_user_id, 'Quotes.Write')
     and exists (
       select 1
       from public."CusQuote_Header" quote
       join public."cmp_Offices" office
         on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
       join public."cmp_Users" app_user
         on app_user."Auth_User_ID" = caller_auth_user_id
        and app_user."Company_ID" = office."Company_ID"
        and app_user."User_AccessStatus" = 'active'
       where quote."CusQuoteHeader_ID" = requested_quote_id
         and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
         and not quote."CusQuoteHeader_IsDeleted"
     ) then
    update public."CusQuote_Header" set
      "CusQuoteHeader_LifecycleCode" = 'revised',
      "CusQuoteHeader_Status" = 1
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  return quote_api.save_quote(caller_auth_user_id, requested_quote_id, payload);
end;
$$;

create or replace function public.quote_workflow_issue_customer_response_v3(
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
  previous_contact_name text;
  previous_contact_email text;
  issued jsonb;
  link_id uuid;
begin
  if requested_recipient_source not in ('saved', 'manual') then
    raise exception 'Choose a saved contact or a manual email address.' using errcode = '22023';
  end if;
  if requested_delivery_mode not in ('standard', 'simple') then
    raise exception 'Choose Standard or Simple quote delivery.' using errcode = '22023';
  end if;

  if quote_api.has_permission(caller_auth_user_id, 'Quotes.Write')
     and exists (
       select 1
       from public."CusQuote_Header" quote
       join public."cmp_Offices" office
         on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
       join public."cmp_Users" app_user
         on app_user."Auth_User_ID" = caller_auth_user_id
        and app_user."Company_ID" = office."Company_ID"
        and app_user."User_AccessStatus" = 'active'
       where quote."CusQuoteHeader_ID" = requested_quote_id
         and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
         and not quote."CusQuoteHeader_IsDeleted"
     ) then
    update public."CusQuote_Header" set
      "CusQuoteHeader_LifecycleCode" = 'revised',
      "CusQuoteHeader_Status" = 1
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  select "CusQuoteHeader_ContactNameSnapshot", "CusQuoteHeader_ContactEmailSnapshot"
  into previous_contact_name, previous_contact_email
  from public."CusQuote_Header"
  where "CusQuoteHeader_ID" = requested_quote_id
  for update;

  issued := quote_api.issue_customer_response(
    caller_auth_user_id,
    requested_quote_id,
    requested_recipient_name,
    requested_recipient_email,
    requested_response_origin,
    requested_token_hash,
    requested_expires_at
  );
  link_id := (issued ->> 'responseLinkId')::uuid;

  update quote_api.customer_response_links set
    delivery_mode_code = requested_delivery_mode,
    recipient_source_code = requested_recipient_source
  where response_link_id = link_id;

  if requested_recipient_source = 'manual' then
    update public."CusQuote_Header" set
      "CusQuoteHeader_ContactNameSnapshot" = previous_contact_name,
      "CusQuoteHeader_ContactEmailSnapshot" = previous_contact_email
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  update public."CusQuote_Events" set
    "CusQuoteEvent_Summary" = case
      when requested_delivery_mode = 'simple' then 'Simple quote email prepared without customer response controls.'
      else 'Secure customer response link issued.'
    end,
    "CusQuoteEvent_MetadataJSON" = coalesce("CusQuoteEvent_MetadataJSON", '{}'::jsonb)
      || jsonb_build_object(
        'deliveryMode', requested_delivery_mode,
        'recipientSource', requested_recipient_source,
        'recipientEmail', lower(btrim(requested_recipient_email)),
        'responseControlsEnabled', requested_delivery_mode = 'standard',
        'reissue', true
      )
  where "CusQuoteHeader_ID" = requested_quote_id
    and "CusQuoteEvent_TypeCode" = 'customer_link_issued'
    and "CusQuoteEvent_MetadataJSON" ->> 'responseLinkId' = link_id::text;

  return issued || jsonb_build_object(
    'deliveryMode', requested_delivery_mode,
    'recipientSource', requested_recipient_source
  );
end;
$$;

revoke all on function public.quote_workflow_issue_customer_response_v3(uuid,uuid,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_issue_customer_response_v3(uuid,uuid,text,text,text,text,text,text,timestamptz)
  to service_role;

comment on function public.quote_workflow_issue_customer_response_v3(uuid,uuid,text,text,text,text,text,text,timestamptz)
is 'Issues or reissues the latest saved quote version. Reissuing starts a new customer response cycle while preserving prior accepted-version and booking evidence. Direct sending remains outside Dexter and requires the operator quote-send review flow.';

commit;
