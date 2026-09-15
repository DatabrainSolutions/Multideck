import assert from "node:assert/strict";
import { quotaClaimIssues } from "./customs-quota-claim.mts";

Deno.test("quota input distinguishes a claim from ordinary treatment and preserves leading zeroes", () => {
  assert.deepEqual(quotaClaimIssues("051867", "320"), []);
  assert.deepEqual(quotaClaimIssues(undefined, "100"), []);
  assert.match(quotaClaimIssues("", "120")[0], /Add the quota/);
  assert.match(quotaClaimIssues("051867", "100")[0], /Match/);
  for (const order of ["51867", "0518670", "<bad>", "05 867"]) assert.ok(quotaClaimIssues(order, "320").length);
  assert.deepEqual(quotaClaimIssues("AB1234", "120"), [], "DE 8/1 is an6, not a numeric amount");
});
Deno.test("GB to NI must not send a DE 8/1 quota number", () => {
  const context = { jurisdiction: "NI", movement: "GB-to-NI" };
  assert.match(quotaClaimIssues("051867", "320", context)[0], /NIQUO/);
  assert.deepEqual(quotaClaimIssues("", "320", context), []);
  assert.ok(quotaClaimIssues("", "320", { jurisdiction: "NI", movement: "rest-of-world-to-NI" }).length);
});
