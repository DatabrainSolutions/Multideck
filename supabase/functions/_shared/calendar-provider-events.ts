import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { HttpError } from "./backend.ts"
import { calendarProviderAccessToken } from "./calendar-provider-auth.ts"
import { cleanText, parseMeetingRange, parseTimeZone } from "./calendar.ts"

type JsonObject = Record<string, unknown>

/** A change an operator (or Dexter) wants written back to a mirrored Google or Microsoft event. */
export type ExternalEventChange = {
  title?: unknown
  startAt?: unknown
  endAt?: unknown
  timeZone?: unknown
  action?: unknown
}

export type ExternalEventResponse = "accepted" | "tentative" | "declined"

export type NormalisedExternalEventChange = {
  cancel: boolean
  title: string | null
  startAt: string | null
  endAt: string | null
  timeZone: string
}

const EXTERNAL_EVENT_RESPONSES = new Set<ExternalEventResponse>(["accepted", "tentative", "declined"])
const STORED_EXTERNAL_EVENT_RESPONSES = new Set(["needs_action", ...EXTERNAL_EVENT_RESPONSES])

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

export function normaliseExternalEventResponse(value: unknown): ExternalEventResponse {
  const response = cleanText(value, 20) as ExternalEventResponse
  if (!EXTERNAL_EVENT_RESPONSES.has(response)) throw new HttpError(400, "Choose Yes, Maybe or No for this invitation.")
  return response
}

export function externalSourceLabel(provider: unknown) {
  return provider === "google" ? "Google Calendar" : provider === "microsoft" ? "Microsoft Calendar" : "the connected calendar"
}

/**
 * Validate a requested change against the mirrored row. Private events keep
 * their provider title: Multideck never learned it, so it must not overwrite it.
 */
export function normaliseExternalEventChange(event: JsonObject, change: ExternalEventChange): NormalisedExternalEventChange {
  const cancel = change.action === "cancel"
  const timeZone = change.timeZone === undefined ? "UTC" : parseTimeZone(change.timeZone)
  if (cancel) return { cancel, title: null, startAt: null, endAt: null, timeZone }
  const title = change.title === undefined ? null : cleanText(change.title, 240)
  if (change.title !== undefined && event.CALProviderEvent_IsPrivate === true) throw new HttpError(400, "Private provider events keep their title. You can still move or delete them.")
  if (change.title !== undefined && !title) throw new HttpError(400, "Event title is required.")
  const movesTime = change.startAt !== undefined || change.endAt !== undefined
  let startAt: string | null = null
  let endAt: string | null = null
  if (movesTime) {
    const range = parseMeetingRange(change.startAt ?? event.CALProviderEvent_StartAt, change.endAt ?? event.CALProviderEvent_EndAt)
    startAt = range.start.toISOString()
    endAt = range.end.toISOString()
  }
  if (!title && !movesTime) throw new HttpError(400, "Nothing to change on this event.")
  return { cancel, title, startAt, endAt, timeZone }
}

async function loadEventConnection(admin: SupabaseClient, event: JsonObject) {
  const { data, error } = await admin.from("CAL_ProviderConnections").select("*")
    .eq("CALConnection_ID", event.CALProviderEvent_ConnectionID)
    .eq("CALConnection_CompanyID", event.CALProviderEvent_CompanyID)
    .eq("CALConnection_UserID", event.CALProviderEvent_OwnerUserID)
    // A webhook queues a cache refresh as "syncing"; credentials are still
    // checked by calendarProviderAccessToken and the provider on every write.
    .in("CALConnection_StatusCode", ["connected", "syncing"]).maybeSingle()
  if (error) throw new HttpError(500, "The calendar connection could not be checked.")
  if (!data) throw new HttpError(409, "Reconnect the calendar this event came from before changing it.")
  if (data.CALConnection_ProviderCode !== "google" && data.CALConnection_ProviderCode !== "microsoft") throw new HttpError(400, "Only Google and Microsoft calendar events can be edited here.")
  return data as JsonObject
}

/**
 * Write a change to the provider first, then refresh the mirror only when the
 * provider accepted it. Returns the updated CAL_ProviderEvents row.
 */
export async function pushExternalEventChange(admin: SupabaseClient, event: JsonObject, change: NormalisedExternalEventChange) {
  if (event.CALProviderEvent_MeetingID) throw new HttpError(409, "This event is a Multideck meeting. Change it from the meeting instead.")
  if (event.CALProviderEvent_IsCancelled === true && !change.cancel) throw new HttpError(409, "This event was already removed from the provider.")
  const connection = await loadEventConnection(admin, event)
  const provider = connection.CALConnection_ProviderCode as "google" | "microsoft"
  const token = await calendarProviderAccessToken(admin, connection)
  const providerId = encodeURIComponent(String(event.CALProviderEvent_ProviderID))
  const label = externalSourceLabel(provider)
  let response: Response
  if (provider === "google") {
    const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
    const body: JsonObject = {}
    if (change.title) body.summary = change.title
    if (change.startAt && change.endAt) {
      body.start = { dateTime: change.startAt, timeZone: change.timeZone }
      body.end = { dateTime: change.endAt, timeZone: change.timeZone }
    }
    response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${providerId}?sendUpdates=all`, {
      method: change.cancel ? "DELETE" : "PATCH",
      headers: { Authorization: `Bearer ${token}`, ...(change.cancel ? {} : { "Content-Type": "application/json" }) },
      body: change.cancel ? undefined : JSON.stringify(body),
    })
  } else {
    const body: JsonObject = {}
    if (change.title) body.subject = change.title
    if (change.startAt && change.endAt) {
      body.start = { dateTime: change.startAt.replace(/Z$/, ""), timeZone: "UTC" }
      body.end = { dateTime: change.endAt.replace(/Z$/, ""), timeZone: "UTC" }
    }
    response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${providerId}`, {
      method: change.cancel ? "DELETE" : "PATCH",
      headers: { Authorization: `Bearer ${token}`, ...(change.cancel ? {} : { "Content-Type": "application/json" }) },
      body: change.cancel ? undefined : JSON.stringify(body),
    })
  }
  const alreadyGone = change.cancel && [404, 410].includes(response.status)
  if (!response.ok && !alreadyGone) {
    if (response.status === 401) throw new HttpError(409, `${label} needs to be reconnected.`)
    if (response.status === 403) throw new HttpError(403, `${label} did not allow this change. You may only have read access to that calendar.`)
    if (response.status === 404 || response.status === 410) throw new HttpError(409, `${label} no longer has this event.`)
    throw new HttpError(502, `${label} could not save this change.`)
  }
  const payload = change.cancel || !response.ok ? {} : await response.json().catch(() => ({})) as JsonObject
  const updates: JsonObject = { CALProviderEvent_UpdatedAt: new Date().toISOString() }
  if (change.cancel) updates.CALProviderEvent_IsCancelled = true
  else {
    if (change.title) updates.CALProviderEvent_Title = change.title
    if (change.startAt && change.endAt) {
      updates.CALProviderEvent_StartAt = change.startAt
      updates.CALProviderEvent_EndAt = change.endAt
    }
    const revision = cleanText(payload.etag ?? payload.changeKey, 500)
    if (revision) updates.CALProviderEvent_Revision = revision
  }
  const { data, error } = await admin.from("CAL_ProviderEvents").update(updates).eq("CALProviderEvent_ID", event.CALProviderEvent_ID).select("*").single()
  if (error || !data) throw new HttpError(500, `${label} accepted the change but the Multideck mirror could not be refreshed. It will correct itself on the next sync.`)
  return { row: data as JsonObject, provider }
}

function providerResponseStatus(response: ExternalEventResponse) {
  return response === "accepted" ? "accepted" : response === "tentative" ? "tentative" : "declined"
}

function updatedStoredAttendees(value: unknown, connectionEmail: string, response: ExternalEventResponse) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).map((candidate) => {
    const attendee = object(candidate)
    const email = cleanText(attendee.email, 320).toLowerCase()
    return attendee.self === true || (connectionEmail && email === connectionEmail)
      ? { ...attendee, response }
      : attendee
  })
}

/**
 * Respond to an invitation as the connected calendar owner. The provider is
 * authoritative: Multideck updates its mirror only after Google or Microsoft
 * accepts the response request.
 */
export async function pushExternalEventResponse(admin: SupabaseClient, event: JsonObject, nextResponse: ExternalEventResponse) {
  if (event.CALProviderEvent_IsCancelled === true) throw new HttpError(409, "This invitation was already removed from the provider.")
  if (event.CALProviderEvent_IsOrganiser === true) throw new HttpError(409, "You organised this event, so there is no invitation to answer.")
  if (!STORED_EXTERNAL_EVENT_RESPONSES.has(String(event.CALProviderEvent_ResponseCode))) throw new HttpError(409, "The provider has not identified this event as an invitation you can answer.")

  const connection = await loadEventConnection(admin, event)
  const provider = connection.CALConnection_ProviderCode as "google" | "microsoft"
  if (event.CALProviderEvent_ResponseCode === nextResponse) return { row: event, provider }

  const token = await calendarProviderAccessToken(admin, connection)
  const providerId = encodeURIComponent(String(event.CALProviderEvent_ProviderID))
  const label = externalSourceLabel(provider)
  const connectionEmail = cleanText(connection.CALConnection_Email, 320).toLowerCase()
  let response: Response

  if (provider === "google") {
    const attendees = Array.isArray(event.CALProviderEvent_AttendeesJSON) ? event.CALProviderEvent_AttendeesJSON.map(object) : []
    const self = attendees.find((attendee) => attendee.self === true)
      ?? attendees.find((attendee) => cleanText(attendee.email, 320).toLowerCase() === connectionEmail)
    const email = cleanText(self?.email, 320).toLowerCase() || connectionEmail
    if (!email.includes("@")) throw new HttpError(409, "Reconnect Google Calendar so Multideck can identify your invitation.")
    const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
    response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${providerId}?sendUpdates=all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ attendeesOmitted: true, attendees: [{ email, responseStatus: providerResponseStatus(nextResponse) }] }),
    })
  } else {
    const action = nextResponse === "accepted" ? "accept" : nextResponse === "tentative" ? "tentativelyAccept" : "decline"
    response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${providerId}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sendResponse: true }),
    })
  }

  if (!response.ok) {
    if (response.status === 401) throw new HttpError(409, `${label} needs to be reconnected.`)
    if (response.status === 403) throw new HttpError(403, `${label} did not allow this response. The invitation may belong to another account.`)
    if (response.status === 404 || response.status === 410) throw new HttpError(409, `${label} no longer has this invitation.`)
    throw new HttpError(502, `${label} could not save your response.`)
  }

  const updatedAt = new Date().toISOString()
  const updates: JsonObject = {
    CALProviderEvent_ResponseCode: nextResponse,
    CALProviderEvent_AttendeesJSON: updatedStoredAttendees(event.CALProviderEvent_AttendeesJSON, connectionEmail, nextResponse),
    CALProviderEvent_UpdatedAt: updatedAt,
  }
  const { data, error } = await admin.from("CAL_ProviderEvents").update(updates)
    .eq("CALProviderEvent_ID", event.CALProviderEvent_ID).select("*").single()
  if (error || !data) throw new HttpError(500, `${label} accepted your response but the Multideck mirror could not be refreshed. It will correct itself on the next sync.`)
  return { row: data as JsonObject, provider }
}
