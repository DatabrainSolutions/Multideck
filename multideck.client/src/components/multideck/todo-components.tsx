import { motion, useReducedMotion } from "motion/react"
import { ArrowDown, ArrowUp, Minus, Zap } from "@/components/icons/hugeicons"
import { StatusPill } from "@/components/multideck/status-pill"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { mdEase, mdMotion, reduceMotion } from "@/lib/motion"
import type { TodoPriority } from "@/lib/todo-api"
import { cn } from "@/lib/utils"

const priorityPresentation = {
  low: { label: "Low", tone: "blue" as const, Icon: ArrowDown },
  medium: { label: "Medium", tone: "teal" as const, Icon: Minus },
  high: { label: "High", tone: "amber" as const, Icon: ArrowUp },
  urgent: { label: "Urgent", tone: "red" as const, Icon: Zap },
}

const noPriorityPresentation = { label: "No priority", tone: "neutral" as const, Icon: Minus }

export function TodoPriorityPicker({ value, onValueChange, className, ariaLabel }: { value: TodoPriority | ""; onValueChange: (value: TodoPriority | "") => void; className?: string; ariaLabel: string }) {
  const { t } = useLanguage()
  const presentation = value ? priorityPresentation[value] : noPriorityPresentation
  const Icon = presentation.Icon

  return (
    <Select value={value || "none"} onValueChange={(next) => onValueChange(next === "none" ? "" : next as TodoPriority)}>
      <SelectTrigger aria-label={ariaLabel} className={cn("h-8 min-w-[132px] text-[12px]", className)}>
        <SelectValue><span className="flex items-center gap-1.5"><Icon aria-hidden="true" className={cn("size-3.5", value ? `text-[var(--md-${presentation.tone})]` : "text-[var(--md-subtle)]")} strokeWidth={1.8} /><span>{t(presentation.label)}</span></span></SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="w-[172px] p-1.5">
        <SelectItem value="none"><PriorityOption presentation={noPriorityPresentation} /></SelectItem>
        {(Object.entries(priorityPresentation) as [TodoPriority, typeof priorityPresentation[TodoPriority]][]).map(([priority, option]) => <SelectItem key={priority} value={priority}><PriorityOption presentation={option} /></SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function PriorityOption({ presentation }: { presentation: typeof noPriorityPresentation | typeof priorityPresentation[TodoPriority] }) {
  const { t } = useLanguage()
  const Icon = presentation.Icon
  const isNeutral = presentation.tone === "neutral"
  return <span className="flex items-center gap-2"><span className={cn("grid size-5 place-items-center rounded-[var(--md-radius-sm)]", isNeutral ? "bg-[var(--md-surface-tint)] text-[var(--md-subtle)]" : `bg-[color-mix(in_srgb,var(--md-${presentation.tone})_14%,transparent)] text-[var(--md-${presentation.tone})]`)}><Icon aria-hidden="true" className="size-3.5" strokeWidth={1.8} /></span><span>{t(presentation.label)}</span></span>
}

export function TodoPriorityPill({ priority, className }: { priority: TodoPriority; className?: string }) {
  const { t } = useLanguage()
  const presentation = priorityPresentation[priority]
  const Icon = presentation.Icon
  return (
    <StatusPill
      kind="status"
      tone={presentation.tone}
      indicator={<Icon aria-hidden="true" className="size-3" strokeWidth={1.7} />}
      className={cn("gap-1.5", className)}
    >
      {t(presentation.label)}
    </StatusPill>
  )
}

export function TodoCompletionControl({
  checked,
  busy = false,
  disabled = false,
  label,
  onChange,
  className,
}: {
  checked: boolean
  busy?: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
  className?: string
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <button
      type="button"
      data-i18n-skip
      aria-label={label}
      aria-pressed={checked}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(
        "group grid size-10 shrink-0 place-items-center rounded-full outline-none transition-colors duration-200",
        "focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)]",
        "disabled:cursor-wait disabled:opacity-70",
        className,
      )}
      onClick={() => onChange(!checked)}
    >
      <motion.span
        className="relative block size-6"
        initial={false}
        animate={shouldReduceMotion ? { scale: 1 } : { scale: checked ? [1, 0.88, 1.08, 1] : [1, 0.96, 1] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: checked ? 0.26 : 0.18, ease: mdEase, times: checked ? [0, 0.28, 0.68, 1] : [0, 0.5, 1] }}
      >
        <svg aria-hidden="true" className="size-6 overflow-visible" viewBox="0 0 24 24" fill="none">
          <motion.circle
            cx="12"
            cy="12"
            r="9.25"
            strokeWidth="1.5"
            animate={{
              fill: checked ? "var(--md-accent)" : "transparent",
              stroke: checked ? "var(--md-accent)" : "var(--md-line-strong)",
            }}
            transition={reduceMotion(shouldReduceMotion, mdMotion.fast)}
          />
          <motion.path
            d="M7.8 12.2 10.6 15l5.8-6.2"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: checked ? 0.22 : 0.12, ease: mdEase }}
          />
        </svg>
      </motion.span>
    </button>
  )
}

export type TodoActionIconState = "idle" | "loading" | "success"

export function TodoActionStateIcon({ state, className }: { state: TodoActionIconState; className?: string }) {
  const { direction } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const transition = reduceMotion(shouldReduceMotion, mdMotion.fast)

  return (
    <motion.svg
      aria-hidden="true"
      className={cn("size-5 overflow-visible", className)}
      viewBox="0 0 24 24"
      fill="none"
      initial={false}
      animate={state === "loading" && !shouldReduceMotion ? { rotate: 360 } : { rotate: 0 }}
      transition={state === "loading" && !shouldReduceMotion ? { duration: 0.72, ease: "linear", repeat: Infinity } : transition}
    >
      <motion.g
        initial={false}
        animate={{ opacity: state === "idle" ? 1 : 0, scale: state === "idle" ? 1 : 0.7 }}
        transition={transition}
        style={{ transformOrigin: "12px 12px", rotate: direction === "rtl" ? "180deg" : "0deg" }}
      >
        <path d="M5 12h13M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <motion.circle
        cx="12"
        cy="12"
        r="7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="30 18"
        initial={false}
        animate={{ opacity: state === "loading" ? 1 : 0, scale: state === "loading" ? 1 : 0.72 }}
        transition={transition}
        style={{ transformOrigin: "12px 12px" }}
      />
      <motion.path
        d="M6.8 12.2 10.4 15.7 17.5 8.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: state === "success" ? 1 : 0, opacity: state === "success" ? 1 : 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: mdEase }}
      />
    </motion.svg>
  )
}
