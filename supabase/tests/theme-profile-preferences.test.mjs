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
  "supabase/migrations/202607310005_user_theme_preference.sql",
)
const themeProfileSync = read("multideck.client/src/lib/theme-preferences.tsx")
const accentTheme = read("multideck.client/src/lib/accent-theme.ts")
const accentMigration = read(
  "supabase/migrations/20260730222311_user_accent_preference.sql",
)
const app = read("multideck.client/src/App.tsx")
const themeToggle = read("multideck.client/src/components/multideck/theme-toggle.tsx")
const appShortcuts = read("multideck.client/src/components/multideck/app-shortcuts.tsx")

test("theme preferences are bounded and stored only against the authenticated profile", () => {
  assert.match(migration, /"User_ThemeMode" in \('light', 'dark'\)/)
  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(migration, /p_theme_mode not in \('light', 'dark'\)/)
  assert.match(migration, /revoke all on function public\.get_current_user_theme_preference\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.set_current_user_theme_preference\(text\) to authenticated/)
})

test("the client restores and saves the profile appearance through Supabase RPCs", () => {
  assert.match(themeProfileSync, /get_current_user_theme_preference/)
  assert.match(themeProfileSync, /set_current_user_theme_preference/)
  assert.equal(themeProfileSync.includes("@/lib/api"), false)
  assert.match(app, /<ThemeProvider[\s\S]*?disableTransitionOnChange[\s\S]*?<ThemeProfileSync \/>/)
  assert.match(themeProfileSync, /themeIntentEvent/)
  assert.match(themeProfileSync, /pendingThemeIntent\.current = mode[\s\S]*?themeRevision\.current \+= 1/)
  assert.match(themeToggle, /setThemeWithProfileIntent\(setTheme, nextTheme\)/)
  assert.match(appShortcuts, /setThemeWithProfileIntent\(setTheme, resolvedTheme === "dark" \? "light" : "dark"\)/)
})

test("accent colours use the same Supabase-only profile boundary", () => {
  assert.match(accentTheme, /get_current_user_accent_preference/)
  assert.match(accentTheme, /set_current_user_accent_preference/)
  assert.equal(accentTheme.includes("@/lib/api"), false)
  assert.match(accentTheme, /await saveRemoteAccent\(readAccentPresetId\(\)\)/)
  assert.match(accentTheme, /if \(loadedUserId !== userId\) return/)
  assert.match(accentMigration, /"User_AccentPreset" in \(/)
  assert.match(accentMigration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(accentMigration, /grant execute on function public\.set_current_user_accent_preference\(text\) to authenticated/)
})
