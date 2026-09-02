import { supabase } from "@/lib/supabase"
import type { PublicBranding } from "@/lib/public-brand-theme"

export type QuoteResponseDecision = "accepted" | "declined" | "challenged"

export type CustomerQuotePayload = {
  customerName?: string
  contactName?: string
  collectionAddress?: string
  loadingPoint?: string
  dischargePoint?: string
  deliveryAddress?: string
  direction?: string
  mode?: string
  shipmentType?: string
  serviceLevel?: string
  incoterm?: string
  validFrom?: string
  validTo?: string
  deadline?: string
  currency?: string
  shipmentFacts?: Record<string, unknown>
  customerNotes?: string
  terms?: string
  charges?: Array<{
    id?: string
    description?: string
    sellCurrency?: string
    sellAmount?: number
    sellLocal?: number
    quantity?: number
    customerNotes?: string
    showToCustomer?: boolean
  }>
}

export type QuoteResponseView = (
  | { state: "expired" | "revoked" }
  | { state: "responded"; decision: QuoteResponseDecision; respondedAt: string }
  | {
      state: "active"
      expiresAt: string | null
      recipientName?: string | null
      recipientEmail: string
      document: {
        url: string
        fileName: string
        mimeType: "application/pdf"
        expiresAt: string
      }
      quote: {
        id: string
        reference: string
        versionNumber: number
        customerName?: string | null
        contactName?: string | null
        snapshot: {
          reference?: string
          lifecycle?: string
          savedAt?: string
          quote?: CustomerQuotePayload
        }
      }
    }
  ) & { branding?: PublicBranding | null }

export type QuoteResponseResult = {
  state: "responded"
  decision: QuoteResponseDecision
  responseId: string
  booking?: { jobId?: string; bookingReference?: string; reused?: boolean } | null
}

type UploadedCompetitorQuote = {
  documentId: string
  fileName: string
  fileSizeBytes: number
}

function requireClient() {
  if (!supabase) throw new Error("This secure quote service is unavailable on this domain.")
  return supabase
}

async function responseError(error: unknown, fallback: string) {
  const context = typeof error === "object" && error && "context" in error ? (error as { context?: unknown }).context : null
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown }
      if (typeof body.error === "string" && body.error.trim()) return new Error(body.error)
    } catch {
      // Public errors deliberately fall back to safe customer-facing copy when
      // the gateway response is not readable JSON.
    }
  }
  const message = error instanceof Error ? error.message.trim() : ""
  const exposesInfrastructure = /edge function|failed to send a request|fetch failed|non-2xx/i.test(message)
  return message && !exposesInfrastructure ? new Error(message) : new Error(fallback)
}

async function invoke<T>(body: Record<string, unknown>, fallback: string) {
  const { data, error } = await requireClient().functions.invoke<T>("quote-response", { method: "POST", body })
  if (error) throw await responseError(error, fallback)
  if (!data) throw new Error(fallback)
  return data
}

export function getCustomerQuote(token: string) {
  return invoke<QuoteResponseView>({ action: "view", token }, "This quote could not be loaded.")
}

export function submitCustomerQuoteResponse(
  token: string,
  decision: QuoteResponseDecision,
  message: string,
  competitorDocumentId: string | null,
) {
  return invoke<QuoteResponseResult>(
    { action: "submit", token, decision, message, competitorDocumentId },
    "Your response could not be submitted.",
  )
}

export async function uploadCompetitorQuote(token: string, file: File) {
  const form = new FormData()
  form.set("action", "upload")
  form.set("token", token)
  form.set("idempotencyKey", crypto.randomUUID())
  form.set("file", file)
  const { data, error } = await requireClient().functions.invoke<UploadedCompetitorQuote>("quote-response", { method: "POST", body: form })
  if (error) throw await responseError(error, "The competitor quote could not be attached.")
  if (!data) throw new Error("The competitor quote could not be attached.")
  return data
}
