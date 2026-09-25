import assert from "node:assert/strict"
import test from "node:test"
import { calculateUkCashExitOutstanding } from "../functions/_shared/uk-vat-cash-allocation.mts"

const sale = {
  invoiceId: "sale-1", side: "sale", invoiceGrossGbp: "120.0000",
  paidThroughExitGbp: "60.0000",
  lines: [{ lineId: "line-1", treatment: "domestic_sale",
    reviewedRuleId: "UK20", netGbp: "100.0000", vatGbp: "20.0000" }],
}

test("immediate Cash exit computes only the outstanding invoice fraction", () => {
  const result = calculateUkCashExitOutstanding(sale)
  assert.equal(result.status, "calculation_only_no_cash_event")
  assert.equal(result.outstandingGrossGbp, "60.0000")
  assert.equal(result.apportionmentRemainderGbp, "0.0000")
  assert.deepEqual(result.sourceBoxesGbp, {
    1: "10.0000", 4: "0.0000", 6: "50.0000", 7: "0.0000",
  })
  assert.deepEqual(result.lines.map(({ netGbp, vatGbp }) => [netGbp, vatGbp]),
    [["50.0000", "10.0000"]])
  const settled = calculateUkCashExitOutstanding({ ...sale, paidThroughExitGbp: "120.0000" })
  assert.equal(settled.outstandingGrossGbp, "0.0000")
  assert.equal(settled.sourceBoxesGbp[1], "0.0000")
})

test("Cash exit preserves cumulative four-decimal remainders and purchase recoverability", () => {
  const result = calculateUkCashExitOutstanding({
    invoiceId: "purchase-1", side: "purchase", invoiceGrossGbp: "120.0001",
    paidThroughExitGbp: "40.0000", lines: [
      { lineId: "recoverable", treatment: "domestic_purchase", reviewedRuleId: "UK20",
        netGbp: "100.0000", vatGbp: "20.0000" },
      { lineId: "nonrecoverable", treatment: "nonrecoverable_purchase", reviewedRuleId: "UK20-N",
        netGbp: "0.0001", vatGbp: "0.0000" },
    ],
  })
  assert.equal(result.outstandingGrossGbp, "80.0001")
  assert.equal(result.apportionmentRemainderGbp, "-0.0001")
  assert.equal(result.sourceBoxesGbp[1], "0.0000")
  assert.equal(result.sourceBoxesGbp[4], "13.3334")
  assert.equal(result.sourceBoxesGbp[7], "66.6668")
})

test("Cash exit refuses an unsupported or inconsistent source", () => {
  assert.throws(() => calculateUkCashExitOutstanding({ ...sale, paidThroughExitGbp: "120.0001" }), /balance is invalid/)
  assert.throws(() => calculateUkCashExitOutstanding({ ...sale, invoiceGrossGbp: "119.0000" }), /do not add/)
  assert.throws(() => calculateUkCashExitOutstanding({ ...sale, lines: [...sale.lines, sale.lines[0]] }), /distinct lines/)
  assert.throws(() => calculateUkCashExitOutstanding({ ...sale, side: "purchase" }), /correct side/)
  assert.throws(() => calculateUkCashExitOutstanding({ ...sale, lines: [{ ...sale.lines[0], reviewedRuleId: "" }] }), /reviewed treatment/)
})
