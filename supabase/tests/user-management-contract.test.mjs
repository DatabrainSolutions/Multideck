import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const supabaseRoot = new URL("../", import.meta.url)
const repoRoot = new URL("../", supabaseRoot)
const readSupabase = (path) => readFile(new URL(path, supabaseRoot), "utf8")
const readRepo = (path) => readFile(new URL(path, repoRoot), "utf8")

const [team, backend, authEmail, dexter, userValidationGrant, settings, navigation, api, authFlow, authPage, app, supabaseClient, translations] = await Promise.all([
  readSupabase("functions/team/index.ts"),
  readSupabase("functions/_shared/backend.ts"),
  readSupabase("functions/send-auth-email/index.ts"),
  readSupabase("functions/agent-dexter/index.ts"),
  readSupabase("migrations/20260812095000_grant_service_role_user_validation.sql"),
  readRepo("multideck.client/src/pages/settings-page.tsx"),
  readRepo("multideck.client/src/data/settings-navigation.ts"),
  readRepo("multideck.client/src/lib/api.ts"),
  readRepo("multideck.client/src/components/multideck/auth-flow.tsx"),
  readRepo("multideck.client/src/pages/auth-flow-page.tsx"),
  readRepo("multideck.client/src/App.tsx"),
  readRepo("multideck.client/src/lib/supabase.ts"),
  readRepo("multideck.client/src/i18n/translate.ts"),
])

test("Users is restored under the Developer settings section and uses the shared DataTable", () => {
  assert.match(navigation, /label: "Developer"[\s\S]*?id: "users"[\s\S]*?label: "Users"/)
  assert.match(settings, /function UsersTab\(\)/)
  assert.match(settings, /storageKey="settings-users"/)
  assert.match(settings, /case "users":[\s\S]*?<UsersTab \/>/)
  assert.match(settings, /Invite people to this Multideck workspace/)
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

test("the branded invite explicitly hands users to password creation", () => {
  assert.match(authEmail, /buttonLabel: "Accept invitation"/)
  assert.match(authEmail, /then create your password to enter the workspace/)
  assert.match(authEmail, /code: key === "magiclink"/)
  assert.match(authPage, /mode === "invite" \? "accept-invite"/)
  assert.match(authFlow, /Set your password/)
  assert.match(authFlow, /Create my password/)
  assert.match(authFlow, /step === "accept-invite"[\s\S]*?goToApp\(\)/)
  assert.match(app, /authMode === "reset-password" \|\| authMode === "invite"/)
  assert.match(authFlow, /ensurePasswordUpdateSession\(\)/)
  assert.match(supabaseClient, /supabase\.auth\.setSession/)
  assert.match(supabaseClient, /window\.history\.replaceState/)
})

test("permissions are user-first with protected predefined roles and reusable saved roles", () => {
  assert.match(settings, /function UserPermissionsTab\(\)/)
  assert.match(settings, /storageKey="settings-user-permissions"/)
  assert.match(settings, /<Pencil[\s\S]*?<Trash2/)
  assert.match(settings, /Create reusable roles once/)
  assert.match(settings, /<DialogTitle>\{t\("Create a role"\)\}<\/DialogTitle>/)
  assert.match(settings, /createApiAuthorizationRole\(session\.access_token/)
  assert.match(settings, /Saved roles/)
  assert.match(settings, /getAssignableRoles/)
  assert.doesNotMatch(settings, /<SelectItem value="custom">/)
  assert.match(settings, /Read & write/)
  assert.match(settings, /updateApiUserRoles/)
  assert.match(settings, /previousRole\?\.isLegacyCustom/)
  assert.match(api, /isLegacyCustom: boolean/)
  assert.match(team, /Reusable workspace role\./)
  assert.match(team, /Enable at least one permission before creating the role/)
  assert.match(team, /isLegacyCustomRoleName\(selectedRole\.sys_UserRole_Name\)/)
  assert.match(team, /Choose valid reusable roles/)
  for (const roleName of ["Administrator", "Operations manager", "Operator", "Viewer"]) {
    assert.match(team, new RegExp(`${roleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*canEditPermissions: false`))
  }
  assert.match(team, /protect && SYSTEM_ROLES\[role\.sys_UserRole_Name\]/)
  assert.match(team, /Built-in role permissions cannot be changed/)
})

test("user deletion is confirmed in the client and constrained in the tenant service", () => {
  assert.match(settings, /Delete this user\?/)
  assert.match(settings, /deleteApiTeamUser/)
  assert.match(api, /method: "DELETE"/)
  assert.match(team, /You cannot remove your own Multideck access/)
  assert.match(team, /Keep at least one administrator/)
  assert.match(team, /admin\.auth\.admin\.deleteUser/)
  assert.match(team, /Company_ID: null, Auth_User_ID: null/)
  assert.match(team, /isLegacyCustomRoleName\(role\.sys_UserRole_Name\)/)
  assert.match(team, /role\.sys_UserRole_Name !== `Custom · \$\{target\.User_ID\}`/)
  assert.match(team, /sys_UserRole_Permissions/)
})

test("Dexter clearly declines high-impact identity writes and idle user watches", () => {
  assert.match(dexter, /Workspace user invitations, role assignments, custom permission changes and user deletion/)
  assert.match(dexter, /deliberately not connected to Dexter writes or Watching for you/)
  assert.match(dexter, /direct the operator to the relevant Settings page/)
})

test("new user-management language is available in German, French, and Arabic", () => {
  for (const phrase of ["Developer / Users", "Invite a user", "Create a role", "Saved roles", "Role access", "Edit user permissions", "Read & write", "Delete this user?", "Set your password"]) {
    const start = translations.indexOf(`"${phrase}"`)
    assert.notEqual(start, -1, `${phrase} is missing`)
    const entry = translations.slice(start, start + 700)
    assert.match(entry, /de:/)
    assert.match(entry, /fr:/)
    assert.match(entry, /ar:/)
  }
})
