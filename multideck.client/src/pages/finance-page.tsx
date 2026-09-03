import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertCircle, ChartNoAxesCombined, Landmark, LoaderCircle, ReceiptText, RefreshCw, ShieldCheck, Wallet } from "@/components/icons/hugeicons"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import {
  createFinanceDocumentLine,
  FinanceDocumentLineEditor,
  type FinanceDocumentLine,
  type FinanceDocumentTaxOption,
} from "@/components/multideck/finance-document-line-editor"
import { ProviderCustomerSetupWizard } from "@/components/multideck/provider-customer-setup-wizard"
import { RegisterFacetSelect, RegisterRefreshButton, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { downloadFinanceDocumentWorkbook, parseFinanceDocumentWorkbook } from "@/lib/finance-document-excel"
import { printFinanceProforma } from "@/lib/finance-proforma"
import {
  approveFinanceCash,
  approveFinanceConfigurationRun,
  approveFinanceDocument,
  createFinanceCashDraft,
  createFinanceConfigurationRun,
  createFinanceDraft,
  FinanceSubledgerApiError,
  getErpNextCompanies,
  getFinanceCash,
  getFinanceDocuments,
  getFinanceDraftOptions,
  getFinanceSetup,
  processFinanceIntegrationQueue,
  requestFinanceCashReview,
  requestFinanceDocumentReview,
  type AccountingProviderCode,
  type FinanceCashInput,
  type FinanceCashTransaction,
  type FinanceCashType,
  type FinanceConfigurationInput,
  type FinanceConfigurationPreview,
  type FinanceDocument,
  type FinanceDocumentType,
  type FinanceDraftInput,
  type FinanceDraftOptions,
  type FinanceLedger,
  type FinanceSetup,
} from "@/lib/finance-subledger-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { FinanceSetupPage as FinanceAdministrationPage, type FinanceSetupTab } from "@/pages/finance-setup-page"
import { FinanceDocumentPage } from "@/pages/finance-document-page"
import { FinancePurchaseIntakePage } from "@/pages/finance-purchase-intake-page"
import { FinanceAccrualWipPage } from "@/pages/finance-accrual-wip-page"
import { FinanceReportsPage } from "@/pages/finance-reports-page"
import { toast } from "sonner"

export type FinanceLedgerRoute =
  | "/finance/receivables"
  | "/finance/receivables/approvals"
  | "/finance/receivables/cash"
  | "/finance/receivables/credit-control"
  | "/finance/payables"
  | "/finance/payables/approvals"
  | "/finance/payables/cash"
  | "/finance/cash"
  | "/finance/cash/reconciliation"
export type FinanceAdministrationRoute =
  | "/finance/administration"
  | "/finance/systems"
  | "/finance/currencies"
  | "/finance/banks"
  | "/finance/ledger"
  | "/finance/tax"
  | "/finance/documents"
  | "/finance/mappings"
  | "/finance/compliance"
  | "/finance/controls"
export type FinanceDocumentRoute = `/finance/${FinanceLedger}/documents/${string}`
export type FinanceRoute = FinanceLedgerRoute | FinanceAdministrationRoute | FinanceDocumentRoute | "/finance/setup"
  | "/finance/reports"
  | "/finance/payables/intake"
  | "/finance/management/accruals-wip"
type CreationType = FinanceDocumentType | FinanceCashType
type RegisterMode = "documents" | "cash"

type FinanceLedgerRouteConfig = {
  ledger: FinanceLedger | null
  initialMode: RegisterMode
  title: string
  description: string
  focused: boolean
  scope?: "approvals" | "credit_control" | "reconciliation"
}

const financeLedgerRouteConfig: Record<FinanceLedgerRoute, FinanceLedgerRouteConfig> = {
  "/finance/receivables": { ledger: "receivables", initialMode: "documents", title: "Sales ledger", description: "Customer invoices, credit notes, receipts and open balances, with job or ad hoc source evidence.", focused: false },
  "/finance/receivables/approvals": { ledger: "receivables", initialMode: "documents", title: "Receivables approvals", description: "Customer invoices and credits waiting for controlled finance review.", focused: true, scope: "approvals" },
  "/finance/receivables/cash": { ledger: "receivables", initialMode: "cash", title: "Customer receipts & allocation", description: "Customer receipts, remittance references and allocations against approved open documents.", focused: true },
  "/finance/receivables/credit-control": { ledger: "receivables", initialMode: "documents", title: "Credit control & collections", description: "Overdue approved customer balances that need collection attention.", focused: true, scope: "credit_control" },
  "/finance/payables": { ledger: "payables", initialMode: "documents", title: "Purchase ledger", description: "Supplier invoices, credit notes, payments and open balances, controlled from draft to native posting and any configured external mirror.", focused: false },
  "/finance/payables/approvals": { ledger: "payables", initialMode: "documents", title: "Payables approvals", description: "Supplier invoices and credits waiting for controlled finance review.", focused: true, scope: "approvals" },
  "/finance/payables/cash": { ledger: "payables", initialMode: "cash", title: "Supplier payments & allocation", description: "Supplier payments, bank references and allocations against approved open documents.", focused: true },
  "/finance/cash": { ledger: null, initialMode: "cash", title: "Cashbook & allocations", description: "Customer receipts, supplier payments, bank references and controlled allocations across both ledgers.", focused: false },
  "/finance/cash/reconciliation": { ledger: null, initialMode: "cash", title: "Allocation & reconciliation", description: "Unallocated cash and external-mirror exceptions that require finance attention.", focused: true, scope: "reconciliation" },
}

const financeSetupTabByRoute: Record<FinanceAdministrationRoute, FinanceSetupTab> = {
  "/finance/administration": "overview",
  "/finance/systems": "systems",
  "/finance/currencies": "currencies",
  "/finance/banks": "banks",
  "/finance/ledger": "ledger",
  "/finance/tax": "tax",
  "/finance/documents": "documents",
  "/finance/mappings": "mappings",
  "/finance/compliance": "compliance",
  "/finance/controls": "controls",
}

const today = () => new Date().toISOString().slice(0, 10)
const draftLine = (treatment?: FinanceDraftOptions["taxTreatments"][number]) => createFinanceDocumentLine(treatment ? { code: treatment.FINLocTaxTreatment_Code, ratePercent: Number(treatment.FINLocTaxTreatment_RatePercent) } : undefined)
const documentLabels: Record<FinanceDocumentType, string> = { sl_invoice: "Sales invoice", credit_note: "Customer credit note", pl_invoice: "Purchase invoice", debit_note: "Supplier credit note" }
const cashLabels: Record<FinanceCashType, string> = { customer_receipt: "Customer receipt", supplier_payment: "Supplier payment" }
const financeRecordLabel = (type: FinanceDocumentType | FinanceCashType) => type in documentLabels ? documentLabels[type as FinanceDocumentType] : cashLabels[type as FinanceCashType]

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="text-[12px] font-medium text-[var(--md-text)]">{children}</label>
}

function Notice({ tone = "default", children }: { tone?: "default" | "danger"; children: ReactNode }) {
  return <div role={tone === "danger" ? "alert" : "status"} className={`grid grid-cols-[auto_1fr] gap-3 rounded-[var(--md-radius-lg)] p-4 text-[13px] leading-5 ${tone === "danger" ? "bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] text-[var(--md-red)]" : "bg-[var(--md-surface-soft)] text-[var(--md-text)] shadow-[var(--md-shadow-line)]"}`}><AlertCircle className="mt-0.5 size-4" strokeWidth={1.4} />{children}</div>
}

function statusTone(status: string): "teal" | "amber" | "red" | "neutral" {
  if (["submitted", "posted", "synced", "completed"].includes(status)) return "teal"
  if (["failed", "rejected", "blocked"].includes(status)) return "red"
  if (["draft"].includes(status)) return "neutral"
  return "amber"
}

function DocumentDraftDialog({ type, options, loading, onClose, onCreated }: { type: FinanceDocumentType | null; options: FinanceDraftOptions | null; loading: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { language, t, direction: pageDirection } = useLanguage()
  const [submitting, setSubmitting] = useState(false)
  const [sourceKind, setSourceKind] = useState<"manual" | "job">("manual")
  const [legalEntityId, setLegalEntityId] = useState("")
  const [partyOrgId, setPartyOrgId] = useState("")
  const [sourceJobId, setSourceJobId] = useState("")
  const [documentDate, setDocumentDate] = useState(today())
  const [dueDate, setDueDate] = useState(today())
  const [currencyCode, setCurrencyCode] = useState("")
  const [exchangeRate, setExchangeRate] = useState("1")
  const [lines, setLines] = useState<FinanceDocumentLine[]>([draftLine()])
  const [providerPromptOpen, setProviderPromptOpen] = useState(false)
  const [providerWizardOpen, setProviderWizardOpen] = useState(false)
  const [promptedProviderKey, setPromptedProviderKey] = useState("")
  const [readyProviderKeys, setReadyProviderKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!type || !options) return
    const first = options.legalEntities[0]
    const direction = type === "sl_invoice" || type === "credit_note" ? "sales" : "purchase"
    const firstTreatment = options.taxTreatments.find((treatment) => treatment.FINLocTaxTreatment_LegalEntityID === first?.LegalEntity_ID && ["both", direction].includes(treatment.FINLocTaxTreatment_TransactionType) && treatment.FINLocTaxTreatment_EffectiveFrom <= today() && (!treatment.FINLocTaxTreatment_EffectiveTo || treatment.FINLocTaxTreatment_EffectiveTo >= today()))
    setLegalEntityId(first?.LegalEntity_ID ?? "")
    setCurrencyCode((first?.FinanceDraftCurrencyCode ?? "").toUpperCase())
    setExchangeRate("1")
    setPartyOrgId("")
    setSourceJobId("")
    setSourceKind("manual")
    setDocumentDate(today())
    setDueDate(today())
    setLines([draftLine(firstTreatment)])
  }, [options, type])

  const draftIsReceivables = type === "sl_invoice" || type === "credit_note"
  const activeProviderConnection = draftIsReceivables
    ? (options?.accountingConnections ?? []).find((connection) => connection.ACCIC_LegalEntityID === (legalEntityId || options?.legalEntities[0]?.LegalEntity_ID)) ?? null
    : null
  const providerMappingKey = activeProviderConnection && partyOrgId ? `${activeProviderConnection.ACCIC_ID}:${partyOrgId}:customer` : ""
  const providerCustomerMapped = Boolean(providerMappingKey && (
    readyProviderKeys.has(providerMappingKey)
    || (options?.partyMappings ?? []).some((mapping) => mapping.ACCIPM_ConnectionID === activeProviderConnection?.ACCIC_ID && mapping.ACCIPM_OrgID === partyOrgId && mapping.ACCIPM_IsActive && ["customer", "both"].includes(mapping.ACCIPM_PartyType))
  ))
  const providerCustomerMissing = Boolean(activeProviderConnection && partyOrgId && !providerCustomerMapped)
  const providerWizardSupported = activeProviderConnection?.ACCIC_ProviderCode === "erpnext" || activeProviderConnection?.ACCIC_ProviderCode === "sage_50"

  useEffect(() => {
    if (!providerCustomerMissing || !providerWizardSupported || !providerMappingKey || promptedProviderKey === providerMappingKey) return
    setPromptedProviderKey(providerMappingKey)
    setProviderPromptOpen(true)
  }, [promptedProviderKey, providerCustomerMissing, providerMappingKey, providerWizardSupported])

  if (!type) return null
  const ledger: FinanceLedger = type === "sl_invoice" || type === "credit_note" ? "receivables" : "payables"
  const resolvedLegalEntityId = legalEntityId || options?.legalEntities[0]?.LegalEntity_ID || ""
  const availableJobs = (options?.jobs ?? []).filter((job) => (!resolvedLegalEntityId || !job.Job_LegalEntityID || job.Job_LegalEntityID === resolvedLegalEntityId) && Boolean(ledger === "receivables" ? job.Job_Customer : job.Job_Supplier))
  const jobChargeOptions = (options?.jobCostingLines ?? []).filter((line) => line.Job_ID === sourceJobId).map((line) => ({ id: line.JobCostingLine_ID, lineNo: line.JobCostingLine_Number, chargeCode: null, description: line.JobCostingLine_Description, expectedAmount: Number(ledger === "receivables" ? line.JobCostingLine_RevenueAmountLocal : line.JobCostingLine_CostAmountLocal), nominalCode: null }))
  const selectedEntity = options?.legalEntities.find((entity) => entity.LegalEntity_ID === resolvedLegalEntityId)
  const baseCurrencyCode = (selectedEntity?.FinanceDraftCurrencyCode ?? "").toUpperCase()
  const currencyReady = /^[A-Z]{3}$/.test(baseCurrencyCode) && /^[A-Z]{3}$/.test(currencyCode)
  const needsExchangeRate = currencyReady && currencyCode !== baseCurrencyCode
  const availableTaxTreatments = (options?.taxTreatments ?? []).filter((treatment) => treatment.FINLocTaxTreatment_LegalEntityID === resolvedLegalEntityId && ["both", ledger === "receivables" ? "sales" : "purchase"].includes(treatment.FINLocTaxTreatment_TransactionType) && treatment.FINLocTaxTreatment_EffectiveFrom <= documentDate && (!treatment.FINLocTaxTreatment_EffectiveTo || treatment.FINLocTaxTreatment_EffectiveTo >= documentDate))
  const approvedTaxCodes = new Set(availableTaxTreatments.map((treatment) => treatment.FINLocTaxTreatment_Code))
  const transactionDirection = ledger === "receivables" ? "sales" : "purchase"
  const suggestedTaxOptions = [...new Map((options?.taxSuggestions ?? [])
    .filter((suggestion) => ["both", transactionDirection].includes(suggestion.FINLocTaxTreatment_TransactionType) && !approvedTaxCodes.has(suggestion.FINLocTaxTreatment_Code))
    .map((suggestion) => [suggestion.FINLocTaxTreatment_Code, { id: suggestion.FINLocTaxTreatment_ID, code: suggestion.FINLocTaxTreatment_Code, name: suggestion.FINLocTaxTreatment_Name, ratePercent: 0, approved: false } as FinanceDocumentTaxOption])).values()]
  const taxOptions: FinanceDocumentTaxOption[] = [
    ...availableTaxTreatments.map((treatment) => ({ id: treatment.FINLocTaxTreatment_ID, code: treatment.FINLocTaxTreatment_Code, name: treatment.FINLocTaxTreatment_Name, ratePercent: Number(treatment.FINLocTaxTreatment_RatePercent), approved: true })),
    ...suggestedTaxOptions,
  ]
  const taxPending = lines.some((line) => !line.taxCode || !approvedTaxCodes.has(line.taxCode))
  const selectedParty = options?.parties.find((party) => party.Org_id === partyOrgId)
  const providerName = activeProviderConnection?.ACCIC_ProviderCode === "erpnext" ? "ERPNext" : activeProviderConnection?.ACCIC_ProviderCode === "sage_50" ? "Sage 50 Desktop" : t("the accounting system")

  const clearDraft = () => {
    if (!options || !window.confirm(t("Clear this draft and start again?"))) return
    const first = options.legalEntities[0]
    const draftDirection = type === "sl_invoice" || type === "credit_note" ? "sales" : "purchase"
    const firstTreatment = options.taxTreatments.find((treatment) => treatment.FINLocTaxTreatment_LegalEntityID === first?.LegalEntity_ID && ["both", draftDirection].includes(treatment.FINLocTaxTreatment_TransactionType) && treatment.FINLocTaxTreatment_EffectiveFrom <= today() && (!treatment.FINLocTaxTreatment_EffectiveTo || treatment.FINLocTaxTreatment_EffectiveTo >= today()))
    setLegalEntityId(first?.LegalEntity_ID ?? "")
    setCurrencyCode((first?.FinanceDraftCurrencyCode ?? "").toUpperCase())
    setExchangeRate("1")
    setPartyOrgId("")
    setSourceJobId("")
    setSourceKind("manual")
    setDocumentDate(today())
    setDueDate(today())
    setLines([draftLine(firstTreatment)])
    toast.success(t("The form has been cleared."))
  }

  const importExcel = async (file: File) => {
    try {
      const imported = await parseFinanceDocumentWorkbook(file)
      const fallback = taxOptions.find((option) => option.approved) ?? taxOptions[0]
      setLines(imported.map((line) => {
        const treatment = taxOptions.find((option) => option.code === line.taxCode) ?? fallback
        return {
          ...createFinanceDocumentLine(treatment),
          description: line.description,
          chargeCode: line.chargeCode,
          lineType: sourceKind === "job" ? "service" : line.lineType,
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          taxCode: treatment?.code ?? "",
          taxRatePercent: String(treatment?.approved ? treatment.ratePercent : 0),
        }
      }))
      toast.success(t(`${imported.length} document lines imported`))
    } catch (cause) {
      toast.error(cause instanceof Error ? t(cause.message) : t("The Excel workbook could not be imported."))
    }
  }

  const exportExcel = () => {
    downloadFinanceDocumentWorkbook({ title: `${documentLabels[type]}-${documentDate}`, documentType: t(documentLabels[type]), currencyCode, lines })
    toast.success(t("Excel workbook exported"))
  }

  const printProforma = () => {
    if (!selectedParty) {
      toast.error(t(`Choose a ${ledger === "receivables" ? "customer" : "supplier"} before printing the proforma.`))
      return
    }
    const opened = printFinanceProforma({
      typeLabel: t(documentLabels[type]),
      credit: type === "credit_note" || type === "debit_note",
      entityName: selectedEntity?.LegalEntity_Name ?? "",
      partyLabel: t(ledger === "receivables" ? "Customer" : "Supplier"),
      partyName: selectedParty.Org_Name,
      partyAccountCode: selectedParty.Org_AccCode,
      documentDate,
      dueDate,
      currencyCode,
      lines,
      taxPending,
      language,
      direction: pageDirection,
      translate: t,
    })
    if (!opened) toast.error(t("Allow pop-ups to print the proforma."))
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload: FinanceDraftInput = {
      type,
      legalEntityId: resolvedLegalEntityId,
      partyOrgId,
      documentDate,
      dueDate: dueDate || null,
      currencyCode,
      exchangeRate: needsExchangeRate ? Number(exchangeRate) : 1,
      sourceJobId: sourceKind === "job" ? sourceJobId : null,
      lines: lines.map((line) => ({ description: line.description.trim(), chargeCode: line.chargeCode.trim() || "ADHOC", jobCostingLineId: line.jobCostingLineId, lineType: line.lineType, quantity: Number(line.quantity), unitAmount: Number(line.unitAmount), taxRatePercent: Number(line.taxRatePercent), taxCode: line.taxCode || null })),
    }
    setSubmitting(true)
    try {
      await createFinanceDraft(payload)
      toast.success(t(taxPending || selectedEntity?.FinanceDraftCurrencyStatus !== "approved" ? `${documentLabels[type]} saved as an incomplete draft` : `${documentLabels[type]} draft created`))
      await onCreated()
      onClose()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("The finance draft could not be created."))
    } finally { setSubmitting(false) }
  }

  return <><Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose() }}><DialogContent className="max-h-[96vh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-[min(1440px,calc(100vw-2rem))]"><form onSubmit={submit}><DialogHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><DialogTitle>{t(`New ${documentLabels[type].toLowerCase()}`)}</DialogTitle><DialogDescription className="mt-1">{t(type === "credit_note" || type === "debit_note" ? "Enter positive line values. Multideck records the approved credit with the correct ledger polarity." : "Prepare a controlled draft for finance review. Approval posts it to the Multideck ledger; any configured mirror follows separately.")}</DialogDescription></div><span className="rounded-full bg-[var(--md-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("Draft")}</span></div></DialogHeader>{loading || !options ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : <div className="space-y-5 py-5">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2"><FieldLabel htmlFor="finance-document-entity">{t("Legal entity")}</FieldLabel><Select value={resolvedLegalEntityId} onValueChange={(value) => { const entity = options.legalEntities.find((item) => item.LegalEntity_ID === value); const direction = ledger === "receivables" ? "sales" : "purchase"; const treatment = options.taxTreatments.find((item) => item.FINLocTaxTreatment_LegalEntityID === value && ["both", direction].includes(item.FINLocTaxTreatment_TransactionType) && item.FINLocTaxTreatment_EffectiveFrom <= documentDate && (!item.FINLocTaxTreatment_EffectiveTo || item.FINLocTaxTreatment_EffectiveTo >= documentDate)); setLegalEntityId(value); setCurrencyCode((entity?.FinanceDraftCurrencyCode ?? "").toUpperCase()); setExchangeRate("1"); setSourceJobId(""); setLines((current) => current.map((line) => ({ ...line, taxCode: treatment?.FINLocTaxTreatment_Code ?? "", taxRatePercent: String(treatment?.FINLocTaxTreatment_RatePercent ?? 0) }))) }}><SelectTrigger id="finance-document-entity"><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{options.legalEntities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><FieldLabel htmlFor="finance-document-source">{t("Source")}</FieldLabel><Select value={sourceKind} onValueChange={(value: "manual" | "job") => { setSourceKind(value); if (value === "manual") setSourceJobId("") }}><SelectTrigger id="finance-document-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">{t("Ad hoc or ancillary")}</SelectItem><SelectItem value="job">{t("Freight job")}</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><FieldLabel htmlFor="finance-document-date">{t("Document date")}</FieldLabel><Input id="finance-document-date" type="date" value={documentDate} onChange={(event) => { const value = event.target.value; const direction = ledger === "receivables" ? "sales" : "purchase"; const treatment = options.taxTreatments.find((item) => item.FINLocTaxTreatment_LegalEntityID === resolvedLegalEntityId && ["both", direction].includes(item.FINLocTaxTreatment_TransactionType) && item.FINLocTaxTreatment_EffectiveFrom <= value && (!item.FINLocTaxTreatment_EffectiveTo || item.FINLocTaxTreatment_EffectiveTo >= value)); setDocumentDate(value); setLines((current) => current.map((line) => ({ ...line, taxCode: treatment?.FINLocTaxTreatment_Code ?? "", taxRatePercent: String(treatment?.FINLocTaxTreatment_RatePercent ?? 0) }))) }} data-i18n-skip dir="ltr" required /></div>
      <div className="space-y-2"><FieldLabel htmlFor="finance-document-due">{t("Due date")}</FieldLabel><Input id="finance-document-due" type="date" value={dueDate} min={documentDate} onChange={(event) => setDueDate(event.target.value)} data-i18n-skip dir="ltr" /></div>
    </div>
    {sourceKind === "job" ? <div className="space-y-2"><FieldLabel htmlFor="finance-document-job">{t("Job")}</FieldLabel><Select value={sourceJobId} onValueChange={(value) => { const job = availableJobs.find((item) => item.Job_ID === value); setSourceJobId(value); setLines((current) => current.map((line) => ({ ...line, jobCostingLineId: null }))); setPartyOrgId(ledger === "receivables" ? job?.Job_Customer ?? "" : job?.Job_Supplier ?? "") }}><SelectTrigger id="finance-document-job"><SelectValue placeholder={t("Choose job")} /></SelectTrigger><SelectContent>{availableJobs.map((job) => <SelectItem key={job.Job_ID} value={job.Job_ID}><span data-i18n-skip dir="ltr">{job.Job_Period}-{job.Job_Number}</span> · {t(job.Job_Status)}</SelectItem>)}</SelectContent></Select></div> : null}
    <div className={`grid gap-4 ${needsExchangeRate ? "md:grid-cols-[minmax(0,1fr)_140px_180px]" : "md:grid-cols-[minmax(0,1fr)_140px]"}`}><div className="space-y-2"><FieldLabel htmlFor="finance-document-party">{t(ledger === "receivables" ? "Customer" : "Supplier")}</FieldLabel><Select value={partyOrgId} onValueChange={setPartyOrgId}><SelectTrigger id="finance-document-party"><SelectValue placeholder={t(ledger === "receivables" ? "Choose customer" : "Choose supplier")} /></SelectTrigger><SelectContent>{options.parties.map((party) => <SelectItem key={party.Org_id} value={party.Org_id}>{party.Org_Name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><FieldLabel htmlFor="finance-document-currency">{t("Currency")}</FieldLabel><Input id="finance-document-currency" maxLength={3} value={currencyCode} onChange={(event) => { const value = event.target.value.toUpperCase(); setCurrencyCode(value); if (value === baseCurrencyCode) setExchangeRate("1") }} data-i18n-skip dir="ltr" required /></div>{needsExchangeRate ? <div className="space-y-2"><FieldLabel htmlFor="finance-document-exchange-rate">{t("Exchange rate to base currency")} <span data-i18n-skip dir="ltr">({baseCurrencyCode})</span></FieldLabel><Input id="finance-document-exchange-rate" type="number" min="0.0000000001" step="0.0000000001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} data-i18n-skip dir="ltr" required /></div> : null}</div>
    {providerCustomerMissing ? <Notice><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium"><span data-i18n-skip>{selectedParty?.Org_Name ?? t("This customer")}</span> {t("is not set up in")} <span data-i18n-skip>{providerName}</span></p><p className="mt-1">{t(providerWizardSupported ? "Set the customer up now, or keep this as a local draft and complete the provider setup later." : "This provider does not have an in-document customer setup wizard yet. Complete the mapping in Finance setup before review.")}</p></div>{providerWizardSupported ? <Button type="button" size="sm" variant="outline" onClick={() => setProviderWizardOpen(true)}>{t("Set up customer")}</Button> : null}</div></Notice> : null}
    {selectedEntity?.FinanceDraftCurrencyStatus === "pending_configuration" ? <Notice><div><p className="font-medium">{t("Currency review is awaiting approval")}</p><p className="mt-1">{t("A provisional currency came from an unapproved external-mirror review. You can save the draft, but an administrator must confirm the legal entity’s base currency in Finance setup before review.")}</p></div></Notice> : selectedEntity?.FinanceDraftCurrencyStatus === "missing" ? <Notice tone="danger"><div><p className="font-medium">{t("Draft currency is not available")}</p><p className="mt-1">{t("Set and approve the legal entity’s base currency in Finance setup before saving this draft.")}</p></div></Notice> : null}
    {!availableTaxTreatments.length ? <Notice><div><p className="font-medium">{t("Tax will remain pending")}</p><p className="mt-1">{t("You can save this as an incomplete draft now. It cannot enter finance review until local tax advice is confirmed and every line resolves to an approved effective treatment.")}</p></div></Notice> : null}
    <FinanceDocumentLineEditor
      lines={lines}
      onLinesChange={setLines}
      taxOptions={taxOptions}
      jobChargeOptions={jobChargeOptions}
      sourceKind={sourceKind}
      currencyCode={currencyCode}
      credit={type === "credit_note" || type === "debit_note"}
      disabled={submitting}
      onClear={clearDraft}
      onImport={importExcel}
      onExport={exportExcel}
      onPrint={printProforma}
    />
  </div>}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={submitting}>{t("Cancel")}</Button><Button type="submit" disabled={loading || submitting || !resolvedLegalEntityId || !partyOrgId || !currencyReady || (sourceKind === "job" && !sourceJobId) || (needsExchangeRate && Number(exchangeRate) <= 0)}>{submitting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck className="size-4" />}{t(taxPending || selectedEntity?.FinanceDraftCurrencyStatus !== "approved" ? "Save incomplete draft" : "Save draft")}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={providerPromptOpen} onOpenChange={setProviderPromptOpen}><DialogContent className="sm:max-w-[520px]"><DialogHeader><DialogTitle>{t("Customer not set up in accounts")}</DialogTitle><DialogDescription><span data-i18n-skip>{selectedParty?.Org_Name ?? t("This customer")}</span> {t("is not set up in")} <span data-i18n-skip>{providerName}</span>. {t("Do you want to add them now?")}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setProviderPromptOpen(false)}>{t("Not now")}</Button><Button type="button" onClick={() => { setProviderPromptOpen(false); setProviderWizardOpen(true) }}>{t("Set up customer")}</Button></DialogFooter></DialogContent></Dialog>
    <ProviderCustomerSetupWizard open={providerWizardOpen} connection={activeProviderConnection} organisation={selectedParty ?? null} onClose={() => setProviderWizardOpen(false)} onReady={() => { if (providerMappingKey) setReadyProviderKeys((current) => new Set(current).add(providerMappingKey)); setProviderWizardOpen(false) }} />
  </>
}

function CashDraftDialog({ type, options, loading, onClose, onCreated }: { type: FinanceCashType | null; options: FinanceDraftOptions | null; loading: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { language, t } = useLanguage()
  const [submitting, setSubmitting] = useState(false)
  const [legalEntityId, setLegalEntityId] = useState("")
  const [partyOrgId, setPartyOrgId] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [transactionDate, setTransactionDate] = useState(today())
  const [currencyCode, setCurrencyCode] = useState("GBP")
  const [exchangeRate, setExchangeRate] = useState("1")
  const [cashAmount, setCashAmount] = useState("")
  const [reference, setReference] = useState("")
  const [allocations, setAllocations] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!type || !options) return
    const first = options.legalEntities[0]
    setLegalEntityId(first?.LegalEntity_ID ?? "")
    setCurrencyCode((first?.LegalEntity_BaseCurrencyCodeSnapshot ?? "GBP").toUpperCase())
    setExchangeRate("1")
    setPartyOrgId("")
    setBankAccountId("")
    setTransactionDate(today())
    setCashAmount("")
    setReference("")
    setAllocations({})
  }, [options, type])

  if (!type) return null
  const resolvedLegalEntityId = legalEntityId || options?.legalEntities[0]?.LegalEntity_ID || ""
  const baseCurrencyCode = (options?.legalEntities.find((entity) => entity.LegalEntity_ID === resolvedLegalEntityId)?.LegalEntity_BaseCurrencyCodeSnapshot ?? "GBP").toUpperCase()
  const needsExchangeRate = currencyCode !== baseCurrencyCode
  const openDocuments = (options?.openDocuments ?? []).filter((document) => document.FINDoc_TypeCode === (type === "customer_receipt" ? "sl_invoice" : "pl_invoice") && document.FINDoc_LegalEntityID === resolvedLegalEntityId && (!partyOrgId || document.FINDoc_PartyOrgID === partyOrgId) && document.FINDoc_CurrencyCodeSnapshot === currencyCode)
  const allocated = Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const amount = Number(cashAmount) || 0
  const formatter = new Intl.NumberFormat(language, { style: "currency", currency: /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : "GBP" })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload: FinanceCashInput = { type, legalEntityId: resolvedLegalEntityId, partyOrgId, bankAccountId, transactionDate, currencyCode, exchangeRate: needsExchangeRate ? Number(exchangeRate) : 1, amount, reference: reference.trim() || null, allocations: Object.entries(allocations).filter(([, value]) => Number(value) > 0).map(([documentId, value]) => ({ documentId, amount: Number(value) })) }
    setSubmitting(true)
    try {
      await createFinanceCashDraft(payload)
      toast.success(t(`${cashLabels[type]} draft created`))
      await onCreated()
      onClose()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("The cash draft could not be created.")) } finally { setSubmitting(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose() }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[780px]"><form onSubmit={submit}><DialogHeader><DialogTitle>{t(`Record ${cashLabels[type].toLowerCase()}`)}</DialogTitle><DialogDescription>{t("Prepare the bank movement and exact allocations. Open balances change only after finance approval.")}</DialogDescription></DialogHeader>{loading || !options ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : <div className="space-y-5 py-5">
    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><FieldLabel htmlFor="finance-cash-entity">{t("Legal entity")}</FieldLabel><Select value={resolvedLegalEntityId} onValueChange={(value) => { const entity = options.legalEntities.find((item) => item.LegalEntity_ID === value); setLegalEntityId(value); setCurrencyCode((entity?.LegalEntity_BaseCurrencyCodeSnapshot ?? "GBP").toUpperCase()); setExchangeRate("1"); setBankAccountId(""); setAllocations({}) }}><SelectTrigger id="finance-cash-entity"><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{options.legalEntities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><FieldLabel htmlFor="finance-cash-party">{t(type === "customer_receipt" ? "Customer" : "Supplier")}</FieldLabel><Select value={partyOrgId} onValueChange={(value) => { setPartyOrgId(value); setAllocations({}) }}><SelectTrigger id="finance-cash-party"><SelectValue placeholder={t(type === "customer_receipt" ? "Choose customer" : "Choose supplier")} /></SelectTrigger><SelectContent>{options.parties.map((party) => <SelectItem key={party.Org_id} value={party.Org_id}>{party.Org_Name}</SelectItem>)}</SelectContent></Select></div></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2 xl:col-span-2"><FieldLabel htmlFor="finance-cash-bank">{t("Bank account")}</FieldLabel><Select value={bankAccountId} onValueChange={setBankAccountId}><SelectTrigger id="finance-cash-bank"><SelectValue placeholder={t("Choose bank account")} /></SelectTrigger><SelectContent>{options.bankAccounts.filter((bank) => bank.FINBank_LegalEntityID === resolvedLegalEntityId && bank.FINBank_CurrencyCode === currencyCode).map((bank) => <SelectItem key={bank.FINBank_ID} value={bank.FINBank_ID}>{bank.FINBank_Name} · {bank.FINBank_CurrencyCode}</SelectItem>)}</SelectContent></Select><p className="text-[12px] leading-5 text-[var(--md-subtle)]">{t("The bank account and its provider mapping must use this transaction currency before posting.")}</p></div><div className="space-y-2"><FieldLabel htmlFor="finance-cash-date">{t("Transaction date")}</FieldLabel><Input id="finance-cash-date" type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} data-i18n-skip dir="ltr" required /></div><div className="space-y-2"><FieldLabel htmlFor="finance-cash-currency">{t("Currency")}</FieldLabel><Input id="finance-cash-currency" maxLength={3} value={currencyCode} onChange={(event) => { const value = event.target.value.toUpperCase(); setCurrencyCode(value); if (value === baseCurrencyCode) setExchangeRate("1"); setBankAccountId(""); setAllocations({}) }} data-i18n-skip dir="ltr" required /></div></div>
    {needsExchangeRate ? <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><FieldLabel htmlFor="finance-cash-exchange-rate">{t("Exchange rate to base currency")} <span data-i18n-skip dir="ltr">({baseCurrencyCode})</span></FieldLabel><Input id="finance-cash-exchange-rate" type="number" min="0.0000000001" step="0.0000000001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} data-i18n-skip dir="ltr" required /></div></div> : null}
    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><FieldLabel htmlFor="finance-cash-amount">{t("Amount")}</FieldLabel><Input id="finance-cash-amount" type="number" min="0.01" step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} data-i18n-skip dir="ltr" required /></div><div className="space-y-2"><FieldLabel htmlFor="finance-cash-reference">{t("Bank reference")}</FieldLabel><Input id="finance-cash-reference" value={reference} onChange={(event) => setReference(event.target.value)} data-i18n-skip dir="ltr" /></div></div>
    <div><div className="mb-3"><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Open document allocations")}</p><p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Leave the balance unallocated when the remittance is not yet clear.")}</p></div>{!partyOrgId ? <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 text-[13px] text-[var(--md-subtle)]">{t("Choose a party to see open documents.")}</div> : openDocuments.length ? <div className="divide-y divide-[var(--md-line)] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4">{openDocuments.map((document) => <div key={document.FINDoc_ID} className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_120px_150px]"><div><p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{document.FINDoc_Number}</p><p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{document.FINDoc_DueDate ? `${t("Due")} ${new Intl.DateTimeFormat(language).format(new Date(`${document.FINDoc_DueDate}T00:00:00`))}` : t("No due date")}</p></div><p className="text-end text-[13px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{formatter.format(Number(document.FINDoc_OutstandingAmount))}</p><Input aria-label={t("Allocation amount")} type="number" min="0" max={Number(document.FINDoc_OutstandingAmount)} step="0.01" value={allocations[document.FINDoc_ID] ?? ""} onChange={(event) => setAllocations((current) => ({ ...current, [document.FINDoc_ID]: event.target.value }))} data-i18n-skip dir="ltr" /></div>)}</div> : <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 text-[13px] text-[var(--md-subtle)]">{t("No approved open documents match this party, legal entity and currency.")}</div>}</div>
    <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-[13px]"><span>{t("Allocated")} <strong data-i18n-skip dir="ltr">{formatter.format(allocated)}</strong></span><span className={allocated > amount ? "text-[var(--md-red)]" : "text-[var(--md-ink)]"}>{t("Unallocated")} <strong data-i18n-skip dir="ltr">{formatter.format(amount - allocated)}</strong></span></div>
  </div>}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={submitting}>{t("Cancel")}</Button><Button type="submit" disabled={loading || submitting || !resolvedLegalEntityId || !partyOrgId || !bankAccountId || amount <= 0 || allocated > amount || (needsExchangeRate && Number(exchangeRate) <= 0)}>{submitting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck className="size-4" />}{t("Create draft")}</Button></DialogFooter></form></DialogContent></Dialog>
}

function LedgerPage({ route, currentUser, navigate }: { route: FinanceLedgerRoute; currentUser?: AuthUserSummary | null; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const routeConfig = financeLedgerRouteConfig[route]
  const routeLedger = routeConfig.ledger
  const [mode, setMode] = useState<RegisterMode>(routeConfig.initialMode)
  const [documents, setDocuments] = useState<FinanceDocument[]>([])
  const [cash, setCash] = useState<FinanceCashTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [revalidating, setRevalidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [creationType, setCreationType] = useState<CreationType | null>(null)
  const [options, setOptions] = useState<FinanceDraftOptions | null>(null)
  const [optionsLedger, setOptionsLedger] = useState<FinanceLedger | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  useEffect(() => { setMode(routeConfig.initialMode); setSearch(""); setStatus("") }, [routeConfig.initialMode, route])
  const load = useCallback(async (quiet = false) => {
    quiet ? setRevalidating(true) : setLoading(true)
    setError(null)
    try {
      if (routeLedger) {
        const [documentResult, cashResult] = await Promise.all([getFinanceDocuments(routeLedger), getFinanceCash(routeLedger)])
        setDocuments(documentResult.documents)
        setCash(cashResult.cashTransactions)
      } else {
        const [receivables, payables, cashResult] = await Promise.all([getFinanceDocuments("receivables"), getFinanceDocuments("payables"), getFinanceCash()])
        setDocuments([...receivables.documents, ...payables.documents])
        setCash(cashResult.cashTransactions)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Finance records could not be loaded.") } finally { setLoading(false); setRevalidating(false) }
  }, [routeLedger])
  useEffect(() => { void load() }, [load])

  const openCreation = useCallback(async (type: CreationType) => {
    const targetLedger: FinanceLedger = type === "sl_invoice" || type === "credit_note" || type === "customer_receipt" ? "receivables" : "payables"
    setCreationType(type)
    if (options && optionsLedger === targetLedger) return
    setOptionsLoading(true)
    try { setOptions(await getFinanceDraftOptions(targetLedger)); setOptionsLedger(targetLedger) } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("Finance options could not be loaded.")); setCreationType(null) } finally { setOptionsLoading(false) }
  }, [options, optionsLedger, t])

  useEffect(() => {
    const subscriptions = [
      subscribeTopBarAction(topBarActionEvents.createSalesInvoice, () => void openCreation("sl_invoice")),
      subscribeTopBarAction(topBarActionEvents.createCustomerCredit, () => void openCreation("credit_note")),
      subscribeTopBarAction(topBarActionEvents.createPurchaseInvoice, () => void openCreation("pl_invoice")),
      subscribeTopBarAction(topBarActionEvents.createSupplierDebit, () => void openCreation("debit_note")),
      subscribeTopBarAction(topBarActionEvents.recordCustomerReceipt, () => void openCreation("customer_receipt")),
      subscribeTopBarAction(topBarActionEvents.recordSupplierPayment, () => void openCreation("supplier_payment")),
    ]
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [openCreation])

  const act = useCallback(async (id: string, action: () => Promise<unknown>, success: string) => {
    setPendingAction(id)
    try { await action(); toast.success(t(success)); await load(true) } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("The finance action could not be completed.")) } finally { setPendingAction(null) }
  }, [load, t])
  const currencyFormatters = useMemo(() => new Map<string, Intl.NumberFormat>(), [language])
  const formatCurrency = useCallback((currency: string, amount: number) => {
    let formatter = currencyFormatters.get(currency)
    if (!formatter) {
      formatter = new Intl.NumberFormat(language, { style: "currency", currency })
      currencyFormatters.set(currency, formatter)
    }
    return formatter.format(amount)
  }, [currencyFormatters, language])
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language), [language])
  const normalizedSearch = search.trim().toLowerCase()
  const scopedDocuments = documents.filter((document) => {
    if (routeConfig.scope === "approvals") return document.FINDoc_StatusCode === "awaiting_approval"
    if (routeConfig.scope === "credit_control") return ["approved", "submitted"].includes(document.FINDoc_StatusCode) && Number(document.FINDoc_OutstandingAmount) > 0 && Boolean(document.FINDoc_DueDate && document.FINDoc_DueDate < today())
    return true
  })
  const scopedCash = cash.filter((item) => routeConfig.scope !== "reconciliation" || Number(item.FINCash_UnallocatedAmount) > 0 || ["blocked", "failed"].includes(item.FINCash_ExportStatusCode))
  const filteredDocuments = scopedDocuments.filter((document) => (!normalizedSearch || [document.FINDoc_Number, document.partyName, document.jobReference, document.FINDoc_TypeCode].some((value) => value?.toLowerCase().includes(normalizedSearch))) && (!status || document.FINDoc_StatusCode === status))
  const filteredCash = scopedCash.filter((item) => (!normalizedSearch || [item.FINCash_Number, item.partyName, item.FINCash_Reference, item.FINCash_TypeCode].some((value) => value?.toLowerCase().includes(normalizedSearch))) && (!status || item.FINCash_StatusCode === status))
  const canApprove = hasPermission(currentUser, "Finance.ReviewAndPost")
  const openDocument = useCallback((document: FinanceDocument) => {
    const documentLedger = document.FINDoc_TypeCode === "sl_invoice" || document.FINDoc_TypeCode === "credit_note" ? "receivables" : "payables"
    navigate(`/finance/${documentLedger}/documents/${document.FINDoc_ID}`)
  }, [navigate])
  const documentColumns = useMemo<DataTableColumn<FinanceDocument>[]>(() => [
    { id: "number", label: "Reference", kind: "identity", width: 130, cell: (row) => <button type="button" className="group block text-start" onClick={() => openDocument(row)}><span className="font-medium text-[var(--md-ink)] underline-offset-2 group-hover:text-[var(--md-accent)] group-hover:underline" data-i18n-skip dir="ltr">{row.FINDoc_Number ?? "—"}</span><span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{t(documentLabels[row.FINDoc_TypeCode])}</span></button>, sortValue: (row) => row.FINDoc_Number },
    { id: "party", label: routeLedger === "payables" ? "Supplier" : routeLedger === "receivables" ? "Customer" : "Party", kind: "text", minWidth: 180, cell: (row) => row.partyName, sortValue: (row) => row.partyName },
    { id: "source", label: "Source", kind: "attribute", width: 130, cell: (row) => row.jobReference ? <span data-i18n-skip dir="ltr">{row.jobReference}</span> : t("Ad hoc"), sortValue: (row) => row.jobReference ?? "Ad hoc" },
    { id: "date", label: "Date", kind: "date", width: 115, cell: (row) => <span data-i18n-skip dir="ltr">{dateFormatter.format(new Date(`${row.FINDoc_DocumentDate}T00:00:00`))}</span>, sortValue: (row) => row.FINDoc_DocumentDate },
    { id: "due", label: "Due", kind: "date", width: 115, cell: (row) => row.FINDoc_DueDate ? <span data-i18n-skip dir="ltr">{dateFormatter.format(new Date(`${row.FINDoc_DueDate}T00:00:00`))}</span> : "—", sortValue: (row) => row.FINDoc_DueDate },
    { id: "gross", label: "Gross", kind: "number", width: 120, cell: (row) => <div><span data-i18n-skip dir="ltr" className="tabular-nums">{formatCurrency(row.FINDoc_CurrencyCodeSnapshot, Number(row.FINDoc_GrossAmount))}</span>{row.FINDoc_TaxStatus === "pending" ? <p className="mt-0.5 text-[11px] text-[var(--md-amber)]">{t("Tax pending")}</p> : null}</div>, sortValue: (row) => Number(row.FINDoc_GrossAmount) },
    { id: "outstanding", label: "Outstanding", kind: "number", width: 130, cell: (row) => <span data-i18n-skip dir="ltr" className="tabular-nums">{formatCurrency(row.FINDoc_CurrencyCodeSnapshot, Number(row.FINDoc_OutstandingAmount))}</span>, sortValue: (row) => Number(row.FINDoc_OutstandingAmount) },
    { id: "status", label: "Status", kind: "status", width: 145, cell: (row) => <StatusPill tone={statusTone(row.FINDoc_StatusCode)}>{t(row.FINDoc_StatusCode.replaceAll("_", " "))}</StatusPill>, sortValue: (row) => row.FINDoc_StatusCode },
    { id: "ledger", label: "Ledger", kind: "status", width: 130, cell: (row) => <StatusPill tone={statusTone(row.FINDoc_NativePostingStatusCode)}>{t(row.FINDoc_NativePostingStatusCode.replaceAll("_", " "))}</StatusPill>, sortValue: (row) => row.FINDoc_NativePostingStatusCode },
    { id: "mirror", label: "Mirror", kind: "status", width: 130, cell: (row) => <StatusPill tone={statusTone(row.FINDoc_ExportStatusCode)}>{t(row.FINDoc_ExportStatusCode.replaceAll("_", " "))}</StatusPill>, sortValue: (row) => row.FINDoc_ExportStatusCode },
    { id: "actions", label: "Actions", kind: "actions", width: 150, canHide: false, canPin: false, exportable: false, cell: (row) => ["blocked", "failed"].includes(row.FINDoc_ExportStatusCode) ? <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openDocument(row) }}><AlertCircle />{t("Resolve")}</Button> : row.FINDoc_StatusCode === "draft" ? <Button type="button" variant="outline" size="sm" disabled={pendingAction === row.FINDoc_ID} onClick={(event) => { event.stopPropagation(); void act(row.FINDoc_ID, () => requestFinanceDocumentReview(row.FINDoc_ID), "Sent for finance review") }}>{pendingAction === row.FINDoc_ID ? <LoaderCircle className="animate-spin" /> : null}{t("Send for review")}</Button> : row.FINDoc_StatusCode === "awaiting_approval" && canApprove ? <Button type="button" size="sm" disabled={pendingAction === row.FINDoc_ID} onClick={(event) => { event.stopPropagation(); void act(row.FINDoc_ID, () => approveFinanceDocument(row.FINDoc_ID), "Finance document posted; external mirror checked") }}>{pendingAction === row.FINDoc_ID ? <LoaderCircle className="animate-spin" /> : null}{t("Approve")}</Button> : null },
  ], [act, canApprove, dateFormatter, formatCurrency, openDocument, pendingAction, routeLedger, t])
  const cashColumns = useMemo<DataTableColumn<FinanceCashTransaction>[]>(() => [
    { id: "number", label: "Reference", kind: "identity", width: 140, cell: (row) => <div><p className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{row.FINCash_Number ?? "—"}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t(cashLabels[row.FINCash_TypeCode])}</p></div>, sortValue: (row) => row.FINCash_Number },
    { id: "party", label: "Party", kind: "text", minWidth: 190, cell: (row) => row.partyName, sortValue: (row) => row.partyName },
    { id: "bankReference", label: "Bank reference", kind: "text", minWidth: 150, cell: (row) => <span data-i18n-skip dir="ltr">{row.FINCash_Reference || "—"}</span>, sortValue: (row) => row.FINCash_Reference },
    { id: "date", label: "Date", kind: "date", width: 120, cell: (row) => <span data-i18n-skip dir="ltr">{dateFormatter.format(new Date(`${row.FINCash_TransactionDate}T00:00:00`))}</span>, sortValue: (row) => row.FINCash_TransactionDate },
    { id: "amount", label: "Amount", kind: "number", width: 125, cell: (row) => <span data-i18n-skip dir="ltr" className="tabular-nums">{formatCurrency(row.FINCash_CurrencyCodeSnapshot, Number(row.FINCash_Amount))}</span>, sortValue: (row) => Number(row.FINCash_Amount) },
    { id: "unallocated", label: "Unallocated", kind: "number", width: 130, cell: (row) => <span data-i18n-skip dir="ltr" className="tabular-nums">{formatCurrency(row.FINCash_CurrencyCodeSnapshot, Number(row.FINCash_UnallocatedAmount))}</span>, sortValue: (row) => Number(row.FINCash_UnallocatedAmount) },
    { id: "status", label: "Status", kind: "status", width: 145, cell: (row) => <StatusPill tone={statusTone(row.FINCash_StatusCode)}>{t(row.FINCash_StatusCode.replaceAll("_", " "))}</StatusPill>, sortValue: (row) => row.FINCash_StatusCode },
    { id: "ledger", label: "Ledger", kind: "status", width: 130, cell: (row) => <StatusPill tone={statusTone(row.FINCash_NativePostingStatusCode)}>{t(row.FINCash_NativePostingStatusCode.replaceAll("_", " "))}</StatusPill>, sortValue: (row) => row.FINCash_NativePostingStatusCode },
    { id: "mirror", label: "Mirror", kind: "status", width: 130, cell: (row) => <StatusPill tone={statusTone(row.FINCash_ExportStatusCode)}>{t(row.FINCash_ExportStatusCode.replaceAll("_", " "))}</StatusPill>, sortValue: (row) => row.FINCash_ExportStatusCode },
    { id: "actions", label: "Actions", kind: "actions", width: 150, canHide: false, canPin: false, exportable: false, cell: (row) => row.FINCash_StatusCode === "draft" ? <Button type="button" variant="outline" size="sm" disabled={pendingAction === row.FINCash_ID} onClick={(event) => { event.stopPropagation(); void act(row.FINCash_ID, () => requestFinanceCashReview(row.FINCash_ID), "Sent for finance review") }}>{pendingAction === row.FINCash_ID ? <LoaderCircle className="animate-spin" /> : null}{t("Send for review")}</Button> : row.FINCash_StatusCode === "awaiting_approval" && canApprove ? <Button type="button" size="sm" disabled={pendingAction === row.FINCash_ID} onClick={(event) => { event.stopPropagation(); void act(row.FINCash_ID, () => approveFinanceCash(row.FINCash_ID), "Cash entry allocated and posted; external mirror checked") }}>{pendingAction === row.FINCash_ID ? <LoaderCircle className="animate-spin" /> : null}{t("Approve")}</Button> : null },
  ], [act, canApprove, dateFormatter, formatCurrency, pendingAction, t])

  const { title, description } = routeConfig
  const statuses = [...new Set((mode === "documents" ? scopedDocuments.map((item) => item.FINDoc_StatusCode) : scopedCash.map((item) => item.FINCash_StatusCode)))].sort().map((value) => ({ value, label: value.replaceAll("_", " ") }))
  const currencyTotals = new Map<string, number>()
  documents.filter((item) => ["approved", "submitted"].includes(item.FINDoc_StatusCode)).forEach((item) => currencyTotals.set(item.FINDoc_CurrencyCodeSnapshot, (currencyTotals.get(item.FINDoc_CurrencyCodeSnapshot) ?? 0) + Number(item.FINDoc_OutstandingAmount)))
  const outstanding = [...currencyTotals.entries()].map(([currency, value]) => formatCurrency(currency, value)).join(" · ") || formatCurrency("GBP", 0)
  const unallocatedCashTotals = new Map<string, number>()
  cash.filter((item) => ["approved", "submitted"].includes(item.FINCash_StatusCode)).forEach((item) => unallocatedCashTotals.set(item.FINCash_CurrencyCodeSnapshot, (unallocatedCashTotals.get(item.FINCash_CurrencyCodeSnapshot) ?? 0) + Number(item.FINCash_UnallocatedAmount)))
  const unallocatedCash = [...unallocatedCashTotals.entries()].map(([currency, value]) => formatCurrency(currency, value)).join(" · ") || formatCurrency("GBP", 0)
  const nativeLedgerUpdateRequired = documents.some((item) => item.FINDoc_NativePostingStatusCode === "update_required")
    || cash.some((item) => item.FINCash_NativePostingStatusCode === "update_required")
  const kpis: DashboardKpi[] = [
    { label: routeLedger === "payables" ? "Open supplier balance" : routeLedger === "receivables" ? "Open customer balance" : "Open ledger balance", value: outstanding, detail: "Approved and submitted records", tone: "neutral", icon: ReceiptText },
    { label: "Awaiting approval", value: String(documents.filter((item) => item.FINDoc_StatusCode === "awaiting_approval").length + cash.filter((item) => item.FINCash_StatusCode === "awaiting_approval").length), detail: "Finance review queue", tone: "amber", icon: ShieldCheck },
    { label: "Unallocated cash", value: unallocatedCash, detail: "Receipts and payments", tone: "blue", icon: Wallet },
    { label: "Mirror attention", value: String(documents.filter((item) => ["blocked", "failed"].includes(item.FINDoc_ExportStatusCode)).length + cash.filter((item) => ["blocked", "failed"].includes(item.FINCash_ExportStatusCode)).length), detail: "Mapping or export exceptions", tone: "red", icon: AlertCircle },
  ]

  const toolbarTabs = routeLedger && !routeConfig.focused ? <RegisterViewSwitch options={["documents", "cash"] as const} value={mode} onChange={(value) => { setMode(value); setStatus("") }} counts={{ documents: documents.length, cash: cash.length }} ariaLabel={t("Finance register view")} /> : undefined
  const toolbarSearch = <RegisterSearchField value={search} onChange={setSearch} onClear={() => setSearch("")} label={t("Search finance register")} placeholder={t("Reference, party or job…")} />
  const toolbarFilters = <RegisterFacetSelect label={t("Status")} allLabel={t("All statuses")} value={status} options={statuses} onChange={setStatus} />
  const toolbarOptions = <RegisterRefreshButton pending={revalidating} onRefresh={() => void load(true)} />
  const emptyState = <div className="grid min-h-48 place-items-center px-6 py-10 text-center"><div><ReceiptText className="mx-auto size-6 text-[var(--md-subtle)]" strokeWidth={1.3} /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(mode === "documents" ? "No finance documents yet" : "No receipts or payments yet")}</p><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("Use the contextual New action to prepare the first reviewed draft.")}</p></div></div>

  return <><SettingsPageHeader title={t(title)} description={t(description)} icon={routeConfig.initialMode === "cash" ? Wallet : ChartNoAxesCombined} actions={<Button type="button" variant="outline" onClick={() => navigate("/finance/administration")}>{t("Finance setup")}</Button>} /><div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">{error ? <Notice tone="danger">{error}</Notice> : null}{nativeLedgerUpdateRequired ? <Notice tone="danger"><div><p className="font-medium">{t("Native ledger update required")}</p><p className="mt-1">{t("These records came from an older finance service. They remain visible, but native posting status and financial reports must not be relied on until the latest finance migration and Edge Function are deployed.")}</p></div></Notice> : null}<div className="md-kpi-scope"><KpiStrip kpis={kpis.map((item) => ({ ...item, label: t(item.label), detail: t(item.detail) }))} density="compact" spark={false} /></div>{loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : mode === "documents" ? <DataTable clientPagination columns={documentColumns} rows={filteredDocuments} getRowKey={(row) => row.FINDoc_ID} storageKey={`finance-${route}-documents`} ariaLabel={t(`${title} register`)} minimumWidth={1310} toolbarTabs={toolbarTabs} toolbarSearch={toolbarSearch} toolbarFilters={toolbarFilters} toolbarOptions={toolbarOptions} emptyState={emptyState} /> : <DataTable clientPagination columns={cashColumns} rows={filteredCash} getRowKey={(row) => row.FINCash_ID} storageKey={`finance-${route}-cash`} ariaLabel={t(`${title} register`)} minimumWidth={1110} toolbarTabs={toolbarTabs} toolbarSearch={toolbarSearch} toolbarFilters={toolbarFilters} toolbarOptions={toolbarOptions} emptyState={emptyState} />}</div><DocumentDraftDialog type={creationType && ["sl_invoice", "credit_note", "pl_invoice", "debit_note"].includes(creationType) ? creationType as FinanceDocumentType : null} options={options} loading={optionsLoading} onClose={() => setCreationType(null)} onCreated={async () => { await load(true) }} /><CashDraftDialog type={creationType === "customer_receipt" || creationType === "supplier_payment" ? creationType : null} options={options} loading={optionsLoading} onClose={() => setCreationType(null)} onCreated={async () => { await load(true) }} /></>
}

function FinanceSetupPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [setup, setSetup] = useState<FinanceSetup | null>(null)
  const [companies, setCompanies] = useState<Array<{ name: string; company_name?: string; country?: string; default_currency?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FinanceConfigurationInput>({ legalEntityId: "", chartTemplateCode: "freight-forwarder-v1", providerCode: "erpnext", externalCompany: "", countryCode: "", taxRegistrationNo: "", reportingBasisCode: "accrual", effectiveFrom: today() })
  const [latestPreview, setLatestPreview] = useState<FinanceConfigurationPreview | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const result = await getFinanceSetup(); setSetup(result)
      const defaultLegalEntityId = result.legalEntities[0]?.LegalEntity_ID ?? ""
      if (result.erpNext.configured) {
        const response = await getErpNextCompanies(); setCompanies(response.companies)
        setForm((current) => ({ ...current, legalEntityId: current.legalEntityId || defaultLegalEntityId }))
      } else { setCompanies([]); setForm((current) => ({ ...current, legalEntityId: current.legalEntityId || defaultLegalEntityId })) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Finance setup could not be loaded.") } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const selectedProvider = setup?.providers?.find((provider) => provider.code === form.providerCode)
  const selectedTemplate = setup?.chartTemplates?.find((template) => template.FINChartTemplate_Code === form.chartTemplateCode)
  const selectedEntity = setup?.legalEntities.find((entity) => entity.LegalEntity_ID === form.legalEntityId)
  const selectedCompany = companies.find((company) => company.name === form.externalCompany)
  const entityCurrency = selectedEntity?.LegalEntity_BaseCurrencyCodeSnapshot?.toUpperCase() ?? ""
  const providerCurrency = selectedCompany?.default_currency?.toUpperCase() ?? ""
  const entityCurrencyValid = /^[A-Z]{3}$/.test(entityCurrency)
  const companyCurrencyReady = Boolean(form.externalCompany && /^[A-Z]{3}$/.test(providerCurrency) && (!entityCurrencyValid || providerCurrency === entityCurrency))
  const companyCurrencyWillInitialise = companyCurrencyReady && !entityCurrencyValid
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true)
    try { const result = await createFinanceConfigurationRun(form); setLatestPreview(result.FINConfigRun_PreviewJSON); toast.success(t("Finance configuration is ready for review.")); await load() } catch (cause) { toast.error(cause instanceof FinanceSubledgerApiError ? cause.message : t("Finance configuration could not be prepared.")) } finally { setSubmitting(false) }
  }
  const approve = async (id: string) => {
    setApproving(id)
    try { await approveFinanceConfigurationRun(id); toast.success(t("Finance configuration approved.")); await load() } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("Finance configuration could not be approved.")) } finally { setApproving(null) }
  }
  const retryDelivery = async (id: string) => {
    setRetrying(id)
    try { await processFinanceIntegrationQueue(id); toast.success(t("Provider delivery completed.")); await load() } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("Provider delivery could not be completed.")); await load() } finally { setRetrying(null) }
  }
      return <><SettingsPageHeader title={t("Finance setup")} description={t("Configure an optional reviewed external accounting mirror for a legal entity. Mirror credentials remain in tenant Edge secrets and never reach the browser.")} icon={Landmark} actions={<div className="flex gap-2"><Button type="button" variant="outline" onClick={() => navigate("/finance/receivables")}>{t("Open sales ledger")}</Button><Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} />{t("Refresh")}</Button></div>} /><div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">{error ? <Notice tone="danger">{error}</Notice> : null}{setup && !setup.compatibility.current ? <Notice tone="danger"><div><p className="font-medium">{t("Finance service update required")}</p><p className="mt-1">{t("Finance Setup received an older finance service response. Deploy the latest finance-subledger Edge Function and finance migrations, then reload this page.")}</p></div></Notice> : null}{!loading && setup ? <><Notice><div><p className="font-medium text-[var(--md-ink)]">{t("Multideck-owned ledger with optional mirrors")}</p><p className="mt-1">{t("The Multideck ledger works without a provider. ERPNext is the first enabled mirror adapter; every other package remains visible but unavailable until its connector passes tenant, permission, retry and reconciliation checks.")}</p></div></Notice><form className="space-y-[var(--md-page-stack-gap)]" onSubmit={submit}><SettingsPanel title={t("Finance foundation")} description={t("Choose the legal entity and controlled chart used by the native ledger and any external mirror mappings.")}><div className="grid gap-4 py-1 md:grid-cols-2"><div className="space-y-2"><FieldLabel htmlFor="finance-entity">{t("Legal entity")}</FieldLabel><Select value={form.legalEntityId} onValueChange={(legalEntityId) => setForm((current) => ({ ...current, legalEntityId, externalCompany: "" }))}><SelectTrigger id="finance-entity"><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{setup.legalEntities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><FieldLabel htmlFor="finance-chart">{t("Chart template")}</FieldLabel><Select value={form.chartTemplateCode} onValueChange={(chartTemplateCode) => setForm((current) => ({ ...current, chartTemplateCode }))}><SelectTrigger id="finance-chart"><SelectValue /></SelectTrigger><SelectContent>{setup.chartTemplates.map((template) => <SelectItem key={template.FINChartTemplate_Code} value={template.FINChartTemplate_Code}>{template.FINChartTemplate_Name}</SelectItem>)}</SelectContent></Select>{selectedTemplate?.FINChartTemplate_Description ? <p className="text-[12px] leading-5 text-[var(--md-subtle)]">{selectedTemplate.FINChartTemplate_Description}</p> : null}</div></div></SettingsPanel><SettingsPanel title={t("External accounting mirror")} description={t("Unavailable adapters are visible so the integration boundary stays honest; they cannot be provisioned or selected as a fallback.")}><div className="grid gap-4 py-1 md:grid-cols-2"><div className="space-y-2"><FieldLabel htmlFor="finance-provider">{t("Provider")}</FieldLabel><Select value={form.providerCode} onValueChange={(providerCode: AccountingProviderCode) => setForm((current) => ({ ...current, providerCode, externalCompany: "" }))}><SelectTrigger id="finance-provider"><SelectValue /></SelectTrigger><SelectContent>{setup.providers.map((provider) => <SelectItem key={provider.code} value={provider.code}>{provider.name}{provider.enabled ? "" : ` — ${t("planned")}`}</SelectItem>)}</SelectContent></Select>{selectedProvider?.unavailableReason ? <p className="text-[12px] leading-5 text-[var(--md-subtle)]">{t(selectedProvider.unavailableReason)}</p> : null}</div><div className="space-y-2"><FieldLabel htmlFor="finance-company">{t("Accounting company")}</FieldLabel>{form.providerCode === "erpnext" ? <Select value={form.externalCompany} onValueChange={(externalCompany) => { const company = companies.find((candidate) => candidate.name === externalCompany); setForm((current) => ({ ...current, externalCompany, countryCode: current.countryCode || (/^[A-Z]{2}$/i.test(company?.country ?? "") ? company?.country?.toUpperCase() ?? "" : "") })) }} disabled={!setup.erpNext.configured}><SelectTrigger id="finance-company"><SelectValue placeholder={setup.erpNext.configured ? t("Choose ERPNext company") : t("ERPNext is not configured")} /></SelectTrigger><SelectContent>{companies.map((company) => <SelectItem key={company.name} value={company.name}>{company.company_name || company.name}</SelectItem>)}</SelectContent></Select> : <Input id="finance-company" disabled value="" placeholder={t("Connector not enabled yet")} />}{form.externalCompany ? <p className={`text-[12px] leading-5 ${companyCurrencyReady ? "text-[var(--md-subtle)]" : "text-[var(--md-red)]"}`}>{companyCurrencyWillInitialise ? t("This reviewed setup will initialise the legal entity base currency from the accounting Company.") : companyCurrencyReady ? t("Provider and legal-entity base currencies match.") : t("The accounting Company must have the same valid base currency as this legal entity.")}</p> : null}</div></div></SettingsPanel><SettingsPanel title={t("VAT & tax localisation")} description={t("Country-specific treatments must be reviewed by qualified finance advisers before they are used on documents.")}><div className="grid gap-4 py-1 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><FieldLabel htmlFor="finance-country">{t("Country code")}</FieldLabel><Input id="finance-country" maxLength={2} value={form.countryCode} onChange={(event) => setForm((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} placeholder="GB" data-i18n-skip dir="ltr" required /></div><div className="space-y-2"><FieldLabel htmlFor="finance-tax-number">{t("Tax registration")}</FieldLabel><Input id="finance-tax-number" value={form.taxRegistrationNo} onChange={(event) => setForm((current) => ({ ...current, taxRegistrationNo: event.target.value }))} data-i18n-skip dir="ltr" /></div><div className="space-y-2"><FieldLabel htmlFor="finance-basis">{t("Reporting basis")}</FieldLabel><Select value={form.reportingBasisCode || "accrual"} onValueChange={(reportingBasisCode) => setForm((current) => ({ ...current, reportingBasisCode }))}><SelectTrigger id="finance-basis"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accrual">{t("Accrual")}</SelectItem><SelectItem value="cash">{t("Cash")}</SelectItem></SelectContent></Select></div><div className="space-y-2"><FieldLabel htmlFor="finance-effective">{t("Effective from")}</FieldLabel><Input id="finance-effective" type="date" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} data-i18n-skip dir="ltr" required /></div></div></SettingsPanel><div className="flex justify-end"><Button type="submit" disabled={submitting || !setup.compatibility.current || !selectedProvider?.enabled || !selectedProvider.configured || !form.externalCompany || !form.legalEntityId || (form.providerCode === "erpnext" && !companyCurrencyReady)}>{submitting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}{t("Prepare mirror review")}</Button></div></form>{latestPreview ? <SettingsPanel title={t("Prepared review")} description={t("Control accounts and tax treatments remain review evidence; approval registers the connection but does not overwrite provider records.")}><div className="grid gap-4 py-1 lg:grid-cols-2"><div><p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Control chart")}</p><div className="mt-2 space-y-1">{latestPreview.accounts.filter((account) => account.FINChartTemplateAccount_IsControlAccount).map((account) => <p key={account.FINChartTemplateAccount_Code} className="text-[13px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{account.FINChartTemplateAccount_Code} · {account.FINChartTemplateAccount_Name}</p>)}</div></div><div><p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Tax treatments")}</p><div className="mt-2 space-y-1">{latestPreview.treatments.map((treatment) => <p key={`${treatment.FINLocTaxTreatment_Code}-${treatment.FINLocTaxTreatment_TransactionType}`} className="text-[13px] text-[var(--md-text)]">{treatment.FINLocTaxTreatment_Name} · {treatment.FINLocTaxTreatment_TransactionType}</p>)}</div></div></div></SettingsPanel> : null}{setup.integrationQueue.length ? <SettingsPanel title={t("Mirror delivery attention")} description={t("Blocked mappings and provider failures stay visible here. Retry only after the named configuration issue has been corrected.")}><div className="divide-y divide-[var(--md-line)]">{setup.integrationQueue.map((item) => <div key={item.FINIntQ_ID} className="flex flex-wrap items-start justify-between gap-4 py-3 text-[13px]"><div className="min-w-0 flex-1"><p className="font-medium text-[var(--md-ink)]">{t(financeRecordLabel(item.typeCode))} · <span data-i18n-skip dir="ltr">{item.localNumber}</span></p><p className="mt-1 break-words text-[12px] leading-5 text-[var(--md-subtle)]">{t(item.FINIntQ_LastError || "Provider delivery is waiting.")}</p></div><div className="flex items-center gap-2"><StatusPill tone={statusTone(item.FINIntQ_StatusCode)}>{t(item.FINIntQ_StatusCode.replaceAll("_", " "))}</StatusPill>{item.retryAvailable ? <Button type="button" size="sm" variant="outline" disabled={retrying === item.FINIntQ_ID} onClick={() => void retryDelivery(item.FINIntQ_ID)}>{retrying === item.FINIntQ_ID ? <LoaderCircle className="animate-spin" /> : <RefreshCw className="size-4" />}{t("Retry delivery")}</Button> : null}</div></div>)}</div></SettingsPanel> : null}{setup.runs.length ? <SettingsPanel title={t("Configuration history")} description={t("Every mirror proposal and approval is retained with its connection evidence.")}><div className="divide-y divide-[var(--md-line)]">{setup.runs.map((run) => <div key={run.FINConfigRun_ID} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]"><div><p className="font-medium text-[var(--md-ink)]">{run.FINChartTemplate?.FINChartTemplate_Name ?? t("Finance configuration")}</p><p className="mt-0.5 text-[var(--md-subtle)]">{run.FINConfigRun_ProviderCode} · {t("External accounting company")} · <span data-i18n-skip dir="ltr">{run.FINConfigRun_CountryCode}</span></p>{run.approvalBlocker === "invalid_country_code" ? <p className="mt-1 text-[12px] leading-5 text-[var(--md-red)]">{t("This older setup review uses an invalid country code. Prepare a corrected review before approval.")}</p> : null}</div><div className="flex items-center gap-2"><StatusPill tone={statusTone(run.FINConfigRun_StatusCode)}>{t(run.approvalBlocker ? "needs corrected review" : run.FINConfigRun_StatusCode.replaceAll("_", " "))}</StatusPill>{run.FINConfigRun_StatusCode === "awaiting_approval" && !run.approvalBlocker ? <Button type="button" size="sm" disabled={approving === run.FINConfigRun_ID} onClick={() => void approve(run.FINConfigRun_ID)}>{approving === run.FINConfigRun_ID ? <LoaderCircle className="animate-spin" /> : <ShieldCheck className="size-4" />}{t("Approve setup")}</Button> : null}</div></div>)}</div></SettingsPanel> : null}</> : <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div>}</div></>
}

export function FinancePage({ route, navigate, currentUser }: { route: FinanceRoute; navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  if (route === "/finance/reports") return <FinanceReportsPage navigate={navigate} />
  if (route === "/finance/management/accruals-wip") return <FinanceAccrualWipPage currentUser={currentUser} />
  if (route === "/finance/payables/intake") return <FinancePurchaseIntakePage navigate={navigate} currentUser={currentUser} />
  const detailMatch = route.match(/^\/finance\/(receivables|payables)\/documents\/([0-9a-f-]+)$/i)
  if (detailMatch) return <FinanceDocumentPage documentId={detailMatch[2]} ledger={detailMatch[1] as FinanceLedger} navigate={navigate} currentUser={currentUser} />
  if (route === "/finance/setup") return <FinanceAdministrationPage navigate={navigate} />
  if (route in financeSetupTabByRoute) {
    const administrationRoute = route as FinanceAdministrationRoute
    return <FinanceAdministrationPage navigate={navigate} initialTab={financeSetupTabByRoute[administrationRoute]} syncFinanceRoute />
  }
  return <LedgerPage route={route as FinanceLedgerRoute} navigate={navigate} currentUser={currentUser} />
}
