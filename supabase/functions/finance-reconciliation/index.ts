import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission, routeParts } from "../_shared/backend.ts"
import { parseBankStatementCsv } from "../_shared/bank-statement-csv.mts"
import { runFinancePeriodComparison } from "../_shared/finance-period-service.mts"
import { deliverFinanceOpeningMirror } from "../_shared/finance-opening-mirror.mts"

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
function checked(result: any) {
  if (result.error) throw new HttpError(result.error.code === "42501" ? 403 : result.error.code === "P0002" ? 404 : ["22023", "22P02", "23502", "23505", "23514", "22007", "22008"].includes(result.error.code) ? 400 : 500, result.error.message)
  return result.data
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const actor = await currentInternalUser(admin, user)
    await requirePermission(admin, actor.User_ID, "Finance.Management.View")
    const parts = routeParts(request, "finance-reconciliation")
    const input: any = request.method === "POST" ? await body(request) : Object.fromEntries(new URL(request.url).searchParams)
    const entity = input.legalEntityId
    if (!uuid(entity)) throw new HttpError(400, "Choose a legal entity.")
    const owned = checked(await admin.from("cmp_LegalEntities").select("LegalEntity_ID").eq("LegalEntity_ID", entity).eq("Company_ID", actor.Company_ID).eq("LegalEntity_IsActive", true).maybeSingle())
    if (!owned) throw new HttpError(404, "Legal entity not found in this workspace.")
    if (request.method === "GET" && parts[0] === "bank" && parts[1] === "setup") {
      const [banks, periods] = await Promise.all([
        admin.from("FIN_BankAccounts").select("FINBank_ID,FINBank_Code,FINBank_Name,FINBank_CurrencyCode,FINBank_NominalAccountID,FINBank_IsActive").eq("FINBank_LegalEntityID", entity).eq("FINBank_IsActive", true).order("FINBank_Code"),
        admin.from("FIN_Periods").select("FINPeriod_ID,FINPeriod_Code,FINPeriod_StartDate,FINPeriod_EndDate,FINPeriod_StatusCode,FINPeriod_BaseCurrencyCode").eq("FINPeriod_LegalEntityID", entity).order("FINPeriod_StartDate", { ascending: false }).limit(36),
      ])
      return json(request, { banks: checked(banks), periods: checked(periods) })
    }
    if (parts[0] === "bank" && request.method === "POST") {
      if (!uuid(input.bankId)) throw new HttpError(400, "Choose a bank account.")
      if (parts[1] === "import") {
        await requirePermission(admin, actor.User_ID, "Finance.Banks.Manage")
        if (typeof input.fileName !== "string" || typeof input.csv !== "string" || typeof input.openingBalance !== "string" || typeof input.closingBalance !== "string" || typeof input.dateFrom !== "string" || typeof input.dateTo !== "string") throw new HttpError(400, "Provide a statement CSV, its coverage dates and opening and closing balances.")
        let statement
        try { statement = parseBankStatementCsv(input.csv, input.openingBalance, input.closingBalance, input.dateFrom, input.dateTo) }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "The statement CSV is invalid.") }
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.csv)))].map(value => value.toString(16).padStart(2, "0")).join("")
        return json(request, checked(await admin.rpc("multideck_bank_statement_import", { p_actor: actor.User_ID, p_entity: entity, p_bank: input.bankId, p_file_name: input.fileName, p_file_hash: hash, p_input: statement })))
      }
      if (parts[1] === "match" || parts[1] === "unmatch") {
        await requirePermission(admin, actor.User_ID, "Finance.Banks.Manage")
        if (!uuid(input.lineId) || (parts[1] === "match" && !uuid(input.cashId))) throw new HttpError(400, "Choose a statement line and posted cash transaction.")
        return json(request, checked(await admin.rpc(parts[1] === "match" ? "multideck_bank_statement_match" : "multideck_bank_statement_unmatch", {
          p_actor: actor.User_ID, p_entity: entity, p_line: input.lineId,
          ...(parts[1] === "match" ? { p_cash: input.cashId } : {}), p_reason: input.reason,
        })))
      }
      if (parts[1] === "verify") {
        await requirePermission(admin, actor.User_ID, "Finance.Banks.Manage")
        if (!uuid(input.periodId)) throw new HttpError(400, "Choose an accounting period.")
        return json(request, checked(await admin.rpc("multideck_bank_statement_verify", { p_actor: actor.User_ID, p_entity: entity, p_period: input.periodId, p_bank: input.bankId, p_reason: input.reason })))
      }
    }
    if (parts[0] === "bank" && request.method === "GET" && parts[1] === "control") {
      if (!uuid(input.bankId) || !uuid(input.periodId)) throw new HttpError(400, "Choose a bank and accounting period.")
      const control = checked(await admin.rpc("multideck_bank_statement_control", { p_actor: actor.User_ID, p_entity: entity, p_period: input.periodId, p_bank: input.bankId }))
      const statementId = control?.statementId
      if (!uuid(statementId)) return json(request, { control, lines: [], cash: [] })
      const lines = checked(await admin.from("FIN_StatementLines").select("FINStmtLine_ID,FINStmtLine_LineNo,FINStmtLine_TransactionDate,FINStmtLine_Reference,FINStmtLine_Description,FINStmtLine_Amount,FINStmtLine_BalanceAfter,FINStmtLine_MatchStatusCode").eq("FINStmtLine_ImportID", statementId).order("FINStmtLine_LineNo").limit(1000))
      const lineIds = lines.map((line: any) => line.FINStmtLine_ID)
      const matches = lineIds.length ? checked(await admin.from("FIN_BankMatches").select("FINBankMatch_StatementLineID,FINBankMatch_CashID,FINBankMatch_Notes").in("FINBankMatch_StatementLineID", lineIds)) : []
      const period = checked(await admin.from("FIN_Periods").select("FINPeriod_StartDate,FINPeriod_EndDate").eq("FINPeriod_ID", input.periodId).eq("FINPeriod_LegalEntityID", entity).single())
      const cash: any[] = []
      for (let offset = 0; ; offset += 500) {
        const page = checked(await admin.from("FIN_CashTransactions").select("FINCash_ID,FINCash_Number,FINCash_TypeCode,FINCash_TransactionDate,FINCash_AccountingDate,FINCash_Amount,FINCash_Reference,FINCash_CurrencyCodeSnapshot")
          .eq("FINCash_LegalEntityID", entity).eq("FINCash_BankAccountID", input.bankId).eq("FINCash_NativePostingStatusCode", "posted")
          .gte("FINCash_AccountingDate", period.FINPeriod_StartDate).lte("FINCash_AccountingDate", period.FINPeriod_EndDate)
          .order("FINCash_ID").range(offset, offset + 499))
        cash.push(...page)
        if (page.length < 500) break
        if (cash.length > 10000) throw new HttpError(409, "The bank cash register exceeds this review limit. Narrow the period before reconciling.")
      }
      return json(request, { control, lines, matches, cash })
    }
    if (parts[0] === "provider" && request.method === "GET" && parts[1] === "setup") {
      const [connections, periods] = await Promise.all([
        admin.from("ACCI_Connections").select("ACCIC_ID,ACCIC_Name,ACCIC_ProviderCode,ACCIC_ExternalTenantName,ACCIC_ExternalBaseCurrencyCode,ACCIC_StatusCode")
          .eq("ACCIC_LegalEntityID", entity).eq("ACCIC_StatusCode", "active").in("ACCIC_ProviderCode", ["erpnext", "sage_50"]).order("ACCIC_Name"),
        admin.from("FIN_Periods").select("FINPeriod_ID,FINPeriod_Code,FINPeriod_StartDate,FINPeriod_EndDate,FINPeriod_StatusCode,FINPeriod_BaseCurrencyCode")
          .eq("FINPeriod_LegalEntityID", entity).order("FINPeriod_StartDate", { ascending: false }).limit(36),
      ])
      return json(request, { connections: checked(connections), periods: checked(periods) })
    }
    if (parts[0] === "provider" && request.method === "POST" && parts[1] === "run") {
      await requirePermission(admin, actor.User_ID, "Finance.Integration.Manage")
      if (!uuid(input.periodId) || !uuid(input.connectionId)) throw new HttpError(400, "Choose an accounting period and connection.")
      const connection = checked(await admin.from("ACCI_Connections").select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_StatusCode,ACCIC_ExternalTenantName,ACCIC_ExternalBaseCurrencyCode,ACCIC_SettingsJSON")
        .eq("ACCIC_ID", input.connectionId).eq("ACCIC_LegalEntityID", entity).eq("ACCIC_StatusCode", "active").maybeSingle())
      if (!connection) throw new HttpError(404, "Accounting connection not found in this legal entity.")
      return json(request, await runFinancePeriodComparison(admin, actor.User_ID, entity, input.periodId, connection))
    }
    if (parts[0] === "provider" && request.method === "GET" && parts[1] === "status") {
      if (!uuid(input.periodId) || !uuid(input.connectionId)) throw new HttpError(400, "Choose an accounting period and connection.")
      const status = checked(await admin.rpc("multideck_finance_provider_period_status", { p_actor: actor.User_ID, p_entity: entity, p_period: input.periodId, p_connection: input.connectionId }))
      const runId = status?.runId
      if (!uuid(runId)) return json(request, { status, differences: [] })
      const offset = Number(input.offset || 0)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5000) throw new HttpError(400, "Choose a valid difference page.")
      const differences = checked(await admin.from("ACCI_PeriodReconciliationDifferences").select("id,domain,identity,kind,local_snapshot,provider_snapshot,common_snapshot,review_status,review_action,review_reason,reviewed_at")
        .eq("run_id", runId).order("domain").order("identity").range(offset, offset + 99))
      return json(request, { status, differences, offset })
    }
    if (parts[0] === "provider" && request.method === "POST" && parts[1] === "review") {
      await requirePermission(admin, actor.User_ID, "Finance.Management.Approve")
      if (!uuid(input.differenceId) || !["prepare_draft", "requires_adjustment", "expected_difference"].includes(input.action)) throw new HttpError(400, "Choose a difference and review action.")
      return json(request, checked(await admin.rpc("multideck_finance_period_review_difference", { p_actor: actor.User_ID, p_entity: entity, p_difference: input.differenceId, p_action: input.action, p_reason: input.reason })))
    }
    if (parts[0] === "opening" && request.method === "POST" && parts[1] === "deliver") {
      await requirePermission(admin, actor.User_ID, "Finance.Integration.Manage")
      if (!uuid(input.packageId)) throw new HttpError(400, "Choose a posted opening package.")
      return json(request, await deliverFinanceOpeningMirror(admin, actor.User_ID, entity, input.packageId))
    }
    if (parts[0] === "opening" && request.method === "GET" && parts[1] === "status") {
      if (!uuid(input.packageId)) throw new HttpError(400, "Choose a posted opening package.")
      const result = checked(await admin.from("FIN_OpeningMirrorDeliveries").select("package_id,connection_id,status,external_id,readback_hash,last_error,attempt_count,queued_at,matched_at")
        .eq("package_id", input.packageId).eq("legal_entity_id", entity).maybeSingle())
      return json(request, result ?? { package_id: input.packageId, status: "not_queued" })
    }
    throw new HttpError(404, "Finance reconciliation route not found.")
  } catch (error) { return failure(request, error) }
})
