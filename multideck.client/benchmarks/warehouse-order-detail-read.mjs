import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const organisationsCount = 100_000
const itemsCount = 100_000
const locationsCount = 100_000
const ordersCount = 100_000
const linesCount = 8
const warmups = 2
const runs = 9
const operationsPerSample = 100
const variant = process.env.WAREHOUSE_ORDER_DETAIL_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_ORDER_DETAIL_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const organisations = Array.from({ length: organisationsCount }, (_, index) => ({ id: `83000000-0000-4000-8000-${pad(index, 12)}`, name: `Customer ${pad(index)}` }))
const items = Array.from({ length: itemsCount }, (_, index) => ({ id: `84000000-0000-4000-8000-${pad(index, 12)}`, sku: `SKU-${pad(index)}`, description: `Item ${pad(index)}` }))
const locations = Array.from({ length: locationsCount }, (_, index) => ({ id: `85000000-0000-4000-8000-${pad(index, 12)}`, code: `LOC-${pad(index)}` }))
const orders = Array.from({ length: ordersCount }, (_, index) => ({ id: `86000000-0000-4000-8000-${pad(index, 12)}`, customerOrgId: organisations[index % organisations.length].id, number: `OUT-${pad(ordersCount - index)}` }))
const target = orders[12]
const lines = Array.from({ length: linesCount }, (_, index) => ({ itemId: items[index].id, sourceLocationId: locations[index].id, quantity: index + 1 }))

function mapDetail(order, organisationRows, itemRows, locationRows) {
  const organisationNames = new Map(organisationRows.map((row) => [row.id, row.name]))
  const itemById = new Map(itemRows.map((row) => [row.id, row]))
  const locationById = new Map(locationRows.map((row) => [row.id, row.code]))
  return {
    id: order.id,
    orderNumber: order.number,
    customerName: organisationNames.get(order.customerOrgId) ?? "",
    lines: lines.map((line) => ({ ...line, sku: itemById.get(line.itemId)?.sku ?? "", description: itemById.get(line.itemId)?.description ?? "", sourceLocationCode: locationById.get(line.sourceLocationId) ?? null })),
  }
}

const expected = mapDetail(target, [organisations[12]], items.slice(0, linesCount), locations.slice(0, linesCount))
const expectedSignature = JSON.stringify(expected)

function consumeLegacy() {
  const row = orders.slice(0, 500).find((candidate) => candidate.number.toLowerCase() === target.number.toLowerCase())
  return { result: mapDetail(row, organisations, items, locations), sourceRows: 500 + organisations.length + items.length + locations.length, heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  return { result: mapDetail(target, [organisations[12]], items.slice(0, linesCount), locations.slice(0, linesCount)), sourceRows: 1 + 1 + linesCount + linesCount, heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== expectedSignature) throw new Error("The operational-order detail output changed.")
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
  benchmark: "Warehouse operational-order detail server mapping pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models indexed direct lookup versus the previous broad server context only.",
  organisations: organisationsCount,
  items: itemsCount,
  locations: locationsCount,
  orders: ordersCount,
  detail_lines: linesCount,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the order header, customer, eight item lines and eight source locations are identical.",
  supabase_writes: 0,
  source_rows_touched: representative.sourceRows,
  payload_bytes: Buffer.byteLength(expectedSignature),
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_ORDER_DETAIL_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_ORDER_DETAIL_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
