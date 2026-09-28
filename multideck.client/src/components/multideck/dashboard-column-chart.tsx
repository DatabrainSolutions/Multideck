import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { getChartScale, getGridValues, projectY, type ChartBox } from "@/lib/area-chart"
import { useElementWidth } from "./dashboard-area-chart"

const gridCount = 4
const barGap = 2
const maxBarWidth = 24

export type ColumnSeries = {
  key: string
  label: string
  color: string
  values: number[]
}

/**
 * One bar with a rounded data end and a square foot on the baseline. Positive
 * and negative bars share the same command list, so a bar can morph through
 * zero – a month turning from profit to loss – without the path being rebuilt.
 */
function barPath(x: number, width: number, base: number, end: number) {
  const height = Math.abs(end - base)
  const radius = Math.min(4, width / 2, height)
  const direction = end <= base ? 1 : -1
  const r = (value: number) => Math.round(value * 100) / 100
  return [
    `M ${r(x)} ${r(base)}`,
    `L ${r(x)} ${r(end + radius * direction)}`,
    `Q ${r(x)} ${r(end)} ${r(x + radius)} ${r(end)}`,
    `L ${r(x + width - radius)} ${r(end)}`,
    `Q ${r(x + width)} ${r(end)} ${r(x + width)} ${r(end + radius * direction)}`,
    `L ${r(x + width)} ${r(base)} Z`,
  ].join(" ")
}

/**
 * Months as columns, one or two series side by side. Built for money over time,
 * where the reader compares one month with the next and, with two series, the
 * gap between them in the same month – revenue against costs, cash in against
 * cash out.
 *
 * `emphasis` marks the months the rest of the page is reporting on. They carry
 * full colour and the rest recede, so the selected period reads inside its
 * year without a second chart. `partialIndex` is the month still in progress:
 * drawn lighter again and named "to date", so it is never mistaken for a fall.
 *
 * Motion is two different gestures on purpose. On arrival the columns rise from
 * the baseline in time order, left to right, the way the months are read. After
 * that, a change of data morphs every column at once from where it stands – the
 * same months with new values, one object changing rather than a list reloading.
 */
export function DashboardColumnChart({
  labels,
  tooltipLabels,
  series,
  emphasis,
  partialIndex,
  height = 260,
  formatValue,
  formatAxis,
  tooltipExtra,
  ariaLabel,
  className,
}: {
  /** Short axis label per column, e.g. "Sep". */
  labels: string[]
  /** Longer label for the tooltip and table, e.g. "September 2026". */
  tooltipLabels?: string[]
  series: ColumnSeries[]
  emphasis?: boolean[]
  partialIndex?: number
  height?: number
  formatValue: (value: number) => string
  formatAxis?: (value: number) => string
  /** One derived line under the series values, such as the gap between them. */
  tooltipExtra?: (index: number) => { label: string; value: string } | null
  ariaLabel: string
  className?: string
}) {
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const axis = formatAxis ?? formatValue
  const total = labels.length

  const box = useMemo<ChartBox>(
    () => ({ width, height, padTop: 14, padBottom: 26, padStart: 52, padEnd: 6 }),
    [width, height],
  )

  // Zero is always inside the domain, so every column has a baseline to stand
  // on and a loss hangs below it on the same scale as a profit above it.
  const scale = useMemo(
    () => getChartScale([0, ...series.flatMap((entry) => entry.values)], true, gridCount),
    [series],
  )
  const gridValues = useMemo(() => getGridValues(scale, gridCount), [scale])

  const plot = Math.max(box.width - box.padStart - box.padEnd, 1)
  const band = total ? plot / total : plot
  const count = Math.max(series.length, 1)
  const barWidth = Math.max(Math.min(maxBarWidth, (band * 0.64 - barGap * (count - 1)) / count), 2)
  const groupWidth = barWidth * count + barGap * (count - 1)
  const baseline = projectY(0, scale, box)
  const bandStart = (index: number) => box.padStart + index * band
  const ready = box.width > 0 && total > 0

  // The first paint rises in sequence; anything after it moves together.
  const settled = useRef(false)
  useEffect(() => {
    if (!ready || settled.current) return
    const timer = window.setTimeout(() => { settled.current = true }, 900)
    return () => window.clearTimeout(timer)
  }, [ready])

  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const highlightX = useMotionValue(0)
  const tooltipX = useMotionValue(0)
  const tooltipWidth = 184

  const moveTo = useCallback(
    (index: number, animated: boolean) => {
      const x = box.padStart + index * band
      const centre = x + band / 2
      const clamped = Math.min(Math.max(centre, tooltipWidth / 2 + 4), Math.max(box.width - tooltipWidth / 2 - 4, tooltipWidth / 2 + 4))
      if (animated && !shouldReduceMotion) {
        animate(highlightX, x, mdMotion.snap)
        animate(tooltipX, clamped, mdMotion.snap)
        return
      }
      highlightX.set(x)
      tooltipX.set(clamped)
    },
    [band, box, highlightX, shouldReduceMotion, tooltipX],
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
      const index = Math.min(Math.max(Math.floor((offset - box.padStart) / band), 0), total - 1)
      setActiveIndex((current) => {
        if (current === index) return current
        moveTo(index, current !== null)
        return index
      })
    },
    [band, box.padStart, direction, moveTo, ready, total],
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
        const next = event.key === "Home" ? 0 : event.key === "End" ? total - 1 : Math.min(Math.max(base + step, 0), total - 1)
        moveTo(next, current !== null)
        return next
      })
    },
    [direction, moveTo, total],
  )

  const labelStride = Math.max(1, Math.ceil((total * 34) / plot))
  const plotHeight = box.height - box.padTop - box.padBottom
  const longLabel = (index: number) => {
    const label = tooltipLabels?.[index] ?? labels[index]
    return index === partialIndex ? `${label} · ${t("to date")}` : label
  }
  const extra = activeIndex === null ? null : tooltipExtra?.(activeIndex) ?? null

  return (
    <div ref={containerRef} className={cn("md-column-chart relative w-full", className)} style={{ height }}>
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
            onFocus={() => setActiveIndex((current) => { if (current !== null) return current; moveTo(total - 1, false); return total - 1 })}
            onBlur={() => setActiveIndex(null)}
            onKeyDown={handleKeyDown}
          >
            {gridValues.map((value, index) => {
              const y = box.padTop + plotHeight - (index / gridCount) * plotHeight
              const isZero = Math.abs(value) < 1e-9
              return (
                <g key={index}>
                  <line
                    x1={box.padStart}
                    x2={box.width - box.padEnd}
                    y1={y}
                    y2={y}
                    stroke="var(--md-chart-grid)"
                    strokeWidth={1}
                    strokeDasharray={isZero ? undefined : "2 5"}
                    shapeRendering={isZero ? "crispEdges" : undefined}
                  />
                  <text x={box.padStart - 8} y={y} textAnchor="end" dominantBaseline="middle" className="md-area-chart-axis">
                    {axis(value)}
                  </text>
                </g>
              )
            })}

            {/* The column under the pointer: a quiet band behind the bars, so
                the reader's month stands out without recolouring anything. */}
            <motion.rect
              y={box.padTop - 6}
              width={band}
              height={plotHeight + 12}
              rx={8}
              style={{ x: highlightX }}
              fill="var(--md-dashboard-hush, rgba(11,20,19,0.05))"
              animate={{ opacity: activeIndex === null ? 0 : 1 }}
              transition={mdMotion.fast}
            />

            {labels.map((_, index) => {
              const x = bandStart(index) + (band - groupWidth) / 2
              const emphasised = emphasis ? emphasis[index] !== false : true
              const opacity = index === partialIndex ? 0.32 : emphasised ? 1 : 0.4
              return (
                <g key={index}>
                  {series.map((entry, seriesIndex) => {
                    const value = entry.values[index] ?? 0
                    const barX = x + seriesIndex * (barWidth + barGap)
                    const d = barPath(barX, barWidth, baseline, projectY(value, scale, box))
                    return (
                      <motion.path
                        key={entry.key}
                        fill={entry.color}
                        initial={shouldReduceMotion ? false : { d: barPath(barX, barWidth, baseline, baseline), opacity }}
                        animate={{ d, opacity }}
                        transition={shouldReduceMotion ? { duration: 0 } : {
                          d: settled.current ? mdMotion.morph : { ...mdMotion.panel, duration: 0.46, delay: staggerRamp(index, 0.034) + seriesIndex * 0.04 },
                          opacity: mdMotion.smooth,
                        }}
                      />
                    )
                  })}
                </g>
              )
            })}

            {labels.map((label, index) =>
              index % labelStride === 0 || index === total - 1 ? (
                <text
                  key={`${label}-${index}`}
                  x={bandStart(index) + band / 2}
                  y={box.height - 8}
                  textAnchor="middle"
                  className={cn(
                    "md-area-chart-axis",
                    emphasis?.[index] && "md-area-chart-axis-current",
                    activeIndex === index && "md-area-chart-axis-active",
                  )}
                >
                  {label}
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
                <p className="md-area-chart-tooltip-label">{longLabel(activeIndex)}</p>
                {series.map((entry) => (
                  <p key={entry.key} className="md-column-chart-tooltip-row">
                    <span className="md-column-chart-swatch" style={{ background: entry.color }} />
                    <span className="md-column-chart-tooltip-name">{entry.label}</span>
                    <span className="md-column-chart-tooltip-value" dir="ltr">{formatValue(entry.values[activeIndex] ?? 0)}</span>
                  </p>
                ))}
                {extra ? (
                  <p className="md-column-chart-tooltip-row md-column-chart-tooltip-extra">
                    <span className="md-column-chart-tooltip-name">{extra.label}</span>
                    <span className="md-column-chart-tooltip-value" dir="ltr">{extra.value}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}

      {/* The same figures as a table, for screen readers and anyone who needs
          the numbers without hovering. */}
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
              <th scope="row">{longLabel(index)}</th>
              {series.map((entry) => <td key={entry.key}>{formatValue(entry.values[index] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
