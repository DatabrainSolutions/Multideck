import assert from "node:assert/strict"
import test from "node:test"
import { mergeVisibleQuoteChargeRows } from "../src/lib/quote-supplier-pricing.ts"

test("editing, deleting and adding supplier prices preserves other suppliers and unassigned charges", () => {
  const other = { id: "b-freight", supplierId: "b", cost: 900, notes: "Keep original" }
  const unassigned = { id: "unassigned", supplierId: null, cost: 20 }
  const freight = { id: "a-freight", supplierId: "a", cost: 200 }
  const collection = { id: "a-collection", supplierId: "a", cost: 50 }
  const rows = [freight, other, collection, unassigned]
  const revised = { ...freight, cost: 250 }
  const added = { id: "a-delivery", supplierId: "a", cost: 75 }
  const merged = mergeVisibleQuoteChargeRows(rows, [freight, collection], [revised, added])
  assert.deepEqual(merged, [revised, other, unassigned, added])
  assert.equal(merged[1], other)
  assert.equal(merged[2], unassigned)
  assert.deepEqual(rows, [freight, other, collection, unassigned])
})

test("adding pricing in an empty supplier tab retains all existing charge lines", () => {
  const original = { id: "other", supplierId: "b", cost: 900 }
  const added = { id: "new", supplierId: "a", cost: 250 }
  assert.deepEqual(mergeVisibleQuoteChargeRows([original], [], [added]), [original, added])
})

test("removing every visible line leaves other supplier pricing intact", () => {
  const a = { id: "a", cost: 100 }
  const b = { id: "b", cost: 200 }
  assert.deepEqual(mergeVisibleQuoteChargeRows([a, b], [a], []), [b])
})

test("moving a line to another supplier changes that line without duplicating other lines", () => {
  const a = { id: "a", supplierId: "first" }
  const b = { id: "b", supplierId: "second" }
  const moved = { ...a, supplierId: "second" }
  assert.deepEqual(mergeVisibleQuoteChargeRows([a, b], [a], [moved]), [moved, b])
})
