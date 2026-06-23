import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileText,
  KanbanSquare,
  MessageCircle,
  PanelRightClose,
  Paperclip,
  Plus,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  TriangleAlert,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  bookingCargo,
  bookingDocuments,
  bookingFilters,
  bookingMetrics,
  bookingMilestones,
  bookings,
  bookingTimeline,
  currentOperator,
  operatorJobs,
  type BookingMode,
  type BookingStatus,
  type StatusTone,
} from "@/data/multideck-data"
import { FilterChips, TabsRail } from "./workflow-components"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"
import { AnimatedList } from "./animated-list"
import { PageSettingsMenu, type PageSettingsViewOption } from "./page-settings-menu"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

export type Booking = (typeof bookings)[number]
export type OperatorJob = (typeof operatorJobs)[number]
export const bookingViewModes = ["Table", "Board"] as const
export type BookingViewMode = (typeof bookingViewModes)[number]
export const bookingViewOptions = [
  { value: "Table", label: "Table", icon: Table2 },
  { value: "Board", label: "Board", icon: KanbanSquare },
] satisfies readonly PageSettingsViewOption<BookingViewMode>[]
const bookingDetailTabs = ["Details", "Parties", "Cargo", "Routing", "Collection & Delivery", "Customs", "Job Costing", "Documents", "Workflow", "Notes"] as const
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

function getBookingDetailRecord(bookingId: string) {
  const normalizedId = bookingId.toUpperCase()
  const booking = bookings.find((item) => item.id.toUpperCase() === normalizedId)
  const job = operatorJobs.find((item) => item.bookingId.toUpperCase() === normalizedId || item.id.toUpperCase() === normalizedId)

  return {
    id: job?.bookingId ?? booking?.id ?? "MD-22455",
    booking: booking ?? bookings.find((item) => item.id === "MD-22455") ?? bookings[0],
    job,
  }
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

const partyRows = [
  ["Customer / Billing", "NORFABIE", "Northstar Fabrication Ltd", "14 Docklands Way, Ardmore, AM1 4QA, Fictionland", "Operations Desk", "900045612"],
  ["Shipper / Consignor", "NORFABIE", "Northstar Fabrication Ltd", "14 Docklands Way, Ardmore, AM1 4QA, Fictionland", "Northport Export Team", "SHIP-9001"],
  ["Consignee", "HARRETSYD", "Harbourview Retail Pty Ltd", "27 Harbour View Road, Bay District BD 2048, Pacifica", "Bayview Imports", "PO-9017"],
  ["Notify Party", "HARRETSYD", "Harbourview Retail Pty Ltd", "27 Harbour View Road, Bay District BD 2048, Pacifica", "Warehouse Receiving", "N/A"],
] as const

const routeLegRows = [
  ["1", "Sea", "Main Leg", "FLNPT", "Northport, Fictionland", "FDWST", "Le Havre, France", "ED611R", "TROUPER", "18-Mar-26 00:00", "04-Apr-26 04:30", "19-Mar-26 12:07", ""],
  ["2", "Sea", "Transhipment", "FDWST", "Le Havre, France", "MUPLU", "Port Louis, Mauritius", "IP611R", "MSC Sindy", "30-Mar-26 06:45", "10-Apr-26 00:00", "", ""],
  ["3", "Sea", "On Carriage", "MUPLU", "Port Louis, Mauritius", "PCBVH", "Bayhaven, Pacifica", "MA601A", "MSC Toronto", "23-Apr-26 00:00", "28-May-26 05:24", "", "28-May-26 06:00"],
] as const

const cargoLineRows = [
  ["NXDU7086840", "1000466", "1,380", "PKG", "7,300.000", "KG", "GEN", "Composite panels", "0.000", "M3"],
  ["VRHU6073892", "1000486", "1,000", "PKG", "7,420.000", "KG", "GEN", "Composite panels", "0.000", "M3"],
  ["QZNU3123998", "1000462", "1,380", "PKG", "7,200.000", "KG", "GEN", "Composite panels", "0.000", "M3"],
  ["ALSU6578880", "1000485", "1,380", "PKG", "7,280.000", "KG", "GEN", "Composite panels", "0.000", "M3"],
  ["BXHU7237091", "1000490", "1,380", "PKG", "7,080.000", "KG", "GEN", "Composite panels", "0.000", "M3"],
] as const

const costLineRows = [
  ["SYSAUTO", "System automation fee", "FIS", "BLUWATGN", "GBP", "3.04", "3.04", "NORFABIE", "GBP", "0.00", "VAT"],
  ["FRT", "International Freight", "FIS", "BLUWATGN", "USD", "7,200.00", "5,486.55", "NORFABIE", "GBP", "21,072.00", "FREEVAT"],
  ["MISCFRT", "Freight Auxiliaries", "FIS", "BLUWATGN", "USD", "4,636.00", "3,532.73", "NORFABIE", "GBP", "0.00", "FREEVAT"],
  ["ODOC", "Origin Documentation Fee", "FIS", "BLUWATGN", "EUR", "150.00", "131.53", "NORFABIE", "GBP", "0.00", "FREEVAT"],
  ["OTHC", "Origin Terminal Handling", "FIS", "BLUWATGN", "EUR", "700.00", "613.82", "NORFABIE", "GBP", "0.00", "FREEVAT"],
  ["MISCFRT", "Destination charges", "FIS", "BLUWATGN", "GBP", "2,304.70", "2,304.70", "NORFABIE", "GBP", "0.00", "FREEVAT"],
] as const

const documentRows = [
  ["02-Apr-26 11:04", "HBL", "Copy (Express)", "House Bill Copy - REF9002686.pdf"],
  ["20-Mar-26 13:02", "EMB", "Express MBL", "Master Bill REF449331.pdf"],
  ["11-Mar-26 14:57", "MSC", "Customs from roadtrain", "REF9002686_ROUTE_UPDATE_5x40HC.msg"],
  ["11-Mar-26 12:12", "LBC", "Line Booking Confirmation", "carrier-booking-confirmation-REF90115.pdf"],
  ["11-Mar-26 11:31", "SHI", "Shipping Instruction", "REF9002686 Shipping Instruction.pdf"],
  ["10-Mar-26 17:26", "CIV", "Commercial Invoice", "Load 9002 Commercial Invoice.pdf"],
  ["10-Mar-26 17:26", "PKL", "Packing List", "Load 9002 Packing List.pdf"],
] as const

const workflowRows = [
  ["C9001283", "1", "Departure from First Load Port", "DEP", "Exception-Scheduled Action Missing", "30-Mar-26 06:45", "19-Mar-26 12:07", "Published"],
  ["C9001283", "6", "Arrival at Final Discharge Port", "ARV", "Exception-Scheduled Action Missing", "28-May-26 05:24", "22-Mar-26 12:53", "Published"],
] as const

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <StatusPill tone={statusTone[status]}>{status}</StatusPill>
}

export function BookingModePill({ mode }: { mode: BookingMode }) {
  return <StatusPill tone={modeTone[mode]} className="min-w-[88px] justify-center">{mode}</StatusPill>
}

export function BookingMetricCard({ label, value, tone }: (typeof bookingMetrics)[number]) {
  return (
    <Surface padding="md" className="min-h-[92px] rounded-[var(--md-radius-xl)]">
      <p className="text-[13px] font-medium text-[var(--md-text)]">{label}</p>
      <strong
        className={cn(
          "mt-2 block text-[30px] font-medium leading-none tracking-normal",
          tone === "neutral" ? "text-[var(--md-ink)]" : undefined,
        )}
        style={{ color: tone === "neutral" ? undefined : toneToVar(tone) }}
      >
        {value}
      </strong>
    </Surface>
  )
}

export function BookingMetricStrip() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {bookingMetrics.map((metric) => (
        <BookingMetricCard key={metric.label} {...metric} />
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
  return <PageSettingsMenu viewOptions={bookingViewOptions} value={value} onViewChange={onChange} />
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
  return (
    <div className="flex flex-col gap-[var(--md-page-stack-gap)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="text-[32px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Bookings</h1>
        <p className="mt-2 text-[16px] leading-6 text-[var(--md-ink)]">
          <span className="font-medium">23 in transit</span>
          <span className="text-[var(--md-text)]"> · </span>
          <span className="font-medium text-[var(--md-red)]">2 exceptions</span>
          <span className="text-[var(--md-text)]"> · </span>
          <span className="font-medium text-[var(--md-amber)]">3 delayed</span>
          <span className="text-[var(--md-text)]"> · </span>
          <span className="font-medium">4 delivered today</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <DexterActionPill onClick={onSpeakToDexter} />
        <BookingViewSwitch value={viewMode} onChange={onViewModeChange} />
      </div>
    </div>
  )
}

export function BookingAdvancedSearch({
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
          <span className="ms-1 grid min-w-5 place-items-center rounded-full bg-[var(--md-accent)] px-1.5 text-[11px] text-white" data-i18n-skip dir="ltr">
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
                        className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]"
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
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="sr-only" htmlFor={`${criterion.id}-from`}>Start date</label>
                              <div className="relative">
                                <CalendarDays className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.25} />
                                <Input
                                  id={`${criterion.id}-from`}
                                  type="date"
                                  value={criterion.value}
                                  onChange={(event) => updateCriterion(criterion.id, { value: event.target.value })}
                                  className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] ps-9 text-[13px] shadow-[var(--md-shadow-line)]"
                                  dir="ltr"
                                />
                              </div>
                              <label className="sr-only" htmlFor={`${criterion.id}-to`}>End date</label>
                              <div className="relative">
                                <CalendarDays className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.25} />
                                <Input
                                  id={`${criterion.id}-to`}
                                  type="date"
                                  value={criterion.valueTo ?? ""}
                                  onChange={(event) => updateCriterion(criterion.id, { valueTo: event.target.value })}
                                  className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] ps-9 text-[13px] shadow-[var(--md-shadow-line)]"
                                  dir="ltr"
                                />
                              </div>
                            </div>
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
                className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]"
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

function SelectionBox({ selected }: { selected?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-[var(--md-radius-sm)] bg-white shadow-[var(--md-shadow-line)]",
        selected && "bg-[var(--md-accent)] shadow-[0_0_0_3px_rgba(14,125,116,0.12)]",
      )}
    >
      {selected ? <Check className="size-3 text-white" strokeWidth={1.8} /> : null}
    </span>
  )
}

export function BookingRow({
  booking,
  selected,
  favourite,
  onSelect,
  onToggleFavourite,
  onOpen,
}: {
  booking: Booking
  selected?: boolean
  favourite?: boolean
  onSelect: () => void
  onToggleFavourite: () => void
  onOpen: () => void
}) {
  return (
    <TableRow
      className={cn(
        "h-[78px] cursor-pointer border-[rgba(11,20,19,0.045)] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-[#f8faf9]",
        selected && "bg-[#f4faf8] shadow-[inset_3px_0_0_var(--md-accent),inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(11,20,19,0.04)] hover:bg-[#f2f8f6]",
        booking.status === "Exception" && !selected && "bg-[#fbfdfc] hover:bg-[#f6faf8]",
      )}
      onClick={onOpen}
    >
      <TableCell className="w-12 pl-0">
        <button
          type="button"
          aria-label={`Select ${booking.id}`}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
          }}
        >
          <SelectionBox selected={selected} />
        </button>
      </TableCell>
      <TableCell className="w-12">
        <button
          type="button"
          aria-label={`${favourite ? "Remove" : "Add"} ${booking.id} favourite`}
          aria-pressed={favourite}
          className={cn(
            "grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/60 hover:text-[var(--md-amber)]",
            favourite && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] shadow-[var(--md-shadow-line)]",
          )}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavourite()
          }}
        >
          <Star className={cn("size-4", favourite && "fill-current")} strokeWidth={1.35} />
        </button>
      </TableCell>
      <TableCell className="min-w-[130px]">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full" style={{ background: toneToVar(booking.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(booking.tone)} 12%, transparent)` }} />
          <p className="text-[14px] font-medium text-[var(--md-ink)]">{booking.id}</p>
        </div>
      </TableCell>
      <TableCell className="min-w-[300px]">
        <p className="text-[15px] font-medium text-[var(--md-ink)]">{booking.customer}</p>
        <p className="mt-1 text-[13px] text-[var(--md-text)]">{booking.route}</p>
      </TableCell>
      <TableCell className="min-w-[190px]">
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{booking.carrier}</p>
        <p className="mt-1 text-[13px] text-[var(--md-text)]">{booking.container}</p>
      </TableCell>
      <TableCell>
        <BookingModePill mode={booking.mode} />
      </TableCell>
      <TableCell className="text-right text-[14px] font-medium text-[var(--md-ink)]">{booking.value}</TableCell>
      <TableCell className="text-right">
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{booking.eta}</p>
        <p className="text-[12px] text-[var(--md-text)]">{booking.time}</p>
      </TableCell>
      <TableCell>
        <BookingStatusPill status={booking.status} />
      </TableCell>
      <TableCell className="min-w-[150px]">
        <div className="flex items-center gap-3">
          <Progress
            value={booking.progress}
            className="h-1.5 flex-1 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--progress-color)]"
            style={{ "--progress-color": toneToVar(booking.tone) } as CSSProperties}
          />
          <span className="w-8 text-right text-[13px] text-[var(--md-text)]">{booking.progress}%</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="grid size-8 place-items-center rounded-full bg-[rgba(14,125,116,0.12)] text-[12px] font-medium text-[var(--md-accent)]">{booking.owner}</span>
      </TableCell>
    </TableRow>
  )
}

export function BookingsTable({
  rows,
  selectedIds,
  favouriteIds,
  onToggleBooking,
  onToggleFavourite,
  onOpenBooking,
}: {
  rows: Booking[]
  selectedIds: Set<string>
  favouriteIds?: Set<string>
  onToggleBooking: (id: string) => void
  onToggleFavourite?: (id: string) => void
  onOpenBooking: (booking: Booking) => void
}) {
  return (
    <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)]">
      <Table className="min-w-[1470px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
            <TableHead className="w-12 pl-0" />
            <TableHead className="w-12 text-[12px] font-medium text-[var(--md-text)]">Star</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Booking</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Customer · route</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Carrier · container</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Mode</TableHead>
            <TableHead className="text-right text-[12px] font-medium text-[var(--md-text)]">Value</TableHead>
            <TableHead className="text-right text-[12px] font-medium text-[var(--md-text)]">ETA</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Status</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Progress</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              selected={selectedIds.has(booking.id)}
              favourite={Boolean(favouriteIds?.has(booking.id))}
              onSelect={() => onToggleBooking(booking.id)}
              onToggleFavourite={() => onToggleFavourite?.(booking.id)}
              onOpen={() => onOpenBooking(booking)}
            />
          )) : (
            <TableRow className="h-[180px] border-[rgba(11,20,19,0.04)] hover:bg-transparent">
              <TableCell colSpan={11} className="text-center">
                <div className="mx-auto max-w-[360px]">
                  <p className="text-[14px] font-medium text-[var(--md-ink)]">No bookings match this search</p>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">
                    Remove a criterion or switch back to Open to widen the list.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function BookingBoardPreview({
  rows = bookings,
  onOpenBooking,
}: {
  rows?: Booking[]
  onOpenBooking: (booking: Booking) => void
}) {
  const columns = [
    ["Open", rows.slice(0, 3)],
    ["Exception", rows.filter((booking) => booking.status === "Exception")],
    ["Delivered soon", rows.slice(4, 7)],
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map(([label, rows]) => (
        <Surface key={label} padding="md" className="rounded-[var(--md-radius-xl)]">
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{label}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {rows.length ? rows.map((booking) => (
              <button key={booking.id} type="button" className="rounded-[var(--md-radius-lg)] bg-white/55 p-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white" onClick={() => onOpenBooking(booking)}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-[var(--md-ink)]">{booking.id}</span>
                  <BookingStatusPill status={booking.status} />
                </div>
                <p className="mt-2 truncate text-[14px] font-medium text-[var(--md-ink)]">{booking.customer}</p>
                <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{booking.route}</p>
              </button>
            )) : (
              <p className="rounded-[var(--md-radius-lg)] bg-white/35 px-3 py-4 text-[13px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                No matching bookings in this lane.
              </p>
            )}
          </div>
        </Surface>
      ))}
    </div>
  )
}

function DetailSideRail({
  navigate,
  collapsed,
  onCollapsedChange,
}: {
  navigate: (path: string) => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const related = bookings.filter((booking) => booking.id !== "MD-22455").slice(0, 4)

  return (
    <aside className={cn("hidden h-screen min-h-0 shrink-0 overflow-hidden bg-[var(--md-sidebar-bg)] px-3 py-4 shadow-[inset_-1px_0_0_rgba(11,20,19,0.06)] transition-[width] duration-300 lg:flex lg:flex-col", collapsed ? "w-[68px]" : "w-[248px]")}>
      <div className="flex items-center justify-between gap-2">
        {!collapsed ? <img src={multideckFullLogo} alt="Multideck" className="h-[26px] w-auto" /> : <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[13px] font-medium text-white">M</span>}
        <Button type="button" variant="ghost" size="icon" aria-label={collapsed ? "Expand booking rail" : "Collapse booking rail"} className="size-8 rounded-[var(--md-radius-md)] bg-white/45 shadow-[var(--md-shadow-line)]" onClick={() => onCollapsedChange(!collapsed)}>
          <PanelRightClose className={cn("size-4 transition-transform", collapsed && "rotate-180")} strokeWidth={1.3} />
        </Button>
      </div>
      <button type="button" className={cn("mt-8 flex items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-2 text-[13px] font-medium text-[var(--md-text)] hover:bg-white/45 hover:text-[var(--md-ink)]", collapsed && "justify-center")} onClick={() => navigate("/bookings")}>
        <ArrowLeft className="size-4 shrink-0" strokeWidth={1.2} />
        {!collapsed ? <span>All bookings</span> : null}
      </button>
      {!collapsed ? <p className="mt-6 px-2 text-[11px] font-medium uppercase text-[var(--md-subtle)]">Related shipments</p> : null}
      <div className="mt-3 flex min-h-0 flex-col gap-2 overflow-y-auto md-scrollbar">
        {related.map((booking) => (
          <button key={booking.id} type="button" className={cn("rounded-[var(--md-radius-lg)] px-2 py-2 text-left transition hover:bg-white/45", collapsed ? "grid place-items-center" : "grid grid-cols-[10px_1fr] gap-3")} onClick={() => navigate(getBookingDetailPath(booking.id))}>
            <span className="mt-1 size-2 rounded-full" style={{ background: toneToVar(booking.tone) }} />
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-[var(--md-text)]">{booking.id}</span>
                <span className="block truncate text-[13px] font-medium leading-5 text-[var(--md-ink)]">{booking.route}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </aside>
  )
}

function BookingDetailHeader({
  activeTab,
  onTabChange,
  record,
  navigate,
}: {
  activeTab: BookingDetailTab
  onTabChange: (tab: BookingDetailTab) => void
  record: ReturnType<typeof getBookingDetailRecord>
  navigate: (path: string) => void
}) {
  const tabs = bookingDetailTabs.map((label) => ({ label }))
  const statusLabel = record.job?.status ?? record.booking.status
  const statusTone = record.job?.tone ?? record.booking.tone

  return (
    <header className="sticky top-0 z-20 border-b border-[rgba(11,20,19,0.08)] bg-[color-mix(in_srgb,var(--md-bg)_94%,transparent)] px-4 pt-4 backdrop-blur-xl md:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-[13px] font-medium text-[var(--md-text)]">
            <span className="uppercase tracking-normal">Shipment</span>
            <span>{record.id}</span>
            <StatusPill tone={statusTone} className="h-7 px-3 text-[13px]">{statusLabel}</StatusPill>
            <StatusPill tone="neutral" className="h-7 px-3 text-[13px]">{record.booking.mode} · {record.booking.container}</StatusPill>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
            <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)] md:text-[28px]">{record.job?.route ?? record.booking.route}</h1>
            <p className="pb-1 text-[15px] font-medium text-[var(--md-text)]">{record.booking.carrier} · {record.booking.customer}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/35 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65" onClick={() => navigate(`/bookings/${record.id.toLowerCase()}/cargowise-reference`)}>
            Full data reference
          </Button>
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/35 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65">
            Add note
          </Button>
          <Button className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[#0b6f67]">
            Save changes
          </Button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto md-scrollbar">
        <TabsRail tabs={tabs} activeTab={activeTab} onChange={(tab) => onTabChange(tab as BookingDetailTab)} />
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
              index === 0 && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.65),0_0_0_1px_rgba(14,125,116,0.08)]",
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
                  checked && "bg-[var(--md-accent)] shadow-[0_0_0_3px_rgba(14,125,116,0.12)]",
                )}
              >
                {checked ? <Check className="size-3.5 text-white" strokeWidth={1.8} /> : null}
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

function DensePanel({
  title,
  meta,
  children,
  className,
}: {
  title: string
  meta?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Surface padding="none" className={cn("overflow-hidden rounded-[var(--md-radius-lg)]", className)}>
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[rgba(11,20,19,0.08)] px-3 py-2">
        <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta ? <span className="truncate text-[12px] text-[var(--md-text)]">{meta}</span> : null}
      </div>
      <div className="p-3">{children}</div>
    </Surface>
  )
}

type DenseFieldSize = "xs" | "sm" | "md" | "lg" | "wide"
type DenseField = readonly [label: string, value: string, size?: DenseFieldSize]

function FieldGrid({
  rows,
  columns = "auto",
}: {
  rows: readonly DenseField[]
  columns?: "auto" | "two" | "three"
}) {
  const widthBySize: Record<DenseFieldSize, string> = {
    xs: "md-field-xs",
    sm: "md-field-sm",
    md: "md-field-md",
    lg: "md-field-lg",
    wide: "md-field-wide",
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-auto pb-1 md-scrollbar">
      <div
        className={cn(
          "min-w-0 gap-x-3 gap-y-1.5",
          columns === "auto" && "flex flex-wrap",
          columns === "two" && "md:grid-cols-2",
          columns === "three" && "md:grid-cols-2 xl:grid-cols-3",
          columns !== "auto" && "grid",
        )}
      >
        {rows.map(([label, value, size = "md"]) => (
          <label key={label} className={cn("grid min-w-0 items-center gap-2 text-[12px]", widthBySize[size])}>
            <span className="truncate text-right text-[var(--md-text)]">{label}</span>
            <span className="min-h-6 truncate rounded-[var(--md-radius-sm)] bg-white/55 px-2 py-0.5 leading-5 font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">{value}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function CompactTable({
  columns,
  rows,
}: {
  columns: readonly string[]
  rows: readonly (readonly string[])[]
}) {
  return (
    <div className="overflow-x-auto md-scrollbar">
      <Table className="min-w-[940px] text-[12px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.08)]">
            {columns.map((column, index) => (
              <TableHead key={`${column}-${index}`} className="h-8 whitespace-nowrap px-2 text-[11px] font-medium text-[var(--md-text)]">{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow
              // eslint-disable-next-line react/no-array-index-key
              key={rowIndex}
              className="border-[rgba(11,20,19,0.07)] odd:bg-white/22 hover:bg-[rgba(14,125,116,0.08)]"
            >
              {row.map((cell, cellIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableCell key={cellIndex} className="h-8 max-w-[240px] truncate px-2 py-1.5 font-medium text-[var(--md-ink)]">{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ShipmentDetailsPage({ booking }: { booking: Booking }) {
  return (
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(520px,0.95fr)_minmax(360px,0.72fr)] 2xl:grid-cols-[minmax(560px,0.95fr)_minmax(420px,0.72fr)]">
          <DensePanel title="Mode and references" meta="Basic registration">
            <FieldGrid
              rows={[
                ["Transport", booking.mode, "sm"],
                ["Container", booking.container, "sm"],
                ["Type", "Standard House", "md"],
                ["House Bill", booking.id.replace("MD-", "S900"), "sm"],
                ["Service", "STD", "xs"],
                ["Release", "Express Bill of Lading", "lg"],
                ["Phase", "Open Security", "md"],
                ["Order Ref", "900045612", "sm"],
              ]}
            />
          </DensePanel>
          <DensePanel title="Ports and dates" meta="Route summary">
            <FieldGrid
              rows={[
                ["Origin", "FLNPT", "xs"],
                ["Destination", "PCBVH", "xs"],
                ["ETD", "16-Mar-26", "sm"],
                ["ETA", "28-May-26", "sm"],
                ["Incoterm", "DDP", "xs"],
                ["Terms", "Delivered Duty Paid", "lg"],
              ]}
            />
          </DensePanel>
        </div>
        <DensePanel title="Shipment measures" meta="Totals and chargeable detail">
          <FieldGrid
            rows={[
              ["Weight", "36,280.000 KG", "sm"],
              ["Volume", "0.000 M3", "sm"],
              ["Chargeable", "36.280 M3", "sm"],
              ["Packs", "6,520 PKG", "sm"],
              ["Inners", "0 CTN", "xs"],
              ["Goods Value", "0.00 GBP", "sm"],
              ["Insurance", "0.00 GBP", "sm"],
              ["CO2e", "Pending", "sm"],
            ]}
          />
        </DensePanel>
        <DensePanel title="Goods and instructions" meta="Description / marks">
          <FieldGrid rows={[["Goods", "Composite panels", "lg"], ["Marks", "As addressed", "lg"], ["Additional Terms", "Freight prepaid", "lg"], ["Inspection", "Unknown - no security measures taken", "lg"]]} />
        </DensePanel>
        <DensePanel title="Job links" meta="Order ref 900045612">
          <CompactTable columns={["Job Number", "Job Type", "Description", "Status", "Date", "Goods Description"]} rows={[["C9001283", "CNF", booking.route, "Open", "19-Mar-26", "Composite panels"]]} />
        </DensePanel>
      </div>
      <DensePanel title="AI edit proposal" meta="Draft only">
        <div className="space-y-3 text-[13px] leading-5 text-[var(--md-text)]">
          <p>Suggested update: set Delivery Required By to match the final ETA plus customer delivery buffer.</p>
          <div className="rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.08)] p-3 text-[var(--md-ink)]">
            Change delivery required by from blank to 31-May-26 17:00.
          </div>
          <div className="flex gap-2">
            <Button className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] text-white hover:bg-[#0b6f67]">Apply</Button>
            <Button variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[12px] shadow-[var(--md-shadow-line)]">Dismiss</Button>
          </div>
        </div>
      </DensePanel>
    </div>
  )
}

function PartiesPage() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {partyRows.map(([role, code, name, address, contact, reference]) => (
        <DensePanel key={role} title={role} meta={code}>
          <FieldGrid rows={[["Company", name], ["Office", address], ["Contact", contact], ["Reference", reference]]} />
        </DensePanel>
      ))}
    </div>
  )
}

function CargoWorkspacePage() {
  return (
    <div className="flex flex-col gap-3">
      <DensePanel title="Container and pack lines" meta="5 containers / 6,520 packs">
        <CompactTable columns={["Container", "Seal", "Packs", "Type", "Weight", "Unit", "Commodity", "Description", "Volume", "Unit"]} rows={cargoLineRows} />
      </DensePanel>
      <div className="grid gap-3 xl:grid-cols-3">
        <DensePanel title="Commodity">
          <FieldGrid rows={[["Code", "GEN"], ["Description", "Composite panels"], ["HS Code", "Pending"], ["Origin", "Fictionland"]]} />
        </DensePanel>
        <DensePanel title="Cargo flags">
          <FieldGrid rows={[["Dangerous Goods", "No"], ["Temperature", "No"], ["Stackable", "Unknown"], ["Special Notes", "Check outturn condition"]]} />
        </DensePanel>
        <DensePanel title="Shipment totals">
          <FieldGrid rows={[["Outer Packages", "6,520"], ["Weight", "36,280.000 KG"], ["Volume", "0.000 M3"], ["Chargeable", "36.280 M3"]]} />
        </DensePanel>
      </div>
    </div>
  )
}

function RoutingWorkspacePage() {
  return (
    <div className="flex flex-col gap-3">
      <DensePanel title="Route legs" meta="Multi-leg sea route">
        <CompactTable columns={["Order", "Mode", "Type", "From", "From Name", "To", "To Name", "Voyage", "Vessel", "ETD", "ETA", "ATD", "ATA"]} rows={routeLegRows} />
      </DensePanel>
      <DensePanel title="Selected leg details" meta="Leg 1">
        <FieldGrid rows={[["Carrier", "BLUWATGB / Eastport"], ["Vessel", "TROUPER"], ["Lloyds / IMO", "9326952"], ["Load Port", "FLNPT"], ["Discharge Port", "FDWST"], ["Docs Due", "Pending"], ["CTO Cut Off", "Pending"], ["VGM Cut Off", "Pending"]]} />
      </DensePanel>
    </div>
  )
}

function CollectionDeliveryPage() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <DensePanel title="Collection" meta="Pickup">
        <FieldGrid rows={[["Broker", "Not selected"], ["Transport Co.", "Not selected"], ["Pickup From", "Northstar Fabrication Ltd"], ["Address", "14 Docklands Way, Ardmore, Fictionland"], ["Required From", "Pending"], ["Required By", "Pending"], ["Estimated", "06-Mar-26 08:00"], ["Actual", "Pending"], ["Drop Mode", "Wait for Pack/Unpack"]]} />
      </DensePanel>
      <DensePanel title="Delivery" meta="Final delivery">
        <FieldGrid rows={[["Broker", "Not selected"], ["Transport Co.", "Not selected"], ["Delivery Agent", "Southern Cross Logistics"], ["Deliver To", "Harbourview Retail Pty Ltd"], ["Address", "27 Harbour View Road, Bay District BD 2048, Pacifica"], ["FCL Available", "31-May-26 00:00"], ["Storage Date", "03-Jun-26 00:00"], ["Estimated", "Pending"], ["Actual", "Pending"]]} />
      </DensePanel>
      <DensePanel title="Transport bookings" className="xl:col-span-2">
        <CompactTable columns={["Booking ID", "Description", "Transport", "Transport Ref.", "Status", "Active", "Consol ID", "First Pickup Estimate", "Last Delivery Estimate"]} rows={[["", "", "", "", "", "", "C9001283", "", ""]]} />
      </DensePanel>
    </div>
  )
}

function CustomsWorkspacePage() {
  return (
    <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
      <DensePanel title="Declaration parties">
        <FieldGrid rows={[["Exporter", "Northstar Fabrication Ltd"], ["Consignee", "Harbourview Retail Pty Ltd"], ["Entry Type", "EXP / Export"], ["Transport", "SEA / Sea Freight"], ["Container Mode", "FCL"], ["Submit Type", "CDS"]]} />
      </DensePanel>
      <DensePanel title="Declaration details">
        <FieldGrid rows={[["MRN", "Pending"], ["House Bill", "S9002686"], ["Origin Port", "FLNPT"], ["Destination", "PCBVH / Bayview"], ["Goods", "Composite panels"], ["Total Weight", "36,280.000 KG"], ["Incoterm", "DDP"], ["Declarant", "Meridian Forwarding Ltd"], ["Rep. Type", "Direct Representation"]]} />
      </DensePanel>
      <DensePanel title="Customs organisations" className="xl:col-span-2">
        <CompactTable columns={["Role", "Code", "Organisation", "Office", "Contact"]} rows={[["Carrier", "BLUWATGB", "Bluewater Shipping", "Eastport", ""], ["Declarant", "MERFWDGB", "Meridian Forwarding Ltd", "Head Office", ""], ["External Broker", "", "None selected", "", ""], ["Consignor", "", "None selected", "", ""]]} />
      </DensePanel>
    </div>
  )
}

function JobCostingWorkspacePage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <MiniStat label="Cost" value="12,897.79" />
        <MiniStat label="Revenue" value="26,340.00" tone="green" />
        <MiniStat label="Profit" value="13,442.21" tone="teal" />
        <MiniStat label="Margin" value="51.04%" tone="amber" />
      </div>
      <DensePanel title="Charge lines" meta="Cost and sell by debtor / creditor">
        <CompactTable columns={["Code", "Description", "Dept", "Creditor", "Cost Cur.", "OS Cost", "Local Cost", "Debtor", "Sell Cur.", "OS Sell", "Tax"]} rows={costLineRows} />
      </DensePanel>
    </div>
  )
}

function DocumentsWorkspacePage() {
  return (
    <div className="flex flex-col gap-3">
      <DensePanel title="Document storage" meta="This shipment">
        <CompactTable columns={["Date", "Type", "Description", "File Name"]} rows={documentRows} />
      </DensePanel>
      <DensePanel title="Document tracking">
        <CompactTable columns={["Category", "Type", "Description", "Period", "Date Received", "Usage", "Original Required", "Credit Control"]} rows={[["SCL", "CIV", "Commercial Invoice", "SHP", "06-Mar-26 16:59", "Both Export and Import", "No", "No"], ["SCL", "PKL", "Packing List", "SHP", "06-Mar-26 16:59", "Both Export and Import", "No", "No"], ["SCL", "HBL", "House Waybill / Bill of Lading", "SHP", "13-Mar-26 14:07", "Both Export and Import", "No", "No"]]} />
      </DensePanel>
    </div>
  )
}

function WorkflowWorkspacePage() {
  return (
    <div className="flex flex-col gap-3">
      <DensePanel title="Milestones and exceptions" meta="Workflow & tracking">
        <CompactTable columns={["Job", "Seq", "Description", "Event", "Exception", "Estimated", "Actual Start", "State"]} rows={workflowRows} />
      </DensePanel>
      <DensePanel title="Selected milestone">
        <FieldGrid rows={[["Description", "Departure from First Load Port"], ["Milestone", "DEP / Departure"], ["Exception Type", "Exception-Scheduled Action Missing"], ["Estimated", "30-Mar-26 06:45"], ["Actual", "19-Mar-26 12:07"], ["Reminder", "No"], ["Assigned Staff", "Pending"], ["Group", "None selected"]]} />
      </DensePanel>
    </div>
  )
}

function NotesWorkspacePage() {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <DensePanel title="Operational notes">
        <textarea className="min-h-[260px] w-full resize-y rounded-[var(--md-radius-md)] bg-white/55 p-3 text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none" defaultValue={"Customer requires Bayview delivery agent updates once ATA is confirmed.\n\nCheck commercial invoice and packing list against final container allocation before customs close-out."} />
      </DensePanel>
      <DensePanel title="Audit summary">
        <div className="space-y-3 text-[13px] leading-5 text-[var(--md-text)]">
          {bookingTimeline.slice(0, 5).map((item) => (
            <div key={`${item.time}-${item.text}`} className="border-b border-[rgba(11,20,19,0.08)] pb-3">
              <p className="font-medium text-[var(--md-ink)]">{item.time}</p>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </DensePanel>
    </div>
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
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
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
              <span className="grid size-9 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[12px] font-medium text-[var(--md-accent)]">
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
          className="mt-[var(--md-page-stack-gap)] h-10 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[13px] font-medium text-white hover:bg-[#0b6f67]"
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

function BookingDetailTabPage({ activeTab, booking }: { activeTab: BookingDetailTab; booking: Booking }) {
  if (activeTab === "Parties") return <PartiesPage />
  if (activeTab === "Cargo") return <CargoWorkspacePage />
  if (activeTab === "Routing") return <RoutingWorkspacePage />
  if (activeTab === "Collection & Delivery") return <CollectionDeliveryPage />
  if (activeTab === "Customs") return <CustomsWorkspacePage />
  if (activeTab === "Job Costing") return <JobCostingWorkspacePage />
  if (activeTab === "Documents") return <DocumentsWorkspacePage />
  if (activeTab === "Workflow") return <WorkflowWorkspacePage />
  if (activeTab === "Notes") return <NotesWorkspacePage />
  return <ShipmentDetailsPage booking={booking} />
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
          "relative grid size-14 place-items-center overflow-visible rounded-full bg-[var(--md-accent)] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.34),0_16px_38px_rgba(14,125,116,0.32),0_0_30px_rgba(14,125,116,0.28)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] hover:bg-[#0b6f67]",
          className,
        )}
        onClick={() => onCollapsedChange?.(false)}
      >
        <span className="absolute inset-[-9px] -z-10 rounded-full bg-[rgba(14,125,116,0.18)] blur-md" />
        <Sparkles className="size-5" strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <aside className={cn("flex h-full min-h-[560px] flex-col overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-soft)]", className)}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-[var(--md-accent)] text-white">
            <Sparkles className="size-4" strokeWidth={1.4} />
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
                : "ml-auto bg-[var(--md-accent)] text-white shadow-[0_0_0_1px_rgba(14,125,116,0.06),0_12px_24px_rgba(14,125,116,0.16)]",
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
          <Button type="submit" size="icon" className="size-[46px] rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-white hover:bg-[#0b6f67]">
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

function ReferenceSection({
  title,
  meta,
  children,
  className,
}: {
  title: string
  meta?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", className)}>
      <div className="flex min-h-9 min-w-0 items-center justify-between gap-3 border-b border-[rgba(11,20,19,0.08)] px-3 py-1.5">
        <h2 className="min-w-0 truncate text-[13px] font-semibold text-[var(--md-ink)]">{title}</h2>
        {meta ? <span className="text-[11px] font-medium text-[var(--md-text)]">{meta}</span> : null}
      </div>
      <div className="p-2.5">{children}</div>
    </section>
  )
}

function MiniAddressBlock({
  label,
  code,
  name,
  address,
}: {
  label: string
  code: string
  name: string
  address: string
}) {
  return (
    <div className="min-w-0 rounded-[var(--md-radius-md)] bg-white/45 p-2 shadow-[var(--md-shadow-line)]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-[var(--md-ink)]">{label}</span>
        <span className="rounded-[var(--md-radius-sm)] bg-[rgba(14,125,116,0.1)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--md-accent)]">{code}</span>
      </div>
      <p className="truncate text-[12px] font-semibold leading-4 text-[var(--md-ink)]">{name}</p>
      <p className="mt-0.5 whitespace-pre-line text-[12px] leading-4 text-[var(--md-text)]">{address}</p>
    </div>
  )
}

function ReferenceTable({
  columns,
  rows,
  minWidth = 900,
}: {
  columns: readonly string[]
  rows: readonly (readonly string[])[]
  minWidth?: number
}) {
  return (
    <div className="overflow-x-auto md-scrollbar">
      <Table style={{ minWidth }} className="text-[11px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.08)]">
            {columns.map((column, index) => (
              <TableHead key={`${column}-${index}`} className="h-7 whitespace-nowrap px-1.5 text-[11px] font-semibold text-[var(--md-text)]">{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow
              // eslint-disable-next-line react/no-array-index-key
              key={rowIndex}
              className="border-[rgba(11,20,19,0.06)] odd:bg-white/22 hover:bg-[rgba(14,125,116,0.08)]"
            >
              {row.map((cell, cellIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableCell key={cellIndex} className="h-7 max-w-[220px] truncate px-1.5 py-1 font-medium text-[var(--md-ink)]">{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CargoWiseReferenceHeader({
  navigate,
  bookingId,
}: {
  navigate: (path: string) => void
  bookingId: string
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[rgba(11,20,19,0.1)] bg-[color-mix(in_srgb,var(--md-bg)_96%,transparent)] px-3 py-2 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] bg-white/45 shadow-[var(--md-shadow-line)]" onClick={() => navigate(`/bookings/${bookingId}`)}>
            <ArrowLeft className="size-4" strokeWidth={1.3} />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold text-[var(--md-ink)]">CargoWise Full Data Reference / Shipment {bookingId.toUpperCase()}</h1>
            <p className="text-[12px] text-[var(--md-text)]">Design-only dummy data from the CargoWise screenshots. Use for density, grouping, tab coverage, and UI layout decisions.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Basic Registration", "Additional Detail", "Routing", "Packing", "Pickup", "Delivery", "Brokerage", "Billing", "Doc Data", "eDocs", "Workflow"].map((tab) => (
            <a key={tab} href={`#${tab.toLowerCase().replaceAll(" ", "-")}`} className="rounded-[var(--md-radius-sm)] bg-white/45 px-2 py-1 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:text-[var(--md-ink)]">
              {tab}
            </a>
          ))}
        </div>
      </div>
    </header>
  )
}

export function CargoWiseReferenceWorkspace({
  navigate,
  bookingId,
}: {
  navigate: (path: string) => void
  bookingId: string
}) {
  const shipmentNumber = bookingId.toUpperCase().startsWith("MD-") ? bookingId.toUpperCase().replace("MD-", "S900") : "S9002686"

  return (
    <div className="h-screen overflow-hidden bg-[var(--md-bg)] text-[var(--md-ink)]">
      <CargoWiseReferenceHeader navigate={navigate} bookingId={bookingId} />
      <main className="md-scrollbar h-[calc(100vh-58px)] overflow-y-auto px-3 py-3">
        <div className="grid gap-3">
          <section id="basic-registration" className="grid gap-3 2xl:grid-cols-[370px_minmax(520px,0.8fr)_minmax(420px,0.65fr)]">
            <ReferenceSection title="Basic Registration / Parties">
              <div className="grid gap-2">
                <FieldGrid rows={[["Transport", "SEA", "xs"], ["Container", "FCL", "xs"], ["Type", "STD", "xs"]]} />
                <MiniAddressBlock label="Consignor" code="NORFABIE" name="NORTHSTAR FABRICATION LTD" address={"14 DOCKLANDS WAY\nNORTH QUAY\nARDMORE\nAM1 4QA\nFICTIONLAND"} />
                <MiniAddressBlock label="Consignee" code="HARRETSYD" name="HARBOURVIEW RETAIL PTY LTD" address={"27 HARBOUR VIEW ROAD\nBAY DISTRICT BD 2048\nPACIFICA"} />
                <MiniAddressBlock label="Prepaid Bill-To Party" code="NORFABIE" name="NORTHSTAR FABRICATION LTD" address={"14 DOCKLANDS WAY\nNORTH QUAY"} />
              </div>
            </ReferenceSection>
            <ReferenceSection title="Basic Registration / Shipment Details">
              <FieldGrid
                rows={[
                  ["House Bill", shipmentNumber, "sm"], ["Domestic", "No", "xs"], ["Origin", "FLNPT", "xs"], ["Destination", "PCBVH", "xs"],
                  ["ETD", "16-Mar-26", "sm"], ["ETA", "28-May-26", "sm"], ["Weight", "36,280.000 KG", "sm"], ["Vol", "0.000 M3", "sm"],
                  ["Chargeable", "36.280 M3", "sm"], ["WV", "36.280 M3", "sm"], ["Packs", "6,520 PKG", "sm"], ["Inners", "0 CTN", "xs"],
                  ["Goods Value", "0.00 GBP", "sm"], ["Insurance", "0.00 GBP", "sm"], ["CO2e", "Pending KG", "sm"], ["Description", "COMPOSITE PANELS", "lg"],
                  ["Marks & Nums", "More...", "md"], ["Incoterm", "DDP / Delivered Duty Paid", "lg"], ["Additional Terms", "Freight Prepaid", "lg"],
                  ["Service Level", "STD / Standard", "md"], ["Entry Details", "Customs Entries", "md"], ["Inspection", "UNK / Unknown - No Security Measures Taken", "lg"],
                  ["Release Type", "EBL / Express Bill of Lading", "lg"], ["Air Waybill Dims", "Default (Dims, fallback to Vol)", "lg"], ["House Bill Type", "FIA / FIATA HBL", "md"],
                  ["On Board", "SHP / Shipped / 19-Mar-26", "lg"], ["HBL Dlv. Mode", "DOOR/CY / DOOR/CY", "md"], ["Originals", "0", "xs"], ["Exp. Bills", "1", "xs"],
                  ["Charges Apply", "NON / No Charges showing", "lg"], ["Shipper COD", "0.00", "sm"], ["Phase", "ALL / Open Security", "md"], ["Spot Rate", "0.0000 STD", "sm"],
                ]}
              />
            </ReferenceSection>
            <ReferenceSection title="Custom Fields and Job Links">
              <p className="mb-3 rounded-[var(--md-radius-md)] bg-white/35 p-3 text-[12px] leading-5 text-[var(--md-text)]">Custom fields are not configured in this dummy branch. This area is intentionally reserved for customer-defined shipment fields.</p>
              <FieldGrid rows={[["Order Refs", "900045612", "lg"]]} />
              <ReferenceTable columns={["Job Number", "Job Type", "Job Description", "Job Status", "Date", "Goods Description"]} rows={[["C9001283", "CNF", "Fictionland to Pacifica shipment", "Open", "19-Mar-26", "COMPOSITE PANELS"]]} minWidth={620} />
            </ReferenceSection>
          </section>

          <section id="additional-detail" className="grid gap-3 2xl:grid-cols-[minmax(460px,0.7fr)_minmax(360px,0.55fr)_minmax(360px,0.55fr)]">
            <ReferenceSection title="Additional Detail / Consolidation">
              <ReferenceTable columns={["Reference", "1st Load", "Last Disc", "Master Bill"]} rows={[["C9001283", "FLNPT", "PCBVH", ""]]} minWidth={480} />
              <FieldGrid rows={[["ETA", "04-Apr-26 04:30", "md"], ["ETD", "18-Mar-26 00:00", "md"], ["Voyage", "ED611R", "sm"], ["Vessel", "TROUPER", "md"], ["Planned Carrier", "BLUWATGB / Bluewater Shipping / Eastport", "lg"]]} />
            </ReferenceSection>
            <ReferenceSection title="Weight / Volume / Chargeable">
              <FieldGrid rows={[["Client Weight", "36,280.00 KG", "sm"], ["Carrier Weight", "36,280.000 KG", "sm"], ["Client Volume", "0.000 M3", "sm"], ["Carrier Volume", "0.000 M3", "sm"], ["Chargeable", "36.280 M3", "sm"], ["Density Factor", "1:6 / Volumetric 1:12", "lg"], ["Excess W/V", "0.000 M3", "sm"]]} />
            </ReferenceSection>
            <ReferenceSection title="Notify / References / Services">
              <MiniAddressBlock label="Notify Party" code="HARRETSYD" name="HARBOURVIEW RETAIL PTY LTD" address={"27 HARBOUR VIEW ROAD\nBAY DISTRICT BD 2048\nPACIFICA"} />
              <ReferenceTable columns={["Ctry/Rgn", "Type", "Reference Number"]} rows={[["", "", ""], ["", "", ""]]} minWidth={420} />
            </ReferenceSection>
            <ReferenceSection title="Freight Rates and Gateways">
              <FieldGrid rows={[["Rev. Autorating", "", "sm"], ["CT Level", "", "md"], ["Rate Commodity", "None selected", "lg"], ["Commodity Local", "", "md"], ["FMC Tariff ID", "", "md"], ["Negotiated Cost", "0.0000 STD", "sm"], ["Gateway Sell", "0.0000 STD", "sm"], ["Payment Term", "PPD / Prepaid", "md"], ["Rate Origin", "None selected", "lg"], ["Rate Destination", "None selected", "lg"], ["G/W Service", "None selected", "lg"]]} />
            </ReferenceSection>
            <ReferenceSection title="Additional Detail / Services" meta="Service work rows" className="2xl:col-span-2">
              <ReferenceTable columns={["Type", "Job Service", "Date Booked", "Service Date Completed", "Contractor"]} rows={[["", "", "", "", ""], ["", "", "", "", ""]]} minWidth={760} />
              <FieldGrid rows={[["Service Type", "", "sm"], ["Contractor", "None selected", "lg"], ["Srv. Location", "", "lg"], ["Date Booked", "", "sm"], ["Completed", "", "sm"], ["Service Rate", "0.0000", "sm"], ["Service Notes", "", "lg"], ["Service Count", "", "sm"], ["Duration", "", "sm"], ["Ref", "", "sm"]]} />
            </ReferenceSection>
          </section>

          <section id="routing" className="grid gap-3">
            <ReferenceSection title="Routing / Legs">
              <ReferenceTable columns={["Defined By", "Linked", "L.", "Mode", "Type", "Status", "Vessel / Journey Name", "Voyage / Flight", "Load Port", "Discharge", "Domestic", "ETD", "ETA", "ATD", "ATA"]} rows={routeLegRows.map((leg) => ["C9001283", "", leg[0], leg[1], leg[2], "CNF", leg[8], leg[7], leg[3], leg[5], "", leg[9], leg[10], leg[11], leg[12]])} minWidth={1500} />
            </ReferenceSection>
            <ReferenceSection title="Routing / Selected Leg Details">
              <FieldGrid rows={[["Defined By", "C9001283", "sm"], ["Mode", "SEA", "xs"], ["Type", "MAI", "xs"], ["Status", "CNF", "xs"], ["Charter Route", "No", "xs"], ["Linked", "No", "xs"], ["Voyage", "ED611R", "sm"], ["Vessel", "TROUPER", "md"], ["Lloyds/IMO", "9326952", "sm"], ["Carrier", "BLUWATGB / EASTPORT", "lg"], ["Load Port", "FLNPT", "xs"], ["Discharge Port", "FDWST", "xs"], ["ETD", "18-Mar-26 00:00", "md"], ["ATD", "19-Mar-26 12:07", "md"], ["ETA", "04-Apr-26 04:30", "md"], ["ATA", "", "sm"], ["CTO Cut Off", "", "sm"], ["CFS Cut Off", "", "sm"], ["Docs Due", "", "sm"], ["VGM Cut Off", "", "sm"]]} />
            </ReferenceSection>
          </section>

          <section id="packing" className="grid gap-3">
            <ReferenceSection title="Packing / Containers">
              <ReferenceTable columns={["Container Number", "Count", "Seal Number", "Mode", "Cont. Type", "Delivery Mode", "Sealed By", "2nd Sealed By", "3rd Sealed By", "Train Wagon", "Total Packs"]} rows={[["ALSU6578880", "1", "1000485", "FCL", "40HC", "DOR/DOR", "", "", "", "", "1,380"], ["BXHU7237091", "1", "1000490", "FCL", "40HC", "DOR/DOR", "", "", "", "", "1,380"], ["NXDU7086840", "1", "1000466", "FCL", "40HC", "DOR/DOR", "", "", "", "", "1,380"], ["QZNU3123998", "1", "1000462", "FCL", "40HC", "DOR/DOR", "", "", "", "", "1,380"], ["VRHU6073892", "1", "1000486", "FCL", "40HC", "DOR/DOR", "", "", "", "", "1,000"]]} minWidth={1180} />
            </ReferenceSection>
            <ReferenceSection title="Packing / Pack Lines">
              <ReferenceTable columns={["Packs", "Type", "Container", "Weight", "Inspection", "Origin", "Commodity", "Packing Order", "Shipment ID", "Engine CC", "Variants", "Volume", "Vehicle Reg", "Supplier Booking Line", "Supplier Booking ID"]} rows={cargoLineRows.map((row, index) => [row[2], row[3], row[0], row[4], "", "", "GEN", "1", shipmentNumber, "", "", row[8], "", index === 0 ? "Load 9002" : "", ""])} minWidth={1500} />
            </ReferenceSection>
            <section className="grid gap-3 2xl:grid-cols-[minmax(390px,0.65fr)_minmax(360px,0.55fr)_minmax(430px,0.7fr)]">
              <ReferenceSection title="Commodity / Description">
                <FieldGrid rows={[["Commodity", "GEN / General", "md"], ["Harmonised", "", "md"], ["HS Country", "", "md"], ["Origin", "None Selected", "lg"], ["Goods Desc.", "COMPOSITE PANELS", "lg"], ["Ref Number", "", "md"], ["Outer Packs", "6,520", "sm"], ["Shipment Weight", "36,280.000 KG", "sm"], ["Volume", "0.000 M3", "sm"]]} />
              </ReferenceSection>
              <ReferenceSection title="Dangerous Goods / Temperature">
                <FieldGrid rows={[["DG Substance", "None Selected", "lg"], ["DG Class", "", "sm"], ["Flash Point", "0.0 C", "sm"], ["UNDG Contact", "", "md"], ["Temp Controlled", "No", "xs"], ["Min Temp", "0.0 C", "sm"], ["Max Temp", "0.0 C", "sm"]]} />
              </ReferenceSection>
              <ReferenceSection title="Packing / Location / Outturn">
                <FieldGrid rows={[["Packs", "1,380 PKG", "sm"], ["Weight", "7,300.000 KG", "sm"], ["Volume", "0.000 M3", "sm"], ["Length", "0.000 M", "sm"], ["Width", "0.000", "sm"], ["Height", "0.000 M", "sm"], ["Transit Whse", "", "md"], ["Status", "", "sm"], ["Outturn", "0", "xs"], ["Damaged", "0", "xs"], ["Pillaged", "0", "xs"], ["Outturn Wt.", "0.000 KG", "sm"], ["Outturn Vol.", "0.000 M3", "sm"], ["Comment", "", "lg"], ["Marks", "", "lg"]]} />
              </ReferenceSection>
            </section>
          </section>

          <section id="pickup" className="grid gap-3 2xl:grid-cols-[380px_minmax(520px,0.7fr)]">
            <ReferenceSection title="Pickup / Organisations">
              <FieldGrid rows={[["Export Broker", "", "sm"], ["Pickup Co.", "", "sm"], ["Pickup Agent", "", "sm"], ["Pickup By", "", "sm"]]} />
              <MiniAddressBlock label="Pickup From" code="NORFABIE" name="NORTHSTAR FABRICATION LTD" address={"14 DOCKLANDS WAY\nNORTH QUAY\nARDMORE\nAM1 4QA\nFICTIONLAND"} />
            </ReferenceSection>
            <ReferenceSection title="Pickup / Status and Detail">
              <FieldGrid rows={[["Shipper Ref", "900045612", "sm"], ["HBL Status", "CNF / SI Confirmed", "lg"], ["CFS Warehouse", "No organisation selected", "lg"], ["Receipt Req.", "", "sm"], ["Dispatch Req.", "", "sm"], ["Interim Receipt", "", "sm"], ["Drop Mode", "WUP / Wait for Pack/Unpack", "lg"], ["Pickup From", "", "sm"], ["Pickup By", "", "sm"], ["Trn Booking Req.", "", "sm"], ["Estimated", "06-Mar-26 08:00", "md"], ["Actual", "", "sm"], ["Pickup Labour", "0.00", "sm"], ["Truck Wait", "0.00", "sm"], ["Detention", "10 / 0 Days / 0.00", "md"]]} />
            </ReferenceSection>
            <ReferenceSection title="Pickup / Transport Bookings" meta="Details / Confirmations" className="2xl:col-span-2">
              <ReferenceTable columns={["Booking ID", "Description", "Transport", "Transport Ref.", "Status", "Active", "Consol. ID", "1st Pic. Estimate", "1st Pic. Actual", "Last Del. Estimate", "Last Del. Act."]} rows={[["", "", "", "", "", "", "C9001283", "", "", "", ""]]} minWidth={1200} />
            </ReferenceSection>
          </section>

          <section id="delivery" className="grid gap-3 2xl:grid-cols-[380px_minmax(520px,0.7fr)]">
            <ReferenceSection title="Delivery / Organisations">
              <FieldGrid rows={[["Import Broker", "", "sm"], ["Transport Co.", "", "sm"], ["Delivery Agent", "SOUCROFRE", "sm"], ["Delivery By", "", "sm"]]} />
              <MiniAddressBlock label="Deliver To" code="HARRETSYD" name="HARBOURVIEW RETAIL PTY LTD" address={"27 HARBOUR VIEW ROAD\nBAY DISTRICT BD 2048\nPACIFICA"} />
            </ReferenceSection>
            <ReferenceSection title="Delivery / Dates and Detail">
              <FieldGrid rows={[["CFS Warehouse", "No organisation selected", "lg"], ["Receipt Req.", "", "sm"], ["Dispatch Req.", "", "sm"], ["CFS Arrival By", "", "sm"], ["Drop Mode", "WUP / Wait for Pack/Unpack", "lg"], ["FCL Available", "31-May-26 00:00", "md"], ["FCL Storage", "03-Jun-26 00:00", "md"], ["Delivery From", "", "sm"], ["Delivery By", "", "sm"], ["Trn Booking Req.", "", "sm"], ["Estimated Delivery", "", "md"], ["Actual Delivery", "", "md"], ["Delivery Labour", "0.00", "sm"], ["Truck Wait", "0.00", "sm"]]} />
            </ReferenceSection>
            <ReferenceSection title="Delivery / Transport Bookings" meta="Details / Confirmations" className="2xl:col-span-2">
              <ReferenceTable columns={["Booking ID", "Description", "Transport", "Transport Ref.", "Status", "Active", "Consol. ID", "1st Pic. Estimate", "1st Pic. Actual", "Last Del. Estimate", "Last Del. Act."]} rows={[["", "", "", "", "", "", "C9001283", "", "", "", ""]]} minWidth={1200} />
            </ReferenceSection>
          </section>

          <section id="brokerage" className="grid gap-3 2xl:grid-cols-[370px_minmax(520px,0.7fr)_minmax(430px,0.7fr)]">
            <ReferenceSection title="Brokerage / Declaration Parties">
              <MiniAddressBlock label="[UCC 3/1] Exporter" code="NORFABIE" name="NORTHSTAR FABRICATION LTD" address={"14 DOCKLANDS WAY\nNORTH QUAY\nARDMORE\nAM1 4QA\nFICTIONLAND"} />
              <MiniAddressBlock label="[UCC 3/9] Consignee" code="HARRETSYD" name="HARBOURVIEW RETAIL PTY LTD" address={"27 HARBOUR VIEW ROAD\nBAY DISTRICT BD 2048\nPACIFICA"} />
              <FieldGrid rows={[["Entry Type", "EXP / Export", "md"], ["Dec. Type", "EX / Export to rest of world", "lg"], ["Transport", "SEA / Sea Freight", "lg"], ["Container Mode", "FCL / Full Container Load", "lg"], ["Submit Type", "CDS / Customs Declaration", "lg"]]} />
            </ReferenceSection>
            <ReferenceSection title="Brokerage / Declaration and Shipment">
              <FieldGrid rows={[["MRN", "", "md"], ["Status", "", "md"], ["Customs Reason", "", "lg"], ["Ocean Bill", "", "md"], ["Inland MOT", "", "sm"], ["Vessel", "", "md"], ["Voyage", "", "sm"], ["Load Port", "", "sm"], ["Dep.", "19-Mar-26", "sm"], ["Arrival", "", "sm"], ["Discharge Port", "", "sm"], ["Arr.", "28-May-26", "sm"], ["House Bill", shipmentNumber, "sm"], ["Origin Port", "FLNPT / Invalid Selection / FL", "lg"], ["Destination", "PCBVH / Bayview / PC", "lg"], ["Goods", "COMPOSITE PANELS", "lg"], ["C/R", "GB", "xs"], ["No. Pkgs", "6.5 PKG", "sm"], ["Weight", "36,280.000 KG", "sm"], ["Volume", "0.000 M3", "sm"], ["Incoterm", "DDP / Delivered Duty Paid", "lg"], ["Client DUCR", "", "md"], ["Agent Ref.", "", "md"], ["DUCR", "", "md"], ["Master UCR", "", "md"], ["Office of Exit", "None Selected", "lg"]]} />
            </ReferenceSection>
            <ReferenceSection title="Brokerage / Organisations">
              <FieldGrid rows={[["Carrier", "None Selected", "lg"], ["Forwarder", "None Selected", "lg"], ["CTO", "", "md"], ["Depot", "", "md"], ["Container Yard", "", "md"], ["Controlling Agent", "None Selected", "lg"], ["Controlling Customer", "None Selected", "lg"], ["External Broker", "None Selected", "lg"], ["Supervising Org", "", "md"], ["Declarant", "MERFWDGB / Meridian Forwarding Ltd / Head Office", "lg"], ["Rep. Type", "DIR / Direct Representation", "lg"], ["Representative", "None Selected", "lg"], ["Seller", "None Selected", "lg"], ["Manufacturer", "None Selected", "lg"], ["Consignor", "None Selected", "lg"]]} />
            </ReferenceSection>
          </section>

          <section id="billing" className="grid gap-3">
            <section className="grid gap-3 2xl:grid-cols-[360px_360px_minmax(420px,0.65fr)_minmax(420px,0.65fr)]">
              <ReferenceSection title="Billing / Prepaid Bill-To">
                <MiniAddressBlock label="Prepaid Bill-To Party" code="NORFABIE" name="NORTHSTAR FABRICATION LTD" address={"14 DOCKLANDS WAY\nNORTH QUAY"} />
                <FieldGrid rows={[["Client Contract", "", "sm"], ["Quote Number", "", "sm"]]} />
              </ReferenceSection>
              <ReferenceSection title="Billing / Collect Bill-To">
                <MiniAddressBlock label="Collect Bill-To Party" code="HARRETSYD" name="HARBOURVIEW RETAIL PTY LTD" address={"27 HARBOUR VIEW ROAD\nBAY DISTRICT BD 2048\nPACIFICA"} />
              </ReferenceSection>
              <ReferenceSection title="Billing / Job Header">
                <FieldGrid rows={[["Job Desc.", "", "lg"], ["Local Ref", "009001230", "sm"], ["Open Date", "06-Mar-26", "sm"], ["Close Date", "", "sm"], ["Margin %", "51.04", "sm"], ["Branch", "LBA", "xs"], ["Dept", "FIS", "xs"], ["Sales Rep", "LS1", "xs"], ["Operations Rep", "LH", "xs"], ["Job Status", "INV", "xs"], ["Hold Reason", "", "md"]]} />
              </ReferenceSection>
              <ReferenceSection title="Billing / Currency Rates">
                <ReferenceTable columns={["Currency", "Base Rate", "Today's Rate", "Org. Role", "Organisation"]} rows={[["USD", "1.300000", "0.000000", "CRD", "BLUWATGB"], ["EUR", "1.100000", "0.000000", "CRD", "BLUWATGB"], ["AUD", "1.900000", "0.000000", "CRD", "SOUCROFRE"], ["USD", "1.312300", "0.000000", "CRD", "BLUWATGN"], ["EUR", "1.140400", "0.000000", "CRD", "BLUWATGN"]]} minWidth={520} />
              </ReferenceSection>
            </section>
            <ReferenceSection title="Billing / Charge Lines">
              <ReferenceTable columns={["Charge Code", "Description", "Depart.", "Creditor", "Currency", "OS Cost Amt", "Estimated Cost", "Local Cost Amt", "Cost Tax ID", "Posted Cost", "Apt", "Debtor", "Sell Cur.", "OS Sell Amt", "Estimated Revenue", "Local Sell Amt", "Sell Tax ID"]} rows={costLineRows.map((row, index) => [row[0], row[1], row[2], row[3], row[4], row[5], row[5], row[6], "", index < 6 ? "Yes" : "No", "", row[7], row[8], row[9], row[9], row[9], row[10]])} minWidth={1700} />
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <FieldGrid rows={[["Total Cost", "12,897.79 GBP", "md"]]} />
                <FieldGrid rows={[["Revenue", "26,340.00 GBP", "md"]]} />
                <FieldGrid rows={[["Profit", "13,442.21 GBP", "md"]]} />
              </div>
            </ReferenceSection>
            <ReferenceSection title="Billing / Charge Detail">
              <FieldGrid rows={[["Charge Code", "SYSAUTO / Cargowise Automation Fee", "lg"], ["Dept", "FIS / Forwarding Import Sea", "lg"], ["Branch", "LBA / Meridian Forwarding Ltd", "lg"], ["Charge Type", "DSB", "sm"], ["Margin %", "100.00", "sm"], ["Chargeable", "36.280 M3", "sm"], ["Internal Job", "", "sm"], ["Internal Dept", "", "sm"], ["Internal Branch", "", "sm"], ["Profit Share", "No", "xs"], ["OS Amount", "3.04 GBP", "sm"], ["Local Amount", "3.04 GBP", "sm"], ["Declared Revenue", "0.00 GBP", "sm"]]} />
            </ReferenceSection>
          </section>

          <section id="doc-data" className="grid gap-3 2xl:grid-cols-[minmax(420px,0.55fr)_minmax(420px,0.55fr)]">
            <ReferenceSection title="Doc Data / Bill of Lading">
              <FieldGrid rows={[["Consignor", "NORTHSTAR FABRICATION LTD / NORTH QUAY / ARDMORE / FICTIONLAND", "wide"], ["Consignee", "HARBOURVIEW RETAIL PTY LTD / 27 HARBOUR VIEW ROAD / PACIFICA", "wide"], ["Notify Party", "HARBOURVIEW RETAIL PTY LTD / 27 HARBOUR VIEW ROAD / PACIFICA", "wide"], ["Delivery Agent", "SOUTHERN CROSS LOGISTICS / Harbour City HC 6100", "wide"], ["Phone", "+99 1 5550 1200", "md"], ["Fax", "+99 1 5550 1201", "md"], ["Origin Place", "ARDMORE, FICTIONLAND", "lg"], ["Destination Place", "BAYHAVEN, PACIFICA", "lg"], ["Port of Loading", "NORTHPORT, FICTIONLAND", "lg"], ["Port of Discharge", "WESTHAVEN, FREEDONIA", "lg"], ["Freight Payable", "ARDMORE, FICTIONLAND", "lg"], ["As Agent", "AS CARRIER / No more detail required", "lg"], ["Place of Issue", "NORTHPORT, FICTIONLAND", "lg"], ["Date of Issue", "19-Mar-26", "sm"]]} />
            </ReferenceSection>
            <ReferenceSection title="Doc Data / Miscellaneous">
              <FieldGrid rows={[["Shipper Load", "SLC / Shipper Load and Count", "lg"], ["Destination", "BAYHAVEN, PACIFICA", "lg"], ["Excess Value", "", "md"], ["Sending Forwarder", "", "lg"], ["Port Loading Short", "NORTHPORT, FICTIONLAND", "lg"], ["Port Loading 2", "", "lg"]]} />
            </ReferenceSection>
          </section>

          <section id="edocs" className="grid gap-3">
            <ReferenceSection title="eDocs / Document Storage">
              <ReferenceTable columns={["Date UTC", "Date Local", "Document Type", "Document Description", "File Name"]} rows={documentRows.map((row) => [row[0], row[0], row[1], row[2], row[3]])} minWidth={1300} />
            </ReferenceSection>
            <ReferenceSection title="eDocs / Document Tracking">
              <ReferenceTable columns={["Category", "Type", "Doc Description", "Period", "Date Received Local", "Date Received UTC", "Valid To Date", "Doc Num.", "Usage", "Original Req.", "Credit Control", "Doc Owner"]} rows={[["SCL", "CIV", "Commercial Invoice", "SHP", "06-Mar-26 16:59", "06-Mar-26 16:59", "", "", "BTH", "No", "No", ""], ["SCL", "PKL", "Packing List", "SHP", "06-Mar-26 16:59", "06-Mar-26 16:59", "", "", "BTH", "No", "No", ""], ["SCL", "LBC", "Line Booking Confirmation", "SHP", "09-Mar-26 16:42", "09-Mar-26 16:42", "", "", "BTH", "No", "No", ""], ["SCL", "SHI", "Shipping Instruction", "SHP", "11-Mar-26 11:31", "11-Mar-26 11:31", "", "", "BTH", "No", "No", ""], ["SCL", "HBL", "House Waybill/Bill of Lading", "SHP", "13-Mar-26 14:07", "13-Mar-26 14:07", "", "", "BTH", "No", "No", ""], ["SCL", "EMB", "Express MBL", "SHP", "20-Mar-26 13:03", "20-Mar-26 13:03", "", "", "BTH", "No", "No", ""]]} minWidth={1400} />
            </ReferenceSection>
          </section>

          <section id="workflow" className="grid gap-3">
            <ReferenceSection title="Workflow & Tracking / Tasks and Milestones">
              <ReferenceTable columns={["Job #", "Seq.", "Description", "Event Code", "Exception", "Reminder", "Staff", "Group", "Estimated Time", "Estimated UTC", "Estimated Local", "Actual Start Time", "Recalculate", "Published", "Condition", "Trigger Condition Value"]} rows={workflowRows.map((row) => [row[0], row[1], row[2], row[3], row[4], "", "", "", row[5], row[5], row[5], row[6], "Yes", "Yes", "", ""])} minWidth={1700} />
            </ReferenceSection>
            <ReferenceSection title="Workflow & Tracking / Selected Task">
              <FieldGrid rows={[["Description", "Departure from First Load Port", "lg"], ["Milestone", "DEP / Departure", "md"], ["Exception Type", "EXC / Exception-Scheduled Action Missing", "lg"], ["Staff", "", "sm"], ["Group", "None Selected", "lg"], ["Reminder", "No", "xs"], ["Estimated", "30-Mar-26 06:45", "md"], ["Actual", "19-Mar-26 12:07", "md"], ["On Field Change", "", "md"]]} />
              <ReferenceTable columns={["Action", "Recipient", "Email Address", "Purpose", "Additional Context", "Document", "Field Name", "Field Value", "Override Email", "Message Content", "Printer"]} rows={[["", "", "", "", "", "", "", "", "", "", ""]]} minWidth={1300} />
            </ReferenceSection>
          </section>
        </div>
      </main>
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
  const [activeTab, setActiveTab] = useState<BookingDetailTab>("Details")
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const record = getBookingDetailRecord(bookingId)

  return (
    <div className="h-screen overflow-hidden bg-[var(--md-bg)] text-[var(--md-ink)]">
      <div className="flex h-screen min-h-0">
        <DetailSideRail navigate={navigate} collapsed={railCollapsed} onCollapsedChange={setRailCollapsed} />
        <main className={cn("md-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", chatCollapsed ? "xl:pr-[96px]" : "xl:pr-[408px]")}>
          <BookingDetailHeader activeTab={activeTab} onTabChange={setActiveTab} record={record} navigate={navigate} />
          <div className="px-4 py-3 md:px-5">
            <BookingDetailTabPage activeTab={activeTab} booking={record.booking} />
          </div>
          <div className="px-[var(--md-page-pad)] pb-[var(--md-page-bottom-pad)] xl:hidden">
            <BookingAskPanel />
          </div>
        </main>
      </div>
      <FloatingBookingAskPanel collapsed={chatCollapsed} onCollapsedChange={setChatCollapsed} />
    </div>
  )
}

