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
type OrganisationType = "company" | "customer" | "supplier"

const organisationFilterFields = new Set([
  "any", "name", "accountCode", "organisationTypes", "address", "country",
  "contact", "contactEmail", "owner", "relationship", "lastContactAt",
])
const organisationFilterOperators = new Set([
  "contains", "not-contains", "is", "is-not", "starts-with", "is-empty",
  "is-not-empty", "on", "before", "after", "between",
])

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function organisationFilterQuery(value: string | null) {
  if (!value) return null
  if (value.length > 12_000) throw new HttpError(400, "Use fewer advanced filter conditions.")
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new HttpError(400, "The advanced filter is not valid.")
  }
  const query = objectValue(parsed)
  const groups = Array.isArray(query.groups) ? query.groups : []
  if (!groups.length || groups.length > 6) throw new HttpError(400, "Use between 1 and 6 advanced filter groups.")
  let conditionCount = 0
  const safeGroups = groups.map((candidate) => {
    const group = objectValue(candidate)
    const conditions = Array.isArray(group.conditions) ? group.conditions : []
    if (!conditions.length || conditions.length > 8) throw new HttpError(400, "Use between 1 and 8 conditions in each filter group.")
    conditionCount += conditions.length
    return {
      id: normalize(group.id),
      match: group.match === "any" ? "any" : "all",
      conditions: conditions.map((item) => {
        const condition = objectValue(item)
        const field = normalize(condition.field)
        const operator = normalize(condition.operator)
        if (!field || !organisationFilterFields.has(field) || !operator || !organisationFilterOperators.has(operator)) {
          throw new HttpError(400, "The advanced filter contains an unsupported field or condition.")
        }
        const filterValue = normalize(condition.value) ?? ""
        const valueTo = normalize(condition.valueTo) ?? ""
        if (filterValue.length > 240 || valueTo.length > 240) throw new HttpError(400, "An advanced filter value is too long.")
        return { id: normalize(condition.id), field, operator, value: filterValue, valueTo }
      }),
    }
  })
  if (conditionCount > 24) throw new HttpError(400, "Use no more than 24 advanced filter conditions.")
  return { match: query.match === "any" ? "any" : "all", groups: safeGroups }
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

function organisationTypeIds(value: unknown, allowEmpty = false) {
  if (!Array.isArray(value)) throw new HttpError(400, "Choose at least one company type.")
  const ids = [...new Set(value.map((item) => normalize(item)).filter((item): item is string => Boolean(item)))]
  if (!allowEmpty && !ids.length) throw new HttpError(400, "Choose at least one company type.")
  if (ids.length > 12) throw new HttpError(400, "Choose no more than 12 company types.")
  return ids
}

async function validateOrganisationTypeIds(admin: any, value: unknown, allowEmpty = false) {
  const ids = organisationTypeIds(value, allowEmpty)
  if (!ids.length) return ids
  const { data, error } = await admin.from("Org_Types").select("OrgType_ID").in("OrgType_ID", ids)
  if (error) throw new HttpError(500, error.message)
  if ((data ?? []).length !== ids.length) throw new HttpError(400, "Choose valid company types.")
  return ids
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

async function customerRows(admin: any, companyId: string, search?: string | null, accountId?: string | null, includeDetailSource = false, scopedIdsOverride?: string[], actorUserId?: string, organisationType: OrganisationType | "any" = "company") {
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
  const matchingIds = [...linksByOrg.entries()]
    .filter(([, names]) => organisationType === "any" || names.some((name) => name.toLowerCase() === organisationType))
    .map(([id]) => id)

  let query = admin.from("Org_Master").select("*").in("Org_id", scopedIds).order("Org_Name")
  if (organisationType === "customer") {
    query = matchingIds.length
      ? query.or(`Org_CRMIsPotentialCustomer.eq.true,Org_id.in.(${matchingIds.join(",")})`)
      : query.eq("Org_CRMIsPotentialCustomer", true)
  } else if (organisationType === "supplier") {
    if (!matchingIds.length) return []
    query = query.in("Org_id", matchingIds)
  }
  const { data: organisations, error } = await query
  if (error) throw new HttpError(500, error.message)

  const ids = (organisations ?? []).map((item: Row) => item.Org_id)
  const [{ data: addresses, error: addressError }, { data: contactCountsResult, error: contactCountError }, { data: profiles, error: profileError }] = await Promise.all([
    ids.length ? admin.from("Org_Addresses").select("*").in("Org_ID", ids).eq("OrgAdd_IsActive", true) : Promise.resolve({ data: [], error: null }),
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
      industry: profile?.CRMAccount_Vertical ?? typeNames.find((name) => !["customer", "supplier"].includes(name.toLowerCase())) ?? (organisationType === "supplier" ? "Supplier" : organisationType === "customer" ? "Customer" : "Company"),
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
      accountCode: org.Org_AccCode ?? null,
      scopeCode: profile?.CRMAccount_ScopeCode ?? "standard",
      isPotential: Boolean(org.Org_CRMIsPotentialCustomer),
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
    contactIds.length ? admin.from("OrgContact_Emails").select("*").in("OrgContact_ID", contactIds).eq("OrgContactEmail_IsActive", true).order("OrgContactEmail_IsPrimary", { ascending: false }).order("OrgContactEmail_ValidFrom", { ascending: false }) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from("CRM_ContactProfiles").select("*").in("CRMContact_OrgContactID", contactIds) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from("Comm_Identities").select("*").in("CommIdentity_ContactID", contactIds).eq("CommIdentity_IsDeleted", false) : Promise.resolve({ data: [] }),
    orgIds.length ? admin.from("Org_Addresses").select("Org_ID,OrgAdd_TownCity,OrgAdd_Country").in("Org_ID", orgIds).eq("OrgAdd_IsActive", true) : Promise.resolve({ data: [] }),
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

async function organisationFoundation(admin: any, organisationId: string, profile: Row | null) {
  const [addressResult, officeAssignmentResult, relatedDefaultResult, addressTypeResult] = await Promise.all([
    admin.from("Org_Addresses").select("*").eq("Org_ID", organisationId).eq("OrgAdd_IsActive", true).order("Org_NameOverride").order("OrgAdd_TownCity"),
    profile?.CRMAccount_ID
      ? admin.from("CRM_AccountOfficeAssignments").select("*").eq("CRMAccountOffice_AccountID", profile.CRMAccount_ID).order("CRMAccountOffice_IsPrimary", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin.from("Org_RelatedPartyDefaults").select("*").eq("OrgRelatedDefault_SourceOrgID", organisationId).order("OrgRelatedDefault_Priority"),
    admin.from("sys_AddressTypes").select("*").eq("sys_AddressType_IsActive", true).order("sys_AddressType_SortOrder"),
  ])
  const firstError = [addressResult, officeAssignmentResult, relatedDefaultResult, addressTypeResult].find((result) => result.error)?.error
  if (firstError) throw new HttpError(500, firstError.message)

  const addresses = addressResult.data ?? []
  const assignments = officeAssignmentResult.data ?? []
  const defaults = relatedDefaultResult.data ?? []
  const addressTypes = addressTypeResult.data ?? []
  const addressIds = addresses.map((item: Row) => item.OrgAdd_ID)
  const officeIds = assignments.map((item: Row) => item.CRMAccountOffice_OrgOfficeID)
  const targetOrganisationIds = [...new Set(defaults.map((item: Row) => item.OrgRelatedDefault_TargetOrgID).filter(Boolean))]
  const targetContactIds = [...new Set(defaults.map((item: Row) => item.OrgRelatedDefault_TargetContactID).filter(Boolean))]
  const [capabilityResult, weeklyHoursResult, overrideResult, officeResult, targetOrganisationResult, targetContactResult] = await Promise.all([
    addressIds.length ? admin.from("Org_AddressTypes").select("*").in("OrgAdd_ID", addressIds) : Promise.resolve({ data: [], error: null }),
    addressIds.length ? admin.from("Org_AddressOpeningHours").select("*").in("OrgAddHours_OrgAddID", addressIds).order("OrgAddHours_DayOfWeek").order("OrgAddHours_OpensAt") : Promise.resolve({ data: [], error: null }),
    addressIds.length ? admin.from("Org_AddressOpeningOverrides").select("*").in("OrgAddOverride_OrgAddID", addressIds).gte("OrgAddOverride_Date", new Date().toISOString().slice(0, 10)).order("OrgAddOverride_Date").limit(120) : Promise.resolve({ data: [], error: null }),
    officeIds.length ? admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Code,Office_CountryCode,Office_TimeZone").in("Office_ID", officeIds).eq("Office_IsActive", true) : Promise.resolve({ data: [], error: null }),
    targetOrganisationIds.length ? admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode").in("Org_id", targetOrganisationIds) : Promise.resolve({ data: [], error: null }),
    targetContactIds.length ? admin.from("Org_Contacts").select("OrgContact_ID,OrgContact_FirstName,OrgContact_LastName").in("OrgContact_ID", targetContactIds) : Promise.resolve({ data: [], error: null }),
  ])
  const secondError = [capabilityResult, weeklyHoursResult, overrideResult, officeResult, targetOrganisationResult, targetContactResult].find((result) => result.error)?.error
  if (secondError) throw new HttpError(500, secondError.message)

  const addressTypeMap = new Map(addressTypes.map((item: Row) => [item.sys_AddressType_ID, item]))
  const capabilitiesByAddress = new Map<string, Row[]>()
  const hoursByAddress = new Map<string, Row[]>()
  const overridesByAddress = new Map<string, Row[]>()
  for (const item of capabilityResult.data ?? []) capabilitiesByAddress.set(item.OrgAdd_ID, [...(capabilitiesByAddress.get(item.OrgAdd_ID) ?? []), item])
  for (const item of weeklyHoursResult.data ?? []) hoursByAddress.set(item.OrgAddHours_OrgAddID, [...(hoursByAddress.get(item.OrgAddHours_OrgAddID) ?? []), item])
  for (const item of overrideResult.data ?? []) overridesByAddress.set(item.OrgAddOverride_OrgAddID, [...(overridesByAddress.get(item.OrgAddOverride_OrgAddID) ?? []), item])
  const officeMap = new Map((officeResult.data ?? []).map((item: Row) => [item.Office_ID, item]))
  const targetOrganisationMap = new Map((targetOrganisationResult.data ?? []).map((item: Row) => [item.Org_id, item]))
  const targetContactMap = new Map((targetContactResult.data ?? []).map((item: Row) => [item.OrgContact_ID, item]))

  return {
    officeAssignments: assignments.flatMap((assignment: Row) => {
      const office = officeMap.get(assignment.CRMAccountOffice_OrgOfficeID)
      return office ? [{
        officeId: office.Office_ID, name: office.Office_Name, code: office.Office_Code ?? null,
        countryCode: office.Office_CountryCode ?? null, timeZone: office.Office_TimeZone ?? "UTC",
        isPrimary: Boolean(assignment.CRMAccountOffice_IsPrimary),
      }] : []
    }),
    addressCapabilities: addressTypes.map((item: Row) => ({
      id: item.sys_AddressType_ID, code: item.sys_AddressType_Code, name: item.sys_AddressType_Description,
    })),
    addresses: addresses.map((address: Row) => ({
      id: address.OrgAdd_ID,
      name: address.Org_NameOverride ?? null,
      line1: address.OrgAdd_Line1 ?? null,
      line2: address.OrgAdd_Line2 ?? null,
      townCity: address.OrgAdd_TownCity ?? null,
      countyState: address.OrgAdd_CountyState ?? null,
      postZipCode: address.OrgAdd_PostZipCode ?? null,
      countryCode: address.OrgAdd_Country ?? null,
      unlocode: address.OrgAdd_UNLOCODE ?? null,
      email: address.OrgAdd_MainEmail ?? null,
      phone: address.OrgAdd_MainPhone ?? null,
      timeZone: address.OrgAdd_TimeZone ?? "UTC",
      capabilities: (capabilitiesByAddress.get(address.OrgAdd_ID) ?? []).flatMap((link: Row) => {
        const type = addressTypeMap.get(link.OrgAddType_Type)
        return type ? [{ code: type.sys_AddressType_Code, name: type.sys_AddressType_Description, isDefault: Boolean(link.OrgAddType_IsDefault) }] : []
      }),
      weeklyHours: (hoursByAddress.get(address.OrgAdd_ID) ?? []).map((item: Row) => ({
        id: item.OrgAddHours_ID, dayOfWeek: item.OrgAddHours_DayOfWeek,
        opensAt: item.OrgAddHours_OpensAt, closesAt: item.OrgAddHours_ClosesAt, sortOrder: item.OrgAddHours_SortOrder,
      })),
      openingOverrides: (overridesByAddress.get(address.OrgAdd_ID) ?? []).map((item: Row) => ({
        id: item.OrgAddOverride_ID, date: item.OrgAddOverride_Date, isClosed: Boolean(item.OrgAddOverride_IsClosed),
        opensAt: item.OrgAddOverride_OpensAt ?? null, closesAt: item.OrgAddOverride_ClosesAt ?? null, note: item.OrgAddOverride_Note ?? null,
      })),
    })),
    relatedPartyDefaults: defaults.map((item: Row) => {
      const target = targetOrganisationMap.get(item.OrgRelatedDefault_TargetOrgID)
      const contact = targetContactMap.get(item.OrgRelatedDefault_TargetContactID)
      return {
        id: item.OrgRelatedDefault_ID,
        partyRoleCode: item.OrgRelatedDefault_PartyRoleCode,
        destinationCountryCode: item.OrgRelatedDefault_DestinationCountryCode ?? null,
        destinationUnlocode: item.OrgRelatedDefault_DestinationUNLOCODE ?? null,
        destinationPostcode: item.OrgRelatedDefault_DestinationPostcode ?? null,
        targetOrganisationId: item.OrgRelatedDefault_TargetOrgID,
        targetOrganisationName: target?.Org_Name ?? "Unknown organisation",
        targetOrganisationCode: target?.Org_AccCode ?? null,
        targetAddressId: item.OrgRelatedDefault_TargetAddressID ?? null,
        targetContactId: item.OrgRelatedDefault_TargetContactID ?? null,
        targetContactName: contact ? contactName(contact) : null,
        priority: item.OrgRelatedDefault_Priority,
        effectiveFrom: item.OrgRelatedDefault_EffectiveFrom,
        effectiveTo: item.OrgRelatedDefault_EffectiveTo ?? null,
        isActive: Boolean(item.OrgRelatedDefault_IsActive),
      }
    }),
  }
}

async function accountOperations(admin: any, organisationId: string, profile: Row | null) {
  if (!profile?.CRMAccount_ID) return { operations: null }
  const [profileResult, instructionsResult, documentsResult, addressResult] = await Promise.all([
    admin.from("CRM_AccountOperationalProfiles").select("*").eq("CRMAccountOps_AccountID", profile.CRMAccount_ID).maybeSingle(),
    admin.from("CRM_AccountOperationalInstructions").select("*").eq("CRMAccountInstruction_AccountID", profile.CRMAccount_ID).order("CRMAccountInstruction_Priority"),
    admin.from("CRM_AccountDocumentRecords").select("*").eq("CRMAccountDocument_AccountID", profile.CRMAccount_ID).order("CRMAccountDocument_UpdatedAt", { ascending: false }),
    admin.from("Org_AddressOperationalDetails").select("*").eq("OrgAddOperational_OrgID", organisationId),
  ])
  const firstError = [profileResult, instructionsResult, documentsResult, addressResult].find((result) => result.error)?.error
  if (firstError?.code === "42P01" || firstError?.code === "PGRST205") return { operations: null }
  if (firstError) throw new HttpError(500, firstError.message)
  const row = profileResult.data
  return { operations: {
    roleProfiles: objectValue(row?.CRMAccountOps_RoleProfilesJSON),
    invoicePreferences: objectValue(row?.CRMAccountOps_InvoicePreferencesJSON),
    customs: objectValue(row?.CRMAccountOps_CustomsJSON),
    privacy: objectValue(row?.CRMAccountOps_PrivacyJSON),
    instructions: (instructionsResult.data ?? []).map((item: Row) => ({ id: item.CRMAccountInstruction_ID, kind: item.CRMAccountInstruction_KindCode, title: item.CRMAccountInstruction_Title, body: item.CRMAccountInstruction_Body, destinationCountryCode: item.CRMAccountInstruction_DestinationCountryCode, destinationUnlocode: item.CRMAccountInstruction_DestinationUNLOCODE, addressId: item.CRMAccountInstruction_AddressID, contactId: item.CRMAccountInstruction_ContactID, priority: item.CRMAccountInstruction_Priority, effectiveFrom: item.CRMAccountInstruction_EffectiveFrom, effectiveTo: item.CRMAccountInstruction_EffectiveTo, isActive: item.CRMAccountInstruction_IsActive })),
    documents: (documentsResult.data ?? []).map((item: Row) => ({ id: item.CRMAccountDocument_ID, type: item.CRMAccountDocument_TypeCode, title: item.CRMAccountDocument_Title, notes: item.CRMAccountDocument_Notes, representationType: item.CRMAccountDocument_RepresentationType, sourceDocumentId: item.CRMAccountDocument_SourceDocumentID, externalReference: item.CRMAccountDocument_ExternalReference, validFrom: item.CRMAccountDocument_ValidFrom, validTo: item.CRMAccountDocument_ValidTo, status: item.CRMAccountDocument_StatusCode })),
    addressOperations: (addressResult.data ?? []).map((item: Row) => ({ addressId: item.OrgAddOperational_OrgAddID, appointmentRequired: item.OrgAddOperational_AppointmentRequired, advanceBookingHours: item.OrgAddOperational_AdvanceBookingHours, bookingInstructions: item.OrgAddOperational_BookingInstructions, collectionInstructions: item.OrgAddOperational_CollectionInstructions, deliveryInstructions: item.OrgAddOperational_DeliveryInstructions })),
  }}
}

async function accountDetail(admin: any, companyId: string, userId: string, permissions: string[], id: string) {
  const summaryWithSource = (await customerRows(admin, companyId, null, id, true, undefined, userId, "any"))[0]
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
  const [{ data: activities, error: activityError }, emailResult, foundation, operations] = await Promise.all([
    accountId
      ? admin.from("CRM_Activities").select("*").eq("CRMActivity_AccountID", accountId).eq("CRMActivity_IsDeleted", false).order("CRMActivity_ActivityAt", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    recentEmails(admin, userId, permissions, id, contactIds, contactEmails),
    organisationFoundation(admin, id, profile ?? null),
    accountOperations(admin, id, profile ?? null),
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
    accountCode: org.Org_AccCode ?? null,
    scopeCode: profile?.CRMAccount_ScopeCode ?? "standard",
    isPotential: Boolean(org.Org_CRMIsPotentialCustomer),
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
    ...foundation,
    ...operations,
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
  const [consentResult, employmentResult, emailHistoryResult] = await Promise.all([
    admin.from("Comm_ConsentPreferences").select("*").eq("CommConsent_ContactID", id).eq("CommConsent_ChannelCode", "email").order("CommConsent_EffectiveAt", { ascending: false }).limit(12),
    admin.from("CRM_ContactOrganisationAssignments").select("*").eq("CRMContactOrg_ContactID", id).order("CRMContactOrg_StartedAt", { ascending: false }).limit(50),
    admin.from("OrgContact_Emails").select("*").eq("OrgContact_ID", id).order("OrgContactEmail_ValidFrom", { ascending: false }).limit(50),
  ])
  const historyError = [consentResult, employmentResult, emailHistoryResult].find((result) => result.error)?.error
  if (historyError) throw new HttpError(500, historyError.message)
  const employmentOrganisationIds = [...new Set((employmentResult.data ?? []).map((item: Row) => item.CRMContactOrg_OrgID))]
  const { data: employmentOrganisations, error: employmentOrganisationError } = employmentOrganisationIds.length
    ? await admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode").in("Org_id", employmentOrganisationIds)
    : { data: [], error: null }
  if (employmentOrganisationError) throw new HttpError(500, employmentOrganisationError.message)
  const employmentOrganisationMap = new Map((employmentOrganisations ?? []).map((item: Row) => [item.Org_id, item]))
  const consents = consentResult.data
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
    employmentHistory: (employmentResult.data ?? []).map((item: Row) => {
      const organisation = employmentOrganisationMap.get(item.CRMContactOrg_OrgID)
      return {
        id: item.CRMContactOrg_ID,
        organisationId: item.CRMContactOrg_OrgID,
        organisationName: organisation?.Org_Name ?? "Unknown organisation",
        organisationCode: organisation?.Org_AccCode ?? null,
        jobTitle: item.CRMContactOrg_JobTitle ?? null,
        department: item.CRMContactOrg_Department ?? null,
        role: item.CRMContactOrg_RoleCode ?? null,
        startedAt: item.CRMContactOrg_StartedAt,
        endedAt: item.CRMContactOrg_EndedAt ?? null,
        isCurrent: Boolean(item.CRMContactOrg_IsCurrent),
      }
    }),
    emailHistory: (emailHistoryResult.data ?? []).map((item: Row) => ({
      id: item.OrgContactEmail_ID,
      email: item.OrgContactEmail_Email,
      isActive: Boolean(item.OrgContactEmail_IsActive),
      isPrimary: Boolean(item.OrgContactEmail_IsPrimary),
      validFrom: item.OrgContactEmail_ValidFrom,
      validTo: item.OrgContactEmail_ValidTo ?? null,
      supersededById: item.OrgContactEmail_SupersededBy ?? null,
    })),
  }
}

async function updateAccount(admin: any, current: Row, permissions: string[], id: string, payload: Row) {
  const name = normalize(payload.name)
  if (!name) throw new HttpError(400, "Enter an account name.")
  if (Object.hasOwn(payload, "orgTypeIds")) payload.orgTypeIds = await validateOrganisationTypeIds(admin, payload.orgTypeIds, true)
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

async function updateAccountTypes(admin: any, current: Row, id: string, payload: Row) {
  const name = normalize(payload.name)
  if (!name) throw new HttpError(400, "Enter an account name.")
  const orgTypeIds = await validateOrganisationTypeIds(admin, payload.orgTypeIds, true)
  const { data, error } = await admin.rpc("multideck_crm_update_account", {
    p_actor_user_id: current.User_ID,
    p_account_id: id,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: { name, orgTypeIds },
  })
  if (error) throw crmWriteError(error, "The company types could not be saved.")
  return {
    id: normalize(data?.id) ?? id,
    editVersion: Number(data?.editVersion ?? payload.expectedVersion),
    orgTypeIds,
  }
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

async function updateOrganisationFoundation(admin: any, current: Row, permissions: string[], id: string, payload: Row) {
  const scopeCode = normalize(payload.scopeCode)?.toLowerCase() ?? "standard"
  if (!["standard", "national", "global"].includes(scopeCode)) throw new HttpError(400, "Choose a standard, national or global organisation scope.")
  const accountCode = normalize(payload.accountCode)
  if (!accountCode) throw new HttpError(400, "Enter an organisation code.")
  if (Object.hasOwn(payload, "officeAssignments")) {
    if (!Array.isArray(payload.officeAssignments) || payload.officeAssignments.length > 20) throw new HttpError(400, "Choose no more than 20 responsible offices.")
    payload.officeAssignments = payload.officeAssignments.map((item) => {
      const value = objectValue(item)
      const officeId = normalize(value.officeId)
      if (!officeId) throw new HttpError(400, "Choose valid responsible offices.")
      return { officeId, isPrimary: value.isPrimary === true }
    })
  }
  const { error } = await admin.rpc("multideck_crm_update_organisation_foundation", {
    p_actor_user_id: current.User_ID,
    p_account_id: id,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: { ...payload, scopeCode, accountCode },
  })
  if (error) throw crmWriteError(error, "The organisation setup could not be saved.")
  return accountDetail(admin, current.Company_ID, current.User_ID, permissions, id)
}

function addressInput(payload: Row) {
  const capabilities = Array.isArray(payload.capabilities) ? payload.capabilities.map((item) => {
    const value = objectValue(item)
    const code = normalize(value.code)?.toLowerCase()
    if (!code) throw new HttpError(400, "Choose valid address capabilities.")
    return { code, isDefault: value.isDefault === true }
  }) : []
  const weeklyHours = Array.isArray(payload.weeklyHours) ? payload.weeklyHours : []
  const openingOverrides = Array.isArray(payload.openingOverrides) ? payload.openingOverrides : []
  return { ...payload, countryCode: countryCode(payload.countryCode), capabilities, weeklyHours, openingOverrides }
}

async function upsertOrganisationAddress(admin: any, current: Row, permissions: string[], accountId: string, addressId: string | null, payload: Row) {
  const { error } = await admin.rpc("multideck_crm_upsert_organisation_address", {
    p_actor_user_id: current.User_ID,
    p_account_id: accountId,
    p_address_id: addressId,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: addressInput(payload),
  })
  if (error) throw crmWriteError(error, "The address could not be saved.")
  return accountDetail(admin, current.Company_ID, current.User_ID, permissions, accountId)
}

async function archiveOrganisationAddress(admin: any, current: Row, permissions: string[], accountId: string, addressId: string, version: unknown) {
  const { error } = await admin.rpc("multideck_crm_archive_organisation_address", {
    p_actor_user_id: current.User_ID,
    p_account_id: accountId,
    p_address_id: addressId,
    p_expected_version: expectedVersion(version),
  })
  if (error) throw crmWriteError(error, "The address could not be archived.")
  return accountDetail(admin, current.Company_ID, current.User_ID, permissions, accountId)
}

async function transferContact(admin: any, current: Row, permissions: string[], contactId: string, payload: Row) {
  const targetOrganisationId = normalize(payload.targetOrganisationId)
  if (!targetOrganisationId) throw new HttpError(400, "Choose the contact's new organisation.")
  const { error } = await admin.rpc("multideck_crm_transfer_contact", {
    p_actor_user_id: current.User_ID,
    p_contact_id: contactId,
    p_target_org_id: targetOrganisationId,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: payload,
  })
  if (error) throw crmWriteError(error, "The contact could not be transferred.")
  return contactDetail(admin, current.Company_ID, current.User_ID, permissions, contactId)
}

async function upsertRelatedPartyDefault(admin: any, current: Row, permissions: string[], accountId: string, ruleId: string | null, payload: Row) {
  const { error } = await admin.rpc("multideck_crm_upsert_related_party_default", {
    p_actor_user_id: current.User_ID,
    p_source_org_id: accountId,
    p_rule_id: ruleId,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: payload,
  })
  if (error) throw crmWriteError(error, "The related-party default could not be saved.")
  return accountDetail(admin, current.Company_ID, current.User_ID, permissions, accountId)
}

async function replaceAccountOperations(admin: any, current: Row, permissions: string[], accountId: string, payload: Row) {
  const { error } = await admin.rpc("multideck_crm_replace_account_operations", {
    p_actor_user_id: current.User_ID,
    p_org_id: accountId,
    p_expected_version: expectedVersion(payload.expectedVersion),
    p_input: payload,
  })
  if (error) throw crmWriteError(error, "The account operational details could not be saved.")
  return accountDetail(admin, current.Company_ID, current.User_ID, permissions, accountId)
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
        const [{ data: organisationTypes, error }, { data: relationshipStatuses, error: relationshipError }, { data: offices, error: officeError }] = await Promise.all([
          admin.from("Org_Types").select("OrgType_ID,OrgType_Name").order("OrgType_Order").order("OrgType_Name"),
          admin.from("sys_CRMRelationshipStatuses").select("CRMRelStatus_Code,CRMRelStatus_Name").eq("CRMRelStatus_IsActive", true).order("CRMRelStatus_SortOrder"),
          admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Code,Office_CountryCode,Office_TimeZone").eq("Company_ID", current.Company_ID).eq("Office_IsActive", true).order("Office_Name"),
        ])
        if (error || relationshipError || officeError) throw new HttpError(500, (error ?? relationshipError ?? officeError)?.message ?? "The CRM reference data could not be loaded.")
        return json(request, {
          organisationTypes: (organisationTypes ?? []).map((item: Row) => ({ id: item.OrgType_ID, name: item.OrgType_Name })),
          // Kept for rollout compatibility with older clients. Account owner
          // filters now come from the bounded register facets instead.
          owners: [],
          relationshipStatuses: (relationshipStatuses ?? []).map((item: Row) => ({ code: item.CRMRelStatus_Code, name: item.CRMRelStatus_Name })),
          offices: (offices ?? []).map((item: Row) => ({
            id: item.Office_ID, name: item.Office_Name, code: item.Office_Code ?? null,
            countryCode: item.Office_CountryCode ?? null, timeZone: item.Office_TimeZone ?? "UTC",
          })),
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
      if (parts[0] && parts[1] === "address-options") {
        const params = new URL(request.url).searchParams
        const { data, error } = await userDb.rpc("multideck_crm_organisation_address_options", {
          p_org_id: parts[0],
          p_capability_code: params.get("capability"),
          p_at: params.get("at") || new Date().toISOString(),
        })
        if (error) throw new HttpError(error.code === "42501" ? 403 : 500, error.message)
        return json(request, data)
      }
      if (parts[0] && parts[1] === "related-defaults" && parts[2] === "resolve") {
        const params = new URL(request.url).searchParams
        const role = normalize(params.get("role"))
        if (!role) throw new HttpError(400, "Choose a related-party role.")
        const { data, error } = await userDb.rpc("multideck_crm_resolve_related_party_default", {
          p_source_org_id: parts[0],
          p_party_role_code: role,
          p_destination_country_code: params.get("country"),
          p_destination_unlocode: params.get("unlocode"),
          p_destination_postcode: params.get("postcode"),
          p_on_date: params.get("onDate") || new Date().toISOString().slice(0, 10),
        })
        if (error) throw new HttpError(error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500, error.message)
        return json(request, data)
      }
      if (parts[0]) return json(request, await accountDetail(admin, current.Company_ID, current.User_ID, permissions, parts[0]))
      const params = new URL(request.url).searchParams
      if (params.has("limit")) {
        const organisationType = normalize(params.get("organisationType"))?.toLowerCase() ?? ""
        if (organisationType !== "company" && organisationType !== "customer" && organisationType !== "supplier") {
          throw new HttpError(400, "Choose companies, customers or suppliers.")
        }
        const owner = params.get("owner")
        const { data, error } = await userDb.rpc("multideck_crm_organisation_register_page", {
          p_organisation_type: organisationType,
          p_search: params.get("search"),
          p_marketing_scope: params.get("marketingScope"),
          p_relationship: params.get("relationship"),
          p_owner_id: owner && owner !== "__unassigned__" ? owner : null,
          p_unassigned: owner === "__unassigned__",
          p_filter_query: organisationFilterQuery(params.get("filterQuery")),
          p_sort: params.get("sort") || "account",
          p_direction: params.get("direction") || "asc",
          p_limit: Number(params.get("limit") || 50),
          p_offset: Number(params.get("offset") || 0),
        })
        if (error) throw new HttpError(error.code === "42501" ? 403 : 500, error.message)
        const payload = objectValue(data)
        const ids = Array.isArray(payload.ids) ? payload.ids.filter((value): value is string => typeof value === "string") : []
        const rows = await customerRows(admin, current.Company_ID, null, null, false, ids, undefined, "any")
        const rowMap = new Map(rows.map((row: Row) => [row.id, row]))
        return json(request, { ...payload, rows: ids.flatMap((id) => rowMap.get(id) ? [rowMap.get(id)] : []) })
      }
      throw new HttpError(400, "Organisation lists require bounded paging.")
    }

    if (request.method === "PATCH") {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Write")
      if (parts[0] === "contacts" && parts[1] && parts[2] === "transfer") return json(request, await transferContact(admin, current, permissions, parts[1], await body<Row>(request)))
      if (parts[0] === "contacts" && parts[1]) return json(request, await updateContact(admin, current, permissions, parts[1], await body<Row>(request)))
      if (parts[0] && parts[1] === "types") return json(request, await updateAccountTypes(admin, current, parts[0], await body<Row>(request)))
      if (parts[0] && parts[1] === "foundation") return json(request, await updateOrganisationFoundation(admin, current, permissions, parts[0], await body<Row>(request)))
      if (parts[0] && parts[1] === "addresses" && parts[2]) return json(request, await upsertOrganisationAddress(admin, current, permissions, parts[0], parts[2], await body<Row>(request)))
      if (parts[0] && parts[1] === "related-defaults" && parts[2]) return json(request, await upsertRelatedPartyDefault(admin, current, permissions, parts[0], parts[2], await body<Row>(request)))
      if (parts[0] && parts[1] === "operations") return json(request, await replaceAccountOperations(admin, current, permissions, parts[0], await body<Row>(request)))
      if (parts.length === 1) return json(request, await updateAccount(admin, current, permissions, parts[0], await body<Row>(request)))
    }

    if (request.method === "DELETE" && parts[0] && parts[1] === "addresses" && parts[2]) {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Write")
      const version = new URL(request.url).searchParams.get("expectedVersion")
      return json(request, await archiveOrganisationAddress(admin, current, permissions, parts[0], parts[2], version))
    }

    if (request.method === "POST" && !parts.length) {
      await requirePermission(admin, current.User_ID, "Customers.Write")
      const payload = await body<Row>(request)
      const name = normalize(payload.name)
      if (!name) throw new HttpError(400, "Enter an account name.")
      countryCode(payload.countryCode)
      payload.orgTypeIds = await validateOrganisationTypeIds(admin, payload.orgTypeIds)
      const { data, error } = await admin.rpc("multideck_crm_create_account", {
        p_actor_user_id: current.User_ID,
        p_input: payload,
      })
      if (error) throw crmWriteError(error, "The account could not be created.")
      const id = String(data?.id ?? "")
      if (!id) throw new HttpError(500, "The account was created but could not be opened.")
      return json(request, (await customerRows(admin, current.Company_ID, null, id, false, undefined, current.User_ID, "any"))[0], 201)
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
    if (request.method === "POST" && parts[0] && parts[1] === "addresses" && parts.length === 2) {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Write")
      return json(request, await upsertOrganisationAddress(admin, current, permissions, parts[0], null, await body<Row>(request)), 201)
    }
    if (request.method === "POST" && parts[0] && parts[1] === "related-defaults" && parts.length === 2) {
      const permissions = await requirePermission(admin, current.User_ID, "Customers.Write")
      return json(request, await upsertRelatedPartyDefault(admin, current, permissions, parts[0], null, await body<Row>(request)), 201)
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (error) {
    return failure(request, error)
  }
})
