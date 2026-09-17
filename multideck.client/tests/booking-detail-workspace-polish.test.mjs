import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")

test("booking tab content swaps in one stable panel without overlapping exit animation", () => {
  const workspaceStart = source.indexOf("export function BookingDetailWorkspace")
  const workspace = source.slice(workspaceStart)

  assert.match(workspace, /data-booking-tab-panel/u)
  assert.doesNotMatch(workspace, /AnimatePresence|mode="popLayout"|key=\{activeTab\}|visualTabTravelDirection/u)
  assert.match(workspace, /<BookingDetailTabPage[\s\S]*?activeTab=\{activeTab\}/u)
})

test("the compact route is shown once in the booking record bar", () => {
  const header = source.slice(source.indexOf("function BookingDetailHeader"), source.indexOf("function BookingJobContext"))
  const route = source.slice(source.indexOf("function BookingRouteSummary"), source.indexOf("function BookingDetailHeader"))
  assert.equal((header.match(/<BookingRouteSummary record=\{record\} \/>/gu) ?? []).length, 1)
  assert.match(route, /data-booking-route-summary/u)
  assert.match(route, /h-8.*rounded-\[var\(--md-radius-lg\)\]/u)
  assert.match(route, /originFlag/u)
  assert.match(route, /destinationFlag/u)
  assert.match(route, /record\.booking\.mode/u)
})

test("overview uses the linked customer account without a timeline or completeness graph", () => {
  assert.match(source, /<BookingCustomerPanel customerId=\{record\.workspace\?\.booking\.customerId\}/u)
  assert.doesNotMatch(source, /function BookingOperationalCoverage|Booking information coverage|BookingCheckpointTimeline/u)
})
