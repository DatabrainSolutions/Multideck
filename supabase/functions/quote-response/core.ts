import { normaliseMultideckAppOrigin } from "../_shared/multideck-app-origin.ts"

export const maximumCompetitorQuoteBytes = 10 * 1024 * 1024
export const allowedCompetitorQuoteTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export const customerDeclineReasonCodes = [
  "cost_too_high",
  "estimated_times_too_late",
  "found_cheaper_quote",
  "research_only",
  "job_no_longer_needed",
  "other",
] as const

export type CustomerDeclineReasonCode = (typeof customerDeclineReasonCodes)[number]

export class QuoteResponseError extends Error {
  constructor(public readonly status: number, public readonly clientMessage: string, public readonly auditMessage = clientMessage) {
    super(auditMessage)
  }
}

export function parseToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : ""
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new QuoteResponseError(404, "This quote link is invalid.")
  return token
}

export function parseQuoteResponseOrigin(value: unknown) {
  const origin = normaliseMultideckAppOrigin(value)
  if (!origin) throw new QuoteResponseError(403, "This quote link is not available on this workspace.")
  return origin
}

export function isQuoteResponseOriginAllowed(value: unknown) {
  return normaliseMultideckAppOrigin(value) !== null
}

export function parseDecision(value: unknown) {
  if (value === "accepted" || value === "declined" || value === "challenged") return value
  throw new QuoteResponseError(400, "Choose accept, decline or request changes.")
}

export function parseMessage(value: unknown, decision: "accepted" | "declined" | "challenged") {
  const message = typeof value === "string" ? value.trim() : ""
  if (decision === "challenged" && !message) {
    throw new QuoteResponseError(400, "Tell us what you would like us to review.")
  }
  if (message.length > 4_000) throw new QuoteResponseError(400, "Keep the response to 4,000 characters or fewer.")
  return message || null
}

export function parseDeclineReason(value: unknown, decision: "accepted" | "declined" | "challenged") {
  const reason = typeof value === "string" ? value.trim() : ""
  if (decision !== "declined") {
    if (reason) throw new QuoteResponseError(400, "A decline reason can only be supplied when declining a quote.")
    return null
  }
  if (!customerDeclineReasonCodes.includes(reason as CustomerDeclineReasonCode)) {
    throw new QuoteResponseError(400, "Choose the main reason for declining this quote.")
  }
  return reason as CustomerDeclineReasonCode
}

export function safeFileName(value: string) {
  const name = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]+/g, "-").replace(/\s+/g, " ").trim()
  return (name || "competitor-quote").slice(0, 180)
}

export function assertCompetitorQuote(file: File) {
  if (!file.size || file.size > maximumCompetitorQuoteBytes) {
    throw new QuoteResponseError(400, "Attach a competitor quote up to 10 MB.")
  }
  if (!allowedCompetitorQuoteTypes.has(file.type)) {
    throw new QuoteResponseError(400, "Attach a PDF, JPEG, PNG or WebP competitor quote.")
  }
}

export async function sha256Hex(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function toClientError(error: unknown) {
  if (error instanceof QuoteResponseError) return error
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : ""
  if (code === "P0002") return new QuoteResponseError(404, message || "This quote link is invalid.", message)
  if (code === "22023" || code === "23514") return new QuoteResponseError(400, message || "Check the response and try again.", message)
  if (code === "23505") return new QuoteResponseError(409, "This quote has already received a response.", message)
  return new QuoteResponseError(500, "The quote response could not be completed.", message || "Unexpected quote response failure")
}
