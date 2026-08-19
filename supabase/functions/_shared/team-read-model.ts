export const SYSTEM_ROLES: Record<string, { description: string; canEditPermissions: boolean }> = {
  Administrator: { description: "Full workspace administration across users, roles, data, integrations, and billing.", canEditPermissions: false },
  "Company Admin": { description: "Manage the company workspace, its people, and day-to-day configuration.", canEditPermissions: false },
  "Company Manager": { description: "Coordinate company operations and team activity without system administration.", canEditPermissions: false },
  "Company User": { description: "Use the company workspace for assigned operational work.", canEditPermissions: false },
  "Guest User": { description: "Limited workspace visibility for temporary or external collaboration.", canEditPermissions: false },
  "Operations manager": { description: "Manage day-to-day freight operations, users, reports, and customer work without changing authorization rules.", canEditPermissions: false },
  Operator: { description: "Create and update operational freight records while keeping destructive and admin actions restricted.", canEditPermissions: false },
  "System Admin": { description: "Maintain system-level configuration and protected workspace access.", canEditPermissions: false },
  Viewer: { description: "Read-only access for people who need visibility without operational edit rights.", canEditPermissions: false },
}

const LEGACY_CUSTOM_ROLE_PATTERN = /^Custom · [0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PASSWORD_MARKER_REQUIRED_FROM = Date.parse("2026-08-12T00:00:00Z")
const POSTGREST_IN_BATCH_SIZE = 200

export function isLegacyCustomRoleName(name: string) {
  return LEGACY_CUSTOM_ROLE_PATTERN.test(name)
}

export function isPendingInvitation(authUser: any) {
  if (!authUser?.invited_at) return false
  const passwordCreated = Boolean(
    authUser.app_metadata?.multideck_password_created_at
    || authUser.user_metadata?.multideck_password_created_at,
  )
  const invitedAt = Date.parse(authUser.invited_at)
  // Earlier users predate the explicit password marker, so retain the old
  // sign-in fallback for them. New invitations stay pending until password setup.
  return Number.isFinite(invitedAt) && invitedAt >= PASSWORD_MARKER_REQUIRED_FROM
    ? !passwordCreated
    : !authUser.last_sign_in_at
}

function photo(row: any, kind: "Profile" | "Cover") {
  return row[`User_${kind}PhotoPath`] ? {
    bucket: row[`User_${kind}PhotoBucket`],
    path: row[`User_${kind}PhotoPath`],
    mimeType: row[`User_${kind}PhotoMimeType`],
    sizeBytes: row[`User_${kind}PhotoSizeBytes`],
    updatedAt: row[`User_${kind}PhotoUpdatedAt`],
  } : null
}

export function assembleTeamUser(row: any, company: any, offices: any[], roles: any[], departments: any[], authUser: any) {
  const invitationPending = isPendingInvitation(authUser)
  return {
    id: row.User_ID,
    authUserId: row.Auth_User_ID,
    displayName: [row.User_Firstname, row.User_Lastname].filter(Boolean).join(" ") || row.User_Email,
    firstName: row.User_Firstname,
    lastName: row.User_Lastname,
    email: row.User_Email,
    company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: offices.map((item: any) => ({ id: item.Office_ID, name: item.Office_Name, address: item.Office_Address })),
    roles: roles.map((item: any) => ({ id: item.sys_UserRole_ID, name: item.sys_UserRole_Name })),
    departments: departments.map((item: any) => ({ id: item.Department_ID, name: item.Department_Name, isActive: item.Department_IsActive })),
    status: row.User_AccessStatus === "deactivated" ? "Deactivated" : invitationPending ? "Invited" : row.Auth_User_ID ? "Active" : "Profile only",
    invitationSentAt: invitationPending ? authUser.invited_at : null,
    deactivatedAt: row.User_DeactivatedAt ?? null,
    jobTitle: row.User_JobTitle ?? null,
    profilePhoto: photo(row, "Profile"),
    coverPhoto: photo(row, "Cover"),
  }
}

function groupBy(rows: any[], key: string) {
  const grouped = new Map<string, any[]>()
  for (const row of rows) {
    const value = row[key]
    if (!value) continue
    const existing = grouped.get(value)
    if (existing) existing.push(row)
    else grouped.set(value, [row])
  }
  return grouped
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

async function bulkLinks(admin: any, table: string, columns: string, userIds: string[]) {
  if (!userIds.length) return []
  const results = await Promise.all(chunks(userIds, POSTGREST_IN_BATCH_SIZE).map((userIdBatch) => (
    admin.from(table).select(columns).in("User_ID", userIdBatch)
  )))
  const failed = results.find((result: any) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  return results.flatMap((result: any) => result.data ?? [])
}

async function fallbackAuthUsers(admin: any, authUserIds: string[]) {
  const results = await Promise.all(authUserIds.map((authUserId) => admin.auth.admin.getUserById(authUserId)))
  const users = new Map<string, any>()
  for (const result of results) {
    const user = result?.data?.user
    if (user?.id) users.set(user.id, user)
  }
  return users
}

export async function singleTeamUserReadModel(admin: any, row: any) {
  const [{ data: company }, { data: officeLinks }, { data: roleLinks }, { data: departmentLinks }, authResult] = await Promise.all([
    row.Company_ID ? admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", row.Company_ID).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", row.User_ID),
    admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", row.User_ID),
    admin.from("cmp_Users_Departments").select("Department_ID").eq("User_ID", row.User_ID),
    row.Auth_User_ID ? admin.auth.admin.getUserById(row.Auth_User_ID) : Promise.resolve({ data: { user: null } }),
  ])
  const officeIds = (officeLinks ?? []).map((item: any) => item.Office_ID)
  const roleIds = (roleLinks ?? []).map((item: any) => item.sys_UserRole_ID)
  const departmentIds = (departmentLinks ?? []).map((item: any) => item.Department_ID)
  const [{ data: offices }, { data: roles }, { data: departments }] = await Promise.all([
    officeIds.length ? admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").in("Office_ID", officeIds).order("Office_Name") : Promise.resolve({ data: [] }),
    roleIds.length ? admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds).order("sys_UserRole_Name") : Promise.resolve({ data: [] }),
    departmentIds.length ? admin.from("cmp_Departments").select("Department_ID,Department_Name,Department_IsActive").in("Department_ID", departmentIds).order("Department_Name") : Promise.resolve({ data: [] }),
  ])
  return assembleTeamUser(row, company, offices ?? [], roles ?? [], departments ?? [], authResult?.data?.user ?? null)
}

/** Small workspace metadata used by each bounded team register page. */
export async function teamCatalogueReadModel(admin: any, companyId: string) {
  const [companyResult, officesResult, departmentsResult] = await Promise.all([
    admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", companyId).maybeSingle(),
    admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").eq("Company_ID", companyId).order("Office_Name"),
    admin.from("cmp_Departments").select("Department_ID,Department_Name,Department_IsActive").eq("Company_ID", companyId).order("Department_Name"),
  ])
  const failed = [companyResult, officesResult, departmentsResult].find((result: any) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  const company = companyResult.data
  const offices = officesResult.data
  const departments = departmentsResult.data

  return {
    company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: (offices ?? []).map((item: any) => ({ id: item.Office_ID, name: item.Office_Name, address: item.Office_Address })),
    departments: (departments ?? []).map((item: any) => ({ id: item.Department_ID, name: item.Department_Name, isActive: item.Department_IsActive })),
  }
}

async function teamUsersForRows(admin: any, companyId: string, userRows: any[]) {
  const userIds = userRows.map((row: any) => row.User_ID)
  const authUserIds = [...new Set(userRows.map((row: any) => row.Auth_User_ID).filter(Boolean))] as string[]
  const [
    companyResult,
    officesResult,
    rolesResult,
    departmentsResult,
    officeLinks,
    roleLinks,
    departmentLinks,
    authUsers,
  ] = await Promise.all([
    admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", companyId).limit(1).maybeSingle(),
    admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").eq("Company_ID", companyId).order("Office_Name"),
    admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").order("sys_UserRole_Name"),
    admin.from("cmp_Departments").select("Department_ID,Department_Name,Department_IsActive").eq("Company_ID", companyId).order("Department_Name"),
    bulkLinks(admin, "cmp_Users_Offices", "User_ID,Office_ID", userIds),
    bulkLinks(admin, "cmp_Users_Roles", "User_ID,sys_UserRole_ID", userIds),
    bulkLinks(admin, "cmp_Users_Departments", "User_ID,Department_ID", userIds),
    fallbackAuthUsers(admin, authUserIds),
  ])
  const failed = [companyResult, officesResult, rolesResult, departmentsResult].find((result: any) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  const company = companyResult.data
  const officesById = new Map((officesResult.data ?? []).map((row: any) => [row.Office_ID, row]))
  const rolesById = new Map((rolesResult.data ?? []).map((row: any) => [row.sys_UserRole_ID, row]))
  const departmentsById = new Map((departmentsResult.data ?? []).map((row: any) => [row.Department_ID, row]))
  const officeLinksByUser = groupBy(officeLinks, "User_ID")
  const roleLinksByUser = groupBy(roleLinks, "User_ID")
  const departmentLinksByUser = groupBy(departmentLinks, "User_ID")

  return userRows.map((row: any) => assembleTeamUser(
    row,
    company,
    (officeLinksByUser.get(row.User_ID) ?? []).map((link: any) => officesById.get(link.Office_ID)).filter(Boolean),
    (roleLinksByUser.get(row.User_ID) ?? []).map((link: any) => rolesById.get(link.sys_UserRole_ID)).filter(Boolean),
    (departmentLinksByUser.get(row.User_ID) ?? []).map((link: any) => departmentsById.get(link.Department_ID)).filter(Boolean),
    row.Auth_User_ID ? authUsers.get(row.Auth_User_ID) ?? null : null,
  ))
}

/** Exact, company-scoped lookup used for the small set of owners visible on a page. */
export async function teamUsersByIdsReadModel(admin: any, companyId: string, userIds: string[]) {
  if (!userIds.length) return []
  const { data, error } = await admin
    .from("cmp_Users")
    .select("*")
    .eq("Company_ID", companyId)
    .neq("User_AccessStatus", "deleted")
    .in("User_ID", userIds.slice(0, 50))
    .limit(50)
  if (error) throw new Error(error.message)
  const byId = new Map((data ?? []).map((row: any) => [row.User_ID, row]))
  const ordered = userIds.flatMap((userId) => {
    const row = byId.get(userId)
    return row ? [row] : []
  })
  return teamUsersForRows(admin, companyId, ordered)
}

function quotedPostgrestSearch(value: string) {
  return `"*${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}*"`
}

/**
 * Bounded rollout bridge for tenants where the Team Edge Function arrives
 * before its register RPC. It never enumerates the company or auth directory:
 * only the requested page (maximum 50 users) and those users' memberships are
 * hydrated. The database RPC remains the full-fidelity search/sort path.
 */
export async function teamUsersPageCompatibilityReadModel(admin: any, companyId: string, input: {
  search: string
  sortBy: string
  sortDirection: "asc" | "desc"
  limit: number
  offset: number
}) {
  let query = admin
    .from("cmp_Users")
    .select("*", { count: "exact" })
    .eq("Company_ID", companyId)
    .neq("User_AccessStatus", "deleted")

  if (input.search) {
    const pattern = quotedPostgrestSearch(input.search)
    query = query.or([
      `User_Firstname.ilike.${pattern}`,
      `User_Lastname.ilike.${pattern}`,
      `User_Email.ilike.${pattern}`,
      `User_JobTitle.ilike.${pattern}`,
    ].join(","))
  }

  if (input.sortBy === "status") {
    query = query.order("User_AccessStatus", { ascending: input.sortDirection === "asc", nullsFirst: false })
  } else {
    query = query
      .order("User_Firstname", { ascending: input.sortDirection === "asc", nullsFirst: false })
      .order("User_Lastname", { ascending: input.sortDirection === "asc", nullsFirst: false })
  }
  const { data: users, error, count } = await query
    .order("User_Email", { ascending: true })
    .order("User_ID", { ascending: true })
    .range(input.offset, input.offset + input.limit - 1)
  if (error) throw new Error(error.message)

  const userRows = users ?? []
  return {
    users: await teamUsersForRows(admin, companyId, userRows),
    total: count ?? 0,
    limit: input.limit,
    offset: input.offset,
  }
}

/** Roles and permissions without the unbounded company-wide assignment list. */
export async function authorizationCatalogueReadModel(admin: any) {
  const [{ data: permissions, error }, { data: roles }] = await Promise.all([
    admin.from("sys_Permissions").select("*").order("sys_Permission_Group").order("sys_Permission_Value"),
    admin.from("sys_UserRoles").select("*").order("sys_UserRole_Name"),
  ])
  if (error) throw new Error(error.message)

  const roleIds = (roles ?? []).map((role: any) => role.sys_UserRole_ID)
  const { data: rolePermissionLinks } = roleIds.length
    ? await admin.from("sys_UserRole_Permissions").select("sys_UserRole_ID,sys_Permission_ID").in("sys_UserRole_ID", roleIds)
    : { data: [] }
  const permissionById = new Map<string, any>((permissions ?? []).map((permission: any) => [permission.sys_Permission_ID, permission]))
  const permissionLinksByRole = groupBy(rolePermissionLinks ?? [], "sys_UserRole_ID")

  return {
    permissions: (permissions ?? []).map((item: any) => ({ id: item.sys_Permission_ID, value: item.sys_Permission_Value, group: item.sys_Permission_Group, name: item.sys_Permission_Name, description: item.sys_Permission_Description, isDangerous: item.sys_Permission_IsDangerous })),
    roles: (roles ?? []).map((role: any) => {
      const definition = SYSTEM_ROLES[role.sys_UserRole_Name]
      return {
        id: role.sys_UserRole_ID,
        name: role.sys_UserRole_Name,
        description: definition?.description ?? "Reusable workspace role.",
        isSystem: Boolean(definition),
        isLegacyCustom: isLegacyCustomRoleName(role.sys_UserRole_Name),
        canEditPermissions: definition?.canEditPermissions ?? true,
        permissionValues: (permissionLinksByRole.get(role.sys_UserRole_ID) ?? [])
          .map((link: any) => permissionById.get(link.sys_Permission_ID)?.sys_Permission_Value)
          .filter(Boolean)
          .sort(),
      }
    }),
    userRoles: [],
  }
}
