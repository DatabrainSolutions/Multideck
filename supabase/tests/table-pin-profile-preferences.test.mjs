import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(supabaseRoot, "..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

const migration = read("supabase/migrations/20260808215559_user_table_preferences.sql")
const hardeningMigration = read("supabase/migrations/20260808220622_harden_user_table_preferences.sql")
const client = read("multideck.client/src/lib/table-preferences.ts")
const table = read("multideck.client/src/components/multideck/data-table.tsx")

test("table pin preferences are bounded and stored only against the authenticated profile", () => {
  assert.match(migration, /jsonb_object_keys\(p_preferences\)\) > 100/u)
  assert.match(migration, /jsonb_array_length\(v_table\.value\) > 100/u)
  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/u)
  assert.match(migration, /where "Auth_User_ID" = v_auth_user_id/u)
  assert.match(migration, /revoke all on function public\.get_current_user_table_preferences\(\) from public, anon/u)
  assert.match(migration, /grant execute on function public\.set_current_user_table_preferences\(jsonb\) to authenticated/u)
  assert.match(hardeningMigration, /grant update \("User_TablePinnedColumns"\) on table public\."cmp_Users" to authenticated/u)
  assert.match(hardeningMigration, /security invoker/u)
  assert.match(hardeningMigration, /with check \("Auth_User_ID" = \(select auth\.uid\(\)\)\)/u)
  assert.doesNotMatch(hardeningMigration, /security definer/u)
})

test("the client starts unpinned and saves only explicit pin choices through Supabase", () => {
  assert.match(client, /get_current_user_table_preferences/u)
  assert.match(client, /set_current_user_table_preferences/u)
  assert.match(client, /if \(loadedUserId !== userId\) return false/u)
  assert.match(client, /sessionData\.session\?\.user\.id !== userId/u)
  assert.equal(client.includes("const [localPinned, setLocalPinned] = useState<string[]>([])"), true)
  assert.match(table, /useTablePinnedColumns\(storageKey, columnIds\)/u)
  assert.doesNotMatch(table, /stored\.pinned/u)
})

test("private UI preferences explicitly do not create Dexter or watch capabilities", () => {
  assert.match(migration, /do not emit Watching for you events and are not exposed as Dexter actions/u)
})
