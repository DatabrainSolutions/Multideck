import type { SalesInsightAnalysis, SalesInsightFilters, SalesNarrativeDeal, SalesNarrativeMembership, SalesNarrativeTheme } from "./crm-insights-api"

/** Only valid saved filters may enter the report. */
export function parseSalesInsightFilters(search: string) {
  const params = new URLSearchParams(search)
  const requestedDays = Number(params.get("days"))
  const days = [30, 90, 180, 365].includes(requestedDays) ? requestedDays as 30 | 90 | 180 | 365 : 90
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const pipelineId = params.get("pipeline")
  const ownerId = params.get("owner")
  return { days, pipelineId: pipelineId && uuid.test(pipelineId) ? pipelineId : null, ownerId: ownerId && uuid.test(ownerId) ? ownerId : null }
}

/** A rate with no completed decisions is unknown, never a zero-percent result. */
export function dealWinRate(won: number, lost: number): number | null {
  return won + lost > 0 ? (won / (won + lost)) * 100 : null
}

export function stageDurationLabel(days: number | null | undefined, locale = "en-GB") {
  if (days === null || days === undefined || !Number.isFinite(days)) return "Not measured"
  if (days < 1) return "Less than a day"
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(days)} ${days === 1 ? "day" : "days"}`
}

/** Ignore invalid/missing dates; a comparison needs two actual observations. */
export function closeDateComparison(previous: string | null, current: string | null) {
  if (!previous || !current) return null
  const from = Date.parse(previous.slice(0, 10) + "T12:00:00Z")
  const to = Date.parse(current.slice(0, 10) + "T12:00:00Z")
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return { from, to, days: Math.round((to - from) / 86_400_000) }
}

export type ProjectedSalesTheme = SalesNarrativeTheme & {
  deals: SalesNarrativeDeal[]
  memberships: SalesNarrativeMembership[]
  counts: { open: number; won: number; lost: number }
}
export type SalesThemeStage = { key: string; name: string; pipelineName: string | null; dealIds: string[] }

/** The model assigns sources to themes. All filtering/counting uses canonical source metadata. */
export function projectSalesThemes(analysis: SalesInsightAnalysis | null | undefined, filters: SalesInsightFilters, asOf: string) {
  const empty = { themes: [] as ProjectedSalesTheme[], stages: [] as SalesThemeStage[], documents: 0, deals: 0 }
  if (analysis?.schemaVersion !== 3 || !analysis.narrative || !analysis.themes?.length) return empty
  const end = Date.parse(asOf)
  const start = Math.max(end - filters.days * 86_400_000, Date.parse(analysis.narrative.from))
  if (!Number.isFinite(start) || !Number.isFinite(end)) return empty
  const canonicalDeals = new Map(analysis.narrative.deals.map((deal) => [deal.id, deal]))
  const allSources = new Set<string>()
  const allDeals = new Map<string, SalesNarrativeDeal>()
  const themes = analysis.themes.flatMap((theme) => {
    const sources = new Map<string, SalesNarrativeMembership>()
    const deals = new Map<string, SalesNarrativeDeal>()
    for (const membership of theme.memberships) {
      const deal = canonicalDeals.get(membership.dealId)
      const recordedAt = Date.parse(membership.recordedAt)
      if (!deal || !Number.isFinite(recordedAt) || recordedAt < start || recordedAt > end) continue
      if (filters.ownerId && deal.ownerId !== filters.ownerId) continue
      if (filters.pipelineId && deal.pipelineId !== filters.pipelineId) continue
      sources.set(membership.sourceId, membership)
      deals.set(deal.id, deal)
      allSources.add(membership.sourceId)
      allDeals.set(deal.id, deal)
    }
    if (!sources.size) return []
    const rows = [...deals.values()]
    return [{ ...theme, memberships: [...sources.values()], deals: rows, counts: {
      open: rows.filter((deal) => deal.outcome === "open").length,
      won: rows.filter((deal) => deal.outcome === "won").length,
      lost: rows.filter((deal) => deal.outcome === "lost").length,
    } }]
  })
  const stageMap = new Map<string, SalesThemeStage>()
  for (const deal of allDeals.values()) {
    if (deal.outcome !== "open") continue
    const key = `${deal.pipelineId ?? "none"}:${deal.stageId ?? "none"}`
    const stage = stageMap.get(key) ?? { key, name: deal.stageName ?? "No stage", pipelineName: deal.pipelineName, dealIds: [] }
    stage.dealIds.push(deal.id)
    stageMap.set(key, stage)
  }
  const stages = [...stageMap.values()].sort((a, b) => b.dealIds.length - a.dealIds.length || a.name.localeCompare(b.name))
  // Keep the matrix readable; a combined column still links every remaining stage/deal.
  const visibleStages = stages.length <= 6 ? stages : [...stages.slice(0, 5), { key: "other", name: "Other stages", pipelineName: null, dealIds: stages.slice(5).flatMap((stage) => stage.dealIds) }]
  return { themes, stages: visibleStages, documents: allSources.size, deals: allDeals.size }
}
