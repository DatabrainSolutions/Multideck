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
  new URL("../../supabase/migrations/20260830223000_contact_card_automatic_lead_mapping_notes.sql", import.meta.url),
  "utf8",
)

test("automation exposes only lead source and custom notes", () => {
  const panel = automationSource.slice(
    automationSource.indexOf("function CrmFieldMappingPanel"),
    automationSource.indexOf("export function CardAutomationPanel"),
  )
  assert.match(panel, /Lead source/)
  assert.match(panel, /Custom notes/)
  assert.match(panel, /mapped automatically/)
  assert.doesNotMatch(panel, /Form to CRM fields|Add field|fieldMappings/)
})

test("new contact cards keep the dedicated consent checkbox enabled by default", () => {
  assert.match(storeSource, /consentEnabled:\s*true/)
})

test("backend maps fixed form fields and writes custom notes to the lead", () => {
  assert.match(migrationSource, /CRMLead_PersonName/)
  assert.match(migrationSource, /CRMLead_Email/)
  assert.match(migrationSource, /customNotes/)
  assert.match(migrationSource, /insert into public\."CRM_Notes"/)
  assert.match(migrationSource, /marketingConsent/)
})
