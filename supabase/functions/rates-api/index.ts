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

type Json = Record<string, unknown>
type Actor = { User_ID: string; Company_ID: string; User_FullName?: string; First_Name?: string; Last_Name?: string }
type RateView = {
  id: string; code: string; name: string; type: string; status: string; mode: string; carrier: string; supplier: string;
  customer: string; origin: string; destination: string; cargo: string; service: string; validFrom: string; validTo: string;
  currency: string; buyTotal: number; sellTotal: number; marginAmount: number; marginPercent: number | null; versionNo: number;
  sourceType: string; sourceReference: string; schedule: string; modeDetails: unknown; charges: unknown[]; updatedAt: string; updatedBy: string;
}

function text(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function number(value: unknown) {
  const resolved = Number(value)
  return Number.isFinite(resolved) && resolved >= 0 ? resolved : 0
}

function validate(input: Json) {
  const type = text(input.type, 30)
  const mode = text(input.mode, 20)
  if (!text(input.name)) throw new HttpError(400, "Add a rate name before saving.")
  if (!text(input.origin, 180) || !text(input.destination, 180)) throw new HttpError(400, "Add both sides of the route before saving.")
  if (!["contract", "cost_tariff", "sales_tariff"].includes(type)) throw new HttpError(400, "Choose a supported rate type.")
  if (!["lcl", "fcl", "air", "road"].includes(mode)) throw new HttpError(400, "Choose LCL, FCL, Air or Road.")
  const validFrom = text(input.validFrom, 10)
  const validTo = text(input.validTo, 10)
  if (!validFrom || !validTo || validTo < validFrom) throw new HttpError(400, "Choose a valid start and end date.")
  if (!/^[A-Z]{3}$/.test(text(input.currency, 3).toUpperCase())) throw new HttpError(400, "Use a three-letter currency code.")
  if (type === "sales_tariff" && number(input.sellTotal) < number(input.buyTotal)) throw new HttpError(400, "The sales tariff cannot be lower than its cost.")
}

function actorName(actor: Actor) {
  return text(actor.User_FullName) || `${text(actor.First_Name)} ${text(actor.Last_Name)}`.trim() || "Multideck operator"
}

function mapRate(row: Json, version?: Json | null): RateView {
  const metadata = (row.RATEContract_MetadataJSON ?? {}) as Json
  const snapshot = ((version?.RATEContractVer_SnapshotJSON ?? {}) as Json)
  const buyTotal = number(snapshot.buyTotal ?? metadata.buyTotal)
  const sellTotal = number(snapshot.sellTotal ?? metadata.sellTotal)
  const marginAmount = sellTotal - buyTotal
  return {
    id: row.RATEContract_ID,
    code: row.RATEContract_Code,
    name: row.RATEContract_Name,
    type: row.RATEContract_TypeCode,
    status: row.RATEContract_StatusCode,
    mode: snapshot.mode ?? metadata.mode ?? "fcl",
    carrier: snapshot.carrier ?? metadata.carrier ?? "",
    supplier: snapshot.supplier ?? metadata.supplier ?? "",
    customer: snapshot.customer ?? metadata.customer ?? "",
    origin: snapshot.origin ?? metadata.origin ?? "",
    destination: snapshot.destination ?? metadata.destination ?? "",
    cargo: snapshot.cargo ?? metadata.cargo ?? "General cargo",
    service: snapshot.service ?? metadata.service ?? "Standard",
    validFrom: row.RATEContract_ValidFrom ?? "",
    validTo: row.RATEContract_ValidTo ?? "",
    currency: row.RATEContract_CurrencyCodeSnapshot ?? "GBP",
    buyTotal,
    sellTotal,
    marginAmount,
    marginPercent: sellTotal > 0 ? (marginAmount / sellTotal) * 100 : null,
    versionNo: version?.RATEContractVer_VersionNo ?? 1,
    sourceType: version?.RATEContractVer_SourceTypeCode ?? "manual",
    sourceReference: version?.RATEContractVer_SourceReference ?? row.RATEContract_ExternalReference ?? "",
    schedule: snapshot.schedule ?? metadata.schedule ?? "ad_hoc",
    modeDetails: snapshot.modeDetails ?? metadata.modeDetails ?? {},
    charges: snapshot.charges ?? metadata.charges ?? [],
    updatedAt: row.RATEContract_UpdatedAt,
    updatedBy: snapshot.updatedBy ?? "Multideck operator",
  } as RateView
}

function snapshot(input: Json, updatedBy: string) {
  return {
    type: text(input.type, 30), mode: text(input.mode, 20), carrier: text(input.carrier), supplier: text(input.supplier),
    customer: text(input.customer), origin: text(input.origin), destination: text(input.destination), cargo: text(input.cargo),
    service: text(input.service), buyTotal: number(input.buyTotal), sellTotal: number(input.sellTotal), schedule: text(input.schedule, 20) || "ad_hoc",
    modeDetails: typeof input.modeDetails === "object" && input.modeDetails ? input.modeDetails : {},
    charges: Array.isArray(input.charges) ? input.charges.slice(0, 200) : [], updatedBy,
  }
}

async function companyQuotes(admin: ReturnType<typeof adminClient>, actor: Actor) {
  const officesResult = await admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", actor.Company_ID)
  if (officesResult.error) throw new HttpError(500, officesResult.error.message)
  const officeIds = (officesResult.data ?? []).map((row) => row.Office_ID).filter(Boolean)
  if (!officeIds.length) return []

  const [primaryOfficeQuotes, legacyOfficeQuotes] = await Promise.all([
    admin.from("CusQuote_Header").select("CusQuoteHeader_ID").in("CusQuoteHeader_OrgOfficeID", officeIds).eq("CusQuoteHeader_IsDeleted", false),
    admin.from("CusQuote_Header").select("CusQuoteHeader_ID").in("OrgOffice_ID", officeIds).eq("CusQuoteHeader_IsDeleted", false),
  ])
  if (primaryOfficeQuotes.error) throw new HttpError(500, primaryOfficeQuotes.error.message)
  if (legacyOfficeQuotes.error) throw new HttpError(500, legacyOfficeQuotes.error.message)

  const quoteIds = Array.from(new Set([
    ...(primaryOfficeQuotes.data ?? []).map((row) => row.CusQuoteHeader_ID),
    ...(legacyOfficeQuotes.data ?? []).map((row) => row.CusQuoteHeader_ID),
  ].filter(Boolean)))
  if (!quoteIds.length) return []

  const quotesResult = await admin
    .from("App_Live_Quotes")
    .select("CusQuoteHeader_ID,Quote_Reference,Customer_Name,Origin,Destination,Transport_Mode,Equipment_Load,Currency,Updated_At")
    .in("CusQuoteHeader_ID", quoteIds)
    .order("Updated_At", { ascending: false })
    .limit(100)
  if (quotesResult.error) throw new HttpError(500, quotesResult.error.message)
  return quotesResult.data ?? []
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

async function workspace(admin: ReturnType<typeof adminClient>, actor: Actor, permissions: string[]) {
  const { data: contracts, error: contractsError } = await admin.from("RATE_Contracts").select("*").eq("Company_ID", actor.Company_ID).eq("RATEContract_IsDeleted", false).order("RATEContract_UpdatedAt", { ascending: false })
  if (contractsError) throw new HttpError(500, contractsError.message)
  const contractIds = (contracts ?? []).map((row) => row.RATEContract_ID)
  const versionIds = (contracts ?? []).map((row) => row.RATEContract_CurrentVersionID).filter(Boolean)
  const [{ data: currentVersions, error: currentError }, { data: versions, error: versionsError }, { data: audit, error: auditError }, { data: imports, error: importsError }, quotes] = await Promise.all([
    versionIds.length ? admin.from("RATE_ContractVersions").select("*").in("RATEContractVer_ID", versionIds) : Promise.resolve({ data: [], error: null }),
    contractIds.length ? admin.from("RATE_ContractVersions").select("*").in("RATEContractVer_ContractID", contractIds).order("RATEContractVer_VersionNo", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    admin.from("RATE_AuditEvents").select("*").eq("Company_ID", actor.Company_ID).order("RATEAudit_CreatedAt", { ascending: false }).limit(300),
    admin.from("RATE_ImportBatches").select("*").eq("Company_ID", actor.Company_ID).order("RATEImport_CreatedAt", { ascending: false }).limit(100),
    companyQuotes(admin, actor),
  ])
  for (const error of [currentError, versionsError, auditError, importsError]) if (error) throw new HttpError(500, error.message)
  const currentById = new Map((currentVersions ?? []).map((row) => [row.RATEContractVer_ID, row]))
  return {
    rates: (contracts ?? []).map((row) => mapRate(row, currentById.get(row.RATEContract_CurrentVersionID))),
    versions: (versions ?? []).map((row) => ({ id: row.RATEContractVer_ID, rateId: row.RATEContractVer_ContractID, versionNo: row.RATEContractVer_VersionNo, status: row.RATEContractVer_StatusCode, effectiveFrom: row.RATEContractVer_EffectiveFrom ?? "", effectiveTo: row.RATEContractVer_EffectiveTo ?? "", changeReason: row.RATEContractVer_ChangeReason ?? "", sourceReference: row.RATEContractVer_SourceReference ?? "", createdAt: row.RATEContractVer_CreatedAt, createdBy: ((row.RATEContractVer_SnapshotJSON ?? {}) as Json).updatedBy ?? "Multideck operator" })),
    audit: (audit ?? []).map((row) => ({ id: row.RATEAudit_ID, rateId: row.RATEAudit_ContractID, action: row.RATEAudit_Action, message: row.RATEAudit_Message ?? "", createdAt: row.RATEAudit_CreatedAt, createdBy: ((row.RATEAudit_MetadataJSON ?? {}) as Json).actorName ?? "Multideck operator" })),
    imports: (imports ?? []).map((row) => ({ id: row.RATEImport_ID, fileName: row.RATEImport_FileName ?? "Rate source", sourceType: row.RATEImport_SourceTypeCode, status: row.RATEImport_StatusCode, rowCount: row.RATEImport_RowCount, errorCount: row.RATEImport_ErrorCount, warningCount: row.RATEImport_WarningCount, createdAt: row.RATEImport_CreatedAt })),
    quotes: quotes.map((row) => ({ id: row.CusQuoteHeader_ID, reference: row.Quote_Reference, customer: row.Customer_Name, origin: row.Origin, destination: row.Destination, mode: row.Transport_Mode, equipment: row.Equipment_Load, currency: row.Currency })),
    permissions: { canManage: permissions.includes("Rates.Manage") },
    integrations: { seaRates: { connected: false, reason: "SeaRates API credentials and a validated response contract are not configured." } },
  }
}

async function audit(admin: ReturnType<typeof adminClient>, actor: Actor, rateId: string, action: string, message: string, metadata: Json = {}) {
  const { error } = await admin.from("RATE_AuditEvents").insert({ Company_ID: actor.Company_ID, RATEAudit_Action: action, RATEAudit_TargetTable: "RATE_Contracts", RATEAudit_TargetID: rateId, RATEAudit_ContractID: rateId, RATEAudit_Message: message, RATEAudit_MetadataJSON: { ...metadata, actorName: actorName(actor) }, RATEAudit_CreatedBy: actor.User_ID })
  if (error) throw new HttpError(500, error.message)
}

async function save(admin: ReturnType<typeof adminClient>, actor: Actor, input: Json, rateId?: string) {
  validate(input)
  const updating = Boolean(rateId)
  let existing: Json | null = null
  if (rateId) {
    const result = await admin.from("RATE_Contracts").select("*").eq("RATEContract_ID", rateId).eq("Company_ID", actor.Company_ID).eq("RATEContract_IsDeleted", false).maybeSingle()
    if (result.error) throw new HttpError(500, result.error.message)
    if (!result.data) throw new HttpError(404, "That rate no longer exists.")
    existing = result.data
  }
  const metadata = { ...snapshot(input, actorName(actor)), companyId: actor.Company_ID }
  const contractValues = {
    Company_ID: actor.Company_ID, RATEContract_Code: text(input.code, 100) || `RATE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    RATEContract_Name: text(input.name), RATEContract_TypeCode: text(input.type, 30), RATEContract_StatusCode: text(input.status, 20) || "active",
    RATEContract_CurrencyCodeSnapshot: text(input.currency, 3).toUpperCase(), RATEContract_ValidFrom: text(input.validFrom, 10), RATEContract_ValidTo: text(input.validTo, 10),
    RATEContract_ExternalReference: text(input.sourceReference, 180) || null, RATEContract_Notes: text(input.notes, 2000) || null,
    RATEContract_MetadataJSON: metadata, RATEContract_UpdatedAt: new Date().toISOString(), RATEContract_UpdatedBy: actor.User_ID,
  }
  let contract: Json
  if (updating) {
    const result = await admin.from("RATE_Contracts").update(contractValues).eq("RATEContract_ID", rateId).eq("Company_ID", actor.Company_ID).select("*").single()
    if (result.error) throw new HttpError(500, result.error.message); contract = result.data
  } else {
    const result = await admin.from("RATE_Contracts").insert({ ...contractValues, RATEContract_CreatedBy: actor.User_ID, RATEContract_OwnerUserID: actor.User_ID }).select("*").single()
    if (result.error) throw new HttpError(500, result.error.message); contract = result.data
  }
  const versionNo = updating ? Number((await admin.from("RATE_ContractVersions").select("RATEContractVer_VersionNo").eq("RATEContractVer_ContractID", contract.RATEContract_ID).order("RATEContractVer_VersionNo", { ascending: false }).limit(1).maybeSingle()).data?.RATEContractVer_VersionNo ?? 0) + 1 : 1
  const versionResult = await admin.from("RATE_ContractVersions").insert({ RATEContractVer_ContractID: contract.RATEContract_ID, RATEContractVer_VersionNo: versionNo, RATEContractVer_StatusCode: contractValues.RATEContract_StatusCode, RATEContractVer_EffectiveFrom: contractValues.RATEContract_ValidFrom, RATEContractVer_EffectiveTo: contractValues.RATEContract_ValidTo, RATEContractVer_SourceTypeCode: input.importId ? "upload" : text(input.sourceType, 60) || "manual", RATEContractVer_SourceReference: contractValues.RATEContract_ExternalReference, RATEContractVer_ImportedBatchID: text(input.importId, 36) || null, RATEContractVer_ChangeReason: text(input.changeReason, 1000) || (updating ? "Rate updated" : "Initial version"), RATEContractVer_PublishedAt: contractValues.RATEContract_StatusCode === "active" ? new Date().toISOString() : null, RATEContractVer_PublishedBy: contractValues.RATEContract_StatusCode === "active" ? actor.User_ID : null, RATEContractVer_SnapshotJSON: metadata, RATEContractVer_CreatedBy: actor.User_ID, RATEContractVer_UpdatedBy: actor.User_ID }).select("*").single()
  if (versionResult.error) throw new HttpError(500, versionResult.error.message)
  const updateCurrent = await admin.from("RATE_Contracts").update({ RATEContract_CurrentVersionID: versionResult.data.RATEContractVer_ID }).eq("RATEContract_ID", contract.RATEContract_ID).eq("Company_ID", actor.Company_ID).select("*").single()
  if (updateCurrent.error) throw new HttpError(500, updateCurrent.error.message)
  if (input.importId) await admin.from("RATE_ImportBatches").update({ RATEImport_ContractID: contract.RATEContract_ID, RATEImport_ContractVerID: versionResult.data.RATEContractVer_ID, RATEImport_StatusCode: "saved", RATEImport_CompletedAt: new Date().toISOString() }).eq("RATEImport_ID", input.importId).eq("Company_ID", actor.Company_ID)
  await audit(admin, actor, String(contract.RATEContract_ID), updating ? "version_created" : "rate_created", updating ? `Version ${versionNo} saved for ${contract.RATEContract_Name}.` : `${contract.RATEContract_Name} created.`, { versionNo, before: existing, after: contractValues })
  return mapRate(updateCurrent.data, versionResult.data)
}

async function expire(admin: ReturnType<typeof adminClient>, actor: Actor, rateId: string) {
  const result = await admin.from("RATE_Contracts").update({ RATEContract_StatusCode: "expired", RATEContract_ValidTo: new Date().toISOString().slice(0, 10), RATEContract_UpdatedAt: new Date().toISOString(), RATEContract_UpdatedBy: actor.User_ID }).eq("RATEContract_ID", rateId).eq("Company_ID", actor.Company_ID).eq("RATEContract_IsDeleted", false).select("*").maybeSingle()
  if (result.error) throw new HttpError(500, result.error.message)
  if (!result.data) throw new HttpError(404, "That rate no longer exists.")
  const version = result.data.RATEContract_CurrentVersionID ? (await admin.from("RATE_ContractVersions").select("*").eq("RATEContractVer_ID", result.data.RATEContract_CurrentVersionID).maybeSingle()).data : null
  await audit(admin, actor, rateId, "rate_expired", `${result.data.RATEContract_Name} expired.`)
  return mapRate(result.data, version)
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
  const state = await workspace(admin, actor, ["Rates.Manage"])
  const mode = String(quote.Transport_Mode ?? "").toLowerCase(); const origin = String(quote.Origin ?? "").toLowerCase(); const destination = String(quote.Destination ?? "").toLowerCase(); const customer = String(quote.Customer_Name ?? "").toLowerCase()
  const options = state.rates.filter((rate) => rate.status === "active" && (!rate.validTo || rate.validTo >= new Date().toISOString().slice(0, 10))).map((rate) => {
    const reasons: string[] = []; let score = 25
    if (mode.includes(rate.mode) || (mode === "sea" && ["lcl", "fcl"].includes(rate.mode))) { score += 25; reasons.push("mode") }
    if (origin.includes(rate.origin.toLowerCase()) || rate.origin.toLowerCase().includes(origin.split(" · ")[0])) { score += 20; reasons.push("origin") }
    if (destination.includes(rate.destination.toLowerCase()) || rate.destination.toLowerCase().includes(destination.split(" · ")[0])) { score += 20; reasons.push("destination") }
    if (!rate.customer || customer.includes(rate.customer.toLowerCase())) { score += 10; reasons.push(rate.customer ? "customer" : "eligible customers") }
    return { ...rate, matchScore: score, matchReasons: reasons }
  }).filter((rate) => rate.matchScore >= 60).sort((left, right) => right.matchScore - left.matchScore)
  return { quote: { id: quote.CusQuoteHeader_ID, reference: quote.Quote_Reference, customer: quote.Customer_Name, origin: quote.Origin, destination: quote.Destination, mode: quote.Transport_Mode, equipment: quote.Equipment_Load, currency: quote.Currency }, options, seaRates: state.integrations.seaRates }
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
    if (!permissions.includes("Rates.View") && !permissions.includes("Rates.Manage")) throw new HttpError(403, "You do not have permission to view rates.")
    if (method === "GET" && parts[0] === "workspace") return json(request, await workspace(admin, actor, permissions))
    if (method === "POST" && parts[0] === "records" && parts.length === 1) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { rate: await save(admin, actor, await body<Json>(request)) }, 201) }
    if (method === "PATCH" && parts[0] === "records" && parts[1]) { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { rate: await save(admin, actor, await body<Json>(request), parts[1]) }) }
    if (method === "POST" && parts[0] === "records" && parts[1] && parts[2] === "expire") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { rate: await expire(admin, actor, parts[1]) }) }
    if (method === "POST" && parts[0] === "imports") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); return json(request, { importBatch: await stageImport(request, admin, actor) }, 201) }
    if (method === "GET" && parts[0] === "quotes" && parts[1] && parts[2] === "options") return json(request, await quoteOptions(admin, actor, parts[1]))
    if (method === "POST" && parts[0] === "quotes" && parts[1] && parts[2] === "apply") { await requirePermission(admin, actor.User_ID, "Rates.Manage"); const input = await body<Json>(request); return json(request, await applyToQuote(admin, actor, parts[1], text(input.rateId, 36))) }
    throw new HttpError(404, "Rates route not found.")
  } catch (error) { return failure(request, error) }
})
