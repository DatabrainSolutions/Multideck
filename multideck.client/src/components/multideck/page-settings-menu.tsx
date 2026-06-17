import { useId, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, type LucideIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type PageSettingsViewOption<T extends string = string> = {
  value: T
  label?: string
  icon: LucideIcon
}

export type PageSettingsAction = {
  id: string
  label: string
  icon: LucideIcon
  onSelect: () => void
}

type PageSettingsMenuProps<T extends string> = {
  title?: string
  viewLabel?: string
  viewOptions?: readonly PageSettingsViewOption<T>[]
  value?: T
  onViewChange?: (value: T) => void
  actions?: readonly PageSettingsAction[]
  className?: string
}

const menuReveal = {
  hidden: { opacity: 0, y: -6, scale: 0.98, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.26,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      staggerChildren: 0.035,
      delayChildren: 0.035,
    },
  },
}

const itemReveal = {
  hidden: { opacity: 0, y: 7 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

function PageSettingsTriggerIcon({ open }: { open: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const controlTransition = reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)
  const controls = [
    { y: -5, idleX: -3, openX: 2 },
    { y: 0, idleX: 4, openX: -4 },
    { y: 5, idleX: 0, openX: 5 },
  ]

  return (
    <span className="relative grid size-5 place-items-center" aria-hidden="true">
      {controls.map((control) => (
        <span key={`track-${control.y}`} className="absolute h-px w-[18px] rounded-full bg-current opacity-[0.38]" style={{ transform: `translateY(${control.y}px)` }} />
      ))}
      {controls.map((control, index) => (
        <motion.span
          key={`knob-${control.y}`}
          className="absolute size-[3px] rounded-full bg-current shadow-[0_0_0_1px_rgba(255,255,255,0.66)] dark:shadow-[0_0_0_1px_rgba(20,24,23,0.76)]"
          initial={false}
          animate={shouldReduceMotion ? undefined : { x: open ? control.openX : control.idleX, y: control.y, scale: open && index === 1 ? 1.12 : 1 }}
          transition={controlTransition}
          style={{ transform: `translate(${control.idleX}px, ${control.y}px)` }}
        />
      ))}
    </span>
  )
}

export function PageSettingsMenu<T extends string>({
  title = "Page settings",
  viewLabel = "View",
  viewOptions = [],
  value,
  onViewChange,
  actions = [],
  className,
}: PageSettingsMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const id = useId().replace(/:/g, "")
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  function selectView(nextValue: T) {
    onViewChange?.(nextValue)
    setOpen(false)
  }

  function selectAction(action: PageSettingsAction) {
    action.onSelect()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          aria-label={t(open ? "Close page settings" : "Open page settings")}
          title={t(open ? "Close page settings" : "Open page settings")}
          className={cn(
            "group grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-white/45 text-[var(--md-text)] shadow-[var(--md-shadow-line)]",
            "transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-soft)]",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] data-[state=open]:bg-[var(--md-accent)] data-[state=open]:text-white data-[state=open]:shadow-[0_0_0_3px_rgba(14,125,116,0.13),var(--md-shadow-line)]",
            className,
          )}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
        >
          <PageSettingsTriggerIcon open={open} />
        </motion.button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(92vw,292px)] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[rgba(251,253,253,0.98)] p-2 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl dark:bg-[rgba(28,34,32,0.98)]"
      >
        <motion.div
          initial={shouldReduceMotion ? false : "hidden"}
          animate={shouldReduceMotion ? undefined : "show"}
          variants={menuReveal}
          className="grid gap-2"
        >
          <motion.div variants={itemReveal} className="px-2 pb-1 pt-1">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t(title)}</p>
          </motion.div>

          {viewOptions.length ? (
            <motion.div variants={itemReveal} className="grid gap-1">
              <p className="px-2 text-[11px] font-medium uppercase text-[var(--md-subtle)]">{t(viewLabel)}</p>
              <div className="grid gap-1">
                {viewOptions.map((option) => {
                  const Icon = option.icon
                  const label = option.label ?? option.value
                  const selected = value === option.value

                  return (
                    <motion.button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "group/item relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-text)]",
                        "transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]",
                        selected && "text-[var(--md-ink)]",
                      )}
                      onClick={() => selectView(option.value)}
                      whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
                      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
                    >
                      {selected ? (
                        <motion.span
                          layoutId={`${id}-page-settings-active`}
                          className="absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.layout)}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-[var(--md-radius-md)] bg-white/50 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,transform] duration-200 group-hover/item:text-[var(--md-ink)]",
                          selected && "bg-[var(--md-icon-well)] text-[var(--md-accent)]",
                        )}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={`${option.value}-${selected ? "selected" : "idle"}`}
                            className="absolute grid size-4 place-items-center"
                            initial={shouldReduceMotion ? false : { opacity: 0, rotate: -18, scale: 0.72, filter: "blur(4px)" }}
                            animate={shouldReduceMotion ? undefined : { opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)" }}
                            exit={shouldReduceMotion ? undefined : { opacity: 0, rotate: 14, scale: 0.78, filter: "blur(4px)" }}
                            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                          >
                            <Icon className="size-4" strokeWidth={1.25} />
                          </motion.span>
                        </AnimatePresence>
                      </span>
                      <span className="relative min-w-0 flex-1 truncate">{t(label)}</span>
                      {selected ? (
                        <motion.span
                          layout
                          className="relative grid size-5 shrink-0 place-items-center rounded-full bg-[var(--md-accent)] text-white shadow-[0_0_0_3px_rgba(14,125,116,0.11)]"
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.layout)}
                        >
                          <Check className="size-3" strokeWidth={1.6} />
                        </motion.span>
                      ) : null}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          ) : null}

          {actions.length ? (
            <motion.div variants={itemReveal} className="grid gap-1 border-t border-[rgba(11,20,19,0.06)] pt-2 dark:border-[rgba(255,255,255,0.08)]">
              <p className="px-2 text-[11px] font-medium uppercase text-[var(--md-subtle)]">{t("Actions")}</p>
              {actions.map((action) => {
                const Icon = action.icon

                return (
                  <motion.button
                    key={action.id}
                    type="button"
                    className="group/item flex h-10 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]"
                    onClick={() => selectAction(action)}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
                    transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-white/50 text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background,color,transform] duration-200 group-hover/item:text-[var(--md-ink)]">
                      <Icon className="size-4" strokeWidth={1.25} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t(action.label)}</span>
                  </motion.button>
                )
              })}
            </motion.div>
          ) : null}
        </motion.div>
      </PopoverContent>
    </Popover>
  )
}
