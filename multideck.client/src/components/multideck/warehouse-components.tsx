import { Fragment, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
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
  SlidersHorizontal,
  Warehouse,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { FilterChips, SegmentedControl } from "@/components/multideck/workflow-components"
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"
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

const warehouseTableRowTransition = {
  hidden: { opacity: 0, y: 6 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...mdMotion.smooth, delay: Math.min(index * 0.012, 0.12) },
  }),
  exit: { opacity: 0, y: -4, transition: mdMotion.fast },
}

const stockMorphTransition = { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const }
const tableHeadClass = "h-9 border-r border-[rgba(90,103,100,0.12)] bg-[rgba(90,103,100,0.06)] px-3 py-2 text-[11.5px] font-medium text-[var(--md-text)] last:border-r-0"
const tableCellClass = "border-r border-[rgba(90,103,100,0.09)] px-3 py-2 last:border-r-0"
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

function alignClass(align: WarehouseTableColumn<unknown>["align"]) {
  if (align === "right") return "text-right"
  if (align === "center") return "text-center"
  return "text-left"
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
          <span data-i18n-skip dir="ltr" className="inline-grid size-6 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[11px] font-medium text-[var(--md-accent)]">
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
        className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 pl-9 pr-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
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
          className="h-9 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/42 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/64 focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
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
  title: string
  meta?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[var(--md-gap-md)] lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{meta}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function WarehouseInventoryTable<T extends { id: string }>({
  rows,
  columns,
  minWidth = 1060,
  emptyMessage = "No warehouse rows match this view.",
  rowLabel = "warehouse rows",
  onRowClick,
  rowClassName,
  renderExpandedRow,
  renderRowDetail,
  rowDetailLabel,
}: {
  rows: T[]
  columns: WarehouseTableColumn<T>[]
  minWidth?: number
  emptyMessage?: string
  rowLabel?: string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  renderExpandedRow?: (row: T, columnCount: number) => ReactNode
  renderRowDetail?: (row: T) => ReactNode
  rowDetailLabel?: (row: T) => string
}) {
  const shouldReduceMotion = useReducedMotion()
  const { direction } = useLanguage()
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  useEffect(() => {
    if (openRowId && !rows.some((row) => row.id === openRowId)) setOpenRowId(null)
  }, [openRowId, rows])

  function activateRow(row: T) {
    onRowClick?.(row)
    if (!renderRowDetail) return
    setOpenRowId((current) => current === row.id ? null : row.id)
  }

  function handleRowKeyDown(event: ReactKeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick && !renderRowDetail) return
    if (event.key !== "Enter" && event.key !== " ") return

    event.preventDefault()
    activateRow(row)
  }

  return (
    <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
      <Table className="text-[12.5px]" style={{ minWidth } as CSSProperties}>
        <TableHeader>
          <TableRow className="border-b border-[rgba(90,103,100,0.12)] hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={cn(tableHeadClass, alignClass(column.align), column.className)}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <motion.tbody className="[&_tr:last-child]:border-0">
          <AnimatePresence initial={false}>
            {rows.length ? rows.map((row, index) => {
            const hasRowDetail = Boolean(renderRowDetail)
            const isInteractiveRow = Boolean(onRowClick || renderRowDetail)
            const isDetailOpen = openRowId === row.id
            const rowElement = (
              <motion.tr
                layout={shouldReduceMotion ? false : "position"}
                custom={index}
                variants={shouldReduceMotion ? undefined : warehouseTableRowTransition}
                initial={shouldReduceMotion ? false : "hidden"}
                animate={shouldReduceMotion ? undefined : "show"}
                exit={shouldReduceMotion ? undefined : "exit"}
                tabIndex={isInteractiveRow ? 0 : undefined}
                aria-haspopup={hasRowDetail ? "dialog" : undefined}
                aria-expanded={hasRowDetail ? isDetailOpen : undefined}
                aria-label={hasRowDetail ? rowDetailLabel?.(row) ?? `Open details for ${row.id}` : undefined}
                className={cn(
                  "h-[52px] border-b border-[rgba(90,103,100,0.09)] bg-[var(--md-surface)] transition-[background,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgba(90,103,100,0.045)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
                  isInteractiveRow && "cursor-pointer",
                  isDetailOpen && "bg-[rgba(14,125,116,0.055)]",
                  rowClassName?.(row),
                )}
                onClick={isInteractiveRow ? () => activateRow(row) : undefined}
                onKeyDown={(event) => handleRowKeyDown(event, row)}
              >
                {columns.map((column) => (
                  <TableCell key={`${row.id}-${column.key}`} className={cn(tableCellClass, alignClass(column.align), column.cellClassName)}>
                    {column.render(row)}
                  </TableCell>
                ))}
              </motion.tr>
            )

            return (
              <Fragment key={row.id}>
                {renderRowDetail ? (
                  <Popover open={isDetailOpen} onOpenChange={(open) => setOpenRowId(open ? row.id : null)}>
                    <PopoverAnchor asChild>{rowElement}</PopoverAnchor>
                    <PopoverContent
                      side="bottom"
                      align={direction === "rtl" ? "end" : "start"}
                      sideOffset={8}
                      collisionPadding={16}
                      className="z-[80] w-[min(92vw,372px)] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-2 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]"
                    >
                      {renderRowDetail(row)}
                    </PopoverContent>
                  </Popover>
                ) : rowElement}
                {renderExpandedRow?.(row, columns.length)}
              </Fragment>
            )
            }) : (
              <TableRow key="warehouse-table-empty" className="h-[160px] border-0 hover:bg-transparent">
                <TableCell colSpan={columns.length} className="text-center">
                  <div className="mx-auto max-w-[360px]">
                    <p className="text-[14px] font-medium text-[var(--md-ink)]">{emptyMessage}</p>
                    <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">Change a filter or search a wider set of {rowLabel}.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </AnimatePresence>
        </motion.tbody>
      </Table>
    </div>
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
      <span className="inline-grid size-7 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[11px] font-medium text-[var(--md-accent)]">{product.owner}</span>
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
        <span className={cn("grid size-8 place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)]", movement.direction === "In" ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]" : "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]")}>
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
      rowLabel="products"
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
          rowLabel="stock locations"
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
      rowLabel="stock rows"
      emptyMessage="No stock rows match this view."
      onRowClick={onSelectStock}
      rowClassName={(row) => row.id === selectedStockId ? "bg-[rgba(14,125,116,0.055)] shadow-[inset_3px_0_0_var(--md-accent)]" : undefined}
    />
  )
}

export function WarehouseOrdersTable({ rows = warehouseOrders }: { rows?: readonly WarehouseOrder[] }) {
  return (
    <WarehouseInventoryTable
      rows={[...rows]}
      columns={orderColumns}
      minWidth={980}
      rowLabel="orders"
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
      rowLabel="goods movements"
      emptyMessage="No goods movements match this view."
    />
  )
}

export function WarehouseMetricStrip({ metrics = warehouseMetrics }: { metrics?: readonly WarehouseMetric[] }) {
  const { t } = useLanguage()

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon

        return (
          <Surface key={metric.label} padding="md" className="min-h-[106px] rounded-[var(--md-radius-xl)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--md-text)]">{t(metric.label)}</p>
                <strong className="mt-2 block text-[28px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{metric.value}</strong>
              </div>
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/56 text-[var(--metric-tone)] shadow-[var(--md-shadow-line)]" style={{ "--metric-tone": toneToVar(metric.tone) } as CSSProperties}>
                <Icon className="size-4" strokeWidth={1.25} />
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">{t(metric.detail)}</p>
          </Surface>
        )
      })}
    </div>
  )
}

export function WarehousePageHeader({ customer = false }: { customer?: boolean }) {
  const { t } = useLanguage()

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
          <Warehouse className="size-5" strokeWidth={1.25} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Warehouse")}</h1>
          <p className="mt-1 max-w-[680px] text-[13px] leading-5 text-[var(--md-text)]">
            {t(customer ? "View your stock, manage items, and send inbound or outbound requests to the warehouse team." : "Inventory, stock, goods movements, warehouse orders, and operator planning in one calm workspace.")}
          </p>
        </div>
      </div>
      {!customer ? <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
          <SlidersHorizontal data-icon="inline-start" className="size-4" strokeWidth={1.25} />
          {t("Filters")}
        </Button>
        <Button className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]">
          <Plus data-icon="inline-start" className="size-4" strokeWidth={1.25} />
          {t("New pick")}
        </Button>
      </div> : null}
    </div>
  )
}

function WarehouseActivityPanel({ rows = warehouseGoodsMovements }: { rows?: readonly WarehouseMovement[] }) {
  const shouldReduceMotion = useReducedMotion()
  const { t } = useLanguage()

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4 shadow-[var(--md-stroke-bottom)]">
        <SectionHeader title={t("Recent warehouse activity")} meta={t("Latest receiving and dispatch movements posted by the warehouse team.")} />
      </div>
      <motion.div
        className="divide-y divide-[rgba(90,103,100,0.09)]"
        variants={shouldReduceMotion ? undefined : tableBodyReveal}
        initial={shouldReduceMotion ? undefined : "hidden"}
        animate={shouldReduceMotion ? undefined : "show"}
      >
        {rows.slice(0, 5).map((movement) => (
          <motion.div key={movement.id} variants={shouldReduceMotion ? undefined : rowReveal} className="grid grid-cols-[34px_minmax(0,1fr)_auto] gap-3 px-5 py-3">
            <span className={cn("grid size-[34px] place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)]", movement.direction === "In" ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]" : "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]")}>
              {movement.direction === "In" ? <ArrowDownToLine className="size-4" strokeWidth={1.25} /> : <ArrowUpFromLine className="size-4" strokeWidth={1.25} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{movement.product}</p>
              <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{movement.reference}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">{movement.time}</p>
              <StatusPill tone={movement.tone} className="mt-1">{movement.status}</StatusPill>
            </div>
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
        <div className="grid gap-[var(--md-gap-md)]">
          <WarehouseToolbar title={t("Open warehouse orders")} meta={t("Live inbound and outbound work that still needs operator action.")}>
            <StatusPill tone="amber">{orders.length} {t("active")}</StatusPill>
          </WarehouseToolbar>
          <WarehouseOrdersTable rows={orders.slice(0, 5)} />
        </div>
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
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_76%,transparent)] p-2 shadow-[var(--md-shadow-line)]">
      <span className="px-2 text-[12px] font-medium text-[var(--md-text)]">{t("Customer key")}</span>
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
              "inline-flex h-7 items-center gap-2 rounded-[var(--md-radius-md)] pe-2.5 ps-2 text-[12px] font-medium text-[var(--md-ink)] outline-none shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-surface)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
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
    </div>
  )
}

function WarehouseCalendarDetailRow({
  label,
  value,
  skipTranslation,
}: {
  label: string
  value: ReactNode
  skipTranslation?: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2 shadow-[var(--md-shadow-line)]">
      <span className="text-[11px] font-medium text-[var(--md-text)]">{t(label)}</span>
      <span data-i18n-skip={skipTranslation ? true : undefined} dir={skipTranslation ? "auto" : undefined} className="min-w-0 truncate text-[12px] font-medium text-[var(--md-ink)]">
        {value}
      </span>
    </div>
  )
}

function WarehouseCalendarEventDetails({
  event,
  customer,
}: {
  event: WarehouseCalendarEvent
  customer: WarehouseCalendarCustomer
}) {
  const { language, t } = useLanguage()
  const dateLabel = new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(parseDateKey(event.date))

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={8}
      collisionPadding={16}
      className="w-[min(92vw,340px)] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 !bg-white p-2 text-[var(--md-ink)] backdrop-blur-0 dark:!bg-[var(--md-surface)]"
      style={{ boxShadow: "var(--md-premium-stroke), 0 24px 60px rgba(42, 52, 50, 0.2)" }}
    >
      <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Calendar details")}</p>
            <h3 className="mt-1 text-[14px] font-medium leading-5 text-[var(--md-ink)]">{event.title}</h3>
          </div>
          <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: customer.color }} />
        </div>
        <p data-i18n-skip dir="auto" className="mt-2 truncate text-[12px] font-medium text-[var(--md-text)]">
          {customer.name}
        </p>
      </div>
      <div className="mt-2 grid gap-1.5">
        <WarehouseCalendarDetailRow label="Customer" value={customer.name} skipTranslation />
        <WarehouseCalendarDetailRow label="Date" value={dateLabel} />
        <WarehouseCalendarDetailRow label="Time" value={`${event.time}-${event.endTime}`} skipTranslation />
        <WarehouseCalendarDetailRow label="Type" value={event.type} />
        <WarehouseCalendarDetailRow label="Reference" value={event.reference ?? event.id.toUpperCase()} skipTranslation />
        {event.location ? <WarehouseCalendarDetailRow label="Warehouse" value={event.location} skipTranslation /> : null}
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
    background: "color-mix(in srgb, var(--warehouse-calendar-color) 10%, var(--md-surface))",
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--warehouse-calendar-color) 28%, transparent), 0 10px 24px rgba(42, 52, 50, 0.06)",
  } as CSSProperties

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Open calendar event details")}: ${event.title}`}
          className={cn(
            "relative overflow-hidden rounded-[var(--md-radius-md)] text-left outline-none transition-[background-color,box-shadow,opacity,scale,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
            compact ? "min-h-[82px] p-2 ps-3" : "min-h-[112px] p-3 ps-4",
          )}
          style={eventStyle}
        >
          <span aria-hidden="true" className="absolute inset-y-3 start-2 w-0.5 rounded-full" style={{ background: "var(--warehouse-calendar-color)" }} />
          <div className="flex items-center justify-between gap-2">
            <span data-i18n-skip dir="ltr" className="text-[11px] font-medium tabular-nums" style={{ color: "var(--warehouse-calendar-color)" }}>
              {event.time}-{event.endTime}
            </span>
            <span className="truncate rounded-full bg-[color-mix(in_srgb,var(--md-surface)_58%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
              {event.type}
            </span>
          </div>
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
  const compact = height < 58 || columnCount > 1
  const eventStyle = {
    "--warehouse-calendar-color": customer.color,
    top: `${top + 4}px`,
    height: `${Math.max(height - 8, 30)}px`,
    insetInlineStart: `${(column / columnCount) * 100}%`,
    width: `calc(${100 / columnCount}% - ${columnCount > 1 ? 4 : 0}px)`,
    background: "color-mix(in srgb, var(--warehouse-calendar-color) 13%, var(--md-surface))",
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--warehouse-calendar-color) 32%, transparent), 0 12px 24px rgba(42, 52, 50, 0.08)",
  } as CSSProperties

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Open calendar event details")}: ${event.title}`}
          className="absolute z-10 overflow-hidden rounded-[var(--md-radius-md)] p-2 ps-3 text-left outline-none transition-[box-shadow,scale,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:z-20 hover:scale-[1.01] focus-visible:z-20 focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
          style={eventStyle}
          title={`${event.title} ${event.time}-${event.endTime}`}
        >
          <span aria-hidden="true" className="absolute inset-y-2 start-1.5 w-0.5 rounded-full" style={{ background: "var(--warehouse-calendar-color)" }} />
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn("truncate font-medium text-[var(--md-ink)]", compact ? "text-[11px] leading-4" : "text-[12px] leading-4")}>{event.title}</p>
              <p data-i18n-skip dir="ltr" className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-[var(--md-text)]">
                {event.time}-{event.endTime}
              </p>
            </div>
            {!compact ? (
              <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--md-surface)_60%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                {event.type}
              </span>
            ) : null}
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

function WarehouseCalendarWeekGrid({ days, customers }: { days: WarehouseCalendarDay[]; customers: readonly WarehouseCalendarCustomer[] }) {
  const { language } = useLanguage()
  const timeZoneLabel = new Intl.DateTimeFormat(language, { timeZoneName: "short" })
    .formatToParts(days[0]?.date ?? new Date())
    .find((part) => part.type === "timeZoneName")?.value ?? "Local"

  return (
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
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] bg-[color-mix(in_srgb,var(--md-surface)_72%,transparent)]">
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
            {days.map((day) => (
              <WarehouseCalendarTimedDayColumn key={day.dateKey} day={day} customers={customers} />
            ))}
          </div>
        </div>
      </div>
    </Surface>
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
}: {
  customers?: readonly WarehouseCalendarCustomer[]
  events?: readonly WarehouseCalendarEvent[]
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
  const eventCount = calendarDays.reduce((total, day) => total + day.events.length, 0)
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
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseToolbar title={t("Calendar")} meta={t("Dock bookings, count windows, dispatch cutoffs and stock-take planning.")}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(calendarView === "Week" ? "Previous week" : "Previous month")}
              className="rounded-[var(--md-radius-md)] bg-white/48 shadow-[var(--md-shadow-line)] hover:bg-white/74"
              onClick={() => moveCalendarPeriod(-1)}
            >
              <ChevronLeft className="size-4 rtl:rotate-180" strokeWidth={1.25} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74"
              onClick={showToday}
            >
              {t("Today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(calendarView === "Week" ? "Next week" : "Next month")}
              className="rounded-[var(--md-radius-md)] bg-white/48 shadow-[var(--md-shadow-line)] hover:bg-white/74"
              onClick={() => moveCalendarPeriod(1)}
            >
              <ChevronRight className="size-4 rtl:rotate-180" strokeWidth={1.25} />
            </Button>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-surface)_72%,transparent)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <CalendarDays data-icon="inline-start" className="size-4 text-[var(--md-accent)]" strokeWidth={1.25} />
            <span>{calendarView === "Week" ? `${t("Week of")} ${periodLabel}` : periodLabel}</span>
          </div>
          <StatusPill tone="teal">
            {eventCount} {t(eventCount === 1 ? "Event" : "Events")}
          </StatusPill>
          <SegmentedControl options={warehouseCalendarViewModes} value={calendarView} onChange={changeCalendarView} />
        </div>
      </WarehouseToolbar>
      {visibleCustomers.length ? <WarehouseCalendarCustomerKey customers={visibleCustomers} selectedCustomerIds={selectedCustomerIds} onSelectCustomer={handleSelectCustomer} /> : null}
      {calendarView === "Week" ? (
        <WarehouseCalendarWeekGrid days={calendarDays} customers={customers} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {calendarDays.map((day) => (
            <WarehouseCalendarDayCell key={day.dateKey} day={day} view={calendarView} customers={customers} />
          ))}
        </div>
      )}
    </div>
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
