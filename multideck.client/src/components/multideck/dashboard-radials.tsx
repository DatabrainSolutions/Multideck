import { memo, useMemo, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { reduceMotion, staggerRamp } from "@/lib/motion"
import type { StatusTone } from "@/data/operational-data"
import { toneToVar } from "./status-pill"

/**
 * All the radials here animate `strokeDashoffset` on a `pathLength={1}` circle.
 * That means one attribute, no path rebuilding, and geometry that is independent
 * of the radius — so the same maths drives a 22px ring and a 96px dial.
 */
function arcLength(ratio: number) {
  return Math.min(Math.max(ratio, 0), 1)
}

export const ProgressRing = memo(function ProgressRing({
  ratio,
  size = 26,
  thickness = 2.5,
  color = "var(--md-accent)",
  trackOpacity = 0.14,
  children,
  className,
}: {
  ratio: number
  size?: number
  thickness?: number
  color?: string
  trackOpacity?: number
  children?: ReactNode
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const radius = (size - thickness) / 2
  const filled = arcLength(ratio)

  return (
    <span className={cn("md-radial", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="md-radial-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={trackOpacity}
          strokeWidth={thickness}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          initial={shouldReduceMotion ? false : { strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - filled }}
          transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.72, ease: [0.16, 1, 0.3, 1] })}
        />
      </svg>
      {children ? <span className="md-radial-center">{children}</span> : null}
    </span>
  )
})

export type ArcSegment = {
  label: string
  value: number
  tone: StatusTone
}

/**
 * A stacked arc. Each segment is the same circle drawn with a different dash
 * window, so the whole gauge is one element per segment and nothing overlaps
 * during the sweep.
 */
export function SegmentedArc({
  segments,
  size = 128,
  thickness = 9,
  gap = 0.012,
  children,
  className,
}: {
  segments: ArcSegment[]
  size?: number
  thickness?: number
  gap?: number
  children?: ReactNode
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const radius = (size - thickness) / 2
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1

  const windows = useMemo(() => {
    let cursor = 0
    return segments.map((segment) => {
      const share = segment.value / total
      const start = cursor
      cursor += share
      return { segment, start, share: Math.max(share - gap, 0) }
    })
  }, [segments, total, gap])

  return (
    <span className={cn("md-arc", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="md-arc-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--md-subtle)"
          strokeOpacity={0.13}
          strokeWidth={thickness}
        />
        {windows.map(({ segment, start, share }, index) => (
          <motion.circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={toneToVar(segment.tone)}
            strokeWidth={thickness}
            strokeLinecap="round"
            pathLength={1}
            initial={shouldReduceMotion ? false : { strokeDasharray: `0 1`, strokeDashoffset: -start }}
            animate={{ strokeDasharray: `${share} ${Math.max(1 - share, 0.0001)}`, strokeDashoffset: -start }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.78, ease: [0.16, 1, 0.3, 1], delay: staggerRamp(index, 0.05) }
            }
          />
        ))}
      </svg>
      {children ? <span className="md-arc-center">{children}</span> : null}
    </span>
  )
}
