import assert from "node:assert/strict"
import test from "node:test"

import { createRequire } from "node:module"
import { readFileSync } from "node:fs"

// Edge TypeScript is ESM; the root package is CommonJS. Compile the real module
// with the client's existing compiler so the standard Node test command works.
const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const { transformSync } = require("esbuild")
const module = { exports: {} }
const source = readFileSync(new URL("../functions/quote-intelligence/core.ts", import.meta.url), "utf8")
const { code } = transformSync(source, { loader: "ts", format: "cjs", target: "es2022" })
new Function("module", "exports", code)(module, module.exports)
const { applyQuoteIntelligenceAdjustment, buildQuoteIntelligence, quotePricingContext } = module.exports

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
    pricingContext: "fob|door/door|2x40gp",
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
    pending: 6,
    lowEvidence: true,
  })
  assert.equal(result.metrics.historicalWinRate.evidenceCount, 8)
  assert.equal(result.metrics.wonPriceBand.value, null)
  assert.equal(result.metrics.wonPriceBand.reasonCode, "add_quote_costs")
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
  assert.equal(first.aiEligible, false)
})

test("outliers and unverifiable currency conversions cannot distort the won band", () => {
  const target = quote({ id: "target", cost: 80, sell: 102, profit: 22, marginPct: 21.57 })
  const prices = [100, 101, 102, 103, 104, 10_000]
  const wins = prices.map((sell, index) => quote({
    lifecycle: "accepted",
    reference: `Q-${30000 + index}`,
    sell,
    cost: 80,
    profit: sell - 80,
    marginPct: ((sell - 80) / sell) * 100,
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

  assert.equal(result.metrics.wonPriceBand.status, "insufficient_evidence")
  assert.equal(result.metrics.suggestedPitch.status, "missing_input")
  assert.equal(result.metrics.suggestedPitch.value, null)
  assert.equal(result.metrics.marginHeadroom.status, "missing_input")
})

test("AI cannot alter the customer outcome baseline or create a missing score", () => {
  const target = quote({ id: "target" })
  const sparse = buildQuoteIntelligence(evidence(target, [target]), { input: "i", evidence: "e" }, NOW)
  assert.deepEqual(applyQuoteIntelligenceAdjustment(sparse, 100), {
    adjustmentPoints: 0,
    winLikelihoodPct: null,
    temperatureScore: null,
    temperatureLabel: null,
  })

  const pricedTarget = quote({ id: "priced", cost: 900, sell: 1200, profit: 300, marginPct: 25 })
  const resolved = Array.from({ length: 10 }, (_, index) => quote({ lifecycle: "accepted", sell: 1150 + index * 20, cost: 900, profit: 250 + index * 20, marginPct: 22 }))
  const scored = buildQuoteIntelligence(evidence(pricedTarget, [pricedTarget, ...resolved]), { input: "i2", evidence: "e2" }, NOW)
  const refined = applyQuoteIntelligenceAdjustment(scored, -20)
  assert.equal(refined.adjustmentPoints, 0)
  assert.equal(refined.winLikelihoodPct, scored.metrics.aiWinLikelihood.value.basePct)
})


test("other customers, the target, duplicates, old and future evidence never affect any insight", () => {
  const target = quote({ id: "target", lifecycle: "accepted", cost: 900, sell: 1250 })
  const pending = quote({ id: "pending" })
  const contaminated = [target, pending, pending,
    ...Array.from({ length: 300 }, () => quote({ customerId: "other", lifecycle: "accepted", sell: 99999, cost: 900 })),
    quote({ lifecycle: "accepted", createdAt: "2022-01-01", sell: 1250, cost: 900 }),
    quote({ lifecycle: "accepted", createdAt: "2028-01-01", sell: 1250, cost: 900 }),
    quote({ lifecycle: "accepted", createdAt: "invalid", sell: 1250, cost: 900 }),
  ]
  const result = buildQuoteIntelligence(evidence(target, contaminated), { input: "i", evidence: "e" }, NOW)
  assert.deepEqual(result.metrics.historicalWinRate.value, { ratePct: null, wins: 0, losses: 0, pending: 1, lowEvidence: true })
  assert.equal(result.recentQuotes.length, 1)
  assert.equal(result.recentQuotes[0].id, "pending")
  assert.equal(result.metrics.wonPriceBand.value, null)
  assert.equal(result.metrics.aiWinLikelihood.value, null)
  assert.equal(result.metrics.aiWinLikelihood.reasonCode, "quote_already_resolved")
})

test("no customer never borrows tenant history, job prices or rate-line amounts", () => {
  const target = quote({ customerId: null, cost: 900, sell: 1250 })
  const rows = Array.from({ length: 20 }, () => quote({ lifecycle: "accepted", cost: 900, sell: 1250 }))
  const result = buildQuoteIntelligence(evidence(target, rows, rows, rows.map((row) => ({ ...row, amount: 1200, effectiveAt: row.createdAt }))), { input: "i", evidence: "e" }, NOW)
  assert.equal(result.metrics.historicalWinRate.evidenceCount, 0)
  assert.equal(result.metrics.suggestedPitch.value, null)
  assert.equal(result.metrics.suggestedPitch.reasonCode, "select_customer")
  assert.deepEqual(result.recentQuotes, [])
})

test("pricing never widens beyond customer, lane, mode, shipment, service, cargo, currency and cost basis", () => {
  const target = quote({ cost: 1000, sell: 1300 })
  for (const difference of [
    { customerId: "other" }, { origin: "Shanghai" }, { destination: "Antwerp" },
    { mode: "Air" }, { shipmentType: "LCL" }, { pricingContext: "different-cargo" },
    { currency: "USD" }, { cost: 2000 }, { fxComplete: false },
  ]) {
    const rows = Array.from({ length: 20 }, () => quote({ lifecycle: "accepted", cost: 1000, sell: 1300, ...difference }))
    const result = buildQuoteIntelligence(evidence(target, rows), { input: "i", evidence: "e" }, NOW)
    assert.equal(result.metrics.wonPriceBand.value, null, JSON.stringify(difference))
    assert.equal(result.metrics.suggestedPitch.value, null, JSON.stringify(difference))
    assert.equal(result.metrics.priceConfidence.value, null, JSON.stringify(difference))
  }
})

test("unverified current FX or costs above the won median cannot create a pricing recommendation", () => {
  const rows = Array.from({ length: 10 }, () => quote({ lifecycle: "accepted", cost: 1000, sell: 1100 }))
  const costly = buildQuoteIntelligence(evidence(quote({ cost: 1200 }), rows), { input: "i", evidence: "e" }, NOW)
  assert.equal(costly.metrics.wonPriceBand.status, "ready")
  assert.equal(costly.metrics.suggestedPitch.value, null)
  assert.equal(costly.metrics.suggestedPitch.reasonCode, "cost_at_or_above_customer_won_median")
  const unverified = buildQuoteIntelligence(evidence(quote({ cost: 1000, fxComplete: false }), rows), { input: "i", evidence: "e" }, NOW)
  assert.equal(unverified.metrics.suggestedPitch.value, null)
  assert.equal(unverified.metrics.priceConfidence.value, null)
})

test("draft volume cannot qualify a narrow outcome cohort or inflate confidence", () => {
  const target = quote({ cost: 1000, sell: 1300 })
  const drafts = Array.from({ length: 200 }, () => quote())
  const wins = Array.from({ length: 5 }, () => quote({ lifecycle: "accepted", cost: 1000, sell: 1300 }))
  const result = buildQuoteIntelligence(evidence(target, [...drafts, ...wins]), { input: "i", evidence: "e" }, NOW)
  assert.equal(result.metrics.historicalWinRate.cohort, "customer_history")
  assert.equal(result.metrics.aiWinLikelihood.value, null)
  assert.ok(result.metrics.priceConfidence.value.score <= 34)
})

test("service/cargo comparability ignores IDs and copy but detects quantity and handling changes", () => {
  const facts = { hblMode: "Door/Door", containerRequests: [{ id: "one", type: "40GP", quantity: 2 }], cargoLines: [{ id: "cargo", packageQuantity: "40", grossWeightKg: "400000", description: "Car parts", isHazardous: true }] }
  const key = quotePricingContext("FOB", facts)
  assert.ok(key)
  assert.equal(key, quotePricingContext(" fob ", { ...facts, containerRequests: [{ id: "two", type: "40GP", quantity: "2" }], cargoLines: [{ ...facts.cargoLines[0], id: "other", description: "Other description" }] }))
  assert.notEqual(key, quotePricingContext("FOB", { ...facts, containerRequests: [{ type: "40GP", quantity: 1 }] }))
  assert.notEqual(key, quotePricingContext("FOB", { ...facts, cargoLines: [{ ...facts.cargoLines[0], isHazardous: false }] }))
  assert.equal(quotePricingContext("FOB", {}), "")
})


test("a linked booking without an accepted or converted quote outcome is still pending", () => {
  const target = quote({ cost: 1000, sell: 1300 })
  const rows = Array.from({ length: 20 }, () => quote({ lifecycle: "revised", jobId: "linked-job", cost: 1000, sell: 1300 }))
  const result = buildQuoteIntelligence(evidence(target, rows), { input: "i", evidence: "e" }, NOW)
  assert.equal(result.metrics.historicalWinRate.value.wins, 0)
  assert.equal(result.metrics.historicalWinRate.value.pending, 20)
  assert.equal(result.metrics.wonPriceBand.value, null)
  assert.equal(result.metrics.aiWinLikelihood.value, null)
})
