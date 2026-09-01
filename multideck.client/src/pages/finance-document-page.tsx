import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertCircle, ArrowLeft, FileText, History, LoaderCircle, RefreshCw, Save, Send, ShieldCheck } from "@/components/icons/hugeicons"
import {
  createFinanceDocumentLine,
  FinanceDocumentLineEditor,
  type FinanceDocumentLine,
  type FinanceDocumentTaxOption,
} from "@/components/multideck/finance-document-line-editor"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { downloadFinanceDocumentWorkbook, parseFinanceDocumentWorkbook } from "@/lib/finance-document-excel"
import { printFinanceProforma } from "@/lib/finance-proforma"
import {
  approveFinanceDocument,
  getFinanceDocument,
  getFinanceDraftOptions,
  rejectFinanceDocument,
  reopenFinanceDocumentDraft,
  requestFinanceDocumentReview,
  retryFinanceDocumentPosting,
  updateFinanceDraft,
  type FinanceDocumentDetail,
  type FinanceDocumentType,
  type FinanceDraftInput,
  type FinanceDraftOptions,
  type FinanceLedger,
} from "@/lib/finance-subledger-api"
import { toast } from "sonner"

const documentLabels: Record<FinanceDocumentType, string> = {
  sl_invoice: "Sales invoice",
  credit_note: "Customer credit note",
  pl_invoice: "Purchase invoice",
  debit_note: "Supplier credit note",
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="text-[12px] font-medium text-[var(--md-text)]">{children}</label>
}

function statusTone(status: string): "teal" | "amber" | "red" | "neutral" {
  if (["submitted", "posted", "synced", "completed", "resolved"].includes(status)) return "teal"
  if (["failed", "rejected", "blocked"].includes(status)) return "red"
  if (status === "draft") return "neutral"
  return "amber"
}

function providerLabel(code: string | undefined) {
  if (code === "erpnext") return "ERPNext"
  if (code === "sage_50") return "Sage 50 Desktop"
  return code?.replaceAll("_", " ") || "Accounting provider"
}

function lineFromRecord(line: FinanceDocumentDetail["lines"][number]): FinanceDocumentLine {
  return {
    ...createFinanceDocumentLine({ code: line.FINDocLine_TaxCodeSnapshot ?? "", ratePercent: Number(line.FINDocLine_TaxRatePercent) }),
    id: line.FINDocLine_ID,
    description: line.FINDocLine_Description,
    chargeCode: line.FINDocLine_ChargeCodeSnapshot ?? "ADHOC",
    jobCostingLineId: line.FINDocLine_JobCostingLineID,
    lineType: line.FINDocLine_LineTypeCode === "ancillary" ? "ancillary" : "service",
    quantity: String(line.FINDocLine_Quantity),
    unitAmount: String(line.FINDocLine_UnitAmount),
    taxCode: line.FINDocLine_TaxCodeSnapshot ?? "",
    taxRatePercent: String(line.FINDocLine_TaxRatePercent),
  }
}

export function FinanceDocumentPage({
  documentId,
  ledger,
  navigate,
  currentUser,
}: {
  documentId: string
  ledger: FinanceLedger
  navigate: (path: string) => void
  currentUser?: AuthUserSummary | null
}) {
  const { direction, language, t } = useLanguage()
  const canDraft = hasPermission(currentUser, ledger === "receivables" ? "Finance.Receivables.Draft" : "Finance.Payables.Draft")
  const canApprove = hasPermission(currentUser, "Finance.ReviewAndPost")
  const canRetry = hasPermission(currentUser, "Finance.Integration.Manage")
  const [detail, setDetail] = useState<FinanceDocumentDetail | null>(null)
  const [options, setOptions] = useState<FinanceDraftOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reasonAction, setReasonAction] = useState<"reject" | "reopen" | null>(null)
  const [reason, setReason] = useState("")
  const [partyOrgId, setPartyOrgId] = useState("")
  const [sourceKind, setSourceKind] = useState<"manual" | "job">("manual")
  const [sourceJobId, setSourceJobId] = useState("")
  const [documentDate, setDocumentDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [currencyCode, setCurrencyCode] = useState("")
  const [exchangeRate, setExchangeRate] = useState("1")
  const [lines, setLines] = useState<FinanceDocumentLine[]>([])

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const [documentResult, draftOptionsResult] = await Promise.all([
        getFinanceDocument(documentId),
        canDraft ? getFinanceDraftOptions(ledger).catch(() => null) : Promise.resolve(null),
      ])
      setDetail(documentResult)
      setOptions(draftOptionsResult)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The finance document could not be loaded."))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [canDraft, documentId, ledger, t])

  useEffect(() => { void load() }, [load])

  const resetForm = useCallback((source: FinanceDocumentDetail) => {
    setPartyOrgId(source.document.FINDoc_PartyOrgID ?? "")
    setSourceKind(source.document.FINDoc_SourceKindCode === "job" ? "job" : "manual")
    setSourceJobId(source.document.FINDoc_SourceJobID ?? "")
    setDocumentDate(source.document.FINDoc_DocumentDate)
    setDueDate(source.document.FINDoc_DueDate ?? "")
    setCurrencyCode(source.document.FINDoc_CurrencyCodeSnapshot)
    setExchangeRate(String(source.document.FINDoc_ExchangeRate || 1))
    setLines(source.lines.map(lineFromRecord))
  }, [])

  useEffect(() => {
    if (detail) resetForm(detail)
  }, [detail, resetForm])

  const document = detail?.document
  const type = document?.FINDoc_TypeCode
  const isCredit = type === "credit_note" || type === "debit_note"
  const editable = Boolean(document?.FINDoc_StatusCode === "draft" && canDraft && options)
  const posted = document?.FINDoc_NativePostingStatusCode === "posted"
  const blocked = Boolean(["approved", "submitted"].includes(document?.FINDoc_StatusCode ?? "") && ["blocked", "failed"].includes(document?.FINDoc_ExportStatusCode ?? ""))
  const selectedEntity = options?.legalEntities.find((entity) => entity.LegalEntity_ID === document?.FINDoc_LegalEntityID)
  const baseCurrency = (selectedEntity?.FinanceDraftCurrencyCode ?? selectedEntity?.LegalEntity_BaseCurrencyCodeSnapshot ?? currencyCode).toUpperCase()
  const needsExchangeRate = Boolean(currencyCode && baseCurrency && currencyCode !== baseCurrency)
  const selectedParty = options?.parties.find((party) => party.Org_id === partyOrgId)
  const availableJobs = (options?.jobs ?? []).filter((job) => (!job.Job_LegalEntityID || job.Job_LegalEntityID === document?.FINDoc_LegalEntityID) && Boolean(ledger === "receivables" ? job.Job_Customer : job.Job_Supplier))
  const jobChargeOptions = (options?.jobCostingLines ?? []).filter((line) => line.Job_ID === sourceJobId).map((line) => ({ id: line.JobCostingLine_ID, lineNo: line.JobCostingLine_Number, chargeCode: null, description: line.JobCostingLine_Description, expectedAmount: Number(ledger === "receivables" ? line.JobCostingLine_RevenueAmountLocal : line.JobCostingLine_CostAmountLocal), nominalCode: null }))
  const transactionDirection = ledger === "receivables" ? "sales" : "purchase"
  const approvedTreatments = useMemo(() => (options?.taxTreatments ?? []).filter((treatment) => treatment.FINLocTaxTreatment_LegalEntityID === document?.FINDoc_LegalEntityID && ["both", transactionDirection].includes(treatment.FINLocTaxTreatment_TransactionType) && treatment.FINLocTaxTreatment_EffectiveFrom <= documentDate && (!treatment.FINLocTaxTreatment_EffectiveTo || treatment.FINLocTaxTreatment_EffectiveTo >= documentDate)), [document?.FINDoc_LegalEntityID, documentDate, options?.taxTreatments, transactionDirection])
  const taxOptions = useMemo<FinanceDocumentTaxOption[]>(() => {
    const result = new Map<string, FinanceDocumentTaxOption>()
    for (const treatment of approvedTreatments) result.set(treatment.FINLocTaxTreatment_Code, { id: treatment.FINLocTaxTreatment_ID, code: treatment.FINLocTaxTreatment_Code, name: treatment.FINLocTaxTreatment_Name, ratePercent: Number(treatment.FINLocTaxTreatment_RatePercent), approved: true })
    for (const suggestion of options?.taxSuggestions ?? []) {
      if (["both", transactionDirection].includes(suggestion.FINLocTaxTreatment_TransactionType) && !result.has(suggestion.FINLocTaxTreatment_Code)) result.set(suggestion.FINLocTaxTreatment_Code, { id: suggestion.FINLocTaxTreatment_ID, code: suggestion.FINLocTaxTreatment_Code, name: suggestion.FINLocTaxTreatment_Name, ratePercent: 0, approved: false })
    }
    for (const line of lines) if (line.taxCode && !result.has(line.taxCode)) result.set(line.taxCode, { id: `recorded-${line.taxCode}`, code: line.taxCode, name: line.taxCode, ratePercent: Number(line.taxRatePercent), approved: Boolean(line.taxCode) })
    return [...result.values()]
  }, [approvedTreatments, lines, options?.taxSuggestions, transactionDirection])
  const taxPending = lines.some((line) => !line.taxCode || !taxOptions.some((option) => option.approved && option.code === line.taxCode))
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])

  const draftPayload = (): FinanceDraftInput => ({
    type: document!.FINDoc_TypeCode,
    legalEntityId: document!.FINDoc_LegalEntityID,
    partyOrgId,
    documentDate,
    dueDate: dueDate || null,
    currencyCode,
    exchangeRate: needsExchangeRate ? Number(exchangeRate) : 1,
    sourceJobId: sourceKind === "job" ? sourceJobId : null,
    lines: lines.map((line) => ({
      description: line.description.trim(),
      chargeCode: line.chargeCode.trim() || "ADHOC",
      jobCostingLineId: line.jobCostingLineId,
      lineType: line.lineType,
      quantity: Number(line.quantity),
      unitAmount: Number(line.unitAmount),
      taxRatePercent: Number(line.taxRatePercent),
      taxCode: line.taxCode || null,
    })),
  })

  const runAction = async (name: string, action: () => Promise<unknown>, success: string) => {
    setPendingAction(name)
    try {
      await action()
      toast.success(t(success))
      await load(true)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("The finance action could not be completed."))
      await load(true)
    } finally {
      setPendingAction(null)
    }
  }

  const saveDraft = () => runAction("save", () => updateFinanceDraft(documentId, draftPayload()), "Draft saved")
  const sendForReview = () => runAction("review", async () => {
    await updateFinanceDraft(documentId, draftPayload())
    await requestFinanceDocumentReview(documentId)
  }, "Draft sent for finance review")
  const approve = () => runAction("approve", () => approveFinanceDocument(documentId), "Document approved and posted; external mirror checked")
  const retry = () => runAction("retry", () => retryFinanceDocumentPosting(documentId), "External mirror delivery completed")

  const confirmReasonAction = async () => {
    if (!reasonAction || !reason.trim()) return
    const action = reasonAction
    setReasonAction(null)
    await runAction(action, () => action === "reject" ? rejectFinanceDocument(documentId, reason.trim()) : reopenFinanceDocumentDraft(documentId, reason.trim()), action === "reject" ? "Document rejected" : "Approval revoked; document returned to draft")
    setReason("")
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
    if (!document || !type) return
    downloadFinanceDocumentWorkbook({ title: `${document.FINDoc_Number ?? documentLabels[type]}-${documentDate}`, documentType: t(documentLabels[type]), currencyCode, lines })
    toast.success(t("Excel workbook exported"))
  }

  const printProforma = () => {
    if (!document || !type) return
    const opened = printFinanceProforma({
      typeLabel: t(documentLabels[type]),
      credit: isCredit,
      entityName: document.legalEntityName,
      partyLabel: t(ledger === "receivables" ? "Customer" : "Supplier"),
      partyName: selectedParty?.Org_Name ?? document.partyName,
      partyAccountCode: selectedParty?.Org_AccCode ?? document.partyAccountCode ?? "",
      documentDate,
      dueDate,
      currencyCode,
      lines,
      taxPending,
      language,
      direction,
      translate: t,
    })
    if (!opened) toast.error(t("Allow pop-ups to print the proforma."))
  }

  const recoveryRoute = (() => {
    const message = detail?.integrationQueue?.FINIntQ_LastError?.toLowerCase() ?? ""
    if (message.includes("tax") || message.includes("vat")) return "/finance/tax"
    if (message.includes("connection") || message.includes("company") || message.includes("provider")) return "/finance/systems"
    return "/finance/mappings"
  })()

  const externalUrl = detail?.externalReference?.ACCIER_ExternalURL
  const safeExternalUrl = externalUrl && /^https:\/\//i.test(externalUrl) ? externalUrl : null
  const registerRoute = ledger === "receivables" ? "/finance/receivables" : "/finance/payables"

  if (loading) return <div className="grid min-h-[55vh] place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div>
  if (!detail || !document || !type) return <div role="alert" className="rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-5 text-[13px] text-[var(--md-red)]">{error ?? t("Finance document not found.")}</div>

  return (
    <>
      <SettingsPageHeader
        title={`${t(documentLabels[type])} ${document.FINDoc_Number ?? ""}`.trim()}
        description={t(posted ? "Native ledger postings are locked and shown read-only." : editable ? "Edit and save this draft before sending it for finance review." : blocked ? "The document is posted in Multideck, but its external mirror delivery needs attention." : "Review the document and its controlled lifecycle evidence.")}
        descriptionPlacement="under-title"
        icon={FileText}
        actions={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => navigate(registerRoute)}><ArrowLeft />{t("Back to register")}</Button><Button type="button" variant="outline" disabled={refreshing || Boolean(pendingAction)} onClick={() => void load(true)}><RefreshCw className={refreshing ? "animate-spin" : ""} />{t("Refresh")}</Button></div>}
      />

      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        {error ? <div role="alert" className="rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-4 text-[13px] text-[var(--md-red)]">{error}</div> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-3 shadow-[var(--md-shadow-line)]">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone(document.FINDoc_StatusCode)}>{t(document.FINDoc_StatusCode.replaceAll("_", " "))}</StatusPill>
            <StatusPill tone={statusTone(document.FINDoc_NativePostingStatusCode)}>{t(`Ledger ${document.FINDoc_NativePostingStatusCode.replaceAll("_", " ")}`)}</StatusPill>
            <StatusPill tone={statusTone(document.FINDoc_ExportStatusCode)}>{t(`Mirror ${document.FINDoc_ExportStatusCode.replaceAll("_", " ")}`)}</StatusPill>
            <span className="text-[12px] text-[var(--md-subtle)]">{detail.provider ? t(providerLabel(detail.provider.ACCIC_ProviderCode)) : t("No external mirror")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable ? <><Button type="button" variant="outline" disabled={Boolean(pendingAction)} onClick={() => void saveDraft()}>{pendingAction === "save" ? <LoaderCircle className="animate-spin" /> : <Save />}{t("Save draft")}</Button><Button type="button" disabled={Boolean(pendingAction)} onClick={() => void sendForReview()}>{pendingAction === "review" ? <LoaderCircle className="animate-spin" /> : <Send />}{t("Send for review")}</Button></> : null}
            {document.FINDoc_StatusCode === "awaiting_approval" && canApprove ? <><Button type="button" variant="outline" disabled={Boolean(pendingAction)} onClick={() => { setReason(""); setReasonAction("reject") }}>{t("Reject")}</Button><Button type="button" disabled={Boolean(pendingAction)} onClick={() => void approve()}>{pendingAction === "approve" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}{t("Approve & post")}</Button></> : null}
            {document.FINDoc_StatusCode === "rejected" && canDraft && canApprove ? <Button type="button" disabled={Boolean(pendingAction)} onClick={() => { setReason(""); setReasonAction("reopen") }}>{t("Return to draft")}</Button> : null}
          </div>
        </div>

        {blocked ? <section aria-labelledby="finance-recovery-title" className="rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-red),transparent_92%)] p-5 shadow-[var(--md-shadow-line)]"><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex min-w-0 flex-1 gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-[var(--md-red)]" /><div><h2 id="finance-recovery-title" className="text-[14px] font-medium text-[var(--md-ink)]">{t("External mirror needs attention")}</h2><p className="mt-1 max-w-4xl break-words text-[13px] leading-5 text-[var(--md-text)]">{detail.integrationQueue?.FINIntQ_LastError ?? t("The external accounting mirror did not accept this delivery.")}</p><p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Attempts")}: <span data-i18n-skip dir="ltr">{detail.integrationQueue?.FINIntQ_AttemptCount ?? 0}</span>{detail.integrationQueue?.FINIntQ_LastAttemptAt ? <> · {t("Last tried")} <span data-i18n-skip dir="ltr">{dateFormatter.format(new Date(detail.integrationQueue.FINIntQ_LastAttemptAt))}</span></> : null}</p></div></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => navigate(recoveryRoute)}>{t("Fix mirror setup")}</Button>{canRetry && detail.integrationQueue?.retryAvailable ? <Button type="button" disabled={Boolean(pendingAction)} onClick={() => void retry()}>{pendingAction === "retry" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{t("Retry mirror")}</Button> : null}{canDraft && canApprove ? <Button type="button" variant="outline" disabled={Boolean(pendingAction)} onClick={() => { setReason(""); setReasonAction("reopen") }}>{t("Return to draft")}</Button> : null}</div></div><p className="mt-4 border-t border-[color-mix(in_srgb,var(--md-red),transparent_80%)] pt-3 text-[12px] leading-5 text-[var(--md-text)]">{t("Fix the named mirror setup issue, then retry delivery of the same authoritative Multideck posting. Return to draft only when the document itself is wrong; doing so revokes its approval before editing.")}</p></section> : null}

        {posted ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-teal),transparent_92%)] p-4 text-[13px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><span>{t("This document is posted to the Multideck ledger and is immutable. Export and print tools remain available.")}</span>{detail.externalReference ? safeExternalUrl ? <a href={safeExternalUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--md-accent)] hover:underline">{t("Open external mirror")}</a> : <span data-i18n-skip dir="ltr">{detail.externalReference.ACCIER_ExternalNumber ?? detail.externalReference.ACCIER_ExternalID}</span> : null}</div> : null}

        <SettingsPanel title={t("Document details")} description={t(editable ? "Draft fields remain editable until the document enters finance review." : "These fields are read-only at the current lifecycle stage.")}>
          <div className="grid gap-4 py-1 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2"><FieldLabel htmlFor="finance-detail-entity">{t("Legal entity")}</FieldLabel><Input id="finance-detail-entity" value={document.legalEntityName} disabled /></div>
            <div className="space-y-2"><FieldLabel htmlFor="finance-detail-source">{t("Source")}</FieldLabel><Select value={sourceKind} disabled={!editable} onValueChange={(value: "manual" | "job") => { setSourceKind(value); if (value === "manual") setSourceJobId("") }}><SelectTrigger id="finance-detail-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">{t("Ad hoc or ancillary")}</SelectItem><SelectItem value="job">{t("Freight job")}</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><FieldLabel htmlFor="finance-detail-date">{t("Document date")}</FieldLabel><Input id="finance-detail-date" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} disabled={!editable} data-i18n-skip dir="ltr" /></div>
            <div className="space-y-2"><FieldLabel htmlFor="finance-detail-due">{t("Due date")}</FieldLabel><Input id="finance-detail-due" type="date" value={dueDate} min={documentDate} onChange={(event) => setDueDate(event.target.value)} disabled={!editable} data-i18n-skip dir="ltr" /></div>
          </div>
          {sourceKind === "job" ? <div className="mt-4 space-y-2"><FieldLabel htmlFor="finance-detail-job">{t("Job")}</FieldLabel>{options ? <Select value={sourceJobId} disabled={!editable} onValueChange={(value) => { const job = availableJobs.find((item) => item.Job_ID === value); setSourceJobId(value); setLines((current) => current.map((line) => ({ ...line, jobCostingLineId: null }))); setPartyOrgId(ledger === "receivables" ? job?.Job_Customer ?? "" : job?.Job_Supplier ?? "") }}><SelectTrigger id="finance-detail-job"><SelectValue placeholder={t("Choose job")} /></SelectTrigger><SelectContent>{availableJobs.map((job) => <SelectItem key={job.Job_ID} value={job.Job_ID}><span data-i18n-skip dir="ltr">{job.Job_Period}-{job.Job_Number}</span> · {t(job.Job_Status)}</SelectItem>)}</SelectContent></Select> : <Input id="finance-detail-job" value={document.jobReference ?? t("No job")} disabled />}</div> : null}
          <div className={`mt-4 grid gap-4 ${needsExchangeRate ? "md:grid-cols-[minmax(0,1fr)_140px_180px]" : "md:grid-cols-[minmax(0,1fr)_140px]"}`}>
            <div className="space-y-2"><FieldLabel htmlFor="finance-detail-party">{t(ledger === "receivables" ? "Customer" : "Supplier")}</FieldLabel>{options ? <Select value={partyOrgId} disabled={!editable || sourceKind === "job"} onValueChange={setPartyOrgId}><SelectTrigger id="finance-detail-party"><SelectValue /></SelectTrigger><SelectContent>{options.parties.map((party) => <SelectItem key={party.Org_id} value={party.Org_id}>{party.Org_Name}</SelectItem>)}</SelectContent></Select> : <Input id="finance-detail-party" value={document.partyName} disabled />}</div>
            <div className="space-y-2"><FieldLabel htmlFor="finance-detail-currency">{t("Currency")}</FieldLabel><Input id="finance-detail-currency" maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} disabled={!editable} data-i18n-skip dir="ltr" /></div>
            {needsExchangeRate ? <div className="space-y-2"><FieldLabel htmlFor="finance-detail-rate">{t("Exchange rate to base currency")} <span data-i18n-skip dir="ltr">({baseCurrency})</span></FieldLabel><Input id="finance-detail-rate" type="number" min="0.0000000001" step="0.0000000001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} disabled={!editable} data-i18n-skip dir="ltr" /></div> : null}
          </div>
        </SettingsPanel>

        <FinanceDocumentLineEditor lines={lines} onLinesChange={setLines} taxOptions={taxOptions} jobChargeOptions={jobChargeOptions} sourceKind={sourceKind} currencyCode={currencyCode} credit={isCredit} disabled={Boolean(pendingAction)} readOnly={!editable} onClear={() => { resetForm(detail); toast.success(t("Unsaved changes cleared")) }} onImport={importExcel} onExport={exportExcel} onPrint={printProforma} />

        <SettingsPanel title={t("Document history")} description={t("Approval, rejection and recovery changes are retained as lifecycle evidence.")}>
          <div className="divide-y divide-[var(--md-line)]">
            {detail.history.map((event) => <div key={event.FINDocStatus_ID} className="grid gap-2 py-3 text-[13px] sm:grid-cols-[24px_minmax(0,1fr)_auto]"><History className="mt-0.5 size-4 text-[var(--md-subtle)]" /><div><p className="font-medium text-[var(--md-ink)]">{t(event.FINDocStatus_ToStatusCode.replaceAll("_", " "))}</p><p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{event.FINDocStatus_Reason ? t(event.FINDocStatus_Reason) : t("Lifecycle status changed")}</p></div><time className="text-[11px] text-[var(--md-subtle)]" dateTime={event.FINDocStatus_ChangedAt} data-i18n-skip dir="ltr">{dateFormatter.format(new Date(event.FINDocStatus_ChangedAt))}</time></div>)}
          </div>
        </SettingsPanel>
      </div>

      <Dialog open={Boolean(reasonAction)} onOpenChange={(open) => { if (!open && !pendingAction) { setReasonAction(null); setReason("") } }}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader><DialogTitle>{t(reasonAction === "reject" ? "Reject finance document" : "Return document to draft")}</DialogTitle><DialogDescription>{t(reasonAction === "reject" ? "Record why this document cannot be approved. The reason is retained in its audit history." : "This revokes the prior approval and cancels the blocked provider queue item before editing is enabled.")}</DialogDescription></DialogHeader>
          <div className="space-y-2"><FieldLabel htmlFor="finance-recovery-reason">{t("Reason")}</FieldLabel><Textarea id="finance-recovery-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={t("Explain what needs to change…")} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setReasonAction(null); setReason("") }}>{t("Cancel")}</Button><Button type="button" disabled={!reason.trim()} onClick={() => void confirmReasonAction()}>{t(reasonAction === "reject" ? "Reject document" : "Revoke approval & edit")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
