import assert from "node:assert/strict"
import test from "node:test"
import { decideUkVatPriorPeriodErrorMethod as decide } from "../functions/_shared/uk-vat-prior-period-error.mts"

test("previous-return errors use aggregate net VAT and the current Box 6 threshold", () => {
  const item = (signedVatErrorGbp, conduct = "reasonable_care") => ({ signedVatErrorGbp, conduct })
  const base = { errors: [item("12000.00"), item("-2000.00")], currentBox6Gbp: null }
  assert.deepEqual(decide(base), { netErrorGbp: "10000.00", method: "current_return_adjustment",
    reason: "within_10000", conductReviewRequired: false, carelessDisclosureAdvisory: false })
  assert.equal(decide({ ...base, errors: [item("12000.00")] }).method, "needs_current_box6")
  assert.equal(decide({ ...base, errors: [item("12000.00")], currentBox6Gbp: "1200000.00" }).method, "current_return_adjustment")
  assert.equal(decide({ ...base, errors: [item("12000.01")], currentBox6Gbp: "1200000.00" }).method, "separate_notification")
  assert.equal(decide({ ...base, errors: [item("50000.01")] }).reason, "over_50000")
  assert.equal(decide({ ...base, errors: [item("100.00", "deliberate")] }).reason, "deliberate")
  assert.equal(decide({ ...base, errors: [item("100.00", "careless")] }).carelessDisclosureAdvisory, true)
  assert.equal(decide({ ...base, errors: [item("100.00", "undetermined")] }).conductReviewRequired, true)
  assert.equal(decide({ ...base, chooseSeparateNotification: true }).reason, "elected_separate")
  assert.throws(() => decide({ ...base, errors: [] }), /At least one/)
  assert.throws(() => decide({ ...base, errors: [item("100.00", "guess")] }), /valid conduct/)
  assert.throws(() => decide({ ...base, currentBox6Gbp: "-1.00", errors: [item("12000.00")] }), /must be GBP/)
})
