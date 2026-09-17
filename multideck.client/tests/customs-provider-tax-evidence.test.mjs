import assert from "node:assert/strict"
import test from "node:test"
import { buildSync } from "esbuild"

const code = buildSync({ entryPoints: [new URL("../../supabase/functions/_shared/customs-provider-tax-evidence.mts", import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
const module = { exports: {} }
new Function("module", "exports", code)(module, module.exports)
const { extractProviderTaxEvidence } = module.exports
const submitted = { schemaVersion: 1, items: [{ itemNumber: 1, payload: { id: "submitted-one" } }, { itemNumber: 2, payload: { id: "submitted-two" } }] }
function fixture() {
  return { notification: [{ notification_id: "synthetic-notice", status_name_code: "Indicative Customs Debt", hmrc_response: { Response: { FunctionCode: "13", Status: { NameCode: "67" }, Declaration: { GoodsShipment: { GovernmentAgencyGoodsItem: { SequenceNumeric: "2", Commodity: { DutyTaxFee: [
    { TypeCode: "A00", AdValoremTaxBaseAmount: "1500.00", TaxRateNumeric: "12", Payment: { TaxAssessedAmount: "180.00", PaymentAmount: "0.00" } },
    { TypeCode: "B00", AdValoremTaxBaseAmount: "2080.00", TaxRateNumeric: "20", Payment: { TaxAssessedAmount: "416.00", PaymentAmount: "0.00" } },
  ] } } } } } } }] }
}

test("DMSTAX preserves assessed and payable amounts separately and never implies finality", () => {
  const payload = fixture(), before = JSON.stringify(payload)
  const result = extractProviderTaxEvidence(payload, submitted)
  assert.equal(result.reconciliationReady, false)
  assert.equal(result.notices[0].classification, "indicative")
  assert.deepEqual(result.notices[0].facts.map(row => [row.itemId, row.assessedAmount, row.paymentAmount, row.currency]), [["submitted-two", "180.00", "0.00", null], ["submitted-two", "416.00", "0.00", null]])
  assert.equal(JSON.stringify(payload), before)
})

test("acceptance and successful provider acknowledgements are not tax evidence", () => {
  const payload = fixture(); payload.notification[0].hmrc_response.Response.FunctionCode = "01"
  assert.deepEqual(extractProviderTaxEvidence(payload, submitted).notices, [])
  assert.deepEqual(extractProviderTaxEvidence({ success: true, message: "Accepted" }, submitted).notices, [])
})

test("HMRC notice codes distinguish indicative, provisional and final without declaring reconciliation", () => {
  for (const [status, expected] of [["67", "indicative"], ["115", "provisional"], ["4", "final"], ["unknown", "unclassified"]]) {
    const payload = fixture()
    payload.notification[0].hmrc_response.Response.Status.NameCode = status
    payload.notification[0].status_name_code = "Unreliable provider label"
    const result = extractProviderTaxEvidence(payload, submitted)
    assert.equal(result.notices[0].classification, expected)
    assert.equal(result.reconciliationReady, false)
  }
  const payload = fixture()
  payload.notification[0].hmrc_response.Response.Status = [{ NameCode: "4" }, { NameCode: "115" }]
  assert.equal(extractProviderTaxEvidence(payload, submitted).notices[0].classification, "unclassified")
})

test("HMRC security and subsidy rows preserve absent payment separately from zero", () => {
  // CDS 03 DSSD v2.32, DMSTAX: securities and STA can omit PaymentAmount.
  // Its absence is not evidence of zero liability or sufficient classification.
  const payload = fixture(), response = payload.notification[0].hmrc_response.Response
  response.Status.NameCode = "4"
  payload.notification[0].status_name_code = "Final Customs Debt"
  response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem.Commodity.DutyTaxFee = [
    { TypeCode: "B00", Payment: { TaxAssessedAmount: "100.00", PaymentAmount: "0.00" } },
    { TypeCode: "MDC", Payment: { TaxAssessedAmount: "222.75" } },
    { TypeCode: "STA", Payment: { TaxAssessedAmount: "50.00" } },
  ]
  const result = extractProviderTaxEvidence(payload, submitted)
  assert.deepEqual(result.notices[0].facts.map(row => [row.taxType, row.assessedAmount, row.paymentAmount]), [
    ["B00", "100.00", "0.00"], ["MDC", "222.75", null], ["STA", "50.00", null],
  ])
  assert.equal(result.notices[0].statusCode, "4")
  // Final status cannot bypass missing currency/disposition/completeness checks.
  assert.equal(result.reconciliationReady, false)
})

test("missing assessment never falls back to a payable amount or invented zero", () => {
  const payload = fixture(), tax = payload.notification[0].hmrc_response.Response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem.Commodity.DutyTaxFee[0]
  delete tax.Payment.TaxAssessedAmount
  tax.Payment.PaymentAmount = "180.00"
  const result = extractProviderTaxEvidence(payload, submitted)
  assert.equal(result.notices[0].facts[0].assessedAmount, null)
  assert.match(result.notices[0].issues.join(" "), /assessed amount/)
})

test("sequence links require the submitted snapshot and malformed numbers stay missing", () => {
  const payload = fixture(), goods = payload.notification[0].hmrc_response.Response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem
  goods.Commodity.DutyTaxFee[0].Payment.TaxAssessedAmount = 180
  const result = extractProviderTaxEvidence(payload, {})
  assert.equal(result.notices[0].facts[0].itemId, null)
  assert.equal(result.notices[0].facts[0].assessedAmount, null)
  assert.match(result.notices[0].issues.join(" "), /submitted/)
})

test("duplicate sequences and unknown finality cannot become reconciled", () => {
  const payload = fixture(), response = payload.notification[0].hmrc_response.Response
  response.Status.NameCode = "unknown"
  response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem = [response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem, response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem]
  const result = extractProviderTaxEvidence(payload, submitted)
  assert.equal(result.notices[0].classification, "unclassified")
  assert.match(result.notices[0].issues.join(" "), /repeated item sequence/)
  assert.ok(result.notices[0].facts.every(row => row.itemId === null))
  assert.equal(result.reconciliationReady, false)
})

test("a nested response cannot bypass the global review limit or return a partial assessment", () => {
  const payload = fixture(), notice = payload.notification[0]
  const goods = notice.hmrc_response.Response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem
  const tax = goods.Commodity.DutyTaxFee[0]
  goods.Commodity.DutyTaxFee = Array.from({ length: 500 }, () => tax)
  notice.hmrc_response.Response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem = Array.from({ length: 21 }, (_, index) => ({ ...goods, SequenceNumeric: String(index + 1) }))
  const result = extractProviderTaxEvidence(payload, { items: Array.from({ length: 21 }, (_, index) => ({ id: `item-${index}` })) })
  assert.deepEqual(result.notices, [])
  assert.match(result.issues.join(" "), /total tax-row review limit/)
  assert.equal(result.reconciliationReady, false)
})

test("oversized submitted snapshots fail closed before sequence mapping", () => {
  const result = extractProviderTaxEvidence(fixture(), { items: Array.from({ length: 1001 }, (_, index) => ({ id: `item-${index}` })) })
  assert.deepEqual(result.notices, [])
  assert.match(result.issues.join(" "), /snapshot exceeds the item review limit/)
})

test("links by the immutable submission number rather than array position", () => {
  const snapshot = { ...submitted, items: [...submitted.items].reverse() }
  assert.equal(extractProviderTaxEvidence(fixture(), snapshot).notices[0].facts[0].itemId, "submitted-two")
})

test("rejects editable drafts, unknown snapshot versions and ambiguous submitted identities", () => {
  for (const snapshot of [
    { items: [{ id: "current-one" }, { id: "current-two" }] },
    { ...submitted, schemaVersion: 2 },
    { ...submitted, items: [submitted.items[0], { ...submitted.items[1], itemNumber: 1 }] },
    { ...submitted, items: [submitted.items[0], { itemNumber: 2, payload: { id: "submitted-one" } }] },
  ]) {
    const result = extractProviderTaxEvidence(fixture(), snapshot)
    assert.ok(result.notices[0].facts.every(row => row.itemId === null))
    assert.equal(result.reconciliationReady, false)
  }
})

test("retains duty regime and rate; malformed codes are not usable regime evidence", () => {
  const payload = fixture(), tax = payload.notification[0].hmrc_response.Response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem.Commodity.DutyTaxFee[0]
  tax.DutyRegimeCode = "320"
  let result = extractProviderTaxEvidence(payload, submitted)
  assert.equal(result.notices[0].facts[0].dutyRegime, "320")
  assert.equal(result.notices[0].facts[0].rate, "12")
  tax.DutyRegimeCode = "invalid"
  result = extractProviderTaxEvidence(payload, submitted)
  assert.equal(result.notices[0].facts[0].dutyRegime, null)
  assert.match(result.notices[0].issues.join(" "), /invalid duty regime/)
})

test("HMRC partial-quota example retains derived items without inventing submission links", () => {
  // HMRC CDS 03 DSSD v2.32, Processing of Partial Quota Allocations.
  // Published example: three submitted items become five response items.
  // The source expressly says software cannot associate the derived rows.
  const source = { schemaVersion: 1, items: [1, 2, 3].map(itemNumber => ({ itemNumber, payload: { id: `original-${itemNumber}` } })) }
  const amounts = [
    ['320', '280.00', '5.80', '16.24', '296.24', '59.24'],
    ['100', '1000.00', '0.00', '0.00', '1000.00', '200.00'],
    ['320', '120.00', '5.80', '6.96', '126.96', '25.39'],
    ['100', '1120.00', '14.00', '156.80', '1276.80', '255.36'],
    ['100', '480.00', '14.00', '67.20', '547.20', '109.44'],
  ]
  const payload = fixture()
  payload.notification[0].hmrc_response.Response.Declaration.GoodsShipment.GovernmentAgencyGoodsItem = amounts.map(([regime, base, rate, duty, vatBase, vat], index) => ({
    SequenceNumeric: String(index + 1), Commodity: { DutyTaxFee: [
      { TypeCode: 'A00', DutyRegimeCode: regime, AdValoremTaxBaseAmount: base, TaxRateNumeric: rate, Payment: { TaxAssessedAmount: duty, PaymentAmount: duty } },
      { TypeCode: 'B00', DutyRegimeCode: regime, AdValoremTaxBaseAmount: vatBase, TaxRateNumeric: '20.00', Payment: { TaxAssessedAmount: vat, PaymentAmount: vat } },
    ] },
  }))
  const result = extractProviderTaxEvidence(payload, source)
  const facts = result.notices[0].facts
  assert.equal(facts.length, 10)
  assert.deepEqual(facts.map(fact => fact.itemId), ['original-1', 'original-1', 'original-2', 'original-2', 'original-3', 'original-3', null, null, null, null])
  assert.deepEqual(facts.slice(6).map(fact => fact.assessedAmount), ['156.80', '255.36', '67.20', '109.44'])
  assert.equal(result.reconciliationReady, false)
  assert.match(result.notices[0].issues.join(' '), /Tax item 4 cannot be linked/)
  assert.match(result.notices[0].issues.join(' '), /Tax item 5 cannot be linked/)
})
