import { useState } from "react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  ActivityPanel,
  CustomsQueuePanel,
  DashboardDrilldownPanel,
  LiveShipmentsPanel,
  MetricsGrid,
  MorningDigestPanel,
  OverviewHero,
  TimezoneFocusPanel,
  WorldClockPanel,
  makeDashboardDrilldownId,
  type DashboardDrilldownId,
} from "@/components/multideck/overview-panels"
import { DashboardCustomisePanel, type DashboardCustomiseMode } from "@/components/multideck/dashboard-customise-panel"
import { YourJobsPanel, getShipmentDetailPath } from "@/components/multideck/shipment-components"
import { initialFavouriteShipmentIds, savedDashboardViews, type DashboardCustomRange, type DashboardRange } from "@/data/multideck-data"
import { mdMotion } from "@/lib/motion"

function getDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getDefaultCustomRange(): DashboardCustomRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 6)
  return { start: getDateKey(start), end: getDateKey(end) }
}

export function OverviewPage({ navigate }: { navigate: (path: string) => void }) {
  const [range, setRange] = useState<DashboardRange>("today")
  const [customRange, setCustomRange] = useState<DashboardCustomRange>(getDefaultCustomRange)
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null)
  const [activeDrilldown, setActiveDrilldown] = useState<DashboardDrilldownId | null>(null)
  const [customiseOpen, setCustomiseOpen] = useState(false)
  const [customiseMode, setCustomiseMode] = useState<DashboardCustomiseMode>("ai")
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set(initialFavouriteShipmentIds))
  const [dashboardViews, setDashboardViews] = useState<string[]>(savedDashboardViews)
  const [selectedDashboard, setSelectedDashboard] = useState(savedDashboardViews[0])

  function toggleFavourite(id: string) {
    setFavouriteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openDrilldown(id: DashboardDrilldownId) {
    setSelectedTimezone(null)
    setActiveDrilldown(id)
  }

  function closeDrilldown() {
    setActiveDrilldown(null)
  }

  function selectTimezone(code: string | null) {
    setActiveDrilldown(null)
    setSelectedTimezone(code)
  }

  function createDashboard(name: string) {
    setDashboardViews((current) => (current.includes(name) ? current : [...current, name]))
    setSelectedDashboard(name)
    toast.success(`${name} created`, { description: "Your current manual layout is ready to customise." })
  }

  function saveDashboard() {
    toast.success(`${selectedDashboard} saved`, { description: "Layout, graph choices, and sizes are saved for this session." })
  }

  function changeCustomiseMode(nextMode: DashboardCustomiseMode) {
    setCustomiseMode(nextMode)
  }

  return (
    <div className={cn("grid items-start gap-[var(--md-page-stack-gap-compact)] transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", customiseOpen && "xl:grid-cols-[minmax(0,1fr)_560px]")}>
      <div className="min-w-0">
        <OverviewHero
          range={range}
          onRangeChange={setRange}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          dashboardViews={dashboardViews}
          selectedDashboard={selectedDashboard}
          onSelectDashboard={setSelectedDashboard}
          onCreateDashboard={createDashboard}
          onSaveDashboard={saveDashboard}
          onOpenCustomise={() => setCustomiseOpen(true)}
          compact={customiseOpen}
        />
        <LayoutGroup id="dashboard-drilldowns">
          <AnimatePresence initial={false}>
            {!activeDrilldown ? (
              <motion.div
                key="world-clock"
                className="mt-[var(--md-page-stack-gap-compact)]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={mdMotion.fast}
                style={{ willChange: "transform, opacity" }}
              >
                <WorldClockPanel selectedCode={selectedTimezone} onSelectTimezone={selectTimezone} compact={customiseOpen} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {selectedTimezone ? (
              <TimezoneFocusPanel key="timezone-focus" selectedCode={selectedTimezone} />
            ) : activeDrilldown ? (
              <DashboardDrilldownPanel key="dashboard-drilldown" drilldownId={activeDrilldown} range={range} onBack={closeDrilldown} />
            ) : (
              <motion.div
                key="dashboard-overview"
                className="mt-[var(--md-page-stack-gap-compact)]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={mdMotion.smooth}
                style={{ willChange: "transform, opacity" }}
              >
                <YourJobsPanel
                  favouriteIds={favouriteIds}
                  onToggleFavourite={toggleFavourite}
                  animated
                  compact={customiseOpen}
                  onOpenJob={(job) => navigate(getShipmentDetailPath(job.shipmentId))}
                />
                <div className="mt-[var(--md-page-stack-gap-compact)]">
                  <MetricsGrid range={range} compact={customiseOpen} onOpenDrilldown={openDrilldown} />
                </div>
                <div className={cn("mt-[var(--md-page-stack-gap-compact)] grid gap-[var(--md-page-stack-gap-compact)]", !customiseOpen && "xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]")}>
                  <MorningDigestPanel range={range} onOpenDrilldown={openDrilldown} />
                  <ActivityPanel onOpenDrilldown={openDrilldown} />
                </div>
                <div className="mt-[var(--md-page-stack-gap-compact)]">
                  <CustomsQueuePanel onOpenDrilldown={openDrilldown} />
                </div>
                <div className="mt-[var(--md-page-stack-gap-compact)]">
                  <LiveShipmentsPanel />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>

      <DashboardCustomisePanel
        open={customiseOpen}
        onOpenChange={setCustomiseOpen}
        presentation="docked"
        selectedDashboard={selectedDashboard}
        mode={customiseMode}
        onModeChange={changeCustomiseMode}
        onSaveDashboard={saveDashboard}
      />
    </div>
  )
}
