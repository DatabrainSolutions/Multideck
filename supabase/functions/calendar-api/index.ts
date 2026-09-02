import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  authenticate,
  body,
  currentInternalUser,
  failure,
  HttpError,
  json,
  permissionValues,
  routeParts,
} from "../_shared/backend.ts"
import {
  cleanText,
  DEFAULT_WORKING_HOURS,
  emailAddress,
  parseMeetingRange,
  parseProvider,
  parseTimeZone,
  slugify,
  uuidOrNull,
  type CalendarProvider,
} from "../_shared/calendar.ts"
import {
  TENANT_CUSTOMISABLE_CALENDAR_EMAIL_TEMPLATE_KINDS,
  listCalendarEmailTemplates,
  readCalendarEmailTemplate,
  renderCalendarEmailTemplate,
  sampleCalendarEmailVariables,
  validateCalendarEmailTemplate,
  type CalendarEmailTemplateKind,
} from "../_shared/calendar-email-templates.ts"
import { renderBrandedEmail } from "../_shared/email-template.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"
import { readConfiguredTenantBrand } from "../_shared/tenant-branding.ts"
import { providerBusyRanges } from "../_shared/calendar-provider-availability.ts"

type Actor = Record<string, unknown> & { User_ID: string; Company_ID: string; User_Email: string }
type JsonObject = Record<string, unknown>

const DEFAULT_BOOKING_QUESTIONS = [
  { id: "company", label: "Company", type: "short_text", required: false, builtIn: true },
  { id: "phone", label: "Phone", type: "short_text", required: false, builtIn: true },
  { id: "notes", label: "What would you like to discuss?", type: "long_text", required: false, builtIn: true },
]
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const MEETING_COLOURS = new Set(["teal", "amber", "blue", "violet", "rose", "red", "cyan", "neutral"])

function bookingQuestions(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_BOOKING_QUESTIONS
  return value.slice(0, 10).flatMap((candidate, index) => {
    const question = candidate && typeof candidate === "object" ? candidate as JsonObject : {}
    const label = cleanText(question.label, 180)
    if (!label) return []
    const requestedId = cleanText(question.id, 80)
    const builtIn = ["company", "phone", "notes"].includes(requestedId)
    return [{
      id: builtIn ? requestedId : slugify(requestedId, `question-${index + 1}`),
      label,
      type: question.type === "long_text" ? "long_text" : "short_text",
      required: question.required === true,
      builtIn,
    }]
  })
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number | null) {
  if (value === null || value === "") return null
  const next = Number(value)
  return Number.isInteger(next) && next >= minimum && next <= maximum ? next : fallback
}

function meetingColour(value: unknown, fallback = "teal") {
  const colour = cleanText(value, 20) || fallback
  if (!MEETING_COLOURS.has(colour)) throw new HttpError(400, "Choose a valid event colour.")
  return colour
}

function reminderMinutes(value: unknown, fallback: number[] = [1440, 60]) {
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.length > 8) throw new HttpError(400, "Choose up to eight valid meeting reminders.")
  const reminders = [...new Set(value.map(Number))]
  if (reminders.some((minutes) => !Number.isInteger(minutes) || minutes < 5 || minutes > 10080)) {
    throw new HttpError(400, "Meeting reminders must be between five minutes and seven days before the meeting.")
  }
  return reminders
}

function normaliseWorkingHours(value: unknown, fallback = DEFAULT_WORKING_HOURS) {
  if (value === undefined) return fallback
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Working hours are not valid.")
  const source = value as JsonObject
  return Object.fromEntries(WEEKDAYS.map((day) => {
    const candidate = source[day] === undefined ? fallback[day] ?? [] : source[day]
    if (!Array.isArray(candidate) || candidate.length > 4) throw new HttpError(400, `Choose valid ${day} working hours.`)
    const ranges = candidate.map((range) => {
      if (!Array.isArray(range) || range.length !== 2) throw new HttpError(400, `Choose valid ${day} working hours.`)
      const open = cleanText(range[0], 5)
      const close = cleanText(range[1], 5)
      if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close) || open >= close) throw new HttpError(400, `Choose valid ${day} working hours.`)
      return [open, close] as [string, string]
    })
    return [day, ranges]
  }))
}

function normaliseAvailabilityExceptions(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 366) throw new HttpError(400, "Availability exceptions are not valid.")
  const seen = new Set<string>()
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new HttpError(400, "Availability exceptions are not valid.")
    const exception = candidate as JsonObject
    const date = cleanText(exception.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || seen.has(date)) throw new HttpError(400, "Each availability exception needs one valid date.")
    seen.add(date)
    const unavailable = exception.unavailable === true
    const ranges = unavailable ? undefined : normaliseWorkingHours({ monday: exception.ranges ?? [] }, { ...DEFAULT_WORKING_HOURS, monday: [] }).monday
    return { date, unavailable, ...(unavailable ? {} : { ranges }) }
  })
}

const meetingSelect = [
  "CALMeeting_ID", "CALMeeting_Title", "CALMeeting_Agenda", "CALMeeting_StartAt", "CALMeeting_EndAt",
  "CALMeeting_TimeZone", "CALMeeting_StatusCode", "CALMeeting_ProviderCode", "CALMeeting_Location",
  "CALMeeting_ColourCode",
  "CALMeeting_JoinURL", "CALMeeting_LeadID", "CALMeeting_AccountID", "CALMeeting_JobID",
  "CALMeeting_BookingLinkID", "CALMeeting_AllowAttendeeReschedule", "CALMeeting_RemindersJSON",
  "CALMeeting_SourceCode", "CALMeeting_EditVersion", "CALMeeting_PendingChangeJSON", "CALMeeting_LastSyncError",
  "CALMeeting_OrganiserUserID", "CALMeeting_CreatedAt", "CALMeeting_UpdatedAt",
].join(",")

function ensureCompany(actor: Record<string, unknown>): asserts actor is Actor {
  if (!actor.User_ID || !actor.Company_ID || !actor.User_Email) throw new HttpError(403, "Your Multideck company profile is incomplete.")
}

function can(permissions: string[], value: string) {
  return permissions.includes(value)
}

function meetingContract(row: Record<string, unknown>, participants: Record<string, unknown>[] = [], changeRequests: Record<string, unknown>[] = []) {
  return {
    id: row.CALMeeting_ID,
    title: row.CALMeeting_Title,
    agenda: row.CALMeeting_Agenda,
    startAt: row.CALMeeting_StartAt,
    endAt: row.CALMeeting_EndAt,
    timeZone: row.CALMeeting_TimeZone,
    status: row.CALMeeting_StatusCode,
    provider: row.CALMeeting_ProviderCode,
    colour: row.CALMeeting_ColourCode,
    location: row.CALMeeting_Location,
    joinUrl: row.CALMeeting_JoinURL,
    linkedRecord: row.CALMeeting_LeadID ? { type: "lead", id: row.CALMeeting_LeadID }
      : row.CALMeeting_AccountID ? { type: "account", id: row.CALMeeting_AccountID }
      : row.CALMeeting_JobID ? { type: "job", id: row.CALMeeting_JobID }
      : null,
    bookingLinkId: row.CALMeeting_BookingLinkID,
    allowAttendeeReschedule: row.CALMeeting_AllowAttendeeReschedule,
    reminders: row.CALMeeting_RemindersJSON,
    source: row.CALMeeting_SourceCode,
    version: row.CALMeeting_EditVersion,
    pendingChange: row.CALMeeting_PendingChangeJSON,
    syncError: row.CALMeeting_LastSyncError,
    organiserUserId: row.CALMeeting_OrganiserUserID,
    canEdit: true,
    participants: participants.map((participant) => ({
      id: participant.CALParticipant_ID,
      name: participant.CALParticipant_Name,
      email: participant.CALParticipant_Email,
      role: participant.CALParticipant_RoleCode,
      response: participant.CALParticipant_ResponseCode,
      external: participant.CALParticipant_IsExternal,
    })),
    changeRequests: changeRequests.map((request) => {
      const participant = participants.find((candidate) => candidate.CALParticipant_ID === request.CALChangeRequest_ParticipantID)
      return {
        id: request.CALChangeRequest_ID,
        participantId: request.CALChangeRequest_ParticipantID,
        participantName: participant?.CALParticipant_Name || "Attendee",
        proposedTimes: request.CALChangeRequest_ProposedTimesJSON,
        status: request.CALChangeRequest_StatusCode,
        selectedStartAt: request.CALChangeRequest_SelectedStartAt,
        selectedEndAt: request.CALChangeRequest_SelectedEndAt,
        createdAt: request.CALChangeRequest_CreatedAt,
      }
    }),
  }
}

function bookingLinkContract(row: Record<string, unknown>) {
  return {
    id: row.CALBookingLink_ID,
    organiserSlug: row.CALBookingLink_OrganiserSlug,
    slug: row.CALBookingLink_Slug,
    title: row.CALBookingLink_Title,
    description: row.CALBookingLink_Description,
    durationMinutes: row.CALBookingLink_DurationMinutes,
    provider: row.CALBookingLink_ProviderCode,
    location: row.CALBookingLink_Location,
    status: row.CALBookingLink_StatusCode,
    availability: row.CALBookingLink_OverrideAvailabilityJSON,
    minimumNoticeMinutes: row.CALBookingLink_MinimumNoticeMinutes,
    bookingHorizonDays: row.CALBookingLink_BookingHorizonDays,
    bufferBeforeMinutes: row.CALBookingLink_BufferBeforeMinutes,
    bufferAfterMinutes: row.CALBookingLink_BufferAfterMinutes,
    questions: row.CALBookingLink_QuestionsJSON,
    rescheduleCutoffMinutes: row.CALBookingLink_RescheduleCutoffMinutes,
    cancellationCutoffMinutes: row.CALBookingLink_CancellationCutoffMinutes,
    path: `/book/${row.CALBookingLink_OrganiserSlug}/${row.CALBookingLink_Slug}`,
    updatedAt: row.CALBookingLink_UpdatedAt,
  }
}

function connectionContract(row: Record<string, unknown>) {
  return {
    id: row.CALConnection_ID,
    provider: row.CALConnection_ProviderCode,
    primaryCalendar: row.CALConnection_IsPrimaryCalendar,
    status: row.CALConnection_StatusCode,
    displayName: row.CALConnection_DisplayName,
    email: row.CALConnection_Email,
    lastSyncedAt: row.CALConnection_LastSyncedAt,
    subscriptionExpiresAt: row.CALConnection_SubscriptionExpiresAt,
    error: row.CALConnection_LastError,
    colour: row.CALConnection_ColourCode,
  }
}

async function updateConnectionColour(request: Request, admin: SupabaseClient, actor: Actor, provider: string) {
  if (provider !== "google" && provider !== "microsoft") throw new HttpError(400, "Choose Google Calendar or Microsoft Calendar.")
  const input = await body<JsonObject>(request)
  const colour = meetingColour(input.colour, provider === "google" ? "blue" : "violet")
  const { data, error } = await admin.from("CAL_ProviderConnections").update({
    CALConnection_ColourCode: colour,
    CALConnection_UpdatedAt: new Date().toISOString(),
  })
    .eq("CALConnection_CompanyID", actor.Company_ID)
    .eq("CALConnection_UserID", actor.User_ID)
    .eq("CALConnection_ProviderCode", provider)
    .neq("CALConnection_StatusCode", "disconnected")
    .select("*").maybeSingle()
  if (error) throw new HttpError(500, "The calendar colour could not be saved.")
  if (!data) throw new HttpError(404, "Connect this calendar before choosing its colour.")
  return connectionContract(data)
}

async function loadParticipants(admin: SupabaseClient, meetingIds: string[]) {
  if (!meetingIds.length) return new Map<string, Record<string, unknown>[]>()
  const { data, error } = await admin.from("CAL_MeetingParticipants").select("*").in("CALParticipant_MeetingID", meetingIds)
  if (error) throw new HttpError(500, error.message)
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const participant of data ?? []) {
    const id = participant.CALParticipant_MeetingID as string
    grouped.set(id, [...(grouped.get(id) ?? []), participant])
  }
  return grouped
}

async function providerConnection(admin: SupabaseClient, actor: Actor, provider: CalendarProvider) {
  const providerCode = provider === "google_meet" ? "google" : provider === "microsoft_teams" ? "microsoft" : provider
  if (!["google", "microsoft", "zoom"].includes(providerCode)) return null
  const { data, error } = await admin.from("CAL_ProviderConnections").select("*")
    .eq("CALConnection_CompanyID", actor.Company_ID)
    .eq("CALConnection_UserID", actor.User_ID)
    .eq("CALConnection_ProviderCode", providerCode)
    .neq("CALConnection_StatusCode", "disconnected")
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data || data.CALConnection_StatusCode !== "connected") {
    throw new HttpError(409, `${providerCode === "microsoft" ? "Microsoft Calendar" : providerCode === "google" ? "Google Calendar" : "Zoom"} needs to be connected before this meeting can be scheduled.`)
  }
  return data
}

async function removeIncompleteMeeting(
  admin: SupabaseClient,
  meetingId: string,
  reservationId: string,
  activityId?: string | null,
) {
  let rolledBack = true
  if (activityId) {
    const { error } = await admin.from("CRM_Activities").delete().eq("CRMActivity_ID", activityId)
    rolledBack = !error && rolledBack
  }
  const { error: meetingError } = await admin.from("CAL_Meetings").delete().eq("CALMeeting_ID", meetingId)
  rolledBack = !meetingError && rolledBack
  const { error: reservationError } = await admin.from("CAL_Reservations").delete().eq("CALReservation_ID", reservationId)
  return !reservationError && rolledBack
}

async function restorePendingMeetingSnapshot(admin: SupabaseClient, current: Record<string, unknown>) {
  const { error } = await admin.from("CAL_Meetings").update({
    CALMeeting_StatusCode: current.CALMeeting_StatusCode,
    CALMeeting_PendingChangeJSON: current.CALMeeting_PendingChangeJSON,
    CALMeeting_EditVersion: current.CALMeeting_EditVersion,
    CALMeeting_UpdatedBy: current.CALMeeting_UpdatedBy,
    CALMeeting_UpdatedAt: current.CALMeeting_UpdatedAt,
  }).eq("CALMeeting_ID", current.CALMeeting_ID)
  return !error
}

async function restoreStandaloneMeetingSnapshot(admin: SupabaseClient, current: Record<string, unknown>) {
  const { error: reservationError } = await admin.from("CAL_Reservations").update({
    CALReservation_StartAt: current.CALMeeting_StartAt,
    CALReservation_EndAt: current.CALMeeting_EndAt,
    CALReservation_StatusCode: "active",
  }).eq("CALReservation_ID", current.CALMeeting_ReservationID)
  const { error: meetingError } = await admin.from("CAL_Meetings").update({
    CALMeeting_Title: current.CALMeeting_Title,
    CALMeeting_Agenda: current.CALMeeting_Agenda,
    CALMeeting_StartAt: current.CALMeeting_StartAt,
    CALMeeting_EndAt: current.CALMeeting_EndAt,
    CALMeeting_TimeZone: current.CALMeeting_TimeZone,
    CALMeeting_ColourCode: current.CALMeeting_ColourCode,
    CALMeeting_Location: current.CALMeeting_Location,
    CALMeeting_RemindersJSON: current.CALMeeting_RemindersJSON,
    CALMeeting_AllowAttendeeReschedule: current.CALMeeting_AllowAttendeeReschedule,
    CALMeeting_StatusCode: current.CALMeeting_StatusCode,
    CALMeeting_PendingChangeJSON: current.CALMeeting_PendingChangeJSON,
    CALMeeting_EditVersion: current.CALMeeting_EditVersion,
    CALMeeting_UpdatedBy: current.CALMeeting_UpdatedBy,
    CALMeeting_UpdatedAt: current.CALMeeting_UpdatedAt,
  }).eq("CALMeeting_ID", current.CALMeeting_ID)
  return !reservationError && !meetingError
}

function queueFailure(message: string, rolledBack: boolean): never {
  throw new HttpError(
    503,
    rolledBack
      ? `${message} No meeting change was saved.`
      : `${message} Refresh Calendar before trying again so the meeting state can be checked safely.`,
  )
}

async function createMeeting(admin: SupabaseClient, actor: Actor, payload: JsonObject, source = "calendar") {
  const title = cleanText(payload.title, 240)
  if (!title) throw new HttpError(400, "Meeting title is required.")
  const { start, end } = parseMeetingRange(payload.startAt, payload.endAt)
  if (start.getTime() < Date.now() - 60_000) throw new HttpError(400, "Choose a future meeting time.")
  const timeZone = parseTimeZone(payload.timeZone)
  const provider = parseProvider(payload.provider)
  await providerConnection(admin, actor, provider)
  const leadId = uuidOrNull(payload.leadId)
  const accountId = uuidOrNull(payload.accountId)
  const jobId = uuidOrNull(payload.jobId)
  const attendees = Array.isArray(payload.attendees) ? payload.attendees.slice(0, 50) : []
  const participantRows = attendees.map((value) => {
    const attendee = typeof value === "object" && value ? value as JsonObject : {}
    return {
      CALParticipant_Name: cleanText(attendee.name, 240) || emailAddress(attendee.email),
      CALParticipant_Email: emailAddress(attendee.email),
      CALParticipant_RoleCode: attendee.optional ? "optional" : "attendee",
      CALParticipant_IsExternal: attendee.external !== false,
    }
  })
  const reservationId = crypto.randomUUID()
  const status = ["google_meet", "microsoft_teams", "zoom"].includes(provider) ? "provisioning" : "confirmed"
  const { data: preferences, error: preferencesError } = await admin.from("CAL_UserAvailability").select("*").eq("CALAvailability_UserID", actor.User_ID).maybeSingle()
  if (preferencesError) throw new HttpError(503, "Your Calendar availability could not be loaded safely.")
  const { error: reservationError } = await admin.from("CAL_Reservations").insert({
    CALReservation_ID: reservationId,
    CALReservation_CompanyID: actor.Company_ID,
    CALReservation_OwnerUserID: actor.User_ID,
    CALReservation_SourceCode: "meeting",
    CALReservation_SourceID: reservationId,
    CALReservation_StartAt: start.toISOString(),
    CALReservation_EndAt: end.toISOString(),
    CALReservation_BufferBeforeMinutes: preferences?.CALAvailability_BufferBeforeMinutes ?? 0,
    CALReservation_BufferAfterMinutes: preferences?.CALAvailability_BufferAfterMinutes ?? 0,
  })
  if (reservationError?.code === "23P01") throw new HttpError(409, "That time is no longer available.")
  if (reservationError) throw new HttpError(500, reservationError.message)

  const { data: meeting, error: meetingError } = await admin.from("CAL_Meetings").insert({
    CALMeeting_CompanyID: actor.Company_ID,
    CALMeeting_OrganiserUserID: actor.User_ID,
    CALMeeting_ReservationID: reservationId,
    CALMeeting_Title: title,
    CALMeeting_Agenda: cleanText(payload.agenda, 10_000) || null,
    CALMeeting_StartAt: start.toISOString(),
    CALMeeting_EndAt: end.toISOString(),
    CALMeeting_TimeZone: timeZone,
    CALMeeting_StatusCode: status,
    CALMeeting_ProviderCode: provider,
    CALMeeting_ColourCode: meetingColour(payload.colour),
    CALMeeting_Location: cleanText(payload.location, 500) || null,
    CALMeeting_LeadID: leadId,
    CALMeeting_AccountID: accountId,
    CALMeeting_JobID: jobId,
    CALMeeting_AllowAttendeeReschedule: payload.allowAttendeeReschedule !== false,
    CALMeeting_RemindersJSON: reminderMinutes(payload.reminders),
    CALMeeting_SourceCode: source,
    CALMeeting_CreatedBy: actor.User_ID,
    CALMeeting_UpdatedBy: actor.User_ID,
  }).select(meetingSelect).single()
  if (meetingError || !meeting) {
    const { error: cleanupError } = await admin.from("CAL_Reservations").delete().eq("CALReservation_ID", reservationId)
    if (cleanupError) console.error("Calendar reservation cleanup failed after meeting creation failed", { reservationId })
    throw new HttpError(500, meetingError?.message ?? "The meeting could not be created.")
  }
  const meetingRow = meeting as unknown as Record<string, unknown>
  const { error: reservationSourceError } = await admin.from("CAL_Reservations")
    .update({ CALReservation_SourceID: meetingRow.CALMeeting_ID })
    .eq("CALReservation_ID", reservationId)
  if (reservationSourceError) {
    const rolledBack = await removeIncompleteMeeting(admin, String(meetingRow.CALMeeting_ID), reservationId)
    queueFailure("The meeting could not finish reserving its time.", rolledBack)
  }

  let savedParticipants: Record<string, unknown>[] = []
  if (participantRows.length) {
    const { data, error } = await admin.from("CAL_MeetingParticipants").insert(participantRows.map((participant) => ({
      ...participant,
      CALParticipant_MeetingID: meetingRow.CALMeeting_ID,
    }))).select("*")
    if (error) {
      await removeIncompleteMeeting(admin, String(meetingRow.CALMeeting_ID), reservationId)
      throw new HttpError(400, error.message)
    }
    savedParticipants = data ?? []
  }

  const { data: activity, error: activityError } = await admin.from("CRM_Activities").insert({
    CRMActivity_ActivityTypeCode: "meeting",
    CRMActivity_AccountID: accountId,
    CRMActivity_LeadID: leadId,
    CRMActivity_JobID: jobId,
    CRMActivity_Subject: title,
    CRMActivity_Summary: `Meeting scheduled for ${start.toISOString()}.`,
    CRMActivity_ActivityAt: start.toISOString(),
    CRMActivity_DurationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    CRMActivity_OwnerUserID: actor.User_ID,
    CRMActivity_MetadataJSON: { calendarMeetingId: meetingRow.CALMeeting_ID, provider, status },
    CRMActivity_CreatedBy: actor.User_ID,
    CRMActivity_UpdatedBy: actor.User_ID,
  }).select("CRMActivity_ID").maybeSingle()
  if (activityError || !activity) {
    const rolledBack = await removeIncompleteMeeting(admin, String(meetingRow.CALMeeting_ID), reservationId)
    queueFailure("The meeting could not be added to the CRM timeline.", rolledBack)
  }
  if (activity && savedParticipants.length) {
    const { error: activityParticipantsError } = await admin.from("CRM_ActivityParticipants").insert(savedParticipants.map((participant) => ({
      CRMActPart_ActivityID: activity.CRMActivity_ID,
      CRMActPart_NameSnapshot: participant.CALParticipant_Name,
      CRMActPart_EmailSnapshot: participant.CALParticipant_Email,
      CRMActPart_Role: participant.CALParticipant_RoleCode,
      CRMActPart_IsExternal: participant.CALParticipant_IsExternal,
    })))
    if (activityParticipantsError) {
      const rolledBack = await removeIncompleteMeeting(admin, String(meetingRow.CALMeeting_ID), reservationId, String(activity.CRMActivity_ID))
      queueFailure("The meeting attendees could not be added to the CRM timeline.", rolledBack)
    }
  }

  const deliveries = status === "provisioning" ? [{
    CALDelivery_CompanyID: actor.Company_ID,
    CALDelivery_MeetingID: meetingRow.CALMeeting_ID,
    CALDelivery_KindCode: "provider_create",
    CALDelivery_IdempotencyKey: `meeting:${meetingRow.CALMeeting_ID}:provider-create:v1`,
  }] : savedParticipants.map((participant) => ({
    CALDelivery_CompanyID: actor.Company_ID,
    CALDelivery_MeetingID: meetingRow.CALMeeting_ID,
    CALDelivery_ParticipantID: participant.CALParticipant_ID,
    CALDelivery_KindCode: "standalone_confirmation",
    CALDelivery_IdempotencyKey: `meeting:${meetingRow.CALMeeting_ID}:participant:${participant.CALParticipant_ID}:confirmation:v1`,
  }))
  if (deliveries.length) {
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert(deliveries)
    if (deliveryError) {
      const rolledBack = await removeIncompleteMeeting(admin, String(meetingRow.CALMeeting_ID), reservationId, String(activity.CRMActivity_ID))
      queueFailure("The meeting could not queue its provider and attendee updates.", rolledBack)
    }
  }
  return meetingContract(meetingRow, savedParticipants)
}

async function listWorkspace(admin: SupabaseClient, actor: Actor, permissions: string[], url: URL) {
  const start = new Date(url.searchParams.get("start") || new Date(Date.now() - 7 * 86_400_000).toISOString())
  const end = new Date(url.searchParams.get("end") || new Date(Date.now() + 35 * 86_400_000).toISOString())
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > 400 * 86_400_000) {
    throw new HttpError(400, "Choose a valid calendar range of 400 days or fewer.")
  }
  let meetingQuery = admin.from("CAL_Meetings").select(meetingSelect)
    .eq("CALMeeting_CompanyID", actor.Company_ID)
    .lt("CALMeeting_StartAt", end.toISOString()).gt("CALMeeting_EndAt", start.toISOString())
    .neq("CALMeeting_StatusCode", "cancelled").order("CALMeeting_StartAt")
  if (!can(permissions, "Calendar.ManageAll")) meetingQuery = meetingQuery.eq("CALMeeting_OrganiserUserID", actor.User_ID)

  // Operational ribbons follow the source product's permission and assignment
  // boundary. Calendar.Read alone must never make Bookings or Warehouse data
  // visible, and service-role reads must not bypass the office scope enforced by
  // those product APIs.
  const canReadBookings = can(permissions, "Bookings.Read") || can(permissions, "Bookings.Write")
  const canReadWarehouse = can(permissions, "Warehouse.Read") || can(permissions, "Warehouse.Write")
  const [{ data: companyOffices, error: companyOfficeError }, { data: assignedOffices, error: assignedOfficeError }] = await Promise.all([
    canReadWarehouse
      ? admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", actor.Company_ID)
      : Promise.resolve({ data: [], error: null }),
    canReadWarehouse
      ? admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", actor.User_ID)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (companyOfficeError || assignedOfficeError) throw new HttpError(500, "Operational Calendar access could not be checked safely.")
  const companyOfficeIds = new Set((companyOffices ?? []).map((row) => String(row.Office_ID)))
  const warehouseOfficeIds = (assignedOffices ?? []).map((row) => String(row.Office_ID)).filter((id) => companyOfficeIds.has(id))
  const { data: permittedFacilities, error: facilityError } = canReadWarehouse && warehouseOfficeIds.length
    ? await admin.from("WMS_Facilities").select("WMSFacility_ID").in("WMSFacility_OrgOfficeID", warehouseOfficeIds).eq("WMSFacility_IsDeleted", false)
    : { data: [], error: null }
  if (facilityError) throw new HttpError(500, "Warehouse Calendar access could not be checked safely.")
  const facilityIds = (permittedFacilities ?? []).map((row) => String(row.WMSFacility_ID))
  const emptyRows = () => Promise.resolve({ data: [] as Record<string, unknown>[], error: null })
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  const warehouseRange = `and(WMSOrder_AppointmentStartAt.gte.${start.toISOString()},WMSOrder_AppointmentStartAt.lt.${end.toISOString()}),and(WMSOrder_AppointmentStartAt.is.null,WMSOrder_RequestedDate.gte.${startDate},WMSOrder_RequestedDate.lt.${endDate})`
  const [meetingsResult, providerResult, availabilityResult, connectionsResult, linksResult, taskResult, leadResult, quoteResult, jobResult, warehouseResult] = await Promise.all([
    meetingQuery,
    admin.from("CAL_ProviderEvents").select("*").eq("CALProviderEvent_CompanyID", actor.Company_ID).eq("CALProviderEvent_OwnerUserID", actor.User_ID)
      .is("CALProviderEvent_MeetingID", null)
      .lt("CALProviderEvent_StartAt", end.toISOString()).gt("CALProviderEvent_EndAt", start.toISOString()).eq("CALProviderEvent_IsCancelled", false),
    admin.from("CAL_UserAvailability").select("*").eq("CALAvailability_UserID", actor.User_ID).maybeSingle(),
    admin.from("CAL_ProviderConnections").select("*").eq("CALConnection_CompanyID", actor.Company_ID).eq("CALConnection_UserID", actor.User_ID).neq("CALConnection_StatusCode", "disconnected"),
    admin.from("CAL_BookingLinks").select("*").eq("CALBookingLink_CompanyID", actor.Company_ID).eq("CALBookingLink_OwnerUserID", actor.User_ID).neq("CALBookingLink_StatusCode", "archived").order("CALBookingLink_UpdatedAt", { ascending: false }),
    admin.from("Workflow_Tasks").select("WorkflowTask_ID,WorkflowTask_Title,WorkflowTask_DueAt,WorkflowTask_RecordTypeCode,WorkflowTask_RecordID,WorkflowTask_StatusCode")
      .eq("WorkflowTask_AssignedUserID", actor.User_ID).eq("WorkflowTask_IsDeleted", false).not("WorkflowTask_DueAt", "is", null)
      .gte("WorkflowTask_DueAt", start.toISOString()).lt("WorkflowTask_DueAt", end.toISOString()).not("WorkflowTask_StatusCode", "in", "(completed,cancelled)"),
    admin.from("CRM_Leads").select("CRMLead_ID,CRMLead_CompanyName,CRMLead_PersonName,CRMLead_NextActionDueAt")
      .eq("CRMLead_OwnerUserID", actor.User_ID).eq("CRMLead_IsDeleted", false).not("CRMLead_NextActionDueAt", "is", null)
      .gte("CRMLead_NextActionDueAt", start.toISOString()).lt("CRMLead_NextActionDueAt", end.toISOString()),
    admin.from("CRM_QuoteFollowups").select("CRMQF_ID,CRMQF_OwnerUserID,CRMQF_NextActionDueAt,CRMQF_StatusCode")
      .eq("CRMQF_OwnerUserID", actor.User_ID).eq("CRMQF_IsDeleted", false).not("CRMQF_NextActionDueAt", "is", null)
      .gte("CRMQF_NextActionDueAt", start.toISOString()).lt("CRMQF_NextActionDueAt", end.toISOString()),
    canReadBookings
      ? admin.rpc("multideck_calendar_job_milestones", { p_company_id: actor.Company_ID, p_start: start.toISOString(), p_end: end.toISOString() })
      : emptyRows(),
    facilityIds.length
      ? admin.from("WMS_Orders").select("WMSOrder_ID,WMSOrder_OrderNumber,WMSOrder_RequestedDate,WMSOrder_AppointmentStartAt,WMSOrder_StatusCode")
        .in("WMSOrder_FacilityID", facilityIds).eq("WMSOrder_IsDeleted", false).or(warehouseRange)
      : emptyRows(),
  ])
  for (const result of [meetingsResult, providerResult, availabilityResult, connectionsResult, linksResult, taskResult, leadResult, quoteResult, jobResult, warehouseResult]) {
    if (result.error) throw new HttpError(500, result.error.message)
  }
  const meetingRows = (meetingsResult.data ?? []) as unknown as Record<string, unknown>[]
  const participants = await loadParticipants(admin, meetingRows.map((row) => String(row.CALMeeting_ID)))
  const { data: changeRows, error: changeError } = meetingRows.length
    ? await admin.from("CAL_ChangeRequests").select("*").in("CALChangeRequest_MeetingID", meetingRows.map((row) => row.CALMeeting_ID)).eq("CALChangeRequest_StatusCode", "pending").order("CALChangeRequest_CreatedAt")
    : { data: [], error: null }
  if (changeError) throw new HttpError(500, changeError.message)
  const changesByMeeting = new Map<string, Record<string, unknown>[]>()
  for (const request of changeRows ?? []) {
    const meetingId = request.CALChangeRequest_MeetingID as string
    changesByMeeting.set(meetingId, [...(changesByMeeting.get(meetingId) ?? []), request])
  }
  const jobMilestonePresentation: Record<string, { label: string; tone: string }> = {
    collection: { label: "collection", tone: "sky" },
    departure: { label: "departs", tone: "violet" },
    arrival: { label: "arrives", tone: "teal" },
    delivery: { label: "delivery", tone: "green" },
  }
  const ribbons = [
    ...(taskResult.data ?? []).map((row) => ({ id: `task:${row.WorkflowTask_ID}`, kind: "task", title: row.WorkflowTask_Title, at: row.WorkflowTask_DueAt, route: "/to-do", tone: "neutral" })),
    ...(leadResult.data ?? []).map((row) => ({ id: `lead:${row.CRMLead_ID}`, kind: "crm_follow_up", title: `Follow up ${row.CRMLead_PersonName || row.CRMLead_CompanyName || "lead"}`, at: row.CRMLead_NextActionDueAt, route: `/crm/leads/${row.CRMLead_ID}`, tone: "amber" })),
    ...(quoteResult.data ?? []).map((row) => ({ id: `quote:${row.CRMQF_ID}`, kind: "quote_follow_up", title: "Quote follow-up", at: row.CRMQF_NextActionDueAt, route: "/quotes", tone: "violet" })),
    ...(jobResult.data ?? []).map((row) => {
      const kind = String(row.milestone_kind)
      const presentation = jobMilestonePresentation[kind] ?? { label: "milestone", tone: "neutral" }
      return { id: `job-${kind}:${row.job_id}`, kind, title: `Job ${row.job_number} ${presentation.label}`, at: row.milestone_at, route: `/bookings/${row.job_id}`, tone: presentation.tone }
    }),
    ...(warehouseResult.data ?? []).flatMap((row) => [
      row.WMSOrder_AppointmentStartAt ? { id: `warehouse:${row.WMSOrder_ID}`, kind: "warehouse", title: `${row.WMSOrder_OrderNumber} appointment`, at: row.WMSOrder_AppointmentStartAt, route: `/warehouse/orders/${encodeURIComponent(row.WMSOrder_OrderNumber)}`, tone: "orange" } : null,
      !row.WMSOrder_AppointmentStartAt && row.WMSOrder_RequestedDate ? { id: `warehouse-request:${row.WMSOrder_ID}`, kind: "warehouse", title: `${row.WMSOrder_OrderNumber} requested`, at: `${row.WMSOrder_RequestedDate}T12:00:00Z`, route: `/warehouse/orders/${encodeURIComponent(row.WMSOrder_OrderNumber)}`, tone: "orange" } : null,
    ].filter(Boolean)),
  ].filter(Boolean) as Record<string, unknown>[]
  const connectionPresentation = new Map((connectionsResult.data ?? []).map((connection) => [
    String(connection.CALConnection_ID),
    {
      provider: connection.CALConnection_ProviderCode,
      colour: connection.CALConnection_ColourCode || (connection.CALConnection_ProviderCode === "google" ? "blue" : connection.CALConnection_ProviderCode === "microsoft" ? "violet" : "neutral"),
    },
  ]))
  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    timeZone: availabilityResult.data?.CALAvailability_TimeZone ?? "Europe/London",
    meetings: meetingRows.map((row) => meetingContract(row, participants.get(String(row.CALMeeting_ID)) ?? [], changesByMeeting.get(String(row.CALMeeting_ID)) ?? [])),
    externalEvents: (providerResult.data ?? []).map((row) => {
      const connection = connectionPresentation.get(String(row.CALProviderEvent_ConnectionID))
      return {
        id: row.CALProviderEvent_ID,
        title: row.CALProviderEvent_IsPrivate ? "Busy" : row.CALProviderEvent_Title || "Busy",
        startAt: row.CALProviderEvent_StartAt,
        endAt: row.CALProviderEvent_EndAt,
        provider: "calendar",
        calendarSource: connection?.provider ?? null,
        colour: connection?.colour ?? "neutral",
        status: "confirmed",
        private: row.CALProviderEvent_IsPrivate,
        canEdit: false,
      }
    }),
    ribbons,
    availability: availabilityResult.data ? {
      timeZone: availabilityResult.data.CALAvailability_TimeZone,
      workingHours: availabilityResult.data.CALAvailability_WorkingHoursJSON,
      exceptions: availabilityResult.data.CALAvailability_ExceptionsJSON,
      minimumNoticeMinutes: availabilityResult.data.CALAvailability_MinimumNoticeMinutes,
      bookingHorizonDays: availabilityResult.data.CALAvailability_BookingHorizonDays,
      bufferBeforeMinutes: availabilityResult.data.CALAvailability_BufferBeforeMinutes,
      bufferAfterMinutes: availabilityResult.data.CALAvailability_BufferAfterMinutes,
      slotIncrementMinutes: availabilityResult.data.CALAvailability_SlotIncrementMinutes,
    } : {
      timeZone: "Europe/London", workingHours: DEFAULT_WORKING_HOURS, exceptions: [], minimumNoticeMinutes: 120,
      bookingHorizonDays: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15, slotIncrementMinutes: 15,
    },
    connections: (connectionsResult.data ?? []).map(connectionContract),
    bookingLinks: (linksResult.data ?? []).map(bookingLinkContract),
    permissions,
  }
}

async function updateAvailability(request: Request, admin: SupabaseClient, actor: Actor) {
  const payload = await body<JsonObject>(request)
  const timeZone = parseTimeZone(payload.timeZone)
  const workingHours = normaliseWorkingHours(payload.workingHours)
  const exceptions = normaliseAvailabilityExceptions(payload.exceptions)
  const integer = (value: unknown, fallback: number, min: number, max: number) => {
    const next = Number(value)
    return Number.isInteger(next) && next >= min && next <= max ? next : fallback
  }
  const row = {
    CALAvailability_CompanyID: actor.Company_ID,
    CALAvailability_UserID: actor.User_ID,
    CALAvailability_TimeZone: timeZone,
    CALAvailability_WorkingHoursJSON: workingHours,
    CALAvailability_ExceptionsJSON: exceptions,
    CALAvailability_MinimumNoticeMinutes: integer(payload.minimumNoticeMinutes, 120, 0, 43_200),
    CALAvailability_BookingHorizonDays: integer(payload.bookingHorizonDays, 60, 1, 365),
    CALAvailability_BufferBeforeMinutes: integer(payload.bufferBeforeMinutes, 15, 0, 240),
    CALAvailability_BufferAfterMinutes: integer(payload.bufferAfterMinutes, 15, 0, 240),
    CALAvailability_SlotIncrementMinutes: [5, 10, 15, 20, 30, 60].includes(Number(payload.slotIncrementMinutes)) ? Number(payload.slotIncrementMinutes) : 15,
    CALAvailability_UpdatedAt: new Date().toISOString(),
  }
  const { error } = await admin.from("CAL_UserAvailability").upsert(row, { onConflict: "CALAvailability_UserID" })
  if (error) throw new HttpError(400, error.message)
  return { saved: true, availability: {
    timeZone, workingHours, exceptions,
    minimumNoticeMinutes: row.CALAvailability_MinimumNoticeMinutes,
    bookingHorizonDays: row.CALAvailability_BookingHorizonDays,
    bufferBeforeMinutes: row.CALAvailability_BufferBeforeMinutes,
    bufferAfterMinutes: row.CALAvailability_BufferAfterMinutes,
    slotIncrementMinutes: row.CALAvailability_SlotIncrementMinutes,
  } }
}

async function createBookingLink(request: Request, admin: SupabaseClient, actor: Actor) {
  const payload = await body<JsonObject>(request)
  const title = cleanText(payload.title, 180)
  if (!title) throw new HttpError(400, "Booking link title is required.")
  const provider = parseProvider(payload.provider)
  await providerConnection(admin, actor, provider)
  const duration = Number(payload.durationMinutes)
  if (!Number.isInteger(duration) || duration < 15 || duration > 240 || duration % 5) throw new HttpError(400, "Choose a duration between 15 minutes and 4 hours.")
  const organiserName = `${actor.User_Firstname ?? ""} ${actor.User_Lastname ?? ""}`.trim() || actor.User_Email.split("@")[0]
  const organiserSlug = slugify(payload.organiserSlug, slugify(organiserName, "meet"))
  const baseSlug = slugify(payload.slug, slugify(title, "meeting"))
  let slug = baseSlug
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin.from("CAL_BookingLinks").insert({
      CALBookingLink_CompanyID: actor.Company_ID,
      CALBookingLink_OwnerUserID: actor.User_ID,
      CALBookingLink_OrganiserSlug: organiserSlug,
      CALBookingLink_Slug: slug,
      CALBookingLink_Title: title,
      CALBookingLink_Description: cleanText(payload.description, 5_000) || null,
      CALBookingLink_DurationMinutes: duration,
      CALBookingLink_ProviderCode: provider,
      CALBookingLink_Location: cleanText(payload.location, 500) || null,
      CALBookingLink_StatusCode: "active",
      CALBookingLink_OverrideAvailabilityJSON: payload.availability === null || payload.availability === undefined ? null : normaliseWorkingHours(payload.availability),
      CALBookingLink_MinimumNoticeMinutes: boundedInteger(payload.minimumNoticeMinutes, 0, 43_200, null),
      CALBookingLink_BookingHorizonDays: boundedInteger(payload.bookingHorizonDays, 1, 365, null),
      CALBookingLink_BufferBeforeMinutes: boundedInteger(payload.bufferBeforeMinutes, 0, 240, null),
      CALBookingLink_BufferAfterMinutes: boundedInteger(payload.bufferAfterMinutes, 0, 240, null),
      CALBookingLink_QuestionsJSON: bookingQuestions(payload.questions),
      CALBookingLink_RescheduleCutoffMinutes: boundedInteger(payload.rescheduleCutoffMinutes, 0, 43_200, 120) ?? 120,
      CALBookingLink_CancellationCutoffMinutes: boundedInteger(payload.cancellationCutoffMinutes, 0, 43_200, 120) ?? 120,
    }).select("*").single()
    if (!error && data) return bookingLinkContract(data)
    if (error?.code !== "23505") throw new HttpError(400, error?.message ?? "The booking link could not be created.")
    slug = `${baseSlug}-${attempt + 2}`
  }
  throw new HttpError(409, "Choose a different booking link address.")
}

async function updateBookingLink(request: Request, admin: SupabaseClient, actor: Actor, id: string) {
  const payload = await body<JsonObject>(request)
  const updates: Record<string, unknown> = { CALBookingLink_UpdatedAt: new Date().toISOString() }
  if (payload.title !== undefined) {
    const title = cleanText(payload.title, 180)
    if (!title) throw new HttpError(400, "Booking link title is required.")
    updates.CALBookingLink_Title = title
  }
  if (payload.description !== undefined) updates.CALBookingLink_Description = cleanText(payload.description, 5_000) || null
  if (payload.status !== undefined) {
    if (!["active", "paused", "archived"].includes(String(payload.status))) throw new HttpError(400, "Choose a valid booking link status.")
    updates.CALBookingLink_StatusCode = payload.status
  }
  if (payload.provider !== undefined) {
    const provider = parseProvider(payload.provider)
    await providerConnection(admin, actor, provider)
    updates.CALBookingLink_ProviderCode = provider
  }
  if (payload.durationMinutes !== undefined) {
    const duration = Number(payload.durationMinutes)
    if (!Number.isInteger(duration) || duration < 15 || duration > 240 || duration % 5) throw new HttpError(400, "Choose a duration between 15 minutes and 4 hours.")
    updates.CALBookingLink_DurationMinutes = duration
  }
  if (payload.location !== undefined) updates.CALBookingLink_Location = cleanText(payload.location, 500) || null
  if (payload.availability !== undefined) updates.CALBookingLink_OverrideAvailabilityJSON = payload.availability === null ? null : normaliseWorkingHours(payload.availability)
  if (payload.minimumNoticeMinutes !== undefined) updates.CALBookingLink_MinimumNoticeMinutes = boundedInteger(payload.minimumNoticeMinutes, 0, 43_200, null)
  if (payload.bookingHorizonDays !== undefined) updates.CALBookingLink_BookingHorizonDays = boundedInteger(payload.bookingHorizonDays, 1, 365, null)
  if (payload.bufferBeforeMinutes !== undefined) updates.CALBookingLink_BufferBeforeMinutes = boundedInteger(payload.bufferBeforeMinutes, 0, 240, null)
  if (payload.bufferAfterMinutes !== undefined) updates.CALBookingLink_BufferAfterMinutes = boundedInteger(payload.bufferAfterMinutes, 0, 240, null)
  if (payload.rescheduleCutoffMinutes !== undefined) updates.CALBookingLink_RescheduleCutoffMinutes = boundedInteger(payload.rescheduleCutoffMinutes, 0, 43_200, 120) ?? 120
  if (payload.cancellationCutoffMinutes !== undefined) updates.CALBookingLink_CancellationCutoffMinutes = boundedInteger(payload.cancellationCutoffMinutes, 0, 43_200, 120) ?? 120
  if (payload.questions !== undefined) updates.CALBookingLink_QuestionsJSON = bookingQuestions(payload.questions)
  const { data, error } = await admin.from("CAL_BookingLinks").update(updates)
    .eq("CALBookingLink_ID", id).eq("CALBookingLink_CompanyID", actor.Company_ID).eq("CALBookingLink_OwnerUserID", actor.User_ID)
    .select("*").maybeSingle()
  if (error) throw new HttpError(400, error.message)
  if (!data) throw new HttpError(404, "That booking link was not found.")
  return bookingLinkContract(data)
}

async function saveEmailTemplate(request: Request, admin: SupabaseClient, actor: Actor, kind: string) {
  if (!(TENANT_CUSTOMISABLE_CALENDAR_EMAIL_TEMPLATE_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Choose a tenant-brandable meeting email template.")
  const payload = await body<JsonObject>(request)
  const copy = validateCalendarEmailTemplate(kind, payload.subject, payload.body)
  const { data: current, error: currentError } = await admin.from("CAL_EmailTemplates")
    .select("CALEmailTemplate_EditVersion")
    .eq("CALEmailTemplate_CompanyID", actor.Company_ID).eq("CALEmailTemplate_KindCode", copy.kind).maybeSingle()
  if (currentError) throw new HttpError(500, "The meeting email template could not be saved.")
  const { error } = await admin.from("CAL_EmailTemplates").upsert({
    CALEmailTemplate_CompanyID: actor.Company_ID,
    CALEmailTemplate_KindCode: copy.kind,
    CALEmailTemplate_Subject: copy.subject,
    CALEmailTemplate_Body: copy.body,
    CALEmailTemplate_EditVersion: Number(current?.CALEmailTemplate_EditVersion ?? 0) + 1,
    CALEmailTemplate_UpdatedBy: actor.User_ID,
    CALEmailTemplate_UpdatedAt: new Date().toISOString(),
  }, { onConflict: "CALEmailTemplate_CompanyID,CALEmailTemplate_KindCode" })
  if (error) throw new HttpError(400, error.message)
  return await readCalendarEmailTemplate(admin, actor.Company_ID, copy.kind)
}

async function resetEmailTemplate(admin: SupabaseClient, actor: Actor, kind: string) {
  if (!(TENANT_CUSTOMISABLE_CALENDAR_EMAIL_TEMPLATE_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Choose a tenant-brandable meeting email template.")
  const { error } = await admin.from("CAL_EmailTemplates").delete()
    .eq("CALEmailTemplate_CompanyID", actor.Company_ID).eq("CALEmailTemplate_KindCode", kind)
  if (error) throw new HttpError(500, "The meeting email template could not be reset.")
  return await readCalendarEmailTemplate(admin, actor.Company_ID, kind as CalendarEmailTemplateKind)
}

async function sendEmailTemplateTest(request: Request, admin: SupabaseClient, actor: Actor, kind: string) {
  if (!(TENANT_CUSTOMISABLE_CALENDAR_EMAIL_TEMPLATE_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Choose a tenant-brandable meeting email template.")
  const payload = await body<JsonObject>(request)
  const template = payload.subject !== undefined || payload.body !== undefined
    ? { ...validateCalendarEmailTemplate(kind, payload.subject, payload.body), name: "Test", description: "", custom: true, version: 0, updatedAt: null }
    : await readCalendarEmailTemplate(admin, actor.Company_ID, kind as CalendarEmailTemplateKind)
  const brand = await readConfiguredTenantBrand(admin, actor.Company_ID)
  const organiserName = `${actor.User_Firstname ?? ""} ${actor.User_Lastname ?? ""}`.trim() || actor.User_Email
  const variables = sampleCalendarEmailVariables({ organiser_name: organiserName, attendee_name: organiserName, workspace_name: brand?.displayName || "Multideck" })
  const copy = renderCalendarEmailTemplate(template, variables)
  const rendered = renderBrandedEmail({
    subject: copy.subject,
    preview: copy.body.split(/\n+/)[0] || copy.subject,
    eyebrow: "Meeting email preview",
    title: template.name,
    body: copy.body.split(/\n\n+/).filter(Boolean),
    buttonLabel: "Open Multideck",
    buttonUrl: String(variables.manage_url),
    code: kind === "booking_verification" ? String(variables.verification_code) : undefined,
    brand,
  })
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new HttpError(503, "Email delivery is not configured for this workspace.")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MULTIDECK_EMAIL_FROM, reply_to: MULTIDECK_EMAIL_REPLY_TO, to: [actor.User_Email], subject: copy.subject, html: rendered.html, text: rendered.text }),
  })
  if (!response.ok) throw new HttpError(502, "The test email provider did not accept this message.")
  return { sent: true, email: actor.User_Email }
}

async function updateMeeting(request: Request, admin: SupabaseClient, actor: Actor, permissions: string[], id: string) {
  const { data: current, error } = await admin.from("CAL_Meetings").select("*")
    .eq("CALMeeting_ID", id).eq("CALMeeting_CompanyID", actor.Company_ID).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!current || (current.CALMeeting_OrganiserUserID !== actor.User_ID && !can(permissions, "Calendar.ManageAll"))) throw new HttpError(404, "That meeting was not found.")
  if (["cancelled", "completed"].includes(current.CALMeeting_StatusCode)) throw new HttpError(409, "This meeting can no longer be changed.")
  const payload = await body<JsonObject>(request)
  const action = cleanText(payload.action, 30) || "update"
  const connected = ["google_meet", "microsoft_teams", "zoom"].includes(current.CALMeeting_ProviderCode)
  const appearanceOnly = action === "update" && payload.colour !== undefined && Object.keys(payload).every((key) => key === "colour")
  if (appearanceOnly) {
    const nextColour = meetingColour(payload.colour, current.CALMeeting_ColourCode || "teal")
    if (nextColour === current.CALMeeting_ColourCode) return meetingContract(current)
    const { data, error: colourError } = await admin.from("CAL_Meetings").update({
      CALMeeting_ColourCode: nextColour,
      CALMeeting_EditVersion: Number(current.CALMeeting_EditVersion) + 1,
      CALMeeting_UpdatedBy: actor.User_ID,
      CALMeeting_UpdatedAt: new Date().toISOString(),
    }).eq("CALMeeting_ID", id).select(meetingSelect).single()
    if (colourError) throw new HttpError(500, "The event colour could not be changed.")
    return meetingContract(data as unknown as Record<string, unknown>)
  }
  if (action === "cancel") {
    if (connected) {
      const version = Number(current.CALMeeting_EditVersion) + 1
      const { data, error: updateError } = await admin.from("CAL_Meetings").update({
        CALMeeting_StatusCode: "sync_pending", CALMeeting_PendingChangeJSON: { kind: "cancel" }, CALMeeting_EditVersion: version,
        CALMeeting_UpdatedBy: actor.User_ID, CALMeeting_UpdatedAt: new Date().toISOString(),
      }).eq("CALMeeting_ID", id).select(meetingSelect).single()
      if (updateError) throw new HttpError(500, updateError.message)
      const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: id, CALDelivery_KindCode: "provider_cancel", CALDelivery_IdempotencyKey: `meeting:${id}:cancel:v${version}` })
      if (deliveryError) queueFailure("The cancellation could not be sent to the meeting provider.", await restorePendingMeetingSnapshot(admin, current))
      return meetingContract(data as unknown as Record<string, unknown>)
    }
    const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", current.CALMeeting_ReservationID)
    if (releaseError) throw new HttpError(500, "The meeting time could not be released.")
    const version = Number(current.CALMeeting_EditVersion) + 1
    const { data, error: updateError } = await admin.from("CAL_Meetings").update({
      CALMeeting_StatusCode: "cancelled", CALMeeting_EditVersion: version, CALMeeting_PendingChangeJSON: null,
      CALMeeting_UpdatedBy: actor.User_ID, CALMeeting_UpdatedAt: new Date().toISOString(),
    }).eq("CALMeeting_ID", id).select(meetingSelect).single()
    if (updateError) {
      await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "active" }).eq("CALReservation_ID", current.CALMeeting_ReservationID)
      throw new HttpError(500, updateError.message)
    }
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: id, CALDelivery_KindCode: "cancelled", CALDelivery_IdempotencyKey: `meeting:${id}:cancel:v${version}` })
    if (deliveryError) queueFailure("The cancellation could not be queued for attendees.", await restoreStandaloneMeetingSnapshot(admin, current))
    return meetingContract(data as unknown as Record<string, unknown>)
  }
  const { start, end } = parseMeetingRange(payload.startAt ?? current.CALMeeting_StartAt, payload.endAt ?? current.CALMeeting_EndAt)
  const version = Number(current.CALMeeting_EditVersion) + 1
  const nextTitle = cleanText(payload.title ?? current.CALMeeting_Title, 240)
  if (!nextTitle) throw new HttpError(400, "Add a meeting title.")
  const nextAgenda = cleanText(payload.agenda ?? current.CALMeeting_Agenda, 10_000) || null
  const nextTimeZone = parseTimeZone(payload.timeZone ?? current.CALMeeting_TimeZone)
  const nextLocation = cleanText(payload.location ?? current.CALMeeting_Location, 500) || null
  const nextColour = meetingColour(payload.colour, current.CALMeeting_ColourCode || "teal")
  const nextReminders = reminderMinutes(payload.reminders, Array.isArray(current.CALMeeting_RemindersJSON) ? current.CALMeeting_RemindersJSON.map(Number) : [1440, 60])
  const nextAllowReschedule = payload.allowAttendeeReschedule === undefined ? current.CALMeeting_AllowAttendeeReschedule : payload.allowAttendeeReschedule !== false
  const timeChanged = start.toISOString() !== current.CALMeeting_StartAt || end.toISOString() !== current.CALMeeting_EndAt
  if (timeChanged) {
    const { data: conflict, error: conflictError } = await admin.from("CAL_Reservations").select("CALReservation_ID")
      .eq("CALReservation_OwnerUserID", current.CALMeeting_OrganiserUserID).eq("CALReservation_StatusCode", "active")
      .neq("CALReservation_ID", current.CALMeeting_ReservationID).lt("CALReservation_StartAt", end.toISOString()).gt("CALReservation_EndAt", start.toISOString()).limit(1)
    if (conflictError) throw new HttpError(503, "That time could not be checked safely.")
    if (conflict?.length) throw new HttpError(409, "That time is no longer available.")
    const liveProviderBusy = await providerBusyRanges(admin, current.CALMeeting_OrganiserUserID, start, end, id)
    if (liveProviderBusy.length) throw new HttpError(409, "That time is no longer available on the organiser's calendar.")
  }
  const providerChange = connected && (
    timeChanged
    || nextTitle !== current.CALMeeting_Title || nextAgenda !== current.CALMeeting_Agenda
    || nextTimeZone !== current.CALMeeting_TimeZone || nextLocation !== current.CALMeeting_Location
  )
  if (providerChange) {
    const { data, error: updateError } = await admin.from("CAL_Meetings").update({
      CALMeeting_StatusCode: "sync_pending",
      CALMeeting_ColourCode: nextColour,
      CALMeeting_PendingChangeJSON: {
        kind: start.toISOString() !== current.CALMeeting_StartAt || end.toISOString() !== current.CALMeeting_EndAt ? "reschedule" : "update",
        startAt: start.toISOString(), endAt: end.toISOString(), title: nextTitle, agenda: nextAgenda,
        timeZone: nextTimeZone, location: nextLocation, reminders: nextReminders,
        allowAttendeeReschedule: nextAllowReschedule,
      },
      CALMeeting_EditVersion: version, CALMeeting_UpdatedBy: actor.User_ID, CALMeeting_UpdatedAt: new Date().toISOString(),
    }).eq("CALMeeting_ID", id).select(meetingSelect).single()
    if (updateError) throw new HttpError(500, updateError.message)
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: id, CALDelivery_KindCode: "provider_update", CALDelivery_IdempotencyKey: `meeting:${id}:update:v${version}` })
    if (deliveryError) queueFailure("The meeting change could not be sent to the provider.", await restorePendingMeetingSnapshot(admin, current))
    return meetingContract(data as unknown as Record<string, unknown>)
  }
  const { error: reservationError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: start.toISOString(), CALReservation_EndAt: end.toISOString() }).eq("CALReservation_ID", current.CALMeeting_ReservationID)
  if (reservationError?.code === "23P01") throw new HttpError(409, "That time is no longer available.")
  if (reservationError) throw new HttpError(500, reservationError.message)
  const { data, error: updateError } = await admin.from("CAL_Meetings").update({
    CALMeeting_Title: nextTitle,
    CALMeeting_Agenda: nextAgenda,
    CALMeeting_StartAt: start.toISOString(), CALMeeting_EndAt: end.toISOString(),
    CALMeeting_TimeZone: nextTimeZone,
    CALMeeting_ColourCode: nextColour,
    CALMeeting_Location: nextLocation,
    CALMeeting_RemindersJSON: nextReminders,
    CALMeeting_AllowAttendeeReschedule: nextAllowReschedule,
    CALMeeting_StatusCode: "confirmed", CALMeeting_PendingChangeJSON: null, CALMeeting_EditVersion: version,
    CALMeeting_UpdatedBy: actor.User_ID, CALMeeting_UpdatedAt: new Date().toISOString(),
    }).eq("CALMeeting_ID", id).select(meetingSelect).single()
    if (updateError) {
      const { error: rollbackError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: current.CALMeeting_StartAt, CALReservation_EndAt: current.CALMeeting_EndAt }).eq("CALReservation_ID", current.CALMeeting_ReservationID)
      queueFailure("The meeting change could not be saved.", !rollbackError)
  }
  const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: id, CALDelivery_KindCode: "rescheduled", CALDelivery_IdempotencyKey: `meeting:${id}:update:v${version}` })
  if (deliveryError) queueFailure("The meeting change could not be queued for attendees.", await restoreStandaloneMeetingSnapshot(admin, current))
  return meetingContract(data as unknown as Record<string, unknown>)
}

async function decideChangeRequest(request: Request, admin: SupabaseClient, actor: Actor, permissions: string[], meetingId: string, requestId: string) {
  const { data: meeting, error: meetingError } = await admin.from("CAL_Meetings").select("*").eq("CALMeeting_ID", meetingId).eq("CALMeeting_CompanyID", actor.Company_ID).maybeSingle()
  if (meetingError) throw new HttpError(503, "The meeting could not be checked safely.")
  if (!meeting || (meeting.CALMeeting_OrganiserUserID !== actor.User_ID && !can(permissions, "Calendar.ManageAll"))) throw new HttpError(404, "That meeting was not found.")
  const { data: change, error: changeError } = await admin.from("CAL_ChangeRequests").select("*").eq("CALChangeRequest_ID", requestId).eq("CALChangeRequest_MeetingID", meetingId).eq("CALChangeRequest_StatusCode", "pending").maybeSingle()
  if (changeError) throw new HttpError(503, "The reschedule request could not be checked safely.")
  if (!change) throw new HttpError(404, "That reschedule request is no longer pending.")
  const payload = await body<JsonObject>(request)
  const action = cleanText(payload.action, 20)
  if (action === "decline") {
    const { error: decisionError } = await admin.from("CAL_ChangeRequests").update({ CALChangeRequest_StatusCode: "declined", CALChangeRequest_DecidedBy: actor.User_ID, CALChangeRequest_DecidedAt: new Date().toISOString() }).eq("CALChangeRequest_ID", requestId)
    if (decisionError) throw new HttpError(500, "The reschedule request could not be declined.")
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: meetingId, CALDelivery_ParticipantID: change.CALChangeRequest_ParticipantID, CALDelivery_KindCode: "group_reschedule_outcome", CALDelivery_IdempotencyKey: `meeting:${meetingId}:change-request:${requestId}:declined` })
    if (deliveryError) {
      const { error: restoreError } = await admin.from("CAL_ChangeRequests").update({ CALChangeRequest_StatusCode: "pending", CALChangeRequest_DecidedBy: null, CALChangeRequest_DecidedAt: null }).eq("CALChangeRequest_ID", requestId)
      queueFailure("The response could not be queued for the attendee.", !restoreError)
    }
    return { decided: true, status: "declined" }
  }
  if (action !== "accept") throw new HttpError(400, "Approve one proposed time or decline this request.")
  const selectedStart = cleanText(payload.startAt, 120)
  const proposedTimes = Array.isArray(change.CALChangeRequest_ProposedTimesJSON) ? change.CALChangeRequest_ProposedTimesJSON.map((value: unknown) => value && typeof value === "object" ? value as JsonObject : {}) : []
  const selected = proposedTimes.find((candidate: JsonObject) => cleanText(candidate.startAt, 120) === selectedStart)
  if (!selected) throw new HttpError(400, "Choose one of the attendee's proposed times.")
  const { start, end } = parseMeetingRange(selected.startAt, selected.endAt)
  const duration = Date.parse(meeting.CALMeeting_EndAt) - Date.parse(meeting.CALMeeting_StartAt)
  if (end.getTime() - start.getTime() !== duration) throw new HttpError(400, "The proposed time must keep the same meeting duration.")
  const { data: conflict, error: conflictError } = await admin.from("CAL_Reservations").select("CALReservation_ID")
    .eq("CALReservation_OwnerUserID", meeting.CALMeeting_OrganiserUserID).eq("CALReservation_StatusCode", "active")
    .neq("CALReservation_ID", meeting.CALMeeting_ReservationID).lt("CALReservation_StartAt", end.toISOString()).gt("CALReservation_EndAt", start.toISOString()).limit(1)
  if (conflictError) throw new HttpError(503, "That proposed time could not be checked safely.")
  if (conflict?.length) throw new HttpError(409, "That proposed time is no longer available.")
  const { data: providerConflict, error: providerConflictError } = await admin.from("CAL_ProviderEvents").select("CALProviderEvent_ID")
    .eq("CALProviderEvent_OwnerUserID", meeting.CALMeeting_OrganiserUserID).eq("CALProviderEvent_IsCancelled", false)
    .neq("CALProviderEvent_MeetingID", meetingId).lt("CALProviderEvent_StartAt", end.toISOString()).gt("CALProviderEvent_EndAt", start.toISOString()).limit(1)
  if (providerConflictError) throw new HttpError(500, "Connected-calendar availability could not be checked.")
  if (providerConflict?.length) throw new HttpError(409, "That proposed time is no longer available on the organiser's calendar.")
  const liveProviderBusy = await providerBusyRanges(admin, meeting.CALMeeting_OrganiserUserID, start, end, meetingId)
  if (liveProviderBusy.length) throw new HttpError(409, "That proposed time is no longer available on the organiser's calendar.")
  const connected = ["google_meet", "microsoft_teams", "zoom"].includes(meeting.CALMeeting_ProviderCode)
  const version = Number(meeting.CALMeeting_EditVersion) + 1
  if (connected) {
    const { error: pendingError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "sync_pending", CALMeeting_PendingChangeJSON: { kind: "reschedule", startAt: start.toISOString(), endAt: end.toISOString(), changeRequestId: requestId, decidedBy: actor.User_ID }, CALMeeting_EditVersion: version, CALMeeting_UpdatedBy: actor.User_ID, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", meetingId)
    if (pendingError) throw new HttpError(500, "The provider update could not be prepared.")
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: meetingId, CALDelivery_KindCode: "provider_update", CALDelivery_IdempotencyKey: `meeting:${meetingId}:change-request:${requestId}:approved` })
    if (deliveryError) queueFailure("The approved time could not be sent to the provider.", await restorePendingMeetingSnapshot(admin, meeting))
    return { decided: false, finalising: true, status: "pending" }
  }
  const { error: reservationError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: start.toISOString(), CALReservation_EndAt: end.toISOString() }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
  if (reservationError?.code === "23P01") throw new HttpError(409, "That proposed time is no longer available.")
  if (reservationError) throw new HttpError(500, "The new meeting time could not be reserved.")
  const { error: meetingUpdateError } = await admin.from("CAL_Meetings").update({ CALMeeting_StartAt: start.toISOString(), CALMeeting_EndAt: end.toISOString(), CALMeeting_EditVersion: version, CALMeeting_UpdatedBy: actor.User_ID, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", meetingId)
  if (meetingUpdateError) {
    const { error: rollbackError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: meeting.CALMeeting_StartAt, CALReservation_EndAt: meeting.CALMeeting_EndAt }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
    queueFailure("The approved meeting time could not be saved.", !rollbackError)
  }
  const { error: changeUpdateError } = await admin.from("CAL_ChangeRequests").update({ CALChangeRequest_StatusCode: "accepted", CALChangeRequest_SelectedStartAt: start.toISOString(), CALChangeRequest_SelectedEndAt: end.toISOString(), CALChangeRequest_DecidedBy: actor.User_ID, CALChangeRequest_DecidedAt: new Date().toISOString() }).eq("CALChangeRequest_ID", requestId)
  if (changeUpdateError) queueFailure("The reschedule request could not be completed.", await restoreStandaloneMeetingSnapshot(admin, meeting))
  const { data: participants, error: participantsError } = await admin.from("CAL_MeetingParticipants").select("CALParticipant_ID").eq("CALParticipant_MeetingID", meetingId)
  if (participantsError) {
    const { error: changeRestoreError } = await admin.from("CAL_ChangeRequests").update({ CALChangeRequest_StatusCode: "pending", CALChangeRequest_SelectedStartAt: null, CALChangeRequest_SelectedEndAt: null, CALChangeRequest_DecidedBy: null, CALChangeRequest_DecidedAt: null }).eq("CALChangeRequest_ID", requestId)
    queueFailure("The attendee updates could not be prepared.", await restoreStandaloneMeetingSnapshot(admin, meeting) && !changeRestoreError)
  }
  if (participants?.length) {
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert(participants.map((participant) => ({ CALDelivery_CompanyID: actor.Company_ID, CALDelivery_MeetingID: meetingId, CALDelivery_ParticipantID: participant.CALParticipant_ID, CALDelivery_KindCode: participant.CALParticipant_ID === change.CALChangeRequest_ParticipantID ? "group_reschedule_outcome" : "rescheduled", CALDelivery_IdempotencyKey: `meeting:${meetingId}:change-request:${requestId}:participant:${participant.CALParticipant_ID}` })))
    if (deliveryError) {
      const { error: changeRestoreError } = await admin.from("CAL_ChangeRequests").update({ CALChangeRequest_StatusCode: "pending", CALChangeRequest_SelectedStartAt: null, CALChangeRequest_SelectedEndAt: null, CALChangeRequest_DecidedBy: null, CALChangeRequest_DecidedAt: null }).eq("CALChangeRequest_ID", requestId)
      queueFailure("The approved time could not be queued for attendees.", await restoreStandaloneMeetingSnapshot(admin, meeting) && !changeRestoreError)
    }
  }
  return { decided: true, status: "accepted", startAt: start.toISOString(), endAt: end.toISOString() }
}

async function crmMeetingContext(admin: SupabaseClient, type: string, id: string) {
  if (type === "lead") {
    const { data, error } = await admin.from("CRM_Leads").select("CRMLead_ID,CRMLead_PersonName,CRMLead_CompanyName,CRMLead_Email,CRMLead_Phone")
      .eq("CRMLead_ID", id).eq("CRMLead_IsDeleted", false).maybeSingle()
    if (error) throw new HttpError(503, "That lead could not be checked safely.")
    if (!data) throw new HttpError(404, "That lead was not found.")
    return { type, id: data.CRMLead_ID, name: data.CRMLead_PersonName || data.CRMLead_CompanyName || "Lead", company: data.CRMLead_CompanyName, attendees: data.CRMLead_Email ? [{ name: data.CRMLead_PersonName || data.CRMLead_CompanyName || data.CRMLead_Email, email: data.CRMLead_Email }] : [] }
  }
  if (type === "account") {
    const { data: account, error: accountError } = await admin.from("CRM_AccountProfiles").select("CRMAccount_ID,CRMAccount_OrgID")
      .eq("CRMAccount_ID", id).eq("CRMAccount_IsDeleted", false).maybeSingle()
    if (accountError) throw new HttpError(503, "That company could not be checked safely.")
    if (!account) throw new HttpError(404, "That company was not found.")
    const [{ data: organisation, error: organisationError }, { data: contacts, error: contactsError }] = await Promise.all([
      admin.from("Org_Master").select("Org_Name").eq("Org_id", account.CRMAccount_OrgID).maybeSingle(),
      admin.from("Org_Contacts").select("OrgContact_ID,OrgContact_FirstName,OrgContact_LastName,OrgContact_Emails(OrgContactEmail_Email)").eq("Org_ID", account.CRMAccount_OrgID).limit(10),
    ])
    if (organisationError || contactsError) throw new HttpError(503, "That company's meeting contacts could not be loaded safely.")
    return {
      type, id: account.CRMAccount_ID, name: organisation?.Org_Name || "Company", company: organisation?.Org_Name || null,
      attendees: (contacts ?? []).flatMap((contact) => {
        const emailRow = Array.isArray(contact.OrgContact_Emails) ? contact.OrgContact_Emails[0] : contact.OrgContact_Emails
        const email = emailRow?.OrgContactEmail_Email
        if (!email) return []
        return [{ name: `${contact.OrgContact_FirstName ?? ""} ${contact.OrgContact_LastName ?? ""}`.trim() || email, email }]
      }),
    }
  }
  throw new HttpError(400, "Choose a lead or company.")
}

type MeetingPerson = {
  id: string
  kind: "team" | "contact" | "lead"
  name: string
  email: string
  detail: string | null
  recordId: string
  external: boolean
}

/** Keeps a typed search term safe inside a PostgREST `or()` filter and an `ilike` pattern. */
function searchTerm(value: unknown) {
  return cleanText(value, 80).replace(/[%_,()\\]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * Attendee suggestions for the meeting composer: colleagues in this tenant first,
 * then CRM contacts the operator can already see, then leads. Only people with an
 * email address are returned because every attendee receives their own invitation.
 *
 * This is a typeahead over data Dexter already reads through the team, contacts
 * and leads domains, so it deliberately adds no new Dexter domain or watch adapter.
 */
async function searchMeetingPeople(admin: SupabaseClient, actor: Actor, url: URL) {
  const term = searchTerm(url.searchParams.get("q"))
  const pattern = `%${term}%`
  const people: MeetingPerson[] = []
  const seen = new Set<string>()
  const push = (person: Omit<MeetingPerson, "id">) => {
    const email = String(person.email ?? "").trim().toLowerCase()
    if (!email || !email.includes("@") || seen.has(email) || email === actor.User_Email.toLowerCase()) return
    seen.add(email)
    people.push({ ...person, id: `${person.kind}:${person.recordId}`, email })
  }

  let userQuery = admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email,User_JobTitle")
    .eq("Company_ID", actor.Company_ID).eq("User_AccessStatus", "active").neq("User_ID", actor.User_ID)
    .order("User_Firstname").order("User_Lastname").limit(term ? 6 : 8)
  if (term) userQuery = userQuery.or(`User_Firstname.ilike.${pattern},User_Lastname.ilike.${pattern},User_Email.ilike.${pattern}`)
  const { data: users, error: usersError } = await userQuery
  if (usersError) throw new HttpError(500, usersError.message)
  for (const user of users ?? []) {
    push({ kind: "team", recordId: user.User_ID, external: false, email: user.User_Email, detail: user.User_JobTitle || "Your team", name: [user.User_Firstname, user.User_Lastname].filter(Boolean).join(" ").trim() || user.User_Email })
  }
  if (!term) return { people }

  const { data: accessible, error: accessibleError } = await admin.rpc("multideck_crm_accessible_account_ids", { p_company_id: actor.Company_ID })
  if (accessibleError) throw new HttpError(500, accessibleError.message)
  const orgIds = [...new Set((accessible ?? []).map((row: Record<string, unknown>) => String(row.account_id ?? "")).filter(Boolean))]
  if (orgIds.length) {
    const [{ data: byName, error: byNameError }, { data: byEmail, error: byEmailError }] = await Promise.all([
      admin.from("Org_Contacts").select("OrgContact_ID").in("Org_ID", orgIds).or(`OrgContact_FirstName.ilike.${pattern},OrgContact_LastName.ilike.${pattern}`).limit(8),
      admin.from("OrgContact_Emails").select("OrgContact_ID").eq("OrgContactEmail_IsActive", true).ilike("OrgContactEmail_Email", pattern).limit(8),
    ])
    if (byNameError || byEmailError) throw new HttpError(500, (byNameError ?? byEmailError)?.message ?? "Contacts could not be searched.")
    const contactIds = [...new Set([...(byName ?? []), ...(byEmail ?? [])].map((row) => String(row.OrgContact_ID)))]
    if (contactIds.length) {
      const { data: contacts, error: contactsError } = await admin.from("Org_Contacts")
        .select("OrgContact_ID,Org_ID,OrgContact_FirstName,OrgContact_LastName,OrgContact_Emails(OrgContactEmail_Email,OrgContactEmail_IsPrimary,OrgContactEmail_IsActive)")
        .in("OrgContact_ID", contactIds).in("Org_ID", orgIds).order("OrgContact_LastName").limit(8)
      if (contactsError) throw new HttpError(500, contactsError.message)
      const { data: organisations, error: organisationsError } = await admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", [...new Set((contacts ?? []).map((contact) => contact.Org_ID))])
      if (organisationsError) throw new HttpError(503, "Contact companies could not be loaded safely.")
      const orgNames = new Map((organisations ?? []).map((organisation) => [organisation.Org_id, organisation.Org_Name]))
      for (const contact of contacts ?? []) {
        const emails = (Array.isArray(contact.OrgContact_Emails) ? contact.OrgContact_Emails : [contact.OrgContact_Emails]).filter((row) => row?.OrgContactEmail_IsActive !== false)
        const email = (emails.find((row) => row?.OrgContactEmail_IsPrimary) ?? emails[0])?.OrgContactEmail_Email
        if (!email) continue
        push({ kind: "contact", recordId: contact.OrgContact_ID, external: true, email, detail: orgNames.get(contact.Org_ID) || "Contact", name: [contact.OrgContact_FirstName, contact.OrgContact_LastName].filter(Boolean).join(" ").trim() || email })
      }
    }
  }

  const { data: leads, error: leadsError } = await admin.from("CRM_Leads").select("CRMLead_ID,CRMLead_PersonName,CRMLead_CompanyName,CRMLead_Email")
    .eq("CRMLead_IsDeleted", false).not("CRMLead_Email", "is", null)
    .or(`CRMLead_PersonName.ilike.${pattern},CRMLead_CompanyName.ilike.${pattern},CRMLead_Email.ilike.${pattern}`)
    .order("CRMLead_UpdatedAt", { ascending: false }).limit(6)
  if (leadsError) throw new HttpError(500, leadsError.message)
  for (const lead of leads ?? []) {
    push({ kind: "lead", recordId: lead.CRMLead_ID, external: true, email: lead.CRMLead_Email, detail: lead.CRMLead_CompanyName ? `Lead · ${lead.CRMLead_CompanyName}` : "Lead", name: lead.CRMLead_PersonName || lead.CRMLead_CompanyName || lead.CRMLead_Email })
  }
  return { people }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, {}, 204)
  try {
    const { admin, user } = await authenticate(request)
    const actor = await currentInternalUser(admin, user)
    ensureCompany(actor)
    const permissions = await permissionValues(admin, actor.User_ID)
    if (!can(permissions, "Calendar.Read")) throw new HttpError(403, "You do not have permission to view Calendar.")
    const path = routeParts(request, "calendar-api")
    const url = new URL(request.url)

    if ((path.length === 0 || path[0] === "workspace") && request.method === "GET") return json(request, await listWorkspace(admin, actor, permissions, url))
    if (path[0] === "meetings" && path.length === 1 && request.method === "POST") {
      if (!can(permissions, "Calendar.ManageOwn")) throw new HttpError(403, "You do not have permission to schedule meetings.")
      return json(request, await createMeeting(admin, actor, await body<JsonObject>(request), cleanText(request.headers.get("x-multideck-meeting-source"), 24) || "calendar"), 201)
    }
    if (path[0] === "meetings" && path[1] && path.length === 2 && request.method === "PATCH") {
      if (!can(permissions, "Calendar.ManageOwn")) throw new HttpError(403, "You do not have permission to change meetings.")
      return json(request, await updateMeeting(request, admin, actor, permissions, path[1]))
    }
    if (path[0] === "meetings" && path[1] && path[2] === "change-requests" && path[3] && request.method === "PATCH") {
      if (!can(permissions, "Calendar.ManageOwn")) throw new HttpError(403, "You do not have permission to decide meeting changes.")
      return json(request, await decideChangeRequest(request, admin, actor, permissions, path[1], path[3]))
    }
    if (path[0] === "availability" && request.method === "PUT") {
      if (!can(permissions, "Calendar.ManageOwn")) throw new HttpError(403, "You do not have permission to change availability.")
      return json(request, await updateAvailability(request, admin, actor))
    }
    if (path[0] === "connections" && path[1] && path.length === 2 && request.method === "PATCH") {
      if (!can(permissions, "Calendar.Connect")) throw new HttpError(403, "You do not have permission to manage personal calendar connections.")
      return json(request, await updateConnectionColour(request, admin, actor, path[1]))
    }
    if (path[0] === "booking-links" && path.length === 1 && request.method === "POST") {
      if (!can(permissions, "Calendar.BookingLinks.Manage")) throw new HttpError(403, "You do not have permission to manage booking links.")
      return json(request, await createBookingLink(request, admin, actor), 201)
    }
    if (path[0] === "booking-links" && path[1] && request.method === "PATCH") {
      if (!can(permissions, "Calendar.BookingLinks.Manage")) throw new HttpError(403, "You do not have permission to manage booking links.")
      return json(request, await updateBookingLink(request, admin, actor, path[1]))
    }
    if (path[0] === "templates" && path.length === 1 && request.method === "GET") {
      if (!can(permissions, "Calendar.Templates.Manage")) throw new HttpError(403, "You do not have permission to manage meeting email templates.")
      return json(request, { templates: await listCalendarEmailTemplates(admin, actor.Company_ID) })
    }
    if (path[0] === "templates" && path[1] && path.length === 2 && request.method === "PUT") {
      if (!can(permissions, "Calendar.Templates.Manage")) throw new HttpError(403, "You do not have permission to manage meeting email templates.")
      return json(request, await saveEmailTemplate(request, admin, actor, path[1]))
    }
    if (path[0] === "templates" && path[1] && path[2] === "reset" && request.method === "POST") {
      if (!can(permissions, "Calendar.Templates.Manage")) throw new HttpError(403, "You do not have permission to manage meeting email templates.")
      return json(request, await resetEmailTemplate(admin, actor, path[1]))
    }
    if (path[0] === "templates" && path[1] && path[2] === "test" && request.method === "POST") {
      if (!can(permissions, "Calendar.Templates.Manage")) throw new HttpError(403, "You do not have permission to manage meeting email templates.")
      return json(request, await sendEmailTemplateTest(request, admin, actor, path[1]))
    }
    if (path[0] === "crm-context" && path[1] && path[2] && request.method === "GET") {
      return json(request, await crmMeetingContext(admin, path[1], path[2]))
    }
    if (path[0] === "people" && path.length === 1 && request.method === "GET") {
      return json(request, await searchMeetingPeople(admin, actor, url))
    }
    throw new HttpError(404, "Calendar endpoint not found.")
  } catch (error) {
    return failure(request, error)
  }
})
