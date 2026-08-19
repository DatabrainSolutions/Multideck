import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const itemsCount = 100_000
const locationsCount = 100_000
const pageSize = 25
const warmups = 2
const runs = 9
const operationsPerSample = 20
const variant = process.env.WAREHOUSE_ORDER_SELECTOR_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_ORDER_SELECTOR_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const items = Array.from({ length: itemsCount }, (_, index) => ({
  id: `73000000-0000-4000-8000-${pad(index, 12)}`,
  customerOrgId: "74000000-0000-4000-8000-000000000001",
  facilityId: "75000000-0000-4000-8000-000000000001",
  sku: `SKU-${pad(index)}`,
  description: `Warehouse item ${pad(index)}`,
  uomCode: "EA",
  requiresLot: index % 3 === 0,
  requiresExpiry: index % 5 === 0,
}))
const locations = Array.from({ length: locationsCount }, (_, index) => ({
  id: `76000000-0000-4000-8000-${pad(index, 12)}`,
  facilityId: "75000000-0000-4000-8000-000000000001",
  code: `A-${pad(index)}`,
  zoneName: null,
}))
const expectedItems = items.slice(0, pageSize)
const expectedLocations = locations.slice(0, pageSize)
const legacyPayload = JSON.stringify({ items, locations })
const boundedPayload = JSON.stringify({
  items: { rows: expectedItems, limit: pageSize, offset: 0, hasMore: true },
  locations: { rows: expectedLocations, limit: pageSize, offset: 0, hasMore: true },
})
const itemSignature = JSON.stringify(expectedItems)
const locationSignature = JSON.stringify(expectedLocations)

function consumeLegacy() {
  const state = JSON.parse(legacyPayload)
  return {
    itemRows: state.items.slice(0, pageSize),
    itemHasMore: state.items.length > pageSize,
    locationRows: state.locations.slice(0, pageSize),
    locationHasMore: state.locations.length > pageSize,
    payloadBytes: Buffer.byteLength(legacyPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const state = JSON.parse(boundedPayload)
  return {
    itemRows: state.items.rows,
    itemHasMore: state.items.hasMore,
    locationRows: state.locations.rows,
    locationHasMore: state.locations.hasMore,
    payloadBytes: Buffer.byteLength(boundedPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.itemRows) !== itemSignature) throw new Error("The first item selector page changed.")
  if (JSON.stringify(value.locationRows) !== locationSignature) throw new Error("The first location selector page changed.")
  if (!value.itemHasMore || !value.locationHasMore) throw new Error("A selector lost its more-results signal.")
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return { median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1], mean_ms: mean, min_ms: sorted[0], max_ms: sorted.at(-1), cv: Math.sqrt(variance) / mean, samples_ms: values }
}

const consume = variant === "legacy" ? consumeLegacy : consumeBounded
for (let index = 0; index < warmups; index += 1) assertCorrect(consume())

const samples = []
const memory = []
let representative
for (let run = 0; run < runs; run += 1) {
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  for (let operation = 0; operation < operationsPerSample; operation += 1) {
    representative = consume()
    assertCorrect(representative)
  }
  samples.push((performance.now() - startedAt) / operationsPerSample)
  memory.push(Math.max(representative.heap - heapBefore, 0))
}

const timing = stats(samples)
const memoryStats = stats(memory)
const output = JSON.stringify({
  benchmark: "Warehouse order item and location selector browser pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models 100,000 items and 100,000 locations only to prove response bounds.",
  items: itemsCount,
  locations: locationsCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the first 25 items and locations are unchanged, and both selectors retain their more-results signal.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_ORDER_SELECTOR_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_ORDER_SELECTOR_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
