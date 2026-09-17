import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const { buildSync } = require("esbuild")
function load(file) {
  const built = buildSync({ entryPoints: [new URL(`../functions/_shared/${file}`, import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
  const module = { exports: {} }; new Function("module", "exports", built)(module, module.exports); return module.exports
}
const { standardTariffSelection, parseTariffSnapshot } = load("customs-tariff-reference.mts")
const { calculationFromDraft } = load("customs-calculation-draft.mts")
const { quotaAllocationCandidate, quotaItemQuantity } = load("customs-quota-allocation.mts")
const review = () => ({ preferenceCode: "300", origin: "MA", dataset: "uk", validFrom: "2026-09-01", validTo: "2026-09-30", proofReference: "Synthetic origin proof and code", originRulesEvidence: "Synthetic agreement and originating-goods review", transportEvidence: "Synthetic non-alteration review" })
const measure = (id, typeCode, preferenceCode, rate) => ({ id, typeCode, preferenceCode, description: typeCode, series: typeCode === "305" ? "P" : "C", area: "MA", start: "2026-01-01", end: null, vat: typeCode === "305", excise: false, dutyExpression: "", components: [{ id: `${id}-01`, type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: rate } }], conditions: [], footnotes: [], additionalCode: null, orderNumber: null, excludedCountries: [], unresolved: [], percentage: rate, legalActs: [{ id: "legal-fixture", type: "legal_act", attributes: { description: "Synthetic legal basis" } }] })
const snapshot = () => ({ request: { code: "6203423100", origin: "MA", date: "2026-09-15", dataset: "uk" }, sourceUrl: "https://api.trade-tariff.service.gov.uk/uk/api/commodities/6203423100", retrievedAt: "2026-09-15T12:00:00Z", raw: { fixture: true }, commodity: { id: "commodity", type: "commodity", attributes: {} }, measures: [measure("mfn", "103", "100", "12"), measure("preference", "142", "300", "0"), measure("vat", "305", undefined, "20"), measure("end-use", "117", "140", "0")] })
const select = (s, r = review(), code = "300") => standardTariffSelection(s, s, [], { jurisdiction: "GB", preferenceCode: code, preferenceReview: r })

test("EU proof uses the retained group measure without replacing individual-origin fiscal evidence", () => {
  const raw = JSON.parse(readFileSync(new URL("fixtures/customs-ironing-board-fr-20260915.json", import.meta.url), "utf8"))
  const request = { code: "7323930010", origin: "FR", date: "2026-09-15", dataset: "uk" }
  const s = parseTariffSnapshot(raw, request, "2026-09-15T12:00:00Z")
  const proof = { ...review(), origin: "EU" }
  const treatment = { jurisdiction: "GB", preferenceCode: "300", preferentialOrigin: "EU", preferenceReview: proof }
  const before = JSON.stringify(s)
  const result = standardTariffSelection(s, s, [], treatment)
  assert.deepEqual(result.issues, [])
  assert.equal(result.duty.id, "20283341")
  const draft = { direction: "import", customsConversionDate: request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "300", preferentialOrigin: "EU", nonPreferentialOrigin: "FR", commodityCode: request.code }], dutyCalculationSetup: { jurisdiction: "GB", preferences: { item: proof } } }
  const run = calculationFromDraft(draft, [], s.retrievedAt, { item: s })
  assert.deepEqual(run.result.totals, { duty: "0.00", vat: "200.00" }, JSON.stringify(run.result))
  assert.equal(run.result.autoPopulationAllowed, false)
  assert.equal(run.result.preferenceOptions[0].origin, "EU")
  assert.equal(run.result.preferenceOptions[0].options[0].id, "20283341")
  assert.equal(JSON.stringify(s), before)
  for (const mutate of [
    x => { x.measures.find(m => m.id === "20283341").area = "MA" },
    x => { x.raw.included = x.raw.included.filter(r => !(r.type === "geographical_area" && r.id === "1013")) },
    x => { x.measures.push(measure("additional", "696", undefined, "25")) },
    x => { x.measures.find(m => m.id === "20283341").excludedCountries.push("FR") },
  ]) {
    const changed = structuredClone(s); mutate(changed)
    assert.equal(standardTariffSelection(changed, changed, [], treatment).duty, null)
  }
  assert.equal(standardTariffSelection(s, s, [], { ...treatment, preferenceReview: { ...proof, origin: "FR" } }).duty, null)
})

test("unclaimed non-preferential quota keeps full-rate duty without dropping safeguards", () => {
  const s = snapshot()
  const quota = measure("quota-alternative", "122", "120", "0")
  quota.orderNumber = { id: "050001", type: "order_number", attributes: { number: "050001" } }
  quota.conditions = [{ id: "quota-document", type: "measure_condition", attributes: { condition_code: "A" } }]
  s.measures.push(quota)
  const before = JSON.stringify(s)
  const run = () => select(s, undefined, "100")
  assert.equal(run().duty.id, "mfn")
  assert.deepEqual(run().components, [{ type: "percent", rate: "12" }])
  assert.match(run().notClaimed.find(m => m.id === quota.id).reason, /full-rate duty retained/)
  assert.equal(JSON.stringify(s), before)
  for (const type of ["696", "651", "652", "695", "552"]) {
    s.measures.push(measure(`extra-${type}`, type, undefined, "25"))
    assert.equal(run().duty, null, `${type} must not be omitted with the quota`)
    s.measures.pop()
  }
  quota.unresolved = ["missing legal relation"]
  assert.equal(run().duty, null)
  quota.unresolved = []
  quota.preferenceCode = "128"
  assert.equal(run().duty, null, "Different quota treatment still requires review")
  quota.preferenceCode = "120"
  assert.equal(standardTariffSelection(s, s, [], { jurisdiction: "NI", preferenceCode: "100" }).duty, null)
  assert.equal(select(s, undefined, "120").duty, null, "A quota claim cannot use the full-rate exclusion")
})

test("quota claims retain their rule family without inventing preferential origin or reduced liability", () => {
  const s = snapshot()
  const draft = { direction: "import", customsConversionDate: s.request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "120", quotaOrderNumber: "050001", nonPreferentialOrigin: "MA", commodityCode: s.request.code }], dutyCalculationSetup: { jurisdiction: "GB", items: { item: { dutyRate: "0", vatRate: "20", evidence: "Synthetic operator input" } } } }
  const output = calculationFromDraft(draft, [], s.retrievedAt)
  assert.ok(output.input.items[0].families.includes("quota"))
  assert.ok(!output.input.items[0].families.includes("preference"), "Non-preferential quota is not preferential origin")
  assert.equal(output.result.totals, null)
  assert.equal(output.result.autoPopulationAllowed, false)
  draft.items[0].preferenceCode = "320"
  const preferential = calculationFromDraft(draft, [], s.retrievedAt)
  assert.ok(preferential.input.items[0].families.includes("quota"))
  assert.ok(preferential.input.items[0].families.includes("preference"))
  assert.equal(preferential.result.totals, null)
})

test("saved allocation ledger binds net mass and reconciles across invoice items without granting relief", () => {
  const s = snapshot()
  const makeItem = (id, netMass) => ({ id, invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "200", netMass, customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "120", quotaOrderNumber: "050001", nonPreferentialOrigin: "MA", commodityCode: s.request.code })
  const allocation = { commodity: s.request.code, origin: "MA", dataset: "uk", measureId: "synthetic", orderNumber: "050001", preferenceCode: "120", status: "allocated", allocatedQuantity: "100", unit: "KGM", allocationReference: "TEST-ALLOCATION", validFrom: "2026-09-01", validTo: "2026-09-30", evidence: "Synthetic allocation evidence, not a customs approval" }
  const draft = { direction: "import", customsConversionDate: s.request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [makeItem("first", "60"), makeItem("second", "40")], dutyCalculationSetup: { jurisdiction: "GB", quotaAllocations: { first: allocation, second: { ...allocation } } } }
  const run = () => calculationFromDraft(draft, [], s.retrievedAt).result
  const before = JSON.stringify(draft)
  const result = run()
  assert.deepEqual(result.quotaAllocationLedger.issues, [])
  assert.deepEqual(result.quotaAllocationLedger.allocations[0].remaining, { numerator: "0", denominator: "1" })
  assert.equal(result.totals, null)
  assert.equal(result.autoPopulationAllowed, false)
  assert.equal(JSON.stringify(draft), before)
  draft.items[1].netMass = "40.000000000001"
  assert.match(run().quotaAllocationLedger.issues[0], /overused/)
  draft.items[1].netMass = "40"
  draft.items[1].quotaOrderNumber = "050002"
  assert.match(run().quotaAllocationLedger.issues[0], /must match/)
  draft.items[1].quotaOrderNumber = "050001"
  draft.dutyCalculationSetup.quotaAllocations.second.status = "requested"
  assert.match(run().quotaAllocationLedger.issues[0], /confirmed/)
  draft.dutyCalculationSetup.quotaAllocations.second.status = "allocated"
  draft.dutyCalculationSetup.quotaAllocations.second.validFrom = "2026-09-00"
  assert.match(run().quotaAllocationLedger.issues[0], /calculation date/)
  delete draft.dutyCalculationSetup.quotaAllocations.second
  draft.dutyCalculationSetup.quotaAllocations.deletedItem = { ...allocation }
  assert.match(run().quotaAllocationLedger.issues[0], /no longer/)
  delete draft.dutyCalculationSetup.quotaAllocations.deletedItem
  assert.match(run().quotaAllocationLedger.issues[0], /every quota item/)
})

test("official litre quota uses evidenced volume, never net mass or a public balance", () => {
  const raw = JSON.parse(readFileSync(new URL("fixtures/customs-ethanol-us-20260915.json", import.meta.url), "utf8"))
  const s = parseTariffSnapshot(raw, { code: "2207100090", origin: "US", date: "2026-09-15", dataset: "uk" }, "2026-09-15T12:00:00Z")
  const allocation = { commodity: s.request.code, origin: "US", dataset: "uk", measureId: "20264391", orderNumber: "059750", preferenceCode: "320", status: "allocated", allocatedQuantity: "100", unit: "LTR", allocationReference: "SYNTHETIC-LITRE-ALLOCATION", validFrom: "2026-09-01", validTo: "2026-09-30", evidence: "Synthetic allocation, not customs approval", originEvidence: "Synthetic originating-goods evidence" }
  const quantities = [{ quantity: "75", unit: "LTR", evidence: "Synthetic measured finished-product volume" }]
  const declared = { orderNumber: allocation.orderNumber, preferenceCode: allocation.preferenceCode, ...quotaItemQuantity("900", "LTR", quantities) }
  assert.equal(declared.quantity, "75")
  const before = JSON.stringify(s)
  assert.equal(quotaAllocationCandidate(s, allocation, declared).measure.id, "20264391")
  assert.equal(JSON.stringify(s), before)
  assert.throws(() => quotaItemQuantity("900", "LTR", []), /evidenced/)
  assert.throws(() => quotaItemQuantity("900", "LTR", [...quantities, ...quantities]), /one evidenced/)
  assert.throws(() => quotaItemQuantity("900", "LTR", [{ ...quantities[0], qualifier: "A" }]), /evidenced/)
  assert.throws(() => quotaItemQuantity("900", "LTR", [{ ...quantities[0], evidence: "" }]), /evidenced/)
  assert.throws(() => quotaAllocationCandidate(s, { ...allocation, status: "requested" }, declared), /not a confirmed/)
  assert.throws(() => quotaAllocationCandidate(s, { ...allocation, allocatedQuantity: "74.999" }, declared), /only part/)
  assert.throws(() => quotaAllocationCandidate(s, { ...allocation, unit: "KGM" }, { ...declared, unit: "KGM" }), /official unit/)
  const definition = raw.included.find(row => row.type === "definition" && row.id === "32014")
  definition.attributes.measurement_unit_qualifier = "A"
  assert.throws(() => quotaAllocationCandidate(s, allocation, declared), /official unit/)
})

test("retained Colombian quota selects its rate only with matching allocation, unit and origin evidence", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/customs-ironing-board-co-20260915.json", import.meta.url), "utf8"))
  const s = parseTariffSnapshot(raw, { code: "7323930010", origin: "CO", date: "2026-09-15", dataset: "uk" }, "2026-09-15T02:00:00Z")
  const allocation = { commodity: s.request.code, origin: "CO", dataset: "uk", measureId: "20050020", orderNumber: "057162", preferenceCode: "320", status: "allocated", allocatedQuantity: "10", unit: "KGM", allocationReference: "SYNTHETIC-CO-QUOTA", validFrom: "2026-09-01", validTo: "2026-09-30", evidence: "Synthetic allocation only, not actual customs approval", originEvidence: "Synthetic agreement and originating-goods evidence" }
  const draft = { direction: "import", customsConversionDate: s.request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "12", netMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "320", quotaOrderNumber: "057162", nonPreferentialOrigin: "CO", preferentialOrigin: "CO", commodityCode: s.request.code }], dutyCalculationSetup: { jurisdiction: "GB", quotaAllocations: { item: allocation } } }
  const run = () => calculationFromDraft(draft, [], s.retrievedAt, { item: s })
  const before = JSON.stringify({ s, draft })
  const result = run()
  assert.deepEqual(result.result.totals, { duty: "0.00", vat: "200.00" }, JSON.stringify(result.result.issues))
  assert.equal(result.input.items[0].measures[0].reference, "20050020")
  assert.equal(result.result.autoPopulationAllowed, false)
  assert.equal(JSON.stringify({ s, draft }), before)
  // Synthetic volume variant isolates saved-draft wiring. It is not evidence
  // that this real Colombian goods quota uses litres.
  const volume = structuredClone(s)
  volume.raw.included.find(row => row.type === "definition").attributes.measurement_unit = "Litre (l)"
  const volumeDraft = structuredClone(draft)
  volumeDraft.dutyCalculationSetup.quotaAllocations.item.unit = "LTR"
  volumeDraft.items[0].netMass = "900"
  volumeDraft.dutyCalculationSetup.items = { item: { tariffQuantities: [{ quantity: "10", unit: "LTR", evidence: "Synthetic volume fixture" }] } }
  const volumeRun = () => calculationFromDraft(volumeDraft, [], s.retrievedAt, { item: volume }).result
  assert.deepEqual(volumeRun().totals, { duty: "0.00", vat: "200.00" })
  assert.deepEqual(volumeRun().quotaAllocationLedger.allocations[0].used, { numerator: "10", denominator: "1" })
  volumeDraft.dutyCalculationSetup.items.item.tariffQuantities = []
  assert.equal(volumeRun().totals, null)
  assert.match(volumeRun().issues.join(), /evidenced item quantity/)
  allocation.measureId = ""
  assert.deepEqual(run().result.totals, { duty: "0.00", vat: "200.00" })
  allocation.status = "requested"
  assert.equal(run().result.totals, null)
  allocation.status = "allocated"
  allocation.allocatedQuantity = "9"
  assert.equal(run().result.totals, null)
  allocation.allocatedQuantity = "10"
  allocation.originEvidence = ""
  assert.equal(run().result.totals, null)
  allocation.originEvidence = "Synthetic origin evidence"
  for (const type of ["696", "651", "652", "552"]) {
    s.measures.push(measure(`extra-${type}`, type, undefined, "25"))
    assert.equal(run().result.totals, null, `${type} must not disappear with a quota`)
    s.measures.pop()
  }
  const definition = raw.included.find(row => row.type === "definition")
  definition.attributes.measurement_unit = "Litre"
  assert.equal(run().result.totals, null)
})

test("saved D008 remedy review requires the matching item document", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/customs-ironing-board-cn-20260915.json", import.meta.url), "utf8"))
  const s = parseTariffSnapshot(raw, { code: "7323930010", origin: "CN", date: "2026-09-15", dataset: "uk" }, "2026-09-15T12:00:00Z")
  const remedyReview = { commodity: s.request.code, origin: "CN", dataset: "uk", validFrom: s.request.date, validTo: s.request.date, originEvidence: "Test origin", exporterEvidence: "Test exporter", legalEvidence: "Test law", selections: [{ measureId: "20042613", additionalCode: "A782", signedInvoice: { reference: "TEST-SIGNED", evidence: "Test signed invoice review" } }] }
  const item = { id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "100", nonPreferentialOrigin: "CN", commodityCode: s.request.code, taricCode: "A782", additionalDocumentCategory: "D", additionalDocumentType: "008", additionalDocumentId: "TEST-SIGNED" }
  const draft = { direction: "import", customsConversionDate: s.request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [item], dutyCalculationSetup: { jurisdiction: "GB", items: { item: { remedyReview } } } }
  const run = () => calculationFromDraft(draft, [], s.retrievedAt, { item: s })
  const before = JSON.stringify(draft)
  const output = run()
  assert.ok(output.input.items[0].measures.some(m => m.taxType === "A30" && m.components[0].rate === "34.9"), JSON.stringify(output.result))
  assert.equal(output.result.autoPopulationAllowed, false)
  assert.equal(JSON.stringify(draft), before)
  item.additionalDocumentId = "OTHER"
  assert.equal(run().result.totals, null)
  item.additionalDocumentId = ""
  item.additionalDocuments = [{ category: "D", type: "008", reference: "TEST-SIGNED" }]
  assert.ok(run().input.items[0].measures.some(m => m.taxType === "A30"))
  item.additionalDocumentId = "TEST-SIGNED"
  assert.equal(run().result.totals, null)
})

test("official preference correlation selects its measure without adding MFN or unrelated end-use", () => {
  const s = snapshot(), before = JSON.stringify(s), selection = select(s)
  assert.deepEqual(selection.issues, [])
  assert.equal(selection.duty.id, "preference")
  assert.equal(selection.components[0].rate, "0")
  assert.deepEqual(selection.notClaimed.map(m => m.id), ["mfn", "end-use"])
  assert.equal(JSON.stringify(s), before)
  s.measures[1].preferenceCode = "200"
  assert.equal(select(s).duty, null)
  assert.equal(select(s, { ...review(), preferenceCode: "200" }, "200").duty.id, "preference")
})

test("proof, applicability and measure ambiguity cannot be bypassed", () => {
  for (const patch of [{ proofReference: "" }, { originRulesEvidence: "" }, { transportEvidence: "" }, { validFrom: "2026-10-01" }, { validTo: "2026-02-30" }, { origin: "CN" }, { dataset: "xi" }, { preferenceCode: "200" }, { measureId: "mfn" }]) assert.equal(select(snapshot(), { ...review(), ...patch }).duty, null)
  assert.equal(standardTariffSelection(snapshot(), snapshot(), [], { jurisdiction: "GB", preferenceCode: "300" }).duty, null)
  assert.equal(select(snapshot(), { ...review(), preferenceCode: "320" }, "320").duty, null)
  const multiple = snapshot(); multiple.measures.push({ ...multiple.measures[1], id: "second" })
  assert.equal(select(multiple).duty, null)
  // An explicit operator choice resolves alternative preference measures only.
  assert.equal(select(multiple, { ...review(), measureId: "preference" }).duty.id, "preference")
})

test("preference never drops remedies, excise, safeguards, quota or selected conditions", () => {
  for (const type of ["551", "696", "651", "652", "657", "658"]) {
    const s = snapshot(); s.measures.push(measure("additional", type, "100", "4"))
    assert.equal(select(s).duty, null, type)
  }
  for (const patch of [{ conditions: [{ id: "condition" }] }, { orderNumber: { id: "quota" } }, { additionalCode: { id: "exporter" } }, { legalActs: [] }, { excludedCountries: ["MA"] }, { unresolved: ["missing"] }]) {
    const s = snapshot(); Object.assign(s.measures[1], patch); assert.equal(select(s).duty, null)
  }
})

test("saved preference evidence drives allocated duty/VAT and never certifies the result", () => {
  const s = snapshot(); s.measures[1].percentage = "5"; s.measures[1].components[0].attributes.duty_amount = "5"
  const draft = { direction: "import", customsConversionDate: s.request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "300", preferentialOrigin: "MA", nonPreferentialOrigin: "MA", commodityCode: s.request.code }], dutyCalculationSetup: { jurisdiction: "GB", preferences: { item: review() } } }
  const before = JSON.stringify(draft)
  const run = () => calculationFromDraft(draft, [], s.retrievedAt, { item: s })
  let result = run()
  assert.deepEqual(result.result.totals, { duty: "50.00", vat: "210.00" })
  assert.match(result.input.items[0].preferenceEvidence, /Operator-reviewed preference 300/)
  assert.equal(result.result.preferenceOptions[0].options[0].id, "preference")
  assert.equal(result.result.autoPopulationAllowed, false)
  assert.equal(JSON.stringify(draft), before)
  draft.items[0].preferentialOrigin = "CN"
  assert.equal(run().result.totals, null)
  draft.items[0].preferentialOrigin = "MA"
  delete draft.dutyCalculationSetup.preferences.item
  assert.equal(run().result.totals, null)
  assert.equal(run().result.preferenceOptions[0].options[0].id, "preference")
})

test("parser retains the provider preference-code relationship and detects broken correlation", () => {
  const s = snapshot(), pref = s.measures[1]
  const raw = { data: { id: "commodity", type: "commodity", attributes: { goods_nomenclature_item_id: s.request.code, declarable: true, validity_start_date: "2026-01-01" }, relationships: { import_measures: { data: [{ id: pref.id, type: "measure" }] } } }, included: [
    { id: pref.id, type: "measure", attributes: { import: true, effective_start_date: "2026-01-01" }, relationships: { measure_type: { data: { id: "142", type: "measure_type" } }, geographical_area: { data: { id: "MA", type: "geographical_area" } }, preference_code: { data: { id: "300", type: "preference_code" } }, legal_acts: { data: [{ id: "legal", type: "legal_act" }] } } },
    { id: "142", type: "measure_type", attributes: {} }, { id: "MA", type: "geographical_area", attributes: {} }, { id: "300", type: "preference_code", attributes: { code: "300" } }, { id: "legal", type: "legal_act", attributes: { description: "Fixture law" } },
  ] }
  let parsed = parseTariffSnapshot(raw, s.request, s.retrievedAt)
  assert.equal(parsed.measures[0].preferenceCode, "300")
  assert.equal(parsed.measures[0].legalActs[0].id, "legal")
  raw.included.find(r => r.type === "preference_code").attributes.code = "200"
  parsed = parseTariffSnapshot(raw, s.request, s.retrievedAt)
  assert.ok(parsed.measures[0].unresolved.includes("invalid:preference_code"))
})

test("saved remedy review contributes additional duty and VAT without changing invoice values", () => {
  const s = snapshot(); s.measures = s.measures.filter(m => ["103", "305"].includes(m.typeCode))
  const remedy = measure("remedy", "552", undefined, "10")
  remedy.additionalCode = { id: "exporter", type: "additional_code", attributes: { code: "A123" } }
  s.measures.push(remedy)
  const remedyReview = { commodity: s.request.code, origin: "MA", dataset: "uk", validFrom: "2026-09-01", validTo: "2026-09-30", originEvidence: "Synthetic origin", exporterEvidence: "Synthetic exporter", legalEvidence: "Synthetic legal review", selections: [{ measureId: "remedy", additionalCode: "A123" }] }
  const draft = { direction: "import", customsConversionDate: s.request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "100", nonPreferentialOrigin: "MA", commodityCode: s.request.code }], dutyCalculationSetup: { jurisdiction: "GB", items: { item: { remedyReview } } } }
  draft.items[0].taricCode = "A123"
  const before = JSON.stringify(draft)
  const run = () => calculationFromDraft(draft, [], s.retrievedAt, { item: s })
  const calculated = run()
  assert.deepEqual(calculated.result.totals, { duty: "220.00", vat: "244.00" })
  assert.equal(calculated.input.items[0].measures[1].reference, "remedy")
  assert.deepEqual(calculated.result.remedyOptions[0], { itemId: "item", code: s.request.code, origin: "MA", date: s.request.date, dataset: "uk", options: [{ id: "remedy", description: "552", additionalCode: "A123", legalBasis: "Synthetic legal basis" }] })
  assert.ok(calculated.input.items[0].families.includes("trade-remedy"))
  assert.equal(calculated.result.autoPopulationAllowed, false)
  assert.equal(JSON.stringify(draft), before)
  draft.items[0].taricCode = "A999"
  assert.equal(run().result.totals, null)
  draft.items[0].taricCode = "A123"
  remedyReview.selections[0].additionalCode = "A999"
  const changed = run()
  assert.equal(changed.result.totals, null)
  assert.equal(changed.result.lines[0].duty, undefined)
  assert.equal(changed.result.remedyOptions[0].options[0].additionalCode, "A123", "Blocked results retain official choices for correcting the review")
  remedyReview.selections[0].additionalCode = "A123"
  draft.items[0].procedureCode = "7100"
  assert.equal(run().result.totals, null)
  draft.items[0].procedureCode = "4000"
  const alternative = structuredClone(remedy)
  alternative.id = "another-exporter"; alternative.additionalCode.attributes.code = "A999"
  s.measures.push(alternative)
  draft.items[0].additionalTaricCodes = [{ id: "second-code", code: "A999" }]
  assert.equal(run().result.totals, null)
  draft.items[0].additionalTaricCodes = []
  assert.deepEqual(run().result.totals, { duty: "220.00", vat: "244.00" })
  s.measures.pop()
  remedy.typeCode = "551"
  const provisional = run()
  assert.deepEqual(provisional.result.totals, { duty: "120.00", vat: "224.00" })
  assert.ok(provisional.result.liabilityTotals.taxes.some(tax => tax.taxType === "A35" && tax.disposition === "secured" && tax.amount === "100.00"))
})

test("national VAT codes select evidenced alternatives and supplementary units are not extra taxes", () => {
  const s = snapshot()
  const zero = measure("vat-zero", "305", undefined, "0")
  zero.additionalCode = { id: "vat-code", type: "additional_code", attributes: { code: "VATZ" } }
  s.measures.push(zero, { ...measure("units", "109", undefined, null), series: "O", components: [{ id: "units-99", type: "measure_component", attributes: { duty_expression_id: "99", duty_amount: null, monetary_unit_code: null, measurement_unit_code: "NAR" } }] })
  const treatment = { jurisdiction: "GB", preferenceCode: "300", preferenceReview: review(), nationalCodes: [] }
  assert.equal(standardTariffSelection(s, s, [], treatment).vat.id, "vat")
  treatment.nationalCodes = ["VATZ"]
  assert.equal(standardTariffSelection(s, s, [], treatment).vat, null)
  treatment.vatEvidence = "Synthetic child-clothing eligibility review"
  assert.equal(standardTariffSelection(s, s, [], treatment).vat.id, "vat-zero")
  for (const codes of [["VATZ", "VATR"], ["VATZ", "VATZ"], ["VATX"], ["VATR"]]) {
    assert.equal(standardTariffSelection(s, s, [], { ...treatment, nationalCodes: codes }).vat, null)
  }
  s.measures.at(-1).components[0].attributes.duty_amount = "1"
  assert.equal(standardTariffSelection(s, s, [], treatment).duty, null)
})
