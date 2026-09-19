import assert from "node:assert/strict"
import test from "node:test"
import { Decimal } from "../functions/_shared/customs-calculation-decimal.mts"
import { evaluateTariffMeasure } from "../functions/_shared/customs-tariff-evaluator.mts"

const specific = rate => ({ type: "specific", rate, currency: "GBP", quantity: "1", unit: "KGM", per: "1" })
const measure = () => ({ taxType: "A00", components: [{ type: "percent", rate: "10" }, specific("1")] })
const date = "2026-09-15"
test("allocated original quantities stay exact and do not scale the allocated percentage base again", () => {
  const input = measure(), before = structuredClone(input)
  const result = evaluateTariffMeasure(input, Decimal.parse("100"), date, new Decimal(1n, 3n))
  assert.deepEqual(result.amount.evidence(), { numerator: "31", denominator: "3" })
  assert.match(result.workings[1].label, /original-input share 1\/3/)
  assert.deepEqual(input, before)
  assert.equal(evaluateTariffMeasure(input, Decimal.parse("100"), date).amount.fixed(2), "11.00")
})
test("structured comparisons use the same exact quantity share", () => {
  const input = { ...measure(), bounds: [{ type: "minimum", components: [specific("60")] }] }
  const result = evaluateTariffMeasure(input, Decimal.parse("100"), date, new Decimal(1n, 3n))
  assert.equal(result.amount.fixed(2), "20.00")
  assert.match(result.workings.at(-1).label, /minimum comparison applied/)
})
test("unreviewed product rounding and absolute bounds cannot be apportioned silently", () => {
  for (const patch of [{ minimum: "1" }, { maximum: "100" }, { calculationBasis: "alcohol-duty" }]) {
    assert.throws(() => evaluateTariffMeasure({ ...measure(), ...patch }, Decimal.parse("100"), date, new Decimal(1n, 3n)), /explicit review/)
  }
  for (const share of ["0", "-1", "1.01"]) assert.throws(() => evaluateTariffMeasure(measure(), Decimal.parse("100"), date, Decimal.parse(share)), /quantity share/)
})
