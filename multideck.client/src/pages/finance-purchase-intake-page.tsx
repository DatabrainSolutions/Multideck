import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { AlertCircle, ArrowLeft, Check, LoaderCircle, Trash2, Upload } from "@/components/icons/hugeicons"
import {
  FinanceDocumentLineEditor,
  financeDocumentLineTotals,
  type FinanceDocumentLine,
  type FinanceDocumentTaxOption,
} from "@/components/multideck/finance-document-line-editor"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { DocumentEvidenceViewer, type EvidenceViewerPage } from "@/components/multideck/document-evidence-viewer"
import { releasePdfPageImages, renderPdfPageImages } from "@/lib/customs-invoice-pdf-preview"
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
type BatchCategory = "reading" | "attention" | "ready" | "processed"
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
  sourceFile?: File
  duplicateAccepted: boolean

}

const maxFiles = 25
const today = () => new Date().toISOString().slice(0, 10)
const financeEntitySessionKey = "multideck.finance.daily.entity"
function preferredEntityId(options: FinanceDraftOptions) {
  let saved: string | null = null
  try { saved = window.sessionStorage.getItem(financeEntitySessionKey) } catch { /* Browser storage may be unavailable. */ }
  return options.legalEntities.find((entity) => entity.LegalEntity_ID === saved)?.LegalEntity_ID
    ?? (options.legalEntities.length === 1 ? options.legalEntities[0].LegalEntity_ID : "")
}
function rememberEntity(id: string) {
  try { window.sessionStorage.setItem(financeEntitySessionKey, id) } catch { /* Selection still applies to this batch. */ }
}

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

function fromExtraction(fileName: string, extraction: FinancePurchaseExtractionResult, options: FinanceDraftOptions, legalEntityId: string): IntakeItem {
  const legalEntity = options.legalEntities.find((entity) => entity.LegalEntity_ID === legalEntityId)
  const supplierMatches = options.parties.filter((party) => normal(party.Org_Name) === normal(extraction.supplierName))
  const lines = extraction.lines.map((line) => {
    const tax = exactTaxTreatment(options, legalEntityId, line.taxRate)
    return {
      id: line.id,
      description: line.description,
      chargeCode: "ADHOC",
      jobCostingLineId: null,
      lineType: "service" as const,
      quantity: String(line.quantity || 1),
      currencyCode: extraction.currencyCode || legalEntity?.FinanceDraftCurrencyCode || "",
      unitAmount: String(line.unitPrice || (line.lineTotal / (line.quantity || 1))),
      exchangeRate: "1",
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
    selected: false,
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

function blockers(item: IntakeItem, options: FinanceDraftOptions | null, legalEntityId: string, duplicates: Set<string>) {
  const issues: string[] = []
  if (!item.extraction || !options) return ["Extraction is incomplete"]
  if (!item.partyOrgId) issues.push("Choose the supplier")
  if (!item.type) issues.push("Choose invoice or credit note")
  if (!options.legalEntities.some((entity) => entity.LegalEntity_ID === legalEntityId)) issues.push("Choose a legal entity")
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
  const [entityId, setEntityId] = useState("")
  const [items, setItems] = useState<IntakeItem[]>([])
  const [activeId, setActiveId] = useState("")
  const [queueFilter, setQueueFilter] = useState<"all" | BatchCategory>("all")
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState<"draft" | "review" | "post" | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectionAnchor = useRef<string>("")

  useEffect(() => subscribeTopBarAction(topBarActionEvents.importSupplierDocuments, () => inputRef.current?.click()), [])

  useEffect(() => {
    getFinanceDraftOptions("payables")
      .then((found) => { setOptions(found); setEntityId((current) => found.legalEntities.some((entity) => entity.LegalEntity_ID === current) ? current : preferredEntityId(found)) })
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
    if (!options || !options.legalEntities.some((entity) => entity.LegalEntity_ID === entityId)) {
      toast.error(t("Choose a legal entity before importing supplier documents."))
      return
    }
    const available = Math.max(0, maxFiles - items.length)
    const selected = files.slice(0, available)
    if (files.length > selected.length) toast.error(t("A batch can contain up to 25 documents."))
    const queued = selected.map<IntakeItem>((file) => ({
      id: crypto.randomUUID(), fileName: file.name, status: "extracting", stage: "uploading", error: "", selected: false,
      extraction: null, sourceFile: file, partyOrgId: "", type: "",
      documentDate: "", dueDate: "", currencyCode: "", exchangeRate: "1", lines: [], duplicateAccepted: false,
    }))
    setQueueFilter("all")
    const startNewSelection = !activeId
    if (startNewSelection && queued[0]) { queued[0].selected = true; selectionAnchor.current = queued[0].id }
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
          const ready = fromExtraction(next.file.name, extraction, options, entityId)
          setItems((current) => current.map((item) => item.id === next.id ? { ...ready, selected: item.selected, sourceFile: item.sourceFile } : item))
        } catch (error) {
          const message = error instanceof CommercialInvoiceExtractionError ? error.message : t("This supplier document could not be read.")
          setItems((current) => current.map((item) => item.id === next.id ? { ...item, status: "failed", stage: null, error: message } : item))
        }
      }
    }
    await Promise.all([worker(), worker()])
  }

  const update = (id: string, values: Partial<IntakeItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...values } : item))
  const categorizedItems = items.map((item) => {
    const issues = blockers(item, options, entityId, duplicateIds)
    const category: BatchCategory = ["draft", "review", "posted"].includes(item.status)
      ? "processed"
      : item.status === "extracting" ? "reading"
      : item.status === "failed" || item.error || issues.length ? "attention" : "ready"
    return { item, issues, category }
  })
  const visibleItems = categorizedItems.filter(({ category }) => queueFilter === "all" || category === queueFilter)
  const selectDocument = (id: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => {
    if (posting !== null) return
    const additive = modifiers.ctrlKey || modifiers.metaKey
    const targetIndex = visibleItems.findIndex(({ item }) => item.id === id)
    const anchorIndex = visibleItems.findIndex(({ item }) => item.id === selectionAnchor.current)
    if (targetIndex < 0) return
    if (modifiers.shiftKey && anchorIndex >= 0) {
      const rangeIds = new Set(visibleItems.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1).map(({ item }) => item.id))
      setItems((current) => current.map((item) => ({ ...item, selected: rangeIds.has(item.id) || Boolean(additive && item.selected) })))
    } else {
      setItems((current) => current.map((item) => ({ ...item, selected: item.id === id ? additive ? !item.selected : true : additive ? item.selected : false })))
      selectionAnchor.current = id
    }
    setActiveId(id)
  }
  const activeEntry = visibleItems.find(({ item }) => item.id === activeId) ?? visibleItems[0]
  const active = activeEntry?.item ?? null
  const activeBlockers = activeEntry?.issues ?? []
  const selectedCount = items.filter((item) => item.selected).length
  const hiddenSelectedCount = selectedCount - visibleItems.filter(({ item }) => item.selected).length
  const [preview, setPreview] = useState<{ id: string; pages: EvidenceViewerPage[]; originalUrl: string; loading: boolean; error: string } | null>(null)
  const activeSourceFile = active?.sourceFile
  const preparedPreviewUrl = activeSourceFile && !/\.(pdf|png|jpe?g|webp)$/i.test(activeSourceFile.name) ? active?.extraction?.document.previewUrl : undefined
  const previewDocumentId = active?.id
  useEffect(() => {
    if (!previewDocumentId || !activeSourceFile) { setPreview(null); return }
    const controller = new AbortController()
    const originalUrl = URL.createObjectURL(activeSourceFile)
    const allocatedPages: EvidenceViewerPage[] = []
    const isImage = /\.(png|jpe?g|webp)$/i.test(activeSourceFile.name)
    const isPdf = /\.pdf$/i.test(activeSourceFile.name)
    setPreview({ id: previewDocumentId, pages: [], originalUrl, loading: true, error: "" })
    const showPages = async () => {
      try {
        if (isImage) {
          const image = new Image()
          image.src = originalUrl
          await image.decode()
          if (!controller.signal.aborted) setPreview({ id: previewDocumentId, originalUrl, pages: [{ page: 1, width: image.naturalWidth, height: image.naturalHeight, url: originalUrl }], loading: false, error: "" })
          return
        }
        let pdf: Blob = activeSourceFile
        if (!isPdf) {
          if (!preparedPreviewUrl) {
            if (!controller.signal.aborted) setPreview({ id: previewDocumentId, originalUrl, pages: [], loading: false, error: "A visual preview will appear when document conversion is complete. You can download the original file." })
            return
          }
          const response = await fetch(preparedPreviewUrl, { credentials: "omit", signal: controller.signal })
          if (!response.ok) throw new Error("Preview unavailable")
          pdf = await response.blob()
          if (pdf.type && pdf.type !== "application/pdf") throw new Error("Preview unavailable")
        }
        const pages = await renderPdfPageImages(pdf, { maxPages: 100, signal: controller.signal, onPage: (page) => {
          if (controller.signal.aborted) { releasePdfPageImages([page]); return }
          allocatedPages.push(page)
          setPreview({ id: previewDocumentId, originalUrl, pages: [...allocatedPages], loading: true, error: "" })
        } })
        if (!controller.signal.aborted) setPreview({ id: previewDocumentId, originalUrl, pages, loading: false, error: pages.length ? "" : "The document preview could not be loaded. Download the original to check it." })
      } catch {
        if (!controller.signal.aborted) setPreview({ id: previewDocumentId, originalUrl, pages: [], loading: false, error: "The document preview could not be loaded. Download the original to check it." })
      }
    }
    void showPages()
    return () => { controller.abort(); URL.revokeObjectURL(originalUrl); releasePdfPageImages(allocatedPages.filter((page): page is EvidenceViewerPage & { url: string } => Boolean(page.url))) }
  }, [activeSourceFile, preparedPreviewUrl, previewDocumentId])
  const activePreview = preview?.id === active?.id ? preview : null
  const readySelected = categorizedItems.filter(({ item, category }) => item.selected && category === "ready").map(({ item }) => item)
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
          legalEntityId: entityId,
          partyOrgId: item.partyOrgId,
          documentDate: item.documentDate,
          dueDate: item.dueDate || null,
          currencyCode: item.currencyCode,
          exchangeRate: Number(item.exchangeRate),
          idempotencyKey: item.id,
          sourceExtractionId: item.id,
          lines: item.lines.map((line) => ({
            description: line.description, quantity: Number(line.quantity), unitAmount: Number(line.unitAmount), currencyCode: line.currencyCode || item.currencyCode, exchangeRate: Number(line.exchangeRate || 1),
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
    .filter((tax) => tax.FINLocTaxTreatment_LegalEntityID === entityId && ["purchase", "both"].includes(tax.FINLocTaxTreatment_TransactionType))
    .map((tax) => ({ id: tax.FINLocTaxTreatment_ID, code: tax.FINLocTaxTreatment_Code, name: tax.FINLocTaxTreatment_Name, ratePercent: Number(tax.FINLocTaxTreatment_RatePercent), approved: true })), [options, entityId])

  const counts = categorizedItems.reduce<Record<BatchCategory, number>>((totals, { category }) => {
    totals[category] += 1
    return totals
  }, { reading: 0, attention: 0, ready: 0, processed: 0 })
  const batchFilters = [
    { id: "all" as const, label: "Documents", count: items.length, tone: "var(--md-text)" },
    { id: "reading" as const, label: "Reading", count: counts.reading, tone: "var(--md-blue)" },
    { id: "attention" as const, label: "Needs review", count: counts.attention, tone: "var(--md-amber)" },
    { id: "ready" as const, label: "Ready to process", count: counts.ready, tone: "var(--md-teal)" },
    ...(counts.processed ? [{ id: "processed" as const, label: "Processed", count: counts.processed, tone: "var(--md-text)" }] : []),
  ]

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false); void addFiles([...event.dataTransfer.files])
  }

  return <>
    <SettingsPageHeader title={t("Supplier document intake")} actions={<Button type="button" variant="outline" onClick={() => navigate("/finance/payables")}><ArrowLeft className="rtl:rotate-180" />{t("Purchase ledger")}</Button>} />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      <div className="max-w-sm space-y-2"><label htmlFor="finance-intake-entity" className="block text-[12px] font-medium text-[var(--md-text)]">{t("Legal entity")}</label><Select value={entityId} disabled={loading || items.length > 0} onValueChange={(value) => { if (!options?.legalEntities.some((entity) => entity.LegalEntity_ID === value)) return; setEntityId(value); rememberEntity(value) }}><SelectTrigger id="finance-intake-entity"><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{options?.legalEntities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select>{items.length ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Finish or remove this batch before changing legal entity.")}</p> : null}</div>

      <input ref={inputRef} type="file" multiple accept={commercialInvoiceFileAccept} className="sr-only" onChange={(event) => { void addFiles([...event.target.files ?? []]); event.target.value = "" }} />
      <div role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click() } }} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop} className={cn("grid min-h-32 cursor-pointer place-items-center rounded-[var(--md-radius-xl)] border border-dashed px-6 py-7 text-center transition-colors", dragging ? "border-[var(--md-accent)] bg-[var(--md-surface-tint)]" : "border-[var(--md-line-strong)] bg-[var(--md-surface)] hover:bg-[var(--md-surface-soft)]") }>
        <div><Upload className="mx-auto size-6 text-[var(--md-accent)]" /><p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Drop supplier invoices or credit notes here")}</p><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("PDF, Excel, CSV, Word or image · up to 25 files · 10 MB each")}</p></div>
      </div>

      {items.length ? <div role="group" aria-label={t("Filter batch queue")} className="flex flex-wrap items-center gap-2">
        {batchFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={queueFilter === filter.id} onClick={() => setQueueFilter(filter.id)} style={{ color: filter.tone }} className={cn("inline-flex h-8 min-h-0 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 text-[12px] shadow-[var(--md-shadow-soft)] transition-colors hover:bg-[var(--md-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]", queueFilter === filter.id && "bg-[var(--md-surface-tint)] ring-1 ring-[var(--md-accent)]")}>
          <span className="font-medium tabular-nums">{filter.count}</span><span>{t(filter.label)}</span>
        </button>)}
      </div> : null}

      {items.length ? <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
          <div className="flex items-center justify-between border-b border-[var(--md-line)] px-4 py-3"><div><h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Batch queue")}</h2><p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Click to select · Shift for a range · Ctrl/Cmd for multiple.")}</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setItems((current) => current.map((item) => visibleItems.some((entry) => entry.item.id === item.id) ? { ...item, selected: true } : item))}>{t(queueFilter === "all" ? "Select all" : "Select visible")}</Button></div>
          <div className="max-h-[660px] overflow-y-auto divide-y divide-[var(--md-line)]">{visibleItems.map(({ item, issues, category }) => {
            const visibleStatus = category === "ready" ? "ready" : category === "attention" && item.status !== "failed" ? "needs_review" : item.status
            return <div key={item.id} onClick={(event) => selectDocument(item.id, event)} onContextMenu={(event) => { if (event.ctrlKey) { event.preventDefault(); selectDocument(item.id, event) } }} className={cn("flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-[var(--md-surface-soft)]", item.selected && "bg-[var(--md-surface-tint)]")}>
              <input aria-label={t("Select document")} type="checkbox" disabled={posting !== null} checked={item.selected} onClick={(event) => event.stopPropagation()} onChange={(event) => { update(item.id, { selected: event.target.checked }); setActiveId(item.id); selectionAnchor.current = item.id }} className="mt-1" />
              <button type="button" disabled={posting !== null} onClick={(event) => { event.stopPropagation(); selectDocument(item.id, event) }} aria-pressed={item.selected} className="min-w-0 flex-1 select-none rounded-[var(--md-radius-sm)] text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{item.fileName}</p><p className="mt-0.5 truncate text-[12px] text-[var(--md-subtle)]">{item.extraction?.supplierName || t(item.stage ? item.stage : "Waiting for review")}</p>{item.error ? <p className="mt-1 text-[11px] text-[var(--md-red)]">{t(item.error)}</p> : issues[0] && item.status !== "extracting" ? <p className="mt-1 text-[11px] text-[var(--md-amber)]">{t(issues[0])}</p> : null}</button>
              <StatusPill tone={visibleStatus === "ready" || visibleStatus === "posted" ? "teal" : visibleStatus === "failed" ? "red" : visibleStatus === "extracting" ? "blue" : "amber"}>{t(item.stage || visibleStatus.replaceAll("_", " "))}</StatusPill>
            </div>
          })}{!visibleItems.length ? <div className="space-y-2 px-4 py-6 text-center"><p className="text-[12px] text-[var(--md-subtle)]">{t("No documents in this status.")}</p><Button type="button" size="sm" variant="ghost" onClick={() => setQueueFilter("all")}>{t("Show all documents")}</Button></div> : null}</div>
        </section>

        <section className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          {active ? <DocumentEvidenceViewer key={active.id} title={t("Original document")} pages={activePreview?.pages ?? []} boxes={[]} className="2xl:sticky 2xl:top-3" bodyClassName="h-[min(65vh,760px)]" meta={<span className="max-w-[180px] truncate text-[11px] text-[var(--md-subtle)]" title={active.fileName}>{active.fileName}</span>} actions={activePreview?.originalUrl ? <a href={activePreview.originalUrl} download={active.fileName} className="rounded-[var(--md-radius-md)] px-2 py-1 text-[12px] text-[var(--md-accent)] hover:bg-[var(--md-surface-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">{t("Download original")}</a> : null} empty={<span role="status" className="text-[12px] text-[var(--md-subtle)]">{t(activePreview?.loading ? "Loading document preview…" : activePreview?.error || "Choose a document to preview.")}</span>} /> : null}
          <div className="min-w-0 space-y-4">
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
              {active.error ? <div className="mt-4 space-y-2"><p className="text-[12px] text-[var(--md-red)]">{t(active.error)}</p><Button type="button" size="sm" variant="outline" disabled={posting !== null} onClick={() => update(active.id, { status: "needs_review", error: "" })}>{t("Review for retry")}</Button></div> : null}
              {activeBlockers.length ? <div className="mt-4 flex flex-wrap items-center gap-1.5">{activeBlockers.map((issue) => <span key={issue} className="rounded-full bg-[color-mix(in_srgb,var(--md-amber),transparent_88%)] px-2.5 py-1 text-[11px] text-[var(--md-amber)]">{t(issue)}</span>)}{duplicateIds.has(active.id) && !active.duplicateAccepted ? <Button type="button" size="sm" variant="outline" onClick={() => update(active.id, { duplicateAccepted: true })}>{t("Keep this possible duplicate")}</Button> : null}</div> : activeEntry?.category === "ready" ? <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--md-teal)]"><Check className="size-4" />{t("Validated and ready for processing")}</div> : null}
            </div>
            <FinanceDocumentLineEditor lines={active.lines} onLinesChange={(lines) => update(active.id, { lines })} taxOptions={taxOptions} sourceKind="manual" currencyCode={active.currencyCode} credit={active.type === "debit_note"} disabled={posting !== null || ["draft", "review", "posted"].includes(active.status)} onClear={() => update(active.id, { lines: [] })} onImport={() => { toast.info(t("Use the batch drop area to import another supplier document.")) }} onExport={() => { toast.info(t("Create the finance draft before exporting its workbook.")) }} onPrint={() => { toast.info(t("Create the finance draft before printing a proforma.")) }} />
          </> : active ? <div className="grid min-h-64 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><div className="text-center">{active.status === "failed" ? <AlertCircle className="mx-auto size-6 text-[var(--md-red)]" /> : <LoaderCircle className="mx-auto size-6 animate-spin text-[var(--md-accent)]" />}<p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(active.error || "Reading supplier document")}</p></div></div> : null}
          </div>
        </section>
      </div> : loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : null}

      {items.length ? <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-float)]"><p role="status" aria-live="polite" className="text-[12px] text-[var(--md-subtle)]"><span data-i18n-skip dir="ltr">{selectedCount}</span> {t("selected")}{hiddenSelectedCount ? <> · <span data-i18n-skip dir="ltr">{hiddenSelectedCount}</span> {t("hidden by filter")}</> : null} · <span data-i18n-skip dir="ltr">{readySelected.length}</span> {t("ready to process")}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!readySelected.length || posting !== null} onClick={() => void processSelected("draft")}>{posting === "draft" ? <LoaderCircle className="animate-spin" /> : null}{t("Create drafts")}</Button><Button type="button" variant="outline" disabled={!readySelected.length || posting !== null} onClick={() => void processSelected("review")}>{posting === "review" ? <LoaderCircle className="animate-spin" /> : null}{t("Send for review")}</Button>{canApprove ? <Button type="button" disabled={!readySelected.length || posting !== null} onClick={() => void processSelected("post")}>{posting === "post" ? <LoaderCircle className="animate-spin" /> : <Check />}{t("Post selected")}</Button> : null}</div></div> : null}
    </div>
  </>
}
