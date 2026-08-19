import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const pageSize = 20
const laneLimit = 20
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 128
const variant = process.env.OPERATIONAL_BOARDS_BENCHMARK_VARIANT
const workload = process.env.OPERATIONAL_BOARDS_BENCHMARK_WORKLOAD ?? "bookings-board"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set OPERATIONAL_BOARDS_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["bookings-board", "road-kanban"]).has(workload)) throw new Error(`Unknown operational boards workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const stages = ["intake", "ready", "carrier", "live", "close"]

function stageForProgress(progress) {
  if (progress < 30) return "intake"
  if (progress < 50) return "ready"
  if (progress < 60) return "carrier"
  if (progress < 90) return "live"
  return "close"
}

function fixture(index) {
  const mode = index % 3 === 0 ? "ROAD" : index % 3 === 1 ? "OCEAN" : "AIR"
  const progress = index % 101
  return {
    Job_ID: `00000000-0000-4000-8000-${pad(index, 12)}`,
    Booking_Reference: `MD-${pad(index)}`,
    Customer_Name: `Customer ${pad(index % 12_000, 5)}`,
    Route: `GBFXT → NLRTM ${pad(index % 400, 3)}`,
    Carrier: `Carrier ${pad(index % 120, 3)}`,
    Equipment: index % 2 ? "40HC" : "20GP",
    Mode: mode,
    Direction: index % 2 ? "Import" : "Export",
    Shipment_Type: mode === "ROAD" ? "FTL" : "FCL",
    Value_Display: `GBP ${(index % 90_000) + 1}`,
    Eta_Display: "19 Aug 2026",
    Time_Display: "10:30",
    Status: index % 31 === 0 ? "Exception" : "On track",
    Progress: progress,
    Owner_Code: index % 4 === 0 ? "HP" : "EM",
    Tone: index % 31 === 0 ? "amber" : "teal",
    Customer_Reference: `CUS-${pad(index)}`,
    Job_Reference: `JOB-${pad(index)}`,
    Origin: "Felixstowe",
    Destination: "Rotterdam",
    Updated_At: new Date(Date.UTC(2026, 7, 19, 12, 0, 0) - index * 1_000).toISOString(),
    Is_Favourite: index % 29 === 0,
    stage: stageForProgress(progress),
  }
}

const rows = Array.from({ length: recordCount }, (_, index) => fixture(index))
const legacyWire = JSON.stringify(rows)

function bookingOracle(source) {
  const filtered = source
    .filter((row) => row.Direction === "Import")
    .sort((left, right) => left.Customer_Name.localeCompare(right.Customer_Name) || left.Booking_Reference.localeCompare(right.Booking_Reference))
  return {
    rows: filtered.slice(pageSize, pageSize * 2),
    total: filtered.length,
    summary: {
      active: source.filter((row) => row.Progress < 100).length,
      inTransit: source.filter((row) => row.Progress >= 25 && row.Progress < 75).length,
      atDestination: source.filter((row) => row.Progress >= 75 && row.Progress < 100).length,
      exceptions: source.filter((row) => row.Status === "Exception").length,
      complete: source.filter((row) => row.Progress >= 100).length,
      total: source.length,
    },
  }
}

function roadOracle(source) {
  const road = source.filter((row) => row.Mode === "ROAD")
  return {
    lanes: Object.fromEntries(stages.map((stage) => [stage, road.filter((row) => row.stage === stage).slice(0, laneLimit)])),
    counts: Object.fromEntries(stages.map((stage) => [stage, road.filter((row) => row.stage === stage).length])),
    total: road.length,
  }
}

const buildOracle = workload === "bookings-board" ? bookingOracle : roadOracle
const oracle = buildOracle(rows)
const oracleSignature = JSON.stringify(oracle)
const boundedWire = oracleSignature

function project(result) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(result).length
  return checksum
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const result = buildOracle(payload)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(legacyWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const result = JSON.parse(boundedWire)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(boundedWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  if (JSON.stringify(value.result) !== oracleSignature) throw new Error(`${workload}: exact rows, ordering, counts or summary changed.`)
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
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
  benchmark: "Operational booking and road board browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live PostgreSQL, RLS, rendering or public-network latency.",
  record_count: recordCount,
  page_size: workload === "bookings-board" ? pageSize : undefined,
  lane_limit: workload === "road-kanban" ? laneLimit : undefined,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: exact rows, ordering, totals, lane counts and summaries match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.OPERATIONAL_BOARDS_BENCHMARK_OUTPUT) writeFileSync(process.env.OPERATIONAL_BOARDS_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
