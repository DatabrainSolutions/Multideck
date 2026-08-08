import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(supabaseRoot, "..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

const migration = read("supabase/migrations/20260808110000_user_default_inbox_provider.sql")
const baseline = read("supabase/baseline/public-schema.sql")
const preferenceClient = read("multideck.client/src/lib/inbox-provider-preference.ts")
const settingsPage = read("multideck.client/src/pages/settings-page.tsx")
const inboxWorkspace = read("multideck.client/src/lib/inbox-workspace.tsx")
const dexterComposer = read("multideck.client/src/components/multideck/dexter-email-compose-card.tsx")

test("the default provider is a bounded private preference on the authenticated profile", () => {
  assert.match(migration, /"User_DefaultInboxProviderCode" in \('gmail', 'outlook'\)/)
  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(migration, /revoke all on function public\.get_current_user_default_inbox_provider\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.set_current_user_default_inbox_provider\(text\) to authenticated/)
  assert.match(migration, /does not emit Watching for you events and does not grant provider or mailbox access/)
})

test("the tenant baseline contains the preference column, functions and grants", () => {
  assert.match(baseline, /"User_DefaultInboxProviderCode" "text"/)
  assert.match(baseline, /"CK_cmp_Users_DefaultInboxProvider"/)
  assert.match(baseline, /get_current_user_default_inbox_provider/)
  assert.match(baseline, /set_current_user_default_inbox_provider/)
})

test("Integrations persists the choice and both mail surfaces consume it", () => {
  assert.match(preferenceClient, /get_current_user_default_inbox_provider/)
  assert.match(preferenceClient, /set_current_user_default_inbox_provider/)
  assert.match(settingsPage, /Default mail provider/)
  assert.match(settingsPage, /role="radiogroup"/)
  assert.match(settingsPage, /role="radio"/)
  assert.match(settingsPage, /aria-checked=\{selected\}/)
  assert.match(settingsPage, /disabled=\{!connected \|\| !defaultInboxProviderLoaded \|\| savingDefaultInboxProvider !== null\}/)
  assert.match(settingsPage, /saveDefaultInboxProvider\(provider\)/)
  assert.match(inboxWorkspace, /resolveDefaultInboxProvider\(mailboxes, defaultProvider, requestedProvider\)/)
  assert.match(dexterComposer, /resolveDefaultOutboundMailbox\(capable, preferredProvider, current\)/)
})

test("explicit Inbox provider links remain higher priority than the saved default", () => {
  assert.match(inboxWorkspace, /const requestedProvider = readInitialSelection\(\)\.provider/)
  assert.match(inboxWorkspace, /resolveDefaultInboxProvider\(mailboxes, defaultProvider, requestedProvider\)/)
})
