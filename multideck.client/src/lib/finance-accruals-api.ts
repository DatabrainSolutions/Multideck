import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type ManagementJob = {
  jobId: string
  jobNumber: number
  jobReference: string
  periodCode: string
  legalEntityId: string | null
  domainCode: "freight" | "warehouse" | "customs" | "shared"
  status: string
  customerName: string
  supplierName: string
  expectedRevenue: number
  expectedCost: number
  actualRevenue: number
  actualCost: number
  outsidePeriodRevenue: number
  outsidePeriodCost: number
  proposedWip: number
  proposedAccrual: number
  adjustedRevenue: number
  adjustedCost: number
  adjustedMargin: number
  sourceDocumentIds: string[]
  chargeLines: ManagementChargeLine[]
  unmatchedActualRevenue: number
  unmatchedActualCost: number
  unmatchedDocumentIds: string[]
  needsReview: boolean
}

export type ManagementChargeLine = {
  jobCostingLineId: string | null
  lineNo: number
  chargeCode: string | null
  description: string
  domainCode: "freight" | "warehouse" | "customs" | "shared"
  sourceTable: string | null
  sourceId: string | null
  sourceLineId: string | null
  costNominalAccountId: string | null
  costNominalCode: string | null
  revenueNominalAccountId: string | null
  revenueNominalCode: string | null
  expectedRevenue: number
  expectedCost: number
  actualRevenue: number
  actualCost: number
  outsidePeriodRevenue: number
  outsidePeriodCost: number
  proposedWip: number
  proposedAccrual: number
  recognisedRevenue: number
  recognisedCost: number
  grossProfit: number
  sourceDocumentIds: string[]
}

export type ManagementRunItem = {
  FINCloseItem_ID: string
  FINCloseItem_JobID: string
  FINCloseItem_StatusCode: string
  FINCloseItem_ExpectedRevenue: number
  FINCloseItem_ExpectedCost: number
  FINCloseItem_ActualRevenue: number
  FINCloseItem_ActualCost: number
  FINCloseItem_OutOfPeriodRevenue: number
  FINCloseItem_OutOfPeriodCost: number
  FINCloseItem_ProposedWIP: number
  FINCloseItem_ProposedAccrual: number
  FINCloseItem_ReviewerNote: string | null
  FINCloseItem_MetadataJSON: ManagementJob
  automaticWipReleased: number
  automaticAccrualReleased: number
  automaticReleases: Array<{
    FINRelease_ID: string
    FINRelease_DocumentID: string
    FINRelease_ReleaseKindCode: "revenue_wip" | "cost_accrual"
    FINRelease_LocalAmount: number
    FINRelease_LocalCurrencyCode: string
    FINRelease_PostingBatchID: string
    FINRelease_ReleasedAt: string
    documentNumber: string | null
    documentType: string | null
  }>
  chargeLines: Array<{
    FINChargePeriod_ID: string
    FINChargePeriod_JobCostingLineID: string
    FINChargePeriod_LineNoSnapshot: number
    FINChargePeriod_ChargeCodeSnapshot: string | null
    FINChargePeriod_DescriptionSnapshot: string
    FINChargePeriod_ExpectedRevenue: number
    FINChargePeriod_ExpectedCost: number
    FINChargePeriod_ActualRevenue: number
    FINChargePeriod_ActualCost: number
    FINChargePeriod_ProposedWIP: number
    FINChargePeriod_ProposedAccrual: number
    FINChargePeriod_ApprovedWIP: number
    FINChargePeriod_ApprovedAccrual: number
  }>
}

export type ManagementRun = {
  FINCloseRun_ID: string
  FINCloseRun_StatusCode: string
  FINCloseRun_StartedAt: string
  FINCloseRun_ApprovedAt: string | null
  FINCloseRun_Reason: string | null
  FINCloseRun_PostedAt: string | null
  FINCloseRun_ReversedAt: string | null
  FINCloseRun_ControlTotalsJSON: Record<string, number>
  FINPeriod: {
    FINPeriod_Code: string
    FINPeriod_Name: string
    FINPeriod_StatusCode: string
    FINPeriod_BaseCurrencyCode: string
  } | null
  items: ManagementRunItem[]
}

export type FinanceAccrualWorkspace = {
  entity: { LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_BaseCurrencyCodeSnapshot: string | null }
  periodCode: string
  periods: Array<{ FINPeriod_ID: string; FINPeriod_Code: string; FINPeriod_Name: string; FINPeriod_StatusCode: string; FINPeriod_BaseCurrencyCode: string }>
  candidates: ManagementJob[]
  assignableJobs: Array<{ jobId: string; jobNumber: number; periodCode: string; status: string; legalEntityId: string | null }>
  runs: ManagementRun[]
}

export class FinanceAccrualsApiError extends Error {}

export type CostReviewRow = {
  id: string; jobId: string; jobReference: string; lineNo: number; description: string
  chargeCodeId: string | null; supplierId: string | null; nominalCode: string | null
  currentEstimate: string | null; originalEstimate: null; actualCost: string; openAccrual: string | null
  remainingEstimate: string | null; favourableVariance: string | null
  sourceDocumentIds: string[]; sourceAccrualIds: string[]; reasons: string[]
}
export type CostReview = { mode: "review_only" | "controlled"; asOf: string; currency: string; offset: number; pageSize: number; total: number; rows: CostReviewRow[] }

export function getFinanceCostReview(legalEntityId: string, offset = 0, search = "") {
  return call<CostReview>(`/cost-review?legalEntityId=${encodeURIComponent(legalEntityId)}&offset=${offset}&search=${encodeURIComponent(search)}`)
}

export type CostPolicy = { id: string; revision: number; currency: string; under_percent: string | number; under_cap: string | number; over_percent: string | number; over_cap: string | number; auto_finalise: boolean; recognition_rule: string; created_by: string; approved_by: string | null; approved_at: string | null }
export type CostControls = { policies: CostPolicy[]; postingEnabled: boolean; currency: string; canPrepare: boolean; canApprove: boolean; canPost: boolean; actorId: string; cases: { id: string; charge_id: string; evidence_id: string; status: string; reason: string; journal_id: string | null; estimate: string; actual: string; residual: string }[] }
export type CostEvidence = { id: string; service_completed_on: string; invoice_received_on: string | null; final_document_id: string | null; is_final: boolean; disputed: boolean; reason: string; recorded_at: string; recorded_by: string }
export type ChargeCostControls = { revision: string; evidence: CostEvidence | null; evidenceCurrent: boolean; finalisation: { status: string; reason: string; journalId: string | null; mirrorStatus: string | null; mirrorError: string | null } | null; documents: { id: string; number: string | null }[]; history: CostEvidence[]; prediction: { probability: number | null; sampleSize: number; reason: string; ageDays?: number; horizonDays?: number } }
export function getCostControls(legalEntityId: string) { return call<CostControls>(`/cost-controls?legalEntityId=${encodeURIComponent(legalEntityId)}`) }
export function getChargeCostControls(legalEntityId: string, chargeId: string) { return call<ChargeCostControls>(`/cost-controls?legalEntityId=${encodeURIComponent(legalEntityId)}&chargeId=${encodeURIComponent(chargeId)}`) }
export function updateCostControls(legalEntityId: string, action: "save_policy" | "approve_policy" | "record_evidence" | "automation" | "retry_finalisation" | "approve_exception", input: Record<string, unknown>) {
  return jsonRequest("POST", "/cost-controls", { ...input, legalEntityId, action })
}

export type ChargeLifecycleCase = {
  legal_entity_id: string
  charge_id: string
  source_revision: number
  event_types: string[]
  first_queued_at: string
  last_queued_at: string
  status: "pending" | "review" | "settled"
  attempted_revision: number | null
  attempted_at: string | null
  attempts: number
  next_attempt_at: string
  assigned_user_id: string | null
  reason: string | null
  amount_local: number | string | null
  next_action: string | null
}
export function getChargeLifecycleQueue(legalEntityId: string, limit = 100) {
  return call<{ rows: ChargeLifecycleCase[] }>(`/charge-lifecycle?legalEntityId=${encodeURIComponent(legalEntityId)}&limit=${limit}`)
}
export function recheckChargeLifecycleCase(legalEntityId: string, chargeId: string, reason: string) {
  return jsonRequest("POST", "/charge-lifecycle/recheck", { legalEntityId, chargeId, reason })
}
export type ChargeCaseResolution = {
  actorId: string
  snapshot: {
    queueRevision: number; queueStatus: string; queueReason: string | null; blockers: string[]
    cost: ChargeCorrectionSnapshot | null; revenue: ChargeCorrectionSnapshot | null
  }
  reviews: { id: string; status: "prepared" | "approved"; queue_revision: number; prepared_by: string; prepared_at: string; prepared_reason: string; approved_by: string | null }[]
}
export function getChargeCaseResolution(legalEntityId: string, chargeId: string) {
  return call<ChargeCaseResolution>(`/charge-lifecycle/resolve?legalEntityId=${encodeURIComponent(legalEntityId)}&chargeId=${encodeURIComponent(chargeId)}`)
}
export function updateChargeCaseResolution(legalEntityId: string, chargeId: string, action: "prepare" | "approve", input: Record<string, unknown>) {
  return jsonRequest("POST", "/charge-lifecycle/resolve", { legalEntityId, chargeId, action, ...input })
}

export type RecognitionMandate = {
  id: string
  legal_entity_id: string
  policy_id: string | null
  cost_enabled: boolean
  revenue_enabled: boolean
  revenue_service_rule: string | null
  effective_date: string
  status: "proposed" | "active" | "paused"
  prepared_by: string
  approved_by: string | null
  prepared_at: string
  approved_at: string | null
}
export type RecognitionControls = { mandates: RecognitionMandate[]; canPrepare: boolean; canApprove: boolean; canPost: boolean; actorId: string }
export function getRecognitionControls(legalEntityId: string) {
  return call<RecognitionControls>(`/recognition-controls?legalEntityId=${encodeURIComponent(legalEntityId)}`)
}
export function updateRecognitionControls(legalEntityId: string, action: "propose" | "activate" | "pause" | "record_revenue_evidence", input: Record<string, unknown>) {
  return jsonRequest("POST", "/recognition-controls", { legalEntityId, action, ...input })
}

export type ChargeCorrectionReview = {
  id: string; kind: "cost" | "revenue"; status: "prepared" | "posting" | "posted"
  target_balance: number | string; delta: number | string; period_id: string
  prepared_by: string; prepared_at: string; prepared_reason: string
  approved_by: string | null; approved_at: string | null; approval_reason: string | null
  posting_batch_id: string | null
}
export type ChargeCorrectionSnapshot = {
  sourceHash: string; kind: "cost" | "revenue"; currency: string
  estimate: number | string; actual: number | string; target: number | string; current: number | string; delta: number | string
  blockers: string[]
}
export type ChargeCorrectionControls = { snapshot: ChargeCorrectionSnapshot; reviews: ChargeCorrectionReview[] }
export function getChargeCorrection(legalEntityId: string, chargeId: string, kind: "cost" | "revenue") {
  return call<ChargeCorrectionControls>(`/charge-correction?legalEntityId=${encodeURIComponent(legalEntityId)}&chargeId=${encodeURIComponent(chargeId)}&kind=${kind}`)
}
export function updateChargeCorrection(legalEntityId: string, chargeId: string, kind: "cost" | "revenue", action: "prepare" | "approve", input: Record<string, unknown>) {
  return jsonRequest("POST", "/charge-correction", { legalEntityId, chargeId, kind, action, ...input })
}

export type AccountingVatControl = {
  actorId: string
  canPrepare: boolean
  canApprove: boolean
  inventory: { status: "ready_for_review" | "blocked"; sourceDigest: string; lineCount: number; openingExcludedLines: number; unclassifiedLines: number; unreviewedCutoffDifferences: number; orphanEvidence: number; missingDocumentSources: number; issues: { lineId: string; classification: string; batchId: string }[] }
  control: { status: string; sourceDigest: string | null; approvalId: string | null }
  reviews: { id: string; source_digest: string; prepared_by: string; prepared_at: string; reason: string }[]
  approvals: { id: string; review_id: string; source_digest: string; approved_by: string; approved_at: string; reason: string }[]
}
export function getAccountingVatControl(legalEntityId: string, periodId: string) {
  return call<AccountingVatControl>(`/accounting-vat-control?legalEntityId=${encodeURIComponent(legalEntityId)}&periodId=${encodeURIComponent(periodId)}`)
}
export function updateAccountingVatControl(legalEntityId: string, periodId: string, action: "prepare" | "approve", input: Record<string, unknown>) {
  return jsonRequest("POST", "/accounting-vat-control", { legalEntityId, periodId, action, ...input })
}

export type AccountingCloseSnapshot = {
  legalEntityId: string
  periodId: string
  periodCode: string
  periodEnd: string
  currency: string
  trialBalance: { difference: number; invalidBatches: number }
  costAccrual: { subledger: number; control: number; difference: number }
  revenueWip: { subledger: number; control: number; difference: number }
  futureChargeMovements: number
  pendingChargeCases: number
  arApStatus: string
  vatStatus: string
  bankControls: Array<{ bankId: string; status: string; issues?: string[] }>
  mirror: { mode: string; connected: boolean; pendingJournals: number; providerStatus: string }
  blockers: string[]
}
export type AccountingCloseReview = {
  id: string; legal_entity_id: string; period_id: string; source_digest: string
  snapshot: AccountingCloseSnapshot; prepared_by: string; prepared_at: string; reason: string
}
export type AccountingClosedPack = {
  id: string; review_id: string; legal_entity_id: string; period_id: string; source_digest: string
  snapshot: AccountingCloseSnapshot; closed_by: string; closed_at: string; reason: string
}
export function getAccountingClose(legalEntityId: string, periodId: string) {
  return call<{ snapshot: AccountingCloseSnapshot; sourceDigest: string; reviews: AccountingCloseReview[]; closedPack: AccountingClosedPack | null }>(
    `/accounting-close?legalEntityId=${encodeURIComponent(legalEntityId)}&periodId=${encodeURIComponent(periodId)}`)
}
export function prepareAccountingClose(legalEntityId: string, periodId: string, reason: string) {
  return jsonRequest<AccountingCloseReview>("POST", "/accounting-close", { legalEntityId, periodId, action: "prepare", reason })
}
export function closeAccountingPeriod(legalEntityId: string, periodId: string, reviewId: string, reason: string) {
  return jsonRequest<AccountingClosedPack>("POST", "/accounting-close", { legalEntityId, periodId, action: "close", reviewId, reason })
}

async function call<T>(path: string, init?: RequestInit) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new FinanceAccrualsApiError("Sign in again to continue.")
  const response = await edgeFetch("finance-accruals", path, session.access_token, init)
  if (!response.ok) {
    if (response.status === 404 && path.startsWith("/cost-review?")) throw new FinanceAccrualsApiError("The cost review service update has not been deployed. Automatic finalisation remains disabled.")
    const error = await response.json().catch(() => null)
    throw new FinanceAccrualsApiError(error?.detail ?? "Accruals and WIP could not complete that request.")
  }
  return response.json() as Promise<T>
}

const jsonRequest = <T>(method: "POST" | "PUT" | "PATCH", path: string, value: unknown = {}) => call<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })

export function getFinanceManagementEntities() {
  return call<{ legalEntities: Array<{ LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_BaseCurrencyCodeSnapshot: string | null }> }>("/entities")
}

export function getFinanceAccrualWorkspace(legalEntityId: string, periodCode: string) {
  return call<FinanceAccrualWorkspace>(`/workspace?legalEntityId=${encodeURIComponent(legalEntityId)}&periodCode=${encodeURIComponent(periodCode)}`).then((workspace) => ({
    ...workspace,
    candidates: (workspace.candidates ?? []).map((job) => ({
      ...job,
      chargeLines: job.chargeLines ?? [],
      unmatchedActualRevenue: job.unmatchedActualRevenue ?? 0,
      unmatchedActualCost: job.unmatchedActualCost ?? 0,
      unmatchedDocumentIds: job.unmatchedDocumentIds ?? [],
    })),
    runs: (workspace.runs ?? []).map((run) => ({
      ...run,
      items: (run.items ?? []).map((item) => ({
        ...item,
        chargeLines: item.chargeLines ?? [],
        automaticReleases: item.automaticReleases ?? [],
        automaticWipReleased: item.automaticWipReleased ?? 0,
        automaticAccrualReleased: item.automaticAccrualReleased ?? 0,
      })),
    })),
  }))
}

export function assignJobManagementPeriod(jobId: string, legalEntityId: string, periodCode: string, reason: string) {
  return jsonRequest<{ changed: boolean }>("PUT", `/jobs/${encodeURIComponent(jobId)}/period`, { legalEntityId, periodCode, reason })
}

export function createAccrualWipRun(legalEntityId: string, periodCode: string, jobIds: string[], reason: string) {
  return jsonRequest<{ runId: string; status: string }>("POST", "/runs", { legalEntityId, periodCode, jobIds, reason })
}

export function updateAccrualWipItem(runId: string, itemId: string, proposedWip: number, proposedAccrual: number, reviewerNote?: string) {
  return jsonRequest<{ itemId: string }>("PATCH", `/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}`, { proposedWip, proposedAccrual, reviewerNote })
}

export function requestAccrualWipReview(runId: string, reason?: string) { return jsonRequest("POST", `/runs/${encodeURIComponent(runId)}/request-review`, { reason }) }
export function approveAccrualWipRun(runId: string, reason?: string) { return jsonRequest("POST", `/runs/${encodeURIComponent(runId)}/approve`, { reason }) }
export function rejectAccrualWipRun(runId: string, reason: string) { return jsonRequest("POST", `/runs/${encodeURIComponent(runId)}/reject`, { reason }) }
export function postAccrualWipRun(runId: string) { return jsonRequest<{ batchId: string }>("POST", `/runs/${encodeURIComponent(runId)}/post`) }
export function reverseAccrualWipRun(runId: string, reversalPeriodCode: string, reason: string) { return jsonRequest<{ batchId: string }>("POST", `/runs/${encodeURIComponent(runId)}/reverse`, { reversalPeriodCode, reason }) }
