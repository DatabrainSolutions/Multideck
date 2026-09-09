import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { HttpError } from "./backend.ts"

export const CALENDAR_EMAIL_TEMPLATE_KINDS = [
  "booking_verification",
  "management",
  "standalone_confirmation",
  "reminder",
  "rescheduled",
  "cancelled",
  "group_reschedule_request",
  "group_reschedule_outcome",
] as const

export type CalendarEmailTemplateKind = typeof CALENDAR_EMAIL_TEMPLATE_KINDS[number]

// Email verification is a Multideck-owned trust surface. Tenants can customise
// operational meeting messages, but cannot restyle or rewrite the message that
// proves a visitor controls an email address.
export const TENANT_CUSTOMISABLE_CALENDAR_EMAIL_TEMPLATE_KINDS = CALENDAR_EMAIL_TEMPLATE_KINDS
  .filter((kind): kind is Exclude<CalendarEmailTemplateKind, "booking_verification"> => kind !== "booking_verification")

export type CalendarEmailTemplate = {
  kind: CalendarEmailTemplateKind
  name: string
  description: string
  subject: string
  body: string
  custom: boolean
  version: number
  updatedAt: string | null
}

type TemplateVariables = Record<string, string | null | undefined>

export const CALENDAR_EMAIL_TEMPLATE_VARIABLES = [
  "meeting_title",
  "meeting_date",
  "organiser_name",
  "attendee_name",
  "manage_url",
  "join_url",
  "verification_code",
  "workspace_name",
] as const

const defaults: Record<CalendarEmailTemplateKind, Omit<CalendarEmailTemplate, "kind" | "custom" | "version" | "updatedAt">> = {
  booking_verification: {
    name: "Booking verification",
    description: "Sent while the visitor's selected time is held.",
    subject: "Verify your booking for {meeting_title}",
    body: "Hello {attendee_name},\n\nEnter {verification_code} on the booking page to confirm {meeting_title}. Your selected time is held for ten minutes.\n\nIf you did not request this booking, you can ignore this email.",
  },
  management: {
    name: "Meeting management",
    description: "Sent alongside a connected calendar provider invitation.",
    subject: "Manage: {meeting_title}",
    body: "Hello {attendee_name},\n\n{meeting_title} is confirmed for {meeting_date}.\n\nUse your private management link to join, RSVP, reschedule or cancel: {manage_url}",
  },
  standalone_confirmation: {
    name: "Standalone confirmation",
    description: "Sent when Multideck owns the calendar invitation.",
    subject: "Confirmed: {meeting_title}",
    body: "Hello {attendee_name},\n\n{meeting_title} is booked for {meeting_date}.\n\nUse your private management link to RSVP, reschedule or cancel: {manage_url}",
  },
  reminder: {
    name: "Meeting reminder",
    description: "Sent before a confirmed meeting.",
    subject: "Reminder: {meeting_title}",
    body: "Hello {attendee_name},\n\n{meeting_title} starts {meeting_date}.\n\nManage the meeting here: {manage_url}",
  },
  rescheduled: {
    name: "Meeting rescheduled",
    description: "Sent only after the new time is confirmed.",
    subject: "Rescheduled: {meeting_title}",
    body: "Hello {attendee_name},\n\nThe new time for {meeting_title} is {meeting_date}. Your management link remains the same: {manage_url}",
  },
  cancelled: {
    name: "Meeting cancelled",
    description: "Sent only after cancellation is confirmed.",
    subject: "Cancelled: {meeting_title}",
    body: "Hello {attendee_name},\n\n{meeting_title}, previously scheduled for {meeting_date}, has been cancelled.",
  },
  group_reschedule_request: {
    name: "Group reschedule request",
    description: "Sent to the organiser when an attendee proposes alternatives.",
    subject: "Reschedule requested: {meeting_title}",
    body: "{attendee_name} proposed new times for {meeting_title}.\n\nReview the alternatives in Multideck while the original meeting remains confirmed: {manage_url}",
  },
  group_reschedule_outcome: {
    name: "Group reschedule outcome",
    description: "Sent to the requester after the organiser decides.",
    subject: "Reschedule update: {meeting_title}",
    body: "Hello {attendee_name},\n\nThe organiser has responded to your request. The confirmed time for {meeting_title} is {meeting_date}.\n\nOpen your meeting details here: {manage_url}",
  },
}

function isTemplateKind(value: unknown): value is CalendarEmailTemplateKind {
  return typeof value === "string" && (CALENDAR_EMAIL_TEMPLATE_KINDS as readonly string[]).includes(value)
}

function normaliseCopy(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

export function validateCalendarEmailTemplate(kind: unknown, subjectValue: unknown, bodyValue: unknown) {
  if (!isTemplateKind(kind)) throw new HttpError(400, "Choose a valid meeting email template.")
  const subject = normaliseCopy(subjectValue, 240)
  const templateBody = normaliseCopy(bodyValue, 8_000)
  if (!subject) throw new HttpError(400, "Add a subject for this email template.")
  if (!templateBody) throw new HttpError(400, "Add a message for this email template.")
  const combined = `${subject}\n${templateBody}`
  const placeholders = [...combined.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
  const unsupported = [...new Set(placeholders.filter((value) => !(CALENDAR_EMAIL_TEMPLATE_VARIABLES as readonly string[]).includes(value)))]
  if (unsupported.length) throw new HttpError(400, `Remove unsupported variable${unsupported.length === 1 ? "" : "s"}: ${unsupported.map((value) => `{${value}}`).join(", ")}.`)
  if (combined.includes("<") || combined.includes(">")) throw new HttpError(400, "Use plain text only. HTML is not supported.")
  return { kind, subject, body: templateBody }
}

function contract(kind: CalendarEmailTemplateKind, row?: Record<string, unknown> | null): CalendarEmailTemplate {
  const fallback = defaults[kind]
  return {
    kind,
    name: fallback.name,
    description: fallback.description,
    subject: normaliseCopy(row?.CALEmailTemplate_Subject, 240) || fallback.subject,
    body: normaliseCopy(row?.CALEmailTemplate_Body, 8_000) || fallback.body,
    custom: Boolean(row),
    version: Number(row?.CALEmailTemplate_EditVersion ?? 0),
    updatedAt: typeof row?.CALEmailTemplate_UpdatedAt === "string" ? row.CALEmailTemplate_UpdatedAt : null,
  }
}

export function defaultCalendarEmailTemplate(kind: CalendarEmailTemplateKind) {
  return contract(kind)
}

export async function listCalendarEmailTemplates(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin.from("CAL_EmailTemplates").select("*").eq("CALEmailTemplate_CompanyID", companyId)
  if (error) throw new HttpError(500, "Meeting email templates could not be loaded.")
  const byKind = new Map((data ?? []).map((row) => [row.CALEmailTemplate_KindCode, row]))
  return TENANT_CUSTOMISABLE_CALENDAR_EMAIL_TEMPLATE_KINDS.map((kind) => contract(kind, byKind.get(kind)))
}

export async function readCalendarEmailTemplate(admin: SupabaseClient, companyId: string, kind: CalendarEmailTemplateKind) {
  const { data, error } = await admin.from("CAL_EmailTemplates").select("*")
    .eq("CALEmailTemplate_CompanyID", companyId).eq("CALEmailTemplate_KindCode", kind).maybeSingle()
  if (error) throw new HttpError(500, "The meeting email template could not be loaded.")
  return contract(kind, data)
}

export function renderCalendarEmailTemplate(template: Pick<CalendarEmailTemplate, "subject" | "body">, variables: TemplateVariables) {
  const replace = (value: string) => value.replace(/\{([a-z_]+)\}/g, (_match, name: string) => variables[name] ?? "")
  return { subject: replace(template.subject), body: replace(template.body) }
}

export function sampleCalendarEmailVariables(overrides: TemplateVariables = {}) {
  return {
    meeting_title: "Freight planning call",
    meeting_date: "Tuesday, 8 September 2026 at 10:30",
    organiser_name: "Alex Morgan",
    attendee_name: "Sam Taylor",
    manage_url: "https://workspace.multideck.app/meetings/manage/example",
    join_url: "https://meet.example.com/example",
    verification_code: "482193",
    workspace_name: "Your company",
    ...overrides,
  }
}
