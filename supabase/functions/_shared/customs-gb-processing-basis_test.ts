import assert from "node:assert/strict"
import { reviewGbProcessingBasis, gbProcessedReleaseEstimate, type GbProcessingBasisReview } from "./customs-gb-processing-basis.mts"
import type { CalculationItem } from "./customs-duty-calculation.mts"
const policy = { exceptedGoods: false, additionalDuty: false, nonTariffOrAgriculturalMeasure: false, guaranteeRequired: false }
const input: GbProcessingBasisReview = { date: "2026-09-15", jurisdiction: "GB", originalBasisElected: false, regulation22Breach: false, holderReimportWithinOneYear: false, economicExaminationRequired: false, entryPolicy: policy, authorisationPolicy: policy, paragraph6Exception: false, sensitiveGoods: false, calendarYearClassificationValueGbp: "0", evidence: "Synthetic rule decision fixture, not an authorisation" }
Deno.test("GB original-basis triggers preserve election, breach and reimport despite paragraph 4 exceptions", () => {
  for (const change of [{ originalBasisElected: true }, { regulation22Breach: true }, { holderReimportWithinOneYear: true, entryPolicy: { ...policy, exceptedGoods: true } }]) {
    const result = reviewGbProcessingBasis({ ...input, paragraph6Exception: true, ...change })
    assert.equal(result.basis, "original-goods-required")
    assert.equal(result.autoPopulationAllowed, false)
  }
})
Deno.test("GB July excepted goods and exact annual thresholds are not invoice eligibility", () => {
  assert.equal(reviewGbProcessingBasis({ ...input, authorisationPolicy: { ...policy, exceptedGoods: true } }).basis, "original-goods-required")
  const reviewed = { ...input, authorisationPolicy: { ...policy, nonTariffOrAgriculturalMeasure: true } }
  assert.equal(reviewGbProcessingBasis({ ...reviewed, calendarYearClassificationValueGbp: "270000" }).basis, "no-original-goods-trigger-established")
  assert.equal(reviewGbProcessingBasis({ ...reviewed, calendarYearClassificationValueGbp: "270000.01" }).basis, "original-goods-required")
  assert.equal(reviewGbProcessingBasis({ ...reviewed, sensitiveGoods: true, calendarYearClassificationValueGbp: "135000.01" }).basis, "original-goods-required")
})
Deno.test("missing review, historic rules and NI cannot obtain a GB basis decision", () => {
  for (const change of [{ date: "2026-06-30" }, { jurisdiction: "NI" }, { evidence: "" }, { originalBasisElected: "true" }, { calendarYearClassificationValueGbp: "-1" }]) assert.equal(reviewGbProcessingBasis({ ...input, ...change } as GbProcessingBasisReview).basis, null)
  const result = reviewGbProcessingBasis(input)
  assert.equal(reviewGbProcessingBasis({ ...input, originalBasisElected: undefined }).basis, null)
  assert.equal(reviewGbProcessingBasis({ ...input, entryPolicy: {} }).basis, null)
  assert.ok("input" in result)
  assert.deepEqual(result.input, input)
  assert.notEqual(result.input, input)
})

Deno.test("GB processed release requires both a negative original-basis decision and complete discharge evidence", () => {
  const reference = { source: "https://www.trade-tariff.service.gov.uk/", reference: "synthetic", validFrom: input.date, validTo: input.date, retrievedAt: `${input.date}T12:00:00Z`, provenance: "official-snapshot" as const }
  const item: CalculationItem = { id: "item", invoiceId: "invoice", goodsValue: "1000", currency: "GBP", grossMass: "10", valuationMethod: "1", families: [], vatRate: "20", vatReference: reference, measures: [{ ...reference, taxType: "A00", jurisdiction: "UK", family: "gb-standard", evidence: ["Synthetic test only"], components: [{ type: "percent", rate: "12" }], includedInVatBase: true, disposition: "payable" }] }
  const context = { direction: "import", jurisdiction: "GB", procedure: "4051", date: input.date, category: "H1", declarationType: "A", preference: "100", additionalProcedures: ["000"] }
  const review: GbProcessingBasisReview = { ...input, processedRelease: { entryDate: "2026-09-01", entryReference: "Synthetic entry", authorisationEvidence: "Synthetic permitted product basis", dischargeEvidence: "Synthetic quantity and yield review", valuationEvidence: "Synthetic transaction value", noPriorTaxPaymentConfirmed: true, noEquivalenceOrCombinedReliefConfirmed: true } }
  const before = structuredClone({ item, review }), accepted = gbProcessedReleaseEstimate(item, context, review)
  assert.deepEqual(accepted.issues, [])
  assert.equal(accepted.item?.goodsValue, "1000")
  assert.match(accepted.item?.procedureEvidence ?? "", /processed-products release/)
  assert.deepEqual({ item, review }, before)
  for (const patch of [{ jurisdiction: "NI" }, { procedure: "4054" }, { additionalProcedures: ["F44"] }, { preference: "300" }, { declarationType: "Z" }]) assert.equal(gbProcessedReleaseEstimate(item, { ...context, ...patch }, review).item, undefined)
  for (const patch of [{ originalBasisElected: true }, { date: "2026-09-14" }, { processedRelease: undefined }, { entryPolicy: {} }]) assert.equal(gbProcessedReleaseEstimate(item, context, { ...review, ...patch }).item, undefined)
  for (const patch of [{ entryDate: "2026-09-16" }, { authorisationEvidence: "" }, { noPriorTaxPaymentConfirmed: false }, { noEquivalenceOrCombinedReliefConfirmed: false }]) assert.equal(gbProcessedReleaseEstimate(item, context, { ...review, processedRelease: { ...review.processedRelease!, ...patch } }).item, undefined)
})
