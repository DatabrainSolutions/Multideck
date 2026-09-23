import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, ChartLine, CheckCircle2, Info, RefreshCw, Workflow } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { CountUpValue } from "@/components/multideck/rolling-digits"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { DashboardModeChart } from "@/components/multideck/dashboard-mode-chart"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { toneToVar } from "@/components/multideck/status-pill"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { CrmEmptyState, CrmMeter, CrmPanel, CrmPanelLink, CrmRow } from "@/components/multideck/crm-dashboard"
import { crmInitials } from "@/lib/crm-dashboard"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { getSalesBriefing, getSalesInsights, type SalesInsightDeal, type SavedSalesBriefing, type SalesInsightFilters, type SalesInsights, type SalesNarrativeMembership } from "@/lib/crm-insights-api"
import { parseSalesInsightFilters, stageDurationLabel, projectSalesThemes, type ProjectedSalesTheme } from "@/lib/crm-insights"
import { getChartScale, getGridValues } from "@/lib/area-chart"
import type { StatusTone } from "@/data/operational-data"
import "./crm-dashboard-analysis.css"

function accessDenied(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && ["42501", "PGRST301", "PGRST302", "AUTH_REQUIRED"].includes(String(error.code))
}

/** A dashboard section that has nothing to show yet, and what would change that. */
export type CrmDashboardPending = { title: string; detail: string }

type Fact = { label: string; value: string }
type Drawer =
  | { kind: "deals"; title: string; description: string; ids: string[]; total: number; limited: boolean; facts?: Fact[] }
  | { kind: "theme"; title: string; description: string; narratives: SalesNarrativeMembership[]; total: number }
  | { kind: "weekly" }
  | { kind: "definitions" }
type NamedDeal = { id: string; name: string; companyName?: string | null; ownerName?: string | null; stageName?: string | null }
type Scope = { pipelineId: string | null; ownerId: string | null }
type Reason = NonNullable<SalesInsightDeal["reason"]>

const reasonMeta: Record<Reason, { label: string; tone: StatusTone }> = {
  overdue_action: { label: "Overdue", tone: "red" },
  missing_action: { label: "No next action", tone: "amber" },
  stalled_stage: { label: "Stage review", tone: "blue" },
}
const reasonOrder: Reason[] = ["overdue_action", "missing_action", "stalled_stage"]
const actionLimit = 6

const stageViews = ["Time in stage", "Moved on"] as const
const trendViews = ["Outcomes", "Pipeline activity"] as const
const themeViews = ["Outcomes", "Current stages"] as const

function reasonOf(deal: SalesInsightDeal): Reason {
  return deal.reason ?? "stalled_stage"
}

/**
 * The sales half of the CRM dashboard: what the period produced, which open
 * deals need a step, where deals wait, and why they were lost. The period is
 * owned by the dashboard header; this section only narrows by pipeline and
 * owner. Every figure opens the deals behind it.
 */
export function CrmDashboardInsights({
  navigate,
  days,
  pending = [],
}: {
  navigate: (route: string) => void
  days: SalesInsightFilters["days"]
  /** Dashboard sections outside the analysis that are waiting on data, listed
   *  with the analysis's own so there is one place that says what is missing. */
  pending?: CrmDashboardPending[]
}) {
  const { language } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [scope, setScope] = useState<Scope>(() => {
    const parsed = parseSalesInsightFilters(window.location.search)
    return { pipelineId: parsed.pipelineId, ownerId: parsed.ownerId }
  })
  const filters = useMemo<SalesInsightFilters>(() => ({ days, ...scope }), [days, scope])
  const filterKey = JSON.stringify(filters)
  const [loaded, setLoaded] = useState<{ data: SalesInsights; key: string; filters: SalesInsightFilters } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [briefing, setBriefing] = useState<SavedSalesBriefing | null>(null)
  const [briefingError, setBriefingError] = useState(false)
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [stageView, setStageView] = useState<(typeof stageViews)[number]>("Time in stage")
  const [requestedTrendView, setTrendView] = useState<(typeof trendViews)[number] | null>(null)
  const [themeView, setThemeView] = useState<(typeof themeViews)[number]>("Outcomes")
  const [actionFilter, setActionFilter] = useState<Reason | null>(null)
  // The drawer keeps its last content while it closes, so it never empties mid-exit.
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const data = loaded?.data
  const current = loaded?.key === filterKey

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set("days", String(filters.days))
    if (filters.pipelineId) url.searchParams.set("pipeline", filters.pipelineId); else url.searchParams.delete("pipeline")
    if (filters.ownerId) url.searchParams.set("owner", filters.ownerId); else url.searchParams.delete("owner")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }, [filterKey, filters])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    setDrawerOpen(false)
    getSalesInsights(filters).then((result) => {
      if (active) setLoaded({ data: result, key: filterKey, filters })
    }).catch((error: unknown) => {
      if (active) {
        if (accessDenied(error)) { setLoaded(null); setBriefing(null) }
        setLoadError(error instanceof Error ? error.message : "Sales analysis could not be loaded.")
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filterKey, refresh])

  // A saved briefing is read on arrival/return. These reads never trigger generation.
  useEffect(() => {
    let active = true
    let busy = false
    const read = async () => {
      if (busy || document.visibilityState === "hidden") return
      busy = true
      if (active) setBriefingLoading(true)
      try {
        const result = await getSalesBriefing()
        if (active) { setBriefing(result); setBriefingError(false) }
      } catch (error) { if (active) { if (accessDenied(error)) { setBriefing(null); setLoaded(null) } setBriefingError(true) } }
      finally { busy = false; if (active) setBriefingLoading(false) }
    }
    void read()
    window.addEventListener("focus", read)
    document.addEventListener("visibilitychange", read)
    return () => { active = false; window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", read) }
  }, [refresh])

  const number = useCallback((value: number, decimals = 0) => new Intl.NumberFormat(language, { maximumFractionDigits: decimals }).format(value), [language])
  const date = useCallback((value: string | number | null, includeTime = false) => {
    if (value === null) return "Not recorded"
    const parsed = new Date(typeof value === "string" && value.length === 10 ? `${value}T12:00:00Z` : value)
    if (Number.isNaN(parsed.getTime())) return "Not recorded"
    return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", ...(includeTime ? { hour: "2-digit", minute: "2-digit" } as const : {}), timeZone: "UTC" }).format(parsed)
  }, [language])
  // A range that crosses a year carries the year on both ends, or 12 months reads as one day.
  const dateRange = useCallback((from: string, to: string) => {
    const start = new Date(from.length === 10 ? `${from}T12:00:00Z` : from)
    const end = new Date(to.length === 10 ? `${to}T12:00:00Z` : to)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${date(from)} – ${date(to)}`
    const withYear = start.getUTCFullYear() !== end.getUTCFullYear()
    const format = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } as const : {}), timeZone: "UTC" })
    return `${format.format(start)} – ${format.format(end)}`
  }, [date, language])
  const stageTime = useCallback((value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—"
    if (value < 1 / 24) return `${number(Math.max(1, Math.round(value * 1440)))}m`
    if (value < 1) return `${number(value * 24, 1)}h`
    return `${number(value, 1)}d`
  }, [number])

  const scopeLabel = (value: SalesInsightFilters) => [
    data?.filters.pipelines.find((row) => row.id === value.pipelineId)?.name ?? "All pipelines",
    data?.filters.owners.find((row) => row.id === value.ownerId)?.name ?? "Whole team",
  ].join(" · ")
  const namedDeals = useMemo(() => {
    const entries: NamedDeal[] = data ? [...(briefing?.result?.narrative?.deals ?? []), ...(data.records ?? []), ...data.stages.flatMap((stage) => [...(stage.deals ?? []), ...(stage.progressionDeals ?? [])]), ...data.slippingDeals, ...data.attentionDeals, ...data.outcomes] : []
    return new Map(entries.map((row) => [row.id, row]))
  }, [data, briefing])

  const attentionDeals = useMemo(() => data ? [...new Map(data.attentionDeals.map((deal) => [deal.id, deal])).values()].sort((a, b) => {
    const difference = reasonOrder.indexOf(reasonOf(a)) - reasonOrder.indexOf(reasonOf(b))
    return difference || (a.nextActionDueAt ?? "9999").localeCompare(b.nextActionDueAt ?? "9999") || a.name.localeCompare(b.name)
  }) : [], [data])
  const reasonCounts = reasonOrder.map((reason) => ({ reason, count: attentionDeals.filter((deal) => reasonOf(deal) === reason).length })).filter((row) => row.count > 0)
  const activeActionFilter = actionFilter && reasonCounts.some((row) => row.reason === actionFilter) ? actionFilter : null
  const visibleActions = (activeActionFilter ? attentionDeals.filter((deal) => reasonOf(deal) === activeActionFilter) : attentionDeals).slice(0, actionLimit)
  const actionsCapped = Boolean(data?.detailLimit && attentionDeals.length >= data.detailLimit)
  const actionListRef = useRef<HTMLDivElement>(null)
  const [actionReserve, setActionReserve] = useState<number>()
  // Measured on the unfiltered pass, so a filter narrows the list without
  // collapsing the panel and shunting the page up under the pointer.
  useLayoutEffect(() => {
    if (activeActionFilter || !actionListRef.current) return
    setActionReserve(actionListRef.current.getBoundingClientRect().height)
  }, [activeActionFilter, attentionDeals])
  const actionSummary = [
    ...reasonCounts.map((row) => `${number(row.count)} ${row.reason === "overdue_action" ? "overdue" : row.reason === "missing_action" ? "without a next action" : row.count === 1 ? "stage review" : "stage reviews"}`),
    ...(actionsCapped ? ["more may be waiting"] : []),
  ].join(" · ")

  const duration = stageView === "Time in stage"
  const stages = data?.stages.filter((stage) => duration ? stage.openDeals > 0 : stage.enteredDeals > 0) ?? []
  const sparseStageSample = duration && stages.length > 0 && stages.every((stage) => stage.sampleSize < 3)
  const stagePeak = Math.max(...stages.map((stage) => (duration ? stage.medianDays : stage.progressionRatePct) ?? 0), duration ? 0 : 100, 0.0001)
  const showPipelineGroups = new Set(stages.map((stage) => stage.pipelineId)).size > 1
  const stageGroups = stages.reduce<Array<{ pipelineId: string; pipelineName: string; stages: typeof stages }>>((groups, stage) => {
    const last = groups[groups.length - 1]
    if (last && last.pipelineId === stage.pipelineId) last.stages.push(stage)
    else groups.push({ pipelineId: stage.pipelineId, pipelineName: stage.pipelineName, stages: [stage] })
    return groups
  }, [])
  const hasStageData = Boolean(data?.stages.some((stage) => stage.openDeals > 0 || stage.enteredDeals > 0))

  const losses = data?.lossReasons.filter((row) => row.count > 0) ?? []
  const lossPeak = Math.max(...losses.map((row) => row.count), 1)

  const buckets = data?.trend?.buckets ?? []
  const hasOutcomes = buckets.some((row) => row.won > 0 || row.lost > 0)
  const hasPipelineActivity = buckets.some((row) => row.created > 0 || row.entered > 0)
  const hasTrend = hasOutcomes || hasPipelineActivity
  const trendView = requestedTrendView ?? (hasOutcomes ? "Outcomes" : "Pipeline activity")
  const hasSelectedTrend = trendView === "Outcomes" ? hasOutcomes : hasPipelineActivity
  const trendSeries = trendView === "Outcomes" ? [
    { key: "won", label: "Won", color: "var(--md-accent)", values: buckets.map((row) => row.won) },
    { key: "lost", label: "Lost", color: "var(--md-amber)", values: buckets.map((row) => row.lost) },
  ] : [
    { key: "created", label: "New deals", color: "var(--md-accent)", values: buckets.map((row) => row.created) },
    { key: "entered", label: "Stage entries", color: "var(--md-amber)", values: buckets.map((row) => row.entered) },
  ]

  const saved = briefing?.result
  const briefUpdating = Boolean(briefing?.automationReady && (briefing.status === "pending" || briefing.status === "generating" || briefing.status === "stale"))
  const themes = projectSalesThemes(saved, loaded?.filters ?? filters, data?.generatedAt ?? new Date().toISOString())
  const themeScale = getChartScale(themes.themes.map((theme) => theme.deals.length))
  const currentScope = loaded?.filters ?? filters
  const themeFailed = briefingError || Boolean(briefing?.lastErrorCode) || briefing?.status === "failed"
  const themePending = briefingLoading || briefUpdating
  const themeStatus = themeFailed
    ? saved?.themes?.length ? "Showing the last completed review" : "AI themes unavailable"
    : saved?.themes?.length ? `AI review ${date(briefing?.generatedAt ?? saved.generatedAt)}${briefUpdating ? " · updating" : ""}`
      : briefingLoading ? "Reading sales themes…" : briefUpdating ? "AI themes are being prepared" : "AI themes not available"

  const created = useMemo(() => [...new Set(buckets.flatMap((row) => row.createdDealIds))], [buckets])
  const createdTotal = buckets.reduce((sum, row) => sum + row.created, 0)
  const wonIds = data?.outcomes.filter((row) => row.outcome === "won").map((row) => row.id) ?? []
  const lostIds = data?.outcomes.filter((row) => row.outcome === "lost").map((row) => row.id) ?? []
  const periodRange = data ? dateRange(data.period.from, data.period.to) : days === 365 ? "Last 12 months" : `Last ${days} days`

  const waiting: CrmDashboardPending[] = data?.coverage.totalDeals ? [
    ...(!themes.themes.length && !themeFailed && !themePending ? [{ title: "Feedback themes", detail: saved?.themes?.length ? "No analysed feedback matches this pipeline and owner." : "Appears once lost deals carry feedback or actions are completed with notes." }] : []),
    ...(!hasTrend ? [{ title: "Weekly activity", detail: "Appears once deals are created, moved, won or lost in this period." }] : []),
    ...(!hasStageData ? [{ title: "Where deals wait", detail: "Appears once open deals sit in a pipeline stage." }] : []),
    ...(!losses.length ? [{ title: "Why deals were lost", detail: "Appears once a deal in this period is marked lost with a reason." }] : []),
    ...pending,
  ] : pending

  function show(next: Drawer) {
    setDrawer(next)
    setDrawerOpen(true)
  }
  function openDeals(title: string, description: string, ids: string[], total = ids.length, limited = false, facts?: Fact[]) {
    const unique = [...new Set(ids)]
    show({ kind: "deals", title, description, ids: unique.slice(0, 100), total: Math.max(total, unique.length), limited, facts })
  }
  function openTheme(theme: ProjectedSalesTheme, label = theme.label, dealIds = theme.deals.map((deal) => deal.id)) {
    const selected = new Set(dealIds)
    show({ kind: "theme", title: label, description: theme.description, narratives: theme.memberships.filter((membership) => selected.has(membership.dealId)), total: selected.size })
  }
  function openDeal(id: string) {
    const query = new URLSearchParams({ days: String(filters.days) })
    if (filters.pipelineId) query.set("pipeline", filters.pipelineId)
    if (filters.ownerId) query.set("owner", filters.ownerId)
    navigate(`/crm/deals/${encodeURIComponent(id)}?from=${encodeURIComponent(`/crm?${query}`)}`)
  }

  const stats: Array<{ key: string; label: string; value: string; detail: string; onOpen?: () => void }> = data ? [
    { key: "new", label: "New deals", value: number(createdTotal), detail: "created in this period", onOpen: created.length ? () => openDeals("New deals", `Deals created ${periodRange}.`, created, createdTotal, buckets.some((row) => row.evidenceTruncated)) : undefined },
    { key: "won", label: "Won", value: number(data.summary.wonDeals), detail: "closed as won", onOpen: wonIds.length ? () => openDeals("Won deals", `Deals closed as won ${periodRange}.`, wonIds, data.summary.wonDeals, wonIds.length < data.summary.wonDeals) : undefined },
    { key: "lost", label: "Lost", value: number(data.summary.lostDeals), detail: "closed as lost", onOpen: lostIds.length ? () => openDeals("Lost deals", `Deals closed as lost ${periodRange}.`, lostIds, data.summary.lostDeals, lostIds.length < data.summary.lostDeals) : undefined },
    { key: "rate", label: "Win rate", value: data.summary.winRatePct === null ? "—" : `${number(data.summary.winRatePct)}%`, detail: data.summary.closedDeals ? `of ${number(data.summary.closedDeals)} closed` : "nothing closed yet" },
    { key: "open", label: "Open now", value: number(data.summary.openDeals), detail: "across the pipeline" },
  ] : []

  const scopeControls = <div className="crm-sa-scope" aria-label="Sales analysis scope">
    <Select value={scope.pipelineId ?? "all"} onValueChange={(value) => setScope((previous) => ({ ...previous, pipelineId: value === "all" ? null : value }))}>
      <SelectTrigger aria-label="Pipeline" className="crm-sa-select"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">All pipelines</SelectItem>{data?.filters.pipelines.map((pipeline) => <SelectItem key={pipeline.id} value={pipeline.id}><span data-i18n-skip>{pipeline.name}</span></SelectItem>)}</SelectContent>
    </Select>
    <Select value={scope.ownerId ?? "all"} onValueChange={(value) => setScope((previous) => ({ ...previous, ownerId: value === "all" ? null : value }))}>
      <SelectTrigger aria-label="Deal owner" className="crm-sa-select"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">Whole team</SelectItem>{data?.filters.owners.map((owner) => <SelectItem key={owner.id} value={owner.id}><span data-i18n-skip>{owner.name}</span></SelectItem>)}</SelectContent>
    </Select>
    <Button type="button" variant="ghost" size="icon" className="crm-sa-icon-button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} aria-label="Refresh sales analysis">
      {loading ? <DotGridLoader size="sm" decorative /> : <RefreshCw className="size-3.5" />}
    </Button>
    <Button type="button" variant="ghost" size="sm" className="crm-sa-text-button" onClick={() => show({ kind: "definitions" })} disabled={!data}>
      <Info className="size-3.5" />How it's measured
    </Button>
  </div>

  const nextActions = data ? <CrmPanel
    title="Next actions"
    meta={attentionDeals.length ? `${number(attentionDeals.length)} open ${attentionDeals.length === 1 ? "deal" : "deals"}` : "Open deals"}
    action={attentionDeals.length > actionLimit ? <CrmPanelLink label="View all" onClick={() => openDeals("Next actions", "Open deals that need a next action or a stage review.", attentionDeals.map((deal) => deal.id), attentionDeals.length, actionsCapped)} /> : undefined}
    footer={attentionDeals.length ? actionSummary : undefined}
  >
    {attentionDeals.length ? <>
      {reasonCounts.length > 1 ? <div className="md-crm-controls">
        <div className="md-crm-chips" role="group" aria-label="Filter next actions">
          {[{ reason: null as Reason | null, count: attentionDeals.length }, ...reasonCounts].map((chip) => {
            const selected = activeActionFilter === chip.reason
            return <button key={chip.reason ?? "all"} type="button" className="md-crm-chip" aria-pressed={selected} style={{ ["--md-chip-accent" as string]: toneToVar(chip.reason ? reasonMeta[chip.reason].tone : "teal") }} onClick={() => setActionFilter(chip.reason)}>
              {selected ? <motion.span layoutId="crm-sa-action-chip" className="md-crm-chip-indicator" aria-hidden="true" transition={shouldReduceMotion ? { duration: 0 } : mdMotion.spring} /> : null}
              <span className="md-crm-chip-label">{chip.reason ? reasonMeta[chip.reason].label : "All"}</span>
              <span className="md-crm-chip-count" data-i18n-skip dir="ltr">{chip.count}</span>
            </button>
          })}
        </div>
      </div> : null}
      <div ref={actionListRef} className="md-crm-list" style={activeActionFilter && actionReserve ? { minHeight: actionReserve } : undefined}>
        <AnimatePresence initial={false} mode="popLayout">
        {visibleActions.map((deal, index) => {
          const reason = reasonOf(deal)
          const meta = reasonMeta[reason]
          const detail = reason === "overdue_action" ? `Due ${date(deal.nextActionDueAt)}` : reason === "stalled_stage" ? `${stageTime(deal.daysInStage)} in stage` : deal.stageName ?? "Open deal"
          return <CrmRow
            key={deal.id}
            index={index}
            accent={toneToVar(meta.tone)}
            ariaLabel={`${deal.name} – ${meta.label}`}
            onOpen={() => openDeal(deal.id)}
            glyph={<span className="md-crm-avatar" aria-hidden="true" data-i18n-skip>{crmInitials(deal.companyName ?? deal.name)}</span>}
            title={<span data-i18n-skip>{deal.name}</span>}
            sub={<span data-i18n-skip>{[deal.companyName, deal.ownerName ?? "Unassigned"].filter(Boolean).join(" · ")}</span>}
            side={<>
              <span className="crm-sa-reason" style={{ color: toneToVar(meta.tone) }}>{meta.label}</span>
              <span className="md-crm-row-age"><span data-i18n-skip={reason === "missing_action" ? "" : undefined}>{detail}</span><ArrowRight className="md-crm-row-arrow size-3" strokeWidth={1.6} aria-hidden="true" /></span>
            </>}
          />
        })}
        </AnimatePresence>
      </div>
    </> : <CrmEmptyState icon={CheckCircle2} title="Every open deal has a next step." body="Deals without a next action, with an overdue action, or sitting too long in a stage appear here." />}
  </CrmPanel> : null

  const stagePanel = data && hasStageData ? <CrmPanel
    title="Where deals wait"
    meta={duration ? "Median time in current stage" : "Share of entries that moved on"}
    footer={duration
      ? sparseStageSample ? "One or two deals per stage – read these as individual deals, not a pattern." : "Median time in the current stage. Small samples are marked."
      : "Recorded stage entries in this period that moved to another stage."}
  >
    <div className="md-crm-controls"><SegmentedControl className="crm-sa-switch" options={stageViews} value={stageView} onChange={setStageView} ariaLabel="Stage measure" /></div>
    {stages.length ? <div className="md-crm-list">
      {stageGroups.map((group) => <div key={group.pipelineId} className="crm-sa-group">
        {showPipelineGroups ? <p className="crm-sa-group-label" data-i18n-skip>{group.pipelineName}</p> : null}
        <AnimatePresence initial={false} mode="popLayout">
        {group.stages.map((stage, index) => {
          const value = duration ? stage.medianDays : stage.progressionRatePct
          const ids = duration ? stage.dealIds : stage.progressionDealIds ?? []
          return <CrmRow
            key={stage.id}
            index={index}
            ariaLabel={`${stage.name}: ${duration ? `median ${stageDurationLabel(stage.medianDays, language)}` : `${stage.movedOnDeals} of ${stage.enteredDeals} moved on`}`}
            onOpen={ids.length ? () => openDeals(stage.name, duration
              ? `${stage.pipelineName}. ${number(stage.sampleSize)} of ${number(stage.openDeals)} open deals measured.`
              : `${stage.pipelineName}. ${number(stage.movedOnDeals)} of ${number(stage.enteredDeals)} recorded entries moved to another stage.`, ids, ids.length, false, duration ? [
              { label: "Median", value: stageTime(stage.medianDays) },
              { label: "Average", value: stageTime(stage.averageDays) },
              ...(stage.minimumDays != null && stage.maximumDays != null && stage.maximumDays > stage.minimumDays ? [{ label: "Range", value: `${stageTime(stage.minimumDays)} – ${stageTime(stage.maximumDays)}` }] : []),
            ] : undefined) : undefined}
            title={<span data-i18n-skip>{stage.name}</span>}
            sub={duration ? `${number(stage.sampleSize)} measured${stage.sampleSize < 3 ? " · small sample" : ""}` : `${number(stage.movedOnDeals)} of ${number(stage.enteredDeals)} moved on`}
            meter={<CrmMeter share={(value ?? 0) / stagePeak} index={index} />}
            side={<>
              <span className="md-crm-row-value" data-i18n-skip dir="ltr"><CountUpValue value={duration ? stageTime(value) : value === null ? "—" : `${Math.round(value)}%`} /></span>
              <span className="md-crm-row-age">{duration ? `${number(stage.openDeals)} open` : "moved on"}{ids.length ? <ArrowRight className="md-crm-row-arrow size-3" strokeWidth={1.6} aria-hidden="true" /> : null}</span>
            </>}
          />
        })}
        </AnimatePresence>
      </div>)}
    </div> : <CrmEmptyState icon={Workflow} title={duration ? "No open deals in a stage." : "No stage moves in this period."} body={duration ? "Stage time appears once open deals sit in a pipeline stage." : "Progression appears once deals enter a stage in this period."} />}
  </CrmPanel> : null

  const trendPanel = data && hasTrend ? <CrmPanel
    title="Weekly activity"
    meta={trendView === "Outcomes" ? "Won and lost by week" : "New deals and stage entries by week"}
    action={<CrmPanelLink label="Weekly data" onClick={() => show({ kind: "weekly" })} />}
    className="crm-sa-trend"
  >
    <div className="md-crm-controls"><SegmentedControl className="crm-sa-switch" options={trendViews} value={trendView} onChange={setTrendView} ariaLabel="Weekly measure" /></div>
    {hasSelectedTrend ? buckets.length > 1
      ? <DashboardModeChart title="Weekly events" labels={buckets.map((row) => date(row.start))} series={trendSeries} height={214} className="crm-sa-chart" />
      : <div className="crm-sa-single-week">
        <p>Week of {date(buckets[0].start)}</p>
        <div>{trendSeries.map((series) => <span key={series.key}><strong>{number(series.values[0])}</strong>{series.label}</span>)}</div>
        <p>One week recorded so far. The trend line appears from the second week.</p>
      </div>
      : <CrmEmptyState icon={ChartLine} title={trendView === "Outcomes" ? "No deals won or lost in this period." : "No pipeline activity in this period."} body="Switch measure, or widen the dashboard period." />}
  </CrmPanel> : null

  const lossPanel = data && losses.length ? <CrmPanel
    title="Why deals were lost"
    meta={`${number(data.summary.lostDeals)} lost`}
    footer={data.summary.lostDeals < 5 ? "Small sample. Open the deals before drawing conclusions." : undefined}
  >
    <div className="md-crm-list">
      {losses.map((reason, index) => <CrmRow
        key={reason.code}
        index={index}
        accent="var(--md-amber)"
        ariaLabel={`${reason.name}: ${reason.count} lost deals`}
        onOpen={() => openDeals(reason.name, `${number(reason.count)} of ${number(data.summary.lostDeals)} lost deals · ${number(reason.sharePct, 1)}%.`, reason.dealIds, reason.count)}
        title={<span data-i18n-skip>{reason.name}</span>}
        sub={`${number(reason.sharePct)}% of losses`}
        meter={<CrmMeter share={reason.count / lossPeak} index={index} />}
        side={<span className="md-crm-row-value" data-i18n-skip dir="ltr"><CountUpValue value={String(reason.count)} /></span>}
      />)}
    </div>
  </CrmPanel> : null

  const themePanel = data && saved?.schemaVersion === 3 && saved.narrative && themes.themes.length > 0 ? <CrmPanel
    title="Feedback themes"
    meta="AI-grouped from loss feedback and completed action notes"
    className="crm-sa-themes"
    footer={<span className="crm-sa-theme-meta">
      <span role="status">{themeStatus}</span>
      <span>{number(themes.documents)} records across {number(themes.deals)} deals · {dateRange(saved.narrative.from, saved.narrative.to)}{saved.narrative.truncated ? " · bounded sample" : ""}{currentScope.days > 90 ? " · feedback is limited to 90 days" : ""}</span>
    </span>}
  >
    <div className="md-crm-controls"><SegmentedControl className="crm-sa-switch" options={themeViews} value={themeView} onChange={setThemeView} ariaLabel="Theme comparison" /></div>
    {themeView === "Outcomes" ? <div className="crm-sa-theme-outcomes">
      <div className="crm-sa-theme-axis" aria-hidden="true"><span /><div>{getGridValues(themeScale).map((value) => <span key={value}>{number(value)}</span>)}</div><span>Deals</span></div>
      {themes.themes.map((theme) => <div className="crm-sa-theme-row" key={theme.id}>
        <button type="button" className="crm-sa-theme-label" onClick={() => openTheme(theme)}><strong>{theme.label}</strong><span>{number(theme.counts.won)} won · {number(theme.counts.lost)} lost · {number(theme.counts.open)} open</span></button>
        <div className="crm-sa-theme-track">{(["won", "lost", "open"] as const).map((outcome) => theme.counts[outcome] ? <button type="button" key={outcome} data-outcome={outcome} style={{ width: `${theme.counts[outcome] / themeScale.max * 100}%` }} title={`${theme.label}: ${theme.counts[outcome]} ${outcome}`} aria-label={`${theme.label}, ${theme.counts[outcome]} ${outcome} deals. Show source feedback`} onClick={() => openTheme(theme, `${theme.label} · ${outcome}`, theme.deals.filter((deal) => deal.outcome === outcome).map((deal) => deal.id))} /> : null)}</div>
        <span className="crm-sa-theme-total">{number(theme.deals.length)}</span>
      </div>)}
      <div className="crm-sa-theme-legend">{(["won", "lost", "open"] as const).map((outcome) => <span key={outcome}><i data-outcome={outcome} />{outcome[0].toUpperCase() + outcome.slice(1)}</span>)}</div>
    </div> : themes.stages.length ? <div className="crm-sa-theme-matrix" style={{ "--theme-columns": themes.stages.length } as CSSProperties}>
      <div className="crm-sa-theme-matrix-head" aria-hidden="true"><span /><div>{themes.stages.map((stage) => <span key={stage.key}>{stage.name}{data.filters.pipelines.length > 1 && stage.pipelineName ? <small>{stage.pipelineName}</small> : null}</span>)}</div></div>
      {themes.themes.map((theme) => <div className="crm-sa-theme-matrix-row" key={theme.id}>
        <button type="button" className="crm-sa-theme-label" onClick={() => openTheme(theme)}><strong>{theme.label}</strong><span>{number(theme.counts.open)} open {theme.counts.open === 1 ? "deal" : "deals"}</span></button>
        <div>{themes.stages.map((stage) => {
          const ids = theme.deals.filter((deal) => stage.dealIds.includes(deal.id)).map((deal) => deal.id)
          return <button type="button" key={stage.key} disabled={!ids.length} data-level={ids.length === 0 ? "empty" : ids.length === 1 ? "low" : "high"} aria-label={`${theme.label}, ${stage.name}: ${ids.length} open deals. Show source feedback`} onClick={() => openTheme(theme, `${theme.label} · ${stage.name}`, ids)}><span className="crm-sa-theme-cell-label">{stage.name}</span><strong>{number(ids.length)}</strong></button>
        })}</div>
      </div>)}
    </div> : <CrmEmptyState icon={Workflow} title="No open deals match these themes." body="Themes are drawn from closed deals too – switch to Outcomes to see them." />}
  </CrmPanel> : null

  const waitingPanel = waiting.length ? <CrmPanel title="Waiting for data" meta={`${waiting.length} ${waiting.length === 1 ? "section" : "sections"}`} className="crm-sa-waiting">
    <ul className="crm-sa-waiting-list">
      {waiting.map((item) => <li key={item.title}>
        <span className="crm-sa-waiting-glyph" aria-hidden="true" />
        <span><strong>{item.title}</strong><span>{item.detail}</span></span>
      </li>)}
    </ul>
  </CrmPanel> : null

  const drawerTitle = drawer?.kind === "weekly" ? "Weekly data" : drawer?.kind === "definitions" ? "How these figures are measured" : drawer?.title ?? ""

  return <section className="crm-sa" aria-labelledby="crm-sales-analysis-title">
    <header className="crm-sa-head">
      <div className="crm-sa-heading">
        <h2 id="crm-sales-analysis-title">Sales analysis</h2>
        <p>
          <span data-i18n-skip>{periodRange}</span> · <span data-i18n-skip={scope.pipelineId || scope.ownerId ? "" : undefined}>{scopeLabel(filters)}</span>
          <span className="crm-sa-updating" role="status" data-visible={loading && data ? "true" : undefined}>{loading && data ? <><DotGridLoader size="sm" decorative />Updating</> : null}</span>
        </p>
      </div>
      {scopeControls}
    </header>

    {loadError ? <InlineNotice tone="error" title="Sales analysis could not be refreshed" action={<Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>Try again</Button>}>{loadError}{loaded ? <p>Showing the last successful view: {scopeLabel(loaded.filters)}, last {loaded.filters.days} days.</p> : null}</InlineNotice> : null}
    <AnimatePresence mode="wait" initial={false}>
    {loading && !data ? <motion.div key="loading" className="crm-sa-skeleton" role="status" aria-label="Reading your sales activity" exit={{ opacity: 0 }} transition={mdMotion.exit}>
      <span className="md-crm-skeleton-block crm-sa-skeleton-stats" />
      <div className="crm-sa-pair">
        <span className="md-crm-skeleton-block crm-sa-skeleton-panel" style={{ animationDelay: "60ms" }} />
        <span className="md-crm-skeleton-block crm-sa-skeleton-panel" style={{ animationDelay: "120ms" }} />
      </div>
    </motion.div> : data ? <motion.div key="ready" className="crm-sa-body" aria-busy={loading} data-stale={!current || undefined} initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={mdMotion.enter}>
      {!data.coverage.totalDeals ? <CrmPanel title="No deals to analyse" meta={scope.pipelineId || scope.ownerId ? "for this pipeline and owner" : undefined}>
        <div className="crm-sa-no-data">
          <CrmEmptyState icon={ChartLine} title={scope.pipelineId || scope.ownerId ? "No deals match this pipeline and owner." : "Sales analysis starts with your first deal."} body={scope.pipelineId || scope.ownerId ? "Clear the scope to analyse the whole team." : "Won, lost and waiting figures build as deals move through your pipeline."} />
          <Button variant="outline" size="sm" onClick={() => scope.pipelineId || scope.ownerId ? setScope({ pipelineId: null, ownerId: null }) : navigate("/crm/deals")}>{scope.pipelineId || scope.ownerId ? "Clear scope" : "Open deals"}</Button>
        </div>
      </CrmPanel> : <>
        <dl className="crm-sa-stats">
          {stats.map((stat) => {
            const body = <><dt>{stat.label}</dt><dd><strong data-i18n-skip dir="ltr"><CountUpValue value={stat.value} /></strong><span>{stat.detail}</span></dd></>
            return <div key={stat.key} className="crm-sa-stat">
              {stat.onOpen ? <button type="button" onClick={stat.onOpen} aria-label={`${stat.label}: ${stat.value}. Show deals`}>{body}<ArrowRight className="crm-sa-stat-arrow size-3" strokeWidth={1.6} aria-hidden="true" /></button> : <div>{body}</div>}
            </div>
          })}
        </dl>

        <div className="crm-sa-pair" data-single={!stagePanel || undefined}>{nextActions}{stagePanel}</div>
        {trendPanel || lossPanel ? <div className="crm-sa-pair" data-single={!(trendPanel && lossPanel) || undefined}>{trendPanel}{lossPanel}</div> : null}

        {themeFailed && !themes.themes.length ? <InlineNotice tone="error" title="Feedback themes unavailable" action={<Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>Try again</Button>}>The saved feedback review could not be read.</InlineNotice> : null}
        {themePanel}
      </>}
      {waitingPanel}
    </motion.div> : !loading && pending.length ? <motion.div key="waiting">{waitingPanel}</motion.div> : null}
    </AnimatePresence>

    <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="Sales analysis" title={drawerTitle} width={drawer?.kind === "weekly" ? 560 : 480}>
      {drawer && data ? <DrawerBody drawer={drawer} data={data} namedDeals={namedDeals} number={number} date={date} onOpenDeal={openDeal} onOpenWeek={(row) => openDeals(`${date(row.start)} – ${date(row.end)}`, "Deals with recorded events in this week. One deal may have several events.", row.dealIds, row.dealIds.length, Boolean(row.evidenceTruncated))} /> : null}
    </SideDrawer>
  </section>
}

function DrawerBody({
  drawer,
  data,
  namedDeals,
  number,
  date,
  onOpenDeal,
  onOpenWeek,
}: {
  drawer: Drawer
  data: SalesInsights
  namedDeals: Map<string, NamedDeal>
  number: (value: number, decimals?: number) => string
  date: (value: string | number | null, includeTime?: boolean) => string
  onOpenDeal: (id: string) => void
  onOpenWeek: (row: NonNullable<SalesInsights["trend"]>["buckets"][number]) => void
}) {
  if (drawer.kind === "definitions") {
    const rows: Array<[string, ReactNode]> = [
      ["Period", "Set at the top of the dashboard. Won, lost, new deals, stage progression, loss reasons and weekly activity use it. Open deals, next actions and stage time are always current."],
      ["Stage time", data.definitions.stageTime],
      ["Stage progression", data.definitions.stageProgression],
      ["Weekly activity", <>{data.trend?.metricDefinition ?? "Only recorded events are plotted."} {data.trend?.coverageStartsAt ? `History from ${date(data.trend.coverageStartsAt)}. ` : ""}Partial weeks are included; reopened deals may have several outcomes. Current owner and pipeline apply to historical events. Weeks use UTC.</>],
      ["Feedback themes", "AI groups similar wording from recorded loss feedback and completed shared action notes. Counts use distinct linked deals and their current outcome, owner and pipeline. Themes describe this feedback sample; they do not establish what caused an outcome. The review reads up to 40 recent records from the last 90 days. Private notes, email and calls are excluded."],
      ["Coverage", <>{data.coverage.note} {number(data.coverage.measuredStageDeals)} of {number(data.summary.openDeals)} open deals have measured stage time.{data.coverage.undatedClosedDeals ? ` ${number(data.coverage.undatedClosedDeals)} earlier closed deals have no recorded close date and are left out of period outcomes.` : ""} Lists may show a subset of source deals; totals use every deal you can see. No values in different currencies are added together.</>],
    ]
    return <dl className="crm-sa-definitions">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  }

  if (drawer.kind === "weekly") {
    const buckets = data.trend?.buckets ?? []
    return <div className="crm-sa-drawer-stack">
      <p className="crm-sa-drawer-note">Recorded events each week, using the current pipeline and owner. Weeks use UTC.</p>
      <div className="crm-sa-table-wrap">
        <table className="crm-sa-table">
          <thead><tr><th scope="col">Week</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">New</th><th scope="col">Entered</th><th scope="col"><span className="sr-only">Deals</span></th></tr></thead>
          <tbody>{buckets.map((row) => <tr key={row.start}>
            <th scope="row">{date(row.start)}{row.isPartial ? <span> · partial</span> : null}</th>
            <td>{number(row.won)}</td><td>{number(row.lost)}</td><td>{number(row.created)}</td><td>{number(row.entered)}</td>
            <td><button type="button" disabled={!row.dealIds.length} onClick={() => onOpenWeek(row)}>Deals</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  }

  if (drawer.kind === "theme") {
    return <div className="crm-sa-drawer-stack">
      <p className="crm-sa-drawer-lead">{drawer.description}</p>
      <p className="crm-sa-drawer-note">{number(drawer.total)} {drawer.total === 1 ? "deal" : "deals"} · original wording from each source record</p>
      <div className="crm-sa-quotes">{drawer.narratives.map((source) => <article key={source.sourceId}>
        <div><span>{source.kind === "loss_feedback" ? "Loss feedback" : "Completed action note"} · {date(source.recordedAt)}</span><button type="button" onClick={() => onOpenDeal(source.dealId)}><span data-i18n-skip>{namedDeals.get(source.dealId)?.name ?? "Open deal"}</span><ArrowRight className="size-3" aria-hidden="true" /></button></div>
        <blockquote data-i18n-skip>{source.excerpt}</blockquote>
      </article>)}</div>
      {!drawer.narratives.length ? <CrmEmptyState icon={Info} title="No source records for this group." body="The feedback behind this figure is not available to you." /> : null}
    </div>
  }

  return <div className="crm-sa-drawer-stack">
    <p className="crm-sa-drawer-lead">{drawer.description}</p>
    <p className="crm-sa-drawer-note">{number(drawer.total)} {drawer.total === 1 ? "deal" : "deals"}{drawer.limited ? " · the list may be capped; figures include every deal" : ""}{drawer.ids.length < drawer.total ? ` · showing ${number(drawer.ids.length)}` : ""}</p>
    {drawer.facts?.length ? <dl className="crm-sa-facts">{drawer.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
    {drawer.ids.length ? <div className="md-crm-list crm-sa-drawer-list">{drawer.ids.map((id, index) => {
      const deal = namedDeals.get(id)
      return <CrmRow
        key={id}
        index={index}
        ariaLabel={deal?.name ?? "Open deal"}
        onOpen={() => onOpenDeal(id)}
        glyph={<span className="md-crm-avatar" aria-hidden="true" data-i18n-skip>{crmInitials(deal?.companyName ?? deal?.name ?? "Deal")}</span>}
        title={<span data-i18n-skip>{deal?.name ?? "Open deal"}</span>}
        sub={<span data-i18n-skip>{[deal?.companyName, deal?.ownerName, deal?.stageName].filter(Boolean).join(" · ")}</span>}
        side={<ArrowRight className="md-crm-row-arrow size-3" strokeWidth={1.6} aria-hidden="true" />}
      />
    })}</div> : <CrmEmptyState icon={Info} title="No linked deals for this figure." body="The deals behind it are not available to you." />}
  </div>
}
