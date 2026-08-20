import {
  HttpError,
  adminClient,
  authenticate,
  body,
  corsHeaders,
  currentInternalUser,
  failure,
  json,
  permissionValues,
  requirePermission,
  routeParts,
} from "../_shared/backend.ts"
import {
  buildCustomerTariffDocumentDataset,
  customerTariffDocumentTemplate,
  type CustomerTariffDocumentItem,
} from "../_shared/customer-tariff-document.ts"

type Json = Record<string, unknown>
type Actor = { User_ID: string; Company_ID: string; User_FullName?: string; First_Name?: string; Last_Name?: string }
type PricingMode = "markup_percent" | "markup_amount" | "override"
type RateCharge = { id?: string; description: string; basis: string; buyAmount: number; sellAmount: number; minimumAmount?: number }
type RateView = {
  id: string; code: string; name: string; type: string; status: string; mode: string; carrier: string; supplier: string;
  customer: string; customerOrgId: string; origin: string; destination: string; cargo: string; service: string; validFrom: string; validTo: string;
  currency: string; buyTotal: number; sellTotal: number; marginAmount: number; marginPercent: number | null; versionNo: number;
  sourceType: string; sourceReference: string; schedule: string; sendAfterApproval: boolean; itemCount: number;
  modeDetails: unknown; charges: RateCharge[]; updatedAt: string; updatedBy: string;
}
type PackItemView = {
  id: string; packId: string; sourceCostId: string; sourceVersionId: string; sourceName: string; sourceMode: string;
  sourceCarrier: string; origin: string; destination: string; service: string; cargo: string; currency: string;
  pricingMode: PricingMode; markupPercent: number; markupAmount: number; sourceBuyTotal: number; sellTotal: number;
  charges: RateCharge[]; sortOrder: number;
}
type PublicationView = {
  id: string; packId: string; status: string; fileName: string; sentAt: string; sentTo: string[]; errorMessage: string; createdAt: string;
}

function text(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function number(value: unknown) {
  const resolved = Number(value)
  return Number.isFinite(resolved) && resolved >= 0 ? resolved : 0
}

function bool(value: unknown) {
  return value === true || value === "true"
}

function pricingMode(value: unknown): PricingMode {
  const mode = text(value, 30)
  return mode === "markup_amount" || mode === "override" ? mode : "markup_percent"
}

function mapCharges(value: unknown): RateCharge[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 200).map((entry, index) => {
    const row = (entry ?? {}) as Json
    return {
      id: text(row.id, 36) || `charge-${index + 1}`,
      description: text(row.description, 180) || `Charge ${index + 1}`,
      basis: text(row.basis, 80) || "flat",
      buyAmount: number(row.buyAmount),
      sellAmount: number(row.sellAmount),
      minimumAmount: number(row.minimumAmount) || undefined,
    }
  })
}

function sellCharges(charges: RateCharge[]) {
  return charges.map((charge) => ({
    description: charge.description,
    basis: charge.basis,
    sellAmount: charge.sellAmount,
    minimumAmount: charge.minimumAmount,
  }))
}

function applyPricing(costCharges: RateCharge[], buyTotal: number, mode: PricingMode, markupPercent: number, markupAmount: number, overrideSell: number, overrideCharges?: RateCharge[]) {
  if (mode === "override") {
    const charges = overrideCharges?.length
      ? overrideCharges.map((charge) => ({ ...charge, buyAmount: 0 }))
      : [{ id: "sell", description: "Sell total", basis: "override", buyAmount: 0, sellAmount: overrideSell }]
    return { sellTotal: Math.round(charges.reduce((sum, charge) => sum + charge.sellAmount, 0) * 100) / 100, charges }
  }
  const source = costCharges.length ? costCharges : [{ id: "cost", description: "Cost total", basis: "flat", buyAmount: buyTotal, sellAmount: 0 }]
  const charges = source.map((charge) => {
    const buy = charge.buyAmount || buyTotal
    const sell = mode === "markup_amount" ? buy : buy * (1 + markupPercent / 100)
    return { ...charge, buyAmount: 0, sellAmount: Math.round(sell * 100) / 100 }
  })
  if (mode === "markup_amount" && markupAmount > 0) {
    charges.push({ id: "markup", description: "Markup", basis: "amount", buyAmount: 0, sellAmount: Math.round(markupAmount * 100) / 100 })
  }
  return { sellTotal: Math.round(charges.reduce((sum, charge) => sum + charge.sellAmount, 0) * 100) / 100, charges }
}

function validate(input: Json) {
  const type = text(input.type, 30) === "contract" ? "cost_tariff" : text(input.type, 30)
  const mode = text(input.mode, 20) || (type === "sales_tariff" ? "road" : "")
  if (!text(input.name)) throw new HttpError(400, "Add a rate name before saving.")
  if (!["cost_tariff", "sales_tariff"].includes(type)) throw new HttpError(400, "Choose a cost tariff or a customer tariff pack.")
  if (type === "cost_tariff" && (!text(input.origin, 180) || !text(input.destination, 180))) throw new HttpError(400, "Add both sides of the route before saving.")
  if (type === "sales_tariff" && !text(input.customerOrgId, 36)) throw new HttpError(400, "Choose the customer for this tariff pack.")
  if (type === "cost_tariff" && !["lcl", "fcl", "air", "road"].includes(mode)) throw new HttpError(400, "Choose LCL, FCL, Air or Road.")
  if (type === "sales_tariff" && mode && !["lcl", "fcl", "air", "road"].includes(mode)) throw new HttpError(400, "Choose LCL, FCL, Air or Road.")
  const validFrom = text(input.validFrom, 10)
  const validTo = text(input.validTo, 10)
  if (!validFrom || !validTo || validTo < validFrom) throw new HttpError(400, "Choose a valid start and end date.")
  if (!/^[A-Z]{3}$/.test(text(input.currency, 3).toUpperCase())) throw new HttpError(400, "Use a three-letter currency code.")
}

function actorName(actor: Actor) {
  return text(actor.User_FullName) || `${text(actor.First_Name)} ${text(actor.Last_Name)}`.trim() || "Multideck operator"
}

function mapRate(row: Json, version?: Json | null, extras: { itemCount?: number } = {}): RateView {
  const metadata = (row.RATEContract_MetadataJSON ?? {}) as Json
  const snapshot = ((version?.RATEContractVer_SnapshotJSON ?? {}) as Json)
  const isPack = row.RATEContract_TypeCode === "sales_tariff"
  const buyTotal = isPack ? 0 : number(snapshot.buyTotal ?? metadata.buyTotal)
  const sellTotal = number(snapshot.sellTotal ?? metadata.sellTotal)
  const marginAmount = sellTotal - buyTotal
  const charges = mapCharges(snapshot.charges ?? metadata.charges)
  return {
    id: String(row.RATEContract_ID),
    code: String(row.RATEContract_Code ?? ""),
    name: String(row.RATEContract_Name ?? ""),
    type: String(row.RATEContract_TypeCode ?? "cost_tariff"),
    status: String(row.RATEContract_StatusCode ?? "draft"),
    mode: String(snapshot.mode ?? metadata.mode ?? "fcl"),
    carrier: String(snapshot.carrier ?? metadata.carrier ?? ""),
    supplier: String(snapshot.supplier ?? metadata.supplier ?? ""),
    customer: String(snapshot.customer ?? metadata.customer ?? ""),
    customerOrgId: String(row.RATEContract_CustomerOrgID ?? snapshot.customerOrgId ?? metadata.customerOrgId ?? ""),
    origin: String(snapshot.origin ?? metadata.origin ?? ""),
    destination: String(snapshot.destination ?? metadata.destination ?? ""),
    cargo: String(snapshot.cargo ?? metadata.cargo ?? "General cargo"),
    service: String(snapshot.service ?? metadata.service ?? "Standard"),
    validFrom: String(row.RATEContract_ValidFrom ?? ""),
    validTo: String(row.RATEContract_ValidTo ?? ""),
    currency: String(row.RATEContract_CurrencyCodeSnapshot ?? "GBP"),
    buyTotal,
    sellTotal,
    marginAmount,
    marginPercent: sellTotal > 0 ? (marginAmount / sellTotal) * 100 : null,
    versionNo: Number(version?.RATEContractVer_VersionNo ?? 1),
    sourceType: String(version?.RATEContractVer_SourceTypeCode ?? "manual"),
    sourceReference: String(version?.RATEContractVer_SourceReference ?? row.RATEContract_ExternalReference ?? ""),
    schedule: String(snapshot.schedule ?? metadata.schedule ?? "ad_hoc"),
    sendAfterApproval: bool(snapshot.sendAfterApproval ?? metadata.sendAfterApproval),
    itemCount: extras.itemCount ?? number(snapshot.itemCount ?? metadata.itemCount),
    modeDetails: snapshot.modeDetails ?? metadata.modeDetails ?? {},
    charges,
    updatedAt: String(row.RATEContract_UpdatedAt ?? ""),
    updatedBy: String(snapshot.updatedBy ?? "Multideck operator"),
  }
}

function mapVersion(row: Json) {
  return {
    id: row.RATEContractVer_ID,
    rateId: row.RATEContractVer_ContractID,
    versionNo: row.RATEContractVer_VersionNo,
    status: row.RATEContractVer_StatusCode,
    effectiveFrom: row.RATEContractVer_EffectiveFrom ?? "",
    effectiveTo: row.RATEContractVer_EffectiveTo ?? "",
    changeReason: row.RATEContractVer_ChangeReason ?? "",
    sourceReference: row.RATEContractVer_SourceReference ?? "",
    createdAt: row.RATEContractVer_CreatedAt,
    createdBy: ((row.RATEContractVer_SnapshotJSON ?? {}) as Json).updatedBy ?? "Multideck operator",
  }
}

function mapAuditEvent(row: Json) {
  return {
    id: row.RATEAudit_ID,
    rateId: row.RATEAudit_ContractID ?? null,
    action: row.RATEAudit_Action,
    message: row.RATEAudit_Message ?? "",
    createdAt: row.RATEAudit_CreatedAt,
    createdBy: ((row.RATEAudit_MetadataJSON ?? {}) as Json).actorName ?? "Multideck operator",
  }
}

function ratePair(value: unknown) {
  const pair = (value ?? {}) as Json
  return mapRate((pair.contract ?? {}) as Json, (pair.version ?? null) as Json | null)
}

function ratePairs(value: unknown) {
  return Array.isArray(value) ? value.map(ratePair) : []
}

function snapshot(input: Json, updatedBy: string, extras: Json = {}) {
  const type = text(input.type, 30) === "contract" ? "cost_tariff" : text(input.type, 30) || "cost_tariff"
  return {
    type,
    mode: text(input.mode, 20) || (type === "sales_tariff" ? "road" : "fcl"),
    carrier: text(input.carrier),
    supplier: text(input.supplier),
    customer: text(input.customer),
    customerOrgId: text(input.customerOrgId, 36),
    origin: text(input.origin, 180) || (type === "sales_tariff" ? "Multiple lanes" : ""),
    destination: text(input.destination, 180) || (type === "sales_tariff" ? "Multiple lanes" : ""),
    cargo: text(input.cargo) || "General cargo",
    service: text(input.service) || "Standard",
    buyTotal: type === "sales_tariff" ? 0 : number(input.buyTotal),
    sellTotal: number(input.sellTotal),
    schedule: text(input.schedule, 20) || "ad_hoc",
    sendAfterApproval: bool(input.sendAfterApproval),
    itemCount: number(input.itemCount ?? extras.itemCount),
    modeDetails: typeof input.modeDetails === "object" && input.modeDetails ? input.modeDetails : {},
    charges: mapCharges(input.charges),
    updatedBy,
  }
}

async function companyQuotes(admin: ReturnType<typeof adminClient>, actor: Actor) {
  const result = await admin.rpc("multideck_rates_quote_picker", { p_company_id: actor.Company_ID, p_limit: 100 })
  if (result.error) throw new HttpError(500, result.error.message)
  return Array.isArray(result.data) ? result.data : []
}

async function companyQuote(admin: ReturnType<typeof adminClient>, actor: Actor, quoteId: string) {
  const headerResult = await admin
    .from("CusQuote_Header")
    .select("CusQuoteHeader_ID,CusQuoteHeader_OrgOfficeID,OrgOffice_ID,CusQuoteHeader_IsDeleted")
    .eq("CusQuoteHeader_ID", quoteId)
    .maybeSingle()
  if (headerResult.error) throw new HttpError(500, headerResult.error.message)
  if (!headerResult.data || headerResult.data.CusQuoteHeader_IsDeleted) throw new HttpError(404, "That quote no longer exists.")

  const officeId = headerResult.data.CusQuoteHeader_OrgOfficeID ?? headerResult.data.OrgOffice_ID
  if (!officeId) throw new HttpError(404, "That quote no longer exists.")
  const officeResult = await admin.from("cmp_Offices").select("Office_ID").eq("Office_ID", officeId).eq("Company_ID", actor.Company_ID).maybeSingle()
  if (officeResult.error) throw new HttpError(500, officeResult.error.message)
  if (!officeResult.data) throw new HttpError(404, "That quote no longer exists.")

  const quoteResult = await admin.from("App_Live_Quotes").select("*").eq("CusQuoteHeader_ID", quoteId).maybeSingle()
  if (quoteResult.error) throw new HttpError(500, quoteResult.error.message)
  if (!quoteResult.data) throw new HttpError(404, "That quote no longer exists.")
  return quoteResult.data
}

async function resolveCustomer(admin: ReturnType<typeof adminClient>, actor: Actor, orgId: string) {
  if (!orgId) return { id: "", name: "" }
  const access = await admin.rpc("multideck_crm_accessible_account_ids", { p_company_id: actor.Company_ID })
  if (access.error) throw new HttpError(500, access.error.message)
  const allowed = new Set((access.data ?? []).map((row: Json) => String(row.account_id ?? "")))
  if (!allowed.has(orgId)) throw new HttpError(404, "That customer is not available in this workspace.")
  const result = await admin.from("Org_Master").select("Org_id,Org_Name").eq("Org_id", orgId).maybeSingle()
  if (result.error) throw new HttpError(500, result.error.message)
  if (!result.data) throw new HttpError(404, "That customer is not available in this workspace.")
  return { id: String(result.data.Org_id), name: String(result.data.Org_Name ?? "") }
}

async function searchCustomers(admin: ReturnType<typeof adminClient>, actor: Actor, request: Request) {
  const search = text(new URL(request.url).searchParams.get("search"), 120)
  const access = await admin.rpc("multideck_crm_accessible_account_ids", { p_company_id: actor.Company_ID })
  if (access.error) throw new HttpError(500, access.error.message)
  const ids = [...new Set((access.data ?? []).map((row: Json) => String(row.account_id ?? "")).filter(Boolean))].slice(0, 400)
  if (!ids.length) return { customers: [] }
  let query = admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", ids).order("Org_Name").limit(25)
  if (search) query = query.ilike("Org_Name", `%${search}%`)
  const result = await query
  if (result.error) throw new HttpError(500, result.error.message)
  return { customers: (result.data ?? []).map((row) => ({ id: row.Org_id, name: row.Org_Name ?? "" })) }
}

async function workspace(admin: ReturnType<typeof adminClient>, actor: Actor, permissions: string[]) {
  const [{ data: snapshotData, error: snapshotError }, { data: imports, error: importsError }, quotes] = await Promise.all([
    admin.rpc("multideck_rates_workspace_snapshot", { p_company_id: actor.Company_ID }),
    admin.from("RATE_ImportBatches").select("*").eq("Company_ID", actor.Company_ID).order("RATEImport_CreatedAt", { ascending: false }).limit(100),
    companyQuotes(admin, actor),
  ])
  for (const error of [snapshotError, importsError]) if (error) throw new HttpError(500, error.message)
  const snapshotJson = (snapshotData ?? {}) as Json
  return {
    summary: snapshotJson.summary ?? {},
    attention: ratePairs(snapshotJson.attention),
    recent: ratePairs(snapshotJson.recent),
    imports: (imports ?? []).map((row) => ({ id: row.RATEImport_ID, fileName: row.RATEImport_FileName ?? "Rate source", sourceType: row.RATEImport_SourceTypeCode, status: row.RATEImport_StatusCode, rowCount: row.RATEImport_RowCount, errorCount: row.RATEImport_ErrorCount, warningCount: row.RATEImport_WarningCount, createdAt: row.RATEImport_CreatedAt })),
    quotes: quotes.map((row) => ({ id: row.CusQuoteHeader_ID, reference: row.Quote_Reference, customer: row.Customer_Name, origin: row.Origin, destination: row.Destination, mode: row.Transport_Mode, equipment: row.Equipment_Load, currency: row.Currency })),
    permissions: { canManage: permissions.includes("Rates.Manage") },
    integrations: { seaRates: { connected: false, reason: "SeaRates API credentials and a validated response contract are not configured." } },
  }
}

async function recordsPage(admin: ReturnType<typeof adminClient>, actor: Actor, request: Request) {
  const search = new URL(request.url).searchParams
  const scope = text(search.get("scope"), 20)
  const limit = Math.max(1, Math.min(Number(search.get("limit") ?? 20) || 20, 50))
  const offset = Math.max(0, Number(search.get("offset") ?? 0) || 0)
  const result = await admin.rpc("multideck_rates_register_page", {
    p_company_id: actor.Company_ID,
    p_scope: scope,
    p_search: text(search.get("search")) || null,
    p_mode: text(search.get("mode"), 20) || null,
    p_tariff_type: text(search.get("tariffType"), 30) || null,
    p_expiry: text(search.get("expiry"), 20) || null,
    p_sort: text(search.get("sort"), 30) || "name",
    p_sort_direction: text(search.get("direction"), 4) || "asc",
    p_limit: limit,
    p_offset: offset,
  })
  if (result.error) throw new HttpError(500, result.error.message)
  const page = (result.data ?? {}) as Json
  const expiry = (page.expiryCounts ?? {}) as Json
  return {
    rows: ratePairs(page.rows),
    total: number(page.total),
    expiryCounts: {
      expired: number(expiry.expired),
      sevenDays: number(expiry.sevenDays),
      thirtyDays: number(expiry.thirtyDays),
      activeCurrent: number(expiry.activeCurrent),
      pendingApproval: number(expiry.pendingApproval),
    },
  }
}

async function loadContract(admin: ReturnType<typeof adminClient>, actor: Actor, rateId: string) {
  const contractResult = await admin.from("RATE_Contracts").select("*").eq("RATEContract_ID", rateId).eq("Company_ID", actor.Company_ID).eq("RATEContract_IsDeleted", false).maybeSingle()
  if (contractResult.error) throw new HttpError(500, contractResult.error.message)
  if (!contractResult.data) throw new HttpError(404, "That rate no longer exists.")
  return contractResult.data as Json
}

async function listPackItems(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string): Promise<PackItemView[]> {
  const result = await admin.from("RATE_CustomerTariffItems").select("*").eq("Company_ID", actor.Company_ID).eq("RATETariffItem_PackID", packId).order("RATETariffItem_SortOrder").limit(200)
  if (result.error) throw new HttpError(500, result.error.message)
  const rows = result.data ?? []
  const sourceIds = [...new Set(rows.map((row) => String(row.RATETariffItem_SourceCostID)))]
  const sources = sourceIds.length
    ? (await admin.from("RATE_Contracts").select("*").in("RATEContract_ID", sourceIds).eq("Company_ID", actor.Company_ID)).data ?? []
    : []
  const sourceMap = new Map(sources.map((row) => [String(row.RATEContract_ID), mapRate(row)]))
  return rows.map((row) => {
    const source = sourceMap.get(String(row.RATETariffItem_SourceCostID))
    const sell = (row.RATETariffItem_SellSnapshotJSON ?? {}) as Json
    const charges = mapCharges(sell.charges)
    return {
      id: String(row.RATETariffItem_ID),
      packId: String(row.RATETariffItem_PackID),
      sourceCostId: String(row.RATETariffItem_SourceCostID),
      sourceVersionId: String(row.RATETariffItem_SourceVersionID ?? ""),
      sourceName: String(sell.name ?? source?.name ?? "Cost tariff"),
      sourceMode: String(sell.mode ?? source?.mode ?? "fcl"),
      sourceCarrier: String(sell.carrier ?? source?.carrier ?? source?.supplier ?? ""),
      origin: String(sell.origin ?? source?.origin ?? ""),
      destination: String(sell.destination ?? source?.destination ?? ""),
      service: String(sell.service ?? source?.service ?? ""),
      cargo: String(sell.cargo ?? source?.cargo ?? ""),
      currency: String(sell.currency ?? source?.currency ?? "GBP"),
      pricingMode: pricingMode(row.RATETariffItem_PricingMode),
      markupPercent: number(row.RATETariffItem_MarkupPercent),
      markupAmount: number(row.RATETariffItem_MarkupAmount),
      sourceBuyTotal: number(source?.buyTotal),
      sellTotal: number(sell.sellTotal),
      charges,
      sortOrder: Number(row.RATETariffItem_SortOrder ?? 0),
    }
  })
}

async function listPublications(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string): Promise<PublicationView[]> {
  const result = await admin.from("RATE_CustomerTariffPublications").select("*").eq("Company_ID", actor.Company_ID).eq("RATETariffPub_PackID", packId).order("RATETariffPub_CreatedAt", { ascending: false }).limit(50)
  if (result.error) throw new HttpError(500, result.error.message)
  return (result.data ?? []).map((row) => ({
    id: String(row.RATETariffPub_ID),
    packId: String(row.RATETariffPub_PackID),
    status: String(row.RATETariffPub_StatusCode),
    fileName: String(row.RATETariffPub_FileName ?? "Customer tariff.pdf"),
    sentAt: String(row.RATETariffPub_SentAt ?? ""),
    sentTo: Array.isArray(row.RATETariffPub_SentToJSON) ? row.RATETariffPub_SentToJSON.map((value: unknown) => String(value)) : [],
    errorMessage: String(row.RATETariffPub_ErrorMessage ?? ""),
    createdAt: String(row.RATETariffPub_CreatedAt ?? ""),
  }))
}

async function recordDetails(admin: ReturnType<typeof adminClient>, actor: Actor, rateId: string) {
  const contract = await loadContract(admin, actor, rateId)
  const currentVersionId = contract.RATEContract_CurrentVersionID
  const [currentVersionResult, versionsResult, auditResult, items, publications] = await Promise.all([
    currentVersionId ? admin.from("RATE_ContractVersions").select("*").eq("RATEContractVer_ID", currentVersionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    admin.from("RATE_ContractVersions").select("*").eq("RATEContractVer_ContractID", rateId).order("RATEContractVer_VersionNo", { ascending: false }).limit(100),
    admin.from("RATE_AuditEvents").select("*").eq("Company_ID", actor.Company_ID).eq("RATEAudit_ContractID", rateId).order("RATEAudit_CreatedAt", { ascending: false }).limit(100),
    contract.RATEContract_TypeCode === "sales_tariff" ? listPackItems(admin, actor, rateId) : Promise.resolve([] as PackItemView[]),
    contract.RATEContract_TypeCode === "sales_tariff" ? listPublications(admin, actor, rateId) : Promise.resolve([] as PublicationView[]),
  ])
  for (const error of [currentVersionResult.error, versionsResult.error, auditResult.error]) if (error) throw new HttpError(500, error.message)
  return {
    rate: mapRate(contract, currentVersionResult.data, { itemCount: items.length }),
    versions: (versionsResult.data ?? []).map(mapVersion),
    audit: (auditResult.data ?? []).map(mapAuditEvent),
    items,
    publications,
  }
}

async function audit(admin: ReturnType<typeof adminClient>, actor: Actor, rateId: string, action: string, message: string, metadata: Json = {}) {
  const { error } = await admin.from("RATE_AuditEvents").insert({ Company_ID: actor.Company_ID, RATEAudit_Action: action, RATEAudit_TargetTable: "RATE_Contracts", RATEAudit_TargetID: rateId, RATEAudit_ContractID: rateId, RATEAudit_Message: message, RATEAudit_MetadataJSON: { ...metadata, actorName: actorName(actor) }, RATEAudit_CreatedBy: actor.User_ID })
  if (error) throw new HttpError(500, error.message)
}

async function nextVersionNo(admin: ReturnType<typeof adminClient>, contractId: string) {
  const result = await admin.from("RATE_ContractVersions").select("RATEContractVer_VersionNo").eq("RATEContractVer_ContractID", contractId).order("RATEContractVer_VersionNo", { ascending: false }).limit(1).maybeSingle()
  return Number(result.data?.RATEContractVer_VersionNo ?? 0) + 1
}

async function insertVersion(admin: ReturnType<typeof adminClient>, actor: Actor, contract: Json, metadata: Json, status: string, reason: string, extra: Json = {}) {
  const versionNo = await nextVersionNo(admin, String(contract.RATEContract_ID))
  const versionResult = await admin.from("RATE_ContractVersions").insert({
    RATEContractVer_ContractID: contract.RATEContract_ID,
    RATEContractVer_VersionNo: versionNo,
    RATEContractVer_StatusCode: status,
    RATEContractVer_EffectiveFrom: contract.RATEContract_ValidFrom,
    RATEContractVer_EffectiveTo: contract.RATEContract_ValidTo,
    RATEContractVer_SourceTypeCode: extra.sourceType || "manual",
    RATEContractVer_SourceReference: contract.RATEContract_ExternalReference,
    RATEContractVer_ImportedBatchID: extra.importId || null,
    RATEContractVer_ChangeReason: reason,
    RATEContractVer_PublishedAt: status === "active" ? new Date().toISOString() : null,
    RATEContractVer_PublishedBy: status === "active" ? actor.User_ID : null,
    RATEContractVer_SnapshotJSON: metadata,
    RATEContractVer_CreatedBy: actor.User_ID,
    RATEContractVer_UpdatedBy: actor.User_ID,
  }).select("*").single()
  if (versionResult.error) throw new HttpError(500, versionResult.error.message)
  const updateCurrent = await admin.from("RATE_Contracts").update({ RATEContract_CurrentVersionID: versionResult.data.RATEContractVer_ID, RATEContract_UpdatedAt: new Date().toISOString(), RATEContract_UpdatedBy: actor.User_ID }).eq("RATEContract_ID", contract.RATEContract_ID).eq("Company_ID", actor.Company_ID).select("*").single()
  if (updateCurrent.error) throw new HttpError(500, updateCurrent.error.message)
  return { contract: updateCurrent.data as Json, version: versionResult.data as Json, versionNo }
}

async function refreshPackTotals(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string, reason: string, status?: string) {
  const items = await listPackItems(admin, actor, packId)
  const contract = await loadContract(admin, actor, packId)
  const first = items[0]
  const nextStatus = status || (String(contract.RATEContract_StatusCode) === "draft" ? "draft" : "pending_approval")
  const metadata = {
    ...(contract.RATEContract_MetadataJSON as Json ?? {}),
    origin: first?.origin || "Multiple lanes",
    destination: items.length > 1 ? "Multiple lanes" : first?.destination || "Multiple lanes",
    mode: first?.sourceMode || "road",
    carrier: items.length > 1 ? "Multiple carriers" : first?.sourceCarrier || "",
    sellTotal: items.reduce((sum, item) => sum + item.sellTotal, 0),
    buyTotal: 0,
    itemCount: items.length,
    charges: [],
    updatedBy: actorName(actor),
  }
  const updated = await admin.from("RATE_Contracts").update({
    RATEContract_StatusCode: nextStatus,
    RATEContract_MetadataJSON: metadata,
    RATEContract_UpdatedAt: new Date().toISOString(),
    RATEContract_UpdatedBy: actor.User_ID,
  }).eq("RATEContract_ID", packId).eq("Company_ID", actor.Company_ID).select("*").single()
  if (updated.error) throw new HttpError(500, updated.error.message)
  return await insertVersion(admin, actor, updated.data, metadata, nextStatus, reason)
}

function sellSnapshotFromCost(cost: RateView, priced: { sellTotal: number; charges: RateCharge[] }, pricing: { mode: PricingMode; markupPercent: number; markupAmount: number }) {
  return {
    name: cost.name,
    mode: cost.mode,
    carrier: cost.carrier || cost.supplier,
    origin: cost.origin,
    destination: cost.destination,
    service: cost.service,
    cargo: cost.cargo,
    currency: cost.currency,
    sellTotal: priced.sellTotal,
    charges: sellCharges(priced.charges),
    pricingMode: pricing.mode,
    markupPercent: pricing.markupPercent,
    markupAmount: pricing.markupAmount,
  }
}

async function refreshLinkedPacks(admin: ReturnType<typeof adminClient>, actor: Actor, cost: RateView, sourceVersionId?: string) {
  const links = await admin.from("RATE_CustomerTariffItems").select("*").eq("Company_ID", actor.Company_ID).eq("RATETariffItem_SourceCostID", cost.id)
  if (links.error) throw new HttpError(500, links.error.message)
  const packs = new Set<string>()
  for (const row of links.data ?? []) {
    const mode = pricingMode(row.RATETariffItem_PricingMode)
    const markupPercent = number(row.RATETariffItem_MarkupPercent)
    const markupAmount = number(row.RATETariffItem_MarkupAmount)
    const existing = (row.RATETariffItem_SellSnapshotJSON ?? {}) as Json
    const priced = mode === "override"
      ? { sellTotal: number(existing.sellTotal), charges: mapCharges(existing.charges) }
      : applyPricing(cost.charges, cost.buyTotal, mode, markupPercent, markupAmount, 0)
    const { error } = await admin.from("RATE_CustomerTariffItems").update({
      RATETariffItem_SourceVersionID: sourceVersionId || null,
      RATETariffItem_SellSnapshotJSON: sellSnapshotFromCost(cost, priced, { mode, markupPercent, markupAmount }),
      RATETariffItem_UpdatedAt: new Date().toISOString(),
      RATETariffItem_UpdatedBy: actor.User_ID,
    }).eq("RATETariffItem_ID", row.RATETariffItem_ID).eq("Company_ID", actor.Company_ID)
    if (error) throw new HttpError(500, error.message)
    packs.add(String(row.RATETariffItem_PackID))
  }
  for (const packId of packs) {
    await refreshPackTotals(admin, actor, packId, `Linked cost tariff ${cost.name} changed. Pack needs approval.`, "pending_approval")
    await audit(admin, actor, packId, "pack_needs_approval", `${cost.name} changed, so this customer tariff needs approval.`)
  }
}

async function save(admin: ReturnType<typeof adminClient>, actor: Actor, input: Json, rateId?: string) {
  const updating = Boolean(rateId)
  let existing: Json | null = null
  let existingRate: RateView | null = null
  const requestedCustomer = Object.prototype.hasOwnProperty.call(input, "customerOrgId")
  const requestedCustomerId = text(input.customerOrgId, 36)
  if (rateId) {
    existing = await loadContract(admin, actor, rateId)
    const version = existing.RATEContract_CurrentVersionID
      ? (await admin.from("RATE_ContractVersions").select("*").eq("RATEContractVer_ID", existing.RATEContract_CurrentVersionID).maybeSingle()).data
      : null
    existingRate = mapRate(existing, version)
    input = {
      ...existingRate,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")),
      type: text(input.type, 30) || existingRate.type,
      id: rateId,
    }
  }
  const type = text(input.type, 30) === "contract" ? "cost_tariff" : text(input.type, 30) || existingRate?.type || "cost_tariff"
  input.type = type
  if (type === "sales_tariff") {
    const customer = await resolveCustomer(admin, actor, requestedCustomerId || existingRate?.customerOrgId || "")
    input.customerOrgId = customer.id
    input.customer = customer.name
    input.origin = text(input.origin, 180) || existingRate?.origin || "Multiple lanes"
    input.destination = text(input.destination, 180) || existingRate?.destination || "Multiple lanes"
    input.mode = text(input.mode, 20) || existingRate?.mode || "road"
    input.buyTotal = 0
  } else if (requestedCustomer && !requestedCustomerId) {
    input.customerOrgId = ""
    input.customer = ""
  } else if (text(input.customerOrgId, 36)) {
    const customer = await resolveCustomer(admin, actor, text(input.customerOrgId, 36))
    input.customerOrgId = customer.id
    input.customer = customer.name
  } else {
    input.customerOrgId = ""
    input.customer = ""
  }
  const charges = mapCharges(input.charges)
  if (type === "cost_tariff" && charges.length) input.buyTotal = charges.reduce((sum, charge) => sum + charge.buyAmount, 0)
  validate(input)
  const metadata = snapshot(input, actorName(actor))
  const contractValues = {
    Company_ID: actor.Company_ID,
    RATEContract_Code: text(input.code, 100) || existingRate?.code || `RATE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    RATEContract_Name: text(input.name),
    RATEContract_TypeCode: type,
    RATEContract_StatusCode: text(input.status, 20) || (type === "sales_tariff" ? "draft" : "active"),
    RATEContract_CurrencyCodeSnapshot: text(input.currency, 3).toUpperCase(),
    RATEContract_ValidFrom: text(input.validFrom, 10),
    RATEContract_ValidTo: text(input.validTo, 10),
    RATEContract_ExternalReference: text(input.sourceReference, 180) || null,
    RATEContract_CustomerOrgID: text(input.customerOrgId, 36) || null,
    RATEContract_Notes: text(input.notes, 2000) || null,
    RATEContract_MetadataJSON: metadata,
    RATEContract_UpdatedAt: new Date().toISOString(),
    RATEContract_UpdatedBy: actor.User_ID,
  }
  let contract: Json
  if (updating) {
    const result = await admin.from("RATE_Contracts").update(contractValues).eq("RATEContract_ID", rateId).eq("Company_ID", actor.Company_ID).select("*").single()
    if (result.error) throw new HttpError(500, result.error.message)
    contract = result.data
  } else {
    const result = await admin.from("RATE_Contracts").insert({ ...contractValues, RATEContract_CreatedBy: actor.User_ID, RATEContract_OwnerUserID: actor.User_ID }).select("*").single()
    if (result.error) throw new HttpError(500, result.error.message)
    contract = result.data
  }
  const version = await insertVersion(admin, actor, contract, metadata, contractValues.RATEContract_StatusCode, text(input.changeReason, 1000) || (updating ? "Rate updated" : "Initial version"), { importId: text(input.importId, 36), sourceType: input.importId ? "upload" : text(input.sourceType, 60) || "manual" })
  if (input.importId) await admin.from("RATE_ImportBatches").update({ RATEImport_ContractID: contract.RATEContract_ID, RATEImport_ContractVerID: version.version.RATEContractVer_ID, RATEImport_StatusCode: "saved", RATEImport_CompletedAt: new Date().toISOString() }).eq("RATEImport_ID", input.importId).eq("Company_ID", actor.Company_ID)
  await audit(admin, actor, String(contract.RATEContract_ID), updating ? "version_created" : "rate_created", updating ? `Version ${version.versionNo} saved for ${contract.RATEContract_Name}.` : `${contract.RATEContract_Name} created.`, { versionNo: version.versionNo, before: existing, after: contractValues })
  const saved = mapRate(version.contract, version.version)
  if (type === "cost_tariff" && updating) await refreshLinkedPacks(admin, actor, saved, String(version.version.RATEContractVer_ID))
  return saved
}

async function expire(admin: ReturnType<typeof adminClient>, actor: Actor, rateId: string) {
  const result = await admin.from("RATE_Contracts").update({ RATEContract_StatusCode: "expired", RATEContract_ValidTo: new Date().toISOString().slice(0, 10), RATEContract_UpdatedAt: new Date().toISOString(), RATEContract_UpdatedBy: actor.User_ID }).eq("RATEContract_ID", rateId).eq("Company_ID", actor.Company_ID).eq("RATEContract_IsDeleted", false).select("*").maybeSingle()
  if (result.error) throw new HttpError(500, result.error.message)
  if (!result.data) throw new HttpError(404, "That rate no longer exists.")
  const version = result.data.RATEContract_CurrentVersionID ? (await admin.from("RATE_ContractVersions").select("*").eq("RATEContractVer_ID", result.data.RATEContract_CurrentVersionID).maybeSingle()).data : null
  await audit(admin, actor, rateId, "rate_expired", `${result.data.RATEContract_Name} expired.`)
  return mapRate(result.data, version)
}

async function savePackItem(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string, input: Json, itemId?: string) {
  const pack = await loadContract(admin, actor, packId)
  if (pack.RATEContract_TypeCode !== "sales_tariff") throw new HttpError(400, "Only a customer tariff pack can include cost tariffs.")
  let sourceCostId = text(input.sourceCostId, 36)
  if (itemId && !sourceCostId) {
    const existing = await admin.from("RATE_CustomerTariffItems").select("RATETariffItem_SourceCostID").eq("RATETariffItem_ID", itemId).eq("Company_ID", actor.Company_ID).maybeSingle()
    sourceCostId = String(existing.data?.RATETariffItem_SourceCostID ?? "")
  }
  if (!sourceCostId) throw new HttpError(400, "Choose an incoming cost tariff to include.")
  const costContract = await loadContract(admin, actor, sourceCostId)
  if (costContract.RATEContract_TypeCode !== "cost_tariff") throw new HttpError(400, "Choose an incoming cost tariff to include.")
  const costVersion = costContract.RATEContract_CurrentVersionID
    ? (await admin.from("RATE_ContractVersions").select("*").eq("RATEContractVer_ID", costContract.RATEContract_CurrentVersionID).maybeSingle()).data
    : null
  const cost = mapRate(costContract, costVersion)
  const mode = pricingMode(input.pricingMode)
  const markupPercent = number(input.markupPercent)
  const markupAmount = number(input.markupAmount)
  const priced = applyPricing(cost.charges, cost.buyTotal, mode, markupPercent, markupAmount, number(input.sellTotal), mapCharges(input.charges))
  const values = {
    Company_ID: actor.Company_ID,
    RATETariffItem_PackID: packId,
    RATETariffItem_SourceCostID: sourceCostId,
    RATETariffItem_SourceVersionID: costContract.RATEContract_CurrentVersionID,
    RATETariffItem_PricingMode: mode,
    RATETariffItem_MarkupPercent: mode === "markup_percent" ? markupPercent : null,
    RATETariffItem_MarkupAmount: mode === "markup_amount" ? markupAmount : null,
    RATETariffItem_SellSnapshotJSON: sellSnapshotFromCost(cost, priced, { mode, markupPercent, markupAmount }),
    RATETariffItem_SortOrder: Number(input.sortOrder ?? 0),
    RATETariffItem_UpdatedAt: new Date().toISOString(),
    RATETariffItem_UpdatedBy: actor.User_ID,
  }
  if (itemId) {
    const result = await admin.from("RATE_CustomerTariffItems").update(values).eq("RATETariffItem_ID", itemId).eq("Company_ID", actor.Company_ID).eq("RATETariffItem_PackID", packId).select("*").maybeSingle()
    if (result.error) throw new HttpError(500, result.error.message)
    if (!result.data) throw new HttpError(404, "That pack item no longer exists.")
  } else {
    const result = await admin.from("RATE_CustomerTariffItems").upsert({ ...values, RATETariffItem_CreatedBy: actor.User_ID }, { onConflict: "RATETariffItem_PackID,RATETariffItem_SourceCostID" }).select("*").single()
    if (result.error) throw new HttpError(500, result.error.message)
  }
  await refreshPackTotals(admin, actor, packId, text(input.reason, 1000) || "Pack item updated")
  await audit(admin, actor, packId, "pack_item_saved", `${cost.name} included in the customer tariff.`)
  return await recordDetails(admin, actor, packId)
}

async function removePackItem(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string, itemId: string) {
  await loadContract(admin, actor, packId)
  const result = await admin.from("RATE_CustomerTariffItems").delete().eq("RATETariffItem_ID", itemId).eq("Company_ID", actor.Company_ID).eq("RATETariffItem_PackID", packId)
  if (result.error) throw new HttpError(500, result.error.message)
  await refreshPackTotals(admin, actor, packId, "Pack item removed")
  await audit(admin, actor, packId, "pack_item_removed", "A cost tariff was removed from the customer pack.")
  return await recordDetails(admin, actor, packId)
}

function carboneAuthorization() {
  const explicit = Deno.env.get("CARBONE_AUTH_HEADER")?.trim()
  if (explicit) return explicit
  const token = Deno.env.get("CARBONE_API_TOKEN")?.trim()
  if (token) return `Bearer ${token}`
  const username = Deno.env.get("CARBONE_USERNAME")
  const password = Deno.env.get("CARBONE_PASSWORD")
  if (username && password) return `Basic ${btoa(`${username}:${password}`)}`
  throw new HttpError(503, "The customer tariff document service is not configured.")
}

function carboneBaseUrl() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "")
  if (!configured) throw new HttpError(503, "The customer tariff document service is not configured.")
  return configured
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function customerEmails(admin: ReturnType<typeof adminClient>, customerOrgId: string) {
  const contacts = await admin.from("Org_Contacts").select("OrgContact_ID").eq("Org_ID", customerOrgId).limit(50)
  if (contacts.error) throw new HttpError(500, contacts.error.message)
  const ids = (contacts.data ?? []).map((row) => String(row.OrgContact_ID))
  if (!ids.length) return []
  const emails = await admin.from("OrgContact_Emails").select("OrgContactEmail_Email").in("OrgContact_ID", ids).limit(50)
  if (emails.error) throw new HttpError(500, emails.error.message)
  return [...new Set((emails.data ?? []).map((row) => String(row.OrgContactEmail_Email ?? "").trim().toLowerCase()).filter((value) => value.includes("@")))]
}

async function generateDocument(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string, authorization: string, sendAfter = false) {
  const details = await recordDetails(admin, actor, packId)
  if (details.rate.type !== "sales_tariff") throw new HttpError(400, "Only a customer tariff pack can be published.")
  if (!details.items.length) throw new HttpError(400, "Include at least one cost tariff before generating the document.")
  const cycle = details.rate.schedule === "weekly" ? "Weekly" : details.rate.schedule === "monthly" ? "Monthly" : "Ad hoc"
  const items: CustomerTariffDocumentItem[] = details.items.map((item) => ({
    name: item.sourceName,
    mode: item.sourceMode,
    carrier: item.sourceCarrier,
    origin: item.origin,
    destination: item.destination,
    service: item.service,
    cargo: item.cargo,
    currency: item.currency,
    sellTotal: item.sellTotal,
    charges: item.charges.map((charge) => ({ description: charge.description, basis: charge.basis, amount: charge.sellAmount })),
  }))
  const dataset = buildCustomerTariffDocumentDataset({
    title: details.rate.name,
    customer: details.rate.customer,
    packCode: details.rate.code,
    versionNo: details.rate.versionNo,
    validFrom: details.rate.validFrom,
    validTo: details.rate.validTo,
    cycle,
    issuedOn: new Date().toISOString().slice(0, 10),
    currency: details.rate.currency,
    items,
  })
  const template = new TextEncoder().encode(customerTariffDocumentTemplate())
  const response = await fetch(`${carboneBaseUrl()}/render/template?download=true`, {
    method: "POST",
    headers: {
      Authorization: carboneAuthorization(),
      "Content-Type": "application/json",
      "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
    },
    body: JSON.stringify({
      data: dataset,
      template: bytesToBase64(template),
      convertTo: "pdf",
      converter: "C",
      lang: "en-gb",
      reportName: `${details.rate.code}-v${details.rate.versionNo}`,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new HttpError(502, "The customer tariff document could not be created. Try again.")
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new HttpError(502, "The customer tariff document could not be verified. Try again.")
  const publicationId = crypto.randomUUID()
  const fileName = `${details.rate.code}-v${details.rate.versionNo}.pdf`
  const storagePath = `${actor.Company_ID}/packs/${packId}/${publicationId}.pdf`
  const upload = await admin.storage.from("rate-source-files").upload(storagePath, bytes, { contentType: "application/pdf", upsert: false })
  if (upload.error) throw new HttpError(500, "The customer tariff document could not be stored.")
  const inserted = await admin.from("RATE_CustomerTariffPublications").insert({
    RATETariffPub_ID: publicationId,
    Company_ID: actor.Company_ID,
    RATETariffPub_PackID: packId,
    RATETariffPub_PackVersionID: (await loadContract(admin, actor, packId)).RATEContract_CurrentVersionID,
    RATETariffPub_StatusCode: sendAfter ? "generated" : "ready_to_send",
    RATETariffPub_StorageBucket: "rate-source-files",
    RATETariffPub_StoragePath: storagePath,
    RATETariffPub_FileName: fileName,
    RATETariffPub_MimeType: "application/pdf",
    RATETariffPub_SendAfterApproval: details.rate.sendAfterApproval,
    RATETariffPub_CreatedBy: actor.User_ID,
  }).select("*").single()
  if (inserted.error) throw new HttpError(500, inserted.error.message)
  await audit(admin, actor, packId, "pack_published", `Customer tariff document ${fileName} generated.`, { publicationId })
  if (sendAfter) return await sendPublication(admin, actor, packId, publicationId, authorization)
  return await recordDetails(admin, actor, packId)
}

async function sendPublication(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string, publicationId: string, authorization: string) {
  const details = await recordDetails(admin, actor, packId)
  const publication = details.publications.find((item) => item.id === publicationId) ?? details.publications[0]
  if (!publication) throw new HttpError(404, "That tariff document is not ready to send.")
  const row = await admin.from("RATE_CustomerTariffPublications").select("*").eq("RATETariffPub_ID", publication.id).eq("Company_ID", actor.Company_ID).maybeSingle()
  if (row.error) throw new HttpError(500, row.error.message)
  if (!row.data?.RATETariffPub_StoragePath) throw new HttpError(404, "That tariff document is not ready to send.")
  const file = await admin.storage.from(String(row.data.RATETariffPub_StorageBucket || "rate-source-files")).download(String(row.data.RATETariffPub_StoragePath))
  if (file.error || !file.data) throw new HttpError(500, "The customer tariff document could not be read.")
  const bytes = new Uint8Array(await file.data.arrayBuffer())
  const recipients = await customerEmails(admin, details.rate.customerOrgId)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
  const mailboxResponse = await fetch(`${supabaseUrl}/functions/v1/inbox-api/mailboxes`, { headers: { Authorization: authorization, apikey: anonKey } })
  const mailboxPayload = await mailboxResponse.json().catch(() => [])
  const mailboxes = Array.isArray(mailboxPayload) ? mailboxPayload : Array.isArray(mailboxPayload.mailboxes) ? mailboxPayload.mailboxes : []
  const mailbox = mailboxes.find((item: Json) => item.outboundEnabled && item.isDefault) ?? mailboxes.find((item: Json) => item.outboundEnabled)
  if (!mailbox?.id || !recipients.length) {
    await admin.from("RATE_CustomerTariffPublications").update({ RATETariffPub_StatusCode: "ready_to_send", RATETariffPub_ErrorMessage: !mailbox?.id ? "Connect a mailbox before sending." : "This customer has no contact email yet." }).eq("RATETariffPub_ID", publication.id)
    await audit(admin, actor, packId, "pack_ready_to_send", "The customer tariff is ready to send once a mailbox and recipient are available.")
    return await recordDetails(admin, actor, packId)
  }
  const sendResponse = await fetch(`${supabaseUrl}/functions/v1/inbox-api/send`, {
    method: "POST",
    headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json", "Idempotency-Key": `rates-pack:${publication.id}` },
    body: JSON.stringify({
      mailboxId: mailbox.id,
      mode: "new",
      addedTo: recipients,
      subject: `${details.rate.name} · ${details.rate.validFrom} to ${details.rate.validTo}`,
      bodyText: `Please find the approved customer tariff for ${details.rate.customer}. This file contains sell rates only.`,
      attachments: [{ fileName: row.data.RATETariffPub_FileName || "Customer-tariff.pdf", mimeType: "application/pdf", contentBase64: bytesToBase64(bytes) }],
    }),
  })
  if (!sendResponse.ok) {
    const payload = await sendResponse.json().catch(() => ({})) as Json
    await admin.from("RATE_CustomerTariffPublications").update({ RATETariffPub_StatusCode: "failed", RATETariffPub_ErrorMessage: text(payload.detail || payload.message, 400) || "The tariff could not be sent." }).eq("RATETariffPub_ID", publication.id)
    throw new HttpError(502, "The customer tariff could not be sent. It remains ready to retry.")
  }
  await admin.from("RATE_CustomerTariffPublications").update({ RATETariffPub_StatusCode: "sent", RATETariffPub_SentAt: new Date().toISOString(), RATETariffPub_SentToJSON: recipients, RATETariffPub_ErrorMessage: null }).eq("RATETariffPub_ID", publication.id)
  await audit(admin, actor, packId, "pack_sent", `Customer tariff sent to ${recipients.join(", ")}.`, { recipients, approvedBy: actorName(actor) })
  return await recordDetails(admin, actor, packId)
}

async function approvePack(admin: ReturnType<typeof adminClient>, actor: Actor, packId: string, authorization: string) {
  const details = await recordDetails(admin, actor, packId)
  if (details.rate.type !== "sales_tariff") throw new HttpError(400, "Only a customer tariff pack can be approved.")
  if (!details.items.length) throw new HttpError(400, "Include at least one cost tariff before approval.")
  const refreshed = await refreshPackTotals(admin, actor, packId, "Customer tariff approved", "active")
  await audit(admin, actor, packId, "pack_approved", `${refreshed.contract.RATEContract_Name} approved.`, { versionNo: refreshed.versionNo, approvedBy: actorName(actor) })
  return await generateDocument(admin, actor, packId, authorization, mapRate(refreshed.contract, refreshed.version).sendAfterApproval)
}

async function stageImport(request: Request, admin: ReturnType<typeof adminClient>, actor: Actor) {
  const form = await request.formData(); const file = form.get("file"); const previewValue = form.get("preview")
  if (!(file instanceof File)) throw new HttpError(400, "Choose a rate source to upload.")
  if (!file.size || file.size > 15 * 1024 * 1024) throw new HttpError(400, "Choose a rate source smaller than 15 MB.")
  const preview = typeof previewValue === "string" ? JSON.parse(previewValue) as Json : {}
  const bytes = new Uint8Array(await file.arrayBuffer())
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  const hash = Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("")
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160); const path = `${actor.Company_ID}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
  const upload = await admin.storage.from("rate-source-files").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false })
  if (upload.error) throw new HttpError(500, "The original rate source could not be archived.")
  const result = await admin.from("RATE_ImportBatches").insert({ Company_ID: actor.Company_ID, RATEImport_StatusCode: "review", RATEImport_SourceTypeCode: text(preview.format, 60) || "upload", RATEImport_FileName: file.name.slice(0, 260), RATEImport_FileHashSHA256: hash, RATEImport_StorageBucket: "rate-source-files", RATEImport_StoragePath: path, RATEImport_RowCount: Array.isArray(preview.rows) ? preview.rows.length : 0, RATEImport_WarningCount: Array.isArray(preview.warnings) ? preview.warnings.length : 0, RATEImport_MetadataJSON: { preview: { suggested: preview.suggested ?? {}, warnings: preview.warnings ?? [] }, contentType: file.type }, RATEImport_StartedAt: new Date().toISOString(), RATEImport_CreatedBy: actor.User_ID }).select("*").single()
  if (result.error) { await admin.storage.from("rate-source-files").remove([path]); throw new HttpError(500, result.error.message) }
  return { id: result.data.RATEImport_ID, fileName: result.data.RATEImport_FileName, sourceType: result.data.RATEImport_SourceTypeCode, status: result.data.RATEImport_StatusCode, rowCount: result.data.RATEImport_RowCount, errorCount: result.data.RATEImport_ErrorCount, warningCount: result.data.RATEImport_WarningCount, createdAt: result.data.RATEImport_CreatedAt }
}

async function quoteOptions(admin: ReturnType<typeof adminClient>, actor: Actor, quoteId: string) {
  const quote = await companyQuote(admin, actor, quoteId)
  const candidates = await admin.rpc("multideck_rates_quote_candidates", {
    p_company_id: actor.Company_ID,
    p_mode: String(quote.Transport_Mode ?? ""),
    p_origin: String(quote.Origin ?? ""),
    p_destination: String(quote.Destination ?? ""),
    p_customer: String(quote.Customer_Name ?? ""),
    p_limit: 100,
  })
  if (candidates.error) throw new HttpError(500, candidates.error.message)
  const options = (Array.isArray(candidates.data) ? candidates.data : []).map((value) => {
    const pair = (value ?? {}) as Json
    return {
      ...ratePair(pair),
      matchScore: number(pair.matchScore),
      matchReasons: Array.isArray(pair.matchReasons) ? pair.matchReasons.map((reason) => String(reason)) : [],
    }
  })
  return {
    quote: { id: quote.CusQuoteHeader_ID, reference: quote.Quote_Reference, customer: quote.Customer_Name, origin: quote.Origin, destination: quote.Destination, mode: quote.Transport_Mode, equipment: quote.Equipment_Load, currency: quote.Currency },
    options,
    seaRates: { connected: false, reason: "SeaRates API credentials and a validated response contract are not configured." },
  }
}

async function applyToQuote(admin: ReturnType<typeof adminClient>, actor: Actor, quoteId: string, rateId: string) {
  const matched = await quoteOptions(admin, actor, quoteId); const rate = matched.options.find((option) => option.id === rateId)
  if (!rate) throw new HttpError(409, "That rate is no longer eligible for this quote. Check the route, mode and validity again.")
  const versionResult = await admin.from("RATE_Contracts").select("RATEContract_CurrentVersionID").eq("RATEContract_ID", rate.id).eq("Company_ID", actor.Company_ID).single()
  if (versionResult.error) throw new HttpError(500, versionResult.error.message)
  if (!versionResult.data?.RATEContract_CurrentVersionID) throw new HttpError(409, "That rate does not have a current reviewed version.")
  const previousSelection = await admin.from("RATE_QuoteSelections").update({ Current: false }).eq("Company_ID", actor.Company_ID).eq("Quote_ID", quoteId).eq("Current", true)
  if (previousSelection.error) throw new HttpError(500, previousSelection.error.message)
  const snapshotResult = await admin.from("RATE_QuoteSelections").insert({ Company_ID: actor.Company_ID, Quote_ID: quoteId, RATEContract_ID: rate.id, RATEContractVer_ID: versionResult.data.RATEContract_CurrentVersionID, SnapshotJSON: rate, Current: true, AppliedBy: actor.User_ID }).select("RATEQuoteSelection_ID").single()
  if (snapshotResult.error) throw new HttpError(500, snapshotResult.error.message)
  await audit(admin, actor, rate.id, "rate_applied_to_quote", `${rate.name} v${rate.versionNo} applied to ${matched.quote.reference}.`, { quoteId, snapshotId: snapshotResult.data.RATEQuoteSelection_ID })
  return { quoteId, rateId, snapshotId: snapshotResult.data.RATEQuoteSelection_ID }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const admin = adminClient(); const { user } = await authenticate(request, admin); const actor = await currentInternalUser(admin, user) as Actor
    const permissions = await permissionValues(admin, actor.User_ID); const parts = routeParts(request, "rates-api"); const method = request.method.toUpperCase()
    const authorization = request.headers.get("Authorization") ?? ""
    if (!permissions.includes("Rates.View") && !permissions.includes("Rates.Manage")) throw new HttpError(403, "You do not have permission to view rates.")
    if (method === "GET" && parts[0] === "workspace") return json(request, await workspace(admin, actor, permissions))
    if (method === "GET" && parts[0] === "customers") return json(request, await searchCustomers(admin, actor, request))
    if (method === "GET" && parts[0] === "records" && parts.length === 1) return json(request, await recordsPage(admin, actor, request))
    if (method === "GET" && parts[0] === "records" && parts[1] && parts.length === 2) return json(request, await recordDetails(admin, actor, parts[1]))
    if (method === "POST" && parts[0] === "records" && parts.length === 1) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { rate: await save(admin, actor, await body<Json>(request)) }, 201) }
    if (method === "PATCH" && parts[0] === "records" && parts[1] && parts.length === 2) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { rate: await save(admin, actor, await body<Json>(request), parts[1]) }) }
    if (method === "POST" && parts[0] === "records" && parts[1] && parts[2] === "expire") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { rate: await expire(admin, actor, parts[1]) }) }
    if (method === "POST" && parts[0] === "records" && parts[1] && parts[2] === "items" && parts.length === 3) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, await savePackItem(admin, actor, parts[1], await body<Json>(request)), 201) }
    if (method === "PATCH" && parts[0] === "records" && parts[1] && parts[2] === "items" && parts[3]) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); const input = await body<Json>(request); return json(request, await savePackItem(admin, actor, parts[1], { ...input, sourceCostId: input.sourceCostId }, parts[3])) }
    if (method === "DELETE" && parts[0] === "records" && parts[1] && parts[2] === "items" && parts[3]) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, await removePackItem(admin, actor, parts[1], parts[3])) }
    if (method === "POST" && parts[0] === "records" && parts[1] && parts[2] === "approve") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, await approvePack(admin, actor, parts[1], authorization)) }
    if (method === "POST" && parts[0] === "records" && parts[1] && parts[2] === "generate") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, await generateDocument(admin, actor, parts[1], authorization)) }
    if (method === "POST" && parts[0] === "records" && parts[1] && parts[2] === "send") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); const input = await body<Json>(request).catch(() => ({} as Json)); return json(request, await sendPublication(admin, actor, parts[1], text(input.publicationId, 36), authorization)) }
    if (method === "POST" && parts[0] === "imports") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { importBatch: await stageImport(request, admin, actor) }, 201) }
    if (method === "GET" && parts[0] === "quotes" && parts[1] && parts[2] === "options") return json(request, await quoteOptions(admin, actor, parts[1]))
    if (method === "POST" && parts[0] === "quotes" && parts[1] && parts[2] === "apply") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); const input = await body<Json>(request); return json(request, await applyToQuote(admin, actor, parts[1], text(input.rateId, 36))) }
    throw new HttpError(404, "Rates route not found.")
  } catch (error) { return failure(request, error) }
})
