import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")

test("booking tab content swaps in one stable panel without overlapping exit animation", () => {
  const workspaceStart = source.indexOf("export function BookingDetailWorkspace")
  const workspace = source.slice(workspaceStart)

  assert.match(workspace, /data-booking-tab-panel/u)
  assert.doesNotMatch(workspace, /AnimatePresence|mode="popLayout"|key=\{activeTab\}|visualTabTravelDirection/u)
  assert.match(workspace, /<BookingDetailTabPage\s+activeTab=\{activeTab\}/u)
})

test("the route is a trailing nested surface in the booking record bar", () => {
  const headerStart = source.indexOf("function BookingDetailHeader")
  const headerEnd = source.indexOf("function BookingJobContext", headerStart)
  const header = source.slice(headerStart, headerEnd)

  assert.match(header, /data-booking-route/u)
  assert.match(header, /rounded-\[calc\(var\(--md-radius-xl\)-6px\)\]/u)
  assert.match(header, /bg-\[var\(--md-field-bg\)\]/u)
  assert.match(header, /lg:ms-auto/u)
})

test("overview uses a data-derived operational coverage bar chart", () => {
  assert.match(source, /function BookingOperationalCoverage/u)
  assert.match(source, /label: "Movement"/u)
  assert.match(source, /label: "Schedule"/u)
  assert.match(source, /label: "Commercial close-out"/u)
  assert.match(source, /<Progress[\s\S]*?value=\{group\.score\}/u)
  assert.match(source, /<BookingOperationalCoverage record=\{record\} \/>/u)
  assert.doesNotMatch(source, /title=\{t\("Operational control queue"\)\}/u)
})
