import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, CheckCircle2, CircleAlert, Copy, ExternalLink, FileCheck2, Link2, Plus, Sparkles, Trash2 } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { CustomsInvoiceImportWorkspace } from "@/pages/customs-invoice-import-workspace"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import {
  createExportDeclarationItem,
  createStandaloneExportDraft,
  declarationCompletion,
  type DeclarationIssue,
  type ExportDeclarationItem,
  type StandaloneExportDraft,
} from "@/lib/customs-declaration"
import { createEmptyCustomsReferenceData, useCustomsReferenceData, type CustomsCatalogCode, type CustomsReferenceData } from "@/lib/customs-reference-data"
import { listStandaloneExportDrafts, loadStandaloneExportDraft, saveStandaloneExportDraft, type CustomsDraftSummary } from "@/lib/customs-drafts-api"
import { hasCustomsInvoiceImportRecovery, moveCustomsInvoiceImportRecovery } from "@/lib/customs-invoice-import-recovery"

type DeclarationKind = "export" | "import"
type EditorTab = "declaration" | "parties" | "transport" | "documents" | "items" | "review"
type ItemTab = "commodity" | "packaging" | "values" | "documents" | "parties"

const CustomsBoxVisibilityContext = createContext(false)
const CustomsReferenceDataContext = createContext<{ data: CustomsReferenceData; loading: boolean; error: string | null }>({ data: createEmptyCustomsReferenceData(), loading: true, error: null })

export function CustomsDeclarationsPage({
  route,
  navigate,
}: {
  route: string
  navigate: (path: string) => void
}) {
  const { t } = useLanguage()
  const jobRelated = route.startsWith("/customs/job-related")
  const kind: DeclarationKind = route.includes("/import") ? "import" : "export"
  const creating = route.endsWith("/new")
  const editMatch = route.match(/^\/customs\/standalone\/export\/([0-9a-f-]{36})$/i)

  if (!jobRelated && kind === "export" && (creating || editMatch)) {
    return <StandaloneExportEditor navigate={navigate} declarationId={editMatch?.[1]} />
  }

  const base = jobRelated ? "/customs/job-related" : "/customs/standalone"
  return <CustomsDeclarationsRegister jobRelated={jobRelated} kind={kind} base={base} navigate={navigate} t={t} />
}

function CustomsDeclarationsRegister({ jobRelated, kind, base, navigate, t }: {
  jobRelated: boolean
  kind: DeclarationKind
  base: string
  navigate: (path: string) => void
  t: (text: string) => string
}) {
  const [drafts, setDrafts] = useState<CustomsDraftSummary[]>([])
  const [loading, setLoading] = useState(!jobRelated && kind === "export")
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (jobRelated || kind !== "export") return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    listStandaloneExportDrafts()
      .then((savedDrafts) => {
        if (!cancelled) setDrafts(savedDrafts)
      })
      .catch((reason: unknown) => {
        console.error("Customs drafts could not be loaded.", reason)
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "Customs drafts could not be loaded.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [jobRelated, kind])

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--md-accent)]">{t("Customs & Compliance")}</p>
          <h1 className="mt-2 text-[28px] font-medium tracking-[-0.035em] text-[var(--md-ink)]">
            {t(jobRelated ? "Job Related Declarations" : "Stand Alone Declarations")}
          </h1>
          <p className="mt-2 max-w-[680px] text-[13px] leading-5 text-[var(--md-text)]">
            {t(jobRelated
              ? "Declarations created from an existing Multideck job, with shipment data brought forward safely."
              : "Create and manage declarations that are not linked to a Multideck job.")}
          </p>
        </div>
        <div className="grid grid-cols-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]">
          <KindButton active={kind === "export"} onClick={() => navigate(`${base}/export`)}>{t("Export")}</KindButton>
          <KindButton active={kind === "import"} onClick={() => navigate(`${base}/import`)}>{t("Import")}</KindButton>
        </div>
      </header>

      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-3 border-b border-[var(--md-line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t(`${kind === "export" ? "Export" : "Import"} declarations`)}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
              {t(jobRelated ? "Select a job before starting the declaration." : "Drafts and submitted declarations will appear here.")}
            </p>
          </span>
          <Button
            type="button"
            disabled={kind === "import" || jobRelated}
            onClick={() => navigate("/customs/standalone/export/new")}
          >
            <Plus className="size-4" />
            {t(`New ${kind} declaration`)}
          </Button>
        </div>
        {loading ? <div className="grid min-h-[240px] place-items-center px-6 py-12 text-center text-[13px] text-[var(--md-text)]">{t("Loading saved declarations")}</div> : null}
        {loadError ? <div className="grid min-h-[240px] place-items-center px-6 py-12 text-center"><div className="max-w-[520px]"><CircleAlert className="mx-auto size-6 text-[var(--md-red)]" /><h3 className="mt-3 text-[15px] font-medium text-[var(--md-ink)]">{t("Saved declarations unavailable")}</h3><p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Refresh the page to try loading the declaration register again.")}</p></div></div> : null}
        {!loading && !loadError && drafts.length ? <div className="divide-y divide-[var(--md-line)]">
          <div className="hidden grid-cols-[1.3fr_1fr_90px_90px_120px_120px] gap-4 bg-[var(--md-surface-tint)] px-5 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)] md:grid">
            <span>{t("Reference")}</span><span>{t("Trader reference")}</span><span>{t("Items")}</span><span>{t("Destination")}</span><span>{t("Value")}</span><span>{t("Last saved")}</span>
          </div>
          {drafts.map((savedDraft) => <button key={savedDraft.id} type="button" onClick={() => navigate(`/customs/standalone/export/${savedDraft.id}`)} className="grid w-full gap-2 px-5 py-4 text-start hover:bg-[var(--md-hover)] md:grid-cols-[1.3fr_1fr_90px_90px_120px_120px] md:items-center md:gap-4">
            <span><strong className="block text-[12px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{savedDraft.reference}</strong><StatusPill className="mt-1">{t(savedDraft.status === "draft" ? "Draft" : savedDraft.status)}</StatusPill></span>
            <span className="text-[12px] text-[var(--md-text)]">{savedDraft.traderReference || t("Not set")}</span>
            <span className="text-[12px] text-[var(--md-text)]">{savedDraft.itemCount}</span>
            <span className="text-[12px] text-[var(--md-text)]">{savedDraft.destinationCountry || t("Not set")}</span>
            <span className="text-[12px] text-[var(--md-text)]">{formatDraftAmount(savedDraft.amount, savedDraft.currency)}</span>
            <span className="text-[11px] text-[var(--md-subtle)]">{new Date(savedDraft.updatedAt).toLocaleString()}</span>
          </button>)}
        </div> : null}
        {!loading && !loadError && !drafts.length ? <div className="grid min-h-[300px] place-items-center px-6 py-12 text-center">
          <div className="max-w-[440px]">
            <div className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
              <FileCheck2 className="size-5" strokeWidth={1.4} />
            </div>
            <h3 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">
              {t(kind === "export" && !jobRelated ? "Ready for the first standalone export" : "This declaration flow is next")}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
              {t(kind === "export" && !jobRelated
                ? "Create a draft using the new section-based CDS workspace."
                : "We will enable this after the standalone export workflow is agreed and connected.")}
            </p>
          </div>
        </div> : null}
      </Surface>
    </div>
  )
}

function formatDraftAmount(amount: number | null, currency: string | null) {
  if (amount === null) return "—"
  if (!currency) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

function StandaloneExportEditor({ navigate, declarationId }: { navigate: (path: string) => void; declarationId?: string }) {
  const { t } = useLanguage()
  const referenceData = useCustomsReferenceData("export")
  const [draft, setDraft] = useState<StandaloneExportDraft>(createStandaloneExportDraft)
  const [tab, setTab] = useState<EditorTab>("declaration")
  const [itemTab, setItemTab] = useState<ItemTab>("commodity")
  const [activeItemId, setActiveItemId] = useState(draft.items[0].id)
  const [showDataElements, setShowDataElements] = useState(true)
  const [showCustomsBoxNumbers, setShowCustomsBoxNumbers] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [validated, setValidated] = useState(false)
  const invoiceImportRecoveryKey = declarationId ?? "new"
  const [invoiceImportOpen, setInvoiceImportOpen] = useState(() => hasCustomsInvoiceImportRecovery(invoiceImportRecoveryKey))
  const [focusTarget, setFocusTarget] = useState<{ field: string; nonce: number } | null>(null)
  const [loadingDraft, setLoadingDraft] = useState(Boolean(declarationId))
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const completion = useMemo(() => declarationCompletion(draft), [draft])
  const activeItem = draft.items.find((item) => item.id === activeItemId) ?? draft.items[0]
  const issueFields = useMemo(() => new Set(validated ? completion.issues.map((issue) => issue.field) : []), [completion.issues, validated])
  const activeItemIssueFields = useMemo(() => new Set(validated ? completion.issues.filter((issue) => issue.itemId === activeItemId).map((issue) => issue.field) : []), [activeItemId, completion.issues, validated])
  const fallbackUrl = import.meta.env.VITE_ICUSTOMS_APP_URL || "https://app-tdr.customscloud.co/cds/export"

  useEffect(() => {
    setInvoiceImportOpen(hasCustomsInvoiceImportRecovery(invoiceImportRecoveryKey))
  }, [invoiceImportRecoveryKey])

  useEffect(() => {
    if (!declarationId) return
    let cancelled = false
    setLoadingDraft(true)
    setDraftLoadError(null)
    loadStandaloneExportDraft(declarationId)
      .then((savedDraft) => {
        if (cancelled) return
        setDraft(savedDraft)
        setActiveItemId(savedDraft.items[0].id)
      })
      .catch((reason: unknown) => {
        console.error("The Customs draft could not be loaded.", reason)
        if (!cancelled) setDraftLoadError(reason instanceof Error ? reason.message : "The Customs draft could not be loaded.")
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false)
      })
    return () => { cancelled = true }
  }, [declarationId])

  useEffect(() => {
    if (!focusTarget) return
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-customs-field="${focusTarget.field}"]`)
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
      target?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [activeItemId, focusTarget, itemTab, tab])

  function update<K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function updateItem<K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) {
    updateItemById(activeItem.id, field, value)
  }

  function updateItemById<K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item),
    }))
  }

  function validate() {
    setValidated(true)
    const first = completion.issues[0]
    if (first) {
      setTab(first.scope === "item" ? "items" : generalTabForField(first.field))
      toast.warning(t("Declaration needs attention"), { description: `${completion.issues.length} ${t("checks remain")}` })
    } else {
      setTab("review")
      toast.success(t("Current form checks passed"))
    }
  }

  async function saveDraft() {
    if (savingDraft) return
    setSavingDraft(true)
    try {
      const saved = await saveStandaloneExportDraft(draft, declarationId)
      moveCustomsInvoiceImportRecovery(invoiceImportRecoveryKey, saved.id)
      setDraft((current) => ({ ...current, multideckReference: saved.reference }))
      toast.success(t("Draft saved"), { description: saved.reference })
      navigate("/customs/standalone/export")
    } catch (reason) {
      console.error("The Customs draft could not be saved.", reason)
      toast.error(t("Draft could not be saved"), { description: t("Your changes remain on screen. Try saving again.") })
    } finally {
      setSavingDraft(false)
    }
  }

  function fixIssue(issue: DeclarationIssue) {
    setValidated(true)
    if (issue.scope === "item") {
      if (issue.itemId) setActiveItemId(issue.itemId)
      setItemTab(itemTabForField(issue.field))
      setTab("items")
    } else {
      setTab(generalTabForField(issue.field))
    }
    setFocusTarget({ field: issue.field, nonce: Date.now() })
  }

  function addItem() {
    const item = createExportDeclarationItem(draft.items.length + 1)
    setDraft((current) => ({ ...current, items: [...current.items, item] }))
    setActiveItemId(item.id)
    setTab("items")
    setItemTab("commodity")
  }

  function duplicateItem(itemId = activeItem.id) {
    const sourceItem = draft.items.find((item) => item.id === itemId) ?? activeItem
    const item = { ...sourceItem, id: `item-${Date.now()}` }
    setDraft((current) => ({ ...current, items: [...current.items, item] }))
    setActiveItemId(item.id)
  }

  function removeItem(itemId = activeItem.id) {
    if (draft.items.length === 1) return
    const items = draft.items.filter((item) => item.id !== itemId)
    setDraft((current) => ({ ...current, items }))
    setActiveItemId((current) => current === itemId ? items[0].id : current)
  }

  function applyInvoiceItems(items: ExportDeclarationItem[], mode: "replace" | "append", sourceLineCount: number) {
    const importKey = Date.now()
    const importedItems = items.map((item, index) => ({ ...item, id: `invoice-${importKey}-${index + 1}` }))
    setDraft((current) => ({ ...current, items: mode === "append" ? [...current.items, ...importedItems] : importedItems }))
    setActiveItemId(importedItems[0].id)
    setItemTab("commodity")
    setTab("items")
    setInvoiceImportOpen(false)
    toast.success(t("Invoice lines added"), { description: `${sourceLineCount} ${t("source lines became")} ${importedItems.length} ${t("declaration lines")}` })
  }

  const editorTabs: Array<{ id: EditorTab; label: string; meta: string }> = [
    { id: "declaration", label: t("Declaration"), meta: t("Identity & totals") },
    { id: "parties", label: t("Parties"), meta: t("People & EORIs") },
    { id: "transport", label: t("Transport"), meta: t("Movement & location") },
    { id: "documents", label: t("Documents & offices"), meta: t("References & control") },
    { id: "items", label: `${t("Items")} (${draft.items.length})`, meta: t("Goods lines") },
    { id: "review", label: t("Review"), meta: `${completion.percent}% ${t("complete")}` },
  ]

  if (loadingDraft) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><p className="text-[13px] text-[var(--md-text)]">{t("Loading saved declaration")}</p></Surface>
  }

  if (draftLoadError) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><CircleAlert className="size-5 text-[var(--md-red)]" /><h1 className="mt-3 text-[18px] font-medium text-[var(--md-ink)]">{t("Saved declaration unavailable")}</h1><p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Return to the declaration register and choose the draft again.")}</p><Button type="button" variant="outline" className="mt-4" onClick={() => navigate("/customs/standalone/export")}>{t("Back to standalone declarations")}</Button></Surface>
  }

  return (
    <CustomsReferenceDataContext.Provider value={referenceData}>
    <CustomsBoxVisibilityContext.Provider value={showCustomsBoxNumbers}>
    <div className="min-w-0 max-w-full space-y-4 overflow-x-clip" data-testid="standalone-export-editor">
      <header>
        <div className="flex min-w-0 flex-col justify-center">
          <button type="button" onClick={() => navigate("/customs/standalone/export")} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)] hover:text-[var(--md-accent)]">
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("Back to standalone declarations")}
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-medium tracking-[-0.035em] text-[var(--md-ink)]">{t(declarationId ? "Edit export declaration" : "New export declaration")}</h1>
            <StatusPill tone="teal">{t("Standalone export")}</StatusPill>
            <StatusPill>{t("Draft")}</StatusPill>
          </div>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">{t("Complete one focused section at a time. Move between sections whenever you need.")}</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Toggle checked={showDataElements} onChange={setShowDataElements}>{t("Data Elements")}</Toggle>
          <Toggle checked={showCustomsBoxNumbers} onChange={setShowCustomsBoxNumbers}>{t("Customs box numbers")}</Toggle>
          <Toggle checked={showOptional} onChange={setShowOptional}>{t("Optional fields")}</Toggle>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={savingDraft} onClick={() => void saveDraft()}>{t(savingDraft ? "Saving draft" : "Save draft")}</Button>
          <Button asChild variant="outline" size="sm" className="h-9"><a href={fallbackUrl} target="_blank" rel="noreferrer"><ICustomsLogo className="size-3.5" />{t("Open iCustoms")}<ExternalLink className="size-3.5" /></a></Button>
          <Button type="button" size="sm" className="h-9" onClick={validate}><FileCheck2 className="size-3.5" />{t("Validate")}</Button>
        </div>
      </div>

      <nav className="max-w-full overflow-x-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]" aria-label={t("Declaration sections")}>
        <div className="grid min-w-[840px] grid-cols-6 gap-1">
          {editorTabs.map((entry, index) => (
            <button key={entry.id} type="button" onClick={() => setTab(entry.id)} aria-current={tab === entry.id ? "step" : undefined} className={cn("flex min-h-[52px] items-center gap-2 rounded-[var(--md-radius-lg)] px-3 text-start", tab === entry.id ? "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)]" : "text-[var(--md-text)] hover:bg-[var(--md-hover)]")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium", tab === entry.id ? "bg-[var(--md-accent)] text-white" : "bg-[var(--md-surface-tint)]")}>{index + 1}</span>
              <span className="min-w-0"><strong className="block truncate text-[12px] font-medium">{entry.label}</strong><span className="block truncate text-[10px] opacity-70">{entry.meta}</span></span>
            </button>
          ))}
        </div>
      </nav>

      {referenceData.loading ? <Surface padding="sm" className="rounded-[var(--md-radius-lg)]"><p className="text-[11px] text-[var(--md-text)]">{t("Loading Customs reference data")}</p></Surface> : null}
      {referenceData.error ? <Surface padding="sm" className="rounded-[var(--md-radius-lg)]"><div className="flex items-center gap-2 text-[11px] text-[var(--md-red)]"><CircleAlert className="size-4 shrink-0" /><span><strong>{t("Customs reference data unavailable")}</strong> {t("Selection fields remain locked until the database catalogue is available.")}</span></div></Surface> : null}

      {tab === "declaration" ? <DeclarationSection draft={draft} update={update} showDataElements={showDataElements} issues={issueFields} highlightedField={focusTarget?.field} t={t} /> : null}
      {tab === "parties" ? <PartiesSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} highlightedField={focusTarget?.field} t={t} /> : null}
      {tab === "transport" ? <TransportSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} highlightedField={focusTarget?.field} t={t} /> : null}
      {tab === "documents" ? <DocumentsSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} highlightedField={focusTarget?.field} t={t} /> : null}
      {tab === "items" ? <ItemsSection items={draft.items} activeItem={activeItem} activeItemId={activeItemId} onSelectItem={setActiveItemId} onAdd={addItem} onOpenInvoiceImport={() => setInvoiceImportOpen(true)} onDuplicate={duplicateItem} onRemove={removeItem} itemTab={itemTab} onItemTabChange={setItemTab} update={updateItem} updateRow={updateItemById} showDataElements={showDataElements} showOptional={showOptional} issues={activeItemIssueFields} validated={validated} highlightedField={focusTarget?.field} t={t} /> : null}
      {tab === "review" ? <ReviewSection draft={draft} completion={completion} fallbackUrl={fallbackUrl} onValidate={validate} onFixIssue={fixIssue} t={t} /> : null}
    </div>
    {invoiceImportOpen ? <CustomsInvoiceImportWorkspace key={invoiceImportRecoveryKey} recoveryKey={invoiceImportRecoveryKey} onClose={() => setInvoiceImportOpen(false)} onApply={applyInvoiceItems} existingItemCount={draft.items.length} /> : null}
    </CustomsBoxVisibilityContext.Provider>
    </CustomsReferenceDataContext.Provider>
  )
}

function useReferenceOptions(catalogue: CustomsCatalogCode, t: (text: string) => string, blankLabel?: string, codeOnly = false) {
  const { data } = useContext(CustomsReferenceDataContext)
  return useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const options: Array<readonly [string, string]> = data[catalogue].map((option) => [
      option.code,
      codeOnly ? option.code : `${option.code} - ${t(option.name)}`,
    ])
    return blankLabel ? [["", t(blankLabel)], ...options] : options
  }, [blankLabel, catalogue, codeOnly, data, t])
}

type SectionProps = {
  draft: StandaloneExportDraft
  update: <K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) => void
  showDataElements: boolean
  issues: Set<string>
  highlightedField?: string
  t: (text: string) => string
}

function DeclarationSection({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const declarationCategories = useReferenceOptions("declaration_category", t, "Select category")
  const declarationTypes = useReferenceOptions("declaration_type", t, "Select type")
  const currencies = useReferenceOptions("currency", t, "Select currency")
  return <SectionFrame title={t("Declaration details")} description={t("Core identity and totals for this export declaration.")}>
    <FieldGrid>
      <SelectField label={t("Declaration category")} dataElement="1/1" customsBox="1" required showDataElements={showDataElements} value={draft.declarationCategory} onChange={(value) => update("declarationCategory", value)} options={declarationCategories} />
      <SelectField label={t("Type of declaration")} dataElement="1/2" customsBox="1" required showDataElements={showDataElements} value={draft.declarationType} onChange={(value) => update("declarationType", value)} options={declarationTypes} />
      <TextField label={t("Trader reference number")} dataElement="2/4" customsBox="44" required showDataElements={showDataElements} value={draft.traderReference} onChange={(value) => update("traderReference", value)} invalid={issues.has("traderReference")} fieldKey="traderReference" highlighted={highlightedField === "traderReference"} />
      <TextField label={t("Internal reference")} showDataElements={showDataElements} value={draft.internalReference} onChange={(value) => update("internalReference", value)} />
      <TextField label={t("UCN")} showDataElements={showDataElements} value={draft.ucn} onChange={(value) => update("ucn", value)} />
      <TextField label={t("Badge ID")} showDataElements={showDataElements} value={draft.badgeId} onChange={(value) => update("badgeId", value)} />
      <TextField label={t("Total amount")} dataElement="4/11" customsBox="22" required showDataElements={showDataElements} value={draft.totalAmount} onChange={(value) => update("totalAmount", value)} invalid={issues.has("totalAmount")} fieldKey="totalAmount" highlighted={highlightedField === "totalAmount"} />
      <SelectField label={t("Currency code")} dataElement="4/10" customsBox="22" required showDataElements={showDataElements} value={draft.currency} onChange={(value) => update("currency", value)} options={currencies} />
      <TextField label={t("Total packages")} dataElement="6/18" customsBox="6" required showDataElements={showDataElements} value={draft.totalPackages} onChange={(value) => update("totalPackages", value)} invalid={issues.has("totalPackages")} fieldKey="totalPackages" highlighted={highlightedField === "totalPackages"} />
      <TextField label={t("Total gross mass")} dataElement="6/5" customsBox="35" required showDataElements={showDataElements} value={draft.totalGrossMass} onChange={(value) => update("totalGrossMass", value)} invalid={issues.has("totalGrossMass")} fieldKey="totalGrossMass" highlighted={highlightedField === "totalGrossMass"} suffix="kg" />
      <TextField label={t("Total net mass")} dataElement="6/1" customsBox="38" required showDataElements={showDataElements} value={draft.totalNetMass} onChange={(value) => update("totalNetMass", value)} invalid={issues.has("totalNetMass")} fieldKey="totalNetMass" highlighted={highlightedField === "totalNetMass"} suffix="kg" />
    </FieldGrid>
  </SectionFrame>
}

function PartiesSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const representationTypes = useReferenceOptions("representation_type", t, "Not specified")
  return <SectionFrame title={t("Party details")} description={t("Exporter, consignee, declarant and representation.")}>
    <FieldGrid>
      <TextField label={t("Exporter")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporter} onChange={(value) => update("exporter", value)} invalid={issues.has("exporter")} fieldKey="exporter" highlighted={highlightedField === "exporter"} placeholder={t("Name or EORI")} />
      <TextField label={t("Consignee")} dataElement="3/9" customsBox="8" required showDataElements={showDataElements} value={draft.consignee} onChange={(value) => update("consignee", value)} invalid={issues.has("consignee")} fieldKey="consignee" highlighted={highlightedField === "consignee"} placeholder={t("Name or EORI")} />
      <TextField label={t("Carrier")} showDataElements={showDataElements} value={draft.carrier} onChange={(value) => update("carrier", value)} placeholder={t("Name or EORI")} />
      <TextField label={t("Declarant")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarant} onChange={(value) => update("declarant", value)} invalid={issues.has("declarant")} fieldKey="declarant" highlighted={highlightedField === "declarant"} placeholder={t("Name or EORI")} />
      <TextField label={t("Representative")} dataElement="3/19" customsBox="14" showDataElements={showDataElements} value={draft.representative} onChange={(value) => update("representative", value)} placeholder={t("Name or EORI")} />
      <SelectField label={t("Type of representation")} dataElement="3/21" customsBox="14" showDataElements={showDataElements} value={draft.representationType} onChange={(value) => update("representationType", value)} options={representationTypes} />
      {showOptional ? <><TextField label={t("Authorisation identifier")} showDataElements={showDataElements} value={draft.authorisationIdentifier} onChange={(value) => update("authorisationIdentifier", value)} /><TextField label={t("Authorisation category")} showDataElements={showDataElements} value={draft.authorisationCategory} onChange={(value) => update("authorisationCategory", value)} /></> : null}
    </FieldGrid>
  </SectionFrame>
}

function TransportSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const countries = useReferenceOptions("country", t, "Select country")
  const transportModes = useReferenceOptions("transport_mode", t, "Select transport mode")
  const goodsLocationTypes = useReferenceOptions("goods_location_type", t, "Select type")
  const containerIndicators = useReferenceOptions("container_indicator", t, "Select option")
  return <SectionFrame title={t("Transport and location")} description={t("Routing, border movement and goods location.")}>
    <FieldGrid>
      <SelectField label={t("Export country")} dataElement="5/14" customsBox="15" required showDataElements={showDataElements} value={draft.exportCountry} onChange={(value) => update("exportCountry", value)} options={countries} />
      <SelectField label={t("Country of destination")} dataElement="5/8" customsBox="17" required showDataElements={showDataElements} value={draft.destinationCountry} onChange={(value) => update("destinationCountry", value)} invalid={issues.has("destinationCountry")} fieldKey="destinationCountry" highlighted={highlightedField === "destinationCountry"} options={countries} />
      <SelectField label={t("Inland transport mode")} dataElement="7/5" customsBox="26" showDataElements={showDataElements} value={draft.inlandMode} onChange={(value) => update("inlandMode", value)} options={transportModes} />
      <SelectField label={t("Mode at border")} dataElement="7/4" customsBox="25" required showDataElements={showDataElements} value={draft.borderMode} onChange={(value) => update("borderMode", value)} options={transportModes} />
      <TextField label={t("Border identification number")} dataElement="7/14" customsBox="21" showDataElements={showDataElements} value={draft.borderIdentificationNumber} onChange={(value) => update("borderIdentificationNumber", value)} />
      <TextField label={t("Departure identification number")} dataElement="7/7" customsBox="18" showDataElements={showDataElements} value={draft.departureIdentificationNumber} onChange={(value) => update("departureIdentificationNumber", value)} />
      <SelectField label={t("Type of location")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationType} onChange={(value) => update("goodsLocationType", value)} options={goodsLocationTypes} />
      <TextField label={t("Name of place")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationName} onChange={(value) => update("goodsLocationName", value)} />
      <TextField label={t("Goods location identifier")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationIdentifier} onChange={(value) => update("goodsLocationIdentifier", value)} />
      <SelectField label={t("Transported in container")} dataElement="7/2" customsBox="19" showDataElements={showDataElements} value={draft.isContainerised} onChange={(value) => update("isContainerised", value)} options={containerIndicators} />
      {draft.isContainerised === "1" ? <><TextField label={t("Container ID")} dataElement="7/10" customsBox="31" required showDataElements={showDataElements} value={draft.containerId} onChange={(value) => update("containerId", value)} invalid={issues.has("containerId")} fieldKey="containerId" highlighted={highlightedField === "containerId"} /><TextField label={t("Seal identifier")} dataElement="7/18" customsBox="31" showDataElements={showDataElements} value={draft.sealIdentifier} onChange={(value) => update("sealIdentifier", value)} /></> : null}
      {showOptional ? <><TextField label={t("GVMS AI code")} showDataElements={showDataElements} value={draft.gvmsCode} onChange={(value) => update("gvmsCode", value)} /><TextField label={t("GVMS AI code value")} showDataElements={showDataElements} value={draft.gvmsValue} onChange={(value) => update("gvmsValue", value)} /><TextField label={t("Routing country")} showDataElements={showDataElements} value={draft.routingCountry} onChange={(value) => update("routingCountry", value)} /></> : null}
    </FieldGrid>
  </SectionFrame>
}

function DocumentsSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const previousDocumentCategories = useReferenceOptions("previous_document_category", t, "Select category")
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t, "Select document type")
  const transactionNatures = useReferenceOptions("transaction_nature", t, "Select nature")
  return <SectionFrame title={t("Documents and customs offices")} description={t("Previous documents, controlling offices and guarantees.")}>
    <FieldGrid>
      <SelectField label={t("Previous document category")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentCategory} onChange={(value) => update("previousDocumentCategory", value)} options={previousDocumentCategories} />
      <SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentType} onChange={(value) => update("previousDocumentType", value)} options={previousDocumentTypes} />
      <TextField label={t("Document reference")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentReference} onChange={(value) => update("previousDocumentReference", value)} invalid={issues.has("previousDocumentReference")} fieldKey="previousDocumentReference" highlighted={highlightedField === "previousDocumentReference"} />
      <SelectField label={t("Nature of transaction")} dataElement="8/5" customsBox="24" showDataElements={showDataElements} value={draft.transactionNature} onChange={(value) => update("transactionNature", value)} options={transactionNatures} />
      <TextField label={t("Exchange rate")} dataElement="4/15" customsBox="23" showDataElements={showDataElements} value={draft.exchangeRate} onChange={(value) => update("exchangeRate", value)} />
      <TextField label={t("Customs office of exit")} dataElement="5/12" customsBox="29" required showDataElements={showDataElements} value={draft.exitOffice} onChange={(value) => update("exitOffice", value)} invalid={issues.has("exitOffice")} fieldKey="exitOffice" highlighted={highlightedField === "exitOffice"} />
      {showOptional ? <><TextField label={t("Supervising office")} dataElement="5/27" showDataElements={showDataElements} value={draft.supervisingOffice} onChange={(value) => update("supervisingOffice", value)} /><TextField label={t("Customs office of presentation")} dataElement="5/26" showDataElements={showDataElements} value={draft.presentationOffice} onChange={(value) => update("presentationOffice", value)} /><TextField label={t("Warehouse type")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseType} onChange={(value) => update("warehouseType", value)} /><TextField label={t("Warehouse identifier")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseIdentifier} onChange={(value) => update("warehouseIdentifier", value)} /><TextField label={t("Guarantee type")} dataElement="8/2" customsBox="52" showDataElements={showDataElements} value={draft.guaranteeType} onChange={(value) => update("guaranteeType", value)} /><TextField label={t("GRN or guarantee ID")} dataElement="8/3" customsBox="52" showDataElements={showDataElements} value={draft.guaranteeReference} onChange={(value) => update("guaranteeReference", value)} /></> : null}
    </FieldGrid>
  </SectionFrame>
}

function ItemsSection({ items, activeItem, activeItemId, onSelectItem, onAdd, onOpenInvoiceImport, onDuplicate, onRemove, itemTab, onItemTabChange, update, updateRow, showDataElements, showOptional, issues, validated, highlightedField, t }: { items: ExportDeclarationItem[]; activeItem: ExportDeclarationItem; activeItemId: string; onSelectItem: (id: string) => void; onAdd: () => void; onOpenInvoiceImport: () => void; onDuplicate: (itemId?: string) => void; onRemove: (itemId?: string) => void; itemTab: ItemTab; onItemTabChange: (tab: ItemTab) => void; update: <K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) => void; updateRow: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void; showDataElements: boolean; showOptional: boolean; issues: Set<string>; validated: boolean; highlightedField?: string; t: (text: string) => string }) {
  const { direction } = useLanguage()
  const tabs: Array<[ItemTab, string]> = [["commodity", "Commodity"], ["packaging", "Packaging & procedure"], ["values", "Weights & values"], ["documents", "Documents"], ["parties", "Parties & transport"]]
  const packageKinds = useReferenceOptions("package_kind", t)
  const packageKindFields = useReferenceOptions("package_kind", t, "Select package")
  const countries = useReferenceOptions("country", t)
  const countryFields = useReferenceOptions("country", t, "Select country")
  const optionalCountries = useReferenceOptions("country", t, "Not specified")
  const procedureCodes = useReferenceOptions("procedure_code", t)
  const procedureCodeFields = useReferenceOptions("procedure_code", t, "Select procedure")
  const additionalProcedureCodes = useReferenceOptions("additional_procedure_code", t)
  const additionalProcedureCodeFields = useReferenceOptions("additional_procedure_code", t, "Select procedure")
  const currencies = useReferenceOptions("currency", t)
  const currencyFields = useReferenceOptions("currency", t, "Select currency")
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t, "Select document type")
  return <div className="min-w-0 space-y-4">
    <Surface padding="none" className="w-full min-w-0 max-w-full overflow-hidden rounded-[var(--md-radius-xl)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-line)] px-4 py-3">
        <span>
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Mandatory goods-line fields")}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Add rows and enter the essentials here. Select any row to expand its full details below.")}</p>
        </span>
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={onOpenInvoiceImport}><Sparkles className="size-3.5" />{t("Import invoice")}</Button><Button type="button" size="sm" onClick={onAdd}><Plus className="size-3.5" />{t("Add item")}</Button></div>
      </header>
      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain" data-testid="mandatory-goods-line-scroll">
        <table className="w-full min-w-[1780px] table-fixed border-collapse text-start" aria-label={t("Mandatory goods-line fields")}>
          <thead className="bg-[var(--md-surface-soft)] text-[9px] font-medium uppercase tracking-[0.035em] text-[var(--md-subtle)]">
            <tr>
              <ItemTableHeading className="sticky start-0 z-10 w-[64px] bg-[var(--md-surface-soft)]">{t("Line")}</ItemTableHeading>
              <ItemTableHeading className="w-[120px]">{t("Commodity code")}</ItemTableHeading>
              <ItemTableHeading className="w-[200px]">{t("Description of goods")}</ItemTableHeading>
              <ItemTableHeading className="w-[96px]">{t("Package kind")}</ItemTableHeading>
              <ItemTableHeading className="w-[130px]">{t("Package marks")}</ItemTableHeading>
              <ItemTableHeading className="w-[82px]">{t("Package count")}</ItemTableHeading>
              <ItemTableHeading className="w-[112px]">{t("Non-preferential origin")}</ItemTableHeading>
              <ItemTableHeading className="w-[102px]">{t("Procedure code")}</ItemTableHeading>
              <ItemTableHeading className="w-[118px]">{t("Additional procedure code")}</ItemTableHeading>
              <ItemTableHeading className="w-[88px]">{t("Gross mass")}</ItemTableHeading>
              <ItemTableHeading className="w-[88px]">{t("Net mass")}</ItemTableHeading>
              <ItemTableHeading className="w-[155px]">{t("Price / currency")}</ItemTableHeading>
              <ItemTableHeading className="w-[105px]">{t("Statistical value")}</ItemTableHeading>
              <ItemTableHeading className="w-[150px]">{t("Previous document reference")}</ItemTableHeading>
              <ItemTableHeading className="w-[54px]"><span className="sr-only">{t("Actions")}</span></ItemTableHeading>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--md-line)]">
            {items.map((item, index) => {
              const missing = mandatoryItemGaps(item)
              const selected = item.id === activeItemId
              const inputClass = "h-7 rounded-[var(--md-radius-xs)] border-transparent bg-[var(--md-surface-tint)] px-1.5 text-[10px] shadow-none focus-visible:border-[var(--md-accent)] focus-visible:ring-1 focus-visible:ring-[var(--md-accent)]"
              return <ContextMenuPrimitive.Root key={item.id} dir={direction}>
                <ContextMenuPrimitive.Trigger asChild>
                <tr onClick={() => onSelectItem(item.id)} onFocus={() => onSelectItem(item.id)} onContextMenu={() => onSelectItem(item.id)} aria-selected={selected} className={cn("group cursor-pointer bg-[var(--md-surface)] transition-colors hover:bg-[var(--md-hover)]", selected && "bg-[var(--md-selected-bg)] hover:bg-[var(--md-selected-bg)]")}>
                <td className={cn("sticky start-0 z-[5] border-e border-[var(--md-line)] px-2 py-1", selected ? "bg-[var(--md-selected-bg)]" : "bg-[var(--md-surface)] group-hover:bg-[var(--md-hover)]")}>
                  <strong className="block text-[11px] font-semibold text-[var(--md-ink)]">{index + 1}</strong>
                  <span className={cn("mt-0.5 block text-[8px] font-medium", missing.length ? "text-[var(--md-amber)]" : "text-[var(--md-green)]")}>{missing.length ? `${missing.length} ${t("required")}` : t("Complete")}</span>
                </td>
                <ItemTableCell><Input aria-label={`${t("Commodity code")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "commodityCode") && "ring-1 ring-[var(--md-red)]")} value={item.commodityCode} onChange={(event) => updateRow(item.id, "commodityCode", event.target.value.replace(/\D/g, "").slice(0, 10))} /></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Description of goods")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "description") && "ring-1 ring-[var(--md-red)]")} value={item.description} onChange={(event) => updateRow(item.id, "description", event.target.value)} /></ItemTableCell>
                <ItemTableCell><ItemTableSelect label={`${t("Package kind")} ${index + 1}`} value={item.packageKind} onChange={(value) => updateRow(item.id, "packageKind", value)} options={packageKinds} invalid={validatedItemField(issues, missing, "packageKind")} /></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Package marks")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "packageMarks") && "ring-1 ring-[var(--md-red)]")} value={item.packageMarks} onChange={(event) => updateRow(item.id, "packageMarks", event.target.value)} /></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Package count")} ${index + 1}`} inputMode="numeric" className={cn(inputClass, validatedItemField(issues, missing, "packageCount") && "ring-1 ring-[var(--md-red)]")} value={item.packageCount} onChange={(event) => updateRow(item.id, "packageCount", event.target.value)} /></ItemTableCell>
                <ItemTableCell><ItemTableSelect label={`${t("Non-preferential origin")} ${index + 1}`} value={item.nonPreferentialOrigin} onChange={(value) => updateRow(item.id, "nonPreferentialOrigin", value)} options={countries} invalid={validatedItemField(issues, missing, "nonPreferentialOrigin")} /></ItemTableCell>
                <ItemTableCell><ItemTableSelect label={`${t("Procedure code")} ${index + 1}`} value={item.procedureCode} onChange={(value) => updateRow(item.id, "procedureCode", value)} options={procedureCodes} invalid={validatedItemField(issues, missing, "procedureCode")} /></ItemTableCell>
                <ItemTableCell><ItemTableSelect label={`${t("Additional procedure code")} ${index + 1}`} value={item.additionalProcedureCode} onChange={(value) => updateRow(item.id, "additionalProcedureCode", value)} options={additionalProcedureCodes} invalid={validatedItemField(issues, missing, "additionalProcedureCode")} /></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Gross mass")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, "grossMass") && "ring-1 ring-[var(--md-red)]")} value={item.grossMass} onChange={(event) => updateRow(item.id, "grossMass", event.target.value)} /></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Net mass")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, "netMass") && "ring-1 ring-[var(--md-red)]")} value={item.netMass} onChange={(event) => updateRow(item.id, "netMass", event.target.value)} /></ItemTableCell>
                <ItemTableCell><div className="grid grid-cols-[1fr_72px] gap-1"><Input aria-label={`${t("Item price")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, "itemPrice") && "ring-1 ring-[var(--md-red)]")} value={item.itemPrice} onChange={(event) => updateRow(item.id, "itemPrice", event.target.value)} /><ItemTableSelect label={`${t("Currency code")} ${index + 1}`} value={item.currency} onChange={(value) => updateRow(item.id, "currency", value)} options={currencies} /></div></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Statistical value")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, "statisticalValue") && "ring-1 ring-[var(--md-red)]")} value={item.statisticalValue} onChange={(event) => updateRow(item.id, "statisticalValue", event.target.value)} /></ItemTableCell>
                <ItemTableCell><Input aria-label={`${t("Previous document reference")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "previousDocumentReference") && "ring-1 ring-[var(--md-red)]")} value={item.previousDocumentReference} onChange={(event) => updateRow(item.id, "previousDocumentReference", event.target.value)} /></ItemTableCell>
                <ItemTableCell><button type="button" aria-label={`${t("Remove")} ${t("Item")} ${index + 1}`} disabled={items.length === 1} onClick={(event) => { event.stopPropagation(); onRemove(item.id) }} className="grid size-8 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-surface)] hover:text-[var(--md-red)] disabled:opacity-30"><Trash2 className="size-3.5" /></button></ItemTableCell>
                </tr>
                </ContextMenuPrimitive.Trigger>
                <ContextMenuPrimitive.Portal>
                  <ContextMenuPrimitive.Content collisionPadding={14} className="md-sidebar-menu premium-stroke z-50 origin-(--radix-context-menu-content-transform-origin) rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl">
                    <ContextMenuPrimitive.Item className="md-sidebar-menu-item group/menu flex h-9 cursor-default select-none items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 text-[13px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] data-[highlighted]:bg-[var(--md-hover)] data-[highlighted]:text-[var(--md-ink)]" onSelect={() => onDuplicate(item.id)}>
                      <span className="md-sidebar-menu-item__icon grid size-5 shrink-0 place-items-center text-[var(--md-subtle)] transition-colors duration-150 group-data-[highlighted]/menu:text-[var(--md-accent)]"><Copy className="size-4" strokeWidth={1.3} /></span>
                      <span className="min-w-0 flex-1 truncate text-start">{t("Duplicate")}</span>
                      <span className="shrink-0 text-[11px] font-normal text-[var(--md-subtle)]">{t("Create a copy")}</span>
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item disabled={items.length === 1} className="md-sidebar-menu-item group/menu flex h-9 cursor-default select-none items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 text-[13px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] data-[disabled]:opacity-40 data-[highlighted]:bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] data-[highlighted]:text-[var(--md-red)]" onSelect={() => onRemove(item.id)}>
                      <span className="md-sidebar-menu-item__icon grid size-5 shrink-0 place-items-center text-[var(--md-subtle)] transition-colors duration-150 group-data-[highlighted]/menu:text-[var(--md-red)]"><Trash2 className="size-4" strokeWidth={1.3} /></span>
                      <span className="min-w-0 flex-1 truncate text-start">{t("Delete")}</span>
                      <span className="shrink-0 text-[11px] font-normal text-[var(--md-subtle)]">{t(items.length === 1 ? "Keep one line" : "Remove line")}</span>
                    </ContextMenuPrimitive.Item>
                  </ContextMenuPrimitive.Content>
                </ContextMenuPrimitive.Portal>
              </ContextMenuPrimitive.Root>
            })}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-4 py-2 text-[10px] text-[var(--md-subtle)]">
        <span>{items.length} {items.length === 1 ? t("goods line") : t("goods lines")}</span>
        <span>{t("Scroll horizontally to edit every mandatory field")}</span>
      </footer>
    </Surface>

    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><StatusPill tone="teal">{t("Editing item")} {items.findIndex((item) => item.id === activeItemId) + 1}</StatusPill><div className="flex flex-wrap gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => onItemTabChange(id)} className={cn("rounded-[var(--md-radius-md)] px-3 py-2 text-[11px] font-medium", itemTab === id ? "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)]" : "text-[var(--md-text)] hover:bg-[var(--md-hover)]")}>{t(label)}</button>)}</div></div>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onDuplicate()} className="group/duplicate transition-[transform,background,color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] active:translate-y-0 active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none"><span className="relative size-3.5" aria-hidden="true"><Copy className="absolute inset-0 size-3.5 opacity-0 transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/duplicate:-translate-x-[2px] group-hover/duplicate:translate-y-[2px] group-hover/duplicate:opacity-30 group-active/duplicate:scale-[0.92] motion-reduce:transform-none motion-reduce:transition-none" /><Copy className="absolute inset-0 size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/duplicate:translate-x-[1px] group-hover/duplicate:-translate-y-[1px] group-active/duplicate:scale-[0.92] motion-reduce:transform-none motion-reduce:transition-none" /></span>{t("Duplicate")}</Button><Button type="button" variant="ghost" size="sm" disabled={items.length === 1} onClick={() => onRemove()}><Trash2 className="size-3.5" />{t("Remove")}</Button></div>
      </div>
      <SectionFrame title={t(tabs.find(([id]) => id === itemTab)?.[1] ?? "Item details")} description={t("Only fields for this item section are shown.")}>
        <FieldGrid>
          {itemTab === "commodity" ? <>
            <TextField label={t("Commodity code")} dataElement="6/14" customsBox="33" required showDataElements={showDataElements} value={activeItem.commodityCode} onChange={(value) => update("commodityCode", value.replace(/\D/g, "").slice(0, 10))} invalid={issues.has("commodityCode")} fieldKey="commodityCode" highlighted={highlightedField === "commodityCode"} />
            <TextAreaField label={t("Description of goods")} dataElement="6/8" customsBox="31" required showDataElements={showDataElements} value={activeItem.description} onChange={(value) => update("description", value)} invalid={issues.has("description")} fieldKey="description" highlighted={highlightedField === "description"} className="md:col-span-2" />
            <TextField label={t("UN dangerous goods code")} dataElement="6/12" customsBox="31" showDataElements={showDataElements} value={activeItem.dangerousGoodsCode} onChange={(value) => update("dangerousGoodsCode", value)} />
            {showOptional ? <><TextField label={t("TARIC additional code")} dataElement="6/16" customsBox="33" showDataElements={showDataElements} value={activeItem.taricCode} onChange={(value) => update("taricCode", value)} /><TextField label={t("National additional code")} dataElement="6/17" customsBox="33" showDataElements={showDataElements} value={activeItem.nationalCode} onChange={(value) => update("nationalCode", value)} /><TextField label={t("CUS code")} dataElement="6/13" customsBox="31" showDataElements={showDataElements} value={activeItem.cusCode} onChange={(value) => update("cusCode", value)} /></> : null}
          </> : null}
          {itemTab === "packaging" ? <>
            <SelectField label={t("Package kind")} dataElement="6/9" customsBox="31" required showDataElements={showDataElements} value={activeItem.packageKind} onChange={(value) => update("packageKind", value)} invalid={issues.has("packageKind")} fieldKey="packageKind" highlighted={highlightedField === "packageKind"} options={packageKindFields} />
            <TextField label={t("Package marks")} dataElement="6/11" customsBox="31" required showDataElements={showDataElements} value={activeItem.packageMarks} onChange={(value) => update("packageMarks", value)} invalid={issues.has("packageMarks")} fieldKey="packageMarks" highlighted={highlightedField === "packageMarks"} />
            <TextField label={t("Package count")} dataElement="6/10" customsBox="31" required showDataElements={showDataElements} value={activeItem.packageCount} onChange={(value) => update("packageCount", value)} invalid={issues.has("packageCount")} fieldKey="packageCount" highlighted={highlightedField === "packageCount"} />
            <SelectField label={t("Non-preferential origin")} dataElement="5/15" customsBox="34" required showDataElements={showDataElements} value={activeItem.nonPreferentialOrigin} onChange={(value) => update("nonPreferentialOrigin", value)} invalid={issues.has("nonPreferentialOrigin")} fieldKey="nonPreferentialOrigin" highlighted={highlightedField === "nonPreferentialOrigin"} options={countryFields} />
            <SelectField label={t("Procedure code")} dataElement="1/10" customsBox="37" required showDataElements={showDataElements} value={activeItem.procedureCode} onChange={(value) => update("procedureCode", value)} invalid={issues.has("procedureCode")} fieldKey="procedureCode" highlighted={highlightedField === "procedureCode"} options={procedureCodeFields} />
            <SelectField label={t("Additional procedure code")} dataElement="1/11" customsBox="37" required showDataElements={showDataElements} value={activeItem.additionalProcedureCode} onChange={(value) => update("additionalProcedureCode", value)} invalid={issues.has("additionalProcedureCode")} fieldKey="additionalProcedureCode" highlighted={highlightedField === "additionalProcedureCode"} options={additionalProcedureCodeFields} />
          </> : null}
          {itemTab === "values" ? <>
            <TextField label={t("Tariff quantity")} dataElement="6/2" customsBox="41" showDataElements={showDataElements} value={activeItem.tariffQuantity} onChange={(value) => update("tariffQuantity", value)} />
            <TextField label={t("Gross mass")} dataElement="6/5" customsBox="35" required showDataElements={showDataElements} value={activeItem.grossMass} onChange={(value) => update("grossMass", value)} invalid={issues.has("grossMass")} fieldKey="grossMass" highlighted={highlightedField === "grossMass"} suffix="kg" />
            <TextField label={t("Net mass")} dataElement="6/1" customsBox="38" required showDataElements={showDataElements} value={activeItem.netMass} onChange={(value) => update("netMass", value)} invalid={issues.has("netMass")} fieldKey="netMass" highlighted={highlightedField === "netMass"} suffix="kg" />
            <TextField label={t("Item price")} dataElement="4/14" customsBox="42" required showDataElements={showDataElements} value={activeItem.itemPrice} onChange={(value) => update("itemPrice", value)} invalid={issues.has("itemPrice")} fieldKey="itemPrice" highlighted={highlightedField === "itemPrice"} />
            <SelectField label={t("Currency code")} dataElement="4/10" customsBox="22" required showDataElements={showDataElements} value={activeItem.currency} onChange={(value) => update("currency", value)} options={currencyFields} />
            <TextField label={t("Statistical value")} dataElement="8/6" customsBox="46" required showDataElements={showDataElements} value={activeItem.statisticalValue} onChange={(value) => update("statisticalValue", value)} invalid={issues.has("statisticalValue")} fieldKey="statisticalValue" highlighted={highlightedField === "statisticalValue"} />
          </> : null}
          {itemTab === "documents" ? <>
            <SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={activeItem.previousDocumentType} onChange={(value) => update("previousDocumentType", value)} options={previousDocumentTypes} />
            <TextField label={t("Previous document reference")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={activeItem.previousDocumentReference} onChange={(value) => update("previousDocumentReference", value)} invalid={issues.has("previousDocumentReference")} fieldKey="previousDocumentReference" highlighted={highlightedField === "previousDocumentReference"} />
            {showOptional ? <><TextField label={t("Additional document category")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={activeItem.additionalDocumentCategory} onChange={(value) => update("additionalDocumentCategory", value)} /><TextField label={t("Additional document ID")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={activeItem.additionalDocumentId} onChange={(value) => update("additionalDocumentId", value)} /><TextField label={t("Additional document name")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={activeItem.additionalDocumentName} onChange={(value) => update("additionalDocumentName", value)} /><TextField label={t("LPCO exemption code")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={activeItem.lpcoExemptionCode} onChange={(value) => update("lpcoExemptionCode", value)} /></> : null}
          </> : null}
          {itemTab === "parties" ? <><TextField label={t("Consignor")} dataElement="3/7" customsBox="2" showDataElements={showDataElements} value={activeItem.consignor} onChange={(value) => update("consignor", value)} /><TextField label={t("Consignee")} dataElement="3/9" customsBox="8" showDataElements={showDataElements} value={activeItem.consignee} onChange={(value) => update("consignee", value)} /><SelectField label={t("Destination country")} dataElement="5/8" customsBox="17" showDataElements={showDataElements} value={activeItem.destinationCountry} onChange={(value) => update("destinationCountry", value)} options={optionalCountries} /><TextField label={t("Reference number or UCR")} dataElement="2/4" customsBox="44" showDataElements={showDataElements} value={activeItem.ucr} onChange={(value) => update("ucr", value)} /><TextField label={t("Container identification number")} dataElement="7/10" customsBox="31" showDataElements={showDataElements} value={activeItem.containerId} onChange={(value) => update("containerId", value)} /></> : null}
        </FieldGrid>
      </SectionFrame>
    </div>
  </div>
}

function ItemTableHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <th scope="col" className={cn("border-e border-[var(--md-line)] px-2 py-2 text-start leading-3", className)}>{children}</th>
}

function ItemTableCell({ children }: { children: ReactNode }) {
  return <td className="border-e border-[var(--md-line)] p-1 align-middle">{children}</td>
}

function ItemTableSelect({ label, value, onChange, options, invalid }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; invalid?: boolean }) {
  const referenceState = useContext(CustomsReferenceDataContext)
  return <Select value={value || undefined} onValueChange={onChange} disabled={referenceState.loading || Boolean(referenceState.error) || !options.length}>
    <SelectTrigger aria-label={label} className={cn("h-7 rounded-[var(--md-radius-xs)] border-transparent bg-[var(--md-surface-tint)] px-1.5 text-[10px] shadow-none focus:ring-1 focus:ring-[var(--md-accent)]", invalid && "ring-1 ring-[var(--md-red)]")}><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent>
  </Select>
}

function mandatoryItemGaps(item: ExportDeclarationItem): Array<keyof ExportDeclarationItem> {
  const missing: Array<keyof ExportDeclarationItem> = []
  if (!/^\d{10}$/.test(item.commodityCode)) missing.push("commodityCode")
  if (!item.description.trim()) missing.push("description")
  if (!item.packageKind) missing.push("packageKind")
  if (!item.packageMarks.trim()) missing.push("packageMarks")
  if (!(Number(item.packageCount) > 0)) missing.push("packageCount")
  if (!item.nonPreferentialOrigin) missing.push("nonPreferentialOrigin")
  if (!item.procedureCode) missing.push("procedureCode")
  if (!item.additionalProcedureCode) missing.push("additionalProcedureCode")
  if (!(Number(item.grossMass) > 0)) missing.push("grossMass")
  if (!(Number(item.netMass) > 0)) missing.push("netMass")
  if (!(Number(item.itemPrice) > 0)) missing.push("itemPrice")
  if (!item.currency) missing.push("currency")
  if (!(Number(item.statisticalValue) > 0)) missing.push("statisticalValue")
  if (!item.previousDocumentType) missing.push("previousDocumentType")
  if (!item.previousDocumentReference.trim()) missing.push("previousDocumentReference")
  return missing
}

function validatedItemField(issues: Set<string>, missing: Array<keyof ExportDeclarationItem>, field: keyof ExportDeclarationItem) {
  return issues.has(field) && missing.includes(field)
}

function ReviewSection({ draft, completion, fallbackUrl, onValidate, onFixIssue, t }: { draft: StandaloneExportDraft; completion: ReturnType<typeof declarationCompletion>; fallbackUrl: string; onValidate: () => void; onFixIssue: (issue: DeclarationIssue) => void; t: (text: string) => string }) {
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-4"><span><p className="text-[12px] font-medium text-[var(--md-accent)]">{t("Declaration readiness")}</p><h2 className="mt-1 text-[22px] font-medium text-[var(--md-ink)]">{completion.percent}% {t("complete")}</h2><p className="mt-1 text-[12px] text-[var(--md-text)]">{completion.completeChecks}/{completion.totalChecks} {t("configured checks complete")}</p></span><div className="relative grid size-24 place-items-center rounded-full" style={{ background: `conic-gradient(var(--md-accent) ${completion.percent}%, var(--md-line) 0)` }}><div className="grid size-[78px] place-items-center rounded-full bg-[var(--md-surface)] text-[17px] font-medium">{completion.percent}%</div></div></div>
      {completion.issues.length ? <div className="mt-5 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{completion.issues.slice(0, 14).map((issue) => <div key={issue.id} className="flex min-h-11 items-center gap-3 py-2"><CircleAlert className="size-4 shrink-0 text-[var(--md-amber)]" /><span className="min-w-0 flex-1 text-[12px] text-[var(--md-text)]">{issue.itemNumber ? `${t("Item")} ${issue.itemNumber}: ` : ""}{t(issue.message)}</span><Button type="button" variant="outline" size="sm" className="min-w-[48px] rounded-[var(--md-radius-md)]" onClick={() => onFixIssue(issue)}>{t("Fix")}</Button></div>)}</div> : <div className="mt-5 flex gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-4"><CheckCircle2 className="size-5 text-[var(--md-green)]" /><span className="text-[13px] text-[var(--md-text)]"><strong className="block text-[var(--md-ink)]">{t("Current form checks passed")}</strong>{t("Ready for secure server integration checks.")}</span></div>}
    </Surface>
    <div className="space-y-4">
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Declaration summary")}</h2><dl className="mt-4 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]"><Summary label={t("Reference")} value={draft.multideckReference} /><Summary label={t("Category")} value={draft.declarationCategory} /><Summary label={t("Type")} value={draft.declarationType} /><Summary label={t("Items")} value={String(draft.items.length)} /><Summary label={t("Destination")} value={draft.destinationCountry || t("Not set")} /></dl></Surface>
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><div className="flex gap-3"><Link2 className="mt-0.5 size-4 text-[var(--md-accent)]" /><p className="text-[12px] leading-5 text-[var(--md-text)]">{t("API credentials, XML generation, submission and audit stay on the App server. Nothing sensitive enters the browser.")}</p></div><Button type="button" className="mt-4 w-full" onClick={onValidate}>{t("Run form checks")}</Button><Button asChild variant="outline" className="mt-2 w-full"><a href={fallbackUrl} target="_blank" rel="noreferrer"><ICustomsLogo className="size-4" />{t("Continue in iCustoms")}<ExternalLink className="size-3.5" /></a></Button></Surface>
    </div>
  </div>
}

function generalTabForField(field: string): EditorTab {
  if (["exporter", "consignee", "carrier", "declarant", "representative"].includes(field)) return "parties"
  if (["exportCountry", "destinationCountry", "borderMode", "inlandMode", "containerId"].includes(field)) return "transport"
  if (["exitOffice", "previousDocumentCategory", "previousDocumentType", "previousDocumentReference"].includes(field)) return "documents"
  return "declaration"
}

function itemTabForField(field: string): ItemTab {
  if (["commodityCode", "description", "dangerousGoodsCode", "taricCode", "nationalCode", "cusCode"].includes(field)) return "commodity"
  if (["packageKind", "packageMarks", "packageCount", "nonPreferentialOrigin", "procedureCode", "additionalProcedureCode"].includes(field)) return "packaging"
  if (["tariffQuantity", "grossMass", "netMass", "itemPrice", "currency", "statisticalValue"].includes(field)) return "values"
  if (["previousDocumentType", "previousDocumentReference", "additionalDocumentCategory", "additionalDocumentId", "additionalDocumentName", "lpcoExemptionCode"].includes(field)) return "documents"
  return "parties"
}

function KindButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("min-w-[112px] rounded-[var(--md-radius-md)] px-4 py-2 text-[12px] font-medium", active ? "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" : "text-[var(--md-text)]")}>{children}</button>
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className="flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />{children}</label>
}

function SectionFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]"><header className="border-b border-[var(--md-line)] px-5 py-4"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{description}</p></header><div className="bg-[var(--md-surface-soft)] p-5">{children}</div></Surface>
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-3 gap-y-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>
}

function FieldShell({ label, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, className, children }: { label: string; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; className?: string; children: ReactNode }) {
  const showCustomsBoxNumbers = useContext(CustomsBoxVisibilityContext)
  const showAnnotations = (showDataElements && dataElement) || (showCustomsBoxNumbers && customsBox)
  return <label className={cn("min-w-0", className)}><span className="mb-1.5 flex min-h-5 items-center gap-1.5 text-[11px] font-medium text-[var(--md-text)]"><span className="truncate">{label}</span>{required ? <span className="text-[var(--md-red)]">*</span> : null}{showAnnotations ? <span className="ms-auto flex shrink-0 items-center gap-1">{showDataElements && dataElement ? <span className="rounded-[var(--md-radius-sm)] bg-[color-mix(in_srgb,var(--md-blue)_8%,transparent)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--md-blue)]" dir="ltr">DE {dataElement}</span> : null}{showCustomsBoxNumbers && customsBox ? <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a10)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--md-accent)]" dir="ltr">{`Box ${customsBox}`}</span> : null}</span> : null}</span><span data-customs-field={fieldKey} className={cn("block rounded-[var(--md-radius-md)] transition-[box-shadow] duration-300", invalid && "ring-2 ring-[color-mix(in_srgb,var(--md-red)_22%,transparent)]", highlighted && "ring-2 ring-[var(--md-accent)] shadow-[0_0_20px_var(--md-accent)]")}>{children}</span></label>
}

function TextField({ label, value, onChange, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, placeholder, suffix }: { label: string; value: string; onChange: (value: string) => void; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; placeholder?: string; suffix?: string }) {
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}><div className="relative"><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} dir="ltr" className={cn("h-9 border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]", suffix && "pe-10")} />{suffix ? <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--md-subtle)]">{suffix}</span> : null}</div></FieldShell>
}

function TextAreaField({ label, value, onChange, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, className }: { label: string; value: string; onChange: (value: string) => void; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; className?: string }) {
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey} className={className}><Textarea value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid || undefined} className="min-h-9 border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]" /></FieldShell>
}

function SelectField({ label, value, onChange, options, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string }) {
  const referenceState = useContext(CustomsReferenceDataContext)
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}><Select value={value || undefined} onValueChange={onChange} disabled={referenceState.loading || Boolean(referenceState.error) || options.length <= 1}><SelectTrigger className="h-9 w-full border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"><SelectValue placeholder={options[0]?.[1]} /></SelectTrigger><SelectContent>{options.filter(([optionValue]) => optionValue).map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent></Select></FieldShell>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 py-2.5"><dt className="text-[11px] text-[var(--md-subtle)]">{label}</dt><dd className="m-0 text-end text-[12px] font-medium text-[var(--md-ink)]">{value}</dd></div>
}

function ICustomsLogo({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={cn("shrink-0 text-[#4943f4]", className)} viewBox="0 0 850 850" fill="currentColor"><path d="M850 183A425 425 0 1 0 850 667L578 423 302 665V181l276 242Z" /></svg>
}
