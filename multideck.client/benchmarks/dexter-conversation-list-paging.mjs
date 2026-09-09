import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const records = 100_000
const legacyLimit = 50
const pageSize = 25
const warmups = 2
const runs = 31
const operationsPerSample = 180
const variant = process.env.DEXTER_CONVERSATION_LIST_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set DEXTER_CONVERSATION_LIST_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseTime = Date.UTC(2026, 7, 19, 12, 0, 0)
const rows = Array.from({ length: legacyLimit }, (_, index) => ({
  id: `20000000-0000-4000-8000-${pad(index, 12)}`,
  title: `Freight investigation ${pad(index)}`,
  summary: `${index % 3 === 0 ? "Urgent " : ""}booking, customs and rate evidence ${"workspace context ".repeat(4)}`,
  updatedAt: new Date(baseTime - index * 60_000).toISOString(),
}))
const expected = rows.slice(0, pageSize)
const oracleSignature = JSON.stringify(expected)
const legacyPayload = JSON.stringify({ conversations: rows })
const boundedPayload = JSON.stringify({
  conversationPage: {
    rows: expected,
    total: records,
    offset: 0,
    limit: pageSize,
    hasMore: true,
  },
})

function consumeLegacy() {
  const payload = JSON.parse(legacyPayload)
  return {
    rows: payload.conversations.slice(0, pageSize),
    total: payload.conversations.length,
    payloadBytes: Buffer.byteLength(legacyPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const payload = JSON.parse(boundedPayload).conversationPage
  return {
    rows: payload.rows,
    total: payload.total,
    payloadBytes: Buffer.byteLength(boundedPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.rows) !== oracleSignature) throw new Error("The visible conversation rows changed.")
  if (variant === "bounded" && value.total !== records) throw new Error("The exact conversation total changed.")
  if (variant === "legacy" && value.total !== legacyLimit) throw new Error("The legacy latest-50 ceiling changed.")
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
  benchmark: "Dexter conversation sidebar browser data pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. No Supabase rows are written. The legacy wire reflects the existing latest-50 ceiling over a 100,000-conversation source; this proves browser transfer and processing reduction rather than live database or network latency.",
  records,
  legacy_limit: legacyLimit,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the same newest 25 visible conversation rows are retained; the bounded response also exposes the exact 100,000-row total.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.DEXTER_CONVERSATION_LIST_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.DEXTER_CONVERSATION_LIST_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
