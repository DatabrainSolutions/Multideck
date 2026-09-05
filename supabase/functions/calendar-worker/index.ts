import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { zoomNumericReference, zoomStartTime } from "../_shared/calendar-zoom.ts"
import { adminClient, HttpError } from "../_shared/backend.ts"
import { cleanText, meetingIcs, randomToken, sha256 } from "../_shared/calendar.ts"
import { calendarProviderAccessToken } from "../_shared/calendar-provider-auth.ts"
import { normaliseExternalEventChange, normaliseExternalEventResponse, pushExternalEventChange, pushExternalEventResponse } from "../_shared/calendar-provider-events.ts"
import { linkBookingMeetingToCrm } from "../_shared/calendar-booking-crm.ts"
import { readCalendarEmailTemplate, renderCalendarEmailTemplate, type CalendarEmailTemplateKind } from "../_shared/calendar-email-templates.ts"
import { renderBrandedEmail } from "../_shared/email-template.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"
import { readConfiguredTenantBrand } from "../_shared/tenant-branding.ts"

type JsonObject = Record<string, unknown>

function response(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

function secretsMatch(left: string | null, right: string | null) {
  if (!left || !right || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function secretValue(admin: SupabaseClient, reference: string) {
  const { data, error } = await admin.rpc("calendar_get_secret", { p_secret_ref: reference })
  if (error || typeof data !== "string" || !data) throw new HttpError(503, "The secure meeting link could not be loaded.")
  return data
}

async function putSecret(admin: SupabaseClient, name: string, value: string, description = "Multideck Calendar webhook verification secret") {
  const { data, error } = await admin.rpc("calendar_put_secret", { p_secret: value, p_name: name, p_description: description })
  if (error || typeof data !== "string") throw new HttpError(503, "The calendar webhook secret could not be secured.")
  return data
}

async function deleteSecret(admin: SupabaseClient, reference: unknown) {
  if (typeof reference !== "string" || !reference) return
  const { error } = await admin.rpc("calendar_delete_secret", { p_secret_ref: reference })
  if (error) console.error("Calendar secret cleanup failed", { secretRef: reference })
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function providerDateTime(value: unknown) {
  const row = object(value)
  const dateTime = cleanText(row.dateTime, 120)
  if (dateTime) {
    const hasZone = /(?:z|[+-]\d\d:\d\d)$/i.test(dateTime)
    const parsed = new Date(hasZone ? dateTime : `${dateTime}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const date = cleanText(row.date, 20)
  if (!date) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function googleJoinUrl(payload: JsonObject) {
  const conference = object(payload.conferenceData)
  const entryPoints = Array.isArray(conference.entryPoints) ? conference.entryPoints.map(object) : []
  return cleanText(payload.hangoutLink, 2_000) || cleanText(entryPoints.find((entry) => entry.entryPointType === "video")?.uri, 2_000)
}

type ProviderParticipant = {
  id: string
  name: string
  email: string
  role: "organiser" | "attendee" | "optional"
  response: "needs_action" | "accepted" | "tentative" | "declined"
  self: boolean
}

function providerResponseCode(value: unknown): ProviderParticipant["response"] {
  const response = cleanText(value, 40)
  if (response === "accepted" || response === "organizer") return "accepted"
  if (response === "tentative" || response === "tentativelyAccepted") return "tentative"
  if (response === "declined") return "declined"
  return "needs_action"
}

/**
 * Provider attendee data is retained only as bounded presentation metadata for
 * the existing tenant-safe Calendar read. The connected owner's response is
 * marked separately so invitations remain answerable when the event is private.
 */
function providerParticipants(payload: JsonObject, provider: "google" | "microsoft", connectionEmail: string) {
  const byEmail = new Map<string, ProviderParticipant>()
  const add = (candidate: ProviderParticipant) => {
    const current = byEmail.get(candidate.email)
    if (!current || candidate.role === "organiser") byEmail.set(candidate.email, candidate)
  }

  const organiser = object(payload.organizer)
  const organiserAddress = provider === "microsoft" ? object(organiser.emailAddress) : organiser
  const organiserEmail = cleanText(provider === "microsoft" ? organiserAddress.address : organiserAddress.email, 320).toLowerCase()
  if (organiserEmail.includes("@")) add({
    id: cleanText(organiser.id, 500) || organiserEmail,
    name: cleanText(provider === "microsoft" ? organiserAddress.name : organiserAddress.displayName, 240) || organiserEmail.split("@")[0],
    email: organiserEmail,
    role: "organiser",
    response: "accepted",
    self: organiser.self === true || organiserEmail === connectionEmail,
  })

  for (const attendee of (Array.isArray(payload.attendees) ? payload.attendees.map(object) : []).slice(0, 100)) {
    const emailAddress = provider === "microsoft" ? object(attendee.emailAddress) : attendee
    const email = cleanText(provider === "microsoft" ? emailAddress.address : attendee.email, 320).toLowerCase()
    if (!email.includes("@")) continue
    const organiser = provider === "google" && attendee.organizer === true
    const optional = provider === "microsoft" ? attendee.type === "optional" : attendee.optional === true
    add({
      id: cleanText(attendee.id, 500) || email,
      name: cleanText(provider === "microsoft" ? emailAddress.name : attendee.displayName, 240) || email.split("@")[0],
      email,
      role: organiser ? "organiser" : optional ? "optional" : "attendee",
      response: organiser ? "accepted" : providerResponseCode(provider === "google" ? attendee.responseStatus : object(attendee.status).response),
      self: attendee.self === true || email === connectionEmail,
    })
  }

  return [...byEmail.values()].slice(0, 100)
}

function providerOwnerResponse(payload: JsonObject, provider: "google" | "microsoft", participants: ProviderParticipant[]) {
  const self = participants.find((participant) => participant.self)
  const providerResponse = provider === "microsoft" ? cleanText(object(payload.responseStatus).response, 40) : ""
  const isOrganiser = payload.isOrganizer === true || providerResponse === "organizer" || self?.role === "organiser"
  const response = isOrganiser ? "accepted" : providerResponse ? providerResponseCode(providerResponse) : self?.response ?? null
  return { isOrganiser, response }
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function reconcileOwnedMeeting(admin: SupabaseClient, providerEventId: string, explicitMeetingId: string | null, startAt: string | null, endAt: string | null, cancelled: boolean, joinUrl?: string | null) {
  let query = admin.from("CAL_Meetings").select("*")
  query = explicitMeetingId ? query.eq("CALMeeting_ID", explicitMeetingId) : query.eq("CALMeeting_ProviderEventID", providerEventId)
  const { data: meeting, error: meetingError } = await query.maybeSingle()
  if (meetingError) throw meetingError
  if (!meeting) return null
  if (cancelled) {
    const { error: cancelError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "cancelled", CALMeeting_PendingChangeJSON: null, CALMeeting_LastSyncError: null, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", meeting.CALMeeting_ID)
    if (cancelError) throw cancelError
    if (meeting.CALMeeting_ReservationID) {
      const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
      if (releaseError) throw releaseError
    }
    return meeting.CALMeeting_ID as string
  }
  if (!startAt || !endAt) return meeting.CALMeeting_ID as string
  if (meeting.CALMeeting_ReservationID && (meeting.CALMeeting_StartAt !== startAt || meeting.CALMeeting_EndAt !== endAt)) {
    const { error } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: startAt, CALReservation_EndAt: endAt }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
    if (error) {
      const { error: conflictError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "sync_failed", CALMeeting_LastSyncError: "The provider moved this meeting to a time that conflicts with another Multideck reservation." }).eq("CALMeeting_ID", meeting.CALMeeting_ID)
      if (conflictError) throw conflictError
      return meeting.CALMeeting_ID as string
    }
  }
  const { error: updateError } = await admin.from("CAL_Meetings").update({
    CALMeeting_StartAt: startAt,
    CALMeeting_EndAt: endAt,
    CALMeeting_JoinURL: joinUrl || meeting.CALMeeting_JoinURL,
    CALMeeting_StatusCode: "confirmed",
    CALMeeting_PendingChangeJSON: null,
    CALMeeting_LastSyncError: null,
    CALMeeting_UpdatedAt: new Date().toISOString(),
  }).eq("CALMeeting_ID", meeting.CALMeeting_ID)
  if (updateError) throw updateError
  return meeting.CALMeeting_ID as string
}

async function mirrorProviderEvent(admin: SupabaseClient, connection: Record<string, unknown>, payload: JsonObject, provider: "google" | "microsoft") {
  const providerId = cleanText(payload.id, 500)
  if (!providerId) return
  const removed = Boolean(payload["@removed"])
  const cancelled = removed || payload.status === "cancelled" || payload.isCancelled === true
  const free = payload.transparency === "transparent" || payload.showAs === "free"
  const startAt = providerDateTime(payload.start)
  const endAt = providerDateTime(payload.end)
  const googleMeetingId = cleanText(object(object(payload.extendedProperties).private).multideckMeetingId, 60)
  const joinUrl = provider === "google" ? googleJoinUrl(payload) : cleanText(object(payload.onlineMeeting).joinUrl ?? payload.onlineMeetingUrl, 2_000)
  const meetingId = await reconcileOwnedMeeting(admin, providerId, googleMeetingId || null, startAt, endAt, cancelled, joinUrl)
  if (cancelled || free || !startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) {
    const { error } = await admin.from("CAL_ProviderEvents").update({ CALProviderEvent_IsCancelled: true, CALProviderEvent_UpdatedAt: new Date().toISOString() })
      .eq("CALProviderEvent_ConnectionID", connection.CALConnection_ID).eq("CALProviderEvent_ProviderID", providerId)
    if (error) throw error
    return
  }
  const isPrivate = payload.visibility === "private" || payload.sensitivity === "private" || payload.sensitivity === "confidential"
  const connectionEmail = cleanText(connection.CALConnection_Email, 320).toLowerCase()
  const providerAttendees = providerParticipants(payload, provider, connectionEmail)
  const ownerResponse = providerOwnerResponse(payload, provider, providerAttendees)
  const participants = isPrivate ? [] : providerAttendees
  const attendeeSyncAt = new Date().toISOString()
  const { error: eventError } = await admin.from("CAL_ProviderEvents").upsert({
    CALProviderEvent_CompanyID: connection.CALConnection_CompanyID,
    CALProviderEvent_OwnerUserID: connection.CALConnection_UserID,
    CALProviderEvent_ConnectionID: connection.CALConnection_ID,
    CALProviderEvent_MeetingID: meetingId,
    CALProviderEvent_ProviderID: providerId,
    CALProviderEvent_ICalUID: cleanText(payload.iCalUID ?? payload.iCalUId, 500) || null,
    CALProviderEvent_Title: isPrivate ? null : cleanText(payload.summary ?? payload.subject, 240) || "Busy",
    CALProviderEvent_StartAt: startAt,
    CALProviderEvent_EndAt: endAt,
    CALProviderEvent_IsPrivate: isPrivate,
    CALProviderEvent_IsCancelled: false,
    CALProviderEvent_AttendeesJSON: participants,
    CALProviderEvent_AttendeesSyncedAt: attendeeSyncAt,
    CALProviderEvent_ResponseCode: ownerResponse.response,
    CALProviderEvent_IsOrganiser: ownerResponse.isOrganiser,
    CALProviderEvent_JoinURL: joinUrl || null,
    CALProviderEvent_Revision: cleanText(payload.etag ?? payload.changeKey, 500) || null,
    CALProviderEvent_UpdatedAt: attendeeSyncAt,
  }, { onConflict: "CALProviderEvent_ConnectionID,CALProviderEvent_ProviderID" })
  if (eventError) throw eventError

  for (const participant of participants) {
    if (meetingId && participant.role !== "organiser") {
      const { error } = await admin.from("CAL_MeetingParticipants").update({ CALParticipant_ResponseCode: participant.response }).eq("CALParticipant_MeetingID", meetingId).ilike("CALParticipant_Email", participant.email)
      if (error) throw error
    }
  }
}

const PROVIDER_MIRROR_BATCH_SIZE = 20

/**
 * Provider list endpoints can return thousands of recurring instances. Mirror
 * a small bounded batch in parallel so a full cursor reset completes inside
 * the worker window without flooding Postgres with an unbounded Promise.all.
 */
async function mirrorProviderEvents(admin: SupabaseClient, connection: Record<string, unknown>, events: JsonObject[], provider: "google" | "microsoft") {
  for (let offset = 0; offset < events.length; offset += PROVIDER_MIRROR_BATCH_SIZE) {
    const batch = events.slice(offset, offset + PROVIDER_MIRROR_BATCH_SIZE)
    await Promise.all(batch.map((event) => mirrorProviderEvent(admin, connection, event, provider)))
  }
}

async function syncGoogle(admin: SupabaseClient, connection: Record<string, unknown>, token: string) {
  const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`
  const parameters = new URLSearchParams({ showDeleted: "true", singleEvents: "true", maxResults: "2500" })
  if (connection.CALConnection_SyncCursor) parameters.set("syncToken", String(connection.CALConnection_SyncCursor))
  else {
    parameters.set("timeMin", new Date(Date.now() - 90 * 86_400_000).toISOString())
    parameters.set("timeMax", new Date(Date.now() + 400 * 86_400_000).toISOString())
  }
  let url = `${base}?${parameters}`
  let nextSyncToken = ""
  for (let page = 0; page < 10 && url; page += 1) {
    const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (result.status === 410 && connection.CALConnection_SyncCursor) {
      connection.CALConnection_SyncCursor = null
      return await syncGoogle(admin, connection, token)
    }
    if (!result.ok) throw new HttpError(result.status === 401 ? 409 : 502, "Google Calendar sync could not be completed.")
    const payload = await result.json() as JsonObject
    await mirrorProviderEvents(admin, connection, Array.isArray(payload.items) ? payload.items.map(object) : [], "google")
    const nextPage = cleanText(payload.nextPageToken, 2_000)
    nextSyncToken = cleanText(payload.nextSyncToken, 8_000) || nextSyncToken
    if (nextPage) parameters.set("pageToken", nextPage)
    url = nextPage ? `${base}?${parameters}` : ""
  }
  if (url) throw new HttpError(502, "Google Calendar returned too many changes to complete this sync safely.")
  if (nextSyncToken) connection.CALConnection_SyncCursor = nextSyncToken
}

async function syncMicrosoft(admin: SupabaseClient, connection: Record<string, unknown>, token: string) {
  let url = cleanText(connection.CALConnection_SyncCursor, 20_000)
  if (!url) {
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const until = new Date(Date.now() + 400 * 86_400_000).toISOString()
    url = `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(until)}&$select=id,subject,start,end,showAs,isCancelled,sensitivity,changeKey,iCalUId,onlineMeeting,location,attendees,organizer,isOrganizer,responseStatus,responseRequested,transactionId`
  }
  let deltaLink = ""
  for (let page = 0; page < 10 && url; page += 1) {
    const result = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } })
    if (result.status === 410 && connection.CALConnection_SyncCursor) {
      connection.CALConnection_SyncCursor = null
      return await syncMicrosoft(admin, connection, token)
    }
    if (!result.ok) throw new HttpError(result.status === 401 ? 409 : 502, "Microsoft Calendar sync could not be completed.")
    const payload = await result.json() as JsonObject
    await mirrorProviderEvents(admin, connection, Array.isArray(payload.value) ? payload.value.map(object) : [], "microsoft")
    url = cleanText(payload["@odata.nextLink"], 20_000)
    deltaLink = cleanText(payload["@odata.deltaLink"], 20_000) || deltaLink
  }
  if (url) throw new HttpError(502, "Microsoft Calendar returned too many changes to complete this sync safely.")
  if (deltaLink) connection.CALConnection_SyncCursor = deltaLink
}

async function stopProviderSubscription(provider: string, token: string, subscriptionId: string, resourceId: string) {
  let result: Response
  if (provider === "google") {
    result = await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: subscriptionId, resourceId }),
    })
  } else {
    result = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
  }
  if (!result.ok && ![404, 410].includes(result.status)) {
    console.error("Calendar provider subscription cleanup failed", { provider, subscriptionId, status: result.status })
  }
}

async function ensureSubscription(admin: SupabaseClient, connection: Record<string, unknown>, token: string) {
  const provider = String(connection.CALConnection_ProviderCode)
  if (provider === "zoom") return
  const webhookUrl = Deno.env.get("CALENDAR_WEBHOOK_URL")?.trim()
  if (!webhookUrl || !/^https:\/\//.test(webhookUrl)) return
  const expiresAt = connection.CALConnection_SubscriptionExpiresAt ? Date.parse(String(connection.CALConnection_SubscriptionExpiresAt)) : 0
  if (expiresAt > Date.now() + 12 * 60 * 60_000) return
  const verificationSecret = randomToken(30)
  let subscriptionId = ""
  let resourceId = ""
  let expiration = ""
  if (provider === "google") {
    subscriptionId = crypto.randomUUID()
    const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
    const result = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/watch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: subscriptionId, type: "web_hook", address: `${webhookUrl}?provider=google`, token: verificationSecret, params: { ttl: "604800" } }),
    })
    if (!result.ok) throw new HttpError(result.status === 401 ? 409 : 502, "Google Calendar notifications could not be enabled.")
    const payload = await result.json() as JsonObject
    resourceId = cleanText(payload.resourceId, 500)
    expiration = new Date(Number(payload.expiration || Date.now() + 6 * 86_400_000)).toISOString()
  } else {
    const desiredExpiration = new Date(Date.now() + 3 * 86_400_000).toISOString()
    if (connection.CALConnection_SubscriptionID && connection.CALConnection_SubscriptionSecretRef) {
      const renewal = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(String(connection.CALConnection_SubscriptionID))}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expirationDateTime: desiredExpiration }),
      })
      if (renewal.ok) {
        const payload = await renewal.json() as JsonObject
        const { error } = await admin.from("CAL_ProviderConnections").update({ CALConnection_SubscriptionExpiresAt: cleanText(payload.expirationDateTime, 120) || desiredExpiration, CALConnection_UpdatedAt: new Date().toISOString() }).eq("CALConnection_ID", connection.CALConnection_ID)
        if (error) throw error
        return
      }
    }
    const result = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ changeType: "created,updated,deleted", notificationUrl: `${webhookUrl}?provider=microsoft`, resource: "me/events", expirationDateTime: desiredExpiration, clientState: verificationSecret }),
    })
    if (!result.ok) throw new HttpError(result.status === 401 ? 409 : 502, "Microsoft Calendar notifications could not be enabled.")
    const payload = await result.json() as JsonObject
    subscriptionId = cleanText(payload.id, 500)
    resourceId = cleanText(payload.resource, 500)
    expiration = cleanText(payload.expirationDateTime, 120) || desiredExpiration
  }
  if (!subscriptionId) throw new HttpError(502, "The provider did not return a calendar notification subscription.")
  let secretRef = ""
  try {
    secretRef = await putSecret(admin, `calendar-webhook-${provider}-${connection.CALConnection_ID}-${crypto.randomUUID()}`, verificationSecret)
    const previousSecret = connection.CALConnection_SubscriptionSecretRef
    const { error } = await admin.from("CAL_ProviderConnections").update({
      CALConnection_SubscriptionID: subscriptionId,
      CALConnection_SubscriptionResourceID: resourceId || null,
      CALConnection_SubscriptionSecretRef: secretRef,
      CALConnection_SubscriptionExpiresAt: expiration,
      CALConnection_UpdatedAt: new Date().toISOString(),
    }).eq("CALConnection_ID", connection.CALConnection_ID)
    if (error) throw error
    await deleteSecret(admin, previousSecret)
  } catch (error) {
    await stopProviderSubscription(provider, token, subscriptionId, resourceId)
    await deleteSecret(admin, secretRef)
    throw error
  }
}

async function syncConnection(admin: SupabaseClient, connection: Record<string, unknown>) {
  try {
    const token = await calendarProviderAccessToken(admin, connection)
    if (connection.CALConnection_ProviderCode === "google") await syncGoogle(admin, connection, token)
    if (connection.CALConnection_ProviderCode === "microsoft") await syncMicrosoft(admin, connection, token)
    await ensureSubscription(admin, connection, token)
    const { error: connectionUpdateError } = await admin.from("CAL_ProviderConnections").update({
      CALConnection_StatusCode: "connected",
      CALConnection_SyncCursor: connection.CALConnection_SyncCursor || null,
      CALConnection_LastSyncedAt: new Date().toISOString(),
      CALConnection_LastError: null,
      CALConnection_UpdatedAt: new Date().toISOString(),
    }).eq("CALConnection_ID", connection.CALConnection_ID)
    if (connectionUpdateError) throw connectionUpdateError
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Calendar sync failed."
    const attention = error instanceof HttpError && error.status === 409
    const { error: stateError } = await admin.from("CAL_ProviderConnections").update({ CALConnection_StatusCode: attention ? "attention" : "syncing", CALConnection_LastError: message, CALConnection_UpdatedAt: new Date().toISOString() }).eq("CALConnection_ID", connection.CALConnection_ID)
    if (stateError) console.error("Calendar connection state could not be recorded", { connectionId: connection.CALConnection_ID })
    if (attention) {
      const meetingProvider = connection.CALConnection_ProviderCode === "google" ? "google_meet" : connection.CALConnection_ProviderCode === "microsoft" ? "microsoft_teams" : "zoom"
      const { error: pauseError } = await admin.from("CAL_BookingLinks").update({ CALBookingLink_StatusCode: "paused", CALBookingLink_UpdatedAt: new Date().toISOString() })
        .eq("CALBookingLink_OwnerUserID", connection.CALConnection_UserID).eq("CALBookingLink_ProviderCode", meetingProvider).eq("CALBookingLink_StatusCode", "active")
      if (pauseError) console.error("Provider-dependent booking links could not be paused", { connectionId: connection.CALConnection_ID })
    }
    return false
  }
}

function providerCodeForMeeting(meeting: Record<string, unknown>) {
  return meeting.CALMeeting_ProviderCode === "google_meet" ? "google"
    : meeting.CALMeeting_ProviderCode === "microsoft_teams" ? "microsoft"
    : meeting.CALMeeting_ProviderCode === "zoom" ? "zoom" : null
}

async function loadMeetingState(admin: SupabaseClient, meetingId: string) {
  const { data: meeting, error: meetingError } = await admin.from("CAL_Meetings").select("*").eq("CALMeeting_ID", meetingId).maybeSingle()
  if (meetingError) throw meetingError
  if (!meeting) throw new HttpError(404, "The queued meeting no longer exists.")
  const [{ data: participants, error: participantsError }, { data: organiser, error: organiserError }] = await Promise.all([
    admin.from("CAL_MeetingParticipants").select("*").eq("CALParticipant_MeetingID", meetingId),
    admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email").eq("User_ID", meeting.CALMeeting_OrganiserUserID).maybeSingle(),
  ])
  if (participantsError) throw participantsError
  if (organiserError) throw organiserError
  if (!organiser) throw new HttpError(409, "The meeting organiser is no longer available.")
  return { meeting, participants: participants ?? [], organiser }
}

async function loadConnection(admin: SupabaseClient, meeting: Record<string, unknown>) {
  const provider = providerCodeForMeeting(meeting)
  if (!provider) return null
  const { data, error } = await admin.from("CAL_ProviderConnections").select("*")
    .eq("CALConnection_UserID", meeting.CALMeeting_OrganiserUserID).eq("CALConnection_ProviderCode", provider)
    .eq("CALConnection_StatusCode", "connected").maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(409, `${provider === "google" ? "Google Calendar" : provider === "microsoft" ? "Microsoft Calendar" : "Zoom"} needs to be reconnected.`)
  return data
}

async function deleteProviderMeeting(connection: Record<string, unknown>, token: string, providerEventId: string) {
  const id = encodeURIComponent(providerEventId)
  let response: Response
  if (connection.CALConnection_ProviderCode === "google") {
    const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
    response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${id}?sendUpdates=all`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
  } else if (connection.CALConnection_ProviderCode === "microsoft") {
    response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
  } else {
    response = await fetch(`https://api.zoom.us/v2/meetings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
  }
  return response.ok || [404, 410].includes(response.status)
}

async function persistProviderReference(
  admin: SupabaseClient,
  state: Awaited<ReturnType<typeof loadMeetingState>>,
  connection: Record<string, unknown>,
  token: string,
  providerEventId: string,
  revision: string | null,
  providerLabel: string,
) {
  const { error } = await admin.from("CAL_Meetings").update({
    CALMeeting_ProviderEventID: providerEventId,
    CALMeeting_ProviderRevision: revision,
  }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
  if (!error) return
  let compensated = false
  try {
    compensated = await deleteProviderMeeting(connection, token, providerEventId)
  } catch (cleanupError) {
    console.error("Calendar provider event cleanup threw after reference persistence failed", {
      meetingId: state.meeting.CALMeeting_ID,
      provider: connection.CALConnection_ProviderCode,
      error: cleanupError instanceof Error ? cleanupError.message : "unknown",
    })
  }
  if (!compensated) {
    console.error("Calendar provider event may require manual cleanup", { meetingId: state.meeting.CALMeeting_ID, provider: connection.CALConnection_ProviderCode, providerEventId })
  }
  throw new HttpError(503, `${providerLabel} created the event, but Multideck could not secure its provider reference${compensated ? "; the provider event was removed" : ""}.`)
}

async function createProviderMeeting(admin: SupabaseClient, state: Awaited<ReturnType<typeof loadMeetingState>>) {
  const connection = await loadConnection(admin, state.meeting)
  if (!connection) throw new HttpError(400, "This meeting does not use a connected provider.")
  const token = await calendarProviderAccessToken(admin, connection)
  const attendees = state.participants.map((participant) => ({ email: participant.CALParticipant_Email, name: participant.CALParticipant_Name }))
  let providerEventId = ""
  let joinUrl = ""
  let revision: string | null = null
  if (connection.CALConnection_ProviderCode === "google") {
    const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
    let payload: JsonObject
    providerEventId = cleanText(state.meeting.CALMeeting_ProviderEventID, 500)
    if (providerEventId) {
      const existing = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(providerEventId)}?conferenceDataVersion=1`, { headers: { Authorization: `Bearer ${token}` } })
      if (!existing.ok) throw new HttpError(existing.status === 401 ? 409 : 502, "Google Calendar could not finish creating the meeting.")
      payload = await existing.json() as JsonObject
    } else {
      const deterministicEventId = (await sha256(`multideck-google-event:${state.meeting.CALMeeting_ID}`)).slice(0, 32)
      const providerResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deterministicEventId,
          summary: state.meeting.CALMeeting_Title,
          description: state.meeting.CALMeeting_Agenda,
          location: state.meeting.CALMeeting_Location,
          start: { dateTime: state.meeting.CALMeeting_StartAt, timeZone: state.meeting.CALMeeting_TimeZone },
          end: { dateTime: state.meeting.CALMeeting_EndAt, timeZone: state.meeting.CALMeeting_TimeZone },
          attendees: attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
          conferenceData: { createRequest: { requestId: `multideck-${state.meeting.CALMeeting_ID}-${state.meeting.CALMeeting_EditVersion}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
          extendedProperties: { private: { multideckMeetingId: state.meeting.CALMeeting_ID } },
        }),
      })
      if (providerResponse.status === 409) {
        const existing = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${deterministicEventId}?conferenceDataVersion=1`, { headers: { Authorization: `Bearer ${token}` } })
        if (!existing.ok) throw new HttpError(existing.status === 401 ? 409 : 502, "Google Calendar could not recover the existing meeting.")
        payload = await existing.json() as JsonObject
      } else {
        if (!providerResponse.ok) throw new HttpError(providerResponse.status === 401 ? 409 : 502, "Google Calendar could not create the meeting.")
        payload = await providerResponse.json() as JsonObject
      }
      providerEventId = cleanText(payload.id, 500)
      if (providerEventId) {
        await persistProviderReference(admin, state, connection, token, providerEventId, cleanText(payload.etag, 500) || null, "Google Calendar")
      }
    }
    providerEventId = String(payload.id ?? "")
    joinUrl = googleJoinUrl(payload)
    for (let attempt = 0; providerEventId && !joinUrl && attempt < 5; attempt += 1) {
      await pause(700)
      const refreshed = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(providerEventId)}?conferenceDataVersion=1`, { headers: { Authorization: `Bearer ${token}` } })
      if (!refreshed.ok) break
      payload = await refreshed.json() as JsonObject
      joinUrl = googleJoinUrl(payload)
    }
    revision = String(payload.etag ?? "") || null
  } else if (connection.CALConnection_ProviderCode === "microsoft") {
    providerEventId = cleanText(state.meeting.CALMeeting_ProviderEventID, 500)
    let payload: JsonObject
    if (providerEventId) {
      const existing = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(providerEventId)}?$select=id,changeKey,onlineMeeting,onlineMeetingUrl`, { headers: { Authorization: `Bearer ${token}` } })
      if (!existing.ok) throw new HttpError(existing.status === 401 ? 409 : 502, "Microsoft Calendar could not finish creating the meeting.")
      payload = await existing.json() as JsonObject
    } else {
      const providerResponse = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: `outlook.timezone="${state.meeting.CALMeeting_TimeZone}"` },
        body: JSON.stringify({
          subject: state.meeting.CALMeeting_Title,
          body: { contentType: "text", content: state.meeting.CALMeeting_Agenda || "" },
          start: { dateTime: String(state.meeting.CALMeeting_StartAt).replace(/Z$/, ""), timeZone: "UTC" },
          end: { dateTime: String(state.meeting.CALMeeting_EndAt).replace(/Z$/, ""), timeZone: "UTC" },
          attendees: attendees.map((attendee) => ({ emailAddress: { address: attendee.email, name: attendee.name }, type: "required" })),
          isOnlineMeeting: true,
          onlineMeetingProvider: "teamsForBusiness",
          location: state.meeting.CALMeeting_Location ? { displayName: state.meeting.CALMeeting_Location } : undefined,
          transactionId: `multideck-${state.meeting.CALMeeting_ID}-${state.meeting.CALMeeting_EditVersion}`,
        }),
      })
      if (!providerResponse.ok) throw new HttpError(providerResponse.status === 401 ? 409 : 502, "Microsoft Calendar could not create the meeting.")
      payload = await providerResponse.json() as JsonObject
      providerEventId = cleanText(payload.id, 500)
      if (providerEventId) {
        await persistProviderReference(admin, state, connection, token, providerEventId, cleanText(payload.changeKey, 500) || null, "Microsoft Calendar")
      }
    }
    providerEventId = String(payload.id ?? "")
    joinUrl = String((payload.onlineMeeting as JsonObject | undefined)?.joinUrl ?? payload.onlineMeetingUrl ?? "")
    for (let attempt = 0; providerEventId && !joinUrl && attempt < 4; attempt += 1) {
      await pause(700)
      const refreshed = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(providerEventId)}?$select=id,changeKey,onlineMeeting,onlineMeetingUrl`, { headers: { Authorization: `Bearer ${token}` } })
      if (!refreshed.ok) break
      payload = await refreshed.json() as JsonObject
      joinUrl = cleanText(object(payload.onlineMeeting).joinUrl ?? payload.onlineMeetingUrl, 2_000)
    }
    revision = String(payload.changeKey ?? "") || null
  } else {
    providerEventId = cleanText(state.meeting.CALMeeting_ProviderEventID, 500)
    let payload: JsonObject
    if (providerEventId) {
      const existing = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(providerEventId)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!existing.ok) throw new HttpError(existing.status === 401 ? 409 : 502, "Zoom could not finish creating the meeting.")
      payload = await existing.json() as JsonObject
    } else {
      const duration = Math.max(1, Math.round((Date.parse(state.meeting.CALMeeting_EndAt) - Date.parse(state.meeting.CALMeeting_StartAt)) / 60_000))
      const providerResponse = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ topic: state.meeting.CALMeeting_Title, agenda: state.meeting.CALMeeting_Agenda, type: 2, start_time: zoomStartTime(String(state.meeting.CALMeeting_StartAt)), duration, timezone: state.meeting.CALMeeting_TimeZone, settings: { join_before_host: false, waiting_room: true } }),
      })
      if (!providerResponse.ok) throw new HttpError(providerResponse.status === 401 ? 409 : 502, "Zoom could not create the meeting.")
      payload = await providerResponse.json() as JsonObject
      providerEventId = zoomNumericReference(payload.id)
      if (providerEventId) {
        await persistProviderReference(admin, state, connection, token, providerEventId, cleanText(payload.uuid, 500) || null, "Zoom")
      }
    }
    providerEventId = String(payload.id ?? "")
    joinUrl = String(payload.join_url ?? "")
    revision = String(payload.uuid ?? "") || null
  }
  if (!providerEventId || !joinUrl) throw new HttpError(502, "The provider did not return complete joining details.")
  const { error: meetingUpdateError } = await admin.from("CAL_Meetings").update({
    CALMeeting_ProviderEventID: providerEventId,
    CALMeeting_ProviderRevision: revision,
    CALMeeting_JoinURL: joinUrl,
    CALMeeting_StatusCode: "confirmed",
    CALMeeting_PendingChangeJSON: null,
    CALMeeting_LastSyncError: null,
    CALMeeting_UpdatedAt: new Date().toISOString(),
  }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
  if (meetingUpdateError) throw meetingUpdateError
  const { error: providerEventError } = await admin.from("CAL_ProviderEvents").upsert({
    CALProviderEvent_CompanyID: state.meeting.CALMeeting_CompanyID,
    CALProviderEvent_OwnerUserID: state.meeting.CALMeeting_OrganiserUserID,
    CALProviderEvent_ConnectionID: connection.CALConnection_ID,
    CALProviderEvent_MeetingID: state.meeting.CALMeeting_ID,
    CALProviderEvent_ProviderID: providerEventId,
    CALProviderEvent_Title: state.meeting.CALMeeting_Title,
    CALProviderEvent_StartAt: state.meeting.CALMeeting_StartAt,
    CALProviderEvent_EndAt: state.meeting.CALMeeting_EndAt,
    CALProviderEvent_IsPrivate: false,
    CALProviderEvent_IsCancelled: false,
    CALProviderEvent_Revision: revision,
  }, { onConflict: "CALProviderEvent_ConnectionID,CALProviderEvent_ProviderID" })
  if (providerEventError) throw providerEventError
  return { providerEventId, joinUrl }
}

async function compensatePartialProviderMeeting(admin: SupabaseClient, meetingId: string) {
  try {
    const state = await loadMeetingState(admin, meetingId)
    const providerEventId = cleanText(state.meeting.CALMeeting_ProviderEventID, 500)
    if (!providerEventId) return true
    const connection = await loadConnection(admin, state.meeting)
    if (!connection) return false
    const token = await calendarProviderAccessToken(admin, connection)
    if (!await deleteProviderMeeting(connection, token, providerEventId)) return false
    const { error: cacheError } = await admin.from("CAL_ProviderEvents").delete().eq("CALProviderEvent_MeetingID", meetingId)
    if (cacheError) throw cacheError
    const { error: meetingError } = await admin.from("CAL_Meetings").update({ CALMeeting_ProviderEventID: null, CALMeeting_ProviderRevision: null, CALMeeting_JoinURL: null }).eq("CALMeeting_ID", meetingId)
    if (meetingError) throw meetingError
    return true
  } catch (error) {
    console.error("Calendar provider compensation failed", { meetingId, error: error instanceof Error ? error.message : "unknown" })
    return false
  }
}

async function updateProviderMeeting(admin: SupabaseClient, state: Awaited<ReturnType<typeof loadMeetingState>>, cancel: boolean) {
  const connection = await loadConnection(admin, state.meeting)
  if (!connection || !state.meeting.CALMeeting_ProviderEventID) throw new HttpError(409, "The provider event is not connected to this meeting.")
  const token = await calendarProviderAccessToken(admin, connection)
  const pending = state.meeting.CALMeeting_PendingChangeJSON as JsonObject | null
  const providerId = encodeURIComponent(String(state.meeting.CALMeeting_ProviderEventID))
  const nextStart = cleanText(pending?.startAt, 100) || String(state.meeting.CALMeeting_StartAt)
  const nextEnd = cleanText(pending?.endAt, 100) || String(state.meeting.CALMeeting_EndAt)
  const nextTitle = cleanText(pending?.title, 240) || String(state.meeting.CALMeeting_Title)
  const nextAgenda = pending && Object.prototype.hasOwnProperty.call(pending, "agenda") ? cleanText(pending.agenda, 10_000) || null : state.meeting.CALMeeting_Agenda
  const nextTimeZone = cleanText(pending?.timeZone, 100) || String(state.meeting.CALMeeting_TimeZone)
  const nextLocation = pending && Object.prototype.hasOwnProperty.call(pending, "location") ? cleanText(pending.location, 500) || null : state.meeting.CALMeeting_Location
  const nextReminders = Array.isArray(pending?.reminders) ? pending.reminders : state.meeting.CALMeeting_RemindersJSON
  const nextAllowReschedule = typeof pending?.allowAttendeeReschedule === "boolean" ? pending.allowAttendeeReschedule : state.meeting.CALMeeting_AllowAttendeeReschedule
  const pendingKind = cleanText(pending?.kind, 40)
  const changeRequestId = cleanText(pending?.changeRequestId, 60)
  const decidedBy = cleanText(pending?.decidedBy, 60)
  const oldStart = state.meeting.CALMeeting_StartAt
  const oldEnd = state.meeting.CALMeeting_EndAt
  const activeAttendees = state.participants.filter((participant) => participant.CALParticipant_ResponseCode !== "declined")
  if (!cancel) {
    const { error } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: nextStart, CALReservation_EndAt: nextEnd }).eq("CALReservation_ID", state.meeting.CALMeeting_ReservationID)
    if (error?.code === "23P01") throw new HttpError(409, "The requested time is no longer available.")
    if (error) throw new HttpError(500, "The requested time could not be reserved.")
  }
  try {
    let providerResponse: Response
    if (connection.CALConnection_ProviderCode === "google") {
      const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
      providerResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${providerId}?sendUpdates=all`, {
        method: cancel ? "DELETE" : "PATCH",
        headers: { Authorization: `Bearer ${token}`, ...(cancel ? {} : { "Content-Type": "application/json" }) },
        body: cancel ? undefined : JSON.stringify({ summary: nextTitle, description: nextAgenda, location: nextLocation, start: { dateTime: nextStart, timeZone: nextTimeZone }, end: { dateTime: nextEnd, timeZone: nextTimeZone }, attendees: activeAttendees.map((participant) => ({ email: participant.CALParticipant_Email, displayName: participant.CALParticipant_Name })) }),
      })
    } else if (connection.CALConnection_ProviderCode === "microsoft") {
      providerResponse = await fetch(`https://graph.microsoft.com/v1.0/me/events/${providerId}`, {
        method: cancel ? "DELETE" : "PATCH",
        headers: { Authorization: `Bearer ${token}`, ...(cancel ? {} : { "Content-Type": "application/json" }) },
        body: cancel ? undefined : JSON.stringify({ subject: nextTitle, body: { contentType: "text", content: nextAgenda || "" }, location: nextLocation ? { displayName: nextLocation } : { displayName: "" }, start: { dateTime: nextStart.replace(/Z$/, ""), timeZone: "UTC" }, end: { dateTime: nextEnd.replace(/Z$/, ""), timeZone: "UTC" }, attendees: activeAttendees.map((participant) => ({ emailAddress: { address: participant.CALParticipant_Email, name: participant.CALParticipant_Name }, type: participant.CALParticipant_RoleCode === "optional" ? "optional" : "required" })) }),
      })
    } else {
      providerResponse = await fetch(`https://api.zoom.us/v2/meetings/${providerId}`, {
        method: cancel ? "DELETE" : "PATCH",
        headers: { Authorization: `Bearer ${token}`, ...(cancel ? {} : { "Content-Type": "application/json" }) },
        body: cancel ? undefined : JSON.stringify({ topic: nextTitle, agenda: nextAgenda, start_time: zoomStartTime(nextStart), duration: Math.round((Date.parse(nextEnd) - Date.parse(nextStart)) / 60_000), timezone: nextTimeZone }),
      })
    }
    if (!providerResponse.ok && !(cancel && [404, 410].includes(providerResponse.status))) throw new HttpError(providerResponse.status === 401 ? 409 : 502, "The provider could not update the meeting.")
  } catch (error) {
    if (!cancel) {
      const { error: rollbackError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: oldStart, CALReservation_EndAt: oldEnd }).eq("CALReservation_ID", state.meeting.CALMeeting_ReservationID)
      if (rollbackError) console.error("Calendar reservation rollback failed after provider update failure", { meetingId: state.meeting.CALMeeting_ID })
    }
    throw error
  }
  if (cancel) {
    const { error: meetingError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "cancelled", CALMeeting_PendingChangeJSON: null, CALMeeting_LastSyncError: null, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
    if (meetingError) throw meetingError
    const { error: reservationError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", state.meeting.CALMeeting_ReservationID)
    if (reservationError) throw reservationError
    const { error: cacheError } = await admin.from("CAL_ProviderEvents").update({ CALProviderEvent_IsCancelled: true, CALProviderEvent_UpdatedAt: new Date().toISOString() }).eq("CALProviderEvent_MeetingID", state.meeting.CALMeeting_ID)
    if (cacheError) throw cacheError
  } else {
    const { error: meetingError } = await admin.from("CAL_Meetings").update({
      CALMeeting_Title: nextTitle, CALMeeting_Agenda: nextAgenda,
      CALMeeting_StartAt: nextStart, CALMeeting_EndAt: nextEnd, CALMeeting_TimeZone: nextTimeZone,
      CALMeeting_Location: nextLocation, CALMeeting_RemindersJSON: nextReminders,
      CALMeeting_AllowAttendeeReschedule: nextAllowReschedule,
      CALMeeting_StatusCode: "confirmed", CALMeeting_PendingChangeJSON: null,
      CALMeeting_LastSyncError: null, CALMeeting_UpdatedAt: new Date().toISOString(),
    }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
    if (meetingError) throw meetingError
    const { error: cacheError } = await admin.from("CAL_ProviderEvents").update({ CALProviderEvent_Title: nextTitle, CALProviderEvent_StartAt: nextStart, CALProviderEvent_EndAt: nextEnd, CALProviderEvent_UpdatedAt: new Date().toISOString() }).eq("CALProviderEvent_MeetingID", state.meeting.CALMeeting_ID)
    if (cacheError) throw cacheError
    if (changeRequestId) {
      const { error: changeError } = await admin.from("CAL_ChangeRequests").update({ CALChangeRequest_StatusCode: "accepted", CALChangeRequest_SelectedStartAt: nextStart, CALChangeRequest_SelectedEndAt: nextEnd, CALChangeRequest_DecidedBy: decidedBy || null, CALChangeRequest_DecidedAt: new Date().toISOString() }).eq("CALChangeRequest_ID", changeRequestId).eq("CALChangeRequest_StatusCode", "pending")
      if (changeError) throw changeError
    }
  }
  return { pendingKind }
}

const emailPresentation: Record<CalendarEmailTemplateKind, { title: string; eyebrow: string }> = {
  booking_verification: { title: "Verify your email", eyebrow: "Booking verification" },
  standalone_confirmation: { title: "Your meeting is confirmed", eyebrow: "Meeting confirmed" },
  management: { title: "Your meeting details", eyebrow: "Meeting confirmed" },
  rescheduled: { title: "Your meeting has moved", eyebrow: "Meeting updated" },
  cancelled: { title: "Your meeting has been cancelled", eyebrow: "Meeting cancelled" },
  reminder: { title: "Your meeting is coming up", eyebrow: "Meeting reminder" },
  group_reschedule_request: { title: "An attendee proposed new times", eyebrow: "Action required" },
  group_reschedule_outcome: { title: "The organiser responded", eyebrow: "Meeting update" },
}

async function ensureManagementToken(admin: SupabaseClient, participant: Record<string, unknown>, meeting: Record<string, unknown>, preferred?: string | null) {
  if (preferred) return preferred
  const { data: existing, error: existingError } = await admin.from("CAL_ManagementTokens")
    .select("CALManagementToken_SecretRef")
    .eq("CALManagementToken_ParticipantID", participant.CALParticipant_ID)
    .is("CALManagementToken_RevokedAt", null)
    .gt("CALManagementToken_ExpiresAt", new Date().toISOString())
    .order("CALManagementToken_CreatedAt", { ascending: false }).limit(1).maybeSingle()
  if (existingError) throw new HttpError(503, "The attendee management link could not be checked safely.")
  if (existing?.CALManagementToken_SecretRef) return await secretValue(admin, existing.CALManagementToken_SecretRef)

  const token = randomToken(36)
  const secretRef = await putSecret(admin, `meeting-management-${participant.CALParticipant_ID}`, token, "Encrypted Multideck attendee management token")
  const { error } = await admin.from("CAL_ManagementTokens").insert({
    CALManagementToken_CompanyID: meeting.CALMeeting_CompanyID,
    CALManagementToken_ParticipantID: participant.CALParticipant_ID,
    CALManagementToken_TokenHash: await sha256(token),
    CALManagementToken_SecretRef: secretRef,
    CALManagementToken_ExpiresAt: new Date(Date.parse(String(meeting.CALMeeting_EndAt)) + 30 * 86_400_000).toISOString(),
  })
  if (error) {
    await deleteSecret(admin, secretRef)
    throw new HttpError(500, "The attendee management link could not be secured.")
  }
  return token
}

async function sendEmail(to: string, subject: string, html: string, text: string, ics?: string, idempotencyKey?: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new HttpError(503, "Email delivery is not configured.")
  const payload: JsonObject = { from: MULTIDECK_EMAIL_FROM, reply_to: MULTIDECK_EMAIL_REPLY_TO, to: [to], subject, html, text }
  if (ics) payload.attachments = [{ filename: "meeting.ics", content: btoa(unescape(encodeURIComponent(ics))) }]
  const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body: JSON.stringify(payload) })
  if (!result.ok) throw new HttpError(502, "The meeting email provider did not accept this delivery.")
  return await result.json() as { id?: string }
}

async function deliverMeetingEmail(admin: SupabaseClient, delivery: Record<string, unknown>, state: Awaited<ReturnType<typeof loadMeetingState>>, kind: string) {
  const templateKind = kind as CalendarEmailTemplateKind
  const requester = delivery.CALDelivery_ParticipantID ? state.participants.find((item) => item.CALParticipant_ID === delivery.CALDelivery_ParticipantID) : null
  const participants = kind === "group_reschedule_request"
    ? [{ CALParticipant_ID: null, CALParticipant_Name: `${state.organiser.User_Firstname ?? ""} ${state.organiser.User_Lastname ?? ""}`.trim() || state.organiser.User_Email, CALParticipant_Email: state.organiser.User_Email }]
    : delivery.CALDelivery_ParticipantID ? state.participants.filter((item) => item.CALParticipant_ID === delivery.CALDelivery_ParticipantID) : state.participants
  const brand = await readConfiguredTenantBrand(admin, String(state.meeting.CALMeeting_CompanyID))
  const preferredToken = (delivery.CALDelivery_RenderedJSON as JsonObject | null)?.managementToken
  const origin = Deno.env.get("APP_URL")?.replace(/\/+$/, "") || "https://multideck.app"
  const template = await readCalendarEmailTemplate(admin, String(state.meeting.CALMeeting_CompanyID), templateKind)
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: String(state.meeting.CALMeeting_TimeZone) }).format(new Date(String(state.meeting.CALMeeting_StartAt)))
  const organiserName = `${state.organiser.User_Firstname ?? ""} ${state.organiser.User_Lastname ?? ""}`.trim() || state.organiser.User_Email
  const audit: Array<Record<string, unknown>> = []
  let providerId: string | null = null
  for (const participant of participants) {
    const token = kind === "group_reschedule_request" ? null : await ensureManagementToken(admin, participant, state.meeting, typeof preferredToken === "string" ? preferredToken : null)
    const manageUrl = token ? `${origin}/meetings/manage/${token}` : `${origin}/calendar?meeting=${state.meeting.CALMeeting_ID}`
    const copy = renderCalendarEmailTemplate(template, {
      meeting_title: String(state.meeting.CALMeeting_Title), meeting_date: date, organiser_name: organiserName,
      attendee_name: kind === "group_reschedule_request" ? String(requester?.CALParticipant_Name ?? "An attendee") : String(participant.CALParticipant_Name),
      manage_url: manageUrl, join_url: String(state.meeting.CALMeeting_JoinURL ?? ""), verification_code: "", workspace_name: brand?.displayName || "Multideck",
    })
    const presentation = emailPresentation[templateKind]
    const paragraphs = copy.body.split(/\n\n+/).filter(Boolean)
    const rendered = renderBrandedEmail({ subject: copy.subject, title: presentation.title, eyebrow: presentation.eyebrow, body: paragraphs, preview: paragraphs[0] || copy.subject, buttonLabel: state.meeting.CALMeeting_StatusCode === "cancelled" ? "View meeting" : kind === "group_reschedule_request" ? "Review request" : "Manage meeting", buttonUrl: manageUrl, brand })
    const standalone = ["multideck", "phone", "in_person", "zoom"].includes(String(state.meeting.CALMeeting_ProviderCode))
    const ics = standalone && kind !== "group_reschedule_request" ? meetingIcs({
      id: String(state.meeting.CALMeeting_ID), version: Number(state.meeting.CALMeeting_EditVersion), method: kind === "cancelled" ? "CANCEL" : "REQUEST",
      title: String(state.meeting.CALMeeting_Title), description: state.meeting.CALMeeting_Agenda as string | null,
      startAt: String(state.meeting.CALMeeting_StartAt), endAt: String(state.meeting.CALMeeting_EndAt), location: (state.meeting.CALMeeting_JoinURL || state.meeting.CALMeeting_Location) as string | null,
      organiserEmail: state.organiser.User_Email, organiserName: `${state.organiser.User_Firstname ?? ""} ${state.organiser.User_Lastname ?? ""}`.trim() || state.organiser.User_Email,
      attendees: state.participants.map((item) => ({ name: item.CALParticipant_Name, email: item.CALParticipant_Email })),
    }) : undefined
    const sent = await sendEmail(String(participant.CALParticipant_Email), copy.subject, rendered.html, rendered.text, ics, String(delivery.CALDelivery_IdempotencyKey))
    audit.push({ to: participant.CALParticipant_Email, subject: copy.subject, text: rendered.text })
    providerId = sent.id ?? providerId
  }
  delivery.CALDelivery_RenderedJSON = { ...object(delivery.CALDelivery_RenderedJSON), messages: audit }
  return providerId
}

async function linkBookingLead(admin: SupabaseClient, state: Awaited<ReturnType<typeof loadMeetingState>>) {
  if (!state.meeting.CALMeeting_BookingLinkID || state.meeting.CALMeeting_LeadID) return
  const participant = state.participants[0]
  if (!participant) return
  const { data: hold, error: holdError } = await admin.from("CAL_BookingHolds").select("*").eq("CALBookingHold_MeetingID", state.meeting.CALMeeting_ID).maybeSingle()
  if (holdError) throw holdError
  await linkBookingMeetingToCrm(admin, {
    meetingId: String(state.meeting.CALMeeting_ID),
    organiserUserId: String(state.meeting.CALMeeting_OrganiserUserID),
    bookingLinkId: String(state.meeting.CALMeeting_BookingLinkID),
    attendeeName: String(participant.CALParticipant_Name),
    attendeeEmail: String(participant.CALParticipant_Email),
    attendeePhone: hold?.CALBookingHold_Phone as string | null,
    companyEntered: hold?.CALBookingHold_CompanyName as string | null,
  })
}

async function enqueueParticipantEmails(admin: SupabaseClient, state: Awaited<ReturnType<typeof loadMeetingState>>, defaultKind: string, reason: string, outcomeParticipantId?: string | null, managementToken?: string | null) {
  if (!state.participants.length) return
  const rows = state.participants.map((participant) => {
    const kind = outcomeParticipantId && participant.CALParticipant_ID === outcomeParticipantId ? "group_reschedule_outcome" : defaultKind
    return {
      CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID,
      CALDelivery_MeetingID: state.meeting.CALMeeting_ID,
      CALDelivery_ParticipantID: participant.CALParticipant_ID,
      CALDelivery_KindCode: kind,
      CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:participant:${participant.CALParticipant_ID}:${reason}`,
      CALDelivery_RenderedJSON: managementToken && state.participants.length === 1 ? { managementToken } : null,
    }
  })
  const { error } = await admin.from("CAL_Deliveries").upsert(rows, { onConflict: "CALDelivery_IdempotencyKey", ignoreDuplicates: true })
  if (error) throw new HttpError(500, "Meeting communications could not be queued.")
}

type DeliveryResult = { providerId: string | null; cancelled?: boolean }

/**
 * Dexter approves an external-event change inside SQL, which cannot reach
 * Google or Microsoft. The action queues this delivery; the worker writes the
 * change to the provider and refreshes the mirror.
 */
async function processExternalEventDelivery(admin: SupabaseClient, delivery: Record<string, unknown>, cancel: boolean): Promise<DeliveryResult> {
  const rendered = object(delivery.CALDelivery_RenderedJSON)
  const providerEventId = cleanText(rendered.providerEventId, 60)
  if (!providerEventId) throw new HttpError(409, "The delivery has no provider event.")
  const { data: event, error } = await admin.from("CAL_ProviderEvents").select("*")
    .eq("CALProviderEvent_ID", providerEventId).eq("CALProviderEvent_CompanyID", delivery.CALDelivery_CompanyID).maybeSingle()
  if (error) throw error
  if (!event) throw new HttpError(404, "The provider event no longer exists.")
  if (event.CALProviderEvent_IsCancelled && !cancel) {
    const { error: cancelError } = await admin.from("CAL_Deliveries").update({ CALDelivery_StatusCode: "cancelled", CALDelivery_LeaseUntil: null, CALDelivery_CompletedAt: new Date().toISOString(), CALDelivery_LastError: null }).eq("CALDelivery_ID", delivery.CALDelivery_ID)
    if (cancelError) throw cancelError
    return { providerId: null, cancelled: true }
  }
  const change = normaliseExternalEventChange(event, {
    action: cancel ? "cancel" : "update",
    title: rendered.title === undefined || rendered.title === null ? undefined : rendered.title,
    startAt: rendered.startAt ?? undefined,
    endAt: rendered.endAt ?? undefined,
    timeZone: rendered.timeZone ?? undefined,
  })
  const { row } = await pushExternalEventChange(admin, event, change)
  return { providerId: String(row.CALProviderEvent_ProviderID) }
}

async function processExternalEventResponseDelivery(admin: SupabaseClient, delivery: Record<string, unknown>): Promise<DeliveryResult> {
  const rendered = object(delivery.CALDelivery_RenderedJSON)
  const providerEventId = cleanText(rendered.providerEventId, 60)
  if (!providerEventId) throw new HttpError(409, "The delivery has no provider event.")
  const { data: event, error } = await admin.from("CAL_ProviderEvents").select("*")
    .eq("CALProviderEvent_ID", providerEventId).eq("CALProviderEvent_CompanyID", delivery.CALDelivery_CompanyID).maybeSingle()
  if (error) throw error
  if (!event) throw new HttpError(404, "The provider event no longer exists.")
  const nextResponse = normaliseExternalEventResponse(rendered.response)
  const { row } = await pushExternalEventResponse(admin, event, nextResponse)
  return { providerId: String(row.CALProviderEvent_ProviderID) }
}

async function processDelivery(admin: SupabaseClient, delivery: Record<string, unknown>): Promise<DeliveryResult> {
  const kind = String(delivery.CALDelivery_KindCode)
  if (kind === "external_event_update" || kind === "external_event_cancel") return await processExternalEventDelivery(admin, delivery, kind === "external_event_cancel")
  if (kind === "external_event_rsvp") return await processExternalEventResponseDelivery(admin, delivery)
  if (!delivery.CALDelivery_MeetingID) throw new HttpError(409, "The delivery has no meeting.")
  let state = await loadMeetingState(admin, String(delivery.CALDelivery_MeetingID))
  if (kind === "reminder") {
    const scheduledVersion = Number(object(delivery.CALDelivery_RenderedJSON).meetingVersion)
    const reminderStateIsAuthoritative = state.meeting.CALMeeting_StatusCode === "confirmed"
      || (["sync_pending", "sync_failed"].includes(String(state.meeting.CALMeeting_StatusCode)) && Boolean(state.meeting.CALMeeting_ProviderEventID))
    if (!reminderStateIsAuthoritative || scheduledVersion !== Number(state.meeting.CALMeeting_EditVersion)) {
      const { error } = await admin.from("CAL_Deliveries").update({
        CALDelivery_StatusCode: "cancelled", CALDelivery_LeaseUntil: null,
        CALDelivery_CompletedAt: new Date().toISOString(), CALDelivery_LastError: null,
      }).eq("CALDelivery_ID", delivery.CALDelivery_ID)
      if (error) throw error
      return { providerId: null, cancelled: true }
    }
  }
  if (kind === "provider_create") {
    const { data: providerMirror, error: providerMirrorError } = await admin.from("CAL_ProviderEvents")
      .select("CALProviderEvent_ID").eq("CALProviderEvent_MeetingID", state.meeting.CALMeeting_ID).maybeSingle()
    if (providerMirrorError) throw providerMirrorError
    if (!state.meeting.CALMeeting_ProviderEventID || !state.meeting.CALMeeting_JoinURL || state.meeting.CALMeeting_StatusCode !== "confirmed" || !providerMirror) {
      await createProviderMeeting(admin, state)
    }
    state = await loadMeetingState(admin, String(delivery.CALDelivery_MeetingID))
    const { error: crmDeliveryError } = await admin.from("CAL_Deliveries").upsert({
      CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID,
      CALDelivery_MeetingID: state.meeting.CALMeeting_ID,
      CALDelivery_KindCode: "crm_link",
      CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:crm-link`,
    }, { onConflict: "CALDelivery_IdempotencyKey", ignoreDuplicates: true })
    if (crmDeliveryError) throw new HttpError(500, "The confirmed meeting could not queue its CRM follow-up.")
    await enqueueParticipantEmails(admin, state, "management", `management:v${state.meeting.CALMeeting_EditVersion}`, null, cleanText(object(delivery.CALDelivery_RenderedJSON).managementToken, 200))
    return { providerId: state.meeting.CALMeeting_ProviderEventID as string | null }
  }
  if (kind === "crm_link") {
    await linkBookingLead(admin, state)
    return { providerId: null }
  }
  if (kind === "provider_update") {
    const pending = object(state.meeting.CALMeeting_PendingChangeJSON)
    const pendingKind = cleanText(pending.kind, 40)
    const changeRequestId = cleanText(pending.changeRequestId, 80)
    const changeRequestResult = changeRequestId ? await admin.from("CAL_ChangeRequests").select("CALChangeRequest_ParticipantID").eq("CALChangeRequest_ID", changeRequestId).maybeSingle() : { data: null, error: null }
    if (changeRequestResult.error) throw changeRequestResult.error
    const changeRequest = changeRequestResult.data
    await updateProviderMeeting(admin, state, false)
    state = await loadMeetingState(admin, String(delivery.CALDelivery_MeetingID))
    if (pendingKind === "attendee_cancel") return { providerId: state.meeting.CALMeeting_ProviderEventID as string | null }
    await enqueueParticipantEmails(admin, state, "rescheduled", `rescheduled:v${state.meeting.CALMeeting_EditVersion}`, changeRequest?.CALChangeRequest_ParticipantID)
    return { providerId: state.meeting.CALMeeting_ProviderEventID as string | null }
  }
  if (kind === "provider_cancel") {
    await updateProviderMeeting(admin, state, true)
    state = await loadMeetingState(admin, String(delivery.CALDelivery_MeetingID))
    await enqueueParticipantEmails(admin, state, "cancelled", `cancelled:v${state.meeting.CALMeeting_EditVersion}`)
    return { providerId: state.meeting.CALMeeting_ProviderEventID as string | null }
  }
  return { providerId: await deliverMeetingEmail(admin, delivery, state, kind) }
}

async function recordFailure(admin: SupabaseClient, delivery: Record<string, unknown>, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "The delivery failed."
  const attempts = Number(delivery.CALDelivery_Attempts ?? 1)
  const retry = attempts < 3
  const { error: deliveryError } = await admin.from("CAL_Deliveries").update({
    CALDelivery_StatusCode: retry ? "pending" : "failed",
    CALDelivery_SendAfter: retry ? new Date(Date.now() + attempts * attempts * 60_000).toISOString() : delivery.CALDelivery_SendAfter,
    CALDelivery_LeaseUntil: null,
    CALDelivery_LastError: message,
  }).eq("CALDelivery_ID", delivery.CALDelivery_ID)
  if (deliveryError) throw deliveryError
  if (!delivery.CALDelivery_MeetingID) return
  const kind = String(delivery.CALDelivery_KindCode)
  if (["provider_create", "provider_update", "provider_cancel"].includes(kind)) {
    const { data: currentMeeting, error: currentMeetingError } = await admin.from("CAL_Meetings")
      .select("CALMeeting_StatusCode,CALMeeting_ProviderEventID,CALMeeting_JoinURL")
      .eq("CALMeeting_ID", delivery.CALDelivery_MeetingID).maybeSingle()
    if (currentMeetingError) throw currentMeetingError
    const providerCreationAlreadyConfirmed = kind === "provider_create"
      && currentMeeting?.CALMeeting_StatusCode === "confirmed"
      && Boolean(currentMeeting.CALMeeting_ProviderEventID)
      && Boolean(currentMeeting.CALMeeting_JoinURL)
    if (providerCreationAlreadyConfirmed) return
    const { error: meetingStateError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: retry ? (kind === "provider_create" ? "provisioning" : "sync_pending") : "sync_failed", CALMeeting_LastSyncError: message }).eq("CALMeeting_ID", delivery.CALDelivery_MeetingID)
    if (meetingStateError) throw meetingStateError
    if (!retry && kind === "provider_create") {
      const compensated = await compensatePartialProviderMeeting(admin, String(delivery.CALDelivery_MeetingID))
      const { data: meeting, error: meetingError } = await admin.from("CAL_Meetings").select("CALMeeting_ReservationID,CALMeeting_BookingLinkID").eq("CALMeeting_ID", delivery.CALDelivery_MeetingID).maybeSingle()
      if (meetingError) throw meetingError
      if (meeting?.CALMeeting_BookingLinkID) {
        const { error: pauseError } = await admin.from("CAL_BookingLinks").update({ CALBookingLink_StatusCode: "paused", CALBookingLink_UpdatedAt: new Date().toISOString() }).eq("CALBookingLink_ID", meeting.CALMeeting_BookingLinkID)
        if (pauseError) throw pauseError
      }
      if (compensated && meeting?.CALMeeting_ReservationID) {
        const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
        if (releaseError) throw releaseError
      } else if (!compensated) {
        const { error: cleanupStateError } = await admin.from("CAL_Meetings").update({
          CALMeeting_StatusCode: "sync_failed",
          CALMeeting_LastSyncError: `${message} Provider cleanup needs operator attention; the time remains reserved.`,
        }).eq("CALMeeting_ID", delivery.CALDelivery_MeetingID)
        if (cleanupStateError) throw cleanupStateError
      }
    }
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ detail: "Method not allowed." }, 405)
  const workerSecret = Deno.env.get("CALENDAR_WORKER_SECRET")
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null
  if (!secretsMatch(request.headers.get("x-multideck-calendar-worker"), workerSecret ?? null) && !secretsMatch(bearer, serviceRole ?? null)) {
    return response({ detail: "Worker authentication failed." }, 401)
  }
  try {
    const admin = adminClient()
    const { error: expireError } = await admin.rpc("multideck_calendar_expire_holds")
    if (expireError) throw expireError
    const { data: connectionRows, error: connectionsError } = await admin.from("CAL_ProviderConnections").select("*")
      .in("CALConnection_StatusCode", ["syncing", "connected"]).order("CALConnection_LastSyncedAt", { ascending: true, nullsFirst: true }).limit(10)
    if (connectionsError) throw connectionsError
    let synced = 0
    let syncFailed = 0
    for (const connection of connectionRows ?? []) {
      const due = !connection.CALConnection_LastSyncedAt || Date.parse(connection.CALConnection_LastSyncedAt) < Date.now() - 2 * 60_000
        || (connection.CALConnection_SubscriptionExpiresAt && Date.parse(connection.CALConnection_SubscriptionExpiresAt) < Date.now() + 12 * 60 * 60_000)
      if (!due && connection.CALConnection_StatusCode === "connected") continue
      if (await syncConnection(admin, connection)) synced += 1
      else syncFailed += 1
    }
    const { data: deliveries, error } = await admin.rpc("multideck_calendar_claim_deliveries", { p_limit: 20 })
    if (error) throw error
    let delivered = 0
    let failed = 0
    for (const delivery of deliveries ?? []) {
      try {
        const result = await processDelivery(admin, delivery)
        if (result.cancelled) continue
        const { error: deliveryUpdateError } = await admin.from("CAL_Deliveries").update({
          CALDelivery_StatusCode: "delivered", CALDelivery_LeaseUntil: null, CALDelivery_ProviderID: result.providerId,
          CALDelivery_RenderedJSON: { ...object(delivery.CALDelivery_RenderedJSON), delivered: true, kind: delivery.CALDelivery_KindCode }, CALDelivery_LastError: null, CALDelivery_CompletedAt: new Date().toISOString(),
        }).eq("CALDelivery_ID", delivery.CALDelivery_ID)
        if (deliveryUpdateError) throw deliveryUpdateError
        delivered += 1
      } catch (error) {
        await recordFailure(admin, delivery, error)
        failed += 1
      }
    }
    return response({ connections: (connectionRows ?? []).length, synced, syncFailed, claimed: (deliveries ?? []).length, delivered, failed })
  } catch (error) {
    console.error(error)
    return response({ detail: "The Calendar worker could not complete its run." }, 500)
  }
})
