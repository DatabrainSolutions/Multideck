import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission, routeParts } from "../_shared/backend.ts"
import { ageOpenItems, proposePurchaseOrderMatches, type OpenItem } from "../_shared/finance-daily-model.mts"

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
const clean = (value: unknown, length = 500) => typeof value === "string" ? value.trim().slice(0, length) : ""
const money = (value: unknown) => { const result = Number(value); return Number.isFinite(result) ? result : NaN }
const isoDate = (value: unknown) => {
  const result = clean(value, 10)
  const date = new Date(`${result}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === result ? result : null
}
const fail = (error: any, fallback: string): never => {
  const status = error?.code === "42501" ? 403 : error?.code === "P0002" ? 404 : ["22023", "22P02", "23514", "23505"].includes(error?.code) ? 409 : 500
  throw new HttpError(status, clean(error?.message, 500) || fallback)
}

async function entity(admin: any, current: any, id: string) {
  if (!uuid(id)) throw new HttpError(400, "Choose a legal entity.")
  const { data, error } = await admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot,Company_ID").eq("LegalEntity_ID", id).eq("Company_ID", current.Company_ID).eq("LegalEntity_IsActive", true).maybeSingle()
  if (error) fail(error, "Legal entity could not be loaded.")
  if (!data) throw new HttpError(404, "That legal entity is outside this workspace.")
  return data
}

async function rows(admin: any, table: string, select: string, apply: (query: any) => any, limit = 5000) {
  const pageSize = 500
  const result: any[] = []
  for (let offset = 0; offset < limit; offset += pageSize) {
    const page = await apply(admin.from(table).select(select).range(offset, offset + pageSize - 1))
    if (page.error) fail(page.error, `${table} could not be read.`)
    result.push(...(page.data ?? []))
    if ((page.data ?? []).length < pageSize) return result
  }
  throw new HttpError(409, "This Finance worklist is larger than the safe read limit. Narrow the period or contact support.")
}

async function documents(admin: any, entityId: string, ledger: "receivables" | "payables", openOnly = false) {
  const types = ledger === "receivables" ? ["sl_invoice", "credit_note"] : ["pl_invoice", "debit_note"]
  return rows(admin, "FIN_Documents", "FINDoc_ID,FINDoc_Number,FINDoc_TypeCode,FINDoc_StatusCode,FINDoc_LegalEntityID,FINDoc_PartyOrgID,FINDoc_DocumentDate,FINDoc_DueDate,FINDoc_CurrencyCodeSnapshot,FINDoc_NetAmount,FINDoc_GrossAmount,FINDoc_OutstandingAmount,FINDoc_SourceJobID,FINDoc_UpdatedAt", (query) => {
    let result = query.eq("FINDoc_LegalEntityID", entityId).in("FINDoc_TypeCode", types).in("FINDoc_StatusCode", ["approved", "submitted"])
    if (openOnly) result = result.gt("FINDoc_OutstandingAmount", 0)
    return result.order("FINDoc_DueDate", { ascending: true, nullsFirst: false }).order("FINDoc_ID")
  })
}

async function names(admin: any, ids: string[]) {
  const values = [...new Set(ids.filter(uuid))]
  if (!values.length) return new Map<string, string>()
  const found = await rows(admin, "Org_Master", "Org_id,Org_Name", (query) => query.in("Org_id", values).order("Org_id"))
  return new Map<string, string>(found.map((row) => [row.Org_id, row.Org_Name]))
}

async function worklist(admin: any, current: any, entityId: string, ledger: "receivables" | "payables") {
  await requirePermission(admin, current.User_ID, ledger === "receivables" ? "Finance.Receivables.View" : "Finance.Payables.View")
  await entity(admin, current, entityId)
  const found = await documents(admin, entityId, ledger, true)
  const partyNames = await names(admin, found.map((row) => row.FINDoc_PartyOrgID))
  const today = new Date().toISOString().slice(0, 10)
  const open: OpenItem[] = found.filter((row) => row.FINDoc_TypeCode === (ledger === "receivables" ? "sl_invoice" : "pl_invoice")).map((row) => ({
    id: row.FINDoc_ID, number: row.FINDoc_Number ?? "Unnumbered", ledger,
    partyId: row.FINDoc_PartyOrgID, partyName: partyNames.get(row.FINDoc_PartyOrgID) ?? "Unknown organisation",
    dueDate: row.FINDoc_DueDate, currency: row.FINDoc_CurrencyCodeSnapshot, outstanding: money(row.FINDoc_OutstandingAmount),
    status: row.FINDoc_StatusCode, updatedAt: row.FINDoc_UpdatedAt,
  }))
  if (open.some((item) => !Number.isFinite(item.outstanding))) throw new HttpError(409, "An open amount is invalid. Correct the ledger before using this worklist.")
  return { entityId, ledger, generatedAt: new Date().toISOString(), asOf: today, items: ageOpenItems(open, today) }
}

async function purchaseOrders(admin: any, current: any, entityId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.View")
  await entity(admin, current, entityId)
  const [orders, matches] = await Promise.all([
    rows(admin, "FIN_SupplierPurchaseOrders", "*", (query) => query.eq("FINPO_LegalEntityID", entityId).order("FINPO_CreatedAt", { ascending: false }).order("FINPO_ID")),
    rows(admin, "FIN_SupplierInvoiceMatches", "FINPOMatch_PurchaseOrderID,FINPOMatch_DocumentID,FINPOMatch_NetAmount,FINPOMatch_ApprovedAt", (query) => query.order("FINPOMatch_ApprovedAt", { ascending: false })),
  ])
  const orderIds = new Set(orders.map((order) => order.FINPO_ID))
  const matched = new Map<string, number>()
  for (const match of matches) if (orderIds.has(match.FINPOMatch_PurchaseOrderID)) matched.set(match.FINPOMatch_PurchaseOrderID, (matched.get(match.FINPOMatch_PurchaseOrderID) ?? 0) + money(match.FINPOMatch_NetAmount))
  const suppliers = await names(admin, orders.map((order) => order.FINPO_SupplierOrgID))
  return orders.map((order) => ({ ...order, supplierName: suppliers.get(order.FINPO_SupplierOrgID) ?? "Unknown supplier", matchedNet: matched.get(order.FINPO_ID) ?? 0, evidence: { sourceTable: "FIN_SupplierPurchaseOrders", sourceId: order.FINPO_ID, observedAt: order.FINPO_CreatedAt } }))
}

async function scopedDocument(admin: any, current: any, id: string) {
  if (!uuid(id)) throw new HttpError(400, "Choose a supplier invoice.")
  const { data, error } = await admin.from("FIN_Documents").select("FINDoc_ID,FINDoc_Number,FINDoc_TypeCode,FINDoc_StatusCode,FINDoc_LegalEntityID,FINDoc_PartyOrgID,FINDoc_CurrencyCodeSnapshot,FINDoc_NetAmount,FINDoc_OutstandingAmount,FINDoc_SourceJobID,FINDoc_UpdatedAt").eq("FINDoc_ID", id).maybeSingle()
  if (error) fail(error, "Supplier invoice could not be read.")
  if (!data) throw new HttpError(404, "Supplier invoice not found.")
  await entity(admin, current, data.FINDoc_LegalEntityID)
  return data
}

async function matchSuggestions(admin: any, current: any, documentId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.View")
  const document = await scopedDocument(admin, current, documentId)
  if (document.FINDoc_TypeCode !== "pl_invoice") throw new HttpError(400, "Choose a supplier invoice for PO matching.")
  const orders = await purchaseOrders(admin, current, document.FINDoc_LegalEntityID)
  const candidates = proposePurchaseOrderMatches({ supplierId: document.FINDoc_PartyOrgID, currency: document.FINDoc_CurrencyCodeSnapshot, netAmount: money(document.FINDoc_NetAmount), jobId: document.FINDoc_SourceJobID }, orders.map((order) => ({
    id: order.FINPO_ID, number: order.FINPO_Number, supplierId: order.FINPO_SupplierOrgID, currency: order.FINPO_CurrencyCode,
    netAmount: money(order.FINPO_NetAmount), matchedNet: order.matchedNet, jobId: order.FINPO_JobID, status: order.FINPO_StatusCode,
  })))
  const { data: existing, error } = await admin.from("FIN_SupplierInvoiceMatches").select("FINPOMatch_ID,FINPOMatch_PurchaseOrderID,FINPOMatch_EvidenceJSON,FINPOMatch_ApprovedAt").eq("FINPOMatch_DocumentID", documentId).maybeSingle()
  if (error) fail(error, "Existing PO match could not be checked.")
  return { document, candidates, existing, generatedAt: new Date().toISOString(), ruleVersion: "po-match-v1" }
}

async function createPurchaseOrder(admin: any, current: any, input: any) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.Draft")
  const selectedEntity = await entity(admin, current, input.legalEntityId)
  if (!uuid(input.supplierOrgId) || !clean(input.number, 100) || !clean(input.description, 1000) || !/^[A-Z]{3}$/.test(clean(input.currencyCode, 3)) || !(money(input.netAmount) > 0)) throw new HttpError(400, "Complete the supplier, PO number, description, currency and positive net amount.")
  const { data: supplier, error: supplierError } = await admin.from("Org_Master").select("Org_id").eq("Org_id", input.supplierOrgId).maybeSingle()
  if (supplierError) fail(supplierError, "Supplier could not be checked.")
  if (!supplier) throw new HttpError(404, "Supplier not found.")
  if (input.jobId) {
    if (!uuid(input.jobId)) throw new HttpError(400, "Choose a valid job.")
    const { data: job, error } = await admin.from("Job_Header").select("Job_ID,Job_LegalEntityID,Job_IsDeleted").eq("Job_ID", input.jobId).maybeSingle()
    if (error) fail(error, "Job could not be checked.")
    if (!job || job.Job_IsDeleted || (job.Job_LegalEntityID && job.Job_LegalEntityID !== selectedEntity.LegalEntity_ID)) throw new HttpError(404, "That job is outside this legal entity.")
  }
  const { data, error } = await admin.from("FIN_SupplierPurchaseOrders").insert({ FINPO_LegalEntityID: selectedEntity.LegalEntity_ID, FINPO_SupplierOrgID: input.supplierOrgId, FINPO_JobID: input.jobId || null, FINPO_Number: clean(input.number, 100), FINPO_CurrencyCode: input.currencyCode, FINPO_NetAmount: money(input.netAmount), FINPO_Description: clean(input.description, 1000), FINPO_SourceEvidenceJSON: { source: "operator_review", reference: clean(input.sourceReference, 200) || null }, FINPO_CreatedBy: current.User_ID }).select("*").single()
  if (error) fail(error, "Supplier PO could not be saved.")
  return data
}

async function approvePurchaseOrder(admin: any, current: any, id: string, reason: string) {
  await requirePermission(admin, current.User_ID, "Finance.ReviewAndPost")
  if (!uuid(id) || !reason) throw new HttpError(400, "Choose a PO and enter a review reason.")
  const { data: order, error } = await admin.from("FIN_SupplierPurchaseOrders").select("*").eq("FINPO_ID", id).maybeSingle()
  if (error) fail(error, "Supplier PO could not be loaded.")
  if (!order) throw new HttpError(404, "Supplier PO not found.")
  await entity(admin, current, order.FINPO_LegalEntityID)
  if (order.FINPO_StatusCode !== "draft") throw new HttpError(409, "Only draft supplier POs can be approved.")
  if (order.FINPO_CreatedBy === current.User_ID) throw new HttpError(403, "A second finance reviewer must approve this PO.")
  const result = await admin.from("FIN_SupplierPurchaseOrders").update({ FINPO_StatusCode: "approved", FINPO_ReviewedAt: new Date().toISOString(), FINPO_ReviewedBy: current.User_ID, FINPO_ReviewReason: reason }).eq("FINPO_ID", id).eq("FINPO_StatusCode", "draft").select("*").single()
  if (result.error) fail(result.error, "Supplier PO could not be approved.")
  return result.data
}

async function approveMatch(admin: any, current: any, input: any) {
  await requirePermission(admin, current.User_ID, "Finance.ReviewAndPost")
  const document = await scopedDocument(admin, current, input.documentId)
  if (!uuid(input.purchaseOrderId) || !clean(input.reason) || document.FINDoc_TypeCode !== "pl_invoice" || !["draft", "awaiting_approval"].includes(document.FINDoc_StatusCode)) throw new HttpError(409, "Review a draft supplier invoice, approved PO and reason before matching.")
  const { data: po, error } = await admin.from("FIN_SupplierPurchaseOrders").select("*").eq("FINPO_ID", input.purchaseOrderId).maybeSingle()
  if (error) fail(error, "Supplier PO could not be loaded.")
  if (!po || po.FINPO_StatusCode !== "approved" || po.FINPO_LegalEntityID !== document.FINDoc_LegalEntityID || po.FINPO_SupplierOrgID !== document.FINDoc_PartyOrgID || po.FINPO_CurrencyCode !== document.FINDoc_CurrencyCodeSnapshot || (po.FINPO_JobID && document.FINDoc_SourceJobID && po.FINPO_JobID !== document.FINDoc_SourceJobID)) throw new HttpError(409, "The approved PO does not match this invoice's entity, supplier, currency or job.")
  const net = money(document.FINDoc_NetAmount)
  if (!(net > 0)) throw new HttpError(409, "Only a positive supplier invoice can be matched.")
  const { data, error: insertError } = await admin.from("FIN_SupplierInvoiceMatches").insert({ FINPOMatch_PurchaseOrderID: po.FINPO_ID, FINPOMatch_DocumentID: document.FINDoc_ID, FINPOMatch_NetAmount: net, FINPOMatch_EvidenceJSON: { ruleVersion: "po-match-v1", document: { table: "FIN_Documents", id: document.FINDoc_ID, updatedAt: document.FINDoc_UpdatedAt }, purchaseOrder: { table: "FIN_SupplierPurchaseOrders", id: po.FINPO_ID }, proposal: input.proposalEvidence && typeof input.proposalEvidence === "object" ? input.proposalEvidence : null }, FINPOMatch_ReviewerNote: clean(input.reason), FINPOMatch_ApprovedBy: current.User_ID }).select("*").single()
  if (insertError) fail(insertError, "Supplier invoice match could not be saved.")
  return data
}

async function collectionActions(admin: any, current: any, entityId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Receivables.View")
  await entity(admin, current, entityId)
  return rows(admin, "FIN_CollectionActions", "*", (query) => query.eq("FINCollect_LegalEntityID", entityId).order("FINCollect_CreatedAt", { ascending: false }).order("FINCollect_ID", { ascending: false }))
}

async function createCollectionAction(admin: any, current: any, input: any) {
  await requirePermission(admin, current.User_ID, "Finance.Receivables.Draft")
  const document = await scopedDocument(admin, current, input.documentId)
  const action = clean(input.actionCode, 24)
  const note = clean(input.note, 2000)
  const followUp = input.followUpDate ? isoDate(input.followUpDate) : null
  if (document.FINDoc_TypeCode !== "sl_invoice" || !["approved", "submitted"].includes(document.FINDoc_StatusCode) || money(document.FINDoc_OutstandingAmount) <= 0) throw new HttpError(409, "Choose an open customer invoice.")
  if (!["call_note", "promise_to_pay", "query", "hold", "resolved"].includes(action) || !note || (input.followUpDate && !followUp)) throw new HttpError(400, "Choose an action, explain it and check the follow-up date.")
  const { data, error } = await admin.from("FIN_CollectionActions").insert({ FINCollect_LegalEntityID: document.FINDoc_LegalEntityID, FINCollect_CustomerOrgID: document.FINDoc_PartyOrgID, FINCollect_DocumentID: document.FINDoc_ID, FINCollect_ActionCode: action, FINCollect_Note: note, FINCollect_FollowUpDate: followUp, FINCollect_EvidenceJSON: { sourceTable: "FIN_Documents", sourceId: document.FINDoc_ID, observedAt: document.FINDoc_UpdatedAt, outstanding: document.FINDoc_OutstandingAmount }, FINCollect_CreatedBy: current.User_ID }).select("*").single()
  if (error) fail(error, "Collection action could not be recorded.")
  return data
}

async function paymentRuns(admin: any, current: any, entityId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.View")
  await entity(admin, current, entityId)
  const runs = await rows(admin, "FIN_PaymentRuns", "FINPayRun_ID,FINPayRun_Number,FINPayRun_StatusCode,FINPayRun_BankAccountID,FINPayRun_PaymentDate,FINPayRun_CurrencyCodeSnapshot,FINPayRun_TotalAmount,FINPayRun_CreatedAt,FINPayRun_CreatedBy,FINPayRun_ReviewedAt,FINPayRun_ReviewedBy,FINPayRun_Reason", (query) => query.eq("FINPayRun_LegalEntityID", entityId).order("FINPayRun_CreatedAt", { ascending: false }).order("FINPayRun_ID", { ascending: false }))
  const ids = runs.map((run) => run.FINPayRun_ID)
  const items = ids.length ? await rows(admin, "FIN_PaymentRunItems", "FINPayRunItem_RunID,FINPayRunItem_DocumentID,FINPayRunItem_SupplierOrgID,FINPayRunItem_StatusCode,FINPayRunItem_Amount,FINPayRunItem_CashID", (query) => query.in("FINPayRunItem_RunID", ids).order("FINPayRunItem_DocumentID")) : []
  return runs.map((run) => ({ ...run, items: items.filter((item) => item.FINPayRunItem_RunID === run.FINPayRun_ID) }))
}

async function statement(admin: any, current: any, entityId: string, customerId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Receivables.View")
  const selectedEntity = await entity(admin, current, entityId)
  if (!uuid(customerId)) throw new HttpError(400, "Choose a customer.")
  const all = await documents(admin, entityId, "receivables")
  const found = all.filter((document) => document.FINDoc_PartyOrgID === customerId && money(document.FINDoc_OutstandingAmount) !== 0)
  const partyNames = await names(admin, [customerId])
  if (!partyNames.has(customerId)) throw new HttpError(404, "Customer not found.")
  const lines = found.map((document) => ({
    id: document.FINDoc_ID, number: document.FINDoc_Number, type: document.FINDoc_TypeCode,
    documentDate: document.FINDoc_DocumentDate, dueDate: document.FINDoc_DueDate,
    currency: document.FINDoc_CurrencyCodeSnapshot,
    originalAmount: (document.FINDoc_TypeCode === "credit_note" ? -1 : 1) * money(document.FINDoc_GrossAmount),
    outstanding: (document.FINDoc_TypeCode === "credit_note" ? -1 : 1) * money(document.FINDoc_OutstandingAmount),
    evidence: { sourceTable: "FIN_Documents", sourceId: document.FINDoc_ID, observedAt: document.FINDoc_UpdatedAt },
  })).sort((a, b) => a.documentDate.localeCompare(b.documentDate) || a.id.localeCompare(b.id))
  const totals: Record<string, number> = {}
  for (const line of lines) totals[line.currency] = (totals[line.currency] ?? 0) + line.outstanding
  return { title: "Open-item customer statement", generatedAt: new Date().toISOString(), legalEntity: selectedEntity.LegalEntity_Name, customerId, customerName: partyNames.get(customerId), lines, totals, basis: "Current outstanding balances; this is not a historical transaction statement." }
}

async function remittance(admin: any, current: any, id: string) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.View")
  if (!uuid(id)) throw new HttpError(400, "Choose a payment run.")
  const { data: run, error } = await admin.from("FIN_PaymentRuns").select("FINPayRun_ID,FINPayRun_Number,FINPayRun_StatusCode,FINPayRun_LegalEntityID,FINPayRun_PaymentDate,FINPayRun_CurrencyCodeSnapshot,FINPayRun_TotalAmount,FINPayRun_ApprovedAt").eq("FINPayRun_ID", id).maybeSingle()
  if (error) fail(error, "Payment run could not be loaded.")
  if (!run) throw new HttpError(404, "Payment run not found.")
  await entity(admin, current, run.FINPayRun_LegalEntityID)
  if (run.FINPayRun_StatusCode !== "approved") throw new HttpError(409, "Approve the payment run before preparing remittance advice.")
  const items = await rows(admin, "FIN_PaymentRunItems", "FINPayRunItem_DocumentID,FINPayRunItem_SupplierOrgID,FINPayRunItem_CashID,FINPayRunItem_Amount", (query) => query.eq("FINPayRunItem_RunID", id).order("FINPayRunItem_DocumentID"))
  const cashIds = [...new Set(items.map((item) => item.FINPayRunItem_CashID))]
  const docs = items.length ? await rows(admin, "FIN_Documents", "FINDoc_ID,FINDoc_Number,FINDoc_DocumentDate", (query) => query.in("FINDoc_ID", items.map((item) => item.FINPayRunItem_DocumentID)).order("FINDoc_ID")) : []
  const cash = cashIds.length ? await rows(admin, "FIN_CashTransactions", "FINCash_ID,FINCash_Number,FINCash_StatusCode,FINCash_PostingStatusCode,FINCash_Reference", (query) => query.in("FINCash_ID", cashIds).order("FINCash_ID")) : []
  const suppliers = await names(admin, items.map((item) => item.FINPayRunItem_SupplierOrgID))
  const documentById = new Map(docs.map((document) => [document.FINDoc_ID, document]))
  const cashById = new Map(cash.map((payment) => [payment.FINCash_ID, payment]))
  if (cash.some((payment) => payment.FINCash_StatusCode !== "approved")) throw new HttpError(409, "A payment in this run is no longer approved. Review the run before issuing remittance advice.")
  return { run, generatedAt: new Date().toISOString(), delivery: "draft_advice_only", lines: items.map((item) => ({ supplierId: item.FINPayRunItem_SupplierOrgID, supplierName: suppliers.get(item.FINPayRunItem_SupplierOrgID) ?? "Unknown supplier", documentId: item.FINPayRunItem_DocumentID, documentNumber: documentById.get(item.FINPayRunItem_DocumentID)?.FINDoc_Number ?? "Unnumbered", documentDate: documentById.get(item.FINPayRunItem_DocumentID)?.FINDoc_DocumentDate ?? null, cashId: item.FINPayRunItem_CashID, paymentNumber: cashById.get(item.FINPayRunItem_CashID)?.FINCash_Number ?? "Unnumbered", postingStatus: cashById.get(item.FINPayRunItem_CashID)?.FINCash_PostingStatusCode ?? "unknown", amount: money(item.FINPayRunItem_Amount), evidence: { sourceTable: "FIN_PaymentRunItems", sourceId: item.FINPayRunItem_DocumentID } })) }
}

async function preparePaymentRun(admin: any, current: any, input: any) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.Cash")
  if (!uuid(input.bankAccountId) || !Array.isArray(input.documentIds) || !isoDate(input.paymentDate) || !clean(input.reason) || !(money(input.exchangeRate) > 0)) throw new HttpError(400, "Choose invoices, a payment bank, date, exchange rate and reason.")
  const { data, error } = await admin.rpc("multideck_finance_prepare_payment_run", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_bank_id: input.bankAccountId, p_document_ids: input.documentIds, p_payment_date: input.paymentDate, p_exchange_rate: money(input.exchangeRate), p_reason: clean(input.reason) })
  if (error) fail(error, "Payment run could not be prepared.")
  return { runId: data, status: "awaiting_approval" }
}

async function reviewPaymentRun(admin: any, current: any, id: string, input: any) {
  await requirePermission(admin, current.User_ID, "Finance.ReviewAndPost")
  if (!uuid(id) || !["approved", "rejected"].includes(input.decision) || !clean(input.reason)) throw new HttpError(400, "Choose a decision and enter a review reason.")
  const { data, error } = await admin.rpc("multideck_finance_review_payment_run", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_run_id: id, p_decision: input.decision, p_reason: clean(input.reason) })
  if (error) fail(error, "Payment run could not be reviewed.")
  return data
}

async function profitability(admin: any, current: any, entityId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Payables.View")
  await requirePermission(admin, current.User_ID, "Finance.Receivables.View")
  await entity(admin, current, entityId)
  const { data: offices, error: officeError } = await admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", current.Company_ID)
  if (officeError) fail(officeError, "Company offices could not be read.")
  const officeIds = (offices ?? []).map((office: any) => office.Office_ID)
  if (!officeIds.length) return { jobs: [], generatedAt: new Date().toISOString() }
  const jobs = await rows(admin, "Job_Header", "Job_ID,Job_Number,Job_Period,Job_Status,Job_LegalEntityID,Job_OfficeID,Job_OrgOfficeID", (query) => query.or(`Job_OfficeID.in.(${officeIds.join(",")}),Job_OrgOfficeID.in.(${officeIds.join(",")})`).eq("Job_IsDeleted", false).order("Job_UpdatedAt", { ascending: false }).order("Job_ID"))
  const scoped = jobs.filter((job) => !job.Job_LegalEntityID || job.Job_LegalEntityID === entityId)
  const jobIds = scoped.map((job) => job.Job_ID)
  if (!jobIds.length) return { jobs: [], generatedAt: new Date().toISOString() }
  const lines = await rows(admin, "FIN_JobChargeProfitability", "*", (query) => query.in("FINChargeProfit_JobID", jobIds).order("FINChargeProfit_JobID").order("FINChargeProfit_LineNo"))
  const byJob = new Map<string, any[]>()
  for (const line of lines) byJob.set(line.FINChargeProfit_JobID, [...(byJob.get(line.FINChargeProfit_JobID) ?? []), line])
  return { generatedAt: new Date().toISOString(), jobs: scoped.map((job) => {
    const charges = byJob.get(job.Job_ID) ?? []
    const sum = (key: string) => charges.reduce((total, line) => total + money(line[key]), 0)
    return { id: job.Job_ID, reference: `${job.Job_Period}-${job.Job_Number}`, status: job.Job_Status, expectedRevenue: sum("FINChargeProfit_ExpectedRevenue"), expectedCost: sum("FINChargeProfit_ExpectedCost"), actualRevenue: sum("FINChargeProfit_ActualRevenue"), actualCost: sum("FINChargeProfit_ActualCost"), openWip: sum("FINChargeProfit_OpenWIP"), openAccrual: sum("FINChargeProfit_OpenAccrual"), recognisedRevenue: sum("FINChargeProfit_RecognisedRevenue"), recognisedCost: sum("FINChargeProfit_RecognisedCost"), grossProfit: sum("FINChargeProfit_GrossProfit"), charges: charges.map((line) => ({ ...line, evidence: { sourceTable: "FIN_JobChargeProfitability", sourceId: line.FINChargeProfit_JobCostingLineID } })) }
  }) }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "finance-operations")
    const params = new URL(request.url).searchParams
    if (request.method === "GET" && parts[0] === "entities") {
      await requirePermission(admin, current.User_ID, "Finance.Payables.View")
      const { data, error } = await admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot").eq("Company_ID", current.Company_ID).eq("LegalEntity_IsActive", true).order("LegalEntity_Name")
      if (error) fail(error, "Legal entities could not be loaded.")
      return json(request, { entities: data ?? [] })
    }
    if (request.method === "GET" && parts[0] === "worklist") {
      const ledger = params.get("ledger")
      if (ledger !== "receivables" && ledger !== "payables") throw new HttpError(400, "Choose receivables or payables.")
      return json(request, await worklist(admin, current, params.get("entityId") ?? "", ledger))
    }
    if (request.method === "GET" && parts[0] === "purchase-orders") return json(request, await purchaseOrders(admin, current, params.get("entityId") ?? ""))
    if (request.method === "POST" && parts[0] === "purchase-orders" && parts.length === 1) return json(request, await createPurchaseOrder(admin, current, await body<any>(request)), 201)
    if (request.method === "POST" && parts[0] === "purchase-orders" && parts[2] === "approve") return json(request, await approvePurchaseOrder(admin, current, parts[1], clean((await body<any>(request)).reason)))
    if (request.method === "GET" && parts[0] === "matches") return json(request, await matchSuggestions(admin, current, params.get("documentId") ?? ""))
    if (request.method === "POST" && parts[0] === "matches") return json(request, await approveMatch(admin, current, await body<any>(request)), 201)
    if (request.method === "GET" && parts[0] === "collections") return json(request, await collectionActions(admin, current, params.get("entityId") ?? ""))
    if (request.method === "POST" && parts[0] === "collections") return json(request, await createCollectionAction(admin, current, await body<any>(request)), 201)
    if (request.method === "GET" && parts[0] === "statement") return json(request, await statement(admin, current, params.get("entityId") ?? "", params.get("customerId") ?? ""))
    if (request.method === "GET" && parts[0] === "payment-runs") return json(request, await paymentRuns(admin, current, params.get("entityId") ?? ""))
    if (request.method === "POST" && parts[0] === "payment-runs" && parts.length === 1) return json(request, await preparePaymentRun(admin, current, await body<any>(request)), 201)
    if (request.method === "GET" && parts[0] === "payment-runs" && parts[2] === "remittance") return json(request, await remittance(admin, current, parts[1]))
    if (request.method === "POST" && parts[0] === "payment-runs" && parts[2] === "review") return json(request, await reviewPaymentRun(admin, current, parts[1], await body<any>(request)))
    if (request.method === "GET" && parts[0] === "profitability") return json(request, await profitability(admin, current, params.get("entityId") ?? ""))
    throw new HttpError(404, "Finance operations endpoint not found.")
  } catch (error) { return failure(request, error) }
})
