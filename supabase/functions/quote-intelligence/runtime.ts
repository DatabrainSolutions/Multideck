import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  applyQuoteIntelligenceAdjustment,
  buildQuoteIntelligence,
  type IntelligenceJobEvidence,
  type IntelligenceQuoteEvidence,
  type IntelligenceRateEvidence,
  type QuoteIntelligenceDeterministic,
  type QuoteIntelligenceEvidence,
} from "./core.ts"

type Db = SupabaseClient<any, "public", any, any, any>
type JsonObject = Record<string, unknown>

export type QuoteIntelligenceAiPayload = {
  status: "applied" | "pending" | "rules_only"
  adjustmentPoints: number
  inputFingerprint: string
  reasonCodes: string[]
  cardExplanations: Record<string, string>
  model: string
  promptVersion: string
  generatedAt: string
}

export type QuoteIntelligenceSnapshot = QuoteIntelligenceDeterministic & {
  state: "ready" | "building_baseline" | "updating" | "rules_only" | "unavailable"
  calculatedAt: string | null
  aiGeneratedAt: string | null
  aiNextEligibleAt: string | null
  ai: QuoteIntelligenceAiPayload | null
  metrics: QuoteIntelligenceDeterministic["metrics"] & {
    aiWinLikelihood: QuoteIntelligenceDeterministic["metrics"]["aiWinLikelihood"] & {
      value: ({ basePct: number; finalPct: number; adjustmentPoints: number } | null)
    }
    aiTemperature: QuoteIntelligenceDeterministic["metrics"]["aiTemperature"] & {
      value: ({ baseScore: number; score: number; label: "Cold" | "Warm" | "Hot" } | null)
    }
  }
}

type IntelligenceRow = {
  CusQuoteIntelligence_QuoteID: string
  CusQuoteIntelligence_StateCode: string
  CusQuoteIntelligence_DeterministicJSON: unknown
  CusQuoteIntelligence_AIJSON: unknown
  CusQuoteIntelligence_InputFingerprint: string
  CusQuoteIntelligence_CalculatedAt: string | null
  CusQuoteIntelligence_AIGeneratedAt: string | null
  CusQuoteIntelligence_AINextEligibleAt: string | null
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function clean(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]))
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("")
}

function quoteEvidence(value: unknown): IntelligenceQuoteEvidence {
  const row = isObject(value) ? value : {}
  return {
    id: clean(row.id, 80),
    reference: clean(row.reference, 80),
    customerId: clean(row.customerId, 80) || null,
    lifecycle: clean(row.lifecycle, 40) || "draft",
    jobId: clean(row.jobId, 80) || null,
    currency: clean(row.currency, 3).toUpperCase() || "GBP",
    origin: clean(row.origin, 240),
    destination: clean(row.destination, 240),
    mode: clean(row.mode, 80),
    shipmentType: clean(row.shipmentType, 80),
    createdAt: clean(row.createdAt, 80) || new Date(0).toISOString(),
    updatedAt: clean(row.updatedAt, 80) || clean(row.createdAt, 80) || new Date(0).toISOString(),
    validTo: clean(row.validTo, 80) || null,
    deadline: clean(row.deadline, 80) || null,
    cost: number(row.cost),
    sell: number(row.sell),
    profit: number(row.profit),
    marginPct: nullableNumber(row.marginPct),
    fxComplete: row.fxComplete !== false,
    activityCodes: Array.isArray(row.activityCodes) ? row.activityCodes.map((item) => clean(item, 80)).filter(Boolean) : [],
  }
}

function jobEvidence(value: unknown): IntelligenceJobEvidence {
  const row = isObject(value) ? value : {}
  return {
    id: clean(row.id, 80),
    customerId: clean(row.customerId, 80) || null,
    currency: clean(row.currency, 3).toUpperCase() || "GBP",
    origin: clean(row.origin, 240),
    destination: clean(row.destination, 240),
    mode: clean(row.mode, 80),
    createdAt: clean(row.createdAt, 80) || new Date(0).toISOString(),
    cost: number(row.cost),
    sell: number(row.sell),
    marginPct: nullableNumber(row.marginPct),
  }
}

function rateEvidence(value: unknown): IntelligenceRateEvidence {
  const row = isObject(value) ? value : {}
  return {
    id: clean(row.id, 80),
    customerId: clean(row.customerId, 80) || null,
    currency: clean(row.currency, 3).toUpperCase() || "GBP",
    origin: clean(row.origin, 240),
    destination: clean(row.destination, 240),
    mode: clean(row.mode, 80),
    shipmentType: clean(row.shipmentType, 80),
    effectiveAt: clean(row.effectiveAt, 80) || new Date(0).toISOString(),
    amount: number(row.amount),
    fxComplete: row.fxComplete !== false,
  }
}

function evidenceBundle(value: unknown): QuoteIntelligenceEvidence {
  if (!isObject(value) || !isObject(value.target)) throw new Error("quote_intelligence_evidence_invalid")
  return {
    target: quoteEvidence(value.target),
    quotes: Array.isArray(value.quotes) ? value.quotes.map(quoteEvidence) : [],
    jobs: Array.isArray(value.jobs) ? value.jobs.map(jobEvidence) : [],
    rates: Array.isArray(value.rates) ? value.rates.map(rateEvidence) : [],
  }
}

export function snapshotFromRow(value: unknown): QuoteIntelligenceSnapshot | null {
  if (!isObject(value) || !isObject(value.CusQuoteIntelligence_DeterministicJSON)) return null
  const row = value as unknown as IntelligenceRow
  const deterministic = row.CusQuoteIntelligence_DeterministicJSON as QuoteIntelligenceDeterministic
  const rawAi = isObject(row.CusQuoteIntelligence_AIJSON) ? row.CusQuoteIntelligence_AIJSON : null
  const aiMatches = Boolean(rawAi && clean(rawAi.inputFingerprint, 128) === deterministic.inputFingerprint)
  const adjustment = aiMatches ? Number(rawAi?.adjustmentPoints) || 0 : 0
  const applied = applyQuoteIntelligenceAdjustment(deterministic, adjustment)
  const ai: QuoteIntelligenceAiPayload | null = rawAi ? {
    status: aiMatches ? "applied" : deterministic.aiEligible ? "pending" : "rules_only",
    adjustmentPoints: applied.adjustmentPoints,
    inputFingerprint: clean(rawAi.inputFingerprint, 128),
    reasonCodes: Array.isArray(rawAi.reasonCodes) ? rawAi.reasonCodes.map((item) => clean(item, 80)).filter(Boolean) : [],
    cardExplanations: isObject(rawAi.cardExplanations)
      ? Object.fromEntries(Object.entries(rawAi.cardExplanations).map(([key, item]) => [clean(key, 80), clean(item, 280)]).filter(([key, item]) => key && item))
      : {},
    model: clean(rawAi.model, 120),
    promptVersion: clean(rawAi.promptVersion, 120),
    generatedAt: clean(rawAi.generatedAt, 80),
  } : null
  const likelihood = deterministic.metrics.aiWinLikelihood
  const temperature = deterministic.metrics.aiTemperature
  const state = row.CusQuoteIntelligence_StateCode === "updating"
    ? "updating"
    : deterministic.state === "building_baseline"
      ? "building_baseline"
      : aiMatches ? "ready" : deterministic.aiEligible ? "rules_only" : deterministic.state
  return {
    ...deterministic,
    state,
    calculatedAt: row.CusQuoteIntelligence_CalculatedAt ?? null,
    aiGeneratedAt: row.CusQuoteIntelligence_AIGeneratedAt ?? null,
    aiNextEligibleAt: row.CusQuoteIntelligence_AINextEligibleAt ?? null,
    ai,
    metrics: {
      ...deterministic.metrics,
      aiWinLikelihood: {
        ...likelihood,
        value: likelihood.value && applied.winLikelihoodPct !== null
          ? { basePct: likelihood.value.basePct, finalPct: applied.winLikelihoodPct, adjustmentPoints: applied.adjustmentPoints }
          : null,
      },
      aiTemperature: {
        ...temperature,
        value: temperature.value && applied.temperatureScore !== null && applied.temperatureLabel
          ? { baseScore: temperature.value.baseScore, score: applied.temperatureScore, label: applied.temperatureLabel }
          : null,
      },
    },
  }
}

export async function readQuoteIntelligence(admin: Db, quoteId: string) {
  const { data, error } = await admin
    .from("CusQuote_Intelligence")
    .select("*")
    .eq("CusQuoteIntelligence_QuoteID", quoteId)
    .maybeSingle()
  if (error) throw error
  return snapshotFromRow(data)
}

export async function refreshQuoteIntelligence(admin: Db, companyId: string, quoteId: string) {
  const { data, error } = await admin.rpc("quote_intelligence_evidence", {
    p_company_id: companyId,
    p_quote_id: quoteId,
  })
  if (error) throw error
  const evidence = evidenceBundle(data)
  if (evidence.target.id !== quoteId) throw new Error("quote_intelligence_target_mismatch")
  const targetFingerprint = await sha256({
    id: evidence.target.id,
    customerId: evidence.target.customerId,
    lifecycle: evidence.target.lifecycle,
    jobId: evidence.target.jobId,
    currency: evidence.target.currency,
    origin: evidence.target.origin,
    destination: evidence.target.destination,
    mode: evidence.target.mode,
    shipmentType: evidence.target.shipmentType,
    validTo: evidence.target.validTo,
    deadline: evidence.target.deadline,
    cost: evidence.target.cost,
    sell: evidence.target.sell,
    activityCodes: evidence.target.activityCodes,
  })
  const evidenceFingerprint = await sha256({
    quotes: evidence.quotes.map((quote) => ({ ...quote, updatedAt: undefined, activityCodes: undefined })),
    jobs: evidence.jobs,
    rates: evidence.rates,
  })
  const inputFingerprint = await sha256({ targetFingerprint, evidenceFingerprint })
  const deterministic = buildQuoteIntelligence(evidence, { input: inputFingerprint, evidence: evidenceFingerprint })
  const calculatedAt = new Date().toISOString()
  const { data: saved, error: saveError } = await admin.rpc("quote_intelligence_publish_snapshot", {
    p_company_id: companyId,
    p_quote_id: quoteId,
    p_quote_updated_at: evidence.target.updatedAt,
    p_snapshot: deterministic,
    p_calculated_at: calculatedAt,
  })
  if (saveError) throw saveError
  return snapshotFromRow(saved)
}
