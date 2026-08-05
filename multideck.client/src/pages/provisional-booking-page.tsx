import { useMemo, useState, type ReactNode } from "react"
import {
  CalendarDays,
  Check,
  Edit3,
  FileText,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  Paperclip,
  Plus,
  Printer,
  Save,
  Search,
  ShieldCheck,
  UnlockKeyhole,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusPill } from "@/components/multideck/status-pill"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"

type FormValues = Record<string, string>

const initialValues: FormValues = {
  bookingNumber: "PB-42081",
  quoteNumber: "Q-19158",
  status: "Provisional",
  clientCode: "NBSFTY",
  clientName: "Northbridge Safety Trading",
  clientAddress: "Harbour Exchange, Bristol, United Kingdom",
  consignorCode: "NBSFTY",
  consignorName: "Northbridge Safety Trading",
  consignorAddress: "Harbour Exchange, Bristol, United Kingdom",
  consigneeCode: "Unassigned",
  consigneeName: "No organisation selected",
  consigneeAddress: "Select before sending booking confirmation",
  contact: "Nora Vale - Logistics Lead",
  transport: "SEA - Sea Freight",
  container: "FCL - Full Container Load",
  incoterm: "DAP - Delivered At Place",
  additionalTerms: "Door delivery, subject to destination release",
  serviceLevel: "STD - Standard",
  shipperReference: "NB-PO-48319",
  description: "Industrial safety equipment",
  marks: "NBS / KOBE / 1 of 1",
  origin: "GBBRS - Bristol",
  destination: "JPUKB - Kobe",
  via: "SGSIN - Singapore",
  carrier: "Not selected",
  contractNumber: "Pending rate confirmation",
  carrierServiceLevel: "Standard",
  estimatedPickup: "12 Jan 2026",
  estimatedDelivery: "17 Mar 2026",
  requiredBy: "20 Mar 2026",
  transitTime: "55 days",
  frequency: "0 - Ad hoc",
  startDate: "08 Jan 2026",
  endDate: "31 Jan 2026",
  goodsOuters: "24",
  packageType: "PLT - Pallets",
  weight: "8,500 KG",
  volume: "42.0 M3",
  chargeable: "42.0 M3",
  pickupDrop: "Warehouse dock 4",
  deliveryDrop: "Final delivery address",
  commodity: "General merchandise",
  commodityLocal: "Not required",
  fmcTid: "Not required",
  goodsValue: "0.00 GBP",
  insuranceValue: "0.00 GBP",
  insuranceRequired: "No",
  spotRate: "0.0000",
  brokerageMethod: "PMT",
  entries: "1",
  lines: "1",
  screening: "Not screened",
  freightRate: "Pending",
  ctLevel: "Not selected",
  localReference: "PB-74218",
  salesRep: "AM1 - Maya Stone",
  opsRep: "OP2 - Theo Grant",
  branch: "BR1 - Bristol",
  department: "SEA - Ocean Export",
}

const bookingTabs = [
  ["details", "Details", Edit3],
  ["additional", "Additional details", MoreHorizontal],
  ["custom", "Custom fields", FileText],
  ["documents", "Document selection", FileText],
  ["workflow", "Workflow & tracking", Link2],
  ["addresses", "Addresses", Search],
  ["edocs", "eDocs", Paperclip],
  ["notes", "Notes", Edit3],
  ["log", "Logs", FileText],
] as const

const bookingRail = [
  ["Client", "Northbridge Safety Trading", "clear"],
  ["Consignor", "Northbridge Safety Trading", "clear"],
  ["Consignee", "Organisation required", "watch"],
  ["Origin / destination", "Bristol to Kobe", "clear"],
  ["Load / discharge", "FCL / CY-CFS", "clear"],
  ["Quote conversion", "Q-19158 linked", "clear"],
  ["Booking status", "Provisional", "info"],
  ["Created", "08 Jan 2026, 10:42", "info"],
] as const

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const { t } = useLanguage()

  return (
    <section className={cn("min-w-0 rounded-[6px] bg-[var(--md-surface-soft)] p-2 shadow-[inset_0_0_0_1px_var(--md-accent-a18)]", className)}>
      <h2 className="mb-1.5 text-[11px] font-semibold leading-4 text-[var(--md-ink)]">{t(title)}</h2>
      {children}
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  type?: "text" | "date"
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <label className={cn("grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-1", className)}>
      <span className="truncate text-end text-[10.5px] font-medium text-[var(--md-text)]">{t(label)}</span>
      <Input
        value={value}
        type={type}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        data-i18n-skip
        dir="auto"
        className="h-6 min-w-0 rounded-[3px] border-0 bg-[var(--md-surface)] px-1.5 text-[11px] font-medium text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)] disabled:cursor-default disabled:opacity-100"
      />
    </label>
  )
}

function LookupField({
  label,
  value,
  onChange,
  disabled,
  action = "search",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  action?: "search" | "date" | "more"
}) {
  const { t } = useLanguage()
  const Icon = action === "date" ? CalendarDays : action === "more" ? MoreHorizontal : Search

  return (
    <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)_24px] items-center gap-1">
      <span className="truncate text-end text-[10.5px] font-medium text-[var(--md-text)]">{t(label)}</span>
      <Input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        data-i18n-skip
        dir="auto"
        className="h-6 min-w-0 rounded-[3px] border-0 bg-[var(--md-surface)] px-1.5 text-[11px] font-medium text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)] disabled:cursor-default disabled:opacity-100"
      />
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => toast.info(t(`Lookup opened for ${label}`))}
        aria-label={t(`Search ${label}`)}
        className="size-6 rounded-[3px] bg-[var(--md-surface)] p-0 text-[var(--md-accent)] shadow-[var(--md-shadow-line)] disabled:opacity-45"
      >
        <Icon className="size-3.5" strokeWidth={1.4} />
      </Button>
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  disabled: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-1">
      <span className="truncate text-end text-[10.5px] font-medium text-[var(--md-text)]">{t(label)}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-6 min-w-0 rounded-[3px] border-0 bg-[var(--md-surface)] px-1.5 text-[11px] font-medium text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)] disabled:cursor-default disabled:opacity-100">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
          {options.map((option) => <SelectItem key={option} value={option} className="text-[12px]">{t(option)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function PartyPanel({
  title,
  codeKey,
  nameKey,
  addressKey,
  values,
  setValue,
  editable,
}: {
  title: string
  codeKey: string
  nameKey: string
  addressKey: string
  values: FormValues
  setValue: (key: string, value: string) => void
  editable: boolean
}) {
  const { t } = useLanguage()

  return (
    <Panel title={title}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <div className="flex gap-1">
          <Button type="button" variant="ghost" disabled={!editable} onClick={() => toast.info(t(`${title} contacts opened`))} className="h-5 rounded-[3px] bg-[var(--md-surface)] px-1.5 text-[10px] shadow-[var(--md-shadow-line)] disabled:opacity-45">
            {t("Contacts")}
          </Button>
          <Button type="button" variant="ghost" disabled={!editable} onClick={() => toast.info(t(`${title} address opened`))} className="h-5 rounded-[3px] bg-[var(--md-surface)] px-1.5 text-[10px] shadow-[var(--md-shadow-line)] disabled:opacity-45">
            {t("Address")}
          </Button>
        </div>
        <StatusPill tone={values[codeKey] === "Unassigned" ? "amber" : "teal"} className="h-5 px-1.5 text-[9.5px]">
          {values[codeKey] === "Unassigned" ? t("Required") : t("Linked")}
        </StatusPill>
      </div>
      <div className="grid gap-1">
        <LookupField label="Code" value={values[codeKey]} onChange={(value) => setValue(codeKey, value)} disabled={!editable} />
        <Field label="Name" value={values[nameKey]} onChange={(value) => setValue(nameKey, value)} disabled={!editable} />
        <Field label="Address" value={values[addressKey]} onChange={(value) => setValue(addressKey, value)} disabled={!editable} />
      </div>
    </Panel>
  )
}

function PlaceholderPanel({ title, detail, actionLabel }: { title: string; detail: string; actionLabel: string }) {
  const { t } = useLanguage()
  return (
    <Panel title={title} className="min-h-[300px]">
      <div className="flex h-[244px] flex-col items-start justify-between rounded-[4px] bg-[var(--md-surface)] p-3 shadow-[inset_0_0_0_1px_var(--md-accent-a14)]">
        <p className="max-w-[440px] text-[12px] leading-5 text-[var(--md-text)]">{t(detail)}</p>
        <Button type="button" variant="ghost" className="h-7 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 text-[11px] shadow-[var(--md-shadow-line)]">
          <Plus data-icon="inline-start" className="size-3.5" />
          {t(actionLabel)}
        </Button>
      </div>
    </Panel>
  )
}

export function ProvisionalBookingPage({ navigate }: { navigate: (path: string) => void }) {
  const { direction, t } = useLanguage()
  const [savedValues, setSavedValues] = useState<FormValues>(initialValues)
  const [values, setValues] = useState<FormValues>(initialValues)
  const [editable, setEditable] = useState(false)
  const [domestic, setDomestic] = useState(false)
  const [nvocc, setNvocc] = useState(false)
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(savedValues), [savedValues, values])

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function saveBooking(closeAfterSave = false) {
    setSavedValues(values)
    setEditable(false)
    toast.success(t(closeAfterSave ? "Provisional booking saved and closed" : "Provisional booking saved"))
    if (closeAfterSave) navigate("/bookings")
  }

  function toggleEditing(next: boolean) {
    if (!next && dirty) {
      toast.info(t("Save or discard changes before locking the booking"))
      return
    }
    setEditable(next)
  }

  return (
    <main dir={direction} className="min-h-full bg-[var(--md-bg-strong)] px-1.5 py-1.5 sm:px-2">
      <div className="grid w-full gap-1.5">
        <header className="flex flex-col gap-1.5 rounded-[4px] bg-[var(--md-surface-tint)] px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--md-accent-a24)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-[var(--md-accent-a12)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><FileText className="size-3.5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="text-[15px] font-medium leading-5 text-[var(--md-ink)]">{t("Provisional booking")}</h1>
                <StatusPill tone="amber">{t("Provisional")}</StatusPill>
                <StatusPill tone="teal">{t("From spot quote")}</StatusPill>
                <span data-i18n-skip dir="ltr" className="text-[12px] font-medium text-[var(--md-subtle)]">{values.bookingNumber}</span>
                <span className="text-[12px] text-[var(--md-subtle)]">/</span>
                <span data-i18n-skip dir="ltr" className="text-[12px] font-medium text-[var(--md-ink)]">{values.quoteNumber}</span>
              </div>
              <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--md-text)]"><span data-i18n-skip dir="auto">{values.clientName}</span><span className="px-1.5 text-[var(--md-subtle)]">/</span><span data-i18n-skip dir="auto">Bristol to Kobe via Singapore</span></p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {editable ? (
              <>
                <Button type="button" variant="ghost" onClick={() => { setValues(savedValues); setEditable(false) }} className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2.5 text-[12px] shadow-[var(--md-shadow-line)]"><X data-icon="inline-start" className="size-3.5" />{t("Discard")}</Button>
                <Button type="button" onClick={() => saveBooking()} className="h-8 rounded-[var(--md-radius-sm)] px-2.5 text-[12px]"><Save data-icon="inline-start" className="size-3.5" />{t("Save")}</Button>
              </>
            ) : null}
            <div className="flex h-8 items-center gap-2 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 shadow-[var(--md-shadow-line)]">
              {editable ? <UnlockKeyhole className="size-3.5 text-[var(--md-amber)]" /> : <LockKeyhole className="size-3.5 text-[var(--md-green)]" />}
              <span className="text-[11px] font-medium text-[var(--md-text)]">{t("Edit")}</span>
              <Switch size="sm" checked={editable} onCheckedChange={toggleEditing} aria-label={t("Toggle provisional booking edit mode")} />
              <span className={cn("hidden text-[10.5px] font-medium md:inline", dirty ? "text-[var(--md-amber)]" : "text-[var(--md-subtle)]")}>{t(dirty ? "Unsaved changes" : editable ? "Editing" : "Locked")}</span>
            </div>
            <Button type="button" variant="ghost" onClick={() => window.print()} className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2.5 text-[12px] shadow-[var(--md-shadow-line)]"><Printer data-icon="inline-start" className="size-4" />{t("Print")}</Button>
            <Button type="button" onClick={() => saveBooking(true)} disabled={!editable} className="h-8 rounded-[var(--md-radius-sm)] px-2.5 text-[12px]"><Save data-icon="inline-start" className="size-4" />{t("Save & close")}</Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/bookings")} className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2.5 text-[12px] shadow-[var(--md-shadow-line)]"><X data-icon="inline-start" className="size-4" />{t("Cancel")}</Button>
          </div>
        </header>

        <Tabs defaultValue="details" className="grid min-w-0 gap-1.5 xl:grid-cols-[188px_minmax(0,1fr)]">
          <aside className="hidden self-start rounded-[4px] bg-[var(--md-surface-tint)] p-1.5 shadow-[inset_0_0_0_1px_var(--md-accent-a20)] xl:block">
              <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--md-subtle)]">{t("Booking checks")}</p>
              <div className="grid gap-0.5">
                {bookingRail.map(([label, detail, state]) => (
                  <button key={label} type="button" className="grid gap-0.5 rounded-[3px] px-1.5 py-1.5 text-start hover:bg-[var(--md-hover)]">
                    <span className="flex items-center justify-between gap-2"><span className="text-[10.5px] font-medium text-[var(--md-ink)]">{t(label)}</span><span className={cn("size-1.5 rounded-full", state === "watch" ? "bg-[var(--md-amber)]" : state === "clear" ? "bg-[var(--md-green)]" : "bg-[var(--md-accent)]")} /></span>
                    <span className="truncate text-[10px] text-[var(--md-text)]">{t(detail)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-[3px] bg-[var(--md-accent-a09)] p-1.5">
                <p className="text-[10px] font-semibold text-[var(--md-ink)]">{t("Quote linkage")}</p>
                <p className="mt-0.5 text-[10px] leading-3 text-[var(--md-text)]">{t("Costs and selling lines carry over when you confirm the provisional booking.")}</p>
              </div>
          </aside>
          <div className="min-w-0">
            <TabsList variant="line" className="h-auto flex-wrap justify-start gap-0.5 rounded-[4px] bg-[var(--md-surface-tint)] p-0.5 shadow-[inset_0_0_0_1px_var(--md-accent-a22)]">
              {bookingTabs.map(([value, label, Icon]) => <TabsTrigger key={value} value={value} className="h-7 rounded-[3px] px-2 text-[11px]"><Icon data-icon="inline-start" className="size-3.5" />{t(label)}</TabsTrigger>)}
            </TabsList>

          <TabsContent value="details" className="mt-0">
            <div className="grid gap-1.5">
                <div className="grid gap-1.5 2xl:grid-cols-3">
                  <PartyPanel title="Client" codeKey="clientCode" nameKey="clientName" addressKey="clientAddress" values={values} setValue={setValue} editable={editable} />
                  <PartyPanel title="Consignor" codeKey="consignorCode" nameKey="consignorName" addressKey="consignorAddress" values={values} setValue={setValue} editable={editable} />
                  <PartyPanel title="Consignee" codeKey="consigneeCode" nameKey="consigneeName" addressKey="consigneeAddress" values={values} setValue={setValue} editable={editable} />
                </div>

                <div className="grid gap-1.5 2xl:grid-cols-[1.08fr_1.12fr_0.9fr]">
                  <Panel title="Booking and service">
                    <div className="grid gap-1 md:grid-cols-2">
                      <LookupField label="Booking" value={values.bookingNumber} onChange={(value) => setValue("bookingNumber", value)} disabled={!editable} action="more" />
                      <LookupField label="Quote" value={values.quoteNumber} onChange={(value) => setValue("quoteNumber", value)} disabled={!editable} action="more" />
                      <SelectField label="Status" value={values.status} options={["Provisional", "Confirmed", "On hold", "Cancelled"]} onChange={(value) => setValue("status", value)} disabled={!editable} />
                      <SelectField label="Transport" value={values.transport} options={["SEA - Sea Freight", "AIR - Air Freight", "ROA - Road Freight", "RAI - Rail Freight"]} onChange={(value) => setValue("transport", value)} disabled={!editable} />
                      <SelectField label="Container" value={values.container} options={["FCL - Full Container Load", "LCL - Less Container Load", "BBK - Breakbulk"]} onChange={(value) => setValue("container", value)} disabled={!editable} />
                      <SelectField label="Incoterm" value={values.incoterm} options={["DAP - Delivered At Place", "FOB - Free On Board", "CIF - Cost Insurance Freight", "EXW - Ex Works"]} onChange={(value) => setValue("incoterm", value)} disabled={!editable} />
                      <Field label="Add. terms" value={values.additionalTerms} onChange={(value) => setValue("additionalTerms", value)} disabled={!editable} />
                      <SelectField label="Service level" value={values.serviceLevel} options={["STD - Standard", "EXP - Express", "ECO - Economy"]} onChange={(value) => setValue("serviceLevel", value)} disabled={!editable} />
                      <LookupField label="Shipper ref" value={values.shipperReference} onChange={(value) => setValue("shipperReference", value)} disabled={!editable} />
                      <div className="flex items-center justify-end gap-2 px-1"><span className="text-[10.5px] font-medium text-[var(--md-text)]">{t("Is domestic")}</span><Switch size="sm" checked={domestic} onCheckedChange={setDomestic} disabled={!editable} aria-label={t("Toggle domestic booking")} /></div>
                    </div>
                  </Panel>

                  <Panel title="Routing and schedule">
                    <div className="grid gap-1 md:grid-cols-2">
                      <LookupField label="Origin" value={values.origin} onChange={(value) => setValue("origin", value)} disabled={!editable} />
                      <LookupField label="Destination" value={values.destination} onChange={(value) => setValue("destination", value)} disabled={!editable} />
                      <LookupField label="Via" value={values.via} onChange={(value) => setValue("via", value)} disabled={!editable} />
                      <LookupField label="Carrier" value={values.carrier} onChange={(value) => setValue("carrier", value)} disabled={!editable} />
                      <LookupField label="Contract no." value={values.contractNumber} onChange={(value) => setValue("contractNumber", value)} disabled={!editable} action="more" />
                      <SelectField label="Car. svc. lvl" value={values.carrierServiceLevel} options={["Standard", "Priority", "Guaranteed"]} onChange={(value) => setValue("carrierServiceLevel", value)} disabled={!editable} />
                      <LookupField label="Est. pickup" value={values.estimatedPickup} onChange={(value) => setValue("estimatedPickup", value)} disabled={!editable} action="date" />
                      <LookupField label="Est. delivery" value={values.estimatedDelivery} onChange={(value) => setValue("estimatedDelivery", value)} disabled={!editable} action="date" />
                      <Field label="Transit time" value={values.transitTime} onChange={(value) => setValue("transitTime", value)} disabled={!editable} />
                      <SelectField label="Frequency" value={values.frequency} options={["0 - Ad hoc", "1 - Weekly", "2 - Fortnightly"]} onChange={(value) => setValue("frequency", value)} disabled={!editable} />
                      <LookupField label="Required by" value={values.requiredBy} onChange={(value) => setValue("requiredBy", value)} disabled={!editable} action="date" />
                    </div>
                  </Panel>

                  <Panel title="Job management links">
                    <div className="grid gap-1">
                      <div className="flex items-center justify-between gap-1"><span className="text-[10.5px] font-medium text-[var(--md-text)]">{t("Order refs")}</span><Button type="button" variant="ghost" disabled={!editable} className="h-5 rounded-[3px] bg-[var(--md-surface)] px-1.5 text-[10px] shadow-[var(--md-shadow-line)]"><MoreHorizontal className="size-3" />{t("More")}</Button></div>
                      <div className="overflow-hidden rounded-[3px] bg-[var(--md-surface)] shadow-[inset_0_0_0_1px_var(--md-accent-a16)]">
                        <div className="grid grid-cols-[minmax(0,1fr)_74px] bg-[var(--md-surface-tint)] px-1.5 py-1 text-[9.5px] font-semibold text-[var(--md-text)]"><span>{t("Job number")}</span><span>{t("Type")}</span></div>
                        <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_74px] px-1.5 py-1.5 text-[10.5px] text-[var(--md-subtle)]"><span>{t("No linked orders")}</span><span>-</span></div>
                      </div>
                      <div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" disabled={!editable} className="h-6 rounded-[3px] bg-[var(--md-surface)] px-1.5 text-[10px] shadow-[var(--md-shadow-line)]"><Plus className="size-3" />{t("New")}</Button><Button type="button" variant="ghost" disabled={!editable} className="h-6 rounded-[3px] bg-[var(--md-surface)] px-1.5 text-[10px] shadow-[var(--md-shadow-line)]"><Edit3 className="size-3" />{t("Edit")}</Button><Button type="button" variant="ghost" disabled={!editable} className="h-6 rounded-[3px] bg-[var(--md-surface)] px-1.5 text-[10px] shadow-[var(--md-shadow-line)]"><Paperclip className="size-3" />{t("Attach")}</Button></div>
                      <div className="grid gap-1 pt-1"><LookupField label="Branch" value={values.branch} onChange={(value) => setValue("branch", value)} disabled={!editable} /><LookupField label="Department" value={values.department} onChange={(value) => setValue("department", value)} disabled={!editable} /></div>
                    </div>
                  </Panel>
                </div>

                <div className="grid gap-1.5 2xl:grid-cols-[0.88fr_1fr_0.95fr_0.8fr]">
                  <Panel title="Goods details">
                    <div className="grid gap-1"><Field label="Outers" value={values.goodsOuters} onChange={(value) => setValue("goodsOuters", value)} disabled={!editable} /><SelectField label="Package type" value={values.packageType} options={["PLT - Pallets", "CTN - Cartons", "PKG - Packages"]} onChange={(value) => setValue("packageType", value)} disabled={!editable} /><Field label="Weight" value={values.weight} onChange={(value) => setValue("weight", value)} disabled={!editable} /><Field label="Volume" value={values.volume} onChange={(value) => setValue("volume", value)} disabled={!editable} /><Field label="Chargeable" value={values.chargeable} onChange={(value) => setValue("chargeable", value)} disabled={!editable} /></div>
                  </Panel>
                  <Panel title="Cargo and references">
                    <div className="grid gap-1"><LookupField label="Pic. drop" value={values.pickupDrop} onChange={(value) => setValue("pickupDrop", value)} disabled={!editable} /><LookupField label="Dlv. drop" value={values.deliveryDrop} onChange={(value) => setValue("deliveryDrop", value)} disabled={!editable} /><LookupField label="Commodity" value={values.commodity} onChange={(value) => setValue("commodity", value)} disabled={!editable} /><Field label="Comm. LC" value={values.commodityLocal} onChange={(value) => setValue("commodityLocal", value)} disabled={!editable} /><Field label="FMC TID" value={values.fmcTid} onChange={(value) => setValue("fmcTid", value)} disabled={!editable} /></div>
                  </Panel>
                  <Panel title="Monetary values">
                    <div className="grid gap-1"><Field label="Goods value" value={values.goodsValue} onChange={(value) => setValue("goodsValue", value)} disabled={!editable} /><Field label="Ins. value" value={values.insuranceValue} onChange={(value) => setValue("insuranceValue", value)} disabled={!editable} /><SelectField label="Insurance" value={values.insuranceRequired} options={["No", "Yes - required", "To be advised"]} onChange={(value) => setValue("insuranceRequired", value)} disabled={!editable} /><Field label="Spot rate" value={values.spotRate} onChange={(value) => setValue("spotRate", value)} disabled={!editable} /><div className="flex items-center justify-end gap-2 px-1"><span className="text-[10.5px] font-medium text-[var(--md-text)]">{t("NVOCC display")}</span><Switch size="sm" checked={nvocc} onCheckedChange={setNvocc} disabled={!editable} aria-label={t("Toggle NVOCC display")} /></div></div>
                  </Panel>
                  <Panel title="Brokerage and security">
                    <div className="grid gap-1"><SelectField label="Method" value={values.brokerageMethod} options={["PMT", "Direct", "Broker"]} onChange={(value) => setValue("brokerageMethod", value)} disabled={!editable} /><Field label="Entries" value={values.entries} onChange={(value) => setValue("entries", value)} disabled={!editable} /><Field label="Lines" value={values.lines} onChange={(value) => setValue("lines", value)} disabled={!editable} /><SelectField label="Screening" value={values.screening} options={["Not screened", "Screened", "Not required"]} onChange={(value) => setValue("screening", value)} disabled={!editable} /><Field label="Freight rates" value={values.freightRate} onChange={(value) => setValue("freightRate", value)} disabled={!editable} /><SelectField label="CT level" value={values.ctLevel} options={["Not selected", "Standard", "Enhanced"]} onChange={(value) => setValue("ctLevel", value)} disabled={!editable} /></div>
                  </Panel>
                </div>

                <Panel title="Control and audit">
                  <div className="grid gap-1 md:grid-cols-2 2xl:grid-cols-4"><LookupField label="Local ref" value={values.localReference} onChange={(value) => setValue("localReference", value)} disabled={!editable} /><LookupField label="Sales rep" value={values.salesRep} onChange={(value) => setValue("salesRep", value)} disabled={!editable} /><LookupField label="Ops rep" value={values.opsRep} onChange={(value) => setValue("opsRep", value)} disabled={!editable} /><LookupField label="Start date" value={values.startDate} onChange={(value) => setValue("startDate", value)} disabled={!editable} action="date" /><LookupField label="End date" value={values.endDate} onChange={(value) => setValue("endDate", value)} disabled={!editable} action="date" /><div className="flex items-center gap-2 px-1 text-[10.5px] text-[var(--md-text)]"><Check className="size-3.5 text-[var(--md-green)]" />{t("Quote charges held from Q-19158")}</div><div className="flex items-center gap-2 px-1 text-[10.5px] text-[var(--md-text)]"><ShieldCheck className="size-3.5 text-[var(--md-accent)]" />{t("No customer confirmation sent")}</div></div>
                </Panel>
            </div>
          </TabsContent>

          <TabsContent value="additional" className="mt-0"><PlaceholderPanel title="Additional details" detail="Add booking-level instructions, delivery appointment notes, special equipment needs, and internal planning details." actionLabel="Add instruction" /></TabsContent>
          <TabsContent value="custom" className="mt-0"><PlaceholderPanel title="Custom fields" detail="Customer-specific and operational fields appear here once configured for the booking template." actionLabel="Add custom field" /></TabsContent>
          <TabsContent value="documents" className="mt-0"><PlaceholderPanel title="Document selection" detail="Select quote, shipping, customs, and customer documents to attach to this provisional booking." actionLabel="Attach document" /></TabsContent>
          <TabsContent value="workflow" className="mt-0"><PlaceholderPanel title="Workflow & tracking" detail="Coordinate booking confirmation, carrier acceptance, document checks, and customer notification from one operational timeline." actionLabel="Add workflow step" /></TabsContent>
          <TabsContent value="addresses" className="mt-0"><PlaceholderPanel title="Address book" detail="Manage pickup, delivery, consignor, consignee, and notify-party locations used by this booking." actionLabel="Add address" /></TabsContent>
          <TabsContent value="edocs" className="mt-0"><PlaceholderPanel title="Electronic documents" detail="Generate booking confirmations, carrier instructions, customer copies, and supporting eDocs here." actionLabel="Generate document" /></TabsContent>
          <TabsContent value="notes" className="mt-0"><PlaceholderPanel title="Notes" detail="Keep the operational handover concise, factual, and visible to the people working the booking." actionLabel="Add note" /></TabsContent>
          <TabsContent value="log" className="mt-0"><PlaceholderPanel title="Activity log" detail="A record of quote conversion, booking edits, document events, and customer-facing actions will appear here." actionLabel="Add log entry" /></TabsContent>
          </div>
        </Tabs>
      </div>
    </main>
  )
}
