import assert from "node:assert/strict"
import { test } from "node:test"
import { validateWarehouseRates, resolveWarehouseRates, previewWarehouseRates, type WarehouseRate, type PricingScenario } from "../src/lib/warehouse-pricing.ts"
const rate: WarehouseRate = { id: "one", code: "STORAGE", name: "Pallet storage", stage: "storage", basis: "pallet", period: "night", amount: 2.5, currency: "GBP", minimum: 0, freePeriods: 1, from: "2026-01-01", to: "" }
const scenario: PricingScenario = { date: "2026-09-22", pallet: 10, unit: 20, m3: 5, kg: 100, nights: 4, hours: 96, receipt: 1, dispatch: 1, transaction: 2 }
test("customer overrides replace matching codes, preserve unrelated defaults and fall back after expiry", () => {
  const extra = { ...rate, id: "two", code: "IN", stage: "receipt" as const, period: "once" as const, freePeriods: 0 }
  const override = { ...rate, id: "three", amount: 1, to: "2026-09-30" }
  const resolved = resolveWarehouseRates([rate, extra], [override], scenario.date)
  assert.deepEqual(resolved.map(x => [x.code, x.amount, x.source]), [["STORAGE", 1, "customer"], ["IN", 2.5, "default"]])
  assert.equal(resolveWarehouseRates([rate], [override], "2026-10-01")[0].amount, 2.5)
})
test("night storage, free periods, zero quantity and minimums", () => {
  const calculate = (change = {}, input = {}) => previewWarehouseRates(resolveWarehouseRates([{ ...rate, ...change }], [], scenario.date), { ...scenario, ...input })[0].total
  assert.equal(calculate(), 75)
  assert.equal(calculate({ minimum: 100 }), 100)
  assert.equal(calculate({ minimum: 100 }, { nights: 1 }), 0)
  assert.equal(calculate({ minimum: 100 }, { pallet: 0 }), 0)
  assert.equal(calculate({ amount: 0 }), 0)
  assert.equal(calculate({ basis: "fixed", amount: 10 }), 30)
  assert.equal(calculate({ period: "day", freePeriods: 0 }, { hours: 25 }), 50)
  assert.equal(calculate({ period: "week", freePeriods: 0 }, { nights: 8 }), 50)
  assert.equal(calculate({ period: "hour", freePeriods: 0, amount: 0.125 }, { hours: 1.5 }), 1.88)
})
test("fixed booking fees apply minimum per booking and never to absent events", () => {
  const input = { ...rate, stage: "transaction" as const, period: "once" as const, basis: "fixed" as const, freePeriods: 0, amount: 5, minimum: 10 }
  const rows = resolveWarehouseRates([input], [], scenario.date)
  assert.equal(previewWarehouseRates(rows, scenario)[0].total, 20)
  assert.equal(previewWarehouseRates(rows, { ...scenario, transaction: 0 })[0].total, 0)
  assert.throws(() => previewWarehouseRates(rows, { ...scenario, transaction: 1.5 }))
})
test("rate validation rejects ambiguous dates, overlapping charge codes, invalid amounts and incompatible periods", () => {
  assert.equal(validateWarehouseRates([rate]), null)
  for (const change of [{ amount: -1 }, { amount: NaN }, { amount: 0.00001 }, { from: "2026-02-30" }, { period: "once" }, { freePeriods: 1.5 }]) assert.ok(validateWarehouseRates([{ ...rate, ...change } as WarehouseRate]))
  assert.ok(validateWarehouseRates([rate, { ...rate, id: "two" }]))
  assert.equal(validateWarehouseRates([{ ...rate, to: "2026-09-21" }, { ...rate, id: "two", from: "2026-09-22" }]), null)
})
