import assert from "node:assert/strict"
import test from "node:test"
import { exactGbp, validGbpApplicationAmount } from "../src/lib/uk-vat-credit-amount.mts"

test("credit applications compare four-decimal GBP amounts without floating-point loss", () => {
  assert.equal(validGbpApplicationAmount("0.0001", "0.0001"), true)
  assert.equal(validGbpApplicationAmount("0.0002", "0.0001"), false)
  assert.equal(validGbpApplicationAmount("90000000000000.0001", "90000000000000.0001"), true)
  assert.equal(validGbpApplicationAmount("90000000000000.0002", "90000000000000.0001"), false)
  assert.equal(validGbpApplicationAmount("0", "1"), false)
  assert.equal(validGbpApplicationAmount("1.00001", "2"), false)
  const format = new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", minimumFractionDigits: 4, maximumFractionDigits: 4,
  })
  assert.equal(exactGbp("90000000000000.0001", format), "£90,000,000,000,000.0001")
})
