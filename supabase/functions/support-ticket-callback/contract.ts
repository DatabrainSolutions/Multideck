export type CloudTicketCallback = {
  eventId: string
  ticketId: string
  reference: string
  reporterUserId: string
  ticketType: "bug" | "feature_request" | "question" | "account_billing" | "security_concern"
  restricted: boolean
  status: "new" | "in_progress" | "waiting_for_customer" | "resolved" | "closed"
  needsReply: boolean
  messageId: string | null
  changedAt: string
  tenantHost: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REFERENCE = /^MD-[0-9]{5,}$/
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const statuses = new Set(["new", "in_progress", "waiting_for_customer", "resolved", "closed"])
const ticketTypes = new Set(["bug", "feature_request", "question", "account_billing", "security_concern"])

export function parseCloudTicketCallback(value: unknown): CloudTicketCallback {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Callback body is invalid.")
  const event = value as Record<string, unknown>
  const eventId = String(event.eventId ?? "")
  const ticketId = String(event.ticketId ?? "")
  const reporterUserId = String(event.reporterUserId ?? "")
  const reference = String(event.reference ?? "")
  const ticketType = String(event.ticketType ?? "")
  const status = String(event.status ?? "")
  const tenantHost = String(event.tenantHost ?? "").trim().toLowerCase()
  const changedAt = String(event.changedAt ?? "")
  const messageId = event.messageId === null || event.messageId === undefined ? null : String(event.messageId)
  if (!UUID.test(eventId) || !UUID.test(ticketId) || !UUID.test(reporterUserId)) throw new Error("Callback identifiers are invalid.")
  if (messageId !== null && !UUID.test(messageId)) throw new Error("Callback message identifier is invalid.")
  if (!REFERENCE.test(reference)) throw new Error("Callback reference is invalid.")
  if (!ticketTypes.has(ticketType)) throw new Error("Callback ticket type is invalid.")
  if (typeof event.restricted !== "boolean") throw new Error("Callback restriction state is invalid.")
  if (!statuses.has(status)) throw new Error("Callback status is invalid.")
  if (typeof event.needsReply !== "boolean") throw new Error("Callback reply state is invalid.")
  if (!HOST.test(tenantHost)) throw new Error("Callback tenant hostname is invalid.")
  const changed = new Date(changedAt)
  if (!Number.isFinite(changed.getTime())) throw new Error("Callback change timestamp is invalid.")
  return { eventId, ticketId, reference, reporterUserId, ticketType: ticketType as CloudTicketCallback["ticketType"], restricted: event.restricted, status: status as CloudTicketCallback["status"], needsReply: event.needsReply, messageId, changedAt: changed.toISOString(), tenantHost }
}

export function isFreshTimestamp(value: string, nowSeconds = Math.floor(Date.now() / 1000), allowanceSeconds = 300) {
  if (!/^[0-9]{10}$/.test(value)) return false
  return Math.abs(nowSeconds - Number(value)) <= allowanceSeconds
}
