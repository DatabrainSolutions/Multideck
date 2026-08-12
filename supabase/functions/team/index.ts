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

function invitationOrigin(request: Request, value: unknown) {
  const requestOrigin = request.headers.get("Origin")?.trim() ?? ""
  const requestedOrigin = String(value ?? "").trim().replace(/\/+$/, "")
  if (!requestedOrigin || requestedOrigin !== requestOrigin || !isTrustedMultideckOrigin(requestedOrigin)) {
    throw new HttpError(400, "The invitation must return to the Multideck workspace that sent it.")
  }
  return requestedOrigin
}

async function userDto(admin: any, row: any) {
  const [{ data: company }, { data: officeLinks }, { data: roleLinks }] = await Promise.all([
    row.Company_ID ? admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", row.Company_ID).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", row.User_ID),
    admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", row.User_ID),
  ])
  const officeIds = (officeLinks ?? []).map((item: any) => item.Office_ID)
  const roleIds = (roleLinks ?? []).map((item: any) => item.sys_UserRole_ID)
  const [{ data: offices }, { data: roles }] = await Promise.all([
    officeIds.length ? admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").in("Office_ID", officeIds).order("Office_Name") : Promise.resolve({ data: [] }),
    roleIds.length ? admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds).order("sys_UserRole_Name") : Promise.resolve({ data: [] }),
  ])
  const makePhoto = (kind: string) => row[`User_${kind}PhotoPath`] ? ({
    bucket: row[`User_${kind}PhotoBucket`], path: row[`User_${kind}PhotoPath`], mimeType: row[`User_${kind}PhotoMimeType`],
    sizeBytes: row[`User_${kind}PhotoSizeBytes`], updatedAt: row[`User_${kind}PhotoUpdatedAt`],
  }) : null
  return {
    id: row.User_ID, authUserId: row.Auth_User_ID, displayName: [row.User_Firstname, row.User_Lastname].filter(Boolean).join(" ") || row.User_Email,
    firstName: row.User_Firstname, lastName: row.User_Lastname, email: row.User_Email,
    company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: (offices ?? []).map((item: any) => ({ id: item.Office_ID, name: item.Office_Name, address: item.Office_Address })),
    roles: (roles ?? []).map((item: any) => ({ id: item.sys_UserRole_ID, name: item.sys_UserRole_Name })),
    status: row.Auth_User_ID ? "Active" : "Profile only", jobTitle: row.User_JobTitle,
    profilePhoto: makePhoto("Profile"), coverPhoto: makePhoto("Cover"),
  }
}

async function listTeam(admin: any, current: any) {
  if (!current.Company_ID) throw new HttpError(403, "Your Multideck user is not assigned to a company yet.")
  const [{ data: company }, { data: offices }, { data: users, error }] = await Promise.all([
    admin.from("cmp_Company").select("Company_ID,Company_Name").eq("Company_ID", current.Company_ID).maybeSingle(),
    admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address").eq("Company_ID", current.Company_ID).order("Office_Name"),
    admin.from("cmp_Users").select("*").eq("Company_ID", current.Company_ID).order("User_Firstname").order("User_Lastname").order("User_Email"),
  ])
  if (error) throw new HttpError(500, error.message)
  return {
    company: company ? { id: company.Company_ID, name: company.Company_Name } : null,
    offices: (offices ?? []).map((item: any) => ({ id: item.Office_ID, name: item.Office_Name, address: item.Office_Address })),
    users: await Promise.all((users ?? []).map((item: any) => userDto(admin, item))),
  }
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
    return { id: role.sys_UserRole_ID, name: role.sys_UserRole_Name, description: definition?.description ?? "Custom role.", isSystem: Boolean(definition), canEditPermissions: definition?.canEditPermissions ?? true, permissionValues: (values ?? []).map((item: any) => item.sys_Permission_Value) }
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
  const { data: existing } = await admin.from("sys_UserRoles").select("sys_UserRole_ID").ilike("sys_UserRole_Name", name).maybeSingle()
  if (existing) throw new HttpError(409, "A role with this name already exists.")
  const { data: role, error } = await admin.from("sys_UserRoles").insert({ sys_UserRole_Name: name }).select().single()
  if (error) throw new HttpError(error.code === "23505" ? 409 : 500, error.message)
  await setRolePermissions(admin, role.sys_UserRole_ID, payload.permissionValues ?? [], false)
  return (await authorizationState(admin, { Company_ID: "00000000-0000-0000-0000-000000000000" })).roles.find((item: any) => item.id === role.sys_UserRole_ID)
}

async function setRolePermissions(admin: any, roleId: string, values: string[], protect = true) {
  const { data: role } = await admin.from("sys_UserRoles").select("*").eq("sys_UserRole_ID", roleId).maybeSingle()
  if (!role) throw new HttpError(404, "Choose a valid role before changing permissions.")
  if (protect && SYSTEM_ROLES[role.sys_UserRole_Name]) throw new HttpError(400, "Built-in role permissions cannot be changed.")
  const normalized = [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))]
  const { data: permissions } = normalized.length ? await admin.from("sys_Permissions").select("sys_Permission_ID,sys_Permission_Value").in("sys_Permission_Value", normalized) : { data: [] }
  if ((permissions ?? []).length !== normalized.length) throw new HttpError(400, "Choose valid permissions before updating the role.")
  await admin.from("sys_UserRole_Permissions").delete().eq("sys_UserRole_ID", roleId)
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
    if (!parts.length && request.method === "POST") {
      await requirePermission(admin, current.User_ID, "Users.Invite")
      const payload = await body<any>(request); const email = String(payload.email ?? "").trim().toLowerCase()
      const appOrigin = invitationOrigin(request, payload.appOrigin)
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a valid email address.")
      const { data: office } = await admin.from("cmp_Offices").select("*").eq("Office_ID", payload.officeId).eq("Company_ID", current.Company_ID).maybeSingle()
      if (!office) throw new HttpError(400, "Choose a valid office in this company.")
      let { data: profile } = await admin.from("cmp_Users").select("*").ilike("User_Email", email).maybeSingle()
      if (profile?.Company_ID && profile.Company_ID !== current.Company_ID) throw new HttpError(409, "This email is already linked to another company profile.")
      if (payload.roleId) { const { data: selectedRole } = await admin.from("sys_UserRoles").select("sys_UserRole_ID").eq("sys_UserRole_ID", payload.roleId).maybeSingle(); if (!selectedRole) throw new HttpError(400, "Choose a valid role before inviting the user.") }
      let invited = false; let authUserId = profile?.Auth_User_ID ?? null
      if (!authUserId) {
        const redirectTo = `${appOrigin}/auth?mode=invite`
        const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { first_name: payload.firstName ?? null, last_name: payload.lastName ?? null } })
        if (error) throw new HttpError(400, error.message)
        authUserId = invite.user.id; invited = true
      }
      const row = { Company_ID: current.Company_ID, User_Email: email, User_Firstname: payload.firstName?.trim() || null, User_Lastname: payload.lastName?.trim() || null, Auth_User_ID: authUserId }
      if (profile) await admin.from("cmp_Users").update(row).eq("User_ID", profile.User_ID)
      else { const created = await admin.from("cmp_Users").insert(row).select().single(); if (created.error) throw new HttpError(500, created.error.message); profile = created.data }
      await admin.from("cmp_Users_Offices").delete().eq("User_ID", profile.User_ID)
      await admin.from("cmp_Users_Offices").insert({ User_ID: profile.User_ID, Office_ID: office.Office_ID })
      if (payload.roleId) { await admin.from("cmp_Users_Roles").delete().eq("User_ID", profile.User_ID); await admin.from("cmp_Users_Roles").insert({ User_ID: profile.User_ID, sys_UserRole_ID: payload.roleId }) }
      profile = (await admin.from("cmp_Users").select("*").eq("User_ID", profile.User_ID).single()).data
      return json(request, { user: await userDto(admin, profile), company: { id: current.Company_ID, name: (await admin.from("cmp_Company").select("Company_Name").eq("Company_ID", current.Company_ID).single()).data.Company_Name }, office: { id: office.Office_ID, name: office.Office_Name, address: office.Office_Address }, invited }, 201)
    }
    if (parts.length === 1 && request.method === "DELETE") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      const { data: target } = await admin.from("cmp_Users").select("*").eq("User_ID", parts[0]).eq("Company_ID", current.Company_ID).maybeSingle()
      if (!target) throw new HttpError(404, "User not found.")
      if (target.User_ID === current.User_ID) throw new HttpError(400, "You cannot remove your own Multideck access.")

      const { data: administrator } = await admin.from("sys_UserRoles").select("sys_UserRole_ID").eq("sys_UserRole_Name", "Administrator").maybeSingle()
      if (administrator) {
        const { data: targetRoles } = await admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", target.User_ID)
        if ((targetRoles ?? []).some((role: any) => role.sys_UserRole_ID === administrator.sys_UserRole_ID)) {
          const { data: companyUsers } = await admin.from("cmp_Users").select("User_ID").eq("Company_ID", current.Company_ID).neq("User_ID", target.User_ID)
          const otherIds = (companyUsers ?? []).map((companyUser: any) => companyUser.User_ID)
          const { count } = otherIds.length ? await admin.from("cmp_Users_Roles").select("*", { count: "exact", head: true }).in("User_ID", otherIds).eq("sys_UserRole_ID", administrator.sys_UserRole_ID) : { count: 0 }
          if (!count) throw new HttpError(400, "Keep at least one administrator in the company before removing this user.")
        }
      }

      if (target.Auth_User_ID) {
        const { error: authError } = await admin.auth.admin.deleteUser(target.Auth_User_ID)
        if (authError) throw new HttpError(500, "The user's sign-in access could not be revoked. No profile changes were made.")
      }
      const { error: officeError } = await admin.from("cmp_Users_Offices").delete().eq("User_ID", target.User_ID)
      if (officeError) throw new HttpError(500, officeError.message)
      const { error: roleError } = await admin.from("cmp_Users_Roles").delete().eq("User_ID", target.User_ID)
      if (roleError) throw new HttpError(500, roleError.message)
      const { error: profileError } = await admin.from("cmp_Users").update({ Company_ID: null, Auth_User_ID: null }).eq("User_ID", target.User_ID)
      if (profileError) throw new HttpError(500, profileError.message)
      return json(request, null, 204)
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
        const { data: roles } = await admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds); if ((roles ?? []).length !== roleIds.length) throw new HttpError(400, "Choose valid roles.")
        const { data: administrator } = await admin.from("sys_UserRoles").select("sys_UserRole_ID").eq("sys_UserRole_Name", "Administrator").maybeSingle()
        if (administrator && !(roles ?? []).some((role: any) => role.sys_UserRole_ID === administrator.sys_UserRole_ID)) {
          const { data: existingTargetRoles } = await admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", target.User_ID)
          if ((existingTargetRoles ?? []).some((role: any) => role.sys_UserRole_ID === administrator.sys_UserRole_ID)) {
            const { data: companyUsers } = await admin.from("cmp_Users").select("User_ID").eq("Company_ID", current.Company_ID).neq("User_ID", target.User_ID)
            const otherIds = (companyUsers ?? []).map((companyUser: any) => companyUser.User_ID)
            const { count } = otherIds.length ? await admin.from("cmp_Users_Roles").select("*", { count: "exact", head: true }).in("User_ID", otherIds).eq("sys_UserRole_ID", administrator.sys_UserRole_ID) : { count: 0 }
            if (!count) throw new HttpError(400, "Keep at least one administrator in the company before changing this user's roles.")
          }
        }
        await admin.from("cmp_Users_Roles").delete().eq("User_ID", target.User_ID); await admin.from("cmp_Users_Roles").insert(roleIds.map((id: string) => ({ User_ID: target.User_ID, sys_UserRole_ID: id })))
        return json(request, { userId: target.User_ID, roleIds })
      }
    }
    throw new HttpError(404, "Team endpoint not found.")
  } catch (error) { return failure(request, error) }
})
