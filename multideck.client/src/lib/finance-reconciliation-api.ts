import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type BankAccount = { FINBank_ID: string; FINBank_Code: string; FINBank_Name: string; FINBank_CurrencyCode: string; FINBank_NominalAccountID: string | null }
export type BankPeriod = { FINPeriod_ID: string; FINPeriod_Code: string; FINPeriod_StartDate: string; FINPeriod_EndDate: string; FINPeriod_StatusCode: string; FINPeriod_BaseCurrencyCode: string }
export type BankControl = { status: "incomplete" | "ready_for_review" | "verified"; reason?: string; statementId?: string; bankId: string; periodId: string; currency?: string; rowCount?: number; unmatchedRows?: number; invalidMatches?: number; unrepresentedCash?: number; orphanBankLines?: number; openingStatement?: string; closingStatement?: string; openingLedger?: string; closingLedger?: string; cashMovement?: string; ledgerMovement?: string; issues?: string[]; verifiedAt?: string | null }
export type BankLine = { FINStmtLine_ID: string; FINStmtLine_LineNo: number; FINStmtLine_TransactionDate: string; FINStmtLine_Reference: string | null; FINStmtLine_Description: string | null; FINStmtLine_Amount: string; FINStmtLine_BalanceAfter: string; FINStmtLine_MatchStatusCode: string }
export type BankCash = { FINCash_ID: string; FINCash_Number: string | null; FINCash_TypeCode: string; FINCash_TransactionDate: string; FINCash_AccountingDate: string; FINCash_Amount: string; FINCash_Reference: string | null; FINCash_CurrencyCodeSnapshot: string }
export type BankWorkspace = { control: BankControl; lines: BankLine[]; matches: Array<{ FINBankMatch_StatementLineID: string; FINBankMatch_CashID: string; FINBankMatch_Notes: string }>; cash: BankCash[] }

async function call<T>(path: string, input?: unknown): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to continue.")
  const response = await edgeFetch("finance-reconciliation", path, session.access_token, input === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.detail ?? "Reconciliation could not complete this request.") }
  return response.json()
}
export const bankSetup = (legalEntityId: string) => call<{ banks: BankAccount[]; periods: BankPeriod[] }>(`/bank/setup?${new URLSearchParams({ legalEntityId })}`)
export const bankWorkspace = (legalEntityId: string, periodId: string, bankId: string) => call<BankWorkspace>(`/bank/control?${new URLSearchParams({ legalEntityId, periodId, bankId })}`)
export const importBankStatement = (input: { legalEntityId: string; bankId: string; fileName: string; csv: string; openingBalance: string; closingBalance: string; dateFrom: string; dateTo: string }) => call<{ id: string; duplicate: boolean; status: string }>("/bank/import", input)
export const matchBankLine = (input: { legalEntityId: string; bankId: string; lineId: string; cashId: string; reason: string }) => call<{ lineId: string; cashId: string; status: string }>("/bank/match", input)
export const unmatchBankLine = (input: { legalEntityId: string; bankId: string; lineId: string; reason: string }) => call<boolean>("/bank/unmatch", input)
export const verifyBankStatement = (input: { legalEntityId: string; bankId: string; periodId: string; reason: string }) => call<BankControl>("/bank/verify", input)
