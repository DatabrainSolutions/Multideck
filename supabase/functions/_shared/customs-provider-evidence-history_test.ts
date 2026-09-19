import assert from "node:assert/strict";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { providerEvidenceHistory } from "./customs-provider-evidence-history.ts";
import { HttpError } from "./backend.ts";

function fixture(error: unknown = null, snapshot: unknown = { declaration: { id: "declaration" } }) {
  const calls: unknown[][] = [];
  const data = Array.from({ length: 6 }, (_, index) => ({ id: `00000000-0000-0000-0000-00000000000${index}`, submission_id: "submission", recorded_at: "2026-09-14T12:00:00.123456Z", source_updated_at: null, capture_kind: "existing-snapshot", response_payload: { bank: "PRIVATE", notification: [] }, declaration_snapshot: snapshot }));
  const query = {
    select: (value: string) => { calls.push(["select", value]); return query; },
    eq: (key: string, value: string) => { calls.push(["eq", key, value]); return query; },
    order: (key: string, value: unknown) => { calls.push(["order", key, value]); return query; },
    limit: (value: number) => { calls.push(["limit", value]); return query; },
    or: (value: string) => { calls.push(["or", value]); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  const admin = { from: (table: string) => { calls.push(["from", table]); return query; } } as unknown as SupabaseClient;
  return { admin, calls };
}
Deno.test("evidence history scopes, bounds and projects records without private envelopes", async () => {
  const { admin, calls } = fixture();
  const result = await providerEvidenceHistory(admin, "declaration");
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "declaration_id", "declaration"])));
  assert.ok(calls.some(call => JSON.stringify(call) === '["limit",6]'));
  assert.equal(result.history.length, 5);
  assert.match(result.nextCursor!, /123456Z\|/);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.ok(result.history.every(row => row.reconciliationReady === false));
  assert.ok(result.history.every(row => row.issues.length === 0));
});
Deno.test("missing or mismatched source declarations never produce attributed tax evidence", async () => {
  for (const snapshot of [null, {}, { declaration: { id: "another-declaration" } }]) {
    const { admin } = fixture(null, snapshot);
    const result = await providerEvidenceHistory(admin, "declaration");
    assert.ok(result.history.every(row => row.notices.length === 0));
    assert.ok(result.history.every(row => row.issues.some(issue => issue.includes("attributed safely"))));
  }
});
Deno.test("invalid cursor cannot enter a database filter", async () => {
  const { admin, calls } = fixture();
  await assert.rejects(() => providerEvidenceHistory(admin, "declaration", "injected,filter"), error => error instanceof HttpError && error.status === 422);
  assert.deepEqual(calls, []);
});
Deno.test("valid cursor retains timestamp precision and errors are not empty success", async () => {
  const { admin, calls } = fixture({ message: "PRIVATE DATABASE DETAIL" });
  await assert.rejects(() => providerEvidenceHistory(admin, "declaration", "2026-09-14T12:00:00.123456Z|00000000-0000-0000-0000-000000000004"), error => error instanceof HttpError && error.status === 503 && !error.message.includes("PRIVATE"));
  assert.ok(calls.some(call => call[0] === "or" && String(call[1]).includes("recorded_at.lt.2026-09-14T12:00:00.123456Z")));
});

Deno.test("linked calculation lookup is declaration-scoped, bounded and fails without leaking database errors", async () => {
  const id = "00000000-0000-0000-0000-000000000001", capturedAt = "2026-09-15T10:00:00Z";
  const base = fixture(null, { schemaVersion: 1, capturedAt, declaration: { id: "declaration" }, calculationLink: { schemaVersion: 1, checkedAt: capturedAt, calculationId: id, state: "linked-estimate", reasons: [] } });
  const calls: unknown[][] = [];
  const query = {
    select: (_: string) => query, eq: (key: string, value: string) => { calls.push([key, value]); return query; },
    in: (key: string, value: unknown) => { calls.push([key, value]); return query; },
    limit: (value: number) => { calls.push(["limit", value]); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "PRIVATE" } }).then(resolve),
  };
  const admin = { from: (table: string) => table === "Customs_CalculationAudit" ? query : base.admin.from(table) } as unknown as SupabaseClient;
  await assert.rejects(() => providerEvidenceHistory(admin, "declaration"), error => error instanceof HttpError && error.status === 503 && !error.message.includes("PRIVATE"));
  assert.deepEqual(calls, [["declaration_id", "declaration"], ["kind", "calculation"], ["id", [id]], ["limit", 5]]);
});
