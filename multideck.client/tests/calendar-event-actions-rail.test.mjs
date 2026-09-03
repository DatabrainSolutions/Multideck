import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/multideck/meeting-details-popover.tsx", import.meta.url), "utf8")

test("event actions form a separate vertical surface inside the popover collision boundary", () => {
  assert.match(source, /data-slot="meeting-details-surface"/)
  assert.match(source, /aria-label="Event actions" className="[^"]*flex-col[^"]*self-start[^"]*rounded-\[var\(--md-radius-2xl\)\]/)
  assert.match(source, /flex-row items-start gap-2 rounded-none border-0 bg-transparent/)
  assert.match(source, /collisionPadding=\{16\}/)
  assert.doesNotMatch(source, /className="flex shrink-0 items-center justify-end gap-0.5 px-3 pt-3"/)
  assert.match(source, /size-10 rounded-\[calc\(var\(--md-radius-2xl\)-4px\)\]/)
})

test("the detached actions preserve permissions, in-place confirmation and focus return", () => {
  assert.match(source, /event.canEdit && !pending && mode === "view"/)
  assert.match(source, /label="Edit event" icon=\{Pen01\}/)
  assert.match(source, /tone="danger" onClick=\{\(\) => setMode\("cancel"\)\}/)
  assert.match(source, /label="Close" icon=\{X\} disabled=\{saving\}/)
  assert.match(source, /selection.anchor.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /side="right">\{label\}/)
})
