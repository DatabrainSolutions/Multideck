import assert from "node:assert/strict"
import test from "node:test"
import { additionalPartyCompanyPatch, clearAdditionalParty, formattedAdditionalPartyAddress } from "../src/lib/customs-additional-parties.ts"
import { additionalCustomsPartyIssues } from "../../supabase/functions/_shared/customs-parties.mts"

test("additional parties retain separate names, addresses and EORIs after serialization", () => {
  const address = { id: "office", line1: "Example Street", townCity: "London", postZipCode: "E1 1AA", countryCode: "GB" }
  const company = { id: "company", name: "Example agent", address, addresses: [address], operations: { customs: { eoriNumber: "GB123456789000" } } }
  for (const party of ["representative", "seller", "buyer"] as const) {
    const draft = JSON.parse(JSON.stringify(additionalPartyCompanyPatch(party, company as never)))
    assert.equal(draft[`${party}Name`], company.name)
    assert.equal(draft[`${party}Eori`], "GB123456789000")
    assert.equal(formattedAdditionalPartyAddress(party, draft), "Example Street\nLondon\nE1 1AA\nGB")
    assert.deepEqual(additionalCustomsPartyIssues(draft), [])
    assert.deepEqual(additionalCustomsPartyIssues({ ...draft, ...clearAdditionalParty(party) }), [])
    assert.equal(draft.importerPaymentDefaults, undefined)
  }
})

test("optional parties reject partial addresses and invalid EORIs without requiring blank panels", () => {
  assert.deepEqual(additionalCustomsPartyIssues({}), [])
  assert.ok(additionalCustomsPartyIssues({seller:"Seller"}).some(issue => issue.field === "sellerAddressLine"))
  assert.ok(additionalCustomsPartyIssues({buyer:"Buyer", buyerEori:"invalid"}).some(issue => issue.field === "buyerEori"))
})
