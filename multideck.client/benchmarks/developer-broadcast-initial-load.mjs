import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const usersCount = 100_000
const departmentsCount = 80
const legacyHistoryLimit = 50
const historyPageSize = 20
const warmups = 2
const runs = 9
// Batch several identical parses into each sample so the bounded path remains
// measurable instead of being dominated by sub-millisecond timer noise.
const operationsPerSample = 7
const variant = process.env.BROADCAST_INITIAL_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set BROADCAST_INITIAL_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseTime = Date.UTC(2026, 7, 19, 13, 0, 0)
const departments = Array.from({ length: departmentsCount }, (_, index) => ({
  id: `30000000-0000-4000-8000-${pad(index, 12)}`,
  name: `Department ${pad(index, 3)}`,
  isActive: true,
}))
const users = Array.from({ length: usersCount }, (_, index) => ({
  id: `40000000-0000-4000-8000-${pad(index, 12)}`,
  name: `Workspace user ${pad(index)}`,
  email: `workspace.user.${pad(index)}@example.test`,
  authUserId: `50000000-0000-4000-8000-${pad(index, 12)}`,
  accessStatus: "active",
  departments: [departments[index % departmentsCount], departments[(index + 7) % departmentsCount]],
}))
const history = Array.from({ length: legacyHistoryLimit }, (_, index) => ({
  id: `60000000-0000-4000-8000-${pad(index, 12)}`,
  subject: `Workspace update ${pad(index)}`,
  body: `Operational broadcast ${"reviewed context ".repeat(30)}`,
  audienceMode: "all",
  audience: { mode: "all", departmentIds: [], userIds: [] },
  status: "sent",
  idempotencyKey: `broadcast-${pad(index)}`,
  recipientCount: usersCount,
  excludedCount: 0,
  deliveredCount: usersCount,
  failedCount: 0,
  deliveryMode: "live",
  error: null,
  createdAt: new Date(baseTime - index * 3_600_000).toISOString(),
  sentAt: new Date(baseTime - index * 3_600_000 + 60_000).toISOString(),
}))
const expectedHistory = history.slice(0, historyPageSize)
const oracleSignature = JSON.stringify({ departments, history: expectedHistory })
const shared = {
  departments,
  deliveryProvider: "resend",
  deliveryConfigured: true,
  sender: { from: "Multideck <notifications@example.test>", replyTo: "support@example.test" },
}
const legacyPayload = JSON.stringify({ ...shared, users, history })
const boundedPayload = JSON.stringify({
  ...shared,
  users: [],
  usersDeferred: true,
  history: expectedHistory,
  historyTotal: legacyHistoryLimit,
  historyOffset: 0,
  historyLimit: historyPageSize,
  historyHasMore: true,
})

function consumeLegacy() {
  const state = JSON.parse(legacyPayload)
  return {
    visible: { departments: state.departments, history: state.history.slice(0, historyPageSize) },
    userRows: state.users.length,
    payloadBytes: Buffer.byteLength(legacyPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const state = JSON.parse(boundedPayload)
  return {
    visible: { departments: state.departments, history: state.history },
    userRows: state.users.length,
    payloadBytes: Buffer.byteLength(boundedPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.visible) !== oracleSignature) throw new Error("The visible departments or history changed.")
  if (variant === "legacy" && value.userRows !== usersCount) throw new Error("The legacy full user roster changed.")
  if (variant === "bounded" && value.userRows !== 0) throw new Error("The initial response fetched deferred users.")
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
  benchmark: "Developer Broadcast initial browser data pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models 100,000 workspace users only to prove initial transfer and processing bounds.",
  users: usersCount,
  departments: departmentsCount,
  legacy_history_limit: legacyHistoryLimit,
  history_page_size: historyPageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the same departments and newest 20 broadcasts are visible; the user roster is deferred from initial load.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.BROADCAST_INITIAL_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.BROADCAST_INITIAL_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
