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
