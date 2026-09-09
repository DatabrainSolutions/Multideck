import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260904163000_branch_relative_freight_direction.sql", import.meta.url),
  "utf8",
)

test("the canonical direction matrix is branch relative", () => {
  assert.match(migration, /then 'domestic'[\s\S]*then 'export'[\s\S]*then 'import'[\s\S]*else 'cross_trade'/u)
  assert.match(migration, /regexp_replace\(upper\(coalesce\(value, ''\)\), '\[\^A-Z0-9\]'/u)
  assert.match(migration, /booking_api\.operating_country_code/u)
  assert.match(migration, /LegalEntity_CountryCode/u)
})

test("quote headers, submitted snapshots and booking saves share the rule", () => {
  assert.match(migration, /TR_CusQuote_Header_branch_relative_direction/u)
  assert.match(migration, /TR_CusQuote_Versions_branch_relative_direction/u)
  assert.match(migration, /TR_Job_Header_branch_relative_direction/u)
  assert.match(migration, /normalise_booking_direction_payload/u)
  assert.match(migration, /booking_workflow_save_before_branch_direction_20260904/u)
})

test("Dexter reads the calculated direction and existing event watches remain authoritative", () => {
  assert.match(migration, /calculatedDirection/u)
  assert.match(migration, /directionMatchesRoute/u)
  assert.match(migration, /AIDexterWatchCapability_Description/u)
})
