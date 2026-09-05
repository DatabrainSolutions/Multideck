-- Keep Dexter and Watching for you aligned with the confirmed quote-delivery
-- boundary. Failed staged attempts remain auditable but never replace the last
-- successfully delivered quote evidence in Dexter's read model.

begin;

create or replace function public.multideck_dexter_domain_quotes_before_route_schedule_20260902(
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
      where link.quote_id = quote."CusQuoteHeader_ID"
        and link.company_id = p_company_id
        and link.delivery_status_code = 'sent'
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

revoke all on function public.multideck_dexter_domain_quotes_before_route_schedule_20260902(uuid,text,integer)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'Customer quotes with customer response decisions, reasons, immutable submitted versions, confirmed delivery and quote-document evidence, real historical outcomes, pricing evidence and deterministic win intelligence.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Event-driven quote lifecycle, ETD, ETA, validity, customer response, confirmed delivery, recipient, quote-document and linked-booking changes.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

comment on function public.multideck_dexter_domain_quotes_before_route_schedule_20260902(uuid,text,integer)
is 'Tenant-scoped Dexter quote base read model. Failed staged email attempts never replace the latest confirmed delivery evidence.';

comment on function public.multideck_dexter_domain_quotes(uuid,text,integer)
is 'Tenant-scoped Dexter quote read model with route schedule and structured response context. Direct quote sending remains an operator-reviewed action outside Dexter.';

commit;
