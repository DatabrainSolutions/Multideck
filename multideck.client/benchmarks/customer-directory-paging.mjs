import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const legacyPageSize = 100
const pageSize = 50
const warmups = 2
const measuredRuns = 9
const operationsPerSample = 10
const variant = process.env.CUSTOMER_DIRECTORY_BENCHMARK_VARIANT
const workloadId = process.env.CUSTOMER_DIRECTORY_WORKLOAD ?? "all-customers"

if (variant !== "legacy" && variant !== "bounded") {
  throw new Error("Set CUSTOMER_DIRECTORY_BENCHMARK_VARIANT to legacy or bounded.")
}

const workloads = {
  "all-customers": { scope: "all", status: "All" },
  "my-premium-customers": { scope: "mine", status: "Premium" },
}

const workload = workloads[workloadId]
if (!workload) throw new Error(`Unknown CUSTOMER_DIRECTORY_WORKLOAD '${workloadId}'.`)

function pad(value, width = 6) {
  return String(value).padStart(width, "0")
}

function customerFixture(index) {
  const rawTier = index % 37 === 0
    ? "A"
    : index % 29 === 0
      ? "Premium"
      : index % 17 === 0
        ? "Trial"
        : index % 11 === 0
          ? "New"
          : index % 7 === 0
            ? "B"
            : null
  const status = rawTier === "A" || rawTier === "Premium"
    ? "Premium"
    : rawTier === "Trial" || rawTier === "New"
      ? rawTier
      : "Standard"
  const ownerId = index % 5 === 0 ? "operator-current" : `operator-${index % 23}`
  return {
    id: `customer-${pad(index)}`,
    name: `Customer ${pad(index)}`,
    initials: `C${index % 10}`,
    location: `City ${index % 500}, ${["GB", "DE", "FR", "NL"][index % 4]}`,
    industry: ["Freight", "Manufacturing", "Retail", "Automotive"][index % 4],
    contactCount: index % 18,
    status,
    relationshipStatus: index % 13 === 0 ? "prospect" : "active_customer",
    tier: rawTier,
    segment: index % 3 === 0 ? "Strategic" : null,
    ownerId,
    ownerName: ownerId === "operator-current" ? "Current Operator" : `Operator ${index % 23}`,
    healthScore: index % 101,
    lastContactAt: `2026-08-${pad(index % 28 + 1, 2)}T09:00:00.000Z`,
    nextActionDueAt: index % 19 === 0 ? "2026-08-18T09:00:00.000Z" : null,
    marketingOptIn: index % 3 === 0,
    marketingConsentSource: index % 3 === 0 ? "customer" : null,
    marketingConsentUpdatedAt: index % 3 === 0 ? "2026-08-01T09:00:00.000Z" : null,
    types: ["Customer", ["Freight", "Manufacturing", "Retail", "Automotive"][index % 4]],
  }
}

const customers = Array.from({ length: recordCount }, (_, index) => customerFixture(index))
const allCustomersWire = JSON.stringify(customers)

function inScope(customer) {
  return workload.scope === "all" || customer.ownerId === "operator-current"
}

function matchesStatus(customer) {
  return workload.status === "All" || customer.status === workload.status
}

function statusCounts(rows) {
  return {
    All: rows.length,
    Premium: rows.filter((row) => row.status === "Premium").length,
    Standard: rows.filter((row) => row.status === "Standard").length,
    Trial: rows.filter((row) => row.status === "Trial").length,
    New: rows.filter((row) => row.status === "New").length,
  }
}

function mapCustomer(customer, index) {
  return {
    id: customer.id,
    initials: customer.initials,
    name: customer.name,
    location: customer.location ?? "—",
    industry: customer.industry,
    contacts: customer.contactCount,
    active: "—",
    activeTone: "neutral",
    bookings30d: Array.from({ length: 12 }, () => 0),
    sparkTone: "teal",
    billedYtd: "—",
    onTime: "—",
    onTimeTone: "neutral",
    status: customer.status,
    owner: customer.ownerName ?? "",
    ownerId: customer.ownerId,
    avatarTone: ["teal", "blue", "olive", "cream"][index % 4],
  }
}

const scopedOracle = customers.filter(inScope)
const filteredOracle = scopedOracle.filter(matchesStatus)
const serverResponse = {
  rows: filteredOracle.slice(0, pageSize),
  total: filteredOracle.length,
  scopeTotal: scopedOracle.length,
  statusCounts: statusCounts(scopedOracle),
}
const boundedWire = JSON.stringify(serverResponse)

function byteLength(value) {
  return Buffer.byteLength(value, "utf8")
}

function consumeLegacy() {
  const transferredRows = JSON.parse(allCustomersWire)
  const mapped = transferredRows.map(mapCustomer)
  const scoped = workload.scope === "all"
    ? mapped
    : mapped.filter((customer) => customer.ownerId === "operator-current")
  const counts = statusCounts(scoped)
  const filtered = workload.status === "All"
    ? scoped
    : scoped.filter((customer) => customer.status === workload.status)
  const rows = filtered.slice(0, pageSize)
  return {
    rows,
    total: filtered.length,
    scopeTotal: scoped.length,
    statusCounts: counts,
    payloadBytes: byteLength(allCustomersWire),
    requestCount: Math.ceil(recordCount / legacyPageSize),
    peakHeapBytes: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const response = JSON.parse(boundedWire)
  return {
    ...response,
    rows: response.rows.map(mapCustomer),
    payloadBytes: byteLength(boundedWire),
    requestCount: 1,
    peakHeapBytes: process.memoryUsage().heapUsed,
  }
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
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

function assertSameResult(result) {
  if (result.total !== serverResponse.total) throw new Error(`${workloadId}: filtered total changed.`)
  if (result.scopeTotal !== serverResponse.scopeTotal) throw new Error(`${workloadId}: scope total changed.`)
  if (JSON.stringify(result.statusCounts) !== JSON.stringify(serverResponse.statusCounts)) {
    throw new Error(`${workloadId}: status counts changed.`)
  }
  if (result.rows.map((row) => row.id).join("|") !== serverResponse.rows.map((row) => row.id).join("|")) {
    throw new Error(`${workloadId}: first page or ordering changed.`)
  }
}

const consume = variant === "legacy" ? consumeLegacy : consumeBounded
for (let index = 0; index < warmups; index += 1) assertSameResult(consume())

const samples = []
const memoryDeltas = []
let representative
for (let run = 0; run < measuredRuns; run += 1) {
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  for (let operation = 0; operation < operationsPerSample; operation += 1) {
    representative = consume()
    assertSameResult(representative)
  }
  samples.push((performance.now() - startedAt) / operationsPerSample)
  memoryDeltas.push(Math.max(representative.peakHeapBytes - heapBefore, 0))
}

const timing = statistics(samples)
const memory = statistics(memoryDeltas)
const output = JSON.stringify({
  benchmark: "customer directory browser data pipeline",
  workload: workloadId,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live PostgreSQL, Edge Function, RLS, or public-network latency.",
  record_count: recordCount,
  page_size: pageSize,
  warmups,
  runs: measuredRuns,
  operations_per_sample: operationsPerSample,
  command: [
    `CUSTOMER_DIRECTORY_BENCHMARK_VARIANT=${variant}`,
    `CUSTOMER_DIRECTORY_WORKLOAD=${workloadId}`,
    "node",
    "--expose-gc",
    "benchmarks/customer-directory-paging.mjs",
  ],
  correctness: "PASS: exact scope total, filtered total, status counts and ordered first-page identifiers match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  memory_delta_bytes: memory.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.CUSTOMER_DIRECTORY_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.CUSTOMER_DIRECTORY_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
