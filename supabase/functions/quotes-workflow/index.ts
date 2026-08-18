import { authenticateRequest, corsHeaders, jsonResponse, signedUrlLifetimeSeconds } from "../_shared/document-functions.ts"
import {
  optionalText,
  parseAction,
  parseLifecycleAction,
  parseReference,
  parseUuid,
  QuoteWorkflowError,
  toClientError,
  validateSavePayload,
} from "./core.ts"

type Row = Record<string, unknown>

async function operatorContext(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], authUserId: string) {
  const [{ data, error }, permissionResult] = await Promise.all([
    admin.from("cmp_Users").select("User_ID,Company_ID,User_AccessStatus").eq("Auth_User_ID", authUserId).single(),
    admin.schema("quote_api").rpc("has_permission", { caller_auth_user_id: authUserId, permission_value: "Quotes.Read" }),
  ])
  if (error || !data?.Company_ID || data.User_AccessStatus !== "active") throw error ?? new QuoteWorkflowError(403, "Your workspace identity is incomplete.")
  if (permissionResult.error || permissionResult.data !== true) throw new QuoteWorkflowError(403, "You are not authorised to view quotes.")
  return { userId: String(data.User_ID), companyId: String(data.Company_ID) }
}

async function sourceOptions(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], authUserId: string) {
  const operator = await operatorContext(admin, authUserId)
  const [{ data: offices, error: officeError }, { data: users, error: userError }] = await Promise.all([
    admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", operator.companyId),
    admin.from("cmp_Users").select("User_ID").eq("Company_ID", operator.companyId),
  ])
  if (officeError || userError) throw officeError ?? userError
  const officeIds = (offices ?? []).map((row) => String(row.Office_ID))
  const userIds = (users ?? []).map((row) => String(row.User_ID))
  const leadFilter = [
    userIds.length ? `CRMLead_OwnerUserID.in.(${userIds.join(",")})` : null,
    userIds.length ? `CRMLead_CreatedBy.in.(${userIds.join(",")})` : null,
    officeIds.length ? `CRMLead_OrgOfficeID.in.(${officeIds.join(",")})` : null,
  ].filter(Boolean).join(",")
  const accountFilter = [
    userIds.length ? `CRMAccount_OwnerUserID.in.(${userIds.join(",")})` : null,
    officeIds.length ? `CRMAccount_OrgOfficeID.in.(${officeIds.join(",")})` : null,
  ].filter(Boolean).join(",")
  const [leadResult, accountResult, supplierResult] = await Promise.all([
    leadFilter
      ? admin.from("CRM_Leads").select("CRMLead_ID,CRMLead_CompanyName,CRMLead_PersonName,CRMLead_Email,CRMLead_ModeCode,CRMLead_DirectionCode,CRMLead_TradeLane").or(leadFilter).eq("CRMLead_IsDeleted", false).neq("CRMLead_StatusCode", "converted").order("CRMLead_UpdatedAt", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    accountFilter
      ? admin.from("CRM_AccountProfiles").select("CRMAccount_OrgID,CRMAccount_PrimaryModeCode,CRMAccount_PrimaryTradeLane").or(accountFilter).order("CRMAccount_UpdatedAt", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    admin.from("Org_Master").select("Org_id,Org_Name").order("Org_Name").limit(250),
  ])
  if (leadResult.error || accountResult.error || supplierResult.error) throw leadResult.error ?? accountResult.error ?? supplierResult.error
  const accountIds = (accountResult.data ?? []).map((row) => String(row.CRMAccount_OrgID))
  const { data: organisations, error: organisationError } = accountIds.length
    ? await admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", accountIds)
    : { data: [], error: null }
  if (organisationError) throw organisationError
  const organisationNames = new Map((organisations ?? []).map((row) => [String(row.Org_id), String(row.Org_Name)]))
  return {
    sources: [
      ...(accountResult.data ?? []).map((row) => ({
        id: String(row.CRMAccount_OrgID), type: "account", label: organisationNames.get(String(row.CRMAccount_OrgID)) ?? "Account",
        detail: [row.CRMAccount_PrimaryModeCode, row.CRMAccount_PrimaryTradeLane].filter(Boolean).join(" · "),
      })),
      ...(leadResult.data ?? []).map((row) => ({
        id: String(row.CRMLead_ID), type: "lead", label: String(row.CRMLead_CompanyName || row.CRMLead_PersonName || "Lead"),
        detail: [row.CRMLead_PersonName, row.CRMLead_Email, row.CRMLead_TradeLane].filter(Boolean).join(" · "),
        contactName: row.CRMLead_PersonName, contactEmail: row.CRMLead_Email,
      })),
    ],
    suppliers: (supplierResult.data ?? []).map((row) => ({ id: String(row.Org_id), name: String(row.Org_Name) })),
  }
}

async function quoteWorkspace(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], authUserId: string, referenceValue: unknown) {
  const operator = await operatorContext(admin, authUserId)
  const reference = parseReference(referenceValue)
  const number = Number(reference.slice(2))
  const { data: quote, error: quoteError } = await admin.from("CusQuote_Header").select("*").eq("CusQuoteHeader_Number", number).eq("CusQuoteHeader_IsDeleted", false).maybeSingle()
  if (quoteError || !quote) throw quoteError ?? new QuoteWorkflowError(404, "That quote could not be found.")
  const officeId = String(quote.CusQuoteHeader_OrgOfficeID || quote.OrgOffice_ID || "")
  const { data: office, error: officeError } = await admin.from("cmp_Offices").select("Company_ID").eq("Office_ID", officeId).maybeSingle()
  if (officeError || !office || String(office.Company_ID) !== operator.companyId) throw new QuoteWorkflowError(403, "That quote is outside this workspace.")
  const [customerResult, chargeResult, partyResult, versionResult, eventResult] = await Promise.all([
    admin.from("Org_Master").select("Org_id,Org_Name").eq("Org_id", quote.CusQuoteHeader_CustomerID).maybeSingle(),
    admin.from("CusQuote_Lines").select("*").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID).order("CusQuoteLine_Number"),
    admin.from("CusQuote_Parties").select("*").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID),
    admin.from("CusQuote_Versions").select("*,DOCB_GeneratedDocuments(DOCBGD_ID,DOCBGD_FileName,DOCBGD_MimeType,DOCBGD_FileSizeBytes,DOCBGD_OutputFormatCode,DOCBGD_CreatedAt)").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID).order("CusQuoteVersion_Number", { ascending: false }),
    admin.from("CusQuote_Events").select("*,cmp_Users(User_Firstname,User_Lastname)").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID).order("CusQuoteEvent_OccurredAt", { ascending: false }).limit(100),
  ])
  const firstError = customerResult.error || chargeResult.error || partyResult.error || versionResult.error || eventResult.error
  if (firstError) throw firstError
  const parties = new Map((partyResult.data ?? []).map((party) => [String(party.CusQuoteParty_RoleCode), party as Row]))
  const charges = (chargeResult.data ?? []).map((line) => ({
    id: String(line.CusQuoteLine_ID), description: String(line.CusQuoteLine_Description), supplierId: line.CusQuoteLine_SupplierID,
    costCurrency: String(line.CusQuoteLine_CostCurrencyCode || "GBP"), costAmount: Number(line.CusQuoteLine_CostAmountCurrency || 0),
    costLocal: Number(line.CusQuoteLine_CostAmountLocal || 0), costRoe: Number(line.CusQuoteLine_CostROE || 1),
    sellCurrency: String(line.CusQuoteLine_RevenueCurrencyCode || "GBP"), sellAmount: Number(line.CusQuoteLine_RevenueAmountCurrency || 0),
    sellLocal: Number(line.CusQuoteLine_RevenueAmountLocal || 0), sellRoe: Number(line.CusQuoteLine_RevenueROE || 1),
    calculationBasis: String(line.CusQuoteLine_CalculationBasisCode || "fixed"), quantity: Number(line.CusQuoteLine_Quantity || 1),
    minimumAmount: line.CusQuoteLine_MinimumAmount === null ? null : Number(line.CusQuoteLine_MinimumAmount),
    defaultMarkupPct: line.CusQuoteLine_DefaultMarkupPct === null ? null : Number(line.CusQuoteLine_DefaultMarkupPct),
    appliedMarkupPct: line.CusQuoteLine_AppliedMarkupPct === null ? null : Number(line.CusQuoteLine_AppliedMarkupPct),
    markupOverrideReason: line.CusQuoteLine_MarkupOverrideReason, sourceLabel: line.CusQuoteLine_SourceLabel,
    internalNotes: line.CusQuoteLine_InternalNotes, customerNotes: line.CusQuoteLine_CustomerNotes,
    showToCustomer: Boolean(line.CusQuoteLine_ShowToCustomer),
  }))
  const totals = charges.reduce((result, line) => ({ cost: result.cost + line.costLocal, sell: result.sell + line.sellLocal }), { cost: 0, sell: 0 })
  return {
    quote: {
      id: String(quote.CusQuoteHeader_ID), reference, lifecycle: String(quote.CusQuoteHeader_LifecycleCode || "draft"),
      sourceType: String(quote.CusQuoteHeader_SourceTypeCode || "account"), sourceId: String(quote.CusQuoteHeader_SourceLeadID || quote.CusQuoteHeader_CustomerID),
      customerId: String(quote.CusQuoteHeader_CustomerID), customerName: String(customerResult.data?.Org_Name || "Customer"),
      contactName: quote.CusQuoteHeader_ContactNameSnapshot, contactEmail: quote.CusQuoteHeader_ContactEmailSnapshot,
      direction: quote.CusQuoteHeader_Direction, mode: quote.CusQuoteHeader_ModeCode, shipmentType: quote.CusQuoteHeader_ShipmentTypeCode,
      serviceLevel: quote.CusQuoteHeader_ServiceLevel, currency: quote.CusQuoteHeader_CurrencyCode,
      collectionAddress: quote.CusQuoteHeader_CollectionAddress, loadingPoint: quote.CusQuoteHeader_LoadingPoint,
      dischargePoint: quote.CusQuoteHeader_DischargePoint, deliveryAddress: quote.CusQuoteHeader_DeliveryAddress,
      incoterm: quote.CusQuoteHeader_Incoterm, validFrom: quote.CusQuoteHeader_ValidFrom, validTo: quote.CusQuoteHeader_ValidTo,
      deadline: quote.CusQuoteHeader_Deadline, supplierId: quote.CusQuoteHeader_SupplierID,
      supplierName: quote.CusQuoteHeader_SupplierNameSnapshot, shipmentFacts: quote.CusQuoteHeader_ShipmentFactsJSON || {},
      customerNotes: quote.CusQuoteHeader_CustomerNotes, internalNotes: quote.CusQuoteHeader_InternalNotes,
      terms: quote.CusQuoteHeader_TermsText, rateSourceType: quote.CusQuoteHeader_RateSourceTypeCode,
      rateSourceLabel: quote.CusQuoteHeader_RateSourceLabel, defaultMarkupPct: Number(quote.CusQuoteHeader_DefaultMarkupPct || 15),
      markupOverrideReason: quote.CusQuoteHeader_MarkupOverrideReason, followUpAt: quote.CusQuoteHeader_FollowUpAt,
      outcomeNotes: quote.CusQuoteHeader_OutcomeNotes, acceptedVersionId: quote.CusQuoteHeader_AcceptedVersionID,
      convertedBookingId: quote.CusQuoteHeader_JobID,
      shipper: parties.get("shipper") ? { orgId: parties.get("shipper")?.CusQuoteParty_OrgID, name: parties.get("shipper")?.CusQuoteParty_NameSnapshot, address: parties.get("shipper")?.CusQuoteParty_AddressSnapshot, contact: parties.get("shipper")?.CusQuoteParty_ContactSnapshot } : null,
      consignee: parties.get("consignee") ? { orgId: parties.get("consignee")?.CusQuoteParty_OrgID, name: parties.get("consignee")?.CusQuoteParty_NameSnapshot, address: parties.get("consignee")?.CusQuoteParty_AddressSnapshot, contact: parties.get("consignee")?.CusQuoteParty_ContactSnapshot } : null,
    },
    charges,
    totals: { ...totals, profit: totals.sell - totals.cost, marginPct: totals.sell ? ((totals.sell - totals.cost) / totals.sell) * 100 : null },
    versions: versionResult.data ?? [], events: eventResult.data ?? [],
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)
  try {
    const { admin, userId } = await authenticateRequest(request)
    const body = await request.json() as Record<string, unknown>
    const action = parseAction(body.action)
    if (action === "sources") return jsonResponse(request, await sourceOptions(admin, userId))
    if (action === "workspace") return jsonResponse(request, await quoteWorkspace(admin, userId, body.reference))
    if (action === "save") {
      const payload = validateSavePayload(body.quote)
      const quoteId = body.quoteId ? parseUuid(body.quoteId, "Quote") : null
      const { data, error } = await admin.schema("quote_api").rpc("save_quote", { caller_auth_user_id: userId, requested_quote_id: quoteId, payload })
      if (error || !data) throw error ?? new Error("Quote save returned no result")
      return jsonResponse(request, data)
    }
    if (action === "transition") {
      const quoteId = parseUuid(body.quoteId, "Quote")
      const transition = parseLifecycleAction(body.transition)
      const { data, error } = await admin.schema("quote_api").rpc("transition_quote", {
        caller_auth_user_id: userId, requested_quote_id: quoteId, requested_transition: transition,
        requested_note: optionalText(body.note, 1000), requested_follow_up_at: optionalText(body.followUpAt, 80),
      })
      if (error || !data) throw error ?? new Error("Quote transition returned no result")
      return jsonResponse(request, data)
    }
    if (action === "convert") {
      const quoteId = parseUuid(body.quoteId, "Quote")
      const idempotencyKey = parseUuid(body.idempotencyKey, "Conversion key")
      const readiness = body.readiness && typeof body.readiness === "object" && !Array.isArray(body.readiness) ? body.readiness : {}
      const { data, error } = await admin.schema("quote_api").rpc("convert_to_booking", {
        caller_auth_user_id: userId, requested_quote_id: quoteId, idempotency_key: idempotencyKey, readiness,
      })
      if (error || !data) throw error ?? new Error("Quote conversion returned no result")
      return jsonResponse(request, data)
    }
    const generatedDocumentId = parseUuid(body.generatedDocumentId, "Generated document")
    const operator = await operatorContext(admin, userId)
    const { data: generated, error: generatedError } = await admin.from("DOCB_GeneratedDocuments")
      .select("DOCBGD_FileName,DOCBGD_StorageBucket,DOCBGD_StoragePath,DOCB_RenderJobs!inner(DOCBRJ_TargetID,DOCBRJ_TargetTable)")
      .eq("DOCBGD_ID", generatedDocumentId).maybeSingle()
    const renderRelation = generated?.DOCB_RenderJobs
    const renderJob = (Array.isArray(renderRelation) ? renderRelation[0] : renderRelation) as Row | undefined
    if (generatedError || !generated || renderJob?.DOCBRJ_TargetTable !== "CusQuote_Header") throw new QuoteWorkflowError(404, "That quote document could not be found.")
    const quoteId = String(renderJob.DOCBRJ_TargetID)
    const { data: quote, error: quoteError } = await admin.from("CusQuote_Header").select("CusQuoteHeader_OrgOfficeID,OrgOffice_ID").eq("CusQuoteHeader_ID", quoteId).maybeSingle()
    if (quoteError || !quote) throw new QuoteWorkflowError(404, "That quote document could not be found.")
    const { data: office } = await admin.from("cmp_Offices").select("Company_ID").eq("Office_ID", quote.CusQuoteHeader_OrgOfficeID || quote.OrgOffice_ID).maybeSingle()
    if (!office || String(office.Company_ID) !== operator.companyId) throw new QuoteWorkflowError(403, "That quote document is outside this workspace.")
    const { data: signed, error: signedError } = await admin.storage.from(String(generated.DOCBGD_StorageBucket)).createSignedUrl(String(generated.DOCBGD_StoragePath), signedUrlLifetimeSeconds, { download: String(generated.DOCBGD_FileName) })
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Signed URL was not returned")
    return jsonResponse(request, { signedUrl: signed.signedUrl, fileName: generated.DOCBGD_FileName, expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString() })
  } catch (error) {
    const safe = toClientError(error)
    console.error("Quote workflow failed", { status: safe.status, reason: safe.auditMessage })
    return jsonResponse(request, { error: safe.clientMessage }, safe.status)
  }
})
