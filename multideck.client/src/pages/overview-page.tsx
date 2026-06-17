import { useState } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
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

const overviewIntro = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
}

const overviewIntroItem = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
}

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
  const shouldReduceMotion = useReducedMotion()
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
      <motion.div
        className="min-w-0"
        variants={shouldReduceMotion ? undefined : overviewIntro}
        initial={false}
        animate={shouldReduceMotion ? undefined : "show"}
      >
        <motion.div variants={shouldReduceMotion ? undefined : overviewIntroItem}>
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
        </motion.div>
        <LayoutGroup id="dashboard-drilldowns">
          <AnimatePresence initial={false}>
            {!activeDrilldown ? (
              <motion.div
                key="world-clock"
                className="mt-[var(--md-page-stack-gap-compact)]"
                variants={shouldReduceMotion ? undefined : overviewIntroItem}
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
                variants={shouldReduceMotion ? undefined : overviewIntro}
                initial={false}
                animate={shouldReduceMotion ? undefined : "show"}
                exit={{ opacity: 0, y: -8 }}
                style={{ willChange: "transform, opacity" }}
              >
                <motion.div variants={shouldReduceMotion ? undefined : overviewIntroItem}>
                  <YourJobsPanel
                    favouriteIds={favouriteIds}
                    onToggleFavourite={toggleFavourite}
                    animated
                    compact={customiseOpen}
                    onOpenJob={(job) => navigate(getShipmentDetailPath(job.shipmentId))}
                  />
                </motion.div>
                <motion.div className="mt-[var(--md-page-stack-gap-compact)]" variants={shouldReduceMotion ? undefined : overviewIntroItem}>
                  <MetricsGrid range={range} compact={customiseOpen} onOpenDrilldown={openDrilldown} />
                </motion.div>
                <motion.div className={cn("mt-[var(--md-page-stack-gap-compact)] grid gap-[var(--md-page-stack-gap-compact)]", !customiseOpen && "xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]")} variants={shouldReduceMotion ? undefined : overviewIntroItem}>
                  <MorningDigestPanel range={range} onOpenDrilldown={openDrilldown} />
                  <ActivityPanel onOpenDrilldown={openDrilldown} />
                </motion.div>
                <motion.div className="mt-[var(--md-page-stack-gap-compact)]" variants={shouldReduceMotion ? undefined : overviewIntroItem}>
                  <CustomsQueuePanel onOpenDrilldown={openDrilldown} />
                </motion.div>
                <motion.div className="mt-[var(--md-page-stack-gap-compact)]" variants={shouldReduceMotion ? undefined : overviewIntroItem}>
                  <LiveShipmentsPanel />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </motion.div>

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
