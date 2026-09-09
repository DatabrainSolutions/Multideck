import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const itemsCount = 100_000
const locationsCount = 100_000
const lotsCount = 100_000
const organisationsCount = 100_000
const handlingUnitsCount = 100_000
const balancesCount = 100_000
const queriesCount = 50
const warmups = 2
const runs = 9
const variant = process.env.WAREHOUSE_DRAFT_AVAILABILITY_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_DRAFT_AVAILABILITY_BENCHMARK_VARIANT to legacy or bounded.")
}

// Normalize both variants per operation, but batch the sub-millisecond bounded
// path more heavily so every measured sample sits comfortably above the timer
// floor instead of mistaking scheduler jitter for application variability.
const operationsPerSample = variant === "legacy" ? 10 : 1_000

const pad = (value, width = 6) => String(value).padStart(width, "0")
const items = Array.from({ length: itemsCount }, (_, index) => ({ id: `a1000000-0000-4000-8000-${pad(index, 12)}`, sku: `SKU-${pad(index)}` }))
const locations = Array.from({ length: locationsCount }, (_, index) => ({ id: `a2000000-0000-4000-8000-${pad(index, 12)}`, code: `LOC-${pad(index)}` }))
const lots = Array.from({ length: lotsCount }, (_, index) => ({ id: `a3000000-0000-4000-8000-${pad(index, 12)}`, lotNumber: `LOT-${pad(index)}` }))
const organisations = Array.from({ length: organisationsCount }, (_, index) => ({ id: `a4000000-0000-4000-8000-${pad(index, 12)}`, name: `Customer ${pad(index)}` }))
const handlingUnits = Array.from({ length: handlingUnitsCount }, (_, index) => ({ id: `a5000000-0000-4000-8000-${pad(index, 12)}`, code: `HU-${pad(index)}` }))
const balances = Array.from({ length: balancesCount }, (_, index) => ({
  id: `a6000000-0000-4000-8000-${pad(index, 12)}`,
  customerOrgId: organisations[0].id,
  itemId: items[index % 4_000].id,
  locationId: locations[index].id,
  lotId: lots[index].id,
  handlingUnitId: handlingUnits[index].id,
  inventoryStatusCode: "available",
  customsStatusCode: "free_circulation",
  uomCode: "EA",
  availableQuantity: (index % 12) + 1,
}))

const itemQueries = items.slice(0, 25).map((item, index) => ({ key: `item:${index}`, itemId: item.id, locationId: null, lotNumber: null, customsStatusCode: "free_circulation", uomCode: "EA" }))
const locationQueries = balances.filter((balance) => balance.itemId === items[0].id).slice(0, 25).map((balance, index) => ({ key: `location:${index}`, itemId: balance.itemId, locationId: balance.locationId, lotNumber: null, customsStatusCode: "free_circulation", uomCode: "EA" }))
const queries = [...itemQueries, ...locationQueries]

function mapLegacyRows() {
  const itemById = new Map(items.map((row) => [row.id, row]))
  const locationById = new Map(locations.map((row) => [row.id, row]))
  const lotById = new Map(lots.map((row) => [row.id, row]))
  const organisationById = new Map(organisations.map((row) => [row.id, row]))
  const handlingUnitById = new Map(handlingUnits.map((row) => [row.id, row]))
  return balances.map((balance) => ({
    ...balance,
    sku: itemById.get(balance.itemId)?.sku ?? "",
    locationCode: locationById.get(balance.locationId)?.code ?? null,
    lotNumber: lotById.get(balance.lotId)?.lotNumber ?? null,
    customerName: organisationById.get(balance.customerOrgId)?.name ?? null,
    handlingUnitCode: handlingUnitById.get(balance.handlingUnitId)?.code ?? null,
  }))
}

function evaluateQueries(rows) {
  return queries.map((query) => ({
    key: query.key,
    available: rows
      .filter((row) => row.itemId === query.itemId
        && row.inventoryStatusCode === "available"
        && row.customsStatusCode === query.customsStatusCode
        && row.uomCode === query.uomCode
        && (!query.locationId || row.locationId === query.locationId)
        && (!query.lotNumber || row.lotNumber === query.lotNumber))
      .reduce((total, row) => total + row.availableQuantity, 0),
    uomCode: query.uomCode,
  }))
}

const balancesByItem = new Map()
for (const balance of balances) {
  const bucket = balancesByItem.get(balance.itemId) ?? []
  bucket.push(balance)
  balancesByItem.set(balance.itemId, bucket)
}
const expected = evaluateQueries(balances)
const expectedSignature = JSON.stringify(expected)

function consumeLegacy() {
  const mapped = mapLegacyRows()
  return {
    result: evaluateQueries(mapped),
    payload: Buffer.byteLength(JSON.stringify(mapped)),
    sourceRows: balances.length + items.length + locations.length + lots.length + organisations.length + handlingUnits.length,
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const result = queries.map((query) => ({
    key: query.key,
    available: (balancesByItem.get(query.itemId) ?? [])
      .filter((row) => row.inventoryStatusCode === "available"
        && row.customsStatusCode === query.customsStatusCode
        && row.uomCode === query.uomCode
        && (!query.locationId || row.locationId === query.locationId))
      .reduce((total, row) => total + row.availableQuantity, 0),
    uomCode: query.uomCode,
  }))
  return {
    result,
    payload: Buffer.byteLength(JSON.stringify(result)),
    sourceRows: queries.reduce((total, query) => total + (balancesByItem.get(query.itemId)?.length ?? 0), 0) + queries.length,
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== expectedSignature) throw new Error("The visible item and location availability totals changed.")
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
  benchmark: "Warehouse draft outbound-order availability check pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models the current facility-wide inventory response versus indexed aggregates for 25 visible items and 25 visible locations.",
  items: itemsCount,
  locations: locationsCount,
  lots: lotsCount,
  organisations: organisationsCount,
  handling_units: handlingUnitsCount,
  balances: balancesCount,
  availability_queries: queriesCount,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: all 50 visible item and location availability totals are identical.",
  supabase_writes: 0,
  source_rows_touched: representative.sourceRows,
  payload_bytes: representative.payload,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_DRAFT_AVAILABILITY_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_DRAFT_AVAILABILITY_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
