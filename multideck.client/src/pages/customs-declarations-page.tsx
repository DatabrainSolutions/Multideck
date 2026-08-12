import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, Copy, ExternalLink, FileCheck2, Plus, RefreshCw, ScanText, Search, Send, Trash2 } from "@/components/icons/hugeicons"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { RegisterFacetSelect, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { SegmentedControl, TabsRail } from "@/components/multideck/workflow-components"
import { CustomsInvoiceImportWorkspace } from "@/pages/customs-invoice-import-workspace"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import {
  createExportDeclarationItem,
  createStandaloneDeclarationDraft,
  declarationCompletion,
  type CustomsPartyEntry,
  type DeclarationIssue,
  type ExportDeclarationItem,
  type StandaloneExportDraft,
} from "@/lib/customs-declaration"
import { createEmptyCustomsReferenceData, useCustomsReferenceData, type CustomsCatalogCode, type CustomsReferenceData } from "@/lib/customs-reference-data"
import { listJobRelatedDeclarationDrafts, listStandaloneDeclarationDrafts, loadStandaloneDeclarationDraft, reopenRejectedCustomsDeclaration, saveStandaloneDeclarationDraft, type CustomsDraftSummary } from "@/lib/customs-drafts-api"
import { hasCustomsInvoiceImportRecovery, moveCustomsInvoiceImportRecovery } from "@/lib/customs-invoice-import-recovery"
import { getICustomsCommodityDetails, getICustomsDeclarationState, ICustomsApiError, refreshICustomsDeclaration, saveICustomsProviderDraft, searchICustomsCommodities, submitICustomsDeclaration, validateICustomsDeclaration, type ICustomsCommodityCertificate, type ICustomsCommodityDetail, type ICustomsCommoditySuggestion, type ICustomsProviderIssue, type ICustomsWorkspaceState } from "@/lib/icustoms-api"
import { mdMotion, reduceMotion } from "@/lib/motion"
import iCustomsLogo from "@/assets/integrations/icustoms.svg"

type DeclarationKind = "export" | "import"
type EditorTab = "declaration" | "parties" | "transport" | "documents" | "items" | "review"
type EditorViewMode = "tabs" | "form"
type FormTab = "general" | "items"

let repeatableCustomsEntrySequence = 0

function repeatableCustomsEntryId(prefix: string) {
  repeatableCustomsEntrySequence += 1
  return `${prefix}-${Date.now()}-${repeatableCustomsEntrySequence}`
}

const CustomsBoxVisibilityContext = createContext(false)
const CustomsReferenceDataContext = createContext<{ data: CustomsReferenceData; loading: boolean; error: string | null }>({ data: createEmptyCustomsReferenceData(), loading: true, error: null })
const CompactCustomsFormContext = createContext(false)
const CustomsDirectionContext = createContext<DeclarationKind>("export")

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
  const editMatch = route.match(/^\/customs\/standalone\/(export|import)\/([0-9a-f-]{36})$/i)

  if (!jobRelated && (creating || editMatch)) {
    return <StandaloneDeclarationEditor navigate={navigate} kind={kind} declarationId={editMatch?.[2]} />
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [destinationFilter, setDestinationFilter] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const loadDeclarations = jobRelated ? listJobRelatedDeclarationDrafts : listStandaloneDeclarationDrafts
    loadDeclarations(kind)
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

  const columns = useMemo<DataTableColumn<CustomsDraftSummary>[]>(() => [
    {
      id: "reference",
      label: "Reference",
      width: 250,
      minWidth: 180,
      resizable: true,
      sortValue: (draft) => draft.reference,
      cell: (draft) => <strong className="block text-[12px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{draft.reference}</strong>,
    },
    ...(jobRelated ? [{
      id: "jobReference",
      label: t("Job reference"),
      width: 190,
      minWidth: 152,
      resizable: true,
      sortValue: (draft: CustomsDraftSummary) => draft.jobReference ?? draft.jobId ?? "",
      cell: (draft: CustomsDraftSummary) => (
        <span className="block min-w-0">
          <strong className="block truncate text-[12px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{draft.jobReference ?? t("Not set")}</strong>
          {draft.bookingReference ? <span className="mt-0.5 block truncate text-[11px] text-[var(--md-subtle)]" dir="ltr">{draft.bookingReference}</span> : null}
        </span>
      ),
    }] : []),
    {
      id: "status",
      label: "Status",
      kind: "status",
      width: 120,
      minWidth: 104,
      resizable: true,
      sortValue: (draft) => draft.status,
      cell: (draft) => <StatusPill tone={customsStatusTone(draft.status)}>{t(titleCase(draft.status))}</StatusPill>,
    },
    {
      id: "traderReference",
      label: "Trader reference",
      width: 190,
      minWidth: 140,
      resizable: true,
      sortValue: (draft) => draft.traderReference,
      cell: (draft) => <span className="text-[12px] text-[var(--md-text)]">{draft.traderReference || t("Not set")}</span>,
    },
    {
      id: "items",
      label: "Items",
      width: 100,
      minWidth: 84,
      resizable: true,
      sortValue: (draft) => draft.itemCount,
      cell: (draft) => <span className="text-[12px] tabular-nums text-[var(--md-text)]" dir="ltr">{draft.itemCount}</span>,
    },
    {
      id: "destination",
      label: "Destination",
      width: 140,
      minWidth: 112,
      resizable: true,
      sortValue: (draft) => draft.destinationCountry,
      cell: (draft) => <span className="text-[12px] text-[var(--md-text)]">{draft.destinationCountry || t("Not set")}</span>,
    },
    {
      id: "value",
      label: "Value",
      width: 150,
      minWidth: 112,
      resizable: true,
      sortValue: (draft) => draft.amount,
      cell: (draft) => <span className="text-[12px] tabular-nums text-[var(--md-text)]" dir="ltr">{formatDraftAmount(draft.amount, draft.currency)}</span>,
    },
    {
      id: "lastSaved",
      label: "Last saved",
      width: 190,
      minWidth: 150,
      resizable: true,
      sortValue: (draft) => new Date(draft.updatedAt).getTime(),
      cell: (draft) => <span className="text-[11px] text-[var(--md-subtle)]">{new Date(draft.updatedAt).toLocaleString()}</span>,
    },
  ], [jobRelated, t])

  const statuses = useMemo(() => [...new Set(drafts.map((draft) => draft.status).filter(Boolean))].sort(), [drafts])
  const destinations = useMemo(() => [...new Set(drafts.map((draft) => draft.destinationCountry).filter((value): value is string => Boolean(value)))].sort(), [drafts])
  const filteredDrafts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return drafts.filter((draft) => {
      if (statusFilter && draft.status !== statusFilter) return false
      if (destinationFilter && draft.destinationCountry !== destinationFilter) return false
      if (!query) return true
      return [draft.reference, draft.jobReference, draft.bookingReference, draft.customerName, draft.route, draft.traderReference, draft.status, draft.destinationCountry, draft.currency, draft.amount]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query))
    })
  }, [destinationFilter, drafts, search, statusFilter])

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
        <h1 className="text-[28px] font-medium tracking-[-0.035em] text-[var(--md-ink)]">
          {t(jobRelated ? "Job Related Declarations" : "Stand Alone Declarations")}
        </h1>
        <p className="max-w-[680px] text-[13px] leading-5 text-[var(--md-text)] xl:max-w-[520px] xl:pt-1 xl:text-end">
          {t(jobRelated
            ? "Declarations created from an existing Multideck job, with shipment data brought forward safely."
            : "Create and manage declarations that are not linked to a Multideck job.")}
        </p>
      </header>

      <DataTable
        ariaLabel={t("Declaration register")}
        columnsButtonLabel={t("Manage declaration columns")}
        columns={columns}
        rows={loading || loadError ? [] : filteredDrafts}
        getRowKey={(draft) => draft.id}
        storageKey={`customs-${jobRelated ? "job-related" : "standalone"}-${kind}-register`}
        rowClassName="hover:bg-[var(--md-hover)]"
        onRowClick={!jobRelated ? (draft) => navigate(`/customs/standalone/${kind}/${draft.id}`) : undefined}
        toolbarTabs={(
          <RegisterViewSwitch
            options={["Export", "Import"] as const}
            value={kind === "export" ? "Export" : "Import"}
            onChange={(nextKind) => navigate(`${base}/${nextKind.toLocaleLowerCase()}`)}
            ariaLabel={t("Declaration direction")}
            compact
          />
        )}
        toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => setSearch("")} label="Search declarations" placeholder="Search declarations" />}
        toolbarFilters={(
          <>
            <RegisterFacetSelect
              label="Status"
              allLabel="All statuses"
              value={statusFilter}
              options={statuses.map((status) => ({ value: status, label: titleCase(status) }))}
              onChange={setStatusFilter}
              className="w-[132px]"
            />
            <RegisterFacetSelect
              label="Destination"
              allLabel="All destinations"
              value={destinationFilter}
              options={destinations.map((destination) => ({ value: destination, label: destination }))}
              onChange={setDestinationFilter}
              className="w-[148px]"
            />
          </>
        )}
        compactToolbar
        emptyState={loading ? (
          <div className="mx-auto py-8 text-center text-[13px] text-[var(--md-text)]">{t("Loading saved declarations")}</div>
        ) : loadError ? (
          <div role="alert" className="mx-auto max-w-[520px] py-8 text-center">
            <CircleAlert className="mx-auto size-6 text-[var(--md-red)]" />
            <h3 className="mt-3 text-[15px] font-medium text-[var(--md-ink)]">{t("Saved declarations unavailable")}</h3>
            <p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Refresh the page to try loading the declaration register again.")}</p>
          </div>
        ) : drafts.length && !filteredDrafts.length ? (
          <div className="mx-auto max-w-[440px] py-8 text-center">
            <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{t("No declarations match these filters")}</h3>
            <p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Change or clear a filter to see more declarations.")}</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[440px] place-items-center py-8 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
              <FileCheck2 className="size-5" strokeWidth={1.4} />
            </div>
            <h3 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">
              {t(!jobRelated ? (kind === "export" ? "Ready for the first standalone export" : "Ready for the first standalone import") : "This declaration flow is next")}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
              {t(!jobRelated
                ? "Create a draft using the section-based CDS workspace."
                : "Create the declaration from its linked Multideck job when this workflow is enabled.")}
            </p>
          </div>
        )}
      />
    </div>
  )
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toLocaleUpperCase())
}

function translateCustomsMessage(message: string, t: (text: string) => string) {
  const contact = message.match(/^This contact is missing: (.+)\.$/)
  if (!contact) return t(message)
  return `${t("This contact is missing:")} ${contact[1].split(", ").map(t).join(", ")}.`
}

function iCustomsDeclarationUrl(direction: DeclarationKind, correlationId: string, environment: "sandbox" | "production") {
  const providerId = correlationId.trim()
  if (!providerId) return null
  const configuredAppUrl = String(import.meta.env.VITE_ICUSTOMS_APP_URL ?? "").trim()
  const fallbackAppUrl = environment === "production" ? "https://app.customscloud.co" : "https://app-tdr.customscloud.co"
  try {
    const url = new URL(configuredAppUrl || fallbackAppUrl)
    url.pathname = direction === "export"
      ? `/export/cds/edit/${encodeURIComponent(providerId)}`
      : `/cds/edit/${encodeURIComponent(providerId)}`
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
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

function StandaloneDeclarationEditor({ navigate, kind, declarationId }: { navigate: (path: string) => void; kind: DeclarationKind; declarationId?: string }) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const referenceData = useCustomsReferenceData(kind)
  const [draft, setDraft] = useState<StandaloneExportDraft>(() => createStandaloneDeclarationDraft(kind))
  const [tab, setTab] = useState<EditorTab>("declaration")
  const [viewMode, setViewMode] = useState<EditorViewMode>("tabs")
  const [formTab, setFormTab] = useState<FormTab>("general")
  const [activeItemId, setActiveItemId] = useState(draft.items[0].id)
  const [showDataElements, setShowDataElements] = useState(true)
  const [showCustomsBoxNumbers, setShowCustomsBoxNumbers] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [validated, setValidated] = useState(false)
  const invoiceImportRecoveryKey = declarationId ?? "new"
  const [invoiceImportOpen, setInvoiceImportOpen] = useState(() => hasCustomsInvoiceImportRecovery(invoiceImportRecoveryKey))
  const [loadingDraft, setLoadingDraft] = useState(Boolean(declarationId))
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [iCustomsState, setICustomsState] = useState<ICustomsWorkspaceState | null>(null)
  const [iCustomsBusy, setICustomsBusy] = useState<"loading" | "draft" | "submit" | "refresh" | null>(declarationId ? "loading" : null)
  const [iCustomsIssues, setICustomsIssues] = useState<string[]>([])
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const completion = useMemo(() => declarationCompletion(draft), [draft])
  const activeItem = draft.items.find((item) => item.id === activeItemId) ?? draft.items[0]
  const issueFields = useMemo(() => new Set(validated ? completion.issues.map((issue) => issue.field) : []), [completion.issues, validated])
  const activeItemIssueFields = useMemo(() => new Set(validated ? completion.issues.filter((issue) => issue.itemId === activeItemId).map((issue) => issue.field) : []), [activeItemId, completion.issues, validated])
  const registerPath = `/customs/standalone/${kind}`

  function selectTab(nextTab: EditorTab) {
    if (nextTab === tab) return
    setTab(nextTab)
  }

  useEffect(() => {
    setInvoiceImportOpen(hasCustomsInvoiceImportRecovery(invoiceImportRecoveryKey))
  }, [invoiceImportRecoveryKey])

  useEffect(() => {
    if (!declarationId) return
    let cancelled = false
    setLoadingDraft(true)
    setDraftLoadError(null)
    loadStandaloneDeclarationDraft(declarationId, kind)
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
  }, [declarationId, kind])

  useEffect(() => {
    if (!declarationId) return
    let cancelled = false
    setICustomsBusy("loading")
    getICustomsDeclarationState(declarationId)
      .then((state) => {
        if (!cancelled) setICustomsState(state)
      })
      .catch((reason: unknown) => {
        console.error("The iCustoms declaration state could not be loaded.", reason)
      })
      .finally(() => {
        if (!cancelled) setICustomsBusy(null)
      })
    return () => { cancelled = true }
  }, [declarationId])

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
      setViewMode("tabs")
      selectTab("review")
      toast.warning(t("Declaration needs attention"), { description: `${completion.issues.length} ${t("checks remain")}` })
    } else {
      if (viewMode === "tabs") selectTab("review")
      toast.success(t("Current form checks passed"))
    }
  }

  async function saveDraft() {
    if (savingDraft) return
    setSavingDraft(true)
    let savedLocally = false
    try {
      if (declarationId && iCustomsState?.declaration.provider?.status === "rejected") {
        await reopenRejectedCustomsDeclaration(declarationId)
      }
      const saved = await saveStandaloneDeclarationDraft(draft, declarationId)
      savedLocally = true
      moveCustomsInvoiceImportRecovery(invoiceImportRecoveryKey, saved.id)
      setDraft((current) => ({ ...current, multideckReference: saved.reference }))
      const providerStatus = iCustomsState?.declaration.provider?.status
      const hasEditableProviderDraft = Boolean(iCustomsState?.declaration.hasCustomsDraft) && !["submitted", "accepted", "rejected"].includes(providerStatus ?? "")
      if (hasEditableProviderDraft) {
        setICustomsBusy("draft")
        const validation = await validateICustomsDeclaration(saved.id)
        if (!validation.ready) {
          setICustomsIssues(validation.issues)
          toast.warning(t("Saved in Multideck, but the customs test draft needs attention"), { description: `${validation.issues.length} ${t("customs checks remain")}` })
          return
        }
        await saveICustomsProviderDraft(saved.id, crypto.randomUUID())
        const state = await getICustomsDeclarationState(saved.id)
        setICustomsState(state)
        toast.success(t("Draft saved and customs test draft updated"), { description: saved.reference })
      } else {
        toast.success(t("Draft saved"), { description: saved.reference })
      }
      navigate(registerPath)
    } catch (reason) {
      console.error("The Customs draft or its provider mirror could not be saved.", reason)
      if (savedLocally && iCustomsState?.declaration.hasCustomsDraft) {
        toast.error(t("Saved in Multideck, but the customs update failed"), { description: t(reason instanceof Error ? reason.message : "Try saving again before submission.") })
      } else {
        toast.error(t("Draft could not be saved"), { description: t("Your changes remain on screen. Try saving again.") })
      }
    } finally {
      setSavingDraft(false)
      setICustomsBusy(null)
    }
  }

  async function createOrUpdateICustomsDraft() {
    if (iCustomsBusy || savingDraft) return
    if (completion.issues.length) {
      validate()
      return
    }
    setICustomsBusy("draft")
    setICustomsIssues([])
    try {
      if (declarationId && iCustomsState?.declaration.provider?.status === "rejected") {
        await reopenRejectedCustomsDeclaration(declarationId)
      }
      const saved = await saveStandaloneDeclarationDraft(draft, declarationId)
      moveCustomsInvoiceImportRecovery(invoiceImportRecoveryKey, saved.id)
      setDraft((current) => ({ ...current, multideckReference: saved.reference }))
      const validation = await validateICustomsDeclaration(saved.id)
      if (!validation.ready) {
        setICustomsIssues(validation.issues)
        toast.warning(t("Declaration needs attention"), { description: `${validation.issues.length} ${t("customs checks remain")}` })
        return
      }
      const result = await saveICustomsProviderDraft(saved.id, crypto.randomUUID())
      const state = await getICustomsDeclarationState(saved.id)
      setICustomsState(state)
      toast.success(t(result.declaration.provider?.status === "acknowledged" ? "Customs test draft created" : "Customs test draft updated"), { description: saved.reference })
      if (!declarationId) navigate(`${registerPath}/${saved.id}`)
    } catch (reason) {
      const error = reason instanceof ICustomsApiError ? reason : new ICustomsApiError(reason instanceof Error ? reason.message : "The customs test draft could not be created.")
      setICustomsIssues(error.issues)
      toast.error(t("Customs test draft could not be created"), { description: t(error.message) })
    } finally {
      setICustomsBusy(null)
    }
  }

  async function submitToICustoms() {
    if (!declarationId || iCustomsBusy) return
    setICustomsBusy("submit")
    setICustomsIssues([])
    try {
      await submitICustomsDeclaration(declarationId, crypto.randomUUID())
      const state = await getICustomsDeclarationState(declarationId)
      setICustomsState(state)
      setSubmitDialogOpen(false)
      toast.success(t("Declaration submitted in Test Mode"), { description: state.declaration.provider?.mrn ?? draft.multideckReference })
    } catch (reason) {
      const error = reason instanceof ICustomsApiError ? reason : new ICustomsApiError(reason instanceof Error ? reason.message : "The declaration could not be submitted.")
      setICustomsIssues(error.issues)
      toast.error(t("Customs submission failed"), { description: t(error.message) })
    } finally {
      setICustomsBusy(null)
    }
  }

  async function refreshFromICustoms() {
    if (!declarationId || iCustomsBusy) return
    setICustomsBusy("refresh")
    try {
      await refreshICustomsDeclaration(declarationId)
      const state = await getICustomsDeclarationState(declarationId)
      setICustomsState(state)
      toast.success(t("Customs status refreshed"))
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : "The customs status could not be refreshed."
      toast.error(t("Customs status could not be refreshed"), { description: t(error) })
    } finally {
      setICustomsBusy(null)
    }
  }

  function addItem() {
    const item = createExportDeclarationItem(draft.items.length + 1)
    setDraft((current) => ({ ...current, items: [...current.items, item] }))
    setActiveItemId(item.id)
    if (viewMode === "form") setFormTab("items")
    else selectTab("items")
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
    if (viewMode === "form") setFormTab("items")
    else selectTab("items")
    setInvoiceImportOpen(false)
    toast.success(t("Invoice lines added"), { description: `${sourceLineCount} ${t("source lines became")} ${importedItems.length} ${t("declaration lines")}` })
  }

  const editorTabs: Array<{ id: EditorTab; label: string }> = [
    { id: "declaration", label: t("Declaration") },
    { id: "parties", label: t("Parties") },
    { id: "transport", label: t("Transport") },
    { id: "documents", label: t(kind === "import" ? "Import terms" : "Documents & offices") },
    { id: "items", label: `${t("Items")} (${draft.items.length})` },
    { id: "review", label: t("Review") },
  ]
  const customsStatus = iCustomsState?.declaration.provider?.status ?? iCustomsState?.declaration.status ?? "draft"

  if (loadingDraft) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><p className="text-[13px] text-[var(--md-text)]">{t("Loading saved declaration")}</p></Surface>
  }

  if (draftLoadError) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><CircleAlert className="size-5 text-[var(--md-red)]" /><h1 className="mt-3 text-[18px] font-medium text-[var(--md-ink)]">{t("Saved declaration unavailable")}</h1><p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Return to the declaration register and choose the draft again.")}</p><Button type="button" variant="outline" className="mt-4" onClick={() => navigate(registerPath)}>{t("Back to standalone declarations")}</Button></Surface>
  }

  return (
    <CustomsDirectionContext.Provider value={kind}>
    <CustomsReferenceDataContext.Provider value={referenceData}>
    <CustomsBoxVisibilityContext.Provider value={showCustomsBoxNumbers}>
    <div className="min-w-0 max-w-full space-y-4 overflow-x-clip" data-testid={`standalone-${kind}-editor`}>
      <header>
        <div className="flex min-w-0 flex-col justify-center">
          <button type="button" onClick={() => navigate(registerPath)} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)] hover:text-[var(--md-accent)]">
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("Back to standalone declarations")}
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-medium tracking-[-0.035em] text-[var(--md-ink)]">{t(declarationId ? (kind === "import" ? "Edit import declaration" : "Edit export declaration") : (kind === "import" ? "New import declaration" : "New export declaration"))}</h1>
            <StatusPill tone="teal">{t(kind === "import" ? "Standalone import" : "Standalone export")}</StatusPill>
            <StatusPill tone={customsStatusTone(customsStatus)}>{t(titleCase(customsStatus))}</StatusPill>
          </div>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">{t(viewMode === "tabs" ? "Complete one focused section at a time. Move between sections whenever you need." : "Scan and complete the declaration in one compact form, with goods lines kept in Items.")}</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SegmentedControl
            options={["tabs", "form"] as const}
            value={viewMode}
            onChange={setViewMode}
            ariaLabel={t("Declaration view")}
            renderOption={(option) => t(option === "tabs" ? "Tab view" : "Form view")}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Toggle checked={showDataElements} onChange={setShowDataElements}>{t("Data Elements")}</Toggle>
            <Toggle checked={showCustomsBoxNumbers} onChange={setShowCustomsBoxNumbers}>{t("Customs box numbers")}</Toggle>
            <Toggle checked={showOptional} onChange={setShowOptional}>{t("Optional fields")}</Toggle>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={savingDraft} onClick={() => void saveDraft()}>{t(savingDraft ? "Saving draft" : "Save draft")}</Button>
          <Button type="button" size="sm" className="h-9" onClick={validate}><FileCheck2 className="size-3.5" />{t("Validate")}</Button>
        </div>
      </div>

      {viewMode === "tabs" ? <LayoutGroup id={`customs-${kind}-sections`}>
        <nav className="relative isolate max-w-full overflow-x-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]" aria-label={t("Declaration sections")}>
          <div className="grid min-w-[840px] grid-cols-6 gap-1">
            {editorTabs.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectTab(entry.id)}
                aria-current={tab === entry.id ? "step" : undefined}
                aria-controls={`customs-panel-${entry.id}`}
                data-customs-tab={entry.id}
                className={cn(
                  "relative flex min-h-10 items-center gap-1.5 rounded-[var(--md-radius-lg)] px-2.5 text-start transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a28)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--md-surface)] motion-reduce:active:scale-100 motion-reduce:transition-none",
                  tab === entry.id ? "text-[var(--md-selected-text)]" : "text-[var(--md-text)] hover:bg-[var(--md-hover)]",
                )}
              >
                {tab === entry.id ? <motion.span
                  aria-hidden="true"
                  data-customs-active-tab
                  layoutId={`customs-${kind}-active-tab`}
                  className="absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-selected-bg)] shadow-[inset_0_0_0_1px_var(--md-accent-a14),0_2px_5px_rgba(11,20,19,0.06)]"
                  transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
                /> : null}
                <span className={cn("relative z-10 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium transition-[background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", tab === entry.id ? "bg-[var(--md-accent)] text-white" : "bg-[var(--md-surface-tint)]")}>{index + 1}</span>
                <strong className="relative z-10 min-w-0 truncate text-[12px] font-medium leading-5">{entry.label}</strong>
              </button>
            ))}
          </div>
        </nav>
      </LayoutGroup> : <TabsRail
        tabs={[
          { label: t("General") },
          { label: t("Items"), value: String(draft.items.length) },
        ]}
        activeTab={formTab === "general" ? t("General") : t("Items")}
        onChange={(nextTab) => setFormTab(nextTab === t("Items") ? "items" : "general")}
        className="px-1"
      />}

      {referenceData.loading ? <Surface padding="sm" className="rounded-[var(--md-radius-lg)]"><p className="text-[11px] text-[var(--md-text)]">{t("Loading Customs reference data")}</p></Surface> : null}
      {referenceData.error ? <Surface padding="sm" className="rounded-[var(--md-radius-lg)]"><div className="flex items-center gap-2 text-[11px] text-[var(--md-red)]"><CircleAlert className="size-4 shrink-0" /><span><strong>{t("Customs reference data unavailable")}</strong> {t("Selection fields remain locked until the database catalogue is available.")}</span></div></Surface> : null}

      {viewMode === "form" && formTab === "general" ? <GeneralFormView draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
      {viewMode === "form" && formTab === "items" ? <ItemsSection items={draft.items} activeItem={activeItem} activeItemId={activeItemId} onSelectItem={setActiveItemId} onAdd={addItem} onOpenInvoiceImport={() => setInvoiceImportOpen(true)} onDuplicate={duplicateItem} onRemove={removeItem} update={updateItem} updateRow={updateItemById} showDataElements={showDataElements} showOptional={showOptional} issues={activeItemIssueFields} validated={validated} t={t} /> : null}
      {viewMode === "tabs" ? <div className="relative min-w-0 overflow-x-clip">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={tab}
            id={`customs-panel-${tab}`}
            data-customs-tab-panel={tab}
            initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
            transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
            className="min-w-0"
          >
            {tab === "declaration" ? <DeclarationSection draft={draft} update={update} showDataElements={showDataElements} issues={issueFields} t={t} /> : null}
            {tab === "parties" ? <PartiesSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
            {tab === "transport" ? <TransportSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
            {tab === "documents" ? <DocumentsSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
            {tab === "items" ? <ItemsSection items={draft.items} activeItem={activeItem} activeItemId={activeItemId} onSelectItem={setActiveItemId} onAdd={addItem} onOpenInvoiceImport={() => setInvoiceImportOpen(true)} onDuplicate={duplicateItem} onRemove={removeItem} update={updateItem} updateRow={updateItemById} showDataElements={showDataElements} showOptional={showOptional} issues={activeItemIssueFields} validated={validated} t={t} /> : null}
            {tab === "review" ? <ReviewSection draft={draft} completion={completion} iCustomsState={iCustomsState} iCustomsBusy={iCustomsBusy} iCustomsIssues={iCustomsIssues} update={update} updateItem={updateItemById} onValidate={validate} onCreateDraft={() => void createOrUpdateICustomsDraft()} onSubmit={() => setSubmitDialogOpen(true)} onRefresh={() => void refreshFromICustoms()} t={t} /> : null}
          </motion.div>
        </AnimatePresence>
      </div> : null}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="rounded-[var(--md-radius-xl)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Submit declaration in Test Mode?")}</DialogTitle>
            <DialogDescription>{t("This sends the saved declaration to the customs test service. It will not enter the live customs environment.")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[12px] text-[var(--md-text)]">
            <p className="font-medium text-[var(--md-ink)]">{draft.multideckReference || t("Saved declaration")}</p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("Keep as draft")}</Button></DialogClose>
            <Button type="button" disabled={iCustomsBusy === "submit"} onClick={() => void submitToICustoms()}><Send className="size-4" />{t(iCustomsBusy === "submit" ? "Submitting" : "Submit")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    {invoiceImportOpen ? <CustomsInvoiceImportWorkspace key={invoiceImportRecoveryKey} recoveryKey={invoiceImportRecoveryKey} onClose={() => setInvoiceImportOpen(false)} onApply={applyInvoiceItems} existingItemCount={draft.items.length} /> : null}
    </CustomsBoxVisibilityContext.Provider>
    </CustomsReferenceDataContext.Provider>
    </CustomsDirectionContext.Provider>
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

function GeneralFormView(props: SectionProps & { showOptional: boolean }) {
  return <CompactCustomsFormContext.Provider value>
    <div className="grid gap-[var(--md-page-stack-gap-compact)]">
      <DeclarationSection {...props} />
      <PartiesSection {...props} />
      <TransportSection {...props} />
      <DocumentsSection {...props} />
    </div>
  </CompactCustomsFormContext.Provider>
}

function DeclarationSection({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const direction = useContext(CustomsDirectionContext)
  const allDeclarationCategories = useReferenceOptions("declaration_category", t, "Select category")
  const declarationCategories = direction === "import"
    ? allDeclarationCategories.filter(([code]) => !code || code === "H1")
    : allDeclarationCategories
  const declarationTypes = useReferenceOptions("declaration_type", t, "Select type")
  const currencies = useReferenceOptions("currency", t, "Select currency")
  return <SectionFrame title={t("Declaration details")} description={t(direction === "import" ? "Core identity and totals for this import declaration." : "Core identity and totals for this export declaration.")}>
    <FieldGrid>
      <SelectField label={t("Declaration category")} dataElement="1/1" customsBox="1" required showDataElements={showDataElements} value={draft.declarationCategory} onChange={(value) => update("declarationCategory", value)} options={declarationCategories} />
      <SelectField label={t("Type of declaration")} dataElement="1/2" customsBox="1" required showDataElements={showDataElements} value={draft.declarationType} onChange={(value) => update("declarationType", value)} options={declarationTypes} />
      <TextField label={t("Trader reference number")} dataElement="2/4" customsBox="44" showDataElements={showDataElements} value={draft.traderReference} onChange={(value) => update("traderReference", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 19))} invalid={issues.has("traderReference")} fieldKey="traderReference" highlighted={highlightedField === "traderReference"} maxLength={19} />
      {direction === "export" ? <><TextField label={t("Internal reference")} required showDataElements={showDataElements} value={draft.internalReference} onChange={(value) => update("internalReference", value)} invalid={issues.has("internalReference")} fieldKey="internalReference" highlighted={highlightedField === "internalReference"} /><TextField label={t("UCN")} showDataElements={showDataElements} value={draft.ucn} onChange={(value) => update("ucn", value)} /><TextField label={t("Badge ID")} showDataElements={showDataElements} value={draft.badgeId} onChange={(value) => update("badgeId", value)} /></> : null}
      <TextField label={t("Total amount")} dataElement="4/11" customsBox="22" required showDataElements={showDataElements} value={draft.totalAmount} onChange={(value) => update("totalAmount", value)} invalid={issues.has("totalAmount")} fieldKey="totalAmount" highlighted={highlightedField === "totalAmount"} />
      <SelectField label={t("Currency code")} dataElement="4/10" customsBox="22" required showDataElements={showDataElements} value={draft.currency} onChange={(value) => update("currency", value)} options={currencies} />
      <TextField label={t("Total packages")} dataElement="6/18" customsBox="6" required showDataElements={showDataElements} value={draft.totalPackages} onChange={(value) => update("totalPackages", value)} invalid={issues.has("totalPackages")} fieldKey="totalPackages" highlighted={highlightedField === "totalPackages"} />
      <TextField label={t("Total gross mass")} dataElement="6/5" customsBox="35" required showDataElements={showDataElements} value={draft.totalGrossMass} onChange={(value) => update("totalGrossMass", value)} invalid={issues.has("totalGrossMass")} fieldKey="totalGrossMass" highlighted={highlightedField === "totalGrossMass"} suffix="kg" />
      {direction === "export" ? <TextField label={t("Total net mass")} dataElement="6/1" customsBox="38" required showDataElements={showDataElements} value={draft.totalNetMass} onChange={(value) => update("totalNetMass", value)} invalid={issues.has("totalNetMass")} fieldKey="totalNetMass" highlighted={highlightedField === "totalNetMass"} suffix="kg" /> : null}
    </FieldGrid>
  </SectionFrame>
}

function PartiesSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const direction = useContext(CustomsDirectionContext)
  const compact = useContext(CompactCustomsFormContext)
  const representationTypes = useReferenceOptions("representation_type", t, "Not specified")
  const countries = useReferenceOptions("country", t, "Select country")
  return <section aria-labelledby="customs-party-details-heading" className="min-w-0">
    <header className={cn("flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6", compact ? "mb-2" : "mb-3")}>
      <h2 id="customs-party-details-heading" className={cn("shrink-0 font-medium text-[var(--md-ink)]", compact ? "text-[13px]" : "text-[15px]")}>{t("Party details")}</h2>
      <p className={cn("text-[var(--md-subtle)]", compact ? "text-[10.5px] leading-4" : "text-[12px] leading-5 sm:max-w-[65%] sm:text-end")}>{t(direction === "import" ? "Importer, exporter, declarant and representation." : "Exporter, consignee, declarant and representation.")}</p>
    </header>
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      {direction === "import" ? <>
        <PartyFieldsGroup title={t("Importer")}>
          <PartyContactWarning values={[draft.importerName, draft.importerAddressLine, draft.importerCity, draft.importerPostcode, draft.importerCountry]} fields={["importerName", "importerAddressLine", "importerCity", "importerPostcode", "importerCountry"]} issues={issues} t={t} />
          <TextField label={t("Importer")} dataElement="3/16" customsBox="8" required showDataElements={showDataElements} value={draft.importer} onChange={(value) => update("importer", value)} invalid={issues.has("importer")} fieldKey="importer" highlighted={highlightedField === "importer"} placeholder={t("Name or EORI")} />
          <TextField label={t("Importer legal name")} dataElement="3/16" customsBox="8" required showDataElements={showDataElements} value={draft.importerName} onChange={(value) => update("importerName", value)} invalid={issues.has("importerName")} fieldKey="importerName" highlighted={highlightedField === "importerName"} />
          <TextField label={t("Importer street address")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerAddressLine} onChange={(value) => update("importerAddressLine", value)} invalid={issues.has("importerAddressLine")} fieldKey="importerAddressLine" highlighted={highlightedField === "importerAddressLine"} />
          <TextField label={t("Importer town or city")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerCity} onChange={(value) => update("importerCity", value)} invalid={issues.has("importerCity")} fieldKey="importerCity" highlighted={highlightedField === "importerCity"} />
          <TextField label={t("Importer postcode")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerPostcode} onChange={(value) => update("importerPostcode", value)} invalid={issues.has("importerPostcode")} fieldKey="importerPostcode" highlighted={highlightedField === "importerPostcode"} />
          <SelectField label={t("Importer country")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerCountry} onChange={(value) => update("importerCountry", value)} invalid={issues.has("importerCountry")} fieldKey="importerCountry" highlighted={highlightedField === "importerCountry"} options={countries} />
        </PartyFieldsGroup>
      </> : null}
      <PartyFieldsGroup title={t("Exporter")}>
        <PartyContactWarning values={[draft.exporterName, draft.exporterAddressLine, draft.exporterCity, draft.exporterPostcode, draft.exporterCountry]} fields={["exporterName", "exporterAddressLine", "exporterCity", "exporterPostcode", "exporterCountry"]} issues={issues} t={t} />
        <TextField label={t("Exporter")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporter} onChange={(value) => update("exporter", value)} invalid={issues.has("exporter")} fieldKey="exporter" highlighted={highlightedField === "exporter"} placeholder={t("Name or EORI")} />
        <TextField label={t("Exporter legal name")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporterName} onChange={(value) => update("exporterName", value)} invalid={issues.has("exporterName")} fieldKey="exporterName" highlighted={highlightedField === "exporterName"} />
        <TextField label={t("Exporter street address")} dataElement="3/2" customsBox="2" required showDataElements={showDataElements} value={draft.exporterAddressLine} onChange={(value) => update("exporterAddressLine", value)} invalid={issues.has("exporterAddressLine")} fieldKey="exporterAddressLine" highlighted={highlightedField === "exporterAddressLine"} />
        <TextField label={t("Exporter town or city")} dataElement="3/2" customsBox="2" required showDataElements={showDataElements} value={draft.exporterCity} onChange={(value) => update("exporterCity", value)} invalid={issues.has("exporterCity")} fieldKey="exporterCity" highlighted={highlightedField === "exporterCity"} />
        <TextField label={t("Exporter postcode")} dataElement="3/2" customsBox="2" required showDataElements={showDataElements} value={draft.exporterPostcode} onChange={(value) => update("exporterPostcode", value)} invalid={issues.has("exporterPostcode")} fieldKey="exporterPostcode" highlighted={highlightedField === "exporterPostcode"} />
        <SelectField label={t("Exporter country")} dataElement="3/2" customsBox="2" required showDataElements={showDataElements} value={draft.exporterCountry} onChange={(value) => update("exporterCountry", value)} invalid={issues.has("exporterCountry")} fieldKey="exporterCountry" highlighted={highlightedField === "exporterCountry"} options={countries} />
      </PartyFieldsGroup>
      {direction === "export" ? <PartyFieldsGroup title={t("Consignee")}>
        <PartyContactWarning values={[draft.consigneeName, draft.consigneeAddressLine, draft.consigneeCity, draft.consigneePostcode, draft.consigneeCountry]} fields={["consigneeName", "consigneeAddressLine", "consigneeCity", "consigneePostcode", "consigneeCountry"]} issues={issues} t={t} />
        <TextField label={t("Consignee")} dataElement="3/9" customsBox="8" required showDataElements={showDataElements} value={draft.consignee} onChange={(value) => update("consignee", value)} invalid={issues.has("consignee")} fieldKey="consignee" highlighted={highlightedField === "consignee"} placeholder={t("Name or EORI")} />
        <TextField label={t("Consignee legal name")} dataElement="3/9" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeName} onChange={(value) => update("consigneeName", value)} invalid={issues.has("consigneeName")} fieldKey="consigneeName" highlighted={highlightedField === "consigneeName"} />
        <TextField label={t("Consignee street address")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeAddressLine} onChange={(value) => update("consigneeAddressLine", value)} invalid={issues.has("consigneeAddressLine")} fieldKey="consigneeAddressLine" highlighted={highlightedField === "consigneeAddressLine"} />
        <TextField label={t("Consignee town or city")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeCity} onChange={(value) => update("consigneeCity", value)} invalid={issues.has("consigneeCity")} fieldKey="consigneeCity" highlighted={highlightedField === "consigneeCity"} />
        <TextField label={t("Consignee postcode")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneePostcode} onChange={(value) => update("consigneePostcode", value)} invalid={issues.has("consigneePostcode")} fieldKey="consigneePostcode" highlighted={highlightedField === "consigneePostcode"} />
        <SelectField label={t("Consignee country")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeCountry} onChange={(value) => update("consigneeCountry", value)} invalid={issues.has("consigneeCountry")} fieldKey="consigneeCountry" highlighted={highlightedField === "consigneeCountry"} options={countries} />
      </PartyFieldsGroup> : null}
      <PartyFieldsGroup title={t("Declarant")} className="xl:col-span-2" fieldsClassName="xl:grid-cols-3 2xl:grid-cols-3">
        <PartyContactWarning values={[draft.declarantName, draft.declarantAddressLine, draft.declarantCity, draft.declarantPostcode, draft.declarantCountry]} fields={["declarantName", "declarantAddressLine", "declarantCity", "declarantPostcode", "declarantCountry"]} issues={issues} t={t} />
        <TextField label={t("Declarant")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarant} onChange={(value) => update("declarant", value)} invalid={issues.has("declarant")} fieldKey="declarant" highlighted={highlightedField === "declarant"} placeholder={t("Name or EORI")} />
        <TextField label={t("Declarant legal name")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarantName} onChange={(value) => update("declarantName", value)} invalid={issues.has("declarantName")} fieldKey="declarantName" highlighted={highlightedField === "declarantName"} />
        <TextField label={t("Declarant street address")} dataElement="3/18" customsBox="14" required showDataElements={showDataElements} value={draft.declarantAddressLine} onChange={(value) => update("declarantAddressLine", value)} invalid={issues.has("declarantAddressLine")} fieldKey="declarantAddressLine" highlighted={highlightedField === "declarantAddressLine"} />
        <TextField label={t("Declarant town or city")} dataElement="3/18" customsBox="14" required showDataElements={showDataElements} value={draft.declarantCity} onChange={(value) => update("declarantCity", value)} invalid={issues.has("declarantCity")} fieldKey="declarantCity" highlighted={highlightedField === "declarantCity"} />
        <TextField label={t("Declarant postcode")} dataElement="3/18" customsBox="14" required showDataElements={showDataElements} value={draft.declarantPostcode} onChange={(value) => update("declarantPostcode", value)} invalid={issues.has("declarantPostcode")} fieldKey="declarantPostcode" highlighted={highlightedField === "declarantPostcode"} />
        <SelectField label={t("Declarant country")} dataElement="3/18" customsBox="14" required showDataElements={showDataElements} value={draft.declarantCountry} onChange={(value) => update("declarantCountry", value)} invalid={issues.has("declarantCountry")} fieldKey="declarantCountry" highlighted={highlightedField === "declarantCountry"} options={countries} />
      </PartyFieldsGroup>
      <PartyFieldsGroup title={t(direction === "export" ? "Carrier & representation" : "Representation")} className="xl:col-span-2" fieldsClassName="xl:grid-cols-3 2xl:grid-cols-3">
        {direction === "export" ? <TextField label={t("Carrier")} showDataElements={showDataElements} value={draft.carrier} onChange={(value) => update("carrier", value)} placeholder={t("Name or EORI")} /> : null}
        {direction === "export" ? <TextField label={t("Representative")} dataElement="3/19" customsBox="14" showDataElements={showDataElements} value={draft.representative} onChange={(value) => update("representative", value)} placeholder={t("Name or EORI")} /> : null}
        <SelectField label={t("Type of representation")} dataElement="3/21" customsBox="14" required={direction === "import"} showDataElements={showDataElements} value={draft.representationType} onChange={(value) => update("representationType", value)} invalid={issues.has("representationType")} fieldKey="representationType" highlighted={highlightedField === "representationType"} options={representationTypes} />
        {showOptional ? <><TextField label={t("Authorisation identifier")} showDataElements={showDataElements} value={draft.authorisationIdentifier} onChange={(value) => update("authorisationIdentifier", value)} /><TextField label={t("Authorisation category")} showDataElements={showDataElements} value={draft.authorisationCategory} onChange={(value) => update("authorisationCategory", value)} /></> : null}
      </PartyFieldsGroup>
    </div>
  </section>
}

function PartyFieldsGroup({ title, children, className, fieldsClassName }: { title: string; children: ReactNode; className?: string; fieldsClassName?: string }) {
  const compact = useContext(CompactCustomsFormContext)
  return <section aria-label={title} className={cn("min-w-0 max-w-full bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "rounded-[var(--md-radius-md)] p-3" : "rounded-[var(--md-radius-lg)] p-4", className)}>
    <h3 className={cn("font-medium text-[var(--md-ink)]", compact ? "mb-2 text-[11px] leading-4" : "mb-3 text-[12px] leading-5")}>{title}</h3>
    <div className="min-w-0">
      <FieldGrid className={cn("min-w-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2", fieldsClassName)}>{children}</FieldGrid>
    </div>
  </section>
}

function PartyContactWarning({ values, fields, issues, t }: {
  values: string[]
  fields: string[]
  issues: Set<string>
  t: (text: string) => string
}) {
  const labels = ["Name", "Street", "City", "Postcode", "Country"]
  const missing = values.flatMap((value, index) => value.trim() ? [] : [{ field: fields[index], label: labels[index] }])
  if (!missing.length || !missing.some(({ field }) => issues.has(field))) return null
  return <p role="alert" className="col-span-full -mb-1 text-[11px] font-medium text-[var(--md-red)]">
    {t("This contact is missing:")} {missing.map(({ label }) => t(label)).join(", ")}.
  </p>
}

function TransportSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const direction = useContext(CustomsDirectionContext)
  const countries = useReferenceOptions("country", t, "Select country")
  const transportModes = useReferenceOptions("transport_mode", t, "Select transport mode")
  const goodsLocationTypes = useReferenceOptions("goods_location_type", t, "Select type")
  const containerIndicators = useReferenceOptions("container_indicator", t, "Select option")
  return <SectionFrame title={t("Transport and location")} description={t("Routing, border movement and goods location.")}>
    <FieldGrid>
      <SelectField label={t("Export country")} dataElement="5/14" customsBox="15" required showDataElements={showDataElements} value={draft.exportCountry} onChange={(value) => update("exportCountry", value)} options={countries} />
      <SelectField label={t("Country of destination")} dataElement="5/8" customsBox="17" required showDataElements={showDataElements} value={draft.destinationCountry} onChange={(value) => update("destinationCountry", value)} invalid={issues.has("destinationCountry")} fieldKey="destinationCountry" highlighted={highlightedField === "destinationCountry"} options={countries} />
      {direction === "export" ? <SelectField label={t("Inland transport mode")} dataElement="7/5" customsBox="26" showDataElements={showDataElements} value={draft.inlandMode} onChange={(value) => update("inlandMode", value)} options={transportModes} /> : null}
      <SelectField label={t("Mode at border")} dataElement="7/4" customsBox="25" required showDataElements={showDataElements} value={draft.borderMode} onChange={(value) => update("borderMode", value)} options={transportModes} />
      <SelectField label={t("Border transport nationality")} dataElement="7/15" customsBox="21" showDataElements={showDataElements} value={draft.borderNationality} onChange={(value) => update("borderNationality", value)} options={countries} />
      <TextField label={t("Border identification number")} dataElement="7/14" customsBox="21" showDataElements={showDataElements} value={draft.borderIdentificationNumber} onChange={(value) => update("borderIdentificationNumber", value)} />
      {direction === "import" ? <><TextField label={t("Arrival transport type")} dataElement="7/9" customsBox="18" showDataElements={showDataElements} value={draft.arrivalIdentificationType} onChange={(value) => update("arrivalIdentificationType", value)} /><TextField label={t("Arrival identification number")} dataElement="7/7" customsBox="18" showDataElements={showDataElements} value={draft.arrivalIdentificationNumber} onChange={(value) => update("arrivalIdentificationNumber", value)} /></> : <TextField label={t("Departure identification number")} dataElement="7/7" customsBox="18" showDataElements={showDataElements} value={draft.departureIdentificationNumber} onChange={(value) => update("departureIdentificationNumber", value)} />}
      <SelectField label={t("Type of location")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationType} onChange={(value) => update("goodsLocationType", value)} options={goodsLocationTypes} />
      <TextField label={t("Name of place")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationName} onChange={(value) => update("goodsLocationName", value)} />
      <TextField label={t("Goods location identifier")} dataElement="5/23" customsBox="30" required={direction === "import"} showDataElements={showDataElements} value={draft.goodsLocationIdentifier} onChange={(value) => update("goodsLocationIdentifier", value)} invalid={issues.has("goodsLocationIdentifier")} fieldKey="goodsLocationIdentifier" highlighted={highlightedField === "goodsLocationIdentifier"} />
      <SelectField label={t("Transported in container")} dataElement="7/2" customsBox="19" showDataElements={showDataElements} value={draft.isContainerised} onChange={(value) => update("isContainerised", value)} options={containerIndicators} />
      {draft.isContainerised === "1" ? <><TextField label={t("Container ID")} dataElement="7/10" customsBox="31" required showDataElements={showDataElements} value={draft.containerId} onChange={(value) => update("containerId", value)} invalid={issues.has("containerId")} fieldKey="containerId" highlighted={highlightedField === "containerId"} /><TextField label={t("Seal identifier")} dataElement="7/18" customsBox="31" showDataElements={showDataElements} value={draft.sealIdentifier} onChange={(value) => update("sealIdentifier", value)} /></> : null}
      {showOptional && direction === "export" ? <><TextField label={t("GVMS AI code")} showDataElements={showDataElements} value={draft.gvmsCode} onChange={(value) => update("gvmsCode", value)} /><TextField label={t("GVMS AI code value")} showDataElements={showDataElements} value={draft.gvmsValue} onChange={(value) => update("gvmsValue", value)} /><TextField label={t("Routing country")} showDataElements={showDataElements} value={draft.routingCountry} onChange={(value) => update("routingCountry", value)} /></> : null}
    </FieldGrid>
  </SectionFrame>
}

function DocumentsSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const direction = useContext(CustomsDirectionContext)
  const previousDocumentCategories = useReferenceOptions("previous_document_category", t, "Select category")
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t, "Select document type")
  const transactionNatures = useReferenceOptions("transaction_nature", t, "Select nature")
  return <SectionFrame title={t(direction === "import" ? "Import terms" : "Documents and customs offices")} description={t(direction === "import" ? "Trade terms and the transaction details applied to every goods item." : "Previous documents, controlling offices and guarantees.")}>
    <FieldGrid>
      {direction === "export" ? <><SelectField label={t("Previous document category")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentCategory} onChange={(value) => update("previousDocumentCategory", value)} options={previousDocumentCategories} /><SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentType} onChange={(value) => update("previousDocumentType", value)} options={previousDocumentTypes} /><TextField label={t("Document reference")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentReference} onChange={(value) => update("previousDocumentReference", value.replace(/[^A-Za-z0-9]/g, "").slice(0, 35))} invalid={issues.has("previousDocumentReference")} fieldKey="previousDocumentReference" highlighted={highlightedField === "previousDocumentReference"} maxLength={35} /></> : null}
      <SelectField label={t("Nature of transaction")} dataElement="8/5" customsBox="24" required showDataElements={showDataElements} value={draft.transactionNature} onChange={(value) => update("transactionNature", value)} invalid={issues.has("transactionNature")} fieldKey="transactionNature" highlighted={highlightedField === "transactionNature"} options={transactionNatures} />
      {direction === "import" ? <TextField label={t("Trade terms")} dataElement="4/1" customsBox="20" required showDataElements={showDataElements} value={draft.tradeTerms} onChange={(value) => update("tradeTerms", value.toUpperCase().slice(0, 3))} invalid={issues.has("tradeTerms")} fieldKey="tradeTerms" highlighted={highlightedField === "tradeTerms"} maxLength={3} /> : <><TextField label={t("Exchange rate")} dataElement="4/15" customsBox="23" showDataElements={showDataElements} value={draft.exchangeRate} onChange={(value) => update("exchangeRate", value)} /><TextField label={t("Customs office of exit")} dataElement="5/12" customsBox="29" required showDataElements={showDataElements} value={draft.exitOffice} onChange={(value) => update("exitOffice", value)} invalid={issues.has("exitOffice")} fieldKey="exitOffice" highlighted={highlightedField === "exitOffice"} /></>}
      {showOptional && direction === "export" ? <><TextField label={t("Supervising office")} dataElement="5/27" showDataElements={showDataElements} value={draft.supervisingOffice} onChange={(value) => update("supervisingOffice", value)} /><TextField label={t("Customs office of presentation")} dataElement="5/26" showDataElements={showDataElements} value={draft.presentationOffice} onChange={(value) => update("presentationOffice", value)} /><TextField label={t("Warehouse type")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseType} onChange={(value) => update("warehouseType", value)} /><TextField label={t("Warehouse identifier")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseIdentifier} onChange={(value) => update("warehouseIdentifier", value)} /><TextField label={t("Guarantee type")} dataElement="8/2" customsBox="52" showDataElements={showDataElements} value={draft.guaranteeType} onChange={(value) => update("guaranteeType", value)} /><TextField label={t("GRN or guarantee ID")} dataElement="8/3" customsBox="52" showDataElements={showDataElements} value={draft.guaranteeReference} onChange={(value) => update("guaranteeReference", value)} /></> : null}
    </FieldGrid>
  </SectionFrame>
}

function ItemsSection({ items, activeItem, activeItemId, onSelectItem, onAdd, onOpenInvoiceImport, onDuplicate, onRemove, update, updateRow, showDataElements, showOptional, issues, validated, highlightedField, t }: { items: ExportDeclarationItem[]; activeItem: ExportDeclarationItem; activeItemId: string; onSelectItem: (id: string) => void; onAdd: () => void; onOpenInvoiceImport: () => void; onDuplicate: (itemId?: string) => void; onRemove: (itemId?: string) => void; update: <K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) => void; updateRow: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void; showDataElements: boolean; showOptional: boolean; issues: Set<string>; validated: boolean; highlightedField?: string; t: (text: string) => string }) {
  const { direction } = useLanguage()
  const declarationDirection = useContext(CustomsDirectionContext)
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const previousActiveItemId = useRef(activeItemId)
  const goodsLineTableRef = useRef<HTMLDivElement>(null)
  const packageKinds = useReferenceOptions("package_kind", t)
  const countries = useReferenceOptions("country", t)
  const procedureCodes = useReferenceOptions("procedure_code", t)
  const additionalProcedureCodes = useReferenceOptions("additional_procedure_code", t)
  const currencies = useReferenceOptions("currency", t)

  useEffect(() => {
    if (previousActiveItemId.current === activeItemId) return
    previousActiveItemId.current = activeItemId
    setExpandedItemId(activeItemId)
  }, [activeItemId])

  useEffect(() => {
    if (!expandedItemId) return
    const scrollContainer = goodsLineTableRef.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
    if (scrollContainer) scrollContainer.scrollLeft = 0
  }, [expandedItemId])

  const toggleItem = (itemId: string) => {
    if (itemId !== activeItemId) onSelectItem(itemId)
    setExpandedItemId((current) => current === itemId ? null : itemId)
  }

  const inputClass = "h-7 rounded-[var(--md-radius-xs)] border-transparent bg-[var(--md-surface-tint)] px-1.5 text-[10px] shadow-none focus-visible:border-[var(--md-accent)] focus-visible:ring-1 focus-visible:ring-[var(--md-accent)]"
  const itemColumns = useMemo<DataTableColumn<ExportDeclarationItem>[]>(() => ([
    {
      id: "line",
      label: "Line",
      width: 64,
      minWidth: 64,
      canHide: false,
      canPin: false,
      cell: (item) => {
        const index = items.findIndex((candidate) => candidate.id === item.id)
        const missing = mandatoryItemGaps(item, declarationDirection)
        const expanded = item.id === expandedItemId
        const statusLabel = missing.length ? `${missing.length} ${t(validated ? "errors" : "required")}` : t("Complete")
        return <button type="button" data-item-disclosure aria-expanded={expanded} aria-controls={`item-details-${item.id}`} aria-label={`${t(expanded ? "Collapse item details" : "Expand item details")} ${index + 1}. ${statusLabel}`} onClick={(event) => { event.stopPropagation(); toggleItem(item.id) }} className="group/disclosure flex min-h-9 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[var(--md-radius-sm)] px-1 text-start outline-none transition-colors duration-150 hover:bg-[var(--md-surface)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-1 active:bg-[var(--md-hover)]">
          <ChevronDown className={cn("size-3.5 shrink-0 text-[var(--md-subtle)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-1.5">
            <strong className="block text-[11px] font-semibold text-[var(--md-ink)]">{index + 1}</strong>
            <span aria-hidden="true" className={cn("block size-2 rounded-full", missing.length ? (validated ? "bg-[var(--md-red)]" : "bg-[var(--md-amber)]") : "bg-[var(--md-green)]")} />
            <span className="sr-only">{statusLabel}</span>
          </span>
        </button>
      },
    },
    {
      id: "commodityCode", label: t("Commodity code"), width: 144, minWidth: 132, kind: "text", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <div className="relative"><Input aria-label={`${t("Commodity code")} ${index + 1}`} className={cn(inputClass, "pe-8", validatedItemField(issues, missing, "commodityCode") && "ring-1 ring-[var(--md-red)]")} value={item.commodityCode} onChange={(event) => updateRow(item.id, "commodityCode", event.target.value.replace(/\D/g, "").slice(0, 10))} /><CommoditySmartSearch item={item} direction={declarationDirection} update={(field, value) => updateRow(item.id, field, value)} triggerClassName="absolute end-0 top-0" t={t} /></div> },
    },
    {
      id: "description", label: t("Description of goods"), width: 200, minWidth: 200, kind: "long-text", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t("Description of goods")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "description") && "ring-1 ring-[var(--md-red)]")} value={item.description} onChange={(event) => updateRow(item.id, "description", event.target.value)} /> },
    },
    {
      id: "packageKind", label: t("Package kind"), width: 96, minWidth: 96, kind: "attribute", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <ItemTableSelect label={`${t("Package kind")} ${index + 1}`} value={item.packageKind} onChange={(value) => updateRow(item.id, "packageKind", value)} options={packageKinds} invalid={validatedItemField(issues, missing, "packageKind")} /> },
    },
    {
      id: "packageMarks", label: t("Package marks"), width: 130, minWidth: 130, kind: "text", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t("Package marks")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "packageMarks") && "ring-1 ring-[var(--md-red)]")} value={item.packageMarks} onChange={(event) => updateRow(item.id, "packageMarks", event.target.value)} /> },
    },
    {
      id: "packageCount", label: t("Package count"), width: 82, minWidth: 82, kind: "number", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t("Package count")} ${index + 1}`} inputMode="numeric" className={cn(inputClass, validatedItemField(issues, missing, "packageCount") && "ring-1 ring-[var(--md-red)]")} value={item.packageCount} onChange={(event) => updateRow(item.id, "packageCount", event.target.value)} /> },
    },
    {
      id: "origin", label: t("Non-preferential origin"), width: 112, minWidth: 112, kind: "attribute", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <ItemTableSelect label={`${t("Non-preferential origin")} ${index + 1}`} value={item.nonPreferentialOrigin} onChange={(value) => updateRow(item.id, "nonPreferentialOrigin", value)} options={countries} invalid={validatedItemField(issues, missing, "nonPreferentialOrigin")} /> },
    },
    {
      id: "procedureCode", label: t("Procedure code"), width: 102, minWidth: 102, kind: "attribute", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <ItemTableSelect label={`${t("Procedure code")} ${index + 1}`} value={item.procedureCode} onChange={(value) => updateRow(item.id, "procedureCode", value)} options={procedureCodes} invalid={validatedItemField(issues, missing, "procedureCode")} /> },
    },
    {
      id: "additionalProcedureCode", label: t("Additional procedure code"), width: 118, minWidth: 118, kind: "attribute", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <ItemTableSelect label={`${t("Additional procedure code")} ${index + 1}`} value={item.additionalProcedureCode} onChange={(value) => updateRow(item.id, "additionalProcedureCode", value)} options={additionalProcedureCodes} invalid={validatedItemField(issues, missing, "additionalProcedureCode")} /> },
    },
    ...(["grossMass", "netMass"] as const).map((field) => ({
      id: field,
      label: t(field === "grossMass" ? "Gross mass" : "Net mass"),
      width: 88,
      minWidth: 88,
      kind: "number" as const,
      canPin: false,
      cell: (item: ExportDeclarationItem) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t(field === "grossMass" ? "Gross mass" : "Net mass")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, field) && "ring-1 ring-[var(--md-red)]")} value={item[field]} onChange={(event) => updateRow(item.id, field, event.target.value)} /> },
    })),
    {
      id: "price", label: t("Price / currency"), width: 155, minWidth: 155, kind: "number", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <div className="grid grid-cols-[1fr_72px] gap-1"><Input aria-label={`${t("Item price")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, "itemPrice") && "ring-1 ring-[var(--md-red)]")} value={item.itemPrice} onChange={(event) => updateRow(item.id, "itemPrice", event.target.value)} /><ItemTableSelect label={`${t("Currency code")} ${index + 1}`} value={item.currency} onChange={(value) => updateRow(item.id, "currency", value)} options={currencies} /></div> },
    },
    {
      id: "statisticalValue", label: t("Statistical value"), width: 105, minWidth: 105, kind: "number", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t("Statistical value")} ${index + 1}`} inputMode="decimal" className={cn(inputClass, validatedItemField(issues, missing, "statisticalValue") && "ring-1 ring-[var(--md-red)]")} value={item.statisticalValue} onChange={(event) => updateRow(item.id, "statisticalValue", event.target.value)} /> },
    },
    {
      id: "previousDocumentReference", label: t("Previous document reference"), width: 150, minWidth: 150, kind: "text", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t("Previous document reference")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "previousDocumentReference") && "ring-1 ring-[var(--md-red)]")} value={item.previousDocumentReference} maxLength={35} onChange={(event) => updateRow(item.id, "previousDocumentReference", event.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 35))} /> },
    },
    {
      id: "actions", label: t("Actions"), width: 54, minWidth: 54, kind: "actions", canHide: false, canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); return <button type="button" aria-label={`${t("Remove")} ${t("Item")} ${index + 1}`} disabled={items.length === 1} onClick={(event) => { event.stopPropagation(); onRemove(item.id) }} className="grid size-8 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-surface)] hover:text-[var(--md-red)] disabled:opacity-30"><Trash2 className="size-3.5" /></button> },
    },
  ] satisfies DataTableColumn<ExportDeclarationItem>[]).map((column: DataTableColumn<ExportDeclarationItem>) => {
    const resizable = column.id !== "line" && column.id !== "actions"
    const minimumResizableWidth = column.id === "description"
      ? 140
      : column.id === "price" || column.id === "previousDocumentReference"
        ? 120
        : 80

    return {
      ...column,
      resizable,
      minWidth: resizable ? Math.min(column.minWidth ?? minimumResizableWidth, minimumResizableWidth) : column.minWidth,
      headerClassName: cn(column.headerClassName, "border-e border-[var(--md-line)] last:border-e-0"),
      cellClassName: cn(column.cellClassName, "border-e border-[var(--md-line)] last:border-e-0"),
    }
  }), [additionalProcedureCodes, countries, currencies, declarationDirection, expandedItemId, issues, items, packageKinds, procedureCodes, t, updateRow, validated])

  return <div className="min-w-0 space-y-4">
    <Surface padding="none" className="w-full min-w-0 max-w-full overflow-hidden rounded-[var(--md-radius-xl)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-line)] px-4 py-3">
        <span>
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Mandatory goods-line fields")}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Add rows and enter the essentials here. Expand a line to edit all of its details in place.")}</p>
        </span>
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={onOpenInvoiceImport}><ScanText className="size-3.5" />{t("Import invoice")}</Button><Button type="button" size="sm" onClick={onAdd}><Plus className="size-3.5" />{t("Add item")}</Button></div>
      </header>
      <div ref={goodsLineTableRef} className="w-full min-w-0 max-w-full [container-type:inline-size]" data-testid="mandatory-goods-line-scroll">
        <DataTable
          ariaLabel={t("Mandatory goods-line fields")}
          columns={itemColumns}
          rows={items}
          getRowKey={(item) => item.id}
          storageKey="customs-mandatory-goods-lines"
          selectedRowKey={activeItemId}
          minimumWidth={1780}
          showToolbar={false}
          showColumnManager={false}
          className={cn("rounded-none shadow-none", expandedItemId && "[&_[data-slot=table-container]]:overflow-x-hidden")}
          tableClassName="table-fixed text-start"
          rowProps={(item) => ({
            onClick: (event) => { if (!(event.target as HTMLElement).closest("input, button, [role='combobox']")) toggleItem(item.id) },
            onFocus: (event) => { if (!(event.target as HTMLElement).closest("[data-item-disclosure]")) onSelectItem(item.id) },
            onContextMenu: () => onSelectItem(item.id),
          })}
          wrapRow={(item, row) => <ContextMenuPrimitive.Root dir={direction}>
            <ContextMenuPrimitive.Trigger asChild>{row}</ContextMenuPrimitive.Trigger>
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
          </ContextMenuPrimitive.Root>}
          renderAfterRow={(item, visibleColumnCount) => {
            const index = items.findIndex((candidate) => candidate.id === item.id)
            const expanded = item.id === expandedItemId
            return <AnimatePresence initial={false}>
              {expanded ? (
                    <motion.tr
                      key={`${item.id}-details`}
                      initial={shouldReduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={reduceMotion(shouldReduceMotion, mdMotion.exit)}
                    >
                      <td colSpan={visibleColumnCount} className="bg-[var(--md-surface-soft)] p-0 align-top">
                        <motion.div
                          id={`item-details-${item.id}`}
                          initial={shouldReduceMotion ? false : { height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={reduceMotion(shouldReduceMotion, expanded ? mdMotion.panel : mdMotion.exit)}
                          className="overflow-hidden"
                        >
                          <div className="sticky start-0 w-[100cqw] min-w-0 max-w-[100cqw] p-3">
                            <ItemDetailsEditor
                              item={item}
                              itemNumber={index + 1}
                              onDuplicate={() => onDuplicate(item.id)}
                              onRemove={() => onRemove(item.id)}
                              canRemove={items.length > 1}
                              update={update}
                              showDataElements={showDataElements}
                              showOptional={showOptional}
                              issues={issues}
                              highlightedField={highlightedField}
                              t={t}
                            />
                          </div>
                        </motion.div>
                      </td>
                    </motion.tr>
                  ) : null}
            </AnimatePresence>
          }}
        />
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-4 py-2 text-[10px] text-[var(--md-subtle)]">
        <span>{items.length} {items.length === 1 ? t("goods line") : t("goods lines")}</span>
        <span>{t("Scroll horizontally to edit every mandatory field")}</span>
      </footer>
    </Surface>

  </div>
}

function CommoditySmartSearch({ item, direction, update, triggerClassName, triggerVariant = "search", t }: {
  item: ExportDeclarationItem
  direction: DeclarationKind
  update: <K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) => void
  triggerClassName?: string
  triggerVariant?: "search" | "certificates"
  t: (text: string) => string
}) {
  const searchInput = useRef<HTMLInputElement>(null)
  const liveRequestId = useRef(0)
  const shouldReduceMotion = useReducedMotion() ?? false
  const countryOptions = useReferenceOptions("country", t, "Select country")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(item.description.trim() || item.commodityCode)
  const [importCountry, setImportCountry] = useState("GB")
  const [searchDirection, setSearchDirection] = useState<DeclarationKind>(direction)
  const [taxAndDuty, setTaxAndDuty] = useState(true)
  const [dispatchedCountry, setDispatchedCountry] = useState(item.nonPreferentialOrigin || item.destinationCountry)
  const [suggestions, setSuggestions] = useState<ICustomsCommoditySuggestion[]>([])
  const [suggestionsLoadedFor, setSuggestionsLoadedFor] = useState("")
  const [selectedSuggestion, setSelectedSuggestion] = useState<ICustomsCommoditySuggestion | null>(null)
  const [detail, setDetail] = useState<ICustomsCommodityDetail | null>(null)
  const [selectedCertificates, setSelectedCertificates] = useState<Record<string, boolean>>({})
  const [certificateReferences, setCertificateReferences] = useState<Record<string, string>>({})
  const [certificatesOpen, setCertificatesOpen] = useState(false)
  const [suggestionsBusy, setSuggestionsBusy] = useState(false)
  const [detailsBusy, setDetailsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogId = `commodity-smart-search-${item.id}-${triggerVariant}`

  useEffect(() => {
    const resolvedQuery = query.trim()
    const requestId = ++liveRequestId.current
    if (!open || resolvedQuery.length < 2 || /^\d{10}$/.test(resolvedQuery)) {
      setSuggestionsBusy(false)
      if (resolvedQuery.length < 2 || /^\d{10}$/.test(resolvedQuery)) {
        setSuggestions([])
        setSuggestionsLoadedFor("")
      }
      return
    }

    const timer = window.setTimeout(() => {
      setSuggestionsBusy(true)
      setError(null)
      searchICustomsCommodities(resolvedQuery, importCountry)
        .then((response) => {
          if (requestId !== liveRequestId.current) return
          setSuggestions(response.suggestions)
          setSuggestionsLoadedFor(resolvedQuery)
        })
        .catch((caught: unknown) => {
          if (requestId !== liveRequestId.current) return
          setSuggestions([])
          setSuggestionsLoadedFor(resolvedQuery)
          setError(caught instanceof Error ? caught.message : t("Commodity search could not be completed."))
        })
        .finally(() => {
          if (requestId === liveRequestId.current) setSuggestionsBusy(false)
        })
    }, 320)

    return () => window.clearTimeout(timer)
  }, [importCountry, open, query, t])

  function resetSelection() {
    setSelectedSuggestion(null)
    setDetail(null)
    setSelectedCertificates({})
    setCertificateReferences({})
    setCertificatesOpen(false)
  }

  function resetSearchResults() {
    liveRequestId.current += 1
    setSuggestions([])
    setSuggestionsLoadedFor("")
    setSuggestionsBusy(false)
    resetSelection()
    setError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) return
    const queryOnOpen = triggerVariant === "certificates" ? item.commodityCode : item.description.trim() || item.commodityCode
    setQuery(queryOnOpen)
    setImportCountry("GB")
    setSearchDirection(direction)
    setTaxAndDuty(true)
    setDispatchedCountry(item.nonPreferentialOrigin || item.destinationCountry)
    resetSearchResults()
    if (triggerVariant === "certificates" && /^\d{10}$/.test(item.commodityCode)) {
      void loadDetails({ code: item.commodityCode, description: item.description.trim(), confidence: null }, true, direction)
    }
  }

  async function loadDetails(suggestion: ICustomsCommoditySuggestion, revealCertificates = false, detailDirection = searchDirection) {
    setSelectedSuggestion(suggestion)
    setDetail(null)
    setSelectedCertificates({})
    setCertificateReferences({})
    setCertificatesOpen(revealCertificates)
    setError(null)
    setDetailsBusy(true)
    try {
      const response = await getICustomsCommodityDetails(suggestion.code, detailDirection)
      setDetail(response.detail)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Commodity details could not be loaded."))
    } finally {
      setDetailsBusy(false)
    }
  }

  async function runSearch() {
    const resolvedQuery = query.trim()
    if (resolvedQuery.length < 2) {
      setError(t("Enter at least two characters or a 10-digit commodity code."))
      return
    }
    setError(null)
    resetSelection()
    if (/^\d{10}$/.test(resolvedQuery)) {
      await loadDetails({ code: resolvedQuery, description: item.description.trim(), confidence: null })
      return
    }
    const requestId = ++liveRequestId.current
    setSuggestionsBusy(true)
    try {
      const response = await searchICustomsCommodities(resolvedQuery, importCountry)
      if (requestId !== liveRequestId.current) return
      setSuggestions(response.suggestions)
      setSuggestionsLoadedFor(resolvedQuery)
      if (!response.suggestions.length) setError(t("No matching commodity codes were returned."))
    } catch (caught) {
      if (requestId !== liveRequestId.current) return
      setError(caught instanceof Error ? caught.message : t("Commodity search could not be completed."))
    } finally {
      if (requestId === liveRequestId.current) setSuggestionsBusy(false)
    }
  }

  function toggleCertificate(certificate: ICustomsCommodityCertificate, checked: boolean) {
    setSelectedCertificates((current) => ({ ...current, [certificate.code]: checked }))
    if (!checked) {
      setCertificateReferences((current) => {
        const next = { ...current }
        delete next[certificate.code]
        return next
      })
    }
  }

  function applySelection() {
    if (!detail || !selectedSuggestion || !detail.declarable) return
    const certificates = detail.certificates.filter((certificate) => selectedCertificates[certificate.code])
    const missingReference = certificates.find((certificate) => certificate.referenceRequired && !certificateReferences[certificate.code]?.trim())
    if (missingReference) {
      setError(`${missingReference.code}: ${t("enter the required document reference before applying.")}`)
      return
    }

    update("commodityCode", detail.code)
    if (!item.description.trim()) {
      const enteredDescription = query.trim()
      const resolvedDescription = /^\d{10}$/.test(enteredDescription)
        ? detail.description || selectedSuggestion.description
        : enteredDescription || selectedSuggestion.description || detail.description
      if (resolvedDescription) update("description", resolvedDescription)
    }

    const existingCodes = new Set([
      `${item.additionalDocumentCategory}${item.additionalDocumentType}`.toUpperCase(),
      ...item.additionalDocuments.map((entry) => `${entry.category}${entry.type}`.toUpperCase()),
    ].filter(Boolean))
    const newCertificates = certificates.filter((certificate) => !existingCodes.has(certificate.code))
    let usePrimary = ![
      item.additionalDocumentCategory,
      item.additionalDocumentType,
      item.additionalDocumentId,
      item.additionalDocumentName,
      item.lpcoExemptionCode,
    ].some((value) => value.trim())
    const additionalDocuments = [...item.additionalDocuments]

    for (const certificate of newCertificates) {
      const reference = certificateReferences[certificate.code]?.trim() || ""
      const name = certificate.statement || ""
      if (usePrimary) {
        update("additionalDocumentCategory", certificate.category)
        update("additionalDocumentType", certificate.type)
        update("additionalDocumentId", reference)
        update("additionalDocumentName", name)
        usePrimary = false
      } else {
        additionalDocuments.push({
          id: repeatableCustomsEntryId("additional-document"),
          category: certificate.category,
          type: certificate.type,
          reference,
          name,
          lpcoExemptionCode: "",
          writeOff: "",
          validityDate: "",
        })
      }
    }
    if (additionalDocuments.length !== item.additionalDocuments.length) {
      update("additionalDocuments", additionalDocuments)
    }
    toast.success(t(triggerVariant === "certificates" ? "Certificates applied" : "Commodity selection applied"))
    setOpen(false)
  }

  const selectedCertificateCount = Object.values(selectedCertificates).filter(Boolean).length
  const formattedCode = (code: string) => code.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5")

  const resolvedQuery = query.trim()
  const hasCurrentEmptyResult = suggestionsLoadedFor === resolvedQuery && resolvedQuery.length >= 2 && !suggestionsBusy && suggestions.length === 0 && !selectedSuggestion
  const showSuggestionPanel = !selectedSuggestion && resolvedQuery.length >= 2 && (suggestionsBusy || suggestions.length > 0 || hasCurrentEmptyResult)

  function renderCertificateList() {
    if (!detail) return null
    return <div className="rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-line)]">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[12px] font-medium text-[var(--md-ink)]">{t("Certificates and waivers")}</h4>
        <span className="text-[10px] text-[var(--md-subtle)]">{selectedCertificateCount} {t("selected")}</span>
      </div>
      <p className="mt-1 max-w-[65ch] text-pretty text-[11px] leading-[1.5] text-[var(--md-subtle)]">{t("Select only the documents or legal declarations that genuinely apply to these goods.")}</p>
      {detail.certificates.length ? <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pe-1">
        {detail.certificates.map((certificate) => {
          const checked = Boolean(selectedCertificates[certificate.code])
          const certificateId = `certificate-${triggerVariant}-${item.id}-${certificate.code}`
          return <div key={certificate.code} className={cn("rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] p-3", checked && "shadow-[inset_0_0_0_1px_var(--md-accent)]") }>
            <div className="flex items-start gap-2.5">
              <Checkbox id={certificateId} checked={checked} onCheckedChange={(value) => toggleCertificate(certificate, value === true)} aria-label={`${certificate.code} ${certificate.description}`} />
              <label htmlFor={certificateId} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-[12px] font-medium text-[var(--md-ink)]">{certificate.code}</span>
                <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--md-text)]">{certificate.description}</span>
              </label>
            </div>
            {certificate.guidance ? <details className="ms-6 mt-2 text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer font-medium text-[var(--md-accent)]">{t("View CDS guidance")}</summary><p className="mt-1 whitespace-pre-line leading-[1.5]">{certificate.guidance}</p></details> : null}
            {checked && certificate.referenceRequired ? <div className="ms-6 mt-2.5"><label htmlFor={`${certificateId}-reference`} className="mb-1.5 block text-[11px] font-medium text-[var(--md-text)]">{t("Document reference")}</label><Input id={`${certificateId}-reference`} value={certificateReferences[certificate.code] ?? ""} onChange={(event) => setCertificateReferences((current) => ({ ...current, [certificate.code]: event.target.value.slice(0, 70) }))} className="h-9 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] text-base sm:text-[13px]" /></div> : null}
          </div>
        })}
      </div> : <p className="mt-3 text-[11px] text-[var(--md-subtle)]">{t("No declaration-specific certificates were returned for this code.")}</p>}
    </div>
  }

  return <>
    {triggerVariant === "certificates" ? <Button type="button" variant="outline" size="sm" disabled={!/^\d{10}$/.test(item.commodityCode)} aria-haspopup="dialog" aria-controls={dialogId} onClick={() => handleOpenChange(true)} className={cn("h-8 gap-1.5 px-2.5 text-[11px]", triggerClassName)}>
      <FileCheck2 className="size-3.5" aria-hidden="true" />
      {t("Certificates list")}
    </Button> : <button type="button" aria-label={t("Smart commodity search")} aria-haspopup="dialog" aria-controls={dialogId} onClick={(event) => { event.stopPropagation(); handleOpenChange(true) }} className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] outline-none transition-[background-color,color,transform] duration-150 hover:bg-[var(--md-accent-a10)] hover:text-[var(--md-accent)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] active:scale-[0.96]", open && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]", triggerClassName)}>
      <Search className="size-3.5" aria-hidden="true" />
    </button>}
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id={dialogId} className={cn("flex max-h-[min(calc(100dvh-32px),780px)] flex-col gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-0", triggerVariant === "certificates" ? "sm:max-w-[680px]" : "sm:max-w-[760px]")} onOpenAutoFocus={(event) => { if (triggerVariant === "search") { event.preventDefault(); searchInput.current?.focus() } }}>
        <DialogHeader className="shrink-0 px-5 pb-0 pt-5 pe-14">
          <DialogTitle className="text-balance text-[22px] font-medium leading-[1.15] text-[var(--md-ink)]">{triggerVariant === "certificates" ? <>{t("Certificates for commodity")} <span className="whitespace-nowrap tabular-nums" dir="ltr">{formattedCode(item.commodityCode)}</span></> : t("Search for a commodity")}</DialogTitle>
          <DialogDescription className="max-w-[65ch] text-pretty text-[12px] leading-[1.5] text-[var(--md-subtle)]">{triggerVariant === "certificates" ? item.description || t("Review the documents and legal declarations returned for this commodity code.") : t("Choose an import country and enter a product name or 10-digit commodity code.")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {triggerVariant === "search" ? <>
          <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,auto)_minmax(150px,auto)]">
            <div className="min-w-0">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--md-text)]">{t("Import country")}</span>
              <Select value={importCountry} onValueChange={(value) => { setImportCountry(value); resetSearchResults() }}>
                <SelectTrigger aria-label={t("Import country")} className="h-10 w-full border-0 bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]"><SelectValue placeholder={t("Select country")} /></SelectTrigger>
                <SelectContent>{countryOptions.filter(([value]) => value).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <span className="mb-2 block text-[12px] font-medium text-[var(--md-text)]">{t("Import / export")}</span>
              <div className="flex h-10 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 shadow-[var(--md-shadow-line)]">
                <span className={cn("text-[12px] transition-colors duration-150", searchDirection === "import" ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-subtle)]")}>{t("Import")}</span>
                <Switch aria-label={t("Import / export")} checked={searchDirection === "export"} onCheckedChange={(checked) => { setSearchDirection(checked ? "export" : "import"); resetSelection() }} />
                <span className={cn("text-[12px] transition-colors duration-150", searchDirection === "export" ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-subtle)]")}>{t("Export")}</span>
              </div>
            </div>
            <div>
              <span className="mb-2 block text-[12px] font-medium text-[var(--md-text)]">{t("Tax & duty")}</span>
              <div className="flex h-10 items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 shadow-[var(--md-shadow-line)]">
                <span className="whitespace-nowrap text-[12px] text-[var(--md-text)]">{t("Show rates")}</span>
                <Switch aria-label={t("Tax & duty")} checked={taxAndDuty} onCheckedChange={setTaxAndDuty} />
              </div>
            </div>

            <AnimatePresence initial={false}>
              {taxAndDuty ? <motion.div key="dispatched-country" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={reduceMotion(shouldReduceMotion, mdMotion.exit)} className="min-w-0 md:col-span-3">
                <span className="mb-1.5 block text-[12px] font-medium text-[var(--md-text)]">{t("Dispatched country")}</span>
                <Select value={dispatchedCountry || undefined} onValueChange={setDispatchedCountry}>
                  <SelectTrigger aria-label={t("Dispatched country")} className="h-10 w-full border-0 bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]"><SelectValue placeholder={t("Select country")} /></SelectTrigger>
                  <SelectContent>{countryOptions.filter(([value]) => value).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </motion.div> : null}
            </AnimatePresence>
          </div>

          <div className="mt-4">
            <label htmlFor={`commodity-search-${item.id}`} className="mb-1.5 block text-[12px] font-medium text-[var(--md-text)]">{t("Commodity code or description")}</label>
            <div className="relative">
              <Input ref={searchInput} id={`commodity-search-${item.id}`} value={query} onChange={(event) => { setQuery(event.target.value); setSuggestions([]); setSuggestionsLoadedFor(""); resetSelection(); setError(null) }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch() } }} placeholder={t("e.g. hardback books or 4901100000")} autoComplete="off" aria-autocomplete="list" aria-controls={`commodity-suggestions-${item.id}`} aria-expanded={showSuggestionPanel} className={cn("h-11 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] pe-12 text-base shadow-[var(--md-shadow-line)] sm:text-[14px]", showSuggestionPanel && "rounded-b-none")} />
              <button type="button" aria-label={t("Search commodities")} disabled={detailsBusy} onClick={() => void runSearch()} className="absolute end-1 top-1 grid size-9 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-accent)] text-white outline-none transition-[background-color,opacity,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--md-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60">
                {suggestionsBusy ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {showSuggestionPanel ? <motion.div id={`commodity-suggestions-${item.id}`} role="listbox" aria-label={t("Commodity search results")} initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={reduceMotion(shouldReduceMotion, mdMotion.exit)} className="max-h-[300px] overflow-y-auto border-b border-[var(--md-line)] bg-transparent">
                {suggestionsBusy && !suggestions.length ? <div className="flex min-h-20 items-center justify-start gap-2 border-t border-[var(--md-line)] px-4 py-4 text-[12px] text-[var(--md-subtle)]"><RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />{t("Searching")}</div> : null}
                {suggestions.map((suggestion, index) => <motion.button key={`${suggestionsLoadedFor}-${suggestion.code}`} type="button" role="option" aria-selected="false" initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion(shouldReduceMotion, { ...mdMotion.exit, delay: Math.min(index, 6) * 0.025 })} onClick={() => void loadDetails(suggestion)} className="w-full border-t border-[var(--md-line)] px-4 py-3 text-start outline-none transition-[background-color,transform] duration-150 hover:bg-[var(--md-hover)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent)] active:scale-[0.99]">
                  <span className="block text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{formattedCode(suggestion.code)}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[1.5] text-[var(--md-text)]">{suggestion.description}</span>
                </motion.button>)}
                {hasCurrentEmptyResult ? <div className="border-t border-[var(--md-line)] px-4 py-4 text-start"><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("No matching commodity codes were returned.")}</p><p className="mt-1 text-[11px] leading-[1.5] text-[var(--md-subtle)]">{t("Try a more specific product description or an exact 10-digit code.")}</p></div> : null}
              </motion.div> : null}
            </AnimatePresence>
          </div>
          </> : null}

          {error ? <p role="alert" className="mt-3 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_8%,transparent)] px-3 py-2.5 text-[12px] leading-[1.5] text-[var(--md-red)]">{error}</p> : null}

          {detailsBusy ? <div className="mt-4 flex min-h-24 items-center justify-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[12px] text-[var(--md-subtle)]"><RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />{t("Loading tariff details")}</div> : null}

          <AnimatePresence initial={false}>
            {detail && selectedSuggestion ? <motion.section key={`commodity-detail-${detail.code}`} initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={reduceMotion(shouldReduceMotion, mdMotion.panel)} className={cn(triggerVariant === "certificates" ? "mt-0" : "mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3")}>
              {triggerVariant === "certificates" ? renderCertificateList() : <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{formattedCode(detail.code)}</p>
                  <p className="mt-1 max-w-[65ch] text-pretty text-[12px] leading-[1.5] text-[var(--md-text)]">{detail.description || selectedSuggestion.description}</p>
                </div>
                <StatusPill tone={detail.declarable ? "green" : "red"} className="h-6 px-2.5 text-[10px]">{t(detail.declarable ? "Declarable" : "Not declarable")}</StatusPill>
              </div>

              {taxAndDuty && searchDirection === "import" ? <div className="mt-3 flex flex-wrap gap-2">
                {detail.dutyRate ? <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] px-2.5 py-1.5 text-[11px] text-[var(--md-text)]"><strong className="font-medium text-[var(--md-ink)]">{t("Third-country duty")}</strong> · {detail.dutyRate}</span> : null}
                {detail.vatOptions.map((option) => <span key={option.code} className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] px-2.5 py-1.5 text-[11px] text-[var(--md-text)]"><strong className="font-medium text-[var(--md-ink)]">{option.code}</strong> · {option.label}</span>)}
              </div> : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10.5px] text-[var(--md-subtle)]">{t("Source: iCustoms UK Online Tariff")}</p>
                <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-[11px]" onClick={() => setCertificatesOpen((current) => !current)} aria-expanded={certificatesOpen}>{t("Certificates list")}{selectedCertificateCount ? <span className="tabular-nums">({selectedCertificateCount})</span> : null}</Button>
              </div>

              <AnimatePresence initial={false}>
                {certificatesOpen ? <motion.div key="certificates" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={reduceMotion(shouldReduceMotion, mdMotion.exit)} className="mt-4">
                  {renderCertificateList()}
                </motion.div> : null}
              </AnimatePresence>
              </>}
            </motion.section> : null}
          </AnimatePresence>
        </div>

        <DialogFooter className="shrink-0 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-5 pb-4 pt-3 sm:justify-between">
          <DialogClose asChild><Button type="button" variant="ghost">{t("Cancel")}</Button></DialogClose>
          <Button type="button" disabled={!detail?.declarable || detailsBusy} onClick={applySelection}>{t(triggerVariant === "certificates" ? "Save certificates" : "Save commodity")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

function ItemDetailsEditor({ item, itemNumber, onDuplicate, onRemove, canRemove, update, showDataElements, showOptional, issues, highlightedField, t }: {
  item: ExportDeclarationItem
  itemNumber: number
  onDuplicate: () => void
  onRemove: () => void
  canRemove: boolean
  update: <K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) => void
  showDataElements: boolean
  showOptional: boolean
  issues: Set<string>
  highlightedField?: string
  t: (text: string) => string
}) {
  const declarationDirection = useContext(CustomsDirectionContext)
  const packageKindFields = useReferenceOptions("package_kind", t, "Select package")
  const countryFields = useReferenceOptions("country", t, "Select country")
  const optionalCountries = useReferenceOptions("country", t, "Not specified")
  const procedureCodeFields = useReferenceOptions("procedure_code", t, "Select procedure")
  const additionalProcedureCodeFields = useReferenceOptions("additional_procedure_code", t, "Select procedure")
  const currencyFields = useReferenceOptions("currency", t, "Select currency")
  const previousDocumentCategories = useReferenceOptions("previous_document_category", t, "Select category")
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t, "Select document type")

  return <div className="min-w-0 max-w-full space-y-3" aria-label={`${t("Item details")} ${itemNumber}`}>
    <div className={cn("grid min-w-0 items-start gap-3", declarationDirection === "import" ? "xl:grid-cols-2" : "xl:grid-cols-[minmax(260px,0.95fr)_minmax(260px,0.88fr)_minmax(300px,1.05fr)]")}>
      <div className="min-w-0 space-y-3">
        <ItemDetailGroup title={t("Commodity")}>
          <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
          <div className="relative"><TextField label={t("Commodity code")} dataElement="6/14" customsBox="33" required showDataElements={showDataElements} value={item.commodityCode} onChange={(value) => update("commodityCode", value.replace(/\D/g, "").slice(0, 10))} invalid={issues.has("commodityCode")} fieldKey="commodityCode" highlighted={highlightedField === "commodityCode"} inputClassName="pe-10" /><CommoditySmartSearch item={item} direction={declarationDirection} update={update} triggerClassName="absolute bottom-1 end-1" t={t} /></div>
          {declarationDirection === "export" ? <TextField label={t("UN dangerous goods code")} dataElement="6/12" customsBox="31" showDataElements={showDataElements} value={item.dangerousGoodsCode} onChange={(value) => update("dangerousGoodsCode", value)} /> : null}
          <TextAreaField label={t("Description of goods")} dataElement="6/8" customsBox="31" required showDataElements={showDataElements} value={item.description} onChange={(value) => update("description", value)} invalid={issues.has("description")} fieldKey="description" highlighted={highlightedField === "description"} />
          <div className="flex justify-start"><CommoditySmartSearch item={item} direction={declarationDirection} update={update} triggerVariant="certificates" t={t} /></div>
          {showOptional ? <TextField label={t("CUS code")} dataElement="6/13" customsBox="31" showDataElements={showDataElements} value={item.cusCode} onChange={(value) => update("cusCode", value)} /> : null}
          </FieldGrid>
          {showOptional ? <div className="mt-3 space-y-3">
            <RepeatableCustomsFields title={t("TARIC additional codes")} addLabel={t("Add TARIC code")} onAdd={() => update("additionalTaricCodes", [...item.additionalTaricCodes, { id: repeatableCustomsEntryId("taric"), code: "" }])}>
              <TextField label={t("TARIC additional code")} dataElement="6/16" customsBox="33" showDataElements={showDataElements} value={item.taricCode} onChange={(value) => update("taricCode", value)} />
              {item.additionalTaricCodes.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove TARIC code")} onRemove={() => update("additionalTaricCodes", item.additionalTaricCodes.filter((candidate) => candidate.id !== entry.id))}><TextField label={t("TARIC additional code")} dataElement="6/16" customsBox="33" showDataElements={showDataElements} value={entry.code} onChange={(code) => update("additionalTaricCodes", item.additionalTaricCodes.map((candidate) => candidate.id === entry.id ? { ...candidate, code } : candidate))} /></RepeatableCustomsRow>)}
            </RepeatableCustomsFields>
            <RepeatableCustomsFields title={t("National additional codes")} addLabel={t("Add national code")} onAdd={() => update("additionalNationalCodes", [...item.additionalNationalCodes, { id: repeatableCustomsEntryId("national"), code: "" }])}>
              <TextField label={t("National additional code")} dataElement="6/17" customsBox="33" showDataElements={showDataElements} value={item.nationalCode} onChange={(value) => update("nationalCode", value)} />
              {item.additionalNationalCodes.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove national code")} onRemove={() => update("additionalNationalCodes", item.additionalNationalCodes.filter((candidate) => candidate.id !== entry.id))}><TextField label={t("National additional code")} dataElement="6/17" customsBox="33" showDataElements={showDataElements} value={entry.code} onChange={(code) => update("additionalNationalCodes", item.additionalNationalCodes.map((candidate) => candidate.id === entry.id ? { ...candidate, code } : candidate))} /></RepeatableCustomsRow>)}
            </RepeatableCustomsFields>
          </div> : null}
        </ItemDetailGroup>

        <ItemDetailGroup title={t("Packaging & procedure")}>
          <div className="space-y-3">
            <RepeatableCustomsFields title={t("Package details")} addLabel={t("Add package detail")} onAdd={() => update("additionalPackageDetails", [...item.additionalPackageDetails, { id: repeatableCustomsEntryId("package"), kind: "", marks: "", count: "" }])}>
              <FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
                <SelectField label={t("Package kind")} dataElement="6/9" customsBox="31" required showDataElements={showDataElements} value={item.packageKind} onChange={(value) => update("packageKind", value)} invalid={issues.has("packageKind")} fieldKey="packageKind" highlighted={highlightedField === "packageKind"} options={packageKindFields} />
                <TextField label={t("Package marks")} dataElement="6/11" customsBox="31" required showDataElements={showDataElements} value={item.packageMarks} onChange={(value) => update("packageMarks", value)} invalid={issues.has("packageMarks")} fieldKey="packageMarks" highlighted={highlightedField === "packageMarks"} />
                <TextField label={t("Package count")} dataElement="6/10" customsBox="31" required showDataElements={showDataElements} value={item.packageCount} onChange={(value) => update("packageCount", value)} invalid={issues.has("packageCount")} fieldKey="packageCount" highlighted={highlightedField === "packageCount"} />
              </FieldGrid>
              {item.additionalPackageDetails.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove package detail")} onRemove={() => update("additionalPackageDetails", item.additionalPackageDetails.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2"><SelectField label={t("Package kind")} dataElement="6/9" customsBox="31" showDataElements={showDataElements} value={entry.kind} onChange={(kind) => update("additionalPackageDetails", item.additionalPackageDetails.map((candidate) => candidate.id === entry.id ? { ...candidate, kind } : candidate))} options={packageKindFields} /><TextField label={t("Package marks")} dataElement="6/11" customsBox="31" showDataElements={showDataElements} value={entry.marks} onChange={(marks) => update("additionalPackageDetails", item.additionalPackageDetails.map((candidate) => candidate.id === entry.id ? { ...candidate, marks } : candidate))} /><TextField label={t("Package count")} dataElement="6/10" customsBox="31" showDataElements={showDataElements} value={entry.count} onChange={(count) => update("additionalPackageDetails", item.additionalPackageDetails.map((candidate) => candidate.id === entry.id ? { ...candidate, count } : candidate))} /></FieldGrid></RepeatableCustomsRow>)}
            </RepeatableCustomsFields>
            <FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
              <SelectField label={t("Non-preferential origin")} dataElement="5/15" customsBox="34" required showDataElements={showDataElements} value={item.nonPreferentialOrigin} onChange={(value) => update("nonPreferentialOrigin", value)} invalid={issues.has("nonPreferentialOrigin")} fieldKey="nonPreferentialOrigin" highlighted={highlightedField === "nonPreferentialOrigin"} options={countryFields} />
              <SelectField label={t("Procedure code")} dataElement="1/10" customsBox="37" required showDataElements={showDataElements} value={item.procedureCode} onChange={(value) => update("procedureCode", value)} invalid={issues.has("procedureCode")} fieldKey="procedureCode" highlighted={highlightedField === "procedureCode"} options={procedureCodeFields} />
            </FieldGrid>
            <RepeatableCustomsFields title={t("Additional procedure codes")} addLabel={t("Add procedure code")} onAdd={() => update("additionalProcedureCodes", [...item.additionalProcedureCodes, { id: repeatableCustomsEntryId("procedure"), code: "" }])}>
              <SelectField label={t("Additional procedure code")} dataElement="1/11" customsBox="37" required showDataElements={showDataElements} value={item.additionalProcedureCode} onChange={(value) => update("additionalProcedureCode", value)} invalid={issues.has("additionalProcedureCode")} fieldKey="additionalProcedureCode" highlighted={highlightedField === "additionalProcedureCode"} options={additionalProcedureCodeFields} />
              {item.additionalProcedureCodes.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove procedure code")} onRemove={() => update("additionalProcedureCodes", item.additionalProcedureCodes.filter((candidate) => candidate.id !== entry.id))}><SelectField label={t("Additional procedure code")} dataElement="1/11" customsBox="37" showDataElements={showDataElements} value={entry.code} onChange={(code) => update("additionalProcedureCodes", item.additionalProcedureCodes.map((candidate) => candidate.id === entry.id ? { ...candidate, code } : candidate))} options={additionalProcedureCodeFields} /></RepeatableCustomsRow>)}
            </RepeatableCustomsFields>
          </div>
        </ItemDetailGroup>
      </div>

      <div className="min-w-0 space-y-3">
        <ItemDetailGroup title={t("Documents")}>
          <div className="space-y-3">
            <RepeatableCustomsFields title={t("Previous documents")} addLabel={t("Add previous document")} onAdd={() => update("additionalPreviousDocuments", [...item.additionalPreviousDocuments, { id: repeatableCustomsEntryId("previous-document"), category: "", type: "", reference: "" }])}>
              <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
                {declarationDirection === "import" ? <SelectField label={t("Previous document category")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={item.previousDocumentCategory} onChange={(value) => update("previousDocumentCategory", value)} invalid={issues.has("previousDocumentCategory")} fieldKey="previousDocumentCategory" highlighted={highlightedField === "previousDocumentCategory"} options={previousDocumentCategories} /> : null}
                <SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={item.previousDocumentType} onChange={(value) => update("previousDocumentType", value)} options={previousDocumentTypes} />
                <TextField label={t("Previous document reference")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={item.previousDocumentReference} onChange={(value) => update("previousDocumentReference", value.replace(/[^A-Za-z0-9]/g, "").slice(0, 35))} invalid={issues.has("previousDocumentReference")} fieldKey="previousDocumentReference" highlighted={highlightedField === "previousDocumentReference"} maxLength={35} />
              </FieldGrid>
              {item.additionalPreviousDocuments.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove previous document")} onRemove={() => update("additionalPreviousDocuments", item.additionalPreviousDocuments.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">{declarationDirection === "import" ? <SelectField label={t("Previous document category")} dataElement="2/1" customsBox="40" showDataElements={showDataElements} value={entry.category} onChange={(category) => update("additionalPreviousDocuments", item.additionalPreviousDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, category } : candidate))} options={previousDocumentCategories} /> : null}<SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" showDataElements={showDataElements} value={entry.type} onChange={(type) => update("additionalPreviousDocuments", item.additionalPreviousDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, type } : candidate))} options={previousDocumentTypes} /><TextField label={t("Previous document reference")} dataElement="2/1" customsBox="40" showDataElements={showDataElements} value={entry.reference} onChange={(reference) => update("additionalPreviousDocuments", item.additionalPreviousDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, reference: reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 35) } : candidate))} maxLength={35} /></FieldGrid></RepeatableCustomsRow>)}
            </RepeatableCustomsFields>
            {showOptional ? <>
              <RepeatableCustomsFields title={t("Additional documents")} addLabel={t("Add additional document")} onAdd={() => update("additionalDocuments", [...item.additionalDocuments, { id: repeatableCustomsEntryId("additional-document"), category: "", type: "", reference: "", name: "", lpcoExemptionCode: "", writeOff: "", validityDate: "" }])}>
                <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1"><TextField label={t("Additional document category")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentCategory} onChange={(value) => update("additionalDocumentCategory", value)} /><TextField label={t("Additional document type")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentType} onChange={(value) => update("additionalDocumentType", value)} /><TextField label={t("Additional document ID")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentId} onChange={(value) => update("additionalDocumentId", value)} /><TextField label={t("Additional document name")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentName} onChange={(value) => update("additionalDocumentName", value)} /><TextField label={t("LPCO exemption code")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.lpcoExemptionCode} onChange={(value) => update("lpcoExemptionCode", value)} /><TextField label={t("Writing-off issuing authority")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentWriteOff} onChange={(value) => update("additionalDocumentWriteOff", value)} /><TextField label={t("Writing-off date of validity")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentValidityDate} onChange={(value) => update("additionalDocumentValidityDate", value)} inputType="date" /></FieldGrid>
                {item.additionalDocuments.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove additional document")} onRemove={() => update("additionalDocuments", item.additionalDocuments.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1"><TextField label={t("Additional document category")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.category} onChange={(category) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, category } : candidate))} /><TextField label={t("Additional document type")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.type} onChange={(type) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, type } : candidate))} /><TextField label={t("Additional document ID")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.reference} onChange={(reference) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, reference } : candidate))} /><TextField label={t("Additional document name")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.name} onChange={(name) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, name } : candidate))} /><TextField label={t("LPCO exemption code")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.lpcoExemptionCode} onChange={(lpcoExemptionCode) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, lpcoExemptionCode } : candidate))} /><TextField label={t("Writing-off issuing authority")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={entry.writeOff} onChange={(writeOff) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, writeOff } : candidate))} /><TextField label={t("Writing-off date of validity")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={entry.validityDate} onChange={(validityDate) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, validityDate } : candidate))} inputType="date" /></FieldGrid></RepeatableCustomsRow>)}
              </RepeatableCustomsFields>
              <RepeatableCustomsFields title={t("Additional information")} addLabel={t("Add information statement")} onAdd={() => update("additionalInformationStatements", [...item.additionalInformationStatements, { id: repeatableCustomsEntryId("additional-information"), statementCode: "" }])}>
                {item.additionalInformationStatements.map((entry, index) => index === 0 ? <TextField key={entry.id} label={t("Statement code")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={entry.statementCode} onChange={(statementCode) => update("additionalInformationStatements", item.additionalInformationStatements.map((candidate) => candidate.id === entry.id ? { ...candidate, statementCode } : candidate))} /> : <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove information statement")} onRemove={() => update("additionalInformationStatements", item.additionalInformationStatements.filter((candidate) => candidate.id !== entry.id))}><TextField label={t("Statement code")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={entry.statementCode} onChange={(statementCode) => update("additionalInformationStatements", item.additionalInformationStatements.map((candidate) => candidate.id === entry.id ? { ...candidate, statementCode } : candidate))} /></RepeatableCustomsRow>)}
              </RepeatableCustomsFields>
            </> : null}
          </div>
        </ItemDetailGroup>

        <ItemDetailGroup title={t("Weights & values")}>
          <FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
          <TextField label={t("Tariff quantity")} dataElement="6/2" customsBox="41" showDataElements={showDataElements} value={item.tariffQuantity} onChange={(value) => update("tariffQuantity", value)} />
          <TextField label={t("Gross mass")} dataElement="6/5" customsBox="35" required showDataElements={showDataElements} value={item.grossMass} onChange={(value) => update("grossMass", value)} invalid={issues.has("grossMass")} fieldKey="grossMass" highlighted={highlightedField === "grossMass"} suffix="kg" />
          <TextField label={t("Net mass")} dataElement="6/1" customsBox="38" required showDataElements={showDataElements} value={item.netMass} onChange={(value) => update("netMass", value)} invalid={issues.has("netMass")} fieldKey="netMass" highlighted={highlightedField === "netMass"} suffix="kg" />
          <TextField label={t("Item price")} dataElement="4/14" customsBox="42" required showDataElements={showDataElements} value={item.itemPrice} onChange={(value) => update("itemPrice", value)} invalid={issues.has("itemPrice")} fieldKey="itemPrice" highlighted={highlightedField === "itemPrice"} />
          <SelectField label={t("Currency code")} dataElement="4/10" customsBox="22" required showDataElements={showDataElements} value={item.currency} onChange={(value) => update("currency", value)} options={currencyFields} />
          <TextField label={t("Statistical value")} dataElement="8/6" customsBox="46" required showDataElements={showDataElements} value={item.statisticalValue} onChange={(value) => update("statisticalValue", value)} invalid={issues.has("statisticalValue")} fieldKey="statisticalValue" highlighted={highlightedField === "statisticalValue"} />
          {declarationDirection === "import" ? <><TextField label={t("Customs valuation method")} dataElement="4/16" customsBox="43" required showDataElements={showDataElements} value={item.customsValuationMethod} onChange={(value) => update("customsValuationMethod", value.replace(/\D/g, "").slice(0, 1))} invalid={issues.has("customsValuationMethod")} fieldKey="customsValuationMethod" highlighted={highlightedField === "customsValuationMethod"} maxLength={1} /><TextField label={t("Preference code")} dataElement="4/17" customsBox="36" required showDataElements={showDataElements} value={item.preferenceCode} onChange={(value) => update("preferenceCode", value.replace(/\D/g, "").slice(0, 3))} invalid={issues.has("preferenceCode")} fieldKey="preferenceCode" highlighted={highlightedField === "preferenceCode"} maxLength={3} /></> : null}
          </FieldGrid>
          {showOptional && declarationDirection === "import" ? <div className="mt-3 space-y-3">
            <RepeatableCustomsFields title={t("Duty calculations")} addLabel={t("Add duty calculation")} onAdd={() => update("dutyCalculations", [...item.dutyCalculations, { id: repeatableCustomsEntryId("duty"), taxType: "", paymentMethod: "", baseQuantity: "", unitCode: "", declaredTax: "" }])}>
              {item.dutyCalculations.map((entry, index) => {
                const fields = <FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2"><TextField label={t("Tax type")} dataElement="4/3" customsBox="47" showDataElements={showDataElements} value={entry.taxType} onChange={(taxType) => update("dutyCalculations", item.dutyCalculations.map((candidate) => candidate.id === entry.id ? { ...candidate, taxType } : candidate))} /><TextField label={t("Method of payment")} dataElement="4/8" customsBox="47" showDataElements={showDataElements} value={entry.paymentMethod} onChange={(paymentMethod) => update("dutyCalculations", item.dutyCalculations.map((candidate) => candidate.id === entry.id ? { ...candidate, paymentMethod } : candidate))} /><TextField label={t("Tax base quantity")} dataElement="4/4" customsBox="47" showDataElements={showDataElements} value={entry.baseQuantity} onChange={(baseQuantity) => update("dutyCalculations", item.dutyCalculations.map((candidate) => candidate.id === entry.id ? { ...candidate, baseQuantity } : candidate))} /><TextField label={t("Unit code")} dataElement="4/4" customsBox="47" showDataElements={showDataElements} value={entry.unitCode} onChange={(unitCode) => update("dutyCalculations", item.dutyCalculations.map((candidate) => candidate.id === entry.id ? { ...candidate, unitCode } : candidate))} /><TextField label={t("Declared tax")} dataElement="4/6" customsBox="47" showDataElements={showDataElements} value={entry.declaredTax} onChange={(declaredTax) => update("dutyCalculations", item.dutyCalculations.map((candidate) => candidate.id === entry.id ? { ...candidate, declaredTax } : candidate))} /></FieldGrid>
                return index === 0 ? <div key={entry.id}>{fields}</div> : <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove duty calculation")} onRemove={() => update("dutyCalculations", item.dutyCalculations.filter((candidate) => candidate.id !== entry.id))}>{fields}</RepeatableCustomsRow>
              })}
            </RepeatableCustomsFields>
            <RepeatableCustomsFields title={t("Additions and deductions")} addLabel={t("Add addition or deduction")} onAdd={() => update("valuationAdjustments", [...item.valuationAdjustments, { id: repeatableCustomsEntryId("valuation-adjustment"), code: "", currency: item.currency, amount: "" }])}>
              {item.valuationAdjustments.length ? item.valuationAdjustments.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove addition or deduction")} onRemove={() => update("valuationAdjustments", item.valuationAdjustments.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2"><TextField label={t("Code identifying")} dataElement="4/9" customsBox="45" showDataElements={showDataElements} value={entry.code} onChange={(code) => update("valuationAdjustments", item.valuationAdjustments.map((candidate) => candidate.id === entry.id ? { ...candidate, code } : candidate))} /><SelectField label={t("Currency code")} dataElement="4/9" customsBox="45" showDataElements={showDataElements} value={entry.currency} onChange={(currency) => update("valuationAdjustments", item.valuationAdjustments.map((candidate) => candidate.id === entry.id ? { ...candidate, currency } : candidate))} options={currencyFields} /><TextField label={t("Amount")} dataElement="4/9" customsBox="45" showDataElements={showDataElements} value={entry.amount} onChange={(amount) => update("valuationAdjustments", item.valuationAdjustments.map((candidate) => candidate.id === entry.id ? { ...candidate, amount } : candidate))} /></FieldGrid></RepeatableCustomsRow>) : <p className="text-[10.5px] text-[var(--md-subtle)]">{t("No additions or deductions added")}</p>}
            </RepeatableCustomsFields>
          </div> : null}
        </ItemDetailGroup>
      </div>

      {declarationDirection === "export" ? <ItemDetailGroup title={t("Parties & transport")}>
        <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
          <TextField label={t("Consignor")} dataElement="3/7" customsBox="2" showDataElements={showDataElements} value={item.consignor} onChange={(value) => update("consignor", value)} />
          <TextField label={t("Consignee")} dataElement="3/9" customsBox="8" showDataElements={showDataElements} value={item.consignee} onChange={(value) => update("consignee", value)} />
          <SelectField label={t("Destination country")} dataElement="5/8" customsBox="17" showDataElements={showDataElements} value={item.destinationCountry} onChange={(value) => update("destinationCountry", value)} options={optionalCountries} />
          <TextField label={t("Reference number or UCR")} dataElement="2/4" customsBox="44" showDataElements={showDataElements} value={item.ucr} onChange={(value) => update("ucr", value)} />
          <TextField label={t("Container identification number")} dataElement="7/10" customsBox="31" showDataElements={showDataElements} value={item.containerId} onChange={(value) => update("containerId", value)} />
        </FieldGrid>
      </ItemDetailGroup> : null}
    </div>
    {showOptional ? <ItemDetailGroup title={t("Additional item parties")}>
      <div className="grid gap-3 xl:grid-cols-3">
        <PartyReferenceCustomsFields title={t("Exporters")} fieldLabel={t("Exporter ID")} addLabel={t("Add exporter")} removeLabel={t("Remove exporter")} entries={item.itemExporters} entryPrefix="item-exporter" onChange={(entries) => update("itemExporters", entries)} showDataElements={showDataElements} dataElement="3/1" />
        <PartyReferenceCustomsFields title={t("Sellers")} fieldLabel={t("Seller ID")} addLabel={t("Add seller")} removeLabel={t("Remove seller")} entries={item.itemSellers} entryPrefix="item-seller" onChange={(entries) => update("itemSellers", entries)} showDataElements={showDataElements} dataElement="3/24" />
        <PartyReferenceCustomsFields title={t("Buyers")} fieldLabel={t("Buyer ID")} addLabel={t("Add buyer")} removeLabel={t("Remove buyer")} entries={item.itemBuyers} entryPrefix="item-buyer" onChange={(entries) => update("itemBuyers", entries)} showDataElements={showDataElements} dataElement="3/26" />
        <RepeatableCustomsFields title={t("Domestic duty tax parties")} addLabel={t("Add domestic duty tax party")} onAdd={() => update("domesticDutyTaxParties", [...item.domesticDutyTaxParties, { id: repeatableCustomsEntryId("domestic-duty-tax-party"), partyId: "", roleCode: "" }])}>
          {item.domesticDutyTaxParties.map((entry, index) => {
            const fields = <FieldGrid className="grid-cols-1"><TextField label={t("Party ID")} dataElement="3/40" customsBox="44" showDataElements={showDataElements} value={entry.partyId} onChange={(partyId) => update("domesticDutyTaxParties", item.domesticDutyTaxParties.map((candidate) => candidate.id === entry.id ? { ...candidate, partyId } : candidate))} /><TextField label={t("Role code")} dataElement="3/40" customsBox="44" showDataElements={showDataElements} value={entry.roleCode} onChange={(roleCode) => update("domesticDutyTaxParties", item.domesticDutyTaxParties.map((candidate) => candidate.id === entry.id ? { ...candidate, roleCode: roleCode.toUpperCase().slice(0, 3) } : candidate))} maxLength={3} /></FieldGrid>
            return index === 0 ? <div key={entry.id}>{fields}</div> : <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove domestic duty tax party")} onRemove={() => update("domesticDutyTaxParties", item.domesticDutyTaxParties.filter((candidate) => candidate.id !== entry.id))}>{fields}</RepeatableCustomsRow>
          })}
        </RepeatableCustomsFields>
        <PartyReferenceCustomsFields title={t("Mutual recognition parties")} fieldLabel={t("Mutual recognition party ID")} addLabel={t("Add mutual recognition party")} removeLabel={t("Remove mutual recognition party")} entries={item.mutualRecognitionParties} entryPrefix="mutual-recognition-party" onChange={(entries) => update("mutualRecognitionParties", entries)} showDataElements={showDataElements} dataElement="3/39" />
      </div>
    </ItemDetailGroup> : null}
    <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--md-line)] pt-3">
      <Button type="button" variant="outline" size="sm" onClick={onDuplicate} className="group/duplicate transition-[transform,background,color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] active:translate-y-0 active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none"><span className="relative size-3.5" aria-hidden="true"><Copy className="absolute inset-0 size-3.5 opacity-0 transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/duplicate:-translate-x-[2px] group-hover/duplicate:translate-y-[2px] group-hover/duplicate:opacity-30 motion-reduce:transform-none motion-reduce:transition-none" /><Copy className="absolute inset-0 size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/duplicate:translate-x-[1px] group-hover/duplicate:-translate-y-[1px] motion-reduce:transform-none motion-reduce:transition-none" /></span>{t("Duplicate")}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!canRemove} onClick={onRemove}><Trash2 className="size-3.5" />{t("Remove")}</Button>
    </div>
  </div>
}

function ItemDetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className="min-w-0 max-w-full rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
    <h3 className="mb-3 text-[14px] font-medium text-[var(--md-ink)]">{title}</h3>
    {children}
  </section>
}

function RepeatableCustomsFields({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: ReactNode }) {
  return <section aria-label={title} className="space-y-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-[11px] font-medium text-[var(--md-ink)]">{title}</h4>
      <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 px-2.5 text-[11px]" onClick={onAdd}>
        <Plus className="size-3.5" />{addLabel}
      </Button>
    </div>
    {children}
  </section>
}

function RepeatableCustomsRow({ removeLabel, onRemove, children }: { removeLabel: string; onRemove: () => void; children: ReactNode }) {
  return <div className="relative rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] p-2.5 pe-12 shadow-[var(--md-shadow-line)]">
    {children}
    <Button type="button" variant="ghost" size="icon" className="absolute end-1.5 top-1.5 size-9 text-[var(--md-red)] hover:bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] hover:text-[var(--md-red)]" onClick={onRemove} aria-label={removeLabel} title={removeLabel}>
      <Trash2 className="size-4" />
    </Button>
  </div>
}

function PartyReferenceCustomsFields({ title, fieldLabel, addLabel, removeLabel, entries, entryPrefix, onChange, showDataElements, dataElement }: {
  title: string
  fieldLabel: string
  addLabel: string
  removeLabel: string
  entries: CustomsPartyEntry[]
  entryPrefix: string
  onChange: (entries: CustomsPartyEntry[]) => void
  showDataElements: boolean
  dataElement: string
}) {
  return <RepeatableCustomsFields title={title} addLabel={addLabel} onAdd={() => onChange([...entries, { id: repeatableCustomsEntryId(entryPrefix), partyId: "" }])}>
    {entries.map((entry, index) => {
      const field = <TextField label={fieldLabel} dataElement={dataElement} customsBox="44" showDataElements={showDataElements} value={entry.partyId} onChange={(partyId) => onChange(entries.map((candidate) => candidate.id === entry.id ? { ...candidate, partyId } : candidate))} />
      return index === 0 ? <div key={entry.id}>{field}</div> : <RepeatableCustomsRow key={entry.id} removeLabel={removeLabel} onRemove={() => onChange(entries.filter((candidate) => candidate.id !== entry.id))}>{field}</RepeatableCustomsRow>
    })}
  </RepeatableCustomsFields>
}

function ItemTableSelect({ label, value, onChange, options, invalid }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; invalid?: boolean }) {
  const referenceState = useContext(CustomsReferenceDataContext)
  return <Select value={value || undefined} onValueChange={onChange} disabled={referenceState.loading || Boolean(referenceState.error) || !options.length}>
    <SelectTrigger aria-label={label} aria-invalid={invalid || undefined} className={cn("h-7 w-full min-w-0 overflow-hidden rounded-[var(--md-radius-xs)] border-transparent bg-[var(--md-surface-tint)] px-1.5 text-[10px] shadow-none focus:ring-1 focus:ring-[var(--md-accent)] [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate", invalid && "ring-1 ring-[var(--md-red)]")}><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent>
  </Select>
}

function mandatoryItemGaps(item: ExportDeclarationItem, declarationDirection: DeclarationKind = "export"): Array<keyof ExportDeclarationItem> {
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
  if (declarationDirection === "import" && !item.previousDocumentCategory) missing.push("previousDocumentCategory")
  if (declarationDirection === "import" && !item.customsValuationMethod.trim()) missing.push("customsValuationMethod")
  if (declarationDirection === "import" && !/^\d{3}$/.test(item.preferenceCode.trim())) missing.push("preferenceCode")
  return missing
}

function validatedItemField(issues: Set<string>, missing: Array<keyof ExportDeclarationItem>, field: keyof ExportDeclarationItem) {
  return issues.has(field) && missing.includes(field)
}

function ReviewSection({ draft, completion, iCustomsState, iCustomsBusy, iCustomsIssues, update, updateItem, onValidate, onCreateDraft, onSubmit, onRefresh, t }: {
  draft: StandaloneExportDraft
  completion: ReturnType<typeof declarationCompletion>
  iCustomsState: ICustomsWorkspaceState | null
  iCustomsBusy: "loading" | "draft" | "submit" | "refresh" | null
  iCustomsIssues: string[]
  update: <K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) => void
  updateItem: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void
  onValidate: () => void
  onCreateDraft: () => void
  onSubmit: () => void
  onRefresh: () => void
  t: (text: string) => string
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [openFixKey, setOpenFixKey] = useState<string | null>(null)
  const [heldIssue, setHeldIssue] = useState<DeclarationIssue | null>(null)
  const provider = iCustomsState?.declaration.provider
  const hasProviderDraft = Boolean(iCustomsState?.declaration.hasCustomsDraft)
  const providerLifecycleStarted = Boolean(provider && ["submitted", "accepted", "rejected"].includes(provider.status))
  const providerRejected = provider?.status === "rejected"
  const connectionUnavailable = iCustomsState?.connection.configured === false
  const providerIssues = provider?.issues ?? []
  const providerDeclarationUrl = hasProviderDraft && draft.iCustomsCorrelationId
    ? iCustomsDeclarationUrl(draft.direction, draft.iCustomsCorrelationId, iCustomsState?.connection.environment ?? "sandbox")
    : null

  const reviewIssues = heldIssue && !completion.issues.some((issue) => issue.id === heldIssue.id)
    ? [...completion.issues, heldIssue]
    : completion.issues

  function openFix(key: string, issue?: DeclarationIssue) {
    setOpenFixKey(key)
    setHeldIssue(issue ?? null)
    window.setTimeout(() => {
      document.getElementById(`customs-review-fix-${key}`)?.querySelector<HTMLElement>("input, textarea, button")?.focus()
    }, 80)
  }

  function confirmFix() {
    setOpenFixKey(null)
    setHeldIssue(null)
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-4"><span><p className="text-[12px] font-medium text-[var(--md-accent)]">{t("Declaration readiness")}</p><h2 className="mt-1 text-[22px] font-medium text-[var(--md-ink)]">{completion.percent}% {t("complete")}</h2><p className="mt-1 text-[12px] text-[var(--md-text)]">{completion.completeChecks}/{completion.totalChecks} {t("configured checks complete")}</p></span><div className="relative grid size-24 place-items-center rounded-full" style={{ background: `conic-gradient(var(--md-accent) ${completion.percent}%, var(--md-line) 0)` }}><div className="grid size-[78px] place-items-center rounded-full bg-[var(--md-surface)] text-[17px] font-medium">{completion.percent}%</div></div></div>
      {reviewIssues.length ? <div className="mt-5 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{reviewIssues.slice(0, 14).map((issue) => {
        const fixKey = `form-${issue.id}`
        const expanded = openFixKey === fixKey
        return <div key={issue.id} className="py-2">
          <div className="flex min-h-11 items-center gap-3"><CircleAlert className="size-4 shrink-0 text-[var(--md-red)]" /><span className="min-w-0 flex-1 text-[12px] text-[var(--md-text)]">{issue.itemNumber ? `${t("Item")} ${issue.itemNumber}: ` : ""}{translateCustomsMessage(issue.message, t)}</span><Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls={`customs-review-fix-${fixKey}`} className="min-w-[64px] rounded-[var(--md-radius-md)]" onClick={() => openFix(fixKey, issue)}>{t("Fix")}<ChevronDown className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} /></Button></div>
          <AnimatePresence initial={false}>{expanded ? <motion.div id={`customs-review-fix-${fixKey}`} initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduceMotion(shouldReduceMotion, mdMotion.panel)} className="overflow-hidden"><div className="ms-7 mt-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]"><ReviewFixSectionHeader draft={draft} issue={issue} t={t} /><ReviewFixFields draft={draft} issue={issue} update={update} updateItem={updateItem} t={t} /><div className="mt-3 flex justify-end border-t border-[var(--md-line)] pt-3"><Button type="button" size="sm" className="min-w-[88px] rounded-[var(--md-radius-md)]" onClick={confirmFix}>{t("Confirm")}</Button></div></div></motion.div> : null}</AnimatePresence>
        </div>
      })}</div> : <div className="mt-5 flex gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-4"><CheckCircle2 className="size-5 text-[var(--md-green)]" /><span className="text-[13px] text-[var(--md-text)]"><strong className="block text-[var(--md-ink)]">{t("Current form checks passed")}</strong>{t("Ready for secure server integration checks.")}</span></div>}
    </Surface>
    <div className="space-y-4">
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Declaration summary")}</h2><dl className="mt-4 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]"><Summary label={t("Reference")} value={draft.multideckReference} /><Summary label={t("Category")} value={draft.declarationCategory} /><Summary label={t("Type")} value={draft.declarationType} /><Summary label={t("Items")} value={String(draft.items.length)} /><Summary label={t("Destination")} value={draft.destinationCountry || t("Not set")} /></dl></Surface>
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3"><Send className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" /><div><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Customs submission")}</h2><p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Multideck submits this declaration securely and keeps every customs response here.")}</p></div></div>
          <StatusPill tone="teal">{t("Test mode")}</StatusPill>
        </div>

        {iCustomsBusy === "loading" ? <p className="mt-4 text-[12px] text-[var(--md-subtle)]">{t("Checking the customs connection")}</p> : null}
        {connectionUnavailable ? <div role="alert" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_10%,transparent)] p-3 text-[12px] text-[var(--md-text)]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" /><span>{t("The customs test connection is not configured on the server yet.")}</span></div> : null}
        {provider ? <dl className="mt-4 divide-y divide-[var(--md-line)] border-y border-[var(--md-line)]"><Summary label={t("Submission status")} value={t(titleCase(provider.status))} />{provider.mrn ? <Summary label="MRN" value={provider.mrn} /> : null}{provider.updatedAt ? <Summary label={t("Last customs update")} value={new Date(provider.updatedAt).toLocaleString()} /> : null}</dl> : null}
        {providerDeclarationUrl ? <Button asChild variant="outline" className="mt-4 w-full"><a href={providerDeclarationUrl} target="_blank" rel="noopener noreferrer"><span>{t("View in")}</span><img src={iCustomsLogo} alt="iCustoms" className="h-4 w-auto" /><ExternalLink className="size-3.5" /></a></Button> : null}
        {providerIssues.length ? <div role="alert" className="mt-4 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] p-3">
          <div className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-red)]" /><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Customs rejected this declaration")}</p><p className="mt-0.5 text-[11px] leading-4 text-[var(--md-text)]">{t("Correct the fields below, then save a new customs draft before submitting again.")}</p></div></div>
          <div className="mt-3 space-y-2">{providerIssues.slice(0, 20).map((issue, index) => {
            const fixKey = `provider-${issue.code}-${issue.dataElement}-${issue.itemNumber ?? "header"}-${index}`
            const expanded = openFixKey === fixKey
            return <div key={fixKey} className="rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-2.5 shadow-[var(--md-shadow-line)]">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-medium text-[var(--md-red)]">{t(providerIssueFieldLabel(issue))}{issue.itemNumber ? ` · ${t("Item")} ${issue.itemNumber}` : ""}{issue.dataElement ? ` · DE ${issue.dataElement}` : ""}{issue.code ? ` · ${issue.code}` : ""}</p><p className="mt-1 text-[11px] leading-4 text-[var(--md-ink)]">{issue.message}</p><p className="mt-1 text-[10.5px] leading-4 text-[var(--md-text)]">{t(providerIssueGuidance(issue))}</p></div><Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls={`customs-review-fix-${fixKey}`} className="min-w-[64px] rounded-[var(--md-radius-md)]" onClick={() => openFix(fixKey)}>{t("Fix")}<ChevronDown className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} /></Button></div>
              <AnimatePresence initial={false}>{expanded ? <motion.div id={`customs-review-fix-${fixKey}`} initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduceMotion(shouldReduceMotion, mdMotion.panel)} className="overflow-hidden"><div className="mt-3 border-t border-[var(--md-line)] pt-3"><ReviewFixSectionHeader draft={draft} providerIssue={issue} t={t} /><ReviewFixFields draft={draft} providerIssue={issue} update={update} updateItem={updateItem} t={t} /><div className="mt-3 flex justify-end border-t border-[var(--md-line)] pt-3"><Button type="button" size="sm" className="min-w-[88px] rounded-[var(--md-radius-md)]" onClick={confirmFix}>{t("Confirm")}</Button></div></div></motion.div> : null}</AnimatePresence>
            </div>
          })}</div>
        </div> : null}
        {provider?.errorMessage && !providerIssues.length ? <div role="alert" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] p-3 text-[12px] text-[var(--md-text)]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-red)]" /><span><strong className="block text-[var(--md-ink)]">{t("Customs service needs attention")}</strong>{t(provider.errorMessage)}</span></div> : null}
        {iCustomsIssues.length ? <div role="alert" className="mt-4"><p className="text-[12px] font-medium text-[var(--md-red)]">{t("Customs checks still need attention")}</p><ul className="mt-2 space-y-1.5 ps-4 text-[11px] leading-4 text-[var(--md-text)]">{iCustomsIssues.slice(0, 8).map((issue) => <li key={issue} className="list-disc">{translateCustomsMessage(issue, t)}</li>)}</ul></div> : null}

        {!hasProviderDraft ? <Button type="button" className="mt-4 w-full" disabled={Boolean(iCustomsBusy) || connectionUnavailable} onClick={onCreateDraft}><Send className="size-4" />{t(iCustomsBusy === "draft" ? "Creating customs test draft" : "Create customs test draft")}</Button> : providerRejected ? <><Button type="button" className="mt-4 w-full" disabled={Boolean(iCustomsBusy) || connectionUnavailable || completion.issues.length > 0} onClick={onCreateDraft}><RefreshCw className="size-4" />{t(iCustomsBusy === "draft" ? "Creating corrected customs test draft" : "Create corrected customs test draft")}</Button><Button type="button" variant="ghost" className="mt-2 w-full" disabled={Boolean(iCustomsBusy)} onClick={onRefresh}>{t(iCustomsBusy === "refresh" ? "Refreshing customs status" : "Refresh customs status")}</Button></> : providerLifecycleStarted ? <Button type="button" className="mt-4 w-full" disabled={Boolean(iCustomsBusy)} onClick={onRefresh}><RefreshCw className="size-4" />{t(iCustomsBusy === "refresh" ? "Refreshing customs status" : "Refresh customs status")}</Button> : <><Button type="button" className="mt-4 w-full" disabled={Boolean(iCustomsBusy) || connectionUnavailable} onClick={onSubmit}><Send className="size-4" />{t("Submit")}</Button><Button type="button" variant="outline" className="mt-2 w-full" disabled={Boolean(iCustomsBusy) || connectionUnavailable} onClick={onCreateDraft}><RefreshCw className="size-4" />{t(iCustomsBusy === "draft" ? "Updating customs test draft" : "Update customs test draft")}</Button></>}
        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onValidate}>{t("Run form checks")}</Button>
      </Surface>
    </div>
  </div>
}

type ReviewFieldMeta = {
  label: string
  dataElement?: string
  customsBox?: string
  catalog?: CustomsCatalogCode
  textarea?: boolean
  suffix?: string
  maxLength?: number
}

function reviewSectionForField(field: string): Exclude<EditorTab, "items" | "review"> {
  if (["importer", "exporter", "consignee", "carrier", "declarant", "representative", "seller", "buyer", "representationType", "authorisationIdentifier", "authorisationCategory"].includes(field) || /^(importer|exporter|consignee|declarant)(Name|AddressLine|City|Postcode|Country)$/.test(field)) return "parties"
  if (["exportCountry", "destinationCountry", "borderMode", "inlandMode", "containerId", "goodsLocationName", "goodsLocationIdentifier"].includes(field)) return "transport"
  if (["exitOffice", "presentationOffice", "previousDocumentCategory", "previousDocumentType", "previousDocumentReference", "transactionNature", "tradeTerms", "customsValuationMethod"].includes(field)) return "documents"
  return "declaration"
}

function reviewFixSectionLabel(draft: StandaloneExportDraft, issue: DeclarationIssue | undefined, providerIssue: ICustomsProviderIssue | undefined, t: (text: string) => string) {
  const itemNumber = issue?.itemNumber ?? providerIssue?.itemNumber
  if (issue?.scope === "item" || itemNumber) return itemNumber ? `${t("Items")} · ${t("Item")} ${itemNumber}` : t("Items")
  const field = issue?.field ?? (providerIssue ? providerIssueTarget(providerIssue) : "")
  const section = reviewSectionForField(field)
  if (section === "parties") return t("Parties")
  if (section === "transport") return t("Transport")
  if (section === "documents") return t(draft.direction === "import" ? "Import terms" : "Documents & offices")
  return t("Declaration")
}

function ReviewFixSectionHeader({ draft, issue, providerIssue, t }: {
  draft: StandaloneExportDraft
  issue?: DeclarationIssue
  providerIssue?: ICustomsProviderIssue
  t: (text: string) => string
}) {
  return <h3 className="mb-3 text-[12px] font-medium text-[var(--md-ink)]">{reviewFixSectionLabel(draft, issue, providerIssue, t)}</h3>
}

const reviewFieldMetaByKey: Record<string, ReviewFieldMeta> = {
  declarationCategory: { label: "Declaration category", dataElement: "1/1", customsBox: "1", catalog: "declaration_category" },
  declarationType: { label: "Type of declaration", dataElement: "1/2", customsBox: "1", catalog: "declaration_type" },
  traderReference: { label: "Trader reference number", dataElement: "2/4", customsBox: "44", maxLength: 19 },
  internalReference: { label: "Internal reference" },
  totalAmount: { label: "Total amount", dataElement: "4/11", customsBox: "22" },
  currency: { label: "Currency code", dataElement: "4/10", customsBox: "22", catalog: "currency" },
  totalPackages: { label: "Total packages", dataElement: "6/18", customsBox: "6" },
  totalGrossMass: { label: "Total gross mass", dataElement: "6/5", customsBox: "35", suffix: "kg" },
  totalNetMass: { label: "Total net mass", dataElement: "6/1", customsBox: "38", suffix: "kg" },
  importer: { label: "Importer", dataElement: "3/16", customsBox: "8" },
  exporter: { label: "Exporter", dataElement: "3/1", customsBox: "2" },
  consignee: { label: "Consignee", dataElement: "3/9", customsBox: "8" },
  declarant: { label: "Declarant", dataElement: "3/17", customsBox: "14" },
  representationType: { label: "Type of representation", dataElement: "3/21", customsBox: "14", catalog: "representation_type" },
  authorisationIdentifier: { label: "Authorisation identifier" },
  authorisationCategory: { label: "Authorisation category", maxLength: 3 },
  exportCountry: { label: "Export country", dataElement: "5/14", customsBox: "15", catalog: "country" },
  destinationCountry: { label: "Country of destination", dataElement: "5/8", customsBox: "17", catalog: "country" },
  borderMode: { label: "Mode at border", dataElement: "7/4", customsBox: "25", catalog: "transport_mode" },
  transactionNature: { label: "Nature of transaction", dataElement: "8/5", customsBox: "24", catalog: "transaction_nature" },
  tradeTerms: { label: "Trade terms", dataElement: "4/1", customsBox: "20", maxLength: 3 },
  goodsLocationName: { label: "Name of place", dataElement: "5/23", customsBox: "30" },
  goodsLocationIdentifier: { label: "Goods location identifier", dataElement: "5/23", customsBox: "30" },
  isContainerised: { label: "Transported in container", dataElement: "7/2", customsBox: "19", catalog: "container_indicator" },
  containerId: { label: "Container ID", dataElement: "7/10", customsBox: "31" },
  exitOffice: { label: "Customs office of exit", dataElement: "5/12", customsBox: "29" },
  previousDocumentCategory: { label: "Previous document category", dataElement: "2/1", customsBox: "40", catalog: "previous_document_category" },
  previousDocumentType: { label: "Previous document type", dataElement: "2/1", customsBox: "40", catalog: "previous_document_type" },
  previousDocumentReference: { label: "Previous document reference", dataElement: "2/1", customsBox: "40", maxLength: 35 },
  commodityCode: { label: "Commodity code", dataElement: "6/14", customsBox: "33", maxLength: 10 },
  description: { label: "Description of goods", dataElement: "6/8", customsBox: "31", textarea: true },
  packageKind: { label: "Package kind", dataElement: "6/9", customsBox: "31", catalog: "package_kind" },
  packageMarks: { label: "Package marks", dataElement: "6/11", customsBox: "31" },
  packageCount: { label: "Package count", dataElement: "6/10", customsBox: "31" },
  nonPreferentialOrigin: { label: "Non-preferential origin", dataElement: "5/15", customsBox: "34", catalog: "country" },
  procedureCode: { label: "Procedure code", dataElement: "1/10", customsBox: "37", catalog: "procedure_code" },
  additionalProcedureCode: { label: "Additional procedure code", dataElement: "1/11", customsBox: "37", catalog: "additional_procedure_code" },
  grossMass: { label: "Gross mass", dataElement: "6/5", customsBox: "35", suffix: "kg" },
  netMass: { label: "Net mass", dataElement: "6/1", customsBox: "38", suffix: "kg" },
  itemPrice: { label: "Item price", dataElement: "4/14", customsBox: "42" },
  statisticalValue: { label: "Statistical value", dataElement: "8/6", customsBox: "46" },
  customsValuationMethod: { label: "Customs valuation method", dataElement: "4/16", customsBox: "43", maxLength: 1 },
  preferenceCode: { label: "Preference code", dataElement: "4/17", customsBox: "36", maxLength: 3 },
  additionalDocumentCategory: { label: "Additional document category", dataElement: "2/3", customsBox: "44" },
  additionalDocumentType: { label: "Additional document type", dataElement: "2/3", customsBox: "44" },
  additionalDocumentId: { label: "Additional document ID", dataElement: "2/3", customsBox: "44" },
}

function reviewFieldMeta(field: string): ReviewFieldMeta {
  const contact = field.match(/^(importer|exporter|consignee|declarant)(Name|AddressLine|City|Postcode|Country)$/)
  if (!contact) return reviewFieldMetaByKey[field] ?? { label: titleCase(field) }
  const party = titleCase(contact[1])
  const suffixes: Record<string, string> = { Name: "legal name", AddressLine: "street address", City: "town or city", Postcode: "postcode", Country: "country" }
  const partyElements: Record<string, readonly [string, string]> = {
    importer: ["3/15", "8"],
    exporter: ["3/2", "2"],
    consignee: ["3/10", "8"],
    declarant: ["3/18", "14"],
  }
  const [dataElement, customsBox] = partyElements[contact[1]]
  return { label: `${party} ${suffixes[contact[2]]}`, dataElement, customsBox, catalog: contact[2] === "Country" ? "country" : undefined }
}

function fieldsForReviewIssue(draft: StandaloneExportDraft, issue?: DeclarationIssue, providerIssue?: ICustomsProviderIssue) {
  if (providerIssue) {
    if (providerIssue.itemNumber && providerIssue.dataElement === "1/10") return ["procedureCode", "additionalProcedureCode"]
    if (providerIssue.itemNumber && providerIssue.dataElement === "2/3") return ["additionalDocumentCategory", "additionalDocumentType", "additionalDocumentId"]
    return [providerIssueTarget(providerIssue)]
  }
  if (!issue) return []
  const contact = issue.id.match(/^general-(importer|exporter|consignee|declarant)-contact$/)
  if (contact) {
    return [`${contact[1]}Name`, `${contact[1]}AddressLine`, `${contact[1]}City`, `${contact[1]}Postcode`, `${contact[1]}Country`]
  }
  if (issue.id === "general-authorisation") return ["authorisationIdentifier", "authorisationCategory"]
  if (issue.id === "general-goods-location") return ["goodsLocationName", "goodsLocationIdentifier"]
  return [issue.field]
}

function ReviewFixFields({ draft, issue, providerIssue, update, updateItem, t }: {
  draft: StandaloneExportDraft
  issue?: DeclarationIssue
  providerIssue?: ICustomsProviderIssue
  update: <K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) => void
  updateItem: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void
  t: (text: string) => string
}) {
  const itemId = issue?.itemId ?? (providerIssue?.itemNumber ? draft.items[providerIssue.itemNumber - 1]?.id : undefined)
  const fields = fieldsForReviewIssue(draft, issue, providerIssue)
  return <CompactCustomsFormContext.Provider value><FieldGrid className="grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">{fields.map((field) => <ReviewFixField key={field} draft={draft} itemId={itemId} field={field} update={update} updateItem={updateItem} t={t} />)}</FieldGrid></CompactCustomsFormContext.Provider>
}

function ReviewFixField({ draft, itemId, field, update, updateItem, t }: {
  draft: StandaloneExportDraft
  itemId?: string
  field: string
  update: <K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) => void
  updateItem: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void
  t: (text: string) => string
}) {
  const declarationCategories = useReferenceOptions("declaration_category", t, "Select category")
  const declarationTypes = useReferenceOptions("declaration_type", t, "Select type")
  const currencies = useReferenceOptions("currency", t, "Select currency")
  const countries = useReferenceOptions("country", t, "Select country")
  const transportModes = useReferenceOptions("transport_mode", t, "Select transport mode")
  const transactionNatures = useReferenceOptions("transaction_nature", t, "Select nature")
  const representationTypes = useReferenceOptions("representation_type", t, "Not specified")
  const containerIndicators = useReferenceOptions("container_indicator", t, "Select option")
  const previousDocumentCategories = useReferenceOptions("previous_document_category", t, "Select category")
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t, "Select document type")
  const packageKinds = useReferenceOptions("package_kind", t, "Select package")
  const procedureCodes = useReferenceOptions("procedure_code", t, "Select procedure")
  const additionalProcedureCodes = useReferenceOptions("additional_procedure_code", t, "Select procedure")
  const optionsByCatalog: Partial<Record<CustomsCatalogCode, ReadonlyArray<readonly [string, string]>>> = {
    declaration_category: draft.direction === "import" ? declarationCategories.filter(([code]) => !code || code === "H1") : declarationCategories,
    declaration_type: declarationTypes,
    currency: currencies,
    country: countries,
    transport_mode: transportModes,
    transaction_nature: transactionNatures,
    representation_type: representationTypes,
    container_indicator: containerIndicators,
    previous_document_category: previousDocumentCategories,
    previous_document_type: previousDocumentTypes,
    package_kind: packageKinds,
    procedure_code: procedureCodes,
    additional_procedure_code: additionalProcedureCodes,
  }
  const item = itemId ? draft.items.find((candidate) => candidate.id === itemId) : undefined
  const rawValue = item ? item[field as keyof ExportDeclarationItem] : draft[field as keyof StandaloneExportDraft]
  if (Array.isArray(rawValue)) {
    return <p className="rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-3 text-[11px] leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("Open this goods line in Items to complete the highlighted repeatable rows.")}</p>
  }
  const value = String(rawValue ?? "")
  const meta = reviewFieldMeta(field)
  const setValue = (next: string) => {
    let normalized = next
    if (field === "traderReference") normalized = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 19)
    if (field === "tradeTerms") normalized = next.toUpperCase().slice(0, 3)
    if (field === "authorisationCategory") normalized = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)
    if (field === "previousDocumentReference") normalized = next.replace(/[^A-Za-z0-9]/g, "").slice(0, 35)
    if (field === "commodityCode") normalized = next.replace(/\D/g, "").slice(0, 10)
    if (field === "customsValuationMethod") normalized = next.replace(/\D/g, "").slice(0, 1)
    if (field === "preferenceCode") normalized = next.replace(/\D/g, "").slice(0, 3)
    if (item && itemId) updateItem(itemId, field as keyof ExportDeclarationItem, normalized as never)
    else update(field as keyof StandaloneExportDraft, normalized as never)
  }
  const options = meta.catalog ? optionsByCatalog[meta.catalog] : undefined
  if (options) return <SelectField label={t(meta.label)} dataElement={meta.dataElement} customsBox={meta.customsBox} required showDataElements value={value} onChange={setValue} options={options} invalid fieldKey={`review-${itemId ?? "header"}-${field}`} />
  if (meta.textarea) return <TextAreaField label={t(meta.label)} dataElement={meta.dataElement} customsBox={meta.customsBox} required showDataElements value={value} onChange={setValue} invalid fieldKey={`review-${itemId ?? "header"}-${field}`} />
  return <TextField label={t(meta.label)} dataElement={meta.dataElement} customsBox={meta.customsBox} required showDataElements value={value} onChange={setValue} invalid fieldKey={`review-${itemId ?? "header"}-${field}`} suffix={meta.suffix} maxLength={meta.maxLength} />
}

function providerIssueTarget(issue: ICustomsProviderIssue) {
  if (issue.itemNumber) {
    if (issue.dataElement === "4/16") return "customsValuationMethod"
    if (issue.dataElement === "2/3" && issue.elementName === "CategoryCode") return "additionalDocumentCategory"
    if (issue.dataElement === "2/3" && issue.elementName === "DocumentID") return "additionalDocumentId"
    if (issue.dataElement === "2/3") return "additionalDocumentType"
    if (issue.dataElement === "1/10") return "procedureCode"
    if (issue.elementName === "CommodityCode") return "commodityCode"
    if (issue.elementName === "TypeCode" && issue.dataElement === "6/9") return "packageKind"
    return "description"
  }
  const fields: Record<string, string> = {
    "3/1": "exporter",
    "3/2": "exporterAddressLine",
    "3/9": "consignee",
    "3/10": "consigneeAddressLine",
    "3/15": "importerAddressLine",
    "3/16": "importer",
    "3/17": "declarant",
    "3/18": "declarantAddressLine",
    "5/8": "destinationCountry",
    "5/14": "exportCountry",
    "5/23": "goodsLocationName",
    "7/4": "borderMode",
    "7/10": "containerId",
  }
  return fields[issue.dataElement ?? ""] ?? "traderReference"
}

function providerIssueFieldLabel(issue: ICustomsProviderIssue) {
  if (issue.dataElement === "3/16") return "Importer identifier"
  if (issue.dataElement === "4/16") return "Customs valuation method"
  if (issue.dataElement === "2/3" && issue.elementName === "CategoryCode") return "Additional document category"
  if (issue.dataElement === "2/3" && issue.elementName === "TypeCode") return "Additional document type"
  if (issue.dataElement === "2/3" && issue.elementName === "DocumentID") return "Additional document ID"
  if (issue.dataElement === "1/10") return "Procedure code"
  return issue.elementName || "Customs field"
}

function customsStatusTone(status: string): "green" | "amber" | "red" | "blue" | "neutral" | "teal" {
  const normalizedStatus = status.trim().toLocaleLowerCase()
  if (["submitted", "accepted", "released", "cleared"].includes(normalizedStatus)) return "green"
  if (["rejected", "error"].includes(normalizedStatus)) return "red"
  if (normalizedStatus === "draft") return "amber"
  if (normalizedStatus === "acknowledged") return "blue"
  return "neutral"
}

function providerIssueGuidance(issue: ICustomsProviderIssue) {
  if (issue.dataElement === "3/16") return "Check that the importer EORI or VAT number is recognised for this declaration."
  if (issue.dataElement === "4/16") return "Review the customs valuation method on this goods item and any values it requires."
  if (issue.dataElement === "2/3") return "Review the additional document code, or remove the optional document if it does not apply."
  if (issue.dataElement === "1/10") return "Review the procedure and additional procedure combination on this goods item."
  return "Review the highlighted customs field and the related declaration details before trying again."
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className="flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />{children}</label>
}

function SectionFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const compact = useContext(CompactCustomsFormContext)
  return <section className="min-w-0">
    <header className={cn("flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6", compact ? "mb-2" : "mb-3")}>
      <h2 className={cn("shrink-0 font-medium text-[var(--md-ink)]", compact ? "text-[13px]" : "text-[15px]")}>{title}</h2>
      <p className={cn("text-[var(--md-subtle)]", compact ? "text-[10.5px] leading-4" : "text-[12px] leading-5 sm:max-w-[65%] sm:text-end")}>{description}</p>
    </header>
    <div className={cn("min-w-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "rounded-[var(--md-radius-md)] p-3" : "rounded-[var(--md-radius-lg)] p-5")}>
      {children}
    </div>
  </section>
}

function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  const compact = useContext(CompactCustomsFormContext)
  return <div className={cn("grid", compact ? "gap-1.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "gap-x-3 gap-y-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", className)}>{children}</div>
}

function FieldShell({ label, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, className, children }: { label: string; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; className?: string; children: ReactNode }) {
  const showCustomsBoxNumbers = useContext(CustomsBoxVisibilityContext)
  const compact = useContext(CompactCustomsFormContext)
  const showAnnotations = (showDataElements && dataElement) || (showCustomsBoxNumbers && customsBox)
  return <label data-field-invalid={invalid || undefined} className={cn("min-w-0", compact && "grid grid-cols-[minmax(76px,0.42fr)_minmax(0,0.58fr)] items-center gap-1.5", className)}><span className={cn("flex items-center gap-1.5 font-medium text-[var(--md-text)]", compact ? "min-h-0 text-[10.5px] leading-[1.15]" : "mb-1.5 min-h-5 text-[11px]")}><span className={cn(compact ? "line-clamp-2" : "truncate")}>{label}</span>{required ? <span className="text-[var(--md-red)]">*</span> : null}{showAnnotations ? <span className={cn("flex shrink-0 items-center gap-1", !compact && "ms-auto")}>{showDataElements && dataElement ? <span className={cn("rounded-[var(--md-radius-sm)] bg-[color-mix(in_srgb,var(--md-blue)_8%,transparent)] font-medium tabular-nums text-[var(--md-blue)]", compact ? "px-1 py-0.5 text-[8.5px]" : "px-1.5 py-0.5 text-[10px]")} dir="ltr">DE {dataElement}</span> : null}{showCustomsBoxNumbers && customsBox ? <span className={cn("rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a10)] font-medium tabular-nums text-[var(--md-accent)]", compact ? "px-1 py-0.5 text-[8.5px]" : "px-1.5 py-0.5 text-[10px]")} dir="ltr">{`Box ${customsBox}`}</span> : null}</span> : null}</span><span data-customs-field={fieldKey} className={cn("block rounded-[var(--md-radius-md)] transition-[box-shadow] duration-300", highlighted && "ring-2 ring-[var(--md-accent)] shadow-[0_0_20px_var(--md-accent)]")}>{children}</span></label>
}

function TextField({ label, value, onChange, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, placeholder, suffix, maxLength, inputType = "text", inputClassName }: { label: string; value: string; onChange: (value: string) => void; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; placeholder?: string; suffix?: string; maxLength?: number; inputType?: "text" | "date"; inputClassName?: string }) {
  const compact = useContext(CompactCustomsFormContext)
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}><div className="relative"><Input type={inputType} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} aria-invalid={invalid || undefined} dir="ltr" className={cn("border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]", compact ? "h-8 px-2 text-[11px]" : "h-9 text-[13px]", suffix && "pe-10", inputClassName)} />{suffix ? <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--md-subtle)]">{suffix}</span> : null}</div></FieldShell>
}

function TextAreaField({ label, value, onChange, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, className }: { label: string; value: string; onChange: (value: string) => void; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; className?: string }) {
  const compact = useContext(CompactCustomsFormContext)
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey} className={className}><Textarea value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid || undefined} className={cn("border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]", compact ? "min-h-8 px-2 py-1.5 text-[11px]" : "min-h-9 text-[13px]")} /></FieldShell>
}

function SelectField({ label, value, onChange, options, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string }) {
  const referenceState = useContext(CustomsReferenceDataContext)
  const compact = useContext(CompactCustomsFormContext)
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}><Select value={value || undefined} onValueChange={onChange} disabled={referenceState.loading || Boolean(referenceState.error) || options.length <= 1}><SelectTrigger aria-invalid={invalid || undefined} className={cn("w-full border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]", compact ? "h-8 px-2 text-[11px]" : "h-9 text-[13px]")}><SelectValue placeholder={options[0]?.[1]} /></SelectTrigger><SelectContent>{options.filter(([optionValue]) => optionValue).map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent></Select></FieldShell>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 py-2.5"><dt className="text-[11px] text-[var(--md-subtle)]">{label}</dt><dd className="m-0 text-end text-[12px] font-medium text-[var(--md-ink)]">{value}</dd></div>
}
