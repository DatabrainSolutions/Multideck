import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, type LucideIcon } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import type { DexterSpecialistId } from "@/components/multideck/agent-dexter-components"

export type HomePromptSuggestion = {
  id: string
  /** What the operator reads. Written as the thing they want done. */
  title: string
  /** What Dexter actually receives, which can be longer and more specific. */
  prompt: string
  /** The record or figure this suggestion came from, so it is never a guess. */
  meta?: string
  icon: LucideIcon
  specialistId: DexterSpecialistId
}

/**
 * The prompts worth starting from today, drawn from the operator's own work.
 *
 * Rows on a hairline rather than a grid of pills: these are sentences of
 * different lengths, and a wrapped pill grid reflows into a ragged block every
 * time the underlying work changes. One highlight travels between the rows, so
 * the rail reads as a single list being scanned rather than four separate
 * buttons lighting up independently.
 */
export function HomePromptRail({
  suggestions,
  onPick,
  className,
}: {
  suggestions: HomePromptSuggestion[]
  onPick: (prompt: string, specialistId: DexterSpecialistId) => void
  className?: string
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const railId = useId()
  const [activeId, setActiveId] = useState<string | null>(null)
  /** The arrow always arrives from behind itself, whichever way the row reads. */
  const arrowOffset = direction === "rtl" ? 4 : -4

  if (!suggestions.length) return null

  return (
    <div className={cn("mx-auto w-full", className)} role="list" aria-label={t("Suggested prompts")}>
      {suggestions.map((suggestion, index) => {
        const Icon = suggestion.icon
        const active = activeId === suggestion.id

        return (
          <motion.div
            key={suggestion.id}
            role="listitem"
            className="border-t border-[var(--md-line)] first:border-t-0"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.034) }}
          >
            <button
              type="button"
              className="group relative isolate flex w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a22)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)]"
              onPointerEnter={() => setActiveId(suggestion.id)}
              onPointerLeave={() => setActiveId((current) => (current === suggestion.id ? null : current))}
              onFocus={() => setActiveId(suggestion.id)}
              onBlur={() => setActiveId((current) => (current === suggestion.id ? null : current))}
              onClick={() => onPick(suggestion.prompt, suggestion.specialistId)}
            >
              {/* One element, reparented as the pointer moves. Motion matches it
                  by layout id and slides it, so the highlight tracks the list
                  instead of fading in and out four times over. */}
              {active ? (
                <motion.span
                  aria-hidden="true"
                  layoutId={`${railId}-highlight`}
                  className="absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"
                  transition={reduceMotion(shouldReduceMotion, mdMotion.layout)}
                />
              ) : null}

              <Icon
                className="size-[15px] shrink-0 text-[var(--md-accent)]"
                strokeWidth={1.35}
                aria-hidden="true"
              />

              <span
                className="min-w-0 flex-1 text-[13.5px] font-medium leading-[1.35] text-[var(--md-text)] transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--md-ink)] group-focus-visible:text-[var(--md-ink)]"
                style={{ textWrap: "pretty" }}
                dir="auto"
              >
                {suggestion.title}
              </span>

              {suggestion.meta ? (
                <span className="hidden shrink-0 text-[11.5px] leading-4 text-[var(--md-subtle)] sm:inline" dir="auto">
                  {suggestion.meta}
                </span>
              ) : null}

              <motion.span
                aria-hidden="true"
                className="shrink-0 text-[var(--md-subtle)]"
                initial={false}
                animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: arrowOffset }}
                transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
              >
                <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} />
              </motion.span>
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}
