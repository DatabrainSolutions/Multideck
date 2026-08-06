import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const storeSource = readFileSync(new URL("../src/lib/contact-card-store.ts", import.meta.url), "utf8")
const pageSource = readFileSync(new URL("../src/pages/contact-card-public-page.tsx", import.meta.url), "utf8")
const migrationSource = readFileSync(
  new URL("../../supabase/migrations/20260804114702_contact_card_authenticated_preview.sql", import.meta.url),
  "utf8",
)

test("preview routes use the authenticated preview lookup", () => {
  assert.match(pageSource, /loadPublicCard\(slug, preview\)/)
  assert.match(storeSource, /preview \? "multideck_contact_card_preview" : "multideck_public_contact_card"/)
})

test("preview lookup remains tenant-scoped and unavailable to anonymous visitors", () => {
  assert.match(migrationSource, /c\."Company_ID" = v_context\.company_id/)
  assert.match(migrationSource, /if auth\.uid\(\) is null then/)
  assert.match(migrationSource, /revoke all on function public\.multideck_contact_card_preview\(text\) from public, anon/)
  assert.match(migrationSource, /grant execute on function public\.multideck_contact_card_preview\(text\) to authenticated, service_role/)
  assert.doesNotMatch(migrationSource, /"ContactCard_Status"\s*=\s*'published'/)
})
