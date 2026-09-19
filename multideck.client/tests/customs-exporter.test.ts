import assert from "node:assert/strict"
import test from "node:test"
import { exporterCompanyPatch, formattedExporterAddress } from "../src/lib/customs-exporter.ts"
import { declarantCompanyPatch, formattedDeclarantAddress, applyTenantDeclarantDefault } from "../src/lib/customs-declarant.ts"
import type { ApiCustomerDetail } from "../src/lib/customer-api"

const address = { id: "office", line1: "1 Example Street", line2: "", townCity: "Paris", postZipCode: "75001", countryCode: "FR" }
const company = { id: "company", name: "Example exporter", address, addresses: [address], operations: { customs: { eoriNumber: "FR123456789", addressEoris: { office: "FR987654321" }, dutyPaymentMethod: "E" } } } as unknown as ApiCustomerDetail

test("exporter resolves office EORI and structured address without importer defaults", () => {
  const patch = exporterCompanyPatch(company, "office")
  assert.equal(patch.exporterEori, "FR987654321")
  assert.equal(patch.exporterName, company.name)
  assert.equal(patch.exporterOrganisationId, company.id)
  assert.equal(patch.exporterAddressId, "office")
  assert.equal(patch.importerPaymentDefaults, undefined)
  const saved = JSON.parse(JSON.stringify(patch))
  assert.equal(formattedExporterAddress(saved), "1 Example Street\n75001 Paris\nFR")
  assert.equal(saved.exporterEori, "FR987654321")
})

test("unknown office is ignored and missing EORI is not invented", () => {
  assert.deepEqual(exporterCompanyPatch(company, "missing"), {})
  assert.equal(exporterCompanyPatch({ ...company, operations: {} } as ApiCustomerDetail).exporterEori, "")
})

test("declarant matches office address resolution and retains a saved selection", () => {
  const patch = declarantCompanyPatch(company, "office")
  const saved = JSON.parse(JSON.stringify({ direction: "import", ...patch }))
  assert.equal(saved.declarantEori, "FR987654321")
  assert.equal(saved.declarantOrganisationId, "company")
  assert.equal(formattedDeclarantAddress(saved), "1 Example Street\n75001 Paris\nFR")
  assert.equal(applyTenantDeclarantDefault(saved, { name: "Tenant" }), saved)
  assert.deepEqual(declarantCompanyPatch(company, "missing"), {})
  assert.equal(patch.importerPaymentDefaults, undefined)
})
