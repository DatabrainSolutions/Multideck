import "@/quotes-transfer.css"
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import {
  AiBrain,
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Building2,
  CalendarClock,
  ChartBar,
  Check,
  CircleDollarSign,
  Container,
  Copy,
  Database,
  ChevronDown,
  FileText,
  LayoutDashboard,
  List,
  MessageCircle,
  PanelRightClose,
  Paperclip,
  Plus,
  Plane,
  Route,
  RotateCcw,
  Save,
  Search,
  SendHorizontal,
  Ship,
  SlidersHorizontal,
  Star,
  ShieldCheck,
  TriangleAlert,
  Trash2,
  Truck,
  WalletCards,
  X,
} from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MultideckDateRangePicker } from "@/components/multideck/date-picker"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { CustomsReadinessReview, type CustomsReadinessReviewIssue } from "@/components/multideck/customs-readiness-review"
import { CompactCombobox, type CompactComboboxOption } from "@/components/multideck/quote-details/quote-detail-fields"
import { filterLocationsForMode, type LocationOption } from "@/components/multideck/quote-details/quote-detail-model"
import { LifecycleNotes } from "@/components/multideck/lifecycle-notes"
import { cn } from "@/lib/utils"
import { useKanbanPointerDrag } from "@/lib/kanban-drag"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { calculateQuoteFreightDirection } from "@/lib/freight-direction"
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
} from "@/data/operational-data"
import { FilterChips, SegmentedControl, TabsRail } from "./workflow-components"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusPill, attributeToneFor, toneToVar } from "./status-pill"
import { Surface } from "./surface"
import { AnimatedList } from "./animated-list"
import { setLiveJobStarred, type LiveBooking } from "@/lib/application-data-api"
import { bookingCargoOtherHandling, bookingCargoHandlingSummary, bookingCargoSafetyConflict } from "@/lib/booking-cargo-handling"
import { analyseCargoAllocations, bookingCargoAllocationPayload } from "@/lib/booking-cargo-allocations"
import { CargoAllocationEditor } from "./cargo-allocation-editor"
import { getQuoteSources, type QuoteOrganisationOption, type QuoteWorkflowSources } from "@/lib/quote-workflow-api"
import { loadUnlocodeDirectory, unlocodeKind, type UnlocodeDirectoryRecord } from "@/lib/unlocode-directory"
import {
  applyBookingQuoteSync,
  getBookingCustomsReadiness,
  getBookingQuoteSyncReview,
  getBookingWorkflow,
  saveBookingWorkflow,
  sendBookingToCustoms,
  uploadBookingCustomsDocument,
  type BookingCustomsReadiness,
  type BookingQuoteSyncDifference,
  type BookingQuoteSyncReview,
  type BookingWorkflowCharge,
  type BookingWorkflowContainer,
  type BookingWorkflowEvent,
  type BookingWorkflowParty,
  type BookingWorkflowCargo,
  type BookingWorkflowRoute,
  type BookingWorkflowWorkspace,
} from "@/lib/booking-workflow-api"
import { CopyFeedbackTransition, CopyStatusIcon } from "./copyable-field"
import type { AuthUserSummary } from "@/lib/auth-user"
import { freightBookingMode, freightFieldPolicy, freightShipmentAllowed, freightTransportField, freightRouteOperationalFields } from "@/lib/freight-field-policy"
import { bookingEquipmentKindChoices, bookingEquipmentPresentation, newBookingEquipment, type BookingEquipmentKind } from "@/lib/booking-equipment-policy"
import { freightPackageTypeOptions } from "@/lib/freight-package-types"
import { changeBookingRouteMode, routeSharedReferenceFields } from "@/lib/booking-route-mode-change"

export type Booking = (typeof bookings)[number]
export type OperatorJob = (typeof operatorJobs)[number]
export const bookingViewModes = ["Table", "Board"] as const
export type BookingViewMode = (typeof bookingViewModes)[number]
export const bookingViewOptions = [
  { value: "Table", label: "Table", icon: List },
  { value: "Board", label: "Board", icon: LayoutDashboard },
] as const
const bookingDetailTabs = ["Overview", "Details", "Documents", "Customs", "Finance", "Notes", "Audit"] as const
type BookingDetailTab = (typeof bookingDetailTabs)[number]
type BookingCustomsView = "source" | "review"
type BookingContainerDraftField = keyof BookingWorkflowContainer | "packages" | "packageType" | "volumeCbm" | "sealNumber"
type BookingOrganisationRole = "customer" | "payer" | "shipper" | "consignee" | "supplier" | "carrier"
type BookingLocationField = "origin" | "destination" | "via"

const bookingDirectionOptions = ["Export", "Import", "Domestic", "Cross trade"] as const
const bookingHblModeOptions = ["CY/CFS", "CY/CY", "CFS/CFS", "Door/Door"] as const
const bookingIncotermOptions = ["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"] as const
const bookingOtherHandlingOptions = ["General merchandise", "Oversized", "Fragile", "Food grade"] as const
const bookingCustomsIncludedOptions = ["Yes", "No"] as const
const bookingProgressOptions = ["0%", "20%", "40%", "60%", "80%", "100%"] as const

const bookingEquipmentOptionsByMode: Record<string, readonly string[]> = {
  ocean: ["20GP", "40GP", "40HC", "45HC", "Reefer", "Open top", "Flat rack", "Other"],
  sea: ["20GP", "40GP", "40HC", "45HC", "Reefer", "Open top", "Flat rack", "Other"],
  air: ["ULD", "Air pallet", "Carton", "Loose", "Other"],
  road: ["Curtainsider", "Box trailer", "Refrigerated trailer", "Flatbed", "Pallet", "Other"],
  rail: ["20GP", "40GP", "40HC", "Rail wagon", "Other"],
  multimodal: ["20GP", "40GP", "40HC", "45HC", "ULD", "Air pallet", "Pallet", "Other"],
}

function bookingTabSlug(tab: BookingDetailTab) {
  return tab.toLowerCase().replaceAll(" ", "-")
}

function bookingTabId(tab: BookingDetailTab) {
  return `booking-workspace-tab-${bookingTabSlug(tab)}`
}

function bookingTabPanelId(tab: BookingDetailTab) {
  return `booking-workspace-panel-${bookingTabSlug(tab)}`
}
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
  return `/bookings/${encodeURIComponent(id.toLowerCase())}`
}

type BookingDetailRecord = {
  id: string
  booking: LiveBooking
  job?: OperatorJob
  workspace?: BookingWorkflowWorkspace
}

function bookingWorkspaceMode(value: string | null | undefined): LiveBooking["mode"] {
  return freightBookingMode(value)
}

function bookingModeKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "ocean") return "ocean"
  if (normalized === "fas" || normalized === "fsa") return "air"
  return normalized
}

function bookingModeOptionValue(name: string, code?: string) {
  const normalized = `${code ?? ""} ${name}`.trim().toLowerCase()
  if (/\b(?:sea|ocean)\b/.test(normalized)) return "OCEAN"
  if (/\bair\b/.test(normalized)) return "AIR"
  if (/\broad\b/.test(normalized)) return "ROAD"
  if (/\brail\b/.test(normalized)) return "RAIL"
  if (/\bmultimodal\b/.test(normalized)) return "MULTIMODAL"
  return String(code || name).trim().toUpperCase()
}

function bookingOrganisationHasRole(organisation: QuoteOrganisationOption, role: BookingOrganisationRole) {
  const types = organisation.types.map((type) => type.trim().toLocaleLowerCase())
  if (!types.length) return true
  if (role === "customer" || role === "payer") return types.includes("customer")
  if (role === "supplier") return types.includes("supplier")
  if (role === "carrier") return types.some((type) => /^(carrier|shipping line|haulier|freight forwarder)$/.test(type))
  if (role === "shipper") return types.some((type) => /\bshipper\b|\bconsignor\b/.test(type))
  return types.some((type) => /\bconsignee\b/.test(type))
}

function bookingWorkspaceDirection(value: string | null | undefined): LiveBooking["direction"] {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll("_", " ")
  if (normalized === "import") return "Import"
  if (normalized === "export") return "Export"
  if (normalized === "cross trade") return "Cross trade"
  if (normalized === "domestic") return "Domestic"
  return "Direction needed"
}

function calculatedDirectionForBooking(
  workspace: BookingWorkflowWorkspace,
  lookups: QuoteWorkflowSources | null | undefined,
) {
  const office = lookups?.offices.find((option) => option.id === workspace.booking.officeId)
  const firstRoute = workspace.routes[0]
  const lastRoute = workspace.routes.at(-1) ?? firstRoute
  return calculateQuoteFreightDirection({
    operatingCountryCode: office?.countryCode,
    originUnlocode: firstRoute?.originUnlocode || workspace.booking.originUnlocode || firstRoute?.origin || workspace.booking.origin,
    destinationUnlocode: lastRoute?.destinationUnlocode || workspace.booking.destinationUnlocode || lastRoute?.destination || workspace.booking.destination,
    countries: lookups?.countries,
  })
}

type BookingQuoteHandoff = {
  quote: Record<string, unknown>
  facts: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function recordText(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function bookingCountryFlag(countryCode: string) {
  const code = countryCode.trim().toLocaleUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ""
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
}

function bookingLocationFlag(value: string | null | undefined, unlocode?: string | null) {
  const code = String(unlocode || value || "").trim().toLocaleUpperCase().replace(/\s+/g, "")
  return bookingCountryFlag(/^[A-Z]{5}$/.test(code) ? code.slice(0, 2) : "")
}

function bookingQuoteHandoff(workspace: BookingWorkflowWorkspace): BookingQuoteHandoff {
  const sourceSnapshot = workspace.booking.sourceSnapshot ?? {}
  const acceptedSnapshot = asRecord(sourceSnapshot.acceptedSnapshot)
  const quote = asRecord(acceptedSnapshot.quote)
  return { quote, facts: asRecord(quote.shipmentFacts) }
}

function bookingQuoteReference(workspace?: BookingWorkflowWorkspace) {
  if (!workspace) return ""
  const { quote } = bookingQuoteHandoff(workspace)
  return recordText(quote, "reference")
    || recordText(asRecord(workspace.sourceQuote), "reference")
    || recordText(workspace.booking.sourceSnapshot ?? {}, "quoteReference")
}

function bookingParty(workspace: BookingWorkflowWorkspace, role: string) {
  return workspace.parties.find((party) => party.role.toLowerCase() === role)
}

function bookingWorkspaceRecord(workspace: BookingWorkflowWorkspace): BookingDetailRecord {
  const booking = workspace.booking
  const route = workspace.routes[0]
  const lastRoute = workspace.routes.at(-1) ?? route
  const quoteHandoff = bookingQuoteHandoff(workspace)
  const quote = quoteHandoff.quote
  const facts = quoteHandoff.facts
  const editableDetails = asRecord(booking.editableDetails)
  const customerParty = bookingParty(workspace, "customer")
  const quoteType = recordText(editableDetails, "quoteType") || recordText(quote, "quoteType") || recordText(facts, "quoteType")
  const customerPO = recordText(editableDetails, "customerPO") || recordText(facts, "customerPO")
  const incoterms = [booking.incoterm, booking.incotermLocation].filter(Boolean).join(" ")
  const containerCounts = workspace.containers.reduce<Map<string, number>>((counts, item) => {
    const type = item.type?.trim() || "container"
    counts.set(type, (counts.get(type) ?? 0) + 1)
    return counts
  }, new Map())
  const containerSummary = containerCounts.size
    ? [...containerCounts.entries()].map(([type, quantity]) => `${quantity} × ${type}`).join("; ")
    : ""
  const lifecycle = String(booking.status ?? "draft").toLowerCase()
  const trackingStatus = String(booking.trackingStatus ?? "").toLowerCase()
  const displayStatus: LiveBooking["status"] = trackingStatus.includes("exception") || lifecycle.includes("exception")
    ? "Exception"
    : trackingStatus.includes("delay") || lifecycle.includes("delay")
      ? "Delayed"
      : "On track"
  const statusTone: StatusTone = lifecycle === "draft" ? "neutral" : displayStatus === "Exception" ? "red" : displayStatus === "Delayed" ? "amber" : "green"
  const routeLabel = [booking.origin, booking.destination].filter(Boolean).join(" → ")
  const departureAt = route?.plannedDepartureAt ?? booking.readyDate ?? ""
  const arrivalAt = lastRoute?.plannedArrivalAt ?? booking.predictedDeliveryAt ?? booking.requiredDeliveryDate ?? ""
  return {
    id: booking.bookingReference,
    workspace,
    booking: {
      sourceId: booking.jobId,
      id: booking.bookingReference,
      customer: customerParty?.name ?? booking.customerName ?? "",
      route: routeLabel,
      carrier: recordText(editableDetails, "carrierName") || booking.carrierName || "",
      container: containerSummary,
      mode: bookingWorkspaceMode(booking.mode),
      value: booking.freightChargeAmount == null ? "" : `${booking.freightChargeCurrency ?? ""} ${booking.freightChargeAmount}`.trim(),
      eta: arrivalAt ? String(arrivalAt).slice(0, 10) : "",
      time: "",
      currentLocation: booking.currentLocation ?? "",
      status: displayStatus,
      progress: lifecycle === "draft" ? 5 : lifecycle.includes("complete") ? 100 : 20,
      owner: recordText(editableDetails, "ownerName"),
      tone: statusTone,
      invoice: recordText(editableDetails, "invoiceReference") || (workspace.documents.find((document) => /commercial.?invoice/i.test(document.typeCode ?? document.title))?.fileName ?? ""),
      jobRef: recordText(editableDetails, "jobReference") || booking.jobReference,
      customerRef: recordText(editableDetails, "customerReference") || recordText(quote, "customerReference") || recordText(facts, "customerReference"),
      supplierRef: recordText(editableDetails, "supplierReference") || recordText(facts, "supplierReference") || (route?.carrierBookingReference ?? ""),
      origin: booking.origin ?? "",
      destination: booking.destination ?? "",
      vessel: route?.vessel ?? route?.flightNumber ?? route?.transportMeansName ?? "",
      departureDate: departureAt ? String(departureAt).slice(0, 10) : "",
      arrivalDate: arrivalAt ? String(arrivalAt).slice(0, 10) : "",
      departureAt: String(departureAt ?? ""),
      arrivalAt: String(arrivalAt ?? ""),
      vin: recordText(asRecord(workspace.cargo[0]?.cargoData), "vin") || recordText(asRecord(asRecord(workspace.cargo[0]?.cargoData).cargoData), "vin"),
      direction: bookingWorkspaceDirection(booking.direction),
      shipmentType: recordText(editableDetails, "shipmentType") || recordText(quote, "shipmentType") || recordText(facts, "shipmentType") || "",
      isFavourite: Boolean(editableDetails.isFavourite),
      customFields: [
        ...(quoteType ? [{ label: "Quote type", value: quoteType }] : []),
        ...(recordText(quote, "reference") ? [{ label: "Quote ref", value: recordText(quote, "reference") }] : []),
        ...(customerPO ? [{ label: "Customer PO", value: customerPO }] : []),
        ...(incoterms ? [{ label: "Incoterms", value: incoterms }] : []),
        ...(booking.sourceQuoteId ? [{ label: "Source", value: "Accepted quote" }] : []),
      ],
      updatedAt: booking.updatedAt,
    },
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
  RAIL: "teal",
  MULTIMODAL: "teal",
  COURIER: "green",
  POSTAL: "neutral",
  INLAND_WATERWAY: "blue",
  WAREHOUSE: "teal",
  CUSTOMS_ONLY: "neutral",
  DOCS_ONLY: "neutral",
  OTHER: "neutral",
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
            <Icon className="size-4" strokeWidth={1.6} aria-hidden="true" />
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

function BookingRouteSummary({ record }: { record: BookingDetailRecord }) {
  const { language, t } = useLanguage()
  const routes = record.workspace?.routes ?? []
  const firstRoute = routes[0]
  const lastRoute = routes.at(-1)
  const formatDate = (value: string) => {
    if (!value) return "—"
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric" }).format(date)
  }
  const originFlag = bookingLocationFlag(record.booking.origin, firstRoute?.originUnlocode)
  const destinationFlag = bookingLocationFlag(record.booking.destination, lastRoute?.destinationUnlocode)
  const estimatedDeparture = firstRoute?.plannedDepartureAt || record.booking.departureDate
  const estimatedArrival = lastRoute?.plannedArrivalAt || record.booking.arrivalDate || record.booking.eta
  const legCount = Math.max(routes.length, 1)
  const modeKey = bookingModeKey(record.booking.mode)
  const ModeIcon = modeKey === "air" ? Plane : modeKey === "ocean" || modeKey === "sea" ? Ship : modeKey === "road" ? Truck : Route
  const normalizedDirection = record.booking.direction.trim().toLocaleLowerCase()
  const DirectionIcon = normalizedDirection === "import" ? ArrowDownToLine : normalizedDirection === "export" ? ArrowUpFromLine : Route

  return (
    <Surface
      padding="none"
      data-booking-route-summary
      className="overflow-hidden rounded-[var(--md-radius-xl)] p-1.5 shadow-[var(--md-shadow-line)]"
    >
      <div className="grid min-w-0 gap-1.5 md:grid-cols-[minmax(260px,2.2fr)_minmax(92px,0.62fr)_minmax(104px,0.68fr)_minmax(128px,0.82fr)_minmax(128px,0.82fr)] md:items-stretch">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 py-1.5 shadow-[var(--md-shadow-line)]">
          <div className="flex min-w-0 items-center gap-2">
            {originFlag ? <span className="shrink-0 text-[20px] leading-none" aria-hidden="true">{originFlag}</span> : null}
            <div className="min-w-0">
              <p className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t("Origin")}</p>
              <p className="truncate text-[12.5px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{record.booking.origin || "—"}</p>
            </div>
          </div>
          <ArrowRight className="size-3.5 shrink-0 text-[var(--md-subtle)] rtl:rotate-180" strokeWidth={1.35} aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-2">
            {destinationFlag ? <span className="shrink-0 text-[20px] leading-none" aria-hidden="true">{destinationFlag}</span> : null}
            <div className="min-w-0">
              <p className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t("Destination")}</p>
              <p className="truncate text-[12.5px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{record.booking.destination || "—"}</p>
            </div>
          </div>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 py-1.5 hover:bg-[var(--md-surface-soft)]">
          <ModeIcon className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t("Mode")}</p>
            <p className="truncate text-[11.5px] font-medium text-[var(--md-ink)]" data-i18n-skip>{record.booking.mode || "—"}</p>
            {legCount > 1 ? <p className="text-[9.5px] text-[var(--md-subtle)]">{legCount} {t("routing steps")}</p> : null}
          </div>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 py-1.5 hover:bg-[var(--md-surface-soft)]">
          <DirectionIcon className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t("Direction")}</p>
            <p className="mt-0.5 truncate text-[11.5px] font-medium text-[var(--md-ink)]">{t(record.booking.direction || "—")}</p>
          </div>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 py-1.5 hover:bg-[var(--md-surface-soft)]">
          <CalendarClock className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t("ETD")}</p>
            <p className="truncate text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip>{formatDate(estimatedDeparture)}</p>
          </div>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 py-1.5 hover:bg-[var(--md-surface-soft)]">
          <CalendarClock className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t("ETA")}</p>
            <p className="truncate text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip>{formatDate(estimatedArrival)}</p>
          </div>
        </div>
      </div>
    </Surface>
  )
}

function BookingDetailHeader({
  activeTab,
  customsReadiness,
  detailsDirty,
  uploadingDocumentType,
  onAttachDocument,
  sendingToCustoms,
  onDiscardDetails,
  onReviewCustoms,
  onSaveDetails,
  onSendToCustoms,
  onTabChange,
  record,
}: {
  activeTab: BookingDetailTab
  customsReadiness: BookingCustomsReadiness | null
  detailsDirty: boolean
  uploadingDocumentType: "commercial_invoice" | "packing_list" | null
  onAttachDocument: (documentType: "commercial_invoice" | "packing_list") => void
  sendingToCustoms: boolean
  onDiscardDetails: () => void
  onReviewCustoms: () => void
  onSaveDetails: () => void
  onSendToCustoms: () => void
  onTabChange: (tab: BookingDetailTab) => void
  record: BookingDetailRecord
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const bookingTabControlId = useId()
  const [bookingRefCopied, setBookingRefCopied] = useState(false)
  const bookingCopyResetTimerRef = useRef<number | null>(null)
  const tabs = bookingDetailTabs.map((label) => ({ id: label, label: t(label) }))
  const statusLabel = record.workspace?.booking.status ?? record.job?.status ?? record.booking.status
  const headerStatusTone = record.workspace?.booking.status === "draft" ? "neutral" : record.job?.tone ?? record.booking.tone
  const sourceQuote = asRecord(record.workspace?.sourceQuote)
  const appliedQuoteVersion = Number(recordText(sourceQuote, "appliedVersionNumber"))

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
              id={bookingTabId(tab.id as BookingDetailTab)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={bookingTabPanelId(tab.id as BookingDetailTab)}
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
            <StatusPill kind="status" tone={headerStatusTone} className="h-7 shrink-0 px-2.5 text-[11.5px] font-medium">{t(statusLabel)}</StatusPill>
            {record.workspace?.booking.sourceQuoteId ? (
              <StatusPill kind="attribute" tone="teal" className="h-7 shrink-0 gap-1 px-2.5 text-[11px]">
                <span>{t("From quote")}</span>
                <span data-i18n-skip dir="ltr" className="font-medium">{bookingQuoteReference(record.workspace) || "—"}</span>
                {Number.isFinite(appliedQuoteVersion) && appliedQuoteVersion > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    {appliedQuoteVersion === 1
                      ? <span>{t("Original")}</span>
                      : <span data-i18n-skip dir="ltr">V{appliedQuoteVersion}</span>}
                  </>
                ) : null}
              </StatusPill>
            ) : null}
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
            {customsReadiness ? (
              <Button
                variant="ghost"
                aria-label={`${t("Review customs readiness")}: ${customsReadiness.percent}% ${t("complete")}`}
                className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]"
                onClick={onReviewCustoms}
              >
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(var(--md-accent) ${customsReadiness.percent}%, var(--md-line) 0)` }}
                >
                  <span className="size-3.5 rounded-full bg-[var(--md-surface-tint)]" />
                </span>
                <span>{t("Review customs readiness")}</span>
                <span className="text-[var(--md-accent)]" dir="ltr">{customsReadiness.percent}%</span>
              </Button>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex" tabIndex={!customsReadiness?.ready ? 0 : -1}>
                  <Button
                    variant={activeTab === "Documents" ? "outline" : "default"}
                    className={cn(
                      "h-8 shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[11px] font-medium",
                      activeTab === "Documents" && "bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]",
                    )}
                    disabled={!customsReadiness?.ready || sendingToCustoms}
                    onClick={onSendToCustoms}
                  >
                    <SendHorizontal data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
                    {t(sendingToCustoms ? "Sending..." : "Send to customs")}
                  </Button>
                </span>
              </TooltipTrigger>
              {!customsReadiness?.ready ? (
                <TooltipContent side="bottom" className="max-w-[320px]">
                  {t(customsReadiness?.missing[0]?.label ?? "Complete the Customs readiness checklist first.")}
                </TooltipContent>
              ) : null}
            </Tooltip>
            {activeTab === "Documents" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t(uploadingDocumentType ? "Uploading document..." : "Attach document")}
                    className="h-8 shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[11px] font-medium"
                    disabled={Boolean(uploadingDocumentType)}
                  >
                    <Paperclip data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
                    {t(uploadingDocumentType ? "Uploading document..." : "Attach document")}
                    <ChevronDown className="size-3 opacity-70" strokeWidth={1.4} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[224px]">
                  <DropdownMenuItem onSelect={() => onAttachDocument("commercial_invoice")}>
                    <FileText className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                    {t("Attach commercial invoice")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAttachDocument("packing_list")}>
                    <FileText className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                    {t("Attach packing list (optional)")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
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
            ) : null}
          </div>
        </section>

        {activeTab === "Overview" ? (
          <BookingOverviewSignals record={record} tabs={bookingTabs} />
        ) : (
          <div className="grid min-w-0 gap-2">
            {bookingTabs}
            {activeTab === "Details" ? <BookingRouteSummary record={record} /> : null}
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

type BookingFieldOption = {
  id?: string
  value: string
  label: string
  description?: string
  keywords?: readonly string[]
  iconText?: string
}

function bookingFieldOptions(options: readonly (string | BookingFieldOption)[], currentValue: string): BookingFieldOption[] {
  const normalized = options.map((option) => typeof option === "string"
    ? { value: option, label: option }
    : option)
  if (currentValue && !normalized.some((option) => option.value === currentValue)) {
    const usesCountryFlags = normalized.some((option) => Boolean(option.iconText))
    return [{
      value: currentValue,
      label: currentValue,
      iconText: usesCountryFlags ? bookingLocationFlag(currentValue) : undefined,
    }, ...normalized]
  }
  return normalized
}

function BookingCargoWiseField({
  allowCustom = true,
  editable = false,
  emptyValue = "—",
  inputType = "text",
  label,
  maxLength,
  onChange,
  onOptionSelect,
  options,
  placeholder = "Type or select",
  searchable = false,
  span = false,
  wrapValue = false,
  value,
}: {
  allowCustom?: boolean
  editable?: boolean
  emptyValue?: string
  inputType?: "text" | "date"
  label: string
  maxLength?: number
  onChange?: (value: string) => void
  onOptionSelect?: (option: BookingFieldOption) => void
  options?: readonly (string | BookingFieldOption)[]
  placeholder?: string
  searchable?: boolean
  span?: boolean
  wrapValue?: boolean
  value: string
}) {
  const { t } = useLanguage()
  const fieldId = useId()
  const normalizedOptions = options ? bookingFieldOptions(options, value) : []

  return (
    <div className={cn(
      "grid min-w-0 grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)] items-center gap-1.5",
      span && "md:col-span-2 xl:col-span-1 2xl:col-span-2",
    )}>
      <label htmlFor={editable && !(options && searchable) ? fieldId : undefined} className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</label>
      {editable && onChange ? (
        options && searchable ? (
          <CompactCombobox
            label={label}
            value={value}
            options={normalizedOptions as CompactComboboxOption[]}
            onValueChange={onChange}
            onOptionSelect={(option) => onOptionSelect?.(option)}
            placeholder={placeholder}
            allowCustom={allowCustom}
            disabled={!editable}
            width="full"
            className="[&>div:first-child]:sr-only"
          />
        ) : options ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={fieldId} aria-label={t(label)} className="h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]">
              <SelectValue placeholder={t(placeholder)} />
            </SelectTrigger>
            <SelectContent>
              {normalizedOptions.map((option) => <SelectItem key={option.id ?? option.value} value={option.value}>{t(option.label)}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={fieldId}
            aria-label={t(label)}
            data-i18n-skip
            dir="auto"
            type={inputType}
            maxLength={maxLength}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]"
          />
        )
      ) : (
        <span data-i18n-skip dir="auto" title={value} className={cn("min-h-8 min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 py-1.5 text-[11px] font-medium leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]", wrapValue ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]" : "truncate")}>
          {value || t(emptyValue)}
        </span>
      )}
    </div>
  )
}

function BookingCargoWiseAmountField({
  amount,
  currencies,
  currency,
  editable,
  label,
  onAmountChange,
  onCurrencyChange,
}: {
  amount: string
  currencies: readonly BookingFieldOption[]
  currency: string
  editable: boolean
  label: string
  onAmountChange: (value: string) => void
  onCurrencyChange: (value: string) => void
}) {
  const { t } = useLanguage()
  const amountId = useId()
  const normalizedCurrencies = bookingFieldOptions(currencies, currency)

  return (
    <div className="grid min-w-0 grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)] items-center gap-1.5">
      <label htmlFor={editable ? amountId : undefined} className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</label>
      {editable ? (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px] gap-1">
          <Input
            id={amountId}
            aria-label={t(`${label} amount`)}
            inputMode="decimal"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="h-8 min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]"
          />
          <Select value={currency} onValueChange={onCurrencyChange}>
            <SelectTrigger aria-label={t(`${label} currency`)} className="h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]">
              <SelectValue placeholder={t("Currency")} />
            </SelectTrigger>
            <SelectContent>
              {normalizedCurrencies.map((option) => <SelectItem key={option.id ?? option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <span data-i18n-skip dir="ltr" className="min-h-8 min-w-0 truncate rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 py-1.5 text-[11px] font-medium leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
          {[currency, amount].filter(Boolean).join(" ") || "—"}
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
  action,
}: {
  title: string
  children: ReactNode
  compact?: boolean
  className?: string
  contentClassName?: string
  action?: ReactNode
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("h-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "p-2" : "p-2.5", className)}>
      <div className={cn("flex min-w-0 items-center justify-between gap-3", compact ? "mb-1.5" : "mb-2")}>
        <h3 className="min-w-0 text-[12px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h3>
        {action}
      </div>
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

function bookingContainerDataValue(container: BookingWorkflowContainer, key: "packages" | "packageType" | "volumeCbm" | "sealNumber") {
  const value = container[key] ?? container.data?.[key] ?? asRecord(container.data?.data)[key]
  return value == null ? "" : String(value)
}

function BookingContainerDetails({
  containers,
  mode,
  equipmentKinds,
  editable,
  seaService,
  onAdd,
  onChange,
  onRemove,
}: {
  containers: BookingWorkflowContainer[]
  mode: string
  equipmentKinds?: BookingEquipmentKind[]
  editable: boolean
  seaService: boolean
  onAdd: (kind: BookingEquipmentKind) => void
  onChange: (index: number, field: BookingContainerDraftField, value: string) => void
  onRemove: (index: number) => void
}) {
  const { t } = useLanguage()
  const kinds = equipmentKinds ?? bookingEquipmentKindChoices({ mode, stage: "booking", hasContainers: containers.some((item) => bookingEquipmentPresentation(item.equipmentKind).key === "container") })
  const columnLabels = ["Equipment no.", "Type", "Packages", "Package type", "Gross weight (kg)", "Volume (CBM)", "Seal no.", "Actions"] as const
  const fieldIdPrefix = useId()
  const pendingFocus = useRef<number | null>(null)
  const openingKindDialog = useRef(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const removeFocus = useRef<HTMLElement | null>(null)
  const [removing, setRemoving] = useState<{ index: number; item: BookingWorkflowContainer } | null>(null)
  const [reclassifying, setReclassifying] = useState<{ index: number; item: BookingWorkflowContainer; kind: BookingEquipmentKind } | null>(null)
  useEffect(() => {
    if (pendingFocus.current !== null) {
      document.getElementById(`${fieldIdPrefix}-${pendingFocus.current}-number`)?.focus()
      if (kinds.length === 1) pendingFocus.current = null
    }
  }, [containers.length, fieldIdPrefix, kinds.length])
  function add(kind: BookingEquipmentKind) {
    if (!editable || !kinds.includes(kind)) return
    pendingFocus.current = containers.length
    onAdd(kind)
  }

  return (
    <BookingCargoWiseGroup
      title="Equipment details"
      action={(
        kinds.length > 1 ? <DropdownMenu><DropdownMenuTrigger asChild>
          <Button ref={addRef} type="button" variant="ghost" disabled={!editable} className="min-h-8 gap-1 px-2 text-xs text-[var(--md-accent)]"><Plus className="size-3.5" aria-hidden="true" />{t("Add equipment")}</Button>
        </DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => {
          if (pendingFocus.current === null) return
          event.preventDefault()
          document.getElementById(`${fieldIdPrefix}-${pendingFocus.current}-number`)?.focus()
          pendingFocus.current = null
        }}>
          {kinds.map((kind) => <DropdownMenuItem key={kind} onSelect={() => add(kind)}>{t(bookingEquipmentPresentation(kind).label)}</DropdownMenuItem>)}
        </DropdownMenuContent></DropdownMenu> :
        <Button
          ref={addRef}
          type="button"
          variant="ghost"
          className="h-7 rounded-[var(--md-radius-md)] px-2 text-[11px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]"
          onClick={() => { if (kinds[0]) add(kinds[0]) }}
          disabled={!editable || !kinds.length}
        >
          <Plus className="size-3.5" strokeWidth={1.45} aria-hidden="true" />
          {kinds.length ? `${t("Add")} ${t(bookingEquipmentPresentation(kinds[0]).label)}` : t("Add equipment")}
        </Button>
      )}
      contentClassName="gap-1.5"
    >
      {!kinds.length ? <p className="text-xs leading-5 text-[var(--md-text)]">{t("Add a physical routing leg or choose a container service to record transport equipment. Existing records remain available below.")}</p> : null}
      {containers.length ? (
        <div className="@container min-w-0">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(140px,1.05fr)_minmax(112px,0.82fr)_minmax(76px,0.5fr)_minmax(106px,0.72fr)_minmax(112px,0.74fr)_minmax(100px,0.64fr)_minmax(112px,0.76fr)_40px] items-center gap-2 bg-[var(--md-surface-soft)] px-2 py-1.5 @[64rem]:grid">
            {columnLabels.map((label) => (
              <span key={label} className="text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</span>
            ))}
          </div>
          <div className="grid gap-1.5 pt-1.5">
            {containers.map((container, index) => {
              const equipment = bookingEquipmentPresentation(container.equipmentKind)
              const seaContainer = seaService && equipment.key === "container"
              const retainedVgm = container.verifiedGrossMassKg != null || Boolean(container.vgmMethod)
              const typeOptions = [...new Set([
                container.type ?? "",
                ...equipment.types,
              ].filter(Boolean))]
              const fieldClassName = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium shadow-[var(--md-shadow-line)]"
              const fields = [
                [equipment.numberLabel, "number", container.number ?? "", false],
                [`${equipment.label} type`, "type", container.type ?? "", false],
                ["Packages", "packages", bookingContainerDataValue(container, "packages"), true],
                ["Package type", "packageType", bookingContainerDataValue(container, "packageType"), false],
                ["Gross weight (kg)", "grossWeightKg", container.grossWeightKg ?? "", true],
                ["Volume (CBM)", "volumeCbm", bookingContainerDataValue(container, "volumeCbm"), true],
                ["Seal number", "sealNumber", bookingContainerDataValue(container, "sealNumber"), false],
              ] as const
              return (
                <fieldset
                  key={container.id ?? `container-${index}`}
                  className="grid min-w-0 grid-cols-1 items-end gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-2 @[28rem]:grid-cols-2 @[44rem]:grid-cols-4 @[64rem]:grid-cols-[minmax(140px,1.05fr)_minmax(112px,0.82fr)_minmax(76px,0.5fr)_minmax(106px,0.72fr)_minmax(112px,0.74fr)_minmax(100px,0.64fr)_minmax(112px,0.76fr)_40px]"
                >
                  <legend className="px-1 text-xs font-medium text-[var(--md-ink)]">
                    <DropdownMenu><DropdownMenuTrigger asChild><Button id={`${fieldIdPrefix}-${index}-kind`} type="button" variant="ghost" disabled={!editable || !kinds.length} aria-label={`${t("Change equipment kind")} ${index + 1}: ${t(equipment.label)}`} className="min-h-8 gap-1 px-1 text-xs">{t(equipment.label)} {index + 1}<ChevronDown className="size-3" aria-hidden="true" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="start" onCloseAutoFocus={(event) => { if (openingKindDialog.current) { event.preventDefault(); openingKindDialog.current = false } }}>
                        {kinds.map((kind) => <DropdownMenuItem key={kind} disabled={kind === equipment.key} onSelect={() => { if (editable) { openingKindDialog.current = true; removeFocus.current = document.getElementById(`${fieldIdPrefix}-${index}-kind`); setReclassifying({ index, item: container, kind }) } }}>{t(bookingEquipmentPresentation(kind).label)}</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </legend>
                  {!kinds.includes(equipment.key as BookingEquipmentKind) ? <p className="col-span-full text-xs leading-5 text-[var(--md-text)]">{t("Retained equipment: this kind does not match the current routing/service. Review it before saving; no values have been changed automatically.")}</p> : null}
                  {fields.map(([label, field, fieldValue, decimal]) => (
                    <div key={field} className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--md-text)]">
                      {field !== "type" ? <label htmlFor={`${fieldIdPrefix}-${index}-${field}`} className="@[64rem]:sr-only">{t(label)}</label> : null}
                      {field === "type" ? (
                        <CompactCombobox label={label} disabled={!editable} value={container.type ?? ""} options={typeOptions.map((option) => ({ value: option, label: option }))} allowCustom width="full" className="@[64rem]:[&>div:first-child]:sr-only" placeholder="Choose or type code" onValueChange={(value) => { if (editable) onChange(index, "type", value) }} />
                      ) : <Input id={`${fieldIdPrefix}-${index}-${field}`} disabled={!editable} aria-label={t(label)} inputMode={decimal ? "decimal" : undefined} maxLength={field === "number" ? 50 : undefined} value={fieldValue} onChange={(event) => { if (editable) onChange(index, field, event.target.value) }} className={fieldClassName} />}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("Remove")} ${t(equipment.label)} ${index + 1}`}
                    className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[color-mix(in_srgb,var(--md-red)_8%,transparent)] hover:text-[var(--md-red)]"
                    onClick={(event) => { if (editable) { removeFocus.current = event.currentTarget; setRemoving({ index, item: container }) } }}
                    disabled={!editable}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.35} aria-hidden="true" />
                  </Button>
                  <details className="col-span-full min-w-0">
                    <summary className="min-h-8 cursor-pointer py-1.5 text-[11px] font-medium text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-offset-2">{t("Weight verification & temperature")}</summary>
                    <div className="grid min-w-0 gap-2 py-2 @[36rem]:grid-cols-2 @[60rem]:grid-cols-3">
                      <BookingCargoWiseField label="Tare weight (kg)" value={String(container.tareWeightKg ?? "")} editable={editable} onChange={(value) => onChange(index, "tareWeightKg", value)} />
                      {seaContainer || retainedVgm ? <>
                        <BookingCargoWiseField label="Verified gross mass (kg)" value={String(container.verifiedGrossMassKg ?? "")} editable={editable && equipment.key === "container"} onChange={(value) => onChange(index, "verifiedGrossMassKg", value)} />
                        <BookingCargoWiseField label="VGM method" value={container.vgmMethod === "1" ? "1 - Weighed packed container" : container.vgmMethod === "2" ? "2 - Certified calculation" : container.vgmMethod || "Not recorded"} options={["Not recorded", "1 - Weighed packed container", "2 - Certified calculation"]} allowCustom={false} editable={editable && equipment.key === "container"} wrapValue onChange={(value) => onChange(index, "vgmMethod", value === "Not recorded" ? "" : value.split(" - ")[0])} />
                      </> : null}
                      <BookingCargoWiseField label="Reefer set point" value={String(container.reeferSetPoint ?? "")} editable={editable} onChange={(value) => onChange(index, "reeferSetPoint", value)} />
                      <BookingCargoWiseField label="Temperature unit" value={container.reeferUnit || "Not recorded"} options={["Not recorded", "C", "F"]} allowCustom={false} editable={editable} onChange={(value) => onChange(index, "reeferUnit", value === "Not recorded" ? "" : value)} />
                    </div>
                    {seaContainer ? <p className="pb-2 text-[11px] leading-5 text-[var(--md-text)]">{t("Record VGM from the verified weighing evidence. Cargo weight is not automatically treated as VGM. Recording these values does not submit a VGM declaration.")}</p> : null}
                    {retainedVgm && equipment.key !== "container" ? <p className="text-xs leading-5 text-[var(--md-text)]">{t("Historical VGM values are retained for review, not treated as a declaration for this equipment kind.")}</p> : null}
                  </details>
                </fieldset>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-16 items-center justify-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-center shadow-[var(--md-shadow-line)]">
          <Container className="size-4 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden="true" />
          <p className="text-xs text-[var(--md-text)]">{t("No equipment details have been added yet.")}</p>
        </div>
      )}
      <Dialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
        <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus() }} onCloseAutoFocus={(event) => { event.preventDefault(); (removeFocus.current?.isConnected ? removeFocus.current : addRef.current)?.focus() }}>
          <DialogHeader><DialogTitle>{t("Remove equipment from this Booking?")}</DialogTitle><DialogDescription>{t("This takes effect when you save the Booking. Saved equipment history is retained. Remove or reassign any cargo allocations before saving.")}</DialogDescription></DialogHeader>
          <p className="break-words text-sm">{removing ? `${bookingEquipmentPresentation(removing.item.equipmentKind).label} ${removing.index + 1} · ${removing.item.number || t("Number not recorded")}` : ""}</p>
          <DialogFooter><Button ref={cancelRef} variant="ghost" onClick={() => setRemoving(null)}>{t("Keep equipment")}</Button><Button disabled={!editable || !removing || containers[removing.index] !== removing.item} onClick={() => { if (editable && removing && containers[removing.index] === removing.item) { onRemove(removing.index); setRemoving(null) } }}>{t("Remove equipment")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={reclassifying !== null} onOpenChange={(open) => { if (!open) setReclassifying(null) }}>
        <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus() }} onCloseAutoFocus={(event) => { event.preventDefault(); (removeFocus.current?.isConnected ? removeFocus.current : addRef.current)?.focus() }}>
          <DialogHeader><DialogTitle>{t("Change equipment kind?")}</DialogTitle><DialogDescription>{t("Review the equipment type, identifying number and cargo allocations for the new kind. Existing values will not be recalculated or cleared. The change and previous identity are recorded when you save; the Quote is unchanged.")}</DialogDescription></DialogHeader>
          <p className="break-words text-sm">{reclassifying ? `${bookingEquipmentPresentation(reclassifying.item.equipmentKind).label} → ${bookingEquipmentPresentation(reclassifying.kind).label}` : ""}</p>
          <DialogFooter><Button ref={cancelRef} variant="ghost" onClick={() => setReclassifying(null)}>{t("Keep current kind")}</Button><Button disabled={!editable || !reclassifying || containers[reclassifying.index] !== reclassifying.item || !kinds.includes(reclassifying.kind)} onClick={() => { if (editable && reclassifying && containers[reclassifying.index] === reclassifying.item && kinds.includes(reclassifying.kind)) { onChange(reclassifying.index, "equipmentKind", reclassifying.kind); setReclassifying(null) } }}>{t("Change kind and review")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </BookingCargoWiseGroup>
  )
}

function BookingRecordDetails({
  allocationEditor,
  allocationValidationAttempt = 0,
  currentUser,
  editable,
  locationDirectory,
  lookups,
  onCargoChange,
  onCargoAdd,
  onCargoRemove,
  onBookingChange,
  onContainerAdd,
  onContainerChange,
  onContainerRemove,
  onDetailChange,
  onPartyChange,
  onOrganisationSelect,
  onLocationSelect,
  onRouteAdd,
  onRouteChange,
  onRouteLocationSelect,
  onRouteOrganisationSelect,
  onRouteRemove,
  record,
  workspace,
}: {
  allocationEditor?: ReactNode
  allocationValidationAttempt?: number
  currentUser?: AuthUserSummary | null
  editable: boolean
  locationDirectory: readonly UnlocodeDirectoryRecord[]
  lookups: QuoteWorkflowSources | null
  onCargoChange: (index: number, field: keyof BookingWorkflowCargo, value: string) => void
  onCargoAdd: () => void
  onCargoRemove: (index: number) => void
  onBookingChange: (field: keyof LiveBooking, value: string | boolean) => void
  onContainerAdd: (kind: BookingEquipmentKind) => void
  onContainerChange: (index: number, field: BookingContainerDraftField, value: string) => void
  onContainerRemove: (index: number) => void
  onDetailChange: (field: string, value: string | boolean) => void
  onPartyChange: (role: string, field: keyof BookingWorkflowParty, value: string) => void
  onOrganisationSelect: (role: BookingOrganisationRole, organisation: QuoteOrganisationOption) => void
  onLocationSelect: (field: BookingLocationField, location: LocationOption) => void
  onRouteAdd: () => void
  onRouteChange: (index: number, field: keyof BookingWorkflowRoute, value: string) => void
  onRouteLocationSelect: (index: number, field: "origin" | "destination", location: LocationOption) => void
  onRouteOrganisationSelect: (index: number, organisation: QuoteOrganisationOption) => void
  onRouteRemove: (index: number) => void
  record: BookingDetailRecord
  workspace: BookingWorkflowWorkspace
}) {
  const { language, t } = useLanguage()
  const [detailSection, setDetailSection] = useState(allocationValidationAttempt ? "cargo" : "control")
  useEffect(() => { if (allocationValidationAttempt) setDetailSection("cargo") }, [allocationValidationAttempt])
  const [selectedCargoIndex, setSelectedCargoIndex] = useState(0)
  const [removingCargoIndex, setRemovingCargoIndex] = useState<number | null>(null)
  const [pendingRouteMode, setPendingRouteMode] = useState<{ index: number; mode: string; route: BookingWorkflowRoute } | null>(null)
  const [pendingOverallMode, setPendingOverallMode] = useState<{ bookingId: string; from: string; to: string; shipmentType: string; routing: string } | null>(null)
  const overallModeTriggerRef = useRef<HTMLDivElement>(null)
  const overallModeCancelRef = useRef<HTMLButtonElement>(null)
  const routeModeCancelRef = useRef<HTMLButtonElement>(null)
  const routeModeFocusRef = useRef<HTMLElement | null>(null)
  const routeModeTriggersRef = useRef(new Map<number, HTMLDivElement>())
  const cargoIndex = Math.min(selectedCargoIndex, Math.max(0, workspace.cargo.length - 1))
  const updatedDate = new Date(record.booking.updatedAt)
  const updatedAt = !record.booking.updatedAt
    ? t("Not available")
    : Number.isNaN(updatedDate.getTime())
      ? record.booking.updatedAt
      : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(updatedDate)

  const unavailable = t("Not available in the booking register")
  const quoteHandoff = bookingQuoteHandoff(workspace)
  const quote = quoteHandoff.quote
  const facts = quoteHandoff.facts
  const quotePayer = asRecord(quote.payer)
  const customer = workspace.booking
  const customerParty = bookingParty(workspace, "customer")
  const payer = bookingParty(workspace, "payer")
  const shipper = bookingParty(workspace, "shipper")
  const consignee = bookingParty(workspace, "consignee")
  const cargo = workspace.cargo[cargoIndex]
  const editableDetails = asRecord(workspace.booking.editableDetails)
  const detailValue = (key: string, fallback = "") => Object.prototype.hasOwnProperty.call(editableDetails, key) ? recordText(editableDetails, key) : fallback
  const quoteType = recordText(editableDetails, "quoteType") || recordText(quote, "quoteType") || recordText(facts, "quoteType") || record.booking.direction
  const quoteReference = recordText(quote, "reference") || recordText(asRecord(workspace?.sourceQuote), "reference")
  const value = (source: Record<string, unknown>, key: string, fallback = "") => recordText(source, key) || fallback
  const partyValue = (party: BookingWorkflowParty | undefined, key: keyof BookingWorkflowParty, fallback = "") => party?.[key] == null ? fallback : String(party[key])
  const cargoValue = (key: keyof NonNullable<typeof cargo>, fallback = "") => {
    if (!cargo) return ""
    // A deliberate clear must not reappear from the accepted Quote snapshot.
    if (Object.prototype.hasOwnProperty.call(cargo, key)) return cargo[key] == null ? "" : String(cargo[key])
    return cargoIndex === 0 ? fallback : ""
  }
  const cargoData = asRecord(cargo?.cargoData)
  const nestedCargoData = asRecord(cargoData.cargoData)
  const cargoDataValue = (key: string, fallback = "") => recordText(cargoData, key) || recordText(nestedCargoData, key) || fallback
  const persistableFields = new Set<keyof LiveBooking>([
    "jobRef",
    "status",
    "mode",
    "direction",
    "currentLocation",
    "origin",
    "destination",
    "shipmentType",
    "container",
    "departureDate",
    "arrivalDate",
    "vessel",
    "vin",
    "value",
  ])
  const editField = (field: keyof LiveBooking) => ({
    editable: editable && persistableFields.has(field),
    onChange: (value: string) => onBookingChange(field, value),
  })
  const editDetail = (field: string) => ({ editable, onChange: (value: string) => onDetailChange(field, value) })
  const editParty = (role: string, field: keyof BookingWorkflowParty) => ({ editable, onChange: (value: string) => onPartyChange(role, field, value) })
  const editCargo = (index: number, field: keyof BookingWorkflowCargo) => ({ editable: editable && Boolean(cargo), onChange: (value: string) => onCargoChange(index, field, value) })
  const editRoute = (index: number, field: keyof BookingWorkflowRoute) => ({ editable, onChange: (value: string) => onRouteChange(index, field, value) })
  const organisations = lookups?.organisations ?? []
  const lookupModes = lookups?.modes.length ? lookups.modes : [
    { id: "mode-air", code: "AIR", name: "Air" },
    { id: "mode-sea", code: "SEA", name: "Sea" },
    { id: "mode-road", code: "ROAD", name: "Road" },
    { id: "mode-rail", code: "RAIL", name: "Rail" },
  ]
  const modeOptions: BookingFieldOption[] = lookupModes.map((option) => ({
    id: `mode:${option.code || option.name}`,
    value: bookingModeOptionValue(option.name, option.code),
    label: option.name,
    description: option.code,
  }))
  const modeKey = bookingModeKey(record.booking.mode)
  const fieldPolicy = freightFieldPolicy({ mode: record.booking.mode, shipmentType: detailValue("shipmentType", record.booking.shipmentType), direction: record.booking.direction, stage: "booking", legModes: workspace.routes.map((leg) => leg.mode), hasContainers: workspace.containers.length > 0, vehicleCargo: Boolean(record.booking.vin) })
  const equipmentKinds = bookingEquipmentKindChoices({ mode: record.booking.mode, shipmentType: detailValue("shipmentType", record.booking.shipmentType), stage: "booking", legModes: workspace.routes.map((leg) => leg.mode), hasContainers: workspace.containers.some((item) => bookingEquipmentPresentation(item.equipmentKind).key === "container") })
  const shipmentTypeOptions: BookingFieldOption[] = (lookups?.shipmentTypes ?? [])
    .filter((option) => freightShipmentAllowed(modeKey, option.code))
    .map((option) => ({ id: `shipment:${option.code}`, value: option.code, label: `${option.code} - ${option.name}` }))
  const ownerOptions: BookingFieldOption[] = (lookups?.users ?? []).map((option) => ({
    id: option.id,
    value: option.name,
    label: option.name,
    description: option.email,
    keywords: [option.email],
  }))
  const quoteOwnerId = recordText(quote, "salesOwnerId")
  const quoteOwner = lookups?.users.find((option) => option.id === quoteOwnerId)
  const ownerName = recordText(editableDetails, "ownerName") || quoteOwner?.name || recordText(quote, "salesOwner") || recordText(facts, "salesRep") || currentUser?.name || currentUser?.email || ""
  const currencyOptions = (lookups?.currencies.length ? lookups.currencies : [
    { id: "currency-gbp", code: "GBP", name: "Pound sterling" },
    { id: "currency-eur", code: "EUR", name: "Euro" },
    { id: "currency-usd", code: "USD", name: "US dollar" },
  ]).map((option) => ({ id: option.id, value: option.code, label: option.code, description: option.name }))
  const commodityOptions: BookingFieldOption[] = (lookups?.commodities ?? []).map((option) => ({ id: option.id, value: option.name, label: option.name, description: option.code, keywords: [option.code] }))
  const countryNames = new Map((lookups?.countries ?? []).map((country) => [country.code.toLocaleUpperCase(), country.name]))
  const allLocationOptions = locationDirectory.map(([countryCode, locationCode, place, nameWithoutDiacritics, functions]) => ({
    id: `unlocode:${countryCode}${locationCode}`,
    countryCode,
    countryName: countryNames.get(countryCode) || countryCode,
    place,
    unlocode: `${countryCode}${locationCode}`,
    kind: unlocodeKind(functions),
    aliases: nameWithoutDiacritics ? [nameWithoutDiacritics] : [],
  } satisfies LocationOption))
  const locationOptions = filterLocationsForMode(allLocationOptions, modeKey === "ocean" ? "Sea" : record.booking.mode)
  const toLocationFieldOptions = (options: readonly LocationOption[]): BookingFieldOption[] => options.map((location) => ({
    id: location.id,
    value: location.unlocode || location.place,
    label: [location.unlocode, location.place, location.countryName].filter(Boolean).join(" · "),
    description: location.kind?.replaceAll("-", " "),
    keywords: [location.countryCode, location.countryName, location.place, location.unlocode, ...(location.aliases ?? [])],
    iconText: bookingCountryFlag(location.countryCode),
  }))
  const locationFieldOptions = toLocationFieldOptions(locationOptions)
  const routeLocationOptions = (routeMode: string | null | undefined) => filterLocationsForMode(
    allLocationOptions,
    bookingModeKey(routeMode) === "ocean" ? "Sea" : routeMode || record.booking.mode,
  )
  const organisationOptions = (role: BookingOrganisationRole): BookingFieldOption[] => organisations
    .filter((organisation) => bookingOrganisationHasRole(organisation, role))
    .map((organisation) => ({
      id: organisation.id,
      value: organisation.name,
      label: organisation.name,
      description: [organisation.code, ...organisation.types].filter(Boolean).join(" · "),
      keywords: [organisation.code, ...organisation.types],
    }))
  const selectedOrganisation = (role: "customer" | "payer" | "shipper" | "consignee", party?: BookingWorkflowParty) => organisations.find((organisation) => (
    organisation.id === party?.organisationId
    || organisation.name === party?.name
    || (role === "customer" && organisation.id === workspace.booking.customerId)
  ))
  const partyContactOptions = (organisation?: QuoteOrganisationOption): BookingFieldOption[] => (organisation?.contacts ?? []).map((contact) => ({
    id: contact.id,
    value: contact.name,
    label: contact.name,
    description: contact.email ?? "",
    keywords: [contact.email ?? "", ...contact.emails],
  }))
  const customerOrganisation = selectedOrganisation("customer", customerParty)
  const payerOrganisation = selectedOrganisation("payer", payer)
  const shipperOrganisation = selectedOrganisation("shipper", shipper)
  const consigneeOrganisation = selectedOrganisation("consignee", consignee)
  const selectedIncoterm = detailValue("incoterms", [workspace.booking.incoterm, workspace.booking.incotermLocation].filter(Boolean).join(" "))
  const incotermCode = selectedIncoterm.split(/\s+/, 1)[0].toUpperCase()
  const incotermLocation = selectedIncoterm.slice(incotermCode.length).trim()
  const bookingValueMatch = record.booking.value.match(/\b([A-Z]{3})\b\s*(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)\s*\b([A-Z]{3})\b/i)
  const valueAmount = bookingValueMatch?.[2] ?? bookingValueMatch?.[3] ?? (workspace.booking.freightChargeAmount == null ? "" : String(workspace.booking.freightChargeAmount))
  const valueCurrency = (bookingValueMatch?.[1] ?? bookingValueMatch?.[4] ?? workspace.booking.freightChargeCurrency ?? currencyOptions[0]?.value ?? "").toUpperCase()
  const firstWorkspaceRoute = workspace.routes[0]
  const lastWorkspaceRoute = workspace.routes.at(-1) ?? firstWorkspaceRoute
  const estimatedDeparture = String(firstWorkspaceRoute?.plannedDepartureAt ?? record.booking.departureDate ?? "").slice(0, 10)
  const estimatedArrival = String(lastWorkspaceRoute?.plannedArrivalAt ?? record.booking.arrivalDate ?? "").slice(0, 10)
  const knownCargo = cargoValue("knownCargo", cargoDataValue("knownCargo", value(facts, "knownCargo")))
  const goodsDescription = cargoValue("description", value(facts, "goodsDescription", value(facts, "commodity")))
  const calculatedDirection = calculatedDirectionForBooking(workspace, lookups)

  function requestOverallMode(mode: string) {
    if (!editable || bookingWorkspaceMode(mode) === bookingWorkspaceMode(record.booking.mode)) return
    setPendingOverallMode({ bookingId: record.booking.id, from: record.booking.mode, to: mode,
      shipmentType: detailValue("shipmentType", record.booking.shipmentType), routing: JSON.stringify(workspace.routes) })
  }

  function confirmOverallMode() {
    if (!editable || !pendingOverallMode) return
    const shipmentType = detailValue("shipmentType", record.booking.shipmentType)
    if (record.booking.id !== pendingOverallMode.bookingId || record.booking.mode !== pendingOverallMode.from
      || shipmentType !== pendingOverallMode.shipmentType || JSON.stringify(workspace.routes) !== pendingOverallMode.routing) {
      toast.error(t("Booking changed"), { description: t("Review the current mode and routing steps, then choose the mode again.") })
    } else {
      onBookingChange("mode", pendingOverallMode.to)
      if (shipmentType && !freightShipmentAllowed(pendingOverallMode.to, shipmentType)) onDetailChange("shipmentType", "")
    }
    setPendingOverallMode(null)
  }

  return (
    <Tabs value={detailSection} onValueChange={setDetailSection} className="min-w-0 gap-[var(--md-page-stack-gap-compact)]">
      <div role="status" className={fieldPolicy.routingModeMismatch ? "text-[12px] leading-5 text-[var(--md-text)]" : "sr-only"}>
        {fieldPolicy.routingModeMismatch ? <p>{t("Mode review")}: {t("No routing step uses the overall mode.")} {t("Check Mode in Control and the steps in Route & schedule. Nothing is changed automatically.")}</p> : null}
      </div>
      <TabsList variant="line" aria-label={t("Booking detail sections")} className="w-full justify-start">
        <TabsTrigger value="control">{t("Control")}</TabsTrigger>
        <TabsTrigger value="parties">{t("Parties")}</TabsTrigger>
        <TabsTrigger value="route">{t("Route & schedule")}</TabsTrigger>
        <TabsTrigger value="cargo">{t("Cargo & equipment")}</TabsTrigger>
      </TabsList>
      <Dialog open={pendingOverallMode !== null} onOpenChange={(open) => { if (!open) setPendingOverallMode(null) }}>
        <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); overallModeCancelRef.current?.focus() }} onCloseAutoFocus={(event) => { event.preventDefault(); (overallModeTriggerRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? overallModeTriggerRef.current)?.focus() }}>
          <DialogHeader><DialogTitle>{t("Change overall Booking mode?")}</DialogTitle><DialogDescription>{t("Existing routing steps keep their own modes, references, carriers and dates. An incompatible shipment type will be cleared for you to choose again. Cargo and equipment are retained; review them for the new mode. The Quote and existing documents will not change.")}</DialogDescription></DialogHeader>
          <p className="text-[13px] font-medium" data-i18n-skip>{pendingOverallMode?.from} → {pendingOverallMode?.to}</p>
          <DialogFooter><Button ref={overallModeCancelRef} variant="ghost" onClick={() => setPendingOverallMode(null)}>{t("Keep current mode")}</Button><Button disabled={!editable} onClick={confirmOverallMode}>{t("Change mode and review")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <TabsContent value="control" className="grid gap-[var(--md-page-stack-gap-compact)]">
      <BookingCargoWiseGroup title="Job data">
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Booking control")}</h4>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <BookingCargoWiseField label="Booking ref" value={record.booking.id} />
              <BookingCargoWiseField label="Job ref" value={record.booking.jobRef} {...editField("jobRef")} />
              <BookingCargoWiseField label="Status" value={record.booking.status} options={["On track", "Delayed", "Exception"]} {...editField("status")} />
              <BookingCargoWiseField label="Progress" value={detailValue("progress", `${record.booking.progress}%`)} options={bookingProgressOptions} {...editDetail("progress")} />
              <div ref={overallModeTriggerRef} tabIndex={-1}><BookingCargoWiseField label="Mode" value={record.booking.mode} options={modeOptions} placeholder="Choose mode" allowCustom={false} {...editField("mode")} onChange={requestOverallMode} /></div>
              <BookingCargoWiseField label="Quote type" value={quoteType} options={bookingDirectionOptions} placeholder="Choose quote type" allowCustom={false} {...editDetail("quoteType")} />
              <BookingCargoWiseField label="Shipment type" value={detailValue("shipmentType", record.booking.shipmentType)} options={shipmentTypeOptions} placeholder="Choose shipment type" allowCustom={false} {...editDetail("shipmentType")} />
              <BookingCargoWiseField label="Last updated" value={updatedAt} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Ownership")}</h4>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <BookingCargoWiseField label="Owner" value={ownerName} options={ownerOptions} searchable placeholder="Search team members" allowCustom={false} {...editDetail("ownerName")} />
              <BookingCargoWiseField label={calculatedDirection ? "Direction (auto)" : "Direction"} value={calculatedDirection ?? record.booking.direction} options={bookingDirectionOptions} placeholder="Choose direction" allowCustom={false} editable={editable && !calculatedDirection} onChange={(nextDirection) => {
                onBookingChange("direction", nextDirection)
                onDetailChange("quoteType", nextDirection)
              }} />
              <BookingCargoWiseField label="Favourite" value={record.booking.isFavourite ? "Yes" : "No"} options={["Yes", "No"]} editable={editable} onChange={(value) => onDetailChange("isFavourite", value === "Yes")} />
              <BookingCargoWiseField label="Current location" value={record.booking.currentLocation} {...editField("currentLocation")} />
              <BookingCargoWiseField label="Source ID" value={record.booking.sourceId} span />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("References")}</h4>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <BookingCargoWiseField label="Customer ref" value={detailValue("customerReference", record.booking.customerRef)} {...editDetail("customerReference")} />
              <BookingCargoWiseField label="Quote ref" value={quoteReference} />
              <BookingCargoWiseField label="Customer PO" value={detailValue("customerPO", value(facts, "customerPO"))} {...editDetail("customerPO")} />
              <BookingCargoWiseField label="Supplier ref" value={detailValue("supplierReference", record.booking.supplierRef)} {...editDetail("supplierReference")} />
              <BookingCargoWiseField label="Invoice" value={detailValue("invoiceReference", record.booking.invoice)} {...editDetail("invoiceReference")} />
              <BookingCargoWiseField label="Documents" value={detailValue("documentsStatus", t("Not connected"))} {...editDetail("documentsStatus")} />
              <BookingCargoWiseField label="Workflow" value={detailValue("workflowStatus", record.booking.status)} {...editDetail("workflowStatus")} />
            </div>
          </div>
        </div>
      </BookingCargoWiseGroup>

      <BookingCargoWiseGroup
        title="Customer terms"
        action={<span className="truncate text-[12px] text-[var(--md-subtle)]">{t("Billed to")} {partyValue(payer, "name", value(quotePayer, "name", record.booking.customer))}</span>}
      >
        <div className="grid gap-1.5 md:grid-cols-2">
          <BookingCargoWiseField label="Terms and conditions" value={detailValue("termsAndConditions", (workspace.booking.sourceQuoteId ? value(quote, "terms") : "") || unavailable)} span {...editDetail("termsAndConditions")} />
          <BookingCargoWiseField label="Subject to rate / space" value={detailValue("subjectToTerms", value(facts, "subjectToTerms") || unavailable)} span {...editDetail("subjectToTerms")} />
          <BookingCargoWiseField label="Customer notes" value={detailValue("customerNotes", value(quote, "customerNotes") || workspace.booking.internalNotes || unavailable)} span {...editDetail("customerNotes")} />
          <BookingCargoWiseField label="Response deadline" value={detailValue("responseDeadline", value(quote, "deadline") || workspace.booking.customerDeadline || unavailable)} {...editDetail("responseDeadline")} />
        </div>
      </BookingCargoWiseGroup>
      </TabsContent>

      <TabsContent value="parties" className="grid items-stretch gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-2 2xl:grid-cols-4">
        <BookingCargoWiseGroup title="Customer" className="[--md-field-label-width:64px]">
          <BookingCargoWiseField label="Name" value={partyValue(customerParty, "name", record.booking.customer || value(quote, "customerName"))} options={organisationOptions("customer")} searchable placeholder="Search customers" span {...editParty("customer", "name")} onOptionSelect={(option) => {
            const organisation = organisations.find((item) => item.id === option.id)
            if (organisation) onOrganisationSelect("customer", organisation)
          }} />
          <BookingCargoWiseField label="Code / ref" value={partyValue(customerParty, "identifierValue", value(facts, "clientCode", customer.customerCode ?? "") || record.booking.customerRef)} span {...editParty("customer", "identifierValue")} />
          <BookingCargoWiseField label="Address" value={partyValue(customerParty, "address", value(facts, "customerAddress", value(quote, "customerAddress")) || unavailable)} span {...editParty("customer", "address")} />
          <BookingCargoWiseField label="Contact" value={partyValue(customerParty, "contactName", value(facts, "customerContact", value(quote, "contactName")) || unavailable)} options={partyContactOptions(customerOrganisation)} searchable placeholder="Search contacts" span {...editParty("customer", "contactName")} onOptionSelect={(option) => {
            const contact = customerOrganisation?.contacts.find((item) => item.id === option.id)
            if (!contact) return
            onPartyChange("customer", "contactId", contact.id)
            onPartyChange("customer", "email", contact.email ?? contact.emails[0] ?? "")
          }} />
          <BookingCargoWiseField label="Email" value={partyValue(customerParty, "email", value(facts, "customerEmail", value(quote, "contactEmail")) || unavailable)} span {...editParty("customer", "email")} />
        </BookingCargoWiseGroup>
        <BookingCargoWiseGroup
          title="Bill to / payer"
          className="[--md-field-label-width:64px]"
          action={(
            <Button type="button" variant="ghost" size="sm" disabled={!editable || !customerOrganisation} onClick={() => customerOrganisation && onOrganisationSelect("payer", customerOrganisation)} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px] text-[var(--md-subtle)]">
              <Copy className="size-3" aria-hidden="true" />{t("Use customer")}
            </Button>
          )}
        >
          <BookingCargoWiseField label="Name" value={partyValue(payer, "name", value(quotePayer, "name", record.booking.customer))} options={organisationOptions("payer")} searchable placeholder="Search payer accounts" span {...editParty("payer", "name")} onOptionSelect={(option) => {
            const organisation = organisations.find((item) => item.id === option.id)
            if (organisation) onOrganisationSelect("payer", organisation)
          }} />
          <BookingCargoWiseField label="Code" value={partyValue(payer, "identifierValue", value(quotePayer, "code", value(facts, "payerCode", partyValue(customerParty, "identifierValue", value(facts, "clientCode", customer.customerCode ?? "")))))} span {...editParty("payer", "identifierValue")} />
          <BookingCargoWiseField label="Address" value={partyValue(payer, "address", value(quotePayer, "address", value(facts, "customerAddress")) || unavailable)} span {...editParty("payer", "address")} />
          <BookingCargoWiseField label="Contact" value={partyValue(payer, "contactName", value(quotePayer, "contact", value(quote, "contactName")) || unavailable)} options={partyContactOptions(payerOrganisation)} searchable placeholder="Search billing contacts" span {...editParty("payer", "contactName")} onOptionSelect={(option) => {
            const contact = payerOrganisation?.contacts.find((item) => item.id === option.id)
            if (!contact) return
            onPartyChange("payer", "contactId", contact.id)
            onPartyChange("payer", "email", contact.email ?? contact.emails[0] ?? "")
          }} />
          <BookingCargoWiseField label="Email" value={partyValue(payer, "email", value(quotePayer, "email", value(facts, "payerEmail", value(quote, "contactEmail"))) || unavailable)} span {...editParty("payer", "email")} />
        </BookingCargoWiseGroup>
        <BookingCargoWiseGroup title="Shipper" className="[--md-field-label-width:64px]">
          <BookingCargoWiseField label="Code" value={partyValue(shipper, "identifierValue", value(facts, "shipperCode"))} span {...editParty("shipper", "identifierValue")} />
          <BookingCargoWiseField label="Name" value={partyValue(shipper, "name", value(quote, "shipperName") || unavailable)} options={organisationOptions("shipper")} searchable placeholder="Search shippers" span {...editParty("shipper", "name")} onOptionSelect={(option) => {
            const organisation = organisations.find((item) => item.id === option.id)
            if (organisation) onOrganisationSelect("shipper", organisation)
          }} />
              <BookingCargoWiseField label="Reference" value={detailValue("shipperReference", value(facts, "shipperReference"))} span {...editDetail("shipperReference")} />
          <BookingCargoWiseField label="Collection" value={record.booking.origin} options={locationFieldOptions} searchable placeholder="Search places or UN/LOCODEs" span {...editField("origin")} onChange={(nextValue) => { onBookingChange("origin", nextValue); onRouteChange(0, "originUnlocode", "") }} onOptionSelect={(option) => {
            const location = locationOptions.find((item) => item.id === option.id)
            if (location) onLocationSelect("origin", location)
          }} />
          <BookingCargoWiseField label="Address" value={partyValue(shipper, "address", value(quote, "shipperAddress") || unavailable)} span {...editParty("shipper", "address")} />
          <BookingCargoWiseField label="Contact" value={partyValue(shipper, "contactName", value(facts, "shipperContact") || unavailable)} options={partyContactOptions(shipperOrganisation)} searchable placeholder="Search contacts" span {...editParty("shipper", "contactName")} onOptionSelect={(option) => {
            const contact = shipperOrganisation?.contacts.find((item) => item.id === option.id)
            if (!contact) return
            onPartyChange("shipper", "contactId", contact.id)
            onPartyChange("shipper", "email", contact.email ?? contact.emails[0] ?? "")
          }} />
        </BookingCargoWiseGroup>
        <BookingCargoWiseGroup title="Consignee" className="[--md-field-label-width:64px]">
          <BookingCargoWiseField label="Code" value={partyValue(consignee, "identifierValue", value(facts, "consigneeCode"))} span {...editParty("consignee", "identifierValue")} />
          <BookingCargoWiseField label="Name" value={partyValue(consignee, "name", value(quote, "consigneeName") || unavailable)} options={organisationOptions("consignee")} searchable placeholder="Search consignees" span {...editParty("consignee", "name")} onOptionSelect={(option) => {
            const organisation = organisations.find((item) => item.id === option.id)
            if (organisation) onOrganisationSelect("consignee", organisation)
          }} />
              <BookingCargoWiseField label="Reference" value={detailValue("consigneeReference", value(facts, "consigneeReference"))} span {...editDetail("consigneeReference")} />
          <BookingCargoWiseField label="Delivery" value={record.booking.destination} options={locationFieldOptions} searchable placeholder="Search places or UN/LOCODEs" span {...editField("destination")} onChange={(nextValue) => { onBookingChange("destination", nextValue); onRouteChange(Math.max(workspace.routes.length - 1, 0), "destinationUnlocode", "") }} onOptionSelect={(option) => {
            const location = locationOptions.find((item) => item.id === option.id)
            if (location) onLocationSelect("destination", location)
          }} />
          <BookingCargoWiseField label="Address" value={partyValue(consignee, "address", value(quote, "consigneeAddress") || unavailable)} span {...editParty("consignee", "address")} />
          <BookingCargoWiseField label="Contact" value={partyValue(consignee, "contactName", value(facts, "consigneeContact") || unavailable)} options={partyContactOptions(consigneeOrganisation)} searchable placeholder="Search contacts" span {...editParty("consignee", "contactName")} onOptionSelect={(option) => {
            const contact = consigneeOrganisation?.contacts.find((item) => item.id === option.id)
            if (!contact) return
            onPartyChange("consignee", "contactId", contact.id)
            onPartyChange("consignee", "email", contact.email ?? contact.emails[0] ?? "")
          }} />
        </BookingCargoWiseGroup>
      </TabsContent>

      <TabsContent value="route" className="grid items-stretch gap-[var(--md-page-stack-gap-compact)]">
        <BookingCargoWiseGroup title="Route & service">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Service")}</h4>
              <div className="grid gap-1.5 md:grid-cols-2">
                <BookingCargoWiseField label="Shipment type" value={detailValue("shipmentType", record.booking.shipmentType)} options={shipmentTypeOptions} placeholder="Choose shipment type" allowCustom={false} {...editDetail("shipmentType")} />
                <BookingCargoWiseField label="Equipment / load" value={record.booking.container} options={bookingEquipmentOptionsByMode[modeKey] ?? bookingEquipmentOptionsByMode.multimodal} placeholder="Choose equipment" {...editField("container")} />
                {fieldPolicy.hblMode ? <BookingCargoWiseField label="HBL mode" value={detailValue("hblMode", value(facts, "hblMode"))} options={bookingHblModeOptions} placeholder="Choose HBL mode" allowCustom={false} {...editDetail("hblMode")} /> : null}
                <BookingCargoWiseField label="Incoterms" value={incotermCode} options={bookingIncotermOptions} placeholder="Choose Incoterm" allowCustom={false} editable={editable} onChange={(nextCode) => onDetailChange("incoterms", [nextCode, incotermLocation].filter(Boolean).join(" "))} />
                <BookingCargoWiseField label="ETD" value={estimatedDeparture} inputType="date" editable={editable} onChange={(nextDate) => {
                  onBookingChange("departureDate", nextDate)
                  if (firstWorkspaceRoute) onRouteChange(0, "plannedDepartureAt", nextDate)
                }} />
                <BookingCargoWiseField label="ETA" value={estimatedArrival} inputType="date" editable={editable} onChange={(nextDate) => {
                  onBookingChange("arrivalDate", nextDate)
                  if (lastWorkspaceRoute) onRouteChange(Math.max(workspace.routes.length - 1, 0), "plannedArrivalAt", nextDate)
                }} />
              </div>
            </div>
            <div className="grid content-start gap-1.5">
              <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Carrier & supplier")}</h4>
              <div className="grid gap-1.5 md:grid-cols-2">
                <BookingCargoWiseField label="Carrier" value={detailValue("carrierName", record.booking.carrier)} options={organisationOptions("carrier")} searchable placeholder="Search carriers" {...editDetail("carrierName")} onOptionSelect={(option) => {
                  const organisation = organisations.find((item) => item.id === option.id)
                  if (organisation) onOrganisationSelect("carrier", organisation)
                }} />
                <BookingCargoWiseField label="Supplier" value={workspace.booking.supplierName ?? ""} options={organisationOptions("supplier")} searchable placeholder="Search suppliers" editable={editable} onChange={() => undefined} onOptionSelect={(option) => {
                  const organisation = organisations.find((item) => item.id === option.id)
                  if (organisation) onOrganisationSelect("supplier", organisation)
                }} />
                <BookingCargoWiseField label="Supplier ref" value={detailValue("supplierReference", record.booking.supplierRef)} {...editDetail("supplierReference")} />
                <BookingCargoWiseField label="Current location" value={record.booking.currentLocation} {...editField("currentLocation")} />
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[11px] font-medium text-[var(--md-ink)]">{t("Routing steps")}</h4>
                <p className="text-[10px] text-[var(--md-subtle)]">{t("Add each movement in journey order.")}</p>
              </div>
              <Button type="button" variant="ghost" disabled={!editable || workspace.routes.length >= 30} className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[11px] text-[var(--md-accent)]" onClick={onRouteAdd}>
                <Plus className="size-3.5" strokeWidth={1.35} aria-hidden="true" />
                {t("Add routing step")}
              </Button>
            </div>
            {(workspace.routes.length ? workspace.routes : [{ order: 1, mode: record.booking.mode, isMainCarriage: true }]).map((leg, index) => {
              const legLocations = routeLocationOptions(leg.mode)
              const legLocationFields = toLocationFieldOptions(legLocations)
              const legMode = bookingWorkspaceMode(leg.mode || record.booking.mode)
              const carrierName = recordText(asRecord(leg.routeData), "carrierName") || (index === 0 ? record.booking.carrier : "")
              const { field: transportField, label: transportLabel } = freightTransportField(legMode)
              const operationalFields = freightRouteOperationalFields(legMode)
              return (
                <div key={leg.id ?? `draft-route-${index}`} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2.5 shadow-[var(--md-shadow-line)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10.5px] font-medium text-[var(--md-text)]">{t("Step")} <span data-i18n-skip>{index + 1}</span>{leg.isMainCarriage ? <span className="ms-1.5 text-[var(--md-accent)]">· {t("Main carriage")}</span> : null}</p>
                    {!leg.id && workspace.routes.length > 1 ? (
                      <Button type="button" variant="ghost" size="icon" disabled={!editable} aria-label={`${t("Remove routing step")} ${index + 1}`} className="size-7 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)]" onClick={() => onRouteRemove(index)}>
                        <Trash2 className="size-3.5" strokeWidth={1.35} aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <div className="min-w-0" ref={(element) => { if (element) routeModeTriggersRef.current.set(index, element); else routeModeTriggersRef.current.delete(index) }}><BookingCargoWiseField label="Mode" value={legMode} options={modeOptions} allowCustom={false} editable={editable} onChange={(mode) => {
                      if (!editable || bookingWorkspaceMode(mode) === legMode) return
                      routeModeFocusRef.current = routeModeTriggersRef.current.get(index)?.querySelector("button") ?? null
                      setPendingRouteMode({ index, mode, route: leg })
                    }} /></div>
                    <BookingCargoWiseField label="Origin from" value={leg.originUnlocode || leg.origin || ""} options={legLocationFields} searchable placeholder="Search places or UN/LOCODEs" {...editRoute(index, "origin")} onChange={(nextValue) => { onRouteChange(index, "origin", nextValue); onRouteChange(index, "originUnlocode", "") }} onOptionSelect={(option) => {
                      const location = legLocations.find((item) => item.id === option.id)
                      if (location) onRouteLocationSelect(index, "origin", location)
                    }} />
                    <BookingCargoWiseField label="Destination to" value={leg.destinationUnlocode || leg.destination || ""} options={legLocationFields} searchable placeholder="Search places or UN/LOCODEs" {...editRoute(index, "destination")} onChange={(nextValue) => { onRouteChange(index, "destination", nextValue); onRouteChange(index, "destinationUnlocode", "") }} onOptionSelect={(option) => {
                      const location = legLocations.find((item) => item.id === option.id)
                      if (location) onRouteLocationSelect(index, "destination", location)
                    }} />
                    <BookingCargoWiseField label="Carrier" value={carrierName} options={organisationOptions("carrier")} searchable placeholder="Search carriers" editable={editable} onChange={() => undefined} onOptionSelect={(option) => {
                      const organisation = organisations.find((item) => item.id === option.id)
                      if (organisation) onRouteOrganisationSelect(index, organisation)
                    }} />
                    <BookingCargoWiseField label="Departure" value={leg.plannedDepartureAt ? String(leg.plannedDepartureAt).slice(0, 10) : ""} inputType="date" {...editRoute(index, "plannedDepartureAt")} />
                    <BookingCargoWiseField label="Arrival" value={leg.plannedArrivalAt ? String(leg.plannedArrivalAt).slice(0, 10) : ""} inputType="date" {...editRoute(index, "plannedArrivalAt")} />
                    <BookingCargoWiseField label={transportLabel} value={String(leg[transportField] ?? "")} {...editRoute(index, transportField)} />
                    <BookingCargoWiseField label="Booking reference" value={leg.carrierBookingReference ?? ""} {...editRoute(index, "carrierBookingReference")} />
                  </div>
                  {operationalFields.length ? <details className="min-w-0">
                    <summary className="cursor-pointer rounded-[var(--md-radius-md)] py-2 text-[12px] font-medium text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]">{t("Operational details")} · {t("Step")} {index + 1}</summary>
                    <div className="grid min-w-0 gap-2 pt-2 md:grid-cols-2 xl:grid-cols-3 [--md-field-label-width:110px]">
                      {operationalFields.map(({ field, label, maxLength }) => <BookingCargoWiseField key={field} label={label} value={String(leg[field] ?? "")} maxLength={maxLength} wrapValue {...editRoute(index, field)} />)}
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--md-text)]">{t("References belong to this routing step. A mode change requires review; saved previous references remain in the job audit history.")}</p>
                  </details> : null}
                </div>
              )
            })}
          </div>
        </BookingCargoWiseGroup>

        <Dialog open={pendingRouteMode !== null} onOpenChange={(open) => { if (!open) setPendingRouteMode(null) }}>
          <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); routeModeCancelRef.current?.focus() }} onCloseAutoFocus={(event) => { event.preventDefault(); routeModeFocusRef.current?.focus() }}>
            <DialogHeader>
              <DialogTitle>{t("Change routing step mode?")}</DialogTitle>
              <DialogDescription>{t("Master, house and carrier booking references and the generic transport service will start blank. Saved previous values remain in audit history when you save. Review the carrier, schedule and mode-specific details before saving. The Quote and existing documents will not change.")}</DialogDescription>
            </DialogHeader>
            <p className="text-[13px] font-medium">{t("Step")} {(pendingRouteMode?.index ?? 0) + 1}: {bookingWorkspaceMode(pendingRouteMode?.route.mode)} → {bookingWorkspaceMode(pendingRouteMode?.mode)}</p>
            <DialogFooter>
              <Button ref={routeModeCancelRef} variant="ghost" onClick={() => setPendingRouteMode(null)}>{t("Keep current mode")}</Button>
              <Button disabled={!editable} onClick={() => {
                if (!editable || !pendingRouteMode) return
                // Do not apply a confirmation to a replaced or reordered draft leg.
                if (workspace.routes[pendingRouteMode.index] === pendingRouteMode.route || (!workspace.routes.length && pendingRouteMode.index === 0)) {
                  onRouteChange(pendingRouteMode.index, "mode", pendingRouteMode.mode)
                } else {
                  toast.error(t("Routing step changed"), { description: t("Review the current routing step and choose its mode again.") })
                }
                setPendingRouteMode(null)
              }}>{t("Change mode and review")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>
      <TabsContent value="cargo" className="grid gap-[var(--md-page-stack-gap-compact)]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <h2 className="text-[13px] font-medium">{t("Cargo lines")} · {workspace.cargo.length}</h2>
            <Button variant="ghost" size="sm" disabled={!editable || workspace.cargo.length >= 200} onClick={() => { setSelectedCargoIndex(workspace.cargo.length); onCargoAdd() }}>
              <Plus className="size-3.5" aria-hidden="true" />{t("Add cargo line")}
            </Button>
          </div>
          {recordText(facts, "goodsValue") !== "" ? (
            <div className="px-3 pb-3 text-[12px] text-[var(--md-text)]">
              <dl className="flex flex-wrap gap-x-2 gap-y-1">
                <dt>{t("Quote goods value (shipment)")}</dt>
                <dd data-i18n-skip className="font-medium text-[var(--md-ink)]">{[recordText(facts, "goodsValueCurrency"), recordText(facts, "goodsValue")].filter(Boolean).join(" ")}</dd>
              </dl>
              <p className="mt-1">{t("From the accepted Quote snapshot, not an allocation to an individual cargo line.")}</p>
            </div>
          ) : null}
          {workspace.booking.shipmentGoodsValue ? (
            <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 [--md-field-label-width:110px]">
              <BookingCargoWiseAmountField label="Shipment goods value" amount={workspace.booking.shipmentGoodsValue.amount ?? ""} currency={workspace.booking.shipmentGoodsValue.currency ?? ""} currencies={currencyOptions} editable={editable}
                onAmountChange={(amount) => onDetailChange("shipmentGoodsValueAmount", amount)} onCurrencyChange={(currency) => onDetailChange("shipmentGoodsValueCurrency", currency)} />
              <p className="text-[12px] leading-5 text-[var(--md-text)]">{t("Current Booking total. Changing it does not redistribute cargo-line values.")}</p>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <caption className="sr-only">{t("Select a cargo line to edit its goods details below")}</caption>
              <thead className="bg-[var(--md-surface-soft)] text-[var(--md-text)]"><tr>
                {["Goods description", "Packages", "Gross weight (kg)", "Volume (CBM)", "Actions"].map((label) => <th key={label} scope="col" className="px-3 py-2 font-medium">{t(label)}</th>)}
              </tr></thead>
              <tbody>{workspace.cargo.map((line, index) => (
                <tr key={line.id || `draft-${index}`} className={cn(index === cargoIndex && "bg-[var(--md-surface-soft)]")}>
                  <td className="px-3 py-1.5"><Button variant="ghost" size="sm" aria-pressed={index === cargoIndex} onClick={() => setSelectedCargoIndex(index)} className="h-auto justify-start whitespace-normal text-left">{index + 1}. {line.description || t("New cargo line")}</Button></td>
                  <td className="px-3 py-1.5">{line.packageQuantity ?? line.pieces ?? "—"} {line.packageType}</td>
                  <td className="px-3 py-1.5">{line.grossWeightKg ?? "—"}</td>
                  <td className="px-3 py-1.5">{line.volumeCbm ?? "—"}</td>
                  <td className="px-3 py-1.5"><Button variant="ghost" size="icon" disabled={!editable} aria-label={t(`Remove cargo line ${index + 1}`)} onClick={() => setRemovingCargoIndex(index)}><Trash2 className="size-3.5" aria-hidden="true" /></Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!workspace.cargo.length ? <p className="px-3 py-4 text-[12px] text-[var(--md-text)]">{t("No cargo lines yet. Add a line to describe the goods.")}</p> : null}
        </Surface>
        <Dialog open={removingCargoIndex !== null} onOpenChange={(open) => { if (!open) setRemovingCargoIndex(null) }}>
          <DialogContent><DialogHeader><DialogTitle>{t("Remove cargo line?")}</DialogTitle><DialogDescription>{t("This removes the line from the current booking when you save. Existing historical records are retained. Review any related equipment or customs allocations before saving.")}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setRemovingCargoIndex(null)}>{t("Cancel")}</Button><Button onClick={() => { if (removingCargoIndex !== null) onCargoRemove(removingCargoIndex); setRemovingCargoIndex(null); setSelectedCargoIndex(0) }}>{t("Remove line")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <BookingCargoWiseGroup title="Goods" contentClassName="sm:grid-cols-2 xl:grid-cols-4">
          <BookingCargoWiseAmountField label="Booking value" amount={valueAmount} currency={valueCurrency} currencies={currencyOptions} editable={editable} onAmountChange={(nextAmount) => onBookingChange("value", [valueCurrency, nextAmount].filter(Boolean).join(" "))} onCurrencyChange={(nextCurrency) => onBookingChange("value", [nextCurrency, valueAmount].filter(Boolean).join(" "))} />
          <BookingCargoWiseAmountField label="Cargo line value" amount={cargoValue("declaredValue")} currency={cargoValue("declaredValueCurrency")} currencies={currencyOptions} editable={editable && Boolean(cargo)} onAmountChange={(nextAmount) => onCargoChange(cargoIndex, "declaredValue", nextAmount)} onCurrencyChange={(nextCurrency) => onCargoChange(cargoIndex, "declaredValueCurrency", nextCurrency)} />
          <BookingCargoWiseField label="Commodity" value={cargoValue("commodity", value(facts, "commodity"))} options={commodityOptions} searchable placeholder="Search commodities" {...editCargo(cargoIndex, "commodity")} />
          <BookingCargoWiseField label="Other handling" value={bookingCargoOtherHandling(knownCargo)} options={bookingOtherHandlingOptions} placeholder="Choose handling" allowCustom={false} {...editCargo(cargoIndex, "knownCargo")} />
          <BookingCargoWiseField label="Hazardous" value={typeof cargo?.isHazardous === "boolean" ? (cargo.isHazardous ? "Yes" : "No") : ""} options={["Yes", "No"]} placeholder="Not recorded" emptyValue="Not recorded" allowCustom={false} {...editCargo(cargoIndex, "isHazardous")} />
          <BookingCargoWiseField label="Temperature controlled" value={typeof cargo?.isTemperatureControlled === "boolean" ? (cargo.isTemperatureControlled ? "Yes" : "No") : ""} options={["Yes", "No"]} placeholder="Not recorded" emptyValue="Not recorded" allowCustom={false} {...editCargo(cargoIndex, "isTemperatureControlled")} />
          {bookingCargoSafetyConflict(cargo, knownCargo) ? <p className="sm:col-span-2 xl:col-span-4 text-[12px] leading-5 text-[var(--md-text)]">{t("Earlier handling text mentions safety requirements that are not confirmed by this line's flags. Review the source documents before changing them.")} <span data-i18n-skip>{knownCargo}</span></p> : null}
          <div className="sm:col-span-2 xl:col-span-2 2xl:col-span-2">
            <BookingCargoWiseField label="Goods description" value={goodsDescription} placeholder="Describe the goods" {...editCargo(cargoIndex, "description")} />
          </div>
          <BookingCargoWiseField label="Packages / pieces" value={cargoValue("packageQuantity", value(facts, "packageQuantity"))} {...editCargo(cargoIndex, "packageQuantity")} />
          <BookingCargoWiseField label="Package type" value={cargoValue("packageType", value(facts, "packageType"))} options={[...freightPackageTypeOptions]} searchable {...editCargo(cargoIndex, "packageType")} />
          <BookingCargoWiseField label="Gross weight (kg)" value={cargoValue("grossWeightKg", value(facts, "grossWeightKg"))} {...editCargo(cargoIndex, "grossWeightKg")} />
          <BookingCargoWiseField label="Volume (CBM)" value={cargoValue("volumeCbm", value(facts, "volumeCbm"))} {...editCargo(cargoIndex, "volumeCbm")} />
          <BookingCargoWiseField label="Length" value={cargoValue("length", value(facts, "length"))} {...editCargo(cargoIndex, "length")} />
          <BookingCargoWiseField label="Width" value={cargoValue("width", value(facts, "width"))} {...editCargo(cargoIndex, "width")} />
          <BookingCargoWiseField label="Height" value={cargoValue("height", value(facts, "height"))} {...editCargo(cargoIndex, "height")} />
          <BookingCargoWiseField label="Dimension unit" value={cargoValue("lengthUnit", value(facts, "lengthUnit", "cm"))} options={["cm", "m", "in"]} allowCustom={false} {...editCargo(cargoIndex, "lengthUnit")} />
          {fieldPolicy.chargeableWeight ? <BookingCargoWiseField label="Chargeable weight (kg)" value={recordText(editableDetails, "chargeableWeightKg") || value(facts, "chargeableWeightKg")} {...editDetail("chargeableWeightKg")} /> : null}
          <BookingCargoWiseField label="Customs included" value={recordText(editableDetails, "customsIncluded") || value(facts, "customsIncluded")} options={bookingCustomsIncludedOptions} placeholder="Choose" allowCustom={false} {...editDetail("customsIncluded")} />
          {fieldPolicy.vin ? <BookingCargoWiseField label="VIN" value={cargoValue("vin", cargoDataValue("vin"))} {...editCargo(cargoIndex, "vin")} /> : null}
          {record.booking.customFields.length
            ? record.booking.customFields.map((field, index) => (
                <BookingCargoWiseField
                  key={`${field.label}-${index}`}
                  label={field.label}
                  value={detailValue(`customField:${field.label}`, field.value)}
                  {...editDetail(`customField:${field.label}`)}
                />
              ))
            : <BookingCargoWiseField label="Custom fields" value={detailValue("customFields", t("No additional fields recorded"))} span {...editDetail("customFields")} />}
        </BookingCargoWiseGroup>
      {equipmentKinds.length > 0 || workspace.containers.length > 0 ? (
        <BookingContainerDetails
          containers={workspace.containers}
          mode={record.booking.mode}
          equipmentKinds={equipmentKinds}
          editable={editable}
          seaService={fieldPolicy.sea}
          onAdd={onContainerAdd}
          onChange={onContainerChange}
          onRemove={onContainerRemove}
        />
      ) : null}

      {allocationEditor && (equipmentKinds.length > 0 || workspace.containers.length > 0 || workspace.cargoAllocationState?.allocations.length || workspace.cargoAllocationState?.legacyUnquantifiedLinks.length)
        ? <BookingCargoWiseGroup title="Cargo allocation">{allocationEditor}</BookingCargoWiseGroup> : null}
      </TabsContent>
    </Tabs>
  )
}

function BookingWorkspaceSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-5 pt-5 text-[15px] font-medium text-[var(--md-ink)]">{children}</h2>
}

function UnavailableBookingSection({ title, detail }: { title: string; detail: string }) {
  const { t } = useLanguage()
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingWorkspaceSectionTitle>{t(title)}</BookingWorkspaceSectionTitle>
      <div className="px-5 py-10 text-center">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("No connected data for this booking")}</h2>
        <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-6 text-[var(--md-text)]">{t(detail)}</p>
      </div>
    </Surface>
  )
}

type BookingDocumentCategory = "quote" | "job" | "customs"

function bookingDocumentCategory(document: BookingWorkflowWorkspace["documents"][number]): BookingDocumentCategory {
  if (document.category === "quote" || document.category === "job" || document.category === "customs") return document.category
  const source = String(document.source ?? "").toLowerCase()
  const type = String(document.typeCode ?? "").toLowerCase().replaceAll("-", "_")
  if (source.includes("quote") || type.startsWith("quote_")) return "quote"
  if (
    source.includes("customs")
    || type.startsWith("customs_")
    || ["commercial_invoice", "invoice", "packing_list", "certificate_of_origin", "import_declaration", "export_declaration"].includes(type)
  ) return "customs"
  return "job"
}

function BookingDocumentsWorkspace({ record }: { record: BookingDetailRecord }) {
  const { language, t } = useLanguage()
  if (record.workspace) {
    const documents = record.workspace.documents
    const groups: Array<{
      category: BookingDocumentCategory
      title: string
      description: string
      empty: string
      icon: typeof FileText
    }> = [
      {
        category: "quote",
        title: "Quote documents",
        description: "Customer-facing files carried forward from the accepted quote.",
        empty: "No quote documents are linked to this booking yet.",
        icon: FileText,
      },
      {
        category: "job",
        title: "Job documents",
        description: "Operational files created or attached against this booking reference.",
        empty: "No job documents are attached yet.",
        icon: Paperclip,
      },
      {
        category: "customs",
        title: "Customs documents",
        description: "Commercial, supporting and declaration files used by Customs.",
        empty: "No Customs documents are attached yet.",
        icon: ShieldCheck,
      },
    ]
    const formatDate = (value: string | null | undefined) => {
      if (!value) return "—"
      const date = new Date(value)
      return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric" }).format(date)
    }
    const formatFileSize = (value: number | null | undefined) => {
      if (value == null || value < 0) return ""
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
      return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`
    }

    return (
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Documents for this booking")}</p>
            <p className="mt-0.5 text-[11px] text-[var(--md-text)]">
              {t("Quote, job and Customs files stay connected to the same booking reference.")}
            </p>
          </div>
          <p className="rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
            <span data-i18n-skip>{documents.length}</span> {t(documents.length === 1 ? "document" : "documents")}
          </p>
        </div>

        {groups.map((group) => {
          const groupDocuments = documents.filter((document) => bookingDocumentCategory(document) === group.category)
          const GroupIcon = group.icon
          return (
            <section
              key={group.category}
              data-document-category={group.category}
              className="shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 bg-[color-mix(in_srgb,var(--md-field-bg)_74%,transparent)] px-4 py-2.5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                    <GroupIcon className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[12px] font-medium text-[var(--md-ink)]">{t(group.title)}</h2>
                    <p className="mt-0.5 text-[10.5px] leading-4 text-[var(--md-text)]">{t(group.description)}</p>
                  </div>
                </div>
                <span className="text-[10.5px] font-medium text-[var(--md-subtle)]">
                  <span data-i18n-skip>{groupDocuments.length}</span> {t(groupDocuments.length === 1 ? "file" : "files")}
                </span>
              </div>

              {groupDocuments.length ? (
                <div className="px-4">
                  {groupDocuments.map((document) => {
                    const details = [
                      document.fileName && document.fileName !== document.title ? document.fileName : "",
                      formatFileSize(document.fileSizeBytes),
                      document.version != null ? `${t("Version")} ${document.version}` : "",
                      document.isCurrent === false ? t("Superseded") : "",
                    ].filter(Boolean)
                    const status = document.isCurrent === false
                      ? "Superseded"
                      : document.status ?? (document.fileName ? "Attached" : "Needs file")
                    const statusTone: StatusTone = document.isCurrent === false
                      ? "neutral"
                      : /active|attached|received|complete|approved/i.test(status)
                        ? "green"
                        : /missing|failed|rejected|expired/i.test(status)
                          ? "red"
                          : "amber"
                    return (
                      <div
                        key={`${group.category}-${document.id}`}
                        className="grid min-w-0 gap-2 py-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none md:grid-cols-[minmax(220px,1.35fr)_minmax(150px,0.72fr)_minmax(118px,0.5fr)_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" title={document.title} data-i18n-skip dir="auto">{document.title}</p>
                          <p className="mt-0.5 truncate text-[10.5px] text-[var(--md-text)]" title={details.join(" · ")} data-i18n-skip dir="auto">
                            {details.length ? details.join(" · ") : t("No file details recorded")}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9.5px] font-medium uppercase tracking-[0.035em] text-[var(--md-subtle)]">{t("Related reference")}</p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.sourceReference || record.booking.id}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9.5px] font-medium uppercase tracking-[0.035em] text-[var(--md-subtle)]">{t("Added")}</p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--md-ink)]" data-i18n-skip>{formatDate(document.receivedAt || document.documentDate || document.createdAt)}</p>
                        </div>
                        <StatusPill tone={statusTone}>{t(status)}</StatusPill>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="px-4 py-4 text-[11.5px] text-[var(--md-text)]">{t(group.empty)}</p>
              )}
            </section>
          )
        })}
      </Surface>
    )
  }
  if (!hasPrototypeDetailData(record)) return <UnavailableBookingSection title="Documents" detail="The booking register does not include a document feed. Connect or sync the document system before document status can be shown here." />

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
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

function BookingCustomsSourceEditor({
  customsError,
  navigate,
  onSaved,
  onViewChange,
  readiness,
  view,
  workspace,
}: {
  customsError: string | null
  navigate: (path: string) => void
  onSaved: (workspace: BookingWorkflowWorkspace) => Promise<void>
  onViewChange: (view: BookingCustomsView) => void
  readiness: BookingCustomsReadiness | null
  view: BookingCustomsView
  workspace: BookingWorkflowWorkspace
}) {
  const { t } = useLanguage()
  const booking = workspace.booking
  const route = workspace.routes[0] ?? {}
  const container = workspace.containers[0] ?? {}
  const exporter = workspace.parties.find((party) => ["exporter", "shipper", "consignor"].includes(party.role.toLowerCase()))
  const importer = workspace.parties.find((party) => ["importer", "consignee"].includes(party.role.toLowerCase()))
  const cargo = workspace.cargo[0] ?? {}
  const [form, setForm] = useState(() => ({
    direction: String(booking.direction ?? "unknown"),
    mode: String(booking.mode ?? ""),
    origin: String(booking.origin ?? ""),
    destination: String(booking.destination ?? ""),
    incoterm: String(booking.incoterm ?? ""),
    incotermLocation: String(booking.incotermLocation ?? ""),
    freightChargeAmount: booking.freightChargeAmount == null ? "" : String(booking.freightChargeAmount),
    freightChargeCurrency: String(booking.freightChargeCurrency ?? ""),
    exporterName: String(exporter?.name ?? ""),
    exporterAddress: String(exporter?.address ?? ""),
    exporterCountry: String(exporter?.countryCode ?? ""),
    exporterIdentifier: String(exporter?.identifierValue ?? ""),
    importerName: String(importer?.name ?? ""),
    importerAddress: String(importer?.address ?? ""),
    importerCountry: String(importer?.countryCode ?? ""),
    importerIdentifier: String(importer?.identifierValue ?? ""),
    goodsDescription: String(cargo.description ?? ""),
    packageQuantity: cargo.packageQuantity == null ? String(cargo.pieces ?? "") : String(cargo.packageQuantity),
    packageType: String(cargo.packageType ?? ""),
    grossWeightKg: cargo.grossWeightKg == null ? "" : String(cargo.grossWeightKg),
    netWeightKg: cargo.netWeightKg == null ? "" : String(cargo.netWeightKg),
    hsCode: String(cargo.hsCode ?? ""),
    transportReference: String(
      String(booking.mode ?? "").toLowerCase() === "air" ? route.flightNumber ?? ""
        : String(booking.mode ?? "").toLowerCase() === "sea" ? route.voyageNumber ?? route.masterTransportReference ?? route.transportMeansName ?? ""
          : String(booking.mode ?? "").toLowerCase() === "rail" ? route.railService ?? route.masterTransportReference ?? ""
            : route.trailerNumber ?? route.vehicleRegistration ?? "",
    ),
    containerNumber: String(container.number ?? ""),
  }))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<"commercial_invoice" | "packing_list" | null>(null)

  function field(key: keyof typeof form, label: string, options?: string[]) {
    return (
      <label className="grid min-w-0 gap-1 text-[11px] text-[var(--md-text)]">
        <span>{t(label)}</span>
        {options ? (
          <select
            className="h-9 min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] px-2.5 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
            value={form[key]}
            onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
          >
            <option value="">{t("Choose")}</option>
            {options.map((option) => (
              <option
                key={option}
                value={key === "direction" && option === "Direction needed" ? "unknown" : option.toLowerCase().replaceAll(" ", "_")}
              >
                {t(option)}
              </option>
            ))}
          </select>
        ) : (
          <Input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
        )}
      </label>
    )
  }

  async function saveSourceData() {
    if (saving) return false
    setSaving(true)
    try {
      const otherParties = workspace.parties.filter((party) => !["exporter", "shipper", "consignor", "importer", "consignee"].includes(party.role.toLowerCase()))
      const mode = form.mode.toLowerCase()
      const saved = await saveBookingWorkflow(booking.jobId, {
        customerId: booking.customerId ?? null,
        carrierId: booking.carrierId ?? null,
        supplierId: booking.supplierId ?? null,
        status: booking.status,
        direction: form.direction,
        mode: form.mode,
        origin: form.origin,
        originUnlocode: booking.originUnlocode ?? null,
        destination: form.destination,
        destinationUnlocode: booking.destinationUnlocode ?? null,
        readyDate: booking.readyDate ?? null,
        requiredDeliveryDate: booking.requiredDeliveryDate ?? null,
        predictedDeliveryAt: booking.predictedDeliveryAt ?? null,
        trackingStatus: booking.trackingStatus ?? null,
        currentLocation: booking.currentLocation ?? null,
        internalNotes: booking.internalNotes ?? null,
        incoterm: form.incoterm,
        incotermLocation: form.incotermLocation,
        freightChargeAmount: form.freightChargeAmount || null,
        freightChargeCurrency: form.freightChargeCurrency,
        collectionAddress: booking.collectionAddress ?? null,
        deliveryAddress: booking.deliveryAddress ?? null,
        route: {
          ...route,
          mode: form.mode,
          origin: form.origin,
          destination: form.destination,
          flightNumber: mode === "air" ? form.transportReference : route.flightNumber ?? null,
          trailerNumber: mode === "road" ? form.transportReference : route.trailerNumber ?? null,
          railService: mode === "rail" ? form.transportReference : route.railService ?? null,
          masterTransportReference: mode === "rail" || mode === "sea" ? form.transportReference : route.masterTransportReference ?? null,
        },
        parties: [
          ...otherParties,
          { ...exporter, role: "consignor", sequence: 10, name: form.exporterName, address: form.exporterAddress, countryCode: form.exporterCountry.toUpperCase(), identifierType: "eori", identifierValue: form.exporterIdentifier, isPrimary: true },
          { ...importer, role: "consignee", sequence: 20, name: form.importerName, address: form.importerAddress, countryCode: form.importerCountry.toUpperCase(), identifierType: form.direction === "import" ? "eori" : importer?.identifierType ?? "eori", identifierValue: form.importerIdentifier, isPrimary: true },
        ],
        cargo: [
          { ...cargo, lineNumber: 1, description: form.goodsDescription, pieces: form.packageQuantity || null, packageQuantity: form.packageQuantity || null, packageType: form.packageType, grossWeightKg: form.grossWeightKg || null, netWeightKg: form.netWeightKg || null, hsCode: form.hsCode },
          ...workspace.cargo.slice(1),
        ],
        containers: mode === "sea"
          ? [{ ...container, number: form.containerNumber, status: container.status ?? "planned" }, ...workspace.containers.slice(1)]
          : workspace.containers,
      })
      await onSaved(saved)
      toast.success(t("Customs source data saved"), { description: t("Readiness has been checked again.") })
      return true
    } catch (reason) {
      toast.error(t("Customs source data could not be saved"), { description: reason instanceof Error ? reason.message : t("Your changes remain on screen. Try again.") })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function attachDocument(documentType: "commercial_invoice" | "packing_list", file: File | undefined) {
    if (!file || uploading) return
    setUploading(documentType)
    try {
      await uploadBookingCustomsDocument(booking.jobId, documentType, file)
      await onSaved(await getBookingWorkflow(booking.bookingReference))
      toast.success(t(documentType === "commercial_invoice" ? "Commercial invoice attached" : "Packing list attached"), { description: file.name })
    } catch (reason) {
      toast.error(t("Document could not be attached"), { description: reason instanceof Error ? reason.message : t("Try attaching the file again.") })
    } finally {
      setUploading(null)
    }
  }

  const fallbackTotalChecks = Math.max(readiness?.missing.length ?? 0, 16)
  const totalChecks = readiness?.totalChecks ?? fallbackTotalChecks
  const completeChecks = readiness?.completeChecks ?? Math.max(totalChecks - (readiness?.missing.length ?? totalChecks), 0)
  const readinessPercent = readiness?.percent ?? Math.round(completeChecks * 100 / totalChecks)

  function fixFields(issue: CustomsReadinessReviewIssue) {
    if (issue.key === "direction") return field("direction", "Direction", ["Direction needed", "Import", "Export", "Domestic", "Cross trade"])
    if (issue.key === "mode") return field("mode", "Transport mode", ["Sea", "Air", "Road", "Rail"])
    if (issue.key === "origin") return field("origin", "Origin loading point / port")
    if (issue.key === "destination") return field("destination", "Destination port / delivery point")
    if (issue.key === "transport_reference") return field("transportReference", form.mode === "air" ? "Flight number" : form.mode === "sea" ? "Vessel or voyage number" : form.mode === "rail" ? "Rail service" : "Trailer or vehicle number")
    if (issue.key === "incoterm") return field("incoterm", "Incoterms")
    if (issue.key === "freight_amount") return field("freightChargeAmount", "Freight amount")
    if (issue.key === "freight_currency") return field("freightChargeCurrency", "Freight currency")
    if (issue.key === "exporter_name") return field("exporterName", "Consignor / shipper name")
    if (issue.key === "exporter_address") return field("exporterAddress", "Consignor / shipper full address")
    if (issue.key === "exporter_eori") return field("exporterIdentifier", "Exporter EORI")
    if (issue.key === "importer_name") return field("importerName", "Importer name")
    if (issue.key === "importer_address") return field("importerAddress", "Importer full address")
    if (issue.key === "importer_identifier") return field("importerIdentifier", "Importer EORI or VAT number")
    if (issue.key === "goods_description") return field("goodsDescription", "Goods description")
    if (issue.key === "packages") return <div className="grid gap-3 sm:grid-cols-2">{field("packageQuantity", "Pieces / packages")}{field("packageType", "Package type")}</div>
    if (issue.key === "gross_weight") return field("grossWeightKg", "Gross weight (kg)")
    if (issue.key === "commercial_invoice") return (
      <Button asChild variant="outline" className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px]">
        <label>{t(uploading === "commercial_invoice" ? "Attaching invoice..." : "Attach commercial invoice")}<input className="sr-only" type="file" aria-label={t("Attach commercial invoice")} accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx" disabled={Boolean(uploading)} onChange={(event) => { void attachDocument("commercial_invoice", event.target.files?.[0]); event.currentTarget.value = "" }} /></label>
      </Button>
    )
    return null
  }

  if (view === "review") {
    return (
      <CustomsReadinessReview
        completeChecks={completeChecks}
        emptyDescription="Sending creates a job-related declaration for the Customs team. It does not submit anything to iCustoms or HMRC."
        emptyTitle="Ready for Customs handoff"
        headline="Ready to hand off to Customs?"
        issues={readiness?.missing ?? []}
        onBack={() => onViewChange("source")}
        percent={readinessPercent}
        renderFix={(issue, close) => {
          if (issue.key === "customs_department" || issue.key === "customs_operator") {
            return <><p className="text-[12px] leading-5 text-[var(--md-text)]">{t("This requirement is controlled by the Customs team setup for the booking office.")}</p><div className="mt-3 flex justify-end"><Button type="button" size="sm" onClick={() => { close(); navigate("/admin/users") }}>{t("Open team settings")}</Button></div></>
          }
          const fields = fixFields(issue)
          return <><h3 className="mb-3 text-[12px] font-medium text-[var(--md-ink)]">{t(issue.section ?? "Booking")}</h3>{fields}<div className="mt-3 flex justify-end pt-3"><Button type="button" size="sm" disabled={saving || Boolean(uploading)} onClick={() => { void saveSourceData().then((saved) => { if (saved) close() }) }}>{t(saving ? "Saving..." : "Confirm")}</Button></div></>
        }}
        t={t}
        title="Customs readiness"
        totalChecks={totalChecks}
      >
        {customsError ? <p className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2 text-[12px] text-[var(--md-red)] shadow-[var(--md-shadow-line)]" role="alert">{customsError}</p> : null}
        {!readiness && !customsError ? <p className="mt-4 text-[13px] text-[var(--md-text)]">{t("Checking the booking against Customs requirements...")}</p> : null}
        {readiness?.warnings.length ? <div className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">{readiness.warnings.map((warning) => <p key={warning.key} className="text-[12px] text-[var(--md-text)]">{t(warning.label)}</p>)}</div> : null}
      </CustomsReadinessReview>
    )
  }

  return (
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="grid gap-5 px-5 py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {field("direction", "Direction", ["Direction needed", "Import", "Export", "Domestic", "Cross trade"])}
          {field("mode", "Transport mode", ["Sea", "Air", "Road", "Rail"])}
          {field("origin", "Origin loading point / port")}
          {field("destination", "Destination port / delivery point")}
          {field("transportReference", form.mode === "air" ? "Flight number" : form.mode === "sea" ? "Vessel or voyage number" : form.mode === "rail" ? "Rail service" : "Trailer or vehicle number")}
          {form.mode === "sea" ? field("containerNumber", "Container number") : null}
          {field("incoterm", "Incoterms")}
          {field("freightChargeAmount", "Freight amount")}
          {field("freightChargeCurrency", "Freight currency")}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
            <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Consignor / shipper")}</p>
            <div className="grid gap-3 sm:grid-cols-2">{field("exporterName", "Name")}{field("exporterCountry", "Country code")}{field("exporterAddress", "Full address")}{field("exporterIdentifier", "EORI")}</div>
          </div>
          <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
            <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Importer")}</p>
            <div className="grid gap-3 sm:grid-cols-2">{field("importerName", "Name")}{field("importerCountry", "Country code")}{field("importerAddress", "Full address")}{field("importerIdentifier", "EORI or VAT number")}</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">{field("goodsDescription", "Goods description")}</div>
          {field("packageQuantity", "Pieces / packages")}
          {field("packageType", "Package type")}
          {field("grossWeightKg", "Gross weight (kg)")}
          {field("netWeightKg", "Net weight (kg)")}
          {field("hsCode", "Commodity code")}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--md-border)] pt-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] shadow-[var(--md-shadow-line)]">
              <label>{t(uploading === "commercial_invoice" ? "Attaching invoice..." : "Attach commercial invoice")}<input className="sr-only" type="file" aria-label={t("Attach commercial invoice")} accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx" disabled={Boolean(uploading)} onChange={(event) => { void attachDocument("commercial_invoice", event.target.files?.[0]); event.currentTarget.value = "" }} /></label>
            </Button>
            <Button asChild variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] shadow-[var(--md-shadow-line)]">
              <label>{t(uploading === "packing_list" ? "Attaching packing list..." : "Attach packing list (optional)")}<input className="sr-only" type="file" aria-label={t("Attach packing list (optional)")} accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx" disabled={Boolean(uploading)} onChange={(event) => { void attachDocument("packing_list", event.target.files?.[0]); event.currentTarget.value = "" }} /></label>
            </Button>
          </div>
          <Button className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px]" disabled={saving} onClick={() => void saveSourceData()}>
            <Save data-icon="inline-start" className="size-3.5" />{t(saving ? "Saving..." : "Save Customs source data")}
          </Button>
        </div>
      </div>
      </Surface>
  )
}

function BookingCustomsWorkspace({
  customsError,
  navigate,
  onWorkspaceSaved,
  onViewChange,
  readiness,
  record,
  view,
}: {
  customsError: string | null
  navigate: (path: string) => void
  onWorkspaceSaved: (workspace: BookingWorkflowWorkspace) => Promise<void>
  onViewChange: (view: BookingCustomsView) => void
  readiness: BookingCustomsReadiness | null
  record: BookingDetailRecord
  view: BookingCustomsView
}) {
  const { t } = useLanguage()
  const declarations = record.workspace?.declarations ?? []

  return (
    <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
      {record.workspace ? <BookingCustomsSourceEditor customsError={customsError} key={record.workspace.booking.updatedAt} navigate={navigate} onSaved={onWorkspaceSaved} onViewChange={onViewChange} readiness={readiness} view={view} workspace={record.workspace} /> : null}

      {view === "source" ? <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <BookingSectionHeading icon={<FileText className="size-4" strokeWidth={1.5} />} title={t("Job-related declarations")} meta={`${declarations.length}`} />
        <div className="px-5 py-2">
          {declarations.length ? declarations.map((declaration) => (
            <button
              key={declaration.id}
              type="button"
              className="grid w-full gap-2 py-4 text-start shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none md:grid-cols-[minmax(180px,1fr)_minmax(140px,0.6fr)_auto] md:items-center"
              onClick={() => navigate(`/customs/job-related/${declaration.direction}/${declaration.id}`)}
            >
              <span><span className="block text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip>{declaration.localReference ?? declaration.customsReference ?? declaration.id}</span><span className="mt-1 block text-[12px] text-[var(--md-text)]">{t(`${declaration.direction} declaration`)}</span></span>
              <span className="text-[12px] text-[var(--md-text)]" data-i18n-skip>{declaration.mrn ?? t("MRN not assigned")}</span>
              <StatusPill tone={declaration.status === "rejected" ? "red" : declaration.status === "draft" ? "amber" : "green"}>{t(declaration.status)}</StatusPill>
            </button>
          )) : <p className="py-7 text-center text-[13px] text-[var(--md-text)]">{t("No job-related declaration has been created yet.")}</p>}
        </div>
      </Surface> : null}
    </div>
  )
}

function BookingFinanceWorkspace({ record }: { record: BookingDetailRecord }) {
  const { t } = useLanguage()
  const liveCharges = record.workspace?.charges ?? []
  const liveChargeRows: Array<readonly [string, string]> = liveCharges.map((charge: BookingWorkflowCharge, index) => {
    const description = typeof charge.description === "string" && charge.description.trim()
      ? charge.description.trim()
      : `${t("Charge")} ${index + 1}`
    const currency = typeof record.workspace?.booking.freightChargeCurrency === "string"
      ? record.workspace.booking.freightChargeCurrency.trim().toUpperCase()
      : ""
    const cost = typeof charge.costLocal === "number" ? charge.costLocal : Number(charge.costLocal ?? 0)
    const sell = typeof charge.sellLocal === "number" ? charge.sellLocal : Number(charge.sellLocal ?? 0)
    const amount = Number.isFinite(sell) && sell !== 0 ? sell : Number.isFinite(cost) ? cost : 0
    const amountLabel = `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`
    const detail = Number.isFinite(sell) && sell !== 0
      ? `${t("Sell")} ${amountLabel}`
      : `${t("Cost")} ${amountLabel}`
    return [`${index + 1}. ${description}`, detail] as const
  })

  return (
    <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
      <Surface padding="none" className="h-fit overflow-hidden rounded-[var(--md-radius-xl)]">
        <BookingWorkspaceSectionTitle>{t("References and value")}</BookingWorkspaceSectionTitle>
        <BookingFactRows rows={[
          ["Booking value", record.booking.value],
          ["Invoice", record.booking.invoice || "Not raised"],
          ["Job reference", record.booking.jobRef],
          ["Customer reference", record.booking.customerRef],
          ["Supplier reference", record.booking.supplierRef || "Not supplied"],
        ]} />
      </Surface>
      {record.workspace ? (
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <BookingWorkspaceSectionTitle>{t("Cost lines")}</BookingWorkspaceSectionTitle>
          {liveChargeRows.length ? (
            <BookingFactRows rows={liveChargeRows} />
          ) : (
            <p className="px-5 py-6 text-[12px] text-[var(--md-text)]">{t("No quote charges have been transferred to this booking yet.")}</p>
          )}
        </Surface>
      ) : (
        <UnavailableBookingSection title="Cost ledger" detail="No supplier-cost or accounting feed is connected for this booking. The booking value above is the only finance field available in the register." />
      )}
    </div>
  )
}

function BookingActivityWorkspace({ record }: { record: BookingDetailRecord }) {
  const { language, t } = useLanguage()
  const events = record.workspace?.events ?? []
  const eventTime = (event: BookingWorkflowEvent) => {
    const date = new Date(event.occurredAt)
    return Number.isNaN(date.getTime()) ? event.occurredAt : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date)
  }

  if (record.workspace) return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <BookingWorkspaceSectionTitle>{t("Activity and audit")}</BookingWorkspaceSectionTitle>
      {events.length ? (
        <div className="px-5 pb-2 pt-3">
          {events.map((event) => (
            <div key={event.id} className="grid gap-x-3 gap-y-1 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none sm:grid-cols-[172px_12px_minmax(0,1fr)] sm:items-start">
              <time className="text-[12px] text-[var(--md-text)]" dateTime={event.occurredAt}>{eventTime(event)}</time>
              <span className="mt-1.5 size-2 rounded-full bg-[var(--md-accent)]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-5 text-[var(--md-ink)]">{event.summary}</p>
                <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{event.actor || t("System")} · {t(event.type.replace(/_/g, " "))}</p>
                {["route_mode_changed", "route_references_updated"].includes(event.type) ? <details className="mt-2 min-w-0">
                  <summary className="cursor-pointer py-1 text-[12px] text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-offset-2">{t("Review previous and current references")}</summary>
                  <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
                    {(["beforeReferences", "afterReferences"] as const).map((key) => {
                      const metadata = asRecord(event.metadata)
                      const mode = recordText(metadata, key === "beforeReferences" ? "fromMode" : "toMode")
                      const references = asRecord(metadata[key])
                      const labels = freightRouteOperationalFields(mode)
                      return <div key={key} className="min-w-0">
                        <p className="text-[12px] font-medium">{t(key === "beforeReferences" ? "Previous" : "Current")} · {bookingWorkspaceMode(mode)}</p>
                        <dl className="mt-2 grid gap-2 text-[12px]">
                          {routeSharedReferenceFields.map((field) => <div key={field} className="min-w-0">
                            <dt className="text-[var(--md-subtle)]">{t(labels.find((item) => item.field === field)?.label ?? (field === "carrierBookingReference" ? "Carrier booking reference" : field === "transportMeansName" ? "Transport service" : field === "masterTransportReference" ? "Master transport reference" : "House transport reference"))}</dt>
                            <dd className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-i18n-skip>{recordText(references, field) || "—"}</dd>
                          </div>)}
                        </dl>
                      </div>
                    })}
                  </div>
                </details> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center">
          <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{t("No activity recorded yet")}</h3>
          <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-6 text-[var(--md-text)]">{t("Booking updates, document attachments and Customs handoffs will appear here.")}</p>
        </div>
      )}
    </Surface>
  )

  if (!hasPrototypeDetailData(record)) return <UnavailableBookingSection title="Activity and audit" detail="The booking register does not include an activity feed yet." />

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

function bookingQuoteSyncValue(value: unknown, language: string) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return new Intl.NumberFormat(language, { maximumFractionDigits: 20 }).format(value)
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
      const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date)
    }
    return value
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "line" : "lines"}`
  if (typeof value === "object") {
    const item = value as Record<string, unknown>
    const main = [item.name, item.description, item.address].find((entry) => typeof entry === "string" && entry.trim())
    if (typeof main === "string") return main
    const summary = Object.values(item).filter((entry) => ["string", "number"].includes(typeof entry)).slice(0, 3).join(" · ")
    return summary || "Updated details"
  }
  return String(value)
}

function bookingQuoteCargoFieldValue(cargo: unknown, key: string, language: string) {
  if (!cargo || typeof cargo !== "object" || Array.isArray(cargo)) return "No cargo line"
  const value = (cargo as Record<string, unknown>)[key]
  return value === null || value === undefined || value === "" ? "Not recorded" : bookingQuoteSyncValue(value, language)
}

function BookingQuoteSyncReviewPanel({
  busy,
  refreshing,
  detailsDirty,
  expanded,
  error,
  onApply,
  onOpenDetails,
  onRefresh,
  onToggle,
  review,
  selectedFields,
}: {
  busy: boolean
  refreshing: boolean
  detailsDirty: boolean
  expanded: boolean
  error: string | null
  onApply: (fields: string[], confirmModeChange?: boolean) => void
  onOpenDetails: () => void
  onRefresh: () => void
  onToggle: (field: string, checked: boolean) => void
  review: BookingQuoteSyncReview
  selectedFields: Set<string>
}) {
  const { language, t } = useLanguage()
  const [pendingModeFields, setPendingModeFields] = useState<string[] | null>(null)
  const pendingModeReviewToken = useRef<string | null>(null)
  const [modeReviewError, setModeReviewError] = useState<string | null>(null)
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const applyTriggerRef = useRef<HTMLButtonElement | null>(null)
  const remainingDifferences = review.differences.filter((difference) => !review.appliedFields.includes(difference.key))
  const availableDifferences = remainingDifferences.filter((difference) => !difference.blockedReason)
  const needsConfirmation = (difference: BookingQuoteSyncDifference) => difference.requiresConfirmation || difference.key === "mode" || difference.warningCode === "mode_change" || difference.conflict
  const attentionCount = remainingDifferences.filter(needsConfirmation).length
  const selectedCount = availableDifferences.filter((difference) => selectedFields.has(difference.key)).length
  const controlsDisabled = busy || refreshing || detailsDirty || !review.reviewToken
  const headingId = `booking-quote-sync-${review.reviewId}`
  const proposedVersionLabel = review.proposedVersionNumber === 1 ? t("Original") : `V${review.proposedVersionNumber}`
  const cargoDetailFields = [
    ["description", "Goods description"], ["commodity", "Commodity"],
    ["packageQuantity", "Packages / pieces"], ["packageType", "Package type"],
    ["grossWeightKg", "Gross weight (kg)"], ["netWeightKg", "Net weight (kg)"],
    ["volumeCbm", "Volume (CBM)"], ["chargeableWeightKg", "Chargeable weight (kg)"],
    ["length", "Length"], ["width", "Width"], ["height", "Height"], ["lengthUnit", "Dimension unit"],
    ["hsCode", "HS code"], ["countryOfOrigin", "Country of origin"],
    ["isHazardous", "Hazardous"], ["isTemperatureControlled", "Temperature controlled"],
  ] as const

  const routingDetailFields = [
    ["mode", "Mode"], ["origin", "Origin"], ["originUnlocode", "Origin UN/LOCODE"],
    ["destination", "Destination"], ["destinationUnlocode", "Destination UN/LOCODE"],
    ["plannedDepartureAt", "Planned departure"], ["plannedArrivalAt", "Planned arrival"],
    ["carrierName", "Carrier"], ["serviceLevel", "Service level"],
  ] as const

  function requestApply(fields: string[], trigger: HTMLButtonElement) {
    if (controlsDisabled || fields.length === 0) return
    setModeReviewError(null)
    applyTriggerRef.current = trigger
    if (fields.includes("mode") || availableDifferences.some((difference) => fields.includes(difference.key) && difference.warningCode === "mode_change")) {
      pendingModeReviewToken.current = review.reviewToken ?? null
      setPendingModeFields(fields)
      return
    }
    onApply(fields, false)
  }

  function confirmModeChange() {
    if (!pendingModeFields || controlsDisabled) return
    if (pendingModeReviewToken.current !== review.reviewToken) {
      setPendingModeFields(null)
      setModeReviewError("The quote review changed. Check the current differences and confirm again.")
      return
    }
    onApply(pendingModeFields, true)
    setPendingModeFields(null)
  }

  return (
    <Surface
      padding="none"
      className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-status-amber-bg)] shadow-[var(--md-shadow-line)]"
      aria-labelledby={headingId}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-status-amber-ink)] shadow-[var(--md-shadow-line)]">
            <TriangleAlert className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 ref={reviewHeadingRef} tabIndex={-1} id={headingId} className="text-[13px] font-medium text-[var(--md-ink)]">{t("Newer accepted quote available")}</h2>
              <StatusPill tone="neutral"><span data-i18n-skip dir="ltr">{review.quoteReference}</span><span aria-hidden="true">·</span><span data-i18n-skip={review.proposedVersionNumber > 1 ? true : undefined} dir="ltr">{proposedVersionLabel}</span></StatusPill>
              <StatusPill tone="amber">{t(review.appliedFields.length ? "Partially applied" : "Booking unchanged")}</StatusPill>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
              {t(`${remainingDifferences.length} ${remainingDifferences.length === 1 ? "field is" : "fields are"} ready to review${attentionCount ? `, including ${attentionCount} ${attentionCount === 1 ? "change that needs" : "changes that need"} attention` : ""}. Nothing changes until you approve it.`)}
            </p>
          </div>
        </div>
        {!expanded ? (
          <Button type="button" className="h-9 shrink-0 rounded-[var(--md-radius-lg)] px-3 text-[12px]" onClick={onOpenDetails}>
            {t("Review quote update")}<ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="bg-[var(--md-surface)] px-3 pb-3 pt-1 shadow-[var(--md-stroke-top)] sm:px-4 sm:pb-4">
          <fieldset disabled={controlsDisabled} aria-describedby={`${headingId}-help`}>
            <legend className="sr-only">{t("Choose accepted quote fields to apply")}</legend>
            <div id={`${headingId}-help`} className="flex flex-col gap-1 px-1 pb-3 pt-2 text-[11.5px] leading-5 text-[var(--md-text)] sm:flex-row sm:items-center sm:justify-between">
              <span>{t("Safe matches are selected for you. Mode changes and conflicts stay unticked until you review them.")}</span>
              <span className="shrink-0 tabular-nums">{selectedCount} {t("selected")}</span>
            </div>
            <div className="overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
              {remainingDifferences.map((difference, index) => {
                const selected = selectedFields.has(difference.key)
                const warningLabel = difference.key === "mode" || difference.warningCode === "mode_change" ? "Mode change"
                  : difference.warningCode === "cargo_removal" ? "Remove cargo"
                    : difference.warningCode === "booking_cargo_removed" ? "Restore cargo"
                      : difference.key.startsWith("cargo:") && difference.key.endsWith(":line") && !difference.previousQuoteValue && !difference.bookingValue ? "Add cargo"
                        : difference.conflict ? "Booking changed" : "Review change"
                return (
                  <div key={difference.key} className={cn(index > 0 && "shadow-[var(--md-stroke-top)]")}>
                  <label
                    className={cn(
                      "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3 transition-[background-color,opacity] duration-200 sm:grid-cols-[auto_minmax(145px,0.55fr)_minmax(0,1fr)] sm:items-center sm:px-4",
                      selected ? "bg-[var(--md-surface)]" : "opacity-75 hover:opacity-100",
                      (controlsDisabled || Boolean(difference.blockedReason)) && "cursor-not-allowed",
                    )}
                  >
                    <Checkbox checked={selected && !difference.blockedReason} disabled={Boolean(difference.blockedReason)} onCheckedChange={(checked) => onToggle(difference.key, checked === true)} aria-label={`${selected ? t("Exclude") : t("Include")} ${t(difference.label)}${difference.cargoDescription ? ` — ${difference.cargoDescription}` : ""}`} aria-describedby={[difference.blockedReason ? `${headingId}-blocked-${index}` : "", difference.reviewNote ? `${headingId}-note-${index}` : ""].filter(Boolean).join(" ") || undefined} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-[var(--md-ink)]">
                        {t(difference.label)}
                        {difference.blockedReason ? <StatusPill tone="amber">{t("Needs mapping")}</StatusPill> : needsConfirmation(difference) ? <StatusPill tone="amber">{t(warningLabel)}</StatusPill> : <StatusPill tone="green">{t("Safe match")}</StatusPill>}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] text-[var(--md-subtle)]">{t(difference.section)}</span>
                      {difference.cargoDescription ? <span data-i18n-skip dir="auto" className="mt-1 block break-words text-[12px] leading-5 text-[var(--md-text)]">{difference.cargoDescription}</span> : null}
                      {difference.blockedReason ? <span id={`${headingId}-blocked-${index}`} className="mt-1 block text-[12px] leading-5 text-[var(--md-status-amber-ink)]">{t(difference.blockedReason)}</span> : null}
                      {difference.reviewNote ? <span id={`${headingId}-note-${index}`} className="mt-1 block text-[12px] leading-5 text-[var(--md-text)]">{t(difference.reviewNote)}</span> : null}
                    </span>
                    <span className="col-start-2 grid min-w-0 gap-2 sm:col-start-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                      <span className="min-w-0 rounded-[var(--md-radius-sm)] bg-[var(--md-bg)] px-2.5 py-2">
                        <span className="block text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Current booking")}</span>
                        <span data-i18n-skip dir="auto" title={bookingQuoteSyncValue(difference.bookingValue, language)} className="mt-0.5 block truncate text-[11.5px] text-[var(--md-ink)]">{bookingQuoteSyncValue(difference.bookingValue, language)}</span>
                      </span>
                      <ArrowRight className="hidden size-3.5 shrink-0 text-[var(--md-subtle)] sm:block" strokeWidth={1.4} aria-hidden="true" />
                      <span className="min-w-0 rounded-[var(--md-radius-sm)] bg-[var(--md-status-green-bg)] px-2.5 py-2">
                        <span className="block text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("New accepted quote")}</span>
                        <span data-i18n-skip dir="auto" title={bookingQuoteSyncValue(difference.newQuoteValue, language)} className="mt-0.5 block truncate text-[11.5px] font-medium text-[var(--md-ink)]">{bookingQuoteSyncValue(difference.newQuoteValue, language)}</span>
                      </span>
                    </span>
                  </label>
                  {difference.key === "routing" ? (
                    <details className="px-3 pb-3 sm:px-4">
                      <summary className="cursor-pointer rounded-[var(--md-radius-sm)] py-1 text-[12px] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]">{t("Inspect routing plan")}</summary>
                      <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{t("These are Quote-owned legs in route order. Booking-only legs remain separate and are not replaced.")}</p>
                      <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-3">
                        {([["Previous quote", difference.previousQuoteValue], ["Current booking", difference.bookingValue], ["New accepted quote", difference.newQuoteValue]] as const).map(([sourceLabel, routes]) => (
                          <section key={sourceLabel} className="min-w-0">
                            <h3 className="text-[12px] font-medium text-[var(--md-ink)]">{t(sourceLabel)}</h3>
                            {!Array.isArray(routes) ? <p className="mt-2 text-[12px]">{t("Routing plan unavailable")}</p> : routes.length === 0 ? <p className="mt-2 text-[12px]">{t("No Quote-owned legs")}</p> : (
                              <ol className="mt-2 grid gap-4">
                                {routes.map((route: unknown, routeIndex: number) => {
                                  const leg = route && typeof route === "object" && !Array.isArray(route) ? route as Record<string, unknown> : null
                                  return <li key={routeIndex} className="min-w-0">
                                    <h4 className="mb-1 text-[12px] font-medium text-[var(--md-ink)]">{t(`Leg ${routeIndex + 1}`)}</h4>
                                    {!leg ? <p className="text-[12px]">{t("Routing leg unavailable")}</p> : <dl className="grid gap-1.5 text-[12px] leading-5">
                                      {routingDetailFields.map(([field, label]) => <div key={field} className="min-w-0">
                                        <dt className="text-[var(--md-text)]">{t(label)}</dt>
                                        <dd data-i18n-skip dir="auto" className="whitespace-pre-wrap break-words text-[var(--md-ink)]">{leg[field] === null || leg[field] === undefined || leg[field] === "" ? t("Not recorded") : bookingQuoteSyncValue(leg[field], language)}</dd>
                                      </div>)}
                                    </dl>}
                                  </li>
                                })}
                              </ol>
                            )}
                          </section>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {difference.key.startsWith("cargo:") && difference.key.endsWith(":line") ? (
                    <details className="px-3 pb-3 sm:px-4">
                      <summary className="cursor-pointer rounded-[var(--md-radius-sm)] py-1 text-[12px] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]">
                        {t("Inspect all cargo details")}<span className="sr-only"> — {difference.cargoDescription || t(difference.label)}</span>
                      </summary>
                      <div className="mt-3 grid gap-4">
                        {cargoDetailFields.map(([field, label]) => (
                          <div key={field} className="grid min-w-0 gap-1.5">
                            <h3 className="text-[12px] font-medium text-[var(--md-ink)]">{t(label)}</h3>
                            <dl className="grid min-w-0 gap-3 text-[12px] leading-5 sm:grid-cols-3">
                              {([["Previous quote", difference.previousQuoteValue], ["Current booking", difference.bookingValue], ["New accepted quote", difference.newQuoteValue]] as const).map(([sourceLabel, cargo]) => (
                                <div key={sourceLabel} className="min-w-0">
                                  <dt className="text-[var(--md-text)]">{t(sourceLabel)}</dt>
                                  <dd data-i18n-skip dir="auto" className="whitespace-pre-wrap break-words text-[var(--md-ink)]">{bookingQuoteCargoFieldValue(cargo, field, language)}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  </div>
                )
              })}
            </div>
          </fieldset>

          {detailsDirty ? <p role="status" className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-status-amber-bg)] px-3 py-2 text-[11.5px] leading-5 text-[var(--md-status-amber-ink)]">{t("Save or discard your current booking edits before applying the accepted quote update.")}</p> : null}
          {error ? <p role="alert" className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-status-red-bg)] px-3 py-2 text-[11.5px] leading-5 text-[var(--md-status-red-ink)]">{error}</p> : null}
          {modeReviewError ? <p role="alert" className="mt-3 text-[12px] leading-5 text-[var(--md-status-red-ink)]">{t(modeReviewError)}</p> : null}
          {!review.reviewToken ? <p role="status" className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">{t("Refresh to load the current review. If it remains unavailable, the workspace review service needs updating before these changes can be applied.")}</p> : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy || refreshing || pendingModeFields !== null} className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px]" onClick={onRefresh}>{t(refreshing ? "Refreshing..." : "Refresh review")}</Button>
            <Button type="button" variant="ghost" disabled={controlsDisabled || availableDifferences.length === 0} className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px]" onClick={(event) => requestApply(availableDifferences.map((difference) => difference.key), event.currentTarget)}>{t(availableDifferences.length === remainingDifferences.length ? "Apply all" : "Apply available")}</Button>
            <Button type="button" disabled={controlsDisabled || selectedCount === 0} className="h-9 min-w-[132px] rounded-[var(--md-radius-lg)] px-3 text-[12px]" onClick={(event) => requestApply(availableDifferences.filter((difference) => selectedFields.has(difference.key)).map((difference) => difference.key), event.currentTarget)}>
              <Check className="size-3.5" strokeWidth={1.7} aria-hidden="true" />{t(busy ? "Applying..." : `Apply selected (${selectedCount})`)}
            </Button>
          </div>
          <p className="mt-2 text-end text-[10.5px] text-[var(--md-subtle)]">{t("Financial updates still follow your normal permissions. Every applied field is recorded in the audit trail.")}</p>
        </div>
      ) : null}

      <Dialog open={pendingModeFields !== null} onOpenChange={(open) => { if (!open) setPendingModeFields(null) }}>
        <DialogContent onCloseAutoFocus={(event) => {
          event.preventDefault()
          const trigger = applyTriggerRef.current
          if (trigger?.isConnected && !trigger.disabled) trigger.focus()
          else reviewHeadingRef.current?.focus()
        }} className="!w-[calc(100vw-32px)] !max-w-[480px] overflow-hidden rounded-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)]">
          <DialogHeader className="px-5 pb-3 pt-5 text-start">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)] shadow-[var(--md-shadow-line)]">
                <TriangleAlert className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-[16px] font-medium leading-6 text-[var(--md-ink)]">{t("Apply mode change?")}</DialogTitle>
                <DialogDescription className="mt-1.5 text-[12px] leading-5 text-[var(--md-text)]">
                  {t("Changing the transport mode can replace the active mode-specific booking details. The previous quote and booking information will remain in the audit history.")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mx-5 rounded-[var(--md-radius-lg)] bg-[var(--md-status-amber-bg)] px-3 py-2.5 text-[11.5px] leading-5 text-[var(--md-status-amber-ink)] shadow-[var(--md-shadow-line)]">
            {t("Review the new mode and related equipment, routing and cargo details before continuing.")}
            {pendingModeFields?.includes("routing") ? <p className="mt-2">{t("Shared transport references on legs changing mode will start blank. Their previous values remain in Booking audit history.")}</p> : null}
          </div>
          <DialogFooter className="mt-5 flex-col-reverse gap-2 bg-[var(--md-surface-soft)] px-5 py-4 shadow-[var(--md-stroke-top)] sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px]">{t("Keep current booking")}</Button>
            </DialogClose>
            <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px]" onClick={confirmModeChange}>{t("Apply mode change")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Surface>
  )
}

function BookingDetailTabPage({
  allocationEditor,
  allocationValidationAttempt,
  editable,
  activeTab,
  bookingLookups,
  currentUser,
  locationDirectory,
  onCargoChange,
  onCargoAdd,
  onCargoRemove,
  onContainerAdd,
  onContainerChange,
  onContainerRemove,
  customsError,
  customsReadiness,
  customsView,
  navigate,
  onCustomsViewChange,
  onWorkspaceSaved,
  onBookingChange,
  onDetailChange,
  onPartyChange,
  onOrganisationSelect,
  onLocationSelect,
  onRouteAdd,
  onRouteChange,
  onRouteLocationSelect,
  onRouteOrganisationSelect,
  onRouteRemove,
  record,
  workspace,
}: {
  allocationEditor?: ReactNode
  allocationValidationAttempt?: number
  editable: boolean
  activeTab: BookingDetailTab
  bookingLookups: QuoteWorkflowSources | null
  currentUser?: AuthUserSummary | null
  locationDirectory: readonly UnlocodeDirectoryRecord[]
  onCargoChange: (index: number, field: keyof BookingWorkflowCargo, value: string) => void
  onCargoAdd: () => void
  onCargoRemove: (index: number) => void
  onContainerAdd: (kind: BookingEquipmentKind) => void
  onContainerChange: (index: number, field: BookingContainerDraftField, value: string) => void
  onContainerRemove: (index: number) => void
  customsError: string | null
  customsReadiness: BookingCustomsReadiness | null
  customsView: BookingCustomsView
  navigate: (path: string) => void
  onCustomsViewChange: (view: BookingCustomsView) => void
  onWorkspaceSaved: (workspace: BookingWorkflowWorkspace) => Promise<void>
  onBookingChange: (field: keyof LiveBooking, value: string | boolean) => void
  onDetailChange: (field: string, value: string | boolean) => void
  onPartyChange: (role: string, field: keyof BookingWorkflowParty, value: string) => void
  onOrganisationSelect: (role: BookingOrganisationRole, organisation: QuoteOrganisationOption) => void
  onLocationSelect: (field: BookingLocationField, location: LocationOption) => void
  onRouteAdd: () => void
  onRouteChange: (index: number, field: keyof BookingWorkflowRoute, value: string) => void
  onRouteLocationSelect: (index: number, field: "origin" | "destination", location: LocationOption) => void
  onRouteOrganisationSelect: (index: number, organisation: QuoteOrganisationOption) => void
  onRouteRemove: (index: number) => void
  record: BookingDetailRecord
  workspace: BookingWorkflowWorkspace
}) {
  if (activeTab === "Details") return <BookingRecordDetails allocationEditor={allocationEditor} allocationValidationAttempt={allocationValidationAttempt} currentUser={currentUser} editable={editable} locationDirectory={locationDirectory} lookups={bookingLookups} onCargoChange={onCargoChange} onCargoAdd={onCargoAdd} onCargoRemove={onCargoRemove} onBookingChange={onBookingChange} onContainerAdd={onContainerAdd} onContainerChange={onContainerChange} onContainerRemove={onContainerRemove} onDetailChange={onDetailChange} onPartyChange={onPartyChange} onOrganisationSelect={onOrganisationSelect} onLocationSelect={onLocationSelect} onRouteAdd={onRouteAdd} onRouteChange={onRouteChange} onRouteLocationSelect={onRouteLocationSelect} onRouteOrganisationSelect={onRouteOrganisationSelect} onRouteRemove={onRouteRemove} record={record} workspace={workspace} />
  if (activeTab === "Documents") return <BookingDocumentsWorkspace record={record} />
  if (activeTab === "Customs") return <BookingCustomsWorkspace customsError={customsError} navigate={navigate} onWorkspaceSaved={onWorkspaceSaved} onViewChange={onCustomsViewChange} readiness={customsReadiness} record={record} view={customsView} />
  if (activeTab === "Finance") return <BookingFinanceWorkspace record={record} />
  if (activeTab === "Notes") return <LifecycleNotes subjectType="booking" subjectId={record.workspace?.booking.jobId ?? null} />
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
  currentUser,
}: {
  navigate: (path: string) => void
  bookingId?: string
  currentUser?: AuthUserSummary | null
}) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<BookingDetailTab>("Overview")
  const [record, setRecord] = useState<BookingDetailRecord | null>(null)
  const [draftBooking, setDraftBooking] = useState<LiveBooking | null>(null)
  const [draftWorkspace, setDraftWorkspace] = useState<BookingWorkflowWorkspace | null>(null)
  const [bookingLookups, setBookingLookups] = useState<QuoteWorkflowSources | null>(null)
  const [locationDirectory, setLocationDirectory] = useState<readonly UnlocodeDirectoryRecord[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading")
  const [savingDetails, setSavingDetails] = useState(false)
  const [allocationValidationAttempt, setAllocationValidationAttempt] = useState(0)
  const [customsReadiness, setCustomsReadiness] = useState<BookingCustomsReadiness | null>(null)
  const [customsView, setCustomsView] = useState<BookingCustomsView>("source")
  const [customsError, setCustomsError] = useState<string | null>(null)
  const [sendingToCustoms, setSendingToCustoms] = useState(false)
  const [quoteSyncReview, setQuoteSyncReview] = useState<BookingQuoteSyncReview | null>(null)
  const [selectedQuoteSyncFields, setSelectedQuoteSyncFields] = useState<Set<string>>(new Set())
  const [quoteSyncCheckState, setQuoteSyncCheckState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [quoteSyncError, setQuoteSyncError] = useState<string | null>(null)
  const [applyingQuoteSync, setApplyingQuoteSync] = useState(false)
  const [pendingDocumentType, setPendingDocumentType] = useState<"commercial_invoice" | "packing_list" | null>(null)
  const [uploadingDocumentType, setUploadingDocumentType] = useState<"commercial_invoice" | "packing_list" | null>(null)
  const customsHandoffKeyRef = useRef<string | null>(null)
  const bookingDocumentInputRef = useRef<HTMLInputElement | null>(null)

  function changeActiveTab(nextTab: BookingDetailTab) {
    setCustomsView("source")
    setActiveTab(nextTab)
  }

  function setQuoteSyncReviewState(nextReview: BookingQuoteSyncReview | null) {
    setQuoteSyncReview(nextReview)
    setSelectedQuoteSyncFields(new Set(
      nextReview?.differences
        .filter((difference) => !nextReview.appliedFields.includes(difference.key) && !difference.blockedReason && difference.recommendation === "apply" && !difference.requiresConfirmation && difference.key !== "mode" && !difference.conflict)
        .map((difference) => difference.key) ?? [],
    ))
    setQuoteSyncCheckState("ready")
    setQuoteSyncError(null)
  }

  async function refreshQuoteSyncReview(jobId: string) {
    setQuoteSyncCheckState("loading")
    try {
      setQuoteSyncReviewState(await getBookingQuoteSyncReview(jobId))
    } catch (reason) {
      setQuoteSyncCheckState("error")
      setQuoteSyncError(reason instanceof Error ? reason.message : t("Accepted quote updates could not be checked."))
    }
  }

  useEffect(() => {
    let cancelled = false
    const normalizedId = bookingId.trim().toUpperCase()

    setActiveTab("Overview")
    setCustomsView("source")
    setRecord(null)
    setDraftBooking(null)
    setDraftWorkspace(null)
    setQuoteSyncReview(null)
    setSelectedQuoteSyncFields(new Set())
    setQuoteSyncCheckState("loading")
    setQuoteSyncError(null)
    setLoadState("loading")

    void getBookingWorkflow(normalizedId).then((workspace) => {
      if (cancelled) return
      const canonicalReference = workspace.booking.bookingReference.trim().toUpperCase()
      if (canonicalReference && canonicalReference !== normalizedId) {
        navigate(getBookingDetailPath(canonicalReference))
        return
      }
      const nextRecord = bookingWorkspaceRecord(workspace)
      setRecord(nextRecord)
      setDraftBooking(nextRecord.booking)
      setDraftWorkspace(workspace)
      setLoadState("ready")
      setCustomsError(null)
      void getBookingQuoteSyncReview(workspace.booking.jobId).then((review) => {
        if (!cancelled) setQuoteSyncReviewState(review)
      }).catch((reason) => {
        if (cancelled) return
        setQuoteSyncCheckState("error")
        setQuoteSyncError(reason instanceof Error ? reason.message : t("Accepted quote updates could not be checked."))
      })
      void getBookingCustomsReadiness(workspace.booking.jobId).then((readiness) => {
        if (!cancelled) setCustomsReadiness(readiness)
      }).catch((reason) => {
        if (!cancelled) setCustomsError(reason instanceof Error ? reason.message : t("Customs readiness could not be checked."))
      })
    }).catch(() => {
      if (!cancelled) setLoadState("error")
    })

    return () => { cancelled = true }
  }, [bookingId])

  useEffect(() => {
    if (activeTab !== "Details" || (bookingLookups && locationDirectory.length)) return
    let cancelled = false
    void Promise.all([
      bookingLookups ? Promise.resolve(bookingLookups) : getQuoteSources(),
      locationDirectory.length ? Promise.resolve(locationDirectory) : loadUnlocodeDirectory(),
    ]).then(([sources, locations]) => {
      if (cancelled) return
      setBookingLookups(sources)
      setLocationDirectory(locations)
    }).catch(() => {
      // The finite selectors remain usable if an enrichment directory is temporarily unavailable.
    })
    return () => { cancelled = true }
  }, [activeTab, bookingLookups, locationDirectory])

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
  const detailsDirty = Boolean(
    draftBooking && JSON.stringify(draftBooking) !== JSON.stringify(loadedRecord.booking)
      || draftWorkspace && JSON.stringify(draftWorkspace) !== JSON.stringify(loadedRecord.workspace),
  )
  const visibleRecord = activeTab === "Details" && draftBooking
    ? { ...loadedRecord, booking: draftBooking, workspace: draftWorkspace ?? loadedRecord.workspace }
    : loadedRecord

  function updateDraftBooking(field: keyof LiveBooking, value: string | boolean) {
    setDraftBooking((current) => {
      if (!current) return current
      const next = { ...current, [field]: value } as LiveBooking
      if (field === "origin" || field === "destination") next.route = `${next.origin} → ${next.destination}`
      if (field === "status") next.tone = statusTone[next.status]
      return next
    })
  }

  function updateDraftDetail(field: string, value: string | boolean) {
    setDraftWorkspace((current) => {
      if (!current) return current
      if (field === "shipmentGoodsValueAmount" || field === "shipmentGoodsValueCurrency") {
        if (!current.booking.shipmentGoodsValue || typeof value !== "string") return current
        const key = field === "shipmentGoodsValueAmount" ? "amount" : "currency"
        return { ...current, booking: { ...current.booking, shipmentGoodsValue: { ...current.booking.shipmentGoodsValue, [key]: value } } }
      }
      return { ...current, booking: { ...current.booking, editableDetails: { ...current.booking.editableDetails, [field]: value } } }
    })
    if (field === "isFavourite" && typeof value === "boolean") {
      setDraftBooking((current) => current ? { ...current, isFavourite: value } : current)
    }
  }

  function updateDraftParty(role: string, field: keyof BookingWorkflowParty, value: string) {
    setDraftWorkspace((current) => {
      if (!current) return current
      const normalizedRole = role.toLowerCase()
      const parties = [...current.parties]
      const index = parties.findIndex((party) => party.role.toLowerCase() === normalizedRole)
      const existing = index >= 0 ? parties[index] : { role: normalizedRole, sequence: parties.length + 1 }
      const next = { ...existing, [field]: value, rawSnapshot: { ...existing.rawSnapshot, [field]: value } }
      if (index >= 0) parties[index] = next
      else parties.push(next)
      return { ...current, parties }
    })
  }

  function selectDraftOrganisation(role: BookingOrganisationRole, organisation: QuoteOrganisationOption) {
    const address = organisation.addresses[0]
    const contact = organisation.contacts[0]
    setDraftWorkspace((current) => {
      if (!current) return current
      let booking = { ...current.booking }
      let routes = current.routes
      let parties = current.parties

      if (role === "customer") {
        const hasPayer = current.parties.some((party) => party.role.toLowerCase() === "payer")
        booking = {
          ...booking,
          customerId: organisation.id,
          customerName: organisation.name,
          customerCode: organisation.code,
          ...(hasPayer ? {} : {
            customerDeadline: organisation.quoteTerms?.deadline || null,
            editableDetails: {
              ...booking.editableDetails,
              termsAndConditions: organisation.quoteTerms?.terms ?? "",
              subjectToTerms: organisation.quoteTerms?.subjectTo ?? "",
              customerNotes: organisation.quoteTerms?.notes ?? "",
              responseDeadline: organisation.quoteTerms?.deadline ?? "",
              customerTermsSource: organisation.name,
            },
          }),
        }
      } else if (role === "payer") {
        booking = {
          ...booking,
          customerDeadline: organisation.quoteTerms?.deadline || null,
          editableDetails: {
            ...booking.editableDetails,
            termsAndConditions: organisation.quoteTerms?.terms ?? "",
            subjectToTerms: organisation.quoteTerms?.subjectTo ?? "",
            customerNotes: organisation.quoteTerms?.notes ?? "",
            responseDeadline: organisation.quoteTerms?.deadline ?? "",
            customerTermsSource: organisation.name,
          },
        }
      } else if (role === "carrier") {
        booking = { ...booking, carrierId: organisation.id, carrierName: organisation.name, editableDetails: { ...booking.editableDetails, carrierName: organisation.name } }
        routes = current.routes.map((route, index) => index === 0 ? { ...route, carrierId: organisation.id } : route)
      } else if (role === "supplier") {
        booking = { ...booking, supplierId: organisation.id, supplierName: organisation.name, editableDetails: { ...booking.editableDetails, supplierName: organisation.name } }
      }

      if (role === "customer" || role === "payer" || role === "shipper" || role === "consignee") {
        const normalizedRole = role.toLowerCase()
        const index = current.parties.findIndex((party) => party.role.toLowerCase() === normalizedRole)
        const existing = index >= 0 ? current.parties[index] : { role: normalizedRole, sequence: current.parties.length + 1 }
        const selectedParty: BookingWorkflowParty = {
          ...existing,
          organisationId: organisation.id,
          addressId: address?.id ?? null,
          contactId: contact?.id ?? null,
          name: organisation.name,
          address: address?.address ?? "",
          contactName: contact?.name ?? "",
          email: contact?.email ?? contact?.emails[0] ?? "",
          phone: address?.phone ?? "",
          countryCode: address?.countryCode ?? "",
          identifierType: "account_code",
          identifierValue: organisation.code,
          rawSnapshot: {
            ...existing.rawSnapshot,
            organisationId: organisation.id,
            addressId: address?.id ?? null,
            contactId: contact?.id ?? null,
            name: organisation.name,
            address: address?.address ?? "",
            contactName: contact?.name ?? "",
            email: contact?.email ?? contact?.emails[0] ?? "",
          },
        }
        parties = [...current.parties]
        if (index >= 0) parties[index] = selectedParty
        else parties.push(selectedParty)
        if (role === "customer" && !parties.some((party) => party.role.toLowerCase() === "payer")) {
          parties.push({
            ...selectedParty,
            id: undefined,
            role: "payer",
            sequence: parties.length + 1,
            rawSnapshot: { ...selectedParty.rawSnapshot, role: "payer" },
          })
        }
      }

      return { ...current, booking, parties, routes }
    })
    if (role === "customer") setDraftBooking((current) => current ? { ...current, customer: organisation.name, customerRef: organisation.code || current.customerRef } : current)
    if (role === "carrier") setDraftBooking((current) => current ? { ...current, carrier: organisation.name } : current)
  }

  function selectDraftLocation(field: BookingLocationField, location: LocationOption) {
    const selectedValue = location.unlocode || location.place
    if (field === "via") {
      updateDraftDetail("routingVia", selectedValue)
      return
    }
    const routeIndex = field === "origin" ? 0 : Math.max((draftWorkspace?.routes.length ?? 1) - 1, 0)
    selectDraftRouteLocation(routeIndex, field, location)
  }

  function selectDraftRouteLocation(index: number, field: "origin" | "destination", location: LocationOption) {
    const selectedValue = location.unlocode || location.place
    setDraftWorkspace((current) => {
      if (!current) return current
      const routes = current.routes.length ? [...current.routes] : [{ order: 1, mode: current.booking.mode, isMainCarriage: true }]
      const existing = routes[index] ?? { order: index + 1, mode: current.booking.mode, isMainCarriage: index === 0 }
      const previousValue = field === "destination" ? existing.destinationUnlocode || existing.destination || "" : ""
      routes[index] = { ...existing, [field]: selectedValue, [`${field}Unlocode`]: location.unlocode }
      if (field === "destination" && routes[index + 1]) {
        const nextOrigin = routes[index + 1].originUnlocode || routes[index + 1].origin || ""
        if (!nextOrigin || nextOrigin === previousValue) routes[index + 1] = { ...routes[index + 1], origin: selectedValue, originUnlocode: location.unlocode }
      }
      const first = routes[0]
      const last = routes.at(-1) ?? first
      return {
        ...current,
        booking: {
          ...current.booking,
          origin: first.originUnlocode || first.origin || current.booking.origin,
          originUnlocode: first.originUnlocode || null,
          destination: last.destinationUnlocode || last.destination || current.booking.destination,
          destinationUnlocode: last.destinationUnlocode || null,
        },
        routes,
      }
    })
    setDraftBooking((current) => {
      if (!current) return current
      const next = { ...current }
      if (field === "origin" && index === 0) next.origin = selectedValue
      if (field === "destination" && index === Math.max((draftWorkspace?.routes.length ?? 1) - 1, 0)) next.destination = selectedValue
      next.route = `${next.origin} → ${next.destination}`
      return next
    })
  }

  function updateDraftCargo(index: number, field: keyof BookingWorkflowCargo, value: string) {
    setDraftWorkspace((current) => {
      if (!current || typeof value !== "string" || !Number.isInteger(index) || index < 0 || index >= current.cargo.length) return current
      const cargo = [...current.cargo]
      const existing = cargo[index]
      const safetyField = field === "isHazardous" || field === "isTemperatureControlled"
      if (safetyField && value !== "Yes" && value !== "No") return current
      // Preserve decimal and incomplete input exactly. The canonical save
      // validates numeric range/scale; invalid input must not become a clear.
      const nextValue = safetyField ? value === "Yes" : value
      const nextCargo = { ...existing, [field]: nextValue, cargoData: { ...existing.cargoData, [field]: safetyField ? nextValue : value } }
      if (safetyField || field === "knownCargo") {
        nextCargo.knownCargo = bookingCargoHandlingSummary(nextCargo, existing)
        nextCargo.cargoData.knownCargo = nextCargo.knownCargo
      }
      if (field === "declaredValue") {
        const currency = value.match(/\b[A-Za-z]{3}\b/)?.[0]?.toUpperCase()
        if (currency) nextCargo.declaredValueCurrency = currency
      }
      cargo[index] = nextCargo
      return { ...current, cargo }
    })
  }

  function addDraftCargo() {
    setDraftWorkspace((current) => current && current.cargo.length < 200
      ? { ...current, cargo: [...current.cargo, { lineNumber: current.cargo.length + 1, description: "", lengthUnit: "cm" }] }
      : current)
  }

  function removeDraftCargo(index: number) {
    setDraftWorkspace((current) => current
      ? { ...current, cargo: current.cargo.filter((_, lineIndex) => lineIndex !== index).map((line, lineIndex) => ({ ...line, lineNumber: lineIndex + 1 })) }
      : current)
  }

  function updateDraftRoute(index: number, field: keyof BookingWorkflowRoute, value: string) {
    setDraftWorkspace((current) => {
      if (!current || typeof value !== "string" || !Number.isInteger(index) || index < 0 || index >= Math.max(current.routes.length, 1)) return current
      const routes = current.routes.length ? [...current.routes] : [{ order: 1, mode: current.booking.mode, isMainCarriage: true }]
      const existing = routes[index] ?? { order: index + 1, mode: current.booking.mode, isMainCarriage: index === 0 }
      routes[index] = field === "mode"
        ? changeBookingRouteMode(existing, value, loadedRecord?.workspace?.routes.find((route) => Boolean(existing.id) && route.id === existing.id))
        : { ...existing, [field]: value, routeData: { ...existing.routeData, [field]: value } }
      return { ...current, routes }
    })
  }

  function selectDraftRouteOrganisation(index: number, organisation: QuoteOrganisationOption) {
    setDraftWorkspace((current) => {
      if (!current) return current
      const routes = current.routes.length ? [...current.routes] : [{ order: 1, mode: current.booking.mode, isMainCarriage: true }]
      const existing = routes[index] ?? { order: index + 1, mode: current.booking.mode, isMainCarriage: index === 0 }
      routes[index] = { ...existing, carrierId: organisation.id, routeData: { ...existing.routeData, carrierName: organisation.name } }
      return index === 0
        ? { ...current, booking: { ...current.booking, carrierId: organisation.id, carrierName: organisation.name }, routes }
        : { ...current, routes }
    })
    if (index === 0) setDraftBooking((current) => current ? { ...current, carrier: organisation.name } : current)
  }

  function addDraftRoute() {
    setDraftWorkspace((current) => {
      if (!current || current.routes.length >= 30) return current
      const routes = current.routes.length ? [...current.routes] : [{ order: 1, mode: current.booking.mode, isMainCarriage: true }]
      const previous = routes.at(-1)
      routes.push({
        order: routes.length + 1,
        status: "planned",
        mode: previous?.mode || current.booking.mode,
        origin: previous?.destinationUnlocode || previous?.destination || "",
        originUnlocode: previous?.destinationUnlocode || null,
        destination: "",
        destinationUnlocode: null,
        isMainCarriage: false,
        routeData: {},
      })
      return { ...current, routes }
    })
  }

  function removeDraftRoute(index: number) {
    setDraftWorkspace((current) => {
      if (!current || current.routes[index]?.id) return current
      return { ...current, routes: current.routes.filter((_, routeIndex) => routeIndex !== index).map((route, routeIndex) => ({ ...route, order: routeIndex + 1 })) }
    })
  }

  function updateDraftContainer(index: number, field: BookingContainerDraftField, value: string) {
    setDraftWorkspace((current) => {
      if (!current || !Number.isInteger(index) || index < 0 || !current.containers[index]) return current
      const containers = [...current.containers]
      const existing = containers[index]
      if (field === "packages" || field === "packageType" || field === "volumeCbm" || field === "sealNumber") {
        const data = { ...existing.data, [field]: value }
        containers[index] = { ...existing, [field]: value, data }
      } else if (["grossWeightKg", "tareWeightKg", "verifiedGrossMassKg", "reeferSetPoint"].includes(field)) {
        // Preserve incomplete/invalid input and all decimal digits. The server
        // validates it atomically; invalid text must never silently clear data.
        containers[index] = { ...existing, [field]: value.trim() === "" ? null : value }
      } else {
        containers[index] = { ...existing, [field]: value }
      }
      return { ...current, containers }
    })
  }

  function addDraftContainer(kind: BookingEquipmentKind) {
    setDraftWorkspace((current) => current ? {
      ...current,
      containers: [...current.containers, newBookingEquipment(kind)],
    } : current)
  }

  function removeDraftContainer(index: number) {
    setDraftWorkspace((current) => current ? {
      ...current,
      containers: current.containers.filter((_, containerIndex) => containerIndex !== index),
    } : current)
  }

  function discardDetails() {
    setDraftBooking(loadedRecord.booking)
    setDraftWorkspace(loadedRecord.workspace ?? null)
  }

  async function applySavedWorkspace(workspace: BookingWorkflowWorkspace) {
    const nextRecord = bookingWorkspaceRecord(workspace)
    setRecord(nextRecord)
    setDraftBooking(nextRecord.booking)
    setDraftWorkspace(workspace)
    try {
      setCustomsReadiness(await getBookingCustomsReadiness(workspace.booking.jobId))
      setCustomsError(null)
    } catch (reason) {
      setCustomsError(reason instanceof Error ? reason.message : t("Customs readiness could not be checked."))
    }
  }

  async function applyQuoteSyncFields(fields: string[], confirmModeChange = false) {
    if (!quoteSyncReview || !loadedRecord.workspace || applyingQuoteSync || detailsDirty || fields.length === 0) return
    setApplyingQuoteSync(true)
    setQuoteSyncError(null)
    try {
      const result = await applyBookingQuoteSync(loadedRecord.workspace.booking.jobId, quoteSyncReview.reviewId, fields, quoteSyncReview.reviewToken, confirmModeChange)
      await applySavedWorkspace(result.workspace)
      toast.success(t(result.status === "applied" ? "Accepted quote applied" : "Selected quote fields applied"), {
        description: t(result.status === "applied" ? "The accepted quote changes have been applied. Unselected operational details are preserved." : `${result.remainingFields} fields still need your review.`),
      })
      try {
        setQuoteSyncReviewState(await getBookingQuoteSyncReview(result.workspace.booking.jobId))
      } catch (reason) {
        setQuoteSyncCheckState("error")
        setQuoteSyncError(reason instanceof Error ? reason.message : t("The changes were applied, but the review could not be refreshed."))
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("The accepted quote update could not be applied.")
      setQuoteSyncError(message)
      toast.error(t("Quote update not applied"), { description: message })
    } finally {
      setApplyingQuoteSync(false)
    }
  }

  async function saveDetails() {
    if (!draftBooking || !draftWorkspace || !detailsDirty || savingDetails || !loadedRecord.workspace) return
    const incompleteCargoIndex = draftWorkspace.cargo.findIndex((line) => !line.description?.trim())
    if (incompleteCargoIndex >= 0) {
      toast.error(t("Goods description needed"), { description: t(`Add a description to cargo line ${incompleteCargoIndex + 1}, or remove that line before saving.`) })
      return
    }
    const workspace = draftWorkspace
    const allocationIssue = analyseCargoAllocations(workspace.cargo, workspace.containers, workspace.routes, workspace.cargoAllocationState?.allocations ?? []).issues[0]
    if (allocationIssue) {
      setAllocationValidationAttempt(attempt => attempt + 1)
      toast.error(t("Review cargo allocations"), { description: t(allocationIssue.message) })
      return
    }
    const route = workspace.routes[0] ?? {}
    const lastRoute = workspace.routes.at(-1) ?? route
    const modeCode = draftBooking.mode === "OCEAN" ? "sea" : draftBooking.mode.toLowerCase()
    const statusCode = workspace.booking.status || "open"
    const trackingStatus = draftBooking.status === "Delayed" ? "delayed" : draftBooking.status === "Exception" ? "exception" : "on_track"
    const valueMatch = draftBooking.value.match(/([A-Z]{3})?\s*(-?\d+(?:\.\d+)?)/i)
    const freightChargeCurrency = valueMatch?.[1]?.toUpperCase() || workspace.booking.freightChargeCurrency || null
    const freightChargeAmount = valueMatch?.[2] ? Number(valueMatch[2]) : workspace.booking.freightChargeAmount ?? null
    const shipper = workspace.parties.find((party) => party.role.toLowerCase() === "shipper")
    const consignee = workspace.parties.find((party) => party.role.toLowerCase() === "consignee")
    const editableDetails = asRecord(workspace.booking.editableDetails)
    const sourceQuote = bookingQuoteHandoff(workspace).quote
    const sourceOwnerId = recordText(sourceQuote, "salesOwnerId")
    const sourceOwnerName = bookingLookups?.users.find((user) => user.id === sourceOwnerId)?.name
      || recordText(sourceQuote, "salesOwner")
      || currentUser?.name
      || currentUser?.email
      || ""
    const effectiveEditableDetails = {
      ...editableDetails,
      quoteType: recordText(editableDetails, "quoteType") || draftBooking.direction,
      ownerName: recordText(editableDetails, "ownerName") || sourceOwnerName,
    }
    const incotermsText = Object.prototype.hasOwnProperty.call(editableDetails, "incoterms") ? recordText(editableDetails, "incoterms").trim() : ""
    const incotermParts = incotermsText ? incotermsText.split(/\s+/) : []
    const incoterm = incotermsText ? incotermParts.shift() ?? null : workspace.booking.incoterm ?? null
    const incotermLocation = incotermsText ? incotermParts.join(" ") || null : workspace.booking.incotermLocation ?? null
    const responseDeadline = Object.prototype.hasOwnProperty.call(editableDetails, "responseDeadline")
      ? recordText(editableDetails, "responseDeadline")
      : workspace.booking.customerDeadline ?? null
    const calculatedDirection = calculatedDirectionForBooking(workspace, bookingLookups)
    setSavingDetails(true)
    try {
      const savedWorkspace = await saveBookingWorkflow(workspace.booking.jobId, {
        ...bookingCargoAllocationPayload(workspace, loadedRecord.workspace),
        customerId: workspace.booking.customerId ?? null,
        carrierId: workspace.booking.carrierId ?? null,
        supplierId: workspace.booking.supplierId ?? null,
        status: statusCode,
        direction: calculatedDirection ?? draftBooking.direction,
        mode: modeCode,
        origin: draftBooking.origin,
        originUnlocode: route.originUnlocode ?? workspace.booking.originUnlocode ?? null,
        destination: draftBooking.destination,
        destinationUnlocode: lastRoute.destinationUnlocode ?? workspace.booking.destinationUnlocode ?? null,
        readyDate: draftBooking.departureDate || null,
        requiredDeliveryDate: draftBooking.arrivalDate || null,
        customerDeadline: responseDeadline || null,
        predictedDeliveryAt: draftBooking.arrivalAt || null,
        trackingStatus,
        currentLocation: draftBooking.currentLocation || null,
        internalNotes: workspace.booking.internalNotes ?? null,
        incoterm,
        incotermLocation,
        freightChargeAmount,
        freightChargeCurrency,
        ...(workspace.booking.shipmentGoodsValue ? { shipmentGoodsValue: workspace.booking.shipmentGoodsValue } : {}),
        collectionAddress: shipper?.address ?? workspace.booking.collectionAddress ?? null,
        deliveryAddress: consignee?.address ?? workspace.booking.deliveryAddress ?? null,
        editableDetails: effectiveEditableDetails,
        route: {
          ...route,
          mode: modeCode,
          origin: route.originUnlocode || route.origin || draftBooking.origin,
          destination: route.destinationUnlocode || route.destination || draftBooking.destination,
          plannedDepartureAt: route.plannedDepartureAt || draftBooking.departureAt || draftBooking.departureDate || null,
          plannedArrivalAt: route.plannedArrivalAt || draftBooking.arrivalAt || draftBooking.arrivalDate || null,
          vehicleRegistration: route.vehicleRegistration || null,
        },
        routes: workspace.routes.map((leg, index) => ({
          ...leg,
          order: index + 1,
          mode: bookingModeKey(leg.mode) === "ocean" ? "sea" : bookingModeKey(leg.mode || modeCode),
          isMainCarriage: Boolean(leg.isMainCarriage || index === 0),
        })),
        parties: workspace.parties,
        cargo: workspace.cargo,
        containers: workspace.containers,
      })
      if (draftBooking.isFavourite !== loadedRecord.booking.isFavourite) {
        await setLiveJobStarred(savedWorkspace.booking.bookingReference, draftBooking.isFavourite)
      }
      await applySavedWorkspace(savedWorkspace)
      toast.success(t("Booking changes saved"), { description: t("The booking workspace has been updated.") })
    } catch (reason) {
      toast.error(t("Booking could not be saved"), { description: reason instanceof Error ? reason.message : t("Your changes remain on screen. Try saving again.") })
    } finally {
      setSavingDetails(false)
    }
  }

  async function sendToCustoms() {
    if (!loadedRecord.workspace || !customsReadiness?.ready || sendingToCustoms) return
    customsHandoffKeyRef.current ??= crypto.randomUUID()
    setSendingToCustoms(true)
    try {
      const result = await sendBookingToCustoms(loadedRecord.workspace.booking.jobId, customsHandoffKeyRef.current)
      customsHandoffKeyRef.current = null
      toast.success(t(result.reused ? "Customs declaration reopened" : "Booking sent to Customs"), { description: result.reference })
      if (result.canOpen) {
        navigate(result.route)
      } else {
        setActiveTab("Customs")
        try {
          await applySavedWorkspace(await getBookingWorkflow(loadedRecord.workspace.booking.bookingReference))
        } catch {
          toast.warning(t("Booking sent; declaration status could not be refreshed"), { description: t("The Customs department still received the handoff.") })
        }
      }
    } catch (reason) {
      toast.error(t("Booking could not be sent to Customs"), { description: reason instanceof Error ? reason.message : t("Check the readiness list and try again.") })
    } finally {
      setSendingToCustoms(false)
    }
  }

  function requestDocumentAttachment(documentType: "commercial_invoice" | "packing_list") {
    if (uploadingDocumentType) return
    setPendingDocumentType(documentType)
    window.setTimeout(() => {
      const input = bookingDocumentInputRef.current
      if (!input) {
        setPendingDocumentType(null)
        return
      }
      input.value = ""
      input.click()
    }, 0)
  }

  async function uploadSelectedBookingDocument(file: File | undefined) {
    const documentType = pendingDocumentType
    if (!file || !documentType || !loadedRecord.workspace) {
      setPendingDocumentType(null)
      return
    }
    setPendingDocumentType(null)
    setUploadingDocumentType(documentType)
    try {
      await uploadBookingCustomsDocument(loadedRecord.workspace.booking.jobId, documentType, file)
      await applySavedWorkspace(await getBookingWorkflow(loadedRecord.workspace.booking.bookingReference))
      toast.success(t(documentType === "commercial_invoice" ? "Commercial invoice attached" : "Packing list attached"), { description: file.name })
    } catch (reason) {
      toast.error(t("Document could not be attached"), { description: reason instanceof Error ? reason.message : t("Try attaching the file again.") })
    } finally {
      setUploadingDocumentType(null)
    }
  }

  return (
    <main className="min-h-full bg-[var(--md-analytics-bg)] px-4 py-4 text-[var(--md-ink)] sm:px-5">
      <div className="grid w-full gap-2">
        <BookingDetailHeader
          activeTab={activeTab}
          customsReadiness={customsReadiness}
          detailsDirty={detailsDirty}
          uploadingDocumentType={uploadingDocumentType}
          onAttachDocument={requestDocumentAttachment}
          onDiscardDetails={discardDetails}
          onReviewCustoms={() => {
            setCustomsView("review")
            setActiveTab("Customs")
          }}
          onSaveDetails={() => void saveDetails()}
          onSendToCustoms={() => void sendToCustoms()}
          onTabChange={changeActiveTab}
          record={visibleRecord}
          sendingToCustoms={sendingToCustoms}
        />
        {quoteSyncReview ? (
          <BookingQuoteSyncReviewPanel
            busy={applyingQuoteSync}
            refreshing={quoteSyncCheckState === "loading"}
            detailsDirty={detailsDirty}
            expanded={activeTab === "Details"}
            error={quoteSyncError}
            onApply={(fields, confirmModeChange) => void applyQuoteSyncFields(fields, confirmModeChange)}
            onOpenDetails={() => changeActiveTab("Details")}
            onRefresh={() => void refreshQuoteSyncReview(loadedRecord.workspace!.booking.jobId)}
            onToggle={(field, checked) => setSelectedQuoteSyncFields((current) => {
              const next = new Set(current)
              if (checked) next.add(field)
              else next.delete(field)
              return next
            })}
            review={quoteSyncReview}
            selectedFields={selectedQuoteSyncFields}
          />
        ) : quoteSyncCheckState === "error" ? (
          <Surface padding="none" className="flex flex-col gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-status-red-bg)] px-4 py-3 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div className="flex min-w-0 items-start gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-status-red-ink)]" strokeWidth={1.5} aria-hidden="true" />
              <div><p className="text-[12px] font-medium text-[var(--md-status-red-ink)]">{t("Accepted quote updates could not be checked")}</p><p className="mt-0.5 text-[11.5px] text-[var(--md-text)]">{quoteSyncError}</p></div>
            </div>
            <Button type="button" variant="ghost" className="h-9 shrink-0 rounded-[var(--md-radius-lg)] px-3 text-[12px]" onClick={() => void refreshQuoteSyncReview(loadedRecord.workspace!.booking.jobId)}>{t("Try again")}</Button>
          </Surface>
        ) : null}
        <div
          id={bookingTabPanelId(activeTab)}
          role="tabpanel"
          aria-labelledby={bookingTabId(activeTab)}
          className="relative min-h-px overflow-x-clip"
          data-booking-tab-panel
        >
          <BookingDetailTabPage
            editable={!savingDetails && !applyingQuoteSync}
            allocationValidationAttempt={allocationValidationAttempt}
            allocationEditor={draftWorkspace && (draftWorkspace.cargoAllocationState || draftWorkspace.containers.length) ? <CargoAllocationEditor
              cargo={draftWorkspace.cargo} equipment={draftWorkspace.containers} routes={draftWorkspace.routes}
              allocations={draftWorkspace.cargoAllocationState?.allocations}
              legacyLinks={draftWorkspace.cargoAllocationState?.legacyUnquantifiedLinks}
              editable={!savingDetails && !applyingQuoteSync} validationAttempt={allocationValidationAttempt}
              onChange={allocations => {
                if (savingDetails || applyingQuoteSync) return
                setDraftWorkspace(current => current?.cargoAllocationState ? { ...current, cargoAllocationState: { ...current.cargoAllocationState, allocations } } : current)
              }}
            /> : undefined}
            activeTab={activeTab}
            bookingLookups={bookingLookups}
            currentUser={currentUser}
            locationDirectory={locationDirectory}
            onCargoChange={updateDraftCargo}
            onCargoAdd={addDraftCargo}
            onCargoRemove={removeDraftCargo}
            onContainerAdd={addDraftContainer}
            onContainerChange={updateDraftContainer}
            onContainerRemove={removeDraftContainer}
            customsError={customsError}
            customsReadiness={customsReadiness}
            customsView={customsView}
            navigate={navigate}
            onCustomsViewChange={setCustomsView}
            onBookingChange={updateDraftBooking}
            onDetailChange={updateDraftDetail}
            onPartyChange={updateDraftParty}
            onOrganisationSelect={selectDraftOrganisation}
            onLocationSelect={selectDraftLocation}
            onRouteAdd={addDraftRoute}
            onRouteChange={updateDraftRoute}
            onRouteLocationSelect={selectDraftRouteLocation}
            onRouteOrganisationSelect={selectDraftRouteOrganisation}
            onRouteRemove={removeDraftRoute}
            onWorkspaceSaved={applySavedWorkspace}
            record={visibleRecord}
            workspace={draftWorkspace ?? loadedRecord.workspace!}
          />
        </div>
        <input
          ref={bookingDocumentInputRef}
          className="sr-only"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx"
          aria-label={t("Attach document")}
          onChange={(event) => { void uploadSelectedBookingDocument(event.target.files?.[0]); event.currentTarget.value = "" }}
        />
      </div>
    </main>
  )
}
