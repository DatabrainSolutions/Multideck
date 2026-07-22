import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Copy,
  PackageCheck,
  Plus,
  RotateCcw,
  Ship,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MultideckDateRangePicker } from "@/components/multideck/date-picker"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { bookings } from "@/data/multideck-data"
import { cn } from "@/lib/utils"

type BookingSource = "quote" | "scratch" | "existing" | null
type BookingTypeStage = "source" | "movement"
const directionOptions = ["Import", "Export", "Domestic", "Cross Trade"] as const
const standardModeOptions = ["Air", "Sea", "Road", "Courier", "Rail", "Air-Sea", "Sea-Air", "Customs Only", "Documentation Only"] as const
const incotermOptions = [
  { code: "EXW", wording: "Ex Works" },
  { code: "FCA", wording: "Free Carrier" },
  { code: "FAS", wording: "Free Alongside Ship" },
  { code: "FOB", wording: "Free On Board" },
  { code: "CFR", wording: "Cost and Freight" },
  { code: "CIF", wording: "Cost, Insurance and Freight" },
  { code: "CPT", wording: "Carriage Paid To" },
  { code: "CIP", wording: "Carriage and Insurance Paid To" },
  { code: "DAP", wording: "Delivered at Place" },
  { code: "DPU", wording: "Delivered at Place Unloaded" },
  { code: "DDP", wording: "Delivered Duty Paid" },
] as const

type BookingModeOption = (typeof standardModeOptions)[number]
type BookingDirection = (typeof directionOptions)[number]

function normalizeBookingMode(mode: string): BookingModeOption {
  const normalizedModes: Record<string, BookingModeOption> = {
    OCEAN: "Sea",
    SEA: "Sea",
    AIR: "Air",
    ROAD: "Road",
  }

  return normalizedModes[mode.toUpperCase()] ?? (standardModeOptions.find((option) => option === mode) ?? "Sea")
}

type CargoLine = {
  id: string
  commodity: string
  outerPackages: string
  outerPackageType: string
  innerPackages: string
  innerPackageType: string
  grossWeight: string
  netWeight: string
  volume: string
  height: string
  width: string
  depth: string
  dimensions: string
}

type CargoLineDraft = Omit<CargoLine, "id">

type TransportLeg = {
  id: string
  legType: string
  mode: BookingModeOption
  fromCode: string
  fromName: string
  fromCountry: string
  toCode: string
  toName: string
  toCountry: string
  carrier: string
  reference: string
  etd: string
  eta: string
  notes: string
}

type TransportLegDraft = Omit<TransportLeg, "id">

type BookingWizardData = {
  source: BookingSource
  templateBookingId: string
  quoteNumber: string
  quoteCustomer: string
  bookingNumber: string
  bookingCustomer: string
  direction: BookingDirection
  mode: BookingModeOption
  incoterms: string
  incotermsExtra: string
  collectionRequired: boolean
  deliveryRequired: boolean
  customer: string
  customerContact: string
  customerOffice: string
  customerIsShipper: boolean
  customerIsConsignee: boolean
  customerIsNotifyParty: boolean
  customerEmail: string
  shipper: string
  shipperContact: string
  shipperOffice: string
  consignee: string
  consigneeContact: string
  consigneeOffice: string
  consigneeReference: string
  notifyParty: string
  notifyPartyContact: string
  notifyPartyOffice: string
  notifyPartyReference: string
  collectionAddress: string
  collectionAddressManual: boolean
  deliveryAddress: string
  deliveryAddressManual: boolean
  collectionDate: string
  collectionTime: string
  cargoReadyDate: string
  requestedCollectionDate: string
  deliveryDate: string
  deliveryTime: string
  requestedDeliveryDate: string
  cargoRequiredByDate: string
  collectionReference: string
  deliveryReference: string
  accessRestrictions: string
  bookingNotes: string
  goodsDescription: string
  packages: string
  packageType: string
  weight: string
  volume: string
  dimensions: string
  palletInfo: string
  containerInfo: string
  hazardousGoods: boolean
  temperatureControlled: boolean
  fragileOrHighValue: boolean
  stackable: boolean
  perishable: boolean
  cargoSpecialNotes: string
  cargoLines: CargoLine[]
  portOfLoading: string
  portOfDischarge: string
  vessel: string
  voyage: string
  containerType: string
  containerNumber: string
  sealNumber: string
  seaEtd: string
  seaEta: string
  airportDeparture: string
  airportArrival: string
  airline: string
  flightNumber: string
  mawb: string
  hawb: string
  airEtd: string
  airEta: string
  roadCollectionPoint: string
  roadDeliveryPoint: string
  trailerType: string
  vehicleType: string
  driverInstructions: string
  plannedCollectionDate: string
  plannedDeliveryDate: string
  courierService: string
  courierCutoff: string
  courierTracking: string
  transportLegs: TransportLeg[]
  customsStatus: string
  commodityCode: string
  eoriVat: string
  exportBroker: string
  importBroker: string
  registeredExporter: string
  registeredImporter: string
  vatDutyPayment: string
  certificateRequirements: string
  commercialInvoice: boolean
  packingList: boolean
  certificates: boolean
  customsNotes: string
  complianceRequirements: string
  customerReference: string
  internalReference: string
  supplierReference: string
  quoteReference: string
  purchaseOrderReference: string
  agreedCharges: string
  buyingNotes: string
  sellingNotes: string
  operationalNotes: string
}

type WizardStep = {
  id: string
  name: string
  eyebrow: string
  title: string
  summary: string
}

const steps: WizardStep[] = [
  { id: "type", name: "Booking Type", eyebrow: "Step 1", title: "What kind of movement is this?", summary: "Direction, mode, and collection/delivery needs." },
  { id: "parties", name: "Parties", eyebrow: "Step 2", title: "Who is involved?", summary: "Company, contact, and reference for each party." },
  { id: "collection", name: "Collection and Delivery", eyebrow: "Step 3", title: "Where and when does it move?", summary: "Linked addresses, required dates, references, and editable notes." },
  { id: "cargo", name: "Cargo Details", eyebrow: "Step 4", title: "What are we moving?", summary: "Goods, packages, dimensions, risk flags, and equipment." },
  { id: "transport", name: "Transport Details", eyebrow: "Step 5", title: "Which transport details matter?", summary: "Fields change based on the selected booking mode." },
  { id: "customs", name: "Customs and Compliance", eyebrow: "Step 6", title: "Who is handling customs?", summary: "Export/import broker allocation, importer/exporter roles, certificates, compliance, and duty payment." },
  { id: "review", name: "Review and Create", eyebrow: "Step 7", title: "Review before creating", summary: "Check each section, fix missing fields, then create the booking." },
]

const requiredStepCount = steps.length - 1

const today = "2026-06-18"
const tomorrow = "2026-06-19"

const defaultCargoLineDraft: CargoLineDraft = {
  commodity: "",
  outerPackages: "",
  outerPackageType: "Pallets",
  innerPackages: "",
  innerPackageType: "Cartons",
  grossWeight: "",
  netWeight: "",
  volume: "",
  height: "",
  width: "",
  depth: "",
  dimensions: "",
}

const defaultTransportLegDraft: TransportLegDraft = {
  legType: "Main Leg",
  mode: "Sea",
  fromCode: "",
  fromName: "",
  fromCountry: "",
  toCode: "",
  toName: "",
  toCountry: "",
  carrier: "",
  reference: "",
  etd: "",
  eta: "",
  notes: "",
}

function legTypeOptionsForMode(mode: BookingModeOption) {
  if (mode === "Air") return ["Collection", "Main Flight", "Other Flight", "On Carriage", "Delivery"]
  if (mode.includes("Air")) return ["Collection", "Main Leg", "Main Flight", "Other Flight", "Transhipment", "On Carriage", "Delivery"]
  return ["Collection", "Main Leg", "Transhipment", "On Carriage", "Delivery"]
}

function defaultLegTypeForMode(mode: BookingModeOption) {
  return mode === "Air" ? "Main Flight" : "Main Leg"
}

function defaultRouteLegModeForBookingMode(mode: BookingModeOption): BookingModeOption {
  return ["Air", "Sea", "Road", "Courier", "Rail"].includes(mode) ? mode : "Sea"
}

const defaultBooking: BookingWizardData = {
  source: null,
  templateBookingId: "",
  quoteNumber: "",
  quoteCustomer: "",
  bookingNumber: "",
  bookingCustomer: "",
  direction: "Import",
  mode: "Sea",
  incoterms: "",
  incotermsExtra: "",
  collectionRequired: true,
  deliveryRequired: true,
  customer: "",
  customerContact: "",
  customerOffice: "",
  customerIsShipper: false,
  customerIsConsignee: false,
  customerIsNotifyParty: false,
  customerEmail: "",
  shipper: "",
  shipperContact: "",
  shipperOffice: "",
  consignee: "",
  consigneeContact: "",
  consigneeOffice: "",
  consigneeReference: "",
  notifyParty: "",
  notifyPartyContact: "",
  notifyPartyOffice: "",
  notifyPartyReference: "",
  collectionAddress: "",
  collectionAddressManual: false,
  deliveryAddress: "",
  deliveryAddressManual: false,
  collectionDate: today,
  collectionTime: "09:00",
  cargoReadyDate: today,
  requestedCollectionDate: today,
  deliveryDate: tomorrow,
  deliveryTime: "14:00",
  requestedDeliveryDate: tomorrow,
  cargoRequiredByDate: tomorrow,
  collectionReference: "",
  deliveryReference: "",
  accessRestrictions: "",
  bookingNotes: "",
  goodsDescription: "",
  packages: "",
  packageType: "Cartons",
  weight: "",
  volume: "",
  dimensions: "",
  palletInfo: "",
  containerInfo: "",
  hazardousGoods: false,
  temperatureControlled: false,
  fragileOrHighValue: false,
  stackable: false,
  perishable: false,
  cargoSpecialNotes: "",
  cargoLines: [],
  portOfLoading: "",
  portOfDischarge: "",
  vessel: "",
  voyage: "",
  containerType: "40HC",
  containerNumber: "",
  sealNumber: "",
  seaEtd: "",
  seaEta: "",
  airportDeparture: "",
  airportArrival: "",
  airline: "",
  flightNumber: "",
  mawb: "",
  hawb: "",
  airEtd: "",
  airEta: "",
  roadCollectionPoint: "",
  roadDeliveryPoint: "",
  trailerType: "",
  vehicleType: "",
  driverInstructions: "",
  plannedCollectionDate: today,
  plannedDeliveryDate: tomorrow,
  courierService: "",
  courierCutoff: "",
  courierTracking: "",
  transportLegs: [],
  customsStatus: "Not started",
  commodityCode: "",
  eoriVat: "",
  exportBroker: "",
  importBroker: "",
  registeredExporter: "",
  registeredImporter: "",
  vatDutyPayment: "Importer deferment account",
  certificateRequirements: "",
  commercialInvoice: true,
  packingList: true,
  certificates: false,
  customsNotes: "",
  complianceRequirements: "",
  customerReference: "",
  internalReference: "BK-LON-22618",
  supplierReference: "",
  quoteReference: "",
  purchaseOrderReference: "",
  agreedCharges: "",
  buyingNotes: "",
  sellingNotes: "",
  operationalNotes: "",
}

const optionMotion = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}

const stepMotion = {
  initial: { opacity: 0, x: 18, filter: "blur(5px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -18, filter: "blur(5px)" },
}

const fieldListMotion = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.035, delayChildren: 0.03 },
  },
}

const fieldMotion = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}

const bookingStepSurfaceClass = "bg-[var(--md-surface-tint)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.12),0_18px_42px_rgba(14,125,116,0.08)]"
const fieldBoundaryShadow = "shadow-[var(--md-shadow-line)]"
const fieldControlClass = cn("!h-11 w-full min-w-0 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)]", fieldBoundaryShadow)
const fieldPanelClass = "rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 shadow-[inset_0_0_0_1px_rgba(14,125,116,0.13),0_10px_24px_rgba(14,125,116,0.06)]"
const tablePanelClass = "overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.13),0_10px_24px_rgba(14,125,116,0.06)]"

const partyCompanies = [
  {
    name: "Marlow Apparel Ltd",
    contacts: ["Sandra Hale", "Tom Rees", "Warehouse team"],
    offices: ["London billing office", "Manchester buying office", "Felixstowe DC"],
  },
  {
    name: "Northwind GmbH",
    contacts: ["Elena Moreno", "Kai Müller", "Accounts payable"],
    offices: ["Hamburg HQ", "Berlin finance office", "Munich operations"],
  },
  {
    name: "Yong Hua Logistics",
    contacts: ["Wei Chen", "Lina Zhou", "Export desk"],
    offices: ["Shanghai export office", "Ningbo consolidation warehouse", "Yantian port desk"],
  },
  {
    name: "Marlow UK DC",
    contacts: ["Warehouse team", "Receiving desk", "Aisha Patel"],
    offices: ["Felixstowe distribution centre", "Southampton overflow warehouse"],
  },
  {
    name: "Pacific Goods Co",
    contacts: ["Jon Bell", "Lisa Hart", "Operations desk"],
    offices: ["Hamburg office", "Milan delivery depot"],
  },
  {
    name: "Customs broker",
    contacts: ["Broker team", "Wei Chen", "Clearance desk"],
    offices: ["London customs desk", "Shanghai broker handoff", "Rotterdam clearance desk"],
  },
] as const

const partyCompanyOptions = partyCompanies.map((company) => company.name)

const customerQuotes = [
  { id: "QT-10482", customer: "Marlow Apparel Ltd", route: "Yantian -> Felixstowe", detail: "3 x 40HC apparel", status: "Accepted" },
  { id: "QT-10479", customer: "Marlow Apparel Ltd", route: "Ningbo -> Southampton", detail: "LCL outlet replenishment", status: "Pending" },
  { id: "QT-10470", customer: "Marlow Apparel Ltd", route: "Qingdao -> Felixstowe", detail: "2 x 40HC activewear", status: "Accepted" },
  { id: "QT-10461", customer: "Marlow Apparel Ltd", route: "Shanghai -> Felixstowe", detail: "Retail launch cargo", status: "Accepted" },
  { id: "QT-10456", customer: "Northwind GmbH", route: "Shanghai -> Long Beach", detail: "1 x 40HC electronics", status: "Accepted" },
  { id: "QT-10444", customer: "Northwind GmbH", route: "Ningbo -> Hamburg", detail: "Furniture programme", status: "Pending" },
  { id: "QT-10439", customer: "Pacific Goods Co", route: "Hamburg -> Milano", detail: "Road LTL service", status: "Accepted" },
  { id: "QT-10433", customer: "Pacific Goods Co", route: "Shenzhen -> Oakland", detail: "1 x 20GP electronics", status: "Pending" },
  { id: "QT-10421", customer: "Bauhaus Importe GmbH", route: "Ningbo -> Rotterdam", detail: "1 x 40GP homeware", status: "Accepted" },
  { id: "QT-10412", customer: "Atlas Office Supply", route: "Shenzhen -> Hamburg", detail: "20GP office goods", status: "Accepted" },
  { id: "QT-10398", customer: "Black Forest Foods", route: "Frankfurt -> JFK", detail: "Chilled air freight", status: "Accepted" },
  { id: "QT-10382", customer: "Mediterranean Spice Trading", route: "Piraeus -> Marseille", detail: "20GP foodstuffs", status: "Accepted" },
] as const

const contactsByOffice: Record<string, readonly string[]> = {
  "London billing office": ["Sandra Hale", "Accounts team"],
  "Manchester buying office": ["Tom Rees", "Buying desk"],
  "Felixstowe DC": ["Warehouse team", "Receiving desk"],
  "Hamburg HQ": ["Elena Moreno", "Kai Müller"],
  "Berlin finance office": ["Accounts payable", "Elena Moreno"],
  "Munich operations": ["Kai Müller", "Operations desk"],
  "Shanghai export office": ["Wei Chen", "Export desk"],
  "Ningbo consolidation warehouse": ["Lina Zhou", "Warehouse team"],
  "Yantian port desk": ["Export desk", "Wei Chen"],
  "Felixstowe distribution centre": ["Warehouse team", "Receiving desk"],
  "Southampton overflow warehouse": ["Receiving desk", "Aisha Patel"],
  "Hamburg office": ["Jon Bell", "Operations desk"],
  "Milan delivery depot": ["Lisa Hart", "Operations desk"],
  "London customs desk": ["Broker team", "Clearance desk"],
  "Shanghai broker handoff": ["Wei Chen", "Clearance desk"],
  "Rotterdam clearance desk": ["Broker team", "Clearance desk"],
}

function defaultContactForCompany(companyName: string) {
  return partyCompanies.find((company) => company.name === companyName)?.contacts[0] ?? ""
}

function contactsForOffice(companyName: string, officeName: string) {
  if (!officeName) return []
  return contactsByOffice[officeName] ?? partyCompanies.find((company) => company.name === companyName)?.contacts ?? []
}

function officesForCompany(companyName: string) {
  return partyCompanies.find((company) => company.name === companyName)?.offices ?? []
}

function notesForOffice(office: string) {
  const notesByOffice: Record<string, string> = {
    "Shanghai export office": "Collection by appointment only. Driver must quote supplier reference at gate.",
    "Ningbo consolidation warehouse": "Warehouse requires 24h pre-alert and carton count before arrival.",
    "Yantian port desk": "Use terminal booking reference for port-side handoff.",
    "Felixstowe distribution centre": "Book receiving slot before arrival. Tail-lift not required.",
    "Southampton overflow warehouse": "Call receiving desk before dispatch; limited afternoon slots.",
    "London customs desk": "Send documents before cargo arrival and quote internal booking reference.",
  }

  return notesByOffice[office] ?? ""
}

function fullAddressForOffice(office: string) {
  if (!office) return ""

  const addressByOffice: Record<string, string> = {
    "London billing office": "Marlow Apparel Ltd\nLondon billing office\n42 Threadneedle Street\nLondon EC2R 8AH\nUnited Kingdom",
    "Manchester buying office": "Marlow Apparel Ltd\nManchester buying office\n18 Deansgate\nManchester M3 2BY\nUnited Kingdom",
    "Felixstowe DC": "Marlow Apparel Ltd\nFelixstowe DC\nDock Road\nFelixstowe IP11 3SY\nUnited Kingdom",
    "Hamburg HQ": "Northwind GmbH\nHamburg HQ\nAm Sandtorkai 27\n20457 Hamburg\nGermany",
    "Berlin finance office": "Northwind GmbH\nBerlin finance office\nFriedrichstrasse 121\n10117 Berlin\nGermany",
    "Munich operations": "Northwind GmbH\nMunich operations\nLandsberger Strasse 89\n80339 Munich\nGermany",
    "Shanghai export office": "Yong Hua Logistics\nShanghai export office\n88 Yangshan Road\nPudong, Shanghai 200120\nChina",
    "Ningbo consolidation warehouse": "Yong Hua Logistics\nNingbo consolidation warehouse\n18 Beilun Port Road\nNingbo, Zhejiang 315800\nChina",
    "Yantian port desk": "Yong Hua Logistics\nYantian port desk\nYantian International Terminal\nShenzhen, Guangdong 518081\nChina",
    "Felixstowe distribution centre": "Marlow UK DC\nFelixstowe distribution centre\nClickett Hill Road\nFelixstowe IP11 4BA\nUnited Kingdom",
    "Southampton overflow warehouse": "Marlow UK DC\nSouthampton overflow warehouse\nWestern Docks\nSouthampton SO15 1HJ\nUnited Kingdom",
    "Hamburg office": "Pacific Goods Co\nHamburg office\nBrooktorkai 12\n20457 Hamburg\nGermany",
    "Milan delivery depot": "Pacific Goods Co\nMilan delivery depot\nVia Privata Oslavia 4\n20134 Milano MI\nItaly",
    "London customs desk": "Customs broker\nLondon customs desk\n25 King William Street\nLondon EC4R 9AT\nUnited Kingdom",
    "Shanghai broker handoff": "Customs broker\nShanghai broker handoff\n120 Century Avenue\nPudong, Shanghai 200120\nChina",
    "Rotterdam clearance desk": "Customs broker\nRotterdam clearance desk\nWaalhaven Zuidzijde 19\n3089 JH Rotterdam\nNetherlands",
  }

  return addressByOffice[office] ?? office
}

type AddressRecord = {
  office: string
  company: string
  postcode: string
  address: string
}

const addressBook: AddressRecord[] = partyCompanies.flatMap((company) => (
  company.offices.map((office) => {
    const address = fullAddressForOffice(office)
    const postcodeMatch = address.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b|\b\d{5}(?:-\d{4})?\b|\b\d{5}\b|\b\d{6}\b/i)

    return {
      office,
      company: company.name,
      postcode: postcodeMatch?.[0]?.toUpperCase() ?? "",
      address,
    }
  })
))

function addressRecordForOffice(office: string) {
  return addressBook.find((record) => record.office === office)
}

function routeLocationForAddress(address: string) {
  const locationByAddress: Record<string, { code: string; name: string; country: string }> = {
    "Shanghai export office": { code: "CNSHA", name: "Shanghai", country: "China" },
    "Ningbo consolidation warehouse": { code: "CNNGB", name: "Ningbo", country: "China" },
    "Yantian port desk": { code: "CNYTN", name: "Yantian", country: "China" },
    "Felixstowe distribution centre": { code: "GBFXT", name: "Felixstowe", country: "United Kingdom" },
    "Southampton overflow warehouse": { code: "GBSOU", name: "Southampton", country: "United Kingdom" },
    "Hamburg office": { code: "DEHAM", name: "Hamburg", country: "Germany" },
    "Milan delivery depot": { code: "ITMIL", name: "Milan", country: "Italy" },
    "JFK fulfilment centre": { code: "USJFK", name: "New York JFK", country: "United States" },
    "Rotterdam clearance desk": { code: "NLRTM", name: "Rotterdam", country: "Netherlands" },
    "London customs desk": { code: "GBLON", name: "London", country: "United Kingdom" },
  }

  return locationByAddress[address] ?? { code: "", name: address || "", country: "" }
}

function isFilled(value: string) {
  return value.trim().length > 0
}

function getRequiredFields(data: BookingWizardData, stepIndex: number) {
  const fields: Array<[keyof BookingWizardData, string]> = []

  if (stepIndex === 0) {
    if (data.source === "quote") fields.push(["quoteNumber", "Customer quote"])
    if (data.source === "existing") fields.push(["templateBookingId", "Existing booking"])
    fields.push(["direction", "Direction"], ["mode", "Mode"])
  }
  if (stepIndex === 1) fields.push(["customer", "Customer"], ["shipper", "Shipper"], ["consignee", "Consignee"])
  if (stepIndex === 2) fields.push(
    ["collectionAddress", "Collection address"],
    ["deliveryAddress", "Delivery address"],
    ["cargoReadyDate", "Cargo ready from"],
    ["requestedCollectionDate", "Requested collection date"],
    ["requestedDeliveryDate", "Requested delivery date"],
    ["cargoRequiredByDate", "Cargo required by"],
  )
  if (stepIndex === 3) fields.push(["goodsDescription", "Goods description"], ["packages", "Number of packages"], ["weight", "Weight"])
  if (stepIndex === 4) fields.push(["portOfLoading", "First origin"], ["portOfDischarge", "Final destination"])
  if (stepIndex === 4 && data.mode === "Sea") fields.push(["seaEtd", "ETD"], ["seaEta", "ETA"])
  if (stepIndex === 4 && data.mode === "Air") fields.push(["airline", "Airline"], ["airEtd", "ETD"], ["airEta", "ETA"])
  if (stepIndex === 4 && data.mode === "Road") fields.push(["vehicleType", "Vehicle type"], ["plannedCollectionDate", "Planned collection date"])
  if (stepIndex === 4 && data.mode === "Courier") fields.push(["courierService", "Courier service"], ["courierCutoff", "Cut-off"], ["courierTracking", "Tracking preference"])
  if (stepIndex === 5) fields.push(["exportBroker", "Export broker"], ["importBroker", "Import broker"], ["registeredExporter", "Registered exporter"], ["registeredImporter", "Registered importer"], ["vatDutyPayment", "VAT and duty payment"])
  return fields
}

function missingFieldsForStep(data: BookingWizardData, stepIndex: number) {
  return getRequiredFields(data, stepIndex)
    .filter(([field]) => !isFilled(String(data[field] ?? "")))
    .map(([, label]) => label)
}

function allMissingFields(data: BookingWizardData) {
  return steps.slice(0, requiredStepCount).flatMap((step, index) => (
    missingFieldsForStep(data, index).map((label) => `${step.name}: ${label}`)
  ))
}

function allMissingFieldItems(data: BookingWizardData) {
  return steps.slice(0, requiredStepCount).flatMap((step, index) => (
    missingFieldsForStep(data, index).map((field) => ({
      stepIndex: index,
      stepName: step.name,
      field,
      label: `${step.name}: ${field}`,
    }))
  ))
}

function focusLabelForMissingField(field: string) {
  const labels: Record<string, string> = {
    "Customer quote": "Quote number",
    "Existing booking": "Booking number",
    "Collection address": "Address lookup",
    "Delivery address": "Address lookup",
    "Cargo ready from": "Collection dates",
    "Requested collection date": "Collection dates",
    "Requested delivery date": "Delivery dates",
    "Cargo required by": "Delivery dates",
    "Number of packages": "Outer pkgs",
    Weight: "Gross kg",
    "First origin": "Name",
    "Final destination": "Name",
    ETD: "Leg dates",
    ETA: "Leg dates",
    "VAT and duty payment": "VAT and duty paid by",
  }

  return labels[field] ?? field
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCargoTotal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "")
}

function perOuterPackageLabel(outerPackageType: string) {
  const labels: Record<string, string> = {
    Pallets: "Pallet",
    Cartons: "Carton",
    Crates: "Crate",
    Bags: "Bag",
    Drums: "Drum",
    Cases: "Case",
    Loose: "Loose item",
    ULD: "ULD",
  }

  return labels[outerPackageType] ?? outerPackageType
}

function formatCargoDimensions(line: Pick<CargoLineDraft, "height" | "width" | "depth" | "dimensions">) {
  const dimensions = [line.height, line.width, line.depth].filter(Boolean).join(" x ")
  return dimensions || line.dimensions
}

function cargoLineTotals(lines: CargoLine[]) {
  return {
    outerPackages: lines.reduce((total, line) => total + numberValue(line.outerPackages), 0),
    grossWeight: lines.reduce((total, line) => total + numberValue(line.grossWeight), 0),
    volume: lines.reduce((total, line) => total + numberValue(line.volume), 0),
  }
}

function buildCargoSummary(data: BookingWizardData) {
  if (data.cargoLines.length) {
    const totals = cargoLineTotals(data.cargoLines)
    const commodities = [...new Set(data.cargoLines.map((line) => line.commodity).filter(Boolean))]
    const commodityLabel = commodities.length === 1 ? commodities[0] : `${commodities.length} commodities`
    const pieces = [
      `${data.cargoLines.length} line${data.cargoLines.length === 1 ? "" : "s"}`,
      totals.outerPackages ? `${formatCargoTotal(totals.outerPackages)} outer pkgs` : "",
      totals.grossWeight ? `${formatCargoTotal(totals.grossWeight)} kg` : "",
      totals.volume ? `${formatCargoTotal(totals.volume)} cbm` : "",
      commodityLabel,
    ].filter(Boolean)

    return pieces.join(" - ")
  }

  const pieces = [data.packages ? `${data.packages} ${data.packageType.toLowerCase()}` : "", data.weight ? `${data.weight} kg` : "", data.volume ? `${data.volume} cbm` : ""].filter(Boolean)
  return pieces.length ? pieces.join(" - ") : "Cargo not set"
}

function buildTransportEta(data: BookingWizardData) {
  if (data.transportLegs.length) {
    const firstLeg = data.transportLegs[0]
    const lastLeg = data.transportLegs[data.transportLegs.length - 1]
    return [firstLeg.etd && `ETD ${firstLeg.etd}`, lastLeg.eta && `ETA ${lastLeg.eta}`].filter(Boolean).join(" - ")
  }

  if (data.mode === "Sea") return [data.seaEtd && `ETD ${data.seaEtd}`, data.seaEta && `ETA ${data.seaEta}`].filter(Boolean).join(" - ")
  if (data.mode === "Air") return [data.airEtd && `ETD ${data.airEtd}`, data.airEta && `ETA ${data.airEta}`].filter(Boolean).join(" - ")
  if (data.mode === "Road") return [data.plannedCollectionDate && `Collect ${data.plannedCollectionDate}`, data.plannedDeliveryDate && `Deliver ${data.plannedDeliveryDate}`].filter(Boolean).join(" - ")
  return data.courierCutoff ? `Cut-off ${data.courierCutoff}` : ""
}

function FieldGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fieldListMotion} initial="hidden" animate="visible" className={cn("grid gap-3", className)}>
      {children}
    </motion.div>
  )
}

const missingFieldClass = "ring-1 ring-[rgba(192,57,43,0.78)] shadow-[var(--md-shadow-line),0_0_0_4px_rgba(192,57,43,0.12),0_0_18px_rgba(192,57,43,0.16)]"

function FieldShell({
  label,
  helper,
  required,
  missing,
  action,
  asDiv,
  children,
}: {
  label: string
  helper?: string
  required?: boolean
  missing?: boolean
  action?: ReactNode
  asDiv?: boolean
  children: ReactNode
}) {
  const Shell = asDiv ? motion.div : motion.label

  return (
    <Shell variants={fieldMotion} className="grid min-w-0 content-start gap-1.5" data-field-label={label}>
      <span className="flex min-h-[18px] items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--md-ink)]">
          {label}
          {required ? <span className="text-[var(--md-red)]"> *</span> : null}
        </span>
        {action ? <span className="flex items-center gap-1.5">{action}</span> : null}
      </span>
      {children}
      {helper ? <span className="text-[12px] leading-5 text-[var(--md-text)]">{helper}</span> : null}
    </Shell>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  helper,
  required,
  missing,
  dir = "auto",
  action,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "email" | "date" | "time" | "number"
  helper?: string
  required?: boolean
  missing?: boolean
  dir?: "auto" | "ltr"
  action?: ReactNode
}) {
  return (
    <FieldShell label={label} helper={helper} required={required} missing={missing} action={action}>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          fieldControlClass,
          "truncate",
          missing && missingFieldClass,
        )}
        dir={dir}
        aria-invalid={missing || undefined}
      />
    </FieldShell>
  )
}

function formatStepperNumber(value: number, decimals: number) {
  const fixed = value.toFixed(decimals)
  return decimals > 0 ? fixed.replace(/\.?0+$/, "") : fixed
}

function NumberStepperField({
  label,
  value,
  onChange,
  placeholder,
  step = 1,
  decimals = 0,
  min = 0,
  required,
  missing,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  step?: number
  decimals?: number
  min?: number
  required?: boolean
  missing?: boolean
}) {
  const [slotDirection, setSlotDirection] = useState(1)
  const displayValue = value || placeholder || ""

  function updateBy(delta: number) {
    const parsed = Number.parseFloat(value)
    const base = Number.isFinite(parsed) ? parsed : 0
    const next = Math.max(min, base + delta * step)
    setSlotDirection(delta)
    onChange(formatStepperNumber(next, decimals))
  }

  return (
    <FieldShell label={label} required={required} missing={missing}>
      <div
        className={cn(
          fieldControlClass,
          "grid grid-cols-[minmax(0,1fr)_22px] overflow-hidden p-0",
          missing && missingFieldClass,
        )}
      >
        <div className="relative min-w-0">
          <Input
            type="text"
            inputMode={decimals > 0 ? "decimal" : "numeric"}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value.replace(decimals > 0 ? /[^\d.]/g : /\D/g, ""))}
            className="absolute inset-0 z-10 h-full border-0 bg-transparent px-3 text-transparent shadow-none outline-none caret-[var(--md-ink)] placeholder:text-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            dir="ltr"
            aria-invalid={missing || undefined}
          />
          <span className="pointer-events-none absolute inset-0 flex min-w-0 items-center overflow-hidden px-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={displayValue || "empty"}
                initial={{ opacity: 0, y: slotDirection > 0 ? 8 : -8, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: slotDirection > 0 ? -8 : 8, filter: "blur(2px)" }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className={cn("block truncate text-[13px] tabular-nums text-[var(--md-ink)]", !value && "text-[var(--md-muted)]")}
              >
                {displayValue}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
        <div className="grid border-l border-[rgba(14,125,116,0.14)] bg-[rgba(14,125,116,0.04)]">
          <button
            type="button"
            aria-label={`Increase ${label}`}
            className="grid place-items-center text-[var(--md-subtle)] transition-colors hover:bg-[rgba(14,125,116,0.08)] hover:text-[var(--md-accent)]"
            onClick={() => updateBy(1)}
          >
            <ChevronUp className="size-3" strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            className="grid place-items-center border-t border-[rgba(14,125,116,0.14)] text-[var(--md-subtle)] transition-colors hover:bg-[rgba(14,125,116,0.08)] hover:text-[var(--md-accent)]"
            onClick={() => updateBy(-1)}
          >
            <ChevronDown className="size-3" strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </FieldShell>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  helper,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  helper?: string
}) {
  return (
    <FieldShell label={label} helper={helper}>
      <Textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "min-h-[92px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface-tint)] px-3 py-2.5 text-[13px] leading-[18px]",
          fieldBoundaryShadow,
        )}
        dir="auto"
      />
    </FieldShell>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select option",
  helper,
  required,
  missing,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  helper?: string
  required?: boolean
  missing?: boolean
}) {
  return (
    <FieldShell label={label} helper={helper} required={required} missing={missing}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            fieldControlClass,
            missing && missingFieldClass,
          )}
          aria-invalid={missing || undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)]">
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-[13px]">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}

function IncotermsField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const selected = incotermOptions.find((option) => option.code === value)

  return (
    <FieldShell label="Incoterms">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={fieldControlClass}>
          <SelectValue placeholder="Select Incoterms">
            {selected ? `${selected.code} - ${selected.wording}` : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="min-w-[380px] rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)]">
          {incotermOptions.map((option) => (
            <SelectItem key={option.code} value={option.code} className="py-2 text-[13px]">
              <span className="grid min-w-[320px] grid-cols-[52px_minmax(0,1fr)] items-center gap-3">
                <span className="font-medium text-[var(--md-ink)]">{option.code}</span>
                <span className="text-[var(--md-text)]">{option.wording}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}

function ComboField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  missing,
  disabled,
  action,
  clearable,
  clearTone = "default",
  onClear,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder: string
  required?: boolean
  missing?: boolean
  disabled?: boolean
  action?: ReactNode
  clearable?: boolean
  clearTone?: "default" | "danger"
  onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  const normalizedValue = value.trim().toLowerCase()
  const matches = options
    .filter((option) => !normalizedValue || option.toLowerCase().includes(normalizedValue))
    .slice(0, 8)

  return (
    <FieldShell label={label} required={required} missing={missing} action={action}>
      <div className="relative z-0 min-w-0 focus-within:z-50">
        <Input
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
          }}
          disabled={disabled}
          className={cn(
            fieldControlClass,
            "truncate",
            clearable && value && "pe-9",
            missing && missingFieldClass,
            disabled && "cursor-not-allowed bg-[rgba(228,233,233,0.72)] text-[var(--md-muted)] opacity-80",
          )}
          dir="auto"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && !disabled}
          aria-invalid={missing || undefined}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            className={cn(
              "absolute end-2 top-1/2 z-[130] grid size-5 -translate-y-1/2 place-items-center rounded-[var(--md-radius-sm)] transition-colors",
              clearTone === "danger"
                ? "text-[var(--md-red)] hover:bg-[rgba(192,57,43,0.12)]"
                : "text-[var(--md-text)] hover:bg-[rgba(90,103,100,0.1)] hover:text-[var(--md-red)]",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (onClear) onClear()
              else onChange("")
              setOpen(false)
            }}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        ) : null}
        {open && !disabled && matches.length > 0 ? (
          <div className="absolute inset-x-0 top-[calc(100%+4px)] z-[999] max-h-56 overflow-auto rounded-[var(--md-radius-lg)] bg-[rgba(251,253,253,0.98)] p-1 shadow-[var(--md-shadow-lift)]">
            {matches.map((option) => (
              <button
                key={option}
                type="button"
                className="block w-full truncate rounded-[var(--md-radius-md)] px-2.5 py-2 text-left text-[13px] text-[var(--md-ink)] transition-colors hover:bg-[rgba(14,125,116,0.08)]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FieldShell>
  )
}

function AddressLookupField({
  label,
  value,
  preferredOffices,
  onSelect,
  placeholder,
  required,
  missing,
}: {
  label: string
  value: string
  preferredOffices: readonly string[]
  onSelect: (office: string) => void
  placeholder: string
  required?: boolean
  missing?: boolean
}) {
  const selectedRecord = addressRecordForOffice(value)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selectedRecord ? [selectedRecord.office, selectedRecord.postcode].filter(Boolean).join(" - ") : value)
  }, [selectedRecord, value])

  const preferredSet = new Set(preferredOffices)
  const normalizedQuery = query.trim().toLowerCase()
  const suggestions = addressBook
    .filter((record) => {
      if (!normalizedQuery) return preferredSet.has(record.office)
      return [record.office, record.company, record.postcode, record.address].join(" ").toLowerCase().includes(normalizedQuery)
    })
    .sort((a, b) => Number(preferredSet.has(b.office)) - Number(preferredSet.has(a.office)) || a.office.localeCompare(b.office))
    .slice(0, 8)

  return (
    <FieldShell label={label} required={required} missing={missing}>
      <div className="relative z-0 min-w-0 focus-within:z-50">
        <Input
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          className={cn(
            fieldControlClass,
            "truncate pe-9",
            missing && missingFieldClass,
          )}
          dir="auto"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-invalid={missing || undefined}
        />
        {value ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            className="absolute end-2 top-1/2 z-[130] grid size-5 -translate-y-1/2 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-text)] transition-colors hover:bg-[rgba(90,103,100,0.1)] hover:text-[var(--md-red)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelect("")
              setQuery("")
              setOpen(false)
            }}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        ) : null}
        {open ? (
          <div className="absolute inset-x-0 top-[calc(100%+4px)] z-[999] max-h-72 overflow-auto rounded-[var(--md-radius-xl)] bg-[rgba(251,253,253,0.98)] p-1 shadow-[var(--md-shadow-lift)]">
            {suggestions.length ? suggestions.map((record) => (
              <button
                key={`${record.company}-${record.office}`}
                type="button"
                className="grid w-full gap-1 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-left transition-colors hover:bg-[rgba(14,125,116,0.08)]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(record.office)
                  setQuery([record.office, record.postcode].filter(Boolean).join(" - "))
                  setOpen(false)
                }}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-[var(--md-ink)]">{record.office}</span>
                  {record.postcode ? <span className="shrink-0 text-[11px] font-medium text-[var(--md-accent)]" dir="ltr">{record.postcode}</span> : null}
                </span>
                <span className="truncate text-[12px] text-[var(--md-text)]">{record.company} - {record.address.replace(/\n/g, ", ")}</span>
              </button>
            )) : (
              <div className="px-3 py-3 text-[12px] text-[var(--md-text)]">No matching addresses in the prototype list.</div>
            )}
          </div>
        ) : null}
      </div>
    </FieldShell>
  )
}

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; title: string; body: string }>
  onChange: (value: T) => void
}) {
  return (
    <motion.div variants={fieldMotion} className="grid gap-1.5">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-[var(--md-radius-lg)] bg-white/56 p-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/78",
                selected && "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_14px_28px_rgba(14,125,116,0.22)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]",
              )}
              onClick={() => onChange(option.value)}
            >
              <span className="flex items-center justify-between gap-3">
                <span className={cn("text-[14px] font-medium text-[var(--md-ink)]", selected && "text-white")}>{option.title}</span>
                {selected ? (
                  <span className="grid size-6 place-items-center rounded-full bg-white text-[var(--md-accent)] shadow-[0_0_0_3px_rgba(255,255,255,0.16)]">
                    <Check className="size-3.5" strokeWidth={1.8} />
                  </span>
                ) : null}
              </span>
              <span className={cn("mt-1.5 block text-[12px] leading-[18px] text-[var(--md-text)]", selected && "text-white/78")}>{option.body}</span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}

function ToggleTile({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <motion.button
      variants={fieldMotion}
      type="button"
      aria-pressed={checked}
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-1.5 text-left text-[13px] font-medium text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.14),0_1px_1px_rgba(14,125,116,0.04)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/78",
        checked && "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_10px_20px_rgba(14,125,116,0.18)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]",
      )}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={cn("grid size-5 place-items-center rounded-[var(--md-radius-sm)] bg-white shadow-[var(--md-shadow-line)]", checked && "text-[var(--md-accent)]")}>
        {checked ? <Check className="size-3.5" strokeWidth={1.8} /> : null}
      </span>
    </motion.button>
  )
}

function BrandedCheckbox({
  label,
  checked,
  onChange,
  className,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2.5 text-left text-[12px] font-medium text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.14),0_1px_1px_rgba(14,125,116,0.04)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/82",
        checked && "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_10px_20px_rgba(14,125,116,0.18)] hover:bg-[#0b6f67]",
        className,
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-white/82 text-transparent shadow-[var(--md-shadow-line)]",
          checked && "text-[var(--md-accent)]",
        )}
        aria-hidden="true"
      >
        <AnimatePresence initial={false}>
          {checked ? (
            <motion.span
              key="tick"
              initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 12 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Check className="size-3" strokeWidth={2.2} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      <span className="min-w-0 whitespace-nowrap">{label}</span>
    </motion.button>
  )
}

function DexterCodeHint() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label="Dexter auto-population note"
          className="grid size-6 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] outline-none transition-[background,box-shadow,transform] hover:scale-[1.04] hover:bg-[rgba(14,125,116,0.16)] focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.22)]"
        >
          <Bot className="size-3.5" strokeWidth={1.5} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-[260px] rounded-[var(--md-radius-lg)] bg-[var(--md-ink)] px-3 py-2 text-[12px] leading-5 text-white shadow-[var(--md-shadow-lift)]">
        Dexter will auto-populate this code when the backend handoff is connected.
      </TooltipContent>
    </Tooltip>
  )
}

function CompactOptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <motion.div variants={fieldMotion} className="grid gap-1.5">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option === value

          return (
            <motion.button
              key={option}
              type="button"
              aria-pressed={selected}
              whileTap={{ scale: 0.965 }}
              animate={{ scale: selected ? 1.015 : 1 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "h-11 rounded-[var(--md-radius-xl)] px-4 text-[13px] font-medium transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01]",
                selected
                  ? "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_10px_22px_rgba(14,125,116,0.2)] hover:bg-[#0b6f67]"
                  : "bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.14),0_1px_1px_rgba(14,125,116,0.04)] hover:bg-white/82",
              )}
              onClick={() => onChange(option)}
            >
              {option}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

function ModePicker({
  value,
  onChange,
}: {
  value: BookingModeOption
  onChange: (value: BookingModeOption) => void
}) {
  return (
    <motion.div variants={fieldMotion} className="grid gap-1.5">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">Mode</p>

      <div className="flex flex-wrap gap-2">
        {standardModeOptions.map((mode) => {
          const selected = mode === value

          return (
            <motion.button
              key={mode}
              type="button"
              aria-pressed={selected}
              whileTap={{ scale: 0.965 }}
              animate={{ scale: selected ? 1.015 : 1 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "h-11 rounded-[var(--md-radius-xl)] px-4 text-[13px] font-medium transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01]",
                selected
                  ? "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_10px_22px_rgba(14,125,116,0.2)] hover:bg-[#0b6f67]"
                  : "bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.14),0_1px_1px_rgba(14,125,116,0.04)] hover:bg-white/82",
              )}
              onClick={() => onChange(mode)}
            >
              {mode}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

function PartyRow({
  label,
  company,
  contact,
  office,
  reference,
  companyMissing,
  companyLocked,
  actions,
  onCompanyReset,
  onCompanyChange,
  onContactChange,
  onOfficeChange,
  onReferenceChange,
}: {
  label: string
  company: string
  contact: string
  office: string
  reference: string
  companyMissing?: boolean
  companyLocked?: boolean
  actions?: ReactNode
  onCompanyReset: () => void
  onCompanyChange: (value: string) => void
  onContactChange: (value: string) => void
  onOfficeChange: (value: string) => void
  onReferenceChange: (value: string) => void
}) {
  const contactOptions = contactsForOffice(company, office)
  const officeOptions = officesForCompany(company)
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [draftAddressName, setDraftAddressName] = useState("")
  const [draftAddressDetails, setDraftAddressDetails] = useState("")
  const [draftContactName, setDraftContactName] = useState("")
  const [draftContactEmail, setDraftContactEmail] = useState("")
  const [draftContactPhone, setDraftContactPhone] = useState("")

  const addAddressDisabled = !company.trim()
  const addContactDisabled = !office.trim()

  const saveAddress = () => {
    const newAddress = draftAddressName.trim()
    if (!newAddress) return

    onOfficeChange(newAddress)
    onContactChange("")
    setDraftAddressName("")
    setDraftAddressDetails("")
    setAddressDialogOpen(false)
  }

  const saveContact = () => {
    const newContact = draftContactName.trim()
    if (!newContact) return

    onContactChange(newContact)
    setDraftContactName("")
    setDraftContactEmail("")
    setDraftContactPhone("")
    setContactDialogOpen(false)
  }

  const addAddressButton = (
    <button
      type="button"
      aria-label={`Add address for ${label}`}
      title={addAddressDisabled ? "Select a company first" : `Add address for ${label}`}
      disabled={addAddressDisabled}
      className="grid size-6 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.14),0_1px_1px_rgba(14,125,116,0.04)] transition-[background,color,opacity] hover:bg-white/78 hover:text-[var(--md-accent)] disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => setAddressDialogOpen(true)}
    >
      <Plus className="size-3.5" strokeWidth={1.8} />
    </button>
  )

  const addContactButton = (
    <button
      type="button"
      aria-label={`Add contact for ${label}`}
      title={addContactDisabled ? "Select an office first" : `Add contact for ${label}`}
      disabled={addContactDisabled}
      className="grid size-6 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.14),0_1px_1px_rgba(14,125,116,0.04)] transition-[background,color,opacity] hover:bg-white/78 hover:text-[var(--md-accent)] disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => setContactDialogOpen(true)}
    >
      <Plus className="size-3.5" strokeWidth={1.8} />
    </button>
  )

  return (
    <motion.div
      variants={fieldMotion}
      className={cn("relative z-0 grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 focus-within:z-[300]", fieldBoundaryShadow)}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{label}</p>
        {actions}
      </div>
      <div className="grid min-w-0 gap-2 lg:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <ComboField
          label="Company name"
          value={company}
          onChange={(value) => {
            onCompanyChange(value)
            onContactChange("")
            onOfficeChange("")
          }}
          options={partyCompanyOptions}
          placeholder="Select company"
          required={label !== "Notify Party"}
          missing={companyMissing}
          disabled={companyLocked}
          clearable
          clearTone="danger"
          onClear={onCompanyReset}
        />
        <ComboField
          label="Office / address"
          value={office}
          onChange={(value) => {
            onOfficeChange(value)
            onContactChange("")
          }}
          options={officeOptions}
          placeholder={company ? "Select office" : "Select company first"}
          action={addAddressButton}
        />
        <ComboField
          label="Contact"
          value={contact}
          onChange={onContactChange}
          options={contactOptions}
          placeholder={office ? "Select contact" : "Select office first"}
          action={addContactButton}
        />
        <TextField
          label="Reference"
          value={reference}
          onChange={onReferenceChange}
          placeholder="Party reference"
          dir="ltr"
        />
      </div>
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)] sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add address</DialogTitle>
            <DialogDescription>Create a booking address for {company || "this party"}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <TextField label="Address name" value={draftAddressName} onChange={setDraftAddressName} placeholder="Regional office, warehouse, division..." />
            <TextAreaField label="Address details" value={draftAddressDetails} onChange={setDraftAddressDetails} placeholder="Address lines, city, country, loading point notes..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px]" onClick={() => setAddressDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[13px] text-white hover:bg-[#0b6f67]" disabled={!draftAddressName.trim()} onClick={saveAddress}>
              Add address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-lift)] sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>Create a contact for {office || company || "this party"}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="Contact name" value={draftContactName} onChange={setDraftContactName} placeholder="Full name or team name" />
            </div>
            <TextField label="Email" value={draftContactEmail} onChange={setDraftContactEmail} placeholder="name@example.com" type="email" dir="ltr" />
            <TextField label="Phone" value={draftContactPhone} onChange={setDraftContactPhone} placeholder="+44..." dir="ltr" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px]" onClick={() => setContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[13px] text-white hover:bg-[#0b6f67]" disabled={!draftContactName.trim()} onClick={saveContact}>
              Add contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function CustomerRoleCheckboxes({
  isShipper,
  isConsignee,
  isNotifyParty,
  onShipperChange,
  onConsigneeChange,
  onNotifyPartyChange,
}: {
  isShipper: boolean
  isConsignee: boolean
  isNotifyParty: boolean
  onShipperChange: (checked: boolean) => void
  onConsigneeChange: (checked: boolean) => void
  onNotifyPartyChange: (checked: boolean) => void
}) {
  const options = [
    ["customer-is-shipper", "Is shipper", isShipper, onShipperChange],
    ["customer-is-consignee", "Is consignee", isConsignee, onConsigneeChange],
    ["customer-is-notify", "Is notify party", isNotifyParty, onNotifyPartyChange],
  ] as const

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label, checked, onChange]) => (
        <BrandedCheckbox
          key={id}
          label={label}
          checked={checked}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function SourceChoiceCard({
  title,
  body,
  icon,
  onClick,
}: {
  title: string
  body: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      variants={optionMotion}
      whileTap={{ scale: 0.985 }}
      className="group grid min-h-[148px] content-between gap-4 rounded-[var(--md-radius-2xl)] bg-[var(--md-surface-tint)] p-4 text-left shadow-[inset_0_0_0_1px_rgba(14,125,116,0.13),0_10px_24px_rgba(14,125,116,0.06)] transition-[background,box-shadow,transform] hover:scale-[1.01] hover:bg-white/82 hover:shadow-[inset_0_0_0_1px_rgba(14,125,116,0.2),0_14px_30px_rgba(14,125,116,0.1)]"
      onClick={onClick}
    >
      <span className="grid gap-3">
        <span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
          {icon}
        </span>
        <span className="grid gap-1.5">
          <span className="text-[16px] font-medium text-[var(--md-ink)]">{title}</span>
          <span className="text-[13px] leading-5 text-[var(--md-text)]">{body}</span>
        </span>
      </span>
      <span className="inline-flex h-8 w-fit items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_10px_22px_rgba(14,125,116,0.18)] transition-transform group-hover:scale-[1.02]">
        Select
        <ChevronRight className="size-3.5" strokeWidth={1.35} />
      </span>
    </motion.button>
  )
}

function SourceScreen({ onStart }: { onStart: (source: Exclude<BookingSource, null>) => void }) {
  return (
    <motion.div variants={stepMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
      <Surface padding="md" className={cn("overflow-hidden rounded-[var(--md-radius-2xl)]", bookingStepSurfaceClass)}>
        <h1 className="sr-only">Choose booking start type</h1>
        <motion.div variants={fieldListMotion} initial="hidden" animate="visible" className="grid gap-3 xl:grid-cols-3">
          <SourceChoiceCard
            title="Create from Customer Quote"
            body="Use an accepted quote as the source, then confirm the booking details."
            icon={<ClipboardCheck className="size-5" strokeWidth={1.35} />}
            onClick={() => onStart("quote")}
          />
          <SourceChoiceCard
            title="Create from Existing Booking"
            body="Duplicate a previous customer job or favourite route pattern."
            icon={<Copy className="size-5" strokeWidth={1.35} />}
            onClick={() => onStart("existing")}
          />
          <SourceChoiceCard
            title="Create from Scratch"
            body="Start clean when this movement is genuinely new."
            icon={<Sparkles className="size-5" strokeWidth={1.35} />}
            onClick={() => onStart("scratch")}
          />
        </motion.div>
      </Surface>
    </motion.div>
  )
}

function SourceDetailPanel({
  data,
  missing,
  update,
  onApplyExistingBooking,
  onApplyCustomerQuote,
}: {
  data: BookingWizardData
  missing: Set<string>
  update: <K extends keyof BookingWizardData>(field: K, value: BookingWizardData[K]) => void
  onApplyExistingBooking: (bookingId: string) => void
  onApplyCustomerQuote: (quoteId: string) => void
}) {
  const [sourceSearch, setSourceSearch] = useState("")
  const customerOptions = Array.from(new Set([
    ...partyCompanyOptions,
    ...bookings.map((booking) => booking.customer),
    ...customerQuotes.map((quote) => quote.customer),
  ])).sort()
  const quoteNumberOptions = customerQuotes
    .filter((quote) => !data.quoteCustomer || quote.customer === data.quoteCustomer)
    .map((quote) => quote.id)
  const bookingNumberOptions = bookings
    .filter((booking) => !data.bookingCustomer || booking.customer === data.bookingCustomer)
    .map((booking) => booking.id)

  if (data.source === "quote") {
    const normalizedSearch = sourceSearch.trim().toLowerCase()
    const visibleQuotes = customerQuotes
      .filter((quote) => !data.quoteCustomer || quote.customer === data.quoteCustomer)
      .filter((quote) => !normalizedSearch || [quote.id, quote.customer, quote.route, quote.detail, quote.status].join(" ").toLowerCase().includes(normalizedSearch))
      .slice(0, 8)

    return (
      <motion.section variants={fieldMotion} className={cn(fieldPanelClass, "grid gap-3")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-medium text-[var(--md-ink)]">Customer quote source</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Select the accepted quote before confirming the movement details.</p>
          </div>
          {data.quoteNumber ? <StatusPill tone="teal">Quote selected</StatusPill> : <StatusPill tone="amber">Required</StatusPill>}
        </div>
        <FieldGroup className="lg:grid-cols-3">
          <ComboField
            label="Customer"
            value={data.quoteCustomer}
            onChange={(value) => {
              update("quoteCustomer", value)
              update("quoteNumber", "")
            }}
            options={customerOptions}
            placeholder="Select customer"
            clearable
          />
          <ComboField
            label="Quote number"
            value={data.quoteNumber}
            onChange={(value) => {
              update("quoteNumber", value)
              const quote = customerQuotes.find((item) => item.id === value)
              if (quote) onApplyCustomerQuote(quote.id)
            }}
            options={quoteNumberOptions}
            placeholder="Quote number"
            required
            missing={missing.has("Customer quote")}
          />
          <TextField label="Search quotes" value={sourceSearch} onChange={setSourceSearch} placeholder="Search route, status, detail..." />
        </FieldGroup>
        <div className="grid gap-2">
          {visibleQuotes.map((quote) => {
            const selected = data.quoteNumber === quote.id

            return (
              <button
                key={quote.id}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "grid gap-2 rounded-[var(--md-radius-lg)] bg-white/58 px-3 py-2.5 text-left shadow-[var(--md-shadow-line)] transition-[background,box-shadow,transform] hover:bg-white/82 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center",
                  selected && "bg-[rgba(14,125,116,0.1)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.35),0_8px_18px_rgba(14,125,116,0.08)]",
                )}
                onClick={() => onApplyCustomerQuote(quote.id)}
              >
                <span className="text-[13px] font-medium text-[var(--md-ink)]" dir="ltr">{quote.id}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{quote.customer}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{quote.route} - {quote.detail}</span>
                </span>
                <StatusPill tone={selected ? "teal" : quote.status === "Accepted" ? "green" : "neutral"}>{selected ? "Selected" : quote.status}</StatusPill>
              </button>
            )
          })}
        </div>
      </motion.section>
    )
  }

  if (data.source === "existing") {
    const normalizedSearch = sourceSearch.trim().toLowerCase()
    const favouriteBookings = bookings.filter((booking) => ["MD-22481", "MD-22455", "MD-22441", "MD-22414", "MD-22466"].includes(booking.id))
    const visibleBookings = (data.bookingCustomer
      ? bookings.filter((booking) => booking.customer === data.bookingCustomer)
      : favouriteBookings
    )
      .filter((booking) => !normalizedSearch || [booking.id, booking.customer, booking.route, booking.carrier, booking.customerRef, booking.jobRef].join(" ").toLowerCase().includes(normalizedSearch))
      .slice(0, 8)

    return (
      <motion.section variants={fieldMotion} className={cn(fieldPanelClass, "grid gap-3")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-medium text-[var(--md-ink)]">Existing booking source</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Pick a customer job or favourite route to prefill this booking.</p>
          </div>
          {data.templateBookingId ? <StatusPill tone="teal">Booking selected</StatusPill> : <StatusPill tone="amber">Required</StatusPill>}
        </div>
        <FieldGroup className="lg:grid-cols-3">
          <ComboField
            label="Customer"
            value={data.bookingCustomer}
            onChange={(value) => {
              update("bookingCustomer", value)
              update("bookingNumber", "")
              update("templateBookingId", "")
              setSourceSearch("")
            }}
            options={customerOptions}
            placeholder="Select customer"
            clearable
          />
          <ComboField
            label="Booking number"
            value={data.bookingNumber}
            onChange={(value) => {
              update("bookingNumber", value)
              const booking = bookings.find((item) => item.id === value)
              if (booking) onApplyExistingBooking(booking.id)
              else update("templateBookingId", "")
            }}
            options={bookingNumberOptions}
            placeholder="Booking number"
            required
            missing={missing.has("Existing booking")}
          />
          <TextField label="Search jobs" value={sourceSearch} onChange={setSourceSearch} placeholder="Search customer, route, carrier..." />
        </FieldGroup>
        <div className="grid gap-2">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">{data.bookingCustomer ? "Last 10 jobs" : "Favourite jobs"}</p>
          {visibleBookings.map((booking) => {
            const selected = data.templateBookingId === booking.id

            return (
              <button
                key={booking.id}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "grid gap-3 rounded-[var(--md-radius-lg)] bg-white/58 px-3 py-3 text-left shadow-[var(--md-shadow-line)] transition-[background,box-shadow,transform] hover:bg-white/82 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center",
                  selected && "bg-[rgba(14,125,116,0.1)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.35),0_8px_18px_rgba(14,125,116,0.08)]",
                )}
                onClick={() => onApplyExistingBooking(booking.id)}
              >
                <span className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{booking.id}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{booking.customer}</span>
                  <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{booking.route} - {booking.carrier}</span>
                </span>
                <StatusPill tone={selected ? "teal" : "neutral"}>{selected ? "Selected" : booking.mode}</StatusPill>
              </button>
            )
          })}
        </div>
      </motion.section>
    )
  }

  return null
}

function BookingTypeMiniSteps({
  source,
  stage,
  sourceComplete,
  onStageChange,
}: {
  source: BookingSource
  stage: BookingTypeStage
  sourceComplete: boolean
  onStageChange: (stage: BookingTypeStage) => void
}) {
  const hasSourceStage = source === "quote" || source === "existing"
  const items = hasSourceStage
    ? [
        { id: "source" as const, label: source === "quote" ? "Quote source" : "Existing source", complete: sourceComplete },
        { id: "movement" as const, label: "Movement details", complete: false },
      ]
    : [{ id: "movement" as const, label: "Movement details", complete: false }]

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {items.map((item, index) => {
        const active = item.id === stage
        const disabled = item.id === "movement" && hasSourceStage && !sourceComplete

        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 text-[12px] font-medium shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform]",
              active
                ? "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_10px_20px_rgba(14,125,116,0.18)]"
                : "bg-white/58 text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-white/82",
              disabled && "cursor-not-allowed opacity-45",
            )}
            onClick={() => onStageChange(item.id)}
          >
            <span className={cn("grid size-4 place-items-center rounded-full text-[10px]", active ? "bg-white text-[var(--md-accent)]" : "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]")}>
              {item.complete ? <Check className="size-3" strokeWidth={1.8} /> : index + 1}
            </span>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function WizardProgress({
  activeStep,
  data,
  bookingTypeStage,
  onStepChange,
}: {
  activeStep: number
  data: BookingWizardData
  bookingTypeStage: BookingTypeStage
  onStepChange: (step: number) => void
}) {
  const completeCount = steps.slice(0, requiredStepCount).filter((_, index) => missingFieldsForStep(data, index).length === 0).length
  const compactLabels: Record<string, string> = {
    type: "Type",
    parties: "Parties",
    collection: "Locations",
    cargo: "Cargo",
    transport: "Transport",
    customs: "Customs",
    review: "Review",
  }
  const segmentProgress = (step: WizardStep, index: number) => {
    if (index < activeStep) return 100
    if (index > activeStep) return 0
    if (step.id === "type" && data.source !== "scratch") return bookingTypeStage === "source" ? 50 : 100
    return 100
  }

  return (
    <Surface padding="sm" className={cn("sticky top-[72px] z-10 rounded-[var(--md-radius-xl)] backdrop-blur-xl", bookingStepSurfaceClass)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--md-subtle)]">Step {activeStep + 1} of {steps.length}</p>
          <h2 className="mt-0.5 truncate text-[15px] font-medium text-[var(--md-ink)]">{steps[activeStep].name}</h2>
        </div>
        <StatusPill tone={completeCount >= requiredStepCount ? "green" : "teal"}>{completeCount}/{requiredStepCount} complete</StatusPill>
      </div>
      <div className="mt-3">
        <div className="grid grid-cols-7 gap-1 rounded-full bg-[rgba(14,125,116,0.06)] p-1 shadow-[inset_0_0_0_1px_rgba(14,125,116,0.1),0_1px_1px_rgba(14,125,116,0.04)]" aria-label="Booking progress">
          {steps.map((step, index) => {
            const missing = index < requiredStepCount ? missingFieldsForStep(data, index).length : allMissingFields(data).length
            const active = index === activeStep
            const complete = missing === 0 && index < activeStep
            const visited = index < activeStep
            const fill = segmentProgress(step, index)

            return (
              <button
                key={step.id}
                type="button"
                aria-current={active ? "step" : undefined}
                aria-label={`${step.name}${missing ? `, ${missing} missing` : ""}`}
                className={cn(
                  "relative h-2.5 min-w-0 overflow-hidden rounded-full bg-[rgba(90,103,100,0.14)] transition-[background,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgba(14,125,116,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.28)] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                  active && "scale-y-125 shadow-[0_0_0_1px_rgba(14,125,116,0.18),0_8px_18px_rgba(14,125,116,0.14)]",
                )}
                onClick={() => onStepChange(index)}
              >
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width,background] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active || complete ? "bg-[var(--md-accent)]" : visited ? "bg-[rgba(14,125,116,0.42)]" : "bg-transparent",
                  )}
                  style={{ width: `${fill}%` }}
                />
              </button>
            )
          })}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {steps.map((step, index) => {
            const missing = index < requiredStepCount ? missingFieldsForStep(data, index).length : allMissingFields(data).length
            const active = index === activeStep
            const complete = missing === 0 && index < activeStep

            return (
              <button
                key={step.id}
                type="button"
                title={step.name}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1 py-0.5 text-center text-[10px] font-medium transition-[color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.22)]",
                  active ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)] hover:text-[var(--md-text)]",
                  complete && !active && "text-[var(--md-accent)]",
                )}
                onClick={() => onStepChange(index)}
              >
                <span className="truncate">{compactLabels[step.id] ?? step.name}</span>
                {missing ? <span className="size-1 rounded-full bg-[var(--md-amber)]" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      </div>
    </Surface>
  )
}

function LiveSummaryPanel({ data, activeStep }: { data: BookingWizardData; activeStep: number }) {
  const completion = Math.round((steps.slice(0, requiredStepCount).filter((_, index) => missingFieldsForStep(data, index).length === 0).length / requiredStepCount) * 100)
  const route = [data.collectionAddress, data.deliveryAddress].filter(Boolean).join(" to ")
  const eta = buildTransportEta(data)

  const rows = [
    ["Booking type", `${data.direction} ${data.mode}`],
    ["Incoterms", [data.incoterms, data.incotermsExtra].filter(Boolean).join(" - ") || "Not set"],
    ["Customer", data.customer || "Not set"],
    ["Shipper", data.shipper || "Not set"],
    ["Consignee", data.consignee || "Not set"],
    ["Collection", data.collectionAddress || "Not set"],
    ["Delivery", data.deliveryAddress || "Not set"],
    ["Mode", data.mode],
    ["Cargo", buildCargoSummary(data)],
    ["ETD/ETA", eta || "Not set"],
    ["References", data.customerReference || data.internalReference || "Not set"],
  ]

  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)] bg-[rgba(250,253,252,0.94)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">Live summary</p>
          <h2 className="mt-1 text-[16px] font-medium text-[var(--md-ink)]">{data.customer || "New booking"}</h2>
        </div>
        <StatusPill tone={completion >= 100 ? "green" : "teal"}>{completion}%</StatusPill>
      </div>
      <Progress value={completion} className="mt-4 h-1.5 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--md-accent)]" />
      <p className="mt-4 line-clamp-2 text-[13px] leading-5 text-[var(--md-text)]">{route || "Locations will appear here as the operator fills the booking."}</p>
      <div className="mt-4 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[78px_minmax(0,1fr)] gap-2 rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-2 shadow-[var(--md-shadow-line)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
            <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" dir="auto">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-[var(--md-text)]">Current step: {steps[activeStep].name}</p>
    </Surface>
  )
}

function StepShell({ step, action, children }: { step: WizardStep; action?: ReactNode; children: ReactNode }) {
  return (
    <Surface padding="md" className={cn("overflow-visible rounded-[var(--md-radius-2xl)]", bookingStepSurfaceClass)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase text-[var(--md-accent)]">{step.eyebrow}</p>
          <h1 className="mt-1.5 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{step.title}</h1>
          <p className="mt-1.5 max-w-[720px] text-[14px] leading-5 text-[var(--md-text)]">{step.summary}</p>
        </div>
        {action}
      </div>
      {children}
    </Surface>
  )
}

function StepContent({
  activeStep,
  data,
  update,
  goToStep,
  onApplyExistingBooking,
  onApplyCustomerQuote,
  bookingTypeStage,
  onBookingTypeStageChange,
}: {
  activeStep: number
  data: BookingWizardData
  update: <K extends keyof BookingWizardData>(field: K, value: BookingWizardData[K]) => void
  goToStep: (step: number, focusLabel?: string) => void
  onApplyExistingBooking: (bookingId: string) => void
  onApplyCustomerQuote: (quoteId: string) => void
  bookingTypeStage: BookingTypeStage
  onBookingTypeStageChange: (stage: BookingTypeStage) => void
}) {
  const missing = new Set(missingFieldsForStep(data, activeStep))
  const [cargoDraft, setCargoDraft] = useState<CargoLineDraft>(defaultCargoLineDraft)
  const [transportDraft, setTransportDraft] = useState<TransportLegDraft>(defaultTransportLegDraft)

  function updateCargoDraft<K extends keyof CargoLineDraft>(field: K, value: CargoLineDraft[K]) {
    setCargoDraft((current) => ({ ...current, [field]: value }))
  }

  function syncCargoSummary(lines: CargoLine[]) {
    const totals = cargoLineTotals(lines)
    const firstLine = lines[0]
    update("cargoLines", lines)
    update("goodsDescription", lines.map((line) => line.commodity).filter(Boolean).join(", "))
    update("packages", totals.outerPackages ? formatCargoTotal(totals.outerPackages) : "")
    update("packageType", firstLine?.outerPackageType ?? defaultCargoLineDraft.outerPackageType)
    update("weight", totals.grossWeight ? formatCargoTotal(totals.grossWeight) : "")
    update("volume", totals.volume ? formatCargoTotal(totals.volume) : "")
    update("dimensions", firstLine?.dimensions ?? "")
  }

  function addCargoLine() {
    if (!cargoDraft.commodity.trim() || !cargoDraft.outerPackages.trim() || !cargoDraft.grossWeight.trim()) return

    const nextLines = [
      ...data.cargoLines,
      {
        ...cargoDraft,
        dimensions: formatCargoDimensions(cargoDraft),
        id: `cargo-line-${Date.now()}`,
      },
    ]

    syncCargoSummary(nextLines)
    setCargoDraft(defaultCargoLineDraft)
  }

  function removeCargoLine(id: string) {
    syncCargoSummary(data.cargoLines.filter((line) => line.id !== id))
  }

  function updateTransportDraft<K extends keyof TransportLegDraft>(field: K, value: TransportLegDraft[K]) {
    setTransportDraft((current) => ({ ...current, [field]: value }))
  }

  function updateTransportMode(value: BookingModeOption) {
    const options = legTypeOptionsForMode(value)
    setTransportDraft((current) => ({
      ...current,
      mode: value,
      legType: options.includes(current.legType) ? current.legType : defaultLegTypeForMode(value),
    }))
  }

  function syncTransportLegs(legs: TransportLeg[]) {
    const firstLeg = legs[0]
    const lastLeg = legs[legs.length - 1]

    update("transportLegs", legs)
    update("portOfLoading", firstLeg?.fromCode || firstLeg?.fromName || "")
    update("portOfDischarge", lastLeg?.toCode || lastLeg?.toName || "")
    update("airportDeparture", firstLeg?.fromCode || "")
    update("airportArrival", lastLeg?.toCode || "")
    update("roadCollectionPoint", firstLeg?.fromName || "")
    update("roadDeliveryPoint", lastLeg?.toName || "")
    update("seaEtd", firstLeg?.etd ?? "")
    update("seaEta", lastLeg?.eta ?? "")
    update("airEtd", firstLeg?.etd ?? "")
    update("airEta", lastLeg?.eta ?? "")
    update("plannedCollectionDate", firstLeg?.etd || today)
    update("plannedDeliveryDate", lastLeg?.eta || tomorrow)
    update("airline", legs.find((leg) => leg.mode === "Air")?.carrier ?? "")
    update("vessel", legs.find((leg) => leg.mode === "Sea")?.carrier ?? "")
  }

  function addTransportLeg() {
    if (!transportDraft.fromName.trim() || !transportDraft.toName.trim()) return

    syncTransportLegs([...data.transportLegs, { ...transportDraft, id: `transport-leg-${Date.now()}` }])
    setTransportDraft({
      ...defaultTransportLegDraft,
      mode: defaultRouteLegModeForBookingMode(data.mode),
      legType: defaultLegTypeForMode(defaultRouteLegModeForBookingMode(data.mode)),
      fromCode: transportDraft.toCode,
      fromName: transportDraft.toName,
      fromCountry: transportDraft.toCountry,
    })
  }

  function removeTransportLeg(id: string) {
    syncTransportLegs(data.transportLegs.filter((leg) => leg.id !== id))
  }

  useEffect(() => {
    if (activeStep !== 4 || data.transportLegs.length || transportDraft.fromName || transportDraft.toName) return

    const collectionLocation = routeLocationForAddress(data.collectionAddress)
    const deliveryLocation = routeLocationForAddress(data.deliveryAddress)

    setTransportDraft({
      ...defaultTransportLegDraft,
      mode: defaultRouteLegModeForBookingMode(data.mode),
      legType: defaultLegTypeForMode(defaultRouteLegModeForBookingMode(data.mode)),
      fromCode: collectionLocation.code,
      fromName: collectionLocation.name,
      fromCountry: collectionLocation.country,
      toCode: deliveryLocation.code,
      toName: deliveryLocation.name,
      toCountry: deliveryLocation.country,
      etd: data.requestedCollectionDate,
      eta: data.requestedDeliveryDate,
    })
  }, [activeStep, data.collectionAddress, data.deliveryAddress, data.mode, data.requestedCollectionDate, data.requestedDeliveryDate, data.transportLegs.length, transportDraft.fromName, transportDraft.toName])

  if (activeStep === 0) {
    const hasSourceMiniStep = data.source === "quote" || data.source === "existing"
    const sourceComplete = data.source === "quote" ? Boolean(data.quoteNumber.trim()) : data.source === "existing" ? Boolean(data.templateBookingId) : true
    const stepForStage: WizardStep = bookingTypeStage === "source" && hasSourceMiniStep
      ? {
          ...steps[0],
          eyebrow: "Step 1.1",
          title: data.source === "quote" ? "Which quote should this start from?" : "Which booking should this copy?",
          summary: data.source === "quote"
            ? "Select the accepted customer quote before confirming the movement details."
            : "Select the existing booking before confirming the movement details.",
        }
      : {
          ...steps[0],
          eyebrow: hasSourceMiniStep ? "Step 1.2" : "Step 1",
        }

    return (
      <StepShell step={stepForStage}>
        <BookingTypeMiniSteps
          source={data.source}
          stage={bookingTypeStage}
          sourceComplete={sourceComplete}
          onStageChange={onBookingTypeStageChange}
        />
        {bookingTypeStage === "source" && hasSourceMiniStep ? (
          <FieldGroup className="gap-4">
            <SourceDetailPanel
              data={data}
              missing={missing}
              update={update}
              onApplyExistingBooking={onApplyExistingBooking}
              onApplyCustomerQuote={onApplyCustomerQuote}
            />
          </FieldGroup>
        ) : (
          <FieldGroup className="gap-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)] xl:items-start">
              <CompactOptionGroup
                label="Direction"
                value={data.direction}
                options={directionOptions}
                onChange={(value) => update("direction", value)}
              />
              <IncotermsField value={data.incoterms} onChange={(value) => update("incoterms", value)} />
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)] xl:items-start">
              <ModePicker
                value={data.mode}
                onChange={(value) => update("mode", value)}
              />
              <TextField
                label="Incoterms Extra"
                value={data.incotermsExtra}
                onChange={(value) => update("incotermsExtra", value)}
                placeholder="Named place, terminal, port, or qualifier"
              />
            </div>
          </FieldGroup>
        )}
      </StepShell>
    )
  }

  if (activeStep === 1) {
    const copyCustomerToShipper = (checked: boolean) => {
      update("customerIsShipper", checked)
      if (!checked) return

      update("shipper", data.customer)
      update("shipperContact", "")
      update("shipperOffice", "")
      update("collectionAddress", "")
      update("collectionAddressManual", false)
    }

    const copyCustomerToConsignee = (checked: boolean) => {
      update("customerIsConsignee", checked)
      if (!checked) return

      update("consignee", data.customer)
      update("consigneeContact", "")
      update("consigneeOffice", "")
      update("deliveryAddress", "")
      update("deliveryAddressManual", false)
    }

    const copyCustomerToNotifyParty = (checked: boolean) => {
      update("customerIsNotifyParty", checked)
      if (!checked) return

      update("notifyParty", data.customer)
      update("notifyPartyContact", "")
      update("notifyPartyOffice", "")
    }

    const updateCustomerCompany = (value: string) => {
      update("customer", value)
      if (data.customerIsShipper) {
        update("shipper", value)
        update("shipperContact", "")
        update("shipperOffice", "")
        update("collectionAddress", "")
        update("collectionAddressManual", false)
      }
      if (data.customerIsConsignee) {
        update("consignee", value)
        update("consigneeContact", "")
        update("consigneeOffice", "")
        update("deliveryAddress", "")
        update("deliveryAddressManual", false)
      }
      if (data.customerIsNotifyParty) {
        update("notifyParty", value)
        update("notifyPartyContact", "")
        update("notifyPartyOffice", "")
      }
    }

    const updateCustomerContact = (value: string) => {
      update("customerContact", value)
    }

    const resetCustomer = () => {
      update("customer", "")
      update("customerContact", "")
      update("customerOffice", "")
      update("customerReference", "")
      update("customerIsShipper", false)
      update("customerIsConsignee", false)
      update("customerIsNotifyParty", false)
    }

    const resetShipper = () => {
      update("shipper", "")
      update("shipperContact", "")
      update("shipperOffice", "")
      update("supplierReference", "")
      update("collectionAddress", "")
      update("collectionAddressManual", false)
      update("accessRestrictions", "")
      update("customerIsShipper", false)
    }

    const resetConsignee = () => {
      update("consignee", "")
      update("consigneeContact", "")
      update("consigneeOffice", "")
      update("consigneeReference", "")
      update("deliveryAddress", "")
      update("deliveryAddressManual", false)
      update("bookingNotes", "")
      update("customerIsConsignee", false)
    }

    const resetNotifyParty = () => {
      update("notifyParty", "")
      update("notifyPartyContact", "")
      update("notifyPartyOffice", "")
      update("notifyPartyReference", "")
      update("customerIsNotifyParty", false)
    }

    const resetAllParties = () => {
      resetCustomer()
      resetShipper()
      resetConsignee()
      resetNotifyParty()
    }

    return (
      <StepShell
        step={steps[1]}
        action={
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-[var(--md-radius-md)] bg-white/54 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/78 hover:text-[var(--md-accent)]"
            onClick={resetAllParties}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.8} />
            Reset all
          </button>
        }
      >
        <FieldGroup>
          <PartyRow
            label="Customer / Billing"
            company={data.customer}
            contact={data.customerContact}
            office={data.customerOffice}
            reference={data.customerReference}
            companyMissing={missing.has("Customer")}
            actions={
              <CustomerRoleCheckboxes
                isShipper={data.customerIsShipper}
                isConsignee={data.customerIsConsignee}
                isNotifyParty={data.customerIsNotifyParty}
                onShipperChange={copyCustomerToShipper}
                onConsigneeChange={copyCustomerToConsignee}
                onNotifyPartyChange={copyCustomerToNotifyParty}
              />
            }
            onCompanyReset={resetCustomer}
            onCompanyChange={updateCustomerCompany}
            onContactChange={updateCustomerContact}
            onOfficeChange={(value) => update("customerOffice", value)}
            onReferenceChange={(value) => update("customerReference", value)}
          />
          <PartyRow
            label="Shipper / Consignor"
            company={data.shipper}
            contact={data.shipperContact}
            office={data.shipperOffice}
            reference={data.supplierReference}
            companyMissing={missing.has("Shipper")}
            companyLocked={data.customerIsShipper && Boolean(data.customer)}
            onCompanyReset={resetShipper}
            onCompanyChange={(value) => {
              update("shipper", value)
              if (value !== data.customer) update("customerIsShipper", false)
            }}
            onContactChange={(value) => update("shipperContact", value)}
            onOfficeChange={(value) => update("shipperOffice", value)}
            onReferenceChange={(value) => update("supplierReference", value)}
          />
          <PartyRow
            label="Consignee"
            company={data.consignee}
            contact={data.consigneeContact}
            office={data.consigneeOffice}
            reference={data.consigneeReference}
            companyMissing={missing.has("Consignee")}
            companyLocked={data.customerIsConsignee && Boolean(data.customer)}
            onCompanyReset={resetConsignee}
            onCompanyChange={(value) => {
              update("consignee", value)
              if (value !== data.customer) update("customerIsConsignee", false)
            }}
            onContactChange={(value) => update("consigneeContact", value)}
            onOfficeChange={(value) => update("consigneeOffice", value)}
            onReferenceChange={(value) => update("consigneeReference", value)}
          />
          <PartyRow
            label="Notify Party"
            company={data.notifyParty}
            contact={data.notifyPartyContact}
            office={data.notifyPartyOffice}
            reference={data.notifyPartyReference}
            companyLocked={data.customerIsNotifyParty && Boolean(data.customer)}
            onCompanyReset={resetNotifyParty}
            onCompanyChange={(value) => {
              update("notifyParty", value)
              if (value !== data.customer) update("customerIsNotifyParty", false)
            }}
            onContactChange={(value) => update("notifyPartyContact", value)}
            onOfficeChange={(value) => update("notifyPartyOffice", value)}
            onReferenceChange={(value) => update("notifyPartyReference", value)}
          />
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 2) {
    const collectionAddressOptions = officesForCompany(data.shipper)
    const deliveryAddressOptions = officesForCompany(data.consignee)
    const setCollectionAddress = (value: string) => {
      update("collectionAddress", value)
      if (value) update("collectionAddressManual", false)
      if (!data.accessRestrictions.trim()) update("accessRestrictions", notesForOffice(value))
    }
    const setDeliveryAddress = (value: string) => {
      update("deliveryAddress", value)
      if (value) update("deliveryAddressManual", false)
      if (!data.bookingNotes.trim()) update("bookingNotes", notesForOffice(value))
    }

    return (
      <StepShell step={steps[2]}>
        <FieldGroup className="lg:grid-cols-2">
          <motion.section variants={fieldMotion} className={cn(fieldPanelClass, "grid content-start gap-3")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-medium text-[var(--md-ink)]">Collection</p>
              <p className="text-[12px] leading-5 text-[var(--md-text)]">Defaults from the shipper record.</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2 xl:gap-4">
              <div className="grid content-start gap-3">
                <AddressLookupField
                  label="Address lookup"
                  value={data.collectionAddress}
                  preferredOffices={collectionAddressOptions}
                  onSelect={setCollectionAddress}
                  placeholder={data.shipper ? "Start typing postcode or address" : "Select shipper first"}
                  required
                  missing={missing.has("Collection address")}
                />
                <BrandedCheckbox
                  label="Manually override address"
                  checked={data.collectionAddressManual}
                  onChange={(checked) => {
                    if (checked && data.collectionAddress && addressRecordForOffice(data.collectionAddress)) {
                      update("collectionAddress", fullAddressForOffice(data.collectionAddress))
                    }
                    update("collectionAddressManual", checked)
                  }}
                  className="w-fit"
                />
                <FieldShell label="Full address" required missing={missing.has("Collection address")}>
                  <Textarea
                    value={data.collectionAddressManual ? data.collectionAddress : fullAddressForOffice(data.collectionAddress)}
                    onChange={(event) => update("collectionAddress", event.target.value)}
                    readOnly={!data.collectionAddressManual}
                    placeholder="Enter the full collection address"
                    className={cn(
                      "min-h-[132px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface-tint)] px-3 py-2.5 text-[13px] leading-[18px]",
                      fieldBoundaryShadow,
                      missing.has("Collection address") && missingFieldClass,
                      !data.collectionAddressManual && "text-[var(--md-text)]",
                    )}
                    dir="auto"
                    aria-invalid={missing.has("Collection address") || undefined}
                  />
                </FieldShell>
              </div>
              <div className="grid content-start gap-3 xl:border-l xl:border-[rgba(90,103,100,0.14)] xl:pl-4">
                <FieldShell label="Collection dates" required missing={missing.has("Cargo ready from") || missing.has("Requested collection date")} asDiv>
                  <MultideckDateRangePicker
                    value={{ start: data.cargoReadyDate, end: data.requestedCollectionDate }}
                    onChange={(range) => {
                      update("cargoReadyDate", range.start ?? "")
                      update("requestedCollectionDate", range.end ?? "")
                    }}
                    placeholder="Select collection dates"
                    title="Collection dates"
                    description="Pick when cargo is ready, then the requested collection date."
                    startLabel="Cargo ready from"
                    endLabel="Requested collection date"
                    footerLabel="Selected collection dates"
                    missing={missing.has("Cargo ready from") || missing.has("Requested collection date")}
                  />
                </FieldShell>
                <TextField label="Collection reference" value={data.collectionReference} onChange={(value) => update("collectionReference", value)} placeholder="Gate pass, warehouse ref, supplier ref" dir="ltr" />
              </div>
            </div>
            <TextAreaField label="Collection notes" value={data.accessRestrictions} onChange={(value) => update("accessRestrictions", value)} placeholder="Default notes from the collection address, editable for this booking" helper="Later this can default from the selected shipper office or warehouse record." />
          </motion.section>

          <motion.section variants={fieldMotion} className={cn(fieldPanelClass, "grid content-start gap-3")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-medium text-[var(--md-ink)]">Delivery</p>
              <p className="text-[12px] leading-5 text-[var(--md-text)]">Defaults from the consignee record.</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2 xl:gap-4">
              <div className="grid content-start gap-3">
                <AddressLookupField
                  label="Address lookup"
                  value={data.deliveryAddress}
                  preferredOffices={deliveryAddressOptions}
                  onSelect={setDeliveryAddress}
                  placeholder={data.consignee ? "Start typing postcode or address" : "Select consignee first"}
                  required
                  missing={missing.has("Delivery address")}
                />
                <BrandedCheckbox
                  label="Manually override address"
                  checked={data.deliveryAddressManual}
                  onChange={(checked) => {
                    if (checked && data.deliveryAddress && addressRecordForOffice(data.deliveryAddress)) {
                      update("deliveryAddress", fullAddressForOffice(data.deliveryAddress))
                    }
                    update("deliveryAddressManual", checked)
                  }}
                  className="w-fit"
                />
                <FieldShell label="Full address" required missing={missing.has("Delivery address")}>
                  <Textarea
                    value={data.deliveryAddressManual ? data.deliveryAddress : fullAddressForOffice(data.deliveryAddress)}
                    onChange={(event) => update("deliveryAddress", event.target.value)}
                    readOnly={!data.deliveryAddressManual}
                    placeholder="Enter the full delivery address"
                    className={cn(
                      "min-h-[132px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface-tint)] px-3 py-2.5 text-[13px] leading-[18px]",
                      fieldBoundaryShadow,
                      missing.has("Delivery address") && missingFieldClass,
                      !data.deliveryAddressManual && "text-[var(--md-text)]",
                    )}
                    dir="auto"
                    aria-invalid={missing.has("Delivery address") || undefined}
                  />
                </FieldShell>
              </div>
              <div className="grid content-start gap-3 xl:border-l xl:border-[rgba(90,103,100,0.14)] xl:pl-4">
                <FieldShell label="Delivery dates" required missing={missing.has("Requested delivery date") || missing.has("Cargo required by")} asDiv>
                  <MultideckDateRangePicker
                    value={{ start: data.requestedDeliveryDate, end: data.cargoRequiredByDate }}
                    onChange={(range) => {
                      update("requestedDeliveryDate", range.start ?? "")
                      update("cargoRequiredByDate", range.end ?? "")
                    }}
                    placeholder="Select delivery dates"
                    title="Delivery dates"
                    description="Pick the requested delivery date, then the date cargo is required by."
                    startLabel="Requested delivery date"
                    endLabel="Cargo required by"
                    footerLabel="Selected delivery dates"
                    missing={missing.has("Requested delivery date") || missing.has("Cargo required by")}
                  />
                </FieldShell>
                <TextField label="Delivery reference" value={data.deliveryReference} onChange={(value) => update("deliveryReference", value)} placeholder="Booking slot, DC ref, customer ref" dir="ltr" />
              </div>
            </div>
            <TextAreaField label="Delivery notes" value={data.bookingNotes} onChange={(value) => update("bookingNotes", value)} placeholder="Default notes from the delivery address, editable for this booking" helper="Later this can default from the selected consignee office or delivery record." />
          </motion.section>
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 3) {
    const cargoTotals = cargoLineTotals(data.cargoLines)
    const canAddCargoLine = Boolean(cargoDraft.commodity.trim() && cargoDraft.outerPackages.trim() && cargoDraft.grossWeight.trim())

    return (
      <StepShell step={steps[3]}>
        <div className="grid gap-4">
          <motion.section variants={fieldMotion} className={cn(fieldPanelClass, "grid gap-3")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">Add cargo line</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Build the shipment from outer packages, inner packages, commodity and weights.</p>
              </div>
              <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white hover:bg-[#0b6f67] disabled:opacity-45" disabled={!canAddCargoLine} onClick={addCargoLine}>
                <Plus className="size-4" strokeWidth={1.6} />
                Add line
              </Button>
            </div>

            <motion.div variants={fieldListMotion} initial="hidden" animate="visible" className="flex flex-wrap items-start gap-3">
              <div className="min-w-[230px] flex-[1_1_270px]">
                <TextField label="Commodity" value={cargoDraft.commodity} onChange={(value) => updateCargoDraft("commodity", value)} placeholder="Retail apparel, machinery parts..." required missing={missing.has("Goods description") && !data.cargoLines.length} />
              </div>
              <div className="w-[94px] shrink-0">
                <NumberStepperField label="Outer pkgs" value={cargoDraft.outerPackages} onChange={(value) => updateCargoDraft("outerPackages", value)} placeholder="12" required missing={missing.has("Number of packages") && !data.cargoLines.length} />
              </div>
              <div className="w-[142px] shrink-0">
                <SelectField label="Outer type" value={cargoDraft.outerPackageType} onChange={(value) => updateCargoDraft("outerPackageType", value)} options={["Pallets", "Cartons", "Crates", "Bags", "Drums", "Cases", "Loose"]} />
              </div>
              <div className="w-[94px] shrink-0">
                <NumberStepperField label={`Inner per ${perOuterPackageLabel(cargoDraft.outerPackageType)}`} value={cargoDraft.innerPackages} onChange={(value) => updateCargoDraft("innerPackages", value)} placeholder="240" />
              </div>
              <div className="w-[150px] shrink-0">
                <SelectField label="Inner type" value={cargoDraft.innerPackageType} onChange={(value) => updateCargoDraft("innerPackageType", value)} options={["Cartons", "Units", "Pieces", "Bags", "Bottles", "Rolls", "Not applicable"]} />
              </div>
              <div className="w-[112px] shrink-0">
                <NumberStepperField label="Gross kg" value={cargoDraft.grossWeight} onChange={(value) => updateCargoDraft("grossWeight", value)} placeholder="12420" required missing={missing.has("Weight") && !data.cargoLines.length} />
              </div>
              <div className="w-[112px] shrink-0">
                <NumberStepperField label="Net kg" value={cargoDraft.netWeight} onChange={(value) => updateCargoDraft("netWeight", value)} placeholder="11880" />
              </div>
              <div className="w-[96px] shrink-0">
                <NumberStepperField label="CBM" value={cargoDraft.volume} onChange={(value) => updateCargoDraft("volume", value)} placeholder="58.4" step={0.1} decimals={1} />
              </div>
              <div className="w-[70px] shrink-0">
                <NumberStepperField label="H" value={cargoDraft.height} onChange={(value) => updateCargoDraft("height", value)} placeholder="120" />
              </div>
              <div className="w-[70px] shrink-0">
                <NumberStepperField label="W" value={cargoDraft.width} onChange={(value) => updateCargoDraft("width", value)} placeholder="80" />
              </div>
              <div className="w-[70px] shrink-0">
                <NumberStepperField label="D" value={cargoDraft.depth} onChange={(value) => updateCargoDraft("depth", value)} placeholder="160" />
              </div>
            </motion.div>
          </motion.section>

          <motion.section variants={fieldMotion} className={tablePanelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">Cargo lines</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
                  {data.cargoLines.length ? `${data.cargoLines.length} line${data.cargoLines.length === 1 ? "" : "s"} / ${formatCargoTotal(cargoTotals.outerPackages)} outer pkgs / ${formatCargoTotal(cargoTotals.grossWeight)} kg` : "Add at least one cargo line to complete this step."}
                </p>
              </div>
              {data.cargoLines.length ? (
                <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/58 px-3 text-[12px] font-medium text-[var(--md-red)] shadow-[var(--md-shadow-line)] hover:bg-[rgba(192,57,43,0.08)]" onClick={() => syncCargoSummary([])}>
                  Clear lines
                </Button>
              ) : null}
            </div>

            <div className="overflow-x-auto md-scrollbar">
              <table className="w-full min-w-[860px] border-t border-[rgba(11,20,19,0.06)] text-left">
                <thead className="bg-white/42">
                  <tr className="text-[11px] font-medium text-[var(--md-text)]">
                    <th className="px-4 py-2">Commodity</th>
                    <th className="px-3 py-2">Outer</th>
                    <th className="px-3 py-2">Inner</th>
                    <th className="px-3 py-2 text-right">Gross kg</th>
                    <th className="px-3 py-2 text-right">Net kg</th>
                    <th className="px-3 py-2 text-right">CBM</th>
                    <th className="px-3 py-2">Dimensions</th>
                    <th className="w-12 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.cargoLines.length ? data.cargoLines.map((line) => (
                    <tr key={line.id} className="border-t border-[rgba(11,20,19,0.05)] text-[13px] text-[var(--md-ink)]">
                      <td className="max-w-[230px] truncate px-4 py-3 font-medium" title={line.commodity}>{line.commodity}</td>
                      <td className="px-3 py-3">{line.outerPackages} {line.outerPackageType}</td>
                      <td className="px-3 py-3">{line.innerPackages ? `${line.innerPackages} ${line.innerPackageType} per ${perOuterPackageLabel(line.outerPackageType)}` : "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.grossWeight || "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.netWeight || "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.volume || "-"}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-[var(--md-text)]" title={formatCargoDimensions(line)}>{formatCargoDimensions(line) || "-"}</td>
                      <td className="px-3 py-2">
                        <button type="button" aria-label={`Remove cargo line ${line.commodity}`} className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-red)] transition-colors hover:bg-[rgba(192,57,43,0.08)]" onClick={() => removeCargoLine(line.id)}>
                          <Trash2 className="size-4" strokeWidth={1.6} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-[var(--md-text)]">
                        No cargo lines added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.section>

          <FieldGroup className="items-start lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
            <div className={cn(fieldPanelClass, "grid content-start gap-2")}>
              <p className="text-[13px] font-medium text-[var(--md-ink)]">Cargo flags</p>
              <ToggleTile label="Hazardous goods" checked={data.hazardousGoods} onChange={(value) => update("hazardousGoods", value)} />
              <ToggleTile label="Temperature controlled" checked={data.temperatureControlled} onChange={(value) => update("temperatureControlled", value)} />
              <ToggleTile label="Fragile or high value" checked={data.fragileOrHighValue} onChange={(value) => update("fragileOrHighValue", value)} />
              <ToggleTile label="Stackable" checked={data.stackable} onChange={(value) => update("stackable", value)} />
              <ToggleTile label="Perishable" checked={data.perishable} onChange={(value) => update("perishable", value)} />
            </div>
            <div className={cn(fieldPanelClass, "grid content-start gap-2")}>
              <TextAreaField label="Special notes" value={data.cargoSpecialNotes} onChange={(value) => update("cargoSpecialNotes", value)} placeholder="Cargo handling notes, stacking limits, perishability detail, segregation, marks, or other cargo-specific instructions" />
            </div>
          </FieldGroup>
        </div>
      </StepShell>
    )
  }

  if (activeStep === 4) {
    const collectionLocation = routeLocationForAddress(data.collectionAddress)
    const deliveryLocation = routeLocationForAddress(data.deliveryAddress)
    const canAddTransportLeg = Boolean(transportDraft.fromName.trim() && transportDraft.toName.trim())
    const linkedRoutePoints = [
      { label: "Collection point", address: data.collectionAddress, location: collectionLocation },
      { label: "Delivery point", address: data.deliveryAddress, location: deliveryLocation },
    ]

    return (
      <StepShell step={steps[4]}>
        <div className="grid gap-4">
          <FieldGroup className="lg:grid-cols-2">
            {linkedRoutePoints.map(({ label, address, location }) => (
              <motion.section key={label} variants={fieldMotion} className={cn(fieldPanelClass, "p-3")}>
                <p className="text-[12px] font-medium uppercase text-[var(--md-subtle)]">{label}</p>
                <p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]">{address || "Not set"}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className={cn("rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-2.5 py-2", fieldBoundaryShadow)}>
                    <span className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase text-[var(--md-subtle)]">
                      UN/LOCODE
                      <DexterCodeHint />
                    </span>
                    <span className="mt-1 block truncate text-[12px] font-medium text-[var(--md-ink)]">{location.code || "-"}</span>
                  </span>
                  <span className={cn("rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-2.5 py-2", fieldBoundaryShadow)}>
                    <span className="block text-[10px] font-medium uppercase text-[var(--md-subtle)]">Name</span>
                    <span className="mt-1 block truncate text-[12px] font-medium text-[var(--md-ink)]">{location.name || "-"}</span>
                  </span>
                  <span className={cn("rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-2.5 py-2", fieldBoundaryShadow)}>
                    <span className="block text-[10px] font-medium uppercase text-[var(--md-subtle)]">Country</span>
                    <span className="mt-1 block truncate text-[12px] font-medium text-[var(--md-ink)]">{location.country || "-"}</span>
                  </span>
                </div>
              </motion.section>
            ))}
          </FieldGroup>

          <motion.section variants={fieldMotion} className={cn(fieldPanelClass, "grid gap-3")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">Add route leg</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Use UN/LOCODEs for ports and airport codes where relevant. Add legs for air-sea and sea-air routings.</p>
              </div>
              <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white hover:bg-[#0b6f67] disabled:opacity-45" disabled={!canAddTransportLeg} onClick={addTransportLeg}>
                <Plus className="size-4" strokeWidth={1.6} />
                Add leg
              </Button>
            </div>

            <div className="grid gap-3">
              <FieldGroup className="md:grid-cols-2 xl:grid-cols-5">
                <SelectField label="Leg mode" value={transportDraft.mode} onChange={(value) => updateTransportMode(value as BookingModeOption)} options={["Sea", "Air", "Road", "Courier", "Rail"]} />
                <SelectField label="Leg type" value={transportDraft.legType} onChange={(value) => updateTransportDraft("legType", value)} options={legTypeOptionsForMode(transportDraft.mode)} />
              </FieldGroup>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] xl:items-start">
                <div className={cn("grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3", fieldBoundaryShadow)}>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">From</p>
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]">
                      <TextField label="Code" value={transportDraft.fromCode} onChange={(value) => updateTransportDraft("fromCode", value.toUpperCase())} placeholder="CNSHA / PVG" dir="ltr" action={<DexterCodeHint />} />
                      <TextField label="Name" value={transportDraft.fromName} onChange={(value) => updateTransportDraft("fromName", value)} placeholder="Shanghai" required missing={missing.has("First origin") && !data.transportLegs.length} />
                      <TextField label="Country" value={transportDraft.fromCountry} onChange={(value) => updateTransportDraft("fromCountry", value)} placeholder="China" />
                    </div>
                  </div>
                </div>

                <div className="hidden h-full min-h-[96px] items-center justify-center xl:flex">
                  <span className="grid size-8 place-items-center rounded-full bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                    <ArrowRight className="size-4" strokeWidth={1.55} />
                  </span>
                </div>

                <div className={cn("grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3", fieldBoundaryShadow)}>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">To</p>
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]">
                      <TextField label="Code" value={transportDraft.toCode} onChange={(value) => updateTransportDraft("toCode", value.toUpperCase())} placeholder="GBFXT / LHR" dir="ltr" action={<DexterCodeHint />} />
                      <TextField label="Name" value={transportDraft.toName} onChange={(value) => updateTransportDraft("toName", value)} placeholder="Felixstowe" required missing={missing.has("Final destination") && !data.transportLegs.length} />
                      <TextField label="Country" value={transportDraft.toCountry} onChange={(value) => updateTransportDraft("toCountry", value)} placeholder="United Kingdom" />
                    </div>
                  </div>
                </div>
              </div>

              <FieldShell label="Leg dates" required={data.mode === "Sea" || data.mode === "Air"} missing={!data.transportLegs.length && (missing.has("ETD") || missing.has("ETA"))} asDiv>
                <MultideckDateRangePicker
                  value={{ start: transportDraft.etd, end: transportDraft.eta }}
                  onChange={(range) => {
                    updateTransportDraft("etd", range.start ?? "")
                    updateTransportDraft("eta", range.end ?? "")
                  }}
                  placeholder="Select ETD and ETA"
                  title="Leg dates"
                  description="Pick the estimated departure date, then the estimated arrival date."
                  startLabel="ETD"
                  endLabel="ETA"
                  footerLabel="Selected leg dates"
                  missing={!data.transportLegs.length && (missing.has("ETD") || missing.has("ETA"))}
                />
              </FieldShell>

              <FieldGroup className="lg:grid-cols-2">
                <TextField label="Carrier / line" value={transportDraft.carrier} onChange={(value) => updateTransportDraft("carrier", value)} placeholder="COSCO, LH Cargo, Maersk..." />
                <TextField label="Leg ref" value={transportDraft.reference} onChange={(value) => updateTransportDraft("reference", value)} placeholder="Vessel, flight, trailer, booking ref" dir="ltr" />
              </FieldGroup>
              <TextAreaField label="Leg notes" value={transportDraft.notes} onChange={(value) => updateTransportDraft("notes", value)} placeholder="Handling notes, transhipment detail, delivery instructions, or carrier-specific requirements" />
            </div>
          </motion.section>

          <motion.section variants={fieldMotion} className={tablePanelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">Route legs</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{data.transportLegs.length ? `${data.transportLegs.length} leg${data.transportLegs.length === 1 ? "" : "s"} added` : "Add the first leg to build the operational route."}</p>
              </div>
              {data.transportLegs.length ? (
                <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/58 px-3 text-[12px] font-medium text-[var(--md-red)] shadow-[var(--md-shadow-line)] hover:bg-[rgba(192,57,43,0.08)]" onClick={() => syncTransportLegs([])}>
                  Clear route
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto md-scrollbar">
              <table className="w-full min-w-[1080px] border-t border-[rgba(11,20,19,0.06)] text-left">
                <thead className="bg-white/42">
                  <tr className="text-[11px] font-medium text-[var(--md-text)]">
                    <th className="px-4 py-2">Leg</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2">To</th>
                    <th className="px-3 py-2">Carrier / line</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">ETD</th>
                    <th className="px-3 py-2">ETA</th>
                    <th className="px-3 py-2">Notes</th>
                    <th className="w-12 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.transportLegs.length ? data.transportLegs.map((leg, index) => (
                    <tr key={leg.id} className="border-t border-[rgba(11,20,19,0.05)] text-[13px] text-[var(--md-ink)]">
                      <td className="px-4 py-3 font-medium">{index + 1}. {leg.mode}</td>
                      <td className="px-3 py-3">{leg.legType || "-"}</td>
                      <td className="px-3 py-3"><span className="font-medium">{leg.fromCode || "-"}</span><span className="block text-[12px] text-[var(--md-text)]">{leg.fromName}{leg.fromCountry ? `, ${leg.fromCountry}` : ""}</span></td>
                      <td className="px-3 py-3"><span className="font-medium">{leg.toCode || "-"}</span><span className="block text-[12px] text-[var(--md-text)]">{leg.toName}{leg.toCountry ? `, ${leg.toCountry}` : ""}</span></td>
                      <td className="px-3 py-3">{leg.carrier || "-"}</td>
                      <td className="px-3 py-3">{leg.reference || "-"}</td>
                      <td className="px-3 py-3">{leg.etd || "-"}</td>
                      <td className="px-3 py-3">{leg.eta || "-"}</td>
                      <td className="max-w-[220px] px-3 py-3"><span className="line-clamp-2">{leg.notes || "-"}</span></td>
                      <td className="px-3 py-2">
                        <button type="button" aria-label={`Remove route leg ${index + 1}`} className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-red)] transition-colors hover:bg-[rgba(192,57,43,0.08)]" onClick={() => removeTransportLeg(leg.id)}>
                          <Trash2 className="size-4" strokeWidth={1.6} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-[13px] text-[var(--md-text)]">No route legs added yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.section>
        </div>
      </StepShell>
    )
  }

  if (activeStep === 5) {
    const customsPartyOptions = Array.from(new Set([data.shipper, data.consignee, data.customer, data.notifyParty, "Third party / broker nominated"].filter(Boolean)))

    return (
      <StepShell step={steps[5]}>
        <div className="grid gap-4">
          <FieldGroup className="items-start lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
            <div className={cn(fieldPanelClass, "grid gap-3")}>
              <p className="text-[14px] font-medium text-[var(--md-ink)]">Clearance ownership</p>
              <div className="grid gap-3 lg:grid-cols-2">
                <TextField label="Export broker" value={data.exportBroker} onChange={(value) => update("exportBroker", value)} placeholder="Broker or agent handling export clearance" required missing={missing.has("Export broker")} />
                <TextField label="Import broker" value={data.importBroker} onChange={(value) => update("importBroker", value)} placeholder="Broker or agent handling import clearance" required missing={missing.has("Import broker")} />
                <SelectField label="Registered exporter" value={data.registeredExporter} onChange={(value) => update("registeredExporter", value)} options={customsPartyOptions} placeholder="Select exporter" required missing={missing.has("Registered exporter")} />
                <SelectField label="Registered importer" value={data.registeredImporter} onChange={(value) => update("registeredImporter", value)} options={customsPartyOptions} placeholder="Select importer" required missing={missing.has("Registered importer")} />
                <div className="lg:col-span-2">
                  <SelectField label="VAT and duty paid by" value={data.vatDutyPayment} onChange={(value) => update("vatDutyPayment", value)} options={["Importer deferment account", "Importer direct payment", "Customer account", "Freight forwarder disbursement", "Broker deferment account", "To be confirmed"]} placeholder="Select payment owner" required missing={missing.has("VAT and duty payment")} />
                </div>
              </div>
            </div>
            <div className={cn(fieldPanelClass, "grid content-start gap-2")}>
              <p className="text-[13px] font-medium text-[var(--md-ink)]">Documents supplied</p>
              <ToggleTile label="Commercial invoice required" checked={data.commercialInvoice} onChange={(value) => update("commercialInvoice", value)} />
              <ToggleTile label="Packing list required" checked={data.packingList} onChange={(value) => update("packingList", value)} />
              <ToggleTile label="Certificates required" checked={data.certificates} onChange={(value) => update("certificates", value)} />
            </div>
          </FieldGroup>
          <FieldGroup className="lg:grid-cols-3">
            <TextAreaField label="Customs notes" value={data.customsNotes} onChange={(value) => update("customsNotes", value)} placeholder="Broker handoff, declaration owner, known risks, or timing notes" />
            <TextAreaField label="Compliance requirements" value={data.complianceRequirements} onChange={(value) => update("complianceRequirements", value)} placeholder="Licences, declarations, sanctions checks, controlled goods, or special compliance handling" />
            <TextAreaField label="Certificate requirements" value={data.certificateRequirements} onChange={(value) => update("certificateRequirements", value)} placeholder="Certificate of origin, health certificate, phytosanitary, MSDS, inspection certificates..." />
          </FieldGroup>
        </div>
      </StepShell>
    )
  }

  const missingAll = allMissingFieldItems(data)
  const sections = [
    ["Booking type", `${data.direction} ${data.mode}`],
    ["Parties", `${data.customer || "No customer"} / ${data.shipper || "No shipper"} / ${data.consignee || "No consignee"}`],
    ["Collection and delivery", [data.collectionAddress, data.deliveryAddress].filter(Boolean).join(" to ") || "Locations missing"],
    ["Cargo details", buildCargoSummary(data)],
    ["Transport details", buildTransportEta(data) || "Transport dates missing"],
    ["Customs and compliance", [data.exportBroker && `Export: ${data.exportBroker}`, data.importBroker && `Import: ${data.importBroker}`, data.vatDutyPayment].filter(Boolean).join(" / ") || "Customs allocation missing"],
  ] as const

  return (
    <StepShell step={steps[6]}>
      <div className="grid gap-4">
        {missingAll.length ? (
          <div className="rounded-[var(--md-radius-xl)] bg-[rgba(221,138,43,0.1)] p-3 shadow-[inset_0_0_0_1px_rgba(221,138,43,0.22),0_0_0_1px_rgba(221,138,43,0.06)]">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 size-5 text-[var(--md-amber)]" strokeWidth={1.35} />
              <div>
                <h2 className="text-[14px] font-medium text-[var(--md-ink)]">Missing required fields</h2>
                <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">Fill these before creating the booking.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {missingAll.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="rounded-full bg-white/62 px-3 py-1.5 text-[12px] font-medium text-[var(--md-amber)] shadow-[var(--md-shadow-line)] transition-[background,box-shadow,transform] hover:scale-[1.02] hover:bg-white/82"
                  onClick={() => goToStep(item.stepIndex, focusLabelForMissingField(item.field))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--md-radius-xl)] bg-[rgba(46,142,96,0.1)] p-3 shadow-[inset_0_0_0_1px_rgba(46,142,96,0.24),0_0_0_1px_rgba(46,142,96,0.06)]">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-green)] text-white">
                <Check className="size-4" strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-[14px] font-medium text-[var(--md-ink)]">Ready to create</h2>
                <p className="mt-1 text-[13px] text-[var(--md-text)]">The core booking record has enough detail for the demo handoff.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {sections.map(([title, value], index) => (
            <motion.div
              key={title}
              variants={fieldMotion}
              initial="hidden"
              animate="visible"
              className={cn(fieldPanelClass, "grid gap-3 md:grid-cols-[minmax(140px,220px)_minmax(0,1fr)_auto] md:items-center")}
            >
              <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
              <p className="text-[13px] leading-5 text-[var(--md-text)]" dir="auto">{value}</p>
              <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]" onClick={() => goToStep(index)}>
                Edit
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </StepShell>
  )
}

function SuccessState({ data, navigate, onRestart }: { data: BookingWizardData; navigate: (path: string) => void; onRestart: () => void }) {
  return (
    <Surface padding="lg" className="overflow-hidden rounded-[var(--md-radius-2xl)]">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div>
          <span className="grid size-12 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-white shadow-[0_18px_36px_rgba(14,125,116,0.22)]">
            <PackageCheck className="size-6" strokeWidth={1.45} />
          </span>
          <h1 className="mt-5 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Booking created</h1>
          <p className="mt-3 max-w-[640px] text-[14px] leading-6 text-[var(--md-text)]">
            {data.internalReference} is ready as a local prototype record. The flow can be restarted or the operator can return to the Bookings list.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[#0b6f67]" onClick={() => navigate("/bookings")}>
              View bookings
            </Button>
            <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/56 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/76" onClick={onRestart}>
              Create another
            </Button>
          </div>
        </div>
        <LiveSummaryPanel data={data} activeStep={7} />
      </div>
    </Surface>
  )
}

export function BookingWizardPage({ navigate }: { navigate: (path: string) => void }) {
  const [data, setData] = useState<BookingWizardData>(defaultBooking)
  const [activeStep, setActiveStep] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [focusFieldLabel, setFocusFieldLabel] = useState("")
  const [bookingTypeStage, setBookingTypeStage] = useState<BookingTypeStage>("movement")

  const showingSource = data.source === null
  const missingCurrent = useMemo(() => missingFieldsForStep(data, activeStep), [activeStep, data])
  const canCreate = allMissingFields(data).length === 0

  useEffect(() => {
    if (!focusFieldLabel) return

    const timer = window.setTimeout(() => {
      const escapedLabel = focusFieldLabel.replace(/"/g, '\\"')
      const target = document.querySelector<HTMLElement>(`[data-field-label="${escapedLabel}"]`)
      const control = target?.querySelector<HTMLElement>("input, select, textarea, button")

      target?.scrollIntoView({ behavior: "smooth", block: "center" })
      control?.focus({ preventScroll: true })
      setFocusFieldLabel("")
    }, 80)

    return () => window.clearTimeout(timer)
  }, [activeStep, focusFieldLabel])

  useEffect(() => {
    setData((current) => {
      const collectionAddress = current.collectionAddress || current.shipperOffice
      const deliveryAddress = current.deliveryAddress || current.consigneeOffice
      const accessRestrictions = current.accessRestrictions || notesForOffice(collectionAddress)
      const bookingNotes = current.bookingNotes || notesForOffice(deliveryAddress)

      if (
        collectionAddress === current.collectionAddress &&
        deliveryAddress === current.deliveryAddress &&
        accessRestrictions === current.accessRestrictions &&
        bookingNotes === current.bookingNotes
      ) {
        return current
      }

      return {
        ...current,
        collectionAddress,
        deliveryAddress,
        accessRestrictions,
        bookingNotes,
      }
    })
  }, [data.shipperOffice, data.consigneeOffice])

  function update<K extends keyof BookingWizardData>(field: K, value: BookingWizardData[K]) {
    setData((current) => ({ ...current, [field]: value }))
  }

  function applyExistingBooking(bookingId: string) {
    const booking = bookings.find((item) => item.id === bookingId)
    if (!booking) return defaultBooking
    const [origin = "", destination = ""] = booking.route.split(" -> ").length > 1 ? booking.route.split(" -> ") : booking.route.split("→").map((part) => part.trim())

    const bookingMode = normalizeBookingMode(booking.mode)
    const isAirBooking = bookingMode === "Air"

    return {
      ...defaultBooking,
      source: "existing" as const,
      templateBookingId: booking.id,
      bookingNumber: booking.id,
      bookingCustomer: booking.customer,
      direction: bookingMode === "Road" ? "Export" as const : "Import" as const,
      mode: bookingMode,
      customer: booking.customer,
      customerContact: contactsForOffice(booking.customer, officesForCompany(booking.customer)[0] ?? "")[0] ?? defaultContactForCompany(booking.customer),
      customerOffice: officesForCompany(booking.customer)[0] ?? "",
      customerReference: booking.customerRef,
      shipper: "Yong Hua Logistics",
      shipperContact: "Wei Chen",
      shipperOffice: "Shanghai export office",
      supplierReference: booking.supplierRef,
      consignee: booking.destination.includes("Felixstowe") ? "Marlow UK DC" : booking.customer,
      consigneeContact: booking.destination.includes("Felixstowe") ? "Warehouse team" : contactsForOffice(booking.customer, officesForCompany(booking.customer)[0] ?? "")[0] ?? defaultContactForCompany(booking.customer),
      consigneeOffice: booking.destination.includes("Felixstowe") ? "Felixstowe distribution centre" : officesForCompany(booking.customer)[0] ?? "",
      consigneeReference: booking.customerRef,
      notifyParty: "Customs broker",
      notifyPartyContact: "Broker team",
      notifyPartyOffice: "London customs desk",
      notifyPartyReference: booking.jobRef,
      internalReference: booking.jobRef.replace("JOB", "BK"),
      collectionAddress: "Shanghai export office",
      deliveryAddress: booking.destination.includes("Felixstowe") ? "Felixstowe distribution centre" : officesForCompany(booking.customer)[0] ?? "",
      cargoReadyDate: booking.departureDate,
      requestedCollectionDate: booking.departureDate,
      requestedDeliveryDate: booking.arrivalDate,
      cargoRequiredByDate: booking.arrivalDate,
      collectionReference: booking.supplierRef,
      deliveryReference: booking.customerRef,
      accessRestrictions: notesForOffice("Shanghai export office"),
      bookingNotes: notesForOffice(booking.destination.includes("Felixstowe") ? "Felixstowe distribution centre" : officesForCompany(booking.customer)[0] ?? ""),
      goodsDescription: booking.customFields[0]?.value ?? "Repeat booking cargo",
      packages: booking.container.includes("ULD") ? "1" : "120",
      packageType: booking.container.includes("ULD") ? "ULD" : "Cartons",
      weight: isAirBooking ? "1840" : "12420",
      volume: isAirBooking ? "9.2" : "58.4",
      cargoLines: [{
        id: `cargo-line-${booking.id}`,
        commodity: booking.customFields[0]?.value ?? "Repeat booking cargo",
        outerPackages: booking.container.includes("ULD") ? "1" : "120",
        outerPackageType: booking.container.includes("ULD") ? "ULD" : "Cartons",
        innerPackages: booking.container.includes("ULD") ? "" : "20",
        innerPackageType: booking.container.includes("ULD") ? "Not applicable" : "Cartons",
        grossWeight: isAirBooking ? "1840" : "12420",
        netWeight: isAirBooking ? "1720" : "11880",
        volume: isAirBooking ? "9.2" : "58.4",
        height: booking.container.includes("ULD") ? "" : "120",
        width: booking.container.includes("ULD") ? "" : "80",
        depth: booking.container.includes("ULD") ? "" : "160",
        dimensions: booking.container.includes("ULD") ? "ULD profile" : "120 x 80 x 160",
      }],
      containerType: booking.container,
      containerInfo: booking.container,
      stackable: true,
      perishable: false,
      cargoSpecialNotes: booking.status === "Exception" ? "Check cargo exception notes before release." : "",
      portOfLoading: origin,
      portOfDischarge: destination,
      vessel: booking.vessel,
      seaEtd: booking.departureDate,
      seaEta: booking.arrivalDate,
      airportDeparture: origin,
      airportArrival: destination,
      airline: booking.carrier,
      airEtd: booking.departureDate,
      airEta: booking.arrivalDate,
      roadCollectionPoint: origin,
      roadDeliveryPoint: destination,
      plannedCollectionDate: booking.departureDate,
      plannedDeliveryDate: booking.arrivalDate,
      transportLegs: [{
        id: `transport-leg-${booking.id}`,
        legType: "Main Leg",
        mode: bookingMode,
        fromCode: origin.includes(",") ? origin.split(",")[0].trim().toUpperCase().slice(0, 5) : origin.toUpperCase().slice(0, 5),
        fromName: origin,
        fromCountry: "",
        toCode: destination.includes(",") ? destination.split(",")[0].trim().toUpperCase().slice(0, 5) : destination.toUpperCase().slice(0, 5),
        toName: destination,
        toCountry: "",
        carrier: booking.carrier,
        reference: booking.vessel,
        etd: booking.departureDate,
        eta: booking.arrivalDate,
        notes: "",
      }],
      customsStatus: booking.status === "Exception" ? "Held" : "Ready to submit",
      commodityCode: booking.customFields.find((field) => field.label.toLowerCase().includes("hs"))?.value ?? "",
      exportBroker: "Shanghai broker handoff",
      importBroker: booking.destination.includes("Felixstowe") ? "London customs desk" : "Rotterdam clearance desk",
      registeredExporter: "Yong Hua Logistics",
      registeredImporter: booking.destination.includes("Felixstowe") ? "Marlow UK DC" : booking.customer,
      vatDutyPayment: "Importer deferment account",
      certificateRequirements: "Commercial invoice and packing list required before broker handoff.",
    }
  }

  function applyCustomerQuote(quoteId: string) {
    const quote = customerQuotes.find((item) => item.id === quoteId)
    if (!quote) return

    const [origin = "", destination = ""] = quote.route.split(" -> ")
    const firstOffice = officesForCompany(quote.customer)[0] ?? ""
    const quoteMode: BookingModeOption = quote.detail.toLowerCase().includes("air")
      ? "Air"
      : quote.route.includes("Milano") || quote.route.includes("Hamburg -> Milano")
        ? "Road"
        : "Sea"

    setData((current) => ({
      ...current,
      source: "quote",
      quoteNumber: quote.id,
      quoteCustomer: quote.customer,
      quoteReference: quote.id,
      customer: quote.customer,
      customerOffice: current.customerOffice || firstOffice,
      customerContact: current.customerContact || defaultContactForCompany(quote.customer),
      customerReference: quote.id,
      direction: quoteMode === "Road" ? "Export" : current.direction,
      mode: quoteMode,
      goodsDescription: current.goodsDescription || quote.detail,
      portOfLoading: current.portOfLoading || origin,
      portOfDischarge: current.portOfDischarge || destination,
      internalReference: current.internalReference || `BK-${quote.id.replace("QT-", "")}`,
    }))
  }

  function applyExistingBookingToState(bookingId: string) {
    setData(applyExistingBooking(bookingId))
  }

  function startFlow(source: Exclude<BookingSource, null>) {
    setData((current) => ({
      ...current,
      source,
      ...(source === "scratch" ? {
        quoteNumber: "",
        quoteCustomer: "",
        bookingNumber: "",
        bookingCustomer: "",
        templateBookingId: "",
      } : {}),
    }))
    setActiveStep(0)
    setBookingTypeStage(source === "scratch" ? "movement" : "source")
  }

  function requestStepChange(targetStep: number, focusLabel?: string) {
    if (targetStep <= activeStep) {
      if (targetStep === 0) {
        if (focusLabel === "Quote number" || focusLabel === "Booking number") setBookingTypeStage("source")
        else if (focusLabel || activeStep > 0) setBookingTypeStage("movement")
      }
      setActiveStep(targetStep)
      if (focusLabel) setFocusFieldLabel(focusLabel)
      return
    }

    const blockingStep = steps.slice(0, targetStep).findIndex((_, index) => missingFieldsForStep(data, index).length > 0)

    if (blockingStep !== -1) {
      const missing = missingFieldsForStep(data, blockingStep)
      setActiveStep(blockingStep)
      toast.warning("Complete required fields first", {
        description: `${steps[blockingStep].name}: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? "..." : ""}`,
      })
      return
    }

    setActiveStep(targetStep)
    if (focusLabel) setFocusFieldLabel(focusLabel)
  }

  function goNext() {
    if (activeStep < steps.length - 1) {
      if (activeStep === 0 && bookingTypeStage === "source" && data.source !== "scratch") {
        const sourceMissing = data.source === "quote" && !data.quoteNumber.trim()
          ? ["Customer quote"]
          : data.source === "existing" && !data.templateBookingId
            ? ["Existing booking"]
            : []

        if (sourceMissing.length) {
          toast.warning("Select the source first", {
            description: sourceMissing.join(", "),
          })
          return
        }

        setBookingTypeStage("movement")
        return
      }

      if (missingCurrent.length) {
        toast.warning("Complete required fields first", {
          description: missingCurrent.slice(0, 3).join(", "),
        })
        return
      }
      setActiveStep((current) => current + 1)
      return
    }
    if (!canCreate) {
      toast.warning("Required fields still missing", {
        description: "Review the highlighted sections before creating the booking.",
      })
      return
    }
    setShowSuccess(true)
    toast.success("Booking created", {
      description: `${data.internalReference} is ready in the local prototype.`,
    })
  }

  function restart() {
    setData(defaultBooking)
    setActiveStep(0)
    setBookingTypeStage("movement")
    setShowSuccess(false)
  }

  return (
    <div className="md-page md-page-stack">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button type="button" className="-mx-2 flex w-fit items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-1.5 text-[13px] font-medium text-[var(--md-text)] transition-colors hover:bg-white/42 hover:text-[var(--md-ink)]" onClick={() => navigate("/bookings")}>
          <ArrowLeft className="size-4" strokeWidth={1.25} />
          Bookings
        </button>
        <StatusPill tone={data.source === "existing" ? "blue" : data.source === "quote" ? "teal" : data.source === "scratch" ? "teal" : "neutral"}>
          {data.source === "existing" ? "Using existing booking" : data.source === "quote" ? "Using customer quote" : data.source === "scratch" ? "Creating from scratch" : "Choose starting point"}
        </StatusPill>
      </div>

      <AnimatePresence mode="wait">
        {showSuccess ? (
          <SuccessState key="success" data={data} navigate={navigate} onRestart={restart} />
        ) : showingSource ? (
          <SourceScreen key="source" onStart={startFlow} />
        ) : (
          <motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid min-h-[calc(100svh-168px)] gap-4 xl:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex min-w-0 flex-col gap-4">
              <WizardProgress activeStep={activeStep} data={data} bookingTypeStage={bookingTypeStage} onStepChange={requestStepChange} />
              <AnimatePresence mode="wait">
                <motion.div key={steps[activeStep].id} variants={stepMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="pb-24">
                  <StepContent
                    key={activeStep}
                    activeStep={activeStep}
                    data={data}
                    update={update}
                    goToStep={requestStepChange}
                    onApplyExistingBooking={applyExistingBookingToState}
                    onApplyCustomerQuote={applyCustomerQuote}
                    bookingTypeStage={bookingTypeStage}
                    onBookingTypeStageChange={setBookingTypeStage}
                  />
                </motion.div>
              </AnimatePresence>

              <details className="rounded-[var(--md-radius-xl)] bg-[rgba(250,253,252,0.94)] p-2 shadow-[var(--md-shadow-line)] backdrop-blur-xl xl:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-2 text-[13px] font-medium text-[var(--md-ink)]">
                  Live booking summary
                  <Ship className="size-4 text-[var(--md-accent)]" strokeWidth={1.35} />
                </summary>
                <LiveSummaryPanel data={data} activeStep={activeStep} />
              </details>

              <div className="fixed bottom-0 left-0 right-0 z-40 mt-auto flex items-center justify-between gap-2 bg-[rgba(250,253,252,0.94)] px-[var(--md-page-pad)] py-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl lg:left-[var(--md-sidebar-width)]">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 shrink-0 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-white/64 hover:text-[var(--md-ink)] sm:px-4"
                  onClick={() => {
                    if (activeStep === 0 && bookingTypeStage === "movement" && data.source !== "scratch") setBookingTypeStage("source")
                    else if (activeStep === 0) update("source", null)
                    else setActiveStep((current) => current - 1)
                  }}
                >
                  <ArrowLeft className="size-4" strokeWidth={1.35} />
                  {activeStep === 0 && bookingTypeStage === "movement" && data.source !== "scratch" ? "Source" : activeStep === 0 ? "Change start" : "Back"}
                </Button>
                <div className="flex min-w-0 items-center justify-end gap-2">
                  {missingCurrent.length ? <p className="hidden text-[12px] font-medium text-[var(--md-amber)] md:block">{missingCurrent.length} required field{missingCurrent.length === 1 ? "" : "s"} still missing</p> : null}
                  <Button
                    type="button"
                    className="h-10 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white hover:bg-[#0b6f67] sm:px-4"
                    onClick={goNext}
                    disabled={activeStep === steps.length - 1 && !canCreate}
                  >
                    {activeStep === steps.length - 1 ? "Create Booking" : "Continue"}
                    {activeStep === steps.length - 1 ? <Check className="size-4" strokeWidth={1.55} /> : <ArrowRight className="size-4" strokeWidth={1.35} />}
                  </Button>
                </div>
              </div>
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-[88px]">
                <LiveSummaryPanel data={data} activeStep={activeStep} />
              </div>
            </aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
