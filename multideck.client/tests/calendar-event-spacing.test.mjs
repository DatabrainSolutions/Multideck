import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const view = readFileSync(new URL("../src/components/multideck/calendar-view.tsx", import.meta.url), "utf8")

test("week events reserve a visual gap without moving their scheduled geometry", () => {
  assert.match(view, /key=\{calendarEvent.id\} className="absolute pb-1" style=\{\{ top, height: visualHeight/)
  assert.match(view, /group relative h-full w-full/)
  assert.match(view, /overlapBoundary=\{overlap === "continuing"\}/)
  assert.match(view, /onGrip=\{weekGrip\(calendarEvent\)\}/)
})

test("month cells and nested event tracks shrink within their assigned day column", () => {
  const month = view.slice(view.indexOf('data-calendar-day={key}'))
  assert.match(month, /min-h-32 min-w-0 border-b/)
  assert.match(month, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-1/)
  assert.match(month, /key=\{event.id\} className=\{cn\("min-w-0 transition-opacity/)
  assert.match(month, /onOpen=\{openEvent\} onGrip=\{monthGrip\(event\)\}/)
  assert.match(view, /title=\{`\$\{title\} \$\{start.label\}–\$\{end.label\}`\}/)
})
