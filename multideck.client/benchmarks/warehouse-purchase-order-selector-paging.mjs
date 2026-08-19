import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const organisationsCount = 100_000
const itemsCount = 100_000
const pageSize = 25
const warmups = 2
const runs = 9
const operationsPerSample = 25
const variant = process.env.WAREHOUSE_PO_SELECTOR_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_PO_SELECTOR_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const organisations = Array.from({ length: organisationsCount }, (_, index) => ({
  id: `77000000-0000-4000-8000-${pad(index, 12)}`,
  name: `Stock owner ${pad(index)}`,
}))
const items = Array.from({ length: itemsCount }, (_, index) => ({
  id: `78000000-0000-4000-8000-${pad(index, 12)}`,
  customerOrgId: "77000000-0000-4000-8000-000000000000",
  facilityId: "79000000-0000-4000-8000-000000000001",
  sku: `SKU-${pad(index)}`,
  description: `Purchase item ${pad(index)}`,
  uomCode: "EA",
  quantityBasisCode: "count",
  allowsFractionalQuantity: false,
}))
const expectedOrganisations = organisations.slice(0, pageSize)
const expectedItems = items.slice(0, pageSize)
const legacyPayload = JSON.stringify({ organisations, items })
const boundedPayload = JSON.stringify({
  organisations: { rows: expectedOrganisations, limit: pageSize, offset: 0, hasMore: true },
  items: { rows: expectedItems, limit: pageSize, offset: 0, hasMore: true },
})
const organisationSignature = JSON.stringify(expectedOrganisations)
const itemSignature = JSON.stringify(expectedItems)

function consumeLegacy() {
  const state = JSON.parse(legacyPayload)
  return {
    organisations: state.organisations.slice(0, pageSize),
    items: state.items.slice(0, pageSize),
    organisationsHaveMore: state.organisations.length > pageSize,
    itemsHaveMore: state.items.length > pageSize,
    payloadBytes: Buffer.byteLength(legacyPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const state = JSON.parse(boundedPayload)
  return {
    organisations: state.organisations.rows,
    items: state.items.rows,
    organisationsHaveMore: state.organisations.hasMore,
    itemsHaveMore: state.items.hasMore,
    payloadBytes: Buffer.byteLength(boundedPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.organisations) !== organisationSignature) throw new Error("The first stock-owner page changed.")
  if (JSON.stringify(value.items) !== itemSignature) throw new Error("The first purchase-item page changed.")
  if (!value.organisationsHaveMore || !value.itemsHaveMore) throw new Error("A selector lost its more-results signal.")
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
  benchmark: "Warehouse purchase-order stock-owner and item selector browser pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models 100,000 organisations and 100,000 items only to prove response bounds.",
  organisations: organisationsCount,
  items: itemsCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the first 25 stock owners and items are unchanged, and both selectors retain their more-results signal.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_PO_SELECTOR_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_PO_SELECTOR_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
