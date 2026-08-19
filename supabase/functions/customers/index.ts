import {
  authenticate,
  authenticatedClient,
  body,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  initials,
  json,
  normalize,
  requirePermission,
  routeParts,
} from "../_shared/backend.ts"

type Row = Record<string, any>

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function countryCode(value: unknown) {
  const code = normalize(value)?.toUpperCase() ?? null
  if (code && !/^[A-Z]{2}$/.test(code)) throw new HttpError(400, "Enter a two-letter ISO country code, such as GB.")
  return code
}

function contactName(contact: Row) {
  return [contact.OrgContact_FirstName, contact.OrgContact_LastName].filter(Boolean).join(" ").trim()
}

function occurredAt(message: Row) {
  return message.CommMessage_MessageDate ?? message.CommMessage_ReceivedAt ?? message.CommMessage_SentAt ?? message.CommMessage_CreatedAt
}

async function accessibleAccountIds(admin: any, companyId: string) {
  const { data, error } = await admin.rpc("multideck_crm_accessible_account_ids", { p_company_id: companyId })
  if (error) throw new HttpError(500, error.message)
  return [...new Set((data ?? []).map((row: Row) => String(row.account_id ?? "")).filter(Boolean))]
}

async function requireExactAccountAccess(admin: any, actorUserId: string, accountId: string) {
  const { error } = await admin.rpc("_multideck_crm_require_account_access", {
    p_actor_user_id: actorUserId,
    p_account_id: accountId,
  })
  if (error?.code === "P0002") throw new HttpError(404, "Account not found.")
  if (error) throw new HttpError(error.code === "42501" ? 403 : 500, error.message)
}

async function customerRows(admin: any, companyId: string, search?: string | null, accountId?: string | null, includeDetailSource = false, scopedIdsOverride?: string[], actorUserId?: string) {
  if (accountId && actorUserId) await requireExactAccountAccess(admin, actorUserId, accountId)
  const accessibleIds = accountId && actorUserId ? [] : scopedIdsOverride ?? await accessibleAccountIds(admin, companyId)
  if (accountId && !actorUserId && !accessibleIds.includes(accountId)) return []
  const scopedIds = accountId ? [accountId] : accessibleIds
  if (!scopedIds.length) return []
  let typeLinkQuery = admin.from("Org_Master_Type").select("Org_ID,OrgType_ID")
  typeLinkQuery = typeLinkQuery.in("Org_ID", scopedIds)
  const { data: customerTypeLinks, error: linkError } = await typeLinkQuery
  if (linkError) throw new HttpError(500, linkError.message)
  const typeIds = [...new Set((customerTypeLinks ?? []).map((item: Row) => item.OrgType_ID))]
  const { data: types, error: typeError } = typeIds.length
    ? await admin.from("Org_Types").select("OrgType_ID,OrgType_Name").in("OrgType_ID", typeIds)
    : { data: [], error: null }
  if (typeError) throw new HttpError(500, typeError.message)

  const typeMap = new Map<string, string>((types ?? []).map((item: Row) => [item.OrgType_ID, item.OrgType_Name]))
  const linksByOrg = new Map<string, string[]>()
  for (const link of customerTypeLinks ?? []) {
    const name = typeMap.get(link.OrgType_ID)
    if (name) linksByOrg.set(link.Org_ID, [...(linksByOrg.get(link.Org_ID) ?? []), name])
  }
  const customerIds = [...linksByOrg.entries()]
    .filter(([, names]) => names.some((name) => name.toLowerCase() === "customer"))
    .map(([id]) => id)

  let query = admin.from("Org_Master").select("*").in("Org_id", scopedIds).order("Org_Name")
  query = customerIds.length
    ? query.or(`Org_CRMIsPotentialCustomer.eq.true,Org_id.in.(${customerIds.join(",")})`)
    : query.eq("Org_CRMIsPotentialCustomer", true)
  const { data: organisations, error } = await query
  if (error) throw new HttpError(500, error.message)

  const ids = (organisations ?? []).map((item: Row) => item.Org_id)
  const [{ data: addresses, error: addressError }, { data: contactCountsResult, error: contactCountError }, { data: profiles, error: profileError }] = await Promise.all([
    ids.length ? admin.from("Org_Addresses").select("*").in("Org_ID", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.rpc("multideck_crm_contact_counts", { p_account_ids: ids }) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("CRM_AccountProfiles").select("*").in("CRMAccount_OrgID", ids).eq("CRMAccount_IsDeleted", false) : Promise.resolve({ data: [], error: null }),
  ])
  if (addressError || contactCountError || profileError) throw new HttpError(500, (addressError ?? contactCountError ?? profileError).message)

  const ownerIds = [...new Set((profiles ?? []).map((profile: Row) => profile.CRMAccount_OwnerUserID).filter(Boolean))]
  const { data: owners, error: ownerError } = ownerIds.length
    ? await admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email").in("User_ID", ownerIds)
    : { data: [], error: null }
  if (ownerError) throw new HttpError(500, ownerError.message)

  const addressMap = new Map<string, Row>((addresses ?? []).map((item: Row) => [item.Org_ID, item]))
  const profileMap = new Map<string, Row>((profiles ?? []).map((item: Row) => [item.CRMAccount_OrgID, item]))
  const ownerMap = new Map<string, Row>((owners ?? []).map((item: Row) => [item.User_ID, item]))
  const contactCounts = new Map<string, number>((contactCountsResult ?? []).map((item: Row) => [item.account_id, Number(item.contact_count) || 0]))
  const term = search?.trim().toLowerCase()

  return (organisations ?? []).map((org: Row) => {
    const address = addressMap.get(org.Org_id)
    const profile = profileMap.get(org.Org_id)
    const owner = profile?.CRMAccount_OwnerUserID ? ownerMap.get(profile.CRMAccount_OwnerUserID) : null
    const ownerName = owner ? [owner.User_Firstname, owner.User_Lastname].filter(Boolean).join(" ") || owner.User_Email : null
    const typeNames = (linksByOrg.get(org.Org_id) ?? []).sort()
    const location = [address?.OrgAdd_TownCity, address?.OrgAdd_Country].filter(Boolean).join(", ") || null
    const relationshipStatus = profile?.CRMAccount_RelationshipStatusCode ?? org.Org_CRMRelationshipStatusCode ?? "active_customer"
    return {
      id: org.Org_id,
      name: org.Org_Name,
      initials: initials(org.Org_Name),
      location,
      industry: profile?.CRMAccount_Vertical ?? typeNames.find((name) => name.toLowerCase() !== "customer") ?? "Customer",
      contactCount: contactCounts.get(org.Org_id) ?? 0,
      status: profile?.CRMAccount_Tier === "A" || profile?.CRMAccount_Tier === "Premium"
        ? "Premium"
        : profile?.CRMAccount_Tier === "Trial" || profile?.CRMAccount_Tier === "New"
          ? profile.CRMAccount_Tier
          : "Standard",
      relationshipStatus,
      tier: profile?.CRMAccount_Tier ?? null,
      segment: profile?.CRMAccount_Segment ?? null,
      ownerId: profile?.CRMAccount_OwnerUserID ?? null,
      ownerName,
      healthScore: profile?.CRMAccount_HealthScore ?? null,
      lastContactAt: profile?.CRMAccount_LastContactAt ?? null,
      nextActionDueAt: profile?.CRMAccount_NextActionDueAt ?? null,
      editVersion: profile?.CRMAccount_EditVersion ?? 1,
      marketingOptIn: Boolean(org.Org_MarketingOptIn),
      marketingConsentSource: org.Org_MarketingConsentSource ?? null,
      marketingConsentUpdatedAt: org.Org_MarketingConsentUpdatedAt ?? null,
      types: typeNames,
      ...(includeDetailSource ? {
        __detailSource: {
          org,
          address: address ?? null,
          profile: profile ?? null,
        },
      } : {}),
    }
  }).filter((item: Row) => !term || [item.name, item.location, item.industry, item.ownerName, item.relationshipStatus].some((value) => value?.toLowerCase().includes(term)))
}

async function contactRows(admin: any, companyId: string, search?: string | null, accountId?: string | null, contactId?: string | null, includeDetailSource = false, scopedContactIdsOverride?: string[], actorUserId?: string, maxRows?: number) {
  let exactAccountId = accountId ?? null
  if (contactId && actorUserId) {
    const { data: exactContact, error } = await admin.from("Org_Contacts")
      .select("OrgContact_ID,Org_ID")
      .eq("OrgContact_ID", contactId)
      .limit(1)
      .maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!exactContact) return []
    exactAccountId = exactContact.Org_ID
  }
  if (exactAccountId && actorUserId) await requireExactAccountAccess(admin, actorUserId, exactAccountId)
  const accessibleIds = scopedContactIdsOverride || (exactAccountId && actorUserId) ? [] : await accessibleAccountIds(admin, companyId)
  if (accountId && !actorUserId && !accessibleIds.includes(accountId)) return []
  if (!scopedContactIdsOverride && !exactAccountId && !accessibleIds.length) return []
  if (scopedContactIdsOverride && !scopedContactIdsOverride.length) return []
  let query = admin.from("Org_Contacts").select("*").order("OrgContact_LastName").order("OrgContact_FirstName")
  query = scopedContactIdsOverride
    ? query.in("OrgContact_ID", scopedContactIdsOverride)
    : exactAccountId
      ? query.eq("Org_ID", exactAccountId)
      : query.in("Org_ID", accessibleIds)
  if (accountId) query = query.eq("Org_ID", accountId)
  if (contactId) query = query.eq("OrgContact_ID", contactId)
  if (maxRows) query = query.limit(Math.max(1, Math.min(maxRows, 50)))
  const { data: contacts, error } = await query
  if (error) throw new HttpError(500, error.message)
  const contactIds = (contacts ?? []).map((item: Row) => item.OrgContact_ID)
  const orgIds = [...new Set((contacts ?? []).map((item: Row) => item.Org_ID))]
  const [organisationResult, emailResult, profileResult, identityResult, addressResult] = await Promise.all([
    orgIds.length ? admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", orgIds) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from("OrgContact_Emails").select("*").in("OrgContact_ID", contactIds).order("OrgContactEmail_Type") : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from("CRM_ContactProfiles").select("*").in("CRMContact_OrgContactID", contactIds) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from("Comm_Identities").select("*").in("CommIdentity_ContactID", contactIds).eq("CommIdentity_IsDeleted", false) : Promise.resolve({ data: [] }),
    orgIds.length ? admin.from("Org_Addresses").select("Org_ID,OrgAdd_TownCity,OrgAdd_Country").in("Org_ID", orgIds) : Promise.resolve({ data: [] }),
  ])
  const relatedError = [organisationResult, emailResult, profileResult, identityResult, addressResult].find((result) => result.error)?.error
  if (relatedError) throw new HttpError(500, relatedError.message)
  const organisations = organisationResult.data
  const emails = emailResult.data
  const profiles = profileResult.data
  const identities = identityResult.data
  const addresses = addressResult.data
  const orgMap = new Map<string, Row>((organisations ?? []).map((item: Row) => [item.Org_id, item]))
  const profileMap = new Map<string, Row>((profiles ?? []).map((item: Row) => [item.CRMContact_OrgContactID, item]))
  const addressMap = new Map<string, Row>((addresses ?? []).map((item: Row) => [item.Org_ID, item]))
  const emailsByContact = new Map<string, Row[]>()
  const identitiesByContact = new Map<string, Row[]>()
  for (const item of emails ?? []) emailsByContact.set(item.OrgContact_ID, [...(emailsByContact.get(item.OrgContact_ID) ?? []), item])
  for (const item of identities ?? []) identitiesByContact.set(item.CommIdentity_ContactID, [...(identitiesByContact.get(item.CommIdentity_ContactID) ?? []), item])
  const term = search?.trim().toLowerCase()

  return (contacts ?? []).map((contact: Row) => {
    const name = contactName(contact)
    const profile = profileMap.get(contact.OrgContact_ID)
    const metadata = objectValue(profile?.CRMContact_MetadataJSON)
    const contactEmails = emailsByContact.get(contact.OrgContact_ID) ?? []
    const contactIdentities = identitiesByContact.get(contact.OrgContact_ID) ?? []
    const emailIdentity = contactIdentities.find((identity) => identity.CommIdentity_ChannelCode === "email")
    const phoneIdentity = contactIdentities.find((identity) => ["phone", "sms", "whatsapp"].includes(identity.CommIdentity_ChannelCode))
    const address = addressMap.get(contact.Org_ID)
    return {
      id: contact.OrgContact_ID,
      accountId: contact.Org_ID,
      accountName: orgMap.get(contact.Org_ID)?.Org_Name ?? "Unknown account",
      firstName: contact.OrgContact_FirstName ?? null,
      lastName: contact.OrgContact_LastName ?? null,
      name: name || "Unnamed contact",
      initials: initials(name || "Unknown contact"),
      email: contactEmails[0]?.OrgContactEmail_Email ?? emailIdentity?.CommIdentity_Address ?? null,
      phone: phoneIdentity?.CommIdentity_Address ?? (metadata.phone as string | undefined) ?? null,
      jobTitle: (metadata.jobTitle as string | undefined) ?? null,
      department: (metadata.department as string | undefined) ?? null,
      location: [address?.OrgAdd_TownCity, address?.OrgAdd_Country].filter(Boolean).join(", ") || null,
      role: profile?.CRMContact_RoleCode ?? null,
      influenceLevel: profile?.CRMContact_InfluenceLevel ?? null,
      relationshipStrength: profile?.CRMContact_RelationshipStrength ?? null,
      preferredChannel: profile?.CRMContact_PreferredChannelCode ?? null,
      preferredLanguage: profile?.CRMContact_PreferredLanguageCode ?? null,
      consentSalesContact: Boolean(profile?.CRMContact_ConsentSalesContact),
      consentMarketing: Boolean(contact.OrgContact_MarketingOptIn ?? profile?.CRMContact_ConsentMarketing),
      marketingConsentSource: contact.OrgContact_MarketingConsentSource ?? null,
      marketingConsentUpdatedAt: contact.OrgContact_MarketingConsentUpdatedAt ?? null,
      lastContactAt: profile?.CRMContact_LastContactAt ?? null,
      notes: profile?.CRMContact_Notes ?? null,
      trainingAllowed: Boolean(profile?.CRMContact_IsTrainingAllowed),
      editVersion: profile?.CRMContact_EditVersion ?? 1,
      metadata,
      ...(includeDetailSource ? { __detailSource: { profile: profile ?? null } } : {}),
    }
  }).filter((item: Row) => !term || [item.name, item.email, item.phone, item.accountName, item.role, item.jobTitle, item.department].some((value) => value?.toLowerCase().includes(term)))
}

async function recentEmails(admin: any, userId: string, permissions: string[], accountId: string, contactIds: string[], contactEmails: string[] = [], includeAccountThreads = true) {
  if (!permissions.includes("Email.Read")) return { available: false, items: [] }
  const normalizedEmails = [...new Set(contactEmails.map((value) => value.trim().toLowerCase()).filter(Boolean))]
  const { data, error } = await admin.rpc("multideck_crm_customer_recent_emails", {
    p_user_id: userId,
    p_account_id: accountId,
    p_contact_ids: contactIds,
    p_contact_emails: normalizedEmails,
    p_include_account_threads: includeAccountThreads,
    p_limit: 12,
  })
  if (error) throw new HttpError(500, error.message)
  const result = objectValue(data)
  return {
    available: result.available !== false,
    items: Array.isArray(result.items) ? result.items : [],
  }
}

async function accountDetail(admin: any, companyId: string, userId: string, permissions: string[], id: string) {
  const summaryWithSource = (await customerRows(admin, companyId, null, id, true, undefined, userId))[0]
  if (!summaryWithSource) throw new HttpError(404, "Account not found.")
  const { __detailSource, ...summary } = summaryWithSource
  const { org, address, profile } = __detailSource
  const [shipmentResult, engagementResult, contactList] = await Promise.all([
    admin.from("Job_ShipmentSummary").select("*").eq("Job_Customer", id).neq("Job_Status", "Closed").order("Job_PredictedDeliveryAt").limit(12),
    admin.from("CRM_CustomerEngagementPreferences").select("*").eq("CRMCustEngPref_CustomerOrgID", id).order("CRMCustEngPref_UpdatedAt", { ascending: false }).limit(1),
    contactRows(admin, companyId, null, id, null, false, undefined, userId, 20),
  ])
  const detailError = [shipmentResult, engagementResult].find((result) => result.error)?.error
  if (detailError) throw new HttpError(500, detailError.message)
  const shipments = shipmentResult.data
  const engagement = engagementResult.data
  const accountId = profile?.CRMAccount_ID ?? null
  const contactIds = contactList.map((contact: Row) => contact.id)
  const contactEmails = contactList.map((contact: Row) => contact.email).filter(Boolean)
  const [{ data: activities, error: activityError }, emailResult] = await Promise.all([
    accountId
      ? admin.from("CRM_Activities").select("*").eq("CRMActivity_AccountID", accountId).eq("CRMActivity_IsDeleted", false).order("CRMActivity_ActivityAt", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    recentEmails(admin, userId, permissions, id, contactIds, contactEmails),
  ])
  if (activityError) throw new HttpError(500, activityError.message)
  const preference = engagement?.[0] ?? null
  return {
    ...summary,
    customerSince: profile?.CRMAccount_CreatedAt ?? org.Org_CRMUpdatedAt,
    status: profile?.CRMAccount_RelationshipStatusCode ?? org.Org_CRMRelationshipStatusCode ?? "active_customer",
    tier: profile?.CRMAccount_Tier ?? null,
    segment: profile?.CRMAccount_Segment ?? null,
    vertical: profile?.CRMAccount_Vertical ?? null,
    primaryMode: profile?.CRMAccount_PrimaryModeCode ?? null,
    primaryTradeLane: profile?.CRMAccount_PrimaryTradeLane ?? null,
    growthState: profile?.CRMAccount_GrowthState ?? null,
    healthScore: profile?.CRMAccount_HealthScore ?? null,
    churnRiskScore: profile?.CRMAccount_ChurnRiskScore ?? null,
    lifetimeValue: profile?.CRMAccount_LifetimeValueAmount ?? null,
    currencyCode: profile?.CRMAccount_LifetimeValueCurrencyCode ?? null,
    summary: profile?.CRMAccount_CustomerCentricSummary ?? null,
    strategic: Boolean(profile?.CRMAccount_IsStrategic),
    trainingAllowed: Boolean(profile?.CRMAccount_IsTrainingAllowed),
    metadata: objectValue(profile?.CRMAccount_MetadataJSON),
    address: address ? {
      id: address.OrgAdd_ID,
      line1: address.OrgAdd_Line1 ?? null,
      line2: address.OrgAdd_Line2 ?? null,
      townCity: address.OrgAdd_TownCity ?? null,
      countyState: address.OrgAdd_CountyState ?? null,
      postZipCode: address.OrgAdd_PostZipCode ?? null,
      countryCode: address.OrgAdd_Country ?? null,
      mainEmail: address.OrgAdd_MainEmail ?? null,
      mainPhone: address.OrgAdd_MainPhone ?? null,
    } : null,
    engagement: preference ? {
      preferredChannel: preference.CRMCustEngPref_PreferredChannelCode ?? null,
      allowThankYouMessages: Boolean(preference.CRMCustEngPref_AllowThankYouMessages),
      allowFollowupMessages: Boolean(preference.CRMCustEngPref_AllowFollowupMessages),
      allowWhatsApp: Boolean(preference.CRMCustEngPref_AllowWhatsApp),
      doNotOverContact: Boolean(preference.CRMCustEngPref_DoNotOverContact),
      minHoursBetweenNonUrgentMessages: preference.CRMCustEngPref_MinHoursBetweenNonUrgentMessages ?? 24,
      notes: preference.CRMCustEngPref_Notes ?? null,
    } : null,
    contacts: contactList,
    activeShipments: (shipments ?? []).map((item: Row) => ({
      id: item.Job_ID,
      reference: `${item.Job_Period}-${item.Job_Number}`,
      route: [item.Job_OriginNameSnapshot, item.Job_DestinationNameSnapshot].filter(Boolean).join(" → "),
      mode: item.Job_TransportModeSummary,
      status: item.Job_TrackingStatus ?? item.Job_Status,
      eta: item.Job_PredictedDeliveryAt,
      openExceptionCount: item.Job_OpenExceptionCount ?? 0,
    })),
    activities: (activities ?? []).map((item: Row) => ({
      id: item.CRMActivity_ID,
      subject: item.CRMActivity_Subject,
      summary: item.CRMActivity_Summary,
      occurredAt: item.CRMActivity_ActivityAt,
      type: item.CRMActivity_ActivityTypeCode,
    })),
    recentEmails: emailResult,
  }
}

async function contactDetail(admin: any, companyId: string, userId: string, permissions: string[], id: string) {
  const summaryWithSource = (await contactRows(admin, companyId, null, null, id, true, undefined, userId, 1))[0]
  if (!summaryWithSource) throw new HttpError(404, "Contact not found.")
  const { __detailSource, ...summary } = summaryWithSource
  const profile = __detailSource.profile
  const { data: activityResult, error: activityError } = await admin.rpc("multideck_crm_contact_activity_page", {
    p_user_id: userId,
    p_contact_id: id,
    p_limit: 20,
  })
  if (activityError) throw new HttpError(500, activityError.message)
  const activities = Array.isArray(activityResult) ? activityResult : []
  const { data: consents, error: consentError } = await admin.from("Comm_ConsentPreferences").select("*").eq("CommConsent_ContactID", id).eq("CommConsent_ChannelCode", "email").order("CommConsent_EffectiveAt", { ascending: false }).limit(12)
  if (consentError) throw new HttpError(500, consentError.message)
  return {
    ...summary,
    metadata: objectValue(profile?.CRMContact_MetadataJSON),
    consentHistory: (consents ?? []).map((item: Row) => ({
      id: item.CommConsent_ID,
      status: item.CommConsent_StatusCode,
      lawfulBasis: item.CommConsent_LawfulBasis,
      source: item.CommConsent_Source,
      reason: item.CommConsent_Reason,
      effectiveAt: item.CommConsent_EffectiveAt,
    })),
    activities,
    recentEmails: await recentEmails(admin, userId, permissions, summary.accountId, [id], summary.email ? [summary.email] : [], false),
  }
}

async function updateAccount(admin: any, current: Row, permissions: string[], id: string, payload: Row) {
  const name = normalize(payload.name)
  if (!name) throw new HttpError(400, "Enter an account name.")
  const address = objectValue(payload.address)
  countryCode(address.countryCode)
  const { error } = await admin.rpc("multideck_crm_update_account", {
    p_actor_user_id: current.User_ID,
    p_account_id: id,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: payload,
  })
  if (error) throw crmWriteError(error, "The account could not be saved.")
  return accountDetail(admin, current.Company_ID, current.User_ID, permissions, id)
}

async function updateContact(admin: any, current: Row, permissions: string[], id: string, payload: Row) {
  const firstName = normalize(payload.firstName)
  const lastName = normalize(payload.lastName)
  if (!firstName && !lastName) throw new HttpError(400, "Enter the contact's name.")
  const { error } = await admin.rpc("multideck_crm_update_contact", {
    p_actor_user_id: current.User_ID,
    p_contact_id: id,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: payload,
  })
  if (error) throw crmWriteError(error, "The contact could not be saved.")
  return contactDetail(admin, current.Company_ID, current.User_ID, permissions, id)
}

function crmWriteError(error: any, fallback: string): HttpError {
  if (error?.code === "P0001" || String(error?.message ?? "").startsWith("CRM_CONFLICT:")) {
    return new HttpError(409, "This record changed while you were editing it. Reload it before saving again.")
  }
  if (error?.code === "23505") return new HttpError(409, error.message || "That CRM record already exists.")
  if (error?.code === "P0002") return new HttpError(404, error.message || "The CRM record could not be found.")
  if (error?.code === "22023" || error?.code === "22P02") return new HttpError(400, error.message || fallback)
  return new HttpError(500, error?.message || fallback)
}

function expectedVersion(value: unknown): number | null {
  if (value == null || value === "") return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, "The record version is invalid.")
  return parsed
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user, token } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "customers")
    const userDb = authenticatedClient(token)

    if (request.method === "GET") {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Read")
      if (parts[0] === "reference") {
        const [{ data: organisationTypes, error }, { data: relationshipStatuses, error: relationshipError }] = await Promise.all([
          admin.from("Org_Types").select("OrgType_ID,OrgType_Name").order("OrgType_Order").order("OrgType_Name"),
          admin.from("sys_CRMRelationshipStatuses").select("CRMRelStatus_Code,CRMRelStatus_Name").eq("CRMRelStatus_IsActive", true).order("CRMRelStatus_SortOrder"),
        ])
        if (error || relationshipError) throw new HttpError(500, (error ?? relationshipError)?.message ?? "The CRM reference data could not be loaded.")
        return json(request, {
          organisationTypes: (organisationTypes ?? []).map((item: Row) => ({ id: item.OrgType_ID, name: item.OrgType_Name })),
          // Kept for rollout compatibility with older clients. Account owner
          // filters now come from the bounded register facets instead.
          owners: [],
          relationshipStatuses: (relationshipStatuses ?? []).map((item: Row) => ({ code: item.CRMRelStatus_Code, name: item.CRMRelStatus_Name })),
        })
      }
      if (parts[0] === "directory") {
        const params = new URL(request.url).searchParams
        const { data, error } = await userDb.rpc("multideck_customer_directory_page", {
          p_scope: params.get("scope") || "all",
          p_status: params.get("status") || "All",
          p_limit: Number(params.get("limit") || 20),
          p_offset: Number(params.get("offset") || 0),
        })
        if (error) throw new HttpError(error.code === "42501" ? 403 : 500, error.message)
        const payload = objectValue(data)
        const ids = Array.isArray(payload.ids) ? payload.ids.filter((value): value is string => typeof value === "string") : []
        const rows = await customerRows(admin, current.Company_ID, null, null, false, ids)
        const rowMap = new Map(rows.map((row: Row) => [row.id, row]))
        return json(request, { ...payload, rows: ids.flatMap((id) => rowMap.get(id) ? [rowMap.get(id)] : []) })
      }
      if (parts[0] === "contacts" && parts[1]) return json(request, await contactDetail(admin, current.Company_ID, current.User_ID, permissions, parts[1]))
      if (parts[0] === "contacts") {
        const params = new URL(request.url).searchParams
        if (params.has("limit")) {
          const { data, error } = await userDb.rpc("multideck_crm_contact_register_page", {
            p_search: params.get("search"),
            p_consent_scope: params.get("consentScope"),
            p_account_id: params.get("accountId") || null,
            p_channel: params.get("channel"),
            p_sort: params.get("sort") || "contact",
            p_direction: params.get("direction") || "asc",
            p_limit: Number(params.get("limit") || 50),
            p_offset: Number(params.get("offset") || 0),
          })
          if (error) throw new HttpError(error.code === "42501" ? 403 : 500, error.message)
          const payload = objectValue(data)
          const ids = Array.isArray(payload.ids) ? payload.ids.filter((value): value is string => typeof value === "string") : []
          const rows = await contactRows(admin, current.Company_ID, null, null, null, false, ids)
          const rowMap = new Map(rows.map((row: Row) => [row.id, row]))
          return json(request, { ...payload, rows: ids.flatMap((id) => rowMap.get(id) ? [rowMap.get(id)] : []) })
        }
        throw new HttpError(400, "Contact lists require bounded paging.")
      }
      if (parts[0]) return json(request, await accountDetail(admin, current.Company_ID, current.User_ID, permissions, parts[0]))
      const params = new URL(request.url).searchParams
      if (params.has("limit")) {
        const owner = params.get("owner")
        const { data, error } = await userDb.rpc("multideck_crm_account_register_page", {
          p_search: params.get("search"),
          p_marketing_scope: params.get("marketingScope"),
          p_relationship: params.get("relationship"),
          p_owner_id: owner && owner !== "__unassigned__" ? owner : null,
          p_unassigned: owner === "__unassigned__",
          p_sort: params.get("sort") || "account",
          p_direction: params.get("direction") || "asc",
          p_limit: Number(params.get("limit") || 50),
          p_offset: Number(params.get("offset") || 0),
        })
        if (error) throw new HttpError(error.code === "42501" ? 403 : 500, error.message)
        const payload = objectValue(data)
        const ids = Array.isArray(payload.ids) ? payload.ids.filter((value): value is string => typeof value === "string") : []
        const rows = await customerRows(admin, current.Company_ID, null, null, false, ids)
        const rowMap = new Map(rows.map((row: Row) => [row.id, row]))
        return json(request, { ...payload, rows: ids.flatMap((id) => rowMap.get(id) ? [rowMap.get(id)] : []) })
      }
      throw new HttpError(400, "Account lists require bounded paging.")
    }

    if (request.method === "PATCH") {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Write")
      if (parts[0] === "contacts" && parts[1]) return json(request, await updateContact(admin, current, permissions, parts[1], await body<Row>(request)))
      if (parts.length === 1) return json(request, await updateAccount(admin, current, permissions, parts[0], await body<Row>(request)))
    }

    if (request.method === "POST" && !parts.length) {
      await requirePermission(admin, current.User_ID, "Customers.Write")
      const payload = await body<Row>(request)
      const name = normalize(payload.name)
      if (!name) throw new HttpError(400, "Enter an account name.")
      countryCode(payload.countryCode)
      const { data, error } = await admin.rpc("multideck_crm_create_account", {
        p_actor_user_id: current.User_ID,
        p_input: payload,
      })
      if (error) throw crmWriteError(error, "The account could not be created.")
      const id = String(data?.id ?? "")
      if (!id) throw new HttpError(500, "The account was created but could not be opened.")
      return json(request, (await customerRows(admin, current.Company_ID, null, id, false, undefined, current.User_ID))[0], 201)
    }

    if (request.method === "POST" && parts.length === 2 && parts[1] === "contacts") {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Write")
      const customerId = parts[0]
      const payload = await body<Row>(request)
      const email = normalize(payload.email)?.toLowerCase()
      const firstName = normalize(payload.firstName)
      const lastName = normalize(payload.lastName)
      if (!email) throw new HttpError(400, "Enter a contact email address.")
      if (!firstName && !lastName) throw new HttpError(400, "Enter the contact's name.")
      const { data, error } = await admin.rpc("multideck_crm_create_contact", {
        p_actor_user_id: current.User_ID,
        p_account_id: customerId,
        p_input: payload,
      })
      if (error) throw crmWriteError(error, "The contact could not be created.")
      return json(request, { id: data?.id, accountId: customerId, firstName, lastName, email, editVersion: data?.editVersion ?? 1 }, 201)
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (error) {
    return failure(request, error)
  }
})
