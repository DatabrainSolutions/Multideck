import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const legacyLimit = 250
const pageSize = 25
const warmups = 2
const runs = 31
const operationsPerSample = 160
const variant = process.env.ADMIN_AUDIT_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set ADMIN_AUDIT_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseTime = Date.UTC(2026, 7, 19, 10, 0, 0)
const rows = Array.from({ length: recordCount }, (_, index) => ({
  id: `${index % 4 === 0 ? "auth" : "app"}:${pad(index, 12)}`,
  occurred_at: new Date(baseTime - index * 1_000).toISOString(),
  category: index % 4 === 0 ? "authentication" : "application",
  action: index % 7 === 0 ? "login" : "row_update",
  title: index % 7 === 0 ? "Signed in" : "Booking updated",
  actor_name: `Operator ${pad(index % 750, 3)}`,
  actor_email: `operator-${index % 750}@example.invalid`,
  source: index % 4 === 0 ? "Supabase Auth" : "Bookings",
  record_type: index % 4 === 0 ? "user_session" : "Job_Header",
  record_id: index % 4 === 0 ? null : `2026-${pad(recordCount - index)}`,
  record_key: index % 4 === 0 ? null : { Job_ID: `2026-${pad(recordCount - index)}` },
  ip_address: `10.0.${Math.floor(index / 250) % 250}.${index % 250}`,
  outcome: "success",
  detail: null,
  field_name: null,
  old_value: null,
  new_value: null,
  request_id: null,
  correlation_id: null,
  is_sensitive: false,
}))

const legacyPayload = JSON.stringify({ rows: rows.slice(0, legacyLimit) })
const boundedPayload = JSON.stringify({
  rows: rows.slice(0, pageSize),
  total: recordCount,
  offset: 0,
  limit: pageSize,
})
const oracleSignature = JSON.stringify(rows.slice(0, pageSize))

function consumeLegacy() {
  const payload = JSON.parse(legacyPayload)
  const visibleRows = payload.rows
    .filter((row) => row.category === "authentication" || row.category === "application")
    .slice(0, pageSize)
  return {
    rows: visibleRows,
    total: payload.rows.length,
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
  if (JSON.stringify(value.rows) !== oracleSignature) throw new Error("The first visible audit page changed.")
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
  benchmark: "Admin audit register browser data pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS or public-network latency. The legacy wire reflects the existing latest-250 ceiling over a 100,000-record source.",
  record_count: recordCount,
  legacy_limit: legacyLimit,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the first visible audit page matches the shared oracle; the bounded result also retains the exact 100,000-row total.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.ADMIN_AUDIT_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.ADMIN_AUDIT_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
