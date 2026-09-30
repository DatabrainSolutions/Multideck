import assert from "node:assert/strict"
import test from "node:test"
import { calculateUkCashAllocation, allocateUkCashPaymentOldestFirst } from "../functions/_shared/uk-vat-cash-allocation.mts"

const sale = {
  allocationId: "payment-1", invoiceId: "invoice-a", paymentDate: "2026-09-15",
  periodStart: "2026-07-01", periodEnd: "2026-09-30", side: "sale",
  invoiceGrossGbp: "1200.00", paidBeforeGbp: "0.00", paidNowGbp: "780.00",
  lines: [{ lineId: "line-a", treatment: "domestic_sale", reviewedRuleId: "rule-20",
    netGbp: "1000.00", vatGbp: "200.00" }],
}

test("HMRC cash example puts VAT and net value on the part payment", () => {
  const first = calculateUkCashAllocation(sale)
  assert.deepEqual(first.sourceBoxesGbp, {
    1: "130.0000", 4: "0.0000", 6: "650.0000", 7: "0.0000",
  })
  assert.equal(first.allocationRemainderGbp, "0.0000")
  const final = calculateUkCashAllocation({ ...sale, allocationId: "payment-2",
    paidBeforeGbp: "780.00", paidNowGbp: "420.00" })
  assert.deepEqual(final.sourceBoxesGbp, {
    1: "70.0000", 4: "0.0000", 6: "350.0000", 7: "0.0000",
  })
})

test("mixed-rate invoice apportions a later invoice payment by its full gross", () => {
  assert.deepEqual(allocateUkCashPaymentOldestFirst("2730.00", [
    { invoiceId: "invoice-c", issueDate: "2026-08-02", issueSequence: 1, invoiceGrossGbp: "3400.00", paidBeforeGbp: "0.00" },
    { invoiceId: "invoice-b", issueDate: "2026-07-02", issueSequence: 1, invoiceGrossGbp: "1200.00", paidBeforeGbp: "0.00" },
  ]), [
    { invoiceId: "invoice-b", paidBeforeGbp: "0.0000", paidNowGbp: "1200.0000" },
    { invoiceId: "invoice-c", paidBeforeGbp: "0.0000", paidNowGbp: "1530.0000" },
  ])
  const mixed = calculateUkCashAllocation({ ...sale, invoiceId: "invoice-c",
    invoiceGrossGbp: "3400.00", paidNowGbp: "1530.00", lines: [
      { lineId: "standard", treatment: "domestic_sale", reviewedRuleId: "rule-20",
        netGbp: "2000.00", vatGbp: "400.00" },
      { lineId: "zero", treatment: "zero_rated_sale", reviewedRuleId: "rule-zero",
        netGbp: "1000.00", vatGbp: "0.00" },
    ] })
  assert.equal(mixed.sourceBoxesGbp[1], "180.0000")
  assert.equal(mixed.sourceBoxesGbp[6], "1350.0000")
  assert.equal(mixed.allocationRemainderGbp, "0.0000")
})

test("supplier payment gives only recoverable input VAT and cumulative rounding settles exactly", () => {
  const purchase = { ...sale, side: "purchase", paidNowGbp: "10.00",
    invoiceGrossGbp: "120.00", lines: [{ lineId: "buy", treatment: "domestic_purchase",
      reviewedRuleId: "purchase-rule", netGbp: "100.00", vatGbp: "20.00" }] }
  const first = calculateUkCashAllocation(purchase)
  assert.equal(first.sourceBoxesGbp[4], "1.6666")
  assert.equal(first.sourceBoxesGbp[7], "8.3333")
  assert.equal(first.allocationRemainderGbp, "0.0001")
  const final = calculateUkCashAllocation({ ...purchase,
    paidBeforeGbp: "10.00", paidNowGbp: "110.00" })
  assert.equal(final.sourceBoxesGbp[4], "18.3334")
  assert.equal(final.sourceBoxesGbp[7], "91.6667")
  assert.equal(Number(first.sourceBoxesGbp[4]) + Number(final.sourceBoxesGbp[4]), 20)
})

test("cash input rejects unsupported, misdated and incoherent source evidence", () => {
  assert.throws(() => calculateUkCashAllocation({ ...sale, paymentDate: "2026-10-01" }), /dated allocation/)
  assert.throws(() => calculateUkCashAllocation({ ...sale, paidNowGbp: "1200.01" }), /exceeds/)
  assert.throws(() => calculateUkCashAllocation({ ...sale, lines: [{ ...sale.lines[0], netGbp: "999.00" }] }), /do not add/)
  assert.throws(() => calculateUkCashAllocation({ ...sale, lines: [{ ...sale.lines[0], treatment: "reverse_charge" }] }), /reviewed supported rule/)
  assert.throws(() => calculateUkCashAllocation({ ...sale, lines: [{ ...sale.lines[0], treatment: "zero_rated_sale" }] }), /coherent/)
  assert.throws(() => allocateUkCashPaymentOldestFirst("1300.00", [
    { invoiceId: "invoice-a", issueDate: "2026-07-01", issueSequence: 1, invoiceGrossGbp: "1200.00", paidBeforeGbp: "0.00" },
  ]), /exceeds the listed/)
  assert.throws(() => allocateUkCashPaymentOldestFirst("10.00", [
    { invoiceId: "invoice-a", issueDate: "2026-07-01", issueSequence: 1, invoiceGrossGbp: "100.00", paidBeforeGbp: "0.00" },
    { invoiceId: "invoice-b", issueDate: "2026-07-01", issueSequence: 1, invoiceGrossGbp: "100.00", paidBeforeGbp: "0.00" },
  ]), /evidenced issue order/)
})
