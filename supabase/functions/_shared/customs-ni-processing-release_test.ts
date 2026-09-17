import assert from "node:assert/strict";
import { niProcessingReleaseEstimate, type NiProcessingReleaseReview } from "./customs-ni-processing-release.mts";
import type { CalculationItem } from "./customs-duty-calculation.mts";

const reference = { source: "https://www.trade-tariff.service.gov.uk/", reference: "synthetic-test", validFrom: "2026-09-15", validTo: "2026-09-15", retrievedAt: "2026-09-15T12:00:00Z", provenance: "official-snapshot" as const };
const item: CalculationItem = { id: "product", invoiceId: "invoice", goodsValue: "2500", currency: "GBP", grossMass: "10", valuationMethod: "1", families: ["ni"], vatRate: "20", vatReference: reference, measures: [{ ...reference, taxType: "A00", family: "ni", jurisdiction: "EU", evidence: ["Synthetic eligibility test only"], components: [{ type: "percent", rate: "3.2" }], disposition: "payable", includedInVatBase: true }] };
const context = { direction: "import", jurisdiction: "NI", procedure: "4051", date: "2026-09-15", category: "H1", declarationType: "A", preference: "100", additionalProcedures: ["000"], niTariff: "EU", riskStatus: "at-risk" };
const review: NiProcessingReleaseReview = { basis: "processed-products", entryDate: "2026-09-01", entryReference: "Synthetic original entry", authorisationEvidence: "Synthetic permitted basis", dischargeEvidence: "Synthetic product identity and yield", processedValuationEvidence: "Synthetic processed-product value", originalBasisExclusionEvidence: "Synthetic original policy review", releaseRiskEvidence: "Synthetic release risk review", noPriorTaxPaymentConfirmed: true, noEquivalenceOrCombinedReliefConfirmed: true };
Deno.test("processed-products adapter preserves product values and tariff formulas without certifying them", () => {
  const before = structuredClone(item), result = niProcessingReleaseEstimate(item, context, review);
  assert.deepEqual(result.issues, []);
  assert.equal(result.item?.goodsValue, "2500");
  assert.deepEqual(result.item?.measures[0].components, item.measures[0].components);
  assert.ok(result.item?.families.includes("special-procedure"));
  assert.match(result.item?.procedureEvidence ?? "", /original-basis exclusion/);
  assert.deepEqual(item, before);
});
Deno.test("original-basis, missing evidence and different release routes cannot reuse this adapter", () => {
  for (const patch of [{ jurisdiction: "GB" }, { procedure: "4054" }, { additionalProcedures: ["F44"] }, { riskStatus: "not-at-risk" }, { declarationType: "Z" }]) assert.equal(niProcessingReleaseEstimate(item, { ...context, ...patch }, review).item, undefined);
  for (const patch of [{ originalBasisExclusionEvidence: "" }, { noPriorTaxPaymentConfirmed: false }, { noEquivalenceOrCombinedReliefConfirmed: false }, { entryDate: "2026-09-16" }]) assert.equal(niProcessingReleaseEstimate(item, context, { ...review, ...patch }).item, undefined);
  assert.equal(niProcessingReleaseEstimate(item, context).item, undefined);
  assert.equal(niProcessingReleaseEstimate({ ...item, vatReference: { ...reference, provenance: "operator" } }, context, review).item, undefined);
});

Deno.test("malformed persisted processing reviews fail closed without throwing or accepting truthy confirmations", () => {
  // Saved JSON is not protected by the TypeScript shape. Exercise the runtime
  // boundary with values that can arrive from old drafts or an API caller.
  const malformed: unknown[] = [null, false, "approved", [], {},
    { ...review, entryDate: ["2026-09-01"] },
    { ...review, entryDate: "2026-02-30" },
    { ...review, entryReference: { value: "entry" } },
    { ...review, authorisationEvidence: " \n\t" },
    { ...review, noPriorTaxPaymentConfirmed: "true" },
    { ...review, noEquivalenceOrCombinedReliefConfirmed: 1 },
  ];
  for (const value of malformed) {
    const before = structuredClone({ item, context, value });
    const result = niProcessingReleaseEstimate(item, context, value as NiProcessingReleaseReview);
    assert.equal(result.item, undefined);
    assert.ok(result.issues.length > 0);
    assert.deepEqual({ item, context, value }, before);
  }
});
