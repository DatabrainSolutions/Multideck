import { memo } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Maximize2 } from "lucide-react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { MiniAreaChart } from "./dashboard-area-chart"
import { CountUpValue } from "./rolling-digits"
import { StatusPill, toneToVar } from "./status-pill"
import { makeDashboardDrilldownId } from "./overview-panels"

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
  kpi: DashboardKpi
  index: number
  selected: boolean
  onSelect?: () => void
  onOpen?: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const accent = toneToVar(kpi.tone)
  const Icon = kpi.icon

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
        data-has-icon={Icon ? "true" : undefined}
        whileHover={shouldReduceMotion ? undefined : { y: -2 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
        transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
      >
        {/* Parked in the corner with no container of its own: the glyph is a
            quiet label for the metric's subject, not a second object competing
            with the figure. It brightens on hover so the cell still answers the
            pointer. */}
        {Icon ? (
          <span className="md-kpi-cell-icon" aria-hidden="true">
            <Icon className="size-[15px]" strokeWidth={1.5} />
          </span>
        ) : null}
        <span className="md-kpi-cell-copy">
          <span className="md-kpi-cell-label">{kpi.label}</span>
          <span className="md-kpi-cell-figure">
            <CountUpValue value={kpi.value} className="md-kpi-cell-value" />
            {kpi.change ? <StatusPill tone={kpi.tone}>{kpi.change}</StatusPill> : null}
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
  kpis,
  selectedLabel,
  onSelect,
  onOpenDrilldown,
  columns = 4,
  className,
}: {
  kpis: DashboardKpi[]
  selectedLabel?: string
  onSelect?: (label: string) => void
  onOpenDrilldown?: (id: string) => void
  /** Widest-breakpoint column count. Six halves at the middle breakpoint. */
  columns?: 4 | 6
  className?: string
}) {
  return (
    <div className={cn("md-kpi-strip", className)} data-columns={columns}>
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
