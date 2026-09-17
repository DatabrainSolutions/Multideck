import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
const require = createRequire(import.meta.url)
function sourceModule(path) {
  const source = buildSync({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
  const module = { exports: {} }
  new Function("module", "exports", "require", source)(module, module.exports, require)
  return module.exports
}
const { createStandaloneImportDraft, validateStandaloneExportDraft } = sourceModule("../src/lib/customs-declaration.ts")
const { customsTradeTerms, customsAdjustmentCodes, importAdjustmentsForDraft, importAdjustmentErrors } = sourceModule("../../supabase/functions/_shared/customs-import-terms.mts")
const { buildICustomsH1ImportXml, validateICustomsH1Import } = sourceModule("../../supabase/functions/_shared/icustoms.ts")
const { importDetailsErrors, importFiscalParties } = sourceModule("../../supabase/functions/_shared/customs-import-details.mts")
const { iCustomsCommodityDetail } = sourceModule("../../supabase/functions/_shared/icustoms.ts")

test("commodity quota details follow measure direction and preserve zero balances", () => {
  const link = (type, id) => ({ data: { type, id } })
  const payload = {
    data: { relationships: { import_measures: { data: [{ type: "measure", id: "m1" }, { type: "measure", id: "ordinary" }] }, export_measures: { data: [] } } },
    included: [
      { type: "measure", id: "m1", attributes: { effective_start_date: "2026-01-01", effective_end_date: "2026-12-31" }, relationships: { order_number: link("order_number", "090001"), geographical_area: link("geographical_area", "1011"), duty_expression: link("duty_expression", "d1"), excluded_countries: { data: [{ type: "geographical_area", id: "GB" }] } } },
      { type: "measure", id: "unrelated", relationships: { order_number: link("order_number", "999999") } },
      { type: "measure", id: "ordinary", relationships: {} },
      { type: "order_number", id: "090001", attributes: { number: "090001" }, relationships: { definition: link("definition", "q1") } },
      { type: "definition", id: "q1", attributes: { status: "Exhausted", balance: 0, initial_volume: 1000, measurement_unit: "kg" } },
      { type: "geographical_area", id: "1011", attributes: { description: "All countries" } },
      { type: "geographical_area", id: "GB", attributes: { description: "United Kingdom" } },
      { type: "duty_expression", id: "d1", attributes: { base: "<span>0.00</span> %" } },
    ],
  }
  const quotas = iCustomsCommodityDetail(payload, "import").quotas
  assert.equal(quotas.length, 1)
  assert.equal(quotas[0].orderNumber, "090001")
  assert.equal(quotas[0].balance, "0")
  assert.equal(quotas[0].status, "Exhausted")
  assert.equal(quotas[0].dutyRate, "0.00 %")
  assert.deepEqual(quotas[0].excludedAreas, ["United Kingdom"])
  assert.deepEqual(iCustomsCommodityDetail(payload, "export").quotas, [])
  assert.deepEqual(iCustomsCommodityDetail({}, "import").quotas, [])
  payload.included = payload.included.filter(row => row.type !== "definition")
  assert.equal(iCustomsCommodityDetail(payload, "import").quotas[0].balance, "")
})

test("optional import details are blank-safe and validate incomplete pairs consistently", () => {
  assert.deepEqual(importDetailsErrors(createStandaloneImportDraft()), [])
  const draft = { ...createStandaloneImportDraft(), warehouseType: "U", exchangeRate: "-1", supervisingOffice: "bad", domesticDutyTaxParties: [{ id: "one", partyId: "GB123456789", roleCode: "" }, { id: "two", partyId: "", roleCode: "FR2" }] }
  const errors = importDetailsErrors(draft)
  assert.deepEqual(errors.map(e => e.field), ["exchangeRate", "supervisingOffice", "warehouseIdentifier", "domesticDutyTaxParties.0.roleCode", "domesticDutyTaxParties.1.partyId"])
  const client = validateStandaloneExportDraft(draft)
  const provider = validateICustomsH1Import(draft)
  for (const error of errors) {
    assert.ok(client.some(e => e.field === error.field))
    assert.ok(provider.includes(error.message))
  }
  assert.ok(importDetailsErrors({ exchangeRate: "Infinity" }).length)
  assert.ok(importDetailsErrors({ exchangeRate: "0" }).length)
  assert.deepEqual(importDetailsErrors({ exchangeRate: "1.23456789" }), [])
})

test("header fields follow the provider import XML structure and retain tax party pairing", () => {
  const draft = { ...createStandaloneImportDraft(), exchangeRate: "1.23456789", supervisingOffice: "GBABD001", presentationOffice: "GBDVR001", warehouseType: "U", warehouseIdentifier: "WAREHOUSE-TEST", domesticDutyTaxParties: [{ id: "one", partyId: "GB111111111", roleCode: "FR1" }, { id: "two", partyId: "GB222222222", roleCode: "FR3" }, { id: "blank", partyId: "", roleCode: "" }] }
  draft.items[0].domesticDutyTaxParties = [{ id: "item", partyId: "GB333333333", roleCode: "FR2" }]
  Object.assign(draft, { declarationType: "A", totalAmount: "100", totalPackages: "1", totalGrossMass: "20", totalNetMass: "10", currency: "GBP", representationType: "2", exportCountry: "CN", borderNationality: "GB", inlandMode: "1", borderMode: "1", goodsLocationName: "WLALONBTW", goodsLocationIdentifier: "GBWLA", goodsLocationType: "A", tradeTerms: "CIF", tradeTermsLocation: "GBWLA", declarant: "GB603202734852", importer: "GB603202734852", exporter: "IE4809539S" })
  for (const party of ["exporter", "importer", "declarant"]) Object.assign(draft, { [party + "Name"]: "Example Company", [party + "AddressLine"]: "1 Example Street", [party + "City"]: "London", [party + "Postcode"]: "E17DB", [party + "Country"]: "GB" })
  Object.assign(draft.items[0], { commodityCode: "0803101000", description: "Fresh plantain bananas", packageKind: "BX", packageMarks: "TEST", packageCount: "1", nonPreferentialOrigin: "CN", procedureCode: "4000", additionalProcedureCode: "C28", grossMass: "20", netMass: "10", itemPrice: "100", currency: "GBP", statisticalValue: "100", customsValuationMethod: "1", preferenceCode: "100", previousDocumentCategory: "Z", previousDocumentType: "355", previousDocumentReference: "20GB34F7Y1O2CX8PT2" })
  const saved = JSON.parse(JSON.stringify(draft))
  const xml = buildICustomsH1ImportXml(saved)
  assert.ok(xml.includes("<CurrencyExchange><RateNumeric>1.23456789</RateNumeric></CurrencyExchange>"))
  assert.ok(xml.includes("<Warehouse><ID>WAREHOUSE-TEST</ID><TypeCode>U</TypeCode></Warehouse></GoodsShipment>"))
  assert.ok(xml.includes("</GoodsShipment><PresentationOffice><ID>GBDVR001</ID></PresentationOffice><SupervisingOffice><ID>GBABD001</ID></SupervisingOffice>"))
  const headerParties = xml.split("<GovernmentAgencyGoodsItem>")[0]
  assert.ok(headerParties.includes("<DomesticDutyTaxParty><ID>GB111111111</ID><RoleCode>FR1</RoleCode></DomesticDutyTaxParty>"))
  assert.ok(headerParties.includes("<DomesticDutyTaxParty><ID>GB222222222</ID><RoleCode>FR3</RoleCode></DomesticDutyTaxParty>"))
  assert.ok(!headerParties.includes("GB333333333"))
  assert.equal((xml.match(/<DomesticDutyTaxParty>/g) ?? []).length, 3)
  const updated = buildICustomsH1ImportXml({ ...saved, domesticDutyTaxParties: saved.domesticDutyTaxParties.slice(1), warehouseType: "", warehouseIdentifier: "", supervisingOffice: "", presentationOffice: "", exchangeRate: "" })
  assert.ok(!updated.includes("GB111111111"))
  assert.ok(updated.includes("GB222222222") && updated.includes("GB333333333"))
  assert.ok(!/<(Warehouse|SupervisingOffice|PresentationOffice|CurrencyExchange)>/.test(updated))
  assert.deepEqual(importFiscalParties([]), [])
  assert.equal(importFiscalParties(undefined).length, 1)
  const customerDraft = { ...draft, domesticDutyTaxParties: [{ id: "customer", partyId: "", roleCode: "FR4", useCustomer: true }] }
  customerDraft.importerName = "Customer Trading Ltd"
  customerDraft.importerVatNumber = "GB123456789"
  const customerXml = buildICustomsH1ImportXml(customerDraft)
  assert.ok(customerXml.includes("<DomesticDutyTaxParty><ID>GB123456789</ID><RoleCode>FR4</RoleCode></DomesticDutyTaxParty>"))
  assert.ok(importDetailsErrors({ ...customerDraft, importerVatNumber: "" }).some(error => error.field.endsWith("partyId")))
})

test("old draft costs survive conversion; explicit rows replace rather than duplicate them", () => {
  const draft = createStandaloneImportDraft()
  draft.freightChargeAmount = "120"
  draft.freightChargeCurrency = "EUR"
  draft.insuranceCostAmount = "20"
  draft.insuranceCostCurrency = "GBP"
  assert.deepEqual(importAdjustmentsForDraft(draft).map((row) => row.code), ["AV", "AP", "AK", "AR"])
  draft.importAdjustments = importAdjustmentsForDraft(draft)
  assert.equal(draft.importAdjustments[1].amount, "120")
  const saved = JSON.parse(JSON.stringify(draft))
  assert.deepEqual(importAdjustmentsForDraft(saved), draft.importAdjustments)
  assert.ok(importAdjustmentsForDraft({ ...saved, importAdjustments: [] }).every((row) => !row.amount && !row.currency))
})

test("starter rows are optional; completed rows require listed codes, currency and decimal amounts", () => {
  assert.equal(customsTradeTerms.length, 12)
  assert.equal(customsAdjustmentCodes.length, 33)
  assert.deepEqual(importAdjustmentErrors(importAdjustmentsForDraft({})), [])
  assert.deepEqual(importAdjustmentErrors([{ id: "a", code: "AK", amount: "12", currency: "" }]).map((error) => error.field), ["currency"])
  assert.deepEqual(importAdjustmentErrors([{ id: "a", code: "NO", amount: "-1", currency: "GBP" }]).map((error) => error.field), ["code", "amount"])
  assert.deepEqual(importAdjustmentErrors([{ id: "a", code: "AC", amount: "2.50", currency: "" }]), [])
})

test("locking the four starter codes preserves earlier user changes and gross-weight costs", () => {
  const previous = { importAdjustments: [{ id: "import-vat", code: "AE", amount: "23", currency: "GBP" }, { id: "extra-vat", code: "AV", amount: "14", currency: "GBP" }] }
  const rows = importAdjustmentsForDraft(previous)
  assert.deepEqual(rows.slice(0, 4).map((row) => row.code), ["AV", "AP", "AK", "AR"])
  assert.equal(rows[0].amount, "14")
  assert.deepEqual(rows[4], { id: "additional-import-vat", code: "AE", amount: "23", currency: "GBP" })
  const mass = importAdjustmentsForDraft({ freightChargeAmount: "75", freightChargeCurrency: "EUR", freightChargeApportionment: "gross_mass" })
  assert.ok(mass.some((row) => row.code === "AQ" && row.amount === "75"))
  assert.ok(mass.find((row) => row.code === "AP").amount === "")
})

test("provider mapping apportions money, keeps percentages, and never resurrects legacy costs", () => {
  const draft = createStandaloneImportDraft()
  Object.assign(draft, { declarationType: "A", totalAmount: "400", totalPackages: "2", totalGrossMass: "40", totalNetMass: "20", currency: "GBP", representationType: "2", exportCountry: "CN", borderNationality: "GB", inlandMode: "1", borderMode: "1", goodsLocationName: "WLALONBTW", goodsLocationIdentifier: "GBWLA", goodsLocationType: "A", tradeTerms: "CIF", tradeTermsLocation: "GBWLA", declarant: "GB603202734852", importer: "GB603202734852", exporter: "IE4809539S" })
  for (const party of ["exporter", "importer", "declarant"]) Object.assign(draft, { [party + "Name"]: "Example Company", [party + "AddressLine"]: "1 Example Street", [party + "City"]: "London", [party + "Postcode"]: "E17DB", [party + "Country"]: "GB" })
  Object.assign(draft.items[0], { commodityCode: "0803101000", description: "Fresh plantain bananas", packageKind: "BX", packageMarks: "TEST", packageCount: "1", nonPreferentialOrigin: "CN", procedureCode: "4000", additionalProcedureCode: "C28", netMass: "10", statisticalValue: "100", customsValuationMethod: "1", preferenceCode: "100", previousDocumentCategory: "Z", previousDocumentType: "355", previousDocumentReference: "20GB34F7Y1O2CX8PT2" })
  draft.freightChargeAmount = "999"
  draft.freightChargeCurrency = "GBP"
  draft.items = [
    { ...draft.items[0], id: "1", itemPrice: "100", grossMass: "30", currency: "GBP" },
    { ...draft.items[0], id: "2", itemPrice: "300", grossMass: "10", currency: "GBP" },
  ]
  draft.importAdjustments = [
    { id: "ap", code: "AP", amount: "120", currency: "EUR" },
    { id: "ak", code: "AK", amount: "", currency: "" },
    { id: "bh", code: "BH", amount: "20", currency: "USD" },
    { id: "ac", code: "AC", amount: "2.5", currency: "" },
  ]
  const xml = buildICustomsH1ImportXml(draft)
  assert.match(xml, /<AdditionCode>AP<\/AdditionCode><Amount currencyID="EUR">30<\/Amount>/)
  assert.match(xml, /<AdditionCode>AP<\/AdditionCode><Amount currencyID="EUR">90<\/Amount>/)
  assert.match(xml, /<AdditionCode>BH<\/AdditionCode><Amount currencyID="USD">5<\/Amount>/)
  assert.equal((xml.match(/<AdditionCode>AC<\/AdditionCode><Amount>2.5<\/Amount>/g) ?? []).length, 2)
  assert.doesNotMatch(xml, /999|<AdditionCode>AK<\/AdditionCode>/)
  draft.importAdjustments = [{ id: "aq", code: "AQ", amount: "120", currency: "EUR" }]
  const massXml = buildICustomsH1ImportXml(draft)
  assert.match(massXml, /<AdditionCode>AQ<\/AdditionCode><Amount currencyID="EUR">90<\/Amount>/)
  draft.importAdjustments = []
  assert.doesNotMatch(buildICustomsH1ImportXml(draft), /<AdditionCode>AP<\/AdditionCode>/)
})

test("frontend and server require EXW freight from the current rows and reject duplicates", () => {
  const draft = createStandaloneImportDraft()
  draft.tradeTerms = "EXW"
  draft.importAdjustments = [{ id: "ap", code: "AP", amount: "120", currency: "EUR" }]
  assert.ok(!validateStandaloneExportDraft(draft).some((issue) => issue.message.includes("EXW imports")))
  assert.ok(!validateICustomsH1Import(draft).some((issue) => issue.includes("EXW imports")))
  draft.items[0].valuationAdjustments = [{ id: "duplicate", code: "AP", amount: "10", currency: "EUR" }]
  assert.ok(validateStandaloneExportDraft(draft).some((issue) => issue.message.includes("duplicate item adjustment")))
  assert.ok(validateICustomsH1Import(draft).some((issue) => issue.includes("duplicate cost")))
  draft.importAdjustments = []
  assert.ok(validateStandaloneExportDraft(draft).some((issue) => issue.message.includes("EXW imports")))
  assert.ok(validateICustomsH1Import(draft).some((issue) => issue.includes("EXW imports")))
})

test("air freight adjustments require their loading airport, while blank AR stays optional", () => {
  const draft = createStandaloneImportDraft()
  draft.importAdjustments = importAdjustmentsForDraft(draft)
  assert.ok(!validateICustomsH1Import(draft).some((issue) => issue.includes("airport of loading")))
  draft.importAdjustments[3].amount = "25"
  draft.importAdjustments[3].currency = "GBP"
  assert.ok(validateICustomsH1Import(draft).some((issue) => issue.includes("airport of loading")))
  assert.ok(validateStandaloneExportDraft(draft).some((issue) => issue.field === "loadingLocationId"))
  draft.loadingLocationId = "USJFK"
  assert.ok(!validateICustomsH1Import(draft).some((issue) => issue.includes("airport of loading")))
})
