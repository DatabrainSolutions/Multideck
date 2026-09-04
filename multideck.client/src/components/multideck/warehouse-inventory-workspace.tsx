import { defaultPaginationPageSize } from "@/lib/pagination"
import { collectExportPages } from "@/lib/table-export"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, Boxes, Combine, FlaskConical, Loader2, MapPinOff, PackagePlus, RefreshCw, Route, ShieldAlert, type LucideIcon } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import {
  RegisterFacetSelect,
  RegisterRevalidatingMark,
  RegisterSearchField,
  RegisterViewSwitch,
} from "@/components/multideck/register-toolbar"
import { WarehouseFormField, warehouseDialogFooterClass, warehouseDialogHeaderClass } from "@/components/multideck/warehouse-management-components"
import { RecordDrawer } from "@/components/multideck/side-drawer"
import { FactCard, FactFigure, FactRow } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import {
  WarehouseApiError,
  changeWarehouseStockStatus,
  consolidateWarehouseHandlingUnits,
  createWarehouseHandlingUnit,
  getWarehouseHandlingUnit,
  getWarehouseHandlingUnitReference,
  getWarehouseOrderReference,
  getWarehouseStockSkuDetail,
  listWarehouseFacilitiesPage,
  listWarehouseHandlingUnitsPage,
  listWarehouseInventoryExceptionsPage,
  listWarehouseInventoryMovementsPage,
  listWarehouseStockSkusPage,
  listWarehouseOrderCustomersPage,
  listWarehouseOrderLocationsPage,
  moveWarehouseBalance,
  moveWarehouseHandlingUnit,
  recordWarehouseSample,
  reportWarehouseLocationEmpty,
  resolveWarehouseLocationException,
  type WarehouseHandlingUnit,
  type WarehouseHandlingUnitReference,
  type WarehouseFacility,
  type WarehouseInventoryBalance,
  type WarehouseInventoryException,
  type WarehouseInventoryMovement,
  type WarehouseOrderReference,
  type WarehouseRegisterSort,
  type WarehouseStockSkuDetail,
  type WarehouseStockSkuSummary,
} from "@/lib/warehouse"

const controlClass = "!h-10 !w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 !px-3 !text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
const noneValue = "__none__"

function message(error: unknown) {
  return error instanceof WarehouseApiError ? error.message : error instanceof Error ? error.message : String(error)
}

function Code({ children }: { children: React.ReactNode }) {
  return <span data-i18n-skip dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{children}</span>
}

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "teal" | "neutral" {
  if (status === "available" || status === "resolved") return "green"
  if (["damaged", "unlocated", "destroyed", "pending_approval"].includes(status)) return "red"
  if (["quarantine", "sample", "open", "investigation"].includes(status)) return "amber"
  if (["sealed", "picked", "allocated"].includes(status)) return "blue"
  return "neutral"
}

/** Reusable quantity control that keeps the business unit visible beside the number. */
export function WarehouseQuantityUomField({ value, onChange, uomCode, max, label }: { value: string; onChange: (value: string) => void; uomCode: string; max?: number; label: string }) {
  return <WarehouseFormField label={label} required><div className="grid grid-cols-[minmax(0,1fr)_64px] gap-2"><Input dir="ltr" type="number" min="0.000001" max={max} step="0.001" value={value} onChange={(event) => onChange(event.target.value)} className={controlClass} /><span data-i18n-skip dir="ltr" className="grid h-10 place-items-center rounded-[var(--md-radius-lg)] bg-white/48 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{uomCode}</span></div></WarehouseFormField>
}

/** Reusable compact summary for pallets and the less common handling-unit types. */
export function WarehouseObjectSummary({ unit }: { unit: WarehouseHandlingUnit }) {
  const { t } = useLanguage()
  return <div className="grid gap-1"><div className="flex items-center gap-2"><Code>{unit.code}</Code><StatusPill tone={statusTone(unit.lifecycleStatusCode)}>{t(unit.lifecycleStatusCode)}</StatusPill></div><p className="text-[12px] text-[var(--md-text)]">{t(unit.typeName)} · {unit.contents.length} {t(unit.contents.length === 1 ? "stock line" : "stock lines")}</p><p className="text-[11px] text-[var(--md-subtle)]">{unit.locationCode ?? t("No physical location")}</p></div>
}

/** Reusable exception summary used by the investigation and approval workflows. */
export function WarehouseExceptionSummary({ exception }: { exception: WarehouseInventoryException }) {
  const { t } = useLanguage()
  return <div className="grid gap-1"><div className="flex items-center gap-2"><p className="text-[13px] font-medium text-[var(--md-ink)]">{t(exception.title)}</p><StatusPill tone={statusTone(exception.statusCode)}>{t(exception.statusCode)}</StatusPill></div><p className="text-[12px] text-[var(--md-text)]">{exception.description ? t(exception.description) : t(exception.typeCode)}</p><p className="text-[11px] text-[var(--md-subtle)]">{exception.expectedLocationCode ? `${t("Expected")}: ${exception.expectedLocationCode}` : t(exception.typeCode)}</p></div>
}

type InventoryMode = "Stock" | "Movements" | "Exceptions"

/** Every register row is identified the same way, whichever view is showing. */
type InventoryRow = { id: string }

const inventoryModes = ["Stock", "Movements", "Exceptions"] as const
const emptyFacets: Record<InventoryMode, string> = { Stock: "", Movements: "", Exceptions: "" }

/** The one facet that matters per view, so every mode reads the same way. */
const facetLabels: Record<InventoryMode, string> = {
  Stock: "Customer",
  Movements: "Movement",
  Exceptions: "Severity",
}

/** Written out rather than pluralised in code: "All condition" is not English. */
const facetAllLabels: Record<InventoryMode, string> = {
  Stock: "All customers",
  Movements: "All movements",
  Exceptions: "All severities",
}


/** Everything a row can be matched on, lowercased once per row rather than per keystroke. */
function searchIndex(values: (string | number | null | undefined)[]) {
  return values.filter((value) => value !== null && value !== undefined && value !== "").join(" ").toLowerCase()
}

type WarehouseActionLocation = WarehouseOrderReference["locations"][number]
type WarehouseActionCustomer = WarehouseOrderReference["customers"][number]

function useWarehouseActionLocations(open: boolean, facilityId: string, retained: WarehouseActionLocation[] = []) {
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<WarehouseActionLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retainedKey = retained.map((row) => `${row.id}:${row.code}`).join("|")

  useEffect(() => { if (open) setSearch("") }, [facilityId, open])
  useEffect(() => {
    if (!open || !facilityId) { setRows([]); setHasMore(false); setError(null); return }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      listWarehouseOrderLocationsPage({ facilityId, search: search.trim() || undefined, limit: 50 })
        .then((page) => { if (!cancelled) { setRows(page.rows); setHasMore(page.hasMore); setError(null) } })
        .catch((cause) => { if (!cancelled) { setRows([]); setHasMore(false); setError(message(cause)) } })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [facilityId, open, search])

  const options = useMemo(() => [...retained, ...rows]
    .filter((row) => row.facilityId === facilityId)
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index), [facilityId, retainedKey, rows])
  return { search, setSearch, options, loading, hasMore, error }
}

function useWarehouseActionCustomers(open: boolean, retained: WarehouseActionCustomer[] = []) {
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<WarehouseActionCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retainedKey = retained.map((row) => `${row.id}:${row.name}`).join("|")

  useEffect(() => { if (open) setSearch("") }, [open])
  useEffect(() => {
    if (!open) { setRows([]); setHasMore(false); setError(null); return }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      listWarehouseOrderCustomersPage({ search: search.trim() || undefined, limit: 25 })
        .then((page) => { if (!cancelled) { setRows(page.rows); setHasMore(page.hasMore); setError(null) } })
        .catch((cause) => { if (!cancelled) { setRows([]); setHasMore(false); setError(message(cause)) } })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, search])

  const options = useMemo(() => [...retained, ...rows]
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index), [retainedKey, rows])
  return { search, setSearch, options, loading, hasMore, error }
}

export function WarehouseInventoryWorkspace() {
  const { language, t } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 6 }), [language])
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  const [mode, setMode] = useState<InventoryMode>("Stock")
  const [facilityId, setFacilityId] = useState("")
  const [facets, setFacets] = useState(emptyFacets)
  const [search, setSearch] = useState("")
  const [committedSearch, setCommittedSearch] = useState("")
  const [reference, setReference] = useState<WarehouseOrderReference | null>(null)
  const [huReference, setHuReference] = useState<WarehouseHandlingUnitReference | null>(null)
  const [facilities, setFacilities] = useState<WarehouseFacility[]>([])
  const [skus, setSkus] = useState<WarehouseStockSkuSummary[]>([])
  const [actionUnits, setActionUnits] = useState<WarehouseHandlingUnit[]>([])
  const [movements, setMovements] = useState<WarehouseInventoryMovement[]>([])
  const [exceptions, setExceptions] = useState<WarehouseInventoryException[]>([])
  const [totals, setTotals] = useState<Partial<Record<InventoryMode, number>>>({})
  const [facetOptionsByMode, setFacetOptionsByMode] = useState<Partial<Record<InventoryMode, string[]>>>({})
  const [offset, setOffset] = useState(0)
  const [inventoryPageSize, setInventoryPageSize] = useState(defaultPaginationPageSize)
  const [sort, setSort] = useState<WarehouseRegisterSort | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSku, setSelectedSku] = useState<WarehouseStockSkuSummary | null>(null)
  const [selectedBalance, setSelectedBalance] = useState<WarehouseInventoryBalance | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<WarehouseHandlingUnit | null>(null)
  const [selectedException, setSelectedException] = useState<WarehouseInventoryException | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [emptyOpen, setEmptyOpen] = useState(false)
  // Responses can land out of order once the operator types quickly. Only the
  // newest request is allowed to write, so a slow "ab" can never overwrite "abc".
  const requestId = useRef(0)
  const facetValue = facets[mode]

  useEffect(() => {
    const openCreate = () => setCreateOpen(true)
    const openEmptyReport = () => setEmptyOpen(true)
    const stopCreate = subscribeTopBarAction(topBarActionEvents.createWarehouseObject, openCreate)
    const stopEmptyReport = subscribeTopBarAction(topBarActionEvents.reportWarehouseLocationEmpty, openEmptyReport)
    return () => {
      stopCreate()
      stopEmptyReport()
    }
  }, [])

  const refresh = useCallback(async function refresh() {
    const ticket = ++requestId.current
    setPending(true)
    try {
      const common = { facilityId: facilityId || undefined, search: committedSearch || undefined, facet: facetValue || undefined, sort, limit: inventoryPageSize, offset }
      const result = mode === "Stock" ? await listWarehouseStockSkusPage(common)
        : mode === "Movements" ? await listWarehouseInventoryMovementsPage(common)
          : await listWarehouseInventoryExceptionsPage({ ...common, openOnly: true })
      if (ticket !== requestId.current) return
      if (mode === "Stock") setSkus(result.rows as WarehouseStockSkuSummary[])
      else if (mode === "Movements") setMovements(result.rows as WarehouseInventoryMovement[])
      else setExceptions(result.rows as WarehouseInventoryException[])
      setTotals((current) => ({ ...current, [mode]: result.total }))
      setFacetOptionsByMode((current) => ({ ...current, [mode]: result.facets }))
      setError(null); setLoaded(true)
    } catch (cause) {
      if (ticket !== requestId.current) return
      setError(message(cause))
    } finally {
      if (ticket === requestId.current) setPending(false)
    }
  }, [committedSearch, facetValue, facilityId, inventoryPageSize, mode, offset, sort])

  useEffect(() => { void refresh() }, [refresh])

  // Keep the register current while the operator is working without making them
  // manage freshness themselves. A hidden tab does not poll; it revalidates when
  // it becomes active again through the same effect-driven request cycle.
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

  // Typing narrows the loaded rows on the same frame; the server is only asked
  // once the operator stops, and only to widen the set beyond what is in hand.
  useEffect(() => {
    if (search === committedSearch) return
    const timer = window.setTimeout(() => { setOffset(0); setCommittedSearch(search) }, 320)
    return () => window.clearTimeout(timer)
  }, [search, committedSearch])

  // The filter needs only the small, bounded facility catalogue. The much larger
  // customer/item/location reference payload is deferred until an action opens.
  useEffect(() => {
    let live = true
    listWarehouseFacilitiesPage({ limit: 50 }).then((value) => { if (live) setFacilities(value.rows) }).catch(() => undefined)
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!createOpen && !emptyOpen) return
    let live = true
    getWarehouseOrderReference().then((value) => { if (live) setReference(value) }).catch(() => undefined)
    return () => { live = false }
  }, [createOpen, emptyOpen])

  useEffect(() => {
    const actionFacilityId = selectedBalance?.facilityId ?? selectedUnit?.facilityId ?? selectedException?.facilityId ?? (facilityId || undefined)
    if (!selectedBalance && !selectedUnit && !selectedException && !createOpen && !emptyOpen) return
    let live = true
    getWarehouseHandlingUnitReference(actionFacilityId).then((value) => { if (live) setHuReference(value) }).catch(() => undefined)
    return () => { live = false }
  }, [createOpen, emptyOpen, facilityId, selectedBalance, selectedException, selectedUnit])

  useEffect(() => {
    const facility = selectedBalance?.facilityId ?? selectedUnit?.facilityId
    const customerOrgId = selectedBalance?.customerOrgId ?? selectedUnit?.customerOrgId
    if (!facility) { setActionUnits([]); return }
    let live = true
    listWarehouseHandlingUnitsPage({ facilityId: facility, customerOrgId: customerOrgId ?? undefined, limit: 50 })
      .then((value) => { if (live) setActionUnits(value.rows) })
      .catch(() => { if (live) setActionUnits([]) })
    return () => { live = false }
  }, [selectedBalance, selectedUnit])

  const query = search.trim().toLowerCase()
  const facilityNameById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility.name])), [facilities])

  const filteredSkus = useMemo(() => skus.filter((row) => (
    (!facetValue || row.customerName === facetValue)
    && (!query || searchIndex([row.sku, row.itemDescription, row.customerName, row.facilityName]).includes(query))
  )), [facetValue, query, skus])

  const filteredMovements = useMemo(() => movements.filter((row) => (
    (!facetValue || (row.typeName ?? row.typeCode) === facetValue)
    && (!query || searchIndex([row.sku, row.itemDescription, row.reference, row.handlingUnitCode, row.fromLocationCode, row.toLocationCode, row.facilityName, row.reasonCode, row.typeName]).includes(query))
  )), [movements, facetValue, query])

  const filteredExceptions = useMemo(() => exceptions.filter((row) => (
    (!facetValue || row.severityCode === facetValue)
    && (!query || searchIndex([row.title, row.description, row.typeCode, row.statusCode, row.expectedLocationCode, row.actualLocationCode, facilityNameById.get(row.facilityId)]).includes(query))
  )), [exceptions, facetValue, facilityNameById, query])

  const counts: Partial<Record<InventoryMode, number>> = {
    Stock: totals.Stock,
    Movements: totals.Movements,
    Exceptions: totals.Exceptions,
  }

  // Options come from the rows actually in hand, so the menu can never offer a
  // value that returns nothing.
  const facetOptions = facetOptionsByMode[mode] ?? []

  // A facet the current rows no longer contain would silently hide everything.
  useEffect(() => {
    if (facetValue && !facetOptions.includes(facetValue)) setFacets((current) => ({ ...current, [mode]: "" }))
  }, [facetValue, facetOptions, mode])

  const stockColumns = useMemo<DataTableColumn<WarehouseStockSkuSummary>[]>(() => [
    { id: "stock-item", label: "Item", width: 236, minWidth: 180, resizable: true, canHide: false, sortValue: (row) => row.sku, cell: (row) => <div className="min-w-0"><Code>{row.sku}</Code><p className="mt-0.5 truncate text-[11.5px] text-[var(--md-text)]">{row.itemDescription}</p></div> },
    ...(!facilityId ? [{ id: "stock-warehouse", label: "Warehouse", width: 168, resizable: true, sortValue: (row: WarehouseStockSkuSummary) => row.facilityName, cell: (row: WarehouseStockSkuSummary) => <span className="truncate text-[12px] text-[var(--md-ink)]">{row.facilityName}</span> }] : []),
    { id: "stock-customer", label: "Customer", width: 168, resizable: true, sortValue: (row) => row.customerName, cell: (row) => <span className="truncate text-[12px] text-[var(--md-text)]">{row.customerName ?? "—"}</span> },
    { id: "stock-locations", label: "Locations", width: 104, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.locationCount, cell: (row) => <span className="tabular-nums">{number.format(row.locationCount)}</span> },
    { id: "stock-pallets", label: "Pallets", width: 96, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.palletCount, cell: (row) => <span className="tabular-nums">{number.format(row.palletCount)}</span> },
    { id: "stock-onHand", label: "On hand", width: 132, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.onHandQuantity, cell: (row) => <span dir="ltr" className="tabular-nums">{number.format(row.onHandQuantity)} {row.uomCode}</span> },
    { id: "stock-available", label: "Available", width: 124, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.availableQuantity, cell: (row) => <span dir="ltr" className="font-medium tabular-nums text-[var(--md-accent)]">{number.format(row.availableQuantity)}</span> },
    { id: "stock-reserved", label: "Reserved", width: 116, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.reservedQuantity, cell: (row) => <span dir="ltr" className="tabular-nums">{number.format(row.reservedQuantity)}</span> },
    { id: "stock-held", label: "Held", width: 104, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.heldQuantity, cell: (row) => <span dir="ltr" className="tabular-nums">{number.format(row.heldQuantity)}</span> },
  ], [facilityId, number, t])

  const movementColumns = useMemo<DataTableColumn<WarehouseInventoryMovement>[]>(() => [
    { id: "movement-posted", label: "Posted", width: 176, minWidth: 150, resizable: true, canHide: false, sortValue: (row) => row.createdAt, cell: (row) => <span className="whitespace-nowrap text-[12px]">{dateTime.format(new Date(row.createdAt))}</span> },
    ...(!facilityId ? [{ id: "movement-warehouse", label: "Warehouse", width: 168, resizable: true, cell: (row: WarehouseInventoryMovement) => <span className="truncate text-[12px] text-[var(--md-ink)]">{row.facilityName}</span> }] : []),
    { id: "movement-reference", label: "Reference", width: 146, resizable: true, sortValue: (row) => row.reference, cell: (row) => <Code>{row.reference ?? "—"}</Code> },
    { id: "movement-item", label: "Item", width: 190, resizable: true, sortValue: (row) => row.sku, cell: (row) => <div className="min-w-0"><Code>{row.sku}</Code><p className="truncate text-[11px] text-[var(--md-subtle)]">{row.handlingUnitCode ?? t("Loose stock")}</p></div> },
    { id: "movement-movement", label: "Movement", kind: "attribute", width: 152, resizable: true, sortValue: (row) => row.typeName ?? row.typeCode, cell: (row) => <StatusPill tone={row.typeCode === "receipt" ? "teal" : "blue"}>{t(row.typeName ?? row.typeCode)}</StatusPill> },
    { id: "movement-route", label: "Location", width: 168, resizable: true, cell: (row) => <span className="whitespace-nowrap text-[12px]"><Code>{row.fromLocationCode ?? "—"}</Code> <span aria-hidden="true" className="text-[var(--md-subtle)]">→</span> <Code>{row.toLocationCode ?? "—"}</Code></span> },
    { id: "movement-reason", label: "Reason", width: 152, resizable: true, sortValue: (row) => row.reasonCode, cell: (row) => <span className="truncate text-[12px] text-[var(--md-text)]">{row.reasonCode ? t(row.reasonCode) : "—"}</span> },
    { id: "movement-quantity", label: "Quantity", width: 138, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.quantity, cell: (row) => <span dir="ltr" className="tabular-nums">{number.format(row.quantity)} {row.uomCode}</span> },
  ], [dateTime, facilityId, number, t])

  const exceptionColumns = useMemo<DataTableColumn<WarehouseInventoryException>[]>(() => [
    { id: "exception-exception", label: "Exception", width: 340, minWidth: 240, resizable: true, canHide: false, sortValue: (row) => row.title, cell: (row) => <WarehouseExceptionSummary exception={row} /> },
    ...(!facilityId ? [{ id: "exception-warehouse", label: "Warehouse", width: 168, resizable: true, cell: (row: WarehouseInventoryException) => <span className="truncate text-[12px] text-[var(--md-ink)]">{facilityNameById.get(row.facilityId) ?? row.facilityId}</span> }] : []),
    { id: "exception-severity", label: "Severity", kind: "status", width: 128, resizable: true, sortValue: (row) => row.severityCode, cell: (row) => <StatusPill tone={row.severityCode === "high" ? "red" : "amber"}>{t(row.severityCode)}</StatusPill> },
    { id: "exception-raised", label: "Raised", width: 176, resizable: true, sortValue: (row) => row.raisedAt, cell: (row) => <span className="whitespace-nowrap text-[12px]">{dateTime.format(new Date(row.raisedAt))}</span> },
    { id: "exception-expected", label: "Expected location", width: 160, resizable: true, sortValue: (row) => row.expectedLocationCode, cell: (row) => <Code>{row.expectedLocationCode ?? "—"}</Code> },
    { id: "exception-status", label: "Status", kind: "status", width: 138, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (row) => row.statusCode, cell: (row) => <StatusPill tone={statusTone(row.statusCode)}>{t(row.statusCode)}</StatusPill> },
  ], [dateTime, facilityId, facilityNameById, t])

  const clearFilters = () => { setSearch(""); setCommittedSearch(""); setFacets(emptyFacets); setFacilityId(""); setOffset(0); setSort(null) }
  const hasFilters = Boolean(query || facetValue || facilityId)

  const emptyState = error ? (
    <div className="mx-auto max-w-[380px]" role="alert">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Warehouse records are unavailable")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{error}</p>
      <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => void refresh()}>
        <RefreshCw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
        {t("Try again")}
      </Button>
    </div>
  ) : !loaded ? (
    <DotGridLoaderPanel label="Loading warehouse records" minHeight={0} />
  ) : hasFilters ? (
    <div className="mx-auto max-w-[380px]">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Nothing matches these filters")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Widen the search or switch warehouse to see more.")}</p>
      <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={clearFilters}>{t("Clear filters")}</Button>
    </div>
  ) : (
    <div className="mx-auto max-w-[380px]">
      <Boxes className="mx-auto size-5 text-[var(--md-accent)]" strokeWidth={1.35} />
      <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t(mode === "Exceptions" ? "No open exceptions" : "Nothing here yet")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
        {t(mode === "Stock" ? "Stock appears here once an inbound order is booked in."
          : mode === "Movements" ? "Every move, status change and sample is logged here."
          : "Every location count and stock discrepancy is resolved here.")}
      </p>
    </div>
  )

  const toolbarTabs = (
    <div className="flex min-w-0 items-center gap-2">
      <RegisterViewSwitch options={inventoryModes} value={mode} onChange={(value) => { setMode(value); setOffset(0); setSort(null); setLoaded(false) }} counts={counts} ariaLabel="Inventory view" compact />
    </div>
  )

  const toolbarFilters = (
    <>
      <RegisterFacetSelect
        label={facetLabels[mode]}
        allLabel={facetAllLabels[mode]}
        value={facetValue}
        options={facetOptions.map((option) => ({ value: option, label: option }))}
        onChange={(value) => { setFacets((current) => ({ ...current, [mode]: value })); setOffset(0) }}
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
  )

  // One register that changes view, not four registers. The table is never
  // remounted on a mode switch, so the selected-view pill travels between
  // segments and the toolbar the operator is using stays put. Column ids are
  // namespaced per view instead, which is what keeps one view's saved widths and
  // sort out of another's.
  const view = mode === "Stock" ? {
    columns: stockColumns as unknown as DataTableColumn<InventoryRow>[],
    rows: filteredSkus as InventoryRow[],
    onRowClick: (row: InventoryRow) => setSelectedSku(row as WarehouseStockSkuSummary),
    selectedRowKey: selectedSku?.id ?? null,
  } : mode === "Movements" ? {
    columns: movementColumns as unknown as DataTableColumn<InventoryRow>[],
    rows: filteredMovements as InventoryRow[],
    onRowClick: undefined,
    selectedRowKey: null,
  } : {
    columns: exceptionColumns as unknown as DataTableColumn<InventoryRow>[],
    rows: filteredExceptions as InventoryRow[],
    onRowClick: (row: InventoryRow) => setSelectedException(row as WarehouseInventoryException),
    selectedRowKey: selectedException?.id ?? null,
  }

  return <div className="grid gap-[var(--md-page-stack-gap)]">
    <DataTable
      ariaLabel={`Warehouse ${mode.toLowerCase()}`}
      exportConfig={{ fileName: `warehouse-${mode.toLowerCase()}`, register: {
        dateLabel: mode === "Movements" ? "Movement posted date" : mode === "Exceptions" ? "Exception raised date" : "Last updated date",
        dateValue: (row) => mode === "Movements" ? (row as WarehouseInventoryMovement).createdAt : mode === "Exceptions" ? (row as WarehouseInventoryException).raisedAt : (row as WarehouseStockSkuSummary).updatedAt,
        busy: search.trim() !== committedSearch.trim(),
        loadAllRows: (signal) => collectExportPages<InventoryRow>(async (page) => {
          const common = { facilityId: facilityId || undefined, search: committedSearch || undefined, facet: facetValue || undefined, sort, ...page }
          return mode === "Stock" ? listWarehouseStockSkusPage(common)
            : mode === "Movements" ? listWarehouseInventoryMovementsPage(common) : listWarehouseInventoryExceptionsPage({ ...common, openOnly: true })
        }, (row) => row.id, signal),
      } }}
      columnsButtonLabel="Manage warehouse columns"
      storageKey="warehouse-inventory"
      columns={view.columns}
      rows={view.rows}
      getRowKey={(row) => row.id}
      onRowClick={view.onRowClick}
      selectedRowKey={view.selectedRowKey}
      rowClassName="hover:bg-[var(--md-hover)]"
      toolbarTabs={toolbarTabs}
      toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => { setSearch(""); setCommittedSearch("") }} label="Search warehouse records" placeholder={mode === "Stock" ? "SKU, customer" : "SKU, pallet, batch"} className="sm:min-w-[136px] sm:w-[136px]" />}
      toolbarFilters={toolbarFilters}
      toolbarOptions={<RegisterRevalidatingMark active={pending && loaded} />}
      compactToolbar
      emptyState={emptyState}
      serverSorting={{ value: sort, onChange: (value) => { setSort(value); setOffset(0) } }}
      pagination={{ offset, limit: inventoryPageSize, total: totals[mode] ?? 0, loading: pending, onOffsetChange: setOffset, onLimitChange: setInventoryPageSize, error: Boolean(error) }}
    />
    <WarehouseSkuStockPanel sku={selectedSku} open={Boolean(selectedSku)} onClose={() => setSelectedSku(null)} onSelectLine={(line) => { setSelectedSku(null); setSelectedBalance(line) }} onSelectPallet={(unit) => { setSelectedSku(null); setSelectedUnit(unit) }} />
    <StockActionPanel balance={selectedBalance} open={Boolean(selectedBalance)} onClose={() => setSelectedBalance(null)} reference={huReference} units={actionUnits} onChanged={() => void refresh()} />
    <WarehouseObjectPanel unit={selectedUnit} facilityName={selectedUnit ? facilityNameById.get(selectedUnit.facilityId) ?? null : null} open={Boolean(selectedUnit)} onClose={() => setSelectedUnit(null)} units={actionUnits} onChanged={() => void refresh()} />
    <ExceptionPanel exception={selectedException} facilityName={selectedException ? facilityNameById.get(selectedException.facilityId) ?? null : null} open={Boolean(selectedException)} onClose={() => setSelectedException(null)} onChanged={() => void refresh()} />
    <CreateHandlingUnitDialog open={createOpen} onOpenChange={setCreateOpen} reference={reference} huReference={huReference} fixedFacilityId={facilityId} onChanged={() => void refresh()} />
    <EmptyLocationDialog open={emptyOpen} onOpenChange={setEmptyOpen} reference={reference} fixedFacilityId={facilityId} onChanged={() => void refresh()} />
  </div>
}

const stockActions = ["move", "quarantine", "damage", "sample"] as const
type StockAction = (typeof stockActions)[number]
const stockActionLabels: Record<StockAction, string> = { move: "Move", quarantine: "Hold", damage: "Damage", sample: "Sample" }
const stockActionButtons: Record<StockAction, string> = { move: "Move stock", quarantine: "Put on hold", damage: "Record damage", sample: "Take a sample" }

function WarehouseSkuStockPanel({ sku, open, onClose, onSelectLine, onSelectPallet }: {
  sku: WarehouseStockSkuSummary | null
  open: boolean
  onClose: () => void
  onSelectLine: (line: WarehouseInventoryBalance) => void
  onSelectPallet: (unit: WarehouseHandlingUnit) => void
}) {
  const { language, t } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 6 }), [language])
  const [detail, setDetail] = useState<WarehouseStockSkuDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openingPalletId, setOpeningPalletId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !sku) return
    let live = true
    setDetail(null)
    setLoadError(null)
    getWarehouseStockSkuDetail(sku.itemId, sku.facilityId)
      .then((value) => { if (live) setDetail(value) })
      .catch((cause) => { if (live) setLoadError(message(cause)) })
    return () => { live = false }
  }, [open, sku])

  if (!sku) return null
  const summary = detail?.summary ?? sku

  async function openPallet(palletId: string) {
    setOpeningPalletId(palletId)
    try {
      onSelectPallet(await getWarehouseHandlingUnit(palletId, sku!.facilityId))
    } catch (cause) {
      toast.error(t("Pallet could not be opened"), { description: message(cause) })
    } finally {
      setOpeningPalletId(null)
    }
  }

  return (
    <RecordDrawer
      open={open}
      onClose={onClose}
      eyebrow={t("Stock in warehouse")}
      title={sku.sku}
      icon={Boxes}
      width={820}
      slideDistance={120}
      motionTransition={mdMotion.drawer}
      summary={(
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] leading-5 text-[var(--md-ink)]" dir="auto">{summary.itemDescription}</p>
              <p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{summary.customerName ?? t("No customer")} · {summary.facilityName}</p>
            </div>
            <FactFigure value={number.format(summary.onHandQuantity)} unit={summary.uomCode} label="total on hand" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-5 shadow-[var(--md-stroke-top)] pt-2.5 sm:grid-cols-4">
            <FactRow label="Available" value={`${number.format(summary.availableQuantity)} ${summary.uomCode}`} code />
            <FactRow label="Reserved" value={`${number.format(summary.reservedQuantity)} ${summary.uomCode}`} code />
            <FactRow label="Allocated" value={`${number.format(summary.allocatedQuantity)} ${summary.uomCode}`} code />
            <FactRow label="Held" value={`${number.format(summary.heldQuantity)} ${summary.uomCode}`} code />
          </div>
        </>
      )}
    >
      {loadError ? (
        <FactCard><div role="alert" className="py-5 text-center"><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Stock details are unavailable")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{loadError}</p></div></FactCard>
      ) : !detail ? (
        <FactCard><DotGridLoaderPanel label="Loading stock breakdown" minHeight={140} /></FactCard>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <FactCard>
              <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("By location type")}</p>
              <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Where this SKU is physically stored.")}</p>
              <div className="mt-3 divide-y divide-[var(--md-line)]">
                {detail.locationBreakdown.map((entry) => <div key={entry.code} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"><span className="text-[12px] text-[var(--md-text)]">{t(entry.label)}</span><span dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{number.format(entry.quantity)} {summary.uomCode}</span></div>)}
              </div>
            </FactCard>
            <FactCard>
              <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("By storage")}</p>
              <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Palletised and loose quantities are separate from location type.")}</p>
              <div className="mt-3 divide-y divide-[var(--md-line)]">
                {detail.storageBreakdown.map((entry) => <div key={entry.code} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"><span className="text-[12px] text-[var(--md-text)]">{t(entry.label)}</span><span dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{number.format(entry.quantity)} {summary.uomCode}</span></div>)}
              </div>
            </FactCard>
          </div>

          {detail.pallets.length ? (
            <FactCard>
              <div className="flex items-end justify-between gap-3"><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Pallets")}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Open a pallet to inspect or move it with its contents.")}</p></div><span className="text-[11px] tabular-nums text-[var(--md-subtle)]">{detail.pallets.length}</span></div>
              <div className="mt-3 divide-y divide-[var(--md-line)]">
                {detail.pallets.map((pallet) => (
                  <button key={pallet.id} type="button" disabled={openingPalletId === pallet.id} onClick={() => void openPallet(pallet.id)} className="flex w-full items-center justify-between gap-4 py-2 text-start transition-colors hover:text-[var(--md-accent)] disabled:opacity-60 first:pt-0 last:pb-0">
                    <span className="min-w-0"><Code>{pallet.code}</Code><span className="ms-2 text-[11px] text-[var(--md-subtle)]">{pallet.locationCode ?? t("No physical location")}</span></span>
                    <span dir="ltr" className="shrink-0 text-[12px] font-medium tabular-nums">{number.format(pallet.quantity)} {summary.uomCode}</span>
                  </button>
                ))}
              </div>
            </FactCard>
          ) : null}

          <FactCard>
            <div className="flex items-end justify-between gap-3"><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Exact stock lines")}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Location, pallet, batch and condition behind the total.")}</p></div><span className="text-[11px] tabular-nums text-[var(--md-subtle)]">{detail.lineTotal}</span></div>
            <div className="mt-3 divide-y divide-[var(--md-line)]">
              {detail.lines.map((line) => (
                <button key={line.id} type="button" onClick={() => onSelectLine(line)} className="grid w-full gap-1 py-2.5 text-start transition-colors hover:text-[var(--md-accent)] first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><Code>{line.locationCode ?? "—"}</Code><StatusPill tone={statusTone(line.inventoryStatusCode)}>{t(line.inventoryStatusName ?? line.inventoryStatusCode)}</StatusPill></span><span className="mt-1 block truncate text-[11px] text-[var(--md-subtle)]">{line.handlingUnitCode ? `${t("Pallet")} ${line.handlingUnitCode}` : t("Loose stock")}{line.batchNumber ?? line.lotNumber ? ` · ${line.batchNumber ?? line.lotNumber}` : ""}</span></span>
                  <span dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{number.format(line.onHandQuantity)} {line.uomCode}<span className="ms-2 font-normal text-[var(--md-subtle)]">{number.format(line.availableQuantity)} {t("available")}</span></span>
                </button>
              ))}
            </div>
            {detail.lineTotal > detail.lines.length ? <p className="mt-3 pt-3 text-[11px] text-[var(--md-subtle)] shadow-[var(--md-stroke-top)]">{t(`Showing the first ${detail.lines.length} of ${detail.lineTotal} stock lines.`)}</p> : null}
          </FactCard>
        </>
      )}
    </RecordDrawer>
  )
}

function StockActionPanel({ balance, open, onClose, reference, units, onChanged }: { balance: WarehouseInventoryBalance | null; open: boolean; onClose: () => void; reference: WarehouseHandlingUnitReference | null; units: WarehouseHandlingUnit[]; onChanged: () => void }) {
  const { language, t } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 6 }), [language])
  const [action, setAction] = useState<StockAction>("move")
  const [quantity, setQuantity] = useState("")
  const [targetLocationId, setTargetLocationId] = useState("")
  const [actualSourceLocationId, setActualSourceLocationId] = useState("")
  const [targetHuId, setTargetHuId] = useState("")
  const [status, setStatus] = useState("quarantine")
  const [disposition, setDisposition] = useState<"onsite" | "removed">("removed")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [recipient, setRecipient] = useState("")
  const [custody, setCustody] = useState("")
  const [saving, setSaving] = useState(false)
  const retainedLocations = useMemo<WarehouseActionLocation[]>(() => balance?.locationId && balance.locationCode ? [{ id: balance.locationId, facilityId: balance.facilityId, code: balance.locationCode, zoneName: null, statusCode: "available" }] : [], [balance])
  const locationSelector = useWarehouseActionLocations(open, balance?.facilityId ?? "", retainedLocations)

  useEffect(() => {
    if (!balance || !open) return
    setAction("move")
    setQuantity(String(balance.onHandQuantity))
    setTargetLocationId(balance.locationId ?? "")
    setActualSourceLocationId(balance.locationId ?? "")
    setTargetHuId(balance.handlingUnitId ?? "")
    setReason("")
    setNotes("")
  }, [balance, open])

  if (!balance) return null
  const currentBalance = balance
  const locations = locationSelector.options
  const compatibleUnits = units.filter((unit) => unit.facilityId === balance.facilityId && unit.customerOrgId === balance.customerOrgId && unit.lifecycleStatusCode === "open")
  const movingFromElsewhere = action === "move" && actualSourceLocationId !== currentBalance.locationId

  async function save() {
    setSaving(true)
    try {
      const amount = Number(quantity)
      if (action === "move") {
        await moveWarehouseBalance({ facilityId: currentBalance.facilityId, balanceId: currentBalance.id, quantity: amount, targetLocationId, targetHandlingUnitId: targetHuId || null, actualSourceLocationId: actualSourceLocationId || null, reasonCode: reason || "warehouse_move", overrideReason: actualSourceLocationId !== currentBalance.locationId ? notes || reason : null, notes: notes || null })
      } else if (action === "sample") {
        await recordWarehouseSample({ facilityId: currentBalance.facilityId, balanceId: currentBalance.id, quantity: amount, disposition, reasonCode: reason || "quality_sample", recipient: recipient || null, custodyReference: custody || null, notes: notes || null })
      } else {
        await changeWarehouseStockStatus({ facilityId: currentBalance.facilityId, balanceId: currentBalance.id, quantity: amount, targetStatusCode: action === "damage" ? "damaged" : status, reasonCode: reason || action, notes: notes || null })
      }
      toast.success(t("Stock updated"))
      onClose()
      onChanged()
    } catch (cause) {
      toast.error(t("Stock could not be updated"), { description: message(cause) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <RecordDrawer
      open={open}
      onClose={onClose}
      eyebrow={t("Stock")}
      title={balance.sku}
      icon={Boxes}
      width={760}
      slideDistance={120}
      motionTransition={mdMotion.drawer}
      summary={(
        <>
          <div className="flex items-start justify-between gap-4">
            <FactFigure value={number.format(balance.availableQuantity)} unit={balance.uomCode} label={`available of ${number.format(balance.onHandQuantity)} on hand`} />
            <StatusPill tone={statusTone(balance.inventoryStatusCode)}>{t(balance.inventoryStatusName ?? balance.inventoryStatusCode)}</StatusPill>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-4 text-[var(--md-text)]" dir="auto">{balance.itemDescription}</p>
          <dl className="mt-3 shadow-[var(--md-stroke-top)] pt-2.5">
            <FactRow label="Location" value={balance.locationCode} code />
            <FactRow label="On pallet" value={balance.handlingUnitCode ?? t("Loose stock")} code={Boolean(balance.handlingUnitCode)} />
            <FactRow label="Batch / lot" value={balance.batchNumber ?? balance.lotNumber} code />
            <FactRow label="Customer" value={balance.customerName} />
            <FactRow label="Warehouse" value={balance.facilityName} />
          </dl>
        </>
      )}
      actions={(
        <Button
          type="button"
          disabled={saving || Number(quantity) <= 0 || !reason || (action === "move" && !targetLocationId)}
          onClick={() => void save()}
          className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3.5 text-[12.5px] font-medium text-[var(--md-accent-ink)] transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] active:scale-[0.97] motion-reduce:transform-none"
        >
          {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" strokeWidth={1.6} /> : action === "sample" ? <FlaskConical data-icon="inline-start" className="size-4" strokeWidth={1.4} /> : <Route data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
          {t(stockActionButtons[action])}
        </Button>
      )}
    >
      <FactCard>
      {/* The selected action's pill travels between segments, so switching reads
          as one control changing rather than four chips lighting up. */}
      <div className="grid gap-2">
        <p className="text-[11.5px] font-medium text-[var(--md-text)]">{t("What is happening to this stock?")}</p>
        <SegmentedControl options={stockActions} value={action} onChange={setAction} ariaLabel={t("Stock action")} className="w-full" renderOption={(option) => t(stockActionLabels[option])} />
      </div>

      <WarehouseQuantityUomField label={t("Quantity")} value={quantity} onChange={setQuantity} uomCode={balance.uomCode} max={balance.onHandQuantity} />

      {action === "move" ? (
        <>
          <WarehouseFormField label={t("Find a location")} hint={locationSelector.hasMore ? t("Search to narrow the location list.") : undefined}>
            <div className="relative"><Input value={locationSelector.search} onChange={(event) => locationSelector.setSearch(event.target.value)} placeholder={t("Search locations…")} className={controlClass} />{locationSelector.loading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div>
            {locationSelector.error ? <p role="alert" className="mt-1 text-[11.5px] text-[var(--md-red)]">{locationSelector.error}</p> : null}
          </WarehouseFormField>
          <WarehouseFormField label={t("Found at")} required hint={movingFromElsewhere ? t("This differs from the recorded location, so the move is logged as an override.") : undefined}>
            <Select value={actualSourceLocationId} onValueChange={setActualSourceLocationId}>
              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent>
            </Select>
          </WarehouseFormField>
          <WarehouseFormField label={t("Moving to")} required>
            <Select value={targetLocationId} onValueChange={setTargetLocationId}>
              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent>{locations.filter((location) => !location.statusCode || location.statusCode === "available").map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent>
            </Select>
          </WarehouseFormField>
          <WarehouseFormField label={t("Onto pallet")} hint={t("Leave as loose stock if it is not going onto a pallet.")}>
            <Select value={targetHuId || noneValue} onValueChange={(value) => setTargetHuId(value === noneValue ? "" : value)}>
              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={noneValue}>{t("Loose stock")}</SelectItem>{compatibleUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code}</SelectItem>)}</SelectContent>
            </Select>
          </WarehouseFormField>
        </>
      ) : action === "sample" ? (
        <>
          <WarehouseFormField label={t("Where the sample goes")}>
            <Select value={disposition} onValueChange={(value: "onsite" | "removed") => setDisposition(value)}>
              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="onsite">{t("Stays onsite")}</SelectItem><SelectItem value="removed">{t("Leaves the warehouse")}</SelectItem></SelectContent>
            </Select>
          </WarehouseFormField>
          <WarehouseFormField label={t("Who is taking it")}><Input value={recipient} onChange={(event) => setRecipient(event.target.value)} className={controlClass} /></WarehouseFormField>
          <WarehouseFormField label={t("Chain-of-custody reference")}><Input dir="ltr" value={custody} onChange={(event) => setCustody(event.target.value)} className={controlClass} /></WarehouseFormField>
        </>
      ) : action === "quarantine" ? (
        <WarehouseFormField label={t("Hold it as")}>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
            <SelectContent>{reference?.statuses.filter((entry) => !entry.available).map((entry) => <SelectItem key={entry.code} value={entry.code}>{t(entry.name)}</SelectItem>)}</SelectContent>
          </Select>
        </WarehouseFormField>
      ) : null}

      <WarehouseFormField label={t("Reason")} required hint={t("Recorded against the movement in the audit trail.")}>
        <Input value={reason} onChange={(event) => setReason(event.target.value)} className={controlClass} placeholder={t("Why is this happening?")} />
      </WarehouseFormField>
      <WarehouseFormField label={t("Notes and evidence")}>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[12.5px] shadow-[var(--md-shadow-line)]" />
      </WarehouseFormField>
      </FactCard>
    </RecordDrawer>
  )
}

const objectModes = ["move", "consolidate"] as const
type ObjectMode = (typeof objectModes)[number]
const objectModeLabels: Record<ObjectMode, string> = { move: "Move pallet", consolidate: "Consolidate into pallet" }

function WarehouseObjectPanel({ unit, facilityName, open, onClose, units, onChanged }: { unit: WarehouseHandlingUnit | null; facilityName: string | null; open: boolean; onClose: () => void; units: WarehouseHandlingUnit[]; onChanged: () => void }) {
  const { language, t } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 6 }), [language])
  const [mode, setMode] = useState<ObjectMode>("move")
  const [targetLocationId, setTargetLocationId] = useState("")
  const [actualSourceLocationId, setActualSourceLocationId] = useState("")
  const [sources, setSources] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const retainedLocations = useMemo<WarehouseActionLocation[]>(() => unit?.locationId && unit.locationCode ? [{ id: unit.locationId, facilityId: unit.facilityId, code: unit.locationCode, zoneName: null, statusCode: "available" }] : [], [unit])
  const locationSelector = useWarehouseActionLocations(open, unit?.facilityId ?? "", retainedLocations)

  useEffect(() => {
    if (!unit || !open) return
    setMode("move")
    setTargetLocationId(unit.locationId ?? "")
    setActualSourceLocationId(unit.locationId ?? "")
    setSources([])
    setNotes("")
  }, [unit, open])

  if (!unit) return null
  const currentUnit = unit
  const locations = locationSelector.options.filter((location) => !location.statusCode || location.statusCode === "available")
  const candidates = units.filter((candidate) => candidate.id !== unit.id && candidate.facilityId === unit.facilityId && candidate.customerOrgId === unit.customerOrgId && candidate.lifecycleStatusCode === "open")

  async function save() {
    setSaving(true)
    try {
      if (mode === "move") {
        await moveWarehouseHandlingUnit({ facilityId: currentUnit.facilityId, handlingUnitId: currentUnit.id, targetLocationId, actualSourceLocationId: actualSourceLocationId || null, reasonCode: "handling_unit_move", overrideReason: actualSourceLocationId !== currentUnit.locationId ? notes : null, notes: notes || null })
      } else {
        await consolidateWarehouseHandlingUnits({ facilityId: currentUnit.facilityId, targetHandlingUnitId: currentUnit.id, sourceHandlingUnitIds: sources, notes: notes || null })
      }
      toast.success(t(mode === "move" ? "Pallet moved" : "Pallets consolidated"))
      onClose()
      onChanged()
    } catch (cause) {
      toast.error(t("Object could not be updated"), { description: message(cause) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <RecordDrawer
      open={open}
      onClose={onClose}
      eyebrow={t(unit.typeName)}
      title={unit.code}
      icon={PackagePlus}
      summary={(
        <>
          <div className="flex items-start justify-between gap-4">
            <FactFigure value={String(unit.contents.length)} label={unit.contents.length === 1 ? "stock line on this object" : "stock lines on this object"} />
            <StatusPill tone={statusTone(unit.lifecycleStatusCode)}>{t(unit.lifecycleStatusCode)}</StatusPill>
          </div>
          <dl className="mt-3 shadow-[var(--md-stroke-top)] pt-2.5">
            <FactRow label="Location" value={unit.locationCode ?? t("No physical location")} code={Boolean(unit.locationCode)} />
            <FactRow label="Warehouse" value={facilityName} />
            <FactRow label="Customer" value={unit.customerName} />
            <FactRow label="Condition" value={t(unit.inventoryStatusName)} />
            <FactRow label="SSCC" value={unit.sscc} code />
          </dl>
          {unit.contents.length ? (
            <div className="mt-3 grid gap-1.5 shadow-[var(--md-stroke-top)] pt-2.5">
              {unit.contents.map((line) => (
                <div key={line.balanceId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[12px]"><Code>{line.sku}</Code> <span className="text-[var(--md-text)]">{line.description}</span></span>
                  <span dir="ltr" className="shrink-0 text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{number.format(line.quantity)} {line.uomCode}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      actions={(
        <Button
          type="button"
          disabled={saving || (mode === "move" ? !targetLocationId : !sources.length)}
          onClick={() => void save()}
          className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3.5 text-[12.5px] font-medium text-[var(--md-accent-ink)] transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] active:scale-[0.97] motion-reduce:transform-none"
        >
          {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" strokeWidth={1.6} /> : <Combine data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
          {t(mode === "move" ? "Move pallet" : "Consolidate")}
        </Button>
      )}
    >
      <FactCard>
      <SegmentedControl options={objectModes} value={mode} onChange={setMode} ariaLabel={t("Pallet action")} className="w-full" renderOption={(option) => t(objectModeLabels[option])} />

      {mode === "move" ? (
        <>
          <WarehouseFormField label={t("Find a location")} hint={locationSelector.hasMore ? t("Search to narrow the location list.") : undefined}>
            <div className="relative"><Input value={locationSelector.search} onChange={(event) => locationSelector.setSearch(event.target.value)} placeholder={t("Search locations…")} className={controlClass} />{locationSelector.loading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div>
            {locationSelector.error ? <p role="alert" className="mt-1 text-[11.5px] text-[var(--md-red)]">{locationSelector.error}</p> : null}
          </WarehouseFormField>
          <WarehouseFormField label={t("Found at")}>
            <Select value={actualSourceLocationId} onValueChange={setActualSourceLocationId}>
              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent>
            </Select>
          </WarehouseFormField>
          <WarehouseFormField label={t("Moving to")} required>
            <Select value={targetLocationId} onValueChange={setTargetLocationId}>
              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent>
            </Select>
          </WarehouseFormField>
        </>
      ) : (
        <div className="grid gap-2">
          <p className="text-[11.5px] font-medium text-[var(--md-text)]">{t("Which pallets are being emptied into this one?")}</p>
          {candidates.length ? candidates.map((candidate) => (
            <label key={candidate.id} className="flex cursor-pointer items-center gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2 shadow-[var(--md-shadow-line)] transition-shadow duration-200 hover:shadow-[var(--md-shadow-soft)]">
              <input type="checkbox" checked={sources.includes(candidate.id)} onChange={(event) => setSources((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} />
              <WarehouseObjectSummary unit={candidate} />
            </label>
          )) : <p className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2.5 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("This customer has no other open pallets in this warehouse.")}</p>}
        </div>
      )}

      <WarehouseFormField label={t("Reason and notes")}>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[12.5px] shadow-[var(--md-shadow-line)]" />
      </WarehouseFormField>
      </FactCard>
    </RecordDrawer>
  )
}

function CreateHandlingUnitDialog({ open, onOpenChange, reference, huReference, fixedFacilityId, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; huReference: WarehouseHandlingUnitReference | null; fixedFacilityId: string; onChanged: () => void }) {
  const { t } = useLanguage()
  const [facilityId, setFacilityId] = useState("")
  const [customerOrgId, setCustomerOrgId] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<WarehouseActionCustomer | null>(null)
  const [locationId, setLocationId] = useState("")
  const [typeCode, setTypeCode] = useState("pallet")
  const [code, setCode] = useState("")
  const [saving, setSaving] = useState(false)
  const customers = useWarehouseActionCustomers(open, selectedCustomer ? [selectedCustomer] : [])
  const locations = useWarehouseActionLocations(open, facilityId)
  const availableLocations = locations.options.filter((location) => !location.statusCode || location.statusCode === "available")

  useEffect(() => {
    if (!open) return
    setFacilityId(fixedFacilityId || reference?.facilities[0]?.id || "")
    setCustomerOrgId("")
    setSelectedCustomer(null)
    setLocationId("")
    setCode("")
  }, [open, fixedFacilityId, reference])
  useEffect(() => {
    if (!open || customerOrgId || !customers.options[0]) return
    setCustomerOrgId(customers.options[0].id)
    setSelectedCustomer(customers.options[0])
  }, [customerOrgId, customers.options, open])
  useEffect(() => {
    if (!open || locationId || !availableLocations[0]) return
    setLocationId(availableLocations[0].id)
  }, [availableLocations, locationId, open])

  async function save() {
    setSaving(true)
    try {
      await createWarehouseHandlingUnit({ facilityId, customerOrgId: customerOrgId || null, locationId: locationId || null, typeCode, code: code || null, sscc: null, externalReference: null })
      toast.success(t("Pallet created")); onOpenChange(false); onChanged()
    } catch (cause) {
      toast.error(t("Pallet could not be created"), { description: message(cause) })
    } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 sm:max-w-[560px]"><DialogHeader className={warehouseDialogHeaderClass}><DialogTitle>{t("New pallet")}</DialogTitle><DialogDescription>{t("Create a pallet or another labelled storage unit.")}</DialogDescription></DialogHeader><div className="grid gap-4 px-6 py-5">
    <WarehouseFormField label={t("Warehouse")}><Select value={facilityId} onValueChange={(value) => { setFacilityId(value); setLocationId("") }}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
    <WarehouseFormField label={t("Customer")} hint={customers.hasMore ? t("Search to narrow the customer list.") : undefined}><div className="grid gap-1.5"><div className="relative"><Input value={customers.search} onChange={(event) => customers.setSearch(event.target.value)} placeholder={t("Search customers…")} className={controlClass} />{customers.loading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div><Select value={customerOrgId} onValueChange={(value) => { setCustomerOrgId(value); setSelectedCustomer(customers.options.find((customer) => customer.id === value) ?? null) }}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose customer")} /></SelectTrigger><SelectContent>{customers.options.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select>{customers.error ? <p role="alert" className="text-[11.5px] text-[var(--md-red)]">{customers.error}</p> : null}</div></WarehouseFormField>
    <WarehouseFormField label={t("Pallet type")}><Select value={typeCode} onValueChange={setTypeCode}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{huReference?.types.map((type) => <SelectItem key={type.code} value={type.code}>{t(type.name)}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
    <WarehouseFormField label={t("Label code")} hint={t("Leave empty to generate a code.")}><Input dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} className={controlClass}/></WarehouseFormField>
    <WarehouseFormField label={t("Initial location")} hint={locations.hasMore ? t("Search to narrow the location list.") : undefined}><div className="grid gap-1.5"><div className="relative"><Input value={locations.search} onChange={(event) => locations.setSearch(event.target.value)} placeholder={t("Search locations…")} className={controlClass} />{locations.loading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div><Select value={locationId} onValueChange={setLocationId}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose location")} /></SelectTrigger><SelectContent>{availableLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select>{locations.error ? <p role="alert" className="text-[11.5px] text-[var(--md-red)]">{locations.error}</p> : null}</div></WarehouseFormField>
  </div><DialogFooter className={warehouseDialogFooterClass}><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button disabled={saving || !facilityId || !typeCode} onClick={() => void save()} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving ? <Loader2 className="size-4 animate-spin"/> : <PackagePlus className="size-4"/>}{t("Create pallet")}</Button></DialogFooter></DialogContent></Dialog>
}

function EmptyLocationDialog({ open, onOpenChange, reference, fixedFacilityId, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; reference: WarehouseOrderReference | null; fixedFacilityId: string; onChanged: () => void }) {
  const { t } = useLanguage()
  const [facilityId, setFacilityId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const locations = useWarehouseActionLocations(open, facilityId)
  const selectableLocations = locations.options.filter((location) => location.typeCode !== "investigation")

  useEffect(() => {
    if (!open) return
    setFacilityId(fixedFacilityId || reference?.facilities[0]?.id || "")
    setLocationId("")
    setNotes("")
    setConfirmed(false)
  }, [open, fixedFacilityId, reference])
  useEffect(() => {
    if (!open || locationId || !selectableLocations[0]) return
    setLocationId(selectableLocations[0].id)
  }, [locationId, open, selectableLocations])
  async function save() { setSaving(true); try { await reportWarehouseLocationEmpty({ facilityId, locationId, notes: notes || null }); toast.success(t("Location investigation opened")); onOpenChange(false); onChanged() } catch (cause) { toast.error(t("Investigation could not be opened"), { description: message(cause) }) } finally { setSaving(false) } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 sm:max-w-[560px]"><DialogHeader className={warehouseDialogHeaderClass}><DialogTitle>{t("Location is physically empty")}</DialogTitle><DialogDescription>{t("Expected stock will be held as unlocated while a count and investigation are opened. No stock is silently written off.")}</DialogDescription></DialogHeader><div className="grid gap-4 px-6 py-5">
    <WarehouseFormField label={t("Warehouse")}><Select value={facilityId} onValueChange={(value) => { setFacilityId(value); setLocationId("") }}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
    <WarehouseFormField label={t("Scanned location")} hint={locations.hasMore ? t("Search to narrow the location list.") : undefined}><div className="grid gap-1.5"><div className="relative"><Input value={locations.search} onChange={(event) => locations.setSearch(event.target.value)} placeholder={t("Search locations…")} className={controlClass} />{locations.loading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div><Select value={locationId} onValueChange={setLocationId}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose location")} /></SelectTrigger><SelectContent>{selectableLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select>{locations.error ? <p role="alert" className="text-[11.5px] text-[var(--md-red)]">{locations.error}</p> : null}</div></WarehouseFormField>
    <WarehouseFormField label={t("What was checked?")}><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]"/></WarehouseFormField><label className="flex items-start gap-3 rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.06)] p-3 text-[12px] text-[var(--md-text)]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5"/><span>{t("I scanned and physically checked the whole location and confirm it is empty.")}</span></label></div><DialogFooter className={warehouseDialogFooterClass}><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button disabled={saving || !facilityId || !locationId || !confirmed} onClick={() => void save()} className="bg-[var(--md-red)] text-white">{saving ? <Loader2 className="size-4 animate-spin"/> : <MapPinOff className="size-4"/>}{t("Open investigation")}</Button></DialogFooter></DialogContent></Dialog>
}

const resolutionLabels: Record<string, string> = {
  found: "The stock was found",
  data_error: "The report was wrong",
  request_loss: "Ask for a write-off",
  approve_loss: "Approve the write-off",
}

function ExceptionPanel({ exception, facilityName, open, onClose, onChanged }: { exception: WarehouseInventoryException | null; facilityName: string | null; open: boolean; onClose: () => void; onChanged: () => void }) {
  const { language, t } = useLanguage()
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  const [resolution, setResolution] = useState<"found" | "data_error" | "request_loss" | "approve_loss">("found")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const retainedLocations = useMemo<WarehouseActionLocation[]>(() => {
    if (!exception) return []
    return [
      exception.expectedLocationId && exception.expectedLocationCode ? { id: exception.expectedLocationId, facilityId: exception.facilityId, code: exception.expectedLocationCode, zoneName: null, statusCode: "available" } : null,
      exception.actualLocationId && exception.actualLocationCode ? { id: exception.actualLocationId, facilityId: exception.facilityId, code: exception.actualLocationCode, zoneName: null, statusCode: "available" } : null,
    ].filter(Boolean) as WarehouseActionLocation[]
  }, [exception])
  const locationSelector = useWarehouseActionLocations(open, exception?.facilityId ?? "", retainedLocations)

  useEffect(() => {
    if (!exception || !open) return
    setResolution(exception.statusCode === "pending_approval" ? "approve_loss" : "found")
    setLocationId(exception.actualLocationId ?? exception.expectedLocationId ?? "")
    setNotes("")
  }, [exception, open])

  if (!exception) return null
  const currentException = exception
  const options = exception.statusCode === "pending_approval" ? ["approve_loss"] as const : ["found", "data_error", "request_loss"] as const
  const writeOff = resolution.includes("loss")

  async function save() {
    setSaving(true)
    try {
      await resolveWarehouseLocationException({ facilityId: currentException.facilityId, exceptionId: currentException.id, resolution, actualLocationId: resolution === "found" ? locationId : null, notes: notes || null })
      toast.success(t(resolution === "request_loss" ? "Write-off sent for approval" : "Exception closed"))
      onClose()
      onChanged()
    } catch (cause) {
      toast.error(t("Exception could not be updated"), { description: message(cause) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <RecordDrawer
      open={open}
      onClose={onClose}
      eyebrow={t(exception.typeCode)}
      title={exception.title}
      icon={ShieldAlert}
      summary={(
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-[13px] font-medium leading-5 text-[var(--md-ink)]" dir="auto">{t(exception.title)}</p>
            <StatusPill tone={exception.severityCode === "high" ? "red" : "amber"}>{t(exception.severityCode)}</StatusPill>
          </div>
          {exception.description ? <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--md-text)]" dir="auto">{t(exception.description)}</p> : null}
          <dl className="mt-3 shadow-[var(--md-stroke-top)] pt-2.5">
            <FactRow label="Status" value={t(exception.statusCode)} />
            <FactRow label="Warehouse" value={facilityName} />
            <FactRow label="Expected at" value={exception.expectedLocationCode} code />
            <FactRow label="Found at" value={exception.actualLocationCode} code />
            <FactRow label="Raised" value={dateTime.format(new Date(exception.raisedAt))} />
          </dl>
        </>
      )}
      actions={(
        <Button
          type="button"
          disabled={saving || !notes || (resolution === "found" && !locationId)}
          onClick={() => void save()}
          className={cn(
            "h-9 rounded-[var(--md-radius-md)] px-3.5 text-[12.5px] font-medium transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:transform-none",
            writeOff ? "bg-[var(--md-red)] text-white hover:bg-[color-mix(in_srgb,var(--md-red),black_8%)]" : "bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]",
          )}
        >
          {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" strokeWidth={1.6} /> : <AlertTriangle data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
          {t(resolution === "request_loss" ? "Send for approval" : resolution === "approve_loss" ? "Approve write-off" : "Close exception")}
        </Button>
      )}
    >
      <FactCard>
      <WarehouseFormField label={t("What happened?")}>
        <Select value={resolution} onValueChange={(value: typeof resolution) => setResolution(value)}>
          <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{t(resolutionLabels[option])}</SelectItem>)}</SelectContent>
        </Select>
      </WarehouseFormField>

      {resolution === "found" ? (
        <WarehouseFormField label={t("Scanned at")} required hint={locationSelector.hasMore ? t("Search to narrow the location list.") : undefined}>
          <div className="relative mb-1.5"><Input value={locationSelector.search} onChange={(event) => locationSelector.setSearch(event.target.value)} placeholder={t("Search locations…")} className={controlClass} />{locationSelector.loading ? <Loader2 className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
            <SelectContent>{locationSelector.options.filter((location) => !location.statusCode || location.statusCode === "available").map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent>
          </Select>
          {locationSelector.error ? <p role="alert" className="mt-1 text-[11.5px] text-[var(--md-red)]">{locationSelector.error}</p> : null}
        </WarehouseFormField>
      ) : null}

      <WarehouseFormField label={t("What did you check?")} required>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[12.5px] shadow-[var(--md-shadow-line)]" />
      </WarehouseFormField>

      {writeOff ? (
        <div className="flex gap-2.5 rounded-[var(--md-radius-md)] bg-[rgba(209,78,78,0.07)] p-3 text-[12px] leading-5 text-[var(--md-text)]">
          <ShieldAlert className="size-4 shrink-0 text-[var(--md-red)]" strokeWidth={1.4} />
          <p>{t(resolution === "request_loss"
            ? "This drafts the adjustment. Another warehouse user has to approve it before any stock leaves the books."
            : "Approving posts the loss for good. The investigation trail stays attached to it.")}</p>
        </div>
      ) : null}
      </FactCard>
    </RecordDrawer>
  )
}
