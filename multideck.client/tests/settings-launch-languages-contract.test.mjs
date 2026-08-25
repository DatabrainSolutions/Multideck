import assert from "node:assert/strict"
import test from "node:test"
import { readFile, readdir } from "node:fs/promises"

const settingsSource = await readFile(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const languagesSource = await readFile(new URL("../src/i18n/languages.ts", import.meta.url), "utf8")
const dexterSource = await readFile(new URL("../../supabase/functions/agent-dexter/index.ts", import.meta.url), "utf8")
const authEmailSource = await readFile(new URL("../../supabase/functions/send-auth-email/index.ts", import.meta.url), "utf8")
const localeMigration = await readFile(new URL("../../supabase/migrations/20260825090000_english_only_interface_locales.sql", import.meta.url), "utf8")

test("the app only defines UK and US English", () => {
  assert.match(settingsSource, /languageOptions\.map/)
  assert.match(settingsSource, /languageOptions\.find/)
  assert.match(languagesSource, /export type LanguageCode = "en-GB" \| "en-US"/)
  assert.doesNotMatch(languagesSource, /German|French|Arabic|Deutsch|Français|العربية/)
})

test("the translation module contains no non-English dictionaries", async () => {
  const translateSource = await readFile(new URL("../src/i18n/translate.ts", import.meta.url), "utf8")
  assert.doesNotMatch(translateSource, /\bde:|\bfr:|\bar:|Arabic|German|French/)
  assert.deepEqual(
    (await readdir(new URL("../src/i18n", import.meta.url))).sort(),
    ["language-provider.tsx", "languages.ts", "translate.ts"],
  )
})

test("Dexter, auth emails and saved profile preferences accept English only", () => {
  for (const source of [dexterSource, authEmailSource, localeMigration]) {
    assert.doesNotMatch(source, /"de"|"fr"|"ar"|\bde:|\bfr:|\bar:/)
  }
  assert.match(dexterSource, /type DexterLocale = "en-GB" \| "en-US"/)
  assert.match(localeMigration, /p_locale not in \('en-GB', 'en-US'\)/)
})
