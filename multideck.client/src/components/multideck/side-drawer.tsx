import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react"
import { X, type LucideIcon } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * The inset slide-in panel used for CRM detail and settings surfaces. It owns the backdrop,
 * the enter and exit motion, Escape, scroll locking, and focus restore so each caller only
 * supplies its header and body.
 */
export function SideDrawer({
  open,
  onClose,
  eyebrow,
  title,
  icon: Icon,
  width = 480,
  slideDistance = 40,
  motionTransition = mdMotion.panel,
  modal = true,
  restoreFocusTo,
  headerActions,
  bodyClassName,
  children,
}: {
  open: boolean
  onClose: () => void
  eyebrow: string
  title: string
  icon?: LucideIcon
  width?: number
  /** Horizontal travel used to make wider drawers visibly emerge from their docked edge. */
  slideDistance?: number
  motionTransition?: Transition
  /** Non-modal drawers keep the register behind them interactive for rapid record switching. */
  modal?: boolean
  /** Explicit opener for drawers launched through app-wide events or an auto-focused form. */
  restoreFocusTo?: HTMLElement | null
  headerActions?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const reduce = Boolean(shouldReduceMotion)
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches)
  const isModal = modal || compact
  const panelRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Remember the trigger before the drawer mounts. Relying on the open effect alone is too late
  // for forms with an auto-focused field, because the browser may already have moved focus inside.
  useEffect(() => {
    if (open) return undefined

    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) restoreFocusRef.current = active

    function rememberFocus(event: FocusEvent) {
      if (event.target instanceof HTMLElement && event.target !== document.body && !panelRef.current?.contains(event.target)) restoreFocusRef.current = event.target
    }

    function rememberPointer(event: PointerEvent) {
      if (!(event.target instanceof Element)) return
      const trigger = event.target.closest<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      if (trigger) restoreFocusRef.current = trigger
    }

    document.addEventListener("focusin", rememberFocus, true)
    document.addEventListener("pointerdown", rememberPointer, true)
    return () => {
      document.removeEventListener("focusin", rememberFocus, true)
      document.removeEventListener("pointerdown", rememberPointer, true)
    }
  }, [open])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)")
    const sync = () => setCompact(media.matches)
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  // The panel leans in from whichever edge it is docked to, which flips under right-to-left.
  const offset = direction === "rtl" ? -slideDistance : slideDistance

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose() }} modal={isModal}>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence initial={false}>
          {open ? (
            <div className={cn("md-side-drawer fixed inset-x-0 top-0 z-50 flex h-dvh justify-end sm:p-[var(--md-page-stack-gap)]", !isModal && "pointer-events-none")} dir={direction}>
              {isModal ? (
                <DialogPrimitive.Overlay forceMount asChild>
                  <motion.div
                    className="absolute inset-0 cursor-default bg-[rgba(11,20,19,0.14)] backdrop-blur-[6px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={reduceMotion(reduce, mdMotion.fast)}
                  />
                </DialogPrimitive.Overlay>
              ) : null}
              <DialogPrimitive.Content
                forceMount
                asChild
                aria-modal={isModal || undefined}
                aria-describedby={undefined}
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                  const active = document.activeElement
                  if (!restoreFocusRef.current && active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) {
                    restoreFocusRef.current = active
                  }
                  panelRef.current?.focus({ preventScroll: true })
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  const target = restoreFocusTo ?? restoreFocusRef.current
                  if (target?.isConnected) target.focus({ preventScroll: true })
                  restoreFocusRef.current = null
                }}
                onInteractOutside={(event) => {
                  // Desktop non-modal drawers support selecting another register row.
                  if (!isModal) event.preventDefault()
                }}
              >
                <motion.aside
                  ref={panelRef}
                  tabIndex={-1}
                  className="md-side-drawer-panel pointer-events-auto relative z-10 flex h-full min-w-0 w-full flex-col overflow-hidden bg-[var(--md-bg)] p-3 shadow-[var(--md-shadow-lift)] focus:outline-none sm:max-w-(--md-drawer-width) sm:rounded-[var(--md-radius-2xl)]"
                  style={{ "--md-drawer-width": `${width}px` } as CSSProperties}
                  initial={{ x: offset, opacity: 0, filter: "blur(8px)" }}
                  animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ x: offset * 0.7, opacity: 0, filter: "blur(8px)" }}
                  transition={reduceMotion(reduce, motionTransition)}
                >
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div className="flex min-w-0 items-center gap-3">
                      {Icon ? (
                        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/60 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                          <Icon className="size-4" strokeWidth={1.2} />
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium uppercase tracking-normal text-[var(--md-subtle)]">{eyebrow}</p>
                        <DialogPrimitive.Title asChild><p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]" dir="auto">{title}</p></DialogPrimitive.Title>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {headerActions}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("Close")} ${title}`}
                        className="size-9 shrink-0 rounded-[var(--md-radius-md)] bg-white/55 shadow-[var(--md-shadow-line)] hover:bg-white/80"
                        onClick={onClose}
                      >
                        <X data-icon="inline-start" strokeWidth={1.2} />
                      </Button>
                    </div>
                  </div>
                  <div className={cn("md-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>{children}</div>
                </motion.aside>
              </DialogPrimitive.Content>
            </div>
          ) : null}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * A record opened into a drawer rather than a page or a centred dialog. Use it
 * where the record is short enough to read in one panel: the register stays
 * visible behind it, so the row that was picked and the next one are both still
 * on screen while the operator works.
 *
 * The layout is fixed on purpose – the record's own facts first, then whatever
 * the caller adds, then an action bar that sticks to the bottom of the scroll
 * area so a long form never hides the button that commits it.
 */
export function RecordDrawer({
  open,
  onClose,
  eyebrow,
  title,
  icon,
  width = 560,
  slideDistance,
  motionTransition,
  summary,
  children,
  actions,
  closeLabel = "Close",
}: {
  open: boolean
  onClose: () => void
  eyebrow: string
  title: string
  icon?: LucideIcon
  width?: number
  slideDistance?: number
  motionTransition?: Transition
  /** The record's own facts, before anything asks the operator a question. */
  summary: ReactNode
  children?: ReactNode
  /** The primary action. The dismiss control is supplied for you. */
  actions?: ReactNode
  closeLabel?: string
}) {
  const { t } = useLanguage()

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={eyebrow} title={title} icon={icon} width={width} slideDistance={slideDistance} motionTransition={motionTransition} bodyClassName="px-0">
      <div className="grid gap-3 pb-1">
        <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3.5 shadow-[var(--md-shadow-line)]">{summary}</div>
        {children}
      </div>
      <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-end gap-2 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_92%,transparent)] p-2 shadow-[var(--md-shadow-line)] backdrop-blur-xl">
        <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[12.5px]" onClick={onClose}>{t(closeLabel)}</Button>
        {actions}
      </div>
    </SideDrawer>
  )
}
