import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, CircleAlert, FileSearch, FileText, LoaderCircle, Merge, RotateCcw, ShieldCheck, Sparkles, Split, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"
import {
  buildInvoiceOutputLines,
  createDefaultInvoiceSelections,
  groupInvoiceLines,
  invoiceOutputToDeclarationItems,
  type ExtractedInvoiceLine,
  type InvoiceLineSelection,
} from "@/lib/customs-invoice-import"
import {
  CommercialInvoiceExtractionError,
  extractCommercialInvoice,
} from "@/lib/customs-invoice-import-api"
import type { ExportDeclarationItem } from "@/lib/customs-declaration"
import { cn } from "@/lib/utils"

type ApplyMode = "replace" | "append"

export function CustomsInvoiceImportWorkspace({ onClose, onApply }: { onClose: () => void; onApply: (items: ExportDeclarationItem[], mode: ApplyMode, sourceLineCount: number) => void }) {
  const { t } = useLanguage()
  const [invoiceName, setInvoiceName] = useState("")
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [extractedInvoiceNumber, setExtractedInvoiceNumber] = useState("")
  const [lines, setLines] = useState<ExtractedInvoiceLine[]>([])
  const [selections, setSelections] = useState<Record<string, InvoiceLineSelection>>({})
  const [descriptionOverrides, setDescriptionOverrides] = useState<Record<string, string>>({})
  const [applyMode, setApplyMode] = useState<ApplyMode>("replace")
  const [extracting, setExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState("")
  const extractionRequest = useRef(0)
  const groups = useMemo(() => groupInvoiceLines(lines), [lines])
  const output = useMemo(() => buildInvoiceOutputLines(groups, selections, descriptionOverrides), [descriptionOverrides, groups, selections])
  const includedCount = lines.filter((line) => selections[line.id]?.include).length
  const excludedCount = lines.length - includedCount
  const consolidatedGroupCount = output.filter((line) => line.consolidated).length
  const invoiceReference = (extractedInvoiceNumber || invoiceName.replace(/\.[^.]+$/, "")).slice(0, 35).toUpperCase()

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  function updateSelection(lineId: string, update: Partial<InvoiceLineSelection>) {
    setSelections((current) => ({ ...current, [lineId]: { ...current[lineId], ...update } }))
  }

  function setGroupConsolidation(lineIds: string[], consolidate: boolean) {
    setSelections((current) => ({
      ...current,
      ...Object.fromEntries(lineIds.map((lineId) => [lineId, { ...current[lineId], consolidate: current[lineId]?.include ? consolidate : false }])),
    }))
  }

  async function selectInvoice(file: File | undefined) {
    if (!file) return
    const requestId = extractionRequest.current + 1
    extractionRequest.current = requestId
    setInvoiceName(file.name)
    setInvoiceFile(file)
    setExtractedInvoiceNumber("")
    setLines([])
    setSelections({})
    setDescriptionOverrides({})
    setExtractionError("")
    setExtracting(true)

    try {
      const result = await extractCommercialInvoice(file)
      if (extractionRequest.current !== requestId) return
      setExtractedInvoiceNumber(result.invoiceNumber)
      setLines(result.lines)
      setSelections(createDefaultInvoiceSelections(result.lines))
      toast.success(t("Invoice extraction complete"), { description: `${result.lines.length} ${t("item lines are ready for review")}` })
    } catch (error) {
      if (extractionRequest.current !== requestId) return
      const message = error instanceof CommercialInvoiceExtractionError ? error.message : "The invoice could not be extracted. Try again."
      const translatedMessage = t(message)
      setExtractionError(translatedMessage)
      toast.error(t("Invoice extraction failed"), { description: translatedMessage })
    } finally {
      if (extractionRequest.current === requestId) setExtracting(false)
    }
  }

  function applyToDeclaration() {
    if (!output.length) {
      toast.warning(t("Select at least one invoice line"))
      return
    }
    onApply(invoiceOutputToDeclarationItems(output, invoiceReference), applyMode, includedCount)
  }

  return <div className="fixed inset-0 isolate z-[80] h-[100dvh] w-screen overflow-hidden bg-[var(--md-bg)] text-[var(--md-ink)]" data-testid="invoice-import-workspace">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--md-line)] bg-[var(--md-surface)] px-5 py-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)]" aria-label={t("Back to declaration")}><ArrowLeft className="size-4 rtl:rotate-180" /></button>
          <div className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]"><Sparkles className="size-5" /></div>
          <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><h1 className="text-[21px] font-medium tracking-[-0.025em]">{t("AI invoice import")}</h1><StatusPill tone="teal">{t("Extraction preview")}</StatusPill></span><p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]">{t("Review source lines, control consolidation and create declaration items.")}</p></span>
        </div>
        <div className="flex items-center gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button type="button" onClick={applyToDeclaration} disabled={extracting || !output.length}><Check className="size-4" />{t("Apply to declaration")}</Button></div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-[1680px] space-y-4">
          <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
            <div className="grid gap-px bg-[var(--md-line)] lg:grid-cols-[1.15fr_1fr_auto]">
              <div className="flex min-w-0 items-center gap-3 bg-[var(--md-surface)] px-4 py-3"><div className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]">{extracting ? <LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" /> : <FileText className="size-4 text-[var(--md-accent)]" />}</div><span className="min-w-0"><span className="block truncate text-[12px] font-medium">{invoiceName || t("No invoice selected")}</span><span className="mt-0.5 block text-[10px] text-[var(--md-subtle)]" aria-live="polite">{extracting ? t("Extracting item lines with Mistral OCR 4") : extractionError ? t("Invoice extraction needs attention") : lines.length ? t("AI extraction available for review") : t("Awaiting secure AI extraction")}</span></span></div>
              <div className="flex items-center gap-3 bg-[var(--md-surface)] px-4 py-3"><ShieldCheck className="size-4 shrink-0 text-[var(--md-green)]" /><span className="text-[11px] leading-4 text-[var(--md-text)]">{t("The API key stays on the App server. Your PDF is sent securely to Mistral for extraction.")}</span></div>
              <div className="flex flex-wrap items-center justify-end gap-2 bg-[var(--md-surface)] px-4 py-3"><Button asChild variant="outline" size="sm" disabled={extracting}><label htmlFor="commercial-invoice-file" className={extracting ? "cursor-not-allowed" : "cursor-pointer"}><Upload className="size-3.5" />{t("Choose invoice")}<input id="commercial-invoice-file" type="file" accept="application/pdf,.pdf" disabled={extracting} className="sr-only" onChange={(event) => { void selectInvoice(event.target.files?.[0]); event.currentTarget.value = "" }} /></label></Button></div>
            </div>
          </Surface>

          <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
            <div className="grid divide-y divide-[var(--md-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
              <Metric label={t("Extracted lines")} value={String(lines.length)} />
              <Metric label={t("Included lines")} value={String(includedCount)} tone="teal" />
              <Metric label={t("Excluded lines")} value={String(excludedCount)} tone={excludedCount ? "amber" : undefined} />
              <Metric label={t("Consolidated groups")} value={String(consolidatedGroupCount)} tone="blue" />
              <Metric label={t("Declaration lines produced")} value={String(output.length)} />
            </div>
          </Surface>

          {!lines.length ? <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">{extracting ? <><div className="grid size-14 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]"><LoaderCircle className="size-6 animate-spin" /></div><h2 className="mt-4 text-[18px] font-medium">{t("Extracting invoice")}</h2><p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{t("Mistral OCR 4 is reading the document and structuring its item lines. This can take a moment for scanned invoices.")}</p></> : extractionError ? <><div className="grid size-14 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-amber)]"><CircleAlert className="size-6" /></div><h2 className="mt-4 text-[18px] font-medium">{t("Invoice extraction failed")}</h2><p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{extractionError}</p><Button type="button" variant="outline" className="mt-5" disabled={!invoiceFile} onClick={() => { if (invoiceFile) void selectInvoice(invoiceFile) }}><RotateCcw className="size-4" />{t("Try extraction again")}</Button></> : <><div className="grid size-14 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]"><FileSearch className="size-6" /></div><h2 className="mt-4 text-[18px] font-medium">{t("Choose a commercial invoice")}</h2><p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{t("Choose a PDF commercial invoice up to 10 MB. Its item lines will appear here for review before anything changes in the declaration.")}</p></>}</div></Surface> : <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.7fr)]">
            <section className="min-w-0 space-y-3" aria-label={t("Consolidation groups")}>
              <div className="flex flex-wrap items-end justify-between gap-3 px-1"><span><h2 className="text-[15px] font-medium">{t("Selective consolidation")}</h2><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Commodity code forms the primary group. Uncheck Consolidate to keep a source line separate.")}</p></span><StatusPill>{groups.length} {t("suggested groups")}</StatusPill></div>
              {groups.map((group) => {
                const includedLineIds = group.lines.filter((line) => selections[line.id]?.include).map((line) => line.id)
                const consolidatedLineIds = includedLineIds.filter((lineId) => selections[lineId]?.consolidate)
                const canConsolidate = Boolean(group.commodityCode) && group.lines.length > 1
                return <Surface key={group.id} padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-line)] px-4 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-mono text-[13px] font-semibold" dir="ltr">{group.commodityCode || t("No commodity code")}</span>{canConsolidate ? <StatusPill tone="teal">{t("Consolidation suggested")}</StatusPill> : <StatusPill tone={group.commodityCode ? undefined : "amber"}>{group.commodityCode ? t("Standalone") : t("Needs classification")}</StatusPill>}<span className="text-[10px] text-[var(--md-subtle)]">{group.lines.length} {t("source lines")} · {group.descriptionSimilarity}% {t("description similarity")}</span></div>
                    {canConsolidate ? <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => setGroupConsolidation(includedLineIds, true)}><Merge className="size-3.5" />{t("Combine included")}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setGroupConsolidation(group.lines.map((line) => line.id), false)}><Split className="size-3.5" />{t("Keep separate")}</Button></div> : null}
                    {canConsolidate ? <div className="w-full"><label className="mb-1 block text-[10px] font-medium text-[var(--md-subtle)]">{t("Consolidated goods description")}</label><Input value={descriptionOverrides[group.id] ?? group.lines[0].description} onChange={(event) => setDescriptionOverrides((current) => ({ ...current, [group.id]: event.target.value }))} className="h-8 border-0 bg-[var(--md-field-bg)] text-[11px] shadow-[var(--md-shadow-line)]" /></div> : null}
                  </header>
                  <div className="overflow-x-auto"><table className="w-full min-w-[860px] table-fixed text-start"><thead className="bg-[var(--md-surface-soft)] text-[9px] font-medium uppercase tracking-[0.04em] text-[var(--md-subtle)]"><tr><th className="w-[72px] px-3 py-2 text-start">{t("Include")}</th><th className="w-[90px] px-3 py-2 text-start">{t("Consolidate")}</th><th className="w-[80px] px-3 py-2 text-start">{t("Invoice line")}</th><th className="w-[110px] px-3 py-2 text-start">{t("SKU")}</th><th className="px-3 py-2 text-start">{t("Source description")}</th><th className="w-[80px] px-3 py-2 text-end">{t("Quantity")}</th><th className="w-[100px] px-3 py-2 text-end">{t("Line value")}</th><th className="w-[90px] px-3 py-2 text-end">{t("Confidence")}</th></tr></thead><tbody className="divide-y divide-[var(--md-line)]">{group.lines.map((line) => {
                    const selection = selections[line.id] ?? { include: false, consolidate: false }
                    return <tr key={line.id} className={cn("bg-[var(--md-surface)]", selection.consolidate && "bg-[var(--md-selected-bg)]", !selection.include && "opacity-55")}><td className="px-3 py-2"><Checkbox aria-label={`${t("Include invoice line")} ${line.invoiceLine}`} checked={selection.include} onCheckedChange={(checked) => updateSelection(line.id, { include: checked === true, consolidate: checked === true && canConsolidate ? selection.consolidate : false })} /></td><td className="px-3 py-2"><Checkbox aria-label={`${t("Consolidate invoice line")} ${line.invoiceLine}`} disabled={!canConsolidate || !selection.include} checked={selection.consolidate} onCheckedChange={(checked) => updateSelection(line.id, { consolidate: checked === true })} /></td><td className="px-3 py-2 text-[11px] font-medium">{line.invoiceLine}<span className="ms-1 text-[9px] text-[var(--md-muted)]">p{line.page}</span></td><td className="truncate px-3 py-2 font-mono text-[10px]" dir="ltr">{line.sku}</td><td className="truncate px-3 py-2 text-[11px]">{line.description}</td><td className="px-3 py-2 text-end text-[11px] tabular-nums">{line.quantity}</td><td className="px-3 py-2 text-end text-[11px] tabular-nums">{formatCurrency(line.quantity * line.unitPrice, line.currency)}</td><td className="px-3 py-2 text-end"><span className={cn("text-[10px] font-medium", line.confidence >= 95 ? "text-[var(--md-green)]" : "text-[var(--md-amber)]")}>{line.confidence}%</span></td></tr>
                  })}</tbody></table></div>
                  {canConsolidate ? <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-4 py-2 text-[10px] text-[var(--md-subtle)]"><span>{consolidatedLineIds.length} {t("of")} {includedLineIds.length} {t("included lines will consolidate")}</span><span>{Math.max(0, includedLineIds.length - consolidatedLineIds.length)} {t("will remain standalone")}</span></footer> : null}
                </Surface>
              })}
            </section>

            <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
              <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
                <header className="border-b border-[var(--md-line)] px-4 py-3"><div className="flex items-center justify-between gap-3"><span><h2 className="text-[14px] font-medium">{t("Declaration line preview")}</h2><p className="mt-1 text-[10px] text-[var(--md-subtle)]">{t("Every output line retains its source invoice evidence.")}</p></span><StatusPill tone="blue">{output.length} {t("lines")}</StatusPill></div></header>
                <div className="max-h-[460px] divide-y divide-[var(--md-line)] overflow-y-auto">{output.map((line, index) => <div key={line.id} className="bg-[var(--md-surface)] px-4 py-3"><div className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-[11px]">{t("Declaration line")} {index + 1}</strong><span className="font-mono text-[10px] text-[var(--md-accent)]" dir="ltr">{line.commodityCode}</span>{line.consolidated ? <StatusPill tone="teal">{t("Consolidated")}</StatusPill> : <StatusPill>{t("Standalone")}</StatusPill>}</span><span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{line.description}</span></span><strong className="shrink-0 text-[11px] tabular-nums">{formatCurrency(line.itemPrice, line.currency)}</strong></div><div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] text-[var(--md-subtle)]"><span>{t("Source")}</span>{line.sourceLineNumbers.map((sourceLine) => <span key={sourceLine} className="rounded-full bg-[var(--md-surface-tint)] px-1.5 py-0.5 font-medium">{sourceLine}</span>)}<span className="ms-auto">{line.quantity} {t("units")} · {line.netMass} kg {t("net")}</span></div></div>)}{!output.length ? <div className="px-5 py-12 text-center"><CircleAlert className="mx-auto size-5 text-[var(--md-amber)]" /><p className="mt-2 text-[11px] text-[var(--md-text)]">{t("No invoice lines are selected.")}</p></div> : null}</div>
                <div className="space-y-3 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] p-4"><div><p className="text-[10px] font-medium text-[var(--md-subtle)]">{t("Apply behaviour")}</p><div className="mt-2 grid grid-cols-2 gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]"><ModeButton active={applyMode === "replace"} onClick={() => setApplyMode("replace")} title={t("Replace items")} detail={t("Start with imported lines")} /><ModeButton active={applyMode === "append"} onClick={() => setApplyMode("append")} title={t("Append items")} detail={t("Keep current lines too")} /></div></div><div className="flex gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" /><p className="text-[10px] leading-4 text-[var(--md-text)]">{t("AI proposes the extraction. Deterministic checks and staff approval control what reaches the declaration.")}</p></div><Button type="button" className="w-full" onClick={applyToDeclaration} disabled={extracting || !output.length}><Check className="size-4" />{t("Apply")} {output.length} {t("declaration lines")}</Button></div>
              </Surface>
            </aside>
          </div>}
        </div>
      </main>
    </div>
  </div>
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "teal" | "amber" | "blue" }) {
  return <div className="bg-[var(--md-surface)] px-4 py-3"><span className="text-[10px] text-[var(--md-subtle)]">{label}</span><strong className={cn("mt-1 block text-[19px] font-medium", tone === "teal" && "text-[var(--md-accent)]", tone === "amber" && "text-[var(--md-amber)]", tone === "blue" && "text-[var(--md-blue)]")}>{value}</strong></div>
}

function ModeButton({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
  return <button type="button" onClick={onClick} className={cn("rounded-[var(--md-radius-md)] px-3 py-2 text-start", active ? "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)]" : "text-[var(--md-text)] hover:bg-[var(--md-hover)]")}><strong className="block text-[11px] font-medium">{title}</strong><span className="mt-0.5 block text-[9px] opacity-70">{detail}</span></button>
}

function formatCurrency(value: number, currency: string) {
  return currency
    ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}
