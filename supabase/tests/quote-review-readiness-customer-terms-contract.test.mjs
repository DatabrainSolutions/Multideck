import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const [migration, correctionMigration, edge] = await Promise.all([
  readFile(new URL("supabase/migrations/20260828150000_quote_review_readiness_customer_terms.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260828160000_quote_readiness_exw_named_place.sql", root), "utf8"),
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
})

test("quote PDF terms use the customer organisation record when available", () => {
  assert.match(edge, /from\("CRM_AccountProfiles"\)[\s\S]*CRMAccount_MetadataJSON/)
  assert.match(edge, /organisationQuoteTerms\.terms \|\| quote\.terms \|\| context\.quote\.CusQuoteHeader_TermsText/)
})
