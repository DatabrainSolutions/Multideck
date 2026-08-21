import { useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Surface } from "@/components/multideck/surface"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type CustomsReadinessReviewIssue = {
  key: string
  label: string
  section?: string
  itemNumber?: number
}

export function CustomsReadinessReview({
  completeChecks,
  emptyDescription,
  emptyTitle,
  headline,
  issues,
  onBack,
  percent,
  renderFix,
  t = (value) => value,
  title = "Declaration readiness",
  totalChecks,
  children,
}: {
  completeChecks: number
  emptyDescription: string
  emptyTitle: string
  headline?: string
  issues: CustomsReadinessReviewIssue[]
  onBack?: () => void
  percent: number
  renderFix: (issue: CustomsReadinessReviewIssue, close: () => void) => ReactNode
  t?: (value: string) => string
  title?: string
  totalChecks: number
  children?: ReactNode
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [openFixKey, setOpenFixKey] = useState<string | null>(null)

  function openFix(key: string) {
    setOpenFixKey(key)
    window.setTimeout(() => {
      document.getElementById(`customs-readiness-fix-${key}`)?.querySelector<HTMLElement>("input, textarea, select, button")?.focus()
    }, 80)
  }

  return (
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
      {onBack ? (
        <Button type="button" variant="ghost" className="-ms-2 mb-4 h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)]" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" className="size-3.5 rtl:rotate-180" strokeWidth={1.5} />
          {t("Back to Customs source data")}
        </Button>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <span>
          <p className="text-[12px] font-medium text-[var(--md-accent)]">{t(title)}</p>
          <h2 className="mt-1 text-[22px] font-medium text-[var(--md-ink)]">{headline ? t(headline) : <>{percent}% {t("complete")}</>}</h2>
          {headline ? <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{percent}% {t("complete")}</p> : null}
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{completeChecks}/{totalChecks} {t("readiness checks passed")}</p>
        </span>
        <div
          aria-label={t("Customs readiness")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="relative grid size-24 shrink-0 place-items-center rounded-full"
          role="progressbar"
          style={{ background: `conic-gradient(var(--md-accent) ${percent}%, var(--md-line) 0)` }}
        >
          <div className="grid size-[78px] place-items-center rounded-full bg-[var(--md-surface)] text-[17px] font-medium">{percent}%</div>
        </div>
      </div>

      {issues.length ? (
        <div className="mt-5 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
          {issues.slice(0, 20).map((issue) => {
            const expanded = openFixKey === issue.key
            return (
              <div key={issue.key} className="py-2">
                <div className="flex min-h-11 items-center gap-3">
                  <CircleAlert className="size-4 shrink-0 text-[var(--md-red)]" />
                  <span className="min-w-0 flex-1 text-[12px] text-[var(--md-text)]">
                    {issue.itemNumber ? `${t("Item")} ${issue.itemNumber}: ` : ""}{t(issue.label)}
                    {issue.section ? <span className="ms-2 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--md-subtle)]">{t(issue.section)}</span> : null}
                  </span>
                  <Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls={`customs-readiness-fix-${issue.key}`} className="min-w-[64px] rounded-[var(--md-radius-md)]" onClick={() => expanded ? setOpenFixKey(null) : openFix(issue.key)}>
                    {t("Fix")}<ChevronDown className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} />
                  </Button>
                </div>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div id={`customs-readiness-fix-${issue.key}`} initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduceMotion(shouldReduceMotion, mdMotion.panel)} className="overflow-hidden">
                      <div className="ms-7 mt-1 pt-3">
                        {renderFix(issue, () => setOpenFixKey(null))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 flex gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-4">
          <CheckCircle2 className="size-5 shrink-0 text-[var(--md-green)]" />
          <span className="text-[13px] text-[var(--md-text)]"><strong className="block text-[var(--md-ink)]">{t(emptyTitle)}</strong>{t(emptyDescription)}</span>
        </div>
      )}
      {children}
    </Surface>
  )
}
