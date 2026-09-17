import assert from "node:assert/strict";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { calculateSavedDeclaration, previewDeclarationCalculation, overrideCalculation, prepareSubmissionCalculationLink } from "./customs-calculation-service.ts";
import { HttpError } from "./backend.ts";
import { ukCustomsDate } from "./customs-calculation-date.mts";
import { CALCULATION_VERSION, PRECISION_POLICY } from "./customs-calculation-version.mts";
import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs";
import { fetchVatExpensePublication, verifyVatExpensePublication } from "./customs-vat-expense-reference.ts";
import type { TariffSnapshot, TariffRequest } from "./customs-tariff-reference.mts";
import { parseTariffSnapshot } from "./customs-tariff-reference.mts";
import { TARIFF_EXCHANGE_RATE_SOURCE } from "./customs-tariff-exchange-rate.mts";

const actor = "10000000-0000-0000-0000-000000000001", declaration = "20000000-0000-0000-0000-000000000001", calculation = "30000000-0000-0000-0000-000000000001";
function draft() {
  return { direction: "import", customsConversionDate: "2000-01-01", invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "100" }], dutyCalculationSetup: { jurisdiction: "GB", rateSource: "operator", items: { item: { dutyRate: "12", vatRate: "20", evidence: "Synthetic arithmetic fixture, not tariff certification" } } } };
}
function adminFixture(parent: unknown = null, rpcError: { code: string } | null = null) {
  const calls: { name: string; args: Record<string, unknown> }[] = [], filters: [string, unknown][] = [];
  const query = { select: (_: string) => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query }, maybeSingle: () => Promise.resolve({ data: parent, error: null }) };
  const admin = {
    from: (table: string) => { assert.equal(table, "Customs_CalculationAudit"); return query },
    rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return Promise.resolve({ data: rpcError ? null : calculation, error: rpcError }) },
  } as unknown as SupabaseClient;
  return { admin, calls, filters };
}
const status = (expected: number) => (error: unknown) => error instanceof HttpError && error.status === expected;

Deno.test("live preview uses the audited engine without database writes or draft mutation", async () => {
  const input = draft(), before = structuredClone(input), fixture = adminFixture();
  const preview = await previewDeclarationCalculation(input);
  assert.deepEqual(input, before);
  assert.deepEqual(fixture.calls, []);
  assert.equal("id" in preview, false);
  const persisted = await calculateSavedDeclaration(fixture.admin, actor, declaration, input);
  assert.deepEqual(preview.result, persisted.result);
  assert.equal(preview.result?.autoPopulationAllowed, false);
  assert.equal(fixture.calls.length, 1);
});

Deno.test("incomplete live input returns needs-information without looking up rates", async () => {
  const input = { ...draft(), dutyCalculationSetup: {} };
  const preview = await previewDeclarationCalculation(input, () => { throw new Error("Must not fetch tariff"); });
  assert.equal(preview.result, null);
  assert.match(preview.issues[0], /Great Britain or Northern Ireland/);
});

Deno.test("authorised-use service retains the official graph and review without changing declared tax", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-authorised-oil-cn-20260915.json", import.meta.url)));
  const fixture = adminFixture(), today = ukCustomsDate();
  const saved = { ...draft(), declarationCategory: "H1", declarationType: "A", items: [{ ...draft().items[0], commodityCode: "1512191000", nonPreferentialOrigin: "CN", procedureCode: "4400", preferenceCode: "140", additionalProcedureCode: "000", additionalDocumentCategory: "N", additionalDocumentType: "990", additionalDocumentId: "GBEUSQA001", taxAmount: "999" }], dutyCalculationSetup: { jurisdiction: "GB", rateSource: "official", authorisedUses: { item: { commodity: "1512191000", origin: "CN", dataset: "uk", measureId: "20284505", validFrom: today, validTo: today, completionDueDate: today, authorisationReference: "GBEUSQA001", authorisationEvidence: "Synthetic authorisation only", prescribedUseEvidence: "Synthetic technical use", supervisionEvidence: "Synthetic stock records" } } } };
  const provider = (request: TariffRequest) => Promise.resolve(parseTariffSnapshot(raw, { ...request, date: "2026-09-15" }, "2026-09-15T07:18:00Z"));
  const before = structuredClone(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  if (today === "2026-09-15") {
    assert.deepEqual(run.result.totals, { duty: "0.00", vat: "200.00" });
    assert.match(run.input.items[0].procedureEvidence!, /Completion is not confirmed/);
    assert.equal(run.result.authorisedUseOptions?.[0].options[0].id, "20284505");
  } else assert.equal(run.result.totals, null, "Historic fixture is not current tariff evidence");
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.deepEqual(saved, before);
  assert.deepEqual(fixture.calls[0].args.p_draft, before);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved, provider), status(403));
});

Deno.test("EU proof preserves the individual-origin lookup and both origins in the audit", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-fr-20260915.json", import.meta.url)));
  const fixture = adminFixture(), source = draft();
  const today = ukCustomsDate();
  const saved = { ...source, items: [{ ...source.items[0], commodityCode: "7323930010", nonPreferentialOrigin: "FR", preferentialOrigin: "EU", preferenceCode: "300" }], dutyCalculationSetup: { jurisdiction: "GB", rateSource: "official", preferences: { item: { preferenceCode: "300", origin: "EU", dataset: "uk", validFrom: today, validTo: today, proofReference: "Synthetic Union proof fixture", originRulesEvidence: "Synthetic agreement review", transportEvidence: "Synthetic non-alteration evidence" } } } };
  const requests: TariffRequest[] = [];
  const provider = (request: TariffRequest) => {
    requests.push(request);
    // Retained fixture is dated; do not pretend it is current after its test date.
    return Promise.resolve(parseTariffSnapshot(raw, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z"));
  };
  const before = JSON.stringify(saved);
  const result = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].origin, "FR");
  assert.equal(result.submissionFieldsChanged, false);
  assert.equal(result.result.autoPopulationAllowed, false);
  if (today === "2026-09-15") assert.deepEqual(result.result.totals, { duty: "0.00", vat: "200.00" });
  else assert.equal(result.result.totals, null);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual(fixture.calls[0].args.p_draft, saved);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof result).result, result.result);
});

Deno.test("NI preference retains both official graphs and proofs without dropping additional fiscal conditions", async () => {
  const uk = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-co-20260915.json", import.meta.url)));
  const xi = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-xi-co-20260915.json", import.meta.url)));
  const source = draft(), today = ukCustomsDate(), fixture = adminFixture();
  const proof = (dataset: "uk" | "xi") => ({ preferenceCode: "300", dataset, origin: "CO", validFrom: today, validTo: today, proofReference: `Synthetic ${dataset} proof only`, originRulesEvidence: `Synthetic ${dataset} agreement review`, transportEvidence: "Synthetic non-alteration review" });
  const saved = { ...source, importerEori: "XI-SYNTHETIC", items: [{ ...source.items[0], commodityCode: "7323930010", nonPreferentialOrigin: "CO", preferentialOrigin: "CO", preferenceCode: "300", taxAmount: "999" }], dutyCalculationSetup: { jurisdiction: "NI", rateSource: "official", movement: "rest-of-world-to-NI", items: { item: { niRiskFacts: { movementEvidence: "Synthetic route", processing: { basis: "not-processed", evidence: "Synthetic no processing" }, endUse: "NI", endUseEvidence: "Synthetic use" } } }, niPreferences: { item: { uk: proof("uk"), xi: proof("xi") } } } };
  const requests: TariffRequest[] = [];
  const provider = (request: TariffRequest) => { requests.push(request); return Promise.resolve(parseTariffSnapshot(request.dataset === "xi" ? xi : uk, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z")); };
  const before = structuredClone(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  assert.deepEqual(requests.map(request => request.dataset).sort(), ["uk", "xi"]);
  assert.ok(requests.every(request => request.origin === "CO" && request.date === today));
  assert.equal(run.result.totals, null, "The full graph still contains unresolved fiscal conditions; origin proof alone cannot remove them");
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.equal(run.submissionFieldsChanged, false);
  assert.deepEqual(saved, before);
  assert.deepEqual(fixture.calls[0].args.p_draft, saved);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  if (today === "2026-09-15") {
    assert.deepEqual(run.result.preferenceOptions?.map(row => row.dataset).sort(), ["uk", "xi"]);
    assert.ok(run.result.issues.join(" ").includes("comparison"));
  }
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved, provider), status(403));
  const reviewed = { ...saved, dutyCalculationSetup: { ...saved.dutyCalculationSetup, items: { item: { ...saved.dutyCalculationSetup.items.item, niLowValueExclusion: { basis: "not-distance-sale", reviewDate: today, consignmentReference: "Synthetic NI consignment", evidence: "Synthetic non-distance-sale evidence; not a real declaration" } } } } };
  const accepted = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, reviewed, provider);
  if (today === "2026-09-15") {
    assert.deepEqual(accepted.result.totals, { duty: "0.00", vat: "200.00" }, JSON.stringify(accepted.result));
    assert.equal(accepted.result.lines[0].niRiskDecision?.status, "not-at-risk");
    assert.ok(accepted.input.items[0].niDutyComparison?.eu.evidence.some(line => line.includes("Synthetic non-distance-sale evidence")));
  } else assert.equal(accepted.result.totals, null);
  assert.equal(accepted.result.autoPopulationAllowed, false);
  assert.equal(accepted.submissionFieldsChanged, false);
  for (const fullRate of ["uk", "xi"] as const) {
    const mixed = { ...reviewed, headerAdditionalInformationCode: "NIIMP", items: reviewed.items.map(item => ({ ...item, preferenceCode: fullRate === "uk" ? "100" : "300", additionalInformationStatements: [{ id: "eu-preference", statementCode: "EUPRF", statementDescription: fullRate === "xi" ? "100" : "300" }] })), dutyCalculationSetup: { ...reviewed.dutyCalculationSetup, niPreferences: { item: fullRate === "uk" ? { xi: proof("xi") } : { uk: proof("uk") } } } };
    const mixedFixture = adminFixture(), original = structuredClone(mixed);
    const result = await calculateSavedDeclaration(mixedFixture.admin, actor, declaration, mixed, provider);
    if (today === "2026-09-15") {
      assert.deepEqual(result.result.totals, { duty: "32.00", vat: "206.40" }, JSON.stringify(result.result));
      assert.equal(result.result.lines[0].niRiskDecision?.status, fullRate === "uk" ? "not-at-risk" : "at-risk");
      assert.deepEqual(result.result.preferenceOptions?.map(row => row.dataset), [fullRate === "uk" ? "xi" : "uk"]);
    } else assert.equal(result.result.totals, null);
    assert.equal(result.submissionFieldsChanged, false);
    assert.equal(result.result.autoPopulationAllowed, false);
    assert.deepEqual(mixed, original);
    assert.deepEqual(mixedFixture.calls[0].args.p_draft, original);
    assert.deepEqual((mixedFixture.calls[0].args.p_evidence as typeof result).result, result.result);
  }
});

Deno.test("returned-goods relief retains official measures, eligibility and relieved tax in the audit", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-fr-20260915.json", import.meta.url)));
  const fixture = adminFixture(), source = draft(), today = ukCustomsDate();
  const saved = { ...source, importerEori: "GB-SYNTHETIC", items: [{ ...source.items[0], procedureCode: "6110", additionalProcedureCode: "F05", commodityCode: "7323930010", nonPreferentialOrigin: "FR", taxAmount: "999.00" }], dutyCalculationSetup: { jurisdiction: "GB", rateSource: "official", returnedGoods: { item: {
    exportDate: "2025-09-15", exportReference: "Synthetic export", exportItemReference: "1", exportTerritory: "GB", exporterEori: "GB-SYNTHETIC",
    goodsIdentityEvidence: "Synthetic serials and quantities", freeCirculationEvidence: "Synthetic UK domestic status", unchangedGoodsEvidence: "Synthetic condition review", valuationEvidence: "Synthetic reimport valuation", repaymentEvidence: "Synthetic no outstanding refunds", ordinaryGoodsConfirmed: true, noProcessingConfirmed: true, vatEligibilityEvidence: "Synthetic same entity and no overseas sale",
  } } } };
  const provider = (request: TariffRequest) => Promise.resolve(parseTariffSnapshot(raw, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z"));
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  if (today === "2026-09-15") {
    assert.deepEqual(run.result.totals, { duty: "0.00", vat: "0.00" });
    assert.equal(run.result.lines[0].taxes[0].disposition, "relieved");
    assert.equal(run.result.lines[0].vatLiability?.disposition, "relieved");
    assert.match(run.input.items[0].procedureEvidence!, /Synthetic export/);
  } else assert.equal(run.result.totals, null, "The dated fixture must not masquerade as a current measure");
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual(fixture.calls[0].args.p_draft, saved);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved, provider), status(403));
});

Deno.test("mixed declaration audit retains valid line estimates but never a partial declaration total", async () => {
  const source = draft(), fixture = adminFixture();
  const saved = { ...source, items: [...source.items, { ...source.items[0], id: "specialist", procedureCode: "5300" }], dutyCalculationSetup: { ...source.dutyCalculationSetup, items: { ...source.dutyCalculationSetup.items, specialist: source.dutyCalculationSetup.items.item } } };
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.equal(run.result.lines[0].status, "estimate");
  assert.equal(run.result.lines[0].duty, "120.00");
  assert.equal(run.result.lines[0].vat, "224.00");
  assert.equal(run.result.lines[1].status, "needs-information");
  assert.equal(run.result.lines[1].duty, undefined);
  assert.ok(run.result.lines[1].issues.some(issue => issue.includes("specialist treatment")));
  assert.equal(run.result.totals, null);
  assert.equal(run.result.liabilityTotals, undefined);
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
});

Deno.test("real NI release tariff blocks unresolved low-value and alternative fiscal measures without changing submission fields", async () => {
  const uk = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-co-20260915.json", import.meta.url)));
  const xi = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-xi-co-20260915.json", import.meta.url)));
  const source = draft(), fixture = adminFixture(), today = ukCustomsDate();
  const saved = { ...source, declarationCategory: "H1", declarationType: "A", items: [{ ...source.items[0], procedureCode: "4053", additionalProcedureCode: "000", commodityCode: "7323930010", nonPreferentialOrigin: "CO", taxAmount: "999.00" }], dutyCalculationSetup: { jurisdiction: "NI", rateSource: "official", movement: "rest-of-world-to-NI", riskStatus: "at-risk", niTariff: "EU", niTreatmentEvidence: "Synthetic release risk review", niTemporaryRelease: { item: {
    event: "normal-release", priorRelief: "total", entryDate: "2025-03-01", entryReference: "Synthetic TA entry", entryItemReference: "1", authorisationEvidence: "Synthetic compliant discharge", goodsIdentityEvidence: "Synthetic item identity", releaseValuationEvidence: "Synthetic sale and costs", releaseRiskEvidence: "Synthetic EU at-risk release", noPreviousTaxPaidConfirmed: true, noProcessingConfirmed: true,
  } } } };
  const requests: TariffRequest[] = [];
  const provider = (request: TariffRequest) => { requests.push(request); return Promise.resolve(parseTariffSnapshot(request.dataset === "xi" ? xi : uk, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z")) };
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  assert.deepEqual(requests.map(request => request.dataset).sort(), ["uk", "xi"]);
  if (today === "2026-09-15") {
    // This unmodified publication includes type 107. Do not remove measures
    // from a real fixture to make the synthetic normal-release path succeed.
    assert.ok(run.result.issues.some(issue => issue.includes("intrinsic value and distance-sale treatment")));
    const fiscal = run.result.issues.find(issue => issue.includes("Additional or alternative fiscal measures"));
    assert.equal(fiscal, "Item item: Additional or alternative fiscal measures require treatment selection: Low-value consignment customs duty");
    assert.equal(run.result.lines[0].status, "needs-information");
    assert.equal(run.result.lines[0].duty, undefined);
    assert.equal(run.result.totals, null);
    const reviewed = structuredClone(saved) as typeof saved & { dutyCalculationSetup: { niTemporaryRelease: { item: { lowValueExclusion?: { basis: "not-distance-sale"; reviewDate: string; consignmentReference: string; evidence: string } } } } };
    reviewed.dutyCalculationSetup.niTemporaryRelease.item.lowValueExclusion = { basis: "not-distance-sale", reviewDate: today, consignmentReference: "Synthetic consignment", evidence: "Synthetic contract review: not a distance sale" };
    const accepted = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, reviewed, provider);
    assert.deepEqual(accepted.result.issues, []);
    assert.equal(accepted.result.lines[0].duty, "32.00");
    assert.ok(accepted.result.lines[0].vatTaxes?.some(tax => tax.taxType === "B05"));
    assert.ok(accepted.input.items[0].measures[0].evidence.some(entry => entry.includes("Synthetic consignment") && entry.includes("non-distance sale")));
    assert.equal(accepted.submissionFieldsChanged, false);
    assert.equal(accepted.result.autoPopulationAllowed, false);
    reviewed.dutyCalculationSetup.niTemporaryRelease.item.lowValueExclusion.reviewDate = "2026-09-14";
    const stale = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, reviewed, provider);
    assert.equal(stale.result.totals, null);
  } else assert.equal(run.result.totals, null);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual(fixture.calls[0].args.p_draft, saved);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved, provider), status(403));
});

Deno.test("submission calculation lookup is declaration scoped and read failures stop preparation", async () => {
  const calls: unknown[][] = [];
  let failure = false;
  const query = {
    select: (fields: string) => { calls.push(["select", fields]); return query; },
    eq: (field: string, value: unknown) => { calls.push(["eq", field, value]); return query; },
    order: (field: string, value: unknown) => { calls.push(["order", field, value]); return query; },
    limit: (count: number) => { calls.push(["limit", count]); return query; },
    maybeSingle: () => Promise.resolve({ data: null, error: failure ? { message: "private database detail" } : null }),
  };
  const admin = { from: (table: string) => { calls.push(["from", table]); return query; } } as unknown as SupabaseClient;
  const result = await prepareSubmissionCalculationLink(admin, declaration, draft(), new Date().toISOString());
  assert.equal(result.state, "unavailable");
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "declaration_id", declaration])));
  assert.ok(calls.some(call => JSON.stringify(call) === '["eq","kind","calculation"]'));
  assert.ok(calls.some(call => JSON.stringify(call) === '["limit",1]'));
  failure = true;
  await assert.rejects(() => prepareSubmissionCalculationLink(admin, declaration, draft(), new Date().toISOString()), error => error instanceof HttpError && error.status === 503 && !error.message.includes("private"));
});

Deno.test("NI processed-products release uses retained release measures and keeps original-input treatment blocked", async () => {
  const uk = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-co-20260915.json", import.meta.url)));
  const xi = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-xi-co-20260915.json", import.meta.url)));
  const base = draft(), today = ukCustomsDate(), fixture = adminFixture();
  const saved = { ...base, declarationCategory: "H1", declarationType: "A", items: [{ ...base.items[0], itemPrice: "2500", procedureCode: "4051", additionalProcedureCode: "000", commodityCode: "7323930010", nonPreferentialOrigin: "CO", taxAmount: "999.00" }], dutyCalculationSetup: { jurisdiction: "NI", rateSource: "official", movement: "rest-of-world-to-NI", riskStatus: "at-risk", niTariff: "EU", niTreatmentEvidence: "Synthetic release risk", niProcessingRelease: { item: {
    basis: "processed-products", entryDate: "2026-09-01", entryReference: "Synthetic entry", authorisationEvidence: "Synthetic permitted basis", dischargeEvidence: "Synthetic compliant discharge and yield", processedValuationEvidence: "Synthetic release product value", originalBasisExclusionEvidence: "Synthetic original trade-policy and basis review", releaseRiskEvidence: "Synthetic EU at-risk release", noPriorTaxPaymentConfirmed: true, noEquivalenceOrCombinedReliefConfirmed: true,
    lowValueExclusion: { basis: "not-distance-sale", reviewDate: today, consignmentReference: "Synthetic processing consignment", evidence: "Synthetic non-distance-sale review" },
  } } } };
  const provider = (request: TariffRequest) => Promise.resolve(parseTariffSnapshot(request.dataset === "xi" ? xi : uk, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z"));
  const before = structuredClone(saved), run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  if (today === "2026-09-15") {
    assert.deepEqual(run.result.issues, []);
    assert.equal(run.result.lines[0].customsValue, "2500.00");
    assert.equal(run.result.lines[0].duty, "80.00");
    assert.equal(run.result.lines[0].vat, "516.00");
    assert.ok(run.result.lines[0].vatTaxes?.some(tax => tax.taxType === "B05" && tax.amount === "16.00"));
    assert.match(run.input.items[0].procedureEvidence ?? "", /Synthetic original trade-policy/);
  } else assert.equal(run.result.totals, null);
  assert.deepEqual(saved, before);
  assert.deepEqual(fixture.calls[0].args.p_draft, before);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(run.result.autoPopulationAllowed, false);
  for (const change of ["F44", "missing-review", "GB"]) {
    const invalid = structuredClone(saved);
    if (change === "F44") invalid.items[0].additionalProcedureCode = "F44";
    if (change === "missing-review") invalid.dutyCalculationSetup.niProcessingRelease.item.originalBasisExclusionEvidence = "";
    if (change === "GB") invalid.dutyCalculationSetup.jurisdiction = "GB";
    const rejected = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, invalid, provider);
    assert.equal(rejected.result.totals, null);
  }
});

Deno.test("NI original-input release fetches lot references and retains separate duty and product VAT bases", async () => {
  const uk = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-co-20260915.json", import.meta.url)));
  const xi = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-xi-co-20260915.json", import.meta.url)));
  const base = draft(), today = ukCustomsDate(), fixture = adminFixture();
  const lot = (id: string, entryItemReference: string) => ({ id, entryItemReference, entryReference: "Synthetic original entry", originalF44Evidence: `Synthetic original entry item ${entryItemReference} declares F44`, entryDate: "2026-09-01", commodityCode: "7323930010", origin: "CO", quantity: "3", unit: "NAR", originalCustomsValueGbp: "600", previouslyDischargedQuantity: "0", evidence: "Synthetic original value and inventory" });
  const saved = { ...base, declarationCategory: "H1", declarationType: "A", items: [{ ...base.items[0], itemPrice: "2500", procedureCode: "4051", additionalProcedureCode: "F44", commodityCode: "7323930010", nonPreferentialOrigin: "CO", taxAmount: "999.00" }], dutyCalculationSetup: { jurisdiction: "NI", rateSource: "official", movement: "rest-of-world-to-NI", riskStatus: "at-risk", niTariff: "EU", niTreatmentEvidence: "Synthetic release risk", niProcessingRelease: { item: {
    basis: "original-inputs", allOriginalInputsConfirmed: true, authorisationEvidence: "Synthetic Article 86(3) basis", dischargeEvidence: "Synthetic compliant discharge and yield", processedValuationEvidence: "Synthetic release product value", releaseRiskEvidence: "Synthetic EU at-risk release", noPriorTaxPaymentConfirmed: true, noEquivalenceOrCombinedReliefConfirmed: true,
    lowValueExclusion: { basis: "not-distance-sale", reviewDate: today, consignmentReference: "Synthetic processing consignment", evidence: "Synthetic non-distance-sale review" },
  } }, processingInputs: { jurisdiction: "NI", lots: [lot("lot-a", "1"), lot("lot-b", "2")], consumption: ["lot-a", "lot-b"].map(inputLotId => ({ inputLotId, outputItemId: "item", quantity: "1", unit: "NAR", yieldEvidence: "Synthetic agreed yield" })) } } };
  const requests: TariffRequest[] = [];
  const provider = (request: TariffRequest) => { requests.push(request); return Promise.resolve(parseTariffSnapshot(request.dataset === "xi" ? xi : uk, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z")); };
  const before = structuredClone(saved), run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  assert.equal(requests.length, 2, "identical lookups are deduplicated across output and both original lots");
  if (today === "2026-09-15") {
    assert.deepEqual(run.result.issues, []);
    assert.deepEqual(run.result.lines[0].issues.filter(issue => !issue.includes("certif")), []);
    assert.equal(run.result.lines[0].duty, "12.80");
    assert.equal(run.result.lines[0].vat, "502.56");
    assert.equal(run.result.lines[0].goodsValue, "2500.00");
    assert.equal(run.input.items[0].originalInputDutyBases?.length, 2);
    assert.ok(run.input.items[0].originalInputDutyBases?.every(basis => basis.evidence.includes("original F44 evidence: Synthetic original entry item")));
  } else assert.equal(run.result.totals, null);
  assert.deepEqual(saved, before);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.ok(run.processingReferenceEvidence.dutyByItem?.["lot-a"]);
  assert.deepEqual((fixture.calls[0].args.p_evidence as Record<string, unknown>).processingReferenceEvidence, run.processingReferenceEvidence);
  for (const change of ["unconfirmed", "overused", "future-entry", "no-original-references", "wrong-output", "missing-original-f44"]) {
    const invalid = structuredClone(saved);
    if (change === "unconfirmed") invalid.dutyCalculationSetup.niProcessingRelease.item.allOriginalInputsConfirmed = false;
    if (change === "overused") invalid.dutyCalculationSetup.processingInputs.consumption[0].quantity = "4";
    if (change === "future-entry") invalid.dutyCalculationSetup.processingInputs.lots[0].entryDate = "2099-01-01";
    if (change === "no-original-references") invalid.dutyCalculationSetup.processingInputs.lots[0].commodityCode = "";
    if (change === "wrong-output") invalid.dutyCalculationSetup.processingInputs.consumption[0].outputItemId = "deleted-item";
    if (change === "missing-original-f44") invalid.dutyCalculationSetup.processingInputs.lots[1].originalF44Evidence = " ";
    const rejected = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, invalid, provider);
    assert.equal(rejected.result.totals, null);
    if (change === "missing-original-f44") assert.match(rejected.result.issues.join(" "), /lot-b: record evidence that F44/);
  }
});

Deno.test("official EUR duty uses a separate retained conversion and missing periods never append", async () => {
  const original = globalThis.fetch, fixture = adminFixture(), source = draft();
  const saved = { ...source, items: [{ ...source.items[0], commodityCode: "8536909500", nonPreferentialOrigin: "CN" }], dutyCalculationSetup: { jurisdiction: "GB", rateSource: "official", items: { item: { tariffQuantities: [{ quantity: "30", unit: "KGM", evidence: "Synthetic measured mass" }] } } } };
  const before = JSON.stringify(saved), date = ukCustomsDate();
  const publication = JSON.stringify({ data: [{ id: "test-rate", type: "monetary_exchange_rate", attributes: { child_monetary_unit_code: "GBP", exchange_rate: "0.8572", validity_start_date: `${date.slice(0, 7)}-01`, operation_date: date } }] });
  const provider = async (request: TariffRequest): Promise<TariffSnapshot> => ({
    request, sourceUrl: "https://api.trade-tariff.service.gov.uk/uk/api/commodities/8536909500", retrievedAt: new Date().toISOString(), raw: { fixture: "Synthetic service contract, not certification" }, commodity: { id: "commodity", type: "commodity", attributes: {} },
    measures: [false, true].map(vat => ({ id: vat ? "vat" : "duty", typeCode: vat ? "305" : "103", description: vat ? "VAT" : "Duty", series: "", area: "1011", start: `${date.slice(0, 4)}-01-01`, end: null, vat, excise: false, dutyExpression: "", conditions: [], footnotes: [], additionalCode: null, orderNumber: null, excludedCountries: [], unresolved: [], percentage: vat ? "20" : null,
      components: [{ id: vat ? "vat-component" : "duty-component", type: "measure_component", attributes: vat ? { duty_expression_id: "01", duty_amount: "20" } : { duty_expression_id: "01", duty_amount: "2", monetary_unit_code: "EUR", measurement_unit_code: "KGM" } }],
    })),
  });
  let requests = 0;
  globalThis.fetch = ((url) => { assert.equal(url, TARIFF_EXCHANGE_RATE_SOURCE); requests++; return Promise.resolve(new Response(publication)); }) as typeof fetch;
  try {
    const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
    assert.equal(requests, 1);
    assert.equal(run.result.lines[0].duty, "51.43");
    assert.equal(run.result.lines[0].vat, "210.29");
    assert.equal(run.result.autoPopulationAllowed, false);
    assert.equal(run.tariffExchangeReference?.publicationJson, publication);
    assert.equal(run.exchangeRatePublication, null);
    assert.equal(JSON.stringify(saved), before);
    assert.equal(run.submissionFieldsChanged, false);
    assert.deepEqual((fixture.calls[0].args.p_evidence as Record<string, unknown>).tariffExchangeReference, run.tariffExchangeReference);
    globalThis.fetch = (() => Promise.resolve(new Response('{"data":[]}'))) as typeof fetch;
    await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider), status(503));
    assert.equal(fixture.calls.length, 1);
    assert.equal(JSON.stringify(saved), before);
    globalThis.fetch = (() => { throw new Error("Unclaimed EUR preferences must not fetch conversion evidence"); }) as typeof fetch;
    const gbpProvider = async (request: TariffRequest) => {
      const snapshot = await provider(request);
      const preference = structuredClone(snapshot.measures[0]);
      preference.id = "unclaimed-preference"; preference.typeCode = "142";
      snapshot.measures[0].components[0].attributes.monetary_unit_code = "GBP";
      snapshot.measures.push(preference);
      return snapshot;
    };
    const gbpOnly = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, gbpProvider);
    assert.equal(gbpOnly.result.lines[0].duty, "60.00");
    assert.equal(gbpOnly.tariffExchangeReference, null);
    assert.equal(fixture.calls.length, 2);
    const remedySaved = structuredClone(saved) as typeof saved & { items: Record<string, unknown>[] };
    remedySaved.items[0].taricCode = "A123";
    Object.assign(remedySaved.dutyCalculationSetup.items.item, { remedyReview: { commodity: "8536909500", origin: "CN", dataset: "uk", validFrom: `${date.slice(0, 7)}-01`, validTo: date, originEvidence: "Synthetic origin proof", exporterEvidence: "Synthetic exporter proof", legalEvidence: "Synthetic legal review", selections: [{ measureId: "remedy", additionalCode: "A123" }] } });
    const remedyProvider = async (request: TariffRequest) => {
      const snapshot = await provider(request), remedy = structuredClone(snapshot.measures[0]);
      Object.assign(snapshot.measures[0], { percentage: "12", components: [{ id: "base-rate", type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: "12" } }] });
      Object.assign(remedy, { id: "remedy", typeCode: "552", additionalCode: { id: "exporter", type: "additional_code", attributes: { code: "A123" } }, legalActs: [{ id: "synthetic-act", type: "legal_act", attributes: {} }] });
      snapshot.measures.push(remedy);
      return snapshot;
    };
    const remedyFixture = adminFixture(), remedyBefore = JSON.stringify(remedySaved);
    globalThis.fetch = ((url) => { assert.equal(url, TARIFF_EXCHANGE_RATE_SOURCE); return Promise.resolve(new Response(publication)); }) as typeof fetch;
    const remedyRun = await calculateSavedDeclaration(remedyFixture.admin, actor, declaration, remedySaved, remedyProvider);
    assert.deepEqual(remedyRun.result.totals, { duty: "171.43", vat: "234.29" });
    assert.equal(remedyRun.result.lines[0].taxes[1].taxType, "A30");
    assert.equal(remedyRun.tariffExchangeReference?.publicationJson, publication);
    assert.equal(remedyRun.exchangeRatePublication, null);
    assert.deepEqual((remedyFixture.calls[0].args.p_evidence as { result: unknown }).result, remedyRun.result);
    assert.equal(JSON.stringify(remedySaved), remedyBefore);
    globalThis.fetch = (() => Promise.resolve(new Response('{"data":[]}'))) as typeof fetch;
    await assert.rejects(() => calculateSavedDeclaration(remedyFixture.admin, actor, declaration, remedySaved, remedyProvider), status(503));
    assert.equal(remedyFixture.calls.length, 1);
    const niSaved = {
      ...saved, importerEori: "XI123",
      importAdjustments: [{ id: "import-freight", code: "AP", amount: "500", currency: "GBP" }],
      dutyCalculationSetup: { ...saved.dutyCalculationSetup, jurisdiction: "NI", movement: "rest-of-world-to-NI", costs: { "import-freight": { evidence: "Synthetic freight invoice", includedInPrice: false } }, items: { item: { ...saved.dutyCalculationSetup.items.item, niRiskFacts: { movementEvidence: "Synthetic overseas movement", processing: { basis: "not-processed", evidence: "Synthetic unprocessed goods" }, ukims: { eori: "XI123", reference: "Synthetic UKIMS", validFrom: `${date.slice(0, 7)}-01`, revoked: false }, endUse: "NI", endUseEvidence: "Synthetic final consumer" } } } },
    };
    const datasets: string[] = [];
    const pairedProvider = async (request: TariffRequest) => {
      datasets.push(request.dataset);
      const snapshot = await provider(request);
      snapshot.sourceUrl = `https://api.trade-tariff.service.gov.uk/${request.dataset}/api/commodities/8536909500`;
      Object.assign(snapshot.measures[0].components[0].attributes, { monetary_unit_code: request.dataset === "xi" ? "EUR" : "GBP", duty_amount: request.dataset === "xi" ? "4" : "2" });
      if (request.dataset === "xi") snapshot.measures = snapshot.measures.filter(measure => !measure.vat);
      return snapshot;
    };
    globalThis.fetch = ((url) => { assert.equal(url, TARIFF_EXCHANGE_RATE_SOURCE); return Promise.resolve(new Response(publication)); }) as typeof fetch;
    const niBefore = JSON.stringify(niSaved);
    const niRun = await calculateSavedDeclaration(fixture.admin, actor, declaration, niSaved, pairedProvider);
    assert.deepEqual(datasets, ["xi", "uk"]);
    assert.equal(niRun.result.lines[0].customsValue, "1500.00");
    assert.equal(niRun.result.lines[0].niRiskDecision?.status, "not-at-risk");
    assert.equal(niRun.result.lines[0].duty, "60.00");
    assert.equal(niRun.result.lines[0].vat, "312.00");
    assert.ok(niRun.result.lines[0].niComparisonWorkings?.eu.some(step => step.label.includes("0.8572 GBP/EUR")));
    assert.equal(JSON.stringify(niSaved), niBefore);
    assert.equal(niRun.result.autoPopulationAllowed, false);
    assert.equal(niRun.tariffExchangeReference?.publicationJson, publication);
    const atRiskSaved = structuredClone(niSaved);
    atRiskSaved.dutyCalculationSetup.items.item.niRiskFacts.endUse = "other";
    const atRiskBefore = JSON.stringify(atRiskSaved);
    const atRiskRun = await calculateSavedDeclaration(fixture.admin, actor, declaration, atRiskSaved, pairedProvider);
    assert.equal(atRiskRun.result.lines[0].niRiskDecision?.status, "at-risk");
    assert.equal(atRiskRun.result.lines[0].taxes[0].taxType, "A50");
    assert.deepEqual(atRiskRun.result.lines[0].vatTaxes?.map(row => [row.taxType, row.amount]), [["B00", "300.00"], ["B05", "20.57"]]);
    assert.equal(atRiskRun.submissionFieldsChanged, false);
    assert.equal(JSON.stringify(atRiskSaved), atRiskBefore);
    assert.deepEqual((fixture.calls.at(-1)?.args.p_evidence as { result: unknown }).result, atRiskRun.result);
    for (const fullRate of ["uk", "xi"] as const) {
      const claimedDataset = fullRate === "uk" ? "xi" : "uk";
      const proof = { preferenceCode: "300", dataset: claimedDataset, origin: "CN", validFrom: date, validTo: date, proofReference: "Synthetic origin proof", originRulesEvidence: "Synthetic agreement", transportEvidence: "Synthetic transport review" };
      const mixed = { ...atRiskSaved, headerAdditionalInformationCode: "NIIMP", items: atRiskSaved.items.map(item => ({ ...item, preferentialOrigin: "CN", preferenceCode: fullRate === "uk" ? "100" : "300", additionalInformationStatements: [{ statementCode: "EUPRF", statementDescription: fullRate === "xi" ? "100" : "300" }] })), dutyCalculationSetup: { ...atRiskSaved.dutyCalculationSetup, niPreferences: { item: { [claimedDataset]: proof } } } };
      const mixedProvider = async (request: TariffRequest) => {
        const snapshot = await pairedProvider(request);
        if (request.dataset === claimedDataset) {
          const preference = structuredClone(snapshot.measures[0]);
          Object.assign(preference, { id: "claimed-preference", typeCode: "142", preferenceCode: "300", legalActs: [{ id: "synthetic-agreement", type: "legal_act", attributes: {} }] });
          snapshot.measures[0].preferenceCode = "100";
          // An unclaimed full-duty alternative must not cause an incidental FX fetch.
          snapshot.measures[0].components[0].attributes.monetary_unit_code = "GBP";
          snapshot.measures.push(preference);
        }
        return snapshot;
      };
      let fxRequests = 0;
      globalThis.fetch = ((url) => { assert.equal(url, TARIFF_EXCHANGE_RATE_SOURCE); fxRequests++; return Promise.resolve(new Response(publication)); }) as typeof fetch;
      const mixedFixture = adminFixture(), before = structuredClone(mixed);
      const result = await calculateSavedDeclaration(mixedFixture.admin, actor, declaration, mixed, mixedProvider);
      assert.equal(fxRequests, 1, "fetch EUR evidence for the EU code, not the UK declaration code");
      assert.equal(result.result.lines[0].duty, "102.86", JSON.stringify(result.result));
      assert.equal(result.result.lines[0].niRiskDecision?.status, "at-risk");
      assert.equal(result.tariffExchangeReference?.publicationJson, publication);
      assert.deepEqual(mixed, before);
      assert.equal(result.submissionFieldsChanged, false);
      assert.deepEqual((mixedFixture.calls[0].args.p_evidence as typeof result).tariffExchangeReference, result.tariffExchangeReference);
      globalThis.fetch = (() => Promise.resolve(new Response('{"data":[]}'))) as typeof fetch;
      await assert.rejects(() => calculateSavedDeclaration(mixedFixture.admin, actor, declaration, mixed, mixedProvider), status(503));
      assert.equal(mixedFixture.calls.length, 1, "missing tariff FX must not append a guessed result");
    }
  } finally { globalThis.fetch = original }
});

Deno.test("airfreight source bytes and selected airport are audited without mutating the saved percentage", async () => {
  const originalFetch = globalThis.fetch, fixture = adminFixture();
  const source = draft();
  const saved = { ...source, loadingLocationId: "JFK", importAdjustments: [{ id: "import-air", code: "AR", amount: "300", currency: "GBP" }], dutyCalculationSetup: { ...source.dutyCalculationSetup, costs: { "import-air": { includedInPrice: false, evidence: "Air waybill fixture", airfreightPercentage: "70" } } } };
  const before = JSON.stringify(saved);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Country", "Location of Airport", "Name of Airport (where Listed)", "Airport IATA Code", "Zone", "Percentage of Freight Liable to Import Duty"],
    ["United States", "New York", "John F Kennedy Intl", "JFK", "A", "70%"],
  ]), "Loading_codes");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "ods" }) as ArrayBuffer;
  globalThis.fetch = (async url => String(url).startsWith("https://www.gov.uk/") ? new Response('<a href="https://assets.publishing.service.gov.uk/media/fixture/20260724_CDS_DE_5-21_Appendix15B_AirportLoadingCodes.ods">Airports</a>') : new Response(bytes)) as typeof fetch;
  try {
    const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
    assert.equal(run.airfreightReferenceEvidence?.airport?.customsPercentage, "70");
    assert.equal(run.airfreightReferenceEvidence?.publication.contentSha256.length, 64);
    assert.equal(run.result.lines[0].vat, "289.04");
    assert.match(run.result.referenceNotices![0].message, /entered percentage remains/);
    assert.equal(JSON.stringify(saved), before);
    assert.deepEqual((fixture.calls[0].args.p_evidence as Record<string, unknown>).airfreightReferenceEvidence, run.airfreightReferenceEvidence);
    saved.loadingLocationId = "MCI";
    const unknown = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
    assert.equal(unknown.result.totals, null);
    assert.equal(unknown.airfreightReferenceEvidence?.airport, null);
    assert.equal(unknown.result.lines[0].duty, undefined);
    assert.equal(unknown.airfreightReferenceEvidence?.publication.contentSha256, run.airfreightReferenceEvidence?.publication.contentSha256);
  } finally { globalThis.fetch = originalFetch }
});

Deno.test("airport input and unavailable publication never append a guessed calculation", async () => {
  const originalFetch = globalThis.fetch, fixture = adminFixture();
  const saved = { ...draft(), loadingLocationId: "", importAdjustments: [{ id: "import-air", code: "AR", amount: "300", currency: "GBP" }] };
  let requests = 0;
  globalThis.fetch = () => { requests++; return Promise.resolve(new Response("Unavailable", { status: 503 })) };
  try {
    await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, saved), status(422));
    assert.equal(requests, 0);
    saved.loadingLocationId = "JFK";
    await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, saved), status(503));
    assert.equal(fixture.calls.length, 0);
  } finally { globalThis.fetch = originalFetch }
});

Deno.test("national VAT expenses fail closed on missing, changed or oversized publications", async () => {
  await assert.rejects(() => verifyVatExpensePublication("<h2>Missing section</h2>"));
  await assert.rejects(() => verifyVatExpensePublication('<h2 id="incidental-expenses--simplified-arrangements">Changed rate £999</h2><h2>Next section</h2>'));
  const originalFetch = globalThis.fetch, fixture = adminFixture();
  const saved = { ...draft(), importAdjustments: [{ id: "import-vat", code: "AV", amount: "100", currency: "GBP" }] };
  Object.assign(saved.dutyCalculationSetup, { costs: { "import-vat": { vatExpense: { method: "national" } } } });
  try {
    globalThis.fetch = () => Promise.resolve(new Response("Unavailable", { status: 503 }));
    await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, saved), status(503));
    assert.equal(fixture.calls.length, 0);
    globalThis.fetch = () => Promise.resolve(new Response("x".repeat(1_000_001)));
    await assert.rejects(() => fetchVatExpensePublication(), /exceeds/);
  } finally { globalThis.fetch = originalFetch }
});

Deno.test("inactive national expense worksheets do not fetch rates or alter actual-cost evidence", async () => {
  const originalFetch = globalThis.fetch, fixture = adminFixture();
  const saved = { ...draft(), importAdjustments: [{ id: "import-vat", code: "AV", amount: "75", currency: "GBP" }] };
  Object.assign(saved.dutyCalculationSetup, { costs: { "import-vat": { evidence: "Actual expense invoice fixture", includedInPrice: false, vatExpense: { method: "actual", group: "air", consignmentReference: "Retained worksheet fixture", weightKg: "300" } } } });
  const before = JSON.stringify(saved);
  globalThis.fetch = () => { throw new Error("Actual costs must not fetch a national expense schedule") };
  try {
    const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
    assert.deepEqual(run.result.totals, { duty: "120.00", vat: "239.00" });
    assert.equal(run.vatExpensePublication, null);
    assert.equal(JSON.stringify(saved), before);
    assert.deepEqual(fixture.calls[0].args.p_draft, saved);
    assert.equal(fixture.calls.length, 1);
  } finally { globalThis.fetch = originalFetch }
});

Deno.test("calculation preflight rejects before provider or persistence access", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw new Error("Unexpected network access") };
  try {
    for (const patch of [{ direction: "export" }, { items: [] }, { items: [{ ...draft().items[0], invoiceHeaderId: "missing" }] }, { dutyCalculationSetup: {} }]) {
      const fixture = adminFixture();
      await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, { ...draft(), ...patch }), status(422));
      assert.equal(fixture.calls.length, 0);
    }
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = originalFetch }
});

Deno.test("saved calculation preserves the original draft and records dated estimate evidence through the audit RPC", async () => {
  const fixture = adminFixture(), saved = draft(), before = JSON.stringify(saved);
  const result = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.deepEqual(result.result.totals, { duty: "120.00", vat: "224.00" });
  assert.equal(result.result.date, ukCustomsDate());
  assert.equal(result.result.version, CALCULATION_VERSION);
  assert.equal(result.result.autoPopulationAllowed, false);
  assert.equal(result.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].name, "customs_append_calculation");
  assert.equal(fixture.calls[0].args.p_actor, actor);
  assert.equal(fixture.calls[0].args.p_declaration, declaration);
  assert.equal(fixture.calls[0].args.p_draft, saved);
  assert.equal(result.tariffReferenceEvidence.format, "tariff-reference-evidence-v1");
});

Deno.test("GB processing basis is retained by the authorised service without approving taxes", async () => {
  const base = draft();
  const policy = { exceptedGoods: false, additionalDuty: false, nonTariffOrAgriculturalMeasure: false, guaranteeRequired: false };
  const saved = { ...base, items: [{ ...base.items[0], procedureCode: "4051" }], dutyCalculationSetup: { ...base.dutyCalculationSetup, gbProcessingBasis: { item: {
    date: ukCustomsDate(), jurisdiction: "GB", originalBasisElected: true, regulation22Breach: false, holderReimportWithinOneYear: false, economicExaminationRequired: false, entryPolicy: policy, authorisationPolicy: policy, paragraph6Exception: false, sensitiveGoods: false, calendarYearClassificationValueGbp: "1000", evidence: "Synthetic authorisation review only",
  } } } };
  const before = structuredClone(saved), fixture = adminFixture();
  const result = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.equal(result.result.gbProcessingBasisReviews?.[0].result?.basis, "original-goods-required");
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof result).result.gbProcessingBasisReviews, result.result.gbProcessingBasisReviews);
  assert.deepEqual(saved, before);
  assert.equal(result.result.totals, null);
  assert.equal(result.submissionFieldsChanged, false);
  for (const change of ["date", "procedure", "jurisdiction", "deleted"]) {
    const invalid = structuredClone(saved);
    if (change === "date") invalid.dutyCalculationSetup.gbProcessingBasis.item.date = "2000-01-01";
    if (change === "procedure") invalid.items[0].procedureCode = "4000";
    if (change === "jurisdiction") invalid.dutyCalculationSetup.gbProcessingBasis.item.jurisdiction = "NI";
    if (change === "deleted") invalid.items[0].id = "another-item";
    const rejected = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, invalid);
    assert.ok(rejected.result.gbProcessingBasisReviews?.[0].issues.length || rejected.result.gbProcessingBasisReviews?.[0].result?.issues.length);
    assert.equal(rejected.result.gbProcessingBasisReviews?.[0].result?.basis ?? null, null);
  }
  await assert.rejects(() => calculateSavedDeclaration(adminFixture(null, { code: "42501" }).admin, actor, declaration, saved), status(403));
});

Deno.test("GB processed-products release uses official measures only after the complete basis and discharge review", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-co-20260915.json", import.meta.url)));
  const base = draft(), date = ukCustomsDate(), fixture = adminFixture();
  const policy = { exceptedGoods: false, additionalDuty: false, nonTariffOrAgriculturalMeasure: false, guaranteeRequired: false };
  const saved = { ...base, declarationCategory: "H1", declarationType: "A", items: [{ ...base.items[0], procedureCode: "4051", commodityCode: "7323930010", nonPreferentialOrigin: "CO", additionalProcedureCode: "000", taxAmount: "999" }], dutyCalculationSetup: { ...base.dutyCalculationSetup, rateSource: "official", gbProcessingBasis: { item: {
    date, jurisdiction: "GB", originalBasisElected: false, regulation22Breach: false, holderReimportWithinOneYear: false, economicExaminationRequired: false, entryPolicy: policy, authorisationPolicy: policy, paragraph6Exception: false, sensitiveGoods: false, calendarYearClassificationValueGbp: "1000", evidence: "Synthetic complete policy review",
    processedRelease: { entryDate: "2026-09-01", entryReference: "Synthetic entry", authorisationEvidence: "Synthetic authorised product basis", dischargeEvidence: "Synthetic compliant discharge, quantities and yield", valuationEvidence: "Synthetic product invoice and eligible costs", noPriorTaxPaymentConfirmed: true, noEquivalenceOrCombinedReliefConfirmed: true },
  } } } };
  const provider = (request: TariffRequest) => Promise.resolve(parseTariffSnapshot(raw, { ...request, date: "2026-09-15" }, "2026-09-15T12:00:00Z"));
  const before = structuredClone(saved), run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  if (date === "2026-09-15") {
    assert.deepEqual(run.result.totals, { duty: "32.00", vat: "206.40" }, JSON.stringify(run.result.lines));
    assert.match(run.input.items[0].procedureEvidence ?? "", /GB processed-products release/);
    assert.ok(run.input.items[0].measures[0].evidence.some(value => value.includes("20050020")), "unclaimed preferential quota remains in evidence");
  } else assert.equal(run.result.totals, null);
  assert.deepEqual(saved, before);
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.equal(run.submissionFieldsChanged, false);
  assert.deepEqual(fixture.calls[0].args.p_draft, before);
  for (const change of ["elected", "incomplete", "credit", "F44", "date", "manual"]) {
    const invalid = structuredClone(saved);
    if (change === "elected") invalid.dutyCalculationSetup.gbProcessingBasis.item.originalBasisElected = true;
    if (change === "incomplete") invalid.dutyCalculationSetup.gbProcessingBasis.item.processedRelease.valuationEvidence = "";
    if (change === "credit") invalid.dutyCalculationSetup.gbProcessingBasis.item.processedRelease.noPriorTaxPaymentConfirmed = false;
    if (change === "F44") invalid.items[0].additionalProcedureCode = "F44";
    if (change === "date") invalid.dutyCalculationSetup.gbProcessingBasis.item.date = "2000-01-01";
    if (change === "manual") invalid.dutyCalculationSetup.rateSource = "operator";
    const rejected = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, invalid, provider);
    assert.equal(rejected.result.totals, null);
  }
  await assert.rejects(() => calculateSavedDeclaration(adminFixture(null, { code: "42501" }).admin, actor, declaration, saved, provider), status(403));
});

Deno.test("processing consumption is audited without substituting original values for product prices", async () => {
  const base = draft();
  const saved = { ...base, items: [{ ...base.items[0], procedureCode: "4051", itemPrice: "2500" }], dutyCalculationSetup: { ...base.dutyCalculationSetup, processingInputs: {
    jurisdiction: "GB", lots: [{ id: "cloth", entryReference: "synthetic-entry", entryItemReference: "1", quantity: "300", unit: "MTR", originalCustomsValueGbp: "1000", previouslyDischargedQuantity: "60", evidence: "Synthetic retained entry and previous discharge" }],
    consumption: [{ inputLotId: "cloth", outputItemId: "item", quantity: "100", unit: "MTR", yieldEvidence: "Synthetic consumption review" }],
  } } };
  const before = structuredClone(saved), fixture = adminFixture();
  const result = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.deepEqual(result.result.processingInputAllocation?.result?.allocations[0].allocations[0].originalCustomsValueGbp, { numerator: "1000", denominator: "3" });
  assert.deepEqual(saved, before);
  assert.deepEqual(fixture.calls[0].args.p_draft, before);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof result).result.processingInputAllocation, result.result.processingInputAllocation);
  assert.equal(result.result.totals, null);
  assert.equal(result.result.autoPopulationAllowed, false);
  assert.equal(result.submissionFieldsChanged, false);
  for (const change of ["jurisdiction", "missing-item", "procedure", "overuse"]) {
    const invalid = structuredClone(saved);
    if (change === "jurisdiction") invalid.dutyCalculationSetup.processingInputs.jurisdiction = "NI";
    if (change === "missing-item") invalid.dutyCalculationSetup.processingInputs.consumption[0].outputItemId = "deleted";
    if (change === "procedure") invalid.items[0].procedureCode = "4000";
    if (change === "overuse") invalid.dutyCalculationSetup.processingInputs.consumption[0].quantity = "241";
    const rejected = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, invalid);
    assert.equal(rejected.result.processingInputAllocation?.result, null);
    assert.ok(rejected.result.processingInputAllocation?.issues.length);
  }
  await assert.rejects(() => calculateSavedDeclaration(adminFixture(null, { code: "42501" }).admin, actor, declaration, saved), status(403));
});

Deno.test("temporary admission duty worksheets use the audited calculation operation without changing liabilities", async () => {
  const source = draft(), fixture = adminFixture();
  const saved = { ...source, items: source.items.map(item => ({ ...item, procedureCode: "5300", taxAmount: "999.00" })), dutyCalculationSetup: { ...source.dutyCalculationSetup, temporaryAdmission: { item: {
    jurisdiction: "GB", event: "entry", entryAssessmentId: "Synthetic original assessment", entryItemId: "original-item", entryDutyGbp: "1000", fullAuthorisationEvidence: "Synthetic full authorisation", eligibilityEvidence: "Reviewed fixture", periodEvidence: "First chargeable period", chargeableMonths: 1, previouslyAssessedDutyGbp: "0", previousAssessmentEvidence: "No earlier assessment — fixture",
  } } } };
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.equal(run.result.temporaryAdmissionLedgers?.[0].result?.additionalDuty.displayedGbp, "30.00");
  assert.equal(run.result.totals, null);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(fixture.calls[0].name, "customs_append_calculation");
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved), status(403));
});

Deno.test("TA release assessment balances are audited by tax type without changing declared tax", async () => {
  const source = draft(), fixture = adminFixture();
  const saved = { ...source, items: source.items.map(item => ({ ...item, procedureCode: "4053", taxAmount: "999.00" })), dutyCalculationSetup: { ...source.dutyCalculationSetup, temporaryAdmissionRelease: { item: {
    jurisdiction: "GB", procedure: "4053", entryReference: "Synthetic entry", entryItemReference: "1", authorisationEvidence: "Synthetic authority", releaseAssessmentReference: "Synthetic release assessment", taxes: [
      { taxType: "A00", releaseLiabilityGbp: "1000", previouslyPaidGbp: "120", paymentEvidence: "Synthetic duty receipt" },
      { taxType: "B00", releaseLiabilityGbp: "2200", previouslyPaidGbp: "2100", paymentEvidence: "Synthetic VAT receipt" },
    ],
  } } } };
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.deepEqual(run.result.temporaryAdmissionReleases?.[0].result?.taxes.map(row => row.remaining.displayedGbp), ["880.00", "100.00"]);
  const duplicate = structuredClone(saved);
  duplicate.items.push({ ...duplicate.items[0], id: "second" });
  Object.assign(duplicate.dutyCalculationSetup.temporaryAdmissionRelease, { second: { ...duplicate.dutyCalculationSetup.temporaryAdmissionRelease.item, entryReference: " synthetic ENTRY ", entryItemReference: "01" } });
  const duplicateRun = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, duplicate);
  assert.equal(duplicateRun.result.temporaryAdmissionReleases?.length, 2);
  assert.ok(duplicateRun.result.temporaryAdmissionReleases?.every(row => row.result === null && row.issues.some(issue => issue.includes("same payment twice"))));
  const distinct = structuredClone(duplicate);
  (distinct.dutyCalculationSetup.temporaryAdmissionRelease as Record<string, typeof saved.dutyCalculationSetup.temporaryAdmissionRelease.item>).second.entryItemReference = "2";
  const distinctRun = await calculateSavedDeclaration(adminFixture().admin, actor, declaration, distinct);
  assert.ok(distinctRun.result.temporaryAdmissionReleases?.every(row => row.result?.taxes[0].remaining.displayedGbp === "880.00"));
  assert.equal(run.result.totals, null);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved), status(403));
});

Deno.test("NI partial-discharge evidence is audited through the same permission-controlled service", async () => {
  const source = draft(), fixture = adminFixture();
  const saved = { ...source, items: source.items.map(item => ({ ...item, procedureCode: "7153", taxAmount: "999.00" })), dutyCalculationSetup: { ...source.dutyCalculationSetup, jurisdiction: "NI", temporaryAdmission: { item: {
    jurisdiction: "NI", event: "discharge", entryAssessmentId: "Synthetic NI entry", entryItemId: "original-item", entryDutyGbp: "720", fullAuthorisationEvidence: "Synthetic NI authorisation", eligibilityEvidence: "Reviewed fixture", periodEvidence: "Three reviewed periods", chargeableMonths: 3, previouslyAssessedDutyGbp: "0", previousAssessmentEvidence: "No earlier assessment — fixture", niEntryBasisEvidence: "Retained original NI tariff and risk review in GBP",
  } } } };
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.equal(run.result.temporaryAdmissionLedgers?.[0].result?.additionalDuty.displayedGbp, "64.80");
  assert.equal(run.result.totals, null);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  const denied = adminFixture(null, { code: "42501" });
  await assert.rejects(() => calculateSavedDeclaration(denied.admin, actor, declaration, saved), status(403));
});

Deno.test("audit failure never returns calculation success", async () => {
  for (const [code, expected] of [["40001", 409], ["42501", 403], ["unavailable", 503]] as const) {
    const fixture = adminFixture(null, { code });
    await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, draft()), status(expected));
    assert.equal(fixture.calls.length, 1);
  }
});

Deno.test("saved preference and national VAT claims use official measures and retain reviewed proof", async () => {
  const source = draft(), fixture = adminFixture(), today = ukCustomsDate();
  const saved = { ...source, items: source.items.map(item => ({ ...item, procedureCode: "4000", preferenceCode: "300", commodityCode: "6203423100", nonPreferentialOrigin: "MA", preferentialOrigin: "MA", nationalCode: "" })), dutyCalculationSetup: { ...source.dutyCalculationSetup, rateSource: "official", preferences: { item: { preferenceCode: "300", origin: "MA", dataset: "uk", validFrom: today, validTo: today, proofReference: "Synthetic origin proof", originRulesEvidence: "Synthetic agreement and origin review", transportEvidence: "Synthetic non-alteration review" } }, vatReviews: { item: { code: "VATZ", evidence: "Synthetic zero-rate eligibility review" } } } };
  const provider = async (request: TariffRequest): Promise<TariffSnapshot> => ({ request, sourceUrl: "https://api.trade-tariff.service.gov.uk/uk/api/commodities/6203423100", retrievedAt: new Date().toISOString(), raw: { fixture: "Not certification" }, commodity: { id: "commodity", type: "commodity", attributes: {} }, measures: [
    ["mfn", "103", "100", "12", false], ["preference", "142", "300", "5", false], ["vat", "305", undefined, "20", true], ["zero", "305", undefined, "0", true],
  ].map(([id, type, preference, rate, vat]) => ({ id: String(id), typeCode: String(type), preferenceCode: preference as string | undefined, description: String(type), series: vat ? "P" : "C", area: "MA", start: today, end: null, vat: !!vat, excise: false, dutyExpression: "", conditions: [], footnotes: [], additionalCode: id === "zero" ? { id: "vat-code", type: "additional_code", attributes: { code: "VATZ" } } : null, orderNumber: null, excludedCountries: [], unresolved: [], percentage: String(rate), legalActs: [{ id: "law", type: "legal_act", attributes: { description: "Synthetic law fixture" } }], components: [{ id: `${id}-01`, type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: rate } }] })) });
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  assert.deepEqual(run.result.totals, { duty: "50.00", vat: "210.00" });
  assert.match(run.input.items[0].preferenceEvidence!, /Synthetic origin proof/);
  assert.equal(run.tariffReferenceEvidence.snapshots[0].snapshot.measures[1].preferenceCode, "300");
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual((fixture.calls[0].args.p_evidence as typeof run).result, run.result);
  saved.items[0].nationalCode = "VATZ";
  const zero = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider);
  assert.deepEqual(zero.result.totals, { duty: "50.00", vat: "0.00" });
  saved.dutyCalculationSetup.vatReviews.item.evidence = "";
  assert.equal((await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider)).result.totals, null);
  saved.items[0].preferentialOrigin = "CN";
  assert.equal((await calculateSavedDeclaration(fixture.admin, actor, declaration, saved, provider)).result.totals, null);
});

Deno.test("warehouse service retains evidence and suspended liabilities without changing import filing fields", async () => {
  const source = draft(), today = ukCustomsDate(), fixture = adminFixture();
  const saved = {
    ...source, declarationCategory: "H2", declarationType: "A", warehouseType: "U", warehouseIdentifier: "warehouse-fixture",
    authorisationCategory: "CWP", authorisationIdentifier: "GB123456789000",
    items: source.items.map(item => ({ ...item, procedureCode: "7100", additionalProcedureCode: "000", taxAmount: "999.00" })),
    dutyCalculationSetup: { ...source.dutyCalculationSetup, warehouseEntry: {
      event: "entry", warehouseCountry: "GB", warehouseIdentifier: "warehouse-fixture", authorisationNumber: "CWP-fixture",
      holderEori: "GB123456789000", validFrom: today, validTo: today,
      activeAuthorisationEvidence: "Active decision fixture", goodsCoveredEvidence: "Goods covered fixture",
      entryConditionsEvidence: "Unchanged goods, entry conditions fixture", securityReviewEvidence: "Security reviewed fixture", representation: "holder",
    } },
  };
  const before = JSON.stringify(saved);
  const run = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.equal(run.result.lines[0].taxes[0].amount, "120.00");
  assert.equal(run.result.lines[0].taxes[0].disposition, "suspended");
  assert.equal(run.result.lines[0].vatLiability?.amount, "224.00");
  assert.deepEqual(run.result.totals, { duty: "0.00", vat: "0.00" });
  assert.equal(run.result.autoPopulationAllowed, false);
  assert.equal(run.submissionFieldsChanged, false);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].name, "customs_append_calculation");
  assert.deepEqual(fixture.calls[0].args.p_draft, saved);
  const audit = fixture.calls[0].args.p_evidence as typeof run;
  assert.deepEqual(audit.result, run.result);
  assert.match(audit.input.items[0].procedureEvidence!, /CWP-fixture/);
  const officialFixture = adminFixture();
  const official = { ...saved, items: saved.items.map(item => ({ ...item, commodityCode: "8536909500", nonPreferentialOrigin: "CN" })), dutyCalculationSetup: { ...saved.dutyCalculationSetup, rateSource: "official", items: { item: { tariffQuantities: [{ quantity: "30", unit: "KGM", evidence: "Synthetic warehouse quantity fixture" }] } } } };
  const officialBefore = JSON.stringify(official);
  const provider = async (request: TariffRequest): Promise<TariffSnapshot> => ({
    request, sourceUrl: "https://www.trade-tariff.service.gov.uk/uk/api/commodities/8536909500", retrievedAt: new Date().toISOString(),
    raw: { fixture: "Synthetic warehouse compound service contract, not an actual tariff rate" }, commodity: { id: "commodity", type: "commodity", attributes: {} },
    measures: [false, true].map(vat => ({ id: vat ? "vat" : "duty", typeCode: vat ? "305" : "103", description: vat ? "VAT" : "Compound duty", series: "", area: "1011", start: today, end: null, vat, excise: false, dutyExpression: "", conditions: [], footnotes: [], additionalCode: null, orderNumber: null, excludedCountries: [], unresolved: [], percentage: vat ? "20" : null,
      components: vat ? [{ id: "vat-component", type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: "20" } }] : [
        { id: "percent-component", type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: "5" } },
        { id: "specific-component", type: "measure_component", attributes: { duty_expression_id: "04", duty_amount: "2", monetary_unit_code: "GBP", measurement_unit_code: "KGM" } },
      ],
    })),
  });
  const compound = await calculateSavedDeclaration(officialFixture.admin, actor, declaration, official, provider);
  assert.deepEqual(compound.result.totals, { duty: "0.00", vat: "0.00" }, JSON.stringify(compound.result));
  assert.equal(compound.result.lines[0].taxes[0].amount, "110.00");
  assert.equal(compound.result.lines[0].taxes[0].disposition, "suspended");
  assert.equal(compound.result.lines[0].vatLiability?.amount, "222.00");
  assert.equal(compound.submissionFieldsChanged, false);
  assert.equal(compound.result.autoPopulationAllowed, false);
  assert.equal(JSON.stringify(official), officialBefore);
  assert.equal(officialFixture.calls.length, 1);
  assert.deepEqual((officialFixture.calls[0].args.p_evidence as typeof compound).result, compound.result);
  saved.dutyCalculationSetup.warehouseEntry.activeAuthorisationEvidence = "";
  const incomplete = await calculateSavedDeclaration(fixture.admin, actor, declaration, saved);
  assert.equal(incomplete.result.totals, null);
  assert.equal(incomplete.result.lines[0].vatLiability, undefined);
  assert.ok(incomplete.result.issues.some(issue => issue.includes("current authorisation status")));
  assert.equal(fixture.calls.length, 2);
  assert.equal(saved.items[0].taxAmount, "999.00");
  saved.direction = "export";
  await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, saved), status(422));
  assert.equal(fixture.calls.length, 2);
});

Deno.test("unavailable HMRC references preserve the saved draft without appending an invented result", async () => {
  const fixture = adminFixture(), saved = draft();
  saved.invoiceHeaders[0].currency = "USD";
  const before = JSON.stringify(saved), originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; return Promise.resolve(new Response("Unavailable", { status: 503 })) };
  try {
    await assert.rejects(() => calculateSavedDeclaration(fixture.admin, actor, declaration, saved), status(503));
    assert.equal(fetchCalls, 1);
    assert.equal(fixture.calls.length, 0);
    assert.equal(JSON.stringify(saved), before);
  } finally { globalThis.fetch = originalFetch }
});

Deno.test("override enforces current date and rules before append and keeps original and replacement amounts separate", async () => {
  const result = { date: ukCustomsDate(), version: CALCULATION_VERSION, precisionPolicy: PRECISION_POLICY, lines: [{ itemId: "item", duty: "120.00", vat: "224.00" }] };
  const payload = { calculationId: calculation, itemId: "item", duty: "121.00", vat: "224.20", reason: "Reviewed supporting evidence fixture" };
  const exportFixture = adminFixture({ evidence: { result } });
  await assert.rejects(() => overrideCalculation(exportFixture.admin, actor, declaration, { ...draft(), direction: "export" }, payload), status(422));
  assert.equal(exportFixture.calls.length, 0);
  assert.equal(exportFixture.filters.length, 0);
  for (const patch of [{ date: "2000-01-01" }, { version: "historic-version" }, { precisionPolicy: "historic-precision" }]) {
    const fixture = adminFixture({ evidence: { result: { ...result, ...patch } } });
    await assert.rejects(() => overrideCalculation(fixture.admin, actor, declaration, draft(), payload), status(409));
    assert.equal(fixture.calls.length, 0);
    assert.ok(fixture.filters.some(([key, value]) => key === "declaration_id" && value === declaration));
  }
  const fixture = adminFixture({ evidence: { result } });
  const override = await overrideCalculation(fixture.admin, actor, declaration, draft(), payload);
  assert.deepEqual(override.original, { duty: "120.00", vat: "224.00" });
  assert.deepEqual(override.replacement, { duty: "121.00", vat: "224.20" });
  assert.equal(override.submissionFieldsChanged, false);
  assert.equal(fixture.calls[0].args.p_parent, calculation);
  assert.equal(fixture.calls[0].args.p_kind, "override");
  const superseded = adminFixture({ evidence: { result } }, { code: "40001" });
  await assert.rejects(() => overrideCalculation(superseded.admin, actor, declaration, draft(), payload), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.match(error.message, /Reload calculation history and review the latest workings/);
    return true;
  });
  assert.equal(superseded.calls.length, 1);
});
