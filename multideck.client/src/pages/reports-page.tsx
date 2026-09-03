import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  ChartAnalysis,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  X,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { StatusPill, attributeToneFor } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { WizardDialog, type WizardStep } from "@/components/multideck/wizard-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { cn } from "@/lib/utils"

export type ReportingRoute = "/reports" | "/reports/scheduled"

type ReportTemplateOption = {
  id: string
  name: string
  description: string
  content: string
  icon: LucideIcon
}

type ReportStatus = "Ready" | "Processing" | "Failed" | "Expired"

type ReportHistoryRow = {
  id: string
  name: string
  type: string
  requestedAt: string
  format: "PDF" | "XLSX" | "CSV" | "ZIP"
  scope: string
  status: ReportStatus
}

type ReportHistoryState = "ready" | "loading" | "empty" | "error"

const reportTemplates: ReportTemplateOption[] = [
  {
    id: "monthly-client-review",
    name: "Monthly client review",
    description: "Delivery performance, service exceptions and recovery actions for one customer.",
    content: "Bookings, milestones and exceptions",
    icon: ChartAnalysis,
  },
  {
    id: "weekly-operations-pack",
    name: "Weekly operations pack",
    description: "A concise view of active work, overdue milestones and ownership across the team.",
    content: "Operations and service recovery",
    icon: BarChart3,
  },
  {
    id: "margin-review",
    name: "Shipment margin review",
    description: "Revenue, cost and gross-profit performance with customer and lane context.",
    content: "Finance and bookings",
    icon: FileSpreadsheet,
  },
]

const reportHistory: ReportHistoryRow[] = [
  { id: "rpt-1048", name: "Weekly operations pack", type: "Operations summary", requestedAt: "13 Aug 2026, 09:12 BST", format: "PDF", scope: "Internal operations", status: "Ready" },
  { id: "rpt-1047", name: "Customer exception review", type: "Exception report", requestedAt: "13 Aug 2026, 08:45 BST", format: "XLSX", scope: "Marlow Foods", status: "Processing" },
  { id: "rpt-1046", name: "Monthly margin review", type: "Finance report", requestedAt: "12 Aug 2026, 16:20 BST", format: "CSV", scope: "Finance team", status: "Failed" },
  { id: "rpt-1045", name: "Bookings archive — July 2026", type: "Booking export", requestedAt: "1 Aug 2026, 07:00 BST", format: "ZIP", scope: "All offices", status: "Expired" },
  { id: "rpt-1044", name: "On-time delivery scorecard", type: "Performance report", requestedAt: "31 Jul 2026, 17:35 BST", format: "PDF", scope: "Client services", status: "Ready" },
]

const reportStatusTone: Record<ReportStatus, "green" | "blue" | "red" | "neutral"> = {
  Ready: "green",
  Processing: "blue",
  Failed: "red",
  Expired: "neutral",
}

const reportUnavailableReason: Record<Exclude<ReportStatus, "Ready">, string> = {
  Processing: "Download becomes available when processing finishes.",
  Failed: "No file is available because this report failed.",
  Expired: "This file has expired and is no longer available.",
}

function readReportHistoryState(): ReportHistoryState {
  if (typeof window === "undefined") return "ready"
  const state = new URLSearchParams(window.location.search).get("reporting-state")
  return state === "loading" || state === "empty" || state === "error" ? state : "ready"
}

function ReportingPageHeader({ title, description, headingRef }: { title: string; description?: string; headingRef?: Ref<HTMLHeadingElement> }) {
  const { t } = useLanguage()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-balance text-[24px] font-medium leading-[1.15] tracking-[-0.025em] text-[var(--md-ink)] outline-none">{t(title)}</h1>
      {description ? <p className="max-w-[68ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t(description)}</p> : null}
    </div>
  )
}

function ReportHistoryLoading() {
  const { t } = useLanguage()
  return (
    <Surface aria-live="polite" className="rounded-[var(--md-radius-2xl)] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-4 text-[var(--md-accent)] motion-safe:animate-spin" strokeWidth={1.4} aria-hidden="true" />
        <div>
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Loading report history…")}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Completed and in-progress reports will appear without moving the page layout.")}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-6 grid gap-2">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-[64px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] motion-safe:animate-pulse" />)}
      </div>
    </Surface>
  )
}

function ReportHistoryEmpty() {
  const { t } = useLanguage()
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center p-6 text-center">
      <span className="grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><FileText className="size-5" strokeWidth={1.35} aria-hidden="true" /></span>
      <h2 className="mt-4 text-balance text-[16px] font-medium text-[var(--md-ink)]">{t("No reports have run yet")}</h2>
      <p className="mt-2 max-w-[48ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Created reports and their output status will appear here when reporting is connected.")}</p>
    </div>
  )
}

function ReportHistoryError() {
  const { t } = useLanguage()
  return (
    <Surface role="alert" className="flex min-h-[280px] flex-col items-center justify-center rounded-[var(--md-radius-2xl)] p-6 text-center">
      <span className="grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-red)_10%,transparent)] text-[var(--md-red)] shadow-[var(--md-shadow-line)]"><AlertCircle className="size-5" strokeWidth={1.35} aria-hidden="true" /></span>
      <h2 className="mt-4 text-balance text-[16px] font-medium text-[var(--md-ink)]">{t("Report history unavailable")}</h2>
      <p className="mt-2 max-w-[52ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Reporting data could not be shown. Nothing on this page was changed.")}</p>
    </Surface>
  )
}

function CreateReportPanel({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [selectedTemplateId, setSelectedTemplateId] = useState(reportTemplates[0].id)

  return (
    <Surface aria-labelledby="create-report-title" className="rounded-[var(--md-radius-2xl)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="create-report-title" className="text-[16px] font-medium text-[var(--md-ink)]">{t("Create report")}</h2>
          <p className="mt-1 max-w-[68ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Choose a starting point. Report creation will be enabled when the reporting service is connected.")}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t("Close create report")} className="size-9 shrink-0 rounded-[var(--md-radius-lg)]" onClick={onClose}><X className="size-4" strokeWidth={1.35} aria-hidden="true" /></Button>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {reportTemplates.map((template) => {
          const Icon = template.icon
          const selected = selectedTemplateId === template.id
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "min-h-[154px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4 text-start shadow-[var(--md-shadow-line)] outline-none transition-[background,box-shadow,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transform-none motion-reduce:transition-none",
                selected && "bg-[var(--md-accent-a06)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)]",
              )}
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Icon className="size-4" strokeWidth={1.35} aria-hidden="true" /></span>
              <span className="mt-4 block text-[14px] font-medium text-[var(--md-ink)]">{t(template.name)}</span>
              <span className="mt-1 block text-pretty text-[12.5px] leading-5 text-[var(--md-text)]">{t(template.description)}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--md-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-5 text-[var(--md-text)]">{t("Nothing will run or save from this screen yet.")}</p>
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-flex"><Button type="button" disabled className="h-9 rounded-[var(--md-radius-lg)] px-4">{t("Run report")}</Button></span></TooltipTrigger>
          <TooltipContent>{t("Connect reporting to run this report")}</TooltipContent>
        </Tooltip>
      </div>
    </Surface>
  )
}

type DownloadPhase = "idle" | "downloading" | "downloaded"

function DownloadAction({ reportName, phase, onActivate }: { reportName: string; phase: DownloadPhase; onActivate: () => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const label = phase === "downloading" ? "Downloading…" : phase === "downloaded" ? "Downloaded" : "Download"
  const Icon = phase === "downloading" ? LoaderCircle : phase === "downloaded" ? Check : Download

  return (
    <span className="inline-flex">
      <Button
        type="button"
        variant="ghost"
        disabled={phase !== "idle"}
        aria-busy={phase === "downloading"}
        aria-label={`${t(label)} · ${t(reportName)}`}
        className="h-8 w-[126px] rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] disabled:cursor-default disabled:opacity-100"
        onClick={onActivate}
      >
        <span aria-hidden="true" className="relative grid h-5 w-[104px] place-items-center overflow-hidden">
          <AnimatePresence initial={false} mode="sync">
            <motion.span
              key={phase}
              className="absolute inset-0 flex items-center justify-center gap-1.5 whitespace-nowrap"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <Icon className={cn("size-3.5 shrink-0", phase === "downloading" && "animate-spin motion-reduce:animate-none", phase === "downloaded" && "text-[var(--md-green)]")} strokeWidth={1.4} />
              <span>{t(label)}</span>
            </motion.span>
          </AnimatePresence>
        </span>
      </Button>
      <span className="sr-only" role="status" aria-live="polite">{t(label)}</span>
    </span>
  )
}

function ReportsHistory() {
  const { t } = useLanguage()
  const [createOpen, setCreateOpen] = useState(false)
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null)
  const [downloadPhases, setDownloadPhases] = useState<Record<string, DownloadPhase>>({})
  const downloadTimers = useRef(new Map<string, number[]>())
  const [historyState] = useState<ReportHistoryState>(readReportHistoryState)

  useEffect(() => subscribeTopBarAction(topBarActionEvents.startReportDraft, () => setCreateOpen(true)), [])

  useEffect(() => () => {
    downloadTimers.current.forEach((timers) => timers.forEach((timer) => window.clearTimeout(timer)))
    downloadTimers.current.clear()
  }, [])

  function demonstrateDownload(row: ReportHistoryRow) {
    if (downloadTimers.current.has(row.id)) return
    setDownloadNotice(t("Download feedback is being demonstrated only. Nothing was generated or downloaded."))
    setDownloadPhases((current) => ({ ...current, [row.id]: "downloading" }))
    const downloadedTimer = window.setTimeout(() => {
      setDownloadPhases((current) => ({ ...current, [row.id]: "downloaded" }))
    }, 700)
    const resetTimer = window.setTimeout(() => {
      setDownloadPhases((current) => ({ ...current, [row.id]: "idle" }))
      downloadTimers.current.delete(row.id)
    }, 1650)
    downloadTimers.current.set(row.id, [downloadedTimer, resetTimer])
  }

  const columns = useMemo<DataTableColumn<ReportHistoryRow>[]>(() => [
    {
      id: "report",
      label: "Report",
      kind: "long-text",
      width: 290,
      minWidth: 220,
      resizable: true,
      sortValue: (row) => row.name,
      cellTitle: (row) => `${row.name} · ${row.type}`,
      cell: (row) => <div className="min-w-0"><p className="truncate text-[14px] font-medium leading-5 text-[var(--md-ink)]">{t(row.name)}</p><p className="mt-0.5 truncate text-[12.5px] leading-5 text-[var(--md-text)]">{t(row.type)}</p></div>,
    },
    { id: "requested", label: "Requested or run", kind: "date", width: 190, sortValue: (row) => row.requestedAt, cell: (row) => <bdi className="tabular-nums text-[var(--md-text)]">{row.requestedAt}</bdi> },
    { id: "format", label: "Format", kind: "attribute", width: 105, sortValue: (row) => row.format, cell: (row) => <StatusPill kind="attribute" tone={attributeToneFor(row.format)}>{row.format}</StatusPill> },
    { id: "scope", label: "Audience or scope", kind: "attribute", width: 180, sortValue: (row) => row.scope, cell: (row) => <StatusPill kind="attribute" tone={attributeToneFor(row.scope)}>{t(row.scope)}</StatusPill> },
    { id: "status", label: "Status", kind: "status", width: 130, sortValue: (row) => row.status, cell: (row) => <StatusPill kind="status" tone={reportStatusTone[row.status]}>{t(row.status)}</StatusPill> },
    {
      id: "actions",
      label: "Actions",
      kind: "actions",
      width: 150,
      canHide: false,
      canPin: false,
      cell: (row) => {
        const ready = row.status === "Ready"
        const unavailableReason = row.status === "Ready" ? null : reportUnavailableReason[row.status]
        const button = ready ? <DownloadAction reportName={row.name} phase={downloadPhases[row.id] ?? "idle"} onActivate={() => demonstrateDownload(row)} /> : (
          <Button type="button" variant="ghost" disabled aria-label={t("Download {reportName}").replace("{reportName}", t(row.name))} className="h-8 w-[126px] rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[12px] font-medium text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] disabled:cursor-not-allowed"><Download data-icon="inline-start" className="size-3.5" strokeWidth={1.3} aria-hidden="true" />{t("Download")}</Button>
        )
        return ready ? button : (
          <Tooltip>
            <TooltipTrigger asChild><span className="inline-flex" tabIndex={0}>{button}</span></TooltipTrigger>
            <TooltipContent>{t(unavailableReason ?? "Download unavailable")}</TooltipContent>
          </Tooltip>
        )
      },
    },
  ], [downloadPhases, t])

  const rows = historyState === "empty" ? [] : reportHistory
  const reportFeedback = createOpen || downloadNotice ? (
    <div className="grid gap-3">
      {createOpen ? <CreateReportPanel onClose={() => setCreateOpen(false)} /> : null}
      {downloadNotice ? (
        <div role="status" className="flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a06)] px-3 py-2.5 text-[12.5px] leading-5 text-[var(--md-text)] shadow-[inset_0_0_0_1px_var(--md-accent-a14)]">
          <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" />
          <span>{downloadNotice}</span>
        </div>
      ) : null}
    </div>
  ) : null

  return (
    <div className="md-page min-w-0">
      {historyState === "loading" || historyState === "error" ? (
        <div className="grid gap-3">
          <ReportingPageHeader title="Reports" />
          {reportFeedback}
          {historyState === "loading" ? <ReportHistoryLoading /> : <ReportHistoryError />}
        </div>
      ) : (
        <div className="grid gap-3">
          <ReportingPageHeader title="Reports" />
          <DataTable clientPagination
            ariaLabel="Report history"
            columnsButtonLabel="Manage report columns"
            contentBeforeTable={reportFeedback}
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            storageKey="report-history-ui"
            rowClassName="h-[72px]"
            minimumWidth={1045}
            emptyState={<ReportHistoryEmpty />}
          />
        </div>
      )}
    </div>
  )
}

type ScheduleDraft = {
  report: string
  audience: "Internal team" | "Named recipient" | "Client contacts"
  recipient: string
  cadence: string
  time: string
  timezone: string
}

type ScheduleStep = "report" | "audience" | "cadence" | "delivery" | "review"
type ScheduledReportStatus = "Active" | "Paused" | "Draft"
type ScheduledReportState = "ready" | "loading" | "empty" | "error"

type ScheduledReportRow = {
  id: string
  report: string
  recipients: string
  audience: ScheduleDraft["audience"]
  cadence: string
  nextDelivery: string
  time: string
  timezone: string
  status: ScheduledReportStatus
}

const scheduledReports: ScheduledReportRow[] = [
  { id: "sch-104", report: "Weekly operations pack", recipients: "Operations team · 8 recipients", audience: "Internal team", cadence: "Every Monday", nextDelivery: "17 Aug 2026", time: "09:00", timezone: "Europe/London", status: "Active" },
  { id: "sch-103", report: "Monthly client review", recipients: "Client services · 5 recipients", audience: "Internal team", cadence: "Monthly on the 1st", nextDelivery: "1 Sep 2026", time: "08:30", timezone: "Europe/London", status: "Active" },
  { id: "sch-102", report: "Shipment margin review", recipients: "Finance team · 4 recipients", audience: "Internal team", cadence: "First working day", nextDelivery: "—", time: "07:30", timezone: "Europe/London", status: "Paused" },
  { id: "sch-101", report: "Customer exception review", recipients: "ops@marlowfoods.com", audience: "Named recipient", cadence: "Every weekday", nextDelivery: "—", time: "16:00", timezone: "Europe/London", status: "Draft" },
]

const scheduledStatusTone: Record<ScheduledReportStatus, "green" | "amber" | "neutral"> = {
  Active: "green",
  Paused: "amber",
  Draft: "neutral",
}

const newScheduleDraft: ScheduleDraft = {
  report: reportTemplates[0].name,
  audience: "Internal team",
  recipient: "Operations team",
  cadence: "Every Monday",
  time: "09:00",
  timezone: "Europe/London",
}

function readScheduledReportState(): ScheduledReportState {
  if (typeof window === "undefined") return "ready"
  const state = new URLSearchParams(window.location.search).get("scheduled-state")
  return state === "loading" || state === "empty" || state === "error" ? state : "ready"
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-[12px] font-medium text-[var(--md-text)]">{children}</label>
}

function ChoiceButton({ selected, children, onClick }: { selected: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-h-11 rounded-[var(--md-radius-lg)] px-3 py-2 text-start text-[13px] font-medium outline-none transition-[background,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transform-none motion-reduce:transition-none",
        selected ? "bg-[var(--md-accent-a10)] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)]" : "bg-[var(--md-surface-soft)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:text-[var(--md-ink)]",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ScheduleStepContent({ step, draft, setDraft, checked }: {
  step: ScheduleStep
  draft: ScheduleDraft
  setDraft: (next: ScheduleDraft) => void
  checked: boolean
}) {
  const { t } = useLanguage()

  if (step === "report") return (
    <div className="grid gap-4">
      <div><h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Choose report content")}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Select the report this delivery would use.")}</p></div>
      <div className="grid gap-2">
        {reportTemplates.map((template) => <ChoiceButton key={template.id} selected={draft.report === template.name} onClick={() => setDraft({ ...draft, report: template.name })}><span className="block text-[var(--md-ink)]">{t(template.name)}</span><span className="mt-0.5 block text-[12px] font-normal leading-5 text-[var(--md-text)]">{t(template.content)}</span></ChoiceButton>)}
      </div>
    </div>
  )

  if (step === "audience") return (
    <div className="grid gap-5">
      <div><h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Choose the audience")}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Keep the future delivery scope clear before adding recipients.")}</p></div>
      <div className="grid gap-2 sm:grid-cols-3">{(["Internal team", "Named recipient", "Client contacts"] as const).map((audience) => <ChoiceButton key={audience} selected={draft.audience === audience} onClick={() => setDraft({ ...draft, audience })}>{t(audience)}</ChoiceButton>)}</div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="schedule-recipient">{t("Recipient or group")}</FieldLabel>
        <Input id="schedule-recipient" value={draft.recipient} onChange={(event) => setDraft({ ...draft, recipient: event.target.value })} className="h-11 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-base shadow-[var(--md-shadow-line)] sm:text-[14px]" />
        <p className="text-[12px] leading-5 text-[var(--md-text)]">{t("No address or group will be contacted from this screen.")}</p>
      </div>
    </div>
  )

  if (step === "cadence") return (
    <div className="grid gap-5">
      <div><h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Set the cadence")}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Choose a familiar recurring pattern.")}</p></div>
      <div className="grid gap-2"><FieldLabel>{t("Cadence")}</FieldLabel><Select value={draft.cadence} onValueChange={(cadence) => setDraft({ ...draft, cadence })}><SelectTrigger aria-label={t("Cadence")} className="h-11 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-base shadow-[var(--md-shadow-line)] sm:text-[14px]"><SelectValue /></SelectTrigger><SelectContent>{["Every Monday", "Every weekday", "First working day", "Monthly on the 1st"].map((cadence) => <SelectItem key={cadence} value={cadence}>{t(cadence)}</SelectItem>)}</SelectContent></Select></div>
    </div>
  )

  if (step === "delivery") return (
    <div className="grid gap-5">
      <div><h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Choose delivery time")}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("The timezone stays visible so the future delivery is unambiguous.")}</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><FieldLabel htmlFor="schedule-time">{t("Delivery time")}</FieldLabel><Input id="schedule-time" type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} className="h-11 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-base tabular-nums shadow-[var(--md-shadow-line)] sm:text-[14px]" /></div>
        <div className="grid gap-2"><FieldLabel>{t("Timezone")}</FieldLabel><Select value={draft.timezone} onValueChange={(timezone) => setDraft({ ...draft, timezone })}><SelectTrigger aria-label={t("Timezone")} className="h-11 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-base shadow-[var(--md-shadow-line)] sm:text-[14px]"><SelectValue /></SelectTrigger><SelectContent>{["Europe/London", "Europe/Paris", "America/New_York"].map((timezone) => <SelectItem key={timezone} value={timezone}><bdi>{timezone}</bdi></SelectItem>)}</SelectContent></Select></div>
      </div>
    </div>
  )

  return (
    <div className="grid gap-5">
      <div><h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Review the schedule")}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Check the complete delivery plan before scheduling is enabled.")}</p></div>
      <dl className="grid gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] px-4 shadow-[var(--md-shadow-line)]">
        {[["Report", draft.report], ["Audience", draft.audience], ["Recipient or group", draft.recipient], ["Cadence", draft.cadence], ["Delivery", `${draft.time} · ${draft.timezone}`]].map(([label, value]) => <div key={label} className="grid gap-1 border-b border-[var(--md-line)] py-3 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-baseline"><dt className="text-[12px] text-[var(--md-text)]">{t(label)}</dt><dd dir="auto" className="break-words text-[13px] font-medium text-[var(--md-ink)]">{t(value)}</dd></div>)}
      </dl>
      {checked ? (
        <div role="status" className="flex items-start gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a06)] p-4 shadow-[inset_0_0_0_1px_var(--md-accent-a14)]"><Check className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" /><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Setup checked")}</p><p className="mt-1 text-[12.5px] leading-5 text-[var(--md-text)]">{t("The required fields are complete. Nothing was scheduled or sent.")}</p></div></div>
      ) : <p className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4 text-[12.5px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("Checking this setup confirms only the fields shown here. It will not save a schedule or send a report.")}</p>}
    </div>
  )
}

function ScheduledReportsLoading() {
  const { t } = useLanguage()
  return (
    <Surface aria-live="polite" className="rounded-[var(--md-radius-2xl)] p-5 sm:p-6">
      <div className="flex items-center gap-3"><LoaderCircle className="size-4 text-[var(--md-accent)] motion-safe:animate-spin" strokeWidth={1.4} aria-hidden="true" /><div><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Loading scheduled reports…")}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Existing delivery plans will appear here when reporting is connected.")}</p></div></div>
      <div aria-hidden="true" className="mt-6 grid gap-2">{[0, 1, 2, 3].map((index) => <div key={index} className="h-[64px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] motion-safe:animate-pulse" />)}</div>
    </Surface>
  )
}

function ScheduledReportsError() {
  const { t } = useLanguage()
  return (
    <Surface role="alert" className="flex min-h-[280px] flex-col items-center justify-center rounded-[var(--md-radius-2xl)] p-6 text-center">
      <span className="grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-red)_10%,transparent)] text-[var(--md-red)] shadow-[var(--md-shadow-line)]"><AlertCircle className="size-5" strokeWidth={1.35} aria-hidden="true" /></span>
      <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">{t("Scheduled reports unavailable")}</h2>
      <p className="mt-2 max-w-[52ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Schedule data could not be shown. Nothing was changed, sent or rescheduled.")}</p>
    </Surface>
  )
}

function ScheduledReportsEmpty({ onCreate }: { onCreate: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center p-6 text-center">
      <span className="grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><CalendarClock className="size-5" strokeWidth={1.35} aria-hidden="true" /></span>
      <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">{t("No scheduled reports yet")}</h2>
      <p className="mt-2 max-w-[48ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Recurring delivery plans will appear here when scheduling is connected.")}</p>
      <Button type="button" variant="outline" className="mt-4 h-10 rounded-[var(--md-radius-lg)] px-4" onClick={onCreate}>{t("Set up scheduled report")}</Button>
    </div>
  )
}

function ScheduledReports() {
  const { t } = useLanguage()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState<ScheduleStep>("report")
  const [checked, setChecked] = useState(false)
  const [draft, setDraft] = useState<ScheduleDraft>(newScheduleDraft)
  const [scheduleState] = useState<ScheduledReportState>(readScheduledReportState)
  const [notice, setNotice] = useState<string | null>(null)
  const scheduleHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusFrameRef = useRef<number | null>(null)

  function openWizard(row?: ScheduledReportRow) {
    setDraft(row ? { report: row.report, audience: row.audience, recipient: row.recipients.split(" · ")[0], cadence: row.cadence, time: row.time, timezone: row.timezone } : newScheduleDraft)
    setStep("report")
    setChecked(false)
    setNotice(null)
    setWizardOpen(true)
  }

  useEffect(() => subscribeTopBarAction(topBarActionEvents.startReportSchedule, () => openWizard()), [])

  useEffect(() => () => {
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
  }, [])

  function handleOpenChange(open: boolean) {
    setWizardOpen(open)
    if (open) return
    setNotice(checked ? "Setup closed. Nothing was scheduled or sent." : "Setup closed. Nothing was saved.")
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null
      scheduleHeadingRef.current?.focus()
    })
  }

  const steps = useMemo<WizardStep[]>(() => [
    { id: "report", label: "Report", hint: "Choose the content this recurring delivery would use.", complete: Boolean(draft.report) },
    { id: "audience", label: "Audience", hint: "Name the future audience without sending anything.", complete: Boolean(draft.recipient.trim()) },
    { id: "cadence", label: "Cadence", hint: "Choose how often the report would run.", complete: Boolean(draft.cadence) },
    { id: "delivery", label: "Delivery", hint: "Set a local delivery time and explicit timezone.", complete: Boolean(draft.time && draft.timezone) },
    { id: "review", label: "Review", hint: "Review the complete plan before checking the setup.", complete: checked },
  ], [checked, draft])

  const columns = useMemo<DataTableColumn<ScheduledReportRow>[]>(() => [
    { id: "report", label: "Report", kind: "long-text", width: 245, minWidth: 200, resizable: true, sortValue: (row) => row.report, cell: (row) => <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{t(row.report)}</p> },
    { id: "recipients", label: "Recipients or audience", kind: "long-text", width: 225, minWidth: 180, resizable: true, sortValue: (row) => row.recipients, cell: (row) => <span className="text-[var(--md-text)]" dir="auto">{t(row.recipients)}</span> },
    { id: "cadence", label: "Cadence", kind: "text", width: 165, sortValue: (row) => row.cadence, cell: (row) => <span className="text-[var(--md-text)]">{t(row.cadence)}</span> },
    { id: "next", label: "Next delivery", kind: "date", width: 145, sortValue: (row) => row.nextDelivery, cell: (row) => <bdi className="tabular-nums text-[var(--md-text)]">{row.nextDelivery}</bdi> },
    { id: "delivery", label: "Delivery time", kind: "text", width: 190, sortValue: (row) => `${row.time} ${row.timezone}`, cell: (row) => <div dir="ltr" className="tabular-nums"><p className="text-[var(--md-ink)]">{row.time}</p><p className="mt-0.5 text-[12px] text-[var(--md-text)]">{row.timezone}</p></div> },
    { id: "status", label: "Status", kind: "status", width: 115, sortValue: (row) => row.status, cell: (row) => <StatusPill kind="status" tone={scheduledStatusTone[row.status]}>{t(row.status)}</StatusPill> },
    { id: "actions", label: "Actions", kind: "actions", width: 100, canHide: false, canPin: false, cell: (row) => <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]" onClick={() => openWizard(row)}>{t("Edit")}</Button> },
  ], [t])

  const scheduleHeader = <ReportingPageHeader headingRef={scheduleHeadingRef} title="Scheduled reports" description="Review recurring delivery plans and their next run. Changes are not saved yet." />
  const scheduleFeedback = notice ? <p role="status" aria-live="polite" className="rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a06)] px-3 py-2.5 text-[12.5px] leading-5 text-[var(--md-text)] shadow-[inset_0_0_0_1px_var(--md-accent-a14)]">{t(notice)}</p> : null

  return (
    <div className="md-page min-w-0">
      {scheduleState === "loading" || scheduleState === "error" ? (
        <div className="grid gap-3">
          {scheduleHeader}
          {scheduleFeedback}
          {scheduleState === "loading" ? <ScheduledReportsLoading /> : <ScheduledReportsError />}
        </div>
      ) : (
        <div className="grid gap-3">
          {scheduleHeader}
          <DataTable clientPagination ariaLabel="Scheduled reports" columnsButtonLabel="Manage scheduled report columns" contentBeforeTable={scheduleFeedback} columns={columns} rows={scheduleState === "empty" ? [] : scheduledReports} getRowKey={(row) => row.id} storageKey="scheduled-report-history-ui" rowClassName="h-[72px]" minimumWidth={1110} emptyState={<ScheduledReportsEmpty onCreate={() => openWizard()} />} />
        </div>
      )}

      <WizardDialog
        open={wizardOpen}
        onOpenChange={handleOpenChange}
        title="Set up scheduled report"
        description="Configure a recurring delivery plan. This UI does not save schedules or send reports."
        steps={steps}
        activeStepId={step}
        onStepChange={(next) => { setStep(next as ScheduleStep); setChecked(false) }}
        submitLabel={checked ? "Setup checked" : "Check setup"}
        onSubmit={() => setChecked(true)}
        submitDisabled={checked}
        bodyMinHeight={390}
      >
        <ScheduleStepContent step={step} draft={draft} setDraft={(next) => { setDraft(next); setChecked(false) }} checked={checked} />
      </WizardDialog>
    </div>
  )
}

export function ReportsPage({ route }: { route: ReportingRoute }) {
  useEffect(() => {
    const title = route === "/reports/scheduled" ? "Scheduled reports" : "Reports"
    document.title = `${title} · Multideck`
  }, [route])

  if (route === "/reports/scheduled") return <ScheduledReports />
  return <ReportsHistory />
}
