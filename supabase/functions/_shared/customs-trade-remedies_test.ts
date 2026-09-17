import assert from "node:assert/strict";
import { selectTradeRemedies, type RemedyReview } from "./customs-trade-remedies.mts";
import type { TariffSnapshot, TariffMeasure } from "./customs-tariff-reference.mts";
import { parseTariffSnapshot, standardTariffSelection } from "./customs-tariff-reference.mts";

function fixture() {
  const measure = (id: string, typeCode: string, code: string): TariffMeasure => ({ id, typeCode, description: "Synthetic remedy", series: "D", area: "CN", start: "2026-09-01", end: null, vat: false, excise: false, dutyExpression: "", components: [{ id: `rate-${id}`, type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: "10" } }], conditions: [], footnotes: [], additionalCode: { id: code, type: "additional_code", attributes: { code } }, orderNumber: null, excludedCountries: [], unresolved: [], percentage: "10", legalActs: [{ id: "synthetic-act", type: "legal_act", attributes: {} }] });
  const snapshot: TariffSnapshot = { request: { code: "1234567890", origin: "CN", date: "2026-09-15", dataset: "uk" }, sourceUrl: "https://www.trade-tariff.service.gov.uk/", retrievedAt: "2026-09-15T10:00:00Z", raw: {}, commodity: { id: "one", type: "commodity", attributes: {} }, measures: [measure("add-one", "552", "A001"), measure("add-other", "552", "A999"), measure("cvd", "554", "B001")] };
  const review: RemedyReview = { commodity: snapshot.request.code, origin: "CN", dataset: "uk", validFrom: "2026-09-01", validTo: "2026-09-30", originEvidence: "Synthetic origin proof", exporterEvidence: "Synthetic exporter review", legalEvidence: "Synthetic legal review", selections: [{ measureId: "add-one", additionalCode: "A001" }, { measureId: "cvd", additionalCode: "B001" }] };
  return { snapshot, review };
}

Deno.test("retained official ironing-board tariff preserves conditional exporter rates", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-cn-20260915.json", import.meta.url)));
  const snapshot = parseTariffSnapshot(raw, { code: "7323930010", origin: "CN", date: "2026-09-15", dataset: "uk" }, "2026-09-15T12:00:00Z");
  const review: RemedyReview = { commodity: "7323930010", origin: "CN", dataset: "uk", validFrom: "2026-09-15", validTo: "2026-09-15", originEvidence: "Test-only origin evidence", exporterEvidence: "Test-only other exporter review", legalEvidence: "Test-only N1904500 review", selections: [{ measureId: "20042340", additionalCode: "A999" }] };
  const before = JSON.stringify(snapshot);
  const result = selectTradeRemedies(snapshot, review);
  assert.equal(result.measures.length, 1);
  assert.equal(result.measures[0].taxType, "A30");
  assert.equal(result.measures[0].disposition, "payable");
  assert.deepEqual(result.measures[0].components, [{ type: "percent", rate: "42.3" }]);
  assert.equal(result.alternativeMeasureIds.length, 6);
  const conditional = snapshot.measures.find(m => m.id === "20042613")!;
  assert.equal(conditional.additionalCode?.attributes.code, "A782");
  assert.ok(conditional.conditions.some(c => c.attributes.document_code === "D008"));
  review.selections = [{ measureId: conditional.id, additionalCode: "A782" }];
  assert.throws(() => selectTradeRemedies(snapshot, review), /matching declared D008/);
  review.selections[0].signedInvoice = { reference: "TEST-INVOICE", evidence: "Synthetic signed declaration review" };
  assert.throws(() => selectTradeRemedies(snapshot, review), /matching declared D008/);
  const documents = [{ code: "D008", reference: "TEST-INVOICE" }];
  const evidenced = selectTradeRemedies(snapshot, review, [], undefined, documents);
  assert.deepEqual(evidenced.measures[0].components, [{ type: "percent", rate: "34.9" }]);
  assert.ok(evidenced.measures[0].evidence?.some(value => value.includes("TEST-INVOICE")));
  assert.throws(() => selectTradeRemedies(snapshot, review, [], undefined, [...documents, ...documents]), /matching declared D008/);
  assert.throws(() => selectTradeRemedies(snapshot, review, [], undefined, [{ code: "D008", reference: "OTHER-INVOICE" }]), /matching declared D008/);
  for (const change of [
    (s: TariffSnapshot) => { s.measures.find(m => m.id === "20042613")!.conditions[0].attributes.action_code = "29"; },
    (s: TariffSnapshot) => { s.measures.find(m => m.id === "20042613")!.conditions[0].attributes.condition_duty_amount = "1"; },
    (s: TariffSnapshot) => { s.measures.find(m => m.id === "20042613")!.conditions.pop(); },
    (s: TariffSnapshot) => { (s.raw as { included: { id: string; attributes: Record<string, unknown> }[] }).included.find(r => r.id === "20015811-01")!.attributes.measure_condition_sid = 20015812; },
    (s: TariffSnapshot) => { (s.raw as { included: { id: string; attributes: Record<string, unknown> }[] }).included.find(r => r.id === "20015811-01")!.attributes.monetary_unit_code = "EUR"; },
  ]) {
    const changed = structuredClone(snapshot); change(changed);
    assert.throws(() => selectTradeRemedies(changed, review, [], undefined, documents), /matching declared D008/);
  }
  assert.equal(JSON.stringify(snapshot), before);
});
Deno.test("remedy selection retains both ADD and CVD and does not choose a different exporter", () => {
  const { snapshot, review } = fixture(), before = JSON.stringify({ snapshot, review });
  const selected = selectTradeRemedies(snapshot, review);
  assert.deepEqual(selected.measures.map(m => m.taxType), ["A30", "A40"]);
  assert.deepEqual(selected.alternativeMeasureIds, ["add-other"]);
  assert.ok(selected.measures.every(m => m.provenance === "official-snapshot" && m.disposition === "payable"));
  assert.equal(JSON.stringify({ snapshot, review }), before);
});
Deno.test("remedy selection rejects stale, incomplete and conflicting eligibility", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.review.origin = "US"; },
    (f: ReturnType<typeof fixture>) => { f.review.validTo = "2026-09-14"; },
    (f: ReturnType<typeof fixture>) => { f.review.exporterEvidence = ""; },
    (f: ReturnType<typeof fixture>) => { f.review.selections.pop(); },
    (f: ReturnType<typeof fixture>) => { f.review.selections[0].additionalCode = "A999"; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[0].legalActs = []; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[0].conditions.push({ id: "condition", type: "measure_condition", attributes: {} }); },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[0].excludedCountries = ["CN"]; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.measures[1].legalActs = [{ id: "another-liability", type: "legal_act", attributes: {} }]; },
  ]) { const f = fixture(); change(f); assert.throws(() => selectTradeRemedies(f.snapshot, f.review)); }
});
Deno.test("provisional source measures produce security, never payable amounts", () => {
  const { snapshot, review } = fixture();
  snapshot.measures.forEach(m => { m.typeCode = m.typeCode === "552" ? "551" : "553"; });
  const result = selectTradeRemedies(snapshot, review);
  assert.deepEqual(result.measures.map(m => [m.taxType, m.disposition]), [["A35", "secured"], ["A45", "secured"]]);
  snapshot.measures[1].typeCode = "552";
  review.selections.push({ measureId: "add-other", additionalCode: "A999" });
  assert.throws(() => selectTradeRemedies(snapshot, review), /Concurrent provisional/);
});

Deno.test("composed selection includes reviewed remedies but never hides another fiscal measure", () => {
  const { snapshot, review } = fixture();
  const base = structuredClone(snapshot.measures[0]);
  Object.assign(base, { id: "base", typeCode: "103", additionalCode: null, series: "C" });
  const vat = structuredClone(base); Object.assign(vat, { id: "vat", typeCode: "305", vat: true, percentage: "20" });
  snapshot.measures.push(base, vat);
  const treatment = { jurisdiction: "GB", preferenceCode: "100", remedyReview: review };
  const result = standardTariffSelection(snapshot, snapshot, [], treatment);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.remedies.map(m => m.taxType), ["A30", "A40"]);
  assert.equal(result.duty?.id, "base");
  assert.equal(result.vat?.id, "vat");
  assert.equal(standardTariffSelection(snapshot, snapshot, [], { ...treatment, remedyReview: undefined }).duty, null);
  const safeguard = structuredClone(base); Object.assign(safeguard, { id: "safeguard", typeCode: "695", description: "Safeguard interaction" });
  snapshot.measures.push(safeguard);
  const blocked = standardTariffSelection(snapshot, snapshot, [], treatment);
  assert.equal(blocked.duty, null);
  assert.deepEqual(blocked.remedies, []);
  assert.ok(blocked.issues.some(issue => issue.includes("Safeguard interaction")));
});
