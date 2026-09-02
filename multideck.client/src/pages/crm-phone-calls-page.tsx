import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  Pencil,
  Phone,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "@/components/icons/hugeicons"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import {
  PhoneCallCoverage,
  PhoneCallEvidenceLabel,
  PhoneCallIdentityMatchReview,
  PhoneCallMatchPill,
  PhoneCallMetricStrip,
  PhoneCallOutcomePill,
  PhoneCallReasonList,
  PhoneCallSuggestedActions,
  PhoneCallTranscriptPill,
  PhoneCallVolumeChart,
  UnifiedPhoneCallTranscript,
} from "@/components/multideck/phone-call-components"
import {
  RegisterFacetSelect,
  RegisterRefreshButton,
  RegisterSearchField,
  RegisterToolbarActions,
} from "@/components/multideck/register-toolbar"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { MultideckDateRangePicker, getDefaultDateRange, type MultideckDateRange } from "@/components/multideck/date-picker"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { defaultDexterModelId } from "@/data/dexter-models"
import { rememberDexterHomeHandoff } from "@/lib/dexter-home-handoff"
import {
  getPhoneCall,
  getPhoneCallOverview,
  listPhoneCalls,
  reviewPhoneCallAction,
  reviewPhoneCallMatch,
  updatePhoneCallNotes,
  type PhoneCallActionDraft,
  type PhoneCallAIDisclosureStatus,
  type PhoneCallConsentStatus,
  type PhoneCallDetail,
  type PhoneCallListItem,
  type PhoneCallMatchCandidate,
  type PhoneCallMatchStatus,
  type PhoneCallOutcome,
  type PhoneCallOverview,
  type PhoneCallTranscriptStatus,
} from "@/lib/phone-calls-api"
import { cn } from "@/lib/utils"

type PhoneCallsView = "Overview" | "Calls"
type LoadState = "loading" | "ready" | "error"

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—"
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`
}

function formatConsentProvider(provider: string | null) {
  if (!provider) return null
  if (provider.toLowerCase() === "3cx") return "3CX"
  if (provider.toLowerCase() === "elevenlabs") return "ElevenLabs"
  if (provider.toLowerCase() === "twilio") return "Twilio"
  return provider
}

function initialView(): PhoneCallsView {
  return new URLSearchParams(window.location.search).get("view") === "calls" ? "Calls" : "Overview"
}

function pageHeader({ title, summary, action }: { title: ReactNode; summary: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0"><h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{title}</h1><p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{summary}</p></div>
      {action ? <div className="flex flex-wrap items-center gap-2 lg:justify-self-end">{action}</div> : null}
    </div>
  )
}

function CallsLoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLanguage()
  return (
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert">
      <SectionHeader title={t("Phone calls could not be loaded.")} meta={message} />
      <Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw className="size-4" />{t("Retry")}</Button>
    </Surface>
  )
}

function LocalPhoneCallsPreviewNotice() {
  const { t } = useLanguage()
  return (
    <Surface tone="soft" padding="sm" className="rounded-[var(--md-radius-xl)]" role="status">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a09)] text-[var(--md-accent)]"><Sparkles className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Local preview data")}</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{t("The Phone Calls service is not deployed to this Supabase project. Sample records are shown locally; approvals and edits will not be saved.")}</p>
        </div>
      </div>
    </Surface>
  )
}

function PartialPhoneAnalysisNotice({ analysedCalls, totalCalls }: { analysedCalls: number; totalCalls: number }) {
  const { t } = useLanguage()
  const scopeDescription = t("Total call volume is exact. Rates, trends, reasons and coverage currently analyse {analysed} of {total} calls.")
    .replace("{analysed}", String(analysedCalls))
    .replace("{total}", String(totalCalls))
  return (
    <Surface tone="soft" padding="sm" className="rounded-[var(--md-radius-xl)]" role="status">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-amber)_12%,transparent)] text-[var(--md-amber)]"><ShieldAlert aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Detailed phone analysis is partial")}</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{scopeDescription}</p>
        </div>
      </div>
    </Surface>
  )
}

function PhoneCallsFreshness({
  updatedAt,
  refreshing,
  refreshError,
  onRefresh,
  disabled = false,
}: {
  updatedAt: string | null
  refreshing: boolean
  refreshError: string
  onRefresh: () => void
  disabled?: boolean
}) {
  const { language, t } = useLanguage()
  const updatedDate = updatedAt ? new Date(updatedAt) : null
  const readableUpdatedAt = updatedDate && !Number.isNaN(updatedDate.getTime())
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(updatedDate)
    : null

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-[var(--md-subtle)]">
      <span className={cn("inline-flex min-w-0 items-center gap-1.5", refreshError && "text-[var(--md-red)]")} role="status" aria-live="polite">
        <Clock aria-hidden="true" className="size-3 shrink-0" />
        {refreshing
          ? t("Updating phone calls…")
          : refreshError
            ? t("Phone call data could not be refreshed. Existing records remain on screen.")
            : readableUpdatedAt
              ? <>{t("Last updated")} <time dateTime={updatedAt ?? undefined}>{readableUpdatedAt}</time></>
              : t("Waiting for the first successful refresh")}
      </span>
      <Button variant="ghost" size="sm" className="h-8 px-2" disabled={refreshing || disabled} aria-label={t("Refresh live phone data")} onClick={onRefresh}>
        <RefreshCw aria-hidden="true" className={cn("size-3", refreshing && "animate-spin motion-reduce:animate-none")} />
        {t("Refresh")}
      </Button>
    </div>
  )
}

function EmptyCalls({ filtered, onClear }: { filtered?: boolean; onClear?: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="grid min-h-[300px] place-items-center px-6 py-10 text-center">
      <div className="max-w-[390px]"><span className="mx-auto grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Phone aria-hidden="true" className="size-5" /></span><h2 className="mt-4 text-[15px] font-medium text-[var(--md-ink)]">{t(filtered ? "No calls match these filters" : "No calls in this period")}</h2><p className="mt-2 text-[12.5px] leading-5 text-[var(--md-text)]">{t(filtered ? "Try a broader date range or clear the active call filters." : "Choose a broader call period or wait for the next authorised provider sync.")}</p>{filtered && onClear ? <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>{t("Clear filters")}</Button> : null}</div>
    </div>
  )
}

function usePhoneCallColumns(navigate: (path: string) => void) {
  const { language, t } = useLanguage()
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  return useMemo<DataTableColumn<PhoneCallListItem>[]>(() => [
    {
      id: "caller", label: t("Caller"), kind: "identity", width: 240, minWidth: 190, resizable: true,
      sortValue: (call) => call.callerName || call.callerPhone,
      cellTitle: (call) => `${call.callerName || t("Unknown caller")} · ${call.callerPhone}`,
      cell: (call) => <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a08)] text-[var(--md-accent)]"><Phone className="size-3.5" /></span><div className="min-w-0"><p className="truncate text-[12.5px] font-medium text-[var(--md-ink)]" dir="auto">{call.callerName || t("Unknown caller")}</p><p className="truncate text-[10.5px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{call.callerPhone}</p></div></div>,
    },
    {
      id: "company", label: t("Company match"), kind: "long-text", width: 210, minWidth: 170, resizable: true,
      sortValue: (call) => call.company?.name || call.matchStatus,
      cell: (call) => <div className="min-w-0"><p className="truncate text-[12px] font-medium text-[var(--md-ink)]" dir="auto">{call.company?.name || "—"}</p><div className="mt-1"><PhoneCallMatchPill status={call.matchStatus} /></div></div>,
    },
    { id: "direction", label: t("Direction"), kind: "attribute", width: 116, sortValue: (call) => call.direction, cell: (call) => <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--md-text)]"><ArrowRight className={cn("size-3 text-[var(--md-accent)]", call.direction === "inbound" && "rotate-180")} />{t(call.direction === "inbound" ? "Inbound" : "Outbound")}</span> },
    { id: "outcome", label: t("Outcome"), kind: "status", width: 130, sortValue: (call) => call.outcome, cell: (call) => <PhoneCallOutcomePill outcome={call.outcome} /> },
    { id: "started", label: t("Started"), kind: "date", width: 170, sortValue: (call) => new Date(call.startedAt).getTime(), cell: (call) => <time dateTime={call.startedAt} className="text-[11.5px] tabular-nums text-[var(--md-text)]">{dateTime.format(new Date(call.startedAt))}</time> },
    { id: "handling", label: t("Handling time"), kind: "number", width: 126, sortValue: (call) => call.handlingSeconds, cell: (call) => <span className="text-[11.5px] tabular-nums text-[var(--md-text)]" data-i18n-skip dir="ltr">{formatDuration(call.handlingSeconds)}</span> },
    { id: "transcript", label: t("Transcript"), kind: "status", width: 132, sortValue: (call) => call.transcriptStatus, cell: (call) => <PhoneCallTranscriptPill status={call.transcriptStatus} /> },
    { id: "open", label: t("Open"), kind: "actions", width: 72, canHide: false, canPin: false, exportable: false, cell: (call) => <Button variant="ghost" size="icon" aria-label={`${t("Open call with")} ${call.callerName || call.callerPhone}`} onClick={(event) => { event.stopPropagation(); navigate(`/crm/phone-calls/${call.id}`) }}><ArrowRight className="size-3.5 rtl:scale-x-[-1]" /></Button> },
  ], [dateTime, navigate, t])
}

function PhoneCallsRegister({
  rows,
  total,
  offset,
  limit,
  loading,
  search,
  direction,
  outcome,
  matchStatus,
  transcriptStatus,
  compact,
  onSearch,
  onDirection,
  onOutcome,
  onMatchStatus,
  onTranscriptStatus,
  onOffset,
  onRefresh,
  onClearFilters,
  navigate,
}: {
  rows: PhoneCallListItem[]
  total: number
  offset: number
  limit: number
  loading: boolean
  search: string
  direction: string
  outcome: string
  matchStatus: string
  transcriptStatus: string
  compact?: boolean
  onSearch: (value: string) => void
  onDirection: (value: string) => void
  onOutcome: (value: string) => void
  onMatchStatus: (value: string) => void
  onTranscriptStatus: (value: string) => void
  onOffset: (value: number) => void
  onRefresh: () => void
  onClearFilters: () => void
  navigate: (path: string) => void
}) {
  const { t } = useLanguage()
  const columns = usePhoneCallColumns(navigate)
  const filters = compact ? null : (
    <RegisterToolbarActions pending={loading}>
      <RegisterFacetSelect label={t("Direction")} allLabel={t("All directions")} value={direction} onChange={onDirection} options={[{ value: "inbound", label: t("Inbound") }, { value: "outbound", label: t("Outbound") }]} />
      <RegisterFacetSelect label={t("Outcome")} allLabel={t("All outcomes")} value={outcome} onChange={onOutcome} options={["answered", "missed", "declined", "voicemail"].map((value) => ({ value, label: t(value.replace(/^./, (letter) => letter.toUpperCase())) }))} />
      <RegisterFacetSelect label={t("Match")} allLabel={t("All matches")} value={matchStatus} onChange={onMatchStatus} options={[{ value: "matched", label: t("Matched") }, { value: "review", label: t("Needs review") }, { value: "unmatched", label: t("Unmatched") }]} />
      <RegisterFacetSelect label={t("Transcript")} allLabel={t("All transcripts")} value={transcriptStatus} onChange={onTranscriptStatus} options={[{ value: "complete", label: t("Complete") }, { value: "partial", label: t("Partial") }, { value: "pending", label: t("Processing") }, { value: "failed", label: t("Failed") }]} />
      <RegisterSearchField value={search} onChange={onSearch} onClear={() => onSearch("")} label={t("Search phone calls")} placeholder={t("Caller, number or company…")} />
      <RegisterRefreshButton pending={loading} onRefresh={onRefresh} />
    </RegisterToolbarActions>
  )
  return (
    <DataTable
      ariaLabel={t("Phone calls")}
      columnsButtonLabel={t("Manage phone call columns")}
      columns={columns}
      rows={rows}
      getRowKey={(call) => call.id}
      storageKey="crm-phone-calls"
      minimumWidth={1080}
      compactToolbar
      showToolbar={!compact}
      toolbarFilters={filters}
      emptyState={<EmptyCalls filtered={Boolean(search || direction || outcome || matchStatus || transcriptStatus)} onClear={onClearFilters} />}
      onRowClick={(call) => navigate(`/crm/phone-calls/${call.id}`)}
      rowAriaLabel={(call) => `${t("Open call with")} ${call.callerName || call.callerPhone}`}
      pagination={compact ? undefined : { offset, limit, total, loading, onOffsetChange: onOffset }}
      enableSelectionExport={false}
    />
  )
}

export function CrmPhoneCallsPage({ navigate, callId, currentUser }: { navigate: (path: string) => void; callId?: string; currentUser?: AuthUserSummary | null }) {
  const { t } = useLanguage()
  if (!hasPermission(currentUser, "CRM.PhoneCalls.Read")) {
    return <div className="md-page"><Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert"><SectionHeader title={t("Phone calls are not available for your role") } meta={t("Ask a Multideck administrator for Phone Calls read access.")} /><Button variant="outline" className="mt-4" onClick={() => navigate("/crm")}>{t("Back to CRM")}</Button></Surface></div>
  }
  if (callId) return <CrmPhoneCallDetailPage callId={callId} navigate={navigate} canReview={hasPermission(currentUser, "CRM.PhoneCalls.Review")} />
  return <CrmPhoneCallsRegisterPage navigate={navigate} />
}

function CrmPhoneCallsRegisterPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [view, setView] = useState<PhoneCallsView>(initialView)
  const [dateRange, setDateRange] = useState<MultideckDateRange>(() => getDefaultDateRange())
  const [overview, setOverview] = useState<PhoneCallOverview | null>(null)
  const [overviewState, setOverviewState] = useState<LoadState>("loading")
  const [overviewRefreshing, setOverviewRefreshing] = useState(false)
  const [overviewError, setOverviewError] = useState("")
  const [rows, setRows] = useState<PhoneCallListItem[]>([])
  const [total, setTotal] = useState(0)
  const [listPreview, setListPreview] = useState(false)
  const [listState, setListState] = useState<LoadState>("loading")
  const [listRefreshing, setListRefreshing] = useState(false)
  const [listError, setListError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [direction, setDirection] = useState("")
  const [outcome, setOutcome] = useState("")
  const [matchStatus, setMatchStatus] = useState("")
  const [transcriptStatus, setTranscriptStatus] = useState("")
  const [offset, setOffset] = useState(0)
  const limit = 20
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
  const overviewLoadedRef = useRef(false)
  const listLoadedRef = useRef(false)
  const overviewQueryRef = useRef("")
  const listQueryRef = useRef("")
  const lastRefreshRequestRef = useRef(Date.now())
  const requestRefresh = useCallback(() => {
    lastRefreshRequestRef.current = Date.now()
    setReloadKey((value) => value + 1)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search); setOffset(0) }, 260)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return
      lastRefreshRequestRef.current = Date.now()
      setReloadKey((value) => value + 1)
    }
    const interval = window.setInterval(refreshWhenVisible, 60_000)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshRequestRef.current >= 60_000) refreshWhenVisible()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const queryKey = `${dateRange.start ?? ""}|${dateRange.end ?? ""}|${timezone}`
    const backgroundRefresh = overviewLoadedRef.current && overviewQueryRef.current === queryKey
    setOverviewRefreshing(backgroundRefresh)
    setOverviewState(backgroundRefresh ? "ready" : "loading")
    if (!backgroundRefresh) setOverview(null)
    setOverviewError("")
    getPhoneCallOverview({ from: dateRange.start, to: dateRange.end, timezone }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        overviewLoadedRef.current = true
        overviewQueryRef.current = queryKey
        setOverview(result)
        setOverviewState("ready")
        setLastUpdatedAt(new Date().toISOString())
        setOverviewRefreshing(false)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setOverviewError(error instanceof Error ? error.message : t("The overview could not be loaded."))
        setOverviewState(backgroundRefresh ? "ready" : "error")
        setOverviewRefreshing(false)
      })
    return () => controller.abort()
  }, [dateRange.end, dateRange.start, reloadKey, t, timezone])

  useEffect(() => {
    const controller = new AbortController()
    const queryKey = [offset, limit, timezone, debouncedSearch, dateRange.start ?? "", dateRange.end ?? "", direction, outcome, matchStatus, transcriptStatus].join("|")
    const backgroundRefresh = listLoadedRef.current && listQueryRef.current === queryKey
    setListRefreshing(backgroundRefresh)
    setListState(backgroundRefresh ? "ready" : "loading")
    if (!backgroundRefresh) { setRows([]); setTotal(0) }
    setListError("")
    listPhoneCalls({ offset, limit, timezone, search: debouncedSearch, from: dateRange.start, to: dateRange.end, direction: direction as "inbound" | "outbound" | "all", outcome: outcome as PhoneCallOutcome | "all", matchStatus: matchStatus as PhoneCallMatchStatus | "all", transcriptStatus: transcriptStatus as PhoneCallTranscriptStatus | "all", sort: { id: "started", direction: "desc" } }, controller.signal)
      .then((result) => { if (controller.signal.aborted) return; listLoadedRef.current = true; listQueryRef.current = queryKey; setRows(result.rows); setTotal(result.total); setListPreview(Boolean(result.preview)); setListState("ready"); setListRefreshing(false); setLastUpdatedAt(new Date().toISOString()) })
      .catch((error) => { if (controller.signal.aborted) return; setListError(error instanceof Error ? error.message : t("The call register could not be loaded.")); setListState(backgroundRefresh ? "ready" : "error"); setListRefreshing(false) })
    return () => controller.abort()
  }, [dateRange.end, dateRange.start, debouncedSearch, direction, matchStatus, offset, outcome, reloadKey, t, timezone, transcriptStatus])

  const changeView = useCallback((next: PhoneCallsView) => {
    setView(next)
    const url = new URL(window.location.href)
    if (next === "Calls") url.searchParams.set("view", "calls")
    else url.searchParams.delete("view")
    window.history.replaceState(window.history.state, "", url)
  }, [])

  const registerProps = {
    rows, total, offset, limit, loading: listState === "loading" || listRefreshing, search, direction, outcome, matchStatus, transcriptStatus,
    onSearch: setSearch, onDirection: (value: string) => { setDirection(value); setOffset(0) }, onOutcome: (value: string) => { setOutcome(value); setOffset(0) },
    onMatchStatus: (value: string) => { setMatchStatus(value); setOffset(0) }, onTranscriptStatus: (value: string) => { setTranscriptStatus(value); setOffset(0) },
    onOffset: setOffset, onRefresh: requestRefresh, onClearFilters: () => { setSearch(""); setDirection(""); setOutcome(""); setMatchStatus(""); setTranscriptStatus(""); setOffset(0) }, navigate,
  }
  const backgroundRefreshError = [overviewState === "ready" ? overviewError : "", listState === "ready" ? listError : ""].filter(Boolean).join(" ")

  return (
    <div className="md-page md-page-stack-compact min-w-0 max-w-full">
      {pageHeader({
        title: t("Phone calls"),
        summary: t("Call outcomes, matched CRM context and reviewable follow-up from the tenant phone journey."),
        action: <><div className="w-[min(100%,280px)]"><MultideckDateRangePicker value={dateRange} onChange={(range) => { setDateRange(range); setOffset(0) }} title="Call period" description="Choose the calls included in analytics and the register." triggerClassName="h-10 bg-[var(--md-surface)]" /></div><SegmentedControl options={["Overview", "Calls"] as const} value={view} onChange={changeView} ariaLabel={t("Phone calls view")} /></>,
      })}

      {overview?.preview || listPreview ? <LocalPhoneCallsPreviewNotice /> : null}
      {overview?.analysisScope?.status === "partial" ? <PartialPhoneAnalysisNotice analysedCalls={overview.analysisScope.analysedCalls} totalCalls={overview.analysisScope.totalCalls} /> : null}
      <PhoneCallsFreshness updatedAt={lastUpdatedAt} refreshing={overviewRefreshing || listRefreshing} refreshError={backgroundRefreshError} onRefresh={requestRefresh} />
      <span className="sr-only" role="status" aria-live="polite">{listRefreshing ? t("Updating phone calls…") : ""}</span>

      {view === "Overview" ? (
        overviewState === "loading" ? <Surface padding="none" className="rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label={t("Loading phone analytics…")} minHeight={520} /></Surface>
          : overviewState === "error" ? <CallsLoadFailure message={overviewError} onRetry={requestRefresh} />
            : overview ? (
              <div className="grid gap-[var(--md-page-stack-gap-compact)]">
                <PhoneCallMetricStrip metrics={overview.metrics} />
                <div className="grid min-w-0 gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.7fr)]">
                  <PhoneCallVolumeChart data={overview.volumeSeries} timezone={overview.timezone || timezone} />
                  <PhoneCallReasonList reasons={overview.reasons} />
                </div>
                <div className="grid min-w-0 gap-[var(--md-page-stack-gap-compact)]">
                  <PhoneCallCoverage items={overview.coverage} />
                  <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]"><div className="flex items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]"><div><h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Recent calls")}</h2><p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">{t("Latest deduplicated provider call records")}</p></div><div className="flex items-center gap-2">{listRefreshing && listState === "ready" ? <span className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--md-subtle)]"><RefreshCw aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />{t("Updating…")}</span> : null}<Button variant="ghost" size="sm" onClick={() => changeView("Calls")}>{t("View all")}<ArrowRight className="size-3 rtl:scale-x-[-1]" /></Button></div></div>{listState === "error" ? <div className="p-4"><CallsLoadFailure message={listError} onRetry={requestRefresh} /></div> : listState === "loading" ? <DotGridLoaderPanel label={t("Loading recent calls…")} minHeight={260} /> : <PhoneCallsRegister {...registerProps} compact rows={rows.slice(0, 5)} total={Math.min(total, 5)} />}</Surface>
                </div>
              </div>
            ) : null
      ) : listState === "error" ? <CallsLoadFailure message={listError} onRetry={requestRefresh} />
        : listState === "loading" && !rows.length ? <Surface padding="none" className="rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label={t("Loading phone calls…")} minHeight={480} /></Surface>
          : <PhoneCallsRegister {...registerProps} />}
    </div>
  )
}

function EditableCallText({ title, value, placeholder, context, error, readOnly = false, editing, onEdit, onChange, onSave, onCancel, saving }: { title: string; value: string; placeholder: string; context?: ReactNode; error?: string; readOnly?: boolean; editing: boolean; onEdit: () => void; onChange: (value: string) => void; onSave: () => void; onCancel: () => void; saving: boolean }) {
  const { t } = useLanguage()
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)

  useEffect(() => {
    if (wasEditing.current && !editing) editButtonRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t(title)}</h2>{context}</div>{editing || readOnly ? null : <Button ref={editButtonRef} variant="ghost" size="icon" aria-label={`${t("Edit")} ${t(title)}`} onClick={onEdit}><Pencil aria-hidden="true" className="size-3.5" /></Button>}</div>
      {editing ? <><Textarea autoFocus value={value} aria-label={t(title)} placeholder={t(placeholder)} onChange={(event) => onChange(event.target.value)} className="mt-3 min-h-28 bg-[var(--md-field-bg)] text-[13px]" /><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>{t("Cancel")}</Button><Button size="sm" disabled={saving} onClick={onSave}>{saving ? t("Saving…") : t("Save")}</Button></div></> : <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-5 text-[var(--md-text)]" dir="auto">{value || t(placeholder)}</p>}
      {error ? <p className="mt-2 text-[11px] leading-4 text-[var(--md-red)]" role="alert">{error}</p> : null}
    </Surface>
  )
}

function PhoneCallPrivacySection({ call }: { call: Pick<PhoneCallDetail, "id" | "aiDisclosureStatus" | "recordingConsentStatus" | "transcriptionConsentStatus" | "consentDisclosureVersion" | "consentDisclosedAt" | "consentEvidence" | "timezone"> }) {
  const { language, t } = useLanguage()
  const rows: Array<{ id: string; label: string; status: PhoneCallAIDisclosureStatus | PhoneCallConsentStatus }> = [
    { id: "ai", label: "AI receptionist disclosure", status: call.aiDisclosureStatus },
    { id: "recording", label: "Recording consent", status: call.recordingConsentStatus },
    { id: "transcription", label: "Transcription consent", status: call.transcriptionConsentStatus },
  ]
  const needsAttention = rows.some((row) => row.status === "conflict" || row.status === "declined")
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: call.timezone || undefined })
  const statusLabel = (status: PhoneCallAIDisclosureStatus | PhoneCallConsentStatus) => status === "disclosed" ? "Disclosed" : status === "received" ? "Received" : status === "declined" ? "Declined" : status === "not_required" ? "Not required" : status === "conflict" ? "Conflicting evidence" : "Not confirmed"
  const formatEvidenceTime = (value: string | null) => {
    if (!value) return t("Not recorded")
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? <bdi data-i18n-skip dir="ltr">{value}</bdi> : <time dateTime={value}>{dateTime.format(date)}</time>
  }
  const provider = formatConsentProvider(call.consentEvidence.provider)

  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <section aria-labelledby={`phone-call-privacy-${call.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`phone-call-privacy-${call.id}`} className="text-[14px] font-medium text-[var(--md-ink)]">{t("Privacy and consent")}</h2>
            <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Provider-derived disclosure and consent evidence. Unknown does not mean consent.")}</p>
          </div>
          <Shield aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" />
        </div>
        {needsAttention ? (
          <div className="mt-3 flex items-start gap-2.5 bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] px-3 py-2.5 text-[11px] leading-4 text-[var(--md-text)] shadow-[var(--md-stroke-bottom)]" role="alert">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--md-red)]" />
            <p><span className="font-medium text-[var(--md-red)]">{t("Privacy evidence needs attention.")}</span> {t("A disclosure or consent status is declined or conflicting. Review the evidence before relying on the recording or transcript.")}</p>
          </div>
        ) : null}
        <dl className="mt-3">
          {rows.map((row) => {
            const issue = row.status === "conflict" || row.status === "declined"
            const positive = row.status === "disclosed" || row.status === "received"
            const StatusIcon = issue ? ShieldAlert : positive ? ShieldCheck : Shield
            return (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 shadow-[var(--md-stroke-bottom)] last:shadow-none">
                <dt className="text-[11.5px] text-[var(--md-text)]">{t(row.label)}</dt>
                <dd className={cn("inline-flex items-center gap-1.5 text-[10.5px] font-medium", issue ? "text-[var(--md-red)]" : positive ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")}>
                  <StatusIcon aria-hidden="true" className="size-3.5" />{t(statusLabel(row.status))}
                </dd>
              </div>
            )
          })}
        </dl>
        <details className="group mt-3 shadow-[var(--md-stroke-top)]">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--md-radius-md)] px-1 text-[11.5px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]">
            <span>{t("View consent evidence")}</span><ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-90 rtl:scale-x-[-1]" />
          </summary>
          <dl className="grid min-w-0 gap-x-5 gap-y-3 px-1 pb-2 pt-3 sm:grid-cols-2">
            <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Provider")}</dt><dd className="mt-1 break-words text-[11px] font-medium text-[var(--md-ink)]">{provider ? <bdi data-i18n-skip dir="ltr">{provider}</bdi> : t("Not recorded")}</dd></div>
            <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Evidence updated")}</dt><dd className="mt-1 break-words text-[11px] font-medium text-[var(--md-ink)]">{formatEvidenceTime(call.consentEvidence.updatedAt)}</dd></div>
            <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Source event")}</dt><dd className="mt-1 min-w-0 truncate text-[11px] font-medium text-[var(--md-ink)]" title={call.consentEvidence.sourceEventId || undefined}>{call.consentEvidence.sourceEventId ? <bdi data-i18n-skip dir="ltr">{call.consentEvidence.sourceEventId}</bdi> : t("Not recorded")}</dd></div>
            <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Disclosure version")}</dt><dd className="mt-1 break-words text-[11px] font-medium text-[var(--md-ink)]">{call.consentDisclosureVersion ? <bdi data-i18n-skip dir="ltr">{call.consentDisclosureVersion}</bdi> : t("Not recorded")}</dd></div>
            <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Disclosed at")}</dt><dd className="mt-1 break-words text-[11px] font-medium text-[var(--md-ink)]">{formatEvidenceTime(call.consentDisclosedAt)}</dd></div>
            <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Source fields")}</dt><dd className="mt-1 break-words text-[11px] font-medium text-[var(--md-ink)]">{call.consentEvidence.sourceFields.length ? <bdi data-i18n-skip dir="ltr">{call.consentEvidence.sourceFields.join(", ")}</bdi> : t("No source fields were recorded.")}</dd></div>
          </dl>
        </details>
      </section>
    </Surface>
  )
}

function CrmPhoneCallDetailPage({ callId, navigate, canReview }: { callId: string; navigate: (path: string) => void; canReview: boolean }) {
  const { language, t } = useLanguage()
  const [call, setCall] = useState<PhoneCallDetail | null>(null)
  const [state, setState] = useState<LoadState>("loading")
  const [detailRefreshing, setDetailRefreshing] = useState(false)
  const [detailUpdatedAt, setDetailUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [showProvenance, setShowProvenance] = useState(false)
  const [editingField, setEditingField] = useState<"summary" | "notes" | null>(null)
  const [summary, setSummary] = useState("")
  const [meetingNotes, setMeetingNotes] = useState("")
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState("")
  const [matchBusy, setMatchBusy] = useState<string | null>(null)
  const [matchError, setMatchError] = useState("")
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const detailLoadedRef = useRef(false)
  const detailCallIdRef = useRef("")
  const lastDetailRefreshRequestRef = useRef(Date.now())
  const detailReviewBusy = editingField !== null || notesSaving || Boolean(matchBusy) || Boolean(actionBusy)
  const detailReviewBusyRef = useRef(detailReviewBusy)
  detailReviewBusyRef.current = detailReviewBusy
  const requestDetailRefresh = useCallback(() => {
    lastDetailRefreshRequestRef.current = Date.now()
    setReloadKey((value) => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const backgroundRefresh = detailLoadedRef.current && detailCallIdRef.current === callId
    setState(backgroundRefresh ? "ready" : "loading")
    setDetailRefreshing(backgroundRefresh)
    if (!backgroundRefresh) setCall(null)
    setError("")
    getPhoneCall(callId, controller.signal)
      .then((result) => { if (controller.signal.aborted) return; detailLoadedRef.current = true; detailCallIdRef.current = callId; setCall(result); if (!detailReviewBusyRef.current) { setSummary(result.summary || ""); setMeetingNotes(result.meetingNotes || "") } setState("ready"); setDetailRefreshing(false); setDetailUpdatedAt(new Date().toISOString()) })
      .catch((cause) => { if (controller.signal.aborted) return; setError(cause instanceof Error ? cause.message : t("This phone call could not be loaded.")); setState(backgroundRefresh ? "ready" : "error"); setDetailRefreshing(false) })
    return () => controller.abort()
  }, [callId, reloadKey, t])

  const detailNeedsLiveRefresh = Boolean(call && (!call.endedAt || call.transcriptStatus === "pending" || call.transcriptStatus === "partial"))

  useEffect(() => {
    if (!detailNeedsLiveRefresh || detailReviewBusy) return
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return
      lastDetailRefreshRequestRef.current = Date.now()
      setReloadKey((value) => value + 1)
    }
    const interval = window.setInterval(refreshWhenVisible, 60_000)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastDetailRefreshRequestRef.current >= 60_000) refreshWhenVisible()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [detailNeedsLiveRefresh, detailReviewBusy])

  const saveNotes = useCallback(async () => {
    if (!call) return
    setNotesError("")
    setNotesSaving(true)
    try {
      if (call.preview) {
        const next = { ...call, summary: summary.trim() || null, summarySource: summary.trim() ? "user_approved" as const : "none" as const, meetingNotes: meetingNotes.trim() || null, editVersion: call.editVersion + 1 }
        setCall(next); setSummary(next.summary || ""); setMeetingNotes(next.meetingNotes || ""); setEditingField(null); toast.info(t("Preview only — changes were not saved"))
        return
      }
      const next = await updatePhoneCallNotes(call.id, { summary: summary.trim() || null, meetingNotes: meetingNotes.trim() || null, editVersion: call.editVersion })
      setCall(next); setSummary(next.summary || ""); setMeetingNotes(next.meetingNotes || ""); setEditingField(null); toast.success(t("Call notes saved"))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("Call notes could not be saved.")
      setNotesError(message)
      toast.error(message)
    } finally { setNotesSaving(false) }
  }, [call, meetingNotes, summary, t])

  const linkCandidate = useCallback(async (candidate: PhoneCallMatchCandidate) => {
    if (!call) return
    setMatchError("")
    setMatchBusy(candidate.id)
    try {
      if (call.preview) {
        const next = {
          ...call,
          editVersion: call.editVersion + 1,
          matchStatus: "matched" as const,
          company: candidate.recordType === "company" ? { id: candidate.id, name: candidate.name } : call.company,
          contact: candidate.recordType === "contact" ? { id: candidate.id, name: candidate.name } : call.contact,
          lead: candidate.recordType === "lead" ? { id: candidate.id, name: candidate.name } : call.lead,
          matchCandidates: [],
        }
        setCall(next); toast.info(t("Preview only — changes were not saved"))
        return
      }
      const next = await reviewPhoneCallMatch(call.id, { contactId: candidate.recordType === "contact" ? candidate.id : null, companyId: candidate.recordType === "company" ? candidate.id : null, leadId: candidate.recordType === "lead" ? candidate.id : null, resolution: "link", editVersion: call.editVersion })
      setCall(next); toast.success(t("Call match reviewed"))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("The call match could not be updated.")
      setMatchError(message)
      toast.error(message)
    } finally { setMatchBusy(null) }
  }, [call, t])

  const resolveMatch = useCallback(async (resolution: "create_contact" | "leave_unmatched") => {
    if (!call) return
    setMatchError("")
    setMatchBusy(resolution)
    try {
      if (call.preview) {
        setCall({ ...call, editVersion: call.editVersion + 1, matchStatus: "unmatched", company: null, contact: null, lead: null, matchCandidates: [] })
        toast.info(t("Preview only — changes were not saved"))
        return
      }
      const next = await reviewPhoneCallMatch(call.id, { resolution, editVersion: call.editVersion })
      setCall(next); toast.success(t(resolution === "create_contact" ? "Contact created from reviewed caller" : "Call left unmatched"))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("The call match could not be updated.")
      setMatchError(message)
      toast.error(message)
    } finally { setMatchBusy(null) }
  }, [call, t])

  const reviewAction = useCallback(async (action: PhoneCallDetail["suggestedActions"][number], decision: "approve" | "dismiss", editedDraft?: Partial<PhoneCallActionDraft>) => {
    if (!call) return
    setCall((current) => current ? { ...current, suggestedActions: current.suggestedActions.map((item) => item.id === action.id ? { ...item, error: null } : item) } : current)
    setActionBusy(action.id)
    try {
      if (call.preview) {
        setCall({
          ...call,
          editVersion: call.editVersion + 1,
          followUpStatus: decision === "approve" ? "approved" : call.followUpStatus,
          suggestedActions: call.suggestedActions.map((item) => item.id === action.id ? { ...item, status: decision === "approve" ? "approved" : "dismissed", draft: editedDraft ? { ...item.draft, ...editedDraft } : item.draft } : item),
        })
        toast.info(t("Preview only — changes were not saved"))
        return
      }
      const next = await reviewPhoneCallAction(call.id, action.id, { decision, editedDraft, editVersion: call.editVersion })
      setCall(next); toast.success(t(decision === "approve" ? "Suggested action approved" : "Suggestion dismissed"))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("The suggested action could not be updated.")
      setCall((current) => current ? { ...current, suggestedActions: current.suggestedActions.map((item) => item.id === action.id ? { ...item, error: message } : item) } : current)
      toast.error(message)
    } finally { setActionBusy(null) }
  }, [call, t])

  const openDexterCallAnalysis = useCallback(() => {
    const prompt = `${t("Analyse this phone call using its summary, unified transcript, confirmed CRM links and reviewable suggestions.")} ${t("Keep confirmed provider evidence separate from derived analysis and cite this call record:")} ${callId}.`
    rememberDexterHomeHandoff({
      prompt,
      specialistId: "analytics",
      modelId: defaultDexterModelId,
      accessMode: "approve",
      fullAccessGrantId: null,
      clientSessionId: crypto.randomUUID(),
      mentions: [],
      uploadedDocuments: [],
    })
    navigate("/agent-dexter")
  }, [callId, navigate, t])

  if (state === "loading") return <div className="md-page"><Surface padding="none" className="rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label={t("Loading call record…")} minHeight={620} /></Surface></div>
  if (state === "error" || !call) return <div className="md-page md-page-stack"><Button variant="ghost" className="w-fit" onClick={() => navigate("/crm/phone-calls")}><ArrowLeft className="size-4 rtl:scale-x-[-1]" />{t("Back to phone calls")}</Button><CallsLoadFailure message={error} onRetry={requestDetailRefresh} /></div>

  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: call.timezone || undefined })
  const participantRole = (role: PhoneCallDetail["participants"][number]["role"]) => t(role === "caller" ? "Caller" : role === "receptionist" ? "Agent" : role === "employee" ? "Handler" : "External")
  const participants = call.participants.length ? (
    <span className="grid gap-1.5">
      {call.participants.map((participant) => (
        <span key={participant.id} className="block">
          <span dir="auto">{participant.name || t("Unknown participant")}</span>
          {participant.phone ? <> · <bdi data-i18n-skip dir="ltr">{participant.phone}</bdi></> : null}
          <span className="text-[var(--md-subtle)]"> ({participantRole(participant.role)})</span>
        </span>
      ))}
    </span>
  ) : t("Not recorded")
  const factRows: Array<[string, ReactNode]> = [
    ["Participants", participants],
    ["Duration", <bdi data-i18n-skip dir="ltr">{formatDuration(call.durationSeconds)}</bdi>],
    ["Providers", call.providerReferences.length ? <bdi dir="ltr">{call.providerReferences.map((reference) => reference.provider === "3cx" ? "3CX" : reference.provider === "elevenlabs" ? "ElevenLabs" : "Twilio").filter((provider, index, providers) => providers.indexOf(provider) === index).join(", ")}</bdi> : t("Not recorded")],
    ["Transfer", t(call.transfer.status === "accepted" ? "Accepted" : call.transfer.status === "declined" ? "Declined" : call.transfer.status === "not_offered" ? "Not offered" : "Unknown")],
    ["Recording", t(call.recordingState === "recorded" ? "Recorded" : call.recordingState === "not_recorded" ? "Not recorded" : "Unavailable")],
    ["Retention", call.retentionUntil ? <time dateTime={call.retentionUntil}>{dateTime.format(new Date(call.retentionUntil))}</time> : t("Not recorded")],
    ["Timezone", <bdi data-i18n-skip dir="ltr">{call.timezone}</bdi>],
  ]

  return (
    <div className="md-page md-page-stack-compact min-w-0 max-w-full">
      <Button variant="ghost" className="h-8 w-fit px-2 text-[12px]" onClick={() => navigate("/crm/phone-calls")}><ArrowLeft className="size-3.5 rtl:scale-x-[-1]" />{t("Back to phone calls")}</Button>
      {call.preview ? <LocalPhoneCallsPreviewNotice /> : null}
      {!canReview ? <Surface tone="soft" padding="sm" className="rounded-[var(--md-radius-xl)]" role="status"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-text)]"><Check aria-hidden="true" className="size-4" /></span><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Read-only call record")}</p><p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{t("You can review the conversation and CRM evidence, but changing matches, notes or suggested actions requires Phone Calls review access.")}</p></div></div></Surface> : null}
      <PhoneCallsFreshness updatedAt={detailUpdatedAt} refreshing={detailRefreshing} refreshError={state === "ready" ? error : ""} onRefresh={requestDetailRefresh} disabled={detailReviewBusy} />
      <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(250px,1.35fr)_repeat(5,minmax(120px,.7fr))] xl:items-center">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Phone className="size-5" /></span><div className="min-w-0"><h1 className="truncate text-[20px] font-medium text-[var(--md-ink)]" dir="auto">{call.callerName || t("Unknown caller")}</h1><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{call.callerPhone}</p></div></div>
          <div><p className="text-[10.5px] text-[var(--md-subtle)]">{t("Direction")}</p><p className="mt-1 text-[12px] font-medium text-[var(--md-ink)]">{t(call.direction === "inbound" ? "Inbound" : "Outbound")}</p></div>
          <div><p className="text-[10.5px] text-[var(--md-subtle)]">{t("Outcome")}</p><div className="mt-1"><PhoneCallOutcomePill outcome={call.outcome} /></div></div>
          <div><p className="text-[10.5px] text-[var(--md-subtle)]">{t("Start time")}</p><p className="mt-1 text-[11.5px] font-medium text-[var(--md-ink)]"><time dateTime={call.startedAt}>{dateTime.format(new Date(call.startedAt))}</time></p></div>
          <div><p className="text-[10.5px] text-[var(--md-subtle)]">{t("End time")}</p><p className="mt-1 text-[11.5px] font-medium text-[var(--md-ink)]">{call.endedAt ? <time dateTime={call.endedAt}>{dateTime.format(new Date(call.endedAt))}</time> : t("In progress")}</p></div>
          <div><p className="text-[10.5px] text-[var(--md-subtle)]">{t("Company match")}</p><div className="mt-1"><PhoneCallMatchPill status={call.matchStatus} /></div></div>
        </div>
      </Surface>

      <div className="grid min-w-0 gap-[var(--md-page-stack-gap-compact)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,.85fr)] 2xl:items-start">
        <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]"><div><h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Conversation")}</h2><p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">{t("One chronological transcript from greeting, through transfer, to the handler conversation")}</p></div><div className="flex flex-wrap items-center gap-2"><DexterActionPill label={t("Analyse call")} className="h-8 min-w-[118px] rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={openDexterCallAnalysis} /><Button variant="outline" size="sm" aria-pressed={showProvenance} onClick={() => setShowProvenance((value) => !value)}><Sparkles aria-hidden="true" className="size-3.5" />{t(showProvenance ? "Hide audit detail" : "Show audit detail")}</Button></div></div>
          <UnifiedPhoneCallTranscript call={call} showProvenance={showProvenance} />
        </Surface>

        <aside className="grid min-w-0 gap-[var(--md-page-stack-gap-compact)] 2xl:sticky 2xl:top-[76px]">
          <EditableCallText title="Call summary" value={summary} placeholder="No call summary is available yet." context={call.summarySource === "ai_generated" ? <PhoneCallEvidenceLabel evidence={{ kind: "derived", source: "multideck", observedAt: null }} /> : call.summarySource === "user_approved" ? <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--md-accent)]"><Check className="size-3" />{t("Reviewed by a user")}</span> : null} error={editingField === "summary" ? notesError : undefined} readOnly={!canReview || (editingField !== null && editingField !== "summary")} editing={editingField === "summary"} onEdit={() => { setNotesError(""); setEditingField("summary") }} onChange={setSummary} onSave={saveNotes} onCancel={() => { setNotesError(""); setSummary(call.summary || ""); setEditingField(null) }} saving={notesSaving} />
          <Surface padding="md" className="rounded-[var(--md-radius-xl)]"><div className="flex items-center justify-between gap-3"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Identity match")}</h2>{call.matchStatus === "matched" ? <Check className="size-4 text-[var(--md-accent)]" /> : <PhoneCallEvidenceLabel evidence={{ kind: "derived", source: "multideck", observedAt: null }} />}</div><div className="mt-3"><PhoneCallIdentityMatchReview call={call} readOnly={!canReview} busyId={matchBusy} onLink={linkCandidate} onCreateContact={() => { const query = new URLSearchParams({ fromCall: call.id, name: call.capturedCallerName || call.callerName || "", phone: call.callerPhone, company: call.capturedCompanyName || "" }); navigate(`/crm/contacts?${query}`) }} onLeaveUnmatched={() => resolveMatch("leave_unmatched")} />{matchError ? <p className="mt-3 text-[11px] leading-4 text-[var(--md-red)]" role="alert">{matchError}</p> : null}</div></Surface>
          <PhoneCallPrivacySection call={call} />
          <EditableCallText title="Meeting notes" value={meetingNotes} placeholder="No meeting notes have been added." error={editingField === "notes" ? notesError : undefined} readOnly={!canReview || (editingField !== null && editingField !== "notes")} editing={editingField === "notes"} onEdit={() => { setNotesError(""); setEditingField("notes") }} onChange={setMeetingNotes} onSave={saveNotes} onCancel={() => { setNotesError(""); setMeetingNotes(call.meetingNotes || ""); setEditingField(null) }} saving={notesSaving} />
          <Surface padding="md" className="rounded-[var(--md-radius-xl)]"><div className="flex items-center justify-between gap-3"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Suggested actions")}</h2><PhoneCallEvidenceLabel evidence={{ kind: "derived", source: "multideck", observedAt: null }} /></div><div className="mt-3"><PhoneCallSuggestedActions actions={call.suggestedActions} leadCandidates={call.matchCandidates} readOnly={!canReview} busyId={actionBusy} onReview={reviewAction} /></div></Surface>
          <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
            <div className="flex items-center justify-between gap-3"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Call facts and provenance")}</h2><PhoneCallTranscriptPill status={call.transcriptStatus} /></div>
            <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {factRows.map(([label, value]) => <div key={label}><dt className="text-[10.5px] text-[var(--md-subtle)]">{t(label)}</dt><dd className="mt-1 break-words text-[11.5px] font-medium text-[var(--md-ink)]">{value}</dd></div>)}
            </dl>
            {call.providerReferences.length ? (
              <div className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                <p className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Provider references")}</p>
                <dl className="mt-2 grid gap-2">
                  {call.providerReferences.map((reference) => (
                    <div key={`${reference.provider}:${reference.kind}:${reference.id}`} className="grid min-w-0 grid-cols-[120px_minmax(0,1fr)] items-baseline gap-2">
                      <dt className="text-[10.5px] text-[var(--md-text)]">{reference.provider === "3cx" ? "3CX" : reference.provider === "elevenlabs" ? "ElevenLabs" : "Twilio"} · {t(reference.kind.replace(/^./, (letter) => letter.toUpperCase()))}</dt>
                      <dd className="min-w-0 truncate text-[10.5px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr" title={reference.id}>{reference.id}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--md-accent)] hover:underline" onClick={() => setShowProvenance(true)}>{t("View provenance details")}<ExternalLink className="size-3" /></button>
          </Surface>
        </aside>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-[10.5px] text-[var(--md-subtle)]"><span>{t("All times shown in")} <bdi>{call.timezone}</bdi></span><span className="inline-flex items-center gap-1.5 text-[var(--md-accent)]"><Check className="size-3" />{t("Review is required before suggested actions change CRM data.")}</span></div>
    </div>
  )
}
