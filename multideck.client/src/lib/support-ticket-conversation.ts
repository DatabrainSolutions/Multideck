import type { SupportTicketConversation, SupportTicketMessage, SupportTicketSummary } from "./support-ticket"

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value))
const ticketTypes = new Set(["bug", "feature_request", "question", "account_billing", "security_concern"])
const statuses = new Set(["new", "in_progress", "waiting_for_customer", "resolved", "closed"])

export function isSupportTicketSummary(value: unknown): value is SupportTicketSummary {
  return record(value) && typeof value.id === "string" && Boolean(value.id)
    && typeof value.reference === "string" && Boolean(value.reference)
    && typeof value.title === "string" && typeof value.description === "string"
    && ticketTypes.has(String(value.ticketType)) && statuses.has(String(value.status))
    && typeof value.needsReply === "boolean" && timestamp(value.createdAt) && timestamp(value.updatedAt)
}

export function isSupportTicketMessage(value: unknown): value is SupportTicketMessage {
  return record(value) && typeof value.id === "string" && Boolean(value.id)
    && (value.authorType === "customer" || value.authorType === "staff")
    && typeof value.authorName === "string" && typeof value.body === "string"
    && timestamp(value.createdAt) && value.internal !== true && value.visibility !== "internal"
}

export function isSupportTicketCursor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0)
}

export function isSupportTicketConversation(value: unknown, ticketId: string): value is SupportTicketConversation {
  return record(value) && isSupportTicketSummary(value.ticket) && value.ticket.id === ticketId
    && Array.isArray(value.messages) && value.messages.every(isSupportTicketMessage)
    && isSupportTicketCursor(value.nextCursor)
}
