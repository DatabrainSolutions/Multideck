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

export type NormalisedExternalEventChange = {
  cancel: boolean
  title: string | null
  startAt: string | null
  endAt: string | null
  timeZone: string
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
    .eq("CALConnection_ID", event.CALProviderEvent_ConnectionID).eq("CALConnection_StatusCode", "connected").maybeSingle()
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
