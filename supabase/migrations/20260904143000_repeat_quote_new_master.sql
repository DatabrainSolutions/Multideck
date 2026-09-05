-- A repeat enquiry is a separately numbered quote for the same customer. It
-- may reuse operational detail, but its schedule and commercial values must be
-- reviewed again. Keep exact source provenance without weakening the existing
-- customer-change boundary.

begin;

alter function public.quote_workflow_save_quote(uuid, uuid, jsonb)
  rename to quote_workflow_save_quote_before_repeat_20260904;

revoke all on function public.quote_workflow_save_quote_before_repeat_20260904(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

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
  copy_reason text := nullif(payload #>> '{shipmentFacts,copyReason}', '');
  source_quote_id uuid;
  source_quote_reference text;
  source_customer_id uuid;
  target_customer_id uuid := nullif(payload ->> 'customerId', '')::uuid;
  actor_company_id uuid;
  saved jsonb;
  saved_quote_id uuid;
  saved_version_id uuid;
  target_quote_reference text;
  committed_events jsonb;
begin
  if requested_quote_id is null and copy_reason = 'repeat_quote' then
    if coalesce(payload #>> '{shipmentFacts,copiedFromQuoteId}', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Choose a valid source quote before creating a repeat quote.'
        using errcode = '22023';
    end if;

    source_quote_id := (payload #>> '{shipmentFacts,copiedFromQuoteId}')::uuid;

    select app_user."Company_ID"
      into strict actor_company_id
    from public."cmp_Users" app_user
    where app_user."Auth_User_ID" = caller_auth_user_id
      and app_user."User_AccessStatus" = 'active';

    select source_quote."CusQuoteHeader_CustomerID",
      coalesce(
        nullif(payload #>> '{shipmentFacts,copiedFromQuoteReference}', ''),
        current_version."CusQuoteVersion_SnapshotJSON" ->> 'reference',
        'Q-' || source_quote."CusQuoteHeader_Number"
      )
      into source_customer_id, source_quote_reference
    from public."CusQuote_Header" source_quote
    join public."cmp_Offices" source_office
      on source_office."Office_ID" = coalesce(source_quote."CusQuoteHeader_OrgOfficeID", source_quote."OrgOffice_ID")
     and source_office."Company_ID" = actor_company_id
    left join lateral (
      select version."CusQuoteVersion_SnapshotJSON"
      from public."CusQuote_Versions" version
      where version."CusQuoteHeader_ID" = source_quote."CusQuoteHeader_ID"
      order by version."CusQuoteVersion_IsCurrent" desc, version."CusQuoteVersion_Number" desc
      limit 1
    ) current_version on true
    where source_quote."CusQuoteHeader_ID" = source_quote_id
      and not source_quote."CusQuoteHeader_IsDeleted";

    if not found then
      raise exception 'The source quote is not available in this workspace.'
        using errcode = '42501';
    end if;

    if target_customer_id is null or target_customer_id is distinct from source_customer_id then
      raise exception 'A repeat quote must keep the source quote customer.'
        using errcode = '22023';
    end if;
  elsif copy_reason is not null and copy_reason <> 'customer_changed' then
    raise exception 'Unsupported quote copy reason.' using errcode = '22023';
  end if;

  saved := public.quote_workflow_save_quote_before_repeat_20260904(
    caller_auth_user_id,
    requested_quote_id,
    payload
  );

  if requested_quote_id is null and copy_reason = 'repeat_quote' then
    saved_quote_id := (saved ->> 'quoteId')::uuid;
    saved_version_id := (saved ->> 'versionId')::uuid;
    target_quote_reference := saved ->> 'reference';

    update public."CusQuote_Events"
    set
      "CusQuoteEvent_Summary" = 'Repeat quote created from ' || source_quote_reference || '.',
      "CusQuoteEvent_MetadataJSON" = (coalesce("CusQuoteEvent_MetadataJSON", '{}'::jsonb) - 'copyReason')
        || jsonb_build_object(
          'copyReason', 'repeat_quote',
          'scheduleReset', true,
          'commercialValuesReset', true
        )
    where "CusQuoteHeader_ID" = saved_quote_id
      and "CusQuoteVersion_ID" = saved_version_id
      and "CusQuoteEvent_TypeCode" = 'created';

    update public."CusQuote_Events"
    set
      "CusQuoteEvent_Summary" = 'Quote copied to ' || target_quote_reference || ' as a repeat enquiry.',
      "CusQuoteEvent_MetadataJSON" = (coalesce("CusQuoteEvent_MetadataJSON", '{}'::jsonb) - 'copyReason')
        || jsonb_build_object(
          'copyReason', 'repeat_quote',
          'scheduleReset', true,
          'commercialValuesReset', true
        )
    where "CusQuoteHeader_ID" = source_quote_id
      and "CusQuoteEvent_TypeCode" = 'copied_to_new_quote'
      and "CusQuoteEvent_MetadataJSON" ->> 'newQuoteId' = saved_quote_id::text;

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

    saved := saved || jsonb_build_object('events', committed_events);
  end if;

  return saved;
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
      'copyReason', quote."CusQuoteHeader_ShipmentFactsJSON"->>'copyReason',
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
  "AIDexterDomain_Description" = 'Customer quote versions, delivery and response evidence, routing, commercial evidence and copy provenance. Customer changes and repeat enquiries create separately numbered quotes; repeat enquiries keep the customer while resetting schedule and commercial values.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

comment on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
is 'Saves quote drafts and creates tenant-safe, same-customer repeat quotes with reset schedule and commercial evidence.';

commit;
