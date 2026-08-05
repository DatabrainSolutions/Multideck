import { memo, useEffect, useRef } from "react"
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"

/**
 * A single character cell. Digits roll: the outgoing glyph lifts away while the
 * incoming one arrives from below, so a ticking clock never blinks or reflows.
 * The cell is sized in `em` and `ch` so the slot is reserved up front, which
 * keeps the animation purely compositor work — no layout on any frame.
 */
const DigitCell = memo(function DigitCell({ char, roll }: { char: string; roll: boolean }) {
  if (!roll) {
    return <span className="inline-flex h-[1em] items-center justify-center text-center leading-none" style={{ width: "0.42ch" }}>{char}</span>
  }

  return (
    <span className="relative inline-block overflow-hidden align-baseline" style={{ width: "1ch", height: "1em" }}>
      <AnimatePresence initial={false}>
        <motion.span
          key={char}
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center"
          initial={{ y: "88%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-88%", opacity: 0 }}
          transition={mdMotion.rollSpring}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  )
})

/**
 * Renders a short numeric string (a clock, a countdown) with per-digit roll
 * transitions. Separators stay put, so only the glyphs that actually changed
 * move. Always pass a value whose character count is stable, otherwise the
 * cells shift sideways as it re-renders.
 */
export function RollingDigits({
  value,
  label,
  className,
}: {
  value: string
  label?: string
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return (
      <span className={cn("tabular-nums", className)} dir="ltr" aria-label={label}>
        {value}
      </span>
    )
  }

  return (
    <span className={cn("inline-flex items-center tabular-nums leading-none", className)} dir="ltr" role="text" aria-label={label ?? value}>
      {value.split("").map((char, index) => (
        <DigitCell key={`${index}-${/\d/.test(char) ? "d" : char}`} char={char} roll={/\d/.test(char)} />
      ))}
    </span>
  )
}

const valuePattern = /^(\D*?)(-?[\d.,]+)(.*)$/

/**
 * Counts a metric up to its new figure, keeping any prefix or suffix intact.
 * The tween is written straight into the text node, so a grid full of tiles
 * ramping at once costs zero React renders — only one style-free DOM write per
 * frame per tile.
 */
export const CountUpValue = memo(function CountUpValue({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const nodeRef = useRef<HTMLSpanElement>(null)
  const progress = useMotionValue(0)
  const match = valuePattern.exec(value)
  const prefix = match?.[1] ?? ""
  const numeric = match?.[2] ?? ""
  const suffix = match?.[3] ?? ""
  const target = numeric ? Number(numeric.replace(/,/g, "")) : Number.NaN
  const decimals = numeric.includes(".") ? numeric.split(".")[1].length : 0
  const grouped = numeric.includes(",")

  useEffect(() => {
    const node = nodeRef.current
    if (!node || Number.isNaN(target)) return

    function write(current: number) {
      const fixed = current.toFixed(decimals)
      node!.textContent = grouped ? Number(fixed).toLocaleString("en-GB", { minimumFractionDigits: decimals }) : fixed
    }

    if (shouldReduceMotion) {
      write(target)
      return
    }

    // Ramps from wherever the tile already sits rather than from zero, so
    // changing the range reads as the number moving, not resetting.
    const controls = animate(progress, target, mdMotion.rampSpring)
    const unsubscribe = progress.on("change", write)

    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [target, decimals, grouped, progress, shouldReduceMotion])

  if (Number.isNaN(target)) {
    return <span className={className}>{value}</span>
  }

  return (
    <span className={className} dir="ltr">
      {prefix}
      <span ref={nodeRef}>{shouldReduceMotion ? numeric : "0"}</span>
      {suffix}
    </span>
  )
})
