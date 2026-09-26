import { HttpError } from "./backend.ts"
import { erpNextList, erpNextOrigin, erpNextRequest, erpNextSubmit } from "./erpnext.ts"
import { ensureErpNextDocument } from "./erpnext-document-identity.ts"
import { verifyJournal, journalUnits, type JournalExport } from "./erpnext-journal.ts"
import { mappedJournalLines } from "./finance-journal-delivery.ts"
import { evidenceHash } from "./finance-period-comparison.mts"

function checked(result: any, label: string) { if (result.error) throw new HttpError(409, `${label}: ${result.error.message}`); return result.data }
type OpeningExport = JournalExport & { sourceSha256: string }

async function source(admin: any, entity: string, packageId: string) {
  const delivery = checked(await admin.from("FIN_OpeningMirrorDeliveries").select("*").eq("package_id", packageId).eq("legal_entity_id", entity).single(), "Opening mirror queue")
  const [packageResult, connectionResult, rowResult] = await Promise.all([
    admin.from("FIN_OpeningBalancePackages").select("id,legal_entity_id,status,package_kind,source_sha256,opening_date,base_currency,posting_batch_id").eq("id", packageId).eq("legal_entity_id", entity).single(),
    admin.from("ACCI_Connections").select("ACCIC_ID,ACCIC_LegalEntityID,ACCIC_StatusCode,ACCIC_ProviderCode,ACCIC_ExternalTenantName,ACCIC_ExternalBaseCurrencyCode,ACCIC_SettingsJSON").eq("ACCIC_ID", delivery.connection_id).eq("ACCIC_LegalEntityID", entity).single(),
    admin.from("FIN_OpeningBalanceRows").select("id,source_row_number,nominal_account_id,nominal_code_snapshot,debit,credit").eq("package_id", packageId).order("source_row_number"),
  ])
  const packageRow = checked(packageResult, "Opening package"), connection = checked(connectionResult, "Opening mirror connection"), rows = checked(rowResult, "Opening source rows")
  if (packageRow.package_kind === "full_open_items") throw new HttpError(409,
    "A full CargoWise opening package cannot deliver its entire trial balance as one ERPNext journal. Its invoices and unapplied payments need a reviewed provider subledger import and a residual opening journal that excludes their AR/AP and bank control postings.")
  if (packageRow.status !== "posted" || !packageRow.posting_batch_id || connection.ACCIC_StatusCode !== "active" || connection.ACCIC_ProviderCode !== "erpnext" ||
    connection.ACCIC_ExternalBaseCurrencyCode !== packageRow.base_currency || connection.ACCIC_SettingsJSON?.partySync?.siteOrigin !== erpNextOrigin()) {
    throw new HttpError(409, "The posted opening package and its exact ERPNext site, company and currency must still agree.")
  }
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 2000) throw new HttpError(409, "The opening journal needs the complete bounded source trial balance.")
  return { delivery, packageRow, connection, rows }
}

async function payloadFor(admin: any, sourceRows: Awaited<ReturnType<typeof source>>): Promise<{ payload: OpeningExport; accounts: any[] }> {
  const { packageRow, connection, rows } = sourceRows
  const ids = [...new Set<string>(rows.map((row: any) => row.nominal_account_id))]
  const [accountsResult, mappingsResult] = await Promise.all([
    admin.from("FIN_NominalAccounts").select("FINNom_ID,FINNom_Code,FINNom_AccountTypeCode,FINNom_ReportCategoryCode,FINNom_IsActive,FINNom_IsControlAccount,FINNom_ControlTypeCode")
      .eq("FINNom_LegalEntityID", packageRow.legal_entity_id).in("FINNom_ID", ids),
    admin.from("ACCI_AccountMappings").select("ACCIAM_LocalContextCode,ACCIAM_ProviderAccountID")
      .eq("ACCIAM_ConnectionID", connection.ACCIC_ID).eq("ACCIAM_IsActive", true).in("ACCIAM_LocalContextCode", ids.map(id => `nominal:${id}`)),
  ])
  const accounts = checked(accountsResult, "Opening nominal accounts"), mappings = checked(mappingsResult, "Opening nominal mappings")
  if (accounts.length !== ids.length) throw new HttpError(409, "Every opening nominal must belong to the selected legal entity.")
  const lines = mappedJournalLines(rows.map((row: any) => ({ accountId: row.nominal_account_id, debit: row.debit, credit: row.credit,
    description: `CargoWise opening source row ${row.source_row_number} · ${row.nominal_code_snapshot}` })), accounts, mappings, "CargoWise opening balance")
  const payload: OpeningExport = { id: packageRow.id, siteOrigin: erpNextOrigin(), company: connection.ACCIC_ExternalTenantName,
    currency: packageRow.base_currency, date: packageRow.opening_date, sourceSha256: packageRow.source_sha256,
    description: `CargoWise opening · ${packageRow.source_sha256.slice(0, 12)}`, lines }
  return { payload, accounts }
}

async function validateOpeningJournal(payload: OpeningExport, accounts: any[]) {
  const debit = payload.lines.reduce((sum, line) => sum + journalUnits(line.debit), 0n)
  const credit = payload.lines.reduce((sum, line) => sum + journalUnits(line.credit), 0n)
  if (debit <= 0n || debit !== credit) throw new HttpError(409, "The opening journal must be a balanced four-decimal trial balance.")
  const companies = await erpNextList("Company", ["name", "default_currency"], [["name", "=", payload.company]])
  if (companies.length !== 1 || companies[0].default_currency !== payload.currency) throw new HttpError(409, "The ERPNext Company and base currency differ from the approved source.")
  const byCode = new Map(accounts.map((item: any) => [item.FINNom_Code, item]))
  for (const line of payload.lines) {
    const account = byCode.get(line.nominalCode)
    if (!account || !["Asset", "Liability", "Equity", "Income", "Expense"].includes(line.expectedRootType)) throw new HttpError(409, "An opening nominal lacks a reviewed account classification.")
    const found = await erpNextList("Account", ["name", "company", "account_currency", "is_group", "disabled", "account_type", "root_type"], [["name", "=", line.account]])
    const provider = found[0]
    if (found.length !== 1 || provider.company !== payload.company || provider.account_currency !== payload.currency ||
      Number(provider.is_group) !== 0 || Number(provider.disabled) !== 0 || provider.root_type !== line.expectedRootType) {
      throw new HttpError(409, `Opening nominal ${line.nominalCode} has an invalid ERPNext account mapping.`)
    }
    const expectedType = account.FINNom_AccountTypeCode === "Receivable" ? "Receivable" : account.FINNom_AccountTypeCode === "Payable" ? "Payable"
      : String(account.FINNom_ControlTypeCode ?? "").includes("bank") ? "Bank" : null
    if (expectedType && provider.account_type !== expectedType) throw new HttpError(409, `Opening ${expectedType.toLowerCase()} nominal ${line.nominalCode} is mapped to a different ERPNext control type.`)
  }
}

/** Sends only the exact posted opening package; uncertain replies recover its unique provider identity. */
export async function deliverFinanceOpeningMirror(admin: any, actor: string, entity: string, packageId: string) {
  const sourceRows = await source(admin, entity, packageId)
  if (sourceRows.delivery.status === "matched") return { status: "matched", externalId: sourceRows.delivery.external_id, readbackHash: sourceRows.delivery.readback_hash }
  const { payload, accounts } = await payloadFor(admin, sourceRows)
  await validateOpeningJournal(payload, accounts)
  const claimed = checked(await admin.rpc("multideck_finance_opening_mirror_claim", { p_actor: actor, p_entity: entity, p_package: packageId, p_payload: payload }), "Opening mirror claim")
  if (claimed.status === "matched") return claimed
  let externalId: string | null = claimed.externalId ?? null
  try {
    const providerPayload = { doctype: "Journal Entry", voucher_type: "Journal Entry", company: payload.company, posting_date: payload.date,
      multi_currency: 0, user_remark: payload.description,
      accounts: payload.lines.map(line => ({ account: line.account, account_currency: payload.currency, exchange_rate: 1,
        debit_in_account_currency: line.debit, credit_in_account_currency: line.credit, user_remark: line.description })) }
    const identity = await ensureErpNextDocument({ externalCompany: payload.company, localTable: "FIN_OpeningBalancePackages", localId: packageId, typeCode: "opening_balance" }, "Journal Entry", providerPayload)
    if (externalId && externalId !== identity.externalId) throw new HttpError(409, "The retained ERPNext opening identity changed. Review it before retrying.")
    externalId = identity.externalId
    const read = async () => (await erpNextRequest<{ data: any }>(`/api/resource/Journal%20Entry/${encodeURIComponent(externalId!)}`, { exactNumbers: true })).data
    const draft = await read()
    if (draft.custom_multideck_document_key !== identity.key) throw new HttpError(409, "The ERPNext opening journal has a different Multideck identity.")
    verifyJournal(draft, payload, Number(draft.docstatus) === 1)
    if (Number(draft.docstatus) === 0) await erpNextSubmit("Journal Entry", externalId, draft)
    const submitted = await read()
    if (submitted.custom_multideck_document_key !== identity.key) throw new HttpError(409, "The submitted ERPNext opening identity changed.")
    verifyJournal(submitted, payload, true)
    const hash = await evidenceHash(submitted)
    return checked(await admin.rpc("multideck_finance_opening_mirror_finish", { p_actor: actor, p_entity: entity, p_package: packageId,
      p_token: claimed.token, p_status: "matched", p_external_id: externalId, p_readback_hash: hash, p_error: null }), "Opening mirror readback")
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERPNext opening journal delivery failed."
    checked(await admin.rpc("multideck_finance_opening_mirror_finish", { p_actor: actor, p_entity: entity, p_package: packageId,
      p_token: claimed.token, p_status: "failed", p_external_id: externalId, p_readback_hash: null, p_error: message.slice(0, 1000) }), "Opening mirror failure retention")
    throw error
  }
}
