import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const supabaseRoot = new URL("../", import.meta.url)
const repoRoot = new URL("../", supabaseRoot)
const readSupabase = (path) => readFile(new URL(path, supabaseRoot), "utf8")
const readRepo = (path) => readFile(new URL(path, repoRoot), "utf8")

const [team, teamReadModel, backend, authEmail, dexter, userValidationGrant, userLifecycle, deletionCompatibility, deletionLintCompatibility, deletionAuditEventType, settings, navigation, sidebarNavigation, adminPage, api, authFlow, authPage, app, translations, acceptInvitation, invitationTicket] = await Promise.all([
  readSupabase("functions/team/index.ts"),
  readSupabase("functions/_shared/team-read-model.ts"),
  readSupabase("functions/_shared/backend.ts"),
  readSupabase("functions/send-auth-email/index.ts"),
  readSupabase("functions/agent-dexter/index.ts"),
  readSupabase("migrations/20260812095000_grant_service_role_user_validation.sql"),
  readSupabase("migrations/20260813092802_user_access_lifecycle.sql"),
  readSupabase("migrations/20260813110604_fix_user_deletion_tenant_compatibility.sql"),
  readSupabase("migrations/20260813111030_fix_user_deletion_optional_preference_lint.sql"),
  readSupabase("migrations/20260818135338_fix_user_deletion_audit_event_type.sql"),
  readRepo("multideck.client/src/pages/settings-page.tsx"),
  readRepo("multideck.client/src/data/settings-navigation.ts"),
  readRepo("multideck.client/src/data/navigation-data.ts"),
  readRepo("multideck.client/src/pages/admin-page.tsx"),
  readRepo("multideck.client/src/lib/api.ts"),
  readRepo("multideck.client/src/components/multideck/auth-flow.tsx"),
  readRepo("multideck.client/src/pages/auth-flow-page.tsx"),
  readRepo("multideck.client/src/App.tsx"),
  readRepo("multideck.client/src/i18n/translate.ts"),
  readSupabase("functions/accept-invitation/index.ts"),
  readSupabase("functions/_shared/invitation-ticket.ts"),
])

test("Users is available under tenant-admin-only Admin and uses the existing management surface", () => {
  assert.doesNotMatch(navigation, /id: "users"/)
  assert.match(sidebarNavigation, /label: "Admin"[\s\S]*?label: "Users"[\s\S]*?route: "\/admin\/users"/)
  assert.match(settings, /export function AdminUsersContent\(\)/)
  assert.match(settings, /storageKey="settings-users-v4"/)
  assert.match(adminPage, /<AdminUsersContent \/>/)
  assert.match(app, /isTenantAdministrator\(currentUser\)/)
  assert.match(settings, /Invite people, assign reusable roles and manage workspace access in one place\./)
})

test("invitations are host-aware and cannot redirect to an arbitrary origin", () => {
  assert.match(settings, /appOrigin: window\.location\.origin/)
  assert.match(team, /requestedOrigin !== requestOrigin/)
  assert.match(team, /isTrustedMultideckOrigin\(requestedOrigin\)/)
  assert.match(backend, /APP_ALLOWED_ORIGINS/)
  assert.match(team, /`\$\{appOrigin\}\/auth\?mode=invite`/)
  assert.match(backend, /hostname\.endsWith\("\.multideck\.app"\)/)
  assert.match(api, /appOrigin: string/)
  assert.match(team, /legacy auth trigger provisions a default workspace profile/)
  assert.match(team, /eq\("Auth_User_ID", authUserId\)\.maybeSingle\(\)/)
  assert.match(userValidationGrant, /grant execute on function private\.is_valid_sidebar_layout\(jsonb\) to service_role/)
  assert.match(userValidationGrant, /grant execute on function private\.is_valid_table_pinned_columns\(jsonb\) to service_role/)
})

test("pending invitations can be resent only through the tenant-safe server path", () => {
  assert.match(teamReadModel, /invitationPending \? "Invited"/)
  assert.match(team, /import \{[^}]*isPendingInvitation[^}]*\} from "\.\.\/_shared\/team-read-model\.ts"/)
  assert.match(team, /parts\[1\] === "invitation"/)
  assert.match(team, /requirePermission\(admin, current\.User_ID, "Users\.Invite"\)/)
  assert.match(team, /eq\("Company_ID", current\.Company_ID\)/)
  assert.match(team, /This user has already accepted their invitation\./)
  assert.match(teamReadModel, /multideck_password_created_at/)
  assert.match(team, /resetPasswordForEmail\(target\.User_Email/)
  assert.match(team, /admin\.auth\.admin\.inviteUserByEmail\(target\.User_Email/)
  assert.match(settings, /resendApiTeamUserInvitation/)
  assert.match(settings, /user\.status === "Invited"/)
  assert.match(settings, /Resend invite/)
  assert.match(settings, /Delete invite/)
  assert.match(settings, /deleteApiTeamUserInvitation\(session\.access_token, deleteInviteCandidate\.id\)/)
  assert.match(api, /`\/\$\{userId\}\/invitation`/)
  assert.match(acceptInvitation, /multideck_password_created_at/)
})

test("the branded invite opens password creation without a consumable auth link or code", () => {
  assert.match(authEmail, /buttonLabel: "Accept invitation"/)
  assert.match(authEmail, /then create your password to enter the workspace/)
  assert.match(authEmail, /code: key === "magiclink"/)
  assert.match(authPage, /mode === "invite" \? "accept-invite"/)
  assert.match(authFlow, /Set your password/)
  assert.match(authFlow, /Create my password/)
  assert.match(authFlow, /step === "accept-invite"[\s\S]*?goToApp\(\)/)
  assert.match(app, /authMode === "reset-password" \|\| authMode === "invite"/)
  assert.match(authFlow, /ensurePasswordUpdateSession\(\)/)
  assert.match(authEmail, /createInvitationTicket\(userId, serviceRoleKey, expiry\)/)
  assert.match(authEmail, /confirmationUrl\.searchParams\.set\("ticket"/)
  assert.doesNotMatch(authEmail, /key === "invite" \? payload\.email_data\.token/)
  assert.match(authFlow, /functions\.invoke<\{ email\?: string \}>\("accept-invitation"/)
  assert.match(authFlow, /acceptedInvitation\.email,[\s\S]*?password/)
  assert.match(acceptInvitation, /verifyInvitationTicket\(ticket, serviceRoleKey\)/)
  assert.match(acceptInvitation, /admin\.auth\.admin\.updateUserById/)
  assert.match(acceptInvitation, /email_confirm: true/)
  assert.match(acceptInvitation, /app_metadata:/)
  assert.doesNotMatch(authFlow, /inviteVerification\.type/)
  assert.doesNotMatch(authFlow, /Confirm your invitation/)
  assert.match(authFlow, /Invitation link unavailable/)
  assert.match(invitationTicket, /mail scanner|not consumed|multideck-invitation/)
  assert.match(authFlow, /minLength=\{8\}/)
  assert.match(authFlow, /password\.length < 8/)
  assert.match(acceptInvitation, /password\.length < 8/)
  assert.match(acceptInvitation, /between 8 and 128 characters/)
  assert.doesNotMatch(authFlow, /at least 12 characters/)
})

test("invitation expiry is selected by the administrator and signed into the link", () => {
  assert.match(settings, /Invite expires/)
  for (const value of ["3d", "7d", "30d", "never"]) assert.match(settings, new RegExp(`value="${value}"`))
  assert.match(settings, /invitationExpiry: inviteForm\.invitationExpiry/)
  assert.match(api, /invitationExpiry: ApiInvitationExpiry/)
  assert.match(team, /invitationExpiry\(payload\.invitationExpiry\)/)
  assert.match(team, /multideck_invitation_expiry: expiry/)
  assert.match(authEmail, /multideck_invitation_expiry/)
  assert.match(invitationTicket, /"3d": 3 \* 24 \* 60 \* 60/)
  assert.match(invitationTicket, /"30d": 30 \* 24 \* 60 \* 60/)
  assert.match(invitationTicket, /expiry === "never" \? null/)
})

test("permissions are user-first with protected predefined roles and reusable saved roles", () => {
  assert.match(settings, /function AdminUsersContent\(\)/)
  assert.match(settings, /storageKey="settings-users-v4"/)
  assert.match(settings, /<(?:Pencil|EditUser02)/)
  assert.match(settings, /function RolePermissionMatrix/)
  assert.match(settings, /<DialogTitle className="text-balance">\{t\("Make a role"\)\}<\/DialogTitle>/)
  assert.match(settings, /createApiAuthorizationRole\(session\.access_token/)
  assert.match(settings, /Saved roles/)
  assert.match(settings, /getAssignableRoles/)
  assert.doesNotMatch(settings, /<SelectItem value="custom">/)
  assert.match(settings, /Read & write/)
  assert.match(settings, /updateApiTeamUser\(session\.access_token/)
  assert.match(settings, /previousRole\?\.isLegacyCustom/)
  assert.match(api, /isLegacyCustom: boolean/)
  assert.match(teamReadModel, /Reusable workspace role\./)
  assert.match(team, /Enable at least one permission before creating the role/)
  assert.match(team, /isLegacyCustomRoleName\(selectedRole\.sys_UserRole_Name\)/)
  assert.match(team, /Choose valid reusable roles/)
  for (const roleName of ["Administrator", "Operations manager", "Operator", "Viewer"]) {
    assert.match(teamReadModel, new RegExp(`${roleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*canEditPermissions: false`))
  }
  assert.match(team, /protect && SYSTEM_ROLES\[role\.sys_UserRole_Name\]/)
  assert.match(team, /Built-in role permissions cannot be changed/)
})

test("Users reads require bounded pages and never enumerate the Auth directory", () => {
  assert.match(team, /Workspace user lists require bounded paging/)
  assert.match(team, /listTeamPage\(admin, current, request\)/)
  assert.match(team, /authorizationCatalogueReadModel\(admin\)/)
  assert.doesNotMatch(teamReadModel, /auth\.admin\.listUsers|AUTH_USERS_PER_PAGE/)
  assert.match(teamReadModel, /fallbackAuthUsers/)
  assert.match(teamReadModel, /bulkLinks\(admin, "cmp_Users_Offices"/)
  assert.match(teamReadModel, /bulkLinks\(admin, "cmp_Users_Roles"/)
  assert.match(teamReadModel, /bulkLinks\(admin, "cmp_Users_Departments"/)
  assert.match(team, /rpc\("multideck_other_active_admin_exists"/)
  assert.doesNotMatch(team, /Promise\.all\(\(users \?\? \[\]\)\.map/)
  assert.doesNotMatch(team, /Promise\.all\(\(roles \?\? \[\]\)\.map/)
})

test("user deletion is confirmed in the client and constrained in the tenant service", () => {
  assert.match(settings, /Permanently delete this user\?/)
  assert.match(settings, /deleteApiTeamUser/)
  assert.match(api, /method: "DELETE"/)
  assert.match(team, /You cannot delete your own Multideck access/)
  assert.match(team, /ensureAdministratorSurvives/)
  assert.match(team, /admin\.auth\.admin\.deleteUser/)
  assert.match(team, /User_DeleteWithReassignment/)
  assert.match(team, /impactToken/)
  assert.match(settings, /Reassign active work before deletion/)
  assert.match(settings, /Type \{name\} to confirm/)
  assert.match(settings, /CopyFeedbackTransition/)
  assert.match(settings, /animateIntrinsicWidth/)
  assert.match(settings, /CopyStatusIcon/)
  assert.match(settings, /copyDeletionConfirmationName/)
  assert.match(settings, /document\.execCommand\("copy"\)/)
  assert.match(settings, /deletionConfirmation\.trim\(\) !== deleteCandidate\?\.displayName\.trim\(\)/)
  assert.match(team, /confirmationName = \[target\.User_Firstname, target\.User_Lastname\]/)
  assert.match(team, /String\(payload\.confirmation\)\.trim\(\) !== confirmationName/)
  assert.match(settings, /eligibleUsers/)
  assert.match(api, /deletion-impact/)
  assert.match(api, /replacementUserId/)
  assert.match(team, /User_DeletionCleanupPending/)
  assert.match(team, /personal file cleanup is still pending/)
  assert.match(team, /sendUserDeletionEmail\(target, String\(result\?\.deletionReference/)
  assert.match(team, /Idempotency-Key.*user-deletion-/s)
  assert.match(team, /notificationEmail = \{[\s\S]*?status: "sent"/)
  assert.match(team, /Account deletion email delivery failed/)
  assert.match(settings, /User deleted, but their email could not be sent/)
  assert.match(settings, /A deletion confirmation email was sent to \{email\}\./)
  for (const migration of [userLifecycle, deletionCompatibility, deletionLintCompatibility]) {
    assert.match(migration, /to_regclass\('public\."cmp_Users_Departments"'\)[\s\S]*?delete from public\."cmp_Users_Departments"/)
    assert.match(migration, /attname = 'User_DefaultInboxProviderCode'[\s\S]*?execute format\([\s\S]*?'update public\."cmp_Users" set %I = null/)
    assert.match(migration, /select attname[\s\S]*?attname = 'User_DefaultInboxProviderCode'/)
    assert.doesNotMatch(migration, /^\s*"User_DefaultInboxProviderCode" = null,/m)
    assert.doesNotMatch(migration, /execute 'update public\."cmp_Users" set "User_DefaultInboxProviderCode" = null/)
  }
  assert.match(deletionAuditEventType, /on conflict \("AuditEventType_Code"\) do nothing/)
  assert.match(deletionAuditEventType, /"Audit_LogBusinessEvent"\([\s\S]*?'business_event', 'user'/)
  assert.doesNotMatch(deletionAuditEventType, /'user\.deleted'/)
  assert.doesNotMatch(settings.slice(settings.indexOf("function UserPermissionsTab"), settings.indexOf("const mailProviderCopy")), /deleteApiTeamUser/)
})

test("active users can be edited, deactivated and reactivated through the tenant-safe service", () => {
  assert.match(settings, /Edit user/)
  assert.match(settings, /updateApiTeamUser/)
  assert.match(settings, /updateApiTeamUserStatus/)
  assert.match(team, /updateTeamUser/)
  assert.match(team, /setUserAccessStatus/)
  assert.match(team, /ban_duration: "876000h"/)
  assert.match(team, /ban_duration: "none"/)
  assert.match(team, /You cannot change your own access status/)
  assert.match(team, /User_AccessStatus: "deactivated"/)
  assert.match(team, /target\.User_AccessStatus === "active"[\s\S]*?ban_duration: "none"/)
  assert.match(team, /cmp_Users_Departments/)
  assert.match(team, /parts\[0\] === "departments"[\s\S]*?requirePermission\(admin, current\.User_ID, "Users\.Manage"\)/)
  assert.match(team, /Department_Name: name/)
  assert.match(api, /createApiDepartment/)
  assert.match(settings, /createAndAssignDepartment/)
  assert.match(settings, /No departments yet\. Create the first one below\./)
  const editDialog = settings.slice(settings.indexOf('<Dialog open={Boolean(editingUser)}'), settings.indexOf('<Dialog open={Boolean(statusCandidate)}'))
  assert.match(editDialog, /Departments/)
  assert.match(editDialog, /editForm\.departmentIds/)
  assert.match(editDialog, /Create department/)
  assert.match(settings, /departmentIds: inviteForm\.departmentIds/)
  assert.match(settings, /departmentIds: editForm\.departmentIds/)
})

test("tenant administrators can reset an active user's Supabase password without exposing admin credentials", () => {
  assert.match(settings, /<KeyRound/)
  assert.match(settings, /Reset password/)
  assert.match(settings, /Reset \{name\}’s password/)
  assert.match(settings, /Choose a new password for \{name\}\. It will be used at the next sign-in\. Existing sessions will stay active\./)
  const resetDialog = settings.slice(settings.indexOf('<Dialog open={Boolean(passwordCandidate)}'), settings.indexOf('<Dialog open={Boolean(editingUser)}'))
  assert.doesNotMatch(resetDialog, /Supabase/i)
  assert.match(settings, /resetApiTeamUserPassword\(session\.access_token, passwordCandidate\.id, newUserPassword\)/)
  assert.match(settings, /user\.authUserId === currentAuthUserId \|\| user\.status !== "Active" \|\| !user\.authUserId/)
  assert.match(api, /`\/\$\{userId\}\/password`/)
  assert.match(team, /parts\[1\] === "password"[\s\S]*?requirePermission\(admin, current\.User_ID, "Users\.Manage"\)/)
  assert.match(team, /resetTeamUserPassword/)
  assert.match(team, /eq\("Company_ID", current\.Company_ID\)/)
  assert.match(team, /target\.User_ID === current\.User_ID/)
  assert.match(team, /target\.User_AccessStatus !== "active" \|\| !target\.Auth_User_ID/)
  assert.match(team, /authRecord\.user\.email\.toLowerCase\(\) !== String\(target\.User_Email\)\.toLowerCase\(\)/)
  assert.match(team, /admin\.auth\.admin\.updateUserById\(target\.Auth_User_ID, \{[\s\S]*?password,[\s\S]*?multideck_password_created_at/)
  assert.match(team, /AuditEvent_Action: "reset_password"/)
  assert.match(team, /AuditEvent_IsSensitive: true/)
  assert.match(team, /AuditEvent_MetadataJSON: \{ administratorPasswordReset: true \}/)
  assert.doesNotMatch(team.slice(team.indexOf("async function resetTeamUserPassword"), team.indexOf("async function authorizationState")), /Supabase sign-in|audit service/)
  assert.doesNotMatch(api, /service[_-]?role/i)
})

test("Dexter clearly declines high-impact identity writes and idle user watches", () => {
  assert.match(dexter, /Workspace user invitations, password resets, department catalogue and membership changes, role assignments, custom permission changes and user deletion/)
  assert.match(dexter, /deliberately not connected to Dexter writes or Watching for you/)
  assert.match(dexter, /direct a tenant administrator to Admin > Users/)
})

test("new user-management language is available in German, French, and Arabic", () => {
  for (const phrase of ["Developer / Users", "Invite a user", "Invited", "Resend invite", "Delete invite", "Delete this invitation?", "Create a role", "Saved roles", "Role access", "Edit user permissions", "Read & write", "Edit user", "Deactivated", "Permanently delete this user?", "Reassign active work before deletion", "Type {name} to confirm", "Copy name", "Name copied", "Set your password", "Invite expires", "Never (until accepted)", "Reset password", "Resetting password", "Password reset", "Password could not be reset", "Passwords do not match."]) {
    const start = translations.indexOf(`"${phrase}"`)
    assert.notEqual(start, -1, `${phrase} is missing`)
    const entry = translations.slice(start, start + 700)
    assert.match(entry, /de:/)
    assert.match(entry, /fr:/)
    assert.match(entry, /ar:/)
  }
})
