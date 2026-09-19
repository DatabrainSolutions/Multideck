import assert from "node:assert/strict"
import test from "node:test"
import { companyProfile, updateCompanyProfile, updateQuoteDefaults, updateCompanyCustomFields } from "../src/lib/company-profile.ts"

test("company details edits preserve neighbouring facts, quote defaults and unknown metadata", () => {
  const original = {
    companyProfile: { registeredName: "Example Limited", futureField: { keep: true } },
    quoteTerms: { terms: "Existing terms", followUpDays: 5, futureRule: true },
    customFields: { Cargo: "Chilled" },
  }
  const before = structuredClone(original)
  const website = updateCompanyProfile(original, "website", "example.com")
  const source = updateCompanyProfile(website, "source", " Referral ")
  const quote = updateQuoteDefaults(source, { notes: "Call before collection" })
  assert.equal(companyProfile(quote).website, "https://example.com/")
  assert.equal(companyProfile(quote).source, "Referral")
  assert.equal(companyProfile(quote).registeredName, "Example Limited")
  assert.deepEqual(quote.companyProfile.futureField, { keep: true })
  assert.deepEqual(quote.quoteTerms, { ...original.quoteTerms, notes: "Call before collection" })
  assert.deepEqual(quote.customFields, original.customFields)
  assert.deepEqual(original, before, "save helpers must not mutate the current record")
})

test("company profile validates website addresses without accepting executable or credential-bearing URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "https://user:password@example.com", "https://", "not a website"]) {
    assert.throws(() => updateCompanyProfile({}, "website", url))
  }
  assert.equal(companyProfile(updateCompanyProfile({}, "linkedInUrl", "https://www.linkedin.com/company/example")).linkedInUrl, "https://www.linkedin.com/company/example")
})

test("employee counts must be whole non-negative numbers and empty fields clear explicitly", () => {
  for (const value of ["-1", "1.5", "many", "9007199254740992"]) {
    assert.throws(() => updateCompanyProfile({}, "employeeCount", value))
  }
  assert.equal(companyProfile(updateCompanyProfile({}, "employeeCount", "250")).employeeCount, "250")
  const cleared = updateCompanyProfile({ companyProfile: { website: "https://example.com", source: "Event" } }, "website", " ")
  assert.equal(cleared.companyProfile.website, null)
  assert.deepEqual(companyProfile(cleared), { source: "Event" })
})

test("old or malformed optional metadata is safe to read and edit", () => {
  for (const companyProfileValue of [null, "legacy", [], 4]) {
    assert.deepEqual(companyProfile({ companyProfile: companyProfileValue }), {})
    assert.deepEqual(companyProfile(updateCompanyProfile({ companyProfile: companyProfileValue, untouched: true }, "source", "Event")), { source: "Event" })
  }
  assert.deepEqual(updateQuoteDefaults({ quoteTerms: null, untouched: true }, { terms: "New" }), { quoteTerms: { terms: "New" }, untouched: true })
})

test("editing one custom field retains imported value types and only removes explicitly omitted fields", () => {
  const metadata = { customFields: { Count: 5, Legacy: { keep: true }, Region: "Old", Removed: "Delete this" }, unrelated: true }
  const saved = updateCompanyCustomFields(metadata, [
    { label: "Count", value: "5" },
    { label: "Legacy", value: "[object Object]" },
    { label: "Region", value: " New " },
  ])
  assert.deepEqual(saved, { customFields: { Count: 5, Legacy: { keep: true }, Region: "New" }, unrelated: true })
  assert.equal(metadata.customFields.Region, "Old")
  assert.equal(metadata.customFields.Removed, "Delete this")
})
