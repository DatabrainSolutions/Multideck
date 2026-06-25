import { Fragment, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Barcode,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  ClipboardCheck,
  FileText,
  Plus,
  Printer,
  ScanLine,
  Search,
  Send,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MultideckDatePicker } from "@/components/multideck/date-picker"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { FilterChips, SegmentedControl } from "@/components/multideck/workflow-components"
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"
import { useLanguage } from "@/i18n/language-provider"
import {
  warehouseCalendarCustomers,
  warehouseCalendarEvents,
  warehouseCalendarViewModes,
  warehouseGoodsInFlowSteps,
  warehouseGoodsInKanbanColumns,
  warehouseGoodsInReceipts,
  warehouseGoodsInSources,
  warehouseGoodsMovements,
  warehouseGoodsOutKanbanColumns,
  warehouseGoodsOutFlowSteps,
  warehouseGoodsOutPicks,
  warehouseMetrics,
  warehouseOrderFilters,
  warehouseOrders,
  warehouseProducts,
  warehouseProductFilters,
  warehouseStockFilters,
  warehouseStockRows,
  type WarehouseCalendarCustomerId,
  type WarehouseCalendarEvent,
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

const stockMorphTransition = { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const }
const tableHeadClass = "border-r border-[rgba(90,103,100,0.12)] bg-[rgba(90,103,100,0.06)] px-4 py-3 text-[12px] font-medium text-[var(--md-text)] last:border-r-0"
const tableCellClass = "border-r border-[rgba(90,103,100,0.09)] px-4 py-3 last:border-r-0"
const kanbanLiftShadow = "var(--md-premium-stroke), 0 20px 42px rgba(42,52,50,0.16)"
const goodsInWizardSurfaceClass = "bg-[#F4F9F7] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.12),0_18px_42px_rgba(14,125,116,0.08)]"

type WarehouseKanbanCardData = {
  id: string
  title: string
  meta: string
  status: string
  tone: StatusTone
}

type WarehouseKanbanColumnSource = {
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

type WarehouseKanbanPickup = {
  transformOrigin: string
  rotate: number
}

type WarehouseCalendarViewMode = (typeof warehouseCalendarViewModes)[number]
type WarehouseProduct = (typeof warehouseProducts)[number]
type WarehouseOrder = (typeof warehouseOrders)[number]
type WarehouseGoodsInSource = (typeof warehouseGoodsInSources)[number]
type WarehouseGoodsInStepId = (typeof warehouseGoodsInFlowSteps)[number]["id"]
type WarehouseGoodsOutStepId = (typeof warehouseGoodsOutFlowSteps)[number]["id"]
type WarehouseGoodsOutPick = (typeof warehouseGoodsOutPicks)[number]
type WarehouseGoodsInLine = {
  id: string
  product: string
  sku: string
  expected: number
  actual: number
  unit: string
  condition: string
  status: string
  tone: StatusTone
  location: string
  note: string
  photoCount: number
}
type WarehouseGoodsInReceipt = {
  id: string
  customer: string
  supplier: string
  source: string
  deliveryNote: string
  booking: string
  contact: string
  owner: string
  status: string
  tone: StatusTone
  progress: number
  expected: string
  actual: string
  nextAction: string
  completeness: readonly { label: string; status: string; tone: StatusTone }[]
  lines: readonly WarehouseGoodsInLine[]
  putaway: readonly { label: string; value: string; tone: StatusTone }[]
}
type WarehouseGoodsInActualMap = Record<string, Record<string, number>>
type WarehouseGoodsInLineWithActual = WarehouseGoodsInLine & { actual: number }
type WarehousePickResumeRow = {
  id: string
  direction: "Goods in" | "Goods out"
  expectedDate: string
  customerNumber: string
  name: string
  reference: string
  owner: string
  status: string
  tone: StatusTone
  progress: number
  nextStep: string
  stepLabel: string
  stepTone: StatusTone
  savedAt: string
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

const defaultKanbanPickup: WarehouseKanbanPickup = {
  transformOrigin: "50% 50%",
  rotate: 0,
}

const kanbanCardToneClass: Record<StatusTone, string> = {
  green: "bg-[color-mix(in_srgb,var(--md-green)_12%,white)] hover:bg-[color-mix(in_srgb,var(--md-green)_16%,white)]",
  amber: "bg-[color-mix(in_srgb,var(--md-amber)_13%,white)] hover:bg-[color-mix(in_srgb,var(--md-amber)_17%,white)]",
  red: "bg-[color-mix(in_srgb,var(--md-red)_10%,white)] hover:bg-[color-mix(in_srgb,var(--md-red)_14%,white)]",
  blue: "bg-[color-mix(in_srgb,var(--md-blue)_13%,white)] hover:bg-[color-mix(in_srgb,var(--md-blue)_17%,white)]",
  neutral: "bg-[rgba(248,252,251,0.88)] hover:bg-white",
  teal: "bg-[color-mix(in_srgb,var(--md-accent)_12%,white)] hover:bg-[color-mix(in_srgb,var(--md-accent)_16%,white)]",
}

const warehouseCalendarWeekStart = "2026-06-22"
const warehouseCalendarMonthStart = "2026-06-01"
const warehouseCalendarMonthIndex = 5
const warehouseCalendarCurrentDate = "2026-06-24"
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

function getWeekDateKeys(startKey: string) {
  const start = parseDateKey(startKey)
  return Array.from({ length: 7 }, (_, index) => formatDateKey(addCalendarDays(start, index)))
}

function getMonthDateKeys(monthStartKey: string) {
  const monthStart = parseDateKey(monthStartKey)
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const visibleDayCount = firstWeekday + daysInMonth > 35 ? 42 : 35
  const gridStart = addCalendarDays(monthStart, -firstWeekday)

  return Array.from({ length: visibleDayCount }, (_, index) => formatDateKey(addCalendarDays(gridStart, index)))
}

function getWarehouseCalendarCustomer(customerId: WarehouseCalendarCustomerId) {
  return warehouseCalendarCustomers.find((customer) => customer.id === customerId) ?? warehouseCalendarCustomerFallback
}

function getTimeInMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

function getHourLabel(hour: number) {
  const normalizedHour = hour % 24
  if (normalizedHour === 0) return "12 AM"
  if (normalizedHour < 12) return `${normalizedHour} AM`
  if (normalizedHour === 12) return "12 PM"
  return `${normalizedHour - 12} PM`
}

function getCalendarEventsByDate() {
  return warehouseCalendarEvents.reduce<Record<string, WarehouseCalendarEvent[]>>((eventsByDate, event) => {
    eventsByDate[event.date] = [...(eventsByDate[event.date] ?? []), event]
    return eventsByDate
  }, {})
}

function buildCalendarDays(view: WarehouseCalendarViewMode, language: string, eventsByDate: Record<string, WarehouseCalendarEvent[]>): WarehouseCalendarDay[] {
  const weekdayFormatter = new Intl.DateTimeFormat(language, { weekday: "short" })
  const dateFormatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" })
  const dayNumberFormatter = new Intl.DateTimeFormat(language, { day: "numeric" })
  const dateKeys = view === "Week" ? getWeekDateKeys(warehouseCalendarWeekStart) : getMonthDateKeys(warehouseCalendarMonthStart)

  return dateKeys.map((dateKey) => {
    const date = parseDateKey(dateKey)

    return {
      dateKey,
      date,
      label: weekdayFormatter.format(date),
      dateLabel: dateFormatter.format(date),
      dayNumber: dayNumberFormatter.format(date),
      outsideMonth: date.getMonth() !== warehouseCalendarMonthIndex,
      events: [...(eventsByDate[dateKey] ?? [])].sort((firstEvent, secondEvent) => getTimeInMinutes(firstEvent.time) - getTimeInMinutes(secondEvent.time)),
    }
  })
}

function formatCalendarPeriodLabel(view: WarehouseCalendarViewMode, language: string) {
  if (view === "Month") {
    return new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(parseDateKey(warehouseCalendarMonthStart))
  }

  const start = parseDateKey(warehouseCalendarWeekStart)
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
    const eventEnd = getTimeInMinutes(event.endTime)

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
      const eventEnd = getTimeInMinutes(event.endTime)
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

function getKanbanPickup(event: ReactPointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
  const rotate = clamp((x - 0.5) * 12 + (0.5 - y) * 3, -8, 8)

  return {
    transformOrigin: `${Math.round(x * 100)}% ${Math.round(y * 100)}%`,
    rotate,
  }
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

function findCardColumnId(columns: readonly SortableWarehouseKanbanColumn[], cardId: string) {
  return columns.find((column) => column.cards.some((card) => card.id === cardId))?.id ?? null
}

function findColumnIndex(columns: readonly SortableWarehouseKanbanColumn[], columnId: string) {
  return columns.findIndex((column) => column.id === columnId)
}

function findCard(columns: readonly SortableWarehouseKanbanColumn[], cardId: string) {
  return columns.flatMap((column) => column.cards).find((card) => card.id === cardId) ?? null
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
      <Table className="text-[13px]" style={{ minWidth } as CSSProperties}>
        <TableHeader>
          <TableRow className="border-b border-[rgba(90,103,100,0.12)] hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={cn(tableHeadClass, alignClass(column.align), column.className)}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <motion.tbody
          className="[&_tr:last-child]:border-0"
          variants={shouldReduceMotion ? undefined : tableBodyReveal}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "show"}
        >
          {rows.length ? rows.map((row) => {
            const hasRowDetail = Boolean(renderRowDetail)
            const isInteractiveRow = Boolean(onRowClick || renderRowDetail)
            const isDetailOpen = openRowId === row.id
            const rowElement = (
              <motion.tr
                variants={shouldReduceMotion ? undefined : rowReveal}
                tabIndex={isInteractiveRow ? 0 : undefined}
                aria-haspopup={hasRowDetail ? "dialog" : undefined}
                aria-expanded={hasRowDetail ? isDetailOpen : undefined}
                aria-label={hasRowDetail ? rowDetailLabel?.(row) ?? `Open details for ${row.id}` : undefined}
                className={cn(
                  "h-[66px] border-b border-[rgba(90,103,100,0.09)] bg-[var(--md-surface)] transition-[background,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgba(90,103,100,0.045)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
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
            <TableRow className="h-[160px] border-0 hover:bg-transparent">
              <TableCell colSpan={columns.length} className="text-center">
                <div className="mx-auto max-w-[360px]">
                  <p className="text-[14px] font-medium text-[var(--md-ink)]">{emptyMessage}</p>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">Change a filter or search a wider set of {rowLabel}.</p>
                </div>
              </TableCell>
            </TableRow>
          )}
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

type WarehouseStockRow = (typeof warehouseStockRows)[number]
type WarehouseStockBranchLocation = WarehouseStockRow["branchLocations"][number]

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
    render: (product: (typeof warehouseProducts)[number]) => (
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{product.name}</p>
        <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{product.customer} - {product.category}</p>
      </div>
    ),
  },
  {
    key: "sku",
    label: "SKU",
    render: (product: (typeof warehouseProducts)[number]) => <WarehouseCode>{product.sku}</WarehouseCode>,
  },
  {
    key: "hsCode",
    label: "HS code",
    render: (product: (typeof warehouseProducts)[number]) => <WarehouseCode className="text-[var(--md-text)]">{product.hsCode}</WarehouseCode>,
  },
  {
    key: "supplier",
    label: "Supplier ref",
    render: (product: (typeof warehouseProducts)[number]) => <WarehouseCode className="text-[var(--md-text)]">{product.supplierRef}</WarehouseCode>,
  },
  {
    key: "stock",
    label: "Stock",
    align: "right" as const,
    render: (product: (typeof warehouseProducts)[number]) => (
      <div className="text-right">
        <p className="text-[14px] font-medium tabular-nums text-[var(--md-ink)]">{product.onHand}</p>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{product.available} available</p>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (product: (typeof warehouseProducts)[number]) => <StatusPill tone={product.tone}>{product.status}</StatusPill>,
  },
  {
    key: "inbound",
    label: "Inbound",
    align: "right" as const,
    render: (product: (typeof warehouseProducts)[number]) => <span className="tabular-nums text-[var(--md-ink)]">{product.inbound}</span>,
  },
  {
    key: "owner",
    label: "Owner",
    align: "center" as const,
    render: (product: (typeof warehouseProducts)[number]) => (
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
    render: (order: (typeof warehouseOrders)[number]) => (
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
    render: (order: (typeof warehouseOrders)[number]) => (
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
    render: (order: (typeof warehouseOrders)[number]) => <span className="tabular-nums text-[var(--md-ink)]">{order.lines}</span>,
  },
  {
    key: "value",
    label: "Value",
    align: "right" as const,
    render: (order: (typeof warehouseOrders)[number]) => <span className="font-medium tabular-nums text-[var(--md-ink)]">{order.value}</span>,
  },
  {
    key: "due",
    label: "Due",
    render: (order: (typeof warehouseOrders)[number]) => (
      <div>
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{order.due}</p>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{order.window}</p>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (order: (typeof warehouseOrders)[number]) => <StatusPill tone={order.tone}>{order.status}</StatusPill>,
  },
] satisfies WarehouseTableColumn<WarehouseOrder>[]

const movementColumns = [
  {
    key: "movement",
    label: "Movement",
    className: "min-w-[190px]",
    render: (movement: (typeof warehouseGoodsMovements)[number]) => (
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
    render: (movement: (typeof warehouseGoodsMovements)[number]) => (
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
    render: (movement: (typeof warehouseGoodsMovements)[number]) => <span className="font-medium tabular-nums text-[var(--md-ink)]">{movement.quantity}</span>,
  },
  {
    key: "dock",
    label: "Dock / bin",
    render: (movement: (typeof warehouseGoodsMovements)[number]) => <WarehouseCode>{movement.dock}</WarehouseCode>,
  },
  {
    key: "time",
    label: "Time",
    render: (movement: (typeof warehouseGoodsMovements)[number]) => <span className="text-[13px] text-[var(--md-text)]">{movement.time}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (movement: (typeof warehouseGoodsMovements)[number]) => <StatusPill tone={movement.tone}>{movement.status}</StatusPill>,
  },
] satisfies WarehouseTableColumn<(typeof warehouseGoodsMovements)[number]>[]

export function WarehouseProductsTable({ rows = warehouseProducts }: { rows?: typeof warehouseProducts }) {
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

export function WarehouseOrdersTable({ rows = warehouseOrders }: { rows?: typeof warehouseOrders }) {
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

function WarehouseMovementsTable({ rows = warehouseGoodsMovements }: { rows?: typeof warehouseGoodsMovements }) {
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

export function WarehouseMetricStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {warehouseMetrics.map((metric) => {
        const Icon = metric.icon

        return (
          <Surface key={metric.label} padding="md" className="min-h-[106px] rounded-[var(--md-radius-xl)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--md-text)]">{metric.label}</p>
                <strong className="mt-2 block text-[28px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{metric.value}</strong>
              </div>
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/56 text-[var(--metric-tone)] shadow-[var(--md-shadow-line)]" style={{ "--metric-tone": toneToVar(metric.tone) } as CSSProperties}>
                <Icon className="size-4" strokeWidth={1.25} />
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">{metric.detail}</p>
          </Surface>
        )
      })}
    </div>
  )
}

export function WarehousePageHeader({ onNewPick }: { onNewPick?: () => void }) {
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
            {t("Inventory, stock, goods movements, warehouse orders, and operator planning in one calm workspace.")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/48 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/74">
          <SlidersHorizontal data-icon="inline-start" className="size-4" strokeWidth={1.25} />
          {t("Filters")}
        </Button>
        <Button
          type="button"
          className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
          onClick={onNewPick}
        >
          <Plus data-icon="inline-start" className="size-4" strokeWidth={1.25} />
          {t("New pick")}
        </Button>
      </div>
    </div>
  )
}

function WarehouseActivityPanel() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4 shadow-[var(--md-stroke-bottom)]">
        <SectionHeader title="Today in the warehouse" meta="Receiving, pick, and dispatch work from the fake UI dataset." />
      </div>
      <motion.div
        className="divide-y divide-[rgba(90,103,100,0.09)]"
        variants={shouldReduceMotion ? undefined : tableBodyReveal}
        initial={shouldReduceMotion ? undefined : "hidden"}
        animate={shouldReduceMotion ? undefined : "show"}
      >
        {warehouseGoodsMovements.slice(0, 5).map((movement) => (
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
      </motion.div>
    </Surface>
  )
}

export function WarehouseDashboard() {
  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseMetricStrip />
      <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <div className="grid gap-[var(--md-gap-md)]">
          <WarehouseToolbar title="Open warehouse orders" meta="Pick, receive, and dispatch work ready for the next product pass.">
            <StatusPill tone="amber">6 active</StatusPill>
          </WarehouseToolbar>
          <WarehouseOrdersTable rows={warehouseOrders.slice(0, 5)} />
        </div>
        <WarehouseActivityPanel />
      </div>
    </div>
  )
}

export function WarehouseOrdersView() {
  const [activeFilter, setActiveFilter] = useState<string>(warehouseOrderFilters[0])
  const filter = activeFilter.split(" · ")[0]
  const rows =
    filter === "All orders" ? warehouseOrders :
    warehouseOrders.filter((order) => order.type === filter)

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
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
}) {
  const filter = activeFilter.split(" · ")[0]
  const rows =
    filter === "All" ? warehouseProducts :
    filter === "Low stock" ? warehouseProducts.filter((product) => product.status === "Low stock") :
    filter === "Inbound" ? warehouseProducts.filter((product) => product.inbound > 0) :
    warehouseProducts.filter((product) => product.status === "Quarantine")

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

function createGoodsInActualMap() {
  return warehouseGoodsInReceipts.reduce<WarehouseGoodsInActualMap>((receiptMap, receipt) => {
    receiptMap[receipt.id] = receipt.lines.reduce<Record<string, number>>((lineMap, line) => {
      lineMap[line.id] = line.actual
      return lineMap
    }, {})

    return receiptMap
  }, {})
}

function getGoodsInLineTone(line: WarehouseGoodsInLineWithActual): StatusTone {
  if (line.condition !== "Clear" && line.condition !== "Awaiting arrival") return line.tone
  if (line.actual === line.expected && line.actual > 0) return "green"
  if (line.actual === 0) return line.tone
  if (line.actual < line.expected) return "amber"
  return "blue"
}

function getGoodsInLineStatus(line: WarehouseGoodsInLineWithActual) {
  if (line.condition !== "Clear" && line.condition !== "Awaiting arrival") return line.status
  if (line.actual === 0) return line.status
  if (line.actual === line.expected) return "Matched"
  if (line.actual < line.expected) return "Short"
  return "Over"
}

function GoodsInMetric({
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
      className="min-w-0 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--goods-in-tone)_8%,var(--md-surface-soft))] px-3 py-2 shadow-[var(--md-shadow-line)]"
      style={{ "--goods-in-tone": toneToVar(tone) } as CSSProperties}
    >
      <p className="truncate text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
      <p className="mt-1 truncate text-[13px] font-medium text-[var(--md-ink)]">{value}</p>
    </div>
  )
}

function getGoodsInResumeStep(receipt: WarehouseGoodsInReceipt): WarehouseGoodsInStepId {
  if (receipt.status === "Need setup") return "setup"
  if (receipt.status === "Putaway") return "summary"
  if (receipt.lines.some((line) => line.status === "Damage" || line.status === "Variance")) return "exceptions"
  return "receive"
}

function getWarehouseCustomerNumber(customer: string) {
  const customerNumbers: Record<string, string> = {
    "Atlas Office Supply": "AOS-001",
    "Bauhaus Importe GmbH": "BAU-001",
    "Black Forest Foods": "BFF-001",
    "Marlow Apparel Ltd": "MAR-001",
    "Mediterranean Spice Trading": "MST-001",
    "Northwind GmbH": "NW-001",
  }

  return customerNumbers[customer] ?? "CUS-000"
}

function getGoodsInExpectedDate(receipt: WarehouseGoodsInReceipt) {
  const expectedDates: Record<string, string> = {
    "GIN-8821": "2026-06-24",
    "GIN-8824": "2026-06-24",
    "GIN-8817": "2026-06-25",
  }

  return expectedDates[receipt.id] ?? "2026-06-24"
}

function getGoodsOutExpectedDate(pick: WarehouseGoodsOutPick) {
  const expectedDates: Record<string, string> = {
    "GOUT-6710": "2026-06-24",
    "GOUT-6708": "2026-06-24",
    "GOUT-6704": "2026-06-24",
    "GOUT-6698": "2026-06-25",
  }

  return expectedDates[pick.id] ?? "2026-06-24"
}

function getGoodsInResumeRows(): WarehousePickResumeRow[] {
  return warehouseGoodsInReceipts.map((receipt) => {
    const step = warehouseGoodsInFlowSteps.find((item) => item.id === getGoodsInResumeStep(receipt)) ?? warehouseGoodsInFlowSteps[0]

    return {
      id: receipt.id,
      direction: "Goods in",
      expectedDate: getGoodsInExpectedDate(receipt),
      customerNumber: getWarehouseCustomerNumber(receipt.customer),
      name: receipt.source,
      reference: receipt.deliveryNote,
      owner: receipt.owner,
      status: receipt.status,
      tone: receipt.tone,
      progress: receipt.progress,
      nextStep: receipt.nextAction,
      stepLabel: step.label,
      stepTone: step.tone,
      savedAt: receipt.status === "Need setup" ? "Saved yesterday" : receipt.status === "Putaway" ? "Saved today" : "Saved 4 min ago",
    }
  })
}

function getGoodsOutResumeRows(): WarehousePickResumeRow[] {
  return warehouseGoodsOutPicks.map((pick) => {
    const step = warehouseGoodsOutFlowSteps.find((item) => item.id === pick.stepId) ?? warehouseGoodsOutFlowSteps[0]

    return {
      id: pick.id,
      direction: "Goods out",
      expectedDate: getGoodsOutExpectedDate(pick),
      customerNumber: getWarehouseCustomerNumber(pick.customer),
      name: pick.name,
      reference: pick.orderRef,
      owner: pick.owner,
      status: pick.status,
      tone: pick.tone,
      progress: pick.progress,
      nextStep: pick.nextStep,
      stepLabel: step.label,
      stepTone: step.tone,
      savedAt: pick.savedAt,
    }
  })
}

function WarehousePickProgress({ value, tone }: { value: number; tone: StatusTone }) {
  return (
    <div className="flex min-w-[142px] items-center gap-2">
      <Progress
        value={value}
        className="h-1.5 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--pick-progress-tone)]"
        style={{ "--pick-progress-tone": toneToVar(tone) } as CSSProperties}
      />
      <span className="w-8 text-end text-[11px] font-medium tabular-nums text-[var(--md-text)]">{value}%</span>
    </div>
  )
}

export function WarehousePickResumeTable({
  title,
  meta,
  rows,
  onOpenPick,
}: {
  title: string
  meta: string
  rows: WarehousePickResumeRow[]
  onOpenPick?: (row: WarehousePickResumeRow) => void
}) {
  const [expectedDateByRow, setExpectedDateByRow] = useState<Record<string, string>>(() => (
    rows.reduce<Record<string, string>>((dateMap, row) => {
      dateMap[row.id] = row.expectedDate
      return dateMap
    }, {})
  ))

  useEffect(() => {
    setExpectedDateByRow((current) => {
      const next = { ...current }
      rows.forEach((row) => {
        if (!next[row.id]) next[row.id] = row.expectedDate
      })
      return next
    })
  }, [rows])

  const columns = useMemo<WarehouseTableColumn<WarehousePickResumeRow>[]>(() => [
    {
      key: "expectedDate",
      label: "Expected date",
      className: "w-[176px]",
      render: (row) => (
        <div
          className="w-[154px] [&_button]:h-9 [&_button]:bg-white/64 [&_button]:px-2 [&_button]:text-[12px]"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MultideckDatePicker
            value={expectedDateByRow[row.id] ?? row.expectedDate}
            onChange={(date) => {
              if (!date) return
              setExpectedDateByRow((current) => ({ ...current, [row.id]: date }))
            }}
            placeholder="Select date"
            title="Expected date"
            description="Choose one expected date for this pick."
            align="start"
          />
        </div>
      ),
    },
    {
      key: "progress",
      label: "Progress",
      className: "w-[178px]",
      render: (row) => <WarehousePickProgress value={row.progress} tone={row.tone} />,
    },
    {
      key: "status",
      label: "Status",
      className: "w-[132px]",
      render: (row) => <StatusPill tone={row.tone}>{row.status}</StatusPill>,
    },
    {
      key: "customerNumber",
      label: "Customer no.",
      className: "w-[142px]",
      render: (row) => <WarehouseCode>{row.customerNumber}</WarehouseCode>,
    },
    {
      key: "name",
      label: "Name",
      className: "min-w-[240px]",
      render: (row) => (
        <span className="grid gap-1">
          <span className="truncate font-medium text-[var(--md-ink)]">{row.name}</span>
          <WarehouseCode>{row.reference}</WarehouseCode>
        </span>
      ),
    },
    {
      key: "owner",
      label: "Owner",
      className: "w-[88px]",
      align: "center",
      render: (row) => (
        <span data-i18n-skip dir="ltr" className="inline-grid size-7 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[11px] font-medium text-[var(--md-accent)]">
          {row.owner}
        </span>
      ),
    },
    {
      key: "nextStep",
      label: "Next step",
      className: "min-w-[280px]",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <StatusPill tone={row.stepTone}>{row.stepLabel}</StatusPill>
          <span className="truncate text-[12.5px] text-[var(--md-text)]">{row.nextStep}</span>
        </span>
      ),
    },
    {
      key: "saved",
      label: "Saved",
      className: "w-[140px]",
      render: (row) => <span className="text-[12px] text-[var(--md-subtle)]">{row.savedAt}</span>,
    },
  ], [expectedDateByRow])

  return (
    <div className="grid gap-3">
      <SectionHeader
        eyebrow="Resume picks"
        title={title}
        meta={meta}
        action={<StatusPill tone="teal">{rows.length} open</StatusPill>}
      />
      <div className="overflow-x-auto md-scrollbar">
        <WarehouseInventoryTable
          rows={rows}
          columns={columns}
          minWidth={1280}
          rowLabel="picks"
          emptyMessage="No picks are waiting in this view."
          onRowClick={onOpenPick}
        />
      </div>
    </div>
  )
}

export function WarehousePickResumeTablePreview() {
  return (
    <WarehousePickResumeTable
      title="Open goods-in picks"
      meta="Rows resume the guided flow at the step where the warehouse team left off."
      rows={getGoodsInResumeRows()}
    />
  )
}

function GoodsInSourceCard({
  source,
  active,
  onSelect,
}: {
  source: WarehouseGoodsInSource
  active: boolean
  onSelect: () => void
}) {
  const isDocument = source === "Document / PO"

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-[var(--md-radius-lg)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,box-shadow,scale,transform] active:scale-[0.98]",
        active ? "bg-[color-mix(in_srgb,var(--md-accent)_12%,white)] shadow-[var(--md-shadow-green-card-selected)]" : "bg-white/54 hover:bg-white/78",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-white/62 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
          {isDocument ? <FileText className="size-4" strokeWidth={1.25} /> : <Plus className="size-4" strokeWidth={1.25} />}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{source}</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
            {isDocument ? "Parse the purchase order or delivery note, then receive against expected lines." : "Start when the stock arrives before a document has been prepared."}
          </p>
        </div>
      </div>
    </button>
  )
}

function GoodsInQueueCard({
  receipt,
  active,
  onSelect,
}: {
  receipt: WarehouseGoodsInReceipt
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "w-full rounded-[var(--md-radius-lg)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,box-shadow,scale,transform] active:scale-[0.98]",
        active ? "bg-[color-mix(in_srgb,var(--md-accent)_11%,white)] shadow-[var(--md-shadow-green-card-selected)]" : "bg-white/50 hover:bg-white/76",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <WarehouseCode>{receipt.id}</WarehouseCode>
          <p className="mt-2 truncate text-[13px] font-medium text-[var(--md-ink)]">{receipt.customer}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{receipt.booking}</p>
        </div>
        <StatusPill tone={receipt.tone}>{receipt.status}</StatusPill>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Progress
          value={receipt.progress}
          className="h-1.5 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--goods-in-progress)]"
          style={{ "--goods-in-progress": toneToVar(receipt.tone) } as CSSProperties}
        />
        <span className="w-8 text-end text-[11px] font-medium tabular-nums text-[var(--md-text)]">{receipt.progress}%</span>
      </div>
    </button>
  )
}

function GoodsInStepRail({
  activeStep,
  onChange,
}: {
  activeStep: WarehouseGoodsInStepId
  onChange: (step: WarehouseGoodsInStepId) => void
}) {
  const activeIndex = getGoodsInStepIndex(activeStep)
  const activeStepMeta = warehouseGoodsInFlowSteps[activeIndex] ?? warehouseGoodsInFlowSteps[0]
  const completeCount = Math.max(activeIndex, 0)

  return (
    <Surface padding="sm" className={cn("sticky top-[72px] z-10 rounded-[var(--md-radius-xl)] backdrop-blur-xl", goodsInWizardSurfaceClass)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--md-subtle)]">Step {activeIndex + 1} of {warehouseGoodsInFlowSteps.length}</p>
          <h2 className="mt-0.5 truncate text-[15px] font-medium text-[var(--md-ink)]">{activeStepMeta.label}</h2>
        </div>
        <StatusPill tone={activeStepMeta.tone}>{completeCount}/{warehouseGoodsInFlowSteps.length - 1} complete</StatusPill>
      </div>
      <div className="mt-3">
        <div
          className="grid gap-1 rounded-full bg-[rgba(14,125,116,0.06)] p-1 shadow-[inset_0_0_0_1px_rgba(14,125,116,0.1),0_1px_1px_rgba(14,125,116,0.04)]"
          style={{ gridTemplateColumns: `repeat(${warehouseGoodsInFlowSteps.length}, minmax(0, 1fr))` }}
          aria-label="Goods in progress"
        >
          {warehouseGoodsInFlowSteps.map((step, index) => {
            const active = activeStep === step.id
            const complete = index < activeIndex

            return (
              <button
                key={step.id}
                type="button"
                aria-current={active ? "step" : undefined}
                aria-label={step.label}
                className={cn(
                  "relative h-2.5 min-w-0 overflow-hidden rounded-full bg-[rgba(90,103,100,0.14)] transition-[background,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgba(14,125,116,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.28)] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                  active && "scale-y-125 shadow-[0_0_0_1px_rgba(14,125,116,0.18),0_8px_18px_rgba(14,125,116,0.14)]",
                )}
                onClick={() => onChange(step.id)}
              >
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width,background] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active || complete ? "bg-[var(--md-accent)]" : "bg-transparent",
                  )}
                  style={{ width: active || complete ? "100%" : "0%" }}
                />
              </button>
            )
          })}
        </div>
        <div
          className="mt-2 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${warehouseGoodsInFlowSteps.length}, minmax(0, 1fr))` }}
        >
          {warehouseGoodsInFlowSteps.map((step) => {
            const active = activeStep === step.id

            return (
              <button
                key={step.id}
                type="button"
                title={step.label}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1 py-0.5 text-center text-[10px] font-medium transition-[color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.22)]",
                  active ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)] hover:text-[var(--md-text)]",
                )}
                onClick={() => onChange(step.id)}
              >
                <span className="truncate">{step.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </Surface>
  )
}

function GoodsInLineRow({
  line,
  active,
  hasEvidence,
  onSelect,
  onAdjust,
  onMatchExpected,
}: {
  line: WarehouseGoodsInLineWithActual
  active: boolean
  hasEvidence: boolean
  onSelect: () => void
  onAdjust: (delta: number) => void
  onMatchExpected: () => void
}) {
  const variance = line.actual - line.expected
  const tone = getGoodsInLineTone(line)
  const status = getGoodsInLineStatus(line)

  return (
    <div
      className={cn(
        "grid gap-3 rounded-[var(--md-radius-lg)] bg-white/58 p-3 shadow-[var(--md-shadow-line)] transition-[background,box-shadow]",
        active && "bg-[color-mix(in_srgb,var(--md-accent)_10%,white)] shadow-[var(--md-shadow-green-card-selected)]",
      )}
    >
      <button type="button" className="grid gap-3 text-start lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" onClick={onSelect}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <WarehouseCode>{line.sku}</WarehouseCode>
            <StatusPill tone={tone}>{status}</StatusPill>
            {hasEvidence ? <StatusPill tone="blue">Photo attached</StatusPill> : null}
          </div>
          <p className="mt-2 truncate text-[14px] font-medium text-[var(--md-ink)]">{line.product}</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{line.note}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[260px]">
          <GoodsInMetric label="Expected" value={<span data-i18n-skip dir="ltr">{line.expected} {line.unit}</span>} tone="neutral" />
          <GoodsInMetric label="Actual" value={<span data-i18n-skip dir="ltr">{line.actual} {line.unit}</span>} tone={tone} />
          <GoodsInMetric label="Variance" value={<span data-i18n-skip dir="ltr">{variance > 0 ? "+" : ""}{variance}</span>} tone={variance === 0 ? "green" : variance < 0 ? "amber" : "blue"} />
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-[var(--md-radius-md)] bg-white/54 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80"
          aria-label={`Reduce actual quantity for ${line.product}`}
          onClick={() => onAdjust(-1)}
        >
          -1
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-[var(--md-radius-md)] bg-white/54 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80"
          aria-label={`Increase actual quantity for ${line.product}`}
          onClick={() => onAdjust(1)}
        >
          +1
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-[var(--md-radius-md)] bg-white/54 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80"
          onClick={onMatchExpected}
        >
          <Check data-icon="inline-start" className="size-3.5" strokeWidth={1.25} />
          Mark expected
        </Button>
      </div>
    </div>
  )
}

function GoodsInStockCheckTable({
  lines,
  activeLineId,
  evidenceLineIds,
  onSelectLine,
  onAdjust,
  onMatchExpected,
  onToggleEvidence,
}: {
  lines: WarehouseGoodsInLineWithActual[]
  activeLineId?: string
  evidenceLineIds: Set<string>
  onSelectLine: (lineId: string) => void
  onAdjust: (lineId: string, delta: number) => void
  onMatchExpected: (line: WarehouseGoodsInLineWithActual) => void
  onToggleEvidence: (lineId: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-white/70 shadow-[var(--md-shadow-line)]">
      <div className="max-h-[min(58vh,620px)] overflow-auto md-scrollbar">
        <Table className="text-[13px]" style={{ minWidth: 1120 } as CSSProperties}>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-b border-[rgba(90,103,100,0.12)] hover:bg-transparent">
              <TableHead className={cn(tableHeadClass, "w-[150px]")}>SKU</TableHead>
              <TableHead className={cn(tableHeadClass, "min-w-[240px]")}>Product</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[112px] text-right")}>Expected</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[112px] text-right")}>Actual</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[104px] text-right")}>Variance</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[138px]")}>Location</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[132px]")}>Status</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[220px]")}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody className="[&_tr:last-child]:border-0">
            {lines.map((line) => {
              const variance = line.actual - line.expected
              const tone = getGoodsInLineTone(line)
              const active = activeLineId === line.id
              const hasEvidence = evidenceLineIds.has(line.id)

              return (
                <TableRow
                  key={line.id}
                  tabIndex={0}
                  aria-selected={active}
                  className={cn(
                    "h-[54px] cursor-pointer border-b border-[rgba(90,103,100,0.09)] bg-white/68 transition-[background,box-shadow] hover:bg-[rgba(14,125,116,0.045)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
                    active && "bg-[color-mix(in_srgb,var(--md-accent)_9%,white)] shadow-[inset_3px_0_0_var(--md-accent)]",
                  )}
                  onClick={() => onSelectLine(line.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    onSelectLine(line.id)
                  }}
                >
                  <TableCell className={tableCellClass}><WarehouseCode>{line.sku}</WarehouseCode></TableCell>
                  <TableCell className={tableCellClass}>
                    <span className="grid gap-1">
                      <span className="truncate font-medium text-[var(--md-ink)]">{line.product}</span>
                      <span className="truncate text-[12px] text-[var(--md-subtle)]">{line.note}</span>
                    </span>
                  </TableCell>
                  <TableCell className={cn(tableCellClass, "text-right tabular-nums")}><span data-i18n-skip dir="ltr">{line.expected} {line.unit}</span></TableCell>
                  <TableCell className={cn(tableCellClass, "text-right tabular-nums")}><span data-i18n-skip dir="ltr">{line.actual} {line.unit}</span></TableCell>
                  <TableCell className={cn(tableCellClass, "text-right tabular-nums text-[var(--md-ink)]")}><span data-i18n-skip dir="ltr">{variance > 0 ? "+" : ""}{variance}</span></TableCell>
                  <TableCell className={tableCellClass}><WarehouseCode>{line.location}</WarehouseCode></TableCell>
                  <TableCell className={tableCellClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={tone}>{getGoodsInLineStatus(line)}</StatusPill>
                      {hasEvidence ? <StatusPill tone="blue">Photo</StatusPill> : null}
                    </div>
                  </TableCell>
                  <TableCell className={tableCellClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 rounded-[var(--md-radius-md)] bg-white/64 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white"
                        aria-label={`Reduce actual quantity for ${line.product}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAdjust(line.id, -1)
                        }}
                      >
                        -1
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 rounded-[var(--md-radius-md)] bg-white/64 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white"
                        aria-label={`Increase actual quantity for ${line.product}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAdjust(line.id, 1)
                        }}
                      >
                        +1
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 rounded-[var(--md-radius-md)] bg-white/64 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white"
                        onClick={(event) => {
                          event.stopPropagation()
                          onMatchExpected(line)
                        }}
                      >
                        Match
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium shadow-[var(--md-shadow-line)] hover:bg-white",
                          hasEvidence ? "bg-[color-mix(in_srgb,var(--md-blue)_12%,white)] text-[var(--md-blue)]" : "bg-white/64 text-[var(--md-ink)]",
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleEvidence(line.id)
                        }}
                      >
                        <Camera data-icon="inline-start" className="size-3.5" strokeWidth={1.25} />
                        Photo
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </tbody>
        </Table>
      </div>
    </div>
  )
}

function GoodsInExceptionPanel({
  line,
  hasEvidence,
  onToggleEvidence,
}: {
  line: WarehouseGoodsInLineWithActual
  hasEvidence: boolean
  onToggleEvidence: () => void
}) {
  const variance = line.actual - line.expected
  const needsCustomer = variance !== 0 || line.condition !== "Clear"

  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <SectionHeader
        eyebrow="Exceptions"
        title={needsCustomer ? "Customer decision needed" : "No exception on selected line"}
        meta={needsCustomer ? "Capture the evidence once, then send a clean receipt summary." : "This line can move straight into barcode print and putaway."}
      />

      <div className="mt-4 grid gap-3">
        <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <WarehouseCode>{line.sku}</WarehouseCode>
              <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{line.product}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{line.condition} · {line.note}</p>
            </div>
            <StatusPill tone={getGoodsInLineTone(line)}>{getGoodsInLineStatus(line)}</StatusPill>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <GoodsInMetric label="Expected" value={<span data-i18n-skip dir="ltr">{line.expected}</span>} />
          <GoodsInMetric label="Actual" value={<span data-i18n-skip dir="ltr">{line.actual}</span>} tone={getGoodsInLineTone(line)} />
        </div>

        <button
          type="button"
          aria-pressed={hasEvidence}
          className={cn(
            "flex min-h-[92px] items-center gap-3 rounded-[var(--md-radius-lg)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,box-shadow,scale,transform] active:scale-[0.98]",
            hasEvidence ? "bg-[color-mix(in_srgb,var(--md-blue)_12%,white)]" : "bg-white/52 hover:bg-white/78",
          )}
          onClick={onToggleEvidence}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-white/64 text-[var(--md-blue)] shadow-[var(--md-shadow-line)]">
            <Camera className="size-4" strokeWidth={1.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-[var(--md-ink)]">{hasEvidence ? "Evidence attached" : "Attach damage photo"}</span>
            <span className="mt-1 block text-[12px] leading-5 text-[var(--md-text)]">
              {hasEvidence ? "Photo evidence will travel with the receipt summary." : "Use this for visible damage, shortages, or over-delivery proof."}
            </span>
          </span>
        </button>
      </div>
    </Surface>
  )
}

function GoodsInReceiptSummary({
  receipt,
  lines,
  sent,
  printed,
  onSend,
  onPrint,
}: {
  receipt: WarehouseGoodsInReceipt
  lines: WarehouseGoodsInLineWithActual[]
  sent: boolean
  printed: boolean
  onSend: () => void
  onPrint: () => void
}) {
  const expectedTotal = lines.reduce((total, line) => total + line.expected, 0)
  const actualTotal = lines.reduce((total, line) => total + line.actual, 0)
  const exceptionCount = lines.filter((line) => getGoodsInLineStatus(line) !== "Matched").length

  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <SectionHeader
        eyebrow="Receipt"
        title="Ready to finish"
        meta="One place for the customer receipt, barcode labels, and putaway handoff."
        action={<StatusPill tone={sent ? "green" : exceptionCount ? "amber" : "teal"}>{sent ? "Sent" : `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"}`}</StatusPill>}
      />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <GoodsInMetric label="Expected" value={<span data-i18n-skip dir="ltr">{expectedTotal}</span>} tone="neutral" />
        <GoodsInMetric label="Actual" value={<span data-i18n-skip dir="ltr">{actualTotal}</span>} tone={expectedTotal === actualTotal ? "green" : "amber"} />
        <GoodsInMetric label="Lines" value={<span data-i18n-skip dir="ltr">{lines.length}</span>} tone="teal" />
      </div>

      <div className="mt-4 grid gap-2">
        {receipt.putaway.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-white/54 px-3 py-2 shadow-[var(--md-shadow-line)]">
            <span className="text-[12px] font-medium text-[var(--md-text)]">{item.label}</span>
            <StatusPill tone={item.tone}>{item.value}</StatusPill>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <Button
          type="button"
          className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
          onClick={onSend}
        >
          <Send data-icon="inline-start" className="size-4" strokeWidth={1.25} />
          {sent ? "Receipt summary sent" : "Send receipt summary"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 rounded-[var(--md-radius-lg)] bg-white/54 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80"
          onClick={onPrint}
        >
          <Printer data-icon="inline-start" className="size-4" strokeWidth={1.25} />
          {printed ? "Barcodes printed" : "Print barcodes"}
        </Button>
      </div>
    </Surface>
  )
}

function getInitialGoodsInStep(receipt: WarehouseGoodsInReceipt): WarehouseGoodsInStepId {
  return getGoodsInResumeStep(receipt)
}

function createGoodsInStepMap() {
  return warehouseGoodsInReceipts.reduce<Record<string, WarehouseGoodsInStepId>>((stepMap, receipt) => {
    stepMap[receipt.id] = getInitialGoodsInStep(receipt)
    return stepMap
  }, {})
}

function createGoodsInExpectedDateMap() {
  return warehouseGoodsInReceipts.reduce<Record<string, string>>((dateMap, receipt) => {
    dateMap[receipt.id] = getGoodsInExpectedDate(receipt)
    return dateMap
  }, {})
}

function formatGoodsInSavedAt(value?: string) {
  if (!value) return "Not saved yet"
  return value
}

function getGoodsInStepIndex(step: WarehouseGoodsInStepId) {
  return warehouseGoodsInFlowSteps.findIndex((item) => item.id === step)
}

function GoodsInWizardQueueCard({
  receipt,
  active,
  activeStep,
  progress,
  savedAt,
  waiting,
  onSelect,
}: {
  receipt: WarehouseGoodsInReceipt
  active: boolean
  activeStep: WarehouseGoodsInStepId
  progress: number
  savedAt?: string
  waiting: boolean
  onSelect: () => void
}) {
  const step = warehouseGoodsInFlowSteps.find((item) => item.id === activeStep) ?? warehouseGoodsInFlowSteps[0]

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "w-full rounded-[var(--md-radius-lg)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,box-shadow,scale,transform] active:scale-[0.98]",
        active ? "bg-[color-mix(in_srgb,var(--md-accent)_11%,white)] shadow-[var(--md-shadow-green-card-selected)]" : "bg-white/50 hover:bg-white/76",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <WarehouseCode>{receipt.id}</WarehouseCode>
          <p className="mt-2 truncate text-[13px] font-medium text-[var(--md-ink)]">{receipt.customer}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{waiting ? "Waiting for delivery" : step.label}</p>
        </div>
        <StatusPill tone={waiting ? "amber" : step.tone}>{waiting ? "Paused" : receipt.status}</StatusPill>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Progress
          value={progress}
          className="h-1.5 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--goods-in-progress)]"
          style={{ "--goods-in-progress": toneToVar(waiting ? "amber" : step.tone) } as CSSProperties}
        />
        <span className="w-8 text-end text-[11px] font-medium tabular-nums text-[var(--md-text)]">{progress}%</span>
      </div>
      <p className="mt-2 truncate text-[11.5px] text-[var(--md-subtle)]">{formatGoodsInSavedAt(savedAt)}</p>
    </button>
  )
}

function GoodsInWizardShell({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string
  title: string
  summary: string
  children: ReactNode
}) {
  return (
    <Surface padding="sm" className={cn("overflow-visible rounded-[var(--md-radius-xl)]", goodsInWizardSurfaceClass)}>
      <div className="mb-3 flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
        <p className="text-[12px] font-medium uppercase text-[var(--md-accent)]">{eyebrow}</p>
          <h1 className="mt-1 text-[18px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{title}</h1>
        </div>
        <p className="max-w-[520px] text-[12.5px] leading-5 text-[var(--md-text)] lg:text-right">{summary}</p>
      </div>
      {children}
    </Surface>
  )
}

export function WarehouseGoodsInFlow({
  initialReceiptId,
  onBack,
}: {
  initialReceiptId?: string
  onBack?: () => void
}) {
  const [activeSource, setActiveSource] = useState<WarehouseGoodsInSource>(warehouseGoodsInSources[0])
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>(() => {
    const initialReceipt = warehouseGoodsInReceipts.find((receipt) => receipt.id === initialReceiptId)
    return initialReceipt?.id ?? warehouseGoodsInReceipts[0]?.id ?? ""
  })
  const [stepByReceipt, setStepByReceipt] = useState<Record<string, WarehouseGoodsInStepId>>(() => createGoodsInStepMap())
  const [actualByReceipt, setActualByReceipt] = useState<WarehouseGoodsInActualMap>(() => createGoodsInActualMap())
  const [activeLineId, setActiveLineId] = useState<string>(warehouseGoodsInReceipts[0]?.lines[0]?.id ?? "")
  const [arrivedReceiptIds, setArrivedReceiptIds] = useState<Set<string>>(() => new Set(warehouseGoodsInReceipts.filter((receipt) => receipt.status !== "Need setup").map((receipt) => receipt.id)))
  const [waitingReceiptIds, setWaitingReceiptIds] = useState<Set<string>>(() => new Set())
  const [savedAtByReceipt, setSavedAtByReceipt] = useState<Record<string, string>>(() => ({
    "GIN-8821": "Saved 4 min ago",
    "GIN-8824": "Saved yesterday",
    "GIN-8817": "Saved today",
  }))
  const [expectedDateByReceipt, setExpectedDateByReceipt] = useState<Record<string, string>>(() => createGoodsInExpectedDateMap())
  const [evidenceLineIds, setEvidenceLineIds] = useState<Set<string>>(() => new Set(
    warehouseGoodsInReceipts.flatMap((receipt) => receipt.lines.filter((line) => line.photoCount > 0).map((line) => line.id)),
  ))
  const [sentReceiptIds, setSentReceiptIds] = useState<Set<string>>(() => new Set(warehouseGoodsInReceipts.filter((receipt) => receipt.status === "Putaway").map((receipt) => receipt.id)))
  const [printedReceiptIds, setPrintedReceiptIds] = useState<Set<string>>(() => new Set(warehouseGoodsInReceipts.filter((receipt) => receipt.status === "Putaway").map((receipt) => receipt.id)))

  const selectedReceipt: WarehouseGoodsInReceipt = warehouseGoodsInReceipts.find((receipt) => receipt.id === selectedReceiptId) ?? warehouseGoodsInReceipts[0]
  const activeStep = stepByReceipt[selectedReceipt.id] ?? getInitialGoodsInStep(selectedReceipt)
  const activeStepMeta = warehouseGoodsInFlowSteps.find((step) => step.id === activeStep) ?? warehouseGoodsInFlowSteps[0]
  const lines = useMemo<WarehouseGoodsInLineWithActual[]>(() => {
    const actualLines = actualByReceipt[selectedReceipt.id] ?? {}
    return selectedReceipt.lines.map((line) => ({ ...line, actual: actualLines[line.id] ?? line.actual }))
  }, [actualByReceipt, selectedReceipt])
  const activeLine = lines.find((line) => line.id === activeLineId) ?? lines[0]
  const receiptSent = sentReceiptIds.has(selectedReceipt.id)
  const barcodePrinted = printedReceiptIds.has(selectedReceipt.id)
  const expectedLineTotal = lines.reduce((total, line) => total + line.expected, 0)
  const actualLineTotal = lines.reduce((total, line) => total + line.actual, 0)
  const activeStepIndex = getGoodsInStepIndex(activeStep)
  const progress = Math.round(((activeStepIndex + (activeStep === "summary" ? 1 : 0)) / warehouseGoodsInFlowSteps.length) * 100)
  const isWaiting = waitingReceiptIds.has(selectedReceipt.id)
  const hasArrived = arrivedReceiptIds.has(selectedReceipt.id)

  useEffect(() => {
    const initialReceipt = warehouseGoodsInReceipts.find((receipt) => receipt.id === initialReceiptId)
    if (!initialReceipt) return
    setSelectedReceiptId(initialReceipt.id)
    setActiveLineId(initialReceipt.lines[0]?.id ?? "")
  }, [initialReceiptId])

  function selectReceipt(receipt: WarehouseGoodsInReceipt) {
    setSelectedReceiptId(receipt.id)
    setActiveLineId(receipt.lines[0]?.id ?? "")
  }

  function setActiveStep(step: WarehouseGoodsInStepId) {
    setStepByReceipt((current) => ({ ...current, [selectedReceipt.id]: step }))
  }

  function saveDraft(label = "Saved just now") {
    setSavedAtByReceipt((current) => ({ ...current, [selectedReceipt.id]: label }))
  }

  function pauseForDelivery() {
    setWaitingReceiptIds((current) => new Set(current).add(selectedReceipt.id))
    setStepByReceipt((current) => ({ ...current, [selectedReceipt.id]: "arrival" }))
    saveDraft("Waiting for delivery")
  }

  function markArrived() {
    setArrivedReceiptIds((current) => new Set(current).add(selectedReceipt.id))
    setWaitingReceiptIds((current) => {
      const next = new Set(current)
      next.delete(selectedReceipt.id)
      return next
    })
    setStepByReceipt((current) => ({ ...current, [selectedReceipt.id]: "receive" }))
    saveDraft("Delivery arrived just now")
  }

  function goToNextStep() {
    const nextStep = warehouseGoodsInFlowSteps[Math.min(activeStepIndex + 1, warehouseGoodsInFlowSteps.length - 1)]?.id
    if (!nextStep) return
    setActiveStep(nextStep)
    saveDraft()
  }

  function goToPreviousStep() {
    const previousStep = warehouseGoodsInFlowSteps[Math.max(activeStepIndex - 1, 0)]?.id
    if (!previousStep) return
    setActiveStep(previousStep)
  }

  function adjustLine(lineId: string, delta: number) {
    setActualByReceipt((current) => {
      const currentReceipt = current[selectedReceipt.id] ?? {}
      const currentValue = currentReceipt[lineId] ?? selectedReceipt.lines.find((line) => line.id === lineId)?.actual ?? 0

      return {
        ...current,
        [selectedReceipt.id]: {
          ...currentReceipt,
          [lineId]: Math.max(0, currentValue + delta),
        },
      }
    })
    setActiveLineId(lineId)
  }

  function matchExpected(line: WarehouseGoodsInLineWithActual) {
    setActualByReceipt((current) => ({
      ...current,
      [selectedReceipt.id]: {
        ...(current[selectedReceipt.id] ?? {}),
        [line.id]: line.expected,
      },
    }))
    setActiveLineId(line.id)
  }

  function toggleEvidence(lineId: string) {
    setEvidenceLineIds((current) => {
      const next = new Set(current)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
    setActiveStep("exceptions")
    saveDraft()
  }

  function sendReceipt() {
    setSentReceiptIds((current) => new Set(current).add(selectedReceipt.id))
    setActiveStep("summary")
    saveDraft("Receipt summary sent")
  }

  function printBarcodes() {
    setPrintedReceiptIds((current) => new Set(current).add(selectedReceipt.id))
    setActiveStep("summary")
    saveDraft("Barcodes printed")
  }

  function renderActiveStep() {
    if (activeStep === "source") {
      return (
        <GoodsInWizardShell eyebrow="Step 1" title="How is this goods-in pick starting?" summary="Start from a purchase order or delivery note when it exists, or create a scratch intake when stock appears before admin is complete.">
          <div className="grid gap-3 md:grid-cols-2">
            {warehouseGoodsInSources.map((source) => (
              <GoodsInSourceCard key={source} source={source} active={activeSource === source} onSelect={() => setActiveSource(source)} />
            ))}
          </div>
          <div className="mt-4 grid gap-3 rounded-[var(--md-radius-lg)] bg-white/54 p-3 shadow-[var(--md-shadow-line)] md:grid-cols-3">
            <GoodsInMetric label="Source" value={<WarehouseCode>{selectedReceipt.source}</WarehouseCode>} tone="teal" />
            <GoodsInMetric label="Delivery note" value={<WarehouseCode>{selectedReceipt.deliveryNote}</WarehouseCode>} tone="neutral" />
            <GoodsInMetric label="Customer" value={selectedReceipt.customer} tone="teal" />
          </div>
        </GoodsInWizardShell>
      )
    }

    if (activeStep === "setup") {
      return (
        <GoodsInWizardShell eyebrow="Step 2" title="Check the order setup before the stock arrives" summary="This step can be completed before delivery. If a product is missing, save the draft and come back once the setup is done.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
              Supplier
              <Input defaultValue={selectedReceipt.supplier} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
            </label>
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
              Customer contact
              <Input defaultValue={selectedReceipt.contact} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
            </label>
            <div className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
              Expected date
              <MultideckDatePicker
                value={expectedDateByReceipt[selectedReceipt.id] ?? getGoodsInExpectedDate(selectedReceipt)}
                onChange={(date) => {
                  if (!date) return
                  setExpectedDateByReceipt((current) => ({ ...current, [selectedReceipt.id]: date }))
                  saveDraft()
                }}
                placeholder="Select expected date"
                title="Expected date"
                description="Choose one expected date for this goods-in pick."
              />
            </div>
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
              Expected stock
              <Input defaultValue={selectedReceipt.expected} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
            </label>
          </div>
          <div className="mt-4 grid gap-2">
            {selectedReceipt.completeness.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-white/54 px-3 py-2 shadow-[var(--md-shadow-line)]">
                <span className="text-[12px] font-medium text-[var(--md-text)]">{item.label}</span>
                <StatusPill tone={item.tone}>{item.status}</StatusPill>
              </div>
            ))}
          </div>
        </GoodsInWizardShell>
      )
    }

    if (activeStep === "arrival") {
      return (
        <GoodsInWizardShell eyebrow="Step 3" title="Has the delivery actually arrived?" summary="This is the pause point. Operators can prepare the order now, save it, and resume when the truck, courier, or container arrives.">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-[var(--md-radius-lg)] bg-white/54 p-4 shadow-[var(--md-shadow-line)]">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={hasArrived ? "green" : isWaiting ? "amber" : "blue"}>{hasArrived ? "Arrived" : isWaiting ? "Waiting" : "Ready to receive"}</StatusPill>
                <WarehouseCode>{selectedReceipt.booking}</WarehouseCode>
              </div>
              <p className="mt-3 text-[15px] font-medium text-[var(--md-ink)]">{selectedReceipt.customer}</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{selectedReceipt.nextAction}</p>
            </div>
            <div className="grid gap-2">
              <Button type="button" className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[13px] font-medium text-white" onClick={markArrived}>
                <Check data-icon="inline-start" className="size-4" strokeWidth={1.25} />
                Mark arrived
              </Button>
              <Button type="button" variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/54 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={pauseForDelivery}>
                <Clock3 data-icon="inline-start" className="size-4" strokeWidth={1.25} />
                Save and wait
              </Button>
            </div>
          </div>
        </GoodsInWizardShell>
      )
    }

    if (activeStep === "receive") {
      return (
        <GoodsInWizardShell eyebrow="Step 4" title="Check expected stock against actual stock" summary="Adjust counts line by line. Nothing needs to be final until the receipt summary is sent.">
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <GoodsInMetric label="Expected" value={<span data-i18n-skip dir="ltr">{expectedLineTotal} units</span>} tone="neutral" />
            <GoodsInMetric label="Actual" value={<span data-i18n-skip dir="ltr">{actualLineTotal} units</span>} tone={expectedLineTotal === actualLineTotal ? "green" : selectedReceipt.tone} />
            <GoodsInMetric label="Last saved" value={formatGoodsInSavedAt(savedAtByReceipt[selectedReceipt.id])} tone={isWaiting ? "amber" : "teal"} />
          </div>
          <GoodsInStockCheckTable
            lines={lines}
            activeLineId={activeLine?.id}
            evidenceLineIds={evidenceLineIds}
            onSelectLine={setActiveLineId}
            onAdjust={adjustLine}
            onMatchExpected={matchExpected}
            onToggleEvidence={toggleEvidence}
          />
        </GoodsInWizardShell>
      )
    }

    if (activeStep === "exceptions" && activeLine) {
      return (
        <GoodsInWizardShell eyebrow="Step 5" title="Handle any damage, shortage, or over-delivery" summary="Pick the problem line, attach evidence, and keep the customer decision tied to the receipt.">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-2">
              {lines.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  aria-pressed={activeLine.id === line.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/54 px-3 py-2 text-start shadow-[var(--md-shadow-line)]",
                    activeLine.id === line.id && "bg-[color-mix(in_srgb,var(--md-accent)_10%,white)] shadow-[var(--md-shadow-green-card-selected)]",
                  )}
                  onClick={() => setActiveLineId(line.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{line.product}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{line.note}</span>
                  </span>
                  <StatusPill tone={getGoodsInLineTone(line)}>{getGoodsInLineStatus(line)}</StatusPill>
                </button>
              ))}
            </div>
            <GoodsInExceptionPanel line={activeLine} hasEvidence={evidenceLineIds.has(activeLine.id)} onToggleEvidence={() => toggleEvidence(activeLine.id)} />
          </div>
        </GoodsInWizardShell>
      )
    }

    return (
      <GoodsInWizardShell eyebrow="Step 6" title="Finish the receipt and move stock on" summary="Send the customer receipt summary, print barcodes, then hand the stock to putaway.">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <GoodsInReceiptSummary
            receipt={selectedReceipt}
            lines={lines}
            sent={receiptSent}
            printed={barcodePrinted}
            onSend={sendReceipt}
            onPrint={printBarcodes}
          />
          <div className="grid gap-3">
            <div className="rounded-[var(--md-radius-lg)] bg-white/52 p-3 shadow-[var(--md-shadow-line)]">
              <Barcode className="size-4 text-[var(--md-accent)]" strokeWidth={1.25} />
              <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">Create barcodes</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Labels use actual arrived quantities, not the original estimate.</p>
            </div>
            <div className="rounded-[var(--md-radius-lg)] bg-white/52 p-3 shadow-[var(--md-shadow-line)]">
              <ScanLine className="size-4 text-[var(--md-blue)]" strokeWidth={1.25} />
              <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">Scan to bin</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Move matched stock to its suggested warehouse location.</p>
            </div>
          </div>
        </div>
      </GoodsInWizardShell>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusPill tone="teal">Goods in pick</StatusPill>
          <WarehouseCode>{selectedReceipt.id}</WarehouseCode>
          <span className="max-w-[320px] truncate text-[13px] font-medium text-[var(--md-ink)]">{selectedReceipt.customer}</span>
          <StatusPill tone={isWaiting ? "amber" : activeStepMeta.tone}>{isWaiting ? "Waiting for delivery" : activeStepMeta.label}</StatusPill>
          <WarehousePickProgress value={progress} tone={isWaiting ? "amber" : activeStepMeta.tone} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" className="size-4" strokeWidth={1.25} />
              Back to board
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={() => saveDraft()}>
            <ClipboardCheck data-icon="inline-start" className="size-4" strokeWidth={1.25} />
            Save draft
          </Button>
        </div>
      </div>

      <GoodsInStepRail activeStep={activeStep} onChange={setActiveStep} />
      {renderActiveStep()}
      <Surface padding="sm" className="rounded-[var(--md-radius-xl)] bg-white/58">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={isWaiting ? "amber" : activeStepMeta.tone}>{isWaiting ? "Waiting for delivery" : activeStepMeta.label}</StatusPill>
            <span className="text-[12px] text-[var(--md-text)]">{formatGoodsInSavedAt(savedAtByReceipt[selectedReceipt.id])}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={goToPreviousStep} disabled={activeStepIndex === 0}>
              <ArrowLeft data-icon="inline-start" className="size-4" strokeWidth={1.25} />
              Back
            </Button>
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={() => saveDraft()}>
              Save draft
            </Button>
            {activeStep === "arrival" && !hasArrived ? (
              <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white" onClick={pauseForDelivery}>
                <Clock3 data-icon="inline-start" className="size-4" strokeWidth={1.25} />
                Save and wait
              </Button>
            ) : (
              <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white" onClick={goToNextStep} disabled={activeStepIndex >= warehouseGoodsInFlowSteps.length - 1}>
                Next
                <ArrowRight data-icon="inline-end" className="size-4" strokeWidth={1.25} />
              </Button>
            )}
          </div>
        </div>
      </Surface>
    </div>
  )
}

function getGoodsOutStepIndex(step: WarehouseGoodsOutStepId) {
  return warehouseGoodsOutFlowSteps.findIndex((item) => item.id === step)
}

function createGoodsOutPickedMap() {
  return warehouseGoodsOutPicks.reduce<Record<string, Record<string, number>>>((pickMap, pick) => {
    pickMap[pick.id] = pick.lines.reduce<Record<string, number>>((lineMap, line) => {
      lineMap[line.id] = line.picked
      return lineMap
    }, {})

    return pickMap
  }, {})
}

function GoodsOutStepRail({
  activeStep,
  onChange,
}: {
  activeStep: WarehouseGoodsOutStepId
  onChange: (step: WarehouseGoodsOutStepId) => void
}) {
  const activeIndex = getGoodsOutStepIndex(activeStep)
  const activeStepMeta = warehouseGoodsOutFlowSteps[activeIndex] ?? warehouseGoodsOutFlowSteps[0]

  return (
    <Surface padding="sm" className="sticky top-[72px] z-10 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-blue)_7%,white)] shadow-[inset_0_0_0_1px_rgba(66,109,219,0.12),0_18px_42px_rgba(66,109,219,0.08)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--md-subtle)]">Step {activeIndex + 1} of {warehouseGoodsOutFlowSteps.length}</p>
          <h2 className="mt-0.5 truncate text-[15px] font-medium text-[var(--md-ink)]">{activeStepMeta.label}</h2>
        </div>
        <StatusPill tone={activeStepMeta.tone}>{activeIndex}/{warehouseGoodsOutFlowSteps.length - 1} complete</StatusPill>
      </div>
      <div className="mt-3 grid gap-1 rounded-full bg-[rgba(66,109,219,0.08)] p-1" style={{ gridTemplateColumns: `repeat(${warehouseGoodsOutFlowSteps.length}, minmax(0, 1fr))` }}>
        {warehouseGoodsOutFlowSteps.map((step, index) => {
          const active = activeStep === step.id
          const complete = index < activeIndex

          return (
            <button
              key={step.id}
              type="button"
              aria-current={active ? "step" : undefined}
              className={cn(
                "h-2.5 rounded-full bg-[rgba(90,103,100,0.14)] transition-[background,box-shadow,transform] hover:bg-[rgba(66,109,219,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(66,109,219,0.28)]",
                (active || complete) && "bg-[var(--md-blue)]",
                active && "scale-y-125 shadow-[0_8px_18px_rgba(66,109,219,0.14)]",
              )}
              onClick={() => onChange(step.id)}
            />
          )
        })}
      </div>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${warehouseGoodsOutFlowSteps.length}, minmax(0, 1fr))` }}>
        {warehouseGoodsOutFlowSteps.map((step) => (
          <button
            key={step.id}
            type="button"
            className={cn(
              "truncate py-0.5 text-center text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(66,109,219,0.22)]",
              activeStep === step.id ? "text-[var(--md-blue)]" : "text-[var(--md-subtle)] hover:text-[var(--md-text)]",
            )}
            onClick={() => onChange(step.id)}
          >
            {step.label}
          </button>
        ))}
      </div>
    </Surface>
  )
}

function GoodsOutPickLineTable({
  pick,
  pickedByLine,
  onAdjust,
  onMatchRequired,
}: {
  pick: WarehouseGoodsOutPick
  pickedByLine: Record<string, number>
  onAdjust: (lineId: string, delta: number) => void
  onMatchRequired: (lineId: string, required: number) => void
}) {
  return (
    <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-white/70 shadow-[var(--md-shadow-line)]">
      <div className="max-h-[min(56vh,560px)] overflow-auto md-scrollbar">
        <Table className="text-[13px]" style={{ minWidth: 980 } as CSSProperties}>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-b border-[rgba(90,103,100,0.12)] hover:bg-transparent">
              <TableHead className={cn(tableHeadClass, "w-[150px]")}>SKU</TableHead>
              <TableHead className={cn(tableHeadClass, "min-w-[240px]")}>Product</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[112px] text-right")}>Required</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[112px] text-right")}>Picked</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[138px]")}>Location</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[132px]")}>Status</TableHead>
              <TableHead className={cn(tableHeadClass, "w-[178px]")}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody className="[&_tr:last-child]:border-0">
            {pick.lines.map((line) => {
              const picked = pickedByLine[line.id] ?? line.picked
              const matched = picked >= line.required

              return (
                <TableRow key={line.id} className="h-[54px] border-b border-[rgba(90,103,100,0.09)] bg-white/68 hover:bg-[rgba(66,109,219,0.045)]">
                  <TableCell className={tableCellClass}><WarehouseCode>{line.sku}</WarehouseCode></TableCell>
                  <TableCell className={tableCellClass}>
                    <span className="grid gap-1">
                      <span className="truncate font-medium text-[var(--md-ink)]">{line.product}</span>
                      <span className="truncate text-[12px] text-[var(--md-subtle)]">{line.note}</span>
                    </span>
                  </TableCell>
                  <TableCell className={cn(tableCellClass, "text-right tabular-nums")}><span data-i18n-skip dir="ltr">{line.required} {line.unit}</span></TableCell>
                  <TableCell className={cn(tableCellClass, "text-right tabular-nums")}><span data-i18n-skip dir="ltr">{picked} {line.unit}</span></TableCell>
                  <TableCell className={tableCellClass}><WarehouseCode>{line.location}</WarehouseCode></TableCell>
                  <TableCell className={tableCellClass}><StatusPill tone={matched ? "green" : line.tone}>{matched ? "Picked" : line.status}</StatusPill></TableCell>
                  <TableCell className={tableCellClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button type="button" variant="ghost" className="h-7 rounded-[var(--md-radius-md)] bg-white/64 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white" onClick={() => onAdjust(line.id, 1)}>
                        +1
                      </Button>
                      <Button type="button" variant="ghost" className="h-7 rounded-[var(--md-radius-md)] bg-white/64 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white" onClick={() => onMatchRequired(line.id, line.required)}>
                        Match
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </tbody>
        </Table>
      </div>
    </div>
  )
}

export function WarehouseGoodsOutFlow({
  initialPickId,
  onBack,
}: {
  initialPickId?: string
  onBack?: () => void
}) {
  const [selectedPickId, setSelectedPickId] = useState<string>(() => {
    const initialPick = warehouseGoodsOutPicks.find((pick) => pick.id === initialPickId)
    return initialPick?.id ?? warehouseGoodsOutPicks[0]?.id ?? ""
  })
  const [activeStep, setActiveStep] = useState<WarehouseGoodsOutStepId>(() => {
    const initialPick = warehouseGoodsOutPicks.find((pick) => pick.id === initialPickId) ?? warehouseGoodsOutPicks[0]
    return initialPick?.stepId ?? warehouseGoodsOutFlowSteps[0].id
  })
  const [pickedByPick, setPickedByPick] = useState<Record<string, Record<string, number>>>(() => createGoodsOutPickedMap())
  const [savedAt, setSavedAt] = useState("Saved just now")

  const selectedPick = warehouseGoodsOutPicks.find((pick) => pick.id === selectedPickId) ?? warehouseGoodsOutPicks[0]
  const pickedByLine = pickedByPick[selectedPick.id] ?? {}
  const stepMeta = warehouseGoodsOutFlowSteps.find((step) => step.id === activeStep) ?? warehouseGoodsOutFlowSteps[0]
  const activeStepIndex = getGoodsOutStepIndex(activeStep)
  const progress = Math.round(((activeStepIndex + (activeStep === "dispatch" ? 1 : 0)) / warehouseGoodsOutFlowSteps.length) * 100)
  const requiredTotal = selectedPick.lines.reduce((total, line) => total + line.required, 0)
  const pickedTotal = selectedPick.lines.reduce((total, line) => total + (pickedByLine[line.id] ?? line.picked), 0)

  useEffect(() => {
    const initialPick = warehouseGoodsOutPicks.find((pick) => pick.id === initialPickId)
    if (!initialPick) return
    setSelectedPickId(initialPick.id)
    setActiveStep(initialPick.stepId)
    setSavedAt(initialPick.savedAt)
  }, [initialPickId])

  function savePick(label = "Saved just now") {
    setSavedAt(label)
  }

  function adjustPicked(lineId: string, delta: number) {
    setPickedByPick((current) => {
      const currentPick = current[selectedPick.id] ?? {}
      const currentValue = currentPick[lineId] ?? selectedPick.lines.find((line) => line.id === lineId)?.picked ?? 0

      return {
        ...current,
        [selectedPick.id]: {
          ...currentPick,
          [lineId]: Math.max(0, currentValue + delta),
        },
      }
    })
    savePick()
  }

  function matchRequired(lineId: string, required: number) {
    setPickedByPick((current) => ({
      ...current,
      [selectedPick.id]: {
        ...(current[selectedPick.id] ?? {}),
        [lineId]: required,
      },
    }))
    savePick()
  }

  function goToNextStep() {
    const nextStep = warehouseGoodsOutFlowSteps[Math.min(activeStepIndex + 1, warehouseGoodsOutFlowSteps.length - 1)]?.id
    if (!nextStep) return
    setActiveStep(nextStep)
    savePick()
  }

  function goToPreviousStep() {
    const previousStep = warehouseGoodsOutFlowSteps[Math.max(activeStepIndex - 1, 0)]?.id
    if (!previousStep) return
    setActiveStep(previousStep)
  }

  function renderStep() {
    if (activeStep === "pick") {
      return (
        <GoodsInWizardShell eyebrow="Goods out" title="Pick stock against the order" summary="Use the table for long pick waves; it stays stable even when there are many SKUs.">
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <GoodsInMetric label="Required" value={<span data-i18n-skip dir="ltr">{requiredTotal} units</span>} tone="neutral" />
            <GoodsInMetric label="Picked" value={<span data-i18n-skip dir="ltr">{pickedTotal} units</span>} tone={pickedTotal >= requiredTotal ? "green" : selectedPick.tone} />
            <GoodsInMetric label="Window" value={selectedPick.window} tone={selectedPick.tone} />
          </div>
          <GoodsOutPickLineTable pick={selectedPick} pickedByLine={pickedByLine} onAdjust={adjustPicked} onMatchRequired={matchRequired} />
        </GoodsInWizardShell>
      )
    }

    if (activeStep === "stage") {
      return (
        <GoodsInWizardShell eyebrow="Goods out" title="Stage the picked stock" summary="Confirm the dispatch door, temperature zone, or preload lane before closing the pick.">
          <div className="grid gap-3 md:grid-cols-3">
            <GoodsInMetric label="Customer" value={selectedPick.customer} tone="blue" />
            <GoodsInMetric label="Window" value={selectedPick.window} tone={selectedPick.tone} />
            <GoodsInMetric label="Owner" value={<span data-i18n-skip dir="ltr">{selectedPick.owner}</span>} tone="teal" />
          </div>
          <div className="mt-3 rounded-[var(--md-radius-lg)] bg-white/54 p-3 shadow-[var(--md-shadow-line)]">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{selectedPick.nextStep}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Keep this open if the order is staged but the trailer, courier, or driver handoff is not ready yet.</p>
          </div>
        </GoodsInWizardShell>
      )
    }

    if (activeStep === "dispatch") {
      return (
        <GoodsInWizardShell eyebrow="Goods out" title="Dispatch and close the pick" summary="Close the pick once loading, seal, and customer dispatch evidence are complete.">
          <div className="grid gap-3 md:grid-cols-3">
            <GoodsInMetric label="Order" value={<WarehouseCode>{selectedPick.orderRef}</WarehouseCode>} tone="blue" />
            <GoodsInMetric label="Progress" value={<span data-i18n-skip dir="ltr">{selectedPick.progress}%</span>} tone={selectedPick.tone} />
            <GoodsInMetric label="Saved" value={savedAt} tone="teal" />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Button type="button" className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-blue)] px-4 text-[13px] font-medium text-white" onClick={() => savePick("Dispatch paperwork saved")}>
              <ClipboardCheck data-icon="inline-start" className="size-4" strokeWidth={1.25} />
              Save dispatch evidence
            </Button>
            <Button type="button" variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/54 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={() => savePick("Pick closed")}>
              <Check data-icon="inline-start" className="size-4" strokeWidth={1.25} />
              Close pick
            </Button>
          </div>
        </GoodsInWizardShell>
      )
    }

    return (
      <GoodsInWizardShell eyebrow="Goods out" title="Check the outbound order setup" summary="Confirm customer, order reference, labels, and carrier window before the team starts picking.">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            Customer
            <Input defaultValue={selectedPick.customer} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
          </label>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            Order reference
            <Input defaultValue={selectedPick.orderRef} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
          </label>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            Dispatch window
            <Input defaultValue={selectedPick.window} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
          </label>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            Pick owner
            <Input defaultValue={selectedPick.owner} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-[13px] shadow-[var(--md-shadow-line)]" />
          </label>
        </div>
      </GoodsInWizardShell>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusPill tone="blue">Goods out pick</StatusPill>
          <WarehouseCode>{selectedPick.id}</WarehouseCode>
          <span className="max-w-[320px] truncate text-[13px] font-medium text-[var(--md-ink)]">{selectedPick.customer}</span>
          <StatusPill tone={stepMeta.tone}>{stepMeta.label}</StatusPill>
          <WarehousePickProgress value={progress} tone={stepMeta.tone} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" className="size-4" strokeWidth={1.25} />
              Back to board
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={() => savePick()}>
            <ClipboardCheck data-icon="inline-start" className="size-4" strokeWidth={1.25} />
            Save draft
          </Button>
        </div>
      </div>
      <GoodsOutStepRail activeStep={activeStep} onChange={setActiveStep} />
      {renderStep()}
      <Surface padding="sm" className="rounded-[var(--md-radius-xl)] bg-white/58">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={stepMeta.tone}>{stepMeta.label}</StatusPill>
            <span className="text-[12px] text-[var(--md-text)]">{savedAt}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={goToPreviousStep} disabled={activeStepIndex === 0}>
              <ArrowLeft data-icon="inline-start" className="size-4" strokeWidth={1.25} />
              Back
            </Button>
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/54 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={() => savePick()}>
              Save draft
            </Button>
            <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-blue)] px-3 text-[13px] font-medium text-white" onClick={goToNextStep} disabled={activeStepIndex >= warehouseGoodsOutFlowSteps.length - 1}>
              Next
              <ArrowRight data-icon="inline-end" className="size-4" strokeWidth={1.25} />
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  )
}

export function WarehouseGoodsView({
  onNewPick,
  onResumeGoodsInPick,
  onResumeGoodsOutPick,
}: {
  onNewPick?: () => void
  onResumeGoodsInPick?: (pickId: string) => void
  onResumeGoodsOutPick?: (pickId: string) => void
}) {
  const goodsBoardTabs = ["Goods in", "Goods out"] as const
  const [activeGoodsBoard, setActiveGoodsBoard] = useState<(typeof goodsBoardTabs)[number]>("Goods in")
  const goodsInCardCount = countKanbanCards(warehouseGoodsInKanbanColumns)
  const goodsOutCardCount = countKanbanCards(warehouseGoodsOutKanbanColumns)
  const isGoodsIn = activeGoodsBoard === "Goods in"
  const goodsInRows = useMemo(() => getGoodsInResumeRows(), [])
  const goodsOutRows = useMemo(() => getGoodsOutResumeRows(), [])

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseToolbar title="Goods in and goods out" meta="Inbound and outbound work runs as clean Kanban boards. Use New pick when you need the guided goods-in wizard.">
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
              action={onNewPick ? (
                <Button
                  type="button"
                  className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                  onClick={onNewPick}
                >
                  <Plus data-icon="inline-start" className="size-4" strokeWidth={1.25} />
                  New pick
                </Button>
              ) : null}
            />
            <SortableWarehouseKanbanBoard
              key="goods-in-board"
              ariaLabel="Goods in Kanban board"
              boardId="goods-in"
              columnsSource={warehouseGoodsInKanbanColumns}
              gridClassName="xl:grid-cols-4"
            />
            <WarehousePickResumeTable
              title="Open goods-in picks"
              meta="Click a row to resume the intake flow from the step the warehouse team last reached."
              rows={goodsInRows}
              onOpenPick={(row) => onResumeGoodsInPick?.(row.id)}
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
              columnsSource={warehouseGoodsOutKanbanColumns}
              gridClassName="xl:grid-cols-4"
            />
            <WarehousePickResumeTable
              title="Open goods-out picks"
              meta="Click a row to resume picking, staging, or dispatch without losing the board view."
              rows={goodsOutRows}
              onOpenPick={(row) => onResumeGoodsOutPick?.(row.id)}
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
  action,
}: {
  title: string
  meta: string
  count: string
  icon: ReactNode
  tone: StatusTone
  action?: ReactNode
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusPill tone={tone}>{count}</StatusPill>
          {action}
        </div>
      </div>
    </Surface>
  )
}

function moveCardToColumn(
  currentColumns: SortableWarehouseKanbanColumn[],
  activeId: string,
  overId: string,
) {
  const activeColumnId = findCardColumnId(currentColumns, activeId)
  const overIsColumn = currentColumns.some((column) => column.id === overId)
  const overColumnId = overIsColumn ? overId : findCardColumnId(currentColumns, overId)

  if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) return currentColumns

  const activeColumnIndex = findColumnIndex(currentColumns, activeColumnId)
  const overColumnIndex = findColumnIndex(currentColumns, overColumnId)
  const activeCardIndex = currentColumns[activeColumnIndex]?.cards.findIndex((card) => card.id === activeId) ?? -1

  if (activeColumnIndex < 0 || overColumnIndex < 0 || activeCardIndex < 0) return currentColumns

  const nextColumns = currentColumns.map((column) => ({ ...column, cards: [...column.cards] }))
  const [movingCard] = nextColumns[activeColumnIndex].cards.splice(activeCardIndex, 1)
  const overCardIndex = overIsColumn ? nextColumns[overColumnIndex].cards.length : nextColumns[overColumnIndex].cards.findIndex((card) => card.id === overId)
  const insertIndex = overCardIndex >= 0 ? overCardIndex : nextColumns[overColumnIndex].cards.length

  nextColumns[overColumnIndex].cards.splice(insertIndex, 0, movingCard)
  return nextColumns
}

function reorderCardInsideColumn(
  currentColumns: SortableWarehouseKanbanColumn[],
  activeId: string,
  overId: string,
) {
  if (activeId === overId || currentColumns.some((column) => column.id === overId)) return currentColumns

  const activeColumnId = findCardColumnId(currentColumns, activeId)
  const overColumnId = findCardColumnId(currentColumns, overId)

  if (!activeColumnId || activeColumnId !== overColumnId) return currentColumns

  const columnIndex = findColumnIndex(currentColumns, activeColumnId)
  const activeCardIndex = currentColumns[columnIndex].cards.findIndex((card) => card.id === activeId)
  const overCardIndex = currentColumns[columnIndex].cards.findIndex((card) => card.id === overId)

  if (activeCardIndex < 0 || overCardIndex < 0 || activeCardIndex === overCardIndex) return currentColumns

  return currentColumns.map((column, index) => (
    index === columnIndex ? { ...column, cards: arrayMove(column.cards, activeCardIndex, overCardIndex) } : column
  ))
}

function SortableWarehouseKanbanBoard({
  ariaLabel,
  boardId,
  columnsSource,
  gridClassName,
}: {
  ariaLabel: string
  boardId: string
  columnsSource: readonly WarehouseKanbanColumnSource[]
  gridClassName: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const [columns, setColumns] = useState(() => createKanbanColumns(columnsSource, boardId))
  const [activeCard, setActiveCard] = useState<WarehouseKanbanCardData | null>(null)
  const [pickup, setPickup] = useState<WarehouseKanbanPickup>(defaultKanbanPickup)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const columnIds = useMemo(() => columns.map((column) => column.id), [columns])

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id)
    setActiveCard(findCard(columns, activeId))
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null
    if (!overId) return

    const activeId = String(event.active.id)
    setColumns((currentColumns) => reorderCardInsideColumn(moveCardToColumn(currentColumns, activeId, overId), activeId, overId))
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null

    if (overId && activeId !== overId) {
      setColumns((currentColumns) => {
        const activeColumnId = findCardColumnId(currentColumns, activeId)
        const overColumnId = currentColumns.some((column) => column.id === overId) ? overId : findCardColumnId(currentColumns, overId)

        if (!activeColumnId || !overColumnId || activeColumnId !== overColumnId || activeColumnId === overId) return currentColumns

        const columnIndex = findColumnIndex(currentColumns, activeColumnId)
        const activeCardIndex = currentColumns[columnIndex].cards.findIndex((card) => card.id === activeId)
        const overCardIndex = currentColumns[columnIndex].cards.findIndex((card) => card.id === overId)

        if (activeCardIndex < 0 || overCardIndex < 0 || activeCardIndex === overCardIndex) return currentColumns

        return currentColumns.map((column, index) => (
          index === columnIndex ? { ...column, cards: arrayMove(column.cards, activeCardIndex, overCardIndex) } : column
        ))
      })
    }

    setActiveCard(null)
    setPickup(defaultKanbanPickup)
  }

  function handleDragCancel() {
    setActiveCard(null)
    setPickup(defaultKanbanPickup)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={cn("grid gap-3", gridClassName)} aria-label={ariaLabel}>
        <SortableContext items={columnIds}>
          {columns.map((column) => (
            <SortableWarehouseKanbanLane
              key={column.id}
              column={column}
              activeCardId={activeCard?.id ?? null}
              onPickup={setPickup}
              shouldReduceMotion={Boolean(shouldReduceMotion)}
            />
          ))}
        </SortableContext>
      </div>
      <DragOverlay dropAnimation={{ duration: shouldReduceMotion ? 0 : 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeCard ? (
          <WarehouseKanbanDragPreview card={activeCard} pickup={pickup} shouldReduceMotion={Boolean(shouldReduceMotion)} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function SortableWarehouseKanbanLane({
  column,
  activeCardId,
  onPickup,
  shouldReduceMotion,
}: {
  column: SortableWarehouseKanbanColumn
  activeCardId: string | null
  onPickup: (pickup: WarehouseKanbanPickup) => void
  shouldReduceMotion: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const cardIds = useMemo(() => column.cards.map((card) => card.id), [column.cards])

  return (
    <Surface key={column.id} padding="sm" className="rounded-[var(--md-radius-xl)]">
      <div
        ref={setNodeRef}
        className={cn(
          "flex h-full min-h-[230px] flex-col rounded-[var(--md-radius-lg)] p-1 transition-[background,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isOver && "bg-white/38 shadow-[inset_0_0_0_1px_rgba(14,125,116,0.12)]",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-1 py-1">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{column.title}</h2>
            {column.meta ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--md-text)]">{column.meta}</p> : null}
          </div>
          <span className="rounded-full bg-white/62 px-2 py-0.5 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{column.cards.length}</span>
        </div>
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <motion.div
            className="mt-3 grid flex-1 content-start gap-2"
            variants={shouldReduceMotion ? undefined : tableBodyReveal}
            initial={shouldReduceMotion ? undefined : "hidden"}
            animate={shouldReduceMotion ? undefined : "show"}
          >
            {column.cards.map((card) => (
              <SortableWarehouseKanbanCard
                key={card.id}
                card={card}
                isActive={activeCardId === card.id}
                onPickup={onPickup}
                shouldReduceMotion={shouldReduceMotion}
              />
            ))}
            {column.cards.length ? null : (
              <div className="grid min-h-[104px] place-items-center rounded-[var(--md-radius-lg)] bg-white/36 px-3 py-6 text-center shadow-[var(--md-shadow-line)]">
                <p className="text-[12px] font-medium text-[var(--md-text)]">Drop work here</p>
              </div>
            )}
          </motion.div>
        </SortableContext>
      </div>
    </Surface>
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

function SortableWarehouseKanbanCard({
  card,
  isActive,
  onPickup,
  shouldReduceMotion,
}: {
  card: WarehouseKanbanCardData
  isActive: boolean
  onPickup: (pickup: WarehouseKanbanPickup) => void
  shouldReduceMotion: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  return (
    <motion.button
      ref={setNodeRef}
      type="button"
      variants={shouldReduceMotion ? undefined : rowReveal}
      aria-label={`${card.id} ${card.title}`}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative min-h-[116px] !cursor-grab touch-none overflow-hidden rounded-[var(--md-radius-lg)] p-3 text-left shadow-[var(--md-shadow-line)] outline-none",
        "transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:!cursor-grabbing",
        "focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        (isDragging || isActive) && "opacity-30",
        kanbanCardToneClass[card.tone],
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        "--warehouse-card-accent": toneToVar(card.tone),
      } as CSSProperties}
      onPointerDownCapture={(event) => onPickup(getKanbanPickup(event))}
      whileHover={shouldReduceMotion || isDragging ? undefined : { y: -1, scale: 1.01 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
      transition={mdMotion.spring}
    >
      <WarehouseKanbanCardBody card={card} />
    </motion.button>
  )
}

function WarehouseKanbanDragPreview({
  card,
  pickup,
  shouldReduceMotion,
}: {
  card: WarehouseKanbanCardData
  pickup: WarehouseKanbanPickup
  shouldReduceMotion: boolean
}) {
  return (
    <motion.div
      data-testid="warehouse-kanban-drag-preview"
      className={cn(
        "group relative min-h-[116px] w-[min(260px,72vw)] overflow-hidden rounded-[var(--md-radius-lg)] p-3 text-left shadow-[var(--md-shadow-line)]",
        kanbanCardToneClass[card.tone],
      )}
      style={{ transformOrigin: pickup.transformOrigin, "--warehouse-card-accent": toneToVar(card.tone), boxShadow: kanbanLiftShadow } as CSSProperties}
      initial={false}
      animate={shouldReduceMotion ? { scale: 1 } : { scale: 1.035, rotate: pickup.rotate }}
      transition={mdMotion.spring}
    >
      <WarehouseKanbanCardBody card={card} />
    </motion.div>
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
  customers: (typeof warehouseCalendarCustomers)[number][]
  selectedCustomerIds: readonly WarehouseCalendarCustomerId[]
  onSelectCustomer: (customerId: WarehouseCalendarCustomerId) => void
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
  customer: (typeof warehouseCalendarCustomers)[number]
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
        <WarehouseCalendarDetailRow label="Reference" value={event.id.toUpperCase()} skipTranslation />
      </div>
    </PopoverContent>
  )
}

function WarehouseCalendarEventCard({
  event,
  compact,
}: {
  event: WarehouseCalendarEvent
  compact: boolean
}) {
  const customer = getWarehouseCalendarCustomer(event.customerId)
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
}: {
  positionedEvent: PositionedWarehouseCalendarEvent
}) {
  const { event, top, height, column, columnCount } = positionedEvent
  const customer = getWarehouseCalendarCustomer(event.customerId)
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

function WarehouseCalendarTimedDayColumn({ day }: { day: WarehouseCalendarDay }) {
  const positionedEvents = useMemo(() => getCalendarEventLayout(day.events), [day.events])
  const isToday = day.dateKey === warehouseCalendarCurrentDate

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
        <WarehouseCalendarTimedEvent key={positionedEvent.event.id} positionedEvent={positionedEvent} />
      ))}
    </div>
  )
}

function WarehouseCalendarWeekGrid({ days }: { days: WarehouseCalendarDay[] }) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="overflow-x-auto md-scrollbar">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] bg-[color-mix(in_srgb,var(--md-surface)_84%,transparent)] shadow-[inset_0_-1px_0_rgba(90,103,100,0.12)]">
            <div className="flex min-h-[92px] items-end px-3 py-4 text-[11px] font-medium text-[var(--md-text)]">
              <span data-i18n-skip dir="ltr">GMT+01</span>
            </div>
            {days.map((day) => {
              const isToday = day.dateKey === warehouseCalendarCurrentDate

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
              <WarehouseCalendarTimedDayColumn key={day.dateKey} day={day} />
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
}: {
  day: WarehouseCalendarDay
  view: WarehouseCalendarViewMode
}) {
  const { t } = useLanguage()
  const isMonthView = view === "Month"
  const isToday = day.dateKey === warehouseCalendarCurrentDate

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
          <WarehouseCalendarEventCard key={event.id} event={event} compact={isMonthView} />
        ))}
        {!day.events.length && !isMonthView ? <p className="px-1 py-4 text-[12px] leading-5 text-[var(--md-subtle)]">{t("No planned warehouse work")}</p> : null}
      </div>
    </Surface>
  )
}

export function WarehouseCalendarView() {
  const { language, t } = useLanguage()
  const [calendarView, setCalendarView] = useState<WarehouseCalendarViewMode>("Week")
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<WarehouseCalendarCustomerId[]>([])
  const eventsByDate = useMemo(() => getCalendarEventsByDate(), [])
  const allCalendarDays = useMemo(() => buildCalendarDays(calendarView, language, eventsByDate), [calendarView, eventsByDate, language])
  const calendarDays = useMemo(() => (
    selectedCustomerIds.length
      ? allCalendarDays.map((day) => ({ ...day, events: day.events.filter((event) => selectedCustomerIds.includes(event.customerId)) }))
      : allCalendarDays
  ), [allCalendarDays, selectedCustomerIds])
  const visibleCustomerIds = useMemo(() => new Set(allCalendarDays.flatMap((day) => day.events.map((event) => event.customerId))), [allCalendarDays])
  const visibleCustomers = warehouseCalendarCustomers.filter((customer) => visibleCustomerIds.has(customer.id))
  const eventCount = calendarDays.reduce((total, day) => total + day.events.length, 0)
  const periodLabel = formatCalendarPeriodLabel(calendarView, language)

  function handleSelectCustomer(customerId: WarehouseCalendarCustomerId) {
    setSelectedCustomerIds((currentCustomerIds) => (
      currentCustomerIds.includes(customerId)
        ? currentCustomerIds.filter((currentCustomerId) => currentCustomerId !== customerId)
        : [...currentCustomerIds, customerId]
    ))
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <WarehouseToolbar title={t("Calendar")} meta={t("Dock bookings, count windows, dispatch cutoffs and stock-take planning.")}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-surface)_72%,transparent)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <CalendarDays data-icon="inline-start" className="size-4 text-[var(--md-accent)]" strokeWidth={1.25} />
            <span>{calendarView === "Week" ? `${t("Week of")} ${periodLabel}` : periodLabel}</span>
          </div>
          <StatusPill tone="teal">
            {eventCount} {t(eventCount === 1 ? "Event" : "Events")}
          </StatusPill>
          <SegmentedControl options={warehouseCalendarViewModes} value={calendarView} onChange={setCalendarView} />
        </div>
      </WarehouseToolbar>
      <WarehouseCalendarCustomerKey customers={visibleCustomers} selectedCustomerIds={selectedCustomerIds} onSelectCustomer={handleSelectCustomer} />
      {calendarView === "Week" ? (
        <WarehouseCalendarWeekGrid days={calendarDays} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {calendarDays.map((day) => (
            <WarehouseCalendarDayCell key={day.dateKey} day={day} view={calendarView} />
          ))}
        </div>
      )}
    </div>
  )
}

export function WarehouseStockView({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
}) {
  const [customerFilter, setCustomerFilter] = useState(allWarehouseCustomers)
  const [productFilter, setProductFilter] = useState(allWarehouseProducts)
  const [batchFilter, setBatchFilter] = useState(allWarehouseBatches)
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null)
  const customerOptions = useMemo(
    () => makeWarehouseFilterOptions(warehouseStockRows.map((row) => row.customer), allWarehouseCustomers),
    [],
  )
  const productOptions = useMemo(
    () => makeWarehouseFilterOptions(warehouseStockRows.map((row) => row.product), allWarehouseProducts),
    [],
  )
  const batchOptions = useMemo(
    () => makeWarehouseFilterOptions(warehouseStockRows.flatMap((row) => row.branchLocations.map((location) => location.lot)), allWarehouseBatches),
    [],
  )
  const filter = activeFilter.split(" · ")[0]
  const statusRows =
    filter === "All stock" ? warehouseStockRows :
    filter === "Low stock" ? warehouseStockRows.filter((row) => row.status === "Low stock") :
    filter === "Allocated" ? warehouseStockRows.filter((row) => row.allocated > 0) :
    warehouseStockRows.filter((row) => row.status === "Quarantine")
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
