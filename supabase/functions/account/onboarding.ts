import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.108.2"
import { body, currentInternalUser, HttpError, json } from "../_shared/backend.ts"
import { advanceOnboarding, advanceOnboardingTutorial, finishOnboarding, readOnboardingState } from "../_shared/account-onboarding.ts"
import { singleTeamUserReadModel } from "../_shared/team-read-model.ts"
import { requireMainIdentityAdministration } from "../_shared/training-environment.ts"

export async function accountOnboarding(request: Request, admin: SupabaseClient, user: User) {
  const current = await currentInternalUser(admin, user)
  if (!current.Company_ID) throw new HttpError(403, "Your profile needs a workspace before setup can continue.")
  const { data: departments, error: departmentError } = await admin.from("cmp_Departments")
    .select("Department_ID,Department_Name").eq("Company_ID", current.Company_ID).eq("Department_IsActive", true).order("Department_Name").limit(200)
  if (departmentError) throw new HttpError(500, "Your workspace departments could not be loaded.")
  const options = (departments ?? []).map((row) => ({ id: row.Department_ID, name: row.Department_Name }))
  const state = readOnboardingState(user.app_metadata?.multideck_onboarding)
  if (request.method === "GET") {
    const { data: appearance, error: appearanceError } = await admin.from("cmp_Users")
      .select("User_ThemeMode,User_AccentPreset").eq("User_ID", current.User_ID).eq("Auth_User_ID", user.id).eq("Company_ID", current.Company_ID).single()
    if (appearanceError || !appearance) throw new HttpError(500, "Your saved appearance could not be loaded. Please try again.")
    const profileIds = Array.isArray(user.user_metadata?.profile_department_ids) ? user.user_metadata.profile_department_ids : []
    return json(request, { state, profile: await singleTeamUserReadModel(admin, current), departments: options,
      preferredName: user.user_metadata?.preferred_name ?? current.User_Firstname ?? "",
      phone: user.user_metadata?.phone ?? "",
      hasProfileDepartments: Array.isArray(user.user_metadata?.profile_department_ids),
      themeMode: appearance.User_ThemeMode, accentPreset: appearance.User_AccentPreset,
      profileDepartmentIds: options.filter((option) => profileIds.includes(option.id)).map((option) => option.id),
    })
  }
  if (request.method !== "PATCH") throw new HttpError(405, "Method not allowed.")
  await requireMainIdentityAdministration(admin)
  if (!state) throw new HttpError(409, "This account has already been set up. You can change your details in Profile.")
  if (state.completedAt) return json(request, { state })
  const payload = await body<Record<string, unknown>>(request)
  let next = state
  let metadata = user.user_metadata
  try {
    if (payload.action === "profile") {
      if (state.step !== "work" && !state.completed.includes("work")) throw new Error("Complete the photo step first.")
      const jobTitle = typeof payload.jobTitle === "string" ? payload.jobTitle.trim() : ""
      const preferredName = typeof payload.preferredName === "string" ? payload.preferredName.trim() : ""
      const phone = typeof payload.phone === "string" ? payload.phone.trim() : ""
      if (jobTitle.length > 120 || preferredName.length > 80 || phone.length > 50) throw new Error("Keep your job title, preferred name and phone number within their limits.")
      if (!Array.isArray(payload.departmentIds) || payload.departmentIds.length > 200 || payload.departmentIds.some((id) => typeof id !== "string" || !options.some((option) => option.id === id))) throw new Error("Choose departments from this workspace.")
      const selected = options.filter((option) => (payload.departmentIds as string[]).includes(option.id))
      // These describe the profile only. cmp_Users_Departments controls access to
      // customs handoffs and must remain an administrator-managed assignment.
      metadata = { ...metadata, preferred_name: preferredName, phone, role_title: jobTitle, profile_department_ids: selected.map((option) => option.id), profile_departments: selected }
      const { data: savedProfile, error } = await admin.from("cmp_Users").update({ User_JobTitle: jobTitle || null }).eq("User_ID", current.User_ID).eq("Auth_User_ID", user.id).eq("Company_ID", current.Company_ID).select("User_ID,User_JobTitle").single()
      if (error || !savedProfile || savedProfile.User_JobTitle !== (jobTitle || null)) throw new HttpError(500, "Your profile could not be saved. Please try again.")
      next = advanceOnboarding(state, "work")
    } else if (payload.action === "advance") {
      next = advanceOnboarding(state, payload.step)
    } else if (payload.action === "tutorial") {
      next = advanceOnboardingTutorial(state, payload.stage)
    } else if (payload.action === "complete") {
      next = finishOnboarding(state)
    } else throw new Error("Choose a valid account setup action.")
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, error instanceof Error ? error.message : "Account setup could not be saved.")
  }
  // Audit contains no passwords, invitation tickets, phone numbers or provider tokens.
  const { error: auditError } = await admin.from("Audit_Events").insert({
    AuditEvent_EventTypeCode: "security_event", AuditEvent_ActorTypeCode: "user",
    AuditEvent_UserID: current.User_ID, AuditEvent_AuthUserID: user.id,
    AuditEvent_SourceApp: "Multideck App", AuditEvent_SourceModule: "Account setup",
    AuditEvent_SourceTableSchema: "public", AuditEvent_SourceTableName: "cmp_Users",
    AuditEvent_RecordTypeCode: "user", AuditEvent_RecordID: current.User_ID,
    AuditEvent_Action: "account_setup_requested", AuditEvent_Title: "Account setup progress requested",
    AuditEvent_MetadataJSON: { action: payload.action, step: next.step, tutorialStage: next.tutorialStage, completionRequested: Boolean(next.completedAt) },
  })
  if (auditError) throw new HttpError(500, "Your setup progress could not be recorded. Please try again.")
  const { data: savedUser, error: saveError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, multideck_onboarding: next }, user_metadata: metadata,
  })
  if (saveError || JSON.stringify(readOnboardingState(savedUser?.user?.app_metadata?.multideck_onboarding)) !== JSON.stringify(next)) throw new HttpError(500, "Your setup progress could not be saved. Please try again.")
  if (payload.action === "profile") {
    const savedMetadata = savedUser?.user?.user_metadata
    for (const key of ["preferred_name", "phone", "role_title", "profile_department_ids", "profile_departments"]) {
      if (JSON.stringify(savedMetadata?.[key]) !== JSON.stringify(metadata?.[key])) {
        throw new HttpError(500, "Your profile details could not be confirmed. Please try again.")
      }
    }
  }
  return json(request, { state: next })
}
