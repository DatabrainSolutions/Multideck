export const QUOTE_INTELLIGENCE_ALGORITHM_VERSION = "quote-intelligence-2026-08-20-v1"

export type QuoteIntelligenceState = "ready" | "building_baseline" | "updating" | "rules_only" | "unavailable"
export type QuoteIntelligenceMetricState = "ready" | "insufficient_evidence" | "missing_input"
export type QuoteIntelligenceCohort =
  | "customer_lane_mode_shipment"
  | "customer_mode"
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
  if (row.jobId || lifecycle === "accepted" || lifecycle === "converted") return "Won"
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

function cohortCandidates<T extends { customerId: string | null; origin: string; destination: string; mode: string; shipmentType?: string }>(
  rows: T[],
  target: IntelligenceQuoteEvidence,
) {
  return [
    { code: "customer_lane_mode_shipment" as const, rows: rows.filter((row) => matchesCustomer(row, target) && matchesLane(row, target) && matchesMode(row, target) && matchesShipment(row, target)) },
    { code: "customer_mode" as const, rows: rows.filter((row) => matchesCustomer(row, target) && matchesMode(row, target)) },
    { code: "tenant_lane_mode" as const, rows: rows.filter((row) => matchesLane(row, target) && matchesMode(row, target)) },
    { code: "tenant_mode" as const, rows: rows.filter((row) => matchesMode(row, target)) },
  ]
}

function chooseCohort<T extends { customerId: string | null; origin: string; destination: string; mode: string; shipmentType?: string }>(
  rows: T[],
  target: IntelligenceQuoteEvidence,
  qualifies: (rows: T[]) => boolean,
): CohortResult<T> {
  const match = cohortCandidates(rows, target).find((candidate) => qualifies(candidate.rows))
  return match ?? { code: "tenant_history", rows }
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

function weightedScore(parts: Array<{ value: number | null; weight: number }>) {
  const available = parts.filter((part): part is { value: number; weight: number } => part.value !== null && Number.isFinite(part.value))
  const weight = available.reduce((sum, part) => sum + part.weight, 0)
  if (!weight) return null
  return available.reduce((sum, part) => sum + part.value * part.weight, 0) / weight
}

function cohortSpecificity(code: QuoteIntelligenceCohort) {
  return ({
    customer_lane_mode_shipment: 1,
    customer_mode: 0.82,
    tenant_lane_mode: 0.68,
    tenant_mode: 0.52,
    tenant_history: 0.35,
  } as const)[code]
}

function readiness(target: IntelligenceQuoteEvidence) {
  const values = [target.customerId, target.origin, target.destination, target.mode, target.shipmentType, target.currency, target.validTo]
  const completed = values.filter((value) => Boolean(String(value ?? "").trim())).length
  const commercial = target.cost > 0 && target.sell > 0 ? 1 : target.cost > 0 || target.sell > 0 ? 0.5 : 0
  return clamp(((completed + commercial) / 8) * 100)
}

function urgencyAndActivity(target: IntelligenceQuoteEvidence, nowMs: number) {
  const activeEvent = target.activityCodes.some((code) => ["sent", "revised", "customer_replied", "opened"].includes(normalise(code)))
  const due = target.deadline || target.validTo
  if (!activeEvent && !due) return null
  let urgency = activeEvent ? 70 : 45
  if (due) {
    const days = (new Date(due).getTime() - nowMs) / 86_400_000
    if (days <= 1) urgency = Math.max(urgency, 90)
    else if (days <= 3) urgency = Math.max(urgency, 75)
    else if (days <= 7) urgency = Math.max(urgency, 60)
  }
  return urgency
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
  const quotes = evidence.quotes
    .filter((row) => new Date(row.createdAt).getTime() >= recentCutoff)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 250)

  const historyCohort = chooseCohort(quotes, target, (rows) => rows.length >= 5)
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

  const pricedWonCohort = chooseCohort(
    quotes,
    target,
    (rows) => rows.filter((row) => lifecycleStatus(row) === "Won" && row.sell > 0 && row.fxComplete).length >= 5,
  )
  const pricedWins = pricedWonCohort.rows.filter((row) => lifecycleStatus(row) === "Won" && row.sell > 0 && row.fxComplete)
  const pricedRows = withoutOutliers(pricedWins.map((row) => ({ value: row.sell, at: row.createdAt })))
  const hasWonBand = pricedRows.length >= 5
  const bandLow = hasWonBand ? weightedPercentile(pricedRows, 0.25, nowMs) : 0
  const bandHigh = hasWonBand ? weightedPercentile(pricedRows, 0.75, nowMs) : 0
  const bandMedian = hasWonBand ? weightedPercentile(pricedRows, 0.5, nowMs) : 0
  const wonMargins = pricedWins.map((row) => row.marginPct).filter((value): value is number => value !== null && Number.isFinite(value))
  const averageWonMargin = wonMargins.length ? wonMargins.reduce((sum, value) => sum + value, 0) / wonMargins.length : null
  const wonPriceBand = metric(
    hasWonBand ? "ready" : "insufficient_evidence",
    hasWonBand ? { low: round(bandLow), high: round(bandHigh), median: round(bandMedian), averageMarginPct: averageWonMargin === null ? null : round(averageWonMargin, 1) } : null,
    pricedRows.length,
    pricedWonCohort.code,
    hasWonBand ? Math.min(100, 45 + pricedRows.length * 3) * cohortSpecificity(pricedWonCohort.code) : 0,
    hasWonBand ? "won_price_distribution" : "needs_five_priced_wins",
  )

  const comparableJobs = cohortCandidates(evidence.jobs, target)
    .find((candidate) => candidate.rows.filter((row) => row.sell > 0 && row.cost > 0).length >= 5)
    ?? { code: "tenant_history" as const, rows: evidence.jobs }
  const jobPrices = comparableJobs.rows.filter((row) => row.sell > 0 && row.cost > 0).map((row) => ({ value: row.sell, at: row.createdAt }))
  const matchingRates = cohortCandidates(evidence.rates, target)
    .find((candidate) => candidate.rows.some((row) => row.amount > 0 && row.fxComplete))
    ?? { code: "tenant_history" as const, rows: evidence.rates }
  const ratePrices = matchingRates.rows.filter((row) => row.amount > 0 && row.fxComplete).map((row) => ({ value: row.amount, at: row.effectiveAt }))
  const benchmarkRows = [...jobPrices, ...ratePrices]
  const benchmarkMedian = benchmarkRows.length ? weightedPercentile(benchmarkRows, 0.5, nowMs) : null

  const suggestionParts: Array<{ value: number; weight: number }> = []
  if (hasWonBand) suggestionParts.push({ value: bandMedian, weight: 0.5 })
  if (target.cost > 0 && averageWonMargin !== null && averageWonMargin < 100) {
    suggestionParts.push({ value: target.cost / (1 - clamp(averageWonMargin, 0, 95) / 100), weight: 0.3 })
  }
  if (benchmarkMedian !== null) suggestionParts.push({ value: benchmarkMedian, weight: 0.2 })
  const suggestionWeight = suggestionParts.reduce((sum, part) => sum + part.weight, 0)
  let suggested = suggestionWeight ? suggestionParts.reduce((sum, part) => sum + part.value * part.weight, 0) / suggestionWeight : 0
  if (target.cost > 0) suggested = Math.max(suggested, target.cost)
  if (hasWonBand) suggested = clamp(suggested, Math.max(target.cost, bandLow), Math.max(target.cost, bandHigh))
  const hasSuggestion = target.cost > 0 && suggestionParts.length > 0 && suggested > 0
  const suggestionEvidence = pricedRows.length + benchmarkRows.length
  const suggestedPitch = metric(
    hasSuggestion ? "ready" : target.cost > 0 ? "insufficient_evidence" : "missing_input",
    hasSuggestion ? { amount: round(suggested), cost: round(target.cost), profit: round(suggested - target.cost) } : null,
    suggestionEvidence,
    hasWonBand ? pricedWonCohort.code : comparableJobs.code,
    hasSuggestion ? Math.min(100, 35 + suggestionEvidence * 4) : 0,
    hasSuggestion ? "weighted_commercial_benchmark" : target.cost > 0 ? "building_pricing_history" : "add_quote_costs",
  )
  const marginHeadroom = metric(
    hasSuggestion ? "ready" : target.cost > 0 ? "insufficient_evidence" : "missing_input",
    hasSuggestion ? { amount: round(suggested - target.cost) } : null,
    suggestionEvidence,
    suggestedPitch.cohort,
    suggestedPitch.confidence,
    hasSuggestion ? "suggested_sell_less_cost" : suggestedPitch.reasonCode,
  )

  const allPriceRows = withoutOutliers([...pricedRows, ...benchmarkRows])
  const priceValues = allPriceRows.map((row) => row.value)
  const priceCount = priceValues.length
  const priceQ1 = priceCount ? percentile(priceValues, 0.25) : 0
  const priceQ3 = priceCount ? percentile(priceValues, 0.75) : 0
  const priceMedian = priceCount ? percentile(priceValues, 0.5) : 0
  const dispersionScore = priceMedian > 0 ? clamp(100 - ((priceQ3 - priceQ1) / priceMedian) * 100) : 0
  const averageAgeDays = allPriceRows.length
    ? allPriceRows.reduce((sum, row) => sum + Math.max(0, (nowMs - new Date(row.at).getTime()) / 86_400_000), 0) / allPriceRows.length
    : 730
  const recencyScore = clamp(100 - (averageAgeDays / 730) * 100)
  const fxRows = pricedWins.length + matchingRates.rows.length
  const fxComplete = fxRows
    ? ((pricedWins.filter((row) => row.fxComplete).length + matchingRates.rows.filter((row) => row.fxComplete).length) / fxRows) * 100
    : 0
  const positionScore = target.sell > 0 && priceCount
    ? target.sell >= priceQ1 && target.sell <= priceQ3
      ? 100
      : clamp(100 - (Math.abs(target.sell - priceMedian) / Math.max(priceMedian, 1)) * 100)
    : 50
  const confidenceScore = priceCount >= 5
    ? weightedScore([
      { value: cohortSpecificity(hasWonBand ? pricedWonCohort.code : comparableJobs.code) * Math.min(1, priceCount / 20) * 100, weight: 0.35 },
      { value: dispersionScore, weight: 0.25 },
      { value: recencyScore, weight: 0.15 },
      { value: fxComplete, weight: 0.15 },
      { value: positionScore, weight: 0.10 },
    ])
    : null
  const priceConfidence = metric(
    confidenceScore === null ? "insufficient_evidence" : "ready",
    confidenceScore === null ? null : { score: Math.round(confidenceScore) },
    priceCount,
    hasWonBand ? pricedWonCohort.code : comparableJobs.code,
    confidenceScore ?? 0,
    confidenceScore === null ? "needs_five_price_observations" : "evidence_quality_and_dispersion",
  )

  const quoteReadiness = readiness(target)
  const smoothedWinRate = ((won.length + 2) / (resolved + 4)) * 100
  const pricePosition = hasWonBand && target.sell > 0
    ? target.sell >= bandLow && target.sell <= bandHigh
      ? 100
      : clamp(100 - (Math.abs(target.sell - bandMedian) / Math.max(bandMedian, 1)) * 100)
    : null
  const marginQuality = target.marginPct !== null && averageWonMargin !== null
    ? clamp(50 + (target.marginPct - averageWonMargin) * 4)
    : null
  const baseLikelihood = resolved >= 5
    ? weightedScore([
      { value: smoothedWinRate, weight: 0.35 },
      { value: pricePosition, weight: 0.20 },
      { value: confidenceScore, weight: 0.15 },
      { value: cohortSpecificity(historyCohort.code) * 100, weight: 0.10 },
      { value: marginQuality, weight: 0.10 },
      { value: quoteReadiness, weight: 0.10 },
    ])
    : null
  const aiWinLikelihood = metric(
    baseLikelihood === null ? "insufficient_evidence" : "ready",
    baseLikelihood === null ? null : { basePct: Math.round(clamp(baseLikelihood)) },
    resolved,
    historyCohort.code,
    Math.min(100, (resolved / 20) * 70 + (confidenceScore ?? 0) * 0.3),
    baseLikelihood === null ? "needs_five_resolved_quotes" : "rules_based_win_model",
  )

  const activity = urgencyAndActivity(target, nowMs)
  const temperature = baseLikelihood === null
    ? null
    : weightedScore([
      { value: baseLikelihood, weight: 0.45 },
      { value: confidenceScore, weight: 0.20 },
      { value: quoteReadiness, weight: 0.20 },
      { value: activity, weight: 0.15 },
    ])
  const aiTemperature = metric(
    temperature === null ? "insufficient_evidence" : "ready",
    temperature === null ? null : { baseScore: Math.round(clamp(temperature)), label: temperatureLabel(temperature) },
    resolved + priceCount,
    historyCohort.code,
    aiWinLikelihood.confidence,
    temperature === null ? "needs_win_likelihood" : "commercial_momentum",
  )

  const recentQuotes = historyCohort.rows.slice(0, 5).map((row) => ({
    id: row.id,
    reference: row.reference,
    date: row.createdAt,
    lane: [row.origin, row.destination].filter(Boolean).join(" → ") || "—",
    mode: row.mode || "—",
    revenue: row.fxComplete ? round(finite(row.sell)) : null,
    cost: row.fxComplete ? round(finite(row.cost)) : null,
    profit: row.fxComplete ? round(finite(row.profit)) : null,
    marginPct: row.fxComplete && row.marginPct !== null ? round(row.marginPct, 1) : null,
    status: lifecycleStatus(row),
  }))

  const metrics = { historicalWinRate, wonPriceBand, suggestedPitch, marginHeadroom, priceConfidence, aiWinLikelihood, aiTemperature }
  const priceReady = wonPriceBand.status === "ready" || suggestedPitch.status === "ready" || priceConfidence.status === "ready"
  return {
    state: historicalWinRate.status === "ready" && priceReady && aiWinLikelihood.status === "ready" ? "ready" : "building_baseline",
    currency: target.currency || "GBP",
    algorithmVersion: QUOTE_INTELLIGENCE_ALGORITHM_VERSION,
    inputFingerprint: fingerprints.input,
    evidenceFingerprint: fingerprints.evidence,
    aiEligible: aiWinLikelihood.status === "ready" && !["declined", "ghosted", "lost", "accepted", "converted"].includes(normalise(target.lifecycle)) && !target.jobId,
    metrics,
    recentQuotes,
  }
}

export function applyQuoteIntelligenceAdjustment(deterministic: QuoteIntelligenceDeterministic, adjustmentPoints: number) {
  const adjustment = clamp(finite(adjustmentPoints), -8, 8)
  const baseLikelihood = deterministic.metrics.aiWinLikelihood.value?.basePct ?? null
  const baseTemperature = deterministic.metrics.aiTemperature.value?.baseScore ?? null
  return {
    adjustmentPoints: adjustment,
    winLikelihoodPct: baseLikelihood === null ? null : Math.round(clamp(baseLikelihood + adjustment)),
    temperatureScore: baseTemperature === null ? null : Math.round(clamp(baseTemperature + adjustment * 0.45)),
    temperatureLabel: baseTemperature === null ? null : temperatureLabel(baseTemperature + adjustment * 0.45),
  }
}
