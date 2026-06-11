import type { CSSProperties, ReactNode } from "react"
import {
  BarChart3,
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
  Sparkles,
  Table2,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { GeneratedReport, GeneratedReportStatus, ReportTemplate } from "@/data/multideck-data"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"
import { ReportVisualizationBlock, type ReportVisualizationOptions, type VisualizationKind } from "./chart-components"

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
          <span className="bg-[rgba(14,125,116,0.38)]" style={{ width: `${bar[1]}%` }} />
          <span className="bg-[rgba(90,103,100,0.12)]" style={{ width: `${bar[2]}%` }} />
        </div>
      ))}
    </div>
  )
}

function ReportPreviewGraphic({ template }: { template: ReportTemplate }) {
  return (
    <div className="flex h-[118px] flex-col justify-between rounded-[var(--md-radius-lg)] bg-[rgba(223,234,231,0.72)] p-4 shadow-[var(--md-shadow-line)]">
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
        <div className="flex items-center gap-5">
          <span
            className="size-12 rounded-full"
            style={{
              background: "conic-gradient(var(--md-accent) 0deg 275deg, rgba(90,103,100,0.13) 275deg 360deg)",
              boxShadow: "inset 0 0 0 8px rgba(223,234,231,0.95)",
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
          <span className="rounded-full bg-[rgba(14,125,116,0.1)] px-3 py-1 text-[12px] font-medium text-[var(--md-text)]">{template.cadence}</span>
          <span className="rounded-full bg-[rgba(14,125,116,0.1)] px-3 py-1 text-[12px] font-medium text-[var(--md-text)]">{template.format}</span>
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
        "group flex min-h-[336px] flex-col items-center justify-center rounded-[var(--md-radius-xl)] border-0 border-dashed bg-transparent p-5 text-center shadow-[inset_0_0_0_1px_rgba(90,103,100,0.16)] transition-all duration-200 hover:bg-white/24 hover:shadow-[inset_0_0_0_1px_rgba(14,125,116,0.22),0_0_0_3px_rgba(14,125,116,0.06)]",
        className,
      )}
      onClick={onCreate}
    >
      <span className="grid size-[52px] place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)] transition-transform duration-200 group-hover:scale-[1.03]">
        <Plus className="size-5" strokeWidth={1.5} />
      </span>
      <span className="mt-8 text-[15px] font-medium text-[var(--md-ink)]">New template</span>
      <span className="mt-5 max-w-[230px] text-[13px] leading-5 text-[var(--md-text)]">Start blank, or let Artie draft one from a report you already sent</span>
    </button>
  )
}

function ReportStatusPill({ status }: { status: GeneratedReportStatus }) {
  const label = status === "Generating" ? "• Generating" : status
  return <StatusPill tone={reportStatusTone[status]} className={cn(status === "Generating" && "gap-1 bg-[rgba(74,125,156,0.1)]")}>{label}</StatusPill>
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
  return (
    <Surface padding="none" className={cn("overflow-hidden rounded-[var(--md-radius-xl)]", className)}>
      <Table className="min-w-[980px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.07)] hover:bg-transparent">
            <TableHead className="h-12 px-6 text-[13px] font-medium text-[var(--md-text)]">Report</TableHead>
            <TableHead className="h-12 px-6 text-[13px] font-medium text-[var(--md-text)]">Scope</TableHead>
            <TableHead className="h-12 px-6 text-[13px] font-medium text-[var(--md-text)]">Period</TableHead>
            <TableHead className="h-12 px-6 text-[13px] font-medium text-[var(--md-text)]">Created</TableHead>
            <TableHead className="h-12 px-6 text-[13px] font-medium text-[var(--md-text)]">Status</TableHead>
            <TableHead className="h-12 px-6 text-right text-[13px] font-medium text-[var(--md-text)]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => {
            const isReady = report.status === "Ready"
            return (
              <TableRow key={report.id} className="h-[82px] border-[rgba(11,20,19,0.06)] hover:bg-[rgba(255,255,255,0.36)]">
                <TableCell className="px-6">
                  <p className="text-[15px] font-medium leading-5 text-[var(--md-ink)]">{report.title}</p>
                  <p className="mt-1 text-[13px] text-[var(--md-text)]">{report.subtitle}</p>
                </TableCell>
                <TableCell className="px-6 text-[14px] text-[var(--md-text)]">{report.scope}</TableCell>
                <TableCell className="px-6 text-[14px] font-medium text-[var(--md-ink)]">{report.period}</TableCell>
                <TableCell className="px-6 text-[14px] text-[var(--md-text)]">{report.created}</TableCell>
                <TableCell className="px-6">
                  <ReportStatusPill status={report.status} />
                </TableCell>
                <TableCell className="px-6">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 rounded-[var(--md-radius-md)] bg-white/35 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65 disabled:text-[var(--md-subtle)]"
                      disabled={!isReady}
                      onClick={() => onView?.(report)}
                    >
                      <Eye data-icon="inline-start" strokeWidth={1.2} />
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 rounded-[var(--md-radius-md)] bg-white/35 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65 disabled:text-[var(--md-subtle)]"
                      disabled={!isReady}
                      onClick={() => onDownload?.(report)}
                    >
                      <Download data-icon="inline-start" strokeWidth={1.2} />
                      PDF
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Surface>
  )
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
          <span className="h-2 rounded-full bg-[rgba(14,125,116,0.28)]" />
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
        body: "A strong month: 38 shipments moved, on-time performance rose to 94.2%, and spend came in 3% under April. Two of three exceptions were resolved within a day. Watch AW26 volumes — early bookings suggest a 20% step up from September.",
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
          { label: "Shipments", value: "38", change: "+6 vs Apr" },
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
    id: "shipments",
    label: "Shipments",
    title: "Shipment movement",
    preparedBy: "Prepared by Northwind Forwarding",
    footer: "Confidential — prepared for Marlow Apparel Ltd",
    pageNumber: 3,
    blocks: [
      {
        id: "shipment-table",
        type: "table",
        title: "Key shipments",
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
          ["Shipments", "38"],
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
        body: "Artie writes 3–4 sentences here on each run — volumes, on-time trend, exceptions worth a conversation, and what's coming next month.",
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
          { label: "Shipments", value: "{Shipments}" },
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
  { id: "shipment-table", title: "Shipment table", description: "Every shipment in period", group: "Lists & tables", type: "table", icon: <Table2 className="size-5" strokeWidth={1.2} /> },
  { id: "exception-log", title: "Exception log", description: "Issues & resolutions", group: "Lists & tables", type: "exception-log", icon: <FileText className="size-5" strokeWidth={1.2} /> },
  { id: "written-summary", title: "Written summary", description: "Artie narrative block", group: "Narrative", type: "summary", icon: <Sparkles className="size-5" strokeWidth={1.2} /> },
]

function ReportBlockView({
  block,
  selected,
  editable,
  onSelect,
}: {
  block: ReportBlock
  selected?: boolean
  editable?: boolean
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[var(--md-radius-lg)] text-left transition-all duration-200",
        editable ? "cursor-pointer hover:bg-[var(--md-surface-soft)]" : "cursor-default",
        selected && "bg-[var(--md-surface-soft)] shadow-[inset_0_0_0_2px_var(--md-accent)]",
      )}
      onClick={onSelect}
    >
      {block.type === "summary" ? (
        <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-5">
          <div className="flex items-center gap-3">
            <Sparkles className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} />
            <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{block.title}</h3>
          </div>
          <p className="mt-3 text-[15px] leading-7 text-[var(--md-text)]">{block.body}</p>
        </div>
      ) : null}

      {block.type === "kpi-grid" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(block.metrics ?? []).map((metric) => (
            <div key={metric.label} className="rounded-[var(--md-radius-md)] bg-white p-4 shadow-[var(--md-shadow-line)]">
              <p className="text-[12px] text-[var(--md-text)]">{metric.label}</p>
              <p className="mt-3 text-[27px] font-medium leading-none text-[var(--md-ink)]">{metric.value}</p>
              {metric.change ? <p className="mt-3 text-[12px] font-medium text-[var(--md-accent)]">{metric.change}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {block.type === "chart" ? (
        <ReportVisualizationBlock kind={block.visualization ?? "line"} title={block.title} compact options={block.visualizationOptions} />
      ) : null}

      {block.type === "table" || block.type === "exception-log" ? (
        <div className="overflow-hidden rounded-[var(--md-radius-lg)] bg-white shadow-[var(--md-shadow-line)]">
          <div className="px-4 py-3">
            <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{block.title}</h3>
          </div>
          <div className="divide-y divide-[rgba(11,20,19,0.06)]">
            {(block.rows ?? []).map((row, index) => (
              <div key={`${block.id}-${index}`} className={cn("grid grid-cols-3 gap-3 px-4 py-3 text-[12px]", index === 0 ? "bg-[var(--md-surface-soft)] font-medium text-[var(--md-text)]" : "text-[var(--md-ink)]")}>
                {row.map((cell) => (
                  <span key={cell} className="truncate">
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {block.type === "spend" ? (
        <div className="rounded-[var(--md-radius-lg)] bg-white p-4 shadow-[var(--md-shadow-line)]">
          <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{block.title}</h3>
          <div className="mt-4 space-y-3">
            {(block.rows ?? []).map((row, index) => (
              <div key={row.join("-")} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 text-[12px]">
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
      <header className="flex items-center justify-between gap-6">
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
        {page.eyebrow ? <p className="mb-5 text-[15px] font-medium text-[var(--md-accent)]">{page.eyebrow}</p> : null}
        <h1 className={cn("max-w-[540px] font-medium tracking-normal text-[var(--md-ink)]", page.pageNumber === 1 ? "text-[44px] leading-[1.03]" : "text-[24px] leading-8")}>{page.title}</h1>
        {page.subtitle ? <p className="mt-5 text-[20px] leading-7 text-[var(--md-text)]">{page.subtitle}</p> : null}
      </div>

      <div className={cn("grid gap-5", page.pageNumber === 1 ? "mt-12" : "mt-8")}>
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
                "block aspect-[1.45] w-[136px] rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-white",
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
  className,
}: {
  widgets: ReportWidget[]
  query: string
  onQueryChange: (value: string) => void
  activeWidgetId?: string
  onAddWidget: (widget: ReportWidget) => void
  className?: string
}) {
  const filteredWidgets = widgets.filter((widget) => `${widget.title} ${widget.description} ${widget.group}`.toLowerCase().includes(query.toLowerCase()))
  const groups = Array.from(new Set(filteredWidgets.map((widget) => widget.group)))

  return (
    <aside className={cn("flex h-full flex-col bg-[var(--md-sidebar-bg)] shadow-[inset_1px_0_0_rgba(11,20,19,0.07)]", className)}>
      <div className="grid grid-cols-2 shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)]">
        <button type="button" className="relative h-16 text-[15px] font-medium text-[var(--md-ink)] after:absolute after:bottom-0 after:left-6 after:right-6 after:h-0.5 after:rounded-full after:bg-[var(--md-accent)]">
          Widgets
        </button>
        <button type="button" className="h-16 text-[15px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]">
          Settings
        </button>
      </div>

      <div className="md-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
        <p className="text-[14px] leading-6 text-[var(--md-text)]">Drag any widget onto a page. It picks up this report's scope and period.</p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-text)]" strokeWidth={1.3} />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search widgets..."
            className="h-11 rounded-[var(--md-radius-md)] border-0 bg-white/45 pl-10 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-text)]"
          />
        </div>

        <div className="mt-6 grid gap-7">
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
                        draggable
                        className={cn(
                          "group rounded-[var(--md-radius-lg)] bg-[rgba(223,234,231,0.72)] p-3 text-left shadow-[var(--md-shadow-line)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[rgba(233,242,240,0.92)]",
                          selected && "shadow-[inset_0_0_0_2px_var(--md-accent),0_8px_20px_rgba(42,52,50,0.08)]",
                        )}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/multideck-widget", widget.id)
                          event.dataTransfer.effectAllowed = "copy"
                        }}
                        onClick={() => onAddWidget(widget)}
                      >
                        <span className="relative block">
                          <WidgetMiniPreview widget={widget} />
                          <GripVertical className="absolute right-2 top-2 size-3 text-[var(--md-subtle)] opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
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
        { label: "Shipments", value: "{Value}", change: "vs prev." },
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
    body: "Artie will write this section from the selected report scope, period, and shipment data when the report is generated.",
    tone: "teal",
  }
}
