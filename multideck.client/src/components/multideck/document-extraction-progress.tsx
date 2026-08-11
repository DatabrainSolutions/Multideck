import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, FileText, LoaderCircle, X } from "@/components/icons/hugeicons"
import { motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { completedStageIds, extractionProgressPercent, type ExtractionStage } from "@/lib/document-extraction-progress"
import { cn } from "@/lib/utils"

const tickIntervalMs = 120

/**
 * The waiting state for document work that runs in stages: the operator's own page under a
 * reading sweep, a bar that keeps moving while a slow stage runs, and a stage list that
 * shows what has already finished. Only the real work completes the bar.
 */
export function DocumentExtractionProgress({
  title,
  detail,
  fileName,
  stages,
  activeStageId,
  done,
  previewUrl,
  pageCount,
  footnote,
  onCancel,
  className,
}: {
  title: string
  detail?: string
  fileName?: string
  stages: ExtractionStage[]
  activeStageId: string | null
  done?: boolean
  previewUrl?: string
  pageCount?: number
  footnote?: ReactNode
  onCancel?: () => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stageElapsedMs, setStageElapsedMs] = useState(0)
  const startedAt = useRef(0)
  const stageStartedAt = useRef(0)

  useEffect(() => {
    stageStartedAt.current = performance.now()
    if (!startedAt.current) startedAt.current = stageStartedAt.current
    setStageElapsedMs(0)
  }, [activeStageId])

  useEffect(() => {
    if (done) return
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt.current)
      setStageElapsedMs(performance.now() - stageStartedAt.current)
    }, tickIntervalMs)
    return () => window.clearInterval(timer)
  }, [done])

  const percent = extractionProgressPercent({ stages, activeStageId, elapsedMs: stageElapsedMs, done })
  const finished = new Set(completedStageIds(stages, activeStageId, done))
  const activeStage = stages.find((stage) => stage.id === activeStageId)
  const seconds = Math.floor(elapsedMs / 1000)

  return <Surface padding="none" className={cn("overflow-hidden rounded-[var(--md-radius-xl)]", className)} aria-busy="true">
    <div className="grid gap-px bg-[var(--md-line)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      <div className="flex items-center justify-center bg-[var(--md-surface-soft)] p-5 lg:p-6">
        <span className="relative block w-full max-w-[300px] overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
          <span className="block aspect-[1/1.414] w-full">
            {previewUrl
              ? <img src={previewUrl} alt="" className="size-full object-cover object-top" />
              : <span className="grid size-full place-items-center text-[var(--md-muted)]"><FileText className="size-8" /></span>}
          </span>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[var(--md-accent-a04)]" />
          {shouldReduceMotion ? null : <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.span
              className="absolute inset-x-0 block h-[30%] bg-[linear-gradient(to_bottom,transparent,var(--md-accent-a10)_55%,var(--md-accent-a28))]"
              initial={{ top: "-30%" }}
              animate={{ top: ["-30%", "100%"] }}
              transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            />
          </span>}
        </span>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-4 bg-[var(--md-surface)] p-5 lg:p-6">
        <div className="min-w-0">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-medium tracking-[-0.015em]">{title}</h2>
            <strong className="text-[15px] font-medium tabular-nums text-[var(--md-accent)]">{Math.floor(percent)}%</strong>
          </span>
          {fileName ? <p className="mt-1 truncate text-[11px] text-[var(--md-subtle)]" dir="auto">{fileName}{pageCount ? ` · ${pageCount} ${t(pageCount === 1 ? "page" : "pages")}` : ""}</p> : null}
          {detail ? <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{detail}</p> : null}
        </div>

        <div>
          <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--md-surface-tint)]">
            <span
              className="block h-full rounded-full bg-[var(--md-accent)] transition-[width] duration-200 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </span>
          <p className="mt-2 text-[11px] text-[var(--md-text)]" role="status" aria-live="polite">
            {activeStage?.label ?? title}
            <span className="ms-2 text-[10px] tabular-nums text-[var(--md-muted)]">{seconds} {t("seconds")}</span>
          </p>
        </div>

        <ol className="space-y-1.5">
          {stages.map((stage) => {
            const complete = finished.has(stage.id)
            const active = stage.id === activeStageId && !done
            return <li key={stage.id} className="flex items-start gap-2.5">
              <span className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                complete ? "bg-[var(--md-accent)] text-white" : active ? "text-[var(--md-accent)]" : "text-[var(--md-muted)]",
              )}>
                {complete
                  ? <Check className="size-2.5" strokeWidth={3} />
                  : active
                    ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                    : <span className="block size-2 rounded-full shadow-[inset_0_0_0_1px_currentColor]" />}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[11.5px]", active ? "font-medium text-[var(--md-ink)]" : complete ? "text-[var(--md-text)]" : "text-[var(--md-subtle)]")}>{stage.label}</span>
                {stage.detail && (active || complete) ? <span className="mt-0.5 block text-[10px] leading-4 text-[var(--md-subtle)]">{stage.detail}</span> : null}
              </span>
            </li>
          })}
        </ol>

        {footnote || onCancel ? <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="min-w-0 text-[10px] leading-4 text-[var(--md-subtle)]">{footnote}</span>
          {onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X className="size-3.5" />{t("Cancel")}</Button> : null}
        </div> : null}
      </div>
    </div>
  </Surface>
}
