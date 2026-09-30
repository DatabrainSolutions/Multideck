export const QUOTE_INTELLIGENCE_ALGORITHM_VERSION = "quote-intelligence-2026-09-29-v2"

export type QuoteIntelligenceState = "ready" | "building_baseline" | "updating" | "rules_only" | "unavailable"
export type QuoteIntelligenceMetricState = "ready" | "insufficient_evidence" | "missing_input"
export type QuoteIntelligenceCohort =
  | "customer_lane_mode_shipment"
  | "customer_mode"
  | "customer_history"
  | "tenant_lane_mode"
  | "tenant_mode"
  | "tenant_history"

export type IntelligenceQuoteEvidence = {
  id: string
  reference: string
  customerId: string | null
  lifecycle: string
  jobId: string | null
  currency: string
  origin: string
  destination: string
  mode: string
  shipmentType: string
  createdAt: string
  updatedAt: string
  validTo: string | null
  deadline: string | null
  cost: number
  sell: number
  profit: number
  marginPct: number | null
  fxComplete: boolean
  pricingContext?: string
  activityCodes: string[]
}

export type IntelligenceJobEvidence = {
  id: string
  customerId: string | null
  currency: string
  origin: string
  destination: string
  mode: string
  createdAt: string
  cost: number
  sell: number
  marginPct: number | null
}

export type IntelligenceRateEvidence = {
  id: string
  customerId: string | null
  currency: string
  origin: string
  destination: string
  mode: string
  shipmentType: string
  effectiveAt: string
  amount: number
  fxComplete: boolean
}

export type QuoteIntelligenceEvidence = {
  target: IntelligenceQuoteEvidence
  quotes: IntelligenceQuoteEvidence[]
  jobs: IntelligenceJobEvidence[]
  rates: IntelligenceRateEvidence[]
}

export type QuoteIntelligenceMetric<T> = {
  status: QuoteIntelligenceMetricState
  value: T | null
  evidenceCount: number
  cohort: QuoteIntelligenceCohort
  confidence: number
  reasonCode: string
  sourceQuoteIds?: string[]
}

export type QuoteIntelligenceRecentQuote = {
  id: string
  reference: string
  date: string
  lane: string
  mode: string
  revenue: number | null
  cost: number | null
  profit: number | null
  marginPct: number | null
  status: "Won" | "Lost" | "Pending"
}

export type QuoteIntelligenceDeterministic = {
  state: QuoteIntelligenceState
  currency: string
  algorithmVersion: string
  inputFingerprint: string
  evidenceFingerprint: string
  aiEligible: boolean
  scope: { customerId: string | null; quoteId: string; windowMonths: number; excludedCurrentQuote: true; historyLimit: number; pricingRule: string }
  metrics: {
    historicalWinRate: QuoteIntelligenceMetric<{ ratePct: number | null; wins: number; losses: number; pending: number; lowEvidence: boolean }>
    wonPriceBand: QuoteIntelligenceMetric<{ low: number; high: number; median: number; averageMarginPct: number | null }>
    suggestedPitch: QuoteIntelligenceMetric<{ amount: number; cost: number; profit: number }>
    marginHeadroom: QuoteIntelligenceMetric<{ amount: number }>
    priceConfidence: QuoteIntelligenceMetric<{ score: number }>
    aiWinLikelihood: QuoteIntelligenceMetric<{ basePct: number }>
    aiTemperature: QuoteIntelligenceMetric<{ baseScore: number; label: "Cold" | "Warm" | "Hot" }>
  }
  recentQuotes: QuoteIntelligenceRecentQuote[]
}

type CohortResult<T> = { code: QuoteIntelligenceCohort; rows: T[] }

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

/** Compare recorded service/cargo facts without row IDs, descriptions or contact data. */
export function quotePricingContext(incoterm: string, facts: Record<string, unknown>): string {
  const cleanNumber = (value: unknown) => {
    const number = Number(value)
    return value !== null && value !== undefined && value !== "" && Number.isFinite(number) && number > 0 ? number : null
  }
  const rows = (value: unknown) => Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []
  const containers = rows(facts.containerRequests).map((row) => ({ type: normalise(String(row.type ?? "")), quantity: cleanNumber(row.quantity) }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const cargo = rows(facts.cargoLines).map((row) => ({
    packageType: normalise(String(row.packageType ?? "")), quantity: cleanNumber(row.packageQuantity),
    grossWeightKg: cleanNumber(row.grossWeightKg), chargeableWeightKg: cleanNumber(row.chargeableWeightKg),
    volumeCbm: cleanNumber(row.volumeCbm), length: cleanNumber(row.length), width: cleanNumber(row.width), height: cleanNumber(row.height),
    lengthUnit: normalise(String(row.lengthUnit ?? "")), hazardous: row.isHazardous === true, temperatureControlled: row.isTemperatureControlled === true,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const hblMode = normalise(String(facts.hblMode ?? ""))
  if (!normalise(incoterm) || !hblMode || (!containers.length && !cargo.length)
    || containers.some((row) => !row.type || !row.quantity)
    || cargo.some((row) => !row.quantity || (!row.grossWeightKg && !row.chargeableWeightKg && !row.volumeCbm))) return ""
  return JSON.stringify({ incoterm: normalise(incoterm), hblMode, containers, cargo })
}

function finite(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function lifecycleStatus(row: IntelligenceQuoteEvidence): "Won" | "Lost" | "Pending" {
  const lifecycle = normalise(row.lifecycle)
  if (lifecycle === "accepted" || lifecycle === "converted") return "Won"
  if (lifecycle === "declined" || lifecycle === "ghosted" || lifecycle === "lost") return "Lost"
  return "Pending"
}

function matchesLane(row: { origin: string; destination: string }, target: IntelligenceQuoteEvidence) {
  const origin = normalise(target.origin)
  const destination = normalise(target.destination)
  return Boolean(origin && destination && normalise(row.origin) === origin && normalise(row.destination) === destination)
}

function matchesMode(row: { mode: string }, target: IntelligenceQuoteEvidence) {
  const mode = normalise(target.mode)
  return Boolean(mode && normalise(row.mode) === mode)
}

function matchesCustomer(row: { customerId: string | null }, target: IntelligenceQuoteEvidence) {
  return Boolean(target.customerId && row.customerId === target.customerId)
}

function matchesShipment(row: { shipmentType?: string }, target: IntelligenceQuoteEvidence) {
  const shipment = normalise(target.shipmentType)
  return Boolean(shipment && normalise(row.shipmentType) === shipment)
}

function cohortCandidates(rows: IntelligenceQuoteEvidence[], target: IntelligenceQuoteEvidence) {
  const customerRows = rows.filter((row) => matchesCustomer(row, target))
  return [
    { code: "customer_lane_mode_shipment" as const, rows: customerRows.filter((row) => matchesLane(row, target) && matchesMode(row, target) && matchesShipment(row, target)) },
    { code: "customer_mode" as const, rows: customerRows.filter((row) => matchesMode(row, target)) },
    { code: "customer_history" as const, rows: customerRows },
  ]
}

function chooseCohort(rows: IntelligenceQuoteEvidence[], target: IntelligenceQuoteEvidence): CohortResult<IntelligenceQuoteEvidence> {
  const candidates = cohortCandidates(rows, target)
  // Widen only within this customer, based on recorded outcomes rather than drafts.
  return candidates.find((candidate) => candidate.rows.filter((row) => lifecycleStatus(row) !== "Pending").length >= 10)
    ?? candidates[2]
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * quantile
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function weightedPercentile(rows: Array<{ value: number; at: string }>, quantile: number, nowMs: number) {
  if (!rows.length) return 0
  const ordered = rows
    .map((row) => {
      const ageDays = Math.max(0, (nowMs - new Date(row.at).getTime()) / 86_400_000)
      return { value: row.value, weight: 1 / (1 + ageDays / 180) }
    })
    .sort((left, right) => left.value - right.value)
  const totalWeight = ordered.reduce((sum, row) => sum + row.weight, 0)
  const targetWeight = totalWeight * quantile
  let running = 0
  for (const row of ordered) {
    running += row.weight
    if (running >= targetWeight) return row.value
  }
  return ordered.at(-1)?.value ?? 0
}

function withoutOutliers(rows: Array<{ value: number; at: string }>) {
  if (rows.length < 5) return rows
  const values = rows.map((row) => row.value)
  const q1 = percentile(values, 0.25)
  const q3 = percentile(values, 0.75)
  const range = q3 - q1
  if (range <= 0) return rows
  const minimum = q1 - 1.5 * range
  const maximum = q3 + 1.5 * range
  return rows.filter((row) => row.value >= minimum && row.value <= maximum)
}

function metric<T>(
  status: QuoteIntelligenceMetricState,
  value: T | null,
  evidenceCount: number,
  cohort: QuoteIntelligenceCohort,
  confidence: number,
  reasonCode: string,
): QuoteIntelligenceMetric<T> {
  return { status, value, evidenceCount, cohort, confidence: Math.round(clamp(confidence)), reasonCode }
}

function temperatureLabel(score: number): "Cold" | "Warm" | "Hot" {
  return score < 40 ? "Cold" : score < 70 ? "Warm" : "Hot"
}

export function buildQuoteIntelligence(
  evidence: QuoteIntelligenceEvidence,
  fingerprints: { input: string; evidence: string },
  now = new Date(),
): QuoteIntelligenceDeterministic {
  const nowMs = now.getTime()
  const target = evidence.target
  const recentCutoff = nowMs - 24 * 30.4375 * 86_400_000
  const seen = new Set<string>()
  const quotes = evidence.quotes
    .filter((row) => row.id && row.id !== target.id && matchesCustomer(row, target)
      && Number.isFinite(Date.parse(row.createdAt)) && Date.parse(row.createdAt) >= recentCutoff
      && Date.parse(row.createdAt) <= nowMs)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
    .filter((row) => { if (seen.has(row.id)) return false; seen.add(row.id); return true })
    .slice(0, 250)

  const historyCohort = chooseCohort(quotes, target)
  const won = historyCohort.rows.filter((row) => lifecycleStatus(row) === "Won")
  const lost = historyCohort.rows.filter((row) => lifecycleStatus(row) === "Lost")
  const pending = historyCohort.rows.filter((row) => lifecycleStatus(row) === "Pending")
  const resolved = won.length + lost.length
  const rawRate = resolved ? round((won.length / resolved) * 100, 1) : null
  const historicalWinRate = metric(
    resolved ? "ready" : "insufficient_evidence",
    { ratePct: rawRate, wins: won.length, losses: lost.length, pending: pending.length, lowEvidence: resolved < 10 },
    historyCohort.rows.length,
    historyCohort.code,
    Math.min(100, (resolved / 20) * 100),
    resolved ? (resolved < 10 ? "low_outcome_sample" : "observed_outcomes") : "no_resolved_quotes",
  )

  // Total prices are comparable only for the same service/cargo and a similar
  // cost basis. Jobs and flat rate lines are not complete quote selling prices.
  const pricedWonCohort = cohortCandidates(quotes, target)[0]
  const pricedWins = pricedWonCohort.rows.filter((row) => lifecycleStatus(row) === "Won"
    && row.fxComplete && normalise(row.currency) === normalise(target.currency)
    && Number.isFinite(row.sell) && row.sell > 0 && Number.isFinite(row.cost) && row.cost > 0
    && target.cost > 0 && row.cost >= target.cost * 0.75 && row.cost <= target.cost * 1.25
    && Boolean(target.pricingContext) && row.pricingContext === target.pricingContext)
  const pricedRows = withoutOutliers(pricedWins.map((row) => ({ value: row.sell, at: row.createdAt })))
  const hasWonBand = target.fxComplete && pricedRows.length >= 5
  const bandLow = hasWonBand ? weightedPercentile(pricedRows, 0.25, nowMs) : 0
  const bandHigh = hasWonBand ? weightedPercentile(pricedRows, 0.75, nowMs) : 0
  const bandMedian = hasWonBand ? weightedPercentile(pricedRows, 0.5, nowMs) : 0
  const retainedPrices = new Set(pricedRows.map((row) => row.value))
  const wonMargins = pricedWins.filter((row) => retainedPrices.has(row.sell))
    .map((row) => ((row.sell - row.cost) / row.sell) * 100)
  const averageWonMargin = wonMargins.length ? wonMargins.reduce((sum, value) => sum + value, 0) / wonMargins.length : null
  const pricingReason = !target.customerId ? "select_customer"
    : !target.pricingContext ? "add_service_and_cargo_details"
    : !target.fxComplete ? "verify_quote_currency_conversion"
    : !target.cost ? "add_quote_costs" : "needs_five_comparable_customer_wins"
  const averageAgeDays = pricedRows.length
    ? pricedRows.reduce((sum, row) => sum + (nowMs - Date.parse(row.at)) / 86_400_000, 0) / pricedRows.length : 730
  const spread = bandMedian > 0 ? Math.max(0, (bandHigh - bandLow) / bandMedian) : 1
  // Confidence is evidence quality, not a probability of a sale. Small samples
  // stay conservative even when their prices happen to be identical.
  const confidenceScore = hasWonBand && target.fxComplete
    ? Math.round(Math.min(90, (pricedRows.length / (pricedRows.length + 10)) * 100
      * Math.max(0, 1 - averageAgeDays / 730) * Math.max(0, 1 - spread))) : null
  const wonPriceBand = metric(
    hasWonBand ? "ready" : "insufficient_evidence",
    hasWonBand ? { low: round(bandLow), high: round(bandHigh), median: round(bandMedian), averageMarginPct: averageWonMargin === null ? null : round(averageWonMargin, 1) } : null,
    pricedRows.length, pricedWonCohort.code, confidenceScore ?? 0,
    hasWonBand ? "comparable_customer_won_prices" : pricingReason,
  )
  // Never raise a historical pitch to today's cost and call it evidence-backed.
  const hasSuggestion = hasWonBand && target.fxComplete && target.cost > 0 && bandMedian > target.cost
  const suggestedPitch = metric(
    hasSuggestion ? "ready" : !target.cost || !target.fxComplete || !target.pricingContext ? "missing_input" : "insufficient_evidence",
    hasSuggestion ? { amount: round(bandMedian), cost: round(target.cost), profit: round(bandMedian - target.cost) } : null,
    pricedRows.length, pricedWonCohort.code, confidenceScore ?? 0,
    hasSuggestion ? "comparable_customer_won_median" : hasWonBand ? "cost_at_or_above_customer_won_median" : pricingReason,
  )
  const marginHeadroom = metric(
    suggestedPitch.status, hasSuggestion ? { amount: round(bandMedian - target.cost) } : null,
    pricedRows.length, pricedWonCohort.code, confidenceScore ?? 0,
    hasSuggestion ? "suggested_sell_less_cost" : suggestedPitch.reasonCode,
  )
  const priceConfidence = metric(
    confidenceScore === null ? "insufficient_evidence" : "ready",
    confidenceScore === null ? null : { score: confidenceScore },
    pricedRows.length, pricedWonCohort.code, confidenceScore ?? 0,
    confidenceScore === null ? pricingReason : "customer_sample_recency_and_spread",
  )
  const resolvedTarget = lifecycleStatus(target) !== "Pending"
  // This is a smoothed customer outcome baseline, not a calibrated prediction.
  // Readiness, urgency and our own margin cannot establish customer intent.
  const baseLikelihood = !resolvedTarget && resolved >= 10 ? Math.round(((won.length + 1) / (resolved + 2)) * 100) : null
  const aiWinLikelihood = metric(
    baseLikelihood === null ? "insufficient_evidence" : "ready",
    baseLikelihood === null ? null : { basePct: baseLikelihood }, resolved,
    historyCohort.code, Math.min(90, (resolved / (resolved + 10)) * 100),
    resolvedTarget ? "quote_already_resolved" : baseLikelihood === null ? "needs_ten_resolved_customer_quotes" : "smoothed_customer_outcome_baseline",
  )
  const aiTemperature = metric(
    aiWinLikelihood.status, baseLikelihood === null ? null : { baseScore: baseLikelihood, label: temperatureLabel(baseLikelihood) },
    resolved, historyCohort.code, aiWinLikelihood.confidence,
    baseLikelihood === null ? aiWinLikelihood.reasonCode : "customer_outcome_baseline",
  )

  const recentQuotes = quotes.slice(0, 5).map((row) => ({
    id: row.id,
    reference: row.reference,
    date: row.createdAt,
    lane: [row.origin, row.destination].filter(Boolean).join(" → ") || "–",
    mode: row.mode || "–",
    revenue: row.fxComplete ? round(finite(row.sell)) : null,
    cost: row.fxComplete ? round(finite(row.cost)) : null,
    profit: row.fxComplete ? round(finite(row.profit)) : null,
    marginPct: row.fxComplete && row.marginPct !== null ? round(row.marginPct, 1) : null,
    status: lifecycleStatus(row),
  }))

  historicalWinRate.sourceQuoteIds = historyCohort.rows.map((row) => row.id)
  aiWinLikelihood.sourceQuoteIds = [...won, ...lost].map((row) => row.id)
  aiTemperature.sourceQuoteIds = aiWinLikelihood.sourceQuoteIds
  const pricingIds = pricedWins.filter((row) => retainedPrices.has(row.sell)).map((row) => row.id)
  for (const item of [wonPriceBand, suggestedPitch, marginHeadroom, priceConfidence]) item.sourceQuoteIds = pricingIds
  const metrics = { historicalWinRate, wonPriceBand, suggestedPitch, marginHeadroom, priceConfidence, aiWinLikelihood, aiTemperature }
  const priceReady = wonPriceBand.status === "ready" || suggestedPitch.status === "ready" || priceConfidence.status === "ready"
  return {
    state: historicalWinRate.status === "ready" && priceReady && (aiWinLikelihood.status === "ready" || resolvedTarget) ? "ready" : "building_baseline",
    currency: target.currency || "GBP",
    algorithmVersion: QUOTE_INTELLIGENCE_ALGORITHM_VERSION,
    inputFingerprint: fingerprints.input,
    evidenceFingerprint: fingerprints.evidence,
    aiEligible: false,
    scope: { customerId: target.customerId, quoteId: target.id, windowMonths: 24, excludedCurrentQuote: true, historyLimit: 250,
      pricingRule: "Same customer, lane, mode, shipment, service and cargo; verified currency; cost within 25%." },
    metrics,
    recentQuotes,
  }
}

export function applyQuoteIntelligenceAdjustment(deterministic: QuoteIntelligenceDeterministic, adjustmentPoints: number) {
  const adjustment = deterministic.algorithmVersion === QUOTE_INTELLIGENCE_ALGORITHM_VERSION ? 0 : clamp(finite(adjustmentPoints), -8, 8)
  const baseLikelihood = deterministic.metrics.aiWinLikelihood.value?.basePct ?? null
  const baseTemperature = deterministic.metrics.aiTemperature.value?.baseScore ?? null
  return {
    adjustmentPoints: adjustment,
    winLikelihoodPct: baseLikelihood === null ? null : Math.round(clamp(baseLikelihood + adjustment)),
    temperatureScore: baseTemperature === null ? null : Math.round(clamp(baseTemperature + adjustment * 0.45)),
    temperatureLabel: baseTemperature === null ? null : temperatureLabel(baseTemperature + adjustment * 0.45),
  }
}
