import assert from "node:assert/strict"
import test from "node:test"
import { workContextForRoute } from "../src/lib/recent-work-context.ts"

test("recognises booking detail work without treating booking creation as a record", () => {
  assert.deepEqual(workContextForRoute("/bookings/md-22682"), {
    type: "booking",
    recordId: "MD-22682",
  })
  assert.equal(workContextForRoute("/bookings/new"), null)
  assert.equal(workContextForRoute("/bookings/provisional"), null)
})

test("recognises work in the deal pipeline and lead conversion", () => {
  assert.deepEqual(workContextForRoute("/crm/deals"), { type: "deal" })
  assert.deepEqual(workContextForRoute("/crm/leads/lead-123/convert"), { type: "deal" })
})

test("ignores unrelated routes so standard suggestions remain available", () => {
  assert.equal(workContextForRoute("/customers"), null)
  assert.equal(workContextForRoute("/agent-dexter"), null)
})
