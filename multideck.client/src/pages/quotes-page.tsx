import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { useReducedMotion } from "motion/react"
import {
  BrainCircuit,
  CheckCircle2,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  Gauge,
  Info,
  ListChecks,
  Maximize2,
  MoreHorizontal,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Sparkles,
  Route,
  Search,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { PaperDocumentFace, type TrayDocument } from "@/components/multideck/paper-tray"
import { AuditTimeline } from "@/components/multideck/audit-timeline"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"
import { quoteAuditEvents, systemPeople, type StatusTone } from "@/data/multideck-data"

type QuoteParty = {
  label: string
  code: string
  name: string
  address: string[]
  tone?: StatusTone
}

type QuoteCurrency = "GBP" | "USD" | "EUR" | "JPY" | "AUD" | "CAD"
type QuoteWorkspaceTab = "overview" | "details" | "charges" | "documents" | "audit"

type JobRoe = {
  currency: Exclude<QuoteCurrency, "GBP">
  baseRate: number
  costRate: number
  revenueRate: number
}

type QuoteCharge = {
  code: string
  description: string
  creditor: string
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
  department: string
  internalNotes?: string
  additionalDetail?: string
}

type SavedPartyAddress = {
  id: string
  address: string
  type: "Main office" | "Collection address" | "Delivery address"
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
  agentReference?: string
  carrierReference?: string
  docsStatus?: string
  workflow?: string
  revisionReason?: string
  customer: string
  clientCode?: string
  customerAddress?: string
  customerContact?: string
  customerEmail?: string
  shipperCode?: string
  shipperName?: string
  shipperAddress?: string
  shipperContact?: string
  shipperAddressOverride?: string
  collectionAddress?: string
  consigneeCode?: string
  consigneeName?: string
  consigneeAddress?: string
  consigneeAddressOverride?: string
  deliveryAddress?: string
  route: string
  mode: string
  container: string
  incoterm: string
  incotermPlace?: string
  origin: string
  destination: string
  via: string
  startDate?: string
  endDate?: string
  validity: string
  direction?: string
  serviceLevel?: string
  rateSource?: string
  hblMode?: string
  transitDays?: string
  frequency?: string
  shipmentType?: string
  carrier?: string
  carrierOffice?: string
  supplier?: string
  supplierOffice?: string
  branch?: string
  department?: string
  salesRep?: string
  opsRep?: string
  jobStatus?: string
  goodsValue?: string
  insuranceValue?: string
  entries?: string
  invoiceLines?: string
  commodity?: string
  co2e?: string
  knownCargo?: string
  fmcTid?: string
  margin: string
  profit: number
  cost: number
  revenue: number
  currency: string
  baseRoe?: number
  costRoe?: number
  revenueRoe?: number
  jobRoes?: JobRoe[]
  details?: Record<string, string>
}

type QuotePageVariant = "operator" | "ai" | "cargowise"

const initialSavedPartyAddresses: SavedPartyAddress[] = [
  {
    id: "harbourworks-main",
    address: "RIVERGATE WORKS, BRISTOL, UNITED KINGDOM",
    type: "Main office",
  },
  {
    id: "harbourworks-collection",
    address: "RIVERGATE WORKS, NORTH QUAY INDUSTRIAL ESTATE, BRISTOL, UNITED KINGDOM",
    type: "Collection address",
  },
  {
    id: "kobe-delivery",
    address: "KOBE DISTRIBUTION CENTRE, PORT ISLAND, KOBE, JAPAN",
    type: "Delivery address",
  },
]

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
    opsRep: "OP2",
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
    customer: "Cedar & Loom Trading",
    route: "Singapore to Southampton",
    mode: "Sea FCL",
    container: "2 x 40HC",
    incoterm: "FOB",
    origin: "SGSIN",
    destination: "GBSOU",
    via: "Direct",
    validity: "10 Jan to 24 Jan",
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
    customer: "Asterline Components",
    route: "Dubai to Heathrow",
    mode: "Air",
    container: "4 pallets",
    incoterm: "DAP",
    origin: "DXB",
    destination: "LHR",
    via: "Direct",
    validity: "Today",
    margin: "Pending",
    profit: 0,
    cost: 0,
    revenue: 0,
    currency: "GBP",
  },
]

const salesRepresentativeOptions = systemPeople
  .filter((person) => person.roles.includes("sales"))
  .map((person) => `${person.code} - ${person.name}`)

function salesRepresentativeValue(salesRep = "AM1") {
  return salesRepresentativeOptions.find((option) => option.startsWith(`${salesRep} - `))
    ?? salesRepresentativeOptions[0]
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

const quoteDocuments: TrayDocument[] = [
  {
    id: "quote-customer-pdf",
    name: "Customer quote PDF",
    kind: "sample",
    mimeType: "application/pdf",
    sizeLabel: "184 KB",
    addedAt: "Ready now",
    reference: "Q-19158",
    sampleType: "invoice",
    accent: "teal",
  },
  {
    id: "quote-shipment-definition",
    name: "Shipment definition",
    kind: "sample",
    mimeType: "application/pdf",
    sizeLabel: "96 KB",
    addedAt: "Quote source",
    reference: "SEA FCL",
    sampleType: "bill-of-lading",
    accent: "blue",
  },
  {
    id: "quote-container-detail",
    name: "Container detail",
    kind: "sample",
    mimeType: "application/pdf",
    sizeLabel: "72 KB",
    addedAt: "Equipment",
    reference: "1 x 40HC",
    sampleType: "inspection",
    accent: "amber",
  },
]

const carriers = [
  { code: "BWO", name: "Bluewave Ocean", service: "Singapore relay", days: "55" },
  { code: "MSL", name: "Meridian Sea Lines", service: "Asia loop", days: "58" },
]

const quoteStages = [
  { label: "Draft/WIP", state: "done", color: "#0e7d74", summary: "Core quote details and customer requirements are being prepared." },
  { label: "Rating", state: "done", color: "#4a7d9c", summary: "Supplier costs and customer selling rates are being built." },
  { label: "Review", state: "current", color: "#dd8a2b", summary: "Commercial margin, completeness, and risk are being checked." },
  { label: "Sent", state: "todo", color: "#7d667f", summary: "The customer copy has been issued and is awaiting a response." },
  { label: "Followed-up", state: "todo", color: "#b56d7c", summary: "Sales follow-up is active and customer feedback is being recorded." },
  { label: "Won/Lost", state: "todo", color: "#5f7f68", summary: "The final outcome and decision reason are captured for reporting." },
]

const recentQuotes = [
  { date: "07 Jul", lane: "Bristol -> Kobe", mode: "Sea FCL", revenue: 1566.42, cost: 1312.96, profit: 253.46, margin: "16.18%", status: "Pending", tone: "amber" },
  { date: "06 Jul", lane: "Felixstowe -> Singapore", mode: "Sea LCL", revenue: 842.0, cost: 661.5, profit: 180.5, margin: "21.44%", status: "Won", tone: "green" },
  { date: "06 Jul", lane: "Manchester -> Dubai", mode: "Air", revenue: 1240.0, cost: 1098.2, profit: 141.8, margin: "11.44%", status: "Pending", tone: "amber" },
  { date: "05 Jul", lane: "Leeds -> Rotterdam", mode: "Road", revenue: 695.0, cost: 522.4, profit: 172.6, margin: "24.83%", status: "Won", tone: "green" },
  { date: "05 Jul", lane: "Glasgow -> Hamburg", mode: "Sea FCL", revenue: 1890.0, cost: 1718.0, profit: 172.0, margin: "9.10%", status: "Lost", tone: "red" },
  { date: "04 Jul", lane: "Cardiff -> Valencia", mode: "Road", revenue: 940.0, cost: 746.25, profit: 193.75, margin: "20.61%", status: "Won", tone: "green" },
  { date: "04 Jul", lane: "London -> New York", mode: "Air", revenue: 2115.0, cost: 1844.2, profit: 270.8, margin: "12.80%", status: "Pending", tone: "amber" },
  { date: "03 Jul", lane: "Liverpool -> Osaka", mode: "Sea FCL", revenue: 2760.0, cost: 2295.7, profit: 464.3, margin: "16.82%", status: "Won", tone: "green" },
  { date: "03 Jul", lane: "Birmingham -> Milan", mode: "Road", revenue: 780.0, cost: 731.4, profit: 48.6, margin: "6.23%", status: "Lost", tone: "red" },
  { date: "02 Jul", lane: "Southampton -> Auckland", mode: "Sea LCL", revenue: 1125.0, cost: 928.0, profit: 197.0, margin: "17.51%", status: "Won", tone: "green" },
] satisfies Array<{
  date: string
  lane: string
  mode: string
  revenue: number
  cost: number
  profit: number
  margin: string
  status: string
  tone: StatusTone
}>

function money(value: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value)
}

function moneyWhole(value: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

function formatLocation(code: string, location: string) {
  return code.trim() ? `${code} - ${location}` : ""
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

function shipmentTypeValue(mode: string, value?: string) {
  const options = shipmentTypeOptions(mode)
  return value && options.includes(value) ? value : options[0]
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
        tone === "green" ? "bg-[rgba(14,125,116,0.11)] text-[var(--md-green)]" : tone === "amber" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" : tone === "red" ? "bg-[rgba(209,78,78,0.11)] text-[var(--md-red)]" : "bg-[rgba(74,125,156,0.12)] text-[var(--md-blue)]",
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

function QuoteOverviewSignals({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const successScore = 68
  const needleAngle = -90 + (successScore / 100) * 180

  return (
    <div className={cn("grid gap-2", compact ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]" : "xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]")}>
      <Surface padding="none" className="md-quote-stage-panel rounded-[var(--md-radius-xl)] p-2">
        <div className="md-quote-stage-panel__header">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase leading-3 tracking-[0.02em] text-[var(--md-subtle)]">{t("Quote stage")}</p>
            <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
              <p className="truncate text-[13px] font-medium leading-4 text-[var(--md-ink)]">{t("Commercial review")}</p>
              <span className="truncate text-[10px] text-[var(--md-subtle)]">{t("Rates complete")}</span>
            </div>
          </div>
          <span className="md-quote-stage-panel__count" data-i18n-skip>3 / 6</span>
        </div>
        <div className="md-quote-stage-panel__steps" role="list" aria-label={t("Quote progress")}>
          {quoteStages.map((stage) => (
            <div
              key={stage.label}
              className="md-quote-stage-panel__step"
              data-state={stage.state}
              role="listitem"
              aria-current={stage.state === "current" ? "step" : undefined}
              style={{ "--md-quote-stage-color": stage.color } as CSSProperties}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={`${t(stage.label)}: ${t(stage.summary)}`}>
                    <span className="md-quote-stage-panel__rail"><i /></span>
                    <p>{t(stage.label)}</p>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8} className="md-quote-stage-tooltip">
                  <strong>{t(stage.label)}</strong>
                  <span>{t(stage.summary)}</span>
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="none" className="relative overflow-hidden rounded-[var(--md-radius-xl)] bg-[#061b17] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_rgba(3,31,26,0.12),0_10px_22px_rgba(4,42,35,0.18)]">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <SpectralBloomShader />
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(2,13,11,0.08),rgba(1,9,8,0.34))]" />
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase leading-3 tracking-[0.02em] text-white/68"><Sparkles className="size-3 text-white/85" strokeWidth={1.5} />{t("AI temperature")}</p>
            <p className="mt-0.5 text-[13px] font-medium text-white">{successScore}% {t("likely to win")}</p>
          </div>
          <StatusPill tone="amber" className="border-0 bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">{t("Warm")}</StatusPill>
        </div>
        <div className="relative z-10 mx-auto h-[58px] w-full overflow-hidden">
          <svg viewBox="0 0 220 124" className="h-full w-full" role="img" aria-label={t("AI quote likelihood gauge")}>
            <defs>
              <linearGradient id="quote-temperature-gradient" x1="30" y1="104" x2="190" y2="104" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--md-blue)" />
                <stop offset="34%" stopColor="var(--md-green)" />
                <stop offset="68%" stopColor="var(--md-amber)" />
                <stop offset="100%" stopColor="var(--md-red)" />
              </linearGradient>
            </defs>
            <path className="md-quote-temperature-gradient" d="M 30 104 A 80 80 0 0 1 190 104" fill="none" stroke="url(#quote-temperature-gradient)" strokeWidth="14" strokeLinecap="round" />
            <g style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: "110px 104px" }}>
              <line x1="110" y1="104" x2="110" y2="40" stroke="white" strokeWidth="4" strokeLinecap="round" />
              <circle cx="110" cy="104" r="8" fill="white" stroke="rgba(2,13,11,0.72)" strokeWidth="3" />
            </g>
          </svg>
          <DotLottieReact
            src="/animations/fire.lottie"
            autoplay={!reduceMotion}
            loop={!reduceMotion}
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

function getRecentQuoteIntelligence() {
  const wonQuotes = recentQuotes.filter((quote) => quote.status === "Won")
  const lostQuotes = recentQuotes.filter((quote) => quote.status === "Lost")
  const pendingQuotes = recentQuotes.filter((quote) => quote.status === "Pending")
  const wonRevenue = wonQuotes.reduce((sum, quote) => sum + quote.revenue, 0)
  const wonCost = wonQuotes.reduce((sum, quote) => sum + quote.cost, 0)
  const wonProfit = wonQuotes.reduce((sum, quote) => sum + quote.profit, 0)
  const wonMargin = wonRevenue > 0 ? (wonProfit / wonRevenue) * 100 : 0
  const lostMargin = lostQuotes.length > 0
    ? lostQuotes.reduce((sum, quote) => sum + Number.parseFloat(quote.margin), 0) / lostQuotes.length
    : 0
  const targetRevenue = wonRevenue > 0 ? wonRevenue / wonQuotes.length : 0
  const targetCost = wonCost > 0 ? wonCost / wonQuotes.length : 0
  const targetProfit = targetRevenue - targetCost

  return {
    wonCount: wonQuotes.length,
    lostCount: lostQuotes.length,
    pendingCount: pendingQuotes.length,
    winRate: `${Math.round((wonQuotes.length / recentQuotes.length) * 100)}%`,
    wonMargin: `${wonMargin.toFixed(1)}%`,
    lostMargin: `${lostMargin.toFixed(1)}%`,
    targetRevenue,
    targetCost,
    targetProfit,
  }
}

function ClientPricingIntelligence() {
  const { t } = useLanguage()
  const intelligence = getRecentQuoteIntelligence()
  const metrics = [
    ["Historical win rate", intelligence.winRate, `${intelligence.wonCount} won / ${intelligence.lostCount} lost / ${intelligence.pendingCount} pending`, "Price position", "Current sell is inside the recent won range.", "text-[clamp(30px,2.4vw,36px)]", false],
    ["Won price band", `${moneyWhole(intelligence.targetRevenue - 180)}–${moneyWhole(intelligence.targetRevenue + 180)}`, `${intelligence.wonMargin} average won margin`, "Customer focus", "Prioritise sea FCL and road lanes.", "text-[clamp(20px,1.45vw,22px)]", false],
    ["Suggested pitch", money(intelligence.targetRevenue), `${money(intelligence.targetCost)} cost / ${money(intelligence.targetProfit)} profit`, "Margin warning", `Lost quotes averaged ${intelligence.lostMargin} margin.`, "text-[clamp(28px,2.2vw,34px)]", false],
    ["AI win likelihood", "68%", "Lane, price and history signal", "AI confidence", "Modelled from customer quote history, current margin, and route fit.", "text-[clamp(28px,2.2vw,34px)]", true],
    ["Price confidence", "84%", "Inside the recent won range", "How this is scored", "Confidence rises when the proposed sell remains inside this customer's accepted price band.", "text-[clamp(28px,2.2vw,34px)]", true],
    ["Margin headroom", moneyWhole(intelligence.targetProfit), "Above estimated carrier cost", "AI margin view", `Suggested sell leaves ${money(intelligence.targetProfit)} above the estimated carrier cost.`, "text-[clamp(26px,2vw,32px)]", true],
  ] as const

  return (
    <div className="grid h-full gap-1.5 sm:grid-cols-3">
        {metrics.map(([label, value, detail, infoTitle, infoDetail, valueSize, isAi]) => (
          <div key={label} className="relative flex min-h-[96px] min-w-0 flex-col justify-between overflow-hidden rounded-[var(--md-radius-lg)] bg-[#061b17] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_rgba(3,31,26,0.12),0_10px_22px_rgba(4,42,35,0.18)]">
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
                {isAi ? <Sparkles className="size-3 shrink-0 text-white/85" strokeWidth={1.5} /> : null}
                <span className="truncate">{t(label)}</span>
              </p>
              <p data-i18n-skip dir="ltr" className={cn("mt-1 whitespace-nowrap font-medium leading-[1.08] tracking-[-0.035em] tabular-nums text-white", valueSize)}>{value}</p>
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

function RecentQuotesSummary() {
  const { t } = useLanguage()

  return (
    <Table className="h-full bg-transparent">
      <TableHeader>
        <TableRow className="bg-[var(--md-surface-tint)] hover:bg-[var(--md-surface-tint)]">
          {["Date", "Origin -> Dest", "Mode", "Revenue", "Cost", "Profit", "Profit %", "Status"].map((heading) => (
            <TableHead key={heading} className="h-5 px-1 text-[9px] font-medium text-[var(--md-text)]">{t(heading)}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recentQuotes.slice(0, 5).map((quote) => (
          <TableRow key={`${quote.date}-${quote.lane}-${quote.mode}`} className="hover:bg-[var(--md-hover)]">
            <TableCell data-i18n-skip dir="ltr" className="px-1 py-0.5 text-[9.5px] font-medium text-[var(--md-subtle)]">{quote.date}</TableCell>
            <TableCell data-i18n-skip dir="ltr" className="min-w-[106px] px-1 py-0.5 text-[9.5px] font-medium text-[var(--md-ink)]">{quote.lane}</TableCell>
            <TableCell className="px-1 py-0.5 text-[9.5px] text-[var(--md-text)]">{t(quote.mode)}</TableCell>
            <TableCell data-i18n-skip dir="ltr" className="px-1 py-0.5 text-right text-[9.5px] tabular-nums text-[var(--md-ink)]">{money(quote.revenue)}</TableCell>
            <TableCell data-i18n-skip dir="ltr" className="px-1 py-0.5 text-right text-[9.5px] tabular-nums text-[var(--md-text)]">{money(quote.cost)}</TableCell>
            <TableCell data-i18n-skip dir="ltr" className="px-1 py-0.5 text-right text-[9.5px] font-medium tabular-nums text-[var(--md-ink)]">{money(quote.profit)}</TableCell>
            <TableCell data-i18n-skip dir="ltr" className="px-1 py-0.5 text-right text-[9.5px] tabular-nums text-[var(--md-text)]">{quote.margin}</TableCell>
            <TableCell className="px-1 py-0.5 text-right"><StatusPill tone={quote.tone} className="h-4 px-1.5 text-[9px]">{t(quote.status)}</StatusPill></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
            <QuoteField label="Direction" value={quote.direction ?? ""} editable={editable} required invalid={validationAttempted && !quote.direction?.trim()} options={["Export", "Import", "Domestic", "Cross trade"]} onChange={(value) => onQuoteChange("direction", value)} />
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
        className={cn("h-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]", numeric && "text-right tabular-nums", className)}
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
  toolbarLeading,
}: {
  charges: QuoteCharge[]
  side: ChargePanelSide
  customer: string
  editable: boolean
  onChargeChange: (index: number, field: QuoteChargeEditableField, value: string) => void
  onAddCharge: () => void
  onRemoveCharge: (index: number) => void
  toolbarLeading?: ReactNode
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
      defaultPinned: true,
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
      defaultPinned: true,
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
        toolbarLeading={toolbarLeading}
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

  const chargeViewControls = (
    <>
      <Tabs value={chargeView} onValueChange={(value) => setChargeView(value as "split" | "tabs")}>
        <TabsList className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-0.5 shadow-[var(--md-shadow-line)]">
          <TabsTrigger value="split" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-[var(--md-surface)] data-[state=active]:shadow-[var(--md-shadow-line)]">{t("Side by side")}</TabsTrigger>
          <TabsTrigger value="tabs" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-[var(--md-surface)] data-[state=active]:shadow-[var(--md-shadow-line)]">{t("Tabbed")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {chargeView === "split" ? <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" onClick={() => setIsSplitFullscreen(true)} className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] p-0 text-white shadow-[var(--md-shadow-line)] hover:opacity-90" aria-label={t("Expand charge workspace")}>
            <Maximize2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("Expand charge workspace")}</TooltipContent>
      </Tooltip> : (
        <Tabs value={activeChargeSide} onValueChange={(value) => setActiveChargeSide(value as ChargePanelSide)}>
          <TabsList className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-0.5 shadow-[var(--md-shadow-line)]">
            <TabsTrigger value="in" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-[var(--md-surface)] data-[state=active]:shadow-[var(--md-shadow-line)]">{t("Supplier")}</TabsTrigger>
            <TabsTrigger value="out" className="h-7 rounded-[var(--md-radius-md)] px-2.5 text-[11px] data-[state=active]:bg-[var(--md-surface)] data-[state=active]:shadow-[var(--md-shadow-line)]">{t("Customer")}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </>
  )

  const splitChargeWorkspace = (
    <div className={cn("md-charge-split-workspace min-w-0", isSplitFullscreen && "md-charge-split-workspace--fullscreen")}>
      <div
        ref={splitWorkspaceRef}
        className={cn("md-charge-split-workspace__panes", isSplitResizing && "md-charge-split-workspace__panes--resizing")}
        style={{ "--md-charge-split-position": `${splitRatio}%` } as CSSProperties}
      >
        <ChargeSidePanel charges={charges} side="in" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} toolbarLeading={chargeViewControls} />
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
            <div key={metric.label} className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_rgba(14,125,116,0.1),0_8px_18px_rgba(14,125,116,0.16)]">
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
          <TabsContent value="in" className="mt-0 min-w-0"><ChargeSidePanel charges={charges} side="in" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} toolbarLeading={chargeViewControls} /></TabsContent>
          <TabsContent value="out" className="mt-0 min-w-0"><ChargeSidePanel charges={charges} side="out" customer={customer} editable={editable} onChargeChange={onChargeChange} onAddCharge={onAddCharge} onRemoveCharge={onRemoveCharge} toolbarLeading={chargeViewControls} /></TabsContent>
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
          <SectionHeader title="AI quote command" meta="Fast read on commercial readiness." />
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
            <DenseFact label="Direction" value={quote.direction ?? "Export"} detail={`${quote.branch} / ${quote.department}`} />
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
        <Surface padding="xs" className="rounded-[var(--md-radius-md)] bg-[linear-gradient(135deg,rgba(14,125,116,0.13),rgba(255,255,255,0.86)_42%,rgba(74,125,156,0.12))]">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill tone="blue">AI modern</StatusPill>
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
          <SectionHeader title="AI checks" meta="Signal, not a price build-up." />
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
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()

  return (
    <div className={cn(
      "md-cargowise-field grid min-w-0 items-center",
      compact
        ? compactLabel === "content"
          ? "grid-cols-[max-content_minmax(0,1fr)] gap-1"
          : compactLabel === "tight"
            ? "grid-cols-[44px_minmax(0,1fr)] gap-1"
          : "grid-cols-[64px_minmax(0,1fr)] gap-1"
        : "grid-cols-[var(--md-field-label-width)_minmax(0,1fr)] gap-1.5",
      span && "md:col-span-2",
    )}>
      <span className={cn("min-w-0 whitespace-normal break-words text-[11px] font-medium leading-[1.15] text-[var(--md-text)]", compactLabel === "content" ? "text-start" : "text-end")}>{t(label)}</span>
      {editable ? <input
        data-i18n-skip
        dir="auto"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn(
          "min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[11px] font-medium text-[var(--md-ink)] outline-none shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
          compact ? "min-h-7 px-1.5 py-1 leading-5" : "min-h-8 px-2 py-1.5 leading-5",
          fitValue && "w-fit max-w-full",
        )}
      /> : <span data-i18n-skip dir="auto" className={cn(
        "min-w-0 truncate rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
        compact
          ? compactPadding === "square"
            ? "min-h-7 p-1 leading-5"
            : "min-h-7 px-1.5 py-1 leading-5"
          : "min-h-8 px-2 py-1.5 leading-5",
        fitValue && "w-fit max-w-full",
      )}>{value || "—"}</span>}
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
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()
  const Icon = action === "date" ? CalendarDays : action === "more" ? MoreHorizontal : Search

  return (
    <div className={cn(
      "grid min-w-0 items-center",
      compact ? "grid-cols-[64px_minmax(0,1fr)_28px] gap-1" : "grid-cols-[var(--md-field-label-width)_minmax(0,1fr)_32px] gap-1.5",
      span && "md:col-span-2",
    )}>
      <span className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</span>
      {editable ? (
        <input
          data-i18n-skip
          dir="auto"
          value={value}
          maxLength={maxLength}
          required={required}
          aria-required={required}
          aria-invalid={invalid || undefined}
          placeholder={required ? t("Required") : undefined}
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            "min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[11px] font-medium text-[var(--md-ink)] outline-none shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
            compact ? "min-h-7 px-1.5 py-1 leading-5" : "min-h-8 px-2 py-1.5 leading-5",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        />
      ) : (
        <span data-i18n-skip dir="auto" className={cn(
          "min-w-0 truncate rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          compact ? "min-h-7 px-1.5 py-1 leading-5" : "min-h-8 px-2 py-1.5 leading-5",
          invalid && "ring-1 ring-[var(--md-red)]",
        )}>
          {value || "—"}
        </span>
      )}
      <Button type="button" variant="ghost" disabled={!editable} className={cn("rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-0 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]", compact ? "size-7" : "size-8")} aria-label={t(`Search ${label}`)}>
        <Icon className="size-3.5" strokeWidth={1.4} />
      </Button>
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
  onChange,
}: {
  label: string
  value: string
  options: string[]
  span?: boolean
  compact?: boolean
  required?: boolean
  invalid?: boolean
  editable?: boolean
  dataOptions?: boolean
  action?: ReactNode
  onChange?: (value: string) => void
}) {
  const { t } = useLanguage()

  return (
    <div className={cn(
      "grid min-w-0 items-center",
      compact
        ? action ? "grid-cols-[64px_minmax(0,1fr)_28px] gap-1" : "grid-cols-[64px_minmax(0,1fr)] gap-1"
        : action ? "grid-cols-[var(--md-field-label-width)_minmax(0,1fr)_32px] gap-1.5" : "grid-cols-[var(--md-field-label-width)_minmax(0,1fr)] gap-1.5",
      span && "md:col-span-2",
    )}>
      <span className="min-w-0 whitespace-normal break-words text-end text-[11px] font-medium leading-[1.15] text-[var(--md-text)]">{t(label)}</span>
      <Select value={value} onValueChange={onChange} required={required} disabled={!editable}>
        <SelectTrigger
          data-i18n-skip={dataOptions || undefined}
          dir={dataOptions ? "auto" : undefined}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          className={cn(
            "w-full min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
            compact ? "h-7 px-1.5 text-[10.5px]" : "h-8 px-2 text-[11px]",
            invalid && "ring-1 ring-[var(--md-red)]",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
          {options.map((option) => (
            <SelectItem key={option} value={option} data-i18n-skip={dataOptions || undefined} dir={dataOptions ? "auto" : undefined} className="text-[12px]">
              {dataOptions ? option : t(option)}
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
  compact = false,
  className,
  contentClassName,
}: {
  title: string
  children: ReactNode
  headerAction?: ReactNode
  compact?: boolean
  className?: string
  contentClassName?: string
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("h-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", compact ? "p-2" : "p-2.5", className)}>
      <div className={cn("flex min-w-0 items-center justify-between gap-2", compact ? "mb-1.5" : "mb-2")}>
        <h3 className="min-w-0 text-[12px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h3>
        {headerAction}
      </div>
      <div className={cn("grid", compact ? "gap-1.5" : "gap-2", contentClassName)}>{children}</div>
    </section>
  )
}

function QuoteCargoWiseOverviewPanel({ quote }: { quote: QuoteRecord }) {
  return (
    <div className="md-quote-cargowise-overview grid gap-2">
      <QuoteOverviewSignals compact />

      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr]">
        <CargoWiseGroup title="Quote header" compact>
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Type" value={quote.quoteType ?? "Local client"} compact />
            <CargoWiseField label="Source" value={quote.source ?? "NEW - New Shipper"} compact />
            <CargoWiseField label="Client" value={`${quote.clientCode ?? ""} / ${quote.customer}`} fitValue compact />
            <CargoWiseField label="Local ref" value={quote.localRef ?? "SPQ-74218"} compact />
            <CargoWiseField label="Start date" value={quote.startDate ?? ""} compact />
            <CargoWiseField label="End date" value={quote.endDate ?? ""} compact />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="Routing" compact>
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Transport" value="SEA - Sea Freight" compact />
            <CargoWiseField label="Container" value="FCL - Full Container Load" compact />
            <CargoWiseField label="Incoterm" value={`${quote.incoterm} - Delivered At Place`} span compact />
            <CargoWiseField label="Origin" value={formatLocation(quote.origin, "Bristol")} compact compactPadding="square" />
            <CargoWiseField label="Destination" value={formatLocation(quote.destination, "Kobe")} compact />
            <CargoWiseField label="Via" value={`${quote.via} - Singapore`} compact />
            <CargoWiseField label="Transit" value={`${quote.transitDays ?? "55"} days`} compact />
            <CargoWiseField label="HBL mode" value={quote.hblMode ?? "CY/CFS"} compact />
            <CargoWiseField label="Direction" value={quote.direction ?? "Export"} compact />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="Totals" compact>
          <div className="grid gap-1 md:grid-cols-2">
            <CargoWiseField label="Cost" value={money(quote.cost)} compact compactLabel="tight" />
            <CargoWiseField label="Revenue" value={money(quote.revenue)} compact compactLabel="tight" />
            <CargoWiseField label="Profit" value={money(quote.profit)} compact compactLabel="tight" />
            <CargoWiseField label="Margin" value={quote.margin} compact compactLabel="tight" />
            <CargoWiseField label="Status" value={quote.jobStatus ?? quote.status} span compact compactLabel="tight" />
          </div>
        </CargoWiseGroup>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <ClientPricingIntelligence />
        <RecentQuotesSummary />
      </div>
    </div>
  )
}

function QuoteCargoWiseDetailsPanel({
  quote,
  editable,
  validationAttempted,
  onQuoteChange,
  onCustomerCreate,
}: {
  quote: QuoteRecord
  editable: boolean
  validationAttempted: boolean
  onQuoteChange: (field: keyof QuoteRecord, value: string) => void
  onCustomerCreate: (name: string, code: string) => void
}) {
  const { direction, t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerCode, setNewCustomerCode] = useState("")
  const [savedPartyAddresses, setSavedPartyAddresses] = useState<SavedPartyAddress[]>(initialSavedPartyAddresses)
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [addressDialogTarget, setAddressDialogTarget] = useState<"collection" | "delivery">("collection")
  const [newSavedAddress, setNewSavedAddress] = useState("")
  const [newSavedAddressType, setNewSavedAddressType] = useState<SavedPartyAddress["type"]>("Collection address")
  const selectedCarrier = quote.carrier && carrierOfficeOptions[quote.carrier] ? quote.carrier : carrierOptions[0]
  const selectedCarrierOffices = carrierOfficeOptions[selectedCarrier]
  const selectedCarrierOffice = quote.carrierOffice && selectedCarrierOffices.includes(quote.carrierOffice) ? quote.carrierOffice : selectedCarrierOffices[0]
  const selectedSupplier = quote.supplier && supplierOfficeOptions[quote.supplier] ? quote.supplier : supplierOptions[0]
  const selectedSupplierOffices = supplierOfficeOptions[selectedSupplier]
  const selectedSupplierOffice = quote.supplierOffice && selectedSupplierOffices.includes(quote.supplierOffice) ? quote.supplierOffice : selectedSupplierOffices[0]

  function updateCarrier(company: string) {
    onQuoteChange("carrier", company)
    onQuoteChange("carrierOffice", carrierOfficeOptions[company][0])
  }

  function updateSupplier(company: string) {
    onQuoteChange("supplier", company)
    onQuoteChange("supplierOffice", supplierOfficeOptions[company][0])
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

  const addressesFor = (target: "collection" | "delivery") => savedPartyAddresses
    .filter(({ type }) => type === "Main office" || type === (target === "collection" ? "Collection address" : "Delivery address"))
    .map(({ address }) => address)

  function changeMode(mode: string) {
    onQuoteChange("mode", mode)
    const nextShipmentType = shipmentTypeValue(mode, quote.shipmentType)
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
      <TooltipContent>{t("Add saved address")}</TooltipContent>
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
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`${t("Address override")}: ${t(party)}`}
            className={cn(
              "group inline-flex h-6 items-center gap-1.5 rounded-[var(--md-radius-sm)] px-1.5 text-[10.5px] font-medium text-[var(--md-subtle)] outline-none transition-[background,color,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
              checked && "bg-[rgba(14,125,116,0.07)] text-[var(--md-ink)]",
            )}
            onClick={() => onQuoteChange(field, checked ? "No" : "Yes")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-3.5 shrink-0 scale-[0.92] place-items-center rounded-[4px] bg-[var(--md-surface)] text-white shadow-[var(--md-shadow-line)] transition-[background,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                checked && "scale-100 bg-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_0_0_3px_rgba(14,125,116,0.11),0_2px_5px_rgba(14,125,116,0.16)]",
              )}
            >
              <svg viewBox="0 0 16 16" className="size-2.5" fill="none" aria-hidden="true">
                <path
                  d="M3.5 8.25 6.5 11l6-6.25"
                  pathLength="1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1"
                  strokeDashoffset={checked ? 0 : 1}
                  style={{
                    opacity: checked ? 1 : 0,
                    transition: reduceMotion ? "none" : "stroke-dashoffset 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease-out",
                  }}
                />
              </svg>
            </span>
            <span>{t("Override address")}</span>
          </button>
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
              <CargoWiseLookupField label="Customer ref" value={quote.localRef ?? "SPQ-74218"} action="more" compact editable={editable} onChange={(value) => onQuoteChange("localRef", value)} />
              <CargoWiseSelectField label="Status" value={quote.workflowStatus ?? "WRK - Working"} options={["DRF - Draft/WIP", "RTG - Rating", "REV - Review", "SNT - Sent", "FLW - Followed-up", "WRK - Working"]} compact editable={editable} onChange={(value) => onQuoteChange("workflowStatus", value)} />
              <CargoWiseLookupField label="Valid from" value={quote.startDate ?? "08 Jan 2026"} action="date" compact editable={editable} onChange={(value) => onQuoteChange("startDate", value)} />
              <CargoWiseLookupField label="Valid to" value={quote.endDate ?? "31 Jan 2026"} action="date" compact editable={editable} onChange={(value) => onQuoteChange("endDate", value)} />
              <CargoWiseSelectField label="Source" value={quote.source ?? "NEW - New Shipper"} options={["NEW - New Shipper", "REN - Renewal", "REP - Repeat lane", "TND - Tender"]} compact editable={editable} onChange={(value) => onQuoteChange("source", value)} />
              <CargoWiseSelectField label="Mode" value={quote.mode} options={cargoWiseModeOptions} compact editable={editable} required invalid={validationAttempted && !quote.mode.trim()} onChange={changeMode} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Ownership")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseLookupField label="Branch" value={quote.branch ?? "BR1"} compact editable={editable} onChange={(value) => onQuoteChange("branch", value)} />
              <CargoWiseLookupField label="Dept" value={quote.department ?? "SEA"} compact editable={editable} onChange={(value) => onQuoteChange("department", value)} />
              <CargoWiseSelectField
                label="Sales rep"
                value={salesRepresentativeValue(quote.salesRep)}
                options={salesRepresentativeOptions}
                compact
                editable={editable}
                dataOptions
                onChange={(value) => onQuoteChange("salesRep", value.split(" - ", 1)[0])}
              />
              <CargoWiseSelectField label="Priority" value={quote.priority ?? "Standard"} options={["Low", "Standard", "High", "Tender"]} compact editable={editable} onChange={(value) => onQuoteChange("priority", value)} />
              <CargoWiseSelectField label="Hold reason" value={quote.holdReason ?? "None"} options={["None", "Missing carrier", "Missing consignee", "Margin review", "Credit check"]} compact editable={editable} onChange={(value) => onQuoteChange("holdReason", value)} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("References")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseLookupField label="Customer PO" value={quote.customerPO ?? "PO-48319"} compact editable={editable} onChange={(value) => onQuoteChange("customerPO", value)} />
              <CargoWiseLookupField label="Shipper ref" value={quote.shipperReference ?? "HW-SEA-1184"} compact editable={editable} onChange={(value) => onQuoteChange("shipperReference", value)} />
              <CargoWiseLookupField label="Agent ref" value={quote.agentReference ?? "Pending"} compact editable={editable} onChange={(value) => onQuoteChange("agentReference", value)} />
              <CargoWiseLookupField label="Carrier ref" value={quote.carrierReference ?? "Pending"} compact editable={editable} onChange={(value) => onQuoteChange("carrierReference", value)} />
              <CargoWiseSelectField label="Docs" value={quote.docsStatus ?? "Draft"} options={["Draft", "Ready", "Sent", "Signed"]} compact editable={editable} onChange={(value) => onQuoteChange("docsStatus", value)} />
              <CargoWiseSelectField label="Workflow" value={quote.workflow ?? "Review"} options={["Draft/WIP", "Rating", "Review", "Sent", "Followed-up", "Won", "Lost"]} compact editable={editable} onChange={(value) => onQuoteChange("workflow", value)} />
            </div>
          </div>
        </div>
      </CargoWiseGroup>

      <section>
        <div className="grid items-stretch gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-3">
          <CargoWiseGroup
            title="Customer"
            contentClassName="min-[1700px]:grid-cols-2"
            headerAction={(
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]"
                    aria-label={t("Create customer")}
                    onClick={openCustomerDialog}
                  >
                    <Plus className="size-3.5" strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("Create customer")}</TooltipContent>
              </Tooltip>
            )}
          >
            <div className="grid min-w-0 gap-2 min-[1700px]:col-span-2 min-[1700px]:grid-cols-[210px_minmax(0,1fr)]">
              <CargoWiseLookupField label="Code" value={quote.clientCode ?? "HWSBRI"} maxLength={12} editable={editable} onChange={(value) => onQuoteChange("clientCode", value)} />
              <CargoWiseField label="Name" value={quote.customer} editable={editable} onChange={(value) => onQuoteChange("customer", value)} />
            </div>
            <CargoWiseField label="Address" value={quote.customerAddress ?? "RIVERGATE WORKS, BRISTOL, UNITED KINGDOM"} span editable={editable} onChange={(value) => onQuoteChange("customerAddress", value)} />
            <CargoWiseLookupField label="Contact" value={quote.customerContact ?? "Nora Vale - Logistics Lead"} editable={editable} onChange={(value) => onQuoteChange("customerContact", value)} />
            <CargoWiseField label="Email" value={quote.customerEmail ?? "rates@harbourworks.example"} editable={editable} onChange={(value) => onQuoteChange("customerEmail", value)} />
          </CargoWiseGroup>

          <CargoWiseGroup title="Shipper" contentClassName="min-[1700px]:grid-cols-2" headerAction={partyHeaderActions("Shipper")}>
            <div className="grid min-w-0 gap-2 min-[1700px]:col-span-2 min-[1700px]:grid-cols-[210px_minmax(0,1fr)]">
              <CargoWiseLookupField label="Code" value={quote.shipperCode ?? "HWSBRI"} maxLength={12} editable={editable} onChange={(value) => onQuoteChange("shipperCode", value)} />
              <CargoWiseField label="Name" value={quote.shipperName ?? "HarbourWorks Safety"} editable={editable} onChange={(value) => onQuoteChange("shipperName", value)} />
            </div>
            <CargoWiseField
              label="Address"
              value={quote.shipperAddress ?? "RIVERGATE WORKS, NORTH QUAY INDUSTRIAL ESTATE"}
              span
              editable={quote.shipperAddressOverride === "Yes"}
              onChange={(value) => onQuoteChange("shipperAddress", value)}
            />
            <CargoWiseLookupField label="Contact" value={quote.shipperContact ?? "Dispatch desk"} editable={editable} onChange={(value) => onQuoteChange("shipperContact", value)} />
            <CargoWiseSelectField
              label="Collection"
              value={quote.collectionAddress ?? "RIVERGATE WORKS, NORTH QUAY INDUSTRIAL ESTATE, BRISTOL, UNITED KINGDOM"}
              options={addressesFor("collection")}
              editable={editable}
              dataOptions
              action={addAddressAction("collection")}
              onChange={(value) => onQuoteChange("collectionAddress", value)}
            />
          </CargoWiseGroup>

          <CargoWiseGroup title="Consignee" contentClassName="min-[1700px]:grid-cols-2" headerAction={partyHeaderActions("Consignee")}>
            <div className="grid min-w-0 gap-2 min-[1700px]:col-span-2 min-[1700px]:grid-cols-[210px_minmax(0,1fr)]">
              <CargoWiseLookupField label="Code" value={quote.consigneeCode ?? "Not selected"} maxLength={12} editable={editable} onChange={(value) => onQuoteChange("consigneeCode", value)} />
              <CargoWiseField label="Name" value={quote.consigneeName ?? "No organisation selected"} editable={editable} onChange={(value) => onQuoteChange("consigneeName", value)} />
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
            {quote.consigneeCode === "Not selected" ? <CargoWiseField label="Action" value="Add consignee before customer copy" span /> : null}
            <CargoWiseSelectField
              label="Delivery"
              value={quote.deliveryAddress ?? "KOBE DISTRIBUTION CENTRE, PORT ISLAND, KOBE, JAPAN"}
              options={addressesFor("delivery")}
              editable={editable}
              dataOptions
              action={addAddressAction("delivery")}
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
                value={shipmentTypeValue(quote.mode, quote.shipmentType)}
                options={shipmentTypeOptions(quote.mode)}
                editable={editable}
                onChange={(value) => onQuoteChange("shipmentType", value)}
              />
              <div className="grid min-w-0 gap-1 md:col-span-2 md:grid-cols-2 xl:col-span-2">
                <CargoWiseSelectField label="Incoterms" value={quote.incoterm} options={["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"]} editable={editable} required invalid={validationAttempted && !quote.incoterm.trim()} onChange={(value) => onQuoteChange("incoterm", value)} />
                <CargoWiseField label="Named place" value={quote.incotermPlace ?? ""} editable={editable} onChange={(value) => onQuoteChange("incotermPlace", value)} />
              </div>
              <CargoWiseSelectField label="HBL mode" value={quote.hblMode ?? "CY/CFS"} options={["CY/CFS", "CY/CY", "CFS/CFS", "Door/Door"]} editable={editable} onChange={(value) => onQuoteChange("hblMode", value)} />
              <CargoWiseLookupField label="From" value={quote.origin} editable={editable} required invalid={validationAttempted && !quote.origin.trim()} onChange={(value) => onQuoteChange("origin", value)} />
              <CargoWiseLookupField label="To" value={quote.destination} editable={editable} required invalid={validationAttempted && !quote.destination.trim()} onChange={(value) => onQuoteChange("destination", value)} />
              <CargoWiseLookupField label="Via" value={quote.via} editable={editable} onChange={(value) => onQuoteChange("via", value)} />
              <CargoWiseField label="Transit" value={quote.transitDays ?? "55"} editable={editable} onChange={(value) => onQuoteChange("transitDays", value)} />
              <CargoWiseSelectField label="Frequency" value={quote.frequency ?? "0 - Ad hoc"} options={["0 - Ad hoc", "1 - Weekly", "2 - Twice weekly", "3 - Daily"]} editable={editable} onChange={(value) => onQuoteChange("frequency", value)} />
              <CargoWiseSelectField label="Direction" value={quote.direction ?? ""} options={["Export", "Import", "Domestic", "Cross trade"]} editable={editable} required invalid={validationAttempted && !quote.direction?.trim()} onChange={(value) => onQuoteChange("direction", value)} />
              <CargoWiseSelectField label="Currency" value={quote.currency} options={["GBP", "EUR", "USD"]} editable={editable} required invalid={validationAttempted && !quote.currency.trim()} onChange={(value) => onQuoteChange("currency", value)} />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <h4 className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Carrier & supplier")}</h4>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CargoWiseSelectField label="Carrier" value={selectedCarrier} options={carrierOptions} editable={editable} dataOptions onChange={updateCarrier} />
              <CargoWiseSelectField label="Carrier office" value={selectedCarrierOffice} options={selectedCarrierOffices} editable={editable} dataOptions onChange={(value) => onQuoteChange("carrierOffice", value)} />
              <CargoWiseSelectField label="Supplier" value={selectedSupplier} options={supplierOptions} editable={editable} dataOptions onChange={updateSupplier} />
              <CargoWiseSelectField label="Supplier office" value={selectedSupplierOffice} options={selectedSupplierOffices} editable={editable} dataOptions onChange={(value) => onQuoteChange("supplierOffice", value)} />
              <CargoWiseSelectField label="Rate source" value={quote.rateSource ?? "Manual"} options={["Manual", "Tariff", "Carrier portal", "Historic quote"]} editable={editable} onChange={(value) => onQuoteChange("rateSource", value)} />
              <CargoWiseSelectField label="Service level" value={quote.serviceLevel ?? "Not selected"} options={["Not selected", "Economy", "Standard", "Express"]} editable={editable} onChange={(value) => onQuoteChange("serviceLevel", value)} />
            </div>
          </div>
        </div>
      </CargoWiseGroup>

      <CargoWiseGroup title="Goods">
        <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-4">
          <CargoWiseField label="Goods value" value={quote.goodsValue ?? "0.00 GBP"} editable={editable} onChange={(value) => onQuoteChange("goodsValue", value)} />
          <CargoWiseField label="Ins value" value={quote.insuranceValue ?? "0.00 GBP"} editable={editable} onChange={(value) => onQuoteChange("insuranceValue", value)} />
          <CargoWiseLookupField label="Commodity" value={quote.commodity ?? "Not selected"} editable={editable} onChange={(value) => onQuoteChange("commodity", value)} />
          <CargoWiseField label="CO2e" value={quote.co2e ?? "Pending"} editable={editable} onChange={(value) => onQuoteChange("co2e", value)} />
          <CargoWiseField label="Entries" value={quote.entries ?? "1"} editable={editable} onChange={(value) => onQuoteChange("entries", value)} />
          <CargoWiseField label="Lines" value={quote.invoiceLines ?? "1"} editable={editable} onChange={(value) => onQuoteChange("invoiceLines", value)} />
          <CargoWiseSelectField label="Known cargo" value={quote.knownCargo ?? "General merchandise"} options={["General merchandise", "Hazardous", "Temperature controlled", "Oversized"]} editable={editable} onChange={(value) => onQuoteChange("knownCargo", value)} span />
          <CargoWiseSelectField label="FMC TID" value={quote.fmcTid ?? "Not required"} options={["Not required", "Required", "Pending"]} editable={editable} onChange={(value) => onQuoteChange("fmcTid", value)} span />
        </div>
      </CargoWiseGroup>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent
          dir={direction}
          showCloseButton={false}
          className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)] sm:max-w-[420px]"
        >
          <DialogHeader className="text-start">
            <DialogTitle className="text-[16px] font-medium">{t("New customer")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("Create a customer and use it on this quote.")}
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
              {t("Create customer")}
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
            <DialogTitle className="text-[16px] font-medium">{t("Add saved address")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("Save a company address and classify where it can be used.")}
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
              {t("Save address")}
            </Button>
          </DialogFooter>
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
            <CargoWiseSelectField label="Rate mode" value="AI assisted" options={["Manual", "AI assisted", "Tariff", "Historic quote"]} />
            <CargoWiseSelectField label="Margin rule" value="15% minimum" options={["10% minimum", "15% minimum", "20% target", "Pass-through"]} />
            <CargoWiseSelectField label="FX source" value="Live rate" options={["Live rate", "Manual override", "Month-end rate"]} />
            <CargoWiseSelectField label="Approval" value="Required" options={["Not required", "Required", "Approved"]} />
          </div>
        </CargoWiseGroup>

        <CargoWiseGroup title="AI pricing read">
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

function QuoteReferenceCopyLabel({
  reference,
  copiedLabel,
  copied,
  direction,
}: {
  reference: string
  copiedLabel: string
  copied: boolean
  direction: "ltr" | "rtl"
}) {
  const referenceCharacters = Array.from(reference)
  const copiedCharacters = direction === "rtl" ? [copiedLabel] : Array.from(copiedLabel)

  return (
    <span
      aria-hidden="true"
      data-copied={copied}
      data-i18n-skip
      className="md-quote-copy-slot"
    >
      <span className="md-quote-copy-slot__layer md-quote-copy-slot__layer--reference" dir="ltr">
        {referenceCharacters.map((character, index) => (
          <span key={`${character}-${index}`} style={{ "--md-copy-character-index": index } as CSSProperties}>{character}</span>
        ))}
      </span>
      <span className="md-quote-copy-slot__layer md-quote-copy-slot__layer--copied" dir={direction}>
        {copiedCharacters.map((character, index) => (
          <span key={`${character}-${index}`} style={{ "--md-copy-character-index": index } as CSSProperties}>{character}</span>
        ))}
      </span>
    </span>
  )
}

function BookingConfirmationLabel({
  initialLabel,
  confirmationLabel,
  confirming,
  direction,
}: {
  initialLabel: string
  confirmationLabel: string
  confirming: boolean
  direction: "ltr" | "rtl"
}) {
  const initialCharacters = direction === "rtl" ? [initialLabel] : Array.from(initialLabel)
  const confirmationCharacters = direction === "rtl" ? [confirmationLabel] : Array.from(confirmationLabel)

  return (
    <span aria-hidden="true" data-confirming={confirming} className="md-booking-confirm-slot">
      <span className="md-booking-confirm-slot__layer md-booking-confirm-slot__layer--initial" dir={direction}>
        {initialCharacters.map((character, index) => (
          <span key={`${character}-${index}`} style={{ "--md-confirm-character-index": index } as CSSProperties}>{character}</span>
        ))}
      </span>
      <span className="md-booking-confirm-slot__layer md-booking-confirm-slot__layer--confirmation" dir={direction}>
        {confirmationCharacters.map((character, index) => (
          <span key={`${character}-${index}`} style={{ "--md-confirm-character-index": index } as CSSProperties}>{character}</span>
        ))}
      </span>
    </span>
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

  if (activeTab === "charges") {
    return (
      <Surface padding="none" className="flex h-full min-h-[124px] flex-col overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex items-center justify-between gap-3 bg-[var(--md-surface-tint)] px-3 py-1 shadow-[var(--md-shadow-line)]">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Job ROE")}</p>
            <p className="truncate text-[10px] text-[var(--md-subtle)]">{t("Shared exchange rates used by every charge line.")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={onAddJobRoe} disabled={!editable} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10px] shadow-[var(--md-shadow-line)]"><Plus data-icon="inline-start" className="size-3" />{t("Add")}</Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => selectedJobRoe && onRemoveJobRoe(selectedJobRoe)} disabled={!editable || selectedJobRoe === null} className="h-7 rounded-[var(--md-radius-md)] px-2 text-[10px] shadow-[var(--md-shadow-line)]"><Trash2 data-icon="inline-start" className="size-3" />{t("Remove")}</Button>
          </div>
        </div>
        <Table aria-label={t("Job ROE")} className="h-full table-fixed text-[10px]">
          <TableHeader>
            <TableRow className="border-[rgba(11,20,19,0.05)] bg-white hover:bg-white">
              <TableHead className="h-4 w-[18%] px-2 text-[9px] text-[var(--md-text)]">{t("CCY")}</TableHead>
              <TableHead className="h-4 w-[27%] px-2 text-[9px] text-[var(--md-text)]">{t("Base")}</TableHead>
              <TableHead className="h-4 w-[27%] px-2 text-[9px] text-[var(--md-text)]">{t("Cost")}</TableHead>
              <TableHead className="h-4 w-[28%] px-2 text-[9px] text-[var(--md-text)]">{t("Revenue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobRoes.map((roe) => {
              const selected = selectedJobRoe === roe.currency
              return (
                <TableRow key={roe.currency} data-state={selected ? "selected" : undefined} aria-selected={selected || undefined} onClick={() => setSelectedJobRoe(roe.currency)} className="cursor-pointer border-[rgba(11,20,19,0.045)] data-[state=selected]:bg-[color-mix(in_srgb,var(--md-accent)_8%,white)]">
                  <TableCell data-i18n-skip dir="ltr" className="h-7 px-2 py-px font-medium tabular-nums text-[var(--md-ink)]">{roe.currency}</TableCell>
                  <TableCell className="h-7 px-2 py-px"><EditableChargeCell value={roe.baseRate} editable={editable} numeric className="h-7 text-[10px]" onChange={(value) => onJobRoeBaseChange(roe.currency, value)} /></TableCell>
                  <TableCell className="h-7 px-2 py-px"><EditableChargeCell value={roe.costRate} editable={editable} numeric className="h-7 text-[10px]" onChange={(value) => onJobRoeChange(roe.currency, "costRate", value)} /></TableCell>
                  <TableCell className="h-7 px-2 py-px"><EditableChargeCell value={roe.revenueRate} editable={editable} numeric className="h-7 text-[10px]" onChange={(value) => onJobRoeChange(roe.currency, "revenueRate", value)} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Surface>
    )
  }

  const contextByTab: Record<Exclude<QuoteWorkspaceTab, "charges">, { items: Array<[string, string]> }> = {
    overview: {
      items: [["Customer", quote.customer], ["Route", `${formatLocation(quote.origin, "—")} → ${formatLocation(quote.destination, "—")}`], ["Margin", quote.margin], ["Status", quote.jobStatus ?? quote.status]],
    },
    details: {
      items: [["Customer ref", quote.localRef ?? "—"], ["Branch / Dept", `${quote.branch ?? "—"} / ${quote.department ?? "—"}`], ["Sales rep", salesRepresentativeValue(quote.salesRep)], ["Priority", quote.priority ?? "Standard"]],
    },
    documents: {
      items: [["Quote", quote.id], ["Customer", quote.customer], ["Document status", quote.docsStatus ?? "Draft"], ["Workflow", quote.workflow ?? "Review"]],
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

export function QuotesPage({ variant = "operator" }: { variant?: QuotePageVariant }) {
  const { t, direction } = useLanguage()
  const [activeTab, setActiveTab] = useState<QuoteWorkspaceTab>("overview")
  const [savedQuote, setSavedQuote] = useState<QuoteRecord>(quoteQueue[0])
  const [draftQuote, setDraftQuote] = useState<QuoteRecord>(quoteQueue[0])
  const [savedCharges, setSavedCharges] = useState<QuoteCharge[]>(quoteCharges)
  const [draftCharges, setDraftCharges] = useState<QuoteCharge[]>(quoteCharges)
  const [quoteRefCopied, setQuoteRefCopied] = useState(false)
  const [bookingConfirmationPending, setBookingConfirmationPending] = useState(false)
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [dexterOpen, setDexterOpen] = useState(false)
  const quoteCopyResetTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (quoteCopyResetTimerRef.current !== null) window.clearTimeout(quoteCopyResetTimerRef.current)
  }, [])

  const activeCharges = draftCharges
  const activeTotals = useMemo(() => getChargeTotals(activeCharges), [activeCharges])
  const activeQuote = {
    ...draftQuote,
    cost: activeTotals.cost,
    revenue: activeTotals.revenue,
    profit: activeTotals.profit,
    margin: activeTotals.margin,
  }
  const isDirty = JSON.stringify(draftQuote) !== JSON.stringify(savedQuote) || JSON.stringify(draftCharges) !== JSON.stringify(savedCharges)
  const heading = variant === "ai" ? "AI spot quote command" : "Spot quote"
  const missingRequiredFields = [draftQuote.origin, draftQuote.destination, draftQuote.direction, draftQuote.mode, draftQuote.incoterm, draftQuote.currency]
    .filter((value) => !value?.trim()).length

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
    setDraftQuote((current) => {
      const next = { ...current, [field]: value }
      if (field === "origin" || field === "destination") {
        next.route = next.origin.trim() && next.destination.trim() ? `${next.origin.trim()} to ${next.destination.trim()}` : ""
      }
      return next
    })
  }

  function createAndAssignCustomer(name: string, code: string) {
    updateDraftQuote("customer", name)
    updateDraftQuote("clientCode", code)
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

  function saveChanges() {
    if (missingRequiredFields > 0) {
      setValidationAttempted(true)
      return
    }

    const totals = getChargeTotals(draftCharges)
    const nextQuote = {
      ...draftQuote,
      cost: totals.cost,
      revenue: totals.revenue,
      profit: totals.profit,
      margin: totals.margin,
    }

    setSavedQuote(nextQuote)
    setDraftQuote(nextQuote)
    setSavedCharges(draftCharges)
    setValidationAttempted(false)
  }

  function discardChanges() {
    setDraftQuote(savedQuote)
    setDraftCharges(savedCharges)
    setValidationAttempted(false)
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={`${t("Quote")} ${activeQuote.id}`}>
      <main className="min-h-full bg-[var(--md-analytics-bg)] px-4 py-4 sm:px-5">
        <div className="grid w-full gap-2">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as QuoteWorkspaceTab)} className="gap-2">
            <div className="relative">
              <div className="grid items-stretch gap-2 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
                <div className="grid min-w-0 grid-rows-[auto_auto] gap-1.5">
                <section
                  className="flex flex-col gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-3 py-1.5 shadow-[var(--md-shadow-line)] lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between"
                >
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <div className="min-w-0">
              <div className="flex flex-nowrap items-center gap-1.5">
                <h1 className="shrink-0 text-[14px] font-medium leading-5 text-[var(--md-ink)]">{t(heading)}</h1>
                <button
                  type="button"
                  aria-label={t(quoteRefCopied ? "Quote reference copied" : "Copy quote reference")}
                  title={t(quoteRefCopied ? "Copied" : "Copy quote reference")}
                  className="group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.1)] px-2 text-[14px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,transform] duration-200 hover:bg-[rgba(14,125,116,0.16)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] active:scale-[0.985]"
                  onClick={() => void copyQuoteReference()}
                >
                  <QuoteReferenceCopyLabel
                    reference={activeQuote.id}
                    copiedLabel={t("Copied")}
                    copied={quoteRefCopied}
                    direction={direction}
                  />
                  <span aria-hidden="true" className="relative size-3.5 shrink-0">
                    <Copy className={cn("absolute inset-0 size-3.5 transition-[opacity,transform] duration-200", quoteRefCopied ? "scale-75 opacity-0" : "scale-100 opacity-100")} strokeWidth={1.5} />
                    <CheckCircle2 className={cn("absolute inset-0 size-3.5 transition-[opacity,transform] duration-200", quoteRefCopied ? "scale-100 opacity-100" : "scale-75 opacity-0")} strokeWidth={1.7} />
                  </span>
                </button>
                <StatusPill tone={activeQuote.statusTone} className="h-6 shrink-0 px-2 text-[10px]">{activeQuote.status}</StatusPill>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-1">
            {isDirty ? (
              <>
                <Button type="button" variant="ghost" onClick={discardChanges} className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2.5 text-[12px] shadow-[var(--md-shadow-line)]">
                  <RotateCcw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
                  {t("Discard")}
                </Button>
                <Button type="button" onClick={saveChanges} className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                  <Save data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
                  {t("Save")}
                </Button>
              </>
            ) : null}
            <DexterActionPill
              className="h-8 min-w-[102px] rounded-[var(--md-radius-lg)] px-2.5 text-[11px]"
              onClick={() => setDexterOpen(true)}
            />
            <Button type="button" variant="ghost" className="h-8 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2 text-[11px] shadow-[var(--md-shadow-line)]">
              <Printer data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              {t("Print")}
            </Button>
            <Button
              type="button"
              aria-label={t(bookingConfirmationPending ? "Confirm" : "Convert to booking")}
              className="h-8 shrink-0 rounded-[var(--md-radius-lg)] px-2.5 text-[11px]"
              disabled={missingRequiredFields > 0}
              title={missingRequiredFields > 0 ? t("Complete required fields before converting") : undefined}
              onClick={() => setBookingConfirmationPending((pending) => !pending)}
            >
              <span aria-hidden="true" className="relative size-4 shrink-0">
                <Send data-icon="inline-start" className={cn("absolute inset-0 size-4 transition-[opacity,transform] duration-200", bookingConfirmationPending ? "-translate-y-1 scale-75 opacity-0" : "translate-y-0 scale-100 opacity-100")} strokeWidth={1.4} />
                <CheckCircle2 data-icon="inline-start" className={cn("absolute inset-0 size-4 transition-[opacity,transform] duration-200", bookingConfirmationPending ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-75 opacity-0")} strokeWidth={1.7} />
              </span>
              <BookingConfirmationLabel
                initialLabel={t("Convert to booking")}
                confirmationLabel={t("Confirm")}
                confirming={bookingConfirmationPending}
                direction={direction}
              />
            </Button>
          </div>
                </section>
                <Surface
                  padding="none"
                  tone="soft"
                  className="w-full rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]"
                >
                  <TabsList variant="line" className="h-auto gap-1 bg-transparent p-0">
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
                  <TabsTrigger value="audit" className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
                    <Clock3 data-icon="inline-start" className="size-4" strokeWidth={1.3} />
                    {t("Audit")}
                  </TabsTrigger>
                  </TabsList>
                </Surface>
              </div>
                {activeTab !== "charges" ? (
                  <QuoteWorkspaceContext
                    activeTab={activeTab}
                    quote={activeQuote}
                    editable
                    onJobRoeBaseChange={updateJobRoeBase}
                    onAddJobRoe={addJobRoe}
                    onRemoveJobRoe={removeJobRoe}
                    onJobRoeChange={updateJobRoe}
                  />
                ) : null}
              </div>
              {activeTab === "charges" ? (
                <div className="xl:absolute xl:top-0 xl:end-0 xl:h-[169px] xl:w-[calc((100%-0.5rem)*0.3)]">
                  <QuoteWorkspaceContext
                    activeTab={activeTab}
                    quote={activeQuote}
                    editable
                    onJobRoeBaseChange={updateJobRoeBase}
                    onAddJobRoe={addJobRoe}
                    onRemoveJobRoe={removeJobRoe}
                    onJobRoeChange={updateJobRoe}
                  />
                </div>
              ) : null}
            </div>

              <TabsContent value="overview" className="mt-0">
                {variant === "ai" ? <QuoteAiOverviewPanel quote={savedQuote} /> : variant === "cargowise" ? <QuoteCargoWiseOverviewPanel quote={savedQuote} /> : <QuoteOverviewPanel quote={savedQuote} />}
              </TabsContent>
              <TabsContent value="details" className="mt-0">
                {variant === "cargowise" ? <QuoteCargoWiseDetailsPanel quote={activeQuote} editable onQuoteChange={updateDraftQuote} onCustomerCreate={createAndAssignCustomer} validationAttempted={validationAttempted} /> : <QuoteSetupPanel quote={activeQuote} editable onQuoteChange={updateDraftQuote} onJobRoeChange={updateJobRoe} validationAttempted={validationAttempted} />}
              </TabsContent>
              <TabsContent value="charges" className="mt-0">
                <QuoteChargesPanel
                  charges={activeCharges}
                  customer={activeQuote.customer}
                  editable
                  onChargeChange={updateDraftCharge}
                  onAddCharge={addDraftCharge}
                  onRemoveCharge={removeDraftCharge}
                />
              </TabsContent>
              <TabsContent value="documents" className="mt-0">
                <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
                  <SectionHeader title="Document selection" meta="Customer copy, internal costing, and supporting eDocs will live here." />
                  <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(148px,176px))] gap-3">
                    {quoteDocuments.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        aria-label={t(`Preview ${document.name}`)}
                        className="group aspect-square min-w-0 text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
                      >
                        <span className="flex h-full min-h-0 flex-col">
                          <span className="min-h-0 flex-1 overflow-hidden rounded-[var(--md-radius-md)] transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:shadow-[var(--md-shadow-soft)]">
                            <PaperDocumentFace item={document} className="md-quote-document-preview" />
                          </span>
                          <span className="mt-2 block min-w-0 px-0.5">
                            <span className="block truncate text-[11.5px] font-medium text-[var(--md-ink)]">{t(document.name)}</span>
                            <span className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--md-subtle)]">
                              <span>{t(document.addedAt)}</span>
                              <span data-i18n-skip dir="ltr" className="shrink-0">{document.sizeLabel}</span>
                            </span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Surface>
              </TabsContent>
              <TabsContent value="audit" className="mt-0">
                <AuditTimeline
                  events={quoteAuditEvents}
                  description="A live operational history of quote changes, decisions, and next actions."
                />
              </TabsContent>
          </Tabs>
        </div>
      </main>
    </DexterDockedPage>
  )
}
