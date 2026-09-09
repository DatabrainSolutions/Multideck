import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"

const source = readFileSync(new URL("../functions/_shared/calendar-zoom.ts", import.meta.url), "utf8")
const { sameZoomInstant, zoomNumericReference, zoomStartTime } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`)

test("Zoom integer meeting IDs and timestamps retain their exact value", () => {
  assert.equal(zoomNumericReference(88292597496), "88292597496")
  assert.equal(zoomNumericReference(1788339002371), "1788339002371")
  assert.equal(zoomNumericReference(" 88292597496 "), "88292597496")
  for (const value of [null, {}, [], true, NaN, Infinity, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, "../../users", ""]) {
    assert.equal(zoomNumericReference(value), "")
  }
})

test("provider echoes do not mistake Postgres timestamp formatting for a reschedule", () => {
  assert.equal(sameZoomInstant("2026-09-03T15:15:00.000Z", "2026-09-03T15:15:00+00:00"), true)
  assert.equal(sameZoomInstant("2026-09-03T16:15:00+01:00", "2026-09-03T15:15:00Z"), true)
  assert.equal(sameZoomInstant("2026-09-03T15:45:00Z", "2026-09-03T15:15:00Z"), false)
  assert.equal(sameZoomInstant("invalid", "invalid"), false)
  assert.equal(sameZoomInstant(null, "2026-09-03T15:15:00Z"), false)
})

test("Zoom receives UTC Z timestamps across summer, winter and offset zones", () => {
  assert.equal(zoomStartTime("2026-09-03T16:00:00+00:00"), "2026-09-03T16:00:00Z")
  assert.equal(zoomStartTime("2026-09-03T17:00:00+01:00"), "2026-09-03T16:00:00Z")
  assert.equal(zoomStartTime("2026-12-03T17:00:00+00:00"), "2026-12-03T17:00:00Z")
  assert.equal(zoomStartTime("2026-09-03T17:00:00+05:30"), "2026-09-03T11:30:00Z")
  assert.throws(() => zoomStartTime("invalid"), RangeError)
  const worker = readFileSync(new URL("../functions/calendar-worker/index.ts", import.meta.url), "utf8")
  assert.equal((worker.match(/start_time: zoomStartTime\(/g) ?? []).length, 2, "Creation and updates must both normalise UTC")
})
