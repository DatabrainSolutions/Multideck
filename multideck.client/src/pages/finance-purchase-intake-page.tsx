import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { AlertCircle, ArrowLeft, Check, FileText, LoaderCircle, Trash2, Upload } from "@/components/icons/hugeicons"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import {
  FinanceDocumentLineEditor,
  financeDocumentLineTotals,
  type FinanceDocumentLine,
  type FinanceDocumentTaxOption,
} from "@/components/multideck/finance-document-line-editor"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import {
  approveFinanceDocument,
  createFinanceDraft,
  getFinanceDraftOptions,
  requestFinanceDocumentReview,
  type FinanceDocumentType,
  type FinanceDraftOptions,
} from "@/lib/finance-subledger-api"
import {
  commercialInvoiceFileAccept,
  CommercialInvoiceExtractionError,
  extractFinancePurchaseDocument,
  type FinancePurchaseExtractionResult,
  type InvoiceImportStage,
} from "@/lib/customs-invoice-import-api"
import { cn } from "@/lib/utils"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { toast } from "sonner"

type QueueStatus = "extracting" | "needs_review" | "ready" | "draft" | "review" | "posted" | "failed"
type IntakeItem = {
  id: string
  fileName: string
  status: QueueStatus
  stage: InvoiceImportStage | null
  error: string
  selected: boolean
  extraction: FinancePurchaseExtractionResult | null
  partyOrgId: string
  type: FinanceDocumentType | ""
  documentDate: string
  dueDate: string
  currencyCode: string
  exchangeRate: string
  lines: FinanceDocumentLine[]
  createdDocumentId?: string
  duplicateAccepted: boolean
}

const maxFiles = 25
const today = () => new Date().toISOString().slice(0, 10)

function normal(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function exactTaxTreatment(options: FinanceDraftOptions, legalEntityId: string, rate: number) {
  const matches = options.taxTreatments.filter((item) => item.FINLocTaxTreatment_LegalEntityID === legalEntityId
    && ["purchase", "both"].includes(item.FINLocTaxTreatment_TransactionType)
    && Math.abs(Number(item.FINLocTaxTreatment_RatePercent) - rate) < 0.0001
    && item.FINLocTaxTreatment_EffectiveFrom <= today()
    && (!item.FINLocTaxTreatment_EffectiveTo || item.FINLocTaxTreatment_EffectiveTo >= today()))
  return matches.length === 1 ? matches[0] : null
}

function fromExtraction(fileName: string, extraction: FinancePurchaseExtractionResult, options: FinanceDraftOptions): IntakeItem {
  const legalEntity = options.legalEntities[0]
  const supplierMatches = options.parties.filter((party) => normal(party.Org_Name) === normal(extraction.supplierName))
  const legalEntityId = legalEntity?.LegalEntity_ID ?? ""
  const lines = extraction.lines.map((line) => {
    const tax = exactTaxTreatment(options, legalEntityId, line.taxRate)
    return {
      id: line.id,
      description: line.description,
      chargeCode: "ADHOC",
      jobCostingLineId: null,
      lineType: "service" as const,
      quantity: String(line.quantity || 1),
      unitAmount: String(line.unitPrice || (line.lineTotal / (line.quantity || 1))),
      taxRatePercent: String(line.taxRate),
      taxCode: tax?.FINLocTaxTreatment_Code ?? "",
    }
  })
  return {
    id: extraction.extractionId,
    fileName,
    status: "needs_review",
    stage: null,
    error: "",
    selected: true,
    extraction,
    partyOrgId: supplierMatches.length === 1 ? supplierMatches[0].Org_id : "",
    type: extraction.documentType === "unknown" ? "" : extraction.documentType,
    documentDate: extraction.documentDate,
    dueDate: extraction.dueDate,
    currencyCode: extraction.currencyCode || legalEntity?.FinanceDraftCurrencyCode || "",
    exchangeRate: extraction.currencyCode && extraction.currencyCode !== legalEntity?.FinanceDraftCurrencyCode ? "" : "1",
    lines,
    duplicateAccepted: false,
  }
}

function blockers(item: IntakeItem, options: FinanceDraftOptions | null, duplicates: Set<string>) {
  const issues: string[] = []
  if (!item.extraction || !options) return ["Extraction is incomplete"]
  if (!item.partyOrgId) issues.push("Choose the supplier")
  if (!item.type) issues.push("Choose invoice or credit note")
  if (options.legalEntities.length !== 1) issues.push("Tenant company setup requires attention")
  if (!item.documentDate) issues.push("Check the document date")
  if (!/^[A-Z]{3}$/.test(item.currencyCode)) issues.push("Check the currency")
  if (!(Number(item.exchangeRate) > 0)) issues.push("Enter the exchange rate")
  if (!item.lines.length || item.lines.some((line) => !line.description || !(Number(line.quantity) > 0) || Number(line.unitAmount) < 0)) issues.push("Check the document lines")
  if (item.lines.some((line) => !line.taxCode)) issues.push("Review every tax treatment")
  if (duplicates.has(item.id) && !item.duplicateAccepted) issues.push("Possible duplicate in this batch")
  const totals = financeDocumentLineTotals(item.lines)
  if (item.extraction.netTotal > 0 && Math.abs(totals.net - item.extraction.netTotal) > 0.02) issues.push("Line net does not match the document total")
  if (item.extraction.grossTotal > 0 && Math.abs(totals.gross - item.extraction.grossTotal) > 0.02) issues.push("Line gross does not match the document total")
  return issues
}

export function FinancePurchaseIntakePage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  const { t } = useLanguage()
  const [options, setOptions] = useState<FinanceDraftOptions | null>(null)
  const [items, setItems] = useState<IntakeItem[]>([])
  const [activeId, setActiveId] = useState("")
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState<"draft" | "review" | "post" | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeTopBarAction(topBarActionEvents.importSupplierDocuments, () => inputRef.current?.click()), [])

  useEffect(() => {
    getFinanceDraftOptions("payables")
      .then(setOptions)
      .catch((error) => toast.error(error instanceof Error ? error.message : t("Purchase intake could not be loaded.")))
      .finally(() => setLoading(false))
  }, [t])

  const duplicateIds = useMemo(() => {
    const groups = new Map<string, string[]>()
    items.forEach((item) => {
      const extraction = item.extraction
      if (!extraction?.documentNumber || !extraction.supplierName) return
      const key = `${normal(extraction.supplierName)}|${normal(extraction.documentNumber)}|${extraction.grossTotal}`
      groups.set(key, [...(groups.get(key) ?? []), item.id])
    })
    return new Set([...groups.values()].filter((ids) => ids.length > 1).flat())
  }, [items])

  const addFiles = async (files: File[]) => {
    if (!options) return
    const available = Math.max(0, maxFiles - items.length)
    const selected = files.slice(0, available)
    if (files.length > selected.length) toast.error(t("A batch can contain up to 25 documents."))
    const queued = selected.map<IntakeItem>((file) => ({
      id: crypto.randomUUID(), fileName: file.name, status: "extracting", stage: "uploading", error: "", selected: true,
      extraction: null, partyOrgId: "", type: "",
      documentDate: "", dueDate: "", currencyCode: "", exchangeRate: "1", lines: [], duplicateAccepted: false,
    }))
    setItems((current) => [...current, ...queued])
    if (!activeId && queued[0]) setActiveId(queued[0].id)

    const queue = selected.map((file, index) => ({ file, id: queued[index].id }))
    const worker = async () => {
      while (queue.length) {
        const next = queue.shift()
        if (!next) return
        try {
          const extraction = await extractFinancePurchaseDocument(next.file, {
            extractionId: next.id,
            onStage: (stage) => setItems((current) => current.map((item) => item.id === next.id ? { ...item, stage } : item)),
          })
          const ready = fromExtraction(next.file.name, extraction, options)
          setItems((current) => current.map((item) => item.id === next.id ? ready : item))
        } catch (error) {
          const message = error instanceof CommercialInvoiceExtractionError ? error.message : t("This supplier document could not be read.")
          setItems((current) => current.map((item) => item.id === next.id ? { ...item, status: "failed", stage: null, error: message } : item))
        }
      }
    }
    await Promise.all([worker(), worker()])
  }

  const update = (id: string, values: Partial<IntakeItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...values } : item))
  const active = items.find((item) => item.id === activeId) ?? null
  const activeBlockers = active ? blockers(active, options, duplicateIds) : []
  const readySelected = items.filter((item) => item.selected && blockers(item, options, duplicateIds).length === 0 && !["draft", "review", "posted"].includes(item.status))
  const canApprove = hasPermission(currentUser, "Finance.ReviewAndPost")

  const processSelected = async (mode: "draft" | "review" | "post") => {
    if (!readySelected.length) return
    if (mode === "post" && !window.confirm(t("Post the selected reviewed supplier documents now?"))) return
    setPosting(mode)
    let completed = 0
    for (const item of readySelected) {
      try {
        const document = await createFinanceDraft({
          type: item.type as FinanceDocumentType,
          partyOrgId: item.partyOrgId,
          documentDate: item.documentDate,
          dueDate: item.dueDate || null,
          currencyCode: item.currencyCode,
          exchangeRate: Number(item.exchangeRate),
          idempotencyKey: item.id,
          sourceExtractionId: item.id,
          lines: item.lines.map((line) => ({
            description: line.description, quantity: Number(line.quantity), unitAmount: Number(line.unitAmount),
            taxRatePercent: Number(line.taxRatePercent), taxCode: line.taxCode, chargeCode: line.chargeCode || null, lineType: line.lineType,
          })),
        })
        if (mode !== "draft") await requestFinanceDocumentReview(document.FINDoc_ID, `Imported from ${item.fileName}`)
        if (mode === "post") await approveFinanceDocument(document.FINDoc_ID, `Bulk posted from ${item.fileName}`)
        completed += 1
        update(item.id, { status: mode === "draft" ? "draft" : mode === "review" ? "review" : "posted", createdDocumentId: document.FINDoc_ID, selected: false })
      } catch (error) {
        update(item.id, { status: "failed", error: error instanceof Error ? error.message : t("This document could not be processed.") })
      }
    }
    setPosting(null)
    toast.success(`${completed} / ${readySelected.length} · ${t("Documents processed")}`)
  }

  const taxOptions = useMemo<FinanceDocumentTaxOption[]>(() => (options?.taxTreatments ?? [])
    .filter((tax) => tax.FINLocTaxTreatment_LegalEntityID === options?.legalEntities[0]?.LegalEntity_ID && ["purchase", "both"].includes(tax.FINLocTaxTreatment_TransactionType))
    .map((tax) => ({ id: tax.FINLocTaxTreatment_ID, code: tax.FINLocTaxTreatment_Code, name: tax.FINLocTaxTreatment_Name, ratePercent: Number(tax.FINLocTaxTreatment_RatePercent), approved: true })), [options])

  const counts = {
    extracting: items.filter((item) => item.status === "extracting").length,
    ready: items.filter((item) => blockers(item, options, duplicateIds).length === 0 && !["draft", "review", "posted"].includes(item.status)).length,
    attention: items.filter((item) => item.status === "needs_review" || item.status === "failed").length,
    processed: items.filter((item) => ["draft", "review", "posted"].includes(item.status)).length,
  }

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false); void addFiles([...event.dataTransfer.files])
  }

  return <>
    <SettingsPageHeader title={t("Supplier document intake")} description={t("Drop one invoice or credit note, or a whole batch. Multideck extracts the data, keeps uncertain fields for review, and posts only validated selections.")} icon={Upload} actions={<Button type="button" variant="outline" onClick={() => navigate("/finance/payables")}><ArrowLeft className="rtl:rotate-180" />{t("Purchase ledger")}</Button>} />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      <div className="md-kpi-scope"><KpiStrip density="compact" spark={false} kpis={[
        { label: t("Documents"), value: String(items.length), detail: t("Current batch"), tone: "neutral", icon: FileText },
        { label: t("Extracting"), value: String(counts.extracting), detail: t("Two at a time"), tone: "blue", icon: LoaderCircle },
        { label: t("Ready"), value: String(counts.ready), detail: t("Validated for processing"), tone: "teal", icon: Check },
        { label: t("Needs review"), value: String(counts.attention), detail: t("Mapping or totals attention"), tone: "amber", icon: AlertCircle },
      ]} /></div>

      <input ref={inputRef} type="file" multiple accept={commercialInvoiceFileAccept} className="sr-only" onChange={(event) => { void addFiles([...event.target.files ?? []]); event.target.value = "" }} />
      <div role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click() }} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop} className={cn("grid min-h-32 cursor-pointer place-items-center rounded-[var(--md-radius-xl)] border border-dashed px-6 py-7 text-center transition-colors", dragging ? "border-[var(--md-accent)] bg-[var(--md-surface-tint)]" : "border-[var(--md-line-strong)] bg-[var(--md-surface)] hover:bg-[var(--md-surface-soft)]") }>
        <div><Upload className="mx-auto size-6 text-[var(--md-accent)]" /><p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Drop supplier invoices or credit notes here")}</p><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("PDF, Excel, CSV, Word or image · up to 25 files · 10 MB each")}</p></div>
      </div>

      {items.length ? <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
          <div className="flex items-center justify-between border-b border-[var(--md-line)] px-4 py-3"><div><h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Batch queue")}</h2><p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Select a document to check its extracted data.")}</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: true })))}>{t("Select all")}</Button></div>
          <div className="max-h-[660px] overflow-y-auto divide-y divide-[var(--md-line)]">{items.map((item) => {
            const issues = blockers(item, options, duplicateIds)
            const visibleStatus = item.status === "needs_review" && !issues.length ? "ready" : item.status
            return <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-[var(--md-surface-soft)]", item.id === activeId && "bg-[var(--md-surface-tint)]")}>
              <input aria-label={t("Select document")} type="checkbox" checked={item.selected} onClick={(event) => event.stopPropagation()} onChange={(event) => update(item.id, { selected: event.target.checked })} className="mt-1" />
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{item.fileName}</p><p className="mt-0.5 truncate text-[12px] text-[var(--md-subtle)]">{item.extraction?.supplierName || t(item.stage ? item.stage : "Waiting for review")}</p>{item.error ? <p className="mt-1 text-[11px] text-[var(--md-red)]">{t(item.error)}</p> : issues[0] && item.status !== "extracting" ? <p className="mt-1 text-[11px] text-[var(--md-amber)]">{t(issues[0])}</p> : null}</div>
              <StatusPill tone={visibleStatus === "ready" || visibleStatus === "posted" ? "teal" : visibleStatus === "failed" ? "red" : visibleStatus === "extracting" ? "blue" : "amber"}>{t(item.stage || visibleStatus.replaceAll("_", " "))}</StatusPill>
            </button>
          })}</div>
        </section>

        <section className="min-w-0 space-y-4">
          {active?.extraction ? <>
            <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{active.extraction.supplierName || t("Supplier document")}</h2><p className="mt-1 text-[12px] text-[var(--md-subtle)]"><span data-i18n-skip dir="ltr">{active.extraction.documentNumber || active.fileName}</span> · {t(active.type === "debit_note" ? "Credit note" : "Invoice")}</p></div><Button type="button" size="icon-sm" variant="ghost" aria-label={t("Remove from batch")} onClick={() => { setItems((current) => current.filter((item) => item.id !== active.id)); setActiveId(items.find((item) => item.id !== active.id)?.id ?? "") }}><Trash2 /></Button></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1 text-[12px] font-medium text-[var(--md-text)]">{t("Supplier")}<Select value={active.partyOrgId} onValueChange={(partyOrgId) => update(active.id, { partyOrgId })}><SelectTrigger><SelectValue placeholder={t("Choose supplier")} /></SelectTrigger><SelectContent>{options?.parties.map((party) => <SelectItem key={party.Org_id} value={party.Org_id}>{party.Org_Name}</SelectItem>)}</SelectContent></Select></label>
                <label className="space-y-1 text-[12px] font-medium text-[var(--md-text)]">{t("Document type")}<Select value={active.type} onValueChange={(type: "pl_invoice" | "debit_note") => update(active.id, { type })}><SelectTrigger><SelectValue placeholder={t("Choose type")} /></SelectTrigger><SelectContent><SelectItem value="pl_invoice">{t("Purchase invoice")}</SelectItem><SelectItem value="debit_note">{t("Supplier credit note")}</SelectItem></SelectContent></Select></label>
                <label className="space-y-1 text-[12px] font-medium text-[var(--md-text)]">{t("Document date")}<Input type="date" value={active.documentDate} onChange={(event) => update(active.id, { documentDate: event.target.value })} data-i18n-skip dir="ltr" /></label>
                <label className="space-y-1 text-[12px] font-medium text-[var(--md-text)]">{t("Due date")}<Input type="date" value={active.dueDate} onChange={(event) => update(active.id, { dueDate: event.target.value })} data-i18n-skip dir="ltr" /></label>
                <div className="grid grid-cols-[1fr_110px] gap-2"><label className="space-y-1 text-[12px] font-medium text-[var(--md-text)]">{t("Currency")}<Input maxLength={3} value={active.currencyCode} onChange={(event) => update(active.id, { currencyCode: event.target.value.toUpperCase() })} data-i18n-skip dir="ltr" /></label><label className="space-y-1 text-[12px] font-medium text-[var(--md-text)]">{t("Exchange rate")}<Input type="number" min="0.000001" step="0.000001" value={active.exchangeRate} onChange={(event) => update(active.id, { exchangeRate: event.target.value })} data-i18n-skip dir="ltr" /></label></div>
              </div>
              {activeBlockers.length ? <div className="mt-4 flex flex-wrap items-center gap-1.5">{activeBlockers.map((issue) => <span key={issue} className="rounded-full bg-[color-mix(in_srgb,var(--md-amber),transparent_88%)] px-2.5 py-1 text-[11px] text-[var(--md-amber)]">{t(issue)}</span>)}{duplicateIds.has(active.id) && !active.duplicateAccepted ? <Button type="button" size="sm" variant="outline" onClick={() => update(active.id, { duplicateAccepted: true })}>{t("Keep this possible duplicate")}</Button> : null}</div> : <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--md-teal)]"><Check className="size-4" />{t("Validated and ready for processing")}</div>}
            </div>
            <FinanceDocumentLineEditor lines={active.lines} onLinesChange={(lines) => update(active.id, { lines })} taxOptions={taxOptions} sourceKind="manual" currencyCode={active.currencyCode} credit={active.type === "debit_note"} disabled={posting !== null || ["draft", "review", "posted"].includes(active.status)} onClear={() => update(active.id, { lines: [] })} onImport={() => { toast.info(t("Use the batch drop area to import another supplier document.")) }} onExport={() => { toast.info(t("Create the finance draft before exporting its workbook.")) }} onPrint={() => { toast.info(t("Create the finance draft before printing a proforma.")) }} />
          </> : active ? <div className="grid min-h-64 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><div className="text-center">{active.status === "failed" ? <AlertCircle className="mx-auto size-6 text-[var(--md-red)]" /> : <LoaderCircle className="mx-auto size-6 animate-spin text-[var(--md-accent)]" />}<p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(active.error || "Reading supplier document")}</p></div></div> : null}
        </section>
      </div> : loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : null}

      {items.length ? <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-float)]"><p className="text-[12px] text-[var(--md-subtle)]"><span data-i18n-skip dir="ltr">{readySelected.length}</span> {t("selected documents are validated.")}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!readySelected.length || posting !== null} onClick={() => void processSelected("draft")}>{posting === "draft" ? <LoaderCircle className="animate-spin" /> : null}{t("Create drafts")}</Button><Button type="button" variant="outline" disabled={!readySelected.length || posting !== null} onClick={() => void processSelected("review")}>{posting === "review" ? <LoaderCircle className="animate-spin" /> : null}{t("Send for review")}</Button>{canApprove ? <Button type="button" disabled={!readySelected.length || posting !== null} onClick={() => void processSelected("post")}>{posting === "post" ? <LoaderCircle className="animate-spin" /> : <Check />}{t("Post selected")}</Button> : null}</div></div> : null}
    </div>
  </>
}
