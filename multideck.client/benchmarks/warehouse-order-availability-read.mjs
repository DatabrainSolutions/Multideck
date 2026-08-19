import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const itemsCount = 100_000
const locationsCount = 100_000
const lotsCount = 100_000
const organisationsCount = 100_000
const handlingUnitsCount = 100_000
const balancesCount = 100_000
const orderLinesCount = 8
const choicesPerItem = 25
const warmups = 2
const runs = 9
const operationsPerSample = 10
const variant = process.env.WAREHOUSE_ORDER_AVAILABILITY_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_ORDER_AVAILABILITY_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const items = Array.from({ length: itemsCount }, (_, index) => ({ id: `91000000-0000-4000-8000-${pad(index, 12)}`, sku: `SKU-${pad(index)}` }))
const locations = Array.from({ length: locationsCount }, (_, index) => ({ id: `92000000-0000-4000-8000-${pad(index, 12)}`, code: `LOC-${pad(index)}` }))
const lots = Array.from({ length: lotsCount }, (_, index) => ({ id: `93000000-0000-4000-8000-${pad(index, 12)}`, lotNumber: `LOT-${pad(index)}`, batchNumber: `BAT-${pad(index)}` }))
const organisations = Array.from({ length: organisationsCount }, (_, index) => ({ id: `94000000-0000-4000-8000-${pad(index, 12)}`, name: `Customer ${pad(index)}` }))
const handlingUnits = Array.from({ length: handlingUnitsCount }, (_, index) => ({ id: `95000000-0000-4000-8000-${pad(index, 12)}`, code: `HU-${pad(index)}` }))
const balances = Array.from({ length: balancesCount }, (_, index) => {
  const itemIndex = index % 4_000
  return {
    id: `96000000-0000-4000-8000-${pad(index, 12)}`,
    customerOrgId: organisations[0].id,
    itemId: items[itemIndex].id,
    locationId: locations[index].id,
    lotId: lots[index].id,
    handlingUnitId: handlingUnits[index].id,
    customsStatusCode: "free_circulation",
    uomCode: "EA",
    availableQuantity: index + 1,
    firstReceiptAt: new Date(Date.UTC(2025, 0, 1) + index * 60_000).toISOString(),
  }
})
const selectedItemIds = new Set(items.slice(0, orderLinesCount).map((item) => item.id))
const selectedBalances = balances.filter((balance) => selectedItemIds.has(balance.itemId))

function mapAvailability(balanceRows, locationRows, lotRows) {
  const locationById = new Map(locationRows.map((row) => [row.id, row.code]))
  const lotById = new Map(lotRows.map((row) => [row.id, row]))
  return balanceRows.map((balance) => {
    const lot = lotById.get(balance.lotId)
    return {
      id: balance.id,
      itemId: balance.itemId,
      locationId: balance.locationId,
      locationCode: locationById.get(balance.locationId) ?? null,
      lotId: balance.lotId,
      lotNumber: lot?.lotNumber ?? null,
      batchNumber: lot?.batchNumber ?? null,
      customsStatusCode: balance.customsStatusCode,
      uomCode: balance.uomCode,
      availableQuantity: balance.availableQuantity,
    }
  })
}

function visibleChoices(mappedRows) {
  return items.slice(0, orderLinesCount).flatMap((item) => mappedRows.filter((row) => row.itemId === item.id).slice(0, choicesPerItem))
}

const selectedLocationIds = new Set(selectedBalances.map((row) => row.locationId))
const selectedLotIds = new Set(selectedBalances.map((row) => row.lotId))
const selectedLocations = locations.filter((row) => selectedLocationIds.has(row.id))
const selectedLots = lots.filter((row) => selectedLotIds.has(row.id))
const expected = visibleChoices(mapAvailability(selectedBalances, selectedLocations, selectedLots))
const expectedSignature = JSON.stringify(expected)

function consumeLegacy() {
  const mapped = mapAvailability(balances, locations, lots)
  return {
    result: visibleChoices(mapped),
    payload: Buffer.byteLength(JSON.stringify(mapped)),
    sourceRows: balances.length + items.length + locations.length + lots.length + organisations.length + handlingUnits.length,
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const mapped = mapAvailability(selectedBalances, selectedLocations, selectedLots)
  return {
    result: visibleChoices(mapped),
    payload: Buffer.byteLength(JSON.stringify(mapped)),
    sourceRows: selectedBalances.length + selectedLocations.length + selectedLots.length + 1 + orderLinesCount,
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== expectedSignature) throw new Error("The first 25 FIFO batch choices for each order item changed.")
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
  benchmark: "Warehouse outbound-order availability read pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models the current facility-wide inventory response versus an indexed order-scoped FIFO availability response.",
  items: itemsCount,
  locations: locationsCount,
  lots: lotsCount,
  organisations: organisationsCount,
  handling_units: handlingUnitsCount,
  balances: balancesCount,
  order_lines: orderLinesCount,
  choices_per_item: choicesPerItem,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the first 25 FIFO batch choices for all eight order items are identical.",
  supabase_writes: 0,
  source_rows_touched: representative.sourceRows,
  payload_bytes: representative.payload,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_ORDER_AVAILABILITY_BENCHMARK_OUTPUT) writeFileSync(process.env.WAREHOUSE_ORDER_AVAILABILITY_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
