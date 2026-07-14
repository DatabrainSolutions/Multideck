import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Boxes, Loader2, Plus, RefreshCw, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WarehouseFormField } from "@/components/multideck/warehouse-management-components"
import { WarehouseInventoryTable } from "@/components/multideck/warehouse-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { FilterChips } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import {
  WarehouseApiError,
  cancelOperationalWarehouseOrder,
  createOperationalWarehouseOrder,
  dispatchOperationalWarehouseOrder,
  getWarehouseOrderReference,
  listOperationalWarehouseOrders,
  listWarehouseInventory,
  listWarehouseInventoryMovements,
  receiveOperationalWarehouseOrder,
  type CreateWarehouseOrderInput,
  type DispatchWarehouseOrderInput,
  type ReceiveWarehouseOrderInput,
  type WarehouseInventoryBalance,
  type WarehouseInventoryMovement,
  type WarehouseOperationalOrder,
  type WarehouseOrderReference,
} from "@/lib/warehouse-api"

const controlClass = "h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
const allValue = "__all__"

function errorMessage(error: unknown) {
  return error instanceof WarehouseApiError ? error.message : error instanceof Error ? error.message : String(error)
}

function Code({ children }: { children: React.ReactNode }) {
  return <span data-i18n-skip dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{children}</span>
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
        listWarehouseInventoryMovements({ facilityId: facilityId || undefined, take: 150 }),
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

  useEffect(() => { void refresh() }, [facilityId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleBalances = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return balances ?? []
    return (balances ?? []).filter((row) => [row.sku, row.itemDescription, row.locationCode, row.lotNumber, row.batchNumber, row.customerName].filter(Boolean).some((value) => value!.toLowerCase().includes(term)))
  }, [balances, search])

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-[15px] font-medium text-[var(--md-ink)]">Inventory and batches</h2><p className="mt-1 text-[13px] text-[var(--md-text)]">Live stock by warehouse, location, item, lot, and batch.</p></div>
        <div className="flex flex-wrap gap-2"><FacilityFilter reference={reference} value={facilityId} onChange={setFacilityId} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, batch, location..." className={`${controlClass} min-w-[240px]`} /><Button variant="ghost" size="icon" onClick={() => void refresh()} className="size-10 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><RefreshCw className="size-4" /></Button></div>
      </div>
      <FilterChips options={["Stock balances", "Movement history"]} activeOption={mode} onChange={setMode} />
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

function blankLine(reference: WarehouseOrderReference | null, facilityId: string, customerOrgId: string): DraftLine {
  const item = reference?.items.find((candidate) => candidate.facilityId === facilityId && candidate.customerOrgId === customerOrgId)
  const location = reference?.locations.find((candidate) => candidate.facilityId === facilityId)
  return { key: crypto.randomUUID(), itemId: item?.id ?? "", quantity: "1", lotNumber: "", expiryDate: "", locationId: location?.id ?? "", customsStatusCode: reference?.customsStatuses[0]?.code ?? "free_circulation" }
}

function CreateOrderDialog({ open, onOpenChange, reference, fixedType, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; fixedType?: "inbound" | "outbound"; onSaved: () => void }) {
  const firstFacility = reference?.facilities[0]?.id ?? ""
  const firstCustomer = reference?.customers[0]?.id ?? ""
  const [form, setForm] = useState<OrderForm>(() => ({ facilityId: firstFacility, customerOrgId: firstCustomer, typeCode: fixedType ?? "inbound", customerReference: "", requestedDate: "", appointmentStartAt: "", vehicleReg: "", containerNumber: "", sealNumber: "", instructions: "", lines: [blankLine(reference, firstFacility, firstCustomer)] }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const facilityId = reference?.facilities[0]?.id ?? ""
    const customerOrgId = reference?.customers[0]?.id ?? ""
    setForm({ facilityId, customerOrgId, typeCode: fixedType ?? "inbound", customerReference: "", requestedDate: "", appointmentStartAt: "", vehicleReg: "", containerNumber: "", sealNumber: "", instructions: "", lines: [blankLine(reference, facilityId, customerOrgId)] })
    setError(null)
  }, [open, reference, fixedType])

  const availableItems = reference?.items.filter((item) => item.facilityId === form.facilityId && item.customerOrgId === form.customerOrgId) ?? []
  const availableLocations = reference?.locations.filter((location) => location.facilityId === form.facilityId) ?? []
  function patchForm(patch: Partial<OrderForm>) { setForm((current) => ({ ...current, ...patch })) }
  function patchLine(key: string, patch: Partial<DraftLine>) { setForm((current) => ({ ...current, lines: current.lines.map((line) => line.key === key ? { ...line, ...patch } : line) })) }
  function resetLines(facilityId: string, customerOrgId: string) { patchForm({ facilityId, customerOrgId, lines: [blankLine(reference, facilityId, customerOrgId)] }) }

  async function submit() {
    setSaving(true); setError(null)
    try {
      const payload: CreateWarehouseOrderInput = {
        facilityId: form.facilityId, customerOrgId: form.customerOrgId, typeCode: form.typeCode, priorityCode: "normal",
        customerReference: form.customerReference.trim() || null, requestedDate: form.requestedDate || null,
        appointmentStartAt: form.appointmentStartAt ? new Date(form.appointmentStartAt).toISOString() : null, appointmentEndAt: null,
        vehicleReg: form.vehicleReg.trim() || null, containerNumber: form.containerNumber.trim() || null, sealNumber: form.sealNumber.trim() || null, instructions: form.instructions.trim() || null,
        lines: form.lines.map((line) => {
          const item = reference?.items.find((candidate) => candidate.id === line.itemId)
          return { itemId: line.itemId, quantity: Number(line.quantity), uomCode: item?.uomCode ?? null, lotNumber: line.lotNumber.trim() || null, expiryDate: line.expiryDate || null, sourceLocationId: form.typeCode === "outbound" ? line.locationId || null : null, targetLocationId: form.typeCode === "inbound" ? line.locationId || null : null, customsStatusCode: line.customsStatusCode || null, goodsValue: null, currencyCode: null, instructions: null }
        }),
      }
      await createOperationalWarehouseOrder(payload)
      toast.success(form.typeCode === "inbound" ? "Inbound booking created" : "Outbound order placed")
      onOpenChange(false); onSaved()
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-[var(--md-surface)] p-0 sm:max-w-[880px]">
        <DialogHeader className="px-6 pt-6"><DialogTitle>{form.typeCode === "inbound" ? "Book goods in" : "Place goods-out order"}</DialogTitle><DialogDescription>Create the order now, then post the physical receipt or dispatch when warehouse work is complete.</DialogDescription></DialogHeader>
        <div className="grid gap-5 px-6 py-5">
          {error ? <div className="rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] text-[var(--md-red)]">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <WarehouseFormField label="Warehouse" required><Select value={form.facilityId} onValueChange={(value) => resetLines(value, form.customerOrgId)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            <WarehouseFormField label="Customer" required><Select value={form.customerOrgId} onValueChange={(value) => resetLines(form.facilityId, value)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
            {!fixedType ? <WarehouseFormField label="Direction" required><Select value={form.typeCode} onValueChange={(value) => patchForm({ typeCode: value as "inbound" | "outbound" })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inbound">Inbound receipt</SelectItem><SelectItem value="outbound">Outbound release</SelectItem></SelectContent></Select></WarehouseFormField> : <WarehouseFormField label="Direction"><div className={`${controlClass} flex items-center`}>{form.typeCode === "inbound" ? "Inbound receipt" : "Outbound release"}</div></WarehouseFormField>}
            <WarehouseFormField label="Customer reference"><Input value={form.customerReference} onChange={(event) => patchForm({ customerReference: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Requested date"><Input type="date" value={form.requestedDate} onChange={(event) => patchForm({ requestedDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
            <WarehouseFormField label="Appointment"><Input type="datetime-local" value={form.appointmentStartAt} onChange={(event) => patchForm({ appointmentStartAt: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">Order lines</p><p className="text-[11.5px] text-[var(--md-subtle)]">Choose the item, quantity, batch requirement, and warehouse location.</p></div><Button variant="ghost" onClick={() => patchForm({ lines: [...form.lines, blankLine(reference, form.facilityId, form.customerOrgId)] })} className="h-9 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><Plus className="size-4" />Add line</Button></div>
            {form.lines.map((line, index) => {
              const item = availableItems.find((candidate) => candidate.id === line.itemId)
              return <div key={line.key} className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)] md:grid-cols-12">
                <WarehouseFormField label={`Item ${index + 1}`} required className="md:col-span-4"><Select value={line.itemId} onValueChange={(value) => patchLine(line.key, { itemId: value })}><SelectTrigger className={controlClass}><SelectValue placeholder="Choose item" /></SelectTrigger><SelectContent>{availableItems.map((option) => <SelectItem key={option.id} value={option.id}>{option.sku} · {option.description}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
                <WarehouseFormField label="Quantity" required className="md:col-span-2"><Input type="number" min="0.000001" step="0.001" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                <WarehouseFormField label={form.typeCode === "inbound" ? "Target location" : "Source location"} required className="md:col-span-3"><Select value={line.locationId} onValueChange={(value) => patchLine(line.key, { locationId: value })}><SelectTrigger className={controlClass}><SelectValue placeholder="Choose location" /></SelectTrigger><SelectContent>{availableLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
                <WarehouseFormField label="Customs" className="md:col-span-3"><Select value={line.customsStatusCode} onValueChange={(value) => patchLine(line.key, { customsStatusCode: value })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.customsStatuses.map((status) => <SelectItem key={status.code} value={status.code}>{status.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
                <WarehouseFormField label={item?.requiresLot ? "Lot / batch (required at receipt)" : "Lot / batch"} className="md:col-span-5"><Input value={line.lotNumber} onChange={(event) => patchLine(line.key, { lotNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                <WarehouseFormField label={item?.requiresExpiry ? "Expiry (required at receipt)" : "Expiry"} className="md:col-span-4"><Input type="date" value={line.expiryDate} onChange={(event) => patchLine(line.key, { expiryDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                <div className="flex items-end justify-end md:col-span-3"><Button variant="ghost" size="icon" disabled={form.lines.length === 1} onClick={() => patchForm({ lines: form.lines.filter((candidate) => candidate.key !== line.key) })} className="size-10 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button></div>
              </div>
            })}
            {availableItems.length === 0 ? <p className="text-[12px] text-[var(--md-red)]">No active items are assigned to this customer and warehouse.</p> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-3"><WarehouseFormField label="Vehicle registration"><Input value={form.vehicleReg} onChange={(event) => patchForm({ vehicleReg: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Container"><Input value={form.containerNumber} onChange={(event) => patchForm({ containerNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Seal"><Input value={form.sealNumber} onChange={(event) => patchForm({ sealNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField></div>
          <WarehouseFormField label="Instructions"><Textarea value={form.instructions} onChange={(event) => patchForm({ instructions: event.target.value })} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></WarehouseFormField>
        </div>
        <DialogFooter className="px-6 py-4 shadow-[var(--md-stroke-top)]"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={saving || !form.facilityId || !form.customerOrgId || form.lines.some((line) => !line.itemId || Number(line.quantity) <= 0 || !line.locationId)} onClick={() => void submit()} className="bg-[var(--md-accent)] text-white">{saving ? <Loader2 className="size-4 animate-spin" /> : null}{form.typeCode === "inbound" ? "Create inbound booking" : "Place outbound order"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type PostingRow = { orderLineId: string; quantity: string; damagedQuantity: string; locationId: string; lotId: string; lotNumber: string; batchNumber: string; manufactureDate: string; expiryDate: string }

function OrderActionDialog({ order, open, onOpenChange, reference, onChanged }: { order: WarehouseOperationalOrder | null; open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; onChanged: () => void }) {
  const [rows, setRows] = useState<PostingRow[]>([])
  const [stock, setStock] = useState<WarehouseInventoryBalance[]>([])
  const [notes, setNotes] = useState("")
  const [vehicleReg, setVehicleReg] = useState("")
  const [containerNumber, setContainerNumber] = useState("")
  const [sealNumber, setSealNumber] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !order) return
    setRows(order.lines.filter((line) => line.remainingQuantity > 0).map((line) => ({ orderLineId: line.id, quantity: String(line.remainingQuantity), damagedQuantity: "0", locationId: (order.typeCode === "inbound" ? line.targetLocationId : line.sourceLocationId) ?? "", lotId: "", lotNumber: line.lotNumber ?? "", batchNumber: line.lotNumber ?? "", manufactureDate: "", expiryDate: line.expiryDate ?? "" })))
    setNotes(""); setVehicleReg(order.vehicleReg ?? ""); setContainerNumber(order.containerNumber ?? ""); setSealNumber(order.sealNumber ?? ""); setError(null)
    if (order.typeCode === "outbound") listWarehouseInventory({ facilityId: order.facilityId }).then(setStock).catch(() => setStock([]))
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

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-[var(--md-surface)] p-0 sm:max-w-[820px]">
    <DialogHeader className="px-6 pt-6"><div className="flex items-center gap-2"><DialogTitle><Code>{order.orderNumber}</Code></DialogTitle><StatusPill tone={toneForStatus(order.statusCode)}>{order.statusName ?? order.statusCode}</StatusPill></div><DialogDescription>{order.customerName} · {order.facilityName} · {order.typeName ?? order.typeCode}</DialogDescription></DialogHeader>
    <div className="grid gap-5 px-6 py-5">
      {error ? <div className="rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] text-[var(--md-red)]">{error}</div> : null}
      <div className="grid gap-2">{order.lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-[var(--md-radius-lg)] bg-white/45 px-3 py-2.5 shadow-[var(--md-shadow-line)]"><div><Code>{line.sku}</Code><p className="mt-1 text-[12px] text-[var(--md-text)]">{line.description}</p></div><div className="text-end"><p dir="ltr" className="text-[12px] font-medium tabular-nums">{line.remainingQuantity} / {line.orderedQuantity} {line.uomCode} remaining</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{line.statusCode}</p></div></div>)}</div>
      {!final && rows.length ? <div className="grid gap-3"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{order.typeCode === "inbound" ? "Post goods receipt" : "Post goods dispatch"}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">Quantities post directly to the immutable inventory ledger and current balances.</p></div>{rows.map((row) => {
        const line = order.lines.find((candidate) => candidate.id === row.orderLineId)!
        const lots = stock.filter((balance) => balance.itemId === line.itemId && balance.availableQuantity > 0)
        return <div key={row.orderLineId} className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/36 p-4 shadow-[var(--md-shadow-line)] md:grid-cols-12"><div className="md:col-span-12"><Code>{line.sku}</Code></div>
          <WarehouseFormField label="Quantity" required className="md:col-span-3"><Input type="number" min="0.000001" max={line.remainingQuantity} step="0.001" value={row.quantity} onChange={(event) => patchRow(row.orderLineId, { quantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
          {order.typeCode === "inbound" ? <><WarehouseFormField label="Damaged" className="md:col-span-3"><Input type="number" min="0" max={row.quantity} step="0.001" value={row.damagedQuantity} onChange={(event) => patchRow(row.orderLineId, { damagedQuantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Target location" required className="md:col-span-3"><Select value={row.locationId} onValueChange={(value) => patchRow(row.orderLineId, { locationId: value })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select></WarehouseFormField><WarehouseFormField label="Lot number" className="md:col-span-3"><Input value={row.lotNumber} onChange={(event) => patchRow(row.orderLineId, { lotNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Batch number" className="md:col-span-4"><Input value={row.batchNumber} onChange={(event) => patchRow(row.orderLineId, { batchNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Manufactured" className="md:col-span-4"><Input type="date" value={row.manufactureDate} onChange={(event) => patchRow(row.orderLineId, { manufactureDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Expiry" className="md:col-span-4"><Input type="date" value={row.expiryDate} onChange={(event) => patchRow(row.orderLineId, { expiryDate: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField></> : <><WarehouseFormField label="Source location" className="md:col-span-4"><Select value={row.locationId || allValue} onValueChange={(value) => patchRow(row.orderLineId, { locationId: value === allValue ? "" : value, lotId: "" })}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={allValue}>Automatic FIFO</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select></WarehouseFormField><WarehouseFormField label="Batch / lot" className="md:col-span-5"><Select value={row.lotId || allValue} onValueChange={(value) => { const selected = lots.find((lot) => lot.lotId === value); patchRow(row.orderLineId, { lotId: value === allValue ? "" : value, locationId: selected?.locationId ?? row.locationId }) }}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={allValue}>Automatic FIFO</SelectItem>{lots.filter((lot, index) => lot.lotId && lots.findIndex((candidate) => candidate.lotId === lot.lotId) === index).map((lot) => <SelectItem key={lot.lotId!} value={lot.lotId!}>{lot.batchNumber ?? lot.lotNumber} · {lot.availableQuantity} {lot.uomCode}</SelectItem>)}</SelectContent></Select></WarehouseFormField></>}
        </div>
      })}</div> : null}
      {order.typeCode === "outbound" && !final ? <div className="grid gap-3 md:grid-cols-3"><WarehouseFormField label="Vehicle"><Input value={vehicleReg} onChange={(event) => setVehicleReg(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Container"><Input value={containerNumber} onChange={(event) => setContainerNumber(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField><WarehouseFormField label="Seal"><Input value={sealNumber} onChange={(event) => setSealNumber(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField></div> : null}
      {!final ? <WarehouseFormField label="Posting notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></WarehouseFormField> : null}
      {order.receipts.length ? <div><p className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">Goods receipts</p>{order.receipts.map((receipt) => <p key={receipt.id} className="text-[12px] text-[var(--md-text)]"><Code>{receipt.receiptNumber}</Code> · {receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleString() : receipt.statusCode}</p>)}</div> : null}
      {order.dispatches.length ? <div><p className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">Dispatches</p>{order.dispatches.map((dispatch) => <p key={dispatch.id} className="text-[12px] text-[var(--md-text)]"><Code>{dispatch.dispatchNumber}</Code> · {dispatch.dispatchedAt ? new Date(dispatch.dispatchedAt).toLocaleString() : dispatch.statusCode}</p>)}</div> : null}
    </div>
    <DialogFooter className="flex-row items-center justify-between px-6 py-4 shadow-[var(--md-stroke-top)]"><div>{!final && !order.lines.some((line) => line.receivedQuantity > 0 || line.dispatchedQuantity > 0) ? <Button variant="ghost" disabled={saving} onClick={() => void cancel()} className="text-[var(--md-red)]"><XCircle className="size-4" />Cancel order</Button> : null}</div><div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>{!final && rows.length ? <Button disabled={saving || rows.some((row) => Number(row.quantity) <= 0 || (order.typeCode === "inbound" && !row.locationId))} onClick={() => void post()} className="bg-[var(--md-accent)] text-white">{saving ? <Loader2 className="size-4 animate-spin" /> : order.typeCode === "inbound" ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}{order.typeCode === "inbound" ? "Receive goods" : "Dispatch goods"}</Button> : null}</div></DialogFooter>
  </DialogContent></Dialog>
}

export function WarehouseOrdersManagementView({ typeFilter }: { typeFilter?: "inbound" | "outbound" }) {
  const shouldReduceMotion = useReducedMotion()
  const { language } = useLanguage()
  const [reference, setReference] = useState<WarehouseOrderReference | null>(null)
  const [orders, setOrders] = useState<WarehouseOperationalOrder[] | null>(null)
  const [facilityId, setFacilityId] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("Open")
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<WarehouseOperationalOrder | null>(null)

  async function refresh() {
    setError(null)
    try {
      const [referenceData, list] = await Promise.all([reference ?? getWarehouseOrderReference(), listOperationalWarehouseOrders({ facilityId: facilityId || undefined, typeCode: typeFilter, search })])
      setReference(referenceData); setOrders(list)
      if (selected) setSelected(list.find((order) => order.id === selected.id) ?? null)
    } catch (cause) { setError(errorMessage(cause)); setOrders([]) }
  }
  useEffect(() => { void refresh() }, [facilityId, typeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (orders ?? []).filter((order) => (statusFilter === "All" || !["complete", "cancelled"].includes(order.statusCode)) && (!term || [order.orderNumber, order.customerName, order.customerReference, ...order.lines.map((line) => line.sku)].filter(Boolean).some((value) => value!.toLowerCase().includes(term))))
  }, [orders, search, statusFilter])

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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2><p className="mt-1 text-[13px] text-[var(--md-text)]">{meta}</p></div><div className="flex flex-wrap gap-2"><FacilityFilter reference={reference} value={facilityId} onChange={setFacilityId} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, SKU..." className={`${controlClass} min-w-[240px]`} /><Button onClick={() => setCreateOpen(true)} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-white"><Plus className="size-4" />{typeFilter === "inbound" ? "Book goods in" : typeFilter === "outbound" ? "Place goods-out order" : "New order"}</Button></div></div>
    <FilterChips options={["Open", "All"]} activeOption={statusFilter} onChange={setStatusFilter} />
    {error || orders === null || visible.length === 0 ? <EmptyState loading={orders === null && !error} error={error} empty={statusFilter === "Open" ? "No open warehouse orders" : "No warehouse orders yet"} onRetry={() => void refresh()} /> : <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}><WarehouseInventoryTable rows={visible} columns={columns} minWidth={1080} rowLabel="warehouse orders" onRowClick={(order) => setSelected(order)} rowDetailLabel={(order) => `Open warehouse order ${order.orderNumber}`} /></motion.div>}
    <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} reference={reference} fixedType={typeFilter} onSaved={() => void refresh()} />
    <OrderActionDialog order={selected} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }} reference={reference} onChanged={() => void refresh()} />
  </div>
}
