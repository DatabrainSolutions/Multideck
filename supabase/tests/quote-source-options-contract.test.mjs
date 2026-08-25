import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [workflow, clientApi, organisationFoundation, seed] = await Promise.all([
  read("supabase/functions/quotes-workflow/index.ts"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("supabase/migrations/20260820110000_crm_organisation_contact_address_foundation.sql"),
  read("supabase/seed.sql"),
])

const sourceStart = workflow.indexOf("async function sourceOptions")
const sourceEnd = workflow.indexOf("async function quoteWorkspace", sourceStart)
const sourceOptions = workflow.slice(sourceStart, sourceEnd)

test("quote company options expose structured active addresses and contact emails", () => {
  assert.match(sourceOptions, /OrgAdd_Line1,OrgAdd_Line2,OrgAdd_TownCity,OrgAdd_CountyState,OrgAdd_PostZipCode,OrgAdd_Country,OrgAdd_UNLOCODE/)
  assert.match(sourceOptions, /\.eq\("OrgAdd_IsActive", true\)/)
  assert.match(sourceOptions, /\.eq\("OrgContactEmail_IsActive", true\)/)
  assert.match(sourceOptions, /line1: address\.OrgAdd_Line1/)
  assert.match(sourceOptions, /townCity: address\.OrgAdd_TownCity/)
  assert.match(sourceOptions, /countryCode: address\.OrgAdd_Country/)
  assert.match(sourceOptions, /unlocode: address\.OrgAdd_UNLOCODE/)
  assert.match(sourceOptions, /emails: emailsByContact/)
  assert.match(clientApi, /export type QuoteOrganisationAddress/)
  assert.match(clientApi, /townCity\?: string \| null/)
  assert.match(clientApi, /countryCode\?: string \| null/)
  assert.match(clientApi, /unlocode\?: string \| null/)
  assert.match(clientApi, /emails: string\[\]/)
})

test("quote sources are company bounded before privileged organisation reads", () => {
  assert.match(sourceOptions, /rpc\("multideck_crm_accessible_account_ids"/)
  assert.match(sourceOptions, /p_company_id: operator\.companyId/)
  assert.match(sourceOptions, /\.in\("Org_id", accessibleOrganisationIds\)/)
  assert.match(sourceOptions, /\.eq\("OrgRelatedDefault_CompanyID", operator\.companyId\)/)
  assert.match(sourceOptions, /CusQuoteHeader_OrgOfficeID\.in/)
  assert.match(sourceOptions, /accessibleOrganisationIdSet\.has\(targetOrganisationId\)/)
  assert.match(organisationFoundation, /"Org_RelatedPartyDefaults" enable row level security/)
  assert.match(organisationFoundation, /revoke all on table public\."Org_RelatedPartyDefaults" from public, anon, authenticated/)
})

test("selected customers receive saved and recent shipper or consignee recommendations", () => {
  assert.match(sourceOptions, /Org_RelatedPartyDefaults/)
  assert.match(sourceOptions, /CusQuote_Parties/)
  assert.match(sourceOptions, /source: "saved_default"/)
  assert.match(sourceOptions, /source: "quote_history"/)
  assert.match(sourceOptions, /usageCount: history\.usageCount/)
  assert.match(sourceOptions, /relatedPartyRecommendations/)
  assert.match(clientApi, /export type QuoteRelatedPartyRecommendation/)
  assert.match(clientApi, /source: "saved_default" \| "quote_history"/)
  assert.match(clientApi, /relatedPartyRecommendations: QuoteRelatedPartyRecommendation\[\]/)
})

test("accessible company quote defaults are exposed to the quote workspace", () => {
  assert.match(sourceOptions, /CRMAccount_MetadataJSON/)
  assert.match(sourceOptions, /\.in\("CRMAccount_OrgID", accessibleOrganisationIds\)/)
  assert.match(sourceOptions, /metadata\.quoteTerms/)
  assert.match(sourceOptions, /quoteTerms: quoteTermsByOrganisation\.get\(id\) \?\? null/)
  assert.match(sourceOptions, /deadline: typeof quoteTerms\.deadline === "string" \? quoteTerms\.deadline : ""/)
  assert.match(clientApi, /quoteTerms\?: \{\s*terms: string\s*subjectTo: string\s*notes: string\s*deadline: string\s*\} \| null/s)
})

test("agent choices use the existing company type model", () => {
  assert.match(sourceOptions, /agents: organisations\.filter/)
  assert.match(sourceOptions, /agents\?\\b/)
  assert.match(clientApi, /agents: QuoteSupplierOption\[\]/)
})

test("country choices come from the active country reference and carry flag-ready codes", () => {
  assert.match(sourceOptions, /from\("RefCountry"\)/)
  assert.match(sourceOptions, /\.eq\("RN_IsActive", true\)/)
  assert.match(sourceOptions, /countries: \(countryResult\.data \?\? \[\]\)\.map/)
  assert.match(clientApi, /export type QuoteCountryOption = \{ code: string; name: string/)
  assert.match(clientApi, /countries: QuoteCountryOption\[\]/)
})

test("quote seed supplies one real selectable example for every company role", () => {
  for (const type of ["Customer", "Supplier", "Shipping Line", "Overseas Agent", "Consignor/Shipper", "Consignee"]) {
    assert.match(seed, new RegExp(`'${type.replace("/", "\\/")}'`, "u"), `${type} needs a seeded organisation.`)
  }
  for (const code of ["QDEMO-CUS", "QDEMO-SUP", "QDEMO-CAR", "QDEMO-AGT", "QDEMO-SHP", "QDEMO-CON"]) {
    assert.match(seed, new RegExp(code, "u"))
  }
  assert.match(seed, /'quoteDemoFixture',true/)
  assert.match(seed, /\.example\.test/)
})

test("source enrichment adds no quote mutation, outbound action, recurring LLM call or parallel Dexter surface", () => {
  assert.doesNotMatch(sourceOptions, /\.insert\(|\.update\(|\.delete\(|governedModelFetch|cron\.schedule/)
  assert.match(sourceOptions, /only enriches existing[\s\S]+no new mutation or watchable event/)
  assert.match(organisationFoundation, /multideck_dexter_domain_customers/)
  assert.match(organisationFoundation, /relatedPartyDefaults/)
})
