import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const recordCount = 100_000
const pageSize = 50
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 256
const variant = process.env.RATES_BENCHMARK_VARIANT
const workload = process.env.RATES_BENCHMARK_WORKLOAD ?? "contracts"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set RATES_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["contracts", "tariff-search"]).has(workload)) throw new Error(`Unknown Rates workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const types = ["contract", "cost_tariff", "sales_tariff"]
const statuses = ["active", "active", "active", "draft", "expired"]
const modes = ["fcl", "lcl", "air", "road"]

function dateFromToday(days) {
  return new Date(Date.UTC(2026, 7, 18) + days * 86_400_000).toISOString().slice(0, 10)
}

function timestamp(index) {
  return new Date(Date.UTC(2026, 7, 18) - index * 59_000).toISOString()
}

function rateFixture(index) {
  const type = types[index % types.length]
  const status = statuses[index % statuses.length]
  const mode = modes[index % modes.length]
  const validToOffset = (index % 180) - 45
  const buyTotal = 200 + (index % 20_000)
  const sellTotal = buyTotal + 40 + (index % 400)
  return {
    id: `00000000-0000-4000-8000-${pad(index, 12)}`,
    code: `RATE-${pad(index)}`,
    name: `${type === "contract" ? "Agreement" : "Tariff"} ${pad(index)}`,
    type,
    status,
    mode,
    carrier: `Carrier ${pad(index % 200, 3)}`,
    supplier: `Supplier ${pad(index % 500, 3)}`,
    customer: type === "sales_tariff" && index % 2 === 0 ? `Customer ${pad(index % 5_000, 5)}` : "",
    origin: `Origin ${pad(index % 700, 3)}`,
    destination: `Destination ${pad((index + 91) % 700, 3)}`,
    cargo: `Cargo ${pad(index % 40, 2)}`,
    service: index % 3 === 0 ? "Priority" : "Standard",
    validFrom: dateFromToday(-30),
    validTo: dateFromToday(validToOffset),
    currency: "GBP",
    buyTotal,
    sellTotal,
    marginAmount: sellTotal - buyTotal,
    marginPercent: ((sellTotal - buyTotal) / sellTotal) * 100,
    versionNo: 1 + (index % 12),
    sourceType: index % 4 === 0 ? "upload" : "manual",
    sourceReference: `SRC-${pad(index)}`,
    schedule: index % 3 === 0 ? "weekly" : index % 3 === 1 ? "monthly" : "ad_hoc",
    modeDetails: { equipment: index % 2 ? "40HC" : "20GP" },
    charges: [{ description: "Freight", basis: "shipment", buyAmount: buyTotal, sellAmount: sellTotal }],
    updatedAt: timestamp(index),
    updatedBy: `Operator ${index % 120}`,
  }
}

function versionFixture(rate, index) {
  return {
    id: `10000000-0000-4000-8000-${pad(index, 12)}`,
    rateId: rate.id,
    versionNo: rate.versionNo,
    status: rate.status,
    effectiveFrom: rate.validFrom,
    effectiveTo: rate.validTo,
    changeReason: "Initial version",
    sourceReference: rate.sourceReference,
    createdAt: rate.updatedAt,
    createdBy: rate.updatedBy,
  }
}

const rates = Array.from({ length: recordCount }, (_, index) => rateFixture(index))
const versions = rates.map(versionFixture)
const imports = Array.from({ length: 100 }, (_, index) => ({ id: `import-${index}`, fileName: `rates-${index}.xlsx`, sourceType: "upload", status: index % 4 === 0 ? "review" : "saved", rowCount: 250, errorCount: 0, warningCount: index % 3, createdAt: timestamp(index) }))
const quotes = Array.from({ length: 100 }, (_, index) => ({ id: `quote-${index}`, reference: `Q-${pad(index)}`, customer: `Customer ${index}`, origin: "GBSOU", destination: "NLRTM", mode: "sea", equipment: "FCL", currency: "GBP" }))
const legacyWire = JSON.stringify({ rates, versions, audit: [], imports, quotes, permissions: { canManage: true }, integrations: { seaRates: { connected: false, reason: "Not configured" } } })

const settings = workload === "contracts"
  ? { scope: "contracts", search: "", mode: "all", tariffType: "all", expiry: "", sort: "name", direction: "asc" }
  : { scope: "tariffs", search: "customer 00042", mode: "all", tariffType: "sales_tariff", expiry: "", sort: "validity", direction: "asc" }

function daysUntil(date) {
  return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.UTC(2026, 7, 18)) / 86_400_000)
}

function matches(rate) {
  if (settings.scope === "contracts" ? rate.type !== "contract" : rate.type === "contract") return false
  if (settings.mode !== "all" && rate.mode !== settings.mode) return false
  if (settings.tariffType !== "all" && rate.type !== settings.tariffType) return false
  const days = daysUntil(rate.validTo)
  if (settings.expiry === "expired" && !(rate.status === "expired" || days < 0)) return false
  if (settings.expiry === "7" && !(days >= 0 && days <= 7)) return false
  if (settings.expiry === "30" && !(days > 7 && days <= 30)) return false
  if (settings.expiry === "active" && !(rate.status === "active" && days > 30)) return false
  const searchable = `${rate.code} ${rate.name} ${rate.carrier} ${rate.supplier} ${rate.customer} ${rate.origin} ${rate.destination} ${rate.cargo}`.toLowerCase()
  return searchable.includes(settings.search.toLowerCase())
}

function sortRates(rows) {
  return rows.sort((left, right) => {
    const leftValue = settings.sort === "validity" ? left.validTo : left.name.toLowerCase()
    const rightValue = settings.sort === "validity" ? right.validTo : right.name.toLowerCase()
    const compared = String(leftValue).localeCompare(String(rightValue))
    return (settings.direction === "asc" ? compared : -compared) || right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
  })
}

function summary(source) {
  const tariffs = source.filter((rate) => rate.type !== "contract")
  return {
    total: source.length,
    attention: source.filter((rate) => rate.status === "draft" || rate.status === "expired" || daysUntil(rate.validTo) <= 30).length,
    active: source.filter((rate) => rate.status === "active" && daysUntil(rate.validTo) >= 0).length,
    drafts: source.filter((rate) => rate.status === "draft").length,
    sourcesInReview: imports.filter((item) => item.status === "review").length,
    costTariffs: tariffs.filter((rate) => rate.type === "cost_tariff").length,
    salesTariffs: tariffs.filter((rate) => rate.type === "sales_tariff").length,
    customerSpecific: tariffs.filter((rate) => Boolean(rate.customer)).length,
    expiringTariffs: tariffs.filter((rate) => daysUntil(rate.validTo) >= 0 && daysUntil(rate.validTo) <= 30).length,
  }
}

function selectBounded(source) {
  const filtered = sortRates(source.filter(matches))
  const attention = source.filter((rate) => rate.status === "draft" || rate.status === "expired" || daysUntil(rate.validTo) <= 30).slice(0, 6)
  const recent = [...source].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 5)
  return { rows: filtered.slice(0, pageSize), total: filtered.length, summary: summary(source), attention, recent, imports, quotes }
}

const oracle = selectBounded(rates)
const boundedWire = JSON.stringify(oracle)

function project(result) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(result).length
  return checksum
}

function consumeLegacy() {
  const workspace = JSON.parse(legacyWire)
  const result = selectBounded(workspace.rates)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(legacyWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  const result = JSON.parse(boundedWire)
  return { result, projection: project(result), payloadBytes: Buffer.byteLength(boundedWire), requestCount: 2, heap: process.memoryUsage().heapUsed }
}

const oracleSignature = JSON.stringify(oracle)
function assertCorrect(result) {
  if (JSON.stringify(result.result) !== oracleSignature) throw new Error(`${workload}: summary, dashboard queues, totals or ordered first page changed.`)
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
  benchmark: "Rates workspace and register browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS, rendering or public-network latency.",
  rate_count: recordCount,
  version_count: recordCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: exact summary, dashboard queues, filtered total and ordered first page match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.RATES_BENCHMARK_OUTPUT) writeFileSync(process.env.RATES_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
