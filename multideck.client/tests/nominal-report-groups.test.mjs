import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
const require = createRequire(new URL("../package.json", import.meta.url))
const { transformSync } = require("esbuild")
const source = readFileSync(new URL("../src/lib/nominal-report-groups.ts", import.meta.url), "utf8")
const { groupProfitLoss } = await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: "ts", format: "esm", target: "es2022" }).code).toString("base64")}`)
const groups = [{ id: "cost", legal_entity_id: "entity", code: "1010.20.00", name: "Freight costs", kind: "cost" }]
const members = [{ account_id: "actual", group_id: "cost", role: "actual" }, { account_id: "accrued", group_id: "cost", role: "accrued" }]
const row = (accountId, amount, category = "direct_cost") => ({ accountId, amount, accountCode: accountId === "actual" ? "0010.20.10" : "0010.20.20", accountName: accountId, category })
const run = (rows, total, gs = groups, ms = members) => groupProfitLoss("entity", rows, gs, ms, total)

test("actual plus accrued contributes once, retaining dotted and leading-zero source codes", () => {
  const rows = [row("actual", -96), row("accrued", -4), row("legacy", -7)]
  const before = structuredClone(rows)
  const result = run(rows, -107)
  assert.equal(result.groups[0].actual, -96)
  assert.equal(result.groups[0].accrued, -4)
  assert.equal(result.groups[0].total, -100)
  assert.equal(result.total, -107)
  assert.equal(result.groups[0].accounts[0].accountCode, "0010.20.10")
  assert.deepEqual(result.ungrouped, [rows[2]])
  assert.deepEqual(rows, before)
})
test("period relief may be positive and is not labelled lifetime outstanding", () => {
  const result = run([row("actual", -96), row("accrued", 100)], 4)
  assert.equal(result.groups[0].total, 4)
  assert.equal(result.groups[0].accrued, 100)
})
test("revenue, manual adjustments and four-decimal values reconcile without guessing roles", () => {
  const revenue = [{ ...groups[0], kind: "revenue" }]
  const result = run([row("actual", 0.1, "income"), row("accrued", 0.2, "income"), row("adjustment", -0.0001, "finance")], 0.2999, revenue)
  assert.equal(result.groups[0].total, 0.3)
  assert.equal(result.total, 0.2999)
  assert.equal(result.ungrouped[0].accountId, "adjustment")
})
test("no activity on one member means zero movement; an empty report stays empty", () => {
  assert.equal(run([row("actual", -10)], -10).groups[0].accrued, 0)
  assert.deepEqual(run([], 0), { groups: [], ungrouped: [], total: 0 })
})
test("missing or duplicate group membership and foreign entity metadata fail closed", () => {
  assert.throws(() => run([], 0, groups, members.slice(0, 1)), /needs an actual/)
  assert.throws(() => run([], 0, groups, [...members, members[0]]), /inconsistent/)
  assert.throws(() => run([], 0, [{ ...groups[0], legal_entity_id: "foreign" }]), /legal entity/)
  assert.throws(() => run([], 0, [...groups, groups[0]]), /legal entity/)
  assert.throws(() => run([], 0, groups, [{ ...members[0], group_id: "unknown" }, members[1]]), /inconsistent/)
})
test("BS rows, duplicate accounts and changed classifications cannot silently alter P&L", () => {
  assert.throws(() => run([row("actual", 1, "asset")], 1), /balance-sheet/)
  assert.throws(() => run([row("actual", -1), row("actual", -1)], -2), /duplicate/)
  assert.throws(() => run([row("actual", 1, "income")], 1), /classification has changed/)
})
test("unreconciled or unsafe amounts never produce a grouped financial result", () => {
  assert.throws(() => run([row("actual", -100)], -99), /does not reconcile/)
  assert.throws(() => run([row("actual", NaN)], 0), /precision/)
  assert.throws(() => run([row("actual", 1e16)], 1e16), /precision/)
})
