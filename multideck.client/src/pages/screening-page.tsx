import { defaultPaginationPageSize } from "@/lib/pagination"
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { CheckCircle2, Download, FileText, History, LoaderCircle, Search, ShieldAlert, ShieldCheck } from "@/components/icons/hugeicons"
import { registerControlClass } from "@/components/multideck/register-toolbar"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { ScreeningListFreshness, ScreeningMatchList, ScreeningOutcomePill, ScreeningResultSummary } from "@/components/multideck/screening-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import {
  decideScreeningCheck,
  downloadScreeningControlReport,
  getScreeningCheck,
  getScreeningControlReport,
  getScreeningWorkspace,
  runScreeningCheck,
  type ScreeningCheck,
  type ScreeningControlReport,
  type ScreeningListStatus,
  type ScreeningSourceArea,
} from "@/lib/screening-api"
import { cn } from "@/lib/utils"

const fieldClass = "h-9 rounded-[var(--md-radius-md)] px-3 text-base md:text-[12.5px]"
const secondaryActionClass = cn(registerControlClass, "transition-[background-color,box-shadow,color,opacity,transform] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100")

const sourceAreas: { value: ScreeningSourceArea; label: string }[] = [
  { value: "manual", label: "Standalone compliance check" },
  { value: "customer", label: "Customer" },
  { value: "crm", label: "CRM" },
  { value: "quote", label: "Quote" },
  { value: "booking", label: "Booking" },
  { value: "customs", label: "Customs declaration" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other workflow" },
]

const subjectRoles = ["Party", "Customer", "Supplier", "Carrier", "Agent", "Shipper", "Consignee", "Consignor", "Contact", "Customs declarant"]

function decisionTone(check: ScreeningCheck) {
  if (check.decisionCode === "sanctioned") return "red" as const
  if (check.decisionCode === "review_required") return "amber" as const
  if (check.decisionCode === "unavailable") return "neutral" as const
  return "green" as const
}

function decisionLabel(check: ScreeningCheck) {
  if (check.decisionCode === "automatic_clear") return "Automatic clear"
  if (check.decisionCode === "manual_clean") return "Manual clear"
  if (check.decisionCode === "sanctioned") return "Sanctioned"
  if (check.decisionCode === "unavailable") return "Do not rely on this result"
  return "Review required"
}

function formatDate(value: string | null | undefined, language: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(date)
}

export function ScreeningPage() {
  const { t, language } = useLanguage()
  const [list, setList] = useState<ScreeningListStatus | null>(null)
  const [checks, setChecks] = useState<ScreeningCheck[]>([])
  const [active, setActive] = useState<ScreeningCheck | null>(null)
  const [controlReport, setControlReport] = useState<ScreeningControlReport | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [country, setCountry] = useState("")
  const [sourceArea, setSourceArea] = useState<ScreeningSourceArea>("manual")
  const [sourceReference, setSourceReference] = useState("")
  const [subjectRole, setSubjectRole] = useState("Party")
  const [includeSimilar, setIncludeSimilar] = useState(false)
  const [running, setRunning] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const workspaceLoading = useRef(false)
  const linkedCheckLoaded = useRef(false)
  const checkRevision = useRef(0)
  const [deciding, setDeciding] = useState<"manual_clean" | "sanctioned" | null>(null)
  const [reporting, setReporting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [recentPage, setRecentPage] = useState(1)
  const [recentPageSize, setRecentPageSize] = useState(defaultPaginationPageSize)
  const [recentQuery, setRecentQuery] = useState("")
  const [recentsOpen, setRecentsOpen] = useState(false)

  const filteredRecent = useMemo(() => {
    const query = recentQuery.trim().toLocaleLowerCase(language)
    if (!query) return checks
    return checks.filter((check) => [
      check.subjectName,
      check.country,
      check.sourceLabel,
      check.sourceArea,
      check.subjectRole,
      decisionLabel(check),
    ].filter(Boolean).join(" ").toLocaleLowerCase(language).includes(query))
  }, [checks, language, recentQuery])
  const recentPageCount = Math.max(1, Math.ceil(filteredRecent.length / recentPageSize))
  const recentOffset = (recentPage - 1) * recentPageSize
  const visibleRecent = useMemo(() => filteredRecent.slice(recentOffset, recentOffset + recentPageSize), [filteredRecent, recentOffset, recentPageSize])

  const recentColumns = useMemo<DataTableColumn<ScreeningCheck>[]>(() => [
    {
      id: "party",
      label: "Party",
      kind: "identity",
      minWidth: 190,
      canHide: false,
      cell: (check) => <div className="min-w-0"><p className="truncate font-medium text-[var(--md-ink)]" dir="auto">{check.subjectName}</p>{check.country ? <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]" dir="auto">{check.country}</p> : null}</div>,
      sortValue: (check) => check.subjectName,
    },
    {
      id: "outcome",
      label: "Outcome",
      kind: "status",
      minWidth: 140,
      cell: (check) => <ScreeningOutcomePill outcome={check.outcome} stale={check.listStale} />,
      sortValue: (check) => check.outcome,
    },
    {
      id: "decision",
      label: "Decision",
      kind: "status",
      minWidth: 150,
      cell: (check) => <StatusPill tone={decisionTone(check)}>{t(decisionLabel(check))}</StatusPill>,
      sortValue: (check) => decisionLabel(check),
    },
    {
      id: "workflow",
      label: "Workflow context",
      kind: "text",
      minWidth: 180,
      cell: (check) => <div className="min-w-0"><p className="truncate text-[var(--md-ink)]">{t(sourceAreas.find((item) => item.value === check.sourceArea)?.label ?? "Other workflow")}</p>{check.sourceLabel ? <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]" dir="auto">{check.sourceLabel}</p> : null}</div>,
      sortValue: (check) => sourceAreas.find((item) => item.value === check.sourceArea)?.label ?? check.sourceArea,
    },
    {
      id: "role",
      label: "Role",
      kind: "attribute",
      minWidth: 130,
      cell: (check) => t(check.subjectRole.replace(/_/g, " ")),
      sortValue: (check) => check.subjectRole,
    },
    {
      id: "screened",
      label: "Screened",
      kind: "date",
      minWidth: 130,
      cell: (check) => <bdi>{formatDate(check.createdAt, language)}</bdi>,
      sortValue: (check) => new Date(check.createdAt).getTime(),
    },
    {
      id: "rescreen",
      label: "Rescreen due",
      kind: "date",
      minWidth: 130,
      cell: (check) => <bdi>{formatDate(check.rescreenDueAt, language) || "—"}</bdi>,
      sortValue: (check) => check.rescreenDueAt ? new Date(check.rescreenDueAt).getTime() : 0,
    },
  ], [language, t])

  async function loadWorkspace() {
    if (workspaceLoading.current) return
    workspaceLoading.current = true
    const revision = checkRevision.current
    setRefreshing(true)
    try {
      const workspace = await getScreeningWorkspace()
      if (revision === checkRevision.current) {
        setList(workspace.list)
        setChecks(workspace.checks)
      }
      const checkId = new URLSearchParams(window.location.search).get("check")
      if (checkId && !linkedCheckLoaded.current) {
        linkedCheckLoaded.current = true
        try {
          const fromList = workspace.checks.find((check) => check.id === checkId)
          setActive(fromList?.matches ? fromList : await getScreeningCheck(checkId))
        } catch {
          /* keep the workspace even if the linked result is gone */
        }
      }
      setLoadState("ready")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Party screening could not be loaded."))
      setList((current) => current ? { ...current, stale: true, refreshing: false, refreshMessage: "The UK Sanctions List could not be verified. Retry before screening." } : null)
      setLoadState("error")
    } finally {
      workspaceLoading.current = false
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadWorkspace()
    const onVisible = () => { if (document.visibilityState === "visible") void loadWorkspace() }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])
  useEffect(() => { if (recentPage > recentPageCount) setRecentPage(recentPageCount) }, [recentPage, recentPageCount])
  useEffect(() => { setRecentPage(1) }, [recentQuery])

  function updateCheck(check: ScreeningCheck) {
    checkRevision.current += 1
    setActive(check)
    setChecks((current) => [check, ...current.filter((item) => item.id !== check.id)].slice(0, 500))
    setRecentPage(1)
  }

  async function onScreen(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || running || refreshing) return
    setRunning(true)
    setError(null)
    setActive(null)
    try {
      const result = await runScreeningCheck({
        subjectName: name.trim(),
        country: country.trim() || null,
        sourceArea,
        sourceLabel: sourceReference.trim() || null,
        subjectRole: subjectRole.toLowerCase().replace(/\s+/g, "_"),
        includeSimilar,
      })
      updateCheck(result)
      if (result.list) setList(result.list)
      setControlReport(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The name could not be screened."))
    } finally {
      setRunning(false)
    }
  }

  async function onDecision(action: "manual_clean" | "sanctioned") {
    if (!active) return
    setDeciding(action)
    setError(null)
    try {
      const result = await decideScreeningCheck(active.id, action)
      updateCheck(result)
      setControlReport(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The screening decision could not be recorded."))
    } finally {
      setDeciding(null)
    }
  }

  async function onRunReport() {
    setReporting(true)
    setError(null)
    try {
      setControlReport(await getScreeningControlReport())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The screening report could not be generated."))
    } finally {
      setReporting(false)
    }
  }

  async function onDownloadReport() {
    setDownloading(true)
    setError(null)
    try {
      const blob = await downloadScreeningControlReport()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "multideck-party-screening-report.csv"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The detailed screening report could not be downloaded."))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="md-page md-page-stack">
      <header className="flex flex-wrap items-center justify-between gap-3 py-1">
        <h1 className="flex min-w-0 items-center gap-2.5 text-balance text-[24px] font-medium leading-[1.1] tracking-[-0.02em] text-[var(--md-ink)]">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
            <ShieldCheck className="size-4" strokeWidth={1.4} aria-hidden="true" />
          </span>
          <span>{t("Compliance controls")}</span>
        </h1>
      </header>

      <section aria-label={t("Sanctions list and reports")} className="py-1">
        <ScreeningListFreshness
          list={list}
          compact
          loading={refreshing}
          onRetry={() => { setError(null); void loadWorkspace() }}
          action={(
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button type="button" variant="outline" aria-pressed={recentsOpen} aria-controls="screening-recents" onClick={() => setRecentsOpen((current) => !current)} className={cn(secondaryActionClass, recentsOpen && "bg-[var(--md-selected-bg)] text-[var(--md-accent)]")}>
                <History className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                {t("Recents")}
              </Button>
              <Button type="button" variant="outline" className={secondaryActionClass} onClick={() => void onDownloadReport()} disabled={downloading}>
                {downloading ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                {t(downloading ? "Preparing report…" : "Download report")}
              </Button>
              <Button type="button" className={cn(secondaryActionClass, "bg-[var(--md-sidebar-bg)] text-[var(--md-ink)]")} onClick={() => void onRunReport()} disabled={reporting}>
                {reporting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileText className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                {t(reporting ? "Running report…" : "Run report")}
              </Button>
            </div>
          )}
        />
        {controlReport ? (
          <div className="mt-4 grid gap-2 pt-4 shadow-[var(--md-stroke-top)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Screened" value={controlReport.report.screened.toLocaleString(language)} />
            <Metric label="Automatic clear" value={controlReport.report.automaticClear.toLocaleString(language)} tone="green" />
            <Metric label="Manual clear" value={controlReport.report.manualClear.toLocaleString(language)} tone="green" />
            <Metric label="Review required" value={controlReport.report.reviewRequired.toLocaleString(language)} tone="amber" />
            <Metric label="Sanctioned" value={controlReport.report.sanctioned.toLocaleString(language)} tone="red" />
            <Metric label="Next rescreen due" value={formatDate(controlReport.report.nextRescreenDueAt, language) || "—"} />
          </div>
        ) : null}
      </section>

      {recentsOpen ? (
        <Surface id="screening-recents" className="overflow-hidden rounded-[var(--md-radius-2xl)]" padding="none">
          <div className="px-5 py-4">
            <SectionHeader title={t("Recent screens")} meta={t("Last 3 months")} />
          </div>
          {loadState === "loading" ? <div className="px-4 pb-4"><DotGridLoaderPanel label={t("Loading screening results")} minHeight={180} /></div> : null}
          {loadState === "error" ? (
            <div className="mx-4 mb-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-5 text-center shadow-[var(--md-shadow-line)]">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Recent screens are unavailable")}</p>
              <p className="mt-1 text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t("Refresh the page to try loading the screening history again.")}</p>
            </div>
          ) : null}
          {loadState === "ready" ? (
            <DataTable
              ariaLabel={t("Screening history")}
              columnsButtonLabel={t("Manage screening history columns")}
              columns={recentColumns}
              rows={visibleRecent}
              getRowKey={(check) => check.id}
              storageKey="screening-history"
              selectedRowKey={active?.id}
              onRowClick={(check) => {
                setActive(check)
                setRecentsOpen(false)
                void getScreeningCheck(check.id).then(setActive).catch(() => undefined)
              }}
              rowAriaLabel={(check) => `${check.subjectName}, ${t(decisionLabel(check))}`}
              rowClassName="h-[60px]"
              minimumWidth={1040}
              enableSelectionExport={false}
              className="px-4 pb-4"
              toolbarSearch={(
                <label className="relative min-w-0 sm:w-[280px]">
                  <span className="sr-only">{t("Search recent screens")}</span>
                  <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                  <Input
                    value={recentQuery}
                    onChange={(event) => setRecentQuery(event.target.value)}
                    aria-label={t("Search recent screens")}
                    placeholder={t("Name, workflow or decision…")}
                    className="h-8 bg-[var(--md-field-bg)] ps-9 text-base sm:text-[12px]"
                  />
                </label>
              )}
              pagination={{
                offset: recentOffset,
                limit: recentPageSize,
                total: filteredRecent.length,
                onOffsetChange: (offset) => setRecentPage(Math.floor(offset / recentPageSize) + 1),
                onLimitChange: setRecentPageSize,
              }}
              emptyState={(
                <div className="mx-auto max-w-md px-5 py-8">
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(recentQuery ? "No recent screens match this search" : "No recent screens")}</p>
                  <p className="mt-1 text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t(recentQuery ? "Try a party name, workflow or decision." : "Completed screening checks will appear here for 3 months.")}</p>
                </div>
              )}
            />
          ) : null}
        </Surface>
      ) : (
        <Surface className="overflow-hidden rounded-[var(--md-radius-2xl)]" padding="none">
          <div className="px-4 py-3">
            <SectionHeader title={t("Screen a party")} />
          </div>

          <form className="grid gap-3 px-4 pb-4" onSubmit={(event) => void onScreen(event)}>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(150px,0.7fr)_minmax(210px,1.1fr)_minmax(160px,0.75fr)]">
              <FieldLabel label={t("Name")}>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Legal or trading name")} className={fieldClass} dir="auto" autoComplete="off" />
              </FieldLabel>
              <FieldLabel label={t("Country")} optional>
                <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t("GB or United Kingdom")} className={fieldClass} dir="auto" autoComplete="country-name" />
              </FieldLabel>
              <SelectField label={t("Workflow context")} value={sourceArea} onChange={(value) => setSourceArea(value as ScreeningSourceArea)} options={sourceAreas.map((item) => ({ value: item.value, label: t(item.label) }))} />
              <SelectField label={t("Party role")} value={subjectRole} onChange={setSubjectRole} options={subjectRoles.map((role) => ({ value: role, label: t(role) }))} />
            </div>
            {sourceArea !== "manual" ? (
              <div className="max-w-[520px]">
                <FieldLabel label={t("Workflow reference")} optional>
                  <Input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder={t("Quote, booking, declaration or document reference")} className={fieldClass} dir="auto" />
                </FieldLabel>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="screening-include-similar" className="flex w-fit cursor-pointer items-center gap-2.5 rounded-[var(--md-radius-md)] py-1 outline-none">
                <Checkbox id="screening-include-similar" checked={includeSimilar} onCheckedChange={(checked) => setIncludeSimilar(checked === true)} aria-describedby="screening-include-similar-description" />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="text-[12.5px] font-medium leading-5 text-[var(--md-ink)]">{t("Include similar names")}</span>
                  <span id="screening-include-similar-description" className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{t("82% similarity threshold")}</span>
                </span>
              </label>
              <Button type="submit" disabled={running || refreshing || !name.trim()} className="h-9 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3.5 text-[12.5px] font-medium text-[var(--md-accent-ink)] transition-[background-color,box-shadow,opacity,transform] hover:bg-[var(--md-accent-hover)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100">
                {running ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="size-4" strokeWidth={2} aria-hidden="true" />}
                {t(running ? "Screening party…" : "Run screening")}
              </Button>
            </div>
            {error ? <p role="alert" className="rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_7%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)]">{error}</p> : null}
          </form>

          <div className="px-4 py-3 shadow-[var(--md-stroke-top)]">
            <SectionHeader
              title={t("Latest result")}
              meta={active ? formatDate(active.createdAt, language) : t("No result selected")}
              action={active ? <div className="flex flex-wrap items-center gap-2"><ScreeningOutcomePill outcome={active.outcome} stale={active.listStale} /><StatusPill tone={decisionTone(active)}>{t(decisionLabel(active))}</StatusPill></div> : undefined}
            />
          </div>
          {active ? (
            <div className="grid gap-3 pb-4">
              <ScreeningResultSummary subjectName={active.subjectName} country={active.country} outcome={active.outcome} />
              {active.decisionCode === "review_required" ? (
                <div className="mx-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className={secondaryActionClass} onClick={() => void onDecision("manual_clean")} disabled={deciding !== null}>
                    {deciding === "manual_clean" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                    {t("Mark as clear")}
                  </Button>
                  <Button type="button" variant="outline" className={cn(secondaryActionClass, "text-[var(--md-red)]")} onClick={() => void onDecision("sanctioned")} disabled={deciding !== null}>
                    {deciding === "sanctioned" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldAlert className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                    {t("Mark as sanctioned")}
                  </Button>
                </div>
              ) : null}
              {active.matches?.length ? <ScreeningMatchList matches={active.matches} /> : active.outcome === "clear" || active.outcome === "unavailable" ? null : (
                <p className="mx-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-3 text-[13px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("No listed names matched this search.")}</p>
              )}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center px-5 pb-5 text-center">
              <div className="max-w-[34rem]">
                <span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><ShieldCheck className="size-4" strokeWidth={1.4} aria-hidden="true" /></span>
                <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No screening result yet")}</p>
                <p className="mt-1 text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t("Enter a party name and run screening to see the current list result here.")}</p>
              </div>
            </div>
          )}
        </Surface>
      )}
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11.5px] font-medium leading-4 text-[var(--md-text)]">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-9 w-full rounded-[var(--md-radius-md)] px-3 text-base md:text-[12.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function FieldLabel({ label, optional = false, children }: { label: string; optional?: boolean; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <label className="grid gap-1">
      <span className="flex flex-wrap items-baseline justify-between gap-2 text-[11.5px] font-medium leading-4 text-[var(--md-text)]">
        <span>{label}</span>
        {optional ? <span className="font-normal text-[var(--md-subtle)]">{t("Optional")}</span> : null}
      </span>
      {children}
    </label>
  )
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "amber" | "red" }) {
  const { t } = useLanguage()
  const toneClass = tone === "green" ? "bg-[rgba(22,163,74,0.06)]" : tone === "amber" ? "bg-[rgba(245,158,11,0.08)]" : tone === "red" ? "bg-[rgba(185,28,28,0.06)]" : "bg-[var(--md-hover)]"
  return <div className={cn("rounded-[var(--md-radius-lg)] px-3 py-2.5 shadow-[var(--md-shadow-line)]", toneClass)}><p className="text-[11px] font-medium leading-4 text-[var(--md-text)]">{t(label)}</p><p className="mt-1 text-[18px] font-medium leading-6 tabular-nums text-[var(--md-ink)]" dir="auto">{value}</p></div>
}
