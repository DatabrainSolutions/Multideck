import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/bookings-page.tsx", import.meta.url), "utf8")

test("booking rows show one status treatment without duplicate exception text", () => {
  const statusColumn = source.slice(source.indexOf('id: "status"'), source.indexOf('id: "booking"'))

  assert.match(statusColumn, /label: t\("Status"\)/u)
  assert.match(statusColumn, /cell: \(booking\) => <BookingStatusPill status=\{booking\.status\} \/>/u)
  assert.doesNotMatch(statusColumn, /getBookingExceptionSummary\(booking\).*<p/u)
})

test("transport mode has a dedicated column before movement", () => {
  const modeColumnStart = source.indexOf('id: "mode"')
  const movementColumnStart = source.indexOf('id: "movement"')
  const scheduleColumnStart = source.indexOf('id: "schedule"')
  const modeColumn = source.slice(modeColumnStart, movementColumnStart)
  const movementColumn = source.slice(movementColumnStart, scheduleColumnStart)

  assert.ok(modeColumnStart > 0 && movementColumnStart > modeColumnStart)
  assert.match(modeColumn, /label: t\("Mode"\)/u)
  assert.match(modeColumn, /<BookingModePill mode=\{booking\.mode\} \/>/u)
  assert.doesNotMatch(movementColumn, /BookingModePill/u)
  assert.match(source, /storageKey="booking-register-operations-v3"/u)
})
