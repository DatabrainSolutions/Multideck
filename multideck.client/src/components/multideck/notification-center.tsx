import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Bell, CalendarDays, Check, CheckCheck, Eye, Handshake, Inbox, Landmark, Mail, MessageSquareText, MoreHorizontal, ReceiptText, RefreshCw, Route, Settings, Sparkles, Trash2, TriangleAlert, UserRoundPlus, X, type LucideIcon } from "@/components/icons/hugeicons"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { mdEaseIn, mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import type { WorkspaceNotification } from "@/lib/notification-api"
import { describeNotification, notificationDayGroup, notificationDayGroupLabels, notificationTimeLabel, type NotificationDayGroup, type NotificationKind, type NotificationPresentation } from "@/lib/notification-presentation"
import { cn } from "@/lib/utils"
import "./notification-center.css"

const kindIcons: Record<NotificationKind, LucideIcon> = {
  "dexter-task": Sparkles,
  "dexter-task-attention": TriangleAlert,
  "dexter-watch": Eye,
  inbox: Inbox,
  quote: ReceiptText,
  booking: RefreshCw,
  customs: Landmark,
  note: MessageSquareText,
  event: CalendarDays,
  mileage: Route,
  lead: UserRoundPlus,
  deal: Handshake,
  briefing: Sparkles,
  update: Bell,
}

const groupOrder: NotificationDayGroup[] = ["today", "yesterday", "week", "older"]
type Filter = "unread" | "all"

export type NotificationCenterProps = {
  notifications: readonly WorkspaceNotification[]
  unreadCount: number
  loaded: boolean
  loading: boolean
  error: string | null
  pending: boolean
  hasMore: boolean
  /** Where a notification leads, or null when its message is the whole story. */
  destinationFor: (notification: WorkspaceNotification) => string | null
  onOpen: (notification: WorkspaceNotification, destination: string) => void
  onToggleRead: (id: string, status: "read" | "unread") => void
  onDismiss: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
  onLoadMore: () => void
  onRetry: () => void
  onOpenSettings: () => void
  className?: string
}

/**
 * The bell's panel. Unread work is shown first and in colour; read items drain
 * to grey rather than disappearing, so marking something read never loses it
 * from under the operator's pointer.
 */
export function NotificationCenter({
  notifications,
  unreadCount,
  loaded,
  loading,
  error,
  pending,
  hasMore,
  destinationFor,
  onOpen,
  onToggleRead,
  onDismiss,
  onMarkAllRead,
  onClearAll,
  onLoadMore,
  onRetry,
  onOpenSettings,
  className,
}: NotificationCenterProps) {
  const { t, language, direction } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [filter, setFilter] = useState<Filter>(() => unreadCount > 0 || !loaded ? "unread" : "all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(true)
  const [cascading, setCascading] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  // Everything seen unread since the Unread view opened stays in it, so a row
  // marked read settles in place instead of vanishing mid-click.
  const keptInUnread = useRef(new Set<string>())
  const filterChanged = useRef(false)

  const visible = useMemo(() => {
    if (filter === "all") return notifications
    for (const notification of notifications) if (notification.status === "unread") keptInUnread.current.add(notification.id)
    return notifications.filter((notification) => keptInUnread.current.has(notification.id))
  }, [filter, notifications])

  const rows = useMemo(() => {
    const now = new Date()
    return visible.map((notification) => {
      const destination = destinationFor(notification)
      return {
        notification,
        destination,
        presentation: describeNotification(notification, Boolean(destination)),
        group: notificationDayGroup(notification.createdAt, now),
        time: notificationTimeLabel(notification.createdAt, language, now),
      }
    })
  }, [destinationFor, language, visible])

  const groups = useMemo(() => groupOrder
    .map((group) => ({ group, rows: rows.filter((row) => row.group === group) }))
    .filter((entry) => entry.rows.length > 0), [rows])

  // The first rows arrive as a short cascade each time the list is (re)shown;
  // anything arriving later lands on its own.
  useEffect(() => {
    if (!loaded) return
    setRevealing(true)
    const timer = window.setTimeout(() => setRevealing(false), 520)
    return () => window.clearTimeout(timer)
  }, [loaded, filter])

  useEffect(() => {
    if (!cascading) return
    const timer = window.setTimeout(() => setCascading(false), 900)
    return () => window.clearTimeout(timer)
  }, [cascading])

  function changeFilter(next: Filter) {
    if (next === filter) return
    keptInUnread.current = new Set()
    filterChanged.current = true
    setExpandedId(null)
    setFilter(next)
    listRef.current?.scrollTo({ top: 0 })
  }

  function markAllRead() {
    setCascading(true)
    onMarkAllRead()
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-notification-row]") ?? [])
    if (!items.length) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? Math.min(items.length - 1, current + 1)
      : Math.max(0, current - 1)
    event.preventDefault()
    items[next]?.focus()
  }

  const caughtUp = loaded && !error && filter === "unread" && visible.length === 0 && unreadCount === 0
  const emptyAll = loaded && !error && filter === "all" && visible.length === 0 && !hasMore
  let rowIndex = -1

  return (
    <div className={cn("md-notif-center", className)} data-scrolled={scrolled || undefined}>
      <header className="md-notif-center__head">
        <div className="md-notif-center__title-row">
          <h2 className="md-notif-center__title">{t("Notifications")}</h2>
          <div className="md-notif-center__head-actions">
            <button type="button" className="md-notif-center__text-button" disabled={pending || !loaded || unreadCount === 0} onClick={markAllRead}>
              <CheckCheck aria-hidden="true" />
              {t("Mark all read")}
            </button>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="md-notif-center__icon-button" aria-label={t("More notification options")}>
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("More options")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="min-w-[208px]">
                <DropdownMenuItem onSelect={onOpenSettings}><Settings />{t("Notification settings")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={pending || !loaded || notifications.length === 0} onSelect={onClearAll}><Trash2 />{t("Clear all notifications")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <SegmentedControl
          ariaLabel={t("Show notifications")}
          options={["unread", "all"] as const}
          value={filter}
          onChange={changeFilter}
          className="md-notif-center__filter"
          renderOption={(option) => option === "unread" ? (
            <>
              {t("Unread")}
              <UnreadCount value={unreadCount} reduceMotion={shouldReduceMotion} />
            </>
          ) : t("All")}
        />
      </header>

      <div
        ref={listRef}
        className="md-notif-center__scroll"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 2)}
        onKeyDown={moveFocus}
      >
        {error ? (
          <InlineNotice tone="error" className="md-notif-center__notice" action={<Button type="button" variant="ghost" disabled={loading} onClick={onRetry}>{t("Retry")}</Button>}>
            {t(error)}
          </InlineNotice>
        ) : null}

        {!loaded && !error ? <DotGridLoaderPanel label="Loading notifications…" minHeight={260} /> : null}

        {/* Switching view swaps the list at once and slides the new one in from
            the side its tab sits on; waiting on an exit only delays the answer. */}
        <motion.div
          key={filter}
          className="md-notif-center__list"
          initial={filterChanged.current ? (shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: (filter === "all" ? 12 : -12) * (direction === "rtl" ? -1 : 1) }) : false}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion(shouldReduceMotion, mdMotion.smooth)}
        >
          {caughtUp ? <CaughtUp onShowAll={notifications.length ? () => changeFilter("all") : undefined} /> : null}
          {emptyAll ? (
            <div className="md-notif-center__empty">
              <EmptyStateIllustration variant="activity" compact />
              <p className="md-notif-center__empty-title">{t("No notifications yet")}</p>
              <p className="md-notif-center__empty-copy">{t("Quote responses, customs handoffs, mentions and Dexter results will appear here.")}</p>
            </div>
          ) : null}

          <LayoutGroup>
            <AnimatePresence mode="popLayout">
              {groups.map(({ group, rows: groupRows }) => (
                <motion.section
                  key={group}
                  layout={shouldReduceMotion ? false : "position"}
                  className="md-notif-group"
                  aria-labelledby={`md-notif-group-${group}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: mdMotion.exit }}
                  transition={reduceMotion(shouldReduceMotion, mdMotion.layout)}
                >
                  <h3 id={`md-notif-group-${group}`} className="md-notif-group__label">{t(notificationDayGroupLabels[group])}</h3>
                  <ul className="md-notif-group__rows">
                    <AnimatePresence mode="popLayout">
                      {groupRows.map((row) => {
                        rowIndex += 1
                        return (
                          <NotificationRow
                            key={row.notification.id}
                            notification={row.notification}
                            presentation={row.presentation}
                            destination={row.destination}
                            time={row.time}
                            index={rowIndex}
                            revealing={revealing}
                            cascading={cascading}
                            expanded={expandedId === row.notification.id}
                            disabled={pending}
                            reduceMotion={shouldReduceMotion}
                            onActivate={() => {
                              if (row.notification.status === "unread") onToggleRead(row.notification.id, "read")
                              if (row.destination) onOpen(row.notification, row.destination)
                              else setExpandedId((current) => current === row.notification.id ? null : row.notification.id)
                            }}
                            onToggleRead={() => onToggleRead(row.notification.id, row.notification.status === "unread" ? "read" : "unread")}
                            onDismiss={() => onDismiss(row.notification.id)}
                          />
                        )
                      })}
                    </AnimatePresence>
                  </ul>
                </motion.section>
              ))}
            </AnimatePresence>
          </LayoutGroup>

          {hasMore && loaded ? (
            <button type="button" className="md-notif-center__more" disabled={loading || pending} onClick={onLoadMore}>
              {loading ? t("Loading…") : t(filter === "unread" && visible.length === 0 ? "Look for older unread notifications" : "Load older notifications")}
            </button>
          ) : null}
        </motion.div>
      </div>
    </div>
  )
}

function UnreadCount({ value, reduceMotion: reduce }: { value: number; reduceMotion: boolean }) {
  const label = value > 99 ? "99+" : String(value)
  return (
    <span className="md-notif-center__count" data-empty={value === 0 || undefined} aria-label={`${value}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={label}
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -3 }}
          transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 620, damping: 30, mass: 0.6 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function CaughtUp({ onShowAll }: { onShowAll?: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="md-notif-center__empty" role="status">
      <svg className="md-notif-caught-up" viewBox="0 0 64 64" aria-hidden="true">
        <circle className="md-notif-caught-up__halo" cx="32" cy="32" r="26" />
        <circle className="md-notif-caught-up__ring" cx="32" cy="32" r="20" pathLength="1" />
        <path className="md-notif-caught-up__tick" d="M23.5 32.5l5.8 5.6 11.2-12" pathLength="1" />
      </svg>
      <p className="md-notif-center__empty-title">{t("You're all caught up")}</p>
      <p className="md-notif-center__empty-copy">{t("New work that needs you will appear here first.")}</p>
      {onShowAll ? <button type="button" className="md-notif-center__text-button md-notif-center__text-button--accent" onClick={onShowAll}>{t("Show all notifications")}</button> : null}
    </div>
  )
}

type NotificationRowProps = {
  /** Forwarded so AnimatePresence can lift a leaving row out of flow while its siblings close up. */
  ref?: Ref<HTMLLIElement>
  notification: WorkspaceNotification
  presentation: NotificationPresentation
  destination: string | null
  time: string
  index: number
  revealing: boolean
  cascading: boolean
  expanded: boolean
  disabled: boolean
  reduceMotion: boolean
  onActivate: () => void
  onToggleRead: () => void
  onDismiss: () => void
}

export function NotificationRow({
  ref,
  notification,
  presentation,
  destination,
  time,
  index,
  revealing,
  cascading,
  expanded,
  disabled,
  reduceMotion: reduce,
  onActivate,
  onToggleRead,
  onDismiss,
}: NotificationRowProps) {
  const { t, language, direction } = useLanguage()
  const Icon = kindIcons[presentation.kind]
  const unread = notification.status === "unread"
  const expandable = !destination && Boolean(presentation.preview)
  const previewRef = useRef<HTMLSpanElement>(null)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  const fullTime = useMemo(() => {
    const parsed = new Date(notification.createdAt)
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }) : ""
  }, [language, notification.createdAt])

  // An expandable preview animates between its two-line box and its measured
  // full height, so opening a long message glides rather than jumps.
  useLayoutEffect(() => {
    if (!expandable || !previewRef.current) return
    setPreviewHeight(previewRef.current.scrollHeight)
  }, [expandable, presentation.preview, expanded])

  const style = {
    "--md-notif-delay": cascading ? `${Math.min(index, 12) * 36}ms` : "0ms",
    ...(expandable && previewHeight !== null ? { "--md-notif-preview-full": `${previewHeight}px` } : {}),
  } as CSSProperties

  return (
    <motion.li
      ref={ref}
      layout={reduce ? false : "position"}
      className="md-notif-row"
      data-unread={unread || undefined}
      data-tone={presentation.tone}
      style={style}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: reduce ? { duration: 0.12 } : { ...mdMotion.enter, delay: revealing && index < 10 ? staggerRamp(index, 0.036) : 0 } }}
      exit={reduce ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, x: direction === "rtl" ? -28 : 28, transition: { duration: 0.18, ease: mdEaseIn } }}
      transition={reduceMotion(reduce, mdMotion.layout)}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            data-notification-row=""
            className="md-notif-row__main"
            aria-expanded={expandable ? expanded : undefined}
            onClick={onActivate}
          >
            <span className="md-notif-row__icon" aria-hidden="true">
              <Icon />
              <span className="md-notif-row__dot" />
            </span>
            <span className="md-notif-row__body">
              <span className="md-notif-row__meta">
                <span className="md-notif-row__label">{t(presentation.label)}</span>
                {presentation.priority === "high" ? <span className="md-notif-row__priority">{t("Priority")}</span> : null}
                <time className="md-notif-row__time" dateTime={notification.createdAt} title={fullTime}>{t(time)}</time>
              </span>
              <span className="md-notif-row__title">
                {notification.title}
                <span className="sr-only">{unread ? `, ${t("Unread")}` : `, ${t("Read")}`}</span>
              </span>
              {presentation.subject ? <span className="md-notif-row__subject">{presentation.subject}</span> : null}
              {presentation.preview ? (
                <span
                  ref={previewRef}
                  className="md-notif-row__preview"
                  data-expandable={expandable || undefined}
                  data-expanded={expanded || undefined}
                  title={expandable ? undefined : presentation.preview}
                >
                  {presentation.preview}
                </span>
              ) : null}
              {presentation.actionLabel ? (
                <span className="md-notif-row__action">
                  {t(presentation.actionLabel)}
                  <ArrowRight aria-hidden="true" />
                </span>
              ) : expandable ? (
                <span className="md-notif-row__action md-notif-row__action--quiet">{t(expanded ? "Show less" : "Show full message")}</span>
              ) : null}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[184px]">
          {destination ? <ContextMenuItem disabled={disabled} onSelect={onActivate}><ArrowRight />{t(presentation.actionLabel ?? "Open")}</ContextMenuItem> : null}
          <ContextMenuItem disabled={disabled} onSelect={onToggleRead}>{unread ? <Check /> : <Mail />}{t(unread ? "Mark as read" : "Mark as unread")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" disabled={disabled} onSelect={onDismiss}><X />{t("Clear notification")}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <span className="md-notif-row__quick">
        <QuickAction label={t(unread ? "Mark as read" : "Mark as unread")} disabled={disabled} onClick={onToggleRead}>
          {unread ? <Check /> : <Mail />}
        </QuickAction>
        <QuickAction label={t("Clear notification")} disabled={disabled} onClick={onDismiss}>
          <X />
        </QuickAction>
      </span>
    </motion.li>
  )
}

function QuickAction({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="md-notif-row__quick-button" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
