import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const [edge, migration, acceptanceMigration] = await Promise.all([
  readFile(new URL("supabase/functions/quotes-workflow/index.ts", root), "utf8"),
  readFile(new URL("supabase/migrations/20260820214738_quote_one_off_customer_response.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260820233154_fix_one_off_quote_acceptance_booking.sql", root), "utf8"),
])

test("one-off quote recipients come only from the tenant-scoped saved quote snapshot", () => {
  assert.match(edge, /function savedQuoteRecipient\(quote: Row, quoteId: string\)/)
  assert.match(edge, /key: `quote:\$\{quoteId\}`/)
  assert.match(edge, /email = optionalRecipientEmail\(quote\.CusQuoteHeader_ContactEmailSnapshot\)/)
  assert.match(edge, /if \(!quote\.CusQuoteHeader_CustomerID\)/)
  assert.match(edge, /recipients: savedRecipient \? \[savedRecipient\] : \[\]/)
  assert.match(edge, /String\(quote\.CusQuoteHeader_CustomerNameSnapshot \|\| "One-off customer"\)/)
  assert.match(edge, /context\.recipients\.find\(\(candidate\) => candidate\.key === recipientKey\)/)
  assert.doesNotMatch(edge, /recipientEmail\s*=\s*parseEmail\(body\./)
})

test("one-off customer readiness requires a saved name and keeps every other send requirement", () => {
  assert.match(migration, /"CusQuoteHeader_CustomerID" is null[\s\S]*"CusQuoteHeader_CustomerNameSnapshot"/)
  assert.match(migration, /"CusQuoteHeader_ContactEmailSnapshot"/)
  assert.match(migration, /'At least one customer charge'/)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/)
  assert.match(migration, /revoke all on function booking_api\.quote_readiness\(uuid\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function booking_api\.quote_readiness\(uuid\) to service_role/)
})

test("accepting a one-off quote creates a reviewable draft without weakening the customer constraint", () => {
  assert.match(acceptanceMigration, /customer_id := coalesce\(nullif\(payload->>'customerId', ''\)::uuid, quote_row\."CusQuoteHeader_CustomerID"\)/)
  assert.match(acceptanceMigration, /job_status := case when customer_id is null then 'draft' else 'open' end/)
  assert.match(acceptanceMigration, /'requiresCustomerLink', customer_id is null/)
  assert.match(acceptanceMigration, /'customerName', coalesce\(nullif\(payload->>'customerName', ''\), quote_row\."CusQuoteHeader_CustomerNameSnapshot"\)/)
  assert.doesNotMatch(acceptanceMigration, /drop constraint\s+"CK_Job_Header_customer_after_draft"/i)
  assert.match(acceptanceMigration, /revoke all on function booking_api\.convert_accepted_quote\(uuid,uuid,uuid\) from public, anon, authenticated/)
  assert.match(acceptanceMigration, /grant execute on function booking_api\.convert_accepted_quote\(uuid,uuid,uuid\) to service_role/)
})
