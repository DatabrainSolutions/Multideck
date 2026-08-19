-- Quote editors need one current approved rate per currency pair, not the full
-- exchange-rate history. Resolve those rows in Postgres and return a compact set.

begin;

create index if not exists "IX_FIN_ExchangeRates_LatestApprovedPair"
  on public."FIN_ExchangeRates" (
    "FINRate_FromCurrencyCode",
    "FINRate_ToCurrencyCode",
    "FINRate_RateDate" desc,
    "FINRate_IsOfficial" desc,
    "FINRate_ImportedAt" desc,
    "FINRate_ID" desc
  )
  include ("FINRate_ProviderID", "FINRate_ImportID", "FINRate_MidRate", "FINRate_SourceReference")
  where "FINRate_IsApproved" and "FINRate_MidRate" > 0;

create or replace function public.multideck_finance_latest_exchange_rates(p_currency_codes text[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with requested as (
    select distinct upper(btrim(code)) as code
    from unnest(coalesce(p_currency_codes, '{}'::text[])) code
    where upper(btrim(code)) ~ '^[A-Z]{3}$'
    limit 64
  ), latest as (
    select distinct on (rate."FINRate_FromCurrencyCode", rate."FINRate_ToCurrencyCode")
      rate."FINRate_ID",
      rate."FINRate_FromCurrencyCode",
      rate."FINRate_ToCurrencyCode",
      rate."FINRate_RateDate",
      rate."FINRate_MidRate",
      rate."FINRate_ImportID",
      rate."FINRate_SourceReference",
      rate."FINRate_IsOfficial",
      rate."FINRate_ImportedAt",
      provider."FINRateProvider_Name"
    from public."FIN_ExchangeRates" rate
    join public."FIN_ExchangeRateProviders" provider
      on provider."FINRateProvider_ID" = rate."FINRate_ProviderID"
     and provider."FINRateProvider_IsActive"
    where rate."FINRate_IsApproved"
      and rate."FINRate_MidRate" > 0
      and rate."FINRate_FromCurrencyCode" in (select code from requested)
      and rate."FINRate_ToCurrencyCode" in (select code from requested)
    order by
      rate."FINRate_FromCurrencyCode",
      rate."FINRate_ToCurrencyCode",
      rate."FINRate_RateDate" desc,
      rate."FINRate_IsOfficial" desc,
      rate."FINRate_ImportedAt" desc,
      rate."FINRate_ID" desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'FINRate_ID', latest."FINRate_ID",
    'FINRate_FromCurrencyCode', latest."FINRate_FromCurrencyCode",
    'FINRate_ToCurrencyCode', latest."FINRate_ToCurrencyCode",
    'FINRate_RateDate', latest."FINRate_RateDate",
    'FINRate_MidRate', latest."FINRate_MidRate",
    'FINRate_ImportID', latest."FINRate_ImportID",
    'FINRate_SourceReference', latest."FINRate_SourceReference",
    'FINRate_IsOfficial', latest."FINRate_IsOfficial",
    'FINRate_ImportedAt', latest."FINRate_ImportedAt",
    'providerName', latest."FINRateProvider_Name"
  ) order by latest."FINRate_FromCurrencyCode", latest."FINRate_ToCurrencyCode"), '[]'::jsonb)
  from latest
$$;

revoke all on function public.multideck_finance_latest_exchange_rates(text[]) from public, anon, authenticated;
grant execute on function public.multideck_finance_latest_exchange_rates(text[]) to service_role;

comment on function public.multideck_finance_latest_exchange_rates(text[]) is
  'Returns at most one current approved rate per requested currency pair for the Finance Edge Function.';

commit;
