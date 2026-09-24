import { HttpError } from "./backend.ts"
import { erpNextOrigin } from "./erpnext.ts"
import { exportErpNextJournal, validateErpNextJournal, JournalDeliveryError, type JournalExport } from "./erpnext-journal.ts"

function checked(result: any) {
  if (result.error) throw new HttpError(result.error.code === "42501" ? 403 : result.error.code === "P0002" ? 404 : ["22023", "22P02", "23502", "23514", "22007", "22008"].includes(result.error.code) ? 400 : 500, result.error.message)
  return result.data
}
const publicJournal = (row: any) => { const { mirror_payload, mirror_token, mirror_lease_until, mirror_connection_id, ...safe } = row; return safe }

export function mappedJournalLines(lines: any[], accounts: any[], mappings: any[], description: string) {
  const byId = new Map(accounts.map((account: any) => [account.FINNom_ID, account]))
  return lines.map((line: any) => {
    const account: any = byId.get(line.accountId)
    if (!account?.FINNom_IsActive) throw new HttpError(409, `Journal nominal ${account?.FINNom_Code ?? line.accountId} is not active in this legal entity.`)
    const targets = [...new Set(mappings
      .filter((mapping: any) => mapping.ACCIAM_LocalContextCode === `nominal:${account.FINNom_ID}`)
      .map((mapping: any) => String(mapping.ACCIAM_ProviderAccountID ?? "").trim())
      .filter(Boolean))]
    if (targets.length !== 1) throw new HttpError(409, targets.length
      ? `Nominal ${account.FINNom_Code} has conflicting Accounts System mappings. Keep one reviewed mapping, then retry.`
      : `Map nominal ${account.FINNom_Code} to an ERPNext account in Finance Admin → Mappings, then retry.`)
    const rootType = ({ asset: "Asset", liability: "Liability", equity: "Equity", income: "Income", direct_cost: "Expense", expense: "Expense" } as Record<string, string>)[account.FINNom_ReportCategoryCode]
      ?? (account.FINNom_ReportCategoryCode === "finance" ? account.FINNom_AccountTypeCode === "Income Account" ? "Income" : "Expense" : null)
    if (!rootType) throw new HttpError(409, `Classify nominal ${account.FINNom_Code} before ERPNext delivery.`)
    return { account: targets[0], nominalCode: account.FINNom_Code, expectedRootType: rootType, debit: String(line.debit), credit: String(line.credit), description: line.description || description }
  })
}

async function deliver(admin: any, actor: string, entity: string, id: string) {
  const rpc = async (action: string, input: any) => checked(await admin.rpc("multideck_finance_journal", { p_actor: actor, p_entity: entity, p_action: action, p_input: { id, ...input } }))
  const journal = checked(await admin.from("FIN_Journals").select("*").eq("id", id).eq("legal_entity_id", entity).single())
  if (journal.mirror_status === "synced" || journal.mirror_status === "not_required") return publicJournal(journal)
  let connectionQuery = admin.from("ACCI_Connections").select("*").eq("ACCIC_LegalEntityID", entity).eq("ACCIC_StatusCode", "active")
  if (journal.mirror_connection_id) connectionQuery = connectionQuery.eq("ACCIC_ID", journal.mirror_connection_id)
  const connections = checked(await connectionQuery)
  if (connections.length !== 1) throw new HttpError(409, "Select one active accounts system connection for this legal entity before journal delivery.")
  const connection = connections[0]
  if (connection.ACCIC_ProviderCode !== "erpnext") throw new HttpError(409, "Journal delivery is currently supported for ERPNext only.")
  if (connection.ACCIC_SettingsJSON?.partySync?.siteOrigin !== erpNextOrigin() || connection.ACCIC_ExternalBaseCurrencyCode !== journal.currency || !connection.ACCIC_ExternalTenantName) throw new HttpError(409, "Review the linked accounts system site, company and currency in Finance settings.")
  let payload: JournalExport = journal.mirror_payload
  if (!payload) {
    const accountIds = [...new Set<string>(journal.lines.map((line: any) => line.accountId))]
    const [accounts, mappings] = await Promise.all([
      admin.from("FIN_NominalAccounts").select("FINNom_ID,FINNom_Code,FINNom_AccountTypeCode,FINNom_ReportCategoryCode,FINNom_IsActive").eq("FINNom_LegalEntityID", entity).in("FINNom_ID", accountIds),
      admin.from("ACCI_AccountMappings").select("ACCIAM_LocalContextCode,ACCIAM_ProviderAccountID").eq("ACCIAM_ConnectionID", connection.ACCIC_ID).eq("ACCIAM_IsActive", true).in("ACCIAM_LocalContextCode", accountIds.map((accountId) => `nominal:${accountId}`)),
    ])
    payload = { id, siteOrigin: erpNextOrigin(), company: connection.ACCIC_ExternalTenantName, currency: journal.currency, date: journal.accounting_date, description: `JN-${journal.number} · ${journal.description}`, lines: mappedJournalLines(journal.lines, checked(accounts), checked(mappings), journal.description) }
  }
  if (payload.siteOrigin !== erpNextOrigin() || payload.company !== connection.ACCIC_ExternalTenantName || payload.currency !== connection.ACCIC_ExternalBaseCurrencyCode) throw new HttpError(409, "The accounts system connection changed since this journal's delivery attempt. Restore and review the original connection before retrying.")
  if (!journal.mirror_payload) await validateErpNextJournal(payload)
  const claimed = await rpc("claim", { payload, connectionId: connection.ACCIC_ID })
  if (claimed.mirror_status === "synced") return publicJournal(claimed)
  let result: any
  try { result = { status: "synced", externalId: await exportErpNextJournal(claimed.mirror_payload) } }
  catch (error) { result = { status: "failed", error: error instanceof Error ? error.message : "Accounts system delivery failed. Retry after reviewing the connection.", ...(error instanceof JournalDeliveryError ? { externalId: error.externalId } : {}) } }
  // Completion must remain outside the external-delivery catch: uncertain
  // completion retains the lease and stable identity for safe recovery.
  return publicJournal(await rpc("finish", { token: claimed.mirror_token, ...result }))
}

export async function attemptDelivery(admin: any, actor: string, entity: string, id: string) {
  try { return await deliver(admin, actor, entity, id) }
  catch (error) {
    const message = error instanceof Error ? error.message : "Accounts system delivery needs attention."
    const retained = checked(await admin.rpc("multideck_finance_journal", { p_actor: actor, p_entity: entity, p_action: "delivery_error", p_input: { id, error: message } }))
    return { ...publicJournal(retained), deliveryNotice: message }
  }
}
