import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { ArrowRight, Check, Mail, ReceiptText, RotateCcw, Ship, Sparkles, TriangleAlert, type LucideIcon } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import type { StatusTone } from "@/data/multideck-data"
import { Surface } from "./surface"
import { toneToVar } from "./status-pill"

export type DashboardActionListItem = {
  label: string
  value: string
  detail: string
  source: string
  tone: StatusTone
}

/** How long the strike-through reads before the row collapses out of the list. */
const strikeHoldMs = 360

function getActionIcon(label: string): LucideIcon {
  const normalised = label.toLowerCase()
  if (normalised.includes("email") || normalised.includes("repl")) return Mail
  if (normalised.includes("quote")) return ReceiptText
  if (normalised.includes("risk") || normalised.includes("action") || normalised.includes("blocker")) return TriangleAlert
  return Ship
}

export const ActionListRow = memo(function ActionListRow({
  item,
  striking = false,
  onComplete,
  onOpen,
}: {
  item: DashboardActionListItem
  striking?: boolean
  onComplete?: () => void
  onOpen?: () => void
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const Icon = getActionIcon(item.label)

  return (
    <div className="md-action-row" data-striking={striking ? "true" : undefined} style={{ ["--md-action-accent" as string]: toneToVar(item.tone) }}>
      {/* The node sits on the panel's spine, so the list reads as a route
          through the day rather than four unrelated cards. */}
      <span className="md-action-row-node" aria-hidden="true">
        <Icon className="size-3.5" strokeWidth={1.25} />
      </span>

      <button type="button" onClick={onOpen} className="md-action-row-open">
        <span className="md-action-row-line">
          <span className="md-action-row-title-wrap">
            <span className="md-action-row-title">{item.label}</span>
            {/* The rule wipes across the label before the row leaves, so
                completing an item reads as one gesture, not a row vanishing. */}
            <motion.span
              aria-hidden="true"
              className="md-action-row-strike"
              style={{ transformOrigin: direction === "rtl" ? "right" : "left" }}
              initial={false}
              animate={{ scaleX: striking ? 1 : 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
            />
          </span>
          {/* Source sits on the title line rather than its own: it is context for
              the title, and a third line per row cost the panel a whole item. */}
          <span className="md-action-row-source">{item.source}</span>
        </span>
        <span className="md-action-row-detail">{item.detail}</span>
      </button>

      <span className="md-action-row-tail">
        <span className="md-action-row-value">{item.value}</span>
        <span className="md-action-row-actions">
          <button
            type="button"
            aria-label={`${t("Complete")} ${item.label}`}
            onClick={onComplete}
            className="md-action-row-button md-action-row-button-done"
          >
            <Check className="size-3.5" strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label={`${t("Open")} ${item.label}`}
            onClick={onOpen}
            className="md-action-row-button"
          >
            <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} />
          </button>
        </span>
      </span>
    </div>
  )
})

export function TodayActionList({
  items: liveItems,
  briefLead,
  onOpenItem,
  className,
}: {
  items: DashboardActionListItem[]
  briefLead: string
  onOpenItem?: (label: string) => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [striking, setStriking] = useState<string[]>([])
  const [done, setDone] = useState<string[]>([])
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    setStriking([])
    setDone([])
  }, [liveItems])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const restore = useCallback((label: string) => {
    setDone((current) => current.filter((entry) => entry !== label))
    setStriking((current) => current.filter((entry) => entry !== label))
  }, [])

  const complete = useCallback(
    (label: string) => {
      setStriking((current) => (current.includes(label) ? current : [...current, label]))

      const timer = window.setTimeout(
        () => {
          setDone((current) => (current.includes(label) ? current : [...current, label]))
          setStriking((current) => current.filter((entry) => entry !== label))
          toast.success(t("Cleared from today's list"), {
            description: label,
            action: { label: t("Undo"), onClick: () => restore(label) },
          })
        },
        shouldReduceMotion ? 0 : strikeHoldMs,
      )

      timersRef.current.push(timer)
    },
    [restore, shouldReduceMotion, t],
  )

  const allItems = liveItems
  const items = useMemo(() => allItems.filter((item) => !done.includes(item.label)), [allItems, done])
  const clearedRatio = allItems.length === 0 ? 0 : done.length / allItems.length

  return (
    <Surface padding="none" className={cn("md-action-list", className)}>
      <div className="md-action-list-head">
        <span className="md-action-list-badge" aria-hidden="true">
          <Sparkles className="size-3.5" strokeWidth={1.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="md-panel-title">{t("Today's action list")}</h2>
          <p className="md-panel-meta">
            {items.length} {t("open")}
            {done.length ? ` · ${done.length} ${t("cleared")}` : ""}
          </p>
        </div>
        {done.length ? (
          <button type="button" className="md-action-list-reset" onClick={() => setDone([])}>
            <RotateCcw className="size-3" strokeWidth={1.5} />
            {t("Restore")}
          </button>
        ) : null}
      </div>

      <div className="md-action-list-body md-scrollbar">
        <p className="md-action-list-lead">{briefLead}</p>
        <div className="md-action-timeline">
          <span className="md-action-timeline-spine" aria-hidden="true">
            <motion.span
              className="md-action-timeline-spine-fill"
              initial={false}
              animate={{ scaleY: Math.max(clearedRatio, 0.02) }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            />
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((item, index) => (
              <motion.div
                key={item.label}
                layout="position"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 14, scale: 0.985 }}
                transition={{
                  ...(shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.036) }),
                  layout: reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel),
                }}
              >
                <ActionListRow
                  item={item}
                  striking={striking.includes(item.label)}
                  onComplete={() => complete(item.label)}
                  onOpen={() => onOpenItem?.(item.label)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {items.length === 0 ? (
            <motion.p
              key="cleared"
              className="md-action-list-empty"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
            >
              {t("Everything on today's list is cleared.")}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </Surface>
  )
}
