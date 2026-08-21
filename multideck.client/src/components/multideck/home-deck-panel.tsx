import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"

/**
 * One module of the deck that sits along the foot of Home.
 *
 * `block` gives the module a recessed grey panel — the deck reads as a band
 * sitting behind the prompt rather than four cards floating in front of it.
 * `bare` keeps only the heading, for a column whose entries are their own
 * containers and should sit directly on the page.
 */
export function HomeDeckPanel({
  title,
  count,
  action,
  variant = "block",
  children,
  className,
}: {
  title: string
  /** Shown beside the heading. Left off when the number tells you nothing. */
  count?: number
  action?: ReactNode
  variant?: "block" | "bare"
  children: ReactNode
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <section
      className={cn(
        "flex h-full min-w-0 flex-col",
        variant === "block" && "rounded-[var(--md-radius-2xl)] bg-[var(--md-deck-surface)] p-3",
        className,
      )}
      aria-label={t(title)}
    >
      <header className={cn("flex min-h-[20px] items-baseline justify-between gap-3", variant === "block" && "px-1")}>
        <h2 className="truncate text-[12px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h2>
        <div className="flex shrink-0 items-baseline gap-2.5">
          {typeof count === "number" && count > 0 ? (
            <span className="text-[11.5px] leading-4 tabular-nums text-[var(--md-subtle)]" dir="ltr">
              {count}
            </span>
          ) : null}
          {action}
        </div>
      </header>

      <div
        className={cn(
          "mt-1.5 min-h-0 flex-1 overflow-y-auto md-scrollbar",
          variant === "bare" && "flex flex-col gap-1.5",
        )}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * A row inside a block module. Rows arrive as one settling group rather than
 * four independent lists; the ramp front-loads the first rows so a full deck
 * lands in well under half a second.
 */
export function HomeDeckRow({
  index = 0,
  className,
  children,
}: {
  index?: number
  className?: string
  children: ReactNode
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <motion.div
      className={cn("px-1", className)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.03) }}
    >
      {children}
    </motion.div>
  )
}

/**
 * A standalone entry that is its own container. Used where the column reads
 * better as separate objects than as a list inside one panel — a clock per
 * region, each sitting on the page in its own right.
 */
export function HomeDeckTile({
  index = 0,
  className,
  children,
}: {
  index?: number
  className?: string
  children: ReactNode
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <motion.div
      className={cn(
        "shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-deck-surface)] px-2.5 py-[7px]",
        className,
      )}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.03) }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The module has nothing in it and says what would put something there. Kept to
 * one line: four empty states along the foot of the screen would out-shout the
 * work that is actually waiting.
 */
export function HomeDeckEmpty({ children }: { children: ReactNode }) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <motion.p
      className="px-1 pt-1 text-[12px] leading-[1.45] text-[var(--md-subtle)]"
      style={{ textWrap: "pretty" }}
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion(shouldReduceMotion, mdMotion.enter)}
    >
      {children}
    </motion.p>
  )
}

/** The module's own quiet control — "Open list", "Show all", a scope switch. */
export function HomeDeckAction({
  children,
  onClick,
  label,
}: {
  children: ReactNode
  onClick: () => void
  label?: string
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <motion.button
      type="button"
      aria-label={label}
      className="rounded-[var(--md-radius-sm)] text-[11.5px] font-medium leading-4 text-[var(--md-text)] transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a22)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)]"
      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
      transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
}

/**
 * The shared shape of a row you can act on: one hit area, a hover surface that
 * lifts it off the recessed panel, and a focus ring that clears the block's
 * own edge.
 */
export const homeDeckRowButtonClass = "flex w-full min-w-0 items-center gap-2 rounded-[var(--md-radius-md)] px-1.5 py-1.5 text-start transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a22)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--md-deck-surface)]"
