import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type FinanceApprovalWorkflow =
  | "receivables" | "document" | "cash" | "payment_run" | "purchase_order" | "supplier_match"
  | "charge_correction" | "charge_case_resolution" | "recognition_mandate"
  | "vat_control" | "period_close" | "opening_balance" | "opening_fx" | "bank_match"
export type FinanceApprovalMode = "always_review" | "exception_review" | "automatic"
export type FinanceApprovalPolicy = {
  policyId: string
  entityId: string
  workflow: FinanceApprovalWorkflow
  mode: FinanceApprovalMode
  revision: number
  maxAutoAmount: number | null
  maxVariancePercent: number | null
  minExpectedMarginPercent: number | null
  reason: string
  createdAt: string
}

export type FinanceApprovalDecision = {
  workflow: string
  canAuto: boolean
  reason: string
  reasons: string[]
  revision: number | null
  evaluatedAt: string
  baseCurrency: string
  amount: number
  maxAutoAmount: number | null
  minExpectedMarginPercent?: number
  jobs?: Array<{
    jobId: string; reference: string; expectedSales: number | null; expectedCosts: number | null
    expectedProfit: number | null; expectedMarginPercent: number | null; reason: string | null
  }>
}

const approvalReasonLabels: Record<string, string> = {
  amount_limit: "Document value exceeds the approval threshold",
  expected_job_loss: "Expected job sales are below expected costs",
  expected_margin_limit: "Expected job margin is below the minimum",
  expected_costing_incomplete: "Expected job costing is incomplete",
  expected_margin_unavailable: "Expected job margin cannot be calculated",
  job_scope_unverified: "Linked job and legal entity need checking",
  accounting_period_closed: "Accounting period is not open",
  native_ledger_unavailable: "Native ledger is not ready",
  required_mirror_unavailable: "Required accounting mirror is not ready",
  foreign_currency_review: "Foreign-currency transaction needs review",
  document_type_review: "Document type requires review under the current policy",
  policy_missing: "Finance approval policy has not been configured",
  review_required: "Current policy requires review",
  missing_variance_evidence: "No verified comparison for the variance limit",
  variance_limit: "Variance exceeds the approval threshold",
  advisory_exception: "Source evidence needs review",
  hard_exception: "Finance controls require review",
}

export function financeApprovalReasons(decision?: FinanceApprovalDecision | null): string[] {
  if (!decision || decision.canAuto) return []
  const reasons = decision.reasons?.length ? decision.reasons : [decision.reason]
  return reasons.filter((reason) => reason !== "hard_exception" || reasons.length === 1)
    .map((reason) => approvalReasonLabels[reason] ?? "Finance review is required")
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to continue.")
  const response = await edgeFetch("finance-subledger", path, session.access_token, init)
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.detail || "Finance approval policy could not be loaded.")
  return result as T
}

export function getFinanceApprovalPolicies(entityId: string) {
  return request<{ policies: FinanceApprovalPolicy[] }>(`/approval-policies/${encodeURIComponent(entityId)}`)
}

export function saveFinanceApprovalPolicy(entityId: string, workflow: FinanceApprovalWorkflow,
  input: { mode: FinanceApprovalMode; maxAutoAmount: number | null; maxVariancePercent: number | null; minExpectedMarginPercent?: number | null; reason: string }) {
  return request<FinanceApprovalPolicy>(`/approval-policies/${encodeURIComponent(entityId)}/${encodeURIComponent(workflow)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
}
