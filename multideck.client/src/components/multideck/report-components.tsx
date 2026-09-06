import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import {
  AiBeautify,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Grid3X3,
  GripVertical,
  ListChecks,
  Map,
  Plus,
  Search,
  Table2,
  TrendingUp,
  X,
} from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { cn } from "@/lib/utils"
import type { GeneratedReport, GeneratedReportStatus, ReportTemplate } from "@/data/operational-data"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"
import { ReportVisualizationBlock, type ChartDataPoint, type ChartSeries, type ReportVisualizationOptions, type VisualizationKind } from "./chart-components"

const reportStatusTone: Record<GeneratedReportStatus, "green" | "blue" | "neutral"> = {
  Ready: "green",
  Generating: "blue",
  Scheduled: "neutral",
}

function PreviewLine({ values = [18, 24, 21, 28, 31, 29, 36, 42] }: { values?: number[] }) {
  const width = 128
  const height = 44
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 12) - 6
    return [x, y] as const
  })
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")

  return (
    <svg className="h-11 w-32 overflow-visible" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`M 0 ${height - 7} C 36 ${height - 12}, 78 ${height - 7}, ${width} ${height - 14}`} fill="none" stroke="rgba(90,103,100,0.12)" strokeWidth="3" strokeLinecap="round" />
      <path d={path} fill="none" stroke="var(--md-accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <circle cx={points.at(-1)?.[0]} cy={points.at(-1)?.[1]} r="3.5" fill="var(--md-accent)" />
    </svg>
  )
}

function PreviewBars({ bars = [[82, 38, 24], [64, 44, 30], [74, 52, 28]] }: { bars?: number[][] }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {bars.map((bar, index) => (
        <div key={`${bar.join("-")}-${index}`} className="flex h-3 overflow-hidden rounded-full bg-[rgba(90,103,100,0.1)]">
          <span className="bg-[var(--md-accent)]" style={{ width: `${bar[0]}%` }} />
          <span className="bg-[var(--md-accent-a38)]" style={{ width: `${bar[1]}%` }} />
          <span className="bg-[rgba(90,103,100,0.12)]" style={{ width: `${bar[2]}%` }} />
        </div>
      ))}
    </div>
  )
}

function ReportPreviewGraphic({ template }: { template: ReportTemplate }) {
  return (
    <div className="flex h-[118px] flex-col justify-between rounded-[var(--md-radius-lg)] bg-[var(--md-report-preview-bg)] p-4 shadow-[var(--md-shadow-line)]">
      <div className="flex items-start gap-3">
        <span className="size-3 rounded-[var(--md-radius-xs)] bg-[var(--md-accent)]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <span className="h-2.5 w-24 rounded-full bg-[rgba(90,103,100,0.14)]" />
          <span className="h-2.5 w-40 rounded-full bg-[rgba(90,103,100,0.12)]" />
        </div>
      </div>

      {template.chart === "kpi" ? (
        <div className="flex items-end justify-between gap-4">
          <p className="text-[30px] font-medium leading-none tracking-normal text-[var(--md-ink)]">
            {template.metric?.replace("%", "")}
            <span className="text-[17px]">%</span>
          </p>
          <PreviewLine values={template.series} />
        </div>
      ) : null}

      {template.chart === "line" ? (
        <div className="flex items-end justify-between">
          <span className="h-2.5 w-24 rounded-full bg-[rgba(90,103,100,0.1)]" />
          <PreviewLine values={template.series} />
        </div>
      ) : null}

      {template.chart === "donut" ? (
        <div className="flex items-center gap-[var(--md-page-stack-gap)]">
          <span
            className="size-12 rounded-full"
            style={{
              background: "conic-gradient(var(--md-accent) 0deg 275deg, rgba(90,103,100,0.13) 275deg 360deg)",
              boxShadow: "var(--md-report-donut-hole)",
            }}
          />
          <div className="grid flex-1 gap-2">
            {[118, 94, 72].map((width, index) => (
              <div key={width} className="flex items-center gap-3">
                <span className={cn("size-1.5 rounded-full", index === 0 ? "bg-[var(--md-accent)]" : "bg-[rgba(90,103,100,0.2)]")} />
                <span className="h-2.5 rounded-full bg-[rgba(90,103,100,0.12)]" style={{ width }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {template.chart === "bars" ? <PreviewBars bars={template.bars} /> : null}
    </div>
  )
}

export function ReportTemplateCard({
  template,
  onRun,
  onEdit,
  className,
}: {
  template: ReportTemplate
  onRun?: (template: ReportTemplate) => void
  onEdit?: (template: ReportTemplate) => void
  className?: string
}) {
  return (
    <Surface padding="none" className={cn("flex min-h-[336px] flex-col rounded-[var(--md-radius-xl)] p-4", className)}>
      <ReportPreviewGraphic template={template} />
      <div className="mt-4 flex flex-1 flex-col">
        <h3 className="text-[17px] font-medium leading-6 text-[var(--md-ink)]">{template.title}</h3>
        <p className="mt-1 text-[14px] leading-5 text-[var(--md-text)]">{template.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--md-accent-a10)] px-3 py-1 text-[12px] font-medium text-[var(--md-text)]">{template.cadence}</span>
          <span className="rounded-full bg-[var(--md-accent-a10)] px-3 py-1 text-[12px] font-medium text-[var(--md-text)]">{template.format}</span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[rgba(11,20,19,0.06)] pt-4">
        <button type="button" className="text-[14px] font-medium text-[var(--md-accent)] transition-opacity hover:opacity-75" onClick={() => onRun?.(template)}>
          Run now
        </button>
        <button type="button" className="text-[14px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]" onClick={() => onEdit?.(template)}>
          Edit
        </button>
      </div>
    </Surface>
  )
}

export function NewReportTemplateCard({ onCreate, className }: { onCreate?: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "group flex min-h-[336px] flex-col items-center justify-center rounded-[var(--md-radius-xl)] border-0 border-dashed bg-transparent p-[var(--md-page-stack-gap)] text-center shadow-[inset_0_0_0_1px_rgba(90,103,100,0.16)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-white/24 hover:shadow-[inset_0_0_0_1px_var(--md-accent-a22),0_0_0_3px_var(--md-accent-a06)]",
        className,
      )}
      onClick={onCreate}
    >
      <span className="grid size-[52px] place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)] transition-transform duration-200 group-hover:scale-[1.03]">
        <Plus className="size-5" strokeWidth={1.5} />
      </span>
      <span className="mt-[var(--md-page-section-gap)] text-[15px] font-medium text-[var(--md-ink)]">New template</span>
      <span className="mt-[var(--md-page-stack-gap)] max-w-[230px] text-[13px] leading-5 text-[var(--md-text)]">Start blank, or let Dexter draft one from a report you already sent</span>
    </button>
  )
}

function ReportStatusPill({ status }: { status: GeneratedReportStatus }) {
  return <StatusPill kind="status" tone={reportStatusTone[status]}>{status}</StatusPill>
}

export function GeneratedReportsTable({
  reports,
  onView,
  onDownload,
  className,
}: {
  reports: GeneratedReport[]
  onView?: (report: GeneratedReport) => void
  onDownload?: (report: GeneratedReport) => void
  className?: string
}) {
  const columns = useMemo<DataTableColumn<GeneratedReport>[]>(() => [
    { id: "report", label: "Report", kind: "long-text", width: 300, minWidth: 220, resizable: true, sortValue: (report) => report.title, cellTitle: (report) => `${report.title} · ${report.subtitle}`, cell: (report) => <div className="min-w-0"><p className="truncate text-[15px] font-medium leading-5 text-[var(--md-ink)]">{report.title}</p><p className="mt-1 truncate text-[13px] text-[var(--md-text)]">{report.subtitle}</p></div> },
    { id: "scope", label: "Scope", kind: "attribute", width: 150, sortValue: (report) => report.scope, cell: (report) => <StatusPill kind="attribute" tone="blue">{report.scope}</StatusPill> },
    { id: "period", label: "Period", kind: "date", width: 160, sortValue: (report) => report.period, cell: (report) => <span className="font-medium text-[var(--md-ink)]">{report.period}</span> },
    { id: "created", label: "Created", kind: "date", width: 140, sortValue: (report) => report.created, cell: (report) => <span className="tabular-nums text-[var(--md-text)]">{report.created}</span> },
    { id: "status", label: "Status", kind: "status", width: 130, sortValue: (report) => report.status, cell: (report) => <ReportStatusPill status={report.status} /> },
    {
      id: "actions",
      label: "Actions",
      kind: "actions",
      width: 156,
      canHide: false,
      canPin: false,
      cell: (report) => {
        const isReady = report.status === "Ready"
        return <div className="flex justify-end gap-1.5"><Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)] disabled:text-[var(--md-subtle)]" disabled={!isReady} onClick={() => onView?.(report)}><Eye data-icon="inline-start" strokeWidth={1.2} />View</Button><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Download PDF" className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-[var(--md-text)] opacity-0 shadow-[var(--md-shadow-line)] transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100" disabled={!isReady} onClick={() => onDownload?.(report)}><Download className="size-3.5" strokeWidth={1.2} /></Button></TooltipTrigger><TooltipContent>Download PDF</TooltipContent></Tooltip></div>
      },
    },
  ], [onDownload, onView])

  return <DataTable clientPagination ariaLabel="Generated reports" columnsButtonLabel="Manage report columns" columns={columns} rows={reports} getRowKey={(report) => report.id} storageKey="generated-reports" rowClassName="group/row h-[82px]" className={className} />
}

export function reportStatusStyle(status: GeneratedReportStatus): CSSProperties {
  return { color: toneToVar(reportStatusTone[status]) }
}

export type ReportBlockType = "summary" | "kpi-grid" | "chart" | "table" | "exception-log" | "spend"

export type ReportBlock = {
  id: string
  type: ReportBlockType
  title: string
  body?: string
  stat?: string
  meta?: string
  tone?: "teal" | "green" | "amber" | "red" | "blue" | "neutral"
  metrics?: Array<{ label: string; value: string; change?: string }>
  rows?: string[][]
  values?: number[]
  visualization?: VisualizationKind
  visualizationOptions?: ReportVisualizationOptions
  dataSelection?: ReportBlockDataSelection
}

export type ReportPage = {
  id: string
  label: string
  eyebrow?: string
  title: string
  subtitle?: string
  preparedBy?: string
  footer?: string
  pageNumber: number
  blocks: ReportBlock[]
}

export type ReportWidget = {
  id: string
  title: string
  description: string
  group: "Stats & KPIs" | "Visualizations" | "Lists & tables" | "Narrative"
  type: ReportBlockType
  visualization?: VisualizationKind
  visualizationOptions?: ReportVisualizationOptions
  icon: ReactNode
}
type ReportDashboardSize = "small" | "medium" | "wide" | "large"

export type ReportBlockDataSelection = {
  source: string
  metric: string
  breakdown: string
  period: string
}

export const reportDataSources = [
  { id: "bookings", label: "Bookings" },
  { id: "exceptions", label: "Exceptions" },
  { id: "quotes", label: "Quotes" },
  { id: "spend", label: "Spend" },
  { id: "customers", label: "Customers" },
  { id: "documents", label: "Documents" },
] as const

export const reportDataMetrics = [
  { id: "on-time", label: "On-time performance" },
  { id: "booking-volume", label: "Booking volume" },
  { id: "freight-spend", label: "Freight spend" },
  { id: "exceptions", label: "Exceptions" },
  { id: "margin", label: "Margin" },
  { id: "quote-conversion", label: "Quote conversion" },
  { id: "document-clearance", label: "Document clearance" },
] as const

export const reportDataBreakdowns = [
  { id: "month", label: "By month" },
  { id: "mode", label: "By transport mode" },
  { id: "carrier", label: "By carrier" },
  { id: "customer", label: "By customer" },
  { id: "lane", label: "By lane" },
  { id: "origin-destination", label: "Origin x destination" },
  { id: "exception-reason", label: "By exception reason" },
] as const

export const reportDataPeriods = [
  { id: "today", label: "Today" },
  { id: "7-days", label: "Last 7 days" },
  { id: "30-days", label: "Last 30 days" },
  { id: "quarter", label: "Quarter to date" },
  { id: "year", label: "Year to date" },
] as const

const defaultReportDataSelection: ReportBlockDataSelection = {
  source: "bookings",
  metric: "on-time",
  breakdown: "month",
  period: "30-days",
}

function optionLabel(options: readonly { id: string; label: string }[], id: string) {
  return options.find((option) => option.id === id)?.label ?? id
}

function resolveDataSelection(block?: ReportBlock): ReportBlockDataSelection {
  return {
    ...defaultReportDataSelection,
    ...block?.dataSelection,
  }
}

export function reportDataSummary(selection: ReportBlockDataSelection) {
  return `${optionLabel(reportDataSources, selection.source)} - ${optionLabel(reportDataPeriods, selection.period)} - ${optionLabel(reportDataBreakdowns, selection.breakdown).replace("By ", "by ")}`
}

function valuesForPeriod(selection: ReportBlockDataSelection) {
  if (selection.period === "today") return ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]
  if (selection.period === "7-days") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  if (selection.period === "quarter") return ["W1", "W2", "W3", "W4", "W5", "W6"]
  if (selection.period === "year") return ["Jan", "Mar", "May", "Jul", "Sep", "Nov"]
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
}

function createReportVisualizationOptions(selection: ReportBlockDataSelection, kind: VisualizationKind): ReportVisualizationOptions {
  const periods = valuesForPeriod(selection)
  const offset = reportDataMetrics.findIndex((metric) => metric.id === selection.metric) + reportDataSources.findIndex((source) => source.id === selection.source)
  const data = periods.map((period, index) => ({
    period,
    actual: 82 + ((index * 5 + offset) % 15),
    target: 92,
    ocean: 28 + ((index * 7 + offset) % 24),
    air: 8 + ((index * 3 + offset) % 12),
    road: 12 + ((index * 4 + offset) % 14),
    quoted: 112 + index * 12 + offset * 3,
    billed: 106 + index * 11 + offset * 2,
    margin: 14 + ((index * 2 + offset) % 8),
  }))

  if (kind === "pie") {
    return {
      pieData: [
        { name: optionLabel(reportDataBreakdowns, selection.breakdown).replace("By ", ""), value: 46 + offset, color: "var(--md-accent)" },
        { name: "Watch", value: 28 + offset, color: "var(--md-blue)" },
        { name: "Other", value: 18 + offset, color: "var(--md-green)" },
      ],
      pieCenterLabel: optionLabel(reportDataMetrics, selection.metric),
      showLegend: true,
    }
  }

  if (kind === "funnel") {
    return {
      funnelData: [
        { stage: "Received", value: 184 + offset, color: "var(--md-accent)" },
        { stage: "Checked", value: 156 + offset, color: "var(--md-green)" },
        { stage: "Actioned", value: 128 + offset, color: "var(--md-blue)" },
        { stage: "Closed", value: 104 + offset, color: "var(--md-amber)" },
      ],
    }
  }

  if (kind === "heatmap") {
    return {
      heatmapRows: [
        { label: "China", values: { UK: 28 + offset, EU: 21 + offset, US: 12 + offset, GCC: 9 + offset } },
        { label: "Turkey", values: { UK: 15 + offset, EU: 18 + offset, US: 5 + offset, GCC: 12 + offset } },
        { label: "Germany", values: { UK: 8 + offset, EU: 26 + offset, US: 9 + offset, GCC: 6 + offset } },
      ],
      heatmapColumns: ["UK", "EU", "US", "GCC"],
    }
  }

  if (kind === "radial") {
    return {
      radialValue: 82 + (offset % 14),
      radialLabel: optionLabel(reportDataMetrics, selection.metric),
    }
  }

  if (kind === "scatter") {
    return {
      scatterData: [
        { carrier: "COSCO", dwell: 8 + offset, onTime: 94, volume: 42 },
        { carrier: "Maersk", dwell: 11 + offset, onTime: 91, volume: 35 },
        { carrier: "ONE", dwell: 7 + offset, onTime: 97, volume: 24 },
        { carrier: "DHL", dwell: 5 + offset, onTime: 96, volume: 18 },
      ],
    }
  }

  if (kind === "mixed") {
    return { data }
  }

  return {
    data,
    xKey: "period",
    barVariant: selection.breakdown === "month" ? "single" : "comparison",
  }
}

export function applyReportBlockDataSelection(block: ReportBlock, selection: ReportBlockDataSelection): ReportBlock {
  const kind = block.visualization ?? "line"
  const metricLabel = optionLabel(reportDataMetrics, selection.metric)
  const breakdownLabel = optionLabel(reportDataBreakdowns, selection.breakdown).toLowerCase()
  const title = block.type === "chart" ? metricLabel : block.title
  const meta = reportDataSummary(selection)

  if (block.type === "chart") {
    return {
      ...block,
      title,
      meta,
      dataSelection: selection,
      visualizationOptions: {
        ...block.visualizationOptions,
        ...createReportVisualizationOptions(selection, kind),
      },
    }
  }

  if (block.type === "kpi-grid") {
    return {
      ...block,
      title,
      meta,
      dataSelection: selection,
      metrics: [
        { label: metricLabel, value: selection.metric === "freight-spend" ? "€184k" : selection.metric === "exceptions" ? "3" : "94.2%", change: breakdownLabel },
        { label: optionLabel(reportDataPeriods, selection.period), value: selection.period === "today" ? "Live" : "Ready" },
      ],
    }
  }

  return {
    ...block,
    meta,
    dataSelection: selection,
  }
}

function WidgetPreviewFrame({ children }: { children: ReactNode }) {
  return (
    <span className="relative block h-[74px] overflow-hidden rounded-[var(--md-radius-md)] bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(213,228,225,0.68))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)]">
      <span className="pointer-events-none absolute inset-x-3 top-3 h-px bg-[rgba(90,103,100,0.12)]" />
      <span className="pointer-events-none absolute inset-x-3 top-1/2 h-px bg-[rgba(90,103,100,0.10)]" />
      <span className="relative block h-full w-full">{children}</span>
    </span>
  )
}

function MiniBars({ comparison = false, stacked = false }: { comparison?: boolean; stacked?: boolean }) {
  const bars = [24, 38, 31, 48, 56, 42]
  const comparisonBars = [
    [24, 12, 18],
    [40, 18, 28],
    [32, 14, 22],
    [52, 22, 35],
    [60, 26, 42],
    [48, 20, 31],
  ]

  if (stacked) {
    return (
      <svg viewBox="0 0 150 74" className="size-full" aria-hidden="true">
        {[16, 30, 44, 58].map((y, index) => (
          <g key={y}>
            <rect x="18" y={y} width={48 + index * 10} height="8" rx="4" fill="var(--md-accent)" opacity="0.92" />
            <rect x={66 + index * 10} y={y} width={26 + index * 5} height="8" rx="4" fill="var(--md-blue)" opacity="0.88" />
            <rect x={92 + index * 15} y={y} width={20} height="8" rx="4" fill="var(--md-green)" opacity="0.8" />
          </g>
        ))}
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 150 74" className="size-full" aria-hidden="true">
      {comparison
        ? comparisonBars.map((set, index) => {
            const x = 19 + index * 19
            return (
              <g key={index}>
                <rect x={x} y={60 - set[0]} width="4" height={set[0]} rx="2" fill="var(--md-accent)" />
                <rect x={x + 6} y={60 - set[1]} width="4" height={set[1]} rx="2" fill="var(--md-blue)" />
                <rect x={x + 12} y={60 - set[2]} width="4" height={set[2]} rx="2" fill="var(--md-green)" />
              </g>
            )
          })
        : bars.map((height, index) => (
            <rect key={index} x={18 + index * 19} y={60 - height} width="13" height={height} rx="3" fill="var(--md-accent)" />
          ))}
    </svg>
  )
}

function MiniLine({ area = false, mixed = false }: { area?: boolean; mixed?: boolean }) {
  const path = "M16 52 C34 34, 45 45, 58 31 S84 25, 98 34 S118 50, 134 20"
  return (
    <svg viewBox="0 0 150 74" className="size-full" aria-hidden="true">
      {mixed ? (
        <>
          {[24, 34, 28, 44, 36].map((height, index) => (
            <rect key={index} x={20 + index * 21} y={60 - height} width="10" height={height} rx="3" fill="var(--md-accent)" opacity="0.75" />
          ))}
        </>
      ) : null}
      {area ? <path d={`${path} L134 60 L16 60 Z`} fill="var(--md-accent)" opacity="0.16" /> : null}
      <path d={path} fill="none" stroke={mixed ? "var(--md-green)" : "var(--md-accent)"} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      <path d="M16 40 H134" fill="none" stroke="var(--md-blue)" strokeDasharray="4 5" strokeLinecap="round" strokeWidth="2" opacity={area || mixed ? 0 : 0.65} />
    </svg>
  )
}

function MiniPie({ donut = false, legend = false }: { donut?: boolean; legend?: boolean }) {
  return (
    <span className="flex h-full items-center justify-center gap-3 px-4" aria-hidden="true">
      <span
        className="size-12 shrink-0 rounded-full"
        style={{
          background: "conic-gradient(var(--md-accent) 0deg 230deg, var(--md-blue) 230deg 305deg, var(--md-green) 305deg 360deg)",
          boxShadow: donut ? "inset 0 0 0 13px rgba(246,251,250,0.94), var(--md-shadow-line)" : "var(--md-shadow-line)",
        }}
      />
      {legend ? (
        <span className="grid gap-1.5">
          {["var(--md-accent)", "var(--md-blue)", "var(--md-green)"].map((color, index) => (
            <span key={color} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: color }} />
              <span className="h-1.5 rounded-full bg-[rgba(90,103,100,0.16)]" style={{ width: 34 - index * 6 }} />
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}

function MiniFunnel({ steps = 4 }: { steps?: number }) {
  const levels = steps <= 3 ? [122, 82, 44] : steps >= 5 ? [128, 108, 86, 62, 34] : [126, 104, 78, 48]
  const colors = ["var(--md-accent)", "var(--md-green)", "var(--md-blue)", "var(--md-amber)", "var(--md-red)"]
  const rowHeight = 48 / levels.length

  return (
    <svg viewBox="0 0 150 74" className="size-full" aria-hidden="true">
      {levels.map((width, index) => {
        const nextWidth = levels[index + 1] ?? Math.max(22, width - 24)
        const y = 13 + index * rowHeight
        const nextY = 13 + (index + 1) * rowHeight
        return (
          <polygon
            key={index}
            points={`${75 - width / 2},${y} ${75 + width / 2},${y} ${75 + nextWidth / 2},${nextY} ${75 - nextWidth / 2},${nextY}`}
            fill={colors[index % colors.length]}
            opacity={0.92}
          />
        )
      })}
    </svg>
  )
}

function MiniHeatmap() {
  return (
    <span className="grid h-full grid-cols-4 gap-1 p-4" aria-hidden="true">
      {Array.from({ length: 16 }).map((_, index) => (
        <span
          key={index}
          className="rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]"
          style={{ background: `color-mix(in srgb, var(--md-accent) ${18 + ((index * 13) % 58)}%, white)` }}
        />
      ))}
    </span>
  )
}

function MiniRadial() {
  return (
    <svg viewBox="0 0 150 74" className="size-full" aria-hidden="true">
      <circle cx="75" cy="37" r="22" fill="none" stroke="rgba(90,103,100,0.13)" strokeWidth="9" />
      <circle cx="75" cy="37" r="22" fill="none" stroke="var(--md-accent)" strokeLinecap="round" strokeDasharray="104 138" strokeWidth="9" transform="rotate(-90 75 37)" />
      <text x="75" y="41" textAnchor="middle" className="fill-[var(--md-ink)] text-[12px] font-medium">
        94%
      </text>
    </svg>
  )
}

function MiniScatter() {
  const points = [
    [26, 46, 5],
    [42, 34, 7],
    [60, 42, 4],
    [76, 25, 6],
    [96, 31, 5],
    [116, 20, 8],
  ]
  return (
    <svg viewBox="0 0 150 74" className="size-full" aria-hidden="true">
      <path d="M18 14 V60 H134" fill="none" stroke="rgba(90,103,100,0.22)" strokeWidth="2" />
      {points.map(([cx, cy, r], index) => (
        <circle key={index} cx={cx} cy={cy} r={r} fill={index % 2 ? "var(--md-blue)" : "var(--md-accent)"} opacity="0.86" />
      ))}
    </svg>
  )
}

function MiniTable() {
  return (
    <span className="grid gap-2 p-4" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <span key={row} className="grid grid-cols-[1fr_0.7fr_0.45fr] gap-2">
          <span className="h-2 rounded-full bg-[var(--md-accent-a28)]" />
          <span className="h-2 rounded-full bg-[rgba(90,103,100,0.14)]" />
          <span className="h-2 rounded-full bg-[rgba(90,103,100,0.12)]" />
        </span>
      ))}
    </span>
  )
}

function MiniNarrative() {
  return (
    <span className="grid gap-2 p-4" aria-hidden="true">
      <span className="h-2 w-14 rounded-full bg-[var(--md-accent)]" />
      <span className="h-2 w-full rounded-full bg-[rgba(90,103,100,0.14)]" />
      <span className="h-2 w-4/5 rounded-full bg-[rgba(90,103,100,0.12)]" />
      <span className="h-2 w-2/3 rounded-full bg-[rgba(90,103,100,0.10)]" />
    </span>
  )
}

function WidgetMiniPreview({ widget }: { widget: ReportWidget }) {
  const visualization = widget.visualization

  if (widget.type === "chart") {
    return (
      <WidgetPreviewFrame>
        {visualization === "line" ? <MiniLine /> : null}
        {visualization === "area" ? <MiniLine area /> : null}
        {visualization === "bar" ? <MiniBars comparison={widget.visualizationOptions?.barVariant === "comparison"} /> : null}
        {visualization === "stacked-bar" ? <MiniBars stacked /> : null}
        {visualization === "pie" ? <MiniPie donut={widget.id.includes("donut")} legend={widget.visualizationOptions?.showLegend !== false} /> : null}
        {visualization === "funnel" ? <MiniFunnel steps={widget.visualizationOptions?.funnelData?.length} /> : null}
        {visualization === "heatmap" ? <MiniHeatmap /> : null}
        {visualization === "radial" ? <MiniRadial /> : null}
        {visualization === "scatter" ? <MiniScatter /> : null}
        {visualization === "mixed" ? <MiniLine mixed /> : null}
      </WidgetPreviewFrame>
    )
  }

  if (widget.type === "table" || widget.type === "exception-log") {
    return (
      <WidgetPreviewFrame>
        <MiniTable />
      </WidgetPreviewFrame>
    )
  }

  if (widget.type === "summary") {
    return (
      <WidgetPreviewFrame>
        <MiniNarrative />
      </WidgetPreviewFrame>
    )
  }

  return (
    <WidgetPreviewFrame>
      <span className="grid h-full place-items-center text-[var(--md-accent)]">{widget.icon}</span>
    </WidgetPreviewFrame>
  )
}

export const monthlyReviewPages: ReportPage[] = [
  {
    id: "cover",
    label: "Cover",
    eyebrow: "Monthly client review",
    title: "Marlow Apparel Ltd",
    subtitle: "May 2026 · prepared June 1, 2026",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 1,
    blocks: [
      {
        id: "summary",
        type: "summary",
        title: "Summary",
        body: "A strong month: 38 bookings moved, on-time performance rose to 94.2%, and spend came in 3% under April. Two of three exceptions were resolved within a day. Watch AW26 volumes — early bookings suggest a 20% step up from September.",
        tone: "teal",
      },
    ],
  },
  {
    id: "kpis",
    label: "KPIs",
    title: "KPI overview",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 2,
    blocks: [
      {
        id: "kpi-grid",
        type: "kpi-grid",
        title: "Operating metrics",
        metrics: [
          { label: "Bookings", value: "38", change: "+6 vs Apr" },
          { label: "On-time", value: "94.2%", change: "+1.8pp" },
          { label: "Exceptions", value: "3", change: "-2" },
          { label: "Spend", value: "€184k", change: "-3%" },
        ],
      },
      {
        id: "trend",
        type: "chart",
        title: "On-time trend",
        values: [72, 78, 74, 81, 86, 84, 91, 94],
        visualization: "line",
      },
    ],
  },
  {
    id: "bookings",
    label: "Bookings",
    title: "Booking movement",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 3,
    blocks: [
      {
        id: "booking-table",
        type: "table",
        title: "Key bookings",
        rows: [
          ["Lane", "Volume", "Status"],
          ["Yantian → Felixstowe", "14", "On track"],
          ["Qingdao → Southampton", "8", "Watch"],
          ["Ningbo → Rotterdam", "6", "Clear"],
        ],
      },
    ],
  },
  {
    id: "exceptions",
    label: "Exceptions",
    title: "Exceptions",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 4,
    blocks: [
      {
        id: "exception-log",
        type: "exception-log",
        title: "Issues & resolutions",
        rows: [
          ["MD-22414", "CI/PL value mismatch", "Resolved in 18h"],
          ["MD-22455", "Export licence missing", "Open"],
          ["MD-22479", "Berth delay", "Client notified"],
        ],
      },
    ],
  },
  {
    id: "spend",
    label: "Spend",
    title: "Spend summary",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 5,
    blocks: [
      {
        id: "spend-bars",
        type: "chart",
        title: "Spend and margin",
        visualization: "mixed",
      },
    ],
  },
  {
    id: "appendix",
    label: "Appendix",
    title: "Appendix",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 6,
    blocks: [
      {
        id: "appendix-table",
        type: "table",
        title: "Included data",
        rows: [
          ["Source", "Rows"],
          ["Bookings", "38"],
          ["Invoices", "19"],
          ["Exceptions", "3"],
        ],
      },
    ],
  },
]

export const monthlyTemplatePages: ReportPage[] = [
  {
    id: "template-cover",
    label: "Cover",
    eyebrow: "Monthly client review",
    title: "{Customer name}",
    subtitle: "{Period} · prepared {Run date}",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for {Customer name}",
    pageNumber: 1,
    blocks: [
      {
        id: "written-summary",
        type: "summary",
        title: "Written summary",
        body: "Dexter writes 3–4 sentences here on each run — volumes, on-time trend, exceptions worth a conversation, and what's coming next month.",
        tone: "teal",
      },
    ],
  },
  {
    id: "template-kpis",
    label: "KPIs",
    title: "KPI overview",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for {Customer name}",
    pageNumber: 2,
    blocks: [
      {
        id: "template-kpi-grid",
        type: "kpi-grid",
        title: "KPI overview",
        metrics: [
          { label: "Bookings", value: "{Bookings}" },
          { label: "On-time", value: "{On-time}" },
          { label: "Exceptions", value: "{Exceptions}" },
          { label: "Spend", value: "{Spend}" },
        ],
      },
      {
        id: "template-chart",
        type: "chart",
        title: "Primary trend",
        visualization: "line",
      },
    ],
  },
]

const quoteFunnelSteps = [
  { stage: "Quoted", value: 92, color: "var(--md-accent)" },
  { stage: "Accepted", value: 48, color: "var(--md-green)" },
  { stage: "Booked", value: 36, color: "var(--md-blue)" },
]

const customsFunnelSteps = [
  { stage: "Docs received", value: 184, color: "var(--md-accent)" },
  { stage: "Parsed", value: 171, color: "var(--md-green)" },
  { stage: "Validated", value: 148, color: "var(--md-blue)" },
  { stage: "Filed", value: 132, color: "var(--md-amber)" },
  { stage: "Cleared", value: 118, color: "var(--md-red)" },
]

const dashboardPreviewData = [
  { period: "Jan", actual: 84, target: 92, ocean: 28, air: 8, road: 14, quoted: 72, billed: 64, margin: 18 },
  { period: "Feb", actual: 88, target: 92, ocean: 34, air: 10, road: 16, quoted: 86, billed: 78, margin: 20 },
  { period: "Mar", actual: 91, target: 92, ocean: 38, air: 13, road: 18, quoted: 78, billed: 72, margin: 15 },
  { period: "Apr", actual: 94, target: 92, ocean: 46, air: 11, road: 22, quoted: 96, billed: 84, margin: 24 },
  { period: "May", actual: 89, target: 92, ocean: 33, air: 9, road: 17, quoted: 102, billed: 92, margin: 19 },
  { period: "Jun", actual: 96, target: 92, ocean: 44, air: 12, road: 21, quoted: 90, billed: 86, margin: 22 },
]

const dashboardPreviewSeries: ChartSeries[] = [
  { key: "actual", label: "Actual", color: "var(--md-accent)" },
  { key: "target", label: "Target", color: "var(--md-blue)", dashed: true },
]

const dashboardPreviewModeSeries: ChartSeries[] = [
  { key: "ocean", label: "Ocean", color: "var(--md-accent)" },
  { key: "air", label: "Air", color: "var(--md-blue)" },
  { key: "road", label: "Road", color: "var(--md-green)" },
]

const dashboardPreviewPieData = [
  { name: "Ocean", value: 48, color: "var(--md-accent)" },
  { name: "Air", value: 24, color: "var(--md-blue)" },
  { name: "Road", value: 28, color: "var(--md-green)" },
]

function numericValue(row: ChartDataPoint, key: string) {
  const value = row[key]
  return typeof value === "number" ? value : Number(value) || 0
}

function dashboardSeriesFor(kind: VisualizationKind, options?: ReportVisualizationOptions): ChartSeries[] {
  if (kind === "mixed") return [...(options?.bars ?? [{ key: "billed", label: "Spend", color: "var(--md-accent)" }]), ...(options?.lines ?? [{ key: "margin", label: "Margin", color: "var(--md-blue)" }])]
  if (kind === "bar" || kind === "stacked-bar") return options?.series ?? dashboardPreviewModeSeries
  return options?.series ?? dashboardPreviewSeries
}

function dashboardLinePath(data: ChartDataPoint[], key: string, series: ChartSeries[]) {
  const width = 260
  const height = 124
  const padX = 14
  const padY = 16
  const values = data.flatMap((row) => series.map((item) => numericValue(row, item.key)))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const points = data.map((row, index) => {
    const x = padX + (index / Math.max(1, data.length - 1)) * (width - padX * 2)
    const y = padY + ((max - numericValue(row, key)) / range) * (height - padY * 2)
    return [x, y] as const
  })

  return {
    points,
    path: points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
    baseline: height - padY,
  }
}

function dashboardArcPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function dashboardPiePath(cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const safeEndAngle = endAngle - startAngle >= 360 ? startAngle + 359.99 : endAngle
  const startOuter = dashboardArcPoint(cx, cy, outerRadius, startAngle)
  const endOuter = dashboardArcPoint(cx, cy, outerRadius, safeEndAngle)
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0

  if (innerRadius <= 0) return `M ${cx} ${cy} L ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y} Z`

  const startInner = dashboardArcPoint(cx, cy, innerRadius, startAngle)
  const endInner = dashboardArcPoint(cx, cy, innerRadius, safeEndAngle)
  return `M ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y} L ${endInner.x} ${endInner.y} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y} Z`
}

function DashboardChartPreview({ kind, options, dashboardSize }: { kind: VisualizationKind; options?: ReportVisualizationOptions; dashboardSize: ReportDashboardSize }) {
  const data = options?.data?.length ? options.data : dashboardPreviewData
  const series = dashboardSeriesFor(kind, options)
  const showLegend = dashboardSize !== "wide" && options?.showLegend !== false && kind !== "radial" && kind !== "heatmap" && kind !== "scatter" && kind !== "funnel"

  const chart = (() => {
    if (kind === "pie") {
      const pieData = options?.pieData?.length ? options.pieData : dashboardPreviewPieData
      const total = pieData.reduce((sum, item) => sum + item.value, 0)
      const innerRadius = options?.pieInnerRadius ?? 36
      let angle = 0

      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          {pieData.map((item, index) => {
            const nextAngle = angle + (total ? (item.value / total) * 360 : 0)
            const path = dashboardPiePath(130, 62, 43, innerRadius, angle, nextAngle)
            angle = nextAngle
            return <path key={item.name} d={path} fill={item.color ?? dashboardPreviewPieData[index % dashboardPreviewPieData.length].color} stroke="var(--md-surface)" strokeWidth="3" />
          })}
        </svg>
      )
    }

    if (kind === "radial") {
      const value = options?.radialValue ?? 94
      const max = options?.radialMax ?? 100
      const circumference = 2 * Math.PI * 34
      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          <circle cx="130" cy="62" r="34" fill="none" stroke="rgba(90,103,100,0.14)" strokeWidth="12" />
          <circle cx="130" cy="62" r="34" fill="none" stroke={options?.radialColor ?? "var(--md-accent)"} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(value / max) * circumference} ${circumference}`} transform="rotate(-90 130 62)" />
          <text x="130" y="66" textAnchor="middle" className="fill-[var(--md-ink)] text-[22px] font-medium">
            {value}%
          </text>
        </svg>
      )
    }

    if (kind === "bar" || kind === "stacked-bar") {
      const maxValue = Math.max(...data.flatMap((row) => series.map((item) => numericValue(row, item.key))), 1)
      const groupWidth = 224 / data.length
      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          {[24, 62, 100].map((y) => (
            <line key={y} x1="14" x2="246" y1={y} y2={y} stroke="rgba(90,103,100,0.14)" />
          ))}
          {data.map((row, index) => {
            const x = 18 + index * groupWidth
            if (kind === "stacked-bar") {
              let y = 106
              return (
                <g key={String(row.period ?? index)}>
                  {series.map((item) => {
                    const height = (numericValue(row, item.key) / maxValue) * 54
                    y -= height
                    return <rect key={item.key} x={x + 5} y={y} width={Math.max(12, groupWidth - 12)} height={height} rx="4" fill={item.color} opacity="0.9" />
                  })}
                </g>
              )
            }
            const bars = options?.barVariant === "comparison" ? series : series.slice(0, 1)
            return (
              <g key={String(row.period ?? index)}>
                {bars.map((item, barIndex) => {
                  const width = Math.max(7, (groupWidth - 10) / bars.length)
                  const height = (numericValue(row, item.key) / maxValue) * 72
                  return <rect key={item.key} x={x + barIndex * (width + 2)} y={106 - height} width={width} height={height} rx="4" fill={item.color} />
                })}
              </g>
            )
          })}
        </svg>
      )
    }

    if (kind === "funnel") {
      const funnelData = options?.funnelData?.length ? options.funnelData : customsFunnelSteps
      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          {funnelData.slice(0, 5).map((item, index) => {
            const width = 190 - index * 26
            return <rect key={item.stage} x={(260 - width) / 2} y={18 + index * 18} width={width} height="10" rx="5" fill={item.color ?? dashboardPreviewModeSeries[index % dashboardPreviewModeSeries.length].color} />
          })}
        </svg>
      )
    }

    if (kind === "heatmap") {
      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, index) => {
            const column = index % 6
            const row = Math.floor(index / 6)
            const opacity = 0.22 + ((index * 17) % 60) / 100
            return <rect key={index} x={24 + column * 35} y={20 + row * 28} width="26" height="20" rx="5" fill="var(--md-accent)" opacity={opacity} />
          })}
        </svg>
      )
    }

    if (kind === "scatter") {
      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          {[24, 62, 100].map((y) => (
            <line key={y} x1="14" x2="246" y1={y} y2={y} stroke="rgba(90,103,100,0.14)" />
          ))}
          {[
            [54, 76, 8],
            [92, 52, 11],
            [138, 42, 7],
            [182, 72, 10],
            [214, 35, 6],
          ].map(([cx, cy, r], index) => (
            <circle key={index} cx={cx} cy={cy} r={r} fill="var(--md-accent)" opacity={0.58 + index * 0.08} />
          ))}
        </svg>
      )
    }

    if (kind === "mixed") {
      const barSeries = options?.bars ?? [{ key: "billed", label: "Spend", color: "var(--md-accent)" }]
      const lineSeries = options?.lines ?? [{ key: "margin", label: "Margin", color: "var(--md-blue)" }]
      const maxValue = Math.max(...data.flatMap((row) => [...barSeries, ...lineSeries].map((item) => numericValue(row, item.key))), 1)
      const line = dashboardLinePath(data, lineSeries[0].key, [...barSeries, ...lineSeries])
      return (
        <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
          {data.map((row, index) => {
            const height = (numericValue(row, barSeries[0].key) / maxValue) * 64
            return <rect key={String(row.period ?? index)} x={20 + index * 36} y={106 - height} width="18" height={height} rx="4" fill={barSeries[0].color} opacity="0.78" />
          })}
          <path d={line.path} fill="none" stroke={lineSeries[0].color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }

    const activeSeries = kind === "area" ? series.slice(0, 2) : series
    return (
      <svg viewBox="0 0 260 124" className="md-dashboard-chart-svg" aria-hidden="true">
        {[24, 62, 100].map((y) => (
          <line key={y} x1="14" x2="246" y1={y} y2={y} stroke="rgba(90,103,100,0.14)" />
        ))}
        {activeSeries.map((item, index) => {
          const line = dashboardLinePath(data, item.key, activeSeries)
          const areaPath = `${line.path} L ${line.points[line.points.length - 1][0].toFixed(1)} ${line.baseline} L ${line.points[0][0].toFixed(1)} ${line.baseline} Z`
          return (
            <g key={item.key}>
              {kind === "area" ? <path d={areaPath} fill={item.color} opacity={index === 0 ? "0.18" : "0.1"} /> : null}
              <path d={line.path} fill="none" stroke={item.color} strokeDasharray={item.dashed ? "6 6" : undefined} strokeWidth={item.dashed ? 2.4 : 4} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>
    )
  })()

  const legendItems = kind === "pie" ? (options?.pieData?.length ? options.pieData : dashboardPreviewPieData).map((item) => ({ label: item.name, color: item.color ?? "var(--md-accent)" })) : series.slice(0, 3).map((item) => ({ label: item.label, color: item.color }))

  return (
    <div className="md-dashboard-chart-preview">
      <div className="md-dashboard-chart-frame">{chart}</div>
      {showLegend ? (
        <div className="md-dashboard-chart-legend">
          {legendItems.map((item) => (
            <span key={item.label} className="inline-flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const reportWidgets: ReportWidget[] = [
  { id: "single-stat", title: "Single stat", description: "Big number with sparkline", group: "Stats & KPIs", type: "kpi-grid", icon: <TrendingUp className="size-5" strokeWidth={1.2} /> },
  { id: "ratio-gauge", title: "Ratio gauge", description: "Goal vs. actual", group: "Stats & KPIs", type: "chart", visualization: "radial", icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "period-delta", title: "Period delta", description: "vs. prev. period", group: "Stats & KPIs", type: "summary", icon: <TrendingUp className="size-5" strokeWidth={1.2} /> },
  { id: "line-chart", title: "Line chart", description: "Trend over time", group: "Visualizations", type: "chart", visualization: "line", icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "area-chart", title: "Area chart", description: "Volume or forecast load", group: "Visualizations", type: "chart", visualization: "area", icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "bar-chart", title: "Bar chart", description: "Single series bars", group: "Visualizations", type: "chart", visualization: "bar", visualizationOptions: { barVariant: "single" }, icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "comparison-bar-chart", title: "Comparison bars", description: "Multiple series side by side", group: "Visualizations", type: "chart", visualization: "bar", visualizationOptions: { barVariant: "comparison" }, icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "stacked-bar-chart", title: "Stacked bar", description: "Break a total into parts", group: "Visualizations", type: "chart", visualization: "stacked-bar", icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "pie-chart", title: "Pie with key", description: "Share of total with legend", group: "Visualizations", type: "chart", visualization: "pie", visualizationOptions: { pieInnerRadius: 0, showLegend: true }, icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "pie-chart-no-key", title: "Pie without key", description: "Share of total, no legend", group: "Visualizations", type: "chart", visualization: "pie", visualizationOptions: { pieInnerRadius: 0, showLegend: false }, icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "donut-chart", title: "Donut with key", description: "Compact share chart", group: "Visualizations", type: "chart", visualization: "pie", visualizationOptions: { showLegend: true }, icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "funnel-3-step", title: "3-step funnel", description: "Short conversion flow", group: "Visualizations", type: "chart", visualization: "funnel", visualizationOptions: { funnelData: quoteFunnelSteps }, icon: <ListChecks className="size-5" strokeWidth={1.2} /> },
  { id: "funnel-5-step", title: "5-step funnel", description: "Detailed operating flow", group: "Visualizations", type: "chart", visualization: "funnel", visualizationOptions: { funnelData: customsFunnelSteps }, icon: <ListChecks className="size-5" strokeWidth={1.2} /> },
  { id: "heatmap", title: "Heatmap", description: "Origin × destination", group: "Visualizations", type: "chart", visualization: "heatmap", icon: <Grid3X3 className="size-5" strokeWidth={1.2} /> },
  { id: "scatter-chart", title: "Scatter plot", description: "Outliers and tradeoffs", group: "Visualizations", type: "chart", visualization: "scatter", icon: <Map className="size-5" strokeWidth={1.2} /> },
  { id: "mixed-chart", title: "Mixed chart", description: "Bar and line together", group: "Visualizations", type: "chart", visualization: "mixed", icon: <BarChart3 className="size-5" strokeWidth={1.2} /> },
  { id: "booking-table", title: "Booking table", description: "Every booking in period", group: "Lists & tables", type: "table", icon: <Table2 className="size-5" strokeWidth={1.2} /> },
  { id: "exception-log", title: "Exception log", description: "Issues & resolutions", group: "Lists & tables", type: "exception-log", icon: <FileText className="size-5" strokeWidth={1.2} /> },
  { id: "written-summary", title: "Written summary", description: "Dexter narrative block", group: "Narrative", type: "summary", icon: <AiBeautify className="size-5" strokeWidth={1.2} /> },
]

export function ReportBlockView({
  block,
  selected,
  editable,
  dashboardSize,
  onSelect,
}: {
  block: ReportBlock
  selected?: boolean
  editable?: boolean
  dashboardSize?: ReportDashboardSize
  onSelect?: () => void
}) {
  const dashboardChartOptions: ReportVisualizationOptions | undefined =
    dashboardSize === "small" || dashboardSize === "wide"
      ? { ...block.visualizationOptions, showLegend: false, funnelShowSummary: false }
      : block.visualizationOptions

  return (
    <button
      type="button"
      data-md-report-block={block.id}
      data-md-report-block-type={block.type}
      data-md-report-visualization={block.type === "chart" ? block.visualization ?? "line" : undefined}
      data-md-dashboard-report-size={dashboardSize}
      className={cn(
        "md-report-block-view w-full rounded-[var(--md-radius-lg)] text-left transition-[background,color,box-shadow,opacity,transform] duration-200",
        dashboardSize && "md-report-block-view--dashboard",
        editable ? "cursor-pointer hover:bg-[var(--md-surface-soft)]" : "cursor-default",
        selected && "bg-[var(--md-surface-soft)] shadow-[inset_0_0_0_2px_var(--md-accent)]",
      )}
      onClick={onSelect}
    >
      {block.type === "summary" ? (
        <div className="md-report-summary-block rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-[var(--md-page-stack-gap)]">
          <div className="md-report-summary-header flex items-center gap-3">
            <AiBeautify className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} />
            <h3 className="md-report-summary-title text-[15px] font-medium text-[var(--md-ink)]">{block.title}</h3>
          </div>
          <p className="md-report-summary-body mt-3 text-[15px] leading-7 text-[var(--md-text)]">{block.body}</p>
        </div>
      ) : null}

      {block.type === "kpi-grid" ? (
        <div className="md-report-kpi-grid grid gap-3 sm:grid-cols-2">
          {(block.metrics ?? []).map((metric) => (
            <div key={metric.label} className="md-report-kpi-card rounded-[var(--md-radius-md)] bg-white p-4 shadow-[var(--md-shadow-line)]">
              <p className="md-report-kpi-label text-[12px] text-[var(--md-text)]">{metric.label}</p>
              <p className="md-report-kpi-value mt-3 text-[27px] font-medium leading-none text-[var(--md-ink)]">{metric.value}</p>
              {metric.change ? <p className="md-report-kpi-change mt-3 text-[12px] font-medium text-[var(--md-accent)]">{metric.change}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {block.type === "chart" ? (
        <div className="md-report-chart-block">
          {dashboardSize ? <DashboardChartPreview kind={block.visualization ?? "line"} options={dashboardChartOptions} dashboardSize={dashboardSize} /> : <ReportVisualizationBlock kind={block.visualization ?? "line"} title={block.title} subtitle={block.meta} compact options={dashboardChartOptions} />}
        </div>
      ) : null}

      {block.type === "table" || block.type === "exception-log" ? (
        <div className="md-report-table-block overflow-hidden rounded-[var(--md-radius-lg)] bg-white shadow-[var(--md-shadow-line)]">
          <div className="md-report-table-header px-4 py-3">
            <h3 className="md-report-table-title text-[15px] font-medium text-[var(--md-ink)]">{block.title}</h3>
          </div>
          <div className="md-report-table-body divide-y divide-[rgba(11,20,19,0.06)]">
            {(block.rows ?? []).map((row, index) => (
              <div key={`${block.id}-${index}`} data-md-report-table-row-index={index} className={cn("md-report-table-row grid grid-cols-3 gap-3 px-4 py-3 text-[12px]", index === 0 ? "bg-[var(--md-surface-soft)] font-medium text-[var(--md-text)]" : "text-[var(--md-ink)]")}>
                {row.map((cell) => (
                  <span key={cell} className="md-report-table-cell truncate">
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {block.type === "spend" ? (
        <div className="md-report-spend-block rounded-[var(--md-radius-lg)] bg-white p-4 shadow-[var(--md-shadow-line)]">
          <h3 className="md-report-spend-title text-[15px] font-medium text-[var(--md-ink)]">{block.title}</h3>
          <div className="md-report-spend-body mt-4 space-y-3">
            {(block.rows ?? []).map((row, index) => (
              <div key={row.join("-")} className="md-report-spend-row grid grid-cols-[110px_1fr_48px] items-center gap-3 text-[12px]">
                <span className="truncate text-[var(--md-text)]">{row[0]}</span>
                <span className="h-3 overflow-hidden rounded-full bg-[rgba(90,103,100,0.1)]">
                  <span className="block h-full rounded-full bg-[var(--md-accent)]" style={{ width: `${76 - index * 14}%` }} />
                </span>
                <span className="text-right font-medium text-[var(--md-ink)]">{row[2]}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </button>
  )
}

function DataSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly { id: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <label className="grid min-w-0 gap-2 text-[12px] font-medium text-[var(--md-text)]" htmlFor={id}>
      <span>{label}</span>
      <span className="relative block">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full appearance-none truncate rounded-[var(--md-radius-md)] border-0 bg-white/[0.82] px-3 pe-9 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-[background,box-shadow] duration-200 focus:bg-white focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_0_1px_var(--md-accent),0_10px_18px_rgba(42,52,50,0.07)]"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.5} aria-hidden="true" />
      </span>
    </label>
  )
}

export function ReportBlockDataEditorDialog({
  block,
  open,
  onOpenChange,
  onSave,
}: {
  block?: ReportBlock
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (block: ReportBlock) => void
}) {
  const [draft, setDraft] = useState<ReportBlockDataSelection>(() => resolveDataSelection(block))

  useEffect(() => {
    if (open) setDraft(resolveDataSelection(block))
  }, [block, open])

  const previewBlock = useMemo(() => (block ? applyReportBlockDataSelection(block, draft) : undefined), [block, draft])

  if (!block || !previewBlock) return null

  function updateDraft(key: keyof ReportBlockDataSelection, value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-24px)] !w-[calc(100vw-24px)] !max-w-[920px] grid-rows-none flex-col overflow-hidden rounded-[var(--md-radius-2xl)] border-0 bg-[rgba(251,253,253,0.97)] p-0 text-[var(--md-ink)] shadow-[0_24px_90px_rgba(42,52,50,0.22),var(--md-shadow-line)] backdrop-blur-[20px] sm:!w-[calc(100vw-32px)] lg:!w-[920px]"
      >
        <DialogHeader className="border-0 px-4 pb-0 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[18px] font-medium leading-6 tracking-normal text-[var(--md-ink)]">Choose data</DialogTitle>
              <DialogDescription className="mt-2 max-w-[560px] text-[13px] leading-5 text-[var(--md-text)]">
                Pick the source, metric, period, and breakdown this block should show.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 rounded-[var(--md-radius-sm)] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]">
                <X className="size-4" strokeWidth={1.5} />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4 pt-4 sm:px-5 sm:pb-5 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-3 rounded-[var(--md-radius-xl)] bg-[linear-gradient(180deg,rgba(226,238,235,0.76),rgba(247,251,250,0.78))] p-3 shadow-[var(--md-shadow-soft)] sm:grid-cols-2 lg:grid-cols-1">
            <DataSelect id="report-data-source" label="Source" value={draft.source} options={reportDataSources} onChange={(value) => updateDraft("source", value)} />
            <DataSelect id="report-data-metric" label="Metric" value={draft.metric} options={reportDataMetrics} onChange={(value) => updateDraft("metric", value)} />
            <DataSelect id="report-data-period" label="Period" value={draft.period} options={reportDataPeriods} onChange={(value) => updateDraft("period", value)} />
            <DataSelect id="report-data-breakdown" label="Breakdown" value={draft.breakdown} options={reportDataBreakdowns} onChange={(value) => updateDraft("breakdown", value)} />
          </div>

          <div className="md-report-data-editor-preview min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-soft)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[var(--md-subtle)]">Preview</p>
                <p className="mt-1 truncate text-[13px] font-medium text-[var(--md-ink)]">{reportDataSummary(draft)}</p>
              </div>
              <span className="shrink-0 rounded-[var(--md-radius-md)] bg-white/76 px-2.5 py-1 text-[11.5px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">Live</span>
            </div>
            <div className="min-w-0 overflow-hidden rounded-[var(--md-radius-lg)]">
              <ReportBlockView block={previewBlock} />
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 flex-col-reverse gap-2 rounded-b-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface-soft)] px-4 py-3 shadow-[var(--md-stroke-top)] sm:flex-row sm:justify-end sm:px-5 sm:py-4">
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-10 w-full rounded-[var(--md-radius-md)] px-4 text-[13px] font-medium text-[var(--md-text)] hover:bg-white/70 sm:w-auto">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="h-10 w-full rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_20px_var(--md-accent-a18)] hover:bg-[var(--md-accent)]/88 sm:w-auto"
            onClick={() => {
              onSave(applyReportBlockDataSelection(block, draft))
              onOpenChange(false)
            }}
          >
            Apply data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReportDocumentPage({
  page,
  totalPages,
  selectedBlockId,
  editable = false,
  template = false,
  onSelectBlock,
  onDropWidget,
  className,
}: {
  page: ReportPage
  totalPages: number
  selectedBlockId?: string
  editable?: boolean
  template?: boolean
  onSelectBlock?: (block: ReportBlock) => void
  onDropWidget?: (widgetId: string, pageId: string) => void
  className?: string
}) {
  return (
    <section
      data-md-report-page={page.id}
      className={cn(
        "relative mx-auto flex aspect-[794/1123] w-full max-w-[794px] flex-col bg-[var(--md-surface)] px-[7.2%] py-[7%] shadow-[0_22px_70px_rgba(42,52,50,0.18),var(--md-shadow-line)]",
        template && "shadow-[0_0_0_3px_var(--md-accent),0_22px_70px_rgba(42,52,50,0.18),var(--md-shadow-line)]",
        className,
      )}
      onDragOver={(event) => {
        if (onDropWidget) event.preventDefault()
      }}
      onDrop={(event) => {
        const widgetId = event.dataTransfer.getData("application/multideck-widget")
        if (widgetId && onDropWidget) onDropWidget(widgetId, page.id)
      }}
    >
      <header className="flex items-center justify-between gap-[var(--md-gap-xl)]">
        <div className="flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)]">
            <span className="grid gap-[2px]">
              <span className="block h-1 w-4 rounded-full bg-[var(--md-subtle)]" />
              <span className="block h-1 w-4 rounded-full bg-[var(--md-accent)]" />
            </span>
          </span>
          <strong className="text-[18px] font-medium text-[var(--md-ink)]">multideck</strong>
        </div>
        <p className="text-[13px] text-[var(--md-subtle)]">{page.preparedBy}</p>
      </header>

      <div className={page.pageNumber === 1 ? "mt-[31%]" : "mt-16"}>
        {page.eyebrow ? <p className="mb-[var(--md-page-stack-gap)] text-[15px] font-medium text-[var(--md-accent)]">{page.eyebrow}</p> : null}
        <h1 className={cn("max-w-[540px] font-medium tracking-normal text-[var(--md-ink)]", page.pageNumber === 1 ? "text-[44px] leading-[1.03]" : "text-[24px] leading-8")}>{page.title}</h1>
        {page.subtitle ? <p className="mt-[var(--md-page-stack-gap)] text-[20px] leading-7 text-[var(--md-text)]">{page.subtitle}</p> : null}
      </div>

      <div className={cn("grid gap-[var(--md-page-stack-gap)]", page.pageNumber === 1 ? "mt-[calc(var(--md-page-section-gap)+var(--md-gap-lg))]" : "mt-[var(--md-page-section-gap)]")}>
        {page.blocks.map((block) => (
          <ReportBlockView
            key={block.id}
            block={block}
            editable={editable}
            selected={selectedBlockId === block.id}
            onSelect={() => onSelectBlock?.(block)}
          />
        ))}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-4 pt-8 text-[12px] text-[var(--md-subtle)]">
        <span>{page.footer}</span>
        <span>
          Page {page.pageNumber}{template ? null : ` of ${totalPages}`}
        </span>
      </footer>
    </section>
  )
}

export function ReportPageThumbnailRail({
  pages,
  activePageId,
  onChange,
  className,
}: {
  pages: ReportPage[]
  activePageId: string
  onChange: (pageId: string) => void
  className?: string
}) {
  return (
    <aside className={cn("md-scrollbar flex gap-4 overflow-x-auto px-3 py-3 lg:h-[calc(100vh-76px)] lg:w-[190px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden", className)}>
      {pages.map((page) => {
        const active = activePageId === page.id
        return (
          <button key={page.id} type="button" className="group shrink-0 text-center" onClick={() => onChange(page.id)}>
            <span
              className={cn(
                "block aspect-[1.45] w-[136px] rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 group-hover:scale-[1.01] group-hover:bg-white",
                active && "shadow-[inset_0_0_0_3px_var(--md-accent),0_10px_22px_rgba(42,52,50,0.10)]",
              )}
            >
              <span className={cn("block h-1.5 rounded-full", active ? "w-8 bg-[var(--md-accent)]" : "w-11 bg-[rgba(90,103,100,0.18)]")} />
              <span className="mt-2 block h-1.5 w-24 rounded-full bg-[rgba(90,103,100,0.13)]" />
              <span className="mt-2 block h-1.5 w-16 rounded-full bg-[rgba(90,103,100,0.11)]" />
            </span>
            <span className={cn("mt-2 block text-[13px] font-medium", active ? "text-[var(--md-ink)]" : "text-[var(--md-text)]")}>
              {page.pageNumber} · {page.label}
            </span>
          </button>
        )
      })}
    </aside>
  )
}

export function ReportPageControls({
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="inline-flex items-center rounded-[var(--md-radius-lg)] bg-white/70 p-1 shadow-[var(--md-shadow-line)]">
      <Button type="button" variant="ghost" size="icon-sm" className="rounded-[var(--md-radius-md)]" disabled={page <= 1} onClick={onPrevious} aria-label="Previous page">
        <ChevronLeft className="size-4" strokeWidth={1.3} />
      </Button>
      <span className="px-3 text-[12px] font-medium text-[var(--md-text)]">
        {page} / {totalPages}
      </span>
      <Button type="button" variant="ghost" size="icon-sm" className="rounded-[var(--md-radius-md)]" disabled={page >= totalPages} onClick={onNext} aria-label="Next page">
        <ChevronRight className="size-4" strokeWidth={1.3} />
      </Button>
    </div>
  )
}

export function ReportWidgetPalette({
  widgets,
  query,
  onQueryChange,
  activeWidgetId,
  onAddWidget,
  onDropWidget,
  onDragWidgetStart,
  onDragWidgetEnd,
  presentation = "sidebar",
  helperText,
  className,
}: {
  widgets: ReportWidget[]
  query: string
  onQueryChange: (value: string) => void
  activeWidgetId?: string
  onAddWidget: (widget: ReportWidget) => void
  onDropWidget?: (widget: ReportWidget, point: { clientX: number; clientY: number }) => void
  onDragWidgetStart?: (widget: ReportWidget) => void
  onDragWidgetEnd?: () => void
  presentation?: "sidebar" | "inline"
  helperText?: string
  className?: string
}) {
  const filteredWidgets = widgets.filter((widget) => `${widget.title} ${widget.description} ${widget.group}`.toLowerCase().includes(query.toLowerCase()))
  const groups = Array.from(new Set(filteredWidgets.map((widget) => widget.group)))
  const description = helperText ?? "Drag any widget onto a page. It picks up this report's scope and period."
  const canDragWidgets = Boolean(onDropWidget)
  const content = (
    <div className={cn(presentation === "sidebar" ? "md-scrollbar min-h-0 flex-1 overflow-y-auto p-[var(--md-page-stack-gap)]" : "p-0")}>
      <p className="text-[14px] leading-6 text-[var(--md-text)]">{description}</p>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-text)]" strokeWidth={1.3} />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search widgets..."
          className="h-11 rounded-[var(--md-radius-md)] border-0 bg-white/45 pl-10 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-text)]"
        />
      </div>

      <div className="mt-[var(--md-gap-xl)] grid gap-[var(--md-page-section-gap)]">
        {groups.map((group) => (
          <section key={group}>
            <h3 className="text-[13px] font-medium text-[var(--md-text)]">{group}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {filteredWidgets
	                .filter((widget) => widget.group === group)
	                .map((widget) => {
	                  const selected = activeWidgetId === widget.id
	                  return (
	                    <button
	                      key={widget.id}
	                      type="button"
	                      draggable={canDragWidgets}
	                      className={cn(
	                        "group rounded-[var(--md-radius-lg)] bg-[var(--md-report-preview-bg)] p-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:scale-[1.01] hover:bg-[var(--md-report-preview-hover-bg)]",
	                        selected && "shadow-[inset_0_0_0_2px_var(--md-accent),0_8px_20px_rgba(42,52,50,0.08)]",
	                      )}
	                      onDragStart={(event) => {
	                        if (!canDragWidgets) {
	                          event.preventDefault()
	                          return
	                        }
	                        event.dataTransfer.setData("application/multideck-widget", widget.id)
	                        event.dataTransfer.effectAllowed = "copy"
	                        onDragWidgetStart?.(widget)
	                      }}
                      onDragEnd={(event) => {
                        onDragWidgetEnd?.()
	                        if (!onDropWidget || event.dataTransfer.dropEffect !== "none") return
	                        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-md-dashboard-dropzone]")
	                        if (target) onDropWidget(widget, { clientX: event.clientX, clientY: event.clientY })
	                      }}
	                      onClick={() => onAddWidget(widget)}
	                    >
	                      <span className="relative block">
	                        <WidgetMiniPreview widget={widget} />
	                        {canDragWidgets ? <GripVertical className="absolute right-2 top-2 size-3 text-[var(--md-subtle)] opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} /> : null}
	                      </span>
                      <span className="mt-3 block text-[14px] font-medium leading-5 text-[var(--md-ink)]">{widget.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-5 text-[var(--md-text)]">{widget.description}</span>
                    </button>
                  )
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )

  if (presentation === "inline") {
    return (
      <div data-md-report-widget-palette="inline" className={cn("text-[var(--md-ink)]", className)}>
        {content}
      </div>
    )
  }

  return (
    <aside data-md-report-widget-palette="sidebar" className={cn("flex h-full flex-col bg-[var(--md-sidebar-bg)] shadow-[inset_1px_0_0_rgba(11,20,19,0.07)]", className)}>
      <div className="grid grid-cols-2 shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)]">
        <button type="button" className="relative h-16 text-[15px] font-medium text-[var(--md-ink)] after:absolute after:bottom-0 after:left-6 after:right-6 after:h-0.5 after:rounded-full after:bg-[var(--md-accent)]">
          Widgets
        </button>
        <button type="button" className="h-16 text-[15px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]">
          Settings
        </button>
      </div>

      {content}
    </aside>
  )
}

export function createReportBlockFromWidget(widget: ReportWidget, index: number): ReportBlock {
  const id = `${widget.id}-${Date.now()}-${index}`

  if (widget.type === "kpi-grid") {
    return {
      id,
      type: "kpi-grid",
      title: widget.title,
      metrics: [
        { label: "Bookings", value: "{Value}", change: "vs prev." },
        { label: "Target", value: "{Goal}" },
      ],
    }
  }

  if (widget.type === "chart") {
    return { id, type: "chart", title: widget.title, visualization: widget.visualization ?? "line", visualizationOptions: widget.visualizationOptions }
  }

  if (widget.type === "table" || widget.type === "exception-log") {
    return {
      id,
      type: widget.type,
      title: widget.title,
      rows: [
        ["Column", "Value", "Status"],
        ["{Field}", "{Metric}", "{State}"],
        ["{Field}", "{Metric}", "{State}"],
      ],
    }
  }

  if (widget.type === "spend") {
    return {
      id,
      type: "spend",
      title: widget.title,
      rows: [
        ["Stage one", "{Value}", "+0%"],
        ["Stage two", "{Value}", "-0%"],
        ["Stage three", "{Value}", "+0%"],
      ],
    }
  }

  return {
    id,
    type: "summary",
    title: widget.title,
    body: "Dexter will write this section from the selected report scope, period, and booking data when the report is generated.",
    tone: "teal",
  }
}
