import assert from "node:assert/strict"
import test from "node:test"

import {
  applyQuoteIntelligenceAdjustment,
  buildQuoteIntelligence,
} from "../functions/quote-intelligence/core.ts"

const NOW = new Date("2026-08-20T12:00:00.000Z")

function quote(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    reference: `Q-${Math.floor(Math.random() * 100000)}`,
    customerId: "customer-1",
    lifecycle: "draft",
    jobId: null,
    currency: "GBP",
    origin: "Felixstowe",
    destination: "Rotterdam",
    mode: "Sea FCL",
    shipmentType: "FCL",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    validTo: "2026-09-01",
    deadline: null,
    cost: 0,
    sell: 0,
    profit: 0,
    marginPct: null,
    fxComplete: true,
    activityCodes: [],
    ...overrides,
  }
}

function evidence(target, quotes, jobs = [], rates = []) {
  return { target, quotes, jobs, rates }
}

test("sparse Development evidence reports real outcomes and builds the pricing baseline", () => {
  const target = quote({ id: "target", reference: "Q-19171" })
  const rows = [
    target,
    quote({ lifecycle: "accepted", reference: "Q-19160" }),
    quote({ lifecycle: "declined", reference: "Q-19161" }),
    ...Array.from({ length: 6 }, (_, index) => quote({ reference: `Q-${19162 + index}` })),
  ]

  const result = buildQuoteIntelligence(evidence(target, rows), { input: "input", evidence: "evidence" }, NOW)

  assert.deepEqual(result.metrics.historicalWinRate.value, {
    ratePct: 50,
    wins: 1,
    losses: 1,
    pending: 7,
    lowEvidence: true,
  })
  assert.equal(result.metrics.historicalWinRate.evidenceCount, 9)
  assert.equal(result.metrics.wonPriceBand.value, null)
  assert.equal(result.metrics.wonPriceBand.reasonCode, "needs_five_priced_wins")
  assert.equal(result.metrics.suggestedPitch.reasonCode, "add_quote_costs")
  assert.equal(result.metrics.aiWinLikelihood.value, null)
  assert.equal(result.state, "building_baseline")
  assert.equal(result.aiEligible, false)
})

test("priced wins produce an evidence-backed band, pitch, confidence and repeatable scores", () => {
  const target = quote({ id: "target", reference: "Q-20000", cost: 1000, sell: 1280, profit: 280, marginPct: 21.875 })
  const wins = [1180, 1220, 1260, 1300, 1360, 1400].map((sell, index) => quote({
    lifecycle: "accepted",
    reference: `Q-${19990 + index}`,
    updatedAt: `2026-0${index + 2}-01T10:00:00.000Z`,
    cost: sell * 0.8,
    sell,
    profit: sell * 0.2,
    marginPct: 20,
  }))
  const losses = Array.from({ length: 4 }, (_, index) => quote({ lifecycle: "declined", reference: `Q-${19980 + index}` }))
  const rates = [
    { id: "rate-1", customerId: "customer-1", currency: "GBP", origin: "Felixstowe", destination: "Rotterdam", mode: "Sea FCL", shipmentType: "FCL", effectiveAt: "2026-08-01T00:00:00.000Z", amount: 1275, fxComplete: true },
  ]
  const bundle = evidence(target, [target, ...wins, ...losses], [], rates)

  const first = buildQuoteIntelligence(bundle, { input: "input", evidence: "evidence" }, NOW)
  const second = buildQuoteIntelligence(bundle, { input: "input", evidence: "evidence" }, NOW)

  assert.deepEqual(first, second)
  assert.equal(first.metrics.wonPriceBand.status, "ready")
  assert.ok(first.metrics.wonPriceBand.value.low >= 1180)
  assert.ok(first.metrics.wonPriceBand.value.high <= 1400)
  assert.equal(first.metrics.suggestedPitch.status, "ready")
  assert.ok(first.metrics.suggestedPitch.value.amount >= target.cost)
  assert.ok(first.metrics.suggestedPitch.value.amount >= first.metrics.wonPriceBand.value.low)
  assert.ok(first.metrics.suggestedPitch.value.amount <= first.metrics.wonPriceBand.value.high)
  assert.equal(first.metrics.priceConfidence.status, "ready")
  assert.equal(first.metrics.aiWinLikelihood.status, "ready")
  assert.equal(first.metrics.aiTemperature.status, "ready")
  assert.equal(first.aiEligible, true)
})

test("outliers and unverifiable currency conversions cannot distort the won band", () => {
  const target = quote({ id: "target", cost: 80, sell: 102, profit: 22, marginPct: 21.57 })
  const prices = [100, 101, 102, 103, 104, 10_000]
  const wins = prices.map((sell, index) => quote({
    lifecycle: "accepted",
    reference: `Q-${30000 + index}`,
    sell,
    cost: sell * 0.8,
    profit: sell * 0.2,
    marginPct: 20,
  }))
  const unverified = quote({ lifecycle: "accepted", createdAt: "2026-08-19T10:00:00.000Z", updatedAt: "2026-08-19T10:00:00.000Z", sell: 50_000, cost: 10, profit: 49_990, marginPct: 99, fxComplete: false })

  const result = buildQuoteIntelligence(evidence(target, [target, ...wins, unverified]), { input: "i", evidence: "e" }, NOW)

  assert.equal(result.metrics.wonPriceBand.status, "ready")
  assert.equal(result.metrics.wonPriceBand.evidenceCount, 5)
  assert.ok(result.metrics.wonPriceBand.value.high <= 104)
  assert.equal(result.recentQuotes.find((row) => row.id === unverified.id)?.revenue, null)
})

test("cost-dependent metrics stay unavailable without a verified current cost", () => {
  const target = quote({ id: "target", cost: 0, sell: 1250, profit: 1250, marginPct: 100 })
  const wins = Array.from({ length: 5 }, (_, index) => quote({ lifecycle: "accepted", sell: 1200 + index * 25, cost: 950, profit: 250 + index * 25, marginPct: 20 }))
  const result = buildQuoteIntelligence(evidence(target, [target, ...wins]), { input: "i", evidence: "e" }, NOW)

  assert.equal(result.metrics.wonPriceBand.status, "ready")
  assert.equal(result.metrics.suggestedPitch.status, "missing_input")
  assert.equal(result.metrics.suggestedPitch.value, null)
  assert.equal(result.metrics.marginHeadroom.status, "missing_input")
})

test("Luna adjustment is capped and cannot create a missing deterministic score", () => {
  const target = quote({ id: "target" })
  const sparse = buildQuoteIntelligence(evidence(target, [target]), { input: "i", evidence: "e" }, NOW)
  assert.deepEqual(applyQuoteIntelligenceAdjustment(sparse, 100), {
    adjustmentPoints: 8,
    winLikelihoodPct: null,
    temperatureScore: null,
    temperatureLabel: null,
  })

  const pricedTarget = quote({ id: "priced", cost: 900, sell: 1200, profit: 300, marginPct: 25 })
  const resolved = Array.from({ length: 6 }, (_, index) => quote({ lifecycle: "accepted", sell: 1150 + index * 20, cost: 900, profit: 250 + index * 20, marginPct: 22 }))
  const scored = buildQuoteIntelligence(evidence(pricedTarget, [pricedTarget, ...resolved]), { input: "i2", evidence: "e2" }, NOW)
  const refined = applyQuoteIntelligenceAdjustment(scored, -20)
  assert.equal(refined.adjustmentPoints, -8)
  assert.equal(refined.winLikelihoodPct, scored.metrics.aiWinLikelihood.value.basePct - 8)
})
