import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [register, fixture] = await Promise.all([
  read("src/pages/quotes-register-page.tsx"),
  read("src/lib/quote-development-fixture.ts"),
])

test("the populated quote action is visible only in development and sits with quote search", () => {
  const toolbar = register.slice(register.indexOf("toolbarSearch="), register.indexOf("toolbarFilters="))
  assert.match(toolbar, /import\.meta\.env\.DEV/)
  assert.match(toolbar, /Create test quote/)
  assert.match(toolbar, /Search quotes/)
  assert.match(toolbar, /disabled=\{creatingTestQuote\}/)
})

test("the development guard also protects the mutation helper", () => {
  assert.match(fixture, /if \(!import\.meta\.env\.DEV\) throw new Error/)
  assert.match(fixture, /saveQuoteWorkflow\(null, buildDevelopmentQuotePayload\(sources\)\)/)
})

test("the fixture uses seeded demo companies and fills quote, party, cargo, terms and charge data", () => {
  for (const code of ["QDEMO-CUS", "QDEMO-SUP", "QDEMO-CAR", "QDEMO-AGT", "QDEMO-SHP", "QDEMO-CON"]) {
    assert.match(fixture, new RegExp(code))
  }
  for (const field of [
    "customerReference", "contactEmail", "collectionAddress", "loadingPoint", "dischargePoint", "deliveryAddress",
    "shipmentFacts", "hazardousUnNumber", "packageQuantity", "grossWeightKg", "subjectToTerms", "customerNotes",
    "internalNotes", "shipper", "consignee", "charges",
  ]) {
    assert.match(fixture, new RegExp(`${field}:`), `${field} should be populated by the development fixture`)
  }
  assert.match(fixture, /showToCustomer: true/)
  assert.match(fixture, /showToCustomer: false/)
  assert.match(fixture, /\.example\.test/)
})
