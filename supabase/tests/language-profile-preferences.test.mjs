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
const languageProfileSync = read("multideck.client/src/lib/language-preferences.tsx")
const edgeFunction = read("supabase/functions/agent-dexter/index.ts")
const app = read("multideck.client/src/App.tsx")

test("language preferences are bounded and stored only against the authenticated profile", () => {
  assert.match(migration, /"User_Locale" in \('en-GB', 'en-US', 'de', 'fr', 'ar'\)/)
  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(migration, /revoke all on function public\.get_current_user_language_preference\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.set_current_user_language_preference\(text\) to authenticated/)
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
