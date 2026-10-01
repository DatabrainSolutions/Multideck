import assert from "node:assert/strict"
import test from "node:test"
import { customsCargoForSave, customsCargoRows, customsPartiesForSave, customsReceivingFields, customsRegistration } from "../src/lib/booking-customs-source.ts"

const parties = [
  { role: "shipper", sequence: 10, name: "Seller", address: "Warehouse, GB", countryCode: null, organisationId: "seller-id", identifierType: "account_code", identifierValue: "CUS0005", isPrimary: true },
  { role: "consignee", sequence: 20, name: "Receiver", address: "Depot, FR", countryCode: "FR", organisationId: "receiver-id", identifierType: "account_code", identifierValue: "CUS0003", isPrimary: true },
]

const fields = {
  direction: "export", exporterName: "Seller", exporterAddress: "Warehouse, GB", exporterCountry: "GB", exporterIdentifier: "GB123456789000",
  importerName: "Receiver", importerAddress: "Depot, FR", importerCountry: "FR", importerIdentifier: "", importerIdentifierType: "eori",
}

test("account codes are never displayed as EORI or substituted for an absent importer", () => {
  assert.equal(customsRegistration(parties[0]), "")
  assert.equal(customsRegistration(parties[1]), "")
  assert.deepEqual(customsReceivingFields(parties, "export"), {
    importerName: "Receiver", importerAddress: "Depot, FR", importerCountry: "FR", importerIdentifier: "", importerIdentifierType: "eori",
  })
  assert.deepEqual(customsReceivingFields(parties, "import"), {
    importerName: "", importerAddress: "", importerCountry: "", importerIdentifier: "", importerIdentifierType: "eori",
  })
})

test("export save retains operational codes and puts the EORI on a separate consignor", () => {
  const saved = customsPartiesForSave(parties, fields)
  assert.deepEqual(saved.find(party => party.role === "shipper"), parties[0])
  assert.equal(saved.find(party => party.role === "consignee")?.identifierValue, "CUS0003")
  assert.equal(saved.find(party => party.role === "consignor")?.identifierValue, "GB123456789000")
  assert.equal(saved.find(party => party.role === "consignor")?.organisationId, "seller-id")
  assert.equal(saved.some(party => party.role === "importer"), false)
})

test("import save keeps consignee separate and requires explicit importer details", () => {
  const saved = customsPartiesForSave(parties, {
    ...fields, direction: "import", importerName: "", importerAddress: "", importerCountry: "", importerIdentifier: "",
  })
  assert.equal(saved.find(party => party.role === "consignee")?.name, "Receiver")
  assert.equal(saved.find(party => party.role === "consignee")?.identifierValue, "CUS0003")
  assert.equal(saved.find(party => party.role === "consignee")?.isPrimary, false)
  assert.equal(saved.find(party => party.role === "importer")?.name, "")
  assert.equal(saved.find(party => party.role === "importer")?.isPrimary, true)
  const withImporter = customsPartiesForSave(saved, { ...fields, direction: "import", importerName: "Actual importer", importerIdentifierType: "vat", importerIdentifier: "FR123456789" })
  assert.equal(withImporter.find(party => party.role === "importer")?.identifierType, "vat")
  assert.equal(withImporter.find(party => party.role === "importer")?.identifierValue, "FR123456789")
  assert.equal(withImporter.find(party => party.role === "consignee")?.name, "Receiver")
})

test("changing a linked consignee name clears the old company identity and code", () => {
  const saved = customsPartiesForSave(parties, { ...fields, importerName: "Different receiver" })
  const receiver = saved.find(party => party.role === "consignee")
  assert.equal(receiver?.organisationId, null)
  assert.equal(receiver?.identifierValue, null)
  assert.equal(receiver?.name, "Different receiver")
})

test("all cargo rows round-trip without losing IDs, handling, or equipment data", () => {
  const cargo = Array.from({ length: 4 }, (_, index) => ({
    id: `cargo-${index + 1}`, lineNumber: index + 1, description: `Goods ${index + 1}`,
    packageQuantity: `${index + 1}.000000`, packageType: "Cartons", handlingDetailsJson: "{}", cargoData: { equipment: `container-${index + 1}` },
  }))
  const rows = customsCargoRows(cargo)
  assert.equal(rows.length, 4)
  assert.equal(rows[3].packageQuantity, "4")
  rows[2].hsCode = "12345678"
  const saved = customsCargoForSave(cargo, rows)
  assert.equal(saved.length, 4)
  assert.equal(saved[2].hsCode, "12345678")
  assert.deepEqual(saved.map(line => line.id), cargo.map(line => line.id))
  assert.deepEqual(saved.map(line => line.cargoData), cargo.map(line => line.cargoData))
  assert.deepEqual(saved.map(line => line.handlingDetailsJson), cargo.map(line => line.handlingDetailsJson))
  assert.throws(() => customsCargoForSave(cargo, rows.slice(1)), /Cargo changed/)
})
