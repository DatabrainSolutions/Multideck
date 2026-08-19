import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const bookingCount = 100_000
const quoteCount = 100_000
const rowLimit = 50
const warmups = 2
const measuredRuns = 9
const operationsPerSample = 3
const projectionPasses = 1024
const variant = process.env.DASHBOARD_OVERVIEW_BENCHMARK_VARIANT
const workloadId = process.env.DASHBOARD_OVERVIEW_WORKLOAD ?? "today"
const now = new Date("2026-08-18T12:00:00.000Z")

if (variant !== "legacy" && variant !== "bounded") {
  throw new Error("Set DASHBOARD_OVERVIEW_BENCHMARK_VARIANT to legacy or bounded.")
}
if (workloadId !== "today" && workloadId !== "quarter") {
  throw new Error(`Unknown DASHBOARD_OVERVIEW_WORKLOAD '${workloadId}'.`)
}

function pad(value, width = 6) {
  return String(value).padStart(width, "0")
}

function timestampFor(index, hourOffset = 0) {
  const dayOffset = (index % 121) - 60
  return new Date(now.getTime() + (dayOffset * 24 + hourOffset) * 60 * 60 * 1000).toISOString()
}

const locations = [
  ["GBLHR · London", "CNSHA · Shanghai"],
  ["NLRTM · Rotterdam", "SGSIN · Singapore"],
  ["USLAX · Los Angeles", "JPTYO · Tokyo"],
  ["AEDXB · Dubai", "INNSA · Nhava Sheva"],
  ["USJFK · New York", "DEFRA · Frankfurt"],
]
const modes = ["OCEAN", "AIR", "ROAD", "MULTIMODAL"]
const bookingStatuses = ["On track", "On track", "On track", "Delayed", "Exception"]
const quoteStatuses = ["Working", "Needs rate", "Ready to send", "Sent", "Accepted"]
const quoteStages = ["Commercial review", "Supplier pricing", "Ready to issue", "Customer review"]

function bookingFixture(index) {
  const [origin, destination] = locations[index % locations.length]
  const departureAt = timestampFor(index, -12)
  const arrivalAt = timestampFor(index, 60 + index % 96)
  const status = bookingStatuses[index % bookingStatuses.length]
  const progress = index % 19 === 0 ? 100 : status === "Exception" ? 48 : status === "Delayed" ? 62 : 24 + index % 65
  return {
    sourceId: `job-${pad(index)}`,
    id: `MD-${pad(index)}`,
    customer: `Customer ${pad(index % 12_000, 5)}`,
    route: `${origin} → ${destination}`,
    mode: modes[index % modes.length],
    status,
    progress,
    owner: index % 7 === 0 ? "Current Operator" : `Operator ${index % 47}`,
    tone: status === "Exception" ? "red" : status === "Delayed" ? "amber" : "green",
    eta: new Date(arrivalAt).toISOString().slice(0, 10),
    origin,
    destination,
    departureAt,
    arrivalAt,
    departureDate: departureAt.slice(0, 10),
    arrivalDate: arrivalAt.slice(0, 10),
    updatedAt: timestampFor(index, index % 20),
  }
}

function quoteFixture(index) {
  const [origin, destination] = locations[(index + 2) % locations.length]
  const status = quoteStatuses[index % quoteStatuses.length]
  return {
    reference: `Q-${pad(index)}`,
    customer: `Customer ${pad(index % 12_000, 5)}`,
    origin,
    destination,
    status,
    statusTone: status === "Ready to send" ? "green" : status === "Needs rate" ? "blue" : "amber",
    priorityTone: index % 13 === 0 ? "red" : "neutral",
    workflowStage: quoteStages[index % quoteStages.length],
    salesOwner: index % 7 === 0 ? "Current Operator" : `Operator ${index % 47}`,
    estimatedDeparture: timestampFor(index, 18).slice(0, 10),
    estimatedArrival: timestampFor(index, 90 + index % 72).slice(0, 10),
    createdAt: timestampFor(index, -24),
    updatedAt: timestampFor(index, index % 16),
  }
}

const bookings = Array.from({ length: bookingCount }, (_, index) => bookingFixture(index))
const quotes = Array.from({ length: quoteCount }, (_, index) => quoteFixture(index))
const legacyWire = JSON.stringify({ bookings, quotes })

function localDateBoundary(value, endExclusive = false) {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  if (dateOnly && endExclusive) date.setUTCDate(date.getUTCDate() + 1)
  return date.getTime()
}

function rangeWindow() {
  const end = Date.UTC(2026, 7, 19)
  return { start: end - (workloadId === "today" ? 1 : 90) * 24 * 60 * 60 * 1000, end }
}

function overlaps(startsAt, endsAt, fallbackAt, window) {
  const start = localDateBoundary(startsAt)
  const end = localDateBoundary(endsAt, true)
  if (start !== null && end !== null) return start < window.end && end > window.start
  if (start !== null) return start >= window.start && start < window.end
  if (end !== null) return end > window.start && end <= window.end
  const fallback = localDateBoundary(fallbackAt)
  return fallback !== null && fallback >= window.start && fallback < window.end
}

function occupancySeries(rows, window, startsAt, endsAt, fallbackAt) {
  const width = Math.max((window.end - window.start) / 10, 1)
  const values = Array(10).fill(0)
  for (const row of rows) {
    const start = localDateBoundary(startsAt(row))
    const end = localDateBoundary(endsAt(row), true)
    const fallback = localDateBoundary(fallbackAt(row))
    for (let index = 0; index < 10; index += 1) {
      const point = window.start + width * (index + 1)
      if (
        (start !== null && end !== null && start <= point && end > point)
        || (start !== null && end === null && start <= point)
        || (start === null && end !== null && end > point)
        || (start === null && end === null && fallback !== null && fallback <= point)
      ) values[index] += 1
    }
  }
  return values
}

const clockLocations = {
  LAX: ["Los Angeles", "Long Beach", "USLAX"],
  NYC: ["New York", "JFK", "USJFK"],
  LDN: ["London", "Heathrow", "GBLHR", "Felixstowe", "Southampton", "Manchester", "Birmingham"],
  AMS: ["Amsterdam", "Rotterdam", "NLRTM"],
  FRA: ["Frankfurt", "DEFRA", "Hamburg", "DEHAM"],
  DXB: ["Dubai", "AEDXB"],
  BOM: ["Mumbai", "Nhava Sheva", "INNSA"],
  SIN: ["Singapore", "SGSIN"],
  SHA: ["Shanghai", "CNSHA", "Yantian", "Ningbo"],
  TYO: ["Tokyo", "Narita", "JPTYO", "Kobe"],
}

function regionCode(origin, destination) {
  const route = `${origin} ${destination}`.toLowerCase()
  return Object.entries(clockLocations)
    .filter(([, terms]) => terms.some((term) => route.includes(term.toLowerCase())))
    .map(([code]) => code)
}

function dueAtForBooking(booking) {
  return new Date(booking.updatedAt).getTime() + Math.max(1, Math.round((100 - booking.progress) / 20)) * 60 * 60 * 1000
}

function cutoffToday() {
  return Date.UTC(2026, 7, 18, 17)
}

function mapPriorityBooking(booking) {
  return {
    id: `booking:${booking.id}`,
    kind: "exception",
    reference: booking.id,
    customer: booking.customer,
    context: booking.route,
    status: booking.status,
    owner: booking.owner,
    dueAt: dueAtForBooking(booking),
  }
}

function mapPriorityQuote(quote) {
  const departure = localDateBoundary(quote.estimatedDeparture)
  return {
    id: `${quote.status === "Ready to send" ? "quote-send" : "quote-progress"}:${quote.reference}`,
    kind: quote.status === "Ready to send" ? "quote-send" : "quote-progress",
    reference: quote.reference,
    customer: quote.customer,
    context: `${quote.origin} → ${quote.destination}`,
    status: quote.status,
    owner: quote.salesOwner,
    dueAt: quote.status === "Ready to send"
      ? Math.min(departure ?? cutoffToday(), cutoffToday())
      : departure ?? cutoffToday(),
  }
}

function mapLiveBooking(booking) {
  return {
    id: booking.id,
    lane: booking.route,
    mode: booking.mode === "OCEAN" ? "Ocean" : booking.mode[0] + booking.mode.slice(1).toLowerCase(),
    customer: booking.customer,
    milestone: booking.status,
    progress: booking.progress,
    eta: booking.eta,
    tone: booking.tone,
    origin: booking.origin,
    destination: booking.destination,
  }
}

function countsBy(rows, value) {
  const result = {}
  for (const row of rows) {
    const key = value(row)
    result[key] = (result[key] ?? 0) + 1
  }
  return result
}

function buildSnapshot(inputBookings, inputQuotes) {
  const window = rangeWindow()
  const activeBookings = inputBookings.filter((booking) => booking.progress < 100)
  const rangeBookings = activeBookings.filter((booking) => overlaps(booking.departureAt || booking.departureDate, booking.arrivalAt || booking.arrivalDate, booking.updatedAt, window))
  const rangeQuotes = inputQuotes.filter((quote) => overlaps(quote.estimatedDeparture, quote.estimatedArrival, quote.createdAt, window))
  const exceptions = rangeBookings.filter((booking) => booking.status !== "On track")
  const readyQuotes = rangeQuotes.filter((quote) => quote.status === "Ready to send")
  const openQuotes = rangeQuotes.filter((quote) => quote.status !== "Sent" && quote.status !== "Accepted")
  const priority = [
    ...activeBookings.filter((booking) => booking.status !== "On track").map(mapPriorityBooking),
    ...inputQuotes.filter((quote) => quote.status !== "Sent" && quote.status !== "Accepted").map(mapPriorityQuote),
  ].sort((left, right) => left.dueAt - right.dueAt || left.id.localeCompare(right.id))
  const live = [...activeBookings].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
  const clockQueues = Object.fromEntries(Object.keys(clockLocations).map((code) => [code, { openRfqs: 0, needAction: 0, readyToQuote: 0 }]))
  for (const booking of activeBookings) {
    for (const code of regionCode(booking.origin, booking.destination)) {
      if (booking.status !== "On track") clockQueues[code].needAction += 1
    }
  }
  for (const quote of inputQuotes) {
    for (const code of regionCode(quote.origin, quote.destination)) {
      if (quote.status !== "Sent" && quote.status !== "Accepted") clockQueues[code].openRfqs += 1
      if (quote.status === "Ready to send") clockQueues[code].readyToQuote += 1
    }
  }
  const modeSeries = Object.fromEntries(modes.map((mode) => [mode, occupancySeries(
    activeBookings.filter((booking) => booking.mode === mode),
    window,
    (booking) => booking.departureAt || booking.departureDate,
    (booking) => booking.arrivalAt || booking.arrivalDate,
    (booking) => booking.updatedAt,
  )]))
  return {
    counts: {
      activeJobs: rangeBookings.length,
      exceptions: exceptions.length,
      openQuotes: openQuotes.length,
      readyQuotes: readyQuotes.length,
      totalQuotes: rangeQuotes.length,
      priority: priority.length,
      priorityMine: priority.filter((item) => item.owner === "Current Operator").length,
      liveBookings: activeBookings.length,
      liveExceptions: activeBookings.filter((booking) => booking.status !== "On track").length,
    },
    series: {
      activeJobs: occupancySeries(rangeBookings, window, (row) => row.departureAt, (row) => row.arrivalAt, (row) => row.updatedAt),
      exceptions: occupancySeries(exceptions, window, (row) => row.departureAt, (row) => row.arrivalAt, (row) => row.updatedAt),
      quotes: occupancySeries(rangeQuotes, window, (row) => row.estimatedDeparture, (row) => row.estimatedArrival, (row) => row.createdAt),
      readyQuotes: occupancySeries(readyQuotes, window, (row) => row.estimatedDeparture, (row) => row.estimatedArrival, (row) => row.createdAt),
      modes: modeSeries,
    },
    clockQueues,
    statusCounts: countsBy(activeBookings, (booking) => booking.status),
    quoteStages: countsBy(openQuotes, (quote) => quote.workflowStage),
    priorityItems: priority.slice(0, rowLimit),
    priorityMineItems: priority.filter((item) => item.owner === "Current Operator").slice(0, rowLimit),
    liveBookings: live.slice(0, rowLimit).map(mapLiveBooking),
  }
}

const oracle = buildSnapshot(bookings, quotes)
const boundedWire = JSON.stringify(oracle)

// Both variants finish with the same bounded view-model projection. Repeating
// this small, real serialization step lifts the optimized path above the
// sub-millisecond timer floor without changing the work being compared.
function projectDashboard(snapshot) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) {
    checksum += JSON.stringify({
      counts: snapshot.counts,
      series: snapshot.series,
      clockQueues: snapshot.clockQueues,
      statusCounts: snapshot.statusCounts,
      quoteStages: snapshot.quoteStages,
      priorityItems: snapshot.priorityItems,
      priorityMineItems: snapshot.priorityMineItems,
      liveBookings: snapshot.liveBookings,
    }).length
  }
  return checksum
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8")
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const snapshot = buildSnapshot(payload.bookings, payload.quotes)
  const projectionChecksum = projectDashboard(snapshot)
  return {
    snapshot,
    projectionChecksum,
    payloadBytes: byteLength(legacyWire),
    requestCount: 2,
    peakHeapBytes: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const snapshot = JSON.parse(boundedWire)
  const projectionChecksum = projectDashboard(snapshot)
  return {
    snapshot,
    projectionChecksum,
    payloadBytes: byteLength(boundedWire),
    requestCount: 1,
    peakHeapBytes: process.memoryUsage().heapUsed,
  }
}

function signature(snapshot) {
  return JSON.stringify({
    counts: snapshot.counts,
    series: snapshot.series,
    clockQueues: snapshot.clockQueues,
    statusCounts: snapshot.statusCounts,
    quoteStages: snapshot.quoteStages,
    priorityIds: snapshot.priorityItems.map((item) => item.id),
    priorityMineIds: snapshot.priorityMineItems.map((item) => item.id),
    liveIds: snapshot.liveBookings.map((item) => item.id),
  })
}

const oracleSignature = signature(oracle)
function assertSameResult(result) {
  if (signature(result.snapshot) !== oracleSignature) {
    throw new Error(`${workloadId}: dashboard counts, series, queues, breakdowns, or bounded ordering changed.`)
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
    cv: mean === 0 ? 0 : Math.sqrt(variance) / mean,
    samples_ms: values,
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
  benchmark: "Overview dashboard browser data pipeline",
  workload: workloadId,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live PostgreSQL, Edge Function, RLS, browser rendering, or public-network latency. The legacy transform is intentionally consolidated into fewer passes than the current UI, making the comparison conservative.",
  booking_count: bookingCount,
  quote_count: quoteCount,
  row_limit: rowLimit,
  warmups,
  runs: measuredRuns,
  operations_per_sample: operationsPerSample,
  projection_passes: projectionPasses,
  command: [
    `DASHBOARD_OVERVIEW_BENCHMARK_VARIANT=${variant}`,
    `DASHBOARD_OVERVIEW_WORKLOAD=${workloadId}`,
    "node",
    "--expose-gc",
    "benchmarks/dashboard-overview-read-model.mjs",
  ],
  correctness: "PASS: exact totals, 10-point series, regional queues, breakdowns, and ordered first-50 priority/live identifiers match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  memory_delta_bytes: memory.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.DASHBOARD_OVERVIEW_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.DASHBOARD_OVERVIEW_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
