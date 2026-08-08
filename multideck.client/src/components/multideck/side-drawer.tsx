import { useEffect, useRef, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { X, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** Drawers can overlap while one is animating out, so the lock is counted rather than toggled. */
let scrollLockCount = 0

function lockPageScroll() {
  if (typeof document === "undefined") return () => undefined

  const { body } = document
  if (scrollLockCount === 0) {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.dataset.mdScrollLockOverflow = body.style.overflow
    body.dataset.mdScrollLockPad = body.style.paddingInlineEnd
    body.style.overflow = "hidden"
    if (scrollbar > 0) body.style.paddingInlineEnd = `${scrollbar}px`
  }
  scrollLockCount += 1

  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1)
    if (scrollLockCount > 0) return
    body.style.overflow = body.dataset.mdScrollLockOverflow ?? ""
    body.style.paddingInlineEnd = body.dataset.mdScrollLockPad ?? ""
    delete body.dataset.mdScrollLockOverflow
    delete body.dataset.mdScrollLockPad
  }
}

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
  headerActions?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const reduce = Boolean(shouldReduceMotion)
  const panelRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return undefined
    return lockPageScroll()
  }, [open])

  // Send focus into the panel on open and hand it back to the trigger on close, so keyboard
  // and screen-reader users are not dropped at the top of the page behind the drawer.
  useEffect(() => {
    if (!open) return undefined

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus({ preventScroll: true })

    return () => {
      restoreFocusRef.current?.focus({ preventScroll: true })
      restoreFocusRef.current = null
    }
  }, [open])

  // The panel leans in from whichever edge it is docked to, which flips under right-to-left.
  const offset = direction === "rtl" ? -40 : 40

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end p-3 sm:p-[var(--md-page-stack-gap)]" dir={direction}>
          <motion.button
            type="button"
            aria-label={`${t("Close")} ${title}`}
            className="absolute inset-0 cursor-default bg-[rgba(11,20,19,0.14)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion(reduce, mdMotion.fast)}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="relative z-10 flex h-full w-full flex-col overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-bg)] p-3 shadow-[var(--md-shadow-lift)] focus:outline-none"
            style={{ maxWidth: width }}
            initial={{ x: offset, opacity: 0, filter: "blur(8px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: offset * 0.7, opacity: 0, filter: "blur(8px)" }}
            transition={reduceMotion(reduce, mdMotion.panel)}
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
                  <p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]" dir="auto">{title}</p>
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
            <div className={cn("md-scrollbar min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * A record opened into a drawer rather than a page or a centred dialog. Use it
 * where the record is short enough to read in one panel: the register stays
 * visible behind it, so the row that was picked and the next one are both still
 * on screen while the operator works.
 *
 * The layout is fixed on purpose — the record's own facts first, then whatever
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
  /** The record's own facts, before anything asks the operator a question. */
  summary: ReactNode
  children?: ReactNode
  /** The primary action. The dismiss control is supplied for you. */
  actions?: ReactNode
  closeLabel?: string
}) {
  const { t } = useLanguage()

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={eyebrow} title={title} icon={icon} width={width} bodyClassName="px-0">
      <div className="grid gap-3 pb-1">
        <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3.5 shadow-[var(--md-shadow-line)]">{summary}</div>
        {children}
      </div>
      <div className="sticky bottom-0 mt-3 flex items-center justify-end gap-2 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_92%,transparent)] p-2 shadow-[var(--md-shadow-line)] backdrop-blur-xl">
        <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[12.5px]" onClick={onClose}>{t(closeLabel)}</Button>
        {actions}
      </div>
    </SideDrawer>
  )
}
