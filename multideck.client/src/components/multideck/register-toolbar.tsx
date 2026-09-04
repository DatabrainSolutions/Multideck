import { type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { RefreshCw, Search, X } from "@/components/icons/hugeicons"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * The controls that live inside a `DataTable` toolbar: a view switch and a
 * view tabs on the leading edge, with search, filters, and utilities on the
 * trailing edge. Creation remains in the contextual top bar. Every register in
 * the product uses these rather than growing its own filter bar above the table,
 * so an operator learns one row of controls once.
 *
 * They are all 32px tall so the toolbar stays one line, and they all sit on the
 * panel surface with the hairline stroke rather than a border.
 */

export const registerControlClass = "h-8 min-w-0 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-shadow duration-200 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] data-[placeholder]:text-[var(--md-subtle)]"

export const registerButtonClass = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-text)] outline-none transition-[background,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-line)] focus-visible:bg-[var(--md-surface)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.96] motion-reduce:transform-none"

/** A hairline between two groups of toolbar controls. */
export function RegisterToolbarDivider() {
  return <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-[var(--md-line)] sm:block" />
}

/**
 * The register's primary slice. The selected pill travels between segments on a
 * spring, and the count rides on the active segment only — a number under every
 * label reads as four competing figures rather than one answer.
 */
export function RegisterViewSwitch<T extends string>({
  options,
  value,
  onChange,
  counts,
  ariaLabel,
  compact = false,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  /** Shown beside the label. Omit an entry to leave that segment bare. */
  counts?: Partial<Record<T, number | undefined>>
  ariaLabel: string
  /** Keeps dense operational registers on one toolbar row at desktop widths. */
  compact?: boolean
}) {
  const { t } = useLanguage()

  return (
    <SegmentedControl
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className={cn("p-[3px]", compact && "h-8 p-0.5 [&>button]:h-7 [&>button]:rounded-[calc(var(--md-radius-lg)-2px)] [&>button]:px-2 [&>button]:text-[12px] [&>button>span]:gap-1")}
      renderOption={(option) => {
        const count = counts?.[option]
        const reservesCountSpace = compact ? count !== undefined : counts !== undefined
        return (
          <>
            <span>{t(option)}</span>
            {reservesCountSpace ? (
              <span
                data-i18n-skip
                dir="ltr"
                aria-hidden={count === undefined ? true : undefined}
                className={cn(
                  "inline-block min-w-[2ch] text-center text-[10.5px] tabular-nums transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  count === undefined ? "opacity-0" : value === option ? "opacity-70" : "opacity-45",
                )}
              >
                {count ?? 0}
              </span>
            ) : null}
          </>
        )
      }}
    />
  )
}

/**
 * One filter. `value` is the empty string when nothing is chosen, and the
 * trigger takes the accent colour while a filter is on, so an operator can see
 * at a glance which of the row's controls is narrowing the table.
 */
export function RegisterFacetSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  allLabel: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}) {
  const { t } = useLanguage()
  const noneValue = "__all__"

  return (
    <Select value={value || noneValue} onValueChange={(next) => onChange(next === noneValue ? "" : next)}>
      <SelectTrigger aria-label={t(label)} className={cn(registerControlClass, "shrink-0", value && "text-[var(--md-accent)]", className)}>
        <SelectValue placeholder={t(label)} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={noneValue}>{t(allLabel)}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/**
 * The register's quick search. The clear button only exists while there is
 * something to clear, and it arrives and leaves on a scale so the field's right
 * edge never appears to jump.
 */
export function RegisterSearchField({
  value,
  onChange,
  onClear,
  label,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  label: string
  placeholder: string
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={cn("relative min-w-[132px] max-w-[280px] flex-1 sm:min-w-[196px] sm:flex-none", className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.35} aria-hidden="true" />
      <Input
        type="text"
        role="searchbox"
        dir="auto"
        value={value}
        aria-label={t(label)}
        placeholder={t(placeholder)}
        // 16px on touch keeps iOS from zooming the whole page on focus; the
        // toolbar's 12px only applies from the pointer breakpoint up.
        className={cn(registerControlClass, "w-full ps-8 pe-7 text-base md:text-[12px]")}
        onChange={(event) => onChange(event.target.value)}
      />
      <AnimatePresence initial={false}>
        {value ? (
          <motion.button
            key="clear"
            type="button"
            aria-label={t("Clear search")}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, transition: mdMotion.exit }}
            transition={shouldReduceMotion ? { duration: 0 } : mdMotion.micro}
            className="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] outline-none transition-colors duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
            onClick={onClear}
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/**
 * The background-revalidation mark. It is the same spiral that answers a page
 * load, shrunk to toolbar height: the rows stay on screen and the operator can
 * still see that fresher ones are on the way.
 */
export function RegisterRevalidatingMark({ active }: { active: boolean }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="revalidating"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: mdMotion.exit }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
          className="me-0.5 shrink-0"
        >
          <DotGridLoader size="sm" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * Refetch by hand. The glyph makes one half turn while a request is in flight,
 * which is enough to say "working" without a second spinner on the screen.
 */
export function RegisterRefreshButton({ pending, onRefresh }: { pending: boolean; onRefresh: () => void }) {
  const { t } = useLanguage()

  return (
    <button type="button" aria-label={t("Refresh records")} className={cn(registerButtonClass, "px-2")} onClick={onRefresh}>
      <RefreshCw className={cn("size-3.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", pending && "rotate-180")} strokeWidth={1.4} />
    </button>
  )
}

/**
 * The trailing group: filters, then search, then the refresh control. The
 * minimum width is what makes the group drop to its own line as one block once
 * the leading group has taken the space, rather than each control wrapping
 * independently around it.
 */
export function RegisterToolbarActions({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-[min(100%,480px)] flex-1 flex-wrap items-center justify-end gap-1.5">
      <RegisterRevalidatingMark active={pending} />
      {children}
    </div>
  )
}
