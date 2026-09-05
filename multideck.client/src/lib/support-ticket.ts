import type { TicketAttachment } from "./ticket-attachments"
import { supabase } from "@/lib/supabase"
import { isSecureSupportStatusUrl, normalizeSupportTicketConditionalFields } from "@/lib/support-ticket-submission"
import { isSupportTicketConversation, isSupportTicketCursor, isSupportTicketMessage, isSupportTicketSummary } from "@/lib/support-ticket-conversation"

export type SupportTicketType = "bug" | "feature_request" | "question" | "account_billing" | "security_concern"
export type SupportTicketImpact = "blocked" | "slowed_down" | "no_immediate_blocker"

export type CreateSupportTicketRequest = {
  idempotencyKey: string
  ticketType: SupportTicketType
  impact: SupportTicketImpact
  title: string
  description: string
  expectedBehaviour?: string | null
  actualBehaviour?: string | null
  desiredOutcome?: string | null
  context: Record<string, unknown>
  attachments?: File[]
  onProgress?: (state: "creating" | "preparing_attachments" | "uploading" | "finalizing") => void
}

export type SupportTicket = { id: string; ticketNumber: string; status: string; priority: string; customerName: string; statusUrl: string | null }
export type CreateSupportTicketResponse = { ticket: SupportTicket; duplicate: boolean }
export type SupportTicketSummary = {
  id: string
  reference: string
  title: string
  description: string
  ticketType: SupportTicketType
  status: "new" | "in_progress" | "waiting_for_customer" | "resolved" | "closed"
  needsReply: boolean
  createdAt: string
  updatedAt: string
}
export type SupportTicketMessage = { id: string; authorType: "customer" | "staff"; authorName: string; body: string; createdAt: string; attachments?: TicketAttachment[] }
export type SupportTicketConversation = { ticket: SupportTicketSummary; messages: SupportTicketMessage[]; nextCursor: string | null }

function invalidConversationResponse() {
  return new SupportTicketError("support_service_invalid_response", "Support did not confirm the requested details. Refresh and try again.", 502)
}
export async function listSupportTickets(before?: string) {
  const result = await invoke<{ tickets: SupportTicketSummary[]; nextCursor: string | null }>({ action: "list_tickets", ...(before ? { before } : {}) })
  if (!Array.isArray(result.tickets) || !result.tickets.every(isSupportTicketSummary) || !isSupportTicketCursor(result.nextCursor)) throw invalidConversationResponse()
  return result
}
export async function getSupportTicket(ticketId: string, before?: string) {
  const result = await invoke<SupportTicketConversation>({ action: "get_ticket", ticketId, ...(before ? { before } : {}) })
  if (!isSupportTicketConversation(result, ticketId)) throw invalidConversationResponse()
  return result
}
export async function addSupportTicketComment(ticketId: string, body: string, idempotencyKey: string, attachmentIds?: string[]) {
  const result = await invoke<{ message: SupportTicketMessage; duplicate: boolean }>({ action: attachmentIds ? "send_message" : "add_comment", ticketId, body, idempotencyKey, ...(attachmentIds ? { attachmentIds } : {}) }, 30_000)
  if (!isSupportTicketMessage(result.message) || result.message.authorType !== "customer" || typeof result.duplicate !== "boolean") throw invalidConversationResponse()
  return result
}
export type LegacySupportTicketRequest = {
  idempotencyKey: string
  topic: string
  priority: "Normal" | "High" | "Urgent"
  title: string
  description: string
  applicationUrl: string
}
export type LegacySupportTicketResponse = {
  ticket: {
    ticketNumber: string
    status: string
    createdAt: string
    statusUrl: string | null
  }
  duplicate: boolean
}
export class SupportTicketError extends Error { constructor(public readonly code: string, message: string, public readonly status: number) { super(message); this.name = "SupportTicketError" } }
type FunctionErrorBody = { code?: unknown; message?: unknown }

async function supportTicketError(error: unknown) {
  let status = 503, code = "support_service_unavailable", message = "Support is temporarily unavailable. Your ticket details are still here; try again."
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    const response = error.context; status = response.status
    try { const body = await response.clone().json() as FunctionErrorBody; if (typeof body.code === "string") code = body.code; if (typeof body.message === "string") message = body.message } catch { /* Keep the safe fallback. */ }
  }
  return new SupportTicketError(code, message, status)
}

export async function invoke<T>(body: Record<string, unknown>, timeoutMs = 16_000): Promise<T> {
  if (!supabase) throw new SupportTicketError("support_service_unavailable", "Support is temporarily unavailable. Your ticket details are still here; try again.", 503)
  const controller = new AbortController(); const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { data, error } = await supabase.functions.invoke<T>("create-support-ticket", { body, signal: controller.signal })
    if (error) throw await supportTicketError(error)
    if (!data) throw new SupportTicketError("support_service_invalid_response", "Support returned an invalid response. Your ticket details are still here; try again.", 502)
    return data
  } catch (error) {
    if (error instanceof SupportTicketError) throw error
    if (error instanceof Error && error.name === "AbortError") throw new SupportTicketError("support_service_timeout", "Support took too long to respond. Your ticket details are still here; try again.", 504)
    throw await supportTicketError(error)
  } finally { window.clearTimeout(timeoutId) }
}

function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("") }
async function attachmentMetadata(file: File) {
  const bytes = await file.arrayBuffer()
  const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes))
  let width: number | null = null, height: number | null = null
  try { const bitmap = await createImageBitmap(file); width = bitmap.width; height = bitmap.height; bitmap.close() } catch { /* The Cloud validates the real file signature after upload. */ }
  return { originalName: file.name, mediaType: file.type, byteSize: file.size, sha256, width, height }
}
async function uploadToSignedUrl(signedUrl: string, file: File) {
  const form = new FormData(); form.append("cacheControl", "3600"); form.append("", file)
  const response = await fetch(signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form })
  if (!response.ok) throw new SupportTicketError("attachment_upload_failed", "One of the screenshots could not be uploaded. Your ticket details are still here; try again.", response.status)
}

/**
 * Keeps the established Databrain intake available for tenants that have not
 * yet completed the Cloud ticketing rollout. The Edge Function chooses the
 * destination from its server-side flag; the browser cannot override it.
 */
export async function createLegacySupportTicket(
  request: LegacySupportTicketRequest,
): Promise<LegacySupportTicketResponse> {
  return invoke<LegacySupportTicketResponse>(request)
}

export async function createSupportTicket(request: CreateSupportTicketRequest): Promise<CreateSupportTicketResponse> {
  const conditional = normalizeSupportTicketConditionalFields(request.ticketType, request)
  const attachments = conditional.attachments
  if (attachments.length > 5 || attachments.some((file) => !["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) || attachments.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) {
    throw new SupportTicketError("attachment_validation_failed", "Attach up to five PNG, JPEG, or WebP images, no more than 10 MB each and 25 MB in total.", 400)
  }
  request.onProgress?.("creating")
  const created = await invoke<{ draft: { id: string; expiresAt: string }; customer: { name: string; slug: string } }>({ action: "create_draft", ticket: { idempotencyKey: request.idempotencyKey, ticketType: request.ticketType, impact: request.impact, title: request.title, description: request.description, expectedBehaviour: conditional.expectedBehaviour, actualBehaviour: conditional.actualBehaviour, desiredOutcome: conditional.desiredOutcome, context: request.context } })
  if (attachments.length) request.onProgress?.("preparing_attachments")
  for (const file of attachments) {
    const metadata = await attachmentMetadata(file)
    const prepared = await invoke<{ attachment: { id: string; path: string; signedUrl: string } }>({ action: "prepare_attachment", attachment: { draftId: created.draft.id, ...metadata } })
    request.onProgress?.("uploading")
    await uploadToSignedUrl(prepared.attachment.signedUrl, file)
    // Cloud resolves the stored path and verifies the uploaded bytes against
    // the server-owned attachment declaration. The browser only identifies
    // which prepared attachment should be completed.
    await invoke({ action: "complete_attachment", attachmentId: prepared.attachment.id }, 30_000)
  }
  request.onProgress?.("finalizing")
  const finalized = await invoke<{ ticket: { id: string; reference: string; status: string; priority: string; customerName: string; statusUrl: string | null } }>({ action: "finalize", draftId: created.draft.id })
  if (!finalized.ticket.reference) throw new SupportTicketError("support_service_invalid_response", "Support did not confirm a ticket number. Your ticket details are still here; try again.", 502)
  if (!isSecureSupportStatusUrl(finalized.ticket.statusUrl)) throw new SupportTicketError("support_status_link_unavailable", "Your ticket was saved, but its secure status link could not be confirmed. Try again to retrieve it.", 502)
  return { ticket: { id: finalized.ticket.id, ticketNumber: finalized.ticket.reference, status: finalized.ticket.status, priority: finalized.ticket.priority, customerName: finalized.ticket.customerName, statusUrl: finalized.ticket.statusUrl }, duplicate: false }
}
