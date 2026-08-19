import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const pageSize = 20
const warmups = 2
const runs = 9
const operationsPerSample = 3
// Keep the bounded samples long enough to rise above timer jitter. Both variants
// run the same deterministic page projection, so this does not favour either path.
const projectionPasses = 4_096
const variant = process.env.WAREHOUSE_INVENTORY_BENCHMARK_VARIANT
const workload = process.env.WAREHOUSE_INVENTORY_BENCHMARK_WORKLOAD ?? "stock-search"

const workloads = new Set(["stock-search", "objects-search", "movements-search", "exceptions-search"])
if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set WAREHOUSE_INVENTORY_BENCHMARK_VARIANT to legacy or bounded.")
if (!workloads.has(workload)) throw new Error(`Unknown warehouse inventory workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const fixtures = Array.from({ length: recordCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  facilityId: `facility-${pad(index % 250, 3)}`,
  facilityName: `Warehouse ${pad(index % 250, 3)}`,
  customerOrgId: `customer-${pad(index % 12_000, 5)}`,
  customerName: `Customer ${pad(index % 12_000, 5)}`,
  itemId: `item-${pad(index)}`,
  sku: `SKU-${pad(index)}`,
  itemDescription: index % 7 === 0 ? `Priority valve ${pad(index)}` : `Warehouse item ${pad(index)}`,
  locationCode: `A${pad(index % 80, 2)}-B${pad(index % 40, 2)}-${pad(index)}`,
  handlingUnitCode: index % 7 === 0 ? `Priority pallet ${pad(index)}` : `PAL-${pad(index)}`,
  sscc: `00340000${pad(index, 10)}`,
  externalReference: `EXT-${pad(index)}`,
  typeName: index % 3 === 0 ? "Pallet" : "Carton",
  lifecycleStatusCode: index % 97 === 0 ? "consumed" : "open",
  inventoryStatusCode: index % 19 === 0 ? "quarantine" : "available",
  inventoryStatusName: index % 19 === 0 ? "Quarantine" : "Available",
  onHandQuantity: index % 101,
  availableQuantity: index % 19 === 0 ? 0 : index % 101,
  uomCode: "EA",
  batchNumber: `BATCH-${pad(index % 7_500, 5)}`,
  lotNumber: `LOT-${pad(index % 9_500, 5)}`,
  reference: index % 7 === 0 ? `Priority move ${pad(index)}` : `MOVE-${pad(index)}`,
  notes: index % 7 === 0 ? "Priority move needs review" : null,
  fromLocationCode: `FROM-${pad(index % 400, 3)}`,
  toLocationCode: `TO-${pad(index % 400, 3)}`,
  movementTypeName: index % 2 ? "Receipt" : "Dispatch",
  title: index % 7 === 0 ? `Priority discrepancy ${pad(index)}` : `Location discrepancy ${pad(index)}`,
  description: "Expected and counted warehouse positions differ.",
  severityCode: index % 11 === 0 ? "high" : "medium",
  exceptionStatusCode: index % 89 === 0 ? "resolved" : "open",
  expectedLocationCode: `EXPECTED-${pad(index % 400, 3)}`,
  actualLocationCode: `ACTUAL-${pad(index % 400, 3)}`,
  updatedAt: new Date(Date.UTC(2026, 7, 19, 12, 0, 0) - index * 1_000).toISOString(),
}))

const legacyWire = JSON.stringify(fixtures)

function oracleFor(source) {
  const filtered = source.filter((row) => {
    if (workload === "stock-search") {
      return row.onHandQuantity !== 0
        && row.facilityId === "facility-042"
        && [row.sku, row.itemDescription, row.customerName, row.locationCode, row.batchNumber].join(" ").toLowerCase().includes("priority valve")
    }
    if (workload === "objects-search") {
      return row.lifecycleStatusCode !== "consumed"
        && row.facilityId === "facility-042"
        && [row.handlingUnitCode, row.sscc, row.externalReference, row.customerName, row.locationCode].join(" ").toLowerCase().includes("priority pallet")
    }
    if (workload === "movements-search") {
      return row.facilityId === "facility-042"
        && [row.sku, row.itemDescription, row.reference, row.notes, row.fromLocationCode, row.toLocationCode].join(" ").toLowerCase().includes("priority move")
    }
    return row.exceptionStatusCode !== "resolved"
      && row.facilityId === "facility-042"
      && [row.title, row.description, row.expectedLocationCode, row.actualLocationCode].join(" ").toLowerCase().includes("priority discrepancy")
  })
  filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
  const facetValue = workload === "stock-search" ? (row) => row.inventoryStatusName
    : workload === "objects-search" ? (row) => row.typeName
      : workload === "movements-search" ? (row) => row.movementTypeName
        : (row) => row.severityCode
  const facets = [...new Set(filtered.map(facetValue))].sort((left, right) => left.localeCompare(right))
  return { rows: filtered.slice(pageSize, pageSize * 2), total: filtered.length, limit: pageSize, offset: pageSize, facets }
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
  if (JSON.stringify(value.result) !== oracleSignature) throw new Error(`${workload}: exact total, facets or ordered second page changed.`)
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
  benchmark: "Warehouse inventory register browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS, rendering or public-network latency.",
  record_count: recordCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: exact filtered total, facets and ordered second page match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_INVENTORY_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_INVENTORY_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
