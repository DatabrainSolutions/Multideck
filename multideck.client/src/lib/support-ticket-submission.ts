import type { SupportTicketType } from "@/lib/support-ticket"

type ConditionalTicketFields = {
  expectedBehaviour?: string | null
  actualBehaviour?: string | null
  desiredOutcome?: string | null
  attachments?: File[]
}

// Apply the conditional form boundary again at submission time. This makes
// hidden values impossible to forward even if another caller bypasses the
// dialog's type-change cleanup.
export function normalizeSupportTicketConditionalFields(
  ticketType: SupportTicketType,
  fields: ConditionalTicketFields,
) {
  return {
    expectedBehaviour: ticketType === "bug" ? fields.expectedBehaviour ?? null : null,
    actualBehaviour: ticketType === "bug" ? fields.actualBehaviour ?? null : null,
    desiredOutcome: ticketType === "feature_request" ? fields.desiredOutcome ?? null : null,
    attachments: ticketType === "bug" ? fields.attachments ?? [] : [],
  }
}

export function isSecureSupportStatusUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}
