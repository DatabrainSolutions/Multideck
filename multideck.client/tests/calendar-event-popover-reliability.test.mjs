import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/multideck/meeting-details-popover.tsx", import.meta.url), "utf8")
const calendarView = readFileSync(new URL("../src/components/multideck/calendar-view.tsx", import.meta.url), "utf8")

test("a stale dismissal cannot close the newly selected calendar event", () => {
  assert.match(source, /const latestSelection = useRef\(selection\)/)
  assert.match(source, /latestSelection\.current = selection/)
  assert.match(source, /if \(!open && latestSelection\.current === selection\) onClose\(\)/)
})

test("the selected event block is not treated as an outside-dismiss target", () => {
  assert.match(source, /onInteractOutside=\{\(event\) => \{/)
  assert.match(source, /selection\.anchor\.contains\(event\.target as Node\)/)
  assert.match(source, /event\.preventDefault\(\)/)
})

test("an outside pointer interaction keeps focus on the newly clicked target", () => {
  assert.match(source, /const interactedOutside = useRef\(false\)/)
  assert.match(source, /const shouldRestoreFocus = !interactedOutside\.current/)
  assert.match(source, /interactedOutside\.current = true/)
  assert.match(source, /if \(shouldRestoreFocus && selection\.anchor\.isConnected\) selection\.anchor\.focus/)
})

test("calendar event clicks hand the open popover directly to the next event", () => {
  assert.match(calendarView, /data-calendar-event=""/)
  assert.match(source, /event\.target\.closest\("\[data-calendar-event\]"\)/)
  assert.match(source, /event\.preventDefault\(\)/)
})
