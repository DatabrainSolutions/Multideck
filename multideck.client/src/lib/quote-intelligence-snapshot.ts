import type { QuoteIntelligenceSnapshot } from "./quote-workflow-api"

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value))
}

function temperatureLabel(score: number): "Cold" | "Warm" | "Hot" {
  return score < 40 ? "Cold" : score < 70 ? "Warm" : "Hot"
}

export function intelligenceFromRealtimeRow(row: Record<string, unknown>): QuoteIntelligenceSnapshot | null {
  const deterministic = row.CusQuoteIntelligence_DeterministicJSON
  if (!deterministic || typeof deterministic !== "object" || Array.isArray(deterministic)) return null
  const shape = deterministic as Record<string, unknown>
  if (typeof shape.inputFingerprint !== "string" || typeof shape.evidenceFingerprint !== "string"
    || typeof shape.algorithmVersion !== "string" || typeof shape.currency !== "string"
    || !["ready", "building_baseline", "updating", "rules_only", "unavailable"].includes(String(shape.state))
    || typeof shape.aiEligible !== "boolean" || !Array.isArray(shape.recentQuotes)
    || !shape.metrics || typeof shape.metrics !== "object" || Array.isArray(shape.metrics)) return null
  const metrics = shape.metrics as Record<string, unknown>
  for (const key of ["historicalWinRate", "wonPriceBand", "suggestedPitch", "marginHeadroom", "priceConfidence", "aiWinLikelihood", "aiTemperature"]) {
    const metric = metrics[key]
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) return null
    const record = metric as Record<string, unknown>
    if (!["ready", "insufficient_evidence", "missing_input"].includes(String(record.status))
      || typeof record.evidenceCount !== "number" || typeof record.confidence !== "number"
      || typeof record.cohort !== "string" || typeof record.reasonCode !== "string") return null
    const value = record.value
    if (value !== null && (!value || typeof value !== "object" || Array.isArray(value))) return null
  }
  const snapshot = deterministic as Omit<QuoteIntelligenceSnapshot, "calculatedAt" | "aiGeneratedAt" | "aiNextEligibleAt" | "ai">
  const rawAi = row.CusQuoteIntelligence_AIJSON && typeof row.CusQuoteIntelligence_AIJSON === "object" && !Array.isArray(row.CusQuoteIntelligence_AIJSON)
    ? row.CusQuoteIntelligence_AIJSON as Record<string, unknown>
    : null
  const aiMatches = rawAi?.inputFingerprint === snapshot.inputFingerprint
  const adjustment = aiMatches ? clamp(Number(rawAi?.adjustmentPoints) || 0, -8, 8) : 0
  const likelihood = snapshot.metrics.aiWinLikelihood
  const temperature = snapshot.metrics.aiTemperature
  const baseLikelihood = likelihood.value?.basePct ?? null
  const baseTemperature = temperature.value?.baseScore ?? null
  const ai = rawAi ? {
    status: (aiMatches ? "applied" : snapshot.aiEligible ? "pending" : "rules_only") as "applied" | "pending" | "rules_only",
    adjustmentPoints: adjustment,
    inputFingerprint: typeof rawAi.inputFingerprint === "string" ? rawAi.inputFingerprint : "",
    reasonCodes: Array.isArray(rawAi.reasonCodes) ? rawAi.reasonCodes.filter((item): item is string => typeof item === "string") : [],
    cardExplanations: rawAi.cardExplanations && typeof rawAi.cardExplanations === "object" && !Array.isArray(rawAi.cardExplanations) ? rawAi.cardExplanations as Record<string, string> : {},
    model: typeof rawAi.model === "string" ? rawAi.model : "",
    promptVersion: typeof rawAi.promptVersion === "string" ? rawAi.promptVersion : "",
    generatedAt: typeof rawAi.generatedAt === "string" ? rawAi.generatedAt : "",
  } : null
  return {
    ...snapshot,
    state: row.CusQuoteIntelligence_StateCode === "updating" ? "updating" : snapshot.state === "building_baseline" ? "building_baseline" : aiMatches ? "ready" : snapshot.aiEligible ? "rules_only" : snapshot.state,
    calculatedAt: typeof row.CusQuoteIntelligence_CalculatedAt === "string" ? row.CusQuoteIntelligence_CalculatedAt : null,
    aiGeneratedAt: typeof row.CusQuoteIntelligence_AIGeneratedAt === "string" ? row.CusQuoteIntelligence_AIGeneratedAt : null,
    aiNextEligibleAt: typeof row.CusQuoteIntelligence_AINextEligibleAt === "string" ? row.CusQuoteIntelligence_AINextEligibleAt : null,
    ai,
    metrics: {
      ...snapshot.metrics,
      aiWinLikelihood: {
        ...likelihood,
        value: baseLikelihood === null ? null : {
          basePct: baseLikelihood,
          finalPct: Math.round(clamp(baseLikelihood + adjustment)),
          adjustmentPoints: adjustment,
        },
      },
      aiTemperature: {
        ...temperature,
        value: baseTemperature === null ? null : {
          baseScore: baseTemperature,
          score: Math.round(clamp(baseTemperature + adjustment * 0.45)),
          label: temperatureLabel(baseTemperature + adjustment * 0.45),
        },
      },
    },
  }
}

