import { callCrmRpc } from "@/lib/crm-supabase"

export type SalesInsightFilters = {
  days: 30 | 90 | 180 | 365
  pipelineId: string | null
  ownerId: string | null
}

export type SalesInsightDeal = {
  id: string
  name: string
  companyName: string | null
  ownerId: string | null
  ownerName: string | null
  pipelineId: string | null
  pipelineName: string | null
  stageId: string | null
  stageName: string | null
  expectedCloseDate: string | null
  previousCloseDate: string | null
  pushCount: number
  daysPushed: number
  isOverdue: boolean
  daysInStage: number | null
  nextActionDueAt: string | null
  route: string
  reason?: "overdue_action" | "missing_action" | "stalled_stage"
}

export type SalesInsights = {
  generatedAt: string
  period: { days: number; from: string; to: string }
  coverage: { historyStartedAt: string | null; measuredStageDeals: number; totalDeals: number; undatedClosedDeals?: number; note: string }
  summary: {
    openDeals: number
    wonDeals: number
    lostDeals: number
    closedDeals: number
    winRatePct: number | null
    overdueActions: number
    missingActions: number
    slippingDeals: number
  }
  stages: Array<{
    id: string
    name: string
    pipelineId: string
    pipelineName: string
    openDeals: number
    averageDays: number | null
    medianDays: number | null
    minimumDays?: number | null
    lowerQuartileDays?: number | null
    upperQuartileDays?: number | null
    maximumDays?: number | null
    sampleSize: number
    enteredDeals: number
    movedOnDeals: number
    progressionRatePct: number | null
    dealIds: string[]
    progressionDealIds: string[]
    deals?: SalesInsightDeal[]
    progressionDeals?: SalesInsightDeal[]
  }>
  trend?: {
    interval: "week"
    timeZone: "UTC"
    coverageStartsAt: string | null
    from: string | null
    to: string
    filterBasis: "current_owner_and_pipeline"
    metricDefinition: string
    evidenceLimit?: number
    buckets: Array<{ start: string; end: string; isPartial: boolean; won: number; lost: number; created: number; entered: number; dealIds: string[]; wonDealIds: string[]; lostDealIds: string[]; createdDealIds: string[]; enteredDealIds: string[]; evidenceTruncated?: boolean }>
  }
  lossReasons: Array<{ code: string; name: string; count: number; sharePct: number; dealIds: string[] }>
  slippingDeals: SalesInsightDeal[]
  attentionDeals: SalesInsightDeal[]
  outcomes: Array<{ id: string; name: string; companyName: string | null; ownerName: string | null; outcome: "won" | "lost"; closedAt: string; lossReasonCode: string | null; route: string }>
  filters: { pipelines: Array<{ id: string; name: string }>; owners: Array<{ id: string; name: string }> }
  detailLimit?: number
  records?: Array<{ id: string; name: string; companyName: string | null; ownerName: string | null; stageName: string | null; route: string }>
  definitions: { winRate: string; stageTime: string; stageProgression: string; slippage: string; coverage: string }
}

export type SalesNarrativeMembership = {
  sourceId: string
  dealId: string
  kind: "loss_feedback" | "action_outcome"
  excerpt: string
  recordedAt: string
}
export type SalesNarrativeDeal = {
  id: string
  name: string
  outcome: "open" | "won" | "lost"
  closedAt: string | null
  ownerId: string | null
  pipelineId: string | null
  pipelineName: string | null
  stageId: string | null
  stageName: string | null
  daysInStage: number | null
}
export type SalesNarrativeTheme = {
  id: string
  label: string
  description: string
  memberships: SalesNarrativeMembership[]
}
export type SalesNarrative = {
  from: string
  to: string
  totalDocuments: number
  includedDocuments: number
  totalDeals: number
  includedDeals: number
  truncated: boolean
  deals: SalesNarrativeDeal[]
}

export type SalesInsightAnalysis = {
  schemaVersion?: number
  themes?: SalesNarrativeTheme[]
  narrative?: SalesNarrative
  metricsAsOf?: string
  generatedAt: string
  dataAsOf: string
  summary: string
  findings: Array<{
    section?: "trend" | "stages" | "losses" | "dates"
    title: string
    observation: string
    recommendation: string
    evidence: Array<{ label: string; value: string; dealIds: string[] }>
  }>
}

export function getSalesInsights(filters: SalesInsightFilters) {
  return callCrmRpc<SalesInsights>(
    "multideck_crm_get_sales_insights",
    { p_days: filters.days, p_pipeline_id: filters.pipelineId, p_owner_id: filters.ownerId },
    "Sales insights could not be loaded. Try again in a moment.",
    "Sign in again to view sales insights.",
  )
}

export type SavedSalesBriefing = {
  result: SalesInsightAnalysis | null
  generatedAt: string | null
  status: "pending" | "generating" | "ready" | "stale" | "failed" | "unavailable"
  pendingSince: string | null
  checkedAt?: string | null
  refreshStatus?: "pending" | "processing" | "ready" | "failed" | null
  lastErrorCode?: string | null
  resultWithheld?: boolean
  automationReady: boolean
  scope: { companyId: string; days: 90; pipelineId: null; ownerId: null }
}

/** Reading a saved briefing never queues generation or invokes a model. */
export function getSalesBriefing() {
  return callCrmRpc<SavedSalesBriefing>(
    "multideck_crm_get_sales_briefing",
    {},
    "The saved sales briefing could not be read.",
    "Sign in again to view the sales briefing.",
  )
}
