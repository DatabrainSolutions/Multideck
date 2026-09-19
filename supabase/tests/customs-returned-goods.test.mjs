import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const { buildSync } = require("esbuild")
function load(file) {
  const code = buildSync({ entryPoints: [new URL(`../functions/_shared/${file}`, import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
  const module = { exports: {} }; new Function("module", "exports", code)(module, module.exports); return module.exports
}
const { returnedGoodsEstimate } = load("customs-returned-goods.mts")
const { calculateDuty } = load("customs-duty-calculation.mts")
const { calculationFromDraft } = load("customs-calculation-draft.mts")
const { parseTariffSnapshot } = load("customs-tariff-reference.mts")
const date = "2026-09-15", retrievedAt = date + "T12:00:00Z"
const review = () => ({
  exportDate: "2025-09-15", exportReference: "Synthetic export", exportItemReference: "1", exportTerritory: "GB",
  exporterEori: "GB-SYNTHETIC-IMPORTER", goodsIdentityEvidence: "Fixture returned items and serial numbers",
  freeCirculationEvidence: "Fixture UK domestic status", unchangedGoodsEvidence: "Fixture condition review",
  valuationEvidence: "Fixture evidenced reimport value", repaymentEvidence: "Fixture no outstanding refunds",
  ordinaryGoodsConfirmed: true, noProcessingConfirmed: true, vatEligibilityEvidence: "Fixture same entity, no sale or unpaid VAT refund",
})
const context = (code = "F01") => ({ direction: "import", jurisdiction: "GB", date, retrievedAt, procedure: "6110", additionalProcedures: [code], preference: "100", importerEori: "GB-SYNTHETIC-IMPORTER" })
const ref = { source: "https://www.trade-tariff.service.gov.uk/", validFrom: date, validTo: date, retrievedAt, reference: "synthetic-test-only", provenance: "official-snapshot" }
const item = () => ({ id: "item", invoiceId: "invoice", currency: "GBP", goodsValue: "1000", grossMass: "10", valuationMethod: "1", families: ["special-procedure"], measures: [{ ...ref, taxType: "A00", family: "gb-standard", jurisdiction: "UK", evidence: ["Synthetic 12% test measure, not a real rate"], components: [{ type: "percent", rate: "12" }], includedInVatBase: true, disposition: "payable" }], vatRate: "20", vatReference: ref })
function calculate(adapted) { return calculateDuty({ date, jurisdiction: "GB", movement: "rest-of-world-to-GB", rates: [], costs: [], items: [adapted] }) }

test("F01 and F05 retain relieved duty without adding it to payable VAT", () => {
  for (const code of ["F01", "F05"]) {
    const original = item(), evidence = review(), before = structuredClone(original)
    const adapted = returnedGoodsEstimate(original, context(code), evidence)
    assert.deepEqual(adapted.issues, [])
    assert.deepEqual(original, before)
    const result = calculate(adapted.item)
    assert.deepEqual(result.totals, { duty: "0.00", vat: code === "F01" ? "200.00" : "0.00" })
    assert.equal(result.lines[0].taxes[0].amount, "120.00")
    assert.equal(result.lines[0].taxes[0].disposition, "relieved")
    assert.equal(result.lines[0].vatBase, "1000.00")
    if (code === "F05") assert.equal(result.lines[0].vatLiability.disposition, "relieved")
    assert.equal(result.autoPopulationAllowed, false)
  }
})

test("specific and compound duty formulas survive returned-goods relief", () => {
  const goods = item()
  goods.measures[0].family = "specific-compound"
  goods.measures[0].components = [{ type: "percent", rate: "12" }, { type: "specific", rate: "2", currency: "GBP", quantity: "10", unit: "KGM", per: "1", quantityUnit: "KGM", quantityEvidence: "Synthetic net mass" }]
  const adapted = returnedGoodsEstimate(goods, context(), review())
  assert.deepEqual(adapted.issues, [])
  assert.equal(calculate(adapted.item).lines[0].taxes[0].amount, "140.00")
})

test("evidence gaps and different treatments cannot silently obtain relief", () => {
  for (const mutate of [
    (i,c,r) => { c.jurisdiction = "NI" }, (i,c,r) => { c.direction = "export" },
    (i,c,r) => { c.procedure = "6111" }, (i,c,r) => { c.additionalProcedures = ["F01", "F05"] },
    (i,c,r) => { c.additionalProcedures = ["F01", "000"] }, (i,c,r) => { c.preference = "300" },
    (i,c,r) => { i.measures[0].provenance = "operator" }, (i,c,r) => { i.measures[0].taxType = "A30" },
    (i,c,r) => { r.exportTerritory = "" }, (i,c,r) => { r.exportDate = "2027-01-01" },
    (i,c,r) => { r.exportDate = "2025-02-29" }, (i,c,r) => { r.exportDate = "2023-09-14" },
    (i,c,r) => { r.ordinaryGoodsConfirmed = false }, (i,c,r) => { r.noProcessingConfirmed = false },
    ...["exportReference", "exportItemReference", "goodsIdentityEvidence", "freeCirculationEvidence", "unchangedGoodsEvidence", "valuationEvidence", "repaymentEvidence"].map(key => (i,c,r) => { r[key] = "" }),
  ]) {
    const i = item(), c = context(), r = review(); mutate(i,c,r)
    const result = returnedGoodsEstimate(i,c,r)
    assert.equal(result.item, undefined)
    assert.ok(result.issues.length)
  }
  for (const importer of ["", "XI-SYNTHETIC-IMPORTER", "GB-DIFFERENT"]) {
    assert.equal(returnedGoodsEstimate(item(), { ...context("F05"), importerEori: importer }, review()).item, undefined)
  }
  assert.equal(returnedGoodsEstimate(item(), context("F05"), { ...review(), vatEligibilityEvidence: "" }).item, undefined)
  assert.ok(returnedGoodsEstimate(item(), context(), { ...review(), exporterEori: "", vatEligibilityEvidence: "" }).item, "F01 must not demand VAT relief evidence")
})

test("three-year boundary and evidenced waiver are explicit", () => {
  assert.ok(returnedGoodsEstimate(item(), context(), { ...review(), exportDate: "2023-09-15" }).item)
  assert.ok(returnedGoodsEstimate(item(), context(), { ...review(), exportDate: "2023-09-14", timeLimitWaiverEvidence: "Synthetic HMRC waiver" }).item)
  assert.equal(returnedGoodsEstimate(item(), context(), { ...review(), exportDate: "2023-09-14", timeLimitWaiverEvidence: " " }).item, undefined)
})

test("saved draft applies relief to real retained measures and keeps original tax fields", () => {
  const raw = JSON.parse(readFileSync(new URL("fixtures/customs-ironing-board-fr-20260915.json", import.meta.url), "utf8"))
  const snapshot = parseTariffSnapshot(raw, { code: "7323930010", origin: "FR", date, dataset: "uk" }, retrievedAt)
  const draft = { direction: "import", customsConversionDate: date, importerEori: "GB-SYNTHETIC-IMPORTER", invoiceHeaders: [{ id: "invoice", currency: "GBP" }],
    items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "6110", additionalProcedureCode: "F01", preferenceCode: "100", nonPreferentialOrigin: "FR", commodityCode: "7323930010", taxAmount: "999" }],
    dutyCalculationSetup: { jurisdiction: "GB", returnedGoods: { item: review() } } }
  for (const code of ["F01", "F05"]) {
    draft.items[0].additionalProcedureCode = code
    const before = structuredClone(draft)
    const run = calculationFromDraft(draft, [], retrievedAt, { item: snapshot })
    assert.deepEqual(run.result.totals, { duty: "0.00", vat: code === "F01" ? "200.00" : "0.00" }, JSON.stringify(run.result))
    assert.equal(run.result.lines[0].taxes[0].disposition, "relieved")
    assert.deepEqual(draft, before)
    assert.equal(run.result.autoPopulationAllowed, false)
  }
  draft.dutyCalculationSetup.returnedGoods.item.goodsIdentityEvidence = ""
  assert.equal(calculationFromDraft(draft, [], retrievedAt, { item: snapshot }).result.totals, null)
})

