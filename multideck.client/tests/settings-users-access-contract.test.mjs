import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const settingsSource = await readFile(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const navigationSource = await readFile(new URL("../src/data/settings-navigation.ts", import.meta.url), "utf8")
const translationsSource = await readFile(new URL("../src/i18n/translate.ts", import.meta.url), "utf8")

test("permissions are merged into the single Users settings surface", () => {
  assert.match(navigationSource, /\{ id: "users", label: "Users", description: "People, roles and access"/u)
  assert.doesNotMatch(navigationSource, /\{ id: "permissions"/u)
  assert.match(navigationSource, /if \(section === "permissions"\) return "users"/u)
  assert.doesNotMatch(settingsSource, /function UserPermissionsTab\(/u)
  assert.doesNotMatch(settingsSource, /case "permissions":/u)
})

test("the Users roster keeps Role visible without forcing a narrow table to scroll", () => {
  const usersTab = settingsSource.slice(settingsSource.indexOf("function UsersTab()"), settingsSource.indexOf("const mailProviderCopy"))
  assert.match(usersTab, /id: "role",\s+label: t\("Role"\)/u)
  assert.match(usersTab, /className="hidden xl:block"/u)
  assert.match(usersTab, /minimumWidth=\{772\}/u)
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
  const usersTab = settingsSource.slice(settingsSource.indexOf("function UsersTab()"), settingsSource.indexOf("const mailProviderCopy"))
  assert.match(settingsSource, /h-\[min\(760px,calc\(100dvh-32px\)\)\].*grid-rows-\[minmax\(0,1fr\)\].*overflow-hidden/u)
  assert.match(settingsSource, /absolute inset-0 overflow-y-auto overscroll-contain pe-1 .*\[scrollbar-gutter:stable\].*will-change-\[transform,opacity\]/u)
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
    "Workspace / Users",
    "Make a role",
    "Back to user details",
    "Choose permissions for a reusable workspace role. You can assign it to more people later.",
  ]) {
    const start = translationsSource.indexOf(`\"${phrase}\"`)
    assert.ok(start >= 0, `missing translation entry for ${phrase}`)
    assert.match(translationsSource.slice(start, start + 700), /\{ de: "[^"]+", fr: "[^"]+", ar: "[^"]+" \}/u)
  }
})
