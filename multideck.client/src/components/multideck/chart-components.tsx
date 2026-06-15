import { Fragment, useMemo, type ReactNode } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  Label,
  Line,
  LineChart,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { SectionHeader, Surface } from "./surface"
import { StatusPill } from "./status-pill"

export type VisualizationKind = "line" | "area" | "bar" | "stacked-bar" | "pie" | "funnel" | "heatmap" | "radial" | "scatter" | "mixed"
export type ChartDataPoint = Record<string, string | number | undefined>
export type ChartSeries = {
  key: string
  label: string
  color: string
  dashed?: boolean
  stackId?: string
}

export type BreakdownDataPoint = ChartDataPoint & {
  name: string
  value: number
  color?: string
}

export type FunnelDataPoint = ChartDataPoint & {
  stage: string
  value: number
  color?: string
}

export type HeatmapRow = {
  label: string
  values: Record<string, number>
}

export type ReportVisualizationOptions = {
  data?: ChartDataPoint[]
  series?: ChartSeries[]
  xKey?: string
  bars?: ChartSeries[]
  lines?: ChartSeries[]
  barVariant?: "single" | "comparison"
  showLegend?: boolean
  pieData?: BreakdownDataPoint[]
  pieNameKey?: string
  pieValueKey?: string
  pieInnerRadius?: number
  pieOuterRadius?: number
  pieCenterLabel?: string
  pieCenterValueFormatter?: (value: number) => string
  funnelData?: FunnelDataPoint[]
  funnelShowSummary?: boolean
  heatmapRows?: HeatmapRow[]
  heatmapColumns?: string[]
  heatmapValueFormatter?: (value: number) => string
  radialValue?: number
  radialMax?: number
  radialLabel?: string
  radialColor?: string
  scatterData?: ChartDataPoint[]
  scatterXKey?: string
  scatterYKey?: string
  scatterZKey?: string
  scatterColor?: string
}

type ChartCardProps = {
  className?: string
  compact?: boolean
  title?: string
  subtitle?: string
}

type CartesianChartProps = ChartCardProps & {
  data?: ChartDataPoint[]
  series?: ChartSeries[]
  xKey?: string
  showLegend?: boolean
}

const chartTooltip = <ChartTooltipContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]" />
const chartGridColor = "rgba(90, 103, 100, 0.16)"
const axisTick = { fill: "var(--md-text)", fontSize: 11 }
const chartPalette = ["var(--md-accent)", "var(--md-blue)", "var(--md-green)", "var(--md-amber)", "var(--md-red)"]

const defaultTrendData = [
  { period: "Jan", actual: 88, target: 92 },
  { period: "Feb", actual: 91, target: 92 },
  { period: "Mar", actual: 89, target: 92 },
  { period: "Apr", actual: 93, target: 92 },
  { period: "May", actual: 94, target: 92 },
  { period: "Jun", actual: 96, target: 92 },
]

const defaultVolumeData = [
  { period: "Jan", ocean: 34, air: 9, road: 13 },
  { period: "Feb", ocean: 42, air: 7, road: 16 },
  { period: "Mar", ocean: 39, air: 12, road: 18 },
  { period: "Apr", ocean: 48, air: 10, road: 15 },
  { period: "May", ocean: 52, air: 14, road: 17 },
  { period: "Jun", ocean: 46, air: 11, road: 20 },
]

const defaultSpendData = [
  { period: "Jan", quoted: 124, billed: 118, margin: 18 },
  { period: "Feb", quoted: 132, billed: 129, margin: 17 },
  { period: "Mar", quoted: 141, billed: 136, margin: 19 },
  { period: "Apr", quoted: 156, billed: 151, margin: 16 },
  { period: "May", quoted: 184, billed: 178, margin: 18 },
  { period: "Jun", quoted: 172, billed: 166, margin: 20 },
]

const defaultModeBreakdown: BreakdownDataPoint[] = [
  { name: "Ocean", value: 64, color: "var(--md-accent)" },
  { name: "Air", value: 21, color: "var(--md-blue)" },
  { name: "Road", value: 15, color: "var(--md-green)" },
]

const defaultFunnelData: FunnelDataPoint[] = [
  { stage: "Docs received", value: 184, color: "var(--md-accent)" },
  { stage: "Auto-parsed", value: 171, color: "var(--md-green)" },
  { stage: "Ready to file", value: 136, color: "var(--md-blue)" },
  { stage: "Cleared", value: 118, color: "var(--md-amber)" },
]

const defaultHeatmapColumns = ["UK", "EU", "US", "GCC"]
const defaultHeatmapRows: HeatmapRow[] = [
  { label: "China", values: { UK: 34, EU: 28, US: 16, GCC: 12 } },
  { label: "Turkey", values: { UK: 16, EU: 22, US: 4, GCC: 18 } },
  { label: "Germany", values: { UK: 12, EU: 31, US: 9, GCC: 6 } },
  { label: "US", values: { UK: 8, EU: 13, US: 4, GCC: 5 } },
]

const defaultCarrierEfficiency = [
  { carrier: "COSCO", dwell: 9, onTime: 94, volume: 42 },
  { carrier: "Maersk", dwell: 12, onTime: 91, volume: 35 },
  { carrier: "ONE", dwell: 7, onTime: 97, volume: 24 },
  { carrier: "DHL", dwell: 5, onTime: 96, volume: 18 },
  { carrier: "Evergreen", dwell: 16, onTime: 86, volume: 28 },
]

const defaultTrendSeries: ChartSeries[] = [
  { key: "actual", label: "Actual", color: "var(--md-accent)" },
  { key: "target", label: "Target", color: "var(--md-blue)", dashed: true },
]

const defaultModeSeries: ChartSeries[] = [
  { key: "ocean", label: "Ocean", color: "var(--md-accent)" },
  { key: "air", label: "Air", color: "var(--md-blue)" },
  { key: "road", label: "Road", color: "var(--md-green)" },
]

const defaultSpendSeries: ChartSeries[] = [
  { key: "quoted", label: "Quoted", color: "var(--md-accent)", stackId: "cost" },
  { key: "billed", label: "Billed", color: "var(--md-blue)", stackId: "cost" },
  { key: "margin", label: "Margin", color: "var(--md-green)", stackId: "cost" },
]

function toChartConfig(series: ChartSeries[], extra?: ChartConfig): ChartConfig {
  return {
    ...Object.fromEntries(series.map((item) => [item.key, { label: item.label, color: item.color }])),
    ...extra,
  }
}

function chartHeight(compact?: boolean) {
  return compact ? "md-chart-container h-[155px] min-w-0 max-w-full overflow-hidden" : "md-chart-container h-[250px] min-w-0 max-w-full overflow-hidden"
}

function ChartCanvas({ compact, children }: { compact?: boolean; children: ReactNode }) {
  return (
    <div className={cn("md-chart-canvas min-w-0 overflow-hidden rounded-[var(--md-radius-lg)] bg-white/54 p-3 shadow-[var(--md-shadow-line)]", compact && "rounded-[var(--md-radius-md)] p-2")}>
      {children}
    </div>
  )
}

function VisualizationShell({
  title,
  subtitle,
  compact,
  className,
  children,
  footer,
}: {
  title: string
  subtitle: string
  compact?: boolean
  className?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const content = (
    <>
      <div className="md-chart-header flex items-start justify-between gap-3">
        <SectionHeader title={title} meta={subtitle} />
        {!compact ? <StatusPill tone="teal">Report-ready</StatusPill> : null}
      </div>
      <div className="md-chart-body mt-4">{children}</div>
      {footer ? <div className="md-chart-footer mt-4">{footer}</div> : null}
    </>
  )

  if (compact) {
    return <div className={cn("md-chart-visualization-shell rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4", className)}>{content}</div>
  }

  return (
    <Surface padding="md" className={cn("md-chart-visualization-shell rounded-[var(--md-radius-xl)]", className)}>
      {content}
    </Surface>
  )
}

function LegendRow({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="md-chart-legend flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
          <span className="size-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function maybeLegend(showLegend: boolean | undefined, series: ChartSeries[]) {
  if (showLegend === false) return null
  return <LegendRow items={series.map((item) => ({ label: item.label, color: item.color }))} />
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function describePieSegment(cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const safeEndAngle = endAngle - startAngle >= 360 ? startAngle + 359.99 : endAngle
  const startOuter = polarPoint(cx, cy, outerRadius, startAngle)
  const endOuter = polarPoint(cx, cy, outerRadius, safeEndAngle)
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0

  if (innerRadius <= 0) {
    return `M ${cx} ${cy} L ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y} Z`
  }

  const startInner = polarPoint(cx, cy, innerRadius, startAngle)
  const endInner = polarPoint(cx, cy, innerRadius, safeEndAngle)

  return `M ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y} L ${endInner.x} ${endInner.y} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y} Z`
}

export function LineChartCard({
  className,
  compact,
  title = "On-time trend",
  subtitle = "Actual performance against target",
  data = defaultTrendData,
  series = defaultTrendSeries,
  xKey = "period",
  showLegend = true,
}: CartesianChartProps) {
  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className} footer={maybeLegend(showLegend, series)}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={toChartConfig(series)} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGridColor} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tick={axisTick} />
            <YAxis hide />
            <ChartTooltip cursor={false} content={chartTooltip} />
            {series.map((item) => (
              <Line key={item.key} dataKey={item.key} type="monotone" stroke={`var(--color-${item.key})`} strokeDasharray={item.dashed ? "5 5" : undefined} strokeWidth={item.dashed ? 2 : 3} dot={false} />
            ))}
          </LineChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function AreaChartCard({
  className,
  compact,
  title = "Shipment volume",
  subtitle = "Rolling six-month operating load",
  data = defaultVolumeData,
  series = defaultModeSeries.slice(0, 2),
  xKey = "period",
  showLegend = true,
}: CartesianChartProps) {
  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className} footer={maybeLegend(showLegend, series)}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={toChartConfig(series)} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <AreaChart accessibilityLayer data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <defs>
              {series.map((item) => (
                <linearGradient key={item.key} id={`area-${item.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={`var(--color-${item.key})`} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={`var(--color-${item.key})`} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={chartGridColor} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tick={axisTick} />
            <YAxis hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]" indicator="line" />} />
            {series.map((item, index) => (
              <Area key={item.key} dataKey={item.key} type="natural" fill={`url(#area-${item.key})`} stroke={`var(--color-${item.key})`} strokeWidth={index === 0 ? 3 : 2} />
            ))}
          </AreaChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function BarChartCard({
  className,
  compact,
  title = "Mode volume",
  subtitle = "Monthly shipments by movement type",
  data = defaultVolumeData,
  series,
  xKey = "period",
  showLegend = true,
  variant = "comparison",
}: CartesianChartProps & { variant?: "single" | "comparison" }) {
  const resolvedSeries = series ?? (variant === "single" ? [defaultModeSeries[0]] : defaultModeSeries)

  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className} footer={maybeLegend(showLegend, resolvedSeries)}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={toChartConfig(resolvedSeries)} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <BarChart accessibilityLayer data={data} barGap={4} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGridColor} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tick={axisTick} />
            <YAxis hide />
            <ChartTooltip cursor={false} content={chartTooltip} />
            {resolvedSeries.map((item) => (
              <Bar key={item.key} dataKey={item.key} fill={`var(--color-${item.key})`} radius={4} />
            ))}
          </BarChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function StackedBarChartCard({
  className,
  compact,
  title = "Cost stack",
  subtitle = "Quoted, billed, and margin pressure",
  data = defaultSpendData,
  series = defaultSpendSeries,
  xKey = "period",
  showLegend = true,
}: CartesianChartProps) {
  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className} footer={maybeLegend(showLegend, series)}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={toChartConfig(series)} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <BarChart accessibilityLayer data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGridColor} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tick={axisTick} />
            <YAxis hide />
            <ChartTooltip cursor={false} content={chartTooltip} />
            {series.map((item, index) => (
              <Bar key={item.key} dataKey={item.key} stackId={item.stackId ?? "stack"} fill={`var(--color-${item.key})`} radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function DonutChartCard({
  className,
  compact,
  title = "Lane mix",
  subtitle = "Share of shipments by transport mode",
  data = defaultModeBreakdown,
  nameKey = "name",
  valueKey = "value",
  showLegend = true,
  innerRadius,
  outerRadius,
  centerLabel = "modes",
  centerValueFormatter = (value: number) => `${value}%`,
}: ChartCardProps & {
  data?: BreakdownDataPoint[]
  nameKey?: string
  valueKey?: string
  showLegend?: boolean
  innerRadius?: number
  outerRadius?: number
  centerLabel?: string
  centerValueFormatter?: (value: number) => string
}) {
  const total = useMemo(() => data.reduce((sum, item) => sum + Number(item[valueKey] ?? 0), 0), [data, valueKey])
  const resolvedInnerRadius = innerRadius ?? (compact ? 52 : 68)
  const resolvedOuterRadius = outerRadius ?? (compact ? 82 : 104)
  let currentAngle = 0

  return (
    <VisualizationShell
      title={title}
      subtitle={subtitle}
      compact={compact}
      className={className}
      footer={
        showLegend ? (
          <LegendRow
            items={data.map((item, index) => ({
              label: String(item[nameKey] ?? item.name),
              color: item.color ?? chartPalette[index % chartPalette.length],
            }))}
          />
        ) : null
      }
    >
      <ChartCanvas compact={compact}>
        <div className={cn("md-chart-pie-canvas mx-auto grid w-full max-w-[280px] place-items-center", compact ? "h-[170px]" : "h-[250px]")}>
          <svg viewBox="0 0 240 240" role="img" aria-label={title} className="size-full max-h-[240px] max-w-[240px] overflow-visible">
            {data.map((entry, index) => {
              const value = Number(entry[valueKey] ?? 0)
              const angle = total > 0 ? (value / total) * 360 : 0
              const startAngle = currentAngle
              const endAngle = currentAngle + angle
              currentAngle = endAngle

              return (
                <path
                  key={String(entry[nameKey] ?? index)}
                  d={describePieSegment(120, 120, resolvedOuterRadius, resolvedInnerRadius, startAngle, endAngle)}
                  fill={entry.color ?? chartPalette[index % chartPalette.length]}
                  stroke="var(--md-surface)"
                  strokeWidth="4"
                  strokeLinejoin="round"
                >
                  <title>
                    {String(entry[nameKey] ?? entry.name)}: {value}
                  </title>
                </path>
              )
            })}
            {resolvedInnerRadius > 0 ? (
              <text x="120" y="120" textAnchor="middle" dominantBaseline="middle">
                <tspan x="120" y="116" className="fill-[var(--md-ink)] text-[24px] font-medium">
                  {centerValueFormatter(total)}
                </tspan>
                <tspan x="120" y="137" className="fill-[var(--md-text)] text-[11px]">
                  {centerLabel}
                </tspan>
              </text>
            ) : null}
          </svg>
        </div>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export const PieChartCard = DonutChartCard

export function FunnelChartCard({
  className,
  compact,
  title = "Document funnel",
  subtitle = "From document intake to customs clearance",
  data = defaultFunnelData,
  showSummary = true,
}: ChartCardProps & {
  data?: FunnelDataPoint[]
  showSummary?: boolean
}) {
  const config = useMemo(
    () =>
      toChartConfig([], {
        value: { label: "Count" },
        ...Object.fromEntries(data.map((item, index) => [item.stage, { label: item.stage, color: item.color ?? chartPalette[index % chartPalette.length] }])),
      }),
    [data],
  )

  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={config} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <FunnelChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]" hideLabel />} />
            <Funnel data={data} dataKey="value" nameKey="stage" isAnimationActive={false}>
              {data.map((entry, index) => (
                <Cell key={entry.stage} fill={entry.color ?? chartPalette[index % chartPalette.length]} />
              ))}
            </Funnel>
          </FunnelChart>
        </ChartContainer>
      </ChartCanvas>
      {showSummary ? (
        <div className={cn("md-chart-summary-grid mt-3 grid gap-2", compact ? "grid-cols-2" : "grid-cols-4")}>
          {data.map((item) => (
            <div key={item.stage} className="rounded-[var(--md-radius-md)] bg-white/48 px-3 py-2 shadow-[var(--md-shadow-line)]">
              <p className="truncate text-[11px] font-medium text-[var(--md-text)]">{item.stage}</p>
              <p className="mt-1 text-[16px] font-medium text-[var(--md-ink)]">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </VisualizationShell>
  )
}

export function HeatmapChartCard({
  className,
  compact,
  title = "Lane density heatmap",
  subtitle = "Origin and destination concentration",
  rows = defaultHeatmapRows,
  columns = defaultHeatmapColumns,
  valueFormatter = (value: number) => String(value),
}: ChartCardProps & {
  rows?: HeatmapRow[]
  columns?: string[]
  valueFormatter?: (value: number) => string
}) {
  const maxValue = Math.max(...rows.flatMap((row) => columns.map((column) => row.values[column] ?? 0)), 1)

  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className}>
      <div className={cn("md-chart-heatmap overflow-x-auto rounded-[var(--md-radius-lg)] bg-white/54 p-3 shadow-[var(--md-shadow-line)] md-scrollbar", compact && "rounded-[var(--md-radius-md)] p-2")}>
        <div className="grid min-w-[460px] gap-2" style={{ gridTemplateColumns: `88px repeat(${columns.length}, minmax(0, 1fr))` }}>
          <span />
          {columns.map((column) => (
            <span key={column} className="text-center text-[11px] font-medium text-[var(--md-text)]">
              {column}
            </span>
          ))}
          {rows.map((row) => (
            <Fragment key={row.label}>
              <span className="flex h-11 items-center text-[12px] font-medium text-[var(--md-text)]">{row.label}</span>
              {columns.map((column) => {
                const value = row.values[column] ?? 0
                const strength = Math.max(12, Math.round((value / maxValue) * 76))

                return (
                  <span
                    key={`${row.label}-${column}`}
                    className="flex h-11 items-center justify-center rounded-[var(--md-radius-md)] text-[12px] font-medium text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]"
                    style={{ background: `color-mix(in srgb, var(--md-accent) ${strength}%, white)` }}
                  >
                    {valueFormatter(value)}
                  </span>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </VisualizationShell>
  )
}

export function RadialGoalChartCard({
  className,
  compact,
  title = "Clearance SLA",
  subtitle = "Documents cleared inside target window",
  value = 94,
  max = 100,
  label = "target",
  color = "var(--md-accent)",
}: ChartCardProps & {
  value?: number
  max?: number
  label?: string
  color?: string
}) {
  const data = [{ name: "score", value, fill: "var(--color-score)" }]

  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={{ score: { label: "Score", color } }} className={cn("mx-auto [aspect-ratio:1] w-full max-w-[260px]", compact ? "h-[165px]" : "h-[240px]")}>
          <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius={compact ? 62 : 78} outerRadius={compact ? 86 : 112}>
            <PolarGrid gridType="circle" radialLines={false} stroke="none" className="first:fill-[var(--md-surface-tint)] last:fill-white" polarRadius={compact ? [78, 64] : [100, 82]} />
            <RadialBar dataKey="value" background cornerRadius={8} fill="var(--color-score)" />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} domain={[0, max]}>
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-[var(--md-ink)] text-[30px] font-medium">
                        {value}%
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-[var(--md-text)] text-[11px]">
                        {label}
                      </tspan>
                    </text>
                  )
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function ScatterChartCard({
  className,
  compact,
  title = "Carrier efficiency",
  subtitle = "Dwell time against on-time performance",
  data = defaultCarrierEfficiency,
  xKey = "dwell",
  yKey = "onTime",
  zKey = "volume",
  color = "var(--md-accent)",
}: ChartCardProps & {
  data?: ChartDataPoint[]
  xKey?: string
  yKey?: string
  zKey?: string
  color?: string
}) {
  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={{ [xKey]: { label: xKey }, [yKey]: { label: yKey, color }, [zKey]: { label: zKey } }} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <ScatterChart accessibilityLayer data={data} margin={{ left: 8, right: 16, top: 12, bottom: 0 }}>
            <CartesianGrid stroke={chartGridColor} />
            <XAxis dataKey={xKey} name={xKey} type="number" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis dataKey={yKey} name={yKey} type="number" tickLine={false} axisLine={false} tick={axisTick} />
            <ZAxis dataKey={zKey} range={[70, 280]} name={zKey} />
            <ChartTooltip cursor={{ stroke: color, strokeOpacity: 0.24 }} content={chartTooltip} />
            <Scatter data={data} fill={color} />
          </ScatterChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function MixedChartCard({
  className,
  compact,
  title = "Spend and margin",
  subtitle = "Commercial trend for report packs",
  data = defaultSpendData,
  bars = [defaultSpendSeries[1]],
  lines = [defaultSpendSeries[2]],
  xKey = "period",
  showLegend = true,
}: ChartCardProps & {
  data?: ChartDataPoint[]
  bars?: ChartSeries[]
  lines?: ChartSeries[]
  xKey?: string
  showLegend?: boolean
}) {
  const series = [...bars, ...lines]

  return (
    <VisualizationShell title={title} subtitle={subtitle} compact={compact} className={className} footer={maybeLegend(showLegend, series)}>
      <ChartCanvas compact={compact}>
        <ChartContainer config={toChartConfig(series)} className={cn("[aspect-ratio:auto] w-full", chartHeight(compact))}>
          <ComposedChart accessibilityLayer data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGridColor} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tick={axisTick} />
            <YAxis hide />
            <ChartTooltip cursor={false} content={chartTooltip} />
            {bars.map((item) => (
              <Bar key={item.key} dataKey={item.key} fill={`var(--color-${item.key})`} radius={4} />
            ))}
            {lines.map((item) => (
              <Line key={item.key} dataKey={item.key} type="monotone" stroke={`var(--color-${item.key})`} strokeWidth={3} dot={false} />
            ))}
          </ComposedChart>
        </ChartContainer>
      </ChartCanvas>
    </VisualizationShell>
  )
}

export function ReportVisualizationBlock({
  kind = "line",
  title,
  subtitle,
  compact = true,
  className,
  options,
}: {
  kind?: VisualizationKind
  title?: string
  subtitle?: string
  compact?: boolean
  className?: string
  options?: ReportVisualizationOptions
}) {
  if (kind === "area") return <AreaChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.data} series={options?.series} xKey={options?.xKey} showLegend={options?.showLegend} />
  if (kind === "bar") return <BarChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.data} series={options?.series} xKey={options?.xKey} variant={options?.barVariant} showLegend={options?.showLegend} />
  if (kind === "stacked-bar") return <StackedBarChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.data} series={options?.series} xKey={options?.xKey} showLegend={options?.showLegend} />
  if (kind === "pie") {
    return (
      <DonutChartCard
        title={title}
        subtitle={subtitle}
        compact={compact}
        className={className}
        data={options?.pieData}
        nameKey={options?.pieNameKey}
        valueKey={options?.pieValueKey}
        showLegend={options?.showLegend}
        innerRadius={options?.pieInnerRadius}
        outerRadius={options?.pieOuterRadius}
        centerLabel={options?.pieCenterLabel}
        centerValueFormatter={options?.pieCenterValueFormatter}
      />
    )
  }
  if (kind === "funnel") return <FunnelChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.funnelData} showSummary={options?.funnelShowSummary} />
  if (kind === "heatmap") return <HeatmapChartCard title={title} subtitle={subtitle} compact={compact} className={className} rows={options?.heatmapRows} columns={options?.heatmapColumns} valueFormatter={options?.heatmapValueFormatter} />
  if (kind === "radial") return <RadialGoalChartCard title={title} subtitle={subtitle} compact={compact} className={className} value={options?.radialValue} max={options?.radialMax} label={options?.radialLabel} color={options?.radialColor} />
  if (kind === "scatter") return <ScatterChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.scatterData} xKey={options?.scatterXKey} yKey={options?.scatterYKey} zKey={options?.scatterZKey} color={options?.scatterColor} />
  if (kind === "mixed") return <MixedChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.data} bars={options?.bars} lines={options?.lines} xKey={options?.xKey} showLegend={options?.showLegend} />
  return <LineChartCard title={title} subtitle={subtitle} compact={compact} className={className} data={options?.data} series={options?.series} xKey={options?.xKey} showLegend={options?.showLegend} />
}
