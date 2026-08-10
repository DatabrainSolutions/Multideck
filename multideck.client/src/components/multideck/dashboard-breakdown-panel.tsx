import { motion, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { Surface } from "./surface"

export type BreakdownSlice = {
  label: string
  value: number
  color: string
}

/**
 * A split of a total, drawn as bars. Rings and funnels were tried here first and
 * both were the wrong shape for a side column: each carries a fixed aspect, so
 * in a row beside a tall table they stretched and left a large empty band under
 * the drawing. A bar list has no aspect to hold — it is exactly as tall as the
 * number of categories — and comparing lengths on a shared baseline is easier
 * than comparing arc angles anyway.
 *
 * `segmented` puts the whole total on one bar, for a split that reads as parts
 * of a single quantity. `ranked` gives each category its own horizontal bar
 * under a shared scale, for a list where the order is the point. `columns`
 * turns the same values upright when category-to-category comparison is the
 * useful reading.
 */
export function DashboardBreakdownPanel({
  title,
  subtitle,
  slices,
  variant = "ranked",
  totalLabel,
  emptyLabel,
  className,
}: {
  title: string
  subtitle?: string
  slices: BreakdownSlice[]
  variant?: "segmented" | "ranked" | "columns"
  /** Noun for the headline count, e.g. "live bookings". */
  totalLabel?: string
  emptyLabel?: string
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const peak = slices.reduce((highest, slice) => Math.max(highest, slice.value), 0)
  const share = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100))

  return (
    <Surface padding="none" className={cn("md-breakdown-panel", className)}>
      <div className="md-breakdown-head">
        <h2 className="md-panel-title">{title}</h2>
        {subtitle ? <p className="md-panel-meta">{subtitle}</p> : null}
      </div>

      {slices.length === 0 ? (
        <p className="md-breakdown-empty">{emptyLabel ?? t("Nothing to show for this period.")}</p>
      ) : (
        <div className={cn("md-breakdown-body", variant === "columns" && "md-breakdown-body-columns")}>
          {variant === "segmented" ? (
            <>
              <p className="md-breakdown-total">
                <span className="md-breakdown-total-value" dir="ltr">
                  {total}
                </span>
                {totalLabel ? <span className="md-breakdown-total-label">{totalLabel}</span> : null}
              </p>

              {/* One bar carrying the whole total. Segments are laid out in the
                  flow rather than positioned, so no segment can overlap the next
                  when a share rounds up. */}
              <span className="md-breakdown-stack" aria-hidden="true">
                {slices.map((slice, index) => (
                  <motion.span
                    key={slice.label}
                    className="md-breakdown-stack-segment"
                    style={{ background: slice.color, flexGrow: slice.value }}
                    initial={shouldReduceMotion ? false : { opacity: 0, scaleY: 0.4 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={
                      shouldReduceMotion ? { duration: 0 } : { ...mdMotion.panel, delay: staggerRamp(index, 0.04) }
                    }
                  />
                ))}
              </span>

              <ul className="md-breakdown-legend">
                {slices.map((slice) => (
                  <li key={slice.label}>
                    <span className="md-breakdown-swatch" style={{ background: slice.color }} aria-hidden="true" />
                    <span className="md-breakdown-legend-label">{slice.label}</span>
                    <span className="md-breakdown-legend-value" dir="ltr">
                      {slice.value}
                    </span>
                    <span className="md-breakdown-legend-share" dir="ltr">
                      {share(slice.value)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : variant === "columns" ? (
            <ul className="md-breakdown-columns">
              {slices.map((slice, index) => {
                const height = peak === 0 ? 0 : Math.max((slice.value / peak) * 100, 3)

                return (
                  <li key={slice.label} aria-label={`${slice.label}: ${slice.value}, ${share(slice.value)}%`}>
                    <span className="md-breakdown-column-value" dir="ltr">
                      {slice.value}
                    </span>
                    <span className="md-breakdown-column-plot" aria-hidden="true">
                      <motion.span
                        className="md-breakdown-column-bar"
                        style={{ background: slice.color, height: `${height}%` }}
                        initial={shouldReduceMotion ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={
                          shouldReduceMotion ? { duration: 0 } : { ...mdMotion.panel, delay: staggerRamp(index, 0.04) }
                        }
                      />
                    </span>
                    <span className="md-breakdown-column-label">{slice.label}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="md-breakdown-rows">
              {slices.map((slice, index) => (
                <li key={slice.label}>
                  <span className="md-breakdown-row-head">
                    <span className="md-breakdown-row-label">{slice.label}</span>
                    <span className="md-breakdown-row-value" dir="ltr">
                      {slice.value}
                    </span>
                    <span className="md-breakdown-row-share" dir="ltr">
                      {share(slice.value)}%
                    </span>
                  </span>
                  {/* Scaled against the largest category rather than the total,
                      so a long tail still has visible length to compare. */}
                  <span className="md-breakdown-track" aria-hidden="true">
                    <motion.span
                      className="md-breakdown-fill"
                      style={{ background: slice.color }}
                      initial={shouldReduceMotion ? false : { scaleX: 0 }}
                      animate={{ scaleX: peak === 0 ? 0 : Math.max(slice.value / peak, 0.015) }}
                      transition={
                        shouldReduceMotion ? { duration: 0 } : { ...mdMotion.panel, delay: staggerRamp(index, 0.04) }
                      }
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Surface>
  )
}
