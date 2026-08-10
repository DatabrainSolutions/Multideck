import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
import {
  buildSmoothPath,
  closeAreaPath,
  getChartScale,
  getGridValues,
  lerp,
  projectX,
  projectY,
  resample,
  type AreaChartPoint,
  type ChartBox,
  type ChartScale,
} from "@/lib/area-chart"
import type { StatusTone } from "@/data/multideck-data"
import { toneToVar } from "./status-pill"

const gridCount = 4

/**
 * Tracks the element's content width. The chart works in real pixels rather
 * than a scaled viewBox so stroke weights and type stay exact at every size.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    setWidth(node.clientWidth)

    if (typeof ResizeObserver === "undefined") return

    let frame = 0
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      // Resize observations arrive in bursts while a panel animates open.
      // Coalescing to one frame keeps the chart from re-projecting per pixel.
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setWidth(next))
    })

    observer.observe(node)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return [ref, width] as const
}

type Frame = {
  values: number[]
  targets: number[]
  scale: ChartScale
}

function buildFrame(points: AreaChartPoint[], hasTarget: boolean): Frame {
  const values = points.map((point) => point.value)
  const targets = hasTarget ? points.map((point) => point.target ?? point.value) : []
  return { values, targets, scale: getChartScale(hasTarget ? [...values, ...targets] : values, true, gridCount) }
}

function alignFrame(frame: Frame, length: number): Frame {
  return {
    values: resample(frame.values, length),
    targets: frame.targets.length ? resample(frame.targets, length) : [],
    scale: frame.scale,
  }
}

export function DashboardAreaChart({
  points,
  tone = "teal",
  height = 208,
  valueLabel,
  targetLabel,
  formatValue,
  className,
}: {
  points: AreaChartPoint[]
  tone?: StatusTone
  height?: number
  valueLabel?: string
  targetLabel?: string
  formatValue?: (value: number) => string
  className?: string
}) {
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const rawId = useId()
  const gradientId = `md-area-${rawId.replace(/[^a-z0-9]/gi, "")}`
  const [containerRef, width] = useElementWidth<HTMLDivElement>()

  const hasTarget = points.some((point) => point.target !== undefined)
  const format = useCallback(
    (value: number) => (formatValue ? formatValue(value) : formatCompact(value)),
    [formatValue],
  )

  const box = useMemo<ChartBox>(
    () => ({ width, height, padTop: 16, padBottom: 26, padStart: 40, padEnd: 10 }),
    [width, height],
  )

  const target = useMemo(() => buildFrame(points, hasTarget), [points, hasTarget])
  const color = toneToVar(tone)

  const lineRef = useRef<SVGPathElement>(null)
  const areaRef = useRef<SVGPathElement>(null)
  const targetRef = useRef<SVGPathElement>(null)
  const capRef = useRef<SVGCircleElement>(null)
  /** What is currently painted, so a mid-flight morph can start from it. */
  const paintedRef = useRef<Frame | null>(null)

  const paint = useCallback(
    (frame: Frame, currentBox: ChartBox) => {
      if (currentBox.width <= 0) return

      const total = frame.values.length
      const linePoints = frame.values.map(
        (value, index) => [projectX(index, total, currentBox), projectY(value, frame.scale, currentBox)] as const,
      )
      const line = buildSmoothPath(linePoints)

      lineRef.current?.setAttribute("d", line)
      areaRef.current?.setAttribute("d", closeAreaPath(line, currentBox))

      if (frame.targets.length && targetRef.current) {
        const targetPoints = frame.targets.map(
          (value, index) => [projectX(index, total, currentBox), projectY(value, frame.scale, currentBox)] as const,
        )
        targetRef.current.setAttribute("d", buildSmoothPath(targetPoints))
      }

      const cap = linePoints.at(-1)
      if (cap && capRef.current) {
        capRef.current.setAttribute("cx", `${cap[0]}`)
        capRef.current.setAttribute("cy", `${cap[1]}`)
      }

      paintedRef.current = frame
    },
    [],
  )

  // Morph from whatever is on screen to the new series. The tween writes path
  // attributes straight to the DOM, so a 520ms sweep costs zero React renders.
  useEffect(() => {
    if (box.width <= 0) return

    const previous = paintedRef.current
    if (!previous || shouldReduceMotion) {
      paint(target, box)
      return
    }

    const length = Math.max(previous.values.length, target.values.length)
    const from = alignFrame(previous, length)
    const to = alignFrame(target, length)

    const controls = animate(0, 1, {
      ...mdMotion.morph,
      onUpdate: (value) => {
        paint(
          {
            values: to.values.map((entry, index) => lerp(from.values[index] ?? entry, entry, value)),
            targets: to.targets.map((entry, index) => lerp(from.targets[index] ?? entry, entry, value)),
            scale: {
              min: lerp(from.scale.min, to.scale.min, value),
              max: lerp(from.scale.max, to.scale.max, value),
            },
          },
          box,
        )
      },
      onComplete: () => paint(target, box),
    })

    return () => controls.stop()
  }, [target, box, paint, shouldReduceMotion])

  const total = points.length
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const crosshairX = useMotionValue(0)
  const tooltipX = useMotionValue(0)

  const moveCrosshair = useCallback(
    (index: number | null, animated: boolean) => {
      if (index === null || box.width <= 0) return

      const x = projectX(index, total, box)
      const tooltipWidth = 158
      const clamped = Math.min(Math.max(x, tooltipWidth / 2 + 4), Math.max(box.width - tooltipWidth / 2 - 4, tooltipWidth / 2 + 4))

      if (animated && !shouldReduceMotion) {
        animate(crosshairX, x, mdMotion.snap)
        animate(tooltipX, clamped, mdMotion.snap)
        return
      }

      crosshairX.set(x)
      tooltipX.set(clamped)
    },
    [box, total, crosshairX, tooltipX, shouldReduceMotion],
  )

  /**
   * The crosshair snaps to the nearest data point rather than tracking the
   * cursor, so a pointer sweep produces at most one update per point instead of
   * one per pixel — and the spring between points reads as magnetic.
   */
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (box.width <= 0 || total === 0) return

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
    [box, total, direction, moveCrosshair],
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
        const next =
          event.key === "Home" ? 0 : event.key === "End" ? total - 1 : Math.min(Math.max(base + step, 0), total - 1)
        moveCrosshair(next, current !== null)
        return next
      })
    },
    [direction, total, moveCrosshair],
  )

  const activePoint = activeIndex === null ? null : points[activeIndex]
  const gridValues = useMemo(() => getGridValues(target.scale, gridCount), [target.scale])
  const labelStride = useMemo(() => {
    if (total === 0) return 1
    const perLabel = 46
    const plot = Math.max(box.width - box.padStart - box.padEnd, 1)
    return Math.max(1, Math.ceil((total * perLabel) / plot))
  }, [total, box])

  const plotHeight = box.height - box.padTop - box.padBottom
  const ready = box.width > 0

  return (
    <div ref={containerRef} className={cn("md-area-chart relative w-full", className)} style={{ height }}>
      {ready ? (
        <>
          <svg
            className="md-area-chart-canvas block touch-pan-y outline-none"
            width={box.width}
            height={box.height}
            role="img"
            tabIndex={0}
            aria-label={`${valueLabel ?? t("Trend")} — ${points.map((point) => `${point.label} ${format(point.value)}`).join(", ")}`}
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
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.24" />
                <stop offset="62%" stopColor={color} stopOpacity="0.06" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {gridValues.map((value, index) => {
              const y = box.padTop + plotHeight - (index / gridCount) * plotHeight
              return (
                <g key={index}>
                  {/* Dashed rather than solid: the grid is a reading aid, and
                      a broken rule stays behind the series instead of cutting
                      across it. The baseline stays solid so the plot still
                      sits on something. */}
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
                  <text
                    x={box.padStart - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="md-area-chart-axis"
                  >
                    {format(value)}
                  </text>
                </g>
              )
            })}

            <path ref={areaRef} fill={`url(#${gradientId})`} />
            {hasTarget ? (
              <path
                ref={targetRef}
                fill="none"
                stroke="var(--md-blue)"
                strokeWidth={1.5}
                strokeDasharray="4 5"
                strokeLinecap="round"
                opacity={0.72}
              />
            ) : null}
            <path ref={lineRef} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
            <circle ref={capRef} r={3.2} fill={color} stroke="var(--md-surface)" strokeWidth={2} />

            <motion.g style={{ x: crosshairX }} animate={{ opacity: activeIndex === null ? 0 : 1 }} transition={mdMotion.fast}>
              <line y1={box.padTop} y2={box.padTop + plotHeight} stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.5} />
              {activeIndex !== null && activePoint ? (
                <>
                  <circle
                    cy={projectY(activePoint.value, target.scale, box)}
                    r={5.5}
                    fill={color}
                    opacity={0.16}
                  />
                  <circle
                    cy={projectY(activePoint.value, target.scale, box)}
                    r={3.4}
                    fill={color}
                    stroke="var(--md-surface)"
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </motion.g>

            {points.map((point, index) =>
              index % labelStride === 0 || index === total - 1 ? (
                <text
                  key={`${point.label}-${index}`}
                  x={projectX(index, total, box)}
                  y={box.height - 8}
                  textAnchor="middle"
                  className={cn(
                    "md-area-chart-axis",
                    // The period the figure above is reporting. Emphasised so
                    // the curve's right-hand end reads as "now" at a glance.
                    index === total - 1 && "md-area-chart-axis-current",
                    activeIndex === index && "md-area-chart-axis-active",
                  )}
                >
                  {point.label}
                </text>
              ) : null,
            )}
          </svg>

          <motion.div
            aria-hidden="true"
            className="md-area-chart-tooltip pointer-events-none absolute top-1.5 start-0"
            style={{ x: tooltipX }}
            animate={{ opacity: activeIndex === null ? 0 : 1, y: activeIndex === null ? -4 : 0 }}
            transition={mdMotion.fast}
          >
            {activePoint ? (
              <div className="md-area-chart-tooltip-card">
                <p className="md-area-chart-tooltip-label">{activePoint.label}</p>
                <p className="md-area-chart-tooltip-value" style={{ color }} dir="ltr">
                  {format(activePoint.value)}
                  <span className="md-area-chart-tooltip-series">{valueLabel ?? t("Actual")}</span>
                </p>
                {activePoint.target !== undefined ? (
                  <p className="md-area-chart-tooltip-value md-area-chart-tooltip-muted" dir="ltr">
                    {format(activePoint.target)}
                    <span className="md-area-chart-tooltip-series">{targetLabel ?? t("Target")}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </div>
  )
}

function formatCompact(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 1000) return `${(value / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`
  if (absolute >= 100 || Number.isInteger(value)) return `${Math.round(value)}`
  return value.toFixed(1)
}

/**
 * A sparkline that bleeds to the full width of whatever it sits in, used as the
 * base of a stat card. It measures its own box rather than taking a fixed width,
 * so the curve always meets both edges of the card exactly.
 */
export function FlushAreaSpark({
  values,
  tone,
  height = 46,
  animated = true,
  className,
}: {
  values: number[]
  tone: StatusTone
  height?: number
  animated?: boolean
  className?: string
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const rawId = useId()
  const gradientId = `md-flush-${rawId.replace(/[^a-z0-9]/gi, "")}`
  const color = toneToVar(tone)

  const geometry = useMemo(() => {
    if (width <= 0) return null
    const box: ChartBox = { width, height, padTop: 6, padBottom: 0, padStart: 0, padEnd: 0 }
    const scale = getChartScale(values, false)
    const projected = values.map(
      (value, index) => [projectX(index, values.length, box), projectY(value, scale, box)] as const,
    )
    const path = buildSmoothPath(projected)
    return { line: path, area: closeAreaPath(path, box) }
  }, [values, width, height])

  return (
    <div ref={containerRef} className={cn("md-flush-spark", className)} style={{ height }} aria-hidden="true">
      {geometry ? (
        <svg width={width} height={height} className="block">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <motion.path
            d={geometry.line}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeOpacity={0.85}
            initial={animated ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={animated ? { duration: 0.7, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
          />
        </svg>
      ) : null}
    </div>
  )
}

/**
 * The compact sparkline. Same geometry as the large chart so the two read as one
 * system, but with no axes, no interaction, and a single draw.
 */
export const MiniAreaChart = memo(function MiniAreaChart({
  values,
  tone,
  width = 104,
  height = 36,
  animated = true,
}: {
  values: number[]
  tone: StatusTone
  width?: number
  height?: number
  animated?: boolean
}) {
  const rawId = useId()
  const gradientId = `md-spark-${rawId.replace(/[^a-z0-9]/gi, "")}`
  const color = toneToVar(tone)

  const { line, area, cap } = useMemo(() => {
    const box: ChartBox = { width, height, padTop: 5, padBottom: 5, padStart: 2, padEnd: 3 }
    const scale = getChartScale(values, false)
    const projected = values.map(
      (value, index) => [projectX(index, values.length, box), projectY(value, scale, box)] as const,
    )
    const path = buildSmoothPath(projected)
    return { line: path, area: closeAreaPath(path, box), cap: projected.at(-1) }
  }, [values, width, height])

  return (
    <svg className="shrink-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0, opacity: 0.4 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={animated ? { duration: 0.6, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
      />
      {cap ? <circle cx={cap[0]} cy={cap[1]} r={2.2} fill={color} stroke="var(--md-surface)" strokeWidth={1.5} /> : null}
    </svg>
  )
})

/**
 * A period as discrete ticks rather than a curve. Where a card sits above a
 * full-size plot of the same figures, a second smooth line reads as the same
 * drawing twice; a tick strip reads as the shape, leaving the detail to the
 * chart. Each tick is scaled from the baseline, so the whole strip is one
 * transform per bar and no path maths.
 */
export const MiniBarChart = memo(function MiniBarChart({
  values,
  tone,
  height = 30,
  animated = true,
}: {
  values: number[]
  tone: StatusTone
  height?: number
  animated?: boolean
}) {
  const color = toneToVar(tone)
  const peak = Math.max(...values, 1)

  return (
    <span className="md-mini-bars" style={{ height }} aria-hidden="true">
      {values.map((value, index) => (
        <motion.span
          // Keyed by slot, deliberately: a bar is period N of the window, not a
          // record. Changing range animates each bar's height inside a stable
          // element rather than tearing the strip down and rebuilding it.
          key={`period-${index}`}
          className="md-mini-bar"
          style={{ background: color }}
          initial={animated ? { scaleY: 0.06 } : false}
          animate={{ scaleY: Math.max(value / peak, 0.06) }}
          transition={
            animated
              ? { ...mdMotion.panel, delay: staggerRamp(index, 0.012) }
              : { duration: 0 }
          }
        />
      ))}
    </span>
  )
})
