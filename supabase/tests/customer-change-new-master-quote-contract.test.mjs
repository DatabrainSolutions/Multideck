import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const page = read("multideck.client/src/pages/quotes-page.tsx")
const migration = read("supabase/migrations/20260904141000_customer_change_new_master_quote.sql")
const identityGuardMigration = read("supabase/migrations/20260904142000_enforce_quote_customer_identity.sql")

test("changing an established customer is guarded and creates a separate master quote", () => {
  assert.match(page, /quote\.customerId && quote\.customerId !== organisation\.id && onCustomerOrganisationChange/u)
  assert.match(page, /label="Customer".*clearable=\{!quote\.customerId\}/u)
  assert.match(page, /Create a separate quote for this customer\?/u)
  assert.match(page, /current quote and every submitted version remain unchanged/u)
  assert.match(page, /saveQuoteWorkflow\(null, quoteSavePayload\(nextQuote, \[\], sources\)\)/u)
  assert.match(page, /navigate\?\.\(`\/quotes\/\$\{result\.reference\}`\)/u)
})

test("the copied quote keeps operational detail but resets customer-specific commercial values", () => {
  const start = page.indexOf("function newCustomerMasterQuote")
  const end = page.indexOf("function compactQuoteFacts", start)
  const helper = page.slice(start, end)
  assert.ok(start > -1 && end > start)
  assert.match(helper, /\.\.\.source,[\s\S]*\.\.\.customerPatch/u)
  assert.match(helper, /localRef: ""/u)
  assert.match(helper, /customerPO: ""/u)
  assert.match(helper, /rateSource: ""/u)
  assert.match(helper, /profit: 0/u)
  assert.match(helper, /cost: 0/u)
  assert.match(helper, /revenue: 0/u)
  assert.match(helper, /copiedFromQuoteId: sourceQuoteId/u)
  assert.match(helper, /copyReason: "customer_changed"/u)
  assert.match(page, /terms: organisation\.quoteTerms\?\.terms \?\? ""/u)
  assert.match(page, /subjectToTerms: organisation\.quoteTerms\?\.subjectTo \?\? ""/u)
})

test("copy provenance is tenant-validated, audited on both quotes and visible to Dexter", () => {
  assert.match(migration, /source_office\."Company_ID" = actor_company_id/u)
  assert.match(migration, /source_quote_id <> saved_quote_id/u)
  assert.match(migration, /'copied_to_new_quote'/u)
  assert.match(migration, /'commercialValuesReset', true/u)
  assert.match(migration, /'copiedFromQuoteId', quote\."CusQuoteHeader_ShipmentFactsJSON"->>'copiedFromQuoteId'/u)
  assert.match(migration, /A customer change creates a separately numbered quote and clears customer-specific commercial values/u)
})

test("the backend rejects customer reassignment on an established quote", () => {
  assert.match(identityGuardMigration, /prior_customer_id is not null/u)
  assert.match(identityGuardMigration, /requested_customer_id is distinct from prior_customer_id/u)
  assert.match(identityGuardMigration, /Changing the customer requires a separate quote number\./u)
  assert.match(identityGuardMigration, /save_quote_legacy_20260903\(caller_auth_user_id, requested_quote_id, payload\)/u)
})
