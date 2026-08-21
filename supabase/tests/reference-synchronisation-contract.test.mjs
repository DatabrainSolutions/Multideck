import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260820230946_synchronise_existing_references_and_customs_readiness.sql", import.meta.url), "utf8")
const bookingsFunction = await readFile(new URL("../functions/bookings-workflow/index.ts", import.meta.url), "utf8")
const quotesFunction = await readFile(new URL("../functions/quotes-workflow/index.ts", import.meta.url), "utf8")

test("saving reference rules synchronises existing quotes bookings and customers", () => {
  assert.match(migration, /create or replace function quote_api\.synchronise_company_references/u)
  assert.match(migration, /select 'quote'.*render_reference_pattern\(settings_row\.quote_pattern/su)
  assert.match(migration, /select 'booking'.*render_reference_pattern\(sequence\.pattern/su)
  assert.match(migration, /select 'customer'.*render_reference_pattern\(settings_row\.customer_pattern/su)
  assert.match(migration, /perform quote_api\.synchronise_company_references\(company_id_value\)/u)
  assert.match(migration, /duplicate reference/u)
})

test("old reference links remain scoped aliases and Edge Functions canonicalise them", () => {
  assert.match(migration, /create table if not exists quote_api\.reference_aliases/u)
  assert.match(migration, /primary key \(company_id, normalized_alias\)/u)
  assert.match(migration, /create or replace function public\.resolve_workspace_reference_alias/u)
  assert.match(migration, /revoke all on function public\.resolve_workspace_reference_alias.*from public, anon, authenticated/u)
  assert.match(migration, /grant execute on function public\.resolve_workspace_reference_alias.*to service_role/u)
  assert.match(bookingsFunction, /requested_reference: await canonicalBookingReference/u)
  assert.match(quotesFunction, /requested_reference_kind: "quote"/u)
  assert.match(quotesFunction, /reference: String\(quote\.CusQuoteHeader_CustomerReference/u)
})

test("readiness returns the same progress measures used by declaration review", () => {
  assert.match(migration, /'totalChecks', total_checks/u)
  assert.match(migration, /'completeChecks', complete_checks/u)
  assert.match(migration, /'percent'.*round\(complete_checks \* 100\.0 \/ total_checks\)/su)
})

