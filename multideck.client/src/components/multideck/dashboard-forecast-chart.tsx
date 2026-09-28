import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdEaseOut, mdMotion } from "@/lib/motion"
import { buildSmoothPath, getChartScale, getGridValues, projectX, projectY, type ChartBox } from "@/lib/area-chart"
import { useElementWidth } from "./dashboard-area-chart"

const gridCount = 4

export type ForecastSeries = {
  key: string
  label: string
  color: string
  /** One value per history label. */
  actual: number[]
  /** One point per projected label, with the range it could reasonably land in. */
  projected: { value: number; low: number; high: number }[]
}

/**
 * What has happened, then what is likely to. The recorded months are a solid
 * line; the projection continues from the last of them as a dashed line inside
 * a soft range, over a lightly shaded forecast zone, so the join between fact
 * and estimate is always visible.
 *
 * The arrival is the argument in miniature: the recorded line draws itself up
 * to today, and only then does the projection appear beyond it. Nothing in the
 * forecast arrives before the history it comes from.
 */
export function DashboardForecastChart({
  labels,
  tooltipLabels,
  series,
  height = 240,
  formatValue,
  formatAxis,
  ariaLabel,
  className,
}: {
  /** History labels followed by projected labels. */
  labels: string[]
  tooltipLabels?: string[]
  series: ForecastSeries[]
  height?: number
  formatValue: (value: number) => string
  formatAxis?: (value: number) => string
  ariaLabel: string
  className?: string
}) {
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const axis = formatAxis ?? formatValue
  const history = series[0]?.actual.length ?? 0
  const total = labels.length

  const box = useMemo<ChartBox>(
    () => ({ width, height, padTop: 22, padBottom: 26, padStart: 52, padEnd: 64 }),
    [width, height],
  )
  const scale = useMemo(
    () => getChartScale([0, ...series.flatMap((entry) => [...entry.actual, ...entry.projected.flatMap((point) => [point.low, point.high])])], true, gridCount),
    [series],
  )
  const gridValues = useMemo(() => getGridValues(scale, gridCount), [scale])
  const plotHeight = box.height - box.padTop - box.padBottom
  const ready = box.width > 0 && history > 0 && total > history

  const x = useCallback((index: number) => projectX(index, total, box), [box, total])
  const y = useCallback((value: number) => projectY(value, scale, box), [box, scale])

  const drawn = useMemo(() => {
    if (!ready) return []
    return series.map((entry) => {
      const actualPoints = entry.actual.map((value, index) => [x(index), y(value)] as const)
      const last = actualPoints.at(-1)!
      const projectedPoints = entry.projected.map((point, index) => [x(history + index), y(point.value)] as const)
      const highs = entry.projected.map((point, index) => `${x(history + index)} ${y(point.high)}`)
      const lows = entry.projected.map((point, index) => `${x(history + index)} ${y(point.low)}`).reverse()
      return {
        ...entry,
        actualPath: buildSmoothPath(actualPoints),
        projectedPath: buildSmoothPath([last, ...projectedPoints]),
        bandPath: `M ${last[0]} ${last[1]} L ${highs.join(" L ")} L ${lows.join(" L ")} Z`,
        end: projectedPoints.at(-1) ?? last,
      }
    })
  }, [history, ready, series, x, y])

  // Direct end labels, nudged apart only when two would sit on top of each other.
  const endLabels = useMemo(() => {
    const placed = drawn.map((entry) => ({ key: entry.key, x: entry.end[0], y: entry.end[1], text: axis(entry.projected.at(-1)?.value ?? 0) }))
    const sorted = [...placed].sort((a, b) => a.y - b.y)
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].y - sorted[index - 1].y < 14) sorted[index].y = sorted[index - 1].y + 14
    }
    return placed
  }, [axis, drawn])

  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const crosshairX = useMotionValue(0)
  const tooltipX = useMotionValue(0)
  const tooltipWidth = 200

  const moveTo = useCallback(
    (index: number, animated: boolean) => {
      const position = x(index)
      const clamped = Math.min(Math.max(position, tooltipWidth / 2 + 4), Math.max(box.width - tooltipWidth / 2 - 4, tooltipWidth / 2 + 4))
      if (animated && !shouldReduceMotion) {
        animate(crosshairX, position, mdMotion.snap)
        animate(tooltipX, clamped, mdMotion.snap)
        return
      }
      crosshairX.set(position)
      tooltipX.set(clamped)
    },
    [box.width, crosshairX, shouldReduceMotion, tooltipX, x],
  )

  useEffect(() => {
    if (activeIndex === null) return
    if (activeIndex > total - 1) { setActiveIndex(null); return }
    moveTo(activeIndex, false)
  }, [activeIndex, moveTo, total])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!ready) return
      const bounds = event.currentTarget.getBoundingClientRect()
      const offset = direction === "rtl" ? bounds.right - event.clientX : event.clientX - bounds.left
      const plot = box.width - box.padStart - box.padEnd
      const index = Math.min(Math.max(Math.round(((offset - box.padStart) / Math.max(plot, 1)) * (total - 1)), 0), total - 1)
      setActiveIndex((current) => {
        if (current === index) return current
        moveTo(index, current !== null)
        return index
      })
    },
    [box, direction, moveTo, ready, total],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<SVGSVGElement>) => {
      const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight"
      const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft"
      const step = event.key === forward ? 1 : event.key === backward ? -1 : 0
      if (step === 0 && event.key !== "Home" && event.key !== "End") return
      event.preventDefault()
      setActiveIndex((current) => {
        const base = current ?? history - 1
        const next = event.key === "Home" ? 0 : event.key === "End" ? total - 1 : Math.min(Math.max(base + step, 0), total - 1)
        moveTo(next, current !== null)
        return next
      })
    },
    [direction, history, moveTo, total],
  )

  const plot = Math.max(box.width - box.padStart - box.padEnd, 1)
  const labelStride = Math.max(1, Math.ceil((total * 36) / plot))
  const drawDuration = 0.9
  const reveal = (delay: number) => (shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, duration: 0.4, delay })
  const label = (index: number) => tooltipLabels?.[index] ?? labels[index]
  const projectedIndex = activeIndex === null ? -1 : activeIndex - history

  return (
    <div ref={containerRef} className={cn("md-forecast-chart relative w-full", className)} style={{ height }}>
      {ready ? (
        <>
          <svg
            className="block touch-pan-y outline-none"
            width={box.width}
            height={box.height}
            role="img"
            tabIndex={0}
            aria-label={ariaLabel}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex((current) => { if (current !== null) return current; moveTo(history - 1, false); return history - 1 })}
            onBlur={() => setActiveIndex(null)}
            onKeyDown={handleKeyDown}
          >
            {/* The forecast zone, from the last recorded month onwards. */}
            <motion.g initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={reveal(drawDuration - 0.2)}>
              <rect
                x={x(history - 1)}
                y={box.padTop - 14}
                width={box.width - box.padEnd - x(history - 1) + 8}
                height={plotHeight + 14}
                rx={8}
                fill="var(--md-dashboard-hush, rgba(11,20,19,0.05))"
                opacity={0.7}
              />
              <text x={x(history - 1) + 8} y={box.padTop - 4} className="md-forecast-zone-label">{t("Forecast")}</text>
            </motion.g>

            {gridValues.map((value, index) => {
              const lineY = box.padTop + plotHeight - (index / gridCount) * plotHeight
              const isZero = Math.abs(value) < 1e-9
              return (
                <g key={index}>
                  <line
                    x1={box.padStart}
                    x2={box.width - box.padEnd + 8}
                    y1={lineY}
                    y2={lineY}
                    stroke="var(--md-chart-grid)"
                    strokeWidth={1}
                    strokeDasharray={isZero ? undefined : "2 5"}
                    shapeRendering={isZero ? "crispEdges" : undefined}
                  />
                  <text x={box.padStart - 8} y={lineY} textAnchor="end" dominantBaseline="middle" className="md-area-chart-axis">{axis(value)}</text>
                </g>
              )
            })}

            {drawn.map((entry, index) => (
              <g key={entry.key}>
                <motion.path
                  d={entry.bandPath}
                  fill={entry.color}
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 0.12 }}
                  transition={reveal(drawDuration + index * 0.06)}
                />
                <motion.path
                  d={entry.actualPath}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={shouldReduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: drawDuration, ease: mdEaseOut, delay: index * 0.08 }}
                />
                <motion.path
                  d={entry.projectedPath}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={2}
                  strokeDasharray="4 5"
                  strokeLinecap="round"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reveal(drawDuration - 0.1 + index * 0.06)}
                />
                <motion.circle
                  cx={entry.end[0]}
                  cy={entry.end[1]}
                  r={4}
                  fill={entry.color}
                  stroke="var(--md-surface)"
                  strokeWidth={2}
                  initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.spring, delay: drawDuration + 0.2 + index * 0.06 }}
                />
              </g>
            ))}

            {endLabels.map((entry) => (
              <motion.text
                key={entry.key}
                x={entry.x + 9}
                y={entry.y}
                dominantBaseline="middle"
                className="md-forecast-end-label"
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reveal(drawDuration + 0.25)}
              >
                {entry.text}
              </motion.text>
            ))}

            <motion.g style={{ x: crosshairX }} animate={{ opacity: activeIndex === null ? 0 : 1 }} transition={mdMotion.fast}>
              <line y1={box.padTop} y2={box.padTop + plotHeight} stroke="var(--md-subtle)" strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
              {activeIndex !== null ? drawn.map((entry) => {
                const value = activeIndex < history ? entry.actual[activeIndex] : entry.projected[activeIndex - history]?.value
                return value === undefined ? null : <circle key={entry.key} cy={y(value)} r={4} fill={entry.color} stroke="var(--md-surface)" strokeWidth={2} />
              }) : null}
            </motion.g>

            {labels.map((text, index) =>
              index % labelStride === 0 || index === history - 1 || index === total - 1 ? (
                <text
                  key={`${text}-${index}`}
                  x={x(index)}
                  y={box.height - 8}
                  textAnchor="middle"
                  className={cn("md-area-chart-axis", index >= history && "md-forecast-axis-projected", activeIndex === index && "md-area-chart-axis-active")}
                >
                  {text}
                </text>
              ) : null,
            )}
          </svg>

          <motion.div
            aria-hidden="true"
            className="md-area-chart-tooltip pointer-events-none absolute top-0 start-0"
            style={{ x: tooltipX }}
            animate={{ opacity: activeIndex === null ? 0 : 1, y: activeIndex === null ? -4 : 0 }}
            transition={mdMotion.fast}
          >
            {activeIndex !== null ? (
              <div className="md-area-chart-tooltip-card md-column-chart-tooltip">
                <p className="md-area-chart-tooltip-label">{label(activeIndex)}{projectedIndex >= 0 ? ` · ${t("projected")}` : ""}</p>
                {series.map((entry) => {
                  const point = projectedIndex >= 0 ? entry.projected[projectedIndex] : null
                  const value = point ? point.value : entry.actual[activeIndex]
                  return (
                    <p key={entry.key} className="md-column-chart-tooltip-row">
                      <span className="md-column-chart-swatch" style={{ background: entry.color }} />
                      <span className="md-column-chart-tooltip-name">{entry.label}</span>
                      <span className="md-column-chart-tooltip-value" dir="ltr">{formatValue(value ?? 0)}</span>
                      {point ? <span className="md-column-chart-tooltip-range" dir="ltr">{axis(point.low)} – {axis(point.high)}</span> : null}
                    </p>
                  )
                })}
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Month")}</th>
            {series.map((entry) => <th key={entry.key} scope="col">{entry.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((_, index) => (
            <tr key={index}>
              <th scope="row">{label(index)}{index >= history ? ` (${t("projected")})` : ""}</th>
              {series.map((entry) => {
                const point = index >= history ? entry.projected[index - history] : null
                return <td key={entry.key}>{point ? `${formatValue(point.value)} (${formatValue(point.low)} – ${formatValue(point.high)})` : formatValue(entry.actual[index] ?? 0)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
