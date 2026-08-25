import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [app, authUser, sidebar, navigation, settingsNavigation, settingsPage, adminPage, adminApi, gallery] = await Promise.all([
  read("../src/App.tsx"),
  read("../src/lib/auth-user.ts"),
  read("../src/components/multideck/app-sidebar.tsx"),
  read("../src/data/navigation-data.ts"),
  read("../src/data/settings-navigation.ts"),
  read("../src/pages/settings-page.tsx"),
  read("../src/pages/admin-page.tsx"),
  read("../src/lib/admin-audit-api.ts"),
  read("../src/data/multideck-data.ts"),
])

test("Admin is visible only to the two tenant administrator roles", () => {
  assert.match(authUser, /new Set\(\["administrator", "company admin"\]\)/)
  assert.match(authUser, /export function isTenantAdministrator/)
  assert.match(sidebar, /area\.id !== "administration" \|\| canOpenAdmin/)
  assert.match(app, /route\.startsWith\("\/admin"\).*isTenantAdministrator\(currentUser\)/s)
  assert.match(app, /path\.startsWith\("\/admin"\).*isTenantAdministrator\(currentUser\)/s)
})

test("Admin exposes management, commercial and audit screens as real routes", () => {
  assert.match(navigation, /label: "Admin"/)
  for (const route of ["/admin/users", "/admin/ai-usage", "/admin/broadcast", "/admin/billing", "/admin/activity", "/admin/detailed-log"]) {
    assert.match(navigation, new RegExp(`route: "${route.replaceAll("/", "\\/")}"`))
    assert.match(app, new RegExp(`"${route.replaceAll("/", "\\/")}"`))
  }
  for (const section of ["users", "ai-usage", "broadcast", "billing"]) {
    assert.doesNotMatch(settingsNavigation, new RegExp(`id: "${section}"`))
  }
  assert.match(settingsPage, /export function AdminUsersContent\(\)/)
  assert.match(settingsPage, /export function AdminAiUsageContent\(\)/)
  assert.match(settingsPage, /export function AdminBillingContent\(\)/)
  assert.match(adminPage, /<AdminUsersContent \/>/)
  assert.match(adminPage, /<AdminAiUsageContent \/>/)
  assert.match(adminPage, /<AdminBroadcastContent \/>/)
  assert.match(adminPage, /<AdminBillingContent \/>/)
  assert.match(settingsPage, /users: "\/admin\/users"/)
  assert.match(settingsPage, /"ai-usage": "\/admin\/ai-usage"/)
  assert.match(settingsPage, /broadcast: "\/admin\/broadcast"/)
  assert.match(settingsPage, /billing: "\/admin\/billing"/)
})

test("audit screens use the canonical bounded table, refresh automatically and omit summary noise", () => {
  assert.match(adminPage, /<DataTable/)
  assert.match(adminPage, /space-y-5[^>]*>\s*\{header\}\s*<DataTable/)
  assert.doesNotMatch(adminPage, /toolbarLeading=\{header\}/)
  assert.match(adminPage, /enableSelectionExport=\{false\}/)
  assert.match(adminPage, /view === "detailed" \? detailedColumns : activityColumns/)
  assert.match(adminPage, /<ActiveUsers users=/)
  assert.match(adminPage, /actions=\{view === "activity" \? <ActiveUsers/)
  assert.doesNotMatch(adminPage, /contentBeforeTable=\{view === "activity"/)
  assert.match(adminPage, /<AvatarImage src=\{currentUser\.profilePhotoUrl\}/)
  assert.match(adminPage, /<ul className="flex flex-wrap items-center gap-2">/)
  assert.doesNotMatch(adminPage, /Seen in this workspace during the last two minutes\./)
  assert.match(adminPage, /auditRefreshIntervalMs = 60_000/)
  assert.match(adminPage, /window\.setInterval\(\(\) => \{[\s\S]*?void load\(controller\.signal\)[\s\S]*?\}, auditRefreshIntervalMs\)/)
  assert.doesNotMatch(adminPage, /Field-level audit currently covers/)
  assert.doesNotMatch(adminPage, /Refreshing…|t\("Refresh"\)/)
  assert.match(adminPage, /serverSorting=\{\{ value: sort/)
  assert.match(adminPage, /pagination=\{\{ offset, limit: pageSize, total: result\?\.total \?\? 0/)
  assert.match(adminPage, /setSearch\(searchInput\.trim\(\)\), 250/)
  assert.match(adminPage, /getAdminAudit\(view, \{ search, category, dateRange, sort, limit: pageSize, offset \}, signal\)/)
  assert.match(adminPage, /<MultideckDateRangePicker value=\{dateRange\}/)
  assert.match(adminApi, /parameters\.set\("startDate", normalized\.startDate\)/)
  assert.match(adminApi, /parameters\.set\("endDate", normalized\.endDate\)/)
  assert.doesNotMatch(adminPage, /result\?\.rows \?\? \[\]\)\.filter/)
  assert.match(adminApi, /edgeFetch\("admin-audit"/)
  assert.match(adminApi, /readCachedRegisterPage\(session\.user\.id, resource/)
  assert.match(adminApi, /sortDirection/)
  assert.match(adminApi, /offset: String\(normalized\.offset\)/)
  assert.match(app, /recordWorkspacePresence\(route\)/)
  assert.match(app, /60_000/)
  assert.match(app, /<AdminPage route=\{route as AdminRoute\} currentUser=\{currentUser\}/)
})

test("audit actor pills distinguish people from system-generated events", () => {
  assert.match(adminPage, /function isSystemAuditActor/)
  assert.match(adminPage, /function AuditActor/)
  assert.match(adminPage, /tone=\{systemGenerated \? "purple" : "blue"\}/)
  assert.match(adminPage, /indicator=\{false\}/)
  assert.doesNotMatch(adminPage, /showEmail/)
  assert.doesNotMatch(adminPage, /\{row\.actorEmail\}<\/p>/)
  assert.match(adminPage, /row\.actorName \|\| fallbackLabel/)
})

test("audit logs do not render user or user-session identifiers", () => {
  assert.match(adminPage, /function isUserAuditRecord/)
  assert.match(adminPage, /\(\^\|\[\\s_\.-\]\)users\?\(\$\|\[\\s_\.-\]\)/)
  assert.match(adminPage, /if \(isUserAuditRecord\(row\.recordType\)\) return type/)
  assert.match(adminPage, /return identifier \? `\$\{type\} · \$\{identifier\}` : type/)
})

test("DataTable quick links point to the Admin routes", () => {
  for (const route of ["/admin/users", "/admin/ai-usage", "/admin/broadcast", "/admin/activity", "/admin/detailed-log"]) assert.match(gallery, new RegExp(route.replaceAll("/", "\\/")))
})
