import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { isFreshTimestamp, parseCloudTicketCallback } from "./contract.ts"

const encoder = new TextEncoder()
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const expectedTenantId = Deno.env.get("MULTIDECK_CLOUD_TENANT_ID")?.trim() ?? ""
const expectedTenantHost = Deno.env.get("MULTIDECK_TENANT_HOST")?.trim().toLowerCase() ?? ""
const publicKeyBase64 = Deno.env.get("MULTIDECK_CLOUD_CALLBACK_PUBLIC_KEY")?.trim() ?? ""
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function verifySignature(value: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "spki",
    fromBase64(publicKeyBase64),
    { name: "Ed25519" },
    false,
    ["verify"],
  )
  return await crypto.subtle.verify("Ed25519", key, fromBase64(signature), encoder.encode(value))
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405)
  if (!supabaseUrl || !serviceRoleKey || !expectedTenantId || !expectedTenantHost || !publicKeyBase64) {
    return json({ error: "Ticket callback is not configured." }, 503)
  }

  const timestamp = request.headers.get("x-multideck-timestamp")?.trim() ?? ""
  const nonce = request.headers.get("x-multideck-nonce")?.trim() ?? ""
  const tenantId = request.headers.get("x-multideck-tenant-id")?.trim() ?? ""
  const signature = request.headers.get("x-multideck-signature")?.trim() ?? ""
  if (!isFreshTimestamp(timestamp) || !/^[0-9a-f-]{36}$/i.test(nonce) || tenantId !== expectedTenantId || !signature) {
    return json({ error: "Ticket callback authorization failed." }, 401)
  }

  const rawBody = await request.text()
  if (!rawBody || encoder.encode(rawBody).byteLength > 16_384) {
    return json({ error: "Ticket callback body is invalid." }, 400)
  }

  let event
  try {
    event = parseCloudTicketCallback(JSON.parse(rawBody))
  } catch {
    return json({ error: "Ticket callback body is invalid." }, 400)
  }
  if (event.tenantHost !== expectedTenantHost) {
    return json({ error: "Ticket callback tenant does not match this deployment." }, 403)
  }

  try {
    const signatureBody = timestamp + "." + nonce + "." + await sha256(rawBody) + "." + tenantId
    if (!(await verifySignature(signatureBody, signature))) {
      return json({ error: "Ticket callback authorization failed." }, 401)
    }
  } catch {
    return json({ error: "Ticket callback authorization failed." }, 401)
  }
  // The restriction discriminator is part of the signed body. Cloud is the
  // primary security-ticket boundary, and the tenant refuses restricted data
  // independently so a future Cloud regression cannot copy it into App.
  if (event.restricted || event.ticketType === "security_concern") {
    return json({ error: "Restricted ticket callbacks are not accepted by tenant deployments." }, 403)
  }

  const { data, error } = await admin.rpc("multideck_receive_cloud_ticket_signal", {
    p_event_id: event.eventId,
    p_nonce: nonce,
    p_sent_at: Number(timestamp),
    p_ticket_id: event.ticketId,
    p_reference: event.reference,
    p_reporter_user_id: event.reporterUserId,
    p_ticket_type: event.ticketType,
    p_restricted: event.restricted,
    p_status: event.status,
    p_needs_reply: event.needsReply,
    p_message_id: event.messageId,
    p_changed_at: event.changedAt,
    p_tenant_host: event.tenantHost,
  })
  if (error) {
    console.error("Cloud ticket callback persistence failed", error.code ?? "unknown")
    return json({ error: "Ticket callback could not be persisted." }, 500)
  }
  return json(data ?? { accepted: true })
})
