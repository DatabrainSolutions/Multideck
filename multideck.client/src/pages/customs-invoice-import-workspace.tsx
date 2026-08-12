import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { ArrowLeft, Check, CheckCheck, CircleAlert, FileText, Merge, Minus, ShieldCheck, Sparkles, Split, Square } from "@/components/icons/hugeicons"
import { useReducedMotion } from "motion/react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import docsFolderAnimation from "@/assets/animations/docs-folder.json"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { DocumentEvidenceViewer, type EvidenceViewerBox, type EvidenceViewerPage } from "@/components/multideck/document-evidence-viewer"
import { DocumentExtractionProgress } from "@/components/multideck/document-extraction-progress"
import { FilterChips, SegmentedControl } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import {
  buildInvoiceOutputLines,
  createDefaultInvoiceSelections,
  groupInvoiceLines,
  invoiceOutputToDeclarationItems,
  type ExtractedInvoiceLine,
  type InvoiceConsolidationGroup,
  type InvoiceLineSelection,
} from "@/lib/customs-invoice-import"
import {
  clearCustomsInvoiceImportRecovery,
  readCustomsInvoiceImportRecovery,
  saveCustomsInvoiceImportRecovery,
} from "@/lib/customs-invoice-import-recovery"
import {
  cancelCommercialInvoiceExtraction,
  commercialInvoiceFileAccept,
  CommercialInvoiceExtractionError,
  extractCommercialInvoice,
  readCommercialInvoiceExtraction,
  type InvoiceDocumentMetadata,
  type InvoiceImportStage,
} from "@/lib/customs-invoice-import-api"
import { buildInvoiceLineEvidence, type EvidencePage, type InvoiceLineEvidence } from "@/lib/customs-invoice-evidence"
import { releasePdfPageImages, renderPdfPageImages, type RenderedPdfPage } from "@/lib/customs-invoice-pdf-preview"
import type { ExtractionStage } from "@/lib/document-extraction-progress"
import type { ExportDeclarationItem } from "@/lib/customs-declaration"
import { buildAccentRamp, useAccentPresetId } from "@/lib/accent-theme"
import { cn } from "@/lib/utils"

type ApplyMode = "replace" | "append"
type ReviewFilter = "all" | "attention" | "approved"
type ReviewTab = "lines" | "result"

const reviewFilters: readonly ReviewFilter[] = ["all", "attention", "approved"]
const reviewTabs: readonly ReviewTab[] = ["lines", "result"]
const emptyDocumentMetadata: InvoiceDocumentMetadata = {
  sourceFormat: "", sourceMimeType: "", converted: false, strategy: "passthrough", sheets: [], warnings: [],
  normalizerVersion: 0, pageCount: 0, previewUrl: "", previewExpiresAt: "",
}

export function CustomsInvoiceImportWorkspace({
  recoveryKey,
  onClose,
  onApply,
  existingItemCount = 0,
}: {
  recoveryKey: string
  onClose: () => void
  onApply: (items: ExportDeclarationItem[], mode: ApplyMode, sourceLineCount: number) => void
  existingItemCount?: number
}) {
  const { t } = useLanguage()
  const recovered = useMemo(() => readCustomsInvoiceImportRecovery(recoveryKey), [recoveryKey])
  const [extractionId, setExtractionId] = useState(() => recovered?.extractionId ?? "")
  const [invoiceName, setInvoiceName] = useState(() => recovered?.invoiceName ?? "")
  const [extractedInvoiceNumber, setExtractedInvoiceNumber] = useState(() => recovered?.extractedInvoiceNumber ?? "")
  const [lines, setLines] = useState<ExtractedInvoiceLine[]>(() => recovered?.lines ?? [])
  const [selections, setSelections] = useState<Record<string, InvoiceLineSelection>>(() => recovered?.selections ?? {})
  const [descriptionOverrides, setDescriptionOverrides] = useState<Record<string, string>>(() => recovered?.descriptionOverrides ?? {})
  // Rendered PDF page URLs belong to the previous component lifetime. Start the
  // restored review without stale evidence geometry rather than drawing boxes over
  // blank placeholder pages; the extracted fields and decisions remain complete.
  const [evidencePages, setEvidencePages] = useState<EvidencePage[]>([])
  const [documentPages, setDocumentPages] = useState<RenderedPdfPage[]>([])
  const [documentMetadata, setDocumentMetadata] = useState<InvoiceDocumentMetadata>(() => ({
    ...emptyDocumentMetadata,
    ...(recovered?.document ?? {}),
  }))
  const [activeLineId, setActiveLineId] = useState(() => recovered?.activeLineId ?? "")
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(() => recovered?.reviewFilter ?? "all")
  const [reviewTab, setReviewTab] = useState<ReviewTab>(() => recovered?.reviewTab ?? "lines")
  const [extracting, setExtracting] = useState(() => Boolean(recovered?.extractionId && !recovered.lines.length))
  const [stage, setStage] = useState<InvoiceImportStage | null>(null)
  const [extractionError, setExtractionError] = useState("")
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false)
  const extractionRequest = useRef(0)
  const abortExtraction = useRef<AbortController | null>(null)
  const documentPagesRef = useRef<RenderedPdfPage[]>([])
  const invoiceInputRef = useRef<HTMLInputElement>(null)
  const invoiceDragDepth = useRef(0)
  const reviewListRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupInvoiceLines(lines), [lines])
  const output = useMemo(() => buildInvoiceOutputLines(groups, selections, descriptionOverrides), [descriptionOverrides, groups, selections])
  const evidence = useMemo(() => buildInvoiceLineEvidence(lines, evidencePages), [evidencePages, lines])
  const attentionLineIds = useMemo(() => new Set(lines.filter(needsAttention).map((line) => line.id)), [lines])
  const includedCount = lines.filter((line) => selections[line.id]?.include).length
  const attentionCount = lines.filter((line) => attentionLineIds.has(line.id)).length
  const approvedPercent = lines.length ? Math.round((includedCount / lines.length) * 100) : 0
  const invoiceReference = (extractedInvoiceNumber || invoiceName.replace(/\.[^.]+$/, "")).slice(0, 35).toUpperCase()

  const visibleGroups = useMemo(() => groups.flatMap((group) => {
    const visible = group.lines.filter((line) => matchesFilter(line, reviewFilter, selections, attentionLineIds))
    return visible.length ? [{ group, visible }] : []
  }), [attentionLineIds, groups, reviewFilter, selections])
  const visibleLineIds = useMemo(() => visibleGroups.flatMap((entry) => entry.visible.map((line) => line.id)), [visibleGroups])

  const documentViewerPages = useMemo<EvidenceViewerPage[]>(() => {
    const shapes = new Map<number, EvidenceViewerPage>()
    evidencePages.forEach((page) => shapes.set(page.page, { page: page.page, width: page.width, height: page.height }))
    documentPages.forEach((page) => shapes.set(page.page, { page: page.page, width: page.width, height: page.height, url: page.url }))
    return [...shapes.values()].sort((left, right) => left.page - right.page)
  }, [documentPages, evidencePages])

  const documentBoxes = useMemo<EvidenceViewerBox[]>(() => lines.flatMap((line) => {
    const located = evidence[line.id]
    if (!located) return []
    return [{
      id: line.id,
      page: located.page,
      box: located.box,
      label: `${t("Line")} ${line.invoiceLine}`,
      approximate: located.approximate,
      tone: attentionLineIds.has(line.id) ? "amber" as const : "accent" as const,
    }]
  }), [attentionLineIds, evidence, lines, t])

  const extractionStages = useMemo<ExtractionStage[]>(() => [
    { id: "uploading", label: t("Uploading securely"), detail: t("Sending the invoice file to your private workspace."), ceiling: 20, expectedMs: 1_400 },
    { id: "converting", label: t("Preparing the document"), detail: t("Creating a review-safe PDF without clipping spreadsheet content."), ceiling: 52, expectedMs: 3_500 },
    { id: "extracting", label: t("Finding the item lines"), detail: t("Reading the complete document and extracting goods rows, quantities, values and codes."), ceiling: 88, expectedMs: 9_000 },
    { id: "organising", label: t("Preparing the review"), detail: t("Grouping by commodity code and locating each line on the page."), ceiling: 99, expectedMs: 1_200 },
  ], [t])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => () => {
    abortExtraction.current?.abort()
    releasePdfPageImages(documentPagesRef.current)
  }, [])

  useEffect(() => {
    if (!recovered?.extractionId || recovered.lines.length) return
    const requestId = extractionRequest.current + 1
    extractionRequest.current = requestId
    const controller = new AbortController()
    abortExtraction.current = controller
    setStage("extracting")
    setExtracting(true)
    setExtractionError("")

    readCommercialInvoiceExtraction(recovered.extractionId, controller.signal)
      .then((result) => {
        if (extractionRequest.current !== requestId) return
        setExtractionId(result.extractionId)
        setExtractedInvoiceNumber(result.invoiceNumber)
        setLines(result.lines)
        setSelections(Object.keys(recovered.selections).length ? recovered.selections : createDefaultInvoiceSelections(result.lines))
        setEvidencePages(result.evidencePages)
        setDocumentMetadata(result.document)
        setActiveLineId(recovered.activeLineId || result.lines[0]?.id || "")
        void renderPreparedPreview(result.document.previewUrl, requestId, controller.signal)
      })
      .catch((error: unknown) => {
        if (extractionRequest.current !== requestId || controller.signal.aborted) return
        const message = error instanceof CommercialInvoiceExtractionError ? error.message : "Unable to restore this invoice review. Upload the invoice again."
        setExtractionError(t(message))
      })
      .finally(() => {
        if (extractionRequest.current === requestId) {
          setExtracting(false)
          setStage(null)
        }
      })

    return () => controller.abort()
  }, [recovered, t])

  useEffect(() => {
    if (!extractionId && !lines.length) return
    saveCustomsInvoiceImportRecovery(recoveryKey, {
      extractionId,
      invoiceName,
      extractedInvoiceNumber,
      lines,
      selections,
      descriptionOverrides,
      evidencePages,
      document: withoutPreview(documentMetadata),
      activeLineId,
      reviewFilter,
      reviewTab,
    })
  }, [activeLineId, descriptionOverrides, documentMetadata, evidencePages, extractedInvoiceNumber, extractionId, invoiceName, lines, recoveryKey, reviewFilter, reviewTab, selections])

  function updateSelection(lineId: string, update: Partial<InvoiceLineSelection>) {
    setSelections((current) => ({ ...current, [lineId]: { ...current[lineId], ...update } }))
  }

  function setLinesApproval(lineIds: string[], include: boolean) {
    setSelections((current) => ({
      ...current,
      ...Object.fromEntries(lineIds.map((lineId) => [lineId, {
        include,
        consolidate: include ? current[lineId]?.consolidate ?? false : false,
      }])),
    }))
  }

  function toggleLineApproval(line: ExtractedInvoiceLine) {
    setActiveLineId(line.id)
    setLinesApproval([line.id], !selections[line.id]?.include)
  }

  function setGroupConsolidation(lineIds: string[], consolidate: boolean) {
    setSelections((current) => ({
      ...current,
      ...Object.fromEntries(lineIds.map((lineId) => [lineId, { ...current[lineId], consolidate: current[lineId]?.include ? consolidate : false }])),
    }))
  }

  function releaseDocumentPages() {
    releasePdfPageImages(documentPagesRef.current)
    documentPagesRef.current = []
    setDocumentPages([])
  }

  async function renderPreparedPreview(previewUrl: string, requestId: number, signal: AbortSignal) {
    if (!previewUrl) return
    try {
      const response = await fetch(previewUrl, { credentials: "omit", signal })
      if (!response.ok) return
      const pdf = await response.blob()
      if (pdf.type && pdf.type !== "application/pdf") return
      releaseDocumentPages()
      await renderPdfPageImages(pdf, {
        signal,
        onPage: (page) => {
          if (extractionRequest.current !== requestId) {
            releasePdfPageImages([page])
            return
          }
          documentPagesRef.current = [...documentPagesRef.current, page]
          setDocumentPages(documentPagesRef.current)
        },
      })
    } catch {
      // Extracted fields remain reviewable if the short-lived visual preview expires.
    }
  }

  async function selectInvoice(file: File | undefined) {
    if (!file) return
    if (extractionId) void cancelCommercialInvoiceExtraction(extractionId)
    const requestId = extractionRequest.current + 1
    extractionRequest.current = requestId
    const isCurrent = () => extractionRequest.current === requestId

    abortExtraction.current?.abort()
    const controller = new AbortController()
    abortExtraction.current = controller
    clearCustomsInvoiceImportRecovery(recoveryKey)
    const nextExtractionId = crypto.randomUUID()

    releaseDocumentPages()
    setExtractionId(nextExtractionId)
    setInvoiceName(file.name)
    setExtractedInvoiceNumber("")
    setLines([])
    setSelections({})
    setDescriptionOverrides({})
    setEvidencePages([])
    setDocumentMetadata(emptyDocumentMetadata)
    setActiveLineId("")
    setReviewFilter("all")
    setReviewTab("lines")
    setExtractionError("")
    setStage("uploading")
    setExtracting(true)

    // A source PDF is already the exact provider input. Other formats are rendered
    // only from the server-prepared PDF returned after conversion.
    if (file.name.toLowerCase().endsWith(".pdf")) void renderPdfPageImages(file, {
      signal: controller.signal,
      onPage: (page) => {
        if (!isCurrent()) {
          releasePdfPageImages([page])
          return
        }
        documentPagesRef.current = [...documentPagesRef.current, page]
        setDocumentPages(documentPagesRef.current)
      },
    })

    try {
      const result = await extractCommercialInvoice(file, {
        extractionId: nextExtractionId,
        declarationId: recoveryKey,
        signal: controller.signal,
        onStage: (nextStage) => { if (isCurrent()) setStage(nextStage) },
      })
      if (!isCurrent()) return
      setExtractionId(result.extractionId)
      setExtractedInvoiceNumber(result.invoiceNumber)
      setLines(result.lines)
      setSelections(createDefaultInvoiceSelections(result.lines))
      setEvidencePages(result.evidencePages)
      setDocumentMetadata(result.document)
      setActiveLineId(result.lines[0]?.id ?? "")
      void renderPreparedPreview(result.document.previewUrl, requestId, controller.signal)
      // No success toast: the review screen is the confirmation, and a toast would sit over
      // the apply buttons at the very moment the operator wants them.
    } catch (error) {
      if (!isCurrent() || controller.signal.aborted) return
      const message = error instanceof CommercialInvoiceExtractionError ? error.message : "Unable to import this invoice. Try again."
      const translatedMessage = t(message)
      setExtractionError(translatedMessage)
      toast.error(t("Unable to import invoice"), { description: translatedMessage })
    } finally {
      if (isCurrent()) {
        setExtracting(false)
        setStage(null)
      }
    }
  }

  function cancelExtraction() {
    const currentExtractionId = extractionId
    extractionRequest.current += 1
    abortExtraction.current?.abort()
    abortExtraction.current = null
    releaseDocumentPages()
    setExtracting(false)
    setStage(null)
    setExtractionId("")
    setInvoiceName("")
    setExtractionError("")
    setDocumentMetadata(emptyDocumentMetadata)
    clearCustomsInvoiceImportRecovery(recoveryKey)
    if (currentExtractionId) void cancelCommercialInvoiceExtraction(currentExtractionId)
  }

  function handleInvoiceDragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (extracting || !event.dataTransfer.types.includes("Files")) return
    invoiceDragDepth.current += 1
    setIsDraggingInvoice(true)
  }

  function handleInvoiceDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    invoiceDragDepth.current = Math.max(0, invoiceDragDepth.current - 1)
    if (invoiceDragDepth.current === 0) setIsDraggingInvoice(false)
  }

  function handleInvoiceDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!extracting) event.dataTransfer.dropEffect = "copy"
  }

  function handleInvoiceDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    invoiceDragDepth.current = 0
    setIsDraggingInvoice(false)
    if (extracting) return
    const files = Array.from(event.dataTransfer.files)
    void selectInvoice(files[0])
  }

  function focusLine(lineId: string) {
    setActiveLineId(lineId)
    reviewListRef.current?.querySelector<HTMLButtonElement>(`[data-approve-line="${lineId}"]`)?.focus()
  }

  function moveActiveLine(offset: number) {
    if (!visibleLineIds.length) return
    const current = visibleLineIds.indexOf(activeLineId)
    const next = current < 0 ? 0 : Math.min(visibleLineIds.length - 1, Math.max(0, current + offset))
    focusLine(visibleLineIds[next])
  }

  function handleReviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, [contenteditable='true']")) return

    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault()
      moveActiveLine(1)
      return
    }
    if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault()
      moveActiveLine(-1)
      return
    }

    const activeLine = lines.find((line) => line.id === activeLineId)
    if (event.key === "c" && activeLine) {
      event.preventDefault()
      const group = groups.find((entry) => entry.lines.some((line) => line.id === activeLine.id))
      if (group && canConsolidateGroup(group)) updateSelection(activeLine.id, { consolidate: !selections[activeLine.id]?.consolidate })
      return
    }
    if (event.key === "a") {
      event.preventDefault()
      setLinesApproval(lines.map((line) => line.id), includedCount < lines.length)
    }
  }

  function applyToDeclaration(mode: ApplyMode) {
    if (!output.length) {
      toast.warning(t("Approve at least one invoice line"))
      return
    }
    clearCustomsInvoiceImportRecovery(recoveryKey)
    if (extractionId) void cancelCommercialInvoiceExtraction(extractionId)
    onApply(invoiceOutputToDeclarationItems(output, invoiceReference), mode, includedCount)
  }

  function discardAndClose() {
    const currentExtractionId = extractionId
    extractionRequest.current += 1
    abortExtraction.current?.abort()
    releaseDocumentPages()
    clearCustomsInvoiceImportRecovery(recoveryKey)
    if (currentExtractionId) void cancelCommercialInvoiceExtraction(currentExtractionId)
    onClose()
  }

  const showInvoiceDropzone = !extracting && !lines.length

  return <div className="fixed inset-0 isolate z-[80] h-[100dvh] w-screen overflow-hidden bg-[var(--md-bg)] text-[var(--md-ink)]" data-testid="invoice-import-workspace">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--md-line)] bg-[var(--md-surface)] px-5 py-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)]" aria-label={t("Back to declaration")}><ArrowLeft className="size-4 rtl:rotate-180" /></button>
          <div className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]"><Sparkles className="size-5" /></div>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <h1 className="text-[21px] font-medium tracking-[-0.025em]">{t("Invoice import")}</h1>
              {lines.length ? <StatusPill tone="teal">{includedCount} {t("of")} {lines.length} {t("approved")}</StatusPill> : <StatusPill tone="teal">{t("Review before applying")}</StatusPill>}
            </span>
            <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]" dir="auto">{invoiceName || t("Review invoice lines, choose what to combine, then add them to the declaration.")}</p>
          </span>
        </div>
        <Button type="button" variant="ghost" onClick={discardAndClose}>{t("Cancel")}</Button>
      </header>

      <main className={cn("min-h-0 flex-1 overflow-y-auto p-4 lg:p-6", showInvoiceDropzone && "flex flex-col")}>
        <div className={cn("mx-auto w-full max-w-[1720px]", showInvoiceDropzone && "my-auto")}>
          {extracting ? <DocumentExtractionProgress
            title={t("Preparing invoice lines")}
            detail={t("This may take a moment. You can review every line before applying it.")}
            fileName={invoiceName}
            stages={extractionStages}
            activeStageId={stage}
            previewUrl={documentPages[0]?.url}
            pageCount={documentPages.length || undefined}
            footnote={<span className="flex items-start gap-1.5"><ShieldCheck className="mt-px size-3 shrink-0 text-[var(--md-green)]" />{t("Your invoice is processed securely. Nothing is added to the declaration until you approve it.")}</span>}
            onCancel={cancelExtraction}
          /> : null}

          {showInvoiceDropzone ? <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
            <input ref={invoiceInputRef} id="commercial-invoice-file" type="file" accept={commercialInvoiceFileAccept} className="sr-only" onChange={(event) => { void selectInvoice(event.target.files?.[0]); event.currentTarget.value = "" }} />
            <button
              type="button"
              className={cn(
                "group flex min-h-[360px] w-full flex-col items-center justify-center px-6 py-10 text-center outline-none transition-[background,box-shadow,transform] duration-200 ease-out focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a28)] motion-reduce:transition-none",
                isDraggingInvoice ? "scale-[0.995] bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_2px_var(--md-accent)]" : "bg-[var(--md-surface)] hover:bg-[var(--md-accent-a04)] hover:shadow-[inset_0_0_0_1px_var(--md-accent-a18)]",
              )}
              onClick={() => invoiceInputRef.current?.click()}
              onDragEnter={handleInvoiceDragEnter}
              onDragLeave={handleInvoiceDragLeave}
              onDragOver={handleInvoiceDragOver}
              onDrop={handleInvoiceDrop}
              aria-describedby="commercial-invoice-upload-detail commercial-invoice-upload-safety"
              data-testid="commercial-invoice-dropzone"
            >
              <AccentFolderAnimation active={isDraggingInvoice} />
              {extractionError ? <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[rgba(221,138,43,0.12)] px-2.5 py-1 text-[10px] font-medium text-[var(--md-amber)]"><CircleAlert className="size-3" />{t("Unable to import invoice")}</span> : null}
              <span className="mt-2 block text-[18px] font-medium tracking-[-0.015em]">{t(isDraggingInvoice ? "Release to import this invoice" : extractionError ? "Choose another commercial invoice" : "Drop a commercial invoice here")}</span>
              {extractionError ? <span className="mt-2 block max-w-xl text-[12px] leading-5 text-[var(--md-text)]" role="alert">{extractionError}</span> : null}
              <span id="commercial-invoice-upload-detail" className="mt-2 block text-[12px] leading-5 text-[var(--md-text)]">{t("PDF, Excel, CSV, Word or image, up to 10 MB.")}</span>
              <span id="commercial-invoice-upload-safety" className="mt-1 block max-w-xl text-[10px] leading-4 text-[var(--md-subtle)]">{t("Its item lines will appear for review before anything changes in the declaration.")}</span>
            </button>
          </Surface> : null}

          {!extracting && lines.length ? <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)]">
            <DocumentEvidenceViewer
              className="h-[58dvh] xl:sticky xl:top-0 xl:h-[calc(100dvh-11.5rem)]"
              pages={documentViewerPages}
              boxes={documentBoxes}
              activeBoxId={activeLineId}
              onSelectBox={focusLine}
              title={t("Prepared document")}
              meta={<StatusPill>{documentBoxes.length} {t("of")} {lines.length} {t("located")}</StatusPill>}
              empty={t(recovered
                ? "Your extracted lines and review choices were restored. The prepared document is loading."
                : "The document preview is still being prepared.")}
            />

            <section className="flex min-w-0 flex-col gap-3" aria-label={t("Invoice line review")}>
              {documentMetadata.sheets.length || documentMetadata.warnings.length ? <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
                <div className="px-4 py-3">
                  <h2 className="text-[12px] font-medium">{t("Prepared document")}</h2>
                  {documentMetadata.sheets.some((sheet) => sheet.status === "included") ? <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-[var(--md-text)]">
                    <span>{t("Included sheets")}:</span>
                    {documentMetadata.sheets.filter((sheet) => sheet.status === "included").map((sheet) => <span key={sheet.name} dir="auto" className="rounded-full bg-[var(--md-surface-tint)] px-2 py-0.5 font-medium">{sheet.name}</span>)}
                  </p> : null}
                  {documentMetadata.warnings.length ? <ul className="mt-2 space-y-1 text-[10px] leading-4 text-[var(--md-amber)]">
                    {documentMetadata.warnings.map((warning) => <li key={warning} className="flex items-start gap-1.5"><CircleAlert className="mt-0.5 size-3 shrink-0" /><span>{localizedDocumentWarning(warning, t)}</span></li>)}
                  </ul> : null}
                </div>
              </Surface> : null}
              <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0">
                    <h2 className="text-[14px] font-medium">{t("Approve the lines to import")}</h2>
                    <p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">
                      {countLabel(lines.length, "invoice line", "invoice lines", t)} · {includedCount} {t("approved")} · {countLabel(output.length, "declaration line", "declaration lines", t)}
                      {attentionCount ? ` · ${countLabel(attentionCount, "needs a check", "need a check", t)}` : ""}
                    </p>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLinesApproval(lines.map((line) => line.id), true)} disabled={includedCount === lines.length}><CheckCheck className="size-3.5" />{t("Approve all")}</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLinesApproval(lines.map((line) => line.id), false)} disabled={!includedCount}><Square className="size-3.5" />{t("Clear")}</Button>
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-4 py-2.5">
                  <FilterChips
                    options={reviewFilters}
                    activeOption={reviewFilter}
                    onChange={(option) => setReviewFilter(option as ReviewFilter)}
                    labelForOption={(option) => filterLabel(option as ReviewFilter, t, lines.length, includedCount, attentionCount)}
                  />
                  <SegmentedControl
                    options={reviewTabs}
                    value={reviewTab}
                    onChange={setReviewTab}
                    ariaLabel={t("Review view")}
                    className="h-9 py-0.5"
                    renderOption={(option) => option === "lines" ? `${t("Invoice lines")}` : `${t("Result")} · ${output.length}`}
                  />
                </div>
              </Surface>

              {reviewTab === "lines" ? <div ref={reviewListRef} onKeyDown={handleReviewKeyDown} className="space-y-3">
                {visibleGroups.map(({ group, visible }) => <ReviewGroup
                  key={group.id}
                  group={group}
                  visibleLines={visible}
                  selections={selections}
                  descriptionOverride={descriptionOverrides[group.id]}
                  activeLineId={activeLineId}
                  attentionLineIds={attentionLineIds}
                  evidence={evidence}
                  onToggleLine={toggleLineApproval}
                  onFocusLine={setActiveLineId}
                  onApproveGroup={setLinesApproval}
                  onConsolidate={setGroupConsolidation}
                  onToggleConsolidate={(lineId, consolidate) => updateSelection(lineId, { consolidate })}
                  onDescriptionChange={(value) => setDescriptionOverrides((current) => ({ ...current, [group.id]: value }))}
                />)}
                {!visibleGroups.length ? <Surface className="rounded-[var(--md-radius-xl)] text-center">
                  <p className="text-[11.5px] text-[var(--md-text)]">{t("No invoice lines match this filter.")}</p>
                </Surface> : null}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-[var(--md-subtle)]">
                  <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t("move")}</span>
                  <span className="inline-flex items-center gap-1"><Kbd>Space</Kbd> {t("approve")}</span>
                  <span className="inline-flex items-center gap-1"><Kbd>C</Kbd> {t("combine")}</span>
                  <span className="inline-flex items-center gap-1"><Kbd>A</Kbd> {t("approve all")}</span>
                </p>
              </div> : <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
                <header className="flex items-center justify-between gap-3 border-b border-[var(--md-line)] px-4 py-3">
                  <span>
                    <h3 className="text-[13px] font-medium">{t("Declaration lines to be created")}</h3>
                    <p className="mt-1 text-[10px] text-[var(--md-subtle)]">{t("Every line keeps a link back to the invoice lines it came from.")}</p>
                  </span>
                  <StatusPill tone="blue">{output.length} {t("lines")}</StatusPill>
                </header>
                <div className="divide-y divide-[var(--md-line)]">
                  {output.map((line, index) => <div key={line.id} className="bg-[var(--md-surface)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="text-[11px]">{t("Line")} {index + 1}</strong>
                          <span className="text-[10px] text-[var(--md-accent)]" dir="ltr">{line.commodityCode || t("No commodity code")}</span>
                          {line.consolidated ? <StatusPill tone="teal">{t("Combined")}</StatusPill> : null}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{line.description}</span>
                      </span>
                      <strong className="shrink-0 text-[11px] tabular-nums">{formatCurrency(line.itemPrice, line.currency)}</strong>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] text-[var(--md-subtle)]">
                      <span>{t("From invoice lines")}</span>
                      {line.sourceLineNumbers.map((sourceLine) => <span key={sourceLine} className="rounded-full bg-[var(--md-surface-tint)] px-1.5 py-0.5 font-medium tabular-nums">{sourceLine}</span>)}
                      <span className="ms-auto tabular-nums">{formatAmount(line.quantity)} {t("units")} · {formatAmount(line.netMass)} kg {t("net")}</span>
                    </div>
                  </div>)}
                  {!output.length ? <div className="px-5 py-12 text-center">
                    <CircleAlert className="mx-auto size-5 text-[var(--md-amber)]" />
                    <p className="mt-2 text-[11px] text-[var(--md-text)]">{t("Approve at least one invoice line to see the result.")}</p>
                  </div> : null}
                </div>
              </Surface>}
            </section>
          </div> : null}
        </div>
      </main>

      {!extracting && lines.length ? <footer className="border-t border-[var(--md-line)] bg-[var(--md-surface)] px-4 py-3 lg:px-7">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="min-w-0">
              <strong className="block text-[13px] font-medium tabular-nums">{includedCount} {t("of")} {countLabel(lines.length, "invoice line approved", "invoice lines approved", t)}</strong>
              <span className="mt-1 block h-1 w-[132px] overflow-hidden rounded-full bg-[var(--md-surface-tint)]">
                <span className="block h-full rounded-full bg-[var(--md-accent)] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${approvedPercent}%` }} />
              </span>
            </span>
            <span className="text-[11px] leading-4 text-[var(--md-text)]">
              {countLabel(output.length, "declaration line will be created", "declaration lines will be created", t)}
              {attentionCount ? <span className="mt-0.5 block text-[10px] text-[var(--md-amber)]">{countLabel(attentionCount, "line still needs a check", "lines still need a check", t)}</span> : null}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => applyToDeclaration("replace")} disabled={!output.length}>
              {existingItemCount ? `${t("Replace")} ${countLabel(existingItemCount, "current item", "current items", t)}` : t("Replace items")}
            </Button>
            <Button type="button" onClick={() => applyToDeclaration("append")} disabled={!output.length}>
              <Check className="size-4" />{t("Add")} {countLabel(output.length, "line to declaration", "lines to declaration", t)}
            </Button>
          </span>
        </div>
      </footer> : null}
    </div>
  </div>
}

function ReviewGroup({
  group,
  visibleLines,
  selections,
  descriptionOverride,
  activeLineId,
  attentionLineIds,
  evidence,
  onToggleLine,
  onFocusLine,
  onApproveGroup,
  onConsolidate,
  onToggleConsolidate,
  onDescriptionChange,
}: {
  group: InvoiceConsolidationGroup
  visibleLines: ExtractedInvoiceLine[]
  selections: Record<string, InvoiceLineSelection>
  descriptionOverride?: string
  activeLineId: string
  attentionLineIds: Set<string>
  evidence: Record<string, InvoiceLineEvidence>
  onToggleLine: (line: ExtractedInvoiceLine) => void
  onFocusLine: (lineId: string) => void
  onApproveGroup: (lineIds: string[], include: boolean) => void
  onConsolidate: (lineIds: string[], consolidate: boolean) => void
  onToggleConsolidate: (lineId: string, consolidate: boolean) => void
  onDescriptionChange: (value: string) => void
}) {
  const { t } = useLanguage()
  const groupLineIds = group.lines.map((line) => line.id)
  const includedLineIds = groupLineIds.filter((lineId) => selections[lineId]?.include)
  const consolidatedLineIds = includedLineIds.filter((lineId) => selections[lineId]?.consolidate)
  const canConsolidate = canConsolidateGroup(group)
  const groupState = includedLineIds.length === groupLineIds.length ? "all" : includedLineIds.length ? "some" : "none"

  return <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--md-line)] px-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={groupState === "all" ? true : groupState === "some" ? "mixed" : false}
        aria-label={`${t("Approve every line in group")} ${group.commodityCode || t("No commodity code")}`}
        onClick={() => onApproveGroup(groupLineIds, groupState !== "all")}
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[var(--md-radius-sm)] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a28)] motion-reduce:transition-none",
          groupState === "none" ? "text-[var(--md-muted)] shadow-[inset_0_0_0_1.5px_currentColor] hover:text-[var(--md-accent)]" : "bg-[var(--md-accent)] text-white",
        )}
      >
        {groupState === "all" ? <Check className="size-3" strokeWidth={3} /> : groupState === "some" ? <Minus className="size-3" strokeWidth={3} /> : null}
      </button>
      <span className="text-[12.5px] font-medium" dir="ltr">{group.commodityCode || t("No commodity code")}</span>
      {canConsolidate
        ? <StatusPill tone="teal">{t("Can be combined")}</StatusPill>
        : <StatusPill tone={group.commodityCode ? undefined : "amber"}>{group.commodityCode ? t("Single line") : t("Needs a commodity code")}</StatusPill>}
      <span className="text-[10px] tabular-nums text-[var(--md-subtle)]">{countLabel(group.lines.length, "invoice line", "invoice lines", t)}{canConsolidate ? ` · ${group.descriptionSimilarity}% ${t("alike")}` : ""}</span>
      {canConsolidate ? <span className="ms-auto flex gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => onConsolidate(includedLineIds, true)}><Merge className="size-3.5" />{t("Combine")}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onConsolidate(groupLineIds, false)}><Split className="size-3.5" />{t("Keep separate")}</Button>
      </span> : null}
      {canConsolidate && consolidatedLineIds.length >= 2 ? <div className="w-full">
        <label className="mb-1 block text-[10px] font-medium text-[var(--md-subtle)]" htmlFor={`${group.id}-description`}>{t("Combined goods description")}</label>
        <Input
          id={`${group.id}-description`}
          value={descriptionOverride ?? group.lines[0].description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="h-8 border-0 bg-[var(--md-field-bg)] text-[11px] shadow-[var(--md-shadow-line)]"
        />
      </div> : null}
    </header>

    <div className="divide-y divide-[var(--md-line)]">
      {visibleLines.map((line) => <ReviewLineRow
        key={line.id}
        line={line}
        selection={selections[line.id] ?? { include: false, consolidate: false }}
        canConsolidate={canConsolidate}
        active={line.id === activeLineId}
        attention={attentionLineIds.has(line.id)}
        located={Boolean(evidence[line.id])}
        onToggle={() => onToggleLine(line)}
        onFocus={() => onFocusLine(line.id)}
        onToggleConsolidate={(consolidate) => onToggleConsolidate(line.id, consolidate)}
      />)}
    </div>

    {canConsolidate ? <footer className="border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-3 py-2 text-[10px] text-[var(--md-subtle)]">
      {consolidatedLineIds.length >= 2
        ? `${consolidatedLineIds.length} ${t("approved lines become one declaration line")}`
        : t("These lines share a commodity code, so they can become one declaration line.")}
    </footer> : null}
  </Surface>
}

function ReviewLineRow({
  line,
  selection,
  canConsolidate,
  active,
  attention,
  located,
  onToggle,
  onFocus,
  onToggleConsolidate,
}: {
  line: ExtractedInvoiceLine
  selection: InvoiceLineSelection
  canConsolidate: boolean
  active: boolean
  attention: boolean
  located: boolean
  onToggle: () => void
  onFocus: () => void
  onToggleConsolidate: (consolidate: boolean) => void
}) {
  const { t } = useLanguage()

  return <div className={cn("flex items-stretch", active && "bg-[var(--md-accent-a04)]")}>
    <button
      type="button"
      role="switch"
      aria-checked={selection.include}
      data-approve-line={line.id}
      onClick={onToggle}
      // Selecting is deliberate: a click or keyboard focus moves the box on the document,
      // passing the pointer over a row does not.
      onFocus={onFocus}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-start outline-none transition-[background,box-shadow,opacity] duration-150 ease-out hover:bg-[var(--md-accent-a04)] focus-visible:ring-[2px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a28)] motion-reduce:transition-none",
        active && "shadow-[inset_2px_0_0_var(--md-accent)]",
        !selection.include && "opacity-60",
      )}
    >
      <span className={cn(
        "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full transition-colors duration-150 motion-reduce:transition-none",
        selection.include ? "bg-[var(--md-accent)] text-white" : "text-[var(--md-muted)] shadow-[inset_0_0_0_1.5px_currentColor]",
      )}>
        {selection.include ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-medium">{line.description}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-[var(--md-subtle)]">
          <span>{t("Line")} {line.invoiceLine}</span>
          <span>{t("Page")} {line.page}</span>
          {line.sku ? <span className="font-medium tabular-nums" dir="ltr">{line.sku}</span> : null}
          {line.originCountry ? <span dir="ltr">{line.originCountry}</span> : null}
          {attention ? <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(221,138,43,0.12)] px-1.5 font-medium text-[var(--md-amber)]"><CircleAlert className="size-2.5" />{t("Check this line")}</span> : null}
          {located ? null : <span className="inline-flex items-center gap-1 text-[var(--md-muted)]"><FileText className="size-2.5" />{t("Not found on the page")}</span>}
        </span>
      </span>
      <span className="shrink-0 text-end">
        <strong className="block text-[11.5px] tabular-nums">{formatCurrency(line.quantity * line.unitPrice, line.currency)}</strong>
        <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--md-subtle)]">{formatAmount(line.quantity)} × {formatCurrency(line.unitPrice, line.currency)}</span>
      </span>
    </button>
    {canConsolidate ? <button
      type="button"
      role="switch"
      aria-checked={selection.consolidate}
      aria-label={`${t("Combine invoice line")} ${line.invoiceLine}`}
      title={t("Combine with the other lines that share this commodity code")}
      disabled={!selection.include}
      onClick={() => onToggleConsolidate(!selection.consolidate)}
      className={cn(
        "grid w-11 shrink-0 place-items-center border-s border-[var(--md-line)] outline-none transition-colors duration-150 focus-visible:ring-[2px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a28)] disabled:opacity-40 motion-reduce:transition-none",
        selection.consolidate ? "bg-[var(--md-selected-bg)] text-[var(--md-accent)]" : "text-[var(--md-muted)] hover:bg-[var(--md-hover)]",
      )}
    >
      <Merge className="size-3.5" />
    </button> : null}
  </div>
}

/** Keeps a count and its noun together so both readings stay grammatical in every language. */
function countLabel(count: number, singular: string, plural: string, t: (text: string) => string) {
  return `${count} ${t(count === 1 ? singular : plural)}`
}

function canConsolidateGroup(group: InvoiceConsolidationGroup) {
  return Boolean(group.commodityCode) && group.lines.length > 1
}

function needsAttention(line: ExtractedInvoiceLine) {
  return !line.commodityCode || !(line.quantity * line.unitPrice > 0)
}

function matchesFilter(
  line: ExtractedInvoiceLine,
  filter: ReviewFilter,
  selections: Record<string, InvoiceLineSelection>,
  attentionLineIds: Set<string>,
) {
  if (filter === "attention") return attentionLineIds.has(line.id)
  if (filter === "approved") return Boolean(selections[line.id]?.include)
  return true
}

function filterLabel(filter: ReviewFilter, t: (text: string) => string, total: number, approved: number, attention: number) {
  if (filter === "attention") return `${t("Need a check")} ${attention}`
  if (filter === "approved") return `${t("Approved")} ${approved}`
  return `${t("All")} ${total}`
}

type LottieColour = [number, number, number, number]
type LottieShape = {
  ty?: string
  c?: { k?: LottieColour }
  it?: LottieShape[]
}
type LottieLayer = { nm?: string; shapes?: LottieShape[] }
type LottieAnimation = { layers?: LottieLayer[] }

function AccentFolderAnimation({ active }: { active: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const { resolvedTheme } = useTheme()
  const accentPresetId = useAccentPresetId()
  const isDark = resolvedTheme === "dark"
  const animationData = useMemo(() => {
    const ramp = buildAccentRamp(accentPresetId)
    const accent = isDark ? ramp.dark.accent : ramp.light.accent
    const folderColours = [hexToLottieColour(ramp.brand.deep), hexToLottieColour(accent)]
    const animation = JSON.parse(JSON.stringify(docsFolderAnimation)) as LottieAnimation
    const folder = animation.layers?.find((layer) => layer.nm === "Folder")
    let colourIndex = 0

    function recolour(shapes: LottieShape[] | undefined) {
      for (const shape of shapes ?? []) {
        if (shape.ty === "fl" && shape.c) {
          shape.c.k = folderColours[Math.min(colourIndex, folderColours.length - 1)]
          colourIndex += 1
        }
        recolour(shape.it)
      }
    }

    recolour(folder?.shapes)
    return JSON.stringify(animation)
  }, [accentPresetId, isDark])

  return <span className={cn("pointer-events-none block size-[148px] transition-transform duration-200 ease-out motion-reduce:transition-none sm:size-[166px]", active && "scale-[1.06]")} aria-hidden="true">
    <DotLottieReact
      key={`${accentPresetId}-${isDark ? "dark" : "light"}`}
      data={animationData}
      autoplay={!shouldReduceMotion}
      loop={!shouldReduceMotion}
      speed={active ? 1.25 : 1}
      className="size-full"
    />
  </span>
}

function hexToLottieColour(hex: string): LottieColour {
  const value = hex.replace("#", "")
  const normalised = value.length === 3 ? value.split("").map((character) => `${character}${character}`).join("") : value
  return [
    Number.parseInt(normalised.slice(0, 2), 16) / 255,
    Number.parseInt(normalised.slice(2, 4), 16) / 255,
    Number.parseInt(normalised.slice(4, 6), 16) / 255,
    1,
  ]
}

/** Keeps summed weights and quantities free of floating-point tails such as 15.60000000000001. */
function formatAmount(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value)
}

function formatCurrency(value: number, currency: string) {
  return currency
    ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function withoutPreview(document: InvoiceDocumentMetadata) {
  const { previewUrl: _previewUrl, previewExpiresAt: _previewExpiresAt, ...persistable } = document
  return persistable
}

function localizedDocumentWarning(warning: string, t: (text: string) => string) {
  const hidden = warning.match(/^(\d+) hidden (?:sheet was|sheets were) not included\.$/)
  if (hidden) return `${hidden[1]} ${t(Number(hidden[1]) === 1 ? "hidden sheet was not included" : "hidden sheets were not included")}.`
  const empty = warning.match(/^(\d+) empty (?:sheet was|sheets were) skipped\.$/)
  if (empty) return `${empty[1]} ${t(Number(empty[1]) === 1 ? "empty sheet was skipped" : "empty sheets were skipped")}.`
  const formulas = warning.match(/^(\d+) (?:formula was|formulas were) not recalculated;/)
  if (formulas) return `${formulas[1]} ${t(Number(formulas[1]) === 1 ? "formula used its saved displayed value" : "formulas used their saved displayed values")}.`
  const missing = warning.match(/^(\d+) (?:formula has|formulas have) no saved result/)
  if (missing) return `${missing[1]} ${t(Number(missing[1]) === 1 ? "formula has no saved result and needs checking" : "formulas have no saved result and need checking")}.`
  if (warning.includes("content-safe layout")) return t("The spreadsheet was prepared in a content-safe layout so every visible cell can be reviewed.")
  return t(warning)
}
