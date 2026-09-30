import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type FinanceApprovalWorkflow =
  | "document" | "cash" | "payment_run" | "purchase_order" | "supplier_match"
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
  reason: string
  createdAt: string
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
  input: { mode: FinanceApprovalMode; maxAutoAmount: number | null; maxVariancePercent: number | null; reason: string }) {
  return request<FinanceApprovalPolicy>(`/approval-policies/${encodeURIComponent(entityId)}/${encodeURIComponent(workflow)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
}
