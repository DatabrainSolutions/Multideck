import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type FinanceOperationEntity = { LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_BaseCurrencyCodeSnapshot: string | null }
export type AgedFinanceItem = {
  id: string; partyId: string; partyName: string; number: string; ledger: "receivables" | "payables"; dueDate: string | null
  currency: string; outstanding: number; status: string; updatedAt: string; daysOverdue: number
  bucket: "current" | "1–30" | "31–60" | "61–90" | "90+"; priority: "routine" | "review" | "urgent"; priorityReasons: string[]
  evidence: { sourceTable: "FIN_Documents"; sourceId: string; observedAt: string }
}
export type FinanceWorklist = { entityId: string; ledger: "receivables" | "payables"; generatedAt: string; asOf: string; items: AgedFinanceItem[]; offsets: Array<{ id: string; kind: "credit_note" | "debit_note" | "customer_receipt" | "supplier_payment"; number: string; partyId: string; partyName: string; currency: string; amount: number; evidence: { sourceTable: "FIN_Documents" | "FIN_CashTransactions"; sourceId: string; observedAt: string } }>; totals: Record<string, { grossInvoices: number; unappliedOffsets: number; net: number }>; basis: string }
export type SupplierPurchaseOrder = {
  FINPO_ID: string; FINPO_LegalEntityID: string; FINPO_SupplierOrgID: string; FINPO_JobID: string | null; FINPO_Number: string
  FINPO_CurrencyCode: string; FINPO_NetAmount: number; FINPO_Description: string; FINPO_StatusCode: string; FINPO_CreatedAt: string
  FINPO_CreatedBy: string; FINPO_ReviewedAt: string | null; supplierName: string; matchedNet: number
}
export type MatchCandidate = { id: string; number: string; available: number; netAmount: number; score: number; reasons: string[]; conflicts: string[]; evidence: { sourceTable: string; sourceId: string } }
export type MatchSuggestions = { document: { FINDoc_ID: string; FINDoc_Number: string | null; FINDoc_NetAmount: number; FINDoc_StatusCode: string }; candidates: MatchCandidate[]; existing: { FINPOMatch_ID: string; FINPOMatch_PurchaseOrderID: string } | null; generatedAt: string; ruleVersion: string }
export type FinanceMatchProposal = { FINMatchProposal_ID: string; FINMatchProposal_DocumentID: string; FINMatchProposal_PurchaseOrderID: string | null; FINMatchProposal_StatusCode: "pending" | "approved" | "rejected" | "stale"; FINMatchProposal_Model: string; FINMatchProposal_PromptVersion: string; FINMatchProposal_CreatedAt: string; FINMatchProposal_ResultJSON: { rationale: string; citations: Array<{ field: string; table: string; recordId: string; fileId: string | null; fileSha256: string | null; page: number | null; value: string | number | null }> }; FINMatchProposal_SourceJSON: { document: { fileName: string | null; extractionId: string | null; sha256: string | null } }; FINMatchProposal_ReviewReason: string | null; automaticDecisionError?: string; automaticDecision?: { status: string; reason: string } }
export type CollectionAction = { FINCollect_ID: string; FINCollect_DocumentID: string; FINCollect_CustomerOrgID: string; FINCollect_ActionCode: string; FINCollect_Note: string; FINCollect_FollowUpDate: string | null; FINCollect_CreatedAt: string }
export type PaymentRun = { FINPayRun_ID: string; FINPayRun_Number: string; FINPayRun_StatusCode: string; FINPayRun_BankAccountID: string; FINPayRun_PaymentDate: string; FINPayRun_CurrencyCodeSnapshot: string; FINPayRun_TotalAmount: number; FINPayRun_CreatedBy: string; FINPayRun_Reason: string; items: Array<{ FINPayRunItem_DocumentID: string; FINPayRunItem_SupplierOrgID: string; FINPayRunItem_Amount: number; FINPayRunItem_CashID: string }> }
export type CustomerStatement = { title: string; generatedAt: string; legalEntity: string; customerId: string; customerName: string; basis: string; lines: Array<{ id: string; number: string | null; type: string; documentDate: string; dueDate: string | null; currency: string; originalAmount: number; outstanding: number; evidence: { sourceTable: "FIN_Documents" | "FIN_CashTransactions"; sourceId: string } }>; totals: Record<string, number> }
export type RemittanceAdvice = { run: PaymentRun; generatedAt: string; delivery: "draft_advice_only"; lines: Array<{ supplierId: string; supplierName: string; documentId: string; documentNumber: string; documentDate: string; paymentNumber: string; postingStatus: string; amount: number; evidence: { sourceTable: string; sourceId: string } }> }
export type JobProfitability = { generatedAt: string; jobs: Array<{ id: string; reference: string; status: string; expectedRevenue: number; expectedCost: number; actualRevenue: number; actualCost: number; openWip: number; openAccrual: number; recognisedRevenue: number; recognisedCost: number; grossProfit: number; charges: Array<Record<string, string | number | object | null>> }> }

export class FinanceOperationsApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new FinanceOperationsApiError("Sign in again to continue.")
  const response = await edgeFetch("finance-operations", path, session.access_token, init)
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new FinanceOperationsApiError(error?.detail ?? "Finance operations could not complete that request.")
  }
  return response.json() as Promise<T>
}
const get = <T>(path: string) => call<T>(path)
const post = <T>(path: string, value: unknown) => call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })
const query = (value: string) => encodeURIComponent(value)

export const getFinanceOperationEntities = () => get<{ entities: FinanceOperationEntity[] }>("/entities")
export const getAgedFinanceWorklist = (entityId: string, ledger: "receivables" | "payables") => get<FinanceWorklist>(`/worklist?entityId=${query(entityId)}&ledger=${ledger}`)
export const getFinancePaymentBanks = (entityId: string) => get<{ bankAccounts: Array<{ FINBank_ID: string; FINBank_Code: string; FINBank_Name: string; FINBank_LegalEntityID: string; FINBank_CurrencyCode: string }> }>(`/payment-banks?entityId=${query(entityId)}`)
export const getSupplierPurchaseOrders = (entityId: string) => get<SupplierPurchaseOrder[]>(`/purchase-orders?entityId=${query(entityId)}`)
export const createSupplierPurchaseOrder = (input: { legalEntityId: string; supplierOrgId: string; jobId?: string | null; number: string; currencyCode: string; netAmount: number; description: string; sourceReference?: string }) => post<SupplierPurchaseOrder>("/purchase-orders", input)
export const approveSupplierPurchaseOrder = (id: string, reason: string) => post<SupplierPurchaseOrder>(`/purchase-orders/${query(id)}/approve`, { reason })
export const getSupplierInvoiceMatchSuggestions = (documentId: string) => get<MatchSuggestions>(`/matches?documentId=${query(documentId)}`)
export const approveSupplierInvoiceMatch = (documentId: string, purchaseOrderId: string, reason: string, proposalId?: string) => post<{ FINPOMatch_ID: string }>("/matches", { documentId, purchaseOrderId, reason, proposalId })
export const getFinanceMatchProposals = (documentId: string) => get<FinanceMatchProposal[]>(`/match-proposals?documentId=${query(documentId)}`)
export const generateFinanceMatchProposal = (documentId: string) => post<FinanceMatchProposal>("/match-proposals", { documentId })
export const rejectFinanceMatchProposal = (id: string, reason: string) => post<FinanceMatchProposal>(`/match-proposals/${query(id)}/reject`, { reason })
export const getCollectionActions = (entityId: string) => get<CollectionAction[]>(`/collections?entityId=${query(entityId)}`)
export const recordCollectionAction = (input: { documentId: string; actionCode: string; note: string; followUpDate?: string | null }) => post<CollectionAction>("/collections", input)
export const getCustomerStatement = (entityId: string, customerId: string) => get<CustomerStatement>(`/statement?entityId=${query(entityId)}&customerId=${query(customerId)}`)
export const getPaymentRuns = (entityId: string) => get<PaymentRun[]>(`/payment-runs?entityId=${query(entityId)}`)
export const preparePaymentRun = (input: { bankAccountId: string; documentIds: string[]; paymentDate: string; exchangeRate: number; reason: string }) => post<{ runId: string; status: string; automaticDecisionError?: string; reason?: string }>("/payment-runs", input)
export const reviewPaymentRun = (id: string, decision: "approved" | "rejected", reason: string) => post<{ runId: string; status: string }>(`/payment-runs/${query(id)}/review`, { decision, reason })
export const getRemittanceAdvice = (id: string) => get<RemittanceAdvice>(`/payment-runs/${query(id)}/remittance`)
export const getJobProfitability = (entityId: string) => get<JobProfitability>(`/profitability?entityId=${query(entityId)}`)
