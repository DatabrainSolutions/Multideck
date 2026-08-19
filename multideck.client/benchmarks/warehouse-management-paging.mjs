import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const pageSize = 20
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 128
const variant = process.env.WAREHOUSE_MANAGEMENT_BENCHMARK_VARIANT
const workload = process.env.WAREHOUSE_MANAGEMENT_BENCHMARK_WORKLOAD ?? "items-search"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set WAREHOUSE_MANAGEMENT_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["facilities", "items-search", "locations-search"]).has(workload)) throw new Error(`Unknown warehouse management workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const fixtures = Array.from({ length: recordCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  code: `WH-${pad(index)}`,
  name: `Warehouse ${pad(index % 8_000, 5)}`,
  townCity: `City ${pad(index % 700, 3)}`,
  countryCode: index % 2 ? "GB" : "NL",
  isActive: index % 17 !== 0,
  sku: `SKU-${pad(index)}`,
  description: index % 61 === 0 ? `Priority valve ${pad(index)}` : `Warehouse item ${pad(index)}`,
  customerOrgName: `Customer ${pad(index % 12_000, 5)}`,
  facilityId: `facility-${pad(index % 250, 3)}`,
  facilityName: `Warehouse ${pad(index % 250, 3)}`,
  locationCode: `A${pad(index % 80, 2)}-B${pad(index % 40, 2)}-L${pad(index % 12, 2)}-${pad(index)}`,
  zoneName: index % 43 === 0 ? "Cold chain" : "General",
  updatedAt: new Date(Date.UTC(2026, 7, 19, 12, 0, 0) - index * 1_000).toISOString(),
}))

const legacyWire = JSON.stringify(fixtures)

function oracleFor(source) {
  const filtered = source.filter((row) => {
    if (workload === "facilities") return row.isActive
    if (workload === "items-search") return row.isActive && [row.sku, row.description, row.customerOrgName, row.facilityName].join(" ").toLowerCase().includes("priority valve")
    return row.isActive && row.facilityId === "facility-042" && [row.locationCode, row.zoneName].join(" ").toLowerCase().includes("general")
  })
  filtered.sort((left, right) => {
    const leftValue = workload === "items-search" ? left.sku : workload === "locations-search" ? left.locationCode : left.name
    const rightValue = workload === "items-search" ? right.sku : workload === "locations-search" ? right.locationCode : right.name
    return leftValue.localeCompare(rightValue) || left.id.localeCompare(right.id)
  })
  return { rows: filtered.slice(pageSize, pageSize * 2), total: filtered.length, limit: pageSize, offset: pageSize }
}

const oracle = oracleFor(fixtures)
const oracleSignature = JSON.stringify(oracle)
const boundedWire = oracleSignature

function project(result) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(result).length
  return checksum
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const result = oracleFor(payload)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(legacyWire), heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const result = JSON.parse(boundedWire)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(boundedWire), heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== oracleSignature) throw new Error(`${workload}: exact total or ordered second page changed.`)
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
  benchmark: "Warehouse management register browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS, rendering or public-network latency.",
  record_count: recordCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: exact filtered total and ordered second page match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_MANAGEMENT_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_MANAGEMENT_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
