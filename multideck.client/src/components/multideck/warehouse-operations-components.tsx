import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Boxes, CheckCircle2, Download, FileArchive, FileImage, FileText, Loader2, Mail, Plus, RefreshCw, Trash2, Upload, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WarehouseFormField, warehouseDialogFooterClass, warehouseDialogHeaderClass } from "@/components/multideck/warehouse-management-components"
import { WarehouseInventoryTable } from "@/components/multideck/warehouse-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { FilterChips } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"
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
} from "@/lib/warehouse-api"

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
  return (
    <div className="grid place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 py-14 text-center shadow-[var(--md-shadow-line)]">
      <span className="mb-3 grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        {loading ? <Loader2 className="size-5 animate-spin" /> : error ? <AlertCircle className="size-5" /> : <Boxes className="size-5" />}
      </span>
      <p className="text-[14px] font-medium text-[var(--md-ink)]">{loading ? "Loading warehouse data" : error ? "Warehouse data could not be loaded" : empty}</p>
      <p className="mt-1 max-w-[440px] text-[13px] leading-5 text-[var(--md-text)]">{error ?? (loading ? "Fetching the latest operational records." : "Operational records will appear here as work is posted.")}</p>
      {error ? <Button variant="ghost" onClick={onRetry} className="mt-4 h-9 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><RefreshCw className="size-4" />Retry</Button> : null}
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
  const [search, setSearch] = useState("")
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
          {mode === "Stock balances" ? <WarehouseInventoryTable rows={visibleBalances} columns={balanceColumns} minWidth={1080} rowLabel="stock balances" /> : <WarehouseInventoryTable rows={movements ?? []} columns={movementColumns} minWidth={1080} rowLabel="inventory movements" />}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-0 bg-[var(--md-surface)] p-0 sm:max-w-[880px]">
        <DialogHeader className={warehouseDialogHeaderClass}><DialogTitle>{form.typeCode === "inbound" ? "Book goods in" : "Place goods-out order"}</DialogTitle><DialogDescription>Create the order now, then post the physical receipt or dispatch when warehouse work is complete.</DialogDescription></DialogHeader>
        <Tabs value={section} onValueChange={setSection} className="h-[452px] gap-0">
          <TabsList variant="line" className="mx-6 mt-3 h-10 w-auto justify-start rounded-none bg-transparent p-0"><TabsTrigger value="details" className="h-10 flex-none px-3 text-[13px]">Order details</TabsTrigger><TabsTrigger value="lines" className="h-10 flex-none px-3 text-[13px]">Order lines ({form.lines.length})</TabsTrigger><TabsTrigger value="transport" className="h-10 flex-none px-3 text-[13px]">Transport &amp; notes</TabsTrigger></TabsList>
          {error ? <div className="mx-6 mt-3 rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] text-[var(--md-red)]">{error}</div> : null}
          <TabsContent value="details" className="min-h-0 px-6 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            <WarehouseFormField label="Warehouse" required><Select value={form.facilityId} onValueChange={(value) => resetLines(value, form.customerOrgId)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            <WarehouseFormField label="Customer" required><Select value={form.customerOrgId} onValueChange={(value) => resetLines(form.facilityId, value)} disabled={isCustomer}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            {!fixedType && allowedTypes.length > 1 ? <WarehouseFormField label="Direction" required><Select value={form.typeCode} onValueChange={(value) => changeType(value as "inbound" | "outbound")}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{allowedTypes.includes("inbound") ? <SelectItem value="inbound">Inbound receipt</SelectItem> : null}{allowedTypes.includes("outbound") ? <SelectItem value="outbound">Outbound release</SelectItem> : null}</SelectContent></Select></WarehouseFormField> : <WarehouseFormField label="Direction"><div className={`${controlClass} flex items-center`}>{form.typeCode === "inbound" ? "Inbound receipt" : "Outbound release"}</div></WarehouseFormField>}
            <WarehouseFormField label="Customer reference"><Input value={form.customerReference} onChange={(event) => patchForm({ customerReference: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Requested date"><Input type="date" value={form.requestedDate} onChange={(event) => patchForm({ requestedDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Appointment"><Input type="datetime-local" value={form.appointmentStartAt} onChange={(event) => patchForm({ appointmentStartAt: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
          </div>
          </TabsContent>
          <TabsContent value="lines" className="min-h-0 px-6 py-5">
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
          </TabsContent>
          <TabsContent value="transport" className="grid min-h-0 content-start gap-4 px-6 py-5">
          <div className="grid gap-3 md:grid-cols-3"><WarehouseFormField label="Vehicle registration"><Input value={form.vehicleReg} onChange={(event) => patchForm({ vehicleReg: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Container"><Input value={form.containerNumber} onChange={(event) => patchForm({ containerNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Seal"><Input value={form.sealNumber} onChange={(event) => patchForm({ sealNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField></div>
          <WarehouseFormField label="Instructions"><Textarea value={form.instructions} onChange={(event) => patchForm({ instructions: event.target.value })} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></WarehouseFormField>
          {isCustomer && form.typeCode === "inbound" ? <div className="rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)]"><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Invoice or inbound document")}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{t("Optional. Attach an Outlook email, PDF, Office document, image, archive, or other supporting file.")}</p><label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/68 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><Upload className="size-4" />{supportingFile ? <span dir="auto" className="max-w-[380px] truncate">{supportingFile.name}</span> : t("Choose file")}<input type="file" className="sr-only" onChange={(event) => setSupportingFile(event.target.files?.[0] ?? null)} /></label><p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Up to 25 MB per file.")}</p></div> : null}
          </TabsContent>
        </Tabs>
        <DialogFooter className={warehouseDialogFooterClass}><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={saving || hasOutboundStockIssue || !form.facilityId || !form.customerOrgId || form.lines.some((line) => !line.itemId || Number(line.quantity) <= 0 || (!isCustomer && !line.locationId))} onClick={() => void submit()} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving ? <Loader2 className="size-4 animate-spin" /> : null}{form.typeCode === "inbound" ? "Create inbound booking" : "Place outbound order"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type PostingRow = { orderLineId: string; quantity: string; damagedQuantity: string; locationId: string; lotId: string; lotNumber: string; batchNumber: string; manufactureDate: string; expiryDate: string }

function OrderActionDialog({ order, open, onOpenChange, reference, canOperate = true, canCancel = true, canUpload = true, onChanged }: { order: WarehouseOperationalOrder | null; open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; canOperate?: boolean; canCancel?: boolean; canUpload?: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<PostingRow[]>([])
  const [stock, setStock] = useState<WarehouseInventoryBalance[]>([])
  const [notes, setNotes] = useState("")
  const [vehicleReg, setVehicleReg] = useState("")
  const [containerNumber, setContainerNumber] = useState("")
  const [sealNumber, setSealNumber] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState("summary")
  const [activeRowId, setActiveRowId] = useState("")
  const [documents, setDocuments] = useState<WarehouseOrderDocument[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (!open || !order) return
    const postingRows = order.lines.filter((line) => line.remainingQuantity > 0).map((line) => ({ orderLineId: line.id, quantity: String(line.remainingQuantity), damagedQuantity: "0", locationId: (order.typeCode === "inbound" ? line.targetLocationId : line.sourceLocationId) ?? "", lotId: "", lotNumber: line.lotNumber ?? "", batchNumber: line.lotNumber ?? "", manufactureDate: "", expiryDate: line.expiryDate ?? "" }))
    setRows(postingRows)
    setSection("summary")
    setActiveRowId(postingRows[0]?.orderLineId ?? "")
    setNotes(""); setVehicleReg(order.vehicleReg ?? ""); setContainerNumber(order.containerNumber ?? ""); setSealNumber(order.sealNumber ?? ""); setError(null)
    if (order.typeCode === "outbound") listWarehouseInventory({ facilityId: order.facilityId }).then(setStock).catch(() => setStock([]))
    setDocuments(null)
    listWarehouseOrderDocuments(order.id).then(setDocuments).catch((cause) => { setDocuments([]); setError(errorMessage(cause)) })
  }, [open, order])

  if (!order) return null
  const final = ["complete", "cancelled"].includes(order.statusCode)
  const locations = reference?.locations.filter((location) => location.facilityId === order.facilityId) ?? []
  function patchRow(lineId: string, patch: Partial<PostingRow>) { setRows((current) => current.map((row) => row.orderLineId === lineId ? { ...row, ...patch } : row)) }

  async function post() {
    const currentOrder = order
    if (!currentOrder) return
    setSaving(true); setError(null)
    try {
      if (currentOrder.typeCode === "inbound") {
        const input: ReceiveWarehouseOrderInput = { receivingLocationId: null, notes: notes.trim() || null, lines: rows.map((row) => ({ orderLineId: row.orderLineId, quantity: Number(row.quantity), damagedQuantity: Number(row.damagedQuantity), targetLocationId: row.locationId || null, lotNumber: row.lotNumber.trim() || null, batchNumber: row.batchNumber.trim() || null, manufactureDate: row.manufactureDate || null, expiryDate: row.expiryDate || null })) }
        await receiveOperationalWarehouseOrder(currentOrder.id, input); toast.success("Goods received and stock updated")
      } else {
        const input: DispatchWarehouseOrderInput = { vehicleReg: vehicleReg.trim() || null, containerNumber: containerNumber.trim() || null, sealNumber: sealNumber.trim() || null, notes: notes.trim() || null, lines: rows.map((row) => ({ orderLineId: row.orderLineId, quantity: Number(row.quantity), sourceLocationId: row.locationId || null, lotId: row.lotId || null })) }
        await dispatchOperationalWarehouseOrder(currentOrder.id, input); toast.success("Goods dispatched and stock updated")
      }
      onOpenChange(false); onChanged()
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  async function cancel() {
    const currentOrder = order
    if (!currentOrder) return
    setSaving(true); setError(null)
    try { await cancelOperationalWarehouseOrder(currentOrder.id); toast.success("Warehouse order cancelled"); onOpenChange(false); onChanged() } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  async function upload(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (!files.length || !order) return
    setUploading(true); setError(null)
    try {
      const oversized = files.filter((file) => file.size > maxOrderDocumentBytes)
      const uploadable = files.filter((file) => file.size <= maxOrderDocumentBytes)
      let uploadedCount = 0
      let failedCount = oversized.length
      for (const file of uploadable) {
        try {
          await uploadWarehouseOrderDocument(order.id, file)
          uploadedCount += 1
        } catch {
          failedCount += 1
        }
      }
      setDocuments(await listWarehouseOrderDocuments(order.id))
      if (uploadedCount) toast.success(t(uploadedCount === 1 ? "Document uploaded for warehouse review" : "Files uploaded for warehouse review"), { description: `${uploadedCount} ${t(uploadedCount === 1 ? "file" : "files")}` })
      if (failedCount) setError(t("Some files could not be uploaded. Check that each file is no larger than 25 MB."))
    } catch (cause) { setError(errorMessage(cause)) } finally { setUploading(false) }
  }

  async function review(documentId: string, statusCode: "accepted" | "rejected") {
    if (!order) return
    setSaving(true); setError(null)
    try {
      await reviewWarehouseOrderDocument(order.id, documentId, statusCode)
      setDocuments(await listWarehouseOrderDocuments(order.id))
      toast.success(t(statusCode === "accepted" ? "Document accepted" : "Document rejected"))
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="overflow-hidden border-0 bg-[var(--md-surface)] p-0 sm:max-w-[860px]">
    <DialogHeader className={warehouseDialogHeaderClass}><div className="flex items-center gap-2"><DialogTitle><Code>{order.orderNumber}</Code></DialogTitle><StatusPill tone={toneForStatus(order.statusCode)}>{order.statusName ?? order.statusCode}</StatusPill></div><DialogDescription>{order.customerName} · {order.facilityName} · {order.typeName ?? order.typeCode}</DialogDescription></DialogHeader>
    <Tabs value={section} onValueChange={setSection} className="h-[512px] gap-0">
      <TabsList variant="line" className="mx-6 mt-3 h-10 w-auto justify-start rounded-none bg-transparent p-0"><TabsTrigger value="summary" className="h-10 flex-none px-3 text-[13px]">Order summary</TabsTrigger>{canOperate && !final && rows.length ? <TabsTrigger value="posting" className="h-10 flex-none px-3 text-[13px]">{order.typeCode === "inbound" ? "Receive goods" : "Dispatch goods"}</TabsTrigger> : null}<TabsTrigger value="documents" className="h-10 flex-none px-3 text-[13px]">{t("Documents")}</TabsTrigger><TabsTrigger value="history" className="h-10 flex-none px-3 text-[13px]">History</TabsTrigger></TabsList>
      {error ? <div className="mx-6 mt-3 rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] text-[var(--md-red)]">{error}</div> : null}
      <TabsContent value="summary" className="min-h-0 px-6 py-5">
      <div className="grid gap-2">{order.lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-[var(--md-radius-lg)] bg-white/45 px-3 py-2.5 shadow-[var(--md-shadow-line)]"><div><Code>{line.sku}</Code><p className="mt-1 text-[12px] text-[var(--md-text)]">{line.description}</p></div><div className="text-end"><p dir="ltr" className="text-[12px] font-medium tabular-nums">{line.remainingQuantity} / {line.orderedQuantity} {line.uomCode} remaining</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{line.statusCode}</p></div></div>)}</div>
      </TabsContent>
      <TabsContent value="posting" className="min-h-0 px-6 py-5">
      {!final && rows.length ? <div className="grid gap-3"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{order.typeCode === "inbound" ? "Post goods receipt" : "Post goods dispatch"}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">Quantities post directly to the immutable inventory ledger and current balances.</p></div><div className="flex gap-1.5 overflow-x-auto pb-1">{rows.map((row, index) => <button key={row.orderLineId} type="button" onClick={() => setActiveRowId(row.orderLineId)} className={`h-8 shrink-0 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium ${activeRowId === row.orderLineId ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" : "bg-white/48 text-[var(--md-text)] shadow-[var(--md-shadow-line)]"}`}>Item {index + 1}</button>)}</div>{rows.filter((row) => row.orderLineId === activeRowId).map((row) => {
        const line = order.lines.find((candidate) => candidate.id === row.orderLineId)!
        const lots = stock.filter((balance) => balance.itemId === line.itemId && balance.availableQuantity > 0)
        return <div key={row.orderLineId} className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)] md:grid-cols-12"><div className="md:col-span-12"><Code>{line.sku}</Code></div>
          <WarehouseFormField label="Quantity" required className="md:col-span-3"><Input type="number" min="0.000001" max={line.remainingQuantity} step="0.001" value={row.quantity} onChange={(event) => patchRow(row.orderLineId, { quantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
          {order.typeCode === "inbound" ? <><WarehouseFormField label="Damaged" className="md:col-span-3"><Input type="number" min="0" max={row.quantity} step="0.001" value={row.damagedQuantity} onChange={(event) => patchRow(row.orderLineId, { damagedQuantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Target location" required className="md:col-span-3"><Select value={row.locationId} onValueChange={(value) => patchRow(row.orderLineId, { locationId: value })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select></WarehouseFormField><WarehouseFormField label="Lot number" className="md:col-span-3"><Input value={row.lotNumber} onChange={(event) => patchRow(row.orderLineId, { lotNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Batch number" className="md:col-span-4"><Input value={row.batchNumber} onChange={(event) => patchRow(row.orderLineId, { batchNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Manufactured" className="md:col-span-4"><Input type="date" value={row.manufactureDate} onChange={(event) => patchRow(row.orderLineId, { manufactureDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Expiry" className="md:col-span-4"><Input type="date" value={row.expiryDate} onChange={(event) => patchRow(row.orderLineId, { expiryDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField></> : <><WarehouseFormField label="Source location" className="md:col-span-4"><Select value={row.locationId || allValue} onValueChange={(value) => patchRow(row.orderLineId, { locationId: value === allValue ? "" : value, lotId: "" })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={allValue}>Automatic FIFO</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select></WarehouseFormField><WarehouseFormField label="Batch / lot" className="md:col-span-5"><Select value={row.lotId || allValue} onValueChange={(value) => { const selected = lots.find((lot) => lot.lotId === value); patchRow(row.orderLineId, { lotId: value === allValue ? "" : value, locationId: selected?.locationId ?? row.locationId }) }}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={allValue}>Automatic FIFO</SelectItem>{lots.filter((lot, index) => lot.lotId && lots.findIndex((candidate) => candidate.lotId === lot.lotId) === index).map((lot) => <SelectItem key={lot.lotId!} value={lot.lotId!}>{lot.batchNumber ?? lot.lotNumber} · {lot.availableQuantity} {lot.uomCode}</SelectItem>)}</SelectContent></Select></WarehouseFormField></>}
        </div>
      })}</div> : null}
      {order.typeCode === "outbound" && !final ? <div className="grid gap-3 md:grid-cols-3"><WarehouseFormField label="Vehicle"><Input value={vehicleReg} onChange={(event) => setVehicleReg(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Container"><Input value={containerNumber} onChange={(event) => setContainerNumber(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Seal"><Input value={sealNumber} onChange={(event) => setSealNumber(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField></div> : null}
      {!final ? <WarehouseFormField label="Posting notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></WarehouseFormField> : null}
      </TabsContent>
      <TabsContent value="documents" className="grid min-h-0 content-start gap-4 overflow-y-auto px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Order files")}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{t("Attach Outlook emails, PDFs, Office documents, images, archives, or other supporting files.")}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Up to 25 MB per file.")}</p></div>
          {canUpload ? <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)]">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{t(uploading ? "Uploading…" : "Add files")}
            <input type="file" className="sr-only" multiple disabled={uploading} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = "" }} />
          </label> : null}
        </div>
        {documents === null ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Loading documents…")}</p> : documents.length ? <div className="grid gap-2">{documents.map((item) => { const kind = orderDocumentKind(item); const size = formatOrderDocumentSize(item.fileSizeBytes); return <div key={item.id} className="flex items-center gap-3 rounded-[var(--md-radius-lg)] bg-white/45 px-3 py-2.5 shadow-[var(--md-shadow-line)]">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">{kind === "email" ? <Mail className="size-4" /> : kind === "image" ? <FileImage className="size-4" /> : kind === "archive" ? <FileArchive className="size-4" /> : <FileText className="size-4" />}</span>
          <div className="min-w-0 flex-1"><p dir="auto" className="truncate text-[13px] font-medium text-[var(--md-ink)]">{item.fileName ?? item.title}</p><div className="mt-1 flex items-center gap-2"><StatusPill tone={item.statusCode === "accepted" ? "green" : item.statusCode === "rejected" ? "red" : "amber"}>{t(item.statusCode === "pending_review" ? "Pending warehouse review" : item.statusCode)}</StatusPill>{size ? <span dir="ltr" className="text-[11px] tabular-nums text-[var(--md-subtle)]">{size}</span> : null}</div></div>
          {canOperate && item.statusCode === "pending_review" ? <div className="flex gap-1"><Button type="button" variant="ghost" size="icon" disabled={saving} aria-label={t("Accept document")} onClick={() => void review(item.id, "accepted")} className="size-9 rounded-[var(--md-radius-lg)] text-[var(--md-accent)]"><CheckCircle2 className="size-4" /></Button><Button type="button" variant="ghost" size="icon" disabled={saving} aria-label={t("Reject document")} onClick={() => void review(item.id, "rejected")} className="size-9 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><XCircle className="size-4" /></Button></div> : null}
          <Button type="button" variant="ghost" size="icon" aria-label={t("Download document")} onClick={() => void downloadWarehouseOrderDocument(order.id, item).catch((cause) => setError(errorMessage(cause)))} className="size-9 rounded-[var(--md-radius-lg)]"><Download className="size-4" /></Button>
        </div> })}</div> : <div className="rounded-[var(--md-radius-lg)] bg-white/36 px-4 py-8 text-center text-[12px] text-[var(--md-subtle)]">{t("No files have been added to this order.")}</div>}
      </TabsContent>
      <TabsContent value="history" className="grid min-h-0 content-start gap-4 px-6 py-5">
      {order.receipts.length ? <div><p className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">Goods receipts</p>{order.receipts.map((receipt) => <p key={receipt.id} className="text-[12px] text-[var(--md-text)]"><Code>{receipt.receiptNumber}</Code> · {receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleString() : receipt.statusCode}</p>)}</div> : null}
      {order.dispatches.length ? <div><p className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">Dispatches</p>{order.dispatches.map((dispatch) => <p key={dispatch.id} className="text-[12px] text-[var(--md-text)]"><Code>{dispatch.dispatchNumber}</Code> · {dispatch.dispatchedAt ? new Date(dispatch.dispatchedAt).toLocaleString() : dispatch.statusCode}</p>)}</div> : null}
      {!order.receipts.length && !order.dispatches.length ? <p className="text-[13px] text-[var(--md-subtle)]">No warehouse activity has been posted yet.</p> : null}
      </TabsContent>
    </Tabs>
    <DialogFooter className={cn(warehouseDialogFooterClass, "flex-row items-center justify-between")}><div>{canCancel && !final && !order.lines.some((line) => line.receivedQuantity > 0 || line.dispatchedQuantity > 0) ? <Button variant="ghost" disabled={saving} onClick={() => void cancel()} className="text-[var(--md-red)]"><XCircle className="size-4" />Cancel order</Button> : null}</div><div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>{canOperate && !final && rows.length ? <Button disabled={saving || rows.some((row) => Number(row.quantity) <= 0 || (order.typeCode === "inbound" && !row.locationId))} onClick={() => void post()} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving ? <Loader2 className="size-4 animate-spin" /> : order.typeCode === "inbound" ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}{order.typeCode === "inbound" ? "Receive goods" : "Dispatch goods"}</Button> : null}</div></DialogFooter>
  </DialogContent></Dialog>
}

export function WarehouseOrdersManagementView({ typeFilter, isCustomer = false, canCreateInbound = true, canCreateOutbound = true, canCancel = true, canUpload = true }: { typeFilter?: "inbound" | "outbound"; isCustomer?: boolean; canCreateInbound?: boolean; canCreateOutbound?: boolean; canCancel?: boolean; canUpload?: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const { language } = useLanguage()
  const [reference, setReference] = useState<WarehouseOrderReference | null>(null)
  const [orders, setOrders] = useState<WarehouseOperationalOrder[] | null>(null)
  const [facilityId, setFacilityId] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("__open__")
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<WarehouseOperationalOrder | null>(null)
  const allowedTypes = useMemo<("inbound" | "outbound")[]>(() => [
    ...(canCreateInbound ? ["inbound" as const] : []),
    ...(canCreateOutbound ? ["outbound" as const] : []),
  ], [canCreateInbound, canCreateOutbound])
  const canCreate = typeFilter ? allowedTypes.includes(typeFilter) : allowedTypes.length > 0
  const createType = typeFilter ?? (allowedTypes.length === 1 ? allowedTypes[0] : undefined)

  async function refresh() {
    setError(null)
    try {
      const [referenceData, list] = await Promise.all([reference ?? getWarehouseOrderReference(), listOperationalWarehouseOrders({
        facilityId: facilityId || undefined,
        typeCode: typeFilter,
        statusCode: !statusFilter.startsWith("__") ? statusFilter : undefined,
        openOnly: statusFilter === "__open__",
        search: search.trim() || undefined,
      })])
      setReference(referenceData); setOrders(list)
      if (selected) setSelected(list.find((order) => order.id === selected.id) ?? null)
    } catch (cause) { setError(errorMessage(cause)); setOrders([]) }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 250)
    return () => window.clearTimeout(timer)
  }, [facilityId, typeFilter, statusFilter, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    return orders ?? []
  }, [orders])

  const columns = [
    { key: "order", label: "Order", className: "min-w-[170px]", render: (order: WarehouseOperationalOrder) => <div><Code>{order.orderNumber}</Code><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{order.customerReference ?? "No customer reference"}</p></div> },
    { key: "customer", label: "Customer", className: "min-w-[190px]", render: (order: WarehouseOperationalOrder) => <span className="text-[13px] font-medium text-[var(--md-ink)]">{order.customerName}</span> },
    { key: "warehouse", label: "Warehouse", render: (order: WarehouseOperationalOrder) => <div><span className="text-[13px] text-[var(--md-ink)]">{order.facilityName}</span><p className="mt-1"><Code>{order.facilityCode}</Code></p></div> },
    { key: "direction", label: "Direction", render: (order: WarehouseOperationalOrder) => <StatusPill tone={order.typeCode === "inbound" ? "teal" : "blue"}>{order.typeName ?? order.typeCode}</StatusPill> },
    { key: "lines", label: "Lines", align: "center" as const, render: (order: WarehouseOperationalOrder) => <span className="tabular-nums">{order.lines.length}</span> },
    { key: "requested", label: "Requested", render: (order: WarehouseOperationalOrder) => <span className="text-[12px] text-[var(--md-text)]">{order.requestedDate ? new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(`${order.requestedDate}T00:00:00`)) : "—"}</span> },
    { key: "status", label: "Status", align: "right" as const, render: (order: WarehouseOperationalOrder) => <StatusPill tone={toneForStatus(order.statusCode)}>{order.statusName ?? order.statusCode}</StatusPill> },
  ]

  const title = typeFilter === "inbound" ? "Goods in" : typeFilter === "outbound" ? "Goods out" : "Warehouse orders"
  const meta = typeFilter === "inbound" ? "Book inbound deliveries and post goods receipts into a location and batch." : typeFilter === "outbound" ? "Place outbound orders and dispatch available stock using FIFO or a chosen batch." : "Manage every inbound and outbound warehouse order in one queue."
  return <div className="grid gap-[var(--md-page-stack-gap)]">
    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center"><div className="min-w-0 2xl:me-auto"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2><p className="mt-1 text-[13px] text-[var(--md-text)] 2xl:whitespace-nowrap">{meta}</p></div><div className="flex min-w-0 flex-wrap items-center gap-2 2xl:flex-nowrap"><FacilityFilter reference={reference} value={facilityId} onChange={setFacilityId} /><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="Status" className="h-10 min-w-[160px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__open__">Open statuses</SelectItem><SelectItem value="__all__">All statuses</SelectItem>{reference?.statuses.map((status) => <SelectItem key={status.code} value={status.code}>{status.name}</SelectItem>)}</SelectContent></Select><Input dir="auto" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, SKU..." className={`${controlClass} min-w-[240px] sm:!w-80 2xl:shrink-0`} />{canCreate ? <Button onClick={() => setCreateOpen(true)} className="h-10 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)]"><Plus className="size-4" />{createType === "inbound" ? "Book goods in" : createType === "outbound" ? "Place goods-out order" : "New order"}</Button> : null}</div></div>
    {error || orders === null || visible.length === 0 ? <EmptyState loading={orders === null && !error} error={error} empty={statusFilter === "__open__" ? "No open warehouse orders" : "No warehouse orders match these filters"} onRetry={() => void refresh()} /> : <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}><WarehouseInventoryTable rows={visible} columns={columns} minWidth={1080} rowLabel="warehouse orders" onRowClick={(order) => setSelected(order)} rowDetailLabel={(order) => `Open warehouse order ${order.orderNumber}`} /></motion.div>}
    <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} reference={reference} fixedType={createType} allowedTypes={allowedTypes} isCustomer={isCustomer} onSaved={() => void refresh()} />
    <OrderActionDialog order={selected} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }} reference={reference} canOperate={!isCustomer} canCancel={canCancel} canUpload={canUpload} onChanged={() => void refresh()} />
  </div>
}
