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
      'lossReason', case when quote."CusQuoteHeader_LifecycleCode" in ('declined', 'ghosted') then quote."CusQuoteHeader_OutcomeNotes" end,
      'customerResponse', case when customer_response.decision_code is null then null else jsonb_strip_nulls(jsonb_build_object(
        'decision', customer_response.decision_code,
        'message', customer_response.customer_message,
        'attachmentDocumentId', customer_response.competitor_document_id,
        'receivedAt', customer_response.created_at,
        'evidence', jsonb_build_object(
          'sourceTable', 'quote_api.customer_responses',
          'sourceId', customer_response.response_id
        )
      )) end,
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
      'marginPct', case when totals.sell = 0 then null
        else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end,
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
      on version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
      and version."CusQuoteVersion_IsCurrent"
    left join lateral (
      select response.response_id, response.decision_code, response.customer_message,
        response.competitor_document_id, response.created_at
      from quote_api.customer_responses response
      where response.quote_id = quote."CusQuoteHeader_ID"
        and response.company_id = p_company_id
      order by response.created_at desc
      limit 1
    ) customer_response on true
    left join lateral (
      select coalesce(sum("CusQuoteLine_CostAmountLocal"), 0) cost,
        coalesce(sum("CusQuoteLine_RevenueAmountLocal"), 0) sell
      from public."CusQuote_Lines"
      where "CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    ) totals on true
    where not quote."CusQuoteHeader_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', quote."CusQuoteHeader_Number",
          quote."CusQuoteHeader_CustomerReference",
          customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot",
          quote."CusQuoteHeader_LifecycleCode", quote."CusQuoteHeader_OutcomeNotes",
          customer_response.decision_code, customer_response.customer_message,
          quote."CusQuoteHeader_ModeCode", quote."CusQuoteHeader_ShipmentTypeCode",
          quote."CusQuoteHeader_OriginExtra", quote."CusQuoteHeader_DestinationExtra",
          quote."CusQuoteHeader_SupplierNameSnapshot", quote."CusQuoteHeader_CarrierNameSnapshot"
        ) ilike '%' || btrim(p_search) || '%'
      )
    order by quote."CusQuoteHeader_LastEditedDate" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;

revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quotes with customer response decisions, reasons, supporting attachment evidence, real historical outcomes, pricing evidence and deterministic win intelligence.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';
