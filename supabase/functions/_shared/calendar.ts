import { HttpError } from "./backend.ts"

export const CALENDAR_PROVIDERS = ["multideck", "google_meet", "microsoft_teams", "zoom", "phone", "in_person"] as const
export type CalendarProvider = typeof CALENDAR_PROVIDERS[number]

export type WorkingHours = Record<string, Array<[string, string]>>
export type BusyRange = { startAt: string; endAt: string }

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: [["09:00", "17:00"]],
  tuesday: [["09:00", "17:00"]],
  wednesday: [["09:00", "17:00"]],
  thursday: [["09:00", "17:00"]],
  friday: [["09:00", "17:00"]],
  saturday: [],
  sunday: [],
}

const weekdayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

export function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

export function requiredText(value: unknown, label: string, maximum: number) {
  const text = cleanText(value, maximum)
  if (!text) throw new HttpError(400, `${label} is required.`)
  return text
}

export function emailAddress(value: unknown) {
  const email = cleanText(value, 320).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.")
  return email
}

export function uuidOrNull(value: unknown) {
  const text = cleanText(value, 60)
  if (!text) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new HttpError(400, "A linked record is not valid.")
  }
  return text
}

export function parseProvider(value: unknown): CalendarProvider {
  const provider = cleanText(value, 40) || "multideck"
  if (!CALENDAR_PROVIDERS.includes(provider as CalendarProvider)) throw new HttpError(400, "Choose a supported meeting type.")
  return provider as CalendarProvider
}

export function parseDateTime(value: unknown, label: string) {
  const text = cleanText(value, 100)
  const date = new Date(text)
  if (!text || Number.isNaN(date.getTime())) throw new HttpError(400, `${label} is not a valid date and time.`)
  return date
}

export function parseTimeZone(value: unknown) {
  const zone = cleanText(value, 100) || "Europe/London"
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone }).format(new Date())
    return zone
  } catch {
    throw new HttpError(400, "Choose a valid timezone.")
  }
}

export function parseMeetingRange(startValue: unknown, endValue: unknown) {
  const start = parseDateTime(startValue, "Start time")
  const end = parseDateTime(endValue, "End time")
  if (end <= start) throw new HttpError(400, "The meeting must finish after it starts.")
  if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) throw new HttpError(400, "A meeting cannot be longer than 24 hours.")
  return { start, end }
}

export function slugify(value: unknown, fallback: string) {
  const slug = cleanText(value, 120).toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100)
  return slug || fallback
}

export function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function verificationCode() {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return String(100000 + values[0] % 900000)
}

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as Record<string, number>
}

export function zonedLocalToUtc(dateKey: string, time: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new HttpError(400, "Availability contains an invalid time.")
  let guess = Date.UTC(year, month - 1, day, hour, minute)
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zoneParts(new Date(guess), timeZone)
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0)
    guess += Date.UTC(year, month - 1, day, hour, minute) - represented
  }
  return new Date(guess)
}

export function dateKeyInZone(date: Date, timeZone: string) {
  const parts = zoneParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

export function weekdayInZone(date: Date, timeZone: string) {
  const label = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" }).format(date).toLowerCase()
  return weekdayKeys.find((key) => key === label) ?? "monday"
}

function intervalsOverlap(first: { start: number; end: number }, second: { start: number; end: number }) {
  return first.start < second.end && first.end > second.start
}

export function availableSlots(input: {
  from: Date
  until: Date
  timeZone: string
  durationMinutes: number
  incrementMinutes: number
  noticeMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  workingHours: WorkingHours
  exceptions?: Array<{ date: string; unavailable?: boolean; ranges?: Array<[string, string]> }>
  busy: BusyRange[]
  now?: Date
}) {
  const now = input.now ?? new Date()
  const earliest = now.getTime() + input.noticeMinutes * 60_000
  const busy = input.busy.map((range) => ({ start: Date.parse(range.startAt), end: Date.parse(range.endAt) }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
  const slots: string[] = []
  const cursor = new Date(Date.UTC(input.from.getUTCFullYear(), input.from.getUTCMonth(), input.from.getUTCDate()))
  const seenDates = new Set<string>()

  while (cursor <= input.until && slots.length < 1_500) {
    const dateKey = dateKeyInZone(cursor, input.timeZone)
    if (!seenDates.has(dateKey)) {
      seenDates.add(dateKey)
      const exception = input.exceptions?.find((item) => item.date === dateKey)
      const periods = exception?.unavailable ? [] : exception?.ranges ?? input.workingHours[weekdayInZone(cursor, input.timeZone)] ?? []
      for (const [open, close] of periods) {
        const periodStart = zonedLocalToUtc(dateKey, open, input.timeZone).getTime()
        const periodEnd = zonedLocalToUtc(dateKey, close, input.timeZone).getTime()
        const duration = input.durationMinutes * 60_000
        for (let start = periodStart; start + duration <= periodEnd; start += input.incrementMinutes * 60_000) {
          if (start < earliest || start < input.from.getTime() || start >= input.until.getTime()) continue
          const candidate = {
            start: start - input.bufferBeforeMinutes * 60_000,
            end: start + duration + input.bufferAfterMinutes * 60_000,
          }
          if (!busy.some((range) => intervalsOverlap(candidate, range))) slots.push(new Date(start).toISOString())
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return slots
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function icsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

export function meetingIcs(input: {
  id: string
  version: number
  method: "REQUEST" | "CANCEL"
  title: string
  description?: string | null
  startAt: string
  endAt: string
  location?: string | null
  organiserEmail: string
  organiserName: string
  attendees: Array<{ name: string; email: string }>
}) {
  const status = input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Multideck//Calendar//EN",
    "VERSION:2.0",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${input.id}@multideck.app`,
    `SEQUENCE:${Math.max(0, input.version)}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(input.startAt)}`,
    `DTEND:${icsDate(input.endAt)}`,
    `STATUS:${status}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    `ORGANIZER;CN=${escapeIcs(input.organiserName)}:mailto:${input.organiserEmail}`,
    ...input.attendees.map((attendee) => `ATTENDEE;CN=${escapeIcs(attendee.name)};RSVP=TRUE:mailto:${attendee.email}`),
  ]
  if (input.description) lines.push(`DESCRIPTION:${escapeIcs(input.description)}`)
  if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`)
  lines.push("END:VEVENT", "END:VCALENDAR", "")
  return lines.join("\r\n")
}
