import { memo, type CSSProperties } from "react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

/**
 * The order the twenty-five cells light in: a square spiral that walks the outer
 * ring inwards and finishes on the centre dot. Reading it as one travelling
 * pulse rather than twenty-five independent blinks is what stops a wait from
 * feeling like a stalled screen.
 */
const spiralOrder = [
  0, 1, 2, 3, 4,
  15, 16, 17, 18, 5,
  14, 23, 24, 19, 6,
  13, 22, 21, 20, 7,
  12, 11, 10, 9, 8,
]

/** One pulse takes 1450ms to walk the spiral, so the cadence is 48ms per cell. */
const cellCadenceMs = 48
const leadInMs = -576

const dotSize = {
  sm: "size-[3px]",
  md: "size-1",
} as const

/**
 * Multideck's one waiting state. The same spiral answers a route that is still
 * downloading and a register that is still fetching rows, so a wait always looks
 * like the same object no matter which part of the product is thinking.
 *
 * The grid reserves its own box and animates only `opacity` and `transform`, so
 * it can sit inside a panel that is about to be replaced by a table without
 * moving anything around it. Reduced motion holds the centre dot lit instead of
 * cycling.
 */
export const DotGridLoader = memo(function DotGridLoader({
  label,
  size = "md",
  decorative = false,
  className,
}: {
  /** Shown under the grid and announced to assistive technology. */
  label?: string
  size?: keyof typeof dotSize
  /** Set when the surrounding block already announces the wait in words. */
  decorative?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const announced = label ? t(label) : undefined

  return (
    <div
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative || announced ? undefined : t("Loading")}
      className={cn("flex flex-col items-center gap-3.5", className)}
    >
      <div className="grid grid-cols-5 gap-[3px] text-[var(--md-accent)]" aria-hidden="true">
        {spiralOrder.map((order) => (
          <span
            key={order}
            className={cn("md-thinking-dot block rounded-full bg-current", dotSize[size])}
            style={{ animationDelay: `${order * cellCadenceMs + leadInMs}ms` } as CSSProperties}
          />
        ))}
      </div>
      {announced ? <p className="text-[13px] font-medium text-[var(--md-text)]">{announced}</p> : null}
    </div>
  )
})

/**
 * The loader parked in the middle of a panel-sized hole. `minHeight` should be
 * the height the loaded content will occupy, so the surrounding page does not
 * move when rows arrive.
 */
export function DotGridLoaderPanel({
  label,
  minHeight = 240,
  className,
}: {
  label?: string
  minHeight?: number
  className?: string
}) {
  return (
    <div className={cn("grid place-items-center", className)} style={{ minHeight }}>
      <DotGridLoader label={label} />
    </div>
  )
}
