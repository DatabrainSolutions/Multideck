import { HttpError } from "./backend.ts"

export const erpNextWebhookBodyLimit = 262_144
type ReceiptResult = { data: unknown; error: { code?: string } | null }
type Dependencies = { secret: string | undefined; record: (raw: string) => PromiseLike<ReceiptResult> }

async function readRaw(request: Request) {
  const declared = request.headers.get("content-length")
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > erpNextWebhookBodyLimit)) {
    throw new HttpError(413, "Webhook body is too large.")
  }
  if (!request.body) throw new HttpError(400, "Webhook body is required.")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > erpNextWebhookBodyLimit) {
        await reader.cancel()
        throw new HttpError(413, "Webhook body is too large.")
      }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

/** Authenticated transport receipt; it never posts or reconciles financial data. */
export async function receiveErpNextWebhook(request: Request, dependencies: Dependencies) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } })
  try {
    const secret = dependencies.secret?.trim()
    if (!secret) throw new HttpError(503, "ERPNext webhook verification is not configured.")
    const signature = request.headers.get("X-Frappe-Webhook-Signature")?.trim()
    if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) throw new HttpError(401, "Invalid webhook signature.")
    const bytes = await readRaw(request)
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
    const signatureBytes = Uint8Array.from(atob(signature), char => char.charCodeAt(0))
    if (!(await crypto.subtle.verify("HMAC", key, signatureBytes, bytes))) throw new HttpError(401, "Invalid webhook signature.")
    let raw: string
    let payload: unknown
    try {
      // Preserve exact signed UTF-8 text for the database to parse and hash.
      // The parsed JS object is used only for routing, never monetary evidence.
      raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
      payload = JSON.parse(raw)
    } catch { throw new HttpError(400, "Webhook body must be valid UTF-8 JSON.") }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "Webhook payload must be an object.")
    const doctype = (payload as Record<string, unknown>).doctype
    if (typeof doctype !== "string") throw new HttpError(400, "Webhook doctype is required.")
    if (!["Sales Invoice", "Purchase Invoice", "Payment Entry", "Bank Account"].includes(doctype)) return new Response(null, { status: 204 })
    const result = await dependencies.record(raw)
    if (result.error) {
      const code = result.error.code
      if (code === "P0002") throw new HttpError(409, "Webhook company has no unique active ERPNext connection.")
      if (code === "23505") throw new HttpError(409, "Webhook version conflicts with retained evidence.")
      if (["22023", "22P02", "22007", "22008"].includes(code ?? "")) throw new HttpError(400, "Webhook identity or version is invalid.")
      throw new HttpError(503, "Webhook receipt could not be retained. Retry this delivery.")
    }
    const receipt = result.data as { accepted?: unknown; duplicate?: unknown; eventId?: unknown } | null
    if (receipt?.accepted !== true || typeof receipt.duplicate !== "boolean" || typeof receipt.eventId !== "string") {
      throw new HttpError(503, "Webhook receipt was not confirmed. Retry this delivery.")
    }
    return Response.json({ accepted: true, duplicate: receipt.duplicate, eventId: receipt.eventId }, { status: 202 })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503
    console.warn(JSON.stringify({ event: "erpnext_webhook_rejected", status }))
    return Response.json({ error: error instanceof HttpError ? error.message : "Webhook receipt could not be retained." }, { status })
  }
}
