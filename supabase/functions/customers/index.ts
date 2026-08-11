import {
  authenticate,
  body,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  initials,
  json,
  normalize,
  permissionValues,
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

async function customerRows(admin: any, search?: string | null) {
  const { data: customerTypeLinks, error: linkError } = await admin.from("Org_Master_Type").select("Org_ID,OrgType_ID")
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

  let query = admin.from("Org_Master").select("*").order("Org_Name")
  query = customerIds.length
    ? query.or(`Org_CRMIsPotentialCustomer.eq.true,Org_id.in.(${customerIds.join(",")})`)
    : query.eq("Org_CRMIsPotentialCustomer", true)
  const { data: organisations, error } = await query
  if (error) throw new HttpError(500, error.message)

  const ids = (organisations ?? []).map((item: Row) => item.Org_id)
  const [{ data: addresses, error: addressError }, { data: contacts, error: contactError }, { data: profiles, error: profileError }] = await Promise.all([
    ids.length ? admin.from("Org_Addresses").select("*").in("Org_ID", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("Org_Contacts").select("OrgContact_ID,Org_ID").in("Org_ID", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("CRM_AccountProfiles").select("*").in("CRMAccount_OrgID", ids).eq("CRMAccount_IsDeleted", false) : Promise.resolve({ data: [], error: null }),
  ])
  if (addressError || contactError || profileError) throw new HttpError(500, (addressError ?? contactError ?? profileError).message)

  const ownerIds = [...new Set((profiles ?? []).map((profile: Row) => profile.CRMAccount_OwnerUserID).filter(Boolean))]
  const { data: owners, error: ownerError } = ownerIds.length
    ? await admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email").in("User_ID", ownerIds)
    : { data: [], error: null }
  if (ownerError) throw new HttpError(500, ownerError.message)

  const addressMap = new Map<string, Row>((addresses ?? []).map((item: Row) => [item.Org_ID, item]))
  const profileMap = new Map<string, Row>((profiles ?? []).map((item: Row) => [item.CRMAccount_OrgID, item]))
  const ownerMap = new Map<string, Row>((owners ?? []).map((item: Row) => [item.User_ID, item]))
  const contactCounts = new Map<string, number>()
  for (const item of contacts ?? []) contactCounts.set(item.Org_ID, (contactCounts.get(item.Org_ID) ?? 0) + 1)
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
      marketingOptIn: Boolean(org.Org_MarketingOptIn),
      marketingConsentSource: org.Org_MarketingConsentSource ?? null,
      marketingConsentUpdatedAt: org.Org_MarketingConsentUpdatedAt ?? null,
      types: typeNames,
    }
  }).filter((item: Row) => !term || [item.name, item.location, item.industry, item.ownerName, item.relationshipStatus].some((value) => value?.toLowerCase().includes(term)))
}

async function contactRows(admin: any, search?: string | null, accountId?: string | null) {
  let query = admin.from("Org_Contacts").select("*").order("OrgContact_LastName").order("OrgContact_FirstName")
  if (accountId) query = query.eq("Org_ID", accountId)
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
      metadata,
    }
  }).filter((item: Row) => !term || [item.name, item.email, item.phone, item.accountName, item.role, item.jobTitle, item.department].some((value) => value?.toLowerCase().includes(term)))
}

async function recentEmails(admin: any, userId: string, accountId: string, contactIds: string[], contactEmails: string[] = []) {
  const permissions = await permissionValues(admin, userId)
  if (!permissions.includes("Email.Read")) return { available: false, items: [] }
  const now = new Date().toISOString()
  const { data: access, error: accessError } = await admin.from("Comm_MailboxAccess")
    .select("CommMailboxAccess_MailboxID,CommMailboxAccess_ExpiresAt")
    .eq("CommMailboxAccess_UserID", userId).eq("CommMailboxAccess_CanRead", true).is("CommMailboxAccess_RevokedAt", null)
  if (accessError) throw new HttpError(500, accessError.message)
  const mailboxIds = (access ?? []).filter((row: Row) => !row.CommMailboxAccess_ExpiresAt || row.CommMailboxAccess_ExpiresAt > now).map((row: Row) => row.CommMailboxAccess_MailboxID)
  if (!mailboxIds.length) return { available: true, items: [] }

  const normalizedEmails = [...new Set(contactEmails.map((value) => value.trim().toLowerCase()).filter(Boolean))]
  let participantQuery = admin.from("Comm_MessageRecipients").select("CommRecipient_MessageID")
  if (contactIds.length && normalizedEmails.length) {
    participantQuery = participantQuery.or(`CommRecipient_ContactID.in.(${contactIds.join(",")}),CommRecipient_NormalizedAddress.in.(${normalizedEmails.join(",")})`)
  } else if (contactIds.length) {
    participantQuery = participantQuery.in("CommRecipient_ContactID", contactIds)
  } else if (normalizedEmails.length) {
    participantQuery = participantQuery.in("CommRecipient_NormalizedAddress", normalizedEmails)
  }
  const [{ data: participantRows, error: participantError }, { data: threads, error: threadError }] = await Promise.all([
    contactIds.length || normalizedEmails.length ? participantQuery : Promise.resolve({ data: [], error: null }),
    admin.from("Comm_Threads").select("CommThread_ID").eq("CommThread_CustomerOrgID", accountId).eq("CommThread_IsDeleted", false),
  ])
  if (participantError || threadError) throw new HttpError(500, (participantError ?? threadError).message)
  const threadIds = (threads ?? []).map((row: Row) => row.CommThread_ID)
  const { data: threadMessages, error: threadMessageError } = threadIds.length
    ? await admin.from("Comm_Messages").select("CommMessage_ID").in("CommMessage_ThreadID", threadIds)
    : { data: [], error: null }
  if (threadMessageError) throw new HttpError(500, threadMessageError.message)
  const messageIds = [...new Set([...(participantRows ?? []), ...(threadMessages ?? [])].map((row: Row) => row.CommRecipient_MessageID ?? row.CommMessage_ID).filter(Boolean))]
  if (!messageIds.length) return { available: true, items: [] }

  const { data: messages, error: messageError } = await admin.from("Comm_Messages").select("*")
    .in("CommMessage_ID", messageIds).in("CommMessage_MailboxID", mailboxIds)
    .eq("CommMessage_IsDeleted", false).eq("CommMessage_IsDraft", false).eq("CommMessage_IsSpam", false)
    .order("CommMessage_MessageDate", { ascending: false, nullsFirst: false }).limit(12)
  if (messageError) throw new HttpError(500, messageError.message)
  const selectedIds = (messages ?? []).map((row: Row) => row.CommMessage_ID)
  const { data: recipients, error: recipientError } = selectedIds.length
    ? await admin.from("Comm_MessageRecipients").select("*").in("CommRecipient_MessageID", selectedIds)
    : { data: [], error: null }
  if (recipientError) throw new HttpError(500, recipientError.message)
  const recipientsByMessage = new Map<string, Row[]>()
  for (const recipient of recipients ?? []) recipientsByMessage.set(recipient.CommRecipient_MessageID, [...(recipientsByMessage.get(recipient.CommRecipient_MessageID) ?? []), recipient])

  return {
    available: true,
    items: (messages ?? []).sort((a: Row, b: Row) => new Date(occurredAt(b)).getTime() - new Date(occurredAt(a)).getTime()).map((message: Row) => {
      const messageRecipients = recipientsByMessage.get(message.CommMessage_ID) ?? []
      const external = messageRecipients.find((recipient) => contactIds.includes(recipient.CommRecipient_ContactID))
        ?? messageRecipients.find((recipient) => recipient.CommRecipient_IsExternal)
      return {
        id: message.CommMessage_ID,
        threadId: message.CommMessage_ThreadID,
        direction: message.CommMessage_IsInbound || message.CommMessage_DirectionCode === "inbound" ? "inbound" : "outbound",
        subject: message.CommMessage_Subject || "(No subject)",
        preview: message.CommMessage_IsBodyRedacted ? null : message.CommMessage_BodyPreview ?? null,
        occurredAt: occurredAt(message),
        contactName: external?.CommRecipient_DisplayNameSnapshot ?? null,
        contactEmail: external?.CommRecipient_Address ?? null,
        hasAttachments: Boolean(message.CommMessage_HasAttachments),
      }
    }),
  }
}

async function accountDetail(admin: any, userId: string, id: string) {
  const summary = (await customerRows(admin)).find((item: Row) => item.id === id)
  if (!summary) throw new HttpError(404, "Account not found.")
  const [orgResult, contactsResult, profileResult, shipmentResult, addressResult, engagementResult] = await Promise.all([
    admin.from("Org_Master").select("*").eq("Org_id", id).single(),
    admin.from("Org_Contacts").select("OrgContact_ID").eq("Org_ID", id),
    admin.from("CRM_AccountProfiles").select("*").eq("CRMAccount_OrgID", id).eq("CRMAccount_IsDeleted", false).maybeSingle(),
    admin.from("Job_ShipmentSummary").select("*").eq("Job_Customer", id).neq("Job_Status", "Closed").order("Job_PredictedDeliveryAt").limit(12),
    admin.from("Org_Addresses").select("*").eq("Org_ID", id).limit(1),
    admin.from("CRM_CustomerEngagementPreferences").select("*").eq("CRMCustEngPref_CustomerOrgID", id).order("CRMCustEngPref_UpdatedAt", { ascending: false }).limit(1),
  ])
  const detailError = [orgResult, contactsResult, profileResult, shipmentResult, addressResult, engagementResult].find((result) => result.error)?.error
  if (detailError) throw new HttpError(500, detailError.message)
  const org = orgResult.data
  const contacts = contactsResult.data
  const profile = profileResult.data
  const shipments = shipmentResult.data
  const addresses = addressResult.data
  const engagement = engagementResult.data
  const accountId = profile?.CRMAccount_ID ?? null
  const contactIds = (contacts ?? []).map((item: Row) => item.OrgContact_ID)
  const contactList = await contactRows(admin, null, id)
  const contactEmails = contactList.map((contact: Row) => contact.email).filter(Boolean)
  const [{ data: activities, error: activityError }, emailResult] = await Promise.all([
    accountId
      ? admin.from("CRM_Activities").select("*").eq("CRMActivity_AccountID", accountId).eq("CRMActivity_IsDeleted", false).order("CRMActivity_ActivityAt", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    recentEmails(admin, userId, id, contactIds, contactEmails),
  ])
  if (activityError) throw new HttpError(500, activityError.message)
  const address = addresses?.[0] ?? null
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

async function contactDetail(admin: any, userId: string, id: string) {
  const summary = (await contactRows(admin)).find((item: Row) => item.id === id)
  if (!summary) throw new HttpError(404, "Contact not found.")
  const { data: profile } = await admin.from("CRM_ContactProfiles").select("*").eq("CRMContact_OrgContactID", id).maybeSingle()
  const { data: participants } = await admin.from("CRM_ActivityParticipants").select("CRMActPart_ActivityID").eq("CRMActPart_OrgContactID", id)
  const activityIds = (participants ?? []).map((item: Row) => item.CRMActPart_ActivityID)
  const { data: activities } = activityIds.length
    ? await admin.from("CRM_Activities").select("*").in("CRMActivity_ID", activityIds).eq("CRMActivity_IsDeleted", false).order("CRMActivity_ActivityAt", { ascending: false }).limit(20)
    : { data: [] }
  const { data: consents } = await admin.from("Comm_ConsentPreferences").select("*").eq("CommConsent_ContactID", id).eq("CommConsent_ChannelCode", "email").order("CommConsent_EffectiveAt", { ascending: false }).limit(12)
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
    activities: (activities ?? []).map((item: Row) => ({
      id: item.CRMActivity_ID,
      subject: item.CRMActivity_Subject,
      summary: item.CRMActivity_Summary,
      occurredAt: item.CRMActivity_ActivityAt,
      type: item.CRMActivity_ActivityTypeCode,
    })),
    recentEmails: await recentEmails(admin, userId, summary.accountId, [id], summary.email ? [summary.email] : []),
  }
}

async function updateAccount(admin: any, current: Row, id: string, payload: Row) {
  const { data: org, error: orgLookupError } = await admin.from("Org_Master").select("Org_id,Org_MarketingOptIn").eq("Org_id", id).maybeSingle()
  if (orgLookupError) throw new HttpError(500, orgLookupError.message)
  if (!org) throw new HttpError(404, "Account not found.")
  const name = normalize(payload.name)
  if (!name) throw new HttpError(400, "Enter an account name.")
  const address = objectValue(payload.address)
  const addressCountryCode = countryCode(address.countryCode)
  const now = new Date().toISOString()
  const { error: orgError } = await admin.from("Org_Master").update({ Org_Name: name, Org_CRMRelationshipStatusCode: normalize(payload.relationshipStatus), Org_CRMUpdatedAt: now }).eq("Org_id", id)
  if (orgError) throw new HttpError(500, orgError.message)

  const profileRow = {
    CRMAccount_OrgID: id,
    CRMAccount_RelationshipStatusCode: normalize(payload.relationshipStatus) ?? "active_customer",
    CRMAccount_Tier: normalize(payload.tier),
    CRMAccount_Segment: normalize(payload.segment),
    CRMAccount_Vertical: normalize(payload.vertical),
    CRMAccount_PrimaryModeCode: normalize(payload.primaryMode),
    CRMAccount_PrimaryTradeLane: normalize(payload.primaryTradeLane),
    CRMAccount_GrowthState: normalize(payload.growthState),
    CRMAccount_HealthScore: Number.isFinite(Number(payload.healthScore)) ? Number(payload.healthScore) : null,
    CRMAccount_ChurnRiskScore: Number.isFinite(Number(payload.churnRiskScore)) ? Number(payload.churnRiskScore) : null,
    CRMAccount_CustomerCentricSummary: normalize(payload.summary),
    CRMAccount_IsStrategic: Boolean(payload.strategic),
    CRMAccount_IsTrainingAllowed: Boolean(payload.trainingAllowed),
    CRMAccount_MetadataJSON: objectValue(payload.metadata),
    CRMAccount_UpdatedAt: now,
    CRMAccount_UpdatedBy: current.User_ID,
    CRMAccount_IsDeleted: false,
  }
  const { data: profile, error: profileError } = await admin.from("CRM_AccountProfiles").upsert(profileRow, { onConflict: "CRMAccount_OrgID" }).select("CRMAccount_ID").single()
  if (profileError) throw new HttpError(500, profileError.message)

  const { data: existingAddress } = await admin.from("Org_Addresses").select("OrgAdd_ID").eq("Org_ID", id).limit(1).maybeSingle()
  const addressRow = {
    Org_ID: id,
    OrgAdd_Line1: normalize(address.line1),
    OrgAdd_Line2: normalize(address.line2),
    OrgAdd_TownCity: normalize(address.townCity),
    OrgAdd_CountyState: normalize(address.countyState),
    OrgAdd_PostZipCode: normalize(address.postZipCode),
    OrgAdd_Country: addressCountryCode,
    OrgAdd_MainEmail: normalize(address.mainEmail)?.toLowerCase(),
    OrgAdd_MainPhone: normalize(address.mainPhone),
  }
  const addressResult = existingAddress
    ? await admin.from("Org_Addresses").update(addressRow).eq("OrgAdd_ID", existingAddress.OrgAdd_ID)
    : await admin.from("Org_Addresses").insert({ OrgAdd_ID: crypto.randomUUID(), ...addressRow })
  if (addressResult.error) throw new HttpError(500, addressResult.error.message)

  const engagement = objectValue(payload.engagement)
  const { data: existingEngagement } = await admin.from("CRM_CustomerEngagementPreferences").select("CRMCustEngPref_ID").eq("CRMCustEngPref_CustomerOrgID", id).order("CRMCustEngPref_UpdatedAt", { ascending: false }).limit(1).maybeSingle()
  const engagementRow = {
    CRMCustEngPref_CustomerOrgID: id,
    CRMCustEngPref_PreferredChannelCode: normalize(engagement.preferredChannel),
    CRMCustEngPref_AllowThankYouMessages: engagement.allowThankYouMessages !== false,
    CRMCustEngPref_AllowFollowupMessages: engagement.allowFollowupMessages !== false,
    CRMCustEngPref_AllowWhatsApp: Boolean(engagement.allowWhatsApp),
    CRMCustEngPref_DoNotOverContact: Boolean(engagement.doNotOverContact),
    CRMCustEngPref_MinHoursBetweenNonUrgentMessages: Math.max(0, Number(engagement.minHoursBetweenNonUrgentMessages) || 24),
    CRMCustEngPref_Notes: normalize(engagement.notes),
    CRMCustEngPref_UpdatedAt: now,
  }
  const engagementResult = existingEngagement
    ? await admin.from("CRM_CustomerEngagementPreferences").update(engagementRow).eq("CRMCustEngPref_ID", existingEngagement.CRMCustEngPref_ID)
    : await admin.from("CRM_CustomerEngagementPreferences").insert({ CRMCustEngPref_ID: crypto.randomUUID(), ...engagementRow })
  if (engagementResult.error) throw new HttpError(500, engagementResult.error.message)

  const marketingConsentChanged = typeof payload.marketingOptIn === "boolean" && Boolean(org.Org_MarketingOptIn) !== payload.marketingOptIn
  if (marketingConsentChanged) {
    const reason = normalize(payload.marketingConsentReason)
    if (!reason) throw new HttpError(400, "Explain the source or evidence for this consent change.")
    const { error: consentError } = await admin.rpc("_multideck_set_marketing_consent", {
      p_record_type: "customer", p_record_id: id, p_opted_in: payload.marketingOptIn,
      p_source: "account_detail", p_reason: reason, p_actor: current.User_ID,
      p_metadata: { surface: "crm_account_detail" },
    })
    if (consentError) throw new HttpError(500, consentError.message)
  }
  await admin.from("CRM_Activities").insert({
    CRMActivity_ID: crypto.randomUUID(), CRMActivity_ActivityTypeCode: "review", CRMActivity_AccountID: profile.CRMAccount_ID,
    CRMActivity_Subject: "Account details updated", CRMActivity_Summary: normalize(payload.changeSummary) ?? "The account profile and communication preferences were reviewed.",
    CRMActivity_ActivityAt: now, CRMActivity_OwnerUserID: current.User_ID, CRMActivity_CreatedBy: current.User_ID, CRMActivity_UpdatedBy: current.User_ID,
  })
  return accountDetail(admin, current.User_ID, id)
}

async function updateContact(admin: any, current: Row, id: string, payload: Row) {
  const { data: contact, error: contactError } = await admin.from("Org_Contacts").select("*").eq("OrgContact_ID", id).maybeSingle()
  if (contactError) throw new HttpError(500, contactError.message)
  if (!contact) throw new HttpError(404, "Contact not found.")
  const firstName = normalize(payload.firstName)
  const lastName = normalize(payload.lastName)
  if (!firstName && !lastName) throw new HttpError(400, "Enter the contact's name.")
  const now = new Date().toISOString()
  const { error: nameError } = await admin.from("Org_Contacts").update({ OrgContact_FirstName: firstName, OrgContact_LastName: lastName }).eq("OrgContact_ID", id)
  if (nameError) throw new HttpError(500, nameError.message)
  const email = normalize(payload.email)?.toLowerCase()
  const { data: existingEmail } = await admin.from("OrgContact_Emails").select("OrgContactEmail_ID").eq("OrgContact_ID", id).order("OrgContactEmail_Type").limit(1).maybeSingle()
  if (email) {
    const emailResult = existingEmail
      ? await admin.from("OrgContact_Emails").update({ OrgContactEmail_Email: email }).eq("OrgContactEmail_ID", existingEmail.OrgContactEmail_ID)
      : await admin.from("OrgContact_Emails").insert({ OrgContactEmail_ID: crypto.randomUUID(), OrgContact_ID: id, OrgContactEmail_Email: email, OrgContactEmail_Type: 1 })
    if (emailResult.error) throw new HttpError(500, emailResult.error.message)
  } else if (existingEmail) {
    const { error: emailDeleteError } = await admin.from("OrgContact_Emails").delete().eq("OrgContactEmail_ID", existingEmail.OrgContactEmail_ID)
    if (emailDeleteError) throw new HttpError(500, emailDeleteError.message)
  }
  const metadata = { ...objectValue(payload.metadata), jobTitle: normalize(payload.jobTitle), department: normalize(payload.department), phone: normalize(payload.phone) }
  const profileRow = {
    CRMContact_OrgContactID: id,
    CRMContact_RoleCode: normalize(payload.role),
    CRMContact_InfluenceLevel: normalize(payload.influenceLevel),
    CRMContact_RelationshipStrength: Number.isFinite(Number(payload.relationshipStrength)) ? Number(payload.relationshipStrength) : null,
    CRMContact_PreferredChannelCode: normalize(payload.preferredChannel),
    CRMContact_PreferredLanguageCode: normalize(payload.preferredLanguage),
    CRMContact_ConsentSalesContact: Boolean(payload.consentSalesContact),
    CRMContact_ConsentMarketing: Boolean(payload.marketingOptIn),
    CRMContact_Notes: normalize(payload.notes),
    CRMContact_IsTrainingAllowed: Boolean(payload.trainingAllowed),
    CRMContact_MetadataJSON: metadata,
    CRMContact_UpdatedAt: now,
    CRMContact_UpdatedBy: current.User_ID,
  }
  const { data: profile, error: profileError } = await admin.from("CRM_ContactProfiles").upsert(profileRow, { onConflict: "CRMContact_OrgContactID" }).select("CRMContact_ID,CRMContact_AccountID").single()
  if (profileError) throw new HttpError(500, profileError.message)
  const phone = normalize(payload.phone)
  const { data: phoneIdentity, error: phoneIdentityError } = await admin.from("Comm_Identities").select("CommIdentity_ID").eq("CommIdentity_ContactID", id).in("CommIdentity_ChannelCode", ["phone", "sms", "whatsapp"]).eq("CommIdentity_IsDeleted", false).limit(1).maybeSingle()
  if (phoneIdentityError) throw new HttpError(500, phoneIdentityError.message)
  if (phone) {
    const normalizedPhone = phone.replace(/[^+\d]/g, "")
    const identityRow = { CommIdentity_ChannelCode: normalize(payload.preferredChannel) === "whatsapp" ? "whatsapp" : "phone", CommIdentity_Address: phone, CommIdentity_NormalizedAddress: normalizedPhone, CommIdentity_DisplayName: [firstName, lastName].filter(Boolean).join(" "), CommIdentity_ParticipantTypeCode: "external", CommIdentity_OrgID: contact.Org_ID, CommIdentity_ContactID: id, CommIdentity_Source: "crm_contact_detail", CommIdentity_UpdatedAt: now, CommIdentity_IsDeleted: false }
    const phoneResult = phoneIdentity ? await admin.from("Comm_Identities").update(identityRow).eq("CommIdentity_ID", phoneIdentity.CommIdentity_ID) : await admin.from("Comm_Identities").insert({ CommIdentity_ID: crypto.randomUUID(), ...identityRow })
    if (phoneResult.error) throw new HttpError(500, phoneResult.error.message)
  } else if (phoneIdentity) {
    const { error: phoneDeleteError } = await admin.from("Comm_Identities").update({ CommIdentity_IsDeleted: true, CommIdentity_UpdatedAt: now }).eq("CommIdentity_ID", phoneIdentity.CommIdentity_ID)
    if (phoneDeleteError) throw new HttpError(500, phoneDeleteError.message)
  }
  const marketingConsentChanged = typeof payload.marketingOptIn === "boolean" && Boolean(contact.OrgContact_MarketingOptIn) !== payload.marketingOptIn
  if (marketingConsentChanged) {
    const reason = normalize(payload.marketingConsentReason)
    if (!reason) throw new HttpError(400, "Explain the source or evidence for this consent change.")
    const { error: consentError } = await admin.rpc("_multideck_set_marketing_consent", {
      p_record_type: "contact", p_record_id: id, p_opted_in: payload.marketingOptIn,
      p_source: "contact_detail", p_reason: reason, p_actor: current.User_ID,
      p_metadata: { surface: "crm_contact_detail" },
    })
    if (consentError) throw new HttpError(500, consentError.message)
  }
  let accountProfileId = profile?.CRMContact_AccountID ?? null
  if (!accountProfileId) {
    const { data: accountProfile } = await admin.from("CRM_AccountProfiles").select("CRMAccount_ID").eq("CRMAccount_OrgID", contact.Org_ID).eq("CRMAccount_IsDeleted", false).maybeSingle()
    accountProfileId = accountProfile?.CRMAccount_ID ?? null
  }
  const activityId = crypto.randomUUID()
  await admin.from("CRM_Activities").insert({
    CRMActivity_ID: activityId, CRMActivity_ActivityTypeCode: "note", CRMActivity_AccountID: accountProfileId,
    CRMActivity_Subject: "Contact details updated", CRMActivity_Summary: normalize(payload.changeSummary) ?? "The contact profile and communication preferences were reviewed.",
    CRMActivity_ActivityAt: now, CRMActivity_OwnerUserID: current.User_ID, CRMActivity_CreatedBy: current.User_ID, CRMActivity_UpdatedBy: current.User_ID,
  })
  await admin.from("CRM_ActivityParticipants").insert({ CRMActPart_ID: crypto.randomUUID(), CRMActPart_ActivityID: activityId, CRMActPart_OrgID: contact.Org_ID, CRMActPart_OrgContactID: id, CRMActPart_NameSnapshot: [firstName, lastName].filter(Boolean).join(" "), CRMActPart_EmailSnapshot: email, CRMActPart_Role: normalize(payload.role), CRMActPart_IsExternal: true })
  return contactDetail(admin, current.User_ID, id)
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "customers")

    if (request.method === "GET") {
      await requirePermission(admin, current.User_ID, "Customers.Read")
      if (parts[0] === "reference") {
        const [{ data: organisationTypes, error }, { data: owners, error: ownerError }, { data: relationshipStatuses, error: relationshipError }] = await Promise.all([
          admin.from("Org_Types").select("OrgType_ID,OrgType_Name").order("OrgType_Order").order("OrgType_Name"),
          admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email").eq("Company_ID", current.Company_ID).not("Auth_User_ID", "is", null).order("User_Firstname"),
          admin.from("sys_CRMRelationshipStatuses").select("CRMRelStatus_Code,CRMRelStatus_Name").eq("CRMRelStatus_IsActive", true).order("CRMRelStatus_SortOrder"),
        ])
        if (error || ownerError || relationshipError) throw new HttpError(500, (error ?? ownerError ?? relationshipError)?.message ?? "The CRM reference data could not be loaded.")
        return json(request, {
          organisationTypes: (organisationTypes ?? []).map((item: Row) => ({ id: item.OrgType_ID, name: item.OrgType_Name })),
          owners: (owners ?? []).map((item: Row) => ({ id: item.User_ID, name: [item.User_Firstname, item.User_Lastname].filter(Boolean).join(" ") || item.User_Email, email: item.User_Email })),
          relationshipStatuses: (relationshipStatuses ?? []).map((item: Row) => ({ code: item.CRMRelStatus_Code, name: item.CRMRelStatus_Name })),
        })
      }
      if (parts[0] === "contacts" && parts[1]) return json(request, await contactDetail(admin, current.User_ID, parts[1]))
      if (parts[0] === "contacts") return json(request, await contactRows(admin, new URL(request.url).searchParams.get("search")))
      if (parts[0]) return json(request, await accountDetail(admin, current.User_ID, parts[0]))
      return json(request, await customerRows(admin, new URL(request.url).searchParams.get("search")))
    }

    if (request.method === "PATCH") {
      await requirePermission(admin, current.User_ID, "Customers.Write")
      if (parts[0] === "contacts" && parts[1]) return json(request, await updateContact(admin, current, parts[1], await body<Row>(request)))
      if (parts.length === 1) return json(request, await updateAccount(admin, current, parts[0], await body<Row>(request)))
    }

    if (request.method === "POST" && !parts.length) {
      await requirePermission(admin, current.User_ID, "Customers.Write")
      const payload = await body<Row>(request)
      const name = normalize(payload.name)
      if (!name) throw new HttpError(400, "Enter an account name.")
      const addressCountryCode = countryCode(payload.countryCode)
      const { data: existing } = await admin.from("Org_Master").select("Org_id").ilike("Org_Name", name).maybeSingle()
      if (existing) throw new HttpError(409, `An account named '${name}' already exists.`)
      const { data: type } = await admin.from("Org_Types").select("OrgType_ID").eq("OrgType_ID", payload.orgTypeId).maybeSingle()
      if (!type) throw new HttpError(400, "Choose a valid organisation type.")
      const { data: currencies, error: currencyError } = await admin.from("sys_Currency").select("Currency_ID,Currency_Code").order("Currency_Code")
      if (currencyError) throw new HttpError(500, currencyError.message)
      const baseCurrency = (currencies ?? []).find((currency: Row) => currency.Currency_Code === "GBP") ?? currencies?.[0]
      if (!baseCurrency) throw new HttpError(500, "No base currency is configured for this workspace.")
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const codeStem = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) || "ACCOUNT"
      const accountCode = `${codeStem}-${id.slice(0, 6).toUpperCase()}`.slice(0, 20)
      const inserted = await admin.from("Org_Master").insert({
        Org_id: id,
        Org_Name: name,
        Org_BaseCurrency: baseCurrency.Currency_ID,
        Org_AccCode: accountCode,
        Org_CRMRelationshipStatusCode: "active_customer",
        Org_CRMIsPotentialCustomer: true,
        Org_CRMIsLead: false,
        Org_CRMUpdatedAt: now,
      })
      if (inserted.error) throw new HttpError(500, inserted.error.message)
      const typeLink = await admin.from("Org_Master_Type").insert({ Org_ID: id, OrgType_ID: payload.orgTypeId })
      if (typeLink.error) throw new HttpError(500, typeLink.error.message)
      const profileInsert = await admin.from("CRM_AccountProfiles").insert({
        CRMAccount_ID: crypto.randomUUID(), CRMAccount_OrgID: id, CRMAccount_RelationshipStatusCode: "active_customer",
        CRMAccount_OwnerUserID: current.User_ID, CRMAccount_CreatedBy: current.User_ID, CRMAccount_UpdatedBy: current.User_ID,
      })
      if (profileInsert.error) throw new HttpError(500, profileInsert.error.message)
      if (normalize(payload.addressLine1) || normalize(payload.townCity) || addressCountryCode) {
        const addressInsert = await admin.from("Org_Addresses").insert({ OrgAdd_ID: crypto.randomUUID(), Org_ID: id, OrgAdd_Line1: normalize(payload.addressLine1), OrgAdd_TownCity: normalize(payload.townCity), OrgAdd_PostZipCode: normalize(payload.postZipCode), OrgAdd_Country: addressCountryCode })
        if (addressInsert.error) throw new HttpError(500, addressInsert.error.message)
      }
      if (normalize(payload.contactFirstName) || normalize(payload.contactLastName) || normalize(payload.contactEmail)) {
        const contactId = crypto.randomUUID()
        const contactInsert = await admin.from("Org_Contacts").insert({ OrgContact_ID: contactId, Org_ID: id, OrgContact_FirstName: normalize(payload.contactFirstName), OrgContact_LastName: normalize(payload.contactLastName) })
        if (contactInsert.error) throw new HttpError(500, contactInsert.error.message)
        if (normalize(payload.contactEmail)) {
          const emailInsert = await admin.from("OrgContact_Emails").insert({ OrgContactEmail_ID: crypto.randomUUID(), OrgContact_ID: contactId, OrgContactEmail_Email: normalize(payload.contactEmail)?.toLowerCase(), OrgContactEmail_Type: 1 })
          if (emailInsert.error) throw new HttpError(500, emailInsert.error.message)
        }
      }
      return json(request, (await customerRows(admin)).find((item: Row) => item.id === id), 201)
    }

    if (request.method === "POST" && parts.length === 2 && parts[1] === "contacts") {
      await requirePermission(admin, current.User_ID, "Customers.Write")
      const customerId = parts[0]
      const payload = await body<Row>(request)
      const email = normalize(payload.email)?.toLowerCase()
      const firstName = normalize(payload.firstName)
      const lastName = normalize(payload.lastName)
      if (!email) throw new HttpError(400, "Enter a contact email address.")
      if (!firstName && !lastName) throw new HttpError(400, "Enter the contact's name.")
      const { data: customer } = await admin.from("Org_Master").select("Org_id,Org_Name").eq("Org_id", customerId).maybeSingle()
      if (!customer) throw new HttpError(404, "Choose an existing account.")
      const { data: existingEmail } = await admin.from("OrgContact_Emails").select("OrgContactEmail_ID").ilike("OrgContactEmail_Email", email).maybeSingle()
      if (existingEmail) throw new HttpError(409, "This email is already connected to a contact.")
      const contactId = crypto.randomUUID()
      const insertedContact = await admin.from("Org_Contacts").insert({ OrgContact_ID: contactId, Org_ID: customerId, OrgContact_FirstName: firstName, OrgContact_LastName: lastName })
      if (insertedContact.error) throw new HttpError(500, insertedContact.error.message)
      const insertedEmail = await admin.from("OrgContact_Emails").insert({ OrgContactEmail_ID: crypto.randomUUID(), OrgContact_ID: contactId, OrgContactEmail_Email: email, OrgContactEmail_Type: 1 })
      if (insertedEmail.error) throw new HttpError(500, insertedEmail.error.message)
      if (payload.role || payload.jobTitle || payload.department || typeof payload.marketingOptIn === "boolean") await updateContact(admin, current, contactId, payload)
      return json(request, { id: contactId, accountId: customerId, accountName: customer.Org_Name, firstName, lastName, email }, 201)
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (error) {
    return failure(request, error)
  }
})
