import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const settingsSource = await readFile(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const navigationSource = await readFile(new URL("../src/data/settings-navigation.ts", import.meta.url), "utf8")
const sidebarNavigationSource = await readFile(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")
const adminPageSource = await readFile(new URL("../src/pages/admin-page.tsx", import.meta.url), "utf8")
const translationsSource = `${await readFile(new URL("../src/i18n/translate.ts", import.meta.url), "utf8")}\n${await readFile(new URL("../src/i18n/admin-phrases.ts", import.meta.url), "utf8")}`

test("permissions are merged into the tenant-admin Users surface", () => {
  assert.doesNotMatch(navigationSource, /\{ id: "users"/u)
  assert.doesNotMatch(navigationSource, /\{ id: "permissions"/u)
  assert.match(sidebarNavigationSource, /label: "Admin"[\s\S]*?label: "Users"[\s\S]*?route: "\/admin\/users"/u)
  assert.match(adminPageSource, /<AdminUsersContent \/>/u)
  assert.match(settingsSource, /permissions: "\/admin\/users",\s+users: "\/admin\/users"/u)
  assert.match(settingsSource, /navigate\(adminRoutes\[section\]\)/u)
  assert.doesNotMatch(settingsSource, /function UserPermissionsTab\(/u)
  assert.doesNotMatch(settingsSource, /case "permissions":/u)
})

test("the Users roster keeps Role visible without forcing a narrow table to scroll", () => {
  const usersTab = settingsSource.slice(settingsSource.indexOf("function AdminUsersContent()"), settingsSource.indexOf("const mailProviderCopy"))
  assert.match(usersTab, /id: "role",\s+label: t\("Role"\)/u)
  assert.match(usersTab, /className="hidden xl:block"/u)
  assert.match(usersTab, /minimumWidth=\{804\}/u)
  assert.match(usersTab, /tableClassName="table-fixed"/u)
  assert.match(usersTab, /className="grid gap-3 xl:hidden"/u)
})

test("invite and edit preserve reusable role selection and open the inline role composer", () => {
  assert.match(settingsSource, /const makeRoleSelectValue = "__make_workspace_role__"/u)
  assert.match(settingsSource, /roleId === makeRoleSelectValue\) beginRoleCreation\("invite"\)/u)
  assert.match(settingsSource, /roleId === makeRoleSelectValue \? beginRoleCreation\("edit"\)/u)
  assert.match(settingsSource, /roleIds: \[editForm\.roleId\]/u)
  assert.match(settingsSource, /role && !role\.isLegacyCustom \? role\.id : ""/u)
  assert.match(settingsSource, /await deleteApiAuthorizationRole\(session\.access_token, previousRole\.id\)/u)
  assert.match(settingsSource, /<RolePermissionMatrix areas=\{permissionAreas\}/u)
  assert.match(settingsSource, /<ArrowLeft className="size-3\.5 rtl:-scale-x-100"/u)
})

test("user details and permissions swap inside one stable, retargetable dialog shell", () => {
  const usersTab = settingsSource.slice(settingsSource.indexOf("function AdminUsersContent()"), settingsSource.indexOf("const mailProviderCopy"))
  assert.match(settingsSource, /h-\[min\(760px,calc\(100dvh-32px\)\)\].*grid-rows-\[minmax\(0,1fr\)\].*overflow-hidden/u)
  assert.match(settingsSource, /absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain pe-1 .*\[scrollbar-gutter:stable\].*will-change-\[transform,opacity\]/u)
  assert.match(settingsSource, /min-w-0 max-w-full overflow-hidden rounded-\[var\(--md-radius-xl\)\]/u)
  assert.match(settingsSource, /sm:grid-cols-\[minmax\(0,1fr\)_minmax\(140px,180px\)\]/u)
  assert.match(usersTab, /<AnimatePresence mode="sync" initial=\{false\} custom=/u)
  assert.match(usersTab, /transition=\{accessPanelTransition\}/u)
  assert.match(usersTab, /const accessPanelDistance = shouldReduceMotion \? 0 : direction === "rtl" \? -8 : 8/u)
  assert.match(usersTab, /reduceMotion\(Boolean\(shouldReduceMotion\), mdMotion\.smooth\)/u)
  assert.doesNotMatch(usersTab, /mode="wait"/u)
  assert.doesNotMatch(usersTab, /filter: "blur/u)
})

test("new merged access copy is available in every supported language", () => {
  for (const phrase of [
    "People, roles and access",
    "Admin / Users",
    "Make a role",
    "Back to user details",
    "Choose permissions for a reusable workspace role. You can assign it to more people later.",
  ]) {
    const start = translationsSource.indexOf(`\"${phrase}\"`)
    assert.ok(start >= 0, `missing translation entry for ${phrase}`)
    assert.match(translationsSource.slice(start, start + 700), /\{ de: "[^"]+", fr: "[^"]+", ar: "[^"]+" \}/u)
  }
})

test("password reset is personalised, compact and removes the duplicate user identity block", () => {
  const resetDialog = settingsSource.slice(settingsSource.indexOf('<Dialog open={Boolean(passwordCandidate)}'), settingsSource.indexOf('<Dialog open={Boolean(editingUser)}'))
  assert.doesNotMatch(resetDialog, /<TeamUserIdentity/u)
  assert.match(resetDialog, /rounded-\[var\(--md-radius-2xl\)\]/u)
  assert.match(resetDialog, /rounded-\[var\(--md-radius-xl\)\]/u)
  assert.match(resetDialog, /\{resetPasswordTitle\}/u)
  assert.match(resetDialog, /\{resetPasswordAction\}/u)
  assert.match(settingsSource, /t\("Reset \{name\}’s password"\)\.replace\("\{name\}", passwordCandidateName\)/u)

  for (const phrase of [
    "Reset {name}’s password",
    "Resetting {name}’s password",
    "Choose a new password for {name}. It will be used at the next sign-in. Existing sessions will stay active.",
    "Use at least 8 characters. Share the new password with {name} securely.",
  ]) {
    const start = translationsSource.indexOf(`\"${phrase}\"`)
    assert.ok(start >= 0, `missing password-reset translation entry for ${phrase}`)
    assert.match(translationsSource.slice(start, start + 700), /\{ de: "[^"]+", fr: "[^"]+", ar: "[^"]+" \}|de: "[^"]+"[\s\S]*?fr: "[^"]+"[\s\S]*?ar: "[^"]+"/u)
  }
})
