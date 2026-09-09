import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const customersCount = 100_000
const itemsCount = 100_000
const locationsCount = 100_000
const facilitiesCount = 100
const customerPageSize = 25
const locationPageSize = 50
const warmups = 2
const runs = 9
const variant = process.env.WAREHOUSE_INVENTORY_ACTION_SELECTORS_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set WAREHOUSE_INVENTORY_ACTION_SELECTORS_VARIANT to legacy or bounded.")
}

const operationsPerSample = variant === "legacy" ? 1 : 1_000
const pad = (value, width = 6) => String(value).padStart(width, "0")
const facilities = Array.from({ length: facilitiesCount }, (_, index) => ({ id: `a8000000-0000-4000-8000-${pad(index, 12)}`, code: `WH-${pad(index)}`, name: `Warehouse ${pad(index)}` }))
const customers = Array.from({ length: customersCount }, (_, index) => ({ id: `a8100000-0000-4000-8000-${pad(index, 12)}`, name: `Customer ${pad(index)}` }))
const items = Array.from({ length: itemsCount }, (_, index) => ({ id: `a8200000-0000-4000-8000-${pad(index, 12)}`, facilityId: facilities[0].id, customerOrgId: customers[index].id, sku: `SKU-${pad(index)}` }))
const locations = Array.from({ length: locationsCount }, (_, index) => ({ id: `a8300000-0000-4000-8000-${pad(index, 12)}`, facilityId: facilities[0].id, code: `LOC-${pad(index)}`, statusCode: "available", typeCode: "storage" }))
const types = [{ code: "pallet", name: "Pallet", isContainer: false }, { code: "carton", name: "Carton", isContainer: false }]
const statuses = [{ code: "available", name: "Available", available: true }, { code: "quarantine", name: "Quarantine", available: false }]

const expected = {
  facilities,
  customers: customers.slice(0, customerPageSize),
  locations: locations.slice(0, locationPageSize),
  types,
  statuses,
}
const expectedSignature = JSON.stringify(expected)

function consumeLegacy() {
  const orderReference = { facilities, customers, items, locations, statuses }
  const handlingReference = { types, locations, statuses }
  const result = {
    facilities: orderReference.facilities,
    customers: orderReference.customers.slice(0, customerPageSize),
    locations: handlingReference.locations.slice(0, locationPageSize),
    types: handlingReference.types,
    statuses: handlingReference.statuses,
  }
  return {
    result,
    sourceRows: facilities.length + customers.length + items.length + locations.length + locations.length,
    payload: Buffer.byteLength(JSON.stringify(orderReference)) + Buffer.byteLength(JSON.stringify(handlingReference)),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const setupReference = { facilities, customers: [], items: [], locations: [], statuses }
  const handlingSetup = { types, locations: [], statuses }
  const customerPage = customers.slice(0, customerPageSize)
  const locationPage = locations.slice(0, locationPageSize)
  return {
    result: { facilities: setupReference.facilities, customers: customerPage, locations: locationPage, types: handlingSetup.types, statuses: handlingSetup.statuses },
    sourceRows: facilities.length + customerPage.length + locationPage.length + types.length + statuses.length * 2,
    payload: Buffer.byteLength(JSON.stringify(setupReference)) + Buffer.byteLength(JSON.stringify(handlingSetup)) + Buffer.byteLength(JSON.stringify(customerPage)) + Buffer.byteLength(JSON.stringify(locationPage)),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== expectedSignature) throw new Error("The visible Warehouse action selector choices changed.")
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
  benchmark: "Warehouse inventory action selector bootstrap",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no Supabase records and does not measure live Edge Function, PostgreSQL, rendering or public-network latency. It models opening Warehouse inventory actions with 25 visible customers and 50 visible locations.",
  customers: customersCount,
  items: itemsCount,
  locations: locationsCount,
  facilities: facilitiesCount,
  customer_page_size: customerPageSize,
  location_page_size: locationPageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: facilities, 25 customers, 50 locations, object types and statuses are identical.",
  supabase_writes: 0,
  source_rows_touched: representative.sourceRows,
  payload_bytes: representative.payload,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.WAREHOUSE_INVENTORY_ACTION_SELECTORS_OUTPUT) writeFileSync(process.env.WAREHOUSE_INVENTORY_ACTION_SELECTORS_OUTPUT, output, "utf8")
console.log(output.trimEnd())
