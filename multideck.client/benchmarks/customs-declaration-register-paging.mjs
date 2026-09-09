import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const pageSize = 50
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 512
const variant = process.env.CUSTOMS_REGISTER_BENCHMARK_VARIANT
const workload = process.env.CUSTOMS_REGISTER_WORKLOAD ?? "standalone"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set CUSTOMS_REGISTER_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["standalone", "job-search"]).has(workload)) throw new Error(`Unknown workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const statuses = ["draft", "draft", "validated", "submitted", "accepted", "rejected"]
const destinations = ["GB", "NL", "DE", "FR", "US", "AE", "SG", "AU"]

function timestamp(index) {
  return new Date(Date.UTC(2026, 7, 18) - index * 61_000).toISOString()
}

function declarationFixture(index) {
  const jobRelated = index % 2 === 1
  const direction = index % 4 < 2 ? "export" : "import"
  return {
    CUST_id: `00000000-0000-4000-8000-${pad(index, 12)}`,
    CUST_CreatedBy: `10000000-0000-4000-8000-${pad(index % 120, 12)}`,
    CUST_JobID: jobRelated ? `job-${pad(index)}` : null,
    CUST_Direction: direction,
    CUST_DeclarationKind: `cds_${direction}`,
    CUST_LocalReferenceNumber: `CUST-${pad(index)}`,
    CUST_TraderReference: `TRADER-${pad(index % 18_000)}`,
    CUST_Status: statuses[index % statuses.length],
    CUST_CountryOfDestinationCodeSnapshot: destinations[index % destinations.length],
    CUST_InvoiceAmount: (index % 50_000) + 0.5,
    CUST_InvoiceCurrencyCodeSnapshot: index % 5 === 0 ? "EUR" : "GBP",
    CUST_GenericPayloadJSON: { items: Array.from({ length: index % 8 }, (_, item) => ({ id: item + 1 })) },
    CUST_CreatedAt: timestamp(index + 1000),
    CUST_UpdatedAt: timestamp(index),
    CUST_IsDeleted: false,
  }
}

function jobFixture(index) {
  return {
    Job_ID: `job-${pad(index)}`,
    Job_Reference: `JOB-${pad(index)}`,
    Booking_Reference: `MD-${pad(index)}`,
    Customer_Name: `Customer ${pad(index % 5_000, 5)}`,
    Route: `${destinations[index % destinations.length]} → ${destinations[(index + 3) % destinations.length]}`,
  }
}

const declarations = Array.from({ length: recordCount }, (_, index) => declarationFixture(index))
const jobs = Array.from({ length: recordCount }, (_, index) => jobFixture(index))
const legacyWire = JSON.stringify({ declarations, jobs })

const settings = workload === "standalone"
  ? { direction: "export", scope: "standalone", search: "", status: "", destination: "" }
  : { direction: "import", scope: "job-related", search: "customer 00043", status: "", destination: "" }

function mapRow(row, job) {
  return {
    id: row.CUST_id,
    submittedBy: row.CUST_CreatedBy,
    jobId: row.CUST_JobID,
    jobReference: job?.Job_Reference ?? null,
    bookingReference: job?.Booking_Reference ?? null,
    customerName: job?.Customer_Name ?? null,
    route: job?.Route ?? null,
    reference: row.CUST_LocalReferenceNumber ?? row.CUST_id,
    traderReference: row.CUST_TraderReference,
    status: row.CUST_Status,
    destinationCountry: row.CUST_CountryOfDestinationCodeSnapshot,
    amount: Number(row.CUST_InvoiceAmount),
    currency: row.CUST_InvoiceCurrencyCodeSnapshot,
    itemCount: Array.isArray(row.CUST_GenericPayloadJSON?.items) ? row.CUST_GenericPayloadJSON.items.length : 0,
    createdAt: row.CUST_CreatedAt,
    updatedAt: row.CUST_UpdatedAt,
  }
}

function selectPage(inputDeclarations, inputJobs) {
  const jobsById = new Map(inputJobs.map((job) => [job.Job_ID, job]))
  const scoped = inputDeclarations.filter((row) => row.CUST_Direction === settings.direction
    && row.CUST_DeclarationKind === `cds_${settings.direction}`
    && !row.CUST_IsDeleted
    && (settings.scope === "standalone" ? row.CUST_JobID === null : row.CUST_JobID !== null))
  const statusesFacet = [...new Set(scoped.map((row) => row.CUST_Status).filter(Boolean))].sort()
  const destinationsFacet = [...new Set(scoped.map((row) => row.CUST_CountryOfDestinationCodeSnapshot).filter(Boolean))].sort()
  const query = settings.search.toLowerCase()
  const filtered = scoped.filter((row) => {
    if (settings.status && row.CUST_Status !== settings.status) return false
    if (settings.destination && row.CUST_CountryOfDestinationCodeSnapshot !== settings.destination) return false
    if (!query) return true
    const job = row.CUST_JobID ? jobsById.get(row.CUST_JobID) : null
    return [row.CUST_LocalReferenceNumber, row.CUST_TraderReference, row.CUST_Status, row.CUST_CountryOfDestinationCodeSnapshot, row.CUST_InvoiceCurrencyCodeSnapshot, row.CUST_InvoiceAmount, job?.Job_Reference, job?.Booking_Reference, job?.Customer_Name, job?.Route]
      .some((value) => String(value ?? "").toLowerCase().includes(query))
  })
  filtered.sort((left, right) => right.CUST_UpdatedAt.localeCompare(left.CUST_UpdatedAt) || left.CUST_id.localeCompare(right.CUST_id))
  return {
    rows: filtered.slice(0, pageSize).map((row) => mapRow(row, row.CUST_JobID ? jobsById.get(row.CUST_JobID) : null)),
    total: filtered.length,
    availableTotal: scoped.length,
    facets: { statuses: statusesFacet, destinations: destinationsFacet },
  }
}

const oracle = selectPage(declarations, jobs)
const boundedWire = JSON.stringify(oracle)

function project(result) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(result).length
  return checksum
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const result = selectPage(payload.declarations, payload.jobs)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(legacyWire), requestCount: 2, heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const result = JSON.parse(boundedWire)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(boundedWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
}

function signature(result) {
  return JSON.stringify({ total: result.total, availableTotal: result.availableTotal, facets: result.facets, ids: result.rows.map((row) => row.id), rows: result.rows })
}

const oracleSignature = signature(oracle)
function assertCorrect(result) {
  if (signature(result.result) !== oracleSignature) throw new Error(`${workload}: totals, facets, rows or ordering changed.`)
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
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
  benchmark: "Customs declaration register browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live PostgreSQL, RLS, rendering or public-network latency.",
  record_count: recordCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: exact scope/filter totals, facets, ordered first page and hydrated job fields match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.CUSTOMS_REGISTER_BENCHMARK_OUTPUT) writeFileSync(process.env.CUSTOMS_REGISTER_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
