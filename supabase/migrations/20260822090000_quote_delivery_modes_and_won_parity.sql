begin;

alter table quote_api.customer_response_links
  add column if not exists delivery_mode_code text not null default 'standard',
  add column if not exists recipient_source_code text not null default 'saved';

alter table quote_api.customer_response_links
  drop constraint if exists customer_response_links_delivery_mode_check,
  add constraint customer_response_links_delivery_mode_check
    check (delivery_mode_code in ('standard', 'simple')),
  drop constraint if exists customer_response_links_recipient_source_check,
  add constraint customer_response_links_recipient_source_check
    check (recipient_source_code in ('saved', 'manual'));

create or replace function public.quote_workflow_issue_customer_response_v2(
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
        'responseControlsEnabled', requested_delivery_mode = 'standard'
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

revoke all on function public.quote_workflow_issue_customer_response_v2(uuid,uuid,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_issue_customer_response_v2(uuid,uuid,text,text,text,text,text,text,timestamptz)
  to service_role;

create or replace function public.quote_workflow_disable_customer_response(
  requested_response_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update quote_api.customer_response_links set
    status_code = 'revoked',
    revoked_at = coalesce(revoked_at, now())
  where response_link_id = requested_response_link_id
    and delivery_mode_code = 'simple'
    and status_code = 'active';

  if found then return true; end if;
  if exists (
    select 1 from quote_api.customer_response_links
    where response_link_id = requested_response_link_id
      and delivery_mode_code = 'simple'
      and status_code = 'revoked'
  ) then
    return true;
  end if;
  raise exception 'That Simple quote delivery could not disable customer responses.' using errcode = '22023';
end;
$$;

revoke all on function public.quote_workflow_disable_customer_response(uuid)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_disable_customer_response(uuid)
  to service_role;

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
  ))
  into issue
  from quote_api.customer_response_links link
  where link.quote_id = requested_quote_id
    and link.company_id = app_company_id
  order by link.created_at desc
  limit 1;

  return issue;
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

revoke all on function public.quote_workflow_latest_customer_response_issue(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_latest_customer_response_issue(uuid,uuid)
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
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(result.value order by result.updated_at desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId', quote."CusQuoteHeader_ID",
      'quoteNumber', 'Q-' || quote."CusQuoteHeader_Number",
      'customerReference', quote."CusQuoteHeader_CustomerReference",
      'customer', coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot"),
      'status', case
        when quote."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won'
        when quote."CusQuoteHeader_LifecycleCode" in ('declined', 'ghosted') then 'Lost'
        else 'Open'
      end,
      'lifecycle', quote."CusQuoteHeader_LifecycleCode",
      'lossReason', case when quote."CusQuoteHeader_LifecycleCode" in ('declined', 'ghosted') then quote."CusQuoteHeader_OutcomeNotes" end,
      'customerResponse', case when customer_response.decision_code is null then null else jsonb_strip_nulls(jsonb_build_object(
        'decision', customer_response.decision_code,
        'message', customer_response.customer_message,
        'attachmentDocumentId', customer_response.competitor_document_id,
        'receivedAt', customer_response.created_at,
        'evidence', jsonb_build_object('sourceTable', 'quote_api.customer_responses', 'sourceId', customer_response.response_id)
      )) end,
      'latestDelivery', case when latest_issue.response_link_id is null then null else jsonb_strip_nulls(jsonb_build_object(
        'mode', latest_issue.delivery_mode_code,
        'responseControlsEnabled', latest_issue.delivery_mode_code = 'standard',
        'recipientSource', latest_issue.recipient_source_code,
        'recipientEmail', latest_issue.recipient_email,
        'quoteDocumentId', latest_issue.quote_document_id,
        'deliveryStatus', latest_issue.delivery_status_code,
        'sentAt', latest_issue.created_at,
        'evidence', jsonb_build_object('sourceTable', 'quote_api.customer_response_links', 'sourceId', latest_issue.response_link_id)
      )) end,
      'linkedBooking', case when linked_booking."Job_ID" is null then null else jsonb_build_object(
        'jobId', linked_booking."Job_ID",
        'bookingReference', linked_booking."Job_BookingReference",
        'status', linked_booking."Job_Status",
        'requiresCustomerLink', linked_booking."Job_Customer" is null,
        'source', 'accepted_quote'
      ) end,
      'mode', quote."CusQuoteHeader_ModeCode",
      'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode",
      'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
      'currency', quote."CusQuoteHeader_CurrencyCode",
      'origin', coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra"),
      'destination', coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra"),
      'direction', quote."CusQuoteHeader_Direction",
      'incoterm', quote."CusQuoteHeader_Incoterm",
      'validFrom', quote."CusQuoteHeader_ValidFrom",
      'validTo', quote."CusQuoteHeader_ValidTo",
      'supplier', coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name"),
      'carrier', coalesce(quote."CusQuoteHeader_CarrierNameSnapshot", carrier."Org_Name"),
      'followUpAt', quote."CusQuoteHeader_FollowUpAt",
      'costTotal', totals.cost,
      'sellTotal', totals.sell,
      'profit', totals.sell - totals.cost,
      'marginPct', case when totals.sell = 0 then null else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end,
      'updatedAt', quote."CusQuoteHeader_LastEditedDate",
      'evidence', jsonb_build_object(
        'sourceTable', 'CusQuote_Header',
        'sourceId', quote."CusQuoteHeader_ID",
        'currentVersionId', version."CusQuoteVersion_ID"
      )
    )) value,
    quote."CusQuoteHeader_LastEditedDate" updated_at
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      and office."Company_ID" = p_company_id
    left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
    left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
    left join public."Org_Master" carrier on carrier."Org_id" = quote."CusQuoteHeader_CarrierID"
    left join public."CusQuote_Versions" version
      on version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID" and version."CusQuoteVersion_IsCurrent"
    left join lateral (
      select response.response_id, response.decision_code, response.customer_message,
        response.competitor_document_id, response.created_at
      from quote_api.customer_responses response
      where response.quote_id = quote."CusQuoteHeader_ID" and response.company_id = p_company_id
      order by response.created_at desc limit 1
    ) customer_response on true
    left join lateral (
      select link.response_link_id, link.quote_document_id, link.delivery_mode_code, link.recipient_source_code,
        link.recipient_email, link.delivery_status_code, link.created_at
      from quote_api.customer_response_links link
      where link.quote_id = quote."CusQuoteHeader_ID" and link.company_id = p_company_id
      order by link.created_at desc limit 1
    ) latest_issue on true
    left join lateral (
      select job."Job_ID", job."Job_BookingReference", job."Job_Status", job."Job_Customer"
      from public."Job_Header" job
      where job."Job_SourceQuoteID" = quote."CusQuoteHeader_ID" and not job."Job_IsDeleted"
      order by job."Job_CreatedDate" asc limit 1
    ) linked_booking on true
    left join lateral (
      select coalesce(sum("CusQuoteLine_CostAmountLocal"), 0) cost,
        coalesce(sum("CusQuoteLine_RevenueAmountLocal"), 0) sell
      from public."CusQuote_Lines" where "CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    ) totals on true
    where not quote."CusQuoteHeader_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', quote."CusQuoteHeader_Number", quote."CusQuoteHeader_CustomerReference",
          customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot", quote."CusQuoteHeader_LifecycleCode",
          quote."CusQuoteHeader_OutcomeNotes", customer_response.decision_code, customer_response.customer_message,
          latest_issue.delivery_mode_code, latest_issue.recipient_email, linked_booking."Job_BookingReference",
          quote."CusQuoteHeader_ModeCode", quote."CusQuoteHeader_ShipmentTypeCode",
          quote."CusQuoteHeader_OriginExtra", quote."CusQuoteHeader_DestinationExtra",
          quote."CusQuoteHeader_SupplierNameSnapshot", quote."CusQuoteHeader_CarrierNameSnapshot"
        ) ilike '%' || btrim(p_search) || '%'
      )
    order by quote."CusQuoteHeader_LastEditedDate" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;

revoke all on function public.multideck_dexter_domain_quotes(uuid,text,integer)
  from public, anon, authenticated;

create or replace function public.multideck_dexter_action_mark_quote_won(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_auth_user_id uuid;
begin
  select "Auth_User_ID" into actor_auth_user_id
  from public."cmp_Users"
  where "User_ID" = p_user_id
    and "Company_ID" = p_company_id
    and "User_AccessStatus" = 'active';
  if actor_auth_user_id is null then
    raise exception 'The Dexter operator is outside this workspace.' using errcode = '42501';
  end if;
  return quote_api.transition_quote(
    actor_auth_user_id,
    (p_arguments ->> 'target_id')::uuid,
    'accepted',
    nullif(btrim(coalesce(p_arguments ->> 'note', '')), ''),
    null
  );
end;
$$;

revoke all on function public.multideck_dexter_action_mark_quote_won(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_action_mark_quote_won(uuid,uuid,jsonb)
  to service_role;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function",
  "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'mark_quote_won', 'quotes', 'Mark quote won',
  'Accept an open quote and create or reuse its source-linked booking after operator approval.',
  'multideck_dexter_action_mark_quote_won',
  '{"type":"object","properties":{"target_id":{"type":"string","description":"The exact quote recordId returned by the quotes data tool."},"note":{"type":["string","null"],"description":"Optional operator-approved acceptance note."},"reason":{"type":"string","description":"Explain that approval will accept the quote and create or reuse its booking."}},"required":["target_id","note","reason"],"additionalProperties":false}'::jsonb,
  190, true, now(), '["Quotes.Write"]'::jsonb, 'quote_win', 'canonical', true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = excluded."AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt" = excluded."AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quotes with response evidence, Standard or Simple delivery evidence, linked booking provenance, outcomes, pricing and deterministic win intelligence.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Event-driven quote lifecycle, customer response, delivery mode, recipient and linked-booking changes.',
  "AIDexterWatchCapability_FieldsJSON" = '["quoteNumber","status","lifecycle","deadline","validFrom","validTo","origin","destination","customerDecision","deliveryMode","responseControlsEnabled","recipientSource","recipientEmail","quoteDocumentId","deliveryStatus","bookingReference"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

create or replace function public._multideck_dexter_quote_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  company_id uuid;
  source_id uuid := new."CusQuoteHeader_ID";
  latest_decision text;
  booking_reference text;
  old_json jsonb;
  new_json jsonb;
begin
  company_id := new."Org_ID";
  if company_id is null then
    select "Company_ID" into company_id from public."cmp_Offices"
    where "Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  end if;
  select decision_code into latest_decision from quote_api.customer_responses
  where quote_id = source_id order by created_at desc limit 1;
  select "Job_BookingReference" into booking_reference from public."Job_Header"
  where "Job_SourceQuoteID" = source_id and not "Job_IsDeleted"
  order by "Job_CreatedDate" asc limit 1;

  old_json := case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
    'quoteNumber', old."CusQuoteHeader_CustomerReference",
    'status', case when old."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won' when old."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'Lost' else 'Open' end,
    'lifecycle', old."CusQuoteHeader_LifecycleCode",
    'deadline', old."CusQuoteHeader_Deadline", 'validFrom', old."CusQuoteHeader_ValidFrom", 'validTo', old."CusQuoteHeader_ValidTo",
    'origin', coalesce(old."CusQuoteHeader_LoadingPoint", old."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(old."CusQuoteHeader_DischargePoint", old."CusQuoteHeader_DestinationExtra"),
    'customerDecision', case when old."CusQuoteHeader_LifecycleCode" is distinct from new."CusQuoteHeader_LifecycleCode" then null else latest_decision end,
    'bookingReference', case when old."CusQuoteHeader_LifecycleCode" = 'accepted' then booking_reference end
  ) end;
  new_json := jsonb_build_object(
    'quoteNumber', new."CusQuoteHeader_CustomerReference",
    'status', case when new."CusQuoteHeader_LifecycleCode" = 'accepted' then 'Won' when new."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'Lost' else 'Open' end,
    'lifecycle', new."CusQuoteHeader_LifecycleCode",
    'deadline', new."CusQuoteHeader_Deadline", 'validFrom', new."CusQuoteHeader_ValidFrom", 'validTo', new."CusQuoteHeader_ValidTo",
    'origin', coalesce(new."CusQuoteHeader_LoadingPoint", new."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(new."CusQuoteHeader_DischargePoint", new."CusQuoteHeader_DestinationExtra"),
    'customerDecision', latest_decision,
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

create or replace function public._multideck_dexter_quote_delivery_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  quote_reference text;
  old_json jsonb;
  new_json jsonb;
begin
  select "CusQuoteHeader_CustomerReference" into quote_reference
  from public."CusQuote_Header" where "CusQuoteHeader_ID" = new.quote_id;
  old_json := jsonb_build_object(
    'quoteNumber', quote_reference,
    'deliveryMode', old.delivery_mode_code,
    'responseControlsEnabled', old.delivery_mode_code = 'standard',
    'recipientSource', old.recipient_source_code,
    'recipientEmail', old.recipient_email,
    'quoteDocumentId', old.quote_document_id,
    'deliveryStatus', old.delivery_status_code
  );
  new_json := jsonb_build_object(
    'quoteNumber', quote_reference,
    'deliveryMode', new.delivery_mode_code,
    'responseControlsEnabled', new.delivery_mode_code = 'standard',
    'recipientSource', new.recipient_source_code,
    'recipientEmail', new.recipient_email,
    'quoteDocumentId', new.quote_document_id,
    'deliveryStatus', new.delivery_status_code
  );
  if old_json is distinct from new_json and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new.company_id
      and watch."AIDexterWatch_CapabilityCode" = 'quotes'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new.quote_id)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (new.company_id, 'quotes', 'quote_api.customer_response_links', new.quote_id, old_json, new_json);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_dexter_watch" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_dexter_watch"
after insert or update on public."CusQuote_Header"
for each row execute function public._multideck_dexter_quote_watch_source_change();

drop trigger if exists customer_response_links_dexter_watch on quote_api.customer_response_links;
create trigger customer_response_links_dexter_watch
after update of delivery_status_code on quote_api.customer_response_links
for each row when (old.delivery_status_code is distinct from new.delivery_status_code)
execute function public._multideck_dexter_quote_delivery_watch_source_change();

revoke all on function public._multideck_dexter_quote_watch_source_change() from public, anon, authenticated;
revoke all on function public._multideck_dexter_quote_delivery_watch_source_change() from public, anon, authenticated;

commit;
