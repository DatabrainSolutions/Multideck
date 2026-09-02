import type {
  BookingHostCandidate,
  BookingLink,
  CalendarAvailabilityPreferences,
  CalendarEvent,
  CalendarWorkspace,
  ExternalEventPatch,
  ManagedMeeting,
  MeetingDraft,
  MeetingEmailTemplate,
  MeetingEmailTemplateKind,
  MeetingParticipant,
  MeetingPersonSuggestion,
  PublicBooking,
} from "@/lib/calendar-api"

const storageKey = "multideck:calendar-local-preview:v1"
const previewCode = "424242"

type PreviewHold = {
  id: string
  bookingLinkId: string
  name: string
  email: string
  startAt: string
  endAt: string
  answers: Record<string, string>
  expiresAt: string
  meetingId?: string
  managementToken?: string
}

type PreviewManaged = {
  token: string
  meetingId: string
  bookingLinkId: string | null
  participant: ManagedMeeting["participant"]
}

type PreviewState = {
  meetings: CalendarEvent[]
  externalEvents?: CalendarEvent[]
  bookingLinks: BookingLink[]
  availability: CalendarAvailabilityPreferences
  holds: PreviewHold[]
  managed: PreviewManaged[]
  templates: MeetingEmailTemplate[]
}

const defaultAvailability: CalendarAvailabilityPreferences = {
  timeZone: "Europe/London",
  workingHours: {
    monday: [["09:00", "17:00"]], tuesday: [["09:00", "17:00"]], wednesday: [["09:00", "17:00"]],
    thursday: [["09:00", "17:00"]], friday: [["09:00", "17:00"]], saturday: [], sunday: [],
  },
  exceptions: [],
  minimumNoticeMinutes: 120,
  bookingHorizonDays: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  slotIncrementMinutes: 15,
}

const templateCopy: Record<MeetingEmailTemplateKind, [string, string, string]> = {
  booking_verification: ["Booking verification", "Verify your booking", "Use {{verification_code}} to finish booking {{meeting_title}}."],
  management: ["Meeting management", "Your meeting details", "{{meeting_title}} is booked for {{meeting_date}}. Manage it at {{manage_url}}."],
  standalone_confirmation: ["Standalone confirmation", "Your meeting is confirmed", "{{meeting_title}} is confirmed for {{meeting_date}}."],
  reminder: ["Reminder", "Your meeting is coming up", "{{meeting_title}} starts at {{meeting_date}}. {{join_url}}"],
  rescheduled: ["Rescheduled", "Your meeting has moved", "{{meeting_title}} is now booked for {{meeting_date}}."],
  cancelled: ["Cancelled", "Your meeting has been cancelled", "{{meeting_title}} has been cancelled."],
  group_reschedule_request: ["Group request", "An attendee proposed new times", "Review the alternatives for {{meeting_title}} in Multideck."],
  group_reschedule_outcome: ["Group outcome", "The organiser responded", "The reschedule request for {{meeting_title}} has been reviewed."],
}

function atDay(offset: number, hour: number, minute = 0) {
  const value = new Date()
  value.setDate(value.getDate() + offset)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

function initialState(): PreviewState {
  const templates = (Object.entries(templateCopy) as Array<[MeetingEmailTemplateKind, [string, string, string]]>).map(([kind, copy]) => ({
    kind, name: copy[0], description: `Workspace copy for ${copy[0].toLowerCase()}.`, subject: copy[1], body: copy[2], custom: false, version: 1, updatedAt: null,
  }))
  return {
    meetings: [{
      id: "preview-meeting-planning", title: "Northstar follow-up", agenda: "Confirm next steps and shipment timing.",
      startAt: atDay(1, 10), endAt: atDay(1, 10, 45), timeZone: "Europe/London", status: "confirmed",
      provider: "multideck", colour: "teal", location: null, joinUrl: null, linkedRecord: { type: "lead", id: "preview-lead" },
      allowAttendeeReschedule: true, reminders: [1440, 60], source: "calendar", version: 1, canEdit: true,
      participants: [{ id: "preview-participant", name: "Alex Morgan", email: "alex@example.com", response: "accepted", external: true }],
    }],
    bookingLinks: [{
      id: "preview-booking-planning", organiserSlug: "harry", slug: "planning-call", title: "30-minute planning call",
      description: "Choose a time to talk through your next shipment or follow-up.", durationMinutes: 30, provider: "multideck",
      location: null, status: "active", kind: "one_on_one", hosts: [], availability: null, minimumNoticeMinutes: null, bookingHorizonDays: null,
      bufferBeforeMinutes: null, bufferAfterMinutes: null,
      questions: [{ id: "company", label: "Company", type: "short_text", builtIn: true }],
      rescheduleCutoffMinutes: 120, cancellationCutoffMinutes: 120, path: "/book/harry/planning-call", updatedAt: new Date().toISOString(),
    }],
    availability: defaultAvailability,
    holds: [],
    managed: [{
      token: "preview-northstar",
      meetingId: "preview-meeting-planning",
      bookingLinkId: null,
      participant: { id: "preview-participant", name: "Alex Morgan", response: "accepted" },
    }],
    templates,
  }
}

function readState() {
  try {
    const value = localStorage.getItem(storageKey)
    if (value) {
      const state = JSON.parse(value) as PreviewState
      const northstarMeeting = state.meetings?.find((meeting) => meeting.id === "preview-meeting-planning")
      const hasNorthstarManagementLink = state.managed?.some((managed) => managed.token === "preview-northstar")
      if (northstarMeeting && !hasNorthstarManagementLink) {
        state.managed = [...(state.managed ?? []), {
          token: "preview-northstar",
          meetingId: northstarMeeting.id,
          bookingLinkId: null,
          participant: {
            id: northstarMeeting.participants?.[0]?.id || "preview-participant",
            name: northstarMeeting.participants?.[0]?.name || "Alex Morgan",
            response: northstarMeeting.participants?.[0]?.response || "accepted",
          },
        }]
        writeState(state)
      }
      return state
    }
  } catch { /* A private browser may disable storage; the preview still works for this page load. */ }
  const state = initialState()
  writeState(state)
  return state
}

function writeState(state: PreviewState) {
  try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* Keep the in-memory result usable. */ }
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `meeting-${crypto.randomUUID().slice(0, 8)}`
}

function bookingByPath(state: PreviewState, organiserSlug: string, bookingSlug: string) {
  const link = state.bookingLinks.find((item) => item.organiserSlug === organiserSlug && item.slug === bookingSlug && item.status === "active")
  if (!link) throw new Error("This local booking link is not available.")
  return link
}

function previewExternalEvents(state: PreviewState): CalendarEvent[] {
  return state.externalEvents ?? [
    { id: "preview-busy", title: "Busy", startAt: atDay(2, 14), endAt: atDay(2, 15), timeZone: state.availability.timeZone, status: "confirmed", provider: "calendar", calendarSource: "google", colour: "blue", canEdit: true, private: true },
    { id: "preview-google-standup", title: "Ops stand-up", startAt: atDay(3, 9), endAt: atDay(3, 9, 30), timeZone: state.availability.timeZone, status: "confirmed", provider: "calendar", calendarSource: "google", colour: "blue", canEdit: true },
  ]
}

export function updatePreviewExternalEvent(id: string, input: ExternalEventPatch) {
  const state = readState()
  const events = previewExternalEvents(state)
  const index = events.findIndex((event) => event.id === id)
  if (index < 0) throw new Error("That calendar event could not be found.")
  if (input.action === "cancel") {
    state.externalEvents = events.filter((event) => event.id !== id)
    writeState(state)
    return { ...events[index], status: "cancelled" as const }
  }
  const startAt = input.startAt ?? events[index].startAt
  const endAt = input.endAt ?? events[index].endAt
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error("The event must finish after it starts.")
  const next: CalendarEvent = { ...events[index], startAt, endAt, title: events[index].private ? events[index].title : (input.title?.trim() || events[index].title) }
  state.externalEvents = events.map((event) => event.id === id ? next : event)
  writeState(state)
  return next
}

function zonedParts(value: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ""
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    weekday: part("weekday").toLowerCase(),
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  }
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number)
  return hour * 60 + minute
}

function isPreviewSlotAvailable(state: PreviewState, link: BookingLink, start: number, excludedHoldId?: string, excludedMeetingId?: string) {
  const duration = link.durationMinutes * 60_000
  const finish = start + duration
  const notice = (link.minimumNoticeMinutes ?? state.availability.minimumNoticeMinutes) * 60_000
  const horizon = (link.bookingHorizonDays ?? state.availability.bookingHorizonDays) * 86_400_000
  if (start < Date.now() + notice || start > Date.now() + horizon) return false

  const startParts = zonedParts(start, state.availability.timeZone)
  const finishParts = zonedParts(finish, state.availability.timeZone)
  if (startParts.date !== finishParts.date) return false
  const exception = state.availability.exceptions.find((item) => item.date === startParts.date)
  const ranges = exception
    ? exception.unavailable === false ? exception.ranges ?? [] : []
    : (link.availability ?? state.availability.workingHours)[startParts.weekday] ?? []
  if (!ranges.some(([from, until]) => startParts.minutes >= timeToMinutes(from) && finishParts.minutes <= timeToMinutes(until))) return false

  const bufferBefore = (link.bufferBeforeMinutes ?? state.availability.bufferBeforeMinutes) * 60_000
  const bufferAfter = (link.bufferAfterMinutes ?? state.availability.bufferAfterMinutes) * 60_000
  const blockedStart = start - bufferBefore
  const blockedEnd = finish + bufferAfter
  const overlaps = (from: string, until: string) => blockedStart < Date.parse(until) && blockedEnd > Date.parse(from)
  if (state.meetings.some((meeting) => meeting.id !== excludedMeetingId && meeting.status !== "cancelled" && overlaps(meeting.startAt, meeting.endAt))) return false
  if (state.holds.some((hold) => !hold.meetingId && hold.id !== excludedHoldId && Date.parse(hold.expiresAt) > Date.now() && overlaps(hold.startAt, hold.endAt))) return false
  return !previewExternalEvents(state).some((event) => overlaps(event.startAt, event.endAt))
}

export function getPreviewCalendarWorkspace(start: string, end: string): CalendarWorkspace {
  const state = readState()
  const from = Date.parse(start)
  const until = Date.parse(end)
  return {
    range: { start, end },
    timeZone: state.availability.timeZone,
    meetings: state.meetings.filter((meeting) => meeting.status !== "cancelled" && Date.parse(meeting.endAt) > from && Date.parse(meeting.startAt) < until),
    externalEvents: previewExternalEvents(state).filter((event) => Date.parse(event.endAt) > from && Date.parse(event.startAt) < until),
    ribbons: [
      { id: "preview-delivery", kind: "delivery", title: "MD-22479 delivers", at: atDay(1, 12), route: "/bookings", tone: "green" },
      { id: "preview-follow-up", kind: "crm_follow_up", title: "Follow up Northstar", at: atDay(1, 12), route: "/crm/leads", tone: "amber" },
    ],
    availability: state.availability,
    connections: [],
    bookingLinks: state.bookingLinks,
    permissions: ["Calendar.Read", "Calendar.ManageOwn", "Calendar.Connect", "Calendar.BookingLinks.Manage", "Calendar.Templates.Manage"],
    localPreview: true,
  }
}

export function createPreviewMeeting(draft: MeetingDraft, source: "calendar" | "crm") {
  const state = readState()
  const meeting: CalendarEvent = {
    id: crypto.randomUUID(), title: draft.title.trim(), agenda: draft.agenda, startAt: draft.startAt, endAt: draft.endAt,
    timeZone: draft.timeZone, status: "confirmed", provider: draft.provider, colour: draft.colour, location: draft.location, joinUrl: null,
    linkedRecord: draft.leadId ? { type: "lead", id: draft.leadId } : draft.accountId ? { type: "account", id: draft.accountId } : draft.jobId ? { type: "job", id: draft.jobId } : null,
    allowAttendeeReschedule: draft.allowAttendeeReschedule, reminders: draft.reminders, source, version: 1, canEdit: true,
    participants: draft.attendees.map((participant) => ({ ...participant, id: participant.id || crypto.randomUUID(), external: participant.external !== false, response: participant.response || "needs_action" })),
  }
  state.meetings.push(meeting)
  writeState(state)
  return meeting
}

export function updatePreviewMeeting(id: string, input: Partial<MeetingDraft> & { action?: "update" | "cancel" }) {
  const state = readState()
  const index = state.meetings.findIndex((meeting) => meeting.id === id)
  if (index < 0) throw new Error("That local meeting could not be found.")
  const current = state.meetings[index]
  state.meetings[index] = input.action === "cancel" ? { ...current, status: "cancelled", version: (current.version || 1) + 1 }
    : { ...current, ...input, version: (current.version || 1) + 1, participants: input.attendees ?? current.participants }
  writeState(state)
  return state.meetings[index]
}

export function decidePreviewMeetingChangeRequest(meetingId: string, requestId: string, input: { action: "accept" | "decline"; startAt?: string }) {
  const state = readState()
  const index = state.meetings.findIndex((meeting) => meeting.id === meetingId)
  const request = index >= 0 ? state.meetings[index].changeRequests?.find((item) => item.id === requestId) : null
  if (index < 0 || !request) throw new Error("That local reschedule request could not be found.")
  if (input.action === "accept") {
    const selected = request.proposedTimes.find((time) => time.startAt === input.startAt)
    if (!selected) throw new Error("Choose one of the proposed local times.")
    state.meetings[index] = { ...state.meetings[index], startAt: selected.startAt, endAt: selected.endAt, version: (state.meetings[index].version || 1) + 1, changeRequests: state.meetings[index].changeRequests?.map((item) => item.id === requestId ? { ...item, status: "accepted", selectedStartAt: selected.startAt, selectedEndAt: selected.endAt } : item) }
  } else {
    state.meetings[index] = { ...state.meetings[index], changeRequests: state.meetings[index].changeRequests?.map((item) => item.id === requestId ? { ...item, status: "declined" } : item) }
  }
  writeState(state)
  return { decided: true, finalising: false, status: input.action === "accept" ? "accepted" : "declined", startAt: state.meetings[index].startAt, endAt: state.meetings[index].endAt }
}

export function getPreviewCrmContext(type: "lead" | "account", id: string) {
  return { type, id, name: type === "lead" ? "Preview lead" : "Preview company", company: "Preview company", attendees: [] as MeetingParticipant[] }
}

const previewPeople: MeetingPersonSuggestion[] = [
  { id: "team:preview-priya", kind: "team", name: "Priya Shah", email: "priya@multideck.app", detail: "Operations lead", recordId: "preview-priya", external: false },
  { id: "team:preview-tom", kind: "team", name: "Tom Ellis", email: "tom@multideck.app", detail: "Customs", recordId: "preview-tom", external: false },
  { id: "team:preview-mei", kind: "team", name: "Mei Lin", email: "mei@multideck.app", detail: "Sales", recordId: "preview-mei", external: false },
  { id: "contact:preview-alex", kind: "contact", name: "Alex Morgan", email: "alex@northstar.example", detail: "Northstar Logistics", recordId: "preview-alex", external: true },
  { id: "contact:preview-sam", kind: "contact", name: "Sam Okafor", email: "sam@harbourline.example", detail: "Harbourline Imports", recordId: "preview-sam", external: true },
  { id: "lead:preview-jordan", kind: "lead", name: "Jordan Reyes", email: "jordan@atlasfreight.example", detail: "Lead · Atlas Freight", recordId: "preview-jordan", external: true },
]

export function searchPreviewMeetingPeople(query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return { people: previewPeople.filter((person) => person.kind === "team") }
  return { people: previewPeople.filter((person) => [person.name, person.email, person.detail ?? ""].some((value) => value.toLowerCase().includes(term))) }
}

export function savePreviewAvailability(availability: CalendarAvailabilityPreferences) {
  const state = readState()
  state.availability = availability
  writeState(state)
  return { saved: true, availability }
}

const previewHostCandidates: BookingHostCandidate[] = [
  { userId: "preview-self", name: "Harry Phillips", email: "harry@multideck.app", detail: "Founder", self: true, connectedProviders: ["google"] },
  { userId: "preview-priya", name: "Priya Shah", email: "priya@multideck.app", detail: "Operations lead", self: false, connectedProviders: ["google", "microsoft"] },
  { userId: "preview-tom", name: "Tom Ellis", email: "tom@multideck.app", detail: "Customs", self: false, connectedProviders: [] },
  { userId: "preview-mei", name: "Mei Lin", email: "mei@multideck.app", detail: "Sales", self: false, connectedProviders: ["zoom"] },
]

export function listPreviewBookingHostCandidates() {
  return { hosts: previewHostCandidates }
}

function previewHosts(kind: BookingLink["kind"] | undefined, hostUserIds: string[] | undefined, fallback: BookingLink["hosts"]) {
  if (!kind || kind === "one_on_one") return []
  if (!hostUserIds) return fallback
  const ids = [...new Set(["preview-self", ...hostUserIds])]
  if (ids.length < 2) throw new Error("Round robin and collective booking links need at least two hosts.")
  return ids.flatMap((id) => { const host = previewHostCandidates.find((candidate) => candidate.userId === id); return host ? [{ userId: host.userId, name: host.name, email: host.email }] : [] })
}

export function createPreviewBookingLink(input: Omit<Partial<BookingLink>, "id" | "path" | "updatedAt"> & { title: string; durationMinutes: number; provider: BookingLink["provider"]; questions: BookingLink["questions"]; slug?: string; hostUserIds?: string[] }) {
  const state = readState()
  const slug = slugify(input.slug || input.title)
  if (state.bookingLinks.some((item) => item.organiserSlug === "harry" && item.slug === slug)) throw new Error("That local booking-link address is already in use.")
  const link: BookingLink = {
    id: crypto.randomUUID(), organiserSlug: "harry", slug, title: input.title.trim(), description: input.description ?? null,
    durationMinutes: input.durationMinutes, provider: input.provider, location: input.location ?? null, status: "active",
    kind: input.kind ?? "one_on_one", hosts: previewHosts(input.kind, input.hostUserIds, input.hosts ?? []),
    availability: input.availability ?? null, minimumNoticeMinutes: input.minimumNoticeMinutes ?? null,
    bookingHorizonDays: input.bookingHorizonDays ?? null, bufferBeforeMinutes: input.bufferBeforeMinutes ?? null,
    bufferAfterMinutes: input.bufferAfterMinutes ?? null, questions: input.questions,
    rescheduleCutoffMinutes: input.rescheduleCutoffMinutes ?? 120, cancellationCutoffMinutes: input.cancellationCutoffMinutes ?? 120,
    path: `/book/harry/${slug}`, updatedAt: new Date().toISOString(),
  }
  state.bookingLinks.unshift(link)
  writeState(state)
  return link
}

export function updatePreviewBookingLink(id: string, input: Partial<BookingLink> & { hostUserIds?: string[] }) {
  const state = readState()
  const index = state.bookingLinks.findIndex((link) => link.id === id)
  if (index < 0) throw new Error("That local booking link could not be found.")
  const { hostUserIds, ...patch } = input
  const current = state.bookingLinks[index]
  const kind = patch.kind ?? current.kind
  const hosts = patch.kind !== undefined || hostUserIds !== undefined ? previewHosts(kind, hostUserIds ?? current.hosts.map((host) => host.userId), current.hosts) : current.hosts
  state.bookingLinks[index] = { ...current, ...patch, kind, hosts, id, updatedAt: new Date().toISOString() }
  writeState(state)
  return state.bookingLinks[index]
}

export function getPreviewTemplates() {
  return { templates: readState().templates }
}

export function savePreviewTemplate(kind: MeetingEmailTemplateKind, input: Pick<MeetingEmailTemplate, "subject" | "body">) {
  const state = readState()
  const index = state.templates.findIndex((template) => template.kind === kind)
  if (index < 0) throw new Error("That meeting email template is unavailable.")
  state.templates[index] = { ...state.templates[index], ...input, custom: true, version: state.templates[index].version + 1, updatedAt: new Date().toISOString() }
  writeState(state)
  return state.templates[index]
}

export function resetPreviewTemplate(kind: MeetingEmailTemplateKind) {
  const state = readState()
  const copy = templateCopy[kind]
  const index = state.templates.findIndex((template) => template.kind === kind)
  state.templates[index] = { kind, name: copy[0], description: `Workspace copy for ${copy[0].toLowerCase()}.`, subject: copy[1], body: copy[2], custom: false, version: (state.templates[index]?.version || 0) + 1, updatedAt: new Date().toISOString() }
  writeState(state)
  return state.templates[index]
}

export function getPreviewPublicBooking(organiserSlug: string, bookingSlug: string): PublicBooking {
  const link = bookingByPath(readState(), organiserSlug, bookingSlug)
  return {
    title: link.title, description: link.description, durationMinutes: link.durationMinutes, provider: link.provider,
    location: link.location, organiser: { name: "Harry Phillips" }, kind: link.kind, hostNames: link.hosts.map((host) => host.name), questions: link.questions, status: link.status,
    branding: { displayName: "Demo Organisation", logoUrl: null, primaryColor: "#0A7068", secondaryColor: "#164E49", backgroundColor: "#F3F4F4", surfaceColor: "#FFFFFF", textColor: "#292929", appearanceMode: "light", cornerStyle: "rounded", emailSignOff: "Demo Organisation · Freight handled with care" },
    workspaceName: "Demo Organisation",
    localPreview: true,
  }
}

export function getPreviewSlots(organiserSlug: string, bookingSlug: string, from: string, until: string) {
  const state = readState()
  const link = bookingByPath(state, organiserSlug, bookingSlug)
  const slots: string[] = []
  const increment = state.availability.slotIncrementMinutes * 60_000
  const earliest = Math.max(Date.parse(from), Date.now() + (link.minimumNoticeMinutes ?? state.availability.minimumNoticeMinutes) * 60_000)
  const cursor = new Date(Math.ceil(earliest / increment) * increment)
  const end = Math.min(Date.parse(until), Date.now() + (link.bookingHorizonDays ?? state.availability.bookingHorizonDays) * 86_400_000)
  while (cursor.getTime() < end && slots.length < 96) {
    if (isPreviewSlotAvailable(state, link, cursor.getTime())) slots.push(cursor.toISOString())
    cursor.setTime(cursor.getTime() + increment)
  }
  return { timeZone: state.availability.timeZone, slots }
}

export function createPreviewHold(organiserSlug: string, bookingSlug: string, input: Record<string, unknown>) {
  const state = readState()
  const link = bookingByPath(state, organiserSlug, bookingSlug)
  if (String(input.website || "").trim()) throw new Error("That local booking could not be accepted.")
  const start = Date.parse(String(input.startAt || ""))
  const end = Date.parse(String(input.endAt || ""))
  if (!String(input.name || "").trim() || !/^\S+@\S+\.\S+$/.test(String(input.email || ""))) throw new Error("Enter a valid name and email address.")
  if (!Number.isFinite(start) || end !== start + link.durationMinutes * 60_000 || !isPreviewSlotAvailable(state, link, start)) throw new Error("That time is no longer available. Choose a fresh slot.")
  const hold: PreviewHold = {
    id: crypto.randomUUID(), bookingLinkId: link.id, name: String(input.name || ""), email: String(input.email || ""),
    startAt: String(input.startAt || ""), endAt: String(input.endAt || ""), answers: (input.answers || {}) as Record<string, string>,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
  state.holds.push(hold)
  writeState(state)
  return { holdId: hold.id, expiresAt: hold.expiresAt, email: hold.email.replace(/^(.{1,2}).*(@.*)$/, "$1•••$2"), verificationRequired: true, previewCode }
}

export function resendPreviewBookingCode(organiserSlug: string, bookingSlug: string, holdId: string) {
  const state = readState()
  const link = bookingByPath(state, organiserSlug, bookingSlug)
  const hold = state.holds.find((item) => item.id === holdId && item.bookingLinkId === link.id)
  if (!hold || hold.meetingId || Date.parse(hold.expiresAt) <= Date.now()) throw new Error("This local booking hold is no longer available.")
  return { sent: false, expiresAt: hold.expiresAt, previewCode }
}

export function verifyPreviewHold(organiserSlug: string, bookingSlug: string, holdId: string, code: string) {
  const state = readState()
  const link = bookingByPath(state, organiserSlug, bookingSlug)
  const hold = state.holds.find((item) => item.id === holdId && item.bookingLinkId === link.id)
  if (!hold) throw new Error("This local booking hold was not found.")
  if (code !== previewCode) throw new Error("Use the local preview code shown above the code field.")
  if (hold.meetingId && hold.managementToken) {
    const existingMeeting = state.meetings.find((item) => item.id === hold.meetingId)
    if (!existingMeeting) throw new Error("This local booking could not be recovered.")
    return { confirmed: existingMeeting.status === "confirmed", finalising: existingMeeting.status === "provisioning", meeting: existingMeeting, managePath: `/meetings/manage/${hold.managementToken}` }
  }
  if (Date.parse(hold.expiresAt) <= Date.now()) throw new Error("This local booking hold has expired.")
  if (!isPreviewSlotAvailable(state, link, Date.parse(hold.startAt), hold.id)) {
    state.holds = state.holds.filter((item) => item.id !== holdId)
    writeState(state)
    throw new Error("That time is no longer available. Your details were preserved; choose a fresh slot.")
  }
  const meeting = createPreviewMeeting({ title: link.title, agenda: link.description, startAt: hold.startAt, endAt: hold.endAt, timeZone: state.availability.timeZone, provider: link.provider, colour: "teal", location: link.location, bookingLinkId: link.id, allowAttendeeReschedule: true, reminders: [1440, 60], attendees: [{ name: hold.name, email: hold.email }] } as MeetingDraft & { bookingLinkId: string }, "calendar")
  const refreshed = readState()
  meeting.bookingLinkId = link.id
  const meetingIndex = refreshed.meetings.findIndex((item) => item.id === meeting.id)
  refreshed.meetings[meetingIndex] = meeting
  const token = `preview-${crypto.randomUUID()}`
  refreshed.managed.push({ token, meetingId: meeting.id, bookingLinkId: link.id, participant: { id: meeting.participants?.[0]?.id || crypto.randomUUID(), name: hold.name, response: "needs_action" } })
  refreshed.holds = refreshed.holds.map((item) => item.id === holdId ? { ...item, meetingId: meeting.id, managementToken: token } : item)
  writeState(refreshed)
  return { confirmed: true, finalising: false, meeting, managePath: `/meetings/manage/${token}` }
}

export function getPreviewManagedMeeting(token: string): ManagedMeeting {
  const state = readState()
  const managed = state.managed.find((item) => item.token === token)
  if (!managed) throw new Error("This local management link is not available.")
  const meeting = state.meetings.find((item) => item.id === managed.meetingId)
  const link = state.bookingLinks.find((item) => item.id === managed.bookingLinkId)
  if (!meeting) throw new Error("This local meeting is not available.")
  const startsAt = Date.parse(meeting.startAt)
  const rescheduleCutoffMinutes = link?.rescheduleCutoffMinutes ?? 0
  const cancellationCutoffMinutes = link?.cancellationCutoffMinutes ?? 0
  const branding = link ? getPreviewPublicBooking(link.organiserSlug, link.slug).branding : {
    displayName: "Demo Organisation", logoUrl: null, primaryColor: "#0A7068", secondaryColor: "#164E49",
    backgroundColor: "#F3F4F4", surfaceColor: "#FFFFFF", textColor: "#292929", appearanceMode: "light" as const,
    cornerStyle: "rounded" as const, emailSignOff: "Demo Organisation · Freight handled with care",
  }
  return {
    meeting: { ...meeting, attendeeCount: meeting.participants?.length || 1 }, participant: managed.participant,
    permissions: {
      canReschedule: meeting.status === "confirmed" && meeting.allowAttendeeReschedule !== false && startsAt - Date.now() > rescheduleCutoffMinutes * 60_000,
      canCancel: meeting.status === "confirmed" && startsAt - Date.now() > cancellationCutoffMinutes * 60_000,
      rescheduleCutoffMinutes, cancellationCutoffMinutes,
    },
    bookingPath: link?.path ?? null, branding, workspaceName: "Demo Organisation", localPreview: true,
  }
}

export function getPreviewManagedSlots(token: string, from: string, until: string) {
  const state = readState()
  const managed = state.managed.find((item) => item.token === token)
  if (!managed) throw new Error("This local management link is not available.")
  const meeting = state.meetings.find((item) => item.id === managed.meetingId)
  if (!meeting || meeting.status !== "confirmed" || meeting.allowAttendeeReschedule === false) throw new Error("This meeting can no longer be rescheduled.")
  const existing = state.bookingLinks.find((item) => item.id === managed.bookingLinkId)
  const durationMinutes = Math.round((Date.parse(meeting.endAt) - Date.parse(meeting.startAt)) / 60_000)
  const link: BookingLink = existing ?? {
    id: "preview-managed-availability", organiserSlug: "preview", slug: "managed", title: meeting.title, description: meeting.agenda ?? null,
    durationMinutes, provider: meeting.provider === "calendar" ? "multideck" : meeting.provider, location: meeting.location ?? null, status: "active",
    kind: "one_on_one", hosts: [], availability: null, minimumNoticeMinutes: null, bookingHorizonDays: null, bufferBeforeMinutes: null, bufferAfterMinutes: null,
    questions: [], rescheduleCutoffMinutes: 0, cancellationCutoffMinutes: 0, path: "", updatedAt: new Date().toISOString(),
  }
  const slots: string[] = []
  const increment = state.availability.slotIncrementMinutes * 60_000
  const earliest = Math.max(Date.parse(from), Date.now() + (link.minimumNoticeMinutes ?? state.availability.minimumNoticeMinutes) * 60_000)
  const cursor = new Date(Math.ceil(earliest / increment) * increment)
  const end = Math.min(Date.parse(until), Date.now() + (link.bookingHorizonDays ?? state.availability.bookingHorizonDays) * 86_400_000)
  while (cursor.getTime() < end && slots.length < 96) {
    if (isPreviewSlotAvailable(state, { ...link, durationMinutes }, cursor.getTime(), undefined, meeting.id)) slots.push(cursor.toISOString())
    cursor.setTime(cursor.getTime() + increment)
  }
  return { timeZone: state.availability.timeZone, slots }
}

export function managePreviewMeeting(token: string, input: Record<string, unknown>) {
  const state = readState()
  const managed = state.managed.find((item) => item.token === token)
  if (!managed) throw new Error("This local management link is not available.")
  const index = state.meetings.findIndex((item) => item.id === managed.meetingId)
  if (index < 0) throw new Error("This local meeting is not available.")
  const action = String(input.action || "")
  if (action === "rsvp") {
    managed.participant.response = input.response as ManagedMeeting["participant"]["response"]
    state.meetings[index] = {
      ...state.meetings[index],
      participants: state.meetings[index].participants?.map((participant) => participant.id === managed.participant.id ? { ...participant, response: managed.participant.response } : participant),
    }
  }
  if (action === "cancel_attendance") {
    if ((state.meetings[index].participants?.length || 1) > 1) {
      managed.participant.response = "declined"
      state.meetings[index] = {
        ...state.meetings[index],
        participants: state.meetings[index].participants?.map((participant) => participant.id === managed.participant.id ? { ...participant, response: "declined" } : participant),
      }
    } else {
      state.meetings[index] = { ...state.meetings[index], status: "cancelled", version: (state.meetings[index].version || 1) + 1 }
    }
  }
  if (action === "reschedule") {
    const proposed = Array.isArray(input.proposedTimes) ? input.proposedTimes.slice(0, 3) as Array<{ startAt?: string; endAt?: string }> : []
    if (!proposed.length || proposed.some((time) => !time?.startAt || !time.endAt)) throw new Error("Choose a local preview time.")
    const duration = Date.parse(state.meetings[index].endAt) - Date.parse(state.meetings[index].startAt)
    const available = new Set(getPreviewManagedSlots(token, new Date(Math.min(...proposed.map((time) => Date.parse(time.startAt!)))).toISOString(), new Date(Math.max(...proposed.map((time) => Date.parse(time.endAt!))) + 1).toISOString()).slots)
    if (proposed.some((time) => Date.parse(time.endAt!) - Date.parse(time.startAt!) !== duration || !available.has(new Date(time.startAt!).toISOString()))) throw new Error("That local preview time is no longer available.")
    if ((state.meetings[index].participants?.length || 1) > 1) {
      const request = {
        id: crypto.randomUUID(), participantId: managed.participant.id, participantName: managed.participant.name,
        proposedTimes: proposed.map((time) => ({ startAt: new Date(time.startAt!).toISOString(), endAt: new Date(time.endAt!).toISOString() })),
        status: "pending" as const, createdAt: new Date().toISOString(),
      }
      state.meetings[index] = { ...state.meetings[index], changeRequests: [...(state.meetings[index].changeRequests ?? []), request] }
      writeState(state)
      return { requested: true, changeRequestId: request.id }
    }
    state.meetings[index] = { ...state.meetings[index], startAt: new Date(proposed[0].startAt!).toISOString(), endAt: new Date(proposed[0].endAt!).toISOString(), version: (state.meetings[index].version || 1) + 1 }
  }
  writeState(state)
  return { updated: true }
}
