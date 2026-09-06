import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const foundation = read("../migrations/20260826213508_finance_subledger_foundation.sql")
const lifecycle = read("../migrations/20260829143000_finance_ledger_lifecycle.sql")
const administration = read("../migrations/20260829165937_comprehensive_finance_administration.sql")
const partyFinance = read("../migrations/20260829173939_comprehensive_crm_financial_profiles.sql")
const approvedTaxControls = read("../migrations/20260829181500_approved_finance_tax_controls.sql")
const incompleteDraftControls = read("../migrations/20260829191512_allow_incomplete_finance_drafts.sql")
const numberSequenceFix = read("../migrations/20260829191646_fix_finance_number_sequence_conflict.sql")
const financeAuditTypes = read("../migrations/20260829191749_register_finance_audit_record_types.sql")
const reportingBoundary = read("../migrations/20260829194132_harden_finance_reporting_boundary.sql")
const demoTaxControls = read("../migrations/20260829200354_guard_demo_finance_tax_posting.sql")
const demoReadinessControls = read("../migrations/20260829202112_normalise_demo_finance_readiness.sql")
const documentRecovery = read("../migrations/20260830111301_finance_document_recovery.sql")
const tenantOwnedFinanceDocuments = read("../migrations/20260901103000_tenant_owned_finance_documents.sql")
const providerPartyBulkSync = read("../migrations/20260902113000_provider_party_bulk_sync.sql")
const functionSource = read("../functions/finance-subledger/index.ts")
const customerFunctionSource = read("../functions/customers/index.ts")
const providerSource = read("../functions/_shared/accounting-providers.ts")
const hyperExtSource = read("../functions/_shared/hyperext.ts")
const webhookSource = read("../functions/erpnext-webhook/index.ts")
const dexterSource = read("../functions/agent-dexter/index.ts")
const appSource = read("../../multideck.client/src/pages/finance-page.tsx")
const documentPageSource = read("../../multideck.client/src/pages/finance-document-page.tsx")
const purchaseIntakeSource = read("../../multideck.client/src/pages/finance-purchase-intake-page.tsx")
const financeSetupSource = read("../../multideck.client/src/pages/finance-setup-page.tsx")
const financeLineEditorSource = read("../../multideck.client/src/components/multideck/finance-document-line-editor.tsx")
const providerCustomerWizardSource = read("../../multideck.client/src/components/multideck/provider-customer-setup-wizard.tsx")
const financeExcelSource = read("../../multideck.client/src/lib/finance-document-excel.ts")
const financeProformaSource = read("../../multideck.client/src/lib/finance-proforma.ts")
const accountOperationsSource = read("../../multideck.client/src/components/multideck/account-operations-workspace.tsx")
const crmAccountsSource = read("../../multideck.client/src/pages/crm-accounts-page.tsx")
const apiSource = read("../../multideck.client/src/lib/finance-subledger-api.ts")
const appRouterSource = read("../../multideck.client/src/App.tsx")
const navigationSource = read("../../multideck.client/src/data/navigation-data.ts")
const topBarSource = read("../../multideck.client/src/components/multideck/top-bar.tsx")
const topBarEvents = read("../../multideck.client/src/lib/top-bar-action-events.ts")
const providerArchitecture = read("../../docs/architecture/finance-provider-adapters.md")
const readme = read("../../README.md")
const baseline = read("../baseline/public-schema.sql")

function includesEvery(source, values) {
  for (const value of values) assert.ok(source.includes(value), `Expected source to include ${value}`)
}

test("finance foundation seeds controlled charts, tax treatments, roles and providers", () => {
  includesEvery(foundation, [
    "Generic business chart of accounts",
    "Freight forwarder chart of accounts",
    "Trade receivables",
    "Trade payables",
    "Output tax payable",
    "Recoverable input tax",
    "Foreign exchange gain or loss",
    "domestic-standard",
    "reverse-charge",
    "out-of-scope",
    "Finance.Receivables.View",
    "Finance.Payables.Draft",
    "Finance.ReviewAndPost",
  ])
})

test("documents are created atomically with job, party, currency and idempotency invariants", () => {
  includesEvery(lifecycle, [
    "multideck_finance_create_document_draft",
    "FINDoc_IdempotencyKey",
    "where \"FINDoc_SourceJobID\" is not null and \"FINDoc_SourceKindCode\"='manual'",
    "v_idempotent_company is distinct from p_company_id",
    "v_job_party is distinct from v_party",
    "The selected party must match the customer or supplier on the job.",
    "select upper(\"LegalEntity_BaseCurrencyCodeSnapshot\") into v_entity_currency",
    "coalesce(nullif(btrim(p_input->>'currencyCode'),''),v_entity_currency)",
    "v_exchange::text in ('NaN','Infinity','-Infinity')",
    "Enter the reviewed exchange rate from document currency to base currency.",
    "round(v_net*v_exchange,4)",
    "FIN_DocumentLineJobLinks",
    "FIN_DocumentStatusHistory",
    "Finance document draft created",
  ])
  assert.match(lifecycle, /jsonb_array_length\(p_input->'lines'\) not between 1 and 100/)
  assert.match(functionSource, /admin\.rpc\("multideck_finance_create_document_draft"/)
})

test("cash approval locks balances and allocates only exact open invoices", () => {
  includesEvery(lifecycle, [
    "multideck_finance_create_cash_draft",
    "multideck_finance_transition_cash",
    "FINCash_IdempotencyKey",
    "order by \"FINCashAlloc_DocumentID\" for update",
    "FINDoc_StatusCode\" not in ('approved','submitted')",
    "FINDoc_CurrencyCodeSnapshot\"<>v_cash.\"FINCash_CurrencyCodeSnapshot",
    "FINCashAlloc_AllocationStatusCode\"='allocated'",
    "FINCash_UnallocatedAmount",
    "v_amount::text in ('NaN','Infinity','-Infinity')",
    "v_allocated::text in ('NaN','Infinity','-Infinity')",
    "Allocations cannot exceed the receipt or payment amount.",
  ])
  assert.match(lifecycle, /case when v_cash\."FINCash_TypeCode"='customer_receipt' then 'sl_invoice' else 'pl_invoice' end/)
  assert.match(functionSource, /\.gt\("FINDoc_OutstandingAmount", 0\)[^]*\.limit\(1000\)/)
})

test("review decisions are permissioned, retained and followed by a controlled provider queue", () => {
  includesEvery(lifecycle, [
    "FIN_AuthorisationRequests",
    "FIN_AuthorisationDecisions",
    "FINAUTHDEC_DecisionCode",
    "FIN_IntegrationQueue",
    "finance_lifecycle",
    "awaiting_approval",
    "approved",
    "rejected",
  ])
  includesEvery(functionSource, [
    "Finance.Receivables.Draft",
    "Finance.Payables.Draft",
    "Finance.Receivables.Cash",
    "Finance.Payables.Cash",
    "Finance.ReviewAndPost",
    "Finance.Integration.Manage",
  ])
  assert.match(functionSource, /processQueue\(admin, current, queue\.FINIntQ_ID, true\)\.catch/)
})

test("the provider layer is explicit, retry-safe and never guesses mappings", () => {
  includesEvery(providerSource, [
    "ERPNext",
    "Xero",
    "QuickBooks Online",
    "Sage Accounting",
    "Sage Intacct",
    "Sage 50 Desktop",
    "Sage 200",
    "Dynamics 365 Business Central",
    "Oracle NetSuite",
    "Zoho Books",
    "AccountingProviderPartialError",
    "Map this customer or supplier to ERPNext before exporting.",
    "Map finance line",
    "item_tax_template",
    "conversion_rate",
    "has no valid account currency",
    "Correct the account currency or mapping, then retry.",
    "assertErpNextCompany(input)",
    "assertErpNextAccounts(input",
    "source_exchange_rate: input.exchangeRate",
    "target_exchange_rate: input.exchangeRate",
    "Every cash allocation must reference an exported ERPNext invoice.",
    "preflightFinanceRecord",
  ])
  assert.doesNotMatch(providerSource, /source_exchange_rate:\s*1/)
  assert.doesNotMatch(providerSource, /target_exchange_rate:\s*1/)
  includesEvery(functionSource, [
    "ACCI_PartyMappings",
    "ACCI_ChargeCodeMappings",
    "ACCI_TaxCodeMappings",
    "ACCI_AccountMappings",
    "ACCI_ExternalRefs",
    "ACCI_ReconciliationIssues",
    "FINIntQ_StatusCode: \"processing\"",
    "ACCIEB_GrossTotalLocal: input.localAmount",
    "integrationAttention",
    "FINIntQ_LastError",
    "The previous provider delivery stopped before completion and is ready to retry.",
    ".in(\"FINIntQ_StatusCode\", [\"queued\", \"blocked\", \"failed\"])",
    "syncStatus === \"synced\"",
    "erpNextCatalog",
    "Finance.Integration.Manage",
    "ACCIC_ExternalTenantName",
    "Item Tax Template",
    "ensureErpNextDemoServiceItem",
    "demo-finance.multideck.app",
    "demo_service_item_created",
    "Non-commercial Multideck integration test service",
    "refreshErpNextConnectionEnvironment",
    "provider_environment_verified",
    "demoTaxConfirmed",
    "DEMO-NONTAX",
    "demoReadyEntityIds",
    "upsertErpNextPartyMapping",
    "party_mapping_verified",
    "verifyErpNextExternalReference",
    "external-references",
    "preflightDocument",
    "provider-preflight",
    "allowAwaitingApproval",
  ])
})

test("subledger guardrails fail closed before provider mutation and explain the correction", () => {
  includesEvery(lifecycle, [
    "The due date cannot be before the document date.",
    "Choose a tax treatment for finance line",
    "The finance document gross amount must be greater than zero.",
    "The finance document header no longer agrees with its lines.",
    "The job, legal entity and customer or supplier no longer match.",
    "Choose an active bank account before recording a receipt or payment.",
    "Configure a valid currency for the selected bank account.",
    "The receipt or payment allocations no longer agree with its amount.",
    "Allocate to each document once.",
    "Repeat the accounting Company currency preflight before approval.",
    "baseCurrencyInitialised",
    "initialise_base_currency",
  ])
  includesEvery(functionSource, [
    "Only a reviewed finance record can pass provider preflight or export.",
    "The active accounting connection has no valid base currency.",
    "conflicting active provider mappings",
    "conflicting active charge-code mappings",
    "requires its exact ${expectedDocumentType} to be synced first",
    "This finance record is already synced to the accounting provider.",
    "assertErpNextCompanySetup",
    "assertCountryCode",
    "providerPreflightPassed: true",
    "assertPartyFinancePostingAllowed",
    "This customer is on credit hold.",
    "This supplier is on payment hold.",
    "already mapped to another Multideck organisation",
  ])
  includesEvery(providerSource, [
    "has no valid default currency",
    "Mapped ERPNext",
    "Mapped ERPNext Item",
    "Mapped ERPNext tax template",
    "The ERPNext bank and control account mappings must use different accounts.",
    "const created = await erpNextCreate",
  ])
  assert.ok(providerSource.indexOf("assertErpNextCompany(input)") < providerSource.indexOf("const created = await erpNextCreate"))
  includesEvery(appSource, [
    "Choose bank account",
    "The bank account and its provider mapping must use this transaction currency before posting.",
    "Provider and legal-entity base currencies match.",
    "This reviewed setup will initialise the legal entity base currency from the accounting Company.",
    "This older setup review uses an invalid country code. Prepare a corrected review before approval.",
    "!companyCurrencyReady",
  ])
  includesEvery(functionSource, ["validCountryCodes", "approvalBlocker", "invalid_country_code"])
  assert.doesNotMatch(appSource, /Record before bank mapping/)
  includesEvery(dexterSource, [
    "Choose the exact active bank account",
    "Provide the exact reviewed exchange rate",
    "bankAccountId,",
    "exchangeRate,",
    "posting and Dexter must never repair or guess accounting master data",
  ])
})

test("document tax is legal-entity scoped, approved, effective-dated and derived by the database", () => {
  includesEvery(approvedTaxControls, [
    "_multideck_finance_apply_approved_line_tax",
    "localAdviceConfirmed",
    "FINTax_LegalEntityID",
    "FINTax_EffectiveFrom",
    "FINTax_EffectiveTo",
    "FINTax_TransactionTypeCode",
    "FINDocLine_TaxCodeID",
    "FINDocLine_TaxRatePercent",
    "TR_FIN_DocumentLines_approved_tax",
    "TR_FIN_Documents_approved_tax_review",
    "tax_advice",
  ])
  includesEvery(incompleteDraftControls, [
    "v_document_status <> 'draft'",
    "FINDocLine_TaxCodeID\" := null",
    "baseCurrencyStatus",
    "pending_configuration",
    "Finance must approve local tax advice and every line must use an approved effective treatment before review.",
    "taxStatus",
    "multideck_dexter_domain_finance",
    "_multideck_dexter_finance_watch_change",
  ])
  includesEvery(functionSource, [
    "FINAdminRevision_ConfigJSON",
    "FINLocTaxTreatment_LegalEntityID",
    "taxSuggestions",
    "hasApprovedTaxAdvice",
    "taxRatePercent: 0",
  ])
  includesEvery(appSource, [
    "Tax will remain pending",
    "availableTaxTreatments",
    "Save incomplete draft",
    "Currency review is awaiting approval",
  ])
  includesEvery(financeLineEditorSource, ["Rate pending approval", "taxPending", "Draft subtotal"])
  assert.doesNotMatch(functionSource, /before a document can be created/)
})

test("sandbox demo tax remains explicit, zero-rate and impossible on a production connection", () => {
  includesEvery(demoTaxControls, [
    "_multideck_finance_demo_tax_allowed",
    "demoOnlyConfirmed",
    "localAdviceConfirmed",
    "ACCIC_Environment\" = 'sandbox'",
    "Demo-only tax review cannot claim statutory local advice.",
    "Demo-only tax review requires an active ERPNext sandbox connection.",
    "DEMO-NONTAX",
    "FINTax_RatePercent\" = 0",
    "FINTax_SettingsJSON\" ->> 'demoOnly'",
    "TR_FIN_AdministrationRevisions_demo_guard",
    "_multideck_finance_validate_document_tax_review",
    "from public, anon, authenticated",
    "normal human posting approval",
  ])
  assert.doesNotMatch(demoTaxControls, /demoOnlyConfirmed[^]*ACCIC_Environment\" = 'production'/)
})

test("finance readiness distinguishes verified demo tax from statutory advice", () => {
  includesEvery(demoReadinessControls, [
    "_multideck_finance_normalise_revision_readiness",
    "demoOnlyConfirmed",
    "localAdviceConfirmed",
    "ACCIC_Environment\" = 'sandbox'",
    "item.value <> 'tax_advice'",
    "jsonb_array_length(v_missing) = 0",
    "keeping those two evidence states distinct",
  ])
})

test("finance numbering and lifecycle audit catalogues cover every subledger record", () => {
  includesEvery(numberSequenceFix, [
    "on conflict (\"FINSeq_LegalEntityID\", \"FINSeq_Code\")",
    "where \"FINSeq_LegalEntityID\" is not null",
    "customer_receipt",
    "supplier_payment",
  ])
  includesEvery(financeAuditTypes, [
    "'sl_invoice'",
    "'credit_note'",
    "'pl_invoice'",
    "'debit_note'",
    "'customer_receipt'",
    "'supplier_payment'",
    "'finance_configuration'",
  ])
})

test("legacy finance reports cannot bypass RLS or be queried from browser roles", () => {
  includesEvery(reportingBoundary, [
    "FIN_DocumentBalanceSummary\" set (security_invoker = true)",
    "FIN_JobFinanceSummary\" set (security_invoker = true)",
    "FIN_AIInsightQueue\" set (security_invoker = true)",
    "from public, anon, authenticated",
    "to service_role",
    "FIN_CalculatePulledRate\"(numeric, text, numeric, numeric, integer)",
    "FIN_GetNextOpenPeriod\"(uuid, uuid, text, date)",
    "FIN_RecordAIInsight\"(varchar, varchar, text, varchar, uuid, uuid, uuid, numeric, uuid)",
    "set search_path = pg_catalog, public",
  ])
})

test("all finance reads and queue processing are scoped through the signed-in company", () => {
  includesEvery(functionSource, [
    ".eq(\"Company_ID\", current.Company_ID)",
    ".in(\"FINDoc_LegalEntityID\", ids)",
    ".in(\"FINCash_LegalEntityID\", ids)",
    "await scopedDocument(admin, current, queue.FINIntQ_LocalID)",
    "await scopedCash(admin, current, queue.FINIntQ_LocalID)",
  ])
  includesEvery(lifecycle, [
    "The finance operator is outside this workspace.",
    "Finance document not found in this workspace.",
    "Cash transaction not found in this workspace.",
    "The finance request key belongs to another workspace.",
    "ACCIC_ID\"<>v_connection",
  ])
})

test("Dexter has evidence-backed finance reads, allowlisted drafts and event-driven watches", () => {
  includesEvery(lifecycle, [
    "multideck_dexter_domain_finance",
    "'recordKind','document'",
    "'recordKind','cash'",
    "create_finance_document_draft",
    "create_finance_cash_draft",
    "This action must be completed through the Finance Edge Function.",
    "AI_DexterWatchSignals",
    "AIDexterWatch_StatusCode\"='active'",
    "TR_FIN_Documents_dexter_watch",
    "TR_FIN_CashTransactions_dexter_watch",
  ])
  includesEvery(dexterSource, [
    "FINANCE_EDGE_ACTIONS",
    "financeActionFetch",
    "create_finance_document_draft",
    "create_finance_cash_draft",
    "Dexter has no generic table, SQL, Finance Setup, organisation financial-setting, counterparty-bank or accounting-provider write access.",
    "an explicit Tax pending state",
    "pass null and explain that the incomplete draft cannot enter finance review",
  ])
  includesEvery(incompleteDraftControls, ["'taxStatus'", "AIDexterWatchCapability_FieldsJSON"])
  assert.doesNotMatch(lifecycle, /openai|anthropic|chat\/completions|generateText/i)
})

test("finance drafts derive their company from the signed-in tenant", () => {
  includesEvery(functionSource, [
    "async function tenantLegalEntity",
    '.eq("Company_ID", current.Company_ID)',
    'if (data.length !== 1) throw new HttpError(409, "This tenant must have exactly one active company before creating finance records.")',
    "const tenantInput: ControlledDraftInput = { ...input, legalEntityId: tenantEntity.LegalEntity_ID }",
    "const controlledInput: ControlledCashInput = { ...input, legalEntityId: tenantEntity.LegalEntity_ID }",
  ])
  assert.doesNotMatch(tenantOwnedFinanceDocuments, /legalEntityId/)
  assert.doesNotMatch(documentPageSource, /finance-detail-entity|legalEntityId:/)
  assert.doesNotMatch(appSource, /finance-document-entity|finance-cash-entity/)
  assert.doesNotMatch(purchaseIntakeSource, /t\("Legal entity"\)|legalEntityId: item\.legalEntityId/)
  includesEvery(dexterSource, [
    "The signed-in tenant company is used automatically.",
    "type: cleanString(args.type, 40), partyOrgId",
  ])
})

test("the operator UI covers both ledgers, cash, job and manual sources", () => {
  includesEvery(appSource, [
    "Sales ledger",
    "Purchase ledger",
    "Cashbook & allocations",
    "Ad hoc or ancillary",
    "Freight job",
    "Customer credit note",
    "Supplier credit note",
    "Customer receipt",
    "Supplier payment",
    "Open document allocations",
    "Exchange rate to",
    "Send for review",
    "Approve",
    "unallocatedCashTotals",
    "FINDoc_NativePostingStatusCode",
    "FINDoc_ExportStatusCode",
    "FINCash_NativePostingStatusCode",
    "FINCash_ExportStatusCode",
    "Tax pending",
    "text-end",
    "dir=\"ltr\"",
  ])
  includesEvery(financeLineEditorSource, ["Line type", "Ancillary", "Draft subtotal", "text-end", "dir=\"ltr\""])
  assert.doesNotMatch(appSource, /font-mono|ui-monospace|SF Mono/)
  includesEvery(apiSource, ["createFinanceDraft", "createFinanceCashDraft", "approveFinanceDocument", "approveFinanceCash"])
  includesEvery(appRouterSource, ["/finance/receivables", "/finance/payables", "/finance/cash", "/admin/finance"])
  includesEvery(topBarEvents, ["createSalesInvoice", "createCustomerCredit", "createPurchaseInvoice", "createSupplierDebit", "recordCustomerReceipt", "recordSupplierPayment"])
  includesEvery(topBarSource, ["FinanceTopBarAction", "Finance.Receivables.Draft", "Finance.Payables.Cash"])
})

test("manual invoices and credits use the reusable Sage-style document editor", () => {
  includesEvery(financeLineEditorSource, [
    "Add row",
    "Insert row",
    "Copy row",
    "Remove row",
    "Import Excel",
    "Export Excel",
    "Print proforma",
    "Clear form",
    "financeDocumentLineTotals",
    "crypto?.randomUUID",
  ])
  includesEvery(appSource, [
    "FinanceDocumentLineEditor",
    "Save draft",
    "Clear this draft and start again?",
    "parseFinanceDocumentWorkbook",
    "downloadFinanceDocumentWorkbook",
    "printFinanceProforma",
  ])
  includesEvery(financeExcelSource, ["MAX_FILE_BYTES", "MAX_EXPANDED_BYTES", "MAX_IMPORT_LINES", "Document lines", "autoFilter", "state=\"frozen\"", "E${row}*F${row}"])
  includesEvery(financeProformaSource, ["PROFORMA", "Not a tax document", "window.open", "document.close"])
  assert.doesNotMatch(financeLineEditorSource, /font-mono|ui-monospace|SF Mono/)
})

test("missing customers can be linked or created in ERPNext and Sage 50 through a guarded wizard", () => {
  includesEvery(appSource, [
    "Customer not set up in accounts",
    "Do you want to add them now?",
    "Set up customer",
    "ProviderCustomerSetupWizard",
  ])
  includesEvery(providerCustomerWizardSource, [
    "Existing ERPNext customer",
    "Create new ERPNext customer",
    "Customer group",
    "Territory",
    "HyperExt is not ready",
    "Sage account reference",
    "External change",
    "The invoice remains a separate draft.",
  ])
  includesEvery(functionSource, [
    "providerCustomerConnection",
    "This accounting system does not have an account setup workflow yet.",
    "Finance.Integration.Manage",
    "erpNextCreate(\"Customer\"",
    "erpNextCreate(\"Address\"",
    "Choose Link existing customer instead of creating a duplicate.",
    "hyperExtRequest(\"/api/customer/\"",
    "provider_customer_created",
  ])
  includesEvery(hyperExtSource, [
    "HYPEREXT_SAGE50_BASE_URL",
    "HYPEREXT_SAGE50_AUTH_TOKEN",
    "url.protocol !== \"https:\"",
    "AuthToken: token",
    "AbortController",
    "hyperExtRequest(\"/api/status\")",
    "sdoStatusOk",
    "odbcStatusOk",
  ])
  assert.doesNotMatch(providerCustomerWizardSource, /HYPEREXT_SAGE50_AUTH_TOKEN|AuthToken/)
})

test("the Finance menu exposes working modules and names future accounting scope honestly", () => {
  includesEvery(navigationSource, [
    "Customers & receivables",
    "Suppliers & payables",
    "Cash & banking",
    "Accounts & controls",
    "Management accounting",
    "Receivables approvals",
    "Credit control & collections",
    "Invoice & credit batches",
    "Collection calls & orders",
    "Incomplete supplier invoices",
    "Invoice matching",
    "Pending allocation approval",
    "CASS cost file import",
    "Allocation & reconciliation",
    "Collection batches",
    "Bank accounts",
    "Nominal accounts",
    "Charge & provider mappings",
    "Posting controls & audit",
    "Customer & supplier groups",
    "Job billing exchange rates",
    "Intercompany mappings",
    "Multi-language account labels",
    "Fixed assets",
    "Departments & projects",
    "Products & services",
    "Finance diary",
    "Import chart of accounts",
    "value: \"Planned\"",
  ])
  includesEvery(appRouterSource, [
    "/finance/receivables/approvals",
    "/finance/receivables/credit-control",
    "/finance/payables/approvals",
    "/finance/cash/reconciliation",
    "/finance/administration",
    "/finance/banks",
    "/finance/controls",
  ])
  includesEvery(financeSetupSource, ["initialTab", "syncFinanceRoute", "financeSetupRouteByTab"])
})

test("finance setup is administrator-routed and provider availability is honest", () => {
  assert.match(navigationSource, /id: "admin-finance"/)
  assert.doesNotMatch(navigationSource, /id: "finance-setup"/)
  assert.match(appRouterSource, /window\.location\.pathname === "\/finance\/setup"/)
  assert.match(providerSource, /code: "erpnext"[^\n]+enabled: true/)
  assert.equal((providerSource.match(/enabled: true/g) ?? []).length, 1)
  assert.match(appSource, /remains visible but unavailable until its connector passes tenant, permission, retry and reconciliation checks/)
})

test("finance setup normalises older Edge responses instead of crashing on missing collections", () => {
  includesEvery(apiSource, [
    "normaliseFinanceSetup",
    "financeSetupCollection",
    "compatibility: { current: missingFields.length === 0, missingFields }",
  ])
  includesEvery(appSource, [
    "setup?.providers?.find",
    "Finance service update required",
    "Finance Setup received an older finance service response.",
    "!setup.compatibility.current",
  ])
})

test("finance administration is legal-entity scoped, atomic, audited and browser-inaccessible", () => {
  includesEvery(administration, [
    "FIN_AdministrationRevisions",
    "multideck_finance_save_administration",
    "FINCurSet_LegalEntityID",
    "FINBank_IsDefault",
    "FINBank_AllowReceipts",
    "FINBank_AllowPayments",
    "FINTax_TreatmentCategoryCode",
    "FINTax_OutputNominalID",
    "FINTax_InputNominalID",
    "Finance settings must be an object.",
    "The finance operator is outside this workspace.",
    "regexp_replace",
    "••••",
    "revoke all on public.\"FIN_Settings\"",
    "grant execute on function public.multideck_finance_save_administration",
  ])
})

test("the comprehensive administrator UI covers every accounting configuration area", () => {
  includesEvery(financeSetupSource, [
    "Finance administration",
    "Accounting systems",
    "Currencies & FX",
    "Bank accounts",
    "General ledger",
    "Tax",
    "Documents",
    "Mappings",
    "Controls & audit",
    "Save approved settings",
    "localAdviceConfirmed",
    "accountNumberLast4",
    "freight-forwarder-v1",
    "A legal entity can operate several bank accounts in several currencies.",
  ])
  assert.doesNotMatch(financeSetupSource, /font-mono|ui-monospace|SF Mono/)
})

test("administration saves only through the protected permissioned Edge boundary", () => {
  includesEvery(functionSource, [
    "request.method === \"PUT\" && parts[0] === \"administration\"",
    "Finance.Configuration.Manage",
    "Finance.Banks.Manage",
    "Finance.Integration.Manage",
    "multideck_finance_save_administration",
  ])
  includesEvery(apiSource, ["FinanceAdministrationDraft", "saveFinanceAdministration", "PUT"])
})

test("Dexter reads approved finance configuration and watches real revision events without configuration writes", () => {
  includesEvery(administration, [
    "'recordKind','configuration'",
    "'sourceTable','FIN_AdministrationRevisions'",
    "Statutory settings remain read-only in Dexter.",
    "AI_DexterWatchSignals",
    "TR_FIN_AdministrationRevisions_dexter_watch",
  ])
  assert.doesNotMatch(administration, /openai|anthropic|chat\/completions|generateText/i)
})

test("organisation financial settings cover transaction-ready AR, AP and verified multi-currency banks", () => {
  includesEvery(accountOperationsSource, [
    "Accounts Receivable",
    "Accounts Payable",
    "Bank Details",
    "Customer accounting status",
    "Supplier accounting status",
    "Sales legal entity",
    "Purchase legal entity",
    "Sales payment terms",
    "Purchase payment terms",
    "Default sales tax treatment",
    "Default purchase tax treatment",
    "Credit hold",
    "Supplier payment hold",
    "Invoice grouping",
    "Invoice matching",
    "Statement frequency",
    "Payment run group",
    "verificationStatusCode",
    "useForPayments",
    "useForRefunds",
    "useForDirectDebit",
  ])
  assert.doesNotMatch(accountOperationsSource, /font-mono|ui-monospace|SF Mono/)
})

test("party finance defaults are bounded by approved references and finance permissions", () => {
  includesEvery(customerFunctionSource, [
    "FINCurSet_LegalEntityID",
    "FIN_PaymentTerms",
    "FIN_TaxCodes",
    "Finance.Configuration.Manage",
    "Finance.Banks.Manage",
    "legalEntities:",
    "paymentTerms:",
    "taxTreatments:",
  ])
  includesEvery(partyFinance, [
    "_multideck_crm_validate_account_finance_preferences",
    "The selected finance legal entity is outside this workspace.",
    "A verified bank account needs a verification reference and date.",
    "TR_CRM_AccountOperationalProfiles_validate_finance",
    "no Dexter write action for statutory or counterparty-bank configuration",
    "AIDexterWatchCapability_FieldsJSON",
  ])
  includesEvery(dexterSource, ["organisation financial-setting", "counterparty-bank"])
})

test("ERPNext webhooks accept only signed allowlisted accounting events", () => {
  includesEvery(webhookSource, ["X-Frappe-Webhook-Signature", "HMAC", "Sales Invoice", "Purchase Invoice", "Payment Entry", "ACCIWH_SignatureVerified"])
})

test("the finance demo hostname remains a provider endpoint, never an app identity boundary", () => {
  includesEvery(providerArchitecture, [
    "https://demo-finance.multideck.app",
    "ERPNEXT_BASE_URL",
    "This hostname belongs to ERPNext/Frappe Cloud",
    "must not be used as `APP_URL`",
    "zero-rate `DEMO-NONTAX`",
    "same revision cannot",
    "Item creation permission",
    "provider party being assigned to two local organisations",
    "stops",
  ])
  includesEvery(readme, [
    "https://demo-finance.multideck.app",
    "never use it for `APP_URL`",
    "`VITE_MULTIDECK_TENANT_HOST`",
  ])
  assert.doesNotMatch(readme, /VITE_MULTIDECK_TENANT_HOST=demo-finance\.multideck\.app/)
})

test("new-tenant provisioning contains the exact reviewed lifecycle migration", () => {
  const marker = baseline.indexOf("-- Finance ledger lifecycle parity")
  const administrationMarker = baseline.indexOf("-- Comprehensive finance administration parity")
  assert.notEqual(marker, -1)
  assert.notEqual(administrationMarker, -1)
  const baselineLifecycle = baseline.slice(baseline.indexOf("begin;", marker), administrationMarker).trim()
  const migrationLifecycle = lifecycle.slice(lifecycle.indexOf("begin;")).trim()
  assert.equal(baselineLifecycle, migrationLifecycle)
})

test("new-tenant provisioning contains the exact comprehensive finance administration migration", () => {
  const marker = baseline.indexOf("-- Comprehensive finance administration parity")
  const partyMarker = baseline.indexOf("-- Comprehensive CRM financial profiles parity")
  assert.notEqual(marker, -1)
  assert.notEqual(partyMarker, -1)
  const baselineAdministration = baseline.slice(baseline.indexOf("begin;", marker), partyMarker).trim()
  const migrationAdministration = administration.slice(administration.indexOf("begin;")).trim()
  assert.equal(baselineAdministration, migrationAdministration)
})

test("new-tenant provisioning contains the exact comprehensive party-finance migration", () => {
  const marker = baseline.indexOf("-- Comprehensive CRM financial profiles parity")
  const taxControlMarker = baseline.indexOf("-- Approved finance tax controls parity")
  assert.notEqual(marker, -1)
  assert.notEqual(taxControlMarker, -1)
  const baselinePartyFinance = baseline.slice(baseline.indexOf("begin;", marker), taxControlMarker).trim()
  const migrationPartyFinance = partyFinance.slice(partyFinance.indexOf("begin;")).trim()
  assert.equal(baselinePartyFinance, migrationPartyFinance)
})

test("new-tenant provisioning contains the exact approved finance tax controls", () => {
  const marker = baseline.indexOf("-- Approved finance tax controls parity")
  const guardedDraftMarker = baseline.indexOf("-- Final guarded finance draft, numbering and audit overrides.")
  assert.notEqual(marker, -1)
  assert.notEqual(guardedDraftMarker, -1)
  const baselineTaxControls = baseline.slice(baseline.indexOf("begin;", marker), guardedDraftMarker).trim()
  const migrationTaxControls = approvedTaxControls.slice(approvedTaxControls.indexOf("begin;")).trim()
  assert.equal(baselineTaxControls, migrationTaxControls)
})

test("new-tenant provisioning contains the exact incomplete-draft guardrails", () => {
  const marker = baseline.indexOf("-- Final guarded finance draft, numbering and audit overrides.")
  const sequenceMarker = baseline.indexOf("-- Finance sequence codes are unique within a legal entity.", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(sequenceMarker, -1)
  const baselineDraftControls = baseline.slice(baseline.indexOf("begin;", marker), sequenceMarker).trim()
  const migrationDraftControls = incompleteDraftControls.slice(incompleteDraftControls.indexOf("begin;")).trim()
  assert.equal(baselineDraftControls, migrationDraftControls)
})

test("new-tenant provisioning contains the exact finance numbering fix", () => {
  const marker = baseline.indexOf("-- Finance sequence codes are unique within a legal entity.")
  const auditMarker = baseline.indexOf("-- Finance lifecycle functions write immutable audit events.", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(auditMarker, -1)
  const baselineNumbering = baseline.slice(baseline.indexOf("begin;", marker), auditMarker).trim()
  const migrationNumbering = numberSequenceFix.slice(numberSequenceFix.indexOf("begin;")).trim()
  assert.equal(baselineNumbering, migrationNumbering)
})

test("new-tenant provisioning contains the exact finance audit catalogue", () => {
  const marker = baseline.indexOf("-- Finance lifecycle functions write immutable audit events.")
  const reportingMarker = baseline.indexOf("-- Finance reporting boundary hardening parity.", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(reportingMarker, -1)
  const baselineAuditTypes = baseline.slice(baseline.indexOf("begin;", marker), reportingMarker).trim()
  const migrationAuditTypes = financeAuditTypes.slice(financeAuditTypes.indexOf("begin;")).trim()
  assert.equal(baselineAuditTypes, migrationAuditTypes)
})

test("new-tenant provisioning contains the exact finance reporting boundary hardening", () => {
  const marker = baseline.indexOf("-- Finance reporting boundary hardening parity.")
  const demoTaxMarker = baseline.indexOf("-- Guarded sandbox demo finance posting parity.", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(demoTaxMarker, -1)
  const baselineReportingBoundary = baseline.slice(baseline.indexOf("begin;", marker), demoTaxMarker).trim()
  const migrationReportingBoundary = reportingBoundary.slice(reportingBoundary.indexOf("begin;")).trim()
  assert.equal(baselineReportingBoundary, migrationReportingBoundary)
})

test("new-tenant provisioning contains the exact sandbox demo tax controls", () => {
  const marker = baseline.indexOf("-- Guarded sandbox demo finance posting parity.")
  const readinessMarker = baseline.indexOf("-- Sandbox demo finance readiness parity.", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(readinessMarker, -1)
  const baselineDemoTaxControls = baseline.slice(baseline.indexOf("begin;", marker), readinessMarker).trim()
  const migrationDemoTaxControls = demoTaxControls.slice(demoTaxControls.indexOf("begin;")).trim()
  assert.equal(baselineDemoTaxControls, migrationDemoTaxControls)
})

test("new-tenant provisioning contains the exact sandbox demo readiness controls", () => {
  const marker = baseline.indexOf("-- Sandbox demo finance readiness parity.")
  const recoveryMarker = baseline.indexOf("-- Finance document recovery parity.", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(recoveryMarker, -1)
  const baselineDemoReadinessControls = baseline.slice(baseline.indexOf("begin;", marker), recoveryMarker).trim()
  const migrationDemoReadinessControls = demoReadinessControls.slice(demoReadinessControls.indexOf("begin;")).trim()
  assert.equal(baselineDemoReadinessControls, migrationDemoReadinessControls)
})

test("blocked document recovery preserves approval, audit and posted-record immutability", () => {
  includesEvery(documentRecovery, [
    "multideck_finance_update_document_draft",
    "Only an unlocked draft can be edited.",
    "multideck_finance_reopen_document_draft",
    "A posted document is immutable and cannot be returned to draft.",
    "Approval revoked:",
    '"FINIntQ_StatusCode" = \'cancelled\'',
    '"ACCIRI_StatusCode" = \'synced\'',
    "approvalRevoked",
    "update_draft",
    "reopen_draft",
    "service_role",
  ])
  includesEvery(functionSource, [
    "async function documentDetail",
    "async function retryDocumentPosting",
    "async function reopenDocumentDraft",
    'parts[2] === "retry-posting"',
    'parts[2] === "reopen-draft"',
    "Provider delivery completed successfully on retry.",
  ])
})

test("finance references open a state-aware workspace and KPI evidence stays compact", () => {
  includesEvery(appSource, [
    "openDocument(row)",
    't("Resolve")',
    'className="md-kpi-scope"',
    'density="compact"',
  ])
  includesEvery(documentPageSource, [
    'document?.FINDoc_StatusCode === "draft"',
    'readOnly={!editable}',
    't("Retry mirror")',
    't("Return to draft")',
    't("Approve & post")',
    't("Open external mirror")',
    "reopenFinanceDocumentDraft",
    "retryFinanceDocumentPosting",
  ])
})

test("Dexter reads recovery evidence while Watching remains event-driven", () => {
  includesEvery(documentRecovery, [
    "postingError",
    "postingAttemptCount",
    "postingLastAttemptAt",
    "recoveryRoute",
    "retry_posting",
    "return_to_draft",
    "Event-driven finance document",
  ])
  includesEvery(dexterSource, [
    "finance-recovery",
    "retrying an external-mirror delivery, revoking approval and returning a document to draft also remain manual finance controls",
    "Never claim to have retried, reopened or repaired an external-mirror delivery.",
  ])
  includesEvery(lifecycle, [
    "TR_FIN_Documents_dexter_watch",
    '"FINDoc_PostingStatusCode"',
    "AI_DexterWatchSignals",
  ])
})

test("new-tenant provisioning contains the exact finance document recovery migration", () => {
  const marker = baseline.indexOf("-- Finance document recovery parity.")
  assert.notEqual(marker, -1)
  const start = baseline.indexOf("begin;", marker)
  const end = baseline.indexOf("\ncommit;", start) + "\ncommit;".length
  const baselineRecovery = baseline.slice(start, end).trim()
  const migrationRecovery = documentRecovery.slice(documentRecovery.indexOf("begin;")).trim()
  assert.equal(baselineRecovery, migrationRecovery)
})

test("new-tenant provisioning contains the tenant-owned finance document contract", () => {
  const marker = baseline.indexOf("-- BEGIN MIGRATION 20260901103000_tenant_owned_finance_documents.sql")
  const endMarker = baseline.indexOf("-- END MIGRATION 20260901103000_tenant_owned_finance_documents.sql", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(endMarker, -1)
  const baselineSection = baseline.slice(baseline.indexOf("-- Finance documents and cash records", marker), endMarker).trim()
  assert.equal(baselineSection, tenantOwnedFinanceDocuments.trim())
})

test("customer and supplier registers provide a permissioned bulk accounting sync with retained per-account outcomes", () => {
  includesEvery(functionSource, [
    'parts[0] === "provider-parties"',
    'parts[1] === "sync"',
    'requirePermission(admin, current.User_ID, "Finance.Integration.Manage")',
    'ACCISR_SettingsJSON: { kind: "party_master", partyType',
    '"party_account_synced"',
    '"party_account_sync_failed"',
    'admin.from("ACCI_SyncRuns")',
    'admin.from("ACCI_SyncEvents")',
    'admin.rpc("multideck_crm_accessible_account_ids"',
    'connection.ACCIC_ProviderCode === "erpnext"',
    'hyperExtRequest(`/api/${partyType}/`',
  ])
  includesEvery(apiSource, ["getProviderPartySyncOverview", "syncProviderParties", '"/provider-parties/sync"'])
  includesEvery(crmAccountsSource, [
    'organisationType?: OrganisationRegisterType',
    'hasPermission(currentUser, "Finance.Integration.Manage")',
    't("Sync with accounting system")',
    '"Sync all accounts"',
    'displayedSync.results.map',
    'result.status === "synced" ? "Synced" : "Failed"',
  ])
  includesEvery(appRouterSource, [
    '<CrmAccountsPage key={route} navigate={navigate} currentUser={currentUser} organisationType="customer" />',
    '<CrmAccountsPage key={route} navigate={navigate} currentUser={currentUser} organisationType="supplier" />',
  ])
  includesEvery(navigationSource, ['label: "Supplier accounts"', 'route: "/suppliers"'])
})

test("bulk account sync is readable by Dexter and emits deterministic completion signals without a Dexter write action", () => {
  includesEvery(providerPartyBulkSync, [
    "_multideck_dexter_domain_finance_before_provider_party_sync",
    "'recordKind','provider_party_sync'",
    "'accountResults'",
    "_multideck_dexter_provider_party_sync_watch_change",
    'new."ACCISR_StatusCode" in (\'synced\',\'failed\')',
    "AI_DexterWatchSignals",
    'watch."AIDexterWatch_StatusCode"=\'active\'',
    '"accountSyncStatus"',
  ])
  assert.doesNotMatch(providerPartyBulkSync, /multideck_dexter_action_[a-z_]*party/i)
  includesEvery(dexterSource, [
    "Customer and supplier account-sync results are available through finance evidence",
    "must never claim to have created, linked or retried a provider account",
  ])
})

test("new-tenant provisioning contains the provider party bulk-sync parity migration", () => {
  const marker = baseline.indexOf("-- BEGIN MIGRATION 20260902113000_provider_party_bulk_sync.sql")
  const endMarker = baseline.indexOf("-- END MIGRATION 20260902113000_provider_party_bulk_sync.sql", marker)
  assert.notEqual(marker, -1)
  assert.notEqual(endMarker, -1)
  const baselineSection = baseline.slice(baseline.indexOf("-- Retain customer and supplier bulk-sync results", marker), endMarker).trim()
  assert.equal(baselineSection, providerPartyBulkSync.trim())
})
