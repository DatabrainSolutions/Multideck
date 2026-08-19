import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { getDefaultDateRange } from "@/components/multideck/date-picker"
import { DashboardCustomisePanel, type DashboardCustomiseMode } from "@/components/multideck/dashboard-customise-panel"
import { DashboardHeader } from "@/components/multideck/dashboard-header"
import { DashboardCoveragePanel } from "@/components/multideck/dashboard-coverage-panel"
import { DashboardBreakdownPanel } from "@/components/multideck/dashboard-breakdown-panel"
import { DashboardModeChart } from "@/components/multideck/dashboard-mode-chart"
import { DashboardPriorityQueue } from "@/components/multideck/dashboard-priority-queue"
import { DashboardPerformancePanel } from "@/components/multideck/dashboard-performance-panel"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { LiveBookingsBoard } from "@/components/multideck/dashboard-live-bookings"
import { getBookingDetailPath } from "@/components/multideck/booking-components"
import {
  type DashboardCustomRange,
} from "@/data/multideck-data"
import { rememberDexterTaskHandoff } from "@/lib/dexter-navigation"
import {
  loadDashboardDrilldownPage,
  loadDashboardOverview,
  type DashboardDrilldownCursor,
  type DashboardDrilldownItem,
  type DashboardDrilldownKind,
  type DashboardOverviewReadModel,
} from "@/lib/dashboard-api"
import {
  dashboardBookingsFromReadModel,
  dashboardModeTrendFromReadModel,
  dashboardQuoteStagesFromReadModel,
  dashboardSnapshotFromReadModel,
  dashboardStatusMixFromReadModel,
  type DashboardPriorityItem,
  type DashboardRange,
} from "@/lib/dashboard-live-data"

type DashboardDrilldownId = string

/**
 * The page arrives as one settling group rather than a dozen independent fades.
 * `staggerRamp` front-loads the first bands and lets the later ones catch up, so
 * the whole screen composes in well under half a second.
 */
function Band({
  index,
  shouldReduceMotion,
  className,
  children,
}: {
  index: number
  shouldReduceMotion: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.042) }}
    >
      {children}
    </motion.div>
  )
}

const metricDrilldowns: Record<string, DashboardDrilldownKind> = {
  "Active jobs": "active_jobs",
  "Booking exceptions": "booking_exceptions",
  "Open quotes": "open_quotes",
  "Ready quotes": "ready_quotes",
}

function DashboardDrilldownList({
  title,
  detail,
  kind,
  value,
  range,
  customRange,
  queue,
  onBack,
}: {
  title: string
  detail: string
  kind: DashboardDrilldownKind
  value?: string
  range: DashboardRange
  customRange: DashboardCustomRange
  queue?: { needAction: number; readyToQuote: number }
  onBack: () => void
}) {
  const { t } = useLanguage()
  const [items, setItems] = useState<DashboardDrilldownItem[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<DashboardDrilldownCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    setItems([])
    setCursor(null)
    setHasMore(false)
    setState("loading")
    loadDashboardDrilldownPage({ kind, value, range, customRange, signal: controller.signal })
      .then((page) => {
        setItems(page.items)
        setTotal(page.total)
        setCursor(page.nextCursor)
        setHasMore(page.hasMore)
        setState("ready")
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) setState("error")
      })
    return () => controller.abort()
  }, [customRange, kind, range, value])

  const loadMore = useCallback(() => {
    if (!cursor || !hasMore || state === "loading") return
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    setState("loading")
    loadDashboardDrilldownPage({ kind, value, range, customRange, cursor, signal: controller.signal })
      .then((page) => {
        setItems((current) => [...current, ...page.items])
        setTotal(page.total)
        setCursor(page.nextCursor)
        setHasMore(page.hasMore)
        setState("ready")
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) setState("error")
      })
  }, [cursor, customRange, hasMore, kind, range, state, value])

  return (
    <div>
      <button type="button" className="md-dashboard-back" onClick={onBack}><span aria-hidden="true">←</span> {t("Back to dashboard")}</button>
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div><h2 className="md-panel-title">{title}</h2><p className="md-panel-meta">{total} · {detail}</p></div>
          {queue ? <div className="flex gap-2"><StatusPill tone="amber">{queue.needAction} {t("need action")}</StatusPill><StatusPill tone="green">{queue.readyToQuote} {t("ready")}</StatusPill></div> : null}
        </div>
        <div className="divide-y divide-[rgba(11,20,19,0.06)]">
          {items.map((item) => <div key={`${item.recordType}:${item.id}`} className="grid grid-cols-[120px_1fr_auto] gap-3 px-5 py-3 text-[13px]"><strong dir="ltr">{item.id}</strong><span>{item.detail}</span><StatusPill tone={item.tone}>{item.status}</StatusPill></div>)}
        </div>
        {state === "loading" ? <p className="px-5 py-4 text-[13px] text-[var(--md-text-muted)]" role="status">{t("Loading records…")}</p> : null}
        {state === "error" ? <p className="px-5 py-4 text-[13px] text-[var(--md-red)]" role="alert">{t("These records could not be loaded. Try again.")}</p> : null}
        {state === "ready" && items.length === 0 ? <p className="px-5 py-4 text-[13px] text-[var(--md-text-muted)]">{t("No matching records.")}</p> : null}
        {state === "ready" && hasMore ? <div className="px-5 py-4"><button type="button" className="md-dashboard-back" onClick={loadMore}>{t("Load 50 more")}</button></div> : null}
      </Surface>
    </div>
  )
}

export function OverviewPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [range, setRange] = useState<DashboardRange>("today")
  const [customRange, setCustomRange] = useState<DashboardCustomRange>(getDefaultDateRange)
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null)
  const [activeDrilldown, setActiveDrilldown] = useState<DashboardDrilldownId | null>(null)
  const [customiseOpen, setCustomiseOpen] = useState(false)
  const [customiseMode, setCustomiseMode] = useState<DashboardCustomiseMode>("ai")
  const [dashboardViews, setDashboardViews] = useState<string[]>(["Operations"])
  const [selectedDashboard, setSelectedDashboard] = useState("Operations")
  const [focusMetric, setFocusMetric] = useState<string | null>(null)
  const [overview, setOverview] = useState<DashboardOverviewReadModel | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    const controller = new AbortController()
    setOverview(null)
    setLoadState("loading")
    loadDashboardOverview(range, customRange, controller.signal)
      .then((model) => {
        setOverview(model)
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) setLoadState("error")
      })
    return () => controller.abort()
  }, [customRange, range])

  const snapshot = useMemo(
    () => overview ? dashboardSnapshotFromReadModel(range, overview) : null,
    [overview, range],
  )
  const liveBookingRows = useMemo(() => overview ? dashboardBookingsFromReadModel(overview) : [], [overview])
  const modeTrend = useMemo(() => overview ? dashboardModeTrendFromReadModel(range, overview) : { labels: [], series: [] }, [overview, range])
  const statusMix = useMemo(() => overview ? dashboardStatusMixFromReadModel(overview) : [], [overview])
  const quoteStages = useMemo(() => overview ? dashboardQuoteStagesFromReadModel(overview) : [], [overview])
  /**
   * The metric strip and the chart it controls share one selection. Falling back
   * to the first metric of the current range means switching ranges never leaves
   * the chart pointing at a metric that range does not have.
   */
  const activeMetric = useMemo(() => {
    if (!snapshot) return ""
    if (focusMetric && snapshot.kpis.some((kpi) => kpi.label === focusMetric)) return focusMetric
    return snapshot.kpis[0]?.label ?? ""
  }, [focusMetric, snapshot])

  const openDrilldown = useCallback((id: DashboardDrilldownId) => {
    setSelectedTimezone(null)
    setActiveDrilldown(id)
  }, [])

  const selectTimezone = useCallback((code: string) => {
    setActiveDrilldown(null)
    setSelectedTimezone(code)
  }, [])

  const clearFocus = useCallback(() => {
    setActiveDrilldown(null)
    setSelectedTimezone(null)
  }, [])

  /** A queue row opens the record it is about, not a summary of it. */
  const openPriorityItem = useCallback(
    (item: DashboardPriorityItem) => {
      if (item.bookingId) navigate(getBookingDetailPath(item.bookingId))
      else if (item.quoteReference) navigate(`/quotes/${item.quoteReference.toLowerCase()}`)
    },
    [navigate],
  )

  const handOverPriorityItem = useCallback(
    (item: DashboardPriorityItem) => {
      const prompt = t("Take over this dashboard task: {task} ({reference}) for {customer}, {context}. Current status: {status}. Review the record and help me complete the next action.")
        .replace("{task}", t(item.task))
        .replace("{reference}", item.reference)
        .replace("{customer}", item.customer)
        .replace("{context}", item.context)
        .replace("{status}", t(item.status))
      rememberDexterTaskHandoff(prompt)
      navigate("/agent-dexter")
    },
    [navigate, t],
  )

  function createDashboard(name: string) {
    setDashboardViews((current) => (current.includes(name) ? current : [...current, name]))
    setSelectedDashboard(name)
    toast.success(`${name} created`, { description: "Your current manual layout is ready to customise." })
  }

  function saveDashboard() {
    toast.success(`${selectedDashboard} saved`, {
      description: "Layout, graph choices, and sizes are saved for this session.",
    })
  }

  const focusView = selectedTimezone ? "timezone" : activeDrilldown ? "drilldown" : "dashboard"

  return (
    <div
      className={cn(
        "md-dashboard grid items-start gap-[var(--md-page-stack-gap-compact)] transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        customiseOpen && "xl:grid-cols-[minmax(0,1fr)_560px]",
      )}
      data-customising={customiseOpen ? "true" : undefined}
    >
      <div className="md-dashboard-main">
        <DashboardHeader
          range={range}
          onRangeChange={setRange}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          dashboardViews={dashboardViews}
          selectedDashboard={selectedDashboard}
          operatorName={overview?.operatorName ?? ""}
          onSelectDashboard={setSelectedDashboard}
          onCreateDashboard={createDashboard}
          onSaveDashboard={saveDashboard}
          compact={customiseOpen}
        />

        {loadState !== "ready" ? (
          <div className="md-dashboard-band rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 py-3 text-[13px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]" role="status">
            {loadState === "loading" ? t("Loading live workspace data…") : t("Live workspace data could not be loaded. Refresh to try again.")}
          </div>
        ) : null}

        {overview && snapshot ? <AnimatePresence mode="wait" initial={false}>
          {focusView === "timezone" && selectedTimezone ? (
            <motion.div
              key={`timezone-${selectedTimezone}`}
              className="md-dashboard-band"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.panel}
            >
              <DashboardDrilldownList
                title={`${t("Outbound queue")} · ${selectedTimezone}`}
                detail={t("live records in this operating region")}
                kind="region"
                value={selectedTimezone}
                range={range}
                customRange={customRange}
                queue={overview.clockQueues[selectedTimezone]}
                onBack={clearFocus}
              />
            </motion.div>
          ) : focusView === "drilldown" && activeDrilldown ? (
            <motion.div
              key={`drilldown-${activeDrilldown}`}
              className="md-dashboard-band"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.panel}
            >
              <DashboardDrilldownList
                title={activeDrilldown.split(":").slice(1).join(":")}
                detail={snapshot.kpis.find((item) => item.label === activeDrilldown.split(":").slice(1).join(":"))?.change ?? t("Current matching records")}
                kind={metricDrilldowns[activeDrilldown.split(":").slice(1).join(":")] ?? "active_jobs"}
                range={range}
                customRange={customRange}
                onBack={clearFocus}
              />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
            >
              {/* The working row. The queue leads, but it no longer runs the
                  full width alone — coverage sits beside it, so the first band
                  answers "what is waiting" and "who is awake" together. */}
              <Band index={0} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band md-dash-row md-dash-row-work">
                <DashboardPriorityQueue
                  items={overview.priorityItems}
                  mineItems={overview.priorityMineItems}
                  totalItems={overview.counts.priority}
                  mineTotalItems={overview.counts.priorityMine}
                  operatorName={overview.operatorName}
                  onOpenItem={openPriorityItem}
                  onHandOverToDexter={handOverPriorityItem}
                />
                <DashboardCoveragePanel queues={overview.clockQueues} onViewQueue={selectTimezone} />
              </Band>

              {/* How the period is going. Four comparable figures, each with the
                  movement its own series shows and the shape behind it. Picking
                  one retargets the chart below. */}
              <Band index={1} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band">
                <KpiStrip
                  kpis={snapshot.kpis}
                  selectedLabel={activeMetric}
                  onSelect={setFocusMetric}
                  onOpenDrilldown={openDrilldown}
                  sparkKind="area"
                  markerId="md-dashboard-metric-rule"
                />
              </Band>

              {/* The reading column and the reference column. The trend chart
                  and the table it explains sit together on the left; the three
                  supporting breakdowns stack on the right, so no panel is left
                  alone against a full-width neighbour. */}
              <Band index={2} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band md-dash-row md-dash-row-analysis">
                <div className="md-dash-stack">
                  <DashboardPerformancePanel kpis={snapshot.kpis} trends={snapshot.trends} metricLabel={activeMetric} />
                  <LiveBookingsBoard
                    bookings={liveBookingRows}
                    totalBookings={overview.counts.liveBookings}
                    exceptionTotal={overview.counts.liveExceptions}
                    onOpenBooking={(booking) => navigate(getBookingDetailPath(booking.id))}
                    className="md-dashboard-deferred"
                  />
                </div>

                <div className="md-dash-stack">
                  <DashboardModeChart
                    title={t("Mode over time")}
                    subtitle={t("Live bookings by transport mode")}
                    series={modeTrend.series}
                    labels={modeTrend.labels}
                  />
                  <DashboardBreakdownPanel
                    title={t("Tracking status")}
                    subtitle={t("Where live bookings stand right now")}
                    slices={statusMix.map((slice) => ({ label: t(slice.name), value: slice.value, color: slice.color }))}
                    variant="ranked"
                  />
                  <DashboardBreakdownPanel
                    title={t("Quote pipeline")}
                    subtitle={t("Open quotes by workflow stage")}
                    slices={quoteStages.map((slice) => ({ label: slice.name, value: slice.value, color: slice.color }))}
                    variant="columns"
                    emptyLabel={t("No quotes are open in this period.")}
                  />
                </div>
              </Band>
            </motion.div>
          )}
        </AnimatePresence> : null}
      </div>

      <DashboardCustomisePanel
        open={customiseOpen}
        onOpenChange={setCustomiseOpen}
        presentation="docked"
        selectedDashboard={selectedDashboard}
        mode={customiseMode}
        onModeChange={setCustomiseMode}
        onSaveDashboard={saveDashboard}
      />
    </div>
  )
}
