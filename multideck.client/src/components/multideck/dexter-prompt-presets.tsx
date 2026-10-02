import { useCallback, useEffect, useRef, type HTMLAttributes, type RefObject } from "react"
import { motion, useReducedMotion } from "motion/react"
import type { LucideIcon } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdEaseIn, mdEaseOut } from "@/lib/motion"
import type { DexterSpecialistId } from "@/components/multideck/agent-dexter-components"

export type DexterPromptPreset = {
  id: string
  /** What the chip says. A verb and its object – three or four words, never a sentence. */
  title: string
  /** What Dexter actually receives, which can be longer and more specific. */
  prompt: string
  /** The record or figure behind the preset, read on hover and by assistive tech. */
  meta?: string
  icon: LucideIcon
  specialistId: DexterSpecialistId
}

/**
 * A horizontal strip only fades the edge that actually has more behind it.
 * A permanent fade on a row that fits reads as clipped content.
 */
export function useOverflowFade<T extends HTMLElement>(ref: RefObject<T | null>) {
  const update = useCallback(() => {
    const element = ref.current
    if (!element) return
    // Scroll offsets run negative in right-to-left layouts.
    const offset = Math.abs(element.scrollLeft)
    const hidden = element.scrollWidth - element.clientWidth
    element.dataset.fadeStart = offset > 1 ? "true" : "false"
    element.dataset.fadeEnd = hidden - offset > 1 ? "true" : "false"
  }, [ref])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    update()
    const resize = new ResizeObserver(update)
    resize.observe(element)
    // Content swaps – presets for roles and back – change the scroll width
    // without resizing the strip itself.
    const mutation = new MutationObserver(update)
    mutation.observe(element, { childList: true, subtree: true })
    element.addEventListener("scroll", update, { passive: true })
    return () => {
      resize.disconnect()
      mutation.disconnect()
      element.removeEventListener("scroll", update)
    }
  }, [ref, update])

  return update
}

/**
 * Starting points for a prompt, shelved in the composer's tray. Short chips
 * rather than sentences, so several fit on one line beside the role and the
 * operator can read the whole shelf at a glance. Choosing one sends it.
 */
export function DexterPromptPresets({
  presets,
  onPick,
  /** Seconds to hold the shelf back, so it fills after the box has landed. */
  delay = 0,
  instant = false,
  label = "Suggested prompts",
  className,
}: {
  presets: DexterPromptPreset[]
  onPick: (prompt: string, specialistId: DexterSpecialistId) => void
  delay?: number
  instant?: boolean
  label?: string
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())

  if (!presets.length) return null

  // The shelf arrives as one row, not chip by chip: these are a set of equal
  // options, and dealing them out one at a time implies an order they lack.
  return (
    <motion.div
      role="list"
      aria-label={t(label)}
      className={cn("mx-auto flex min-w-max items-center gap-1.5", className)}
      initial={instant || shouldReduceMotion ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, y: 4, filter: "blur(4px)", transition: { duration: 0.14, ease: mdEaseIn } }}
      transition={instant || shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: mdEaseOut, delay }}
    >
      {presets.map((preset) => {
        const Icon = preset.icon

        return (
          <div key={preset.id} role="listitem" className="shrink-0">
            <button
              type="button"
              title={preset.meta ? `${preset.title} · ${preset.meta}` : preset.title}
              aria-description={preset.meta}
              className="md-composer-preset group/preset inline-flex h-8 items-center gap-1.5 rounded-full pe-3 ps-2.5 text-[12.5px] font-medium"
              onClick={() => onPick(preset.prompt, preset.specialistId)}
            >
              <Icon className="md-composer-preset__icon size-3.5 shrink-0" strokeWidth={1.4} aria-hidden="true" />
              <span className="whitespace-nowrap" dir="auto">{preset.title}</span>
            </button>
          </div>
        )
      })}
    </motion.div>
  )
}

/**
 * The scrolling shelf inside the tray. Its row centres on auto margins rather
 * than `justify-content`, which would push an overflowing row's first chips
 * out of reach to the left.
 */
export function ComposerTrayStrip({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  useOverflowFade(ref)

  return (
    <div ref={ref} className={cn("md-composer-tray-strip flex min-w-0 flex-1 overflow-x-auto py-1", className)} {...props}>
      {children}
    </div>
  )
}
