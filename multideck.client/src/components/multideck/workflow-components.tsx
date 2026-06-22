import { useId } from "react"
import { Check } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"

export type LabelOption = {
  label: string
  value?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const controlId = useId()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={cn("relative isolate flex rounded-[var(--md-radius-lg)] bg-white/60 p-1 shadow-[var(--md-shadow-line)]", className)}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={cn(
            "relative h-8 rounded-[var(--md-radius-md)] px-4 text-[13px] font-medium text-[var(--md-text)] transition-[color,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-ink)]",
            value === option && "text-[var(--md-ink)]",
          )}
          onClick={() => onChange(option)}
        >
          {value === option ? (
            <motion.span
              aria-hidden="true"
              layoutId={`${controlId}-active-segment`}
              className="absolute inset-0 -z-10 rounded-[var(--md-radius-md)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-line)]"
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.page)}
            />
          ) : null}
          <span className="relative">{option}</span>
        </button>
      ))}
    </div>
  )
}

export function FilterChips({
  options,
  activeOption,
  onChange,
  auxiliaryOptions = [],
  className,
}: {
  options: readonly string[]
  activeOption: string
  onChange: (option: string) => void
  auxiliaryOptions?: readonly string[]
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={activeOption === option}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform]",
            activeOption === option
              ? "bg-[var(--md-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_0_0_3px_rgba(14,125,116,0.13)]"
              : "bg-white/25 text-[var(--md-text)] hover:bg-white/50",
            option.includes("!") && activeOption !== option && "text-[var(--md-amber)]",
          )}
          onClick={() => onChange(option)}
        >
          {activeOption === option ? <Check className="size-3.5" strokeWidth={1.6} /> : null}
          {option}
        </button>
      ))}
      {auxiliaryOptions.length ? <span className="mx-2 hidden h-7 w-px bg-[rgba(11,20,19,0.08)] sm:block" /> : null}
      {auxiliaryOptions.map((option) => (
        <button key={option} type="button" className="h-9 rounded-full bg-white/25 px-4 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/50">
          {option}
        </button>
      ))}
    </div>
  )
}

export function TabsRail({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: readonly LabelOption[]
  activeTab: string
  onChange: (tab: string) => void
  className?: string
}) {
  const railId = useId()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={cn("relative flex gap-[var(--md-page-stack-gap)] overflow-x-auto shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)] md-scrollbar", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          aria-pressed={activeTab === tab.label}
          className={cn(
            "relative flex h-12 shrink-0 items-center gap-2 text-[14px] font-medium text-[var(--md-text)] transition-[color,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-ink)]",
            activeTab === tab.label && "text-[var(--md-ink)]",
          )}
          onClick={() => onChange(tab.label)}
        >
          {activeTab === tab.label ? (
            <motion.span
              aria-hidden="true"
              layoutId={`${railId}-active-tab`}
              className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-[var(--md-accent)]"
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.page)}
            />
          ) : null}
          {tab.label}
          {tab.value ? <span className="rounded-[var(--md-radius-sm)] bg-[rgba(90,103,100,0.08)] px-2 py-0.5 text-[12px] text-[var(--md-text)]">{tab.value}</span> : null}
        </button>
      ))}
    </div>
  )
}
