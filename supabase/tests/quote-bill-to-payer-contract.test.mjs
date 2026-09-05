import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const [quotePage, quoteApi, bookingPage, workflow, pdf, migration] = await Promise.all([
  readFile(new URL("multideck.client/src/pages/quotes-page.tsx", root), "utf8"),
  readFile(new URL("multideck.client/src/lib/quote-workflow-api.ts", root), "utf8"),
  readFile(new URL("multideck.client/src/components/multideck/booking-components.tsx", root), "utf8"),
  readFile(new URL("supabase/functions/quotes-workflow/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/_shared/quote-pdf.ts", root), "utf8"),
  readFile(new URL("supabase/migrations/20260904144000_quote_bill_to_payer.sql", root), "utf8"),
])

test("quote drafts use a separate linked payer whose account terms govern the quote", () => {
  assert.match(quoteApi, /payer\?: QuotePartyDraft \| null/u)
  for (const field of ["payerOrgId", "payerCode", "payerName", "payerAddress", "payerContact", "payerEmail"]) {
    assert.match(quotePage, new RegExp(`${field}\\?: string`, "u"))
  }
  assert.match(quotePage, /title="Bill to \/ payer"/u)
  assert.match(quotePage, /This account supplies the quote terms/u)
  assert.match(quotePage, /selectOrganisation\("payer", option\.id\)/u)
  assert.match(quotePage, /terms: organisation\.quoteTerms\?\.terms \?\? ""/u)
  assert.match(quotePage, /Locked to payer account/u)
  assert.match(quotePage, /payer: \{[\s\S]*orgId: quote\.payerOrgId \|\| quote\.customerId/u)
})

test("legacy quotes default the payer to the operational customer", () => {
  assert.match(quotePage, /const payer = record\.payer \?\? \{/u)
  assert.match(quotePage, /orgId: record\.customerId/u)
  assert.match(quotePage, /payerName: payer\.name \|\| record\.customerName/u)
  assert.match(migration, /else jsonb_strip_nulls\(jsonb_build_object\([\s\S]*'orgId', nullif\(payload->>'customerId'/u)
})

test("customer-facing PDFs show the payer and never reuse hidden cost data", () => {
  assert.match(workflow, /const payerOrganisationId = cleanString\(payer\.orgId, 36\)/u)
  assert.match(workflow, /\.eq\("CRMAccount_OrgID", payerOrganisationId\)/u)
  assert.match(workflow, /billedToName: printable\(payer\.name/u)
  assert.match(pdf, /<div class="label">Billed to<\/div><div class="value">\{d\.quote\.billedToName\}<\/div>/u)
  assert.doesNotMatch(pdf, /Billed to<\/div><div class="value">\{d\.quote\.customerName\}/u)
  assert.match(workflow, /rawCharges\.filter\(\(item\) => isObject\(item\) && item\.showToCustomer !== false\)/u)
})

test("accepted quotes carry payer identity into bookings and later changes remain review-only", () => {
  assert.match(migration, /"CusQuoteParty_RoleCode" in \('payer', 'shipper', 'consignee'\)/u)
  assert.match(migration, /'payer', case[\s\S]*snapshot#>'\{quote,payer\}'/u)
  assert.match(migration, /'label', 'Bill to \/ payer'/u)
  assert.match(migration, /requested_fields \? 'payer'/u)
  assert.match(migration, /"JobParty_Role" = 'payer'/u)
  assert.match(migration, /job_row\."Job_SourceQuoteVersionID" = quote_row\."CusQuoteHeader_AcceptedVersionID"/u)
  assert.match(migration, /not exists \([\s\S]*"JobParty_Role" = 'payer'/u)
  assert.match(migration, /status_code in \('pending', 'partially_applied'\)/u)
})

test("booking details show an editable billed-to party and its terms source", () => {
  assert.match(bookingPage, /type BookingOrganisationRole = "customer" \| "payer"/u)
  assert.match(bookingPage, /title="Bill to \/ payer"/u)
  assert.match(bookingPage, /onOrganisationSelect\("payer", organisation\)/u)
  assert.match(bookingPage, /termsAndConditions: organisation\.quoteTerms\?\.terms/u)
  assert.match(bookingPage, /\{t\("Billed to"\)\}/u)
  assert.match(bookingPage, /parties: workspace\.parties/u)
})

test("Dexter reads payer evidence while writes remain proposed-action only", () => {
  assert.match(migration, /create or replace function public\.multideck_dexter_domain_quotes/u)
  assert.match(migration, /'payer', case when payer\."CusQuoteParty_ID" is null/u)
  assert.match(migration, /Payer writes are deliberately not allowlisted until the Dexter proposed-action approval stage/u)
  assert.match(migration, /Event-driven quote lifecycle, ETD, ETA, validity, payer/u)
})
