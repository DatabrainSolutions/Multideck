import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { FilterChips, SegmentedControl } from "@/components/multideck/workflow-components"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, sharedElementTransition, staggerRamp } from "@/lib/motion"
import { minutesToTimeKey, useCalendarEventDrag, type CalendarDragMode, type CalendarDragPreview } from "@/lib/calendar-drag"
import type { WarehouseHeaderAction } from "@/lib/warehouse"
import { useKanbanPointerDrag } from "@/lib/kanban-drag"
import { useLanguage } from "@/i18n/language-provider"
import {
  warehouseCalendarCustomers,
  warehouseCalendarEvents,
  warehouseCalendarViewModes,
  warehouseGoodsInKanbanColumns,
  warehouseGoodsMovements,
  warehouseGoodsOutKanbanColumns,
  warehouseMetrics,
  warehouseOrderFilters,
  warehouseOrders,
  warehouseProducts,
  warehouseProductFilters,
  warehouseStockFilters,
  warehouseStockRows,
  type StatusTone,
} from "@/data/multideck-data"

type WarehouseTableColumn<T> = {
  key: string
  label: string
  kind?: DataTableColumn<T>["kind"]
  width?: number
  minWidth?: number
  resizable?: boolean
  sortValue?: DataTableColumn<T>["sortValue"]
  className?: string
  cellClassName?: string
  align?: "left" | "right" | "center"
  render: (row: T) => ReactNode
}

const rowReveal = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: mdMotion.smooth,
  },
}

const tableBodyReveal = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.04,
    },
  },
}

// One value for every select-to-detail morph in Warehouse.
const stockMorphTransition = sharedElementTransition
export type WarehouseKanbanCardData = {
  id: string
  title: string
  meta: string
  status: string
  tone: StatusTone
}

export type WarehouseKanbanColumnSource = {
  id?: string
  title: string
  meta?: string
  cards: readonly WarehouseKanbanCardData[]
}

type SortableWarehouseKanbanColumn = {
  id: string
  title: string
  meta?: string
  cards: WarehouseKanbanCardData[]
}

type WarehouseCalendarViewMode = (typeof warehouseCalendarViewModes)[number]
export type WarehouseMetric = {
  label: string
  value: string
  detail: string
  tone: StatusTone
  icon: LucideIcon
}
export type WarehouseProduct = (typeof warehouseProducts)[number]
export type WarehouseOrder = {
  id: string
  customer: string
  route: string
  type: string
  lines: number
  value: string
  due: string
  window: string
  status: string
  tone: StatusTone
}
export type WarehouseMovement = {
  id: string
  direction: "In" | "Out"
  product: string
  reference: string
  quantity: string
  dock: string
  time: string
  status: string
  tone: StatusTone
}
export type WarehouseCalendarCustomer = {
  id: string
  name: string
  shortName: string
  color: string
}
export type WarehouseCalendarEvent = {
  id: string
  date: string
  time: string
  endTime: string
  title: string
  type: string
  /** Which way the stock is moving. Drawn as a texture rather than a label. */
  direction: "inbound" | "outbound"
  customerId: string
  tone: StatusTone
  reference?: string
  location?: string
}

type WarehouseCalendarDay = {
  dateKey: string
  date: Date
  label: string
  dateLabel: string
  dayNumber: string
  outsideMonth: boolean
  events: WarehouseCalendarEvent[]
}

const warehouseCalendarGridStartHour = 5
const warehouseCalendarGridEndHour = 24
const warehouseCalendarHourHeight = 48
const warehouseCalendarGridStartMinutes = warehouseCalendarGridStartHour * 60
const warehouseCalendarGridEndMinutes = warehouseCalendarGridEndHour * 60
const warehouseCalendarGridHeight = (warehouseCalendarGridEndHour - warehouseCalendarGridStartHour) * warehouseCalendarHourHeight
const warehouseCalendarHourMarks = Array.from(
  { length: warehouseCalendarGridEndHour - warehouseCalendarGridStartHour + 1 },
  (_, index) => warehouseCalendarGridStartHour + index,
)

const warehouseCalendarCustomerFallback = warehouseCalendarCustomers.find((customer) => customer.id === "internal") ?? warehouseCalendarCustomers[0]

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfCalendarWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

function startOfCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getWeekDateKeys(start: Date) {
  return Array.from({ length: 7 }, (_, index) => formatDateKey(addCalendarDays(start, index)))
}

function getMonthDateKeys(monthStart: Date) {
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const visibleDayCount = firstWeekday + daysInMonth > 35 ? 42 : 35
  const gridStart = addCalendarDays(monthStart, -firstWeekday)

  return Array.from({ length: visibleDayCount }, (_, index) => formatDateKey(addCalendarDays(gridStart, index)))
}

function getWarehouseCalendarCustomer(customerId: string, customers: readonly WarehouseCalendarCustomer[] = warehouseCalendarCustomers) {
  return customers.find((customer) => customer.id === customerId) ?? customers.find((customer) => customer.id === "internal") ?? warehouseCalendarCustomerFallback
}

function getTimeInMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

function getCalendarEventEndMinutes(event: WarehouseCalendarEvent) {
  const start = getTimeInMinutes(event.time)
  const end = getTimeInMinutes(event.endTime)
  return end <= start ? end + 24 * 60 : end
}

function getHourLabel(hour: number) {
  const normalizedHour = hour % 24
  if (normalizedHour === 0) return "12 AM"
  if (normalizedHour < 12) return `${normalizedHour} AM`
  if (normalizedHour === 12) return "12 PM"
  return `${normalizedHour - 12} PM`
}

function getCalendarEventsByDate(events: readonly WarehouseCalendarEvent[] = warehouseCalendarEvents) {
  return events.reduce<Record<string, WarehouseCalendarEvent[]>>((eventsByDate, event) => {
    eventsByDate[event.date] = [...(eventsByDate[event.date] ?? []), event]
    return eventsByDate
  }, {})
}

function buildCalendarDays(view: WarehouseCalendarViewMode, language: string, anchorDate: Date, eventsByDate: Record<string, WarehouseCalendarEvent[]>): WarehouseCalendarDay[] {
  const weekdayFormatter = new Intl.DateTimeFormat(language, { weekday: "short" })
  const dateFormatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" })
  const dayNumberFormatter = new Intl.DateTimeFormat(language, { day: "numeric" })
  const visibleMonth = startOfCalendarMonth(anchorDate)
  const dateKeys = view === "Week" ? getWeekDateKeys(startOfCalendarWeek(anchorDate)) : getMonthDateKeys(visibleMonth)

  return dateKeys.map((dateKey) => {
    const date = parseDateKey(dateKey)

    return {
      dateKey,
      date,
      label: weekdayFormatter.format(date),
      dateLabel: dateFormatter.format(date),
      dayNumber: dayNumberFormatter.format(date),
      outsideMonth: date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear(),
      events: [...(eventsByDate[dateKey] ?? [])].sort((firstEvent, secondEvent) => getTimeInMinutes(firstEvent.time) - getTimeInMinutes(secondEvent.time)),
    }
  })
}

function formatCalendarPeriodLabel(view: WarehouseCalendarViewMode, language: string, anchorDate: Date) {
  if (view === "Month") {
    return new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(startOfCalendarMonth(anchorDate))
  }

  const start = startOfCalendarWeek(anchorDate)
  const end = addCalendarDays(start, 6)
  const startFormatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" })
  const endFormatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" })

  return `${startFormatter.format(start)} - ${endFormatter.format(end)}`
}

type PositionedWarehouseCalendarEvent = {
  event: WarehouseCalendarEvent
  top: number
  height: number
  column: number
  columnCount: number
}

function getCalendarEventLayout(events: readonly WarehouseCalendarEvent[]): PositionedWarehouseCalendarEvent[] {
  const sortedEvents = [...events].sort((firstEvent, secondEvent) => getTimeInMinutes(firstEvent.time) - getTimeInMinutes(secondEvent.time))
  const clusters: WarehouseCalendarEvent[][] = []
  let activeCluster: WarehouseCalendarEvent[] = []
  let activeClusterEnd = -Infinity

  sortedEvents.forEach((event) => {
    const eventStart = getTimeInMinutes(event.time)
    const eventEnd = getCalendarEventEndMinutes(event)

    if (!activeCluster.length || eventStart < activeClusterEnd) {
      activeCluster.push(event)
      activeClusterEnd = Math.max(activeClusterEnd, eventEnd)
      return
    }

    clusters.push(activeCluster)
    activeCluster = [event]
    activeClusterEnd = eventEnd
  })

  if (activeCluster.length) clusters.push(activeCluster)

  return clusters.flatMap((cluster) => {
    const columnEndTimes: number[] = []
    const positionedCluster = cluster.map((event) => {
      const eventStart = getTimeInMinutes(event.time)
      const eventEnd = getCalendarEventEndMinutes(event)
      const reusableColumnIndex = columnEndTimes.findIndex((endTime) => endTime <= eventStart)
      const column = reusableColumnIndex === -1 ? columnEndTimes.length : reusableColumnIndex
      columnEndTimes[column] = eventEnd

      const visibleStart = clamp(eventStart, warehouseCalendarGridStartMinutes, warehouseCalendarGridEndMinutes)
      const visibleEnd = clamp(eventEnd, warehouseCalendarGridStartMinutes, warehouseCalendarGridEndMinutes)
      const top = ((visibleStart - warehouseCalendarGridStartMinutes) / 60) * warehouseCalendarHourHeight
      const height = Math.max(((visibleEnd - visibleStart) / 60) * warehouseCalendarHourHeight, 34)

      return { event, top, height, column, columnCount: 1 }
    })
    const columnCount = Math.max(columnEndTimes.length, 1)

    return positionedCluster.map((positionedEvent) => ({ ...positionedEvent, columnCount }))
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function slugifyKanbanId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

function createKanbanColumns(columns: readonly WarehouseKanbanColumnSource[], boardId: string): SortableWarehouseKanbanColumn[] {
  return columns.map((column, index) => ({
    id: column.id ?? `${boardId}-${slugifyKanbanId(column.title)}-${index}`,
    title: column.title,
    meta: column.meta,
    cards: column.cards.map((card) => ({ ...card })),
  }))
}

function countKanbanCards(columns: readonly WarehouseKanbanColumnSource[] | readonly SortableWarehouseKanbanColumn[]) {
  return columns.reduce((total, column) => total + column.cards.length, 0)
}

function WarehouseCode({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-i18n-skip dir="ltr" className={cn("text-[12px] font-medium tracking-normal text-[var(--md-ink)] tabular-nums", className)}>
      {children}
    </span>
  )
}

function WarehouseDetailMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: ReactNode
  tone?: StatusTone
}) {
  return (
    <div
      className="min-w-0 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--warehouse-detail-tone)_8%,var(--md-surface-soft))] px-2.5 py-2 shadow-[var(--md-shadow-line)]"
      style={{ "--warehouse-detail-tone": toneToVar(tone) } as CSSProperties}
    >
      <p className="truncate text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
      <p className="mt-1 truncate text-[13px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p>
    </div>
  )
}

function WarehouseDetailField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 py-2 text-start">
      <span className="text-[11.5px] font-medium text-[var(--md-subtle)]">{label}</span>
      <span className="min-w-0 text-[12.5px] leading-5 text-[var(--md-ink)]">{children}</span>
    </div>
  )
}

function WarehouseProductDetail({ product }: { product: WarehouseProduct }) {
  const { language, t } = useLanguage()
  const formatter = new Intl.NumberFormat(language)

  return (
    <div className="grid gap-3 text-start">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Product detail")}</p>
          <p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]">{product.name}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{product.customer} - {product.category}</p>
        </div>
        <StatusPill tone={product.tone}>{product.status}</StatusPill>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <WarehouseDetailMetric label={t("On hand")} value={formatter.format(product.onHand)} tone={product.tone} />
        <WarehouseDetailMetric label={t("Available")} value={formatter.format(product.available)} tone="green" />
        <WarehouseDetailMetric label={t("Inbound")} value={formatter.format(product.inbound)} tone={product.inbound > 0 ? "teal" : "neutral"} />
      </div>

      <div className="divide-y divide-[rgba(90,103,100,0.09)] shadow-[var(--md-stroke-top)]">
        <WarehouseDetailField label={t("SKU")}><WarehouseCode>{product.sku}</WarehouseCode></WarehouseDetailField>
        <WarehouseDetailField label={t("HS code")}><WarehouseCode>{product.hsCode}</WarehouseCode></WarehouseDetailField>
        <WarehouseDetailField label={t("Supplier ref")}><WarehouseCode>{product.supplierRef}</WarehouseCode></WarehouseDetailField>
        <WarehouseDetailField label={t("Customer")}>{product.customer}</WarehouseDetailField>
        <WarehouseDetailField label={t("Category")}>{product.category}</WarehouseDetailField>
        <WarehouseDetailField label={t("Owner")}>
          <span data-i18n-skip dir="ltr" className="inline-grid size-6 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[11px] font-medium text-[var(--md-accent)]">
            {product.owner}
          </span>
        </WarehouseDetailField>
      </div>
    </div>
  )
}

function WarehouseOrderDetail({ order }: { order: WarehouseOrder }) {
  const { t } = useLanguage()

  return (
    <div className="grid gap-3 text-start">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Order detail")}</p>
          <div className="mt-1">
            <WarehouseCode className="text-[14px]">{order.id}</WarehouseCode>
          </div>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{order.customer}</p>
        </div>
        <StatusPill tone={order.tone}>{order.status}</StatusPill>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <WarehouseDetailMetric label={t("Lines")} value={<span data-i18n-skip dir="ltr">{order.lines}</span>} tone={order.tone} />
        <WarehouseDetailMetric label={t("Value")} value={<span data-i18n-skip dir="ltr">{order.value}</span>} tone="green" />
        <WarehouseDetailMetric label={t("Due")} value={order.due} tone={order.tone} />
      </div>

      <div className="divide-y divide-[rgba(90,103,100,0.09)] shadow-[var(--md-stroke-top)]">
        <WarehouseDetailField label={t("Type")}>{order.type}</WarehouseDetailField>
        <WarehouseDetailField label={t("Route")}>{order.route}</WarehouseDetailField>
        <WarehouseDetailField label={t("Window")}>{order.window}</WarehouseDetailField>
        <WarehouseDetailField label={t("Customer")}>{order.customer}</WarehouseDetailField>
      </div>
    </div>
  )
}

function WarehouseSearch({ placeholder = "Search SKU, order, customer, bin..." }: { placeholder?: string }) {
  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-[360px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.25} />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 pl-9 pr-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
      />
    </div>
  )
}

type WarehouseFilterSelectOption = {
  label: string
  value: string
  skipI18n?: boolean
}

function WarehouseFilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: WarehouseFilterSelectOption[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex min-w-[178px] flex-col gap-1">
      <span className="px-1 text-[11px] font-medium text-[var(--md-subtle)]">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-9 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/42 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/64 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-[13px]">
              <span data-i18n-skip={option.skipI18n ? true : undefined} dir={option.skipI18n ? "ltr" : "auto"}>
                {option.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function WarehouseToolbar({
  title,
  meta,
  children,
}: {
  title?: string
  meta?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[var(--md-gap-md)] lg:flex-row lg:items-center lg:justify-between">
      {title ? <SectionHeader title={title} meta={meta} metaPlacement="responsive-inline" className="min-w-0 flex-1" /> : null}
      <div className={cn("flex flex-wrap items-center gap-2", !title && "lg:ms-auto")}>{children}</div>
    </div>
  )
}

export function WarehouseInventoryTable<T extends { id: string }>({
  rows,
  columns,
  toolbarTitle,
  minWidth = 1060,
  emptyMessage = "Nothing matches this view",
  emptyHint,
  onRowClick,
  rowClassName,
  renderExpandedRow,
  renderRowDetail,
  rowDetailLabel,
}: {
  rows: T[]
  columns: WarehouseTableColumn<T>[]
  toolbarTitle?: string
  minWidth?: number
  emptyMessage?: string
  /** The one thing to do next. Defaults to clearing a filter. */
  emptyHint?: string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  renderExpandedRow?: (row: T, columnCount: number) => ReactNode
  renderRowDetail?: (row: T) => ReactNode
  rowDetailLabel?: (row: T) => string
}) {
  const { direction, t } = useLanguage()
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const dataTableColumns = useMemo<DataTableColumn<T>[]>(() => columns.map((column) => ({
    id: column.key,
    label: column.label,
    kind: column.kind ?? (column.align === "right" ? "number" : "text"),
    align: column.align === "right" ? "end" : column.align === "center" ? "center" : "start",
    width: column.width,
    minWidth: column.minWidth,
    resizable: column.resizable,
    sortValue: column.sortValue,
    headerClassName: column.className,
    cellClassName: column.cellClassName,
    cell: column.render,
  })), [columns])

  useEffect(() => {
    if (openRowId && !rows.some((row) => row.id === openRowId)) setOpenRowId(null)
  }, [openRowId, rows])

  function activateRow(row: T) {
    onRowClick?.(row)
    if (!renderRowDetail) return
    setOpenRowId((current) => current === row.id ? null : row.id)
  }

  return (
    <DataTable
      ariaLabel="Warehouse inventory"
      columnsButtonLabel="Manage warehouse columns"
      columns={dataTableColumns}
      rows={rows}
      getRowKey={(row) => row.id}
      toolbarTabs={toolbarTitle ? <h2 className="truncate text-[14px] font-medium text-[var(--md-ink)]">{toolbarTitle}</h2> : undefined}
      minimumWidth={minWidth}
      rowClassName={(row) => cn("h-[52px]", openRowId === row.id && "bg-[var(--md-accent-a055)]", rowClassName?.(row))}
      onRowClick={onRowClick || renderRowDetail ? activateRow : undefined}
      rowAriaLabel={onRowClick || renderRowDetail ? (row) => rowDetailLabel?.(row) ?? `Open details for ${row.id}` : undefined}
      rowProps={renderRowDetail ? (row) => ({ "aria-haspopup": "dialog", "aria-expanded": openRowId === row.id }) : undefined}
      wrapRow={renderRowDetail ? (row, rowElement) => (
        <Popover open={openRowId === row.id} onOpenChange={(open) => setOpenRowId(open ? row.id : null)}>
          <PopoverAnchor asChild>{rowElement}</PopoverAnchor>
          <PopoverContent side="bottom" align={direction === "rtl" ? "end" : "start"} sideOffset={8} collisionPadding={16} className="z-[80] w-[min(92vw,372px)] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-2 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
            {renderRowDetail(row)}
          </PopoverContent>
        </Popover>
      ) : undefined}
      renderAfterRow={renderExpandedRow}
      emptyState={<div className="mx-auto max-w-[360px]"><p className="text-[14px] font-medium text-[var(--md-ink)]">{t(emptyMessage)}</p><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t(emptyHint ?? "Clear a filter or widen the search to see more.")}</p></div>}
      tableClassName="text-[12.5px]"
    />
  )
}

function StockBar({ value, tone }: { value: number; tone: StatusTone }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Progress
        value={value}
        className="h-1.5 w-[82px] rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--warehouse-progress)]"
        style={{ "--warehouse-progress": toneToVar(tone) } as CSSProperties}
      />
      <span className="w-10 text-right text-[13px] font-medium tabular-nums text-[var(--md-ink)]">{value}%</span>
    </div>
  )
}

export type WarehouseStockRow = (typeof warehouseStockRows)[number]
export type WarehouseStockBranchLocation = WarehouseStockRow["branchLocations"][number]

const allWarehouseCustomers = "All customers"
const allWarehouseProducts = "All products"
const allWarehouseBatches = "All batches"

function uniqueWarehouseValues(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function makeWarehouseFilterOptions(values: string[], allLabel: string) {
  return [
    { label: allLabel, value: allLabel },
    ...uniqueWarehouseValues(values).map((value) => ({ label: value, value, skipI18n: true })),
  ] satisfies WarehouseFilterSelectOption[]
}

function sumStockBranchMetric(locations: WarehouseStockBranchLocation[], key: "onHand" | "allocated" | "available") {
  return locations.reduce((total, location) => total + location[key], 0)
}

function stockRowForBatch(row: WarehouseStockRow, batch: string): WarehouseStockRow | null {
  if (batch === allWarehouseBatches) return row

  const branchLocations = row.branchLocations.filter((location) => location.lot === batch)
  const primaryLocation = branchLocations[0]

  if (!primaryLocation) return null

  return {
    ...row,
    location: primaryLocation.location,
    zone: primaryLocation.zone,
    lot: batch,
    onHand: sumStockBranchMetric(branchLocations, "onHand"),
    allocated: sumStockBranchMetric(branchLocations, "allocated"),
    available: sumStockBranchMetric(branchLocations, "available"),
    fill: Math.round(branchLocations.reduce((total, location) => total + location.fill, 0) / branchLocations.length),
    nextMovement: branchLocations.length === 1 ? primaryLocation.nextMovement : row.nextMovement,
    status: branchLocations.length === 1 ? primaryLocation.status : row.status,
    tone: branchLocations.length === 1 ? primaryLocation.tone : row.tone,
    branchLocations,
  }
}

const productColumns = [
  {
    key: "product",
    label: "Product",
    className: "min-w-[260px]",
    render: (product: WarehouseProduct) => (
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{product.name}</p>
        <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{product.customer} - {product.category}</p>
      </div>
    ),
  },
  {
    key: "sku",
    label: "SKU",
    render: (product: WarehouseProduct) => <WarehouseCode>{product.sku}</WarehouseCode>,
  },
  {
    key: "hsCode",
    label: "HS code",
    render: (product: WarehouseProduct) => <WarehouseCode className="text-[var(--md-text)]">{product.hsCode}</WarehouseCode>,
  },
  {
    key: "supplier",
    label: "Supplier ref",
    render: (product: WarehouseProduct) => <WarehouseCode className="text-[var(--md-text)]">{product.supplierRef}</WarehouseCode>,
  },
  {
    key: "stock",
    label: "Stock",
    align: "right" as const,
    render: (product: WarehouseProduct) => (
      <div className="text-right">
        <p className="text-[14px] font-medium tabular-nums text-[var(--md-ink)]">{product.onHand}</p>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{product.available} available</p>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (product: WarehouseProduct) => <StatusPill tone={product.tone}>{product.status}</StatusPill>,
  },
  {
    key: "inbound",
    label: "Inbound",
    align: "right" as const,
    render: (product: WarehouseProduct) => <span className="tabular-nums text-[var(--md-ink)]">{product.inbound}</span>,
  },
  {
    key: "owner",
    label: "Owner",
    align: "center" as const,
    render: (product: WarehouseProduct) => (
      <span className="inline-grid size-7 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[11px] font-medium text-[var(--md-accent)]">{product.owner}</span>
    ),
  },
] satisfies WarehouseTableColumn<WarehouseProduct>[]

const stockColumns = [
  {
    key: "location",
    label: "Location",
    className: "min-w-[180px]",
    render: (stock: WarehouseStockRow) => {
      const locationCount = stock.branchLocations.length

      return (
      <div>
        <WarehouseCode>{stock.location}</WarehouseCode>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">
          {locationCount > 1 ? `${locationCount} locations` : stock.zone}
        </p>
      </div>
    )},
  },
  {
    key: "product",
    label: "Product",
    className: "min-w-[270px]",
    render: (stock: WarehouseStockRow) => (
      <div className="min-w-0">
        <motion.p layoutId={`warehouse-stock-product-${stock.id}`} transition={stockMorphTransition} className="truncate text-[14px] font-medium text-[var(--md-ink)]">
          {stock.product}
        </motion.p>
        <motion.p layoutId={`warehouse-stock-customer-${stock.id}`} transition={stockMorphTransition} className="mt-1 truncate text-[12px] text-[var(--md-text)]">
          {stock.customer}
        </motion.p>
      </div>
    ),
  },
  {
    key: "productCode",
    label: "Product code",
    className: "min-w-[190px]",
    render: (stock: WarehouseStockRow) => (
      <motion.span layoutId={`warehouse-stock-code-${stock.id}`} transition={stockMorphTransition}>
        <WarehouseCode className="min-w-0 truncate">{stock.productCode}</WarehouseCode>
      </motion.span>
    ),
  },
  {
    key: "onHand",
    label: "On hand",
    align: "right" as const,
    render: (stock: WarehouseStockRow) => (
      <motion.span layoutId={`warehouse-stock-onhand-${stock.id}`} transition={stockMorphTransition} className="inline-block tabular-nums text-[var(--md-ink)]">
        {stock.onHand}
      </motion.span>
    ),
  },
  {
    key: "allocated",
    label: "Allocated",
    align: "right" as const,
    render: (stock: WarehouseStockRow) => (
      <motion.span layoutId={`warehouse-stock-allocated-${stock.id}`} transition={stockMorphTransition} className="inline-block tabular-nums text-[var(--md-text)]">
        {stock.allocated}
      </motion.span>
    ),
  },
  {
    key: "available",
    label: "Available",
    align: "right" as const,
    render: (stock: WarehouseStockRow) => (
      <motion.span layoutId={`warehouse-stock-available-${stock.id}`} transition={stockMorphTransition} className="inline-block font-medium tabular-nums text-[var(--md-ink)]">
        {stock.available}
      </motion.span>
    ),
  },
  {
    key: "fill",
    label: "Fill",
    align: "right" as const,
    render: (stock: WarehouseStockRow) => <StockBar value={stock.fill} tone={stock.tone} />,
  },
  {
    key: "movement",
    label: "Next movement",
    render: (stock: WarehouseStockRow) => <span className="text-[13px] text-[var(--md-text)]">{stock.nextMovement}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (stock: WarehouseStockRow) => (
      <motion.span layoutId={`warehouse-stock-status-${stock.id}`} transition={stockMorphTransition} className="inline-block">
        <StatusPill tone={stock.tone}>{stock.status}</StatusPill>
      </motion.span>
    ),
  },
] satisfies WarehouseTableColumn<WarehouseStockRow>[]

const orderColumns = [
  {
    key: "order",
    label: "Order",
    className: "min-w-[160px]",
    render: (order: WarehouseOrder) => (
      <div>
        <WarehouseCode>{order.id}</WarehouseCode>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{order.type}</p>
      </div>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    className: "min-w-[230px]",
    render: (order: WarehouseOrder) => (
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{order.customer}</p>
        <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{order.route}</p>
      </div>
    ),
  },
  {
    key: "lines",
    label: "Lines",
    align: "right" as const,
    render: (order: WarehouseOrder) => <span className="tabular-nums text-[var(--md-ink)]">{order.lines}</span>,
  },
  {
    key: "value",
    label: "Value",
    align: "right" as const,
    render: (order: WarehouseOrder) => <span className="font-medium tabular-nums text-[var(--md-ink)]">{order.value}</span>,
  },
  {
    key: "due",
    label: "Due",
    render: (order: WarehouseOrder) => (
      <div>
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{order.due}</p>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{order.window}</p>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (order: WarehouseOrder) => <StatusPill tone={order.tone}>{order.status}</StatusPill>,
  },
] satisfies WarehouseTableColumn<WarehouseOrder>[]

const movementColumns = [
  {
    key: "movement",
    label: "Movement",
    className: "min-w-[190px]",
    render: (movement: WarehouseMovement) => (
      <div className="flex items-center gap-3">
        <span className={cn("grid size-8 place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)]", movement.direction === "In" ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]")}>
          {movement.direction === "In" ? <ArrowDownToLine className="size-4" strokeWidth={1.25} /> : <ArrowUpFromLine className="size-4" strokeWidth={1.25} />}
        </span>
        <div>
          <WarehouseCode>{movement.id}</WarehouseCode>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">Goods {movement.direction.toLowerCase()}</p>
        </div>
      </div>
    ),
  },
  {
    key: "product",
    label: "Product",
    className: "min-w-[260px]",
    render: (movement: WarehouseMovement) => (
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{movement.product}</p>
        <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{movement.reference}</p>
      </div>
    ),
  },
  {
    key: "qty",
    label: "Qty",
    align: "right" as const,
    render: (movement: WarehouseMovement) => <span className="font-medium tabular-nums text-[var(--md-ink)]">{movement.quantity}</span>,
  },
  {
    key: "dock",
    label: "Dock / bin",
    render: (movement: WarehouseMovement) => <WarehouseCode>{movement.dock}</WarehouseCode>,
  },
  {
    key: "time",
    label: "Time",
    render: (movement: WarehouseMovement) => <span className="text-[13px] text-[var(--md-text)]">{movement.time}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (movement: WarehouseMovement) => <StatusPill tone={movement.tone}>{movement.status}</StatusPill>,
  },
] satisfies WarehouseTableColumn<WarehouseMovement>[]

export function WarehouseProductsTable({ rows = warehouseProducts }: { rows?: readonly WarehouseProduct[] }) {
  return (
    <WarehouseInventoryTable
      rows={[...rows]}
      columns={productColumns}
      minWidth={1160}
      emptyHint="Clear a filter or widen the search to see more products."
      emptyMessage="No products match this product view."
      renderRowDetail={(product) => <WarehouseProductDetail product={product} />}
      rowDetailLabel={(product) => `Open product details for ${product.name}`}
    />
  )
}

function stockLocationColumns(stock: WarehouseStockRow) {
  const primaryLocationId = stock.branchLocations[0]?.id

  return [
    {
      key: "location",
      label: "Location",
      className: "min-w-[180px]",
      render: (location: WarehouseStockBranchLocation) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <WarehouseCode>{location.location}</WarehouseCode>
            {location.id === primaryLocationId ? <StatusPill tone="teal">Primary</StatusPill> : null}
          </div>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{location.zone}</p>
        </div>
      ),
    },
    {
      key: "batch",
      label: "Batch",
      className: "min-w-[170px]",
      render: (location: WarehouseStockBranchLocation) => <WarehouseCode className="text-[var(--md-text)]">{location.lot}</WarehouseCode>,
    },
    {
      key: "onHand",
      label: "On hand",
      align: "right" as const,
      render: (location: WarehouseStockBranchLocation) => <span className="tabular-nums text-[var(--md-ink)]">{location.onHand}</span>,
    },
    {
      key: "allocated",
      label: "Allocated",
      align: "right" as const,
      render: (location: WarehouseStockBranchLocation) => <span className="tabular-nums text-[var(--md-text)]">{location.allocated}</span>,
    },
    {
      key: "available",
      label: "Available",
      align: "right" as const,
      render: (location: WarehouseStockBranchLocation) => <span className="font-medium tabular-nums text-[var(--md-ink)]">{location.available}</span>,
    },
    {
      key: "fill",
      label: "Fill",
      align: "right" as const,
      render: (location: WarehouseStockBranchLocation) => <StockBar value={location.fill} tone={location.tone} />,
    },
    {
      key: "movement",
      label: "Next movement",
      className: "min-w-[180px]",
      render: (location: WarehouseStockBranchLocation) => <span className="text-[13px] text-[var(--md-text)]">{location.nextMovement}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (location: WarehouseStockBranchLocation) => <StatusPill tone={location.tone}>{location.status}</StatusPill>,
    },
  ] satisfies WarehouseTableColumn<WarehouseStockBranchLocation>[]
}

function WarehouseSelectedStockPanel({ stock, onBack }: { stock: WarehouseStockRow; onBack: () => void }) {
  const locationCount = stock.branchLocations.length

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={mdMotion.layout}
      className="grid gap-3"
    >
      <Surface padding="md" className="rounded-[var(--md-radius-xl)] bg-white/62">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-[var(--md-radius-lg)] bg-white/44 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/72"
            onClick={onBack}
          >
            <ArrowLeft data-icon="inline-start" className="size-4" strokeWidth={1.25} />
            Back to stock table
          </Button>
          <StatusPill tone="neutral">{locationCount} location{locationCount === 1 ? "" : "s"}</StatusPill>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">Selected product</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <motion.span layoutId={`warehouse-stock-code-${stock.id}`} transition={stockMorphTransition}>
                <WarehouseCode className="text-[15px]">{stock.productCode}</WarehouseCode>
              </motion.span>
              <motion.span layoutId={`warehouse-stock-status-${stock.id}`} transition={stockMorphTransition} className="inline-block">
                <StatusPill tone={stock.tone}>{stock.status}</StatusPill>
              </motion.span>
              <span className="rounded-full bg-[rgba(90,103,100,0.08)] px-3 py-1 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                {locationCount} location{locationCount === 1 ? "" : "s"}
              </span>
            </div>
            <motion.p layoutId={`warehouse-stock-product-${stock.id}`} transition={stockMorphTransition} className="mt-2 text-[15px] font-medium text-[var(--md-ink)]">
              {stock.product}
            </motion.p>
            <motion.p layoutId={`warehouse-stock-customer-${stock.id}`} transition={stockMorphTransition} className="mt-1 text-[13px] text-[var(--md-text)]">
              {stock.customer}
            </motion.p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <WarehouseDetailMetric label="On hand" value={<motion.span layoutId={`warehouse-stock-onhand-${stock.id}`} transition={stockMorphTransition} data-i18n-skip dir="ltr">{stock.onHand}</motion.span>} tone={stock.tone} />
            <WarehouseDetailMetric label="Allocated" value={<motion.span layoutId={`warehouse-stock-allocated-${stock.id}`} transition={stockMorphTransition} data-i18n-skip dir="ltr">{stock.allocated}</motion.span>} tone="amber" />
            <WarehouseDetailMetric label="Available" value={<motion.span layoutId={`warehouse-stock-available-${stock.id}`} transition={stockMorphTransition} data-i18n-skip dir="ltr">{stock.available}</motion.span>} tone="green" />
          </div>
        </div>
      </Surface>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-medium text-[var(--md-ink)]">Location breakdown</h3>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">All warehouse locations for the selected product code.</p>
          </div>
          <StatusPill tone="neutral">{locationCount} rows</StatusPill>
        </div>
        <WarehouseInventoryTable
          rows={[...stock.branchLocations]}
          columns={stockLocationColumns(stock)}
          minWidth={1080}
          emptyHint="This item has no stock in any location yet."
          emptyMessage="No locations match this stock view."
        />
      </div>
    </motion.section>
  )
}

export function WarehouseStockTable({
  rows = warehouseStockRows,
  selectedStockId,
  onSelectStock,
}: {
  rows?: WarehouseStockRow[]
  selectedStockId?: string | null
  onSelectStock?: (stock: WarehouseStockRow) => void
}) {
  return (
    <WarehouseInventoryTable
      rows={[...rows]}
      columns={stockColumns}
      minWidth={1340}
      emptyHint="Clear a filter or widen the search to see more stock."
      emptyMessage="No stock rows match this view."
      onRowClick={onSelectStock}
      rowClassName={(row) => row.id === selectedStockId ? "bg-[var(--md-accent-a055)] shadow-[inset_3px_0_0_var(--md-accent)]" : undefined}
    />
  )
}

export function WarehouseOrdersTable({ rows = warehouseOrders, toolbarTitle }: { rows?: readonly WarehouseOrder[]; toolbarTitle?: string }) {
  return (
    <WarehouseInventoryTable
      rows={[...rows]}
      columns={orderColumns}
      toolbarTitle={toolbarTitle}
      minWidth={980}
      emptyHint="Clear a filter or widen the search to see more orders."
      emptyMessage="No orders match this view."
      renderRowDetail={(order) => <WarehouseOrderDetail order={order} />}
      rowDetailLabel={(order) => `Open order details for ${order.id}`}
    />
  )
}

function WarehouseMovementsTable({ rows = warehouseGoodsMovements }: { rows?: readonly WarehouseMovement[] }) {
  return (
    <WarehouseInventoryTable
      rows={[...rows]}
      columns={movementColumns}
      minWidth={1060}
      emptyHint="Every receipt and dispatch posted today appears here."
      emptyMessage="No goods movements match this view."
    />
  )
}

/**
 * The warehouse header band. It is the shared `KpiStrip` at compact density and
 * seven across, so a warehouse figure looks and behaves exactly like one on the
 * operations and CRM dashboards. The wrapper carries the container the strip's
 * column queries resolve against.
 */
export function WarehouseMetricStrip({ metrics = warehouseMetrics }: { metrics?: readonly WarehouseMetric[] }) {
  const { t } = useLanguage()
  // Translated here rather than inside the strip: the cell renders the label as
  // given, and the shared component has no reason to know about the language layer.
  const kpis = useMemo(
    () => metrics.map((metric) => ({ ...metric, label: t(metric.label), detail: t(metric.detail) })),
    [metrics, t],
  )

  return (
    <div className="md-kpi-scope">
      <KpiStrip kpis={kpis} columns={7} density="compact" />
    </div>
  )
}

/**
 * One live warehouse figure as a chip, for the screens that give the header row
 * to the work rather than to a metric band. A chip with a route is a shortcut to
 * the screen that answers it; one without is a plain readout.
 */
function WarehouseHeaderChip({ action, onNavigate }: { action: WarehouseHeaderAction; onNavigate?: (route: string) => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const Icon = action.icon
  const route = action.route
  const label = t(action.label)

  const body = (
    <>
      <Icon className="size-3.5 shrink-0 transition-opacity duration-200 group-hover:opacity-100" strokeWidth={1.4} style={{ color: toneToVar(action.tone), opacity: 0.85 }} />
      <span className="truncate text-[12px] font-medium text-[var(--md-text)] transition-colors duration-200 group-hover:text-[var(--md-ink)]">{label}</span>
      <StatusPill tone={action.tone}>{action.value}</StatusPill>
    </>
  )

  const shell = "group flex h-9 min-w-0 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] ps-2.5 pe-1.5 shadow-[var(--md-shadow-line)]"

  if (!route || !onNavigate) {
    return <div className={shell}>{body}</div>
  }

  return (
    <motion.button
      type="button"
      onClick={() => onNavigate(route)}
      aria-label={`${label}: ${action.value}`}
      className={cn(shell, "cursor-pointer outline-none transition-shadow duration-200 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]")}
      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
    >
      {body}
    </motion.button>
  )
}

/**
 * The warehouse page header: title, one line of orientation, the live figures an
 * operator needs regardless of which warehouse screen they are on. The title
 * carries no icon tile — the sidebar already says which
 * area this is, and the tile only pushed the table further down the screen.
 */
export function WarehousePageHeader({
  customer = false,
  actions = [],
  onNavigate,
  title = "Warehouse",
  description,
  children,
}: {
  customer?: boolean
  /** Live figures shown beside the page actions. Empty hides the group. */
  actions?: readonly WarehouseHeaderAction[]
  onNavigate?: (route: string) => void
  /** The active warehouse workspace, shown in the page orientation. */
  title?: string
  /** One concise description of the active workspace. */
  description?: string | null
  /** Contextual controls that belong on the same row as the page orientation. */
  children?: ReactNode
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const resolvedDescription = description === null
    ? null
    : description ?? (customer ? "Check your stock, manage items, and send inbound or outbound requests to the warehouse team." : "Stock, movements, orders and operator planning in one workspace.")

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t(title)}</h1>
        {resolvedDescription ? <p className="mt-0.5 max-w-[680px] text-[13px] leading-5 text-[var(--md-text)]">{t(resolvedDescription)}</p> : null}
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 md:justify-end">
        {children}
        {/* The chips arrive on a short ramp so the group settles as one band
            rather than three separate pop-ins, and they animate in place: the
            figure inside a chip can update without the row rebuilding. */}
        <AnimatePresence initial={false}>
          {actions.map((action, index) => (
            <motion.div
              key={action.label}
              layout={shouldReduceMotion ? false : "position"}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98, transition: mdMotion.exit }}
              transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.04) }}
              className="min-w-0"
            >
              <WarehouseHeaderChip action={action} onNavigate={onNavigate} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function WarehouseActivityPanel({ rows = warehouseGoodsMovements }: { rows?: readonly WarehouseMovement[] }) {
  const shouldReduceMotion = useReducedMotion()
  const { t } = useLanguage()

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="grid grid-cols-1 items-end gap-3 px-5 py-4 shadow-[var(--md-stroke-bottom)] sm:grid-cols-[minmax(0,1fr)_94px_112px]">
        <SectionHeader title={t("Recent warehouse activity")} />
        <span className="hidden text-end text-[11px] font-medium text-[var(--md-subtle)] sm:block">{t("When")}</span>
        <span className="hidden text-end text-[11px] font-medium text-[var(--md-subtle)] sm:block">{t("Status")}</span>
      </div>
      <motion.div
        className="divide-y divide-[rgba(90,103,100,0.09)]"
        variants={shouldReduceMotion ? undefined : tableBodyReveal}
        initial={shouldReduceMotion ? undefined : "hidden"}
        animate={shouldReduceMotion ? undefined : "show"}
      >
        {rows.slice(0, 5).map((movement) => (
          <motion.div key={movement.id} variants={shouldReduceMotion ? undefined : rowReveal} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[34px_minmax(0,1fr)_94px_112px] sm:gap-3">
            <span className={cn("row-span-2 grid size-[34px] place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)] sm:row-span-1", movement.direction === "In" ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]")}>
              {movement.direction === "In" ? <ArrowDownToLine className="size-4" strokeWidth={1.25} /> : <ArrowUpFromLine className="size-4" strokeWidth={1.25} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{movement.product}</p>
              <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{movement.reference}</p>
            </div>
            <div className="col-start-2 row-start-2 text-start sm:col-start-3 sm:row-start-1 sm:text-end">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">{movement.time}</p>
            </div>
            <div className="col-start-3 row-span-2 row-start-1 justify-self-end sm:col-start-4 sm:row-span-1"><StatusPill tone={movement.tone}>{movement.status}</StatusPill></div>
          </motion.div>
        ))}
        {!rows.length ? <p className="px-5 py-8 text-center text-[13px] text-[var(--md-subtle)]">{t("No warehouse movements have been posted yet.")}</p> : null}
      </motion.div>
    </Surface>
  )
}

export function WarehouseDashboard({
  metrics = warehouseMetrics,
  orders = warehouseOrders,
  movements = warehouseGoodsMovements,
}: {
  metrics?: readonly WarehouseMetric[]
  orders?: readonly WarehouseOrder[]
  movements?: readonly WarehouseMovement[]
}) {
  const { t } = useLanguage()

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseMetricStrip metrics={metrics} />
      <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <WarehouseOrdersTable rows={orders.slice(0, 5)} toolbarTitle={t("Open warehouse orders")} />
        <WarehouseActivityPanel rows={movements} />
      </div>
    </div>
  )
}

export function WarehouseOrdersView({ rows: sourceRows = warehouseOrders }: { rows?: readonly WarehouseOrder[] }) {
  const [activeFilter, setActiveFilter] = useState<string>(warehouseOrderFilters[0])
  const filter = activeFilter.split(" · ")[0]
  const rows =
    filter === "All orders" ? sourceRows :
    sourceRows.filter((order) => order.type === filter)

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseToolbar title="Warehouse orders" meta="Inbound, outbound and hold work in one operational order table.">
        <WarehouseSearch placeholder="Search orders, customer, route..." />
      </WarehouseToolbar>
      <FilterChips options={warehouseOrderFilters} activeOption={activeFilter} onChange={setActiveFilter} auxiliaryOptions={["+ Customer", "+ Due window", "+ Owner"]} />
      <WarehouseOrdersTable rows={rows} />
    </div>
  )
}

export function WarehouseProductsView({
  activeFilter,
  onFilterChange,
  rows: sourceRows = warehouseProducts,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
  rows?: readonly WarehouseProduct[]
}) {
  const filter = activeFilter.split(" · ")[0]
  const rows =
    filter === "All" ? sourceRows :
    filter === "Low stock" ? sourceRows.filter((product) => product.status === "Low stock") :
    filter === "Inbound" ? sourceRows.filter((product) => product.inbound > 0) :
    sourceRows.filter((product) => product.status === "Quarantine")

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseToolbar title="Products" meta="Product records use freight-aware fields: SKU, HS code, supplier ref, stock and owner.">
        <WarehouseSearch placeholder="Search products, SKU, supplier ref..." />
      </WarehouseToolbar>
      <FilterChips options={warehouseProductFilters} activeOption={activeFilter} onChange={onFilterChange} auxiliaryOptions={["+ Customer", "+ Category", "+ HS code"]} />
      <WarehouseProductsTable rows={rows} />
    </div>
  )
}

export function WarehouseGoodsView({
  goodsInColumns = warehouseGoodsInKanbanColumns,
  goodsOutColumns = warehouseGoodsOutKanbanColumns,
  onReorder,
}: {
  goodsInColumns?: readonly WarehouseKanbanColumnSource[]
  goodsOutColumns?: readonly WarehouseKanbanColumnSource[]
  onReorder?: (board: "goods-in" | "goods-out", columns: SortableWarehouseKanbanColumn[]) => void
}) {
  const goodsBoardTabs = ["Goods in", "Goods out"] as const
  const [activeGoodsBoard, setActiveGoodsBoard] = useState<(typeof goodsBoardTabs)[number]>("Goods in")
  const goodsInCardCount = countKanbanCards(goodsInColumns)
  const goodsOutCardCount = countKanbanCards(goodsOutColumns)
  const isGoodsIn = activeGoodsBoard === "Goods in"

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseToolbar title="Goods in and goods out" meta="Inbound and outbound work now runs as two clean Kanban boards with the same operational stages.">
        <SegmentedControl options={goodsBoardTabs} value={activeGoodsBoard} onChange={setActiveGoodsBoard} />
        <WarehouseSearch placeholder="Search movement, dock, product..." />
      </WarehouseToolbar>
      <div className="grid gap-[var(--md-page-stack-gap)]">
        {isGoodsIn ? (
          <>
            <WarehouseBoardSummary
              title="Goods in"
              meta="Inbound POs, ASN checks, dock slots, carton counts, quarantine and putaway."
              count={`${goodsInCardCount} cards`}
              icon={<ArrowDownToLine className="size-5" strokeWidth={1.25} />}
              tone="teal"
            />
            <SortableWarehouseKanbanBoard
              key="goods-in-board"
              ariaLabel="Goods in Kanban board"
              boardId="goods-in"
              columnsSource={goodsInColumns}
              gridClassName="xl:grid-cols-4"
              onReorder={(columns) => onReorder?.("goods-in", columns)}
            />
          </>
        ) : (
          <>
            <WarehouseBoardSummary
              title="Goods out"
              meta="Pick waves, order allocation, dispatch windows, carrier handoff and customer references."
              count={`${goodsOutCardCount} cards`}
              icon={<ArrowUpFromLine className="size-5" strokeWidth={1.25} />}
              tone="blue"
            />
            <SortableWarehouseKanbanBoard
              key="goods-out-board"
              ariaLabel="Goods out Kanban board"
              boardId="goods-out"
              columnsSource={goodsOutColumns}
              gridClassName="xl:grid-cols-4"
              onReorder={(columns) => onReorder?.("goods-out", columns)}
            />
          </>
        )}
      </div>
    </div>
  )
}

function WarehouseBoardSummary({
  title,
  meta,
  count,
  icon,
  tone,
}: {
  title: string
  meta: string
  count: string
  icon: ReactNode
  tone: StatusTone
}) {
  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--warehouse-board-tone)_12%,white)] text-[var(--warehouse-board-tone)] shadow-[var(--md-shadow-line)]" style={{ "--warehouse-board-tone": toneToVar(tone) } as CSSProperties}>
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{meta}</p>
          </div>
        </div>
        <StatusPill tone={tone}>{count}</StatusPill>
      </div>
    </Surface>
  )
}

function SortableWarehouseKanbanBoard({
  ariaLabel,
  boardId,
  columnsSource,
  gridClassName,
  onReorder,
}: {
  ariaLabel: string
  boardId: string
  columnsSource: readonly WarehouseKanbanColumnSource[]
  gridClassName: string
  onReorder?: (columns: SortableWarehouseKanbanColumn[]) => void
}) {
  const [columns, setColumns] = useState(() => createKanbanColumns(columnsSource, boardId))
  const kanbanColumns = columns.map((column) => ({ id: column.id, tasks: column.cards }))
  const kanban = useKanbanPointerDrag({
    columns: kanbanColumns,
    getId: (card) => card.id,
    onCommit: ({ columns: committedColumns }) => {
      const nextColumns = columns.map((column) => ({
        ...column,
        cards: committedColumns.find((candidate) => candidate.id === column.id)?.tasks ?? column.cards,
      }))
      setColumns(nextColumns)
      onReorder?.(nextColumns)
    },
    formatKeyboardAnnouncement: (card, columnId) => `${card.id} moved to ${columns.find((column) => column.id === columnId)?.title ?? columnId}`,
  })

  useEffect(() => {
    setColumns(createKanbanColumns(columnsSource, boardId))
  }, [boardId, columnsSource])

  return (
    <div ref={kanban.boardRef}>
      <div className={cn("grid gap-3", gridClassName)} aria-label={ariaLabel}>
        {kanban.previewColumns.map((previewColumn) => {
          const column = columns.find((candidate) => candidate.id === previewColumn.id)
          if (!column) return null
          return (
            <WarehouseKanbanLane
              key={column.id}
              column={{ ...column, cards: previewColumn.tasks }}
              activeCardId={kanban.activeCardId}
              activeColumnId={kanban.activeColumnId}
              isClickSuppressed={kanban.isClickSuppressed}
              onPointerDown={kanban.handlePointerDown}
              onKeyDown={kanban.handleKeyDown}
            />
          )
        })}
      </div>
      <p className="sr-only" aria-live="polite">{kanban.keyboardAnnouncement}</p>
      {kanban.activeTask && kanban.overlayStyle ? createPortal(
        <div className="md-kanban-drag-preview" style={kanban.overlayStyle} data-testid="warehouse-kanban-drag-preview">
          <div className="md-kanban-drag-preview-card group" style={{ "--warehouse-card-accent": toneToVar(kanban.activeTask.tone) } as CSSProperties}>
            <WarehouseKanbanCardBody card={kanban.activeTask} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function WarehouseKanbanLane({
  column,
  activeCardId,
  activeColumnId,
  isClickSuppressed,
  onPointerDown,
  onKeyDown,
}: {
  column: SortableWarehouseKanbanColumn
  activeCardId: string | null
  activeColumnId: string | null
  isClickSuppressed: () => boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, cardId: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>, cardId: string) => boolean
}) {
  return (
    <section
      className="md-kanban-column min-h-[230px]"
      data-column-id={column.id}
      data-drop-target={activeCardId && activeColumnId === column.id ? "true" : undefined}
    >
      <header>
        <div className="min-w-0">
          <h2 className="truncate">{column.title}</h2>
          {column.meta ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--md-text)]">{column.meta}</p> : null}
        </div>
        <strong className="tabular-nums">{column.cards.length}</strong>
      </header>
      <div data-kanban-list>
        {column.cards.map((card) => (
          <WarehouseKanbanCard
            key={card.id}
            card={card}
            isDragging={activeCardId === card.id}
            isClickSuppressed={isClickSuppressed}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
          />
        ))}
        {column.cards.length ? null : <p className="md-kanban-empty text-center">Drop work here</p>}
      </div>
    </section>
  )
}

function WarehouseKanbanCardBody({ card }: { card: WarehouseKanbanCardData }) {
  return (
    <>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[var(--warehouse-card-accent)] opacity-70 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <WarehouseCode>{card.id}</WarehouseCode>
        <StatusPill tone={card.tone}>{card.status}</StatusPill>
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-5 text-[var(--md-ink)]">{card.title}</p>
      <p className="mt-2 text-[12px] text-[var(--md-text)]">{card.meta}</p>
    </>
  )
}

function WarehouseKanbanCard({
  card,
  isDragging,
  isClickSuppressed,
  onPointerDown,
  onKeyDown,
}: {
  card: WarehouseKanbanCardData
  isDragging: boolean
  isClickSuppressed: () => boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, cardId: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>, cardId: string) => boolean
}) {
  return (
    <button
      type="button"
      aria-label={`${card.id} ${card.title}`}
      aria-grabbed={isDragging}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
      data-kanban-card={card.id}
      data-task-id={card.id}
      data-kanban-dragging={isDragging ? "true" : undefined}
      className="md-kanban-card group min-h-[116px] overflow-hidden"
      style={{ "--warehouse-card-accent": toneToVar(card.tone) } as CSSProperties}
      onClick={(event) => {
        if (isClickSuppressed()) event.preventDefault()
      }}
      onPointerDown={(event) => onPointerDown(event, card.id)}
      onKeyDown={(event) => onKeyDown(event, card.id)}
    >
      <WarehouseKanbanCardBody card={card} />
    </button>
  )
}

export function WarehouseKanbanBoardPreview() {
  return (
    <SortableWarehouseKanbanBoard
      ariaLabel="Warehouse Kanban board component preview"
      boardId="warehouse-kanban-preview"
      columnsSource={warehouseGoodsInKanbanColumns}
      gridClassName="xl:grid-cols-4"
    />
  )
}

function WarehouseCalendarCustomerKey({
  customers,
  selectedCustomerIds,
  onSelectCustomer,
}: {
  customers: WarehouseCalendarCustomer[]
  selectedCustomerIds: readonly string[]
  onSelectCustomer: (customerId: string) => void
}) {
  const { t } = useLanguage()
  const hasSelectedCustomers = selectedCustomerIds.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--md-surface)_76%,transparent)] p-2 shadow-[var(--md-shadow-line)]">
      {customers.map((customer) => {
        const isSelected = selectedCustomerIds.includes(customer.id)
        const isDimmed = hasSelectedCustomers && !isSelected

        return (
          <button
            key={customer.id}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${t("Filter calendar by customer")}: ${customer.name}`}
            data-i18n-skip
            dir="auto"
            className={cn(
              "inline-flex h-7 items-center gap-2 rounded-full pe-2.5 ps-2 text-[12px] font-medium text-[var(--md-ink)] outline-none shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-surface)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
              isSelected ? "bg-[var(--md-surface)]" : "bg-[color-mix(in_srgb,var(--md-surface)_82%,transparent)]",
              isDimmed && "opacity-45 hover:opacity-80",
            )}
            style={isSelected ? { boxShadow: `inset 0 0 0 1px ${customer.color}, 0 10px 22px rgba(42, 52, 50, 0.08)` } : undefined}
            onClick={() => onSelectCustomer(customer.id)}
          >
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: customer.color }} />
            {customer.shortName}
          </button>
        )
      })}

      {/* The direction key sits in the same rail as the customers, because the two
          are read together: whose booking it is, and which way the stock is going.
          The swatches carry the same fill the blocks do, so the key is a sample of
          the calendar rather than a description of it. */}
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[var(--md-line)]" />
      <span className="inline-flex h-7 items-center gap-3 rounded-full bg-[color-mix(in_srgb,var(--md-surface)_82%,transparent)] px-2.5 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(90,103,100,0.28)]"
            style={{ background: "repeating-linear-gradient(135deg, rgba(90,103,100,0.55) 0 1px, transparent 1px 4px), color-mix(in srgb, var(--md-ink) 12%, transparent)" }}
          />
          {t("Inbound")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(90,103,100,0.28)]"
            style={{ background: "color-mix(in srgb, var(--md-ink) 12%, transparent)" }}
          />
          {t("Outbound")}
        </span>
      </span>
    </div>
  )
}

/**
 * One fact, as a label beside its value. A hairline between rows rather than a
 * box around each: six stacked boxes read as six objects when they are one list.
 * The value keeps its full text in `title` because it is allowed to truncate.
 */
/**
 * The calendar's "open the record behind this event" handler. Held in context
 * because the grid, the day cell and the event card all sit between the calendar
 * and the popover, and none of them has any use for it.
 */
const WarehouseCalendarOpenOrderContext = createContext<((event: WarehouseCalendarEvent) => void) | null>(null)

type CalendarDragHandle = {
  begin: (event: ReactPointerEvent, seed: { eventId: string; mode: CalendarDragMode; dateKey: string; startMinutes: number; endMinutes: number }) => void
  preview: CalendarDragPreview | null
  /** Undefined where rescheduling is not offered, which leaves the blocks inert. */
  enabled: boolean
}

/**
 * The week grid's drag session. Held in context because the grid, the day column
 * and the event block sit between the calendar and the grip, and none of them has
 * any use for it.
 */
const WarehouseCalendarDragContext = createContext<CalendarDragHandle | null>(null)

function WarehouseCalendarDetailRow({
  label,
  value,
  code,
}: {
  label: string
  /** Set for order numbers, references and codes: kept left-to-right and untranslated. */
  code?: boolean
  value: string
}) {
  const { t } = useLanguage()

  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-3 py-[7px] first:pt-0 last:pb-0">
      <dt className="text-[11.5px] leading-4 text-[var(--md-text)]">{t(label)}</dt>
      <dd
        title={value}
        data-i18n-skip={code ? true : undefined}
        dir={code ? "ltr" : "auto"}
        className={cn("min-w-0 truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]", code && "tabular-nums")}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * What a calendar event actually is, in the order an operator asks for it: which
 * kind of movement, whose it is, when it lands, and then the references needed to
 * find it elsewhere. The customer's colour runs down the leading edge, the same
 * edge the card carries, so the popover reads as that card opened rather than as
 * a new panel arriving from nowhere.
 */
function WarehouseCalendarEventDetails({
  event,
  customer,
}: {
  event: WarehouseCalendarEvent
  customer: WarehouseCalendarCustomer
}) {
  const { language, t } = useLanguage()
  const openOrder = useContext(WarehouseCalendarOpenOrderContext)
  const onOpenOrder = openOrder ? () => openOrder(event) : undefined
  const eventDate = parseDateKey(event.date)
  const dateLabel = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long" }).format(eventDate)
  const startMinutes = getTimeInMinutes(event.time)
  const durationMinutes = Math.max(0, getCalendarEventEndMinutes(event) - startMinutes)
  const durationLabel = durationMinutes >= 60
    ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ""}`
    : `${durationMinutes}m`

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={10}
      collisionPadding={16}
      // The product's own menu motion: a 220ms decelerating rise with a blur that
      // resolves, and a quicker, quieter exit. Reused rather than reinvented so a
      // calendar popover opens exactly like every other menu in the app.
      className="md-dropdown-content w-[min(92vw,320px)] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 !bg-[var(--md-surface)] p-0 text-[var(--md-ink)] backdrop-blur-0"
      style={{
        boxShadow: "var(--md-premium-stroke), 0 24px 60px rgba(42, 52, 50, 0.22)",
        ["--warehouse-calendar-color" as string]: customer.color,
      }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 start-0 w-[3px]" style={{ background: "var(--warehouse-calendar-color)" }} />

      <div className="ps-[3px]">
        <header className="px-3.5 pb-3 pt-3">
          <p className="truncate text-[11.5px] font-medium leading-4" style={{ color: "var(--warehouse-calendar-color)" }}>
            {t(event.type)}
          </p>
          {/* Balanced so a two-line reference splits evenly instead of leaving one
              word alone on the second line. */}
          <h3 data-i18n-skip dir="auto" className="mt-1 text-[15px] font-medium leading-[1.3] tracking-[-0.01em] text-balance text-[var(--md-ink)]">
            {event.title}
          </h3>
          <p data-i18n-skip dir="auto" className="mt-0.5 truncate text-[12px] leading-4 text-[var(--md-text)]">
            {customer.name}
          </p>
        </header>

        {/* The one thing a calendar event is really being asked: when. Tabular
            figures so the range never shifts width between events. */}
        <div className="px-3.5 py-3 shadow-[var(--md-stroke-top)]">
          <p className="text-[11.5px] leading-4 text-[var(--md-text)]">{dateLabel}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span data-i18n-skip dir="ltr" className="text-[17px] font-medium leading-none tracking-[-0.01em] tabular-nums text-[var(--md-ink)]">
              {event.time}–{event.endTime}
            </span>
            <span data-i18n-skip dir="ltr" className="text-[11.5px] leading-none tabular-nums text-[var(--md-subtle)]">{durationLabel}</span>
          </p>
        </div>

        <dl className="px-3.5 py-2.5 shadow-[var(--md-stroke-top)]">
          <WarehouseCalendarDetailRow label="Order" value={event.reference ?? event.id.toUpperCase()} code />
          {event.location ? <WarehouseCalendarDetailRow label="Warehouse" value={event.location} /> : null}
        </dl>

        {onOpenOrder ? (
          <div className="p-1.5 shadow-[var(--md-stroke-top)]">
            {/* Closed by Radix before the route changes. Without it the popover is
                left portalled to the body and hangs over the next screen while the
                calendar behind it is still finishing its exit. */}
            <PopoverClose asChild>
              <button
                type="button"
                onClick={onOpenOrder}
                className="group flex h-9 w-full items-center justify-between rounded-[var(--md-radius-md)] px-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
              >
                {t("Open this order")}
                {/* A 2px nudge on hover: enough to say the row leads somewhere,
                    small enough that a pointer crossing the popover stays calm. */}
                <ChevronRight className="size-3.5 shrink-0 text-[var(--md-subtle)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:text-[var(--md-ink)] rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
              </button>
            </PopoverClose>
          </div>
        ) : null}
      </div>
    </PopoverContent>
  )
}

function WarehouseCalendarEventCard({
  event,
  compact,
  customers,
}: {
  event: WarehouseCalendarEvent
  compact: boolean
  customers: readonly WarehouseCalendarCustomer[]
}) {
  const customer = getWarehouseCalendarCustomer(event.customerId, customers)
  const { t } = useLanguage()
  const eventStyle = {
    "--warehouse-calendar-color": customer.color,
    background: event.direction === "inbound"
      ? "repeating-linear-gradient(135deg, color-mix(in srgb, var(--warehouse-calendar-color) 18%, transparent) 0 2px, transparent 2px 7px), color-mix(in srgb, var(--warehouse-calendar-color) 10%, var(--md-surface))"
      : "color-mix(in srgb, var(--warehouse-calendar-color) 10%, var(--md-surface))",
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--warehouse-calendar-color) 28%, transparent), 0 10px 24px rgba(42, 52, 50, 0.06)",
  } as CSSProperties

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Open calendar event details")}: ${event.title}`}
          className={cn(
            "relative overflow-hidden rounded-[var(--md-radius-md)] text-left outline-none transition-[background-color,box-shadow,opacity,scale,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
            compact ? "min-h-[82px] p-2 ps-3" : "min-h-[112px] p-3 ps-4",
          )}
          style={eventStyle}
        >
          <span aria-hidden="true" className="absolute inset-y-3 start-2 w-0.5 rounded-full" style={{ background: "var(--warehouse-calendar-color)" }} />
          <span data-i18n-skip dir="ltr" className="block text-[11px] font-medium tabular-nums" style={{ color: "var(--warehouse-calendar-color)" }}>
            {event.time}–{event.endTime}
          </span>
          <p className={cn("mt-1 font-medium text-[var(--md-ink)]", compact ? "line-clamp-2 text-[12px] leading-4" : "text-[13px] leading-5")}>{event.title}</p>
          <p data-i18n-skip dir="auto" className="mt-2 truncate text-[11px] font-medium text-[var(--md-text)]">
            {customer.shortName}
          </p>
        </button>
      </PopoverTrigger>
      <WarehouseCalendarEventDetails event={event} customer={customer} />
    </Popover>
  )
}

function WarehouseCalendarTimedEvent({
  positionedEvent,
  customers,
}: {
  positionedEvent: PositionedWarehouseCalendarEvent
  customers: readonly WarehouseCalendarCustomer[]
}) {
  const { event, top, height, column, columnCount } = positionedEvent
  const customer = getWarehouseCalendarCustomer(event.customerId, customers)
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const drag = useContext(WarehouseCalendarDragContext)
  const isDragging = drag?.preview?.eventId === event.id
  const compact = height < 58 || columnCount > 1
  const startMinutes = getTimeInMinutes(event.time)
  const endMinutes = getCalendarEventEndMinutes(event)

  function grip(mode: CalendarDragMode) {
    return (pointerEvent: ReactPointerEvent) => {
      if (!drag?.enabled) return
      pointerEvent.stopPropagation()
      drag.begin(pointerEvent, { eventId: event.id, mode, dateKey: event.date, startMinutes, endMinutes })
    }
  }
  const eventStyle = {
    "--warehouse-calendar-color": customer.color,
    top: `${top + 4}px`,
    height: `${Math.max(height - 8, 30)}px`,
    insetInlineStart: `${(column / columnCount) * 100}%`,
    width: `calc(${100 / columnCount}% - ${columnCount > 1 ? 4 : 0}px)`,
    background: event.direction === "inbound"
      ? "repeating-linear-gradient(135deg, color-mix(in srgb, var(--warehouse-calendar-color) 21%, transparent) 0 2px, transparent 2px 7px), color-mix(in srgb, var(--warehouse-calendar-color) 13%, var(--md-surface))"
      : "color-mix(in srgb, var(--warehouse-calendar-color) 13%, var(--md-surface))",
    // The block being dragged lifts off the grid: a stronger edge and a deeper
    // shadow, so the one under the pointer is obviously the one that will move.
    boxShadow: isDragging
      ? "inset 0 0 0 1px color-mix(in srgb, var(--warehouse-calendar-color) 62%, transparent), 0 18px 36px rgba(42, 52, 50, 0.22)"
      : "inset 0 0 0 1px color-mix(in srgb, var(--warehouse-calendar-color) 32%, transparent), 0 12px 24px rgba(42, 52, 50, 0.08)",
  } as CSSProperties

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Open calendar event details")}: ${event.title}`}
          onPointerDown={drag?.enabled ? grip("move") : undefined}
          className={cn(
            "absolute z-10 overflow-hidden rounded-[var(--md-radius-md)] p-2 ps-3 text-left outline-none transition-[box-shadow,scale,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:z-20 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
            drag?.enabled && "cursor-grab active:cursor-grabbing touch-none",
            isDragging ? "z-30 scale-[1.02]" : "hover:z-20 hover:scale-[1.01]",
            shouldReduceMotion && "transition-none",
          )}
          style={eventStyle}
          title={`${event.title} ${event.time}–${event.endTime}`}
        >
          <span aria-hidden="true" className="absolute inset-y-2 start-1.5 w-0.5 rounded-full" style={{ background: "var(--warehouse-calendar-color)" }} />
          {/* Six pixels of grab at each edge, the same target a window resize uses.
              They sit above the block's own press handler so an edge drag changes
              the length instead of moving the whole booking. */}
          {drag?.enabled ? (
            <>
              <span
                role="separator"
                aria-orientation="horizontal"
                aria-label={`${t("Change start time")}: ${event.title}`}
                onPointerDown={grip("resize-start")}
                className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize touch-none after:absolute after:inset-x-2 after:top-[2px] after:h-[2px] after:rounded-full after:bg-[var(--warehouse-calendar-color)] after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-70"
              />
              <span
                role="separator"
                aria-orientation="horizontal"
                aria-label={`${t("Change end time")}: ${event.title}`}
                onPointerDown={grip("resize-end")}
                className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize touch-none after:absolute after:inset-x-2 after:bottom-[2px] after:h-[2px] after:rounded-full after:bg-[var(--warehouse-calendar-color)] after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-70"
              />
            </>
          ) : null}
          <div className="min-w-0">
            <p className={cn("truncate font-medium text-[var(--md-ink)]", compact ? "text-[11px] leading-4" : "text-[12px] leading-4")}>{event.title}</p>
            <p data-i18n-skip dir="ltr" className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-[var(--md-text)]">
              {event.time}–{event.endTime}
            </p>
          </div>
          {!compact ? (
            <p data-i18n-skip dir="auto" className="mt-1 truncate text-[11px] font-medium text-[var(--md-text)]">
              {customer.shortName}
            </p>
          ) : null}
        </button>
      </PopoverTrigger>
      <WarehouseCalendarEventDetails event={event} customer={customer} />
    </Popover>
  )
}

function WarehouseCalendarTimedDayColumn({ day, customers }: { day: WarehouseCalendarDay; customers: readonly WarehouseCalendarCustomer[] }) {
  const positionedEvents = useMemo(() => getCalendarEventLayout(day.events), [day.events])
  const isToday = day.dateKey === formatDateKey(new Date())

  return (
    <div
      className={cn(
        "relative min-w-0 shadow-[inset_1px_0_0_rgba(90,103,100,0.12)] transition-colors duration-200",
        isToday && "bg-[rgba(90,103,100,0.055)]",
      )}
      style={{ height: warehouseCalendarGridHeight }}
    >
      {warehouseCalendarHourMarks.map((hour, index) => (
        <span key={`${day.dateKey}-${hour}`} aria-hidden="true" className="absolute inset-x-0 h-px bg-[rgba(90,103,100,0.11)]" style={{ top: index * warehouseCalendarHourHeight }} />
      ))}
      {positionedEvents.map((positionedEvent) => (
        <WarehouseCalendarTimedEvent key={positionedEvent.event.id} positionedEvent={positionedEvent} customers={customers} />
      ))}
    </div>
  )
}

function applyCalendarPreview(days: WarehouseCalendarDay[], preview: CalendarDragPreview | null) {
  if (!preview) return days
  const moved = days.flatMap((day) => day.events).find((event) => event.id === preview.eventId)
  if (!moved) return days

  const previewed: WarehouseCalendarEvent = {
    ...moved,
    date: preview.dateKey,
    time: minutesToTimeKey(preview.startMinutes),
    endTime: minutesToTimeKey(preview.endMinutes),
  }

  return days.map((day) => {
    const withoutMoved = day.events.filter((event) => event.id !== preview.eventId)
    return day.dateKey === preview.dateKey
      ? { ...day, events: [...withoutMoved, previewed] }
      : withoutMoved.length === day.events.length ? day : { ...day, events: withoutMoved }
  })
}

function WarehouseCalendarWeekGrid({
  days,
  customers,
  onReschedule,
}: {
  days: WarehouseCalendarDay[]
  customers: readonly WarehouseCalendarCustomer[]
  onReschedule?: (change: { eventId: string; dateKey: string; startMinutes: number; endMinutes: number }) => void
}) {
  const { direction, language } = useLanguage()
  const gridRef = useRef<HTMLDivElement>(null)
  const dayKeys = useMemo(() => days.map((day) => day.dateKey), [days])

  const { preview, begin } = useCalendarEventDrag({
    gridRef,
    dayKeys,
    hourHeight: warehouseCalendarHourHeight,
    gridStartMinutes: warehouseCalendarGridStartMinutes,
    gridEndMinutes: warehouseCalendarGridEndMinutes,
    direction,
    columnsInset: 64,
    onCommit: (change) => onReschedule?.(change),
  })

  const dragHandle = useMemo<CalendarDragHandle>(() => ({ begin, preview, enabled: Boolean(onReschedule) }), [begin, preview, onReschedule])
  const previewDays = useMemo(() => applyCalendarPreview(days, preview), [days, preview])
  const timeZoneLabel = new Intl.DateTimeFormat(language, { timeZoneName: "short" })
    .formatToParts(days[0]?.date ?? new Date())
    .find((part) => part.type === "timeZoneName")?.value ?? "Local"

  return (
    <WarehouseCalendarDragContext.Provider value={dragHandle}>
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="overflow-x-auto md-scrollbar">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] bg-[color-mix(in_srgb,var(--md-surface)_84%,transparent)] shadow-[inset_0_-1px_0_rgba(90,103,100,0.12)]">
            <div className="flex min-h-[92px] items-end px-3 py-4 text-[11px] font-medium text-[var(--md-text)]">
              <span data-i18n-skip dir="auto">{timeZoneLabel}</span>
            </div>
            {days.map((day) => {
              const isToday = day.dateKey === formatDateKey(new Date())

              return (
                <div
                  key={day.dateKey}
                  className={cn(
                    "min-h-[92px] px-3 py-3 shadow-[inset_1px_0_0_rgba(90,103,100,0.12)] transition-colors duration-200",
                    isToday && "bg-[rgba(90,103,100,0.065)]",
                  )}
                >
                  <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--md-text)]">{day.label}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-full text-[22px] font-medium text-[var(--md-ink)]",
                        isToday && "bg-[rgba(90,103,100,0.11)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                      )}
                    >
                      {day.dayNumber}
                    </span>
                    <span data-i18n-skip className="rounded-full bg-[color-mix(in_srgb,var(--md-surface)_68%,transparent)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                      {day.events.length}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div ref={gridRef} data-calendar-columns className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] bg-[color-mix(in_srgb,var(--md-surface)_72%,transparent)]">
            <div className="relative shadow-[inset_0_1px_0_rgba(90,103,100,0.12)]" style={{ height: warehouseCalendarGridHeight }}>
              {warehouseCalendarHourMarks.map((hour, index) => (
                <span
                  key={hour}
                  data-i18n-skip
                  dir="ltr"
                  className="absolute end-3 -translate-y-1/2 text-[11px] font-medium text-[var(--md-text)] tabular-nums"
                  style={{ top: index * warehouseCalendarHourHeight }}
                >
                  {getHourLabel(hour)}
                </span>
              ))}
            </div>
            {previewDays.map((day) => (
              <WarehouseCalendarTimedDayColumn key={day.dateKey} day={day} customers={customers} />
            ))}
          </div>
        </div>
      </div>
    </Surface>
    </WarehouseCalendarDragContext.Provider>
  )
}

function WarehouseCalendarDayCell({
  day,
  view,
  customers,
}: {
  day: WarehouseCalendarDay
  view: WarehouseCalendarViewMode
  customers: readonly WarehouseCalendarCustomer[]
}) {
  const { t } = useLanguage()
  const isMonthView = view === "Month"
  const isToday = day.dateKey === formatDateKey(new Date())

  return (
    <Surface
      key={day.dateKey}
      padding="sm"
      className={cn(
        "rounded-[var(--md-radius-xl)] transition-[opacity,background-color] duration-200",
        isMonthView ? "min-h-[178px]" : "min-h-[300px]",
        day.outsideMonth && isMonthView && "opacity-50",
        isToday && "bg-[rgba(90,103,100,0.055)]",
      )}
    >
      <div className="flex items-start justify-between gap-3 px-1 py-1">
        <div>
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{isMonthView ? day.dayNumber : day.label}</p>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{isMonthView ? day.label : day.dateLabel}</p>
        </div>
        <span data-i18n-skip className="rounded-full bg-[color-mix(in_srgb,var(--md-surface)_68%,transparent)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
          {day.events.length}
        </span>
      </div>
      <div className={cn("mt-3 grid", isMonthView ? "gap-1.5" : "gap-2")}>
        {day.events.map((event) => (
          <WarehouseCalendarEventCard key={event.id} event={event} compact={isMonthView} customers={customers} />
        ))}
        {!day.events.length && !isMonthView ? <p className="px-1 py-4 text-[12px] leading-5 text-[var(--md-subtle)]">{t("No planned warehouse work")}</p> : null}
      </div>
    </Surface>
  )
}

export function WarehouseCalendarView({
  customers = warehouseCalendarCustomers,
  events = warehouseCalendarEvents,
  onOpenOrder,
  onReschedule,
}: {
  customers?: readonly WarehouseCalendarCustomer[]
  events?: readonly WarehouseCalendarEvent[]
  /** Opens the warehouse order behind an event. Omitted leaves the popover read-only. */
  onOpenOrder?: (event: WarehouseCalendarEvent) => void
  /**
   * Moves a booking to a new slot. Omitted leaves the blocks inert — no grips, no
   * grab cursor — so a read-only calendar cannot suggest an action it will not take.
   */
  onReschedule?: (change: { eventId: string; dateKey: string; startTime: string; endTime: string }) => void
}) {
  const { language, t } = useLanguage()
  const [calendarView, setCalendarView] = useState<WarehouseCalendarViewMode>("Week")
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const eventsByDate = useMemo(() => getCalendarEventsByDate(events), [events])
  const allCalendarDays = useMemo(
    () => buildCalendarDays(calendarView, language, anchorDate, eventsByDate),
    [anchorDate, calendarView, eventsByDate, language],
  )
  const calendarDays = useMemo(() => (
    selectedCustomerIds.length
      ? allCalendarDays.map((day) => ({ ...day, events: day.events.filter((event) => selectedCustomerIds.includes(event.customerId)) }))
      : allCalendarDays
  ), [allCalendarDays, selectedCustomerIds])
  const visibleCustomerIds = useMemo(() => new Set(allCalendarDays.flatMap((day) => day.events.map((event) => event.customerId))), [allCalendarDays])
  const visibleCustomers = customers.filter((customer) => visibleCustomerIds.has(customer.id))
  const periodLabel = formatCalendarPeriodLabel(calendarView, language, anchorDate)

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerIds((currentCustomerIds) => (
      currentCustomerIds.includes(customerId)
        ? currentCustomerIds.filter((currentCustomerId) => currentCustomerId !== customerId)
        : [...currentCustomerIds, customerId]
    ))
  }

  function changeCalendarView(nextView: WarehouseCalendarViewMode) {
    setCalendarView(nextView)
    setSelectedCustomerIds([])
  }

  function moveCalendarPeriod(direction: -1 | 1) {
    setAnchorDate((currentDate) => (
      calendarView === "Week"
        ? addCalendarDays(currentDate, direction * 7)
        : new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1)
    ))
    setSelectedCustomerIds([])
  }

  function showToday() {
    setAnchorDate(new Date())
    setSelectedCustomerIds([])
  }

  return (
    <WarehouseCalendarOpenOrderContext.Provider value={onOpenOrder ?? null}>
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehousePageHeader
        title="Calendar"
        description={null}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(calendarView === "Week" ? "Previous week" : "Previous month")}
              className="size-10 rounded-[var(--md-radius-md)] bg-white/48 shadow-[var(--md-shadow-line)] hover:bg-white/74"
              onClick={() => moveCalendarPeriod(-1)}
            >
              <ChevronLeft className="size-4 rtl:rotate-180" strokeWidth={1.25} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74"
              onClick={showToday}
            >
              {t("Today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(calendarView === "Week" ? "Next week" : "Next month")}
              className="size-10 rounded-[var(--md-radius-md)] bg-white/48 shadow-[var(--md-shadow-line)] hover:bg-white/74"
              onClick={() => moveCalendarPeriod(1)}
            >
              <ChevronRight className="size-4 rtl:rotate-180" strokeWidth={1.25} />
            </Button>
          </div>
          <div className="flex h-10 items-center gap-2 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-surface)_72%,transparent)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <CalendarDays data-icon="inline-start" className="size-4 text-[var(--md-accent)]" strokeWidth={1.25} />
            <span>{calendarView === "Week" ? `${t("Week of")} ${periodLabel}` : periodLabel}</span>
          </div>
          <SegmentedControl options={warehouseCalendarViewModes} value={calendarView} onChange={changeCalendarView} />
        </div>
      </WarehousePageHeader>
      {visibleCustomers.length ? <WarehouseCalendarCustomerKey customers={visibleCustomers} selectedCustomerIds={selectedCustomerIds} onSelectCustomer={handleSelectCustomer} /> : null}
      {calendarView === "Week" ? (
        <WarehouseCalendarWeekGrid
          days={calendarDays}
          customers={customers}
          onReschedule={onReschedule ? (change) => onReschedule({
            eventId: change.eventId,
            dateKey: change.dateKey,
            startTime: minutesToTimeKey(change.startMinutes),
            endTime: minutesToTimeKey(change.endMinutes),
          }) : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {calendarDays.map((day) => (
            <WarehouseCalendarDayCell key={day.dateKey} day={day} view={calendarView} customers={customers} />
          ))}
        </div>
      )}
    </div>
    </WarehouseCalendarOpenOrderContext.Provider>
  )
}

export function WarehouseStockView({
  activeFilter,
  onFilterChange,
  rows: sourceRows = warehouseStockRows,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
  rows?: readonly WarehouseStockRow[]
}) {
  const [customerFilter, setCustomerFilter] = useState(allWarehouseCustomers)
  const [productFilter, setProductFilter] = useState(allWarehouseProducts)
  const [batchFilter, setBatchFilter] = useState(allWarehouseBatches)
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null)
  const customerOptions = useMemo(
    () => makeWarehouseFilterOptions(sourceRows.map((row) => row.customer), allWarehouseCustomers),
    [sourceRows],
  )
  const productOptions = useMemo(
    () => makeWarehouseFilterOptions(sourceRows.map((row) => row.product), allWarehouseProducts),
    [sourceRows],
  )
  const batchOptions = useMemo(
    () => makeWarehouseFilterOptions(sourceRows.flatMap((row) => row.branchLocations.map((location) => location.lot)), allWarehouseBatches),
    [sourceRows],
  )
  const filter = activeFilter.split(" · ")[0]
  const statusRows =
    filter === "All stock" ? sourceRows :
    filter === "Low stock" ? sourceRows.filter((row) => row.status === "Low stock") :
    filter === "Allocated" ? sourceRows.filter((row) => row.allocated > 0) :
    sourceRows.filter((row) => row.status === "Quarantine")
  const rows = statusRows
    .filter((row) => customerFilter === allWarehouseCustomers || row.customer === customerFilter)
    .filter((row) => productFilter === allWarehouseProducts || row.product === productFilter)
    .map((row) => stockRowForBatch(row, batchFilter))
    .filter((row): row is WarehouseStockRow => Boolean(row))
  const selectedStock = selectedStockId ? rows.find((row) => row.id === selectedStockId) ?? null : null

  useEffect(() => {
    if (!selectedStockId) return

    if (!rows.length || !rows.some((row) => row.id === selectedStockId)) {
      setSelectedStockId(null)
    }
  }, [rows, selectedStockId])

  return (
    <LayoutGroup id="warehouse-stock-view">
      <div className="grid gap-[var(--md-page-stack-gap)]">
        <AnimatePresence mode="popLayout" initial={false}>
          {selectedStock ? (
            <motion.div
              key={`stock-detail-${selectedStock.id}`}
              layout
              initial={{ opacity: 0, y: 6, filter: "blur(1.5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(1.5px)" }}
              transition={stockMorphTransition}
            >
              <WarehouseSelectedStockPanel stock={selectedStock} onBack={() => setSelectedStockId(null)} />
            </motion.div>
          ) : (
            <motion.div
              key="stock-table"
              layout
              initial={{ opacity: 0, y: 6, filter: "blur(1.5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(1.5px)" }}
              transition={stockMorphTransition}
              className="grid gap-[var(--md-page-stack-gap)]"
            >
              <WarehouseToolbar title="Stock view" meta="Select a product code to move its stock summary to the top and review every warehouse location in a focused table.">
                <WarehouseSearch placeholder="Search product code, stock, bin, customer..." />
              </WarehouseToolbar>
              <FilterChips options={warehouseStockFilters} activeOption={activeFilter} onChange={onFilterChange} />
              <div className="flex flex-wrap items-end gap-2">
                <WarehouseFilterSelect label="Customer" value={customerFilter} options={customerOptions} onChange={setCustomerFilter} />
                <WarehouseFilterSelect label="Product" value={productFilter} options={productOptions} onChange={setProductFilter} />
                <WarehouseFilterSelect label="Batch" value={batchFilter} options={batchOptions} onChange={setBatchFilter} />
              </div>
              <WarehouseStockTable
                rows={rows}
                selectedStockId={null}
                onSelectStock={(stock) => setSelectedStockId(stock.id)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}
