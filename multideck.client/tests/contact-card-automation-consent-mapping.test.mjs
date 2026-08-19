import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const automationSource = await readFile(
  new URL("../src/components/multideck/contact-card-automation.tsx", import.meta.url),
  "utf8",
)
const storeSource = await readFile(
  new URL("../src/lib/contact-card-store.ts", import.meta.url),
  "utf8",
)
const migrationSource = await readFile(
  new URL("../../supabase/migrations/20260811085329_contact_card_crm_field_mappings.sql", import.meta.url),
  "utf8",
)

test("automation mapping no longer offers marketing consent as a new source", () => {
  assert.doesNotMatch(automationSource, /\["marketingConsent",\s*"Marketing consent"\]/)
  assert.match(automationSource, /Marketing consent is controlled by the card checkbox and captured automatically\./)
  assert.match(automationSource, /Marketing consent \(managed by checkbox\)/)
})

test("new contact cards keep the dedicated consent checkbox enabled by default", () => {
  assert.match(storeSource, /consentEnabled:\s*true/)
})

test("backend support remains for legacy marketing-consent mappings", () => {
  assert.match(migrationSource, /marketingConsent/)
})
