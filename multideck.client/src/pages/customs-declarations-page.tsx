import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { InlineNotice } from '@/components/multideck/inline-notice'
import "./customs-declaration-editor.css"
import { customsToday, fetchHmrcMonthlyRates, selectHmrcExchangeRate, validCustomsConversionDate } from "../../../supabase/functions/_shared/customs-hmrc-exchange-rates.mts"
import { DutyCalculationContext, DutyCalculationPanel } from "./customs-duty-calculation-panel"
import { useCustomsLiveCalculation } from "./use-customs-live-calculation"
import { calculationPreflight } from "../../../supabase/functions/_shared/customs-calculation-draft.mts"
import { isQuotaPreference } from "../../../supabase/functions/_shared/customs-quota-claim.mts"
import { createCustomsCalculationRunner } from "@/lib/customs-calculation-runner"
import { calculateCustomsDeclaration } from "@/lib/icustoms-api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { applyCustomsInvoiceImport, refreshCustomsInvoiceEstimate } from "@/lib/customs-invoices"
import { customsInvoiceErrors, customsInvoiceProjectionErrors, resolveCustomsInvoiceDeclaration, emptyCustomsInvoiceHeader, type CustomsInvoiceHeader } from "../../../supabase/functions/_shared/customs-invoices.mts"
import { defaultPaginationPageSize } from "@/lib/pagination"
import { customsFieldHelp } from "@/lib/customs-field-help"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { customsAuthorisationCategories } from "@/lib/customs-authorisation-categories"
import { loadIataDirectory } from "@/lib/iata-directory"
import { customsGuaranteeTypes, emptyCustomsGuarantee, guaranteesForDraft, guaranteeErrors, type CustomsGuarantee } from "../../../supabase/functions/_shared/customs-guarantees.mts"
import { customsOffices } from "@/lib/customs-offices"
import { customsWarehouseTypes, customsFiscalRoles, importFiscalParties, type ImportFiscalParty } from "../../../supabase/functions/_shared/customs-import-details.mts"
import { customsTradeTerms, customsAdjustmentCodes, importAdjustmentsForDraft, isPercentageAdjustment, type CustomsImportAdjustment } from "../../../supabase/functions/_shared/customs-import-terms.mts"
import { applyTenantDeclarantDefault, declarantCompanyPatch, formattedDeclarantAddress } from "@/lib/customs-declarant"
import { loadTenantDeclarantDefault } from "@/lib/customs-drafts-api"
import { ducrFormatError, ducrToAutoPopulate, generateDucr } from "@/lib/customs-ducr"
import { getCustomsReferencePreferences, type CustomsReferencePreferencesState } from "@/lib/customs-reference-preferences"
import { AutoPopulatedInput, AutoPopulatedTextarea, useAutoPopulationMorph } from "@/components/multideck/auto-populated-field"
import { applyImporterDefaults, applyImporterTaxPartyDefault, formattedImporterAddress, importerCompanyPatch } from "@/lib/customs-importer"
import { exporterCompanyPatch, formattedExporterAddress } from "@/lib/customs-exporter"
import { customsArrivalTransportTypes } from "@/lib/customs-arrival-transport"
import { additionalPartyCompanyPatch, clearAdditionalParty, formattedAdditionalPartyAddress, type AdditionalCustomsParty } from "@/lib/customs-additional-parties"
import { collectExportPages } from "@/lib/table-export"
import { Fragment, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react"
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, Copy, ExternalLink, Eye, FileCheck2, FileText, LoaderCircle, LockKeyhole, Plus, RefreshCw, Save, ScanText, Search, Send, Trash2, UserRound } from "@/components/icons/hugeicons"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { CompactCombobox, type CompactComboboxOption } from "@/components/multideck/quote-details/quote-detail-fields"
import { CustomsReadinessReview } from "@/components/multideck/customs-readiness-review"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { LifecycleNotes } from "@/components/multideck/lifecycle-notes"
import { PdfDocumentViewerDialog } from "@/components/multideck/pdf-document-viewer-dialog"
import { RegisterFacetSelect, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { SegmentedControl, TabsRail } from "@/components/multideck/workflow-components"
import { CustomsInvoiceImportWorkspace } from "@/pages/customs-invoice-import-workspace"
import { useLanguage } from "@/i18n/language-provider"
import type { AuthUserSummary } from "@/lib/auth-user"
import type { RegisterSort } from "@/lib/application-data-api"
import type { FilterQuery } from "@/lib/advanced-filters"
import { cn } from "@/lib/utils"
import {
  createExportDeclarationItem,
  createStandaloneDeclarationDraft,
  declarationCompletion,
  type DeclarationIssue,
  type ExportDeclarationItem,
  type StandaloneExportDraft,
} from "@/lib/customs-declaration"
import { createEmptyCustomsReferenceData, useCustomsReferenceData, type CustomsCatalogCode, type CustomsReferenceData } from "@/lib/customs-reference-data"
import { assignCustomsDeclaration, getCustomsDeclarationAssignment, invalidateCustomsDeclarationPages, listCustomsDeclarationAssignees, listCustomsDeclarationDraftsPage, loadStandaloneDeclarationDraft, reopenRejectedCustomsDeclaration, saveJobRelatedDeclarationDraft, saveStandaloneDeclarationDraft, type CustomsAssignee, type CustomsDraftSummary } from "@/lib/customs-drafts-api"
import { readCustomsInvoiceImportRecovery, hasCustomsInvoiceImportRecovery, moveCustomsInvoiceImportRecovery } from "@/lib/customs-invoice-import-recovery"
import { fetchCustomsDeclarationPdf, getCustomsDeclarationDocument, type CustomsDeclarationDocument } from "@/lib/customs-declaration-document-api"
import { listDeclarationSourceAttachments, getDeclarationSourceAttachmentAccess, type DeclarationSourceAttachment } from "@/lib/booking-workflow-api"
import { customsStatusPollDelay, isTerminalCustomsStatus, shouldPollCustomsStatus, shouldPollCustomsSubmission } from "@/lib/customs-status-lifecycle"
import { getCustomer, listAccountsPage, type ApiCustomer, type ApiCustomerDetail } from "@/lib/customer-api"
import { deleteICustomsProviderDraft, getICustomsCommodityDetails, getICustomsDeclarationState, ICustomsApiError, refreshICustomsDeclaration, saveICustomsProviderDraft, searchICustomsCommodities, startICustomsProviderDraft, submitICustomsDeclaration, validateICustomsDeclaration, type ICustomsCommodityCertificate, type ICustomsCommodityDetail, type ICustomsCommoditySuggestion, type ICustomsProviderIssue, type ICustomsWorkspaceState } from "@/lib/icustoms-api"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { createProfilePhotoSignedUrls } from "@/lib/profile-photo"
import { loadUnlocodeDirectory, resolveInvoiceAgreedPlace } from "@/lib/unlocode-directory"
import iCustomsLogo from "@/assets/integrations/icustoms.svg"

type DeclarationKind = "export" | "import"
type EditorTab = "declaration" | "parties" | "transport" | "documents" | "invoices" | "items" | "notes" | "review"
type EditorViewMode = "tabs" | "form"
type FormTab = "general" | "invoices" | "items" | "notes" | "review"
type CustomsStatusLifecycle = { phase: "idle" | "waiting" | "checking" | "complete" | "timed-out" | "error"; message?: string }
type DeclarationFieldVisibility = { dataElements: boolean; customsBoxNumbers: boolean; optionalFields: boolean }

const defaultDeclarationFieldVisibility: DeclarationFieldVisibility = {
  dataElements: true,
  customsBoxNumbers: false,
  optionalFields: false,
}
const declarationFieldVisibilityStorageKey = "multideck.customs.declaration-field-visibility"

function customsExportCategory(path: readonly string[]) {
  const field = path[0] ?? ""
  if (field === "importAdjustments") return "Valuation"
  if (field === "items") return "Goods items"
  if (/^(exporter|importer|seller|buyer|consignee|carrier|declarant|representative|representation|authorisation|primaryDeferment|secondaryDeferment)/.test(field)) return "Parties"
  if (/^(exportCountry|destinationCountry|border|inland|departure|arrival|goodsLocation|freightPayment|isContainerised|gvms|container|seal|routing)/.test(field)) return "Transport"
  if (/^(previousDocument|headerAdditionalInformation)/.test(field)) return "Documents"
  if (/^(total|currency|transactionNature|exchangeRate|tradeTerms|tradeTermsLocation|customsValuation|primaryDeferment|secondaryDeferment|freightCharge|vatValueAdjustment|insuranceCost|containerPackingCost)/.test(field)) return "Valuation"
  if (/^(exitOffice|supervisingOffice|presentationOffice|warehouse|guarantee)/.test(field)) return "Offices and guarantees"
  return "Declaration"
}

let repeatableCustomsEntrySequence = 0

function repeatableCustomsEntryId(prefix: string) {
  repeatableCustomsEntrySequence += 1
  return `${prefix}-${Date.now()}-${repeatableCustomsEntrySequence}`
}

const CustomsFieldErrorsContext = createContext<ReadonlyMap<string, string>>(new Map())
const CustomsBoxVisibilityContext = createContext(false)
const CustomsReferenceDataContext = createContext<{ data: CustomsReferenceData; loading: boolean; error: string | null }>({ data: createEmptyCustomsReferenceData(), loading: true, error: null })
const CompactCustomsFormContext = createContext(false)
const customsSingleLineControlClass = "h-8 rounded-[var(--md-radius-lg)] px-2 text-[11px]"
const customsMultilineControlClass = "rounded-[var(--md-radius-lg)]"
const customsTooltipContentClass = "max-w-[min(22rem,calc(100vw-24px))] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-3 text-sm font-normal text-[var(--md-text)] shadow-[var(--md-shadow-popover)] duration-150 ease-out motion-reduce:!animate-none [&_svg]:bg-[var(--md-surface)] [&_svg]:fill-[var(--md-surface)]"
const CustomsDirectionContext = createContext<DeclarationKind>("export")
type CustomsOrganisationDirectoryState = { companies: ApiCustomer[]; total: number; ready: boolean; error: boolean }
const CustomsOrganisationDirectoryContext = createContext<CustomsOrganisationDirectoryState>({ companies: [], total: 0, ready: false, error: false })

function useCustomsOrganisationDirectory(): CustomsOrganisationDirectoryState {
  const [directory, setDirectory] = useState<CustomsOrganisationDirectoryState>({ companies: [], total: 0, ready: false, error: false })

  useEffect(() => {
    let active = true
    listAccountsPage({
      organisationType: "company",
      sort: { id: "account", direction: "asc" },
      limit: 100,
      offset: 0,
    }).then((page) => {
      if (active) setDirectory({ companies: page.rows, total: page.total, ready: true, error: false })
    }).catch((reason) => {
      console.error("Customs organisation directory could not be prefetched.", reason)
      if (active) setDirectory((current) => ({ ...current, ready: true, error: true }))
    })
    return () => { active = false }
  }, [])

  return directory
}

function readDeclarationFieldVisibility() {
  if (typeof window === "undefined") return defaultDeclarationFieldVisibility
  try {
    const stored = JSON.parse(window.localStorage.getItem(declarationFieldVisibilityStorageKey) ?? "null") as Partial<DeclarationFieldVisibility> | null
    if (!stored) return defaultDeclarationFieldVisibility
    return {
      dataElements: typeof stored.dataElements === "boolean" ? stored.dataElements : defaultDeclarationFieldVisibility.dataElements,
      customsBoxNumbers: typeof stored.customsBoxNumbers === "boolean" ? stored.customsBoxNumbers : defaultDeclarationFieldVisibility.customsBoxNumbers,
      optionalFields: typeof stored.optionalFields === "boolean" ? stored.optionalFields : defaultDeclarationFieldVisibility.optionalFields,
    }
  } catch {
    return defaultDeclarationFieldVisibility
  }
}

function saveDeclarationFieldVisibility(value: DeclarationFieldVisibility) {
  try {
    window.localStorage.setItem(declarationFieldVisibilityStorageKey, JSON.stringify(value))
  } catch {
    // Visibility preferences remain active for this session when browser storage is unavailable.
  }
}

export function CustomsDeclarationsPage({
  route,
  navigate,
  currentUser,
}: {
  route: string
  navigate: (path: string) => void
  currentUser?: AuthUserSummary | null
}) {
  const { t } = useLanguage()
  const jobRelated = route.startsWith("/customs/job-related")
  const kind: DeclarationKind = route.includes("/import") ? "import" : "export"
  const creating = route.endsWith("/new")
  const editMatch = route.match(/^\/customs\/(standalone|job-related)\/(export|import)\/([0-9a-f-]{36})$/i)

  if ((!jobRelated && creating) || editMatch) {
    return <StandaloneDeclarationEditor navigate={navigate} kind={kind} declarationId={editMatch?.[3]} scope={jobRelated ? "job-related" : "standalone"} />
  }

  const base = jobRelated ? "/customs/job-related" : "/customs/standalone"
  return <CustomsDeclarationsRegister jobRelated={jobRelated} kind={kind} base={base} navigate={navigate} currentUser={currentUser} t={t} />
}

function CustomsDeclarationsRegister({ jobRelated, kind, base, navigate, currentUser, t }: {
  jobRelated: boolean
  kind: DeclarationKind
  base: string
  navigate: (path: string) => void
  currentUser?: AuthUserSummary | null
  t: (text: string) => string
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [drafts, setDrafts] = useState<CustomsDraftSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [destinationFilter, setDestinationFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const [customsRegisterPageSize, setCustomsRegisterPageSize] = useState(defaultPaginationPageSize)
  const [total, setTotal] = useState(0)
  const [availableTotal, setAvailableTotal] = useState(0)
  const [facets, setFacets] = useState<{ statuses: string[]; destinations: string[] }>({ statuses: [], destinations: [] })
  const [sort, setSort] = useState<RegisterSort | null>({ id: "lastSaved", direction: "desc" })
  const [reloadToken, setReloadToken] = useState(0)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [contextDeleteDraft, setContextDeleteDraft] = useState<CustomsDraftSummary | null>(null)
  const assigneePhotoUrls = useCustomsAssigneePhotoUrls(drafts.map((draft) => draft.assignee).filter((assignee): assignee is CustomsAssignee => Boolean(assignee)))

  const deleteDraft = useCallback(async (draft: CustomsDraftSummary) => {
    if (draft.status.toLocaleLowerCase() !== "draft" || deletingDraftId) return
    setDeletingDraftId(draft.id)
    try {
      await deleteICustomsProviderDraft(draft.id)
      invalidateCustomsDeclarationPages()
      setDrafts((current) => current.filter((candidate) => candidate.id !== draft.id))
      setTotal((current) => Math.max(current - 1, 0))
      setAvailableTotal((current) => Math.max(current - 1, 0))
      setReloadToken((current) => current + 1)
      setConfirmingDeleteId(null)
      setContextDeleteDraft(null)
      toast.success(t("Draft deleted"), { description: draft.reference })
    } catch (reason) {
      console.error("The Customs draft could not be deleted.", reason)
      toast.error(t("Draft could not be deleted"), {
        description: t(reason instanceof Error ? reason.message : "Try deleting the draft again."),
      })
    } finally {
      setDeletingDraftId(null)
    }
  }, [deletingDraftId, t])

  const requestDelete = useCallback((draft: CustomsDraftSummary) => {
    if (draft.status.toLocaleLowerCase() !== "draft" || deletingDraftId) return
    if (confirmingDeleteId !== draft.id) {
      setConfirmingDeleteId(draft.id)
      return
    }
    void deleteDraft(draft)
  }, [confirmingDeleteId, deleteDraft, deletingDraftId])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => setOffset(0), [debouncedSearch, destinationFilter, jobRelated, kind, statusFilter])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    listCustomsDeclarationDraftsPage(kind, jobRelated ? "job-related" : "standalone", {
      search: debouncedSearch,
      status: statusFilter,
      destination: destinationFilter,
      sort,
      limit: customsRegisterPageSize,
      offset,
    }, controller.signal)
      .then((page) => {
        setDrafts(page.rows)
        setTotal(page.total)
        setAvailableTotal(page.availableTotal)
        setFacets(page.facets)
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return
        console.error("Customs drafts could not be loaded.", reason)
        setLoadError(reason instanceof Error ? reason.message : "Customs drafts could not be loaded.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [customsRegisterPageSize, debouncedSearch, destinationFilter, jobRelated, kind, offset, reloadToken, sort, statusFilter])

  const columns = useMemo<DataTableColumn<CustomsDraftSummary>[]>(() => [
    {
      id: "assignedTo",
      label: "Assigned to",
      headerContent: <span className="sr-only">{t("Assigned to")}</span>,
      kind: "identity",
      align: "center",
      width: 64,
      minWidth: 64,
      maxWidth: 64,
      canPin: false,
      cellTitle: (draft) => draft.assignee?.displayName
        ?? (!draft.assignmentSupported && draft.submittedBy === currentUser?.id
          ? currentUser.name ?? currentUser.email ?? t("Not available")
          : t("Unassigned")),
      headerClassName: "px-3 [&>span]:justify-center",
      cellClassName: "px-3 py-2",
      cell: (draft) => <DeclarationAssigneeAvatar draft={draft} assignee={draft.assignee} photoUrl={draft.assignee?.profilePhoto ? assigneePhotoUrls.get(draft.assignee.profilePhoto.path) ?? null : null} currentUser={currentUser} t={t} />,
    },
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
      cell: (draft) => {
        const outcome = declarationRegisterOutcome(draft.status)
        return (
          <StatusPill
            tone={customsStatusTone(draft.status)}
            indicator={!outcome}
            className={cn(
              outcome === "cleared" && "bg-[var(--md-surface)] text-[var(--md-status-green-ink)] shadow-[var(--md-shadow-line)]",
              outcome === "rejected" && "bg-[var(--md-surface)] text-[var(--md-status-red-ink)] shadow-[var(--md-shadow-line)]",
            )}
          >
            {t(titleCase(draft.status))}
          </StatusPill>
        )
      },
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
    {
      id: "actions",
      label: "Actions",
      headerContent: <span className="sr-only">{t("Actions")}</span>,
      kind: "actions",
      align: "center",
      width: 82,
      minWidth: 82,
      maxWidth: 82,
      canHide: false,
      canPin: false,
      headerClassName: "px-2 [&>span]:justify-center",
      cellClassName: "px-2 py-2",
      cell: (draft) => <DeclarationDeleteAction
        draft={draft}
        confirming={confirmingDeleteId === draft.id}
        deleting={deletingDraftId === draft.id}
        disabled={draft.status.toLocaleLowerCase() !== "draft"}
        shouldReduceMotion={shouldReduceMotion}
        onCancel={() => setConfirmingDeleteId(null)}
        onDelete={() => void requestDelete(draft)}
        t={t}
      />,
    },
  ], [assigneePhotoUrls, confirmingDeleteId, currentUser, deletingDraftId, jobRelated, requestDelete, shouldReduceMotion, t])

  const statuses = facets.statuses
  const destinations = facets.destinations

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
        rows={loadError ? [] : drafts}
        getRowKey={(draft) => draft.id}
        storageKey={`customs-${jobRelated ? "job-related" : "standalone"}-${kind}-register-v3`}
        rowClassName={(draft) => cn(
          "transition-colors",
          declarationRegisterOutcome(draft.status) === "cleared"
            ? "bg-[var(--md-status-green-bg)] hover:bg-[color-mix(in_srgb,var(--md-status-green-bg)_82%,var(--md-green))]"
            : declarationRegisterOutcome(draft.status) === "rejected"
              ? "bg-[var(--md-status-red-bg)] hover:bg-[color-mix(in_srgb,var(--md-status-red-bg)_82%,var(--md-red))]"
              : "hover:bg-[var(--md-hover)]",
        )}
        onRowClick={(draft) => navigate(`/customs/${jobRelated ? "job-related" : "standalone"}/${kind}/${draft.id}`)}
        rowAriaLabel={(draft) => draft.reference}
        serverSorting={{ value: sort, onChange: (next) => { setSort(next ?? { id: "lastSaved", direction: "desc" }); setOffset(0) } }}
        pagination={{ offset, limit: customsRegisterPageSize, total, loading, onOffsetChange: setOffset, onLimitChange: setCustomsRegisterPageSize, error: Boolean(loadError) }}
        rowContextActions={(draft) => [{
          id: "delete-draft",
          label: "Delete draft",
          hint: draft.status.toLocaleLowerCase() === "draft" ? "Confirmation required" : "Drafts only",
          icon: Trash2,
          tone: "destructive",
          disabled: draft.status.toLocaleLowerCase() !== "draft" || deletingDraftId === draft.id,
          onSelect: setContextDeleteDraft,
        }]}
        exportConfig={{
          fileName: `customs-${kind}-declarations`,
          register: {
            dateLabel: "Declaration created date", dateValue: (draft) => draft.createdAt,
            busy: search.trim() !== debouncedSearch,
            loadAllRows: (signal) => collectExportPages((page) => listCustomsDeclarationDraftsPage(kind, jobRelated ? "job-related" : "standalone", {
              search: debouncedSearch, status: statusFilter, destination: destinationFilter, sort, ...page,
            }, signal), (draft) => draft.id, signal),
          },
          recordCategory: "Declaration",
          categoryForPath: customsExportCategory,
          loadRecords: (selectedDrafts) => Promise.all(selectedDrafts.map(async (draft) => ({
            ...draft,
            ...await loadStandaloneDeclarationDraft(draft.id, kind, jobRelated ? "job-related" : "standalone"),
          }))),
        }}
        bulkDelete={{
          canDelete: (draft) => draft.status.toLocaleLowerCase() === "draft",
          disabledReason: "Only draft declarations can be deleted",
          title: "Delete selected declarations?",
          description: (selectedDrafts) => t("This permanently deletes {count} selected draft declarations from Multideck and iCustoms. This action cannot be undone.").replace("{count}", String(selectedDrafts.length)),
          confirmLabel: "Delete declarations",
          onConfirm: async (selectedDrafts) => {
            const deletedDrafts: CustomsDraftSummary[] = []
            let firstFailure: unknown = null
            for (const selectedDraft of selectedDrafts) {
              try {
                await deleteICustomsProviderDraft(selectedDraft.id)
                deletedDrafts.push(selectedDraft)
              } catch (reason) {
                firstFailure ??= reason
              }
            }
            if (deletedDrafts.length) {
              invalidateCustomsDeclarationPages()
              setDrafts((current) => current.filter((candidate) => !deletedDrafts.some((deletedDraft) => deletedDraft.id === candidate.id)))
              setTotal((current) => Math.max(current - deletedDrafts.length, 0))
              setAvailableTotal((current) => Math.max(current - deletedDrafts.length, 0))
              setReloadToken((current) => current + 1)
            }
            if (firstFailure) throw new Error(t("{deleted} of {selected} declarations were deleted. Try the remaining rows again.").replace("{deleted}", String(deletedDrafts.length)).replace("{selected}", String(selectedDrafts.length)), { cause: firstFailure })
            toast.success(t("Selected declarations deleted"), { description: `${selectedDrafts.length} ${t(selectedDrafts.length === 1 ? "draft removed" : "drafts removed")}` })
          },
        }}
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
          <div className="grid min-h-[180px] place-items-center"><DotGridLoader label="Loading saved declarations" /></div>
        ) : loadError ? (
          <div role="alert" className="mx-auto max-w-[520px] py-8 text-center">
            <CircleAlert className="mx-auto size-6 text-[var(--md-red)]" />
            <h3 className="mt-3 text-[15px] font-medium text-[var(--md-ink)]">{t("Saved declarations unavailable")}</h3>
            <p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Try loading the declaration register again.")}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => setReloadToken((current) => current + 1)}>{t("Try again")}</Button>
          </div>
        ) : availableTotal > 0 && total === 0 ? (
          <div className="mx-auto max-w-[440px] py-8 text-center">
            <EmptyStateIllustration variant="search" className="mb-3" />
            <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{t("No declarations match these filters")}</h3>
            <p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Change or clear a filter to see more declarations.")}</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[440px] place-items-center py-8 text-center">
            <EmptyStateIllustration variant="documents" />
            <h3 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">
              {t(!jobRelated ? (kind === "export" ? "Ready for the first standalone export" : "Ready for the first standalone import") : "No bookings have been sent to this Customs team yet")}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
              {t(!jobRelated
                ? "Create a draft using the section-based CDS workspace."
                : "Create the declaration from its linked Multideck job when this workflow is enabled.")}
            </p>
          </div>
        )}
      />
      <Dialog open={Boolean(contextDeleteDraft)} onOpenChange={(open) => { if (!open && !deletingDraftId) setContextDeleteDraft(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("Delete this draft?")}</DialogTitle>
            <DialogDescription>{t("This deletes the draft from iCustoms and removes its Multideck recovery record. Submitted declarations are kept for audit.")}</DialogDescription>
          </DialogHeader>
          {contextDeleteDraft ? <p className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2 text-[12px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{contextDeleteDraft.reference}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={Boolean(deletingDraftId)} onClick={() => setContextDeleteDraft(null)}>{t("Cancel")}</Button>
            <Button type="button" disabled={!contextDeleteDraft || Boolean(deletingDraftId)} className="bg-[var(--md-red)] text-white hover:opacity-90" onClick={() => { if (contextDeleteDraft) void deleteDraft(contextDeleteDraft) }}>{deletingDraftId ? t("Deleting") : t("Delete draft")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DeclarationDeleteAction({ draft, confirming, deleting, disabled, shouldReduceMotion, onCancel, onDelete, t }: {
  draft: CustomsDraftSummary
  confirming: boolean
  deleting: boolean
  disabled: boolean
  shouldReduceMotion: boolean
  onCancel: () => void
  onDelete: () => void
  t: (text: string) => string
}) {
  return (
    <span className="relative block h-7 w-[62px]" onClick={(event) => event.stopPropagation()}>
      <motion.button
        type="button"
        initial={false}
        animate={{ width: confirming ? 62 : 28 }}
        className={cn(
          "group/delete absolute inset-y-0 right-0 grid h-7 origin-right place-items-center overflow-hidden rounded-full text-[var(--md-subtle)] outline-none",
          confirming
            ? "bg-[rgba(209,78,78,0.12)] px-2 text-[11px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.18)]"
            : "hover:text-[var(--md-red)]",
        )}
        aria-label={t(disabled ? "Only draft declarations can be deleted" : confirming ? "Confirm delete" : "Delete draft") + `: ${draft.reference}`}
        title={t(disabled ? "Only draft declarations can be deleted" : confirming ? "Confirm delete" : "Delete draft")}
        disabled={disabled || deleting}
        onClick={(event) => { event.stopPropagation(); onDelete() }}
        onBlur={() => { if (confirming && !deleting) onCancel() }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key !== "Escape" || !confirming || deleting) return
          event.preventDefault()
          onCancel()
        }}
        transition={reduceMotion(shouldReduceMotion, confirming ? mdMotion.fast : mdMotion.micro)}
      >
        <span
          className={cn(
            "absolute grid size-6 place-items-center rounded-full transition-[background-color,box-shadow,color,opacity,transform] duration-150 group-hover/delete:bg-[rgba(209,78,78,0.10)] group-hover/delete:shadow-[var(--md-shadow-line)] group-focus-visible/delete:ring-[3px] group-focus-visible/delete:ring-[var(--md-accent-a20)] group-active/delete:scale-[0.94] motion-reduce:transition-none",
            confirming ? "scale-75 opacity-0" : "scale-100 opacity-100",
          )}
          aria-hidden="true"
        >
          <Trash2 className="size-3.5" strokeWidth={1.3} />
        </span>
        <span
          className={cn(
            "whitespace-nowrap transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            confirming ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
          aria-hidden={!confirming}
        >
          {deleting ? t("Deleting") : t("Confirm")}
        </span>
      </motion.button>
    </span>
  )
}

function customsAssigneeInitials(assignee: CustomsAssignee) {
  const initials = `${assignee.firstName?.[0] ?? ""}${assignee.lastName?.[0] ?? ""}`.trim()
  return (initials || assignee.displayName.split(/\s+/).map((part) => part[0]).join("") || assignee.email[0] || "?").slice(0, 2).toLocaleUpperCase()
}

function useCustomsAssigneePhotoUrls(assignees: CustomsAssignee[]) {
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  const photoKey = assignees.map((assignee) => assignee.profilePhoto?.path ?? "").filter(Boolean).sort().join("|")

  useEffect(() => {
    const photos = assignees.flatMap((assignee) => assignee.profilePhoto ? [assignee.profilePhoto] : [])
    if (!photos.length) {
      setPhotoUrls(new Map())
      return
    }
    let active = true
    void createProfilePhotoSignedUrls(photos)
      .then((urls) => { if (active) setPhotoUrls(urls) })
      .catch((reason) => console.warn("Customs assignee profile photos could not be loaded.", reason))
    return () => { active = false }
    // photoKey captures the stable storage paths without retriggering for array identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])

  return photoUrls
}

function DeclarationAssigneeAvatar({ draft, assignee, photoUrl, currentUser, t }: {
  draft: CustomsDraftSummary
  assignee: CustomsAssignee | null
  photoUrl: string | null
  currentUser?: AuthUserSummary | null
  t: (text: string) => string
}) {
  const legacyCurrentUser = !draft.assignmentSupported && draft.submittedBy === currentUser?.id ? currentUser : null
  const name = assignee?.displayName ?? legacyCurrentUser?.name ?? legacyCurrentUser?.email ?? t("Unassigned")
  const resolvedPhotoUrl = photoUrl ?? legacyCurrentUser?.profilePhotoUrl ?? null

  return (
    <span
      className="inline-grid place-items-center"
      aria-label={`${t("Assigned to")}: ${name}`}
      title={name}
    >
      <Avatar size="sm" className="size-7 rounded-full">
        {resolvedPhotoUrl ? <AvatarImage src={resolvedPhotoUrl} alt="" className="rounded-full object-cover" /> : null}
        <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[10px] font-medium text-[var(--md-ink)]" data-i18n-skip>
          {assignee ? customsAssigneeInitials(assignee) : legacyCurrentUser?.initials ?? <UserRound className="size-3.5 text-[var(--md-subtle)]" aria-hidden="true" />}
        </AvatarFallback>
      </Avatar>
    </span>
  )
}

function DeclarationAssigneePicker({ declarationId, t }: { declarationId?: string; t: (text: string) => string }) {
  const [open, setOpen] = useState(false)
  const [assigned, setAssigned] = useState<CustomsAssignee | null>(null)
  const [assignmentLoading, setAssignmentLoading] = useState(Boolean(declarationId))
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [users, setUsers] = useState<CustomsAssignee[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [usersReloadToken, setUsersReloadToken] = useState(0)
  const [savingUserId, setSavingUserId] = useState<string | null | undefined>(undefined)
  const photoUrls = useCustomsAssigneePhotoUrls(assigned ? [assigned, ...users] : users)

  const reloadAssignment = useCallback(() => {
    if (!declarationId) {
      setAssigned(null)
      setAssignmentLoading(false)
      setAssignmentError(null)
      return
    }
    setAssignmentLoading(true)
    setAssignmentError(null)
    void getCustomsDeclarationAssignment(declarationId)
      .then(setAssigned)
      .catch((reason) => setAssignmentError(reason instanceof Error ? reason.message : "The declaration assignee could not be loaded."))
      .finally(() => setAssignmentLoading(false))
  }, [declarationId])

  useEffect(reloadAssignment, [reloadAssignment])
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => setOffset(0), [debouncedSearch])

  useEffect(() => {
    if (!open || !declarationId) return
    const controller = new AbortController()
    setUsersLoading(true)
    setUsersError(null)
    listCustomsDeclarationAssignees(debouncedSearch, 50, offset, controller.signal)
      .then((page) => {
        setUsers((current) => offset === 0
          ? page.users
          : [...current, ...page.users.filter((user) => !current.some((candidate) => candidate.id === user.id))])
        setTotal(page.total)
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.name === "AbortError") return
        setUsersError(reason instanceof Error ? reason.message : "Workspace users could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setUsersLoading(false) })
    return () => controller.abort()
  }, [debouncedSearch, declarationId, offset, open, usersReloadToken])

  async function chooseAssignee(nextAssignee: CustomsAssignee | null) {
    if (!declarationId || savingUserId !== undefined || (nextAssignee && !nextAssignee.canWorkCustoms)) return
    setSavingUserId(nextAssignee?.id ?? null)
    try {
      await assignCustomsDeclaration(declarationId, nextAssignee?.id ?? null)
      setAssigned(nextAssignee)
      setOpen(false)
      toast.success(t(nextAssignee ? "Declaration assigned" : "Declaration unassigned"), {
        description: nextAssignee?.displayName,
      })
    } catch (reason) {
      toast.error(t("Assignee could not be changed"), {
        description: t(reason instanceof Error ? reason.message : "Try choosing the person again."),
      })
    } finally {
      setSavingUserId(undefined)
    }
  }

  const assignedPhotoUrl = assigned?.profilePhoto ? photoUrls.get(assigned.profilePhoto.path) ?? null : null
  const triggerLabel = assignmentLoading ? t("Loading assignee") : assignmentError ? t("Assignee unavailable") : assigned?.displayName ?? t("Unassigned")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 max-w-[220px] gap-2 px-2.5 max-sm:h-11"
          disabled={!declarationId || assignmentLoading}
          aria-label={`${t("Assigned to")}: ${triggerLabel}`}
          title={assignmentError ? t(assignmentError) : t("Choose who is working on this declaration")}
        >
          <Avatar className="size-5 shrink-0 rounded-full">
            {assignedPhotoUrl ? <AvatarImage src={assignedPhotoUrl} alt="" className="rounded-full object-cover" /> : null}
            <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[8px] font-medium text-[var(--md-ink)]" data-i18n-skip>
              {assigned ? customsAssigneeInitials(assigned) : <UserRound className="size-3 text-[var(--md-subtle)]" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate text-[11.5px]">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-[var(--md-subtle)]" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={7} className="w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-[var(--md-radius-xl)] p-0">
        <div className="p-3 shadow-[var(--md-stroke-bottom)]">
          <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Assigned to")}</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--md-subtle)]">{t("Choose the workspace user responsible for this declaration.")}</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" aria-hidden="true" />
            <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search workspace users…")} aria-label={t("Search workspace users")} className="h-9 rounded-[var(--md-radius-lg)] ps-9 text-[12px]" />
          </div>
        </div>
        <div role="listbox" aria-label={t("Workspace users")} className="max-h-[320px] overflow-y-auto p-1.5">
          <button
            type="button"
            role="option"
            aria-selected={!assigned}
            disabled={savingUserId !== undefined}
            onClick={() => void chooseAssignee(null)}
            className="flex min-h-11 w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] disabled:opacity-50"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-subtle)]"><UserRound className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 text-[12px] font-medium text-[var(--md-ink)]">{t("Unassigned")}</span>
            {savingUserId === null ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : !assigned ? <CheckCircle2 className="size-4 text-[var(--md-accent)]" aria-hidden="true" /> : null}
          </button>
          {users.map((user) => {
            const photoUrl = user.profilePhoto ? photoUrls.get(user.profilePhoto.path) ?? null : null
            const isSelected = assigned?.id === user.id
            return <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-disabled={!user.canWorkCustoms}
              disabled={savingUserId !== undefined || !user.canWorkCustoms}
              title={!user.canWorkCustoms ? t("This user does not have Customs access") : user.displayName}
              onClick={() => void chooseAssignee(user)}
              className="flex min-h-12 w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] disabled:opacity-50"
            >
              <Avatar className="size-8 shrink-0 rounded-full">
                {photoUrl ? <AvatarImage src={photoUrl} alt="" className="rounded-full object-cover" /> : null}
                <AvatarFallback className="rounded-full bg-[var(--md-accent-a11)] text-[10px] font-medium text-[var(--md-accent)]" data-i18n-skip>{customsAssigneeInitials(user)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{user.displayName}</span>
                <span className="block truncate text-[10.5px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{user.canWorkCustoms ? user.email : `${user.email} · ${t("No Customs access")}`}</span>
              </span>
              {savingUserId === user.id ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : isSelected ? <CheckCircle2 className="size-4 text-[var(--md-accent)]" aria-hidden="true" /> : null}
            </button>
          })}
          {usersLoading && offset === 0 ? <div className="flex min-h-24 items-center justify-center gap-2 text-[12px] text-[var(--md-subtle)]" role="status"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t("Loading workspace users")}</div> : null}
          {usersError ? <div className="grid min-h-24 place-items-center gap-2 px-3 py-4 text-center" role="alert"><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Workspace users could not be loaded.")}</p><Button type="button" variant="outline" size="sm" onClick={() => setUsersReloadToken((value) => value + 1)}>{t("Try again")}</Button></div> : null}
          {!usersLoading && !usersError && users.length === 0 ? <p className="px-3 py-8 text-center text-[11.5px] text-[var(--md-subtle)]">{t("No workspace users match this search.")}</p> : null}
          {!usersError && users.length < total ? <Button type="button" variant="ghost" className="mt-1 h-9 w-full" disabled={usersLoading} onClick={() => setOffset(users.length)}>{usersLoading ? t("Loading more users") : t("Show more users")}</Button> : null}
        </div>
      </PopoverContent>
    </Popover>
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

function declarationReadiness(
  completion: ReturnType<typeof declarationCompletion>,
  iCustomsIssues: string[],
  iCustomsState: ICustomsWorkspaceState | null,
) {
  const normalise = (message: string) => message.trim().toLocaleLowerCase("en-GB")
  const localIssueMessages = new Set(completion.issues.map((issue) => normalise(issue.message)))
  const externalIssueMessages = new Set(
    iCustomsIssues.map(normalise).filter((message) => message && !localIssueMessages.has(message)),
  )
  const provider = iCustomsState?.declaration.provider

  if (provider && ["rejected", "error"].includes(provider.status)) {
    const failedSubmissionMessages = provider.issues.length
      ? provider.issues.map((issue) => issue.message)
      : [provider.errorMessage ?? provider.status]
    failedSubmissionMessages.forEach((message) => {
      const key = normalise(message)
      if (key && !localIssueMessages.has(key)) externalIssueMessages.add(key)
    })
  }

  const totalChecks = completion.totalChecks + externalIssueMessages.size
  const completeChecks = completion.completeChecks
  return {
    completeChecks,
    totalChecks,
    percent: Math.round((completeChecks / totalChecks) * 100),
  }
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

function shouldCheckLocalWebhookState(state: ICustomsWorkspaceState | null) {
  const status = state?.declaration.provider?.status ?? state?.declaration.status
  return shouldPollCustomsSubmission(status, state?.declaration.provider?.submittedAt) ||
    (["accepted", "released", "cleared"].includes(status ?? "") &&
      (!state?.declaration.document.available || !state?.declaration.provider?.mrn?.trim()))
}

function formatDraftAmount(amount: number | null, currency: string | null) {
  if (amount === null) return "–"
  if (!currency) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

function StandaloneDeclarationEditor({ navigate, kind, declarationId, scope = "standalone" }: { navigate: (path: string) => void; kind: DeclarationKind; declarationId?: string; scope?: "standalone" | "job-related" }) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const referenceData = useCustomsReferenceData(kind)
  const organisationDirectory = useCustomsOrganisationDirectory()
  const [draft, setDraft] = useState<StandaloneExportDraft>(() => createStandaloneDeclarationDraft(kind))
  const [tab, setTab] = useState<EditorTab>(() => new URLSearchParams(window.location.search).get("tab") === "review" ? "review" : "declaration")
  const [viewMode, setViewMode] = useState<EditorViewMode>("tabs")
  const [formTab, setFormTab] = useState<FormTab>("general")
  const focusSectionOnChange = useRef(false)
  const [activeItemId, setActiveItemId] = useState(draft.items[0].id)
  const [fieldVisibility, setFieldVisibility] = useState<DeclarationFieldVisibility>(readDeclarationFieldVisibility)
  const showDataElements = fieldVisibility.dataElements
  const showCustomsBoxNumbers = fieldVisibility.customsBoxNumbers
  const showOptional = fieldVisibility.optionalFields
  const [validated, setValidated] = useState(false)
  const invoiceImportRecoveryKey = declarationId ?? "new"
  const [invoiceImportTarget, setInvoiceImportTarget] = useState<"header" | "items">(() => readCustomsInvoiceImportRecovery(invoiceImportRecoveryKey)?.importTarget ?? "items")
  const [invoiceImportOpen, setInvoiceImportOpen] = useState(() => hasCustomsInvoiceImportRecovery(invoiceImportRecoveryKey))
  const [loadingDraft, setLoadingDraft] = useState(Boolean(declarationId))
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [draftLoadAttempt, setDraftLoadAttempt] = useState(0)
  const [savingDraft, setSavingDraft] = useState(false)
  const [creatingInitialDraft, setCreatingInitialDraft] = useState(!declarationId)
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [providerStateError, setProviderStateError] = useState(false)
  const [providerStateAttempt, setProviderStateAttempt] = useState(0)
  const [providerSaveFailed, setProviderSaveFailed] = useState(false)
  const [retryingSave, setRetryingSave] = useState(false)
  const [iCustomsState, setICustomsState] = useState<ICustomsWorkspaceState | null>(null)
  const [iCustomsBusy, setICustomsBusy] = useState<"loading" | "draft" | "validate" | "submit" | "refresh" | null>(declarationId ? "loading" : null)
  const [iCustomsIssues, setICustomsIssues] = useState<string[]>([])
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [sourceAttachments, setSourceAttachments] = useState<DeclarationSourceAttachment[]>([])
  const [sourceAttachmentsLoading, setSourceAttachmentsLoading] = useState(false)
  const [sourceAttachmentsError, setSourceAttachmentsError] = useState<string | null>(null)
  const [sourceAttachmentsAttempt, setSourceAttachmentsAttempt] = useState(0)
  const [sourcePreview, setSourcePreview] = useState<{ id: string; name: string; url?: string; mimeType?: string; error?: string } | null>(null)
  const [sourceDownloading, setSourceDownloading] = useState(false)
  const sourceRequest = useRef(0)
  useEffect(() => {
    let cancelled = false
    sourceRequest.current += 1
    setSourcePreview(null)
    setSourceAttachments([])
    setSourceAttachmentsError(null)
    if (!declarationId) return
    setSourceAttachmentsLoading(true)
    listDeclarationSourceAttachments(declarationId).then(result => {
      if (!cancelled) setSourceAttachments(result.documents)
    }).catch(cause => {
      if (!cancelled) setSourceAttachmentsError(cause instanceof Error ? cause.message : "The source documents could not be loaded.")
    }).finally(() => { if (!cancelled) setSourceAttachmentsLoading(false) })
    return () => { cancelled = true; sourceRequest.current += 1 }
  }, [declarationId, sourceAttachmentsAttempt, invoiceImportOpen])

  async function openSourceAttachment(id: string, name: string) {
    if (!declarationId) return
    const request = ++sourceRequest.current
    setSourcePreview({ id, name })
    try {
      const access = await getDeclarationSourceAttachmentAccess(declarationId, id)
      if (request === sourceRequest.current) setSourcePreview({ id, name: access.fileName, url: access.signedUrl, mimeType: access.mimeType })
    } catch (cause) {
      if (request === sourceRequest.current) setSourcePreview({ id, name, error: cause instanceof Error ? cause.message : t("The attachment could not be opened. Please try again.") })
    }
  }

  async function downloadSourceAttachment(id: string) {
    if (!declarationId || sourceDownloading) return
    setSourceDownloading(true)
    try {
      const access = await getDeclarationSourceAttachmentAccess(declarationId, id)
      const response = await fetch(access.signedUrl, { credentials: "omit", signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(t("The attachment could not be downloaded. Please try again."))
      const blob = await response.blob()
      if (!blob.size || (access.mimeType === "application/pdf" && await blob.slice(0, 5).text() !== "%PDF-")) throw new Error(t("The stored attachment could not be read."))
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url; link.download = access.fileName
      document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("The attachment could not be downloaded. Please try again."))
    } finally { setSourceDownloading(false) }
  }
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfDocument, setPdfDocument] = useState<CustomsDeclarationDocument | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null)
  const [statusLifecycle, setStatusLifecycle] = useState<CustomsStatusLifecycle>({ phase: "idle" })
  const iCustomsBusyRef = useRef(iCustomsBusy)
  const statusRefreshInFlightRef = useRef<Promise<ICustomsWorkspaceState | null> | null>(null)
  const statusPollTimerRef = useRef<number | null>(null)
  const lastFocusRefreshAtRef = useRef(0)
  const pdfLoadInFlightRef = useRef<Promise<{ document: CustomsDeclarationDocument; blob: Blob }> | null>(null)
  const pdfAutoLoadAttemptedForRef = useRef<string | null>(null)
  const activeDeclarationIdRef = useRef(declarationId)
  const initialDraftCreationRef = useRef(false)
  const initialDraftServerRef = useRef<{ id: string; reference: string } | null>(null)
  const lastSavedDraftSnapshotRef = useRef<string | null>(null)
  const draftRef = useRef(draft)
  const autosaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const autosaveSequenceRef = useRef(0)
  const editorMountedRef = useRef(true)
  const completion = useMemo(() => declarationCompletion(draft), [draft])
  const activeItem = draft.items.find((item) => item.id === activeItemId) ?? draft.items[0]
  const fieldErrors = useMemo(() => new Map(validated ? completion.issues.filter(issue => issue.scope === "general").map(issue => [issue.field, t(issue.message)]) : []), [completion.issues, validated, t])
  const issueFields = useMemo(() => new Set(validated ? completion.issues.map((issue) => issue.field) : []), [completion.issues, validated])
  const activeItemIssueFields = useMemo(() => new Set(validated ? completion.issues.filter((issue) => issue.itemId === activeItemId).map((issue) => issue.field) : []), [activeItemId, completion.issues, validated])
  const registerPath = `/customs/${scope}/${kind}`
  const saveDeclarationDraft = useCallback((nextDraft: StandaloneExportDraft, nextDeclarationId?: string) => {
    if (scope === "job-related") {
      if (!nextDeclarationId) return Promise.reject(new Error("A job-related Customs declaration must be opened from its booking."))
      return saveJobRelatedDeclarationDraft(nextDeclarationId, nextDraft)
    }
    return saveStandaloneDeclarationDraft(nextDraft, nextDeclarationId)
  }, [scope])

  useEffect(() => {
    iCustomsBusyRef.current = iCustomsBusy
  }, [iCustomsBusy])

  useEffect(() => {
    const companyId = draft.importerOrganisationId
    if (loadingDraft || kind !== "import" || !companyId) return
    let cancelled = false
    getCustomer(companyId).then(company => {
      if (cancelled) return
      const patch = importerCompanyPatch(company)
      setDraft(current => current.importerOrganisationId !== companyId ? current : applyImporterTaxPartyDefault({
        ...current,
        importerVatNumber: patch.importerVatNumber,
        importerUseCustomerTaxPartyDefault: patch.importerUseCustomerTaxPartyDefault,
      }))
    }).catch(() => {
      if (!cancelled) toast.error(t("Customer VAT defaults could not be loaded. Reopen the declaration to retry."))
    })
    return () => { cancelled = true }
  }, [draft.importerOrganisationId, loadingDraft, kind, t])

  useEffect(() => {
    saveDeclarationFieldVisibility(fieldVisibility)
  }, [fieldVisibility])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    activeDeclarationIdRef.current = declarationId
  }, [declarationId])

  useEffect(() => {
    editorMountedRef.current = true
    return () => { editorMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (kind !== "import" || viewMode !== "tabs") return
    const selected = document.querySelector<HTMLElement>(`[data-customs-tab="${tab}"]`)
    const rail = selected?.closest("nav")
    if (!selected || !rail) return
    const keepSelectionVisible = () => rail.scrollTo({ left: selected.offsetLeft - (rail.clientWidth - selected.offsetWidth) / 2, behavior: shouldReduceMotion ? "instant" : "smooth" })
    keepSelectionVisible()
    if (focusSectionOnChange.current) {
      document.getElementById(`customs-panel-${tab}`)?.focus({ preventScroll: true })
      focusSectionOnChange.current = false
    }
    const resizeObserver = new ResizeObserver(keepSelectionVisible)
    resizeObserver.observe(rail)
    return () => resizeObserver.disconnect()
  }, [kind, tab, viewMode, shouldReduceMotion])

  function moveToSection(nextTab: EditorTab) {
    focusSectionOnChange.current = true
    selectTab(nextTab)
    document.querySelector("[data-customs-section-nav]")?.scrollIntoView({ block: "start", behavior: shouldReduceMotion ? "instant" : "smooth" })
  }

  function selectTab(nextTab: EditorTab) {
    if (nextTab === tab) return
    setTab(nextTab)
  }

  useEffect(() => {
    setInvoiceImportTarget(readCustomsInvoiceImportRecovery(invoiceImportRecoveryKey)?.importTarget ?? "items")
    setInvoiceImportOpen(hasCustomsInvoiceImportRecovery(invoiceImportRecoveryKey))
  }, [invoiceImportRecoveryKey])

  useEffect(() => {
    if (declarationId || initialDraftCreationRef.current) return
    let cancelled = false
    initialDraftCreationRef.current = true
    setCreatingInitialDraft(true)
    setDraftLoadError(null)
    setAutosaveStatus("saving")
    const createInitialDraft = async () => {
      try {
        if (!initialDraftServerRef.current && draftRef.current.direction === "import") {
          const tenant = await loadTenantDeclarantDefault()
          if (cancelled) return
          const prepared = applyTenantDeclarantDefault(draftRef.current, tenant)
          draftRef.current = prepared
          setDraft((current) => applyTenantDeclarantDefault(current, tenant))
        }
        const saved = initialDraftServerRef.current ?? await saveDeclarationDraft(draftRef.current)
        if (cancelled) return
        initialDraftServerRef.current = saved
        moveCustomsInvoiceImportRecovery("new", saved.id)
        let savedSnapshot = ""
        do {
          const latestDraft = { ...draftRef.current, multideckReference: saved.reference }
          savedSnapshot = JSON.stringify(latestDraft)
          await saveDeclarationDraft(latestDraft, saved.id)
        } while (!cancelled && JSON.stringify({ ...draftRef.current, multideckReference: saved.reference }) !== savedSnapshot)
        if (cancelled) return
        lastSavedDraftSnapshotRef.current = savedSnapshot
        setDraft((current) => current.multideckReference === saved.reference ? current : { ...current, multideckReference: saved.reference })
        setAutosaveStatus("saved")
        setCreatingInitialDraft(false)
        // Starting a local draft is not authority to create an iCustoms draft.
        navigate(`${registerPath}/${saved.id}`)
      } catch (reason) {
        console.error("The initial Customs draft could not be created.", reason)
        if (cancelled) return
        setDraftLoadError(reason instanceof Error ? reason.message : "The Customs draft could not be started.")
        setAutosaveStatus("error")
        setCreatingInitialDraft(false)
      }
    }
    void createInitialDraft()
    return () => { cancelled = true }
  }, [declarationId, draftLoadAttempt, navigate, registerPath, saveDeclarationDraft])

  useEffect(() => {
    if (!declarationId) return
    let cancelled = false
    setLoadingDraft(true)
    setDraftLoadError(null)
    loadStandaloneDeclarationDraft(declarationId, kind, scope)
      .then((savedDraft) => {
        if (cancelled) return
        setDraft(savedDraft)
        setActiveItemId(savedDraft.items[0].id)
        lastSavedDraftSnapshotRef.current = JSON.stringify(savedDraft)
        setAutosaveStatus("saved")
      })
      .catch((reason: unknown) => {
        console.error("The Customs draft could not be loaded.", reason)
        if (!cancelled) setDraftLoadError(reason instanceof Error ? reason.message : "The Customs draft could not be loaded.")
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false)
      })
    return () => { cancelled = true }
  }, [declarationId, draftLoadAttempt, kind, scope])

  useEffect(() => {
    if (!declarationId) return
    let cancelled = false
    setICustomsBusy("loading")
    getICustomsDeclarationState(declarationId)
      .then((state) => {
        if (!cancelled) { setICustomsState(state); setProviderStateError(false) }
      })
      .catch((reason: unknown) => {
        console.error("The iCustoms declaration state could not be loaded.", reason)
        if (!cancelled) setProviderStateError(true)
      })
      .finally(() => {
        if (!cancelled) setICustomsBusy(null)
      })
    return () => { cancelled = true }
  }, [declarationId, providerStateAttempt])

  useEffect(() => {
    if (!declarationId || iCustomsState?.declaration.hasCustomsDraft || iCustomsState?.declaration.provider?.status !== "queued") return
    let cancelled = false
    let timer: number | null = null
    const refreshStartingDraft = async () => {
      try {
        const state = await getICustomsDeclarationState(declarationId)
        if (cancelled) return
        setICustomsState(state)
        if (!state.declaration.hasCustomsDraft && state.declaration.provider?.status === "queued") {
          timer = window.setTimeout(() => { void refreshStartingDraft() }, 650)
        }
      } catch (reason) {
        console.error("The starting iCustoms draft could not be refreshed.", reason)
      }
    }
    timer = window.setTimeout(() => { void refreshStartingDraft() }, 650)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [declarationId, iCustomsState?.declaration.hasCustomsDraft, iCustomsState?.declaration.provider?.status])

  function update<K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function updateMany(values: Partial<StandaloneExportDraft>) {
    setDraft((current) => ({ ...current, ...values }))
  }

  function updateItem<K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) {
    updateItemById(activeItem.id, field, value)
  }

  function updateItemById<K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) {
    setDraft((current) => {
      const previous = current.items.find(item => item.id === itemId)
      const next = { ...current, items: current.items.map(item => item.id === itemId ? { ...item, [field]: value } : item) }
      const newTaxOrPayment = field === "dutyCalculations" && (value as ExportDeclarationItem["dutyCalculations"]).some(entry => {
        const old = previous?.dutyCalculations.find(row => row.id === entry.id)
        return (entry.taxType && entry.taxType !== old?.taxType) || (entry.paymentMethod && entry.paymentMethod !== old?.paymentMethod)
      })
      return newTaxOrPayment ? applyImporterDefaults(next) : next
    })
  }

  const queueAutosave = useCallback((nextDraft: StandaloneExportDraft) => {
    if (!declarationId) return Promise.resolve()
    const snapshot = JSON.stringify(nextDraft)
    if (snapshot === lastSavedDraftSnapshotRef.current) return autosaveQueueRef.current
    const sequence = ++autosaveSequenceRef.current
    if (editorMountedRef.current) setAutosaveStatus("saving")

    const operation = autosaveQueueRef.current.then(async () => {
      if (snapshot === lastSavedDraftSnapshotRef.current) {
        // A preceding queued save may already have persisted this snapshot.
        // The newest request still owns the visible save status.
        if (editorMountedRef.current && sequence === autosaveSequenceRef.current) setAutosaveStatus("saved")
        return
      }
      try {
        const saved = await saveDeclarationDraft(nextDraft, declarationId)
        const persistedDraft = nextDraft.multideckReference === saved.reference
          ? nextDraft
          : { ...nextDraft, multideckReference: saved.reference }
        lastSavedDraftSnapshotRef.current = JSON.stringify(persistedDraft)
        moveCustomsInvoiceImportRecovery(declarationId, saved.id)
        if (editorMountedRef.current && nextDraft.multideckReference !== saved.reference) {
          setDraft((current) => current.multideckReference === saved.reference ? current : { ...current, multideckReference: saved.reference })
        }
        if (editorMountedRef.current && sequence === autosaveSequenceRef.current) setAutosaveStatus("saved")
      } catch (reason) {
        console.error("The Customs draft could not be saved automatically.", reason)
        if (editorMountedRef.current && sequence === autosaveSequenceRef.current) setAutosaveStatus("error")
      }
    })

    autosaveQueueRef.current = operation
    return operation
  }, [declarationId, saveDeclarationDraft])

  const calculateCurrentDraft = useMemo(() => createCustomsCalculationRunner(async () => {
    if (!declarationId || activeDeclarationIdRef.current !== declarationId) throw new Error("Wait for the declaration to load before calculating.")
    const source = draftRef.current
    await queueAutosave(source)
    if (!editorMountedRef.current || activeDeclarationIdRef.current !== declarationId) throw new Error("The declaration changed. Open it again before calculating.")
    // Autosave reports failures in the editor rather than rejecting. Verify its
    // actual saved snapshot, including edits made while the save was in flight.
    if (lastSavedDraftSnapshotRef.current !== JSON.stringify(draftRef.current)) throw new Error("Your latest changes are not saved yet. Check the save status and calculate again.")
  }, () => calculateCustomsDeclaration(declarationId!)), [declarationId, queueAutosave])

  const liveCalculation = useCustomsLiveCalculation(declarationId, draft, scope === "standalone" && kind === "import" && !!declarationId && !loadingDraft && !draftLoadError && iCustomsBusy !== "loading" && iCustomsState?.declaration.status?.toLowerCase() === "draft")

  useEffect(() => {
    if (!declarationId || loadingDraft || draftLoadError || savingDraft || iCustomsBusy === "loading") return
    const declarationStatus = iCustomsState?.declaration.status?.toLocaleLowerCase()
    if (declarationStatus && declarationStatus !== "draft") return
    const snapshot = JSON.stringify(draft)
    if (snapshot === lastSavedDraftSnapshotRef.current) return
    const timer = window.setTimeout(() => { void queueAutosave(draft) }, 850)
    return () => window.clearTimeout(timer)
  }, [declarationId, draft, draftLoadError, iCustomsBusy, iCustomsState?.declaration.status, loadingDraft, queueAutosave, savingDraft])

  useEffect(() => {
    if (!declarationId) return
    const saveBeforeBackgrounding = () => {
      if (document.visibilityState !== "hidden") return
      void queueAutosave(draftRef.current)
    }
    document.addEventListener("visibilitychange", saveBeforeBackgrounding)
    return () => document.removeEventListener("visibilitychange", saveBeforeBackgrounding)
  }, [declarationId, queueAutosave])

  useEffect(() => {
    if (autosaveStatus === "error" && JSON.stringify(draft) === lastSavedDraftSnapshotRef.current) setAutosaveStatus("saved")
  }, [autosaveStatus, draft])

  async function retryDraftSave() {
    if (retryingSave || creatingInitialDraft || savingDraft) return
    if (!declarationId) {
      initialDraftCreationRef.current = false
      setDraftLoadAttempt(attempt => attempt + 1)
      return
    }
    setRetryingSave(true)
    try { await queueAutosave(draftRef.current) }
    finally { if (editorMountedRef.current) setRetryingSave(false) }
  }

  function revealReviewIssues() {
    setValidated(true)
    setViewMode("tabs")
    selectTab("review")
  }

  async function saveDraft(returnToRegister = true) {
    if (savingDraft) return
    setSavingDraft(true)
    setAutosaveStatus("saving")
    setProviderSaveFailed(false)
    let savedLocally = false
    try {
      await autosaveQueueRef.current
      const providerWasRejected = iCustomsState?.declaration.provider?.status === "rejected"
      if (declarationId && providerWasRejected) {
        await reopenRejectedCustomsDeclaration(declarationId)
      }
      const saved = await saveDeclarationDraft(draft, declarationId)
      savedLocally = true
      lastSavedDraftSnapshotRef.current = JSON.stringify({ ...draft, multideckReference: saved.reference })
      setAutosaveStatus("saved")
      moveCustomsInvoiceImportRecovery(invoiceImportRecoveryKey, saved.id)
      setDraft((current) => ({ ...current, multideckReference: saved.reference }))
      if (scope === "standalone" && kind === "import" && !calculationPreflight(draft).length) {
        try {
          await calculateCustomsDeclaration(saved.id)
          window.dispatchEvent(new CustomEvent("multideck:customs-calculation-saved", { detail: { declarationId: saved.id } }))
        } catch {
          toast.warning(t("Draft saved. Calculation history could not be confirmed."), { description: t("Your live estimate is separate. Check calculation history before saving an override.") })
        }
      }
      // Saving operational work never creates or updates an external provider draft.
      toast.success(t("Draft saved in Multideck"), { description: saved.reference })
      if (returnToRegister) navigate(registerPath)
    } catch (reason) {
      console.error("The Multideck Customs draft could not be saved.", reason)
      if (savedLocally) {
        setProviderSaveFailed(true)
        if (reason instanceof ICustomsApiError) setICustomsIssues(reason.issues)
        toast.warning(t("Draft saved in Multideck"), { description: t("Your saved work is intact. Refresh this page before continuing.") })
      } else {
        setAutosaveStatus("error")
      }
    } finally {
      setSavingDraft(false)
      setICustomsBusy(null)
    }
  }

  async function createOrUpdateICustomsDraft() {
    if (iCustomsBusy || savingDraft) return
    const hasProviderDraft = Boolean(iCustomsState?.declaration.hasCustomsDraft)
    if (hasProviderDraft && completion.issues.length) {
      revealReviewIssues()
      toast.warning(t("Declaration needs attention"), { description: `${completion.issues.length} ${t("checks remain")}` })
      return
    }
    setICustomsBusy("draft")
    setICustomsIssues([])
    try {
      if (declarationId && iCustomsState?.declaration.provider?.status === "rejected") {
        await reopenRejectedCustomsDeclaration(declarationId)
      }
      const saved = await saveDeclarationDraft(draft, declarationId)
      moveCustomsInvoiceImportRecovery(invoiceImportRecoveryKey, saved.id)
      setDraft((current) => ({ ...current, multideckReference: saved.reference }))
      if (!hasProviderDraft) {
        const result = await startICustomsProviderDraft(saved.id, `start-${saved.id}`)
        const state = await getICustomsDeclarationState(saved.id)
        setICustomsState(state)
        toast.success(t(result.idempotentReplay ? "iCustoms draft ready" : "iCustoms draft created"), { description: saved.reference })
        if (!declarationId) navigate(`${registerPath}/${saved.id}`)
        return
      }
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

  async function prepareSubmitToICustoms() {
    if (!declarationId || iCustomsBusy || savingDraft) return
    setValidated(true)
    setICustomsBusy("validate")
    setSavingDraft(true)
    setICustomsIssues([])
    let savedLocally = false
    try {
      await autosaveQueueRef.current
      const sourceDraft = draftRef.current
      const refreshedDraft = await refreshCustomsInvoiceEstimate(sourceDraft)
      if (draftRef.current !== sourceDraft) throw new Error("The declaration changed while checking HMRC rates. Your latest edits are retained; check it again before submitting.")
      setDraft(refreshedDraft)
      const remaining = declarationCompletion(refreshedDraft).issues
      if (remaining.length) {
        revealReviewIssues()
        toast.warning(t("Declaration needs attention"), { description: `${remaining.length} ${t("checks remain")}` })
        return
      }
      const saved = await saveDeclarationDraft(refreshedDraft, declarationId)
      savedLocally = true
      const persistedDraft = { ...refreshedDraft, multideckReference: saved.reference }
      lastSavedDraftSnapshotRef.current = JSON.stringify(persistedDraft)
      setDraft(persistedDraft)
      setAutosaveStatus("saved")
      moveCustomsInvoiceImportRecovery(invoiceImportRecoveryKey, saved.id)

      const validation = await validateICustomsDeclaration(saved.id)
      if (!validation.ready) {
        setICustomsIssues(validation.issues)
        revealReviewIssues()
        toast.warning(t("Declaration needs attention"), { description: `${validation.issues.length} ${t("customs checks remain")}` })
        return
      }
      setSubmitDialogOpen(true)
    } catch (reason) {
      if (!savedLocally) {
        setAutosaveStatus("error")
        toast.error(t("Declaration could not be prepared"), { description: t(reason instanceof Error ? reason.message : "Your changes remain on screen. Try again.") })
        return
      }
      const error = reason instanceof ICustomsApiError ? reason : new ICustomsApiError(reason instanceof Error ? reason.message : "The declaration could not be checked.")
      setICustomsIssues(error.issues)
      if (error.issues.length) revealReviewIssues()
      toast.error(t("Declaration could not be checked"), { description: t(error.message) })
    } finally {
      setSavingDraft(false)
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
      if (["rejected", "error"].includes(state.declaration.provider?.status ?? "")) {
        revealReviewIssues()
        toast.error(t("Customs submission failed"), { description: t(state.declaration.provider?.errorMessage ?? "Correct the fields below, then save a new customs draft before submitting again.") })
        return
      }
      toast.success(t("Declaration submitted in Test Mode"), { description: state.declaration.provider?.mrn ?? draft.multideckReference })
    } catch (reason) {
      const error = reason instanceof ICustomsApiError ? reason : new ICustomsApiError(reason instanceof Error ? reason.message : "The declaration could not be submitted.")
      setICustomsIssues(error.issues)
      setSubmitDialogOpen(false)
      revealReviewIssues()
      try {
        const state = await getICustomsDeclarationState(declarationId)
        setICustomsState(state)
      } catch (refreshReason) {
        console.error("The failed iCustoms submission state could not be refreshed.", refreshReason)
      }
      toast.error(t("Customs submission failed"), { description: t(error.message) })
    } finally {
      setICustomsBusy(null)
    }
  }

  const readLocalCustomsState = useCallback(async () => {
    if (!declarationId || iCustomsBusyRef.current) return null
    if (statusRefreshInFlightRef.current) return statusRefreshInFlightRef.current

    const refresh = (async () => {
      setStatusLifecycle({ phase: "checking" })
      try {
        const state = await getICustomsDeclarationState(declarationId)
        setICustomsState(state)
        const status = state.declaration.provider?.status ?? state.declaration.status
        setStatusLifecycle({ phase: isTerminalCustomsStatus(status) ? "complete" : "waiting" })
        return state
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "The customs response could not be checked."
        setStatusLifecycle({ phase: "error", message })
        return null
      } finally {
        statusRefreshInFlightRef.current = null
      }
    })()

    statusRefreshInFlightRef.current = refresh
    return refresh
  }, [declarationId])

  const recoverFromICustoms = useCallback(async () => {
    if (!declarationId || iCustomsBusyRef.current) return null
    setICustomsBusy("refresh")
    setStatusLifecycle({ phase: "checking" })
    try {
      await refreshICustomsDeclaration(declarationId)
      const state = await getICustomsDeclarationState(declarationId)
      setICustomsState(state)
      const status = state.declaration.provider?.status ?? state.declaration.status
      setStatusLifecycle({ phase: isTerminalCustomsStatus(status) ? "complete" : "waiting" })
      return state
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The customs response could not be checked."
      setStatusLifecycle({ phase: "error", message })
      return null
    } finally {
      setICustomsBusy(null)
    }
  }, [declarationId])

  const loadDeclarationPdf = useCallback(async () => {
    if (!declarationId) return null
    if (pdfDocument && pdfBlob) return { document: pdfDocument, blob: pdfBlob }
    if (pdfLoadInFlightRef.current) return pdfLoadInFlightRef.current

    setPdfBusy(true)
    setPdfLoadError(null)
    const load = (async () => {
      try {
        const document = await getCustomsDeclarationDocument(declarationId)
        const blob = await fetchCustomsDeclarationPdf(document)
        setPdfDocument(document)
        setPdfBlob(blob)
        return { document, blob }
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Try again after the declaration is accepted."
        setPdfLoadError(message)
        throw reason
      } finally {
        setPdfBusy(false)
        pdfLoadInFlightRef.current = null
      }
    })()
    pdfLoadInFlightRef.current = load
    return load
  }, [declarationId, pdfBlob, pdfDocument])

  async function openDeclarationPdf() {
    try {
      const loaded = await loadDeclarationPdf()
      if (loaded) setPdfOpen(true)
    } catch (reason) {
      toast.error(t("Declaration PDF unavailable"), { description: t(reason instanceof Error ? reason.message : "Try again after the declaration is accepted.") })
    }
  }

  async function downloadDeclarationPdf() {
    if (!pdfDocument || !pdfBlob) throw new Error("The declaration PDF is not ready.")
    try {
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = pdfDocument.fileName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (reason) {
      toast.error(t("Download failed"), { description: t("Open the declaration PDF again and retry.") })
      throw reason
    }
  }

  function addItem() {
    const item = { ...createExportDeclarationItem(draft.items.length + 1), invoiceHeaderId: draft.invoiceHeaders?.length === 1 ? draft.invoiceHeaders[0].id : "" }
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

  function applyInvoiceItems(items: ExportDeclarationItem[], mode: "replace" | "append" | "header", sourceLineCount: number, header: CustomsInvoiceHeader) {
    if (mode === "header") {
      setDraft(current => applyCustomsInvoiceImport(current, [], "header", header))
      setInvoiceImportOpen(false)
      toast.success(t("Invoice header imported"))
      return
    }
    const importKey = Date.now()
    const importedItems = items.map((item, index) => ({ ...item, id: `invoice-${importKey}-${index + 1}` }))
    setDraft((current) => applyImporterDefaults(applyCustomsInvoiceImport(current, importedItems, mode, header)))
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
    { id: "invoices", label: t("Invoice header") },
    { id: "items", label: `${t("Invoice items")} (${draft.items.length})` },
    { id: "notes", label: t("Notes") },
    { id: "review", label: t("Review") },
  ]
  const customsStatus = iCustomsState?.declaration.provider?.status ?? iCustomsState?.declaration.status ?? "draft"
  const iCustomsProviderReference = iCustomsState?.declaration.correlationId?.trim() || null
  const declarationPdfAvailable = Boolean(declarationId && iCustomsState?.declaration.document.available)
  const statusPollingNeeded = shouldCheckLocalWebhookState(iCustomsState)

  useEffect(() => {
    if (tab === "review" || iCustomsIssues.length || ["rejected", "error"].includes(customsStatus)) setValidated(true)
  }, [customsStatus, iCustomsIssues.length, tab])

  useEffect(() => {
    if (!declarationId || !statusPollingNeeded) {
      if (statusPollTimerRef.current !== null) window.clearTimeout(statusPollTimerRef.current)
      statusPollTimerRef.current = null
      if (isTerminalCustomsStatus(customsStatus)) setStatusLifecycle({ phase: "complete" })
      return
    }

    let cancelled = false
    let attempt = 0
    setStatusLifecycle({ phase: "waiting" })

    const schedule = () => {
      if (cancelled) return
      const delay = customsStatusPollDelay(attempt)
      if (delay === null) {
        setStatusLifecycle({ phase: "timed-out" })
        return
      }
      statusPollTimerRef.current = window.setTimeout(async () => {
        if (cancelled) return
        if (document.visibilityState !== "visible") {
          statusPollTimerRef.current = window.setTimeout(schedule, 5_000)
          return
        }
        attempt += 1
        const state = await readLocalCustomsState()
        if (!cancelled && (!state || shouldCheckLocalWebhookState(state))) schedule()
      }, delay)
    }

    schedule()
    return () => {
      cancelled = true
      if (statusPollTimerRef.current !== null) window.clearTimeout(statusPollTimerRef.current)
      statusPollTimerRef.current = null
    }
  }, [customsStatus, declarationId, readLocalCustomsState, statusPollingNeeded])

  useEffect(() => {
    if (!declarationId) return
    // Acceptance is not the last operational update: iCustoms can subsequently
    // report release or clearance, including changes made in its own workspace.
    // Read our persisted webhook state while visible, without calling the provider.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void readLocalCustomsState()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [declarationId, readLocalCustomsState])

  useEffect(() => {
    if (!declarationId) return
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      if (now - lastFocusRefreshAtRef.current < 1_500) return
      lastFocusRefreshAtRef.current = now
      const wasTimedOut = statusLifecycle.phase === "timed-out"
      void readLocalCustomsState().then((state) => {
        if (wasTimedOut && shouldCheckLocalWebhookState(state)) setStatusLifecycle({ phase: "timed-out" })
      })
    }
    window.addEventListener("focus", refreshOnReturn)
    document.addEventListener("visibilitychange", refreshOnReturn)
    return () => {
      window.removeEventListener("focus", refreshOnReturn)
      document.removeEventListener("visibilitychange", refreshOnReturn)
    }
  }, [declarationId, iCustomsState, readLocalCustomsState, statusLifecycle.phase])

  useEffect(() => {
    const documentId = iCustomsState?.declaration.document.documentId ?? null
    if (!declarationPdfAvailable || !documentId) {
      pdfAutoLoadAttemptedForRef.current = null
      return
    }
    if (pdfBlob || pdfBusy || pdfAutoLoadAttemptedForRef.current === documentId) return
    pdfAutoLoadAttemptedForRef.current = documentId
    void loadDeclarationPdf().catch(() => undefined)
  }, [declarationPdfAvailable, iCustomsState?.declaration.document.documentId, loadDeclarationPdf, pdfBlob, pdfBusy])

  if (loadingDraft) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><p role="status" className="text-[13px] text-[var(--md-text)]">{t(declarationId ? "Loading saved declaration" : "Starting your draft")}</p></Surface>
  }

  if (draftLoadError && declarationId) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><CircleAlert className="size-5 text-[var(--md-red)]" /><h1 className="mt-3 text-[18px] font-medium text-[var(--md-ink)]">{t("Saved declaration unavailable")}</h1><p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Your saved declaration is still intact. Try loading it again.")}</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setDraftLoadAttempt((attempt) => attempt + 1)}><RefreshCw className="size-4" />{t("Try again")}</Button><Button type="button" variant="ghost" onClick={() => navigate(registerPath)}>{t(scope === "job-related" ? "Back to job-related declarations" : "Back to standalone declarations")}</Button></div></Surface>
  }

  return (
    <CustomsDirectionContext.Provider value={kind}>
    <DutyCalculationContext.Provider value={{ declarationId, draft, live: liveCalculation, isSaved: lastSavedDraftSnapshotRef.current === JSON.stringify(draft), calculate: calculateCurrentDraft, updateSetup: value => update("dutyCalculationSetup", value), applyVatExpenseAmount: (costId, amount) => setDraft(current => {
      if (current.direction !== "import") return current
      const rows = importAdjustmentsForDraft(current)
      if (!rows.some(row => row.id === costId && ["AV", "AW"].includes(row.code))) return current
      return { ...current, importAdjustments: rows.map(row => row.id === costId ? { ...row, amount, currency: "GBP" } : row), dutyCalculationSetup: { ...current.dutyCalculationSetup, costs: { ...current.dutyCalculationSetup?.costs, [costId]: { ...current.dutyCalculationSetup?.costs?.[costId], includedInPrice: false } } } }
    }) }}>
    <CustomsReferenceDataContext.Provider value={referenceData}>
    <CustomsOrganisationDirectoryContext.Provider value={organisationDirectory}>
    <CustomsBoxVisibilityContext.Provider value={showCustomsBoxNumbers}>
    <CustomsFieldErrorsContext.Provider value={fieldErrors}>
    <div className={cn("min-w-0 max-w-full space-y-4 overflow-x-clip", kind === "import" && "customs-import-editor")} data-customs-view={viewMode} data-testid={`standalone-${kind}-editor`}>
      <header className="grid min-w-0 gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex min-w-0 flex-col items-start">
          <button type="button" onClick={() => navigate(registerPath)} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)] hover:text-[var(--md-accent)]">
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t(scope === "job-related" ? "Back to job-related declarations" : "Back to standalone declarations")}
          </button>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-start text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t(declarationId ? (kind === "import" ? "Edit import declaration" : "Edit export declaration") : (kind === "import" ? "New import declaration" : "New export declaration"))}</h1>
            <span role="status" aria-label={`${t("Declaration status")}: ${t(titleCase(customsStatus))}`} className="inline-flex shrink-0">
              <StatusPill kind="status" tone={customsStatusTone(customsStatus)} className="h-7 px-2.5 text-[11.5px] font-medium">{t(titleCase(customsStatus))}</StatusPill>
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">{t(viewMode === "tabs" ? "Complete one focused section at a time. Move between sections whenever you need." : "Scan and complete the declaration in one compact form, with goods lines kept in Items.")}</p>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-1.5 lg:items-end">
          <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-start lg:justify-end">
            <span
              role={autosaveStatus === "error" ? "alert" : "status"}
              aria-live="polite"
              className={cn("text-[11px]", autosaveStatus === "error" ? "text-[var(--md-red)]" : "text-[var(--md-subtle)]")}
            >
              {autosaveStatus === "saving" ? t("Saving automatically") : autosaveStatus === "error" ? t("Changes could not be saved") : declarationId && lastSavedDraftSnapshotRef.current === JSON.stringify(draft) ? t("All changes saved") : t("Unsaved changes")}
            </span>

          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2" data-customs-header-actions>
            {declarationPdfAvailable ? <Button type="button" variant="outline" size="sm" className="h-9 max-sm:h-11" disabled={pdfBusy} onClick={() => void openDeclarationPdf()}><FileText className="size-3.5" />{t(pdfBusy ? "Preparing declaration" : pdfLoadError ? "Retry declaration" : "View declaration")}</Button> : null}
            <Button type="button" size="sm" className="h-9 max-sm:h-11" disabled={savingDraft || creatingInitialDraft} onClick={() => void saveDraft()}><Save className="size-3.5" />{t(savingDraft ? "Saving draft" : "Save draft")}</Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 border-t border-[var(--md-line)] pt-3 lg:col-span-2 xl:flex-row xl:items-center xl:justify-between" data-customs-header-context>
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex shrink-0 items-center gap-2"><span className="text-[12px] text-[var(--md-subtle)]">{t("Assigned to")}</span><DeclarationAssigneePicker declarationId={declarationId} t={t} /></div>
            {iCustomsProviderReference ? <p className="min-w-0 max-w-full text-start text-[12px] text-[var(--md-text)]"><span className="text-[var(--md-subtle)]">{t("iCustoms correlation ID")}:</span>{" "}<span dir="ltr" className="select-text break-all">{iCustomsProviderReference}</span></p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label={t("Display options")}>
            <SegmentedControl
              options={["tabs", "form"] as const}
              value={viewMode}
              onChange={setViewMode}
              ariaLabel={t("Declaration view")}
              className="max-sm:[&>button]:h-9"
              renderOption={(option) => t(option === "tabs" ? "Tab view" : "Form view")}
            />
            <DeclarationFieldVisibilityPopover value={fieldVisibility} onChange={setFieldVisibility} t={t} />
          </div>
        </div>
      </header>

      {autosaveStatus === "error" || retryingSave ? <InlineNotice tone="error" role={retryingSave ? "status" : "alert"} aria-busy={retryingSave} title={t(retryingSave ? "Retrying save" : "Your latest changes have not been saved")} action={<Button type="button" variant="outline" disabled={retryingSave || creatingInitialDraft || savingDraft} onClick={() => void retryDraftSave()}>{retryingSave ? <DotGridLoader className="size-4" /> : <RefreshCw className="size-4" />}{t("Retry save")}</Button>}>{t("Your entries are still here. Keep this page open and retry when your connection is available.")}</InlineNotice> : null}
      {providerStateError || providerSaveFailed ? <InlineNotice tone="warning" role="status" title={t(providerStateError ? "Customs status could not be checked" : "Saved in Multideck — customs draft needs attention")} action={<Button type="button" variant="outline" disabled={Boolean(iCustomsBusy)} onClick={() => providerStateError ? setProviderStateAttempt(attempt => attempt + 1) : revealReviewIssues()}>{t(providerStateError ? iCustomsBusy === "loading" ? "Checking status…" : "Retry status check" : "Open Review")}</Button>}>{t(providerStateError ? "You can keep editing. Retry to check the customs status before submitting." : "Your saved work is intact. Review the customs details before trying again.")}</InlineNotice> : null}

      {viewMode === "tabs" ? <LayoutGroup id={`customs-${kind}-sections`}>
        <nav data-customs-section-nav className="relative isolate max-w-full overflow-x-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]" aria-label={t("Declaration sections")}>
          <div className="grid min-w-[1120px] grid-cols-8 gap-1">
            {editorTabs.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectTab(entry.id)}
                id={`customs-tab-${entry.id}`}
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
          { label: t("Invoice header"), value: String(draft.invoiceHeaders?.length ?? 0) },
          { label: t("Invoice items"), value: String(draft.items.length) },
          { label: t("Notes") },
          { label: t("Review") },
        ]}
        activeTab={t(({ general: "General", invoices: "Invoice header", items: "Invoice items", notes: "Notes", review: "Review" })[formTab])}
        onChange={(nextTab) => setFormTab(nextTab === t("Invoice items") ? "items" : nextTab === t("Invoice header") ? "invoices" : nextTab === t("Review") ? "review" : nextTab === t("Notes") ? "notes" : "general")}
        className="px-1"
      />}

      {referenceData.loading ? <Surface padding="sm" className="rounded-[var(--md-radius-lg)]"><p className="text-[11px] text-[var(--md-text)]">{t("Loading Customs reference data")}</p></Surface> : null}
      {referenceData.error ? <InlineNotice tone="error" role="alert" title={t("Customs options could not be loaded")} action={<Button type="button" variant="outline" onClick={referenceData.retry}><RefreshCw className="size-4" />{t("Retry options")}</Button>}>{t("Selection fields are temporarily unavailable. Your entries are unchanged; retry to load the options.")}</InlineNotice> : null}

      {viewMode === "form" && formTab === "general" ? <GeneralFormView customsState={iCustomsState} draft={draft} update={update} updateMany={updateMany} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
      {viewMode === "form" && formTab === "invoices" ? <InvoiceHeadersSection draft={draft} onConversionDateChange={date => update("customsConversionDate", date)} onChange={(headers) => update("invoiceHeaders", headers)} onImport={() => { setInvoiceImportTarget("header"); setInvoiceImportOpen(true) }} t={t} /> : null}
      {viewMode === "form" && formTab === "items" ? <ItemsSection invoiceHeaders={draft.invoiceHeaders ?? []} declarationCategory={draft.declarationCategory} items={draft.items} activeItem={activeItem} activeItemId={activeItemId} onSelectItem={setActiveItemId} onAdd={addItem} onOpenInvoiceImport={() => { setInvoiceImportTarget("items"); setInvoiceImportOpen(true) }} onDuplicate={duplicateItem} onRemove={removeItem} update={updateItem} updateRow={updateItemById} showDataElements={showDataElements} showOptional={showOptional} issues={activeItemIssueFields} validated={validated} t={t} /> : null}
      {viewMode === "form" && formTab === "notes" ? <LifecycleNotes subjectType="customs" subjectId={declarationId ?? null} /> : null}
      {viewMode === "form" && formTab === "review" ? <ReviewSection draft={draft} completion={completion} iCustomsState={iCustomsState} iCustomsBusy={iCustomsBusy} iCustomsIssues={iCustomsIssues} statusLifecycle={statusLifecycle} pdfAvailable={declarationPdfAvailable} pdfBusy={pdfBusy} pdfLoadError={pdfLoadError} savingDraft={savingDraft} update={update} updateItem={updateItemById} onOpenPdf={() => void openDeclarationPdf()} onRefresh={() => void recoverFromICustoms()} onCreateDraft={() => void createOrUpdateICustomsDraft()} onSaveDraft={() => void saveDraft(false)} onSubmit={() => void prepareSubmitToICustoms()} t={t} /> : null}
      {viewMode === "tabs" ? <div className="relative min-w-0 overflow-x-clip">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={tab}
            id={`customs-panel-${tab}`}
            data-customs-tab-panel={tab}
            tabIndex={-1}
            role="region"
            aria-labelledby={`customs-tab-${tab}`}
            initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
            transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
            className="min-w-0"
          >
            {tab === "declaration" ? <DeclarationSection customsState={iCustomsState} draft={draft} update={update} showDataElements={showDataElements} issues={issueFields} t={t} /> : null}
            {tab === "parties" ? <PartiesSection draft={draft} update={update} updateMany={updateMany} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
            {tab === "transport" ? <TransportSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
            {tab === "documents" ? <DocumentsSection draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issueFields} t={t} /> : null}
            {tab === "invoices" ? <InvoiceHeadersSection draft={draft} onConversionDateChange={date => update("customsConversionDate", date)} onChange={(headers) => update("invoiceHeaders", headers)} onImport={() => { setInvoiceImportTarget("header"); setInvoiceImportOpen(true) }} t={t} /> : null}
            {tab === "items" ? <ItemsSection invoiceHeaders={draft.invoiceHeaders ?? []} declarationCategory={draft.declarationCategory} items={draft.items} activeItem={activeItem} activeItemId={activeItemId} onSelectItem={setActiveItemId} onAdd={addItem} onOpenInvoiceImport={() => { setInvoiceImportTarget("items"); setInvoiceImportOpen(true) }} onDuplicate={duplicateItem} onRemove={removeItem} update={updateItem} updateRow={updateItemById} showDataElements={showDataElements} showOptional={showOptional} issues={activeItemIssueFields} validated={validated} t={t} /> : null}
            {tab === "notes" ? <LifecycleNotes subjectType="customs" subjectId={declarationId ?? null} /> : null}
            {tab === "review" ? <ReviewSection draft={draft} completion={completion} iCustomsState={iCustomsState} iCustomsBusy={iCustomsBusy} iCustomsIssues={iCustomsIssues} statusLifecycle={statusLifecycle} pdfAvailable={declarationPdfAvailable} pdfBusy={pdfBusy} pdfLoadError={pdfLoadError} savingDraft={savingDraft} update={update} updateItem={updateItemById} onOpenPdf={() => void openDeclarationPdf()} onRefresh={() => void recoverFromICustoms()} onCreateDraft={() => void createOrUpdateICustomsDraft()} onSaveDraft={() => void saveDraft(false)} onSubmit={() => void prepareSubmitToICustoms()} t={t} /> : null}
          </motion.div>
        </AnimatePresence>
      </div> : null}
      {kind === "import" && viewMode === "tabs" ? <footer className="customs-section-footer" aria-label={t("Move between declaration sections")}>
        <span className="text-[12px] text-[var(--md-subtle)]">{t("Section")} {editorTabs.findIndex(entry => entry.id === tab) + 1} {t("of")} {editorTabs.length}</span>
        <div className="flex items-center gap-2">
          {tab !== editorTabs[0].id ? <Button type="button" variant="ghost" onClick={() => moveToSection(editorTabs[editorTabs.findIndex(entry => entry.id === tab) - 1].id)}><ArrowLeft className="size-3.5" />{t("Previous")}</Button> : null}
          {tab !== "review" ? <Button type="button" variant="outline" onClick={() => moveToSection(editorTabs[editorTabs.findIndex(entry => entry.id === tab) + 1].id)}>{t("Next")}: {editorTabs[editorTabs.findIndex(entry => entry.id === tab) + 1].label}<ArrowLeft className="size-3.5 rotate-180" /></Button> : null}
        </div>
      </footer> : null}
      {declarationId && (viewMode === "tabs" ? ["documents", "invoices"].includes(tab) : ["general", "invoices"].includes(formTab)) ? (
        <section aria-label={t("Source documents")} className="grid min-w-0 gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
          <h2 className="text-[14px] font-medium">{t("Source documents")}</h2>
          {sourceAttachmentsLoading ? <DotGridLoader label={t("Loading source documents")} /> : sourceAttachmentsError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px]">
            <p>{sourceAttachmentsError}</p><Button variant="outline" onClick={() => setSourceAttachmentsAttempt(value => value + 1)}>{t("Try again")}</Button>
          </div> : sourceAttachments.length ? sourceAttachments.map(doc => <div key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1"><p className="text-[12px] text-[var(--md-subtle)]">{t(doc.typeCode === "commercial_invoice_original" ? "Original commercial invoice" : doc.typeCode === "commercial_invoice" ? "Commercial invoice" : "Packing list")}{doc.typeCode !== "commercial_invoice_original" && doc.version ? ` · ${t("Version")} ${doc.version}` : ""}</p><p className="break-all text-[13px]" data-i18n-skip>{doc.fileName || t("File unavailable")}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!doc.available} aria-label={`${t("View")}: ${doc.fileName}`} onClick={() => void openSourceAttachment(doc.id, doc.fileName)}>{t("View")}</Button>
              <Button size="sm" variant="outline" disabled={!doc.available || sourceDownloading} aria-label={`${t("Download")}: ${doc.fileName}`} onClick={() => void downloadSourceAttachment(doc.id)}>{t("Download")}</Button></div>
          </div>) : <p className="text-[13px] text-[var(--md-subtle)]">{t("No source documents linked to this declaration.")}</p>}
        </section>
      ) : null}
      <Dialog open={sourcePreview !== null} onOpenChange={open => { if (!open) { sourceRequest.current += 1; setSourcePreview(null) } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader><DialogTitle className="break-all" data-i18n-skip>{sourcePreview?.name}</DialogTitle><DialogDescription>{t("Source document retained for this declaration. The original file is unchanged.")}</DialogDescription></DialogHeader>
          {sourcePreview?.error ? <div role="alert"><p>{sourcePreview.error}</p><Button variant="outline" onClick={() => void openSourceAttachment(sourcePreview.id, sourcePreview.name)}>{t("Try again")}</Button></div>
            : sourcePreview?.url ? sourcePreview.mimeType === "application/pdf" ? <iframe title={`${t("Source document")}: ${sourcePreview.name}`} src={sourcePreview.url} className="h-[65vh] w-full rounded-[var(--md-radius-lg)] bg-white" />
              : sourcePreview.mimeType?.startsWith("image/") ? <img src={sourcePreview.url} alt={sourcePreview.name} className="max-h-[65vh] w-full object-contain" />
                : <p>{t("Preview is not available for this file type. Download it to open it.")}</p>
            : <div className="grid place-items-center py-8"><DotGridLoader label={t("Opening attachment…")} /></div>}
          <DialogFooter><Button disabled={!sourcePreview?.url || sourceDownloading} onClick={() => sourcePreview && void downloadSourceAttachment(sourcePreview.id)}>{t(sourceDownloading ? "Downloading…" : "Download")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="rounded-[var(--md-radius-xl)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Submit declaration in Test Mode?")}</DialogTitle>
            <DialogDescription>{t("This sends the saved declaration to the customs test service. It will not enter the live customs environment.")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[12px] text-[var(--md-text)]">
            <p className="font-medium text-[var(--md-ink)]">{draft.multideckReference || t("Saved declaration")}</p>
            {draft.customsConversionDate ? <p className="mt-2">{t("HMRC rate date")}: {draft.customsConversionDate}</p> : null}
            {(draft.invoiceHeaders ?? []).filter(header => header.currency && header.currency !== "GBP").map(header => <p key={header.id} className="mt-1">{header.invoiceNumber}: 1 GBP = {header.exchangeRate} {header.currency}</p>)}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("Keep as draft")}</Button></DialogClose>
            <Button type="button" disabled={iCustomsBusy === "submit"} onClick={() => void submitToICustoms()}><Send className="size-4" />{t(iCustomsBusy === "submit" ? "Submitting" : "Submit")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PdfDocumentViewerDialog open={pdfOpen} onOpenChange={setPdfOpen} blob={pdfBlob} title={t(kind === "import" ? "CDS import declaration" : "CDS export declaration")} fileName={pdfDocument?.fileName ?? "declaration.pdf"} meta={pdfDocument?.mrn ? `MRN ${pdfDocument.mrn}${pdfDocument.environment === "sandbox" ? ` · ${t("Test environment")}` : ""}` : undefined} onDownload={downloadDeclarationPdf} />
    </div>
    {invoiceImportOpen ? <CustomsInvoiceImportWorkspace key={invoiceImportRecoveryKey} recoveryKey={invoiceImportRecoveryKey} importTarget={invoiceImportTarget} onClose={() => setInvoiceImportOpen(false)} onApply={applyInvoiceItems} existingItemCount={draft.items.length} /> : null}
    </CustomsFieldErrorsContext.Provider>
    </CustomsBoxVisibilityContext.Provider>
    </CustomsOrganisationDirectoryContext.Provider>
    </CustomsReferenceDataContext.Provider>
    </DutyCalculationContext.Provider>
    </CustomsDirectionContext.Provider>
  )
}

// HMRC DE 5/16 uses EU for Union proof, unlike the individual-country DE 5/15.
// Keep this group out of ordinary country selectors; eligibility is server checked.
function preferentialOriginOptions(options: ReadonlyArray<readonly [string, string]>, t: (text: string) => string) {
  return options.some(([code]) => code === "EU") ? options : [...options, ["EU", `EU - ${t("European Union")}`] as const]
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
  customsState?: ICustomsWorkspaceState | null
  draft: StandaloneExportDraft
  update: <K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) => void
  showDataElements: boolean
  issues: Set<string>
  highlightedField?: string
  t: (text: string) => string
}

function useCustomsDisclosure(hasValues: boolean, needsAttention = false) {
  const [open, setOpen] = useState(hasValues || needsAttention)
  useEffect(() => {
    if (hasValues || needsAttention) setOpen(true)
  }, [hasValues, needsAttention])
  return { open, onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open) }
}

function GeneralFormView(props: SectionProps & { showOptional: boolean; updateMany: (values: Partial<StandaloneExportDraft>) => void }) {
  return <CompactCustomsFormContext.Provider value>
    <div className="grid gap-[var(--md-page-stack-gap-compact)]">
      <DeclarationSection {...props} />
      <PartiesSection {...props} />
      <TransportSection {...props} />
      <DocumentsSection {...props} />
    </div>
  </CompactCustomsFormContext.Provider>
}

function DeclarationSection({ draft, update, showDataElements, issues, highlightedField, t, customsState }: SectionProps) {
  return draft.direction === "export"
    ? <ExportDeclarationSection draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} />
    : <ImportDeclarationSection draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} customsState={customsState} />
}

function ImportDeclarationSection({ draft, update, showDataElements, issues, highlightedField, t, customsState }: SectionProps) {
  const badgeErrorId = useId()
  const countries = useReferenceOptions("country", t, "Select country")
  const goodsLocationTypes = useReferenceOptions("goods_location_type", t, "Select type")
  const [preferences, setPreferences] = useState<CustomsReferencePreferencesState | null>(null)
  const [preferencesError, setPreferencesError] = useState("")
  const [preferencesAttempt, setPreferencesAttempt] = useState(0)
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [populationEvent, setPopulationEvent] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    setPreferencesError("")
    setPreferencesLoading(true)
    getCustomsReferencePreferences().then((value) => { if (active) setPreferences(value) })
      .catch((reason: Error) => { if (active) setPreferencesError(reason.message) })
      .finally(() => { if (active) setPreferencesLoading(false) })
    return () => { active = false }
  }, [preferencesAttempt])
  const officeId = draft.customsOfficeId ?? preferences?.settings.defaultOfficeId ?? ""
  const eori = preferences?.settings.officeEoris[officeId] || preferences?.settings.eori || ""
  const allocationYear = draft.ducrAllocationYear ?? new Date().getFullYear()
  const proposedDucr = generateDucr(eori, draft.jobReference, allocationYear)
  const nextDucr = preferences && customsState ? ducrToAutoPopulate({ current: draft.ducr, previouslyGenerated: draft.autoGeneratedDucr, eori, jobReference: draft.jobReference, allocationYear, submitted: Boolean(customsState.declaration.provider?.submittedAt) }) : null
  useEffect(() => {
    if (nextDucr !== null) {
      setPopulationEvent(Date.now())
      update("ducr", nextDucr)
      update("autoGeneratedDucr", nextDucr)
      update("ducrAllocationYear", allocationYear)
    }
  }, [nextDucr, allocationYear, update])
  const ducrError = (draft.ducr || issues.has("ducr")) ? ducrFormatError(draft.ducr) : null
  const ducrRef = useAutoPopulationMorph<HTMLInputElement>(Boolean(populationEvent), draft.ducr, undefined, populationEvent)
  const badges = preferences?.settings.badges.filter((badge) => badge.active) ?? []
  const savedBadgeMatches = badges.some((badge) => badge.id === draft.badgeConfigurationId && badge.code === draft.badgeId && badge.provider === draft.badgeProvider && badge.portCode === draft.badgePortCode)
  const badgeValue = savedBadgeMatches ? draft.badgeConfigurationId! : draft.badgeId ? `saved:${draft.badgeConfigurationId || draft.badgeId}` : ""
  const badgeOptions: CustomsReferenceOptionTuple[] = badges.map((badge) => [badge.id, `${badge.code} - ${badge.portName} · ${badge.provider} · ${badge.portCode}`])
  if (badgeValue && !badges.some((badge) => badge.id === badgeValue)) badgeOptions.push([badgeValue, `${draft.badgeId} - ${t("Saved badge")}`])
  const badgeCode = (value: string) => badges.find((badge) => badge.id === value)?.code || draft.badgeId || value
  const pendingMappings = ([["badgeId", "Badge code"], ["declarantReference", "Declarant’s reference"], ["agentReference", "Agent’s reference"]] as const).filter(([field]) => draft[field]?.trim()).map(([, label]) => t(label))
  const declarationStatus = customsState?.declaration.provider?.status ?? customsState?.declaration.status ?? "draft"
  const declarationCategories = useReferenceOptions("declaration_category", t, "Select category")
  const declarationTypes = useReferenceOptions("declaration_type", t, "Select type")
  return <SectionFrame title={t("Declaration details")} description={t("Set up the declaration, then confirm references and goods location.")}>
    <div className="customs-declaration-columns">
    <section aria-labelledby="customs-declaration-setup-heading">
      <h3 id="customs-declaration-setup-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Declaration setup and references")}</h3>
      <FieldGrid className="customs-declaration-fields">
      <SelectField label={t("Declaration category")} dataElement="1/1" customsBox="1" required showDataElements={showDataElements} value={draft.declarationCategory} fieldKey="declarationCategory" invalid={issues.has("declarationCategory")} highlighted={highlightedField === "declarationCategory"} onChange={(value) => update("declarationCategory", value)} options={declarationCategories} />
      <SelectField label={t("Type of declaration")} dataElement="1/2" customsBox="1" required showDataElements={showDataElements} value={draft.declarationType} fieldKey="declarationType" invalid={issues.has("declarationType")} highlighted={highlightedField === "declarationType"} onChange={(value) => update("declarationType", value)} options={declarationTypes} />
      <FieldShell errorId={badgeErrorId} label={t("Badge code")} required showDataElements={showDataElements} fieldKey="badgeId" invalid={issues.has("badgeId")} highlighted={highlightedField === "badgeId"} notice={preferences && !badges.length ? t("No active badges are configured. Add badge codes in Admin → System Preferences → Customs preferences.") : undefined}>
        <CustomsReferenceCombobox describedBy={issues.has("badgeId") ? badgeErrorId : undefined} label={t("Badge code")} required value={badgeValue} options={badgeOptions} optionCode={badgeCode} placeholder={t(preferences ? "Select badge" : preferencesError ? "Setup unavailable" : "Loading badges…")} disabled={!preferences || !badgeOptions.length} invalid={issues.has("badgeId")} onChange={(value) => {
          const badge = badges.find((entry) => entry.id === value)
          if (!badge) return
          update("badgeId", badge.code)
          update("badgeConfigurationId", badge.id)
          update("badgeProvider", badge.provider)
          update("badgePortCode", badge.portCode)
        }} />
      </FieldShell>
      <TextField label={t("Job reference")} showDataElements={showDataElements} value={draft.jobReference} onChange={(value) => update("jobReference", value)} />
      <FieldShell label="DUCR" required showDataElements={showDataElements} fieldKey="ducr" invalid={Boolean(ducrError)} highlighted={highlightedField === "ducr"} notice={!eori ? t("Configure the registered company or office EORI in Admin → System Preferences → Customs preferences.") : undefined}>
        <span className="relative block"><Input ref={ducrRef} aria-label="DUCR" value={draft.ducr} aria-required="true" aria-invalid={Boolean(ducrError)} aria-describedby={ducrError ? "customs-ducr-error" : "customs-ducr-help"} onChange={(event) => { setPopulationEvent(null); update("autoGeneratedDucr", undefined); update("ducr", event.target.value.toUpperCase()) }} className={customsSingleLineControlClass} /></span>
        {ducrError ? <span id="customs-ducr-error" aria-hidden="true" className="customs-field-error"><CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{t(ducrError)}</span> : null}
      </FieldShell>
    {preferences?.offices.length ? <><SelectField label={t("Customs office")} showDataElements={false} value={officeId} options={[["", t("Company EORI")], ...preferences.offices.map((office) => [office.id, office.name] as const)]} onChange={(value) => update("customsOfficeId", value)} labelOnly /></> : null}
      </FieldGrid>
    {preferencesError ? <InlineNotice tone="error" className="mt-3" role="alert" title={t("Customs setup could not be loaded")} action={<Button type="button" variant="outline" size="sm" disabled={preferencesLoading} onClick={() => setPreferencesAttempt(value => value + 1)}>{t("Retry setup")}</Button>}>{t("Badge codes and EORI defaults are temporarily unavailable. Your entered details are unchanged.")}</InlineNotice> : null}
    <p id="customs-ducr-help" className={cn("mt-2 text-[11px] text-[var(--md-subtle)]", !eori && !draft.ducr && "sr-only")}>{t(draft.ducr ? "DUCR is retained for the declaration audit trail. Check it before submitting." : !draft.jobReference ? "Add the job reference to generate the DUCR from your registered EORI." : !eori ? "Configure the registered company or office EORI in Admin → System Preferences → Customs preferences." : !proposedDucr ? "The EORI or job reference cannot form a valid DUCR. Check Customs preferences and the job reference." : "DUCR uses the allocation year, registered EORI and job reference.")}</p>
    </section>
    <section aria-labelledby="customs-declaration-location-heading">
      <h3 id="customs-declaration-location-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Presentation and goods location")}</h3>
      <FieldGrid className="customs-declaration-fields">
      <SelectField label={t("Customs office of presentation")} dataElement="5/26" showDataElements={showDataElements} value={draft.presentationOffice} onChange={(value) => update("presentationOffice", value)} options={[["", t("Select office")], ...customsOffices.map((office) => [office.value, office.label] as const)]} invalid={issues.has("presentationOffice")} fieldKey="presentationOffice" highlighted={highlightedField === "presentationOffice"} />
      <SelectField label={t("Type of location")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationType} fieldKey="goodsLocationType" invalid={issues.has("goodsLocationType")} highlighted={highlightedField === "goodsLocationType"} onChange={(value) => update("goodsLocationType", value)} options={goodsLocationTypes} />
      <><SelectField label={t("Type of address")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsAddressType ?? "U"} onChange={(value) => update("goodsAddressType", value)} options={[["", t("Select type")], ["U", t("U - UN/LOCODE")], ["Y", t("Y - Authorisation Number")]]} /><SelectField label={t("Goods location country")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationCountry ?? draft.destinationCountry} onChange={(value) => update("goodsLocationCountry", value)} options={countries} /><TextField label={t("Goods location additional identifier")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationAdditionalIdentifier ?? ""} onChange={(value) => update("goodsLocationAdditionalIdentifier", value.replace(/[^0-9]/g, "").slice(0, 3))} maxLength={3} /></>
      </FieldGrid>
    </section>
    <section aria-labelledby="customs-declaration-references-heading">
      <h3 id="customs-declaration-references-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Additional references")}</h3>
      <FieldGrid className="customs-declaration-fields">
      <TextField label={t("Trader reference number")} dataElement="2/4" customsBox="44" showDataElements={showDataElements} value={draft.traderReference} onChange={(value) => update("traderReference", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 19))} invalid={issues.has("traderReference")} fieldKey="traderReference" highlighted={highlightedField === "traderReference"} maxLength={19} />
      <TextField label={t("Declarant’s reference")} showDataElements={showDataElements} value={draft.declarantReference} onChange={(value) => update("declarantReference", value)} />
      <TextField label={t("Agent’s reference")} showDataElements={showDataElements} value={draft.agentReference} onChange={(value) => update("agentReference", value)} />
      <TextField label="MUCR / UCN" showDataElements={showDataElements} value={draft.ucn} onChange={(value) => update("ucn", value)} />
      </FieldGrid>
    </section>
    <section aria-labelledby="customs-declaration-identifiers-heading">
      <h3 id="customs-declaration-identifiers-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Customs identifiers")}</h3>
      <FieldGrid className="customs-declaration-fields">
      <FieldShell label="MRN" showDataElements={showDataElements}><Input readOnly value={customsState?.declaration.provider?.mrn ?? ""} placeholder={t("Not assigned")} className={customsSingleLineControlClass} /></FieldShell>
      <FieldShell label={t("LRN (customs code)")} showDataElements={showDataElements}><Input readOnly value={customsState?.declaration.provider?.lrn ?? ""} placeholder={t("Not assigned")} className={customsSingleLineControlClass} /></FieldShell>
      <FieldShell label={t("Status")} showDataElements={showDataElements}>
        <span className="flex h-8 items-center">
          <StatusPill tone={customsStatusTone(declarationStatus)}>{t(titleCase(declarationStatus))}</StatusPill>
        </span>
      </FieldShell>
      </FieldGrid>
    </section>
    </div>
    {pendingMappings.length ? <p role="status" className="mt-3 text-[12px] text-[var(--md-amber)]">{t("Saved with this draft, but awaiting iCustoms mapping:")} {pendingMappings.join(", ")}. {t("These values cannot be sent to iCustoms yet.")}</p> : null}
  </SectionFrame>
}

function ExportDeclarationSection({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const direction = useContext(CustomsDirectionContext)
  const allDeclarationCategories = useReferenceOptions("declaration_category", t, "Select category")
  const declarationCategories = direction === "import"
    ? allDeclarationCategories.filter(([code]) => !code || code === "H1")
    : allDeclarationCategories
  const declarationTypes = useReferenceOptions("declaration_type", t, "Select type")
  return <SectionFrame title={t("Declaration details")} description={t(direction === "import" ? "Core identity and totals for this import declaration." : "Core identity and totals for this export declaration.")}>
    <FieldGrid>
      <SelectField label={t("Declaration category")} dataElement="1/1" customsBox="1" required showDataElements={showDataElements} value={draft.declarationCategory} onChange={(value) => update("declarationCategory", value)} options={declarationCategories} />
      <SelectField label={t("Type of declaration")} dataElement="1/2" customsBox="1" required showDataElements={showDataElements} value={draft.declarationType} onChange={(value) => update("declarationType", value)} options={declarationTypes} />
      <TextField label={t("Trader reference number")} dataElement="2/4" customsBox="44" showDataElements={showDataElements} value={draft.traderReference} onChange={(value) => update("traderReference", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 19))} invalid={issues.has("traderReference")} fieldKey="traderReference" highlighted={highlightedField === "traderReference"} maxLength={19} />
      {direction === "export" ? <><TextField label={t("Internal reference")} required showDataElements={showDataElements} value={draft.internalReference} onChange={(value) => update("internalReference", value)} invalid={issues.has("internalReference")} fieldKey="internalReference" highlighted={highlightedField === "internalReference"} /><TextField label={t("UCN")} showDataElements={showDataElements} value={draft.ucn} onChange={(value) => update("ucn", value)} /><TextField label={t("Badge ID")} showDataElements={showDataElements} value={draft.badgeId} onChange={(value) => update("badgeId", value)} /></> : null}
    </FieldGrid>
  </SectionFrame>
}

type CustomsOrganisationParty = "importer" | "exporter" | "consignee" | "declarant" | "carrier" | "representative" | "seller" | "buyer"
type CustomsAddressParty = Extract<CustomsOrganisationParty, "importer" | "exporter" | "consignee" | "declarant">

const customsOrganisationTypesByParty: Record<CustomsOrganisationParty, readonly string[]> = {
  seller: ["Seller", "Exporter", "Consignor/Shipper", "Supplier"],
  buyer: ["Buyer", "Importer", "Consignee", "Customer", "Key Customer Account"],
  importer: ["Importer", "Consignee", "Customer", "Key Customer Account"],
  exporter: ["Exporter", "Consignor/Shipper", "Supplier"],
  consignee: ["Consignee", "Customer", "Potential Customer", "Key Customer Account"],
  declarant: ["Declarant", "Customs Broker", "Freight Forwarder"],
  carrier: ["Carrier", "Shipping Line", "Airline", "Domestic Haulier", "International Haulier", "Supplier"],
  representative: ["Representative", "Customs Broker", "Freight Forwarder", "Overseas Agent"],
}

function customsOrganisationTypeFilter(party: CustomsOrganisationParty): FilterQuery {
  return {
    match: "all",
    groups: [{
      id: `customs-${party}-types`,
      match: "any",
      conditions: customsOrganisationTypesByParty[party].map((type) => ({
        id: `customs-${party}-${type.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        field: "organisationTypes",
        operator: "is",
        value: type,
      })),
    }],
  }
}

function customsPartyPatch(party: CustomsAddressParty, organisation: ApiCustomerDetail): Partial<StandaloneExportDraft> {
  const address = organisation.address
  return {
    [party]: organisation.name,
    [`${party}Name`]: organisation.name,
    [`${party}AddressLine`]: [address?.line1, address?.line2].filter(Boolean).join(", "),
    [`${party}City`]: address?.townCity ?? "",
    [`${party}Postcode`]: address?.postZipCode ?? "",
    [`${party}Country`]: address?.countryCode?.toUpperCase() ?? "",
    ...(party === "declarant" ? { declarantEori: typeof organisation.operations?.customs?.eoriNumber === "string" ? organisation.operations.customs.eoriNumber : "" } : {}),
  } as Partial<StandaloneExportDraft>
}

function PartiesSection({ draft, update, updateMany, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean; updateMany: (values: Partial<StandaloneExportDraft>) => void }) {
  const direction = useContext(CustomsDirectionContext)
  const compact = useContext(CompactCustomsFormContext)
  const countries = useReferenceOptions("country", t, "Select country")
  const [importerCompany, setImporterCompany] = useState<ApiCustomerDetail | null>(null)
  const [importerLookupError, setImporterLookupError] = useState(false)
  const [importerLookupAttempt, setImporterLookupAttempt] = useState(0)
  const [importerPopulationEvent, setImporterPopulationEvent] = useState<number | null>(null)
  const [editingImporterAddress, setEditingImporterAddress] = useState(false)
  const [exporterCompany, setExporterCompany] = useState<ApiCustomerDetail | null>(null)
  const [exporterLookupError, setExporterLookupError] = useState(false)
  const [exporterLookupAttempt, setExporterLookupAttempt] = useState(0)
  const [exporterPopulationEvent, setExporterPopulationEvent] = useState<number | null>(null)
  const [editingExporterAddress, setEditingExporterAddress] = useState(false)
  useEffect(() => {
    let cancelled = false
    setExporterCompany(null)
    setExporterLookupError(false)
    if (!draft.exporterOrganisationId) return
    getCustomer(draft.exporterOrganisationId).then(company => { if (!cancelled) setExporterCompany(company) }).catch(() => { if (!cancelled) setExporterLookupError(true) })
    return () => { cancelled = true }
  }, [draft.exporterOrganisationId, exporterLookupAttempt])
  const selectExporter = (company: ApiCustomerDetail, addressId?: string) => {
    setExporterCompany(company)
    setExporterLookupError(false)
    setExporterPopulationEvent(event => (event ?? 0) + 1)
    updateMany(exporterCompanyPatch(company, addressId))
  }
  const exporterAddressInvalid = ["exporterName", "exporterAddressLine", "exporterCity", "exporterPostcode", "exporterCountry"].some(key => issues.has(key))
  const [declarantCompany, setDeclarantCompany] = useState<ApiCustomerDetail | null>(null)
  const [declarantLookupError, setDeclarantLookupError] = useState(false)
  const [declarantLookupAttempt, setDeclarantLookupAttempt] = useState(0)
  const [declarantPopulationEvent, setDeclarantPopulationEvent] = useState<number | null>(null)
  const [editingDeclarantAddress, setEditingDeclarantAddress] = useState(false)
  useEffect(() => {
    let cancelled = false
    setDeclarantCompany(null)
    setDeclarantLookupError(false)
    if (!draft.declarantOrganisationId) return
    getCustomer(draft.declarantOrganisationId).then(company => { if (!cancelled) setDeclarantCompany(company) }).catch(() => { if (!cancelled) setDeclarantLookupError(true) })
    return () => { cancelled = true }
  }, [draft.declarantOrganisationId, declarantLookupAttempt])
  const selectDeclarant = (company: ApiCustomerDetail, addressId?: string) => {
    setDeclarantCompany(company)
    setDeclarantLookupError(false)
    setDeclarantPopulationEvent(event => (event ?? 0) + 1)
    updateMany(declarantCompanyPatch(company, addressId))
  }
  const declarantAddressInvalid = ["declarantName", "declarantAddressLine", "declarantCity", "declarantPostcode", "declarantCountry"].some(key => issues.has(key))
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  useEffect(() => {
    let cancelled = false
    if (!draft.importerOrganisationId) { setImporterCompany(null); return }
    setImporterLookupError(false)
    getCustomer(draft.importerOrganisationId).then(company => { if (!cancelled) setImporterCompany(company) }).catch(() => { if (!cancelled) setImporterLookupError(true) })
    return () => { cancelled = true }
  }, [draft.importerOrganisationId, importerLookupAttempt])
  const selectImporter = (company: ApiCustomerDetail, addressId?: string) => {
    setImporterCompany(company)
    setImporterLookupError(false)
    setImporterPopulationEvent(event => (event ?? 0) + 1)
    const next = applyImporterDefaults({ ...latestDraft.current, ...importerCompanyPatch(company, addressId) })
    updateMany(next)
  }
  const addressText = formattedImporterAddress(draft)
  const addressInvalid = ["importerName", "importerAddressLine", "importerCity", "importerPostcode", "importerCountry"].some(key => issues.has(key))
  const chooseOrganisation = (party: CustomsAddressParty) => (organisation: ApiCustomerDetail) => updateMany(customsPartyPatch(party, organisation))
  return <section aria-labelledby="customs-party-details-heading" className="min-w-0">
    <header className={cn("flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6", compact ? "mb-2" : "mb-3")}>
      <h2 id="customs-party-details-heading" className={cn("shrink-0 font-medium text-[var(--md-ink)]", compact ? "text-[13px]" : "text-[15px]")}>{t("Party details")}</h2>
    </header>
    <div className={cn("grid min-w-0 gap-3", direction === "import" ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
      {direction === "import" ? <>
        <PartyFieldsGroup title={t("Importer")} fieldsClassName="sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
          <PartyContactWarning values={[draft.importerName, draft.importerAddressLine, draft.importerCity, draft.importerPostcode, draft.importerCountry]} fields={["importerName", "importerAddressLine", "importerCity", "importerPostcode", "importerCountry"]} issues={issues} t={t} />
          <div className="customs-party-row">
            <CustomsOrganisationField party="importer" label={t("Company")} dataElement="3/16" customsBox="8" required showDataElements={showDataElements} value={draft.importer} onChange={(value) => updateMany({ importer: value, importerName: value, importerOrganisationId: undefined, importerAddressId: undefined, importerEori: "", importerPaymentDefaults: undefined, importerVatNumber: "", importerUseCustomerTaxPartyDefault: false, importerTaxPartyDefaultAppliedFor: undefined, ...(draft.importerOrganisationId ? { importerAddressLine: "", importerCity: "", importerPostcode: "", importerCountry: "" } : {}) })} onSelect={selectImporter} invalid={issues.has("importer")} fieldKey="importer" highlighted={highlightedField === "importer"} />
            <FieldShell label={t("EORI number")} dataElement="3/16" customsBox="8" showDataElements={showDataElements} invalid={issues.has("importerEori")} fieldKey="importerEori"><AutoPopulatedInput aria-label={t("Importer EORI number")} readOnly={Boolean(draft.importerOrganisationId)} value={draft.importerEori ?? ""} onChange={event => update("importerEori", event.target.value.toUpperCase())} autoPopulated={Boolean(draft.importerOrganisationId)} autoPopulationEvent={importerPopulationEvent} autoPopulationDescription={t("Filled from the selected company's Customs tab and address.")} placeholder={t("Not recorded")} className={cn(customsSingleLineControlClass, "border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]")} /></FieldShell>
          </div>
          {importerCompany && importerCompany.id === draft.importerOrganisationId && importerCompany.addresses.length > 1 ? <SelectField label={t("Office / address")} showDataElements={false} value={draft.importerAddressId ?? ""} options={importerCompany.addresses.map(address => [address.id, [address.name, address.line1, address.townCity].filter(Boolean).join(" · ")])} onChange={id => selectImporter(importerCompany, id)} /> : null}
          <div className="customs-party-address">
            <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--md-text)]">{t("Address")} <span className="text-[var(--md-red)]">*</span></span><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" aria-expanded={editingImporterAddress} onClick={() => setEditingImporterAddress(current => !current)}>{t(editingImporterAddress ? "Done" : "Edit address")}</Button></div>
            <AutoPopulatedTextarea aria-label={t("Importer formatted address")} readOnly value={addressText} rows={3} autoPopulated={Boolean(draft.importerOrganisationId)} autoPopulationEvent={importerPopulationEvent} autoPopulationDescription={t("Filled from the company address. Use Edit address to change this declaration only.")} aria-invalid={addressInvalid || undefined} placeholder={t("Select a company or enter an address")} className={cn(customsMultilineControlClass, "min-h-20 resize-none border-0 bg-[var(--md-field-bg)] px-3 py-2 text-[12px] leading-5 shadow-[var(--md-shadow-line)]")} />
          </div>
          {editingImporterAddress || addressInvalid ? <div className="customs-party-row">
          <TextField label={t("Importer legal name")} dataElement="3/16" customsBox="8" required showDataElements={showDataElements} value={draft.importerName} onChange={(value) => update("importerName", value)} invalid={issues.has("importerName")} fieldKey="importerName" highlighted={highlightedField === "importerName"} />
          <TextField label={t("Importer street address")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerAddressLine} onChange={(value) => update("importerAddressLine", value)} invalid={issues.has("importerAddressLine")} fieldKey="importerAddressLine" highlighted={highlightedField === "importerAddressLine"} />
          <TextField label={t("Importer town or city")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerCity} onChange={(value) => update("importerCity", value)} invalid={issues.has("importerCity")} fieldKey="importerCity" highlighted={highlightedField === "importerCity"} />
          <TextField label={t("Importer postcode")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerPostcode} onChange={(value) => update("importerPostcode", value)} invalid={issues.has("importerPostcode")} fieldKey="importerPostcode" highlighted={highlightedField === "importerPostcode"} />
          <SelectField label={t("Importer country")} dataElement="3/15" customsBox="8" required showDataElements={showDataElements} value={draft.importerCountry} onChange={(value) => update("importerCountry", value)} invalid={issues.has("importerCountry")} fieldKey="importerCountry" highlighted={highlightedField === "importerCountry"} options={countries} />
          </div> : null}
          {draft.importerOrganisationId && !draft.importerEori ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Add the registered EORI in the company's Customs tab.")}</p> : null}
          {importerLookupError ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{t("Company details unavailable. Saved declaration values are unchanged.")} <Button type="button" variant="link" size="sm" onClick={() => setImporterLookupAttempt(attempt => attempt + 1)}>{t("Retry")}</Button></p> : null}
          {draft.importerPaymentDefaults?.dutyPaymentMethod || draft.importerPaymentDefaults?.vatPaymentMethod ? <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="text-[var(--md-subtle)]">{t("Company payment defaults fill empty tax fields. Existing entries are kept.")}</span><Button type="button" variant="outline" size="sm" onClick={() => updateMany(applyImporterDefaults(latestDraft.current))}>{t("Apply to all items")}</Button></div> : null}
        </PartyFieldsGroup>
      </> : null}
      <PartyFieldsGroup title={t("Exporter")} fieldsClassName="sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
        <PartyContactWarning values={[draft.exporterName, draft.exporterAddressLine, draft.exporterCity, draft.exporterPostcode, draft.exporterCountry]} fields={["exporterName", "exporterAddressLine", "exporterCity", "exporterPostcode", "exporterCountry"]} issues={issues} t={t} />
        <div className={cn("grid min-w-0 gap-2", direction === "export" && "sm:grid-cols-2")}>
          <CustomsOrganisationField party="exporter" label={t("Company")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporter} onChange={(value) => updateMany({ exporter: value, exporterName: value, exporterOrganisationId: undefined, exporterAddressId: undefined, exporterEori: "", ...(draft.exporterOrganisationId ? { exporterAddressLine: "", exporterCity: "", exporterPostcode: "", exporterCountry: "" } : {}) })} onSelect={selectExporter} invalid={issues.has("exporter")} fieldKey="exporter" highlighted={highlightedField === "exporter"} />
          {direction === "export" ? <FieldShell label={t("EORI number")} dataElement="3/2" customsBox="2" showDataElements={showDataElements} invalid={issues.has("exporterEori")} fieldKey="exporterEori"><AutoPopulatedInput aria-label={t("Exporter EORI number")} readOnly={Boolean(draft.exporterOrganisationId)} value={draft.exporterEori ?? ""} onChange={event => update("exporterEori", event.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={17} autoPopulated={Boolean(draft.exporterOrganisationId)} autoPopulationEvent={exporterPopulationEvent} autoPopulationDescription={t("Filled from the selected company's Customs tab and address.")} placeholder={t("Not recorded")} className={cn(customsSingleLineControlClass, "border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]")} /></FieldShell> : null}
        </div>
        {exporterCompany && exporterCompany.id === draft.exporterOrganisationId && exporterCompany.addresses.length > 1 ? <SelectField label={t("Office / address")} showDataElements={false} value={draft.exporterAddressId ?? ""} options={exporterCompany.addresses.map(address => [address.id, [address.name, address.line1, address.townCity].filter(Boolean).join(" · ")])} onChange={id => selectExporter(exporterCompany, id)} /> : null}
        <div className="customs-party-address">
          <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--md-text)]">{t("Address")} <span className="text-[var(--md-red)]">*</span></span><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" aria-expanded={editingExporterAddress} onClick={() => setEditingExporterAddress(current => !current)}>{t(editingExporterAddress ? "Done" : "Edit address")}</Button></div>
          <AutoPopulatedTextarea aria-label={t("Exporter formatted address")} readOnly value={formattedExporterAddress(draft)} rows={3} autoPopulated={Boolean(draft.exporterOrganisationId)} autoPopulationEvent={exporterPopulationEvent} autoPopulationDescription={t("Filled from the company address. Use Edit address to change this declaration only.")} aria-invalid={exporterAddressInvalid || undefined} placeholder={t("Select a company or enter an address")} className={cn(customsMultilineControlClass, "min-h-20 resize-none border-0 bg-[var(--md-field-bg)] px-3 py-2 text-[12px] leading-5 shadow-[var(--md-shadow-line)]")} />
        </div>
        {editingExporterAddress || exporterAddressInvalid ? <div className="customs-party-row">
        <TextField label={t("Exporter legal name")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporterName} onChange={(value) => update("exporterName", value)} invalid={issues.has("exporterName")} fieldKey="exporterName" highlighted={highlightedField === "exporterName"} />
        <TextField label={t("Exporter street address")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporterAddressLine} onChange={(value) => update("exporterAddressLine", value)} invalid={issues.has("exporterAddressLine")} fieldKey="exporterAddressLine" highlighted={highlightedField === "exporterAddressLine"} />
        <TextField label={t("Exporter town or city")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporterCity} onChange={(value) => update("exporterCity", value)} invalid={issues.has("exporterCity")} fieldKey="exporterCity" highlighted={highlightedField === "exporterCity"} />
        <TextField label={t("Exporter postcode")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporterPostcode} onChange={(value) => update("exporterPostcode", value)} invalid={issues.has("exporterPostcode")} fieldKey="exporterPostcode" highlighted={highlightedField === "exporterPostcode"} />
        <SelectField label={t("Exporter country")} dataElement="3/1" customsBox="2" required showDataElements={showDataElements} value={draft.exporterCountry} onChange={(value) => update("exporterCountry", value)} invalid={issues.has("exporterCountry")} fieldKey="exporterCountry" highlighted={highlightedField === "exporterCountry"} options={countries} />
        </div> : null}
        {direction === "export" && draft.exporterOrganisationId && !draft.exporterEori ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Add the registered EORI in the company's Customs tab.")}</p> : null}
        {exporterLookupError ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{t("Company details unavailable. Saved declaration values are unchanged.")} <Button type="button" variant="link" size="sm" onClick={() => setExporterLookupAttempt(attempt => attempt + 1)}>{t("Retry")}</Button></p> : null}
      </PartyFieldsGroup>
      {direction === "export" ? <PartyFieldsGroup title={t("Consignee")}>
        <PartyContactWarning values={[draft.consigneeName, draft.consigneeAddressLine, draft.consigneeCity, draft.consigneePostcode, draft.consigneeCountry]} fields={["consigneeName", "consigneeAddressLine", "consigneeCity", "consigneePostcode", "consigneeCountry"]} issues={issues} t={t} />
        <CustomsOrganisationField party="consignee" label={t("Consignee")} dataElement="3/9" customsBox="8" required showDataElements={showDataElements} value={draft.consignee} onChange={(value) => update("consignee", value)} onSelect={chooseOrganisation("consignee")} invalid={issues.has("consignee")} fieldKey="consignee" highlighted={highlightedField === "consignee"} />
        <TextField label={t("Consignee legal name")} dataElement="3/9" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeName} onChange={(value) => update("consigneeName", value)} invalid={issues.has("consigneeName")} fieldKey="consigneeName" highlighted={highlightedField === "consigneeName"} />
        <TextField label={t("Consignee street address")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeAddressLine} onChange={(value) => update("consigneeAddressLine", value)} invalid={issues.has("consigneeAddressLine")} fieldKey="consigneeAddressLine" highlighted={highlightedField === "consigneeAddressLine"} />
        <TextField label={t("Consignee town or city")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeCity} onChange={(value) => update("consigneeCity", value)} invalid={issues.has("consigneeCity")} fieldKey="consigneeCity" highlighted={highlightedField === "consigneeCity"} />
        <TextField label={t("Consignee postcode")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneePostcode} onChange={(value) => update("consigneePostcode", value)} invalid={issues.has("consigneePostcode")} fieldKey="consigneePostcode" highlighted={highlightedField === "consigneePostcode"} />
        <SelectField label={t("Consignee country")} dataElement="3/10" customsBox="8" required showDataElements={showDataElements} value={draft.consigneeCountry} onChange={(value) => update("consigneeCountry", value)} invalid={issues.has("consigneeCountry")} fieldKey="consigneeCountry" highlighted={highlightedField === "consigneeCountry"} options={countries} />
      </PartyFieldsGroup> : null}
      <PartyFieldsGroup title={t("Declarant")} fieldsClassName="sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
        <PartyContactWarning values={[draft.declarantName, draft.declarantAddressLine, draft.declarantCity, draft.declarantPostcode, draft.declarantCountry]} fields={["declarantName", "declarantAddressLine", "declarantCity", "declarantPostcode", "declarantCountry"]} issues={issues} t={t} />
        <div className="customs-party-row">
          <CustomsOrganisationField party="declarant" label={t("Company")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarant} onChange={(value) => updateMany({ declarant: value, declarantName: value, declarantOrganisationId: undefined, declarantAddressId: undefined, declarantEori: "", ...(draft.declarantOrganisationId ? { declarantAddressLine: "", declarantCity: "", declarantPostcode: "", declarantCountry: "" } : {}) })} onSelect={selectDeclarant} invalid={issues.has("declarant")} fieldKey="declarant" highlighted={highlightedField === "declarant"} />
          <FieldShell label={t("EORI number")} dataElement="3/18" customsBox="14" showDataElements={showDataElements} invalid={issues.has("declarantEori")} fieldKey="declarantEori"><AutoPopulatedInput aria-label={t("Declarant EORI number")} readOnly={Boolean(draft.declarantOrganisationId)} value={draft.declarantEori ?? ""} onChange={event => update("declarantEori", event.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={17} autoPopulated={Boolean(draft.declarantOrganisationId)} autoPopulationEvent={declarantPopulationEvent} autoPopulationDescription={t("Filled from the selected company's Customs tab and address.")} placeholder={t("Not recorded")} className={cn(customsSingleLineControlClass, "border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]")} /></FieldShell>
        </div>
        {declarantCompany && declarantCompany.id === draft.declarantOrganisationId && declarantCompany.addresses.length > 1 ? <SelectField label={t("Office / address")} showDataElements={false} value={draft.declarantAddressId ?? ""} options={declarantCompany.addresses.map(address => [address.id, [address.name, address.line1, address.townCity].filter(Boolean).join(" · ")])} onChange={id => selectDeclarant(declarantCompany, id)} /> : null}
        <div className="customs-party-address">
          <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--md-text)]">{t("Address")} <span className="text-[var(--md-red)]">*</span></span><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" aria-expanded={editingDeclarantAddress} onClick={() => setEditingDeclarantAddress(current => !current)}>{t(editingDeclarantAddress ? "Done" : "Edit address")}</Button></div>
          <AutoPopulatedTextarea aria-label={t("Declarant formatted address")} readOnly value={formattedDeclarantAddress(draft)} rows={3} autoPopulated={Boolean(draft.declarantOrganisationId)} autoPopulationEvent={declarantPopulationEvent} autoPopulationDescription={t("Filled from the company address. Use Edit address to change this declaration only.")} aria-invalid={declarantAddressInvalid || undefined} placeholder={t("Select a company or enter an address")} className={cn(customsMultilineControlClass, "min-h-20 resize-none border-0 bg-[var(--md-field-bg)] px-3 py-2 text-[12px] leading-5 shadow-[var(--md-shadow-line)]")} />
        </div>
        {editingDeclarantAddress || declarantAddressInvalid ? <div className="customs-party-row">
        <TextField label={t("Declarant legal name")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarantName} onChange={(value) => update("declarantName", value)} invalid={issues.has("declarantName")} fieldKey="declarantName" highlighted={highlightedField === "declarantName"} />
        <TextField label={t("Declarant street address")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarantAddressLine} onChange={(value) => update("declarantAddressLine", value)} invalid={issues.has("declarantAddressLine")} fieldKey="declarantAddressLine" highlighted={highlightedField === "declarantAddressLine"} />
        <TextField label={t("Declarant town or city")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarantCity} onChange={(value) => update("declarantCity", value)} invalid={issues.has("declarantCity")} fieldKey="declarantCity" highlighted={highlightedField === "declarantCity"} />
        <TextField label={t("Declarant postcode")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarantPostcode} onChange={(value) => update("declarantPostcode", value)} invalid={issues.has("declarantPostcode")} fieldKey="declarantPostcode" highlighted={highlightedField === "declarantPostcode"} />
        <SelectField label={t("Declarant country")} dataElement="3/17" customsBox="14" required showDataElements={showDataElements} value={draft.declarantCountry} onChange={(value) => update("declarantCountry", value)} invalid={issues.has("declarantCountry")} fieldKey="declarantCountry" highlighted={highlightedField === "declarantCountry"} options={countries} />
        </div> : null}
        {draft.declarantOrganisationId && !draft.declarantEori ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Add the registered EORI in the company's Customs tab.")}</p> : null}
        {declarantLookupError ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{t("Company details unavailable. Saved declaration values are unchanged.")} <Button type="button" variant="link" size="sm" onClick={() => setDeclarantLookupAttempt(attempt => attempt + 1)}>{t("Retry")}</Button></p> : null}
      </PartyFieldsGroup>
      {direction === "import" ? (["representative", "seller", "buyer"] as const).map(party => <AdditionalPartySection key={party} party={party} draft={draft} update={update} updateMany={updateMany} showDataElements={showDataElements} issues={issues} t={t} />) : null}
      {direction === "export" ? <RepresentationFields draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issues} highlightedField={highlightedField} t={t} /> : null}
    </div>
  </section>
}

function AuthorisationHoldersTable({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const showBoxes = useContext(CustomsBoxVisibilityContext)
  const rows = [
    { id: "primary-authorisation", identifier: draft.authorisationIdentifier, category: draft.authorisationCategory, primary: true },
    ...(draft.additionalAuthorisationHolders ?? []).map(row => ({ ...row, primary: false })),
  ]
  type Row = typeof rows[number]
  const options = customsAuthorisationCategories.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)
  const key = (row: Row, field: "identifier" | "category") => row.primary ? (field === "identifier" ? "authorisationIdentifier" : "authorisationCategory") : "additionalAuthorisationHolders"
  const change = (row: Row, field: "identifier" | "category", value: string) => {
    if (row.primary) update(field === "identifier" ? "authorisationIdentifier" : "authorisationCategory", value)
    else update("additionalAuthorisationHolders", (draft.additionalAuthorisationHolders ?? []).map(holder => holder.id === row.id ? { ...holder, [field]: value } : holder))
  }
  const cell = (row: Row, field: "identifier" | "category", content: ReactNode) => <div data-customs-field={key(row, field)} className={cn("min-w-0 rounded-[var(--md-radius-sm)]", highlightedField === key(row, field) && "ring-2 ring-[var(--md-accent)]")}>{content}</div>
  const columns: DataTableColumn<Row>[] = [
    { id: "identifier", label: t("Authorisation identifier"), width: 300, minWidth: 170, canHide: false, canPin: false, cell: row => cell(row, "identifier", <Input aria-label={`${t("Authorisation identifier")} ${rows.indexOf(row) + 1}`} value={row.identifier} onChange={event => change(row, "identifier", event.target.value.toUpperCase())} aria-invalid={issues.has(key(row, "identifier")) || undefined} className={cn(customsSingleLineControlClass, "bg-[var(--md-field-bg)]")} />) },
    { id: "category", label: t("Authorisation category"), width: 360, minWidth: 180, canHide: false, canPin: false, cell: row => cell(row, "category", <ItemTableSelect label={`${t("Authorisation category")} ${rows.indexOf(row) + 1}`} value={row.category} options={options} onChange={value => change(row, "category", value)} invalid={issues.has(key(row, "category"))} />) },
    { id: "actions", label: t("Actions"), width: 48, minWidth: 48, kind: "actions", canHide: false, canPin: false, cell: row => row.primary ? null : <Button type="button" variant="ghost" size="icon" aria-label={`${t("Remove authorisation holder")} ${rows.indexOf(row) + 1}`} onClick={() => update("additionalAuthorisationHolders", (draft.additionalAuthorisationHolders ?? []).filter(holder => holder.id !== row.id))} className="text-[var(--md-subtle)] hover:text-[var(--md-red)]"><Trash2 className="size-3.5" /></Button> },
  ]
  return <section aria-labelledby="authorisation-holders-heading" className="col-span-full min-w-0">
    <div className="mb-3 flex items-center gap-2"><h4 id="authorisation-holders-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Authorisation holders")}</h4>{showDataElements ? <span className="text-[10px] text-[var(--md-blue)]" aria-label="Data element 3/39" title="Data element 3/39">3/39</span> : null}{showBoxes ? <span className="text-[10px] text-[var(--md-accent)]" aria-label="Customs box 44" title="Customs box 44">44</span> : null}</div>
    <p className="mb-2 text-[11px] text-[var(--md-subtle)] sm:hidden">{t("Scroll across the table to see every field.")}</p>
    <DataTable ariaLabel={t("Authorisation holders")} rows={rows} columns={columns} getRowKey={row => row.primary ? "primary" : `additional-${row.id}`} minimumWidth={420} showToolbar={false} showColumnManager={false} enableSelectionExport={false} tableClassName="table-fixed" className="shadow-none" />
    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => update("additionalAuthorisationHolders", [...(draft.additionalAuthorisationHolders ?? []), { id: repeatableCustomsEntryId("holder"), identifier: "", category: "" }])}><Plus className="size-3.5" />{t("Add new authorisation holder")}</Button>
  </section>
}

function RepresentationFields({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const direction = useContext(CustomsDirectionContext)
  const representationTypes = useReferenceOptions("representation_type", t, "Not specified")
  const authorisationOptions = [["", t("Select category")], ...customsAuthorisationCategories.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)] as CustomsReferenceOptionTuple[]
  return <PartyFieldsGroup title={t(direction === "export" ? "Carrier & representation" : "Representation")} className="col-span-full" fieldsClassName="xl:grid-cols-3 2xl:grid-cols-3">
      {direction === "import" ? (["primaryDefermentAccount", "secondaryDefermentAccount"] as const).map((field, index) => <TextField key={field} label={t(index === 0 ? "DAN 1" : "DAN 2")} dataElement="2/6" showDataElements={showDataElements} value={draft[field]} onChange={value => update(field, value)} invalid={issues.has(field)} fieldKey={field} maxLength={7} />) : null}
        {direction === "export" ? <CustomsOrganisationField party="carrier" label={t("Carrier")} required showDataElements={showDataElements} value={draft.carrier} onChange={(value) => update("carrier", value)} onSelect={(organisation) => update("carrier", organisation.name)} invalid={issues.has("carrier")} fieldKey="carrier" highlighted={highlightedField === "carrier"} /> : null}
        {direction === "export" ? <TextField label={t("Carrier identifier (EORI)")} required showDataElements={showDataElements} value={draft.carrierIdentifier} onChange={(value) => update("carrierIdentifier", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))} invalid={issues.has("carrierIdentifier")} fieldKey="carrierIdentifier" highlighted={highlightedField === "carrierIdentifier"} /> : null}
        {direction === "export" ? <CustomsOrganisationField party="representative" label={t("Representative")} dataElement="3/19" customsBox="14" showDataElements={showDataElements} value={draft.representative} onChange={(value) => update("representative", value)} onSelect={(organisation) => update("representative", organisation.name)} /> : null}
        <SelectField label={t("Type of representation")} dataElement="3/21" customsBox="14" required={direction === "import"} showDataElements={showDataElements} value={draft.representationType} onChange={(value) => update("representationType", value)} invalid={issues.has("representationType")} fieldKey="representationType" highlighted={highlightedField === "representationType"} options={representationTypes} />
        {showOptional && direction === "export" ? <><TextField label={t("Authorisation identifier")} dataElement="3/39" customsBox="44" fieldKey="authorisationIdentifier" invalid={issues.has("authorisationIdentifier")} highlighted={highlightedField === "authorisationIdentifier"} showDataElements={showDataElements} value={draft.authorisationIdentifier} onChange={(value) => update("authorisationIdentifier", value)} /><SelectField label={t("Authorisation category")} dataElement="3/39" customsBox="44" showDataElements={showDataElements} value={draft.authorisationCategory} onChange={(value) => update("authorisationCategory", value)} options={authorisationOptions} fieldKey="authorisationCategory" invalid={issues.has("authorisationCategory")} highlighted={highlightedField === "authorisationCategory"} /></> : null}
        {direction === "import" ? <AuthorisationHoldersTable draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} /> : null}
      </PartyFieldsGroup>
}

function AdditionalPartySection({ party, draft, update, updateMany, showDataElements, issues, t }: SectionProps & { party: AdditionalCustomsParty; updateMany: (values: Partial<StandaloneExportDraft>) => void }) {
  const title = party === "seller" ? "Seller" : party === "buyer" ? "Buyer" : "Representative"
  const [nameDE, eoriDE, box] = party === "seller" ? ["3/24", "3/25", "2"] : party === "buyer" ? ["3/26", "3/27", "8"] : ["3/19", "3/20", "14"]
  const countries = useReferenceOptions("country", t, "Select country")
  const [editing, setEditing] = useState(false)
  const [company, setCompany] = useState<ApiCustomerDetail | null>(null)
  const [lookupError, setLookupError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [populationEvent, setPopulationEvent] = useState<number | null>(null)
  const organisationId = draft[`${party}OrganisationId`]
  useEffect(() => {
    let cancelled = false
    setCompany(null)
    setLookupError(false)
    if (!organisationId) return
    getCustomer(organisationId).then(value => { if (!cancelled) setCompany(value) }).catch(() => { if (!cancelled) setLookupError(true) })
    return () => { cancelled = true }
  }, [organisationId, attempt])
  const select = (value: ApiCustomerDetail, addressId?: string) => {
    setCompany(value)
    setLookupError(false)
    setPopulationEvent(event => (event ?? 0) + 1)
    updateMany(additionalPartyCompanyPatch(party, value, addressId))
  }
  const addressInvalid = ["Name", "AddressLine", "City", "Postcode", "Country"].some(suffix => issues.has(`${party}${suffix}`))
  return <PartyFieldsGroup title={t(title)} className="customs-additional-party" fieldsClassName="sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
    <div className="customs-party-row">
      <CustomsOrganisationField party={party} label={t("Company")} dataElement={nameDE} customsBox={box} showDataElements={showDataElements} value={draft[party]} onChange={value => updateMany({ ...clearAdditionalParty(party), [party]: value, [`${party}Name`]: value })} onSelect={select} invalid={issues.has(party)} fieldKey={party} />
      <FieldShell label={t("EORI number")} dataElement={eoriDE} customsBox={box} showDataElements={showDataElements} invalid={issues.has(`${party}Eori`)} fieldKey={`${party}Eori`}><AutoPopulatedInput aria-label={t(`${title} EORI number`)} readOnly={Boolean(organisationId)} value={draft[`${party}Eori`] ?? ""} onChange={event => update(`${party}Eori`, event.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={17} autoPopulated={Boolean(organisationId)} autoPopulationEvent={populationEvent} placeholder={t("Not recorded")} className={cn(customsSingleLineControlClass, "border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]")} /></FieldShell>
    </div>
    {company?.id === organisationId && company && company.addresses.length > 1 ? <SelectField label={t("Office / address")} showDataElements={false} value={draft[`${party}AddressId`] ?? ""} options={company.addresses.map(address => [address.id, [address.name, address.line1, address.townCity].filter(Boolean).join(" · ")])} onChange={id => select(company, id)} /> : null}
    <div className="customs-party-address">
      <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--md-text)]">{t("Address")}</span><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" aria-expanded={editing} onClick={() => setEditing(value => !value)}>{t(editing ? "Done" : "Edit address")}</Button></div>
      <AutoPopulatedTextarea aria-label={t(`${title} formatted address`)} readOnly value={formattedAdditionalPartyAddress(party, draft)} rows={3} autoPopulated={Boolean(organisationId)} autoPopulationEvent={populationEvent} autoPopulationDescription={t("Filled from the company address. Use Edit address to change this declaration only.")} aria-invalid={addressInvalid || undefined} placeholder={t("Select a company or enter an address")} className={cn(customsMultilineControlClass, "min-h-20 resize-none border-0 bg-[var(--md-field-bg)] px-3 py-2 text-[12px] leading-5 shadow-[var(--md-shadow-line)]")} />
    </div>
    {editing || addressInvalid ? <div className="customs-party-row">
      {([ ["Name", "Legal name"], ["AddressLine", "Street address"], ["City", "Town or city"], ["Postcode", "Postcode"] ] as const).map(([suffix,label]) => <TextField key={suffix} label={t(`${title} ${label.toLowerCase()}`)} dataElement={nameDE} customsBox={box} showDataElements={showDataElements} value={draft[`${party}${suffix}`] ?? ""} onChange={value => update(`${party}${suffix}`, value)} invalid={issues.has(`${party}${suffix}`)} fieldKey={`${party}${suffix}`} />)}
      <SelectField label={t(`${title} country`)} dataElement={nameDE} customsBox={box} showDataElements={showDataElements} value={draft[`${party}Country`] ?? ""} onChange={value => update(`${party}Country`, value)} options={countries} invalid={issues.has(`${party}Country`)} fieldKey={`${party}Country`} />
    </div> : null}
    {lookupError ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{t("Company details unavailable. Saved declaration values are unchanged.")} <Button type="button" variant="link" size="sm" onClick={() => setAttempt(value => value + 1)}>{t("Retry")}</Button></p> : null}
    {draft[party] || draft[`${party}Name`] || draft[`${party}Eori`] || draft[`${party}AddressLine`] ? <Button type="button" variant="ghost" size="sm" onClick={() => { updateMany(clearAdditionalParty(party)); setEditing(false) }}>{t(`Clear ${title.toLowerCase()}`)}</Button> : null}
  </PartyFieldsGroup>
}

function PartyFieldsGroup({ title, children, className, fieldsClassName }: { title: string; children: ReactNode; className?: string; fieldsClassName?: string }) {
  const compact = useContext(CompactCustomsFormContext)
  return <section data-customs-party aria-label={title} className={cn("min-w-0 max-w-full bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "rounded-[var(--md-radius-md)] p-3" : "rounded-[var(--md-radius-lg)] p-4", className)}>
    <h3 className={cn("border-b border-[var(--md-line)] pb-2 font-semibold tracking-[-0.01em] text-[var(--md-ink)]", compact ? "mb-2 text-[12px] leading-4" : "mb-3 text-[14px] leading-5")}>{title}</h3>
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
  const transportFieldsClass = direction === "import" ? "customs-transport-fields" : "!grid-cols-1 sm:!grid-cols-2 xl:!grid-cols-4"
  return <SectionFrame title={t("Transport and location")} description={t("Routing, border movement and goods location.")}>
    <div className={direction === "import" ? "customs-transport-columns" : "grid min-w-0 gap-5"}>
    <section aria-labelledby="customs-transport-routing-heading" className="min-w-0">
      <h3 id="customs-transport-routing-heading" className="mb-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Route and transport modes")}</h3>
    <FieldGrid className={transportFieldsClass}>
      <SelectField label={t("Export country")} dataElement="5/14" customsBox="15" required showDataElements={showDataElements} value={draft.exportCountry} fieldKey="exportCountry" invalid={issues.has("exportCountry")} highlighted={highlightedField === "exportCountry"} onChange={(value) => update("exportCountry", value)} options={countries} />
      <SelectField label={t("Country of destination")} dataElement="5/8" customsBox="17" required showDataElements={showDataElements} value={draft.destinationCountry} onChange={(value) => update("destinationCountry", value)} invalid={issues.has("destinationCountry")} fieldKey="destinationCountry" highlighted={highlightedField === "destinationCountry"} options={countries} />
      <SelectField label={t("Inland transport mode")} dataElement="7/5" customsBox="26" required={direction === "import"} invalid={issues.has("inlandMode")} fieldKey="inlandMode" showDataElements={showDataElements} value={draft.inlandMode} onChange={(value) => update("inlandMode", value)} options={transportModes} />
      <SelectField label={t("Mode at border")} dataElement="7/4" customsBox="25" required showDataElements={showDataElements} value={draft.borderMode} fieldKey="borderMode" invalid={issues.has("borderMode")} highlighted={highlightedField === "borderMode"} onChange={(value) => update("borderMode", value)} options={transportModes} />
    </FieldGrid>
    </section>
    <section aria-labelledby="customs-border-transport-heading" className="min-w-0 border-t border-[var(--md-line)] pt-4">
      <h3 id="customs-border-transport-heading" className="mb-3 text-[13px] font-medium text-[var(--md-ink)]">{t(direction === "import" ? "Border and arrival transport" : "Border transport")}</h3>
    <FieldGrid className={transportFieldsClass}>
      <SelectField label={t("Border transport nationality")} dataElement="7/15" customsBox="21" required={direction === "import"} invalid={issues.has("borderNationality")} fieldKey="borderNationality" showDataElements={showDataElements} value={draft.borderNationality} onChange={(value) => update("borderNationality", value)} options={countries} />
      <TextField label={t("Border identification number")} dataElement="7/14" customsBox="21" showDataElements={showDataElements} value={draft.borderIdentificationNumber} onChange={(value) => update("borderIdentificationNumber", value)} />
      {direction === "import" ? <><SelectField label={t("Arrival transport type")} dataElement="7/9" customsBox="18" showDataElements={showDataElements} value={draft.arrivalIdentificationType} onChange={(value) => update("arrivalIdentificationType", value)} options={[["", t("Select type")], ...customsArrivalTransportTypes.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)]} fieldKey="arrivalIdentificationType" invalid={issues.has("arrivalIdentificationType")} /><TextField label={t("Transport ID")} dataElement="7/9" customsBox="18" showDataElements={showDataElements} value={draft.arrivalIdentificationNumber} onChange={(value) => update("arrivalIdentificationNumber", value)} /></> : <TextField label={t("Departure identification number")} dataElement="7/7" customsBox="18" showDataElements={showDataElements} value={draft.departureIdentificationNumber} onChange={(value) => update("departureIdentificationNumber", value)} />}
      {direction === "export" ? <SelectField label={t("Type of location")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationType} fieldKey="goodsLocationType" invalid={issues.has("goodsLocationType")} highlighted={highlightedField === "goodsLocationType"} onChange={(value) => update("goodsLocationType", value)} options={goodsLocationTypes} /> : null}
    </FieldGrid>
    </section>
    <section aria-labelledby="customs-goods-location-heading" className="min-w-0 border-t border-[var(--md-line)] pt-4">
      <h3 id="customs-goods-location-heading" className="mb-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Goods location and containers")}</h3>
    <FieldGrid className={transportFieldsClass}>
      <TextField label={t("Name of place")} dataElement="5/23" customsBox="30" showDataElements={showDataElements} value={draft.goodsLocationName} onChange={(value) => update("goodsLocationName", value)} />
      <TextField label={t("Goods location identifier")} dataElement="5/23" customsBox="30" required={direction === "import"} showDataElements={showDataElements} value={draft.goodsLocationIdentifier} onChange={(value) => update("goodsLocationIdentifier", value)} invalid={issues.has("goodsLocationIdentifier")} fieldKey="goodsLocationIdentifier" highlighted={highlightedField === "goodsLocationIdentifier"} />
      <SelectField label={t("Transported in container")} dataElement="7/2" customsBox="19" showDataElements={showDataElements} value={draft.isContainerised} fieldKey="isContainerised" invalid={issues.has("isContainerised")} highlighted={highlightedField === "isContainerised"} onChange={(value) => update("isContainerised", value)} options={containerIndicators} />
      {draft.isContainerised === "1" ? <><TextField label={t("Container ID")} dataElement="7/10" customsBox="31" required showDataElements={showDataElements} value={draft.containerId} onChange={(value) => update("containerId", value)} invalid={issues.has("containerId")} fieldKey="containerId" highlighted={highlightedField === "containerId"} /><TextField label={t("Seal identifier")} dataElement="7/18" customsBox="31" showDataElements={showDataElements} value={draft.sealIdentifier} onChange={(value) => update("sealIdentifier", value)} /></> : null}
    </FieldGrid>
    {draft.isContainerised === "1" ? <div className="mt-3 space-y-2">
      {(draft.additionalContainerIds ?? []).map((id, index) => <div key={index} className="flex max-w-sm items-end gap-2">
        <TextField label={t("Container ID") + " " + (index + 2)} dataElement="7/10" customsBox="31" showDataElements={showDataElements} value={id} onChange={(value) => update("additionalContainerIds", (draft.additionalContainerIds ?? []).map((current, i) => i === index ? value : current))} />
        <Button type="button" variant="ghost" onClick={() => update("additionalContainerIds", (draft.additionalContainerIds ?? []).filter((_, i) => i !== index))} aria-label={t("Remove container") + " " + (index + 2)}>{t("Remove")}</Button>
      </div>)}
      <Button type="button" variant="ghost" disabled={!draft.containerId} onClick={() => update("containerId", "")}>{t("Clear first container ID")}</Button>
      <Button type="button" variant="outline" disabled={!draft.containerId.trim() || (draft.additionalContainerIds ?? []).some((id) => !id.trim())} onClick={() => update("additionalContainerIds", [...(draft.additionalContainerIds ?? []), ""])}>{t("Add container ID")}</Button>
    </div> : null}
    </section>
    <section aria-labelledby="customs-gvms-heading" className="min-w-0 border-t border-[var(--md-line)] pt-4">
      <h3 id="customs-gvms-heading" className="mb-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Goods vehicle movement")}</h3>
      <FieldGrid className={transportFieldsClass}>
        <SelectField label={t("GVMS AI code")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={draft.gvmsCode} fieldKey="gvmsCode" invalid={issues.has("gvmsCode")} highlighted={highlightedField === "gvmsCode"} onChange={(value) => update("gvmsCode", value)} options={[["", t("Select code")], ["RRS01", "RRS01"]]} />
        <TextField label={t("GVMS AI code value (haulier EORI or name)")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={draft.gvmsValue} onChange={(value) => update("gvmsValue", value)} />
        {showOptional && direction === "export" ? <TextField label={t("Routing country")} showDataElements={showDataElements} value={draft.routingCountry} onChange={(value) => update("routingCountry", value)} /> : null}
      </FieldGrid>
    </section>
    </div>
  </SectionFrame>
}

function ImportAdjustmentsTable({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const rows = importAdjustmentsForDraft(draft)
  const isPredefined = (row: CustomsImportAdjustment) => ["import-vat", "import-freight", "import-insurance", "import-air"].includes(row.id)
  const currencies = useReferenceOptions("currency", t, "Select currency")
  const showBoxes = useContext(CustomsBoxVisibilityContext)
  const codeOptions = customsAdjustmentCodes.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)
  const change = (id: string, patch: Partial<CustomsImportAdjustment>) => update("importAdjustments", rows.map((row) => row.id === id ? { ...row, ...patch } : row))
  const fieldKey = (row: CustomsImportAdjustment, field: string) => `importAdjustments.${rows.indexOf(row)}.${field}`
  const invalid = (row: CustomsImportAdjustment, field: string) => issues.has(fieldKey(row, field))
  const cell = (row: CustomsImportAdjustment, field: string, content: ReactNode) => <div data-customs-field={fieldKey(row, field)} className={cn("rounded-[var(--md-radius-sm)]", highlightedField === fieldKey(row, field) && "ring-2 ring-[var(--md-accent)]")}>{content}</div>
  const columns: DataTableColumn<CustomsImportAdjustment>[] = [
    { id: "code", label: t("Code identifying"), width: 410, minWidth: 180, canHide: false, canPin: false, cell: (row) => cell(row, "code", isPredefined(row) ? <div aria-label={`${t("Predefined code")} ${row.code}`} title={t("Predefined code")} className={cn(customsSingleLineControlClass, "flex items-center gap-2 bg-[var(--md-surface-tint)] px-2 text-[var(--md-text)] shadow-[var(--md-shadow-line)]")}><LockKeyhole className="size-3 shrink-0" aria-hidden="true" /><span className="truncate font-medium">{row.code} · {t(customsAdjustmentCodes.find(([code]) => code === row.code)?.[1] ?? row.code)}</span></div> : <ItemTableSelect label={`${t("Code identifying")} ${rows.indexOf(row) + 1}`} value={row.code} onChange={(code) => change(row.id, { code })} options={codeOptions} showSelectedDescription invalid={invalid(row, "code")} />) },
    { id: "amount", label: t("Amount"), width: 180, minWidth: 115, kind: "number", canHide: false, canPin: false, cell: (row) => cell(row, "amount", <div className="relative"><Input aria-label={`${t(isPercentageAdjustment(row.code) ? "Percentage" : "Amount")} ${rows.indexOf(row) + 1}`} inputMode="decimal" value={row.amount} onChange={(event) => change(row.id, { amount: event.target.value })} aria-invalid={invalid(row, "amount") || undefined} className={cn(customsSingleLineControlClass, "bg-[var(--md-field-bg)] text-end tabular-nums", isPercentageAdjustment(row.code) && "pe-7")} />{isPercentageAdjustment(row.code) ? <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--md-subtle)]">%</span> : null}</div>) },
    { id: "currency", label: t("Currency code"), width: 150, minWidth: 100, canHide: false, canPin: false, cell: (row) => cell(row, "currency", isPercentageAdjustment(row.code) ? <span className="px-2 text-[11px] text-[var(--md-subtle)]">{t("Not required for %")}</span> : <ItemTableSelect label={`${t("Currency code")} ${rows.indexOf(row) + 1}`} value={row.currency} onChange={(currency) => change(row.id, { currency })} options={currencies} invalid={invalid(row, "currency")} />) },
    { id: "actions", label: t("Actions"), width: 48, minWidth: 48, kind: "actions", canHide: false, canPin: false, cell: (row) => isPredefined(row) ? null : <Button type="button" variant="ghost" size="icon" aria-label={`${t("Remove addition or deduction")} ${rows.indexOf(row) + 1}`} onClick={() => update("importAdjustments", rows.filter((candidate) => candidate.id !== row.id))} className="text-[var(--md-subtle)] hover:text-[var(--md-red)]"><Trash2 className="size-3.5" /></Button> },
  ]
  return <section aria-labelledby="customs-import-adjustments-heading" data-customs-field="importAdjustments" className="mt-5 min-w-0 border-t border-[var(--md-line)] pt-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><h3 id="customs-import-adjustments-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Additions and deductions")}</h3>{showDataElements ? <span className="text-[10px] tabular-nums text-[var(--md-blue)]" aria-label="Data element 4/9" title="Data element 4/9">4/9</span> : null}{showBoxes ? <span className="text-[10px] tabular-nums text-[var(--md-accent)]" aria-label="Customs box 45" title="Customs box 45">45</span> : null}</div>
    </div>
    <p className="mb-2 text-[11px] text-[var(--md-subtle)] sm:hidden">{t("Scroll across the table to see every field.")}</p>
    <DataTable ariaLabel={t("Additions and deductions")} rows={rows} columns={columns} getRowKey={(row) => row.id} minimumWidth={440} showToolbar={false} showColumnManager={false} enableSelectionExport={false} tableClassName="table-fixed" className="shadow-none" emptyState={<span>{t("No additions or deductions. Add a row when needed.")}</span>} />
    <div className="mt-2 flex justify-start">
      <Button type="button" variant="outline" size="sm" disabled={rows.length >= 99} onClick={() => update("importAdjustments", [...rows, { id: repeatableCustomsEntryId("import-adjustment"), code: "", amount: "", currency: "" }])}><Plus className="size-3.5" />{t("Add row")}</Button>
    </div>
    <p className="mt-2 text-[11px] leading-4 text-[var(--md-subtle)]">{t("Leave unused rows blank. Enter each cost once; the selected code determines how it is applied across goods items.")}</p>
  </section>
}

function ImportTaxPartiesTable({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const rows = importFiscalParties(draft.domesticDutyTaxParties)
  const customerValue = draft.importerVatNumber ?? ""
  const change = (id: string, patch: Partial<ImportFiscalParty>) => update("domesticDutyTaxParties", rows.map((row) => row.id === id ? { ...row, ...patch } : row))
  const fieldKey = (row: ImportFiscalParty, field: string) => `domesticDutyTaxParties.${rows.indexOf(row)}.${field}`
  const cell = (row: ImportFiscalParty, field: string, content: ReactNode) => <div data-customs-field={fieldKey(row, field)} className={cn("rounded-[var(--md-radius-sm)]", highlightedField === fieldKey(row, field) && "ring-2 ring-[var(--md-accent)]")}>{content}</div>
  const columns: DataTableColumn<ImportFiscalParty>[] = [
    { id: "partyId", label: t("Domestic duty tax party"), width: 300, minWidth: 160, canHide: false, canPin: false, cell: (row) => cell(row, "partyId", <div className="space-y-1.5"><div className="flex items-center gap-2"><Checkbox aria-label={`${t("Use customer")} ${rows.indexOf(row) + 1}`} checked={Boolean(row.useCustomer)} onCheckedChange={(checked) => change(row.id, { useCustomer: checked === true })} /><span className="text-[11px] text-[var(--md-text)]">{t("Use customer")}</span></div><Input aria-label={`${t("Domestic duty tax party")} ${rows.indexOf(row) + 1}`} placeholder={row.useCustomer ? t("Customer VAT number") : t("VAT identifier")} value={row.useCustomer ? customerValue : row.partyId} readOnly={row.useCustomer} maxLength={17} onChange={(event) => change(row.id, { partyId: event.target.value })} aria-invalid={issues.has(fieldKey(row, "partyId")) || undefined} className={cn(customsSingleLineControlClass, "bg-[var(--md-field-bg)]", row.useCustomer && "cursor-not-allowed opacity-75")} /></div>) },
    { id: "roleCode", label: t("Role"), width: 360, minWidth: 180, canHide: false, canPin: false, cell: (row) => cell(row, "roleCode", <ItemTableSelect label={`${t("Tax party role")} ${rows.indexOf(row) + 1}`} value={row.roleCode} onChange={(roleCode) => change(row.id, { roleCode })} options={[["", t("Select role")], ...customsFiscalRoles.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)]} showSelectedDescription invalid={issues.has(fieldKey(row, "roleCode"))} />) },
    { id: "actions", label: t("Actions"), width: 48, minWidth: 48, kind: "actions", canHide: false, canPin: false, cell: (row) => <Button type="button" variant="ghost" size="icon" aria-label={`${t("Remove tax party")} ${rows.indexOf(row) + 1}`} onClick={() => update("domesticDutyTaxParties", rows.filter((candidate) => candidate.id !== row.id))} className="text-[var(--md-subtle)] hover:text-[var(--md-red)]"><Trash2 className="size-3.5" /></Button> },
  ]
  return <section aria-labelledby="customs-import-tax-parties-heading" data-customs-field="domesticDutyTaxParties" className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
    <div className="mb-3 flex items-center gap-2"><h3 id="customs-import-tax-parties-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Domestic duty tax parties")}</h3>{showDataElements ? <span className="text-[10px] text-[var(--md-blue)]" aria-label="Data element 3/40" title="Data element 3/40">3/40</span> : null}</div>
    <p className="mb-2 text-[11px] text-[var(--md-subtle)] sm:hidden">{t("Scroll across the table to see every field.")}</p>
    <DataTable ariaLabel={t("Domestic duty tax parties")} rows={rows} columns={columns} getRowKey={(row) => row.id} minimumWidth={420} showToolbar={false} showColumnManager={false} enableSelectionExport={false} tableClassName="table-fixed" className="shadow-none" emptyState={<span>{t("No domestic duty tax parties. Add a row when needed.")}</span>} />
    <Button type="button" variant="outline" size="sm" className="mt-2" disabled={rows.length >= 99} onClick={() => update("domesticDutyTaxParties", [...rows, { id: repeatableCustomsEntryId("header-tax-party"), partyId: "", roleCode: "" }])}><Plus className="size-3.5" />{t("Add domestic duty tax party")}</Button>
    {rows.some(row => row.useCustomer) && !customerValue ? <p role="alert" className="mt-1 text-[11px] text-[var(--md-red)]">{t("Add a VAT number in the company’s Customs settings, or turn off Use customer to enter it manually.")}</p> : null}
  </section>
}

function ImportLoadingLocationField({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const [options, setOptions] = useState<CompactComboboxOption[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    loadIataDirectory().then(records => {
      if (active) setOptions(records.map(([code, name, city, country]) => ({ value: code, label: `${code} · ${name}`, keywords: [city, country] })))
    }).catch(() => { if (active) setFailed(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  return <FieldShell asDiv label={t("Loading location ID")} dataElement="5/21" showDataElements={showDataElements} invalid={issues.has("loadingLocationId")} highlighted={highlightedField === "loadingLocationId"} fieldKey="loadingLocationId" className="min-w-0 basis-full sm:basis-[280px] sm:grow">
    <CompactCombobox label={t("Loading location ID")} value={draft.loadingLocationId ?? ""} options={options} onValueChange={value => update("loadingLocationId", value.toUpperCase().slice(0, 35))} onOptionSelect={option => update("loadingLocationId", option.value)} placeholder={t(loading ? "Loading airports — or type a code" : "Search airport or type a code")} allLabel={t("IATA airports")} emptyLabel={t(failed ? "Airport list unavailable — enter a code manually" : "No matching airport — use your own code")} width="full" invalid={issues.has("loadingLocationId")} className="[&>div:first-child]:sr-only [&_input]:h-8 [&_input]:text-[11px]" />
  </FieldShell>
}

function ImportGuaranteesTable({ draft, update, showDataElements, issues, highlightedField, t }: SectionProps) {
  const rows = guaranteesForDraft(draft)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const change = (id: string, patch: Partial<CustomsGuarantee>) => update("guarantees", rows.map(row => row.id === id ? { ...row, ...patch } : row))
  const key = (row: CustomsGuarantee, field: string) => `guarantees.${rows.indexOf(row)}.${field}`
  const rowErrors = guaranteeErrors(draft).filter(error => issues.has(error.field))
  const expanded = (row: CustomsGuarantee) => expandedId === row.id || Boolean(highlightedField?.startsWith(`guarantees.${rows.indexOf(row)}.`))
  const columns: DataTableColumn<CustomsGuarantee>[] = [
    { id: "details", label: "", width: 36, minWidth: 36, canHide: false, canPin: false, cell: row => <Button type="button" variant="ghost" size="icon" aria-label={`${t(expanded(row) ? "Collapse guarantee" : "Expand guarantee")} ${rows.indexOf(row) + 1}`} aria-expanded={expanded(row)} aria-controls={`guarantee-details-${row.id}`} onClick={() => setExpandedId(expanded(row) ? null : row.id)}><ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded(row) && "rotate-180")} /></Button> },
    { id: "type", label: t("Guarantee type"), width: 180, minWidth: 130, canHide: false, canPin: false, cell: row => <div data-customs-field={key(row, "type")}><ItemTableSelect label={`${t("Guarantee type")} ${rows.indexOf(row) + 1}`} value={row.type} onChange={type => change(row.id, { type })} options={customsGuaranteeTypes.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)} showSelectedDescription invalid={issues.has(key(row, "type"))} /></div> },
    { id: "grn", label: "GRN", width: 150, minWidth: 100, canHide: false, canPin: false, cell: row => <div data-customs-field={key(row, "grn")}><Input aria-label={`GRN ${rows.indexOf(row) + 1}`} value={row.grn} onChange={event => change(row.id, { grn: event.target.value })} className={cn(customsSingleLineControlClass, "bg-[var(--md-field-bg)]")} /></div> },
    { id: "amount", label: t("Amount"), width: 100, minWidth: 90, kind: "number", canHide: false, canPin: false, cell: row => <button type="button" onClick={() => setExpandedId(row.id)} className="min-h-8 w-full text-end text-[11px] tabular-nums" aria-label={`${t("Edit guarantee amount")} ${rows.indexOf(row) + 1}`}>{row.amount ? `${row.amount} ${row.currency}` : t("Add details")}</button> },
    { id: "actions", label: t("Actions"), width: 40, minWidth: 40, kind: "actions", canHide: false, canPin: false, cell: row => <Button type="button" variant="ghost" size="icon" aria-label={`${t("Remove guarantee")} ${rows.indexOf(row) + 1}`} onClick={() => update("guarantees", rows.filter(candidate => candidate.id !== row.id))} className="text-[var(--md-subtle)] hover:text-[var(--md-red)]"><Trash2 className="size-3.5" /></Button> },
  ]
  const currencies = useReferenceOptions("currency", t, "Select currency")
  return <section aria-labelledby="customs-guarantees-heading" data-customs-field="guarantees" className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
    <div className="mb-3 flex items-center gap-2"><h3 id="customs-guarantees-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Guarantees")}</h3>{showDataElements ? <span className="text-[10px] text-[var(--md-blue)]" aria-label="Data elements 8/2 and 8/3" title="Data elements 8/2 and 8/3">8/2 · 8/3</span> : null}</div>
    <p className="mb-2 text-[11px] text-[var(--md-subtle)] sm:hidden">{t("Scroll across the table to see every field.")}</p>
    <DataTable ariaLabel={t("Guarantees")} rows={rows} columns={columns} getRowKey={row => row.id} minimumWidth={440} showToolbar={false} showColumnManager={false} enableSelectionExport={false} tableClassName="table-fixed" className="shadow-none" emptyState={<span>{t("No guarantees. Add one when required.")}</span>} renderAfterRow={(row, columnCount) => expanded(row) ? <tr><td colSpan={columnCount} className="bg-[var(--md-surface-soft)] p-3"><div id={`guarantee-details-${row.id}`} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {([ ["guaranteeId", "Guarantee ID"], ["accessCode", "Access code"], ["office", "Customs office of guarantee"], ["amount", "Amount of import duty and other charges"] ] as const).map(([field, label]) => <TextField key={field} label={t(label)} dataElement="8/3" customsBox="44" showDataElements={showDataElements} value={row[field]} onChange={value => change(row.id, { [field]: field === "office" ? value.toUpperCase() : value })} invalid={issues.has(key(row, field))} fieldKey={key(row, field)} highlighted={highlightedField === key(row, field)} />)}
      <SelectField label={t("Currency code")} dataElement="8/3" customsBox="44" showDataElements={showDataElements} value={row.currency} onChange={currency => change(row.id, { currency })} options={currencies} invalid={issues.has(key(row, "currency"))} fieldKey={key(row, "currency")} highlighted={highlightedField === key(row, "currency")} />
    </div></td></tr> : null} />
    <Button type="button" variant="outline" size="sm" className="mt-2" disabled={rows.length >= 99} onClick={() => { const row = emptyCustomsGuarantee(repeatableCustomsEntryId("guarantee")); update("guarantees", [...rows, row]); setExpandedId(row.id) }}><Plus className="size-3.5" />{t("Add guarantee")}</Button>
    {rowErrors.map(error => <p key={error.field} role="alert" className="mt-2 text-[11px] text-[var(--md-red)]">{t(error.message)}</p>)}
  </section>
}

function DocumentsSection({ draft, update, showDataElements, showOptional, issues, highlightedField, t }: SectionProps & { showOptional: boolean }) {
  const direction = useContext(CustomsDirectionContext)
  const previousDocumentCategories = useReferenceOptions("previous_document_category", t, "Select category")
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t, "Select document type")
  return <SectionFrame title={t(direction === "import" ? "Import terms" : "Documents and customs offices")} description={direction === "import" ? undefined : t("Previous documents, controlling offices and guarantees.")}>
    {direction === "export" ? <>
    <FieldGrid>
      {direction === "export" ? <><SelectField label={t("Previous document category")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentCategory} onChange={(value) => update("previousDocumentCategory", value)} options={previousDocumentCategories} /><SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentType} onChange={(value) => update("previousDocumentType", value)} options={previousDocumentTypes} /><TextField label={t("Document reference")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={draft.previousDocumentReference} onChange={(value) => update("previousDocumentReference", value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 35))} invalid={issues.has("previousDocumentReference")} fieldKey="previousDocumentReference" highlighted={highlightedField === "previousDocumentReference"} maxLength={35} /></> : null}
      <TextField label={t("Additional information code")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={draft.headerAdditionalInformationCode} onChange={(value) => update("headerAdditionalInformationCode", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} invalid={issues.has("headerAdditionalInformationCode")} fieldKey="headerAdditionalInformationCode" highlighted={highlightedField === "headerAdditionalInformationCode"} maxLength={5} />
      <TextField label={t("Additional information description")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={draft.headerAdditionalInformationDescription} onChange={(value) => update("headerAdditionalInformationDescription", value.slice(0, 512))} invalid={issues.has("headerAdditionalInformationDescription")} fieldKey="headerAdditionalInformationDescription" highlighted={highlightedField === "headerAdditionalInformationDescription"} maxLength={512} />
      {direction === "export" ? <TextField label={t("Customs office of exit")} dataElement="5/12" customsBox="29" required showDataElements={showDataElements} value={draft.exitOffice} onChange={(value) => update("exitOffice", value)} invalid={issues.has("exitOffice")} fieldKey="exitOffice" highlighted={highlightedField === "exitOffice"} /> : null}
      {showOptional && direction === "export" ? <><TextField label={t("Supervising office")} dataElement="5/27" showDataElements={showDataElements} value={draft.supervisingOffice} onChange={(value) => update("supervisingOffice", value)} /><TextField label={t("Customs office of presentation")} dataElement="5/26" showDataElements={showDataElements} value={draft.presentationOffice} onChange={(value) => update("presentationOffice", value)} /><TextField label={t("Warehouse type")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseType} onChange={(value) => update("warehouseType", value)} /><TextField label={t("Warehouse identifier")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseIdentifier} onChange={(value) => update("warehouseIdentifier", value)} /><TextField label={t("Guarantee type")} dataElement="8/2" customsBox="52" showDataElements={showDataElements} value={draft.guaranteeType} onChange={(value) => update("guaranteeType", value)} /><TextField label={t("GRN or guarantee ID")} dataElement="8/3" customsBox="52" showDataElements={showDataElements} value={draft.guaranteeReference} onChange={(value) => update("guaranteeReference", value)} /></> : null}
    </FieldGrid>
    </> : null}
    {direction === "import" ? <>
      <FieldGrid>
        <ImportLoadingLocationField draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} />
      </FieldGrid>
      <ImportAdjustmentsTable draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} />
      <div className="customs-representation mt-5 border-t border-[var(--md-line)] pt-4"><RepresentationFields draft={draft} update={update} showDataElements={showDataElements} showOptional={showOptional} issues={issues} highlightedField={highlightedField} t={t} /></div>
      <section aria-labelledby="customs-warehouse-heading" className="mt-5 min-w-0 border-t border-[var(--md-line)] pt-4">
        <h3 id="customs-warehouse-heading" className="mb-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Warehouse and supervision")}</h3>
        <FieldGrid className="!grid-cols-1 sm:!grid-cols-2 xl:!grid-cols-3">
        <SelectField label={t("Supervising office")} dataElement="5/27" showDataElements={showDataElements} value={draft.supervisingOffice} onChange={(value) => update("supervisingOffice", value)} options={[["", t("Select office")], ...customsOffices.map((office) => [office.value, office.label] as const)]} invalid={issues.has("supervisingOffice")} fieldKey="supervisingOffice" highlighted={highlightedField === "supervisingOffice"} />
        <SelectField label={t("Warehouse type")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseType} onChange={(value) => update("warehouseType", value)} options={[["", t("Select type")], ...customsWarehouseTypes.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)]} invalid={issues.has("warehouseType")} fieldKey="warehouseType" highlighted={highlightedField === "warehouseType"} />
        <TextField label={t("Warehouse identifier")} dataElement="2/7" customsBox="49" showDataElements={showDataElements} value={draft.warehouseIdentifier} onChange={(value) => update("warehouseIdentifier", value)} maxLength={35} invalid={issues.has("warehouseIdentifier")} fieldKey="warehouseIdentifier" highlighted={highlightedField === "warehouseIdentifier"} />
        </FieldGrid>
      </section>
      <div className="mt-5 grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <ImportTaxPartiesTable draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} />
        <ImportGuaranteesTable draft={draft} update={update} showDataElements={showDataElements} issues={issues} highlightedField={highlightedField} t={t} />
      </div>
      <section aria-labelledby="customs-additional-information-heading" className="mt-5 min-w-0 border-t border-[var(--md-line)] pt-4">
        <h3 id="customs-additional-information-heading" className="mb-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Additional information")}</h3>
        <FieldGrid className="!grid-cols-1 sm:!grid-cols-2">
      <TextField label={t("Additional information code")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={draft.headerAdditionalInformationCode} onChange={(value) => update("headerAdditionalInformationCode", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} invalid={issues.has("headerAdditionalInformationCode")} fieldKey="headerAdditionalInformationCode" highlighted={highlightedField === "headerAdditionalInformationCode"} maxLength={5} />
      <TextField label={t("Additional information description")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={draft.headerAdditionalInformationDescription} onChange={(value) => update("headerAdditionalInformationDescription", value.slice(0, 512))} invalid={issues.has("headerAdditionalInformationDescription")} fieldKey="headerAdditionalInformationDescription" highlighted={highlightedField === "headerAdditionalInformationDescription"} maxLength={512} />
        </FieldGrid>
      </section>
    </> : null}
  </SectionFrame>
}

function InvoiceNumberSelect({ headers, value, onChange, label, invalid, t }: { headers: CustomsInvoiceHeader[]; value?: string; onChange: (value: string) => void; label: string; invalid?: boolean; t: (text: string) => string }) {
  const options = headers.filter(header => header.invoiceNumber.trim())
  const selected = headers.find(header => header.id === value)
  return <Select value={selected?.id ?? ""} onValueChange={onChange} disabled={!options.length}>
    <SelectTrigger aria-label={label} aria-invalid={invalid || undefined} className={cn(customsSingleLineControlClass, "w-full min-w-0 text-[11px]")}><SelectValue placeholder={t(options.length ? "Select invoice" : "Add invoice header first")}>{selected?.invoiceNumber || undefined}</SelectValue></SelectTrigger>
    <SelectContent>{options.map(header => <SelectItem key={header.id} value={header.id}>{header.invoiceNumber}</SelectItem>)}</SelectContent>
  </Select>
}

function InvoiceHeadersSection({ draft, onChange, onConversionDateChange, onImport, t }: { draft: StandaloneExportDraft; onChange: (headers: CustomsInvoiceHeader[]) => void; onConversionDateChange: (date: string) => void; onImport?: () => void; t: (text: string) => string }) {
  const headers = draft.invoiceHeaders ?? []
  const inputClass = cn(customsSingleLineControlClass, "w-full bg-[var(--md-surface-tint)] px-2 text-[11px]")
  const [placeOptions, setPlaceOptions] = useState<CompactComboboxOption[]>([])
  const [placeError, setPlaceError] = useState("")
  const headerRef = useRef({ headers, onChange })
  headerRef.current = { headers, onChange }
  const placesKey = headers.map(header => `${header.id}:${header.tradeTermsLocation}`).join("|")
  useEffect(() => {
    let active = true
    void loadUnlocodeDirectory().then(records => {
      if (!active) return
      setPlaceError("")
      setPlaceOptions(records.map(([country, location, name, plainName]) => ({ value: country + location, label: `${country}${location} · ${name}`, keywords: [name, plainName, country] })))
      let changed = false
      const next = headerRef.current.headers.map(header => {
        const code = resolveInvoiceAgreedPlace(header.tradeTermsLocation, records)
        if (!code || code === header.tradeTermsLocation) return header
        changed = true
        return { ...header, tradeTermsLocation: code, tradeTermsLocationSource: header.tradeTermsLocationSource || header.tradeTermsLocation }
      })
      if (changed) headerRef.current.onChange(next)
    }).catch(() => { if (active) setPlaceError("UN/LOCODE locations could not be loaded. Reload to try again; your agreed place is retained.") })
    return () => { active = false }
  }, [placesKey])
  const currencies = useReferenceOptions("currency", t)
  const packageKinds = useReferenceOptions("package_kind", t)
  const transactionNatures = useReferenceOptions("transaction_nature", t)
  const errors = [...customsInvoiceErrors(draft, false).filter(error => error.field.startsWith("invoiceHeaders")), ...customsInvoiceProjectionErrors(draft)]
  const sharedInvoiceFields = { currency: "Currency", exchangeRate: "HMRC exchange rate", tradeTerms: "Incoterms", tradeTermsLocation: "Agreed place for Incoterms", transactionNature: "Nature of transaction" } as const
  const conflictingFields = (Object.keys(sharedInvoiceFields) as (keyof typeof sharedInvoiceFields)[]).filter(field => errors.some(error => error.field === `invoiceHeaders.${field}`))
  const remainingErrors = errors.filter(error => !conflictingFields.some(field => error.field === `invoiceHeaders.${field}`))
  const summary = resolveCustomsInvoiceDeclaration(draft)
  const conversionDate = draft.customsConversionDate || customsToday()
  useEffect(() => { if (!draft.customsConversionDate) onConversionDateChange(conversionDate) }, [draft.customsConversionDate, conversionDate, onConversionDateChange])
  const [ratesBusy, setRatesBusy] = useState(false)
  const [ratesError, setRatesError] = useState("")
  const [ratesRefresh, setRatesRefresh] = useState(0)
  const [refreshDate, setRefreshDate] = useState<string | null>(null)
  const lookupDate = refreshDate || conversionDate
  const latest = useRef({ headers, onChange, onConversionDateChange, conversionDate })
  latest.current = { headers, onChange, onConversionDateChange, conversionDate }
  const currencyKey = [...new Set(headers.map(header => header.currency).filter(currency => currency && currency !== "GBP"))].sort().join(",")
  useEffect(() => {
    setRatesError("")
    if (!currencyKey || !validCustomsConversionDate(conversionDate)) { setRatesBusy(false); return }
    const controller = new AbortController()
    setRatesBusy(true)
    fetchHmrcMonthlyRates(lookupDate, controller.signal).then(payload => {
      if (controller.signal.aborted || latest.current.conversionDate !== conversionDate) return
      const errors: string[] = []
      const rates = new Map(currencyKey.split(",").flatMap(currency => {
        try { return [[currency, selectHmrcExchangeRate(payload, currency, lookupDate, new Date().toISOString())] as const] }
        catch (error) { errors.push(error instanceof Error ? error.message : "HMRC rate unavailable."); return [] }
      }))
      if (errors.length) { setRatesError(errors.join(" ")); return }
      let changed = false
      const next = latest.current.headers.map(header => {
        const rate = rates.get(header.currency)
        if (!rate) return header
        const old = header.hmrcExchangeRate
        if (old?.conversionDate === rate.conversionDate && old.currency === rate.currency && old.rate === rate.rate && old.validFrom === rate.validFrom && old.validTo === rate.validTo && header.exchangeRate === rate.rate) return header
        changed = true
        return { ...header, exchangeRate: rate.rate, hmrcExchangeRate: rate }
      })
      if (changed) latest.current.onChange(next)
      if (conversionDate !== lookupDate) latest.current.onConversionDateChange(lookupDate)
      setRatesError("")
    }).catch(error => { if (!controller.signal.aborted) setRatesError(error instanceof Error ? error.message : "HMRC rates are unavailable. Try again.") })
      .finally(() => { if (!controller.signal.aborted) setRatesBusy(false) })
    return () => controller.abort()
  }, [conversionDate, lookupDate, currencyKey, ratesRefresh])

  const change = (id: string, patch: Partial<CustomsInvoiceHeader>) => onChange(headers.map(header => header.id === id ? { ...header, ...patch, extractedFields: header.extractedFields?.filter(field => !(field in patch)), ...(patch.currency !== undefined && patch.currency !== header.currency ? { exchangeRate: "", hmrcExchangeRate: undefined } : {}) } : header))
  const count = (header: CustomsInvoiceHeader) => draft.items.filter(item => item.invoiceHeaderId === header.id).length
  const fieldKey = (header: CustomsInvoiceHeader, field: string) => `invoiceHeaders.${headers.indexOf(header)}.${field}`
  const invalid = (header: CustomsInvoiceHeader, field: string) => errors.some(error => error.field === fieldKey(header, field))
  const input = (header: CustomsInvoiceHeader, field: "invoiceNumber" | "invoiceDate" | "totalAmount" | "exchangeRate" | "tradeTermsLocation" | "grossMass" | "netMass" | "letterOfCreditExchangeRate" | "packageCount", label: string) => <div data-customs-field={fieldKey(header, field)}><AutoPopulatedInput autoPopulated={Boolean(header.extractedFields?.includes(field))} autoPopulationEvent={header.extractionAppliedAt} autoPopulationDescription={t("Extracted from this invoice. Check against the source document.")} aria-label={`${t(label)} ${headers.indexOf(header) + 1}`} aria-invalid={invalid(header, field) || undefined} className={cn(inputClass, invalid(header, field) && "ring-1 ring-[var(--md-red)]")} value={header[field] ?? ""} type={field === "invoiceDate" ? "date" : "text"} inputMode={field === "packageCount" ? "numeric" : ["totalAmount", "exchangeRate", "letterOfCreditExchangeRate", "grossMass", "netMass"].includes(field) ? "decimal" : undefined} maxLength={field === "invoiceNumber" || field === "tradeTermsLocation" ? 35 : undefined} onChange={event => change(header.id, { [field]: event.target.value })} /></div>
  const columns: DataTableColumn<CustomsInvoiceHeader>[] = ([
    { id: "invoiceNumber", label: t("Invoice number"), width: 220, minWidth: 160, canHide: false, cell: header => input(header, "invoiceNumber", "Invoice number") },
    { id: "invoiceDate", label: t("Invoice date (optional)"), width: 170, minWidth: 150, cell: header => input(header, "invoiceDate", "Invoice date") },
    { id: "currency", label: t("Currency"), width: 130, minWidth: 100, cell: header => <div data-customs-field={fieldKey(header, "currency")}><ItemTableSelect label={`${t("Invoice currency")} ${headers.indexOf(header) + 1}`} value={header.currency} onChange={currency => change(header.id, { currency })} options={currencies} invalid={invalid(header, "currency")} /></div> },
    { id: "totalAmount", label: t("Invoice amount"), width: 180, minWidth: 140, kind: "number", cell: header => input(header, "totalAmount", "Invoice amount") },
    { id: "exchangeRate", label: t("HMRC exchange rate"), width: 195, minWidth: 155, kind: "number", cell: header => <div data-customs-field={fieldKey(header, "exchangeRate")}><AutoPopulatedInput aria-label={`${t("Invoice exchange rate")} ${headers.indexOf(header) + 1}`} readOnly value={header.currency === "GBP" ? "" : header.exchangeRate} placeholder={t(header.currency === "GBP" ? "No conversion (GBP)" : ratesBusy ? "Loading HMRC rate…" : "HMRC rate unavailable")} className={inputClass} autoPopulated={Boolean(header.hmrcExchangeRate)} autoPopulationEvent={header.hmrcExchangeRate ? Date.parse(header.hmrcExchangeRate.fetchedAt) : undefined} autoPopulationDescription={header.hmrcExchangeRate ? `HMRC: 1 GBP = ${header.exchangeRate} ${header.currency}. ${header.hmrcExchangeRate.validFrom} to ${header.hmrcExchangeRate.validTo}.` : undefined} /></div> },
    { id: "tradeTerms", label: t("Incoterms"), width: 130, minWidth: 95, cell: header => <ItemTableSelect label={`${t("Invoice Incoterms")} ${headers.indexOf(header) + 1}`} value={header.tradeTerms ?? ""} onChange={tradeTerms => change(header.id, { tradeTerms })} options={customsTradeTerms} invalid={invalid(header, "tradeTerms")} /> },
    { id: "tradeTermsLocation", label: t("Agreed place for Incoterms"), width: 220, minWidth: 150, cell: header => <div data-customs-field={fieldKey(header, "tradeTermsLocation")}><CompactCombobox label={`${t("Agreed place UN/LOCODE")} ${headers.indexOf(header) + 1}`} value={header.tradeTermsLocation} options={placeOptions} onValueChange={value => change(header.id, { tradeTermsLocation: value })} onOptionSelect={option => change(header.id, { tradeTermsLocation: option.value })} placeholder={t("Search place or UN/LOCODE")} allLabel={t("UN/LOCODE locations")} emptyLabel={t("No match. Check the place and country.")} invalid={invalid(header, "tradeTermsLocation")} width="full" className="grid-cols-1 [&_input]:h-8 [&_input]:text-[11px]" /></div> },
    { id: "transactionNature", label: t("Nature of transaction"), width: 175, minWidth: 120, cell: header => <ItemTableSelect label={`${t("Invoice nature of transaction")} ${headers.indexOf(header) + 1}`} value={header.transactionNature ?? ""} onChange={transactionNature => change(header.id, { transactionNature })} options={transactionNatures} invalid={invalid(header, "transactionNature")} /> },
    { id: "grossMass", label: t("Invoice gross weight (kg)"), width: 175, minWidth: 110, kind: "number", cell: header => input(header, "grossMass", "Invoice gross weight") },
    { id: "netMass", label: t("Invoice net weight (kg)"), width: 175, minWidth: 110, kind: "number", cell: header => input(header, "netMass", "Invoice net weight") },
    { id: "letterOfCreditExchangeRate", label: t("Letter of credit exchange rate"), width: 210, minWidth: 140, kind: "number", cell: header => input(header, "letterOfCreditExchangeRate", "Letter of credit exchange rate") },
    { id: "packageCount", label: t("Number of packages"), width: 155, minWidth: 100, kind: "number", cell: header => input(header, "packageCount", "Invoice number of packages") },
    { id: "packageKind", label: t("Package type"), width: 135, minWidth: 90, cell: header => <ItemTableSelect label={`${t("Invoice package type")} ${headers.indexOf(header) + 1}`} value={header.packageKind ?? ""} onChange={packageKind => change(header.id, { packageKind })} options={packageKinds} /> },
    { id: "items", label: t("Linked items"), width: 100, minWidth: 85, kind: "number", cell: header => <span>{count(header)}</span> },
    { id: "actions", label: t("Actions"), width: 64, minWidth: 64, canHide: false, cell: header => <Button type="button" variant="ghost" size="icon" aria-label={`${t("Remove invoice")} ${header.invoiceNumber || headers.indexOf(header) + 1}`} title={t(count(header) ? "Move linked items to another invoice before removing this header." : "Remove invoice")} disabled={count(header) > 0} onClick={() => onChange(headers.filter(candidate => candidate.id !== header.id))}><Trash2 className="size-3.5" /></Button> },
  ] satisfies DataTableColumn<CustomsInvoiceHeader>[]).map(column => ({
    ...column,
    canPin: column.id !== "actions",
    resizable: column.id !== "actions",
    sortValue: header => { const value = header[column.id as keyof CustomsInvoiceHeader]; return column.id === "items" ? count(header) : column.id === "actions" ? null : typeof value === "string" ? (column.kind === "number" && value && Number.isFinite(Number(value)) ? Number(value) : value) : null },
    headerClassName: "border-e border-[var(--md-line)] last:border-e-0",
    cellClassName: "border-e border-[var(--md-line)] last:border-e-0",
  }))
  return <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--md-line)] px-4 py-3">
      <div className="min-w-0"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Invoice header")}</h2></div>
      <div className="flex flex-wrap gap-2">{onImport ? <Button type="button" variant="outline" size="sm" onClick={onImport}><ScanText className="size-3.5" />{t("Import invoice")}</Button> : null}<Button type="button" size="sm" onClick={() => onChange([...headers, { ...emptyCustomsInvoiceHeader(crypto.randomUUID()), currency: summary.currency }])}><Plus className="size-3.5" />{t("Add invoice header")}</Button></div>
    </header>
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--md-line)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="customs-conversion-date" className="text-[11px] font-medium">{t("Estimate date")}</label><Input id="customs-conversion-date" type="date" value={conversionDate} readOnly className={cn(customsSingleLineControlClass, "w-[165px]")} /></div>
      <Button type="button" variant="outline" size="sm" className={customsSingleLineControlClass} disabled={!currencyKey || !validCustomsConversionDate(conversionDate) || ratesBusy} onClick={() => { setRefreshDate(customsToday()); setRatesRefresh(value => value + 1) }}>{ratesBusy ? <DotGridLoader className="size-3.5" /> : <RefreshCw className="size-3.5" />}{t("Refresh HMRC rates")}</Button>
    </div>
    {placeError ? <p role="alert" className="px-4 py-2 text-[11px] text-[var(--md-red)]">{t(placeError)}</p> : null}
    {ratesError ? <p role="alert" className="px-4 py-2 text-[11px] text-[var(--md-red)]">{t(ratesError)}</p> : null}
    {draft.direction === "import" && !headers.length ? <div className="flex min-h-44 flex-col items-center justify-center gap-2 px-6 py-8 text-center"><FileText className="size-6 text-[var(--md-subtle)]" aria-hidden="true" /><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Add your first invoice")}</p><p className="max-w-sm text-[12px] leading-5 text-[var(--md-text)]">{t("Import a commercial invoice or add its header above, then link the goods items to it.")}</p></div> : <DataTable ariaLabel={t("Invoice headers")} rows={headers} columns={columns} getRowKey={header => header.id} storageKey={`customs-${draft.direction}-invoice-headers`} minimumWidth={800} showToolbar showColumnManager exportConfig={{ fileName: `${draft.direction}-invoice-headers`, recordCategory: "Invoice header" }} tableClassName="table-fixed" className="rounded-none shadow-none" emptyState={<span>{t("No invoice headers yet. Add one or import a commercial invoice.")}</span>} />}
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--md-line)] px-4 py-3 text-[11px] text-[var(--md-text)]" aria-label={t("Derived declaration totals")}><span>{t("Declaration amount")}: {summary.currency && summary.totalAmount ? `${summary.currency} ${summary.totalAmount}` : t("Complete invoice amounts and a shared currency")}</span><span>{t("Gross weight")}: {summary.totalGrossMass || "–"} kg</span><span>{t("Net weight")}: {summary.totalNetMass || "–"} kg</span><span>{t("Packages")}: {summary.totalPackages || "–"}</span></div>
    {draft.invoiceLegacySummary ? <p className="px-4 pb-3 text-[11px] text-[var(--md-amber)]">{t("Earlier declaration totals retained for reconciliation; allocate them to the correct invoices before submitting.")} {Object.entries(draft.invoiceLegacySummary).filter(([,value]) => value).map(([key,value]) => `${titleCase(key)}: ${value}`).join(" · ")}</p> : null}
    {errors.length ? <div className="flex items-start gap-2 border-t border-[var(--md-line)] px-4 py-3" role="status" aria-label={t("Invoice header checks")}>
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" aria-hidden="true" />
      <div className="min-w-0 space-y-1 text-[12px] leading-5 text-[var(--md-text)]">
        <p className="font-medium text-[var(--md-ink)]">{t("Review invoice values before submitting")}</p>
        {conflictingFields.length ? <>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">{conflictingFields.map(field => <li key={field}><span className="font-medium">{t(sharedInvoiceFields[field])}:</span> {[...new Set(headers.map(header => header[field] || t(header.currency === "GBP" && field === "exchangeRate" ? "No conversion (GBP)" : "Not set")))].join(" / ")}</li>)}</ul>
          <p>{t("These values must match across invoices for the current submission. Correct the headers, or use separate declarations if the differences are intentional.")}</p>
        </> : null}
        {remainingErrors.length ? <ul className="space-y-1">{remainingErrors.map(error => <li key={error.field}>{t(error.message)}</li>)}</ul> : null}
      </div>
    </div> : null}
  </Surface>
}

function ItemsSection({ invoiceHeaders, declarationCategory, items, activeItem, activeItemId, onSelectItem, onAdd, onOpenInvoiceImport, onDuplicate, onRemove, update, updateRow, showDataElements, showOptional, issues, validated, highlightedField, t }: { invoiceHeaders: CustomsInvoiceHeader[]; declarationCategory: string; items: ExportDeclarationItem[]; activeItem: ExportDeclarationItem; activeItemId: string; onSelectItem: (id: string) => void; onAdd: () => void; onOpenInvoiceImport: () => void; onDuplicate: (itemId?: string) => void; onRemove: (itemId?: string) => void; update: <K extends keyof ExportDeclarationItem>(field: K, value: ExportDeclarationItem[K]) => void; updateRow: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void; showDataElements: boolean; showOptional: boolean; issues: Set<string>; validated: boolean; highlightedField?: string; t: (text: string) => string }) {
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

  const inputClass = cn(customsSingleLineControlClass, "border-transparent bg-[var(--md-surface-tint)] px-1.5 text-[10px] shadow-none focus-visible:border-[var(--md-accent)] focus-visible:ring-1 focus-visible:ring-[var(--md-accent)]")
  const extraItemFields = [
    ["dangerousGoodsCode", "UN dangerous goods code"], ["taricCode", "TARIC additional code"],
    ["nationalCode", "National additional code"], ["cusCode", "CUS code"],
    ["transactionNature", "Nature of transaction"], ["preferentialOrigin", "Preferential origin"],
    ["tariffQuantity", "Tariff quantity"], ["previousDocumentCategory", "Previous document category"],
    ["previousDocumentType", "Previous document type"], ["additionalDocumentCategory", "Additional document category"],
    ["additionalDocumentType", "Additional document type"], ["additionalDocumentId", "Additional document ID"],
    ["additionalDocumentName", "Additional document name"], ["lpcoExemptionCode", "LPCO exemption code"],
    ["additionalDocumentWriteOff", "Writing-off issuing authority"], ["additionalDocumentValidityDate", "Writing-off date of validity"],
    ["consignor", "Consignor"], ["consignee", "Consignee"], ["destinationCountry", "Destination country"],
    ["ucr", "Reference number or UCR"], ["containerId", "Container identification number"],
    ["freightPaymentMethod", "Freight payment method"], ["customsValuationMethod", "Customs valuation method"],
    ["preferenceCode", "Preference code"],
    ...(declarationDirection === "import" ? [["quotaOrderNumber", "Quota order number"] as const] : []),
  ] as const
  const repeatedItemFields = [
    ["additionalTaricCodes", "Additional TARIC codes"], ["additionalNationalCodes", "Additional national codes"],
    ["additionalPackageDetails", "Additional package details"], ["additionalProcedureCodes", "Additional procedure codes"],
    ["additionalPreviousDocuments", "Additional previous documents"], ["additionalDocuments", "Additional documents"],
    ["additionalInformationStatements", "Additional information statements"], ["dutyCalculations", "Duty calculations"],
    ["valuationAdjustments", "Valuation adjustments"], ["itemExporters", "Item exporters"],
    ["itemSellers", "Item sellers"], ["itemBuyers", "Item buyers"],
    ["domesticDutyTaxParties", "Domestic duty tax parties"], ["mutualRecognitionParties", "Mutual recognition parties"],
  ] as const
  const previousDocumentCategories = useReferenceOptions("previous_document_category", t)
  const previousDocumentTypes = useReferenceOptions("previous_document_type", t)
  const transactionNatures = useReferenceOptions("transaction_nature", t)
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
      id: "invoiceHeaderId", label: t("Invoice number"), width: 170, minWidth: 130, canHide: false,
      sortValue: item => invoiceHeaders.find(header => header.id === item.invoiceHeaderId)?.invoiceNumber ?? "",
      cell: item => <InvoiceNumberSelect headers={invoiceHeaders} label={`${t("Invoice number for item")} ${items.findIndex(candidate => candidate.id === item.id) + 1}`} value={item.invoiceHeaderId} onChange={value => updateRow(item.id, "invoiceHeaderId", value)} invalid={Boolean(invoiceHeaders.length && (!item.invoiceHeaderId || !invoiceHeaders.some(header => header.id === item.invoiceHeaderId)))} t={t} />,
    },
    {
      id: "commodityCode", label: t("Commodity code"), width: 144, minWidth: 132, kind: "text", canPin: false,
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <div className="relative"><Input aria-label={`${t("Commodity code")} ${index + 1}`} maxLength={declarationDirection === "export" ? 8 : 10} className={cn(inputClass, "pe-8", validatedItemField(issues, missing, "commodityCode") && "ring-1 ring-[var(--md-red)]")} value={item.commodityCode} onChange={(event) => updateRow(item.id, "commodityCode", event.target.value.replace(/\D/g, "").slice(0, declarationDirection === "export" ? 8 : 10))} /><CommoditySmartSearch item={item} direction={declarationDirection} update={(field, value) => updateRow(item.id, field, value)} triggerClassName="absolute end-0 top-0" t={t} /></div> },
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
      cell: (item) => { const index = items.findIndex((candidate) => candidate.id === item.id); const missing = mandatoryItemGaps(item, declarationDirection); return <Input aria-label={`${t("Previous document reference")} ${index + 1}`} className={cn(inputClass, validatedItemField(issues, missing, "previousDocumentReference") && "ring-1 ring-[var(--md-red)]")} value={item.previousDocumentReference} maxLength={35} onChange={(event) => updateRow(item.id, "previousDocumentReference", event.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 35))} /> },
    },
    ...extraItemFields.map(([field, label]): DataTableColumn<ExportDeclarationItem> => ({
      id: field, label: t(label), width: 180, minWidth: 120, defaultHidden: true,
      sortValue: item => item[field],
      cell: item => {
        const index = items.findIndex(candidate => candidate.id === item.id)
        const options = field === "preferentialOrigin" ? preferentialOriginOptions([["", "Not specified"] as const, ...countries], t)
          : field === "destinationCountry" ? [["", "Not specified"] as const, ...countries]
          : field === "previousDocumentCategory" ? previousDocumentCategories
          : field === "previousDocumentType" ? previousDocumentTypes
          : field === "transactionNature" ? transactionNatures : undefined
        return options
          ? <ItemTableSelect label={`${t(label)} ${index + 1}`} value={item[field] ?? ""} onChange={value => updateRow(item.id, field, value)} options={options} />
          : <Input aria-label={`${t(label)} ${index + 1}`} type={field === "additionalDocumentValidityDate" ? "date" : "text"} maxLength={field === "customsValuationMethod" ? 1 : field === "preferenceCode" ? 3 : field === "quotaOrderNumber" ? 6 : undefined} className={inputClass} value={item[field] ?? ""} onChange={event => updateRow(item.id, field, field === "customsValuationMethod" || field === "preferenceCode" ? event.target.value.replace(/\D/g, "") : field === "quotaOrderNumber" ? event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : event.target.value)} />
      },
    })),
    ...repeatedItemFields.map(([field, label]): DataTableColumn<ExportDeclarationItem> => ({
      id: field, label: t(label), width: 180, minWidth: 120, defaultHidden: true,
      sortValue: item => item[field].length,
      cell: item => <Button type="button" variant="ghost" size="sm" aria-label={`${t("Edit")} ${t(label)} · ${t("Item")} ${items.findIndex(candidate => candidate.id === item.id) + 1}`} onClick={() => { onSelectItem(item.id); setExpandedItemId(item.id) }}>{item[field].length} · {t("Edit")}</Button>,
    })),
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
      canPin: column.id !== "actions",
      sortValue: column.sortValue ?? (column.id === "actions" ? undefined : (item: ExportDeclarationItem) => {
        if (column.id === "line") return items.findIndex(candidate => candidate.id === item.id) + 1
        const field = column.id === "origin" ? "nonPreferentialOrigin" : column.id === "price" ? "itemPrice" : column.id
        const value = item[field as keyof ExportDeclarationItem]
        if (typeof value !== "string") return null
        return column.kind === "number" ? (value.trim() && Number.isFinite(Number(value)) ? Number(value) : null) : value
      }),
      resizable,
      minWidth: resizable ? Math.min(column.minWidth ?? minimumResizableWidth, minimumResizableWidth) : column.minWidth,
      headerClassName: cn(column.headerClassName, "border-e border-[var(--md-line)] last:border-e-0"),
      cellClassName: cn(column.cellClassName, "border-e border-[var(--md-line)] last:border-e-0"),
    }
  }), [additionalProcedureCodes, countries, currencies, declarationDirection, expandedItemId, invoiceHeaders, issues, items, packageKinds, procedureCodes, previousDocumentCategories, previousDocumentTypes, transactionNatures, t, updateRow, validated])

  return <div className="min-w-0 space-y-4">
    <Surface padding="none" className="w-full min-w-0 max-w-full overflow-hidden rounded-[var(--md-radius-xl)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-line)] px-4 py-3">
        <span>
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Invoice items")}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Choose, reorder and pin columns to suit your work. Expand a line to edit repeatable details.")}</p>
        </span>
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={onOpenInvoiceImport}><ScanText className="size-3.5" />{t("Import invoice")}</Button><Button type="button" size="sm" onClick={onAdd}><Plus className="size-3.5" />{t("Add item")}</Button></div>
      </header>
      <div ref={goodsLineTableRef} className="w-full min-w-0 max-w-full [container-type:inline-size]" data-testid="mandatory-goods-line-scroll">
        <DataTable
          ariaLabel={t("Invoice items")}
          columns={itemColumns}
          rows={items}
          getRowKey={(item) => item.id}
          storageKey={`customs-${declarationDirection}-goods-items`}
          selectedRowKey={activeItemId}
          showToolbar
          showColumnManager
          className="rounded-none shadow-none"
          tableClassName="table-fixed text-start"
          rowProps={(item) => ({
            onClick: (event) => { if (!(event.target as HTMLElement).closest("input, button, [role='combobox']")) toggleItem(item.id) },
            onFocus: (event) => { if (!(event.target as HTMLElement).closest("[data-item-disclosure]")) onSelectItem(item.id) },
            onContextMenu: () => onSelectItem(item.id),
          })}
          rowContextActions={(item) => [{
            id: "duplicate-item",
            label: "Duplicate",
            hint: "Create a copy",
            icon: Copy,
            onSelect: () => onDuplicate(item.id),
          }, {
            id: "delete-item",
            label: "Delete",
            hint: items.length === 1 ? "Keep one line" : "Remove line",
            icon: Trash2,
            tone: "destructive",
            disabled: items.length === 1,
            onSelect: () => onRemove(item.id),
          }]}
          exportConfig={{ fileName: `${declarationDirection}-declaration-goods-items`, recordCategory: "Goods item" }}
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
                          tabIndex={-1}
                          initial={shouldReduceMotion ? false : { height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={reduceMotion(shouldReduceMotion, expanded ? mdMotion.panel : mdMotion.exit)}
                          className="overflow-hidden"
                        >
                          <div className="sticky start-0 w-[100cqw] min-w-0 max-w-[100cqw] p-3">
                            <ItemDetailsEditor
                              declarationCategory={declarationCategory}
                              item={item}
                              itemNumber={index + 1}
                              onDuplicate={() => onDuplicate(item.id)}
                              onRemove={() => onRemove(item.id)}
                              canRemove={items.length > 1}
                              update={(field, value) => updateRow(item.id, field, value)}
                              showDataElements={showDataElements}
                              showOptional
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
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-4 py-2 text-[10px] text-[var(--md-subtle)]">
        <span>{items.length} {items.length === 1 ? t("goods line") : t("goods lines")}</span>
        {declarationDirection === "import" ? <span>{t("Procedure lists: iCustoms snapshot, 14 September 2026 · Not live-synced")}</span> : null}
        <span>{t("Use Columns to customise your saved layout")}</span>
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
  const exactCommodityPattern = searchDirection === "export" ? /^\d{8}(?:\d{2})?$/ : /^\d{10}$/
  const declarationCommodityPattern = direction === "export" ? /^\d{8}$/ : /^\d{10}$/

  useEffect(() => {
    const resolvedQuery = query.trim()
    const requestId = ++liveRequestId.current
    const isExactCommodity = searchDirection === "export" ? /^\d{8}(?:\d{2})?$/.test(resolvedQuery) : /^\d{10}$/.test(resolvedQuery)
    if (!open || resolvedQuery.length < 2 || isExactCommodity) {
      setSuggestionsBusy(false)
      if (resolvedQuery.length < 2 || isExactCommodity) {
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
  }, [importCountry, open, query, searchDirection, t])

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
    if (triggerVariant === "certificates" && declarationCommodityPattern.test(item.commodityCode)) {
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
      setError(t(searchDirection === "export" ? "Enter at least two characters or an 8-digit commodity code." : "Enter at least two characters or a 10-digit commodity code."))
      return
    }
    setError(null)
    resetSelection()
    if (exactCommodityPattern.test(resolvedQuery)) {
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

    update("commodityCode", detail.code.replace(/\D/g, "").slice(0, direction === "export" ? 8 : 10))
    if (!item.description.trim()) {
      const enteredDescription = query.trim()
      const resolvedDescription = exactCommodityPattern.test(enteredDescription)
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
  const formattedCode = (code: string) => (searchDirection === "export" ? code.slice(0, 8) : code.slice(0, 10)).match(/.{1,2}/g)?.join(" ") ?? code

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
    {triggerVariant === "certificates" ? <Button type="button" variant="outline" size="sm" disabled={!declarationCommodityPattern.test(item.commodityCode)} aria-haspopup="dialog" aria-controls={dialogId} onClick={() => handleOpenChange(true)} className={cn("h-8 gap-1.5 px-2.5 text-[11px]", triggerClassName)}>
      <FileCheck2 className="size-3.5" aria-hidden="true" />
      {t("Certificates list")}
    </Button> : <button type="button" aria-label={t("Smart commodity search")} aria-haspopup="dialog" aria-controls={dialogId} onClick={(event) => { event.stopPropagation(); handleOpenChange(true) }} className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] outline-none transition-[background-color,color,transform] duration-150 hover:bg-[var(--md-accent-a10)] hover:text-[var(--md-accent)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] active:scale-[0.96]", open && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]", triggerClassName)}>
      <Search className="size-3.5" aria-hidden="true" />
    </button>}
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id={dialogId} className={cn("flex max-h-[min(calc(100dvh-32px),780px)] flex-col gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-0", triggerVariant === "certificates" ? "sm:max-w-[680px]" : "sm:max-w-[760px]")} onOpenAutoFocus={(event) => { if (triggerVariant === "search") { event.preventDefault(); searchInput.current?.focus() } }}>
        <DialogHeader className="shrink-0 px-5 pb-0 pt-5 pe-14">
          <DialogTitle className="text-balance text-[22px] font-medium leading-[1.15] text-[var(--md-ink)]">{triggerVariant === "certificates" ? <>{t("Certificates for commodity")} <span className="whitespace-nowrap tabular-nums" dir="ltr">{formattedCode(item.commodityCode)}</span></> : t("Search for a commodity")}</DialogTitle>
          <DialogDescription className="max-w-[65ch] text-pretty text-[12px] leading-[1.5] text-[var(--md-subtle)]">{triggerVariant === "certificates" ? item.description || t("Review the documents and legal declarations returned for this commodity code.") : t(searchDirection === "export" ? "Choose an import country and enter a product name or 8-digit commodity code." : "Choose an import country and enter a product name or 10-digit commodity code.")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {triggerVariant === "search" ? <>
          <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,auto)_minmax(150px,auto)]">
            <div className="min-w-0">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--md-text)]">{t("Import country")}</span>
              <CustomsReferenceCombobox label={t("Import country")} value={importCountry} onChange={(value) => { setImportCountry(value); resetSearchResults() }} options={countryOptions} placeholder={t("Select country")} />
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
                <CustomsReferenceCombobox label={t("Dispatched country")} value={dispatchedCountry} onChange={setDispatchedCountry} options={countryOptions} placeholder={t("Select country")} />
              </motion.div> : null}
            </AnimatePresence>
          </div>

          <div className="mt-4">
            <label htmlFor={`commodity-search-${item.id}`} className="mb-1.5 block text-[12px] font-medium text-[var(--md-text)]">{t("Commodity code or description")}</label>
            <div className="relative">
              <Input ref={searchInput} id={`commodity-search-${item.id}`} value={query} onChange={(event) => { setQuery(event.target.value); setSuggestions([]); setSuggestionsLoadedFor(""); resetSelection(); setError(null) }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch() } }} placeholder={t(searchDirection === "export" ? "e.g. hardback books or 49011000" : "e.g. hardback books or 4901100000")} autoComplete="off" aria-autocomplete="list" aria-controls={`commodity-suggestions-${item.id}`} aria-expanded={showSuggestionPanel} className={cn("h-11 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] pe-12 text-base shadow-[var(--md-shadow-line)] sm:text-[14px]", showSuggestionPanel && "rounded-b-none")} />
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
                {hasCurrentEmptyResult ? <div className="border-t border-[var(--md-line)] px-4 py-4 text-start"><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("No matching commodity codes were returned.")}</p><p className="mt-1 text-[11px] leading-[1.5] text-[var(--md-subtle)]">{t(searchDirection === "export" ? "Try a more specific product description or an exact 8-digit code." : "Try a more specific product description or an exact 10-digit code.")}</p></div> : null}
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

function ItemQuotaDetails({ code, t }: { code: string; t: (text: string) => string }) {
  const [result, setResult] = useState<{ code: string; detail?: ICustomsCommodityDetail; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const validCode = /^\d{10}$/.test(code)
  useEffect(() => {
    if (!validCode) return
    let active = true
    setResult(null)
    void getICustomsCommodityDetails(code, "import").then(({ detail }) => {
      if (active) setResult(detail.code === code ? { code, detail } : { code, error: "The customs service returned a different commodity. Quota information could not be verified." })
    }).catch(() => {
      if (active) setResult({ code, error: "Quota information could not be checked." })
    })
    return () => { active = false }
  }, [code, validCode, attempt])
  if (!validCode) return null
  const current = result?.code === code ? result : null
  const quotas = current?.detail?.quotas
  if (!current || quotas?.length === 0) return null
  return <section aria-label={t("Commodity quotas")} className="min-w-0 space-y-2 border-b border-[var(--md-line)] pb-3">
    {current.error || !quotas ? <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--md-text)]"><span>{t(current.error || "Quota information is unavailable.")}</span><Button type="button" variant="ghost" size="sm" onClick={() => setAttempt(value => value + 1)}>{t("Retry quota check")}</Button><a href={`https://www.trade-tariff.service.gov.uk/commodities/${code}`} target="_blank" rel="noopener noreferrer" className="text-[var(--md-accent)] underline underline-offset-2">{t("Check tariff")}</a></div>
      : <details className="group">
        <summary className="cursor-pointer rounded-[var(--md-radius-sm)] py-1 text-[12px] text-[var(--md-text)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Quota available")} · {t("Review eligibility")}</summary>
        <div className="mt-2 space-y-2">
        <p className="text-[12px] text-[var(--md-amber)]">{t("Quota measures apply to this commodity. Check the geographical scope, exclusions and dates for this shipment; a listed quota does not confirm eligibility or allocation.")}</p>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">{quotas.map(quota => <div key={quota.measureId} className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
          <h4 className="text-[12px] font-medium">{t("Quota")} {quota.orderNumber} · {quota.description}</h4>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1 text-[12px]">
            {[["Geographical scope", quota.area], ["Excluded origins", quota.excludedAreas.join(", ")], ["Quota duty rate", quota.dutyRate], ["Valid from", quota.validFrom?.slice(0, 10)], ["Valid until", quota.validTo?.slice(0, 10)], ["Reported status", quota.status], ["Reported balance", quota.balance ? `${quota.balance} ${quota.unit}` : ""], ["Initial volume", quota.initialVolume ? `${quota.initialVolume} ${quota.unit}` : ""]].map(([label, value]) => <Fragment key={label}><dt className="text-[var(--md-subtle)]">{t(label)}</dt><dd className="min-w-0 break-words text-[var(--md-text)]">{value || t("Not provided")}</dd></Fragment>)}
          </dl>
        </div>)}</div>
        <p className="text-[11px] text-[var(--md-subtle)]">{t("Source: iCustoms UK Online Tariff. Balances can change and are not reserved by entering this declaration.")}</p>
        <a href={`https://www.trade-tariff.service.gov.uk/commodities/${code}`} target="_blank" rel="noopener noreferrer" className="inline-block text-[12px] text-[var(--md-accent)] underline underline-offset-2">{t("Check the official tariff")}</a>
        </div>
      </details>}
  </section>
}

function ItemDetailsEditor({ declarationCategory, item, itemNumber, onDuplicate, onRemove, canRemove, update, showDataElements, showOptional, issues, highlightedField, t }: {
  declarationCategory: string
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
  const packageDetails = <RepeatableCustomsFields title={t("Package details")} addLabel={t("Add package detail")} onAdd={() => update("additionalPackageDetails", [...item.additionalPackageDetails, { id: repeatableCustomsEntryId("package"), kind: "", marks: "", count: "" }])}>
    <FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
      <SelectField label={t("Package kind")} dataElement="6/9" customsBox="31" required showDataElements={showDataElements} value={item.packageKind} onChange={(value) => update("packageKind", value)} invalid={issues.has("packageKind")} fieldKey="packageKind" highlighted={highlightedField === "packageKind"} options={packageKindFields} />
      <TextField label={t("Package count")} dataElement="6/10" customsBox="31" required showDataElements={showDataElements} value={item.packageCount} onChange={(value) => update("packageCount", value)} invalid={issues.has("packageCount")} fieldKey="packageCount" highlighted={highlightedField === "packageCount"} />
      <TextField label={t("Package marks")} dataElement="6/11" customsBox="31" required showDataElements={showDataElements} value={item.packageMarks} onChange={(value) => update("packageMarks", value)} invalid={issues.has("packageMarks")} fieldKey="packageMarks" highlighted={highlightedField === "packageMarks"} />
    </FieldGrid>
    {item.additionalPackageDetails.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove package detail")} onRemove={() => update("additionalPackageDetails", item.additionalPackageDetails.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2"><SelectField label={t("Package kind")} dataElement="6/9" customsBox="31" showDataElements={showDataElements} value={entry.kind} onChange={(kind) => update("additionalPackageDetails", item.additionalPackageDetails.map((candidate) => candidate.id === entry.id ? { ...candidate, kind } : candidate))} options={packageKindFields} /><TextField label={t("Package count")} dataElement="6/10" customsBox="31" showDataElements={showDataElements} value={entry.count} onChange={(count) => update("additionalPackageDetails", item.additionalPackageDetails.map((candidate) => candidate.id === entry.id ? { ...candidate, count } : candidate))} /><TextField label={t("Package marks")} dataElement="6/11" customsBox="31" showDataElements={showDataElements} value={entry.marks} onChange={(marks) => update("additionalPackageDetails", item.additionalPackageDetails.map((candidate) => candidate.id === entry.id ? { ...candidate, marks } : candidate))} /></FieldGrid></RepeatableCustomsRow>)}
  </RepeatableCustomsFields>
  const additionalProcedures = <RepeatableCustomsFields title={t("Additional procedure codes")} addLabel={t("Add procedure code")} onAdd={() => update("additionalProcedureCodes", [...item.additionalProcedureCodes, { id: repeatableCustomsEntryId("procedure"), code: "" }])}>
    <SelectField label={t("Additional procedure code")} dataElement="1/11" customsBox="37" required showDataElements={showDataElements} value={item.additionalProcedureCode} onChange={(value) => update("additionalProcedureCode", value)} invalid={issues.has("additionalProcedureCode")} fieldKey="additionalProcedureCode" highlighted={highlightedField === "additionalProcedureCode"} options={additionalProcedureCodeFields} />
    {item.additionalProcedureCodes.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove procedure code")} onRemove={() => update("additionalProcedureCodes", item.additionalProcedureCodes.filter((candidate) => candidate.id !== entry.id))}><SelectField label={t("Additional procedure code")} dataElement="1/11" customsBox="37" showDataElements={showDataElements} value={entry.code} onChange={(code) => update("additionalProcedureCodes", item.additionalProcedureCodes.map((candidate) => candidate.id === entry.id ? { ...candidate, code } : candidate))} options={additionalProcedureCodeFields} /></RepeatableCustomsRow>)}
  </RepeatableCustomsFields>

  return <div className={cn("min-w-0 max-w-full space-y-3", declarationDirection === "import" && "customs-item-editor")} aria-label={`${t("Item details")} ${itemNumber}`}>
    <div className={cn("grid min-w-0 items-start gap-3", declarationDirection === "import" ? "xl:grid-cols-2" : "xl:grid-cols-[minmax(260px,0.95fr)_minmax(260px,0.88fr)_minmax(300px,1.05fr)]")}>
      <div className="min-w-0 space-y-3">
        <ItemDetailGroup title={t("Commodity")}>
          <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
          <div className="relative"><TextField label={t("Commodity code")} dataElement="6/14" customsBox="33" required showDataElements={showDataElements} value={item.commodityCode} onChange={(value) => update("commodityCode", value.replace(/\D/g, "").slice(0, declarationDirection === "export" ? 8 : 10))} invalid={issues.has("commodityCode")} fieldKey="commodityCode" highlighted={highlightedField === "commodityCode"} maxLength={declarationDirection === "export" ? 8 : 10} inputClassName="pe-10" /><CommoditySmartSearch item={item} direction={declarationDirection} update={update} triggerClassName="absolute bottom-1 end-1" t={t} /></div>
          {declarationDirection === "import" && showOptional ? <TextField label={t("CUS code")} dataElement="6/13" customsBox="31" showDataElements={showDataElements} value={item.cusCode} onChange={(value) => update("cusCode", value)} /> : null}
          {declarationDirection === "export" ? <TextField label={t("UN dangerous goods code")} dataElement="6/12" customsBox="31" showDataElements={showDataElements} value={item.dangerousGoodsCode} onChange={(value) => update("dangerousGoodsCode", value)} /> : null}
          <TextAreaField label={t("Description of goods")} dataElement="6/8" customsBox="31" required showDataElements={showDataElements} value={item.description} onChange={(value) => update("description", value)} invalid={issues.has("description")} fieldKey="description" highlighted={highlightedField === "description"} />
          <div className="flex justify-start"><CommoditySmartSearch item={item} direction={declarationDirection} update={update} triggerVariant="certificates" t={t} /></div>
          {declarationDirection === "export" && showOptional ? <TextField label={t("CUS code")} dataElement="6/13" customsBox="31" showDataElements={showDataElements} value={item.cusCode} onChange={(value) => update("cusCode", value)} /> : null}
          </FieldGrid>
          {showOptional ? <div className={cn("mt-3", declarationDirection === "import" ? "customs-item-code-groups" : "space-y-3")}>
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
            {declarationDirection === "import" ? <div className="customs-item-procedure-groups">{packageDetails}{additionalProcedures}</div> : packageDetails}
            <FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
              <SelectField label={t("Non-preferential origin")} dataElement="5/15" customsBox="34" required showDataElements={showDataElements} value={item.nonPreferentialOrigin} onChange={(value) => update("nonPreferentialOrigin", value)} invalid={issues.has("nonPreferentialOrigin")} fieldKey="nonPreferentialOrigin" highlighted={highlightedField === "nonPreferentialOrigin"} options={countryFields} />
              {declarationDirection === "import" ? <SelectField label={t("Preferential origin")} dataElement="5/16" required={/^[234]/.test(item.preferenceCode)} showDataElements={showDataElements} value={item.preferentialOrigin ?? ""} onChange={(value) => update("preferentialOrigin", value)} invalid={issues.has("preferentialOrigin")} fieldKey="preferentialOrigin" highlighted={highlightedField === "preferentialOrigin"} options={preferentialOriginOptions(optionalCountries, t)} /> : null}
              <SelectField label={t("Procedure code")} dataElement="1/10" customsBox="37" required showDataElements={showDataElements} value={item.procedureCode} onChange={(value) => update("procedureCode", value)} invalid={issues.has("procedureCode")} fieldKey="procedureCode" highlighted={highlightedField === "procedureCode"} options={procedureCodeFields} />
            </FieldGrid>
            {declarationDirection === "export" ? additionalProcedures : null}
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
                <TextField label={t("Previous document reference")} dataElement="2/1" customsBox="40" required showDataElements={showDataElements} value={item.previousDocumentReference} onChange={(value) => update("previousDocumentReference", value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 35))} invalid={issues.has("previousDocumentReference")} fieldKey="previousDocumentReference" highlighted={highlightedField === "previousDocumentReference"} maxLength={35} />
              </FieldGrid>
              {item.additionalPreviousDocuments.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove previous document")} onRemove={() => update("additionalPreviousDocuments", item.additionalPreviousDocuments.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">{declarationDirection === "import" ? <SelectField label={t("Previous document category")} dataElement="2/1" customsBox="40" showDataElements={showDataElements} value={entry.category} onChange={(category) => update("additionalPreviousDocuments", item.additionalPreviousDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, category } : candidate))} options={previousDocumentCategories} /> : null}<SelectField label={t("Previous document type")} dataElement="2/1" customsBox="40" showDataElements={showDataElements} value={entry.type} onChange={(type) => update("additionalPreviousDocuments", item.additionalPreviousDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, type } : candidate))} options={previousDocumentTypes} /><TextField label={t("Previous document reference")} dataElement="2/1" customsBox="40" showDataElements={showDataElements} value={entry.reference} onChange={(reference) => update("additionalPreviousDocuments", item.additionalPreviousDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, reference: reference.replace(/[^A-Za-z0-9-]/g, "").slice(0, 35) } : candidate))} maxLength={35} /></FieldGrid></RepeatableCustomsRow>)}
            </RepeatableCustomsFields>
            {showOptional ? <>
              <RepeatableCustomsFields title={t("Additional documents")} addLabel={t("Add additional document")} onAdd={() => update("additionalDocuments", [...item.additionalDocuments, { id: repeatableCustomsEntryId("additional-document"), category: "", type: "", reference: "", name: "", lpcoExemptionCode: "", writeOff: "", validityDate: "" }])}>
                <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1"><TextField label={t("Additional document category")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentCategory} onChange={(value) => update("additionalDocumentCategory", value)} /><TextField label={t("Additional document type")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentType} onChange={(value) => update("additionalDocumentType", value)} /><TextField label={t("Additional document ID")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentId} onChange={(value) => update("additionalDocumentId", value)} /><TextField label={t("Additional document name")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentName} onChange={(value) => update("additionalDocumentName", value)} /><TextField label={t("LPCO exemption code")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={item.lpcoExemptionCode} onChange={(value) => update("lpcoExemptionCode", value)} /><TextField label={t("Writing-off issuing authority")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentWriteOff} onChange={(value) => update("additionalDocumentWriteOff", value)} /><TextField label={t("Writing-off date of validity")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={item.additionalDocumentValidityDate} onChange={(value) => update("additionalDocumentValidityDate", value)} inputType="date" /></FieldGrid>
                {item.additionalDocuments.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove additional document")} onRemove={() => update("additionalDocuments", item.additionalDocuments.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1"><TextField label={t("Additional document category")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.category} onChange={(category) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, category } : candidate))} /><TextField label={t("Additional document type")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.type} onChange={(type) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, type } : candidate))} /><TextField label={t("Additional document ID")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.reference} onChange={(reference) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, reference } : candidate))} /><TextField label={t("Additional document name")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.name} onChange={(name) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, name } : candidate))} /><TextField label={t("LPCO exemption code")} dataElement="2/3" customsBox="44" showDataElements={showDataElements} value={entry.lpcoExemptionCode} onChange={(lpcoExemptionCode) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, lpcoExemptionCode } : candidate))} /><TextField label={t("Writing-off issuing authority")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={entry.writeOff} onChange={(writeOff) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, writeOff } : candidate))} /><TextField label={t("Writing-off date of validity")} dataElement="8/7" customsBox="44" showDataElements={showDataElements} value={entry.validityDate} onChange={(validityDate) => update("additionalDocuments", item.additionalDocuments.map((candidate) => candidate.id === entry.id ? { ...candidate, validityDate } : candidate))} inputType="date" /></FieldGrid></RepeatableCustomsRow>)}
              </RepeatableCustomsFields>
              <RepeatableCustomsFields title={t("Additional information")} addLabel={t("Add information statement")} onAdd={() => update("additionalInformationStatements", [...item.additionalInformationStatements, { id: repeatableCustomsEntryId("additional-information"), statementCode: "" }])}>
                {item.additionalInformationStatements.map((entry, index) => {
                  const fields = <>
                    <TextField label={t("Statement code")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={entry.statementCode} onChange={(statementCode) => update("additionalInformationStatements", item.additionalInformationStatements.map((candidate) => candidate.id === entry.id ? { ...candidate, statementCode } : candidate))} />
                    {declarationDirection === "import" ? <TextField label={t("Statement text")} dataElement="2/2" customsBox="44" showDataElements={showDataElements} value={entry.statementDescription ?? ""} onChange={(statementDescription) => update("additionalInformationStatements", item.additionalInformationStatements.map((candidate) => candidate.id === entry.id ? { ...candidate, statementDescription } : candidate))} /> : null}
                  </>
                  return index === 0 ? <div key={entry.id} className="grid min-w-0 gap-3 sm:grid-cols-2">{fields}</div> : <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove information statement")} onRemove={() => update("additionalInformationStatements", item.additionalInformationStatements.filter((candidate) => candidate.id !== entry.id))}>{fields}</RepeatableCustomsRow>
                })}
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
          {declarationDirection === "import" && (isQuotaPreference(item.preferenceCode) || item.quotaOrderNumber || issues.has("quotaOrderNumber")) ? <TextField label={t("Quota order number")} dataElement="8/1" customsBox="39" showDataElements={showDataElements} value={item.quotaOrderNumber ?? ""} onChange={value => update("quotaOrderNumber", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} invalid={issues.has("quotaOrderNumber")} fieldKey="quotaOrderNumber" highlighted={highlightedField === "quotaOrderNumber"} maxLength={6} /> : null}
          </FieldGrid>
          {showOptional && declarationDirection === "import" ? <div className="mt-3 space-y-3">
            <RepeatableCustomsFields title={t("Additions and deductions")} addLabel={t("Add addition or deduction")} onAdd={() => update("valuationAdjustments", [...item.valuationAdjustments, { id: repeatableCustomsEntryId("valuation-adjustment"), code: "", currency: item.currency, amount: "" }])}>
              {item.valuationAdjustments.length ? item.valuationAdjustments.map((entry) => <RepeatableCustomsRow key={entry.id} removeLabel={t("Remove addition or deduction")} onRemove={() => update("valuationAdjustments", item.valuationAdjustments.filter((candidate) => candidate.id !== entry.id))}><FieldGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2"><TextField label={t("Code identifying")} dataElement="4/9" customsBox="45" showDataElements={showDataElements} value={entry.code} onChange={(code) => update("valuationAdjustments", item.valuationAdjustments.map((candidate) => candidate.id === entry.id ? { ...candidate, code } : candidate))} /><SelectField label={t("Currency code")} dataElement="4/9" customsBox="45" showDataElements={showDataElements} value={entry.currency} onChange={(currency) => update("valuationAdjustments", item.valuationAdjustments.map((candidate) => candidate.id === entry.id ? { ...candidate, currency } : candidate))} options={currencyFields} /><TextField label={t("Amount")} dataElement="4/9" customsBox="45" showDataElements={showDataElements} value={entry.amount} onChange={(amount) => update("valuationAdjustments", item.valuationAdjustments.map((candidate) => candidate.id === entry.id ? { ...candidate, amount } : candidate))} /></FieldGrid></RepeatableCustomsRow>) : <p className="text-[10.5px] text-[var(--md-subtle)]">{t("No additions or deductions added")}</p>}
            </RepeatableCustomsFields>
          </div> : null}
        </ItemDetailGroup>
      </div>

      {declarationDirection === "export" ? <ItemDetailGroup title={t("Parties & transport")}>
        <FieldGrid className="grid-cols-1 sm:grid-cols-1 md:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-1">
          {declarationCategory === "B1" ? null : <TextField label={t("Consignor")} dataElement="3/7" customsBox="2" required showDataElements={showDataElements} value={item.consignor} onChange={(value) => update("consignor", value)} invalid={issues.has("consignor")} fieldKey="consignor" highlighted={highlightedField === "consignor"} />}
          <TextField label={t("Consignee")} dataElement="3/9" customsBox="8" showDataElements={showDataElements} value={item.consignee} onChange={(value) => update("consignee", value)} />
          <SelectField label={t("Destination country")} dataElement="5/8" customsBox="17" showDataElements={showDataElements} value={item.destinationCountry} onChange={(value) => update("destinationCountry", value)} options={optionalCountries} />
          <TextField label={t("Reference number or UCR")} dataElement="2/4" customsBox="44" showDataElements={showDataElements} value={item.ucr} onChange={(value) => update("ucr", value)} />
          <TextField label={t("Container identification number")} dataElement="7/10" customsBox="31" showDataElements={showDataElements} value={item.containerId} onChange={(value) => update("containerId", value)} />
        </FieldGrid>
      </ItemDetailGroup> : null}
    </div>
    {declarationDirection === "import" ? <>
      <DutyCalculationPanel key={item.id} itemId={item.id} declaredTaxes={item.dutyCalculations} onDeclaredTaxesChange={value => update("dutyCalculations", value)} t={t} />
      <ItemQuotaDetails code={item.commodityCode} t={t} />
    </> : null}
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

type CustomsReferenceOptionTuple = readonly [string, string]

function normalizedReferenceTerm(value: string) {
  return value.trim().normalize("NFKD").toLocaleLowerCase()
}

function referenceOptionName(label: string) {
  const separator = label.indexOf(" - ")
  return separator >= 0 ? label.slice(separator + 3) : label
}

function exactReferenceOption(options: ReadonlyArray<CustomsReferenceOptionTuple>, query: string) {
  const term = normalizedReferenceTerm(query)
  if (!term) return undefined
  return options.find(([code, label]) => {
    return normalizedReferenceTerm(code) === term
      || normalizedReferenceTerm(label) === term
      || normalizedReferenceTerm(referenceOptionName(label)) === term
  })
}

function CustomsReferenceCombobox({ label, value, onChange, options, placeholder, disabled, invalid, required, variant = "field", autoPopulated = false, autoPopulationEvent, optionCode, showSelectedDescription = false, labelOnly = false, describedBy }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<CustomsReferenceOptionTuple>
  placeholder: string
  describedBy?: string
  disabled?: boolean
  invalid?: boolean
  required?: boolean
  variant?: "field" | "table"
  autoPopulated?: boolean
  autoPopulationEvent?: number | null
  optionCode?: (value: string) => string
  showSelectedDescription?: boolean
  labelOnly?: boolean
}) {
  const { direction, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [manualEntryError, setManualEntryError] = useState(false)
  const listId = useId()
  const helpId = `${listId}-help`
  const referenceOptions = useMemo(() => options.filter(([code]) => Boolean(code)), [options])
  const selected = referenceOptions.find(([code]) => code === value)
  const selectedText = labelOnly && selected ? selected[1] : showSelectedDescription && selected ? `${selected[0]} · ${referenceOptionName(selected[1])}` : optionCode && value ? optionCode(value) : selected
    ? /^[A-Z0-9][A-Z0-9 /.-]*$/.test(selected[0]) ? selected[0] : referenceOptionName(selected[1])
    : value || placeholder
  const populationRef = useAutoPopulationMorph<HTMLSpanElement>(autoPopulated, selectedText, undefined, autoPopulationEvent)
  const hasBlankOption = options.some(([code]) => !code)
  const normalizedQuery = normalizedReferenceTerm(query)
  const matches = referenceOptions.filter(([code, optionLabel]) => {
    if (!normalizedQuery) return true
    return normalizedReferenceTerm(`${code} ${optionLabel}`).includes(normalizedQuery)
  })
  const optionId = highlightedIndex >= 0 && matches[highlightedIndex] ? `${listId}-option-${highlightedIndex}` : undefined

  useEffect(() => {
    if (!optionId) return
    document.getElementById(optionId)?.scrollIntoView({ block: "nearest" })
  }, [optionId])

  function choose(option: CustomsReferenceOptionTuple) {
    onChange(option[0])
    closeAndReset()
  }

  function closeAndReset() {
    setOpen(false)
    setQuery("")
    setHighlightedIndex(-1)
    setManualEntryError(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    setHighlightedIndex(-1)
    setManualEntryError(false)
    if (!nextOpen) setQuery("")
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlightedIndex((current) => matches.length ? (current + 1) % matches.length : -1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlightedIndex((current) => matches.length ? (current <= 0 ? matches.length - 1 : current - 1) : -1)
      return
    }
    if (event.key === "Home" && matches.length) {
      event.preventDefault()
      setHighlightedIndex(0)
      return
    }
    if (event.key === "End" && matches.length) {
      event.preventDefault()
      setHighlightedIndex(matches.length - 1)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const codeMatches = optionCode ? referenceOptions.filter(([code]) => normalizedReferenceTerm(optionCode(code)) === normalizedReferenceTerm(query)) : []
      const exact = exactReferenceOption(referenceOptions, query)
      const option = highlightedIndex >= 0 ? matches[highlightedIndex] : codeMatches.length === 1 ? codeMatches[0] : exact
      if (option) choose(option)
      else setManualEntryError(true)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      closeAndReset()
    }
  }

  return <Popover open={open} onOpenChange={handleOpenChange}>
    <PopoverTrigger asChild>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-required={required || undefined}
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        title={selected ? (labelOnly ? selected[1] : referenceOptionName(selected[1])) : undefined}
        data-auto-populated={autoPopulated || undefined}
        aria-description={autoPopulated ? t("Filled from the linked booking. You can select another port.") : undefined}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            setOpen(true)
            return
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            setQuery(event.key)
            setHighlightedIndex(-1)
            setManualEntryError(false)
            setOpen(true)
          }
        }}
        className={cn(
          "flex w-fit min-w-[calc(5ch+2.375rem)] max-w-full items-center justify-between gap-2 border-0 bg-[var(--md-field-bg)] text-start shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] disabled:cursor-not-allowed disabled:opacity-50",
          variant === "table"
            ? cn(customsSingleLineControlClass, "px-1.5 text-[10px]")
            : customsSingleLineControlClass,
          invalid && "ring-1 ring-[var(--md-red)]",
          showSelectedDescription && "w-full",
          "relative md-auto-populated-control",
        )}
      >
        <span ref={populationRef} className={cn("relative min-w-0 truncate", !selected && "text-[var(--md-subtle)]")}>
          <bdi dir="ltr" className={selected ? "font-medium" : undefined}>{selectedText}</bdi>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-[var(--md-subtle)]" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={5} dir={direction} className="w-[var(--radix-popover-trigger-width)] min-w-[min(280px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
      <div className="relative m-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" aria-hidden="true" />
        <Input
          autoFocus
          role="combobox"
          aria-label={`${t("Search options for")} ${label}`}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={optionId}
          aria-invalid={manualEntryError || undefined}
          aria-describedby={manualEntryError ? helpId : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlightedIndex(-1)
            setManualEntryError(false)
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder={t(labelOnly ? "Search by name…" : "Search by code or name…")}
          className="h-11 rounded-[var(--md-radius-md)] ps-9 text-base sm:h-9 sm:text-[12px]"
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">{matches.length} {t("matching options")}</p>
      {manualEntryError ? <p id={helpId} className="mx-2 mb-1 text-[11px] leading-4 text-[var(--md-red)]">{t("Type an exact code or choose a listed option.")}</p> : null}
      <div id={listId} role="listbox" aria-label={`${label} ${t("options")}`} className="max-h-64 overflow-y-auto p-1 md-scrollbar">
        {matches.map((option, index) => <button
          id={`${listId}-option-${index}`}
          data-option-index={index}
          key={option[0]}
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={option[0] === value}
          onMouseMove={() => setHighlightedIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(option)}
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start text-[12px] hover:bg-[var(--md-hover)]",
            option[0] === value && "bg-[var(--md-selected-bg)]",
            index === highlightedIndex && "bg-[var(--md-hover)] ring-1 ring-inset ring-[var(--md-accent-a18)]",
          )}
        >
          {!labelOnly ? <bdi dir="ltr" className="shrink-0 font-medium text-[var(--md-accent)]">{optionCode ? optionCode(option[0]) : option[0]}</bdi> : null}
          <span className="min-w-0 flex-1 whitespace-normal break-words">{labelOnly ? option[1] : referenceOptionName(option[1])}</span>
          {option[0] === value ? <CheckCircle2 className="ms-auto size-3.5 shrink-0 text-[var(--md-accent)]" aria-hidden="true" /> : null}
        </button>)}
        {!matches.length ? <p className="px-3 py-5 text-center text-[12px] text-[var(--md-subtle)]">{t("No matching reference options")}</p> : null}
      </div>
      {hasBlankOption && value ? <button type="button" className="mx-1 min-h-10 rounded-[var(--md-radius-md)] px-2.5 text-start text-[11px] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-red)]" onClick={() => { onChange(""); closeAndReset() }}>{t("Clear selection")}</button> : null}
    </PopoverContent>
  </Popover>
}

function ItemTableSelect({ label, value, onChange, options, invalid, showSelectedDescription = false }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<CustomsReferenceOptionTuple>; invalid?: boolean; showSelectedDescription?: boolean }) {
  const referenceState = useContext(CustomsReferenceDataContext)
  return <CustomsReferenceCombobox label={label} value={value} onChange={onChange} options={options} placeholder="–" disabled={referenceState.loading || Boolean(referenceState.error) || !options.length} invalid={invalid} variant="table" showSelectedDescription={showSelectedDescription} />
}

function mandatoryItemGaps(item: ExportDeclarationItem, declarationDirection: DeclarationKind = "export"): Array<keyof ExportDeclarationItem> {
  const missing: Array<keyof ExportDeclarationItem> = []
  if (!(declarationDirection === "export" ? /^\d{8}$/ : /^\d{10}$/).test(item.commodityCode)) missing.push("commodityCode")
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
  if (declarationDirection === "import" && /^[234]\d{2}$/.test(item.preferenceCode.trim()) && !item.preferentialOrigin?.trim()) missing.push("preferentialOrigin")
  return missing
}

function validatedItemField(issues: Set<string>, missing: Array<keyof ExportDeclarationItem>, field: keyof ExportDeclarationItem) {
  return issues.has(field) && missing.includes(field)
}

function ReviewSection({ draft, completion, iCustomsState, iCustomsBusy, iCustomsIssues, statusLifecycle, pdfAvailable, pdfBusy, pdfLoadError, savingDraft, update, updateItem, onOpenPdf, onRefresh, onCreateDraft, onSaveDraft, onSubmit, t }: {
  draft: StandaloneExportDraft
  completion: ReturnType<typeof declarationCompletion>
  iCustomsState: ICustomsWorkspaceState | null
  iCustomsBusy: "loading" | "draft" | "validate" | "submit" | "refresh" | null
  iCustomsIssues: string[]
  statusLifecycle: CustomsStatusLifecycle
  pdfAvailable: boolean
  pdfBusy: boolean
  pdfLoadError: string | null
  savingDraft: boolean
  update: <K extends keyof StandaloneExportDraft>(field: K, value: StandaloneExportDraft[K]) => void
  updateItem: <K extends keyof ExportDeclarationItem>(itemId: string, field: K, value: ExportDeclarationItem[K]) => void
  onOpenPdf: () => void
  onRefresh: () => void
  onCreateDraft: () => void
  onSaveDraft: () => void
  onSubmit: () => void
  t: (text: string) => string
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [openFixKey, setOpenFixKey] = useState<string | null>(null)
  const provider = iCustomsState?.declaration.provider
  const hasProviderDraft = Boolean(iCustomsState?.declaration.hasCustomsDraft)
  const providerLifecycleStarted = Boolean(provider?.submittedAt && (shouldPollCustomsStatus(provider.status) || isTerminalCustomsStatus(provider.status)))
  const providerAwaitingResponse = shouldPollCustomsSubmission(provider?.status, provider?.submittedAt)
  const providerRejected = provider?.status === "rejected"
  const providerAccepted = ["accepted", "released", "cleared"].includes(provider?.status ?? "")
  const waitingForDocument = providerAccepted && !pdfAvailable
  const connectionUnavailable = iCustomsState?.connection.configured === false
  const providerIssues = provider?.issues ?? []
  const providerCorrelationId = iCustomsState?.declaration.correlationId ?? draft.iCustomsCorrelationId
  const providerDeclarationUrl = hasProviderDraft && providerCorrelationId
    ? iCustomsDeclarationUrl(draft.direction, providerCorrelationId, iCustomsState?.connection.environment ?? "sandbox")
    : null
  const readiness = declarationReadiness(completion, iCustomsIssues, iCustomsState)

  function openFix(key: string) {
    setOpenFixKey(key)
    window.setTimeout(() => {
      document.getElementById(`customs-review-fix-${key}`)?.querySelector<HTMLElement>("input, textarea, button")?.focus()
    }, 80)
  }

  function confirmFix() {
    setOpenFixKey(null)
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <CustomsReadinessReview
      completeChecks={readiness.completeChecks}
      emptyDescription="Ready for secure server integration checks."
      emptyTitle="Current form checks passed"
      issues={completion.issues.map((issue) => ({ key: issue.id, label: translateCustomsMessage(issue.message, t), itemNumber: issue.itemNumber }))}
      percent={readiness.percent}
      renderFix={(reviewIssue, close) => {
        const issue = completion.issues.find((candidate) => candidate.id === reviewIssue.key)
        if (!issue) return null
        return <><ReviewFixSectionHeader draft={draft} issue={issue} t={t} /><ReviewFixFields draft={draft} issue={issue} update={update} updateItem={updateItem} t={t} /><div className="mt-3 flex justify-end border-t border-[var(--md-line)] pt-3"><Button type="button" size="sm" className="min-w-[88px] rounded-[var(--md-radius-md)]" onClick={close}>{t("Confirm")}</Button></div></>
      }}
      t={t}
      totalChecks={readiness.totalChecks}
    >
      {providerRejected && providerIssues.length ? <div role="alert" className="mt-5 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] p-3">
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
    </CustomsReadinessReview>
    <div className="space-y-4">
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Declaration summary")}</h2><dl className="mt-4 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]"><Summary label={t("Reference")} value={draft.multideckReference} /><Summary label={t("Category")} value={draft.declarationCategory} /><Summary label={t("Type")} value={draft.declarationType} /><Summary label={t("Items")} value={String(draft.items.length)} /><Summary label={t("Destination")} value={draft.destinationCountry || t("Not set")} /></dl></Surface>
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3"><Send className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" /><div><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Customs submission")}</h2><p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Multideck submits this declaration securely and keeps every customs response here.")}</p></div></div>
          <StatusPill tone="teal">{t("Test mode")}</StatusPill>
        </div>

        {iCustomsBusy === "loading" ? <p className="mt-4 text-[12px] text-[var(--md-subtle)]">{t("Checking the customs connection")}</p> : null}
        {connectionUnavailable ? <div role="alert" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_10%,transparent)] p-3 text-[12px] text-[var(--md-text)]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" /><span>{t("The customs test connection is not configured on the server yet.")}</span></div> : null}
        {provider || providerCorrelationId ? <dl className="mt-4 divide-y divide-[var(--md-line)] border-y border-[var(--md-line)]">{provider ? <Summary label={t("iCustoms draft status")} value={t(provider.status === "queued" ? "Starting" : titleCase(provider.status))} /> : null}{providerCorrelationId ? <Summary label={t("iCustoms correlation ID")} value={providerCorrelationId} valueDirection="ltr" /> : null}{provider?.mrn ? <Summary label="MRN" value={provider.mrn} /> : null}{provider?.updatedAt ? <Summary label={t("Last customs update")} value={new Date(provider.updatedAt).toLocaleString()} /> : null}</dl> : null}
        {providerAwaitingResponse ? <div role="status" aria-live="polite" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-3 text-[12px] text-[var(--md-text)]"><RefreshCw className={cn("mt-0.5 size-4 shrink-0 text-[var(--md-accent)]", statusLifecycle.phase === "checking" && "animate-spin motion-reduce:animate-none")} /><span><strong className="block text-[var(--md-ink)]">{t(statusLifecycle.phase === "timed-out" ? "Customs response is taking longer than expected" : "Waiting for the customs response")}</strong>{t(statusLifecycle.phase === "timed-out" ? "Use Refresh from iCustoms if you need to recover a delayed webhook." : "Multideck shows webhook updates as iCustoms delivers them.")}</span></div> : null}
        {waitingForDocument ? <div role="status" aria-live="polite" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-3 text-[12px] text-[var(--md-text)]"><FileText className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" /><span><strong className="block text-[var(--md-ink)]">{t("Waiting for the declaration document from iCustoms")}</strong>{t("You can keep working. Multideck will show the document as soon as the webhook delivers it.")}</span></div> : null}
        {statusLifecycle.phase === "error" ? <div role="alert" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_10%,transparent)] p-3 text-[12px] text-[var(--md-text)]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" /><span><strong className="block text-[var(--md-ink)]">{t("Customs status check was interrupted")}</strong>{t(statusLifecycle.message ?? "Multideck will retry automatically.")}</span></div> : null}
        {waitingForDocument || pdfAvailable || ((statusLifecycle.phase === "timed-out" || statusLifecycle.phase === "error") && providerAwaitingResponse) ? <Button type="button" variant="outline" className="mt-3 w-full" disabled={iCustomsBusy === "refresh"} onClick={onRefresh}><RefreshCw className={cn("size-4", iCustomsBusy === "refresh" && "animate-spin motion-reduce:animate-none")} />{t(iCustomsBusy === "refresh" ? "Refreshing from iCustoms" : "Refresh from iCustoms")}</Button> : null}
        {pdfAvailable ? <Button type="button" variant="ghost" className="mt-4 w-full bg-black text-white shadow-none hover:bg-black/80 hover:text-white" disabled={pdfBusy} onClick={onOpenPdf}><FileText className="size-4" />{t(pdfBusy ? "Opening declaration document" : pdfLoadError ? "Retry opening document" : "View declaration document")}</Button> : null}
        {pdfLoadError && pdfAvailable ? <p role="alert" className="mt-2 text-[11px] leading-4 text-[var(--md-red)]">{t("The declaration document could not be opened. Choose Retry opening document to request a fresh secure link.")}</p> : null}
        {providerDeclarationUrl ? <Button asChild variant="outline" className="mt-2 w-full"><a href={providerDeclarationUrl} target="_blank" rel="noopener noreferrer"><span>{t("View in")}</span><img src={iCustomsLogo} alt="iCustoms" className="h-4 w-auto" /><ExternalLink className="size-3.5" /></a></Button> : null}
        {providerAccepted && providerIssues.length ? <div role="status" className="mt-4 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_8%,var(--md-surface))] p-3">
          <div className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" /><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Customs accepted this declaration with provider messages")}</p><p className="mt-0.5 text-[11px] leading-4 text-[var(--md-text)]">{t("The declaration is accepted. Review these iCustoms messages for awareness; they do not change the accepted status.")}</p></div></div>
          <ul className="mt-3 space-y-2">{providerIssues.slice(0, 20).map((issue, index) => <li key={`accepted-provider-${issue.code}-${issue.itemNumber ?? "header"}-${index}`} className="rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-2.5 text-[11px] leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><span className="font-medium text-[var(--md-ink)]">{t(providerIssueFieldLabel(issue))}{issue.itemNumber ? ` · ${t("Item")} ${issue.itemNumber}` : ""}{issue.dataElement ? ` · DE ${issue.dataElement}` : ""}{issue.code ? ` · ${issue.code}` : ""}</span><span className="mt-1 block">{issue.message}</span></li>)}</ul>
        </div> : null}
        {provider?.errorMessage && !providerIssues.length ? <div role="alert" className="mt-4 flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] p-3 text-[12px] text-[var(--md-text)]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-red)]" /><span><strong className="block text-[var(--md-ink)]">{t("Customs service needs attention")}</strong>{t(provider.errorMessage)}</span></div> : null}
        {iCustomsIssues.length ? <div role="alert" className="mt-4"><p className="text-[12px] font-medium text-[var(--md-red)]">{t("Customs checks still need attention")}</p><ul className="mt-2 space-y-1.5 ps-4 text-[11px] leading-4 text-[var(--md-text)]">{iCustomsIssues.slice(0, 8).map((issue) => <li key={issue} className="list-disc">{translateCustomsMessage(issue, t)}</li>)}</ul></div> : null}

        {providerLifecycleStarted ? null : <><Button type="button" className="mt-4 w-full" disabled={Boolean(iCustomsBusy) || savingDraft || provider?.status === "queued"} onClick={onSaveDraft}><Save className="size-4" />{t(savingDraft || iCustomsBusy === "draft" ? "Saving draft" : "Save draft")}</Button>{<Button type="button" variant="outline" className="mt-2 w-full" disabled={Boolean(iCustomsBusy) || connectionUnavailable || provider?.status === "queued"} onClick={onCreateDraft}><RefreshCw className={cn("size-4", (iCustomsBusy === "draft" || provider?.status === "queued") && "animate-spin motion-reduce:animate-none")} />{t(iCustomsBusy === "draft" ? "Saving iCustoms draft" : hasProviderDraft ? "Update iCustoms draft" : "Create iCustoms draft")}</Button>}{providerRejected ? null : <Button type="button" variant="outline" className="mt-2 w-full" disabled={Boolean(iCustomsBusy) || savingDraft || connectionUnavailable || provider?.status === "queued"} onClick={onSubmit}>{iCustomsBusy === "validate" ? <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" /> : <Send className="size-4" />}{t(iCustomsBusy === "validate" ? "Checking declaration" : "Submit")}</Button>}</>}
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

function reviewSectionForField(field: string, direction: DeclarationKind): Exclude<EditorTab, "items" | "review"> {
  if (field.startsWith("invoiceHeaders")) return "invoices"
  if (direction === "import" && ["representationType", "authorisationIdentifier", "authorisationCategory", "additionalAuthorisationHolders", "primaryDefermentAccount", "secondaryDefermentAccount"].includes(field)) return "documents"
  if (direction === "import" && (field === "loadingLocationId" || field.startsWith("guarantees"))) return "documents"
  if (direction === "import" && field === "presentationOffice") return "declaration"
  if (field.startsWith("domesticDutyTaxParties") || ["supervisingOffice", "warehouseType", "warehouseIdentifier", "exchangeRate"].includes(field)) return "documents"
  if (field.startsWith("importAdjustments")) return "documents"
  if (field === "borderNationality") return "transport"
  if (/^(seller|buyer|representative)/.test(field) || ["primaryDefermentAccount", "secondaryDefermentAccount"].includes(field)) return "parties"
  if (field === "declarantEori" || field === "exporterEori") return "parties"
  if (["importer", "importerEori", "additionalAuthorisationHolders", "exporter", "consignee", "carrier", "carrierIdentifier", "declarant", "representative", "seller", "buyer", "representationType", "authorisationIdentifier", "authorisationCategory"].includes(field) || /^(importer|exporter|consignee|declarant)(Name|AddressLine|City|Postcode|Country)$/.test(field)) return "parties"
  if (["exportCountry", "destinationCountry", "borderMode", "inlandMode", "containerId", "goodsLocationName", "goodsLocationIdentifier"].includes(field) || (direction === "import" && ["totalPackages", "totalGrossMass"].includes(field))) return "transport"
  if (["exitOffice", "presentationOffice", "previousDocumentCategory", "previousDocumentType", "previousDocumentReference", "headerAdditionalInformationCode", "headerAdditionalInformationDescription", "transactionNature", "tradeTerms", "tradeTermsLocation", "customsValuationMethod", "freightChargeAmount", "freightChargeCurrency", "freightChargeApportionment", "vatValueAdjustmentAmount", "vatValueAdjustmentCurrency", "vatValueAdjustmentApportionment", "insuranceCostAmount", "insuranceCostCurrency", "containerPackingCostAmount", "containerPackingCostCurrency"].includes(field) || (direction === "import" && ["totalAmount", "currency"].includes(field))) return "documents"
  return "declaration"
}

function reviewFixSectionLabel(draft: StandaloneExportDraft, issue: DeclarationIssue | undefined, providerIssue: ICustomsProviderIssue | undefined, t: (text: string) => string) {
  const itemNumber = issue?.itemNumber ?? providerIssue?.itemNumber
  if (issue?.scope === "item" || itemNumber) return itemNumber ? `${t("Invoice items")} · ${t("Item")} ${itemNumber}` : t("Invoice items")
  const field = issue?.field ?? (providerIssue ? providerIssueTarget(providerIssue) : "")
  const section = reviewSectionForField(field, draft.direction)
  if (section === "invoices") return t("Invoice header")
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
  presentationOffice: { label: "Customs office of presentation", dataElement: "5/26", maxLength: 8 },
  supervisingOffice: { label: "Supervising office", dataElement: "5/27", maxLength: 8 },
  warehouseType: { label: "Warehouse type", dataElement: "2/7", customsBox: "49", maxLength: 1 },
  warehouseIdentifier: { label: "Warehouse identifier", dataElement: "2/7", customsBox: "49", maxLength: 35 },
  exchangeRate: { label: "Exchange rate", dataElement: "4/15", customsBox: "23" },
  badgeId: { label: "Badge code" },
  ducr: { label: "DUCR", maxLength: 35 },
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
  exporterEori: { label: "Exporter EORI number", dataElement: "3/2", customsBox: "2", maxLength: 17 },
  consignee: { label: "Consignee", dataElement: "3/9", customsBox: "8" },
  declarant: { label: "Declarant", dataElement: "3/17", customsBox: "14" },
  declarantEori: { label: "Declarant EORI", dataElement: "3/17", customsBox: "14" },
  representationType: { label: "Type of representation", dataElement: "3/21", customsBox: "14", catalog: "representation_type" },
  authorisationIdentifier: { label: "Authorisation identifier" },
  authorisationCategory: { label: "Authorisation category", maxLength: 4 },
  exportCountry: { label: "Export country", dataElement: "5/14", customsBox: "15", catalog: "country" },
  destinationCountry: { label: "Country of destination", dataElement: "5/8", customsBox: "17", catalog: "country" },
  borderMode: { label: "Mode at border", dataElement: "7/4", customsBox: "25", catalog: "transport_mode" },
  transactionNature: { label: "Nature of transaction", dataElement: "8/5", customsBox: "24", catalog: "transaction_nature" },
  tradeTerms: { label: "Trade terms", dataElement: "4/1", customsBox: "20", maxLength: 3 },
  tradeTermsLocation: { label: "Incoterms additional", dataElement: "4/1", customsBox: "20", maxLength: 35 },
  freightChargeAmount: { label: "Freight costs", dataElement: "4/9", customsBox: "45" },
  freightChargeCurrency: { label: "Freight currency", dataElement: "4/9", customsBox: "45", catalog: "currency" },
  vatValueAdjustmentAmount: { label: "VAT value adjustment (AVV)", dataElement: "4/9", customsBox: "45" },
  vatValueAdjustmentCurrency: { label: "AVV currency", dataElement: "4/9", customsBox: "45", catalog: "currency" },
  insuranceCostAmount: { label: "Insurance costs", dataElement: "4/9", customsBox: "45" },
  insuranceCostCurrency: { label: "Insurance currency", dataElement: "4/9", customsBox: "45", catalog: "currency" },
  containerPackingCostAmount: { label: "Containers and packing", dataElement: "4/9", customsBox: "45" },
  containerPackingCostCurrency: { label: "Containers and packing currency", dataElement: "4/9", customsBox: "45", catalog: "currency" },
  goodsLocationName: { label: "Name of place", dataElement: "5/23", customsBox: "30" },
  goodsLocationIdentifier: { label: "Goods location identifier", dataElement: "5/23", customsBox: "30" },
  isContainerised: { label: "Transported in container", dataElement: "7/2", customsBox: "19", catalog: "container_indicator" },
  containerId: { label: "Container ID", dataElement: "7/10", customsBox: "31" },
  exitOffice: { label: "Customs office of exit", dataElement: "5/12", customsBox: "29" },
  previousDocumentCategory: { label: "Previous document category", dataElement: "2/1", customsBox: "40", catalog: "previous_document_category" },
  previousDocumentType: { label: "Previous document type", dataElement: "2/1", customsBox: "40", catalog: "previous_document_type" },
  previousDocumentReference: { label: "Previous document reference", dataElement: "2/1", customsBox: "40", maxLength: 35 },
  headerAdditionalInformationCode: { label: "Additional information code", dataElement: "2/2", customsBox: "44", maxLength: 5 },
  headerAdditionalInformationDescription: { label: "Additional information description", dataElement: "2/2", customsBox: "44", maxLength: 512 },
  commodityCode: { label: "Commodity code", dataElement: "6/14", customsBox: "33" },
  description: { label: "Description of goods", dataElement: "6/8", customsBox: "31", textarea: true },
  packageKind: { label: "Package kind", dataElement: "6/9", customsBox: "31", catalog: "package_kind" },
  packageMarks: { label: "Package marks", dataElement: "6/11", customsBox: "31" },
  packageCount: { label: "Package count", dataElement: "6/10", customsBox: "31" },
  nonPreferentialOrigin: { label: "Non-preferential origin", dataElement: "5/15", customsBox: "34", catalog: "country" },
  preferentialOrigin: { label: "Preferential origin", dataElement: "5/16", catalog: "country" },
  procedureCode: { label: "Procedure code", dataElement: "1/10", customsBox: "37", catalog: "procedure_code" },
  additionalProcedureCode: { label: "Additional procedure code", dataElement: "1/11", customsBox: "37", catalog: "additional_procedure_code" },
  grossMass: { label: "Gross mass", dataElement: "6/5", customsBox: "35", suffix: "kg" },
  netMass: { label: "Net mass", dataElement: "6/1", customsBox: "38", suffix: "kg" },
  itemPrice: { label: "Item price", dataElement: "4/14", customsBox: "42" },
  statisticalValue: { label: "Statistical value", dataElement: "8/6", customsBox: "46" },
  customsValuationMethod: { label: "Customs valuation method", dataElement: "4/16", customsBox: "43", maxLength: 1 },
  preferenceCode: { label: "Preference code", dataElement: "4/17", customsBox: "36", maxLength: 3 },
  quotaOrderNumber: { label: "Quota order number", dataElement: "8/1", customsBox: "39", maxLength: 6 },
  additionalDocumentCategory: { label: "Additional document category", dataElement: "2/3", customsBox: "44" },
  additionalDocumentType: { label: "Additional document type", dataElement: "2/3", customsBox: "44" },
  additionalDocumentId: { label: "Additional document ID", dataElement: "2/3", customsBox: "44" },
}

function reviewFieldMeta(field: string): ReviewFieldMeta {
  const taxParty = field.match(/^domesticDutyTaxParties\.(\d+)\.(partyId|roleCode)$/)
  if (taxParty) return { label: `Tax party ${Number(taxParty[1]) + 1} ${taxParty[2] === "partyId" ? "VAT identifier" : "role"}`, dataElement: "3/40", customsBox: "44" }
  const adjustment = field.match(/^importAdjustments\.(\d+)\.(code|amount|currency)$/)
  if (adjustment) return { label: `Addition or deduction ${Number(adjustment[1]) + 1} ${adjustment[2]}`, dataElement: "4/9", customsBox: "45" }
  if (field === "primaryDefermentAccount" || field === "secondaryDefermentAccount") return { label: field === "primaryDefermentAccount" ? "DAN 1" : "DAN 2", dataElement: "2/6", maxLength: 7 }
  const additionalParty = field.match(/^(seller|buyer|representative)(Name|AddressLine|City|Postcode|Country|Eori)?$/)
  if (additionalParty) {
    const [, party, suffix = ""] = additionalParty
    const [nameDE, eoriDE, box] = party === "seller" ? ["3/24", "3/25", "2"] : party === "buyer" ? ["3/26", "3/27", "8"] : ["3/19", "3/20", "14"]
    return { label: `${titleCase(party)} ${suffix === "Eori" ? "EORI number" : suffix === "AddressLine" ? "street address" : suffix.toLowerCase()}`.trim(), dataElement: suffix === "Eori" ? eoriDE : nameDE, customsBox: box, ...(suffix === "Country" ? { catalog: "country" as const } : {}) }
  }
  const contact = field.match(/^(importer|exporter|consignee|declarant)(Name|AddressLine|City|Postcode|Country)$/)
  if (!contact) return reviewFieldMetaByKey[field] ?? { label: titleCase(field) }
  const party = titleCase(contact[1])
  const suffixes: Record<string, string> = { Name: "legal name", AddressLine: "street address", City: "town or city", Postcode: "postcode", Country: "country" }
  const partyElements: Record<string, readonly [string, string]> = {
    importer: ["3/15", "8"],
    exporter: ["3/1", "2"],
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
    if (!providerIssue.itemNumber && providerIssue.dataElement === "2/2") return ["headerAdditionalInformationCode", "headerAdditionalInformationDescription"]
    return [providerIssueTarget(providerIssue)]
  }
  if (!issue) return []
  const contact = issue.id.match(/^general-(importer|exporter|consignee|declarant)-contact$/)
  if (contact) {
    return [`${contact[1]}Name`, `${contact[1]}AddressLine`, `${contact[1]}City`, `${contact[1]}Postcode`, `${contact[1]}Country`]
  }
  if (issue.id === "general-authorisation") return ["authorisationIdentifier", "authorisationCategory"]
  if (issue.id === "general-header-additional-information") return ["headerAdditionalInformationCode", "headerAdditionalInformationDescription"]
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
  if (issue?.scope === "general" && ["totalAmount", "currency", "exchangeRate", "tradeTerms", "tradeTermsLocation", "transactionNature", "totalPackages", "totalGrossMass", "totalNetMass"].includes(issue.field)) return <InvoiceHeadersSection draft={draft} onConversionDateChange={date => update("customsConversionDate", date)} onChange={headers => update("invoiceHeaders", headers)} t={t} />
  if (issue?.field.startsWith("invoiceHeaders")) return <InvoiceHeadersSection draft={draft} onConversionDateChange={date => update("customsConversionDate", date)} onChange={headers => update("invoiceHeaders", headers)} t={t} />
  if (issue?.field === "invoiceHeaderId" && itemId) return <div className="space-y-2"><InvoiceNumberSelect headers={draft.invoiceHeaders ?? []} label={t("Invoice number")} value={draft.items.find(item => item.id === itemId)?.invoiceHeaderId} onChange={value => updateItem(itemId, "invoiceHeaderId", value)} t={t} /></div>
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
    declaration_category: declarationCategories,
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
  if (field.startsWith("guarantees")) return <p className="text-[11px] text-[var(--md-text)]">{t("Open Import terms to complete the highlighted guarantee row.")}</p>
  if (field.startsWith("importAdjustments")) return <p className="text-[11px] text-[var(--md-text)]">{t("Open Import terms to complete the highlighted additions and deductions row.")}</p>
  if (!item && field.startsWith("domesticDutyTaxParties")) return <p className="text-[11px] text-[var(--md-text)]">{t("Open Import terms to complete the highlighted domestic duty tax party row.")}</p>
  if (field === "additionalAuthorisationHolders") return <p className="text-[11px] text-[var(--md-text)]">{t("Open Import terms to complete the authorisation holders.")}</p>
  if (Array.isArray(rawValue)) {
    return <p className="rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-3 text-[11px] leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("Open this goods line in Items to complete the highlighted repeatable rows.")}</p>
  }
  const value = String(rawValue ?? "")
  const meta = reviewFieldMeta(field)
  const setValue = (next: string) => {
    let normalized = next
    if (field === "traderReference") normalized = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 19)
    if (field === "tradeTerms") normalized = next.toUpperCase().slice(0, 3)
    if (field === "authorisationCategory") normalized = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)
    if (field === "headerAdditionalInformationCode") normalized = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)
    if (field === "headerAdditionalInformationDescription") normalized = next.slice(0, 512)
    if (field === "previousDocumentReference") normalized = next.replace(/[^A-Za-z0-9-]/g, "").slice(0, 35)
    if (field === "commodityCode") normalized = next.replace(/\D/g, "").slice(0, draft.direction === "export" ? 8 : 10)
    if (field === "customsValuationMethod") normalized = next.replace(/\D/g, "").slice(0, 1)
    if (field === "preferenceCode") normalized = next.replace(/\D/g, "").slice(0, 3)
    if (field === "quotaOrderNumber") normalized = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
    if (item && itemId) updateItem(itemId, field as keyof ExportDeclarationItem, normalized as never)
    else update(field as keyof StandaloneExportDraft, normalized as never)
  }
  const options = field === "preferentialOrigin" ? preferentialOriginOptions(countries, t) : field === "tradeTerms" ? customsTradeTerms.map(([code, description]) => [code, `${code} - ${t(description)}`] as const) : meta.catalog ? optionsByCatalog[meta.catalog] : undefined
  if (field === "authorisationCategory") return <SelectField label={t("Authorisation category")} dataElement="3/39" customsBox="44" showDataElements value={value} onChange={setValue} options={customsAuthorisationCategories.map(([code, description]) => [code, `${code} - ${t(description)}`] as const)} invalid />
  if (options) return <SelectField label={t(meta.label)} dataElement={meta.dataElement} customsBox={meta.customsBox} required showDataElements value={value} onChange={setValue} options={options} invalid fieldKey={`review-${itemId ?? "header"}-${field}`} />
  if (meta.textarea) return <TextAreaField label={t(meta.label)} dataElement={meta.dataElement} customsBox={meta.customsBox} required showDataElements value={value} onChange={setValue} invalid fieldKey={`review-${itemId ?? "header"}-${field}`} />
  return <TextField label={t(meta.label)} dataElement={meta.dataElement} customsBox={meta.customsBox} required showDataElements value={value} onChange={setValue} invalid fieldKey={`review-${itemId ?? "header"}-${field}`} suffix={meta.suffix} maxLength={field === "commodityCode" ? (draft.direction === "export" ? 8 : 10) : meta.maxLength} />
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
    "3/40": "domesticDutyTaxParties",
    "2/7": "warehouseIdentifier",
    "4/15": "exchangeRate",
    "5/26": "presentationOffice",
    "5/27": "supervisingOffice",
    "3/1": "exporter",
    "3/2": "exporterEori",
    "3/9": "consignee",
    "3/10": "consigneeAddressLine",
    "3/15": "importerAddressLine",
    "3/16": "importer",
    "3/17": "declarant",
    "3/18": "declarantAddressLine",
    "5/8": "destinationCountry",
    "5/14": "exportCountry",
    "5/23": "goodsLocationName",
    "2/2": "headerAdditionalInformationCode",
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
  if (["submitted", "accepted", "released", "cleared", "completed"].includes(normalizedStatus)) return "green"
  if (["rejected", "error", "lost"].includes(normalizedStatus)) return "red"
  if (normalizedStatus === "draft") return "amber"
  if (normalizedStatus === "acknowledged") return "blue"
  return "neutral"
}

function declarationRegisterOutcome(status: string): "cleared" | "rejected" | null {
  const normalizedStatus = status.trim().toLocaleLowerCase()
  if (normalizedStatus === "cleared") return "cleared"
  if (normalizedStatus === "rejected") return "rejected"
  return null
}

function providerIssueGuidance(issue: ICustomsProviderIssue) {
  if (issue.dataElement === "3/16") return "Check that the importer EORI or VAT number is recognised for this declaration."
  if (issue.dataElement === "4/16") return "Review the customs valuation method on this goods item and any values it requires."
  if (issue.dataElement === "2/3") return "Review the additional document code, or remove the optional document if it does not apply."
  if (issue.dataElement === "1/10") return "Review the procedure and additional procedure combination on this goods item."
  return "Review the highlighted customs field and the related declaration details before trying again."
}

function DeclarationFieldVisibilityPopover({ value, onChange, t }: {
  value: DeclarationFieldVisibility
  onChange: (value: DeclarationFieldVisibility) => void
  t: (text: string) => string
}) {
  const { direction } = useLanguage()
  const titleId = useId()
  const optionIds = {
    dataElements: `${titleId}-data-elements`,
    customsBoxNumbers: `${titleId}-customs-box-numbers`,
    optionalFields: `${titleId}-optional-fields`,
  }
  const options: Array<{ key: keyof DeclarationFieldVisibility; label: string; id: string }> = [
    { key: "dataElements", label: "Data elements", id: optionIds.dataElements },
    { key: "customsBoxNumbers", label: "Customs box numbers", id: optionIds.customsBoxNumbers },
    { key: "optionalFields", label: "Option fields", id: optionIds.optionalFields },
  ]

  return <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={t("Field visibility")}
        title={t("Field visibility")}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-lg)] px-2.5 text-[12px] font-medium text-[var(--md-text)] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] data-[state=open]:bg-[var(--md-hover)] data-[state=open]:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a28)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-page)] motion-reduce:active:scale-100 motion-reduce:transition-none max-sm:h-11"
      >
        <Eye className="size-4" strokeWidth={1.4} aria-hidden="true" />
        <span>{t("Fields")}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      sideOffset={6}
      dir={direction}
      aria-labelledby={titleId}
      className="w-56 gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)] data-open:animate-none! motion-reduce:data-closed:animate-none!"
    >
      <p id={titleId} className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{t("Field visibility")}</p>
      {options.map((option) => <div key={option.key} className="flex min-h-9 items-center gap-2.5 rounded-[var(--md-radius-md)] px-2 text-[12px] text-[var(--md-text)] hover:bg-[var(--md-hover)]">
        <Checkbox
          id={option.id}
          checked={value[option.key]}
          onCheckedChange={(checked) => onChange({ ...value, [option.key]: checked === true })}
        />
        <label htmlFor={option.id} className={cn("min-w-0 flex-1 cursor-pointer select-none", option.key === "dataElements" && "text-[var(--md-blue)]", option.key === "customsBoxNumbers" && "text-[var(--md-accent)]")}>{t(option.label)}</label>
      </div>)}
    </PopoverContent>
  </Popover>
}

function SectionFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const compact = useContext(CompactCustomsFormContext)
  return <section className="customs-section min-w-0" data-compact={compact || undefined}>
    <header className={cn("flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6", compact ? "mb-2" : "mb-3")}>
      <h2 className={cn("shrink-0 font-medium text-[var(--md-ink)]", compact ? "text-[13px]" : "text-[15px]")}>{title}</h2>
      {description ? <p className={cn("text-[var(--md-subtle)]", compact ? "text-[10.5px] leading-4" : "text-[12px] leading-5 sm:max-w-[65%] sm:text-end")}>{description}</p> : null}
    </header>
    <div className={cn("min-w-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "rounded-[var(--md-radius-md)] p-3" : "rounded-[var(--md-radius-lg)] p-5")}>
      {children}
    </div>
  </section>
}

function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  const compact = useContext(CompactCustomsFormContext)
  return <div data-customs-grid={className ? "explicit" : compact ? "compact" : "fields"} className={cn(
    className ? "grid" : compact ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]" : "flex flex-wrap [&>label]:basis-full sm:[&>label]:basis-[180px] sm:[&>label]:grow sm:[&>label:has(button[role=combobox])]:basis-auto sm:[&>label:has(button[role=combobox])]:grow-0",
    compact ? "gap-2" : "gap-x-3 gap-y-3",
    className,
  )}>{children}</div>
}

function FieldShell({ label, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, className, errorId, notice, asDiv, children }: { label: string; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; className?: string; errorId?: string; notice?: string; asDiv?: boolean; children: ReactNode }) {
  const FieldLabel = asDiv ? "div" : "label"
  const showCustomsBoxNumbers = useContext(CustomsBoxVisibilityContext)
  const compact = useContext(CompactCustomsFormContext)
  const errors = useContext(CustomsFieldErrorsContext)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const error = errorId && invalid && fieldKey ? errors.get(fieldKey) : undefined
  const showAnnotations = (showDataElements && dataElement) || (showCustomsBoxNumbers && customsBox)
  const noticeControl = notice ? <TooltipProvider delayDuration={300} skipDelayDuration={0}><Tooltip open={noticeOpen} onOpenChange={setNoticeOpen}><TooltipTrigger asChild><button type="button" onClick={(event) => { event.preventDefault(); setNoticeOpen(open => !open) }} className="customs-field-notice grid size-6 place-items-center rounded-full text-[var(--md-amber)] hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]" aria-label={`${label}: ${notice}`} aria-expanded={noticeOpen}><CircleAlert className="size-3.5" aria-hidden="true" /></button></TooltipTrigger><TooltipContent side="bottom" align="center" sideOffset={8} collisionPadding={16} className={customsTooltipContentClass}><span className="block whitespace-normal break-words text-pretty leading-normal"><span className="mb-1 block font-medium text-[var(--md-ink)]">{label}</span>{notice}</span></TooltipContent></Tooltip></TooltipProvider> : null
  const field = <div data-customs-field-shell data-compact={compact || undefined} data-field-invalid={invalid || undefined} data-has-notice={notice || undefined} className={cn("relative min-w-0", className)}>
    <FieldLabel className="customs-field-label">
      <span className="customs-field-caption">
        <span className="customs-field-name">{label}{required ? <span className="ms-1 text-[var(--md-red)]" aria-hidden="true">*</span> : null}</span>
        {showAnnotations ? <span className="customs-field-references">
          {showDataElements && dataElement ? <span className="rounded-[var(--md-radius-sm)] bg-[color-mix(in_srgb,var(--md-blue)_8%,transparent)] px-1 py-0.5 text-[var(--md-blue)]" dir="ltr" aria-label={`Data element ${dataElement}`} title={`Data element ${dataElement}`}>{dataElement}</span> : null}
          {showCustomsBoxNumbers && customsBox ? <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a10)] px-1 py-0.5 text-[var(--md-accent)]" dir="ltr" aria-label={`Customs box ${customsBox}`} title={`Customs box ${customsBox}`}>{customsBox}</span> : null}
        </span> : null}
      </span>
      <span data-customs-field={fieldKey} className={cn("block min-w-0 rounded-[var(--md-radius-md)] transition-[box-shadow] duration-300 motion-reduce:transition-none", highlighted && "ring-2 ring-[var(--md-accent)] shadow-[0_0_20px_var(--md-accent)]")}>{children}</span>
      {error ? <span id={errorId} aria-hidden={errorId ? true : undefined} className="customs-field-error"><CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{error}</span> : null}
    </FieldLabel>
    {noticeControl}
  </div>
  const help = showCustomsBoxNumbers && customsBox ? customsFieldHelp(label, dataElement) : undefined
  return renderCustomsFieldTooltip(field, label, help)
}

function renderCustomsFieldTooltip(field: ReactNode, label: string, help?: string) {
  if (!help) return field
  return <TooltipProvider delayDuration={1000} skipDelayDuration={0}>
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>{field}</TooltipTrigger>
      <TooltipContent side="bottom" align="center" sideOffset={10} collisionPadding={16} arrowPadding={16} sticky="always" className={customsTooltipContentClass}>
        <span className="block whitespace-normal break-words text-pretty leading-normal"><span className="mb-1 block text-balance font-medium text-[var(--md-ink)]">{label}</span>{help}</span>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
}

function TextField({ label, value, onChange, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, placeholder, suffix, maxLength, inputType = "text", inputClassName }: { label: string; value: string; onChange: (value: string) => void; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; placeholder?: string; suffix?: string; maxLength?: number; inputType?: "text" | "date"; inputClassName?: string }) {
  const errorId = useId()
  const errors = useContext(CustomsFieldErrorsContext)
  const describedBy = invalid && fieldKey && errors.has(fieldKey) ? errorId : undefined
  return <FieldShell errorId={errorId} label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}><div className="relative"><Input type={inputType} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} aria-invalid={invalid || undefined} aria-describedby={describedBy} dir="ltr" className={cn("border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]", customsSingleLineControlClass, suffix && "pe-10", inputClassName)} />{suffix ? <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--md-subtle)]">{suffix}</span> : null}</div></FieldShell>
}

function IncotermsLocationField({ value, onChange, showDataElements, invalid, highlighted, t }: {
  value: string
  onChange: (value: string) => void
  showDataElements: boolean
  invalid?: boolean
  highlighted?: boolean
  t: (text: string) => string
}) {
  const [options, setOptions] = useState<CompactComboboxOption[]>([])
  const [directoryError, setDirectoryError] = useState(false)

  useEffect(() => {
    let active = true
    void loadUnlocodeDirectory()
      .then((records) => {
        if (!active) return
        setOptions(records.map(([countryCode, locationCode, place, nameWithoutDiacritics]) => {
          const code = `${countryCode}${locationCode}`
          return {
            id: `unlocode:${code}`,
            value: code,
            label: `${code} · ${place}`,
            description: countryCode,
            keywords: [place, nameWithoutDiacritics, countryCode],
          }
        }))
      })
      .catch(() => { if (active) setDirectoryError(true) })
    return () => { active = false }
  }, [])

  return <FieldShell asDiv label={t("Incoterms additional")} dataElement="4/1" customsBox="20" required showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey="tradeTermsLocation" className="min-w-0 basis-full sm:basis-[280px] sm:grow">
    <CompactCombobox
      label={t("Incoterms additional")}
      value={value}
      options={options}
      onValueChange={(nextValue) => onChange(nextValue.slice(0, 35))}
      onOptionSelect={(option) => onChange(option.value)}
      placeholder={directoryError ? t("Enter location manually") : t("Search UN/LOCODE or type a location")}
      allLabel={t("UN/LOCODE locations")}
      emptyLabel={t("No matching location — keep typing to use your own")}
      required
      invalid={invalid}
      width="full"
      valueDirection="ltr"
      className="[&>div:first-child]:sr-only [&_input]:h-8 [&_input]:text-[11px]"
    />
  </FieldShell>
}

function CustomsOrganisationField({ party, label, value, onChange, onSelect, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey }: {
  party: CustomsOrganisationParty
  label: string
  value: string
  onChange: (value: string) => void
  onSelect: (organisation: ApiCustomerDetail) => void
  dataElement?: string
  customsBox?: string
  required?: boolean
  showDataElements: boolean
  invalid?: boolean
  highlighted?: boolean
  fieldKey?: string
}) {
  return <FieldShell label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}>
    <CustomsOrganisationCombobox party={party} label={label} value={value} onChange={onChange} onSelect={onSelect} invalid={invalid} />
  </FieldShell>
}

function CustomsOrganisationCombobox({ party, label, value, onChange, onSelect, invalid }: {
  party: CustomsOrganisationParty
  label: string
  value: string
  onChange: (value: string) => void
  onSelect: (organisation: ApiCustomerDetail) => void
  invalid?: boolean
}) {
  const { direction, t } = useLanguage()
  const directory = useContext(CustomsOrganisationDirectoryContext)
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [remoteCompanies, setRemoteCompanies] = useState<ApiCustomer[]>([])
  const [remoteSearchTerm, setRemoteSearchTerm] = useState("")
  const [remoteLoadError, setRemoteLoadError] = useState(false)
  const [selectionError, setSelectionError] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [selectionEvent, setSelectionEvent] = useState<number | null>(null)
  const selectionSequence = useRef(0)
  const selectionRef = useAutoPopulationMorph<HTMLInputElement>(selectionEvent !== null, value, undefined, selectionEvent)
  const remoteRequestSequence = useRef(0)
  const listId = useId()
  const helpId = `${listId}-help`
  const roleTypes = customsOrganisationTypesByParty[party]
  const normalizedSearch = searchTerm.trim().normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase()
  const partyTypeNames = useMemo(() => new Set(roleTypes.map((type) => type.toLocaleLowerCase())), [roleTypes])
  const localCompanies = useMemo(() => directory.companies.filter((company) => {
    if (!company.types.some((type) => partyTypeNames.has(type.toLocaleLowerCase()))) return false
    if (!normalizedSearch) return true
    const searchable = [company.name, company.accountCode, company.location, company.industry, ...company.types]
      .filter(Boolean)
      .join(" ")
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
    return searchable.includes(normalizedSearch)
  }), [directory.companies, normalizedSearch, partyTypeNames])
  const companies = useMemo(() => {
    const matchingRemoteCompanies = remoteSearchTerm === normalizedSearch ? remoteCompanies : []
    const seen = new Set<string>()
    return [...localCompanies, ...matchingRemoteCompanies].filter((company) => {
      if (seen.has(company.id)) return false
      seen.add(company.id)
      return true
    })
  }, [localCompanies, normalizedSearch, remoteCompanies, remoteSearchTerm])
  const loadError = (directory.error && !directory.companies.length) || selectionError
  const optionId = highlightedIndex >= 0 && companies[highlightedIndex] ? `${listId}-option-${highlightedIndex}` : undefined

  // Warm only the leading suggestions and the option under consideration. The
  // existing user-scoped CRM cache coalesces these with the eventual selection.
  const leadingCompanyIds = companies.slice(0, 3).map(company => company.id).join(",")
  const highlightedCompanyId = companies[highlightedIndex]?.id
  useEffect(() => {
    if (!open) return
    const ids = new Set([...leadingCompanyIds.split(",").filter(Boolean), ...(highlightedCompanyId ? [highlightedCompanyId] : [])])
    const timer = window.setTimeout(() => {
      for (const id of ids) void getCustomer(id).catch(() => undefined)
    }, 100)
    return () => window.clearTimeout(timer)
  }, [open, leadingCompanyIds, highlightedCompanyId])

  useEffect(() => () => { selectionSequence.current += 1 }, [])

  useEffect(() => {
    if (!open || normalizedSearch.length < 2) {
      remoteRequestSequence.current += 1
      setRemoteCompanies([])
      setRemoteSearchTerm("")
      setRemoteLoadError(false)
      return
    }
    const requestSequence = remoteRequestSequence.current + 1
    remoteRequestSequence.current = requestSequence
    const timer = window.setTimeout(() => {
      listAccountsPage({
        organisationType: "company",
        search: searchTerm.trim(),
        filterQuery: customsOrganisationTypeFilter(party),
        sort: { id: "account", direction: "asc" },
        limit: 50,
        offset: 0,
      }).then((page) => {
        if (remoteRequestSequence.current !== requestSequence) return
        setRemoteCompanies(page.rows)
        setRemoteSearchTerm(normalizedSearch)
        setRemoteLoadError(false)
      }).catch((reason) => {
        console.warn(`Customs ${party} organisation suggestions could not be refreshed.`, reason)
        if (remoteRequestSequence.current === requestSequence) setRemoteLoadError(true)
      })
    }, 140)
    return () => window.clearTimeout(timer)
  }, [normalizedSearch, open, party, searchTerm])

  useEffect(() => {
    setHighlightedIndex((current) => current >= companies.length ? -1 : current)
  }, [companies.length])

  useEffect(() => {
    if (!optionId) return
    document.getElementById(optionId)?.scrollIntoView({ block: "nearest" })
  }, [optionId])

  async function choose(organisation: ApiCustomer) {
    if (selectingId) return
    const requestSequence = ++selectionSequence.current
    setSelectingId(organisation.id)
    setSelectionError(false)
    try {
      const detail = await getCustomer(organisation.id)
      if (selectionSequence.current !== requestSequence) return
      setSelectionEvent(event => (event ?? 0) + 1)
      onSelect(detail)
      setOpen(false)
      setSearchTerm("")
      setHighlightedIndex(-1)
    } catch (reason) {
      if (selectionSequence.current !== requestSequence) return
      console.error(`Customs ${party} organisation details could not be loaded.`, reason)
      setSelectionError(true)
    } finally {
      if (selectionSequence.current === requestSequence) setSelectingId(null)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => companies.length ? (current + 1) % companies.length : -1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => companies.length ? (current <= 0 ? companies.length - 1 : current - 1) : -1)
      return
    }
    if (event.key === "Home" && open && companies.length) {
      event.preventDefault()
      setHighlightedIndex(0)
      return
    }
    if (event.key === "End" && open && companies.length) {
      event.preventDefault()
      setHighlightedIndex(companies.length - 1)
      return
    }
    if (event.key === "Enter" && open && highlightedIndex >= 0 && companies[highlightedIndex]) {
      event.preventDefault()
      void choose(companies[highlightedIndex])
      return
    }
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
      setHighlightedIndex(-1)
    }
  }

  return <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setHighlightedIndex(-1) }}>
    <PopoverAnchor asChild>
      <div className="relative">
        <Input
          ref={selectionRef}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={optionId}
          aria-describedby={loadError ? helpId : undefined}
          aria-invalid={invalid || undefined}
          aria-busy={selectingId !== null || undefined}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onFocus={() => { setSearchTerm(""); setOpen(true) }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            selectionSequence.current += 1
            setSelectingId(null)
            onChange(event.target.value)
            setSearchTerm(event.target.value)
            setHighlightedIndex(-1)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("Name, EORI or company…")}
          dir="ltr"
          className={cn(
            "border-0 bg-[var(--md-field-bg)] pe-9 shadow-[var(--md-shadow-line)]",
            customsSingleLineControlClass,
            "pe-8",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        />
        {selectingId ? <LoaderCircle className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)] motion-reduce:animate-none" aria-hidden="true" /> : <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" aria-hidden="true" />}
      </div>
    </PopoverAnchor>
    <PopoverContent
      align="start"
      sideOffset={5}
      dir={direction}
      onOpenAutoFocus={(event) => event.preventDefault()}
      className="w-[var(--radix-popover-trigger-width)]! max-w-[calc(100vw-1rem)] rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]"
    >
      <p className="sr-only" role="status" aria-live="polite">{companies.length} {t("matching companies")}</p>
      <div id={listId} role="listbox" aria-label={`${label} ${t("company options")}`} className="min-h-11 max-h-64 overflow-y-auto p-1 md-scrollbar">
        {companies.map((company, index) => {
          const matchingTypes = company.types.filter((type) => roleTypes.some((candidate) => candidate.toLocaleLowerCase() === type.toLocaleLowerCase()))
          return <button
            id={`${listId}-option-${index}`}
            key={company.id}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={company.name === value}
            disabled={Boolean(selectingId)}
            onMouseMove={() => setHighlightedIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void choose(company)}
            className={cn(
              "flex min-h-11 w-full items-center gap-2.5 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start hover:bg-[var(--md-hover)] disabled:opacity-60",
              company.name === value && "bg-[var(--md-selected-bg)]",
              index === highlightedIndex && "bg-[var(--md-hover)] ring-1 ring-inset ring-[var(--md-accent-a18)]",
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[10px] font-medium text-[var(--md-ink)]" data-i18n-skip>{company.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-[var(--md-ink)]">{company.name}</span>
              <span className="mt-0.5 block truncate text-[10.5px] text-[var(--md-subtle)]">{[matchingTypes.map((type) => t(type)).join(", "), company.location].filter(Boolean).join(" · ")}</span>
            </span>
            {selectingId === company.id ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-label={t("Loading company details")} /> : company.name === value ? <CheckCircle2 className="size-3.5 shrink-0 text-[var(--md-accent)]" aria-hidden="true" /> : null}
          </button>
        })}
        {!loadError && directory.ready && !companies.length && (!normalizedSearch || remoteSearchTerm === normalizedSearch || remoteLoadError) ? <p className="px-3 py-5 text-center text-[12px] text-[var(--md-subtle)]">{t("No companies of the right type match this search.")}</p> : null}
        {loadError ? <p id={helpId} role="alert" className="px-3 py-4 text-[11px] leading-4 text-[var(--md-red)]"><strong className="block font-medium">{t("Company suggestions unavailable.")}</strong>{t("You can keep typing the party name or EORI manually.")}</p> : null}
      </div>
    </PopoverContent>
  </Popover>
}

function TextAreaField({ label, value, onChange, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, className }: { label: string; value: string; onChange: (value: string) => void; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; className?: string }) {
  const errorId = useId()
  const errors = useContext(CustomsFieldErrorsContext)
  const describedBy = invalid && fieldKey && errors.has(fieldKey) ? errorId : undefined
  const compact = useContext(CompactCustomsFormContext)
  return <FieldShell errorId={errorId} label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey} className={className}><Textarea value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={cn("border-0 bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]", customsMultilineControlClass, compact ? "min-h-8 px-2 py-1.5 text-[11px]" : "min-h-9 text-[13px]")} /></FieldShell>
}

function SelectField({ label, value, onChange, options, dataElement, customsBox, required, showDataElements, invalid, highlighted, fieldKey, labelOnly = false }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<CustomsReferenceOptionTuple>; dataElement?: string; customsBox?: string; required?: boolean; showDataElements: boolean; invalid?: boolean; highlighted?: boolean; fieldKey?: string; labelOnly?: boolean }) {
  const errorId = useId()
  const errors = useContext(CustomsFieldErrorsContext)
  const describedBy = invalid && fieldKey && errors.has(fieldKey) ? errorId : undefined
  const referenceState = useContext(CustomsReferenceDataContext)
  return <FieldShell errorId={errorId} label={label} dataElement={dataElement} customsBox={customsBox} required={required} showDataElements={showDataElements} invalid={invalid} highlighted={highlighted} fieldKey={fieldKey}><CustomsReferenceCombobox describedBy={describedBy} label={label} value={value} onChange={onChange} options={options} placeholder={options.find(([optionValue]) => !optionValue)?.[1] ?? "–"} disabled={referenceState.loading || Boolean(referenceState.error) || options.filter(([optionValue]) => optionValue).length === 0} invalid={invalid} labelOnly={labelOnly} /></FieldShell>
}

function Summary({ label, value, valueDirection }: { label: string; value: string; valueDirection?: "ltr" | "rtl" }) {
  return <div className="flex justify-between gap-4 py-2.5"><dt className="text-[11px] text-[var(--md-subtle)]">{label}</dt><dd dir={valueDirection} className="m-0 min-w-0 break-all text-end text-[12px] font-medium text-[var(--md-ink)]">{value}</dd></div>
}
