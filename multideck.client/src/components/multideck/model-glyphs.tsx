import { memo, useEffect, useRef } from "react"
import { motion, useReducedMotion } from "motion/react"
import { mdEase, staggerRamp } from "@/lib/motion"
import { modelStrengthBars, type DexterModelProvider } from "@/data/dexter-models"
import { cn } from "@/lib/utils"

/**
 * The provider mark, drawn rather than imported: one inline path keeps it
 * `currentColor`-tinted, crisp at 14px, and out of the asset pipeline.
 */
export const ModelProviderGlyph = memo(function ModelProviderGlyph({
  provider,
  className,
}: {
  provider: DexterModelProvider
  className?: string
}) {
  if (provider !== "openai") return null

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .75 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.19 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.09Zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68V11.1l2.02 1.17c.02 0 .04.03.04.06v5.58a4.5 4.5 0 0 1-4.5 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.09 4.79 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.07l-4.8 2.77a4.5 4.5 0 0 1-6.14-1.65Zm-1.26-10.4a4.48 4.48 0 0 1 2.34-1.97v5.68c0 .28.15.54.39.68l5.82 3.36-2.02 1.17a.08.08 0 0 1-.08 0l-4.8-2.77a4.5 4.5 0 0 1-1.65-6.15Zm16.61 3.86-5.84-3.39L15.13 7.2a.07.07 0 0 1 .07 0l4.8 2.77a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.37-.67Zm2.01-3.03-.14-.09-4.78-2.79a.78.78 0 0 0-.79 0L9.42 9.23V6.9a.07.07 0 0 1 .03-.07l4.8-2.76a4.49 4.49 0 0 1 6.67 4.65ZM8.32 13.03 6.3 11.87a.08.08 0 0 1-.04-.06V6.25a4.49 4.49 0 0 1 7.36-3.45l-.14.08L8.7 5.64a.79.79 0 0 0-.4.68l-.01 6.7Zm1.1-2.36L12.02 9.2l2.61 1.5v3l-2.6 1.5-2.61-1.5v-3Z" />
    </svg>
  )
})

/**
 * The capability meter. The empty tail always stays visible, so every model is
 * measured against the same scale rather than against its own bar count.
 *
 * Changing model walks the difference rather than repainting it: the bars between
 * the old and new readings light up outwards on a ramped stagger when the figure
 * rises, and go out from the far end inwards when it falls. Bars the two readings
 * share are never touched, so switching never flickers the part that did not
 * change.
 *
 * Each bar is a fixed track with a fill layered over it, and only the fill's
 * opacity and scale animate. A colour swap between two custom properties cannot
 * be interpolated — it would land as the snap this is here to avoid — and
 * opacity and transform are the two things a compositor can carry on its own.
 */
export const ModelStrengthMeter = memo(function ModelStrengthMeter({
  strength,
  tone = "accent",
  size = "md",
  animate = true,
  className,
}: {
  strength: number
  /** `accent` follows the theme; `muted` is for the resting composer pill. */
  tone?: "accent" | "muted"
  /** `sm` is the inline pill reading; `md` is the menu row. */
  size?: "sm" | "md"
  animate?: boolean
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const isStill = Boolean(shouldReduceMotion) || !animate
  // Starts at zero so the first paint is the same "stepping up" walk as any later
  // change, instead of a separate mount animation that has to be kept in step.
  const previousRef = useRef(0)
  const previous = previousRef.current

  useEffect(() => {
    previousRef.current = strength
  }, [strength])

  const low = Math.min(previous, strength)
  const high = Math.max(previous, strength)
  const rising = strength >= previous

  return (
    <span className={cn("inline-flex items-center", size === "sm" ? "gap-[2px]" : "gap-[2.5px]", className)} aria-hidden="true">
      {Array.from({ length: modelStrengthBars }, (_, index) => {
        const filled = index < strength
        const changing = index >= low && index < high
        // Measured from the crossing point, so the walk always starts where the
        // two readings part company and travels away from it.
        const step = changing ? (rising ? index - low : high - 1 - index) : 0

        return (
          <span
            key={index}
            className={cn(
              "relative w-[3px] overflow-hidden rounded-full bg-[var(--md-line-strong)]",
              size === "sm" ? "h-2.5" : "h-3",
            )}
          >
            <motion.span
              className={cn(
                "absolute inset-0 rounded-full",
                tone === "accent" ? "bg-[var(--md-accent)]" : "bg-[var(--md-text)]",
              )}
              initial={false}
              animate={{ opacity: filled ? 1 : 0, scaleY: filled ? 1 : 0.3 }}
              transition={
                isStill
                  ? { duration: 0 }
                  : { duration: 0.24, ease: mdEase, delay: changing ? staggerRamp(step, 0.03, 3.2) : 0 }
              }
              // Grows off the baseline, so a rising reading reads as bars standing
              // up rather than as cells switching on.
              style={{ originY: 1 }}
            />
          </span>
        )
      })}
    </span>
  )
})
