import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const customersCount = 100_000
const facilitiesCount = 100
const warmups = 2
const runs = 9
const operationsPerSample = 7
const variant = process.env.WAREHOUSE_ITEM_REFERENCE_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_ITEM_REFERENCE_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const customers = Array.from({ length: customersCount }, (_, index) => ({
  id: `70000000-0000-4000-8000-${pad(index, 12)}`,
  name: `Warehouse customer ${pad(index)}`,
}))
const facilities = Array.from({ length: facilitiesCount }, (_, index) => ({
  id: `71000000-0000-4000-8000-${pad(index, 12)}`,
  code: `WH-${pad(index, 3)}`,
  name: `Warehouse ${pad(index, 3)}`,
}))
const legacyPayload = JSON.stringify({ customers, facilities })
const boundedPayload = JSON.stringify({ customers: [], customersDeferred: true, facilities })
const oracleSignature = JSON.stringify(facilities)

function consume(payload) {
  const state = JSON.parse(payload)
  return {
    facilities: state.facilities,
    customerRows: state.customers.length,
    payloadBytes: Buffer.byteLength(payload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.facilities) !== oracleSignature) throw new Error("The facility filter data changed.")
  if (variant === "legacy" && value.customerRows !== customersCount) throw new Error("The legacy customer roster changed.")
  if (variant === "bounded" && value.customerRows !== 0) throw new Error("The initial page fetched deferred customers.")
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return {
    median_ms: sorted[Math.floor(sorted.length / 2)],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    mean_ms: mean,
    min_ms: sorted[0],
    max_ms: sorted.at(-1),
    cv: Math.sqrt(variance) / mean,
    samples_ms: values,
  }
}

const payload = variant === "legacy" ? legacyPayload : boundedPayload
for (let index = 0; index < warmups; index += 1) assertCorrect(consume(payload))

const samples = []
const memory = []
let representative
for (let run = 0; run < runs; run += 1) {
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  for (let operation = 0; operation < operationsPerSample; operation += 1) {
    representative = consume(payload)
    assertCorrect(representative)
  }
  samples.push((performance.now() - startedAt) / operationsPerSample)
  memory.push(Math.max(representative.heap - heapBefore, 0))
}

const timing = stats(samples)
const memoryStats = stats(memory)
const output = JSON.stringify({
  benchmark: "Warehouse Items initial reference pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models 100,000 customers only to prove initial transfer and processing bounds.",
  customers: customersCount,
  facilities: facilitiesCount,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the same facility filter data is visible; customers are deferred until an item action opens.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_ITEM_REFERENCE_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.WAREHOUSE_ITEM_REFERENCE_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
