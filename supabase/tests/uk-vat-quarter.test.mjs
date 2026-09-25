import assert from "node:assert/strict"
import test from "node:test"
import { suggestUkVatQuarter } from "../../multideck.client/src/lib/uk-vat-quarter.mts"

test("quarter dates follow the last or next return period end", () => {
  assert.deepEqual(suggestUkVatQuarter("last", "2026-06-30"), { start: "2026-07-01", end: "2026-09-30" })
  assert.deepEqual(suggestUkVatQuarter("next", "2026-09-30"), { start: "2026-07-01", end: "2026-09-30" })
  assert.deepEqual(suggestUkVatQuarter("last", "2026-12-31"), { start: "2027-01-01", end: "2027-03-31" })
  assert.deepEqual(suggestUkVatQuarter("next", "2027-03-31"), { start: "2027-01-01", end: "2027-03-31" })
  assert.throws(() => suggestUkVatQuarter("last", "2026-02-30"), /valid return/)
})
