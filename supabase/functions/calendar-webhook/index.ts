import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { adminClient } from "../_shared/backend.ts"
import { cleanText, sha256 } from "../_shared/calendar.ts"

type JsonObject = Record<string, unknown>

function plain(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
}

function empty(status = 204) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } })
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function constantTimeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function getSecret(admin: SupabaseClient, reference: unknown) {
  if (typeof reference !== "string" || !reference) return ""
  const { data, error } = await admin.rpc("calendar_get_secret", { p_secret_ref: reference })
  if (error) throw error
  if (typeof data !== "string") return ""
  return data
}

async function recordReceipt(admin: SupabaseClient, provider: string, deliveryKey: string, connectionId: string | null, eventType: string) {
  const { error } = await admin.from("CAL_WebhookReceipts").insert({
    CALWebhookReceipt_ProviderCode: provider,
    CALWebhookReceipt_DeliveryKey: deliveryKey.slice(0, 500),
    CALWebhookReceipt_ConnectionID: connectionId,
    CALWebhookReceipt_EventType: eventType.slice(0, 120) || null,
  })
  if (error?.code === "23505") return false
  if (error) throw error
  return true
}

async function markForSync(admin: SupabaseClient, connectionId: string) {
  const { error } = await admin.from("CAL_ProviderConnections").update({
    CALConnection_StatusCode: "syncing",
    CALConnection_LastSyncedAt: null,
    CALConnection_UpdatedAt: new Date().toISOString(),
  }).eq("CALConnection_ID", connectionId).neq("CALConnection_StatusCode", "disconnected")
  if (error) throw error
}

async function enqueueZoomMeetingUpdate(
  admin: SupabaseClient,
  meeting: Record<string, unknown>,
  deliveryKey: string,
  kind: "rescheduled" | "cancelled",
) {
  const { error } = await admin.from("CAL_Deliveries").upsert({
    CALDelivery_CompanyID: meeting.CALMeeting_CompanyID,
    CALDelivery_MeetingID: meeting.CALMeeting_ID,
    CALDelivery_KindCode: kind,
    CALDelivery_IdempotencyKey: `meeting:${meeting.CALMeeting_ID}:zoom-webhook:${await sha256(deliveryKey)}:${kind}`,
  }, { onConflict: "CALDelivery_IdempotencyKey", ignoreDuplicates: true })
  if (error) throw error
}

async function googleWebhook(request: Request, admin: SupabaseClient) {
  const channelId = cleanText(request.headers.get("x-goog-channel-id"), 500)
  const resourceId = cleanText(request.headers.get("x-goog-resource-id"), 500)
  const token = cleanText(request.headers.get("x-goog-channel-token"), 500)
  const messageNumber = cleanText(request.headers.get("x-goog-message-number"), 120)
  const state = cleanText(request.headers.get("x-goog-resource-state"), 120)
  if (!channelId || !resourceId || !token || !messageNumber) return empty(401)
  const { data: connection, error: connectionError } = await admin.from("CAL_ProviderConnections").select("*")
    .eq("CALConnection_ProviderCode", "google").eq("CALConnection_SubscriptionID", channelId)
    .eq("CALConnection_SubscriptionResourceID", resourceId).neq("CALConnection_StatusCode", "disconnected").maybeSingle()
  if (connectionError) throw connectionError
  if (!connection) return empty(404)
  const expected = await getSecret(admin, connection.CALConnection_SubscriptionSecretRef)
  if (!constantTimeEqual(token, expected)) return empty(401)
  await recordReceipt(admin, "google", `${channelId}:${messageNumber}`, connection.CALConnection_ID, state)
  // Repeating this update is intentional: if the first delivery was recorded
  // but its sync marker failed, an authenticated provider retry repairs it.
  if (state !== "sync") await markForSync(admin, connection.CALConnection_ID)
  return empty()
}

async function microsoftWebhook(request: Request, admin: SupabaseClient, raw: string) {
  const payload = JSON.parse(raw || "{}") as JsonObject
  const notifications = Array.isArray(payload.value) ? payload.value.map(object).slice(0, 100) : []
  const bodyHash = await sha256(raw)
  for (let index = 0; index < notifications.length; index += 1) {
    const notification = notifications[index]
    const subscriptionId = cleanText(notification.subscriptionId, 500)
    const clientState = cleanText(notification.clientState, 500)
    if (!subscriptionId || !clientState) continue
    const { data: connection, error: connectionError } = await admin.from("CAL_ProviderConnections").select("*")
      .eq("CALConnection_ProviderCode", "microsoft").eq("CALConnection_SubscriptionID", subscriptionId)
      .neq("CALConnection_StatusCode", "disconnected").maybeSingle()
    if (connectionError) throw connectionError
    if (!connection) continue
    const expected = await getSecret(admin, connection.CALConnection_SubscriptionSecretRef)
    if (!constantTimeEqual(clientState, expected)) continue
    const eventType = cleanText(notification.lifecycleEvent ?? notification.changeType, 120)
    await recordReceipt(admin, "microsoft", `${subscriptionId}:${bodyHash}:${index}`, connection.CALConnection_ID, eventType)
    await markForSync(admin, connection.CALConnection_ID)
  }
  return empty(202)
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))
}

async function zoomWebhook(request: Request, admin: SupabaseClient, raw: string) {
  const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN")?.trim() || ""
  const timestamp = cleanText(request.headers.get("x-zm-request-timestamp"), 40)
  const signature = cleanText(request.headers.get("x-zm-signature"), 200)
  if (!secret || !timestamp || !signature || Math.abs(Date.now() - Number(timestamp) * 1_000) > 5 * 60_000) return empty(401)
  const expected = `v0=${await hmacHex(secret, `v0:${timestamp}:${raw}`)}`
  if (!constantTimeEqual(signature, expected)) return empty(401)
  const payload = JSON.parse(raw || "{}") as JsonObject
  const event = cleanText(payload.event, 120)
  if (event === "endpoint.url_validation") {
    const plainToken = cleanText(object(payload.payload).plainToken, 500)
    if (!plainToken) return empty(400)
    return new Response(JSON.stringify({ plainToken, encryptedToken: await hmacHex(secret, plainToken) }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
  }
  const payloadObject = object(payload.payload)
  const meetingObject = object(payloadObject.object)
  const providerEventId = cleanText(meetingObject.id, 500)
  const accountId = cleanText(payloadObject.account_id, 500)
  const hostId = cleanText(meetingObject.host_id, 500)
  const { data: candidates, error: candidatesError } = await admin.from("CAL_ProviderConnections").select("*")
    .eq("CALConnection_ProviderCode", "zoom").neq("CALConnection_StatusCode", "disconnected")
  if (candidatesError) throw candidatesError
  const connection = (candidates ?? []).find((candidate) => candidate.CALConnection_ProviderAccountID === hostId || candidate.CALConnection_ProviderTenantID === accountId) ?? null
  if (!connection) return empty(202)
  const deliveryKey = `${cleanText(payload.event_ts, 80) || timestamp}:${event}:${providerEventId || await sha256(raw)}`
  await recordReceipt(admin, "zoom", deliveryKey, connection.CALConnection_ID, event)
  if (providerEventId) {
    const { data: meeting, error: meetingError } = await admin.from("CAL_Meetings").select("*")
      .eq("CALMeeting_CompanyID", connection.CALConnection_CompanyID)
      .eq("CALMeeting_OrganiserUserID", connection.CALConnection_UserID)
      .eq("CALMeeting_ProviderCode", "zoom").eq("CALMeeting_ProviderEventID", providerEventId).maybeSingle()
    if (meetingError) throw meetingError
    if (meeting && (event === "meeting.deleted" || event === "meeting.cancelled")) {
      if (meeting.CALMeeting_StatusCode !== "cancelled") {
        const { error: cancelError } = await admin.from("CAL_Meetings").update({
          CALMeeting_StatusCode: "cancelled", CALMeeting_PendingChangeJSON: null,
          CALMeeting_LastSyncError: null, CALMeeting_EditVersion: Number(meeting.CALMeeting_EditVersion) + 1,
          CALMeeting_UpdatedAt: new Date().toISOString(),
        }).eq("CALMeeting_ID", meeting.CALMeeting_ID)
        if (cancelError) throw cancelError
      }
      // Repeat the remaining mutations even after the canonical meeting has
      // changed so a provider retry can finish a partially processed webhook.
      if (meeting.CALMeeting_ReservationID) {
        const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
        if (releaseError) throw releaseError
      }
      const { error: cacheError } = await admin.from("CAL_ProviderEvents").update({ CALProviderEvent_IsCancelled: true, CALProviderEvent_UpdatedAt: new Date().toISOString() }).eq("CALProviderEvent_MeetingID", meeting.CALMeeting_ID)
      if (cacheError) throw cacheError
      await enqueueZoomMeetingUpdate(admin, meeting, deliveryKey, "cancelled")
    } else if (meeting && event === "meeting.updated") {
      const startAt = cleanText(meetingObject.start_time, 120)
      const duration = Number(meetingObject.duration)
      if (startAt && Number.isFinite(duration) && duration > 0) {
        const start = new Date(startAt)
        const end = new Date(start.getTime() + duration * 60_000)
        if (!Number.isNaN(start.getTime()) && meeting.CALMeeting_ReservationID) {
          const title = cleanText(meetingObject.topic, 240) || meeting.CALMeeting_Title
          const joinUrl = cleanText(meetingObject.join_url, 2_000) || meeting.CALMeeting_JoinURL
          const changed = start.toISOString() !== meeting.CALMeeting_StartAt || end.toISOString() !== meeting.CALMeeting_EndAt || title !== meeting.CALMeeting_Title || joinUrl !== meeting.CALMeeting_JoinURL
          if (changed) {
            const { error: reservationError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: start.toISOString(), CALReservation_EndAt: end.toISOString(), CALReservation_StatusCode: "active" }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
            if (reservationError) {
              const { error: conflictError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "sync_failed", CALMeeting_LastSyncError: "Zoom moved this meeting to a time that conflicts with another Multideck reservation." }).eq("CALMeeting_ID", meeting.CALMeeting_ID)
              if (conflictError) throw conflictError
            } else {
              if (changed) {
                const { error: updateError } = await admin.from("CAL_Meetings").update({
                  CALMeeting_Title: title, CALMeeting_StartAt: start.toISOString(), CALMeeting_EndAt: end.toISOString(),
                  CALMeeting_JoinURL: joinUrl, CALMeeting_StatusCode: "confirmed", CALMeeting_LastSyncError: null,
                  CALMeeting_PendingChangeJSON: null, CALMeeting_EditVersion: Number(meeting.CALMeeting_EditVersion) + 1,
                  CALMeeting_UpdatedAt: new Date().toISOString(),
                }).eq("CALMeeting_ID", meeting.CALMeeting_ID)
                if (updateError) throw updateError
              }
              const { error: cacheError } = await admin.from("CAL_ProviderEvents").update({
                CALProviderEvent_Title: title, CALProviderEvent_StartAt: start.toISOString(), CALProviderEvent_EndAt: end.toISOString(),
                CALProviderEvent_IsCancelled: false, CALProviderEvent_UpdatedAt: new Date().toISOString(),
              }).eq("CALProviderEvent_MeetingID", meeting.CALMeeting_ID)
              if (cacheError) throw cacheError
              await enqueueZoomMeetingUpdate(admin, meeting, deliveryKey, "rescheduled")
            }
          }
        }
      }
    }
  }
  const { error: syncedError } = await admin.from("CAL_ProviderConnections").update({ CALConnection_LastSyncedAt: new Date().toISOString(), CALConnection_LastError: null }).eq("CALConnection_ID", connection.CALConnection_ID)
  if (syncedError) throw syncedError
  return empty(202)
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return empty(405)
  const url = new URL(request.url)
  const provider = cleanText(url.searchParams.get("provider"), 20)
  if (provider === "microsoft" && url.searchParams.has("validationToken")) return plain(url.searchParams.get("validationToken") || "")
  try {
    const admin = adminClient()
    if (provider === "google") return await googleWebhook(request, admin)
    const raw = await request.text()
    if (provider === "microsoft") return await microsoftWebhook(request, admin, raw)
    if (provider === "zoom") return await zoomWebhook(request, admin, raw)
    return empty(404)
  } catch (error) {
    console.error("Calendar webhook failed", error)
    return empty(500)
  }
})
