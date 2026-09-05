import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import "@/quotes-transfer.css"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import {
  AiEditing,
  AiBeautify,
  BrainCircuit,
  Check,
  CheckCircle2,
  CalendarDays,
  ChartAnalysis,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  Gauge,
  Info,
  ListChecks,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Maximize2,
  MoreHorizontal,
  Plus,
  Printer,
  ReceiptText,
  Radar,
  Route,
  Search,
  Scissors,
  Send,
  Trash2,
  TriangleAlert,
  Type,
  WandSparkles,
  X,
} from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { DocumentWorkspace } from "@/components/multideck/document-workspace"
import { AuditWorkspace, type QuoteAuditRecord } from "@/components/multideck/audit-workspace"
import {
  UnifiedQuoteChargesWorkspace,
  type QuoteChargeCurrency,
  type QuoteChargeExchangeRate,
  type QuoteChargeParty,
  type UnifiedQuoteChargeRow,
} from "@/components/multideck/unified-quote-charges-workspace"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { AiPromptMorph } from "@/components/multideck/ai-prompt-morph"
import { MailProviderMark } from "@/components/multideck/mailbox-provider-switch"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { MultideckDatePicker } from "@/components/multideck/date-picker"
import { CopyFeedbackTransition, CopyStatusIcon } from "@/components/multideck/copyable-field"
import { AutoPopulatedInput, matchesAutoPopulation } from "@/components/multideck/auto-populated-field"
import type { AuthUserSummary } from "@/lib/auth-user"
import { getApiTeamUsersByIds } from "@/lib/api"
import { getQuoteEditorPresence, type QuoteEditorPresence } from "@/lib/admin-audit-api"
import { createProfilePhotoSignedUrl, createProfilePhotoSignedUrls } from "@/lib/profile-photo"
import { authSupabase, supabase } from "@/lib/supabase"
import {
  loadUnlocodeDirectory,
  loadUnlocodeDirectoryMetadata,
  unlocodeKind,
  type UnlocodeDirectoryRecord,
} from "@/lib/unlocode-directory"
import { LifecycleNotes } from "@/components/multideck/lifecycle-notes"
import {
  AmountCurrencyField,
  CargoCharacteristicsField,
  CompactCombobox,
  CompactFieldRow,
  CompactFieldShell,
  CompactSectionShell,
  LocationFields,
  NumberUnitField,
  RecurrenceBuilder,
  type CompactComboboxOption,
} from "@/components/multideck/quote-details/quote-detail-fields"
import {
  EMPTY_CARGO_CHARACTERISTICS,
  EMPTY_HAZARDOUS_DETAILS,
  EMPTY_RECURRENCE,
  getIncotermDefinition,
  INCOTERMS_2020,
  type CargoCharacteristics,
  type HazardousDetails,
  type LocationOption,
  type LocationValue,
  type RecurrenceValue,
} from "@/components/multideck/quote-details/quote-detail-model"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { calculateQuoteFreightDirection } from "@/lib/freight-direction"
import { textareaSelectionAnchor, type TextareaSelection, type TextareaSelectionAnchor } from "@/lib/textarea-selection"
import { formatQuoteLossReason, quoteCustomerDeclineReasons, quoteLossReasons } from "@/lib/quote-loss-reasons"
import { listMailboxes, type Mailbox } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"
import {
  getFinanceExchangeRates,
  listFinanceCurrencies,
  type ApiFinanceCurrency,
  type ApiFinanceExchangeRate,
} from "@/lib/finance-api"
import { useLanguage } from "@/i18n/language-provider"
import { systemPeople, type StatusTone } from "@/data/operational-data"
import { quoteRegisterRecords, type QuoteRegisterRecord } from "@/data/quote-register-data"
import { getSalesQuote } from "@/lib/quote-api"
import {
  getQuoteSources,
  getQuoteIssueReadiness,
  getQuoteIssueRecipients,
  getQuoteWorkflow,
  issueQuoteWorkflow,
  openQuoteWorkflow,
  prepareQuoteIssueEmail,
  previewQuoteIssueEmail,
  refineQuoteIssueEmail,
  refreshQuoteIntelligence,
  saveQuoteWorkflow,
  subscribeQuoteIntelligence,
  transitionQuoteWorkflow,
  type QuoteIntelligenceRecentQuote,
  type QuoteIntelligenceSnapshot,
  type QuoteIssueReadiness,
  type QuoteDeliveryMode,
  type QuoteIssueExpiryPreset,
  type QuoteIssueRecipient,
  type QuoteIssueRecipientInput,
  type QuoteOrganisationOption,
  type QuoteSavePayload,
  type QuoteWorkflowCharge,
  type QuoteWorkflowSources,
  type QuoteWorkflowVersion,
  type QuoteWorkflowWorkspace,
} from "@/lib/quote-workflow-api"

type QuoteParty = {
  label: string
  code: string
  name: string
  address: string[]
  tone?: StatusTone
}

type QuoteCurrency = "GBP" | "USD" | "EUR" | "JPY" | "AUD" | "CAD"
type QuoteWorkspaceTab = "overview" | "details" | "charges" | "documents" | "notes" | "audit"

const quoteWorkspaceTabs: QuoteWorkspaceTab[] = ["overview", "details", "charges", "documents", "notes", "audit"]

const freightPackageTypeOptions = [
  { id: "PX", value: "Pallets", label: "Pallets", description: "PX · Standard freight pallets", keywords: ["PLT", "pallet"] },
  { id: "CT", value: "Cartons", label: "Cartons", description: "CT · Cartons", keywords: ["CTN", "carton"] },
  { id: "BX", value: "Boxes", label: "Boxes", description: "BX · Boxes", keywords: ["BOX", "box"] },
  { id: "CR", value: "Crates", label: "Crates", description: "CR · Crates", keywords: ["CRT", "crate"] },
  { id: "CS", value: "Cases", label: "Cases", description: "CS · Cases", keywords: ["CAS", "case"] },
  { id: "PK", value: "Packages", label: "Packages", description: "PK · General packages", keywords: ["PKG", "package"] },
  { id: "PP", value: "Pieces", label: "Pieces", description: "PP · Loose pieces", keywords: ["PCS", "piece"] },
  { id: "bags", value: "Bags", label: "Bags", description: "Bags and flexible packaging", keywords: ["BAG", "bag"] },
  { id: "sacks", value: "Sacks", label: "Sacks", description: "Sacks", keywords: ["SAK", "sack"] },
  { id: "DR", value: "Drums", label: "Drums", description: "DR · Drums", keywords: ["DRM", "drum"] },
  { id: "barrels", value: "Barrels", label: "Barrels", description: "Barrels", keywords: ["BRL", "barrel"] },
  { id: "bundles", value: "Bundles", label: "Bundles", description: "Bundled cargo", keywords: ["BDL", "bundle", "bunch"] },
  { id: "rolls", value: "Rolls", label: "Rolls", description: "Rolled goods", keywords: ["ROL", "roll"] },
  { id: "reels", value: "Reels", label: "Reels", description: "Cable, wire or material reels", keywords: ["REL", "reel"] },
  { id: "ibcs", value: "IBCs", label: "IBCs", description: "Intermediate bulk containers", keywords: ["IBC", "bulk container"] },
  { id: "totes", value: "Totes", label: "Totes", description: "Reusable tote containers", keywords: ["TOT", "tote"] },
  { id: "ulds", value: "ULDs", label: "ULDs", description: "Air cargo unit load devices", keywords: ["ULD", "air container", "air pallet"] },
  { id: "loose", value: "Loose / unpackaged", label: "Loose / unpackaged", description: "Cargo without outer packaging", keywords: ["LSE", "loose", "unpacked"] },
] as const satisfies readonly CompactComboboxOption[]

const commonFreightPackageTypeOptions = freightPackageTypeOptions.slice(0, 7)
const freightPackageTypeSelectOptions = freightPackageTypeOptions.map((option) => ({
  value: option.value,
  label: `${option.value} · ${option.description}`,
}))

const incotermNotSuppliedValue = "N/A"
const incotermOptions = [
  ...INCOTERMS_2020.map((term) => ({ value: term.code, label: `${term.code} · ${term.name}` })),
  { value: incotermNotSuppliedValue, label: "N/A · Not supplied / not applicable" },
] as const

function quoteIncotermDisplay(value: string | undefined, namedPlace?: string) {
  if (value?.trim().toUpperCase() === incotermNotSuppliedValue) return "Not supplied / not applicable"
  return [value, namedPlace].filter(Boolean).join(" · ")
}

const seaContainerTypeOptions = [
  { id: "20GP", value: "20GP", label: "20GP", description: "20 ft standard dry container", keywords: ["20DV", "20DC", "twenty foot"] },
  { id: "40GP", value: "40GP", label: "40GP", description: "40 ft standard dry container", keywords: ["40DV", "40DC", "forty foot"] },
  { id: "40HC", value: "40HC", label: "40HC", description: "40 ft high-cube container", keywords: ["40HQ", "high cube"] },
  { id: "45HC", value: "45HC", label: "45HC", description: "45 ft high-cube container", keywords: ["45HQ", "high cube"] },
  { id: "20RF", value: "20RF", label: "20RF", description: "20 ft refrigerated container", keywords: ["20RE", "reefer"] },
  { id: "40RF", value: "40RF", label: "40RF", description: "40 ft refrigerated high-cube container", keywords: ["40RH", "reefer"] },
  { id: "20OT", value: "20OT", label: "20OT", description: "20 ft open-top container", keywords: ["open top"] },
  { id: "40OT", value: "40OT", label: "40OT", description: "40 ft open-top container", keywords: ["open top"] },
  { id: "20FR", value: "20FR", label: "20FR", description: "20 ft flat-rack container", keywords: ["flat rack"] },
  { id: "40FR", value: "40FR", label: "40FR", description: "40 ft flat-rack container", keywords: ["flat rack"] },
] as const satisfies readonly CompactComboboxOption[]

const LockPasswordSolidRoundedIcon = [["path", {
  d: "M12 3.25C10.067 3.25 8.5 4.817 8.5 6.75V8.31016C9.61773 8.27048 10.7654 8.25 12 8.25C13.2346 8.25 14.3823 8.27048 15.5 8.31016V6.75C15.5 4.817 13.933 3.25 12 3.25ZM6.5 6.75V8.52712C4.93233 9.00686 3.74925 10.3861 3.52452 12.0552C3.37636 13.1556 3.25 14.3118 3.25 15.5C3.25 16.6882 3.37636 17.8444 3.52452 18.9448C3.79609 20.9618 5.46716 22.5555 7.52522 22.6501C8.95364 22.7158 10.4042 22.75 12 22.75C13.5958 22.75 15.0464 22.7158 16.4748 22.6501C18.5328 22.5555 20.2039 20.9618 20.4755 18.9448C20.6236 17.8444 20.75 16.6882 20.75 15.5C20.75 14.3118 20.6236 13.1556 20.4755 12.0552C20.2508 10.3861 19.0677 9.00686 17.5 8.52712V6.75C17.5 3.71243 15.0376 1.25 12 1.25C8.96243 1.25 6.5 3.71243 6.5 6.75ZM17 15.4902C17 14.9379 16.5523 14.4902 16 14.4902C15.4477 14.4902 15 14.9379 15 15.4902V15.5002C15 16.0525 15.4477 16.5002 16 16.5002C16.5523 16.5002 17 16.0525 17 15.5002V15.4902ZM12 14.4902C12.5523 14.4902 13 14.9379 13 15.4902V15.5002C13 16.0525 12.5523 16.5002 12 16.5002C11.4477 16.5002 11 16.0525 11 15.5002V15.4902C11 14.9379 11.4477 14.4902 12 14.4902ZM9 15.4902C9 14.9379 8.55228 14.4902 8 14.4902C7.44772 14.4902 7 14.9379 7 15.4902V15.5002C7 16.0525 7.44772 16.5002 8 16.5002C8.55228 16.5002 9 16.0525 9 15.5002V15.4902Z",
  fill: "currentColor",
  fillRule: "evenodd",
  clipRule: "evenodd",
  key: "lock-password-solid-rounded",
}]] as const satisfies IconSvgElement

function LockedFieldTooltip({ children }: { children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <Tooltip delayDuration={220}>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          aria-label={t("Why this field is locked")}
          className="relative rounded-[var(--md-radius-lg)] outline-none [transition:box-shadow_var(--md-motion)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]"
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={7}
        className="max-w-[17.5rem] items-start gap-2 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start shadow-[var(--md-shadow-lift)]"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-white">
          <HugeiconsIcon icon={LockPasswordSolidRoundedIcon} className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-medium leading-4">{t("Locked to payer account")}</span>
          <span className="mt-0.5 block text-[10.5px] leading-4 opacity-75">{t("This value comes from the selected payer's account record. Update it there to keep every quote consistent.")}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

function quoteWorkspaceTabStorageKey(quoteId?: string) {
  return `multideck:quote-workspace-tab:${quoteId?.trim().toLowerCase() || "new"}`
}

function initialQuoteWorkspaceTab(quoteId: string | undefined, isNewQuote: boolean): QuoteWorkspaceTab {
  if (isNewQuote) return "details"
  if (typeof window === "undefined") return "overview"
  const stored = window.sessionStorage.getItem(quoteWorkspaceTabStorageKey(quoteId))
  return quoteWorkspaceTabs.includes(stored as QuoteWorkspaceTab) ? stored as QuoteWorkspaceTab : "overview"
}
const quoteIssueExpiryPresets: Array<{ value: QuoteIssueExpiryPreset; label: string }> = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "28", label: "28 days" },
  { value: "90", label: "90 days" },
  { value: "never", label: "Never" },
]
const quoteDeliveryModes = ["standard", "simple"] as const satisfies readonly QuoteDeliveryMode[]

function validEmailAddress(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())
}

type JobRoe = {
  currency: Exclude<QuoteCurrency, "GBP">
  baseRate: number
  costRate: number
  revenueRate: number
}

type QuoteCharge = {
  id?: string
  code: string
  description: string
  creditor: string
  supplierId?: string | null
  customerId?: string | null
  costCurrency: QuoteCurrency
  costAmount: number
  localCost: number
  sellCurrency: QuoteCurrency
  sellAmount: number
  localSell: number
  costExchange: number
  sellExchange: number
  costRoeSource: "job" | "override"
  sellRoeSource: "job" | "override"
  calculationBasis?: string | null
  quantity?: number | null
  department: string
  internalNotes?: string
  additionalDetail?: string
}

type SavedPartyAddress = {
  id: string
  address: string
  type: "Main office" | "Collection address" | "Delivery address"
}

type QuoteCarrierOptionDraft = {
  id: string
  carrierId: string
  carrierName: string
  carrierOffice: string
  reference: string
  serviceLevel: string
  rateSource: string
  status: "draft" | "prepared" | "received"
}

const carrierServiceLevels = ["Economy", "Standard", "Express", "Direct", "Via hub"] as const

function carrierServiceTone(serviceLevel: string): StatusTone {
  return ({
    Economy: "blue",
    Standard: "teal",
    Express: "amber",
    Direct: "green",
    "Via hub": "purple",
  } as Record<string, StatusTone>)[serviceLevel] ?? "neutral"
}

type QuoteSupplierOptionDraft = {
  id: string
  supplierId: string
  supplierName: string
  supplierOffice: string
  contact: string
  carriers: QuoteCarrierOptionDraft[]
}

function blankCarrierOption(): QuoteCarrierOptionDraft {
  return {
    id: `carrier-${crypto.randomUUID()}`,
    carrierId: "",
    carrierName: "",
    carrierOffice: "",
    reference: "",
    serviceLevel: "Standard",
    rateSource: "Manual",
    status: "draft",
  }
}

function blankSupplierOption(): QuoteSupplierOptionDraft {
  return {
    id: `supplier-${crypto.randomUUID()}`,
    supplierId: "",
    supplierName: "",
    supplierOffice: "",
    contact: "",
    carriers: [blankCarrierOption()],
  }
}

type QuoteRecord = {
  id: string
  status: string
  statusTone: StatusTone
  localRef?: string
  quoteType?: string
  source?: string
  workflowStatus?: string
  priority?: string
  holdReason?: string
  customerPO?: string
  shipperReference?: string
  consigneeReference?: string
  agentReference?: string
  carrierReference?: string
  docsStatus?: string
  workflow?: string
  revisionReason?: string
  copiedFromQuoteId?: string
  copiedFromQuoteReference?: string
  copyReason?: "customer_changed" | "repeat_quote"
  createdAt?: string
  customer: string
  customerId?: string
  clientCode?: string
  contactId?: string
  customerAddress?: string
  customerContact?: string
  customerEmail?: string
  payerOrgId?: string
  payerCode?: string
  payerName?: string
  payerAddress?: string
  payerContact?: string
  payerEmail?: string
  shipperCode?: string
  shipperOrgId?: string
  shipperName?: string
  shipperAddress?: string
  shipperContact?: string
  shipperEmail?: string
  shipperAddressOverride?: string
  collectionAddress?: string
  consigneeCode?: string
  consigneeOrgId?: string
  consigneeName?: string
  consigneeAddress?: string
  consigneeContact?: string
  consigneeEmail?: string
  consigneeAddressOverride?: string
  deliveryAddress?: string
  agentOrgId?: string
  agentCode?: string
  agentName?: string
  agentAddress?: string
  agentContact?: string
  agentEmail?: string
  route: string
  mode: string
  container: string
  containerRequestsJson?: string
  incoterm: string
  incotermPlace?: string
  origin: string
  originCountry?: string
  originTown?: string
  originUnlocode?: string
  destination: string
  destinationCountry?: string
  destinationTown?: string
  destinationUnlocode?: string
  via: string
  routingLegsJson?: string
  startDate?: string
  endDate?: string
  estimatedDeparture?: string
  estimatedArrival?: string
  deadline?: string
  validity: string
  direction?: string
  serviceLevel?: string
  rateSource?: string
  hblMode?: string
  transitDays?: string
  transitUnit?: string
  frequency?: string
  frequencyInterval?: string
  frequencyUnit?: string
  frequencyTimesPerMonth?: string
  frequencyCount?: string
  frequencyNotes?: string
  shipmentType?: string
  carrier?: string
  carrierId?: string
  carrierOffice?: string
  supplier?: string
  supplierId?: string
  supplierOffice?: string
  supplierOptionsJson?: string
  branch?: string
  officeId?: string
  department?: string
  departmentId?: string
  salesRep?: string
  salesOwnerId?: string
  opsRep?: string
  jobStatus?: string
  goodsValue?: string
  goodsValueCurrency?: string
  insuranceValue?: string
  insuranceValueCurrency?: string
  entries?: string
  invoiceLines?: string
  commodity?: string
  co2e?: string
  knownCargo?: string
  cargoCharacteristics?: string
  hazardousUnNumber?: string
  hazardousClass?: string
  hazardousPackingGroup?: string
  hazardousShippingName?: string
  hazardousEmergencyContact?: string
  hazardousNetWeightKg?: string
  hazardousMarinePollutant?: string
  hazardousLimitedQuantity?: string
  hazardousNotes?: string
  packageQuantity?: string
  packageType?: string
  grossWeightKg?: string
  volumeCbm?: string
  chargeableWeightKg?: string
  collectionRequired?: string
  deliveryRequired?: string
  customsIncluded?: string
  originCustomsAgentId?: string
  originCustomsAgentName?: string
  destinationCustomsAgentId?: string
  destinationCustomsAgentName?: string
  subjectToTerms?: string
  customerTermsSource?: string
  terms?: string
  customerNotes?: string
  internalNotes?: string
  fmcTid?: string
  margin: string
  profit: number
  cost: number
  revenue: number
  currency: QuoteCurrency | ""
  baseRoe?: number
  costRoe?: number
  revenueRoe?: number
  jobRoes?: JobRoe[]
  details?: Record<string, string>
}

type PendingCustomerOrganisationChange = {
  organisation: QuoteOrganisationOption
  patch: Partial<QuoteRecord>
}

type QuoteRoutingLeg = {
  id: string
  mode: string
  origin: LocationValue
  destination: LocationValue
  estimatedDeparture: string
  estimatedArrival: string
  carrierId: string
  carrierName: string
  serviceLevel: string
}

type QuoteContainerRequest = {
  id: string
  quantity: string
  type: string
}

function quoteContainerRequests(value: string | undefined, fallback: string | undefined): QuoteContainerRequest[] {
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        const requests = parsed.slice(0, 20).flatMap((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return []
          const record = item as Record<string, unknown>
          const quantity = typeof record.quantity === "number" ? String(record.quantity) : typeof record.quantity === "string" ? record.quantity : ""
          const type = typeof record.type === "string" ? record.type : ""
          return [{
            id: typeof record.id === "string" && record.id ? record.id : `container-${index + 1}`,
            quantity,
            type,
          }]
        })
        if (requests.length) return requests
      }
    } catch {
      // Older quotes store one readable container summary instead of rows.
    }
  }

  const requests = (fallback ?? "").split(/[;\n]+/u).flatMap((item, index) => {
    const trimmed = item.trim()
    if (!trimmed) return []
    const match = trimmed.match(/^(\d+)\s*[x×]\s*(.+)$/iu)
    return [{
      id: `container-${index + 1}`,
      quantity: match?.[1] ?? "1",
      type: (match?.[2] ?? trimmed).trim(),
    }]
  }).slice(0, 20)
  return requests.length ? requests : [{ id: "container-1", quantity: "", type: "" }]
}

function quoteContainerSummary(requests: QuoteContainerRequest[]) {
  return requests.flatMap((request) => {
    const quantity = Number(request.quantity)
    const type = request.type.trim()
    return Number.isInteger(quantity) && quantity > 0 && type ? [`${quantity} × ${type}`] : []
  }).join("; ")
}

function quoteRoutingLegs(value: string | undefined): QuoteRoutingLeg[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 30).flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      const location = (candidate: unknown): LocationValue => {
        const source = candidate && typeof candidate === "object" && !Array.isArray(candidate)
          ? candidate as Record<string, unknown>
          : {}
        return {
          countryCode: typeof source.countryCode === "string" ? source.countryCode : "",
          countryName: typeof source.countryName === "string" ? source.countryName : "",
          place: typeof source.place === "string" ? source.place : "",
          unlocode: typeof source.unlocode === "string" ? source.unlocode : "",
        }
      }
      return [{
        id: typeof record.id === "string" && record.id ? record.id : `route-${index + 1}`,
        mode: typeof record.mode === "string" ? record.mode : "",
        origin: location(record.origin),
        destination: location(record.destination),
        estimatedDeparture: typeof record.estimatedDeparture === "string" ? record.estimatedDeparture : "",
        estimatedArrival: typeof record.estimatedArrival === "string" ? record.estimatedArrival : "",
        carrierId: typeof record.carrierId === "string" ? record.carrierId : "",
        carrierName: typeof record.carrierName === "string" ? record.carrierName : "",
        serviceLevel: typeof record.serviceLevel === "string" ? record.serviceLevel : "",
      }]
    })
  } catch {
    return []
  }
}

function quoteRoutingLegsValue(legs: QuoteRoutingLeg[]) {
  return legs.length > 1 ? JSON.stringify(legs) : ""
}

function quoteCountryFlag(countryCode: string) {
  const code = countryCode.trim().toLocaleUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ""
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
}

type QuotePageVariant = "operator" | "ai" | "cargowise"

function supplierOptionsFromQuote(quote: QuoteRecord): QuoteSupplierOptionDraft[] {
  if (quote.supplierOptionsJson) {
    try {
      const parsed = JSON.parse(quote.supplierOptionsJson) as QuoteSupplierOptionDraft[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((supplier) => ({
          ...supplier,
          carriers: Array.isArray(supplier.carriers) && supplier.carriers.length ? supplier.carriers : [blankCarrierOption()],
        }))
      }
    } catch {
      // Preserve the quote's legacy supplier fields when an old snapshot is malformed.
    }
  }

  if (quote.supplier || quote.carrier) {
    return [{
      id: "supplier-primary",
      supplierId: quote.supplierId ?? "",
      supplierName: quote.supplier ?? "",
      supplierOffice: quote.supplierOffice ?? "",
      contact: "",
      carriers: [{
        id: "carrier-primary",
        carrierId: quote.carrierId ?? "",
        carrierName: quote.carrier ?? "",
        carrierOffice: quote.carrierOffice ?? "",
        reference: quote.carrierReference ?? "",
        serviceLevel: quote.serviceLevel ?? "Standard",
        rateSource: quote.rateSource ?? "Manual",
        status: "draft",
      }],
    }]
  }

  return [blankSupplierOption()]
}

function cargoCharacteristicsFromQuote(quote: QuoteRecord): CargoCharacteristics {
  const selected = new Set((quote.cargoCharacteristics ?? quote.knownCargo ?? "").toLocaleLowerCase().split(/[;,|]/).map((value) => value.trim()))
  return {
    ...EMPTY_CARGO_CHARACTERISTICS,
    hazardous: selected.has("hazardous"),
    oversized: selected.has("oversized"),
    temperatureControlled: selected.has("temperature controlled"),
    fragile: selected.has("fragile"),
    foodGrade: selected.has("food grade"),
  }
}

function cargoCharacteristicsToString(value: CargoCharacteristics) {
  const labels: Array<[keyof CargoCharacteristics, string]> = [
    ["hazardous", "Hazardous"],
    ["oversized", "Oversized"],
    ["temperatureControlled", "Temperature controlled"],
    ["fragile", "Fragile"],
    ["foodGrade", "Food grade"],
  ]
  const selected = labels.filter(([key]) => value[key]).map(([, label]) => label)
  return selected.length ? selected.join("; ") : "General cargo"
}

const quoteQueue: QuoteRecord[] = [
  {
    id: "Q-19158",
    status: "Working",
    statusTone: "amber",
    localRef: "SPQ-74218",
    quoteType: "Local client",
    source: "NEW - New Shipper",
    workflowStatus: "WRK - Working",
    priority: "Standard",
    holdReason: "None",
    customerPO: "PO-48319",
    shipperReference: "HW-SEA-1184",
    agentReference: "Pending",
    carrierReference: "Pending",
    docsStatus: "Draft",
    workflow: "Review",
    revisionReason: "Initial spot rate",
    createdAt: "08 Jan 2026 · 09:42",
    customer: "HarbourWorks Safety",
    clientCode: "HWSBRI",
    customerAddress: "RIVERGATE WORKS, BRISTOL, UNITED KINGDOM",
    customerContact: "Nora Vale - Logistics Lead",
    customerEmail: "rates@harbourworks.example",
    shipperCode: "HWSBRI",
    shipperName: "HarbourWorks Safety",
    shipperAddress: "RIVERGATE WORKS, NORTH QUAY INDUSTRIAL ESTATE",
    shipperContact: "Dispatch desk",
    collectionAddress: "RIVERGATE WORKS, NORTH QUAY INDUSTRIAL ESTATE, BRISTOL, UNITED KINGDOM",
    consigneeCode: "Not selected",
    consigneeName: "No organisation selected",
    consigneeAddress: "",
    deliveryAddress: "KOBE DISTRIBUTION CENTRE, PORT ISLAND, KOBE, JAPAN",
    route: "",
    mode: "Sea",
    container: "1 x 40HC",
    incoterm: "DAP",
    incotermPlace: "Kobe, Japan",
    origin: "",
    destination: "",
    via: "SGSIN",
    startDate: "08 Jan 2026",
    endDate: "31 Jan 2026",
    validity: "08 Jan to 31 Jan",
    direction: "Export",
    serviceLevel: "Not selected",
    rateSource: "Manual",
    hblMode: "CY/CFS",
    transitDays: "55",
    frequency: "0 - Ad hoc",
    shipmentType: "FCL - Full Container Load",
    carrier: "British Airways",
    carrierOffice: "London Heathrow Cargo Centre",
    supplier: "Hellmann Worldwide Logistics",
    supplierOffice: "Liverpool office",
    branch: "BR1",
    department: "SEA",
    salesRep: "AM1",
    opsRep: "Daniel Reed",
    jobStatus: "WRK",
    goodsValue: "0.00 GBP",
    insuranceValue: "0.00 GBP",
    entries: "1",
    invoiceLines: "1",
    commodity: "Not selected",
    co2e: "Pending",
    knownCargo: "General merchandise",
    fmcTid: "Not required",
    margin: "16.18%",
    profit: 253.46,
    cost: 1312.96,
    revenue: 1566.42,
    currency: "GBP",
    baseRoe: 1.3,
    costRoe: 1.25,
    revenueRoe: 1.25,
    jobRoes: [
      { currency: "USD", baseRate: 1.3, costRate: 1.25, revenueRate: 1.25 },
      { currency: "EUR", baseRate: 1.17, costRate: 1.13, revenueRate: 1.13 },
      { currency: "JPY", baseRate: 196, costRate: 190, revenueRate: 190 },
    ],
  },
  {
    id: "Q-19157",
    status: "Ready",
    statusTone: "green",
    source: "Repeat lane",
    createdAt: "22 Jul 2026 · 08:14",
    customer: "Cedar & Loom Trading",
    route: "Singapore to Southampton",
    mode: "Sea FCL",
    container: "2 x 40HC",
    incoterm: "FOB",
    origin: "SGSIN",
    destination: "GBSOU",
    via: "Direct",
    validity: "28 Jul 2026",
    salesRep: "EM",
    opsRep: "Wei Chen",
    margin: "18.40%",
    profit: 612.2,
    cost: 2714.8,
    revenue: 3327,
    currency: "GBP",
  },
  {
    id: "Q-19154",
    status: "Needs rate",
    statusTone: "blue",
    source: "CRM opportunity",
    createdAt: "22 Jul 2026 · 08:31",
    customer: "Asterline Components",
    route: "Dubai to Heathrow",
    mode: "Air",
    container: "4 pallets",
    incoterm: "DAP",
    origin: "DXB",
    destination: "LHR",
    via: "Direct",
    validity: "24 Jul 2026",
    salesRep: "AM1",
    opsRep: "Wei Chen",
    margin: "Pending",
    profit: 0,
    cost: 0,
    revenue: 0,
    currency: "GBP",
  },
]

const newQuoteDraft: QuoteRecord = {
  id: "NEW",
  status: "Open",
  statusTone: "green",
  localRef: "",
  quoteType: "",
  source: "",
  workflowStatus: "",
  priority: "",
  holdReason: "",
  customerPO: "",
  shipperReference: "",
  consigneeReference: "",
  agentReference: "",
  carrierReference: "",
  docsStatus: "",
  workflow: "",
  revisionReason: "",
  createdAt: "",
  customer: "",
  clientCode: "",
  customerAddress: "",
  customerContact: "",
  customerEmail: "",
  payerOrgId: "",
  payerCode: "",
  payerName: "",
  payerAddress: "",
  payerContact: "",
  payerEmail: "",
  shipperCode: "",
  shipperName: "",
  shipperAddress: "",
  shipperContact: "",
  shipperEmail: "",
  shipperAddressOverride: "No",
  collectionAddress: "",
  consigneeCode: "",
  consigneeName: "",
  consigneeAddress: "",
  consigneeContact: "",
  consigneeEmail: "",
  consigneeAddressOverride: "No",
  deliveryAddress: "",
  agentOrgId: "",
  agentCode: "",
  agentName: "",
  agentAddress: "",
  agentContact: "",
  agentEmail: "",
  route: "",
  mode: "",
  container: "",
  incoterm: "",
  incotermPlace: "",
  origin: "",
  originCountry: "",
  originTown: "",
  originUnlocode: "",
  destination: "",
  destinationCountry: "",
  destinationTown: "",
  destinationUnlocode: "",
  via: "",
  startDate: "",
  endDate: "",
  estimatedDeparture: "",
  estimatedArrival: "",
  deadline: "",
  validity: "",
  direction: "",
  serviceLevel: "",
  rateSource: "",
  hblMode: "",
  transitDays: "",
  transitUnit: "Days",
  frequency: "",
  frequencyInterval: "1",
  frequencyUnit: "Weeks",
  frequencyTimesPerMonth: "1",
  frequencyCount: "",
  frequencyNotes: "",
  shipmentType: "",
  carrier: "",
  carrierOffice: "",
  supplier: "",
  supplierOffice: "",
  supplierOptionsJson: "",
  branch: "",
  department: "",
  salesRep: "",
  opsRep: "",
  jobStatus: "",
  goodsValue: "",
  goodsValueCurrency: "GBP",
  insuranceValue: "",
  insuranceValueCurrency: "GBP",
  entries: "",
  invoiceLines: "",
  commodity: "",
  co2e: "",
  knownCargo: "",
  cargoCharacteristics: "General cargo",
  hazardousUnNumber: "",
  hazardousClass: "",
  hazardousPackingGroup: "",
  hazardousShippingName: "",
  hazardousEmergencyContact: "",
  hazardousNetWeightKg: "",
  hazardousMarinePollutant: "No",
  hazardousLimitedQuantity: "No",
  hazardousNotes: "",
  packageQuantity: "",
  packageType: "",
  grossWeightKg: "",
  volumeCbm: "",
  chargeableWeightKg: "",
  collectionRequired: "",
  deliveryRequired: "",
  customsIncluded: "",
  originCustomsAgentId: "",
  originCustomsAgentName: "",
  destinationCustomsAgentId: "",
  destinationCustomsAgentName: "",
  subjectToTerms: "Subject to rate and space availability",
  customerTermsSource: "",
  terms: "",
  customerNotes: "",
  internalNotes: "",
  fmcTid: "",
  margin: "",
  profit: 0,
  cost: 0,
  revenue: 0,
  currency: "",
  jobRoes: [],
  details: {},
}

const salesRepresentativeOptions = systemPeople
  .filter((person) => person.roles.includes("sales"))
  .map((person) => `${person.code} - ${person.name}`)

function salesRepresentativeValue(salesRep?: string, emptyWhenMissing = false) {
  if (!salesRep?.trim()) return emptyWhenMissing ? "" : salesRepresentativeOptions[0]
  const normalizedSalesRep = salesRep.trim()
  return salesRepresentativeOptions.find((option) => option.startsWith(`${normalizedSalesRep} - `))
    ?? salesRepresentativeOptions.find((option) => option.endsWith(` - ${normalizedSalesRep}`))
    ?? normalizedSalesRep
}

function personInitials(name?: string) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  return words.length > 0 ? words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("") : "?"
}

function QuotePersonAvatar({
  name,
  photoUrl,
  className,
  fallbackClassName,
}: {
  name?: string
  photoUrl?: string | null
  className?: string
  fallbackClassName?: string
}) {
  return (
    <Avatar className={cn("size-8 rounded-full", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" className="rounded-full object-cover" /> : null}
      <AvatarFallback
        className={cn(
          "rounded-full bg-[var(--md-accent-a12)] text-[10.5px] font-medium text-[var(--md-accent)] dark:bg-[var(--md-accent-a14)]",
          fallbackClassName,
        )}
        data-i18n-skip
      >
        {personInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

function QuoteCoEditorWarning({
  editors,
  photoUrls,
}: {
  editors: QuoteEditorPresence[]
  photoUrls: Map<string, string>
}) {
  const { t } = useLanguage()
  if (!editors.length) return null
  const names = editors.map((editor) => editor.name)
  const visibleEditors = editors.slice(0, 3)
  const summary = editors.length === 1
    ? `${editors[0].name} ${t("also has this quote open")}`
    : `${editors[0].name} ${t("and")} ${editors.length - 1} ${t(editors.length === 2 ? "other person also have this quote open" : "other people also have this quote open")}`

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${summary}. ${t("Coordinate before making overlapping changes.")}`}
      title={names.join(", ")}
      className="flex h-8 min-w-0 shrink items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-status-amber-bg)] px-2.5 text-[11px] font-medium text-[var(--md-status-amber-ink)] shadow-[var(--md-shadow-line)]"
    >
      <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <AvatarGroup className="shrink-0" aria-hidden="true">
        {visibleEditors.map((editor) => (
          <QuotePersonAvatar
            key={editor.id}
            name={editor.name}
            photoUrl={photoUrls.get(editor.id)}
            className="size-5"
            fallbackClassName="text-[8px]"
          />
        ))}
      </AvatarGroup>
      <span className="truncate" data-i18n-skip dir="auto">{summary}</span>
    </div>
  )
}

const carrierOfficeOptions: Record<string, string[]> = {
  "British Airways": ["London Heathrow Cargo Centre", "Manchester Cargo Terminal"],
  Maersk: ["London Gateway office", "Liverpool office"],
  DFDS: ["Immingham office", "Dover office"],
}

const supplierOfficeOptions: Record<string, string[]> = {
  "Hellmann Worldwide Logistics": ["London office", "Liverpool office"],
  "Harbourline Forwarding Ltd": ["Bristol office", "London office"],
  "Severn Road Logistics": ["Bristol office", "Manchester office"],
}

const carrierOptions = Object.keys(carrierOfficeOptions)
const supplierOptions = Object.keys(supplierOfficeOptions)

const quoteParties: QuoteParty[] = [
  {
    label: "Client",
    code: "HWSBRI",
    name: "HarbourWorks Safety",
    address: ["RIVERGATE WORKS", "NORTH QUAY INDUSTRIAL ESTATE", "BRISTOL", "BS9 4ZX", "UNITED KINGDOM"],
    tone: "teal",
  },
  {
    label: "Shipper",
    code: "HWSBRI",
    name: "HarbourWorks Safety",
    address: ["RIVERGATE WORKS", "NORTH QUAY INDUSTRIAL ESTATE", "BRISTOL", "BS9 4ZX", "UNITED KINGDOM"],
    tone: "teal",
  },
  {
    label: "Consignee",
    code: "Unassigned",
    name: "No organisation selected",
    address: ["Add consignee before sending customer copy."],
    tone: "neutral",
  },
]

const quoteCharges: QuoteCharge[] = [
  { code: "ECCLR", description: "Export Customs Clearance Fee", creditor: "Harbourline Forwarding Ltd", costCurrency: "GBP", costAmount: 0, localCost: 0, sellCurrency: "GBP", sellAmount: 35, localSell: 35, costExchange: 1, sellExchange: 1, costRoeSource: "job", sellRoeSource: "job", department: "CES" },
  { code: "VGM", description: "Verified Gross Mass - If required", creditor: "Quayline Port Services", costCurrency: "GBP", costAmount: 23.56, localCost: 23.56, sellCurrency: "GBP", sellAmount: 35, localSell: 35, costExchange: 1, sellExchange: 1, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "DTHC", description: "Destination Terminal Handling Charges", creditor: "Kobe Gateway Agency", costCurrency: "USD", costAmount: 380, localCost: 304, sellCurrency: "USD", sellAmount: 380, localSell: 304, costExchange: 1.25, sellExchange: 1.25, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "HAN", description: "Handling", creditor: "Kobe Gateway Agency", costCurrency: "USD", costAmount: 100, localCost: 80, sellCurrency: "USD", sellAmount: 100, localSell: 80, costExchange: 1.25, sellExchange: 1.25, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "DDOC", description: "AFR Filing", creditor: "Kobe Gateway Agency", costCurrency: "USD", costAmount: 35, localCost: 28, sellCurrency: "USD", sellAmount: 35, localSell: 28, costExchange: 1.25, sellExchange: 1.25, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "BHAN", description: "Broker Handling", creditor: "Harbourpoint Brokerage", costCurrency: "USD", costAmount: 125, localCost: 100, sellCurrency: "USD", sellAmount: 125, localSell: 100, costExchange: 1.25, sellExchange: 1.25, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "DCART", description: "Destination Haulage / Transport", creditor: "Eastgate Cartage", costCurrency: "USD", costAmount: 450, localCost: 360, sellCurrency: "USD", sellAmount: 495, localSell: 396, costExchange: 1.25, sellExchange: 1.25, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "FRT", description: "International Freight", creditor: "Carrier pending", costCurrency: "USD", costAmount: -200, localCost: -160, sellCurrency: "USD", sellAmount: 0, localSell: 0, costExchange: 1.25, sellExchange: 1.25, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
  { code: "OCART", description: "Pick Up Transport", creditor: "Severn Road Logistics", costCurrency: "GBP", costAmount: 610, localCost: 610, sellCurrency: "GBP", sellAmount: 630, localSell: 630, costExchange: 1, sellExchange: 1, costRoeSource: "job", sellRoeSource: "job", department: "SEA" },
]

const chargeCatalogue = quoteCharges.map(({ code, description }) => ({ code, description }))
const supportedQuoteCurrencies: QuoteCurrency[] = ["GBP", "USD", "EUR", "JPY", "AUD", "CAD"]
const quoteChargeCurrencyDefinitions: readonly QuoteChargeCurrency[] = [
  { code: "GBP", name: "British pound", symbol: "£", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "USD", name: "US dollar", symbol: "$", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "JPY", name: "Japanese yen", symbol: "¥", decimalPlaces: 0, subUnitRatio: 1 },
  { code: "AUD", name: "Australian dollar", symbol: "A$", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "CAD", name: "Canadian dollar", symbol: "C$", decimalPlaces: 2, subUnitRatio: 100 },
]

const quoteChargeSupplierParties: readonly QuoteChargeParty[] = [
  { id: "supplier-hellmann", code: "HELWLG", name: "Hellmann Worldwide Logistics", roles: ["supplier"] },
  { id: "supplier-harbourline", code: "HARFWD", name: "Harbourline Forwarding Ltd", roles: ["supplier"] },
  { id: "supplier-quayline", code: "QUAPRT", name: "Quayline Port Services", roles: ["supplier"] },
  { id: "supplier-kobe", code: "KOBGAT", name: "Kobe Gateway Agency", roles: ["supplier"] },
  { id: "supplier-harbourpoint", code: "HARBRO", name: "Harbourpoint Brokerage", roles: ["supplier"] },
  { id: "supplier-eastgate", code: "EASCAR", name: "Eastgate Cartage", roles: ["supplier"] },
  { id: "supplier-carrier-pending", code: "PENDING", name: "Carrier pending", roles: ["supplier"] },
  { id: "supplier-severn", code: "SEVLOG", name: "Severn Road Logistics", roles: ["supplier"] },
]

const quoteChargeReferenceRates: Readonly<Record<QuoteCurrency, number>> = {
  GBP: 1,
  USD: 1.25,
  EUR: 1.16,
  JPY: 193.5,
  AUD: 1.92,
  CAD: 1.72,
}

function quoteChargeReferenceRoe(currency: string, baseCurrency: string) {
  const rate = quoteChargeReferenceRates[currency as QuoteCurrency]
  const baseRate = quoteChargeReferenceRates[baseCurrency as QuoteCurrency]
  return typeof rate === "number" && typeof baseRate === "number" && baseRate > 0
    ? rate / baseRate
    : null
}

const carriers = [
  { code: "BWO", name: "Bluewave Ocean", service: "Singapore relay", days: "55" },
  { code: "MSL", name: "Meridian Sea Lines", service: "Asia loop", days: "58" },
]

function money(value: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value)
}

function moneyWhole(value: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

function formatLocation(code: string, location: string) {
  return code.trim() ? `${code} - ${location}` : ""
}

function quoteDateInputValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ""
  return getDateInputValue(parsed)
}

const millisecondsPerCalendarDay = 86_400_000

function quoteTransitDays(estimatedDeparture: string | undefined, estimatedArrival: string | undefined) {
  const departure = quoteDateInputValue(estimatedDeparture ?? "")
  const arrival = quoteDateInputValue(estimatedArrival ?? "")
  if (!departure || !arrival) return ""

  const utcTimestamp = (dateKey: string) => {
    const [year, month, day] = dateKey.split("-").map(Number)
    return Date.UTC(year, month - 1, day)
  }
  const elapsedDays = Math.round((utcTimestamp(arrival) - utcTimestamp(departure)) / millisecondsPerCalendarDay)
  return elapsedDays >= 0 ? String(elapsedDays) : ""
}

function getDateInputValue(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`
}

const transportModeOptions = ["Sea FCL", "Sea LCL", "Air", "Road", "Rail"]

const cargoWiseModeOptions = ["Air", "Sea", "Road", "Rail"]

const shipmentTypeOptionsByMode: Record<string, string[]> = {
  Air: ["ULD - Unit Load Device"],
  Sea: ["FCL - Full Container Load", "LCL - Less than Container Load"],
  Road: ["FTL - Full Truckload", "LTL - Less than Truckload"],
  Rail: ["Container - Rail container", "Full wagon", "Rail groupage"],
}

function shipmentTypeOptions(mode: string) {
  return shipmentTypeOptionsByMode[mode] ?? shipmentTypeOptionsByMode.Sea
}

const shipmentTypeCodesByMode: Record<string, string[]> = {
  sea: ["FCL", "LCL", "CONSOL", "BREAKBULK", "PROJECT"],
  air: ["AIR", "CONSOL", "PROJECT"],
  road: ["FTL", "LTL", "RO_RO", "PROJECT"],
  rail: ["PROJECT", "OTHER"],
  multimodal: ["FCL", "LCL", "FTL", "LTL", "AIR", "CONSOL", "BREAKBULK", "RO_RO", "PROJECT", "OTHER"],
  courier: ["AIR", "OTHER"],
  warehouse: ["OTHER"],
  customs_only: ["CUSTOMS_ONLY"],
  docs_only: ["DOCS_ONLY"],
  other: ["OTHER"],
}

function shipmentTypeCode(value: string) {
  return value.split(" - ", 1)[0].trim().toUpperCase()
}

function shipmentTypeChoicesForMode(mode: string, choices: string[]) {
  const allowedCodes = shipmentTypeCodesByMode[mode.trim().toLowerCase()]
  if (!allowedCodes) return choices
  return choices.filter((choice) => allowedCodes.includes(shipmentTypeCode(choice)))
}

function shipmentTypeValue(mode: string, value?: string, choices?: string[]) {
  const selected = value?.trim() ?? ""
  if (!selected) return ""
  const available = choices ?? shipmentTypeOptions(mode)
  return available.some((option) => option === selected || shipmentTypeCode(option) === shipmentTypeCode(selected)) ? selected : ""
}

function parseTransportModes(value: string) {
  return value.split(" + ").map((mode) => mode.trim()).filter(Boolean)
}

function getChargeTotals(charges: QuoteCharge[]) {
  const cost = charges.reduce((sum, line) => sum + line.localCost, 0)
  const revenue = charges.reduce((sum, line) => sum + line.localSell, 0)
  const profit = revenue - cost
  const margin = revenue > 0 ? `${((profit / revenue) * 100).toFixed(2)}%` : "0.00%"

  return { cost, revenue, profit, margin }
}

function QuoteField({
  label,
  value,
  muted,
  editable = false,
  onChange,
  skipTranslation = true,
  required = false,
  invalid = false,
  options,
}: {
  label: string
  value: ReactNode
  muted?: boolean
  editable?: boolean
  onChange?: (value: string) => void
  skipTranslation?: boolean
  required?: boolean
  invalid?: boolean
  options?: string[]
}) {
  const { t } = useLanguage()
  const stringValue = typeof value === "string" || typeof value === "number" ? String(value) : ""

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium leading-4 text-[var(--md-subtle)]">{t(label)}</p>
      {editable && options ? (
        <Select value={stringValue || undefined} onValueChange={(nextValue) => onChange?.(nextValue)}>
          <SelectTrigger
            aria-label={t(label)}
            aria-required={required || undefined}
            aria-invalid={invalid || undefined}
            className={cn(
              "mt-1 h-8 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
              invalid && "ring-1 ring-[var(--md-red)]",
            )}
          >
            <SelectValue placeholder={t("Select required option")} />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
            {options.map((option) => <SelectItem key={option} value={option}>{t(option)}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : editable ? (
        <Input
          value={stringValue}
          onChange={(event) => onChange?.(event.target.value)}
          required={required}
          aria-invalid={invalid || undefined}
          placeholder={required ? t("Required") : undefined}
          data-i18n-skip={skipTranslation || undefined}
          dir="auto"
          className={cn(
            "mt-1 h-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        />
      ) : (
        <div
          data-i18n-skip={skipTranslation || undefined}
          dir="auto"
          className={cn(
            "mt-1 flex min-h-8 items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 py-1.5 text-[11px] font-medium leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
            muted && "text-[var(--md-subtle)]",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        >
          {stringValue || "—"}
        </div>
      )}
      {invalid ? <p className="mt-1 text-[10px] text-[var(--md-red)]">{t("Required field")}</p> : null}
    </div>
  )
}

function QuoteMultiSelectField({
  label,
  value,
  editable,
  invalid,
  onChange,
}: {
  label: string
  value: string
  editable: boolean
  invalid: boolean
  onChange: (value: string) => void
}) {
  const { t } = useLanguage()

  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-[11px] font-medium leading-3 text-[var(--md-subtle)]">{t(label)}</p>
      <MultiSelectMenu
        value={parseTransportModes(value)}
        options={transportModeOptions}
        onValueChange={(modes) => onChange(modes.join(" + "))}
        placeholder="Select transport modes"
        label="Transport modes"
        invalid={invalid}
        required
        disabled={!editable}
      />
    </div>
  )
}

function AddressPanel({ party }: { party: QuoteParty }) {
  const { t } = useLanguage()

  return (
    <Surface padding="xs" tone="tint" className="rounded-[var(--md-radius-sm)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t(party.label)}</p>
          <div className="mt-1 flex items-center gap-2">
            <span data-i18n-skip dir="ltr" className="truncate text-[12px] font-medium text-[var(--md-ink)]">{party.code}</span>
            <StatusPill tone={party.tone ?? "neutral"}>{party.name}</StatusPill>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7 rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
          <MoreHorizontal className="size-3.5" strokeWidth={1.4} />
        </Button>
      </div>
      <div data-i18n-skip dir="auto" className="mt-1.5 min-h-[50px] rounded-[var(--md-radius-xs)] bg-[var(--md-surface)] px-2 py-1 text-[10.5px] leading-3.5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        <p className="font-medium text-[var(--md-ink)]">{party.address[0]}</p>
        {party.address.slice(1).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </Surface>
  )
}

function QuoteMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: StatusTone }) {
  const { t } = useLanguage()

  return (
    <Surface padding="xs" tone="tint" className="rounded-[var(--md-radius-sm)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t(label)}</p>
          <p data-i18n-skip dir="ltr" className="truncate text-[14px] font-medium text-[var(--md-ink)]">{value}</p>
          <p className="truncate text-[11px] text-[var(--md-text)]">{t(detail)}</p>
        </div>
        <StatusPill tone={tone}>{tone === "green" ? "OK" : tone === "amber" ? "Review" : "Info"}</StatusPill>
      </div>
    </Surface>
  )
}

function DenseFact({
  label,
  value,
  detail,
  tone,
  skipTranslation = true,
}: {
  label: string
  value: string
  detail?: string
  tone?: StatusTone
  skipTranslation?: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className="min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2.5 py-2 shadow-[var(--md-shadow-line)]">
      <span className="block text-[10px] font-medium uppercase leading-3 tracking-[0.02em] text-[var(--md-subtle)]">{t(label)}</span>
      <span data-i18n-skip={skipTranslation || undefined} dir="auto" className="mt-0.5 block whitespace-normal break-words text-[11.5px] font-medium leading-4 text-[var(--md-ink)]">{value}</span>
      {detail ? (
        <span className="mt-0.5 flex min-w-0 items-start gap-1 text-[10px] leading-3 text-[var(--md-text)]">
          {tone ? <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", tone === "green" ? "bg-[var(--md-green)]" : tone === "amber" ? "bg-[var(--md-amber)]" : tone === "red" ? "bg-[var(--md-red)]" : "bg-[var(--md-blue)]")} /> : null}
          <span data-i18n-skip={skipTranslation || undefined} dir="auto" className="min-w-0 whitespace-normal break-words">{t(detail)}</span>
        </span>
      ) : null}
    </div>
  )
}

function InsightRow({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof BrainCircuit
  title: string
  detail: string
  tone: StatusTone
}) {
  const { t } = useLanguage()

  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2.5 py-2 shadow-[var(--md-shadow-line)]">
      <span className={cn(
        "grid size-7 place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)]",
        tone === "green" ? "bg-[var(--md-accent-a11)] text-[var(--md-green)]" : tone === "amber" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" : tone === "red" ? "bg-[rgba(209,78,78,0.11)] text-[var(--md-red)]" : "bg-[rgba(74,125,156,0.12)] text-[var(--md-blue)]",
      )}>
        <Icon className="size-3" strokeWidth={1.4} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-[var(--md-ink)]">{t(title)}</span>
        <span className="block truncate text-[10px] text-[var(--md-text)]">{t(detail)}</span>
      </span>
      <StatusPill tone={tone} className="h-[19px] px-2 text-[10.5px]">{tone === "green" ? "Clear" : tone === "amber" ? "Watch" : tone === "red" ? "Block" : "Info"}</StatusPill>
    </div>
  )
}

function quoteIntelligenceCohortLabel(cohort: QuoteIntelligenceSnapshot["metrics"]["historicalWinRate"]["cohort"]) {
  return ({
    customer_lane_mode_shipment: "Customer, lane, mode and shipment type",
    customer_mode: "Customer and mode",
    tenant_lane_mode: "Workspace lane and mode",
    tenant_mode: "Workspace mode",
    tenant_history: "Workspace history",
  } as const)[cohort]
}

function QuoteOverviewSignals({
  quote,
  intelligence,
  intelligenceUnavailable = false,
  compact = false,
}: {
  quote: QuoteRecord
  intelligence: QuoteIntelligenceSnapshot | null
  intelligenceUnavailable?: boolean
  compact?: boolean
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const temperature = intelligence?.metrics.aiTemperature.value ?? null
  const successScore = temperature?.score ?? null
  const temperatureState = temperature?.label ?? (intelligenceUnavailable ? "Unavailable" : "Building baseline")
  const temperatureTone: StatusTone = temperature?.label === "Hot" ? "red" : temperature?.label === "Warm" ? "amber" : temperature?.label === "Cold" ? "blue" : "neutral"
  const needleAngle = -90 + ((successScore ?? 0) / 100) * 180
  const quoteMetadata = [
    { label: "Quote owner", value: salesRepresentativeValue(quote.salesRep) },
    { label: "Created", value: quote.createdAt ?? "—" },
    { label: "Operations owner", value: quote.opsRep ?? "—" },
    { label: "Valid until", value: quote.validity || "—" },
  ]
  const temperatureEvidence = intelligence?.metrics.aiTemperature
  const temperatureEvidenceDetail = intelligence && temperatureEvidence
    ? `${t(quoteIntelligenceCohortLabel(temperatureEvidence.cohort))} · ${temperatureEvidence.evidenceCount} ${t("evidence records")} · ${intelligence.algorithmVersion} · ${t("Refreshed")} ${intelligence.calculatedAt ? new Date(intelligence.calculatedAt).toLocaleString() : t("Not yet")}`
    : t(intelligenceUnavailable ? "Intelligence temporarily unavailable" : "Building baseline")

  return (
    <div className={cn("md-quote-signals grid min-w-0 gap-2", compact ? "md-quote-signals--compact" : "md-quote-signals--standard")}>
      <div className="md-quote-stage-stack grid min-h-0">
        <Surface padding="none" className="md-quote-stage-metadata min-h-0 overflow-hidden rounded-[var(--md-radius-xl)] px-3 py-1.5">
          <dl className="grid h-full grid-cols-4 items-center gap-3">
            {quoteMetadata.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt>{t(item.label)}</dt>
                <dd title={item.value} data-i18n-skip dir="auto">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </div>

      <Surface padding="none" aria-live="polite" className="md-quote-temperature-panel relative overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-accent-abyss-deep)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a12),0_10px_22px_var(--md-accent-veil-cast-a18)]">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <SpectralBloomShader />
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(2,13,11,0.08),rgba(1,9,8,0.34))]" />
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase leading-3 tracking-[0.02em] text-white/68"><Radar className="size-3 text-white/85" strokeWidth={1.5} />{t("AI temperature")}</p>
            <p className="mt-0.5 text-[13px] font-medium text-white">
              {successScore === null ? t(intelligenceUnavailable ? "Intelligence temporarily unavailable" : "Building baseline") : `${successScore}% ${t("commercial momentum")}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={t("About AI temperature")} className="relative grid size-7 place-items-center text-white/68 transition-colors after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 hover:text-white">
                  <Info className="size-3.5" strokeWidth={1.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" sideOffset={8} className="w-64 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-lift)]">
                <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Commercial momentum evidence")}</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{temperatureEvidenceDetail}</p>
              </PopoverContent>
            </Popover>
            <StatusPill tone={temperatureTone} className="border-0 bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">{t(temperatureState)}</StatusPill>
          </div>
        </div>
        <div className="relative z-10 mx-auto h-[50px] w-full overflow-hidden">
          <svg viewBox="0 0 220 124" className="h-full w-full" role="img" aria-label={t("AI commercial momentum gauge")}>
            <defs>
              <linearGradient id="quote-temperature-gradient" x1="30" y1="104" x2="190" y2="104" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--md-blue)" />
                <stop offset="34%" stopColor="var(--md-green)" />
                <stop offset="68%" stopColor="var(--md-amber)" />
                <stop offset="100%" stopColor="var(--md-red)" />
              </linearGradient>
            </defs>
            <path className="md-quote-temperature-gradient" d="M 30 104 A 80 80 0 0 1 190 104" fill="none" stroke="url(#quote-temperature-gradient)" strokeWidth="14" strokeLinecap="round" />
            <motion.g
              initial={shouldReduceMotion ? false : { rotate: -90 }}
              animate={{ rotate: needleAngle }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.page)}
              style={{ transformOrigin: "110px 104px" }}
            >
              <line x1="110" y1="104" x2="110" y2="40" stroke="white" strokeWidth="4" strokeLinecap="round" />
              <circle cx="110" cy="104" r="8" fill="white" stroke="rgba(2,13,11,0.72)" strokeWidth="3" />
            </motion.g>
          </svg>
          <DotLottieReact
            src="/animations/fire.lottie"
            autoplay={!shouldReduceMotion}
            loop={!shouldReduceMotion}
            className="md-quote-temperature-fire"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 text-[9.5px] font-medium text-white/72">
            <span>{t("Cold")}</span>
            <span>{t("Hot")}</span>
          </div>
        </div>
      </Surface>
    </div>
  )
}

function ClientPricingIntelligence({ intelligence, unavailable = false }: { intelligence: QuoteIntelligenceSnapshot | null; unavailable?: boolean }) {
  const { t, language } = useLanguage()
  if (!intelligence) {
    const labels = ["Historical win rate", "Won price band", "Suggested pitch", "AI win likelihood", "Price confidence", "Margin headroom"]
    return (
      <div className="grid h-full gap-1.5 sm:grid-cols-3" aria-label={t(unavailable ? "Intelligence temporarily unavailable" : "Loading quote intelligence")} aria-busy={!unavailable} aria-live="polite">
        {labels.map((label, index) => (
          <div key={index} className="relative min-h-[96px] overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-accent-abyss-deep)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a12)]">
            {unavailable ? (
              <div className="relative flex h-full flex-col justify-between text-white">
                <p className="text-[9.5px] font-medium uppercase tracking-[0.02em] text-white/65">{t(label)}</p>
                <p className="text-[24px] font-medium">—</p>
                <p className="text-[9.5px] text-white/72">{t("Try again after the next quote update")}</p>
              </div>
            ) : (
              <>
                <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.08)_45%,transparent_70%)] motion-safe:animate-pulse" />
                <span className="relative block h-2.5 w-24 rounded-[var(--md-radius-sm)] bg-white/12" />
                <span className="relative mt-3 block h-7 w-28 rounded-[var(--md-radius-md)] bg-white/14" />
                <span className="relative mt-4 block h-2 w-32 rounded-[var(--md-radius-sm)] bg-white/10" />
              </>
            )}
          </div>
        ))}
      </div>
    )
  }

  const currency = intelligence.currency || "GBP"
  const historical = intelligence.metrics.historicalWinRate
  const band = intelligence.metrics.wonPriceBand
  const pitch = intelligence.metrics.suggestedPitch
  const likelihood = intelligence.metrics.aiWinLikelihood
  const confidence = intelligence.metrics.priceConfidence
  const headroom = intelligence.metrics.marginHeadroom
  const historicalValue = historical.value
  const baseline = t("Building baseline")
  const refreshed = intelligence.calculatedAt ? new Date(intelligence.calculatedAt).toLocaleString(language) : t("Not yet")
  const cohortDetail = (metric: { cohort: typeof historical.cohort; evidenceCount: number }) =>
    `${t(quoteIntelligenceCohortLabel(metric.cohort))} · ${metric.evidenceCount} ${t("evidence records")} · ${intelligence.algorithmVersion} · ${t("Refreshed")} ${refreshed}`
  const metrics = [
    {
      key: "historicalWinRate", label: "Historical win rate",
      value: historicalValue?.ratePct === null || historicalValue?.ratePct === undefined ? baseline : `${historicalValue.ratePct}%`,
      detail: historicalValue ? `${historicalValue.wins} ${t("won")} / ${historicalValue.losses} ${t("lost")} / ${historicalValue.pending} ${t("pending")}${historicalValue.lowEvidence ? ` · ${t("Low evidence")}` : ""}` : t("No resolved quotes yet"),
      infoTitle: "Observed quote outcomes", infoDetail: cohortDetail(historical), valueSize: "text-[clamp(30px,2.4vw,36px)]", icon: null,
    },
    {
      key: "wonPriceBand", label: "Won price band",
      value: band.value ? `${moneyWhole(band.value.low, currency)}–${moneyWhole(band.value.high, currency)}` : baseline,
      detail: band.value?.averageMarginPct === null || band.value?.averageMarginPct === undefined ? t("Needs five priced wins") : `${band.value.averageMarginPct}% ${t("average won margin")}`,
      infoTitle: "Won pricing evidence", infoDetail: cohortDetail(band), valueSize: "text-[clamp(20px,1.45vw,22px)]", icon: null,
    },
    {
      key: "suggestedPitch", label: "Suggested pitch",
      value: pitch.value ? money(pitch.value.amount, currency) : pitch.status === "missing_input" ? t("Add quote costs") : baseline,
      detail: pitch.value ? `${money(pitch.value.cost, currency)} ${t("cost")} / ${money(pitch.value.profit, currency)} ${t("profit")}` : t("Needs cost and real pricing evidence"),
      infoTitle: "Evidence-based pitch", infoDetail: cohortDetail(pitch), valueSize: "text-[clamp(28px,2.2vw,34px)]", icon: null,
    },
    {
      key: "aiWinLikelihood", label: "AI win likelihood",
      value: likelihood.value ? `${likelihood.value.finalPct}%` : baseline,
      detail: likelihood.value ? intelligence.ai?.status === "applied" ? `${t("Luna refinement")} ${likelihood.value.adjustmentPoints >= 0 ? "+" : ""}${likelihood.value.adjustmentPoints}` : t("Rules-only estimate") : t("Needs five resolved quotes"),
      infoTitle: "Win likelihood evidence", infoDetail: [intelligence.ai?.cardExplanations.aiWinLikelihood, cohortDetail(likelihood)].filter(Boolean).join(" · "), valueSize: "text-[clamp(28px,2.2vw,34px)]", icon: ChartAnalysis,
    },
    {
      key: "priceConfidence", label: "Price confidence",
      value: confidence.value ? `${confidence.value.score}%` : baseline,
      detail: confidence.value ? t("Sample, recency, spread and price position") : t("Needs five price observations"),
      infoTitle: "How this is scored", infoDetail: cohortDetail(confidence), valueSize: "text-[clamp(28px,2.2vw,34px)]", icon: Gauge,
    },
    {
      key: "marginHeadroom", label: "Margin headroom",
      value: headroom.value ? moneyWhole(headroom.value.amount, currency) : headroom.status === "missing_input" ? t("Add quote costs") : baseline,
      detail: headroom.value ? t("Suggested sell above carrier cost") : t("Needs an evidence-backed pitch"),
      infoTitle: "Deterministic margin view", infoDetail: cohortDetail(headroom), valueSize: "text-[clamp(26px,2vw,32px)]", icon: BrainCircuit,
    },
  ]

  return (
    <div className="grid h-full gap-1.5 sm:grid-cols-3" aria-live="polite">
        {metrics.map(({ key, label, value, detail, infoTitle, infoDetail, valueSize, icon: AiMetricIcon }) => (
          <div key={key} className="relative flex min-h-[96px] min-w-0 flex-col justify-between overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-accent-abyss-deep)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a12),0_10px_22px_var(--md-accent-veil-cast-a18)]">
            <span aria-hidden="true" className="pointer-events-none absolute inset-0">
              <SpectralBloomShader />
            </span>
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(2,13,11,0.08),rgba(1,9,8,0.34))]" />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t(`About ${label}`)}
                  className="absolute end-2 top-2 z-20 grid size-7 place-items-center bg-transparent text-white/68 transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 hover:text-white active:scale-[0.94]"
                >
                  <Info className="size-3.5" strokeWidth={1.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" sideOffset={8} className="w-60 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-lift)]">
                <p className="text-[12px] font-medium text-[var(--md-ink)]">{t(infoTitle)}</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{t(infoDetail)}</p>
              </PopoverContent>
            </Popover>
            <div className="relative z-10 min-w-0">
              <p className="flex min-w-0 items-center gap-1 pe-8 text-[9.5px] font-medium uppercase tracking-[0.02em] text-white/65">
                {AiMetricIcon ? <AiMetricIcon className="size-3 shrink-0 text-white/85" strokeWidth={1.5} /> : null}
                <span className="truncate">{t(label)}</span>
              </p>
              <p dir="auto" className={cn("mt-1 whitespace-nowrap font-medium leading-[1.08] tracking-[-0.035em] tabular-nums text-white", valueSize)}>{value}</p>
            </div>
            <p className="relative z-10 mt-2 flex min-w-0 items-center gap-1.5 text-[9.5px] text-white/78">
              <span className="size-1.5 shrink-0 rounded-full bg-white/80" />
              <span className="truncate">{t(detail)}</span>
            </p>
          </div>
        ))}
    </div>
  )
}

function RecentQuotesSummary({ quote, intelligence, unavailable = false }: { quote: QuoteRecord; intelligence: QuoteIntelligenceSnapshot | null; unavailable?: boolean }) {
  const { t, language } = useLanguage()
  const rows = intelligence?.recentQuotes ?? []
  const currency = intelligence?.currency || quote.currency || "GBP"
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short" }), [language])
  const snapshotLabel = intelligence?.state === "ready" ? "Live evidence" : intelligence?.state === "updating" ? "Updating" : intelligence?.state === "rules_only" ? "Rules-only" : "Building baseline"
  const columns = useMemo<DataTableColumn<QuoteIntelligenceRecentQuote>[]>(() => [
    { id: "date", label: "Date", width: 76, minWidth: 68, kind: "date", cell: (row) => <span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-subtle)]">{dateFormatter.format(new Date(row.date))}</span> },
    { id: "lane", label: "Origin → destination", width: 116, minWidth: 106, kind: "identity", cellTitle: (row) => row.lane, cell: (row) => <span data-i18n-skip dir="ltr" className="block truncate font-medium text-[var(--md-ink)]">{row.lane}</span> },
    { id: "mode", label: "Mode", width: 68, minWidth: 62, kind: "attribute", cell: (row) => <StatusPill kind="attribute" tone="blue" className="h-4 px-1.5 text-[9px]">{t(row.mode)}</StatusPill> },
    { id: "revenue", label: "Revenue", width: 78, minWidth: 72, kind: "number", cell: (row) => <span data-i18n-skip dir="ltr">{row.revenue === null ? "—" : money(row.revenue, currency)}</span> },
    { id: "cost", label: "Cost", width: 72, minWidth: 68, kind: "number", cell: (row) => <span data-i18n-skip dir="ltr" className="text-[var(--md-text)]">{row.cost === null ? "—" : money(row.cost, currency)}</span> },
    { id: "profit", label: "Profit", width: 74, minWidth: 68, kind: "number", cell: (row) => <span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{row.profit === null ? "—" : money(row.profit, currency)}</span> },
    { id: "margin", label: "Profit %", width: 66, minWidth: 62, kind: "number", cell: (row) => <span data-i18n-skip dir="ltr">{row.marginPct === null ? "—" : `${row.marginPct}%`}</span> },
    { id: "status", label: "Status", width: 84, minWidth: 76, kind: "status", cell: (row) => <StatusPill kind="status" tone={row.status === "Won" ? "green" : row.status === "Lost" ? "red" : "amber"} className="h-4 px-1.5 text-[9px]">{t(row.status)}</StatusPill> },
  ], [currency, dateFormatter, t])

  return (
    <Surface padding="none" className="h-full min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-white dark:bg-[var(--md-surface)]">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 bg-white px-2.5 py-1.5 shadow-[inset_0_-1px_0_rgba(11,20,19,0.05)] dark:bg-[var(--md-surface)]">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--md-ink)]">{t("Last five quotes")}</p>
          <p className="truncate text-[9.5px] text-[var(--md-subtle)]">
            {intelligence ? t(quoteIntelligenceCohortLabel(intelligence.metrics.historicalWinRate.cohort)) : t(unavailable ? "Intelligence temporarily unavailable" : "Loading real quote history")}
          </p>
        </div>
        {intelligence ? <StatusPill tone={intelligence.state === "ready" ? "green" : "amber"}>{t(snapshotLabel)}</StatusPill> : null}
      </div>
      {rows.length ? (
        <DataTable ariaLabel="Recent quotes" columns={columns} rows={rows} getRowKey={(row) => row.id} minimumWidth={630} showToolbar={false} showColumnManager={false} className="h-[calc(100%-2.5rem)] rounded-none bg-white shadow-none dark:bg-[var(--md-surface)]" tableClassName="text-[9.5px]" />
      ) : (
        <div className="grid min-h-36 place-items-center px-4 text-center">
          <div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t(unavailable ? "Intelligence temporarily unavailable" : "No comparable quotes yet")}</p><p className="mt-1 text-[10.5px] text-[var(--md-text)]">{t(unavailable ? "The saved quote is still available. Intelligence will retry after the next meaningful update." : "Real quote outcomes will appear here as the workspace builds history.")}</p></div>
        </div>
      )}
    </Surface>
  )
}

function QuoteSetupPanel({
  quote,
  editable,
  onQuoteChange,
  onJobRoeChange,
  validationAttempted,
}: {
  quote: QuoteRecord
  editable: boolean
  onQuoteChange: (field: keyof QuoteRecord, value: string) => void
  onJobRoeChange: (currency: JobRoe["currency"], field: "costRate" | "revenueRate", value: string) => void
  validationAttempted: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 xl:grid-cols-3">
        {quoteParties.map((party) => <AddressPanel key={party.label} party={party} />)}
      </div>

      <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
        <SectionHeader title="Job currency management" meta="Set the quote defaults once. Foreign-currency costs and revenue inherit their own ROE unless a line is overridden." />
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] px-2.5 py-2 shadow-[var(--md-shadow-line)]">
            <span className="block text-[10px] font-medium text-[var(--md-subtle)]">{t("System base ROE")}</span>
            <span data-i18n-skip dir="ltr" className="mt-0.5 block text-[14px] font-semibold tabular-nums text-[var(--md-ink)]">{(quote.baseRoe ?? 1.3).toFixed(2)} USD : 1 GBP</span>
            <span className="mt-0.5 block text-[10.5px] text-[var(--md-text)]">{t("Reference rate at quote creation")}</span>
          </div>
          <label className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2.5 py-2 shadow-[var(--md-shadow-line)]">
            <span className="block text-[10px] font-medium text-[var(--md-subtle)]">{t("Pulled cost ROE")}</span>
            <div className="mt-1 flex items-center gap-1.5"><Input value={(quote.costRoe ?? quote.baseRoe ?? 1.3).toFixed(2)} type="number" step="0.01" min="0.01" disabled={!editable} onChange={(event) => onJobRoeChange("USD", "costRate", event.target.value)} data-i18n-skip dir="ltr" className="h-7 min-w-0 rounded-[var(--md-radius-xs)] bg-[var(--md-surface)] px-1.5 text-[12px] font-medium tabular-nums shadow-[var(--md-shadow-line)]" /><span data-i18n-skip dir="ltr" className="shrink-0 text-[10.5px] text-[var(--md-text)]">USD : GBP</span></div>
          </label>
          <label className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2.5 py-2 shadow-[var(--md-shadow-line)]">
            <span className="block text-[10px] font-medium text-[var(--md-subtle)]">{t("Pulled revenue ROE")}</span>
            <div className="mt-1 flex items-center gap-1.5"><Input value={(quote.revenueRoe ?? quote.baseRoe ?? 1.3).toFixed(2)} type="number" step="0.01" min="0.01" disabled={!editable} onChange={(event) => onJobRoeChange("USD", "revenueRate", event.target.value)} data-i18n-skip dir="ltr" className="h-7 min-w-0 rounded-[var(--md-radius-xs)] bg-[var(--md-surface)] px-1.5 text-[12px] font-medium tabular-nums shadow-[var(--md-shadow-line)]" /><span data-i18n-skip dir="ltr" className="shrink-0 text-[10.5px] text-[var(--md-text)]">USD : GBP</span></div>
          </label>
        </div>
      </Surface>

      <div className="grid gap-2 xl:grid-cols-[1fr_1fr_300px]">
        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Routing and service" meta="Operational fields carried forward from the spot quote." />
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <QuoteMultiSelectField label="Transport" value={quote.mode} editable={editable} invalid={validationAttempted && !quote.mode.trim()} onChange={(value) => onQuoteChange("mode", value)} />
            <QuoteField label="Container" value={quote.container} editable={editable} onChange={(value) => onQuoteChange("container", value)} />
            <QuoteField label="Incoterms" value={quote.incoterm} editable={editable} required invalid={validationAttempted && !quote.incoterm.trim()} options={["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"]} onChange={(value) => onQuoteChange("incoterm", value)} />
            <QuoteField label="HBL delivery mode" value={quote.hblMode ?? "CY/CFS"} editable={editable} onChange={(value) => onQuoteChange("hblMode", value)} />
            <QuoteField label="From" value={quote.origin} editable={editable} required invalid={validationAttempted && !quote.origin.trim()} onChange={(value) => onQuoteChange("origin", value)} />
            <QuoteField label="To" value={quote.destination} editable={editable} required invalid={validationAttempted && !quote.destination.trim()} onChange={(value) => onQuoteChange("destination", value)} />
            <QuoteField label="Quote Type" value={quote.direction ?? ""} editable={editable} required invalid={validationAttempted && !quote.direction?.trim()} options={["Export", "Import", "Domestic", "Cross trade"]} onChange={(value) => onQuoteChange("direction", value)} />
            <QuoteField label="Currency" value={quote.currency} editable={editable} required invalid={validationAttempted && !quote.currency.trim()} options={["GBP", "EUR", "USD"]} onChange={(value) => onQuoteChange("currency", value)} />
            <QuoteField label="Via" value={quote.via} editable={editable} onChange={(value) => onQuoteChange("via", value)} />
            <QuoteField label="Transit days" value={quote.transitDays ?? ""} editable={editable} onChange={(value) => onQuoteChange("transitDays", value)} />
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Goods and references" meta="Shipment definition used to protect the quote terms." />
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <QuoteField label="Customer" value={quote.customer} editable={editable} onChange={(value) => onQuoteChange("customer", value)} />
            <QuoteField label="Quote type" value={quote.quoteType ?? "Local client"} editable={editable} onChange={(value) => onQuoteChange("quoteType", value)} />
            <QuoteField label="Start date" value={quote.startDate ?? ""} editable={editable} onChange={(value) => onQuoteChange("startDate", value)} />
            <QuoteField label="End date" value={quote.endDate ?? ""} editable={editable} onChange={(value) => onQuoteChange("endDate", value)} />
            <QuoteField label="Goods value" value={quote.goodsValue ?? "0.00 GBP"} editable={editable} onChange={(value) => onQuoteChange("goodsValue", value)} />
            <QuoteField label="Insurance value" value={quote.insuranceValue ?? "0.00 GBP"} editable={editable} onChange={(value) => onQuoteChange("insuranceValue", value)} />
            <QuoteField label="Customs entries" value={quote.entries ?? "1"} editable={editable} onChange={(value) => onQuoteChange("entries", value)} />
            <QuoteField label="Invoice lines" value={quote.invoiceLines ?? "1"} editable={editable} onChange={(value) => onQuoteChange("invoiceLines", value)} />
          </div>
          <div className="mt-2 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1.5 text-[11px] leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
            {t("Quote applies only to this shipment definition. Changing container, route, or incoterm should trigger a rate review.")}
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Carrier options" meta="Shortlist before rate confirmation." />
          <div className="mt-2 divide-y divide-[rgba(90,103,100,0.12)]">
            {carriers.map((carrier) => (
              <div key={carrier.code} className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2 py-2 first:pt-0 last:pb-0">
                <span data-i18n-skip dir="ltr" className="text-[12px] font-medium text-[var(--md-ink)]">{carrier.code}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-[var(--md-ink)]">{carrier.name}</span>
                  <span className="block truncate text-[11px] text-[var(--md-text)]">{carrier.service}</span>
                </span>
                <span data-i18n-skip dir="ltr" className="text-right text-[12px] font-medium text-[var(--md-text)]">{carrier.days}d</span>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}

type QuoteChargeEditableField = "code" | "description" | "creditor" | "costCurrency" | "costAmount" | "localCost" | "sellCurrency" | "sellAmount" | "localSell" | "costExchange" | "sellExchange" | "internalNotes" | "additionalDetail"

function EditableChargeCell({
  value,
  editable,
  numeric = false,
  onChange,
  className,
  placeholder,
}: {
  value: string | number
  editable: boolean
  numeric?: boolean
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  if (editable) {
    return (
      <Input
        value={String(value)}
        type={numeric ? "number" : "text"}
        step={numeric ? "0.01" : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-i18n-skip
        dir={numeric ? "ltr" : "auto"}
        className={cn("h-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]", numeric && "text-right tabular-nums", className)}
      />
    )
  }

  return (
    <span data-i18n-skip dir={numeric ? "ltr" : "auto"} className={cn("block truncate text-[11px]", numeric && "text-right tabular-nums", className)}>
      {value || "—"}
    </span>
  )
}

type ChargePanelSide = "in" | "out"

type ChargeTableRow = {
  id: number
  code: string
  description: string
  currency: QuoteCurrency
  amount: number
  roe: number
  local: number
  party: string
  detail: string
}

function ChargeSidePanel({
  charges,
  side,
  customer,
  editable,
  onChargeChange,
  onAddCharge,
  onRemoveCharge,
  toolbarTabs,
  toolbarOptions,
}: {
  charges: QuoteCharge[]
  side: ChargePanelSide
  customer: string
  editable: boolean
  onChargeChange: (index: number, field: QuoteChargeEditableField, value: string) => void
  onAddCharge: () => void
  onRemoveCharge: (index: number) => void
  toolbarTabs?: ReactNode
  toolbarOptions?: ReactNode
}) {
  const { t } = useLanguage()
  const isIncoming = side === "in"
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const total = charges.reduce((sum, charge) => sum + (isIncoming ? charge.localCost : charge.localSell), 0)
  const title = isIncoming ? "Supplier charges" : "Customer charges"
  const description = isIncoming ? "Costs coming into the quote" : "Charges going out to the customer"
  const partyHeading = isIncoming ? "Supplier" : "Customer"
  const detailHeading = isIncoming ? "Internal notes" : "Additional detail"
  const rows = useMemo<ChargeTableRow[]>(() => charges.map((charge, index) => ({
    id: index,
    code: charge.code,
    description: charge.description,
    currency: isIncoming ? charge.costCurrency : charge.sellCurrency,
    amount: isIncoming ? charge.costAmount : charge.sellAmount,
    roe: isIncoming ? charge.costExchange : charge.sellExchange,
    local: isIncoming ? charge.localCost : charge.localSell,
    party: isIncoming ? charge.creditor : customer,
    detail: isIncoming ? charge.internalNotes ?? "" : charge.additionalDetail ?? "",
  })), [charges, customer, isIncoming])

  const columns = useMemo<DataTableColumn<ChargeTableRow>[]>(() => [
    {
      id: "code",
      label: "Code",
      width: 112,
      minWidth: 96,
      maxWidth: 180,
      resizable: true,
      sortValue: (row) => row.code,
      cell: (row) => editable ? (
        <Select value={row.code} onValueChange={(code) => onChargeChange(row.id, "code", code)}>
          <SelectTrigger aria-label={t("Charge code")} size="sm" className="h-8 w-full rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <SelectValue>{row.code}</SelectValue>
          </SelectTrigger>
          <SelectContent className="w-[min(420px,calc(100vw-24px))] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-popover)]">
            {chargeCatalogue.map((charge) => (
              <SelectItem key={charge.code} value={charge.code} className="min-h-10 rounded-[var(--md-radius-md)] py-2 text-[11px]">
                <span className="grid w-full min-w-0 grid-cols-[58px_minmax(0,1fr)] items-start gap-2">
                  <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{charge.code}</span>
                  <span className="whitespace-normal break-words text-[11px] leading-4 text-[var(--md-text)]">{t(charge.description)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{row.code}</span>,
    },
    {
      id: "description",
      label: "Description",
      width: 240,
      minWidth: 180,
      maxWidth: 420,
      resizable: true,
      sortValue: (row) => row.description,
      cell: (row) => <EditableChargeCell value={row.description} editable={editable} onChange={(value) => onChargeChange(row.id, "description", value)} />,
    },
    {
      id: "currency",
      label: "Currency",
      width: 112,
      minWidth: 100,
      maxWidth: 160,
      resizable: true,
      sortValue: (row) => row.currency,
      cell: (row) => editable ? (
        <Select value={row.currency} onValueChange={(currency) => onChargeChange(row.id, isIncoming ? "costCurrency" : "sellCurrency", currency)}>
          <SelectTrigger aria-label={t("Currency")} size="sm" className="h-8 w-full rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-popover)]">
            {supportedQuoteCurrencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{row.currency}</span>,
    },
    {
      id: "amount",
      label: "Amount",
      width: 126,
      minWidth: 108,
      resizable: true,
      sortValue: (row) => row.amount,
      cellClassName: "text-end",
      cell: (row) => <EditableChargeCell value={row.amount} editable={editable} numeric onChange={(value) => onChargeChange(row.id, isIncoming ? "costAmount" : "sellAmount", value)} />,
    },
    {
      id: "roe",
      label: "ROE",
      width: 108,
      minWidth: 96,
      resizable: true,
      sortValue: (row) => row.roe,
      cellClassName: "text-end",
      cell: (row) => <EditableChargeCell value={row.roe} editable={editable} numeric onChange={(value) => onChargeChange(row.id, isIncoming ? "costExchange" : "sellExchange", value)} />,
    },
    {
      id: "local",
      label: "Local",
      width: 126,
      minWidth: 108,
      resizable: true,
      sortValue: (row) => row.local,
      cellClassName: "text-end",
      cell: (row) => <EditableChargeCell value={row.local} editable={editable} numeric onChange={(value) => onChargeChange(row.id, isIncoming ? "localCost" : "localSell", value)} />,
    },
    {
      id: "party",
      label: partyHeading,
      width: 190,
      minWidth: 150,
      maxWidth: 320,
      resizable: true,
      sortValue: (row) => row.party,
      cell: (row) => <EditableChargeCell value={row.party} editable={isIncoming && editable} onChange={(value) => onChargeChange(row.id, "creditor", value)} />,
    },
    {
      id: "detail",
      label: detailHeading,
      width: 220,
      minWidth: 170,
      maxWidth: 380,
      resizable: true,
      sortValue: (row) => row.detail,
      cell: (row) => <EditableChargeCell value={row.detail} editable={editable} placeholder={t("Add detail")} onChange={(value) => onChargeChange(row.id, isIncoming ? "internalNotes" : "additionalDetail", value)} />,
    },
  ], [detailHeading, editable, isIncoming, onChargeChange, partyHeading, t])

  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t(title)}</h3>
            <p className="truncate text-[10.5px] text-[var(--md-subtle)]">{t(description)}</p>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <span className="block text-[10px] font-medium text-[var(--md-subtle)]">{t("Local total")}</span>
          <span data-i18n-skip dir="ltr" className="block text-[13px] font-medium tabular-nums text-[var(--md-ink)]">{money(total)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onAddCharge} disabled={!editable} className="text-[10.5px] shadow-[var(--md-shadow-line)]"><Plus data-icon="inline-start" className="size-3" />{t("Add")}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => selectedRow !== null && onRemoveCharge(selectedRow)} disabled={!editable || selectedRow === null} className="text-[10.5px] shadow-[var(--md-shadow-line)]"><Trash2 data-icon="inline-start" className="size-3" />{t("Remove")}</Button>
        </div>
      </div>
      <DataTable
        ariaLabel={title}
        columnsButtonLabel={`Manage ${title} columns`}
        toolbarTabs={toolbarTabs}
        toolbarOptions={toolbarOptions}
        columns={columns}
        rows={rows}
        getRowKey={(row) => String(row.id)}
        storageKey={`quote-charges-${side}`}
        selectedRowKey={selectedRow === null ? null : String(selectedRow)}
        onRowClick={(row) => setSelectedRow(row.id)}
        className="rounded-none bg-[var(--md-surface)] shadow-none"
        tableClassName="text-[11px] [&_th]:h-9 [&_td]:h-11 [&_td]:px-2 [&_td]:py-1.5"
      />
    </Surface>
  )
}

function QuoteChargesPanel({
  charges,
  customer,
  editable,
  jobRoePanel,
  onChargeChange,
  onAddCharge,
  onRemoveCharge,
}: {
  charges: QuoteCharge[]
  customer: string
  editable: boolean
  jobRoePanel?: ReactNode
  onChargeChange: (index: number, field: QuoteChargeEditableField, value: string) => void
  onAddCharge: () => void
  onRemoveCharge: (index: number) => void
}) {
  const { direction, t } = useLanguage()
  const totals = useMemo(() => getChargeTotals(charges), [charges])
  const [chargeView, setChargeView] = useState<"split" | "tabs">("split")
  const [activeChargeSide, setActiveChargeSide] = useState<ChargePanelSide>("in")
  const [splitRatio, setSplitRatio] = useState(50)
  const [isSplitResizing, setIsSplitResizing] = useState(false)
  const [isSplitFullscreen, setIsSplitFullscreen] = useState(false)
  const splitWorkspaceRef = useRef<HTMLDivElement>(null)

  function updateSplitRatio(clientX: number) {
    const bounds = splitWorkspaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    const pointerRatio = ((clientX - bounds.left) / bounds.width) * 100
    const nextRatio = direction === "rtl" ? 100 - pointerRatio : pointerRatio
    setSplitRatio(Math.max(30, Math.min(70, nextRatio)))
  }

  function splitWorkspaceKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const visualDelta = event.key === "ArrowLeft" ? -5 : 5
    const logicalDelta = direction === "rtl" ? -visualDelta : visualDelta
    setSplitRatio((current) => Math.max(30, Math.min(70, current + logicalDelta)))
  }

  const chargeViewTabs = (
    <>
      <Tabs value={chargeView} onValueChange={(value) => setChargeView(value as "split" | "tabs")}>
        <TabsList className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-0.5 shadow-[var(--md-shadow-line)]">
          <TabsTrigger value="split" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t("Side by side")}</TabsTrigger>
          <TabsTrigger value="tabs" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t("Tabbed")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {chargeView === "tabs" ? (
        <Tabs value={activeChargeSide} onValueChange={(value) => setActiveChargeSide(value as ChargePanelSide)}>
          <TabsList className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-0.5 shadow-[var(--md-shadow-line)]">
            <TabsTrigger value="in" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t("Supplier")}</TabsTrigger>
            <TabsTrigger value="out" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t("Customer")}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
    </>
  )

  const chargeViewOptions = chargeView === "split" ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" onClick={() => setIsSplitFullscreen(true)} className="size-8 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] p-0 text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] hover:opacity-90" aria-label={t("Expand charge workspace")}>
          <Maximize2 className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("Expand charge workspace")}</TooltipContent>
    </Tooltip>
  ) : null

  const splitChargeWorkspace = (
    <div className={cn("md-charge-split-workspace min-w-0", isSplitFullscreen && "md-charge-split-workspace--fullscreen")}>
      <div
        ref={splitWorkspaceRef}
        className={cn("md-charge-split-workspace__panes", isSplitResizing && "md-charge-split-workspace__panes--resizing")}
        style={{ "--md-charge-split-position": `${splitRatio}%` } as CSSProperties}
      >
        <ChargeSidePanel charges={charges} side="in" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} toolbarTabs={chargeViewTabs} toolbarOptions={chargeViewOptions} />
        <button
          type="button"
          className="md-charge-split-workspace__divider"
          aria-label={t("Resize supplier and customer charge tables")}
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={Math.round(splitRatio)}
          onKeyDown={splitWorkspaceKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setIsSplitResizing(true)
            updateSplitRatio(event.clientX)
          }}
          onPointerMove={(event) => {
            if (isSplitResizing) updateSplitRatio(event.clientX)
          }}
          onPointerUp={(event) => {
            setIsSplitResizing(false)
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => setIsSplitResizing(false)}
        >
          <span aria-hidden="true" />
        </button>
        <ChargeSidePanel charges={charges} side="out" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} />
      </div>
    </div>
  )

  return (
    <div className="grid gap-[var(--md-page-stack-gap-compact)]">
      <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Cost", value: money(totals.cost), detail: "Estimated local cost" },
            { label: "Revenue", value: money(totals.revenue), detail: "Customer sell total" },
            { label: "Profit", value: money(totals.profit), detail: `Margin ${totals.margin}` },
          ].map((metric) => (
            <div key={metric.label} className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--md-accent-a10),0_8px_18px_var(--md-accent-a16)]">
              <span className="block text-[10px] font-medium text-white/65">{t(metric.label)}</span>
              <span data-i18n-skip dir="ltr" className="mt-0.5 block truncate text-[14px] font-semibold leading-4 tabular-nums text-white">{metric.value}</span>
              <span className="mt-1 block truncate text-[10px] text-white/78">{t(metric.detail)}</span>
            </div>
          ))}
        </div>
        {jobRoePanel}
      </div>
      {chargeView === "split" ? (
        isSplitFullscreen ? null : splitChargeWorkspace
      ) : (
        <Tabs value={activeChargeSide} onValueChange={(value) => setActiveChargeSide(value as ChargePanelSide)} className="min-w-0">
          <TabsContent value="in" className="mt-0 min-w-0"><ChargeSidePanel charges={charges} side="in" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} toolbarTabs={chargeViewTabs} toolbarOptions={chargeViewOptions} /></TabsContent>
          <TabsContent value="out" className="mt-0 min-w-0"><ChargeSidePanel charges={charges} side="out" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} toolbarTabs={chargeViewTabs} toolbarOptions={chargeViewOptions} /></TabsContent>
        </Tabs>
      )}

      <div className="grid gap-2 xl:grid-cols-2">
        <Surface padding="sm" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title={t("Selected charge · Cost")} meta={t("Supplier-side values for the highlighted line.")} />
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <QuoteField label="Charge code" value="ECCLR" />
            <QuoteField label="Department" value="CES - Clearance Export Sea" />
            <QuoteField label="Cost currency" value="GBP" />
            <QuoteField label="Agent cost" value="0.00 GBP" />
          </div>
        </Surface>
        <Surface padding="sm" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title={t("Selected charge · Revenue")} meta={t("Customer-side values and commercial check.")} />
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <QuoteField label="Charge type" value="MJA" />
            <QuoteField label="Chargeable" value="0.000 M3" />
            <QuoteField label="Revenue currency" value="GBP" />
            <QuoteField label="Agent revenue" value="35.00 GBP" />
          </div>
          <p className="mt-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 py-1.5 text-[10.5px] leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
            {t("Keep the line editable until carrier and overseas agent costs are locked.")}
          </p>
        </Surface>
      </div>
      <Dialog open={isSplitFullscreen} onOpenChange={setIsSplitFullscreen}>
        <DialogContent className="!top-0 !right-0 !bottom-0 !left-0 !h-[100dvh] !w-[100dvw] !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 p-0 sm:!max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("Charge workspace")}</DialogTitle>
            <DialogDescription>{t("Compare supplier and customer charge tables with a resizable split view.")}</DialogDescription>
          </DialogHeader>
          {chargeView === "split" ? splitChargeWorkspace : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UnifiedQuoteChargesPanel({
  quote,
  charges,
  editable,
  onRowsChange,
}: {
  quote: QuoteRecord
  charges: QuoteCharge[]
  editable: boolean
  onRowsChange: (charges: QuoteCharge[]) => void
}) {
  const [financeCurrencies, setFinanceCurrencies] = useState<QuoteChargeCurrency[] | null>(null)
  const [financeRates, setFinanceRates] = useState<ApiFinanceExchangeRate[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setFinanceCurrencies(null)
    setFinanceRates(null)

    void Promise.allSettled([
      listFinanceCurrencies(),
      getFinanceExchangeRates(quote.currency),
    ]).then(([currencyResult, rateResult]) => {
      if (cancelled) return

      if (currencyResult.status === "fulfilled") {
        const nextCurrencies = currencyResult.value.currencies
          .filter((currency: ApiFinanceCurrency) => currency.isActive && /^[A-Z]{3}$/.test(currency.code.trim().toUpperCase()))
          .map((currency: ApiFinanceCurrency): QuoteChargeCurrency => ({
            code: currency.code.trim().toUpperCase(),
            name: currency.name.trim() || currency.code.trim().toUpperCase(),
            symbol: currency.symbol.trim() || currency.code.trim().toUpperCase(),
            decimalPlaces: Math.max(0, Math.min(6, Math.trunc(currency.decimalPlaces))),
            subUnitRatio: currency.decimalPlaces > 0 ? 10 ** Math.min(6, Math.trunc(currency.decimalPlaces)) : 1,
          }))

        if (nextCurrencies.some((currency) => currency.code === quote.currency)) {
          setFinanceCurrencies(nextCurrencies)
        }
      }

      if (rateResult.status === "fulfilled" && rateResult.value.baseCurrency.trim().toUpperCase() === quote.currency) {
        setFinanceRates(rateResult.value.rates)
      }
    })

    return () => {
      cancelled = true
    }
  }, [quote.currency])

  const parties = useMemo<QuoteChargeParty[]>(() => [
    ...quoteChargeSupplierParties,
    { id: "customer-current", code: quote.clientCode ?? "CUSTOMER", name: quote.customer, roles: ["customer"] },
    { id: "customer-cedar", code: "CEDLOO", name: "Cedar & Loom Trading", roles: ["customer"] },
    { id: "customer-asterline", code: "ASTCOM", name: "Asterline Components", roles: ["customer"] },
    { id: "customer-northstar", code: "NORTRA", name: "Northstar Trading", roles: ["customer"] },
  ], [quote.clientCode, quote.customer])

  const currencies = financeCurrencies ?? quoteChargeCurrencyDefinitions

  const exchangeRates = useMemo<QuoteChargeExchangeRate[]>(() => {
    const jobRates = (quote.jobRoes ?? []).map((rate) => ({
      currency: rate.currency,
      baseCurrency: quote.currency,
      costRoe: rate.costRate,
      sellRoe: rate.revenueRate,
      provider: "FIN job ROE",
      source: "job" as const,
      status: "current" as const,
    }))
    const coveredCurrencies = new Set<string>(jobRates.map((rate) => rate.currency))
    const apiRatesByCurrency = new Map(
      (financeRates ?? []).map((rate) => [rate.currency.trim().toUpperCase(), rate]),
    )
    const supplementalRates = currencies
      .map((currency) => currency.code)
      .filter((currency) => currency !== quote.currency && !coveredCurrencies.has(currency))
      .map((currency): QuoteChargeExchangeRate => {
        const apiRate = apiRatesByCurrency.get(currency)
        if (apiRate) {
          const fallbackRate = typeof apiRate.rate === "number" && Number.isFinite(apiRate.rate) && apiRate.rate > 0 ? apiRate.rate : null
          const costRoe = typeof apiRate.costRate === "number" && Number.isFinite(apiRate.costRate) && apiRate.costRate > 0 ? apiRate.costRate : fallbackRate
          const sellRoe = typeof apiRate.sellRate === "number" && Number.isFinite(apiRate.sellRate) && apiRate.sellRate > 0 ? apiRate.sellRate : fallbackRate
          const status = apiRate.status === "unavailable" || costRoe === null || sellRoe === null
            ? "unavailable" as const
            : apiRate.status
          return {
            currency,
            baseCurrency: quote.currency,
            costRoe: costRoe ?? 0,
            sellRoe: sellRoe ?? 0,
            provider: apiRate.provider ?? undefined,
            updatedAt: apiRate.effectiveAt ?? undefined,
            source: apiRate.source,
            status,
          }
        }

        const demoRate = import.meta.env.DEV && financeRates === null
          ? quoteChargeReferenceRoe(currency, quote.currency)
          : null
        if (demoRate !== null) {
          return {
            currency,
            baseCurrency: quote.currency,
            costRoe: demoRate,
            sellRoe: demoRate,
            provider: "Demo reference set — not live",
            source: "reference",
            status: "stale",
          }
        }

        return {
          currency,
          baseCurrency: quote.currency,
          costRoe: 0,
          sellRoe: 0,
          provider: financeRates === null ? "Finance rate service unavailable" : undefined,
          source: "reference",
          status: "unavailable",
        }
      })

    return [
      ...jobRates,
      ...supplementalRates,
      { currency: quote.currency, baseCurrency: quote.currency, costRoe: 1, sellRoe: 1, provider: "FIN job ROE", source: "job", status: "current" },
    ]
  }, [currencies, financeRates, quote.currency, quote.jobRoes])

  const rows = useMemo<UnifiedQuoteChargeRow[]>(() => charges.map((charge, index) => {
    const supplier = quoteChargeSupplierParties.find((party) => party.name === charge.creditor)
    return {
      id: charge.id ?? `quote-charge-${index + 1}`,
      code: charge.code,
      description: charge.description,
      supplierId: charge.supplierId ?? supplier?.id ?? null,
      customerId: charge.customerId ?? "customer-current",
      cost: charge.costAmount,
      costCurrency: charge.costCurrency,
      sell: charge.sellAmount,
      sellCurrency: charge.sellCurrency,
      costRoe: charge.costExchange,
      sellRoe: charge.sellExchange,
      costRoeSource: charge.costRoeSource === "override" ? "manual" : "rate",
      sellRoeSource: charge.sellRoeSource === "override" ? "manual" : "rate",
      calculationBasis: charge.calculationBasis,
      quantity: charge.quantity,
      baseCost: charge.localCost,
      baseSell: charge.localSell,
      profit: charge.localSell - charge.localCost,
    }
  }), [charges])

  function updateCharges(nextRows: UnifiedQuoteChargeRow[]) {
    onRowsChange(nextRows.map((row, index) => {
      const current = charges.find((charge) => charge.id === row.id) ?? charges[index]
      const supplier = parties.find((party) => party.id === row.supplierId)
      const costRoe = row.costRoe && row.costRoe > 0 ? row.costRoe : 0
      const sellRoe = row.sellRoe && row.sellRoe > 0 ? row.sellRoe : 0
      return {
        ...current,
        id: row.id,
        code: row.code,
        description: row.description,
        creditor: supplier?.name ?? current?.creditor ?? "Supplier pending",
        supplierId: row.supplierId,
        customerId: row.customerId,
        costCurrency: row.costCurrency as QuoteCurrency,
        costAmount: row.cost,
        costExchange: costRoe,
        costRoeSource: row.costRoeSource === "manual" ? "override" : "job",
        localCost: row.baseCost ?? (costRoe > 0 ? row.cost / costRoe : 0),
        sellCurrency: row.sellCurrency as QuoteCurrency,
        sellAmount: row.sell,
        sellExchange: sellRoe,
        sellRoeSource: row.sellRoeSource === "manual" ? "override" : "job",
        calculationBasis: row.calculationBasis ?? current?.calculationBasis ?? "fixed",
        quantity: row.quantity ?? current?.quantity ?? 1,
        localSell: row.baseSell ?? (sellRoe > 0 ? row.sell / sellRoe : 0),
        department: current?.department ?? quote.department ?? "SEA",
        internalNotes: current?.internalNotes ?? "",
        additionalDetail: current?.additionalDetail ?? "",
      }
    }))
  }

  return (
    <UnifiedQuoteChargesWorkspace
      rows={rows}
      onRowsChange={updateCharges}
      parties={parties}
      currencies={currencies}
      exchangeRates={exchangeRates}
      baseCurrency={quote.currency}
      readOnly={!editable}
      storageKey={`quote-${quote.id}-charges`}
    />
  )
}

function QuoteOverviewPanel({ quote }: { quote: QuoteRecord }) {
  const { t } = useLanguage()
  const profitRatio = quote.revenue > 0 ? (quote.profit / quote.revenue) * 100 : 0

  return (
    <div className="grid gap-2">
      <div className="grid gap-1.5 md:grid-cols-3 xl:grid-cols-6">
        <DenseFact label="Quote" value={quote.id} detail={quote.localRef ? `Local ref ${quote.localRef}` : undefined} />
        <DenseFact label="Client" value={quote.customer} detail={quote.clientCode} />
        <DenseFact label="Mode" value={quote.mode} detail={`${quote.container} / ${quote.incoterm}`} />
        <DenseFact label="Lane" value={quote.route} detail={`${quote.origin} -> ${quote.destination}`} />
        <DenseFact label="Validity" value={quote.validity} detail={`${quote.startDate} to ${quote.endDate}`} tone="amber" />
        <DenseFact label="Transit" value={`${quote.transitDays} days`} detail={`Frequency ${quote.frequency}`} />
      </div>

      <div className="grid gap-1.5 xl:grid-cols-[1.1fr_1fr_0.85fr]">
        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title={<span className="inline-flex items-center gap-1.5"><ChartAnalysis className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />{t("AI quote command")}</span>} meta="Fast read on commercial readiness." />
          <div className="mt-2 grid gap-1.5">
            <InsightRow icon={BrainCircuit} title="Recommended next action" detail="Select carrier or confirm freight cost before approval." tone="amber" />
            <InsightRow icon={Gauge} title="Margin guardrail" detail={`Profit ratio ${profitRatio.toFixed(1)} percent against 15 percent target.`} tone={profitRatio >= 15 ? "green" : "amber"} />
            <InsightRow icon={TriangleAlert} title="Send blocker" detail="Consignee and carrier are not selected." tone="amber" />
            <InsightRow icon={CheckCircle2} title="Customer copy" detail="Spot quote PDF can be generated after approval." tone="green" />
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Route and service" meta="Operational shape of the spot quote." />
          <div className="mt-2 grid gap-1.5">
            <DenseFact label="Origin" value={formatLocation(quote.origin, "Bristol")} detail="United Kingdom" />
            <DenseFact label="Via" value={`${quote.via} - Singapore`} detail="Transhipment" />
            <DenseFact label="Destination" value={formatLocation(quote.destination, "Kobe")} detail="Japan" />
            <DenseFact label="HBL mode" value={quote.hblMode ?? "CY/CFS"} detail={quote.serviceLevel ?? "Service level not selected"} />
            <DenseFact label="Quote Type" value={quote.direction ?? "Export"} detail={`${quote.branch} / ${quote.department}`} />
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Commercial summary" meta="Totals only. Line detail lives in Quote charges." />
          <div className="mt-2 grid gap-1.5">
            <DenseFact label="Cost total" value={money(quote.cost)} detail="Estimated local cost" />
            <DenseFact label="Revenue" value={money(quote.revenue)} detail="Customer sell total" tone="green" />
            <DenseFact label="Profit" value={money(quote.profit)} detail={`${quote.margin} margin`} tone="blue" />
          </div>
        </Surface>
      </div>

      <div className="grid gap-1.5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Control data" meta="Audit and conversion fields." />
          <div className="mt-2 grid gap-1.5">
            <DenseFact label="Type" value={quote.quoteType ?? "Local client"} detail={quote.source} />
            <DenseFact label="Status" value={quote.jobStatus ?? quote.status} detail={quote.revisionReason} />
            <DenseFact label="Sales" value={quote.salesRep ?? "AM1"} detail={`Ops ${quote.opsRep ?? "OP2"}`} />
            <DenseFact label="Entries" value={quote.entries ?? "1"} detail={`${quote.invoiceLines ?? "1"} invoice lines`} />
            <DenseFact label="Values" value={quote.goodsValue ?? "0.00 GBP"} detail={`${quote.insuranceValue ?? "0.00 GBP"} insured`} />
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Conversion checklist" meta="What needs to be true before booking." />
          <div className="mt-2 grid gap-1.5 lg:grid-cols-2">
            {[
              [CheckCircle2, "Client and consignor", "HarbourWorks confirmed", "green"],
              [TriangleAlert, "Consignee", "Missing organisation", "amber"],
              [TriangleAlert, "Carrier and creditor", "Not selected", "amber"],
              [ListChecks, "Charge lines", "9 lines, 2 review points", "blue"],
              [CheckCircle2, "Terms and route", "DAP / CY-CFS / 55 days", "green"],
            ].map(([Icon, title, detail, tone]) => (
              <InsightRow key={title as string} icon={Icon as typeof BrainCircuit} title={title as string} detail={detail as string} tone={tone as StatusTone} />
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}

function QuoteAiOverviewPanel({ quote }: { quote: QuoteRecord }) {
  const { t } = useLanguage()
  const profitRatio = quote.revenue > 0 ? (quote.profit / quote.revenue) * 100 : 0

  return (
    <div className="grid gap-1.5">
      <div className="grid gap-1.5 xl:grid-cols-[1.15fr_0.85fr]">
        <Surface padding="xs" className="rounded-[var(--md-radius-md)] bg-[linear-gradient(135deg,var(--md-accent-a13),rgba(255,255,255,0.86)_42%,rgba(74,125,156,0.12))]">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill tone="blue"><AiEditing className="size-3" strokeWidth={1.4} aria-hidden="true" />AI modern</StatusPill>
                <span data-i18n-skip dir="ltr" className="text-[12px] font-medium text-[var(--md-subtle)]">{quote.id}</span>
                <span className="text-[12px] text-[var(--md-subtle)]">/</span>
                <span data-i18n-skip dir="auto" className="text-[12px] font-medium text-[var(--md-ink)]">{quote.customer}</span>
              </div>
              <h2 className="mt-2 text-[20px] font-medium leading-6 text-[var(--md-ink)]">{t("Approve with conditions")}</h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-4 text-[var(--md-text)]">
                {t("Margin is inside guardrail, but consignee and carrier selection should be completed before customer issue.")}
              </p>
              <div className="mt-3 grid gap-1.5 md:grid-cols-3">
                <DenseFact label="Route" value={quote.route} detail={`${quote.origin} -> ${quote.destination}`} />
                <DenseFact label="Mode" value={quote.mode} detail={`${quote.container} / ${quote.incoterm}`} />
                <DenseFact label="Validity" value={quote.validity} detail={`${quote.transitDays} days transit`} tone="amber" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <DenseFact label="Readiness" value="72%" detail="Ready after two fixes" tone="amber" />
              <DenseFact label="Risk" value="Medium" detail="Carrier and consignee missing" tone="amber" />
              <DenseFact label="Next action" value="Complete carrier" detail="Then approve quote" tone="blue" />
            </div>
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Commercial totals" meta="Overview only." />
          <div className="mt-2 grid gap-1.5">
            <DenseFact label="Cost" value={money(quote.cost)} detail="Estimated local cost" />
            <DenseFact label="Revenue" value={money(quote.revenue)} detail="Customer sell total" tone="green" />
            <DenseFact label="Profit" value={money(quote.profit)} detail={`${quote.margin} margin`} tone={profitRatio >= 15 ? "green" : "amber"} />
          </div>
        </Surface>
      </div>

      <div className="grid gap-1.5 xl:grid-cols-[0.95fr_1.05fr_1fr]">
        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title={<span className="inline-flex items-center gap-1.5"><BrainCircuit className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />{t("AI checks")}</span>} meta="Signal, not a price build-up." />
          <div className="mt-2 grid gap-1.5">
            <InsightRow icon={Gauge} title="Margin guardrail" detail={`Profit ratio ${profitRatio.toFixed(1)} percent against 15 percent target.`} tone={profitRatio >= 15 ? "green" : "amber"} />
            <InsightRow icon={TriangleAlert} title="Issue blockers" detail="Consignee, carrier, and creditor are incomplete." tone="amber" />
            <InsightRow icon={CheckCircle2} title="Customer copy" detail="Quote PDF can be generated after approval." tone="green" />
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Operational snapshot" meta="Freight context for staff review." />
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
            <DenseFact label="Origin" value={formatLocation(quote.origin, "Bristol")} detail="United Kingdom" />
            <DenseFact label="Destination" value={formatLocation(quote.destination, "Kobe")} detail="Japan" />
            <DenseFact label="Via" value={`${quote.via} - Singapore`} detail="Transhipment" />
            <DenseFact label="HBL mode" value={quote.hblMode ?? "CY/CFS"} detail={quote.serviceLevel ?? "Not selected"} />
          </div>
        </Surface>

        <Surface padding="xs" className="rounded-[var(--md-radius-md)]">
          <SectionHeader title="Work queue" meta="Human actions before booking." />
          <div className="mt-2 grid gap-1.5">
            <InsightRow icon={ListChecks} title="Confirm carrier" detail="No carrier selected on the quote." tone="amber" />
            <InsightRow icon={ListChecks} title="Add consignee" detail="Customer issue should be blocked until set." tone="amber" />
            <InsightRow icon={CheckCircle2} title="Approve commercial" detail={`${quote.margin} margin currently meets target.`} tone="green" />
          </div>
        </Surface>
      </div>
    </div>
  )
}

function CargoWiseField({
  label,
  value,
  span = false,
  compact = false,
  fitValue = false,
  compactLabel = "fixed",
  compactPadding = "default",
  editable = false,
  className,
  action,
  onChange,
}: {
  label: string
  value: string
  span?: boolean
  compact?: boolean
  fitValue?: boolean
  compactLabel?: "fixed" | "content" | "tight"
  compactPadding?: "default" | "square"
  editable?: boolean
  className?: string
  action?: ReactNode
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()
  const inputId = useId()

  return (
    <div className={cn(
      "md-cargowise-field grid min-w-0 items-center",
      compact
        ? compactLabel === "content"
          ? "grid-cols-[max-content_minmax(0,1fr)] gap-1"
          : compactLabel === "tight"
            ? "grid-cols-[44px_minmax(0,1fr)] gap-1"
          : "grid-cols-[64px_minmax(0,1fr)] gap-1"
        : "grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)] gap-1.5",
      span && "md:col-span-2",
      className,
    )}>
      <label htmlFor={inputId} className={cn("min-w-0 whitespace-normal break-words text-[11px] font-medium leading-[1.15] text-[var(--md-text)]", compactLabel === "content" ? "text-start" : "text-end")}>{t(label)}</label>
      <div className={cn("grid min-w-0", action && "grid-cols-[minmax(0,1fr)_auto] gap-0.5")}>
        {editable ? <input
          id={inputId}
          data-i18n-skip
          dir="auto"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            "min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[11px] font-medium text-[var(--md-ink)] outline-none shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
            compact ? "min-h-7 px-1.5 py-1 leading-5" : "min-h-8 px-2 py-1.5 leading-5",
            fitValue && "w-fit max-w-full",
          )}
        /> : <span id={inputId} data-i18n-skip dir="auto" className={cn(
          "min-w-0 truncate rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          compact
            ? compactPadding === "square"
              ? "min-h-7 p-1 leading-5"
              : "min-h-7 px-1.5 py-1 leading-5"
            : "min-h-8 px-2 py-1.5 leading-5",
          fitValue && "w-fit max-w-full",
        )}>{value || "—"}</span>}
        {action}
      </div>
    </div>
  )
}

function CargoWiseLookupField({
  label,
  value,
  action = "search",
  span = false,
  compact = false,
  editable = false,
  maxLength,
  required = false,
  invalid = false,
  className,
  onChange,
}: {
  label: string
  value: string
  action?: "search" | "date" | "more"
  span?: boolean
  compact?: boolean
  editable?: boolean
  maxLength?: number
  required?: boolean
  invalid?: boolean
  className?: string
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()
  const inputId = useId()
  const dateInputRef = useRef<HTMLInputElement>(null)
  const Icon = action === "date" ? CalendarDays : action === "more" ? MoreHorizontal : Search
  const isDateField = action === "date"

  function openDatePicker() {
    const input = dateInputRef.current
    if (!input) return
    if (typeof input.showPicker === "function") input.showPicker()
    else input.focus()
  }

  return (
    <div className={cn(
      "md-cargowise-lookup-field grid min-w-0 items-center",
      compact ? "grid-cols-[64px_minmax(0,1fr)_28px] gap-1" : "grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)_32px] gap-1.5",
      span && "md:col-span-2",
      className,
    )}>
      <label htmlFor={inputId} className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</label>
      {editable ? (
        <input
          ref={isDateField ? dateInputRef : undefined}
          id={inputId}
          data-i18n-skip
          dir={isDateField ? "ltr" : "auto"}
          type={isDateField ? "date" : "text"}
          value={isDateField ? quoteDateInputValue(value) : value}
          maxLength={maxLength}
          required={required}
          aria-required={required}
          aria-invalid={invalid || undefined}
          placeholder={required ? t("Required") : undefined}
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            "min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[11px] font-medium text-[var(--md-ink)] outline-none shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
            compact ? "min-h-7 px-1.5 py-1 leading-5" : "min-h-8 px-2 py-1.5 leading-5",
            isDateField && "appearance-none [&::-webkit-calendar-picker-indicator]:hidden",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        />
      ) : (
        <span id={inputId} data-i18n-skip dir="auto" className={cn(
          "min-w-0 truncate rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          compact ? "min-h-7 px-1.5 py-1 leading-5" : "min-h-8 px-2 py-1.5 leading-5",
          invalid && "ring-1 ring-[var(--md-red)]",
        )}>
          {value || "—"}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        disabled={!editable}
        onClick={isDateField ? openDatePicker : undefined}
        className={cn("rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] p-0 text-[var(--md-accent)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)]", compact ? "size-7" : "size-8")}
        aria-label={t(isDateField ? `Choose ${label} date` : `Search ${label}`)}
      >
        <Icon className="size-3.5" strokeWidth={1.4} />
      </Button>
    </div>
  )
}

type CargoWiseSelectOption = string | { value: string; label: string }

function CargoWiseSearchSelectField({
  label,
  value,
  options,
  editable = false,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  editable?: boolean
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()
  const triggerId = useId()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selectedOption = options.find((option) => option.value === value)
  const filteredOptions = options.filter((option) => `${option.value} ${option.label}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  useEffect(() => {
    if (open) window.setTimeout(() => searchInputRef.current?.focus(), 0)
    else setSearch("")
  }, [open])

  return (
    <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-1.5">
      <label htmlFor={triggerId} className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            type="button"
            variant="ghost"
            disabled={!editable}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${triggerId}-options`}
            className="h-8 w-full min-w-0 justify-between rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2.5 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)]"
          >
            <span className="truncate">{selectedOption?.label || t("Select")}</span>
            <ChevronDown className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent id={`${triggerId}-options`} align="start" sideOffset={5} className="w-[var(--radix-popover-trigger-width)] min-w-[220px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)]">
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Type customer code")}
              aria-label={t("Search customer code")}
              className="h-8 rounded-[var(--md-radius-md)] ps-7 text-[12px]"
            />
          </div>
          <div className="max-h-56 overflow-y-auto" role="listbox">
            <button type="button" role="option" aria-selected={!value} className="md-dropdown-option flex min-h-8 w-full items-center rounded-[var(--md-radius-md)] px-2 text-start text-[12px] text-[var(--md-text)]" onClick={() => { onChange?.(""); setOpen(false) }}>
              {t("Select")}
            </button>
            {filteredOptions.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={option.value === value} className="md-dropdown-option flex min-h-8 w-full items-center rounded-[var(--md-radius-md)] px-2 text-start text-[12px] text-[var(--md-text)]" onClick={() => { onChange?.(option.value); setOpen(false) }}>
                <span className="truncate">{option.label}</span>
              </button>
            ))}
            {!filteredOptions.length && <p className="px-2 py-2 text-[12px] text-[var(--md-subtle)]">{t("No matching customer codes")}</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function CargoWiseSelectField({
  label,
  value,
  options,
  span = false,
  compact = false,
  required = false,
  invalid = false,
  editable = false,
  dataOptions = false,
  action,
  valueIcon: ValueIcon,
  onChange,
}: {
  label: string
  value: string
  options: CargoWiseSelectOption[]
  span?: boolean
  compact?: boolean
  required?: boolean
  invalid?: boolean
  editable?: boolean
  dataOptions?: boolean
  action?: ReactNode
  valueIcon?: typeof Search
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()
  const triggerId = useId()
  const emptyValue = "__multideck_select_empty__"
  const normalizedOptions = options.map((option) => typeof option === "string"
    ? { value: option, label: option }
    : option)

  return (
    <div className={cn(
      "grid min-w-0 items-center",
      compact
        ? action ? "grid-cols-[64px_minmax(0,1fr)_28px] gap-1" : "grid-cols-[64px_minmax(0,1fr)] gap-1"
        : action ? "grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)_32px] gap-1.5" : "grid-cols-[var(--md-field-label-width,76px)_minmax(0,1fr)] gap-1.5",
      span && "md:col-span-2",
    )}>
      <label htmlFor={triggerId} className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</label>
      <Select value={value || emptyValue} onValueChange={(nextValue) => onChange?.(nextValue === emptyValue ? "" : nextValue)} required={required} disabled={!editable}>
        <SelectTrigger
          id={triggerId}
          data-i18n-skip={dataOptions || undefined}
          dir={dataOptions ? "auto" : undefined}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          className={cn(
            "w-full min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)]",
            compact ? "h-7 px-1.5 text-[10.5px]" : "h-8 px-2 text-[11px]",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        >
          {ValueIcon ? <ValueIcon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" /> : null}
          <SelectValue placeholder={t("Select")} />
        </SelectTrigger>
        <SelectContent className="rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
          <SelectItem value={emptyValue} className="text-[12px]">{t("Select")}</SelectItem>
          {normalizedOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} data-i18n-skip={dataOptions || undefined} dir={dataOptions ? "auto" : undefined} className="text-[12px]">
              {dataOptions ? option.label : t(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {action}
    </div>
  )
}

function CargoWiseActionStrip({ actions }: { actions: Array<{ label: string; icon: typeof Search }> }) {
  const { t } = useLanguage()

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ label, icon: Icon }) => (
        <Button key={label} type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2.5 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
          <Icon data-icon="inline-start" className="size-3" strokeWidth={1.4} />
          {t(label)}
        </Button>
      ))}
    </div>
  )
}

function CargoWiseGroup({
  title,
  children,
  headerAction,
  icon: Icon,
  compact = false,
  className,
  contentClassName,
}: {
  title: string
  children: ReactNode
  headerAction?: ReactNode
  icon?: typeof Search
  compact?: boolean
  className?: string
  contentClassName?: string
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("h-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "p-2" : "p-2.5", className)}>
      <div className={cn("flex min-w-0 items-center justify-between gap-2", compact ? "mb-1.5" : "mb-2")}>
        <h3 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium leading-4 text-[var(--md-ink)]">
          {Icon ? <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" /> : null}
          <span>{t(title)}</span>
        </h3>
        {headerAction}
      </div>
      <div className={cn("grid", compact ? "gap-1.5" : "gap-2", contentClassName)}>{children}</div>
    </section>
  )
}

function QuoteCargoWiseOverviewPanel({ quote, intelligence, intelligenceUnavailable = false }: { quote: QuoteRecord; intelligence: QuoteIntelligenceSnapshot | null; intelligenceUnavailable?: boolean }) {
  const { t } = useLanguage()
  const currency = quote.currency || ""
  const displayMoney = (value: number) => currency ? money(value, currency) : value.toFixed(2)
  const incoterm = quoteIncotermDisplay(quote.incoterm, quote.incotermPlace)

  return (
    <div className="md-quote-cargowise-overview grid gap-2">
      <QuoteOverviewSignals quote={quote} intelligence={intelligence} intelligenceUnavailable={intelligenceUnavailable} compact />

      <div className="md-quote-cargowise-primary-grid grid min-w-0 gap-2">
        <CargoWiseGroup title="Quote header" compact>
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Type" value={quote.quoteType ?? ""} compact />
            <CargoWiseField label="Source" value={quote.source ?? ""} compact />
            <CargoWiseField label="Client" value={`${quote.clientCode ?? ""} / ${quote.customer}`} fitValue compact />
            <CargoWiseField label="Local ref" value={quote.localRef ?? ""} compact />
            <CargoWiseField label="Start date" value={quote.startDate ?? ""} compact />
            <CargoWiseField label="End date" value={quote.endDate ?? ""} compact />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="Routing" compact>
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Transport" value={quote.mode} compact />
            <CargoWiseField label="Shipment type" value={quote.shipmentType ?? quote.container} compact />
            <CargoWiseField label="Incoterm" value={incoterm} span compact />
            <CargoWiseField label="Origin" value={quote.origin} compact compactPadding="square" />
            <CargoWiseField label="Destination" value={quote.destination} compact />
            <CargoWiseField label="Via" value={quote.via} compact />
            <CargoWiseField label="Transit" value={quote.transitDays ? `${quote.transitDays} days` : ""} compact />
            <CargoWiseField label="HBL mode" value={quote.hblMode ?? ""} compact />
            <CargoWiseField label="Quote Type" value={quote.direction ?? ""} compact />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="Totals" compact className="md-quote-cargowise-totals">
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Cost" value={displayMoney(quote.cost)} compact compactLabel="tight" />
            <CargoWiseField label="Rev." value={displayMoney(quote.revenue)} compact compactLabel="tight" />
            <CargoWiseField label="Profit" value={displayMoney(quote.profit)} compact compactLabel="tight" />
            <CargoWiseField label="Margin" value={quote.margin || "—"} compact compactLabel="tight" />
            <CargoWiseField label="Status" value={quote.jobStatus ?? quote.status} span compact compactLabel="tight" />
          </div>
        </CargoWiseGroup>
      </div>

      <div className="md-quote-cargowise-intelligence-grid grid min-w-0 gap-2">
        <span className="sr-only">{t("Pricing and win-rate insights will appear here when this quote has real customer and rate history.")}</span>
        <ClientPricingIntelligence intelligence={intelligence} unavailable={intelligenceUnavailable} />
        <RecentQuotesSummary quote={quote} intelligence={intelligence} unavailable={intelligenceUnavailable} />
      </div>
    </div>
  )
}

function QuoteCargoWiseDetailsPanel({
  quote,
  editable,
  requireCoreFields = true,
  validationAttempted,
  onQuoteChange,
  onCustomerCreate,
  lookups,
}: {
  quote: QuoteRecord
  editable: boolean
  requireCoreFields?: boolean
  validationAttempted: boolean
  onQuoteChange: (field: keyof QuoteRecord, value: string) => void
  onCustomerCreate: (name: string, code: string) => void
  lookups?: QuoteWorkflowSources | null
}) {
  const { direction, t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerCode, setNewCustomerCode] = useState("")
  const [savedPartyAddresses, setSavedPartyAddresses] = useState<SavedPartyAddress[]>([])
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [addressDialogTarget, setAddressDialogTarget] = useState<"collection" | "delivery">("collection")
  const [newSavedAddress, setNewSavedAddress] = useState("")
  const [newSavedAddressType, setNewSavedAddressType] = useState<SavedPartyAddress["type"]>("Collection address")
  const [emailCopied, setEmailCopied] = useState(false)
  const emailCopyResetTimerRef = useRef<number | null>(null)
  const carrierChoices = lookups?.carriers.map((option) => option.name) ?? carrierOptions
  const supplierChoices = lookups?.suppliers.map((option) => option.name) ?? supplierOptions
  const selectedCarrier = quote.carrier && carrierChoices.includes(quote.carrier) ? quote.carrier : ""
  const selectedCarrierOrganisation = lookups?.organisations.find((option) => option.id === quote.carrierId || option.name === selectedCarrier)
  const selectedCarrierOffices = selectedCarrierOrganisation?.addresses.map((address) => address.label) ?? (selectedCarrier ? carrierOfficeOptions[selectedCarrier] ?? [] : [])
  const selectedCarrierOffice = quote.carrierOffice && selectedCarrierOffices.includes(quote.carrierOffice) ? quote.carrierOffice : ""
  const selectedSupplier = quote.supplier && supplierChoices.includes(quote.supplier) ? quote.supplier : ""
  const selectedSupplierOrganisation = lookups?.organisations.find((option) => option.id === quote.supplierId || option.name === selectedSupplier)
  const selectedSupplierOffices = selectedSupplierOrganisation?.addresses.map((address) => address.label) ?? (selectedSupplier ? supplierOfficeOptions[selectedSupplier] ?? [] : [])
  const selectedSupplierOffice = quote.supplierOffice && selectedSupplierOffices.includes(quote.supplierOffice) ? quote.supplierOffice : ""
  const customerChoices = lookups?.organisations.map((option) => ({
    value: option.code || option.name,
    label: option.code || option.name,
  })) ?? []
  const officeChoices = lookups?.offices.map((option) => option.code || option.name) ?? []
  const departmentChoices = lookups?.departments.map((option) => option.name) ?? []
  const salesChoices = lookups?.users.reduce<Array<{ value: string; label: string }>>((choices, option) => {
    const label = option.name.trim()
    if (!label || choices.some((choice) => choice.label.localeCompare(label, undefined, { sensitivity: "accent" }) === 0)) return choices
    choices.push({ value: option.id, label })
    return choices
  }, []) ?? salesRepresentativeOptions
  const selectedSalesOwnerId = quote.salesOwnerId || lookups?.users.find((option) => option.name === quote.salesRep)?.id || ""
  const modeChoices = lookups?.modes.map((option) => option.name) ?? cargoWiseModeOptions
  const shipmentTypeChoices = lookups?.shipmentTypes.map((option) => `${option.code} - ${option.name}`) ?? shipmentTypeOptions(quote.mode)
  const currencyChoices = lookups?.currencies.map((option) => option.code) ?? ["GBP", "EUR", "USD"]

  useEffect(() => () => {
    if (emailCopyResetTimerRef.current !== null) window.clearTimeout(emailCopyResetTimerRef.current)
  }, [])

  async function copyCustomerEmail() {
    const email = customerEmail.trim()
    if (!email) return

    try {
      await navigator.clipboard.writeText(email)
      if (emailCopyResetTimerRef.current !== null) window.clearTimeout(emailCopyResetTimerRef.current)
      setEmailCopied(true)
      emailCopyResetTimerRef.current = window.setTimeout(() => {
        setEmailCopied(false)
        emailCopyResetTimerRef.current = null
      }, 1800)
    } catch {
      setEmailCopied(false)
    }
  }

  const customerEmail = quote.customerEmail ?? ""
  const customerEmailActions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-[26px] rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] p-0 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background,color,transform] duration-200 hover:bg-[var(--md-field-bg-hover)] hover:text-[var(--md-accent)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
            aria-label={t(emailCopied ? "Email copied" : "Copy email")}
            onClick={() => void copyCustomerEmail()}
          >
            <CopyStatusIcon copied={emailCopied} iconClassName="size-3.5" className={emailCopied ? "text-[var(--md-accent)]" : undefined} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t(emailCopied ? "Copied" : "Copy email")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="size-[26px] rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] p-0 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background,color,transform] duration-200 hover:bg-[var(--md-field-bg-hover)] hover:text-[var(--md-accent)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <a href={`mailto:${customerEmail}`} aria-label={t("Send email")}>
              <Mail className="size-3.5" strokeWidth={1.4} />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("Send email")}</TooltipContent>
      </Tooltip>
    </div>
  )

  function updateCarrier(company: string) {
    const organisation = lookups?.carriers.find((option) => option.name === company)
    onQuoteChange("carrier", company)
    onQuoteChange("carrierId", organisation?.id ?? "")
    onQuoteChange("carrierOffice", "")
  }

  function updateSupplier(company: string) {
    const organisation = lookups?.suppliers.find((option) => option.name === company)
    onQuoteChange("supplier", company)
    onQuoteChange("supplierId", organisation?.id ?? "")
    onQuoteChange("supplierOffice", "")
  }

  function selectCustomer(codeOrName: string) {
    const organisation = lookups?.organisations.find((option) => (option.code || option.name) === codeOrName)
    onQuoteChange("customerId", organisation?.id ?? "")
    onQuoteChange("clientCode", organisation?.code ?? codeOrName)
    onQuoteChange("customer", organisation?.name ?? "")
    onQuoteChange("customerAddress", organisation?.addresses[0]?.address ?? "")
    onQuoteChange("contactId", "")
    onQuoteChange("customerContact", "")
    onQuoteChange("customerEmail", "")
  }

  function openCustomerDialog() {
    setNewCustomerName("")
    setNewCustomerCode("")
    setCustomerDialogOpen(true)
  }

  function createCustomer() {
    const name = newCustomerName.trim()
    if (!name) return

    onCustomerCreate(name, newCustomerCode.trim().toUpperCase())
    setCustomerDialogOpen(false)
  }

  function openAddressDialog(target: "collection" | "delivery") {
    setAddressDialogTarget(target)
    setNewSavedAddress("")
    setNewSavedAddressType(target === "collection" ? "Collection address" : "Delivery address")
    setAddressDialogOpen(true)
  }

  function savePartyAddress() {
    const address = newSavedAddress.trim()
    if (!address) return

    setSavedPartyAddresses((current) => {
      if (current.some((savedAddress) => savedAddress.address === address && savedAddress.type === newSavedAddressType)) return current
      return [...current, { id: `saved-address-${Date.now()}`, address, type: newSavedAddressType }]
    })

    const matchesTarget = newSavedAddressType === "Main office"
      || (addressDialogTarget === "collection" && newSavedAddressType === "Collection address")
      || (addressDialogTarget === "delivery" && newSavedAddressType === "Delivery address")

    if (matchesTarget) {
      onQuoteChange(addressDialogTarget === "collection" ? "collectionAddress" : "deliveryAddress", address)
    }
    setAddressDialogOpen(false)
  }

  const addressesFor = (target: "collection" | "delivery") => {
    const selectedOrganisationIds = [quote.customerId, quote.shipperOrgId, quote.consigneeOrgId].filter(Boolean)
    const organisationAddresses = (lookups?.organisations ?? [])
      .filter((organisation) => selectedOrganisationIds.includes(organisation.id))
      .flatMap((organisation) => organisation.addresses.map((address) => address.address))
    const quoteAddresses = savedPartyAddresses
      .filter(({ type }) => type === "Main office" || type === (target === "collection" ? "Collection address" : "Delivery address"))
      .map(({ address }) => address)
    return [...new Set([...organisationAddresses, ...quoteAddresses].filter(Boolean))]
  }

  function changeMode(mode: string) {
    onQuoteChange("mode", mode)
    const nextShipmentType = shipmentTypeValue(mode, quote.shipmentType, shipmentTypeChoicesForMode(mode, shipmentTypeChoices))
    if (nextShipmentType !== quote.shipmentType) onQuoteChange("shipmentType", nextShipmentType)
  }

  const addAddressAction = (target: "collection" | "delivery") => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-0 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"
          aria-label={t(target === "collection" ? "Add collection address" : "Add delivery address")}
          onClick={() => openAddressDialog(target)}
        >
          <Plus className="size-3.5" strokeWidth={1.4} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("Use quote address")}</TooltipContent>
    </Tooltip>
  )

  function useCustomerForParty(party: "shipper" | "consignee") {
    const fields = party === "shipper"
      ? { code: "shipperCode", name: "shipperName", address: "shipperAddress" } as const
      : { code: "consigneeCode", name: "consigneeName", address: "consigneeAddress" } as const

    onQuoteChange(fields.code, quote.clientCode ?? "")
    onQuoteChange(fields.name, quote.customer)
    onQuoteChange(fields.address, quote.customerAddress ?? "")
  }

  const useCustomerAction = (party: "Shipper" | "Consignee") => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-[var(--md-radius-sm)] px-1.5 text-[10.5px] font-medium text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]"
          aria-label={`${t("Use customer")}: ${t(party)}`}
          onClick={() => useCustomerForParty(party === "Shipper" ? "shipper" : "consignee")}
        >
          <Copy data-icon="inline-start" className="size-3" strokeWidth={1.4} />
          {t("Use customer")}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("Use customer details")}</TooltipContent>
    </Tooltip>
  )

  const addressOverrideAction = (party: "Shipper" | "Consignee") => {
    const field = party === "Shipper" ? "shipperAddressOverride" : "consigneeAddressOverride"
    const checked = quote[field] === "Yes"

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            className={cn(
              "group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--md-radius-sm)] px-1.5 text-[10.5px] font-medium text-[var(--md-subtle)] outline-none transition-[background,color,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
              checked && "bg-[var(--md-accent-a07)] text-[var(--md-ink)]",
            )}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(next) => onQuoteChange(field, next === true ? "Yes" : "No")}
              aria-label={`${t("Address override")}: ${t(party)}`}
              className="size-4"
            />
            <span>{t("Override address")}</span>
          </label>
        </TooltipTrigger>
        <TooltipContent>{t("Allow a manual address for this party")}</TooltipContent>
      </Tooltip>
    )
  }

  const partyHeaderActions = (party: "Shipper" | "Consignee") => (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-0.5" dir={direction}>
      {useCustomerAction(party)}
      {addressOverrideAction(party)}
    </div>
  )

  return (
    <div className="grid items-start gap-[var(--md-page-stack-gap-compact)]">
      <CargoWiseGroup title="Job data" compact>
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Quote control")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseLookupField label="Customer ref" value={quote.localRef ?? ""} compact editable={false} />
              <CargoWiseLookupField label="Valid from" value={quote.startDate ?? ""} action="date" compact editable={editable} onChange={(value) => onQuoteChange("startDate", value)} />
              <CargoWiseLookupField label="Valid to" value={quote.endDate ?? ""} action="date" compact editable={editable} onChange={(value) => onQuoteChange("endDate", value)} />
              <CargoWiseSelectField label="Source" value={quote.source ?? ""} options={["NEW - New Shipper", "REN - Renewal", "REP - Repeat lane", "TND - Tender"]} compact editable={editable} onChange={(value) => onQuoteChange("source", value)} />
              <CargoWiseSelectField label="Mode" value={quote.mode} options={modeChoices} compact editable={editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.mode.trim()} onChange={changeMode} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Ownership")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseSelectField label="Quote Type" value={quote.direction ?? ""} options={["Export", "Import", "Domestic", "Cross trade"]} compact editable={editable} onChange={(value) => onQuoteChange("direction", value)} />
              <CargoWiseSelectField label="Dept" value={quote.department ?? ""} options={departmentChoices} compact editable={editable} dataOptions onChange={(value) => {
                const department = lookups?.departments.find((option) => option.name === value)
                onQuoteChange("department", value)
                onQuoteChange("departmentId", department?.id ?? "")
              }} />
              <CargoWiseSelectField label="Priority" value={quote.priority ?? ""} options={["Low", "Standard", "High", "Tender"]} compact editable={editable} onChange={(value) => onQuoteChange("priority", value)} />
              <CargoWiseSelectField label="Branch" value={quote.branch ?? ""} options={officeChoices} compact editable={editable} dataOptions onChange={(value) => {
                const office = lookups?.offices.find((option) => (option.code || option.name) === value)
                onQuoteChange("branch", value)
                onQuoteChange("officeId", office?.id ?? "")
              }} />
              <CargoWiseSelectField
                label="Sales rep"
                value={selectedSalesOwnerId}
                options={salesChoices}
                compact
                editable={editable}
                dataOptions
                onChange={(userId) => {
                  const user = lookups?.users.find((option) => option.id === userId)
                  onQuoteChange("salesRep", user?.name ?? "")
                  onQuoteChange("salesOwnerId", userId)
                }}
              />
              <CargoWiseSelectField label="Hold reason" value={quote.holdReason ?? ""} options={["None", "Missing carrier", "Missing consignee", "Margin review", "Credit check"]} compact editable={editable} onChange={(value) => onQuoteChange("holdReason", value)} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("References")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseLookupField label="Customer PO" value={quote.customerPO ?? ""} compact editable={editable} onChange={(value) => onQuoteChange("customerPO", value)} />
              <CargoWiseLookupField label="Shipper ref" value={quote.shipperReference ?? ""} compact editable={editable} onChange={(value) => onQuoteChange("shipperReference", value)} />
              <CargoWiseLookupField label="Agent ref" value={quote.agentReference ?? ""} compact editable={editable} onChange={(value) => onQuoteChange("agentReference", value)} />
              <CargoWiseLookupField label="Carrier ref" value={quote.carrierReference ?? ""} compact editable={editable} onChange={(value) => onQuoteChange("carrierReference", value)} />
              <CargoWiseSelectField label="Docs" value={quote.docsStatus ?? ""} options={["Draft", "Ready", "Sent", "Signed"]} compact editable={editable} onChange={(value) => onQuoteChange("docsStatus", value)} />
            </div>
          </div>
        </div>
      </CargoWiseGroup>

      <section>
        <div className="grid items-stretch gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[1.26fr_1.08fr_1fr]">
          <CargoWiseGroup
            title="Customer"
            className="[--md-field-label-width:64px]"
            contentClassName="md:grid-cols-[minmax(130px,0.64fr)_minmax(0,1.36fr)]"
            headerAction={(
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]"
                    aria-label={t("Use one-off customer")}
                    onClick={openCustomerDialog}
                  >
                    <Plus className="size-3.5" strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("Use one-off customer")}</TooltipContent>
              </Tooltip>
            )}
          >
            <div className="grid min-w-0 gap-2 md:col-span-2 md:grid-cols-[minmax(160px,0.76fr)_minmax(0,1.24fr)]">
              <CargoWiseSearchSelectField label="Code" value={quote.clientCode ?? ""} options={customerChoices} editable={editable} onChange={selectCustomer} />
              <CargoWiseField label="Name" value={quote.customer} editable={editable} onChange={(value) => onQuoteChange("customer", value)} />
            </div>
            <CargoWiseField label="Address" value={quote.customerAddress ?? ""} span editable={editable} onChange={(value) => onQuoteChange("customerAddress", value)} />
            <CargoWiseLookupField label="Contact" value={quote.customerContact ?? ""} className="[--md-field-label-width:46px]" editable={editable} onChange={(value) => onQuoteChange("customerContact", value)} />
            <CargoWiseField label="Email" value={customerEmail} className="[--md-field-label-width:38px]" action={customerEmailActions} editable={editable} onChange={(value) => onQuoteChange("customerEmail", value)} />
          </CargoWiseGroup>

          <CargoWiseGroup
            title="Shipper"
            className="[--md-field-label-width:64px]"
            contentClassName="md:grid-cols-[minmax(146px,0.72fr)_minmax(0,1.28fr)]"
            headerAction={partyHeaderActions("Shipper")}
          >
            <div className="grid min-w-0 gap-2 md:col-span-2 md:grid-cols-[minmax(160px,0.76fr)_minmax(0,1.24fr)]">
              <CargoWiseLookupField label="Code" value={quote.shipperCode ?? ""} maxLength={12} editable={editable} onChange={(value) => onQuoteChange("shipperCode", value)} />
              <CargoWiseField label="Name" value={quote.shipperName ?? ""} editable={editable} onChange={(value) => onQuoteChange("shipperName", value)} />
            </div>
            <CargoWiseField
              label="Address"
              value={quote.shipperAddress ?? ""}
              span
              editable={editable && (!quote.shipperAddress || quote.shipperAddressOverride === "Yes")}
              onChange={(value) => onQuoteChange("shipperAddress", value)}
            />
            <CargoWiseLookupField label="Contact" value={quote.shipperContact ?? ""} className="[--md-field-label-width:46px]" editable={editable} onChange={(value) => onQuoteChange("shipperContact", value)} />
            <CargoWiseSelectField
              label="Collection"
              value={quote.collectionAddress ?? ""}
              options={addressesFor("collection")}
              editable={editable}
              dataOptions
              action={addAddressAction("collection")}
              onChange={(value) => onQuoteChange("collectionAddress", value)}
            />
          </CargoWiseGroup>

          <CargoWiseGroup
            title="Consignee"
            className="[--md-field-label-width:64px]"
            contentClassName="md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
            headerAction={partyHeaderActions("Consignee")}
          >
            <div className="grid min-w-0 gap-2 md:col-span-2 md:grid-cols-[minmax(160px,0.76fr)_minmax(0,1.24fr)]">
              <CargoWiseLookupField label="Code" value={quote.consigneeCode ?? ""} maxLength={12} editable={editable} onChange={(value) => onQuoteChange("consigneeCode", value)} />
              <CargoWiseField label="Name" value={quote.consigneeName ?? ""} editable={editable} onChange={(value) => onQuoteChange("consigneeName", value)} />
            </div>
            {quote.consigneeAddress || quote.consigneeAddressOverride === "Yes" ? (
              <CargoWiseField
                label="Address"
                value={quote.consigneeAddress ?? ""}
                span
                editable={quote.consigneeAddressOverride === "Yes"}
                onChange={(value) => onQuoteChange("consigneeAddress", value)}
              />
            ) : null}
            <CargoWiseSelectField
              label="Delivery"
              value={quote.deliveryAddress ?? ""}
              options={addressesFor("delivery")}
              editable={editable}
              dataOptions
              action={addAddressAction("delivery")}
              span
              onChange={(value) => onQuoteChange("deliveryAddress", value)}
            />
          </CargoWiseGroup>
        </div>
      </section>

      <CargoWiseGroup title="Service & carrier">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Service")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
              <CargoWiseSelectField
                label="Shipment type"
                value={shipmentTypeValue(quote.mode, quote.shipmentType, shipmentTypeChoicesForMode(quote.mode, shipmentTypeChoices))}
                options={shipmentTypeChoicesForMode(quote.mode, shipmentTypeChoices)}
                editable={editable}
                onChange={(value) => onQuoteChange("shipmentType", value)}
              />
              <div className="grid min-w-0 gap-1 md:col-span-2 md:grid-cols-2 xl:col-span-2">
                <CargoWiseSelectField label="Incoterms" value={quote.incoterm} options={["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"]} editable={editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.incoterm.trim()} onChange={(value) => onQuoteChange("incoterm", value)} />
                <CargoWiseField label="Named place" value={quote.incotermPlace ?? ""} editable={editable} onChange={(value) => onQuoteChange("incotermPlace", value)} />
              </div>
              <CargoWiseSelectField label="HBL mode" value={quote.hblMode ?? ""} options={["CY/CFS", "CY/CY", "CFS/CFS", "Door/Door"]} editable={editable} onChange={(value) => onQuoteChange("hblMode", value)} />
              <CargoWiseLookupField label="From" value={quote.origin} editable={editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.origin.trim()} onChange={(value) => onQuoteChange("origin", value)} />
              <CargoWiseLookupField label="To" value={quote.destination} editable={editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.destination.trim()} onChange={(value) => onQuoteChange("destination", value)} />
              <CargoWiseLookupField label="Via" value={quote.via} editable={editable} onChange={(value) => onQuoteChange("via", value)} />
              <CargoWiseField label="Transit" value={quote.transitDays ?? ""} editable={editable} onChange={(value) => onQuoteChange("transitDays", value)} />
              <CargoWiseSelectField label="Frequency" value={quote.frequency ?? ""} options={["0 - Ad hoc", "1 - Weekly", "2 - Twice weekly", "3 - Daily"]} editable={editable} onChange={(value) => onQuoteChange("frequency", value)} />
              <CargoWiseSelectField label="Currency" value={quote.currency} options={currencyChoices} editable={editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.currency.trim()} onChange={(value) => onQuoteChange("currency", value)} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Carrier & supplier")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseSelectField label="Carrier" value={selectedCarrier} options={carrierChoices} editable={editable} dataOptions onChange={updateCarrier} />
              <CargoWiseSelectField label="Carrier office" value={selectedCarrierOffice} options={selectedCarrierOffices} editable={editable} dataOptions onChange={(value) => onQuoteChange("carrierOffice", value)} />
              <CargoWiseSelectField label="Supplier" value={selectedSupplier} options={supplierChoices} editable={editable} dataOptions onChange={updateSupplier} />
              <CargoWiseSelectField label="Supplier office" value={selectedSupplierOffice} options={selectedSupplierOffices} editable={editable} dataOptions onChange={(value) => onQuoteChange("supplierOffice", value)} />
              <CargoWiseSelectField label="Rate source" value={quote.rateSource ?? ""} options={["Manual", "Tariff", "Carrier portal", "Historic quote"]} editable={editable} onChange={(value) => onQuoteChange("rateSource", value)} />
              <CargoWiseSelectField label="Service level" value={quote.serviceLevel ?? ""} options={["Economy", "Standard", "Express"]} editable={editable} onChange={(value) => onQuoteChange("serviceLevel", value)} />
            </div>
          </div>
        </div>
      </CargoWiseGroup>

      <CargoWiseGroup title="Goods">
        <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-4">
          <CargoWiseField label="Goods value" value={quote.goodsValue ?? ""} editable={editable} onChange={(value) => onQuoteChange("goodsValue", value)} />
          <CargoWiseField label="Ins value" value={quote.insuranceValue ?? ""} editable={editable} onChange={(value) => onQuoteChange("insuranceValue", value)} />
          <CargoWiseLookupField label="Commodity" value={quote.commodity ?? ""} editable={editable} onChange={(value) => onQuoteChange("commodity", value)} />
          <CargoWiseField label="CO2e" value={quote.co2e ?? ""} editable={editable} onChange={(value) => onQuoteChange("co2e", value)} />
          <CargoWiseField label="Entries" value={quote.entries ?? ""} editable={editable} onChange={(value) => onQuoteChange("entries", value)} />
          <CargoWiseField label="Lines" value={quote.invoiceLines ?? ""} editable={editable} onChange={(value) => onQuoteChange("invoiceLines", value)} />
          <CargoWiseSelectField label="Known cargo" value={quote.knownCargo ?? ""} options={["General merchandise", "Hazardous", "Temperature controlled", "Oversized"]} editable={editable} onChange={(value) => onQuoteChange("knownCargo", value)} span />
          <CargoWiseSelectField label="FMC TID" value={quote.fmcTid ?? ""} options={["Not required", "Required", "Pending"]} editable={editable} onChange={(value) => onQuoteChange("fmcTid", value)} span />
          <CargoWiseField label="Packages / pieces" value={quote.packageQuantity ?? ""} editable={editable} onChange={(value) => onQuoteChange("packageQuantity", value)} />
          <CargoWiseSelectField label="Package type" value={quote.packageType ?? ""} options={freightPackageTypeSelectOptions} editable={editable} dataOptions onChange={(value) => onQuoteChange("packageType", value)} />
          <CargoWiseField label="Gross weight (kg)" value={quote.grossWeightKg ?? ""} editable={editable} onChange={(value) => onQuoteChange("grossWeightKg", value)} />
          <CargoWiseField label="Volume (CBM)" value={quote.volumeCbm ?? ""} editable={editable} onChange={(value) => onQuoteChange("volumeCbm", value)} />
          <CargoWiseField label="Chargeable weight (kg)" value={quote.chargeableWeightKg ?? ""} editable={editable} onChange={(value) => onQuoteChange("chargeableWeightKg", value)} />
          <CargoWiseSelectField label="Customs included" value={quote.customsIncluded ?? "No"} options={["No", "Yes"]} editable={editable} onChange={(value) => onQuoteChange("customsIncluded", value)} />
        </div>
      </CargoWiseGroup>

      <CargoWiseGroup title="Customer terms">
        <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-4">
          <CargoWiseField label="Terms and conditions" value={quote.terms ?? ""} editable={editable} onChange={(value) => onQuoteChange("terms", value)} span />
          <CargoWiseField label="Subject to rate / space" value={quote.subjectToTerms ?? ""} editable={editable} onChange={(value) => onQuoteChange("subjectToTerms", value)} span />
          <CargoWiseField label="Customer notes" value={quote.customerNotes ?? ""} editable={editable} onChange={(value) => onQuoteChange("customerNotes", value)} span />
          <CargoWiseField label="Response deadline (optional)" value={quote.deadline ?? ""} editable={editable} onChange={(value) => onQuoteChange("deadline", value)} />
        </div>
      </CargoWiseGroup>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent
          dir={direction}
          showCloseButton={false}
          className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)] sm:max-w-[420px]"
        >
          <DialogHeader className="text-start">
            <DialogTitle className="text-[16px] font-medium">{t("One-off customer")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("Use customer details on this quote without creating a CRM account.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
              {t("Customer name")}
              <Input
                autoFocus
                dir="auto"
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                placeholder={t("Customer name")}
              />
            </label>
            <label className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
              {t("Customer code")}
              <Input
                dir="ltr"
                className="text-start"
                value={newCustomerCode}
                onChange={(event) => setNewCustomerCode(event.target.value)}
                placeholder={t("Customer code")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createCustomer()
                }}
              />
            </label>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setCustomerDialogOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button type="button" disabled={!newCustomerName.trim()} onClick={createCustomer}>
              {t("Use customer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent
          dir={direction}
          showCloseButton={false}
          className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)] sm:max-w-[440px]"
        >
          <DialogHeader className="text-start">
            <DialogTitle className="text-[16px] font-medium">{t("Use quote address")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("Use an address on this quote without changing the organisation record.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
              {t("Address")}
              <Input
                autoFocus
                dir="auto"
                value={newSavedAddress}
                onChange={(event) => setNewSavedAddress(event.target.value)}
                placeholder={t("Company address")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") savePartyAddress()
                }}
              />
            </label>
            <label className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
              {t("Address type")}
              <Select value={newSavedAddressType} onValueChange={(value) => setNewSavedAddressType(value as SavedPartyAddress["type"])}>
                <SelectTrigger className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[12px] shadow-[var(--md-shadow-line)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
                  {(["Main office", "Collection address", "Delivery address"] as const).map((type) => (
                    <SelectItem key={type} value={type} className="text-[12px]">{t(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setAddressDialogOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button type="button" disabled={!newSavedAddress.trim()} onClick={savePartyAddress}>
              {t("Use address")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuoteCompactInput({
  label,
  value,
  onChange,
  width = "medium",
  required,
  invalid,
  disabled,
  type = "text",
  dir = "auto",
  placeholder,
  autoPopulated,
  autoPopulationDescription,
  className,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
  width?: "code" | "short" | "medium" | "long" | "grow" | "full"
  required?: boolean
  invalid?: boolean
  disabled?: boolean
  type?: "text" | "date" | "number" | "email"
  dir?: "auto" | "ltr" | "rtl"
  placeholder?: string
  autoPopulated?: boolean
  autoPopulationDescription?: string
  className?: string
}) {
  const { t } = useLanguage()
  const id = useId()
  const locked = !onChange
  const input = locked ? (
    <div className="relative">
      <Input
        id={id}
        data-i18n-skip
        dir={dir}
        type={type}
        value={value}
        disabled={disabled}
        readOnly
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        placeholder={placeholder ? t(placeholder) : undefined}
        className={cn(
          "h-8 rounded-[var(--md-radius-lg)] px-1.5 text-[12px] read-only:border read-only:border-[var(--md-field-locked-line)] read-only:bg-[var(--md-field-locked-bg)] read-only:text-[var(--md-ink)] read-only:shadow-none",
          locked && "pe-8",
        )}
      />
      {locked ? <HugeiconsIcon icon={LockPasswordSolidRoundedIcon} className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-accent)]" aria-hidden="true" /> : null}
    </div>
  ) : (
    <AutoPopulatedInput
      id={id}
      data-i18n-skip
      dir={dir}
      type={type}
      value={value}
      disabled={disabled}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      placeholder={placeholder ? t(placeholder) : undefined}
      autoPopulated={autoPopulated}
      autoPopulationDescription={autoPopulationDescription}
      onChange={(event) => onChange?.(event.target.value)}
      className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]"
    />
  )
  return (
    <CompactFieldShell label={label} htmlFor={id} width={width} required={required} invalid={invalid} className={className}>
      {locked ? <LockedFieldTooltip>{input}</LockedFieldTooltip> : input}
    </CompactFieldShell>
  )
}

function QuoteCompactDatePicker({
  label,
  value,
  onChange,
  disabled,
  minDate,
  locked,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  minDate?: string
  locked?: boolean
}) {
  const picker = (
    <div className="relative">
      <MultideckDatePicker
        value={value || null}
        onChange={(date) => onChange(date ?? "")}
        placeholder="Select date"
        title={label}
        description="Pick a date."
        disabled={disabled}
        minDate={minDate}
        triggerClassName={cn(
          "h-8 rounded-[var(--md-radius-lg)] px-1.5 text-[12px] font-normal",
          locked && "cursor-not-allowed border border-[var(--md-field-locked-line)] bg-[var(--md-field-locked-bg)] pe-8 text-[var(--md-ink)] opacity-100 shadow-none disabled:border-[var(--md-field-locked-line)] disabled:text-[var(--md-ink)] disabled:opacity-100",
        )}
      />
      {locked ? <HugeiconsIcon icon={LockPasswordSolidRoundedIcon} className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-accent)]" aria-hidden="true" /> : null}
    </div>
  )
  return (
    <CompactFieldShell label={label} width="short">
      {locked ? <LockedFieldTooltip>{picker}</LockedFieldTooltip> : picker}
    </CompactFieldShell>
  )
}

function LockedQuoteTextarea({ label, value }: { label: string; value: string }) {
  const { t } = useLanguage()
  return (
    <CompactFieldShell label={label} width="full">
      <LockedFieldTooltip>
        <div className="relative">
          <Textarea
            aria-label={t(label)}
            value={value}
            disabled
            className="min-h-12 cursor-not-allowed resize-none rounded-[var(--md-radius-lg)] border border-[var(--md-field-locked-line)] bg-[var(--md-field-locked-bg)] py-2 pe-8 text-[12px] leading-4 text-[var(--md-ink)] opacity-100 shadow-none disabled:border-[var(--md-field-locked-line)] disabled:text-[var(--md-ink)] disabled:opacity-100"
          />
          <HugeiconsIcon icon={LockPasswordSolidRoundedIcon} className="pointer-events-none absolute end-2 top-2 size-3.5 text-[var(--md-accent)]" aria-hidden="true" />
        </div>
      </LockedFieldTooltip>
    </CompactFieldShell>
  )
}

function QuoteCompactSelect({
  label,
  value,
  options,
  onChange,
  width = "short",
  required,
  invalid,
  disabled,
  dataOptions,
  className,
}: {
  label: string
  value: string
  options: readonly (string | { value: string; label: string })[]
  onChange: (value: string) => void
  width?: "code" | "short" | "medium" | "long" | "grow" | "full"
  required?: boolean
  invalid?: boolean
  disabled?: boolean
  dataOptions?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const id = useId()
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option)
  const emptyValue = "__empty_quote_detail__"
  return (
    <CompactFieldShell label={label} htmlFor={id} width={width} required={required} invalid={invalid} className={className}>
      <Select value={value || emptyValue} onValueChange={(next) => onChange(next === emptyValue ? "" : next)} disabled={disabled} required={required}>
        <SelectTrigger id={id} aria-invalid={invalid || undefined} className="h-8 w-full rounded-[var(--md-radius-lg)] px-1.5 text-[12px]">
          <SelectValue placeholder={t("Select")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={emptyValue}>{t("Select")}</SelectItem>
          {normalized.map((option) => (
            <SelectItem key={option.value} value={option.value} data-i18n-skip={dataOptions || undefined} dir={dataOptions ? "auto" : undefined}>
              {dataOptions ? option.label : t(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CompactFieldShell>
  )
}

function CarrierServiceLevelPill({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useLanguage()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${t("Service level")}: ${t(value || "Standard")}`}
          className="rounded-[var(--md-radius-md)] outline-none transition-[opacity,transform] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
        >
          <StatusPill kind="attribute" tone={carrierServiceTone(value)} indicator={false} className="pointer-events-none h-7 min-w-[94px] justify-center gap-1.5 px-2 text-[11px]">
            {t(value || "Standard")}
            <ChevronDown className="size-3" strokeWidth={1.5} aria-hidden="true" />
          </StatusPill>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={5} className="w-44 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
        <div className="grid gap-0.5">
          {carrierServiceLevels.map((serviceLevel) => {
            const selected = serviceLevel === value
            return (
              <button
                key={serviceLevel}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "flex min-h-8 items-center justify-between gap-2 rounded-[var(--md-radius-md)] px-2 text-start text-[11.5px] text-[var(--md-text)] outline-none transition-colors hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]",
                  selected && "bg-[var(--md-accent-a07)] font-medium text-[var(--md-ink)]",
                )}
                onClick={() => onChange(serviceLevel)}
              >
                <span>{t(serviceLevel)}</span>
                {selected ? <Check className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function QuoteCarrierRemoveAction({
  confirming,
  disabled,
  onCancel,
  onRemove,
}: {
  confirming: boolean
  disabled: boolean
  onCancel: () => void
  onRemove: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <span className="relative block h-7 w-[62px]" onClick={(event) => event.stopPropagation()}>
      <motion.button
        type="button"
        initial={false}
        animate={{ width: confirming ? 62 : 28 }}
        className={cn(
          "group/delete absolute inset-y-0 end-0 grid h-7 origin-end place-items-center overflow-hidden rounded-full text-[var(--md-subtle)] outline-none",
          confirming
            ? "bg-[rgba(209,78,78,0.12)] px-2 text-[11px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.18)]"
            : "hover:text-[var(--md-red)]",
        )}
        aria-label={t(confirming ? "Confirm remove" : "Remove carrier")}
        title={t(confirming ? "Confirm remove" : "Remove carrier")}
        disabled={disabled}
        onClick={(event) => { event.stopPropagation(); onRemove() }}
        onBlur={() => { if (confirming) onCancel() }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key !== "Escape" || !confirming) return
          event.preventDefault()
          onCancel()
        }}
        transition={reduceMotion(Boolean(shouldReduceMotion), confirming ? mdMotion.fast : mdMotion.micro)}
      >
        <span
          className={cn(
            "absolute grid size-6 place-items-center rounded-full transition-[background-color,box-shadow,color,opacity,transform] duration-150 group-hover/delete:bg-[rgba(209,78,78,0.10)] group-hover/delete:shadow-[var(--md-shadow-line)] group-focus-visible/delete:ring-[3px] group-focus-visible/delete:ring-[var(--md-accent-a20)] group-active/delete:scale-[0.94] motion-reduce:transition-none",
            confirming ? "scale-75 opacity-0" : "scale-100 opacity-100",
          )}
          aria-hidden="true"
        >
          <X className="size-3" strokeWidth={1.4} />
        </span>
        <span
          className={cn(
            "whitespace-nowrap transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            confirming ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
          aria-hidden={!confirming}
        >
          {t("Confirm")}
        </span>
      </motion.button>
    </span>
  )
}

function QuoteDetailsPanelV2({
  quote,
  editable,
  requireCoreFields = true,
  validationAttempted,
  onQuoteChange,
  onQuotePatch,
  onCustomerOrganisationChange,
  lookups,
}: {
  quote: QuoteRecord
  editable: boolean
  requireCoreFields?: boolean
  validationAttempted: boolean
  onQuoteChange: (field: keyof QuoteRecord, value: string) => void
  onQuotePatch: (patch: Partial<QuoteRecord>) => void
  onCustomerOrganisationChange?: (change: PendingCustomerOrganisationChange) => void
  lookups?: QuoteWorkflowSources | null
}) {
  const { direction, language, t } = useLanguage()
  const [rateRequestOpen, setRateRequestOpen] = useState(false)
  const [confirmingCarrierId, setConfirmingCarrierId] = useState<string | null>(null)
  const [unlocodeDirectory, setUnlocodeDirectory] = useState<readonly UnlocodeDirectoryRecord[]>([])
  const [unlocodeDirectoryStatus, setUnlocodeDirectoryStatus] = useState<"loading" | "ready" | "error">("loading")
  const [unlocodeDirectoryCount, setUnlocodeDirectoryCount] = useState(0)
  const organisations = useMemo(() => lookups?.organisations ?? [], [lookups?.organisations])
  const currencies = useMemo(() => lookups?.currencies.map((option) => option.code) ?? ["GBP", "EUR", "USD"], [lookups?.currencies])
  const modes = useMemo(() => lookups?.modes.map((option) => option.name) ?? cargoWiseModeOptions, [lookups?.modes])
  const shipmentTypes = useMemo(() => lookups?.shipmentTypes.map((option) => `${option.code} - ${option.name}`) ?? shipmentTypeOptions(quote.mode), [lookups?.shipmentTypes, quote.mode])
  const countries = useMemo(() => lookups?.countries ?? [], [lookups?.countries])
  const calculatedDirection = calculatedDirectionForQuote(quote, lookups)
  const organisationsById = useMemo(() => new Map(organisations.map((organisation) => [organisation.id, organisation])), [organisations])
  const customerOrganisation = organisationsById.get(quote.customerId ?? "")
    ?? organisations.find((option) => option.name.trim().toLocaleLowerCase() === quote.customer.trim().toLocaleLowerCase())
  const payerOrganisation = organisationsById.get(quote.payerOrgId ?? "")
    ?? organisations.find((option) => option.name.trim().toLocaleLowerCase() === quote.payerName?.trim().toLocaleLowerCase())
  const customerSourceContact = customerOrganisation?.contacts?.find((contact) => contact.isOperational)
  const payerSourceContact = payerOrganisation?.contacts?.find((contact) => contact.isOperational)
  const customerAutoPopulationDescription = customerOrganisation
    ? `Filled from ${customerOrganisation.name}. Edit this field to override it for this quote.`
    : undefined

  useEffect(() => {
    let cancelled = false
    setUnlocodeDirectoryStatus("loading")
    void Promise.all([loadUnlocodeDirectory(), loadUnlocodeDirectoryMetadata()])
      .then(([records, metadata]) => {
        if (cancelled) return
        setUnlocodeDirectory(records)
        setUnlocodeDirectoryCount(metadata.recordCount)
        setUnlocodeDirectoryStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setUnlocodeDirectoryStatus("error")
      })
    return () => { cancelled = true }
  }, [])
  const customerAddresses = customerOrganisation?.addresses ?? []
  const customerOperationalContacts = (customerOrganisation?.contacts ?? []).filter((contact) => contact.isOperational)
  const payerAddresses = payerOrganisation?.addresses ?? []
  const payerOperationalContacts = (payerOrganisation?.contacts ?? []).filter((contact) => contact.isOperational)
  const payerAutoPopulationDescription = payerOrganisation
    ? `Filled from ${payerOrganisation.name}. Its account terms govern this quote.`
    : undefined
  const supplierOptions = useMemo(() => supplierOptionsFromQuote(quote), [quote.supplierOptionsJson, quote.supplierId, quote.supplier, quote.carrierId, quote.carrier])
  type OrganisationRole = "customer" | "payer" | "supplier" | "carrier" | "agent" | "shipper" | "consignee"
  const organisationRecentOptionLimit = 10
  const organisationDirectories = useMemo(() => {
    const roles: OrganisationRole[] = ["customer", "payer", "supplier", "carrier", "agent", "shipper", "consignee"]
    const directories = Object.fromEntries(roles.map((role) => [role, {
      options: [] as CompactComboboxOption[], codes: [] as CompactComboboxOption[], ids: new Set<string>(),
    }])) as Record<OrganisationRole, { options: CompactComboboxOption[]; codes: CompactComboboxOption[]; ids: Set<string> }>
    const fallbackIds = {
      supplier: new Set(lookups?.suppliers.map((item) => item.id)),
      carrier: new Set(lookups?.carriers.map((item) => item.id)),
      agent: new Set(lookups?.agents.map((item) => item.id)),
    }
    for (const organisation of organisations) {
      const types = (organisation.types ?? []).map((type) => type.trim().toLocaleLowerCase())
      const matches = (role: OrganisationRole) => {
        if (!types.length) return role in fallbackIds && fallbackIds[role as keyof typeof fallbackIds].has(organisation.id)
        if (role === "customer" || role === "payer") return types.includes("customer")
        if (role === "supplier") return types.includes("supplier")
        if (role === "carrier") return types.some((type) => /^(carrier|shipping line|haulier|freight forwarder)$/.test(type))
        if (role === "agent") return types.some((type) => /\bagents?\b/.test(type))
        if (role === "shipper") return types.some((type) => /\bshipper\b|\bconsignor\b/.test(type))
        return types.some((type) => /\bconsignee\b/.test(type))
      }
      const option: CompactComboboxOption = {
        id: organisation.id, value: organisation.name, label: organisation.name,
        description: [organisation.code, (organisation.types ?? []).join(" · ")].filter(Boolean).join(" · "),
        keywords: [organisation.code, ...(organisation.types ?? [])],
      }
      for (const role of roles) {
        if (!matches(role)) continue
        directories[role].ids.add(organisation.id)
        directories[role].options.push(option)
        if (organisation.code) directories[role].codes.push({
          ...option, value: organisation.code, label: organisation.code, description: organisation.name,
          keywords: [organisation.name, ...(organisation.types ?? [])],
        })
      }
    }
    return directories
  }, [organisations, lookups?.suppliers, lookups?.carriers, lookups?.agents])
  const organisationHasRole = (id: string | undefined, role: OrganisationRole) => Boolean(id && organisationDirectories[role].ids.has(id))
  const relatedDirectories = useMemo(() => {
    const roles: OrganisationRole[] = ["customer", "payer", "supplier", "carrier", "agent", "shipper", "consignee"]
    const result: Record<OrganisationRole, CompactComboboxOption[]> = { customer: [], payer: [], supplier: [], carrier: [], agent: [], shipper: [], consignee: [] }
    for (const role of roles) result[role] = (customerOrganisation?.relatedPartyRecommendations ?? []).flatMap((recommendation) => {
      if (!recommendation.role.toLocaleLowerCase().includes(role)) return []
      const organisation = organisationsById.get(recommendation.organisationId)
      if (!organisation || !organisationDirectories[role].ids.has(organisation.id)) return []
      return [{
        id: organisation.id, value: organisation.name, label: organisation.name,
        description: recommendation.source === "saved_default" ? t("Related to this customer")
          : `${t("Previously used with this customer")} · ${recommendation.usageCount}`,
        keywords: [organisation.code, ...(organisation.types ?? [])],
      }]
    })
    return result
  }, [customerOrganisation, organisationsById, organisationDirectories, t])
  const relatedOptions = (role: OrganisationRole) => relatedDirectories[role]

  const officialLocationOptions = useMemo<LocationOption[]>(() => {
    const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([language], { type: "region" }) : null
    const countryNames = new Map(countries.map((country) => [country.code.toLocaleUpperCase(), country.name]))
    return unlocodeDirectory.map(([countryCode, locationCode, place, nameWithoutDiacritics, functions]) => ({
      id: `unlocode:${countryCode}${locationCode}`,
      countryCode,
      countryName: countryNames.get(countryCode) || regionNames?.of(countryCode) || countryCode,
      place,
      unlocode: `${countryCode}${locationCode}`,
      kind: unlocodeKind(functions),
      aliases: nameWithoutDiacritics ? [nameWithoutDiacritics] : [],
    }))
  }, [countries, language, unlocodeDirectory])

  const officialLocationsByUnlocode = useMemo(() => new Map(officialLocationOptions.map((option) => [option.unlocode, option])), [officialLocationOptions])
  const locationOptions = useMemo<LocationOption[]>(() => {
    const unlinkedOptions: LocationOption[] = []
    const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([language], { type: "region" }) : null
    organisations.forEach((organisation) => (organisation.addresses ?? []).forEach((address) => {
      const place = address.townCity?.trim() ?? ""
      const countryCode = (address.countryCode || address.country || "").trim().toLocaleUpperCase()
      const countryName = countryCode.length === 2 ? regionNames?.of(countryCode) || address.country?.trim() || countryCode : address.country?.trim() || countryCode
      const unlocode = address.unlocode?.trim().toLocaleUpperCase() ?? ""
      if ((!place && !countryName && !unlocode) || (unlocode && officialLocationsByUnlocode.has(unlocode))) return
      unlinkedOptions.push({ id: `organisation-address:${address.id}`, place, countryName, countryCode, unlocode })
    }))
    return [...officialLocationsByUnlocode.values(), ...unlinkedOptions]
  }, [officialLocationsByUnlocode, organisations, language])
  const routeLocationOptions = useMemo<CompactComboboxOption[]>(() => locationOptions.map((option) => ({
    id: option.id,
    value: option.unlocode || option.place,
    label: [option.unlocode, option.place].filter(Boolean).join(" · "),
    description: option.countryName,
    keywords: [option.countryCode, option.countryName, option.place, option.unlocode, ...(option.aliases ?? [])],
    iconText: quoteCountryFlag(option.countryCode),
  })), [locationOptions])
  // Changing a party only changes this small overlay, not the 116k-row directory.
  const recommendedLocationIds = useMemo(() => {
    const ids = new Set<string>()
    for (const organisationId of [quote.customerId, quote.shipperOrgId, quote.consigneeOrgId]) {
      for (const address of organisationsById.get(organisationId ?? "")?.addresses ?? []) {
        const official = officialLocationsByUnlocode.get(address.unlocode?.trim().toLocaleUpperCase() ?? "")
        ids.add(official?.id ?? `organisation-address:${address.id}`)
      }
    }
    return ids
  }, [quote.customerId, quote.shipperOrgId, quote.consigneeOrgId, organisationsById, officialLocationsByUnlocode])

  const originLocation: LocationValue = {
    countryCode: quote.originCountry?.length === 2 ? quote.originCountry : "",
    countryName: quote.originCountry ?? "",
    place: quote.originTown || (quote.originUnlocode ? "" : quote.origin),
    unlocode: quote.originUnlocode ?? "",
  }
  const destinationLocation: LocationValue = {
    countryCode: quote.destinationCountry?.length === 2 ? quote.destinationCountry : "",
    countryName: quote.destinationCountry ?? "",
    place: quote.destinationTown || (quote.destinationUnlocode ? "" : quote.destination),
    unlocode: quote.destinationUnlocode ?? "",
  }
  const routingLegs = useMemo(() => quoteRoutingLegs(quote.routingLegsJson), [quote.routingLegsJson])
  const containerRequests = useMemo(
    () => quoteContainerRequests(quote.containerRequestsJson, quote.container),
    [quote.container, quote.containerRequestsJson],
  )
  const isSeaContainerised = [quote.mode, quote.shipmentType]
    .map((value) => (value ?? "").trim().toLocaleLowerCase())
    .some((value) => value === "sea" || value === "ocean")
    && /\bfcl\b|container/u.test((quote.shipmentType ?? "").toLocaleLowerCase())
  const recurrence: RecurrenceValue = {
    ...EMPTY_RECURRENCE,
    mode: (["once", "interval", "times-per-month", "custom"] as const).includes(quote.frequency as RecurrenceValue["mode"])
      ? quote.frequency as RecurrenceValue["mode"]
      : quote.frequency?.toLocaleLowerCase().includes("ad hoc") || !quote.frequency ? "once" : "custom",
    interval: quote.frequencyInterval || "1",
    unit: quote.frequencyUnit?.toLocaleLowerCase().startsWith("day") ? "day" : quote.frequencyUnit?.toLocaleLowerCase().startsWith("month") ? "month" : "week",
    timesPerMonth: quote.frequencyTimesPerMonth || "1",
    totalOccurrences: quote.frequencyCount || "",
    notes: quote.frequencyNotes || "",
  }
  const characteristics = cargoCharacteristicsFromQuote(quote)
  const hazardousDetails: HazardousDetails = {
    ...EMPTY_HAZARDOUS_DETAILS,
    unNumber: quote.hazardousUnNumber ?? "",
    properShippingName: quote.hazardousShippingName ?? "",
    hazardClass: quote.hazardousClass ?? "",
    packingGroup: (["I", "II", "III", "N/A"] as const).includes(quote.hazardousPackingGroup as "I") ? quote.hazardousPackingGroup as HazardousDetails["packingGroup"] : "",
    packageCount: quote.packageQuantity ?? "",
    packageType: quote.packageType ?? "",
    netWeightKg: quote.hazardousNetWeightKg ?? "",
    grossWeightKg: quote.grossWeightKg ?? "",
    marinePollutant: quote.hazardousMarinePollutant === "Yes",
    limitedQuantity: quote.hazardousLimitedQuantity === "Yes",
    notes: quote.hazardousNotes || quote.hazardousEmergencyContact || "",
  }

  function updateContainerRequests(nextRequests: QuoteContainerRequest[]) {
    const requests = nextRequests.slice(0, 20)
    onQuotePatch({
      containerRequestsJson: JSON.stringify(requests),
      container: quoteContainerSummary(requests),
    })
  }

  function addContainerRequest() {
    if (containerRequests.length >= 20) return
    updateContainerRequests([
      ...containerRequests,
      { id: crypto.randomUUID(), quantity: "", type: "" },
    ])
  }

  function updateContainerRequest(index: number, patch: Partial<QuoteContainerRequest>) {
    updateContainerRequests(containerRequests.map((request, requestIndex) => requestIndex === index ? { ...request, ...patch } : request))
  }

  function removeContainerRequest(index: number) {
    const nextRequests = containerRequests.filter((_, requestIndex) => requestIndex !== index)
    updateContainerRequests(nextRequests.length ? nextRequests : [{ id: crypto.randomUUID(), quantity: "", type: "" }])
  }

  function updateLocation(prefix: "origin" | "destination", value: LocationValue) {
    const countryField = prefix === "origin" ? "originCountry" : "destinationCountry"
    const townField = prefix === "origin" ? "originTown" : "destinationTown"
    const codeField = prefix === "origin" ? "originUnlocode" : "destinationUnlocode"
    const nextLegs = routingLegs.length > 1 ? routingLegs.map((leg, index) => {
      if (prefix === "origin" && index === 0) return { ...leg, origin: value }
      if (prefix === "destination" && index === routingLegs.length - 1) return { ...leg, destination: value }
      return leg
    }) : routingLegs
    onQuotePatch({
      [countryField]: value.countryName || value.countryCode,
      [townField]: value.place,
      [codeField]: value.unlocode,
      [prefix]: value.unlocode || value.place,
      ...(routingLegs.length > 1 ? { routingLegsJson: quoteRoutingLegsValue(nextLegs) } : {}),
    })
  }

  function baseRoutingLeg(): QuoteRoutingLeg {
    return {
      id: "route-1",
      mode: quote.mode,
      origin: originLocation,
      destination: destinationLocation,
      estimatedDeparture: quote.estimatedDeparture ?? "",
      estimatedArrival: quote.estimatedArrival ?? "",
      carrierId: quote.carrierId ?? "",
      carrierName: quote.carrier ?? "",
      serviceLevel: quote.serviceLevel ?? "",
    }
  }

  function addRoutingLeg() {
    const current = routingLegs.length > 1 ? routingLegs : [baseRoutingLeg()]
    const previous = current.at(-1) ?? baseRoutingLeg()
    const next: QuoteRoutingLeg = {
      id: `route-${crypto.randomUUID()}`,
      mode: previous.mode || quote.mode,
      origin: previous.destination,
      destination: { countryCode: "", countryName: "", place: "", unlocode: "" },
      estimatedDeparture: previous.estimatedArrival,
      estimatedArrival: "",
      carrierId: "",
      carrierName: "",
      serviceLevel: previous.serviceLevel || quote.serviceLevel || "Standard",
    }
    onQuotePatch({ routingLegsJson: quoteRoutingLegsValue([...current, next]) })
  }

  function updateRoutingLeg(index: number, patch: Partial<QuoteRoutingLeg>) {
    const nextLegs = routingLegs.map((leg, legIndex) => legIndex === index ? { ...leg, ...patch } : leg)
    const updated = nextLegs[index]
    if (!updated) return
    if (patch.destination && nextLegs[index + 1]) nextLegs[index + 1] = { ...nextLegs[index + 1], origin: patch.destination }
    const first = nextLegs[0]
    const last = nextLegs.at(-1) ?? first
    onQuotePatch({
      routingLegsJson: quoteRoutingLegsValue(nextLegs),
      origin: first.origin.unlocode || first.origin.place,
      originCountry: first.origin.countryName || first.origin.countryCode,
      originTown: first.origin.place,
      originUnlocode: first.origin.unlocode,
      destination: last.destination.unlocode || last.destination.place,
      destinationCountry: last.destination.countryName || last.destination.countryCode,
      destinationTown: last.destination.place,
      destinationUnlocode: last.destination.unlocode,
      estimatedDeparture: first.estimatedDeparture,
      estimatedArrival: last.estimatedArrival,
      transitDays: quoteTransitDays(first.estimatedDeparture, last.estimatedArrival),
      transitUnit: "Days",
    })
  }

  function updateRoutingLocation(index: number, field: "origin" | "destination", value: string, option?: CompactComboboxOption) {
    const selected = option?.id ? locationOptions.find((location) => location.id === option.id) : undefined
    const nextLocation: LocationValue = selected
      ? { countryCode: selected.countryCode, countryName: selected.countryName, place: selected.place, unlocode: selected.unlocode }
      : /^[A-Za-z]{2}[A-Za-z0-9]{3}$/.test(value.trim())
        ? { countryCode: value.trim().slice(0, 2).toLocaleUpperCase(), countryName: "", place: "", unlocode: value.trim().toLocaleUpperCase() }
        : { countryCode: "", countryName: "", place: value, unlocode: "" }
    updateRoutingLeg(index, { [field]: nextLocation })
  }

  function removeLastRoutingLeg() {
    if (routingLegs.length <= 1) return
    const nextLegs = routingLegs.slice(0, -1)
    const last = nextLegs.at(-1)
    const estimatedArrival = last?.estimatedArrival || quote.estimatedArrival
    onQuotePatch({
      routingLegsJson: quoteRoutingLegsValue(nextLegs),
      destination: last?.destination.unlocode || last?.destination.place || quote.destination,
      destinationCountry: last?.destination.countryName || last?.destination.countryCode || quote.destinationCountry,
      destinationTown: last?.destination.place || quote.destinationTown,
      destinationUnlocode: last?.destination.unlocode || quote.destinationUnlocode,
      estimatedArrival,
      transitDays: quoteTransitDays(nextLegs[0]?.estimatedDeparture || quote.estimatedDeparture, estimatedArrival),
      transitUnit: "Days",
    })
  }

  function updateRecurrence(value: RecurrenceValue) {
    onQuotePatch({
      frequency: value.mode,
      frequencyInterval: value.interval,
      frequencyUnit: value.unit,
      frequencyTimesPerMonth: value.timesPerMonth,
      frequencyCount: value.totalOccurrences,
      frequencyNotes: value.notes,
    })
  }

  function updateHazardousDetails(value: HazardousDetails) {
    onQuotePatch({
      hazardousUnNumber: value.unNumber,
      hazardousShippingName: value.properShippingName,
      hazardousClass: value.hazardClass,
      hazardousPackingGroup: value.packingGroup,
      packageQuantity: value.packageCount,
      packageType: value.packageType,
      hazardousNetWeightKg: value.netWeightKg,
      grossWeightKg: value.grossWeightKg,
      hazardousMarinePollutant: value.marinePollutant ? "Yes" : "No",
      hazardousLimitedQuantity: value.limitedQuantity ? "Yes" : "No",
      hazardousNotes: value.notes,
    })
  }

  function organisationForRole(role: "customer" | "payer" | "shipper" | "consignee" | "agent") {
    const organisationId = role === "customer" ? quote.customerId : role === "payer" ? quote.payerOrgId : role === "shipper" ? quote.shipperOrgId : role === "consignee" ? quote.consigneeOrgId : quote.agentOrgId
    const organisationName = role === "customer" ? quote.customer : role === "payer" ? quote.payerName : role === "shipper" ? quote.shipperName : role === "consignee" ? quote.consigneeName : quote.agentName
    return organisationsById.get(organisationId ?? "")
      ?? organisations.find((organisation) => organisation.name.trim().toLocaleLowerCase() === organisationName?.trim().toLocaleLowerCase())
  }

  function operationalContactsForOrganisation(organisationId: string | undefined) {
    return organisationsById.get(organisationId ?? "")?.contacts.filter((contact) => contact.isOperational) ?? []
  }

  function selectAddress(role: "customer" | "payer" | "shipper" | "consignee" | "agent", addressId: string) {
    const address = organisationForRole(role)?.addresses.find((item) => item.id === addressId)
    if (!address) return
    onQuoteChange(role === "customer" ? "customerAddress" : role === "payer" ? "payerAddress" : role === "shipper" ? "shipperAddress" : role === "consignee" ? "consigneeAddress" : "agentAddress", address.address)
  }

  function selectContact(role: "customer" | "payer" | "shipper" | "consignee" | "agent", contactId: string) {
    const contact = operationalContactsForOrganisation(organisationForRole(role)?.id).find((item) => item.id === contactId)
    if (!contact) return
    if (role === "customer") {
      onQuotePatch({
        contactId: contact.id,
        customerContact: contact.name,
        customerEmail: contact.email ?? "",
      })
      return
    }
    if (role === "payer") {
      onQuotePatch({
        payerContact: contact.name,
        payerEmail: contact.email ?? "",
      })
      return
    }
    onQuotePatch({
      [role === "shipper" ? "shipperContact" : role === "consignee" ? "consigneeContact" : "agentContact"]: contact.name,
      [role === "shipper" ? "shipperEmail" : role === "consignee" ? "consigneeEmail" : "agentEmail"]: contact.email ?? "",
    })
  }

  function selectOrganisationByCode(role: "customer" | "payer" | "shipper" | "consignee" | "agent", code: string) {
    const normalizedCode = code.trim().toLocaleLowerCase()
    const organisation = organisations.find((item) => normalizedCode && item.code.trim().toLocaleLowerCase() === normalizedCode && organisationHasRole(item.id, role))
    if (!organisation) return false
    selectOrganisation(role, organisation.id)
    return true
  }

  function selectOrganisation(role: "customer" | "payer" | "shipper" | "consignee" | "agent", organisationId: string) {
    const organisation = organisationsById.get(organisationId ?? "")
    if (!organisation) return
    const address = organisation.addresses?.[0]?.address ?? ""
    const contact = operationalContactsForOrganisation(organisation.id)[0]
    if (role === "customer") {
      const useCustomerAsPayer = !quote.payerOrgId || quote.payerOrgId === quote.customerId || quote.customerId !== organisation.id
      const patch: Partial<QuoteRecord> = {
        customerId: organisation.id,
        clientCode: organisation.code,
        customer: organisation.name,
        customerAddress: address,
        contactId: contact?.id ?? "",
        customerContact: contact?.name ?? "",
        customerEmail: contact?.email ?? "",
        ...(useCustomerAsPayer ? {
          payerOrgId: organisation.id,
          payerCode: organisation.code,
          payerName: organisation.name,
          payerAddress: address,
          payerContact: contact?.name ?? "",
          payerEmail: contact?.email ?? "",
        } : {}),
        ...(useCustomerAsPayer ? {
          customerTermsSource: organisation.name,
          terms: organisation.quoteTerms?.terms ?? "",
          subjectToTerms: organisation.quoteTerms?.subjectTo ?? "",
          customerNotes: organisation.quoteTerms?.notes ?? "",
          deadline: organisation.quoteTerms?.deadline ?? "",
        } : {}),
      }
      if (quote.customerId && quote.customerId !== organisation.id && onCustomerOrganisationChange) {
        onCustomerOrganisationChange({ organisation, patch })
        return
      }
      onQuotePatch(patch)
      return
    }
    if (role === "payer") {
      onQuotePatch({
        payerOrgId: organisation.id,
        payerCode: organisation.code,
        payerName: organisation.name,
        payerAddress: address,
        payerContact: contact?.name ?? "",
        payerEmail: contact?.email ?? "",
        customerTermsSource: organisation.name,
        terms: organisation.quoteTerms?.terms ?? "",
        subjectToTerms: organisation.quoteTerms?.subjectTo ?? "",
        customerNotes: organisation.quoteTerms?.notes ?? "",
        deadline: organisation.quoteTerms?.deadline ?? "",
      })
      return
    }
    if (role === "shipper") {
      onQuotePatch({
        shipperOrgId: organisation.id,
        shipperCode: organisation.code,
        shipperName: organisation.name,
        shipperAddress: address,
        shipperContact: contact?.name ?? "",
        shipperEmail: contact?.email ?? "",
      })
      return
    }
    if (role === "consignee") {
      onQuotePatch({
        consigneeOrgId: organisation.id,
        consigneeCode: organisation.code,
        consigneeName: organisation.name,
        consigneeAddress: address,
        consigneeContact: contact?.name ?? "",
        consigneeEmail: contact?.email ?? "",
      })
      return
    }
    onQuotePatch({
      agentOrgId: organisation.id,
      agentCode: organisation.code,
      agentName: organisation.name,
      agentAddress: address,
      agentContact: contact?.name ?? "",
      agentEmail: contact?.email ?? "",
    })
  }

  function useCustomerForParty(role: "payer" | "shipper" | "consignee" | "agent") {
    if (role === "payer") {
      onQuotePatch({
        payerOrgId: quote.customerId ?? "",
        payerCode: quote.clientCode ?? "",
        payerName: quote.customer,
        payerAddress: quote.customerAddress ?? "",
        payerContact: quote.customerContact ?? "",
        payerEmail: quote.customerEmail ?? "",
        customerTermsSource: customerOrganisation?.name ?? quote.customer,
        terms: customerOrganisation?.quoteTerms?.terms ?? "",
        subjectToTerms: customerOrganisation?.quoteTerms?.subjectTo ?? "",
        customerNotes: customerOrganisation?.quoteTerms?.notes ?? "",
        deadline: customerOrganisation?.quoteTerms?.deadline ?? "",
      })
      return
    }
    onQuotePatch({
      [role === "shipper" ? "shipperOrgId" : role === "consignee" ? "consigneeOrgId" : "agentOrgId"]: quote.customerId ?? "",
      [role === "shipper" ? "shipperCode" : role === "consignee" ? "consigneeCode" : "agentCode"]: quote.clientCode ?? "",
      [role === "shipper" ? "shipperName" : role === "consignee" ? "consigneeName" : "agentName"]: quote.customer,
      [role === "shipper" ? "shipperAddress" : role === "consignee" ? "consigneeAddress" : "agentAddress"]: quote.customerAddress ?? "",
      [role === "shipper" ? "shipperContact" : role === "consignee" ? "consigneeContact" : "agentContact"]: quote.customerContact ?? "",
      [role === "shipper" ? "shipperEmail" : role === "consignee" ? "consigneeEmail" : "agentEmail"]: quote.customerEmail ?? "",
    })
  }

  function persistSupplierOptions(next: QuoteSupplierOptionDraft[]) {
    const firstSupplier = next[0]
    const firstCarrier = firstSupplier?.carriers[0]
    onQuotePatch({
      supplierOptionsJson: JSON.stringify(next),
      supplierId: firstSupplier?.supplierId ?? "",
      supplier: firstSupplier?.supplierName ?? "",
      supplierOffice: firstSupplier?.supplierOffice ?? "",
      carrierId: firstCarrier?.carrierId ?? "",
      carrier: firstCarrier?.carrierName ?? "",
      carrierOffice: firstCarrier?.carrierOffice ?? "",
      carrierReference: firstCarrier?.reference ?? "",
    })
  }

  function patchSupplier(supplierId: string, patch: Partial<QuoteSupplierOptionDraft>) {
    persistSupplierOptions(supplierOptions.map((supplier) => supplier.id === supplierId ? { ...supplier, ...patch } : supplier))
  }

  function patchCarrier(supplierId: string, carrierId: string, patch: Partial<QuoteCarrierOptionDraft>) {
    persistSupplierOptions(supplierOptions.map((supplier) => supplier.id === supplierId
      ? { ...supplier, carriers: supplier.carriers.map((carrier) => carrier.id === carrierId ? { ...carrier, ...patch } : carrier) }
      : supplier))
  }

  function requestRemoveCarrier(supplierId: string, carrierId: string) {
    const supplier = supplierOptions.find((item) => item.id === supplierId)
    if (!editable || !supplier || supplier.carriers.length === 1) return
    const confirmationKey = `${supplierId}:${carrierId}`
    if (confirmingCarrierId !== confirmationKey) {
      setConfirmingCarrierId(confirmationKey)
      return
    }
    setConfirmingCarrierId(null)
    patchSupplier(supplierId, { carriers: supplier.carriers.filter((item) => item.id !== carrierId) })
  }

  function roleCard(role: "shipper" | "consignee" | "agent") {
    const title = role === "shipper" ? "Shipper" : role === "consignee" ? "Consignee" : "Overseas Agent"
    const roleSearchLabel = role === "agent" ? "overseas agents" : `${role}s`
    const name = role === "shipper" ? quote.shipperName ?? "" : role === "consignee" ? quote.consigneeName ?? "" : quote.agentName ?? ""
    const selectedId = role === "shipper" ? quote.shipperOrgId : role === "consignee" ? quote.consigneeOrgId : quote.agentOrgId
    const selectedOrganisation = organisationForRole(role)
    const selectedContact = selectedOrganisation?.contacts?.find((item) => item.isOperational)
    const autoPopulationDescription = selectedOrganisation
      ? `Filled from ${selectedOrganisation.name}. Edit this field to override it for this quote.`
      : undefined
    const code = role === "shipper" ? quote.shipperCode ?? "" : role === "consignee" ? quote.consigneeCode ?? "" : quote.agentCode ?? ""
    const address = role === "shipper" ? quote.shipperAddress ?? "" : role === "consignee" ? quote.consigneeAddress ?? "" : quote.agentAddress ?? ""
    const contact = role === "shipper" ? quote.shipperContact ?? "" : role === "consignee" ? quote.consigneeContact ?? "" : quote.agentContact ?? ""
    const email = role === "shipper" ? quote.shipperEmail ?? "" : role === "consignee" ? quote.consigneeEmail ?? "" : quote.agentEmail ?? ""
    const reference = role === "shipper" ? quote.shipperReference ?? "" : role === "consignee" ? quote.consigneeReference ?? "" : quote.agentReference ?? ""
    const addresses = selectedOrganisation?.addresses ?? []
    const operationalContacts = operationalContactsForOrganisation(selectedOrganisation?.id)
    const filteredOptions = organisationDirectories[role].options
    const codeOptions = organisationDirectories[role].codes
    const preferredOptions = [...relatedOptions(role)]
    const normalizedName = name.trim().toLocaleLowerCase()
    const selectedOption = filteredOptions.find((option) => option.id === selectedId)
      ?? filteredOptions.find((option) => normalizedName && option.value.trim().toLocaleLowerCase() === normalizedName)
    if (selectedOption?.id && !preferredOptions.some((option) => option.id === selectedOption.id)) preferredOptions.unshift({ ...selectedOption, id: selectedOption.id, description: t("Used on this quote"), keywords: [...(selectedOption.keywords ?? [])] })
    return (
      <CompactSectionShell
        key={role}
        title={title}
        meta={role === "consignee" ? (selectedId ? "Linked" : "Manual entry") : undefined}
        className="[&>header]:h-8 [&>header]:overflow-hidden"
        action={(
          <Button type="button" variant="ghost" size="sm" disabled={!editable || !quote.customer} onClick={() => useCustomerForParty(role)} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px] text-[var(--md-subtle)]">
            <Copy className="size-3" aria-hidden="true" />{t("Use customer")}
          </Button>
        )}
      >
        <div className="grid min-w-0 grid-cols-12 gap-x-2 gap-y-1.5">
          <CompactCombobox
            label="Company"
            value={name}
            options={filteredOptions}
            recommendedOptions={preferredOptions}
            recommendedOptionLimit={organisationRecentOptionLimit}
            recommendedLabel="Current, recent & related"
            allLabel={`All ${roleSearchLabel}`}
            emptyLabel="No matching company"
            placeholder={`Search ${roleSearchLabel} or type manually`}
            disabled={!editable}
            width="full"
            className="col-span-12"
            onValueChange={(value) => {
              onQuoteChange(role === "shipper" ? "shipperName" : role === "consignee" ? "consigneeName" : "agentName", value)
              const selected = organisations.find((item) => item.id === selectedId)
              if (selected && selected.name !== value) onQuoteChange(role === "shipper" ? "shipperOrgId" : role === "consignee" ? "consigneeOrgId" : "agentOrgId", "")
            }}
            onOptionSelect={(option) => option.id && selectOrganisation(role, option.id)}
          />
          <CompactCombobox label="Account code" value={code} options={codeOptions} placeholder="Search account codes" allLabel={`All ${roleSearchLabel} codes`} emptyLabel="No matching account code" disabled={!editable} width="full" valueDirection="ltr" className="col-span-7 [&_input]:tracking-tight" autoPopulated={matchesAutoPopulation(code, selectedOrganisation?.code)} autoPopulationDescription={autoPopulationDescription} onValueChange={(value) => { if (selectOrganisationByCode(role, value)) return; onQuoteChange(role === "shipper" ? "shipperCode" : role === "consignee" ? "consigneeCode" : "agentCode", value); const selected = organisations.find((item) => item.id === selectedId); if (selected && selected.code !== value) onQuoteChange(role === "shipper" ? "shipperOrgId" : role === "consignee" ? "consigneeOrgId" : "agentOrgId", "") }} onOptionSelect={(option) => option.id && selectOrganisation(role, option.id)} />
          <QuoteCompactInput label={`${title} ref`} value={reference} width="full" className="col-span-5" disabled={!editable} onChange={(value) => onQuoteChange(role === "shipper" ? "shipperReference" : role === "consignee" ? "consigneeReference" : "agentReference", value)} />
          <CompactCombobox label="Address" value={address} width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(address, selectedOrganisation?.addresses?.[0]?.address)} autoPopulationDescription={autoPopulationDescription} options={addresses.map((item) => ({ id: item.id, value: item.address, label: item.label || item.address, description: item.address }))} onOptionSelect={(option) => option.id && selectAddress(role, option.id)} onValueChange={(value) => onQuoteChange(role === "shipper" ? "shipperAddress" : role === "consignee" ? "consigneeAddress" : "agentAddress", value)} />
          <CompactCombobox label="Operational contact" value={contact} width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(contact, selectedContact?.name)} autoPopulationDescription={autoPopulationDescription} options={operationalContacts.map((item) => ({ id: item.id, value: item.name, label: item.name, description: item.role || item.email || "" }))} onOptionSelect={(option) => option.id && selectContact(role, option.id)} onValueChange={(value) => onQuoteChange(role === "shipper" ? "shipperContact" : role === "consignee" ? "consigneeContact" : "agentContact", value)} />
          <QuoteCompactInput label="Email" value={email} type="email" width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(email, selectedContact?.email)} autoPopulationDescription={autoPopulationDescription} onChange={(value) => onQuoteChange(role === "shipper" ? "shipperEmail" : role === "consignee" ? "consigneeEmail" : "agentEmail", value)} />
        </div>
      </CompactSectionShell>
    )
  }

  const originIsUs = [originLocation.countryCode, originLocation.countryName, originLocation.unlocode.slice(0, 2)]
    .some((value) => ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(value.trim().toLocaleUpperCase()))
  const incotermDefinition = getIncotermDefinition(quote.incoterm)
  const incotermNotSupplied = quote.incoterm.trim().toUpperCase() === incotermNotSuppliedValue
  const incotermAddressFallback = incotermDefinition?.code === "EXW"
    ? quote.collectionAddress
    : (["DAP", "DPU", "DDP"].includes(incotermDefinition?.code ?? "") ? quote.deliveryAddress : "")
  const incotermNamedPlaceMissing = Boolean(
    incotermDefinition
    && !quote.incotermPlace?.trim()
    && !incotermAddressFallback?.trim(),
  )
  const incotermNamedPlaceLabel = incotermDefinition?.namedLocationLabel ?? "Named place"
  return (
    <div dir={direction} className="@container/quote-details grid items-start gap-2">
      <CompactSectionShell title="Job data" meta="Core quote controls">
        <CompactFieldRow>
          <QuoteCompactSelect label="Source" value={quote.source ?? ""} options={["NEW - New Shipper", "REN - Renewal", "REP - Repeat lane", "TND - Tender"]} width="medium" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.source?.trim()} disabled={!editable} onChange={(value) => onQuoteChange("source", value)} />
          <QuoteCompactSelect label="Mode" value={quote.mode} options={modes} width="short" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.mode.trim()} disabled={!editable} dataOptions onChange={(mode) => { onQuoteChange("mode", mode); const next = shipmentTypeValue(mode, quote.shipmentType, shipmentTypeChoicesForMode(mode, shipmentTypes)); if (next !== quote.shipmentType) onQuoteChange("shipmentType", next) }} />
          <QuoteCompactSelect label="Shipment type" value={shipmentTypeValue(quote.mode, quote.shipmentType, shipmentTypeChoicesForMode(quote.mode, shipmentTypes))} options={shipmentTypeChoicesForMode(quote.mode, shipmentTypes)} width="medium" disabled={!editable} dataOptions onChange={(value) => onQuoteChange("shipmentType", value)} />
          <QuoteCompactSelect label="HBL mode" value={quote.hblMode ?? ""} options={["CY/CFS", "CY/CY", "CFS/CFS", "Door/Door"]} width="short" disabled={!editable} onChange={(value) => onQuoteChange("hblMode", value)} />
          <QuoteCompactSelect label={calculatedDirection ? "Direction (auto)" : "Direction"} value={calculatedDirection ?? quote.direction ?? ""} options={["Export", "Import", "Domestic", "Cross trade"]} width="short" disabled={!editable || Boolean(calculatedDirection)} onChange={(value) => onQuoteChange("direction", value)} />
          <QuoteCompactSelect label="Department" value={quote.department ?? ""} options={lookups?.departments.map((item) => item.name) ?? []} width="short" disabled={!editable} dataOptions onChange={(value) => { const item = lookups?.departments.find((department) => department.name === value); onQuoteChange("department", value); onQuoteChange("departmentId", item?.id ?? "") }} />
          <QuoteCompactSelect label="Branch" value={quote.branch ?? ""} options={lookups?.offices.map((item) => ({ value: item.code || item.name, label: item.code || item.name })) ?? []} width="code" disabled={!editable} dataOptions onChange={(value) => { const item = lookups?.offices.find((office) => (office.code || office.name) === value); onQuoteChange("branch", value); onQuoteChange("officeId", item?.id ?? "") }} />
          <QuoteCompactSelect label="Priority" value={quote.priority ?? ""} options={["Low", "Standard", "High", "Tender"]} width="short" disabled={!editable} onChange={(value) => onQuoteChange("priority", value)} />
          <QuoteCompactDatePicker label="Valid from" value={quote.startDate ?? ""} disabled={!editable} onChange={(value) => onQuoteChange("startDate", value)} />
          <QuoteCompactDatePicker label="Valid to" value={quote.endDate ?? ""} minDate={quote.startDate || undefined} disabled={!editable} onChange={(value) => onQuoteChange("endDate", value)} />
          <QuoteCompactSelect label="Currency" value={quote.currency} options={currencies} width="code" disabled={!editable} dataOptions required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.currency} onChange={(value) => onQuoteChange("currency", value)} />
        </CompactFieldRow>
      </CompactSectionShell>

      <div className="grid items-stretch gap-2 @min-[40rem]/quote-details:grid-cols-2 @min-[80rem]/quote-details:grid-cols-4">
        <CompactSectionShell title="Customer" className="[&>header]:h-8 [&>header]:overflow-hidden">
          <div className="grid min-w-0 grid-cols-12 gap-x-2 gap-y-1.5">
            <CompactCombobox label="Customer" value={quote.customer} options={organisationDirectories.customer.options} clearable={!quote.customerId} onValueChange={(value) => { if (quote.customerId && customerOrganisation?.name !== value) return; onQuoteChange("customer", value); if (customerOrganisation && customerOrganisation.name !== value) onQuoteChange("customerId", "") }} onOptionSelect={(option) => option.id && selectOrganisation("customer", option.id)} placeholder="Search customers or type manually" allLabel="All customers" emptyLabel="No matching customer company" disabled={!editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.customer.trim()} width="full" className="col-span-12" />
            <CompactCombobox label="Account code" value={quote.clientCode ?? ""} options={organisationDirectories.customer.codes} clearable={!quote.customerId} autoPopulated={matchesAutoPopulation(quote.clientCode, customerOrganisation?.code)} autoPopulationDescription={customerAutoPopulationDescription} onValueChange={(value) => { if (selectOrganisationByCode("customer", value)) return; if (quote.customerId && customerOrganisation?.code !== value) return; onQuoteChange("clientCode", value); if (customerOrganisation && customerOrganisation.code !== value) onQuoteChange("customerId", "") }} onOptionSelect={(option) => option.id && selectOrganisation("customer", option.id)} placeholder="Search account codes" allLabel="All customer codes" emptyLabel="No matching account code" disabled={!editable} width="full" valueDirection="ltr" className="col-span-7 [&_input]:tracking-tight" />
            <QuoteCompactInput label="Customer PO" value={quote.customerPO ?? ""} width="full" className="col-span-5" disabled={!editable} onChange={(value) => onQuoteChange("customerPO", value)} />
            <CompactCombobox label="Address" value={quote.customerAddress ?? ""} width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(quote.customerAddress, customerOrganisation?.addresses?.[0]?.address)} autoPopulationDescription={customerAutoPopulationDescription} options={customerAddresses.map((item) => ({ id: item.id, value: item.address, label: item.label || item.address, description: item.address }))} onOptionSelect={(option) => option.id && selectAddress("customer", option.id)} onValueChange={(value) => onQuoteChange("customerAddress", value)} />
            <QuoteCompactInput label="Customer ref" value={quote.localRef ?? ""} width="full" className="col-span-5" disabled={!editable} onChange={(value) => onQuoteChange("localRef", value)} />
            <CompactCombobox label="Operational contact" value={quote.customerContact ?? ""} width="full" className="col-span-7" disabled={!editable} autoPopulated={matchesAutoPopulation(quote.customerContact, customerSourceContact?.name)} autoPopulationDescription={customerAutoPopulationDescription} options={customerOperationalContacts.map((item) => ({ id: item.id, value: item.name, label: item.name, description: item.role || item.email || "" }))} onOptionSelect={(option) => option.id && selectContact("customer", option.id)} onValueChange={(value) => { onQuoteChange("customerContact", value); if (value !== quote.customerContact) onQuoteChange("contactId", "") }} />
            <QuoteCompactInput label="Email" value={quote.customerEmail ?? ""} type="email" width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(quote.customerEmail, customerSourceContact?.email)} autoPopulationDescription={customerAutoPopulationDescription} onChange={(value) => onQuoteChange("customerEmail", value)} />
          </div>
        </CompactSectionShell>
        {roleCard("shipper")}
        {roleCard("consignee")}
        {roleCard("agent")}
      </div>

      <CompactSectionShell
        title="Route & service"
        meta={routingLegs.length > 1 ? `${routingLegs.length} planned legs` : "Linked country, place and UN/LOCODE fields"}
        action={(
          <Button type="button" variant="ghost" size="sm" disabled={!editable || routingLegs.length >= 30} onClick={addRoutingLeg} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px]">
            <Plus className="size-3" aria-hidden="true" />{t("Add routing leg")}
          </Button>
        )}
      >
        <div className="grid gap-2">
          {isSeaContainerised ? (
            <div className="grid gap-1.5" role="group" aria-label={t("Container requests")}>
              {containerRequests.map((request, index) => {
                const rowInvalid = requireCoreFields && validationAttempted && (!request.quantity || !request.type.trim())
                return (
                  <div key={request.id} className="grid min-w-0 items-start gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(7rem,0.5fr)_minmax(11rem,1.15fr)_minmax(5rem,0.35fr)_minmax(10rem,0.8fr)_2rem_auto]">
                    {index === 0 ? (
                      <>
                        <QuoteCompactSelect label="Incoterms / scope" value={quote.incoterm} options={incotermOptions} width="full" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.incoterm.trim()} disabled={!editable} onChange={(value) => onQuoteChange("incoterm", value)} />
                        <QuoteCompactInput label={incotermNamedPlaceLabel} value={quote.incotermPlace ?? ""} width="full" required={Boolean(incotermDefinition)} invalid={requireCoreFields && validationAttempted && incotermNamedPlaceMissing} disabled={!editable} onChange={(value) => onQuoteChange("incotermPlace", value)} />
                      </>
                    ) : <div className="hidden xl:col-span-2 xl:block" aria-hidden="true" />}
                    <QuoteCompactInput
                      label={index === 0 ? "Qty" : `Qty ${index + 1}`}
                      value={request.quantity}
                      type="number"
                      width="full"
                      required={requireCoreFields}
                      invalid={rowInvalid && !request.quantity}
                      disabled={!editable}
                      onChange={(value) => updateContainerRequest(index, { quantity: value.replace(/\D+/gu, "").slice(0, 3) })}
                    />
                    <CompactCombobox
                      label={index === 0 ? "Container type" : `Container type ${index + 1}`}
                      value={request.type}
                      options={seaContainerTypeOptions}
                      placeholder="Choose or type"
                      allLabel="Common container types"
                      emptyLabel="No matching container type"
                      width="full"
                      required={requireCoreFields}
                      invalid={rowInvalid && !request.type.trim()}
                      disabled={!editable}
                      onValueChange={(value) => updateContainerRequest(index, { type: value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!editable}
                      aria-label={t(`Remove container request ${index + 1}`)}
                      onClick={() => removeContainerRequest(index)}
                      className="mt-5 size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-red-soft)] hover:text-[var(--md-red)]"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                    {index === 0 ? (
                      <Button type="button" variant="ghost" size="sm" disabled={!editable || containerRequests.length >= 20} onClick={addContainerRequest} className="mt-5 h-8 justify-self-start rounded-[var(--md-radius-md)] px-2 text-[10.5px] sm:justify-self-end xl:justify-self-start">
                        <Plus className="size-3" aria-hidden="true" />{t("Add container")}
                      </Button>
                    ) : <div className="hidden xl:block" aria-hidden="true" />}
                  </div>
                )
              })}
              {requireCoreFields && validationAttempted && !quote.container.trim() ? (
                <p className="text-[10.5px] leading-4 text-[var(--md-red)]">{t("Add at least one complete container request")}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(8rem,0.55fr)_minmax(18rem,1.6fr)]">
              <QuoteCompactSelect label="Incoterms / scope" value={quote.incoterm} options={incotermOptions} width="full" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.incoterm.trim()} disabled={!editable} onChange={(value) => onQuoteChange("incoterm", value)} />
              <QuoteCompactInput label={incotermNamedPlaceLabel} value={quote.incotermPlace ?? ""} width="full" required={Boolean(incotermDefinition)} invalid={requireCoreFields && validationAttempted && incotermNamedPlaceMissing} disabled={!editable} onChange={(value) => onQuoteChange("incotermPlace", value)} />
            </div>
          )}
          {incotermNotSupplied ? (
            <div className="grid min-w-0 gap-2 sm:grid-cols-3" role="group" aria-label={t("Quoted operational scope")}>
              <QuoteCompactSelect label="Collection" value={quote.collectionRequired ?? ""} options={[{ value: "No", label: "Not included" }, { value: "Yes", label: "Included" }]} width="full" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.collectionRequired?.trim()} disabled={!editable} onChange={(value) => onQuoteChange("collectionRequired", value)} />
              <QuoteCompactSelect label="Delivery" value={quote.deliveryRequired ?? ""} options={[{ value: "No", label: "Not included" }, { value: "Yes", label: "Included" }]} width="full" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.deliveryRequired?.trim()} disabled={!editable} onChange={(value) => onQuoteChange("deliveryRequired", value)} />
              <QuoteCompactSelect label="Customs clearance" value={quote.customsIncluded ?? ""} options={[{ value: "No", label: "Not included" }, { value: "Yes", label: "Included" }]} width="full" required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.customsIncluded?.trim()} disabled={!editable} onChange={(value) => onQuoteChange("customsIncluded", value)} />
            </div>
          ) : null}
          <div className="grid gap-2 xl:grid-cols-2">
            <LocationFields mode={quote.mode} label="Origin from" value={originLocation} options={locationOptions} recommendedLocationIds={recommendedLocationIds} countries={countries} directoryStatus={unlocodeDirectoryStatus} directoryCount={unlocodeDirectoryCount} onChange={(value) => updateLocation("origin", value)} disabled={!editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.origin.trim()} />
            <LocationFields mode={quote.mode} label="Destination to" value={destinationLocation} options={locationOptions} recommendedLocationIds={recommendedLocationIds} countries={countries} directoryStatus={unlocodeDirectoryStatus} directoryCount={unlocodeDirectoryCount} onChange={(value) => updateLocation("destination", value)} disabled={!editable} required={requireCoreFields} invalid={requireCoreFields && validationAttempted && !quote.destination.trim()} />
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(9rem,0.7fr)_minmax(10rem,0.72fr)_minmax(10rem,0.72fr)_minmax(10rem,0.7fr)_minmax(24rem,1.7fr)] xl:items-start">
            <QuoteCompactInput label="Via" value={quote.via} width="full" disabled={!editable} onChange={(value) => onQuoteChange("via", value)} />
            <QuoteCompactDatePicker label="ETD" value={quote.estimatedDeparture ?? ""} disabled={!editable} onChange={(value) => routingLegs.length > 1 ? updateRoutingLeg(0, { estimatedDeparture: value }) : onQuotePatch({ estimatedDeparture: value, transitDays: quoteTransitDays(value, quote.estimatedArrival), transitUnit: "Days" })} />
            <QuoteCompactDatePicker label="ETA" value={quote.estimatedArrival ?? ""} minDate={quote.estimatedDeparture || undefined} disabled={!editable} onChange={(value) => routingLegs.length > 1 ? updateRoutingLeg(routingLegs.length - 1, { estimatedArrival: value }) : onQuotePatch({ estimatedArrival: value, transitDays: quoteTransitDays(quote.estimatedDeparture, value), transitUnit: "Days" })} />
            <NumberUnitField label="Transit time" value={{ value: quoteTransitDays(quote.estimatedDeparture, quote.estimatedArrival) || quote.transitDays || "", unit: "Days" }} units={[{ value: "Days", label: "Days" }]} width="full" disabled onChange={() => undefined} />
            <RecurrenceBuilder value={recurrence} onChange={updateRecurrence} disabled={!editable} />
          </div>
          {routingLegs.length > 1 ? (
            <div className="grid gap-1.5" role="group" aria-label={t("Planned routing legs")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-[var(--md-ink)]">{t("Planned routing legs")}</p>
                  <p className="text-[10px] text-[var(--md-subtle)]">{t("The first origin and final destination remain the shipment summary above.")}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={!editable} onClick={removeLastRoutingLeg} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px] text-[var(--md-subtle)]">
                  <Trash2 className="size-3" aria-hidden="true" />{t("Remove last leg")}
                </Button>
              </div>
              {routingLegs.map((leg, index) => (
                <div key={leg.id} className="grid min-w-0 gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)] xl:grid-cols-[5.5rem_minmax(10rem,1fr)_minmax(10rem,1fr)_9rem_9rem_minmax(11rem,1fr)_8rem] xl:items-end">
                  <QuoteCompactSelect label={`Leg ${index + 1} mode`} value={leg.mode} options={modes} width="full" disabled={!editable} dataOptions onChange={(value) => updateRoutingLeg(index, { mode: value })} />
                  <CompactCombobox label={`Leg ${index + 1} origin`} value={leg.origin.unlocode || leg.origin.place} options={routeLocationOptions} recommendedOptionLimit={3} placeholder="Search place or UN/LOCODE" disabled={!editable} width="full" onValueChange={(value) => updateRoutingLocation(index, "origin", value)} onOptionSelect={(option) => updateRoutingLocation(index, "origin", option.value, option)} />
                  <CompactCombobox label={`Leg ${index + 1} destination`} value={leg.destination.unlocode || leg.destination.place} options={routeLocationOptions} recommendedOptionLimit={3} placeholder="Search place or UN/LOCODE" disabled={!editable} width="full" onValueChange={(value) => updateRoutingLocation(index, "destination", value)} onOptionSelect={(option) => updateRoutingLocation(index, "destination", option.value, option)} />
                  <QuoteCompactDatePicker label="Departure" value={leg.estimatedDeparture} disabled={!editable} onChange={(value) => updateRoutingLeg(index, { estimatedDeparture: value })} />
                  <QuoteCompactDatePicker label="Arrival" value={leg.estimatedArrival} minDate={leg.estimatedDeparture || undefined} disabled={!editable} onChange={(value) => updateRoutingLeg(index, { estimatedArrival: value })} />
                  <CompactCombobox label="Carrier" value={leg.carrierName} options={organisationDirectories.carrier.options} recommendedOptions={relatedOptions("carrier")} recommendedLabel="Suggested carriers" allLabel="All carriers" placeholder="TBC or search carriers" disabled={!editable} width="full" onValueChange={(value) => updateRoutingLeg(index, { carrierName: value, carrierId: organisationsById.get(leg.carrierId)?.name === value ? leg.carrierId : "" })} onOptionSelect={(option) => updateRoutingLeg(index, { carrierId: option.id ?? "", carrierName: option.value })} />
                  <QuoteCompactSelect label="Service level" value={leg.serviceLevel} options={["Economy", "Standard", "Express"]} width="full" disabled={!editable} onChange={(value) => updateRoutingLeg(index, { serviceLevel: value })} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CompactSectionShell>

      <CompactSectionShell
        title="Supplier & carrier options"
        meta="Multiple carrier services can sit beneath each supplier"
        action={<div className="flex gap-1"><Button type="button" variant="ghost" size="sm" disabled={!editable} onClick={() => persistSupplierOptions([...supplierOptions, blankSupplierOption()])} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px]"><Plus className="size-3" />{t("Add supplier")}</Button><Button type="button" size="sm" disabled={!supplierOptions.some((supplier) => supplier.supplierName.trim())} onClick={() => setRateRequestOpen(true)} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px]"><Send className="size-3" />{t("Prepare rate requests")}</Button></div>}
      >
        <div className="grid gap-1.5">
          {supplierOptions.map((supplier, supplierIndex) => {
            const selectedSupplier = organisations.find((item) => item.id === supplier.supplierId)
            const supplierDirectory = organisationDirectories.supplier.options
            const carrierDirectory = organisationDirectories.carrier.options
            const carrierColumns: DataTableColumn<QuoteCarrierOptionDraft>[] = [
              {
                id: "carrier",
                label: "Carrier",
                kind: "custom",
                width: 344,
                canHide: false,
                canPin: false,
                resizable: false,
                cellClassName: "px-2 py-1.5",
                cell: (carrier) => {
                  const selectedCarrier = organisations.find((item) => item.id === carrier.carrierId)
                  const carrierSequence = supplier.carriers.indexOf(carrier) + 1
                  return <div className="flex min-w-0 items-center gap-1.5"><span data-i18n-skip dir="ltr" aria-label={`${t("Carrier ID")} ${carrierSequence}`} className="inline-grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-[11px] font-medium text-[var(--md-ink)]">{carrierSequence}</span><CompactCombobox label="Carrier" value={carrier.carrierName} options={carrierDirectory} recommendedOptions={relatedOptions("carrier")} recommendedOptionLimit={organisationRecentOptionLimit} recommendedLabel="Suggested carriers" allLabel="All organisations" onValueChange={(value) => patchCarrier(supplier.id, carrier.id, { carrierName: value, carrierId: selectedCarrier?.name === value ? carrier.carrierId : "" })} onOptionSelect={(option) => { const item = organisationsById.get(option.id ?? ""); if (item) patchCarrier(supplier.id, carrier.id, { carrierId: item.id, carrierName: item.name, carrierOffice: item.addresses?.[0]?.label ?? "" }) }} placeholder="TBC or search carriers" disabled={!editable} width="full" className="min-w-0 flex-1 [&>div:first-child]:sr-only" /></div>
                },
              },
              {
                id: "carrier-office",
                label: "Carrier office",
                kind: "custom",
                width: 220,
                canHide: false,
                canPin: false,
                resizable: false,
                cellClassName: "px-2 py-1.5",
                cell: (carrier) => {
                  const selectedCarrier = organisations.find((item) => item.id === carrier.carrierId)
                  return <CompactCombobox label="Carrier office" value={carrier.carrierOffice} options={(selectedCarrier?.addresses ?? []).map((address) => ({ id: address.id, value: address.label, label: address.label, description: address.address }))} onValueChange={(value) => patchCarrier(supplier.id, carrier.id, { carrierOffice: value })} placeholder="Select or type office" disabled={!editable || !carrier.carrierName} width="full" className="[&>div:first-child]:sr-only" autoPopulated={matchesAutoPopulation(carrier.carrierOffice, selectedCarrier?.addresses?.[0]?.label)} autoPopulationDescription={selectedCarrier ? `Filled from ${selectedCarrier.name}. Edit this field to override it for this quote.` : undefined} />
                },
              },
              {
                id: "carrier-reference",
                label: "Carrier ref",
                kind: "text",
                width: 150,
                canHide: false,
                canPin: false,
                resizable: false,
                cellClassName: "px-2 py-1.5",
                cell: (carrier) => <QuoteCompactInput label="Carrier ref" value={carrier.reference} width="full" className="[&>div:first-child]:sr-only" disabled={!editable} onChange={(value) => patchCarrier(supplier.id, carrier.id, { reference: value })} />,
              },
              {
                id: "service-level",
                label: "Service level",
                kind: "attribute",
                width: 145,
                canHide: false,
                canPin: false,
                resizable: false,
                cellClassName: "px-2 py-1.5",
                cell: (carrier) => <CarrierServiceLevelPill value={carrier.serviceLevel} disabled={!editable} onChange={(value) => patchCarrier(supplier.id, carrier.id, { serviceLevel: value })} />,
              },
              {
                id: "rate-source",
                label: "Rate source",
                kind: "attribute",
                width: 150,
                canHide: false,
                canPin: false,
                resizable: false,
                cellClassName: "px-2 py-1.5",
                cell: (carrier) => <QuoteCompactSelect label="Rate source" value={carrier.rateSource} options={["Manual", "Tariff", "Carrier portal", "Historic quote"]} width="full" className="[&>div:first-child]:sr-only" disabled={!editable} onChange={(value) => patchCarrier(supplier.id, carrier.id, { rateSource: value })} />,
              },
              {
                id: "carrier-actions",
                label: "Actions",
                kind: "actions",
                align: "center",
                width: 52,
                canHide: false,
                canPin: false,
                resizable: false,
                exportable: false,
                cellClassName: "px-1 py-1.5",
                cell: (carrier) => <QuoteCarrierRemoveAction
                  confirming={confirmingCarrierId === `${supplier.id}:${carrier.id}`}
                  disabled={!editable || supplier.carriers.length === 1}
                  onCancel={() => setConfirmingCarrierId(null)}
                  onRemove={() => requestRemoveCarrier(supplier.id, carrier.id)}
                />,
              },
            ]
            return (
              <section key={supplier.id} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_1.75rem] items-start gap-x-2 gap-y-1.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_1.75rem] xl:grid-cols-[minmax(16rem,2fr)_minmax(12rem,1fr)_minmax(14rem,1.2fr)_1.75rem]">
                  <CompactCombobox label={`${t("Supplier")} ${supplierIndex + 1}`} value={supplier.supplierName} options={supplierDirectory} recommendedOptions={relatedOptions("supplier")} recommendedOptionLimit={organisationRecentOptionLimit} recommendedLabel="Suggested suppliers" allLabel="All organisations" onValueChange={(value) => patchSupplier(supplier.id, { supplierName: value, supplierId: selectedSupplier?.name === value ? supplier.supplierId : "" })} onOptionSelect={(option) => { const item = organisationsById.get(option.id ?? ""); if (item) patchSupplier(supplier.id, { supplierId: item.id, supplierName: item.name, supplierOffice: item.addresses?.[0]?.label ?? "", contact: item.contacts?.[0]?.email ?? item.contacts?.[0]?.name ?? "" }) }} placeholder="Search suppliers or type manually" disabled={!editable} width="full" className="col-start-1" />
                  <CompactCombobox label="Supplier office" value={supplier.supplierOffice} options={(selectedSupplier?.addresses ?? []).map((address) => ({ id: address.id, value: address.label, label: address.label, description: address.address }))} onValueChange={(value) => patchSupplier(supplier.id, { supplierOffice: value })} placeholder="Select or type office" disabled={!editable} width="full" className="col-span-2 md:col-span-1" autoPopulated={matchesAutoPopulation(supplier.supplierOffice, selectedSupplier?.addresses?.[0]?.label)} autoPopulationDescription={selectedSupplier ? `Filled from ${selectedSupplier.name}. Edit this field to override it for this quote.` : undefined} />
                  <CompactCombobox label="Contact" value={supplier.contact} options={(selectedSupplier?.contacts ?? []).map((contact) => ({ id: contact.id, value: contact.email || contact.name, label: contact.name, description: contact.email ?? "" }))} onValueChange={(value) => patchSupplier(supplier.id, { contact: value })} placeholder="Contact or email" disabled={!editable} width="full" className="col-span-2 md:col-span-2 xl:col-span-1" autoPopulated={matchesAutoPopulation(supplier.contact, selectedSupplier?.contacts?.[0]?.email || selectedSupplier?.contacts?.[0]?.name)} autoPopulationDescription={selectedSupplier ? `Filled from ${selectedSupplier.name}. Edit this field to override it for this quote.` : undefined} />
                  <Button type="button" variant="ghost" size="icon-sm" disabled={!editable || supplierOptions.length === 1} title={supplierOptions.length === 1 ? t("At least one supplier is required") : undefined} onClick={() => persistSupplierOptions(supplierOptions.filter((item) => item.id !== supplier.id))} aria-label={t("Remove supplier")} className="col-start-2 row-start-1 mt-5 size-7 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)] md:col-start-3 xl:col-start-4"><Trash2 className="size-3.5" /></Button>
                </div>
                <div className="mt-1.5 grid gap-1.5">
                  <DataTable ariaLabel="Carrier options"
                    columns={carrierColumns}
                    rows={supplier.carriers}
                    getRowKey={(carrier) => carrier.id}
                    rowAriaLabel={(carrier) => `${t("Carrier")} ${carrier.carrierName || t("Not set")}`}
                    rowContextActions={(carrier) => [{
                      id: "remove-carrier",
                      label: "Remove carrier",
                      hint: supplier.carriers.length === 1 ? "Keep one option" : "Confirmation required",
                      icon: Trash2,
                      tone: "destructive",
                      disabled: !editable || supplier.carriers.length === 1,
                      onSelect: () => requestRemoveCarrier(supplier.id, carrier.id),
                    }]}
                    minimumWidth={1061}
                    showToolbar={false}
                    showColumnManager={false}
                    enableSelectionExport={false}
                    rowClassName="h-12"
                    className="[&_[data-table-surface]]:rounded-[var(--md-radius-md)] [&_[data-table-surface]]:shadow-none"
                    tableClassName="text-[11px]"
                  />
                  <Button type="button" variant="ghost" size="sm" disabled={!editable} onClick={() => patchSupplier(supplier.id, { carriers: [...supplier.carriers, blankCarrierOption()] })} className="h-7 w-fit rounded-[var(--md-radius-md)] px-2 text-[10.5px] text-[var(--md-accent)]"><Plus className="size-3" />{t("Add carrier")}</Button>
                </div>
              </section>
            )
          })}
        </div>
      </CompactSectionShell>

      <CompactSectionShell title="Goods" meta="Values, quantities and cargo characteristics">
        <div className="grid gap-2">
          <CompactFieldRow>
            <AmountCurrencyField label="Goods value" value={{ amount: quote.goodsValue ?? "", currency: quote.goodsValueCurrency || quote.currency || "GBP" }} currencies={currencies} disabled={!editable} onChange={(value) => { onQuoteChange("goodsValue", value.amount); onQuoteChange("goodsValueCurrency", value.currency) }} width="medium" />
            <AmountCurrencyField label="Insurance value" value={{ amount: quote.insuranceValue ?? "", currency: quote.insuranceValueCurrency || quote.currency || "GBP" }} currencies={currencies} disabled={!editable} onChange={(value) => { onQuoteChange("insuranceValue", value.amount); onQuoteChange("insuranceValueCurrency", value.currency) }} width="medium" />
            <QuoteCompactInput label="Entries" value={quote.entries ?? ""} type="number" dir="ltr" width="code" disabled={!editable} onChange={(value) => onQuoteChange("entries", value)} />
            <QuoteCompactInput label="Lines" value={quote.invoiceLines ?? ""} type="number" dir="ltr" width="code" disabled={!editable} onChange={(value) => onQuoteChange("invoiceLines", value)} />
            <CompactCombobox label="Commodity" value={quote.commodity ?? ""} options={(lookups?.commodities ?? []).map((item) => ({ id: item.id, value: item.name, label: item.name, description: item.code }))} onValueChange={(value) => onQuoteChange("commodity", value)} placeholder="Search or type commodity" disabled={!editable} width="grow" />
            <QuoteCompactInput label="Packages / pieces" value={quote.packageQuantity ?? ""} type="number" dir="ltr" width="short" disabled={!editable} onChange={(value) => onQuoteChange("packageQuantity", value)} />
            <CompactCombobox
              label="Package type"
              value={quote.packageType ?? ""}
              options={freightPackageTypeOptions}
              recommendedOptions={commonFreightPackageTypeOptions}
              recommendedLabel="Common package types"
              allLabel="All package types"
              emptyLabel="No matching package types"
              placeholder="Select or type package type"
              onValueChange={(value) => onQuoteChange("packageType", value)}
              disabled={!editable}
              width="short"
            />
            <QuoteCompactInput label="Gross weight (kg)" value={quote.grossWeightKg ?? ""} type="number" dir="ltr" width="short" disabled={!editable} onChange={(value) => onQuoteChange("grossWeightKg", value)} />
            <QuoteCompactInput label="Volume (CBM)" value={quote.volumeCbm ?? ""} type="number" dir="ltr" width="short" disabled={!editable} onChange={(value) => onQuoteChange("volumeCbm", value)} />
            <QuoteCompactInput label="Chargeable weight (kg)" value={quote.chargeableWeightKg ?? ""} type="number" dir="ltr" width="short" disabled={!editable} onChange={(value) => onQuoteChange("chargeableWeightKg", value)} />
            {originIsUs ? <QuoteCompactSelect label="FMC TID" value={quote.fmcTid ?? ""} options={["Not required", "Required", "Pending"]} width="short" disabled={!editable} onChange={(value) => onQuoteChange("fmcTid", value)} /> : null}
          </CompactFieldRow>
          <div>
            <p className="mb-1.5 text-[10.5px] font-medium text-[var(--md-text)]">{t("Cargo characteristics")}</p>
            <CargoCharacteristicsField value={characteristics} onChange={(value) => { onQuoteChange("cargoCharacteristics", cargoCharacteristicsToString(value)); onQuoteChange("knownCargo", value.hazardous ? "Hazardous" : "General merchandise") }} hazardousDetails={hazardousDetails} onHazardousDetailsChange={updateHazardousDetails} disabled={!editable} />
          </div>
        </div>
      </CompactSectionShell>

      <CompactSectionShell title="Customs agents" meta="Choose origin and destination clearance separately">
          <div className="grid gap-1.5 md:grid-cols-2">
            <CompactCombobox label="Origin customs agent" value={quote.originCustomsAgentName ?? ""} options={organisationDirectories.agent.options} recommendedOptions={relatedOptions("agent")} recommendedOptionLimit={organisationRecentOptionLimit} onValueChange={(value) => { onQuoteChange("originCustomsAgentName", value); const selected = organisations.find((item) => item.id === quote.originCustomsAgentId); if (selected?.name !== value) onQuoteChange("originCustomsAgentId", "") }} onOptionSelect={(option) => { const item = organisationsById.get(option.id ?? ""); if (item) { onQuoteChange("originCustomsAgentId", item.id); onQuoteChange("originCustomsAgentName", item.name) } }} placeholder="Select us, an agent, or type manually" disabled={!editable} width="full" />
            <CompactCombobox label="Destination customs agent" value={quote.destinationCustomsAgentName ?? ""} options={organisationDirectories.agent.options} recommendedOptions={relatedOptions("agent")} recommendedOptionLimit={organisationRecentOptionLimit} onValueChange={(value) => { onQuoteChange("destinationCustomsAgentName", value); const selected = organisations.find((item) => item.id === quote.destinationCustomsAgentId); if (selected?.name !== value) onQuoteChange("destinationCustomsAgentId", "") }} onOptionSelect={(option) => { const item = organisationsById.get(option.id ?? ""); if (item) { onQuoteChange("destinationCustomsAgentId", item.id); onQuoteChange("destinationCustomsAgentName", item.name) } }} placeholder="Select us, an agent, or type manually" disabled={!editable} width="full" />
          </div>
      </CompactSectionShell>

      <div className="grid gap-2 xl:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] xl:items-start">
        <CompactSectionShell
          title="Bill to / payer"
          meta="This account supplies the quote terms"
          action={(
            <Button type="button" variant="ghost" size="sm" disabled={!editable || !quote.customer} onClick={() => useCustomerForParty("payer")} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10.5px] text-[var(--md-subtle)]">
              <Copy className="size-3" aria-hidden="true" />{t("Use customer")}
            </Button>
          )}
        >
          <div className="grid min-w-0 grid-cols-12 gap-x-2 gap-y-1.5">
            <CompactCombobox label="Payer" value={quote.payerName ?? quote.customer} options={organisationDirectories.payer.options} allowCustom={false} onValueChange={(value) => { if (payerOrganisation?.name !== value) onQuoteChange("payerOrgId", "") }} onOptionSelect={(option) => option.id && selectOrganisation("payer", option.id)} placeholder="Search customer accounts" allLabel="All customer accounts" emptyLabel="No matching payer account" disabled={!editable} width="full" className="col-span-12" />
            <CompactCombobox label="Account code" value={quote.payerCode ?? quote.clientCode ?? ""} options={organisationDirectories.payer.codes} allowCustom={false} autoPopulated={matchesAutoPopulation(quote.payerCode, payerOrganisation?.code)} autoPopulationDescription={payerAutoPopulationDescription} onValueChange={(value) => { selectOrganisationByCode("payer", value) }} onOptionSelect={(option) => option.id && selectOrganisation("payer", option.id)} placeholder="Search account codes" allLabel="All payer account codes" emptyLabel="No matching account code" disabled={!editable} width="full" valueDirection="ltr" className="col-span-5 [&_input]:tracking-tight" />
            <CompactCombobox label="Billing contact" value={quote.payerContact ?? quote.customerContact ?? ""} width="full" className="col-span-7" disabled={!editable} autoPopulated={matchesAutoPopulation(quote.payerContact, payerSourceContact?.name)} autoPopulationDescription={payerAutoPopulationDescription} options={payerOperationalContacts.map((item) => ({ id: item.id, value: item.name, label: item.name, description: item.role || item.email || "" }))} onOptionSelect={(option) => option.id && selectContact("payer", option.id)} onValueChange={(value) => onQuoteChange("payerContact", value)} />
            <CompactCombobox label="Billing address" value={quote.payerAddress ?? quote.customerAddress ?? ""} width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(quote.payerAddress, payerOrganisation?.addresses?.[0]?.address)} autoPopulationDescription={payerAutoPopulationDescription} options={payerAddresses.map((item) => ({ id: item.id, value: item.address, label: item.label || item.address, description: item.address }))} onOptionSelect={(option) => option.id && selectAddress("payer", option.id)} onValueChange={(value) => onQuoteChange("payerAddress", value)} />
            <QuoteCompactInput label="Billing email" value={quote.payerEmail ?? quote.customerEmail ?? ""} type="email" width="full" className="col-span-12" disabled={!editable} autoPopulated={matchesAutoPopulation(quote.payerEmail, payerSourceContact?.email)} autoPopulationDescription={payerAutoPopulationDescription} onChange={(value) => onQuoteChange("payerEmail", value)} />
          </div>
        </CompactSectionShell>
        <CompactSectionShell title="Customer terms" meta={quote.customerTermsSource ? `${t("Inherited from")} ${quote.customerTermsSource}` : "Stored on the payer account"} contentClassName="bg-[var(--md-surface-soft)]" action={<span className="flex items-center gap-1 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 py-1 text-[10.5px] font-medium text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]"><HugeiconsIcon icon={LockPasswordSolidRoundedIcon} className="size-3" aria-hidden="true" />{t("Locked to payer account")}</span>}>
          <div className="grid gap-2 md:grid-cols-2">
            <LockedQuoteTextarea label="Terms and conditions" value={quote.terms ?? ""} />
            <LockedQuoteTextarea label="Subject to rate / space" value={quote.subjectToTerms ?? ""} />
            <LockedQuoteTextarea label="Customer notes" value={quote.customerNotes ?? ""} />
            <QuoteCompactDatePicker label="Response deadline" value={quote.deadline ?? ""} disabled locked onChange={() => undefined} />
          </div>
        </CompactSectionShell>
      </div>

      <Dialog open={rateRequestOpen} onOpenChange={setRateRequestOpen}>
        <DialogContent dir={direction} className="rounded-[var(--md-radius-xl)] sm:max-w-[580px]">
          <DialogHeader className="text-start"><DialogTitle>{t("Prepare rate requests")}</DialogTitle><DialogDescription>{t("Review the supplier contacts and carrier options. This prepares drafts only; nothing is sent without approval.")}</DialogDescription></DialogHeader>
          <div className="max-h-[46vh] overflow-y-auto rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2">
            {supplierOptions.map((supplier) => <div key={supplier.id} className="mb-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2.5 py-2 text-[11.5px] shadow-[var(--md-shadow-line)]"><p className="font-medium text-[var(--md-ink)]">{supplier.supplierName || t("Supplier not selected")}</p><p className="text-[var(--md-subtle)]">{supplier.contact || t("Contact required before sending")} · {supplier.carriers.map((carrier) => carrier.carrierName || t("Carrier TBC")).join(", ")}</p></div>)}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRateRequestOpen(false)}>{t("Cancel")}</Button><Button type="button" onClick={() => { persistSupplierOptions(supplierOptions.map((supplier) => ({ ...supplier, carriers: supplier.carriers.map((carrier) => ({ ...carrier, status: "prepared" as const })) }))); setRateRequestOpen(false) }}>{t("Prepare drafts")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuoteCargoWiseChargesPanel({ quote, charges }: { quote: QuoteRecord; charges: QuoteCharge[] }) {
  const { t } = useLanguage()
  const totals = useMemo(() => getChargeTotals(charges), [charges])
  const chargeFamilies = [
    { label: "Origin", count: 2, cost: 633.56, sell: 665, tone: "green" as StatusTone },
    { label: "Freight", count: 1, cost: -152.67, sell: 0, tone: "amber" as StatusTone },
    { label: "Destination", count: 5, cost: 832.07, sell: 866.3, tone: "blue" as StatusTone },
    { label: "Compliance", count: 1, cost: 0, sell: 35, tone: "green" as StatusTone },
  ]

  return (
    <div className="grid gap-[var(--md-page-stack-gap-compact)]">
      <div className="grid gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[0.9fr_1.1fr_1fr]">
        <CargoWiseGroup title="Pricing position">
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Cost" value={money(totals.cost)} />
            <CargoWiseField label="Revenue" value={money(totals.revenue)} />
            <CargoWiseField label="Profit" value={money(totals.profit)} />
            <CargoWiseField label="Margin" value={totals.margin} />
            <CargoWiseField label="Target sell" value={money(1800)} />
            <CargoWiseField label="Gap" value={money(1800 - totals.revenue)} />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="Pricing actions">
          <CargoWiseActionStrip actions={[
            { label: "Find client rates", icon: Search },
            { label: "Add charge", icon: Plus },
            { label: "Copy from quote", icon: Copy },
          ]} />
          <div className="mt-1 grid gap-1 md:grid-cols-2">
            <CargoWiseSelectField label="Rate mode" value="AI assisted" valueIcon={AiEditing} options={["Manual", "AI assisted", "Tariff", "Historic quote"]} />
            <CargoWiseSelectField label="Margin rule" value="15% minimum" options={["10% minimum", "15% minimum", "20% target", "Pass-through"]} />
            <CargoWiseSelectField label="FX source" value="Live rate" options={["Live rate", "Manual override", "Month-end rate"]} />
            <CargoWiseSelectField label="Approval" value="Required" options={["Not required", "Required", "Approved"]} />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="AI pricing read" icon={ChartAnalysis}>
          <div className="grid gap-1">
            <InsightRow icon={Gauge} title="Pitch guidance" detail="Current sell is inside this client's won band; keep freight cost visible before sending." tone="green" />
            <InsightRow icon={TriangleAlert} title="Exposure" detail="International freight is negative cost recovery. Confirm carrier rate or reason code." tone="amber" />
            <InsightRow icon={CheckCircle2} title="Opportunity" detail="Destination haulage can carry a small uplift without leaving historic win range." tone="blue" />
          </div>
        </CargoWiseGroup>
      </div>

      <div className="grid gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[0.82fr_1.18fr]">
        <CargoWiseGroup title="Charge families" className="flex flex-col" contentClassName="min-h-0 flex-1">
          <div className="grid h-full auto-rows-fr gap-2 sm:grid-cols-2">
            {chargeFamilies.map((family) => (
              <button key={family.label} type="button" className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-2.5 text-start shadow-[var(--md-shadow-line)] transition-[background,transform] duration-200 hover:-translate-y-px hover:bg-[var(--md-hover)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[var(--md-ink)]">{t(family.label)}</span>
                  <StatusPill tone={family.tone} className="h-5 px-2 text-[10px]">{family.count} {t("lines")}</StatusPill>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10.5px]">
                  <span><span className="block text-[var(--md-subtle)]">{t("Cost")}</span><span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{money(family.cost)}</span></span>
                  <span><span className="block text-[var(--md-subtle)]">{t("Sell")}</span><span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{money(family.sell)}</span></span>
                  <span><span className="block text-[var(--md-subtle)]">{t("Profit")}</span><span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{money(family.sell - family.cost)}</span></span>
                </div>
              </button>
            ))}
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="Charge cards" className="flex flex-col" contentClassName="min-h-0 flex-1">
          <div className="grid h-full auto-rows-fr gap-2 md:grid-cols-3">
            {charges.slice(0, 6).map((charge, index) => (
              <div key={`${charge.code}-${index}`} className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-2.5 shadow-[var(--md-shadow-line)]">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span data-i18n-skip dir="ltr" className="block text-[11px] font-semibold text-[var(--md-ink)]">{charge.code}</span>
                    <span className="block truncate text-[10.5px] text-[var(--md-text)]">{t(charge.description)}</span>
                  </span>
                  <Button type="button" variant="ghost" className="size-7 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-0 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" aria-label={t("Edit charge")}>
                    <MoreHorizontal className="size-3.5" strokeWidth={1.4} />
                  </Button>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10.5px]">
                  <span><span className="block text-[var(--md-subtle)]">{t("Cost")}</span><span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{money(charge.localCost)}</span></span>
                  <span><span className="block text-[var(--md-subtle)]">{t("Sell")}</span><span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{money(charge.localSell)}</span></span>
                  <span><span className="block text-[var(--md-subtle)]">{t("Profit")}</span><span data-i18n-skip dir="ltr" className="font-semibold text-[var(--md-ink)]">{money(charge.localSell - charge.localCost)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </CargoWiseGroup>
      </div>
    </div>
  )
}

function QuoteOverviewVariantSwitch({
  value,
  onChange,
}: {
  value: QuotePageVariant
  onChange: (value: QuotePageVariant) => void
}) {
  const { t } = useLanguage()
  const options: Array<{ value: QuotePageVariant; label: string }> = [
    { value: "operator", label: "Operator" },
    { value: "ai", label: "AI modern" },
    { value: "cargowise", label: "CargoWise" },
  ]

  return (
    <div className="flex items-center gap-1 rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] p-0.5 shadow-[var(--md-shadow-line)]">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 rounded-[var(--md-radius-xs)] px-2 text-[11px] text-[var(--md-text)]",
            value === option.value && "bg-[var(--md-surface-tint)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          )}
          onClick={() => onChange(option.value)}
        >
          {t(option.label)}
        </Button>
      ))}
    </div>
  )
}

function QuoteWorkspaceContext({
  activeTab,
  quote,
  editable,
  onJobRoeBaseChange,
  onAddJobRoe,
  onRemoveJobRoe,
  onJobRoeChange,
}: {
  activeTab: QuoteWorkspaceTab
  quote: QuoteRecord
  editable: boolean
  onJobRoeBaseChange: (currency: JobRoe["currency"], value: string) => void
  onAddJobRoe: () => void
  onRemoveJobRoe: (currency: JobRoe["currency"]) => void
  onJobRoeChange: (currency: JobRoe["currency"], field: "costRate" | "revenueRate", value: string) => void
}) {
  const { t } = useLanguage()
  const [selectedJobRoe, setSelectedJobRoe] = useState<JobRoe["currency"] | null>(null)
  const jobRoes = quote.jobRoes ?? []
  const jobRoeColumns = useMemo<DataTableColumn<JobRoe>[]>(() => [
    { id: "currency", label: "CCY", width: 72, minWidth: 58, kind: "attribute", canHide: false, cell: (roe) => <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{roe.currency}</span> },
    { id: "baseRate", label: "Base", width: 108, minWidth: 90, kind: "number", cell: (roe) => <EditableChargeCell value={roe.baseRate} editable={editable} numeric className="h-5 px-1 text-[9px]" onChange={(value) => onJobRoeBaseChange(roe.currency, value)} /> },
    { id: "costRate", label: "Cost", width: 108, minWidth: 90, kind: "number", cell: (roe) => <EditableChargeCell value={roe.costRate} editable={editable} numeric className="h-5 px-1 text-[9px]" onChange={(value) => onJobRoeChange(roe.currency, "costRate", value)} /> },
    { id: "revenueRate", label: "Revenue", width: 112, minWidth: 92, kind: "number", cell: (roe) => <EditableChargeCell value={roe.revenueRate} editable={editable} numeric className="h-5 px-1 text-[9px]" onChange={(value) => onJobRoeChange(roe.currency, "revenueRate", value)} /> },
  ], [editable, onJobRoeBaseChange, onJobRoeChange])

  if (activeTab === "charges") {
    return (
      <Surface padding="none" className="flex h-[82px] min-h-0 flex-col overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 bg-[var(--md-surface-tint)] px-2 shadow-[var(--md-shadow-line)]">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Job ROE")}</p>
            <p className="sr-only">{t("Shared exchange rates used by every charge line.")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={onAddJobRoe} disabled={!editable} className="h-6 rounded-[var(--md-radius-sm)] px-1.5 text-[9.5px] shadow-[var(--md-shadow-line)]"><Plus data-icon="inline-start" className="size-3" />{t("Add")}</Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => selectedJobRoe && onRemoveJobRoe(selectedJobRoe)} disabled={!editable || selectedJobRoe === null} className="h-6 rounded-[var(--md-radius-sm)] px-1.5 text-[9.5px] shadow-[var(--md-shadow-line)]"><Trash2 data-icon="inline-start" className="size-3" />{t("Remove")}</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto md-scrollbar">
          <DataTable ariaLabel="Job ROE" columns={jobRoeColumns} rows={jobRoes} getRowKey={(roe) => roe.currency} selectedRowKey={selectedJobRoe} onRowClick={(roe) => setSelectedJobRoe(roe.currency)} minimumWidth={400} showToolbar={false} showColumnManager={false} className="md-quote-job-roe-table rounded-none shadow-none" tableClassName="table-fixed text-[9px]" />
        </div>
      </Surface>
    )
  }

  const contextByTab: Record<Exclude<QuoteWorkspaceTab, "charges">, { items: Array<[string, string]> }> = {
    overview: {
      items: [["Customer", quote.customer], ["Route", `${formatLocation(quote.origin, "—")} → ${formatLocation(quote.destination, "—")}`], ["Margin", quote.margin], ["Status", quote.jobStatus ?? quote.status]],
    },
    details: {
      items: [["Customer ref", quote.localRef ?? "—"], ["Branch / Dept", [quote.branch, quote.department].filter(Boolean).join(" / ") || (quote.id === "NEW" ? "" : "— / —")], ["Sales rep", salesRepresentativeValue(quote.salesRep, true) || "Select"], ["Priority", quote.priority ?? "Standard"]],
    },
    documents: {
      items: [["Quote", quote.id], ["Customer", quote.customer], ["Document status", quote.docsStatus ?? "Draft"], ["Workflow", quote.workflow ?? "Review"]],
    },
    notes: {
      items: [["Quote", quote.id], ["Customer", quote.customer], ["Lifecycle", quote.workflowStatus ?? quote.status], ["Carries to", "Booking and Customs"]],
    },
    audit: {
      items: [["Quote", quote.id], ["Status", quote.workflowStatus ?? quote.status], ["Owner", salesRepresentativeValue(quote.salesRep)], ["Valid from", quote.startDate ?? "—"]],
    },
  }
  const context = contextByTab[activeTab]

  return (
    <Surface padding="none" className="h-full overflow-hidden rounded-[var(--md-radius-xl)]">
      <dl className="grid h-full grid-cols-2 grid-rows-2">
        {context.items.map(([label, value]) => (
          <div key={label} className="min-w-0 border-b border-[rgba(11,20,19,0.055)] px-3 py-1.5 odd:border-e">
            <dt className="text-[9.5px] font-medium text-[var(--md-subtle)]">{t(label)}</dt>
            <dd className="mt-0.5 truncate text-[11px] font-medium text-[var(--md-ink)]" title={value}>{t(value)}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  )
}

function quoteRecordFromRegister(quote: QuoteRegisterRecord): QuoteRecord {
  const isLost = ["declined", "ghosted", "lost"].includes(quote.status.toLowerCase())
  return {
    id: quote.reference,
    localRef: quote.reference,
    status: isLost ? "Lost" : "Open",
    statusTone: isLost ? "red" : "green",
    quoteType: quote.quoteType,
    source: quote.quoteSource,
    workflowStatus: quote.workflowStage,
    priority: quote.priority,
    customerPO: quote.customerPurchaseOrder,
    shipperReference: quote.shipperReference,
    docsStatus: quote.documentStatus,
    workflow: quote.workflowStage,
    createdAt: quote.createdAt,
    customer: quote.customer,
    route: `${quote.origin} to ${quote.destination}`,
    mode: quote.transportMode,
    container: quote.equipmentLoad,
    incoterm: quote.incoterms,
    incotermPlace: quote.incotermsPlace,
    origin: quote.origin,
    destination: quote.destination,
    via: quote.routingVia,
    startDate: "",
    endDate: "",
    estimatedDeparture: quote.estimatedDeparture,
    estimatedArrival: quote.estimatedArrival,
    validity: quote.validity,
    direction: quote.direction,
    serviceLevel: quote.serviceLevel,
    shipmentType: quote.shipmentType,
    carrier: quote.carrier,
    supplier: quote.supplier,
    salesRep: quote.salesOwner,
    opsRep: quote.operationsOwner,
    margin: quote.estimatedMargin === null ? "Pending" : `${quote.estimatedMargin.toFixed(2)}%`,
    profit: quote.estimatedProfit,
    cost: quote.estimatedCost,
    revenue: quote.sellValue,
    currency: quote.currency,
  }
}

function getInitialQuoteRecord(quoteId?: string) {
  const normalizedId = quoteId?.toUpperCase()
  if (normalizedId === "NEW") return newQuoteDraft
  if (!normalizedId || normalizedId === "3") return quoteQueue[0]
  const workspaceQuote = quoteQueue.find((quote) => quote.id.toUpperCase() === normalizedId)
  if (workspaceQuote) return workspaceQuote
  const registerQuote = quoteRegisterRecords.find((quote) => quote.reference.toUpperCase() === normalizedId)
  return registerQuote ? quoteRecordFromRegister(registerQuote) : quoteQueue[0]
}

function quoteLifecyclePresentation(lifecycle: string): { status: string; tone: StatusTone } {
  if (lifecycle === "declined" || lifecycle === "ghosted") return { status: "Lost", tone: "red" }
  if (lifecycle === "accepted") return { status: "Accepted", tone: "green" }
  if (lifecycle === "changes_requested") return { status: "Changes requested", tone: "amber" }
  return { status: "Open", tone: "green" }
}

function QuoteWorkspaceSkeleton() {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div
      className={cn("md-quote-skeleton", shouldReduceMotion && "md-quote-skeleton--still")}
      role="status"
      aria-label={t("Loading quote…")}
    >
      <div className="md-quote-skeleton__header md-quote-skeleton__block">
        <span className="md-quote-skeleton__line w-24" />
        <span className="md-quote-skeleton__line w-20" />
        <span className="md-quote-skeleton__line w-12" />
        <span className="md-quote-skeleton__spacer" />
        <span className="md-quote-skeleton__line w-24" />
        <span className="md-quote-skeleton__line w-36" />
        <span className="md-quote-skeleton__line w-16" />
      </div>
      <div className="md-quote-skeleton__tabs md-quote-skeleton__block">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="md-quote-skeleton__line" style={{ width: `${74 + index * 8}px`, animationDelay: `${index * 45}ms` }} />
        ))}
      </div>
      <div className="md-quote-skeleton__facts">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="md-quote-skeleton__block" style={{ animationDelay: `${100 + index * 45}ms` }} />
        ))}
      </div>
      <div className="md-quote-skeleton__signals">
        <span className="md-quote-skeleton__block" style={{ animationDelay: "220ms" }} />
        <span className="md-quote-skeleton__block md-quote-skeleton__block--dark" style={{ animationDelay: "265ms" }} />
      </div>
      <div className="md-quote-skeleton__panels">
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="md-quote-skeleton__block" style={{ animationDelay: `${310 + index * 45}ms` }} />
        ))}
      </div>
    </div>
  )
}

async function loadQuoteWorkspace(reference: string) {
  try {
    return await getQuoteWorkflow(reference)
  } catch {
    // A tenant Edge Function can briefly miss its first request after going
    // idle. The lightweight preview is already visible while this one quiet,
    // read-only retry restores the full editable workspace.
    await new Promise((resolve) => window.setTimeout(resolve, 180))
    return getQuoteWorkflow(reference, { fresh: true })
  }
}

function quoteRecordFromWorkspace(workspace: QuoteWorkflowWorkspace, lookups: QuoteWorkflowSources | null): QuoteRecord {
  const record = workspace.quote
  const facts = record.shipmentFacts ?? {}
  const fact = (key: string) => typeof facts[key] === "string" ? String(facts[key]) : ""
  const estimatedDeparture = fact("estimatedDeparture")
  const estimatedArrival = fact("estimatedArrival")
  const customer = lookups?.organisations.find((option) => option.id === record.customerId)
  const payer = record.payer ?? {
    orgId: record.customerId,
    name: record.customerName,
    address: fact("customerAddress"),
    contact: record.contactName,
    email: record.contactEmail,
    code: fact("clientCode"),
  }
  const payerOrganisation = lookups?.organisations.find((option) => option.id === payer.orgId) ?? customer
  const payerTerms = payerOrganisation?.quoteTerms
  const hasPayerTerms = Boolean(payerTerms && [payerTerms.terms, payerTerms.subjectTo, payerTerms.notes, payerTerms.deadline].some((value) => value?.trim()))
  const contact = customer?.contacts.find((option) => option.id === record.contactId)
  const payerContact = payerOrganisation?.contacts.find((option) => option.name === payer.contact)
  const shipperOrganisation = lookups?.organisations.find((option) => option.id === record.shipper?.orgId)
  const office = lookups?.offices.find((option) => option.id === record.officeId)
  const department = lookups?.departments.find((option) => option.id === record.departmentId)
  const salesOwner = lookups?.users.find((option) => option.id === record.salesOwnerId)
  const mode = lookups?.modes.find((option) => option.code === record.mode)
  const shipmentType = lookups?.shipmentTypes.find((option) => option.code === record.shipmentType)
  const presentation = quoteLifecyclePresentation(record.lifecycle)
  return {
    ...newQuoteDraft,
    id: record.reference,
    status: presentation.status,
    statusTone: presentation.tone,
    localRef: record.customerReference?.trim() || record.reference.trim(),
    quoteType: fact("quoteType"),
    source: fact("source"),
    workflowStatus: fact("workflowStatus") || presentation.status,
    priority: fact("priority"),
    holdReason: fact("holdReason"),
    customerPO: fact("customerPO"),
    shipperReference: fact("shipperReference"),
    consigneeReference: fact("consigneeReference"),
    agentReference: fact("agentReference"),
    carrierReference: fact("carrierReference"),
    docsStatus: fact("docsStatus"),
    workflow: fact("workflow") || presentation.status,
    revisionReason: fact("revisionReason"),
    copiedFromQuoteId: fact("copiedFromQuoteId"),
    copiedFromQuoteReference: fact("copiedFromQuoteReference"),
    copyReason: fact("copyReason") === "repeat_quote" ? "repeat_quote" : fact("copyReason") === "customer_changed" ? "customer_changed" : undefined,
    customer: record.customerName,
    customerId: record.customerId,
    clientCode: customer?.code ?? fact("clientCode"),
    customerAddress: customer?.addresses[0]?.address ?? fact("customerAddress"),
    contactId: record.contactId ?? "",
    customerContact: record.contactName ?? contact?.name ?? "",
    customerEmail: record.contactEmail ?? contact?.email ?? "",
    payerOrgId: payer.orgId ? String(payer.orgId) : record.customerId,
    payerCode: payer.code || payerOrganisation?.code || fact("payerCode") || fact("clientCode"),
    payerName: payer.name || record.customerName,
    payerAddress: payer.address ?? payerOrganisation?.addresses[0]?.address ?? fact("customerAddress"),
    payerContact: payer.contact ?? payerContact?.name ?? record.contactName ?? "",
    payerEmail: payer.email || payerContact?.email || fact("payerEmail") || record.contactEmail || "",
    shipperOrgId: record.shipper?.orgId ? String(record.shipper.orgId) : "",
    shipperCode: fact("shipperCode"),
    shipperName: record.shipper?.name ?? "",
    shipperAddress: record.shipper?.address ?? "",
    shipperContact: record.shipper?.contact ?? "",
    shipperEmail: fact("shipperEmail") || shipperOrganisation?.contacts[0]?.email || "",
    shipperAddressOverride: fact("shipperAddressOverride"),
    collectionAddress: record.collectionAddress ?? "",
    consigneeOrgId: record.consignee?.orgId ? String(record.consignee.orgId) : "",
    consigneeCode: fact("consigneeCode"),
    consigneeName: record.consignee?.name ?? "",
    consigneeAddress: record.consignee?.address ?? "",
    consigneeContact: fact("consigneeContact"),
    consigneeEmail: fact("consigneeEmail"),
    consigneeAddressOverride: fact("consigneeAddressOverride"),
    deliveryAddress: record.deliveryAddress ?? "",
    agentOrgId: fact("agentOrgId"),
    agentCode: fact("agentCode"),
    agentName: fact("agentName"),
    agentAddress: fact("agentAddress"),
    agentContact: fact("agentContact"),
    agentEmail: fact("agentEmail"),
    route: [record.loadingPoint, record.dischargePoint].filter(Boolean).join(" to "),
    mode: mode?.name ?? record.mode ?? "",
    container: fact("container"),
    containerRequestsJson: Array.isArray(facts.containerRequests) ? JSON.stringify(facts.containerRequests) : "",
    incoterm: record.incoterm ?? "",
    incotermPlace: fact("namedPlace"),
    origin: record.loadingPoint ?? "",
    originCountry: fact("originCountry"),
    originTown: fact("originTown"),
    originUnlocode: fact("originUnlocode"),
    destination: record.dischargePoint ?? "",
    destinationCountry: fact("destinationCountry"),
    destinationTown: fact("destinationTown"),
    destinationUnlocode: fact("destinationUnlocode"),
    via: fact("routingVia"),
    routingLegsJson: Array.isArray(facts.routingLegs) ? JSON.stringify(facts.routingLegs) : "",
    startDate: record.validFrom ?? "",
    endDate: record.validTo ?? "",
    estimatedDeparture,
    estimatedArrival,
    deadline: record.deadline?.trim() || payerTerms?.deadline?.trim() || "",
    validity: record.validTo ?? "",
    direction: record.direction ? record.direction.charAt(0).toUpperCase() + record.direction.slice(1) : "",
    serviceLevel: record.serviceLevel ?? "",
    rateSource: record.rateSourceLabel ?? record.rateSourceType ?? "",
    hblMode: fact("hblMode"),
    transitDays: quoteTransitDays(estimatedDeparture, estimatedArrival) || fact("transitDays"),
    transitUnit: estimatedDeparture && estimatedArrival ? "Days" : fact("transitUnit") || "Days",
    frequency: fact("frequency"),
    frequencyInterval: fact("frequencyInterval") || "1",
    frequencyUnit: fact("frequencyUnit") || "Weeks",
    frequencyTimesPerMonth: fact("frequencyTimesPerMonth") || "1",
    frequencyCount: fact("frequencyCount"),
    frequencyNotes: fact("frequencyNotes"),
    shipmentType: shipmentType ? `${shipmentType.code} - ${shipmentType.name}` : record.shipmentType ?? "",
    carrier: record.carrierName ?? "",
    carrierId: record.carrierId ? String(record.carrierId) : "",
    carrierOffice: fact("carrierOffice"),
    supplier: record.supplierName ?? "",
    supplierId: record.supplierId ? String(record.supplierId) : "",
    supplierOffice: fact("supplierOffice"),
    supplierOptionsJson: fact("supplierOptionsJson"),
    branch: office?.code || office?.name || fact("branch"),
    officeId: record.officeId ? String(record.officeId) : "",
    department: department?.name ?? fact("department"),
    departmentId: record.departmentId ? String(record.departmentId) : "",
    salesRep: salesOwner?.name ?? fact("salesRep"),
    salesOwnerId: record.salesOwnerId ? String(record.salesOwnerId) : "",
    opsRep: fact("opsRep"),
    jobStatus: presentation.status,
    goodsValue: fact("goodsValue"),
    goodsValueCurrency: fact("goodsValueCurrency") || record.currency || "GBP",
    insuranceValue: fact("insuranceValue"),
    insuranceValueCurrency: fact("insuranceValueCurrency") || record.currency || "GBP",
    entries: fact("entries"),
    invoiceLines: fact("invoiceLines"),
    commodity: fact("commodity"),
    co2e: fact("co2e"),
    knownCargo: fact("knownCargo"),
    cargoCharacteristics: fact("cargoCharacteristics") || fact("knownCargo") || "General cargo",
    hazardousUnNumber: fact("hazardousUnNumber"),
    hazardousClass: fact("hazardousClass"),
    hazardousPackingGroup: fact("hazardousPackingGroup"),
    hazardousShippingName: fact("hazardousShippingName"),
    hazardousEmergencyContact: fact("hazardousEmergencyContact"),
    hazardousNetWeightKg: fact("hazardousNetWeightKg"),
    hazardousMarinePollutant: fact("hazardousMarinePollutant") || "No",
    hazardousLimitedQuantity: fact("hazardousLimitedQuantity") || "No",
    hazardousNotes: fact("hazardousNotes"),
    packageQuantity: fact("packageQuantity"),
    packageType: fact("packageType"),
    grossWeightKg: fact("grossWeightKg"),
    volumeCbm: fact("volumeCbm"),
    chargeableWeightKg: fact("chargeableWeightKg"),
    collectionRequired: fact("collectionRequired"),
    deliveryRequired: fact("deliveryRequired"),
    customsIncluded: fact("customsIncluded"),
    originCustomsAgentId: fact("originCustomsAgentId"),
    originCustomsAgentName: fact("originCustomsAgentName"),
    destinationCustomsAgentId: fact("destinationCustomsAgentId"),
    destinationCustomsAgentName: fact("destinationCustomsAgentName"),
    subjectToTerms: fact("subjectToTerms") || payerTerms?.subjectTo?.trim() || "",
    customerTermsSource: hasPayerTerms ? payerOrganisation?.name ?? payer.name : fact("customerTermsSource"),
    terms: record.terms?.trim() || payerTerms?.terms?.trim() || "",
    customerNotes: record.customerNotes?.trim() || payerTerms?.notes?.trim() || "",
    internalNotes: record.internalNotes ?? "",
    fmcTid: fact("fmcTid"),
    margin: workspace.totals.marginPct === null ? "" : `${workspace.totals.marginPct.toFixed(2)}%`,
    profit: workspace.totals.profit,
    cost: workspace.totals.cost,
    revenue: workspace.totals.sell,
    currency: (record.currency || "") as QuoteCurrency | "",
    jobRoes: Array.isArray(facts.jobRoes) ? facts.jobRoes as JobRoe[] : [],
  }
}

function quoteChargesFromWorkspace(workspace: QuoteWorkflowWorkspace): QuoteCharge[] {
  return workspace.charges.map((line) => ({
    id: line.id,
    code: "",
    description: line.description,
    creditor: line.sourceLabel || "",
    supplierId: line.supplierId,
    costCurrency: (line.costCurrency || "GBP") as QuoteCurrency,
    costAmount: line.costAmount,
    localCost: line.costLocal,
    sellCurrency: (line.sellCurrency || "GBP") as QuoteCurrency,
    sellAmount: line.sellAmount,
    localSell: line.sellLocal,
    costExchange: line.costRoe,
    sellExchange: line.sellRoe,
    costRoeSource: "job",
    sellRoeSource: "job",
    calculationBasis: line.calculationBasis,
    quantity: line.quantity,
    department: "",
    internalNotes: line.internalNotes ?? "",
    additionalDetail: line.customerNotes ?? "",
  }))
}

function quoteWorkspaceFromVersion(
  workspace: QuoteWorkflowWorkspace,
  version: QuoteWorkflowVersion,
): QuoteWorkflowWorkspace | null {
  const payload = version.CusQuoteVersion_SnapshotJSON?.quote
  if (!payload) return null
  const { charges, ...quotePayload } = payload
  const historicalCharges = Array.isArray(charges) ? charges : []
  const totals = historicalCharges.reduce((result, line) => ({
    cost: result.cost + Number(line.costLocal || 0),
    sell: result.sell + Number(line.sellLocal || 0),
  }), { cost: 0, sell: 0 })
  return {
    ...workspace,
    quote: {
      ...workspace.quote,
      ...quotePayload,
      id: workspace.quote.id,
      reference: workspace.quote.reference,
      lifecycle: version.CusQuoteVersion_StatusCode,
      customerId: quotePayload.customerId || workspace.quote.customerId,
      acceptedVersionId: workspace.quote.acceptedVersionId,
      outcomeNotes: workspace.quote.outcomeNotes,
    },
    charges: historicalCharges,
    totals: {
      ...totals,
      profit: totals.sell - totals.cost,
      marginPct: totals.sell ? ((totals.sell - totals.cost) / totals.sell) * 100 : null,
    },
  }
}

function blankQuoteRevision(source: QuoteRecord): QuoteRecord {
  return {
    ...newQuoteDraft,
    id: source.id,
    localRef: source.localRef,
    customer: source.customer,
    customerId: source.customerId,
    clientCode: source.clientCode,
    customerAddress: source.customerAddress,
    customerContact: source.customerContact,
    customerEmail: source.customerEmail,
    payerOrgId: source.payerOrgId,
    payerCode: source.payerCode,
    payerName: source.payerName,
    payerAddress: source.payerAddress,
    payerContact: source.payerContact,
    payerEmail: source.payerEmail,
    branch: source.branch,
    officeId: source.officeId,
    department: source.department,
    departmentId: source.departmentId,
    salesRep: source.salesRep,
    salesOwnerId: source.salesOwnerId,
    currency: source.currency,
    terms: source.terms,
    subjectToTerms: source.subjectToTerms,
    customerTermsSource: source.customerTermsSource,
    status: "Open",
    statusTone: "green",
  }
}

function newCustomerMasterQuote(
  source: QuoteRecord,
  customerPatch: Partial<QuoteRecord>,
  sourceQuoteId: string,
  sourceReference: string,
): QuoteRecord {
  return {
    ...source,
    ...customerPatch,
    id: "NEW",
    status: "Open",
    statusTone: "green",
    source: "NEW - New Shipper",
    workflowStatus: "WRK - Working",
    workflow: "Review",
    docsStatus: "Draft",
    localRef: "",
    customerPO: "",
    rateSource: "",
    margin: "0.00%",
    profit: 0,
    cost: 0,
    revenue: 0,
    customerNotes: customerPatch.customerNotes ?? "",
    internalNotes: "",
    revisionReason: `Built from ${sourceReference} for a different customer.`,
    copiedFromQuoteId: sourceQuoteId,
    copiedFromQuoteReference: sourceReference,
    copyReason: "customer_changed",
    createdAt: undefined,
  }
}

function newRepeatMasterQuote(
  source: QuoteRecord,
  sourceQuoteId: string,
  sourceReference: string,
): QuoteRecord {
  const routingLegs = quoteRoutingLegs(source.routingLegsJson).map((leg) => ({
    ...leg,
    estimatedDeparture: "",
    estimatedArrival: "",
  }))
  const supplierOptions = supplierOptionsFromQuote(source).map((supplier) => ({
    ...supplier,
    carriers: supplier.carriers.map((carrier) => ({
      ...carrier,
      reference: "",
      rateSource: "Manual",
      status: "draft" as const,
    })),
  }))

  return {
    ...source,
    id: "NEW",
    status: "Open",
    statusTone: "green",
    source: "REP - Repeat lane",
    workflowStatus: "WRK - Working",
    workflow: "Review",
    docsStatus: "Draft",
    localRef: "",
    customerPO: "",
    carrierReference: "",
    startDate: "",
    endDate: "",
    estimatedDeparture: "",
    estimatedArrival: "",
    deadline: "",
    routingLegsJson: quoteRoutingLegsValue(routingLegs),
    supplierOptionsJson: JSON.stringify(supplierOptions),
    rateSource: "",
    margin: "0.00%",
    profit: 0,
    cost: 0,
    revenue: 0,
    internalNotes: "",
    revisionReason: `Repeat quote built from ${sourceReference}.`,
    copiedFromQuoteId: sourceQuoteId,
    copiedFromQuoteReference: sourceReference,
    copyReason: "repeat_quote",
    createdAt: undefined,
  }
}

function compactQuoteFacts(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => {
    if (value === null || value === undefined) return false
    if (typeof value === "string") return Boolean(value.trim())
    if (Array.isArray(value)) return value.length > 0
    return true
  }))
}

function quoteDirectionForSave(quote: QuoteRecord) {
  const supported = new Set(["import", "export", "domestic", "cross trade", "cross_trade"])
  return [quote.direction, quote.quoteType]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .find((value) => supported.has(value)) ?? quote.direction ?? ""
}

function calculatedDirectionForQuote(quote: QuoteRecord, lookups: QuoteWorkflowSources | null | undefined) {
  const office = lookups?.offices.find((option) => option.id === quote.officeId)
    ?? lookups?.offices.find((option) => (option.code || option.name) === quote.branch)
  return calculateQuoteFreightDirection({
    operatingCountryCode: office?.countryCode,
    originCountry: quote.originCountry,
    originUnlocode: quote.originUnlocode || quote.origin,
    destinationCountry: quote.destinationCountry,
    destinationUnlocode: quote.destinationUnlocode || quote.destination,
    countries: lookups?.countries,
  })
}

const quoteUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuidOrNull(value?: string | null) {
  return value && quoteUuidPattern.test(value) ? value : null
}

function quoteSavePayload(quote: QuoteRecord, charges: QuoteCharge[], lookups: QuoteWorkflowSources | null): QuoteSavePayload {
  const mode = lookups?.modes.find((option) => option.name === quote.mode)?.code ?? quote.mode
  const shipmentTypeLabel = quote.shipmentType?.split(" - ", 1)[0] ?? ""
  const shipmentType = lookups?.shipmentTypes.find((option) => option.code === shipmentTypeLabel || option.name === quote.shipmentType)?.code ?? shipmentTypeLabel
  const mappedCharges: QuoteWorkflowCharge[] = charges.map((line) => ({
    id: line.id ?? crypto.randomUUID(),
    description: line.description || line.code,
    // The compact charge workspace includes display-only party IDs for its
    // demo/current-party options. Only real organisation UUIDs can be sent
    // to the quote workflow database function.
    supplierId: uuidOrNull(line.supplierId),
    costCurrency: line.costCurrency,
    costAmount: line.costAmount,
    costLocal: line.localCost,
    costRoe: line.costExchange,
    sellCurrency: line.sellCurrency,
    sellAmount: line.sellAmount,
    sellLocal: line.localSell,
    sellRoe: line.sellExchange,
    calculationBasis: line.calculationBasis ?? "fixed",
    quantity: line.quantity ?? 1,
    sourceLabel: line.creditor,
    internalNotes: line.internalNotes,
    customerNotes: line.additionalDetail,
    showToCustomer: true,
  }))
  return {
    sourceType: "account",
    sourceId: quote.customerId ?? "",
    customerId: quote.customerId ?? "",
    customerName: quote.customer,
    contactId: quote.contactId ?? "",
    contactName: quote.customerContact ?? "",
    contactEmail: quote.customerEmail ?? "",
    customerReference: quote.localRef ?? "",
    officeId: quote.officeId ?? "",
    departmentId: quote.departmentId ?? "",
    salesOwnerId: quote.salesOwnerId ?? "",
    direction: calculatedDirectionForQuote(quote, lookups) ?? quoteDirectionForSave(quote),
    mode,
    shipmentType,
    serviceLevel: quote.serviceLevel ?? "",
    currency: quote.currency,
    collectionAddress: quote.collectionAddress ?? "",
    loadingPoint: quote.origin,
    dischargePoint: quote.destination,
    deliveryAddress: quote.deliveryAddress ?? "",
    incoterm: quote.incoterm,
    validFrom: quote.startDate ?? "",
    validTo: quote.endDate ?? "",
    deadline: quote.deadline ?? "",
    supplierId: quote.supplierId ?? "",
    supplierName: quote.supplier ?? "",
    carrierId: quote.carrierId ?? "",
    carrierName: quote.carrier ?? "",
    shipmentFacts: compactQuoteFacts({
      quoteType: quote.quoteType,
      source: quote.source,
      workflowStatus: quote.workflowStatus,
      priority: quote.priority,
      holdReason: quote.holdReason,
      customerPO: quote.customerPO,
      shipperReference: quote.shipperReference,
      consigneeReference: quote.consigneeReference,
      agentReference: quote.agentReference,
      carrierReference: quote.carrierReference,
      docsStatus: quote.docsStatus,
      workflow: quote.workflow,
      revisionReason: quote.revisionReason,
      copiedFromQuoteId: quote.copiedFromQuoteId,
      copiedFromQuoteReference: quote.copiedFromQuoteReference,
      copyReason: quote.copyReason,
      clientCode: quote.clientCode,
      customerAddress: quote.customerAddress,
      payerCode: quote.payerCode,
      payerEmail: quote.payerEmail,
      shipperCode: quote.shipperCode,
      shipperEmail: quote.shipperEmail,
      shipperAddressOverride: quote.shipperAddressOverride === "Yes" ? "Yes" : "",
      consigneeCode: quote.consigneeCode,
      consigneeContact: quote.consigneeContact,
      consigneeEmail: quote.consigneeEmail,
      consigneeAddressOverride: quote.consigneeAddressOverride === "Yes" ? "Yes" : "",
      agentOrgId: quote.agentOrgId,
      agentCode: quote.agentCode,
      agentName: quote.agentName,
      agentAddress: quote.agentAddress,
      agentContact: quote.agentContact,
      agentEmail: quote.agentEmail,
      namedPlace: quote.incotermPlace,
      originCountry: quote.originCountry,
      originTown: quote.originTown,
      originUnlocode: quote.originUnlocode,
      destinationCountry: quote.destinationCountry,
      destinationTown: quote.destinationTown,
      destinationUnlocode: quote.destinationUnlocode,
      routingVia: quote.via,
      routingLegs: quoteRoutingLegs(quote.routingLegsJson),
      estimatedDeparture: quote.estimatedDeparture,
      estimatedArrival: quote.estimatedArrival,
      hblMode: quote.hblMode,
      transitDays: quote.transitDays,
      transitUnit: quote.transitUnit,
      frequency: quote.frequency,
      frequencyInterval: quote.frequencyInterval,
      frequencyUnit: quote.frequencyUnit,
      frequencyTimesPerMonth: quote.frequencyTimesPerMonth,
      frequencyCount: quote.frequencyCount,
      frequencyNotes: quote.frequencyNotes,
      container: quote.container,
      containerRequests: quoteContainerRequests(quote.containerRequestsJson, quote.container)
        .filter((request) => request.quantity || request.type.trim())
        .map((request) => ({ id: request.id, quantity: Number(request.quantity) || null, type: request.type.trim() })),
      carrierOffice: quote.carrierOffice,
      supplierOffice: quote.supplierOffice,
      supplierOptionsJson: quote.supplierOptionsJson,
      branch: quote.branch,
      department: quote.department,
      salesRep: quote.salesRep,
      opsRep: quote.opsRep,
      goodsValue: quote.goodsValue,
      goodsValueCurrency: quote.goodsValueCurrency,
      insuranceValue: quote.insuranceValue,
      insuranceValueCurrency: quote.insuranceValueCurrency,
      entries: quote.entries,
      invoiceLines: quote.invoiceLines,
      commodity: quote.commodity,
      co2e: quote.co2e,
      knownCargo: quote.knownCargo,
      cargoCharacteristics: quote.cargoCharacteristics,
      hazardousUnNumber: quote.hazardousUnNumber,
      hazardousClass: quote.hazardousClass,
      hazardousPackingGroup: quote.hazardousPackingGroup,
      hazardousShippingName: quote.hazardousShippingName,
      hazardousEmergencyContact: quote.hazardousEmergencyContact,
      hazardousNetWeightKg: quote.hazardousNetWeightKg,
      hazardousMarinePollutant: quote.hazardousMarinePollutant,
      hazardousLimitedQuantity: quote.hazardousLimitedQuantity,
      hazardousNotes: quote.hazardousNotes,
      packageQuantity: quote.packageQuantity,
      packageType: quote.packageType,
      grossWeightKg: quote.grossWeightKg,
      volumeCbm: quote.volumeCbm,
      chargeableWeightKg: quote.chargeableWeightKg,
      collectionRequired: quote.collectionRequired,
      deliveryRequired: quote.deliveryRequired,
      customsIncluded: quote.customsIncluded,
      originCustomsAgentId: quote.originCustomsAgentId,
      originCustomsAgentName: quote.originCustomsAgentName,
      destinationCustomsAgentId: quote.destinationCustomsAgentId,
      destinationCustomsAgentName: quote.destinationCustomsAgentName,
      subjectToTerms: quote.subjectToTerms,
      customerTermsSource: quote.customerTermsSource,
      fmcTid: quote.fmcTid,
      jobRoes: quote.jobRoes,
    }),
    customerNotes: quote.customerNotes ?? "",
    internalNotes: quote.internalNotes ?? "",
    terms: quote.terms ?? "",
    rateSourceType: quote.rateSource ?? "",
    rateSourceLabel: quote.rateSource ?? "",
    defaultMarkupPct: 15,
    markupOverrideReason: "",
    followUpAt: "",
    payer: {
      orgId: quote.payerOrgId || quote.customerId || "",
      name: quote.payerName || quote.customer,
      address: quote.payerAddress || quote.customerAddress || "",
      contact: quote.payerContact || quote.customerContact || "",
      email: quote.payerEmail || quote.customerEmail || "",
      code: quote.payerCode || quote.clientCode || "",
    },
    shipper: {
      orgId: quote.shipperOrgId ?? "",
      name: quote.shipperName ?? "",
      address: quote.shipperAddress ?? "",
      contact: quote.shipperContact ?? "",
    },
    consignee: {
      orgId: quote.consigneeOrgId ?? "",
      name: quote.consigneeName ?? "",
      address: quote.consigneeAddress ?? "",
      contact: "",
    },
    charges: mappedCharges,
  }
}

function quoteAuditRecords(workspace: QuoteWorkflowWorkspace | null): QuoteAuditRecord[] {
  if (!workspace) return []
  return workspace.events.map((event) => {
    const actor = event.cmp_Users
    const actorName = [actor?.User_Firstname, actor?.User_Lastname].filter(Boolean).join(" ") || "Multideck"
    const declineReason = quoteCustomerDeclineReasons.find((reason) => reason.code === event.CusQuoteEvent_MetadataJSON?.declineReasonCode)?.label
    const eventType = event.CusQuoteEvent_TypeCode === "calculated"
      ? "pricing"
      : event.CusQuoteEvent_TypeCode === "sent"
        ? "communication"
        : ["accepted", "declined", "ghosted", "customer_accepted", "customer_declined", "customer_challenged"].includes(event.CusQuoteEvent_TypeCode)
          ? "approval"
          : "record"
    return {
      id: event.CusQuoteEvent_ID,
      timestamp: event.CusQuoteEvent_OccurredAt,
      actor: actorName,
      action: event.CusQuoteEvent_Summary,
      detail: event.CusQuoteEvent_MetadataJSON?.message || (declineReason ? `Main reason: ${declineReason}` : event.CusQuoteEvent_Summary),
      eventType,
      field: "Quote",
      oldValue: "",
      newValue: event.CusQuoteEvent_TypeCode,
      source: "Quote workspace",
      state: "completed",
    }
  })
}

function formatDocumentSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return undefined
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function quoteCustomerResponseDocuments(workspace: QuoteWorkflowWorkspace | null) {
  if (!workspace) return []
  const submittedDocuments = (workspace.documents ?? []).map((document) => {
    const versionLabel = document.versionNumber > 1 ? `V${document.versionNumber}` : "Original quote"
    return {
      id: document.id,
      fileName: document.fileName,
      description: `${versionLabel} sent to ${document.recipientEmail}.`,
      documentType: "Customer quotation",
      uploadedAt: document.createdAt,
      lastModifiedAt: document.createdAt,
      source: "quote" as const,
      relationship: { label: `Quote ${workspace.quote.reference}`, reference: workspace.quote.reference },
      preview: {
        kind: "pdf" as const,
        mimeType: document.mimeType,
        fileSize: formatDocumentSize(document.fileSizeBytes),
        url: document.url || undefined,
        reference: document.versionNumber > 1 ? `${workspace.quote.reference} · V${document.versionNumber}` : workspace.quote.reference,
        accent: "teal" as const,
      },
    }
  })
  const response = workspace?.customerResponse
  const attachment = response?.attachment
  if (!response || !attachment) return submittedDocuments
  return [...submittedDocuments, {
    id: attachment.id,
    fileName: attachment.fileName,
    description: "Attachment supplied with the customer's quote change request.",
    documentType: "Customer quote response",
    uploadedAt: attachment.createdAt,
    lastModifiedAt: attachment.createdAt,
    source: "customer" as const,
    relationship: { label: `Quote ${workspace.quote.reference}`, reference: workspace.quote.reference },
    preview: {
      kind: attachment.mimeType.startsWith("image/") ? "image" as const : "pdf" as const,
      mimeType: attachment.mimeType,
      fileSize: formatDocumentSize(attachment.fileSizeBytes),
      url: attachment.url || undefined,
      reference: workspace.quote.reference,
      accent: "amber" as const,
    },
  }]
}

function QuoteCustomerResponseTooltip({ response }: { response: NonNullable<QuoteWorkflowWorkspace["customerResponse"]> }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const accepted = response.decision === "accepted"
  const declined = response.decision === "declined"
  const title = accepted ? "Customer accepted the quote" : declined ? "Customer declined the quote" : "Customer asked for changes"
  const declineReason = quoteCustomerDeclineReasons.find((reason) => reason.code === response.declineReasonCode)?.label
  const meta = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(response.respondedAt))
  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t(title)}
          aria-expanded={open}
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => setOpen(true)}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] transition-[background,color,transform] duration-150 hover:bg-[var(--md-field-bg-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
            accepted && "text-[var(--md-status-green-ink)]",
            declined && "text-[var(--md-red)]",
            !accepted && !declined && "text-[var(--md-amber)]",
          )}
        >
          <MessageSquareText className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={6}
        style={{ borderTop: "2px solid var(--md-accent)" }}
        className="block w-[min(320px,calc(100vw-24px))] max-w-none rounded-[var(--md-radius-lg)] bg-[var(--md-sidebar-bg)] p-3 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none [&>svg:last-child]:hidden"
      >
        <p className="text-[12px] font-medium leading-5">{t(title)}</p>
        <time dateTime={response.respondedAt} className="mt-0.5 block text-[10.5px] leading-4 text-[var(--md-subtle)] tabular-nums">{meta}</time>
        {declineReason ? <p className="mt-2 text-[12px] leading-[1.55] text-[var(--md-text)]"><span className="font-medium">{t("Main reason")}: </span>{t(declineReason)}</p> : null}
        {response.message ? <p className="mt-2 whitespace-pre-wrap break-words text-pretty text-[12px] leading-[1.55] text-[var(--md-text)]" data-i18n-skip dir="auto">{response.message}</p> : null}
        {response.attachment ? <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--md-subtle)]"><FileText className="size-3.5" strokeWidth={1.5} aria-hidden="true" />{t("Customer attachment available in Documents")}</p> : null}
      </TooltipContent>
    </Tooltip>
  )
}

function shouldShowQuoteCustomerResponse(response: QuoteWorkflowWorkspace["customerResponse"]) {
  if (!response) return false
  if (response.decision !== "accepted") return true
  return Boolean(response.message?.trim() || response.attachment)
}

export function QuoteDetailPage({
  variant = "operator",
  quoteId,
  navigate,
  currentUser,
}: {
  variant?: QuotePageVariant
  quoteId?: string
  navigate?: (path: string) => void
  currentUser?: AuthUserSummary | null
}) {
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const initialQuote = getInitialQuoteRecord(quoteId)
  const isNewQuote = quoteId?.toUpperCase() === "NEW"
  const initialCharges = isNewQuote ? [] : quoteCharges
  const [activeTab, setActiveTab] = useState<QuoteWorkspaceTab>(() => initialQuoteWorkspaceTab(quoteId, isNewQuote))
  const [tabTravelDirection, setTabTravelDirection] = useState(1)
  const [savedQuote, setSavedQuote] = useState<QuoteRecord>(initialQuote)
  const [draftQuote, setDraftQuote] = useState<QuoteRecord>(initialQuote)
  const [currentUserProfilePhotoUrl, setCurrentUserProfilePhotoUrl] = useState<string | null>(currentUser?.profilePhotoUrl ?? null)
  const [salesUserPhotoUrls, setSalesUserPhotoUrls] = useState<Map<string, string>>(() => new Map())
  const [quoteEditors, setQuoteEditors] = useState<QuoteEditorPresence[]>([])
  const [savedCharges, setSavedCharges] = useState<QuoteCharge[]>(initialCharges)
  const [draftCharges, setDraftCharges] = useState<QuoteCharge[]>(initialCharges)
  const [quoteRefCopied, setQuoteRefCopied] = useState(false)
  const [saveFeedbackVisible, setSaveFeedbackVisible] = useState(false)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [issueReadiness, setIssueReadiness] = useState<QuoteIssueReadiness | null>(null)
  const [issueReadinessLoading, setIssueReadinessLoading] = useState(false)
  const [issueRecipients, setIssueRecipients] = useState<QuoteIssueRecipient[]>([])
  const [issueMailboxes, setIssueMailboxes] = useState<Mailbox[]>([])
  const [issueMailboxId, setIssueMailboxId] = useState("")
  const [issueRecipientEmail, setIssueRecipientEmail] = useState("")
  const [issueRecipientSuggestionsOpen, setIssueRecipientSuggestionsOpen] = useState(false)
  const [issueDeliveryMode, setIssueDeliveryMode] = useState<QuoteDeliveryMode>("standard")
  const [issueExpiryPreset, setIssueExpiryPreset] = useState<QuoteIssueExpiryPreset>("14")
  const [issueEmailSubject, setIssueEmailSubject] = useState("")
  const [issueEmailBody, setIssueEmailBody] = useState("")
  const [issueEmailPreviewHtml, setIssueEmailPreviewHtml] = useState("")
  const [issueDraftLoading, setIssueDraftLoading] = useState(false)
  const [issuePreviewLoading, setIssuePreviewLoading] = useState(false)
  const [issueEmailError, setIssueEmailError] = useState("")
  const [issueRefinementOpen, setIssueRefinementOpen] = useState(false)
  const [issueRefinementInstruction, setIssueRefinementInstruction] = useState("")
  const [issueRefinementSelection, setIssueRefinementSelection] = useState<TextareaSelection | null>(null)
  const [issueBodySelection, setIssueBodySelection] = useState<TextareaSelection | null>(null)
  const [issueSelectionAnchor, setIssueSelectionAnchor] = useState<TextareaSelectionAnchor | null>(null)
  const [issueRefining, setIssueRefining] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issueDeliveryState, setIssueDeliveryState] = useState<"idle" | "sent">("idle")
  const [issueNotice, setIssueNotice] = useState("")
  const [winDialogOpen, setWinDialogOpen] = useState(false)
  const [lossDialogOpen, setLossDialogOpen] = useState(false)
  const [lossReason, setLossReason] = useState("")
  const [lossDetails, setLossDetails] = useState("")
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null)
  const [newVersionDialogOpen, setNewVersionDialogOpen] = useState(false)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [pendingCustomerChange, setPendingCustomerChange] = useState<PendingCustomerOrganisationChange | null>(null)
  const [creatingCustomerQuote, setCreatingCustomerQuote] = useState(false)
  const [repeatQuoteDialogOpen, setRepeatQuoteDialogOpen] = useState(false)
  const [creatingRepeatQuote, setCreatingRepeatQuote] = useState(false)
  const [quoteActionsOpen, setQuoteActionsOpen] = useState(false)

  useEffect(() => {
    if (!currentUser?.profilePhoto) {
      setCurrentUserProfilePhotoUrl(null)
      return
    }
    if (currentUser.profilePhotoUrl) {
      setCurrentUserProfilePhotoUrl(currentUser.profilePhotoUrl)
      return
    }

    let cancelled = false
    void createProfilePhotoSignedUrl(currentUser.profilePhoto)
      .then((url) => { if (!cancelled) setCurrentUserProfilePhotoUrl(url) })
      .catch(() => { if (!cancelled) setCurrentUserProfilePhotoUrl(null) })
    return () => { cancelled = true }
  }, [currentUser?.profilePhoto, currentUser?.profilePhotoUrl])
  const [dexterOpen, setDexterOpen] = useState(false)
  const [lookups, setLookups] = useState<QuoteWorkflowSources | null>(null)
  const [workspace, setWorkspace] = useState<QuoteWorkflowWorkspace | null>(null)
  const [intelligence, setIntelligence] = useState<QuoteIntelligenceSnapshot | null>(null)
  const [intelligenceUnavailable, setIntelligenceUnavailable] = useState(false)
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNewQuote)
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [workflowError, setWorkflowError] = useState("")
  const quoteCopyResetTimerRef = useRef<number | null>(null)
  const saveFeedbackTimerRef = useRef<number | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const failedSaveFingerprintRef = useRef<string | null>(null)
  const saveInFlightRef = useRef<symbol | null>(null)
  const quoteRequestGenerationRef = useRef(0)
  const readinessRequestRef = useRef(0)
  const intelligenceRequestRef = useRef(0)
  const issuePreviewTimerRef = useRef<number | null>(null)
  const issueBodyEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const selectedIssueRecipient = useMemo(
    () => issueRecipients.find((recipient) => recipient.email.toLowerCase() === issueRecipientEmail.trim().toLowerCase()) ?? null,
    [issueRecipientEmail, issueRecipients],
  )
  const resolvedIssueRecipient = useMemo<QuoteIssueRecipientInput | null>(() => {
    const email = issueRecipientEmail.trim().toLowerCase()
    if (!validEmailAddress(email)) return null
    const saved = issueRecipients.find((recipient) => recipient.email.toLowerCase() === email)
    return saved ? { source: "saved", key: saved.key } : { source: "manual", email }
  }, [issueRecipientEmail, issueRecipients])

  useEffect(() => {
    const userIds = lookups?.users.map((person) => person.id).filter(Boolean) ?? []
    if (!supabase || userIds.length === 0) {
      setSalesUserPhotoUrls(new Map())
      return
    }

    let cancelled = false
    void authSupabase!.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        if (!data.session) return []
        return getApiTeamUsersByIds(data.session.access_token, userIds)
      })
      .then(async (users) => {
        const photos = users.flatMap((person) => person.profilePhoto ? [person.profilePhoto] : [])
        const signedUrls = await createProfilePhotoSignedUrls(photos)
        if (cancelled) return
        setSalesUserPhotoUrls(new Map(users.flatMap((person) => {
          const url = person.profilePhoto ? signedUrls.get(person.profilePhoto.path) : null
          return url ? [[person.id, url] as const] : []
        })))
      })
      .catch(() => { if (!cancelled) setSalesUserPhotoUrls(new Map()) })

    return () => { cancelled = true }
  }, [lookups?.users])

  useEffect(() => {
    const reference = workspace?.quote.reference.trim().toLowerCase()
    if (!currentQuoteId || !reference) {
      setQuoteEditors([])
      return
    }

    let active = true
    let inFlight = false
    const quoteRoute = `/quotes/${reference}`
    const refreshEditors = () => {
      if (document.visibilityState !== "visible" || inFlight) return
      inFlight = true
      void getQuoteEditorPresence(quoteRoute)
        .then((editors) => { if (active) setQuoteEditors(editors) })
        .catch(() => {
          // Presence is supporting awareness only. A temporary outage must not
          // interrupt quote editing or autosave.
        })
        .finally(() => { inFlight = false })
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshEditors()
      else setQuoteEditors([])
    }

    refreshEditors()
    const intervalId = window.setInterval(refreshEditors, 20_000)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      active = false
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [currentQuoteId, workspace?.quote.reference])

  useEffect(() => () => {
    if (quoteCopyResetTimerRef.current !== null) window.clearTimeout(quoteCopyResetTimerRef.current)
    if (saveFeedbackTimerRef.current !== null) window.clearTimeout(saveFeedbackTimerRef.current)
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current)
    if (issuePreviewTimerRef.current !== null) window.clearTimeout(issuePreviewTimerRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    let workspaceApplied = false
    quoteRequestGenerationRef.current += 1
    saveInFlightRef.current = null
    failedSaveFingerprintRef.current = null
    setSaving(false)
    setCurrentQuoteId(null)
    setLoading(!isNewQuote)
    setIntelligence(null)
    setIntelligenceUnavailable(false)
    setWorkflowError("")
    setViewedVersionId(null)
    setNewVersionDialogOpen(false)
    setPendingCustomerChange(null)
    setCreatingCustomerQuote(false)
    setRepeatQuoteDialogOpen(false)
    setCreatingRepeatQuote(false)
    setQuoteActionsOpen(false)
    void (async () => {
      try {
        // Lookup labels enrich the editor after the quote is already usable.
        // Load them only after the workspace so they do not compete with the
        // critical quote request or alarm the operator if enrichment is down.
        const loadSources = () => getQuoteSources().catch(() => null)
        if (isNewQuote) {
          const openedQuote = await openQuoteWorkflow()
          const openedWorkspace = await getQuoteWorkflow(openedQuote.reference)
          if (!cancelled) {
            const openedQuoteRecord = quoteRecordFromWorkspace(openedWorkspace, null)
            const openedCharges = quoteChargesFromWorkspace(openedWorkspace)
            setWorkspace(openedWorkspace)
            setIntelligence(openedWorkspace.intelligence)
            setIntelligenceUnavailable(false)
            setCurrentQuoteId(openedWorkspace.quote.id)
            setSavedQuote(openedQuoteRecord)
            setDraftQuote(openedQuoteRecord)
            setSavedCharges(openedCharges)
            setDraftCharges(openedCharges)
            setActiveTab("details")
            setLoading(false)
            navigate?.(`/quotes/${openedQuote.reference}`)
          }
          const sources = await loadSources()
          if (!cancelled && sources) setLookups(sources)
          return
        }
        const reference = quoteId?.toUpperCase() ?? ""
        void getSalesQuote(reference)
          .then((preview) => {
            if (cancelled || workspaceApplied || !preview) return
            const previewQuote = quoteRecordFromRegister(preview)
            setSavedQuote(previewQuote)
            setDraftQuote(previewQuote)
            setSavedCharges([])
            setDraftCharges([])
          })
          .catch(() => {
            // The full workspace request below remains the source of truth and
            // owns the visible error state if this lightweight preview misses.
          })
        const loadedWorkspace = await loadQuoteWorkspace(reference)
        if (cancelled) return
        const canonicalReference = loadedWorkspace.quote.reference.trim().toUpperCase()
        if (canonicalReference && canonicalReference !== reference) {
          navigate?.(`/quotes/${encodeURIComponent(canonicalReference.toLowerCase())}`)
          return
        }
        workspaceApplied = true
        const loadedQuote = quoteRecordFromWorkspace(loadedWorkspace, null)
        const loadedCharges = quoteChargesFromWorkspace(loadedWorkspace)
        setWorkspace(loadedWorkspace)
        setIntelligence(loadedWorkspace.intelligence)
        setIntelligenceUnavailable(false)
        setCurrentQuoteId(loadedWorkspace.quote.id)
        setSavedQuote(loadedQuote)
        setDraftQuote(loadedQuote)
        setSavedCharges(loadedCharges)
        setDraftCharges(loadedCharges)
        setLoading(false)

        const sources = await loadSources()
        if (cancelled || !sources) return
        const enrichedQuote = quoteRecordFromWorkspace(loadedWorkspace, sources)
        const loadedSignature = JSON.stringify(loadedQuote)
        setLookups(sources)
        setSavedQuote((current) => JSON.stringify(current) === loadedSignature ? enrichedQuote : current)
        setDraftQuote((current) => JSON.stringify(current) === loadedSignature ? enrichedQuote : current)
      } catch (error) {
        if (!cancelled) setWorkflowError(error instanceof Error ? error.message : "The quote could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      quoteRequestGenerationRef.current += 1
      intelligenceRequestRef.current += 1
      readinessRequestRef.current += 1
    }
  }, [isNewQuote, quoteId])

  useEffect(() => {
    const reference = workspace?.quote.reference
    if (!currentQuoteId || !reference) return
    let active = true
    const unsubscribe = subscribeQuoteIntelligence(currentQuoteId, (next) => {
      if (active && next) {
        setIntelligence(next)
        setIntelligenceUnavailable(false)
      }
    })
    const calculatedAt = intelligence?.calculatedAt ? new Date(intelligence.calculatedAt).getTime() : 0
    const needsRefresh = !calculatedAt || Date.now() - calculatedAt > 15 * 60_000
    if (needsRefresh) {
      void refreshQuoteIntelligence(reference)
        .then((next) => {
          if (!active) return
          setIntelligence(next)
          setIntelligenceUnavailable(false)
        })
        .catch(() => { if (active) setIntelligenceUnavailable(true) })
    }
    return () => {
      active = false
      unsubscribe()
    }
  // The subscription belongs to the immutable quote ID. A save may return its
  // internal reference alias; that must not restart the initial refresh.
  }, [currentQuoteId])

  const currentVersion = workspace?.versions.find((version) => version.CusQuoteVersion_IsCurrent) ?? null
  const currentVersionIsSubmitted = Boolean(currentVersion?.CusQuoteVersion_IsSubmitted)
  const latestSubmittedVersion = useMemo(() => (workspace?.versions ?? []).reduce<QuoteWorkflowVersion | null>((latest, version) => {
    if (!version.CusQuoteVersion_IsSubmitted) return latest
    if (!latest || version.CusQuoteVersion_Number > latest.CusQuoteVersion_Number) return version
    return latest
  }, null), [workspace?.versions])
  const latestSubmittedVersionLabel = latestSubmittedVersion
    ? latestSubmittedVersion.CusQuoteVersion_Number === 1 ? "Original quote" : `V${latestSubmittedVersion.CusQuoteVersion_Number}`
    : "No submitted version"
  const viewedVersion = viewedVersionId
    ? workspace?.versions.find((version) => version.CusQuoteVersion_ID === viewedVersionId) ?? null
    : null
  const presentedVersion = viewedVersion ?? currentVersion
  const viewedVersionWorkspace = useMemo(
    () => workspace && viewedVersion ? quoteWorkspaceFromVersion(workspace, viewedVersion) : null,
    [viewedVersion, workspace],
  )
  const viewingHistoricalVersion = Boolean(viewedVersion && !viewedVersion.CusQuoteVersion_IsCurrent && viewedVersionWorkspace)
  const workspaceEditable = !viewingHistoricalVersion && !currentVersionIsSubmitted
  const presentedQuote = viewingHistoricalVersion && viewedVersionWorkspace
    ? quoteRecordFromWorkspace(viewedVersionWorkspace, lookups)
    : draftQuote
  const activeCharges = viewingHistoricalVersion && viewedVersionWorkspace
    ? quoteChargesFromWorkspace(viewedVersionWorkspace)
    : draftCharges
  const activeTotals = useMemo(() => getChargeTotals(activeCharges), [activeCharges])
  const activeQuote = {
    ...presentedQuote,
    cost: workspace ? activeTotals.cost : draftQuote.cost,
    revenue: workspace ? activeTotals.revenue : draftQuote.revenue,
    profit: workspace ? activeTotals.profit : draftQuote.profit,
    margin: workspace ? activeTotals.margin : draftQuote.margin,
  }
  const profilePhotoForSalesUser = (userId?: string, email?: string) => {
    const teamPhotoUrl = userId ? salesUserPhotoUrls.get(userId) : null
    if (teamPhotoUrl) return teamPhotoUrl
    if (!currentUserProfilePhotoUrl) return null
    if (userId && currentUser?.internalUserId === userId) return currentUserProfilePhotoUrl
    if (email && currentUser?.email && email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) return currentUserProfilePhotoUrl
    return null
  }
  const activeSalesUser = lookups?.users.find((person) => person.id === activeQuote.salesOwnerId)
  const isDirty = JSON.stringify(draftQuote) !== JSON.stringify(savedQuote) || JSON.stringify(draftCharges) !== JSON.stringify(savedCharges)
  const lifecycle = workspace?.quote.lifecycle ?? (currentQuoteId ? "draft" : "")
  const quoteIsLost = lifecycle === "declined" || lifecycle === "ghosted"
  const currentVersionHasFinalResponse = ["accepted", "declined", "changes_requested"].includes(String(currentVersion?.CusQuoteVersion_StatusCode || ""))
  const quoteCanBeIssued = lifecycle !== "ghosted" && !currentVersionHasFinalResponse
  const quoteHasAcceptedHistory = lifecycle === "accepted" || Boolean(workspace?.events.some((event) => event.CusQuoteEvent_TypeCode === "customer_accepted"))
  const heading = variant === "ai" ? "AI spot quote command" : "Spot quote"
  const visualTabTravelDirection = shouldReduceMotion
    ? 0
    : tabTravelDirection * (direction === "rtl" ? -1 : 1)

  useEffect(() => {
    if (!currentQuoteId || !quoteCanBeIssued) {
      setIssueReadiness(null)
      return
    }
    let active = true
    const request = ++readinessRequestRef.current
    setIssueReadinessLoading(true)
    void getQuoteIssueReadiness(currentQuoteId)
      .then((readiness) => { if (active && request === readinessRequestRef.current) setIssueReadiness(readiness) })
      .catch(() => { if (active && request === readinessRequestRef.current) setIssueReadiness(null) })
      .finally(() => { if (active && request === readinessRequestRef.current) setIssueReadinessLoading(false) })
    return () => { active = false }
  }, [currentQuoteId, quoteCanBeIssued])

  useEffect(() => {
    if (issuePreviewTimerRef.current !== null) window.clearTimeout(issuePreviewTimerRef.current)
    if (!issueDialogOpen || !currentQuoteId || !resolvedIssueRecipient || !issueEmailSubject.trim() || !issueEmailBody.trim() || issueDraftLoading) return
    let active = true
    issuePreviewTimerRef.current = window.setTimeout(() => {
      issuePreviewTimerRef.current = null
      setIssuePreviewLoading(true)
      void previewQuoteIssueEmail(currentQuoteId, resolvedIssueRecipient, issueDeliveryMode, issueEmailSubject, issueEmailBody, issueExpiryPreset)
        .then((preview) => {
          if (!active) return
          setIssueEmailPreviewHtml(preview.previewHtml)
          setIssueEmailError("")
        })
        .catch((error) => {
          if (active) setIssueEmailError(error instanceof Error ? error.message : "The email preview could not be updated.")
        })
        .finally(() => { if (active) setIssuePreviewLoading(false) })
    }, 320)
    return () => {
      active = false
      if (issuePreviewTimerRef.current !== null) {
        window.clearTimeout(issuePreviewTimerRef.current)
        issuePreviewTimerRef.current = null
      }
    }
  }, [currentQuoteId, issueDeliveryMode, issueDialogOpen, issueDraftLoading, issueEmailBody, issueEmailSubject, issueExpiryPreset, resolvedIssueRecipient])

  function changeWorkspaceTab(nextTab: QuoteWorkspaceTab) {
    if (nextTab === activeTab) return
    const currentIndex = quoteWorkspaceTabs.indexOf(activeTab)
    const nextIndex = quoteWorkspaceTabs.indexOf(nextTab)
    setTabTravelDirection(nextIndex > currentIndex ? 1 : -1)
    setActiveTab(nextTab)
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(quoteWorkspaceTabStorageKey(quoteId), nextTab)
    }
  }

  async function copyQuoteReference() {
    try {
      await navigator.clipboard.writeText(activeQuote.id)
      if (quoteCopyResetTimerRef.current !== null) window.clearTimeout(quoteCopyResetTimerRef.current)
      setQuoteRefCopied(true)
      quoteCopyResetTimerRef.current = window.setTimeout(() => {
        setQuoteRefCopied(false)
        quoteCopyResetTimerRef.current = null
      }, 1800)
    } catch {
      setQuoteRefCopied(false)
    }
  }

  function updateDraftQuote(field: keyof QuoteRecord, value: string) {
    updateDraftQuotePatch({ [field]: value })
  }

  function updateDraftQuotePatch(patch: Partial<QuoteRecord>) {
    setDraftQuote((current) => {
      const next = { ...current, ...patch }
      if ("origin" in patch || "destination" in patch) {
        next.route = next.origin.trim() && next.destination.trim() ? `${next.origin.trim()} to ${next.destination.trim()}` : ""
      }
      const calculatedDirection = calculatedDirectionForQuote(next, lookups)
      if (calculatedDirection) {
        next.direction = calculatedDirection
        next.quoteType = calculatedDirection
      }
      return next
    })
  }

  function createAndAssignCustomer(name: string, code: string) {
    updateDraftQuotePatch({ customerId: "", contactId: "", customer: name, clientCode: code })
  }

  function requestCustomerOrganisationChange(change: PendingCustomerOrganisationChange) {
    if (!currentQuoteId || !draftQuote.customerId || draftQuote.customerId === change.organisation.id) {
      updateDraftQuotePatch(change.patch)
      return
    }
    setPendingCustomerChange(change)
  }

  function updateDraftCharge(index: number, field: QuoteChargeEditableField, value: string) {
    const getJobRate = (currency: QuoteCurrency, rateType: "costRate" | "revenueRate") => {
      if (currency === "GBP") return 1
      return draftQuote.jobRoes?.find((roe) => roe.currency === currency)?.[rateType] ?? 1
    }

    setDraftCharges((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line
        const numericValue = Number(value) || 0
        if (field === "code") {
          const option = chargeCatalogue.find((charge) => charge.code === value)
          return { ...line, code: value, ...(option ? { description: option.description } : {}) }
        }
        if (field === "description") {
          return { ...line, description: value }
        }
        if (field === "costCurrency") {
          const currency = value as QuoteCurrency
          const rate = getJobRate(currency, "costRate")
          return { ...line, costCurrency: currency, costExchange: rate, costRoeSource: "job", localCost: line.costAmount / rate }
        }
        if (field === "sellCurrency") {
          const currency = value as QuoteCurrency
          const rate = getJobRate(currency, "revenueRate")
          return { ...line, sellCurrency: currency, sellExchange: rate, sellRoeSource: "job", localSell: line.sellAmount / rate }
        }
        if (field === "costAmount") {
          return { ...line, costAmount: numericValue, localCost: numericValue / line.costExchange }
        }
        if (field === "sellAmount") {
          return { ...line, sellAmount: numericValue, localSell: numericValue / line.sellExchange }
        }
        if (field === "costExchange") {
          return { ...line, costExchange: numericValue, costRoeSource: "override", localCost: numericValue ? line.costAmount / numericValue : line.costAmount }
        }
        if (field === "sellExchange") {
          return { ...line, sellExchange: numericValue, sellRoeSource: "override", localSell: numericValue ? line.sellAmount / numericValue : line.sellAmount }
        }
        if (field === "localCost" || field === "localSell") {
          return { ...line, [field]: numericValue }
        }
        return { ...line, [field]: value }
      }),
    )
  }

  function addDraftCharge() {
    const template = chargeCatalogue[0]
    setDraftCharges((current) => [...current, {
      code: template.code,
      description: template.description,
      creditor: "Supplier pending",
      costCurrency: "GBP",
      costAmount: 0,
      localCost: 0,
      sellCurrency: "GBP",
      sellAmount: 0,
      localSell: 0,
      costExchange: 1,
      sellExchange: 1,
      costRoeSource: "job",
      sellRoeSource: "job",
      department: "SEA",
      internalNotes: "",
      additionalDetail: "",
    }])
  }

  function removeDraftCharge(index: number) {
    setDraftCharges((current) => current.filter((_, lineIndex) => lineIndex !== index))
  }

  function updateJobRoe(currency: JobRoe["currency"], field: "costRate" | "revenueRate", value: string) {
    const nextRate = Number(value)
    if (!Number.isFinite(nextRate) || nextRate <= 0) return
    setDraftQuote((current) => ({
      ...current,
      ...(currency === "USD" ? { [field === "costRate" ? "costRoe" : "revenueRoe"]: nextRate } : {}),
      jobRoes: (current.jobRoes ?? []).map((roe) => roe.currency === currency ? { ...roe, [field]: nextRate } : roe),
    }))
    setDraftCharges((current) => current.map((line) => {
      if (field === "costRate" && line.costCurrency === currency && line.costRoeSource === "job") {
        return { ...line, costExchange: nextRate, localCost: line.costAmount / nextRate }
      }
      if (field === "revenueRate" && line.sellCurrency === currency && line.sellRoeSource === "job") {
        return { ...line, sellExchange: nextRate, localSell: line.sellAmount / nextRate }
      }
      return line
    }))
  }

  function updateJobRoeBase(currency: JobRoe["currency"], value: string) {
    const nextRate = Number(value)
    if (!Number.isFinite(nextRate) || nextRate <= 0) return
    setDraftQuote((current) => ({
      ...current,
      ...(currency === "USD" ? { baseRoe: nextRate } : {}),
      jobRoes: (current.jobRoes ?? []).map((roe) => roe.currency === currency ? { ...roe, baseRate: nextRate } : roe),
    }))
  }

  function addJobRoe() {
    const candidates: JobRoe["currency"][] = ["AUD", "CAD", "USD", "EUR", "JPY"]
    setDraftQuote((current) => {
      const existing = current.jobRoes ?? []
      const currency = candidates.find((candidate) => !existing.some((roe) => roe.currency === candidate))
      if (!currency) return current
      const defaultRate = currency === "JPY" ? 190 : currency === "AUD" ? 1.95 : currency === "CAD" ? 1.72 : 1.25
      return { ...current, jobRoes: [...existing, { currency, baseRate: defaultRate, costRate: defaultRate, revenueRate: defaultRate }] }
    })
  }

  function removeJobRoe(currency: JobRoe["currency"]) {
    setDraftQuote((current) => ({ ...current, jobRoes: (current.jobRoes ?? []).filter((roe) => roe.currency !== currency) }))
  }

  function applyLoadedWorkspace(loadedWorkspace: QuoteWorkflowWorkspace, sources: QuoteWorkflowSources) {
    const loadedQuote = quoteRecordFromWorkspace(loadedWorkspace, sources)
    const loadedCharges = quoteChargesFromWorkspace(loadedWorkspace)
    setWorkspace(loadedWorkspace)
    setIntelligence(loadedWorkspace.intelligence)
    setIntelligenceUnavailable(false)
    setCurrentQuoteId(loadedWorkspace.quote.id)
    setSavedQuote(loadedQuote)
    setDraftQuote(loadedQuote)
    setSavedCharges(loadedCharges)
    setDraftCharges(loadedCharges)
  }

  async function createNewQuoteVersion(strategy: "copy" | "blank") {
    if (!currentQuoteId || !workspace || !currentVersionIsSubmitted || creatingVersion || saving) return
    setCreatingVersion(true)
    setWorkflowError("")
    try {
      const sourceQuote = presentedQuote
      const sourceCharges = activeCharges
      const nextQuote = strategy === "blank" ? blankQuoteRevision(sourceQuote) : {
        ...sourceQuote,
        status: "Open",
        statusTone: "green" as StatusTone,
      }
      const nextCharges = strategy === "blank" ? [] : sourceCharges
      const result = await saveQuoteWorkflow(currentQuoteId, quoteSavePayload(nextQuote, nextCharges, lookups))
      const sources = lookups ?? await getQuoteSources()
      const loadedWorkspace = await getQuoteWorkflow(result.reference, { fresh: true })
      applyLoadedWorkspace(loadedWorkspace, sources)
      setViewedVersionId(null)
      setNewVersionDialogOpen(false)
      setIssueNotice(`Working draft V${result.versionNumber ?? loadedWorkspace.versions.find((version) => version.CusQuoteVersion_IsCurrent)?.CusQuoteVersion_Number ?? ""} created.`)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "The new quote version could not be created.")
    } finally {
      setCreatingVersion(false)
    }
  }

  async function createQuoteForDifferentCustomer() {
    if (!pendingCustomerChange || !currentQuoteId || creatingCustomerQuote || saving) return
    const sourceQuoteId = currentQuoteId
    const sourceReference = workspace?.quote.reference || savedQuote.id
    const sourceQuote = draftQuote
    const sourceCharges = draftCharges
    const customerChange = pendingCustomerChange
    setCreatingCustomerQuote(true)
    setWorkflowError("")
    try {
      const sources = lookups ?? await getQuoteSources()
      if (isDirty) {
        await saveQuoteWorkflow(sourceQuoteId, quoteSavePayload(sourceQuote, sourceCharges, sources))
      }
      const nextQuote = newCustomerMasterQuote(sourceQuote, customerChange.patch, sourceQuoteId, sourceReference)
      const result = await saveQuoteWorkflow(null, quoteSavePayload(nextQuote, [], sources))
      const loadedWorkspace = await getQuoteWorkflow(result.reference, { fresh: true })
      setLookups(sources)
      applyLoadedWorkspace(loadedWorkspace, sources)
      setViewedVersionId(null)
      setPendingCustomerChange(null)
      setActiveTab("details")
      setIssueNotice(`New quote ${result.reference} created for ${customerChange.organisation.name}. Pricing was cleared for customer-specific review.`)
      navigate?.(`/quotes/${result.reference}`)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "The new customer quote could not be created.")
    } finally {
      setCreatingCustomerQuote(false)
    }
  }

  async function createRepeatQuote() {
    if (!currentQuoteId || creatingRepeatQuote || saving || isDirty) return
    const sourceQuoteId = currentQuoteId
    const sourceReference = workspace?.quote.reference || savedQuote.id
    setCreatingRepeatQuote(true)
    setWorkflowError("")
    try {
      const sources = lookups ?? await getQuoteSources()
      const nextQuote = newRepeatMasterQuote(savedQuote, sourceQuoteId, sourceReference)
      const result = await saveQuoteWorkflow(null, quoteSavePayload(nextQuote, [], sources))
      const loadedWorkspace = await getQuoteWorkflow(result.reference, { fresh: true })
      setLookups(sources)
      applyLoadedWorkspace(loadedWorkspace, sources)
      setViewedVersionId(null)
      setRepeatQuoteDialogOpen(false)
      setActiveTab("details")
      setIssueNotice(`Repeat quote ${result.reference} created. Dates and pricing are ready for fresh review.`)
      navigate?.(`/quotes/${result.reference}`)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "The repeat quote could not be created.")
    } finally {
      setCreatingRepeatQuote(false)
    }
  }

  async function saveChanges() {
    if (saveInFlightRef.current) return
    const quoteSnapshot = draftQuote
    const chargeSnapshot = draftCharges
    const snapshotFingerprint = JSON.stringify([quoteSnapshot, chargeSnapshot])
    if (failedSaveFingerprintRef.current === snapshotFingerprint) return
    const request = Symbol("quote-save")
    const generation = quoteRequestGenerationRef.current
    const isCurrent = () => generation === quoteRequestGenerationRef.current && saveInFlightRef.current === request
    saveInFlightRef.current = request
    setSaving(true)
    setWorkflowError("")
    const saveTimeoutId = window.setTimeout(() => {
      if (isCurrent()) setWorkflowError("Saving is taking longer than usual. Your edits are kept here while it finishes.")
    }, 8000)
    try {
      const payload = quoteSavePayload(quoteSnapshot, chargeSnapshot, lookups)
      const result = await saveQuoteWorkflow(currentQuoteId, payload)
      if (!isCurrent()) return
      setWorkflowError("")
      readinessRequestRef.current += 1
      setIssueReadiness(result.readiness)
      setIssueReadinessLoading(false)
      const savedPresentation = quoteLifecyclePresentation(result.lifecycle)
      const savedSnapshot = { ...quoteSnapshot, status: savedPresentation.status, statusTone: savedPresentation.tone }
      setCurrentQuoteId(result.quoteId)
      setSavedQuote(savedSnapshot)
      setDraftQuote((current) => JSON.stringify(current) === JSON.stringify(quoteSnapshot) ? savedSnapshot : current)
      setSavedCharges(chargeSnapshot)
      setDraftCharges((current) => JSON.stringify(current) === JSON.stringify(chargeSnapshot) ? chargeSnapshot : current)
      failedSaveFingerprintRef.current = null
      setWorkspace((current) => current && current.quote.id === result.quoteId ? {
        ...current,
        quote: { ...current.quote, id: result.quoteId, reference: result.reference, lifecycle: result.lifecycle },
        versions: [result.version, ...current.versions.filter((version) => version.CusQuoteVersion_ID !== result.versionId).map((version) => ({ ...version, CusQuoteVersion_IsCurrent: false }))],
        events: [...result.events, ...current.events.filter((event) => !result.events.some((saved) => saved.CusQuoteEvent_ID === event.CusQuoteEvent_ID))].slice(0, 100),
      } : current)
      const intelligenceRequest = ++intelligenceRequestRef.current
      void refreshQuoteIntelligence(result.reference, result.versionId)
        .then((next) => {
          if (generation !== quoteRequestGenerationRef.current || intelligenceRequest !== intelligenceRequestRef.current) return
          setIntelligence(next)
          setIntelligenceUnavailable(false)
        })
        .catch(() => {
          if (generation === quoteRequestGenerationRef.current && intelligenceRequest === intelligenceRequestRef.current && !intelligence) setIntelligenceUnavailable(true)
        })
      // Refresh only the existing workflow metadata so the draft/submitted
      // version state and Audit/history are current without replacing the
      // quote draft the operator may already be editing.
      void getQuoteWorkflow(result.reference, { fresh: true })
        .then((fresh) => {
          setWorkspace((current) => current ? {
            ...current,
            versions: fresh.versions,
            events: fresh.events,
            latestIssue: fresh.latestIssue,
            linkedBooking: fresh.linkedBooking,
            documents: fresh.documents,
          } : current)
        })
      setValidationAttempted(false)
      setSaveFeedbackVisible(true)
      if (saveFeedbackTimerRef.current !== null) window.clearTimeout(saveFeedbackTimerRef.current)
      saveFeedbackTimerRef.current = window.setTimeout(() => {
        setSaveFeedbackVisible(false)
        saveFeedbackTimerRef.current = null
      }, 1800)
      // An existing quote can be opened through a customer-reference alias
      // while the workflow save returns its internal Q-* reference. Replacing
      // the route here remounts the workspace, drops focus, and resets scroll
      // after every autosave. New quotes already navigate when they are opened;
      // edits must remain on the active route.
    } catch (error) {
      if (!isCurrent()) return
      failedSaveFingerprintRef.current = snapshotFingerprint
      setWorkflowError(error instanceof Error ? error.message : "The quote could not be saved.")
    } finally {
      window.clearTimeout(saveTimeoutId)
      if (isCurrent()) {
        saveInFlightRef.current = null
        setSaving(false)
      }
    }
  }

  useEffect(() => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current)
    const currentDraftFingerprint = JSON.stringify([draftQuote, draftCharges])
    if (loading || !currentQuoteId || !isDirty || saving || transitioning || failedSaveFingerprintRef.current === currentDraftFingerprint) return
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      void saveChanges()
    }, 650)
    return () => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current)
    }
  }, [currentQuoteId, draftCharges, draftQuote, isDirty, loading, saving, transitioning])

  async function markQuoteLost() {
    const reason = formatQuoteLossReason(lossReason, lossDetails)
    if (!currentQuoteId || !reason || transitioning || isDirty) return
    setTransitioning(true)
    setWorkflowError("")
    try {
      await transitionQuoteWorkflow(currentQuoteId, "declined", reason)
      const sources = lookups ?? await getQuoteSources()
      const reference = workspace?.quote.reference ?? savedQuote.id
      const loadedWorkspace = await getQuoteWorkflow(reference, { fresh: true })
      setLookups(sources)
      applyLoadedWorkspace(loadedWorkspace, sources)
      void refreshQuoteIntelligence(reference)
        .then((next) => { setIntelligence(next); setIntelligenceUnavailable(false) })
        .catch(() => { if (!loadedWorkspace.intelligence) setIntelligenceUnavailable(true) })
      setLossDialogOpen(false)
      setLossReason("")
      setLossDetails("")
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "The quote could not be marked lost.")
    } finally {
      setTransitioning(false)
    }
  }

  async function markQuoteWon() {
    if (!currentQuoteId || !latestSubmittedVersion || transitioning || isDirty) return
    setTransitioning(true)
    setWorkflowError("")
    try {
      await transitionQuoteWorkflow(currentQuoteId, "accepted")
      const sources = lookups ?? await getQuoteSources()
      const reference = workspace?.quote.reference ?? savedQuote.id
      const loadedWorkspace = await getQuoteWorkflow(reference, { fresh: true })
      setLookups(sources)
      applyLoadedWorkspace(loadedWorkspace, sources)
      setWinDialogOpen(false)
    } catch (error) {
      try {
        const sources = lookups ?? await getQuoteSources()
        const reference = workspace?.quote.reference ?? savedQuote.id
        const loadedWorkspace = await getQuoteWorkflow(reference, { fresh: true })
        if (loadedWorkspace.quote.lifecycle === "accepted") {
          setLookups(sources)
          applyLoadedWorkspace(loadedWorkspace, sources)
          setWinDialogOpen(false)
          return
        }
      } catch {
        // Keep the original transition error when the recovery read is unavailable.
      }
      setWorkflowError(error instanceof Error ? error.message : "The quote could not be marked won.")
    } finally {
      setTransitioning(false)
    }
  }

  async function loadIssueEmailDraft(recipient: QuoteIssueRecipientInput, deliveryMode = issueDeliveryMode, expiryPreset = issueExpiryPreset) {
    if (!currentQuoteId) return
    setIssueDraftLoading(true)
    setIssueEmailError("")
    setIssueEmailSubject("")
    setIssueEmailBody("")
    setIssueEmailPreviewHtml("")
    try {
      const draft = await prepareQuoteIssueEmail(currentQuoteId, recipient, deliveryMode, expiryPreset)
      setIssueEmailSubject(draft.subject)
      setIssueEmailBody(draft.bodyText)
      setIssueEmailPreviewHtml(draft.previewHtml)
    } catch (error) {
      setIssueEmailError(error instanceof Error ? error.message : "Dexter could not prepare the quote email.")
    } finally {
      setIssueDraftLoading(false)
    }
  }

  async function openIssueQuoteDialog() {
    if (!currentQuoteId || saving || isDirty || !quoteCanBeIssued) return
    if (!savedQuote.source?.trim()) {
      setValidationAttempted(true)
      setWorkflowError("Choose a quote source before preparing or sending this quote.")
      setActiveTab("details")
      return
    }
    setIssueExpiryPreset("14")
    setIssueRecipients([])
    setIssueMailboxes([])
    setIssueMailboxId("")
    setIssueRecipientEmail("")
    setIssueRecipientSuggestionsOpen(false)
    setIssueDeliveryMode("standard")
    setIssueEmailSubject("")
    setIssueEmailBody("")
    setIssueEmailPreviewHtml("")
    setIssueEmailError("")
    setIssueRefinementOpen(false)
    setIssueRefinementInstruction("")
    setIssueRefinementSelection(null)
    setIssueBodySelection(null)
    setIssueSelectionAnchor(null)
    setIssueDeliveryState("idle")
    setIssueDialogOpen(true)
    setIssueReadinessLoading(true)
    setWorkflowError("")
    try {
      const [readiness, options, connectedMailboxes] = await Promise.all([
        getQuoteIssueReadiness(currentQuoteId),
        getQuoteIssueRecipients(currentQuoteId),
        listMailboxes().catch(() => []),
      ])
      setIssueReadiness(readiness)
      setIssueRecipients(options.recipients)
      const sendableMailboxes = connectedMailboxes
        .filter((mailbox) => mailbox.outboundEnabled && mailbox.status === "connected")
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.address.localeCompare(right.address))
      setIssueMailboxes(sendableMailboxes)
      setIssueMailboxId(sendableMailboxes[0]?.id ?? "")
      const savedEmail = savedQuote.customerEmail?.trim().toLowerCase()
      const selected = options.recipients.find((recipient) => recipient.email.toLowerCase() === savedEmail) ?? options.recipients[0]
      if (selected) {
        setIssueRecipientEmail(selected.email)
        await loadIssueEmailDraft({ source: "saved", key: selected.key }, "standard", "14")
      } else {
        setIssueEmailError("Add a company email or a contact email before sending this quote.")
      }
      if (!sendableMailboxes.length) setIssueEmailError("Choose a connected mailbox that can send email.")
    } catch (error) {
      setIssueEmailError(error instanceof Error ? error.message : "Quote delivery details could not be loaded.")
    } finally {
      setIssueReadinessLoading(false)
    }
  }

  function changeIssueRecipient(recipient: QuoteIssueRecipient) {
    setIssueDeliveryState("idle")
    setIssueRefinementOpen(false)
    setIssueBodySelection(null)
    setIssueSelectionAnchor(null)
    setIssueRecipientEmail(recipient.email)
    setIssueRecipientSuggestionsOpen(false)
    void loadIssueEmailDraft({ source: "saved", key: recipient.key })
  }

  function updateIssueRecipientEmail(value: string) {
    const email = value.slice(0, 320)
    setIssueRecipientEmail(email)
    setIssueDeliveryState("idle")
    setIssueEmailError("")
  }

  function prepareTypedIssueRecipient() {
    if (!resolvedIssueRecipient) {
      setIssueEmailError(issueRecipientEmail.trim() ? "Enter a valid customer email address." : "Choose a company contact or enter an email address.")
      return
    }
    void loadIssueEmailDraft(resolvedIssueRecipient)
  }

  function changeIssueDeliveryMode(mode: QuoteDeliveryMode) {
    if (mode === issueDeliveryMode) return
    setIssueDeliveryMode(mode)
    setIssueDeliveryState("idle")
    setIssueRefinementOpen(false)
    setIssueBodySelection(null)
    setIssueSelectionAnchor(null)
    if (resolvedIssueRecipient) void loadIssueEmailDraft(resolvedIssueRecipient, mode)
  }

  function updateIssueBodySelection() {
    const editor = issueBodyEditorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const text = editor.value.slice(start, end)
    if (end <= start || !text.trim()) {
      setIssueBodySelection(null)
      setIssueSelectionAnchor(null)
      return
    }
    setIssueBodySelection({ start, end, text })
    setIssueSelectionAnchor(textareaSelectionAnchor(editor, start))
  }

  function openIssueRefinement(selection: TextareaSelection | null = null, initialInstruction = "") {
    if (issuing || issueDraftLoading || issueRefining) return
    setIssueRefinementSelection(selection)
    setIssueRefinementInstruction(initialInstruction)
    setIssueEmailError("")
    setIssueRefinementOpen(true)
  }

  function closeIssueRefinement() {
    if (issueRefining) return
    setIssueRefinementOpen(false)
    setIssueRefinementInstruction("")
    setIssueRefinementSelection(null)
  }

  async function performIssueRefinement(instruction: string, selection: TextareaSelection | null) {
    const cleanInstruction = instruction.trim()
    if (!currentQuoteId || !resolvedIssueRecipient || issueDeliveryMode !== "standard" || !cleanInstruction || issueRefining || issuing) return
    if (selection && issueEmailBody.slice(selection.start, selection.end) !== selection.text) {
      setIssueEmailError("Select the text again before refining it.")
      return
    }
    const snapshotSubject = issueEmailSubject
    const snapshotBody = issueEmailBody
    setIssueRefining(true)
    setIssueEmailError("")
    try {
      const refined = await refineQuoteIssueEmail({
        quoteId: currentQuoteId,
        recipient: resolvedIssueRecipient,
        deliveryMode: issueDeliveryMode,
        subject: snapshotSubject,
        bodyText: snapshotBody,
        instruction: cleanInstruction,
        selection: selection ? { start: selection.start, end: selection.end } : null,
      })
      if (issueEmailSubject !== snapshotSubject || issueEmailBody !== snapshotBody) {
        setIssueEmailError("Your draft changed while Dexter was refining it. Run the refinement again.")
        return
      }
      setIssueEmailSubject(refined.subject)
      setIssueEmailBody(refined.bodyText)
      setIssueBodySelection(null)
      setIssueSelectionAnchor(null)
      setIssueRefinementSelection(null)
      setIssueRefinementInstruction("")
      setIssueRefinementOpen(false)
    } catch (error) {
      setIssueEmailError(error instanceof Error ? error.message : "Dexter could not refine this draft. Your current wording is unchanged.")
    } finally {
      setIssueRefining(false)
    }
  }

  async function issueQuoteToCustomer() {
    if (!currentQuoteId || !issueReadiness?.ready || !resolvedIssueRecipient || !issueMailboxId || !issueEmailSubject.trim() || !issueEmailBody.trim() || issuing || issueDraftLoading || issuePreviewLoading) return
    setIssuing(true)
    setWorkflowError("")
    setIssueEmailError("")
    setIssueNotice("")
    let result: Awaited<ReturnType<typeof issueQuoteWorkflow>>
    try {
      result = await issueQuoteWorkflow(currentQuoteId, resolvedIssueRecipient, issueDeliveryMode, issueMailboxId, issueEmailSubject, issueEmailBody, issueExpiryPreset)
      if (!result.delivered) throw new Error("The email provider has not confirmed delivery. Nothing was marked as sent.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "The quote could not be sent."
      setIssueEmailError(message)
      setWorkflowError(message)
      toast.error(t("Quote was not sent"), { description: t(message) })
      setIssuing(false)
      return
    }

    const sentMessage = `Quote ${result.reference} was sent to ${result.recipientEmail}.`
    setIssueDeliveryState("sent")
    setIssueNotice(sentMessage)
    toast.success(t("Quote sent"), {
      description: t(`A PDF copy was saved in Documents and emailed to ${result.recipientEmail}.`),
      action: {
        label: t("View documents"),
        onClick: () => setActiveTab("documents"),
      },
    })
    await new Promise((resolve) => window.setTimeout(resolve, shouldReduceMotion ? 250 : 900))
    setIssueDialogOpen(false)
    try {
      const sources = lookups ?? await getQuoteSources()
      const loadedWorkspace = await getQuoteWorkflow(result.reference, { fresh: true })
      setLookups(sources)
      applyLoadedWorkspace(loadedWorkspace, sources)
    } catch {
      setWorkflowError("The quote was sent, but its latest status could not be refreshed. Reload the quote to update it.")
    } finally {
      setIssuing(false)
    }
  }

  function renderActiveWorkspacePanel() {
    if (activeTab === "overview") {
      const overview = variant === "ai"
        ? <QuoteAiOverviewPanel quote={activeQuote} />
        : variant === "cargowise"
          ? <QuoteCargoWiseOverviewPanel quote={activeQuote} intelligence={intelligence} intelligenceUnavailable={intelligenceUnavailable} />
          : <QuoteOverviewPanel quote={activeQuote} />
      return overview
    }

    if (activeTab === "details") {
      if (variant === "cargowise") {
        return <QuoteDetailsPanelV2 quote={activeQuote} editable={workspaceEditable} requireCoreFields onQuotePatch={updateDraftQuotePatch} onQuoteChange={updateDraftQuote} onCustomerOrganisationChange={requestCustomerOrganisationChange} validationAttempted={validationAttempted} lookups={lookups} />
      }

      return <QuoteSetupPanel quote={activeQuote} editable={workspaceEditable} onQuoteChange={updateDraftQuote} onJobRoeChange={updateJobRoe} validationAttempted={validationAttempted} />
    }

    if (activeTab === "charges") {
      return (
        <UnifiedQuoteChargesPanel
          quote={activeQuote}
          charges={activeCharges}
          editable={workspaceEditable}
          onRowsChange={setDraftCharges}
        />
      )
    }

    if (activeTab === "documents") return <DocumentWorkspace documents={quoteCustomerResponseDocuments(workspace)} />
    if (activeTab === "notes") return <LifecycleNotes subjectType="quote" subjectId={currentQuoteId} />
    return <AuditWorkspace records={quoteAuditRecords(workspace)} />
  }

  if (loading) {
    return (
      <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={`${t("Quote")} ${activeQuote.id}`} className="min-w-0 max-w-full overflow-x-clip">
        <main className="md-quote-workspace min-h-full min-w-0 max-w-full overflow-x-clip bg-[var(--md-analytics-bg)] px-3 py-3 sm:px-5 sm:py-4">
          <QuoteWorkspaceSkeleton />
        </main>
      </DexterDockedPage>
    )
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={`${t("Quote")} ${activeQuote.id}`} className="min-w-0 max-w-full overflow-x-clip">
      <main className="md-quote-workspace min-h-full min-w-0 max-w-full overflow-x-clip bg-[var(--md-analytics-bg)] px-3 py-3 sm:px-5 sm:py-4">
        <div className="grid w-full min-w-0 max-w-full gap-2">
          {workflowError ? (
            <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] px-3 py-2 text-[12px] font-medium text-[var(--md-red)] shadow-[var(--md-shadow-line)]">
              {t(workflowError)}
              {failedSaveFingerprintRef.current && isDirty && !saving ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => { failedSaveFingerprintRef.current = null; void saveChanges() }}>
                  {t("Retry save")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {issueNotice ? (
            <div role="status" aria-live="polite" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-green)_9%,var(--md-surface))] px-3 py-2 text-[12px] font-medium text-[var(--md-green)] shadow-[var(--md-shadow-line)]">
              {t(issueNotice)}
            </div>
          ) : null}
          {viewingHistoricalVersion && viewedVersion ? (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-status-blue-bg)] px-3 py-2 text-[12px] text-[var(--md-status-blue-ink)] shadow-[var(--md-shadow-line)]">
              <Clock3 className="size-4 shrink-0" strokeWidth={1.4} aria-hidden="true" />
              <span className="min-w-0 flex-1">{t("You are viewing a submitted quote version. Its fields and charges are locked for audit history.")} <span className="font-medium" data-i18n-skip dir="ltr">{viewedVersion.CusQuoteVersion_Number === 1 ? t("Original quote") : `V${viewedVersion.CusQuoteVersion_Number}`}</span></span>
              <Button type="button" variant="ghost" onClick={() => setViewedVersionId(null)} className="h-7 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2 text-[11px] text-[var(--md-status-blue-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)]">
                {t("Return to latest")}
              </Button>
              {currentVersionIsSubmitted ? (
                <Button type="button" variant="ghost" onClick={() => setNewVersionDialogOpen(true)} className="h-7 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2 text-[11px] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent-a07)]">
                  <Plus className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                  {t("Use for new version")}
                </Button>
              ) : null}
            </div>
          ) : null}
          <Tabs value={activeTab} onValueChange={(value) => changeWorkspaceTab(value as QuoteWorkspaceTab)} className="min-w-0 max-w-full gap-2">
            <div className="relative">
              <div className={cn("md-quote-workspace-header grid min-w-0 items-stretch gap-2", activeTab === "details" && "md-quote-workspace-header--details")}>
                <div className="grid min-w-0 grid-rows-[auto_auto] gap-1.5">
                <section
                  className={cn(
                    "md-quote-record-header flex min-w-0 flex-col gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-3 py-1.5 shadow-[var(--md-shadow-line)] transition-colors sm:flex-row sm:items-center",
                    lifecycle === "accepted" && "bg-[var(--md-status-green-bg)]",
                  )}
                >
          <div className="md-quote-record-identity flex min-w-0 items-center gap-1.5">
            <div className="min-w-0">
              <div className="flex flex-nowrap items-center gap-1.5">
                <h1 className="flex shrink-0 items-center gap-1.5 text-[14px] font-medium leading-5 text-[var(--md-ink)]">
                  {variant === "ai" ? <ChartAnalysis className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" /> : null}
                  <span>{t(heading)}</span>
                </h1>
                <button
                  type="button"
                  aria-label={t(quoteRefCopied ? "Quote reference copied" : "Copy quote reference")}
                  title={t(quoteRefCopied ? "Copied" : "Copy quote reference")}
                  className="group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] px-2 text-[14px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,transform] duration-200 hover:bg-[var(--md-accent-a16)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.985]"
                  onClick={() => void copyQuoteReference()}
                >
                  <CopyFeedbackTransition
                    value={activeQuote.id}
                    copiedValue={t("Copied")}
                    active={quoteRefCopied}
                    effect="slot"
                    inline
                    ariaHidden
                    className="h-[1em] leading-none"
                    originalDirection="ltr"
                    copiedDirection={direction}
                  />
                  <CopyStatusIcon copied={quoteRefCopied} iconClassName="size-3.5" className="shrink-0" />
                </button>
                <StatusPill kind="status" tone={activeQuote.statusTone} indicator={false} className="h-7 shrink-0 px-2 text-[11px]">{activeQuote.status}</StatusPill>
                {currentVersion ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={saving || isDirty}
                        aria-label={t("Choose quote version")}
                        className="h-7 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2 text-[11px] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)]"
                      >
                        <span data-i18n-skip dir="ltr">{presentedVersion?.CusQuoteVersion_Number === 1 ? t("Original") : `V${presentedVersion?.CusQuoteVersion_Number ?? currentVersion.CusQuoteVersion_Number}`}</span>
                        <span className="text-[var(--md-subtle)]">·</span>
                        <span>{t(viewingHistoricalVersion || currentVersionIsSubmitted ? "Submitted" : "Working draft")}</span>
                        <ChevronDown className="size-3" strokeWidth={1.4} aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={6} className="w-[min(340px,calc(100vw-24px))] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)]">
                      <div className="px-2 py-1.5">
                        <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Quote versions")}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[var(--md-subtle)]">{t("Submitted versions are read-only. One working draft can remain in progress.")}</p>
                      </div>
                      <div className="mt-1 grid max-h-64 gap-1 overflow-y-auto md-scrollbar">
                        {workspace?.versions.map((version) => {
                          const selected = (viewedVersion?.CusQuoteVersion_ID ?? currentVersion.CusQuoteVersion_ID) === version.CusQuoteVersion_ID
                          const versionDate = version.CusQuoteVersion_SubmittedAt || version.CusQuoteVersion_CreatedAt
                          return (
                            <button
                              key={version.CusQuoteVersion_ID}
                              type="button"
                              aria-current={selected ? "true" : undefined}
                              className={cn(
                                "flex min-h-11 items-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start outline-none transition-colors hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a14)]",
                                selected && "bg-[var(--md-accent-a07)]",
                              )}
                              onClick={() => setViewedVersionId(version.CusQuoteVersion_IsCurrent ? null : version.CusQuoteVersion_ID)}
                            >
                              <span className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[11px] font-medium", version.CusQuoteVersion_IsSubmitted ? "bg-[var(--md-status-blue-bg)] text-[var(--md-status-blue-ink)]" : "bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)]")} data-i18n-skip dir="ltr">
                                {version.CusQuoteVersion_Number === 1 ? "1" : version.CusQuoteVersion_Number}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{version.CusQuoteVersion_Number === 1 ? t("Original quote") : `${t("Version")} ${version.CusQuoteVersion_Number}`}</span>
                                <span className="mt-0.5 block text-[10.5px] text-[var(--md-subtle)]">{t(version.CusQuoteVersion_IsSubmitted ? version.CusQuoteVersion_StatusCode.replaceAll("_", " ") : "Working draft")} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(versionDate))}</span>
                              </span>
                              {selected ? <Check className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" /> : null}
                            </button>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
                {currentVersionIsSubmitted ? (
                  <Button type="button" variant="ghost" disabled={saving || creatingVersion} onClick={() => setNewVersionDialogOpen(true)} className="h-7 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2 text-[11px] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent-a07)]">
                    <Plus className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                    {t("New version")}
                  </Button>
                ) : null}
                {shouldShowQuoteCustomerResponse(workspace?.customerResponse ?? null) && workspace?.customerResponse ? (
                  <QuoteCustomerResponseTooltip response={workspace.customerResponse} />
                ) : null}
                {lifecycle === "accepted" && workspace?.linkedBooking ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2 text-[11px] text-[var(--md-status-green-ink)] shadow-[var(--md-shadow-line)]"
                    onClick={() => navigate?.(`/bookings/${workspace.linkedBooking?.bookingReference.toLowerCase()}`)}
                  >
                    {t("Booking")} <span data-i18n-skip dir="ltr">{workspace.linkedBooking.bookingReference}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          {quoteEditors.length ? <QuoteCoEditorWarning editors={quoteEditors} photoUrls={salesUserPhotoUrls} /> : null}
          <div className="md-quote-record-actions flex w-full min-w-0 flex-wrap items-center gap-1 md-scrollbar sm:ms-auto sm:w-auto sm:flex-nowrap">
            <LayoutGroup id={`quote-actions-${activeQuote.id}`}>
              <AnimatePresence initial={false} mode="popLayout">
                {isDirty || saving ? (
                  <motion.div
                    key="autosave-progress"
                    layout
                    role="status"
                    aria-live="polite"
                    className="flex h-8 shrink-0 items-center gap-1.5 px-2 text-[11px] font-medium text-[var(--md-subtle)]"
                    initial={{ opacity: 0, x: direction === "rtl" ? 6 : -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction === "rtl" ? 4 : -4 }}
                    transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                  >
                    <span className={cn(
                      "size-1.5 rounded-full",
                      saving ? "animate-pulse bg-[var(--md-accent)]" : workflowError ? "bg-[var(--md-amber)]" : "bg-[var(--md-accent)]",
                    )} aria-hidden="true" />
                    {t(saving ? "Saving…" : workflowError ? "Not saved" : "Unsaved changes")}
                  </motion.div>
                ) : saveFeedbackVisible ? (
                  <motion.div
                    key="saved-feedback"
                    layout
                    role="status"
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-accent)_10%,transparent)] px-2.5 text-[11px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                  >
                    <CheckCircle2 aria-hidden="true" className="size-3.5" strokeWidth={1.7} />
                    {t("Saved")}
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <motion.div layout="position" className="flex min-w-0 flex-wrap items-center gap-1 sm:flex-nowrap" transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.layout)}>
                <Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${t("Sales representative")}: ${activeQuote.salesRep || t("Unassigned")}`}
                          className="grid size-8 shrink-0 place-items-center rounded-full outline-none transition-[box-shadow,transform] duration-150 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
                        >
                          <QuotePersonAvatar
                            name={activeQuote.salesRep}
                            photoUrl={profilePhotoForSalesUser(activeQuote.salesOwnerId, activeSalesUser?.email)}
                          />
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{activeQuote.salesRep || t("Assign sales representative")}</TooltipContent>
                  </Tooltip>
                  <PopoverContent align="end" sideOffset={6} className="w-60 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)]">
                    <p className="px-2 py-1 text-[10px] font-medium text-[var(--md-subtle)]">{t("Sales representative")}</p>
                    <div className="grid gap-0.5">
                      {(lookups?.users ?? []).map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          className={cn(
                            "flex min-h-9 items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-start text-[12px] text-[var(--md-text)] outline-none hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a14)]",
                            person.id === activeQuote.salesOwnerId && "bg-[var(--md-accent-a07)] text-[var(--md-ink)]",
                          )}
                          onClick={() => {
                            updateDraftQuote("salesRep", person.name)
                            updateDraftQuote("salesOwnerId", person.id)
                          }}
                        >
                          <QuotePersonAvatar
                            name={person.name}
                            photoUrl={profilePhotoForSalesUser(person.id, person.email)}
                            className="size-7"
                            fallbackClassName="text-[9.5px]"
                          />
                          <span className="min-w-0 truncate">{person.name}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <DexterActionPill
                  className="h-8 min-w-[102px] rounded-[var(--md-radius-lg)] px-2.5 text-[11px]"
                  onClick={() => setDexterOpen(true)}
                />
                <Button type="button" variant="ghost" onClick={() => window.print()} className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2 text-[11px] shadow-[var(--md-shadow-line)]">
                  <Printer data-icon="inline-start" className="size-4" strokeWidth={1.4} />
                  {t("Print")}
                </Button>
                <Popover open={quoteActionsOpen} onOpenChange={setQuoteActionsOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={t("More quote actions")}
                          disabled={!currentQuoteId || saving || isDirty || creatingRepeatQuote}
                          className="size-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-0 text-[var(--md-text)] shadow-[var(--md-shadow-line)]"
                        >
                          <MoreHorizontal className="size-4" strokeWidth={1.4} aria-hidden="true" />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("More quote actions")}</TooltipContent>
                  </Tooltip>
                  <PopoverContent align="end" sideOffset={6} className="w-[min(300px,calc(100vw-24px))] rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)]">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-start gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start outline-none transition-colors hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a14)]"
                      onClick={() => { setQuoteActionsOpen(false); setRepeatQuoteDialogOpen(true) }}
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
                        <Copy className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12px] font-medium text-[var(--md-ink)]">{t("Use as a new repeat quote")}</span>
                        <span className="mt-0.5 block text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Keep the operational setup under a new quote number, then review fresh dates and pricing.")}</span>
                      </span>
                    </button>
                  </PopoverContent>
                </Popover>
                {quoteCanBeIssued && !viewingHistoricalVersion ? (
                  <>
                  <Button
                    type="button"
                    disabled={!currentQuoteId || saving || isDirty || issuing}
                    aria-label={t(quoteHasAcceptedHistory ? "Resend quote" : issueReadiness?.ready ? "Send quote" : "Review quote readiness")}
                    className={cn(
                      "h-8 min-w-[118px] shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[11px]",
                      (saving || isDirty) && "cursor-wait opacity-50 active:scale-100",
                      !issueReadiness?.ready && "bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-surface-soft)]",
                    )}
                    title={t(quoteHasAcceptedHistory ? "Send the latest saved version and start a new customer response" : issueReadiness?.ready ? "Send this saved quote securely" : "Review the fields required before sending")}
                    onClick={() => void openIssueQuoteDialog()}
                  >
                    <Send data-icon="inline-start" className="size-4" strokeWidth={1.4} />
                    {t(quoteHasAcceptedHistory ? issueReadiness?.ready ? "Resend quote" : "Review to resend" : issueReadiness?.ready ? "Send quote" : "Review to send")}
                  </Button>
                  {workspace?.latestIssue?.deliveryStatus === "sent" && (workspace.latestIssue.responseControlsEnabled === false || workspace.latestIssue.deliveryMode === "simple") ? (
                    <Button
                      type="button"
                      disabled={!currentQuoteId || isDirty || saving || transitioning}
                      className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-status-green-bg)] px-2.5 text-[11px] font-normal text-[var(--md-status-green-ink)] shadow-none hover:bg-[color-mix(in_srgb,var(--md-status-green-bg)_82%,var(--md-green))]"
                      onClick={() => setWinDialogOpen(true)}
                    >
                      {t("Mark won")}
                    </Button>
                  ) : null}
                  {lifecycle !== "accepted" ? <Button
                    type="button"
                    disabled={!currentQuoteId || isDirty || saving || transitioning}
                    className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-status-red-bg)] px-2.5 text-[11px] font-normal text-[var(--md-status-red-ink)] shadow-none hover:bg-[color-mix(in_srgb,var(--md-status-red-bg)_82%,var(--md-red))]"
                    onClick={() => setLossDialogOpen(true)}
                  >
                    {t("Mark lost")}
                  </Button> : null}
                  </>
                ) : null}
              </motion.div>
            </LayoutGroup>
          </div>
                </section>
                <Surface
                  padding="none"
                  tone="soft"
                  className="min-w-0 w-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]"
                >
                  <TabsList variant="line" className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
                  <TabsTrigger value="overview" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <ReceiptText data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Overview")}
                  </TabsTrigger>
                  <TabsTrigger value="details" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <Route data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Details")}
                  </TabsTrigger>
                  <TabsTrigger value="charges" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <CircleDollarSign data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Quote charges")}
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <FileText data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Documents")}
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <MessageSquareText data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Notes")}
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <Clock3 data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Audit")}
                  </TabsTrigger>
                  </TabsList>
                </Surface>
              </div>
                {activeTab === "details" ? null : (
                  <QuoteWorkspaceContext
                    activeTab={activeTab}
                    quote={activeQuote}
                    editable={workspaceEditable}
                    onJobRoeBaseChange={updateJobRoeBase}
                    onAddJobRoe={addJobRoe}
                    onRemoveJobRoe={removeJobRoe}
                    onJobRoeChange={updateJobRoe}
                  />
                )}
              </div>
            </div>

              <TabsContent value={activeTab} forceMount className="relative mt-0 min-h-px overflow-x-clip">
                <AnimatePresence initial={false} mode="popLayout" custom={visualTabTravelDirection}>
                  <motion.div
                    key={activeTab}
                    data-quote-workspace-tab={activeTab}
                    custom={visualTabTravelDirection}
                    variants={{
                      enter: (travel: number) => ({ opacity: 0, x: travel * 12 }),
                      active: { opacity: 1, x: 0 },
                      exit: (travel: number) => ({ opacity: 0, x: travel * -8 }),
                    }}
                    initial="enter"
                    animate="active"
                    exit="exit"
                    transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
                  >
                    {renderActiveWorkspacePanel()}
                  </motion.div>
                </AnimatePresence>
              </TabsContent>
          </Tabs>
        </div>
      </main>
      <Dialog open={repeatQuoteDialogOpen} onOpenChange={(open) => { if (!creatingRepeatQuote) setRepeatQuoteDialogOpen(open) }}>
        <DialogContent className="rounded-[var(--md-radius-2xl)] sm:max-w-[540px]">
          <DialogHeader className="text-start">
            <div className="mb-1 grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]" aria-hidden="true">
              <Copy className="size-4" strokeWidth={1.4} />
            </div>
            <DialogTitle>{t("Use this as a new repeat quote?")}</DialogTitle>
            <DialogDescription>{t("This creates a separate master quote for the same customer. The current quote and its full history stay unchanged.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-[12px] leading-[1.55] text-[var(--md-text)]">
            <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)]">
              <p className="text-[10.5px] text-[var(--md-subtle)]">{t("Copied from")}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium text-[var(--md-ink)]">
                <span data-i18n-skip dir="ltr">{workspace?.quote.reference || savedQuote.id}</span>
                <span className="text-[var(--md-subtle)]" aria-hidden="true">·</span>
                <span data-i18n-skip dir="auto">{savedQuote.customer}</span>
              </p>
            </div>
            <p>{t("Multideck will carry across the customer, route, service, parties, cargo and supplier options. It will clear quote-specific references, validity, ETD, ETA, response deadline, carrier references and all charge lines.")}</p>
            <p className="text-[var(--md-subtle)]">{t("This prevents an expired schedule or old price from being sent accidentally. Apply the latest customer tariff or supplier rates before submitting the new quote.")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={creatingRepeatQuote} onClick={() => setRepeatQuoteDialogOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" disabled={creatingRepeatQuote} onClick={() => void createRepeatQuote()}>
              {creatingRepeatQuote ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {t(creatingRepeatQuote ? "Creating repeat quote…" : "Create repeat quote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingCustomerChange)}
        onOpenChange={(open) => { if (!open && !creatingCustomerQuote) setPendingCustomerChange(null) }}
      >
        <DialogContent className="rounded-[var(--md-radius-2xl)] sm:max-w-[540px]">
          <DialogHeader className="text-start">
            <div className="mb-1 grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_12%,transparent)] text-[var(--md-amber)]" aria-hidden="true">
              <TriangleAlert className="size-4" strokeWidth={1.4} />
            </div>
            <DialogTitle>{t("Create a separate quote for this customer?")}</DialogTitle>
            <DialogDescription>{t("A customer change must not overwrite this quote or mix two customers' commercial history.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-[12px] leading-[1.55] text-[var(--md-text)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)]">
              <div className="min-w-0">
                <p className="text-[10.5px] text-[var(--md-subtle)]">{t("Current quote")}</p>
                <p className="truncate font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{draftQuote.customer}</p>
              </div>
              <span className="text-[var(--md-subtle)]" aria-hidden="true">→</span>
              <div className="min-w-0 text-end">
                <p className="text-[10.5px] text-[var(--md-subtle)]">{t("New quote")}</p>
                <p className="truncate font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{pendingCustomerChange?.organisation.name}</p>
              </div>
            </div>
            <p>{t("Multideck will copy the route, service, cargo and operational parties into a new master quote number. Customer references, notes and all prices will be cleared; the new customer's saved terms and contact details will be applied.")}</p>
            <p className="text-[var(--md-subtle)]">{t("The current quote and every submitted version remain unchanged. Review or apply an eligible customer rate before sending the new quote.")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={creatingCustomerQuote} onClick={() => setPendingCustomerChange(null)}>{t("Keep current quote")}</Button>
            <Button type="button" disabled={creatingCustomerQuote} onClick={() => void createQuoteForDifferentCustomer()}>
              {creatingCustomerQuote ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {t(creatingCustomerQuote ? "Creating quote…" : "Create separate quote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={newVersionDialogOpen} onOpenChange={(open) => { if (!creatingVersion) setNewVersionDialogOpen(open) }}>
        <DialogContent className="rounded-[var(--md-radius-2xl)] sm:max-w-[560px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("Create a new quote version")}</DialogTitle>
            <DialogDescription>{t("Choose how to start the next working draft. Nothing becomes part of the customer history until it is submitted.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={creatingVersion}
              className="group rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 text-start shadow-[var(--md-shadow-line)] outline-none transition-[background,box-shadow,transform] duration-200 hover:bg-[var(--md-field-bg-hover)] hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none motion-reduce:active:scale-100"
              onClick={() => void createNewQuoteVersion("copy")}
            >
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
                {creatingVersion ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Copy className="size-4" strokeWidth={1.4} aria-hidden="true" />}
              </span>
              <span className="mt-3 block text-[13px] font-medium text-[var(--md-ink)]">{t("Copy this version")}</span>
              <span className="mt-1 block text-[11.5px] leading-[1.55] text-[var(--md-subtle)]">{t("Carry its routing, cargo, charges and terms into the next editable draft.")}</span>
            </button>
            <button
              type="button"
              disabled={creatingVersion}
              className="group rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 text-start shadow-[var(--md-shadow-line)] outline-none transition-[background,box-shadow,transform] duration-200 hover:bg-[var(--md-field-bg-hover)] hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none motion-reduce:active:scale-100"
              onClick={() => void createNewQuoteVersion("blank")}
            >
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                {creatingVersion ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileText className="size-4" strokeWidth={1.4} aria-hidden="true" />}
              </span>
              <span className="mt-3 block text-[13px] font-medium text-[var(--md-ink)]">{t("Start mostly blank")}</span>
              <span className="mt-1 block text-[11.5px] leading-[1.55] text-[var(--md-subtle)]">{t("Keep the customer, owner and quote identity, then rebuild the operational and price details.")}</span>
            </button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={creatingVersion} onClick={() => setNewVersionDialogOpen(false)}>{t("Cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={issueDialogOpen} onOpenChange={(open) => { if (!issuing && !issueRefining) setIssueDialogOpen(open) }}>
        <DialogContent
          dir={direction}
          className="max-h-[calc(100dvh-24px)] overflow-y-auto rounded-[var(--md-radius-2xl)] sm:max-w-none"
          style={{ width: "min(880px, calc(100vw - 32px))", maxWidth: "880px" }}
        >
          <DialogHeader className="text-start">
            <DialogTitle>{t(quoteHasAcceptedHistory ? "Resend quote to customer" : "Send quote to customer")}</DialogTitle>
            <DialogDescription>{t(quoteHasAcceptedHistory ? "This sends the latest saved information and price as a new quote version. The customer's next response becomes the current outcome." : issueDeliveryMode === "standard" ? "Send a branded quote email with a secure response link and PDF." : "Send a short plain email with the quote PDF attached.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-1.5 shadow-[var(--md-shadow-line)]">
            <div className="min-w-0 px-1.5 text-start">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Email style")}</p>
              <p className="text-[11px] text-[var(--md-subtle)]">{t(issueDeliveryMode === "standard" ? "Branded and fully presented" : "Short and direct")}</p>
            </div>
            <SegmentedControl
              options={quoteDeliveryModes}
              value={issueDeliveryMode}
              onChange={changeIssueDeliveryMode}
              ariaLabel={t("Quote email style")}
              disabled={issuing || issueDraftLoading || issueRefining}
              renderOption={(mode) => t(mode === "standard" ? "Standard" : "Simple")}
              className="shrink-0"
            />
          </div>
          <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] sm:items-start">
            <div className="grid min-w-0 content-start gap-4">
              {issueReadinessLoading ? (
                <div role="status" className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2 text-[12px] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
                  {t("Checking quote readiness…")}
                </div>
              ) : issueReadiness && !issueReadiness.ready ? (
                <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_10%,var(--md-surface))] px-3 py-3 shadow-[var(--md-shadow-line)]">
                  <p className="text-[12px] font-medium text-[var(--md-amber-strong)]">{t("Complete these fields before sending")}</p>
                  <ul className="mt-2 grid gap-1 text-[12px] text-[var(--md-text)]">
                    {issueReadiness.missing.map((item) => <li key={item}>• {t(item)}</li>)}
                  </ul>
                </div>
              ) : null}

              <label className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
                {t("From")}
                <Select value={issueMailboxId} onValueChange={setIssueMailboxId} disabled={issuing || issueRefining || issueReadinessLoading || !issueMailboxes.length}>
                  <SelectTrigger className="h-11 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]">
                    <SelectValue placeholder={t("Choose a connected mailbox that can send email.")} />
                  </SelectTrigger>
                  <SelectContent>
                    {issueMailboxes.map((mailbox) => (
                      <SelectItem key={mailbox.id} value={mailbox.id}>
                        <span className="flex min-w-0 items-center gap-2">
                          <MailProviderMark provider={mailbox.provider} />
                          <span className="truncate text-[12px] text-[var(--md-ink)]" data-i18n-skip dir="ltr">{mailbox.address}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <div className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
                <label htmlFor="quote-recipient-email">{t("Send to")}</label>
                <Popover open={issueRecipientSuggestionsOpen} onOpenChange={setIssueRecipientSuggestionsOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                      <Input
                        id="quote-recipient-email"
                        name="quote-recipient-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={issueRecipientEmail}
                        dir="ltr"
                        aria-invalid={Boolean(issueRecipientEmail.trim() && !resolvedIssueRecipient)}
                        aria-describedby="quote-recipient-email-hint"
                        placeholder={t(issueReadinessLoading ? "Loading company contacts…" : "Choose a contact or enter an email")}
                        disabled={issuing || issueRefining || issueReadinessLoading}
                        className="h-11 ps-9 text-base sm:text-[13px]"
                        onFocus={() => setIssueRecipientSuggestionsOpen(true)}
                        onChange={(event) => updateIssueRecipientEmail(event.target.value)}
                        onBlur={() => window.setTimeout(() => { prepareTypedIssueRecipient(); setIssueRecipientSuggestionsOpen(false) }, 120)}
                        data-i18n-skip
                      />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] rounded-[var(--md-radius-xl)] p-1.5" onOpenAutoFocus={(event) => event.preventDefault()}>
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{t("Company contacts")}</p>
                    <div className="max-h-52 overflow-y-auto">
                      {issueRecipients.map((recipient) => (
                        <button key={recipient.key} type="button" className="flex w-full items-center gap-2 rounded-[var(--md-radius-lg)] px-2 py-2 text-start transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]" onMouseDown={(event) => event.preventDefault()} onClick={() => changeIssueRecipient(recipient)}>
                          <Mail className="size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                          <span className="min-w-0"><span className="block truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{recipient.name}</span><span className="block truncate text-[11px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{recipient.email}</span></span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <span id="quote-recipient-email-hint" className={cn("text-[10.5px] font-normal leading-4", issueRecipientEmail.trim() && !resolvedIssueRecipient ? "text-[var(--md-red)]" : "text-[var(--md-subtle)]")}>{t(issueRecipientEmail.trim() && !resolvedIssueRecipient ? "Enter a valid customer email address." : selectedIssueRecipient ? "Saved company contact" : resolvedIssueRecipient?.source === "manual" ? "This address is used for this send only. Saved quote and CRM contact details will not change." : "Select a saved contact or type any valid email address.")}</span>
              </div>

              <label className="grid gap-1.5 text-start text-[12px] font-medium text-[var(--md-text)]">
                {t("Subject")}
                <Input value={issueEmailSubject} onChange={(event) => setIssueEmailSubject(event.target.value)} maxLength={200} disabled={issuing || issueDraftLoading || issueRefining} data-i18n-skip />
              </label>

              <div className="grid gap-2">
                <label htmlFor="quote-issue-email-body" className="text-start text-[12px] font-medium text-[var(--md-text)]">{t("Email body")}</label>
                <div className="relative">
                  <AnimatePresence initial={false}>
                    {issueDeliveryMode === "standard" && issueBodySelection && issueSelectionAnchor ? (
                      <motion.div
                        key={`${issueBodySelection.start}-${issueBodySelection.end}`}
                        role="group"
                        aria-label={t("Selected text actions")}
                        style={{ left: issueSelectionAnchor.left, top: issueSelectionAnchor.top }}
                        className={cn(
                          "absolute z-20 -translate-x-1/2 -translate-y-full rounded-full bg-[var(--md-surface-tint)] p-1 text-[var(--md-text)] shadow-[var(--md-shadow-lift)]",
                          issueRefinementOpen && issueRefinementSelection ? "w-[360px] max-w-[calc(100%_-_16px)]" : "w-auto",
                        )}
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3, scale: 0.98, filter: "blur(3px)" }}
                        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
                        onPointerDown={(event) => { if (!(issueRefinementOpen && issueRefinementSelection)) event.preventDefault() }}
                      >
                        {issueRefinementOpen && issueRefinementSelection ? (
                          <form
                            className="flex h-10 w-full items-center gap-1.5 px-1"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void performIssueRefinement(issueRefinementInstruction, issueRefinementSelection)
                            }}
                          >
                            <AiBeautify className="ms-1 size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} aria-hidden="true" />
                            <input
                              value={issueRefinementInstruction}
                              onChange={(event) => setIssueRefinementInstruction(event.target.value.slice(0, 800))}
                              disabled={issueRefining}
                              aria-label={t("Ask Dexter to refine the selected text")}
                              placeholder={t("How should this selection change?")}
                              className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-normal text-[var(--md-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--md-text)_70%,transparent)] disabled:opacity-70 sm:text-[13px]"
                              autoFocus
                            />
                            <button type="button" disabled={issueRefining} aria-label={t("Close refinement")} title={t("Close refinement")} onClick={closeIssueRefinement} className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none">
                              <X className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </button>
                            <button type="submit" disabled={issueRefining || !issueRefinementInstruction.trim()} aria-label={t("Refine selected text")} title={t("Refine selected text")} className="md-dexter-pill grid size-8 shrink-0 place-items-center rounded-full text-white shadow-[var(--md-shadow-line)] transition-[opacity,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100">
                              {issueRefining ? <WandSparkles className="size-3.5 animate-pulse motion-reduce:animate-none" strokeWidth={1.6} aria-hidden="true" /> : <Send className="size-3.5 rtl:-scale-x-100" strokeWidth={1.6} aria-hidden="true" />}
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => openIssueRefinement(issueBodySelection)} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] motion-reduce:transition-none">
                              <AiBeautify className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                              {t("Ask for changes")}
                            </button>
                            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[color-mix(in_srgb,var(--md-ink)_8%,transparent)]" />
                            <button type="button" aria-label={t("Make shorter")} title={t("Make shorter")} disabled={issueRefining} onClick={() => void performIssueRefinement("Make the selected text shorter without losing any facts or meaning.", issueBodySelection)} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none">
                              <Scissors className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </button>
                            <button type="button" aria-label={t("Make clearer")} title={t("Make clearer")} disabled={issueRefining} onClick={() => void performIssueRefinement("Make the selected text clearer and more direct without changing its facts or meaning.", issueBodySelection)} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none">
                              <WandSparkles className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </button>
                            <button type="button" aria-label={t("Change tone")} title={t("Change tone")} disabled={issueRefining} onClick={() => openIssueRefinement(issueBodySelection, "Make this sound ")} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none">
                              <Type className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <Textarea
                    ref={issueBodyEditorRef}
                    id="quote-issue-email-body"
                    value={issueEmailBody}
                    onChange={(event) => {
                      setIssueEmailBody(event.target.value)
                      setIssueBodySelection(null)
                      setIssueSelectionAnchor(null)
                    }}
                    onSelect={updateIssueBodySelection}
                    onKeyUp={updateIssueBodySelection}
                    onMouseUp={updateIssueBodySelection}
                    onScroll={updateIssueBodySelection}
                    maxLength={6000}
                    disabled={issuing || issueDraftLoading || issueRefining}
                    className={cn("resize-y rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] leading-5 shadow-[var(--md-shadow-line)]", issueDeliveryMode === "simple" ? "min-h-[150px]" : "min-h-[220px]")}
                    data-i18n-skip
                  />
                </div>
                {issueDeliveryMode === "standard" ? <AiPromptMorph
                  id="quote-issue-email-refinement"
                  open={issueRefinementOpen && issueRefinementSelection === null}
                  value={issueRefinementInstruction}
                  busy={issueRefining}
                  busyLabel={t("Refining draft…")}
                  placeholder={t("How should this draft change?")}
                  triggerLabel={t("Edit email draft")}
                  inputLabel={t("Ask Dexter to refine this draft")}
                  closeLabel={t("Close refinement")}
                  submitLabel={t("Refine draft")}
                  submitDisabled={!issueRefinementInstruction.trim()}
                  maxLength={800}
                  onOpenChange={(open) => open ? openIssueRefinement(null) : closeIssueRefinement()}
                  onValueChange={setIssueRefinementInstruction}
                  onSubmit={() => void performIssueRefinement(issueRefinementInstruction, null)}
                /> : <p className="text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Simple emails stay short and unbranded. Edit the wording directly before sending.")}</p>}
              </div>

              {issueDeliveryMode === "standard" ? <fieldset className="grid gap-2">
                <legend className="text-start text-[12px] font-medium text-[var(--md-text)]">{t("Link expires after")}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {quoteIssueExpiryPresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={issueExpiryPreset === preset.value}
                      disabled={issuing || issueRefining}
                      onClick={() => setIssueExpiryPreset(preset.value)}
                      className={cn(
                        "h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,transform] hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.98] motion-reduce:transition-none",
                        issueExpiryPreset === preset.value && "bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]",
                      )}
                    >
                      {t(preset.label)}
                    </button>
                  ))}
                </div>
              </fieldset> : <p className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2 text-start text-[10.5px] leading-4 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">{t("Simple emails do not include customer response controls. Record the outcome with Mark won or Mark lost in Multideck.")}</p>}

              <div className="flex items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><FileText className="size-4" strokeWidth={1.4} aria-hidden="true" /></span>
                <span className="min-w-0 text-start"><span className="block text-[12px] font-medium text-[var(--md-ink)]">{t("Quote PDF")}</span><span className="block text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Generated from this saved quote and attached automatically.")}</span></span>
                <StatusPill kind="attribute" tone="neutral" className="ms-auto shrink-0">{t("Ready to attach")}</StatusPill>
              </div>

              {issueEmailError ? <p role="alert" className="text-[12px] leading-5 text-[var(--md-red)]">{t(issueEmailError)}</p> : null}
              {issueReadiness?.warnings.length ? (
                <ul className="grid gap-1 text-[11px] text-[var(--md-subtle)]">
                  {issueReadiness.warnings.map((warning) => <li key={warning}>{t(warning)}</li>)}
                </ul>
              ) : null}
            </div>

            <section aria-labelledby="quote-email-preview-heading" className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h2 id="quote-email-preview-heading" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Live email preview")}</h2>
                  <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t(issueDeliveryMode === "standard" ? "This is the branded email the customer will receive." : "This is the plain email the customer will receive.")}</p>
                </div>
                {issuePreviewLoading ? <span role="status" className="text-[11px] text-[var(--md-accent)]">{t("Updating preview…")}</span> : null}
              </div>
              {issueEmailPreviewHtml ? (
                <iframe
                  title={t("Branded Multideck quote email preview")}
                  sandbox=""
                  srcDoc={issueEmailPreviewHtml}
                  className="h-[min(64dvh,690px)] min-h-[500px] w-full rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)]"
                />
              ) : (
                <div className="grid min-h-[500px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] px-6 text-center shadow-[var(--md-shadow-line)]">
                  <div>
                    <Mail className="mx-auto size-5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                    <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(issueDraftLoading ? "Preparing email preview…" : "Choose a recipient to preview the email")}</p>
                  </div>
                </div>
              )}
            </section>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={issuing || issueRefining} onClick={() => setIssueDialogOpen(false)}>{t("Cancel")}</Button>
            <Button
              type="button"
              disabled={!issueReadiness?.ready || issueReadinessLoading || !resolvedIssueRecipient || !issueMailboxId || !issueEmailSubject.trim() || !issueEmailBody.trim() || !issueEmailPreviewHtml || issuing || issueDraftLoading || issuePreviewLoading || issueRefining}
              onClick={() => void issueQuoteToCustomer()}
              className={cn(
                "transition-[background-color,color,transform] motion-reduce:transition-none",
                issueDeliveryState === "sent" && "bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)] hover:bg-[var(--md-status-green-bg)] disabled:opacity-100",
              )}
            >
              {issueDeliveryState === "sent" ? <CheckCircle2 className="size-4" strokeWidth={1.6} aria-hidden="true" /> : <Send className="size-4" strokeWidth={1.4} aria-hidden="true" />}
              {t(issueDeliveryState === "sent" ? "Quote sent" : issuing ? "Sending…" : quoteHasAcceptedHistory ? "Resend secure quote" : "Send secure quote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={winDialogOpen} onOpenChange={(open) => { if (!transitioning) setWinDialogOpen(open) }}>
        <DialogContent className="rounded-[var(--md-radius-2xl)] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("Mark this quote won?")}</DialogTitle>
            <DialogDescription>{t("This records customer acceptance against the latest submitted version and creates or updates its booking. An unsubmitted working draft is never applied.")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-status-green-bg)] px-3 py-3 text-start shadow-[var(--md-shadow-line)]">
            <p className="text-[12px] font-medium text-[var(--md-status-green-ink)]">{t("Booking source")}: <span data-i18n-skip dir="ltr">{t(latestSubmittedVersionLabel)}</span></p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--md-text)]">{t("The quote remains Accepted. Any newer working draft stays editable and separate until it is submitted and accepted.")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={transitioning} onClick={() => setWinDialogOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" disabled={transitioning || !latestSubmittedVersion} className="bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)] hover:bg-[color-mix(in_srgb,var(--md-status-green-bg)_82%,var(--md-green))]" onClick={() => void markQuoteWon()}>
              {transitioning ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 className="size-4" />}
              {t(transitioning ? "Creating booking…" : "Mark won and create booking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={lossDialogOpen} onOpenChange={(open) => { if (!transitioning) setLossDialogOpen(open) }}>
        <DialogContent className="rounded-[var(--md-radius-2xl)] sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("Why was this quote lost?")}</DialogTitle>
            <DialogDescription>{t("Choose the main reason. This will be saved to the quote history and used in conversion reporting.")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {quoteLossReasons.map((reason) => (
              <Button
                key={reason}
                type="button"
                variant="ghost"
                aria-pressed={lossReason === reason}
                className={cn("h-auto min-h-10 justify-start whitespace-normal rounded-[var(--md-radius-lg)] px-3 py-2 text-start text-[12px] shadow-[var(--md-shadow-line)]", lossReason === reason && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]")}
                onClick={() => setLossReason(reason)}
              >
                {t(reason)}
              </Button>
            ))}
          </div>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            <span>{t(lossReason === "Other" ? "Reason" : "Additional detail (optional)")}</span>
            <Textarea value={lossDetails} onChange={(event) => setLossDetails(event.target.value)} placeholder={t("Add useful context for the commercial team")} className="min-h-24 rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={transitioning} onClick={() => setLossDialogOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" disabled={!lossReason || (lossReason === "Other" && !lossDetails.trim()) || transitioning} className="bg-[var(--md-red)] text-white hover:bg-[var(--md-red-strong)]" onClick={() => void markQuoteLost()}>
              {t(transitioning ? "Saving…" : "Mark quote lost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DexterDockedPage>
  )
}
