import { useCallback, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import {
  DashboardDrilldownPanel,
  TimezoneFocusPanel,
  makeDashboardDrilldownId,
  type DashboardDrilldownId,
} from "@/components/multideck/overview-panels"
import { getDefaultDateRange } from "@/components/multideck/date-picker"
import { DashboardCustomisePanel, type DashboardCustomiseMode } from "@/components/multideck/dashboard-customise-panel"
import { DashboardHeader } from "@/components/multideck/dashboard-header"
import { ClockRail } from "@/components/multideck/dashboard-clock-rail"
import { YourJobsPanel } from "@/components/multideck/dashboard-your-jobs"
import { TodayActionList } from "@/components/multideck/dashboard-action-list"
import { DashboardTrendPanel } from "@/components/multideck/dashboard-trend-panel"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { LiveBookingsBoard } from "@/components/multideck/dashboard-live-bookings"
import { getBookingDetailPath } from "@/components/multideck/booking-components"
import {
  dashboardSnapshots,
  initialFavouriteBookingIds,
  savedDashboardViews,
  type DashboardCustomRange,
  type DashboardRange,
} from "@/data/multideck-data"

/**
 * The dashboard arrives as one settling group rather than a dozen independent
 * fades. `staggerRamp` front-loads the first bands and lets the later ones catch
 * up, so the whole page composes in well under half a second.
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

export function OverviewPage({ navigate }: { navigate: (path: string) => void }) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [range, setRange] = useState<DashboardRange>("today")
  const [customRange, setCustomRange] = useState<DashboardCustomRange>(getDefaultDateRange)
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null)
  const [activeDrilldown, setActiveDrilldown] = useState<DashboardDrilldownId | null>(null)
  const [customiseOpen, setCustomiseOpen] = useState(false)
  const [customiseMode, setCustomiseMode] = useState<DashboardCustomiseMode>("ai")
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set(initialFavouriteBookingIds))
  const [dashboardViews, setDashboardViews] = useState<string[]>(savedDashboardViews)
  const [selectedDashboard, setSelectedDashboard] = useState(savedDashboardViews[0])
  const [focusMetric, setFocusMetric] = useState<string | null>(null)

  const snapshot = dashboardSnapshots[range] ?? dashboardSnapshots.today
  /**
   * The KPI strip and the trend panel share one selection. Falling back to the
   * first metric of the current range means switching ranges never leaves the
   * chart pointing at a metric that range does not have.
   */
  const activeMetric = useMemo(() => {
    if (focusMetric && snapshot.kpis.some((kpi) => kpi.label === focusMetric)) return focusMetric
    return snapshot.kpis[0].label
  }, [focusMetric, snapshot])

  const toggleFavourite = useCallback((id: string) => {
    setFavouriteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
          onSelectDashboard={setSelectedDashboard}
          onCreateDashboard={createDashboard}
          onSaveDashboard={saveDashboard}
          compact={customiseOpen}
        />

        <Band index={0} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band">
          <ClockRail onViewQueue={selectTimezone} />
        </Band>

        <AnimatePresence mode="wait" initial={false}>
          {focusView === "timezone" && selectedTimezone ? (
            <motion.div
              key={`timezone-${selectedTimezone}`}
              className="md-dashboard-band"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.panel}
            >
              <button type="button" className="md-dashboard-back" onClick={clearFocus}>
                <span aria-hidden="true">←</span> Back to dashboard
              </button>
              <TimezoneFocusPanel selectedCode={selectedTimezone} />
            </motion.div>
          ) : focusView === "drilldown" && activeDrilldown ? (
            <motion.div
              key={`drilldown-${activeDrilldown}`}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.panel}
            >
              <DashboardDrilldownPanel drilldownId={activeDrilldown} range={range} onBack={clearFocus} />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
            >
              {/* Four numbers in one strip. The band this replaces spent a third
                  of the screen restating a single metric. */}
              <Band index={1} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band">
                <KpiStrip
                  range={range}
                  selectedLabel={activeMetric}
                  onSelect={setFocusMetric}
                  onOpenDrilldown={openDrilldown}
                />
              </Band>

              {/* What to do next, beside the trend for whichever metric is
                  selected above — the pair the operator actually works from. */}
              <Band index={2} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band md-dashboard-primary">
                <TodayActionList
                  range={range}
                  onOpenItem={(label) => openDrilldown(makeDashboardDrilldownId("brief", label))}
                />
                <DashboardTrendPanel range={range} metricLabel={activeMetric} />
              </Band>

              <Band index={3} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band">
                <YourJobsPanel
                  favouriteIds={favouriteIds}
                  onToggleFavourite={toggleFavourite}
                  onOpenJob={(job) => navigate(getBookingDetailPath(job.bookingId))}
                />
              </Band>

              <Band index={4} shouldReduceMotion={shouldReduceMotion} className="md-dashboard-band md-dashboard-deferred">
                <LiveBookingsBoard onOpenBooking={(booking) => navigate(getBookingDetailPath(booking.id))} />
              </Band>
            </motion.div>
          )}
        </AnimatePresence>
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
