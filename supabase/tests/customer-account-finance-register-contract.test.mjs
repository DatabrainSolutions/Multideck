import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const migrationName = "20260907080245_customer_account_finance_register.sql"
const migration = read(`../migrations/${migrationName}`)
const baseline = read("../baseline/public-schema.sql")
const functionBody = migration.match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? ""

function includesEvery(source, values) {
  for (const value of values) assert.ok(source.includes(value), `Expected source to include ${value}`)
}

test("customer finance snapshot is bounded and service-role only", () => {
  includesEvery(migration, [
    "multideck_finance_customer_account_snapshot",
    "p_company_id uuid",
    "p_account_ids uuid[]",
    "p_include_accounting_sync boolean default false",
    "cardinality(v_account_ids) > 100",
    "security invoker",
    "from public.multideck_crm_accessible_account_ids(p_company_id)",
    "join customer_accounts accessible",
    "revoke all on function public.multideck_finance_customer_account_snapshot(uuid, uuid[], boolean) from public, anon, authenticated",
    "grant execute on function public.multideck_finance_customer_account_snapshot(uuid, uuid[], boolean) to service_role",
  ])
})

test("historic receivables stay tenant scoped and unlike base currencies never mix", () => {
  includesEvery(migration, [
    "from public.\"cmp_LegalEntities\" entity",
    "where entity.\"Company_ID\" = p_company_id",
    "count(*) filter (where is_active)::integer as active_entity_count",
    "invalid_currency_count = 0",
    "distinct_currency_count = 1",
    "join tenant_entities entity",
    "entity.legal_entity_id = document.\"FINDoc_LegalEntityID\"",
    "'balanceDue', case when context.finance_ready then coalesce(balance.balance_due, 0) else null end",
    "'overdueAmount', case when context.finance_ready then coalesce(balance.overdue_amount, 0) else null end",
  ])
  assert.doesNotMatch(
    migration.match(/tenant_entities as materialized \(([\s\S]*?)\), currency_context/)?.[1] ?? "",
    /LegalEntity_IsActive\"\s*=\s*true/,
    "Inactive legal entities must remain in historic debt scope",
  )
  assert.doesNotMatch(migration, /baseCurrencyCode'\s*,\s*'GBP'/)
})

test("balances include approved invoices and credits while overdue is positive invoice debt only", () => {
  includesEvery(migration, [
    "sum(document.\"FINDoc_LocalOutstandingAmount\") as balance_due",
    "document.\"FINDoc_TypeCode\" in ('sl_invoice', 'credit_note')",
    "document.\"FINDoc_PartyRole\" = 'customer'",
    "document.\"FINDoc_StatusCode\" in ('approved', 'submitted')",
    "document.\"FINDoc_TypeCode\" = 'sl_invoice'",
    "document.\"FINDoc_OutstandingAmount\" > 0",
    "document.\"FINDoc_DueDate\" < current_date",
    "oldest_overdue_date",
    "open_invoice_count",
    "overdue_invoice_count",
  ])
})

test("credit control and payment terms come from the company-scoped account profile", () => {
  includesEvery(migration, [
    "public.\"CRM_AccountOperationalProfiles\"",
    "profile.\"CRMAccountOps_CompanyID\" = p_company_id",
    "'creditLimit'",
    "'creditCurrencyCode'",
    "'availableCredit'",
    "preferences.credit_currency_code = context.base_currency_code",
    "'paymentTermsCode'",
    "'paymentTermDays'",
    "'paymentTermDueDay'",
    "'paymentTermEndOfMonth'",
    "'accountStatus'",
    "'creditHold'",
    "customerAccountingStatusCode",
  ])
  assert.doesNotMatch(migration, /coalesce\([^\n]*primaryCurrency[^\n]*base_currency/i)
})

test("accounting sync is opt-in and preserves multi-connection partial and failure states", () => {
  includesEvery(migration, [
    "where p_include_accounting_sync",
    "and entity.is_active",
    "connection.\"ACCIC_StatusCode\" = 'active'",
    "event.\"ACCISE_EventCode\" in ('party_account_synced', 'party_account_sync_failed')",
    "event.event_code = 'party_account_sync_failed' or event.severity in ('error', 'critical')",
    "event.created_at >= coalesce(mapping.mapping_effective_at, '-infinity'::timestamptz)",
    "when coalesce(totals.has_later_failure, false) then 'failed'",
    "when coalesce(totals.mapped_connection_count, 0) = connections.value then 'synced'",
    "when coalesce(totals.mapped_connection_count, 0) > 0 then 'partial'",
    "else 'not_synced'",
    "when connections.value = 0 then 'not_connected'",
    "when p_include_accounting_sync then jsonb_build_object(",
    "'accountingSyncStatus'",
    "'accountingLastSyncedAt'",
    "'accountingAttentionCount', case",
  ])
  assert.match(migration, /'accountingAttentionCount', case\s+when p_include_accounting_sync[\s\S]*?else null/)
})

test("rows are page-bounded while the summary covers the full accessible customer register", () => {
  const rows = migration.match(/row_payloads as materialized \(([\s\S]*?)\), summary_payload/)?.[1] ?? ""
  const summary = migration.match(/summary_payload as materialized \(([\s\S]*?)\)\s+select jsonb_build_object/)?.[1] ?? ""
  assert.match(rows, /from requested_accounts requested/)
  assert.match(summary, /from customer_accounts account/)
  includesEvery(summary, [
    "'balanceDue'",
    "'overdueAmount'",
    "'openInvoiceCount'",
    "'overdueInvoiceCount'",
    "'overdueCustomerCount'",
    "'creditAttentionCount'",
    "'onHoldCount'",
    "'accountingAttentionCount'",
  ])
})

test("the projection is read only and relies on existing lifecycle signals", () => {
  assert.doesNotMatch(functionBody, /\b(insert|update|delete|merge)\b/i)
  includesEvery(migration, [
    "read-only customer account projection",
    "It emits no state or watch event",
    "existing FIN_Documents, customer invoice-preference and provider party-sync event adapters remain the lifecycle signals",
  ])
})

test("tenant provisioning baseline contains the exact customer finance migration", () => {
  const start = `-- BEGIN MIGRATION ${migrationName}\n`
  const end = `-- END MIGRATION ${migrationName}`
  const startAt = baseline.indexOf(start)
  const endAt = baseline.indexOf(end, startAt)
  assert.notEqual(startAt, -1)
  assert.notEqual(endAt, -1)
  assert.equal(baseline.slice(startAt + start.length, endAt).trim(), migration.trim())
})
