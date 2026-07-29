import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, CornerDownLeft, Eye, GripVertical, LayoutDashboard, Maximize2, RefreshCcw, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Surface } from "./surface"
import { StatusPill } from "./status-pill"
import {
  createReportBlockFromWidget,
  applyReportBlockDataSelection,
  ReportBlockDataEditorDialog,
  ReportBlockView,
  reportDataBreakdowns,
  reportDataMetrics,
  reportDataPeriods,
  reportDataSources,
  reportDataSummary,
  reportWidgets,
  ReportWidgetPalette,
  type ReportBlock,
  type ReportBlockDataSelection,
  type ReportWidget,
} from "./report-components"

const suggestionPrompts = [
  { label: "Exception view", prompt: "Show exception risk by lane for the next 7 days" },
  { label: "Security team", prompt: "Show sprint overview for security team for last 1 month" },
  { label: "Customer health", prompt: "Show customers with open documents and late ETAs" },
  { label: "Customs focus", prompt: "Build a customs clearance dashboard for today" },
]

const progressSteps = ["LLM queries", "Fetching freight data", "Processing results", "Building layout", "Rendering widgets"]
const dashboardWidgets = reportWidgets

export type DashboardCustomiseMode = "ai" | "manual"
export type DashboardModuleId = "world-clock" | "your-jobs" | "metrics" | "morning-digest" | "activity" | "customs-queue" | "live-bookings"
type DashboardTileSize = "small" | "medium" | "wide" | "large"
type DashboardTilePreset = { columns: number; rows: number }
type DashboardTilePresets = Record<DashboardTileSize, DashboardTilePreset>
type ManualDashboardItem =
  | {
      id: string
      kind: "module"
      moduleId: DashboardModuleId
      title: string
      size: DashboardTileSize
    }
  | {
      id: string
      kind: "report"
      title: string
      block: ReportBlock
      size: DashboardTileSize
    }

type DashboardLayoutDragState = {
  itemId: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  left: number
  top: number
  width: number
  height: number
  size: DashboardTileSize
  columns: number
  rows: number
  moved: boolean
}

type DashboardLayoutDropPreview = {
  index: number
}

type DashboardResizeState = {
  itemId: string
  pointerId: number
  startX: number
  startY: number
  startColumns: number
  startRows: number
  presets: DashboardTilePresets
  allowedSizes: readonly DashboardTileSize[]
  columnWidth: number
  rowHeight: number
}

type IncomingWidgetPreview = {
  widgetId: string
  index: number
  size: DashboardTileSize
  columns: number
  rows: number
}

const dashboardTileSizes: readonly DashboardTileSize[] = ["small", "medium", "wide", "large"]
const dashboardTileSizeLabels: Record<DashboardTileSize, string> = {
  small: "Small",
  medium: "Medium",
  wide: "Wide",
  large: "Large",
}
const dashboardStandardTilePresets: DashboardTilePresets = {
  small: { columns: 3, rows: 2 },
  medium: { columns: 6, rows: 4 },
  wide: { columns: 12, rows: 2 },
  large: { columns: 12, rows: 4 },
}
const dashboardFallbackPresets = dashboardStandardTilePresets

const dashboardBentoRowHeight = 72
const dashboardBentoGap = 12
const dashboardDragActivationDistance = 4
const dashboardDragAutoScrollEdge = 84
const dashboardDragAutoScrollMaxStep = 18
/*
 * Widget presets use one shared geometry so the editor feels predictable:
 * small is one quarter of medium, large is two mediums side by side, and wide
 * keeps the large width at half medium height.
 */
const dashboardModuleDefinitions: Array<{ id: DashboardModuleId; title: string; defaultSize: DashboardTileSize; sizes: DashboardTilePresets }> = [
  { id: "world-clock", title: "World clock", defaultSize: "medium", sizes: dashboardStandardTilePresets },
  { id: "your-jobs", title: "Your jobs", defaultSize: "medium", sizes: dashboardStandardTilePresets },
  { id: "metrics", title: "Metrics", defaultSize: "medium", sizes: dashboardStandardTilePresets },
  { id: "morning-digest", title: "Morning digest", defaultSize: "medium", sizes: dashboardStandardTilePresets },
  { id: "activity", title: "Activity", defaultSize: "medium", sizes: dashboardStandardTilePresets },
  { id: "customs-queue", title: "Customs queue", defaultSize: "medium", sizes: dashboardStandardTilePresets },
  { id: "live-bookings", title: "Live bookings", defaultSize: "medium", sizes: dashboardStandardTilePresets },
]

const dashboardDefaultDataSelection: ReportBlockDataSelection = {
  source: "bookings",
  metric: "on-time",
  breakdown: "month",
  period: "30-days",
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function dataLabel(options: readonly { id: string; label: string }[], id: string) {
  return options.find((option) => option.id === id)?.label ?? id
}

function isWideReportContent(type: ReportBlock["type"], visualization?: ReportBlock["visualization"]) {
  return type === "table" || type === "exception-log" || type === "spend" || visualization === "heatmap" || visualization === "scatter" || visualization === "mixed"
}

function getReportTilePresets(_type: ReportBlock["type"], _visualization?: ReportBlock["visualization"]): DashboardTilePresets {
  return dashboardStandardTilePresets
}

function getReportDefaultTileSize(type: ReportBlock["type"], visualization?: ReportBlock["visualization"]): DashboardTileSize {
  if (type === "chart") return isWideReportContent(type, visualization) ? "large" : "medium"
  return isWideReportContent(type, visualization) ? "large" : "small"
}

function getDashboardModuleDefinition(moduleId: DashboardModuleId) {
  return dashboardModuleDefinitions.find((definition) => definition.id === moduleId)
}

function getDashboardItemPresets(item: ManualDashboardItem): DashboardTilePresets {
  if (item.kind === "module") return getDashboardModuleDefinition(item.moduleId)?.sizes ?? dashboardFallbackPresets
  return getReportTilePresets(item.block.type, item.block.visualization)
}

function getDashboardItemPreset(item: ManualDashboardItem): DashboardTilePreset {
  return getDashboardItemPresets(item)[getDashboardItemSize(item)]
}

function getDashboardItemAllowedSizes(item: ManualDashboardItem): readonly DashboardTileSize[] {
  if (item.kind === "report" && item.block.type === "chart") return ["medium", "wide", "large"]
  return dashboardTileSizes
}

function getDashboardItemSize(item: ManualDashboardItem): DashboardTileSize {
  const allowedSizes = getDashboardItemAllowedSizes(item)
  return allowedSizes.includes(item.size) ? item.size : allowedSizes[0]
}

function getSnappedTileSize(presets: DashboardTilePresets, targetColumns: number, targetRows: number, allowedSizes: readonly DashboardTileSize[] = dashboardTileSizes): DashboardTileSize {
  let bestSize = allowedSizes[0] ?? "medium"
  let bestScore = Number.POSITIVE_INFINITY

  for (const size of allowedSizes) {
    const preset = presets[size]
    const score = (preset.columns - targetColumns) ** 2 + ((preset.rows - targetRows) * 1.6) ** 2
    if (score < bestScore) {
      bestScore = score
      bestSize = size
    }
  }

  return bestSize
}

function createDashboardItemFromWidget(widget: ReportWidget, index: number): Extract<ManualDashboardItem, { kind: "report" }> {
  const block = applyReportBlockDataSelection(createReportBlockFromWidget(widget, index), dashboardDefaultDataSelection)
  return {
    id: block.id,
    kind: "report",
    title: widget.title,
    block,
    size: getReportDefaultTileSize(block.type, block.visualization),
  }
}

function createInitialManualBlocks(): ManualDashboardItem[] {
  return dashboardModuleDefinitions.map((module) => ({
    id: `dashboard-module-${module.id}`,
    kind: "module",
    moduleId: module.id,
    title: module.title,
    size: module.defaultSize,
  }))
}

function getManualDashboardItemTitle(item: ManualDashboardItem) {
  return item.kind === "report" ? item.block.title : item.title
}

function scrollDashboardItemIntoView(itemId: string) {
  window.setTimeout(() => {
    const itemElement = Array.from(document.querySelectorAll<HTMLElement>("[data-md-dashboard-layout-item]")).find((element) => element.dataset.mdDashboardLayoutItem === itemId)
    itemElement?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, 80)
}

function getDashboardDropPreviewFromPoint(clientX: number, clientY: number, draggedItemId?: string): DashboardLayoutDropPreview | null {
  const layoutElement = document.querySelector<HTMLElement>("[data-md-dashboard-layout]")
  if (!layoutElement) return null

  const layoutRect = layoutElement.getBoundingClientRect()
  const itemElements = Array.from(layoutElement.querySelectorAll<HTMLElement>("[data-md-dashboard-layout-item]"))
    .filter((element) => element.dataset.mdDashboardLayoutItem !== draggedItemId)
    .map((element) => ({ rect: element.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)

  if (!itemElements.length) return { index: 0 }
  if (clientY < layoutRect.top) return { index: 0 }
  if (clientY > layoutRect.bottom) return { index: itemElements.length }

  const index = itemElements.findIndex(({ rect }) => {
    const sameRow = clientY >= rect.top && clientY <= rect.bottom
    if (sameRow) return clientX < rect.left + rect.width / 2
    return clientY < rect.top + rect.height / 2
  })

  return { index: index === -1 ? itemElements.length : index }
}

function autoScrollDashboardDrag(clientY: number) {
  if (typeof window === "undefined") return

  if (clientY < dashboardDragAutoScrollEdge) {
    const strength = (dashboardDragAutoScrollEdge - clientY) / dashboardDragAutoScrollEdge
    window.scrollBy({ top: -Math.ceil(strength * dashboardDragAutoScrollMaxStep), behavior: "auto" })
    return
  }

  const lowerEdge = window.innerHeight - dashboardDragAutoScrollEdge
  if (clientY > lowerEdge) {
    const strength = (clientY - lowerEdge) / dashboardDragAutoScrollEdge
    window.scrollBy({ top: Math.ceil(strength * dashboardDragAutoScrollMaxStep), behavior: "auto" })
  }
}

function DashboardTilePlaceholder({ columns, rows }: { columns?: number; rows?: number }) {
  const tileColumns = columns ?? dashboardFallbackPresets.medium.columns
  const tileRows = rows ?? dashboardFallbackPresets.medium.rows

  return (
    <motion.div
      layout
      aria-hidden="true"
      data-md-dashboard-placeholder
      className="relative z-10 grid place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a08)] shadow-[inset_0_0_0_1px_var(--md-accent-a22),0_8px_18px_var(--md-accent-a06)]"
      style={{ gridColumn: `span ${tileColumns}`, gridRow: `span ${tileRows}` }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="h-1 w-12 rounded-full bg-[var(--md-accent-a38)]" />
    </motion.div>
  )
}

function DashboardBentoGridOverlay() {
  return (
    <div
      aria-hidden="true"
      data-md-dashboard-bento-overlay
      className="pointer-events-none absolute inset-0 z-0 grid grid-cols-12 gap-[var(--md-page-stack-gap-compact)] overflow-hidden rounded-[var(--md-radius-2xl)]"
      style={{ gridAutoRows: dashboardBentoRowHeight }}
    >
      {Array.from({ length: 120 }).map((_, index) => (
        <span key={index} className="rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a035)] shadow-[inset_0_0_0_1px_var(--md-accent-a08)]" />
      ))}
    </div>
  )
}

function DashboardTileDrilldown({ block, floating = false }: { block: ReportBlock; floating?: boolean }) {
  const selection = { ...dashboardDefaultDataSelection, ...block.dataSelection }
  const details = [
    ["Source", dataLabel(reportDataSources, selection.source)],
    ["Metric", dataLabel(reportDataMetrics, selection.metric)],
    ["Period", dataLabel(reportDataPeriods, selection.period)],
    ["Breakdown", dataLabel(reportDataBreakdowns, selection.breakdown)],
  ]

  return (
    <motion.div
      layout
      data-md-dashboard-drilldown
      className={cn(
        "rounded-[var(--md-radius-md)] bg-[rgba(243,248,247,0.92)] p-3 shadow-[var(--md-shadow-line)]",
        floating ? "absolute bottom-3 left-3 right-3 z-30 max-h-[calc(100%-64px)] overflow-auto backdrop-blur-[16px]" : "mt-3 overflow-hidden",
      )}
      initial={{ opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">Drill down</p>
          <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--md-ink)]">{reportDataSummary(selection)}</p>
        </div>
        <StatusPill tone="teal">Live</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-[var(--md-radius-sm)] bg-white/68 px-3 py-2 shadow-[var(--md-shadow-line)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
            <p className="mt-1 truncate text-[12px] font-medium text-[var(--md-ink)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[var(--md-radius-sm)] bg-white/58 px-3 py-2 shadow-[var(--md-shadow-line)]">
        <p className="text-[12px] leading-5 text-[var(--md-text)]">Shows the rows, lanes, customers, and exceptions behind this widget using the same selected data.</p>
      </div>
    </motion.div>
  )
}

function DashboardModuleDrilldown({ title }: { title: string }) {
  return (
    <motion.div
      layout
      className="mt-3 overflow-hidden rounded-[var(--md-radius-md)] bg-[rgba(243,248,247,0.92)] p-3 shadow-[var(--md-shadow-line)]"
      initial={{ opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">Drill down</p>
          <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--md-ink)]">{title} keeps its dashboard data and actions inside this module.</p>
        </div>
        <StatusPill tone="teal">Live</StatusPill>
      </div>
      <div className="mt-3 rounded-[var(--md-radius-sm)] bg-white/58 px-3 py-2 shadow-[var(--md-shadow-line)]">
        <p className="text-[12px] leading-5 text-[var(--md-text)]">Use this while editing to keep the same animated drill-down pattern across existing dashboard modules and new widgets.</p>
      </div>
    </motion.div>
  )
}

function DashboardResizeGuide({ presets, activeSize, allowedSizes }: { presets: DashboardTilePresets; activeSize: DashboardTileSize; allowedSizes: readonly DashboardTileSize[] }) {
  const preset = presets[activeSize]

  return (
    <div
      aria-hidden="true"
      data-md-resize-guide
      className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] shadow-[inset_0_0_0_2px_var(--md-accent-a42),0_0_0_9999px_var(--md-accent-a025)]"
    >
      <div className="absolute -top-9 start-0 rounded-[var(--md-radius-md)] bg-[var(--md-ink)] px-2.5 py-1.5 text-[11px] font-medium text-white shadow-[var(--md-shadow-lift)]">
        {dashboardTileSizeLabels[activeSize]} · {preset.columns}/12 · {preset.rows} rows
      </div>
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[var(--md-radius-md)] bg-white/94 p-1 shadow-[var(--md-shadow-line)]">
        {allowedSizes.map((size) => (
          <span
            key={size}
            className={cn(
              "rounded-[calc(var(--md-radius-md)-4px)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-subtle)] transition-colors",
              size === activeSize && "bg-[var(--md-accent-a12)] text-[var(--md-accent)]",
            )}
          >
            {dashboardTileSizeLabels[size]}
          </span>
        ))}
      </div>
    </div>
  )
}

function DashboardLayoutTile({
  item,
  selected,
  drilldownOpen,
  isDragging,
  isResizing,
  resizeState,
  dragStyle,
  renderDashboardModule,
  onSelectItem,
  onSetItemSize,
  onEditData,
  onToggleDrilldown,
  onRemoveItem,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  item: ManualDashboardItem
  selected?: boolean
  drilldownOpen?: boolean
  isDragging?: boolean
  isResizing?: boolean
  resizeState?: DashboardResizeState | null
  dragStyle?: CSSProperties
  renderDashboardModule?: (moduleId: DashboardModuleId) => ReactNode
  onSelectItem: (item: ManualDashboardItem) => void
  onSetItemSize: (itemId: string, size: DashboardTileSize) => void
  onEditData: (block: ReportBlock) => void
  onToggleDrilldown: (itemId: string) => void
  onRemoveItem: (itemId: string) => void
  onDragStart: (event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) => void
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void
  onDragEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeStart: (event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) => void
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeEnd: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  const presets = getDashboardItemPresets(item)
  const allowedSizes = getDashboardItemAllowedSizes(item)
  const size = getDashboardItemSize(item)
  const { columns, rows } = presets[size]
  const activeResizeState = isResizing && resizeState?.itemId === item.id ? resizeState : null
  const title = getManualDashboardItemTitle(item)
  const isModule = item.kind === "module"
  const tileControls = (
    <div
      className={cn(
        "md-dashboard-tile-controls flex min-w-0 items-center justify-between gap-2",
        isModule && "pointer-events-none absolute left-2 right-2 top-2 z-20 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100",
        !isModule && "mb-2",
      )}
    >
      <button
        type="button"
        aria-label={`Move ${title}`}
        className={cn(
          "md-dashboard-drag-handle grid size-8 touch-none place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]",
          isModule && "pointer-events-auto bg-white/88 shadow-[var(--md-shadow-line)] backdrop-blur-[10px]",
        )}
        onPointerDown={(event) => onDragStart(event, item)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <GripVertical className="size-4" strokeWidth={1.25} />
      </button>
      <div className="md-dashboard-tile-actions flex min-w-0 items-center gap-1">
        <div
          role="group"
          aria-label={`Size for ${title}`}
          className={cn(
            "md-dashboard-tile-size-switch flex items-center gap-0.5 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] p-0.5",
            isModule && "pointer-events-auto bg-white/88 shadow-[var(--md-shadow-line)] backdrop-blur-[10px]",
          )}
        >
          {allowedSizes.map((sizeOption) => (
            <button
              key={sizeOption}
              type="button"
              aria-label={`Set ${title} to ${dashboardTileSizeLabels[sizeOption]}`}
              title={dashboardTileSizeLabels[sizeOption]}
              aria-pressed={size === sizeOption}
              className={cn(
                "grid size-7 place-items-center rounded-[calc(var(--md-radius-sm)-2px)] text-[var(--md-subtle)] transition-colors hover:text-[var(--md-ink)]",
                size === sizeOption && "bg-white text-[var(--md-accent)] shadow-[var(--md-shadow-line)]",
              )}
              onClick={(event) => {
                event.stopPropagation()
                onSetItemSize(item.id, sizeOption)
              }}
            >
              <span
                className={cn(
                  "rounded-[2px] shadow-[inset_0_0_0_1.5px_currentColor]",
                  sizeOption === "small" && "h-1.5 w-2",
                  sizeOption === "medium" && "h-2.5 w-3",
                  sizeOption === "wide" && "h-1.5 w-5",
                  sizeOption === "large" && "h-2.5 w-5",
                )}
              />
            </button>
          ))}
        </div>
        {item.kind === "report" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]"
            onClick={(event) => {
              event.stopPropagation()
              onEditData(item.block)
            }}
            aria-label={`Choose data for ${title}`}
          >
            <SlidersHorizontal className="size-4" strokeWidth={1.25} />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "size-8 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]",
            isModule && "pointer-events-auto bg-white/88 shadow-[var(--md-shadow-line)] backdrop-blur-[10px]",
            drilldownOpen && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]",
          )}
          onClick={(event) => {
            event.stopPropagation()
            onToggleDrilldown(item.id)
          }}
          aria-label={`Open drill down for ${title}`}
        >
          <Eye className="size-4" strokeWidth={1.25} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn("size-8 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[rgba(178,49,49,0.08)] hover:text-[var(--md-red)]", isModule && "pointer-events-auto bg-white/88 shadow-[var(--md-shadow-line)] backdrop-blur-[10px]")}
          onClick={(event) => {
            event.stopPropagation()
            onRemoveItem(item.id)
          }}
          aria-label={`Remove ${title}`}
        >
          <Trash2 className="size-4" strokeWidth={1.25} />
        </Button>
      </div>
    </div>
  )

  return (
    <motion.div
      layout
      data-md-dashboard-layout-item={item.id}
      data-md-dashboard-tile-size={size}
      data-md-dashboard-kind={item.kind}
      data-md-dashboard-columns={columns}
      data-md-dashboard-rows={rows}
      className={cn(
        "md-dashboard-edit-tile group relative z-10 min-w-0 select-none transition-[background,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isModule
          ? "rounded-[var(--md-radius-2xl)]"
          : "flex min-h-0 flex-col rounded-[var(--md-radius-lg)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(243,248,247,0.88))] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.88),0_0_0_1px_rgba(11,20,19,0.06),0_10px_24px_rgba(42,52,50,0.055)]",
        selected && (isModule ? "shadow-[0_0_0_3px_var(--md-accent-a10)]" : "shadow-[inset_0_0_0_1px_var(--md-accent-a28),0_0_0_3px_var(--md-accent-a10),0_12px_24px_rgba(42,52,50,0.07)]"),
        isDragging && "z-40 cursor-grabbing opacity-95 transition-none",
        isResizing && (isModule ? "shadow-[0_0_0_3px_var(--md-accent-a08)]" : "shadow-[inset_0_0_0_1px_var(--md-accent-a26),0_0_0_3px_var(--md-accent-a08),0_14px_30px_rgba(42,52,50,0.08)]"),
      )}
      style={{ gridColumn: `span ${columns}`, gridRow: `span ${rows}`, ...dragStyle }}
      transition={{ layout: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
      onClick={() => onSelectItem(item)}
    >
      {tileControls}

      {item.kind === "report" ? (
        <ReportBlockView block={item.block} editable selected={selected} dashboardSize={size} onSelect={() => onEditData(item.block)} />
      ) : (
        <div className="md-dashboard-module-content h-full min-w-0 [&>*]:h-full">{renderDashboardModule?.(item.moduleId)}</div>
      )}

      <AnimatePresence initial={false}>
        {drilldownOpen ? item.kind === "report" ? <DashboardTileDrilldown block={item.block} floating /> : <DashboardModuleDrilldown title={title} /> : null}
      </AnimatePresence>

      {activeResizeState ? <DashboardResizeGuide presets={presets} activeSize={size} allowedSizes={allowedSizes} /> : null}

      <button
        type="button"
        aria-label={`Resize ${title}`}
        className={cn(
          "absolute bottom-2 right-2 grid size-8 touch-none cursor-nwse-resize place-items-center rounded-[var(--md-radius-sm)] bg-white/86 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[opacity,color,transform] duration-200 hover:scale-[1.03] hover:text-[var(--md-accent)] focus:text-[var(--md-accent)]",
          selected || isResizing ? "opacity-100" : isModule ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-70 group-hover:opacity-100",
        )}
        onPointerDown={(event) => onResizeStart(event, item)}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      >
        <Maximize2 className="size-3.5" strokeWidth={1.25} />
      </button>
    </motion.div>
  )
}

function buildDashboardLayoutNodes({
  items,
  selectedBlockId,
  activeDrilldownItemId,
  dragState,
  dropPreview,
  incomingPreview,
  resizeState,
  renderDashboardModule,
  onSelectItem,
  onSetItemSize,
  onEditData,
  onToggleDrilldown,
  onRemoveItem,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  items: ManualDashboardItem[]
  selectedBlockId?: string
  activeDrilldownItemId?: string
  dragState: DashboardLayoutDragState | null
  dropPreview: DashboardLayoutDropPreview | null
  incomingPreview: IncomingWidgetPreview | null
  resizeState: DashboardResizeState | null
  renderDashboardModule?: (moduleId: DashboardModuleId) => ReactNode
  onSelectItem: (item: ManualDashboardItem) => void
  onSetItemSize: (itemId: string, size: DashboardTileSize) => void
  onEditData: (block: ReportBlock) => void
  onToggleDrilldown: (itemId: string) => void
  onRemoveItem: (itemId: string) => void
  onDragStart: (event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) => void
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void
  onDragEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeStart: (event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) => void
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeEnd: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  const nodes: ReactNode[] = []
  const placeholderIndex = incomingPreview?.index ?? dropPreview?.index
  const placeholderColumns = incomingPreview?.columns ?? dragState?.columns
  const placeholderRows = incomingPreview?.rows ?? dragState?.rows
  const shouldShowPlaceholder = Boolean(incomingPreview || (dragState && dropPreview))
  let visibleIndex = 0
  let placeholderPlaced = false

  const addPlaceholder = () => {
    nodes.push(<DashboardTilePlaceholder key="dashboard-drop-preview" columns={placeholderColumns} rows={placeholderRows} />)
    placeholderPlaced = true
  }

  items.forEach((item) => {
    if (shouldShowPlaceholder && !placeholderPlaced && visibleIndex === placeholderIndex) addPlaceholder()

    const activeDrag = dragState?.itemId === item.id ? dragState : null
    const dragStyle: CSSProperties | undefined = activeDrag
      ? {
          position: "fixed",
          left: activeDrag.left,
          top: activeDrag.top,
          width: activeDrag.width,
          height: activeDrag.height,
          transform: `translate3d(${activeDrag.x}px, ${activeDrag.y}px, 0) scale(1.006)`,
          willChange: "transform",
        }
      : undefined

    nodes.push(
      <DashboardLayoutTile
        key={item.id}
        item={item}
        selected={selectedBlockId === (item.kind === "report" ? item.block.id : item.id)}
        drilldownOpen={activeDrilldownItemId === item.id}
        isDragging={Boolean(activeDrag)}
        isResizing={resizeState?.itemId === item.id}
        resizeState={resizeState}
        dragStyle={dragStyle}
        renderDashboardModule={renderDashboardModule}
        onSelectItem={onSelectItem}
        onSetItemSize={onSetItemSize}
        onEditData={onEditData}
        onToggleDrilldown={onToggleDrilldown}
        onRemoveItem={onRemoveItem}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
      />,
    )

    if (!activeDrag) visibleIndex += 1
  })

  if (shouldShowPlaceholder && !placeholderPlaced) addPlaceholder()

  return nodes
}

function ManualDashboardControl({
  items,
  activeWidgetId,
  query,
  onQueryChange,
  onPreviewWidget,
}: {
  items: ManualDashboardItem[]
  activeWidgetId?: string
  query: string
  onQueryChange: (value: string) => void
  onPreviewWidget: (widget: ReportWidget) => void
}) {
  return (
    <div className="space-y-5">
      <Surface tone="selected" padding="md" className="rounded-[var(--md-radius-xl)]">
        <div className="flex items-start gap-3">
          <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-white/72 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
            <LayoutDashboard className="size-4" strokeWidth={1.25} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">Manual dashboard preview</p>
            <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">The dashboard stays in its standard view while this panel shows the future widget tray.</p>
          </div>
        </div>
      </Surface>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">Widgets</p>
          <StatusPill tone="teal">Preview modules</StatusPill>
        </div>
        <ReportWidgetPalette
          widgets={dashboardWidgets}
          query={query}
          onQueryChange={onQueryChange}
          activeWidgetId={activeWidgetId}
          onAddWidget={onPreviewWidget}
          presentation="inline"
          helperText="Widget tray preview. The dashboard layout stays unchanged."
        />
      </div>
    </div>
  )
}

function ManualDashboardLayoutCanvas({
  selectedDashboard,
  items,
  selectedBlockId,
  activeDrilldownItemId,
  dragState,
  dropPreview,
  incomingPreview,
  resizeState,
  renderDashboardModule,
  onWidgetDragOverCanvas,
  onWidgetDragLeaveCanvas,
  onDropWidget,
  onSelectItem,
  onSetItemSize,
  onSelectBlock,
  onToggleDrilldown,
  onRemoveItem,
  onLayoutDragStart,
  onLayoutDragMove,
  onLayoutDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  selectedDashboard: string
  items: ManualDashboardItem[]
  selectedBlockId?: string
  activeDrilldownItemId?: string
  dragState: DashboardLayoutDragState | null
  dropPreview: DashboardLayoutDropPreview | null
  incomingPreview: IncomingWidgetPreview | null
  resizeState: DashboardResizeState | null
  renderDashboardModule?: (moduleId: DashboardModuleId) => ReactNode
  onWidgetDragOverCanvas: (clientX: number, clientY: number) => void
  onWidgetDragLeaveCanvas: (relatedTarget: EventTarget | null) => void
  onDropWidget: (widgetId: string, index?: number) => void
  onSelectItem: (item: ManualDashboardItem) => void
  onSetItemSize: (itemId: string, size: DashboardTileSize) => void
  onSelectBlock: (block: ReportBlock) => void
  onToggleDrilldown: (itemId: string) => void
  onRemoveItem: (itemId: string) => void
  onLayoutDragStart: (event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) => void
  onLayoutDragMove: (event: PointerEvent<HTMLButtonElement>) => void
  onLayoutDragEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeStart: (event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) => void
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeEnd: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <motion.div
      data-md-manual-dashboard-canvas
      className="mt-[var(--md-page-stack-gap-compact)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        data-md-dashboard-dropzone
        data-md-dashboard-layout
        data-md-dashboard-snap-active={Boolean(dragState || incomingPreview || resizeState)}
        data-md-dashboard-dragging={Boolean(dragState)}
        aria-label={`${selectedDashboard} manual layout`}
        className="md-dashboard-bento-layout relative grid grid-flow-row grid-cols-12 gap-[var(--md-page-stack-gap-compact)]"
        style={{ gridAutoRows: dashboardBentoRowHeight }}
        onDragEnter={(event) => {
          event.preventDefault()
          onWidgetDragOverCanvas(event.clientX, event.clientY)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          onWidgetDragOverCanvas(event.clientX, event.clientY)
        }}
        onDragLeave={(event) => onWidgetDragLeaveCanvas(event.relatedTarget)}
        onDrop={(event) => {
          event.preventDefault()
          const widgetId = event.dataTransfer.getData("application/multideck-widget")
          if (!widgetId) return
          const preview = getDashboardDropPreviewFromPoint(event.clientX, event.clientY)
          onDropWidget(widgetId, preview?.index)
        }}
      >
        {dragState || incomingPreview || resizeState ? <DashboardBentoGridOverlay /> : null}
        {items.length ? (
          buildDashboardLayoutNodes({
            items,
            selectedBlockId,
            activeDrilldownItemId,
            dragState,
            dropPreview,
            incomingPreview,
            resizeState,
            renderDashboardModule,
            onSelectItem,
            onSetItemSize,
            onEditData: onSelectBlock,
            onToggleDrilldown,
            onRemoveItem,
            onDragStart: onLayoutDragStart,
            onDragMove: onLayoutDragMove,
            onDragEnd: onLayoutDragEnd,
            onResizeStart,
            onResizeMove,
            onResizeEnd,
          })
        ) : (
          <div className="col-span-12 grid min-h-[360px] place-items-center rounded-[var(--md-radius-xl)] bg-white/56 px-5 text-center shadow-[var(--md-shadow-line)]">
            <div>
              <p className="text-[13px] font-medium text-[var(--md-ink)]">Drop a widget here</p>
              <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">Then choose its data, resize it, and open the drill-down view.</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function DashboardCustomisePanel({
  open,
  onOpenChange,
  presentation = "docked",
  selectedDashboard = "Today ops brief",
  mode,
  onModeChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  presentation?: "floating" | "docked" | "preview"
  selectedDashboard?: string
  mode?: DashboardCustomiseMode
  onModeChange?: (mode: DashboardCustomiseMode) => void
  onSaveDashboard?: () => void
}) {
  const [prompt, setPrompt] = useState("")
  const [submittedPrompt, setSubmittedPrompt] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [internalMode, setInternalMode] = useState<DashboardCustomiseMode>("ai")
  const [manualItems, setManualItems] = useState<ManualDashboardItem[]>(createInitialManualBlocks)
  const [selectedManualBlockId, setSelectedManualBlockId] = useState<string>()
  const [editingManualBlock, setEditingManualBlock] = useState<ReportBlock>()
  const [activeManualWidgetId, setActiveManualWidgetId] = useState<string>()
  const [activeDrilldownItemId, setActiveDrilldownItemId] = useState<string>()
  const [layoutDragState, setLayoutDragState] = useState<DashboardLayoutDragState | null>(null)
  const [layoutDropPreview, setLayoutDropPreview] = useState<DashboardLayoutDropPreview | null>(null)
  const [incomingWidgetPreview, setIncomingWidgetPreview] = useState<IncomingWidgetPreview | null>(null)
  const [resizeState, setResizeState] = useState<DashboardResizeState | null>(null)
  const [manualQuery, setManualQuery] = useState("")
  const lastManualDropRef = useRef<{ widgetId: string; time: number } | null>(null)
  const activePaletteWidgetRef = useRef<ReportWidget | null>(null)
  const layoutDragStateRef = useRef<DashboardLayoutDragState | null>(null)
  const layoutDropPreviewRef = useRef<DashboardLayoutDropPreview | null>(null)
  const layoutDragFrameRef = useRef<number | null>(null)
  const resizeStateRef = useRef<DashboardResizeState | null>(null)
  const activeMode = mode ?? internalMode

  useEffect(() => {
    return () => {
      if (layoutDragFrameRef.current !== null) window.cancelAnimationFrame(layoutDragFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (layoutDragState?.pointerId === undefined) return

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== layoutDragStateRef.current?.pointerId) return
      event.preventDefault()
      updateLayoutDragPosition(event.pointerId, event.clientX, event.clientY)
    }

    const handlePointerEnd = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== layoutDragStateRef.current?.pointerId) return
      event.preventDefault()
      finishLayoutDrag(event.pointerId, event.clientX, event.clientY)
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false })
    window.addEventListener("pointerup", handlePointerEnd, { passive: false })
    window.addEventListener("pointercancel", handlePointerEnd, { passive: false })

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }, [layoutDragState?.pointerId])

  function setDashboardMode(nextMode: DashboardCustomiseMode | ((current: DashboardCustomiseMode) => DashboardCustomiseMode)) {
    const next = typeof nextMode === "function" ? nextMode(activeMode) : nextMode
    if (mode === undefined) setInternalMode(next)
    onModeChange?.(next)
  }

  function runPrompt(nextPrompt = prompt) {
    const trimmed = nextPrompt.trim()
    if (!trimmed) return

    setPrompt(trimmed)
    setSubmittedPrompt(trimmed)
    setIsRunning(true)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runPrompt()
  }

  function previewManualWidget(widget: ReportWidget) {
    setActiveManualWidgetId(widget.id)
  }

  function addManualWidget(widget: ReportWidget, index?: number) {
    const newItem = createDashboardItemFromWidget(widget, manualItems.length)
    setManualItems((current) => {
      const insertAt = typeof index === "number" ? clamp(index, 0, current.length) : current.length
      return [...current.slice(0, insertAt), newItem, ...current.slice(insertAt)]
    })
    setSelectedManualBlockId(newItem.block.id)
    setActiveDrilldownItemId(undefined)
    setActiveManualWidgetId(widget.id)
    scrollDashboardItemIntoView(newItem.id)
    toast.success(`${widget.title} added`, { description: "Choose data, resize it, or open the drill-down view." })
  }

  function addManualWidgetById(widgetId: string, index?: number) {
    const now = Date.now()
    if (lastManualDropRef.current?.widgetId === widgetId && now - lastManualDropRef.current.time < 350) return
    lastManualDropRef.current = { widgetId, time: now }
    setIncomingWidgetPreview(null)
    const widget = dashboardWidgets.find((item) => item.id === widgetId)
    if (widget) addManualWidget(widget, index)
  }

  function startPaletteWidgetDrag(widget: ReportWidget) {
    activePaletteWidgetRef.current = widget
    setActiveManualWidgetId(widget.id)
  }

  function endPaletteWidgetDrag() {
    activePaletteWidgetRef.current = null
    setIncomingWidgetPreview(null)
  }

  function updateIncomingWidgetPreview(clientX: number, clientY: number) {
    const widget = activePaletteWidgetRef.current
    if (!widget) return

    const preview = getDashboardDropPreviewFromPoint(clientX, clientY)
    if (!preview) return

    const widgetSize = getReportDefaultTileSize(widget.type, widget.visualization)
    const widgetPreset = getReportTilePresets(widget.type, widget.visualization)[widgetSize]
    const nextPreview = {
      widgetId: widget.id,
      index: preview.index,
      size: widgetSize,
      columns: widgetPreset.columns,
      rows: widgetPreset.rows,
    }

    setIncomingWidgetPreview((current) => {
      if (current?.widgetId === nextPreview.widgetId && current.index === nextPreview.index && current.size === nextPreview.size && current.columns === nextPreview.columns && current.rows === nextPreview.rows) return current
      return nextPreview
    })
  }

  function clearIncomingWidgetPreview(relatedTarget: EventTarget | null) {
    const layoutElement = document.querySelector<HTMLElement>("[data-md-dashboard-layout]")
    if (relatedTarget instanceof Node && layoutElement?.contains(relatedTarget)) return
    setIncomingWidgetPreview(null)
  }

  function selectManualBlock(block: ReportBlock) {
    setSelectedManualBlockId(block.id)
    setActiveManualWidgetId(undefined)
    setEditingManualBlock(block)
  }

  function selectManualItem(item: ManualDashboardItem) {
    setSelectedManualBlockId(item.kind === "report" ? item.block.id : item.id)
    setActiveManualWidgetId(undefined)
  }

  function saveManualBlock(nextBlock: ReportBlock) {
    setManualItems((current) =>
      current.map((item) => (item.kind === "report" && item.block.id === nextBlock.id ? { ...item, title: nextBlock.title, block: nextBlock } : item)),
    )
    setSelectedManualBlockId(nextBlock.id)
    setEditingManualBlock(nextBlock)
    toast.success("Dashboard data updated", { description: `${nextBlock.title} now uses the selected data.` })
  }

  function setManualItemSize(itemId: string, size: DashboardTileSize) {
    setManualItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item
        const allowedSizes = getDashboardItemAllowedSizes(item)
        return allowedSizes.includes(size) ? { ...item, size } : item
      }),
    )
    const item = manualItems.find((candidate) => candidate.id === itemId)
    if (item) setSelectedManualBlockId(item.kind === "report" ? item.block.id : item.id)
  }

  function toggleDrilldown(itemId: string) {
    setActiveDrilldownItemId((current) => (current === itemId ? undefined : itemId))
  }

  function removeManualItem(itemId: string) {
    const item = manualItems.find((candidate) => candidate.id === itemId)
    setManualItems((current) => current.filter((candidate) => candidate.id !== itemId))
    if (item) toast.success(`${getManualDashboardItemTitle(item)} removed`, { description: "The dashboard layout updates immediately." })
    setActiveDrilldownItemId((current) => (current === itemId ? undefined : current))
    setSelectedManualBlockId((current) => (current === itemId || current === (item?.kind === "report" ? item.block.id : undefined) ? undefined : current))
  }

  function updateLayoutDropPreview(clientX: number, clientY: number, draggedItemId: string) {
    const nextDropPreview = getDashboardDropPreviewFromPoint(clientX, clientY, draggedItemId)
    if (layoutDropPreviewRef.current?.index === nextDropPreview?.index) return
    layoutDropPreviewRef.current = nextDropPreview
    setLayoutDropPreview(nextDropPreview)
  }

  function renderLayoutDragState(nextState: DashboardLayoutDragState) {
    layoutDragStateRef.current = nextState
    if (layoutDragFrameRef.current !== null) return

    layoutDragFrameRef.current = window.requestAnimationFrame(() => {
      layoutDragFrameRef.current = null
      setLayoutDragState(layoutDragStateRef.current)
    })
  }

  function updateLayoutDragPosition(pointerId: number, clientX: number, clientY: number) {
    const current = layoutDragStateRef.current
    if (!current || current.pointerId !== pointerId) return

    const x = clientX - current.startX
    const y = clientY - current.startY
    const moved = current.moved || Math.hypot(x, y) > dashboardDragActivationDistance
    const nextState = { ...current, x, y, moved }

    renderLayoutDragState(nextState)
    if (moved) {
      autoScrollDashboardDrag(clientY)
      updateLayoutDropPreview(clientX, clientY, current.itemId)
    }
  }

  function finishLayoutDrag(pointerId: number, clientX: number, clientY: number) {
    const activeDrag = layoutDragStateRef.current
    if (!activeDrag || activeDrag.pointerId !== pointerId) return

    if (layoutDragFrameRef.current !== null) {
      window.cancelAnimationFrame(layoutDragFrameRef.current)
      layoutDragFrameRef.current = null
    }

    const destinationPreview = layoutDropPreviewRef.current ?? getDashboardDropPreviewFromPoint(clientX, clientY, activeDrag.itemId)
    if (activeDrag.moved && destinationPreview) moveManualItem(activeDrag.itemId, destinationPreview.index)

    layoutDragStateRef.current = null
    layoutDropPreviewRef.current = null
    setLayoutDragState(null)
    setLayoutDropPreview(null)
  }

  function moveManualItem(itemId: string, destinationIndex: number) {
    setManualItems((current) => {
      const movingItem = current.find((item) => item.id === itemId)
      if (!movingItem) return current

      const withoutItem = current.filter((item) => item.id !== itemId)
      const insertAt = clamp(destinationIndex, 0, withoutItem.length)
      return [...withoutItem.slice(0, insertAt), movingItem, ...withoutItem.slice(insertAt)]
    })
  }

  function handleLayoutDragStart(event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) {
    if (event.button !== 0) return

    const tile = event.currentTarget.closest<HTMLElement>("[data-md-dashboard-layout-item]")
    const rect = tile?.getBoundingClientRect()
    if (!rect) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedManualBlockId(item.kind === "report" ? item.block.id : item.id)
    const nextDragState = {
      itemId: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: 0,
      y: 0,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      size: getDashboardItemSize(item),
      columns: getDashboardItemPreset(item).columns,
      rows: getDashboardItemPreset(item).rows,
      moved: false,
    }
    layoutDragStateRef.current = nextDragState
    layoutDropPreviewRef.current = null
    setLayoutDragState(nextDragState)
    updateLayoutDropPreview(event.clientX, event.clientY, item.id)
  }

  function handleLayoutDragMove(event: PointerEvent<HTMLButtonElement>) {
    const current = layoutDragStateRef.current
    if (!current || current.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()

    updateLayoutDragPosition(event.pointerId, event.clientX, event.clientY)
  }

  function handleLayoutDragEnd(event: PointerEvent<HTMLButtonElement>) {
    const activeDrag = layoutDragStateRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    finishLayoutDrag(event.pointerId, event.clientX, event.clientY)
  }

  function handleResizeStart(event: PointerEvent<HTMLButtonElement>, item: ManualDashboardItem) {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedManualBlockId(item.kind === "report" ? item.block.id : item.id)

    const layoutElement = document.querySelector<HTMLElement>("[data-md-dashboard-layout]")
    const layoutRect = layoutElement?.getBoundingClientRect()
    const layoutStyles = layoutElement ? getComputedStyle(layoutElement) : null
    const gap = layoutStyles ? Number.parseFloat(layoutStyles.columnGap || layoutStyles.gap || "0") || 0 : 0
    const rowGap = layoutStyles ? Number.parseFloat(layoutStyles.rowGap || layoutStyles.gap || "0") || dashboardBentoGap : dashboardBentoGap
    const columnWidth = layoutRect ? Math.max(36, (layoutRect.width - gap * 11) / 12) : 96

    const preset = getDashboardItemPreset(item)
    const allowedSizes = getDashboardItemAllowedSizes(item)
    const nextResizeState = {
      itemId: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startColumns: preset.columns,
      startRows: preset.rows,
      presets: getDashboardItemPresets(item),
      allowedSizes,
      columnWidth,
      rowHeight: dashboardBentoRowHeight + rowGap,
    }
    resizeStateRef.current = nextResizeState
    setResizeState(nextResizeState)
  }

  function handleResizeMove(event: PointerEvent<HTMLButtonElement>) {
    const activeResize = resizeStateRef.current
    if (!activeResize || activeResize.pointerId !== event.pointerId) return

    event.stopPropagation()
    const deltaX = event.clientX - activeResize.startX
    const deltaY = event.clientY - activeResize.startY
    const targetColumns = activeResize.startColumns + deltaX / activeResize.columnWidth
    const targetRows = activeResize.startRows + deltaY / activeResize.rowHeight
    const nextSize = getSnappedTileSize(activeResize.presets, targetColumns, targetRows, activeResize.allowedSizes)

    setManualItems((current) => {
      const item = current.find((candidate) => candidate.id === activeResize.itemId)
      if (!item || item.size === nextSize) return current
      return current.map((candidate) => (candidate.id === activeResize.itemId ? { ...candidate, size: nextSize } : candidate))
    })
  }

  function handleResizeEnd(event: PointerEvent<HTMLButtonElement>) {
    const activeResize = resizeStateRef.current
    if (!activeResize || activeResize.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStateRef.current = null
    setResizeState(null)
  }

  const panel = (
    <motion.aside
      role="dialog"
      aria-modal={presentation === "floating"}
      aria-label="Dashboard AI customisation panel"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-[var(--md-composer-inner-bg)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-[24px]",
        presentation === "floating" && "fixed right-3 top-3 z-50 max-h-[calc(100vh-24px)] max-w-[560px] rounded-[var(--md-radius-2xl)]",
        presentation === "docked" && "sticky top-[76px] max-h-[calc(100vh-92px)] min-h-[640px] rounded-[var(--md-radius-2xl)]",
        presentation === "preview" && "relative min-h-[640px] max-w-[560px] rounded-[var(--md-radius-2xl)]",
      )}
      initial={{ opacity: 0, x: 28, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="flex h-[62px] shrink-0 items-center justify-between px-5 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] shadow-[var(--md-shadow-line)]">
            <Sparkles className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} />
          </span>
          <div>
            <h2 className="text-[15px] font-medium tracking-normal text-[var(--md-ink)]">Dashboard assistant</h2>
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{activeMode === "manual" ? "Manual preview" : "Configure the overview"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]",
              activeMode === "manual" && "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]",
            )}
            onClick={() => setDashboardMode((value) => (value === "manual" ? "ai" : "manual"))}
          >
            <SlidersHorizontal className="size-4" strokeWidth={1.3} />
            Manual
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]"
            onClick={() => {
              setIsRunning(false)
              setSubmittedPrompt("")
              setPrompt("")
            }}
          >
            <RefreshCcw className="size-4" strokeWidth={1.3} />
            <span className="sr-only">Reset assistant</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-soft)] hover:text-[var(--md-ink)]"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" strokeWidth={1.3} />
            <span className="sr-only">Close customisation panel</span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {activeMode === "manual" ? (
          <ManualDashboardControl
            items={manualItems}
            activeWidgetId={activeManualWidgetId}
            query={manualQuery}
            onQueryChange={setManualQuery}
            onPreviewWidget={previewManualWidget}
          />
        ) : submittedPrompt ? (
          <div className="space-y-4">
            <Surface tone="selected" padding="md" className="rounded-[var(--md-radius-xl)]">
              <p className="text-[15px] font-medium leading-6 text-[var(--md-ink)]">{submittedPrompt}</p>
            </Surface>

            <div className="flex items-center gap-2 text-[13px] font-medium italic text-[var(--md-text)]">
              <span className="size-2 rounded-full bg-[var(--md-accent)] shadow-[0_0_18px_var(--md-accent-a32)]" />
              Pulling Multideck workspace data...
            </div>

            <Surface padding="md" className="rounded-[var(--md-radius-2xl)]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-medium text-[var(--md-ink)]">Dashboard reconfiguration</p>
                    <p className="mt-2 text-[13px] font-medium text-[var(--md-subtle)]">{isRunning ? "Generating layout..." : "Ready to apply"}</p>
                  </div>
                  <StatusPill tone={isRunning ? "teal" : "green"}>{isRunning ? "Running" : "Ready"}</StatusPill>
                </div>
              </div>

              <div className="mt-[var(--md-page-stack-gap)] shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]">
                <div className="flex h-11 items-center justify-between">
                  <span className="text-[13px] font-medium text-[var(--md-text)]">{isRunning ? "Running..." : "Preview generated"}</span>
                  <span className="text-[12px] font-medium text-[var(--md-subtle)]">5 steps</span>
                </div>
                <div className="space-y-1.5">
                  {progressSteps.map((step, index) => {
                    const active = isRunning ? index === 0 : index < progressSteps.length
                    const complete = !isRunning

                    return (
                      <div key={step} className={cn("flex h-10 items-center justify-between rounded-[var(--md-radius-md)] px-2 transition-[background,color,box-shadow,opacity,transform]", active && "bg-[var(--md-surface-soft)]")}>
                        <div className="flex items-center gap-3">
                          <span className={cn("grid size-6 place-items-center rounded-[var(--md-radius-sm)] bg-white/70 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]", active && "text-[var(--md-accent)]", complete && "text-[var(--md-green)]")}>
                            {complete ? <Check className="size-3.5" strokeWidth={1.5} /> : <span className="size-1.5 rounded-full bg-current" />}
                          </span>
                          <span className={cn("text-[13px] font-medium text-[var(--md-subtle)]", active && "text-[var(--md-ink)]")}>{step}</span>
                        </div>
                        <span className={cn("text-[12px] font-medium text-[var(--md-subtle)]", active && "text-[var(--md-accent)]")}>{isRunning && index === 0 ? "Running" : complete ? "Done" : "Pending"}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Surface>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-3 pb-2">
            <div className="mb-auto pt-16 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
                <Sparkles className="size-5 text-[var(--md-accent)]" strokeWidth={1.25} />
              </div>
              <p className="mx-auto mt-4 max-w-[270px] text-[13px] leading-6 text-[var(--md-text)]">Ask for the dashboard you need. This mock panel shows how Multideck could rebuild the view around an operator goal.</p>
            </div>

            {suggestionPrompts.map((item) => (
              <button
                key={item.prompt}
                type="button"
                className="group rounded-[var(--md-radius-xl)] bg-white/62 px-4 py-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/85"
                onClick={() => runPrompt(item.prompt)}
              >
                <StatusPill tone="teal">{item.label}</StatusPill>
                <span className="mt-2 block text-[13px] font-medium leading-5 text-[var(--md-text)] group-hover:text-[var(--md-ink)]">{item.prompt}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {activeMode === "ai" ? (
        <form onSubmit={handleSubmit} className="shrink-0 px-5 pb-5 pt-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]">
          <div className="grid min-h-[88px] grid-cols-[1fr_42px] gap-3 rounded-[var(--md-radius-2xl)] bg-white/72 p-3 shadow-[var(--md-shadow-line)]">
            <label className="sr-only" htmlFor="dashboard-ai-prompt">
              Ask AI to customise the dashboard
            </label>
            <textarea
              id="dashboard-ai-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask about your operation..."
              className="min-h-[58px] resize-none bg-transparent px-1 py-1 text-[14px] leading-5 text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]"
            />
            <Button type="submit" size="icon" className="mt-auto size-[42px] rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-ink)]" disabled={!prompt.trim()}>
              <CornerDownLeft className="size-4" strokeWidth={1.35} />
              <span className="sr-only">Run dashboard prompt</span>
            </Button>
          </div>
        </form>
      ) : (
        <div className="shrink-0 px-5 pb-5 pt-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]">
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-white/62 px-4 py-3 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
            <span className="font-medium text-[var(--md-ink)]">Preview only</span>
            <StatusPill tone="teal">Dashboard unchanged</StatusPill>
          </div>
        </div>
      )}

      <ReportBlockDataEditorDialog
        block={editingManualBlock}
        open={Boolean(editingManualBlock)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingManualBlock(undefined)
        }}
        onSave={saveManualBlock}
      />
    </motion.aside>
  )

  if (presentation === "preview") return panel
  if (presentation === "docked") {
    return <AnimatePresence>{open ? panel : null}</AnimatePresence>
  }

  return <AnimatePresence>{open ? panel : null}</AnimatePresence>
}
