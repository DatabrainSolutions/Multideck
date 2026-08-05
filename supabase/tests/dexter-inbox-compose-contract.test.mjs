import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")
const edge = read("supabase/functions/dexter-email-compose/index.ts")
const migration = read("supabase/migrations/20260804191000_dexter_email_composer_thread_context.sql")
const runtime = read("supabase/functions/inbox-api/runtime.ts")
const client = read("multideck.client/src/lib/dexter-api.ts")
const composer = read("multideck.client/src/components/multideck/mail-composer.tsx")
const inbox = read("multideck.client/src/pages/inbox-page.tsx")

test("Inbox Dexter drafting uses Luna low reasoning and an optional bounded writing profile", () => {
  assert.match(edge, /DEXTER_FAST_MODEL[\s\S]*gpt-5\.6-luna/)
  assert.match(edge, /reasoning:\s*\{ effort: "low" \}/)
  assert.match(edge, /multideck_dexter_get_writing_profile/)
  assert.match(edge, /profileData\.enabled === true && profileData\.status === "ready"/)
  assert.match(edge, /personalStyle: profileEnabled \? styleGuidance : null/)
  assert.match(edge, /Do not send the email/)
})

test("reply drafting re-authorises the selected source and reads a bounded tenant-safe thread", () => {
  assert.match(edge, /multideck_dexter_resolve_email_compose_context/)
  assert.match(edge, /MAX_CONTEXT_CHARACTERS = 60_000/)
  assert.match(migration, /_multideck_dexter_has_permission\(v_context\.user_id, 'Email\.Read'\)/)
  assert.match(migration, /_multideck_dexter_has_permission\(v_context\.user_id, 'Email\.AIRead'\)/)
  assert.match(migration, /_multideck_dexter_email_mailboxes/)
  assert.match(migration, /limit 30/)
  assert.match(migration, /'drafts', 'spam', 'trash'/)
  assert.match(migration, /grant execute[\s\S]*to authenticated/)
})

test("the composer exposes all requested Dexter labels and keeps send separate", () => {
  assert.match(composer, /Compose with Dexter/)
  assert.match(composer, /Draft with Dexter/)
  assert.match(composer, /Reply with Dexter/)
  assert.match(composer, /<DexterActionPill/)
  assert.match(inbox, /prepareInboxDexterDraft/)
  assert.match(inbox, /onComposeWithDexter=\{\(\) => void composeWithDexter\(\)\}/)
  assert.match(client, /"dexter-email-compose"/)
  assert.match(runtime, /graphMessageNeedsAttachmentFetch\(row\.hasAttachments, html\)/)
})
