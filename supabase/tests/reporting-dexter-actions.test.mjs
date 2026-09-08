import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"
import { requiresExplicitActionApproval } from "../functions/agent-dexter/email-approval.mjs"
const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
const migration = read("../migrations/20260907233000_reporting_action_schema.sql")
const schema = JSON.parse(migration.split("$schema$")[1])
const review = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(read("../functions/agent-dexter/report-review.ts"))).toString("base64")}`)
test("The report action is eligible for Dexter's strict schema and every nested object is closed", () => {
  const edge = read("../functions/agent-dexter/index.ts")
  const source = edge.slice(edge.indexOf("function strictActionParameterSchemaError"), edge.indexOf("function parseActions"))
  const check = new Function("isObject", "cleanString", `${stripTypeScriptTypes(source)}; return strictActionParameterSchemaError`)(v => !!v && typeof v === "object" && !Array.isArray(v), v => String(v || ""))
  assert.equal(check(schema), null)
  const visit = node => {
    if (node.type === "object") { assert.equal(node.additionalProperties, false); assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort()); Object.values(node.properties).forEach(visit) }
    if (node.items) visit(node.items)
    if (node.anyOf) node.anyOf.forEach(visit)
  }
  visit(schema)
  assert.ok(schema.properties.target_id.anyOf.some(x => x.type === "null"))
})
test("Saving a report always requires explicit approval in both access modes", () => {
  assert.equal(requiresExplicitActionApproval("save_report", "approve"), true)
  assert.equal(requiresExplicitActionApproval("save_report", "full"), true)
})
test("The approval card describes actual report settings without printing raw JSON", () => {
  const changes = review.reportActionChanges({ name: "Jobs by route", visibility: "private", target_id: null, definition: { kind: "table", query: { source: "jobs", dateField: "created", period: { preset: "last12months" }, columns: ["reference","customer","origin"], filters: [], mode: "rows" } } })
  assert.ok(changes.some(x => x.field === "Period" && x.value === "Last 12 months to today"))
  assert.ok(changes.some(x => x.field === "Who can view it" && x.value === "Only me"))
  assert.ok(changes.some(x => x.field === "Columns" && x.value.includes("Reference")))
  assert.ok(changes.every(x => !x.value.includes("[object Object]")))
})
