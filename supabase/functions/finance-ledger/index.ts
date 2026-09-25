import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission, routeParts } from "../_shared/backend.ts"
import { attemptDelivery } from "../_shared/finance-journal-delivery.ts"
import { reconcileAccountingMigration, type MigrationAccount } from "../_shared/accounting-migration-reconciliation.ts"

const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
function checked(result: any) {
  if (result.error) throw new HttpError(result.error.code === "42501" ? 403 : result.error.code === "P0002" ? 404 : ["22023", "22P02", "23502", "23514", "22007", "22008"].includes(result.error.code) ? 400 : 500, result.error.message)
  return result.data
}
const publicJournal = (row: any) => { const { mirror_payload, mirror_token, mirror_lease_until, mirror_connection_id, ...safe } = row; return safe }


Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    await requirePermission(admin, current.User_ID, "Finance.Management.View")
    const parts = routeParts(request, "finance-ledger"), url = new URL(request.url)
    const entities = checked(await admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot").eq("Company_ID", current.Company_ID).eq("LegalEntity_IsActive", true).order("LegalEntity_Name"))
    if (request.method === "GET" && parts[0] === "entities") return json(request, { entities })
    const input: any = request.method === "POST" ? await body(request) : Object.fromEntries(url.searchParams)
    const entity = input.legalEntityId
    if (!uuid(entity) || !entities.some((row: any) => row.LegalEntity_ID === entity)) throw new HttpError(404, "Legal entity not found in this workspace.")
    if (request.method === "POST" && parts[0] === "migration" && parts[1] === "reconcile") {
      await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      const accounts: MigrationAccount[] = []
      for (let offset = 0; ; offset += 500) {
        const page = checked(await admin.from("FIN_NominalAccounts")
          .select("FINNom_ID,FINNom_Code,FINNom_IsActive,FINNom_IsControlAccount,FINNom_AccountTypeCode")
          .eq("FINNom_LegalEntityID", entity).order("FINNom_ID").range(offset, offset + 499))
        for (const row of page) accounts.push({ id: row.FINNom_ID, code: row.FINNom_Code, active: row.FINNom_IsActive,
          control: row.FINNom_IsControlAccount && row.FINNom_AccountTypeCode === "Receivable" ? "receivables"
            : row.FINNom_IsControlAccount && row.FINNom_AccountTypeCode === "Payable" ? "payables" : null })
        if (page.length < 500) break
      }
      return json(request, reconcileAccountingMigration(input, accounts, entities.find((row: any) => row.LegalEntity_ID === entity).LegalEntity_BaseCurrencyCodeSnapshot))
    }
    if (parts[0] === "opening-balances" && parts[1] === "items" && request.method === "GET") {
      if (!uuid(input.id)) throw new HttpError(400, "Choose an opening balance package.")
      const offset = Number(input.offset ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 50000) throw new HttpError(400, "Choose a valid source-item page.")
      const packageRow = checked(await admin.from("FIN_OpeningBalancePackages")
        .select("id,source_items_count,package_kind").eq("id", input.id).eq("legal_entity_id", entity).maybeSingle())
      if (!packageRow) throw new HttpError(404, "Opening balance package not found.")
      if (packageRow.package_kind !== "full_open_items") throw new HttpError(400, "This package has no source open items.")
      const rows = checked(await admin.from("FIN_OpeningSourceItems")
        .select("source_row_number,source_id,source_party_code,party_org_id,source_reference,kind,document_date,due_date,currency_code,original_amount,original_base_amount,outstanding_amount,outstanding_base_amount,historical_vat_evidence_ref,control_nominal_id")
        .eq("package_id", input.id).order("source_row_number").range(offset, offset + 99))
      return json(request, { rows, total: packageRow.source_items_count, offset })
    }
    if (parts[0] === "opening-balances" && (request.method === "GET" || request.method === "POST")) {
      const action = request.method === "GET" ? "read" : input.action
      if (!["read", "stage", "approve", "post"].includes(action)) throw new HttpError(400, "Choose an opening balance action.")
      if (action !== "read") await requirePermission(admin, current.User_ID,
        action === "stage" ? "Finance.Configuration.Manage" : "Finance.Management.Post")
      if (["approve", "post"].includes(action) && !uuid(input.id)) throw new HttpError(400, "Choose an opening balance package.")
      return json(request, checked(await admin.rpc("multideck_finance_opening_balances", {
        p_actor: current.User_ID, p_entity: entity, p_action: action, p_input: input,
      })))
    }
    if (parts[0] === "charge-mapping-cutover" && (request.method === "GET" || request.method === "POST")) {
      const action = request.method === "GET" ? "read" : input.action
      if (!["read", "propose", "approve", "activate"].includes(action)) throw new HttpError(400, "Choose a charge mapping cutover action.")
      if (action !== "read") await requirePermission(admin, current.User_ID,
        action === "propose" ? "Finance.Configuration.Manage" : "Finance.Management.Post")
      if (["approve", "activate"].includes(action) && !uuid(input.id)) throw new HttpError(400, "Choose a cutover plan.")
      return json(request, checked(await admin.rpc("multideck_finance_charge_mapping_cutover", {
        p_actor: current.User_ID, p_entity: entity, p_action: action, p_input: input,
      })))
    }
    if (parts[0] === "charge-catalogue" && request.method === "POST") {
      await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      return json(request, checked(await admin.rpc("multideck_manage_charge_catalogue", {
        p_actor: current.User_ID, p_entity: entity, p_input: input,
      })))
    }
    if (parts[0] === "nominal-structure" && (request.method === "GET" || request.method === "POST")) {
      const action = request.method === "GET" ? "read" : input.action
      if (!["read", "create_group", "map_charge"].includes(action)) throw new HttpError(400, "Choose a nominal structure action.")
      if (request.method === "POST") await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      const structure = checked(await admin.rpc("multideck_finance_nominal_structure", {
        p_actor: current.User_ID, p_entity: entity, p_action: action, p_input: input,
      }))
      if (action !== "read") return json(request, structure)
      const chargeCodes: any[] = []
      for (let offset = 0; ; offset += 500) {
        const page = checked(await admin.from("RATE_ChargeCodes").select("RATECharge_ID,RATECharge_Code,RATECharge_Name,RATECharge_Description,RATECharge_CategoryCode,RATECharge_DefaultApplicabilityCode,RATECharge_IsActive,RATECharge_ScopeConfigured,RATECharge_Version")
          .order("RATECharge_Code").order("RATECharge_ID").range(offset, offset + 499))
        chargeCodes.push(...page)
        if (page.length < 500) break
      }
      const chargeIds = chargeCodes.map(row => row.RATECharge_ID)
      const applicability: any[] = []
      // One charge has at most 40 combinations; keep each PostgREST page below 1,000 rows.
      for (let offset = 0; offset < chargeIds.length; offset += 20) {
        const ids = chargeIds.slice(offset, offset + 20)
        if (!ids.length) break
        const rows = checked(await admin.from("RATE_ChargeApplicability").select("charge_id,record_kind,direction,mode").in("charge_id", ids))
        applicability.push(...rows)
      }
      return json(request, { ...structure, chargeCodes, applicability })
    }
    if (parts[0] === "charge-nominals" && request.method === "GET") {
      if (!uuid(input.chargeId)) throw new HttpError(400, "Choose a charge code.")
      return json(request, checked(await admin.rpc("multideck_finance_resolve_charge_nominals", {
        p_actor: current.User_ID, p_entity: entity, p_charge: input.chargeId,
      })))
    }
    if (request.method === "GET" && parts[0] === "transaction") {
      if (!uuid(input.id)) throw new HttpError(400, "Choose a transaction.")
      const batch = checked(await admin.from("FIN_PostingBatches").select("*").eq("FINPostBatch_ID", input.id).eq("FINPostBatch_LegalEntityID", entity).eq("FINPostBatch_StatusCode", "posted").maybeSingle())
      if (!batch) throw new HttpError(404, "Transaction not found.")
      const lines: any[] = []
      for (let offset = 0; ; offset += 500) {
        const page = checked(await admin.from("FIN_PostingLines").select("FINPostLine_ID,FINPostLine_LineNo,FINPostLine_NominalAccountID,FINPostLine_Description,FINPostLine_DebitAmount,FINPostLine_CreditAmount").eq("FINPostLine_BatchID", input.id).order("FINPostLine_LineNo").order("FINPostLine_ID").range(offset, offset + 499))
        lines.push(...page)
        if (page.length < 500) break
      }
      const accounts = checked(await admin.from("FIN_NominalAccounts").select("FINNom_ID,FINNom_Code,FINNom_Name").eq("FINNom_LegalEntityID", entity))
      const names = new Map(accounts.map((account: any) => [account.FINNom_ID, `${account.FINNom_Code} · ${account.FINNom_Name}`]))
      return json(request, { number: batch.FINPostBatch_Number, source: batch.FINPostBatch_SourceTable, postedAt: batch.FINPostBatch_PostedAt, currency: batch.FINPostBatch_CurrencyCodeSnapshot,
        lines: lines.map((line: any) => ({ id: line.FINPostLine_ID, account: names.get(line.FINPostLine_NominalAccountID) || "Account unavailable", description: line.FINPostLine_Description, debit: line.FINPostLine_DebitAmount, credit: line.FINPostLine_CreditAmount })) })
    }
    if (request.method === "GET" && parts[0] === "workspace") {
      if (![input.from, input.to].every(value => typeof value === "string" && /^\d{4}(0[1-9]|1[0-2])$/.test(value)) || input.from > input.to ||
        ![input.offset || 0, input.journalOffset || 0].every(value => Number.isSafeInteger(Number(value)) && Number(value) >= 0) || (input.accountId && !uuid(input.accountId))) throw new HttpError(400, "Choose valid periods, an account and a page.")
      const [accounts, journals, enquiry] = await Promise.all([
        admin.from("FIN_NominalAccounts").select("FINNom_ID,FINNom_Code,FINNom_Name,FINNom_IsControlAccount,FINNom_AllowManualPosting,FINNom_IsActive").eq("FINNom_LegalEntityID", entity).order("FINNom_Code"),
        admin.from("FIN_Journals").select("*").eq("legal_entity_id", entity).order("number", { ascending: false }).range(Number(input.journalOffset || 0), Number(input.journalOffset || 0) + 99),
        admin.rpc("multideck_finance_gl_enquiry", { p_actor: current.User_ID, p_entity: entity, p_from: input.from, p_to: input.to, p_account: input.accountId || null, p_offset: Number(input.offset || 0) }),
      ])
      return json(request, { accounts: checked(accounts), journals: checked(journals).map(publicJournal), enquiry: checked(enquiry) })
    }
    if (request.method === "POST" && parts[0] === "journals") {
      const action = parts[1]
      if (!["save", "post", "retry", "reverse"].includes(action)) throw new HttpError(404, "Journal action not found.")
      await requirePermission(admin, current.User_ID, ["save", "reverse"].includes(action) ? "Finance.Management.Prepare" : "Finance.Management.Post")
      if (!uuid(input.id)) throw new HttpError(400, "A valid journal identity is required.")
      if (action === "reverse") return json(request, publicJournal(checked(await admin.rpc("multideck_finance_prepare_journal_reversal", {
        p_actor: current.User_ID, p_entity: entity, p_source: input.id, p_reason: input.reason,
      }))))
      if (action === "retry") return json(request, await attemptDelivery(admin, current.User_ID, entity, input.id))
      const journal = checked(await admin.rpc("multideck_finance_journal", { p_actor: current.User_ID, p_entity: entity, p_action: action, p_input: input }))
      if (action === "post" && journal.mirror_status !== "not_required") {
        try { return json(request, await attemptDelivery(admin, current.User_ID, entity, input.id)) }
        catch (error) { return json(request, { ...publicJournal(journal), deliveryNotice: error instanceof Error ? error.message : "Journal posted; accounts system delivery needs attention." }) }
      }
      return json(request, publicJournal(journal))
    }
    throw new HttpError(404, "General ledger route not found.")
  } catch (error) { return failure(request, error) }
})
