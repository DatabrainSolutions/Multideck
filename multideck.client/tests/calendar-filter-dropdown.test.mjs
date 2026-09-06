import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const calendar = await readFile(new URL("../src/components/multideck/calendar-view.tsx", import.meta.url), "utf8")
const menu = await readFile(new URL("../src/components/multideck/multi-select-menu.tsx", import.meta.url), "utf8")

test("calendar uses one shared checkbox dropdown instead of the separate toggles", () => {
  assert.match(calendar, /<MultiSelectMenu/)
  assert.match(calendar, /label="Show on calendar"/)
  assert.match(calendar, /value: "Operational dates",\s+label: "Operational dates"/)
  assert.match(calendar, /value: "Personal events",\s+label: "Personal events"/)
  assert.doesNotMatch(calendar, /CalendarFilterToggle/)
  assert.match(menu, /DropdownMenuCheckboxItem/)
  assert.match(menu, /onSelect=\{\(event\) => event.preventDefault\(\)\}/)
})

test("calendar filter palettes share block colours and survive hiding either layer", () => {
  assert.match(calendar, /new Set\(ribbons.map\(\(ribbon\) => ribbon.tone\)\)/)
  assert.match(calendar, /events.filter\(\(event\) => event.provider === "calendar"\).map\(\(event\) => event.colour \?\? "neutral"\)/)
  assert.match(calendar, /operationalTones.map[\s\S]*?ribbonTones\[tone\]/)
  assert.match(calendar, /personalColours.map[\s\S]*?style=\{meetingColourStyle\(colour\)\}/)
  assert.match(menu, /leading\?: ReactNode/)
  assert.match(menu, /option.leading \? <span aria-hidden="true"/)
})

test("dropdown keeps both filters independently selectable and on by default", () => {
  assert.match(calendar, /\[showOperational, setShowOperational\] = useState\(true\)/)
  assert.match(calendar, /\[showPersonal, setShowPersonal\] = useState\(true\)/)
  assert.match(calendar, /setShowOperational\(selected.includes\("Operational dates"\)\)/)
  assert.match(calendar, /setShowPersonal\(selected.includes\("Personal events"\)\)/)
  assert.match(calendar, /if \(!showOperational\) return map/)
  assert.match(calendar, /showPersonal \|\| item.provider !== "calendar"/)
  assert.match(calendar, /placeholder="Show on calendar"/)
})

test("calendar opts into a toolbar filter without restyling existing form fields", () => {
  assert.match(calendar, /<MultiSelectMenu\s+variant="toolbar"/)
  assert.match(menu, /variant = "field"/)
  assert.match(menu, /variant\?: "field" \| "toolbar"/)
  assert.match(menu, /toolbar \? t\(label \|\| placeholder\)/)
  assert.match(menu, /selectedLabels.length\} of \$\{options.length\} selected/)
  assert.match(menu, /rounded-\[var\(--md-radius-lg\)\]/)
  assert.match(menu, /rounded-\[calc\(var\(--md-radius-lg\)-4px\)\]/)
  assert.match(menu, /toolbar \? null : <DropdownMenuSeparator/)
})
