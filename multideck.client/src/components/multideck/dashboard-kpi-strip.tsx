import { memo } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Maximize2 } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { MiniAreaChart, MiniBarChart } from "./dashboard-area-chart"
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
  compact,
  spark,
  sparkKind,
  markerId,
  onSelect,
  onOpen,
}: {
  kpi: DashboardKpi
  index: number
  selected: boolean
  compact: boolean
  spark: boolean
  sparkKind: "area" | "bars"
  /** Set to travel one shared rule between cells instead of scaling one per cell. */
  markerId?: string
  onSelect?: () => void
  onOpen?: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  // Neutral metrics still need a legible subject glyph. `--md-subtle` is
  // appropriate for supporting copy, but becomes too faint once the corner
  // icon's resting opacity is applied on a dark surface.
  const accent = kpi.tone === "neutral" ? "var(--md-ink)" : toneToVar(kpi.tone)
  const Icon = kpi.icon
  // A cell that cannot be selected or opened is a readout, not a control, so it
  // renders as plain content: no button semantics, no pointer cursor, and no
  // hover lift promising an action that does not exist.
  const interactive = Boolean(onSelect || onOpen)

  const body = (
    <>
      {/* Parked in the corner with no container of its own: the glyph is a
          quiet label for the metric's subject, not a second object competing
          with the figure. It brightens on hover so the cell still answers the
          pointer. */}
      {Icon ? (
        <span className="md-kpi-cell-icon" aria-hidden="true">
          <Icon className={compact ? "size-[13px]" : "size-[15px]"} strokeWidth={1.5} />
        </span>
      ) : null}
      <span className="md-kpi-cell-copy">
        <span className="md-kpi-cell-label">{kpi.label}</span>
        <span className="md-kpi-cell-figure">
          <CountUpValue value={kpi.value} className="md-kpi-cell-value" />
          {/* Which way the metric moved, as its own chip beside the figure.
              Drawn only from a real earlier reading — a tile with nothing to
              compare against shows the figure alone rather than an arrow that
              means nothing. */}
          {kpi.delta && !compact ? (
            <span className="md-kpi-cell-delta" data-direction={kpi.delta.direction}>
              <span aria-hidden="true" className="md-kpi-cell-delta-arrow">
                {kpi.delta.direction === "up" ? "↗" : kpi.delta.direction === "down" ? "↘" : "→"}
              </span>
              {kpi.delta.text}
            </span>
          ) : kpi.change ? (
            // A strip whose data carries no movement keeps its contextual
            // count, so surfaces without history are unchanged by the arrow.
            <StatusPill tone={kpi.tone}>{kpi.change}</StatusPill>
          ) : null}
          {/* The compact row has no room for the supporting lines, so they are
              kept for assistive technology rather than dropped from the
              product. */}
          <span className={compact ? "sr-only" : "md-kpi-cell-detail"}>
            {kpi.detail}
            {kpi.delta ? <span className="md-kpi-cell-detail-caption"> · {t(kpi.delta.caption)}</span> : null}
          </span>
        </span>
      </span>
      {spark && kpi.series?.length ? (
        <span className="md-kpi-cell-spark">
          {sparkKind === "bars" ? (
            <MiniBarChart values={kpi.series} tone={kpi.tone} height={34} animated={!shouldReduceMotion} />
          ) : (
            <MiniAreaChart values={kpi.series} tone={kpi.tone} width={76} height={38} animated={!shouldReduceMotion} />
          )}
        </span>
      ) : null}
      {/* A rule rather than a ring: it marks the selected metric without adding
          another box to the row. Given a `markerId` it becomes one rule that
          travels between cells, so changing metric reads as a single object
          moving rather than two independent fades — and it can be retargeted
          mid-flight without snapping. */}
      {markerId ? (
        selected ? (
          <motion.span
            layoutId={markerId}
            className="md-kpi-cell-marker md-kpi-cell-marker-travelling"
            aria-hidden="true"
            transition={shouldReduceMotion ? { duration: 0 } : mdMotion.spring}
          />
        ) : null
      ) : (
        <span className="md-kpi-cell-marker" aria-hidden="true" />
      )}
    </>
  )

  return (
    <motion.div
      className="md-kpi-cell"
      data-selected={selected ? "true" : undefined}
      style={{ ["--md-kpi-accent" as string]: accent }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.036) }}
    >
      {interactive ? (
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
          {body}
        </motion.button>
      ) : (
        <div className="md-kpi-cell-button" data-has-icon={Icon ? "true" : undefined} data-static="true">
          {body}
        </div>
      )}

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
  density = "comfortable",
  spark = true,
  sparkKind = "area",
  markerId,
  className,
}: {
  kpis: DashboardKpi[]
  selectedLabel?: string
  onSelect?: (label: string) => void
  onOpenDrilldown?: (id: string) => void
  /** Widest-breakpoint column count. Six and seven step through a middle count. */
  columns?: 4 | 6 | 7
  /**
   * `compact` halves the row height and puts the label and figure on one line.
   * Use it when the metrics are a header band above the real work rather than
   * the subject of the screen.
   */
  density?: "comfortable" | "compact"
  /**
   * Turn the per-cell sparkline off when a full chart of the same series is
   * already on screen. Two drawings of one series is one drawing too many.
   */
  spark?: boolean
  /**
   * `bars` draws the period as discrete ticks instead of a curve. Use it where
   * the cards sit above a full-size plot: a second smooth line reads as the
   * same drawing twice, where a tick strip reads as the shape.
   */
  sparkKind?: "area" | "bars"
  /**
   * Opt into a single selection rule that travels between cells. Pass an id
   * unique to this strip: two strips sharing one id would fight over the rule.
   */
  markerId?: string
  className?: string
}) {
  const compact = density === "compact"

  return (
    <div className={cn("md-kpi-strip", className)} data-columns={columns} data-density={compact ? "compact" : undefined}>
      {kpis.map((kpi, index) => (
        <KpiCell
          // Keyed by slot so a range change animates the numbers inside a stable
          // cell instead of tearing the row down and rebuilding it.
          key={`kpi-${index}`}
          kpi={kpi}
          index={index}
          compact={compact}
          spark={spark}
          sparkKind={sparkKind}
          markerId={markerId}
          selected={selectedLabel === kpi.label}
          onSelect={onSelect ? () => onSelect(kpi.label) : undefined}
          onOpen={onOpenDrilldown ? () => onOpenDrilldown(makeDashboardDrilldownId("metric", kpi.label)) : undefined}
        />
      ))}
    </div>
  )
}
