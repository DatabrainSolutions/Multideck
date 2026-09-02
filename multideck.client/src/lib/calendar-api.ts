import { edgeFetch } from "@/lib/api"
import { getSupabaseSession, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"
import type { PublicBranding } from "@/lib/public-brand-theme"

export type CalendarProvider = "multideck" | "google_meet" | "microsoft_teams" | "zoom" | "phone" | "in_person"
export type MeetingStatus = "provisioning" | "confirmed" | "sync_pending" | "sync_failed" | "cancelled" | "completed"
export type MeetingColour = "teal" | "amber" | "blue" | "violet" | "rose" | "red" | "cyan" | "neutral"

export type MeetingParticipant = {
  id?: string
  name: string
  email: string
  role?: "organiser" | "attendee" | "optional"
  response?: "needs_action" | "accepted" | "tentative" | "declined"
  external?: boolean
  optional?: boolean
}

/** One attendee suggestion from the tenant directory, CRM contacts or leads. */
export type MeetingPersonSuggestion = {
  id: string
  kind: "team" | "contact" | "lead"
  name: string
  email: string
  detail: string | null
  recordId: string
  external: boolean
}

export type MeetingChangeRequest = {
  id: string
  participantId: string
  participantName: string
  proposedTimes: Array<{ startAt: string; endAt: string }>
  status: "pending" | "accepted" | "declined" | "withdrawn"
  selectedStartAt?: string | null
  selectedEndAt?: string | null
  createdAt: string
}

export type CalendarEvent = {
  id: string
  title: string
  agenda?: string | null
  startAt: string
  endAt: string
  timeZone?: string
  status: MeetingStatus | "confirmed"
  provider: CalendarProvider | "calendar"
  calendarSource?: "google" | "microsoft" | null
  colour?: MeetingColour
  location?: string | null
  joinUrl?: string | null
  linkedRecord?: { type: "lead" | "account" | "job"; id: string } | null
  bookingLinkId?: string | null
  allowAttendeeReschedule?: boolean
  reminders?: number[]
  source?: string
  version?: number
  pendingChange?: { kind: string; startAt?: string; endAt?: string } | null
  syncError?: string | null
  organiserUserId?: string
  canEdit: boolean
  private?: boolean
  participants?: MeetingParticipant[]
  changeRequests?: MeetingChangeRequest[]
}

export type CalendarRibbon = {
  id: string
  kind: "task" | "crm_follow_up" | "quote_follow_up" | "collection" | "departure" | "arrival" | "delivery" | "warehouse"
  title: string
  at: string
  route: string
  tone: "neutral" | "amber" | "violet" | "sky" | "green" | "teal" | "orange"
}

export type CalendarAvailabilityPreferences = {
  timeZone: string
  workingHours: Record<string, Array<[string, string]>>
  exceptions: Array<{ date: string; unavailable?: boolean; ranges?: Array<[string, string]> }>
  minimumNoticeMinutes: number
  bookingHorizonDays: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  slotIncrementMinutes: number
}

export type CalendarConnection = {
  id: string
  provider: "google" | "microsoft" | "zoom"
  primaryCalendar: boolean
  status: "connected" | "syncing" | "attention" | "disconnected"
  displayName: string | null
  email: string | null
  lastSyncedAt: string | null
  subscriptionExpiresAt: string | null
  error: string | null
  colour: MeetingColour
}

export type BookingQuestion = { id: string; label: string; required?: boolean; type?: "short_text" | "long_text"; builtIn?: boolean }

export type MeetingEmailTemplateKind = "booking_verification" | "management" | "standalone_confirmation" | "reminder" | "rescheduled" | "cancelled" | "group_reschedule_request" | "group_reschedule_outcome"

export type MeetingEmailTemplate = {
  kind: MeetingEmailTemplateKind
  name: string
  description: string
  subject: string
  body: string
  custom: boolean
  version: number
  updatedAt: string | null
}

export const meetingEmailTemplateVariables = ["meeting_title", "meeting_date", "organiser_name", "attendee_name", "manage_url", "join_url", "verification_code", "workspace_name"] as const

export type BookingLink = {
  id: string
  organiserSlug: string
  slug: string
  title: string
  description: string | null
  durationMinutes: number
  provider: CalendarProvider
  location: string | null
  status: "active" | "paused" | "archived"
  availability: CalendarAvailabilityPreferences["workingHours"] | null
  minimumNoticeMinutes: number | null
  bookingHorizonDays: number | null
  bufferBeforeMinutes: number | null
  bufferAfterMinutes: number | null
  questions: BookingQuestion[]
  rescheduleCutoffMinutes: number
  cancellationCutoffMinutes: number
  path: string
  updatedAt: string
}

export type CalendarWorkspace = {
  range: { start: string; end: string }
  timeZone: string
  meetings: CalendarEvent[]
  externalEvents: CalendarEvent[]
  ribbons: CalendarRibbon[]
  availability: CalendarAvailabilityPreferences
  connections: CalendarConnection[]
  bookingLinks: BookingLink[]
  permissions: string[]
  localPreview?: boolean
}

export type MeetingDraft = {
  title: string
  agenda?: string | null
  startAt: string
  endAt: string
  timeZone: string
  provider: CalendarProvider
  colour: MeetingColour
  location?: string | null
  leadId?: string | null
  accountId?: string | null
  jobId?: string | null
  allowAttendeeReschedule?: boolean
  reminders?: number[]
  attendees: MeetingParticipant[]
}

export type PublicBooking = {
  title: string
  description: string | null
  durationMinutes: number
  provider: CalendarProvider
  location: string | null
  organiser: { name: string }
  questions: BookingQuestion[]
  status: string
  branding: PublicBranding | null
  workspaceName: string
  localPreview?: boolean
}

export type ManagedMeeting = {
  meeting: CalendarEvent & { attendeeCount: number }
  participant: { id: string; name: string; response: MeetingParticipant["response"] }
  permissions: {
    canReschedule: boolean
    canCancel: boolean
    rescheduleCutoffMinutes: number
    cancellationCutoffMinutes: number
  }
  bookingPath: string | null
  branding: PublicBranding | null
  workspaceName: string
  localPreview?: boolean
}

export type BookingHold = {
  holdId: string
  expiresAt: string
  email: string
  verificationRequired: boolean
  previewCode?: string
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

export function downloadMeetingCalendarFile(meeting: Pick<CalendarEvent, "id" | "title" | "agenda" | "startAt" | "endAt" | "location" | "joinUrl">) {
  const date = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  const location = meeting.location || meeting.joinUrl || ""
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Multideck//Meetings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${escapeCalendarText(meeting.id)}@multideck.app`, `DTSTAMP:${date(new Date().toISOString())}`,
    `DTSTART:${date(meeting.startAt)}`, `DTEND:${date(meeting.endAt)}`, `SUMMARY:${escapeCalendarText(meeting.title)}`,
    meeting.agenda ? `DESCRIPTION:${escapeCalendarText(meeting.agenda)}` : "",
    location ? `LOCATION:${escapeCalendarText(location)}` : "",
    meeting.joinUrl ? `URL:${meeting.joinUrl}` : "",
    "END:VEVENT", "END:VCALENDAR", "",
  ].filter(Boolean).join("\r\n")
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }))
  link.download = "meeting.ics"
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

async function sessionToken() {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to use Calendar.")
  return session.access_token
}

async function apiJson<T>(responsePromise: Promise<Response>, fallback: string) {
  const response = await responsePromise
  if (response.ok) return response.json() as Promise<T>
  const payload = await response.json().catch(() => null) as { detail?: string; title?: string } | null
  throw new Error(payload?.detail || payload?.title || fallback)
}

async function calendarFetch(path: string, init?: RequestInit) {
  return edgeFetch("calendar-api", path, await sessionToken(), init)
}

async function publicFetch(path: string, init?: RequestInit) {
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("Booking services are not configured for this workspace.")
  const headers = new Headers(init?.headers)
  headers.set("apikey", supabasePublicApiKey)
  return fetch(`${supabaseFunctionsUrl}/calendar-public${path}`, { ...init, headers })
}

const localCalendarPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_CALENDAR_PREVIEW === "true"

export function isLocalCalendarPreview() {
  return localCalendarPreviewEnabled
}

async function localPreview() {
  return import("@/lib/local-calendar-preview")
}

export async function getCalendarWorkspace(start: string, end: string, signal?: AbortSignal) {
  if (localCalendarPreviewEnabled) {
    if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError")
    return (await localPreview()).getPreviewCalendarWorkspace(start, end)
  }
  const query = new URLSearchParams({ start, end })
  return apiJson<CalendarWorkspace>(calendarFetch(`/workspace?${query}`, { signal }), "Calendar could not be loaded.")
}

export async function createMeeting(draft: MeetingDraft, source: "calendar" | "crm" = "calendar") {
  if (localCalendarPreviewEnabled) return (await localPreview()).createPreviewMeeting(draft, source)
  return apiJson<CalendarEvent>(calendarFetch("/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-multideck-meeting-source": source },
    body: JSON.stringify(draft),
  }), "The meeting could not be scheduled.")
}

export async function updateMeeting(id: string, input: Partial<MeetingDraft> & { action?: "update" | "cancel" }) {
  if (localCalendarPreviewEnabled) return (await localPreview()).updatePreviewMeeting(id, input)
  return apiJson<CalendarEvent>(calendarFetch(`/meetings/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The meeting could not be changed.")
}

export async function decideMeetingChangeRequest(meetingId: string, requestId: string, input: { action: "accept" | "decline"; startAt?: string }) {
  if (localCalendarPreviewEnabled) return (await localPreview()).decidePreviewMeetingChangeRequest(meetingId, requestId, input)
  return apiJson<{ decided: boolean; finalising?: boolean; status: string; startAt?: string; endAt?: string }>(calendarFetch(`/meetings/${encodeURIComponent(meetingId)}/change-requests/${encodeURIComponent(requestId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The reschedule request could not be decided.")
}

export async function getMeetingCrmContext(type: "lead" | "account", id: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).getPreviewCrmContext(type, id)
  return apiJson<{ type: "lead" | "account"; id: string; name: string; company: string | null; attendees: MeetingParticipant[] }>(
    calendarFetch(`/crm-context/${type}/${encodeURIComponent(id)}`),
    "The CRM meeting context could not be loaded.",
  )
}

export async function searchMeetingPeople(query: string, signal?: AbortSignal) {
  if (localCalendarPreviewEnabled) {
    if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError")
    return (await localPreview()).searchPreviewMeetingPeople(query)
  }
  const params = new URLSearchParams({ q: query })
  return apiJson<{ people: MeetingPersonSuggestion[] }>(calendarFetch(`/people?${params}`, { signal }), "Attendee suggestions could not be loaded.")
}

/**
 * The join-link provider a new meeting should start with. It follows the
 * operator's default inbox (Gmail → Google Meet, Outlook → Microsoft Teams) and
 * falls back to Teams when no default inbox has been chosen.
 */
export function defaultMeetingProviderForInbox(provider: "gmail" | "outlook" | null | undefined): CalendarProvider {
  return provider === "gmail" ? "google_meet" : "microsoft_teams"
}

/** The signed-in user's availability preferences, read from the workspace payload with the smallest useful range. */
export async function getCalendarAvailability(signal?: AbortSignal) {
  const now = Date.now()
  const workspace = await getCalendarWorkspace(new Date(now).toISOString(), new Date(now + 86_400_000).toISOString(), signal)
  return workspace.availability
}

export async function saveCalendarAvailability(availability: CalendarAvailabilityPreferences) {
  if (localCalendarPreviewEnabled) return (await localPreview()).savePreviewAvailability(availability)
  return apiJson<{ saved: boolean; availability: CalendarAvailabilityPreferences }>(calendarFetch("/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(availability) }), "Availability could not be saved.")
}

export async function createBookingLink(input: Pick<BookingLink, "title" | "description" | "durationMinutes" | "provider" | "location" | "questions"> & Partial<Pick<BookingLink, "availability" | "minimumNoticeMinutes" | "bookingHorizonDays" | "bufferBeforeMinutes" | "bufferAfterMinutes" | "rescheduleCutoffMinutes" | "cancellationCutoffMinutes">> & { slug?: string }) {
  if (localCalendarPreviewEnabled) return (await localPreview()).createPreviewBookingLink(input)
  return apiJson<BookingLink>(calendarFetch("/booking-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The booking link could not be created.")
}

export async function updateBookingLink(id: string, input: Partial<BookingLink>) {
  if (localCalendarPreviewEnabled) return (await localPreview()).updatePreviewBookingLink(id, input)
  return apiJson<BookingLink>(calendarFetch(`/booking-links/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The booking link could not be changed.")
}

export async function getMeetingEmailTemplates() {
  if (localCalendarPreviewEnabled) return (await localPreview()).getPreviewTemplates()
  return apiJson<{ templates: MeetingEmailTemplate[] }>(calendarFetch("/templates"), "Meeting email templates could not be loaded.")
}

export async function saveMeetingEmailTemplate(kind: MeetingEmailTemplateKind, input: Pick<MeetingEmailTemplate, "subject" | "body">) {
  if (localCalendarPreviewEnabled) return (await localPreview()).savePreviewTemplate(kind, input)
  return apiJson<MeetingEmailTemplate>(calendarFetch(`/templates/${encodeURIComponent(kind)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The meeting email template could not be saved.")
}

export async function resetMeetingEmailTemplate(kind: MeetingEmailTemplateKind) {
  if (localCalendarPreviewEnabled) return (await localPreview()).resetPreviewTemplate(kind)
  return apiJson<MeetingEmailTemplate>(calendarFetch(`/templates/${encodeURIComponent(kind)}/reset`, { method: "POST" }), "The meeting email template could not be reset.")
}

export async function sendMeetingEmailTemplateTest(kind: MeetingEmailTemplateKind, input: Pick<MeetingEmailTemplate, "subject" | "body">) {
  if (localCalendarPreviewEnabled) throw new Error("Local preview does not send email. Deploy the Calendar functions before sending a test.")
  return apiJson<{ sent: boolean; email: string }>(calendarFetch(`/templates/${encodeURIComponent(kind)}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The test email could not be sent.")
}

export async function beginCalendarConnection(provider: CalendarConnection["provider"]) {
  if (localCalendarPreviewEnabled) throw new Error("Provider connections are unavailable in local preview. Deploy the Calendar functions before connecting an account.")
  const accessToken = await sessionToken()
  const result = await apiJson<{ authorizationUrl: string }>(edgeFetch("calendar-oauth", `/start/${provider}?returnPath=${encodeURIComponent("/settings?tab=integrations")}`, accessToken), "The provider connection could not be started.")
  window.location.assign(result.authorizationUrl)
}

export async function disconnectCalendarConnection(provider: CalendarConnection["provider"]) {
  if (localCalendarPreviewEnabled) throw new Error("No provider is connected in local preview.")
  const accessToken = await sessionToken()
  return apiJson<{ disconnected: boolean }>(edgeFetch("calendar-oauth", `/disconnect/${provider}`, accessToken, { method: "POST" }), "The provider could not be disconnected.")
}

export async function updateCalendarConnectionColour(provider: "google" | "microsoft", colour: MeetingColour) {
  if (localCalendarPreviewEnabled) throw new Error("Provider connection colours are saved after the Calendar backend is connected.")
  return apiJson<CalendarConnection>(calendarFetch(`/connections/${provider}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colour }),
  }), "The calendar colour could not be saved.")
}

export async function getPublicBooking(organiserSlug: string, bookingSlug: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).getPreviewPublicBooking(organiserSlug, bookingSlug)
  return apiJson<PublicBooking>(publicFetch(`/booking/${encodeURIComponent(organiserSlug)}/${encodeURIComponent(bookingSlug)}`), "This booking page could not be loaded.")
}

export async function getPublicBookingSlots(organiserSlug: string, bookingSlug: string, from: string, until: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).getPreviewSlots(organiserSlug, bookingSlug, from, until)
  const query = new URLSearchParams({ from, until })
  return apiJson<{ timeZone: string; slots: string[] }>(publicFetch(`/booking/${encodeURIComponent(organiserSlug)}/${encodeURIComponent(bookingSlug)}/slots?${query}`), "Available times could not be loaded.")
}

export async function createPublicBookingHold(organiserSlug: string, bookingSlug: string, input: Record<string, unknown>) {
  if (localCalendarPreviewEnabled) return (await localPreview()).createPreviewHold(organiserSlug, bookingSlug, input)
  return apiJson<BookingHold>(publicFetch(`/booking/${encodeURIComponent(organiserSlug)}/${encodeURIComponent(bookingSlug)}/holds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "That time could not be held.")
}

export async function verifyPublicBooking(organiserSlug: string, bookingSlug: string, holdId: string, code: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).verifyPreviewHold(organiserSlug, bookingSlug, holdId, code)
  return apiJson<{ confirmed: boolean; finalising?: boolean; meeting: CalendarEvent; managePath: string | null }>(publicFetch(`/booking/${encodeURIComponent(organiserSlug)}/${encodeURIComponent(bookingSlug)}/holds/${encodeURIComponent(holdId)}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }), "The booking could not be verified.")
}

export async function resendPublicBookingCode(organiserSlug: string, bookingSlug: string, holdId: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).resendPreviewBookingCode(organiserSlug, bookingSlug, holdId)
  return apiJson<{ sent: boolean; expiresAt: string; previewCode?: string }>(publicFetch(`/booking/${encodeURIComponent(organiserSlug)}/${encodeURIComponent(bookingSlug)}/holds/${encodeURIComponent(holdId)}/resend`, { method: "POST" }), "The verification code could not be resent.")
}

export async function getManagedMeeting(token: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).getPreviewManagedMeeting(token)
  return apiJson<ManagedMeeting>(publicFetch(`/manage/${encodeURIComponent(token)}`), "This meeting management link is not available.")
}

export async function getManagedMeetingSlots(token: string, from: string, until: string) {
  if (localCalendarPreviewEnabled) return (await localPreview()).getPreviewManagedSlots(token, from, until)
  const query = new URLSearchParams({ from, until })
  return apiJson<{ timeZone: string; slots: string[] }>(publicFetch(`/manage/${encodeURIComponent(token)}/slots?${query}`), "Available times could not be loaded.")
}

export async function manageMeeting(token: string, input: Record<string, unknown>): Promise<{ finalising?: boolean; [key: string]: unknown }> {
  if (localCalendarPreviewEnabled) return (await localPreview()).managePreviewMeeting(token, input)
  return apiJson<Record<string, unknown>>(publicFetch(`/manage/${encodeURIComponent(token)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "The meeting could not be changed.")
}
