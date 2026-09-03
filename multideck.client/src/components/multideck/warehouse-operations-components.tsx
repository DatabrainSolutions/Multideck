import { defaultPaginationPageSize } from "@/lib/pagination"
import { collectExportPages } from "@/lib/table-export"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Boxes, Loader2, Plus, RefreshCw, Trash2, Upload } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WarehouseFormField, warehouseDialogFooterClass, warehouseDialogHeaderClass } from "@/components/multideck/warehouse-management-components"
import { MultideckDatePicker, MultideckDateTimePicker } from "@/components/multideck/date-picker"
import { WizardDialog, WizardSaveNowButton, type WizardStep } from "@/components/multideck/wizard-dialog"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { orderDetailPath } from "@/components/multideck/warehouse-order-detail"
import { DotGridLoader, DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import {
  RegisterFacetSelect,
  RegisterRevalidatingMark,
  RegisterSearchField,
  RegisterViewSwitch,
} from "@/components/multideck/register-toolbar"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import {
  WarehouseApiError,
  cancelOperationalWarehouseOrder,
  checkOperationalWarehouseOrderDraftAvailability,
  createOperationalWarehouseOrder,
  dispatchOperationalWarehouseOrder,
  getWarehouseOrderReference,
  listOperationalWarehouseOrdersPage,
  listWarehouseOrderCustomersPage,
  listWarehouseOrderItemsPage,
  listWarehouseOrderLocationsPage,
  listWarehouseFacilitiesPage,
  receiveOperationalWarehouseOrder,
  uploadWarehouseOrderDocument,
  type CreateWarehouseOrderInput,
  type DispatchWarehouseOrderInput,
  type ReceiveWarehouseOrderInput,
  type WarehouseDraftAvailabilityQuery,
  type WarehouseFacility,
  type WarehouseOperationalOrder,
  type WarehouseOrderReference,
  type WarehouseRegisterSort,
} from "@/lib/warehouse"

const controlClass = "!h-10 !w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 !px-3 !text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
const allValue = "__all__"
const allOrderTypes: ("inbound" | "outbound")[] = ["inbound", "outbound"]

function errorMessage(error: unknown) {
  return error instanceof WarehouseApiError ? error.message : error instanceof Error ? error.message : String(error)
}

function EmptyState({ loading, error, empty, onRetry }: { loading: boolean; error: string | null; empty: string; onRetry: () => void }) {
  const { t } = useLanguage()

  return (
    <div className="grid place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 py-14 text-center shadow-[var(--md-shadow-line)]" role={error ? "alert" : undefined}>
      {/* The wait uses the same spiral as a page load, so a slow table and a slow
          route read as the same product thinking rather than two loaders. */}
      <span className="mb-3 grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        {loading ? <DotGridLoader decorative /> : error ? <AlertCircle className="size-5" strokeWidth={1.4} /> : <Boxes className="size-5" strokeWidth={1.4} />}
      </span>
      <p className="text-[14px] font-medium text-[var(--md-ink)]">{loading ? t("Loading warehouse orders") : error ? t("Warehouse orders are unavailable") : t(empty)}</p>
      <p className="mt-1 max-w-[440px] text-[13px] leading-5 text-[var(--md-text)]">{error ?? (loading ? "" : t("Orders appear here as the team books work in."))}</p>
      {error ? <Button variant="ghost" onClick={onRetry} className="mt-4 h-9 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><RefreshCw className="size-4" strokeWidth={1.4} />{t("Try again")}</Button> : null}
    </div>
  )
}

function FacilityFilter({ reference, value, onChange }: { reference: WarehouseOrderReference | null; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value || allValue} onValueChange={(next) => onChange(next === allValue ? "" : next)}>
      <SelectTrigger aria-label="Warehouse" className="h-10 min-w-[210px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
        <SelectValue placeholder="All warehouses" />
      </SelectTrigger>
      <SelectContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
        <SelectItem value={allValue}>All warehouses</SelectItem>
        {reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function toneForStatus(status: string): "green" | "amber" | "red" | "blue" | "teal" | "neutral" {
  if (["complete", "received", "dispatched", "available"].includes(status)) return "green"
  if (["cancelled", "blocked", "damaged"].includes(status)) return "red"
  if (["booked", "planned", "part_complete"].includes(status)) return "amber"
  if (["in_progress", "picked", "packed"].includes(status)) return "blue"
  return "neutral"
}

type DraftLine = { key: string; itemId: string; quantity: string; lotNumber: string; expiryDate: string; locationId: string; customsStatusCode: string }
type OrderForm = { facilityId: string; customerOrgId: string; typeCode: "inbound" | "outbound"; customerReference: string; requestedDate: string; appointmentStartAt: string; vehicleReg: string; containerNumber: string; sealNumber: string; instructions: string; lines: DraftLine[] }
type DraftLineAvailability = { available: number; uomCode: string }
type OrderCustomerOption = WarehouseOrderReference["customers"][number]
type OrderItemOption = WarehouseOrderReference["items"][number]
type OrderLocationOption = WarehouseOrderReference["locations"][number]

function draftLineAvailabilityKey(lineKey: string) { return `line:${lineKey}` }
function draftItemAvailabilityKey(itemId: string, customsStatusCode: string) { return `item:${itemId}:${customsStatusCode}` }
function draftLocationAvailabilityKey(itemId: string, locationId: string, customsStatusCode: string) { return `location:${itemId}:${locationId}:${customsStatusCode}` }

function blankLine(reference: WarehouseOrderReference | null, _facilityId: string, _customerOrgId: string, _typeCode: "inbound" | "outbound"): DraftLine {
  return { key: crypto.randomUUID(), itemId: "", quantity: "", lotNumber: "", expiryDate: "", locationId: "", customsStatusCode: reference?.customsStatuses[0]?.code ?? "free_circulation" }
}

function CreateOrderDialog({ open, onOpenChange, reference, fixedType, allowedTypes = allOrderTypes, isCustomer = false, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; fixedType?: "inbound" | "outbound"; allowedTypes?: ("inbound" | "outbound")[]; isCustomer?: boolean; onSaved: () => void }) {
  const firstFacility = reference?.facilities[0]?.id ?? ""
  const firstCustomer = reference?.customers[0]?.id ?? ""
  const initialType = fixedType ?? allowedTypes[0] ?? "inbound"
  const [form, setForm] = useState<OrderForm>(() => ({ facilityId: firstFacility, customerOrgId: firstCustomer, typeCode: initialType, customerReference: "", requestedDate: "", appointmentStartAt: "", vehicleReg: "", containerNumber: "", sealNumber: "", instructions: "", lines: [blankLine(reference, firstFacility, firstCustomer, initialType)] }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availabilityChecks, setAvailabilityChecks] = useState<Record<string, DraftLineAvailability> | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [customerRows, setCustomerRows] = useState<OrderCustomerOption[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<OrderCustomerOption | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customersHaveMore, setCustomersHaveMore] = useState(false)
  const [itemRows, setItemRows] = useState<OrderItemOption[]>([])
  const [selectedItems, setSelectedItems] = useState<OrderItemOption[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [itemLoading, setItemLoading] = useState(false)
  const [itemsHaveMore, setItemsHaveMore] = useState(false)
  const [locationRows, setLocationRows] = useState<OrderLocationOption[]>([])
  const [selectedLocations, setSelectedLocations] = useState<OrderLocationOption[]>([])
  const [locationSearch, setLocationSearch] = useState("")
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationsHaveMore, setLocationsHaveMore] = useState(false)
  const [selectorError, setSelectorError] = useState<string | null>(null)
  const [section, setSection] = useState("details")
  const [activeLineKey, setActiveLineKey] = useState("")
  const [supportingFile, setSupportingFile] = useState<File | null>(null)
  const { language, t } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3 }), [language])

  useEffect(() => {
    if (!open) return
    const facilityId = reference?.facilities[0]?.id ?? ""
    const customerOrgId = reference?.customers[0]?.id ?? ""
    const typeCode = fixedType ?? allowedTypes[0] ?? "inbound"
    const line = blankLine(reference, facilityId, customerOrgId, typeCode)
    setForm({ facilityId, customerOrgId, typeCode, customerReference: "", requestedDate: "", appointmentStartAt: "", vehicleReg: "", containerNumber: "", sealNumber: "", instructions: "", lines: [line] })
    setSection("details")
    setActiveLineKey(line.key)
    setSupportingFile(null)
    setError(null)
    setCustomerSearch("")
    setItemSearch("")
    setLocationSearch("")
    setSelectedCustomer(null)
    setSelectedItems([])
    setSelectedLocations([])
  }, [open, reference, fixedType, allowedTypes])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setCustomerLoading(true)
      listWarehouseOrderCustomersPage({ search: customerSearch.trim() || undefined, limit: 25 })
        .then((page) => {
          if (cancelled) return
          setCustomerRows(page.rows)
          setCustomersHaveMore(page.hasMore)
          setSelectorError(null)
          setForm((current) => {
            if (current.customerOrgId) {
              const currentCustomer = page.rows.find((row) => row.id === current.customerOrgId)
              if (currentCustomer) setSelectedCustomer(currentCustomer)
              return current
            }
            if (!page.rows[0]) return current
            const line = blankLine(reference, current.facilityId, page.rows[0].id, current.typeCode)
            setSelectedCustomer(page.rows[0])
            setActiveLineKey(line.key)
            return { ...current, customerOrgId: page.rows[0].id, lines: [line] }
          })
        })
        .catch((cause) => {
          if (!cancelled) {
            setCustomerRows([])
            setCustomersHaveMore(false)
            setSelectorError(errorMessage(cause))
          }
        })
        .finally(() => { if (!cancelled) setCustomerLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, customerSearch, reference])

  useEffect(() => {
    if (!open || !form.facilityId || !form.customerOrgId) {
      setItemRows([])
      setItemsHaveMore(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setItemLoading(true)
      listWarehouseOrderItemsPage({
        facilityId: form.facilityId,
        customerOrgId: form.customerOrgId,
        search: itemSearch.trim() || undefined,
        limit: 25,
      })
        .then((page) => {
          if (cancelled) return
          setItemRows(page.rows)
          setItemsHaveMore(page.hasMore)
          setSelectorError(null)
        })
        .catch((cause) => {
          if (!cancelled) {
            setItemRows([])
            setItemsHaveMore(false)
            setSelectorError(errorMessage(cause))
          }
        })
        .finally(() => { if (!cancelled) setItemLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, form.facilityId, form.customerOrgId, itemSearch])

  useEffect(() => {
    if (!open || isCustomer || !form.facilityId) {
      setLocationRows([])
      setLocationsHaveMore(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLocationLoading(true)
      listWarehouseOrderLocationsPage({
        facilityId: form.facilityId,
        search: locationSearch.trim() || undefined,
        limit: 25,
      })
        .then((page) => {
          if (cancelled) return
          setLocationRows(page.rows)
          setLocationsHaveMore(page.hasMore)
          setSelectorError(null)
        })
        .catch((cause) => {
          if (!cancelled) {
            setLocationRows([])
            setLocationsHaveMore(false)
            setSelectorError(errorMessage(cause))
          }
        })
        .finally(() => { if (!cancelled) setLocationLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, isCustomer, form.facilityId, locationSearch])

  const customerOptions = useMemo(() => {
    const rows = selectedCustomer ? [selectedCustomer, ...customerRows] : customerRows
    return rows.filter((row, index) => rows.findIndex((candidate) => candidate.id === row.id) === index)
  }, [customerRows, selectedCustomer])
  const availableItems = useMemo(() => {
    const rows = [...selectedItems, ...itemRows]
    return rows
      .filter((item) => item.facilityId === form.facilityId && item.customerOrgId === form.customerOrgId)
      .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
  }, [form.customerOrgId, form.facilityId, itemRows, selectedItems])
  const availableLocations = useMemo(() => {
    const rows = [...selectedLocations, ...locationRows]
    return rows
      .filter((location) => location.facilityId === form.facilityId)
      .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
  }, [form.facilityId, locationRows, selectedLocations])

  const draftAvailabilityQueries = useMemo<WarehouseDraftAvailabilityQuery[]>(() => {
    if (form.typeCode !== "outbound") return []
    const queries = new Map<string, WarehouseDraftAvailabilityQuery>()
    const activeLine = form.lines.find((line) => line.key === activeLineKey) ?? form.lines[0]
    for (const line of form.lines) {
      const item = availableItems.find((candidate) => candidate.id === line.itemId)
      if (!item) continue
      const key = draftLineAvailabilityKey(line.key)
      queries.set(key, { key, itemId: line.itemId, locationId: line.locationId || null, lotNumber: line.lotNumber.trim() || null, customsStatusCode: line.customsStatusCode, uomCode: item.uomCode })
    }
    const itemCustomsStatus = activeLine?.customsStatusCode ?? "free_circulation"
    for (const item of availableItems) {
      const key = draftItemAvailabilityKey(item.id, itemCustomsStatus)
      queries.set(key, { key, itemId: item.id, locationId: null, lotNumber: null, customsStatusCode: itemCustomsStatus, uomCode: item.uomCode })
    }
    if (activeLine?.itemId) {
      const item = availableItems.find((candidate) => candidate.id === activeLine.itemId)
      if (item) {
        for (const location of availableLocations) {
          const key = draftLocationAvailabilityKey(item.id, location.id, activeLine.customsStatusCode)
          queries.set(key, { key, itemId: item.id, locationId: location.id, lotNumber: null, customsStatusCode: activeLine.customsStatusCode, uomCode: item.uomCode })
        }
      }
    }
    return [...queries.values()].slice(0, 100)
  }, [activeLineKey, availableItems, availableLocations, form.lines, form.typeCode])
  const draftAvailabilityRequest = useMemo(() => JSON.stringify(draftAvailabilityQueries), [draftAvailabilityQueries])

  useEffect(() => {
    if (!open || form.typeCode !== "outbound" || !form.facilityId || !form.customerOrgId) {
      setAvailabilityChecks({})
      setAvailabilityError(null)
      return
    }
    const queries = JSON.parse(draftAvailabilityRequest) as WarehouseDraftAvailabilityQuery[]
    if (!queries.length) {
      setAvailabilityChecks({})
      setAvailabilityError(null)
      return
    }
    let cancelled = false
    setAvailabilityChecks(null)
    setAvailabilityError(null)
    const timer = window.setTimeout(() => {
      checkOperationalWarehouseOrderDraftAvailability({ facilityId: form.facilityId, customerOrgId: form.customerOrgId, queries })
        .then((results) => {
          if (cancelled) return
          setAvailabilityChecks(Object.fromEntries(results.map((result) => [result.key, { available: result.available, uomCode: result.uomCode }])))
        })
        .catch((cause) => {
          if (cancelled) return
          setAvailabilityChecks({})
          setAvailabilityError(errorMessage(cause))
        })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [draftAvailabilityRequest, form.customerOrgId, form.facilityId, form.typeCode, open])

  const lineAvailability = useMemo(() => {
    const availability: Record<string, DraftLineAvailability> = {}
    const reserved: Array<{ line: DraftLine; quantity: number; uomCode: string }> = []
    // Specific lines are allocated first. A later broad line (for example, the
    // same SKU without a location) must not offer stock already promised to a
    // more specific line in this draft.
    const orderedLines = [...form.lines].sort((left, right) => (
      Number(Boolean(right.locationId)) + Number(Boolean(right.lotNumber.trim()))
      - Number(Boolean(left.locationId)) - Number(Boolean(left.lotNumber.trim()))
    ))

    for (const line of orderedLines) {
      const item = availableItems.find((candidate) => candidate.id === line.itemId)
      const raw = availabilityChecks?.[draftLineAvailabilityKey(line.key)] ?? { available: 0, uomCode: item?.uomCode ?? "" }
      const alreadyReserved = reserved
        .filter((entry) => entry.line.itemId === line.itemId
          && entry.line.customsStatusCode === line.customsStatusCode
          && entry.uomCode === raw.uomCode
          && (!entry.line.locationId || !line.locationId || entry.line.locationId === line.locationId)
          && (!entry.line.lotNumber.trim() || !line.lotNumber.trim() || entry.line.lotNumber.trim().toLowerCase() === line.lotNumber.trim().toLowerCase()))
        .reduce((total, entry) => total + entry.quantity, 0)
      const available = Math.max(0, raw.available - alreadyReserved)
      availability[line.key] = { available, uomCode: raw.uomCode }
      reserved.push({ line, quantity: Math.min(Math.max(Number(line.quantity) || 0, 0), available), uomCode: raw.uomCode })
    }
    return availability
  }, [availabilityChecks, availableItems, form.lines])
  const hasOutboundStockIssue = form.typeCode === "outbound" && (
    availabilityChecks === null || Boolean(availabilityError) || form.lines.some((line) => Boolean(line.itemId) && Number(line.quantity) > (lineAvailability[line.key]?.available ?? 0))
  )
  function availableFor(itemId: string, locationId = "", customsStatusCode = "") {
    if (!itemId || form.typeCode !== "outbound" || availabilityChecks === null) return null
    const key = locationId
      ? draftLocationAvailabilityKey(itemId, locationId, customsStatusCode)
      : draftItemAvailabilityKey(itemId, customsStatusCode)
    return availabilityChecks[key]?.available ?? 0
  }
  function patchForm(patch: Partial<OrderForm>) { setForm((current) => ({ ...current, ...patch })) }
  function patchLine(key: string, patch: Partial<DraftLine>) { setForm((current) => ({ ...current, lines: current.lines.map((line) => line.key === key ? { ...line, ...patch } : line) })) }
  function resetLines(facilityId: string, customerOrgId: string) { const line = blankLine(reference, facilityId, customerOrgId, form.typeCode); patchForm({ facilityId, customerOrgId, lines: [line] }); setActiveLineKey(line.key); setItemSearch(""); setLocationSearch(""); setSelectedItems([]); setSelectedLocations([]) }
  function changeType(typeCode: "inbound" | "outbound") { const line = blankLine(reference, form.facilityId, form.customerOrgId, typeCode); patchForm({ typeCode, lines: [line] }); setActiveLineKey(line.key) }
  function addLine() { const line = blankLine(reference, form.facilityId, form.customerOrgId, form.typeCode); patchForm({ lines: [...form.lines, line] }); setActiveLineKey(line.key) }
  function removeLine(key: string) { const remaining = form.lines.filter((line) => line.key !== key); patchForm({ lines: remaining }); setActiveLineKey(remaining[0]?.key ?? "") }

  async function submit() {
    if (hasOutboundStockIssue) {
      setError(t("Reduce the outbound quantities to the available stock before placing the order."))
      return
    }
    setSaving(true); setError(null)
    try {
      const payload: CreateWarehouseOrderInput = {
        facilityId: form.facilityId, customerOrgId: form.customerOrgId, typeCode: form.typeCode, priorityCode: "normal",
        customerReference: form.customerReference.trim() || null, requestedDate: form.requestedDate || null,
        appointmentStartAt: form.appointmentStartAt ? new Date(form.appointmentStartAt).toISOString() : null, appointmentEndAt: null,
        vehicleReg: form.vehicleReg.trim() || null, containerNumber: form.containerNumber.trim() || null, sealNumber: form.sealNumber.trim() || null, instructions: form.instructions.trim() || null,
        lines: form.lines.map((line) => {
          const item = availableItems.find((candidate) => candidate.id === line.itemId)
          return { itemId: line.itemId, quantity: Number(line.quantity), uomCode: item?.uomCode ?? null, lotNumber: line.lotNumber.trim() || null, expiryDate: line.expiryDate || null, sourceLocationId: !isCustomer && form.typeCode === "outbound" ? line.locationId || null : null, targetLocationId: !isCustomer && form.typeCode === "inbound" ? line.locationId || null : null, customsStatusCode: line.customsStatusCode || null, goodsValue: null, currencyCode: null, instructions: null }
        }),
      }
      const created = await createOperationalWarehouseOrder(payload)
      if (supportingFile) {
        try {
          await uploadWarehouseOrderDocument(created.id, supportingFile, "customer_document")
        } catch (uploadError) {
          toast.error(t("The order was created, but its document could not be uploaded. Open the order to try again."), { description: errorMessage(uploadError) })
        }
      }
      toast.success(form.typeCode === "inbound" ? "Inbound booking created" : "Outbound order placed")
      onOpenChange(false); onSaved()
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  // Exactly the conditions the old footer button used — the wizard changes where
  // the operator is standing, not what the server will accept.
  const submitBlocked = hasOutboundStockIssue || !form.facilityId || !form.customerOrgId || form.lines.some((line) => !line.itemId || Number(line.quantity) <= 0 || (!isCustomer && !line.locationId))

  const orderSteps: WizardStep[] = [
    { id: "details", label: "The order", hint: "Whose stock this is, which warehouse it belongs to, and when it is expected.", complete: Boolean(form.facilityId && form.customerOrgId) },
    { id: "lines", label: `Items (${form.lines.length})`, hint: "What is arriving or leaving, and how much of it.", complete: form.lines.length > 0 && !form.lines.some((line) => !line.itemId || Number(line.quantity) <= 0) },
    { id: "transport", label: "Transport", hint: "Vehicle, container and anything the warehouse team should know. All optional." },
  ]

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.typeCode === "inbound" ? "Book goods in" : "New outbound order"}
      description="Book the order now. The physical receipt or dispatch is posted later, when the work is actually done."
      steps={orderSteps}
      activeStepId={section}
      onStepChange={setSection}
      submitLabel={form.typeCode === "inbound" ? "Book it in" : "Place the order"}
      onSubmit={() => void submit()}
      saving={saving}
      submitDisabled={submitBlocked}
      bodyMinHeight={366}
      className="sm:max-w-[880px]"
      secondaryAction={section !== "transport" ? (
        <WizardSaveNowButton
          label={form.typeCode === "inbound" ? "Book it in" : "Place the order"}
          onSubmit={() => void submit()}
          saving={saving}
          disabled={submitBlocked}
        />
      ) : undefined}
    >
      {error || selectorError ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)]">{error ?? selectorError}</div> : null}

      {section === "details" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <WarehouseFormField label="Warehouse" required><Select value={form.facilityId} onValueChange={(value) => resetLines(value, form.customerOrgId)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            <WarehouseFormField label="Customer" required hint={customersHaveMore ? t("Search to narrow the customer list.") : undefined}><div className="grid gap-1.5">{isCustomer ? null : <div className="relative"><Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={t("Search customers…")} className={controlClass} dir="auto" />{customerLoading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div>}<Select value={form.customerOrgId} onValueChange={(value) => { setSelectedCustomer(customerOptions.find((customer) => customer.id === value) ?? null); resetLines(form.facilityId, value) }} disabled={isCustomer || customerLoading && customerOptions.length === 0}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose customer")} /></SelectTrigger><SelectContent>{customerOptions.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select></div></WarehouseFormField>
            {!fixedType && allowedTypes.length > 1 ? <WarehouseFormField label="Direction" required><Select value={form.typeCode} onValueChange={(value) => changeType(value as "inbound" | "outbound")}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{allowedTypes.includes("inbound") ? <SelectItem value="inbound">Inbound receipt</SelectItem> : null}{allowedTypes.includes("outbound") ? <SelectItem value="outbound">Outbound release</SelectItem> : null}</SelectContent></Select></WarehouseFormField> : <WarehouseFormField label="Direction"><div className={`${controlClass} flex items-center`}>{form.typeCode === "inbound" ? "Inbound receipt" : "Outbound release"}</div></WarehouseFormField>}
            <WarehouseFormField label="Customer reference"><Input value={form.customerReference} onChange={(event) => patchForm({ customerReference: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Requested date"><MultideckDatePicker value={form.requestedDate || null} onChange={(date) => patchForm({ requestedDate: date ?? "" })} placeholder="Select date" title="Requested date" description="Pick the date requested by the customer." triggerClassName={controlClass} /></WarehouseFormField>
            <WarehouseFormField label="Appointment"><MultideckDateTimePicker value={form.appointmentStartAt} onChange={(appointmentStartAt) => patchForm({ appointmentStartAt })} placeholder="Select date" title="Appointment" description="Pick the appointment date and time." triggerClassName={controlClass} timeClassName={controlClass} /></WarehouseFormField>
          </div>
        </div>
      ) : null}

      {section === "lines" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">Order lines</p><p className="text-[11.5px] text-[var(--md-subtle)]">{form.typeCode === "outbound" ? t("Available stock is shown before you assign each quantity.") : "Choose the item, quantity, batch requirement, and warehouse location."}</p></div><Button variant="ghost" onClick={addLine} className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><Plus className="size-4" />Add line</Button></div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">{form.lines.map((line, index) => <button key={line.key} type="button" onClick={() => setActiveLineKey(line.key)} className={`h-8 shrink-0 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium ${activeLineKey === line.key ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" : "bg-white/48 text-[var(--md-text)] shadow-[var(--md-shadow-line)]"}`}>Item {index + 1}</button>)}</div>
            {form.lines.filter((line) => line.key === activeLineKey).map((line) => {
              const index = form.lines.findIndex((candidate) => candidate.key === line.key)
              const item = availableItems.find((candidate) => candidate.id === line.itemId)
              const availability = lineAvailability[line.key] ?? { available: 0, uomCode: item?.uomCode ?? "" }
              const requestedQuantity = Number(line.quantity) || 0
              const quantityExceedsAvailability = form.typeCode === "outbound" && Boolean(line.itemId) && availabilityChecks !== null && requestedQuantity > availability.available
              const quantityHint = form.typeCode !== "outbound" || !line.itemId
                ? undefined
                : availabilityChecks === null
                  ? t("Checking available stock…")
                  : `${number.format(availability.available)} ${availability.uomCode} ${t(line.locationId ? "available at this location." : "available across the warehouse.")}`
              const quantityError = form.typeCode !== "outbound" || !line.itemId
                ? undefined
                : availabilityError
                  ? t("Available stock could not be checked.")
                  : quantityExceedsAvailability
                    ? `${t("Only")} ${number.format(availability.available)} ${availability.uomCode} ${t(line.locationId ? "available at this location." : "available across the warehouse.")}`
                    : undefined
              return <div key={line.key} className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)] md:grid-cols-12">
                <WarehouseFormField label={`Item ${index + 1}`} required hint={itemsHaveMore ? t("Search to narrow the item list.") : undefined} className="md:col-span-5"><div className="grid gap-1.5"><div className="relative"><Input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder={t("Search items by SKU or description…")} className={controlClass} dir="auto" />{itemLoading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div><Select value={line.itemId} onValueChange={(value) => { const selected = availableItems.find((candidate) => candidate.id === value); if (selected) setSelectedItems((current) => current.some((candidate) => candidate.id === selected.id) ? current : [...current, selected]); patchLine(line.key, { itemId: value, quantity: line.quantity || "1", locationId: form.typeCode === "outbound" ? "" : line.locationId }) }} disabled={!form.facilityId || !form.customerOrgId || itemLoading && availableItems.length === 0}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose item")} /></SelectTrigger><SelectContent>{availableItems.map((option) => {
                  const itemAvailable = availableFor(option.id, "", line.customsStatusCode)
                  return <SelectItem key={option.id} value={option.id} disabled={itemAvailable !== null && itemAvailable <= 0}>{option.sku} · {option.description}{itemAvailable === null ? "" : ` · ${number.format(itemAvailable)} ${option.uomCode} ${t("available")}`}</SelectItem>
                })}</SelectContent></Select></div></WarehouseFormField>
                <WarehouseFormField label="Quantity" required hint={quantityHint} error={quantityError} className="md:col-span-3"><Input type="number" min="0.000001" max={form.typeCode === "outbound" && line.itemId && availabilityChecks !== null ? availability.available : undefined} step="0.001" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} disabled={!line.itemId} aria-invalid={Boolean(quantityError)} className={controlClass} dir="ltr" /></WarehouseFormField>
                {!isCustomer ? <WarehouseFormField label={form.typeCode === "inbound" ? "Target location" : "Source location"} required hint={locationsHaveMore ? t("Search to narrow the location list.") : undefined} className="md:col-span-4"><div className="grid gap-1.5"><div className="relative"><Input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder={t("Search locations…")} className={controlClass} dir="auto" />{locationLoading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div><Select value={line.locationId} onValueChange={(value) => { const selected = availableLocations.find((candidate) => candidate.id === value); if (selected) setSelectedLocations((current) => current.some((candidate) => candidate.id === selected.id) ? current : [...current, selected]); patchLine(line.key, { locationId: value }) }} disabled={!line.itemId || locationLoading && availableLocations.length === 0}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose location")} /></SelectTrigger><SelectContent>{availableLocations.map((location) => {
                  const locationAvailable = availableFor(line.itemId, location.id, line.customsStatusCode)
                  return <SelectItem key={location.id} value={location.id} disabled={locationAvailable !== null && locationAvailable <= 0}>{location.code}{locationAvailable === null ? "" : ` · ${number.format(locationAvailable)} ${item?.uomCode ?? ""} ${t("available")}`}</SelectItem>
                })}</SelectContent></Select></div></WarehouseFormField> : <div className="md:col-span-4 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a07)] px-3 py-2 text-[12px] leading-5 text-[var(--md-text)]">{t("Warehouse staff will assign the storage or picking location.")}</div>}
                <WarehouseFormField label="Customs" className="md:col-span-3"><Select value={line.customsStatusCode} onValueChange={(value) => patchLine(line.key, { customsStatusCode: value })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.customsStatuses.map((status) => <SelectItem key={status.code} value={status.code}>{status.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
                <WarehouseFormField label={item?.requiresLot ? "Lot / batch (required at receipt)" : "Lot / batch"} className="md:col-span-4"><Input value={line.lotNumber} onChange={(event) => patchLine(line.key, { lotNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                <WarehouseFormField label={item?.requiresExpiry ? "Expiry (required at receipt)" : "Expiry"} className="md:col-span-4"><MultideckDatePicker value={line.expiryDate || null} onChange={(date) => patchLine(line.key, { expiryDate: date ?? "" })} placeholder="Select date" title="Expiry date" description="Pick the date this stock expires." triggerClassName={controlClass} /></WarehouseFormField>
                <div className="flex items-end justify-end md:col-span-1"><Button variant="ghost" size="icon" disabled={form.lines.length === 1} onClick={() => removeLine(line.key)} className="size-10 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button></div>
              </div>
            })}
            {!itemLoading && availableItems.length === 0 ? <p className="text-[12px] text-[var(--md-red)]">{t(itemSearch ? "No items match this search." : "No active items are assigned to this customer and warehouse.")}</p> : null}
          </div>
        </div>
      ) : null}

      {section === "transport" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-3 md:grid-cols-3"><WarehouseFormField label="Vehicle registration"><Input value={form.vehicleReg} onChange={(event) => patchForm({ vehicleReg: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Container"><Input value={form.containerNumber} onChange={(event) => patchForm({ containerNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Seal"><Input value={form.sealNumber} onChange={(event) => patchForm({ sealNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField></div>
          <WarehouseFormField label="Instructions"><Textarea value={form.instructions} onChange={(event) => patchForm({ instructions: event.target.value })} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></WarehouseFormField>
          {isCustomer && form.typeCode === "inbound" ? <div className="rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)]"><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Invoice or inbound document")}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{t("Optional. Attach an Outlook email, PDF, Office document, image, archive, or other supporting file.")}</p><label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/68 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><Upload className="size-4" />{supportingFile ? <span dir="auto" className="max-w-[380px] truncate">{supportingFile.name}</span> : t("Choose file")}<input type="file" className="sr-only" onChange={(event) => setSupportingFile(event.target.files?.[0] ?? null)} /></label><p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Up to 25 MB per file.")}</p></div> : null}
        </div>
      ) : null}
    </WizardDialog>
  )
}

const orderScopes = ["Open", "All"] as const
type OrderScope = (typeof orderScopes)[number]

/** How far through its lines an order already is, as a single readable fraction. */
function orderProgress(order: WarehouseOperationalOrder) {
  const ordered = order.lines.reduce((total, line) => total + line.orderedQuantity, 0)
  if (ordered <= 0) return null
  const done = order.lines.reduce((total, line) => total + (order.typeCode === "inbound" ? line.receivedQuantity : line.dispatchedQuantity), 0)
  return Math.max(0, Math.min(1, done / ordered))
}

export function WarehouseOrdersManagementView({ typeFilter, isCustomer = false, canCreateInbound = true, canCreateOutbound = true, navigate, registerRoute }: { typeFilter?: "inbound" | "outbound"; isCustomer?: boolean; canCreateInbound?: boolean; canCreateOutbound?: boolean; navigate?: (path: string) => void; registerRoute: string }) {
  const { language, t } = useLanguage()
  const dateOnly = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium" }), [language])
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  const percent = useMemo(() => new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }), [language])
  const [reference, setReference] = useState<WarehouseOrderReference | null>(null)
  const [facilities, setFacilities] = useState<WarehouseFacility[]>([])
  const [orders, setOrders] = useState<WarehouseOperationalOrder[] | null>(null)
  const [total, setTotal] = useState(0)
  const [statusFacets, setStatusFacets] = useState<string[]>([])
  const [offset, setOffset] = useState(0)
  const [warehouseOrderPageSize, setWarehouseOrderPageSize] = useState(defaultPaginationPageSize)
  const [sort, setSort] = useState<WarehouseRegisterSort | null>(null)
  const [facilityId, setFacilityId] = useState("")
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [committedSearch, setCommittedSearch] = useState(search)
  const [scope, setScope] = useState<OrderScope>("Open")
  const [statusFacet, setStatusFacet] = useState("")
  const [directionFacet, setDirectionFacet] = useState("")
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // Only the newest request writes, so a slow response for an earlier search term
  // can never replace the rows the operator is looking at now.
  const requestId = useRef(0)
  const referenceRequest = useRef<Promise<WarehouseOrderReference> | null>(null)
  const allowedTypes = useMemo<("inbound" | "outbound")[]>(() => [
    ...(canCreateInbound ? ["inbound" as const] : []),
    ...(canCreateOutbound ? ["outbound" as const] : []),
  ], [canCreateInbound, canCreateOutbound])
  const canCreate = typeFilter ? allowedTypes.includes(typeFilter) : allowedTypes.length > 0
  const createType = typeFilter ?? (allowedTypes.length === 1 ? allowedTypes[0] : undefined)

  const ensureReference = useCallback(async () => {
    if (reference) return reference
    if (!referenceRequest.current) {
      referenceRequest.current = getWarehouseOrderReference()
        .then((value) => { setReference(value); return value })
        .finally(() => { referenceRequest.current = null })
    }
    return await referenceRequest.current
  }, [reference])

  useEffect(() => {
    const openCreate = () => {
      if (!canCreate) return
      setCreateOpen(true)
      void ensureReference().catch((cause) => toast.error(errorMessage(cause)))
    }
    const stopListening = subscribeTopBarAction(topBarActionEvents.createWarehouseOrder, openCreate)

    if (new URLSearchParams(window.location.search).get("create") === "1") {
      openCreate()
      const url = new URL(window.location.href)
      url.searchParams.delete("create")
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    }

    return stopListening
  }, [canCreate, ensureReference])

  useEffect(() => {
    let live = true
    listWarehouseFacilitiesPage({ sort: { id: "name", direction: "asc" }, limit: 50, offset: 0 })
      .then((page) => { if (live) setFacilities(page.rows) })
      .catch(() => undefined)
    return () => { live = false }
  }, [])

  const refresh = useCallback(async function refresh() {
    const ticket = ++requestId.current
    setPending(true)
    try {
      const page = await listOperationalWarehouseOrdersPage({
        facilityId: facilityId || undefined,
        typeCode: typeFilter ?? (directionFacet || undefined),
        status: statusFacet || undefined,
        openOnly: scope === "Open",
        search: committedSearch.trim() || undefined,
        sort,
        limit: warehouseOrderPageSize,
        offset,
      })
      if (ticket !== requestId.current) return
      setOrders(page.rows); setTotal(page.total); setStatusFacets(page.facets); setError(null)
    } catch (cause) {
      if (ticket !== requestId.current) return
      setError(errorMessage(cause)); setOrders([]); setTotal(0); setStatusFacets([])
    } finally {
      if (ticket === requestId.current) setPending(false)
    }
  }, [facilityId, typeFilter, directionFacet, statusFacet, scope, committedSearch, sort, offset, warehouseOrderPageSize])

  useEffect(() => { void refresh() }, [refresh])

  // The live register revalidates while it is in use, so a separate refresh
  // control only adds noise to the operator's working row.
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const interval = window.setInterval(refreshWhenVisible, 30_000)
    window.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refresh])

  // Typing narrows what is already loaded on the same frame; the server is asked
  // once, after the operator stops, to widen the set beyond the current page.
  useEffect(() => {
    if (search === committedSearch) return
    const timer = window.setTimeout(() => { setCommittedSearch(search); setOffset(0) }, 320)
    return () => window.clearTimeout(timer)
  }, [search, committedSearch])

  const query = search.trim().toLowerCase()
  const loaded = orders !== null

  const visible = useMemo(() => (orders ?? []).filter((order) => (
    (!statusFacet || (order.statusName ?? order.statusCode) === statusFacet)
    && (!directionFacet || order.typeCode === directionFacet)
    && (!query || [order.orderNumber, order.customerReference, order.customerName, order.facilityName, order.facilityCode, order.vehicleReg, order.containerNumber, ...order.lines.map((line) => line.sku)]
      .filter(Boolean).join(" ").toLowerCase().includes(query))
  )), [orders, statusFacet, directionFacet, query])

  // The server returns facets from the whole filtered register, not only the
  // twenty rows currently visible.
  const statusOptions = useMemo(() => (
    statusFacets.map((value) => ({ value, label: value }))
  ), [statusFacets])

  useEffect(() => {
    if (statusFacet && !statusOptions.some((option) => option.value === statusFacet)) setStatusFacet("")
  }, [statusFacet, statusOptions])

  const columns = useMemo<DataTableColumn<WarehouseOperationalOrder>[]>(() => [
    { id: "order", label: "Order", width: 192, minWidth: 150, resizable: true, canHide: false, sortValue: (order) => order.orderNumber, cell: (order) => <div className="min-w-0"><span className="text-[12.5px] font-medium tabular-nums text-[var(--md-ink)]">{order.orderNumber}</span><p className="truncate text-[11px] text-[var(--md-subtle)]">{order.customerReference ?? t("No customer reference")}</p></div> },
    { id: "customer", label: "Customer", width: 200, resizable: true, sortValue: (order) => order.customerName, cell: (order) => <span className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{order.customerName}</span> },
    { id: "warehouse", label: "Warehouse", width: 176, resizable: true, sortValue: (order) => order.facilityName, cell: (order) => <div className="min-w-0"><span className="truncate text-[12.5px] text-[var(--md-ink)]">{order.facilityName}</span><p className="text-[11px] tabular-nums text-[var(--md-subtle)]">{order.facilityCode}</p></div> },
    // The direction column only earns its width on the combined queue. Goods in
    // and goods out already say which way the stock is moving in the page title.
    ...(typeFilter ? [] : [{ id: "direction", label: "Direction", kind: "attribute" as const, width: 136, resizable: true, sortValue: (order: WarehouseOperationalOrder) => order.typeName ?? order.typeCode, cell: (order: WarehouseOperationalOrder) => <StatusPill tone={order.typeCode === "inbound" ? "teal" : "blue"}>{t(order.typeName ?? order.typeCode)}</StatusPill> }]),
    { id: "lines", label: "Lines", width: 92, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.lines.length, cell: (order) => <span dir="ltr" className="tabular-nums">{order.lines.length}</span> },
    { id: "progress", label: typeFilter === "outbound" ? "Dispatched" : "Received", width: 132, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => orderProgress(order) ?? -1, cell: (order) => {
      const value = orderProgress(order)
      return value === null ? <span className="text-[12px] text-[var(--md-subtle)]">—</span> : <span dir="ltr" className={cn("tabular-nums text-[12px]", value >= 1 ? "font-medium text-[var(--md-green)]" : value > 0 ? "text-[var(--md-amber)]" : "text-[var(--md-text)]")}>{percent.format(value)}</span>
    } },
    { id: "requested", label: "Requested", width: 152, resizable: true, sortValue: (order) => order.requestedDate, cell: (order) => <span className="whitespace-nowrap text-[12px] text-[var(--md-text)]">{order.requestedDate ? dateOnly.format(new Date(`${order.requestedDate}T00:00:00`)) : "—"}</span> },
    { id: "appointment", label: "Slot", width: 176, resizable: true, sortValue: (order) => order.appointmentStartAt, cell: (order) => <span className="whitespace-nowrap text-[12px] text-[var(--md-text)]">{order.appointmentStartAt ? dateTime.format(new Date(order.appointmentStartAt)) : "—"}</span> },
    { id: "status", label: "Status", kind: "status", width: 152, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.statusName ?? order.statusCode, cell: (order) => <StatusPill tone={toneForStatus(order.statusCode)}>{t(order.statusName ?? order.statusCode)}</StatusPill> },
  ], [typeFilter, dateOnly, dateTime, percent, t])

  const hasFilters = Boolean(query || statusFacet || directionFacet || facilityId)
  const clearFilters = () => { setSearch(""); setCommittedSearch(""); setStatusFacet(""); setDirectionFacet(""); setFacilityId(""); setOffset(0) }

  const emptyState = error ? (
    <div className="mx-auto max-w-[380px]" role="alert">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Warehouse orders are unavailable")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{error}</p>
      <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => void refresh()}>
        <RefreshCw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
        {t("Try again")}
      </Button>
    </div>
  ) : !loaded ? (
    <DotGridLoaderPanel label="Loading warehouse orders" minHeight={0} />
  ) : hasFilters ? (
    <div className="mx-auto max-w-[380px]">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Nothing matches these filters")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(scope === "Open" ? "Widen the search, or switch to All to include finished orders." : "Widen the search or switch warehouse to see more.")}</p>
      <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={clearFilters}>{t("Clear filters")}</Button>
    </div>
  ) : (
    <div className="mx-auto max-w-[380px]">
      <Boxes className="mx-auto size-5 text-[var(--md-accent)]" strokeWidth={1.35} />
      <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t(scope === "Open" ? "Nothing open right now" : "No orders yet")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
        {t(typeFilter === "inbound" ? "Book a delivery in to receive it against a location and batch."
          : typeFilter === "outbound" ? "Place an order to pick and dispatch available stock."
          : "Orders appear here as the team books work in.")}
      </p>
    </div>
  )

  return <div className="grid gap-[var(--md-page-stack-gap)]">
    <DataTable
      ariaLabel={typeFilter === "inbound" ? "Goods in" : typeFilter === "outbound" ? "Goods out" : "Warehouse orders"}
      exportConfig={{ fileName: `warehouse-${typeFilter ?? "orders"}`, register: {
        dateLabel: "Order created date", dateValue: (row) => row.createdAt,
        busy: search.trim() !== committedSearch.trim(),
        loadAllRows: (signal) => collectExportPages((page) => listOperationalWarehouseOrdersPage({
          facilityId: facilityId || undefined, typeCode: typeFilter ?? (directionFacet || undefined),
          status: statusFacet || undefined, openOnly: scope === "Open", search: committedSearch.trim() || undefined, sort, ...page,
        }), (row) => row.id, signal),
      } }}
      columnsButtonLabel="Manage order columns"
      storageKey={`warehouse-orders-${typeFilter ?? "all"}`}
      columns={columns}
      rows={visible}
      getRowKey={(order) => order.id}
      onRowClick={(order) => navigate?.(`${orderDetailPath(order)}?from=${encodeURIComponent(registerRoute)}`)}
      rowClassName="hover:bg-[var(--md-hover)]"
      compactToolbar
      emptyState={emptyState}
      toolbarTabs={(
        <div className="flex min-w-0 items-center gap-2">
          {/* The switch changes what is fetched; the filters on the right narrow
              what came back. Two levels, so neither can contradict the other. */}
          <RegisterViewSwitch
            options={orderScopes}
            value={scope}
            onChange={(value) => { setScope(value); setOffset(0) }}
            counts={{ [scope]: total } as Partial<Record<OrderScope, number>>}
            ariaLabel="Order scope"
            compact
          />
        </div>
      )}
      toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => { setSearch(""); setCommittedSearch(""); setOffset(0) }} label="Search orders" placeholder="Order, customer, SKU" className="sm:min-w-[136px] sm:w-[136px]" />}
      toolbarFilters={(
        <>
          {typeFilter ? null : (
            <RegisterFacetSelect
              label="Direction"
              allLabel="Both directions"
              value={directionFacet}
              options={allOrderTypes.map((type) => ({ value: type, label: type === "inbound" ? "Inbound" : "Outbound" }))}
              onChange={(value) => { setDirectionFacet(value); setOffset(0) }}
              className="w-[108px] sm:w-[108px]"
            />
          )}
          <RegisterFacetSelect
            label="Status"
            allLabel="All statuses"
            value={statusFacet}
            options={statusOptions}
            onChange={(value) => { setStatusFacet(value); setOffset(0) }}
            className="w-[120px] sm:w-[120px]"
          />
          <RegisterFacetSelect
            label="Warehouse"
            allLabel="All warehouses"
            value={facilityId}
            options={facilities.map((facility) => ({ value: facility.id, label: facility.name }))}
            onChange={(value) => { setFacilityId(value); setOffset(0) }}
            className="w-[132px] sm:w-[132px]"
          />
        </>
      )}
      toolbarOptions={<RegisterRevalidatingMark active={pending && loaded} />}
      serverSorting={{ value: sort, onChange: (value) => { setSort(value); setOffset(0) } }}
      pagination={{ offset, limit: warehouseOrderPageSize, total, loading: pending, onOffsetChange: setOffset, onLimitChange: setWarehouseOrderPageSize, error: Boolean(error) }}
    />
    <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} reference={reference} fixedType={createType} allowedTypes={allowedTypes} isCustomer={isCustomer} onSaved={() => void refresh()} />
  </div>
}
