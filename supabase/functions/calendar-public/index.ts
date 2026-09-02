import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { adminClient, body, failure, HttpError, isTrustedMultideckOrigin, json, routeParts } from "../_shared/backend.ts"
import {
  availableSlots,
  cleanText,
  DEFAULT_WORKING_HOURS,
  emailAddress,
  parseMeetingRange,
  parseTimeZone,
  randomToken,
  sha256,
  verificationCode,
  type BusyRange,
  type WorkingHours,
} from "../_shared/calendar.ts"
import { renderBrandedEmail } from "../_shared/email-template.ts"
import { defaultCalendarEmailTemplate, renderCalendarEmailTemplate } from "../_shared/calendar-email-templates.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"
import { readConfiguredTenantBrand } from "../_shared/tenant-branding.ts"
import { providerBusyRanges } from "../_shared/calendar-provider-availability.ts"

type JsonObject = Record<string, unknown>
const MAX_PUBLIC_AVAILABILITY_RANGE_MS = 90 * 86_400_000
type BookingLinkRow = Record<string, unknown> & {
  CALBookingLink_ID: string
  CALBookingLink_CompanyID: string
  CALBookingLink_OwnerUserID: string
  CALBookingLink_Title: string
  CALBookingLink_DurationMinutes: number
  CALBookingLink_ProviderCode: string
  CALBookingLink_StatusCode: string
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function publicQuestions(row: BookingLinkRow) {
  const fallback = [
    { id: "company", label: "Company", type: "short_text", required: false, builtIn: true },
    { id: "phone", label: "Phone", type: "short_text", required: false, builtIn: true },
    { id: "notes", label: "What would you like to discuss?", type: "long_text", required: false, builtIn: true },
  ]
  const source = Array.isArray(row.CALBookingLink_QuestionsJSON) && row.CALBookingLink_QuestionsJSON.length ? row.CALBookingLink_QuestionsJSON : fallback
  return source.slice(0, 10).flatMap((value: unknown, index: number) => {
    const question = object(value)
    const label = cleanText(question.label, 180)
    if (!label) return []
    const requestedId = cleanText(question.id, 80)
    const builtIn = ["company", "phone", "notes"].includes(requestedId)
    return [{ id: builtIn ? requestedId : requestedId || `question-${index + 1}`, label, type: question.type === "long_text" ? "long_text" : "short_text", required: question.required === true, builtIn }]
  })
}

function originFor(request: Request) {
  const origin = request.headers.get("Origin")?.trim()
  if (origin && isTrustedMultideckOrigin(origin)) return origin
  const configured = Deno.env.get("APP_URL")?.trim()
  return configured && isTrustedMultideckOrigin(configured) ? configured : "https://multideck.app"
}

function requestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return cleanText(request.headers.get("cf-connecting-ip") || forwarded || request.headers.get("x-real-ip") || "unknown", 120)
}

function companyName(row: Record<string, unknown> | null) {
  return cleanText(row?.Company_Name, 240) || "Multideck workspace"
}

function organiserFrom(row: BookingLinkRow) {
  const value = row.cmp_Users
  const organiser = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null
  return {
    id: cleanText(organiser?.User_ID, 60) || row.CALBookingLink_OwnerUserID,
    name: `${cleanText(organiser?.User_Firstname, 80)} ${cleanText(organiser?.User_Lastname, 80)}`.trim() || "Your host",
    email: cleanText(organiser?.User_Email, 320),
  }
}

async function loadBookingLink(admin: SupabaseClient, organiserSlug: string, bookingSlug: string, allowInactive = false) {
  const { data, error } = await admin.from("CAL_BookingLinks").select("*")
    .eq("CALBookingLink_OrganiserSlug", organiserSlug)
    .eq("CALBookingLink_Slug", bookingSlug).maybeSingle()
  if (error) throw new HttpError(500, "This booking page could not be loaded.")
  if (!data || (!allowInactive && data.CALBookingLink_StatusCode !== "active")) throw new HttpError(404, "This booking link is not available.")
  const { data: organiser, error: organiserError } = await admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email")
    .eq("User_ID", data.CALBookingLink_OwnerUserID).maybeSingle()
  if (organiserError || !organiser) throw new HttpError(404, "The organiser for this booking link is not available.")
  data.cmp_Users = organiser
  return data as BookingLinkRow
}

async function publicBrand(admin: SupabaseClient, companyId: string) {
  const [{ data: company, error: companyError }, brand] = await Promise.all([
    admin.from("cmp_Company").select("Company_Name").eq("Company_ID", companyId).maybeSingle(),
    readConfiguredTenantBrand(admin, companyId),
  ])
  if (companyError) throw new HttpError(503, "This workspace branding could not be loaded safely.")
  return { brand, workspaceName: brand?.displayName || companyName(company) }
}

function bookingContract(row: BookingLinkRow, branding: Awaited<ReturnType<typeof publicBrand>>) {
  const organiser = organiserFrom(row)
  return {
    title: row.CALBookingLink_Title,
    description: row.CALBookingLink_Description,
    durationMinutes: row.CALBookingLink_DurationMinutes,
    provider: row.CALBookingLink_ProviderCode,
    location: row.CALBookingLink_Location,
    organiser: { name: organiser.name },
    questions: publicQuestions(row),
    status: row.CALBookingLink_StatusCode,
    branding: branding.brand ? {
      displayName: branding.brand.displayName,
      logoUrl: branding.brand.logoUrl,
      primaryColor: branding.brand.primaryColor,
      secondaryColor: branding.brand.secondaryColor,
      backgroundColor: branding.brand.backgroundColor,
      surfaceColor: branding.brand.surfaceColor,
      textColor: branding.brand.textColor,
      appearanceMode: branding.brand.appearanceMode,
      cornerStyle: branding.brand.cornerStyle,
      emailSignOff: branding.brand.emailSignOff,
    } : null,
    workspaceName: branding.workspaceName,
  }
}

async function readAvailability(admin: SupabaseClient, row: BookingLinkRow, from: Date, until: Date, options: {
  durationMinutes?: number
  excludeReservationId?: string | null
  excludeMeetingId?: string | null
} = {}) {
  const { data: preferences, error } = await admin.from("CAL_UserAvailability").select("*")
    .eq("CALAvailability_UserID", row.CALBookingLink_OwnerUserID).maybeSingle()
  if (error) throw new HttpError(500, "Available times could not be loaded.")
  const timeZone = preferences?.CALAvailability_TimeZone ?? "Europe/London"
  const workingHours = (row.CALBookingLink_OverrideAvailabilityJSON ?? preferences?.CALAvailability_WorkingHoursJSON ?? DEFAULT_WORKING_HOURS) as WorkingHours
  const notice = Number(row.CALBookingLink_MinimumNoticeMinutes ?? preferences?.CALAvailability_MinimumNoticeMinutes ?? 120)
  const horizon = Number(row.CALBookingLink_BookingHorizonDays ?? preferences?.CALAvailability_BookingHorizonDays ?? 60)
  const bufferBefore = Number(row.CALBookingLink_BufferBeforeMinutes ?? preferences?.CALAvailability_BufferBeforeMinutes ?? 15)
  const bufferAfter = Number(row.CALBookingLink_BufferAfterMinutes ?? preferences?.CALAvailability_BufferAfterMinutes ?? 15)
  const increment = Number(preferences?.CALAvailability_SlotIncrementMinutes ?? 15)
  const horizonEnd = new Date(Date.now() + horizon * 86_400_000)
  const cappedUntil = until < horizonEnd ? until : horizonEnd
  let reservationQuery = admin.from("CAL_Reservations").select("CALReservation_ID,CALReservation_StartAt,CALReservation_EndAt,CALReservation_BufferBeforeMinutes,CALReservation_BufferAfterMinutes")
      .eq("CALReservation_OwnerUserID", row.CALBookingLink_OwnerUserID).eq("CALReservation_StatusCode", "active")
      .lt("CALReservation_StartAt", cappedUntil.toISOString()).gt("CALReservation_EndAt", from.toISOString())
  if (options.excludeReservationId) reservationQuery = reservationQuery.neq("CALReservation_ID", options.excludeReservationId)
  const [reservations, providerEvents] = await Promise.all([
    reservationQuery,
    admin.from("CAL_ProviderEvents").select("CALProviderEvent_MeetingID,CALProviderEvent_StartAt,CALProviderEvent_EndAt")
      .eq("CALProviderEvent_OwnerUserID", row.CALBookingLink_OwnerUserID).eq("CALProviderEvent_IsCancelled", false)
      .lt("CALProviderEvent_StartAt", cappedUntil.toISOString()).gt("CALProviderEvent_EndAt", from.toISOString()),
  ])
  if (reservations.error || providerEvents.error) throw new HttpError(500, "Available times could not be loaded.")
  const busy: BusyRange[] = [
    ...(reservations.data ?? []).map((item) => ({
      startAt: new Date(Date.parse(item.CALReservation_StartAt) - Number(item.CALReservation_BufferBeforeMinutes || 0) * 60_000).toISOString(),
      endAt: new Date(Date.parse(item.CALReservation_EndAt) + Number(item.CALReservation_BufferAfterMinutes || 0) * 60_000).toISOString(),
    })),
    ...(providerEvents.data ?? [])
      .filter((item) => !options.excludeMeetingId || item.CALProviderEvent_MeetingID !== options.excludeMeetingId)
      .map((item) => ({ startAt: item.CALProviderEvent_StartAt, endAt: item.CALProviderEvent_EndAt })),
  ]
  return {
    timeZone,
    slots: availableSlots({
      from,
      until: cappedUntil,
      timeZone,
      durationMinutes: Number(options.durationMinutes ?? row.CALBookingLink_DurationMinutes),
      incrementMinutes: increment,
      noticeMinutes: notice,
      bufferBeforeMinutes: bufferBefore,
      bufferAfterMinutes: bufferAfter,
      workingHours,
      exceptions: Array.isArray(preferences?.CALAvailability_ExceptionsJSON) ? preferences.CALAvailability_ExceptionsJSON : [],
      busy,
    }),
    rules: { noticeMinutes: notice, horizonDays: horizon, bufferBeforeMinutes: bufferBefore, bufferAfterMinutes: bufferAfter, incrementMinutes: increment },
  }
}

async function rateLimit(admin: SupabaseClient, companyId: string, action: "hold" | "verify" | "resend" | "manage", subject: string, maximum: number) {
  const windowStartedAt = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString()
  const subjectHash = await sha256(subject)
  const { data, error } = await admin.rpc("multideck_calendar_consume_public_rate_limit", {
    p_company_id: companyId,
    p_action: action,
    p_subject_hash: subjectHash,
    p_window_started_at: windowStartedAt,
  })
  if (error) throw new HttpError(503, "This request could not be checked safely. Try again shortly.")
  const count = Number(data)
  if (count > maximum) throw new HttpError(429, "Too many attempts. Wait a little before trying again.")
}

async function restoreManagedMeetingSnapshot(admin: SupabaseClient, meeting: Record<string, unknown>, restoreTime = false) {
  if (restoreTime && meeting.CALMeeting_ReservationID) {
    const { error } = await admin.from("CAL_Reservations").update({
      CALReservation_StartAt: meeting.CALMeeting_StartAt,
      CALReservation_EndAt: meeting.CALMeeting_EndAt,
      CALReservation_StatusCode: "active",
    }).eq("CALReservation_ID", meeting.CALMeeting_ReservationID)
    if (error) return false
  }
  const patch: JsonObject = {
    CALMeeting_StatusCode: meeting.CALMeeting_StatusCode,
    CALMeeting_PendingChangeJSON: meeting.CALMeeting_PendingChangeJSON,
    CALMeeting_EditVersion: meeting.CALMeeting_EditVersion,
    CALMeeting_UpdatedAt: meeting.CALMeeting_UpdatedAt,
  }
  if (restoreTime) {
    patch.CALMeeting_StartAt = meeting.CALMeeting_StartAt
    patch.CALMeeting_EndAt = meeting.CALMeeting_EndAt
  }
  const { error } = await admin.from("CAL_Meetings").update(patch).eq("CALMeeting_ID", meeting.CALMeeting_ID)
  return !error
}

function managementQueueFailure(message: string, restored: boolean): never {
  throw new HttpError(503, restored ? `${message} No meeting change was saved.` : `${message} Refresh the meeting before trying again.`)
}

async function secureManagementToken(admin: SupabaseClient, participantId: string, token: string) {
  const { data, error } = await admin.rpc("calendar_put_secret", {
    p_secret: token,
    p_name: `meeting-management-${participantId}`,
    p_description: "Encrypted Multideck attendee management token",
  })
  if (error || typeof data !== "string") throw new HttpError(503, "The private meeting management link could not be secured.")
  return data
}

function bookingMeetingContract(meeting: Record<string, unknown>) {
  return {
    id: meeting.CALMeeting_ID,
    title: meeting.CALMeeting_Title,
    agenda: meeting.CALMeeting_Agenda,
    startAt: meeting.CALMeeting_StartAt,
    endAt: meeting.CALMeeting_EndAt,
    timeZone: meeting.CALMeeting_TimeZone,
    status: meeting.CALMeeting_StatusCode,
    provider: meeting.CALMeeting_ProviderCode,
    location: meeting.CALMeeting_Location,
    joinUrl: meeting.CALMeeting_JoinURL,
    bookingLinkId: meeting.CALMeeting_BookingLinkID,
    allowAttendeeReschedule: meeting.CALMeeting_AllowAttendeeReschedule,
    reminders: meeting.CALMeeting_RemindersJSON,
    source: meeting.CALMeeting_SourceCode,
    version: meeting.CALMeeting_EditVersion,
    syncError: meeting.CALMeeting_LastSyncError,
    canEdit: false,
  }
}

async function readManagementToken(admin: SupabaseClient, secretRef: unknown) {
  if (typeof secretRef !== "string" || !secretRef) return null
  const { data, error } = await admin.rpc("calendar_get_secret", { p_secret_ref: secretRef })
  if (error) throw new HttpError(503, "The private meeting management link could not be loaded safely.")
  return typeof data === "string" && data ? data : null
}

async function ensureBookingParticipantAndManagement(
  admin: SupabaseClient,
  row: BookingLinkRow,
  hold: Record<string, unknown>,
  meeting: Record<string, unknown>,
) {
  const { data: participant, error: participantError } = await admin.from("CAL_MeetingParticipants").upsert({
    CALParticipant_MeetingID: meeting.CALMeeting_ID,
    CALParticipant_Name: hold.CALBookingHold_Name,
    CALParticipant_Email: hold.CALBookingHold_Email,
    CALParticipant_RoleCode: "attendee",
    CALParticipant_IsExternal: true,
  }, { onConflict: "CALParticipant_MeetingID,CALParticipant_Email" }).select("*").single()
  if (participantError || !participant) throw new HttpError(500, "The meeting attendee could not be secured. Your hold remains active.")

  const { data: existing, error: existingError } = await admin.from("CAL_ManagementTokens")
    .select("CALManagementToken_SecretRef")
    .eq("CALManagementToken_ParticipantID", participant.CALParticipant_ID)
    .is("CALManagementToken_RevokedAt", null)
    .gt("CALManagementToken_ExpiresAt", new Date().toISOString())
    .order("CALManagementToken_CreatedAt", { ascending: false }).limit(1).maybeSingle()
  if (existingError) throw new HttpError(503, "The attendee management link could not be checked safely.")
  const existingToken = await readManagementToken(admin, existing?.CALManagementToken_SecretRef)
  if (existingToken) return { participant, managementToken: existingToken }

  const managementToken = randomToken(36)
  const managementSecretRef = await secureManagementToken(admin, participant.CALParticipant_ID, managementToken)
  const { error: managementError } = await admin.from("CAL_ManagementTokens").insert({
    CALManagementToken_CompanyID: row.CALBookingLink_CompanyID,
    CALManagementToken_ParticipantID: participant.CALParticipant_ID,
    CALManagementToken_TokenHash: await sha256(managementToken),
    CALManagementToken_SecretRef: managementSecretRef,
    CALManagementToken_ExpiresAt: new Date(Date.parse(String(meeting.CALMeeting_EndAt)) + 30 * 86_400_000).toISOString(),
  })
  if (managementError) {
    await admin.rpc("calendar_delete_secret", { p_secret_ref: managementSecretRef })
    throw new HttpError(500, "The private meeting management link could not be created. Your hold remains active.")
  }
  return { participant, managementToken }
}

async function ensureBookingDeliveries(
  admin: SupabaseClient,
  row: BookingLinkRow,
  meeting: Record<string, unknown>,
  participant: Record<string, unknown>,
  managementToken: string,
) {
  const providerMeeting = ["google_meet", "microsoft_teams", "zoom"].includes(String(meeting.CALMeeting_ProviderCode))
  const status = String(meeting.CALMeeting_StatusCode)
  const rows: JsonObject[] = [{
    CALDelivery_CompanyID: row.CALBookingLink_CompanyID,
    CALDelivery_MeetingID: meeting.CALMeeting_ID,
    CALDelivery_KindCode: "crm_link",
    CALDelivery_IdempotencyKey: `meeting:${meeting.CALMeeting_ID}:crm-link`,
  }]
  if (providerMeeting && status === "provisioning") {
    rows.push({
      CALDelivery_CompanyID: row.CALBookingLink_CompanyID,
      CALDelivery_MeetingID: meeting.CALMeeting_ID,
      CALDelivery_ParticipantID: participant.CALParticipant_ID,
      CALDelivery_KindCode: "provider_create",
      CALDelivery_IdempotencyKey: `meeting:${meeting.CALMeeting_ID}:create:v1`,
      CALDelivery_RenderedJSON: { managementToken },
    })
  } else if (providerMeeting && status === "confirmed") {
    rows.push({
      CALDelivery_CompanyID: row.CALBookingLink_CompanyID,
      CALDelivery_MeetingID: meeting.CALMeeting_ID,
      CALDelivery_ParticipantID: participant.CALParticipant_ID,
      CALDelivery_KindCode: "management",
      CALDelivery_IdempotencyKey: `meeting:${meeting.CALMeeting_ID}:participant:${participant.CALParticipant_ID}:management:v${meeting.CALMeeting_EditVersion}`,
      CALDelivery_RenderedJSON: { managementToken },
    })
  } else if (!providerMeeting && status === "confirmed") {
    rows.push({
      CALDelivery_CompanyID: row.CALBookingLink_CompanyID,
      CALDelivery_MeetingID: meeting.CALMeeting_ID,
      CALDelivery_ParticipantID: participant.CALParticipant_ID,
      CALDelivery_KindCode: "standalone_confirmation",
      CALDelivery_IdempotencyKey: `meeting:${meeting.CALMeeting_ID}:create:v1`,
      CALDelivery_RenderedJSON: { managementToken },
    })
  }
  const { error } = await admin.from("CAL_Deliveries").upsert(rows, { onConflict: "CALDelivery_IdempotencyKey", ignoreDuplicates: true })
  if (error) throw new HttpError(500, "The meeting communications could not be queued.")
}

async function bookingConfirmation(
  admin: SupabaseClient,
  row: BookingLinkRow,
  hold: Record<string, unknown>,
  meeting: Record<string, unknown>,
) {
  const { participant, managementToken } = await ensureBookingParticipantAndManagement(admin, row, hold, meeting)
  await ensureBookingDeliveries(admin, row, meeting, participant, managementToken)
  const status = String(meeting.CALMeeting_StatusCode)
  return {
    confirmed: status === "confirmed",
    finalising: status === "provisioning" || status === "sync_pending",
    meeting: bookingMeetingContract(meeting),
    managePath: `/meetings/manage/${managementToken}`,
  }
}

async function sendVerification(admin: SupabaseClient, row: BookingLinkRow, holdId: string, email: string, code: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new HttpError(503, "Email verification is temporarily unavailable.")
  const { workspaceName } = await publicBrand(admin, row.CALBookingLink_CompanyID)
  const organiser = organiserFrom(row)
  const { data: hold, error: holdError } = await admin.from("CAL_BookingHolds").select("CALBookingHold_Name").eq("CALBookingHold_ID", holdId).maybeSingle()
  if (holdError || !hold) throw new HttpError(503, "The booking hold could not be checked before sending verification.")
  const template = defaultCalendarEmailTemplate("booking_verification")
  const copy = renderCalendarEmailTemplate(template, {
    meeting_title: row.CALBookingLink_Title,
    meeting_date: "",
    organiser_name: organiser.name,
    attendee_name: cleanText(hold?.CALBookingHold_Name, 240) || email,
    manage_url: "",
    join_url: "",
    verification_code: code,
    workspace_name: workspaceName,
  })
  const rendered = renderBrandedEmail({
    subject: copy.subject,
    preview: copy.body.split(/\n+/)[0] || "Use this code to finish your booking.",
    eyebrow: "Booking verification",
    title: "Verify your email",
    body: copy.body.split(/\n\n+/).filter(Boolean),
    code,
    footer: "The code expires with your temporary booking hold.",
    // Verification is always Multideck-owned. The public booking page and all
    // subsequent operational meeting messages may still use the tenant brand.
    brand: undefined,
  })
  const idempotencyKey = `booking-hold:${holdId}:verification:${(await sha256(`${holdId}:${code}`)).slice(0, 16)}`
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: MULTIDECK_EMAIL_FROM, reply_to: MULTIDECK_EMAIL_REPLY_TO, to: [email], subject: copy.subject, html: rendered.html, text: rendered.text }),
  })
  if (!response.ok) throw new HttpError(503, "The verification email could not be sent. Your details are preserved; try again.")
  const delivery = await response.json().catch(() => ({})) as { id?: string }
  const { error: auditError } = await admin.from("CAL_Deliveries").upsert({
    CALDelivery_CompanyID: row.CALBookingLink_CompanyID,
    CALDelivery_KindCode: "booking_verification",
    CALDelivery_StatusCode: "delivered",
    CALDelivery_IdempotencyKey: idempotencyKey,
    CALDelivery_ProviderID: delivery.id ?? null,
    // Keep the rendered-message audit without retaining a still-valid verification
    // code in the database. Delivery/provider evidence remains inspectable while
    // the participant secret exists only in the email that was sent.
    CALDelivery_RenderedJSON: { to: email, subject: copy.subject, text: rendered.text.replaceAll(code, "••••••") },
    CALDelivery_CompletedAt: new Date().toISOString(),
  }, { onConflict: "CALDelivery_IdempotencyKey" })
  if (auditError) console.error("Calendar verification delivery audit could not be recorded", { holdId, providerDeliveryId: delivery.id ?? null })
}

async function createHold(request: Request, admin: SupabaseClient, row: BookingLinkRow) {
  const payload = await body<JsonObject>(request)
  if (cleanText(payload.website, 200)) return { accepted: true }
  const name = cleanText(payload.name, 240)
  const email = emailAddress(payload.email)
  if (!name) throw new HttpError(400, "Your name is required.")
  const suppliedAnswers = object(payload.answers)
  const answers: JsonObject = {}
  for (const question of publicQuestions(row)) {
    const raw = question.id === "company" ? payload.company : question.id === "phone" ? payload.phone : suppliedAnswers[question.id]
    const answer = cleanText(raw, question.type === "long_text" ? 10_000 : 1_000)
    if (question.required && !answer) throw new HttpError(400, `${question.label} is required.`)
    if (answer) answers[question.id] = answer
  }
  const { start, end } = parseMeetingRange(payload.startAt, payload.endAt)
  const expectedEnd = start.getTime() + Number(row.CALBookingLink_DurationMinutes) * 60_000
  if (Math.abs(end.getTime() - expectedEnd) > 1_000) throw new HttpError(400, "That time does not match this booking link.")
  await rateLimit(admin, row.CALBookingLink_CompanyID, "hold", `${requestClientKey(request)}|${email}`, 8)
  const availability = await readAvailability(admin, row, new Date(start.getTime() - 1_000), new Date(end.getTime() + 1_000))
  if (!availability.slots.some((slot) => Math.abs(Date.parse(slot) - start.getTime()) < 1_000)) throw new HttpError(409, "That time has just become unavailable. Choose another time.")
  const holdId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const code = verificationCode()
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  const { error: reservationError } = await admin.from("CAL_Reservations").insert({
    CALReservation_ID: reservationId,
    CALReservation_CompanyID: row.CALBookingLink_CompanyID,
    CALReservation_OwnerUserID: row.CALBookingLink_OwnerUserID,
    CALReservation_SourceCode: "hold",
    CALReservation_SourceID: holdId,
    CALReservation_StartAt: start.toISOString(),
    CALReservation_EndAt: end.toISOString(),
    CALReservation_BufferBeforeMinutes: availability.rules.bufferBeforeMinutes,
    CALReservation_BufferAfterMinutes: availability.rules.bufferAfterMinutes,
    CALReservation_ExpiresAt: expiresAt,
  })
  if (reservationError?.code === "23P01") throw new HttpError(409, "That time has just become unavailable. Choose another time.")
  if (reservationError) throw new HttpError(500, "The time could not be held.")
  const { error } = await admin.from("CAL_BookingHolds").insert({
    CALBookingHold_ID: holdId,
    CALBookingHold_CompanyID: row.CALBookingLink_CompanyID,
    CALBookingHold_BookingLinkID: row.CALBookingLink_ID,
    CALBookingHold_ReservationID: reservationId,
    CALBookingHold_Name: name,
    CALBookingHold_Email: email,
    CALBookingHold_CompanyName: cleanText(answers.company, 240) || null,
    CALBookingHold_Phone: cleanText(answers.phone, 80) || null,
    CALBookingHold_TimeZone: parseTimeZone(payload.timeZone),
    CALBookingHold_AnswersJSON: answers,
    CALBookingHold_VerificationHash: await sha256(`${holdId}:${code}`),
    CALBookingHold_ExpiresAt: expiresAt,
  })
  if (error) {
    const { error: cleanupError } = await admin.from("CAL_Reservations").delete().eq("CALReservation_ID", reservationId)
    if (cleanupError) console.error("Calendar reservation cleanup failed after hold creation failed", { reservationId })
    throw new HttpError(500, "The booking details could not be saved.")
  }
  try {
    await sendVerification(admin, row, holdId, email, code)
  } catch (error) {
    const [{ error: holdCleanupError }, { error: reservationCleanupError }] = await Promise.all([
      admin.from("CAL_BookingHolds").delete().eq("CALBookingHold_ID", holdId),
      admin.from("CAL_Reservations").delete().eq("CALReservation_ID", reservationId),
    ])
    if (holdCleanupError || reservationCleanupError) console.error("Calendar booking hold cleanup failed after verification delivery failed", { holdId, reservationId })
    throw error
  }
  return { holdId, expiresAt, email: email.replace(/^(.{1,2}).*(@.*)$/, "$1•••$2"), verificationRequired: true }
}

async function verifyHold(request: Request, admin: SupabaseClient, row: BookingLinkRow, holdId: string) {
  const payload = await body<JsonObject>(request)
  const code = cleanText(payload.code, 6)
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the six-digit code from your email.")
  const { data: hold, error } = await admin.from("CAL_BookingHolds").select("*")
    .eq("CALBookingHold_ID", holdId).eq("CALBookingHold_BookingLinkID", row.CALBookingLink_ID).maybeSingle()
  if (error || !hold) throw new HttpError(404, "This booking hold was not found.")
  await rateLimit(admin, row.CALBookingLink_CompanyID, "verify", `${holdId}|${requestClientKey(request)}`, 10)
  const verificationHash = await sha256(`${holdId}:${code}`)
  const matches = verificationHash === hold.CALBookingHold_VerificationHash
  if (!matches) {
    const { data: attempts, error: attemptsError } = await admin.rpc("multideck_calendar_record_verification_failure", {
      p_hold_id: holdId,
      p_booking_link_id: row.CALBookingLink_ID,
      p_max_attempts: 10,
    })
    if (attemptsError) throw new HttpError(503, "The verification attempt could not be checked safely. Try again.")
    if (Number(attempts) >= 10) throw new HttpError(429, "Too many incorrect codes. Choose the time again to start a fresh booking.")
    throw new HttpError(400, "That verification code does not match.")
  }
  if (hold.CALBookingHold_MeetingID) {
    const { data: existingMeeting, error: existingMeetingError } = await admin.from("CAL_Meetings").select("*").eq("CALMeeting_ID", hold.CALBookingHold_MeetingID).maybeSingle()
    if (existingMeetingError) throw new HttpError(503, "This booking could not be checked safely. Try again.")
    if (!existingMeeting) throw new HttpError(409, "This booking could not be recovered. Contact the organiser before trying again.")
    return await bookingConfirmation(admin, row, hold, existingMeeting)
  }
  if (Date.parse(hold.CALBookingHold_ExpiresAt) <= Date.now()) {
    const { error: expireError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "expired" }).eq("CALReservation_ID", hold.CALBookingHold_ReservationID)
    if (expireError) throw new HttpError(503, "This expired hold could not be released safely. Try again shortly.")
    throw new HttpError(410, "This hold has expired. Your details are preserved; choose a new time.")
  }
  const { data: reservation, error: reservationError } = await admin.from("CAL_Reservations").select("*").eq("CALReservation_ID", hold.CALBookingHold_ReservationID).eq("CALReservation_StatusCode", "active").maybeSingle()
  if (reservationError) throw new HttpError(503, "That booking time could not be checked safely.")
  if (!reservation) throw new HttpError(409, "That time is no longer available. Choose another time.")
  const { data: newBusy, error: newBusyError } = await admin.from("CAL_ProviderEvents").select("CALProviderEvent_ID")
    .eq("CALProviderEvent_OwnerUserID", row.CALBookingLink_OwnerUserID).eq("CALProviderEvent_IsCancelled", false)
    .lt("CALProviderEvent_StartAt", reservation.CALReservation_EndAt).gt("CALProviderEvent_EndAt", reservation.CALReservation_StartAt).limit(1)
  if (newBusyError) throw new HttpError(503, "The organiser's calendar could not be checked safely.")
  if (newBusy?.length) {
    const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", hold.CALBookingHold_ReservationID)
    if (releaseError) throw new HttpError(503, "The unavailable time could not be released safely.")
    throw new HttpError(409, "That time has just become unavailable. Your details are preserved; choose another time.")
  }
  const liveBusy = await providerBusyRanges(
    admin,
    row.CALBookingLink_OwnerUserID,
    new Date(Date.parse(reservation.CALReservation_StartAt) - Number(reservation.CALReservation_BufferBeforeMinutes || 0) * 60_000),
    new Date(Date.parse(reservation.CALReservation_EndAt) + Number(reservation.CALReservation_BufferAfterMinutes || 0) * 60_000),
  )
  if (liveBusy.length) {
    const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", hold.CALBookingHold_ReservationID)
    if (releaseError) throw new HttpError(503, "The unavailable time could not be released safely.")
    throw new HttpError(409, "That time has just become unavailable on the organiser's calendar. Your details are preserved; choose another time.")
  }
  if (["google_meet", "microsoft_teams", "zoom"].includes(row.CALBookingLink_ProviderCode)) {
    const provider = row.CALBookingLink_ProviderCode === "google_meet" ? "google" : row.CALBookingLink_ProviderCode === "microsoft_teams" ? "microsoft" : "zoom"
    const { data: connection, error: connectionError } = await admin.from("CAL_ProviderConnections").select("CALConnection_ID,CALConnection_StatusCode")
      .eq("CALConnection_UserID", row.CALBookingLink_OwnerUserID).eq("CALConnection_ProviderCode", provider).maybeSingle()
    if (connectionError) throw new HttpError(503, "The meeting provider connection could not be checked safely.")
    if (!connection || connection.CALConnection_StatusCode !== "connected") {
      const { error: pauseError } = await admin.from("CAL_BookingLinks").update({ CALBookingLink_StatusCode: "paused", CALBookingLink_UpdatedAt: new Date().toISOString() }).eq("CALBookingLink_ID", row.CALBookingLink_ID)
      if (pauseError) throw new HttpError(503, "This meeting type could not be paused safely. No booking was confirmed.")
      throw new HttpError(503, "This meeting type needs attention from the organiser. No booking was confirmed.")
    }
  }
  const { data: meeting, error: meetingError } = await admin.rpc("multideck_calendar_finalise_verified_hold", {
    p_hold_id: holdId,
    p_booking_link_id: row.CALBookingLink_ID,
    p_verification_hash: verificationHash,
  })
  if (meetingError || !meeting || typeof meeting !== "object") throw new HttpError(503, "The verified booking could not be saved safely. Your details are preserved; check status again.")
  try {
    return await bookingConfirmation(admin, row, hold, meeting as Record<string, unknown>)
  } catch (error) {
    console.error("Verified Calendar booking is saved but its follow-up work is incomplete", { holdId, meetingId: (meeting as Record<string, unknown>).CALMeeting_ID })
    throw new HttpError(503, "Your booking is saved but is still being prepared. Check status again in a moment.")
  }
}

async function resendVerification(request: Request, admin: SupabaseClient, row: BookingLinkRow, holdId: string) {
  const { data: hold, error: holdError } = await admin.from("CAL_BookingHolds").select("*").eq("CALBookingHold_ID", holdId).eq("CALBookingHold_BookingLinkID", row.CALBookingLink_ID).maybeSingle()
  if (holdError) throw new HttpError(503, "This booking hold could not be checked safely.")
  if (!hold || hold.CALBookingHold_VerifiedAt || Date.parse(hold.CALBookingHold_ExpiresAt) <= Date.now()) throw new HttpError(410, "This booking hold is no longer available.")
  await rateLimit(admin, row.CALBookingLink_CompanyID, "resend", `${holdId}|${requestClientKey(request)}`, 4)
  const code = verificationCode()
  const nextHash = await sha256(`${holdId}:${code}`)
  const { data: rotated, error: rotateError } = await admin.from("CAL_BookingHolds")
    .update({ CALBookingHold_VerificationHash: nextHash, CALBookingHold_VerificationAttempts: 0 })
    .eq("CALBookingHold_ID", holdId)
    .eq("CALBookingHold_VerificationHash", hold.CALBookingHold_VerificationHash)
    .is("CALBookingHold_VerifiedAt", null)
    .select("CALBookingHold_ID").maybeSingle()
  if (rotateError || !rotated) throw new HttpError(409, "The verification state changed. Refresh this booking before requesting another code.")
  try {
    await sendVerification(admin, row, holdId, hold.CALBookingHold_Email, code)
  } catch (error) {
    const { error: restoreError } = await admin.from("CAL_BookingHolds")
      .update({ CALBookingHold_VerificationHash: hold.CALBookingHold_VerificationHash, CALBookingHold_VerificationAttempts: hold.CALBookingHold_VerificationAttempts })
      .eq("CALBookingHold_ID", holdId).eq("CALBookingHold_VerificationHash", nextHash)
    if (restoreError) console.error("Calendar verification code state could not be restored after an email failure", { holdId })
    throw error
  }
  return { sent: true, expiresAt: hold.CALBookingHold_ExpiresAt }
}

async function loadManagedMeeting(admin: SupabaseClient, token: string) {
  const tokenHash = await sha256(token)
  const { data: management, error: managementError } = await admin.from("CAL_ManagementTokens").select("*").eq("CALManagementToken_TokenHash", tokenHash).maybeSingle()
  if (managementError) throw new HttpError(503, "This meeting management link could not be checked safely.")
  if (!management || management.CALManagementToken_RevokedAt || Date.parse(management.CALManagementToken_ExpiresAt) <= Date.now()) throw new HttpError(404, "This meeting management link is no longer available.")
  const { data: participant, error: participantError } = await admin.from("CAL_MeetingParticipants").select("*").eq("CALParticipant_ID", management.CALManagementToken_ParticipantID).maybeSingle()
  if (participantError) throw new HttpError(503, "The attendee could not be checked safely.")
  if (!participant) throw new HttpError(404, "This attendee is no longer part of the meeting.")
  const { data: meeting, error: meetingError } = await admin.from("CAL_Meetings").select("*").eq("CALMeeting_ID", participant.CALParticipant_MeetingID).maybeSingle()
  if (meetingError) throw new HttpError(503, "The meeting could not be checked safely.")
  if (!meeting) throw new HttpError(404, "This meeting is no longer available.")
  const [participantsResult, bookingLinkResult, branding] = await Promise.all([
    admin.from("CAL_MeetingParticipants").select("CALParticipant_ID,CALParticipant_Name,CALParticipant_ResponseCode,CALParticipant_IsExternal").eq("CALParticipant_MeetingID", meeting.CALMeeting_ID),
    meeting.CALMeeting_BookingLinkID ? admin.from("CAL_BookingLinks").select("*").eq("CALBookingLink_ID", meeting.CALMeeting_BookingLinkID).maybeSingle() : Promise.resolve({ data: null, error: null }),
    publicBrand(admin, meeting.CALMeeting_CompanyID),
  ])
  if (participantsResult.error || bookingLinkResult.error) throw new HttpError(503, "The meeting details could not be loaded safely.")
  const { error: tokenUseError } = await admin.from("CAL_ManagementTokens").update({ CALManagementToken_LastUsedAt: new Date().toISOString() }).eq("CALManagementToken_ID", management.CALManagementToken_ID)
  if (tokenUseError) console.error("Calendar management token usage could not be recorded", { tokenId: management.CALManagementToken_ID })
  return { management, participant, meeting, participants: participantsResult.data ?? [], bookingLink: bookingLinkResult.data, branding }
}

type ManagedMeetingState = Awaited<ReturnType<typeof loadManagedMeeting>>

function managedAvailabilityRow(state: ManagedMeetingState): BookingLinkRow {
  const durationMinutes = Math.round((Date.parse(state.meeting.CALMeeting_EndAt) - Date.parse(state.meeting.CALMeeting_StartAt)) / 60_000)
  return {
    ...(state.bookingLink ?? {}),
    CALBookingLink_ID: state.bookingLink?.CALBookingLink_ID ?? "",
    CALBookingLink_CompanyID: state.meeting.CALMeeting_CompanyID,
    CALBookingLink_OwnerUserID: state.meeting.CALMeeting_OrganiserUserID,
    CALBookingLink_Title: state.meeting.CALMeeting_Title,
    CALBookingLink_DurationMinutes: durationMinutes,
    CALBookingLink_ProviderCode: state.meeting.CALMeeting_ProviderCode,
    CALBookingLink_StatusCode: "active",
  } as BookingLinkRow
}

async function readManagedAvailability(admin: SupabaseClient, state: ManagedMeetingState, from: Date, until: Date) {
  const durationMinutes = Math.round((Date.parse(state.meeting.CALMeeting_EndAt) - Date.parse(state.meeting.CALMeeting_StartAt)) / 60_000)
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new HttpError(409, "This meeting does not have a valid duration.")
  return await readAvailability(admin, managedAvailabilityRow(state), from, until, {
    durationMinutes,
    excludeReservationId: state.meeting.CALMeeting_ReservationID,
    excludeMeetingId: state.meeting.CALMeeting_ID,
  })
}

async function managedSlots(request: Request, admin: SupabaseClient, token: string) {
  const state = await loadManagedMeeting(admin, token)
  await rateLimit(admin, state.meeting.CALMeeting_CompanyID, "manage", `${await sha256(token)}|${requestClientKey(request)}`, 60)
  if (!managedContract(state).permissions.canReschedule) throw new HttpError(409, "The rescheduling window for this meeting has closed.")
  const url = new URL(request.url)
  const from = new Date(url.searchParams.get("from") || new Date().toISOString())
  const until = new Date(url.searchParams.get("until") || new Date(Date.now() + 28 * 86_400_000).toISOString())
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until <= from || until.getTime() - from.getTime() > 90 * 86_400_000) {
    throw new HttpError(400, "Choose a valid availability range of 90 days or fewer.")
  }
  return await readManagedAvailability(admin, state, from, until)
}

function managedContract(state: Awaited<ReturnType<typeof loadManagedMeeting>>) {
  const startsAt = Date.parse(state.meeting.CALMeeting_StartAt)
  const rescheduleCutoff = Number(state.bookingLink?.CALBookingLink_RescheduleCutoffMinutes ?? 0)
  const cancellationCutoff = Number(state.bookingLink?.CALBookingLink_CancellationCutoffMinutes ?? 0)
  return {
    meeting: {
      id: state.meeting.CALMeeting_ID, title: state.meeting.CALMeeting_Title, agenda: state.meeting.CALMeeting_Agenda,
      startAt: state.meeting.CALMeeting_StartAt, endAt: state.meeting.CALMeeting_EndAt, timeZone: state.meeting.CALMeeting_TimeZone,
      status: state.meeting.CALMeeting_StatusCode, provider: state.meeting.CALMeeting_ProviderCode,
      location: state.meeting.CALMeeting_Location, joinUrl: state.meeting.CALMeeting_JoinURL,
      allowAttendeeReschedule: state.meeting.CALMeeting_AllowAttendeeReschedule,
      attendeeCount: state.participants.length,
    },
    participant: { id: state.participant.CALParticipant_ID, name: state.participant.CALParticipant_Name, response: state.participant.CALParticipant_ResponseCode },
    permissions: {
      canReschedule: state.meeting.CALMeeting_StatusCode === "confirmed" && state.meeting.CALMeeting_AllowAttendeeReschedule && Date.now() < startsAt - rescheduleCutoff * 60_000,
      canCancel: state.meeting.CALMeeting_StatusCode === "confirmed" && Date.now() < startsAt - cancellationCutoff * 60_000,
      rescheduleCutoffMinutes: rescheduleCutoff,
      cancellationCutoffMinutes: cancellationCutoff,
    },
    bookingPath: state.bookingLink ? `/book/${state.bookingLink.CALBookingLink_OrganiserSlug}/${state.bookingLink.CALBookingLink_Slug}` : null,
    branding: bookingContract({ CALBookingLink_Title: "", CALBookingLink_DurationMinutes: 0, CALBookingLink_ProviderCode: "multideck", CALBookingLink_StatusCode: "active", CALBookingLink_ID: "", CALBookingLink_CompanyID: state.meeting.CALMeeting_CompanyID, CALBookingLink_OwnerUserID: state.meeting.CALMeeting_OrganiserUserID, cmp_Users: null } as BookingLinkRow, state.branding).branding,
    workspaceName: state.branding.workspaceName,
  }
}

async function manageMeeting(request: Request, admin: SupabaseClient, token: string) {
  const state = await loadManagedMeeting(admin, token)
  await rateLimit(admin, state.meeting.CALMeeting_CompanyID, "manage", `${await sha256(token)}|${requestClientKey(request)}`, 60)
  if (request.method === "GET") return managedContract(state)
  const payload = await body<JsonObject>(request)
  const action = cleanText(payload.action, 30)
  if (action === "rsvp") {
    const response = cleanText(payload.response, 20)
    if (!["accepted", "tentative", "declined"].includes(response)) throw new HttpError(400, "Choose a valid response.")
    const { error } = await admin.from("CAL_MeetingParticipants").update({ CALParticipant_ResponseCode: response }).eq("CALParticipant_ID", state.participant.CALParticipant_ID)
    if (error) throw new HttpError(503, "Your response could not be saved. Try again.")
    return { ...managedContract(state), participant: { ...managedContract(state).participant, response } }
  }
  if (action === "cancel_attendance") {
    const cutoff = Number(state.bookingLink?.CALBookingLink_CancellationCutoffMinutes ?? 0)
    if (state.meeting.CALMeeting_StatusCode !== "confirmed" || Date.now() >= Date.parse(state.meeting.CALMeeting_StartAt) - cutoff * 60_000) throw new HttpError(409, "The cancellation window for this meeting has closed.")
    if (state.participants.length <= 1) {
      const version = Number(state.meeting.CALMeeting_EditVersion) + 1
      const connected = ["google_meet", "microsoft_teams", "zoom"].includes(state.meeting.CALMeeting_ProviderCode)
      if (connected) {
        const { error: meetingError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "sync_pending", CALMeeting_PendingChangeJSON: { kind: "cancel" }, CALMeeting_EditVersion: version, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
        if (meetingError) throw new HttpError(503, "The cancellation could not be prepared.")
        const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID, CALDelivery_MeetingID: state.meeting.CALMeeting_ID, CALDelivery_KindCode: "provider_cancel", CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:attendee-cancel:v${version}` })
        if (deliveryError) managementQueueFailure("The cancellation could not be sent to the meeting provider.", await restoreManagedMeetingSnapshot(admin, state.meeting))
        return { finalising: true, previousMeetingRetained: true }
      }
      const { error: meetingError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "cancelled", CALMeeting_PendingChangeJSON: null, CALMeeting_EditVersion: version, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
      if (meetingError) throw new HttpError(503, "The cancellation could not be saved.")
      const { error: releaseError } = await admin.from("CAL_Reservations").update({ CALReservation_StatusCode: "released" }).eq("CALReservation_ID", state.meeting.CALMeeting_ReservationID)
      if (releaseError) managementQueueFailure("The meeting time could not be released.", await restoreManagedMeetingSnapshot(admin, state.meeting))
      const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID, CALDelivery_MeetingID: state.meeting.CALMeeting_ID, CALDelivery_ParticipantID: state.participant.CALParticipant_ID, CALDelivery_KindCode: "cancelled", CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:attendee-cancel:v${version}` })
      if (deliveryError) managementQueueFailure("The cancellation could not be queued for attendees.", await restoreManagedMeetingSnapshot(admin, state.meeting, true))
      return { cancelled: true }
    }
    const previousResponse = state.participant.CALParticipant_ResponseCode
    const { error: participantError } = await admin.from("CAL_MeetingParticipants").update({ CALParticipant_ResponseCode: "declined" }).eq("CALParticipant_ID", state.participant.CALParticipant_ID)
    if (participantError) throw new HttpError(503, "Your attendance could not be cancelled.")
    if (["google_meet", "microsoft_teams"].includes(String(state.meeting.CALMeeting_ProviderCode))) {
      const version = Number(state.meeting.CALMeeting_EditVersion) + 1
      const { error: meetingError } = await admin.from("CAL_Meetings").update({
        CALMeeting_StatusCode: "sync_pending",
        CALMeeting_PendingChangeJSON: { kind: "attendee_cancel", participantId: state.participant.CALParticipant_ID },
        CALMeeting_EditVersion: version,
        CALMeeting_UpdatedAt: new Date().toISOString(),
      }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
      if (meetingError) {
        const { error: participantRestoreError } = await admin.from("CAL_MeetingParticipants").update({ CALParticipant_ResponseCode: previousResponse }).eq("CALParticipant_ID", state.participant.CALParticipant_ID)
        managementQueueFailure("The provider cancellation could not be prepared.", !participantRestoreError)
      }
      const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({
        CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID,
        CALDelivery_MeetingID: state.meeting.CALMeeting_ID,
        CALDelivery_KindCode: "provider_update",
        CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:participant:${state.participant.CALParticipant_ID}:cancel:v${version}`,
      })
      if (deliveryError) {
        const restoredMeeting = await restoreManagedMeetingSnapshot(admin, state.meeting)
        const { error: restoreParticipantError } = await admin.from("CAL_MeetingParticipants").update({ CALParticipant_ResponseCode: previousResponse }).eq("CALParticipant_ID", state.participant.CALParticipant_ID)
        managementQueueFailure("The attendance cancellation could not be sent to the provider.", restoredMeeting && !restoreParticipantError)
      }
      return { attendanceCancelled: true, finalising: true }
    }
    return { attendanceCancelled: true }
  }
  if (action === "reschedule") {
    if (!state.meeting.CALMeeting_AllowAttendeeReschedule) throw new HttpError(403, "The organiser has not enabled attendee rescheduling.")
    const cutoff = Number(state.bookingLink?.CALBookingLink_RescheduleCutoffMinutes ?? 0)
    if (state.meeting.CALMeeting_StatusCode !== "confirmed" || Date.now() >= Date.parse(state.meeting.CALMeeting_StartAt) - cutoff * 60_000) throw new HttpError(409, "The rescheduling window for this meeting has closed.")
    const proposed = Array.isArray(payload.proposedTimes) ? payload.proposedTimes.slice(0, 3) : []
    if (!proposed.length) throw new HttpError(400, "Choose at least one alternative time.")
    const currentDuration = Date.parse(state.meeting.CALMeeting_EndAt) - Date.parse(state.meeting.CALMeeting_StartAt)
    const parsedTimes = proposed.map((item) => {
      const value = item && typeof item === "object" ? item as JsonObject : {}
      const range = parseMeetingRange(value.startAt, value.endAt)
      if (range.start.getTime() <= Date.now()) throw new HttpError(400, "Choose future alternatives.")
      if (range.end.getTime() - range.start.getTime() !== currentDuration) throw new HttpError(400, "Each alternative must keep the same meeting duration.")
      return range
    })
    const availability = await readManagedAvailability(
      admin,
      state,
      new Date(Math.min(...parsedTimes.map((range) => range.start.getTime()))),
      new Date(Math.max(...parsedTimes.map((range) => range.end.getTime())) + 1),
    )
    const availableStarts = new Set(availability.slots)
    if (parsedTimes.some((range) => !availableStarts.has(range.start.toISOString()))) {
      throw new HttpError(409, "One of those times is no longer available. Choose from the refreshed available times.")
    }
    if (state.participants.length > 1) {
      const times = parsedTimes.map((range) => ({ startAt: range.start.toISOString(), endAt: range.end.toISOString() }))
      const { data, error: requestError } = await admin.from("CAL_ChangeRequests").insert({
        CALChangeRequest_CompanyID: state.meeting.CALMeeting_CompanyID,
        CALChangeRequest_MeetingID: state.meeting.CALMeeting_ID,
        CALChangeRequest_ParticipantID: state.participant.CALParticipant_ID,
        CALChangeRequest_ProposedTimesJSON: times,
      }).select("CALChangeRequest_ID").single()
      if (requestError?.code === "23505") throw new HttpError(409, "You already have a reschedule request awaiting the organiser's response.")
      if (requestError || !data) throw new HttpError(503, "The reschedule request could not be saved.")
      const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID, CALDelivery_MeetingID: state.meeting.CALMeeting_ID, CALDelivery_ParticipantID: state.participant.CALParticipant_ID, CALDelivery_KindCode: "group_reschedule_request", CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:change-request:${data.CALChangeRequest_ID}` })
      if (deliveryError) {
        const { error: cleanupError } = await admin.from("CAL_ChangeRequests").delete().eq("CALChangeRequest_ID", data.CALChangeRequest_ID)
        managementQueueFailure("The organiser notification could not be queued.", !cleanupError)
      }
      return { requested: true, changeRequestId: data?.CALChangeRequest_ID }
    }
    const range = parsedTimes[0]
    const { data: conflict, error: conflictError } = await admin.from("CAL_Reservations").select("CALReservation_ID")
      .eq("CALReservation_OwnerUserID", state.meeting.CALMeeting_OrganiserUserID).eq("CALReservation_StatusCode", "active")
      .neq("CALReservation_ID", state.meeting.CALMeeting_ReservationID).lt("CALReservation_StartAt", range.end.toISOString()).gt("CALReservation_EndAt", range.start.toISOString()).limit(1)
    if (conflictError) throw new HttpError(503, "That time could not be checked safely.")
    if (conflict?.length) throw new HttpError(409, "That time is no longer available.")
    const liveProviderBusy = await providerBusyRanges(admin, state.meeting.CALMeeting_OrganiserUserID, range.start, range.end, state.meeting.CALMeeting_ID)
    if (liveProviderBusy.length) throw new HttpError(409, "That time is no longer available on the organiser's calendar.")
    const connected = ["google_meet", "microsoft_teams", "zoom"].includes(state.meeting.CALMeeting_ProviderCode)
    const version = Number(state.meeting.CALMeeting_EditVersion) + 1
    if (connected) {
      const { error: meetingError } = await admin.from("CAL_Meetings").update({ CALMeeting_StatusCode: "sync_pending", CALMeeting_PendingChangeJSON: { kind: "reschedule", startAt: range.start.toISOString(), endAt: range.end.toISOString() }, CALMeeting_EditVersion: version, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
      if (meetingError) throw new HttpError(503, "The reschedule could not be prepared.")
      const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID, CALDelivery_MeetingID: state.meeting.CALMeeting_ID, CALDelivery_KindCode: "provider_update", CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:attendee-reschedule:v${version}` })
      if (deliveryError) managementQueueFailure("The reschedule could not be sent to the meeting provider.", await restoreManagedMeetingSnapshot(admin, state.meeting))
      return { finalising: true, previousTimeRetained: true }
    }
    const { error } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: range.start.toISOString(), CALReservation_EndAt: range.end.toISOString() }).eq("CALReservation_ID", state.meeting.CALMeeting_ReservationID)
    if (error?.code === "23P01") throw new HttpError(409, "That time is no longer available.")
    if (error) throw new HttpError(500, "The meeting could not be rescheduled.")
    const { error: meetingError } = await admin.from("CAL_Meetings").update({ CALMeeting_StartAt: range.start.toISOString(), CALMeeting_EndAt: range.end.toISOString(), CALMeeting_EditVersion: version, CALMeeting_UpdatedAt: new Date().toISOString() }).eq("CALMeeting_ID", state.meeting.CALMeeting_ID)
    if (meetingError) {
      const { error: rollbackError } = await admin.from("CAL_Reservations").update({ CALReservation_StartAt: state.meeting.CALMeeting_StartAt, CALReservation_EndAt: state.meeting.CALMeeting_EndAt }).eq("CALReservation_ID", state.meeting.CALMeeting_ReservationID)
      managementQueueFailure("The rescheduled meeting could not be saved.", !rollbackError)
    }
    const { error: deliveryError } = await admin.from("CAL_Deliveries").insert({ CALDelivery_CompanyID: state.meeting.CALMeeting_CompanyID, CALDelivery_MeetingID: state.meeting.CALMeeting_ID, CALDelivery_ParticipantID: state.participant.CALParticipant_ID, CALDelivery_KindCode: "rescheduled", CALDelivery_IdempotencyKey: `meeting:${state.meeting.CALMeeting_ID}:attendee-reschedule:v${version}` })
    if (deliveryError) managementQueueFailure("The reschedule could not be queued for the attendee.", await restoreManagedMeetingSnapshot(admin, state.meeting, true))
    return { rescheduled: true, startAt: range.start.toISOString(), endAt: range.end.toISOString() }
  }
  throw new HttpError(400, "Choose a supported meeting action.")
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, {}, 204)
  try {
    const admin = adminClient()
    const path = routeParts(request, "calendar-public")
    if (path[0] === "booking" && path[1] && path[2]) {
      const row = await loadBookingLink(admin, path[1], path[2])
      if (request.method === "GET" && path.length === 3) return json(request, bookingContract(row, await publicBrand(admin, row.CALBookingLink_CompanyID)))
      if (request.method === "GET" && path[3] === "slots") {
        const url = new URL(request.url)
        const from = new Date(url.searchParams.get("from") || new Date().toISOString())
        const until = new Date(url.searchParams.get("until") || new Date(Date.now() + 14 * 86_400_000).toISOString())
        if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until <= from || until.getTime() - from.getTime() > MAX_PUBLIC_AVAILABILITY_RANGE_MS) {
          throw new HttpError(400, "Choose a valid availability range of 90 days or fewer.")
        }
        return json(request, await readAvailability(admin, row, from, until))
      }
      if (request.method === "POST" && path[3] === "holds" && path.length === 4) return json(request, await createHold(request, admin, row), 201)
      if (request.method === "POST" && path[3] === "holds" && path[4] && path[5] === "verify") return json(request, await verifyHold(request, admin, row, path[4]))
      if (request.method === "POST" && path[3] === "holds" && path[4] && path[5] === "resend") return json(request, await resendVerification(request, admin, row, path[4]))
    }
    if (path[0] === "manage" && path[1] && path[2] === "slots" && path.length === 3 && request.method === "GET") {
      return json(request, await managedSlots(request, admin, path[1]))
    }
    if (path[0] === "manage" && path[1] && path.length === 2 && ["GET", "PATCH"].includes(request.method)) return json(request, await manageMeeting(request, admin, path[1]))
    throw new HttpError(404, "Calendar page not found.")
  } catch (error) {
    return failure(request, error)
  }
})
