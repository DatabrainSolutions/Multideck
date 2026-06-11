import type { CSSProperties } from "react"
import { Download, Eye, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { GeneratedReport, GeneratedReportStatus, ReportTemplate } from "@/data/multideck-data"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"

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
