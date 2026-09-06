import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/multideck/calendar-view.tsx", import.meta.url), "utf8")

test("the vertically scrolling week grid cannot pan horizontally", () => {
  assert.match(
    source,
    /aria-label="Calendar time slots"[^>]+className="[^"]*overflow-x-hidden[^"]*overflow-y-auto/,
  )
})
