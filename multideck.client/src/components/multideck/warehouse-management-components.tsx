import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, ChevronDown, Download, FileSpreadsheet, LayoutGrid, Loader2, MapPin, Package, Plus, RefreshCw, Search, Trash2, Upload, Warehouse } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WarehouseInventoryTable } from "@/components/multideck/warehouse-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { FilterChips } from "@/components/multideck/workflow-components"
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"
import { useLanguage } from "@/i18n/language-provider"
import {
  WarehouseApiError,
  createWarehouseFacility,
  createWarehouseItem,
  createWarehouseLocation,
  downloadWarehouseItemsTemplate,
  importWarehouseItems,
  deleteWarehouseFacility,
  deleteWarehouseItem,
  deleteWarehouseLocation,
  getWarehouseFacilityReference,
  getWarehouseItemReference,
  getWarehouseLocationReference,
  listWarehouseFacilities,
  listWarehouseItems,
  listWarehouseLocations,
  updateWarehouseFacility,
  updateWarehouseItem,
  updateWarehouseLocation,
  type CreateWarehouseItemInput,
  type UpdateWarehouseItemInput,
  type WarehouseFacility,
  type WarehouseFacilityInput,
  type WarehouseFacilityReference,
  type ImportItemsResult,
  type WarehouseItem,
  type WarehouseItemReference,
  type WarehouseLocation,
  type WarehouseLocationInput,
  type WarehouseLocationReference,
} from "@/lib/warehouse-api"

// ---------------------------------------------------------------------------
// Shared field primitives
// ---------------------------------------------------------------------------

const fieldControlClass =
<<<<<<< Updated upstream
  "!h-10 !w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 !px-3 !text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"

export const warehouseDialogHeaderClass =
  "bg-[var(--md-surface-soft)] px-6 py-5 pe-14 text-start shadow-[var(--md-stroke-bottom)] [&_[data-slot=dialog-title]]:text-[17px] [&_[data-slot=dialog-title]]:leading-6"

export const warehouseDialogFooterClass =
  "!mx-0 !mb-0 bg-[var(--md-surface-soft)] px-6 py-4 shadow-[var(--md-stroke-top)]"
=======
  "h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
>>>>>>> Stashed changes

/**
 * WarehouseFormField
 * A calm, reusable labelled field wrapper: label, optional required marker,
 * the control, and a single hint-or-error line. Direction-safe and localised
 * automatically through the app language layer.
 */
export function WarehouseFormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("grid min-w-0 self-start content-start gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[12px] font-medium text-[var(--md-ink)]">
        {label}
        {required ? <span className="text-[var(--md-red)]" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[11.5px] text-[var(--md-red)]">
          <AlertCircle className="size-3" strokeWidth={1.5} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{hint}</p>
      ) : null}
    </div>
  )
}

function WarehouseSwitchField({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-2.5 shadow-[var(--md-shadow-line)]">
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[var(--md-ink)]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-subtle)]">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

function ManagementToolbar({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
      <div className="min-w-0 2xl:me-auto">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)] 2xl:whitespace-nowrap">{meta}</p> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 2xl:flex-nowrap">{children}</div>
    </div>
  )
}

function ManagementSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative min-w-[220px] flex-1 sm:w-80 sm:max-w-[320px] sm:flex-none">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.25} />
      <Input
        dir="auto"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 pe-3 ps-9 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
      />
    </div>
  )
}

function CodeText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-i18n-skip dir="ltr" className={cn("text-[12px] font-medium tracking-normal text-[var(--md-ink)] tabular-nums", className)}>
      {children}
    </span>
  )
}

function StateBlock({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 py-14 text-center shadow-[var(--md-shadow-line)]">
      <span className="mb-3 grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        {icon}
      </span>
      <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
      <p className="mt-1 max-w-[380px] text-[13px] leading-5 text-[var(--md-text)]">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

const facilityFilters = ["Active", "All"] as const
const itemFilters = ["Active", "All"] as const

function firstFieldError(errors: Record<string, string[]>, ...keys: string[]): string | undefined {
  const lower: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(errors)) lower[key.toLowerCase()] = value
  for (const key of keys) {
    const hit = lower[key.toLowerCase()]
    if (hit?.length) return hit[0]
  }
  return undefined
}

function parseDecimal(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function numberToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value)
}

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const officeAutoValue = "__auto__"
const zoneNoneValue = "__none__"
const locationFilters = ["Active", "All"] as const

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

type FacilityFormState = {
  code: string
  name: string
  typeCode: string
  officeId: string
  customsStatusCode: string
  isBonded: boolean
  isActive: boolean
  unlocode: string
  address1: string
  address2: string
  townCity: string
  countyState: string
  postZipCode: string
  countryCode: string
  timeZone: string
}

function emptyFacilityForm(reference: WarehouseFacilityReference | null): FacilityFormState {
  return {
    code: "",
    name: "",
    typeCode: reference?.types[0]?.code ?? "",
    officeId: officeAutoValue,
    customsStatusCode: reference?.customsStatuses[0]?.code ?? "free_circulation",
    isBonded: false,
    isActive: true,
    unlocode: "",
    address1: "",
    address2: "",
    townCity: "",
    countyState: "",
    postZipCode: "",
    countryCode: "",
    timeZone: "UTC",
  }
}

function facilityToForm(facility: WarehouseFacility): FacilityFormState {
  return {
    code: facility.code,
    name: facility.name,
    typeCode: facility.typeCode,
    officeId: facility.officeId ?? officeAutoValue,
    customsStatusCode: facility.defaultCustomsStatusCode,
    isBonded: facility.isBonded,
    isActive: facility.isActive,
    unlocode: facility.unlocode ?? "",
    address1: facility.address1 ?? "",
    address2: facility.address2 ?? "",
    townCity: facility.townCity ?? "",
    countyState: facility.countyState ?? "",
    postZipCode: facility.postZipCode ?? "",
    countryCode: facility.countryCode ?? "",
    timeZone: facility.timeZone,
  }
}

function facilityFormToInput(form: FacilityFormState): WarehouseFacilityInput {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    typeCode: form.typeCode,
    officeId: form.officeId === officeAutoValue ? null : form.officeId,
    unlocode: nullableText(form.unlocode),
    address1: nullableText(form.address1),
    address2: nullableText(form.address2),
    townCity: nullableText(form.townCity),
    countyState: nullableText(form.countyState),
    postZipCode: nullableText(form.postZipCode),
    countryCode: nullableText(form.countryCode),
    timeZone: nullableText(form.timeZone),
    isBonded: form.isBonded,
    defaultCustomsStatusCode: form.customsStatusCode,
    isActive: form.isActive,
  }
}

function FacilityDialog({
  open,
  onOpenChange,
  facility,
  reference,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facility: WarehouseFacility | null
  reference: WarehouseFacilityReference | null
  onSaved: () => void
  onDeleted: () => void
}) {
  const isEditing = Boolean(facility)
  const [form, setForm] = useState<FacilityFormState>(() => emptyFacilityForm(reference))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [section, setSection] = useState("details")

  useEffect(() => {
    if (!open) return
    setErrors({})
    setSection("details")
    setForm(facility ? facilityToForm(facility) : emptyFacilityForm(reference))
  }, [open, facility, reference])

  function update<K extends keyof FacilityFormState>(key: K, value: FacilityFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit() {
    setSaving(true)
    setErrors({})
    try {
      const input = facilityFormToInput(form)
      if (isEditing && facility) {
        await updateWarehouseFacility(facility.id, input)
        toast.success("Facility updated", { description: input.name })
      } else {
        await createWarehouseFacility(input)
        toast.success("Facility created", { description: input.name })
      }
      onOpenChange(false)
      onSaved()
    } catch (error) {
      if (error instanceof WarehouseApiError) {
        setErrors(error.fieldErrors)
        toast.error(isEditing ? "Facility could not be updated" : "Facility could not be created", { description: error.message })
      } else {
        toast.error("Something went wrong", { description: String(error) })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!facility) return
    setDeleting(true)
    try {
      await deleteWarehouseFacility(facility.id)
      toast.success("Facility deleted", { description: facility.name })
      onOpenChange(false)
      onDeleted()
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      toast.error("Facility could not be deleted", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[680px]">
        <DialogHeader className={warehouseDialogHeaderClass}>
          <DialogTitle className="text-[16px] font-medium">{isEditing ? "Edit facility" : "New facility"}</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--md-text)]">
            Facilities are the physical warehouse locations where customer stock is received and stored.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={section} onValueChange={setSection} className="h-[402px] gap-0">
          <TabsList variant="line" className="mx-6 mt-3 h-10 w-auto justify-start rounded-none bg-transparent p-0">
            <TabsTrigger value="details" className="h-10 flex-none px-3 text-[13px]">Facility details</TabsTrigger>
            <TabsTrigger value="address" className="h-10 flex-none px-3 text-[13px]">Address</TabsTrigger>
            <TabsTrigger value="settings" className="h-10 flex-none px-3 text-[13px]">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="grid min-h-0 content-start gap-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Facility code" htmlFor="facility-code" required error={firstFieldError(errors, "Code")} hint="A short unique code, e.g. FXT-DC1.">
              <Input id="facility-code" dir="ltr" value={form.code} onChange={(event) => update("code", event.target.value)} className={fieldControlClass} placeholder="FXT-DC1" />
            </WarehouseFormField>
            <WarehouseFormField label="Facility name" htmlFor="facility-name" required error={firstFieldError(errors, "Name")}>
              <Input id="facility-name" value={form.name} onChange={(event) => update("name", event.target.value)} className={fieldControlClass} placeholder="Felixstowe DC" />
            </WarehouseFormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Facility type" required error={firstFieldError(errors, "TypeCode")}>
              <Select value={form.typeCode} onValueChange={(value) => update("typeCode", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a type" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.types.map((type) => (
                    <SelectItem key={type.code} value={type.code} className="text-[13px]">{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
            <WarehouseFormField label="Office" hint="Links the facility to a company office. Defaults to your primary office." error={firstFieldError(errors, "OfficeId")}>
              <Select value={form.officeId} onValueChange={(value) => update("officeId", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Default office" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  <SelectItem value={officeAutoValue} className="text-[13px]">Default office</SelectItem>
                  {reference?.offices.map((office) => (
                    <SelectItem key={office.id} value={office.id} className="text-[13px]">{office.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Default customs status" error={firstFieldError(errors, "DefaultCustomsStatusCode")}>
              <Select value={form.customsStatusCode} onValueChange={(value) => update("customsStatusCode", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Customs status" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.customsStatuses.map((status) => (
                    <SelectItem key={status.code} value={status.code} className="text-[13px]">{status.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
            <WarehouseFormField label="UN/LOCODE" htmlFor="facility-unlocode" hint="Optional 5-letter port/location code." error={firstFieldError(errors, "Unlocode")}>
              <Input id="facility-unlocode" dir="ltr" value={form.unlocode} onChange={(event) => update("unlocode", event.target.value)} className={fieldControlClass} placeholder="GBFXT" maxLength={5} />
            </WarehouseFormField>
          </div>

          </TabsContent>
          <TabsContent value="address" className="grid min-h-0 content-start gap-4 px-6 py-5">
          <WarehouseFormField label="Address line 1" htmlFor="facility-address1" error={firstFieldError(errors, "Address1")}>
            <Input id="facility-address1" value={form.address1} onChange={(event) => update("address1", event.target.value)} className={fieldControlClass} />
          </WarehouseFormField>
          <WarehouseFormField label="Address line 2" htmlFor="facility-address2" error={firstFieldError(errors, "Address2")}>
            <Input id="facility-address2" value={form.address2} onChange={(event) => update("address2", event.target.value)} className={fieldControlClass} />
          </WarehouseFormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Town / City" htmlFor="facility-town" error={firstFieldError(errors, "TownCity")}>
              <Input id="facility-town" value={form.townCity} onChange={(event) => update("townCity", event.target.value)} className={fieldControlClass} />
            </WarehouseFormField>
            <WarehouseFormField label="County / State" htmlFor="facility-county" error={firstFieldError(errors, "CountyState")}>
              <Input id="facility-county" value={form.countyState} onChange={(event) => update("countyState", event.target.value)} className={fieldControlClass} />
            </WarehouseFormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <WarehouseFormField label="Post / Zip code" htmlFor="facility-zip" error={firstFieldError(errors, "PostZipCode")}>
              <Input id="facility-zip" dir="ltr" value={form.postZipCode} onChange={(event) => update("postZipCode", event.target.value)} className={fieldControlClass} />
            </WarehouseFormField>
            <WarehouseFormField label="Country code" htmlFor="facility-country" hint="2-letter ISO." error={firstFieldError(errors, "CountryCode")}>
              <Input id="facility-country" dir="ltr" value={form.countryCode} onChange={(event) => update("countryCode", event.target.value)} className={fieldControlClass} placeholder="GB" maxLength={2} />
            </WarehouseFormField>
            <WarehouseFormField label="Time zone" htmlFor="facility-tz" error={firstFieldError(errors, "TimeZone")}>
              <Input id="facility-tz" dir="ltr" value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)} className={fieldControlClass} placeholder="UTC" />
            </WarehouseFormField>
          </div>

          </TabsContent>
          <TabsContent value="settings" className="min-h-0 px-6 py-5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <WarehouseSwitchField label="Bonded facility" hint="Customs-controlled, duty-suspended storage." checked={form.isBonded} onCheckedChange={(checked) => update("isBonded", checked)} />
            {isEditing ? (
              <WarehouseSwitchField label="Active" hint="Inactive facilities stay on record but are hidden by default." checked={form.isActive} onCheckedChange={(checked) => update("isActive", checked)} />
            ) : null}
          </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className={cn(warehouseDialogFooterClass, "flex-row items-center justify-between gap-2 sm:justify-between")}>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
              {deleting ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              Delete
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={saving} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : null}
              {isEditing ? "Save changes" : "Create facility"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WarehouseFacilitiesView() {
  const shouldReduceMotion = useReducedMotion()
  const [reference, setReference] = useState<WarehouseFacilityReference | null>(null)
  const [facilities, setFacilities] = useState<WarehouseFacility[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>(facilityFilters[0])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseFacility | null>(null)

  async function refresh() {
    setLoadError(null)
    try {
      const [referenceData, list] = await Promise.all([
        reference ? Promise.resolve(reference) : getWarehouseFacilityReference(),
        listWarehouseFacilities({ search: search.trim() || undefined, includeInactive: activeFilter === "All" }),
      ])
      setReference(referenceData)
      setFacilities(list)
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      setLoadError(message)
      setFacilities([])
    }
  }

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => listWarehouseFacilities({ search: search.trim() || undefined, includeInactive: activeFilter === "All" })
      .then((list) => { if (active) { setLoadError(null); setFacilities(list) } })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setFacilities([])
      }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activeFilter, search])

  useEffect(() => {
    let active = true
    getWarehouseFacilityReference()
      .then((data) => { if (active) setReference(data) })
      .catch(() => { /* reference is optional for viewing */ })
    return () => { active = false }
  }, [])

  const visibleRows = facilities ?? []

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(facility: WarehouseFacility) {
    setEditing(facility)
    setDialogOpen(true)
  }

  const columns = [
    {
      key: "code",
      label: "Code",
      className: "min-w-[140px]",
      render: (facility: WarehouseFacility) => <CodeText>{facility.code}</CodeText>,
    },
    {
      key: "facility",
      label: "Facility",
      className: "min-w-[240px]",
      render: (facility: WarehouseFacility) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{facility.name}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{facility.typeName ?? facility.typeCode}</p>
        </div>
      ),
    },
    {
      key: "location",
      label: "Location",
      className: "min-w-[200px]",
      render: (facility: WarehouseFacility) => {
        const parts = [facility.townCity, facility.countryCode].filter(Boolean).join(", ")
        return parts ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--md-ink)]">
            <MapPin className="size-3.5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
            {parts}
          </span>
        ) : <span className="text-[12px] text-[var(--md-subtle)]">No address</span>
      },
    },
    {
      key: "bonded",
      label: "Bonded",
      render: (facility: WarehouseFacility) =>
        facility.isBonded ? <StatusPill tone="teal">Bonded</StatusPill> : <span className="text-[12px] text-[var(--md-subtle)]">Standard</span>,
    },
    {
      key: "status",
      label: "Status",
      align: "right" as const,
      render: (facility: WarehouseFacility) =>
        facility.isActive ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="neutral">Inactive</StatusPill>,
    },
  ]

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <ManagementToolbar title="Facilities" meta="Create and manage the warehouse locations where customer stock is stored.">
        <FilterChips className="shrink-0 flex-nowrap" options={facilityFilters} activeOption={activeFilter} onChange={setActiveFilter} />
        <ManagementSearch value={search} onChange={setSearch} placeholder="Search code, name, city..." />
        <Button onClick={openCreate} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
          <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
          New facility
        </Button>
      </ManagementToolbar>

      {loadError ? (
        <StateBlock
          icon={<AlertCircle className="size-5" strokeWidth={1.4} />}
          title="Facilities could not be loaded"
          detail={loadError}
          action={
            <Button onClick={() => void refresh()} variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              Retry
            </Button>
          }
        />
      ) : facilities === null ? (
        <StateBlock icon={<Loader2 className="size-5 animate-spin" strokeWidth={1.4} />} title="Loading facilities" detail="Fetching your warehouse locations." />
      ) : facilities.length === 0 && !search.trim() ? (
        <StateBlock
          icon={<Warehouse className="size-5" strokeWidth={1.4} />}
          title="No facilities yet"
          detail="Create your first warehouse location to start storing customer stock."
          action={
            <Button onClick={openCreate} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              New facility
            </Button>
          }
        />
      ) : (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          <WarehouseInventoryTable
            rows={visibleRows}
            columns={columns}
            minWidth={880}
            rowLabel="facilities"
            emptyMessage="No facilities match this search."
            onRowClick={openEdit}
            rowDetailLabel={(facility) => `Edit facility ${facility.name}`}
          />
        </motion.div>
      )}

      <FacilityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        facility={editing}
        reference={reference}
        onSaved={() => void refresh()}
        onDeleted={() => void refresh()}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

type ItemFormState = {
  customerOrgId: string
  facilityId: string
  sku: string
  description: string
  commodityDescription: string
  hsCode: string
  countryOfOriginCode: string
  baseUomCode: string
  lengthM: string
  widthM: string
  heightM: string
  netWeightKg: string
  grossWeightKg: string
  temperatureMinC: string
  temperatureMaxC: string
  isDangerousGoods: boolean
  isExciseGoods: boolean
  isHighValue: boolean
  isBondedEligible: boolean
  requiresLot: boolean
  requiresSerial: boolean
  requiresExpiry: boolean
  isActive: boolean
}

function emptyItemForm(reference: WarehouseItemReference | null): ItemFormState {
  return {
    customerOrgId: reference?.customers[0]?.id ?? "",
    facilityId: reference?.facilities[0]?.id ?? "",
    sku: "",
    description: "",
    commodityDescription: "",
    hsCode: "",
    countryOfOriginCode: "",
    baseUomCode: "EA",
    lengthM: "",
    widthM: "",
    heightM: "",
    netWeightKg: "",
    grossWeightKg: "",
    temperatureMinC: "",
    temperatureMaxC: "",
    isDangerousGoods: false,
    isExciseGoods: false,
    isHighValue: false,
    isBondedEligible: false,
    requiresLot: false,
    requiresSerial: false,
    requiresExpiry: false,
    isActive: true,
  }
}

function itemToForm(item: WarehouseItem): ItemFormState {
  return {
    customerOrgId: item.customerOrgId,
    facilityId: item.facilityId ?? "",
    sku: item.sku,
    description: item.description,
    commodityDescription: item.commodityDescription ?? "",
    hsCode: item.hsCode ?? "",
    countryOfOriginCode: item.countryOfOriginCode ?? "",
    baseUomCode: item.baseUomCode,
    lengthM: numberToInput(item.lengthM),
    widthM: numberToInput(item.widthM),
    heightM: numberToInput(item.heightM),
    netWeightKg: numberToInput(item.netWeightKg),
    grossWeightKg: numberToInput(item.grossWeightKg),
    temperatureMinC: numberToInput(item.temperatureMinC),
    temperatureMaxC: numberToInput(item.temperatureMaxC),
    isDangerousGoods: item.isDangerousGoods,
    isExciseGoods: item.isExciseGoods,
    isHighValue: item.isHighValue,
    isBondedEligible: item.isBondedEligible,
    requiresLot: item.requiresLot,
    requiresSerial: item.requiresSerial,
    requiresExpiry: item.requiresExpiry,
    isActive: item.isActive,
  }
}

function itemFormAttributes(form: ItemFormState) {
  return {
    sku: form.sku.trim(),
    description: form.description.trim(),
    commodityDescription: nullableText(form.commodityDescription),
    hsCode: nullableText(form.hsCode),
    countryOfOriginCode: nullableText(form.countryOfOriginCode),
    baseUomCode: nullableText(form.baseUomCode),
    lengthM: parseDecimal(form.lengthM),
    widthM: parseDecimal(form.widthM),
    heightM: parseDecimal(form.heightM),
    netWeightKg: parseDecimal(form.netWeightKg),
    grossWeightKg: parseDecimal(form.grossWeightKg),
    temperatureMinC: parseDecimal(form.temperatureMinC),
    temperatureMaxC: parseDecimal(form.temperatureMaxC),
    isDangerousGoods: form.isDangerousGoods,
    isExciseGoods: form.isExciseGoods,
    isHighValue: form.isHighValue,
    isBondedEligible: form.isBondedEligible,
    requiresLot: form.requiresLot,
    requiresSerial: form.requiresSerial,
    requiresExpiry: form.requiresExpiry,
  }
}

function ItemDialog({
  open,
  onOpenChange,
  item,
  reference,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: WarehouseItem | null
  reference: WarehouseItemReference | null
  onSaved: () => void
  onDeleted: () => void
}) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState<ItemFormState>(() => emptyItemForm(reference))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [section, setSection] = useState("identity")

  useEffect(() => {
    if (!open) return
    setErrors({})
    setSection("identity")
    setForm(item ? itemToForm(item) : emptyItemForm(reference))
  }, [open, item, reference])

  function update<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit() {
    setSaving(true)
    setErrors({})
    try {
      const attributes = itemFormAttributes(form)
      if (isEditing && item) {
        const input: UpdateWarehouseItemInput = { ...attributes, facilityId: form.facilityId, isActive: form.isActive }
        await updateWarehouseItem(item.id, input)
        toast.success("Item updated", { description: attributes.sku })
      } else {
        const input: CreateWarehouseItemInput = { ...attributes, customerOrgId: form.customerOrgId, facilityId: form.facilityId }
        await createWarehouseItem(input)
        toast.success("Item created", { description: attributes.sku })
      }
      onOpenChange(false)
      onSaved()
    } catch (error) {
      if (error instanceof WarehouseApiError) {
        setErrors(error.fieldErrors)
        toast.error(isEditing ? "Item could not be updated" : "Item could not be created", { description: error.message })
      } else {
        toast.error("Something went wrong", { description: String(error) })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!item) return
    setDeleting(true)
    try {
      await deleteWarehouseItem(item.id)
      toast.success("Item deleted", { description: item.sku })
      onOpenChange(false)
      onDeleted()
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      toast.error("Item could not be deleted", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  const customerName = reference?.customers.find((customer) => customer.id === form.customerOrgId)?.name ?? item?.customerOrgName ?? ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[760px]">
        <DialogHeader className={warehouseDialogHeaderClass}>
          <DialogTitle className="text-[16px] font-medium">{isEditing ? "Edit item" : "New item"}</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--md-text)]">
            Items are the SKUs stored for a customer in one of your facilities.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={section} onValueChange={setSection} className="h-[552px] gap-0">
          <TabsList variant="line" className="mx-6 mt-3 h-10 w-auto justify-start rounded-none bg-transparent p-0">
            <TabsTrigger value="identity" className="h-10 flex-none px-3 text-[13px]">Item details</TabsTrigger>
            <TabsTrigger value="dimensions" className="h-10 flex-none px-3 text-[13px]">Dimensions &amp; storage</TabsTrigger>
            <TabsTrigger value="handling" className="h-10 flex-none px-3 text-[13px]">Handling rules</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="grid min-h-0 content-start gap-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Customer" required error={firstFieldError(errors, "CustomerOrgId")}>
              {isEditing ? (
                <Input value={customerName} readOnly className={cn(fieldControlClass, "cursor-not-allowed opacity-80")} />
              ) : (
                <Select value={form.customerOrgId} onValueChange={(value) => update("customerOrgId", value)}>
                  <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a customer" /></SelectTrigger>
                  <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                    {reference?.customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id} className="text-[13px]">{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </WarehouseFormField>
            <WarehouseFormField label="Facility" required error={firstFieldError(errors, "FacilityId")}>
              <Select value={form.facilityId} onValueChange={(value) => update("facilityId", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a facility" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.facilities.map((facility) => (
                    <SelectItem key={facility.id} value={facility.id} className="text-[13px]">{facility.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="SKU" htmlFor="item-sku" required error={firstFieldError(errors, "Sku")}>
              <Input id="item-sku" dir="ltr" value={form.sku} onChange={(event) => update("sku", event.target.value)} className={fieldControlClass} placeholder="MAR-ACT-044" />
            </WarehouseFormField>
            <WarehouseFormField label="Base unit of measure" htmlFor="item-uom" hint="e.g. EA, CTN, PLT." error={firstFieldError(errors, "BaseUomCode")}>
              <Input id="item-uom" dir="ltr" value={form.baseUomCode} onChange={(event) => update("baseUomCode", event.target.value)} className={fieldControlClass} placeholder="EA" />
            </WarehouseFormField>
          </div>

          <WarehouseFormField label="Description" htmlFor="item-description" required error={firstFieldError(errors, "Description")}>
            <Input id="item-description" value={form.description} onChange={(event) => update("description", event.target.value)} className={fieldControlClass} placeholder="Thermal activewear carton" />
          </WarehouseFormField>

          <WarehouseFormField label="Commodity description" htmlFor="item-commodity" hint="Optional customs-facing description.">
            <Textarea id="item-commodity" value={form.commodityDescription} onChange={(event) => update("commodityDescription", event.target.value)} className="min-h-[64px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 py-2 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]" />
          </WarehouseFormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="HS code" htmlFor="item-hs" error={firstFieldError(errors, "HsCode")}>
              <Input id="item-hs" dir="ltr" value={form.hsCode} onChange={(event) => update("hsCode", event.target.value)} className={fieldControlClass} placeholder="6109.90.20" />
            </WarehouseFormField>
            <WarehouseFormField label="Country of origin" htmlFor="item-origin" hint="2-letter ISO." error={firstFieldError(errors, "CountryOfOriginCode")}>
              <Input id="item-origin" dir="ltr" value={form.countryOfOriginCode} onChange={(event) => update("countryOfOriginCode", event.target.value)} className={fieldControlClass} placeholder="CN" maxLength={2} />
            </WarehouseFormField>
          </div>

          </TabsContent>

          <TabsContent value="dimensions" className="min-h-0 px-6 py-5">
          <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/40 p-3 shadow-[var(--md-shadow-line)]">
            <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">Dimensions & weight</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <WarehouseFormField label="Length (m)" htmlFor="item-length" error={firstFieldError(errors, "LengthM")}>
                <Input id="item-length" dir="ltr" type="number" step="0.001" min="0" value={form.lengthM} onChange={(event) => update("lengthM", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Width (m)" htmlFor="item-width" error={firstFieldError(errors, "WidthM")}>
                <Input id="item-width" dir="ltr" type="number" step="0.001" min="0" value={form.widthM} onChange={(event) => update("widthM", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Height (m)" htmlFor="item-height" error={firstFieldError(errors, "HeightM")}>
                <Input id="item-height" dir="ltr" type="number" step="0.001" min="0" value={form.heightM} onChange={(event) => update("heightM", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WarehouseFormField label="Net weight (kg)" htmlFor="item-net" error={firstFieldError(errors, "NetWeightKg")}>
                <Input id="item-net" dir="ltr" type="number" step="0.001" min="0" value={form.netWeightKg} onChange={(event) => update("netWeightKg", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Gross weight (kg)" htmlFor="item-gross" error={firstFieldError(errors, "GrossWeightKg")}>
                <Input id="item-gross" dir="ltr" type="number" step="0.001" min="0" value={form.grossWeightKg} onChange={(event) => update("grossWeightKg", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WarehouseFormField label="Min temperature (°C)" htmlFor="item-tmin" error={firstFieldError(errors, "TemperatureMinC")}>
                <Input id="item-tmin" dir="ltr" type="number" step="0.1" value={form.temperatureMinC} onChange={(event) => update("temperatureMinC", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Max temperature (°C)" htmlFor="item-tmax" error={firstFieldError(errors, "TemperatureMaxC")}>
                <Input id="item-tmax" dir="ltr" type="number" step="0.1" value={form.temperatureMaxC} onChange={(event) => update("temperatureMaxC", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
            </div>
          </div>

          </TabsContent>

          <TabsContent value="handling" className="min-h-0 px-6 py-5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <WarehouseSwitchField label="Dangerous goods" checked={form.isDangerousGoods} onCheckedChange={(checked) => update("isDangerousGoods", checked)} />
            <WarehouseSwitchField label="Excise goods" checked={form.isExciseGoods} onCheckedChange={(checked) => update("isExciseGoods", checked)} />
            <WarehouseSwitchField label="High value" checked={form.isHighValue} onCheckedChange={(checked) => update("isHighValue", checked)} />
            <WarehouseSwitchField label="Bonded eligible" checked={form.isBondedEligible} onCheckedChange={(checked) => update("isBondedEligible", checked)} />
            <WarehouseSwitchField label="Requires lot" checked={form.requiresLot} onCheckedChange={(checked) => update("requiresLot", checked)} />
            <WarehouseSwitchField label="Requires serial" checked={form.requiresSerial} onCheckedChange={(checked) => update("requiresSerial", checked)} />
            <WarehouseSwitchField label="Requires expiry" checked={form.requiresExpiry} onCheckedChange={(checked) => update("requiresExpiry", checked)} />
            {isEditing ? (
              <WarehouseSwitchField label="Active" hint="Inactive items stay on record but are hidden by default." checked={form.isActive} onCheckedChange={(checked) => update("isActive", checked)} />
            ) : null}
          </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className={cn(warehouseDialogFooterClass, "flex-row items-center justify-between gap-2 sm:justify-between")}>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
              {deleting ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              Delete
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={saving} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : null}
              {isEditing ? "Save changes" : "Create item"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportItemsDialog({
  open,
  onOpenChange,
  reference,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reference: WarehouseItemReference | null
  onImported: () => void
}) {
  const [customerOrgId, setCustomerOrgId] = useState("")
  const [facilityId, setFacilityId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportItemsResult | null>(null)

  useEffect(() => {
    if (!open) return
    setCustomerOrgId(reference?.customers[0]?.id ?? "")
    setFacilityId(reference?.facilities[0]?.id ?? "")
    setFile(null)
    setResult(null)
  }, [open, reference])

  async function handleDownloadTemplate() {
    setDownloading(true)
    try {
      await downloadWarehouseItemsTemplate()
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      toast.error("Template could not be downloaded", { description: message })
    } finally {
      setDownloading(false)
    }
  }

  async function handleImport() {
    if (!file || !customerOrgId || !facilityId) return
    setImporting(true)
    setResult(null)
    try {
      const response = await importWarehouseItems({ customerOrgId, facilityId, file })
      setResult(response)
      if (response.created > 0) {
        toast.success(`Imported ${response.created} item(s)`)
        onImported()
      }
      if (response.failed > 0) {
        toast.error(`${response.failed} item(s) could not be imported`)
      }
      if (response.created === 0 && response.failed === 0) {
        toast.error("No items were found in the spreadsheet")
      }
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      toast.error("Items could not be imported", { description: message })
    } finally {
      setImporting(false)
    }
  }

  const failedResults = result?.results.filter((row) => !row.success) ?? []
  const canImport = Boolean(file && customerOrgId && facilityId && !importing)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[680px]">
        <DialogHeader className={warehouseDialogHeaderClass}>
          <DialogTitle className="text-[16px] font-medium">Import items</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--md-text)]">
            Bulk-create items from a spreadsheet. Every imported item is created for the customer and facility you choose here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5 px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Customer" required>
              <Select value={customerOrgId} onValueChange={setCustomerOrgId}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a customer" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id} className="text-[13px]">{customer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
            <WarehouseFormField label="Facility" required>
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a facility" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.facilities.map((facility) => (
                    <SelectItem key={facility.id} value={facility.id} className="text-[13px]">{facility.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-2.5 shadow-[var(--md-shadow-line)]">
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-[var(--md-ink)]">Step 1 - Download the template</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-subtle)]">An .xlsx with every item field and two example rows.</span>
            </span>
            <Button type="button" variant="ghost" onClick={handleDownloadTemplate} disabled={downloading} className="h-9 shrink-0 rounded-[var(--md-radius-md)] bg-white/60 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80">
              {downloading ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Download data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              Template
            </Button>
          </div>

          <div className="grid gap-2">
            <span className="text-[12.5px] font-medium text-[var(--md-ink)]">Step 2 - Upload the filled-in file</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-3 shadow-[var(--md-shadow-line)] transition-colors hover:bg-white/68">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
                <FileSpreadsheet className="size-4" strokeWidth={1.4} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{file ? file.name : "Choose .xlsx file"}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">Each row needs at least SKU, Base UOM, and Description.</span>
              </span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(event) => {
                  setResult(null)
                  setFile(event.target.files?.[0] ?? null)
                }}
              />
            </label>
          </div>

          {result ? (
            <div className="grid gap-2 rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-3 shadow-[var(--md-shadow-line)]">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--md-ink)]">
                <CheckCircle2 className="size-4 text-[var(--md-green)]" strokeWidth={1.5} aria-hidden="true" />
                {result.created} created
                {result.failed > 0 ? <span className="text-[var(--md-red)]">- {result.failed} failed</span> : null}
              </div>
              {failedResults.length ? (
                <ul className="grid gap-1">
                  {failedResults.slice(0, 4).map((row) => (
                    <li key={`${row.row}-${row.sku ?? "row"}`} className="text-[11.5px] text-[var(--md-text)]">
                      <span className="text-[var(--md-subtle)]">Row {row.row}</span>
                      {row.sku ? <span data-i18n-skip dir="ltr"> ({row.sku})</span> : null}: {row.error}
                    </li>
                  ))}
                  {failedResults.length > 4 ? (
                    <li className="text-[11.5px] text-[var(--md-subtle)]">and {failedResults.length - 4} more...</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className={cn(warehouseDialogFooterClass, "flex-row items-center justify-end gap-2")}>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
            {result ? "Close" : "Cancel"}
          </Button>
          <Button type="button" onClick={handleImport} disabled={!canImport} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-50">
            {importing ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Upload data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
            Import items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WarehouseItemsView({ canManage = true }: { canManage?: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const { language, t } = useLanguage()
  const numberFormat = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3 }), [language])
  const [reference, setReference] = useState<WarehouseItemReference | null>(null)
  const [items, setItems] = useState<WarehouseItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [facilityId, setFacilityId] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>(itemFilters[0])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseItem | null>(null)

  async function refresh() {
    setLoadError(null)
    try {
      const list = await listWarehouseItems({ facilityId: facilityId || undefined, search: search.trim() || undefined, includeInactive: activeFilter === "All" })
      setItems(list)
    } catch (error) {
      setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
      setItems([])
    }
  }

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => listWarehouseItems({ facilityId: facilityId || undefined, search: search.trim() || undefined, includeInactive: activeFilter === "All" })
      .then((list) => { if (active) { setLoadError(null); setItems(list) } })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setItems([])
      }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activeFilter, facilityId, search])

  useEffect(() => {
    let active = true
    getWarehouseItemReference()
      .then((data) => { if (active) setReference(data) })
      .catch(() => { /* reference is optional for viewing */ })
    return () => { active = false }
  }, [])

  const visibleRows = items ?? []

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(item: WarehouseItem) {
    setEditing(item)
    setDialogOpen(true)
  }

  const canCreate = Boolean(reference && reference.customers.length && reference.facilities.length)

  const columns = [
    {
      key: "sku",
      label: "SKU",
      className: "min-w-[140px]",
      render: (item: WarehouseItem) => <CodeText>{item.sku}</CodeText>,
    },
    {
      key: "item",
      label: "Item",
      className: "min-w-[260px]",
      render: (item: WarehouseItem) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{item.description}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{item.customerOrgName ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "facility",
      label: "Facility",
      className: "min-w-[180px]",
      render: (item: WarehouseItem) => <span className="text-[13px] text-[var(--md-ink)]">{item.facilityName ?? "—"}</span>,
    },
    {
      key: "hs",
      label: "HS code",
      render: (item: WarehouseItem) => item.hsCode ? <CodeText className="text-[var(--md-text)]">{item.hsCode}</CodeText> : <span className="text-[12px] text-[var(--md-subtle)]">—</span>,
    },
    {
      key: "uom",
      label: "UOM",
      align: "center" as const,
      render: (item: WarehouseItem) => <CodeText className="text-[var(--md-text)]">{item.baseUomCode}</CodeText>,
    },
    {
      key: "gross",
      label: "Gross kg",
      align: "right" as const,
      render: (item: WarehouseItem) => (
        <span className="tabular-nums text-[var(--md-ink)]">{item.grossWeightKg === null ? "—" : numberFormat.format(item.grossWeightKg)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "right" as const,
      render: (item: WarehouseItem) => item.isActive ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="neutral">Inactive</StatusPill>,
    },
  ]

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <ManagementToolbar title="Items" meta="Create and manage the customer SKUs stored across your facilities.">
        <FilterChips className="shrink-0 flex-nowrap" options={itemFilters} activeOption={activeFilter} onChange={setActiveFilter} />
        <Select value={facilityId || "__all__"} onValueChange={(value) => setFacilityId(value === "__all__" ? "" : value)}>
          <SelectTrigger aria-label="Facility" className="h-10 min-w-[190px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <SelectValue placeholder="All facilities" />
          </SelectTrigger>
          <SelectContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
            <SelectItem value="__all__">All facilities</SelectItem>
            {reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <ManagementSearch value={search} onChange={setSearch} placeholder="Search SKU, description, customer..." />
        {canManage ? <Button
          type="button"
          variant="ghost"
          aria-label={t("Import stock")}
          title={t("Import stock")}
          onClick={() => setImportOpen(true)}
          disabled={!canCreate}
          className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74 disabled:opacity-50"
        >
          <Upload data-icon="inline-start" className="size-4" strokeWidth={1.4} />
          {t("Import stock")}
        </Button> : null}
        {canManage ? <Button onClick={openCreate} disabled={!canCreate} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-50">
          <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
          New item
        </Button> : null}
      </ManagementToolbar>

      {loadError ? (
        <StateBlock
          icon={<AlertCircle className="size-5" strokeWidth={1.4} />}
          title="Items could not be loaded"
          detail={loadError}
          action={
            <Button onClick={() => void refresh()} variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              Retry
            </Button>
          }
        />
      ) : items === null ? (
        <StateBlock icon={<Loader2 className="size-5 animate-spin" strokeWidth={1.4} />} title="Loading items" detail="Fetching the stock items in your facilities." />
      ) : items.length === 0 && !search.trim() && !facilityId ? (
        <StateBlock
          icon={<Package className="size-5" strokeWidth={1.4} />}
          title="No items yet"
          detail={canCreate ? "Add your first item to store customer stock in a facility." : "Create a facility first, then add the items stored inside it."}
          action={canManage && canCreate ? (
            <Button onClick={openCreate} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              New item
            </Button>
          ) : undefined}
        />
      ) : (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          <WarehouseInventoryTable
            rows={visibleRows}
            columns={columns}
            minWidth={1020}
            rowLabel="items"
            emptyMessage="No items match this search."
            onRowClick={canManage ? openEdit : undefined}
            rowDetailLabel={canManage ? (item) => `Edit item ${item.sku}` : undefined}
          />
        </motion.div>
      )}

      {canManage ? <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        reference={reference}
        onSaved={() => void refresh()}
        onDeleted={() => void refresh()}
      /> : null}

      {canManage ? <ImportItemsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        reference={reference}
        onImported={() => void refresh()}
      /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

type LocationFormState = {
  code: string
  typeCode: string
  statusCode: string
  zoneTypeCode: string
  barcode: string
  aisle: string
  bay: string
  level: string
  position: string
  lengthM: string
  widthM: string
  heightM: string
  maxWeightKg: string
  maxVolumeCbm: string
  temperatureMinC: string
  temperatureMaxC: string
  allowsMultiSku: boolean
  allowsBondedStock: boolean
  isActive: boolean
}

function defaultStatusCode(reference: WarehouseLocationReference | null): string {
  if (!reference?.statuses.length) return "available"
  return reference.statuses.find((status) => status.code === "available")?.code ?? reference.statuses[0].code
}

function emptyLocationForm(reference: WarehouseLocationReference | null): LocationFormState {
  return {
    code: "",
    typeCode: reference?.types[0]?.code ?? "",
    statusCode: defaultStatusCode(reference),
    zoneTypeCode: zoneNoneValue,
    barcode: "",
    aisle: "",
    bay: "",
    level: "",
    position: "",
    lengthM: "",
    widthM: "",
    heightM: "",
    maxWeightKg: "",
    maxVolumeCbm: "",
    temperatureMinC: "",
    temperatureMaxC: "",
    allowsMultiSku: true,
    allowsBondedStock: false,
    isActive: true,
  }
}

function locationToForm(location: WarehouseLocation): LocationFormState {
  return {
    code: location.code,
    typeCode: location.typeCode,
    statusCode: location.statusCode,
    zoneTypeCode: location.zoneTypeCode ?? zoneNoneValue,
    barcode: location.barcode ?? "",
    aisle: location.aisle ?? "",
    bay: location.bay ?? "",
    level: location.level ?? "",
    position: location.position ?? "",
    lengthM: numberToInput(location.lengthM),
    widthM: numberToInput(location.widthM),
    heightM: numberToInput(location.heightM),
    maxWeightKg: numberToInput(location.maxWeightKg),
    maxVolumeCbm: numberToInput(location.maxVolumeCbm),
    temperatureMinC: numberToInput(location.temperatureMinC),
    temperatureMaxC: numberToInput(location.temperatureMaxC),
    allowsMultiSku: location.allowsMultiSku,
    allowsBondedStock: location.allowsBondedStock,
    isActive: location.isActive,
  }
}

function locationFormToInput(form: LocationFormState): WarehouseLocationInput {
  return {
    code: form.code.trim(),
    typeCode: form.typeCode,
    statusCode: nullableText(form.statusCode),
    zoneTypeCode: form.zoneTypeCode === zoneNoneValue ? null : form.zoneTypeCode,
    barcode: nullableText(form.barcode),
    aisle: nullableText(form.aisle),
    bay: nullableText(form.bay),
    level: nullableText(form.level),
    position: nullableText(form.position),
    lengthM: parseDecimal(form.lengthM),
    widthM: parseDecimal(form.widthM),
    heightM: parseDecimal(form.heightM),
    maxWeightKg: parseDecimal(form.maxWeightKg),
    maxVolumeCbm: parseDecimal(form.maxVolumeCbm),
    temperatureMinC: parseDecimal(form.temperatureMinC),
    temperatureMaxC: parseDecimal(form.temperatureMaxC),
    allowsMultiSku: form.allowsMultiSku,
    allowsBondedStock: form.allowsBondedStock,
    isActive: form.isActive,
  }
}

function locationPosition(location: WarehouseLocation): string {
  const parts = [location.aisle, location.bay, location.level, location.position].filter(Boolean)
  return parts.length ? parts.join(" / ") : "—"
}

function LocationDialog({
  open,
  onOpenChange,
  facilityId,
  location,
  reference,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilityId: string
  location: WarehouseLocation | null
  reference: WarehouseLocationReference | null
  onSaved: () => void
  onDeleted: () => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const isEditing = Boolean(location)
  const [form, setForm] = useState<LocationFormState>(() => emptyLocationForm(reference))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [section, setSection] = useState("location")
  const [capacityHasMore, setCapacityHasMore] = useState(false)
  const capacityScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setSection("location")
    setForm(location ? locationToForm(location) : emptyLocationForm(reference))
  }, [open, location, reference])

  useEffect(() => {
    if (!open || section !== "capacity") return
    const viewport = capacityScrollRef.current
    if (!viewport) return

    const updateCue = () => {
      setCapacityHasMore(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 8)
    }
    const frame = window.requestAnimationFrame(updateCue)
    const observer = new ResizeObserver(updateCue)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [open, section])

  function update<K extends keyof LocationFormState>(key: K, value: LocationFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit() {
    setSaving(true)
    setErrors({})
    try {
      const input = locationFormToInput(form)
      if (isEditing && location) {
        await updateWarehouseLocation(facilityId, location.id, input)
        toast.success("Location updated", { description: input.code })
      } else {
        await createWarehouseLocation(facilityId, input)
        toast.success("Location created", { description: input.code })
      }
      onOpenChange(false)
      onSaved()
    } catch (error) {
      if (error instanceof WarehouseApiError) {
        setErrors(error.fieldErrors)
        toast.error(isEditing ? "Location could not be updated" : "Location could not be created", { description: error.message })
      } else {
        toast.error("Something went wrong", { description: String(error) })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!location) return
    setDeleting(true)
    try {
      await deleteWarehouseLocation(facilityId, location.id)
      toast.success("Location deleted", { description: location.code })
      onOpenChange(false)
      onDeleted()
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      toast.error("Location could not be deleted", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[680px]">
        <DialogHeader className={warehouseDialogHeaderClass}>
          <DialogTitle className="text-[16px] font-medium">{isEditing ? "Edit location" : "New location"}</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--md-text)]">
            Locations are the individual bins, racks, and positions where stock sits inside this facility.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={section} onValueChange={setSection} className="h-[512px] gap-0">
          <TabsList variant="line" className="mx-6 mt-3 h-10 w-auto justify-start rounded-none bg-transparent p-0">
            <TabsTrigger value="location" className="h-10 flex-none px-3 text-[13px]">Location details</TabsTrigger>
            <TabsTrigger value="capacity" className="h-10 flex-none px-3 text-[13px]">Capacity &amp; rules</TabsTrigger>
          </TabsList>
          <TabsContent value="location" className="grid min-h-0 content-start gap-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Location code" htmlFor="location-code" required error={firstFieldError(errors, "Code")} hint="Unique within the facility, e.g. A01-04-02.">
              <Input id="location-code" dir="ltr" value={form.code} onChange={(event) => update("code", event.target.value)} className={fieldControlClass} placeholder="A01-04-02" />
            </WarehouseFormField>
            <WarehouseFormField label="Zone" hint="Zones are selected from the zone type catalogue." error={firstFieldError(errors, "ZoneTypeCode")}>
              <Select value={form.zoneTypeCode} onValueChange={(value) => update("zoneTypeCode", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="No zone" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  <SelectItem value={zoneNoneValue} className="text-[13px]">No zone</SelectItem>
                  {reference?.zones.map((zone) => (
                    <SelectItem key={zone.code} value={zone.code} className="text-[13px]">{zone.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Location type" required error={firstFieldError(errors, "TypeCode")}>
              <Select value={form.typeCode} onValueChange={(value) => update("typeCode", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a type" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.types.map((type) => (
                    <SelectItem key={type.code} value={type.code} className="text-[13px]">{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
            <WarehouseFormField label="Status" error={firstFieldError(errors, "StatusCode")}>
              <Select value={form.statusCode} onValueChange={(value) => update("statusCode", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.statuses.map((status) => (
                    <SelectItem key={status.code} value={status.code} className="text-[13px]">{status.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
          </div>

          <WarehouseFormField label="Barcode" htmlFor="location-barcode" hint="Optional scannable barcode for this location." error={firstFieldError(errors, "Barcode")}>
            <Input id="location-barcode" dir="ltr" value={form.barcode} onChange={(event) => update("barcode", event.target.value)} className={fieldControlClass} />
          </WarehouseFormField>

          </TabsContent>
          <TabsContent value="capacity" className="relative min-h-0 overflow-hidden">
          <div
            ref={capacityScrollRef}
            onScroll={(event) => {
              const viewport = event.currentTarget
              setCapacityHasMore(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 8)
            }}
            className="grid h-full content-start gap-4 overflow-y-auto px-6 pb-14 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
          <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/40 p-3 shadow-[var(--md-shadow-line)]">
            <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">Position</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <WarehouseFormField label="Aisle" htmlFor="location-aisle" error={firstFieldError(errors, "Aisle")}>
                <Input id="location-aisle" dir="ltr" value={form.aisle} onChange={(event) => update("aisle", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Bay" htmlFor="location-bay" error={firstFieldError(errors, "Bay")}>
                <Input id="location-bay" dir="ltr" value={form.bay} onChange={(event) => update("bay", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Level" htmlFor="location-level" error={firstFieldError(errors, "Level")}>
                <Input id="location-level" dir="ltr" value={form.level} onChange={(event) => update("level", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Position" htmlFor="location-position" error={firstFieldError(errors, "Position")}>
                <Input id="location-position" dir="ltr" value={form.position} onChange={(event) => update("position", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
            </div>
          </div>

          <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/40 p-3 shadow-[var(--md-shadow-line)]">
            <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">Capacity and limits</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <WarehouseFormField label="Length (m)" htmlFor="location-length" error={firstFieldError(errors, "LengthM")}>
                <Input id="location-length" dir="ltr" type="number" step="0.001" min="0" value={form.lengthM} onChange={(event) => update("lengthM", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Width (m)" htmlFor="location-width" error={firstFieldError(errors, "WidthM")}>
                <Input id="location-width" dir="ltr" type="number" step="0.001" min="0" value={form.widthM} onChange={(event) => update("widthM", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Height (m)" htmlFor="location-height" error={firstFieldError(errors, "HeightM")}>
                <Input id="location-height" dir="ltr" type="number" step="0.001" min="0" value={form.heightM} onChange={(event) => update("heightM", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Max weight (kg)" htmlFor="location-maxweight" error={firstFieldError(errors, "MaxWeightKg")}>
                <Input id="location-maxweight" dir="ltr" type="number" step="0.001" min="0" value={form.maxWeightKg} onChange={(event) => update("maxWeightKg", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Max volume (m3)" htmlFor="location-maxvol" error={firstFieldError(errors, "MaxVolumeCbm")}>
                <Input id="location-maxvol" dir="ltr" type="number" step="0.001" min="0" value={form.maxVolumeCbm} onChange={(event) => update("maxVolumeCbm", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WarehouseFormField label="Min temperature (C)" htmlFor="location-tmin" error={firstFieldError(errors, "TemperatureMinC")}>
                <Input id="location-tmin" dir="ltr" type="number" step="0.1" value={form.temperatureMinC} onChange={(event) => update("temperatureMinC", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
              <WarehouseFormField label="Max temperature (C)" htmlFor="location-tmax" error={firstFieldError(errors, "TemperatureMaxC")}>
                <Input id="location-tmax" dir="ltr" type="number" step="0.1" value={form.temperatureMaxC} onChange={(event) => update("temperatureMaxC", event.target.value)} className={fieldControlClass} />
              </WarehouseFormField>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <WarehouseSwitchField label="Allows multiple SKUs" hint="Mixed stock can share this location." checked={form.allowsMultiSku} onCheckedChange={(checked) => update("allowsMultiSku", checked)} />
            <WarehouseSwitchField label="Allows bonded stock" hint="Duty-suspended stock can be stored here." checked={form.allowsBondedStock} onCheckedChange={(checked) => update("allowsBondedStock", checked)} />
            {isEditing ? (
              <WarehouseSwitchField label="Active" hint="Inactive locations stay on record but are hidden by default." checked={form.isActive} onCheckedChange={(checked) => update("isActive", checked)} />
            ) : null}
          </div>
          </div>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-b from-transparent to-[var(--md-surface)] pb-2"
            initial={false}
            animate={{ opacity: capacityHasMore ? 1 : 0, y: capacityHasMore && !shouldReduceMotion ? [0, 3, 0] : 0 }}
            transition={{ opacity: { duration: 0.18 }, y: { duration: 1.35, ease: "easeInOut", repeat: capacityHasMore && !shouldReduceMotion ? Infinity : 0 } }}
          >
            <span className="grid size-7 place-items-center rounded-full bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
              <ChevronDown className="size-4" strokeWidth={1.5} />
            </span>
          </motion.div>
          </TabsContent>
        </Tabs>

        <DialogFooter className={cn(warehouseDialogFooterClass, "flex-row items-center justify-between gap-2 sm:justify-between")}>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
              {deleting ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              Delete
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={saving} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : null}
              {isEditing ? "Save changes" : "Create location"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WarehouseLocationsView() {
  const shouldReduceMotion = useReducedMotion()
  const [facilities, setFacilities] = useState<WarehouseFacility[] | null>(null)
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("")
  const [reference, setReference] = useState<WarehouseLocationReference | null>(null)
  const [locations, setLocations] = useState<WarehouseLocation[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>(locationFilters[0])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseLocation | null>(null)

  useEffect(() => {
    let active = true
    listWarehouseFacilities({})
      .then((list) => {
        if (!active) return
        setFacilities(list)
        setSelectedFacilityId((current) => current || list[0]?.id || "")
      })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setFacilities([])
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedFacilityId) return
    let active = true
    getWarehouseLocationReference(selectedFacilityId)
      .then((data) => { if (active) setReference(data) })
      .catch(() => { /* reference is optional for viewing */ })
    return () => { active = false }
  }, [selectedFacilityId])

  useEffect(() => {
    if (!selectedFacilityId) {
      setLocations([])
      return
    }
    let active = true
    setLocations(null)
    const timer = window.setTimeout(() => listWarehouseLocations(selectedFacilityId, { search: search.trim() || undefined, includeInactive: activeFilter === "All" })
      .then((list) => { if (active) { setLoadError(null); setLocations(list) } })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setLocations([])
      }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [selectedFacilityId, activeFilter, search])

  async function refresh() {
    if (!selectedFacilityId) return
    setLoadError(null)
    try {
      const list = await listWarehouseLocations(selectedFacilityId, { search: search.trim() || undefined, includeInactive: activeFilter === "All" })
      setLocations(list)
    } catch (error) {
      setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
      setLocations([])
    }
  }

  const visibleRows = locations ?? []

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(location: WarehouseLocation) {
    setEditing(location)
    setDialogOpen(true)
  }

  const columns = [
    {
      key: "code",
      label: "Code",
      className: "min-w-[150px]",
      render: (location: WarehouseLocation) => <CodeText>{location.code}</CodeText>,
    },
    {
      key: "zone",
      label: "Zone",
      className: "min-w-[150px]",
      render: (location: WarehouseLocation) =>
        location.zoneName ? <StatusPill tone="teal">{location.zoneName}</StatusPill> : <span className="text-[12px] text-[var(--md-subtle)]">No zone</span>,
    },
    {
      key: "type",
      label: "Type",
      render: (location: WarehouseLocation) => <span className="text-[13px] text-[var(--md-ink)]">{location.typeName ?? location.typeCode}</span>,
    },
    {
      key: "position",
      label: "Position",
      className: "min-w-[160px]",
      render: (location: WarehouseLocation) => <span className="text-[13px] text-[var(--md-text)]">{locationPosition(location)}</span>,
    },
    {
      key: "status",
      label: "Status",
      align: "right" as const,
      render: (location: WarehouseLocation) =>
        location.isActive ? <StatusPill tone="green">{location.statusName ?? "Active"}</StatusPill> : <StatusPill tone="neutral">Inactive</StatusPill>,
    },
  ]

  const facilityOptions = facilities ?? []
  const hasFacilities = facilityOptions.length > 0

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <ManagementToolbar title="Locations" meta="Create and manage the bins, racks, and positions inside a facility.">
        {hasFacilities ? (
          <>
            <FilterChips className="shrink-0 flex-nowrap" options={locationFilters} activeOption={activeFilter} onChange={setActiveFilter} />
            <Select value={selectedFacilityId} onValueChange={setSelectedFacilityId}>
              <SelectTrigger aria-label="Facility" className="h-10 min-w-[200px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80"><SelectValue /></SelectTrigger>
              <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                {facilityOptions.map((facility) => (
                  <SelectItem key={facility.id} value={facility.id} className="text-[13px]">{facility.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ManagementSearch value={search} onChange={setSearch} placeholder="Search code, zone, position..." />
            <Button onClick={openCreate} className="h-10 self-end rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              New location
            </Button>
          </>
        ) : null}
      </ManagementToolbar>

      {facilities === null ? (
        <StateBlock icon={<Loader2 className="size-5 animate-spin" strokeWidth={1.4} />} title="Loading locations" detail="Fetching your facilities." />
      ) : !hasFacilities ? (
        <StateBlock
          icon={<Warehouse className="size-5" strokeWidth={1.4} />}
          title="No facilities yet"
          detail="Create a facility first, then lay out the locations inside it."
        />
      ) : loadError ? (
        <StateBlock
          icon={<AlertCircle className="size-5" strokeWidth={1.4} />}
          title="Locations could not be loaded"
          detail={loadError}
          action={
            <Button onClick={() => void refresh()} variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              Retry
            </Button>
          }
        />
      ) : locations === null ? (
        <StateBlock icon={<Loader2 className="size-5 animate-spin" strokeWidth={1.4} />} title="Loading locations" detail="Fetching the locations in this facility." />
      ) : locations.length === 0 && !search.trim() ? (
        <StateBlock
          icon={<LayoutGrid className="size-5" strokeWidth={1.4} />}
          title="No locations yet"
          detail="Add the first bin, rack, or position for this facility."
          action={
            <Button onClick={openCreate} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              New location
            </Button>
          }
        />
      ) : (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          <WarehouseInventoryTable
            rows={visibleRows}
            columns={columns}
            minWidth={880}
            rowLabel="locations"
            emptyMessage="No locations match this search."
            onRowClick={openEdit}
            rowDetailLabel={(location) => `Edit location ${location.code}`}
          />
        </motion.div>
      )}

      <LocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        facilityId={selectedFacilityId}
        location={editing}
        reference={reference}
        onSaved={() => void refresh()}
        onDeleted={() => void refresh()}
      />
    </div>
  )
}
