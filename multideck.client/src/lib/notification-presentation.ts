import { fromMarkdown } from "mdast-util-from-markdown"
import type { WorkspaceNotification } from "./notification-api"
import { notificationPreviewText } from "./notification-preview.ts"

/**
 * What a notification is about, worked out from the fields producers already
 * write. The feed row carries no explicit "kind", so the source table, the
 * metadata event and the producer's own eyebrow decide it between them.
 */
export type NotificationKind =
  | "dexter-task"
  | "dexter-task-attention"
  | "dexter-watch"
  | "inbox"
  | "quote"
  | "booking"
  | "customs"
  | "note"
  | "event"
  | "mileage"
  | "lead"
  | "deal"
  | "briefing"
  | "update"

export type NotificationTone = "accent" | "positive" | "attention" | "critical" | "info" | "violet" | "neutral"

export type NotificationPresentation = {
  kind: NotificationKind
  /** Short category shown above the title. */
  label: string
  tone: NotificationTone
  /** Verb for the destination, e.g. "Open quote". Null when there is nowhere to go. */
  actionLabel: string | null
  /** A record name lifted from a leading Markdown heading, e.g. a Dexter task's subject. */
  subject: string | null
  /** Plain-text body with the subject removed. */
  preview: string
  priority: "high" | "normal"
}

type PreviewNode = { type: string; depth?: number; children?: PreviewNode[] }

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null

/** Splits a leading `# Heading` off the body so it can be shown as the record it is about. */
export function notificationBodyParts(body: string): { subject: string | null; preview: string } {
  if (!body.trim()) return { subject: null, preview: "" }
  const tree = fromMarkdown(body) as PreviewNode & { children: Array<PreviewNode & { position?: { end: { offset?: number } } }> }
  const first = tree.children[0]
  if (first?.type !== "heading" || (first.depth ?? 1) > 2 || first.position?.end.offset === undefined) {
    return { subject: null, preview: notificationPreviewText(body) }
  }
  const subject = notificationPreviewText(body.slice(0, first.position.end.offset).replace(/^#+\s*/u, "")) || null
  return { subject, preview: notificationPreviewText(body.slice(first.position.end.offset)) }
}

export function describeNotification(notification: Pick<WorkspaceNotification, "title" | "body" | "priority" | "targetTable" | "metadata">, hasDestination = true): NotificationPresentation {
  const { metadata, targetTable } = notification
  const event = text(metadata.event_type) ?? text(metadata.event) ?? ""
  const title = notification.title.toLowerCase()
  const eyebrow = text(metadata.eyebrow)
  const producerAction = text(metadata.action_label)

  const base = ((): Omit<NotificationPresentation, "subject" | "preview" | "priority" | "actionLabel"> & { actionLabel: string } => {
    if (targetTable === "AI_DexterTaskAssignments") {
      return title.includes("attention")
        ? { kind: "dexter-task-attention", label: "Dexter task", tone: "attention", actionLabel: "Open task" }
        : { kind: "dexter-task", label: "Dexter task", tone: "accent", actionLabel: "Review task" }
    }
    if (targetTable === "AI_DexterWatches" || event === "dexter_watch") return { kind: "dexter-watch", label: "Watching for you", tone: "info", actionLabel: "View change" }
    if (targetTable === "AI_InboxSuggestedUpdates") {
      const review = title.includes("ready") || title.includes("needs")
      return { kind: "inbox", label: "Inbox", tone: review ? "attention" : "accent", actionLabel: review ? "Review update" : "View update" }
    }
    if (event === "quote_response" || targetTable === "CusQuote_Header") {
      const decision = text(metadata.decision)
      const tone: NotificationTone = decision === "accepted" ? "positive" : decision === "declined" ? "critical" : "attention"
      return { kind: "quote", label: "Quote response", tone, actionLabel: "Open quote" }
    }
    if (event === "booking_quote_sync" || targetTable === "Job_Header") return { kind: "booking", label: "Booking", tone: "attention", actionLabel: "Review booking" }
    if (event === "customs_handoff" || event === "icustoms_webhook" || targetTable === "Customs_Declarations") return { kind: "customs", label: "Customs", tone: "info", actionLabel: "Open declaration" }
    if (event === "lifecycle_note_mention") return { kind: "note", label: "Mention", tone: "violet", actionLabel: "Open note" }
    if (event.startsWith("company_event") || targetTable === "company_events") return { kind: "event", label: "Company event", tone: "violet", actionLabel: "View event" }
    if (event.startsWith("mileage_") || targetTable === "mileage_trips") {
      const tone: NotificationTone = event === "mileage_pending" ? "attention" : event === "mileage_ready" || event === "mileage_paid" ? "positive" : "critical"
      return { kind: "mileage", label: "Mileage", tone, actionLabel: "View trip" }
    }
    if (targetTable === "CRM_LeadTransferRequests" || targetTable === "CRM_Leads") {
      return { kind: "lead", label: "Lead", tone: event.endsWith("declined") ? "critical" : "info", actionLabel: "Open lead" }
    }
    if (targetTable === "CRM_Opportunities") return { kind: "deal", label: "Deal", tone: "info", actionLabel: "Open deal" }
    if (targetTable === "AI_CrmSalesBriefings") return { kind: "briefing", label: "Sales briefing", tone: "accent", actionLabel: "Open CRM" }
    return { kind: "update", label: "Update", tone: "neutral", actionLabel: "Open" }
  })()

  const { subject, preview } = notificationBodyParts(notification.body)
  return {
    ...base,
    // A producer's own eyebrow is more specific than the table it wrote to.
    label: eyebrow ?? base.label,
    actionLabel: hasDestination ? producerAction ?? base.actionLabel : null,
    subject,
    preview,
    priority: notification.priority === "high" || notification.priority === "urgent" ? "high" : "normal",
  }
}

export type NotificationDayGroup = "today" | "yesterday" | "week" | "older"

export function notificationDayGroup(createdAt: string, now = new Date()): NotificationDayGroup {
  const parsed = new Date(createdAt)
  if (!Number.isFinite(parsed.getTime())) return "older"
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  if (parsed.getTime() >= startOfToday) return "today"
  if (parsed.getTime() >= startOfToday - day) return "yesterday"
  if (parsed.getTime() >= startOfToday - 6 * day) return "week"
  return "older"
}

export const notificationDayGroupLabels: Record<NotificationDayGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  older: "Older",
}

/** A time that reads naturally inside its day group: "4 min" today, a weekday this week, a date after that. */
export function notificationTimeLabel(createdAt: string, locale: string, now = new Date()) {
  const parsed = new Date(createdAt)
  if (!Number.isFinite(parsed.getTime())) return ""
  const group = notificationDayGroup(createdAt, now)
  if (group === "today") {
    const minutes = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 60_000))
    if (minutes < 1) return "Now"
    if (minutes < 60) return `${minutes} min`
    return parsed.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  }
  if (group === "yesterday") return parsed.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  if (group === "week") return parsed.toLocaleDateString(locale, { weekday: "short" })
  return parsed.toLocaleDateString(locale, { day: "numeric", month: "short", ...(parsed.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })
}
