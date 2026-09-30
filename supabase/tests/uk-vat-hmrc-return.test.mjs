import assert from "node:assert/strict"
import test from "node:test"
import { buildHmrcVatReturnBody, parseHmrcVatReturnReadbackText } from "../functions/_shared/hmrc-vat-return.mts"

const boxes = {
  1: "15.00", 2: "0.00", 3: "15.00", 4: "8.00", 5: "7.00",
  6: "125.00", 7: "50.00", 8: "0.00", 9: "0.00",
}
const input = (overrides = {}) => ({ periodKey: "#001", boxes, declarationConfirmed: true, ...overrides })

test("builds HMRC's eleven-field declaration without changing reviewed amounts", () => {
  const body = buildHmrcVatReturnBody(input())
  assert.deepEqual(JSON.parse(body), {
    periodKey: "#001", vatDueSales: 15, vatDueAcquisitions: 0, totalVatDue: 15,
    vatReclaimedCurrPeriod: 8, netVatDue: 7, totalValueSalesExVAT: 125,
    totalValuePurchasesExVAT: 50, totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0, finalised: true,
  })
  assert.match(body, /"totalValueSalesExVAT":125\.00/)
})

test("rejects an unconfirmed declaration and invalid HMRC period keys", () => {
  assert.throws(() => buildHmrcVatReturnBody(input({ declarationConfirmed: false })), /not been confirmed/)
  for (const periodKey of ["", "ABC", "ABCDE", "##01", "A 01"]) {
    assert.throws(() => buildHmrcVatReturnBody(input({ periodKey })), /period key/)
  }
})

test("blocks fractional whole-pound boxes and never silently rounds them", () => {
  for (const box of [6, 7, 8, 9]) {
    assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, [box]: "125.01" } })), /whole-pound/)
  }
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 6: "125.0049" } })), /two-decimal/)
})

test("checks exact box arithmetic and rejects missing, malformed and out-of-range values", () => {
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 3: "16.00" } })), /Box 3/)
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 5: "-7.00" } })), /Box 5/)
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 5: "8.00" } })), /Box 5/)
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 1: "10000000000000.00" } })), /range/)
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 6: "10000000000000.00" } })), /range/)
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 7: undefined } })), /two-decimal/)
  assert.throws(() => buildHmrcVatReturnBody(input({ boxes: { ...boxes, 7: "1e2" } })), /two-decimal/)
})

test("keeps maximum legal penny amounts exact in the JSON text", () => {
  const large = { ...boxes, 1: "99999999999.99", 3: "99999999999.99", 4: "0.00", 5: "99999999999.99" }
  assert.match(buildHmrcVatReturnBody(input({ boxes: large })), /"netVatDue":99999999999\.99/)
})

test("view-return readback must match the submitted period and every approved box", () => {
  const filed = buildHmrcVatReturnBody(input())
  assert.deepEqual(parseHmrcVatReturnReadbackText(filed, input()).boxes, boxes)
  assert.deepEqual(parseHmrcVatReturnReadbackText(filed.replace(',"finalised":true', ''), input()).boxes, boxes)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace('"#001"', '"A001"'), input()), /submitted period/)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace('"vatDueSales":15.00', '"vatDueSales":15.01'), input()), /Box 1 differs/)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace('"vatDueSales":15.00', '"vatDueSales":15.001'), input()), /more than two/)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace('"totalValueSalesExVAT":125.00', '"totalValueSalesExVAT":125.5'), input()), /Box 6 is invalid/)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace('"vatDueSales":15.00', '"vatDueSales":"15.00"'), input()), /Box 1 is invalid/)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace('"vatDueSales":15.00', '"vatDueSales":15.00,"vatDueSales":15.00'), input()), /duplicate fields/)
  assert.throws(() => parseHmrcVatReturnReadbackText(filed.replace(',"finalised":true', ',"other":1,"finalised":true'), input()), /readback is invalid/)
})

test("large HMRC readback amounts preserve exact pennies", () => {
  const large = { ...boxes, 1: "99999999999.99", 3: "99999999999.99", 4: "0.00", 5: "99999999999.99" }
  const expected = input({ boxes: large })
  const filed = buildHmrcVatReturnBody(expected)
  assert.deepEqual(parseHmrcVatReturnReadbackText(filed, expected).boxes, large)
  assert.throws(() => parseHmrcVatReturnReadbackText(
    filed.replace('"vatDueSales":99999999999.99', '"vatDueSales":99999999999.98'), expected), /Box 1 differs/)
  assert.throws(() => parseHmrcVatReturnReadbackText(
    filed.replace('"vatDueSales":99999999999.99', '"vatDueSales":99999999999.991'), expected), /more than two/)
  const maximum = input({ boxes: { ...boxes,
    1: "9999999999999.99", 2: "-9999999999999.99", 3: "0.00",
    4: "0.00", 5: "0.00" } })
  const maximumBody = buildHmrcVatReturnBody(maximum)
  assert.equal(parseHmrcVatReturnReadbackText(maximumBody, maximum).boxes[1], "9999999999999.99")
  assert.throws(() => parseHmrcVatReturnReadbackText(
    maximumBody.replace('"vatDueSales":9999999999999.99', '"vatDueSales":9999999999999.98'), maximum), /Box 1 differs/)
})
