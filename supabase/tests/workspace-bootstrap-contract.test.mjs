import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = new URL("../migrations/20260818170000_workspace_bootstrap_read_model.sql", import.meta.url)
const accountPath = new URL("../functions/account/index.ts", import.meta.url)
const readModelPath = new URL("../functions/_shared/workspace-bootstrap.ts", import.meta.url)

test("workspace bootstrap is a service-role-only cross-table read model", async () => {
  const migration = await readFile(migrationPath, "utf8")

  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.get_workspace_bootstrap_for_auth_user\(uuid\) from public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.get_workspace_bootstrap_for_auth_user\(uuid\) to service_role/i)
  assert.doesNotMatch(migration, /grant execute[^;]+to authenticated/i)
})

test("one database RPC returns identity, permissions, preferences and both actor types", async () => {
  const [migration, account, readModel] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(accountPath, "utf8"),
    readFile(readModelPath, "utf8"),
  ])

  for (const field of [
    "'profile'", "'permissions'", "'themeMode'", "'locale'", "'accentPreset'",
    "'sidebar'", "'keyboardShortcuts'", "'tablePinnedColumns'", "'profilePhoto'", "'coverPhoto'",
  ]) assert.ok(migration.includes(field), `missing ${field}`)

  assert.match(migration, /'actorType', 'internal'/)
  assert.match(migration, /'actorType', 'customer'/)
  assert.match(migration, /'actorType', 'customer'[\s\S]*?'preferences', null/)
  assert.match(migration, /PortalIdentity_ExternalSubject/)
  assert.match(migration, /User_AccessStatus/)
  const getHandler = account.split('if (request.method === "PATCH")')[0]
  assert.doesNotMatch(getHandler, /\.from\(/)
  assert.equal((readModel.match(/\.rpc\(/g) ?? []).length, 1)
  assert.match(readModel, /createSignedUrls\(paths, mediaUrlLifetimeSeconds\)/)
  assert.match(readModel, /return \{ profile, preferences: row\.preferences \?\? null, profileMedia \}/)
})

test("portal actors do not fall back to six unsupported preference requests", async () => {
  const paths = [
    "../../multideck.client/src/lib/api.ts",
    "../../multideck.client/src/lib/theme-preferences.tsx",
    "../../multideck.client/src/lib/language-preferences.tsx",
    "../../multideck.client/src/lib/accent-theme.ts",
    "../../multideck.client/src/lib/sidebar-preferences.ts",
    "../../multideck.client/src/lib/keyboard-shortcuts.ts",
    "../../multideck.client/src/lib/table-preferences.ts",
  ]
  const [api, ...preferenceModules] = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))

  assert.match(api, /session\.workspace === undefined \? undefined : session\.workspace\?\.preferences \?\? null/)
  for (const source of preferenceModules) {
    assert.match(source, /workspacePreferences === null/)
    assert.match(source, /workspacePreferences === undefined/)
  }
})
