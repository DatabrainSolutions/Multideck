import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const customersCount = 100_000
const pageSize = 25
const warmups = 2
const runs = 9
const operationsPerSample = 100
const variant = process.env.WAREHOUSE_CUSTOMER_SELECTOR_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_CUSTOMER_SELECTOR_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const customers = Array.from({ length: customersCount }, (_, index) => ({
  id: `72000000-0000-4000-8000-${pad(index, 12)}`,
  name: `Warehouse customer ${pad(index)}`,
}))
const expectedRows = customers.slice(0, pageSize)
const legacyPayload = JSON.stringify({ customers })
const boundedPayload = JSON.stringify({ rows: expectedRows, total: customersCount, limit: pageSize, offset: 0 })
const oracleSignature = JSON.stringify(expectedRows)

function consumeLegacy() {
  const state = JSON.parse(legacyPayload)
  return { rows: state.customers.slice(0, pageSize), total: state.customers.length, payloadBytes: Buffer.byteLength(legacyPayload), heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const state = JSON.parse(boundedPayload)
  return { rows: state.rows, total: state.total, payloadBytes: Buffer.byteLength(boundedPayload), heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  if (JSON.stringify(value.rows) !== oracleSignature) throw new Error("The first customer selector page changed.")
  if (value.total !== customersCount) throw new Error("The exact customer total changed.")
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
  benchmark: "Warehouse customer selector browser pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models 100,000 customers only to prove response bounds.",
  customers: customersCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the first 25 customers and exact 100,000-row total are unchanged.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_CUSTOMER_SELECTOR_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_CUSTOMER_SELECTOR_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
