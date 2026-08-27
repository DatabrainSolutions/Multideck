/**
 * The value model behind Admin → Usage.
 *
 * Everything here is derived from figures Dexter actually records for this
 * company: how many actions ran, how much workspace context each one read, and
 * how much it wrote back. Time saved is not a flat guess per action — it scales
 * with the size of the work in the recorded tokens, so a one-line lookup and a
 * full customs draft are not valued the same.
 *
 * Four rates convert tokens into desk time. They are stated on the page next to
 * the figure they produce and defined once here so they can be audited or
 * retuned in a single place.
 */

const DAY_MS = 86_400_000

export const dexterWorkRates = {
  /** Tokens are roughly ¾ of a word across English business prose. */
  wordsPerToken: 0.75,
  /** Skim-and-locate speed through documents, threads and records. */
  retrievalWordsPerMinute: 900,
  /** Composing considered business prose, not free typing speed. */
  draftingWordsPerMinute: 28,
  /**
   * Dexter can read far more context than a person ever would. Capping the
   * retrieval credit per action keeps one very large context from implying an
   * hour of reading nobody would have done.
   */
  maxRetrievalMinutesPerAction: 12,
  /** Blended forwarding-desk cost per hour, in the same currency as the API estimate. */
  deskRateUsdPerHour: 42,
}

export type DexterValueEstimate = {
  hoursSaved: number
  retrievalHours: number
  draftingHours: number
  minutesPerAction: number
  contextWords: number
  writtenWords: number
  valueUsd: number
  costUsd: number
  netUsd: number
  /** Value returned for every dollar of estimated API spend, or null with no spend recorded. */
  returnMultiple: number | null
  /** What one hour of recovered desk time cost in API spend. */
  costPerHourUsd: number | null
}

export function estimateDexterValue({
  actions,
  inputTokens,
  outputTokens,
  costUsd,
}: {
  actions: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}): DexterValueEstimate {
  const rates = dexterWorkRates
  const safeActions = Math.max(0, actions)
  const contextWords = Math.max(0, inputTokens) * rates.wordsPerToken
  const writtenWords = Math.max(0, outputTokens) * rates.wordsPerToken

  const retrievalMinutesPerAction = safeActions > 0
    ? Math.min(contextWords / rates.retrievalWordsPerMinute / safeActions, rates.maxRetrievalMinutesPerAction)
    : 0
  const retrievalHours = (retrievalMinutesPerAction * safeActions) / 60
  const draftingHours = writtenWords / rates.draftingWordsPerMinute / 60
  const hoursSaved = retrievalHours + draftingHours
  const valueUsd = hoursSaved * rates.deskRateUsdPerHour

  return {
    hoursSaved,
    retrievalHours,
    draftingHours,
    minutesPerAction: safeActions > 0 ? (hoursSaved * 60) / safeActions : 0,
    contextWords,
    writtenWords,
    valueUsd,
    costUsd,
    netUsd: valueUsd - costUsd,
    returnMultiple: costUsd > 0 ? valueUsd / costUsd : null,
    costPerHourUsd: hoursSaved > 0 ? costUsd / hoursSaved : null,
  }
}

export type DexterAllowancePace = "unused" | "on-track" | "watch" | "over"

export type DexterAllowance = {
  limit: number
  used: number
  remaining: number
  usedPercent: number
  /** Where an evenly spread period would sit right now — the pace marker. */
  pacePercent: number
  totalDays: number
  elapsedDays: number
  remainingDays: number
  actionsPerDay: number
  /** Period-end total if the current rate holds. */
  projectedActions: number
  projectedPercent: number
  /** Daily rate that lands exactly on the limit at period end. */
  sustainablePerDay: number
  pace: DexterAllowancePace
  periodEnd: Date | null
}

/**
 * Turns the reported period into the four questions people actually ask: how
 * much is left, how fast am I spending it, where does that land me, and what
 * pace keeps me inside. Falls back to the calendar month when the API has not
 * reported a period yet, so the meter never renders against a zero-length span.
 */
export function describeDexterAllowance({
  limit,
  used,
  periodStart,
  periodEnd,
  now = new Date(),
}: {
  limit: number
  used: number
  periodStart?: string | null
  periodEnd?: string | null
  now?: Date
}): DexterAllowance {
  const start = toDate(periodStart) ?? new Date(now.getFullYear(), now.getMonth(), 1)
  const end = toDate(periodEnd) ?? new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const safeLimit = Math.max(1, limit)

  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / DAY_MS)
  const elapsedDays = clamp((now.getTime() - start.getTime()) / DAY_MS, 0, totalDays)
  const remainingDays = Math.max(0, totalDays - elapsedDays)

  // Half a day of floor keeps the first hours of a period from projecting a
  // wild period-end figure off a handful of actions.
  const actionsPerDay = used / Math.max(0.5, elapsedDays)
  const projectedActions = Math.round(used + actionsPerDay * remainingDays)
  const remaining = Math.max(0, safeLimit - used)

  return {
    limit: safeLimit,
    used,
    remaining,
    usedPercent: clamp((used / safeLimit) * 100, 0, 100),
    pacePercent: clamp((elapsedDays / totalDays) * 100, 0, 100),
    totalDays,
    elapsedDays,
    remainingDays,
    actionsPerDay,
    projectedActions,
    projectedPercent: clamp((projectedActions / safeLimit) * 100, 0, 100),
    sustainablePerDay: remainingDays > 0 ? remaining / remainingDays : remaining,
    pace: describePace(used, projectedActions, safeLimit),
    periodEnd: toDate(periodEnd) ?? end,
  }
}

function describePace(used: number, projected: number, limit: number): DexterAllowancePace {
  if (used <= 0) return "unused"
  if (projected > limit) return "over"
  if (projected > limit * 0.85) return "watch"
  return "on-track"
}

function toDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
