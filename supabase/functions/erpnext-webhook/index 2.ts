import { HttpError, json } from "../_shared/backend.ts"
import { adminClient } from "../_shared/backend.ts"

function base64(bytes: ArrayBuffer) {
  let binary = ""
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function equal(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function verified(request: Request, raw: string) {
  const secret = Deno.env.get("ERPNEXT_WEBHOOK_SECRET")?.trim()
  const signature = request.headers.get("X-Frappe-Webhook-Signature")?.trim()
  if (!secret || !signature) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))
  return equal(base64(digest), signature)
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 })
  try {
    const raw = await request.text()
    if (!(await verified(request, raw))) throw new HttpError(401, "Invalid webhook signature.")
    const payload = JSON.parse(raw) as Record<string, unknown>
    const doctype = typeof payload.doctype === "string" ? payload.doctype.slice(0, 120) : null
    const name = typeof payload.name === "string" ? payload.name.slice(0, 240) : null
    const event = typeof payload.event === "string" ? payload.event.slice(0, 120) : "updated"
    const allowed = new Set(["Sales Invoice", "Purchase Invoice", "Payment Entry", "Bank Account"])
    if (!doctype || !allowed.has(doctype)) return new Response(null, { status: 204 })
    const admin = adminClient()
    const { error } = await admin.from("ACCI_WebhookEvents").insert({
      ACCIWH_ProviderCode: "erpnext", ACCIWH_EventType: event, ACCIWH_ExternalObjectType: doctype, ACCIWH_ExternalID: name,
      ACCIWH_SignatureVerified: true, ACCIWH_ProcessingStatusCode: "queued", ACCIWH_RawPayloadJSON: payload,
    })
    if (error) throw new HttpError(500, "Webhook event could not be recorded.")
    return json(request, { accepted: true }, 202)
  } catch (error) {
    console.warn(JSON.stringify({ event: "erpnext_webhook_rejected", status: error instanceof HttpError ? error.status : 500 }))
    return new Response(null, { status: error instanceof HttpError ? error.status : 500 })
  }
})
