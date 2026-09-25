import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import type { OpeningItemInput, TrialBalanceInput } from "./accounting-migration-import"

export type GlEntity = { LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_BaseCurrencyCodeSnapshot: string }
export type GlAccount = { FINNom_ID: string; FINNom_Code: string; FINNom_Name: string; FINNom_IsControlAccount: boolean; FINNom_AllowManualPosting: boolean; FINNom_IsActive: boolean }
export type JournalLine = { accountId: string; description: string; debit: string; credit: string }
export type Journal = { id: string; number?: number; accounting_date: string; reference: string; description: string; currency: string; lines: JournalLine[]; status: "draft" | "posted"; version?: number; mirror_status: string; mirror_error?: string; external_id?: string; deliveryNotice?: string; posted_at?: string; reversal_of_id?: string | null; reversal_reason?: string | null }
export type GlEntry = { id: string; batchId: string; number: string; period: string; postedAt: string; accountId: string; accountCode: string; accountName: string; description: string; debit: number; credit: number; source: string; sourceId: string }
export type GlWorkspace = { accounts: GlAccount[]; journals: Journal[]; enquiry: { rows: GlEntry[]; count: number; opening: number; debit: number; credit: number; closing: number } }
export type GlTransaction = { number: string; source: string; postedAt: string; currency: string; lines: Array<{ id: string; account: string; description: string; debit: number; credit: number }> }
async function call<T>(path: string, input?: unknown): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to continue.")
  const response = await edgeFetch("finance-ledger", path, session.access_token, input === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.detail ?? "The general ledger could not complete this request.") }
  return response.json()
}
export const getGlEntities = () => call<{ entities: GlEntity[] }>("/entities")
export const getGlTransaction = (legalEntityId: string, id: string) => call<GlTransaction>(`/transaction?${new URLSearchParams({ legalEntityId, id })}`)
export const getGlWorkspace = (params: Record<string, string>) => call<GlWorkspace>(`/workspace?${new URLSearchParams(params)}`)
export const journalAction = (action: "save" | "post" | "retry", legalEntityId: string, journal: Journal) => call<Journal>(`/journals/${action}`, { ...journal, legalEntityId, accountingDate: journal.accounting_date })
export const createJournalReversal = (legalEntityId: string, sourceJournalId: string, reason: string) =>
  call<Journal>("/journals/reverse", { legalEntityId, id: sourceJournalId, reason })

export type NominalGroup = { id: string; legal_entity_id: string; code: string; name: string; kind: "cost" | "revenue"; control_account_id: string; created_by: string; created_at: string }
export type NominalGroupMember = { account_id: string; group_id: string; role: "actual" | "accrued" }
export type ChargeNominalMapping = { legal_entity_id: string; charge_id: string; cost_group_id: string | null; revenue_group_id: string | null; version: number; updated_by: string; updated_at: string }
export type ChargeApplicability = { charge_id: string; record_kind: "quote" | "booking"; direction: "import" | "export" | "cross_trade" | "other"; mode: "air" | "sea" | "road" | "mix" | "other" }
export type ChargeCatalogueItem = { RATECharge_ID: string; RATECharge_Code: string; RATECharge_Name: string; RATECharge_Description: string | null; RATECharge_CategoryCode: string; RATECharge_DefaultApplicabilityCode: string; RATECharge_IsActive: boolean; RATECharge_ScopeConfigured: boolean; RATECharge_Version: number }
export type NominalStructure = { groups: NominalGroup[]; members: NominalGroupMember[]; chargeMappings: ChargeNominalMapping[]; chargeCodes: ChargeCatalogueItem[]; applicability: ChargeApplicability[] }
export type ResolvedNominalGroup = NominalGroup & { actual: { id: string; code: string; name: string }; accrued: { id: string; code: string; name: string } }
export const getNominalStructure = (legalEntityId: string) => call<NominalStructure>(`/nominal-structure?${new URLSearchParams({ legalEntityId })}`)
export const createNominalGroup = (legalEntityId: string, input: { code: string; name: string; kind: "cost" | "revenue"; controlAccountId: string; actualAccountId: string; accruedAccountId: string }) =>
  call<ResolvedNominalGroup>("/nominal-structure", { ...input, legalEntityId, action: "create_group" })
export const mapChargeNominals = (legalEntityId: string, input: { chargeId: string; costGroupId: string | null; revenueGroupId: string | null; version: number }) =>
  call<ChargeNominalMapping>("/nominal-structure", { ...input, legalEntityId, action: "map_charge" })
export const saveChargeCatalogueItem = (legalEntityId: string, input: { id?: string; version: number; code: string; name: string; description: string; category: string; side: string; active: boolean; applicability: Array<{ recordKind: ChargeApplicability["record_kind"]; direction: ChargeApplicability["direction"]; mode: ChargeApplicability["mode"] }> }) =>
  call<ChargeCatalogueItem>("/charge-catalogue", { ...input, legalEntityId })
export const resolveChargeNominals = (legalEntityId: string, chargeId: string) =>
  call<{ version: number; chargeId: string; legalEntityId: string; cost: ResolvedNominalGroup | null; revenue: ResolvedNominalGroup | null }>(`/charge-nominals?${new URLSearchParams({ legalEntityId, chargeId })}`)

export type ChargeMappingCutover = { id: string; legal_entity_id: string; effective_date: string; status: "proposed" | "approved" | "active"; mapping_snapshot: Record<string, unknown>; proposed_by: string; proposed_at: string; approved_by: string | null; approved_at: string | null; activated_by: string | null; activated_at: string | null }
export const getChargeMappingCutovers = (legalEntityId: string) =>
  call<ChargeMappingCutover[]>(`/charge-mapping-cutover?${new URLSearchParams({ legalEntityId })}`)
export const chargeMappingCutoverAction = (legalEntityId: string, action: "propose" | "approve" | "activate", input: { id?: string; effectiveDate?: string }) =>
  call<ChargeMappingCutover>("/charge-mapping-cutover", { legalEntityId, action, ...input })

export type MigrationReconciliation = {
  reconciled: boolean; postingAuthorised: false
  issues: Array<{ area: "batch" | "trial_balance" | "open_items" | "control"; row?: number; message: string }>
  controls: Array<{ accountId: string; accountCode: string; ledger: "receivables" | "payables"; trialBalance: string; openItems: string; difference: string }>
  totals: { debit: string; credit: string; difference: string; baseCurrency: string } | null
  postingStrategy?: "trial_balance_once_open_items_without_additional_gl"
}
export const reconcileMigration = (legalEntityId: string, input: { cutoffDate: string; baseCurrency: string; trialBalance: TrialBalanceInput[]; openItems: OpeningItemInput[] }) =>
  call<MigrationReconciliation>("/migration/reconcile", { ...input, legalEntityId })

export type OpeningBalancePackage = { id: string; legal_entity_id: string; source_file_name: string; source_sha256: string; source_items_file_name: string | null; source_items_sha256: string | null; source_items_count: number; package_kind: "gl_only" | "full_open_items"; closing_date: string; opening_date: string; base_currency: string; debit_total: string; credit_total: string; evidence: { bank: string; tax: string; accrualWip: string; sourceReconciliation: string; partyMapping?: string; openItems?: string; fx?: string }; status: "staged" | "approved" | "posted"; staged_by: string; approved_by: string | null; posted_by: string | null; posting_batch_id: string | null }
export type OpeningBalanceRecord = { package: OpeningBalancePackage; rowCount: number; rows: Array<{ source_row_number: number; source_account_code: string; nominal_code_snapshot: string; nominal_name_snapshot: string; debit: string; credit: string }> }
export type OpeningSourceItem = { source_row_number: number; source_id: string; source_party_code: string; party_org_id: string; source_reference: string; kind: string; document_date: string; due_date: string | null; currency_code: string; original_amount: string; original_base_amount: string; outstanding_amount: string; outstanding_base_amount: string; historical_vat_evidence_ref: string | null; control_nominal_id: string }
export const getOpeningSourceItems = (legalEntityId: string, id: string, offset = 0) =>
  call<{ rows: OpeningSourceItem[]; total: number; offset: number }>(`/opening-balances/items?${new URLSearchParams({ legalEntityId, id, offset: String(offset) })}`)
export const getOpeningBalances = (legalEntityId: string) =>
  call<OpeningBalanceRecord[]>(`/opening-balances?${new URLSearchParams({ legalEntityId })}`)
export const getOpeningBalancePackage = (legalEntityId: string, id: string) =>
  call<OpeningBalanceRecord[]>(`/opening-balances?${new URLSearchParams({ legalEntityId, id })}`)
export const openingBalanceAction = (legalEntityId: string, action: "stage" | "approve" | "post", input: { id?: string; packageKind?: "gl_only" | "full_open_items"; sourceSystem?: "CargoWise"; sourceFileName?: string; sourceSha256?: string; sourceItemsFileName?: string; sourceItemsSha256?: string; sourceItemsSheetName?: string; cutoffDate?: string; baseCurrency?: string; evidence?: { bank: string; tax: string; accrualWip: string; sourceReconciliation: string; partyMapping?: string; openItems?: string; fx?: string }; trialBalance?: Array<TrialBalanceInput & { sourceRow: number }>; openItems?: Array<OpeningItemInput & { sourceRow: number; partyOrgId: string }> | OpeningItemInput[] }) =>
  call<OpeningBalancePackage>("/opening-balances", { legalEntityId, action, ...input })

export function journalTotal(lines: JournalLine[], side: "debit" | "credit"): bigint | null {
  let total = 0n
  for (const line of lines) {
    const match = String(line[side]).match(/^(\d{1,12})(?:\.(\d{1,4}))?$/)
    if (!match) return null
    total += BigInt(match[1]) * 10000n + BigInt((match[2] ?? "").padEnd(4, "0"))
  }
  return total
}
