import assert from "node:assert/strict";
import { customsCalculationActionRequest, executeCustomsCalculationAction, RECORD_CUSTOMS_ASSESSMENT_ACTION } from "./customs-calculation-actions.ts";
const args = { target_id: "00000000-0000-0000-0000-000000000001", source_id: "00000000-0000-0000-0000-000000000002", reason: "Compare retained assessment evidence" };
Deno.test("assessment action sends only a retained source ID to the shared service", async () => {
  const request = customsCalculationActionRequest(RECORD_CUSTOMS_ASSESSMENT_ACTION, { ...args, duty: "999", path: "/submit" });
  assert.equal(request.path, `/declarations/${args.target_id}/assessment-comparisons`);
  assert.deepEqual(request.body, { sourceId: args.source_id });
  let called = false;
  const result = await executeCustomsCalculationAction(RECORD_CUSTOMS_ASSESSMENT_ACTION, args, { url: "https://example.invalid", anonKey: "public-test", authorization: "Bearer test" }, ((url: string, init: RequestInit) => {
    called = true;
    assert.equal(url, `https://example.invalid/functions/v1/icustoms-api${request.path}`);
    assert.equal(init.method, "POST"); assert.equal(init.redirect, "error");
    assert.deepEqual(JSON.parse(init.body as string), { sourceId: args.source_id });
    return Promise.resolve(Response.json({ id: "saved-comparison" }));
  }) as typeof fetch);
  assert.ok(called); assert.deepEqual(result, { data: { id: "saved-comparison" }, error: null });
});
Deno.test("missing evidence identity and permission failures cannot report a recorded comparison", async () => {
  assert.throws(() => customsCalculationActionRequest(RECORD_CUSTOMS_ASSESSMENT_ACTION, { ...args, source_id: "bad" }));
  assert.throws(() => customsCalculationActionRequest(RECORD_CUSTOMS_ASSESSMENT_ACTION, { ...args, reason: "" }));
  assert.throws(() => customsCalculationActionRequest("submit", args));
  const result = await executeCustomsCalculationAction(RECORD_CUSTOMS_ASSESSMENT_ACTION, args, { url: "https://example.invalid", anonKey: "public-test", authorization: "Bearer test" }, (() => Promise.resolve(Response.json({ detail: "Unavailable" }, { status: 403 }))) as typeof fetch);
  assert.equal(result.data, null); assert.equal(result.error?.code, "calculation_403");
});
