import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { AlertCircle, Check, ChevronDown, Search } from "@/components/icons/hugeicons"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.png"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import type { DexterActivity, DexterActivityProvider } from "../../../../shared/dexter-activity"

const providers = {
  gmail: { label: "Gmail", logo: gmailLogo },
  outlook: { label: "Outlook", logo: outlookLogo },
}

function ActivityIcons({ sources }: { sources: DexterActivityProvider[] }) {
  return <span className="inline-flex shrink-0 items-center gap-1.5" aria-hidden="true">
    {sources.length ? sources.map(source => <img key={source} src={providers[source].logo} alt="" className="size-4 object-contain" />)
      : <Search className="size-4 text-[var(--md-subtle)]" strokeWidth={1.5} />}
  </span>
}

export function DexterActivityTrail({ content, activities = [], isStreaming, answerStarted = false, open, onOpenChange, onCollapsed }: {
  content: string
  activities?: DexterActivity[]
  isStreaming: boolean
  answerStarted?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onCollapsed?: () => void
}) {
  const { t } = useLanguage()
  const reduce = Boolean(useReducedMotion())
  const [warningId, setWarningId] = useState<string | null>(null)
  const hasDetails = Boolean(content.trim() || activities.length)
  const active = [...activities].reverse().find(item => item.status === "running")
  const usedProviders = [...new Set(activities.filter(item => item.status === "completed").flatMap(item => item.providers))]
  // Answer streaming is already visible in the answer itself. Only show a
  // busy trail while waiting for text or while a real tool is still running.
  const isWorking = isStreaming && (!answerStarted || Boolean(active))
  const label = isWorking
    ? active?.label ?? (activities.length ? "Reviewing findings" : "Thinking")
    : usedProviders.length ? `Used ${usedProviders.map(source => providers[source].label).join(" and ")}`
    : activities.length ? "Activity summary" : "Reasoning summary"
  const sources = isWorking ? active?.providers ?? [] : usedProviders
  if (!hasDetails && (!isStreaming || answerStarted)) return null

  return <div className="max-w-[680px]" data-dexter-activity-trail>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t(label)}</span>
    <Reasoning open={open && hasDetails} onOpenChange={onOpenChange} isStreaming={isWorking} className="mb-0 py-1"
      data-reasoning-state={isWorking ? "streaming" : "complete"}>
      <ReasoningTrigger disabled={!hasDetails}
        className="min-h-9 min-w-0 gap-2.5 rounded-sm text-start text-[13px] font-normal text-[var(--md-text)] hover:text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--md-accent)] disabled:cursor-default">
        {sources.length ? <ActivityIcons sources={sources} /> : null}
        <Shimmer className="min-w-0 break-words" disabled={!isWorking}>{t(label)}</Shimmer>
        {hasDetails ? <ChevronDown className={cn("size-3.5 shrink-0 text-[var(--md-subtle)] transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" /> : null}
      </ReasoningTrigger>
      <motion.div initial={false}
        animate={{ height: open && hasDetails ? "auto" : 0, opacity: open && hasDetails ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => { if (!open) onCollapsed?.() }}
        className="overflow-hidden" aria-hidden={!open} inert={!open || undefined} data-dexter-reasoning-panel>
        {activities.length ? <ol className="space-y-2.5 py-3" aria-label={t("Activity trail")}>
          {activities.map(item => {
            const interrupted = item.status === "running" && !isStreaming
            return <li key={item.id} className="flex min-w-0 items-start gap-2.5 text-[13px] leading-5 text-[var(--md-text)]" data-activity-status={interrupted ? "interrupted" : item.status}>
              <span className="pt-0.5"><ActivityIcons sources={item.providers} /></span>
              <span className="min-w-0 flex-1 break-words">
                {t(item.label)}{interrupted ? <span className="text-[var(--md-subtle)]"> · {t("Not completed")}</span> : null}
                {item.providers.length && !item.providers.some(source => item.label.includes(providers[source].label))
                  ? <span className="ms-1.5 text-[var(--md-subtle)]">· {item.providers.map(source => providers[source].label).join(" and ")}</span> : null}
              </span>
              {item.status === "completed" ? <Check className="mt-1 size-3.5 shrink-0 text-[var(--md-subtle)]" aria-label={t("Completed")} /> : null}
              {item.status === "failed" || interrupted ? <Tooltip open={warningId === item.id}
                onOpenChange={next => setWarningId(current => next ? item.id : current === item.id ? null : current)}>
                <TooltipTrigger asChild>
                  <button type="button" className="-my-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--md-amber)] outline-none hover:bg-[var(--md-surface-soft)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent)]"
                    aria-label={`${t(interrupted ? "Why this step was not completed" : "Why this step failed")}: ${t(item.label)}`}
                    onClick={event => { event.preventDefault(); setWarningId(current => current === item.id ? null : item.id) }}>
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" sideOffset={6} className="max-w-[min(280px,calc(100vw-32px))] text-start text-[12px] leading-5">
                  {t(interrupted
                    ? "The request ended before this step finished. Ask Dexter to check this part again."
                    : item.detail || "This step could not be completed. The exact reason was not saved with this older response. Ask Dexter to check this part again.")}
                </TooltipContent>
              </Tooltip> : null}
            </li>
          })}
        </ol> : null}
        {content.trim() ? <ReasoningContent forceMount className="mt-0 pt-2 pb-4 text-[13px] leading-5 text-[var(--md-text)] data-[state=closed]:animate-none data-[state=open]:animate-none">
          {content}
        </ReasoningContent> : null}
      </motion.div>
    </Reasoning>
  </div>
}
