import {
  Bot,
  Calculator,
  Check,
  CircleDollarSign,
  Clock3,
  FileWarning,
  FilePlus2,
  Mail,
  MessageSquareText,
  ShieldCheck,
  Ship,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import type { StatusTone } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type AuditTimelineEvent = {
  id: string
  title: string
  detail: string
  date: string
  time?: string
  actor: string
  source: string
  state: "completed" | "current" | "upcoming"
  kind: "created" | "pricing" | "calculation" | "approval" | "booking" | "email" | "automation" | "exception" | "note"
  tone?: StatusTone
  statusLabel?: string
  contextLabel?: string
  contextRoute?: string
}

const eventIcons: Record<AuditTimelineEvent["kind"], LucideIcon> = {
  created: FilePlus2,
  pricing: CircleDollarSign,
  calculation: Calculator,
  approval: ShieldCheck,
  booking: Ship,
  email: Mail,
  automation: Bot,
  exception: FileWarning,
  note: MessageSquareText,
}

const timelineReveal = {
  hidden: {},
  show: { transition: { staggerChildren: 0.075, delayChildren: 0.06 } },
}

const eventReveal = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

export function AuditTimeline({
  events,
  title = "Audit and workflow",
  description = "A clear operational history of changes, decisions, and next actions.",
  className,
  loading = false,
  error,
  emptyMessage = "No activity has been recorded yet.",
  onRetry,
  onContextSelect,
  groupConsecutiveDates = false,
  showCompletedCheck = true,
  compact = false,
}: {
  events: readonly AuditTimelineEvent[]
  title?: string
  description?: string
  className?: string
  loading?: boolean
  error?: string
  emptyMessage?: string
  onRetry?: () => void
  onContextSelect?: (event: AuditTimelineEvent) => void
  groupConsecutiveDates?: boolean
  showCompletedCheck?: boolean
  compact?: boolean
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <Surface padding="none" className={cn("overflow-hidden rounded-[var(--md-radius-xl)]", className)}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader title={title} meta={description} />
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 self-start rounded-[var(--md-radius-md)] bg-[var(--md-accent-a09)] px-2.5 text-[10.5px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
          <Clock3 className="size-3" strokeWidth={1.4} />
          {events.length} {t("events")}
        </span>
      </div>

      {loading ? (
        <div role="status" aria-label={t("Loading activity")} className="space-y-3 px-5 pb-5">
          {[0, 1, 2].map((item) => (
            <div key={item} className={cn("grid min-h-[82px] grid-cols-[70px_32px_minmax(0,1fr)] gap-2 sm:grid-cols-[104px_36px_minmax(0,1fr)] sm:gap-3", !shouldReduceMotion && "animate-pulse")}>
              <span className="mt-4 h-3 rounded bg-[var(--md-line)]" />
              <span className="mx-auto mt-3 size-7 rounded-full bg-[var(--md-line)]" />
              <span className="my-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]" />
            </div>
          ))}
          <span className="sr-only">{t("Loading activity")}</span>
        </div>
      ) : error ? (
        <div role="alert" className="mx-5 mb-5 rounded-[var(--md-radius-lg)] bg-[rgba(187,59,59,0.07)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(187,59,59,0.14)]">
          <p className="text-[13px] font-medium text-[var(--md-red)]">{t("Unable to load activity")}</p>
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--md-text)]">{t(error)}</p>
          {onRetry ? <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>{t("Try again")}</Button> : null}
        </div>
      ) : events.length === 0 ? (
        <div role="status" className="mx-5 mb-5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 py-6 text-center">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(emptyMessage)}</p>
        </div>
      ) : (
        <motion.div
          role="list"
          aria-label={t(title)}
          className="px-4 pb-5 sm:px-5"
          variants={shouldReduceMotion ? undefined : timelineReveal}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "show"}
        >
          {events.map((event, index) => {
          const Icon = eventIcons[event.kind]
          const isLast = index === events.length - 1
          const isCompleted = event.state === "completed"
          const isCurrent = event.state === "current"
          const hasCalendarDate = /^\d/.test(event.date)
          const dateIsGrouped = groupConsecutiveDates && index > 0 && events[index - 1]?.date === event.date
          const nodeTone = event.tone ? toneToVar(event.tone) : undefined

          return (
            <motion.div
              key={event.id}
              role="listitem"
              className={cn(
                "grid grid-cols-[70px_32px_minmax(0,1fr)] gap-2 sm:grid-cols-[104px_36px_minmax(0,1fr)] sm:gap-3",
                compact ? "min-h-[74px]" : "min-h-[92px]",
              )}
              variants={shouldReduceMotion ? undefined : eventReveal}
            >
              <div className="pt-3 text-end">
                {dateIsGrouped ? <span className="sr-only">{hasCalendarDate ? event.date : t(event.date)}</span> : (
                  <p data-i18n-skip={hasCalendarDate || undefined} dir={hasCalendarDate ? "ltr" : undefined} className={cn("text-[11px] font-medium leading-4", isCurrent ? "text-[var(--md-ink)]" : "text-[var(--md-text)]")}>{hasCalendarDate ? event.date : t(event.date)}</p>
                )}
                {event.time ? <p data-i18n-skip dir="ltr" className="mt-0.5 text-[10px] text-[var(--md-subtle)]">{event.time}</p> : null}
              </div>

              <div className="relative flex justify-center pt-2.5" aria-hidden="true">
                {!isLast ? (
                  <motion.span
                    className={cn(
                      "absolute start-1/2 top-[34px] bottom-[-2px] w-px -translate-x-1/2 origin-top",
                      isCompleted && !event.tone ? "bg-[var(--md-accent)]" : "bg-[var(--md-line-strong)]",
                    )}
                    initial={shouldReduceMotion ? undefined : { scaleY: 0 }}
                    animate={shouldReduceMotion ? undefined : { scaleY: 1 }}
                    transition={{ duration: 0.38, delay: 0.12 + index * 0.075, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                {isCurrent && !shouldReduceMotion ? (
                  <motion.span
                    className="absolute top-2.5 size-7 rounded-full bg-[rgba(221,138,43,0.16)]"
                    animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
                    transition={{ duration: 2, repeat: Infinity, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                <span className={cn(
                  "relative z-10 grid size-7 place-items-center rounded-full shadow-[var(--md-shadow-line)]",
                  isCompleted && !event.tone && "bg-[var(--md-accent)] text-[var(--md-accent-ink)]",
                  isCurrent && "bg-[var(--md-amber)] text-white",
                  event.state === "upcoming" && "bg-[var(--md-surface)] text-[var(--md-subtle)]",
                  event.tone && "text-white",
                )} style={nodeTone ? { background: nodeTone } : undefined}>
                  {isCompleted && showCompletedCheck ? <Check className="size-3.5" strokeWidth={2} /> : <Icon className="size-3.5" strokeWidth={1.4} />}
                </span>
              </div>

              <div className={cn(
                "my-1 min-w-0 rounded-[var(--md-radius-lg)] px-3 py-2.5 transition-colors duration-200",
                isCurrent ? "bg-[rgba(221,138,43,0.08)] shadow-[inset_0_0_0_1px_rgba(221,138,43,0.16)]" : "hover:bg-[var(--md-hover)]",
                event.state === "upcoming" && "opacity-70",
              )}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium leading-5 text-[var(--md-ink)]">{t(event.title)}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {event.contextLabel ? (
                      onContextSelect ? (
                        <button
                          type="button"
                          className="rounded-[var(--md-radius-sm)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a16)]"
                          aria-label={`${t("Open CRM context")}: ${event.contextLabel}`}
                          onClick={() => onContextSelect(event)}
                        >
                          <span data-i18n-skip dir="auto"><StatusPill tone="neutral" className="h-5 px-2 text-[10px] hover:bg-[var(--md-hover)]">{event.contextLabel}</StatusPill></span>
                        </button>
                      ) : <span data-i18n-skip dir="auto"><StatusPill tone="neutral" className="h-5 px-2 text-[10px]">{event.contextLabel}</StatusPill></span>
                    ) : null}
                    <StatusPill tone={event.tone ?? (isCompleted ? "teal" : isCurrent ? "amber" : "neutral")} className="h-5 px-2 text-[10px]">
                      {t(event.statusLabel ?? (isCompleted ? "Completed" : isCurrent ? "In review" : "Upcoming"))}
                    </StatusPill>
                  </div>
                </div>
                {!compact ? <p className="mt-1 text-[11.5px] leading-5 text-[var(--md-text)]">{t(event.detail)}</p> : null}
                <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--md-subtle)]", compact ? "mt-1" : "mt-2")}>
                  <span className="font-medium text-[var(--md-text)]">{t(event.actor)}</span>
                  <span aria-hidden="true" className="size-1 rounded-full bg-[var(--md-line-strong)]" />
                  <span>{t(event.source)}</span>
                </div>
              </div>
            </motion.div>
          )
          })}
        </motion.div>
      )}
    </Surface>
  )
}
