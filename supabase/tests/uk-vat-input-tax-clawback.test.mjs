import assert from "node:assert/strict"
import test from "node:test"
import { calculateUkInputTaxClawback, calculateUkInputTaxFirstPeriod } from "../functions/_shared/uk-vat-input-tax-clawback.mts"

const invoice = {
  taxPoint: "2026-01-31", paymentDueDate: "2026-02-28", periodEnd: "2026-09-30",
  originalGross: "1200.00", paidByPeriodEnd: "500.00",
  originallyDeductedVatGbp: "200.00", previouslyRepaidVatGbp: "0.00",
}

test("unpaid input VAT uses the HMRC proportional example and later payment restores it", () => {
  assert.deepEqual(calculateUkInputTaxClawback(invoice), {
    firstRequiredDate: "2026-08-28", unpaidAtPeriodEnd: "700.0000",
    targetClawbackGbp: "116.66", previouslyRepaidVatGbp: "0.00",
    box4DeltaGbp: "-116.66", action: "repay",
  })
  assert.equal(calculateUkInputTaxClawback({ ...invoice,
    originallyDeductedVatGbp: "100.00" }).targetClawbackGbp, "58.33")
  assert.deepEqual(calculateUkInputTaxClawback({ ...invoice,
    paidByPeriodEnd: "900.00", previouslyRepaidVatGbp: "116.66" }), {
    firstRequiredDate: "2026-08-28", unpaidAtPeriodEnd: "300.0000",
    targetClawbackGbp: "50.00", previouslyRepaidVatGbp: "116.66",
    box4DeltaGbp: "66.66", action: "restore",
  })
  assert.equal(calculateUkInputTaxClawback({ ...invoice,
    paidByPeriodEnd: "1200.00", previouslyRepaidVatGbp: "116.66" }).box4DeltaGbp, "116.66")
})

test("six-month date is based on the later tax point or payment due date", () => {
  const notDue = calculateUkInputTaxClawback({ ...invoice, periodEnd: "2026-08-27" })
  assert.equal(notDue.action, "not_due")
  assert.equal(notDue.box4DeltaGbp, "0.00")
  assert.equal(calculateUkInputTaxClawback({ ...invoice,
    taxPoint: "2026-08-31", paymentDueDate: null, periodEnd: "2027-02-28" }).firstRequiredDate,
  "2027-02-28")
  assert.equal(calculateUkInputTaxClawback({ ...invoice,
    taxPoint: "2026-03-15", paymentDueDate: "2026-02-28", periodEnd: "2026-09-30" }).firstRequiredDate,
  "2026-09-15")
})

test("source amounts and prior repayments must be complete and coherent", () => {
  for (const changed of [
    { originalGross: "0.00" }, { paidByPeriodEnd: "1200.01" },
    { paidByPeriodEnd: "-1.00" }, { originallyDeductedVatGbp: "2.00001" },
    { previouslyRepaidVatGbp: "200.01" }, { previouslyRepaidVatGbp: "1.0001" },
    { taxPoint: "2026-02-30" }, { periodEnd: "not-a-date" },
  ]) assert.throws(() => calculateUkInputTaxClawback({ ...invoice, ...changed }))
  assert.throws(() => calculateUkInputTaxClawback({ ...invoice,
    periodEnd: "2026-07-31", previouslyRepaidVatGbp: "1.00" }), /before the six-month date/)
})

test("first-period repayment and later same-period payment remain separate entries", () => {
  const firstPeriod = {
    taxPoint: "2026-01-31", paymentDueDate: "2026-01-31",
    periodStart: "2026-07-01", periodEnd: "2026-09-30",
    originalGross: "120.00", paidByFirstDate: "30.00",
    paidByPeriodEnd: "50.00", originallyDeductedVatGbp: "20.00",
  }
  assert.deepEqual(calculateUkInputTaxFirstPeriod(firstPeriod), {
    firstRequiredDate: "2026-07-31", unpaidAtFirstDate: "90.0000",
    unpaidAtPeriodEnd: "70.0000", initialRepaymentGbp: "15.00",
    samePeriodRestorationGbp: "3.34", box4DeltaGbp: "-11.66",
  })
  assert.deepEqual(calculateUkInputTaxFirstPeriod({ ...firstPeriod, paidByPeriodEnd: "120.00" }), {
    firstRequiredDate: "2026-07-31", unpaidAtFirstDate: "90.0000",
    unpaidAtPeriodEnd: "0.0000", initialRepaymentGbp: "15.00",
    samePeriodRestorationGbp: "15.00", box4DeltaGbp: "0.00",
  })
  assert.throws(() => calculateUkInputTaxFirstPeriod({ ...firstPeriod, paidByPeriodEnd: "29.99" }), /cannot decrease/)
  assert.throws(() => calculateUkInputTaxFirstPeriod({ ...firstPeriod, periodStart: "2026-08-01" }), /outside the first repayment period/)
})
