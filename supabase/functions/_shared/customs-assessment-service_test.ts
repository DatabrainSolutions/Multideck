import assert from "node:assert/strict";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { recordAssessmentComparison, assessmentComparisonHistory } from "./customs-assessment-service.ts";
import { HttpError } from "./backend.ts";

const sourceId = "00000000-0000-0000-0000-000000000001", calculationId = "00000000-0000-0000-0000-000000000002";
function fixture(options: { noLink?: boolean; foreign?: boolean; readError?: boolean; writeError?: boolean } = {}) {
  const calls: unknown[][] = [], draft = { direction: "import", items: [{ id: "one" }] }, capturedAt = "2026-09-15T10:00:00Z";
  const source = { id: sourceId, declaration_snapshot: { schemaVersion: 1, capturedAt, declaration: { id: "declaration", genericPayload: draft },
    calculationLink: options.noLink ? undefined : { schemaVersion: 1, checkedAt: capturedAt, calculationId, state: "linked-estimate", reasons: [] },
    items: [{ itemNumber: 1, payload: { id: "one" } }] },
    response_payload: { notification: [{ notification_id: "notice", hmrc_response: {
      Response: { FunctionCode: "13", Status: { NameCode: "67" }, Declaration: {
        GoodsShipment: { GovernmentAgencyGoodsItem: { SequenceNumeric: "1", Commodity: {
          DutyTaxFee: { TypeCode: "A00", Payment: { TaxAssessedAmount: "12" } },
        } } },
      } },
    } }] } };
  const saved = { id: calculationId, declaration_id: options.foreign ? "other" : "declaration", kind: "calculation", created_at: "2026-09-15T09:00:00Z", draft_snapshot: draft,
    evidence: { result: { lines: [], issues: [], totals: null } } };
  const admin = { from: (table: string) => {
    calls.push(["from", table]);
    const query = {
      select: (_: string) => query, eq: (key: string, value: unknown) => { calls.push(["eq", key, value]); return query; },
      order: (_: string, __: unknown) => query, limit: (value: number) => { calls.push(["limit", value]); return query; },
      or: (value: string) => { calls.push(["or", value]); return query; },
      maybeSingle: () => Promise.resolve({ data: table === "Customs_ProviderResponseHistory" ? source : saved, error: options.readError ? { message: "PRIVATE" } : null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: options.readError ? { message: "PRIVATE" } : null }).then(resolve),
    }; return query;
  }, rpc: (name: string, args: unknown) => { calls.push(["rpc", name, args]); return Promise.resolve({ data: "comparison-id", error: options.writeError ? { code: "42501", message: "PRIVATE" } : null }); } } as unknown as SupabaseClient;
  return { admin, calls, source, saved };
}

// Synthetic retained-response evidence: no provider call or customs submission.
function niRetainedFixture() {
  const f = fixture();
  const taxes = [
    { TypeCode: "A50", TaxRateNumeric: "12", AdValoremTaxBaseAmount: "1500.00", amount: "180.00" },
    { TypeCode: "B00", TaxRateNumeric: "20", AdValoremTaxBaseAmount: "1900.00", amount: "380.00" },
    { TypeCode: "B05", TaxRateNumeric: "20", AdValoremTaxBaseAmount: "180.00", amount: "36.00" },
  ].map(({ amount, ...tax }) => ({ ...tax, DutyRegimeCode: "100", DeductAmount: "0", Payment: { TaxAssessedAmount: amount, PaymentAmount: amount } }));
  const xml = `<Response><FunctionCode>13</FunctionCode><Status><NameCode>4</NameCode></Status><Declaration><GoodsShipment><GovernmentAgencyGoodsItem><SequenceNumeric>1</SequenceNumeric><Commodity>${[...taxes].reverse().map(t => `<DutyTaxFee><TypeCode>${t.TypeCode}</TypeCode><DutyRegimeCode>100</DutyRegimeCode><DeductAmount currencyID="GBP">0</DeductAmount><TaxRateNumeric unitCode="P1">${t.TaxRateNumeric}</TaxRateNumeric><AdValoremTaxBaseAmount currencyID="GBP">${t.AdValoremTaxBaseAmount}</AdValoremTaxBaseAmount><Payment><TaxAssessedAmount currencyID="GBP">${t.Payment.TaxAssessedAmount}</TaxAssessedAmount><PaymentAmount currencyID="GBP">${t.Payment.PaymentAmount}</PaymentAmount></Payment></DutyTaxFee>`).join("")}</Commodity></GovernmentAgencyGoodsItem></GoodsShipment></Declaration></Response>`;
  Object.assign(f.source.response_payload.notification[0], { hmrc_xml_response: xml, hmrc_response: { Response: { FunctionCode: "13", Status: { NameCode: "4" }, Declaration: { GoodsShipment: { GovernmentAgencyGoodsItem: { SequenceNumeric: "1", Commodity: { DutyTaxFee: taxes } } } } } } });
  Object.assign(f.saved.evidence.result, { version: "fixture", precisionPolicy: "estimate", date: "2026-09-15", autoPopulationAllowed: false, totals: { duty: "180.00", vat: "416.00" }, lines: [{ itemId: "one", status: "estimate", issues: [], duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", taxes: [{ taxType: "A50", amount: "180.00", disposition: "payable", reference: "fixture" }], allocations: [], workings: [], vatTaxes: [{ taxType: "B00", base: "1900.00", amount: "380.00", exact: { numerator: "380", denominator: "1" } }, { taxType: "B05", base: "180.00", amount: "36.00", exact: { numerator: "36", denominator: "1" } }] }] });
  return f;
}

Deno.test("retained NI XML reaches the audit with separate VAT comparisons and unchanged source evidence", async () => {
  const f = niRetainedFixture(), before = JSON.stringify([f.source, f.saved]);
  await recordAssessmentComparison(f.admin, "actor", "declaration", sourceId);
  const write = f.calls.find(c => c[0] === "rpc")![2] as Record<string, any>;
  assert.equal(write.p_evidence.notices[0].comparison.status, "matched");
  assert.deepEqual(write.p_evidence.notices[0].comparison.lines[0].vatTaxDifferences.map((row: any) => row.taxType), ["B00", "B05"]);
  assert.equal(JSON.stringify([f.source, f.saved]), before);
  assert.equal(write.p_calculation, calculationId);
});

Deno.test("conflicting NI retained XML cannot produce a matched audit", async () => {
  const f = niRetainedFixture();
  const notice = f.source.response_payload.notification[0] as unknown as { hmrc_xml_response: string };
  notice.hmrc_xml_response = notice.hmrc_xml_response.replace('currencyID="GBP"', 'currencyID="USD"');
  await recordAssessmentComparison(f.admin, "actor", "declaration", sourceId);
  const write = f.calls.find(c => c[0] === "rpc")![2] as Record<string, any>;
  assert.equal(write.p_evidence.notices[0].comparison, null);
});
Deno.test("records server-derived evidence with its original source and calculation only", async () => {
  const { admin, calls } = fixture();
  assert.deepEqual(await recordAssessmentComparison(admin, "actor", "declaration", sourceId), { id: "comparison-id" });
  assert.equal(calls.filter(c => c[0] === "eq" && c[1] === "declaration_id" && c[2] === "declaration").length, 2);
  const write = calls.find(c => c[0] === "rpc")![2] as Record<string, any>;
  assert.equal(write.p_source, sourceId); assert.equal(write.p_calculation, calculationId); assert.equal(write.p_actor, "actor");
  assert.equal(write.p_evidence.notices[0].status, "needs-information");
  assert.equal(write.p_evidence.notices[0].comparison, null);
});
Deno.test("missing links, mismatched ownership and read failures cannot record a comparison", async () => {
  for (const options of [{ noLink: true }, { foreign: true }, { readError: true }]) {
    const { admin, calls } = fixture(options);
    await assert.rejects(() => recordAssessmentComparison(admin, "actor", "declaration", sourceId), e => e instanceof HttpError && !e.message.includes("PRIVATE"));
    assert.equal(calls.some(c => c[0] === "rpc"), false);
  }
  const { admin, calls } = fixture();
  await assert.rejects(() => recordAssessmentComparison(admin, "actor", "declaration", "bad"), e => e instanceof HttpError && e.status === 422);
  assert.equal(calls.length, 0);
});
Deno.test("failed audit write cannot report success", async () => {
  const { admin } = fixture({ writeError: true });
  await assert.rejects(() => recordAssessmentComparison(admin, "actor", "declaration", sourceId), e => e instanceof HttpError && e.status === 403 && !e.message.includes("PRIVATE"));
});
Deno.test("history is scoped and bounded with validated pagination", async () => {
  const { admin, calls } = fixture();
  assert.deepEqual(await assessmentComparisonHistory(admin, "declaration"), { history: [], nextCursor: null });
  assert.ok(calls.some(c => JSON.stringify(c) === '["eq","declaration_id","declaration"]'));
  assert.ok(calls.some(c => JSON.stringify(c) === '["limit",21]'));
  await assert.rejects(() => assessmentComparisonHistory(admin, "declaration", "injected,filter"), e => e instanceof HttpError && e.status === 422);
  assert.equal(calls.some(c => c[0] === "or"), false);
});
