import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const legacyOrderLimit = 500
const legacyMovementLimit = 50
const warmups = 2
const runs = 9
const operationsPerSample = 5
const projectionPasses = 2_048
const variant = process.env.WAREHOUSE_DASHBOARD_BENCHMARK_VARIANT
const workload = process.env.WAREHOUSE_DASHBOARD_BENCHMARK_WORKLOAD ?? "dashboard"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set WAREHOUSE_DASHBOARD_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["dashboard", "calendar-range"]).has(workload)) throw new Error(`Unknown Warehouse dashboard workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseDay = Date.UTC(2026, 7, 19, 8, 0, 0)
const orders = Array.from({ length: recordCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  facilityId: `facility-${pad(index % 250, 3)}`,
  facilityName: `Warehouse ${pad(index % 250, 3)}`,
  customerOrgId: `customer-${pad(index % 12_000, 5)}`,
  customerName: `Customer ${pad(index % 12_000, 5)}`,
  orderNumber: `WMS-${pad(index)}`,
  customerReference: `REF-${pad(index)}`,
  typeCode: index % 2 ? "inbound" : "outbound",
  typeName: index % 2 ? "Inbound" : "Outbound",
  statusCode: index % 19 === 0 ? "complete" : index % 23 === 0 ? "cancelled" : "booked",
  statusName: index % 19 === 0 ? "Complete" : index % 23 === 0 ? "Cancelled" : "Booked",
  priorityCode: index % 13 === 0 ? "urgent" : "normal",
  requestedDate: new Date(baseDay + (index % 35) * 86_400_000).toISOString().slice(0, 10),
  appointmentStartAt: new Date(baseDay + (index % 35) * 86_400_000 + (index % 10) * 3_600_000).toISOString(),
  appointmentEndAt: new Date(baseDay + (index % 35) * 86_400_000 + ((index % 10) + 1) * 3_600_000).toISOString(),
  lines: Array.from({ length: 4 }, (_, line) => ({
    id: `${index}-${line}`,
    sku: `SKU-${pad((index + line) % recordCount)}`,
    description: `Warehouse order line ${line + 1}`,
    orderedQuantity: line + 2,
    receivedQuantity: index % 3 === 0 ? line + 1 : 0,
    dispatchedQuantity: index % 4 === 0 ? line + 1 : 0,
  })),
  updatedAt: new Date(baseDay - index * 1_000).toISOString(),
}))

const movements = Array.from({ length: recordCount }, (_, index) => ({
  id: `movement-${pad(index, 12)}`,
  facilityName: `Warehouse ${pad(index % 250, 3)}`,
  sku: `SKU-${pad(index % recordCount)}`,
  itemDescription: `Movement item ${pad(index)}`,
  typeCode: index % 2 ? "receipt" : "dispatch",
  quantity: (index % 250) + 1,
  uomCode: "EA",
  reference: `MOVE-${pad(index)}`,
  createdAt: new Date(baseDay - index * 1_500).toISOString(),
}))

const recentOrders = orders.slice(0, legacyOrderLimit)
const recentMovements = movements.slice(0, legacyMovementLimit)
const summary = {
  readyToReceive: recentOrders.filter((row) => row.typeCode === "inbound" && !["complete", "cancelled"].includes(row.statusCode)).length,
  readyToDispatch: recentOrders.filter((row) => row.typeCode === "outbound" && !["complete", "cancelled"].includes(row.statusCode)).length,
  stockHolds: 37,
  pastDue: 11,
  bookedToday: 14,
  onHandSkus: 82_450,
  availableSkus: 79_220,
}
const legacyWire = JSON.stringify({ orders: recentOrders, metrics: summary, movements: recentMovements })

function dashboardOutcome(payload) {
  const open = payload.orders.filter((row) => !["complete", "cancelled"].includes(row.statusCode))
  return { metrics: payload.metrics, orders: open.slice(0, 5), movements: payload.movements.slice(0, legacyMovementLimit) }
}

const calendarStart = "2026-08-24"
const calendarEnd = "2026-08-31"
function calendarOutcome(payload) {
  const events = payload.orders.filter((row) => row.requestedDate >= calendarStart && row.requestedDate < calendarEnd)
  const customers = [...new Map(events.map((row) => [row.customerOrgId, { id: row.customerOrgId, name: row.customerName }])).values()]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
  return { customers, events }
}

const oracle = workload === "dashboard"
  ? dashboardOutcome(JSON.parse(legacyWire))
  : calendarOutcome(JSON.parse(legacyWire))
if (workload === "calendar-range" && oracle.events.length < 20) throw new Error("Calendar proof range must contain a populated result.")
const oracleSignature = JSON.stringify(oracle)
const boundedWire = oracleSignature

function project(result) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(result).length
  return checksum
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const result = workload === "dashboard" ? dashboardOutcome(payload) : calendarOutcome(payload)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(legacyWire), heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const result = JSON.parse(boundedWire)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(boundedWire), heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== oracleSignature) throw new Error(`${workload}: visible dashboard or calendar output changed.`)
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
  benchmark: "Warehouse dashboard and calendar browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS, rendering or public-network latency. The legacy payload reflects its existing 500-order and 50-movement ceiling over a 100,000-record source.",
  record_count: recordCount,
  legacy_order_ceiling: legacyOrderLimit,
  legacy_movement_ceiling: legacyMovementLimit,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: visible dashboard metrics/rows or populated calendar range match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_DASHBOARD_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_DASHBOARD_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
