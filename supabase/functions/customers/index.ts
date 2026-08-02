import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, initials, json, normalize, requirePermission, routeParts } from "../_shared/backend.ts"

async function customerRows(admin: any, search?: string | null) {
  const { data: customerTypeLinks } = await admin.from("Org_Master_Type").select("Org_ID,OrgType_ID")
  const typeIds = [...new Set((customerTypeLinks ?? []).map((item: any) => item.OrgType_ID))]
  const { data: types } = typeIds.length ? await admin.from("Org_Types").select("OrgType_ID,OrgType_Name").in("OrgType_ID", typeIds) : { data: [] }
  const typeMap = new Map((types ?? []).map((item: any) => [item.OrgType_ID, item.OrgType_Name]))
  const linksByOrg = new Map<string, string[]>()
  for (const link of customerTypeLinks ?? []) linksByOrg.set(link.Org_ID, [...(linksByOrg.get(link.Org_ID) ?? []), typeMap.get(link.OrgType_ID)].filter(Boolean) as string[])
  const customerIds = [...linksByOrg.entries()].filter(([, names]) => names.some((name) => name.toLowerCase() === "customer")).map(([id]) => id)
  let query = admin.from("Org_Master").select("*").order("Org_Name")
  if (customerIds.length) query = query.or(`Org_CRMIsPotentialCustomer.eq.true,Org_id.in.(${customerIds.join(",")})`)
  else query = query.eq("Org_CRMIsPotentialCustomer", true)
  const { data: organisations, error } = await query
  if (error) throw new HttpError(500, error.message)
  const ids = (organisations ?? []).map((item: any) => item.Org_id)
  const [{ data: addresses }, { data: contacts }] = await Promise.all([
    ids.length ? admin.from("Org_Addresses").select("*").in("Org_ID", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("Org_Contacts").select("OrgContact_ID,Org_ID").in("Org_ID", ids) : Promise.resolve({ data: [] }),
  ])
  const addressMap = new Map((addresses ?? []).map((item: any) => [item.Org_ID, item]))
  const contactCounts = new Map<string, number>(); for (const item of contacts ?? []) contactCounts.set(item.Org_ID, (contactCounts.get(item.Org_ID) ?? 0) + 1)
  const term = search?.trim().toLowerCase()
  return (organisations ?? []).map((org: any) => {
    const address = addressMap.get(org.Org_id); const typeNames = (linksByOrg.get(org.Org_id) ?? []).sort(); const location = [address?.OrgAdd_TownCity, address?.OrgAdd_Country].filter(Boolean).join(", ") || null
    return { id: org.Org_id, name: org.Org_Name, initials: initials(org.Org_Name), location, industry: typeNames.find((name) => name.toLowerCase() !== "customer") ?? "Customer", contactCount: contactCounts.get(org.Org_id) ?? 0, status: org.Org_CRMIsPotentialCustomer ? "Standard" : "New", types: typeNames }
  }).filter((item: any) => !term || item.name.toLowerCase().includes(term) || item.location?.toLowerCase().includes(term))
}

async function detail(admin: any, id: string) {
  const summary = (await customerRows(admin)).find((item: any) => item.id === id)
  if (!summary) throw new HttpError(404, "Customer not found.")
  const [{ data: org }, { data: contacts }, { data: profile }, { data: shipments }] = await Promise.all([
    admin.from("Org_Master").select("*").eq("Org_id", id).single(),
    admin.from("Org_Contacts").select("*").eq("Org_ID", id).order("OrgContact_LastName").order("OrgContact_FirstName"),
    admin.from("CRM_AccountProfiles").select("*").eq("CRMAccount_OrgID", id).eq("CRMAccount_IsDeleted", false).maybeSingle(),
    admin.from("Job_ShipmentSummary").select("*").eq("Job_Customer", id).neq("Job_Status", "Closed").order("Job_PredictedDeliveryAt").limit(12),
  ])
  const contactIds = (contacts ?? []).map((item: any) => item.OrgContact_ID)
  const [{ data: emails }, { data: contactProfiles }, { data: activities }] = await Promise.all([
    contactIds.length ? admin.from("OrgContact_Emails").select("*").in("OrgContact_ID", contactIds) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from("CRM_ContactProfiles").select("*").in("CRMContact_OrgContactID", contactIds) : Promise.resolve({ data: [] }),
    profile ? admin.from("CRM_Activities").select("*").eq("CRMActivity_AccountID", profile.CRMAccount_ID).eq("CRMActivity_IsDeleted", false).order("CRMActivity_ActivityAt", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
  ])
  const emailMap = new Map((emails ?? []).map((item: any) => [item.OrgContact_ID, item.OrgContactEmail_Email])); const contactProfileMap = new Map((contactProfiles ?? []).map((item: any) => [item.CRMContact_OrgContactID, item]))
  return { ...summary, customerSince: profile?.CRMAccount_CreatedAt ?? org.Org_CRMUpdatedAt, tier: profile?.CRMAccount_Tier ?? null, segment: profile?.CRMAccount_Segment ?? null, primaryMode: profile?.CRMAccount_PrimaryModeCode ?? null, primaryTradeLane: profile?.CRMAccount_PrimaryTradeLane ?? null, healthScore: profile?.CRMAccount_HealthScore ?? null, lifetimeValue: profile?.CRMAccount_LifetimeValueAmount ?? null, currencyCode: profile?.CRMAccount_LifetimeValueCurrencyCode ?? null, summary: profile?.CRMAccount_CustomerCentricSummary ?? null,
    contacts: (contacts ?? []).map((item: any) => { const name = [item.OrgContact_FirstName, item.OrgContact_LastName].filter(Boolean).join(" "); const cp = contactProfileMap.get(item.OrgContact_ID); return { id: item.OrgContact_ID, name, initials: initials(name), email: emailMap.get(item.OrgContact_ID) ?? null, role: cp?.CRMContact_RoleCode ?? null, preferredChannel: cp?.CRMContact_PreferredChannelCode ?? null, lastContactAt: cp?.CRMContact_LastContactAt ?? null } }),
    activeShipments: (shipments ?? []).map((item: any) => ({ id: item.Job_ID, reference: `${item.Job_Period}-${item.Job_Number}`, route: [item.Job_OriginNameSnapshot, item.Job_DestinationNameSnapshot].filter(Boolean).join(" → "), mode: item.Job_TransportModeSummary, status: item.Job_TrackingStatus ?? item.Job_Status, eta: item.Job_PredictedDeliveryAt, openExceptionCount: item.Job_OpenExceptionCount ?? 0 })),
    activities: (activities ?? []).map((item: any) => ({ id: item.CRMActivity_ID, subject: item.CRMActivity_Subject, summary: item.CRMActivity_Summary, occurredAt: item.CRMActivity_ActivityAt, type: item.CRMActivity_ActivityTypeCode })),
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request); const current = await currentInternalUser(admin, user); const parts = routeParts(request, "customers")
    if (request.method === "GET") {
      await requirePermission(admin, current.User_ID, "Customers.Read")
      if (parts[0] === "reference") { const { data, error } = await admin.from("Org_Types").select("OrgType_ID,OrgType_Name").order("OrgType_Order").order("OrgType_Name"); if (error) throw new HttpError(500, error.message); return json(request, { organisationTypes: (data ?? []).map((item: any) => ({ id: item.OrgType_ID, name: item.OrgType_Name })) }) }
      if (parts[0]) return json(request, await detail(admin, parts[0]))
      return json(request, await customerRows(admin, new URL(request.url).searchParams.get("search")))
    }
    if (request.method === "POST" && !parts.length) {
      await requirePermission(admin, current.User_ID, "Customers.Write"); const payload = await body<any>(request); const name = normalize(payload.name)
      if (!name) throw new HttpError(400, "Enter a customer name.")
      const { data: existing } = await admin.from("Org_Master").select("Org_id").ilike("Org_Name", name).maybeSingle(); if (existing) throw new HttpError(409, `A customer named '${name}' already exists.`)
      const { data: type } = await admin.from("Org_Types").select("OrgType_ID").eq("OrgType_ID", payload.orgTypeId).maybeSingle(); if (!type) throw new HttpError(400, "Choose a valid organisation type.")
      const id = crypto.randomUUID(); const now = new Date().toISOString(); const inserted = await admin.from("Org_Master").insert({ Org_id: id, Org_Name: name, Org_CRMIsPotentialCustomer: true, Org_CRMIsLead: false, Org_CRMUpdatedAt: now }); if (inserted.error) throw new HttpError(500, inserted.error.message)
      await admin.from("Org_Master_Type").insert({ Org_ID: id, OrgType_ID: payload.orgTypeId })
      if (normalize(payload.addressLine1) || normalize(payload.townCity) || normalize(payload.countryCode)) await admin.from("Org_Addresses").insert({ OrgAdd_ID: crypto.randomUUID(), Org_ID: id, OrgAdd_Line1: normalize(payload.addressLine1), OrgAdd_TownCity: normalize(payload.townCity), OrgAdd_PostZipCode: normalize(payload.postZipCode), OrgAdd_Country: normalize(payload.countryCode)?.toUpperCase() })
      if (normalize(payload.contactFirstName) || normalize(payload.contactLastName) || normalize(payload.contactEmail)) { const contactId = crypto.randomUUID(); await admin.from("Org_Contacts").insert({ OrgContact_ID: contactId, Org_ID: id, OrgContact_FirstName: normalize(payload.contactFirstName), OrgContact_LastName: normalize(payload.contactLastName) }); if (normalize(payload.contactEmail)) await admin.from("OrgContact_Emails").insert({ OrgContactEmail_ID: crypto.randomUUID(), OrgContact_ID: contactId, OrgContactEmail_Email: normalize(payload.contactEmail), OrgContactEmail_Type: 1 }) }
      return json(request, (await customerRows(admin)).find((item: any) => item.id === id), 201)
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (error) { return failure(request, error) }
})
