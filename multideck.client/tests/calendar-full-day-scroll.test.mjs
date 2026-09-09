import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const view = read("../src/components/multideck/calendar-view.tsx")
const core = read("../src/components/multideck/calendar-period-core.ts")
const { calendarTimePartsAtMinutes } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(core, { mode: "strip" })).toString("base64")}`)

test("week grid exposes the full day with a focusable, padded scrolling region", () => {
  assert.match(view, /const GRID_START_HOUR = 0/)
  assert.match(view, /const GRID_END_HOUR = 24/)
  assert.match(view, /const INITIAL_VIEW_HOUR = 7/)
  assert.match(view, /role="region" aria-label="Calendar time slots" tabIndex=\{0\}/)
  assert.match(view, /overflow-y-auto overscroll-contain py-3/)
  assert.match(view, /scrollTop = \(INITIAL_VIEW_HOUR - GRID_START_HOUR\) \* HOUR_HEIGHT/)
  assert.doesNotMatch(view, /min-h-\[520px\]/)
})

test("midnight drag endpoints advance the date instead of making a negative duration", () => {
  assert.deepEqual(calendarTimePartsAtMinutes("2026-09-02", 0), { dateKey: "2026-09-02", time: "00:00" })
  assert.deepEqual(calendarTimePartsAtMinutes("2026-09-02", 1425), { dateKey: "2026-09-02", time: "23:45" })
  assert.deepEqual(calendarTimePartsAtMinutes("2026-09-02", 1440), { dateKey: "2026-09-03", time: "00:00" })
  assert.deepEqual(calendarTimePartsAtMinutes("2026-12-31", 1440), { dateKey: "2027-01-01", time: "00:00" })
  assert.deepEqual(calendarTimePartsAtMinutes("2026-10-25", 1440), { dateKey: "2026-10-26", time: "00:00" })
  assert.match(view, /endAt = instantAtGridMinutes\(dateKey, endMinutes, timeZone\)/)
  assert.match(view, /endAt: instantAtGridMinutes\(preview.dateKey, preview.endMinutes, timeZone\)/)
  assert.match(view, /endMinutes - start.hour \* 60 - start.minute/)
})

test("calendar and legacy pencil actions share the approved Hugeicons Pen01", () => {
  const icons = read("../src/components/icons/hugeicons.tsx")
  const details = read("../src/components/multideck/meeting-details-popover.tsx")
  const gallery = read("../src/pages/components-gallery-page.tsx")
  assert.match(icons, /Pen01Icon as Pen01IconData/)
  assert.match(icons, /Pen01 = createMultideckIcon\(Pen01IconData, "Pen01"\)/)
  assert.match(icons, /export const Pencil = Pen01\b/)
  assert.doesNotMatch(icons, /\bPencilIcon(?:Data)?\b/)
  assert.match(details, /label="Edit event" icon=\{Pen01\}/)
  assert.match(gallery, /\["Edit event", Pen01\]/)
})
