import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "@/components/icons/hugeicons"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type WizardStep = {
  id: string
  label: string
  /** One line under the step's fields saying what this step is for. */
  hint?: string
  /** Marks the step done in the rail. Leave undefined for steps with nothing required. */
  complete?: boolean
}

/**
 * A record being created or edited, one group of fields at a time, with the whole
 * shape of the job visible from the first screen.
 *
 * Every step is reachable at any moment — the rail is a map, not a gate. These
 * forms validate on submit against the server's own rules, so blocking step two
 * until step one is perfect would invent a constraint the backend does not have
 * and trap an operator who filled things out of order.
 *
 * The rail's fill is the only thing that animates on the progress track, and it
 * scales rather than resizing, so stepping is one composited frame however wide
 * the dialog is.
 */
export function WizardDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  activeStepId,
  onStepChange,
  submitLabel,
  onSubmit,
  saving = false,
  submitDisabled = false,
  secondaryAction,
  bodyMinHeight = 320,
  presentation = "dialog",
  layout = "wizard",
  drawerEyebrow = "Details",
  drawerWidth = 560,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  steps: WizardStep[]
  activeStepId: string
  onStepChange: (id: string) => void
  submitLabel: string
  onSubmit: () => void
  saving?: boolean
  submitDisabled?: boolean
  /** Sits on the far side of the footer. Used for Delete when editing. */
  secondaryAction?: ReactNode
  /**
   * Reserves the tallest step's height so moving between steps does not resize the
   * dialog under the pointer.
   */
  bodyMinHeight?: number
  /** Use a trailing panel when the record should stay anchored to a visible register row. */
  presentation?: "dialog" | "drawer"
  /** Editing an existing record can show every field at once without creation steps. */
  layout?: "wizard" | "form"
  drawerEyebrow?: string
  drawerWidth?: number
  className?: string
  children: ReactNode
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStepId))
  const isLastStep = activeIndex === steps.length - 1
  const isFormLayout = layout === "form"
  // Keep the connector between the step markers, rather than stretching it to
  // the dialog edges. Apart from being calmer, this avoids the first step
  // looking as though the progress line runs into it.
  const railInset = steps.length > 1 ? `${50 / steps.length}%` : "50%"
  // Which way the content travels. Reading it from the last index rather than
  // from the click means the rail, the Back button and a keyboard shortcut all
  // produce the same direction.
  const [direction, setDirection] = useState(1)
  const previousIndex = useRef(activeIndex)
  const previousOpen = useRef(open)
  const returnFocusTarget = useRef<HTMLElement | null>(null)

  // These dialogs are often opened by a top-bar event rather than a Radix
  // DialogTrigger. Capture the focused action before the portal mounts so
  // keyboard users return to the control they used when the dialog closes.
  if (open && !previousOpen.current && typeof document !== "undefined") {
    const activeElement = document.activeElement
    returnFocusTarget.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null
  }

  useEffect(() => {
    if (activeIndex === previousIndex.current) return
    setDirection(activeIndex > previousIndex.current ? 1 : -1)
    previousIndex.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    previousOpen.current = open
  }, [open])

  function goTo(index: number) {
    const next = steps[Math.max(0, Math.min(steps.length - 1, index))]
    if (next && next.id !== activeStepId) onStepChange(next.id)
  }

  const travel = shouldReduceMotion ? 0 : 14

  const wizardContent = (
    <>
        {presentation === "drawer" && description && !isFormLayout ? (
          <p className="px-5 pb-1 pt-4 text-[12.5px] leading-5 text-[var(--md-text)]">{t(description)}</p>
        ) : null}
        {/* The rail answers three questions at once: how many steps there are,
            which one this is, and which are already filled in. */}
        {!isFormLayout ? (
          <nav aria-label={t("Steps")} className={cn("shrink-0 pb-4 pt-4", presentation === "drawer" ? "px-5" : "px-6")}>
            <ol className="relative grid items-start gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.length > 1 ? <>
              <span aria-hidden="true" className="absolute top-[11px] h-0.5 rounded-full bg-[var(--md-line-strong)]" style={{ insetInlineStart: railInset, insetInlineEnd: railInset }} />
              <motion.span
                aria-hidden="true"
                className="absolute top-[11px] h-0.5 origin-left rounded-full bg-[var(--md-accent)] rtl:origin-right"
                style={{ insetInlineStart: railInset, insetInlineEnd: railInset }}
                initial={false}
                animate={{ scaleX: activeIndex / (steps.length - 1) }}
                transition={shouldReduceMotion ? { duration: 0 } : mdMotion.panel}
              />
            </> : null}
            {steps.map((step, index) => {
              const isCurrent = index === activeIndex
              const isDone = step.complete === true && !isCurrent
              return (
                <li key={step.id} className="relative z-[1] flex min-w-0 justify-center">
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={isCurrent ? "step" : undefined}
                    className="group flex min-w-0 flex-col items-center gap-2 rounded-[var(--md-radius-md)] px-1 py-0.5 outline-none"
                  >
                    <span
                      className={cn(
                        "relative z-[1] grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium tabular-nums ring-[3px] ring-[var(--md-surface)] transition-[background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-[var(--md-accent)]",
                        isCurrent
                          ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[0_0_0_3px_var(--md-accent-a14)]"
                          : isDone
                            ? "bg-[color-mix(in_srgb,var(--md-surface)_82%,var(--md-accent)_18%)] text-[var(--md-accent)] shadow-[inset_0_0_0_1px_var(--md-accent-a32)]"
                            : "bg-[var(--md-field-bg)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_var(--md-line-strong)] group-hover:bg-[var(--md-field-bg-hover)] group-hover:text-[var(--md-ink)]",
                      )}
                    >
                      {isDone ? <Check className="size-3" strokeWidth={2} aria-hidden="true" /> : <span data-i18n-skip dir="ltr">{index + 1}</span>}
                    </span>
                    <span className={cn("max-w-[130px] truncate text-[12px] leading-4 transition-colors duration-200", isCurrent ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-text)] group-hover:text-[var(--md-ink)]")}>
                      {t(step.label)}
                    </span>
                  </button>
                </li>
              )
            })}
            </ol>
          </nav>
        ) : null}

        <div
          className={cn("md-scrollbar min-h-0 flex-1 overflow-y-auto pb-5", presentation === "drawer" ? "px-5" : "px-6", isFormLayout && "pt-4")}
          style={{ flexBasis: presentation === "drawer" ? undefined : bodyMinHeight }}
        >
          {/* mode="wait" with a short exit: the outgoing step is gone before the
              next arrives, so two sets of fields are never stacked, and rapid
              stepping still feels answered. */}
          {isFormLayout ? (
            <div className="grid content-start gap-5">{children}</div>
          ) : (
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={activeStepId}
                custom={direction}
                initial={shouldReduceMotion ? false : { opacity: 0, x: direction * travel }}
                animate={{ opacity: 1, x: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -travel, transition: { ...mdMotion.exit, duration: 0.12 } }}
                transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
                className="grid content-start gap-4"
              >
                {steps[activeIndex]?.hint ? (
                  <p className="text-[12px] leading-4 text-[var(--md-text)]">{t(steps[activeIndex].hint!)}</p>
                ) : null}
                {children}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <div className={cn("flex shrink-0 flex-row items-center justify-between gap-2 bg-[var(--md-surface-soft)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[var(--md-stroke-top)]", presentation === "drawer" ? "flex-wrap px-4" : "px-6")}>
          <div className="flex items-center gap-2">
            {secondaryAction}
          </div>
          <div className="flex items-center gap-2">
            {!isFormLayout ? (
              <Button
                type="button"
                variant="ghost"
                disabled={activeIndex === 0}
                onClick={() => goTo(activeIndex - 1)}
                className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] disabled:opacity-40"
              >
                <ArrowLeft data-icon="inline-start" className="size-4 rtl:rotate-180" strokeWidth={1.4} />
                {t("Back")}
              </Button>
            ) : null}
            {isFormLayout || isLastStep ? (
              <Button
                type="button"
                onClick={onSubmit}
                disabled={saving || submitDisabled}
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] active:scale-[0.97] motion-reduce:transform-none"
              >
                {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" strokeWidth={1.6} /> : null}
                {t(submitLabel)}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => goTo(activeIndex + 1)}
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] active:scale-[0.97] motion-reduce:transform-none"
              >
                {t("Next")}
                <ArrowRight data-icon="inline-end" className="size-4 rtl:rotate-180" strokeWidth={1.4} />
              </Button>
            )}
          </div>
        </div>
    </>
  )

  if (presentation === "drawer") {
    return (
      <SideDrawer
        open={open}
        onClose={() => onOpenChange(false)}
        eyebrow={t(drawerEyebrow)}
        title={t(title)}
        width={drawerWidth}
        modal={false}
        bodyClassName="flex flex-col overflow-hidden"
      >
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]", className)}>
          {wizardContent}
        </div>
      </SideDrawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-[720px]", className)}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTarget.current
          returnFocusTarget.current = null
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
        onEscapeKeyDown={(event) => {
          const activeElement = document.activeElement
          if (activeElement instanceof Element && activeElement.closest('[data-wizard-escape-contained="true"]')) event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 gap-1 px-6 pb-4 pt-5 text-start shadow-[var(--md-stroke-bottom)]">
          <DialogTitle className="text-[16px] font-medium">{t(title)}</DialogTitle>
          {description ? <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">{t(description)}</DialogDescription> : null}
        </DialogHeader>
        {wizardContent}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Lets a wizard submit from any step without the operator having to walk to the
 * end. Rendered beside Delete so the footer's right-hand side stays a single
 * forward path.
 */
export function WizardSaveNowButton({ label, onSubmit, saving, disabled }: { label: string; onSubmit: () => void; saving?: boolean; disabled?: boolean }) {
  const { t } = useLanguage()

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSubmit}
      disabled={saving || disabled}
      className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
    >
      {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" strokeWidth={1.6} /> : null}
      {t(label)}
    </Button>
  )
}
