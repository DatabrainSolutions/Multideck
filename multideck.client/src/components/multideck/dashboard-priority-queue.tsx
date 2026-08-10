import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { ArrowRight, Check, ReceiptText, RotateCcw, TriangleAlert } from "@/components/icons/hugeicons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import { useMinuteTick } from "@/lib/clock"
import {
  dashboardPriorityBucket,
  type DashboardPriorityBucket,
  type DashboardPriorityItem,
} from "@/lib/dashboard-live-data"
import { Surface } from "./surface"
import { StatusPill } from "./status-pill"
import { SegmentedControl } from "./workflow-components"
import { DexterActionPill } from "./dexter-action-pill"

/** How long the strike reads before the row collapses out of the queue. */
const strikeHoldMs = 340

const bucketOrder: DashboardPriorityBucket[] = ["overdue", "soon", "today", "later"]

const bucketLabel: Record<DashboardPriorityBucket, string> = {
  overdue: "Overdue",
  soon: "Next two hours",
  today: "Later today",
  later: "This week",
}

const scopes = ["mine", "all"] as const
type QueueScope = (typeof scopes)[number]

function formatGap(minutes: number) {
  const absolute = Math.abs(minutes)
  if (absolute < 60) return `${absolute}m`
  const hours = Math.floor(absolute / 60)
  const remainder = absolute % 60
  if (hours < 24) return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
  return `${Math.round(hours / 24)}d`
}

/**
 * One piece of work. The urgency rule on the leading edge is the panel's whole
 * visual language for priority — an earlier draft gave every row its own
 * countdown ring, which meant five small gauges competing before a single word
 * had been read.
 */
const QueueRow = memo(function QueueRow({
  item,
  now,
  striking,
  onComplete,
  onHandOver,
  onOpen,
}: {
  item: DashboardPriorityItem
  now: number
  striking: boolean
  onComplete: () => void
  onHandOver?: () => void
  onOpen: () => void
}) {
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const minutes = Math.round((item.dueAt - now) / 60_000)
  const overdue = minutes < 0
  const Icon = item.kind === "exception" ? TriangleAlert : ReceiptText

  // Every deadline says what kind of deadline it is, so "14:20" is never
  // mistaken for a promise the data cannot make.
  const dueLabel =
    item.dueKind === "departure"
      ? `${t("Departs")} ${new Date(item.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : item.dueKind === "cutoff"
        ? t("By today's cutoff")
        : new Date(item.dueAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })

  return (
    <div className="md-queue-row" data-tone={item.tone} data-overdue={overdue ? "true" : undefined}>
      <span className="md-queue-row-rule" aria-hidden="true" />

      <button type="button" className="md-queue-row-open" onClick={onOpen}>
        <span className="md-queue-row-glyph" aria-hidden="true">
          <Icon className="size-[13px]" strokeWidth={1.4} />
        </span>

        <span className="md-queue-row-body">
          <span className="md-queue-row-line">
            <span className="md-queue-row-task-wrap">
              <span className="md-queue-row-task">{item.task}</span>
              {/* The rule wipes across the task before the row leaves, so
                  clearing an item reads as one gesture rather than a
                  disappearance. */}
              <motion.span
                aria-hidden="true"
                className="md-queue-row-strike"
                style={{ transformOrigin: direction === "rtl" ? "right" : "left" }}
                initial={false}
                animate={{ scaleX: striking ? 1 : 0 }}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
              />
            </span>
            <span className="md-queue-row-ref" dir="ltr" data-i18n-skip>
              {item.reference}
            </span>
          </span>
          <span className="md-queue-row-context">
            <span className="md-queue-row-customer">{item.customer}</span>
            <span className="md-queue-row-lane" dir="ltr">
              {item.context}
            </span>
          </span>
        </span>

        <span className="md-queue-row-due">
          <span className="md-queue-row-due-value" dir="ltr">
            {dueLabel}
          </span>
          <span className="md-queue-row-due-gap">
            {overdue ? `${formatGap(minutes)} ${t("over")}` : `${t("in")} ${formatGap(minutes)}`}
          </span>
        </span>

        <StatusPill tone={item.tone} className="md-queue-row-status">
          {item.status}
        </StatusPill>
      </button>

      <span className="md-queue-row-actions">
        {onHandOver ? (
          <Tooltip delayDuration={1_000}>
            <TooltipTrigger asChild>
              <DexterActionPill
                iconOnly
                label={t("Hand over to Dexter")}
                className="md-queue-row-button-dexter !size-6 !min-w-6 !rounded-[var(--md-radius-md)] !p-0"
                iconClassName="!size-3"
                onClick={onHandOver}
              />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {t("Ask Dexter")}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <button
          type="button"
          aria-label={`${t("Clear from queue")}: ${item.task} ${item.reference}`}
          className="md-queue-row-button md-queue-row-button-done"
          onClick={onComplete}
        >
          <Check className="size-3.5" strokeWidth={1.7} />
        </button>
        <button
          type="button"
          aria-label={`${t("Open")} ${item.reference}`}
          className="md-queue-row-button"
          onClick={onOpen}
        >
          <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} />
        </button>
      </span>
    </div>
  )
})

/**
 * The dashboard's lead panel: everything waiting on the operator, from any
 * register, ranked by the deadline that actually applies to it and grouped by
 * how much time is left. It replaces the three overlapping lists the screen
 * used to open with.
 */
export function DashboardPriorityQueue({
  items,
  operatorName,
  onOpenItem,
  onHandOverToDexter,
  className,
}: {
  items: DashboardPriorityItem[]
  operatorName: string
  onOpenItem?: (item: DashboardPriorityItem) => void
  onHandOverToDexter?: (item: DashboardPriorityItem) => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const now = useMinuteTick()
  const [scope, setScope] = useState<QueueScope>("all")
  const [striking, setStriking] = useState<string[]>([])
  const [cleared, setCleared] = useState<string[]>([])
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    setStriking([])
    setCleared([])
  }, [items])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const restore = useCallback((id: string) => {
    setCleared((current) => current.filter((entry) => entry !== id))
    setStriking((current) => current.filter((entry) => entry !== id))
  }, [])

  const complete = useCallback(
    (item: DashboardPriorityItem) => {
      setStriking((current) => (current.includes(item.id) ? current : [...current, item.id]))
      const timer = window.setTimeout(
        () => {
          setCleared((current) => (current.includes(item.id) ? current : [...current, item.id]))
          setStriking((current) => current.filter((entry) => entry !== item.id))
          toast.success(t("Cleared from your queue"), {
            description: `${item.task} · ${item.reference}`,
            action: { label: t("Undo"), onClick: () => restore(item.id) },
          })
        },
        shouldReduceMotion ? 0 : strikeHoldMs,
      )
      timersRef.current.push(timer)
    },
    [restore, shouldReduceMotion, t],
  )

  const mineCount = useMemo(
    () => items.filter((item) => operatorName && item.owner === operatorName).length,
    [items, operatorName],
  )

  const visible = useMemo(() => {
    const scoped = scope === "mine" && operatorName ? items.filter((item) => item.owner === operatorName) : items
    return scoped.filter((item) => !cleared.includes(item.id))
  }, [cleared, items, operatorName, scope])

  const groups = useMemo(() => {
    const nowMs = now.getTime()
    return bucketOrder
      .map((bucket) => ({
        bucket,
        items: visible.filter((item) => dashboardPriorityBucket(item.dueAt, nowMs) === bucket),
      }))
      .filter((group) => group.items.length > 0)
  }, [now, visible])

  const overdue = groups.find((group) => group.bucket === "overdue")?.items.length ?? 0

  // Row index across the whole panel, so the stagger reads as one list settling
  // rather than each group starting its own cadence.
  let rowIndex = -1

  return (
    <Surface padding="none" className={cn("md-queue-panel", className)}>
      <div className="md-queue-panel-head">
        <div className="min-w-0 flex-1">
          <h2 className="md-panel-title">{t("Needs you now")}</h2>
          <p className="md-panel-meta">
            {visible.length} {t("open")}
            {overdue ? ` · ${overdue} ${t("overdue")}` : ""}
            {cleared.length ? ` · ${cleared.length} ${t("cleared")}` : ""}
          </p>
        </div>

        <div className="md-queue-panel-controls">
          {cleared.length ? (
            <button type="button" className="md-queue-panel-reset" onClick={() => setCleared([])}>
              <RotateCcw className="size-3" strokeWidth={1.5} />
              {t("Restore")}
            </button>
          ) : null}
          {operatorName ? (
            <SegmentedControl
              options={scopes}
              value={scope}
              onChange={setScope}
              ariaLabel={t("Queue owner")}
              renderOption={(option) => (option === "mine" ? `${t("Mine")} ${mineCount}` : `${t("All")} ${items.length}`)}
              className="[&_button]:h-7 [&_button]:px-2.5 [&_button]:text-[12px]"
            />
          ) : null}
        </div>
      </div>

      <div className="md-queue-panel-body md-scrollbar">
        <AnimatePresence mode="popLayout" initial={false}>
          {groups.map((group) => (
            <motion.div
              key={group.bucket}
              layout="position"
              className="md-queue-group"
              data-bucket={group.bucket}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            >
              <p className="md-queue-group-label">
                <span>{t(bucketLabel[group.bucket])}</span>
                <span className="md-queue-group-count" dir="ltr">
                  {group.items.length}
                </span>
              </p>

              {group.items.map((item) => {
                rowIndex += 1
                return (
                  <motion.div
                    key={item.id}
                    layout="position"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 12, scale: 0.99 }}
                    transition={{
                      ...(shouldReduceMotion
                        ? { duration: 0 }
                        : { ...mdMotion.enter, delay: staggerRamp(rowIndex, 0.03) }),
                      layout: reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel),
                    }}
                  >
                    <QueueRow
                      item={item}
                      now={now.getTime()}
                      striking={striking.includes(item.id)}
                      onComplete={() => complete(item)}
                      onHandOver={onHandOverToDexter ? () => onHandOverToDexter(item) : undefined}
                      onOpen={() => onOpenItem?.(item)}
                    />
                  </motion.div>
                )
              })}
            </motion.div>
          ))}
        </AnimatePresence>

        {visible.length === 0 ? (
          <motion.p
            className="md-queue-panel-empty"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter)}
          >
            {scope === "mine" && items.length
              ? t("Nothing assigned to you is open. Switch to All to see the team's queue.")
              : t("Nothing is waiting on you. Exceptions and quote work will appear here as they open.")}
          </motion.p>
        ) : null}
      </div>
    </Surface>
  )
}
