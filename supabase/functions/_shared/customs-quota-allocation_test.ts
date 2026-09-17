import assert from "node:assert/strict";
import { quotaAllocationCandidate, reconcileQuotaAllocations, type QuotaAllocationReview } from "./customs-quota-allocation.mts";
import type { TariffSnapshot } from "./customs-tariff-reference.mts";

function fixture() {
  const snapshot: TariffSnapshot = { request: { code: "1234567890", origin: "CN", dataset: "uk", date: "2026-09-15" }, sourceUrl: "https://www.trade-tariff.service.gov.uk/", retrievedAt: "2026-09-15T00:00:00Z", raw: { synthetic: true }, commodity: { id: "test", type: "commodity", attributes: {} }, measures: [{ id: "quota", typeCode: "122", preferenceCode: "120", description: "Synthetic quota", series: "Q", area: "CN", start: "2026-01-01", end: "2026-12-31", vat: false, excise: false, dutyExpression: "", components: [{ id: "rate", type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: "5" } }], conditions: [], footnotes: [], additionalCode: null, orderNumber: { id: "050001", type: "order_number", attributes: { number: "050001" } }, excludedCountries: [], unresolved: [], percentage: "5", legalActs: [{ id: "test-law", type: "legal_act", attributes: {} }] }] };
  const review: QuotaAllocationReview = { commodity: "1234567890", origin: "CN", dataset: "uk", measureId: "quota", orderNumber: "050001", preferenceCode: "120", status: "allocated", allocatedQuantity: "100", unit: "KGM", allocationReference: "SYNTHETIC-ALLOCATION", validFrom: "2026-01-01", validTo: "2026-12-31", evidence: "Synthetic full allocation" };
  const declared = { orderNumber: "050001", preferenceCode: "120", quantity: "100", unit: "KGM" };
  snapshot.measures[0].orderNumber!.relationships = { definition: { data: { type: "definition", id: "period" } } };
  snapshot.raw = { included: [{ type: "definition", id: "period", attributes: { measurement_unit: "Kilogram (kg)", validity_start_date: "2026-01-01", validity_end_date: "2026-12-31" } }] };
  return { snapshot, review, declared };
}
Deno.test("quota candidate retains evidenced allocation and structured rate without mutation", () => {
  const f = fixture(), before = JSON.stringify(f);
  const result = quotaAllocationCandidate(f.snapshot, f.review, f.declared);
  assert.deepEqual(result.components, [{ type: "percent", rate: "5" }]);
  assert.match(result.allocationEvidence, /SYNTHETIC-ALLOCATION/);
  assert.equal(JSON.stringify(f), before);
});
Deno.test("quota candidate rejects requests, partial allocation and mismatched evidence", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.review.status = "requested"; },
    (f: ReturnType<typeof fixture>) => { f.review.status = "rejected"; },
    (f: ReturnType<typeof fixture>) => { f.review.allocatedQuantity = "99.999"; },
    (f: ReturnType<typeof fixture>) => { f.declared.quantity = "0"; },
    (f: ReturnType<typeof fixture>) => { f.declared.unit = "LTR"; },
    (f: ReturnType<typeof fixture>) => { f.review.validTo = "2026-09-14"; },
    (f: ReturnType<typeof fixture>) => { f.review.origin = "US"; },
    (f: ReturnType<typeof fixture>) => { f.review.allocationReference = ""; },
    (f: ReturnType<typeof fixture>) => { f.review.evidence = ""; },
    (f: ReturnType<typeof fixture>) => { f.declared.orderNumber = "050002"; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[0].conditions = [{ id: "condition", type: "measure_condition", attributes: {} }]; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[0].legalActs = []; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[0].typeCode = "695"; },
  ]) { const f = fixture(); change(f); assert.throws(() => quotaAllocationCandidate(f.snapshot, f.review, f.declared)); }
});

Deno.test("declaration quota ledger prevents duplicate allocation across invoice items", () => {
  const { review } = fixture();
  const rows = [{ itemId: "invoice-one-item", review, quantity: "60.25", unit: "KGM" }, { itemId: "invoice-two-item", review: { ...review }, quantity: "39.75", unit: "KGM" }];
  const before = JSON.stringify(rows);
  const result = reconcileQuotaAllocations(rows);
  assert.deepEqual(result[0].used, { numerator: "100", denominator: "1" });
  assert.deepEqual(result[0].remaining, { numerator: "0", denominator: "1" });
  assert.equal(JSON.stringify(rows), before);
  rows[1].quantity = "39.750000000001";
  assert.throws(() => reconcileQuotaAllocations(rows), /overused/);
  rows[1].quantity = "39.75";
  rows[1].review.allocatedQuantity = "200";
  assert.throws(() => reconcileQuotaAllocations(rows), /conflicting/);
  rows[1].review = { ...review, orderNumber: "050002" };
  assert.throws(() => reconcileQuotaAllocations(rows), /conflicting/);
  assert.throws(() => reconcileQuotaAllocations([rows[0], rows[0]]), /unique/);
});
