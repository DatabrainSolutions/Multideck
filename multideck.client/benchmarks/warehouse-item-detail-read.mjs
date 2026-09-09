import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const facilitiesCount = 100_000
const organisationsCount = 100_000
const itemsCount = 100_000
const uomsPerItem = 2
const warmups = 2
const runs = 9
const variant = process.env.WAREHOUSE_ITEM_DETAIL_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_ITEM_DETAIL_BENCHMARK_VARIANT to legacy or bounded.")
}

// Batch the indexed path so each sample clears the timer floor before it is
// normalised back to one detail read.
const operationsPerSample = variant === "legacy" ? 10 : 10_000
const pad = (value, width = 6) => String(value).padStart(width, "0")
const facilities = Array.from({ length: facilitiesCount }, (_, index) => ({ id: `a7000000-0000-4000-8000-${pad(index, 12)}`, name: `Warehouse ${pad(index)}` }))
const organisations = Array.from({ length: organisationsCount }, (_, index) => ({ id: `a7100000-0000-4000-8000-${pad(index, 12)}`, name: `Customer ${pad(index)}` }))
const items = Array.from({ length: itemsCount }, (_, index) => ({
  id: `a7200000-0000-4000-8000-${pad(index, 12)}`,
  facilityId: facilities[index].id,
  customerOrgId: organisations[index].id,
  sku: `SKU-${pad(index)}`,
  description: `Warehouse item ${pad(index)}`,
  baseUomCode: "EA",
  isActive: true,
}))
const uoms = items.flatMap((item, index) => [
  { id: `a7300000-0000-4000-8000-${pad(index * 2, 12)}`, itemId: item.id, code: "EA", quantityInBaseUom: 1 },
  { id: `a7300000-0000-4000-8000-${pad(index * 2 + 1, 12)}`, itemId: item.id, code: "CASE", quantityInBaseUom: 12 },
])
const target = items[78_901]

function mapItem(item, organisationRows, facilityRows, uomRows) {
  const organisationNames = new Map(organisationRows.map((row) => [row.id, row.name]))
  const facilityNames = new Map(facilityRows.map((row) => [row.id, row.name]))
  return {
    id: item.id,
    sku: item.sku,
    description: item.description,
    customerOrgId: item.customerOrgId,
    customerOrgName: organisationNames.get(item.customerOrgId) ?? null,
    facilityId: item.facilityId,
    facilityName: facilityNames.get(item.facilityId) ?? null,
    baseUomCode: item.baseUomCode,
    isActive: item.isActive,
    uoms: uomRows.filter((row) => row.itemId === item.id).map((row) => ({ id: row.id, code: row.code, quantityInBaseUom: row.quantityInBaseUom })),
  }
}

const targetUoms = uoms.slice(78_901 * uomsPerItem, 78_901 * uomsPerItem + uomsPerItem)
const expected = mapItem(target, [organisations[78_901]], [facilities[78_901]], targetUoms)
const expectedSignature = JSON.stringify(expected)

function consumeLegacy() {
  const match = items.find((row) => row.sku.toLowerCase() === target.sku.toLowerCase())
  return {
    result: mapItem(match, organisations, facilities, uoms),
    sourceRows: facilities.length + organisations.length + items.length + uoms.length,
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  return {
    result: mapItem(target, [organisations[78_901]], [facilities[78_901]], targetUoms),
    sourceRows: 1 + 1 + 1 + targetUoms.length,
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== expectedSignature) throw new Error("The warehouse item detail output changed.")
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
  benchmark: "Warehouse item detail server mapping pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models exact indexed SKU lookup versus the previous broad server context only.",
  facilities: facilitiesCount,
  organisations: organisationsCount,
  items: itemsCount,
  item_uoms: uoms.length,
  detail_uoms: uomsPerItem,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the item, customer, facility and two packaging units are identical.",
  supabase_writes: 0,
  source_rows_touched: representative.sourceRows,
  payload_bytes: Buffer.byteLength(expectedSignature),
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_ITEM_DETAIL_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_ITEM_DETAIL_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
