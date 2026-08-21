-- Real, cached quote intelligence. Numeric decisions remain deterministic;
-- Luna may only attach a bounded refinement to the stored rules result.

begin;

create table public."CusQuote_Intelligence" (
  "CusQuoteIntelligence_QuoteID" uuid primary key
    references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "Company_ID" uuid not null
    references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteIntelligence_StateCode" varchar(40) not null default 'updating'
    check ("CusQuoteIntelligence_StateCode" in ('ready','building_baseline','updating','rules_only','unavailable')),
  "CusQuoteIntelligence_DeterministicJSON" jsonb not null default '{}'::jsonb
    check (jsonb_typeof("CusQuoteIntelligence_DeterministicJSON") = 'object'),
  "CusQuoteIntelligence_AIJSON" jsonb
    check ("CusQuoteIntelligence_AIJSON" is null or jsonb_typeof("CusQuoteIntelligence_AIJSON") = 'object'),
  "CusQuoteIntelligence_InputFingerprint" varchar(64) not null default '',
  "CusQuoteIntelligence_EvidenceFingerprint" varchar(64) not null default '',
  "CusQuoteIntelligence_AlgorithmVersion" varchar(120) not null,
  "CusQuoteIntelligence_ModelVersion" varchar(120),
  "CusQuoteIntelligence_CalculatedAt" timestamptz,
  "CusQuoteIntelligence_AIGeneratedAt" timestamptz,
  "CusQuoteIntelligence_AINextEligibleAt" timestamptz,
  "CusQuoteIntelligence_CreatedAt" timestamptz not null default now(),
  "CusQuoteIntelligence_UpdatedAt" timestamptz not null default now()
);

create index "IX_CusQuote_Intelligence_Company_State_Updated"
  on public."CusQuote_Intelligence"("Company_ID", "CusQuoteIntelligence_StateCode", "CusQuoteIntelligence_UpdatedAt" desc);

create table public."CusQuote_IntelligenceQueue" (
  "CusQuoteIntelligenceQueue_QuoteID" uuid primary key
    references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "Company_ID" uuid not null
    references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteIntelligenceQueue_RequestedBy" uuid
    references public."cmp_Users"("User_ID") on delete set null,
  "CusQuoteIntelligenceQueue_ReasonCode" varchar(80) not null,
  "CusQuoteIntelligenceQueue_StatusCode" varchar(20) not null default 'pending'
    check ("CusQuoteIntelligenceQueue_StatusCode" in ('pending','processing')),
  "CusQuoteIntelligenceQueue_AvailableAt" timestamptz not null default now(),
  "CusQuoteIntelligenceQueue_Attempts" integer not null default 0
    check ("CusQuoteIntelligenceQueue_Attempts" >= 0),
  "CusQuoteIntelligenceQueue_LeaseToken" uuid,
  "CusQuoteIntelligenceQueue_LeaseUntil" timestamptz,
  "CusQuoteIntelligenceQueue_LastError" text,
  "CusQuoteIntelligenceQueue_RequestedAt" timestamptz not null default now(),
  "CusQuoteIntelligenceQueue_UpdatedAt" timestamptz not null default now()
);

create index "IX_CusQuote_IntelligenceQueue_Claim"
  on public."CusQuote_IntelligenceQueue"(
    "CusQuoteIntelligenceQueue_StatusCode",
    "CusQuoteIntelligenceQueue_AvailableAt",
    "CusQuoteIntelligenceQueue_RequestedAt",
    "CusQuoteIntelligenceQueue_QuoteID"
  ) where "CusQuoteIntelligenceQueue_StatusCode" = 'pending';

create index "IX_CusQuote_Header_Intelligence_Cohort"
  on public."CusQuote_Header"(
    "CusQuoteHeader_OrgOfficeID", "CusQuoteHeader_ModeCode",
    "CusQuoteHeader_CustomerID", "CusQuoteHeader_LastEditedDate" desc
  ) where not "CusQuoteHeader_IsDeleted";

create index if not exists "IX_CusQuote_Lines_Quote_Intelligence"
  on public."CusQuote_Lines"("CusQuoteHeader_ID")
  include ("CusQuoteLine_CostAmountLocal", "CusQuoteLine_RevenueAmountLocal", "CusQuoteLine_CostROE", "CusQuoteLine_RevenueROE");

create index if not exists "IX_Job_Header_Intelligence_Cohort"
  on public."Job_Header"("Job_OfficeID", "Job_TransportModeSummary", "Job_Customer", "Job_UpdatedAt" desc)
  where not "Job_IsDeleted";

create index if not exists "IX_Job_Costing_Lines_Job_Intelligence"
  on public."Job_Costing_Lines"("Job_ID")
  include ("JobCostingLine_CostAmountLocal", "JobCostingLine_RevenueAmountLocal");

alter table public."CusQuote_Intelligence" enable row level security;
alter table public."CusQuote_IntelligenceQueue" enable row level security;
revoke all on public."CusQuote_Intelligence", public."CusQuote_IntelligenceQueue"
  from public, anon, authenticated;
grant select on public."CusQuote_Intelligence" to authenticated;
grant select, insert, update, delete on public."CusQuote_Intelligence", public."CusQuote_IntelligenceQueue" to service_role;

create policy "Quote readers can read intelligence"
on public."CusQuote_Intelligence"
for select to authenticated
using (
  "Company_ID" = (
    select profile."Company_ID"
    from public."cmp_Users" profile
    where profile."Auth_User_ID" = (select auth.uid())
      and profile."User_AccessStatus" = 'active'
      and exists (
        select 1
        from public."cmp_Users_Roles" user_role
        join public."sys_UserRole_Permissions" role_permission
          on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
        join public."sys_Permissions" permission
          on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
        where user_role."User_ID" = profile."User_ID"
          and permission."sys_Permission_Value" = 'Quotes.Read'
      )
    limit 1
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'CusQuote_Intelligence'
  ) then
    alter publication supabase_realtime add table public."CusQuote_Intelligence";
  end if;
end;
$$;

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
      and coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") >= now() - interval '24 months'
    order by coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") desc
    limit 250
  ), job_rows as (
    select job."Job_ID" id, job."Job_Customer" customer_id,
      coalesce((select currency from target), 'GBP') currency,
      coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode", '') origin,
      coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode", '') destination,
      coalesce(job."Job_TransportModeSummary", '') mode,
      job."Job_CreatedDate" created_at,
      totals.cost, totals.sell,
      case when totals.sell = 0 then null else ((totals.sell - totals.cost) / totals.sell) * 100 end margin_pct
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
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
      select coalesce(sum(line."JobCostingLine_CostAmountLocal") * coalesce(fx.factor, 0), 0) cost,
        coalesce(sum(line."JobCostingLine_RevenueAmountLocal") * coalesce(fx.factor, 0), 0) sell
      from public."Job_Costing_Lines" line
      where line."Job_ID" = job."Job_ID"
    ) totals on true
    where not job."Job_IsDeleted"
      and job."Job_CreatedDate" >= now() - interval '24 months'
      and fx.factor is not null and totals.cost > 0 and totals.sell > 0
    order by job."Job_UpdatedAt" desc
    limit 250
  ), rate_rows as (
    select sheet."RATESheet_ID" id,
      contract."RATEContract_CustomerOrgID" customer_id,
      coalesce((select currency from target), 'GBP') currency,
      coalesce(lane."RATELane_OriginNameSnapshot", lane."RATELane_OriginUNLocode", '') origin,
      coalesce(lane."RATELane_DestinationNameSnapshot", lane."RATELane_DestinationUNLocode", '') destination,
      coalesce(sheet."RATESheet_ModeCode", lane."RATELane_ModeCode", '') mode,
      coalesce(sheet."RATESheet_ShipmentTypeCode", '') shipment_type,
      coalesce(sheet."RATESheet_ValidFrom", contract."RATEContract_ValidFrom", current_date)::timestamptz effective_at,
      sum(coalesce(line."RATELine_MinimumAmount", line."RATELine_UnitRate", 0) * coalesce(fx.factor, 0)) amount,
      bool_and(fx.factor is not null) fx_complete
    from public."RATE_RateLines" line
    join public."RATE_RateSheets" sheet on sheet."RATESheet_ID" = line."RATELine_SheetID"
    join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = sheet."RATESheet_ContractVerID"
    join public."RATE_Contracts" contract on contract."RATEContract_ID" = version."RATEContractVer_ContractID"
    join public."cmp_Offices" office
      on office."Office_ID" = contract."RATEContract_OrgOfficeID"
     and office."Company_ID" = p_company_id
    left join public."RATE_Lanes" lane on lane."RATELane_ID" = sheet."RATESheet_LaneID"
    left join lateral (
      select case
        when coalesce(line."RATELine_CurrencyCodeSnapshot", sheet."RATESheet_CurrencyCodeSnapshot", contract."RATEContract_CurrencyCodeSnapshot", (select currency from target)) = (select currency from target) then 1::numeric
        else rate."FINRate_MidRate" end factor
      from (select 1) seed
      left join lateral (
        select exchange_rate."FINRate_MidRate"
        from public."FIN_ExchangeRates" exchange_rate
        where exchange_rate."FINRate_IsApproved"
          and exchange_rate."FINRate_MidRate" > 0
          and exchange_rate."FINRate_FromCurrencyCode" = coalesce(line."RATELine_CurrencyCodeSnapshot", sheet."RATESheet_CurrencyCodeSnapshot", contract."RATEContract_CurrencyCodeSnapshot")
          and exchange_rate."FINRate_ToCurrencyCode" = (select currency from target)
        order by exchange_rate."FINRate_RateDate" desc, exchange_rate."FINRate_IsOfficial" desc, exchange_rate."FINRate_ImportedAt" desc
        limit 1
      ) rate on true
    ) fx on true
    where contract."RATEContract_StatusCode" in ('active','approved','published')
      and sheet."RATESheet_StatusCode" in ('active','approved','published')
      and line."RATELine_StatusCode" = 'active'
      and line."RATELine_CalculationMethodCode" = 'flat'
      and coalesce(line."RATELine_MinimumAmount", line."RATELine_UnitRate", 0) > 0
      and coalesce(line."RATELine_ValidFrom", sheet."RATESheet_ValidFrom", contract."RATEContract_ValidFrom", current_date) <= current_date
      and coalesce(line."RATELine_ValidTo", sheet."RATESheet_ValidTo", contract."RATEContract_ValidTo", current_date + 1) >= current_date
    group by sheet."RATESheet_ID", contract."RATEContract_CustomerOrgID", lane."RATELane_OriginNameSnapshot",
      lane."RATELane_OriginUNLocode", lane."RATELane_DestinationNameSnapshot", lane."RATELane_DestinationUNLocode",
      sheet."RATESheet_ModeCode", lane."RATELane_ModeCode", sheet."RATESheet_ShipmentTypeCode",
      sheet."RATESheet_ValidFrom", contract."RATEContract_ValidFrom"
    order by coalesce(sheet."RATESheet_ValidFrom", contract."RATEContract_ValidFrom", current_date) desc
    limit 250
  )
  select jsonb_build_object(
    'target', (select jsonb_build_object(
      'id', id, 'reference', reference, 'customerId', customer_id, 'lifecycle', lifecycle,
      'jobId', job_id, 'currency', currency, 'origin', origin, 'destination', destination,
      'mode', mode, 'shipmentType', shipment_type, 'createdAt', created_at, 'updatedAt', updated_at,
      'validTo', valid_to, 'deadline', deadline, 'cost', cost, 'sell', sell, 'profit', profit,
      'marginPct', margin_pct, 'fxComplete', fx_complete, 'activityCodes', activity_codes
    ) from target),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'reference', reference, 'customerId', customer_id, 'lifecycle', lifecycle,
      'jobId', job_id, 'currency', currency, 'origin', origin, 'destination', destination,
      'mode', mode, 'shipmentType', shipment_type, 'createdAt', created_at, 'updatedAt', updated_at,
      'validTo', valid_to, 'deadline', deadline, 'cost', cost, 'sell', sell, 'profit', profit,
      'marginPct', margin_pct, 'fxComplete', fx_complete, 'activityCodes', activity_codes
    ) order by updated_at desc) from quote_rows), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'customerId', customer_id, 'currency', currency, 'origin', origin,
      'destination', destination, 'mode', mode, 'createdAt', created_at, 'cost', cost,
      'sell', sell, 'marginPct', margin_pct
    ) order by created_at desc) from job_rows), '[]'::jsonb),
    'rates', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'customerId', customer_id, 'currency', currency, 'origin', origin,
      'destination', destination, 'mode', mode, 'shipmentType', shipment_type,
      'effectiveAt', effective_at, 'amount', amount, 'fxComplete', fx_complete
    ) order by effective_at desc) from rate_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.quote_intelligence_evidence(uuid, uuid) from public, anon, authenticated;
grant execute on function public.quote_intelligence_evidence(uuid, uuid) to service_role;

create or replace function public.quote_intelligence_enqueue(
  p_quote_id uuid,
  p_requested_by uuid,
  p_reason text,
  p_delay_seconds integer default 3
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_company_id uuid;
begin
  select office."Company_ID" into v_company_id
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = p_quote_id and not quote."CusQuoteHeader_IsDeleted";
  if v_company_id is null then return false; end if;

  insert into public."CusQuote_IntelligenceQueue"(
    "CusQuoteIntelligenceQueue_QuoteID", "Company_ID", "CusQuoteIntelligenceQueue_RequestedBy",
    "CusQuoteIntelligenceQueue_ReasonCode", "CusQuoteIntelligenceQueue_StatusCode",
    "CusQuoteIntelligenceQueue_AvailableAt"
  ) values (
    p_quote_id, v_company_id, p_requested_by, left(coalesce(nullif(btrim(p_reason), ''), 'quote_changed'), 80),
    'pending', clock_timestamp() + make_interval(secs => greatest(0, least(coalesce(p_delay_seconds, 3), 60)))
  )
  on conflict ("CusQuoteIntelligenceQueue_QuoteID") do update set
    "Company_ID" = excluded."Company_ID",
    "CusQuoteIntelligenceQueue_RequestedBy" = coalesce(excluded."CusQuoteIntelligenceQueue_RequestedBy", "CusQuote_IntelligenceQueue"."CusQuoteIntelligenceQueue_RequestedBy"),
    "CusQuoteIntelligenceQueue_ReasonCode" = excluded."CusQuoteIntelligenceQueue_ReasonCode",
    "CusQuoteIntelligenceQueue_StatusCode" = 'pending',
    "CusQuoteIntelligenceQueue_AvailableAt" = excluded."CusQuoteIntelligenceQueue_AvailableAt",
    "CusQuoteIntelligenceQueue_LeaseToken" = null,
    "CusQuoteIntelligenceQueue_LeaseUntil" = null,
    "CusQuoteIntelligenceQueue_RequestedAt" = clock_timestamp(),
    "CusQuoteIntelligenceQueue_UpdatedAt" = clock_timestamp();
  update public."CusQuote_Intelligence" set
    "CusQuoteIntelligence_StateCode" = 'updating',
    "CusQuoteIntelligence_UpdatedAt" = clock_timestamp()
  where "CusQuoteIntelligence_QuoteID" = p_quote_id
    and "CusQuoteIntelligence_StateCode" <> 'updating';
  return true;
end;
$$;

revoke all on function public.quote_intelligence_enqueue(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.quote_intelligence_enqueue(uuid, uuid, text, integer) to service_role;

create or replace function public._quote_intelligence_header_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.quote_intelligence_enqueue(new."CusQuoteHeader_ID", coalesce(new."CusQuoteHeader_LastEditedBy", new."CusQuoteHeader_CreatedBy"), 'quote_changed', 3);
  return new;
end;
$$;

create or replace function public._quote_intelligence_line_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_quote_id uuid; v_user_id uuid;
begin
  if tg_op = 'DELETE' then v_quote_id := old."CusQuoteHeader_ID";
  else v_quote_id := new."CusQuoteHeader_ID";
  end if;
  select coalesce(quote."CusQuoteHeader_LastEditedBy", quote."CusQuoteHeader_CreatedBy") into v_user_id
  from public."CusQuote_Header" quote where quote."CusQuoteHeader_ID" = v_quote_id;
  perform public.quote_intelligence_enqueue(v_quote_id, v_user_id, 'quote_charges_changed', 3);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_intelligence" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_intelligence"
after insert or update of
  "CusQuoteHeader_CustomerID", "CusQuoteHeader_LifecycleCode", "CusQuoteHeader_JobID",
  "CusQuoteHeader_CurrencyCode", "CusQuoteHeader_LoadingPoint", "CusQuoteHeader_DischargePoint",
  "CusQuoteHeader_OriginExtra", "CusQuoteHeader_DestinationExtra", "CusQuoteHeader_ModeCode",
  "CusQuoteHeader_ShipmentTypeCode", "CusQuoteHeader_ValidTo", "CusQuoteHeader_Deadline"
on public."CusQuote_Header" for each row execute function public._quote_intelligence_header_changed();

drop trigger if exists "TR_CusQuote_Lines_intelligence" on public."CusQuote_Lines";
create trigger "TR_CusQuote_Lines_intelligence"
after insert or update or delete on public."CusQuote_Lines"
for each row execute function public._quote_intelligence_line_changed();

create or replace function public._quote_intelligence_job_cost_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_job_id uuid; v_job record; v_quote_id uuid; v_user_id uuid;
begin
  if tg_op = 'DELETE' then v_job_id := old."Job_ID"; v_user_id := old."JobCostingLine_UpdatedBy";
  else v_job_id := new."Job_ID"; v_user_id := coalesce(new."JobCostingLine_UpdatedBy", new."JobCostingLine_CreatedBy");
  end if;
  select job.*, office."Company_ID" into v_job
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = v_job_id and not job."Job_IsDeleted";
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  for v_quote_id in
    select quote."CusQuoteHeader_ID"
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where office."Company_ID" = v_job."Company_ID"
      and not quote."CusQuoteHeader_IsDeleted"
      and coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft') not in ('declined','ghosted','accepted','converted')
      and (
        quote."CusQuoteHeader_JobID" = v_job_id
        or (
          quote."CusQuoteHeader_CustomerID" = v_job."Job_Customer"
          and lower(coalesce(quote."CusQuoteHeader_ModeCode", '')) = lower(coalesce(v_job."Job_TransportModeSummary", ''))
        )
      )
    order by coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") desc
    limit 250
  loop
    perform public.quote_intelligence_enqueue(v_quote_id, v_user_id, 'job_costing_changed', 10);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public._quote_intelligence_rate_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_sheet_id uuid; v_rate record; v_quote_id uuid; v_user_id uuid;
begin
  if tg_op = 'DELETE' then v_sheet_id := old."RATELine_SheetID"; v_user_id := old."RATELine_UpdatedBy";
  else v_sheet_id := new."RATELine_SheetID"; v_user_id := coalesce(new."RATELine_UpdatedBy", new."RATELine_CreatedBy");
  end if;
  select office."Company_ID", sheet."RATESheet_ModeCode", sheet."RATESheet_ShipmentTypeCode",
    contract."RATEContract_CustomerOrgID", lane."RATELane_OriginNameSnapshot", lane."RATELane_DestinationNameSnapshot"
  into v_rate
  from public."RATE_RateSheets" sheet
  join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = sheet."RATESheet_ContractVerID"
  join public."RATE_Contracts" contract on contract."RATEContract_ID" = version."RATEContractVer_ContractID"
  join public."cmp_Offices" office on office."Office_ID" = contract."RATEContract_OrgOfficeID"
  left join public."RATE_Lanes" lane on lane."RATELane_ID" = sheet."RATESheet_LaneID"
  where sheet."RATESheet_ID" = v_sheet_id;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  for v_quote_id in
    select quote."CusQuoteHeader_ID"
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where office."Company_ID" = v_rate."Company_ID"
      and not quote."CusQuoteHeader_IsDeleted"
      and coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft') not in ('declined','ghosted','accepted','converted')
      and (v_rate."RATESheet_ModeCode" is null or lower(coalesce(quote."CusQuoteHeader_ModeCode", '')) = lower(v_rate."RATESheet_ModeCode"))
      and (v_rate."RATESheet_ShipmentTypeCode" is null or lower(coalesce(quote."CusQuoteHeader_ShipmentTypeCode", '')) = lower(v_rate."RATESheet_ShipmentTypeCode"))
      and (v_rate."RATEContract_CustomerOrgID" is null or quote."CusQuoteHeader_CustomerID" = v_rate."RATEContract_CustomerOrgID")
    order by coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") desc
    limit 250
  loop
    perform public.quote_intelligence_enqueue(v_quote_id, v_user_id, 'published_rate_changed', 10);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists "TR_Job_Costing_Lines_quote_intelligence" on public."Job_Costing_Lines";
create trigger "TR_Job_Costing_Lines_quote_intelligence"
after insert or update or delete on public."Job_Costing_Lines"
for each row execute function public._quote_intelligence_job_cost_changed();

drop trigger if exists "TR_RATE_RateLines_quote_intelligence" on public."RATE_RateLines";
create trigger "TR_RATE_RateLines_quote_intelligence"
after insert or update or delete on public."RATE_RateLines"
for each row execute function public._quote_intelligence_rate_changed();

create or replace function public.quote_intelligence_claim_batch(
  p_lease_token uuid,
  p_limit integer default 10
)
returns table (quote_id uuid, company_id uuid, requested_by uuid, reason_code text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_lease_token is null then raise exception 'A worker lease token is required.' using errcode = '22023'; end if;
  return query
  with anchor as (
    select queue."Company_ID", queue."CusQuoteIntelligenceQueue_RequestedBy"
    from public."CusQuote_IntelligenceQueue" queue
    where queue."CusQuoteIntelligenceQueue_StatusCode" = 'pending'
      and queue."CusQuoteIntelligenceQueue_AvailableAt" <= clock_timestamp()
      and (queue."CusQuoteIntelligenceQueue_LeaseUntil" is null or queue."CusQuoteIntelligenceQueue_LeaseUntil" <= clock_timestamp())
    order by queue."CusQuoteIntelligenceQueue_RequestedAt", queue."CusQuoteIntelligenceQueue_QuoteID"
    for update skip locked limit 1
  ), candidates as (
    select queue."CusQuoteIntelligenceQueue_QuoteID"
    from public."CusQuote_IntelligenceQueue" queue, anchor
    where queue."Company_ID" = anchor."Company_ID"
      and queue."CusQuoteIntelligenceQueue_RequestedBy" is not distinct from anchor."CusQuoteIntelligenceQueue_RequestedBy"
      and queue."CusQuoteIntelligenceQueue_StatusCode" = 'pending'
      and queue."CusQuoteIntelligenceQueue_AvailableAt" <= clock_timestamp()
      and (queue."CusQuoteIntelligenceQueue_LeaseUntil" is null or queue."CusQuoteIntelligenceQueue_LeaseUntil" <= clock_timestamp())
    order by queue."CusQuoteIntelligenceQueue_RequestedAt", queue."CusQuoteIntelligenceQueue_QuoteID"
    for update of queue skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 10))
  ), claimed as (
    update public."CusQuote_IntelligenceQueue" queue set
      "CusQuoteIntelligenceQueue_StatusCode" = 'processing',
      "CusQuoteIntelligenceQueue_LeaseToken" = p_lease_token,
      "CusQuoteIntelligenceQueue_LeaseUntil" = clock_timestamp() + interval '2 minutes',
      "CusQuoteIntelligenceQueue_Attempts" = queue."CusQuoteIntelligenceQueue_Attempts" + 1,
      "CusQuoteIntelligenceQueue_UpdatedAt" = clock_timestamp()
    from candidates where queue."CusQuoteIntelligenceQueue_QuoteID" = candidates."CusQuoteIntelligenceQueue_QuoteID"
    returning queue.*
  )
  select claimed."CusQuoteIntelligenceQueue_QuoteID", claimed."Company_ID",
    claimed."CusQuoteIntelligenceQueue_RequestedBy", claimed."CusQuoteIntelligenceQueue_ReasonCode"::text
  from claimed;
end;
$$;

create or replace function public.quote_intelligence_complete_job(
  p_quote_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error text default null,
  p_retry_at timestamptz default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_changed integer;
begin
  if p_succeeded and p_retry_at is null then
    delete from public."CusQuote_IntelligenceQueue"
    where "CusQuoteIntelligenceQueue_QuoteID" = p_quote_id
      and "CusQuoteIntelligenceQueue_LeaseToken" = p_lease_token
      and "CusQuoteIntelligenceQueue_StatusCode" = 'processing';
  elsif p_succeeded then
    update public."CusQuote_IntelligenceQueue" set
      "CusQuoteIntelligenceQueue_StatusCode" = 'pending',
      "CusQuoteIntelligenceQueue_AvailableAt" = greatest(p_retry_at, clock_timestamp() + interval '1 minute'),
      "CusQuoteIntelligenceQueue_LeaseToken" = null,
      "CusQuoteIntelligenceQueue_LeaseUntil" = null,
      "CusQuoteIntelligenceQueue_LastError" = null,
      "CusQuoteIntelligenceQueue_UpdatedAt" = clock_timestamp()
    where "CusQuoteIntelligenceQueue_QuoteID" = p_quote_id
      and "CusQuoteIntelligenceQueue_LeaseToken" = p_lease_token
      and "CusQuoteIntelligenceQueue_StatusCode" = 'processing';
  else
    update public."CusQuote_IntelligenceQueue" set
      "CusQuoteIntelligenceQueue_StatusCode" = 'pending',
      "CusQuoteIntelligenceQueue_AvailableAt" = clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ least("CusQuoteIntelligenceQueue_Attempts", 7)))::integer),
      "CusQuoteIntelligenceQueue_LeaseToken" = null,
      "CusQuoteIntelligenceQueue_LeaseUntil" = null,
      "CusQuoteIntelligenceQueue_LastError" = left(coalesce(p_error, 'quote_intelligence_failed'), 1000),
      "CusQuoteIntelligenceQueue_UpdatedAt" = clock_timestamp()
    where "CusQuoteIntelligenceQueue_QuoteID" = p_quote_id
      and "CusQuoteIntelligenceQueue_LeaseToken" = p_lease_token
      and "CusQuoteIntelligenceQueue_StatusCode" = 'processing';
  end if;
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

create or replace function public.quote_intelligence_apply_ai(
  p_quote_id uuid,
  p_input_fingerprint text,
  p_adjustment_points numeric,
  p_reason_codes jsonb,
  p_card_explanations jsonb,
  p_model text,
  p_prompt_version text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_updated integer;
begin
  if p_adjustment_points < -8 or p_adjustment_points > 8 then
    raise exception 'Quote intelligence adjustment is outside the allowed range.' using errcode = '22023';
  end if;
  update public."CusQuote_Intelligence" set
    "CusQuoteIntelligence_AIJSON" = jsonb_build_object(
      'adjustmentPoints', round(p_adjustment_points, 2),
      'inputFingerprint', p_input_fingerprint,
      'reasonCodes', case when jsonb_typeof(p_reason_codes) = 'array' then p_reason_codes else '[]'::jsonb end,
      'cardExplanations', case when jsonb_typeof(p_card_explanations) = 'object' then p_card_explanations else '{}'::jsonb end,
      'model', left(p_model, 120), 'promptVersion', left(p_prompt_version, 120), 'generatedAt', now()
    ),
    "CusQuoteIntelligence_ModelVersion" = left(p_model, 120),
    "CusQuoteIntelligence_AIGeneratedAt" = now(),
    "CusQuoteIntelligence_AINextEligibleAt" = now() + interval '24 hours',
    "CusQuoteIntelligence_UpdatedAt" = now()
  where "CusQuoteIntelligence_QuoteID" = p_quote_id
    and "CusQuoteIntelligence_InputFingerprint" = p_input_fingerprint
    and coalesce(("CusQuoteIntelligence_DeterministicJSON"->>'aiEligible')::boolean, false)
    and ("CusQuoteIntelligence_AINextEligibleAt" is null or "CusQuoteIntelligence_AINextEligibleAt" <= now());
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.quote_intelligence_claim_batch(uuid, integer) from public, anon, authenticated;
revoke all on function public.quote_intelligence_complete_job(uuid, uuid, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.quote_intelligence_apply_ai(uuid, text, numeric, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.quote_intelligence_claim_batch(uuid, integer) to service_role;
grant execute on function public.quote_intelligence_complete_job(uuid, uuid, boolean, text, timestamptz) to service_role;
grant execute on function public.quote_intelligence_apply_ai(uuid, text, numeric, jsonb, jsonb, text, text) to service_role;

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
    'aiWinLikelihood', coalesce((old."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiWinLikelihood,value,basePct}')::numeric, 0) + v_adjustment,
    'priceConfidence', (old."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,priceConfidence,value,score}')::numeric,
    'temperature', coalesce((old."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiTemperature,value,baseScore}')::numeric, 0) + v_adjustment * 0.45
  );
  v_adjustment := 0;
  if new."CusQuoteIntelligence_AIJSON"->>'inputFingerprint' = new."CusQuoteIntelligence_InputFingerprint" then
    v_adjustment := coalesce((new."CusQuoteIntelligence_AIJSON"->>'adjustmentPoints')::numeric, 0);
  end if;
  v_new := jsonb_build_object(
    'intelligenceState', new."CusQuoteIntelligence_StateCode",
    'aiWinLikelihood', coalesce((new."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiWinLikelihood,value,basePct}')::numeric, 0) + v_adjustment,
    'priceConfidence', (new."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,priceConfidence,value,score}')::numeric,
    'temperature', coalesce((new."CusQuoteIntelligence_DeterministicJSON"#>>'{metrics,aiTemperature,value,baseScore}')::numeric, 0) + v_adjustment * 0.45
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

drop trigger if exists "TR_CusQuote_Intelligence_dexter_watch" on public."CusQuote_Intelligence";
create trigger "TR_CusQuote_Intelligence_dexter_watch"
after update on public."CusQuote_Intelligence"
for each row execute function public._quote_intelligence_watch_change();

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
  "AIDexterDomain_Description" = 'Customer quotes with real historical outcomes, pricing evidence, deterministic win intelligence, cached AI refinement and source freshness.',
  "AIDexterDomain_QueryFunction" = 'multideck_dexter_domain_quotes_intelligence',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Quote lifecycle, route, margin and deterministic intelligence threshold changes. Evaluation is event-driven and makes no recurring LLM calls.',
  "AIDexterWatchCapability_FieldsJSON" = '["quoteNumber","customerReference","status","deadline","validFrom","validTo","origin","destination","supplier","carrier","followUpAt","aiWinLikelihood","priceConfidence","temperature","intelligenceState"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'multideck_quote_intelligence_worker_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'multideck_quote_intelligence_worker_secret',
      'Authenticates the tenant-local quote intelligence worker.'
    );
  end if;
end;
$$;

create or replace function public."AI_GetQuoteIntelligenceWorkerSecret"()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'multideck_quote_intelligence_worker_secret' limit 1;
$$;
revoke all on function public."AI_GetQuoteIntelligenceWorkerSecret"() from public, anon, authenticated;
grant execute on function public."AI_GetQuoteIntelligenceWorkerSecret"() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public."AI_ConfigureQuoteIntelligenceSchedule"()
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare v_endpoint text; v_job_id bigint;
begin
  select decrypted_secret into v_endpoint from vault.decrypted_secrets
  where name = 'multideck_quote_intelligence_worker_endpoint' limit 1;
  if nullif(btrim(v_endpoint), '') is null then return false; end if;
  for v_job_id in select jobid from cron.job where jobname = 'multideck-quote-intelligence' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('multideck-quote-intelligence', '* * * * *', format($command$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-multideck-quote-intelligence-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'multideck_quote_intelligence_worker_secret' limit 1
        )
      ),
      body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
      timeout_milliseconds := 55000
    );
  $command$, btrim(v_endpoint)));
  return true;
end;
$$;
revoke all on function public."AI_ConfigureQuoteIntelligenceSchedule"() from public, anon, authenticated, service_role;

insert into public."CusQuote_IntelligenceQueue"(
  "CusQuoteIntelligenceQueue_QuoteID", "Company_ID", "CusQuoteIntelligenceQueue_RequestedBy",
  "CusQuoteIntelligenceQueue_ReasonCode", "CusQuoteIntelligenceQueue_AvailableAt"
)
select quote."CusQuoteHeader_ID", office."Company_ID",
  coalesce(quote."CusQuoteHeader_LastEditedBy", quote."CusQuoteHeader_CreatedBy"),
  'initial_backfill', now()
from public."CusQuote_Header" quote
join public."cmp_Offices" office
  on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
where not quote."CusQuoteHeader_IsDeleted"
on conflict ("CusQuoteIntelligenceQueue_QuoteID") do nothing;

select public."AI_ConfigureQuoteIntelligenceSchedule"();

commit;
