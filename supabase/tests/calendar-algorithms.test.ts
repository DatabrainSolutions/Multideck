import {
  availableSlots,
  meetingIcs,
  parseMeetingRange,
  parseTimeZone,
} from "../functions/_shared/calendar.ts"
import {
  renderCalendarEmailTemplate,
  validateCalendarEmailTemplate,
} from "../functions/_shared/calendar-email-templates.ts"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test("availability follows Europe/London daylight-saving time", () => {
  const spring = availableSlots({
    from: new Date("2026-03-30T00:00:00.000Z"),
    until: new Date("2026-03-31T00:00:00.000Z"),
    timeZone: "Europe/London",
    durationMinutes: 30,
    incrementMinutes: 30,
    noticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    workingHours: { monday: [["09:00", "10:00"]] },
    busy: [],
    now: new Date("2026-03-01T00:00:00.000Z"),
  })
  assert(spring[0] === "2026-03-30T08:00:00.000Z", "BST slots must be converted to UTC without shifting the local hour")

  const autumn = availableSlots({
    from: new Date("2026-10-26T00:00:00.000Z"),
    until: new Date("2026-10-27T00:00:00.000Z"),
    timeZone: "Europe/London",
    durationMinutes: 30,
    incrementMinutes: 30,
    noticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    workingHours: { monday: [["09:00", "10:00"]] },
    busy: [],
    now: new Date("2026-10-01T00:00:00.000Z"),
  })
  assert(autumn[0] === "2026-10-26T09:00:00.000Z", "GMT slots must retain the expected UTC hour")
})

Deno.test("availability applies buffers, exceptions and notice windows", () => {
  const slots = availableSlots({
    from: new Date("2026-09-07T00:00:00.000Z"),
    until: new Date("2026-09-08T00:00:00.000Z"),
    timeZone: "Europe/London",
    durationMinutes: 30,
    incrementMinutes: 30,
    noticeMinutes: 0,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    workingHours: { monday: [["09:00", "11:00"]] },
    busy: [{ startAt: "2026-09-07T08:45:00.000Z", endAt: "2026-09-07T09:15:00.000Z" }],
    now: new Date("2026-09-01T00:00:00.000Z"),
  })
  assert(slots.length === 2, "busy time plus buffers should leave only the boundary-safe slots")
  assert(slots[0] === "2026-09-07T08:00:00.000Z" && slots[1] === "2026-09-07T09:30:00.000Z", "slot boundaries should remain available when they only touch a busy range")

  const unavailable = availableSlots({
    from: new Date("2026-09-07T00:00:00.000Z"),
    until: new Date("2026-09-08T00:00:00.000Z"),
    timeZone: "Europe/London",
    durationMinutes: 30,
    incrementMinutes: 15,
    noticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    workingHours: { monday: [["09:00", "17:00"]] },
    exceptions: [{ date: "2026-09-07", unavailable: true }],
    busy: [],
    now: new Date("2026-09-01T00:00:00.000Z"),
  })
  assert(unavailable.length === 0, "an unavailable exception must suppress the full day")
})

Deno.test("meeting validation and versioned ICS remain strict", () => {
  assert(parseTimeZone("America/New_York") === "America/New_York", "valid IANA zones should be accepted")
  let rejected = false
  try { parseMeetingRange("2026-09-01T10:00:00Z", "2026-09-01T09:00:00Z") } catch { rejected = true }
  assert(rejected, "a meeting ending before it starts must be rejected")

  const cancellation = meetingIcs({
    id: "a4cc73fc-33c2-4b49-989a-5f3848b1a102",
    version: 4,
    method: "CANCEL",
    title: "Freight review, Q3",
    startAt: "2026-09-08T09:30:00Z",
    endAt: "2026-09-08T10:00:00Z",
    organiserEmail: "operator@example.com",
    organiserName: "Alex Morgan",
    attendees: [{ name: "Sam Taylor", email: "sam@example.com" }],
  })
  assert(cancellation.includes("METHOD:CANCEL") && cancellation.includes("STATUS:CANCELLED") && cancellation.includes("SEQUENCE:4"), "cancellations must keep the stable UID and incremented sequence")
  assert(cancellation.includes("SUMMARY:Freight review\\, Q3"), "ICS text must be escaped")
})

Deno.test("workspace meeting templates accept only safe variables and plain text", () => {
  const template = validateCalendarEmailTemplate("management", "Manage {meeting_title}", "Hello {attendee_name}\n\nOpen {manage_url}")
  const rendered = renderCalendarEmailTemplate(template, { meeting_title: "Import review", attendee_name: "Sam", manage_url: "https://example.com/manage" })
  assert(rendered.subject === "Manage Import review", "supported variables should render")
  assert(rendered.body.includes("https://example.com/manage"), "management URLs should render")

  for (const body of ["Hello {unknown_value}", "<strong>Hello</strong>"]) {
    let rejected = false
    try { validateCalendarEmailTemplate("management", "Meeting", body) } catch { rejected = true }
    assert(rejected, "unknown variables and HTML must be rejected")
  }
})
