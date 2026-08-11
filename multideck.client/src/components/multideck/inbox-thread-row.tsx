import { Paperclip, Star } from "@/components/icons/hugeicons"
import { motion, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import type { InboxThreadListItem } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

/**
 * One thread in the mailbox list, and the anchor for the workspace's selection
 * motion: the selected surface is a single shared element that travels between
 * rows on a well-damped spring, so rapid arrow-key or click switching retargets
 * instead of snapping. Unread state is carried by weight and a dot as well as the
 * count, so nothing depends on motion or colour alone.
 */

export function formatThreadTimestamp(value: string | null, language: string, now = new Date()) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(date)
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(language, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })
    .format(date)
}

/** The people worth naming in a list row: the other participants, sender first. */
export function threadParticipantLabel(thread: InboxThreadListItem, ownAddresses: string[]) {
  const owned = new Set(ownAddresses.map((address) => address.toLowerCase()))
  const others = thread.participants.filter((person) => !owned.has(person.address.toLowerCase()))
  const shown = (others.length > 0 ? others : thread.participants).slice(0, 2)
  const names = shown.map((person) => person.displayName?.trim() || person.address)
  const remaining = (others.length > 0 ? others.length : thread.participants.length) - shown.length

  return remaining > 0 ? `${names.join(", ")} +${remaining}` : names.join(", ")
}

export function InboxThreadRow({
  thread,
  selected,
  ownAddresses = [],
  selectionLayoutId,
  onSelect,
  onPrefetch,
  onToggleStar,
}: {
  thread: InboxThreadListItem
  selected: boolean
  /** Addresses belonging to the operator, so they are not listed as a participant. */
  ownAddresses?: string[]
  /**
   * Shared `layoutId` for the selected surface. Pass the same value to every row
   * in one list so the highlight travels; omit it to keep the surface static.
   */
  selectionLayoutId?: string
  onSelect: () => void
  /** Warm the read-only detail request from pointer or keyboard intent. */
  onPrefetch?: () => void
  onToggleStar?: () => void
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const unread = thread.unreadCount > 0
  const participants = threadParticipantLabel(thread, ownAddresses)
  const timestamp = formatThreadTimestamp(thread.lastMessageAt, language)

  return (
    <div
      data-inbox-thread-row=""
      data-selected={selected ? "true" : undefined}
      data-unread={unread ? "true" : undefined}
      className="group relative isolate"
    >
      {selected ? (
        <motion.span
          aria-hidden="true"
          layoutId={selectionLayoutId}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
          className="pointer-events-none absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-selected-bg)] shadow-[inset_0_0_0_1px_var(--md-accent-a14)]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
        />
      )}

      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        className="grid w-full min-h-[44px] grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 rounded-[var(--md-radius-lg)] px-3 py-2.5 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)]"
        onPointerEnter={onPrefetch}
        onPointerDown={onPrefetch}
        onFocus={onPrefetch}
        onClick={onSelect}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {unread ? (
            <span
              aria-hidden="true"
              className="size-[6px] shrink-0 rounded-full bg-[var(--md-accent)]"
            />
          ) : null}
          <span
            data-i18n-skip
            dir="auto"
            title={participants}
            className={cn(
              "min-w-0 truncate text-[13px] text-[var(--md-ink)]",
              unread ? "font-medium" : "font-normal",
            )}
          >
            {participants}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {thread.hasAttachments ? (
            <Paperclip className="size-3 text-[var(--md-subtle)]" strokeWidth={1.4} aria-label={t("Has attachments")} />
          ) : null}
          {thread.messageCount > 1 ? (
            <span
              data-i18n-skip
              dir="ltr"
              aria-label={`${thread.messageCount} ${t("messages")}`}
              className="rounded-full bg-[var(--md-surface-tint)] px-1.5 text-[10.5px] font-medium leading-[16px] tabular-nums text-[var(--md-text)]"
            >
              {thread.messageCount}
            </span>
          ) : null}
          <span data-i18n-skip dir="ltr" className="text-[11.5px] tabular-nums text-[var(--md-subtle)]">
            {timestamp}
          </span>
        </span>

        <span className="col-span-2 min-w-0">
          <span
            data-i18n-skip
            dir="auto"
            className={cn(
              "block truncate text-[13px] leading-5",
              unread ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-text)]",
            )}
          >
            {thread.subject || t("No subject")}
          </span>
          <span
            data-i18n-skip
            dir="auto"
            /* The star sits in the bottom-end corner, so the preview keeps clear of it. */
            className="mt-0.5 line-clamp-2 block pe-9 text-[12px] leading-[1.45] text-[var(--md-subtle)]"
          >
            {thread.preview}
          </span>
        </span>
      </button>

      {onToggleStar ? (
        <button
          type="button"
          aria-pressed={thread.starred}
          aria-label={thread.starred ? t("Remove star") : t("Star thread")}
          title={thread.starred ? t("Remove star") : t("Star thread")}
          className={cn(
            "absolute end-1.5 bottom-1.5 grid size-8 place-items-center rounded-full text-[var(--md-subtle)] outline-none transition-[opacity,color,background-color,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-amber)] focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
            thread.starred
              ? "text-[var(--md-amber)] opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation()
            onToggleStar()
          }}
        >
          <Star className={cn("size-3.5", thread.starred && "fill-current")} strokeWidth={1.4} />
        </button>
      ) : null}
    </div>
  )
}
