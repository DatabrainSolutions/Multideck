import { authenticate, body, corsHeaders, failure, HttpError, json, permissionValues } from "../_shared/backend.ts"

function photo(row: Record<string, unknown>, kind: "Profile" | "Cover") {
  const bucket = row[`User_${kind}PhotoBucket`]
  const path = row[`User_${kind}PhotoPath`]
  const mimeType = row[`User_${kind}PhotoMimeType`]
  const sizeBytes = row[`User_${kind}PhotoSizeBytes`]
  const updatedAt = row[`User_${kind}PhotoUpdatedAt`]
  return bucket && path && mimeType && sizeBytes && updatedAt ? { bucket, path, mimeType, sizeBytes, updatedAt } : null
}

async function internalProfile(admin: any, user: any) {
  const { data: row, error } = await admin.from("cmp_Users").select("*").eq("Auth_User_ID", user.id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!row) return null
  const [{ data: company }, { data: officeLinks }, { data: roleLinks }, permissions] = await Promise.all([
    row.Company_ID ? admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", row.Company_ID).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", row.User_ID),
    admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", row.User_ID),
    permissionValues(admin, row.User_ID),
  ])
  const officeIds = (officeLinks ?? []).map((link: any) => link.Office_ID)
  const roleIds = (roleLinks ?? []).map((link: any) => link.sys_UserRole_ID)
  const [{ data: offices }, { data: roles }] = await Promise.all([
    officeIds.length ? admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").in("Office_ID", officeIds).order("Office_Name") : Promise.resolve({ data: [] }),
    roleIds.length ? admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds).order("sys_UserRole_Name") : Promise.resolve({ data: [] }),
  ])
  const displayName = [row.User_Firstname, row.User_Lastname].filter(Boolean).join(" ") || row.User_Email
  return {
    id: row.User_ID, authUserId: row.Auth_User_ID, displayName,
    firstName: row.User_Firstname, lastName: row.User_Lastname, email: row.User_Email,
    actorType: "internal", company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: (offices ?? []).map((office: any) => ({ id: office.Office_ID, name: office.Office_Name, address: office.Office_Address })),
    roles: (roles ?? []).map((role: any) => ({ id: role.sys_UserRole_ID, name: role.sys_UserRole_Name })),
    organisations: [], permissions, landingPath: "/", status: row.Auth_User_ID ? "Active" : "Profile only",
    jobTitle: row.User_JobTitle, profilePhoto: photo(row, "Profile"), coverPhoto: photo(row, "Cover"),
  }
}

async function portalProfile(admin: any, user: any) {
  const { data: identity } = await admin.from("Portal_ExternalIdentities").select("PortalIdentity_PortalUserID").eq("PortalIdentity_ExternalSubject", user.id).eq("PortalIdentity_StatusCode", "active").maybeSingle()
  if (!identity) return null
  const { data: portal } = await admin.from("Portal_Users").select("*").eq("PortalUser_ID", identity.PortalIdentity_PortalUserID).eq("PortalUser_StatusCode", "active").eq("PortalUser_IsDeleted", false).maybeSingle()
  if (!portal) return null
  const { data: links } = await admin.from("Portal_UserOrganisations").select("PortalUserOrg_OrgID,PortalUserOrg_CanManageOrgUsers").eq("PortalUserOrg_PortalUserID", portal.PortalUser_ID).eq("PortalUserOrg_StatusCode", "active")
  const ids = (links ?? []).map((link: any) => link.PortalUserOrg_OrgID)
  const { data: organisations } = ids.length ? await admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", ids).order("Org_Name") : { data: [] }
  const canManage = new Map((links ?? []).map((link: any) => [link.PortalUserOrg_OrgID, link.PortalUserOrg_CanManageOrgUsers]))
  return {
    id: portal.PortalUser_ID, authUserId: user.id, displayName: portal.PortalUser_DisplayName || portal.PortalUser_Email,
    firstName: null, lastName: null, email: portal.PortalUser_Email, actorType: "customer", company: null, offices: [], roles: [],
    organisations: (organisations ?? []).map((org: any) => ({ id: org.Org_id, name: org.Org_Name, canManageWarehouseUsers: Boolean(canManage.get(org.Org_id)) })),
    permissions: [], landingPath: "/warehouse/inventory", status: "Active", jobTitle: null, profilePhoto: null, coverPhoto: null,
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    if (request.method === "GET") {
      const profile = await internalProfile(admin, user) ?? await portalProfile(admin, user)
      return json(request, { authenticated: true, user: { id: user.id, email: user.email ?? null, role: user.role ?? null, audience: user.aud ?? null }, profile, expiresAt: null })
    }
    if (request.method === "PATCH") {
      const payload = await body<{ jobTitle?: string | null }>(request)
      const jobTitle = payload.jobTitle?.trim() || null
      if (jobTitle && jobTitle.length > 120) throw new HttpError(400, "Keep the job title to 120 characters or fewer.")
      const { error } = await admin.from("cmp_Users").update({ User_JobTitle: jobTitle }).eq("Auth_User_ID", user.id)
      if (error) throw new HttpError(500, error.message)
      const profile = await internalProfile(admin, user)
      if (!profile) throw new HttpError(403, "Your account is not linked to an internal profile.")
      return json(request, profile)
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (error) { return failure(request, error) }
})
