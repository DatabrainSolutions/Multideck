import type { CalendarEvent } from "./calendar-api"
import type { CompanyEvent } from "./company-events-api"

/** Read projection only: the RSVP and event remain the source of truth. */
export function companyEventsForCalendar(events: CompanyEvent[], start: string, end: string): CalendarEvent[] {
  const from = Date.parse(start), until = Date.parse(end)
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return []
  return events.flatMap((event) => {
    const begins = Date.parse(event.startsAt), finishes = Date.parse(event.endsAt ?? event.startsAt)
    if (event.status !== "published" || event.myRsvp?.status !== "going"
      || !Number.isFinite(begins) || !Number.isFinite(finishes)
      || finishes < begins
      || begins >= until || (event.endsAt ? finishes <= from : begins < from)) return []
    return [{
      id: `company-event:${event.id}`, companyEventId: event.id, source: "company_event",
      title: event.title, agenda: event.details, location: event.location,
      startAt: event.startsAt, endAt: event.endsAt ?? event.startsAt, timeZone: event.timezone,
      status: "confirmed", provider: "multideck", colour: "teal", canEdit: false, canRespond: false,
      rsvpResponse: "accepted",
    } satisfies CalendarEvent]
  })
}
