export type CompanyEventCalendarInput = {
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string
  details: string
}

function calendarDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error("The event date is not valid")
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

/** The user reviews and saves this pre-filled entry in Google Calendar. */
export function companyEventGoogleCalendarUrl(event: CompanyEventCalendarInput, eventUrl: string) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${calendarDate(event.startsAt)}/${calendarDate(event.endsAt ?? event.startsAt)}`,
    ctz: event.timezone,
    location: event.location,
    // Keep the URL usable for email clients; the full description is in the .ics file.
    details: `${event.details.slice(0, 600)}${event.details.length > 600 ? "…" : ""}\n\nSee event: ${eventUrl}`.trim(),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n?|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,")
}

/** RFC 5545 folds at 75 octets, without splitting UTF-8 code points. */
function foldLine(line: string) {
  const lines: string[] = []
  let current = "", length = 0
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length
    if (length + bytes > 75) { lines.push(current); current = " "; length = 1 }
    current += character
    length += bytes
  }
  return [...lines, current].join("\r\n")
}

/** A personal import, not an RSVP or a meeting invitation to other attendees. */
export function companyEventCalendarFile(event: CompanyEventCalendarInput & { id: string; editVersion: number }, eventUrl: string, now = new Date()) {
  const url = new URL(eventUrl)
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("The event link is not valid")
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Multideck//Company Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:company-event-${escapeText(event.id)}@${url.hostname}`,
    `SEQUENCE:${Math.max(0, Math.trunc(event.editVersion))}`, `DTSTAMP:${calendarDate(now.toISOString())}`,
    `DTSTART:${calendarDate(event.startsAt)}`,
    ...(event.endsAt ? [`DTEND:${calendarDate(event.endsAt)}`] : []),
    `SUMMARY:${escapeText(event.title)}`, `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(`${event.details}\n\nSee event: ${eventUrl}`.trim())}`,
    `URL:${url.href}`, "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR",
  ]
  return lines.map(foldLine).join("\r\n") + "\r\n"
}
