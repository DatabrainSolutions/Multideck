import assert from "node:assert/strict"
import test from "node:test"
import { calculateUkVatNineBoxes } from "../functions/_shared/uk-vat-nine-box.mts"

const period = { legalEntityId: "entity-a", start: "2026-07-01", end: "2026-09-30", scheme: "standard" }
const evidence = (id, treatment, netGbp, vatGbp, extra = {}) => ({
  id, legalEntityId: "entity-a", documentId: `document-${id}`,
  documentLineId: `line-${id}`, taxPoint: "2026-07-15", treatment,
  netGbp, vatGbp, sourceVersion: "posting-1", reviewedRuleId: "rule-1", ...extra,
})

test("standard return retains per-box sources and aggregates four-decimal posted amounts", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("sale", "domestic_sale", "100.0000", "20.0000"),
    evidence("credit", "domestic_sale", "-25.0000", "-5.0000"),
    evidence("zero", "zero_rated_sale", "50.0000", "0"),
    evidence("purchase", "domestic_purchase", "40.0000", "8.0000"),
    evidence("blocked-input", "nonrecoverable_purchase", "10.0000", "2.0000"),
  ] })
  assert.equal(result.calculationValid, true)
  assert.deepEqual(result.boxes, {
    1: "15.00", 2: "0.00", 3: "15.00", 4: "8.00", 5: "7.00",
    6: "125.00", 7: "50.00", 8: "0.00", 9: "0.00",
  })
  assert.deepEqual(result.lines[1].map(line => line.evidenceId), ["sale", "credit"])
  assert.equal(result.lines[5].length, 0)
})

test("repayment box five is a positive magnitude", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("purchase", "domestic_purchase", "100.0000", "20.0000"),
  ] })
  assert.equal(result.boxes[5], "20.00")
})

test("annual accounting uses normal boxes without reducing box five for instalments", () => {
  const annual = calculateUkVatNineBoxes({
    ...period, end: "2027-06-30", scheme: "annual", evidence: [
      evidence("sale", "domestic_sale", "1000.0000", "200.0000"),
      evidence("purchase", "domestic_purchase", "250.0000", "50.0000"),
    ],
  })
  assert.equal(annual.calculationValid, true)
  assert.equal(annual.boxes[1], "200.00")
  assert.equal(annual.boxes[4], "50.00")
  assert.equal(annual.boxes[5], "150.00")
  assert.equal(annual.boxes[6], "1000.00")
  assert.equal(annual.boxes[7], "250.00")
})

test("rounding happens after aggregation and does not turn small credits into extra pennies", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("a", "domestic_sale", "0", "0.0049"),
    evidence("b", "domestic_sale", "0", "0.0049"),
    evidence("c", "domestic_sale", "0", "-0.0048"),
  ] })
  assert.equal(result.boxes[1], "0.01")
  assert.equal(result.boxes[3], "0.01")
  assert.equal(result.boxes[5], "0.01")
  assert.deepEqual(result.lines[1].map(line => line.amountGbp), ["0.0049", "0.0049", "-0.0048"])
})

test("box five uses the already rounded boxes that HMRC validates", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("sale", "domestic_sale", "0.0255", "0.0051"),
    evidence("purchase", "domestic_purchase", "0.0245", "0.0049"),
  ] })
  assert.equal(result.boxes[1], "0.01")
  assert.equal(result.boxes[3], "0.01")
  assert.equal(result.boxes[4], "0.00")
  assert.equal(result.boxes[5], "0.01")
  assert.equal(result.lines[1][0].amountGbp, "0.0051")
  assert.equal(result.lines[4][0].amountGbp, "0.0049")
})

test("reviewed zero-rated and exempt purchases enter box seven without input VAT", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("zero-purchase", "zero_rated_purchase", "25.0000", "0"),
    evidence("exempt-purchase", "exempt_purchase", "30.0000", "0"),
    evidence("zero-credit", "zero_rated_purchase", "-5.0000", "0"),
  ] })
  assert.equal(result.calculationValid, true)
  assert.equal(result.boxes[4], "0.00")
  assert.equal(result.boxes[7], "50.00")
  assert.deepEqual(result.lines[7].map((line) => line.evidenceId), ["zero-purchase", "exempt-purchase", "zero-credit"])
  const inconsistent = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("bad-zero", "zero_rated_purchase", "25.0000", "1.0000"),
  ] })
  assert.equal(inconsistent.calculationValid, false)
  assert.equal(inconsistent.lines[7].length, 0)
})

test("a reviewed outside-UK service sale enters box six only", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("service", "outside_uk_service_sale", "125.0000", "0"),
    evidence("service-credit", "outside_uk_service_sale", "-25.0000", "0"),
  ] })
  assert.equal(result.calculationValid, true)
  assert.equal(result.boxes[1], "0.00")
  assert.equal(result.boxes[6], "100.00")
  assert.deepEqual(result.lines[6].map(line => line.evidenceId), ["service", "service-credit"])
  const charged = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("bad-service", "outside_uk_service_sale", "100", "20"),
  ] })
  assert.equal(charged.calculationValid, false)
  assert.equal(charged.lines[6].length, 0)
})

test("unsupported schemes and treatments fail closed without hiding source exceptions", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("reverse", "reverse_charge", "100.0000", "20.0000"),
    evidence("outside", "outside_scope", "100.0000", "0"),
    evidence("other-entity", "domestic_sale", "100.0000", "20.0000", { legalEntityId: "entity-b" }),
  ] })
  assert.equal(result.calculationValid, false)
  assert.equal(result.boxes[1], "0.00")
  assert.equal(result.exceptions.length, 3)
  const cashResult = calculateUkVatNineBoxes({ ...period, scheme: "cash", evidence: [evidence("sale", "domestic_sale", "100", "20")] })
  assert.equal(cashResult.calculationValid, false)
  assert.equal(cashResult.boxes[1], "0.00")
  assert.equal(cashResult.exceptions.length, 1)
})

test("duplicate evidence, invalid dates and missing provenance cannot reach review", () => {
  const result = calculateUkVatNineBoxes({ ...period, evidence: [
    evidence("same", "domestic_sale", "10", "2"),
    evidence("same", "domestic_sale", "10", "2"),
    evidence("missing", "domestic_sale", "10", "2", { reviewedRuleId: "" }),
    evidence("bad-date", "domestic_sale", "10", "2", { taxPoint: "2026-09-31" }),
  ] })
  assert.equal(result.calculationValid, false)
  assert.equal(result.boxes[1], "2.00")
  assert.equal(result.exceptions.length, 3)
})
