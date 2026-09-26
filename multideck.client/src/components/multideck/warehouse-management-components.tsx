import { AddressSearch } from "@/components/multideck/address-search"
import { addressFieldLabel } from "@/lib/country-address-format"
import { SpreadsheetImportReview } from "./spreadsheet-import-review"
import { InlineNotice } from "./inline-notice"
import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { defaultPaginationPageSize } from "@/lib/pagination"
import { collectExportPages } from "@/lib/table-export"
import { workspaceStorageKey } from "@/lib/workspace-environment"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { AlertCircle, ArrowLeft, ChevronDown, Download, FileSpreadsheet, Loader2, MapPin, Package, Pencil, Plus, RefreshCw, Trash2, Upload, Warehouse } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { WizardDialog, WizardSaveNowButton, type WizardStep } from "@/components/multideck/wizard-dialog"
import { itemDetailPath } from "@/components/multideck/warehouse-item-detail"
import { RegisterFacetSelect, RegisterSearchField, RegisterViewSwitch, registerControlClass } from "@/components/multideck/register-toolbar"
import { StatusPill } from "@/components/multideck/status-pill"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { useLanguage } from "@/i18n/language-provider"
import {
  WarehouseApiError,
  createWarehouseFacility,
  createWarehouseItem,
  createWarehouseLocation,
  downloadWarehouseItemsTemplate,
  downloadWarehouseLocationsTemplate,
  importWarehouseLocations,
  importWarehouseItems,
  deleteWarehouseFacility,
  deleteWarehouseItem,
  deleteWarehouseLocation,
  getWarehouseFacilityReference,
  getWarehouseItemReference,
  getWarehouseLocationReference,
  listWarehouseFacilitiesPage,
  listWarehouseItemCustomersPage,
  listWarehouseItemsPage,
  listWarehouseLocationsPage,
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
  type WarehouseRegisterSort,
} from "@/lib/warehouse"

// ---------------------------------------------------------------------------
// Shared field primitives
// ---------------------------------------------------------------------------

const fieldControlClass =
  "!h-10 !w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 !px-3 !text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"


export const warehouseDialogHeaderClass =
  "bg-[var(--md-surface-soft)] px-6 py-5 pe-14 text-start shadow-[var(--md-stroke-bottom)] [&_[data-slot=dialog-title]]:text-[17px] [&_[data-slot=dialog-title]]:leading-6"

export const warehouseDialogFooterClass =
  "!mx-0 !mb-0 bg-[var(--md-surface-soft)] px-6 py-4 shadow-[var(--md-stroke-top)]"

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
    <div
      className={cn("grid min-w-0 self-start content-start gap-1.5", className)}
      data-field-invalid={Boolean(error) || undefined}
    >
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

function CodeText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-i18n-skip dir="ltr" className={cn("text-[12px] font-medium tracking-normal text-[var(--md-ink)] tabular-nums", className)}>
      {children}
    </span>
  )
}

/** The app shell owns vertical scrolling, so list/detail views restore that
 * ancestor rather than the window when returning to a long register. */
function verticalScrollRegion(element: HTMLElement | null) {
  let current = element?.parentElement ?? null
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY
    if (overflowY === "auto" || overflowY === "scroll") return current
    current = current.parentElement
  }
  return null
}

const warehouseItemsReturnKey = workspaceStorageKey("multideck:warehouse:items:return")

function readWarehouseItemsReturnState() {
  try {
    const value = window.sessionStorage.getItem(warehouseItemsReturnKey)
    if (!value) return null
    const parsed = JSON.parse(value) as { itemId?: unknown; scrollTop?: unknown }
    if (typeof parsed.itemId !== "string" || typeof parsed.scrollTop !== "number") return null
    return { itemId: parsed.itemId, scrollTop: parsed.scrollTop }
  } catch {
    return null
  }
}

function writeWarehouseItemsReturnState(state: { itemId: string; scrollTop: number } | null) {
  try {
    if (state) window.sessionStorage.setItem(warehouseItemsReturnKey, JSON.stringify(state))
    else window.sessionStorage.removeItem(warehouseItemsReturnKey)
  } catch {
    // The route still works when browser storage is unavailable; only the
    // convenience of returning to the same register position is skipped.
  }
}

function StateBlock({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  const { t } = useLanguage()

  return (
    <div className="grid place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 py-14 text-center shadow-[var(--md-shadow-line)]">
      <span className="mb-3 grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        {icon}
      </span>
      <p className="text-[14px] font-medium text-[var(--md-ink)]">{t(title)}</p>
      {detail ? <p className="mt-1 max-w-[380px] text-[13px] leading-5 text-[var(--md-text)]">{t(detail)}</p> : null}
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
  const { t } = useLanguage()
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

  const facilitySteps: WizardStep[] = [
    { id: "details", label: "Facility details", hint: "What this warehouse is called and how it is classified.", complete: Boolean(form.code.trim() && form.name.trim()) },
    { id: "address", label: "Address", hint: "Where the warehouse physically is. Every field here is optional.", complete: Boolean(form.address1.trim() || form.townCity.trim()) },
    { id: "settings", label: "Settings", hint: "How stock stored here is treated." },
  ]

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
        toast.error("Unable to save the facility", { description: "Check your connection and try again." })
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
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit facility" : "New facility"}
      description="A physical warehouse for customer stock."
      steps={facilitySteps}
      activeStepId={section}
      onStepChange={setSection}
      submitLabel={isEditing ? "Save changes" : "Create facility"}
      onSubmit={handleSubmit}
      saving={saving}
      bodyMinHeight={318}
      secondaryAction={(
        <>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
              {deleting ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              {t("Delete")}
            </Button>
          ) : null}
          {/* An operator who only came to fix the code should not have to walk to
              the last step to save it. */}
          {section !== "settings" ? <WizardSaveNowButton label={isEditing ? "Save changes" : "Create now"} onSubmit={handleSubmit} saving={saving} /> : null}
        </>
      )}
    >
      {section === "details" ? (
        <div className="grid content-start gap-4">
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
            <WarehouseFormField label="Office" hint="Defaults to your primary office." error={firstFieldError(errors, "OfficeId")}>
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

        </div>
      ) : null}

      {section === "address" ? (
        <div className="grid content-start gap-4">
          <WarehouseFormField label={addressFieldLabel(form.countryCode, "line1")} htmlFor="facility-address1" error={firstFieldError(errors, "Address1")}>
            <AddressSearch id="facility-address1" field="line1" label={addressFieldLabel(form.countryCode, "line1")} hideLabel value={form.address1} onChange={value => update("address1", value)} onSelect={address => setForm(current => ({ ...current, address1: address.line1, address2: address.line2, townCity: address.townCity, countyState: address.countyState, postZipCode: address.postZipCode, countryCode: address.countryCode }))} inputClassName={fieldControlClass} />
          </WarehouseFormField>
          <WarehouseFormField label="Address line 2" htmlFor="facility-address2" error={firstFieldError(errors, "Address2")}>
            <Input id="facility-address2" value={form.address2} onChange={(event) => update("address2", event.target.value)} className={fieldControlClass} />
          </WarehouseFormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label={addressFieldLabel(form.countryCode, "townCity")} htmlFor="facility-town" error={firstFieldError(errors, "TownCity")}>
              <Input id="facility-town" value={form.townCity} onChange={(event) => update("townCity", event.target.value)} className={fieldControlClass} />
            </WarehouseFormField>
            <WarehouseFormField label={addressFieldLabel(form.countryCode, "countyState")} htmlFor="facility-county" error={firstFieldError(errors, "CountyState")}>
              <Input id="facility-county" value={form.countyState} onChange={(event) => update("countyState", event.target.value)} className={fieldControlClass} />
            </WarehouseFormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <WarehouseFormField label={addressFieldLabel(form.countryCode, "postZipCode")} htmlFor="facility-zip" error={firstFieldError(errors, "PostZipCode")}>
              <AddressSearch id="facility-zip" field="postZipCode" label={addressFieldLabel(form.countryCode, "postZipCode")} hideLabel value={form.postZipCode} onChange={value => update("postZipCode", value)} onSelect={address => setForm(current => ({ ...current, address1: address.line1, address2: address.line2, townCity: address.townCity, countyState: address.countyState, postZipCode: address.postZipCode, countryCode: address.countryCode }))} inputClassName={fieldControlClass} />
            </WarehouseFormField>
            <WarehouseFormField label="Country code" htmlFor="facility-country" hint="2-letter ISO." error={firstFieldError(errors, "CountryCode")}>
              <Input id="facility-country" dir="ltr" value={form.countryCode} onChange={(event) => update("countryCode", event.target.value)} className={fieldControlClass} placeholder="GB" maxLength={2} />
            </WarehouseFormField>
            <WarehouseFormField label="Time zone" htmlFor="facility-tz" error={firstFieldError(errors, "TimeZone")}>
              <Input id="facility-tz" dir="ltr" value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)} className={fieldControlClass} placeholder="UTC" />
            </WarehouseFormField>
          </div>

        </div>
      ) : null}

      {section === "settings" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <WarehouseSwitchField label="Bonded facility" hint="Customs-controlled, duty-suspended storage." checked={form.isBonded} onCheckedChange={(checked) => update("isBonded", checked)} />
            {isEditing ? (
              <WarehouseSwitchField label="Active" hint="Inactive facilities stay on record but are hidden by default." checked={form.isActive} onCheckedChange={(checked) => update("isActive", checked)} />
            ) : null}
          </div>
        </div>
      ) : null}
    </WizardDialog>
  )
}

export function WarehouseFacilitiesView() {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [reference, setReference] = useState<WarehouseFacilityReference | null>(null)
  const [facilities, setFacilities] = useState<WarehouseFacility[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [warehouseRegisterPageSize, setWarehouseRegisterPageSize] = useState(defaultPaginationPageSize)
  const [sort, setSort] = useState<WarehouseRegisterSort | null>({ id: "facility", direction: "asc" })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>(facilityFilters[0])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseFacility | null>(null)

  async function refresh() {
    setLoadError(null)
    setLoading(true)
    try {
      const [referenceData, page] = await Promise.all([
        reference ? Promise.resolve(reference) : getWarehouseFacilityReference(),
        listWarehouseFacilitiesPage({ search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, limit: warehouseRegisterPageSize, offset }),
      ])
      setReference(referenceData)
      setFacilities(page.rows)
      setTotal(page.total)
    } catch (error) {
      const message = error instanceof WarehouseApiError ? error.message : String(error)
      setLoadError(message)
      setFacilities([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = window.setTimeout(() => listWarehouseFacilitiesPage({ search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, limit: warehouseRegisterPageSize, offset })
      .then((page) => { if (active) { setLoadError(null); setFacilities(page.rows); setTotal(page.total) } })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setFacilities([])
        setTotal(0)
      }).finally(() => { if (active) setLoading(false) }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activeFilter, offset, warehouseRegisterPageSize, search, sort])

  useEffect(() => setOffset(0), [activeFilter, search, sort])

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

  useEffect(() => {
    return subscribeTopBarAction(topBarActionEvents.createWarehouseFacility, openCreate)
  }, [])

  function openEdit(facility: WarehouseFacility) {
    setEditing(facility)
    setDialogOpen(true)
  }

  const columns = useMemo<DataTableColumn<WarehouseFacility>[]>(() => [
    {
      id: "code",
      label: "Code",
      width: 140,
      minWidth: 116,
      resizable: true,
      canHide: false,
      sortValue: (facility) => facility.code,
      cell: (facility) => <CodeText>{facility.code}</CodeText>,
    },
    {
      id: "facility",
      label: "Facility",
      width: 280,
      minWidth: 200,
      resizable: true,
      sortValue: (facility) => facility.name,
      cell: (facility) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{facility.name}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{facility.typeName ?? facility.typeCode}</p>
        </div>
      ),
    },
    {
      id: "location",
      label: "Location",
      width: 232,
      minWidth: 164,
      resizable: true,
      sortValue: (facility) => [facility.townCity, facility.countryCode].filter(Boolean).join(", "),
      cell: (facility) => {
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
      id: "bonded",
      label: "Bonded",
      kind: "attribute",
      width: 128,
      resizable: true,
      sortValue: (facility) => Number(facility.isBonded),
      cell: (facility) =>
        facility.isBonded ? <StatusPill tone="teal">Bonded</StatusPill> : <span className="text-[12px] text-[var(--md-subtle)]">Standard</span>,
    },
    {
      id: "status",
      label: "Status",
      kind: "status",
      width: 132,
      resizable: true,
      headerClassName: "text-end",
      cellClassName: "text-end",
      sortValue: (facility) => Number(facility.isActive),
      cell: (facility) =>
        facility.isActive ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="neutral">Inactive</StatusPill>,
    },
  ], [])

  const emptyState = activeFilter === "All" || search.trim() ? (
    <div className="mx-auto max-w-[360px]">
      <EmptyStateIllustration variant="search" className="mb-3" />
      <p className="text-[13px] font-medium text-[var(--md-ink)]">No facilities match this view</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Clear a filter or widen the search to see more facilities.</p>
    </div>
  ) : (
    <div className="mx-auto max-w-[360px]">
      <EmptyStateIllustration variant="cargo" className="mb-3" />
      <p className="text-[13px] font-medium text-[var(--md-ink)]">No facilities yet</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Create your first warehouse location to start storing customer stock.</p>
    </div>
  )

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      {loadError ? (
        <StateBlock
          icon={<AlertCircle className="size-5" strokeWidth={1.4} />}
          title="Facilities are unavailable"
          detail={loadError}
          action={
            <Button onClick={() => void refresh()} variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              {t("Try again")}
            </Button>
          }
        />
      ) : facilities === null ? (
        <StateBlock icon={<DotGridLoader decorative />} title="Loading facilities" detail="" />
      ) : (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          <DataTable
            ariaLabel="Warehouse facilities"
            exportConfig={{ fileName: "warehouse-facilities", register: {
              dateLabel: "Facility created date", dateValue: (row) => row.createdAt,
              loadAllRows: (signal) => collectExportPages((page) => listWarehouseFacilitiesPage({ search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, ...page }), (row) => row.id, signal),
            } }}
            columnsButtonLabel="Manage facility columns"
            storageKey="warehouse-facilities"
            rows={visibleRows}
            columns={columns}
            getRowKey={(facility) => facility.id}
            onRowClick={openEdit}
            rowClassName="hover:bg-[var(--md-hover)]"
            emptyState={emptyState}
            toolbarTabs={(
              <div className="flex min-w-0 items-center gap-2">
                <RegisterViewSwitch options={facilityFilters} value={activeFilter} onChange={setActiveFilter} counts={{ [activeFilter]: total }} ariaLabel="Facility status" compact />
              </div>
            )}
            toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => setSearch("")} label="Search facilities" placeholder="Code, name, city" className="sm:min-w-[220px] sm:w-[220px]" />}
            serverSorting={{ value: sort, onChange: setSort }}
            pagination={{ offset, limit: warehouseRegisterPageSize, total, loading, onOffsetChange: setOffset, onLimitChange: setWarehouseRegisterPageSize, error: Boolean(loadError) }}
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
  facilityIds: string[]
  defaultFacilityId: string
  sku: string
  description: string
  commodityDescription: string
  hsCode: string
  countryOfOriginCode: string
  baseUomCode: string
  quantityBasisCode: "count" | "weight" | "volume"
  quantityScale: string
  minimumMovementQuantity: string
  allowsFractionalQuantity: boolean
  uoms: { key: string; code: string; quantityInBaseUom: string; grossWeightKg: string }[]
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
    facilityIds: reference?.facilities[0]?.id ? [reference.facilities[0].id] : [],
    defaultFacilityId: reference?.facilities[0]?.id ?? "",
    sku: "",
    description: "",
    commodityDescription: "",
    hsCode: "",
    countryOfOriginCode: "",
    baseUomCode: "EA",
    quantityBasisCode: "count",
    quantityScale: "0",
    minimumMovementQuantity: "1",
    allowsFractionalQuantity: false,
    uoms: [],
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
  const facilityIds = item.facilities?.filter((facility) => facility.isActive).map((facility) => facility.id)
    ?? (item.facilityId ? [item.facilityId] : [])
  return {
    customerOrgId: item.customerOrgId,
    facilityIds,
    defaultFacilityId: item.facilities?.find((facility) => facility.isDefault)?.id ?? item.facilityId ?? facilityIds[0] ?? "",
    sku: item.sku,
    description: item.description,
    commodityDescription: item.commodityDescription ?? "",
    hsCode: item.hsCode ?? "",
    countryOfOriginCode: item.countryOfOriginCode ?? "",
    baseUomCode: item.baseUomCode,
    quantityBasisCode: item.quantityBasisCode,
    quantityScale: String(item.quantityScale),
    minimumMovementQuantity: numberToInput(item.minimumMovementQuantity),
    allowsFractionalQuantity: item.allowsFractionalQuantity,
    uoms: item.uoms.map((uom) => ({ key: uom.id ?? crypto.randomUUID(), code: uom.code, quantityInBaseUom: numberToInput(uom.quantityInBaseUom), grossWeightKg: numberToInput(uom.grossWeightKg) })),
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
    quantityBasisCode: form.quantityBasisCode,
    quantityScale: Number(form.quantityScale),
    minimumMovementQuantity: parseDecimal(form.minimumMovementQuantity) ?? 1,
    allowsFractionalQuantity: form.quantityBasisCode === "count" && form.allowsFractionalQuantity,
    uoms: form.uoms.filter((uom) => uom.code.trim()).map((uom) => ({ code: uom.code.trim().toUpperCase(), quantityInBaseUom: parseDecimal(uom.quantityInBaseUom) ?? 1, grossWeightKg: parseDecimal(uom.grossWeightKg), purchasing: false, stocking: true, selling: false })),
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
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerRows, setCustomerRows] = useState<{ id: string; name: string }[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const { t } = useLanguage()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setSection("identity")
    setCustomerSearch("")
    setCustomerRows([])
    setSelectedCustomer(item ? { id: item.customerOrgId, name: item.customerOrgName ?? item.customerOrgId } : null)
    setForm(item ? itemToForm(item) : emptyItemForm(reference))
  }, [open, item, reference])

  useEffect(() => {
    if (!open || isEditing) return
    let active = true
    setCustomerLoading(true)
    const timeoutId = window.setTimeout(() => {
      listWarehouseItemCustomersPage({ search: customerSearch, limit: 25, offset: 0 })
        .then((page) => {
          if (!active) return
          setCustomerRows(page.rows)
          setCustomerError(null)
          setSelectedCustomer((current) => current ?? page.rows[0] ?? null)
          setForm((current) => {
            if (current.customerOrgId || !page.rows[0]) return current
            return { ...current, customerOrgId: page.rows[0].id }
          })
        })
        .catch((error) => { if (active) { setCustomerRows([]); setCustomerError(error instanceof Error ? error.message : String(error)) } })
        .finally(() => { if (active) setCustomerLoading(false) })
    }, 220)
    return () => { active = false; window.clearTimeout(timeoutId) }
  }, [customerSearch, isEditing, open])

  function update<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.facilityIds.length || !form.defaultFacilityId) {
      setErrors({ FacilityIds: ["Choose at least one warehouse."], DefaultFacilityId: ["Choose the default warehouse."] })
      return
    }
    setSaving(true)
    setErrors({})
    try {
      const attributes = itemFormAttributes(form)
      if (isEditing && item) {
        const input: UpdateWarehouseItemInput = { ...attributes, facilityId: form.defaultFacilityId, facilityIds: form.facilityIds, defaultFacilityId: form.defaultFacilityId, isActive: form.isActive }
        await updateWarehouseItem(item.id, input)
        toast.success("Item updated", { description: attributes.sku })
      } else {
        const input: CreateWarehouseItemInput = { ...attributes, customerOrgId: form.customerOrgId, facilityId: form.defaultFacilityId, facilityIds: form.facilityIds, defaultFacilityId: form.defaultFacilityId }
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
        toast.error("Unable to save the item", { description: "Check your connection and try again." })
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

  const itemSteps: WizardStep[] = [
    { id: "identity", label: "The item", hint: "Who it belongs to, where it can be stocked, and how customs sees it.", complete: Boolean(form.sku.trim() && form.description.trim() && form.customerOrgId && form.facilityIds.length && form.defaultFacilityId) },
    { id: "quantity", label: "Units", hint: "The unit it is counted in, and any larger units it arrives or ships in.", complete: Boolean(form.baseUomCode.trim()) },
    { id: "dimensions", label: "Size and weight", hint: "Used for capacity and load planning. All optional." },
    { id: "handling", label: "Handling", hint: "Anything the warehouse has to do differently for this SKU." },
  ]

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit item" : "New item"}
      description="A customer-owned SKU available in one or more warehouses."
      steps={itemSteps}
      activeStepId={section}
      onStepChange={setSection}
      submitLabel={isEditing ? "Save changes" : "Create item"}
      onSubmit={handleSubmit}
      saving={saving}
      bodyMinHeight={392}
      className="sm:max-w-[760px]"
      secondaryAction={(
        <>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
              {deleting ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              {t("Delete")}
            </Button>
          ) : null}
          {section !== "handling" ? <WizardSaveNowButton label={isEditing ? "Save changes" : "Create now"} onSubmit={handleSubmit} saving={saving} /> : null}
        </>
      )}
    >
      {section === "identity" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Customer" required error={firstFieldError(errors, "CustomerOrgId")}>
              {isEditing ? (
                <Input value={customerName} readOnly className={cn(fieldControlClass, "cursor-not-allowed opacity-80")} />
              ) : (
                <div className="grid gap-1.5">
                  <Input aria-label={t("Search customers by code or name")} value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className={fieldControlClass} placeholder={t("Search customers by code or name")} />
                  <Select value={form.customerOrgId} onValueChange={(value) => { update("customerOrgId", value); setSelectedCustomer(customerRows.find((customer) => customer.id === value) ?? selectedCustomer) }}>
                    <SelectTrigger className={fieldControlClass}><SelectValue placeholder={customerLoading ? t("Loading customers") : "Choose a customer"} /></SelectTrigger>
                    <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                      {[...(selectedCustomer && !customerRows.some((customer) => customer.id === selectedCustomer.id) ? [selectedCustomer] : []), ...customerRows].map((customer) => (
                        <SelectItem key={customer.id} value={customer.id} className="text-[13px]">{customer.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customerError ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{customerError}</p> : null}
                </div>
              )}
            </WarehouseFormField>
            <WarehouseFormField label="Default warehouse" required hint="Used first when creating warehouse work." error={firstFieldError(errors, "DefaultFacilityId") ?? firstFieldError(errors, "FacilityId")}>
              <Select value={form.defaultFacilityId} onValueChange={(value) => { update("defaultFacilityId", value); if (!form.facilityIds.includes(value)) update("facilityIds", [...form.facilityIds, value]) }}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="Choose a warehouse" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {reference?.facilities.filter((facility) => form.facilityIds.includes(facility.id)).map((facility) => (
                    <SelectItem key={facility.id} value={facility.id} className="text-[13px]">{facility.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WarehouseFormField>
          </div>

          <WarehouseFormField label="Warehouses" required hint="One SKU record shared across the selected warehouses." error={firstFieldError(errors, "FacilityIds")}>
            <div className="grid gap-2 rounded-[var(--md-radius-xl)] bg-white/36 p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-2">
              {reference?.facilities.map((facility) => {
                const checked = form.facilityIds.includes(facility.id)
                return <label key={facility.id} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2 text-[12.5px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                  <input type="checkbox" checked={checked} onChange={(event) => {
                    const facilityIds = event.target.checked ? [...form.facilityIds, facility.id] : form.facilityIds.filter((id) => id !== facility.id)
                    update("facilityIds", facilityIds)
                    if (!facilityIds.includes(form.defaultFacilityId)) update("defaultFacilityId", facilityIds[0] ?? "")
                  }} />
                  <span className="min-w-0 truncate">{facility.name}</span>
                  {form.defaultFacilityId === facility.id ? <span className="ms-auto text-[11px] text-[var(--md-subtle)]">Default</span> : null}
                </label>
              })}
            </div>
          </WarehouseFormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="SKU" htmlFor="item-sku" required error={firstFieldError(errors, "Sku")}>
              <Input id="item-sku" dir="ltr" value={form.sku} onChange={(event) => update("sku", event.target.value)} className={fieldControlClass} placeholder="MAR-ACT-044" />
            </WarehouseFormField>
            <WarehouseFormField label="Base unit of measure" htmlFor="item-uom" hint="e.g. EA, KG, L, or CBM." error={firstFieldError(errors, "BaseUomCode")}>
              <Input id="item-uom" dir="ltr" value={form.baseUomCode} onChange={(event) => update("baseUomCode", event.target.value)} className={fieldControlClass} placeholder="EA" />
            </WarehouseFormField>
          </div>

          <WarehouseFormField label="Description" htmlFor="item-description" required error={firstFieldError(errors, "Description")}>
            <Input id="item-description" value={form.description} onChange={(event) => update("description", event.target.value)} className={fieldControlClass} placeholder="Thermal activewear carton" />
          </WarehouseFormField>

          <WarehouseFormField label="Commodity description" htmlFor="item-commodity" hint="Optional customs-facing description.">
            <Textarea id="item-commodity" value={form.commodityDescription} onChange={(event) => update("commodityDescription", event.target.value)} className="min-h-[64px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 py-2 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" />
          </WarehouseFormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="HS code" htmlFor="item-hs" error={firstFieldError(errors, "HsCode")}>
              <Input id="item-hs" dir="ltr" value={form.hsCode} onChange={(event) => update("hsCode", event.target.value)} className={fieldControlClass} placeholder="6109.90.20" />
            </WarehouseFormField>
            <WarehouseFormField label="Country of origin" htmlFor="item-origin" hint="2-letter ISO." error={firstFieldError(errors, "CountryOfOriginCode")}>
              <Input id="item-origin" dir="ltr" value={form.countryOfOriginCode} onChange={(event) => update("countryOfOriginCode", event.target.value)} className={fieldControlClass} placeholder="CN" maxLength={2} />
            </WarehouseFormField>
          </div>

        </div>
      ) : null}

      {section === "dimensions" ? (
        <div className="grid content-start gap-4">
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

        </div>
      ) : null}

      {section === "quantity" ? (
        <div className="grid content-start gap-4">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <WarehouseFormField label={t("Tracking basis")} required>
                  <Select value={form.quantityBasisCode} onValueChange={(value: "count" | "weight" | "volume") => {
                    update("quantityBasisCode", value)
                    if (value !== "count") {
                      update("allowsFractionalQuantity", true)
                      update("quantityScale", "3")
                      update("minimumMovementQuantity", "0.001")
                    }
                  }}>
                    <SelectTrigger className={fieldControlClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">{t("Count")}</SelectItem>
                      <SelectItem value="weight">{t("Weight")}</SelectItem>
                      <SelectItem value="volume">{t("Volume")}</SelectItem>
                    </SelectContent>
                  </Select>
                </WarehouseFormField>
                <WarehouseFormField label={t("Decimal places")} hint={t("Between 0 and 6.")}>
                  <Input dir="ltr" type="number" min="0" max="6" step="1" value={form.quantityScale} onChange={(event) => update("quantityScale", event.target.value)} className={fieldControlClass} />
                </WarehouseFormField>
                <WarehouseFormField label={t("Minimum movement")}>
                  <Input dir="ltr" type="number" min="0.000001" step="0.001" value={form.minimumMovementQuantity} onChange={(event) => update("minimumMovementQuantity", event.target.value)} className={fieldControlClass} />
                </WarehouseFormField>
              </div>
              {form.quantityBasisCode === "count" ? <WarehouseSwitchField label={t("Allow partial units")} hint={t("Use only when this counted product can be split into fractions.")} checked={form.allowsFractionalQuantity} onCheckedChange={(checked) => update("allowsFractionalQuantity", checked)} /> : null}
              <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/40 p-4 shadow-[var(--md-shadow-line)]">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Packaging conversions")}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Define fixed packs such as one box equalling twelve base units. Pallets contain stock; they are not quantities.")}</p></div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => update("uoms", [...form.uoms, { key: crypto.randomUUID(), code: "", quantityInBaseUom: "1", grossWeightKg: "" }])} className="rounded-[var(--md-radius-md)] bg-white/55 shadow-[var(--md-shadow-line)]"><Plus className="size-4" />{t("Add unit")}</Button>
                </div>
                {form.uoms.map((uom) => <div key={uom.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                  <Input aria-label={t("Unit code")} dir="ltr" placeholder="BOX" value={uom.code} onChange={(event) => update("uoms", form.uoms.map((entry) => entry.key === uom.key ? { ...entry, code: event.target.value } : entry))} className={fieldControlClass} />
                  <Input aria-label={t("Quantity in base unit")} dir="ltr" type="number" min="0.000001" placeholder="12" value={uom.quantityInBaseUom} onChange={(event) => update("uoms", form.uoms.map((entry) => entry.key === uom.key ? { ...entry, quantityInBaseUom: event.target.value } : entry))} className={fieldControlClass} />
                  <Input aria-label={t("Gross weight in kilograms")} dir="ltr" type="number" min="0" placeholder={t("Gross kg")} value={uom.grossWeightKg} onChange={(event) => update("uoms", form.uoms.map((entry) => entry.key === uom.key ? { ...entry, grossWeightKg: event.target.value } : entry))} className={fieldControlClass} />
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove packaging unit")} onClick={() => update("uoms", form.uoms.filter((entry) => entry.key !== uom.key))} className="size-10 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button>
                </div>)}
                {!form.uoms.length ? <p className="py-4 text-center text-[12px] text-[var(--md-subtle)]">{t("No fixed packaging conversions added.")}</p> : null}
              </div>
            </div>
        </div>
      ) : null}

      {section === "handling" ? (
        <div className="grid content-start gap-4">
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
        </div>
      ) : null}
    </WizardDialog>
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
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerRows, setCustomerRows] = useState<{ id: string; name: string }[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [facilityId, setFacilityId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [importing, setImporting] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [result, setResult] = useState<ImportItemsResult | null>(null)
  const { t } = useLanguage()

  useEffect(() => {
    if (!open) return
    setCustomerOrgId("")
    setCustomerSearch("")
    setCustomerRows([])
    setSelectedCustomer(null)
    setFacilityId(reference?.facilities[0]?.id ?? "")
    setFile(null)
    setResult(null)
    setError(null)
    setReviewed(false)
    setCompleted(false)
  }, [open, reference])

  useEffect(() => {
    if (!open) return
    let active = true
    setCustomerLoading(true)
    const timeoutId = window.setTimeout(() => {
      listWarehouseItemCustomersPage({ search: customerSearch, limit: 25, offset: 0 })
        .then((page) => {
          if (!active) return
          setCustomerRows(page.rows)
          setCustomerError(null)
        })
        .catch((error) => { if (active) { setCustomerRows([]); setCustomerError(error instanceof Error ? error.message : String(error)) } })
        .finally(() => { if (active) setCustomerLoading(false) })
    }, 220)
    return () => { active = false; window.clearTimeout(timeoutId) }
  }, [customerSearch, open])

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

  function resetReview() {
    setResult(null)
    setReviewed(false)
    setCompleted(false)
    setError(null)
  }

  async function handleImport() {
    if (!file || !customerOrgId || !facilityId || busyRef.current) return
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError(t("Choose an .xlsx file no larger than 10 MB."))
      return
    }
    busyRef.current = true
    setImporting(true)
    setError(null)
    try {
      const preview = !reviewed
      const response = await importWarehouseItems({ customerOrgId, facilityId, file, preview })
      setResult(response)
      setReviewed(preview && response.failed === 0 && response.results.length > 0)
      setCompleted(response.preview === false)
      if (!response.results.length) setError(t("No rows were found. Fill in the template and upload it again."))
      if (!preview && response.created > 0) onImported()
    } catch (error) {
      setReviewed(false)
      setError(error instanceof Error ? error.message : String(error))
      // A connection loss can happen after the server saved. Review again so
      // duplicate checks reconcile the file before another creation attempt.
      setResult(null)
      if (reviewed) onImported()
    } finally {
      busyRef.current = false
      setImporting(false)
    }
  }

  const canImport = Boolean(file && customerOrgId && facilityId && !importing && !completed && !result?.failed)

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busyRef.current) onOpenChange(value) }}>
      <DialogContent showCloseButton={!importing} className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[680px]">
        <DialogHeader className={warehouseDialogHeaderClass}>
          <DialogTitle className="text-[16px] font-medium">Import items</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--md-text)]">
            Choose a customer and facility once. Fill in SKU and Description for each item, then review before creating.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto px-6 py-4">
          <fieldset disabled={importing} className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Customer" required>
              <div className="grid gap-1.5">
                <Input aria-label={t("Search customers by code or name")} value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className={fieldControlClass} placeholder={t("Search customers by code or name")} />
                <Select value={customerOrgId} onValueChange={(value) => { resetReview(); setCustomerOrgId(value); setSelectedCustomer(customerRows.find((customer) => customer.id === value) ?? selectedCustomer) }}>
                  <SelectTrigger className={fieldControlClass}><SelectValue placeholder={customerLoading ? t("Loading customers") : "Choose a customer"} /></SelectTrigger>
                  <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                    {[...(selectedCustomer && !customerRows.some((customer) => customer.id === selectedCustomer.id) ? [selectedCustomer] : []), ...customerRows].map((customer) => (
                      <SelectItem key={customer.id} value={customer.id} className="text-[13px]">{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customerError ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{customerError}</p> : null}
              </div>
            </WarehouseFormField>
            <WarehouseFormField label="Facility" required>
              <Select value={facilityId} onValueChange={(value) => { resetReview(); setFacilityId(value) }}>
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
              <span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-subtle)]">Only SKU and Description are required. Optional columns cover units, dimensions, customs and handling. Instructions and examples are on separate sheets.</span>
            </span>
            <Button type="button" variant="ghost" onClick={handleDownloadTemplate} disabled={downloading} className="h-9 shrink-0 rounded-[var(--md-radius-md)] bg-white/60 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80">
              {downloading ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Download data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              Template
            </Button>
          </div>

          <div className="grid gap-2">
            <span className="text-[12.5px] font-medium text-[var(--md-ink)]">Step 2 - Upload the filled-in file</span>
            <label className="flex cursor-pointer items-center gap-3 focus-within:ring-2 focus-within:ring-[var(--md-accent)] rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-3 shadow-[var(--md-shadow-line)] transition-colors hover:bg-white/68">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
                <FileSpreadsheet className="size-4" strokeWidth={1.4} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{file ? file.name : "Choose .xlsx file"}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">Excel .xlsx · up to 2,000 rows / 10 MB. Blank Base UOM defaults to EA.</span>
              </span>
              <input
                type="file"
                accept=".xlsx"
                aria-label={t("Upload items spreadsheet")} className="sr-only"
                onChange={(event) => {
                  resetReview()
                  setFile(event.target.files?.[0] ?? null)
                }}
              />
            </label>
          </div>

          </fieldset>
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
          {importing ? <div role="status" className="flex items-center gap-2 text-[13px]"><DotGridLoader decorative />{t(reviewed ? "Creating items. Keep this window open…" : "Checking your spreadsheet…")}</div> : null}
          {result ? <SpreadsheetImportReview rows={result.results} completed={completed} /> : null}

        </div>

        <DialogFooter className={cn(warehouseDialogFooterClass, "flex-row items-center justify-end gap-2")}>
          <Button type="button" variant="ghost" disabled={importing} onClick={() => onOpenChange(false)} className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
            {result ? "Close" : "Cancel"}
          </Button>
          <Button type="button" onClick={handleImport} disabled={!canImport} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-50">
            {importing ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Upload data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
            {t(reviewed ? `Create ${result?.results.length ?? 0} items` : "Review file")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WarehouseItemsView({ canManage = true, navigate }: { canManage?: boolean; navigate?: (path: string) => void }) {
  const shouldReduceMotion = useReducedMotion()
  const { language, t } = useLanguage()
  const viewRef = useRef<HTMLDivElement>(null)
  const numberFormat = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3 }), [language])
  const [reference, setReference] = useState<WarehouseItemReference | null>(null)
  const [items, setItems] = useState<WarehouseItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [warehouseRegisterPageSize, setWarehouseRegisterPageSize] = useState(defaultPaginationPageSize)
  const [sort, setSort] = useState<WarehouseRegisterSort | null>({ id: "sku", direction: "asc" })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [facilityId, setFacilityId] = useState("")
  const [activeFilter, setActiveFilter] = useState<(typeof itemFilters)[number]>(itemFilters[0])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseItem | null>(null)
  async function refresh() {
    setLoadError(null)
    setLoading(true)
    try {
      const page = await listWarehouseItemsPage({ facilityId: facilityId || undefined, search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, limit: warehouseRegisterPageSize, offset })
      setItems(page.rows)
      setTotal(page.total)
    } catch (error) {
      setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = window.setTimeout(() => listWarehouseItemsPage({ facilityId: facilityId || undefined, search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, limit: warehouseRegisterPageSize, offset })
      .then((page) => { if (active) { setLoadError(null); setItems(page.rows); setTotal(page.total) } })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setItems([])
        setTotal(0)
      }).finally(() => { if (active) setLoading(false) }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activeFilter, facilityId, offset, warehouseRegisterPageSize, search, sort])

  useEffect(() => setOffset(0), [activeFilter, facilityId, search, sort])

  useEffect(() => {
    let active = true
    getWarehouseItemReference()
      .then((data) => { if (active) setReference(data) })
      .catch(() => { /* reference is optional for viewing */ })
    return () => { active = false }
  }, [])

  const visibleRows = items ?? []

  useLayoutEffect(() => {
    if (!items || loadError) return

    const returnState = readWarehouseItemsReturnState()
    if (!returnState) return
    if (!items.some((item) => item.id === returnState.itemId)) {
      writeWarehouseItemsReturnState(null)
      return
    }
    const scrollRegion = verticalScrollRegion(viewRef.current)
    if (!scrollRegion) return

    scrollRegion.scrollTop = returnState.scrollTop
    const frame = window.requestAnimationFrame(() => {
      scrollRegion.scrollTop = returnState.scrollTop
      const selector = `[data-warehouse-item-id="${CSS.escape(returnState.itemId)}"]`
      const row = viewRef.current?.querySelector(selector)?.closest("tr") as HTMLElement | null
      row?.focus({ preventScroll: true })
      writeWarehouseItemsReturnState(null)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [items, loadError])

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  const canCreate = Boolean(reference?.facilities.length)

  useEffect(() => {
    const openFromTopBar = () => {
      if (canManage && canCreate) openCreate()
    }
    return subscribeTopBarAction(topBarActionEvents.createWarehouseItem, openFromTopBar)
  }, [canCreate, canManage])

  function openEdit(item: WarehouseItem) {
    setEditing(item)
    setDialogOpen(true)
  }

  useEffect(() => subscribeTopBarAction(topBarActionEvents.importWarehouseItems, () => {
    if (canManage && canCreate) setImportOpen(true)
  }), [canManage, canCreate])

  function openItem(item: WarehouseItem) {
    writeWarehouseItemsReturnState({
      itemId: item.id,
      scrollTop: verticalScrollRegion(viewRef.current)?.scrollTop ?? 0,
    })
    navigate?.(`${itemDetailPath(item)}?from=${encodeURIComponent("/warehouse/items")}`)
  }

  const columns = useMemo<DataTableColumn<WarehouseItem>[]>(() => [
    {
      id: "sku",
      label: "SKU",
      width: 160,
      minWidth: 132,
      resizable: true,
      canHide: false,
      sortValue: (item) => item.sku,
      cell: (item) => (
        <span data-warehouse-item-id={item.id}><CodeText>{item.sku}</CodeText></span>
      ),
    },
    {
      id: "item",
      label: "Item",
      width: 300,
      minWidth: 220,
      resizable: true,
      sortValue: (item) => item.description,
      cell: (item) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--md-ink)]" dir="auto">{item.description}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{item.customerOrgName ?? "–"}</p>
        </div>
      ),
    },
    {
      id: "facility",
      label: "Warehouses",
      width: 190,
      minWidth: 150,
      resizable: true,
      sortValue: (item) => item.facilityName,
      cell: (item) => {
        const active = item.facilities?.filter((facility) => facility.isActive) ?? []
        const primary = active.find((facility) => facility.isDefault)?.name ?? item.facilityName
        const additional = Math.max(0, active.length - 1)
        return <div className="min-w-0"><span className="truncate text-[13px] text-[var(--md-ink)]">{primary ?? "–"}</span>{additional ? <p className="text-[11px] text-[var(--md-subtle)]">+{additional} {t(additional === 1 ? "warehouse" : "warehouses")}</p> : null}</div>
      },
    },
    {
      id: "hs",
      label: "HS code",
      width: 136,
      minWidth: 112,
      resizable: true,
      sortValue: (item) => item.hsCode,
      cell: (item) => item.hsCode ? <CodeText className="text-[var(--md-text)]">{item.hsCode}</CodeText> : <span className="text-[12px] text-[var(--md-subtle)]">–</span>,
    },
    {
      id: "uom",
      label: "UOM",
      width: 96,
      resizable: true,
      headerClassName: "text-center",
      cellClassName: "text-center",
      sortValue: (item) => item.baseUomCode,
      cell: (item) => <CodeText className="text-[var(--md-text)]">{item.baseUomCode}</CodeText>,
    },
    {
      id: "gross",
      label: "Gross kg",
      width: 120,
      resizable: true,
      headerClassName: "text-end",
      cellClassName: "text-end",
      sortValue: (item) => item.grossWeightKg,
      cell: (item) => (
        <span className="tabular-nums text-[var(--md-ink)]">{item.grossWeightKg === null ? "–" : numberFormat.format(item.grossWeightKg)}</span>
      ),
    },
    {
      id: "status",
      label: "Status",
      kind: "status",
      width: 128,
      resizable: true,
      headerClassName: "text-end",
      cellClassName: "text-end",
      sortValue: (item) => Number(item.isActive),
      cell: (item) => (
        <StatusPill tone={item.isActive ? "green" : "neutral"}>{t(item.isActive ? "Active" : "Inactive")}</StatusPill>
      ),
    },
  ], [numberFormat, t])

  const emptyState = activeFilter === "All" || search.trim() || facilityId ? (
    <div className="mx-auto max-w-[360px]">
      <EmptyStateIllustration variant="search" className="mb-3" />
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No items match this view")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Clear a filter or widen the search to see more items.")}</p>
    </div>
  ) : (
    <div className="mx-auto max-w-[360px]">
      <EmptyStateIllustration variant="cargo" className="mb-3" />
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No items yet")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(canCreate ? "Add your first item to store customer stock in a facility." : "Create a facility first, then add the items stored inside it.")}</p>
    </div>
  )

  const toolbarTabs = (
    <div className="flex min-w-0 items-center gap-2">
      <RegisterViewSwitch options={itemFilters} value={activeFilter} onChange={setActiveFilter} counts={{ [activeFilter]: total }} ariaLabel="Item status" compact />
    </div>
  )

  const toolbarFilters = (
    <>
      <RegisterFacetSelect
        label="Facility"
        allLabel="All facilities"
        value={facilityId}
        options={(reference?.facilities ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
        onChange={setFacilityId}
        className="w-[142px] sm:w-[168px]"
      />
    </>
  )

  return (
    <div ref={viewRef} className="grid min-w-0 gap-[var(--md-page-stack-gap)]">
      {loadError ? (
        <StateBlock
          icon={<AlertCircle className="size-5" strokeWidth={1.4} />}
          title="Items are unavailable"
          detail={loadError}
          action={
            <Button onClick={() => void refresh()} variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              {t("Try again")}
            </Button>
          }
        />
      ) : items === null ? (
        <StateBlock icon={<DotGridLoader decorative />} title="Loading items" detail="" />
      ) : items.length === 0 && !search.trim() && !facilityId ? (
        <StateBlock
          icon={<Package className="size-5" strokeWidth={1.4} />}
          title="No items yet"
          detail={canCreate ? "Add your first item to store customer stock in a facility." : "Create a facility first, then add the items stored inside it."}
          action={canManage && canCreate ? (
            <Button onClick={openCreate} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
              <Plus data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              New item
            </Button>
          ) : undefined}
        />
      ) : (
        <motion.div
          className="min-w-0"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          <DataTable
            ariaLabel="Warehouse items"
            exportConfig={{ fileName: "warehouse-items", register: {
              dateLabel: "Item created date", dateValue: (row) => row.createdAt,
              loadAllRows: (signal) => collectExportPages((page) => listWarehouseItemsPage({ facilityId: facilityId || undefined, search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, ...page }), (row) => row.id, signal),
            } }}
            columnsButtonLabel="Manage item columns"
            storageKey="warehouse-items"
            columns={columns}
            rows={visibleRows}
            getRowKey={(item) => item.id}
            // Keep the operator's exact place in the register while the item's
            // own route is open, then restore that row when they come back.
            onRowClick={openItem}
            rowClassName="hover:bg-[var(--md-hover)]"
            emptyState={emptyState}
            toolbarTabs={toolbarTabs}
            toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => setSearch("")} label="Search items" placeholder="SKU, description, customer" />}
            toolbarFilters={toolbarFilters}
            serverSorting={{ value: sort, onChange: setSort }}
            pagination={{ offset, limit: warehouseRegisterPageSize, total, loading, onOffsetChange: setOffset, onLimitChange: setWarehouseRegisterPageSize, error: Boolean(loadError) }}
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
  return parts.length ? parts.join(" / ") : "–"
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
  const { t } = useLanguage()
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

  const locationSteps: WizardStep[] = [
    { id: "location", label: "Where it is", hint: "The code operators will scan, and where it sits in the facility.", complete: Boolean(form.code.trim()) },
    { id: "capacity", label: "What it can hold", hint: "Size limits and the kinds of stock allowed here. All optional." },
  ]

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
        toast.error("Unable to save the location", { description: "Check your connection and try again." })
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
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit location" : "New location"}
      description="A bin, rack or stock position within a facility."
      steps={locationSteps}
      activeStepId={section}
      onStepChange={setSection}
      submitLabel={isEditing ? "Save changes" : "Create location"}
      onSubmit={handleSubmit}
      saving={saving}
      bodyMinHeight={358}
      presentation={isEditing ? "drawer" : "dialog"}
      layout={isEditing ? "form" : "wizard"}
      drawerEyebrow="Location details"
      secondaryAction={(
        <>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
              {deleting ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
              {t("Delete")}
            </Button>
          ) : null}
          {!isEditing && section !== "capacity" ? <WizardSaveNowButton label="Create now" onSubmit={handleSubmit} saving={saving} /> : null}
        </>
      )}
    >
      {isEditing || section === "location" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseFormField label="Location code" htmlFor="location-code" required error={firstFieldError(errors, "Code")} hint="Unique within the facility, e.g. A01-04-02.">
              <Input id="location-code" dir="ltr" value={form.code} onChange={(event) => update("code", event.target.value)} className={fieldControlClass} placeholder="A01-04-02" />
            </WarehouseFormField>
            <WarehouseFormField label="Zone" error={firstFieldError(errors, "ZoneTypeCode")}>
              <Select value={form.zoneTypeCode} onValueChange={(value) => update("zoneTypeCode", value)}>
                <SelectTrigger className={fieldControlClass}><SelectValue placeholder="No zone selected" /></SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  <SelectItem value={zoneNoneValue} className="text-[13px]">No zone selected</SelectItem>
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

          <WarehouseFormField label="Barcode" htmlFor="location-barcode" hint="Optional." error={firstFieldError(errors, "Barcode")}>
            <Input id="location-barcode" dir="ltr" value={form.barcode} onChange={(event) => update("barcode", event.target.value)} className={fieldControlClass} />
          </WarehouseFormField>

        </div>
      ) : null}

      {isEditing || section === "capacity" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
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

          <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
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
      ) : null}
    </WizardDialog>
  )
}

function ImportLocationsDialog({ open, onOpenChange, facilityId, facilityName, reference, onImported }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilityId: string
  facilityName: string
  reference: WarehouseLocationReference | null
  onImported: () => void
}) {
  const { t } = useLanguage()
  const [defaultTypeCode, setDefaultTypeCode] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const busyRef = useRef(false)
  const [result, setResult] = useState<ImportItemsResult | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetReview() {
    setResult(null)
    setReviewed(false)
    setCompleted(false)
    setError(null)
  }
  useEffect(() => {
    if (!open) return
    setDefaultTypeCode(reference?.types.find((type) => type.code === "bin")?.code ?? reference?.types[0]?.code ?? "")
    setFile(null)
    resetReview()
  }, [open, facilityId, reference])

  async function download() {
    setDownloading(true)
    setError(null)
    try { await downloadWarehouseLocationsTemplate(facilityId) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setDownloading(false) }
  }
  async function submit() {
    if (!file || !defaultTypeCode || busyRef.current) return
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError(t("Choose an .xlsx file no larger than 10 MB."))
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const preview = !reviewed
      const response = await importWarehouseLocations({ facilityId, defaultTypeCode, file, preview })
      setResult(response)
      setReviewed(preview && response.failed === 0 && response.results.length > 0)
      setCompleted(response.preview === false)
      if (!response.results.length) setError(t("No rows were found. Fill in the template and upload it again."))
      if (!preview && response.created > 0) onImported()
    } catch (error) {
      setReviewed(false)
      setResult(null)
      setError(error instanceof Error ? error.message : String(error))
      if (reviewed) onImported()
    } finally { busyRef.current = false; setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!busyRef.current) onOpenChange(value) }}>
    <DialogContent showCloseButton={!busy} className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] sm:max-w-[680px]">
      <DialogHeader className={warehouseDialogHeaderClass}>
        <DialogTitle>{t("Import locations")}</DialogTitle>
        <DialogDescription>{t("Add locations to")} <span data-i18n-skip>{facilityName}</span>. {t("Only a location code is required per row. Choose the default type once, then review before creating.")}</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 gap-4 overflow-y-auto px-6 py-4">
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
          <WarehouseFormField label={t("Default location type")} required hint={t("Used when Type is blank in the spreadsheet. Override it on individual rows if needed.")}>
            <Select value={defaultTypeCode} onValueChange={(value) => { resetReview(); setDefaultTypeCode(value) }}>
              <SelectTrigger aria-label={t("Default location type")} className={fieldControlClass}><SelectValue placeholder={t("Choose a location type")} /></SelectTrigger>
              <SelectContent>{reference?.types.map((type) => <SelectItem key={type.code} value={type.code}>{type.name}</SelectItem>)}</SelectContent>
            </Select>
          </WarehouseFormField>
          {!reference ? <InlineNotice tone="warning">{t("Location types could not be loaded. Close this window and try again.")}</InlineNotice> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{t("1. Download the template")}</p><p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Optional columns cover type, zone, barcode, position, capacity, temperature and storage rules. Instructions, examples and valid codes are included.")}</p></div>
            <Button variant="outline" disabled={downloading || !reference} onClick={() => void download()}><Download className="size-4" />{t(downloading ? "Preparing…" : "Template")}</Button>
          </div>
          <div className="grid gap-2">
            <label htmlFor="warehouse-location-import-file" className="text-[13px] font-medium">{t("2. Upload the filled-in file")}</label>
            <Input id="warehouse-location-import-file" type="file" accept=".xlsx" aria-label={t("Upload locations spreadsheet")} className="h-auto min-h-10 py-2" onChange={(event) => { resetReview(); setFile(event.target.files?.[0] ?? null) }} />
            <p className="text-[12px] text-[var(--md-subtle)]">{t("Excel .xlsx · up to 2,000 rows / 10 MB. Existing locations are never overwritten.")}</p>
          </div>
        </fieldset>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        {busy ? <div role="status" className="flex items-center gap-2 text-[13px]"><DotGridLoader decorative />{t(reviewed ? "Creating locations. Keep this window open…" : "Checking your spreadsheet…")}</div> : null}
        {result ? <SpreadsheetImportReview rows={result.results} completed={completed} /> : null}
      </div>
      <DialogFooter className={warehouseDialogFooterClass}>
        <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{t(result ? "Close" : "Cancel")}</Button>
        <Button disabled={busy || !file || !defaultTypeCode || completed || Boolean(result?.failed)} onClick={() => void submit()}><Upload className="size-4" />{t(reviewed ? `Create ${result?.results.length ?? 0} locations` : "Review file")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

export function WarehouseLocationsView() {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [facilities, setFacilities] = useState<WarehouseFacility[] | null>(null)
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("")
  const [reference, setReference] = useState<WarehouseLocationReference | null>(null)
  const [locations, setLocations] = useState<WarehouseLocation[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [warehouseRegisterPageSize, setWarehouseRegisterPageSize] = useState(defaultPaginationPageSize)
  const [sort, setSort] = useState<WarehouseRegisterSort | null>({ id: "code", direction: "asc" })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<(typeof locationFilters)[number]>(locationFilters[0])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseLocation | null>(null)

  useEffect(() => {
    let active = true
    listWarehouseFacilitiesPage({ limit: 50, offset: 0, sort: { id: "facility", direction: "asc" } })
      .then((page) => {
        if (!active) return
        const list = page.rows
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
    setReference(null)
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
    setLoading(true)
    const timer = window.setTimeout(() => listWarehouseLocationsPage(selectedFacilityId, { search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, limit: warehouseRegisterPageSize, offset })
      .then((page) => { if (active) { setLoadError(null); setLocations(page.rows); setTotal(page.total) } })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
        setLocations([])
        setTotal(0)
      }).finally(() => { if (active) setLoading(false) }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [selectedFacilityId, activeFilter, offset, warehouseRegisterPageSize, search, sort])

  useEffect(() => setOffset(0), [selectedFacilityId, activeFilter, search, sort])

  async function refresh() {
    if (!selectedFacilityId) return
    setLoadError(null)
    setLoading(true)
    try {
      const page = await listWarehouseLocationsPage(selectedFacilityId, { search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, limit: warehouseRegisterPageSize, offset })
      setLocations(page.rows)
      setTotal(page.total)
    } catch (error) {
      setLoadError(error instanceof WarehouseApiError ? error.message : String(error))
      setLocations([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const visibleRows = locations ?? []

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  useEffect(() => {
    const openFromTopBar = () => {
      if (selectedFacilityId) openCreate()
    }
    return subscribeTopBarAction(topBarActionEvents.createWarehouseLocation, openFromTopBar)
  }, [selectedFacilityId])

  useEffect(() => subscribeTopBarAction(topBarActionEvents.importWarehouseLocations, () => {
    if (selectedFacilityId) setImportOpen(true)
  }), [selectedFacilityId])

  function openEdit(location: WarehouseLocation) {
    setEditing(location)
    setDialogOpen(true)
  }

  const columns = useMemo<DataTableColumn<WarehouseLocation>[]>(() => [
    {
      id: "code",
      label: "Code",
      width: 160,
      minWidth: 132,
      resizable: true,
      canHide: false,
      sortValue: (location) => location.code,
      cell: (location) => <CodeText>{location.code}</CodeText>,
    },
    {
      id: "zone",
      label: "Zone",
      width: 210,
      minWidth: 156,
      resizable: true,
      sortValue: (location) => location.zoneName,
      cell: (location) =>
        location.zoneName ? <StatusPill tone="teal">{location.zoneName}</StatusPill> : <span className="text-[12px] text-[var(--md-subtle)]">{t("No zone")}</span>,
    },
    {
      id: "type",
      label: "Type",
      kind: "attribute",
      width: 164,
      minWidth: 132,
      resizable: true,
      sortValue: (location) => location.typeName ?? location.typeCode,
      cell: (location) => <span className="text-[13px] text-[var(--md-ink)]">{location.typeName ?? location.typeCode}</span>,
    },
    {
      id: "position",
      label: "Position",
      width: 220,
      minWidth: 160,
      resizable: true,
      sortValue: (location) => locationPosition(location),
      cell: (location) => <span className="text-[13px] text-[var(--md-text)]">{locationPosition(location)}</span>,
    },
    {
      id: "status",
      label: "Status",
      kind: "status",
      width: 132,
      resizable: true,
      headerClassName: "text-end",
      cellClassName: "text-end",
      sortValue: (location) => Number(location.isActive),
      cell: (location) =>
        location.isActive ? <StatusPill tone="green">{location.statusName ?? t("Active")}</StatusPill> : <StatusPill tone="neutral">{t("Inactive")}</StatusPill>,
    },
  ], [t])

  const facilityOptions = facilities ?? []
  const hasFacilities = facilityOptions.length > 0
  const emptyState = activeFilter === "All" || search.trim() ? (
    <div className="mx-auto max-w-[360px]">
      <EmptyStateIllustration variant="search" className="mb-3" />
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No locations match this view")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Clear a filter or widen the search to see more locations.")}</p>
    </div>
  ) : (
    <div className="mx-auto max-w-[360px]">
      <EmptyStateIllustration variant="cargo" className="mb-3" />
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No locations yet")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Add the first bin, rack, or position for this facility.")}</p>
    </div>
  )

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      {facilities === null ? (
        <StateBlock icon={<DotGridLoader decorative />} title="Loading locations" detail="" />
      ) : !hasFacilities ? (
        <StateBlock
          icon={<Warehouse className="size-5" strokeWidth={1.4} />}
          title="No facilities yet"
          detail="Create a facility first, then lay out the locations inside it."
        />
      ) : loadError ? (
        <StateBlock
          icon={<AlertCircle className="size-5" strokeWidth={1.4} />}
          title="Locations are unavailable"
          detail={loadError}
          action={
            <Button onClick={() => void refresh()} variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
              <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              {t("Try again")}
            </Button>
          }
        />
      ) : locations === null ? (
        <StateBlock icon={<DotGridLoader decorative />} title="Loading locations" detail="" />
      ) : (
        <motion.div
          className="min-w-0"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          <DataTable
            ariaLabel="Warehouse locations"
            exportConfig={{ fileName: "warehouse-locations", register: {
              dateLabel: "Location created date", dateValue: (row) => row.createdAt,
              loadAllRows: (signal) => collectExportPages((page) => listWarehouseLocationsPage(selectedFacilityId, { search: search.trim() || undefined, includeInactive: activeFilter === "All", sort, ...page }), (row) => row.id, signal),
            } }}
            columnsButtonLabel="Manage location columns"
            storageKey="warehouse-locations"
            columns={columns}
            rows={visibleRows}
            getRowKey={(location) => location.id}
            onRowClick={openEdit}
            selectedRowKey={dialogOpen ? editing?.id ?? null : null}
            rowClassName="hover:bg-[var(--md-hover)]"
            emptyState={emptyState}
            toolbarTabs={(
              <RegisterViewSwitch options={locationFilters} value={activeFilter} onChange={setActiveFilter} counts={{ [activeFilter]: total }} ariaLabel="Location status" compact />
            )}
            toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => setSearch("")} label="Search locations" placeholder="Code, zone, position" />}
            toolbarFilters={(
              <>
                <Select value={selectedFacilityId} onValueChange={(value) => { setDialogOpen(false); setEditing(null); setSelectedFacilityId(value) }}>
                  <SelectTrigger aria-label={t("Facility")} className={cn(registerControlClass, "w-[142px] shrink-0 sm:w-[168px]")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {facilityOptions.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            serverSorting={{ value: sort, onChange: setSort }}
            pagination={{ offset, limit: warehouseRegisterPageSize, total, loading, onOffsetChange: setOffset, onLimitChange: setWarehouseRegisterPageSize, error: Boolean(loadError) }}
          />
        </motion.div>
      )}

      <ImportLocationsDialog open={importOpen} onOpenChange={setImportOpen} facilityId={selectedFacilityId} facilityName={facilityOptions.find((facility) => facility.id === selectedFacilityId)?.name ?? ""} reference={reference} onImported={() => void refresh()} />
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
