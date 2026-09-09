import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../migrations/20260808002157_crm_lead_native_addresses.sql", import.meta.url),
  "utf8",
)
const leadApi = readFileSync(
  new URL("../../multideck.client/src/lib/lead-api.ts", import.meta.url),
  "utf8",
)
const crmPage = readFileSync(
  new URL("../../multideck.client/src/pages/crm-page.tsx", import.meta.url),
  "utf8",
)

test("leads own their address without requiring an organisation", () => {
  assert.match(migration, /add column if not exists "CRMLead_AddressLine1"/)
  assert.match(migration, /add column if not exists "CRMLead_TownCity"/)
  assert.match(migration, /add column if not exists "CRMLead_CountyState"/)
  assert.match(migration, /add column if not exists "CRMLead_PostZipCode"/)
  assert.match(migration, /Does not require an organisation record/)
  assert.doesNotMatch(migration, /insert into public\."Org_Master"/i)
})

test("demo addresses are scoped to marked QR demo leads", () => {
  assert.match(migration, /CRMLead_MetadataJSON" ->> 'isDemo'/)
  assert.match(migration, /qr-contact-card-seed/)
  assert.match(migration, /qr-demo-1@example\.com/)
  assert.match(migration, /qr-demo-5@example\.com/)
  assert.match(migration, /Manchester/)
  assert.match(migration, /Birmingham/)
  assert.match(migration, /London/)
})

test("dashboard and Dexter prefer lead-native areas with organisation fallback", () => {
  assert.match(migration, /lead\."CRMLead_TownCity"/)
  assert.match(migration, /organisation_address\.area_label/)
  assert.match(migration, /create or replace function public\.multideck_dexter_domain_leads/)
  assert.match(migration, /'address', public\._multideck_crm_lead_native_address/)
  assert.match(migration, /_multideck_dexter_lead_address_signal/)
  assert.match(migration, /"address","area"/)
})

test("lead creation validates and persists the native address", () => {
  assert.match(migration, /multideck_crm_create_follow_up_lead\([\s\S]*p_address jsonb/)
  assert.match(migration, /\^\[A-Z\]\{2\}\$/)
  assert.match(migration, /CRMLead_AddressLine1" = nullif/)
  assert.match(leadApi, /p_address: input\.address \|\| \{\}/)
  assert.match(crmPage, /setAddressLine1/)
  assert.match(crmPage, /setTownCity/)
  assert.match(crmPage, /maxLength=\{2\}/)
  assert.match(crmPage, /Enter a two-letter ISO country code, such as GB\./)
})
