import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, isTrustedMultideckOrigin, json, requirePermission, routeParts } from "../_shared/backend.ts"

const SYSTEM_ROLES: Record<string, { description: string; canEditPermissions: boolean }> = {
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

function isLegacyCustomRoleName(name: string) {
  return LEGACY_CUSTOM_ROLE_PATTERN.test(name)
}

function invitationOrigin(request: Request, value: unknown) {
  const requestOrigin = request.headers.get("Origin")?.trim() ?? ""
  const requestedOrigin = String(value ?? "").trim().replace(/\/+$/, "")
  if (!requestedOrigin || requestedOrigin !== requestOrigin || !isTrustedMultideckOrigin(requestedOrigin)) {
    throw new HttpError(400, "The invitation must return to the Multideck workspace that sent it.")
  }
  return requestedOrigin
}

function invitationExpiry(value: unknown) {
  if (value === "3d" || value === "7d" || value === "30d" || value === "never") return value
  throw new HttpError(400, "Choose when the invitation should expire.")
}

const passwordMarkerRequiredFrom = Date.parse("2026-08-12T00:00:00Z")

function isPendingInvitation(authUser: any) {
  if (!authUser?.invited_at) return false
  const passwordCreated = Boolean(
    authUser.app_metadata?.multideck_password_created_at
    || authUser.user_metadata?.multideck_password_created_at,
  )
  const invitedAt = Date.parse(authUser.invited_at)
  // Earlier users predate the explicit password marker, so retain the old
  // sign-in fallback for them. New invitations stay pending until password setup.
  return Number.isFinite(invitedAt) && invitedAt >= passwordMarkerRequiredFrom
    ? !passwordCreated
    : !authUser.last_sign_in_at
}

async function userDto(admin: any, row: any) {
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
  const makePhoto = (kind: string) => row[`User_${kind}PhotoPath`] ? ({
    bucket: row[`User_${kind}PhotoBucket`], path: row[`User_${kind}PhotoPath`], mimeType: row[`User_${kind}PhotoMimeType`],
    sizeBytes: row[`User_${kind}PhotoSizeBytes`], updatedAt: row[`User_${kind}PhotoUpdatedAt`],
  }) : null
  const authUser = authResult?.data?.user ?? null
  const invitationPending = isPendingInvitation(authUser)
  return {
    id: row.User_ID, authUserId: row.Auth_User_ID, displayName: [row.User_Firstname, row.User_Lastname].filter(Boolean).join(" ") || row.User_Email,
    firstName: row.User_Firstname, lastName: row.User_Lastname, email: row.User_Email,
    company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: (offices ?? []).map((item: any) => ({ id: item.Office_ID, name: item.Office_Name, address: item.Office_Address })),
    roles: (roles ?? []).map((item: any) => ({ id: item.sys_UserRole_ID, name: item.sys_UserRole_Name })),
    departments: (departments ?? []).map((item: any) => ({ id: item.Department_ID, name: item.Department_Name, isActive: item.Department_IsActive })),
    status: row.User_AccessStatus === "deactivated" ? "Deactivated" : invitationPending ? "Invited" : row.Auth_User_ID ? "Active" : "Profile only",
    invitationSentAt: invitationPending ? authUser.invited_at : null,
    deactivatedAt: row.User_DeactivatedAt ?? null, jobTitle: row.User_JobTitle ?? null,
    profilePhoto: makePhoto("Profile"), coverPhoto: makePhoto("Cover"),
  }
}

async function listTeam(admin: any, current: any) {
  if (!current.Company_ID) throw new HttpError(403, "Your Multideck user is not assigned to a company yet.")
  const [{ data: company }, { data: offices }, { data: departments }, { data: users, error }] = await Promise.all([
    admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", current.Company_ID).maybeSingle(),
    admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").eq("Company_ID", current.Company_ID).order("Office_Name"),
    admin.from("cmp_Departments").select("Department_ID,Department_Name,Department_IsActive").eq("Company_ID", current.Company_ID).order("Department_Name"),
    admin.from("cmp_Users").select("*").eq("Company_ID", current.Company_ID).neq("User_AccessStatus", "deleted").order("User_Firstname").order("User_Lastname").order("User_Email"),
  ])
  if (error) throw new HttpError(500, error.message)
  return {
    company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: (offices ?? []).map((item: any) => ({ id: item.Office_ID, name: item.Office_Name, address: item.Office_Address })),
    departments: (departments ?? []).map((item: any) => ({ id: item.Department_ID, name: item.Department_Name, isActive: item.Department_IsActive })),
    users: await Promise.all((users ?? []).map((item: any) => userDto(admin, item))),
  }
}

async function createDepartment(admin: any, current: any, payload: any) {
  if (!current.Company_ID) throw new HttpError(403, "Your Multideck user is not assigned to a company yet.")
  const name = String(payload.name ?? "").trim().replace(/\s+/g, " ")
  if (!name) throw new HttpError(400, "Enter a department name.")
  if (name.length > 80) throw new HttpError(400, "Keep the department name to 80 characters or fewer.")
  const { data, error } = await admin.from("cmp_Departments").insert({
    Company_ID: current.Company_ID,
    Department_Name: name,
    Department_IsActive: true,
  }).select("Department_ID,Department_Name,Department_IsActive").single()
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "A department with this name already exists.")
    throw new HttpError(500, error.message)
  }
  return { id: data.Department_ID, name: data.Department_Name, isActive: data.Department_IsActive }
}

async function roleIdsForUser(admin: any, userId: string) {
  const { data, error } = await admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", userId)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((item: any) => item.sys_UserRole_ID)
}

async function ensureAdministratorSurvives(admin: any, companyId: string, targetUserId: string, nextRoleIds: string[] | null = null) {
  const { data: managePermission } = await admin.from("sys_Permissions").select("sys_Permission_ID").eq("sys_Permission_Value", "Users.Manage").maybeSingle()
  if (!managePermission) return
  const { data: managingRoleLinks } = await admin.from("sys_UserRole_Permissions").select("sys_UserRole_ID").eq("sys_Permission_ID", managePermission.sys_Permission_ID)
  const managingRoleIds = (managingRoleLinks ?? []).map((link: any) => link.sys_UserRole_ID)
  if (!managingRoleIds.length) return
  const currentRoleIds = await roleIdsForUser(admin, targetUserId)
  const removesUserManager = currentRoleIds.some((roleId) => managingRoleIds.includes(roleId))
    && (nextRoleIds === null || !nextRoleIds.some((roleId) => managingRoleIds.includes(roleId)))
  if (!removesUserManager) return
  const { data: otherActiveUsers } = await admin.from("cmp_Users")
    .select("User_ID").eq("Company_ID", companyId).eq("User_AccessStatus", "active").neq("User_ID", targetUserId)
  const otherIds = (otherActiveUsers ?? []).map((item: any) => item.User_ID)
  const { count } = otherIds.length
    ? await admin.from("cmp_Users_Roles").select("*", { count: "exact", head: true }).in("User_ID", otherIds).in("sys_UserRole_ID", managingRoleIds)
    : { count: 0 }
  if (!count) throw new HttpError(400, "Keep at least one active administrator who can manage users before changing this user.")
}

async function updateTeamUser(admin: any, current: any, targetId: string, payload: any) {
  const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", targetId).eq("Company_ID", current.Company_ID).neq("User_AccessStatus", "deleted").maybeSingle()
  if (!target) throw new HttpError(404, "User not found.")
  const firstName = String(payload.firstName ?? "").trim()
  const lastName = String(payload.lastName ?? "").trim()
  const jobTitle = String(payload.jobTitle ?? "").trim()
  if (!firstName || !lastName) throw new HttpError(400, "Enter the user's first and last name.")
  if (firstName.length > 50 || lastName.length > 50) throw new HttpError(400, "Keep each name to 50 characters or fewer.")
  if (jobTitle.length > 120) throw new HttpError(400, "Keep the job title to 120 characters or fewer.")
  const roleIds = [...new Set((payload.roleIds ?? []).map((value: unknown) => String(value)))] as string[]
  if (!roleIds.length) throw new HttpError(400, "Choose at least one role.")
  const { data: roles } = await admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds)
  if ((roles ?? []).length !== roleIds.length || (roles ?? []).some((role: any) => isLegacyCustomRoleName(role.sys_UserRole_Name))) throw new HttpError(400, "Choose valid reusable roles.")
  const { data: office } = await admin.from("cmp_Offices").select("Office_ID").eq("Office_ID", payload.officeId).eq("Company_ID", current.Company_ID).maybeSingle()
  if (!office) throw new HttpError(400, "Choose a valid office in this company.")
  const departmentIds = [...new Set((payload.departmentIds ?? []).map((value: unknown) => String(value)))] as string[]
  const { data: departments } = departmentIds.length ? await admin.from("cmp_Departments").select("Department_ID").in("Department_ID", departmentIds).eq("Company_ID", current.Company_ID).eq("Department_IsActive", true) : { data: [] }
  if ((departments ?? []).length !== departmentIds.length) throw new HttpError(400, "Choose active departments in this company.")
  await ensureAdministratorSurvives(admin, current.Company_ID, target.User_ID, roleIds)

  const { error: profileError } = await admin.from("cmp_Users").update({ User_Firstname: firstName, User_Lastname: lastName, User_JobTitle: jobTitle || null }).eq("User_ID", target.User_ID)
  if (profileError) throw new HttpError(500, profileError.message)
  const { error: officeDeleteError } = await admin.from("cmp_Users_Offices").delete().eq("User_ID", target.User_ID)
  if (officeDeleteError) throw new HttpError(500, officeDeleteError.message)
  const { error: officeInsertError } = await admin.from("cmp_Users_Offices").insert({ User_ID: target.User_ID, Office_ID: office.Office_ID })
  if (officeInsertError) throw new HttpError(500, officeInsertError.message)
  const { error: roleDeleteError } = await admin.from("cmp_Users_Roles").delete().eq("User_ID", target.User_ID)
  if (roleDeleteError) throw new HttpError(500, roleDeleteError.message)
  const { error: roleInsertError } = await admin.from("cmp_Users_Roles").insert(roleIds.map((roleId) => ({ User_ID: target.User_ID, sys_UserRole_ID: roleId })))
  if (roleInsertError) throw new HttpError(500, roleInsertError.message)
  const { error: departmentDeleteError } = await admin.from("cmp_Users_Departments").delete().eq("User_ID", target.User_ID)
  if (departmentDeleteError) throw new HttpError(500, departmentDeleteError.message)
  if (departmentIds.length) {
    const { error: departmentInsertError } = await admin.from("cmp_Users_Departments").insert(departmentIds.map((departmentId) => ({ User_ID: target.User_ID, Department_ID: departmentId, Department_AssignedBy: current.User_ID })))
    if (departmentInsertError) throw new HttpError(500, departmentInsertError.message)
  }
  if (target.Auth_User_ID) {
    const { data: authRecord } = await admin.auth.admin.getUserById(target.Auth_User_ID)
    if (authRecord?.user) {
      await admin.auth.admin.updateUserById(target.Auth_User_ID, { user_metadata: { ...authRecord.user.user_metadata, first_name: firstName, last_name: lastName } })
    }
  }
  const { data: updated } = await admin.from("cmp_Users").select("*").eq("User_ID", target.User_ID).single()
  return userDto(admin, updated)
}

async function setUserAccessStatus(admin: any, current: any, targetId: string, status: string) {
  const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", targetId).eq("Company_ID", current.Company_ID).neq("User_AccessStatus", "deleted").maybeSingle()
  if (!target) throw new HttpError(404, "User not found.")
  if (target.User_ID === current.User_ID) throw new HttpError(400, "You cannot change your own access status.")
  if (status !== "active" && status !== "deactivated") throw new HttpError(400, "Choose a valid user status.")
  if (status === target.User_AccessStatus) return userDto(admin, target)

  if (status === "deactivated") {
    await ensureAdministratorSurvives(admin, current.Company_ID, target.User_ID)
    if (!target.Auth_User_ID) throw new HttpError(409, "Only an active signed-in user can be deactivated.")
    const { error: banError } = await admin.auth.admin.updateUserById(target.Auth_User_ID, { ban_duration: "876000h" })
    if (banError) throw new HttpError(500, "The user's sign-in could not be blocked. No access changes were made.")
    const { data: updated, error } = await admin.from("cmp_Users").update({
      User_AccessStatus: "deactivated", User_RetainedAuthUserID: target.Auth_User_ID, Auth_User_ID: null,
      User_DeactivatedAt: new Date().toISOString(), User_DeactivatedBy: current.User_ID,
    }).eq("User_ID", target.User_ID).eq("Auth_User_ID", target.Auth_User_ID).select().maybeSingle()
    if (error || !updated) throw new HttpError(500, "Sign-in was blocked, but the workspace status could not be saved. Retry to finish deactivation.")
    return userDto(admin, updated)
  }

  if (!target.User_RetainedAuthUserID) throw new HttpError(409, "This user no longer has an account that can be reactivated.")
  const { data: attached, error: attachError } = await admin.from("cmp_Users").update({
    User_AccessStatus: "active", Auth_User_ID: target.User_RetainedAuthUserID, User_DeactivatedAt: null, User_DeactivatedBy: null,
  }).eq("User_ID", target.User_ID).eq("User_AccessStatus", "deactivated").select().maybeSingle()
  if (attachError || !attached) throw new HttpError(500, "The user's workspace access could not be restored.")
  const { error: unbanError } = await admin.auth.admin.updateUserById(target.User_RetainedAuthUserID, { ban_duration: "none" })
  if (unbanError) {
    await admin.from("cmp_Users").update({ User_AccessStatus: "deactivated", Auth_User_ID: null }).eq("User_ID", target.User_ID)
    throw new HttpError(500, "The user's sign-in could not be restored. Their account remains deactivated.")
  }
  return userDto(admin, attached)
}

async function authorizationState(admin: any, current: any) {
  const [{ data: permissions, error }, { data: roles }, { data: teamUsers }] = await Promise.all([
    admin.from("sys_Permissions").select("*").order("sys_Permission_Group").order("sys_Permission_Value"),
    admin.from("sys_UserRoles").select("*").order("sys_UserRole_Name"),
    admin.from("cmp_Users").select("User_ID").eq("Company_ID", current.Company_ID),
  ])
  if (error) throw new HttpError(500, error.message)
  const roleRows = await Promise.all((roles ?? []).map(async (role: any) => {
    const { data: links } = await admin.from("sys_UserRole_Permissions").select("sys_Permission_ID").eq("sys_UserRole_ID", role.sys_UserRole_ID)
    const ids = (links ?? []).map((link: any) => link.sys_Permission_ID)
    const { data: values } = ids.length ? await admin.from("sys_Permissions").select("sys_Permission_Value").in("sys_Permission_ID", ids).order("sys_Permission_Value") : { data: [] }
    const definition = SYSTEM_ROLES[role.sys_UserRole_Name]
    return {
      id: role.sys_UserRole_ID,
      name: role.sys_UserRole_Name,
      description: definition?.description ?? "Reusable workspace role.",
      isSystem: Boolean(definition),
      isLegacyCustom: isLegacyCustomRoleName(role.sys_UserRole_Name),
      canEditPermissions: definition?.canEditPermissions ?? true,
      permissionValues: (values ?? []).map((item: any) => item.sys_Permission_Value),
    }
  }))
  const userRoles = await Promise.all((teamUsers ?? []).map(async (teamUser: any) => {
    const { data } = await admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", teamUser.User_ID)
    return { userId: teamUser.User_ID, roleIds: (data ?? []).map((item: any) => item.sys_UserRole_ID) }
  }))
  return {
    permissions: (permissions ?? []).map((item: any) => ({ id: item.sys_Permission_ID, value: item.sys_Permission_Value, group: item.sys_Permission_Group, name: item.sys_Permission_Name, description: item.sys_Permission_Description, isDangerous: item.sys_Permission_IsDangerous })),
    roles: roleRows, userRoles,
  }
}

async function createRole(admin: any, payload: any) {
  const name = String(payload.name ?? "").trim().replace(/\s+/g, " ")
  if (!name || name.length > 50) throw new HttpError(400, "Enter a role name of 50 characters or fewer.")
  if (isLegacyCustomRoleName(name)) throw new HttpError(400, "Choose a reusable role name instead of a user-specific Custom role name.")
  const permissionValues = [...new Set((payload.permissionValues ?? []).map((value: unknown) => String(value).trim()).filter(Boolean))]
  if (!permissionValues.length) throw new HttpError(400, "Enable at least one permission before creating the role.")
  const { data: selectedPermissions, error: selectedPermissionsError } = await admin.from("sys_Permissions").select("sys_Permission_ID,sys_Permission_Value").in("sys_Permission_Value", permissionValues)
  if (selectedPermissionsError) throw new HttpError(500, selectedPermissionsError.message)
  if ((selectedPermissions ?? []).length !== permissionValues.length) throw new HttpError(400, "Choose valid permissions before creating the role.")
  const { data: existing } = await admin.from("sys_UserRoles").select("sys_UserRole_ID").ilike("sys_UserRole_Name", name).maybeSingle()
  if (existing) throw new HttpError(409, "A role with this name already exists.")
  const { data: role, error } = await admin.from("sys_UserRoles").insert({ sys_UserRole_Name: name }).select().single()
  if (error) throw new HttpError(error.code === "23505" ? 409 : 500, error.message)
  try {
    await setRolePermissions(admin, role.sys_UserRole_ID, permissionValues, false)
  } catch (error) {
    await admin.from("sys_UserRoles").delete().eq("sys_UserRole_ID", role.sys_UserRole_ID)
    throw error
  }
  return (await authorizationState(admin, { Company_ID: "00000000-0000-0000-0000-000000000000" })).roles.find((item: any) => item.id === role.sys_UserRole_ID)
}

async function setRolePermissions(admin: any, roleId: string, values: string[], protect = true) {
  const { data: role, error: roleError } = await admin.from("sys_UserRoles").select("*").eq("sys_UserRole_ID", roleId).maybeSingle()
  if (roleError) throw new HttpError(500, roleError.message)
  if (!role) throw new HttpError(404, "Choose a valid role before changing permissions.")
  if (protect && SYSTEM_ROLES[role.sys_UserRole_Name]) throw new HttpError(400, "Built-in role permissions cannot be changed.")
  const normalized = [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))]
  if (!normalized.length) throw new HttpError(400, "Keep at least one permission on the role.")
  const { data: permissions, error: permissionsError } = await admin.from("sys_Permissions").select("sys_Permission_ID,sys_Permission_Value").in("sys_Permission_Value", normalized)
  if (permissionsError) throw new HttpError(500, permissionsError.message)
  if ((permissions ?? []).length !== normalized.length) throw new HttpError(400, "Choose valid permissions before updating the role.")
  const { error: permissionDeleteError } = await admin.from("sys_UserRole_Permissions").delete().eq("sys_UserRole_ID", roleId)
  if (permissionDeleteError) throw new HttpError(500, permissionDeleteError.message)
  if ((permissions ?? []).length) {
    const { error } = await admin.from("sys_UserRole_Permissions").insert((permissions ?? []).map((item: any) => ({ sys_UserRole_ID: roleId, sys_Permission_ID: item.sys_Permission_ID })))
    if (error) throw new HttpError(500, error.message)
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "team")
    if (!parts.length && request.method === "GET") { await requirePermission(admin, current.User_ID, "Users.Read"); return json(request, await listTeam(admin, current)) }
    if (parts.length === 1 && parts[0] === "departments" && request.method === "POST") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      return json(request, await createDepartment(admin, current, await body(request)), 201)
    }
    if (!parts.length && request.method === "POST") {
      await requirePermission(admin, current.User_ID, "Users.Invite")
      const payload = await body<any>(request); const email = String(payload.email ?? "").trim().toLowerCase()
      const appOrigin = invitationOrigin(request, payload.appOrigin)
      const expiry = invitationExpiry(payload.invitationExpiry)
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a valid email address.")
      const { data: office } = await admin.from("cmp_Offices").select("*").eq("Office_ID", payload.officeId).eq("Company_ID", current.Company_ID).maybeSingle()
      if (!office) throw new HttpError(400, "Choose a valid office in this company.")
      const departmentIds = [...new Set((payload.departmentIds ?? []).map((value: unknown) => String(value)))] as string[]
      const { data: departments } = departmentIds.length
        ? await admin.from("cmp_Departments").select("Department_ID").in("Department_ID", departmentIds).eq("Company_ID", current.Company_ID).eq("Department_IsActive", true)
        : { data: [] }
      if ((departments ?? []).length !== departmentIds.length) throw new HttpError(400, "Choose active departments in this company.")
      let { data: profile } = await admin.from("cmp_Users").select("*").ilike("User_Email", email).maybeSingle()
      if (profile?.Company_ID && profile.Company_ID !== current.Company_ID) throw new HttpError(409, "This email is already linked to another company profile.")
      if (payload.roleId) {
        const { data: selectedRole } = await admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").eq("sys_UserRole_ID", payload.roleId).maybeSingle()
        if (!selectedRole || isLegacyCustomRoleName(selectedRole.sys_UserRole_Name)) throw new HttpError(400, "Choose a valid reusable role before inviting the user.")
      }
      let invited = false; let authUserId = profile?.Auth_User_ID ?? null
      if (!authUserId) {
        const redirectTo = `${appOrigin}/auth?mode=invite`
        const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { first_name: payload.firstName ?? null, last_name: payload.lastName ?? null, multideck_invitation_expiry: expiry } })
        if (error) throw new HttpError(400, error.message)
        authUserId = invite.user.id; invited = true

        // The legacy auth trigger provisions a default workspace profile before
        // inviteUserByEmail returns. Reconcile that fresh row into the inviting
        // company instead of attempting to insert a duplicate profile.
        const { data: provisionedProfile, error: provisionedProfileError } = await admin.from("cmp_Users").select("*").eq("Auth_User_ID", authUserId).maybeSingle()
        if (provisionedProfileError) throw new HttpError(500, provisionedProfileError.message)
        if (provisionedProfile && profile && provisionedProfile.User_ID !== profile.User_ID) {
          const { error: provisionedOfficeError } = await admin.from("cmp_Users_Offices").delete().eq("User_ID", provisionedProfile.User_ID)
          if (provisionedOfficeError) throw new HttpError(500, provisionedOfficeError.message)
          const { error: provisionedRoleError } = await admin.from("cmp_Users_Roles").delete().eq("User_ID", provisionedProfile.User_ID)
          if (provisionedRoleError) throw new HttpError(500, provisionedRoleError.message)
          const { error: provisionedProfileDeleteError } = await admin.from("cmp_Users").delete().eq("User_ID", provisionedProfile.User_ID)
          if (provisionedProfileDeleteError) throw new HttpError(500, provisionedProfileDeleteError.message)
        } else if (provisionedProfile) {
          profile = provisionedProfile
        }
      }
      const row = { Company_ID: current.Company_ID, User_Email: email, User_Firstname: payload.firstName?.trim() || null, User_Lastname: payload.lastName?.trim() || null, Auth_User_ID: authUserId }
      if (profile) { const updated = await admin.from("cmp_Users").update(row).eq("User_ID", profile.User_ID); if (updated.error) throw new HttpError(500, updated.error.message) }
      else { const created = await admin.from("cmp_Users").insert(row).select().single(); if (created.error) throw new HttpError(500, created.error.message); profile = created.data }
      const { error: officeDeleteError } = await admin.from("cmp_Users_Offices").delete().eq("User_ID", profile.User_ID)
      if (officeDeleteError) throw new HttpError(500, officeDeleteError.message)
      const { error: officeInsertError } = await admin.from("cmp_Users_Offices").insert({ User_ID: profile.User_ID, Office_ID: office.Office_ID })
      if (officeInsertError) throw new HttpError(500, officeInsertError.message)
      if (payload.roleId) {
        const { error: roleDeleteError } = await admin.from("cmp_Users_Roles").delete().eq("User_ID", profile.User_ID)
        if (roleDeleteError) throw new HttpError(500, roleDeleteError.message)
        const { error: roleInsertError } = await admin.from("cmp_Users_Roles").insert({ User_ID: profile.User_ID, sys_UserRole_ID: payload.roleId })
        if (roleInsertError) throw new HttpError(500, roleInsertError.message)
      }
      const { error: departmentDeleteError } = await admin.from("cmp_Users_Departments").delete().eq("User_ID", profile.User_ID)
      if (departmentDeleteError) throw new HttpError(500, departmentDeleteError.message)
      if (departmentIds.length) {
        const { error: departmentInsertError } = await admin.from("cmp_Users_Departments").insert(departmentIds.map((departmentId) => ({ User_ID: profile.User_ID, Department_ID: departmentId, Department_AssignedBy: current.User_ID })))
        if (departmentInsertError) throw new HttpError(500, departmentInsertError.message)
      }
      profile = (await admin.from("cmp_Users").select("*").eq("User_ID", profile.User_ID).single()).data
      return json(request, { user: await userDto(admin, profile), company: { id: current.Company_ID, name: (await admin.from("cmp_Company").select("Company_Name").eq("Company_ID", current.Company_ID).single()).data.Company_Name }, office: { id: office.Office_ID, name: office.Office_Name, address: office.Office_Address }, invited }, 201)
    }
    if (parts.length === 2 && parts[1] === "invitation" && request.method === "POST") {
      await requirePermission(admin, current.User_ID, "Users.Invite")
      const payload = await body<any>(request)
      const appOrigin = invitationOrigin(request, payload.appOrigin)
      const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", parts[0]).eq("Company_ID", current.Company_ID).maybeSingle()
      if (!target?.Auth_User_ID) throw new HttpError(404, "Pending invitation not found.")

      const { data: authRecord, error: authRecordError } = await admin.auth.admin.getUserById(target.Auth_User_ID)
      if (authRecordError || !authRecord?.user) throw new HttpError(404, "Pending invitation not found.")
      if (!isPendingInvitation(authRecord.user)) throw new HttpError(409, "This user has already accepted their invitation.")

      const redirectTo = `${appOrigin}/auth?mode=invite`
      if (authRecord.user.confirmed_at) {
        const { error: recoveryError } = await admin.auth.resetPasswordForEmail(target.User_Email, { redirectTo })
        if (recoveryError) throw new HttpError(400, recoveryError.message)
      } else {
        const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(target.User_Email, {
          redirectTo,
          data: {
            ...authRecord.user.user_metadata,
            first_name: target.User_Firstname ?? null,
            last_name: target.User_Lastname ?? null,
          },
        })
        if (inviteError) throw new HttpError(400, inviteError.message)
        if (invite.user.id !== target.Auth_User_ID) throw new HttpError(409, "The invitation could not be matched to this workspace user.")
      }
      return json(request, { user: await userDto(admin, target) })
    }
    if (parts.length === 2 && parts[1] === "invitation" && request.method === "DELETE") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", parts[0]).eq("Company_ID", current.Company_ID).maybeSingle()
      if (!target?.Auth_User_ID) throw new HttpError(404, "Pending invitation not found.")
      const { data: authRecord } = await admin.auth.admin.getUserById(target.Auth_User_ID)
      if (!authRecord?.user || !isPendingInvitation(authRecord.user)) throw new HttpError(409, "Only a pending invitation can be deleted here.")
      const { error: authError } = await admin.auth.admin.deleteUser(target.Auth_User_ID)
      if (authError) throw new HttpError(500, "The pending sign-in could not be removed. No profile changes were made.")
      await admin.from("cmp_Users_Offices").delete().eq("User_ID", target.User_ID)
      await admin.from("cmp_Users_Roles").delete().eq("User_ID", target.User_ID)
      const { error: profileError } = await admin.from("cmp_Users").update({ Company_ID: null, Auth_User_ID: null }).eq("User_ID", target.User_ID)
      if (profileError) throw new HttpError(500, profileError.message)
      return json(request, null, 204)
    }
    if (parts.length === 1 && request.method === "PATCH") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      return json(request, await updateTeamUser(admin, current, parts[0], await body(request)))
    }
    if (parts.length === 2 && parts[1] === "status" && request.method === "PATCH") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      const payload = await body<any>(request)
      return json(request, await setUserAccessStatus(admin, current, parts[0], String(payload.status ?? "")))
    }
    if (parts.length === 2 && parts[1] === "deletion-impact" && request.method === "GET") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      const { data: target } = await admin.from("cmp_Users").select("User_ID").eq("User_ID", parts[0]).eq("Company_ID", current.Company_ID).neq("User_AccessStatus", "deleted").maybeSingle()
      if (!target) throw new HttpError(404, "User not found.")
      if (target.User_ID === current.User_ID) throw new HttpError(400, "You cannot delete your own Multideck access.")
      await ensureAdministratorSurvives(admin, current.Company_ID, target.User_ID)
      const { data: impact, error } = await admin.rpc("User_DeletionImpact", { p_actor_user_id: current.User_ID, p_target_user_id: target.User_ID })
      if (error) throw new HttpError(500, error.message)
      const { data: eligibleRows } = await admin.from("cmp_Users").select("*").eq("Company_ID", current.Company_ID).eq("User_AccessStatus", "active").neq("User_ID", target.User_ID).order("User_Firstname").order("User_Lastname")
      return json(request, { ...impact, eligibleUsers: await Promise.all((eligibleRows ?? []).map((row: any) => userDto(admin, row))) })
    }
    if (parts.length === 1 && request.method === "DELETE") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      const payload = await body<any>(request)
      const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", parts[0]).or(`Company_ID.eq.${current.Company_ID},User_FormerCompanyID.eq.${current.Company_ID}`).maybeSingle()
      if (!target) throw new HttpError(404, "User not found.")
      if (target.User_ID === current.User_ID) throw new HttpError(400, "You cannot delete your own Multideck access.")
      if (target.User_AccessStatus !== "deleted") await ensureAdministratorSurvives(admin, current.Company_ID, target.User_ID)
      const confirmationName = [target.User_Firstname, target.User_Lastname].filter(Boolean).join(" ") || target.User_Email
      if (target.User_AccessStatus !== "deleted" && (!payload.confirmation || String(payload.confirmation).trim() !== confirmationName)) {
        throw new HttpError(400, "Enter the user's exact display name to confirm permanent deletion.")
      }
      const retainedAuthUserId = target.Auth_User_ID ?? target.User_RetainedAuthUserID
      if (retainedAuthUserId && target.User_AccessStatus !== "deleted") {
        const { error: banError } = await admin.auth.admin.updateUserById(retainedAuthUserId, { ban_duration: "876000h" })
        if (banError) throw new HttpError(500, "The user's sign-in could not be blocked. No workspace changes were made.")
      }
      const { data: result, error: deleteError } = await admin.rpc("User_DeleteWithReassignment", {
        p_actor_user_id: current.User_ID,
        p_target_user_id: target.User_ID,
        p_replacement_user_id: payload.replacementUserId || null,
        p_expected_impact_token: String(payload.impactToken ?? ""),
      })
      if (deleteError) {
        if (retainedAuthUserId && target.User_AccessStatus === "active") {
          await admin.auth.admin.updateUserById(retainedAuthUserId, { ban_duration: "none" })
        }
        throw new HttpError(409, deleteError.message)
      }
      if (retainedAuthUserId) {
        const { error: authError } = await admin.auth.admin.deleteUser(retainedAuthUserId)
        if (authError && target.User_AccessStatus !== "deleted") throw new HttpError(500, "Workspace access and work reassignment succeeded, but Auth cleanup is still pending. Retry deletion to finish safely.")
      }
      const cleanupArtifacts = Array.isArray(result?.cleanupArtifacts) ? result.cleanupArtifacts : []
      for (const artifact of cleanupArtifacts) {
        if (!artifact?.bucket || !artifact?.path) continue
        const { error: storageError } = await admin.storage.from(String(artifact.bucket)).remove([String(artifact.path)])
        if (storageError) throw new HttpError(500, "Access and reassignment succeeded, but personal file cleanup is still pending. Retry deletion to finish safely.")
      }
      if (cleanupArtifacts.length) {
        const { error: cleanupMarkerError } = await admin.from("cmp_Users").update({ User_DeletionCleanupPending: [] }).eq("User_ID", target.User_ID).eq("User_AccessStatus", "deleted")
        if (cleanupMarkerError) throw new HttpError(500, "Personal files were removed, but cleanup finalisation is still pending. Retry deletion to finish safely.")
      }
      const { cleanupArtifacts: _privateCleanupArtifacts, ...publicResult } = result ?? {}
      return json(request, publicResult)
    }
    if (parts[1] === "office" && request.method === "PATCH") {
      await requirePermission(admin, current.User_ID, "Users.Manage"); const payload = await body<any>(request)
      const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", parts[0]).eq("Company_ID", current.Company_ID).maybeSingle()
      const { data: office } = await admin.from("cmp_Offices").select("Office_ID").eq("Office_ID", payload.officeId).eq("Company_ID", current.Company_ID).maybeSingle()
      if (!target || !office) throw new HttpError(404, "Choose a valid team user and office.")
      await admin.from("cmp_Users_Offices").delete().eq("User_ID", target.User_ID); await admin.from("cmp_Users_Offices").insert({ User_ID: target.User_ID, Office_ID: office.Office_ID })
      return json(request, await userDto(admin, target))
    }
    if (parts[0] === "authorization") {
      if (parts.length === 1 && request.method === "GET") { await requirePermission(admin, current.User_ID, "Authorization.Read"); return json(request, await authorizationState(admin, current)) }
      await requirePermission(admin, current.User_ID, "Authorization.Manage")
      if (parts[1] === "roles" && parts.length === 2 && request.method === "POST") return json(request, await createRole(admin, await body(request)), 201)
      if (parts[1] === "roles" && parts[3] === "permissions" && request.method === "PATCH") { const payload = await body<any>(request); await setRolePermissions(admin, parts[2], payload.permissionValues); return json(request, (await authorizationState(admin, current)).roles.find((item: any) => item.id === parts[2])) }
      if (parts[1] === "roles" && parts.length === 3 && request.method === "DELETE") {
        const { data: role } = await admin.from("sys_UserRoles").select("sys_UserRole_Name").eq("sys_UserRole_ID", parts[2]).maybeSingle(); if (!role) throw new HttpError(404, "Role not found.")
        if (SYSTEM_ROLES[role.sys_UserRole_Name]) throw new HttpError(400, "Built-in roles cannot be deleted.")
        const { count } = await admin.from("cmp_Users_Roles").select("*", { count: "exact", head: true }).eq("sys_UserRole_ID", parts[2]); if (count) throw new HttpError(400, "Move every user off this role before deleting it.")
        await admin.from("sys_UserRole_Permissions").delete().eq("sys_UserRole_ID", parts[2]); await admin.from("sys_UserRoles").delete().eq("sys_UserRole_ID", parts[2]); return json(request, null, 204)
      }
      if (parts[1] === "users" && parts[3] === "roles" && request.method === "PATCH") {
        const payload = await body<any>(request); const roleIds = [...new Set(payload.roleIds ?? [])]; if (!roleIds.length) throw new HttpError(400, "Choose at least one role.")
        const { data: target } = await admin.from("cmp_Users").select("User_ID").eq("User_ID", parts[2]).eq("Company_ID", current.Company_ID).maybeSingle(); if (!target) throw new HttpError(404, "User not found.")
        const { data: roles } = await admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds)
        if ((roles ?? []).length !== roleIds.length || (roles ?? []).some((role: any) => isLegacyCustomRoleName(role.sys_UserRole_Name))) throw new HttpError(400, "Choose valid reusable roles.")
        await ensureAdministratorSurvives(admin, current.Company_ID, target.User_ID, roleIds as string[])
        await admin.from("cmp_Users_Roles").delete().eq("User_ID", target.User_ID); await admin.from("cmp_Users_Roles").insert(roleIds.map((id: string) => ({ User_ID: target.User_ID, sys_UserRole_ID: id })))
        return json(request, { userId: target.User_ID, roleIds })
      }
    }
    throw new HttpError(404, "Team endpoint not found.")
  } catch (error) { return failure(request, error) }
})
