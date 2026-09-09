import { performance } from "node:perf_hooks"

const recordCount = 100_000
const pageSize = 50
const warmups = 2
const measuredRuns = 9
const variant = process.env.REGISTER_BENCHMARK_VARIANT

if (variant !== "legacy" && variant !== "bounded") {
  throw new Error("Set REGISTER_BENCHMARK_VARIANT to legacy or bounded.")
}

function pad(value, width = 6) {
  return String(value).padStart(width, "0")
}

function bookingFixture(index) {
  const customerNumber = index % 2_000
  const progress = index % 101
  const status = index % 97 === 0 ? "Exception" : index % 23 === 0 ? "Delayed" : "On track"
  const mode = ["OCEAN", "AIR", "ROAD", "FAS", "FSA"][index % 5]
  const direction = ["Import", "Export", "Domestic", "Cross trade"][index % 4]
  const shipmentType = mode === "OCEAN" ? (index % 2 ? "FCL" : "LCL") : mode === "ROAD" ? (index % 2 ? "FTL" : "LTL") : "Multiple"
  return {
    sourceId: `job-${pad(index)}`,
    id: `MD-${pad(index)}`,
    customer: `Customer ${pad(customerNumber, 4)}`,
    route: `Origin ${index % 250} to Destination ${index % 400}`,
    carrier: `Carrier ${index % 80}`,
    container: `${1 + index % 4} x Equipment ${index % 12}`,
    mode,
    value: `GBP ${(1_000 + index % 90_000).toLocaleString("en-GB")}`,
    eta: `ETA ${index % 365}`,
    time: `${index % 24}:00`,
    currentLocation: `Location ${index % 500}`,
    status,
    progress,
    owner: index % 3 === 0 ? "HP" : "DR",
    tone: status === "Exception" ? "red" : status === "Delayed" ? "amber" : "teal",
    invoice: `INV-${pad(index)}`,
    jobRef: `JOB-${pad(index)}`,
    customerRef: `CUS-${pad(index % 20_000)}`,
    supplierRef: `SUP-${pad(index % 12_000)}`,
    origin: `Origin ${index % 250}`,
    destination: `Destination ${index % 400}`,
    vessel: `Vessel ${index % 120}`,
    departureDate: `2026-${pad(index % 12 + 1, 2)}-${pad(index % 28 + 1, 2)}`,
    arrivalDate: `2027-${pad(index % 12 + 1, 2)}-${pad(index % 28 + 1, 2)}`,
    departureAt: `2026-08-18T${pad(index % 24, 2)}:00:00.000Z`,
    arrivalAt: `2027-08-18T${pad(index % 24, 2)}:00:00.000Z`,
    vin: `VIN${pad(index, 14)}`,
    direction,
    shipmentType,
    isFavourite: index % 113 === 0,
    customFields: [{ label: "Tracking", value: `TRACK-${pad(index)}` }],
    updatedAt: `2026-08-${pad(index % 28 + 1, 2)}T${pad(index % 24, 2)}:00:00.000Z`,
  }
}

function quoteFixture(index) {
  const customerNumber = index % 2_000
  const mode = index % 3 === 0 ? "Air" : index % 3 === 1 ? "Sea" : "Road"
  return {
    reference: `Q-${pad(index)}`,
    status: index % 31 === 0 ? "Needs rate" : index % 13 === 0 ? "Ready to send" : "Working",
    statusTone: index % 31 === 0 ? "blue" : index % 13 === 0 ? "green" : "amber",
    customer: `Customer ${pad(customerNumber, 4)}`,
    origin: `Origin ${index % 250}`,
    destination: `Destination ${index % 400}`,
    estimatedDeparture: `2026-${pad(index % 12 + 1, 2)}-${pad(index % 28 + 1, 2)}`,
    estimatedArrival: `2027-${pad(index % 12 + 1, 2)}-${pad(index % 28 + 1, 2)}`,
    transportTime: `${1 + index % 55} days`,
    transportMode: mode,
    equipmentLoad: `${1 + index % 4} x Equipment ${index % 12}`,
    pickup: `Pickup ${index % 300}`,
    delivery: `Delivery ${index % 300}`,
    routingVia: `Via ${index % 90}`,
    incoterms: ["DAP", "FOB", "EXW"][index % 3],
    incotermsPlace: `Place ${index % 240}`,
    serviceLevel: index % 5 === 0 ? "Priority" : "Standard",
    shipmentType: mode === "Air" ? "Air freight" : mode === "Sea" ? "FCL" : "FTL",
    carrier: `Carrier ${index % 80}`,
    supplier: `Supplier ${index % 160}`,
    salesOwner: `Sales owner ${index % 20}`,
    operationsOwner: `Operations owner ${index % 20}`,
    quoteType: index % 4 === 0 ? "Contract" : "Spot",
    direction: ["Import", "Export", "Domestic", "Cross trade"][index % 4],
    customerPurchaseOrder: `PO-${pad(index % 40_000)}`,
    shipperReference: `SHIP-${pad(index % 30_000)}`,
    validity: `31 Aug 2026`,
    estimatedQuote: `Today, ${pad(index % 24, 2)}:00`,
    createdAt: `2026-08-${pad(index % 28 + 1, 2)}T${pad(index % 24, 2)}:00:00.000Z`,
    sellValue: 1_000 + index % 90_000,
    estimatedProfit: 100 + index % 9_000,
    estimatedCost: 900 + index % 81_000,
    estimatedMargin: Number((10 + index % 2_000 / 100).toFixed(2)),
    currency: ["GBP", "EUR", "USD"][index % 3],
    documentStatus: index % 4 === 0 ? "Customer copy ready" : "Draft",
    workflowStage: index % 5 === 0 ? "Ready to issue" : "Commercial review",
    priority: index % 17 === 0 ? "High" : "Standard",
    priorityTone: index % 17 === 0 ? "amber" : "neutral",
    quoteSource: index % 2 === 0 ? "Customer email" : "Repeat lane",
    updatedAt: `2026-08-${pad(index % 28 + 1, 2)}T${pad(index % 24, 2)}:30:00.000Z`,
  }
}

const bookings = Array.from({ length: recordCount }, (_, index) => bookingFixture(index))
const quotes = Array.from({ length: recordCount }, (_, index) => quoteFixture(index))

function bookingSearchValues(booking) {
  return [
    booking.id, booking.customer, booking.route, booking.carrier, booking.container, booking.mode,
    booking.value, booking.eta, booking.time, booking.status, booking.owner, booking.invoice,
    booking.jobRef, booking.customerRef, booking.supplierRef, booking.origin, booking.destination,
    booking.vessel, booking.vin,
    ...booking.customFields.flatMap((field) => [field.label, field.value, `${field.label} ${field.value}`]),
  ]
}

function quoteSearchValues(quote) {
  return Object.entries(quote)
    .filter(([key]) => key !== "statusTone" && key !== "priorityTone")
    .map(([, value]) => String(value ?? ""))
}

const workloads = [
  {
    id: "bookings-default-customer-sort",
    register: "bookings",
    source: bookings,
    select: (rows) => [...rows].sort((left, right) => left.customer.localeCompare(right.customer) || left.id.localeCompare(right.id)),
  },
  {
    id: "bookings-quick-search",
    register: "bookings",
    source: bookings,
    select: (rows) => rows
      .filter((row) => bookingSearchValues(row).some((value) => String(value).toLocaleLowerCase().includes("customer 0042")))
      .sort((left, right) => left.customer.localeCompare(right.customer) || left.id.localeCompare(right.id)),
  },
  {
    id: "quotes-default-updated-sort",
    register: "quotes",
    source: quotes,
    select: (rows) => [...rows].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.reference.localeCompare(right.reference)),
  },
  {
    id: "quotes-quick-search",
    register: "quotes",
    source: quotes,
    select: (rows) => rows
      .filter((row) => quoteSearchValues(row).some((value) => value.toLocaleLowerCase().includes("customer 0042")))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.reference.localeCompare(right.reference)),
  },
]

const serverResponses = new Map(workloads.map((workload) => {
  const matches = workload.select(workload.source)
  return [workload.id, { rows: matches.slice(0, pageSize), total: matches.length }]
}))

function byteLength(value) {
  return Buffer.byteLength(value, "utf8")
}

function consumeLegacy(workload) {
  const wire = JSON.stringify(workload.source)
  const transferredRows = JSON.parse(wire)
  const peakHeapBytes = process.memoryUsage().heapUsed
  const matches = workload.select(transferredRows)
  const rows = matches.slice(0, pageSize)
  return { rows, total: matches.length, payloadBytes: byteLength(wire), peakHeapBytes }
}

function consumeBounded(workload) {
  const wire = JSON.stringify(serverResponses.get(workload.id))
  const response = JSON.parse(wire)
  return { ...response, payloadBytes: byteLength(wire), peakHeapBytes: process.memoryUsage().heapUsed }
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    rangeMs: [sorted[0], sorted.at(-1)],
    cvPercent: Math.sqrt(variance) / mean * 100,
    rawMs: values,
  }
}

function assertSameResult(workload, result) {
  const expected = serverResponses.get(workload.id)
  const key = workload.register === "bookings" ? "id" : "reference"
  if (result.total !== expected.total) throw new Error(`${workload.id}: total changed.`)
  if (result.rows.map((row) => row[key]).join("|") !== expected.rows.map((row) => row[key]).join("|")) {
    throw new Error(`${workload.id}: first page or ordering changed.`)
  }
}

async function measure(workload) {
  const run = variant === "legacy" ? consumeLegacy : consumeBounded
  for (let index = 0; index < warmups; index += 1) {
    assertSameResult(workload, run(workload))
  }

  const durations = []
  const memoryDeltas = []
  let representative
  for (let index = 0; index < measuredRuns; index += 1) {
    global.gc?.()
    const heapBefore = process.memoryUsage().heapUsed
    const startedAt = performance.now()
    const result = run(workload)
    durations.push(performance.now() - startedAt)
    memoryDeltas.push(Math.max(result.peakHeapBytes - heapBefore, 0))
    assertSameResult(workload, result)
    representative = result
  }

  return {
    register: workload.register,
    sourceRows: workload.source.length,
    returnedRows: representative.rows.length,
    exactTotal: representative.total,
    payloadBytes: representative.payloadBytes,
    memoryDeltaBytes: statistics(memoryDeltas).medianMs,
    timing: statistics(durations),
  }
}

const results = {}
for (const workload of workloads) results[workload.id] = await measure(workload)

console.log(JSON.stringify({
  benchmark: "commercial register browser data pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and is not a live PostgreSQL or public-network latency claim.",
  recordCountPerRegister: recordCount,
  pageSize,
  warmups,
  measuredRuns,
  correctness: "PASS: exact totals and ordered first-page identifiers match the shared oracle.",
  results,
}, null, 2))
