import { memo } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Maximize2 } from "lucide-react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import { dashboardSnapshots, type DashboardRange } from "@/data/multideck-data"
import { MiniAreaChart } from "./dashboard-area-chart"
import { CountUpValue } from "./rolling-digits"
import { StatusPill, toneToVar } from "./status-pill"
import { makeDashboardDrilldownId } from "./overview-panels"

type Kpi = (typeof dashboardSnapshots)["today"]["kpis"][number]

/**
 * One metric in about eighty pixels of height: label, figure, what changed, and
 * the shape of the last ten periods. An earlier draft gave the selected metric a
 * whole hero panel, which spent a third of the screen restating one number.
 */
const KpiCell = memo(function KpiCell({
  kpi,
  index,
  selected,
  onSelect,
  onOpen,
}: {
  kpi: Kpi
  index: number
  selected: boolean
  onSelect?: () => void
  onOpen?: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const accent = toneToVar(kpi.tone)

  return (
    <motion.div
      className="md-kpi-cell"
      data-selected={selected ? "true" : undefined}
      style={{ ["--md-kpi-accent" as string]: accent }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.036) }}
    >
      <motion.button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="md-kpi-cell-button"
        whileHover={shouldReduceMotion ? undefined : { y: -2 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
        transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
      >
        <span className="md-kpi-cell-copy">
          <span className="md-kpi-cell-label">{kpi.label}</span>
          <span className="md-kpi-cell-figure">
            <CountUpValue value={kpi.value} className="md-kpi-cell-value" />
            <StatusPill tone={kpi.tone}>{kpi.change}</StatusPill>
            <span className="md-kpi-cell-detail">{kpi.detail}</span>
          </span>
        </span>
        {kpi.series?.length ? (
          <span className="md-kpi-cell-spark">
            <MiniAreaChart values={kpi.series} tone={kpi.tone} width={76} height={38} animated={!shouldReduceMotion} />
          </span>
        ) : null}
        {/* A rule rather than a ring: it marks the selected metric without adding
            another box to the row. */}
        <span className="md-kpi-cell-marker" aria-hidden="true" />
      </motion.button>

      {onOpen ? (
        <button type="button" className="md-kpi-cell-expand" aria-label={`${t("Open")} ${kpi.label}`} onClick={onOpen}>
          <Maximize2 className="size-3" strokeWidth={1.4} />
        </button>
      ) : null}
    </motion.div>
  )
})

export function KpiStrip({
  range,
  selectedLabel,
  onSelect,
  onOpenDrilldown,
  className,
}: {
  range: DashboardRange
  selectedLabel?: string
  onSelect?: (label: string) => void
  onOpenDrilldown?: (id: string) => void
  className?: string
}) {
  const kpis = (dashboardSnapshots[range] ?? dashboardSnapshots.today).kpis

  return (
    <div className={cn("md-kpi-strip", className)}>
      {kpis.map((kpi, index) => (
        <KpiCell
          // Keyed by slot so a range change animates the numbers inside a stable
          // cell instead of tearing the row down and rebuilding it.
          key={`kpi-${index}`}
          kpi={kpi}
          index={index}
          selected={selectedLabel === kpi.label}
          onSelect={() => onSelect?.(kpi.label)}
          onOpen={onOpenDrilldown ? () => onOpenDrilldown(makeDashboardDrilldownId("metric", kpi.label)) : undefined}
        />
      ))}
    </div>
  )
}
