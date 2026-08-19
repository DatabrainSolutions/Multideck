import "@/quotes-transfer.css"
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import {
  AiBrain,
  Activity,
  Building2,
  CalendarClock,
  ChartBar,
  Check,
  CircleDollarSign,
  Container,
  Database,
  FileText,
  KanbanSquare,
  MessageCircle,
  PanelRightClose,
  Paperclip,
  Plus,
  Route,
  RotateCcw,
  Save,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  Star,
  ShieldCheck,
  Table2,
  TriangleAlert,
  WalletCards,
  X,
} from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { MultideckDateRangePicker } from "@/components/multideck/date-picker"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { cn } from "@/lib/utils"
import { useKanbanPointerDrag } from "@/lib/kanban-drag"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { useLanguage } from "@/i18n/language-provider"
import {
  bookingCargo,
  bookingDocuments,
  bookingFilters,
  bookingMetrics,
  bookingMilestones,
  bookings,
  bookingTimeline,
  currentOperator,
  getBookingShape,
  operatorJobs,
  type BookingMode,
  type BookingStatus,
  type StatusTone,
} from "@/data/multideck-data"
import { FilterChips, SegmentedControl, TabsRail } from "./workflow-components"
import { StatusPill, attributeToneFor, toneToVar } from "./status-pill"
import { Surface } from "./surface"
import { AnimatedList } from "./animated-list"
import { getLiveBooking, type LiveBooking } from "@/lib/application-data-api"
import { CopyFeedbackTransition, CopyStatusIcon } from "./copyable-field"

export type Booking = (typeof bookings)[number]
export type OperatorJob = (typeof operatorJobs)[number]
export const bookingViewModes = ["Table", "Board"] as const
export type BookingViewMode = (typeof bookingViewModes)[number]
export const bookingViewOptions = [
  { value: "Table", label: "Table", icon: Table2 },
  { value: "Board", label: "Board", icon: KanbanSquare },
] as const
const bookingDetailTabs = ["Overview", "Details", "Documents", "Customs", "Finance", "Audit"] as const
type BookingDetailTab = (typeof bookingDetailTabs)[number]
export const bookingSearchFieldOptions = [
  { value: "any", label: "Any field", placeholder: "ID, invoice, customer, VIN..." },
  { value: "invoice", label: "Invoice", placeholder: "INV-MAR-8841" },
  { value: "jobRef", label: "Job ref", placeholder: "JOB-LON-22481" },
  { value: "customerRef", label: "Customer ref", placeholder: "MAR-PO-7781" },
  { value: "supplierRef", label: "Supplier ref", placeholder: "YH-SO-1440" },
  { value: "date", label: "Date / range", placeholder: "Start date" },
  { value: "destination", label: "Destination", placeholder: "Felixstowe" },
  { value: "origin", label: "Origin", placeholder: "Ningbo" },
  { value: "vessel", label: "Vessel / flight", placeholder: "COSCO Pride" },
  { value: "departure", label: "Departure", placeholder: "Departure date" },
  { value: "arrival", label: "Arrival", placeholder: "Arrival date" },
  { value: "vin", label: "VIN", placeholder: "WVWZZZ..." },
  { value: "customFields", label: "Custom fields", placeholder: "HS code, buyer, licence..." },
] as const
export type BookingSearchField = (typeof bookingSearchFieldOptions)[number]["value"]
export type BookingSearchCriterion = {
  id: string
  connector?: "and" | "or"
  groupConnector?: "and" | "or"
  groupId?: string
  field: BookingSearchField
  value: string
  valueTo?: string
}

const dateSearchFields = new Set<BookingSearchField>(["date", "departure", "arrival"])

function getSearchFieldMeta(field: BookingSearchField) {
  return bookingSearchFieldOptions.find((option) => option.value === field) ?? bookingSearchFieldOptions[0]
}

export function getBookingDetailPath(id: string) {
  return `/bookings/${id.toLowerCase()}`
}

type BookingDetailRecord = {
  id: string
  booking: LiveBooking
  job?: OperatorJob
}

const statusTone: Record<BookingStatus, StatusTone> = {
  "On track": "green",
  Delayed: "amber",
  Exception: "red",
}

const modeTone: Record<BookingMode, StatusTone> = {
  OCEAN: "blue",
  AIR: "green",
  ROAD: "amber",
  MULTIMODAL: "teal",
  FAS: "teal",
  FSA: "blue",
}

const customsEntries: readonly [string, string, string, StatusTone][] = [
  ["CDS entry", "Submitted 08:30 by Wei Chen", "waiting docs", "amber" as StatusTone],
  ["CN export licence", "Missing from document set", "critical", "red" as StatusTone],
  ["HS-code match", "8517.62.00 dual-use telecom equipment", "flagged", "red" as StatusTone],
  ["Broker handoff", "Yong Hua Logistics + Wei Chen", "ready", "green" as StatusTone],
]

const costRows = [
  ["Ocean freight", "Booked with EVERGREEN", "USD 6,840.00"],
  ["Origin handling", "Shanghai terminal + drayage", "USD 1,120.00"],
  ["Destination handling", "Long Beach release + terminal", "USD 1,480.00"],
  ["Duty estimate", "HS 8517.62.00 · 2.6%", "USD 4,789.20"],
  ["Demurrage risk", "Hold may cross free-time window", "USD 720.00"],
]

const commMessages = [
  ["Elena Moreno", "Asked Yong Hua for the missing CN export licence and packing-list confirmation.", "09:48"],
  ["Wei Chen", "Broker can resubmit CDS as soon as licence PDF is attached to MD-22455.", "09:35"],
  ["AI draft", "Prepared shipper email with invoice, HS-code and container references included.", "09:28"],
]

const askStarterMessages = [
  {
    role: "assistant",
    text: "The customs hold was raised because the HS-code match expects a CN export licence. It is separate from the +36h berth congestion delay.",
  },
]

const askSuggestions = ["Explain the hold", "What costs changed?", "Draft shipper email"]

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <StatusPill kind="status" tone={statusTone[status]}>{status}</StatusPill>
}

export function BookingModePill({ mode }: { mode: BookingMode }) {
  return <StatusPill kind="attribute" tone={modeTone[mode]} className="min-w-[88px] justify-center">{mode}</StatusPill>
}

export function BookingShapeCell({ booking }: { booking: Booking }) {
  const liveShape = booking as Booking & Partial<Pick<LiveBooking, "direction" | "shipmentType">>
  const storedShape = getBookingShape(booking.id)
  const shape = {
    direction: liveShape.direction || storedShape.direction,
    shipmentType: liveShape.shipmentType || storedShape.shipmentType,
  }

  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{shape.direction}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <BookingModePill mode={booking.mode} />
        <span className="truncate text-[11px] text-[var(--md-text)]">{shape.shipmentType}</span>
      </div>
    </div>
  )
}

export function BookingMetricCard({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <Surface padding="none" className="flex min-h-[52px] items-center justify-between gap-3 rounded-[var(--md-radius-xl)] px-4 py-2.5">
      <p className="text-[12px] font-medium text-[var(--md-text)]">{label}</p>
      <strong
        className={cn(
          "block text-[22px] font-medium leading-none tracking-normal tabular-nums",
          tone === "neutral" ? "text-[var(--md-ink)]" : undefined,
        )}
        style={{ color: tone === "neutral" ? undefined : toneToVar(tone) }}
      >
        {value}
      </strong>
    </Surface>
  )
}

export type BookingMetricSummary = {
  active: number
  inTransit: number
  atDestination: number
  exceptions: number
  complete: number
}

export function BookingMetricStrip({ rows = bookings, summary }: { rows?: readonly Booking[]; summary?: BookingMetricSummary }) {
  const { t } = useLanguage()
  const values = summary ?? {
    active: rows.filter((booking) => booking.progress < 100).length,
    inTransit: rows.filter((booking) => booking.progress >= 25 && booking.progress < 75).length,
    atDestination: rows.filter((booking) => booking.progress >= 75 && booking.progress < 100).length,
    exceptions: rows.filter((booking) => booking.status === "Exception").length,
    complete: rows.filter((booking) => booking.progress >= 100).length,
  }
  const metrics = [
    { label: "Active", value: String(values.active), tone: "neutral" as StatusTone },
    { label: "In transit", value: String(values.inTransit), tone: "teal" as StatusTone },
    { label: "At destination", value: String(values.atDestination), tone: "blue" as StatusTone },
    { label: "Exceptions", value: String(values.exceptions), tone: "red" as StatusTone },
    { label: "Complete", value: String(values.complete), tone: "green" as StatusTone },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {metrics.map((metric, index) => (
        <div key={metric.label} className={index === metrics.length - 1 ? "col-span-2 lg:col-span-1" : undefined}>
          <BookingMetricCard {...metric} label={t(metric.label)} />
        </div>
      ))}
    </div>
  )
}

export function YourJobsPanel({
  favouriteIds,
  onToggleFavourite,
  onOpenJob,
  onOpenBooking,
  onOpenJobDrilldown,
  panelLayoutId,
  getJobLayoutId,
  compact = false,
  animated = false,
}: {
  favouriteIds: Set<string>
  onToggleFavourite: (id: string) => void
  onOpenJob?: (job: OperatorJob) => void
  onOpenBooking?: (booking: Booking) => void
  onOpenJobDrilldown?: (jobId: string) => void
  panelLayoutId?: string
  getJobLayoutId?: (jobId: string) => string
  compact?: boolean
  animated?: boolean
}) {
  const visibleJobs = compact ? operatorJobs.slice(0, 4) : operatorJobs
  const content = (
    <Surface padding="none" className="md-your-jobs-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="md-your-jobs-header flex shrink-0 flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Your jobs</h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">
            {animated
              ? `Current work owned by ${currentOperator.name}.`
              : `Current work owned by ${currentOperator.name}. Favourites stay pinned so active bookings do not get lost in the full list.`}
          </p>
        </div>
        <StatusPill tone="teal">{visibleJobs.length} active</StatusPill>
      </div>

      {animated ? (
        <div className="md-your-jobs-list-shell min-h-0 flex-1 overflow-auto px-4 pb-4">
          <AnimatedList
            items={[...visibleJobs]}
            maxHeight="none"
            displayScrollbar={false}
            showGradients={false}
            itemElement="div"
            selectionBehavior="click"
            listClassName="md-your-jobs-grid grid gap-2 overflow-visible p-1 pr-1 md:grid-cols-2 xl:grid-cols-5"
            itemClassName="h-full !rounded-[var(--md-radius-lg)] !bg-[var(--md-job-card-bg)] p-0 shadow-[var(--md-job-card-shadow)] hover:scale-[1.01] hover:!bg-[var(--md-job-card-hover)] hover:shadow-[var(--md-job-card-hover-shadow)] focus-visible:!bg-[var(--md-job-card-selected)] focus-visible:shadow-[var(--md-shadow-green-card-selected)] aria-selected:!bg-[var(--md-job-card-selected)] aria-selected:shadow-[var(--md-shadow-green-card-selected)]"
            ariaLabel="Your active jobs"
            getItemKey={(job) => job.id}
            onItemSelect={(job) => {
              const booking = bookings.find((item) => item.id === job.bookingId)
              if (onOpenJob) {
                onOpenJob(job)
                return
              }
              if (booking && onOpenBooking) {
                onOpenBooking(booking)
                return
              }
              onOpenJobDrilldown?.(job.id)
            }}
            renderItem={(job) => {
              const isFavourite = favouriteIds.has(job.bookingId)

              return (
                <motion.div layoutId={getJobLayoutId?.(job.id)} className="md-your-job-card flex h-full min-h-[126px] flex-col justify-between gap-3 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{job.task}</p>
                      <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{job.customer}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${isFavourite ? "Remove" : "Add"} ${job.bookingId} favourite`}
                      aria-pressed={isFavourite}
                      className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white hover:text-[var(--md-amber)] hover:shadow-[var(--md-shadow-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(221,138,43,0.2)]", isFavourite && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] shadow-[var(--md-shadow-line)]")}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleFavourite(job.bookingId)
                      }}
                    >
                      <Star className={cn("size-3.5", isFavourite && "fill-current")} strokeWidth={1.35} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-[var(--md-text)]">Due {job.due}</span>
                    <StatusPill tone={job.tone}>{job.status}</StatusPill>
                  </div>
                </motion.div>
              )
            }}
          />
        </div>
      ) : (
        <div className="divide-y divide-[rgba(11,20,19,0.06)] shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]">
          {visibleJobs.map((job) => {
            const booking = bookings.find((item) => item.id === job.bookingId)
            const isFavourite = favouriteIds.has(job.bookingId)
            const canOpen = Boolean(onOpenJob || (booking && onOpenBooking))

            return (
              <div key={job.id} className={cn("grid gap-3 px-5 py-4", compact ? "md:grid-cols-[32px_minmax(0,1fr)_82px]" : "md:grid-cols-[34px_120px_minmax(0,1fr)_104px_116px] md:items-center")}>
                <button
                  type="button"
                  aria-label={`${isFavourite ? "Remove" : "Add"} ${job.bookingId} favourite`}
                  aria-pressed={isFavourite}
                  className={cn(
                    "grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-white/52 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white hover:text-[var(--md-amber)]",
                    isFavourite && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]",
                  )}
                  onClick={() => onToggleFavourite(job.bookingId)}
                >
                  <Star className={cn("size-4", isFavourite && "fill-current")} strokeWidth={1.35} />
                </button>
                {!compact ? (
                  <div>
                    <p className="text-[13px] font-medium text-[var(--md-ink)]">{job.bookingId}</p>
                    <p className="mt-1 text-[12px] text-[var(--md-text)]">Due {job.due}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  className={cn("min-w-0 text-left", canOpen && "transition-colors hover:text-[var(--md-accent)]")}
                  disabled={!canOpen}
                  onClick={() => {
                    if (onOpenJob) {
                      onOpenJob(job)
                      return
                    }
                    if (booking) onOpenBooking?.(booking)
                  }}
                >
                  <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{job.task}</p>
                  <p className="mt-1 truncate text-[13px] text-[var(--md-text)]">{job.customer} · {job.route}</p>
                  {!compact ? <p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{job.detail}</p> : null}
                </button>
                {!compact ? <p className="text-[13px] font-medium text-[var(--md-text)]">Due {job.due}</p> : null}
                <StatusPill tone={job.tone} className="w-fit">{job.status}</StatusPill>
              </div>
            )
          })}
        </div>
      )}
    </Surface>
  )

  if (panelLayoutId) {
    return <motion.div layoutId={panelLayoutId}>{content}</motion.div>
  }

  return content
}

export function BookingViewSwitch({
  value,
  onChange,
}: {
  value: BookingViewMode
  onChange: (value: BookingViewMode) => void
}) {
  const { t } = useLanguage()

  return (
    <SegmentedControl
      options={bookingViewModes}
      value={value}
      onChange={onChange}
      ariaLabel={t("Booking view")}
      className="shrink-0 [&_button]:size-8 [&_button]:h-8 [&_button]:px-0"
      renderOption={(option) => {
        const view = bookingViewOptions.find((candidate) => candidate.value === option) ?? bookingViewOptions[0]
        const Icon = view.icon
        return (
          <>
            <Icon className="size-3.5" strokeWidth={1.45} aria-hidden="true" />
            <span className="sr-only">{t(view.label)}</span>
          </>
        )
      }}
    />
  )
}

export function BookingListHeader({
  viewMode,
  onViewModeChange,
  onSpeakToDexter,
}: {
  viewMode: BookingViewMode
  onViewModeChange: (mode: BookingViewMode) => void
  onSpeakToDexter: () => void
}) {
  const { t } = useLanguage()

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Bookings")}</h1>
      <div className="flex shrink-0 items-center gap-2">
        <DexterActionPill onClick={onSpeakToDexter} />
        <BookingViewSwitch value={viewMode} onChange={onViewModeChange} />
      </div>
    </div>
  )
}

function BookingAdvancedSearch({
  criteria,
  onCriteriaChange,
  resultCount,
  totalCount,
  initialOpen = false,
}: {
  criteria: BookingSearchCriterion[]
  onCriteriaChange: (criteria: BookingSearchCriterion[]) => void
  resultCount: number
  totalCount: number
  initialOpen?: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  const [draftCriteria, setDraftCriteria] = useState(criteria)
  const activeCriteria = criteria.filter(hasSearchValue)
  const draftGroupedCriteria = groupBookingSearchCriteria(draftCriteria)
  const activeGroupedCriteria = groupBookingSearchCriteria(criteria)
    .map((group) => ({ ...group, criteria: group.criteria.filter(hasSearchValue) }))
    .filter((group) => group.criteria.length > 0)
  const summaries = activeGroupedCriteria.flatMap((group, groupIndex) => (
    group.criteria.map((criterion, criterionIndex) => formatCriterionSummary(criterion, criterionIndex, groupIndex))
  ))

  useEffect(() => {
    if (!open) setDraftCriteria(criteria)
  }, [criteria, open])

  function openDialog() {
    setDraftCriteria(criteria)
    setOpen(true)
  }

  function updateCriterion(id: string, patch: Partial<BookingSearchCriterion>) {
    setDraftCriteria((current) => (
      current.map((criterion) => {
        if (criterion.id !== id) return criterion
        const nextField = patch.field ?? criterion.field
        const next = { ...criterion, ...patch, field: nextField }
        return dateSearchFields.has(nextField) ? next : { ...next, valueTo: "" }
      })
    ))
  }

  function addCriterionToGroup(groupId: string) {
    setDraftCriteria((current) => [
      ...current,
      {
        id: `booking-search-${Date.now()}`,
        connector: "and",
        groupId,
        field: "invoice",
        value: "",
        valueTo: "",
      },
    ])
  }

  function addGroup() {
    const groupId = `booking-search-group-${Date.now()}`

    setDraftCriteria((current) => [
      ...current,
      {
        id: `${groupId}-criterion`,
        connector: "and",
        groupConnector: "or",
        groupId,
        field: "invoice",
        value: "",
        valueTo: "",
      },
    ])
  }

  function updateGroupConnector(groupId: string, connector: "and" | "or") {
    setDraftCriteria((current) => (
      current.map((criterion) => (
        (criterion.groupId ?? "booking-search-main") === groupId ? { ...criterion, groupConnector: connector } : criterion
      ))
    ))
  }

  function removeCriterion(id: string) {
    setDraftCriteria((current) => {
      const next = current.filter((criterion) => criterion.id !== id)
      return next.length ? next : [{ id: "booking-search-any", field: "any", value: "", valueTo: "" }]
    })
  }

  function removeGroup(groupId: string) {
    setDraftCriteria((current) => {
      const next = current.filter((criterion) => (criterion.groupId ?? "booking-search-main") !== groupId)
      return next.length ? next : [{ id: "booking-search-any", field: "any", value: "", valueTo: "" }]
    })
  }

  function clearCriteria() {
    const next: BookingSearchCriterion[] = [{ id: "booking-search-any", field: "any", value: "", valueTo: "" }]
    setDraftCriteria(next)
    onCriteriaChange(next)
  }

  function applyCriteria() {
    onCriteriaChange(draftCriteria)
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        className="h-9 rounded-full bg-white/35 px-3 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/58 hover:text-[var(--md-ink)]"
        onClick={openDialog}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.35} />
        Filters
        {activeCriteria.length ? (
          <span className="ms-1 grid min-w-5 place-items-center rounded-full bg-[var(--md-accent)] px-1.5 text-[11px] text-[var(--md-accent-ink)]" data-i18n-skip dir="ltr">
            {activeCriteria.length}
          </span>
        ) : null}
      </Button>

      {summaries.map((summary, index) => (
        <span key={`${summary}-${index}`} className="inline-flex h-8 max-w-[230px] items-center truncate rounded-full bg-white/28 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
          {summary}
        </span>
      ))}

      {activeCriteria.length ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-full px-3 text-[12px] font-medium text-[var(--md-text)] hover:bg-white/55 hover:text-[var(--md-ink)]"
          onClick={clearCriteria}
        >
          Clear
        </Button>
      ) : null}

      <span className="inline-flex h-8 items-center rounded-full bg-white/20 px-3 text-[12px] font-medium text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
        <span data-i18n-skip dir="ltr">{resultCount}/{totalCount}</span>
        <span className="ms-1">shown</span>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-28px)] !w-[calc(100vw-28px)] !max-w-[900px] overflow-hidden rounded-[var(--md-radius-2xl)] border-0 bg-[rgba(251,253,253,0.98)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:!w-[calc(100vw-40px)]"
        >
          <DialogHeader className="px-5 pb-2 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-[18px] font-medium leading-6 tracking-normal text-[var(--md-ink)]">Filter bookings</DialogTitle>
                <DialogDescription className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
                  Advanced booking search
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close filters"
                  className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-white/70 hover:text-[var(--md-ink)]"
                >
                  <X className="size-4" strokeWidth={1.35} />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="max-h-[min(64dvh,620px)] overflow-y-auto px-5 pb-4 pt-2 md-scrollbar">
            <div className="grid gap-3">
              {draftGroupedCriteria.map((group, groupIndex) => (
                <div key={group.id} className="grid gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {groupIndex === 0 ? (
                        <span className="h-7 rounded-full bg-white/68 px-3 py-1 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">Where</span>
                      ) : (
                        <Select value={group.connector} onValueChange={(value) => updateGroupConnector(group.id, value as "and" | "or")}>
                          <SelectTrigger className="h-7 w-[112px] rounded-full border-0 bg-white/68 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-[var(--md-radius-lg)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-line)]">
                            <SelectItem value="and" className="text-[13px]">And group</SelectItem>
                            <SelectItem value="or" className="text-[13px]">Or group</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <span className="text-[12px] font-medium text-[var(--md-subtle)]">Group {groupIndex + 1}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]"
                        onClick={() => addCriterionToGroup(group.id)}
                      >
                        <Plus className="size-3.5" strokeWidth={1.45} />
                        Add filter
                      </Button>
                      {draftGroupedCriteria.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove group"
                          className="size-7 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-white/65 hover:text-[var(--md-ink)]"
                          onClick={() => removeGroup(group.id)}
                        >
                          <X className="size-3.5" strokeWidth={1.35} />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {group.criteria.map((criterion, criterionIndex) => {
                      const meta = getSearchFieldMeta(criterion.field)
                      const isDateSearch = dateSearchFields.has(criterion.field)

                      return (
                        <div
                          key={criterion.id}
                          className="grid gap-2 rounded-[var(--md-radius-lg)] bg-white/46 p-1.5 shadow-[var(--md-shadow-line)] md:grid-cols-[108px_190px_minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            {criterionIndex === 0 ? (
                              <span className="flex h-9 items-center px-2 text-[12px] font-medium text-[var(--md-subtle)]">{groupIndex === 0 ? "Where" : "Match"}</span>
                            ) : (
                              <Select value={criterion.connector ?? "and"} onValueChange={(connector) => updateCriterion(criterion.id, { connector: connector as "and" | "or" })}>
                                <SelectTrigger className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-[var(--md-radius-lg)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-line)]">
                                  <SelectItem value="and" className="text-[13px]">And</SelectItem>
                                  <SelectItem value="or" className="text-[13px]">Or</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>

                          <label className="sr-only" htmlFor={`${criterion.id}-field`}>Criterion field</label>
                          <Select value={criterion.field} onValueChange={(field) => updateCriterion(criterion.id, { field: field as BookingSearchField, value: "", valueTo: "" })}>
                            <SelectTrigger
                              id={`${criterion.id}-field`}
                              className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                            >
                              <SelectValue placeholder="Choose field" />
                            </SelectTrigger>
                            <SelectContent className="rounded-[var(--md-radius-lg)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-line)]">
                              {bookingSearchFieldOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value} className="text-[13px]">
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {isDateSearch ? (
                            <MultideckDateRangePicker
                              value={{ start: criterion.value, end: criterion.valueTo ?? "" }}
                              onChange={(range) => updateCriterion(criterion.id, { value: range.start ?? "", valueTo: range.end ?? "" })}
                              placeholder={meta.placeholder}
                              title={`${meta.label} range`}
                              description="Pick a start date, then an end date."
                              startLabel="Start date"
                              endLabel="End date"
                              footerLabel="Selected date range"
                              allowClear
                              triggerClassName="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[13px] shadow-[var(--md-shadow-line)]"
                            />
                          ) : (
                            <>
                              <label className="sr-only" htmlFor={`${criterion.id}-value`}>{meta.label}</label>
                              <div className="relative">
                                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.25} />
                                <Input
                                  id={`${criterion.id}-value`}
                                  value={criterion.value}
                                  placeholder={meta.placeholder}
                                  onChange={(event) => updateCriterion(criterion.id, { value: event.target.value })}
                                  className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] ps-9 text-[13px] shadow-[var(--md-shadow-line)]"
                                  dir="auto"
                                />
                              </div>
                            </>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove criterion"
                            className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-white/70 hover:text-[var(--md-ink)]"
                            onClick={() => removeCriterion(criterion.id)}
                          >
                            <X className="size-4" strokeWidth={1.35} />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="m-0 flex-col-reverse gap-2 rounded-b-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface-soft)] px-5 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]"
                onClick={addGroup}
              >
                <Plus className="size-3.5" strokeWidth={1.45} />
                Add group
              </Button>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-white/65 hover:text-[var(--md-ink)]">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" className="h-9 rounded-[var(--md-radius-md)] px-4 text-[13px] font-medium" onClick={applyCriteria}>
                Apply filters
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

void BookingAdvancedSearch

function hasSearchValue(criterion: BookingSearchCriterion) {
  return Boolean(criterion.value.trim() || criterion.valueTo?.trim())
}

function groupBookingSearchCriteria(criteria: BookingSearchCriterion[]) {
  return criteria.reduce<Array<{ id: string; connector: "and" | "or"; criteria: BookingSearchCriterion[] }>>((groups, criterion, index) => {
    const groupId = criterion.groupId ?? "booking-search-main"
    const existingGroup = groups.find((group) => group.id === groupId)

    if (existingGroup) {
      existingGroup.criteria.push(criterion)
      return groups
    }

    groups.push({
      id: groupId,
      connector: criterion.groupConnector ?? (index === 0 ? "and" : "or"),
      criteria: [criterion],
    })

    return groups
  }, [])
}

function formatCriterionSummary(criterion: BookingSearchCriterion, criterionIndex: number, groupIndex: number) {
  const label = getSearchFieldMeta(criterion.field).label
  const connector = groupIndex > 0 && criterionIndex === 0 ? `${criterion.groupConnector === "and" ? "And" : "Or"} group` : criterionIndex > 0 ? (criterion.connector === "or" ? "Or" : "And") : ""
  const value = dateSearchFields.has(criterion.field)
    ? [criterion.value, criterion.valueTo].filter(Boolean).join(" to ")
    : criterion.value

  return [connector, label, value].filter(Boolean).join(" ")
}

export function BookingFilterBar({
  activeFilter,
  onFilterChange,
  controls,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
  controls?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[var(--md-gap-lg)] xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FilterChips
          options={bookingFilters}
          activeOption={activeFilter}
          onChange={onFilterChange}
          auxiliaryOptions={["+ Mode", "+ Carrier", "+ Customer", "+ Owner", "+ ETA range"]}
        />
        {controls}
      </div>
      <p className="text-[13px] font-medium text-[var(--md-text)]">Sort · ETA ↑</p>
    </div>
  )
}

export function BookingsTable({
  rows,
  favouriteIds,
  onToggleFavourite,
  onOpenBooking,
}: {
  rows: Booking[]
  favouriteIds?: Set<string>
  onToggleFavourite?: (id: string) => void
  onOpenBooking: (booking: Booking) => void
}) {
  const columns = useMemo<DataTableColumn<Booking>[]>(() => [
    {
      id: "favourite",
      label: "Star",
      kind: "actions",
      width: 52,
      canHide: false,
      canPin: false,
      cell: (booking) => {
        const favourite = Boolean(favouriteIds?.has(booking.id))
        return <button type="button" aria-label={`${favourite ? "Remove" : "Add"} ${booking.id} favourite`} aria-pressed={favourite} className={cn("grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] outline-none transition-[background,color,box-shadow,transform] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-amber)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]", favourite && "bg-[color-mix(in_srgb,var(--md-amber)_12%,transparent)] text-[var(--md-amber)] shadow-[var(--md-shadow-line)]")} onClick={(event) => { event.stopPropagation(); onToggleFavourite?.(booking.id) }}><Star className={cn("size-4", favourite && "fill-current")} strokeWidth={1.35} /></button>
      },
    },
    { id: "booking", label: "Booking", kind: "text", width: 136, sortValue: (booking) => booking.id, cell: (booking) => <div className="flex items-center gap-3"><span className="size-2.5 rounded-full" style={{ background: toneToVar(booking.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(booking.tone)} 12%, transparent)` }} /><p className="text-[14px] font-medium text-[var(--md-ink)]" dir="ltr">{booking.id}</p></div> },
    { id: "customer", label: "Customer · route", kind: "long-text", width: 300, minWidth: 220, resizable: true, sortValue: (booking) => booking.customer, cellTitle: (booking) => `${booking.customer} · ${booking.route}`, cell: (booking) => <div className="min-w-0"><p className="truncate text-[15px] font-medium text-[var(--md-ink)]">{booking.customer}</p><p className="mt-1 truncate text-[13px] text-[var(--md-text)]">{booking.route}</p></div> },
    { id: "carrier", label: "Carrier · container", kind: "long-text", width: 200, minWidth: 160, resizable: true, sortValue: (booking) => booking.carrier, cellTitle: (booking) => `${booking.carrier} · ${booking.container}`, cell: (booking) => <div className="min-w-0"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{booking.carrier}</p><p className="mt-1 truncate text-[13px] text-[var(--md-text)]">{booking.container}</p></div> },
    { id: "shape", label: "Direction · mode · type", kind: "attribute", width: 190, resizable: true, sortValue: (booking) => booking.mode, cell: (booking) => <BookingShapeCell booking={booking} /> },
    { id: "value", label: "Value", kind: "number", width: 120, sortValue: (booking) => Number.parseFloat(booking.value.replace(/[^0-9.-]/g, "")), cell: (booking) => <span className="font-medium text-[var(--md-ink)]">{booking.value}</span> },
    { id: "eta", label: "ETA", kind: "date", align: "end", width: 124, sortValue: (booking) => booking.eta, cell: (booking) => <div><p className="font-medium tabular-nums text-[var(--md-ink)]">{booking.eta}</p><p className="text-[12px] tabular-nums text-[var(--md-text)]">{booking.time}</p></div> },
    { id: "status", label: "Status", kind: "status", width: 126, sortValue: (booking) => booking.status, cell: (booking) => <BookingStatusPill status={booking.status} /> },
    { id: "progress", label: "Progress", kind: "number", width: 160, sortValue: (booking) => booking.progress, cell: (booking) => <div className="flex items-center gap-3"><Progress value={booking.progress} className="h-1.5 flex-1 rounded-full bg-[var(--md-line-strong)] [&>div]:bg-[var(--progress-color)]" style={{ "--progress-color": toneToVar(booking.tone) } as CSSProperties} /><span className="w-9 text-end tabular-nums text-[13px] text-[var(--md-text)]">{booking.progress}%</span></div> },
    { id: "owner", label: "Owner", kind: "identity", width: 92, sortValue: (booking) => booking.owner, cell: (booking) => <span className="grid size-8 place-items-center rounded-full bg-[var(--md-accent-a12)] text-[12px] font-medium text-[var(--md-accent)]" aria-label={`Owner ${booking.owner}`}>{booking.owner}</span> },
  ], [favouriteIds, onToggleFavourite])

  return (
    <DataTable
      ariaLabel="Bookings"
      columnsButtonLabel="Manage booking columns"
      columns={columns}
      rows={rows}
      getRowKey={(booking) => booking.id}
      storageKey="booking-gallery-register"
      onRowClick={onOpenBooking}
      rowAriaLabel={(booking) => `Open ${booking.id}`}
      rowClassName="h-[78px]"
      emptyState={<div className="mx-auto max-w-[360px]"><p className="text-[14px] font-medium text-[var(--md-ink)]">No bookings match this search</p><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">Remove a criterion or switch back to Open to widen the list.</p></div>}
    />
  )
}

export function BookingBoardPreview({
  rows = bookings,
  onOpenBooking,
  onMoveBooking,
}: {
  rows?: Booking[]
  onOpenBooking: (booking: Booking) => void
  onMoveBooking?: (bookingId: string, status: BookingStatus, orderedRows: Booking[]) => void
}) {
  const { t } = useLanguage()
  const [boardRows, setBoardRows] = useState<Booking[]>(() => rows.map((booking) => ({ ...booking })))
  const laneDefinitions = [
    { id: "On track" as const, label: "On track" },
    { id: "Delayed" as const, label: "Delayed" },
    { id: "Exception" as const, label: "Exception" },
  ]
  const columns = laneDefinitions.map((lane) => ({
    id: lane.id,
    tasks: boardRows.filter((booking) => booking.status === lane.id),
  }))
  const kanban = useKanbanPointerDrag({
    columns,
    getId: (booking) => booking.id,
    onCommit: ({ cardId, columnId, columns: committedColumns }) => {
      const status = columnId as BookingStatus
      const nextRows = committedColumns.flatMap((column) => column.tasks.map((booking) => (
        booking.status === column.id ? booking : { ...booking, status: column.id as BookingStatus, tone: statusTone[column.id as BookingStatus] }
      )))
      setBoardRows(nextRows)
      onMoveBooking?.(cardId, status, nextRows)
    },
    formatKeyboardAnnouncement: (booking, columnId) => `${booking.id} ${t("moved to")} ${t(columnId)}`,
  })

  useEffect(() => {
    setBoardRows(rows.map((booking) => ({ ...booking })))
  }, [rows])

  return (
    <div ref={kanban.boardRef}>
      <div className="grid gap-4 lg:grid-cols-3">
        {kanban.previewColumns.map((column) => {
          const lane = laneDefinitions.find((candidate) => candidate.id === column.id)
          if (!lane) return null
          return (
            <section
              key={column.id}
              className="md-kanban-column min-h-[240px]"
              data-column-id={column.id}
              data-drop-target={kanban.activeCardId && kanban.activeColumnId === column.id ? "true" : undefined}
              style={{ "--md-kanban-status-color": toneToVar(statusTone[column.id as BookingStatus]) } as CSSProperties}
            >
              <header>
                <h2>{t(lane.label)}</h2>
                <strong className="tabular-nums">{column.tasks.length}</strong>
              </header>
              <div data-kanban-list>
                {column.tasks.map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    className="md-kanban-card group"
                    data-kanban-card={booking.id}
                    data-task-id={booking.id}
                    data-kanban-dragging={kanban.activeCardId === booking.id ? "true" : undefined}
                    aria-grabbed={kanban.activeCardId === booking.id}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
                    onClick={() => {
                      if (!kanban.isClickSuppressed()) onOpenBooking(booking)
                    }}
                    onPointerDown={(event) => kanban.handlePointerDown(event, booking.id)}
                    onKeyDown={(event) => kanban.handleKeyDown(event, booking.id)}
                  >
                    <BookingKanbanCardBody booking={booking} />
                  </button>
                ))}
                {column.tasks.length === 0 ? <p className="md-kanban-empty text-center">{t("No matching bookings in this lane.")}</p> : null}
              </div>
            </section>
          )
        })}
      </div>
      <p className="sr-only" aria-live="polite">{kanban.keyboardAnnouncement}</p>
      {kanban.activeTask && kanban.overlayStyle ? createPortal(
        <div className="md-kanban-drag-preview" style={kanban.overlayStyle}>
          <div className="md-kanban-drag-preview-card group">
            <BookingKanbanCardBody booking={kanban.activeTask} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function BookingKanbanCardBody({ booking }: { booking: Booking }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{booking.id}</span>
        <BookingStatusPill status={booking.status} />
      </div>
      <p className="truncate text-[13.5px] font-medium text-[var(--md-ink)]">{booking.customer}</p>
      <p className="truncate text-[11.5px] text-[var(--md-text)]" dir="auto">{booking.route}</p>
    </>
  )
}

function BookingDetailHeader({
  activeTab,
  detailsDirty,
  onDiscardDetails,
  onSaveDetails,
  onTabChange,
  record,
}: {
  activeTab: BookingDetailTab
  detailsDirty: boolean
  onDiscardDetails: () => void
  onSaveDetails: () => void
  onTabChange: (tab: BookingDetailTab) => void
  record: BookingDetailRecord
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const bookingTabControlId = useId()
  const [bookingRefCopied, setBookingRefCopied] = useState(false)
  const bookingCopyResetTimerRef = useRef<number | null>(null)
  const tabs = bookingDetailTabs.map((label) => ({ id: label, label: t(label) }))
  const statusLabel = record.job?.status ?? record.booking.status
  const statusTone = record.job?.tone ?? record.booking.tone
  const primaryAction = record.job?.task ?? (record.booking.status === "Exception" ? "Review blocker" : record.booking.progress === 100 ? "Close booking" : "Open workflow")

  useEffect(() => () => {
    if (bookingCopyResetTimerRef.current !== null) window.clearTimeout(bookingCopyResetTimerRef.current)
  }, [])

  async function copyBookingReference() {
    try {
      await navigator.clipboard.writeText(record.id)
      if (bookingCopyResetTimerRef.current !== null) window.clearTimeout(bookingCopyResetTimerRef.current)
      setBookingRefCopied(true)
      bookingCopyResetTimerRef.current = window.setTimeout(() => {
        setBookingRefCopied(false)
        bookingCopyResetTimerRef.current = null
      }, 1800)
    } catch {
      setBookingRefCopied(false)
    }
  }

  function moveBookingTabFocus(event: KeyboardEvent<HTMLButtonElement>, currentTab: BookingDetailTab) {
    const currentIndex = bookingDetailTabs.indexOf(currentTab)
    const previousKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft"
    const nextKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight"
    let nextIndex: number | null = null

    if (event.key === previousKey) nextIndex = (currentIndex - 1 + bookingDetailTabs.length) % bookingDetailTabs.length
    if (event.key === nextKey) nextIndex = (currentIndex + 1) % bookingDetailTabs.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = bookingDetailTabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    onTabChange(bookingDetailTabs[nextIndex])
    const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabButtons?.[nextIndex]?.focus()
  }

  const bookingTabs = (
    <Surface padding="none" tone="soft" className="w-full min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]">
      <div className="relative isolate flex w-max min-w-full items-center gap-1 overflow-x-auto" role="tablist" aria-label={t("Booking workspace")}>
        {tabs.map((tab) => {
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "group relative isolate h-8 min-w-[72px] flex-1 shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[12px] font-medium text-[var(--md-text)] transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.985]",
                selected && "text-[var(--md-accent-ink)] hover:text-[var(--md-accent-ink)]",
              )}
              onClick={() => onTabChange(tab.id as BookingDetailTab)}
              onKeyDown={(event) => moveBookingTabFocus(event, tab.id as BookingDetailTab)}
            >
              {selected ? (
                <motion.span
                  aria-hidden="true"
                  layoutId={`${bookingTabControlId}-active-segment`}
                  className="absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),var(--md-shadow-soft)] transition-colors duration-200 group-hover:bg-[var(--md-accent-hover)]"
                  transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
                />
              ) : null}
              <span className="relative z-10">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </Surface>
  )

  return (
    <header>
      <div className="grid min-w-0 grid-rows-[auto_auto] gap-1.5">
        <section className="flex min-w-0 flex-col gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-3 py-1.5 shadow-[var(--md-shadow-line)] lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h1 className="shrink-0 text-[14px] font-medium leading-5 text-[var(--md-ink)]">{t("Booking")}</h1>
            <button
              type="button"
              aria-label={t(bookingRefCopied ? "Booking reference copied" : "Copy booking reference")}
              title={t(bookingRefCopied ? "Copied" : "Copy booking reference")}
              className="group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] px-2 text-[14px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,transform] duration-200 hover:bg-[var(--md-accent-a16)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.985]"
              onClick={() => void copyBookingReference()}
            >
              <CopyFeedbackTransition
                value={record.id}
                copiedValue={t("Copied")}
                active={bookingRefCopied}
                effect="slot"
                inline
                ariaHidden
                className="h-[1em] leading-none"
                originalDirection="ltr"
                copiedDirection={direction}
              />
              <CopyStatusIcon copied={bookingRefCopied} iconClassName="size-3.5" className="shrink-0" />
            </button>
            <StatusPill kind="status" tone={statusTone} className="h-7 shrink-0 px-2.5 text-[11.5px] font-medium">{t(statusLabel)}</StatusPill>
          </div>
          <span
            data-booking-route
            data-i18n-skip
            dir="auto"
            title={record.booking.route}
            className="min-h-7 min-w-0 max-w-full truncate rounded-[calc(var(--md-radius-xl)-6px)] bg-[var(--md-field-bg)] px-2.5 py-1 text-[11.5px] font-medium leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] lg:ms-auto lg:max-w-[min(32%,320px)]"
          >
            {record.booking.route}
          </span>
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
            {activeTab === "Details" ? (
              detailsDirty ? (
                <>
                  <Button variant="ghost" className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2.5 text-[11px] font-medium shadow-[var(--md-shadow-line)]" onClick={onDiscardDetails}>
                    <RotateCcw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
                    {t("Discard")}
                  </Button>
                  <Button className="h-8 shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[11px] font-medium" onClick={onSaveDetails}>
                    <Save data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
                    {t("Save")}
                  </Button>
                </>
              ) : null
            ) : (
              <>
                <Button variant="ghost" className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2.5 text-[11px] font-medium shadow-[var(--md-shadow-line)]" onClick={() => toast.success(t("Update draft prepared"))}>
                  {t("Prepare update")}
                </Button>
                <Button className="h-8 shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[11px] font-medium" onClick={() => toast.success(t("Workflow opened"))}>
                  {t(primaryAction)}
                </Button>
              </>
            )}
          </div>
        </section>

        {activeTab === "Overview" ? (
          <BookingOverviewSignals record={record} tabs={bookingTabs} />
        ) : (
          <div className="grid gap-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            <div className="min-w-0">{bookingTabs}</div>
          </div>
        )}
      </div>
    </header>
  )
}

function BookingJobContext({
  job,
  booking,
}: {
  job?: OperatorJob
  booking: Booking
}) {
  if (!job) return null

  return (
    <Surface padding="none" className="mb-[var(--md-page-stack-gap)] overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-medium uppercase text-[var(--md-accent)]">Dashboard job</p>
            <StatusPill tone={job.tone}>{job.status}</StatusPill>
            <span className="text-[12px] font-medium text-[var(--md-text)]">Due {job.due}</span>
          </div>
          <h2 className="mt-2 text-[18px] font-medium leading-6 text-[var(--md-ink)]">{job.task}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{job.detail}</p>
        </div>
        <div className="grid gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 py-3 shadow-[var(--md-shadow-line)]">
          <p className="text-[12px] font-medium text-[var(--md-text)]">Linked booking</p>
          <p className="text-[14px] font-medium text-[var(--md-ink)]">{booking.id}</p>
          <p className="text-[12px] text-[var(--md-text)]">{booking.eta} · {booking.time}</p>
        </div>
      </div>
    </Surface>
  )
}

export function BookingArrivalCard() {
  return (
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
      <div className="flex flex-col gap-[var(--md-page-stack-gap)] 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <p className="text-[14px] text-[var(--md-text)]">Predicted arrival · Long Beach, USLGB</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <strong className="text-[46px] font-medium leading-none tracking-normal text-[var(--md-ink)] md:text-[56px] 2xl:text-[64px]">Jun 09, 03:00 PT</strong>
            <span className="pb-2 text-[16px] font-medium text-[var(--md-amber)]">+ 2 days 4 hrs</span>
          </div>
          <p className="mt-[var(--md-page-stack-gap)] text-[15px] text-[var(--md-text)]">Model confidence <span className="font-medium text-[var(--md-ink)]">87%</span> · last update 41 seconds ago</p>
        </div>
        <div className="min-w-[220px] text-left 2xl:text-right">
          <p className="text-[13px] text-[var(--md-text)]">Booked</p>
          <p className="mt-2 text-[18px] font-medium text-[var(--md-ink)]">Jun 07, 03:00</p>
          <p className="mt-[var(--md-page-stack-gap)] text-[13px] text-[var(--md-text)]">Shipper</p>
          <p className="mt-2 text-[15px] font-medium text-[var(--md-ink)]">Yong Hua Logistics</p>
        </div>
      </div>
      <div className="mt-[calc(var(--md-page-section-gap)+var(--md-gap-lg))] overflow-x-auto md-scrollbar">
        <div className="grid min-w-[680px] grid-cols-7 items-start">
          {bookingMilestones.map((milestone, index) => (
            <div key={milestone.label} className="relative flex flex-col items-center text-center">
              {index < bookingMilestones.length - 1 ? (
                <span
                  className={cn(
                    "absolute left-1/2 top-[9px] h-0.5 w-full",
                    index < 2 ? "bg-[var(--md-red)]" : "bg-[rgba(90,103,100,0.22)]",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 size-5 rounded-full bg-[var(--md-bg)] shadow-[0_0_0_3px_var(--md-bg)]",
                  milestone.state === "done" && "bg-[var(--md-green)]",
                  milestone.state === "current" && "bg-[var(--md-red)] shadow-[0_0_0_7px_rgba(209,78,78,0.16)]",
                  milestone.state === "pending" && "bg-[var(--md-bg)] shadow-[inset_0_0_0_2px_var(--md-text),0_0_0_3px_var(--md-bg)]",
                )}
              />
              <p className="mt-4 text-[12px] font-medium text-[var(--md-ink)]">{milestone.label}</p>
              <p className="mt-1 text-[13px] text-[var(--md-text)]">{milestone.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function BookingExceptionPanel() {
  return (
    <section className="rounded-[var(--md-radius-xl)] bg-white/38 p-[var(--md-page-stack-gap)] shadow-[inset_0_0_0_1px_rgba(209,78,78,0.28),0_0_0_1px_rgba(209,78,78,0.08)]">
      <div className="grid gap-4 md:grid-cols-[52px_1fr_auto]">
        <div className="grid size-[44px] place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]">
          <TriangleAlert className="size-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Customs hold · CN export licence missing</h2>
            <StatusPill tone="red" className="h-7 px-3 text-[13px]">Critical</StatusPill>
          </div>
          <p className="mt-2 text-[15px] leading-7 text-[var(--md-text)]">
            Multideck cross-referenced the commercial invoice from Yong Hua Logistics with HS code <span className="font-medium text-[var(--md-ink)]">8517.62.00</span> and detected a required export licence for dual-use telecom equipment. The licence is missing from the document set we hold.
          </p>
        </div>
        <p className="text-[13px] text-[var(--md-text)]">raised 2h 14m ago</p>
      </div>
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)] md:ml-[68px] md:grid-cols-3">
        {[
          ["Request licence from shipper", "Drafts an email · 1 click send"],
          ["Mark as own goods", "No licence required if first-party"],
          ["Escalate to broker", "Notify Wei Chen, Shanghai"],
        ].map(([title, body], index) => (
          <button
            key={title}
            type="button"
            className={cn(
              "rounded-[var(--md-radius-lg)] bg-white/36 px-4 py-4 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/65",
              index === 0 && "shadow-[inset_0_0_0_1px_var(--md-accent-a65),0_0_0_1px_var(--md-accent-a08)]",
            )}
          >
            <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
            <p className="mt-2 text-[13px] text-[var(--md-text)]">{body}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

export function BookingResolutionChecklist() {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set(["Confirm hold reason"]))
  const items = [
    ["Confirm hold reason", "HS-code match flagged a missing CN export licence."],
    ["Request licence from shipper", "Send the prepared email to Yong Hua Logistics."],
    ["Attach licence to document set", "Upload and link the licence to MD-22455."],
    ["Re-submit customs entry", "Notify broker once the document set is complete."],
  ]

  function toggleItem(label: string) {
    const wasChecked = checkedItems.has(label)
    setCheckedItems((current) => {
      const next = new Set(current)
      if (wasChecked) next.delete(label)
      else next.add(label)
      return next
    })
    toast.success(wasChecked ? "Checklist item reopened" : "Checklist item saved", {
      description: label,
    })
  }

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Resolution checklist</h2>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">Shared task list for clearing the customs hold.</p>
        </div>
        <StatusPill tone="amber">{checkedItems.size} of {items.length}</StatusPill>
      </div>
      <div className="px-5 pb-5">
        {items.map(([label, detail]) => {
          const checked = checkedItems.has(label)

          return (
            <button
              key={label}
              type="button"
              className="grid w-full grid-cols-[28px_1fr] gap-3 border-t border-[rgba(11,20,19,0.08)] py-3 text-left transition-[background,color,box-shadow,opacity,transform] hover:bg-white/35"
              onClick={() => toggleItem(label)}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 place-items-center rounded-[var(--md-radius-sm)] bg-white shadow-[var(--md-shadow-line)]",
                  checked && "bg-[var(--md-accent)] shadow-[0_0_0_3px_var(--md-accent-a12)]",
                )}
              >
                {checked ? <Check className="size-3.5 text-[var(--md-accent-ink)]" strokeWidth={1.8} /> : null}
              </span>
              <span>
                <span className={cn("block text-[14px] font-medium text-[var(--md-ink)]", checked && "text-[var(--md-text)] line-through")}>{label}</span>
                <span className="mt-1 block text-[12px] leading-5 text-[var(--md-text)]">{detail}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

function DetailDataPanel({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-[14px] font-medium text-[var(--md-text)]">{title}</h2>
        {meta ? <span className="text-[13px] font-medium text-[var(--md-text)]">{meta}</span> : null}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </Surface>
  )
}

function CargoPanel() {
  return (
    <DetailDataPanel title="Cargo">
      {bookingCargo.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[140px_1fr] gap-4 border-t border-[rgba(11,20,19,0.08)] py-3">
          <p className="text-[13px] text-[var(--md-text)]">{label}</p>
          <p className="text-right text-[14px] font-medium text-[var(--md-ink)]">{value}</p>
        </div>
      ))}
    </DetailDataPanel>
  )
}

function DocumentsPanel() {
  return (
    <DetailDataPanel title="Documents" meta="6 of 7 parsed">
      {bookingDocuments.map(([name, file, confidence]) => (
        <div key={name} className="grid grid-cols-[minmax(132px,1fr)_104px_68px] items-center gap-3 border-t border-[rgba(11,20,19,0.08)] py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{name}</p>
            <p className="truncate text-[12px] text-[var(--md-text)]">{file}</p>
          </div>
          <p className="text-[13px] text-[var(--md-text)]">{confidence}</p>
          <StatusPill tone="green" className="justify-center px-2">parsed</StatusPill>
        </div>
      ))}
    </DetailDataPanel>
  )
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: StatusTone
}) {
  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <p className="text-[13px] font-medium text-[var(--md-text)]">{label}</p>
      <strong
        className="mt-2 block text-[28px] font-medium leading-none tracking-normal text-[var(--md-ink)]"
        style={{ color: tone === "neutral" ? undefined : toneToVar(tone) }}
      >
        {value}
      </strong>
    </Surface>
  )
}

function OverviewPage() {
  return (
    <>
      <BookingArrivalCard />
      <div className="mt-[var(--md-page-stack-gap)]">
        <BookingExceptionPanel />
      </div>
      <div className="mt-[var(--md-page-stack-gap)]">
        <BookingResolutionChecklist />
      </div>
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-2">
        <CargoPanel />
        <DocumentsPanel />
      </div>
    </>
  )
}

function DocumentsPage() {
  return (
    <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
        <div className="grid gap-3 md:grid-cols-3">
          <MiniStat label="Parsed documents" value="6/7" tone="green" />
          <MiniStat label="Average confidence" value="97%" tone="teal" />
          <MiniStat label="Missing item" value="1" tone="red" />
        </div>

        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Document set</h2>
              <p className="mt-1 text-[13px] text-[var(--md-text)]">Extraction status, source files, and action state for MD-22455.</p>
            </div>
            <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/55 px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]">
              <Paperclip data-icon="inline-start" strokeWidth={1.2} />
              Attach document
            </Button>
          </div>
          <div className="px-5 pb-5">
            {[...bookingDocuments, ["CN export licence", "missing", "required"]].map(([name, file, confidence]) => {
              const missing = file === "missing"

              return (
                <div key={name} className="grid gap-3 border-t border-[rgba(11,20,19,0.08)] py-4 md:grid-cols-[minmax(180px,1fr)_minmax(140px,1fr)_110px_92px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{name}</p>
                    <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{file}</p>
                  </div>
                  <p className="text-[13px] text-[var(--md-text)]">{missing ? "Requested from Yong Hua Logistics" : confidence}</p>
                  <StatusPill tone={missing ? "red" : "green"} className="w-fit justify-center px-3">
                    {missing ? "missing" : "parsed"}
                  </StatusPill>
                  <Button variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/35 px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)]">
                    {missing ? "Request" : "Open"}
                  </Button>
                </div>
              )
            })}
          </div>
        </Surface>
      </div>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
          <FileText className="size-5" strokeWidth={1.4} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">Extraction summary</h2>
        <p className="mt-3 text-[14px] leading-6 text-[var(--md-text)]">
          Commercial invoice, packing list, BoL, certificate of origin, and insurance certificate are parsed. The licence is the only blocker for customs resubmission.
        </p>
      </Surface>
    </div>
  )
}

function CustomsPage() {
  return (
    <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
      <BookingExceptionPanel />
      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Customs workstream</h2>
            <p className="mt-1 text-[13px] text-[var(--md-text)]">Every open customs dependency for MD-22455.</p>
          </div>
          <div className="px-5 pb-5">
            {customsEntries.map(([title, detail, state, tone]) => (
              <div key={title} className="grid gap-3 border-t border-[rgba(11,20,19,0.08)] py-4 md:grid-cols-[minmax(160px,220px)_1fr_auto] md:items-center">
                <div>
                  <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
                  <p className="mt-1 text-[12px] text-[var(--md-text)]">{detail}</p>
                </div>
                <div className="h-2 rounded-full bg-[rgba(90,103,100,0.1)]">
                  <div className="h-2 rounded-full" style={{ width: tone === "green" ? "78%" : tone === "amber" ? "48%" : "26%", background: toneToVar(tone) }} />
                </div>
                <StatusPill tone={tone}>{state}</StatusPill>
              </div>
            ))}
          </div>
        </Surface>

        <BookingResolutionChecklist />
      </div>
    </div>
  )
}

function CostsPage() {
  const total = costRows.reduce((sum, [, , value]) => sum + Number(value.replace(/[^\d.]/g, "")), 0)

  return (
    <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Cost breakdown</h2>
            <p className="mt-1 text-[13px] text-[var(--md-text)]">Current landed-cost view based on booking, documents, and hold risk.</p>
          </div>
          <StatusPill tone="amber">Demurrage watch</StatusPill>
        </div>
        <div className="px-5 pb-5">
          {costRows.map(([label, detail, amount]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_140px] gap-4 border-t border-[rgba(11,20,19,0.08)] py-4">
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">{label}</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]">{detail}</p>
              </div>
              <p className="text-right text-[14px] font-medium text-[var(--md-ink)]">{amount}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]">
          <CircleDollarSign className="size-5" strokeWidth={1.4} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">Estimated total</h2>
        <strong className="mt-3 block text-[34px] font-medium leading-none text-[var(--md-ink)]">USD {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        <p className="mt-4 text-[14px] leading-6 text-[var(--md-text)]">The hold creates a small demurrage risk if the licence is not attached before free time closes.</p>
      </Surface>
    </div>
  )
}

function CommsPage() {
  return (
    <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_380px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="px-5 py-4">
          <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Comms thread</h2>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">Operator, broker, shipper, and AI-prepared updates for the customs hold.</p>
        </div>
        <div className="px-5 pb-5">
          {commMessages.map(([sender, body, time]) => (
            <div key={`${sender}-${time}`} className="grid grid-cols-[42px_1fr_auto] gap-3 border-t border-[rgba(11,20,19,0.08)] py-4">
              <span className="grid size-9 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[12px] font-medium text-[var(--md-accent)]">
                {sender.split(" ").map((part) => part[0]).join("").slice(0, 2)}
              </span>
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">{sender}</p>
                <p className="mt-1 text-[14px] leading-6 text-[var(--md-text)]">{body}</p>
              </div>
              <span className="text-[12px] text-[var(--md-subtle)]">{time}</span>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(74,125,156,0.12)] text-[var(--md-blue)]">
          <MessageCircle className="size-5" strokeWidth={1.4} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">Prepared update</h2>
        <p className="mt-3 text-[14px] leading-6 text-[var(--md-text)]">
          Yong Hua Logistics needs to send the CN export licence for HS code 8517.62.00. Once attached, Wei Chen can resubmit the CDS entry.
        </p>
        <Button
          className="mt-[var(--md-page-stack-gap)] h-10 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]"
          onClick={() =>
            toast.success("Prepared email sent", {
              description: "Yong Hua Logistics has the licence request for MD-22455.",
            })
          }
        >
          Send prepared email
        </Button>
      </Surface>
    </div>
  )
}

function TimelinePage() {
  return (
    <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="px-5 py-4">
          <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Booking timeline</h2>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">Chronological event history for MD-22455.</p>
        </div>
        <div className="px-5 pb-5">
          {bookingTimeline.map((item) => (
            <div key={`${item.time}-${item.text}`} className="grid grid-cols-[18px_140px_1fr] gap-4 border-t border-[rgba(11,20,19,0.08)] py-5">
              <span className="mt-1.5 size-2.5 rounded-full" style={{ background: toneToVar(item.tone) }} />
              <p className="text-[13px] font-medium text-[var(--md-text)]">{item.time}</p>
              <p className="text-[15px] leading-6 text-[var(--md-ink)]">{item.text}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Current model</h2>
        <p className="mt-1 text-[13px] text-[var(--md-text)]">Predicted arrival · Long Beach, USLGB</p>
        <strong className="mt-4 block text-[34px] font-medium leading-none tracking-normal text-[var(--md-ink)]">Jun 09, 03:00 PT</strong>
        <p className="mt-3 text-[14px] font-medium text-[var(--md-amber)]">+ 2 days 4 hrs</p>
        <div className="mt-[var(--md-gap-xl)] space-y-[var(--md-gap-md)]">
          {bookingMilestones.slice(0, 5).map((milestone) => (
            <div key={milestone.label} className="flex items-center justify-between gap-4 rounded-[var(--md-radius-lg)] bg-white/42 px-3 py-3 shadow-[var(--md-shadow-line)]">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "size-2.5 rounded-full bg-[var(--md-bg)] shadow-[inset_0_0_0_1.5px_var(--md-text)]",
                    milestone.state === "done" && "bg-[var(--md-green)] shadow-none",
                    milestone.state === "current" && "bg-[var(--md-red)] shadow-[0_0_0_5px_rgba(209,78,78,0.12)]",
                  )}
                />
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{milestone.label}</span>
              </div>
              <span className="text-[12px] text-[var(--md-text)]">{milestone.detail}</span>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  )
}

function hasPrototypeDetailData(record: BookingDetailRecord) {
  return false
}

function getBookingBlocker(record: BookingDetailRecord) {
  if (record.booking.status !== "Exception") return null
  return record.booking.customFields.find((field) => /blocker|exception|licence|mismatch/i.test(`${field.label} ${field.value}`))
    ?? record.booking.customFields[0]
    ?? { label: "Exception", value: "Review the booking register for the current blocker." }
}

function getBookingNextAction(record: BookingDetailRecord) {
  if (record.job) return { title: record.job.task, detail: record.job.detail, tone: record.job.tone }
  if (record.booking.progress === 100) return { title: "Complete financial close", detail: "Confirm final costs, proof of delivery, and customer billing before closing the record.", tone: "green" as StatusTone }
  if (record.booking.status === "Delayed") return { title: "Prepare a revised ETA update", detail: "Confirm the latest carrier timing before sharing the movement change with the customer.", tone: "amber" as StatusTone }
  if (record.booking.status === "Exception") return { title: "Review the open blocker", detail: getBookingBlocker(record)?.value ?? "Open the operational workflow and assign the next action.", tone: "red" as StatusTone }
  return { title: "Monitor the next movement", detail: `Keep ${record.booking.eta} under watch while the shipment remains at ${record.booking.currentLocation}.`, tone: "teal" as StatusTone }
}

function getMovementSteps(record: BookingDetailRecord) {
  const labels = record.booking.mode === "ROAD"
    ? ["Booked", "Collection", "In transit", "Delivery", "Closed"]
    : record.booking.mode === "AIR"
      ? ["Booked", "Accepted", "Departed", "Arrived", "Released"]
      : ["Booked", "Origin", "Departed", "Destination", "Released"]
  const currentIndex = Math.min(Math.floor(record.booking.progress / 25), labels.length - 1)

  return labels.map((label, index) => ({
    label,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "pending",
    detail: index === 0 ? record.booking.departureDate : index === labels.length - 2 ? record.booking.arrivalDate : index === currentIndex ? `${record.booking.progress}%` : "—",
  }))
}

function BookingSectionHeading({ icon, title, meta }: { icon: ReactNode; title: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 shadow-[var(--md-stroke-bottom)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span>
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>
      </div>
      {meta ? <p className="text-[12px] text-[var(--md-subtle)]">{meta}</p> : null}
    </div>
  )
}

function BookingFactRows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  const { t } = useLanguage()

  return (
    <div className="px-5 py-2">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none sm:grid-cols-[minmax(120px,0.8fr)_minmax(0,1.2fr)] sm:items-start">
          <p className="text-[12px] text-[var(--md-text)]">{t(label)}</p>
          <p data-i18n-skip dir="auto" className="break-words text-[13px] font-medium text-[var(--md-ink)] sm:text-end">{value || "—"}</p>
        </div>
      ))}
    </div>
  )
}

function BookingCargoWiseField({
  editable = false,
  label,
  onChange,
  options,
  span = false,
  value,
}: {
  editable?: boolean
  label: string
  onChange?: (value: string) => void
  options?: readonly string[]
  span?: boolean
  value: string
}) {
  const { t } = useLanguage()

  return (
    <div className={cn("grid min-w-0 grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)] items-center gap-1.5", span && "md:col-span-2")}>
      <label className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</label>
      {editable && onChange ? (
        options ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger aria-label={t(label)} className="h-8 min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => <SelectItem key={option} value={option}>{t(option)}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            aria-label={t(label)}
            data-i18n-skip
            dir="auto"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]"
          />
        )
      ) : (
        <span data-i18n-skip dir="auto" title={value} className="min-h-8 min-w-0 truncate rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 py-1.5 text-[11px] font-medium leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
          {value || "—"}
        </span>
      )}
    </div>
  )
}

function BookingCargoWiseGroup({
  title,
  children,
  compact = false,
  className,
  contentClassName,
}: {
  title: string
  children: ReactNode
  compact?: boolean
  className?: string
  contentClassName?: string
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("h-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "p-2" : "p-2.5", className)}>
      <h3 className={cn("min-w-0 text-[12px] font-medium leading-4 text-[var(--md-ink)]", compact ? "mb-1.5" : "mb-2")}>{t(title)}</h3>
      <div className={cn("grid", compact ? "gap-1.5" : "gap-2", contentClassName)}>{children}</div>
    </section>
  )
}

function chartPointPath(
  values: readonly number[],
  width: number,
  height: number,
  inset = { top: 12, right: 4, bottom: 22, left: 34 },
) {
  const usableWidth = width - inset.left - inset.right
  const usableHeight = height - inset.top - inset.bottom
  const points = values.map((value, index) => ({
    x: values.length === 1 ? inset.left + (usableWidth / 2) : inset.left + ((index / (values.length - 1)) * usableWidth),
    y: inset.top + ((100 - value) / 100) * usableHeight,
  }))
  const line = points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x.toFixed(1)},${point.y.toFixed(1)}`

    const previous = points[index - 1]
    const beforePrevious = points[index - 2] ?? previous
    const next = points[index + 1] ?? point
    const clampY = (value: number) => Math.max(inset.top, Math.min(height - inset.bottom, value))
    const controlOneX = previous.x + ((point.x - beforePrevious.x) / 6)
    const controlOneY = clampY(previous.y + ((point.y - beforePrevious.y) / 6))
    const controlTwoX = point.x - ((next.x - previous.x) / 6)
    const controlTwoY = clampY(point.y - ((next.y - previous.y) / 6))

    return `${path} C${controlOneX.toFixed(1)},${controlOneY.toFixed(1)} ${controlTwoX.toFixed(1)},${controlTwoY.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`
  }, "")

  return {
    points,
    line,
  }
}

function BookingDexterArrivalConfidence({ record }: { record: BookingDetailRecord }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const gradientId = useId().replaceAll(":", "")
  const reliableCarrier = Boolean(record.booking.carrier && !/pending|not supplied/i.test(record.booking.carrier))
  const hasSchedule = Boolean(record.booking.eta && record.booking.departureDate)
  const statusBase = record.booking.status === "Exception" ? 30 : record.booking.status === "Delayed" ? 54 : 78
  const arrivalConfidence = Math.max(18, Math.min(96, statusBase + (record.booking.progress >= 25 ? 5 : 0) + (hasSchedule ? 4 : 0) + (reliableCarrier ? 6 : 0)))
  const offsets = record.booking.status === "Exception" ? [22, 17, 12, 8, 4, 0] : record.booking.status === "Delayed" ? [7, 11, 5, -2, 2, 0] : [-17, -12, -9, -7, -3, 0]
  const confidenceSeries = offsets.map((offset) => Math.max(12, Math.min(98, arrivalConfidence + offset)))
  const chartWidth = 360
  const chartHeight = 88
  const chartInset = { top: 12, right: 4, bottom: 22, left: 34 }
  const plotBottom = chartHeight - chartInset.bottom
  const { points, line } = chartPointPath(confidenceSeries, chartWidth, chartHeight)
  const area = `${line} L${chartWidth - chartInset.right},${plotBottom} L${chartInset.left},${plotBottom} Z`
  const latestPoint = points.at(-1) ?? { x: chartWidth, y: chartHeight }
  const chartColor = "color-mix(in srgb, var(--md-accent-lift-warm) 70%, var(--md-status-green-ink))"
  const signalCount = [record.booking.status, record.booking.progress >= 0, hasSchedule, reliableCarrier].filter(Boolean).length
  const departureValue = record.booking.departureAt || record.booking.departureDate
  const arrivalValue = record.booking.arrivalAt || record.booking.arrivalDate
  const departureTime = Date.parse(departureValue)
  const arrivalTime = Date.parse(arrivalValue)
  const hasScheduledWindow = Number.isFinite(departureTime) && Number.isFinite(arrivalTime) && arrivalTime > departureTime
  const scheduledTimes = confidenceSeries.map((_, index) => (
    hasScheduledWindow
      ? new Date(departureTime + ((arrivalTime - departureTime) * (index / (confidenceSeries.length - 1))))
      : null
  ))
  const usesClockTime = hasScheduledWindow && (arrivalTime - departureTime) <= 3 * 24 * 60 * 60 * 1000
  const timeFormatter = new Intl.DateTimeFormat(language, usesClockTime
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short" })
  const xTicks = [0, Math.floor((confidenceSeries.length - 1) / 2), confidenceSeries.length - 1].map((index) => ({
    x: points[index]?.x ?? chartInset.left,
    label: scheduledTimes[index]
      ? timeFormatter.format(scheduledTimes[index])
      : index === 0
        ? (record.booking.departureDate || t("Departure"))
        : index === confidenceSeries.length - 1
          ? (record.booking.arrivalDate || t("Arrival"))
          : t("Mid-route"),
  }))
  const yTicks = [50, 75, 100]

  return (
    <Surface padding="none" className="relative h-full min-h-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-accent-abyss-deep)] px-3 pb-2.5 pt-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a12),0_10px_22px_var(--md-accent-veil-cast-a18)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-85">
        <SpectralBloomShader tone="brand" shape="composer" />
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(2,13,11,0.08),rgba(1,9,8,0.48))]" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase leading-3 tracking-[0.04em] text-white/64"><AiBrain className="size-3 text-white/85" strokeWidth={1.5} />{t("Dexter forecast")}</p>
          <p className="mt-1 text-[12px] font-medium text-white">{t("On-time probability by journey time")}</p>
          <p className="mt-0.5 text-[9.5px] text-white/55"><span data-i18n-skip dir="ltr">{signalCount}/4</span> · {t("booking signals available")}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-1">
          <span data-i18n-skip dir="ltr" className="text-[28px] font-medium leading-none tracking-[-0.03em] text-white tabular-nums">{arrivalConfidence}</span>
          <span className="text-[11px] text-white/58">%</span>
        </div>
      </div>

      <div className="relative z-10 mt-1.5">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[78px] w-full overflow-visible" role="img" aria-label={`${t("On-time probability by journey time")} ${arrivalConfidence}%`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <text x={chartInset.left} y="7" fill="rgba(255,255,255,0.58)" fontSize="7.5">{t("Confidence (%)")}</text>
          {yTicks.map((value) => {
            const y = chartInset.top + ((100 - value) / 100) * (chartHeight - chartInset.top - chartInset.bottom)
            return (
              <g key={value}>
                <line x1={chartInset.left} x2={chartWidth - chartInset.right} y1={y} y2={y} stroke="rgba(255,255,255,0.09)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={chartInset.left - 5} y={y + 2.5} textAnchor="end" fill="rgba(255,255,255,0.5)" fontSize="7" data-i18n-skip>{value}%</text>
              </g>
            )
          })}
          <line x1={chartInset.left} x2={chartInset.left} y1={chartInset.top} y2={plotBottom} stroke="rgba(255,255,255,0.22)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1={chartInset.left} x2={chartWidth - chartInset.right} y1={plotBottom} y2={plotBottom} stroke="rgba(255,255,255,0.22)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <motion.path d={area} fill={`url(#${gradientId})`} initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }} />
          <motion.path d={line} fill="none" stroke={chartColor} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.48, ease: [0.16, 1, 0.3, 1] }} />
          <circle cx={latestPoint.x} cy={latestPoint.y} r="2.5" fill={chartColor} stroke="rgba(255,255,255,0.82)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          {xTicks.map((tick, index) => (
            <text key={`${tick.label}-${index}`} x={tick.x} y={chartHeight - 8} textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"} fill="rgba(255,255,255,0.52)" fontSize="7" data-i18n-skip>{tick.label}</text>
          ))}
          <text x={chartWidth - chartInset.right} y={chartHeight - 1} textAnchor="end" fill="rgba(255,255,255,0.42)" fontSize="6.5">{t("Scheduled journey")}</text>
        </svg>
      </div>
      <p className="relative z-10 mt-1 truncate text-[9px] text-white/50">{t("Forecast across the scheduled departure-to-arrival window")}</p>
    </Surface>
  )
}

function BookingOverviewSignals({ record, tabs }: { record: BookingDetailRecord; tabs: ReactNode }) {
  const { t } = useLanguage()
  const bookingProgress = Math.max(0, Math.min(100, record.booking.progress))
  const bookingStages = [
    { id: "intake", label: "Booked", summary: "The booking and operational ownership have been recorded." },
    { id: "costing", label: "Origin", summary: "Origin handling and departure requirements are being completed." },
    { id: "review", label: "Departed", summary: "The main movement has departed its origin." },
    { id: "sent", label: "Destination", summary: "Arrival and destination handling are underway." },
    { id: "outcome", label: "Released", summary: "Release, delivery and commercial close-out are complete." },
  ].map((stage, index) => {
    const progress = Math.max(0, Math.min(100, (bookingProgress - (index * 20)) * 5))
    return { ...stage, progress, state: progress >= 100 ? "done" : progress > 0 ? "current" : "todo" }
  })
  const bookingMetadata = [
    { label: "Booking owner", value: record.booking.owner || t("Unassigned") },
    { label: "Current location", value: record.booking.currentLocation || "—" },
    { label: "Departure", value: record.booking.departureDate || "—" },
    { label: "ETA", value: record.booking.eta || "—" },
  ]

  return (
    <div className="grid items-stretch gap-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <div className="md-quote-stage-stack grid min-h-0 grid-rows-[auto_auto_auto] gap-2">
        {tabs}

        <Surface padding="none" className="md-quote-stage-panel flex min-h-0 items-center rounded-[var(--md-radius-xl)] p-1.5">
          <div className="md-quote-stage-panel__steps" role="list" aria-label={t("Booking progress")}>
            {bookingStages.map((stage) => (
              <div
                key={stage.id}
                className="md-quote-stage-panel__step"
                data-stage={stage.id}
                data-state={stage.state}
                style={{ "--md-quote-stage-progress": `${stage.progress}%` } as CSSProperties}
                role="listitem"
                aria-current={stage.state === "current" ? "step" : undefined}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={`${t(stage.label)}, ${stage.progress}%: ${t(stage.summary)}`}>
                      <span className="md-quote-stage-panel__label md-quote-stage-panel__label--track" aria-hidden="true">
                        <span>{t(stage.label)}</span>
                        {stage.progress > 0 && stage.progress < 100 ? <small data-i18n-skip>{stage.progress}%</small> : null}
                      </span>
                      <span className="md-quote-stage-panel__label md-quote-stage-panel__label--fill" aria-hidden="true">
                        <span>{t(stage.label)}</span>
                        {stage.progress > 0 && stage.progress < 100 ? <small data-i18n-skip>{stage.progress}%</small> : null}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8} className="md-quote-stage-tooltip">
                    <strong>{t(stage.label)} <span aria-hidden="true" data-i18n-skip>· {stage.progress}%</span></strong>
                    <span>{t(stage.summary)}</span>
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </Surface>

        <Surface padding="none" className="md-quote-stage-metadata min-h-0 overflow-hidden rounded-[var(--md-radius-xl)] px-3 py-1.5">
          <dl className="grid h-full grid-cols-4 items-center gap-3">
            {bookingMetadata.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt>{t(item.label)}</dt>
                <dd title={item.value} data-i18n-skip dir="auto">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </div>

      <BookingDexterArrivalConfidence record={record} />
    </div>
  )
}

function BookingBlockerSection({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  const blocker = getBookingBlocker(record)

  if (!blocker) {
    return (
      <section className="rounded-[var(--md-radius-xl)] bg-white/30 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(70,148,111,0.22)]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--md-green)]" strokeWidth={1.5} />
          <div>
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("No open blocker in the booking register")}</h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Continue to monitor carrier timing and connected workstreams; this status does not prove customs or document clearance.")}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[var(--md-radius-xl)] bg-white/34 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(209,78,78,0.28)]">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--md-red)]" strokeWidth={1.5} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Open blocker")}</h2>
            <StatusPill tone="red">{t("Needs action")}</StatusPill>
          </div>
          <p className="mt-2 text-[13px] font-medium text-[var(--md-text)]">{t(blocker.label)}</p>
          <p className="mt-1 text-[14px] leading-6 text-[var(--md-ink)]">{blocker.value}</p>
        </div>
      </div>
    </section>
  )
}

function BookingAvailabilityInspector({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  const hasFixture = hasPrototypeDetailData(record)
  const rows = [
    ["Booking register", "Available", "green"],
    ["Operator task", record.job ? "Available" : "No linked task", record.job ? "green" : "neutral"],
    ["Documents", hasFixture ? "Prototype fixture" : "Not connected", hasFixture ? "teal" : "neutral"],
    ["Customs", hasFixture ? "Prototype fixture" : "Not connected", hasFixture ? "teal" : "neutral"],
    ["Cost ledger", hasFixture ? "Prototype fixture" : "Not connected", hasFixture ? "teal" : "neutral"],
  ] as const

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingSectionHeading icon={<Database className="size-4" strokeWidth={1.5} />} title={t("Operational readiness")} />
      <div className="px-5 py-2">
        {rows.map(([label, state, tone]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none">
            <p className="text-[12px] text-[var(--md-text)]">{t(label)}</p>
            <StatusPill tone={tone}>{t(state)}</StatusPill>
          </div>
        ))}
      </div>
    </Surface>
  )
}

function bookingSignalAvailable(value: string | number | null | undefined) {
  const normalizedValue = String(value ?? "").trim()
  return Boolean(normalizedValue && !/^(?:—|-|0|pending|not raised|not supplied|not available)$/i.test(normalizedValue))
}

function BookingOperationalCoverage({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  const reliableCarrier = bookingSignalAvailable(record.booking.carrier) && !/pending/i.test(record.booking.carrier)
  const groups = [
    {
      label: "Movement",
      signals: [reliableCarrier, bookingSignalAvailable(record.booking.currentLocation), record.booking.progress > 0],
    },
    {
      label: "Schedule",
      signals: [bookingSignalAvailable(record.booking.departureDate), bookingSignalAvailable(record.booking.eta)],
    },
    {
      label: "Commercial close-out",
      signals: [bookingSignalAvailable(record.booking.value), bookingSignalAvailable(record.booking.invoice)],
    },
  ].map((group) => {
    const readySignals = group.signals.filter(Boolean).length
    const score = Math.round((readySignals / group.signals.length) * 100)
    const tone: StatusTone = score === 100 ? "green" : score >= 50 ? "amber" : "red"
    const state = score === 100 ? "Ready" : score > 0 ? "Needs input" : "Not ready"
    return { ...group, readySignals, score, state, tone }
  })
  const totalSignals = groups.reduce((total, group) => total + group.signals.length, 0)
  const readySignals = groups.reduce((total, group) => total + group.readySignals, 0)

  return (
    <Surface padding="none" className="h-full min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingSectionHeading
        icon={<ChartBar className="size-4" strokeWidth={1.5} />}
        title={t("Operational readiness")}
        meta={`${readySignals}/${totalSignals} · ${t("booking controls ready")}`}
      />
      <div className="grid gap-4 px-4 py-4" role="group" aria-label={t("Operational readiness")}>
        {groups.map((group) => (
          <div key={group.label} className="grid min-w-0 grid-cols-[minmax(108px,0.34fr)_minmax(0,1fr)_42px] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-medium text-[var(--md-ink)]">{t(group.label)}</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--md-subtle)]">{t(group.state)}</p>
            </div>
            <Progress
              value={group.score}
              aria-label={`${t(group.label)} ${group.score}%`}
              dir="ltr"
              className="h-2 rounded-full bg-[var(--md-line-strong)] [&>div]:bg-[var(--booking-signal-color)]"
              style={{ "--booking-signal-color": toneToVar(group.tone) } as CSSProperties}
            />
            <span data-i18n-skip dir="ltr" className="text-end text-[11.5px] font-medium tabular-nums text-[var(--md-ink)]">{group.score}%</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}

function BookingDecisionOverview({ record }: { record: BookingDetailRecord }) {
  const { language, t } = useLanguage()
  const updatedDate = new Date(record.booking.updatedAt)
  const updatedAt = !record.booking.updatedAt
    ? t("Not available")
    : Number.isNaN(updatedDate.getTime())
      ? record.booking.updatedAt
      : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(updatedDate)

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr]">
        <BookingCargoWiseGroup title="Booking header" compact>
          <div className="grid gap-1 min-[1500px]:grid-cols-2">
            <BookingCargoWiseField label="Booking ref" value={record.booking.id} />
            <BookingCargoWiseField label="Job ref" value={record.booking.jobRef} />
            <BookingCargoWiseField label="Customer" value={record.booking.customer} />
            <BookingCargoWiseField label="Owner" value={record.booking.owner} />
            <BookingCargoWiseField label="Status" value={record.booking.status} />
            <BookingCargoWiseField label="Updated" value={updatedAt} />
          </div>
        </BookingCargoWiseGroup>

        <BookingCargoWiseGroup title="Routing" compact>
          <div className="grid gap-1 min-[1500px]:grid-cols-2">
            <BookingCargoWiseField label="Mode" value={record.booking.mode} />
            <BookingCargoWiseField label="Direction" value={record.booking.direction} />
            <BookingCargoWiseField label="Origin" value={record.booking.origin} />
            <BookingCargoWiseField label="Destination" value={record.booking.destination} />
            <BookingCargoWiseField label="Departure" value={record.booking.departureDate} />
            <BookingCargoWiseField label="ETA" value={record.booking.eta} />
            <BookingCargoWiseField label="Current location" value={record.booking.currentLocation} />
          </div>
        </BookingCargoWiseGroup>

        <BookingCargoWiseGroup title="Cargo & commercial" compact>
          <div className="grid gap-1 min-[1500px]:grid-cols-2">
            <BookingCargoWiseField label="Shipment" value={record.booking.shipmentType} />
            <BookingCargoWiseField label="Equipment" value={record.booking.container} />
            <BookingCargoWiseField label="Carrier" value={record.booking.carrier} />
            <BookingCargoWiseField label="Vessel / flight" value={record.booking.vessel || t("Not supplied")} />
            <BookingCargoWiseField label="Value" value={record.booking.value} />
            <BookingCargoWiseField label="Invoice" value={record.booking.invoice || t("Not raised")} />
          </div>
        </BookingCargoWiseGroup>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <BookingOperationalCoverage record={record} />
        <aside aria-label={t("Booking context")}>
          <BookingAvailabilityInspector record={record} />
        </aside>
      </div>
    </div>
  )
}

function BookingRecordDetails({
  editable,
  onBookingChange,
  onCustomFieldChange,
  record,
}: {
  editable: boolean
  onBookingChange: (field: keyof LiveBooking, value: string | boolean) => void
  onCustomFieldChange: (index: number, value: string) => void
  record: BookingDetailRecord
}) {
  const { language, t } = useLanguage()
  const updatedDate = new Date(record.booking.updatedAt)
  const updatedAt = !record.booking.updatedAt
    ? t("Not available")
    : Number.isNaN(updatedDate.getTime())
      ? record.booking.updatedAt
      : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(updatedDate)

  const unavailable = t("Not available in the booking register")
  const editField = (field: keyof LiveBooking) => ({
    editable,
    onChange: (value: string) => onBookingChange(field, value),
  })

  return (
    <div className="grid items-start gap-[var(--md-page-stack-gap-compact)]">
      <BookingCargoWiseGroup title="Job data">
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Booking control")}</h4>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <BookingCargoWiseField label="Booking ref" value={record.booking.id} />
              <BookingCargoWiseField label="Job ref" value={record.booking.jobRef} {...editField("jobRef")} />
              <BookingCargoWiseField label="Status" value={record.booking.status} options={["On track", "Delayed", "Exception"]} {...editField("status")} />
              <BookingCargoWiseField label="Progress" value={`${record.booking.progress}%`} />
              <BookingCargoWiseField label="Mode" value={record.booking.mode} options={["OCEAN", "AIR", "ROAD", "FAS", "FSA"]} {...editField("mode")} />
              <BookingCargoWiseField label="Last updated" value={updatedAt} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Ownership")}</h4>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <BookingCargoWiseField label="Owner" value={record.booking.owner} {...editField("owner")} />
              <BookingCargoWiseField label="Direction" value={record.booking.direction} options={["Import", "Export", "Domestic", "Cross trade"]} {...editField("direction")} />
              <BookingCargoWiseField label="Favourite" value={record.booking.isFavourite ? "Yes" : "No"} options={["Yes", "No"]} editable={editable} onChange={(value) => onBookingChange("isFavourite", value === "Yes")} />
              <BookingCargoWiseField label="Current location" value={record.booking.currentLocation} {...editField("currentLocation")} />
              <BookingCargoWiseField label="Source ID" value={record.booking.sourceId} span />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("References")}</h4>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <BookingCargoWiseField label="Customer ref" value={record.booking.customerRef} {...editField("customerRef")} />
              <BookingCargoWiseField label="Supplier ref" value={record.booking.supplierRef} {...editField("supplierRef")} />
              <BookingCargoWiseField label="Invoice" value={record.booking.invoice} {...editField("invoice")} />
              <BookingCargoWiseField label="Documents" value={t("Not connected")} />
              <BookingCargoWiseField label="Workflow" value={record.booking.status} />
            </div>
          </div>
        </div>
      </BookingCargoWiseGroup>

      <div className="grid items-stretch gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[1.26fr_1.08fr_1fr]">
        <BookingCargoWiseGroup title="Customer" className="[--md-field-label-width:64px]">
          <BookingCargoWiseField label="Name" value={record.booking.customer} span {...editField("customer")} />
          <BookingCargoWiseField label="Code / ref" value={record.booking.customerRef} span {...editField("customerRef")} />
          <BookingCargoWiseField label="Address" value={unavailable} span />
          <BookingCargoWiseField label="Contact" value={unavailable} span />
        </BookingCargoWiseGroup>
        <BookingCargoWiseGroup title="Shipper" className="[--md-field-label-width:64px]">
          <BookingCargoWiseField label="Name" value={unavailable} span />
          <BookingCargoWiseField label="Reference" value={record.booking.supplierRef} span {...editField("supplierRef")} />
          <BookingCargoWiseField label="Collection" value={record.booking.origin} span {...editField("origin")} />
          <BookingCargoWiseField label="Address" value={unavailable} span />
        </BookingCargoWiseGroup>
        <BookingCargoWiseGroup title="Consignee" className="[--md-field-label-width:64px]">
          <BookingCargoWiseField label="Name" value={unavailable} span />
          <BookingCargoWiseField label="Reference" value={t("Not supplied")} span />
          <BookingCargoWiseField label="Delivery" value={record.booking.destination} span {...editField("destination")} />
          <BookingCargoWiseField label="Address" value={unavailable} span />
        </BookingCargoWiseGroup>
      </div>

      <div className="grid items-stretch gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[1.35fr_0.65fr]">
        <BookingCargoWiseGroup title="Service & carrier">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Service")}</h4>
              <div className="grid gap-1.5 md:grid-cols-2">
                <BookingCargoWiseField label="Shipment type" value={record.booking.shipmentType} {...editField("shipmentType")} />
                <BookingCargoWiseField label="Equipment / load" value={record.booking.container} {...editField("container")} />
                <BookingCargoWiseField label="From" value={record.booking.origin} {...editField("origin")} />
                <BookingCargoWiseField label="To" value={record.booking.destination} {...editField("destination")} />
                <BookingCargoWiseField label="Departure" value={record.booking.departureDate} {...editField("departureDate")} />
                <BookingCargoWiseField label="Arrival" value={record.booking.arrivalDate} {...editField("arrivalDate")} />
                <BookingCargoWiseField label="ETA" value={record.booking.eta} {...editField("eta")} />
                <BookingCargoWiseField label="Route" value={record.booking.route} />
              </div>
            </div>
            <div className="grid content-start gap-1.5">
              <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Carrier & supplier")}</h4>
              <div className="grid gap-1.5 md:grid-cols-2">
                <BookingCargoWiseField label="Carrier" value={record.booking.carrier} {...editField("carrier")} />
                <BookingCargoWiseField label="Vessel / flight" value={record.booking.vessel} {...editField("vessel")} />
                <BookingCargoWiseField label="Supplier ref" value={record.booking.supplierRef} {...editField("supplierRef")} />
                <BookingCargoWiseField label="Current location" value={record.booking.currentLocation} {...editField("currentLocation")} />
              </div>
            </div>
          </div>
        </BookingCargoWiseGroup>

        <BookingCargoWiseGroup title="Goods" contentClassName="md:grid-cols-2">
          <BookingCargoWiseField label="Booking value" value={record.booking.value} {...editField("value")} />
          <BookingCargoWiseField label="VIN" value={record.booking.vin} {...editField("vin")} />
          {record.booking.customFields.length
            ? record.booking.customFields.map((field, index) => <BookingCargoWiseField key={`${field.label}-${index}`} label={field.label} value={field.value} editable={editable} onChange={(value) => onCustomFieldChange(index, value)} />)
            : <BookingCargoWiseField label="Custom fields" value={t("No additional fields recorded")} span />}
        </BookingCargoWiseGroup>
      </div>

      <BookingAvailabilityInspector record={record} />
    </div>
  )
}

function UnavailableBookingSection({ title, detail, icon }: { title: string; detail: string; icon: ReactNode }) {
  const { t } = useLanguage()
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingSectionHeading icon={icon} title={t(title)} meta={t("Not connected")} />
      <div className="px-5 py-10 text-center">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("No connected data for this booking")}</h2>
        <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-6 text-[var(--md-text)]">{t(detail)}</p>
      </div>
    </Surface>
  )
}

function BookingDocumentsWorkspace({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  if (!hasPrototypeDetailData(record)) return <UnavailableBookingSection title="Documents" detail="The booking register does not include a document feed. Connect or sync the document system before document status can be shown here." icon={<FileText className="size-4" strokeWidth={1.5} />} />

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingSectionHeading icon={<FileText className="size-4" strokeWidth={1.5} />} title={t("Document set")} meta={t("Prototype fixture · not live")} />
      <div className="px-5 py-2">
        {[...bookingDocuments, ["CN export licence", "Not supplied", "required"]].map(([name, file, confidence]) => {
          const missing = confidence === "required"
          return (
            <div key={name} className="grid gap-2 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none md:grid-cols-[minmax(180px,1fr)_minmax(160px,1fr)_auto] md:items-center">
              <div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t(name)}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{file}</p></div>
              <p className="text-[12px] text-[var(--md-text)]">{confidence}</p>
              <StatusPill tone={missing ? "red" : "green"}>{t(missing ? "Missing" : "Parsed")}</StatusPill>
            </div>
          )
        })}
      </div>
    </Surface>
  )
}

function BookingCustomsWorkspace({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  if (!hasPrototypeDetailData(record)) return <UnavailableBookingSection title="Customs" detail="No customs case feed is connected to this prototype record. The booking status must not be treated as customs clearance." icon={<ShieldCheck className="size-4" strokeWidth={1.5} />} />

  return (
    <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
      <BookingBlockerSection record={record} />
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <BookingSectionHeading icon={<ShieldCheck className="size-4" strokeWidth={1.5} />} title={t("Customs workstream")} meta={t("Prototype fixture · not live")} />
        <div className="px-5 py-2">
          {customsEntries.map(([title, detail, state, tone]) => (
            <div key={title} className="grid gap-2 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none md:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)_auto] md:items-center">
              <div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t(title)}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{detail}</p></div>
              <p className="text-[12px] text-[var(--md-text)]">{t("Review source evidence before action")}</p>
              <StatusPill tone={tone}>{t(state)}</StatusPill>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  )
}

function BookingFinanceWorkspace({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  const hasFixture = hasPrototypeDetailData(record)

  return (
    <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
      <Surface padding="none" className="h-fit overflow-hidden rounded-[var(--md-radius-xl)]">
        <BookingSectionHeading icon={<WalletCards className="size-4" strokeWidth={1.5} />} title={t("References and value")} meta={t("Booking register")} />
        <BookingFactRows rows={[
          ["Booking value", record.booking.value],
          ["Invoice", record.booking.invoice || "Not raised"],
          ["Job reference", record.booking.jobRef],
          ["Customer reference", record.booking.customerRef],
          ["Supplier reference", record.booking.supplierRef || "Not supplied"],
        ]} />
      </Surface>
      {hasFixture ? (
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <BookingSectionHeading icon={<CircleDollarSign className="size-4" strokeWidth={1.5} />} title={t("Cost lines")} meta={t("Prototype fixture · not live")} />
          <BookingFactRows rows={costRows.map(([label, detail, amount]) => [label, `${amount} · ${detail}`] as const)} />
        </Surface>
      ) : (
        <UnavailableBookingSection title="Cost ledger" detail="No supplier-cost or accounting feed is connected for this booking. The booking value above is the only finance field available in the register." icon={<CircleDollarSign className="size-4" strokeWidth={1.5} />} />
      )}
    </div>
  )
}

function BookingActivityWorkspace({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  if (!hasPrototypeDetailData(record)) return <UnavailableBookingSection title="Activity and audit" detail="No activity or audit feed is connected for this prototype record. A reliable event history will appear here only when source events are available." icon={<Activity className="size-4" strokeWidth={1.5} />} />

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingSectionHeading icon={<Activity className="size-4" strokeWidth={1.5} />} title={t("Activity and audit")} meta={t("Prototype fixture · not live")} />
      <div className="px-5 py-2">
        {bookingTimeline.map((item) => (
          <div key={`${item.time}-${item.text}`} className="grid gap-2 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none sm:grid-cols-[130px_12px_minmax(0,1fr)] sm:items-start">
            <p className="text-[12px] text-[var(--md-text)]">{item.time}</p>
            <span className="mt-1 size-2 rounded-full" style={{ background: toneToVar(item.tone) }} />
            <p className="text-[13px] leading-5 text-[var(--md-ink)]">{item.text}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}

function BookingDetailTabPage({
  activeTab,
  onBookingChange,
  onCustomFieldChange,
  record,
}: {
  activeTab: BookingDetailTab
  onBookingChange: (field: keyof LiveBooking, value: string | boolean) => void
  onCustomFieldChange: (index: number, value: string) => void
  record: BookingDetailRecord
}) {
  if (activeTab === "Details") return <BookingRecordDetails editable onBookingChange={onBookingChange} onCustomFieldChange={onCustomFieldChange} record={record} />
  if (activeTab === "Documents") return <BookingDocumentsWorkspace record={record} />
  if (activeTab === "Customs") return <BookingCustomsWorkspace record={record} />
  if (activeTab === "Finance") return <BookingFinanceWorkspace record={record} />
  if (activeTab === "Audit") return <BookingActivityWorkspace record={record} />
  return <BookingDecisionOverview record={record} />
}

export function BookingAskPanel({
  collapsed = false,
  onCollapsedChange,
  className,
}: {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState(askStarterMessages)

  function askQuestion(question: string) {
    const trimmed = question.trim()
    if (!trimmed) return
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      {
        role: "assistant",
        text: "For MD-22455, the key blocker is still the missing CN export licence. Costs are stable except demurrage risk if this crosses the free-time window.",
      },
    ])
    setDraft("")
  }

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Open booking chat"
        className={cn(
          "relative grid size-14 place-items-center overflow-visible rounded-full bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[0_0_0_1px_rgba(255,255,255,0.34),0_16px_38px_var(--md-accent-a32),0_0_30px_var(--md-accent-a28)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] hover:bg-[var(--md-accent-hover)]",
          className,
        )}
        onClick={() => onCollapsedChange?.(false)}
      >
        <span className="absolute inset-[-9px] -z-10 rounded-full bg-[var(--md-accent-a18)] blur-md" />
        <AiBrain className="size-5" strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <aside className={cn("flex h-full min-h-[560px] flex-col overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-soft)]", className)}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-[var(--md-accent)] text-[var(--md-accent-ink)]">
            <AiBrain className="size-4" strokeWidth={1.4} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-medium text-[var(--md-ink)]">Ask about this booking</h2>
            <p className="mt-0.5 truncate text-[12px] text-[var(--md-text)]">MD-22455 · Shanghai to Long Beach</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Collapse booking chat"
          className="size-8 rounded-[var(--md-radius-md)] bg-white/45 shadow-[var(--md-shadow-line)]"
          onClick={() => onCollapsedChange?.(true)}
        >
          <PanelRightClose data-icon="inline-start" strokeWidth={1.3} />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 md-scrollbar">
        {messages.map((message, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={cn(
              "max-w-[92%] rounded-[var(--md-radius-lg)] px-4 py-3 text-[13px] leading-6 shadow-[var(--md-shadow-line)]",
              message.role === "assistant"
                ? "bg-white/62 text-[var(--md-ink)]"
                : "ml-auto bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[0_0_0_1px_var(--md-accent-a06),0_12px_24px_var(--md-accent-a16)]",
            )}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div className="px-5 pb-5 pt-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.08)]">
        <div className="mb-3 flex flex-wrap gap-2">
          {askSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full bg-white/45 px-3 py-1.5 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/75 hover:text-[var(--md-ink)]"
              onClick={() => askQuestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            askQuestion(draft)
          }}
        >
          <textarea
            aria-label="Ask about booking"
            className="min-h-[46px] flex-1 resize-none rounded-[var(--md-radius-lg)] bg-white/65 px-3 py-3 text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none placeholder:text-[var(--md-subtle)]"
            placeholder="Ask about costs, customs, ETA..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" size="icon" className="size-[46px] rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">
            <SendHorizontal data-icon="inline-start" strokeWidth={1.4} />
          </Button>
        </form>
      </div>
    </aside>
  )
}

function FloatingBookingAskPanel({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  return (
    <div
      className={cn(
        "fixed right-6 z-30 hidden transition-[background,color,box-shadow,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] xl:block",
        collapsed ? "top-6 size-14" : "bottom-6 top-6 w-[368px]",
      )}
    >
      <BookingAskPanel collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
    </div>
  )
}

export function BookingDetailWorkspace({
  navigate,
  bookingId = "md-22455",
}: {
  navigate: (path: string) => void
  bookingId?: string
}) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<BookingDetailTab>("Overview")
  const [record, setRecord] = useState<BookingDetailRecord | null>(null)
  const [draftBooking, setDraftBooking] = useState<LiveBooking | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading")

  function changeActiveTab(nextTab: BookingDetailTab) {
    setActiveTab(nextTab)
  }

  useEffect(() => {
    let cancelled = false
    const normalizedId = bookingId.trim().toUpperCase()

    setActiveTab("Overview")
    setRecord(null)
    setDraftBooking(null)
    setLoadState("loading")

    void getLiveBooking(normalizedId).then((booking) => {
      if (cancelled) return
      if (!booking) {
        setLoadState("not-found")
        return
      }
      setRecord({ id: booking.id, booking })
      setDraftBooking(booking)
      setLoadState("ready")
    }).catch(() => {
      if (!cancelled) setLoadState("error")
    })

    return () => { cancelled = true }
  }, [bookingId])

  if (loadState === "loading") {
    return (
      <main className="grid min-h-full place-items-center bg-[var(--md-analytics-bg)] px-[var(--md-page-pad)] text-[var(--md-ink)]">
        <p className="text-[13px] text-[var(--md-text)]">{t("Loading booking...")}</p>
      </main>
    )
  }

  if (loadState === "not-found") {
    return (
      <main className="grid min-h-full place-items-center bg-[var(--md-analytics-bg)] px-[var(--md-page-pad)] text-[var(--md-ink)]">
        <Surface padding="lg" className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] text-center">
          <h1 className="text-[20px] font-medium">{t("Booking not found")}</h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{t("The requested booking is not available in this workspace. No fallback record has been substituted.")}</p>
          <Button className="mt-5 h-10 rounded-[var(--md-radius-lg)] px-4 text-[13px]" onClick={() => navigate("/bookings")}>{t("Return to bookings")}</Button>
        </Surface>
      </main>
    )
  }

  if (loadState === "error" || !record) {
    return (
      <main className="grid min-h-full place-items-center bg-[var(--md-analytics-bg)] px-[var(--md-page-pad)] text-[var(--md-ink)]">
        <Surface padding="lg" className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] text-center">
          <h1 className="text-[20px] font-medium">{t("Booking could not be loaded")}</h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{t("We could not verify this booking in the current workspace. Check your connection or access and try again.")}</p>
          <Button className="mt-5 h-10 rounded-[var(--md-radius-lg)] px-4 text-[13px]" onClick={() => navigate("/bookings")}>{t("Return to bookings")}</Button>
        </Surface>
      </main>
    )
  }

  const loadedRecord = record
  const detailsDirty = Boolean(draftBooking && JSON.stringify(draftBooking) !== JSON.stringify(loadedRecord.booking))
  const visibleRecord = activeTab === "Details" && draftBooking ? { ...loadedRecord, booking: draftBooking } : loadedRecord

  function updateDraftBooking(field: keyof LiveBooking, value: string | boolean) {
    setDraftBooking((current) => {
      if (!current) return current
      const next = { ...current, [field]: value } as LiveBooking
      if (field === "origin" || field === "destination") next.route = `${next.origin} → ${next.destination}`
      if (field === "status") next.tone = statusTone[next.status]
      return next
    })
  }

  function updateDraftCustomField(index: number, value: string) {
    setDraftBooking((current) => current ? {
      ...current,
      customFields: current.customFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, value } : field),
    } : current)
  }

  function discardDetails() {
    setDraftBooking(loadedRecord.booking)
  }

  function saveDetails() {
    if (!draftBooking || !detailsDirty) return
    const savedBooking = { ...draftBooking, updatedAt: new Date().toISOString() }
    setRecord({ ...loadedRecord, booking: savedBooking })
    setDraftBooking(savedBooking)
    toast.success(t("Booking changes saved"), { description: t("The updated details are available for this booking session.") })
  }

  return (
    <main className="min-h-full bg-[var(--md-analytics-bg)] px-4 py-4 text-[var(--md-ink)] sm:px-5">
      <div className="grid w-full gap-2">
        <BookingDetailHeader
          activeTab={activeTab}
          detailsDirty={detailsDirty}
          onDiscardDetails={discardDetails}
          onSaveDetails={saveDetails}
          onTabChange={changeActiveTab}
          record={visibleRecord}
        />
        <div className="relative min-h-px overflow-x-clip" data-booking-tab-panel>
          <BookingDetailTabPage
            activeTab={activeTab}
            onBookingChange={updateDraftBooking}
            onCustomFieldChange={updateDraftCustomField}
            record={visibleRecord}
          />
        </div>
      </div>
    </main>
  )
}
