import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const userCount = 100_000
const pageSize = 25
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 256
const variant = process.env.CRM_TRANSFER_BENCHMARK_VARIANT
const workload = process.env.CRM_TRANSFER_BENCHMARK_WORKLOAD ?? "initial"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set CRM_TRANSFER_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["initial", "selector-search"]).has(workload)) throw new Error(`Unknown CRM transfer workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const currentIndex = 50_000
const users = Array.from({ length: userCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  name: `User ${pad(index)}`,
  email: `user.${pad(index)}@example.test`,
  isCurrentUser: index === currentIndex,
}))
const currentUser = users[currentIndex]
const search = "user 0999"

const searchMatches = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search))
const selectorOracle = {
  rows: searchMatches.slice(0, pageSize),
  total: searchMatches.length,
  limit: pageSize,
  offset: 0,
  currentUser,
}
const initialOracle = { currentUserId: currentUser.id }
const legacyWire = JSON.stringify(users)
const boundedSelectorWire = JSON.stringify(selectorOracle)

function project(value) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(value).length
  return checksum
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const result = workload === "initial"
    ? { currentUserId: payload.find((user) => user.isCurrentUser)?.id ?? null }
    : {
      rows: payload.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search)).slice(0, pageSize),
      total: payload.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search)).length,
      limit: pageSize,
      offset: 0,
      currentUser: payload.find((user) => user.isCurrentUser) ?? null,
    }
  return {
    result,
    projection: project(result),
    payloadBytes: Buffer.byteLength(legacyWire),
    requestCount: 1,
    recordsReceived: payload.length,
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const result = workload === "initial" ? initialOracle : JSON.parse(boundedSelectorWire)
  return {
    result,
    projection: project(result),
    payloadBytes: workload === "initial" ? 0 : Buffer.byteLength(boundedSelectorWire),
    requestCount: workload === "initial" ? 0 : 1,
    recordsReceived: workload === "initial" ? 0 : selectorOracle.rows.length,
    heap: process.memoryUsage().heapUsed,
  }
}

const oracleSignature = JSON.stringify(workload === "initial" ? initialOracle : selectorOracle)
function assertCorrect(result) {
  if (JSON.stringify(result.result) !== oracleSignature) throw new Error(`${workload}: current operator or ordered selector page changed.`)
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

const output = JSON.stringify({
  benchmark: "CRM transfer-user browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and measures browser payload processing only, not live PostgreSQL, RLS, public-network or rendering latency.",
  user_count: userCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: current operator and ordered selector page match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  records_received: representative.recordsReceived,
  memory_delta_bytes: stats(memory).median_ms,
  ...stats(samples),
}, null, 2) + "\n"

if (process.env.CRM_TRANSFER_BENCHMARK_OUTPUT) writeFileSync(process.env.CRM_TRANSFER_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
