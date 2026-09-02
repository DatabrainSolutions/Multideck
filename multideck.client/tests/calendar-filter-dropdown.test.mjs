import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const calendar = await readFile(new URL("../src/components/multideck/calendar-view.tsx", import.meta.url), "utf8")
const menu = await readFile(new URL("../src/components/multideck/multi-select-menu.tsx", import.meta.url), "utf8")

test("calendar uses one shared checkbox dropdown instead of the separate toggles", () => {
  assert.match(calendar, /<MultiSelectMenu/)
  assert.match(calendar, /label="Show on calendar"/)
  assert.match(calendar, /options=\{\["Operational dates", "Personal events"\]\}/)
  assert.doesNotMatch(calendar, /CalendarFilterToggle/)
  assert.match(menu, /DropdownMenuCheckboxItem/)
  assert.match(menu, /onSelect=\{\(event\) => event.preventDefault\(\)\}/)
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
