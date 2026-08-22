import { normaliseMultideckAppOrigin } from "../_shared/multideck-app-origin.ts"

export type QuoteWorkflowAction = "sources" | "workspace" | "intelligence" | "save" | "transition" | "open" | "readiness" | "issue-options" | "issue-draft" | "issue-refine" | "issue-preview" | "issue" | "reference-settings" | "save-reference-settings" | "draft-reference-rule" | "branding"
export type QuoteExpiryPreset = 7 | 14 | 28 | 90 | "never"
export type QuoteDeliveryMode = "standard" | "simple"

export const quoteLifecycleActions = ["calculated", "sent", "revised", "accepted", "declined", "ghosted"] as const
export type QuoteLifecycleAction = (typeof quoteLifecycleActions)[number]

export class QuoteWorkflowError extends Error {
  constructor(public readonly status: number, public readonly clientMessage: string, public readonly auditMessage = clientMessage) {
    super(auditMessage)
  }
}

export function requiredText(value: unknown, label: string, maximum = 500) {
  if (typeof value !== "string" || !value.trim()) throw new QuoteWorkflowError(400, `${label} is required.`)
  return value.trim().slice(0, maximum)
}

export function optionalText(value: unknown, maximum = 2000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null
}

export function parseReference(value: unknown) {
  const reference = requiredText(value, "Quote reference", 64).toUpperCase()
  if (
    !/^[A-Z0-9 _./-]{1,64}$/.test(reference) ||
    !/[0-9]/.test(reference) ||
    reference.includes("..") ||
    reference.includes("//") ||
    reference.startsWith("/") ||
    reference.endsWith("/")
  ) throw new QuoteWorkflowError(400, "Choose a valid quote reference.")
  return reference
}

export function parseUuid(value: unknown, label: string) {
  const uuid = requiredText(value, label, 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new QuoteWorkflowError(400, `${label} is invalid.`)
  }
  return uuid
}

export function parseAction(value: unknown): QuoteWorkflowAction {
  if (["sources", "workspace", "intelligence", "save", "transition", "open", "readiness", "issue-options", "issue-draft", "issue-refine", "issue-preview", "issue", "reference-settings", "save-reference-settings", "draft-reference-rule", "branding"].includes(String(value))) {
    return value as QuoteWorkflowAction
  }
  throw new QuoteWorkflowError(400, "Choose a supported quote action.")
}

export function parseEmail(value: unknown) {
  const email = requiredText(value, "Customer email", 320).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new QuoteWorkflowError(400, "Enter a valid customer email address.")
  return email
}

export function parseQuoteResponseOrigin(value: unknown) {
  const origin = normaliseMultideckAppOrigin(value)
  if (!origin) throw new QuoteWorkflowError(400, "Open this quote from its Multideck workspace before sending it.")
  return origin
}

export function buildQuoteResponseUrl(requestOrigin: unknown, token: string) {
  const origin = parseQuoteResponseOrigin(requestOrigin)
  return new URL(`/quotes/respond/${encodeURIComponent(token)}`, origin).toString()
}

export function parseExpiryPreset(value: unknown): QuoteExpiryPreset {
  if (value === "never") return "never"
  const days = Number(value ?? 14)
  if (days === 7 || days === 14 || days === 28 || days === 90) return days
  throw new QuoteWorkflowError(400, "Choose 7, 14, 28 or 90 days, or never.")
}

export function parseDeliveryMode(value: unknown): QuoteDeliveryMode {
  if (value === undefined || value === null || value === "standard") return "standard"
  if (value === "simple") return "simple"
  throw new QuoteWorkflowError(400, "Choose Standard or Simple quote delivery.")
}

export function buildSimpleQuoteEmailDraft(input: {
  reference: string
  origin?: string | null
  destination?: string | null
  totalLabel: string
  recipientFirstName?: string | null
  senderFirstName?: string | null
}) {
  const reference = requiredText(input.reference, "Quote reference", 64)
  const origin = optionalText(input.origin, 180) ?? ""
  const destination = optionalText(input.destination, 180) ?? ""
  const totalLabel = requiredText(input.totalLabel, "Quote total", 180)
  const recipientFirstName = optionalText(input.recipientFirstName, 80) ?? ""
  const senderFirstName = optionalText(input.senderFirstName, 80) ?? ""
  const route = origin && destination ? `${origin} to ${destination}` : `quote ${reference}`
  return {
    subject: origin && destination ? `Quote ${reference} – ${origin} to ${destination}` : `Quote ${reference}`,
    bodyText: `${recipientFirstName ? `Hi ${recipientFirstName},` : "Hello,"} our quote for ${route} is ${totalLabel}. I’ve attached the full quote for your reference. ${senderFirstName ? `Thank you, ${senderFirstName}` : "Thank you"}`,
  }
}

export function parseLifecycleAction(value: unknown): QuoteLifecycleAction {
  if (quoteLifecycleActions.includes(value as QuoteLifecycleAction)) return value as QuoteLifecycleAction
  throw new QuoteWorkflowError(400, "Choose a supported quote lifecycle action.")
}

export function validateSavePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QuoteWorkflowError(400, "Quote details are required.")
  const payload = value as Record<string, unknown>
  if (payload.sourceType !== undefined && payload.sourceType !== "lead" && payload.sourceType !== "account") {
    throw new QuoteWorkflowError(400, "Choose a lead or account.")
  }
  if (payload.sourceId !== undefined && payload.sourceId !== null && String(payload.sourceId).trim()) parseUuid(payload.sourceId, "Lead or account")
  if (payload.charges !== undefined && !Array.isArray(payload.charges)) throw new QuoteWorkflowError(400, "Quote charges are invalid.")
  if (Array.isArray(payload.charges) && payload.charges.length > 200) throw new QuoteWorkflowError(400, "A quote can contain up to 200 charge lines.")
  const ignoredKeys = new Set(["sourceType", "defaultMarkupPct", "workflowVersion", "officeId", "departmentId", "salesOwnerId"])
  const hasContent = (candidate: unknown): boolean => {
    if (candidate === null || candidate === undefined) return false
    if (typeof candidate === "string") return Boolean(candidate.trim())
    if (typeof candidate === "number" || typeof candidate === "boolean") return true
    if (Array.isArray(candidate)) return candidate.some(hasContent)
    if (typeof candidate === "object") {
      return Object.entries(candidate as Record<string, unknown>)
        .some(([key, child]) => !ignoredKeys.has(key) && hasContent(child))
    }
    return false
  }
  const { charges, ...quoteFields } = payload
  const chargeDefaults = new Set(["showToCustomer", "quantity", "costRoe", "sellRoe", "costLocal", "sellLocal", "defaultMarkupPct"])
  const hasMeaningfulCharge = Array.isArray(charges) && charges.some((charge) => {
    if (!charge || typeof charge !== "object" || Array.isArray(charge)) return false
    return Object.entries(charge as Record<string, unknown>).some(([key, child]) => {
      if (chargeDefaults.has(key)) return false
      if ((key === "costAmount" || key === "sellAmount") && Number(child) === 0) return false
      return hasContent(child)
    })
  })
  if (!hasContent(quoteFields) && !hasMeaningfulCharge) {
    throw new QuoteWorkflowError(400, "Add at least one quote detail before saving.")
  }
  return payload
}

export function toClientError(error: unknown) {
  if (error instanceof QuoteWorkflowError) return error
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : ""
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  if (code === "42501") return new QuoteWorkflowError(403, "You are not authorised to use this quote.", message)
  if (code === "22023" && message) return new QuoteWorkflowError(400, message, message)
  if (code === "P0002" && message) return new QuoteWorkflowError(404, message, message)
  return new QuoteWorkflowError(500, "The quote workflow could not complete the request.", message || "Unexpected quote workflow failure")
}
