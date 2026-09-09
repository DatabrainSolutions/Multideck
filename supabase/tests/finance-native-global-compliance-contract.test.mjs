import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const migration = read("../migrations/20260831072515_provider_optional_global_finance.sql")
const baseline = read("../baseline/public-schema.sql")
const edge = read("../functions/finance-subledger/index.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const providers = read("../functions/_shared/accounting-providers.ts")
const api = read("../../multideck.client/src/lib/finance-subledger-api.ts")
const registerPage = read("../../multideck.client/src/pages/finance-page.tsx")
const documentPage = read("../../multideck.client/src/pages/finance-document-page.tsx")
const setupPage = read("../../multideck.client/src/pages/finance-setup-page.tsx")
const reportsPage = read("../../multideck.client/src/pages/finance-reports-page.tsx")
const router = read("../../multideck.client/src/App.tsx")
const navigation = read("../../multideck.client/src/data/navigation-data.ts")
const breadcrumbs = read("../../multideck.client/src/components/multideck/app-breadcrumbs.tsx")
const providerArchitecture = read("../../docs/architecture/finance-provider-adapters.md")
const complianceArchitecture = read("../../docs/architecture/global-finance-compliance.md")

const includesEvery = (source, values) => values.forEach((value) => {
  assert.ok(source.includes(value), `Expected source to include ${value}`)
})

test("new-tenant provisioning contains the exact native global finance migration", () => {
  const name = "20260831072515_provider_optional_global_finance.sql"
  const startMarker = `-- BEGIN MIGRATION ${name}\n`
  const endMarker = `\n-- END MIGRATION ${name}`
  const start = baseline.indexOf(startMarker)
  const end = baseline.indexOf(endMarker, start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.equal(baseline.slice(start + startMarker.length, end).trim(), migration.trim())
})

test("Multideck owns the native ledger while an external mirror remains permanently configurable", () => {
  includesEvery(migration, [
    "FINSET_NativeLedgerEnabled",
    "FINSET_ExternalMirrorModeCode",
    "('disabled','optional','required')",
    "FINDoc_NativePostingStatusCode",
    "FINDoc_NativePostingBatchID",
    "FINCash_NativePostingStatusCode",
    "FINCash_ExportStatusCode",
    "pending_migration",
    "_multideck_finance_mirror_state",
    "_multideck_finance_guard_optional_mirror_queue",
    "v_mode='disabled' or (v_mode='optional' and not v_active)",
    "v_mode='required' and not v_active",
  ])
  includesEvery(providerArchitecture, [
    "external mirror",
    "disabled",
    "optional",
    "required",
    "not the source of truth",
    "Provider-neutral contract",
  ])
  includesEvery(providers, [
    "purpose: \"external_mirror\"",
    "journals",
    "ledger_readback",
    "trial_balance",
  ])
})

test("approval posts balanced native document and cash journals before optional mirror delivery", () => {
  includesEvery(migration, [
    "_multideck_finance_post_document_native",
    "_multideck_finance_post_cash_native",
    "TR_FIN_Documents_native_posting",
    "TR_FIN_CashTransactions_native_posting",
    "Native document journal is not balanced",
    "FINPostBatch_DebitTotal",
    "FINPostBatch_CreditTotal",
    "post_native_ledger",
    "not_required' else 'queued",
    "TR_FIN_Documents_native_immutable",
    "TR_FIN_DocumentLines_native_immutable",
    "TR_FIN_CashTransactions_native_immutable",
  ])
  assert.match(migration, /if v_debits<=0 or v_debits is distinct from v_credits then/)
  assert.match(migration, /FINDoc_NativePostingStatusCode"='posted'/)
  assert.match(migration, /FINCash_NativePostingStatusCode"='posted'/)
  assert.doesNotMatch(edge, /FINDoc_PostingStatusCode: status/)
  assert.doesNotMatch(edge, /FINCash_PostingStatusCode: status/)
  includesEvery(edge, [
    "FINDoc_ExportStatusCode: status",
    "FINCash_ExportStatusCode: status",
    "external mirror delivery can be retried",
  ])
})

test("native P&L, balance sheet and trial balance use posted journal evidence", () => {
  includesEvery(migration, [
    "multideck_finance_reporting_snapshot",
    "FINNom_ReportCategoryCode",
    "FINPostBatch_StatusCode\"='posted'",
    "period_credit-period_debit",
    "current_earnings",
    "balanceDifference",
    "pendingDocumentMigrations",
    "pendingCashMigrations",
    "Finance.Reporting.View",
  ])
  assert.match(migration, /assets-liabilities-equity-current_earnings/)
  assert.match(migration, /revoke all on function public\.multideck_finance_reporting_snapshot[^]*from public,anon,authenticated;/)
  assert.match(migration, /grant execute on function public\.multideck_finance_reporting_snapshot[^]*to service_role;/)
  includesEvery(edge, [
    "parts[0] === \"report-options\"",
    "parts[0] === \"reports\"",
    "Finance.Reporting.View",
    "multideck_finance_reporting_snapshot",
  ])
  includesEvery(api, ["getFinanceReportOptions", "getFinanceReports", "FinanceReportingSnapshot"])
  includesEvery(reportsPage, ["Profit & loss", "Balance sheet", "Trial balance", "balanceDifference", "pendingDocumentMigrations"])
})

test("UK, US, Canada and Australia compliance foundations are explicit and exclude payroll", () => {
  includesEvery(migration, [
    "gb-v1",
    "us-v1",
    "ca-v1",
    "au-v1",
    "FIN_ComplianceObligations",
    "FIN_LegalEntityComplianceRegistrations",
    "foundation",
    "calculation_ready",
    "sandbox_ready",
    "production_ready",
    "gb-vat-mtd",
    "us-federal-corporate-income-tax",
    "ca-gst-hst",
    "au-gst-bas",
    "payrollExcluded",
  ])
  assert.doesNotMatch(migration, /FINCompliance_ObligationTypeCode[^\n]+payroll/)
  assert.match(migration, /revoke all on public\."FIN_ComplianceObligations",public\."FIN_LegalEntityComplianceRegistrations" from public,anon,authenticated;/)
  includesEvery(complianceArchitecture, [
    "Payroll is deliberately excluded",
    "foundation",
    "production_ready",
    "HMRC",
    "IRS corporate e-file",
    "CRA GST/HST filing",
    "ATO software developer onboarding",
  ])
  includesEvery(setupPage, [
    "Compliance pack",
    "Compliance obligations",
    "Payroll is outside this finance scope",
    "Compliance foundation, not filing certification",
  ])
})

test("Dexter and Watching receive tenant-safe finance reporting and compliance evidence", () => {
  includesEvery(migration, [
    "native_financial_summary",
    "compliance_obligation",
    "sourceTable','FIN_PostingLines",
    "sourceTable','FIN_ComplianceObligations",
    "TR_FIN_LegalEntityCompliance_dexter_watch",
    "AI_DexterWatchSignals",
    "nativePostingStatus",
    "externalMirrorStatus",
    "complianceStatus",
    "Payroll is excluded",
  ])
  assert.match(migration, /AIDexterWatch_StatusCode"='active'/)
  assert.match(migration, /return new;[\s\S]*TR_FIN_LegalEntityCompliance_dexter_watch/)
  includesEvery(dexter, [
    "Multideck is the authoritative accounting ledger and reporting source",
    "nativePostingStatus separate from externalMirrorStatus",
    "External accounting packages are optional mirrors",
    "Compliance-obligation evidence is a jurisdiction foundation",
    "never claim payroll support",
  ])
})

test("operator routes show native ledger and mirror states independently", () => {
  includesEvery(router, ["/finance/reports", "/finance/compliance"])
  includesEvery(navigation, ["Financial reports", "Compliance obligations"])
  includesEvery(breadcrumbs, ["/finance/reports", "/finance/compliance"])
  includesEvery(registerPage, [
    "FINDoc_NativePostingStatusCode",
    "FINDoc_ExportStatusCode",
    "FINCash_NativePostingStatusCode",
    "FINCash_ExportStatusCode",
    "Mirror attention",
    "Finance document posted; external mirror checked",
  ])
  includesEvery(documentPage, [
    "Ledger ${document.FINDoc_NativePostingStatusCode",
    "Mirror ${document.FINDoc_ExportStatusCode",
    "No external mirror",
    "External mirror needs attention",
    "posted to the Multideck ledger",
  ])
  includesEvery(setupPage, [
    "Multideck remains the source of truth",
    "External accounting systems are optional mirrors",
    "Native Multideck ledger",
    "External mirror policy",
    "approved_manual",
  ])
  assert.doesNotMatch(setupPage, /ERPNext remains the default rate source/)
})

test("providerless setup does not require integration permission unless mirror mappings change", () => {
  includesEvery(edge, [
    "changesProviderMappings",
    "Finance.Integration.Manage",
    "Finance.Configuration.Manage",
  ])
  assert.match(edge, /if \(changesProviderMappings\) await requirePermission/)
  includesEvery(complianceArchitecture, [
    "operate without a third-party accounting provider",
    "external accounting package is a permanent",
    "Reporting and mirror equality",
  ])
})
