import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { HttpError } from "./backend.ts"
import { calendarProviderAccessToken } from "./calendar-provider-auth.ts"
import { cleanText, type BusyRange } from "./calendar.ts"

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function providerDateTime(value: unknown) {
  const row = object(value)
  const dateTime = cleanText(row.dateTime, 120)
  if (dateTime) {
    const parsed = new Date(/(?:z|[+-]\d\d:\d\d)$/i.test(dateTime) ? dateTime : `${dateTime}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const date = cleanText(row.date, 20)
  if (!date) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function markConnectionFailure(admin: SupabaseClient, connection: Record<string, unknown>, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Connected-calendar availability could not be checked."
  const attention = error instanceof HttpError && error.status === 409
  const { error: connectionError } = await admin.from("CAL_ProviderConnections").update({
    CALConnection_StatusCode: attention ? "attention" : "syncing",
    CALConnection_LastError: message,
    CALConnection_UpdatedAt: new Date().toISOString(),
  }).eq("CALConnection_ID", connection.CALConnection_ID)
  if (connectionError) throw new HttpError(503, "The calendar connection failure could not be recorded safely.")
  if (attention) {
    const meetingProvider = connection.CALConnection_ProviderCode === "google" ? "google_meet" : "microsoft_teams"
    const { error: pauseError } = await admin.from("CAL_BookingLinks").update({ CALBookingLink_StatusCode: "paused", CALBookingLink_UpdatedAt: new Date().toISOString() })
      .eq("CALBookingLink_OwnerUserID", connection.CALConnection_UserID)
      .eq("CALBookingLink_ProviderCode", meetingProvider)
      .eq("CALBookingLink_StatusCode", "active")
    if (pauseError) throw new HttpError(503, "Booking links using the unhealthy calendar could not be paused safely.")
  }
}

async function excludedProviderId(admin: SupabaseClient, connectionId: string, meetingId?: string | null) {
  if (!meetingId) return ""
  const { data, error } = await admin.from("CAL_ProviderEvents").select("CALProviderEvent_ProviderID")
    .eq("CALProviderEvent_ConnectionID", connectionId).eq("CALProviderEvent_MeetingID", meetingId).maybeSingle()
  if (error) throw new HttpError(503, "The existing provider meeting could not be excluded from availability.")
  return cleanText(data?.CALProviderEvent_ProviderID, 500)
}

async function googleBusyRanges(connection: Record<string, unknown>, token: string, from: Date, until: Date, excludedId: string) {
  const calendarId = encodeURIComponent(String(connection.CALConnection_CalendarID || "primary"))
  const parameters = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "250",
    fields: "items(id,status,transparency,start,end),nextPageToken",
  })
  const busy: BusyRange[] = []
  let nextPageToken = ""
  for (let page = 0; page < 4; page += 1) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${parameters}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 409 : 502, "Google Calendar availability could not be checked.")
    const payload = await response.json() as JsonObject
    for (const event of Array.isArray(payload.items) ? payload.items.map(object) : []) {
      if (event.status === "cancelled" || event.transparency === "transparent" || cleanText(event.id, 500) === excludedId) continue
      const startAt = providerDateTime(event.start)
      const endAt = providerDateTime(event.end)
      if (startAt && endAt && Date.parse(endAt) > Date.parse(startAt)) busy.push({ startAt, endAt })
    }
    nextPageToken = cleanText(payload.nextPageToken, 2_000)
    if (!nextPageToken) break
    parameters.set("pageToken", nextPageToken)
  }
  if (nextPageToken) throw new HttpError(503, "Google Calendar has too many events in this range to calculate availability safely.")
  return busy
}

async function microsoftBusyRanges(token: string, from: Date, until: Date, excludedId: string) {
  let url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(from.toISOString())}&endDateTime=${encodeURIComponent(until.toISOString())}&$select=id,start,end,showAs,isCancelled&$top=250`
  const busy: BusyRange[] = []
  for (let page = 0; page < 4 && url; page += 1) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } })
    if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 409 : 502, "Microsoft Calendar availability could not be checked.")
    const payload = await response.json() as JsonObject
    for (const event of Array.isArray(payload.value) ? payload.value.map(object) : []) {
      if (event.isCancelled === true || event.showAs === "free" || cleanText(event.id, 500) === excludedId) continue
      const startAt = providerDateTime(event.start)
      const endAt = providerDateTime(event.end)
      if (startAt && endAt && Date.parse(endAt) > Date.parse(startAt)) busy.push({ startAt, endAt })
    }
    url = cleanText(payload["@odata.nextLink"], 20_000)
  }
  if (url) throw new HttpError(503, "Microsoft Calendar has too many events in this range to calculate availability safely.")
  return busy
}

export async function providerBusyRanges(admin: SupabaseClient, organiserUserId: string, from: Date, until: Date, excludedMeetingId?: string | null) {
  const { data: connections, error } = await admin.from("CAL_ProviderConnections").select("CALConnection_ID,CALConnection_UserID,CALConnection_ProviderCode,CALConnection_StatusCode,CALConnection_SecretRef,CALConnection_CalendarID")
    .eq("CALConnection_UserID", organiserUserId).in("CALConnection_ProviderCode", ["google", "microsoft"]).neq("CALConnection_StatusCode", "disconnected")
  if (error) throw new HttpError(503, "Connected-calendar availability could not be checked.")
  if (!connections?.length) return [] as BusyRange[]
  const combined: BusyRange[] = []
  for (const connection of connections) {
    if (connection.CALConnection_StatusCode === "attention") throw new HttpError(503, "One of the organiser's calendar connections needs attention. No booking was confirmed.")
    try {
      const token = await calendarProviderAccessToken(admin, connection)
      const excludedId = await excludedProviderId(admin, connection.CALConnection_ID, excludedMeetingId)
      const ranges = connection.CALConnection_ProviderCode === "google"
        ? await googleBusyRanges(connection, token, from, until, excludedId)
        : await microsoftBusyRanges(token, from, until, excludedId)
      combined.push(...ranges)
      const { error: healthyError } = await admin.from("CAL_ProviderConnections").update({ CALConnection_StatusCode: "connected", CALConnection_LastError: null, CALConnection_UpdatedAt: new Date().toISOString() }).eq("CALConnection_ID", connection.CALConnection_ID)
      if (healthyError) throw new HttpError(503, "The calendar connection health could not be confirmed.")
    } catch (error) {
      await markConnectionFailure(admin, connection, error)
      throw new HttpError(503, "Connected-calendar availability could not be checked. No meeting change was confirmed.")
    }
  }
  const unique = new Map(combined.map((range) => [`${range.startAt}:${range.endAt}`, range]))
  return [...unique.values()].sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
}
