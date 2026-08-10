import {
  useCallback,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import {
  buildSmoothPath,
  closeAreaPath,
  getChartScale,
  getGridValues,
  projectX,
  projectY,
  type ChartBox,
} from "@/lib/area-chart"
import { useElementWidth } from "./dashboard-area-chart"
import { Surface } from "./surface"

const gridCount = 3

export type ModeSeries = {
  key: string
  label: string
  color: string
  values: number[]
}

/**
 * Several series on one time axis, drawn in the dashboard's own chart idiom
 * rather than the report-builder's. The report cards are tuned for a wide, light
 * gallery surface: their canvas paints a fixed white fill and their header
 * collapses to one word per line once the column narrows, which is exactly the
 * shape this panel is. Reusing the shared projection helpers instead keeps this
 * a sibling of the trend chart beside it — same grid, same axis type, same
 * theming — at a fraction of the weight.
 */
export function DashboardModeChart({
  title,
  subtitle,
  series,
  labels,
  height = 176,
  className,
}: {
  title: string
  subtitle?: string
  series: ModeSeries[]
  /** One label per point; only a subset is drawn once the column is narrow. */
  labels: string[]
  height?: number
  className?: string
}) {
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const rawId = useId().replace(/[^a-z0-9]/gi, "")
  const [containerRef, width] = useElementWidth<HTMLDivElement>()

  const box = useMemo<ChartBox>(
    () => ({ width, height, padTop: 12, padBottom: 22, padStart: 26, padEnd: 8 }),
    [width, height],
  )

  // One scale across every series, otherwise two modes with different volumes
  // would each fill the panel and look identical.
  const scale = useMemo(
    () => getChartScale(series.flatMap((entry) => entry.values), true, gridCount),
    [series],
  )
  const gridValues = useMemo(() => getGridValues(scale, gridCount), [scale])

  const total = labels.length
  const plotHeight = box.height - box.padTop - box.padBottom
  const ready = box.width > 0 && total > 0 && series.length > 0
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const crosshairX = useMotionValue(0)
  const tooltipX = useMotionValue(0)

  /** Enough room per label that they never collide in a narrow column. */
  const labelStride = useMemo(() => {
    if (total === 0) return 1
    const plot = Math.max(box.width - box.padStart - box.padEnd, 1)
    return Math.max(1, Math.ceil((total * 44) / plot))
  }, [total, box])

  const paths = useMemo(() => {
    if (!ready) return []
    return series.map((entry) => {
      const points = entry.values.map(
        (value, index) => [projectX(index, total, box), projectY(value, scale, box)] as const,
      )
      const line = buildSmoothPath(points)
      return { ...entry, line, area: closeAreaPath(line, box) }
    })
  }, [box, ready, scale, series, total])

  const moveCrosshair = useCallback(
    (index: number, animated: boolean) => {
      if (!ready) return

      const x = projectX(index, total, box)
      const tooltipWidth = 168
      const clamped = Math.min(
        Math.max(x, tooltipWidth / 2 + 4),
        Math.max(box.width - tooltipWidth / 2 - 4, tooltipWidth / 2 + 4),
      )

      if (animated && !shouldReduceMotion) {
        animate(crosshairX, x, mdMotion.snap)
        animate(tooltipX, clamped, mdMotion.snap)
        return
      }

      crosshairX.set(x)
      tooltipX.set(clamped)
    },
    [box, crosshairX, ready, shouldReduceMotion, tooltipX, total],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!ready) return

      const bounds = event.currentTarget.getBoundingClientRect()
      const offset = direction === "rtl" ? bounds.right - event.clientX : event.clientX - bounds.left
      const plot = box.width - box.padStart - box.padEnd
      const ratio = (offset - box.padStart) / Math.max(plot, 1)
      const index = Math.min(Math.max(Math.round(ratio * (total - 1)), 0), total - 1)

      setActiveIndex((current) => {
        if (current === index) return current
        moveCrosshair(index, current !== null)
        return index
      })
    },
    [box, direction, moveCrosshair, ready, total],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<SVGSVGElement>) => {
      const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight"
      const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft"
      const step = event.key === forward ? 1 : event.key === backward ? -1 : 0

      if (step === 0 && event.key !== "Home" && event.key !== "End") return
      event.preventDefault()

      setActiveIndex((current) => {
        const base = current ?? total - 1
        const next = event.key === "Home"
          ? 0
          : event.key === "End"
            ? total - 1
            : Math.min(Math.max(base + step, 0), total - 1)
        moveCrosshair(next, current !== null)
        return next
      })
    },
    [direction, moveCrosshair, total],
  )

  const activeLabel = activeIndex === null ? null : labels[activeIndex]
  const activeSeries = activeIndex === null
    ? []
    : paths.map((entry) => ({ ...entry, value: entry.values[activeIndex] ?? 0 }))
  const chartSummary = series
    .map((entry) => `${entry.label}: ${entry.values.join(", ")}`)
    .join(". ")

  return (
    <Surface padding="none" className={cn("md-mode-chart", className)}>
      <div className="md-mode-chart-head">
        <h2 className="md-panel-title">{title}</h2>
        {subtitle ? <p className="md-panel-meta">{subtitle}</p> : null}
      </div>

      <div ref={containerRef} className="md-mode-chart-canvas" style={{ height }}>
        {ready ? (
          <svg
            width={box.width}
            height={box.height}
            role="img"
            tabIndex={0}
            aria-label={activeIndex === null
              ? chartSummary
              : `${activeLabel}. ${activeSeries.map((entry) => `${entry.label} ${entry.value}`).join(", ")}`}
            className="block touch-pan-y outline-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActiveIndex(null)}
            onFocus={() => {
              setActiveIndex((current) => {
                if (current !== null) return current
                moveCrosshair(total - 1, false)
                return total - 1
              })
            }}
            onBlur={() => setActiveIndex(null)}
            onKeyDown={handleKeyDown}
          >
            <defs>
              {paths.map((entry) => (
                <linearGradient key={entry.key} id={`md-mode-${rawId}-${entry.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={entry.color} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={entry.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {gridValues.map((value, index) => {
              const y = box.padTop + plotHeight - (index / gridCount) * plotHeight
              return (
                <g key={value}>
                  <line
                    x1={box.padStart}
                    x2={box.width - box.padEnd}
                    y1={y}
                    y2={y}
                    stroke="var(--md-chart-grid)"
                    strokeWidth={1}
                    strokeDasharray={index === 0 ? undefined : "2 5"}
                    shapeRendering={index === 0 ? "crispEdges" : undefined}
                  />
                  <text x={box.padStart - 7} y={y} textAnchor="end" dominantBaseline="middle" className="md-area-chart-axis">
                    {value}
                  </text>
                </g>
              )
            })}

            {paths.map((entry, index) => (
              <g key={entry.key}>
                <motion.path
                  d={entry.area}
                  fill={`url(#md-mode-${rawId}-${entry.key})`}
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={
                    shouldReduceMotion ? { duration: 0 } : { ...mdMotion.morph, delay: staggerRamp(index, 0.06) }
                  }
                />
                <motion.path
                  d={entry.line}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { ...mdMotion.morph, delay: staggerRamp(index, 0.06) }
                  }
                />
              </g>
            ))}

            <motion.g
              style={{ x: crosshairX }}
              animate={{ opacity: activeIndex === null ? 0 : 1 }}
              transition={mdMotion.fast}
            >
              <line
                y1={box.padTop}
                y2={box.padTop + plotHeight}
                stroke="var(--md-ink)"
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.32}
              />
              {activeSeries.map((entry) => (
                <g key={entry.key}>
                  <circle cy={projectY(entry.value, scale, box)} r={5.5} fill={entry.color} opacity={0.15} />
                  <circle
                    cy={projectY(entry.value, scale, box)}
                    r={3.25}
                    fill={entry.color}
                    stroke="var(--md-surface)"
                    strokeWidth={2}
                  />
                </g>
              ))}
            </motion.g>

            {labels.map((label, index) =>
              index % labelStride === 0 || index === total - 1 ? (
                <text
                  key={`${label}-${index}`}
                  x={projectX(index, total, box)}
                  y={box.height - 6}
                  textAnchor="middle"
                  className={cn(
                    "md-area-chart-axis",
                    index === total - 1 && "md-area-chart-axis-current",
                    activeIndex === index && "md-area-chart-axis-active",
                  )}
                >
                  {label}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}

        <motion.div
          aria-hidden="true"
          className="md-area-chart-tooltip pointer-events-none absolute top-2 start-0"
          style={{ x: tooltipX }}
          animate={{ opacity: activeIndex === null ? 0 : 1, y: activeIndex === null ? -4 : 0 }}
          transition={mdMotion.fast}
        >
          {activeLabel ? (
            <div className="md-area-chart-tooltip-card md-mode-chart-tooltip-card">
              <p className="md-area-chart-tooltip-label">{activeLabel}</p>
              <ul className="md-mode-chart-tooltip-values">
                {activeSeries.map((entry) => (
                  <li key={entry.key}>
                    <span className="md-mode-chart-tooltip-swatch" style={{ background: entry.color }} />
                    <span>{t(entry.label)}</span>
                    <strong>{entry.value}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </motion.div>
      </div>

      <ul className="md-mode-chart-legend">
        {series.map((entry) => (
          <li key={entry.key}>
            <span className="md-mode-chart-swatch" style={{ background: entry.color }} aria-hidden="true" />
            {t(entry.label)}
          </li>
        ))}
      </ul>
    </Surface>
  )
}
