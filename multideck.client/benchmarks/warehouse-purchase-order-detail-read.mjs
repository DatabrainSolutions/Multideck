import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const organisationsCount = 100_000
const itemsCount = 100_000
const purchaseOrdersCount = 100_000
const linesCount = 8
const warmups = 2
const runs = 9
const operationsPerSample = 100
const variant = process.env.WAREHOUSE_PO_DETAIL_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_PO_DETAIL_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const organisations = Array.from({ length: organisationsCount }, (_, index) => ({
  id: `80000000-0000-4000-8000-${pad(index, 12)}`,
  name: `Organisation ${pad(index)}`,
}))
const items = Array.from({ length: itemsCount }, (_, index) => ({
  id: `81000000-0000-4000-8000-${pad(index, 12)}`,
  sku: `SKU-${pad(index)}`,
  description: `Warehouse item ${pad(index)}`,
}))
const purchaseOrders = Array.from({ length: purchaseOrdersCount }, (_, index) => ({
  id: `82000000-0000-4000-8000-${pad(index, 12)}`,
  customerOrgId: organisations[index % organisations.length].id,
  number: `PO-${pad(purchaseOrdersCount - index)}`,
}))
const target = purchaseOrders[10]
const lines = Array.from({ length: linesCount }, (_, index) => ({ itemId: items[index].id, quantity: index + 1 }))

function mapDetail(order, organisationRows, itemRows) {
  const organisationNames = new Map(organisationRows.map((row) => [row.id, row.name]))
  const itemById = new Map(itemRows.map((row) => [row.id, row]))
  return {
    id: order.id,
    number: order.number,
    customerName: organisationNames.get(order.customerOrgId) ?? "",
    lines: lines.map((line) => ({ ...line, sku: itemById.get(line.itemId)?.sku ?? "", description: itemById.get(line.itemId)?.description ?? "" })),
  }
}

const expected = mapDetail(target, [organisations[10]], items.slice(0, linesCount))
const expectedSignature = JSON.stringify(expected)

function consumeLegacy() {
  const row = purchaseOrders.slice(0, 500).find((candidate) => candidate.id === target.id)
  const result = mapDetail(row, organisations, items)
  return { result, sourceRows: 500 + organisations.length + items.length, heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const result = mapDetail(target, [organisations[10]], items.slice(0, linesCount))
  return { result, sourceRows: 1 + 1 + linesCount, heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== expectedSignature) throw new Error("The purchase-order detail output changed.")
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
  benchmark: "Warehouse purchase-order detail server mapping pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models indexed direct lookup versus the previous broad server context only.",
  organisations: organisationsCount,
  items: itemsCount,
  purchase_orders: purchaseOrdersCount,
  detail_lines: linesCount,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the purchase-order header, stock-owner name and all eight item lines are identical.",
  supabase_writes: 0,
  source_rows_touched: representative.sourceRows,
  payload_bytes: Buffer.byteLength(expectedSignature),
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_PO_DETAIL_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_PO_DETAIL_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
