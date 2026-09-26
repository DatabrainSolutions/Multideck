import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const migration = read("../migrations/20260831072515_provider_optional_global_finance.sql")
const baseline = read("../baseline/public-schema.sql")
const baselineReference = read("../baseline/system-reference-data.sql")
const edge = read("../functions/finance-subledger/index.ts")
const exportAttempt = read("../functions/_shared/finance-export-attempt.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const providers = read("../functions/_shared/accounting-providers.ts")
const api = read("../../multideck.client/src/lib/finance-subledger-api.ts")
const registerPage = read("../../multideck.client/src/pages/finance-page.tsx")
const documentPage = read("../../multideck.client/src/pages/finance-document-page.tsx")
const vatPage = read("../../multideck.client/src/pages/finance-vat-page.tsx")
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

test("VAT declaration is a direct human action scoped to the tenant and legal entity", () => {
  const approvalRoute = edge.slice(edge.indexOf('parts[4] === "filing-approval"'), edge.indexOf('parts[2] === "filing-approvals"'))
  includesEvery(approvalRoute, [
    'requirePermission(admin, current.User_ID, "Finance.Compliance.Manage")',
    'legalEntity(admin, current, parts[1])',
    'input.confirmed !== true',
    'p_actor: current.User_ID',
    'p_project_ref: vatTenantProjectRef()',
    'p_declaration_code: "hmrc-vat-business-v1"',
  ])
  assert.doesNotMatch(approvalRoute, /p_project_ref:\s*input\./)
  const revocationRoute = edge.slice(edge.indexOf('parts[2] === "filing-approvals"'), edge.indexOf('parts[4] === "review-locks" && request.method === "POST"'))
  includesEvery(revocationRoute, [
    'requirePermission(admin, current.User_ID, "Finance.Compliance.Manage")',
    'legalEntity(admin, current, parts[1])',
    'multideck_uk_vat_revoke_filing_approval',
    'p_actor: current.User_ID',
  ])
  includesEvery(vatPage, [
    "When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in prosecution.",
    "lockedFilingValues.filed_boxes",
    "filingStatus.obligation?.freshForApproval",
    "declarationConfirmed",
    "No return has been sent to HMRC.",
  ])
})

test("UK VAT registration setup requires compliance authority and an invoice-basis confirmation", () => {
  const route = edge.slice(edge.indexOf('parts[2] === "registration" && request.method === "POST"'),
    edge.indexOf('parts[2] === "coverage" && request.method === "GET"'))
  includesEvery(route, [
    'requirePermission(admin, current.User_ID, "Finance.Compliance.Manage")',
    'legalEntity(admin, current, parts[1])',
    'input.invoiceBasisConfirmed !== true',
    'multideck_uk_vat_configure_registration',
    'p_actor: current.User_ID',
    'p_invoice_basis_confirmed: true',
  ])
  assert.doesNotMatch(route, /p_(?:status|obligation|project_ref):\s*input\./)
  includesEvery(vatPage, ["UK VAT registration", "Standard accounting is the default.", "Cash accounting — in development"])
  assert.match(route, /scheme !== "standard"/)
  const revisionRoute = edge.slice(edge.indexOf('parts[3] === "revisions" && request.method === "POST"'),
    edge.indexOf('parts[2] === "coverage" && request.method === "GET"'))
  includesEvery(revisionRoute, [
    'requirePermission(admin, current.User_ID, "Finance.Compliance.Manage")',
    'legalEntity(admin, current, parts[1])',
    'input.invoiceBasisConfirmed !== true',
    'multideck_uk_vat_schedule_registration',
    'p_actor: current.User_ID',
    'p_reason: reason',
  ])
  includesEvery(vatPage, ["Schedule VAT registration change", "New registration terms cannot overlap a prepared VAT period."])
})

test("prior-period VAT error intake and conduct review are entity-scoped and cannot themselves change a return", () => {
  const route = edge.slice(edge.indexOf('parts[4] === "prior-errors" && request.method === "GET"'),
    edge.indexOf('parts[4] === "calculate" && request.method === "POST"'))
  includesEvery(route, [
    'requirePermission(admin, current.User_ID, "Finance.Compliance.View")',
    'requirePermission(admin, current.User_ID, "Finance.Compliance.Manage")',
    'legalEntity(admin, current, parts[1])',
    'multideck_uk_vat_prior_period_error_intake',
    'multideck_uk_vat_prior_error_status',
    'multideck_uk_vat_record_prior_period_error',
    'multideck_uk_vat_review_prior_error_conduct',
    'multideck_uk_vat_external_error_notifications',
    'multideck_uk_vat_record_external_error_notification',
    'p_actor: current.User_ID',
  ])
  includesEvery(vatPage, [
    "Prior-period VAT errors", "Record error for assessment", "Conduct review reason",
    "Record external notification evidence",
    "These records do not change this return or notify HMRC.",
    "This is a method preview only. No return has been adjusted and no notification has been sent.",
  ])
})

test("Cash Accounting payment dates and event projections stay scoped and do not enable a return", () => {
  const route = edge.slice(edge.indexOf('parts[2] === "cash-payment-dates"'),
    edge.indexOf('parts[4] === "calculate" && request.method === "POST"'))
  includesEvery(route, [
    'requirePermission(admin, current.User_ID, "Finance.Compliance.View")',
    'requirePermission(admin, current.User_ID, "Finance.Compliance.Manage")',
    'legalEntity(admin, current, parts[1])',
    'multideck_uk_vat_cash_payment_date_queue',
    'multideck_uk_vat_review_cash_payment_date',
    'multideck_uk_vat_cash_source_snapshot',
    'previewUkVatCashSources(data)',
    'multideck_uk_vat_record_cash_event_projection',
    'multideck_uk_vat_cash_event_projection_history',
    'multideck_uk_vat_cash_nine_box_preview',
    'p_actor: current.User_ID',
  ])
  includesEvery(vatPage, ["Cash Accounting payment dates", "Review payment date", "Payment date review history", "they do not affect a VAT return yet.", "Cash Accounting source preview", "it cannot create or approve a return.", "Record cash payment events", "Recorded cash event projections", "View nine-box preview", "This preview cannot approve or submit a Cash Accounting return."])
  includesEvery(dexter, ["Cash Accounting payment-date reviews, the source and nine-box previews, recorded cash event projections, and native credit applications are manual Finance controls.", "Cash Accounting return calculation is still unavailable."])
})

test("new-tenant snapshot contains the native finance schema and jurisdiction reference catalogue", () => {
  includesEvery(baseline, [
    'CREATE TABLE IF NOT EXISTS "public"."FIN_LocalisationPacks"',
    'CREATE TABLE IF NOT EXISTS "public"."FIN_ComplianceObligations"',
    'CREATE TABLE IF NOT EXISTS "public"."FIN_LegalEntityComplianceRegistrations"',
    '"FINCompliance_ReadinessStatusCode"',
  ])
  includesEvery(baselineReference, [
    'INSERT INTO public."FIN_LocalisationPacks"',
    'INSERT INTO public."FIN_ComplianceObligations"',
    "'gb-v1'", "'us-v1'", "'ca-v1'", "'au-v1'",
    "'gb-vat-mtd'", "'ca-gst-hst'", "'au-gst-bas'",
    "'foundation'",
  ])
  assert.doesNotMatch(baselineReference, /'gb-vat-mtd'[^\n]*'production_ready'/)
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
  includesEvery(edge, ["deliverFinanceExport", "external mirror delivery can be retried"])
  includesEvery(exportAttempt, ["multideck_finance_begin_export", "multideck_finance_finish_export", "provider_delivery_mismatch", "status: \"synced\""])
  includesEvery(migration, ['"FINDoc_ExportStatusCode"=case', '"FINCash_ExportStatusCode"=case'])
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
    "Multideck is the source of truth. External accounting is a reconciled copy.",
    "External accounting mirror",
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
