import { useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  PackageCheck,
  Search,
  Ship,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { bookings } from "@/data/multideck-data"
import { cn } from "@/lib/utils"

type BookingSource = "scratch" | "existing" | null
type BookingModeOption = "Sea" | "Air" | "Road" | "Courier"
type BookingDirection = "Import" | "Export"
type BookingScope = "International" | "Domestic"

type BookingWizardData = {
  source: BookingSource
  templateBookingId: string
  direction: BookingDirection
  mode: BookingModeOption
  movementScope: BookingScope
  collectionRequired: boolean
  deliveryRequired: boolean
  customer: string
  customerContact: string
  customerEmail: string
  shipper: string
  shipperContact: string
  consignee: string
  consigneeContact: string
  notifyParty: string
  collectionAddress: string
  deliveryAddress: string
  collectionDate: string
  collectionTime: string
  deliveryDate: string
  deliveryTime: string
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
  customsStatus: string
  commodityCode: string
  eoriVat: string
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
  { id: "type", name: "Booking Type", eyebrow: "Step 1", title: "What kind of movement is this?", summary: "Mode, direction, scope, and collection/delivery needs." },
  { id: "parties", name: "Parties", eyebrow: "Step 2", title: "Who is involved?", summary: "Customer, shipper, consignee, notify party, and contacts." },
  { id: "collection", name: "Collection and Delivery", eyebrow: "Step 3", title: "Where and when does it move?", summary: "Addresses, timings, references, restrictions, and notes." },
  { id: "cargo", name: "Cargo Details", eyebrow: "Step 4", title: "What are we moving?", summary: "Goods, packages, dimensions, risk flags, and equipment." },
  { id: "transport", name: "Transport Details", eyebrow: "Step 5", title: "Which transport details matter?", summary: "Fields change based on the selected booking mode." },
  { id: "customs", name: "Customs and Compliance", eyebrow: "Step 6", title: "What needs clearing?", summary: "Customs status, codes, documents, and compliance notes." },
  { id: "charges", name: "Charges and References", eyebrow: "Step 7", title: "Which references and charges belong here?", summary: "Customer, supplier, quote, PO, buying, selling, and ops notes." },
  { id: "review", name: "Review and Create", eyebrow: "Step 8", title: "Review before creating", summary: "Check each section, fix missing fields, then create the booking." },
]

const today = "2026-06-18"
const tomorrow = "2026-06-19"

const defaultBooking: BookingWizardData = {
  source: null,
  templateBookingId: "",
  direction: "Import",
  mode: "Sea",
  movementScope: "International",
  collectionRequired: true,
  deliveryRequired: true,
  customer: "",
  customerContact: "",
  customerEmail: "",
  shipper: "",
  shipperContact: "",
  consignee: "",
  consigneeContact: "",
  notifyParty: "",
  collectionAddress: "",
  deliveryAddress: "",
  collectionDate: today,
  collectionTime: "09:00",
  deliveryDate: tomorrow,
  deliveryTime: "14:00",
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
  customsStatus: "Not started",
  commodityCode: "",
  eoriVat: "",
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

function isFilled(value: string) {
  return value.trim().length > 0
}

function getRequiredFields(data: BookingWizardData, stepIndex: number) {
  const fields: Array<[keyof BookingWizardData, string]> = []

  if (stepIndex === 0) fields.push(["direction", "Direction"], ["mode", "Mode"], ["movementScope", "Domestic or international"])
  if (stepIndex === 1) fields.push(["customer", "Customer"], ["shipper", "Shipper"], ["consignee", "Consignee"])
  if (stepIndex === 2) fields.push(["collectionAddress", "Collection address"], ["deliveryAddress", "Delivery address"], ["collectionDate", "Collection date"], ["deliveryDate", "Delivery date"])
  if (stepIndex === 3) fields.push(["goodsDescription", "Goods description"], ["packages", "Number of packages"], ["weight", "Weight"])
  if (stepIndex === 4 && data.mode === "Sea") fields.push(["portOfLoading", "Port of loading"], ["portOfDischarge", "Port of discharge"], ["seaEtd", "ETD"], ["seaEta", "ETA"])
  if (stepIndex === 4 && data.mode === "Air") fields.push(["airportDeparture", "Airport of departure"], ["airportArrival", "Airport of arrival"], ["airline", "Airline"], ["airEtd", "ETD"], ["airEta", "ETA"])
  if (stepIndex === 4 && data.mode === "Road") fields.push(["roadCollectionPoint", "Collection point"], ["roadDeliveryPoint", "Delivery point"], ["vehicleType", "Vehicle type"], ["plannedCollectionDate", "Planned collection date"])
  if (stepIndex === 4 && data.mode === "Courier") fields.push(["courierService", "Courier service"], ["courierCutoff", "Cut-off"], ["courierTracking", "Tracking preference"])
  if (stepIndex === 5) fields.push(["customsStatus", "Customs status"], ["commodityCode", "Commodity code"])
  if (stepIndex === 6) fields.push(["customerReference", "Customer reference"], ["internalReference", "Internal reference"])

  return fields
}

function missingFieldsForStep(data: BookingWizardData, stepIndex: number) {
  return getRequiredFields(data, stepIndex)
    .filter(([field]) => !isFilled(String(data[field] ?? "")))
    .map(([, label]) => label)
}

function allMissingFields(data: BookingWizardData) {
  return steps.slice(0, 7).flatMap((step, index) => (
    missingFieldsForStep(data, index).map((label) => `${step.name}: ${label}`)
  ))
}

function buildCargoSummary(data: BookingWizardData) {
  const pieces = [data.packages ? `${data.packages} ${data.packageType.toLowerCase()}` : "", data.weight ? `${data.weight} kg` : "", data.volume ? `${data.volume} cbm` : ""].filter(Boolean)
  return pieces.length ? pieces.join(" - ") : "Cargo not set"
}

function buildTransportEta(data: BookingWizardData) {
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

function FieldShell({
  label,
  helper,
  required,
  missing,
  children,
}: {
  label: string
  helper?: string
  required?: boolean
  missing?: boolean
  children: ReactNode
}) {
  return (
    <motion.label variants={fieldMotion} className="grid gap-1.5">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--md-ink)]">
          {label}
          {required ? <span className="text-[var(--md-red)]"> *</span> : null}
        </span>
        {missing ? <span className="text-[11px] font-medium text-[var(--md-red)]">Missing</span> : null}
      </span>
      {children}
      {helper ? <span className="text-[12px] leading-5 text-[var(--md-text)]">{helper}</span> : null}
    </motion.label>
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
}) {
  return (
    <FieldShell label={label} helper={helper} required={required} missing={missing}>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/64 px-3 text-[13px] shadow-[var(--md-shadow-line)]"
        dir={dir}
      />
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
        className="min-h-[76px] rounded-[var(--md-radius-lg)] border-0 bg-white/64 px-3 py-2.5 text-[13px] leading-[18px] shadow-[var(--md-shadow-line)]"
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
  helper,
  required,
  missing,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  helper?: string
  required?: boolean
  missing?: boolean
}) {
  return (
    <FieldShell label={label} helper={helper} required={required} missing={missing}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/64 px-3 text-[13px] shadow-[var(--md-shadow-line)]">
          <SelectValue />
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
        "flex min-h-10 items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/54 px-3 py-1.5 text-left text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/78",
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

function SourceScreen({
  data,
  query,
  onQueryChange,
  onUpdate,
  onStart,
}: {
  data: BookingWizardData
  query: string
  onQueryChange: (value: string) => void
  onUpdate: <K extends keyof BookingWizardData>(field: K, value: BookingWizardData[K]) => void
  onStart: (source: Exclude<BookingSource, null>) => void
}) {
  const filteredBookings = bookings.filter((booking) => (
    [booking.id, booking.customer, booking.route, booking.carrier, booking.customerRef, booking.jobRef].join(" ").toLowerCase().includes(query.toLowerCase())
  )).slice(0, 5)

  return (
    <motion.div variants={stepMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
      <Surface padding="lg" className="overflow-hidden rounded-[var(--md-radius-2xl)]">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <StatusPill tone="teal">New booking</StatusPill>
            <h1 className="mt-4 max-w-[620px] text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">
              Start from the fastest path for the operator.
            </h1>
            <p className="mt-3 max-w-[620px] text-[14px] leading-6 text-[var(--md-text)]">
              Duplicate a similar movement when the lane repeats, or start clean when the booking is genuinely new.
            </p>
          </div>

          <motion.div variants={fieldListMotion} initial="hidden" animate="visible" className="grid gap-3">
            <motion.button
              variants={optionMotion}
              type="button"
              className={cn(
                "rounded-[var(--md-radius-xl)] bg-white/58 p-5 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:scale-[1.005] hover:bg-white/78",
                data.source === "existing" && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.42),0_16px_30px_rgba(14,125,116,0.08)]",
              )}
              onClick={() => onUpdate("source", "existing")}
            >
              <span className="flex items-start gap-4">
                <span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
                  <Copy className="size-5" strokeWidth={1.35} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-[var(--md-ink)]">Create from existing booking</span>
                  <span className="mt-1 block text-[13px] leading-5 text-[var(--md-text)]">Use a previous route, customer, and reference pattern as the starting point.</span>
                </span>
              </span>
            </motion.button>

            {data.source === "existing" ? (
              <motion.div variants={optionMotion} className="rounded-[var(--md-radius-xl)] bg-[rgba(255,255,255,0.44)] p-4 shadow-[var(--md-shadow-line)]">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.25} />
                  <Input
                    value={query}
                    placeholder="Search customer, route, ref, carrier..."
                    onChange={(event) => onQueryChange(event.target.value)}
                    className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 ps-9 text-[13px] shadow-[var(--md-shadow-line)]"
                    dir="auto"
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  {filteredBookings.map((booking) => {
                    const selected = data.templateBookingId === booking.id

                    return (
                      <button
                        key={booking.id}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "grid gap-3 rounded-[var(--md-radius-lg)] bg-white/52 px-3 py-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/78 sm:grid-cols-[86px_minmax(0,1fr)_auto] sm:items-center",
                          selected && "bg-[rgba(14,125,116,0.1)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.35),0_8px_18px_rgba(14,125,116,0.08)]",
                        )}
                        onClick={() => onUpdate("templateBookingId", booking.id)}
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
                <Button
                  type="button"
                  className="mt-4 h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[#0b6f67]"
                  disabled={!data.templateBookingId}
                  onClick={() => onStart("existing")}
                >
                  Use selected booking
                  <ChevronRight className="size-4" strokeWidth={1.35} />
                </Button>
              </motion.div>
            ) : null}

            <motion.button
              variants={optionMotion}
              type="button"
              className={cn(
                "rounded-[var(--md-radius-xl)] bg-white/58 p-5 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:scale-[1.005] hover:bg-white/78",
                data.source === "scratch" && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.42),0_16px_30px_rgba(14,125,116,0.08)]",
              )}
              onClick={() => onStart("scratch")}
            >
              <span className="flex items-start gap-4">
                <span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]">
                  <Sparkles className="size-5" strokeWidth={1.35} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-[var(--md-ink)]">Create from scratch</span>
                  <span className="mt-1 block text-[13px] leading-5 text-[var(--md-text)]">Start the guided booking flow with clean defaults.</span>
                </span>
              </span>
            </motion.button>
          </motion.div>
        </div>
      </Surface>
    </motion.div>
  )
}

function WizardProgress({
  activeStep,
  data,
  onStepChange,
}: {
  activeStep: number
  data: BookingWizardData
  onStepChange: (step: number) => void
}) {
  const completeCount = steps.slice(0, 7).filter((_, index) => missingFieldsForStep(data, index).length === 0).length
  const progressValue = ((activeStep + 1) / steps.length) * 100

  return (
    <Surface padding="md" className="sticky top-[72px] z-10 rounded-[var(--md-radius-xl)] bg-[rgba(250,253,252,0.88)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">Step {activeStep + 1} of {steps.length}</p>
          <h2 className="mt-1 text-[16px] font-medium text-[var(--md-ink)]">{steps[activeStep].name}</h2>
        </div>
        <StatusPill tone={completeCount >= 7 ? "green" : "teal"}>{completeCount}/7 sections complete</StatusPill>
      </div>
      <Progress value={progressValue} className="mt-3 h-1.5 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--md-accent)]" />
      <div className="mt-3 grid grid-cols-4 gap-2 lg:grid-cols-8">
        {steps.map((step, index) => {
          const missing = index < 7 ? missingFieldsForStep(data, index).length : allMissingFields(data).length
          const complete = missing === 0 && index < activeStep
          const active = index === activeStep

          return (
            <button
              key={step.id}
              type="button"
              className={cn(
                "min-h-[46px] rounded-[var(--md-radius-lg)] px-2 py-1.5 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                active ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.36),0_10px_20px_rgba(14,125,116,0.08)]" : "bg-white/48 text-[var(--md-text)] hover:bg-white/76",
              )}
              onClick={() => onStepChange(index)}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("grid size-4 place-items-center rounded-full text-[10px] font-medium", complete ? "bg-[var(--md-accent)] text-white" : active ? "bg-white text-[var(--md-accent)]" : "bg-white/78 text-[var(--md-subtle)]")}>
                  {complete ? <Check className="size-3" strokeWidth={1.8} /> : index + 1}
                </span>
                <span className="truncate text-[11px] font-medium">{step.name}</span>
              </span>
              {missing ? <span className="mt-1 block text-[10px] font-medium text-[var(--md-amber)]">{missing} missing</span> : null}
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

function LiveSummaryPanel({ data, activeStep }: { data: BookingWizardData; activeStep: number }) {
  const completion = Math.round((steps.slice(0, 7).filter((_, index) => missingFieldsForStep(data, index).length === 0).length / 7) * 100)
  const route = [data.collectionAddress, data.deliveryAddress].filter(Boolean).join(" to ")
  const eta = buildTransportEta(data)

  const rows = [
    ["Booking type", `${data.direction} ${data.mode}`],
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
          <div key={label} className="grid grid-cols-[94px_minmax(0,1fr)] gap-3 rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-2 shadow-[var(--md-shadow-line)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
            <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" dir="auto">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-[var(--md-text)]">Current step: {steps[activeStep].name}</p>
    </Surface>
  )
}

function StepShell({ step, children }: { step: WizardStep; children: ReactNode }) {
  return (
    <Surface padding="md" className="overflow-hidden rounded-[var(--md-radius-2xl)]">
      <div className="mb-5">
        <p className="text-[12px] font-medium uppercase text-[var(--md-accent)]">{step.eyebrow}</p>
        <h1 className="mt-1.5 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{step.title}</h1>
        <p className="mt-1.5 max-w-[720px] text-[14px] leading-5 text-[var(--md-text)]">{step.summary}</p>
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
}: {
  activeStep: number
  data: BookingWizardData
  update: <K extends keyof BookingWizardData>(field: K, value: BookingWizardData[K]) => void
  goToStep: (step: number) => void
}) {
  const missing = new Set(missingFieldsForStep(data, activeStep))

  if (activeStep === 0) {
    return (
      <StepShell step={steps[0]}>
        <FieldGroup className="lg:grid-cols-2">
          <OptionGroup
            label="Direction"
            value={data.direction}
            options={[
              { value: "Import", title: "Import", body: "Goods coming into the destination market." },
              { value: "Export", title: "Export", body: "Goods leaving the origin market." },
            ]}
            onChange={(value) => update("direction", value)}
          />
          <OptionGroup
            label="Movement scope"
            value={data.movementScope}
            options={[
              { value: "International", title: "International", body: "Cross-border movement with customs touchpoints." },
              { value: "Domestic", title: "Domestic", body: "Same-country movement with simpler compliance." },
            ]}
            onChange={(value) => update("movementScope", value)}
          />
          <OptionGroup
            label="Mode"
            value={data.mode}
            options={[
              { value: "Sea", title: "Sea", body: "Ports, vessel, voyage, containers, ETD and ETA." },
              { value: "Air", title: "Air", body: "Airports, airline, flight, airway bills, ETD and ETA." },
              { value: "Road", title: "Road", body: "Collection point, vehicle, trailer, driver notes and delivery plan." },
              { value: "Courier", title: "Courier", body: "Service level, cut-off and tracking preference." },
            ]}
            onChange={(value) => update("mode", value)}
          />
          <div className="grid content-start gap-2">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">Service requirements</p>
            <ToggleTile label="Collection required" checked={data.collectionRequired} onChange={(value) => update("collectionRequired", value)} />
            <ToggleTile label="Delivery required" checked={data.deliveryRequired} onChange={(value) => update("deliveryRequired", value)} />
          </div>
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 1) {
    return (
      <StepShell step={steps[1]}>
        <FieldGroup className="lg:grid-cols-2">
          <TextField label="Customer" value={data.customer} onChange={(value) => update("customer", value)} placeholder="Marlow Apparel Ltd" required missing={missing.has("Customer")} />
          <TextField label="Customer contact" value={data.customerContact} onChange={(value) => update("customerContact", value)} placeholder="Sandra Hale" />
          <TextField label="Customer email" value={data.customerEmail} onChange={(value) => update("customerEmail", value)} placeholder="sandra@marlow.example" type="email" dir="ltr" />
          <TextField label="Shipper" value={data.shipper} onChange={(value) => update("shipper", value)} placeholder="Yong Hua Logistics" required missing={missing.has("Shipper")} />
          <TextField label="Shipper contact" value={data.shipperContact} onChange={(value) => update("shipperContact", value)} placeholder="Wei Chen" />
          <TextField label="Consignee" value={data.consignee} onChange={(value) => update("consignee", value)} placeholder="Marlow UK DC" required missing={missing.has("Consignee")} />
          <TextField label="Consignee contact" value={data.consigneeContact} onChange={(value) => update("consigneeContact", value)} placeholder="Warehouse team" />
          <TextField label="Notify party" value={data.notifyParty} onChange={(value) => update("notifyParty", value)} placeholder="Broker, buyer, or account contact" />
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 2) {
    return (
      <StepShell step={steps[2]}>
        <FieldGroup className="lg:grid-cols-2">
          <TextAreaField label="Collection address" value={data.collectionAddress} onChange={(value) => update("collectionAddress", value)} placeholder="Origin warehouse, dock, or port-side collection point" />
          <TextAreaField label="Delivery address" value={data.deliveryAddress} onChange={(value) => update("deliveryAddress", value)} placeholder="Destination warehouse, port, airport, or final consignee address" />
          <TextField label="Collection date" value={data.collectionDate} onChange={(value) => update("collectionDate", value)} type="date" required missing={missing.has("Collection date")} dir="ltr" />
          <TextField label="Collection time" value={data.collectionTime} onChange={(value) => update("collectionTime", value)} type="time" dir="ltr" />
          <TextField label="Delivery date" value={data.deliveryDate} onChange={(value) => update("deliveryDate", value)} type="date" required missing={missing.has("Delivery date")} dir="ltr" />
          <TextField label="Delivery time" value={data.deliveryTime} onChange={(value) => update("deliveryTime", value)} type="time" dir="ltr" />
          <TextField label="Collection reference" value={data.collectionReference} onChange={(value) => update("collectionReference", value)} placeholder="Gate pass, warehouse ref, supplier ref" dir="ltr" />
          <TextField label="Delivery reference" value={data.deliveryReference} onChange={(value) => update("deliveryReference", value)} placeholder="Booking slot, DC ref, customer ref" dir="ltr" />
          <TextAreaField label="Access restrictions" value={data.accessRestrictions} onChange={(value) => update("accessRestrictions", value)} placeholder="Vehicle limits, loading hours, PPE, appointment rules" />
          <TextAreaField label="Booking notes" value={data.bookingNotes} onChange={(value) => update("bookingNotes", value)} placeholder="Anything operators need to avoid re-checking later" />
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 3) {
    return (
      <StepShell step={steps[3]}>
        <FieldGroup className="lg:grid-cols-3">
          <TextAreaField label="Goods description" value={data.goodsDescription} onChange={(value) => update("goodsDescription", value)} placeholder="Retail apparel, machinery parts, chilled food..." />
          <TextField label="Number of packages" value={data.packages} onChange={(value) => update("packages", value)} placeholder="148" type="number" required missing={missing.has("Number of packages")} dir="ltr" />
          <SelectField label="Package type" value={data.packageType} onChange={(value) => update("packageType", value)} options={["Cartons", "Pallets", "Crates", "Bags", "ULD", "Loose cartons"]} />
          <TextField label="Weight" value={data.weight} onChange={(value) => update("weight", value)} placeholder="12420" type="number" required missing={missing.has("Weight")} helper="Use kg for this prototype." dir="ltr" />
          <TextField label="Volume" value={data.volume} onChange={(value) => update("volume", value)} placeholder="58.4" type="number" helper="Use cbm where known." dir="ltr" />
          <TextField label="Dimensions" value={data.dimensions} onChange={(value) => update("dimensions", value)} placeholder="120 x 80 x 160 cm" dir="ltr" />
          <TextField label="Pallet information" value={data.palletInfo} onChange={(value) => update("palletInfo", value)} placeholder="12 euro pallets, stackable" />
          <TextField label="Container information" value={data.containerInfo} onChange={(value) => update("containerInfo", value)} placeholder="1 x 40HC, shipper owned, SOC if relevant" />
          <div className="grid content-start gap-2">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">Cargo flags</p>
            <ToggleTile label="Hazardous goods" checked={data.hazardousGoods} onChange={(value) => update("hazardousGoods", value)} />
            <ToggleTile label="Temperature controlled" checked={data.temperatureControlled} onChange={(value) => update("temperatureControlled", value)} />
            <ToggleTile label="Fragile or high value" checked={data.fragileOrHighValue} onChange={(value) => update("fragileOrHighValue", value)} />
          </div>
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 4) {
    return (
      <StepShell step={steps[4]}>
        {data.mode === "Sea" ? (
          <FieldGroup className="lg:grid-cols-3">
            <TextField label="Port of loading" value={data.portOfLoading} onChange={(value) => update("portOfLoading", value)} placeholder="Yantian, CNYTN" required missing={missing.has("Port of loading")} />
            <TextField label="Port of discharge" value={data.portOfDischarge} onChange={(value) => update("portOfDischarge", value)} placeholder="Felixstowe, GBFXT" required missing={missing.has("Port of discharge")} />
            <TextField label="Vessel" value={data.vessel} onChange={(value) => update("vessel", value)} placeholder="COSCO Pride" />
            <TextField label="Voyage" value={data.voyage} onChange={(value) => update("voyage", value)} placeholder="091W" dir="ltr" />
            <SelectField label="Container type" value={data.containerType} onChange={(value) => update("containerType", value)} options={["20GP", "40GP", "40HC", "45HC", "LCL"]} />
            <TextField label="Container number" value={data.containerNumber} onChange={(value) => update("containerNumber", value)} placeholder="MSKU1234567" dir="ltr" />
            <TextField label="Seal number" value={data.sealNumber} onChange={(value) => update("sealNumber", value)} placeholder="SL998412" dir="ltr" />
            <TextField label="ETD" value={data.seaEtd} onChange={(value) => update("seaEtd", value)} type="date" required missing={missing.has("ETD")} dir="ltr" />
            <TextField label="ETA" value={data.seaEta} onChange={(value) => update("seaEta", value)} type="date" required missing={missing.has("ETA")} dir="ltr" />
          </FieldGroup>
        ) : null}

        {data.mode === "Air" ? (
          <FieldGroup className="lg:grid-cols-3">
            <TextField label="Airport of departure" value={data.airportDeparture} onChange={(value) => update("airportDeparture", value)} placeholder="FRA - Frankfurt" required missing={missing.has("Airport of departure")} />
            <TextField label="Airport of arrival" value={data.airportArrival} onChange={(value) => update("airportArrival", value)} placeholder="LHR - Heathrow" required missing={missing.has("Airport of arrival")} />
            <TextField label="Airline" value={data.airline} onChange={(value) => update("airline", value)} placeholder="Lufthansa Cargo" required missing={missing.has("Airline")} />
            <TextField label="Flight number" value={data.flightNumber} onChange={(value) => update("flightNumber", value)} placeholder="LH8841" dir="ltr" />
            <TextField label="MAWB" value={data.mawb} onChange={(value) => update("mawb", value)} placeholder="020-12345678" dir="ltr" />
            <TextField label="HAWB" value={data.hawb} onChange={(value) => update("hawb", value)} placeholder="HAWB-7781" dir="ltr" />
            <TextField label="ETD" value={data.airEtd} onChange={(value) => update("airEtd", value)} type="date" required missing={missing.has("ETD")} dir="ltr" />
            <TextField label="ETA" value={data.airEta} onChange={(value) => update("airEta", value)} type="date" required missing={missing.has("ETA")} dir="ltr" />
          </FieldGroup>
        ) : null}

        {data.mode === "Road" ? (
          <FieldGroup className="lg:grid-cols-3">
            <TextField label="Collection point" value={data.roadCollectionPoint} onChange={(value) => update("roadCollectionPoint", value)} placeholder="Hamburg warehouse" required missing={missing.has("Collection point")} />
            <TextField label="Delivery point" value={data.roadDeliveryPoint} onChange={(value) => update("roadDeliveryPoint", value)} placeholder="Milan DC" required missing={missing.has("Delivery point")} />
            <SelectField label="Trailer type" value={data.trailerType} onChange={(value) => update("trailerType", value)} options={["Curtainsider", "Box trailer", "Reefer", "Flatbed", "Mega trailer"]} />
            <SelectField label="Vehicle type" value={data.vehicleType} onChange={(value) => update("vehicleType", value)} options={["Artic", "Rigid", "Van", "Sprinter", "Tail-lift truck"]} required missing={missing.has("Vehicle type")} />
            <TextField label="Planned collection date" value={data.plannedCollectionDate} onChange={(value) => update("plannedCollectionDate", value)} type="date" required missing={missing.has("Planned collection date")} dir="ltr" />
            <TextField label="Planned delivery date" value={data.plannedDeliveryDate} onChange={(value) => update("plannedDeliveryDate", value)} type="date" dir="ltr" />
            <TextAreaField label="Driver instructions" value={data.driverInstructions} onChange={(value) => update("driverInstructions", value)} placeholder="Gate, contact, loading bay, call-ahead rules" />
          </FieldGroup>
        ) : null}

        {data.mode === "Courier" ? (
          <FieldGroup className="lg:grid-cols-3">
            <SelectField label="Courier service" value={data.courierService} onChange={(value) => update("courierService", value)} options={["Express", "Economy", "Same day", "Next day", "Temperature-controlled courier"]} required missing={missing.has("Courier service")} />
            <TextField label="Cut-off" value={data.courierCutoff} onChange={(value) => update("courierCutoff", value)} type="time" required missing={missing.has("Cut-off")} dir="ltr" />
            <SelectField label="Tracking preference" value={data.courierTracking} onChange={(value) => update("courierTracking", value)} options={["Customer-visible", "Internal only", "Milestone digest", "Exception alerts only"]} required missing={missing.has("Tracking preference")} />
          </FieldGroup>
        ) : null}
      </StepShell>
    )
  }

  if (activeStep === 5) {
    return (
      <StepShell step={steps[5]}>
        <FieldGroup className="lg:grid-cols-2">
          <SelectField label="Customs status" value={data.customsStatus} onChange={(value) => update("customsStatus", value)} options={["Not started", "Data required", "Ready to submit", "Submitted", "Cleared", "Held"]} required missing={missing.has("Customs status")} />
          <TextField label="Commodity code" value={data.commodityCode} onChange={(value) => update("commodityCode", value)} placeholder="6109.10.00" required missing={missing.has("Commodity code")} dir="ltr" />
          <TextField label="EORI / VAT details" value={data.eoriVat} onChange={(value) => update("eoriVat", value)} placeholder="GB123456789000" dir="ltr" />
          <div className="grid content-start gap-2">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">Documents required</p>
            <ToggleTile label="Commercial invoice" checked={data.commercialInvoice} onChange={(value) => update("commercialInvoice", value)} />
            <ToggleTile label="Packing list" checked={data.packingList} onChange={(value) => update("packingList", value)} />
            <ToggleTile label="Certificates" checked={data.certificates} onChange={(value) => update("certificates", value)} />
          </div>
          <TextAreaField label="Customs notes" value={data.customsNotes} onChange={(value) => update("customsNotes", value)} placeholder="Broker handoff, declaration owner, known risks" />
          <TextAreaField label="Compliance requirements" value={data.complianceRequirements} onChange={(value) => update("complianceRequirements", value)} placeholder="Licences, certificates, declarations, sanctions checks" />
        </FieldGroup>
      </StepShell>
    )
  }

  if (activeStep === 6) {
    return (
      <StepShell step={steps[6]}>
        <FieldGroup className="lg:grid-cols-3">
          <TextField label="Customer reference" value={data.customerReference} onChange={(value) => update("customerReference", value)} placeholder="MAR-PO-7781" required missing={missing.has("Customer reference")} dir="ltr" />
          <TextField label="Internal reference" value={data.internalReference} onChange={(value) => update("internalReference", value)} placeholder="BK-LON-22618" required missing={missing.has("Internal reference")} dir="ltr" />
          <TextField label="Supplier reference" value={data.supplierReference} onChange={(value) => update("supplierReference", value)} placeholder="YH-SO-1440" dir="ltr" />
          <TextField label="Quote reference" value={data.quoteReference} onChange={(value) => update("quoteReference", value)} placeholder="Q-1882" dir="ltr" />
          <TextField label="Purchase order reference" value={data.purchaseOrderReference} onChange={(value) => update("purchaseOrderReference", value)} placeholder="PO-7781" dir="ltr" />
          <TextField label="Agreed charges" value={data.agreedCharges} onChange={(value) => update("agreedCharges", value)} placeholder="Ocean freight EUR 4,840 + destination handling" />
          <TextAreaField label="Buying notes" value={data.buyingNotes} onChange={(value) => update("buyingNotes", value)} placeholder="Carrier rate, validity, margin watch, supplier exceptions" />
          <TextAreaField label="Selling notes" value={data.sellingNotes} onChange={(value) => update("sellingNotes", value)} placeholder="Customer quote commitments, what can be shared externally" />
          <TextAreaField label="Operational notes" value={data.operationalNotes} onChange={(value) => update("operationalNotes", value)} placeholder="Anything the operations team needs before this goes live" />
        </FieldGroup>
      </StepShell>
    )
  }

  const missingAll = allMissingFields(data)
  const sections = [
    ["Booking type", `${data.direction} ${data.mode} - ${data.movementScope}`],
    ["Parties", `${data.customer || "No customer"} / ${data.shipper || "No shipper"} / ${data.consignee || "No consignee"}`],
    ["Collection and delivery", [data.collectionAddress, data.deliveryAddress].filter(Boolean).join(" to ") || "Locations missing"],
    ["Cargo details", buildCargoSummary(data)],
    ["Transport details", buildTransportEta(data) || "Transport dates missing"],
    ["Customs and compliance", `${data.customsStatus} - ${data.commodityCode || "No commodity code"}`],
    ["Charges and references", data.customerReference || data.internalReference || "References missing"],
  ] as const

  return (
    <StepShell step={steps[7]}>
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
                <span key={item} className="rounded-full bg-white/62 px-3 py-1.5 text-[12px] font-medium text-[var(--md-amber)] shadow-[var(--md-shadow-line)]">
                  {item}
                </span>
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
              className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/56 p-3 shadow-[var(--md-shadow-line)] md:grid-cols-[minmax(140px,220px)_minmax(0,1fr)_auto] md:items-center"
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
  const [sourceQuery, setSourceQuery] = useState("")
  const [showSuccess, setShowSuccess] = useState(false)

  const showingSource = data.source === null
  const missingCurrent = useMemo(() => missingFieldsForStep(data, activeStep), [activeStep, data])
  const canCreate = allMissingFields(data).length === 0

  function update<K extends keyof BookingWizardData>(field: K, value: BookingWizardData[K]) {
    setData((current) => ({ ...current, [field]: value }))
  }

  function applyExistingBooking(bookingId: string) {
    const booking = bookings.find((item) => item.id === bookingId)
    if (!booking) return defaultBooking
    const [origin = "", destination = ""] = booking.route.split(" -> ").length > 1 ? booking.route.split(" -> ") : booking.route.split("→").map((part) => part.trim())

    return {
      ...defaultBooking,
      source: "existing" as const,
      templateBookingId: booking.id,
      direction: booking.mode === "ROAD" ? "Export" as const : "Import" as const,
      mode: booking.mode === "AIR" ? "Air" as const : booking.mode === "ROAD" ? "Road" as const : "Sea" as const,
      customer: booking.customer,
      customerReference: booking.customerRef,
      supplierReference: booking.supplierRef,
      internalReference: booking.jobRef.replace("JOB", "BK"),
      collectionAddress: booking.origin,
      deliveryAddress: booking.destination,
      collectionReference: booking.supplierRef,
      deliveryReference: booking.customerRef,
      goodsDescription: booking.customFields[0]?.value ?? "Repeat booking cargo",
      packages: booking.container.includes("ULD") ? "1" : "120",
      packageType: booking.container.includes("ULD") ? "ULD" : "Cartons",
      weight: booking.mode === "AIR" ? "1840" : "12420",
      volume: booking.mode === "AIR" ? "9.2" : "58.4",
      containerType: booking.container,
      containerInfo: booking.container,
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
      customsStatus: booking.status === "Exception" ? "Held" : "Ready to submit",
      commodityCode: booking.customFields.find((field) => field.label.toLowerCase().includes("hs"))?.value ?? "",
    }
  }

  function startFlow(source: Exclude<BookingSource, null>) {
    setData((current) => source === "existing" ? applyExistingBooking(current.templateBookingId) : { ...current, source: "scratch" })
    setActiveStep(0)
  }

  function goNext() {
    if (activeStep < steps.length - 1) {
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
    setSourceQuery("")
    setShowSuccess(false)
  }

  return (
    <div className="md-page md-page-stack">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button type="button" className="-mx-2 flex w-fit items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-1.5 text-[13px] font-medium text-[var(--md-text)] transition-colors hover:bg-white/42 hover:text-[var(--md-ink)]" onClick={() => navigate("/bookings")}>
          <ArrowLeft className="size-4" strokeWidth={1.25} />
          Bookings
        </button>
        <StatusPill tone={data.source === "existing" ? "blue" : data.source === "scratch" ? "teal" : "neutral"}>
          {data.source === "existing" ? "Using existing booking" : data.source === "scratch" ? "Creating from scratch" : "Choose starting point"}
        </StatusPill>
      </div>

      <AnimatePresence mode="wait">
        {showSuccess ? (
          <SuccessState key="success" data={data} navigate={navigate} onRestart={restart} />
        ) : showingSource ? (
          <SourceScreen key="source" data={data} query={sourceQuery} onQueryChange={setSourceQuery} onUpdate={update} onStart={startFlow} />
        ) : (
          <motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid min-h-[calc(100svh-168px)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-4">
              <WizardProgress activeStep={activeStep} data={data} onStepChange={setActiveStep} />
              <AnimatePresence mode="wait">
                <motion.div key={steps[activeStep].id} variants={stepMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="pb-16 sm:pb-0">
                  <StepContent activeStep={activeStep} data={data} update={update} goToStep={setActiveStep} />
                </motion.div>
              </AnimatePresence>

              <details className="rounded-[var(--md-radius-xl)] bg-[rgba(250,253,252,0.94)] p-2 shadow-[var(--md-shadow-line)] backdrop-blur-xl xl:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-2 text-[13px] font-medium text-[var(--md-ink)]">
                  Live booking summary
                  <Ship className="size-4 text-[var(--md-accent)]" strokeWidth={1.35} />
                </summary>
                <LiveSummaryPanel data={data} activeStep={activeStep} />
              </details>

              <div className="sticky bottom-3 z-30 mt-auto flex items-center justify-between gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-2.5 shadow-[var(--md-shadow-lift)]">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 shrink-0 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-white/64 hover:text-[var(--md-ink)] sm:px-4"
                  onClick={() => {
                    if (activeStep === 0) update("source", null)
                    else setActiveStep((current) => current - 1)
                  }}
                >
                  <ArrowLeft className="size-4" strokeWidth={1.35} />
                  {activeStep === 0 ? "Change start" : "Back"}
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
