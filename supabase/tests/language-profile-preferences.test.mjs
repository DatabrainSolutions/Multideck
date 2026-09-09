import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(supabaseRoot, "..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

const migration = read(
  "supabase/migrations/202607310007_user_language_preference.sql",
)
const parityMigration = read(
  "supabase/migrations/20260818092910_profile_preferences_deployment_parity.sql",
)
const auditTriggerRepair = read(
  "supabase/migrations/20260818093539_audit_trigger_digest_search_path.sql",
)
const preferenceAuditContext = read(
  "supabase/migrations/20260818093641_profile_preference_audit_context.sql",
)
const englishOnlyLocales = read(
  "supabase/migrations/20260825090000_english_only_interface_locales.sql",
)
const languageProfileSync = read("multideck.client/src/lib/language-preferences.tsx")
const edgeFunction = read("supabase/functions/agent-dexter/index.ts")
const app = read("multideck.client/src/App.tsx")

test("language preferences are bounded and stored only against the authenticated profile", () => {
  assert.match(englishOnlyLocales, /"User_Locale" in \('en-GB', 'en-US'\)/)
  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(migration, /revoke all on function public\.get_current_user_language_preference\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.set_current_user_language_preference\(text\) to authenticated/)
})

test("the deployment-parity migration restores both profile preference contracts", () => {
  assert.match(parityMigration, /add column if not exists "User_Locale" text/)
  assert.match(parityMigration, /get_current_user_language_preference/)
  assert.match(parityMigration, /set_current_user_language_preference/)
  assert.match(parityMigration, /add column if not exists "User_KeyboardShortcuts" jsonb/)
  assert.match(parityMigration, /get_current_user_keyboard_shortcuts/)
  assert.match(parityMigration, /set_current_user_keyboard_shortcuts/)
  assert.match(parityMigration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(auditTriggerRepair, /Audit_RowChangeTrigger/)
  assert.match(auditTriggerRepair, /set search_path = pg_catalog, public, extensions/)
  assert.match(preferenceAuditContext, /set_config\('app\.user_id', v_workspace_user_id::text, true\)/)
  assert.match(preferenceAuditContext, /set_config\('app\.auth_user_id', v_auth_user_id::text, true\)/)
  assert.match(preferenceAuditContext, /where "User_ID" = v_workspace_user_id/)
})

test("the client restores and saves the signed-in profile language", () => {
  assert.match(languageProfileSync, /get_current_user_language_preference/)
  assert.match(languageProfileSync, /set_current_user_language_preference/)
  assert.match(app, /<LanguageProvider>[\s\S]*?<LanguageProfileSync \/>/)
})

test("Dexter resolves the trusted profile locale before generating", () => {
  assert.match(edgeFunction, /get_current_user_language_preference/)
  assert.match(edgeFunction, /readLocalePreference/)
})
