-- Changing the customer on an established quote creates a separate master
-- quote. Preserve the source quote, remove cross-customer commercial values,
-- and keep a two-way audit trail between the records.

begin;

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
declare
  saved jsonb;
  saved_quote_id uuid;
  saved_version_id uuid;
  version_summary jsonb;
  committed_events jsonb;
  actor_user_id uuid;
  actor_company_id uuid;
  source_quote_id uuid;
  source_quote_reference text;
  source_version_id uuid;
  target_quote_reference text;
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
         and quote."CusQuoteHeader_LifecycleCode" in ('accepted', 'changes_requested')
         and not quote."CusQuoteHeader_IsDeleted"
     ) then
    update public."CusQuote_Header"
    set
      "CusQuoteHeader_LifecycleCode" = 'revised',
      "CusQuoteHeader_Status" = 1
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  saved := quote_api.save_quote(caller_auth_user_id, requested_quote_id, payload);
  saved_quote_id := (saved ->> 'quoteId')::uuid;
  saved_version_id := (saved ->> 'versionId')::uuid;
  target_quote_reference := saved ->> 'reference';

  -- The client can request copy provenance only while creating a new master
  -- quote. Validate the source against the actor's physical tenant before
  -- recording either side of the audit link.
  if requested_quote_id is null
     and coalesce(payload #>> '{shipmentFacts,copiedFromQuoteId}', '')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    source_quote_id := (payload #>> '{shipmentFacts,copiedFromQuoteId}')::uuid;

    select app_user."User_ID", app_user."Company_ID"
      into strict actor_user_id, actor_company_id
    from public."cmp_Users" app_user
    where app_user."Auth_User_ID" = caller_auth_user_id
      and app_user."User_AccessStatus" = 'active';

    select
      coalesce(
        nullif(payload #>> '{shipmentFacts,copiedFromQuoteReference}', ''),
        current_version."CusQuoteVersion_SnapshotJSON" ->> 'reference',
        'Q-' || source_quote."CusQuoteHeader_Number"
      ),
      current_version."CusQuoteVersion_ID"
      into source_quote_reference, source_version_id
    from public."CusQuote_Header" source_quote
    join public."cmp_Offices" source_office
      on source_office."Office_ID" = coalesce(source_quote."CusQuoteHeader_OrgOfficeID", source_quote."OrgOffice_ID")
     and source_office."Company_ID" = actor_company_id
    left join lateral (
      select version."CusQuoteVersion_ID", version."CusQuoteVersion_SnapshotJSON"
      from public."CusQuote_Versions" version
      where version."CusQuoteHeader_ID" = source_quote."CusQuoteHeader_ID"
      order by version."CusQuoteVersion_IsCurrent" desc, version."CusQuoteVersion_Number" desc
      limit 1
    ) current_version on true
    where source_quote."CusQuoteHeader_ID" = source_quote_id
      and not source_quote."CusQuoteHeader_IsDeleted";

    if found and source_quote_id <> saved_quote_id then
      update public."CusQuote_Events"
      set
        "CusQuoteEvent_Summary" = 'Quote created from ' || source_quote_reference || ' for a different customer.',
        "CusQuoteEvent_MetadataJSON" = coalesce("CusQuoteEvent_MetadataJSON", '{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
            'copyReason', 'customer_changed',
            'copiedFromQuoteId', source_quote_id,
            'copiedFromQuoteReference', source_quote_reference,
            'customerId', nullif(payload ->> 'customerId', ''),
            'customerName', nullif(payload ->> 'customerName', ''),
            'commercialValuesReset', true
          ))
      where "CusQuoteHeader_ID" = saved_quote_id
        and "CusQuoteVersion_ID" = saved_version_id
        and "CusQuoteEvent_TypeCode" = 'created';

      insert into public."CusQuote_Events" (
        "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID",
        "CusQuoteEvent_TypeCode", "CusQuoteEvent_Summary",
        "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
      ) values (
        actor_company_id, source_quote_id, source_version_id,
        'copied_to_new_quote',
        'Quote copied to ' || target_quote_reference || ' for ' || coalesce(nullif(payload ->> 'customerName', ''), 'a different customer') || '.',
        jsonb_strip_nulls(jsonb_build_object(
          'copyReason', 'customer_changed',
          'newQuoteId', saved_quote_id,
          'newQuoteReference', target_quote_reference,
          'customerId', nullif(payload ->> 'customerId', ''),
          'customerName', nullif(payload ->> 'customerName', ''),
          'commercialValuesReset', true
        )),
        actor_user_id
      );
    end if;
  end if;

  select jsonb_build_object(
    'CusQuoteVersion_ID', version."CusQuoteVersion_ID",
    'CusQuoteVersion_Number', version."CusQuoteVersion_Number",
    'CusQuoteVersion_StatusCode', version."CusQuoteVersion_StatusCode",
    'CusQuoteVersion_IsCurrent', version."CusQuoteVersion_IsCurrent",
    'CusQuoteVersion_IsSubmitted', version."CusQuoteVersion_IsSubmitted",
    'CusQuoteVersion_CreatedAt', version."CusQuoteVersion_CreatedAt",
    'CusQuoteVersion_SubmittedAt', version."CusQuoteVersion_SubmittedAt",
    'CusQuoteVersion_SubmittedBy', version."CusQuoteVersion_SubmittedBy",
    'CusQuoteVersion_SnapshotJSON', version."CusQuoteVersion_SnapshotJSON"
  ) into strict version_summary
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = saved_quote_id
    and version."CusQuoteVersion_ID" = saved_version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'CusQuoteEvent_ID', event."CusQuoteEvent_ID",
    'CusQuoteEvent_TypeCode', event."CusQuoteEvent_TypeCode",
    'CusQuoteEvent_Summary', event."CusQuoteEvent_Summary",
    'CusQuoteEvent_OccurredAt', event."CusQuoteEvent_OccurredAt",
    'CusQuoteEvent_MetadataJSON', event."CusQuoteEvent_MetadataJSON",
    'cmp_Users', jsonb_build_object(
      'User_Firstname', actor."User_Firstname",
      'User_Lastname', actor."User_Lastname"
    )
  ) order by event."CusQuoteEvent_OccurredAt" desc), '[]'::jsonb)
  into committed_events
  from public."CusQuote_Events" event
  left join public."cmp_Users" actor
    on actor."User_ID" = event."CusQuoteEvent_ActorUserID"
  where event."CusQuoteHeader_ID" = saved_quote_id
    and event."CusQuoteVersion_ID" = saved_version_id;

  return saved || jsonb_build_object(
    'readiness', booking_api.quote_readiness(saved_quote_id),
    'version', version_summary,
    'events', committed_events
  );
end;
$$;

revoke all on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
  to service_role;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'estimatedDeparture', quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture',
      'estimatedArrival', quote."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival',
      'copiedFromQuoteId', quote."CusQuoteHeader_ShipmentFactsJSON"->>'copiedFromQuoteId',
      'copiedFromQuoteReference', quote."CusQuoteHeader_ShipmentFactsJSON"->>'copiedFromQuoteReference',
      'customerResponse', case
        when response.response_id is null then item.value->'customerResponse'
        else coalesce(item.value->'customerResponse', '{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object('declineReasonCode', response.decline_reason_code))
      end
    )) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_domain_quotes_before_route_schedule_20260902(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join public."CusQuote_Header" quote
    on quote."CusQuoteHeader_ID" = nullif(item.value->>'recordId', '')::uuid
   and not quote."CusQuoteHeader_IsDeleted"
  left join lateral (
    select response.response_id, response.decline_reason_code
    from quote_api.customer_responses response
    where response.quote_id = quote."CusQuoteHeader_ID"
      and response.company_id = p_company_id
    order by response.created_at desc
    limit 1
  ) response on true;
$$;

revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_quotes(uuid, text, integer)
  to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quote versions, delivery and response evidence, routing, commercial evidence and copy provenance. A customer change creates a separately numbered quote and clears customer-specific commercial values.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Event-driven quote lifecycle, creation, customer, ETD, ETA, validity, customer response, confirmed delivery, recipient, quote-document and linked-booking changes.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

comment on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
is 'Saves mutable quote drafts and records tenant-safe provenance when an established quote is copied to a new master quote for a different customer.';

commit;
