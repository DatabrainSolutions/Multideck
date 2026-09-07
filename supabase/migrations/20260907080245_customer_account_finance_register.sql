-- Read-only customer-account finance projection for the accounts register.
-- The Edge Function remains responsible for Customers.Read, receivables and
-- integration permission checks; this internal RPC is callable only by the
-- service role and independently constrains every record to the tenant company.

begin;

create or replace function public.multideck_finance_customer_account_snapshot(
  p_company_id uuid,
  p_account_ids uuid[],
  p_include_accounting_sync boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_account_ids uuid[] := coalesce(p_account_ids, '{}'::uuid[]);
  v_result jsonb;
begin
  if p_company_id is null then
    raise exception 'Choose a tenant company before loading customer accounts.' using errcode = '22023';
  end if;

  if cardinality(v_account_ids) > 100 then
    raise exception 'Customer account finance snapshots are limited to 100 requested accounts.' using errcode = '22023';
  end if;

  with tenant_entities as materialized (
    -- Inactive legal entities remain in scope because historic debt does not
    -- stop being due when the issuer is retired. Only active entities are used
    -- below to discover the current accounting-system connections.
    select
      entity."LegalEntity_ID" as legal_entity_id,
      entity."LegalEntity_IsActive" as is_active,
      case
        when upper(nullif(btrim(entity."LegalEntity_BaseCurrencyCodeSnapshot"), '')) ~ '^[A-Z]{3}$'
          then upper(btrim(entity."LegalEntity_BaseCurrencyCodeSnapshot"))
        else null
      end as base_currency_code
    from public."cmp_LegalEntities" entity
    where entity."Company_ID" = p_company_id
  ), currency_context as (
    select
      count(*)::integer as entity_count,
      count(*) filter (where is_active)::integer as active_entity_count,
      count(*) filter (where base_currency_code is null)::integer as invalid_currency_count,
      count(distinct base_currency_code)::integer as distinct_currency_count,
      min(base_currency_code) as candidate_currency_code
    from tenant_entities
  ), finance_context as materialized (
    select
      (
        entity_count > 0
        and active_entity_count = 1
        and invalid_currency_count = 0
        and distinct_currency_count = 1
      ) as finance_ready,
      case
        when entity_count > 0
          and active_entity_count = 1
          and invalid_currency_count = 0
          and distinct_currency_count = 1
          then candidate_currency_code
        else null
      end as base_currency_code
    from currency_context
  ), customer_accounts as materialized (
    -- Match the current customer register eligibility while retaining the
    -- shared accessible-account boundary for the supplied company.
    select distinct accessible.account_id
    from public.multideck_crm_accessible_account_ids(p_company_id) accessible
    join public."Org_Master" organisation
      on organisation."Org_id" = accessible.account_id
    where coalesce(organisation."Org_CRMIsPotentialCustomer", false)
       or exists (
         select 1
         from public."Org_Master_Type" link
         join public."Org_Types" organisation_type
           on organisation_type."OrgType_ID" = link."OrgType_ID"
         where link."Org_ID" = organisation."Org_id"
           and lower(organisation_type."OrgType_Name") = 'customer'
       )
  ), requested_accounts as materialized (
    select distinct requested.account_id
    from unnest(v_account_ids) requested(account_id)
    join customer_accounts accessible
      on accessible.account_id = requested.account_id
    where requested.account_id is not null
  ), account_preferences as materialized (
    select
      account.account_id,
      case
        when nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'creditLimit'), '')
          ~ '^[0-9]+([.][0-9]{1,4})?$'
          then (profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'creditLimit')::numeric
        else null
      end as credit_limit,
      case
        when upper(nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'primaryCurrency'), ''))
          ~ '^[A-Z]{3}$'
          then upper(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'primaryCurrency'))
        else null
      end as credit_currency_code,
      nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'salesPaymentTermCode'), '') as payment_terms_code,
      case
        when nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'receivableTermDays'), '')
          ~ '^[0-9]+([.][0-9]{1,4})?$'
          then (profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'receivableTermDays')::numeric
        else null
      end as payment_term_days,
      case
        when nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'receivableDueDay'), '')
          ~ '^[0-9]+([.][0-9]{1,4})?$'
          then (profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'receivableDueDay')::numeric
        else null
      end as payment_term_due_day,
      lower(coalesce(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'receivableEndOfMonth', 'false')) = 'true'
        as payment_term_end_of_month,
      lower(coalesce(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'creditHold', 'false')) = 'true'
        as credit_hold,
      case
        when nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'customerAccountingStatusCode'), '') = 'blocked'
          then 'blocked'
        when nullif(btrim(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'customerAccountingStatusCode'), '') = 'on_hold'
          or lower(coalesce(profile."CRMAccountOps_InvoicePreferencesJSON" ->> 'creditHold', 'false')) = 'true'
          then 'on_hold'
        else 'active'
      end as account_status
    from customer_accounts account
    left join public."CRM_AccountOperationalProfiles" profile
      on profile."CRMAccountOps_OrgID" = account.account_id
     and profile."CRMAccountOps_CompanyID" = p_company_id
  ), document_balances as materialized (
    select
      document."FINDoc_PartyOrgID" as account_id,
      sum(document."FINDoc_LocalOutstandingAmount") as balance_due,
      coalesce(sum(document."FINDoc_LocalOutstandingAmount") filter (
        where document."FINDoc_TypeCode" = 'sl_invoice'
          and document."FINDoc_OutstandingAmount" > 0
          and document."FINDoc_DueDate" < current_date
      ), 0) as overdue_amount,
      count(*) filter (
        where document."FINDoc_TypeCode" = 'sl_invoice'
          and document."FINDoc_OutstandingAmount" > 0
      )::integer as open_invoice_count,
      count(*) filter (
        where document."FINDoc_TypeCode" = 'sl_invoice'
          and document."FINDoc_OutstandingAmount" > 0
          and document."FINDoc_DueDate" < current_date
      )::integer as overdue_invoice_count,
      min(document."FINDoc_DueDate") filter (
        where document."FINDoc_TypeCode" = 'sl_invoice'
          and document."FINDoc_OutstandingAmount" > 0
          and document."FINDoc_DueDate" < current_date
      ) as oldest_overdue_date
    from public."FIN_Documents" document
    join tenant_entities entity
      on entity.legal_entity_id = document."FINDoc_LegalEntityID"
    join customer_accounts account
      on account.account_id = document."FINDoc_PartyOrgID"
    where document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note')
      and document."FINDoc_PartyRole" = 'customer'
      and document."FINDoc_StatusCode" in ('approved', 'submitted')
    group by document."FINDoc_PartyOrgID"
  ), active_connections as materialized (
    select connection."ACCIC_ID" as connection_id
    from public."ACCI_Connections" connection
    join tenant_entities entity
      on entity.legal_entity_id = connection."ACCIC_LegalEntityID"
     and entity.is_active
    where p_include_accounting_sync
      and connection."ACCIC_StatusCode" = 'active'
  ), connection_count as materialized (
    select count(*)::integer as value from active_connections
  ), active_party_mappings as materialized (
    select
      mapping."ACCIPM_ConnectionID" as connection_id,
      mapping."ACCIPM_OrgID" as account_id,
      max(coalesce(mapping."ACCIPM_LastSyncedAt", mapping."ACCIPM_CreatedAt")) as mapping_effective_at,
      max(mapping."ACCIPM_LastSyncedAt") as last_synced_at
    from public."ACCI_PartyMappings" mapping
    join active_connections connection
      on connection.connection_id = mapping."ACCIPM_ConnectionID"
    join customer_accounts account
      on account.account_id = mapping."ACCIPM_OrgID"
    where p_include_accounting_sync
      and mapping."ACCIPM_PartyType" in ('customer', 'both')
      and mapping."ACCIPM_IsActive"
    group by mapping."ACCIPM_ConnectionID", mapping."ACCIPM_OrgID"
  ), latest_party_events as materialized (
    select distinct on (event."ACCISE_ConnectionID", event."ACCISE_LocalID")
      event."ACCISE_ConnectionID" as connection_id,
      event."ACCISE_LocalID" as account_id,
      event."ACCISE_EventCode" as event_code,
      event."ACCISE_Severity" as severity,
      event."ACCISE_CreatedAt" as created_at
    from public."ACCI_SyncEvents" event
    join active_connections connection
      on connection.connection_id = event."ACCISE_ConnectionID"
    join customer_accounts account
      on account.account_id = event."ACCISE_LocalID"
    where p_include_accounting_sync
      and event."ACCISE_LocalTable" = 'Org_Master'
      and event."ACCISE_EventCode" in ('party_account_synced', 'party_account_sync_failed')
    order by event."ACCISE_ConnectionID", event."ACCISE_LocalID", event."ACCISE_CreatedAt" desc, event."ACCISE_ID" desc
  ), connection_account_state as materialized (
    select
      account.account_id,
      connection.connection_id,
      mapping.connection_id is not null as is_mapped,
      mapping.last_synced_at,
      (event.event_code = 'party_account_sync_failed' or event.severity in ('error', 'critical'))
        and event.created_at >= coalesce(mapping.mapping_effective_at, '-infinity'::timestamptz)
        as has_later_failure
    from customer_accounts account
    cross join active_connections connection
    left join active_party_mappings mapping
      on mapping.connection_id = connection.connection_id
     and mapping.account_id = account.account_id
    left join latest_party_events event
      on event.connection_id = connection.connection_id
     and event.account_id = account.account_id
  ), account_connection_totals as materialized (
    select
      state.account_id,
      count(*) filter (where state.is_mapped)::integer as mapped_connection_count,
      coalesce(bool_or(state.has_later_failure), false) as has_later_failure,
      max(state.last_synced_at) as last_synced_at
    from connection_account_state state
    group by state.account_id
  ), account_sync_state as materialized (
    select
      account.account_id,
      case
        when connections.value = 0 then 'not_connected'
        when coalesce(totals.has_later_failure, false) then 'failed'
        when coalesce(totals.mapped_connection_count, 0) = connections.value then 'synced'
        when coalesce(totals.mapped_connection_count, 0) > 0 then 'partial'
        else 'not_synced'
      end as sync_status,
      totals.last_synced_at
    from customer_accounts account
    cross join connection_count connections
    left join account_connection_totals totals
      on totals.account_id = account.account_id
  ), row_payloads as materialized (
    select
      requested.account_id,
      jsonb_build_object(
        'organisationId', requested.account_id,
        'financeReady', context.finance_ready,
        'baseCurrencyCode', context.base_currency_code,
        'balanceDue', case when context.finance_ready then coalesce(balance.balance_due, 0) else null end,
        'overdueAmount', case when context.finance_ready then coalesce(balance.overdue_amount, 0) else null end,
        'openInvoiceCount', coalesce(balance.open_invoice_count, 0),
        'overdueInvoiceCount', coalesce(balance.overdue_invoice_count, 0),
        'oldestOverdueDate', balance.oldest_overdue_date,
        'creditLimit', preferences.credit_limit,
        'creditCurrencyCode', preferences.credit_currency_code,
        'availableCredit', case
          when context.finance_ready
            and preferences.credit_limit is not null
            and preferences.credit_currency_code = context.base_currency_code
            then preferences.credit_limit - greatest(coalesce(balance.balance_due, 0), 0)
          else null
        end,
        'paymentTermsCode', preferences.payment_terms_code,
        'paymentTermDays', preferences.payment_term_days,
        'paymentTermDueDay', preferences.payment_term_due_day,
        'paymentTermEndOfMonth', preferences.payment_term_end_of_month,
        'accountStatus', preferences.account_status,
        'creditHold', preferences.credit_hold
      ) || case
        when p_include_accounting_sync then jsonb_build_object(
          'accountingSyncStatus', sync.sync_status,
          'accountingLastSyncedAt', sync.last_synced_at
        )
        else '{}'::jsonb
      end as value
    from requested_accounts requested
    cross join finance_context context
    join account_preferences preferences
      on preferences.account_id = requested.account_id
    left join document_balances balance
      on balance.account_id = requested.account_id
    left join account_sync_state sync
      on sync.account_id = requested.account_id
  ), summary_payload as materialized (
    select jsonb_build_object(
      'balanceDue', case when context.finance_ready then coalesce(sum(balance.balance_due), 0) else null end,
      'overdueAmount', case when context.finance_ready then coalesce(sum(balance.overdue_amount), 0) else null end,
      'openInvoiceCount', coalesce(sum(balance.open_invoice_count), 0)::integer,
      'overdueInvoiceCount', coalesce(sum(balance.overdue_invoice_count), 0)::integer,
      'overdueCustomerCount', count(*) filter (where coalesce(balance.overdue_invoice_count, 0) > 0)::integer,
      'creditAttentionCount', count(*) filter (
        where context.finance_ready
          and preferences.credit_limit is not null
          and preferences.credit_currency_code = context.base_currency_code
          and greatest(coalesce(balance.balance_due, 0), 0) > preferences.credit_limit
      )::integer,
      'onHoldCount', count(*) filter (where preferences.account_status in ('on_hold', 'blocked'))::integer,
      'accountingAttentionCount', case
        when p_include_accounting_sync
          then count(*) filter (where sync.sync_status <> 'synced')::integer
        else null
      end
    ) as value
    from customer_accounts account
    cross join finance_context context
    join account_preferences preferences
      on preferences.account_id = account.account_id
    left join document_balances balance
      on balance.account_id = account.account_id
    left join account_sync_state sync
      on sync.account_id = account.account_id
    group by context.finance_ready, context.base_currency_code
  )
  select jsonb_build_object(
    'financeReady', context.finance_ready,
    'baseCurrencyCode', context.base_currency_code,
    'rows', coalesce((select jsonb_agg(row_payloads.value order by row_payloads.account_id) from row_payloads), '[]'::jsonb),
    'summary', coalesce((select summary_payload.value from summary_payload), jsonb_build_object(
      'balanceDue', case when context.finance_ready then 0 else null end,
      'overdueAmount', case when context.finance_ready then 0 else null end,
      'openInvoiceCount', 0,
      'overdueInvoiceCount', 0,
      'overdueCustomerCount', 0,
      'creditAttentionCount', 0,
      'onHoldCount', 0,
      'accountingAttentionCount', case when p_include_accounting_sync then 0 else null end
    ))
  ) into v_result
  from finance_context context;

  return v_result;
end;
$$;

revoke all on function public.multideck_finance_customer_account_snapshot(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.multideck_finance_customer_account_snapshot(uuid, uuid[], boolean) to service_role;

comment on function public.multideck_finance_customer_account_snapshot(uuid, uuid[], boolean) is
  'Service-role-only, read-only customer account projection. It emits no state or watch event; existing FIN_Documents, customer invoice-preference and provider party-sync event adapters remain the lifecycle signals.';

commit;
