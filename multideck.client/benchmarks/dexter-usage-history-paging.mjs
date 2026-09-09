import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const legacyLimit = 50
const pageSize = 10
const warmups = 2
const runs = 31
const operationsPerSample = 240
const variant = process.env.DEXTER_USAGE_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set DEXTER_USAGE_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseTime = Date.UTC(2026, 7, 19, 10, 30, 0)
const entries = Array.from({ length: recordCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  title: `Dexter request ${pad(recordCount - index)}`,
  inputTokens: 700 + (index % 8_000),
  outputTokens: 180 + (index % 2_500),
  totalTokens: 880 + (index % 8_000) + (index % 2_500),
  createdAt: new Date(baseTime - index * 1_000).toISOString(),
}))

const legacyPayload = JSON.stringify({ usage: { recentEntries: entries.slice(0, legacyLimit) } })
const boundedPayload = JSON.stringify({
  rows: entries.slice(0, pageSize),
  total: recordCount,
  offset: 0,
  limit: pageSize,
})
const oracleSignature = JSON.stringify(entries.slice(0, pageSize))

function consumeLegacy() {
  const payload = JSON.parse(legacyPayload)
  return {
    rows: payload.usage.recentEntries.slice(0, pageSize),
    total: payload.usage.recentEntries.length,
    payloadBytes: Buffer.byteLength(legacyPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const payload = JSON.parse(boundedPayload)
  return {
    rows: payload.rows,
    total: payload.total,
    payloadBytes: Buffer.byteLength(boundedPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.rows) !== oracleSignature) throw new Error("The first visible usage page changed.")
  if (variant === "bounded" && value.total !== recordCount) throw new Error("The bounded result lost the exact total.")
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
  benchmark: "Dexter usage history browser data pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS or public-network latency. The legacy wire reflects the existing latest-50 ceiling over a 100,000-record source.",
  record_count: recordCount,
  legacy_limit: legacyLimit,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the first newest usage page matches the shared oracle; the bounded result also retains the exact 100,000-row total.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.DEXTER_USAGE_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.DEXTER_USAGE_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
