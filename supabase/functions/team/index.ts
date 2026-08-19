import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, isTrustedMultideckOrigin, json, requirePermission, routeParts } from "../_shared/backend.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"
import { normaliseLocale, renderBrandedEmail } from "../_shared/email-template.ts"
import { authorizationCatalogueReadModel, isLegacyCustomRoleName, isPendingInvitation, singleTeamUserReadModel, SYSTEM_ROLES, teamCatalogueReadModel, teamUsersByIdsReadModel, teamUsersPageCompatibilityReadModel } from "../_shared/team-read-model.ts"

type DeletionEmailLocale = "en" | "de" | "fr" | "ar"

const deletionEmailCopy: Record<DeletionEmailLocale, {
  subject: string
  preview: string
  title: string
  greeting: (name: string) => string
  body: string[]
  eyebrow: string
  footer: string
}> = {
  en: {
    subject: "Your Multideck account has been deleted",
    preview: "Your Multideck workspace access has been removed.",
    title: "Your account has been deleted",
    greeting: (name) => `Hello ${name},`,
    body: ["A workspace administrator has deleted your Multideck account. Your sign-in and access to this workspace have been removed.", "You do not need to take any action."],
    eyebrow: "Account update",
    footer: "If you believe this was a mistake, reply to this email and the Multideck team will help.",
  },
  de: {
    subject: "Dein Multideck-Konto wurde gelöscht",
    preview: "Dein Zugang zum Multideck-Arbeitsbereich wurde entfernt.",
    title: "Dein Konto wurde gelöscht",
    greeting: (name) => `Hallo ${name},`,
    body: ["Ein Administrator hat dein Multideck-Konto gelöscht. Deine Anmeldung und dein Zugang zu diesem Arbeitsbereich wurden entfernt.", "Du musst nichts weiter tun."],
    eyebrow: "Kontoaktualisierung",
    footer: "Wenn du glaubst, dass dies ein Fehler war, antworte auf diese E-Mail. Das Multideck-Team hilft dir weiter.",
  },
  fr: {
    subject: "Votre compte Multideck a été supprimé",
    preview: "Votre accès à l’espace Multideck a été supprimé.",
    title: "Votre compte a été supprimé",
    greeting: (name) => `Bonjour ${name},`,
    body: ["Un administrateur a supprimé votre compte Multideck. Votre connexion et votre accès à cet espace ont été retirés.", "Vous n’avez aucune action à effectuer."],
    eyebrow: "Mise à jour du compte",
    footer: "Si vous pensez qu’il s’agit d’une erreur, répondez à cet e-mail. L’équipe Multideck vous aidera.",
  },
  ar: {
    subject: "تم حذف حساب Multideck الخاص بك",
    preview: "تمت إزالة وصولك إلى مساحة عمل Multideck.",
    title: "تم حذف حسابك",
    greeting: (name) => `مرحبًا ${name}،`,
    body: ["حذف مسؤول مساحة العمل حساب Multideck الخاص بك. تمت إزالة تسجيل دخولك ووصولك إلى مساحة العمل هذه.", "لا يلزمك اتخاذ أي إجراء."],
    eyebrow: "تحديث الحساب",
    footer: "إذا كنت تعتقد أن هذا حدث عن طريق الخطأ، فرد على هذه الرسالة وسيساعدك فريق Multideck.",
  },
}

async function sendUserDeletionEmail(target: any, deletionReference: string) {
  const recipient = String(target.User_Email ?? "").trim().toLowerCase()
  if (!recipient || recipient.endsWith("@redacted.invalid")) throw new Error("The deleted user does not have a deliverable email address.")
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim()
  if (!apiKey) throw new Error("Account deletion email delivery is not configured.")

  const locale = normaliseLocale(target.User_Locale) as DeletionEmailLocale
  const copy = deletionEmailCopy[locale]
  const name = String(target.User_Firstname ?? "").trim()
  const body = name ? [copy.greeting(name), ...copy.body] : copy.body
  const rendered = renderBrandedEmail({
    subject: copy.subject,
    preview: copy.preview,
    title: copy.title,
    body,
    eyebrow: copy.eyebrow,
    footer: copy.footer,
    locale,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `user-deletion-${deletionReference}`,
      },
      body: JSON.stringify({
        from: MULTIDECK_EMAIL_FROM,
        reply_to: MULTIDECK_EMAIL_REPLY_TO,
        to: [recipient],
        subject: copy.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    })
    const payload = await response.json().catch(() => ({})) as { id?: string }
    if (!response.ok) throw new Error(`Resend rejected the account deletion email (${response.status}).`)
    if (!payload.id) throw new Error("Resend accepted the account deletion email without returning a message ID.")
    return payload.id
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Resend timed out before accepting the account deletion email.")
    throw error
  } finally {
    clearTimeout(timeout)
  }
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

async function userDto(admin: any, row: any) {
  return singleTeamUserReadModel(admin, row)
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback
}

const teamUserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function lookupTeamUsers(admin: any, current: any, request: Request) {
  if (!current.Company_ID) throw new HttpError(403, "Your Multideck user is not assigned to a company yet.")
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))]
  if (ids.length > 50 || ids.some((value) => !teamUserIdPattern.test(value))) {
    throw new HttpError(400, "Choose up to 50 valid team users.")
  }
  return { users: await teamUsersByIdsReadModel(admin, current.Company_ID, ids) }
}

async function listTeamPage(admin: any, current: any, request: Request) {
  if (!current.Company_ID) throw new HttpError(403, "Your Multideck user is not assigned to a company yet.")
  const url = new URL(request.url)
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 200)
  const sortBy = new Set(["user", "office", "role", "status"]).has(url.searchParams.get("sort") ?? "")
    ? url.searchParams.get("sort")!
    : "user"
  const sortDirection = url.searchParams.get("direction") === "desc" ? "desc" : "asc"
  const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 50)
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 2_147_483_647)

  const [{ data, error }, catalogue] = await Promise.all([
    admin.rpc("multideck_team_users_register_page", {
      p_company_id: current.Company_ID,
      p_search: search,
      p_sort_by: sortBy,
      p_sort_direction: sortDirection,
      p_limit: limit,
      p_offset: offset,
    }),
    teamCatalogueReadModel(admin, current.Company_ID),
  ])
  if (!error) return { ...catalogue, ...(data ?? { users: [], total: 0, limit, offset }) }
  if (!["42883", "PGRST202"].includes(error.code ?? "")) throw new HttpError(500, error.message)

  const page = await teamUsersPageCompatibilityReadModel(admin, current.Company_ID, {
    search,
    sortBy,
    sortDirection,
    limit,
    offset,
  })
  return { ...catalogue, ...page }
}

async function replacementOptions(admin: any, current: any, targetUserId: string, request: Request) {
  if (!current.Company_ID) throw new HttpError(403, "Your Multideck user is not assigned to a company yet.")
  const { data: target } = await admin.from("cmp_Users").select("User_ID").eq("User_ID", targetUserId).eq("Company_ID", current.Company_ID).neq("User_AccessStatus", "deleted").maybeSingle()
  if (!target) throw new HttpError(404, "User not found.")
  const url = new URL(request.url)
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 200)
  const limit = boundedInteger(url.searchParams.get("limit"), 50, 1, 50)
  const { data, error } = await admin.rpc("multideck_team_user_replacement_options", {
    p_company_id: current.Company_ID,
    p_target_user_id: targetUserId,
    p_search: search,
    p_limit: limit,
  })
  if (error) throw new HttpError(500, error.message)
  return data ?? { users: [], total: 0 }
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

async function roleIdsForUser(admin: any, userId: string): Promise<string[]> {
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
  const { data: anotherAdministrator, error } = await admin.rpc("multideck_other_active_admin_exists", {
    p_company_id: companyId,
    p_excluded_user_id: targetUserId,
    p_role_ids: managingRoleIds,
  })
  if (error) {
    if (["42883", "PGRST202"].includes(error.code ?? "")) throw new HttpError(503, "Workspace administrator checks are still being prepared. Try again shortly.")
    throw new HttpError(500, error.message)
  }
  if (!anotherAdministrator) throw new HttpError(400, "Keep at least one active administrator who can manage users before changing this user.")
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

async function resetTeamUserPassword(admin: any, current: any, targetId: string, payload: any) {
  const password = typeof payload.password === "string" ? payload.password : ""
  if (password.length < 8 || password.length > 128) throw new HttpError(400, "The password must be between 8 and 128 characters.")

  const { data: target, error: targetError } = await admin.from("cmp_Users")
    .select("User_ID,Auth_User_ID,User_Email,User_AccessStatus")
    .eq("User_ID", targetId)
    .eq("Company_ID", current.Company_ID)
    .neq("User_AccessStatus", "deleted")
    .maybeSingle()
  if (targetError) throw new HttpError(500, targetError.message)
  if (!target) throw new HttpError(404, "User not found.")
  if (target.User_ID === current.User_ID) throw new HttpError(400, "Use Security settings to change your own password.")
  if (target.User_AccessStatus !== "active" || !target.Auth_User_ID) throw new HttpError(409, "Reactivate this user before resetting their password.")

  const { data: authRecord, error: authRecordError } = await admin.auth.admin.getUserById(target.Auth_User_ID)
  if (authRecordError || !authRecord?.user) throw new HttpError(404, "Unable to find this person's sign-in account. Refresh the page and try again.")
  if (!authRecord.user.email || authRecord.user.email.toLowerCase() !== String(target.User_Email).toLowerCase()) {
    throw new HttpError(409, "Unable to verify this person's sign-in account. Refresh the page and try again.")
  }

  const resetAt = new Date().toISOString()
  const { error: passwordError } = await admin.auth.admin.updateUserById(target.Auth_User_ID, {
    password,
    user_metadata: {
      ...authRecord.user.user_metadata,
      multideck_password_created_at: resetAt,
      multideck_password_reset_at: resetAt,
    },
  })
  if (passwordError) throw new HttpError(400, "Unable to reset the password. Check the password requirements and try again.")

  const { error: auditError } = await admin.from("Audit_Events").insert({
    AuditEvent_EventTypeCode: "security_event",
    AuditEvent_ActorTypeCode: "user",
    AuditEvent_UserID: current.User_ID,
    AuditEvent_AuthUserID: current.Auth_User_ID,
    AuditEvent_SourceApp: "Multideck App",
    AuditEvent_SourceModule: "Admin Users",
    AuditEvent_SourceTableSchema: "public",
    AuditEvent_SourceTableName: "cmp_Users",
    AuditEvent_RecordTypeCode: "user",
    AuditEvent_RecordID: target.User_ID,
    AuditEvent_RecordKeyJSON: { User_ID: target.User_ID },
    AuditEvent_Action: "reset_password",
    AuditEvent_Title: "User password reset",
    AuditEvent_IsSensitive: true,
    AuditEvent_SensitivityCode: "confidential",
    AuditEvent_MetadataJSON: { administratorPasswordReset: true },
  })
  if (auditError) throw new HttpError(500, "The password changed, but the activity record could not be saved. Do not reset it again. Contact support.")

  return { updated: true }
}

async function authorizationState(admin: any, current: any) {
  return authorizationCatalogueReadModel(admin)
}

async function createRole(admin: any, payload: any) {
  const name = String(payload.name ?? "").trim().replace(/\s+/g, " ")
  if (!name || name.length > 50) throw new HttpError(400, "Enter a role name of 50 characters or fewer.")
  if (isLegacyCustomRoleName(name)) throw new HttpError(400, "Choose a reusable role name instead of a user-specific Custom role name.")
  const permissionValues = [...new Set<string>((payload.permissionValues ?? []).map((value: unknown) => String(value).trim()).filter(Boolean))]
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
    if (!parts.length && request.method === "GET") throw new HttpError(400, "Workspace user lists require bounded paging.")
    if (parts.length === 1 && parts[0] === "page" && request.method === "GET") { await requirePermission(admin, current.User_ID, "Users.Read"); return json(request, await listTeamPage(admin, current, request)) }
    if (parts.length === 1 && parts[0] === "lookup" && request.method === "GET") { await requirePermission(admin, current.User_ID, "Users.Read"); return json(request, await lookupTeamUsers(admin, current, request)) }
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
      if (!profile) throw new HttpError(500, "The invited user profile could not be reloaded.")
      const { data: company } = await admin.from("cmp_Company").select("Company_Name").eq("Company_ID", current.Company_ID).single()
      if (!company) throw new HttpError(500, "The workspace company could not be reloaded.")
      return json(request, { user: await userDto(admin, profile), company: { id: current.Company_ID, name: company.Company_Name }, office: { id: office.Office_ID, name: office.Office_Name, address: office.Office_Address }, invited }, 201)
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
    if (parts.length === 2 && parts[1] === "password" && request.method === "PATCH") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      return json(request, await resetTeamUserPassword(admin, current, parts[0], await body(request)))
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
      return json(request, { ...impact, eligibleUsers: [] })
    }
    if (parts.length === 2 && parts[1] === "replacement-options" && request.method === "GET") {
      await requirePermission(admin, current.User_ID, "Users.Manage")
      return json(request, await replacementOptions(admin, current, parts[0], request))
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
      let notificationEmail: { status: "sent" | "failed" | "already_processed"; providerId: string | null } = {
        status: result?.alreadyDeleted ? "already_processed" : "failed",
        providerId: null,
      }
      if (!result?.alreadyDeleted) {
        try {
          notificationEmail = {
            status: "sent",
            providerId: await sendUserDeletionEmail(target, String(result?.deletionReference ?? "")),
          }
        } catch (error) {
          console.error("Account deletion email delivery failed", error)
        }
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
      return json(request, { ...publicResult, notificationEmail })
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
      if (parts.length === 2 && parts[1] === "catalogue" && request.method === "GET") { await requirePermission(admin, current.User_ID, "Authorization.Read"); return json(request, await authorizationCatalogueReadModel(admin)) }
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
        const payload = await body<any>(request); const roleIds = [...new Set<string>((payload.roleIds ?? []).map(String))]; if (!roleIds.length) throw new HttpError(400, "Choose at least one role.")
        const { data: target } = await admin.from("cmp_Users").select("User_ID").eq("User_ID", parts[2]).eq("Company_ID", current.Company_ID).maybeSingle(); if (!target) throw new HttpError(404, "User not found.")
        const { data: roles } = await admin.from("sys_UserRoles").select("sys_UserRole_ID,sys_UserRole_Name").in("sys_UserRole_ID", roleIds)
        if ((roles ?? []).length !== roleIds.length || (roles ?? []).some((role: any) => isLegacyCustomRoleName(role.sys_UserRole_Name))) throw new HttpError(400, "Choose valid reusable roles.")
        await ensureAdministratorSurvives(admin, current.Company_ID, target.User_ID, roleIds)
        await admin.from("cmp_Users_Roles").delete().eq("User_ID", target.User_ID); await admin.from("cmp_Users_Roles").insert(roleIds.map((id: string) => ({ User_ID: target.User_ID, sys_UserRole_ID: id })))
        return json(request, { userId: target.User_ID, roleIds })
      }
    }
    throw new HttpError(404, "Team endpoint not found.")
  } catch (error) { return failure(request, error) }
})
