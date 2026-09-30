-- Finance Director dashboard: revenue, profit, cash, forecast inputs and the
-- customer, mode and region splits behind them, for one legal entity.
--
-- Access: only the new built-in Finance Director role holds
-- Finance.Director.Dashboard.View. A user may hold Administrator alongside it.
-- The role also carries read-only finance, reporting and workspace visibility,
-- so it works as someone's only role.
--
-- Figures: the P&L and cash series come from the posted native ledger
-- (FIN_PostingLines on posted batches) and approved cash transactions, the same
-- sources as the Finance reports page. Customer, mode and region splits come
-- from approved sales and purchase documents, attributed to jobs through
-- FIN_DocumentLineJobLinks. Every amount is in the legal entity's base currency.
--
-- The read model is service-role only. The finance-director-dashboard edge
-- function authenticates the caller, requires the permission, and passes the
-- caller's company; the function re-checks the company, the entity and the
-- permission itself so a mistaken caller cannot widen access.
--
-- Dexter exception: this function only aggregates finance records Dexter can
-- already read through multideck_dexter_domain_finance (posted ledger totals,
-- documents and cash). It adds no new data, write, action or watch semantics,
-- and exposing the Finance Director aggregates to every Dexter user would widen
-- access beyond the role, so Dexter keeps its existing finance domain.

begin;

create schema if not exists private;

insert into public."sys_Permissions" ("sys_Permission_Value","sys_Permission_Group","sys_Permission_Name","sys_Permission_Description")
values ('Finance.Director.Dashboard.View','Finance','View the Admin dashboard','See revenue, profit, cash flow, forecasts and the customer, mode and region splits for the whole company. Reserved for Finance Directors.')
on conflict ("sys_Permission_Value") do nothing;

insert into public."sys_UserRoles" ("sys_UserRole_Name")
select 'Finance Director'
where not exists (select 1 from public."sys_UserRoles" where lower("sys_UserRole_Name") = 'finance director');

insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID","sys_Permission_ID")
select r."sys_UserRole_ID", p."sys_Permission_ID"
from public."sys_UserRoles" r cross join public."sys_Permissions" p
where lower(r."sys_UserRole_Name") = 'finance director'
  and p."sys_Permission_Value" in (
    'Finance.Director.Dashboard.View',
    'Finance.Reporting.View','Finance.Management.View','Finance.Receivables.View','Finance.Payables.View','Finance.Compliance.View',
    'AgentDexter.Read','CRM.Read','Customers.Read','Documents.Read','Quotes.Read','Reports.Read','Settings.Read','Shipments.Read','Users.Read'
  )
on conflict do nothing;

-- Keep the dashboard permission on the Finance Director role alone.
delete from public."sys_UserRole_Permissions" link
using public."sys_Permissions" permission, public."sys_UserRoles" role
where permission."sys_Permission_ID" = link."sys_Permission_ID"
  and role."sys_UserRole_ID" = link."sys_UserRole_ID"
  and permission."sys_Permission_Value" = 'Finance.Director.Dashboard.View'
  and lower(role."sys_UserRole_Name") <> 'finance director';

-- The overseas end of a lane, as a trading region. ISO 3166 alpha-2 in, one of
-- eight regions out; the entity's own country is 'Domestic'.
create or replace function private.multideck_finance_region(p_country text, p_home text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_country is null or btrim(p_country) = '' then 'Unassigned'
    when upper(p_country) = upper(coalesce(p_home, '')) then 'Domestic'
    when upper(p_country) = any(array['AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FO','FR','GB','GG','GI','GR','HR','HU','IE','IM','IS','IT','JE','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','SM','UA','VA','XK']) then 'Europe'
    when upper(p_country) = any(array['US','CA','BM','GL','PM']) then 'North America'
    when upper(p_country) = any(array['MX','GT','BZ','SV','HN','NI','CR','PA','CU','DO','HT','JM','BS','BB','TT','AG','DM','GD','KN','LC','VC','PR','AW','CW','SX','BQ','KY','TC','VG','VI','AI','MS','GP','MQ','BL','MF','CO','VE','EC','PE','BO','CL','AR','UY','PY','BR','GY','SR','GF','FK']) then 'Latin America'
    when upper(p_country) = any(array['AE','SA','QA','KW','BH','OM','YE','IQ','IR','IL','JO','LB','SY','PS','TR']) then 'Middle East'
    when upper(p_country) = any(array['DZ','EG','LY','MA','TN','SD','SS','EH','MR','ML','NE','TD','NG','GH','CI','SN','GM','GN','GW','SL','LR','BF','BJ','TG','CV','ET','ER','DJ','SO','KE','UG','TZ','RW','BI','CD','CG','CF','CM','GA','GQ','ST','AO','ZM','ZW','MW','MZ','MG','MU','SC','KM','NA','BW','ZA','LS','SZ','RE','YT','SH']) then 'Africa'
    when upper(p_country) = any(array['CN','HK','MO','TW','JP','KR','KP','MN','IN','PK','BD','LK','NP','BT','MV','AF','KZ','KG','TJ','TM','UZ','SG','MY','ID','TH','VN','PH','KH','LA','MM','BN','TL','AM','AZ','GE']) then 'Asia'
    when upper(p_country) = any(array['AU','NZ','PG','FJ','SB','VU','NC','PF','WS','TO','KI','TV','NR','PW','FM','MH','GU','MP','AS','CK','NU']) then 'Oceania'
    else 'Other'
  end
$$;

revoke all on function private.multideck_finance_region(text, text) from public, anon, authenticated;
grant execute on function private.multideck_finance_region(text, text) to service_role;

create or replace function public.multideck_finance_director_dashboard(
  p_company_id uuid,
  p_user_id uuid,
  p_legal_entity_id uuid,
  p_from_date date,
  p_to_date date,
  p_as_of date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_from date;
  v_to date;
  v_as_of date := coalesce(p_as_of, current_date);
  v_series_start date;
  v_series_end date;
  v_currency text;
  v_entity_name text;
  v_home text;
begin
  if not exists (
    select 1 from public."cmp_Users"
    where "User_ID" = p_user_id and "Company_ID" = p_company_id and coalesce("User_AccessStatus", 'active') = 'active'
  ) then
    raise exception 'The finance operator is outside this workspace.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public."cmp_Users_Roles" assignment
    join public."sys_UserRole_Permissions" link on link."sys_UserRole_ID" = assignment."sys_UserRole_ID"
    join public."sys_Permissions" permission on permission."sys_Permission_ID" = link."sys_Permission_ID"
    where assignment."User_ID" = p_user_id and permission."sys_Permission_Value" = 'Finance.Director.Dashboard.View'
  ) then
    raise exception 'The Admin dashboard is for Finance Directors.' using errcode = '42501';
  end if;

  select "LegalEntity_Name", upper("LegalEntity_BaseCurrencyCodeSnapshot"), upper("LegalEntity_CountryCode")
  into v_entity_name, v_currency, v_home
  from public."cmp_LegalEntities"
  where "LegalEntity_ID" = p_legal_entity_id and "Company_ID" = p_company_id and "LegalEntity_IsActive";
  if not found then
    raise exception 'That legal entity is outside this workspace.' using errcode = '42501';
  end if;

  if p_from_date is null or p_to_date is null or p_to_date < p_from_date or p_to_date > p_from_date + interval '3 years' then
    raise exception 'Choose a reporting period of no more than three years.' using errcode = '22023';
  end if;
  v_from := date_trunc('month', p_from_date)::date;
  v_to := (date_trunc('month', p_to_date) + interval '1 month' - interval '1 day')::date;
  -- Twenty-four months ending with the month being reported: a full year to
  -- read the period against, and a year before it for the comparison.
  v_series_end := (date_trunc('month', v_as_of) + interval '1 month' - interval '1 day')::date;
  v_series_start := (date_trunc('month', v_as_of) - interval '23 months')::date;

  return (
    with months as (
      select month::date as month_start
      from generate_series(v_series_start, date_trunc('month', v_as_of)::date, interval '1 month') month
    ),
    posted as (
      select
        date_trunc('month', period."FINPeriod_StartDate")::date as month_start,
        nominal."FINNom_ID" as account_id,
        nominal."FINNom_Code" as account_code,
        nominal."FINNom_Name" as account_name,
        coalesce(nominal."FINNom_ReportCategoryCode", 'asset') as category,
        line."FINPostLine_DebitAmount" as debit,
        line."FINPostLine_CreditAmount" as credit
      from public."FIN_PostingLines" line
      join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID" = line."FINPostLine_BatchID" and batch."FINPostBatch_StatusCode" = 'posted'
      join public."FIN_Periods" period on period."FINPeriod_ID" = batch."FINPostBatch_PeriodID"
      join public."FIN_NominalAccounts" nominal on nominal."FINNom_ID" = line."FINPostLine_NominalAccountID"
      where batch."FINPostBatch_LegalEntityID" = p_legal_entity_id
        and period."FINPeriod_StartDate" <= v_series_end
    ),
    ledger_months as (
      select
        month_start,
        coalesce(sum(credit - debit) filter (where category = 'income'), 0) as revenue,
        coalesce(sum(debit - credit) filter (where category = 'direct_cost'), 0) as direct_cost,
        coalesce(sum(debit - credit) filter (where category in ('expense', 'finance')), 0) as overheads
      from posted
      where month_start >= v_series_start
      group by month_start
    ),
    cash as (
      select
        date_trunc('month', coalesce(cash."FINCash_AccountingDate", cash."FINCash_TransactionDate"))::date as month_start,
        cash."FINCash_TypeCode" as type_code,
        abs(coalesce(cash."FINCash_LocalAmount", cash."FINCash_Amount", 0)) as amount
      from public."FIN_CashTransactions" cash
      where cash."FINCash_LegalEntityID" = p_legal_entity_id
        and cash."FINCash_StatusCode" in ('approved', 'submitted')
        and cash."FINCash_TypeCode" in ('customer_receipt', 'supplier_payment')
        and coalesce(cash."FINCash_AccountingDate", cash."FINCash_TransactionDate") between v_series_start and v_series_end
    ),
    cash_months as (
      select
        month_start,
        coalesce(sum(amount) filter (where type_code = 'customer_receipt'), 0) as cash_in,
        coalesce(sum(amount) filter (where type_code = 'supplier_payment'), 0) as cash_out
      from cash
      group by month_start
    ),
    series as (
      select
        months.month_start,
        round(coalesce(ledger.revenue, 0), 2) as revenue,
        round(coalesce(ledger.direct_cost, 0), 2) as direct_cost,
        round(coalesce(ledger.overheads, 0), 2) as overheads,
        round(coalesce(cash_months.cash_in, 0), 2) as cash_in,
        round(coalesce(cash_months.cash_out, 0), 2) as cash_out
      from months
      left join ledger_months ledger on ledger.month_start = months.month_start
      left join cash_months on cash_months.month_start = months.month_start
    ),
    overhead_accounts as (
      select account_code, account_name, round(sum(debit - credit), 2) as amount
      from posted
      where category in ('expense', 'finance') and month_start between v_from and v_to
      group by account_code, account_name
      having round(sum(debit - credit), 2) > 0
      order by amount desc
      limit 5
    ),
    -- Approved documents in the reporting period. Credit and debit notes are
    -- forced negative whichever sign they were stored with.
    documents as (
      select
        document."FINDoc_ID" as document_id,
        document."FINDoc_TypeCode" as type_code,
        document."FINDoc_PartyOrgID" as party_id,
        case when document."FINDoc_TypeCode" in ('credit_note', 'debit_note') then -1 else 1 end as sign,
        abs(coalesce(document."FINDoc_LocalNetAmount", document."FINDoc_NetAmount", 0)) as net
      from public."FIN_Documents" document
      where document."FINDoc_LegalEntityID" = p_legal_entity_id
        and document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note', 'pl_invoice', 'debit_note')
        and document."FINDoc_StatusCode" in ('approved', 'submitted', 'posted', 'part_paid', 'paid')
        and coalesce(document."FINDoc_AccountingDate", document."FINDoc_DocumentDate") between v_from and v_to
    ),
    customer_sales as (
      select party_id, sum(sign * net) as revenue, count(*) filter (where type_code = 'sl_invoice') as invoices
      from documents
      where type_code in ('sl_invoice', 'credit_note') and party_id is not null
      group by party_id
    ),
    job_amounts as (
      select
        link."FINDocLineJob_JobID" as job_id,
        sum(document.sign * abs(coalesce(link."FINDocLineJob_LocalNetAmount", link."FINDocLineJob_NetAmount", 0)))
          filter (where document.type_code in ('sl_invoice', 'credit_note')) as revenue,
        sum(document.sign * abs(coalesce(link."FINDocLineJob_LocalNetAmount", link."FINDocLineJob_NetAmount", 0)))
          filter (where document.type_code in ('pl_invoice', 'debit_note')) as cost
      from public."FIN_DocumentLineJobLinks" link
      join documents document on document.document_id = link."FINDocLineJob_DocumentID"
      where link."FINDocLineJob_JobID" is not null
      group by link."FINDocLineJob_JobID"
    ),
    jobs as (
      select
        amounts.job_id,
        coalesce(amounts.revenue, 0) as revenue,
        coalesce(amounts.cost, 0) as cost,
        job."Job_Customer" as customer_id,
        coalesce(nullif(lower(btrim(job."Job_TransportModeSummary")), ''), 'unassigned') as mode,
        private.multideck_finance_region(
          case
            when upper(left(job."Job_DestinationUNLocode", 2)) is distinct from v_home and nullif(btrim(job."Job_DestinationUNLocode"), '') is not null
              then left(job."Job_DestinationUNLocode", 2)
            when nullif(btrim(job."Job_OriginUNLocode"), '') is not null
              then left(job."Job_OriginUNLocode", 2)
            else left(job."Job_DestinationUNLocode", 2)
          end,
          v_home
        ) as region
      from job_amounts amounts
      join public."Job_Header" job on job."Job_ID" = amounts.job_id
    ),
    customer_jobs as (
      select customer_id, sum(revenue) as linked_revenue, sum(cost) as linked_cost, count(*) as jobs
      from jobs where customer_id is not null group by customer_id
    ),
    customers as (
      select
        sales.party_id,
        coalesce(nullif(btrim(org."Org_Name"), ''), 'Unnamed customer') as name,
        round(sales.revenue, 2) as revenue,
        sales.invoices,
        round(coalesce(linked.linked_revenue, 0), 2) as linked_revenue,
        round(coalesce(linked.linked_cost, 0), 2) as linked_cost,
        coalesce(linked.jobs, 0) as jobs,
        row_number() over (order by sales.revenue desc, org."Org_Name") as rank
      from customer_sales sales
      left join public."Org_Master" org on org."Org_id" = sales.party_id
      left join customer_jobs linked on linked.customer_id = sales.party_id
      where sales.revenue <> 0
    ),
    modes as (
      select mode as key, round(sum(revenue), 2) as revenue, round(sum(cost), 2) as cost, count(*) as jobs
      from jobs group by mode
    ),
    regions as (
      select region as key, round(sum(revenue), 2) as revenue, round(sum(cost), 2) as cost, count(*) as jobs
      from jobs group by region
    ),
    open_items as (
      select
        case when document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note') then 'receivable' else 'payable' end as ledger,
        (case when document."FINDoc_TypeCode" in ('credit_note', 'debit_note') then -1 else 1 end)
          * abs(coalesce(document."FINDoc_LocalOutstandingAmount", document."FINDoc_OutstandingAmount", 0)) as outstanding,
        greatest(v_as_of - coalesce(document."FINDoc_DueDate", document."FINDoc_DocumentDate"), 0) as days_overdue
      from public."FIN_Documents" document
      where document."FINDoc_LegalEntityID" = p_legal_entity_id
        and document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note', 'pl_invoice', 'debit_note')
        and document."FINDoc_StatusCode" in ('approved', 'submitted', 'posted', 'part_paid')
        and coalesce(document."FINDoc_LocalOutstandingAmount", document."FINDoc_OutstandingAmount", 0) <> 0
    ),
    ageing as (
      select
        ledger,
        round(sum(outstanding), 2) as total,
        round(coalesce(sum(outstanding) filter (where days_overdue = 0), 0), 2) as current_amount,
        round(coalesce(sum(outstanding) filter (where days_overdue between 1 and 30), 0), 2) as days_1_30,
        round(coalesce(sum(outstanding) filter (where days_overdue between 31 and 60), 0), 2) as days_31_60,
        round(coalesce(sum(outstanding) filter (where days_overdue between 61 and 90), 0), 2) as days_61_90,
        round(coalesce(sum(outstanding) filter (where days_overdue > 90), 0), 2) as days_over_90,
        count(*) as items
      from open_items group by ledger
    ),
    bank_balance as (
      -- One balance per bank nominal, so two bank records sharing a nominal
      -- cannot count the same postings twice.
      select round(coalesce(sum(posted.debit - posted.credit), 0), 2) as amount, count(distinct nominals.account_id) as accounts
      from (
        select distinct bank."FINBank_NominalAccountID" as account_id
        from public."FIN_BankAccounts" bank
        where bank."FINBank_LegalEntityID" = p_legal_entity_id
          and bank."FINBank_IsActive"
          and bank."FINBank_NominalAccountID" is not null
      ) nominals
      left join posted on posted.account_id = nominals.account_id
    ),
    ageing_json as (
      select ledger, jsonb_build_object(
        'total', total, 'items', items,
        'buckets', jsonb_build_array(
          jsonb_build_object('key', 'current', 'amount', current_amount),
          jsonb_build_object('key', '1-30', 'amount', days_1_30),
          jsonb_build_object('key', '31-60', 'amount', days_31_60),
          jsonb_build_object('key', '61-90', 'amount', days_61_90),
          jsonb_build_object('key', '90+', 'amount', days_over_90)
        )
      ) as value
      from ageing
    )
    select jsonb_build_object(
      'legalEntityId', p_legal_entity_id,
      'legalEntity', v_entity_name,
      'currency', v_currency,
      'countryCode', v_home,
      'fromDate', v_from,
      'toDate', v_to,
      'asOf', v_as_of,
      'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', to_char(month_start, 'YYYY-MM'),
        'revenue', revenue, 'directCost', direct_cost, 'overheads', overheads,
        'cashIn', cash_in, 'cashOut', cash_out
      ) order by month_start) from series), '[]'::jsonb),
      'overheadAccounts', coalesce((select jsonb_agg(jsonb_build_object('code', account_code, 'name', account_name, 'amount', amount) order by amount desc) from overhead_accounts), '[]'::jsonb),
      'customers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', party_id, 'name', name, 'revenue', revenue, 'invoices', invoices,
        'linkedRevenue', linked_revenue, 'linkedCost', linked_cost, 'jobs', jobs
      ) order by rank) from customers where rank <= 8), '[]'::jsonb),
      'customerCount', (select count(*) from customers),
      'otherCustomerRevenue', coalesce((select round(sum(revenue), 2) from customers where rank > 8), 0),
      'modes', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'revenue', revenue, 'cost', cost, 'jobs', jobs) order by revenue desc) from modes), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'revenue', revenue, 'cost', cost, 'jobs', jobs) order by revenue desc) from regions), '[]'::jsonb),
      'salesRevenue', coalesce((select round(sum(sign * net), 2) from documents where type_code in ('sl_invoice', 'credit_note')), 0),
      'jobLinkedRevenue', coalesce((select round(sum(revenue), 2) from jobs), 0),
      'receivables', coalesce((select value from ageing_json where ledger = 'receivable'), jsonb_build_object('total', 0, 'items', 0, 'buckets', '[]'::jsonb)),
      'payables', coalesce((select value from ageing_json where ledger = 'payable'), jsonb_build_object('total', 0, 'items', 0, 'buckets', '[]'::jsonb)),
      'cashAtBank', (select case when accounts = 0 then null else amount end from bank_balance),
      'coverage', jsonb_build_object(
        'postedBatches', (select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID" = p_legal_entity_id and "FINPostBatch_StatusCode" = 'posted'),
        'lastPostedAt', (select max("FINPostBatch_PostedAt") from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID" = p_legal_entity_id and "FINPostBatch_StatusCode" = 'posted')
      ),
      'generatedAt', now()
    )
  );
end;
$$;

revoke all on function public.multideck_finance_director_dashboard(uuid, uuid, uuid, date, date, date) from public, anon, authenticated;
grant execute on function public.multideck_finance_director_dashboard(uuid, uuid, uuid, date, date, date) to service_role;

comment on function public.multideck_finance_director_dashboard(uuid, uuid, uuid, date, date, date)
is 'Admin dashboard read model: 24 months of posted P&L and approved cash, plus customer, mode and region splits and ageing for one legal entity. Service role only; re-checks company, entity and Finance.Director.Dashboard.View.';

commit;
