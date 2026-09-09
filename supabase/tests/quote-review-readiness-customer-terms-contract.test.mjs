import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const [migration, correctionMigration, routingReadinessMigration, incotermScopeMigration, edge] = await Promise.all([
  readFile(new URL("supabase/migrations/20260828150000_quote_review_readiness_customer_terms.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260828160000_quote_readiness_exw_named_place.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260904135000_quote_readiness_named_places_and_optional_terms.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260904160000_quote_incoterm_scope_decision.sql", root), "utf8"),
  readFile(new URL("supabase/functions/quotes-workflow/index.ts", root), "utf8"),
])

test("quote readiness matches the current quote fields and inherited customer terms", () => {
  assert.match(migration, /CRMAccount_MetadataJSON.*quoteTerms.*terms/s)
  assert.match(migration, /array_append\(missing, 'Collection'\)/)
  assert.doesNotMatch(migration, /array_append\(missing, 'Subject-to-rate \/ space terms'\)/)
  assert.match(migration, /effective_terms/)
  assert.match(correctionMigration, /coalesce\(quote_row\."CusQuoteHeader_CollectionAddress", facts->>'namedPlace'\)/)
  assert.doesNotMatch(correctionMigration, /array_append\(missing, 'Terms and conditions'\)/)
  assert.doesNotMatch(correctionMigration, /array_append\(missing, 'Subject-to-rate \/ space/)
  assert.match(routingReadinessMigration, /coalesce\(quote_row\."CusQuoteHeader_CollectionAddress", facts->>'namedPlace'\)/)
  assert.match(routingReadinessMigration, /coalesce\(quote_row\."CusQuoteHeader_DeliveryAddress", facts->>'namedPlace'\)/)
  assert.doesNotMatch(routingReadinessMigration, /array_append\(missing, 'Terms and conditions'\)/)
  assert.doesNotMatch(routingReadinessMigration, /array_append\(missing, 'Subject-to-rate \/ space/)
  assert.match(routingReadinessMigration, /jsonb_array_length\(routing_legs\)>1/)
  assert.match(routingReadinessMigration, /array_append\(missing, 'Complete every routing leg'\)/)
  assert.match(incotermScopeMigration, /Incoterm or Not supplied \/ not applicable/)
  assert.match(incotermScopeMigration, /array_append\(missing, 'Collection scope'\)/)
  assert.match(incotermScopeMigration, /array_append\(missing, 'Delivery scope'\)/)
  assert.match(incotermScopeMigration, /array_append\(missing, 'Customs clearance scope'\)/)
  assert.match(incotermScopeMigration, /facts->>'shipperAddress'/)
  assert.match(incotermScopeMigration, /facts->>'consigneeAddress'/)
  assert.match(incotermScopeMigration, /incoterm_code not in \('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'\)/)
  assert.match(incotermScopeMigration, /incoterm_code in \('FCA', 'CPT', 'CIP', 'FAS', 'FOB', 'CFR', 'CIF'\)/)
  assert.match(incotermScopeMigration, /array_append\(missing, 'Incoterm named place \/ port'\)/)
  assert.match(incotermScopeMigration, /if not incoterm_not_supplied[\s\S]*collectionRequired/)
  assert.match(incotermScopeMigration, /if not incoterm_not_supplied[\s\S]*deliveryRequired/)
  assert.match(incotermScopeMigration, /grant execute on function booking_api\.quote_readiness\(uuid\) to service_role/)
  assert.match(edge, /function customerIncotermLabel\(value: unknown, namedPlace: unknown\)/)
  assert.match(edge, /customerIncotermLabel\(quote\.incoterm, facts\.namedPlace\)/)
})

test("quote PDF terms belong to the saved version, not today's payer profile", () => {
  const dataset = edge.match(/async function quotePdfDataset[\s\S]*?\ntype QuoteIssueRecipient/)?.[0] ?? ""
  assert.match(dataset, /const effectiveTerms = printable\(\s*quote\.terms,/)
  assert.doesNotMatch(dataset, /CRM_AccountProfiles|CusQuoteHeader_TermsText|organisationQuoteTerms/)
})
