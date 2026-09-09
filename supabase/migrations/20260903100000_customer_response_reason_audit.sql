-- Store customer decline reasons as structured, immutable response evidence.
-- The existing operator quote-loss reasons remain a separate workflow.

begin;

alter table quote_api.customer_responses
  add column if not exists decline_reason_code varchar(60);

-- Responses created before this migration only had free-text context. Keep
-- those records intact and classify them as the explicit catch-all reason.
update quote_api.customer_responses
set decline_reason_code = 'other'
where decision_code = 'declined'
  and decline_reason_code is null;

alter table quote_api.customer_responses
  drop constraint if exists customer_responses_message,
  drop constraint if exists customer_responses_decline_reason;

alter table quote_api.customer_responses
  add constraint customer_responses_message check (
    decision_code in ('accepted', 'declined')
    or (customer_message is not null and nullif(btrim(customer_message), '') is not null)
  ),
  add constraint customer_responses_decline_reason check (
    (decision_code = 'declined' and decline_reason_code is not null and decline_reason_code in (
      'cost_too_high',
      'estimated_times_too_late',
      'found_cheaper_quote',
      'research_only',
      'job_no_longer_needed',
      'other'
    ))
    or (decision_code <> 'declined' and decline_reason_code is null)
  );

-- Customer responses are audit records. They are created by the secured
-- submission function and are not editable or removable by the application
-- service role after submission.
revoke update, delete on table quote_api.customer_responses from public, anon, authenticated, service_role;

create or replace function quote_api.submit_customer_response(
  requested_token_hash text,
  requested_response_origin text,
  requested_decision text,
  requested_message text default null,
  requested_competitor_document_id uuid default null,
  requested_source_ip_hash text default null,
  requested_user_agent text default null,
  requested_decline_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row record;
  quote_row record;
  response_id_value uuid;
  decision_value text := lower(btrim(coalesce(requested_decision, '')));
  decline_reason_value text := lower(btrim(coalesce(requested_decline_reason, '')));
  lifecycle_value text;
  booking_result jsonb;
  owner_user_id uuid;
begin
  if decision_value not in ('accepted', 'declined', 'challenged') then
    raise exception 'Choose accept, decline or request changes.' using errcode = '22023';
  end if;
  if decision_value = 'challenged' and nullif(btrim(requested_message), '') is null then
    raise exception 'Tell us what you would like us to review.' using errcode = '22023';
  end if;
  if decision_value = 'declined' and decline_reason_value not in (
    'cost_too_high',
    'estimated_times_too_late',
    'found_cheaper_quote',
    'research_only',
    'job_no_longer_needed',
    'other'
  ) then
    raise exception 'Choose the main reason for declining this quote.' using errcode = '22023';
  end if;
  if decision_value <> 'declined' and decline_reason_value <> '' then
    raise exception 'A decline reason can only be supplied when declining a quote.' using errcode = '22023';
  end if;
  if requested_source_ip_hash is not null and requested_source_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The response audit fingerprint is invalid.' using errcode = '22023';
  end if;

  select link.* into link_row
  from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash
  for update;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin then
    raise exception 'This quote link is not available on this workspace.' using errcode = 'P0002';
  end if;
  if link_row.status_code <> 'active' then raise exception 'This quote link has already been used or revoked.' using errcode = '22023'; end if;
  if link_row.expires_at is not null and link_row.expires_at <= now() then
    update quote_api.customer_response_links set status_code = 'expired' where response_link_id = link_row.response_link_id;
    raise exception 'This quote link has expired.' using errcode = '22023';
  end if;
  if requested_competitor_document_id is not null and not exists (
    select 1 from public."DOC_StoredObjects" stored
    where stored."DOCStoredObject_ID" = requested_competitor_document_id
      and stored."DOCStoredObject_ConcernCode" = 'quote_response'
      and stored."DOCStoredObject_AggregateType" = 'quote_customer_response_link'
      and stored."DOCStoredObject_AggregateID" = link_row.response_link_id
      and stored."DOCStoredObject_StatusCode" = 'active'
  ) then
    raise exception 'The competitor quote attachment is unavailable.' using errcode = '22023';
  end if;

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = link_row.quote_id
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then raise exception 'This quote is no longer available.' using errcode = 'P0002'; end if;
  if quote_row."CusQuoteHeader_LifecycleCode" not in ('sent', 'calculated', 'revised') then
    raise exception 'This quote already has a final outcome.' using errcode = '22023';
  end if;

  insert into quote_api.customer_responses (
    company_id, response_link_id, quote_id, quote_version_id, decision_code,
    customer_message, decline_reason_code, competitor_document_id, source_ip_hash, user_agent_summary
  ) values (
    link_row.company_id, link_row.response_link_id, link_row.quote_id, link_row.quote_version_id,
    decision_value, nullif(btrim(requested_message), ''),
    case when decision_value = 'declined' then decline_reason_value end,
    requested_competitor_document_id, requested_source_ip_hash, left(nullif(btrim(requested_user_agent), ''), 500)
  ) returning response_id into response_id_value;

  update quote_api.customer_response_links
  set status_code = 'responded', responded_at = now()
  where response_link_id = link_row.response_link_id;

  lifecycle_value := case decision_value
    when 'accepted' then 'accepted'
    when 'declined' then 'declined'
    else 'revised'
  end;
  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = lifecycle_value,
    "CusQuoteHeader_Status" = case lifecycle_value when 'accepted' then 5 when 'declined' then 6 else 1 end,
    "CusQuoteHeader_AcceptedVersionID" = case when decision_value = 'accepted' then link_row.quote_version_id else null end,
    "CusQuoteHeader_OutcomeNotes" = case
      when decision_value = 'declined' then coalesce(nullif(btrim(requested_message), ''), decline_reason_value)
      else nullif(btrim(requested_message), '')
    end,
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = link_row.quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    link_row.company_id, link_row.quote_id, link_row.quote_version_id,
    'customer_' || decision_value,
    case decision_value
      when 'accepted' then 'Customer accepted the quote.'
      when 'declined' then 'Customer declined the quote.'
      else 'Customer requested changes to the quote.'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'responseId', response_id_value,
      'message', nullif(btrim(requested_message), ''),
      'declineReasonCode', case when decision_value = 'declined' then decline_reason_value end,
      'competitorDocumentId', requested_competitor_document_id
    )),
    null
  );

  if decision_value = 'accepted' then
    booking_result := booking_api.convert_accepted_quote(link_row.quote_id, quote_row."CusQuoteHeader_SalesOwnerID", response_id_value);
  end if;

  owner_user_id := coalesce(quote_row."CusQuoteHeader_SalesOwnerID", quote_row."CusQuoteHeader_CreatedBy");
  if owner_user_id is not null then
    insert into public."Comm_Notifications" (
      "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
      "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
    ) values (
      owner_user_id,
      coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number") || ' customer response',
      case decision_value
        when 'accepted' then 'The customer accepted this quote. Its booking is ready.'
        when 'declined' then 'The customer declined this quote and supplied a reason.'
        else 'The customer asked for changes to this quote.'
      end,
      'CusQuote_Header', link_row.quote_id, 'quote_response',
      jsonb_build_object(
        'event_type', 'quote_response',
        'action_url', '/quotes/' || coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
        'action_label', 'Open quote',
        'eyebrow', 'Customer quote response',
        'decision', decision_value,
        'decline_reason_code', case when decision_value = 'declined' then decline_reason_value end,
        'response_id', response_id_value
      ),
      null
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'responded',
    'decision', decision_value,
    'declineReasonCode', case when decision_value = 'declined' then decline_reason_value end,
    'responseId', response_id_value,
    'booking', booking_result
  ));
end;
$$;

-- Keep the previous Edge Function signature callable during a rolling deploy.
-- Legacy declined submissions are classified as Other, while their original
-- free-text message remains in customer_message for the audit trail. New
-- callers use the eight-argument function above and must provide a reason.
create or replace function quote_api.submit_customer_response(
  requested_token_hash text,
  requested_response_origin text,
  requested_decision text,
  requested_message text default null,
  requested_competitor_document_id uuid default null,
  requested_source_ip_hash text default null,
  requested_user_agent text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.submit_customer_response(
    requested_token_hash,
    requested_response_origin,
    requested_decision,
    requested_message,
    requested_competitor_document_id,
    requested_source_ip_hash,
    requested_user_agent,
    case when lower(btrim(coalesce(requested_decision, ''))) = 'declined' then 'other' end
  )
$$;

create or replace function public.quote_customer_response_submit(
  requested_token_hash text,
  requested_response_origin text,
  requested_decision text,
  requested_message text default null,
  requested_competitor_document_id uuid default null,
  requested_source_ip_hash text default null,
  requested_user_agent text default null,
  requested_decline_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.submit_customer_response(
    requested_token_hash, requested_response_origin, requested_decision, requested_message,
    requested_competitor_document_id, requested_source_ip_hash, requested_user_agent,
    requested_decline_reason
  )
$$;

revoke all on function quote_api.submit_customer_response(text, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function quote_api.submit_customer_response(text, text, text, text, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.quote_customer_response_submit(text, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.quote_customer_response_submit(text, text, text, text, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function quote_api.submit_customer_response(text, text, text, text, uuid, text, text) to service_role;
grant execute on function public.quote_customer_response_submit(text, text, text, text, uuid, text, text) to service_role;
grant execute on function public.quote_customer_response_submit(text, text, text, text, uuid, text, text, text) to service_role;

-- Keep the final Dexter quote function in parity with the new response field.
-- The previous route-schedule migration intentionally wrapped the older
-- function, so extend that wrapper rather than duplicating its mature joins.
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

revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_quotes(uuid, text, integer) to service_role;

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_FieldsJSON" = '["quoteNumber","status","lifecycle","deadline","validFrom","validTo","estimatedDeparture","estimatedArrival","origin","destination","customerDecision","declineReasonCode","deliveryMode","responseControlsEnabled","recipientSource","recipientEmail","quoteDocumentId","deliveryStatus","bookingReference"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

-- Add the structured decline reason to the existing event-driven watch signal.
create or replace function public._multideck_dexter_quote_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  company_id uuid;
  source_id uuid := new."CusQuoteHeader_ID";
  latest_decision text;
  latest_decline_reason text;
  booking_reference text;
  old_json jsonb;
  new_json jsonb;
begin
  company_id := new."Org_ID";
  if company_id is null then
    select office."Company_ID" into company_id
    from public."cmp_Offices" office
    where office."Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  end if;
  select response.decision_code, response.decline_reason_code
    into latest_decision, latest_decline_reason
  from quote_api.customer_responses response
  where response.quote_id = source_id
  order by response.created_at desc limit 1;
  select job."Job_BookingReference" into booking_reference
  from public."Job_Header" job
  where job."Job_SourceQuoteID" = source_id and not job."Job_IsDeleted"
  order by job."Job_CreatedDate" asc limit 1;

  old_json := case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
    'quoteNumber', old."CusQuoteHeader_CustomerReference",
    'status', case when old."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won' when old."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'Lost' else 'Open' end,
    'lifecycle', old."CusQuoteHeader_LifecycleCode",
    'deadline', old."CusQuoteHeader_Deadline",
    'validFrom', old."CusQuoteHeader_ValidFrom",
    'validTo', old."CusQuoteHeader_ValidTo",
    'estimatedDeparture', old."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture',
    'estimatedArrival', old."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival',
    'origin', coalesce(old."CusQuoteHeader_LoadingPoint", old."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(old."CusQuoteHeader_DischargePoint", old."CusQuoteHeader_DestinationExtra"),
    'customerDecision', case when old."CusQuoteHeader_LifecycleCode" is distinct from new."CusQuoteHeader_LifecycleCode" then null else latest_decision end,
    'declineReasonCode', case when old."CusQuoteHeader_LifecycleCode" is distinct from new."CusQuoteHeader_LifecycleCode" then null else latest_decline_reason end,
    'bookingReference', case when old."CusQuoteHeader_LifecycleCode" = 'accepted' then booking_reference end
  ) end;
  new_json := jsonb_build_object(
    'quoteNumber', new."CusQuoteHeader_CustomerReference",
    'status', case when new."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won' when new."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'Lost' else 'Open' end,
    'lifecycle', new."CusQuoteHeader_LifecycleCode",
    'deadline', new."CusQuoteHeader_Deadline",
    'validFrom', new."CusQuoteHeader_ValidFrom",
    'validTo', new."CusQuoteHeader_ValidTo",
    'estimatedDeparture', new."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedDeparture',
    'estimatedArrival', new."CusQuoteHeader_ShipmentFactsJSON"->>'estimatedArrival',
    'origin', coalesce(new."CusQuoteHeader_LoadingPoint", new."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(new."CusQuoteHeader_DischargePoint", new."CusQuoteHeader_DestinationExtra"),
    'customerDecision', latest_decision,
    'declineReasonCode', latest_decline_reason,
    'bookingReference', booking_reference
  );

  if company_id is not null and old_json is distinct from new_json and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = company_id
      and watch."AIDexterWatch_CapabilityCode" = 'quotes'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = source_id)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (company_id, 'quotes', 'CusQuote_Header', source_id, old_json, new_json);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_dexter_watch" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_dexter_watch"
after insert or update on public."CusQuote_Header"
for each row execute function public._multideck_dexter_quote_watch_source_change();

revoke all on function public._multideck_dexter_quote_watch_source_change() from public, anon, authenticated;

commit;
