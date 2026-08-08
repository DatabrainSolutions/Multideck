import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Boxes, CheckCircle2, Download, FileArchive, FileImage, FileText, Loader2, Mail, Plus, RefreshCw, Trash2, Upload, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WarehouseFormField, warehouseDialogFooterClass, warehouseDialogHeaderClass } from "@/components/multideck/warehouse-management-components"
import { WizardDialog, WizardSaveNowButton, type WizardStep } from "@/components/multideck/wizard-dialog"
import { WarehouseInventoryTable } from "@/components/multideck/warehouse-components"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { orderDetailPath } from "@/components/multideck/warehouse-order-detail"
import { DotGridLoader, DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import {
  RegisterFacetSelect,
  RegisterSearchField,
  RegisterToolbarActions,
  RegisterViewSwitch,
} from "@/components/multideck/register-toolbar"
import { StatusPill } from "@/components/multideck/status-pill"
import { FilterChips } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import {
  WarehouseApiError,
  cancelOperationalWarehouseOrder,
  createOperationalWarehouseOrder,
  dispatchOperationalWarehouseOrder,
  downloadWarehouseOrderDocument,
  getWarehouseOrderReference,
  listOperationalWarehouseOrders,
  listWarehouseOrderDocuments,
  listWarehouseInventory,
  listWarehouseInventoryMovements,
  receiveOperationalWarehouseOrder,
  reviewWarehouseOrderDocument,
  uploadWarehouseOrderDocument,
  type CreateWarehouseOrderInput,
  type DispatchWarehouseOrderInput,
  type ReceiveWarehouseOrderInput,
  type WarehouseInventoryBalance,
  type WarehouseInventoryMovement,
  type WarehouseOperationalOrder,
  type WarehouseOrderDocument,
  type WarehouseOrderReference,
} from "@/lib/warehouse"

const controlClass = "!h-10 !w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 !px-3 !text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
const allValue = "__all__"
const allOrderTypes: ("inbound" | "outbound")[] = ["inbound", "outbound"]
const maxOrderDocumentBytes = 25 * 1024 * 1024

function errorMessage(error: unknown) {
  return error instanceof WarehouseApiError ? error.message : error instanceof Error ? error.message : String(error)
}

function Code({ children }: { children: React.ReactNode }) {
  return <span data-i18n-skip dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{children}</span>
}

function orderDocumentKind(document: WarehouseOrderDocument) {
  const name = (document.fileName ?? document.title).toLowerCase()
  const mimeType = document.mimeType?.toLowerCase() ?? ""
  if (mimeType === "message/rfc822" || mimeType === "application/vnd.ms-outlook" || /\.(eml|msg)$/.test(name)) return "email"
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.includes("zip") || /\.(zip|7z|rar)$/.test(name)) return "archive"
  return "file"
}

function formatOrderDocumentSize(bytes: number | null) {
  if (bytes === null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

// Full stock enquiry: each row is a location + item + lot/batch balance.
export function WarehouseInventoryView() {
  const shouldReduceMotion = useReducedMotion()
  const { language } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3 }), [language])
  const date = useMemo(() => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric" }), [language])
  const [reference, setReference] = useState<WarehouseOrderReference | null>(null)
  const [facilityId, setFacilityId] = useState("")
  const [mode, setMode] = useState("Stock balances")
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [balances, setBalances] = useState<WarehouseInventoryBalance[] | null>(null)
  const [movements, setMovements] = useState<WarehouseInventoryMovement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setError(null)
    try {
      const [referenceData, stockData, movementData] = await Promise.all([
        reference ?? getWarehouseOrderReference(),
        listWarehouseInventory({ facilityId: facilityId || undefined, search }),
        listWarehouseInventoryMovements({ facilityId: facilityId || undefined, search, take: 150 }),
      ])
      setReference(referenceData)
      setBalances(stockData)
      setMovements(movementData)
    } catch (cause) {
      setError(errorMessage(cause))
      setBalances([])
      setMovements([])
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 250)
    return () => window.clearTimeout(timer)
  }, [facilityId, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleBalances = balances ?? []

  const balanceColumns = [
    { key: "item", label: "Item", className: "min-w-[230px]", render: (row: WarehouseInventoryBalance) => <div><Code>{row.sku}</Code><p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{row.itemDescription}</p></div> },
    { key: "batch", label: "Batch / lot", className: "min-w-[150px]", render: (row: WarehouseInventoryBalance) => row.batchNumber || row.lotNumber ? <div><Code>{row.batchNumber ?? row.lotNumber}</Code>{row.batchNumber && row.lotNumber !== row.batchNumber ? <p className="mt-1"><Code>{row.lotNumber}</Code></p> : null}</div> : <span className="text-[var(--md-subtle)]">No batch</span> },
    { key: "location", label: "Location", render: (row: WarehouseInventoryBalance) => row.locationCode ? <Code>{row.locationCode}</Code> : <span className="text-[var(--md-subtle)]">Unassigned</span> },
    { key: "expiry", label: "Expiry", render: (row: WarehouseInventoryBalance) => <span className="text-[12px] text-[var(--md-text)]">{row.expiryDate ? date.format(new Date(`${row.expiryDate}T00:00:00`)) : "—"}</span> },
    { key: "status", label: "Status", render: (row: WarehouseInventoryBalance) => <StatusPill tone={toneForStatus(row.inventoryStatusCode)}>{row.inventoryStatusName ?? row.inventoryStatusCode}</StatusPill> },
    { key: "onHand", label: "On hand", align: "right" as const, render: (row: WarehouseInventoryBalance) => <span dir="ltr" className="tabular-nums text-[var(--md-ink)]">{number.format(row.onHandQuantity)} {row.uomCode}</span> },
    { key: "available", label: "Available", align: "right" as const, render: (row: WarehouseInventoryBalance) => <span dir="ltr" className="font-medium tabular-nums text-[var(--md-accent)]">{number.format(row.availableQuantity)}</span> },
  ]

  const movementColumns = [
    { key: "time", label: "Posted", className: "min-w-[140px]", render: (row: WarehouseInventoryMovement) => <span className="text-[12px] text-[var(--md-text)]">{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</span> },
    { key: "reference", label: "Reference", render: (row: WarehouseInventoryMovement) => row.reference ? <Code>{row.reference}</Code> : <span>—</span> },
    { key: "item", label: "Item", className: "min-w-[220px]", render: (row: WarehouseInventoryMovement) => <div><Code>{row.sku}</Code><p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{row.itemDescription}</p></div> },
    { key: "type", label: "Movement", render: (row: WarehouseInventoryMovement) => <StatusPill tone={row.typeCode === "receipt" ? "teal" : "blue"}>{row.typeName ?? row.typeCode}</StatusPill> },
    { key: "location", label: "Location", render: (row: WarehouseInventoryMovement) => <Code>{row.toLocationCode ?? row.fromLocationCode ?? "—"}</Code> },
    { key: "batch", label: "Batch", render: (row: WarehouseInventoryMovement) => <Code>{row.batchNumber ?? row.lotNumber ?? "—"}</Code> },
    { key: "quantity", label: "Quantity", align: "right" as const, render: (row: WarehouseInventoryMovement) => <span dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{row.typeCode === "dispatch" ? "−" : "+"}{number.format(row.quantity)} {row.uomCode}</span> },
  ]

  const rows = mode === "Stock balances" ? visibleBalances : movements ?? []
  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
        <div className="min-w-0 2xl:me-auto">
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Inventory and batches</h2>
          <p className="mt-1 text-[13px] text-[var(--md-text)] 2xl:whitespace-nowrap">Live stock by warehouse, location, item, lot, and batch.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 2xl:flex-nowrap">
          <FilterChips className="shrink-0 flex-nowrap" options={["Stock balances", "Movement history"]} activeOption={mode} onChange={setMode} />
          <FacilityFilter reference={reference} value={facilityId} onChange={setFacilityId} />
          <Input dir="auto" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, batch, location..." className={`${controlClass} min-w-[240px] sm:!w-80 2xl:shrink-0`} />
          <Button aria-label="Refresh inventory" title="Refresh inventory" variant="ghost" size="icon" onClick={() => void refresh()} className="size-10 shrink-0 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><RefreshCw className="size-4" /></Button>
        </div>
      </div>
      {error || balances === null || rows.length === 0 ? <EmptyState loading={balances === null && !error} error={error} empty={mode === "Stock balances" ? "No stock has been received yet" : "No inventory movements yet"} onRetry={() => void refresh()} /> : (
        <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}>
          {mode === "Stock balances" ? <WarehouseInventoryTable rows={visibleBalances} columns={balanceColumns} minWidth={1080} emptyHint="Stock appears here once an inbound order is booked in." /> : <WarehouseInventoryTable rows={movements ?? []} columns={movementColumns} minWidth={1080} emptyHint="Every move, status change and sample is logged here." />}
        </motion.div>
      )}
    </div>
  )
}

type DraftLine = { key: string; itemId: string; quantity: string; lotNumber: string; expiryDate: string; locationId: string; customsStatusCode: string }
type OrderForm = { facilityId: string; customerOrgId: string; typeCode: "inbound" | "outbound"; customerReference: string; requestedDate: string; appointmentStartAt: string; vehicleReg: string; containerNumber: string; sealNumber: string; instructions: string; lines: DraftLine[] }
type DraftLineAvailability = { available: number; uomCode: string }

function blankLine(reference: WarehouseOrderReference | null, facilityId: string, customerOrgId: string, typeCode: "inbound" | "outbound"): DraftLine {
  const item = reference?.items.find((candidate) => candidate.facilityId === facilityId && candidate.customerOrgId === customerOrgId)
  const location = reference?.locations.find((candidate) => candidate.facilityId === facilityId)
  return { key: crypto.randomUUID(), itemId: item?.id ?? "", quantity: item ? "1" : "", lotNumber: "", expiryDate: "", locationId: typeCode === "inbound" ? location?.id ?? "" : "", customsStatusCode: reference?.customsStatuses[0]?.code ?? "free_circulation" }
}

function calculateDraftLineAvailability(
  form: OrderForm,
  stock: readonly WarehouseInventoryBalance[],
  reference: WarehouseOrderReference | null,
) {
  const result: Record<string, DraftLineAvailability> = {}
  const remainingByBalanceId = new Map(stock.map((balance) => [balance.id, balance.availableQuantity]))
  const linesBySpecificity = [...form.lines].sort((first, second) => (
    Number(Boolean(second.locationId)) + Number(Boolean(second.lotNumber)) - Number(Boolean(first.locationId)) - Number(Boolean(first.lotNumber))
  ))

  for (const line of linesBySpecificity) {
    const item = reference?.items.find((candidate) => candidate.id === line.itemId)
    const eligible = stock.filter((balance) =>
      balance.facilityId === form.facilityId &&
      balance.customerOrgId === form.customerOrgId &&
      balance.itemId === line.itemId &&
      balance.inventoryStatusCode === "available" &&
      balance.customsStatusCode === line.customsStatusCode &&
      balance.uomCode === item?.uomCode &&
      (!line.locationId || balance.locationId === line.locationId) &&
      (!line.lotNumber.trim() || balance.lotNumber === line.lotNumber.trim()),
    )
    const available = eligible.reduce((total, balance) => total + (remainingByBalanceId.get(balance.id) ?? 0), 0)
    result[line.key] = { available, uomCode: item?.uomCode ?? "" }

    let quantityToAssign = Math.min(Math.max(Number(line.quantity) || 0, 0), available)
    for (const balance of eligible) {
      if (quantityToAssign <= 0) break
      const balanceAvailable = remainingByBalanceId.get(balance.id) ?? 0
      const assigned = Math.min(quantityToAssign, balanceAvailable)
      remainingByBalanceId.set(balance.id, balanceAvailable - assigned)
      quantityToAssign -= assigned
    }
  }

  return result
}

function CreateOrderDialog({ open, onOpenChange, reference, fixedType, allowedTypes = allOrderTypes, isCustomer = false, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; fixedType?: "inbound" | "outbound"; allowedTypes?: ("inbound" | "outbound")[]; isCustomer?: boolean; onSaved: () => void }) {
  const firstFacility = reference?.facilities[0]?.id ?? ""
  const firstCustomer = reference?.customers[0]?.id ?? ""
  const initialType = fixedType ?? allowedTypes[0] ?? "inbound"
  const [form, setForm] = useState<OrderForm>(() => ({ facilityId: firstFacility, customerOrgId: firstCustomer, typeCode: initialType, customerReference: "", requestedDate: "", appointmentStartAt: "", vehicleReg: "", containerNumber: "", sealNumber: "", instructions: "", lines: [blankLine(reference, firstFacility, firstCustomer, initialType)] }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stock, setStock] = useState<WarehouseInventoryBalance[] | null>(null)
  const [stockError, setStockError] = useState<string | null>(null)
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
  }, [open, reference, fixedType, allowedTypes])

  useEffect(() => {
    if (!open || form.typeCode !== "outbound" || !form.facilityId) {
      setStock([])
      setStockError(null)
      return
    }

    let cancelled = false
    setStock(null)
    setStockError(null)
    listWarehouseInventory({ facilityId: form.facilityId })
      .then((balances) => { if (!cancelled) setStock(balances) })
      .catch((cause) => {
        if (cancelled) return
        setStock([])
        setStockError(errorMessage(cause))
      })
    return () => { cancelled = true }
  }, [open, form.typeCode, form.facilityId])

  const availableItems = reference?.items.filter((item) => item.facilityId === form.facilityId && item.customerOrgId === form.customerOrgId) ?? []
  const availableLocations = reference?.locations.filter((location) => location.facilityId === form.facilityId) ?? []
  const lineAvailability = useMemo(() => calculateDraftLineAvailability(form, stock ?? [], reference), [form, stock, reference])
  const hasOutboundStockIssue = form.typeCode === "outbound" && (
    stock === null || Boolean(stockError) || form.lines.some((line) => Boolean(line.itemId) && Number(line.quantity) > (lineAvailability[line.key]?.available ?? 0))
  )
  function availableFor(itemId: string, locationId = "", customsStatusCode = "") {
    if (!itemId || form.typeCode !== "outbound" || stock === null) return null
    const item = availableItems.find((candidate) => candidate.id === itemId)
    return stock
      .filter((balance) =>
        balance.facilityId === form.facilityId &&
        balance.customerOrgId === form.customerOrgId &&
        balance.itemId === itemId &&
        balance.inventoryStatusCode === "available" &&
        balance.uomCode === item?.uomCode &&
        (!locationId || balance.locationId === locationId) &&
        (!customsStatusCode || balance.customsStatusCode === customsStatusCode),
      )
      .reduce((total, balance) => total + balance.availableQuantity, 0)
  }
  function patchForm(patch: Partial<OrderForm>) { setForm((current) => ({ ...current, ...patch })) }
  function patchLine(key: string, patch: Partial<DraftLine>) { setForm((current) => ({ ...current, lines: current.lines.map((line) => line.key === key ? { ...line, ...patch } : line) })) }
  function resetLines(facilityId: string, customerOrgId: string) { const line = blankLine(reference, facilityId, customerOrgId, form.typeCode); patchForm({ facilityId, customerOrgId, lines: [line] }); setActiveLineKey(line.key) }
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
          const item = reference?.items.find((candidate) => candidate.id === line.itemId)
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
      {error ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)]">{error}</div> : null}

      {section === "details" ? (
        <div className="grid content-start gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <WarehouseFormField label="Warehouse" required><Select value={form.facilityId} onValueChange={(value) => resetLines(value, form.customerOrgId)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            <WarehouseFormField label="Customer" required><Select value={form.customerOrgId} onValueChange={(value) => resetLines(form.facilityId, value)} disabled={isCustomer}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            {!fixedType && allowedTypes.length > 1 ? <WarehouseFormField label="Direction" required><Select value={form.typeCode} onValueChange={(value) => changeType(value as "inbound" | "outbound")}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{allowedTypes.includes("inbound") ? <SelectItem value="inbound">Inbound receipt</SelectItem> : null}{allowedTypes.includes("outbound") ? <SelectItem value="outbound">Outbound release</SelectItem> : null}</SelectContent></Select></WarehouseFormField> : <WarehouseFormField label="Direction"><div className={`${controlClass} flex items-center`}>{form.typeCode === "inbound" ? "Inbound receipt" : "Outbound release"}</div></WarehouseFormField>}
            <WarehouseFormField label="Customer reference"><Input value={form.customerReference} onChange={(event) => patchForm({ customerReference: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Requested date"><Input type="date" value={form.requestedDate} onChange={(event) => patchForm({ requestedDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Appointment"><Input type="datetime-local" value={form.appointmentStartAt} onChange={(event) => patchForm({ appointmentStartAt: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
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
              const quantityExceedsAvailability = form.typeCode === "outbound" && Boolean(line.itemId) && stock !== null && requestedQuantity > availability.available
              const quantityHint = form.typeCode !== "outbound" || !line.itemId
                ? undefined
                : stock === null
                  ? t("Checking available stock…")
                  : `${number.format(availability.available)} ${availability.uomCode} ${t(line.locationId ? "available at this location." : "available across the warehouse.")}`
              const quantityError = form.typeCode !== "outbound" || !line.itemId
                ? undefined
                : stockError
                  ? t("Available stock could not be checked.")
                  : quantityExceedsAvailability
                    ? `${t("Only")} ${number.format(availability.available)} ${availability.uomCode} ${t(line.locationId ? "available at this location." : "available across the warehouse.")}`
                    : undefined
              return <div key={line.key} className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)] md:grid-cols-12">
                <WarehouseFormField label={`Item ${index + 1}`} required className="md:col-span-5"><Select value={line.itemId} onValueChange={(value) => patchLine(line.key, { itemId: value, quantity: line.quantity || "1", locationId: form.typeCode === "outbound" ? "" : line.locationId })}><SelectTrigger className={controlClass}><SelectValue placeholder="Choose item" /></SelectTrigger><SelectContent>{availableItems.map((option) => {
                  const itemAvailable = availableFor(option.id, "", line.customsStatusCode)
                  return <SelectItem key={option.id} value={option.id} disabled={itemAvailable !== null && itemAvailable <= 0}>{option.sku} · {option.description}{itemAvailable === null ? "" : ` · ${number.format(itemAvailable)} ${option.uomCode} ${t("available")}`}</SelectItem>
                })}</SelectContent></Select></WarehouseFormField>
                <WarehouseFormField label="Quantity" required hint={quantityHint} error={quantityError} className="md:col-span-3"><Input type="number" min="0.000001" max={form.typeCode === "outbound" && line.itemId && stock !== null ? availability.available : undefined} step="0.001" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} disabled={!line.itemId} aria-invalid={Boolean(quantityError)} className={controlClass} dir="ltr" /></WarehouseFormField>
                {!isCustomer ? <WarehouseFormField label={form.typeCode === "inbound" ? "Target location" : "Source location"} required className="md:col-span-4"><Select value={line.locationId} onValueChange={(value) => patchLine(line.key, { locationId: value })} disabled={!line.itemId}><SelectTrigger className={controlClass}><SelectValue placeholder="Choose location" /></SelectTrigger><SelectContent>{availableLocations.map((location) => {
                  const locationAvailable = availableFor(line.itemId, location.id, line.customsStatusCode)
                  return <SelectItem key={location.id} value={location.id} disabled={locationAvailable !== null && locationAvailable <= 0}>{location.code}{locationAvailable === null ? "" : ` · ${number.format(locationAvailable)} ${item?.uomCode ?? ""} ${t("available")}`}</SelectItem>
                })}</SelectContent></Select></WarehouseFormField> : <div className="md:col-span-4 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a07)] px-3 py-2 text-[12px] leading-5 text-[var(--md-text)]">{t("Warehouse staff will assign the storage or picking location.")}</div>}
                <WarehouseFormField label="Customs" className="md:col-span-3"><Select value={line.customsStatusCode} onValueChange={(value) => patchLine(line.key, { customsStatusCode: value })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.customsStatuses.map((status) => <SelectItem key={status.code} value={status.code}>{status.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
                <WarehouseFormField label={item?.requiresLot ? "Lot / batch (required at receipt)" : "Lot / batch"} className="md:col-span-4"><Input value={line.lotNumber} onChange={(event) => patchLine(line.key, { lotNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                <WarehouseFormField label={item?.requiresExpiry ? "Expiry (required at receipt)" : "Expiry"} className="md:col-span-4"><Input type="date" value={line.expiryDate} onChange={(event) => patchLine(line.key, { expiryDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                <div className="flex items-end justify-end md:col-span-1"><Button variant="ghost" size="icon" disabled={form.lines.length === 1} onClick={() => removeLine(line.key)} className="size-10 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button></div>
              </div>
            })}
            {availableItems.length === 0 ? <p className="text-[12px] text-[var(--md-red)]">No active items are assigned to this customer and warehouse.</p> : null}
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
  const [orders, setOrders] = useState<WarehouseOperationalOrder[] | null>(null)
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
  const allowedTypes = useMemo<("inbound" | "outbound")[]>(() => [
    ...(canCreateInbound ? ["inbound" as const] : []),
    ...(canCreateOutbound ? ["outbound" as const] : []),
  ], [canCreateInbound, canCreateOutbound])
  const canCreate = typeFilter ? allowedTypes.includes(typeFilter) : allowedTypes.length > 0
  const createType = typeFilter ?? (allowedTypes.length === 1 ? allowedTypes[0] : undefined)

  useEffect(() => {
    const openCreate = () => {
      if (canCreate) setCreateOpen(true)
    }
    const stopListening = subscribeTopBarAction(topBarActionEvents.createWarehouseOrder, openCreate)

    if (new URLSearchParams(window.location.search).get("create") === "1") {
      openCreate()
      const url = new URL(window.location.href)
      url.searchParams.delete("create")
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    }

    return stopListening
  }, [canCreate])

  const refresh = useCallback(async function refresh() {
    const ticket = ++requestId.current
    setPending(true)
    try {
      const list = await listOperationalWarehouseOrders({
        facilityId: facilityId || undefined,
        typeCode: typeFilter,
        openOnly: scope === "Open",
        search: committedSearch.trim() || undefined,
      })
      if (ticket !== requestId.current) return
      setOrders(list); setError(null)
    } catch (cause) {
      if (ticket !== requestId.current) return
      setError(errorMessage(cause)); setOrders([])
    } finally {
      if (ticket === requestId.current) setPending(false)
    }
  }, [facilityId, typeFilter, scope, committedSearch])

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
    const timer = window.setTimeout(() => setCommittedSearch(search), 320)
    return () => window.clearTimeout(timer)
  }, [search, committedSearch])

  useEffect(() => {
    let live = true
    getWarehouseOrderReference().then((value) => { if (live) setReference(value) }).catch(() => undefined)
    return () => { live = false }
  }, [])

  const query = search.trim().toLowerCase()
  const loaded = orders !== null

  const visible = useMemo(() => (orders ?? []).filter((order) => (
    (!statusFacet || (order.statusName ?? order.statusCode) === statusFacet)
    && (!directionFacet || order.typeCode === directionFacet)
    && (!query || [order.orderNumber, order.customerReference, order.customerName, order.facilityName, order.facilityCode, order.vehicleReg, order.containerNumber, ...order.lines.map((line) => line.sku)]
      .filter(Boolean).join(" ").toLowerCase().includes(query))
  )), [orders, statusFacet, directionFacet, query])

  // Options come from the rows in hand, so a status can never be offered that
  // returns nothing.
  const statusOptions = useMemo(() => (
    [...new Set((orders ?? []).map((order) => order.statusName ?? order.statusCode))]
      .sort((first, second) => first.localeCompare(second))
      .map((value) => ({ value, label: value }))
  ), [orders])

  useEffect(() => {
    if (statusFacet && !statusOptions.some((option) => option.value === statusFacet)) setStatusFacet("")
  }, [statusFacet, statusOptions])

  const columns = useMemo<DataTableColumn<WarehouseOperationalOrder>[]>(() => [
    { id: "order", label: "Order", width: 192, minWidth: 150, resizable: true, canHide: false, sortValue: (order) => order.orderNumber, cell: (order) => <div className="min-w-0"><Code>{order.orderNumber}</Code><p className="truncate text-[11px] text-[var(--md-subtle)]">{order.customerReference ?? t("No customer reference")}</p></div> },
    { id: "customer", label: "Customer", width: 200, resizable: true, sortValue: (order) => order.customerName, cell: (order) => <span className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{order.customerName}</span> },
    { id: "warehouse", label: "Warehouse", width: 176, resizable: true, sortValue: (order) => order.facilityName, cell: (order) => <div className="min-w-0"><span className="truncate text-[12.5px] text-[var(--md-ink)]">{order.facilityName}</span><p><Code>{order.facilityCode}</Code></p></div> },
    // The direction column only earns its width on the combined queue. Goods in
    // and goods out already say which way the stock is moving in the page title.
    ...(typeFilter ? [] : [{ id: "direction", label: "Direction", width: 136, resizable: true, sortValue: (order: WarehouseOperationalOrder) => order.typeName ?? order.typeCode, cell: (order: WarehouseOperationalOrder) => <StatusPill tone={order.typeCode === "inbound" ? "teal" : "blue"}>{t(order.typeName ?? order.typeCode)}</StatusPill> }]),
    { id: "lines", label: "Lines", width: 92, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.lines.length, cell: (order) => <span dir="ltr" className="tabular-nums">{order.lines.length}</span> },
    { id: "progress", label: typeFilter === "outbound" ? "Dispatched" : "Received", width: 132, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => orderProgress(order) ?? -1, cell: (order) => {
      const value = orderProgress(order)
      return value === null ? <span className="text-[12px] text-[var(--md-subtle)]">—</span> : <span dir="ltr" className={cn("tabular-nums text-[12px]", value >= 1 ? "font-medium text-[var(--md-green)]" : value > 0 ? "text-[var(--md-amber)]" : "text-[var(--md-text)]")}>{percent.format(value)}</span>
    } },
    { id: "requested", label: "Requested", width: 152, resizable: true, sortValue: (order) => order.requestedDate, cell: (order) => <span className="whitespace-nowrap text-[12px] text-[var(--md-text)]">{order.requestedDate ? dateOnly.format(new Date(`${order.requestedDate}T00:00:00`)) : "—"}</span> },
    { id: "appointment", label: "Slot", width: 176, resizable: true, sortValue: (order) => order.appointmentStartAt, cell: (order) => <span className="whitespace-nowrap text-[12px] text-[var(--md-text)]">{order.appointmentStartAt ? dateTime.format(new Date(order.appointmentStartAt)) : "—"}</span> },
    { id: "status", label: "Status", width: 152, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.statusName ?? order.statusCode, cell: (order) => <StatusPill tone={toneForStatus(order.statusCode)}>{t(order.statusName ?? order.statusCode)}</StatusPill> },
  ], [typeFilter, dateOnly, dateTime, percent, t])

  const hasFilters = Boolean(query || statusFacet || directionFacet || facilityId)
  const clearFilters = () => { setSearch(""); setCommittedSearch(""); setStatusFacet(""); setDirectionFacet(""); setFacilityId("") }

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
      columnsButtonLabel="Manage order columns"
      storageKey={`warehouse-orders-${typeFilter ?? "all"}`}
      columns={columns}
      rows={visible}
      getRowKey={(order) => order.id}
      onRowClick={(order) => navigate?.(`${orderDetailPath(order)}?from=${encodeURIComponent(registerRoute)}`)}
      rowClassName="hover:bg-[var(--md-hover)]"
      compactToolbar
      emptyState={emptyState}
      toolbarLeading={(
        <div className="flex min-w-0 items-center gap-2">
          {/* The switch changes what is fetched; the filters on the right narrow
              what came back. Two levels, so neither can contradict the other. */}
          <RegisterViewSwitch
            options={orderScopes}
            value={scope}
            onChange={setScope}
            counts={{ [scope]: visible.length } as Partial<Record<OrderScope, number>>}
            ariaLabel="Order scope"
            compact
          />
        </div>
      )}
      toolbarActions={(
        <RegisterToolbarActions pending={pending && loaded}>
          {typeFilter ? null : (
            <RegisterFacetSelect
              label="Direction"
              allLabel="Both directions"
              value={directionFacet}
              options={allOrderTypes.map((type) => ({ value: type, label: type === "inbound" ? "Inbound" : "Outbound" }))}
              onChange={setDirectionFacet}
              className="w-[108px] sm:w-[108px]"
            />
          )}
          <RegisterFacetSelect
            label="Status"
            allLabel="All statuses"
            value={statusFacet}
            options={statusOptions}
            onChange={setStatusFacet}
            className="w-[120px] sm:w-[120px]"
          />
          <RegisterFacetSelect
            label="Warehouse"
            allLabel="All warehouses"
            value={facilityId}
            options={(reference?.facilities ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
            onChange={setFacilityId}
            className="w-[132px] sm:w-[132px]"
          />
          <RegisterSearchField
            value={search}
            onChange={setSearch}
            onClear={() => { setSearch(""); setCommittedSearch("") }}
            label="Search orders"
            placeholder="Order, customer, SKU"
            className="sm:min-w-[136px] sm:w-[136px]"
          />
        </RegisterToolbarActions>
      )}
    />
    <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} reference={reference} fixedType={createType} allowedTypes={allowedTypes} isCustomer={isCustomer} onSaved={() => void refresh()} />
  </div>
}
