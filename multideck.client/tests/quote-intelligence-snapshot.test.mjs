import assert from "node:assert/strict"
import test from "node:test"
import { intelligenceFromRealtimeRow } from "../src/lib/quote-intelligence-snapshot.ts"
import { buildQuoteIntelligence } from "../../supabase/functions/quote-intelligence/core.ts"

function row() {
  const quote = { id: "quote", reference: "PERF", customerId: null, lifecycle: "draft", jobId: null, currency: "GBP", origin: "", destination: "", mode: "", shipmentType: "", createdAt: "2026-09-01", updatedAt: "2026-09-01", validTo: null, deadline: null, cost: 0, sell: 0, profit: 0, marginPct: null, fxComplete: true, activityCodes: [] }
  return {
    CusQuoteIntelligence_QuoteID: "quote",
    CusQuoteIntelligence_StateCode: "building_baseline",
    CusQuoteIntelligence_DeterministicJSON: buildQuoteIntelligence({ target: quote, quotes: [quote], jobs: [], rates: [] }, { input: "revision", evidence: "evidence" }, new Date("2026-09-03")),
    CusQuoteIntelligence_CalculatedAt: "2026-09-03T00:00:00Z",
  }
}

test("valid realtime evidence produces the same visible metrics without a recovery fetch", () => {
  const source = row()
  const result = intelligenceFromRealtimeRow(source)
  assert.ok(result)
  assert.deepEqual(result.metrics, source.CusQuoteIntelligence_DeterministicJSON.metrics)
  assert.equal(result.calculatedAt, source.CusQuoteIntelligence_CalculatedAt)
  assert.equal(result.ai, null)
})

test("partial or malformed realtime rows are rejected for recovery", () => {
  for (const value of [undefined, null, [], {}, { metrics: {} }]) assert.equal(intelligenceFromRealtimeRow({ CusQuoteIntelligence_DeterministicJSON: value }), null)
  const source = row()
  delete source.CusQuoteIntelligence_DeterministicJSON.metrics.wonPriceBand
  assert.equal(intelligenceFromRealtimeRow(source), null)
})

test("an AI adjustment belongs only to its matching quote fingerprint", () => {
  const source = row()
  source.CusQuoteIntelligence_AIJSON = { inputFingerprint: "older-revision", adjustmentPoints: 8 }
  assert.equal(intelligenceFromRealtimeRow(source).ai.adjustmentPoints, 0)
  source.CusQuoteIntelligence_StateCode = "updating"
  assert.equal(intelligenceFromRealtimeRow(source).state, "updating")
})
