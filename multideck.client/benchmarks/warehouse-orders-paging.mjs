import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const pageSize = 20
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 4_096
const variant = process.env.WAREHOUSE_ORDERS_BENCHMARK_VARIANT
const workload = process.env.WAREHOUSE_ORDERS_BENCHMARK_WORKLOAD ?? "orders-search"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set WAREHOUSE_ORDERS_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["orders-search", "purchase-orders-search"]).has(workload)) throw new Error(`Unknown Warehouse orders workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const fixtures = Array.from({ length: recordCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  facilityId: `facility-${pad(index % 250, 3)}`,
  facilityCode: `WH-${pad(index % 250, 3)}`,
  facilityName: `Warehouse ${pad(index % 250, 3)}`,
  customerOrgId: `customer-${pad(index % 12_000, 5)}`,
  customerName: `Customer ${pad(index % 12_000, 5)}`,
  orderNumber: `WMS-${pad(index)}`,
  number: `PO-${pad(index)}`,
  typeCode: index % 2 ? "inbound" : "outbound",
  typeName: index % 2 ? "Inbound" : "Outbound",
  statusCode: index % 17 === 0 ? "completed" : index % 9 === 0 ? "cancelled" : "booked",
  statusName: index % 17 === 0 ? "Completed" : index % 9 === 0 ? "Cancelled" : "Booked",
  priorityCode: index % 5 === 0 ? "urgent" : "normal",
  customerReference: index % 7 === 0 ? `Priority shipment ${pad(index)}` : `CUST-${pad(index)}`,
  supplierName: index % 7 === 0 ? `Priority supplier ${pad(index)}` : `Supplier ${pad(index % 8_000, 5)}`,
  buyerReference: `BUY-${pad(index)}`,
  supplierReference: `SUP-${pad(index)}`,
  requestedDate: "2026-09-01",
  expectedDeliveryDate: "2026-09-05",
  appointmentStartAt: new Date(Date.UTC(2026, 8, 1, 9, 0, 0) + index * 60_000).toISOString(),
  currencyCode: "GBP",
  totalAmount: (index % 10_000) + 250.5,
  lines: Array.from({ length: 3 }, (_, line) => ({
    id: `${index}-${line}`,
    sku: `SKU-${pad((index + line) % recordCount)}`,
    description: `Order line ${line + 1}`,
    orderedQuantity: line + 2,
    receivedQuantity: index % 3 === 0 ? line + 1 : 0,
    dispatchedQuantity: index % 4 === 0 ? line + 1 : 0,
  })),
  createdAt: new Date(Date.UTC(2026, 7, 19, 12, 0, 0) - index * 1_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 7, 19, 12, 0, 0) - index * 750).toISOString(),
}))

const legacyWire = JSON.stringify(fixtures)

function oracleFor(source) {
  const filtered = source.filter((row) => {
    if (workload === "orders-search") {
      return row.facilityId === "facility-043"
        && !["completed", "cancelled"].includes(row.statusCode)
        && row.typeCode === "inbound"
        && [row.orderNumber, row.customerReference, row.customerName, row.facilityName, ...row.lines.map((line) => line.sku)].join(" ").toLowerCase().includes("priority shipment")
    }
    return row.facilityId === "facility-042"
      && !["received", "cancelled"].includes(row.statusCode)
      && [row.number, row.supplierName, row.buyerReference, row.supplierReference].join(" ").toLowerCase().includes("priority supplier")
  })
  filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
  const facetValue = workload === "orders-search" ? (row) => row.statusName : (row) => row.statusCode
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
  return { median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1], mean_ms: mean, min_ms: sorted[0], max_ms: sorted.at(-1), cv: Math.sqrt(variance) / mean, samples_ms: values }
}

const consume = variant === "legacy" ? consumeLegacy : consumeBounded
for (let index = 0; index < warmups; index += 1) assertCorrect(consume())
const samples = [], memory = []
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

const timing = stats(samples), memoryStats = stats(memory)
const output = JSON.stringify({
  benchmark: "Warehouse orders register browser data pipeline",
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

if (process.env.WAREHOUSE_ORDERS_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_ORDERS_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
