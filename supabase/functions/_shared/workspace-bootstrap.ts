import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2"
import { HttpError, permissionValues } from "./backend.ts"

type WorkspaceBootstrapRow = {
  accessStatus?: string
  profile?: Record<string, unknown> | null
  preferences?: Record<string, unknown> | null
}

const mediaUrlLifetimeSeconds = 3600

function missingWorkspaceReadModel(error: { code?: string } | null | undefined) {
  return ["42883", "PGRST202"].includes(error?.code ?? "")
}

function photo(row: Record<string, unknown>, kind: "Profile" | "Cover") {
  const bucket = row[`User_${kind}PhotoBucket`]
  const path = row[`User_${kind}PhotoPath`]
  const mimeType = row[`User_${kind}PhotoMimeType`]
  const sizeBytes = row[`User_${kind}PhotoSizeBytes`]
  const updatedAt = row[`User_${kind}PhotoUpdatedAt`]
  return bucket && path && mimeType && sizeBytes && updatedAt
    ? { bucket, path, mimeType, sizeBytes, updatedAt }
    : null
}

/**
 * Bounded rollout bridge for a tenant whose Edge Function reaches production
 * before the paired bootstrap migration. It reads only the authenticated actor
 * and that actor's direct memberships; the normal one-RPC path remains primary.
 */
async function compatibilityWorkspaceBootstrap(admin: SupabaseClient, user: User): Promise<WorkspaceBootstrapRow> {
  const { data: internal, error: internalError } = await admin
    .from("cmp_Users")
    .select("*")
    .eq("Auth_User_ID", user.id)
    .limit(1)
    .maybeSingle()
  if (internalError) throw new HttpError(500, internalError.message)

  if (internal) {
    const accessStatus = internal.User_AccessStatus ?? "active"
    if (accessStatus !== "active") return { accessStatus }

    const [companyResult, officeLinksResult, roleLinksResult, permissions] = await Promise.all([
      internal.Company_ID
        ? admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", internal.Company_ID).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", internal.User_ID),
      admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", internal.User_ID),
      permissionValues(admin, internal.User_ID),
    ])
    const membershipFailure = [companyResult, officeLinksResult, roleLinksResult].find((result) => result.error)
    if (membershipFailure?.error) throw new HttpError(500, membershipFailure.error.message)
    const company = companyResult.data
    const officeLinks = officeLinksResult.data
    const roleLinks = roleLinksResult.data
    const officeIds = (officeLinks ?? []).map((link) => link.Office_ID)
    const roleIds = (roleLinks ?? []).map((link) => link.sys_UserRole_ID)
    const [officesResult, rolesResult] = await Promise.all([
      officeIds.length
        ? admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").in("Office_ID", officeIds).order("Office_Name")
        : Promise.resolve({ data: [], error: null }),
      roleIds.length
        ? admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds).order("sys_UserRole_Name")
        : Promise.resolve({ data: [], error: null }),
    ])
    const referenceFailure = [officesResult, rolesResult].find((result) => result.error)
    if (referenceFailure?.error) throw new HttpError(500, referenceFailure.error.message)
    const offices = officesResult.data
    const roles = rolesResult.data

    return {
      accessStatus: "active",
      profile: {
        id: internal.User_ID,
        authUserId: internal.Auth_User_ID,
        displayName: [internal.User_Firstname, internal.User_Lastname].filter(Boolean).join(" ") || internal.User_Email,
        firstName: internal.User_Firstname,
        lastName: internal.User_Lastname,
        email: internal.User_Email,
        actorType: "internal",
        company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
        offices: (offices ?? []).map((office) => ({ id: office.Office_ID, name: office.Office_Name, address: office.Office_Address })),
        roles: (roles ?? []).map((role) => ({ id: role.sys_UserRole_ID, name: role.sys_UserRole_Name })),
        departments: [],
        organisations: [],
        permissions,
        landingPath: "/",
        status: "Active",
        jobTitle: internal.User_JobTitle,
        profilePhoto: photo(internal, "Profile"),
        coverPhoto: photo(internal, "Cover"),
      },
      preferences: {
        themeMode: internal.User_ThemeMode ?? null,
        locale: internal.User_Locale ?? null,
        accentPreset: internal.User_AccentPreset ?? null,
        sidebar: {
          collapsed: internal.User_SidebarCollapsed ?? false,
          layout: internal.User_SidebarLayout ?? {},
        },
        keyboardShortcuts: internal.User_KeyboardShortcuts ?? {},
        tablePinnedColumns: internal.User_TablePinnedColumns ?? {},
      },
    }
  }

  const { data: identity, error: identityError } = await admin
    .from("Portal_ExternalIdentities")
    .select("PortalIdentity_PortalUserID")
    .eq("PortalIdentity_ExternalSubject", user.id)
    .eq("PortalIdentity_StatusCode", "active")
    .limit(1)
    .maybeSingle()
  if (identityError) throw new HttpError(500, identityError.message)
  if (!identity) return { accessStatus: "unlinked", profile: null, preferences: null }

  const { data: portal, error: portalError } = await admin
    .from("Portal_Users")
    .select("PortalUser_ID,PortalUser_DisplayName,PortalUser_Email")
    .eq("PortalUser_ID", identity.PortalIdentity_PortalUserID)
    .eq("PortalUser_StatusCode", "active")
    .eq("PortalUser_IsDeleted", false)
    .limit(1)
    .maybeSingle()
  if (portalError) throw new HttpError(500, portalError.message)
  if (!portal) return { accessStatus: "unlinked", profile: null, preferences: null }

  const { data: links, error: linksError } = await admin
    .from("Portal_UserOrganisations")
    .select("PortalUserOrg_OrgID,PortalUserOrg_CanManageOrgUsers")
    .eq("PortalUserOrg_PortalUserID", portal.PortalUser_ID)
    .eq("PortalUserOrg_StatusCode", "active")
  if (linksError) throw new HttpError(500, linksError.message)
  const organisationIds = (links ?? []).map((link) => link.PortalUserOrg_OrgID)
  const { data: organisations, error: organisationsError } = organisationIds.length
    ? await admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", organisationIds).order("Org_Name")
    : { data: [], error: null }
  if (organisationsError) throw new HttpError(500, organisationsError.message)
  const canManage = new Map((links ?? []).map((link) => [link.PortalUserOrg_OrgID, Boolean(link.PortalUserOrg_CanManageOrgUsers)]))

  return {
    accessStatus: "active",
    profile: {
      id: portal.PortalUser_ID,
      authUserId: user.id,
      displayName: portal.PortalUser_DisplayName || portal.PortalUser_Email,
      firstName: null,
      lastName: null,
      email: portal.PortalUser_Email,
      actorType: "customer",
      company: null,
      offices: [],
      roles: [],
      departments: [],
      organisations: (organisations ?? []).map((organisation) => ({
        id: organisation.Org_id,
        name: organisation.Org_Name,
        canManageWarehouseUsers: canManage.get(organisation.Org_id) ?? false,
      })),
      permissions: [],
      landingPath: "/warehouse/inventory",
      status: "Active",
      jobTitle: null,
      profilePhoto: null,
      coverPhoto: null,
    },
    preferences: null,
  }
}

function photoPaths(profile: Record<string, unknown> | null) {
  if (!profile) return [] as string[]

  return [...new Set([profile.profilePhoto, profile.coverPhoto]
    .flatMap((value) => {
      if (!value || typeof value !== "object") return []
      const photo = value as Record<string, unknown>
      return photo.bucket === "profile-photos" && typeof photo.path === "string" ? [photo.path] : []
    }))]
}

export async function workspaceBootstrap(admin: SupabaseClient, user: User) {
  const { data, error } = await admin.rpc("get_workspace_bootstrap_for_auth_user", {
    p_auth_user_id: user.id,
  })
  if (error && !missingWorkspaceReadModel(error)) throw new HttpError(500, error.message)

  const row = error
    ? await compatibilityWorkspaceBootstrap(admin, user)
    : (data && typeof data === "object" ? data : {}) as WorkspaceBootstrapRow
  if (row.accessStatus && !["active", "unlinked"].includes(row.accessStatus)) {
    throw new HttpError(403, "Your Multideck access has been deactivated. Contact a workspace administrator.")
  }

  const profile = row.profile ?? null
  const paths = photoPaths(profile)
  let profileMedia = {
    profilePhotoPath: null as string | null,
    profilePhotoUrl: null as string | null,
    coverPhotoPath: null as string | null,
    coverPhotoUrl: null as string | null,
    expiresAt: null as string | null,
  }

  if (profile && paths.length > 0) {
    const { data: signedRows, error: signedUrlError } = await admin.storage
      .from("profile-photos")
      .createSignedUrls(paths, mediaUrlLifetimeSeconds)
    if (signedUrlError) {
      console.warn("Workspace profile media URLs could not be created.", signedUrlError.message)
      return { profile, preferences: row.preferences ?? null, profileMedia }
    }

    const signedUrls = new Map(
      (signedRows ?? [])
        .filter((item): item is typeof item & { signedUrl: string } => typeof item.signedUrl === "string")
        .map((item) => [item.path, item.signedUrl]),
    )
    const profilePhoto = profile.profilePhoto as Record<string, unknown> | null
    const coverPhoto = profile.coverPhoto as Record<string, unknown> | null
    const profilePhotoPath = typeof profilePhoto?.path === "string" ? profilePhoto.path : null
    const coverPhotoPath = typeof coverPhoto?.path === "string" ? coverPhoto.path : null

    profileMedia = {
      profilePhotoPath,
      profilePhotoUrl: profilePhotoPath ? signedUrls.get(profilePhotoPath) ?? null : null,
      coverPhotoPath,
      coverPhotoUrl: coverPhotoPath ? signedUrls.get(coverPhotoPath) ?? null : null,
      expiresAt: new Date(Date.now() + mediaUrlLifetimeSeconds * 1000).toISOString(),
    }
  }

  return { profile, preferences: row.preferences ?? null, profileMedia }
}
