import { authenticateRequest, corsHeaders, jsonResponse } from "../_shared/document-functions.ts"
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
    admin.rpc("quote_workflow_has_permission", { caller_auth_user_id: authUserId, permission_value: "Quotes.Read" }),
  ])
  if (error || !data?.Company_ID || data.User_AccessStatus !== "active") throw error ?? new QuoteWorkflowError(403, "Your workspace identity is incomplete.")
  if (permissionResult.error || permissionResult.data !== true) throw new QuoteWorkflowError(403, "You are not authorised to view quotes.")
  return { userId: String(data.User_ID), companyId: String(data.Company_ID) }
}

async function requireAdministrator(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], authUserId: string) {
  const operator = await operatorContext(admin, authUserId)
  const { data: links, error: linkError } = await admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", operator.userId)
  if (linkError) throw linkError
  const roleIds = (links ?? []).map((row) => row.sys_UserRole_ID)
  const { data: roles, error: roleError } = roleIds.length
    ? await admin.from("sys_UserRoles").select("sys_UserRole_Name").in("sys_UserRole_ID", roleIds)
    : { data: [], error: null }
  if (roleError) throw roleError
  if (!(roles ?? []).some((role) => ["administrator", "company admin"].includes(String(role.sys_UserRole_Name ?? "").trim().toLowerCase()))) {
    throw new QuoteWorkflowError(403, "Only tenant administrators can change system preferences.")
  }
  return operator
}

async function sourceOptions(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], authUserId: string) {
  const operator = await operatorContext(admin, authUserId)
  const [{ data: offices, error: officeError }, { data: users, error: userError }] = await Promise.all([
    admin.from("cmp_Offices").select("Office_ID,Office_Code,Office_Name").eq("Company_ID", operator.companyId).eq("Office_IsActive", true).order("Office_Name"),
    admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email").eq("Company_ID", operator.companyId).eq("User_AccessStatus", "active").order("User_Firstname"),
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
  const [
    leadResult,
    accountResult,
    organisationResult,
    addressResult,
    contactResult,
    emailResult,
    organisationTypeResult,
    typeResult,
    departmentResult,
    modeResult,
    shipmentTypeResult,
    currencyResult,
    commodityResult,
  ] = await Promise.all([
    leadFilter
      ? admin.from("CRM_Leads").select("CRMLead_ID,CRMLead_CompanyName,CRMLead_PersonName,CRMLead_Email,CRMLead_ModeCode,CRMLead_DirectionCode,CRMLead_TradeLane").or(leadFilter).eq("CRMLead_IsDeleted", false).neq("CRMLead_StatusCode", "converted").order("CRMLead_UpdatedAt", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    accountFilter
      ? admin.from("CRM_AccountProfiles").select("CRMAccount_OrgID,CRMAccount_PrimaryModeCode,CRMAccount_PrimaryTradeLane").or(accountFilter).order("CRMAccount_UpdatedAt", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode").order("Org_Name").limit(500),
    admin.from("Org_Addresses").select("OrgAdd_ID,Org_ID,Org_NameOverride,OrgAdd_Line1,OrgAdd_Line2,OrgAdd_TownCity,OrgAdd_CountyState,OrgAdd_PostZipCode,OrgAdd_Country,OrgAdd_UNLOCODE,OrgAdd_MainEmail,OrgAdd_MainPhone").limit(1500),
    admin.from("Org_Contacts").select("OrgContact_ID,Org_ID,OrgContact_FirstName,OrgContact_LastName").limit(1500),
    admin.from("OrgContact_Emails").select("OrgContact_ID,OrgContactEmail_Email").limit(1500),
    admin.from("Org_Master_Type").select("Org_ID,OrgType_ID").limit(2000),
    admin.from("Org_Types").select("OrgType_ID,OrgType_Name").order("OrgType_Order"),
    admin.from("cmp_Departments").select("Department_ID,Department_Name").eq("Company_ID", operator.companyId).eq("Department_IsActive", true).order("Department_Name"),
    admin.from("sys_CusQuoteShipmentModes").select("CQSM_Code,CQSM_Name").eq("CQSM_IsActive", true).order("CQSM_SortOrder"),
    admin.from("sys_CusQuoteShipmentTypes").select("CQST_Code,CQST_Name").eq("CQST_IsActive", true).order("CQST_SortOrder"),
    admin.from("sys_Currency").select("Currency_ID,Currency_Code,Currency_Name").not("Currency_Code", "is", null).order("Currency_Code"),
    admin.from("sys_CommodityCode").select("RH_PK,RH_Code,RH_Description").eq("RH_IsActive", true).order("RH_Description").limit(500),
  ])
  const firstError = leadResult.error || accountResult.error || organisationResult.error
    || addressResult.error || contactResult.error || emailResult.error
    || organisationTypeResult.error || typeResult.error || departmentResult.error
    || modeResult.error || shipmentTypeResult.error || currencyResult.error || commodityResult.error
  if (firstError) throw firstError
  const organisationNames = new Map((organisationResult.data ?? []).map((row) => [String(row.Org_id), String(row.Org_Name)]))
  const emailsByContact = new Map<string, string>()
  for (const row of emailResult.data ?? []) {
    const contactId = String(row.OrgContact_ID)
    if (!emailsByContact.has(contactId)) emailsByContact.set(contactId, String(row.OrgContactEmail_Email))
  }
  const addressesByOrganisation = new Map<string, Row[]>()
  for (const row of addressResult.data ?? []) {
    const organisationId = String(row.Org_ID)
    addressesByOrganisation.set(organisationId, [...(addressesByOrganisation.get(organisationId) ?? []), row])
  }
  const contactsByOrganisation = new Map<string, Row[]>()
  for (const row of contactResult.data ?? []) {
    const organisationId = String(row.Org_ID)
    contactsByOrganisation.set(organisationId, [...(contactsByOrganisation.get(organisationId) ?? []), row])
  }
  const typeNames = new Map((typeResult.data ?? []).map((row) => [String(row.OrgType_ID), String(row.OrgType_Name)]))
  const typesByOrganisation = new Map<string, string[]>()
  for (const row of organisationTypeResult.data ?? []) {
    const organisationId = String(row.Org_ID)
    const typeName = typeNames.get(String(row.OrgType_ID))
    if (typeName) typesByOrganisation.set(organisationId, [...(typesByOrganisation.get(organisationId) ?? []), typeName])
  }
  const organisations = (organisationResult.data ?? []).map((row) => {
    const id = String(row.Org_id)
    return {
      id,
      code: String(row.Org_AccCode || ""),
      name: String(row.Org_Name),
      types: typesByOrganisation.get(id) ?? [],
      addresses: (addressesByOrganisation.get(id) ?? []).map((address) => ({
        id: String(address.OrgAdd_ID),
        label: String(address.Org_NameOverride || address.OrgAdd_UNLOCODE || address.OrgAdd_TownCity || "Address"),
        address: [address.OrgAdd_Line1, address.OrgAdd_Line2, address.OrgAdd_TownCity, address.OrgAdd_CountyState, address.OrgAdd_PostZipCode, address.OrgAdd_Country].filter(Boolean).join(", "),
        email: address.OrgAdd_MainEmail ? String(address.OrgAdd_MainEmail) : null,
        phone: address.OrgAdd_MainPhone ? String(address.OrgAdd_MainPhone) : null,
      })),
      contacts: (contactsByOrganisation.get(id) ?? []).map((contact) => ({
        id: String(contact.OrgContact_ID),
        name: [contact.OrgContact_FirstName, contact.OrgContact_LastName].filter(Boolean).join(" "),
        email: emailsByContact.get(String(contact.OrgContact_ID)) ?? null,
      })),
    }
  })
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
    organisations,
    suppliers: organisations.filter((row) => row.types.some((type) => /supplier|carrier|shipping line|haulier|freight forwarder/i.test(type))),
    carriers: organisations.filter((row) => row.types.some((type) => /carrier|shipping line|haulier|freight forwarder/i.test(type))),
    offices: (offices ?? []).map((row) => ({ id: String(row.Office_ID), code: String(row.Office_Code || ""), name: String(row.Office_Name) })),
    departments: (departmentResult.data ?? []).map((row) => ({ id: String(row.Department_ID), name: String(row.Department_Name) })),
    users: (users ?? []).map((row) => ({ id: String(row.User_ID), name: [row.User_Firstname, row.User_Lastname].filter(Boolean).join(" ") || String(row.User_Email), email: String(row.User_Email) })),
    modes: (modeResult.data ?? []).map((row) => ({ code: String(row.CQSM_Code), name: String(row.CQSM_Name) })),
    shipmentTypes: (shipmentTypeResult.data ?? []).map((row) => ({ code: String(row.CQST_Code), name: String(row.CQST_Name) })),
    currencies: (currencyResult.data ?? []).map((row) => ({ id: String(row.Currency_ID), code: String(row.Currency_Code), name: String(row.Currency_Name || row.Currency_Code) })),
    commodities: (commodityResult.data ?? []).map((row) => ({ id: String(row.RH_PK || ""), code: String(row.RH_Code || ""), name: String(row.RH_Description || row.RH_Code || "") })),
  }
}

async function quoteWorkspace(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], authUserId: string, referenceValue: unknown) {
  const operator = await operatorContext(admin, authUserId)
  const reference = parseReference(referenceValue)
  const number = Number(reference.match(/([0-9]+)$/)?.[1] ?? "")
  let { data: quote, error: quoteError } = await admin.from("CusQuote_Header").select("*").eq("CusQuoteHeader_CustomerReference", reference).eq("CusQuoteHeader_IsDeleted", false).maybeSingle()
  if (!quote && Number.isInteger(number)) {
    const fallback = await admin.from("CusQuote_Header").select("*").eq("CusQuoteHeader_Number", number).eq("CusQuoteHeader_IsDeleted", false).maybeSingle()
    quote = fallback.data
    quoteError = fallback.error
  }
  if (quoteError || !quote) throw quoteError ?? new QuoteWorkflowError(404, "That quote could not be found.")
  const officeId = String(quote.CusQuoteHeader_OrgOfficeID || quote.OrgOffice_ID || "")
  const { data: office, error: officeError } = await admin.from("cmp_Offices").select("Company_ID").eq("Office_ID", officeId).maybeSingle()
  if (officeError || !office || String(office.Company_ID) !== operator.companyId) throw new QuoteWorkflowError(403, "That quote is outside this workspace.")
  const customerId = quote.CusQuoteHeader_CustomerID ? String(quote.CusQuoteHeader_CustomerID) : ""
  const [customerResult, chargeResult, partyResult, versionResult, eventResult] = await Promise.all([
    customerId ? admin.from("Org_Master").select("Org_id,Org_Name").eq("Org_id", customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    admin.from("CusQuote_Lines").select("*").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID).order("CusQuoteLine_Number"),
    admin.from("CusQuote_Parties").select("*").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID),
    admin.from("CusQuote_Versions").select("*").eq("CusQuoteHeader_ID", quote.CusQuoteHeader_ID).order("CusQuoteVersion_Number", { ascending: false }),
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
      sourceType: String(quote.CusQuoteHeader_SourceTypeCode || "account"), sourceId: quote.CusQuoteHeader_SourceLeadID || quote.CusQuoteHeader_CustomerID ? String(quote.CusQuoteHeader_SourceLeadID || quote.CusQuoteHeader_CustomerID) : "",
      customerId, customerName: String(customerResult.data?.Org_Name || quote.CusQuoteHeader_CustomerNameSnapshot || ""),
      contactId: quote.CusQuoteHeader_CustomerContact ? String(quote.CusQuoteHeader_CustomerContact) : "",
      contactName: quote.CusQuoteHeader_ContactNameSnapshot, contactEmail: quote.CusQuoteHeader_ContactEmailSnapshot,
      customerReference: quote.CusQuoteHeader_CustomerReference,
      officeId: quote.CusQuoteHeader_OrgOfficeID || quote.OrgOffice_ID,
      departmentId: quote.CusQuoteHeader_DepartmentID,
      salesOwnerId: quote.CusQuoteHeader_SalesOwnerID,
      direction: quote.CusQuoteHeader_Direction, mode: quote.CusQuoteHeader_ModeCode, shipmentType: quote.CusQuoteHeader_ShipmentTypeCode,
      serviceLevel: quote.CusQuoteHeader_ServiceLevel, currency: quote.CusQuoteHeader_CurrencyCode,
      collectionAddress: quote.CusQuoteHeader_CollectionAddress, loadingPoint: quote.CusQuoteHeader_LoadingPoint,
      dischargePoint: quote.CusQuoteHeader_DischargePoint, deliveryAddress: quote.CusQuoteHeader_DeliveryAddress,
      incoterm: quote.CusQuoteHeader_Incoterm, validFrom: quote.CusQuoteHeader_ValidFrom, validTo: quote.CusQuoteHeader_ValidTo,
      deadline: quote.CusQuoteHeader_Deadline, supplierId: quote.CusQuoteHeader_SupplierID,
      supplierName: quote.CusQuoteHeader_SupplierNameSnapshot, shipmentFacts: quote.CusQuoteHeader_ShipmentFactsJSON || {},
      carrierId: quote.CusQuoteHeader_CarrierID, carrierName: quote.CusQuoteHeader_CarrierNameSnapshot,
      customerNotes: quote.CusQuoteHeader_CustomerNotes, internalNotes: quote.CusQuoteHeader_InternalNotes,
      terms: quote.CusQuoteHeader_TermsText, rateSourceType: quote.CusQuoteHeader_RateSourceTypeCode,
      rateSourceLabel: quote.CusQuoteHeader_RateSourceLabel, defaultMarkupPct: Number(quote.CusQuoteHeader_DefaultMarkupPct || 15),
      markupOverrideReason: quote.CusQuoteHeader_MarkupOverrideReason, followUpAt: quote.CusQuoteHeader_FollowUpAt,
      outcomeNotes: quote.CusQuoteHeader_OutcomeNotes, acceptedVersionId: quote.CusQuoteHeader_AcceptedVersionID,
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
    if (action === "open") {
      const { data, error } = await admin.rpc("quote_workflow_open_quote", { caller_auth_user_id: userId })
      if (error || !data) throw error ?? new Error("Quote opening returned no result")
      return jsonResponse(request, data)
    }
    if (action === "reference-settings") {
      await requireAdministrator(admin, userId)
      const { data, error } = await admin.rpc("quote_workflow_get_reference_settings", { caller_auth_user_id: userId })
      if (error || !data) throw error ?? new Error("Reference settings returned no result")
      return jsonResponse(request, data)
    }
    if (action === "save-reference-settings") {
      await requireAdministrator(admin, userId)
      const { data, error } = await admin.rpc("quote_workflow_save_reference_settings", { caller_auth_user_id: userId, quote_prefix: body.quotePrefix, booking_prefix: body.bookingPrefix })
      if (error || !data) throw error ?? new Error("Reference settings save returned no result")
      return jsonResponse(request, data)
    }
    if (action === "workspace") return jsonResponse(request, await quoteWorkspace(admin, userId, body.reference))
    if (action === "save") {
      const payload = validateSavePayload(body.quote)
      const quoteId = body.quoteId ? parseUuid(body.quoteId, "Quote") : null
      const { data, error } = await admin.rpc("quote_workflow_save_quote", { caller_auth_user_id: userId, requested_quote_id: quoteId, payload })
      if (error || !data) throw error ?? new Error("Quote save returned no result")
      return jsonResponse(request, data)
    }
    if (action === "transition") {
      const quoteId = parseUuid(body.quoteId, "Quote")
      const transition = parseLifecycleAction(body.transition)
      const { data, error } = await admin.rpc("quote_workflow_transition_quote", {
        caller_auth_user_id: userId, requested_quote_id: quoteId, requested_transition: transition,
        requested_note: optionalText(body.note, 1000), requested_follow_up_at: optionalText(body.followUpAt, 80),
      })
      if (error || !data) throw error ?? new Error("Quote transition returned no result")
      return jsonResponse(request, data)
    }
    throw new QuoteWorkflowError(400, "Choose a supported quote action.")
  } catch (error) {
    const safe = toClientError(error)
    console.error("Quote workflow failed", { status: safe.status, reason: safe.auditMessage })
    return jsonResponse(request, { error: safe.clientMessage }, safe.status)
  }
})
