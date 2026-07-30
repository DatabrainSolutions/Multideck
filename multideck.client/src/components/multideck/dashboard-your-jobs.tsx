import { memo, useMemo, type CSSProperties } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, Clock3, Star } from "lucide-react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { currentOperator, operatorJobs, type StatusTone } from "@/data/multideck-data"
import { useMinuteTick } from "@/lib/clock"
import { ProgressRing, SegmentedArc, type ArcSegment } from "./dashboard-radials"
import { Surface } from "./surface"
import { StatusPill, toneToVar } from "./status-pill"

export type OperatorJobCard = (typeof operatorJobs)[number]

/** The ring fills over the last eight hours before a job is due. */
const dueRingWindowMinutes = 480

/** Minutes between now and a local `HH:mm` due time, negative once it is past. */
function getMinutesUntil(due: string, now: Date) {
  const [hours = "0", minutes = "0"] = due.split(":")
  const target = new Date(now)
  target.setHours(Number(hours), Number(minutes), 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 60_000)
}

function formatCountdown(minutes: number) {
  const absolute = Math.abs(minutes)
  const hours = Math.floor(absolute / 60)
  const remainder = absolute % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

/**
 * One job per row rather than per card. The card rail only ever showed three or
 * four of five jobs and spent most of its area on padding; a row shows the same
 * fields, all of them at once, with room left for the route and the customer.
 */
const JobRow = memo(function JobRow({
  job,
  index,
  isFavourite,
  minutesUntil,
  onToggleFavourite,
  onOpen,
}: {
  job: OperatorJobCard
  index: number
  isFavourite: boolean
  minutesUntil: number
  onToggleFavourite: (bookingId: string) => void
  onOpen?: (job: OperatorJobCard) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const overdue = minutesUntil < 0
  const imminent = !overdue && minutesUntil <= 90
  const accent = toneToVar(job.tone)

  return (
    <motion.div
      className="md-job-row"
      data-urgency={overdue ? "overdue" : imminent ? "soon" : undefined}
      style={{ ["--md-job-accent" as string]: accent } as CSSProperties}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.03) }}
    >
      <button type="button" className="md-job-row-open" onClick={() => onOpen?.(job)}>
        {/* Time-to-due as a ring: the shape carries the urgency, so the clock
            reading beside it only has to confirm it. */}
        <ProgressRing
          ratio={overdue ? 1 : 1 - Math.min(minutesUntil / dueRingWindowMinutes, 1)}
          size={22}
          thickness={2.4}
          color={accent}
          className="md-job-row-ring"
        >
          <span className="md-job-row-ring-dot" style={{ background: accent }} />
        </ProgressRing>

        <span className="md-job-row-ident">
          <span className="md-job-row-ref" dir="ltr" data-i18n-skip>
            {job.bookingId}
          </span>
          <span className="md-job-row-route" dir="ltr">
            {job.route}
          </span>
        </span>

        <span className="md-job-row-task-cell">
          <span className="md-job-row-task">{job.task}</span>
          <span className="md-job-row-customer">{job.customer}</span>
        </span>

        <span className={cn("md-job-row-due", overdue && "md-job-row-due-overdue", imminent && "md-job-row-due-soon")}>
          <Clock3 className="size-3 shrink-0" strokeWidth={1.4} />
          <span dir="ltr">{job.due}</span>
          <span className="md-job-row-countdown">
            {overdue ? `${formatCountdown(minutesUntil)} ${t("over")}` : `${t("in")} ${formatCountdown(minutesUntil)}`}
          </span>
        </span>

        <StatusPill tone={job.tone} className="md-job-row-status">
          {job.status}
        </StatusPill>

        <ArrowRight className="md-job-row-arrow" strokeWidth={1.3} aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label={`${isFavourite ? t("Remove") : t("Add")} ${job.bookingId} ${t("favourite")}`}
        aria-pressed={isFavourite}
        className={cn("md-job-row-star", isFavourite && "md-job-row-star-on")}
        onClick={() => onToggleFavourite(job.bookingId)}
      >
        <motion.span
          className="grid place-items-center"
          animate={shouldReduceMotion ? undefined : { scale: isFavourite ? [1, 1.32, 1] : 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Star className={cn("size-3.5", isFavourite && "fill-current")} strokeWidth={1.4} />
        </motion.span>
      </button>
    </motion.div>
  )
})

export function YourJobsPanel({
  favouriteIds,
  onToggleFavourite,
  onOpenJob,
  className,
}: {
  favouriteIds: Set<string>
  onToggleFavourite: (bookingId: string) => void
  onOpenJob?: (job: OperatorJobCard) => void
  className?: string
}) {
  const { t } = useLanguage()
  const now = useMinuteTick()

  /**
   * Ordered by due time and nothing else. Starring deliberately does not re-sort
   * the list: a row jumping out from under the cursor the moment it is starred is
   * disorienting, and the star is a marker rather than a sort key.
   */
  const jobs = useMemo(
    () =>
      [...operatorJobs]
        .map((job) => ({ job, minutesUntil: getMinutesUntil(job.due, now) }))
        .sort((left, right) => left.minutesUntil - right.minutesUntil),
    [now],
  )

  /** The job mix used to be its own card; it belongs in this panel's header. */
  const segments = useMemo<ArcSegment[]>(() => {
    const counts = { blocked: 0, due: 0, ready: 0 }
    jobs.forEach(({ job }) => {
      if (job.tone === "red") counts.blocked += 1
      else if (job.tone === "amber") counts.due += 1
      else counts.ready += 1
    })

    return [
      { label: t("Blocked"), value: counts.blocked, tone: "red" as StatusTone },
      { label: t("Due soon"), value: counts.due, tone: "amber" as StatusTone },
      { label: t("Ready"), value: counts.ready, tone: "teal" as StatusTone },
    ]
  }, [jobs, t])

  const overdue = jobs.filter((entry) => entry.minutesUntil < 0).length

  return (
    <Surface padding="none" className={cn("md-jobs-panel", className)}>
      <div className="md-jobs-panel-head">
        <div className="min-w-0">
          <h2 className="md-panel-title">{t("Your jobs")}</h2>
          <p className="md-panel-meta">
            {jobs.length} {t("open")}
            {overdue ? ` · ${overdue} ${t("past due")}` : ""} · {currentOperator.name}
          </p>
        </div>
        <div className="md-jobs-mix">
          <SegmentedArc segments={segments} size={38} thickness={5} gap={0.02} />
          <ul className="md-jobs-mix-legend">
            {segments.map((segment) => (
              <li key={segment.label}>
                <span className="md-jobs-mix-swatch" style={{ background: toneToVar(segment.tone) }} />
                <span className="md-jobs-mix-value" dir="ltr">
                  {segment.value}
                </span>
                <span className="md-jobs-mix-label">{segment.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="md-jobs-panel-body md-scrollbar">
        {jobs.map(({ job, minutesUntil }, index) => (
          <JobRow
            key={job.id}
            job={job}
            index={index}
            minutesUntil={minutesUntil}
            isFavourite={favouriteIds.has(job.bookingId)}
            onToggleFavourite={onToggleFavourite}
            onOpen={onOpenJob}
          />
        ))}
      </div>
    </Surface>
  )
}
