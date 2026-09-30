begin;

-- Customer-only quote evidence is filtered before the history limit.
-- Complete quote prices are never blended with job totals or rate-line units.
create or replace function public.quote_intelligence_evidence(
  p_company_id uuid,
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with target as (
    select quote."CusQuoteHeader_ID" id,
      'Q-' || quote."CusQuoteHeader_Number" reference,
      quote."CusQuoteHeader_CustomerID" customer_id,
      coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft') lifecycle,
      quote."CusQuoteHeader_JobID" job_id,
      coalesce(quote."CusQuoteHeader_CurrencyCode", 'GBP') currency,
      coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra", '') origin,
      coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra", '') destination,
      coalesce(quote."CusQuoteHeader_ModeCode", '') mode,
      coalesce(quote."CusQuoteHeader_ShipmentTypeCode", '') shipment_type,
      quote."CusQuoteHeader_Incoterm" incoterm,
      quote."CusQuoteHeader_ShipmentFactsJSON" shipment_facts,
      quote."CusQuoteHeader_CreatedDate" created_at,
      coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") updated_at,
      quote."CusQuoteHeader_ValidTo" valid_to,
      quote."CusQuoteHeader_Deadline" deadline,
      totals.cost, totals.sell, totals.sell - totals.cost profit,
      case when totals.sell = 0 then null else ((totals.sell - totals.cost) / totals.sell) * 100 end margin_pct,
      totals.fx_complete,
      coalesce(events.activity_codes, '[]'::jsonb) activity_codes
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
     and office."Company_ID" = p_company_id
    left join lateral (
      select coalesce((
        select settings."FINSET_BaseCurrencyCode"
        from public."FIN_Settings" settings
        where settings."FINSET_OrgOfficeID" = office."Office_ID"
        order by settings."FINSET_UpdatedAt" desc, settings."FINSET_ID" desc
        limit 1
      ), 'GBP') currency
    ) base on true
    left join lateral (
      select case when base.currency = coalesce(quote."CusQuoteHeader_CurrencyCode", 'GBP') then 1::numeric else (
        select exchange_rate."FINRate_MidRate"
        from public."FIN_ExchangeRates" exchange_rate
        where exchange_rate."FINRate_IsApproved" and exchange_rate."FINRate_MidRate" > 0
          and exchange_rate."FINRate_FromCurrencyCode" = base.currency
          and exchange_rate."FINRate_ToCurrencyCode" = coalesce(quote."CusQuoteHeader_CurrencyCode", 'GBP')
        order by exchange_rate."FINRate_RateDate" desc, exchange_rate."FINRate_IsOfficial" desc,
          exchange_rate."FINRate_ImportedAt" desc, exchange_rate."FINRate_ID" desc
        limit 1
      ) end factor
    ) fx on true
    left join lateral (
      select coalesce(sum(line."CusQuoteLine_CostAmountLocal") * coalesce(fx.factor, 0), 0) cost,
        coalesce(sum(line."CusQuoteLine_RevenueAmountLocal") * coalesce(fx.factor, 0), 0) sell,
        fx.factor is not null and coalesce(bool_and(
          (coalesce(line."CusQuoteLine_CostAmountLocal", 0) = 0 or coalesce(line."CusQuoteLine_CostROE", 0) > 0)
          and (coalesce(line."CusQuoteLine_RevenueAmountLocal", 0) = 0 or coalesce(line."CusQuoteLine_RevenueROE", 0) > 0)
        ), true) fx_complete
      from public."CusQuote_Lines" line
      where line."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    ) totals on true
    left join lateral (
      select jsonb_agg(event."CusQuoteEvent_TypeCode" order by event."CusQuoteEvent_OccurredAt" desc) activity_codes
      from (
        select event."CusQuoteEvent_TypeCode", event."CusQuoteEvent_OccurredAt"
        from public."CusQuote_Events" event
        where event."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
        order by event."CusQuoteEvent_OccurredAt" desc
        limit 20
      ) event
    ) events on true
    where quote."CusQuoteHeader_ID" = p_quote_id
      and not quote."CusQuoteHeader_IsDeleted"
  ), quote_rows as (
    select quote."CusQuoteHeader_ID" id,
      'Q-' || quote."CusQuoteHeader_Number" reference,
      quote."CusQuoteHeader_CustomerID" customer_id,
      coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft') lifecycle,
      quote."CusQuoteHeader_JobID" job_id,
      coalesce((select currency from target), 'GBP') currency,
      coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra", '') origin,
      coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra", '') destination,
      coalesce(quote."CusQuoteHeader_ModeCode", '') mode,
      coalesce(quote."CusQuoteHeader_ShipmentTypeCode", '') shipment_type,
      quote."CusQuoteHeader_Incoterm" incoterm,
      quote."CusQuoteHeader_ShipmentFactsJSON" shipment_facts,
      quote."CusQuoteHeader_CreatedDate" created_at,
      coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") updated_at,
      quote."CusQuoteHeader_ValidTo" valid_to,
      quote."CusQuoteHeader_Deadline" deadline,
      totals.cost, totals.sell, totals.sell - totals.cost profit,
      case when totals.sell = 0 then null else ((totals.sell - totals.cost) / totals.sell) * 100 end margin_pct,
      totals.fx_complete,
      '[]'::jsonb activity_codes
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
     and office."Company_ID" = p_company_id
    left join lateral (
      select coalesce((
        select settings."FINSET_BaseCurrencyCode"
        from public."FIN_Settings" settings
        where settings."FINSET_OrgOfficeID" = office."Office_ID"
        order by settings."FINSET_UpdatedAt" desc, settings."FINSET_ID" desc
        limit 1
      ), 'GBP') currency
    ) base on true
    left join lateral (
      select case when base.currency = (select currency from target) then 1::numeric else (
        select exchange_rate."FINRate_MidRate"
        from public."FIN_ExchangeRates" exchange_rate
        where exchange_rate."FINRate_IsApproved" and exchange_rate."FINRate_MidRate" > 0
          and exchange_rate."FINRate_FromCurrencyCode" = base.currency
          and exchange_rate."FINRate_ToCurrencyCode" = (select currency from target)
        order by exchange_rate."FINRate_RateDate" desc, exchange_rate."FINRate_IsOfficial" desc,
          exchange_rate."FINRate_ImportedAt" desc, exchange_rate."FINRate_ID" desc
        limit 1
      ) end factor
    ) fx on true
    left join lateral (
      select coalesce(sum(line."CusQuoteLine_CostAmountLocal") * coalesce(fx.factor, 0), 0) cost,
        coalesce(sum(line."CusQuoteLine_RevenueAmountLocal") * coalesce(fx.factor, 0), 0) sell,
        fx.factor is not null and coalesce(bool_and(
          (coalesce(line."CusQuoteLine_CostAmountLocal", 0) = 0 or coalesce(line."CusQuoteLine_CostROE", 0) > 0)
          and (coalesce(line."CusQuoteLine_RevenueAmountLocal", 0) = 0 or coalesce(line."CusQuoteLine_RevenueROE", 0) > 0)
        ), true) fx_complete
      from public."CusQuote_Lines" line
      where line."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    ) totals on true
    where not quote."CusQuoteHeader_IsDeleted"
      and quote."CusQuoteHeader_ID" <> p_quote_id
      and quote."CusQuoteHeader_CustomerID" = (select customer_id from target)
      and quote."CusQuoteHeader_CreatedDate" >= now() - interval '24 months'
      and quote."CusQuoteHeader_CreatedDate" <= now()
    order by quote."CusQuoteHeader_CreatedDate" desc, quote."CusQuoteHeader_ID"
    limit 250
  )
  select jsonb_build_object(
    'target', (select jsonb_build_object(
      'id', id, 'reference', reference, 'customerId', customer_id, 'lifecycle', lifecycle,
      'jobId', job_id, 'currency', currency, 'origin', origin, 'destination', destination,
      'mode', mode, 'shipmentType', shipment_type, 'createdAt', created_at, 'updatedAt', updated_at,
      'validTo', valid_to, 'deadline', deadline, 'cost', cost, 'sell', sell, 'profit', profit,
      'marginPct', margin_pct, 'fxComplete', fx_complete, 'activityCodes', activity_codes,
      'incoterm', incoterm, 'shipmentFacts', jsonb_build_object('hblMode', shipment_facts->'hblMode', 'containerRequests', shipment_facts->'containerRequests', 'cargoLines', shipment_facts->'cargoLines')
    ) from target),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'reference', reference, 'customerId', customer_id, 'lifecycle', lifecycle,
      'jobId', job_id, 'currency', currency, 'origin', origin, 'destination', destination,
      'mode', mode, 'shipmentType', shipment_type, 'createdAt', created_at, 'updatedAt', updated_at,
      'validTo', valid_to, 'deadline', deadline, 'cost', cost, 'sell', sell, 'profit', profit,
      'marginPct', margin_pct, 'fxComplete', fx_complete, 'activityCodes', activity_codes,
      'incoterm', incoterm, 'shipmentFacts', jsonb_build_object('hblMode', shipment_facts->'hblMode', 'containerRequests', shipment_facts->'containerRequests', 'cargoLines', shipment_facts->'cargoLines')
    ) order by updated_at desc) from quote_rows), '[]'::jsonb),
    'jobs', '[]'::jsonb, 'rates', '[]'::jsonb
  );
$$;

revoke all on function public.quote_intelligence_evidence(uuid, uuid) from public, anon, authenticated;
grant execute on function public.quote_intelligence_evidence(uuid, uuid) to service_role;


create or replace function public.multideck_dexter_domain_quotes_intelligence(
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
  with base as (
    select value
    from jsonb_array_elements(public.multideck_dexter_domain_quotes(p_company_id, p_search, p_take)) value
  ), enriched as (
    select base.value || case when intelligence."CusQuoteIntelligence_QuoteID" is null then '{}'::jsonb else
      jsonb_build_object('quoteIntelligence', jsonb_strip_nulls(jsonb_build_object(
        'state', intelligence."CusQuoteIntelligence_StateCode",
        'historicalWinRate', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,historicalWinRate,value}',
        'wonPriceBand', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,wonPriceBand,value}',
        'suggestedPitch', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,suggestedPitch,value}',
        'marginHeadroom', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,marginHeadroom,value}',
        'priceConfidence', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,priceConfidence,value,score}',
        'aiWinLikelihoodBase', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,aiWinLikelihood,value,basePct}',
        'aiAdjustmentPoints', case
          when intelligence."CusQuoteIntelligence_AIJSON"->>'inputFingerprint' = intelligence."CusQuoteIntelligence_InputFingerprint"
          then intelligence."CusQuoteIntelligence_AIJSON"->'adjustmentPoints' end,
        'aiTemperatureBase', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,aiTemperature,value,baseScore}',
        'algorithmVersion', intelligence."CusQuoteIntelligence_AlgorithmVersion",
        'calculatedAt', intelligence."CusQuoteIntelligence_CalculatedAt",
        'aiGeneratedAt', intelligence."CusQuoteIntelligence_AIGeneratedAt",
        'scope', intelligence."CusQuoteIntelligence_DeterministicJSON"->'scope',
        'metricEvidence', intelligence."CusQuoteIntelligence_DeterministicJSON"->'metrics',
        'recentQuotes', intelligence."CusQuoteIntelligence_DeterministicJSON"->'recentQuotes',
        'evidence', jsonb_build_object(
          'historicalCount', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,historicalWinRate,evidenceCount}',
          'pricingCount', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,priceConfidence,evidenceCount}',
          'cohort', intelligence."CusQuoteIntelligence_DeterministicJSON"#>'{metrics,historicalWinRate,cohort}'
        )
      ))) end as value
    from base
    left join public."CusQuote_Intelligence" intelligence
      on intelligence."CusQuoteIntelligence_QuoteID" = nullif(base.value->>'recordId', '')::uuid
     and intelligence."Company_ID" = p_company_id
  )
  select coalesce(jsonb_agg(enriched.value), '[]'::jsonb) from enriched;
$$;

revoke all on function public.multideck_dexter_domain_quotes_intelligence(uuid, text, integer)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer-only quote outcomes and comparable won prices with source quote identifiers, evidence counts, scope, missing-input reasons and freshness. Win baseline is not a calibrated prediction; no AI adjustment.',
  "AIDexterDomain_QueryFunction" = 'multideck_dexter_domain_quotes_intelligence',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Quote lifecycle, route, margin and customer-only outcome baseline or pricing confidence threshold changes. Missing evidence stays unknown. Deterministic, event-driven evaluation; no recurring LLM calls.',
  "AIDexterWatchCapability_FieldsJSON" = '["quoteNumber","customerReference","status","deadline","validFrom","validTo","origin","destination","supplier","carrier","followUpAt","aiWinLikelihood","priceConfidence","temperature","intelligenceState"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

-- Unknown is not zero: a missing baseline must not satisfy a numeric watch.
create or replace function public._quote_intelligence_watch_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb; v_adjustment numeric := 0;
begin
  if old."CusQuoteIntelligence_AIJSON"->>'inputFingerprint' = old."CusQuoteIntelligence_InputFingerprint" then
    v_adjustment := coalesce((old."CusQuoteIntelligence_AIJSON"->>'adjustmentPoints')::numeric, 0);
  end if;
  v_old := jsonb_build_object(
    'intelligenceState', old."CusQuoteIntelligence_StateCode",
    'aiWinLikelihood', (old."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiWinLikelihood,value,basePct}')::numeric + v_adjustment,
    'priceConfidence', (old."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,priceConfidence,value,score}')::numeric,
    'temperature', (old."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiTemperature,value,baseScore}')::numeric + v_adjustment * 0.45
  );
  v_adjustment := 0;
  if new."CusQuoteIntelligence_AIJSON"->>'inputFingerprint' = new."CusQuoteIntelligence_InputFingerprint" then
    v_adjustment := coalesce((new."CusQuoteIntelligence_AIJSON"->>'adjustmentPoints')::numeric, 0);
  end if;
  v_new := jsonb_build_object(
    'intelligenceState', new."CusQuoteIntelligence_StateCode",
    'aiWinLikelihood', (new."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiWinLikelihood,value,basePct}')::numeric + v_adjustment,
    'priceConfidence', (new."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,priceConfidence,value,score}')::numeric,
    'temperature', (new."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiTemperature,value,baseScore}')::numeric + v_adjustment * 0.45
  );
  if v_old is distinct from v_new and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new."Company_ID"
      and watch."AIDexterWatch_CapabilityCode" = 'quotes'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new."CusQuoteIntelligence_QuoteID")
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (new."Company_ID", 'quotes', 'CusQuote_Intelligence', new."CusQuoteIntelligence_QuoteID", v_old, v_new);
  end if;
  return new;
end;
$$;

-- History changes invalidate this customer's other quote snapshots as well.
-- Queue evaluation remains deterministic; v2 never schedules model refinement.
create or replace function public._quote_intelligence_customer_history_changed()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_peer uuid; v_company uuid;
begin
  select "Company_ID" into v_company from public."cmp_Offices"
    where "Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  for v_peer in
    select quote."CusQuoteHeader_ID" from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where office."Company_ID" = v_company and not quote."CusQuoteHeader_IsDeleted"
      and quote."CusQuoteHeader_ID" <> new."CusQuoteHeader_ID"
      and (quote."CusQuoteHeader_CustomerID" = new."CusQuoteHeader_CustomerID"
        or (tg_op = 'UPDATE' and quote."CusQuoteHeader_CustomerID" = old."CusQuoteHeader_CustomerID"))
      and quote."CusQuoteHeader_CreatedDate" >= now() - interval '24 months'
  loop
    perform public.quote_intelligence_enqueue(v_peer, coalesce(new."CusQuoteHeader_LastEditedBy", new."CusQuoteHeader_CreatedBy"), 'customer_history_changed', 10);
  end loop;
  return new;
end;
$$;
revoke all on function public._quote_intelligence_customer_history_changed() from public, anon, authenticated;
create trigger "TR_CusQuote_Header_customer_intelligence"
after insert or update of "CusQuoteHeader_CustomerID", "CusQuoteHeader_LifecycleCode", "CusQuoteHeader_JobID", "CusQuoteHeader_IsDeleted",
  "CusQuoteHeader_LoadingPoint", "CusQuoteHeader_DischargePoint", "CusQuoteHeader_ModeCode", "CusQuoteHeader_ShipmentTypeCode",
  "CusQuoteHeader_Incoterm", "CusQuoteHeader_ShipmentFactsJSON"
on public."CusQuote_Header" for each row execute function public._quote_intelligence_customer_history_changed();

drop trigger if exists "TR_CusQuote_Header_intelligence" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_intelligence"
after insert or update of "CusQuoteHeader_CustomerID", "CusQuoteHeader_LifecycleCode", "CusQuoteHeader_JobID", "CusQuoteHeader_CurrencyCode",
  "CusQuoteHeader_LoadingPoint", "CusQuoteHeader_DischargePoint", "CusQuoteHeader_OriginExtra", "CusQuoteHeader_DestinationExtra", "CusQuoteHeader_ModeCode",
  "CusQuoteHeader_ShipmentTypeCode", "CusQuoteHeader_ValidTo", "CusQuoteHeader_Deadline", "CusQuoteHeader_Incoterm", "CusQuoteHeader_ShipmentFactsJSON"
on public."CusQuote_Header" for each row execute function public._quote_intelligence_header_changed();

create or replace function public._quote_intelligence_line_changed()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_quote_id uuid; v_user_id uuid; v_customer uuid; v_company uuid; v_peer uuid;
begin
  if tg_op = 'DELETE' then v_quote_id := old."CusQuoteHeader_ID"; else v_quote_id := new."CusQuoteHeader_ID"; end if;
  select coalesce(quote."CusQuoteHeader_LastEditedBy", quote."CusQuoteHeader_CreatedBy"), quote."CusQuoteHeader_CustomerID", office."Company_ID"
    into v_user_id, v_customer, v_company
    from public."CusQuote_Header" quote join public."cmp_Offices" office
      on office."Office_ID"=coalesce(quote."CusQuoteHeader_OrgOfficeID",quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID"=v_quote_id;
  perform public.quote_intelligence_enqueue(v_quote_id, v_user_id, 'quote_charges_changed', 3);
  for v_peer in select quote."CusQuoteHeader_ID" from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID"=coalesce(quote."CusQuoteHeader_OrgOfficeID",quote."OrgOffice_ID")
    where office."Company_ID"=v_company and quote."CusQuoteHeader_CustomerID"=v_customer
      and quote."CusQuoteHeader_ID"<>v_quote_id and not quote."CusQuoteHeader_IsDeleted"
      and quote."CusQuoteHeader_CreatedDate">=now()-interval '24 months'
  loop
    perform public.quote_intelligence_enqueue(v_peer, v_user_id, 'customer_pricing_changed', 10);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

commit;
