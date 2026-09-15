import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { buildSync } from "esbuild"
const require = createRequire(import.meta.url)
function sourceModule(path) {
  const source = buildSync({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
  const module = { exports: {} }
  new Function("module", "exports", "require", source)(module, module.exports, require)
  return module.exports
}
const { guaranteesForDraft, emptyCustomsGuarantee, guaranteeErrors } = sourceModule("../../supabase/functions/_shared/customs-guarantees.mts")
const { buildICustomsH1ImportXml } = sourceModule("../../supabase/functions/_shared/icustoms.ts")
const { createStandaloneImportDraft, validateStandaloneExportDraft } = sourceModule("../src/lib/customs-declaration.ts")
function validDraft() {
  const draft = createStandaloneImportDraft()
  Object.assign(draft, { declarationType: "A", totalAmount: "100", totalPackages: "1", totalGrossMass: "20", totalNetMass: "10", currency: "GBP", representationType: "2", exportCountry: "CN", borderNationality: "GB", inlandMode: "1", borderMode: "1", goodsLocationName: "WLALONBTW", goodsLocationIdentifier: "GBWLA", goodsLocationType: "A", tradeTerms: "CIF", tradeTermsLocation: "GBWLA", declarant: "GB603202734852", importer: "GB603202734852", exporter: "IE4809539S" })
  for (const party of ["exporter", "importer", "declarant"]) Object.assign(draft, { [party + "Name"]: "Example Company", [party + "AddressLine"]: "1 Example Street", [party + "City"]: "London", [party + "Postcode"]: "E17DB", [party + "Country"]: "GB" })
  Object.assign(draft.items[0], { commodityCode: "0803101000", description: "Fresh plantain bananas", packageKind: "BX", packageMarks: "TEST", packageCount: "1", nonPreferentialOrigin: "CN", procedureCode: "4000", additionalProcedureCode: "C28", grossMass: "20", netMass: "10", itemPrice: "100", currency: "GBP", statisticalValue: "100", customsValuationMethod: "1", preferenceCode: "100", previousDocumentCategory: "Z", previousDocumentType: "355", previousDocumentReference: "20GB34F7Y1O2CX8PT2" })
  return draft
}

test("legacy guarantee survives; explicit removal does not resurrect it", () => {
  const draft = { guaranteeType: "1", guaranteeReference: "LEGACY", guaranteeAmount: "50", guaranteeCurrency: "GBP" }
  assert.equal(guaranteesForDraft(draft)[0].grn, "LEGACY")
  assert.deepEqual(guaranteesForDraft({ ...draft, guarantees: [] }), [])
  const xml = buildICustomsH1ImportXml({ ...validDraft(), ...draft, guarantees: [] })
  assert.ok(!xml.includes("<ObligationGuarantee>"))
  assert.ok(!xml.includes("LEGACY"))
})

test("multiple guarantee rows preserve distinct GRN, ID and details through JSON and XML", () => {
  const a = { ...emptyCustomsGuarantee("a"), type: "1", grn: "GRN-A", guaranteeId: "ID-A", accessCode: "TEST", office: "GBABD001", amount: "100.25", currency: "GBP" }
  const b = { ...emptyCustomsGuarantee("b"), type: "3", grn: "GRN-B", guaranteeId: "ID-B", amount: "25", currency: "EUR" }
  const draft = JSON.parse(JSON.stringify({ ...validDraft(), guarantees: [a, b], loadingLocationId: "SHA" }))
  assert.deepEqual(guaranteesForDraft(draft), [a, b])
  assert.deepEqual(guaranteeErrors(draft), [])
  const xml = buildICustomsH1ImportXml(draft)
  const groups = [...xml.matchAll(/<ObligationGuarantee>(.*?)<\/ObligationGuarantee>/g)].map(match => match[1])
  assert.equal(groups.length, 2)
  assert.match(groups[0], /<ID>ID-A<\/ID><ReferenceID>GRN-A<\/ReferenceID>/)
  assert.match(groups[0], /<GuaranteeOffice><ID>GBABD001<\/ID><\/GuaranteeOffice>/)
  assert.match(groups[1], /<ID>ID-B<\/ID><ReferenceID>GRN-B<\/ReferenceID>/)
  assert.ok(!groups[1].includes("TEST") && !groups[1].includes("GBABD001"))
  assert.match(xml, /<LoadingLocation><ID>SHA<\/ID><\/LoadingLocation>/)
  assert.ok(xml.indexOf("<ObligationGuarantee>") > xml.indexOf("</GoodsShipment>"))
})

test("blank rows are optional; bad type, amount and currency are actionable", () => {
  assert.deepEqual(guaranteeErrors({ guarantees: [emptyCustomsGuarantee("a")] }), [])
  const draft = { ...createStandaloneImportDraft(), guarantees: [{ ...emptyCustomsGuarantee("a"), type: "NO", amount: "-2", currency: "BAD!" }] }
  assert.deepEqual(guaranteeErrors(draft).map(error => error.field), ["guarantees.0.type", "guarantees.0.amount", "guarantees.0.currency"])
  assert.ok(validateStandaloneExportDraft(draft).some(issue => issue.field === "guarantees.0.amount"))
  assert.deepEqual(guaranteeErrors({ guarantees: [{ ...emptyCustomsGuarantee("a"), type: "0" }] }), [])
})

test("airport snapshot contains real IATA codes, including SHA and LHR", () => {
  const rows = JSON.parse(gunzipSync(readFileSync(new URL("../public/reference/iata-airports.json.gz", import.meta.url))))
  assert.ok(rows.length > 5000)
  assert.ok(rows.every(row => /^[A-Z]{3}$/.test(row[0]) && row[1]))
  assert.ok(rows.some(row => row[0] === "LHR" && /Heathrow/.test(row[1])))
  assert.ok(rows.some(row => row[0] === "SHA" && /Hongqiao/.test(row[1])))
})
