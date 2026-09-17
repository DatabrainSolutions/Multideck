import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
const require = createRequire(import.meta.url)
function load(path) {
  const source = buildSync({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
  const module = { exports: {} }; new Function("module", "exports", "require", source)(module, module.exports, require); return module.exports
}
const { calculateDuty, compareAssessment, compareDeclarationAssessment, certifiedRuleFamilies, hasOfficialTaxEvidence } = load("../../supabase/functions/_shared/customs-duty-calculation.mts")
const { Decimal, allocate } = load("../../supabase/functions/_shared/customs-calculation-decimal.mts")
const { cdsPrecisionStage, cdsApportionedCharges } = load("../../supabase/functions/_shared/customs-cds-precision.mts")
const { vatIncidentalExpenses } = load("../../supabase/functions/_shared/customs-vat-expenses.mts")
const { ukCustomsDate } = load("../../supabase/functions/_shared/customs-calculation-date.mts")
const { quantityForMeasure } = load("../../supabase/functions/_shared/customs-measure-quantity.mts")
const { contractGoodsValue } = load("../../supabase/functions/_shared/customs-contract-conversion.mts")
const { determineNiRisk } = load("../../supabase/functions/_shared/customs-ni-risk.mts")
const { selectNiImportTariff, prepareNiDutyComparison } = load("../../supabase/functions/_shared/customs-ni-tariff.mts")
const { niPreferenceCodes } = load("../../supabase/functions/_shared/customs-ni-preference-codes.mts")
const { calculationUsesCurrentRules, CALCULATION_VERSION, PRECISION_POLICY } = load("../../supabase/functions/_shared/customs-calculation-version.mts")
const { tariffComponents, tariffFormula } = load("../../supabase/functions/_shared/customs-tariff-components.mts")
const { retainTariffEvidence } = load("../../supabase/functions/_shared/customs-reference-evidence.mts")
const { calculationPreflight } = load("../../supabase/functions/_shared/customs-calculation-draft.mts")
const { computedValueCategories } = load("../../supabase/functions/_shared/customs-computed-valuation.mts")
const { warehouseEntryEstimate } = load("../../supabase/functions/_shared/customs-warehousing.mts")
const { comparableCustomsValue } = load("../../supabase/functions/_shared/customs-comparable-valuation.mts")
const { deductiveCustomsValue, deductiveCategories } = load("../../supabase/functions/_shared/customs-deductive-valuation.mts")
const { calculationHistoryCursor, calculationHistoryFilter, calculationHistoryPage } = load("../../supabase/functions/_shared/customs-calculation-history.mts")
const { customsCalculationActionRequest, executeCustomsCalculationAction, CALCULATE_CUSTOMS_ACTION, OVERRIDE_CUSTOMS_CALCULATION_ACTION } = load("../../supabase/functions/agent-dexter/customs-calculation-actions.ts")
const { calculationFromDraft, calculationCostRows, calculationCurrencies } = load("../../supabase/functions/_shared/customs-calculation-draft.mts")
const { parseTariffSnapshot, standardTariffSelection, createTariffClient, tariffUrl } = load("../../supabase/functions/_shared/customs-tariff-reference.mts")
const ref = { source: "https://www.trade-tariff.service.gov.uk/", validFrom: "2026-09-01", validTo: "2026-09-30", retrievedAt: "2026-09-14T12:00:00Z", reference: "worked-example-only" }
const measure = (rate = "12") => ({ ...ref, taxType: "A00", family: "gb-standard", jurisdiction: "UK", evidence: ["Mark worked example — not tariff certification"], components: [{ type: "percent", rate }], includedInVatBase: true, disposition: "payable" })
const item = (id, value) => ({ id, invoiceId: "invoice", goodsValue: value, currency: "GBP", grossMass: "1", valuationMethod: "1", families: [], measures: [measure()], vatRate: "20", vatReference: ref })
const cost = (id, code, amount, effect) => ({ id, code, amount, currency: "GBP", evidence: "Mark worked example", scope: { type: "declaration" }, basis: "value", includedInPrice: false, effect, operation: "add" })
const input = (items = [item("one", "1000")]) => ({ date: "2026-09-14", jurisdiction: "GB", movement: "rest-of-world-to-GB", rates: [], items, costs: [cost("freight", "AP", "500", "both"), cost("vat", "AV", "400", "vat")] })

test("original-input duty and discharged-product VAT use distinct values without changing the invoice", () => {
  const data = input(); data.costs = []
  const row = data.items[0]
  row.families = ["special-procedure"]
  row.procedureEvidence = "Synthetic processing review, not authorisation"
  row.measures[0].processingInputLotId = "cloth"
  row.originalInputDutyBases = [{ measureSource: ref.source, measureReference: ref.reference, inputLotId: "cloth", originalValueGbp: "600", consumedQuantity: "1", originalQuantity: "3", rateDate: data.date, evidence: "Synthetic yield and retained entry" }]
  const before = structuredClone(data), result = calculateDuty(data)
  assert.deepEqual(result.totals, { duty: "24.00", vat: "204.80" })
  assert.equal(result.lines[0].goodsValue, "1000.00")
  assert.equal(result.lines[0].vatBase, "1024.00")
  assert.equal(result.autoPopulationAllowed, false)
  assert.deepEqual(data, before)
  row.measures[0].components.push({ type: "specific", rate: "1", currency: "GBP", quantity: "3", unit: "KGM", per: "1" })
  assert.deepEqual(calculateDuty(data).totals, { duty: "25.00", vat: "205.00" })
  row.measures[0].components.pop()
  for (const patch of [{ consumedQuantity: "4" }, { evidence: "" }, { rateDate: "2027-01-01" }, { measureReference: "missing" }]) {
    const invalid = structuredClone(data); Object.assign(invalid.items[0].originalInputDutyBases[0], patch)
    assert.equal(calculateDuty(invalid).totals, null)
  }
  row.originalInputDutyBases.push({ ...row.originalInputDutyBases[0] })
  assert.equal(calculateDuty(data).totals, null)
})

test("provisional remedies preserve security separately from payable duty and VAT", () => {
  for (const taxType of ["A35", "A45"]) {
    const data = input(); data.costs = [];
    const remedy = { ...measure("10"), taxType, family: "trade-remedy", reference: `provisional-${taxType}`, disposition: "secured" };
    data.items[0].measures.push(remedy);
    const before = JSON.stringify(data), result = calculateDuty(data);
    assert.deepEqual(result.totals, { duty: "120.00", vat: "224.00" });
    assert.ok(result.liabilityTotals.taxes.some(row => row.taxType === taxType && row.disposition === "secured" && row.amount === "100.00"));
    assert.equal(JSON.stringify(data), before);
    remedy.disposition = "payable";
    assert.match(calculateDuty(data).lines[0].issues.join(), /must be secured/);
    remedy.disposition = "relieved";
    assert.match(calculateDuty(data).lines[0].issues.join(), /procedure and supporting evidence/);
    remedy.disposition = "secured"; remedy.family = "gb-standard";
    assert.match(calculateDuty(data).lines[0].issues.join(), /trade-remedy treatment/);
  }
})

test("mixed currency tariff bounds retain EUR evidence and compare exact GBP amounts", () => {
  const conversion = { recordId: "2299", source: "https://www.trade-tariff.service.gov.uk/xi/api/v2/monetary_exchange_rates", purpose: "specific-tariff-duty", fromCurrency: "EUR", toCurrency: "GBP", direction: "GBP-per-EUR", rate: "0.8572", calculationDate: "2026-09-14", validityStart: "2026-09-01", operationDate: "2026-06-21", certified: false }
  const rows = [
    { attributes: { duty_expression_id: "01", duty_amount: "1", monetary_unit_code: "GBP", measurement_unit_code: "KGM" } },
    { attributes: { duty_expression_id: "15", duty_amount: "2", monetary_unit_code: "EUR", measurement_unit_code: "KGM" } },
  ]
  const formula = tariffFormula(rows, [{ quantity: "30", unit: "KGM", evidence: "measured mass" }], conversion)
  assert.equal(formula.bounds[0].components[0].currency, "EUR")
  assert.equal(formula.bounds[0].components[0].rate, "2")
  assert.notEqual(formula.bounds[0].components[0].tariffConversion, conversion)
  const i = input(); i.costs = []
  Object.assign(i.items[0].measures[0], formula, { family: "specific-compound" })
  const result = calculateDuty(i)
  assert.equal(result.lines[0].duty, "51.43")
  assert.ok(result.lines[0].workings.some(step => step.label.includes("minimum comparison") && step.label.includes("€2")))
  assert.equal(result.autoPopulationAllowed, false)
  assert.throws(() => tariffFormula(rows, [{ quantity: "30", unit: "KGM", evidence: "measured mass" }]), /conversion evidence/)
})

test("Method 6 uses an evidenced UK export price, its own currency and explicit adjustments", () => {
  const worksheet = { basis: "supplier-uk-export-price", earlierMethodReasons: { 1: "No sale", 2: "No identical imports", 3: "No similar imports", 4: "No UK sales", 5: "Producer accounts unavailable" }, supplierEvidence: "Supplier fixture", priceListEvidence: "Current UK export list fixture", applicabilityEvidence: "Same goods and commercial terms", adjustmentReviewEvidence: "Freight excluded, insured in quoted price", quantity: "10", unit: "pieces", unitPrice: "200", currency: "USD" }
  const data = input(); data.items[0].valuationMethod = "6"; data.items[0].fallbackValueWorksheet = worksheet
  data.rates = [{ ...ref, currency: "USD", rate: "2", direction: "currency_units_per_gbp" }]
  let result = calculateDuty(data)
  assert.equal(result.lines[0].customsValue, "1500.00"); assert.equal(result.lines[0].duty, "180.00"); assert.equal(result.autoPopulationAllowed, false)
  const draft = scopedDraft(); draft.items = draft.items.slice(0, 1); draft.importAdjustments = []
  draft.items[0].customsValuationMethod = "6"; draft.dutyCalculationSetup.items.one.fallbackValueWorksheet = worksheet
  const saved = JSON.parse(JSON.stringify(draft))
  assert.ok(calculationCurrencies(saved).includes("USD"))
  assert.equal(calculationFromDraft(saved, data.rates, ref.retrievedAt).result.lines[0].customsValue, "1000.00")
  for (const mutate of [w => { delete w.earlierMethodReasons[4] }, w => { w.basis = "minimum-value" }, w => { w.quantity = "0" }, w => { w.priceListEvidence = "" }, w => { w.adjustmentReviewEvidence = "" }]) {
    const changed = structuredClone(data); mutate(changed.items[0].fallbackValueWorksheet)
    assert.equal(calculateDuty(changed).lines[0].customsValue, undefined)
  }
  const legacy = structuredClone(data); delete legacy.items[0].fallbackValueWorksheet; legacy.items[0].alternativeCustomsValue = "1000"; legacy.items[0].valuationEvidence = "A manual total"
  assert.equal(calculateDuty(legacy).lines[0].customsValue, undefined)
  const noSale = structuredClone(data); noSale.items[0].goodsValue = ""; noSale.costs = []
  const noSaleResult = calculateDuty(noSale)
  assert.equal(noSaleResult.lines[0].customsValue, "1000.00")
  assert.equal(noSaleResult.lines[0].goodsValue, undefined)
  assert.equal(noSaleResult.lines[0].workings.some(step => step.label === "Goods value"), false)
  noSale.costs = [{ ...cost("direct-freight", "AP", "50", "both"), scope: { type: "items", itemIds: ["one"] } }]
  assert.equal(calculateDuty(noSale).lines[0].customsValue, "1050.00")
  assert.equal(calculateDuty(noSale).lines[0].allocations[0].basis, "direct")
  noSale.costs[0].scope = { type: "declaration" }
  assert.equal(calculateDuty(noSale).totals, null)
  assert.match(calculateDuty(noSale).issues.join(), /Shared value-based/)
  noSale.costs = []; noSale.items[0].valuationMethod = "1"
  assert.equal(calculateDuty(noSale).totals, null)
  saved.items[0].customsValuationMethod = "1"
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).input.items[0].fallbackValueWorksheet, undefined)
})

test("draft estimate dates follow UK midnight across summer time and year boundaries", () => {
  assert.equal(ukCustomsDate(new Date("2026-09-14T22:59:59Z")), "2026-09-14")
  assert.equal(ukCustomsDate(new Date("2026-09-14T23:00:00Z")), "2026-09-15")
  assert.equal(ukCustomsDate(new Date("2026-12-31T23:30:00Z")), "2026-12-31")
  assert.equal(ukCustomsDate(new Date("2027-01-01T00:00:00Z")), "2027-01-01")
  assert.equal(ukCustomsDate(new Date("2026-03-29T01:00:00Z")), "2026-03-29")
  assert.throws(() => ukCustomsDate(new Date("invalid")))
})

test("flexible Method 6 bases retain evidence, adjustments and strict ordinary-method boundaries", () => {
  const fallback = { basis: "flexible-comparable", earlierMethodReasons: { 1: "No sale", 2: "No same-country identical imports", 3: "No same-country similar imports", 4: "No eligible ordinary sales", 5: "No producer accounts" }, flexibilityEvidence: "Country difference reviewed with goods comparison evidence", currency: "USD", unitPrice: "999", quantity: "999", unit: "pieces" }
  const comparable = { method: "2", productionCountry: "US", quantity: "10", unit: "pieces", method1Unavailable: "No sale", comparables: [{ id: "different-country", productionCountry: "CA", sameProducer: false, sameCommercialLevel: true, quantity: "10", unit: "pieces", acceptedMethod1Entry: "Accepted entry", comparabilityEvidence: "Identical goods comparison", reasonableTimeEvidence: "Relevant period", producerSelectionEvidence: "Producer comparison", acceptedUnitValueGbp: "12", commercialUnitAdjustmentGbp: "-2", commercialAdjustmentEvidence: "Documented discount", deliveryAdjustmentGbp: "5", deliveryAdjustmentEvidence: "Documented delivery difference" }] }
  const data = input(); data.costs = []; data.items[0].valuationMethod = "6"; data.items[0].fallbackValueWorksheet = { ...fallback, comparableWorksheet: comparable }
  assert.equal(calculateDuty(data).lines[0].customsValue, "105.00")
  assert.throws(() => comparableCustomsValue(comparable), /production country/)
  data.items[0].valuationMethod = "2"; data.items[0].comparableValueWorksheet = comparable
  assert.equal(calculateDuty(data).totals, null)
  data.items[0].valuationMethod = "6"
  data.costs = [cost("freight", "AP", "5", "both")]
  assert.equal(calculateDuty(data).totals, null)
  data.costs = [cost("vat", "AV", "5", "vat")]
  assert.equal(calculateDuty(data).lines[0].customsValue, "105.00")
  data.items[0].fallbackValueWorksheet.flexibilityEvidence = ""
  assert.equal(calculateDuty(data).totals, null)
  const deductive = { quantity: "10", unit: "pieces", earlierMethodReasons: { 1: "No sale", 2: "No identical goods", 3: "No similar goods" }, salesEvidence: "Actual sales evidence", timingEvidence: "Reviewed extended period", commercialDeduction: "commission", processedGoods: false, sales: [{ id: "sale", unitPriceGbp: "20", quantity: "10", unrelatedUkBuyer: true, evidence: "Sale invoice" }], deductions: deductiveCategories.map(category => ({ category, amountPerUnitGbp: category === "commission-or-profit" ? "2" : "0", evidence: "Reviewed deduction evidence" })) }
  data.items[0].fallbackValueWorksheet = { ...fallback, basis: "flexible-deductive", flexibilityEvidence: "Extended sales period justification", deductiveWorksheet: deductive }
  assert.equal(calculateDuty(data).lines[0].customsValue, "180.00")
  const draft = scopedDraft(); draft.items = draft.items.slice(0, 1); draft.importAdjustments = []; draft.items[0].customsValuationMethod = "6"
  draft.dutyCalculationSetup.items.one.fallbackValueWorksheet = data.items[0].fallbackValueWorksheet
  const saved = JSON.parse(JSON.stringify(draft))
  assert.equal(calculationCurrencies(saved).includes("USD"), false, "inactive export-price currency must not require a rate")
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).result.lines[0].customsValue, "180.00")
  assert.equal(calculateDuty(data).autoPopulationAllowed, false)
})

test("Method 4 groups actual sales at equal prices and applies evidenced per-unit deductions", () => {
  const worksheet = {
    quantity: "200", unit: "pieces", earlierMethodReasons: { 1: "Unavailable", 2: "Unavailable", 3: "Unavailable" }, salesEvidence: "HMRC Method 4 example 2", timingEvidence: "Relevant import-period sales", commercialDeduction: "commission", processedGoods: false,
    sales: [["40", "100"], ["30", "90"], ["15", "100.0"], ["50", "95"], ["25", "105"], ["35", "90.00"], ["5", "100"]].map(([quantity, unitPriceGbp], index) => ({ id: String(index), quantity, unitPriceGbp, unrelatedUkBuyer: true, evidence: "Example sale" })),
    deductions: deductiveCategories.map(category => ({ category, amountPerUnitGbp: "0", evidence: "Explicit zero for price-selection fixture" })),
  }
  let result = deductiveCustomsValue(worksheet)
  assert.equal(result.unitPrice.fixed(2), "90.00"); assert.equal(result.greatestAggregateQuantity.fixed(2), "65.00"); assert.equal(result.grossSalesValue.fixed(2), "18000.00")
  worksheet.deductions[0].amountPerUnitGbp = "10"
  worksheet.deductions[1].amountPerUnitGbp = "2"
  worksheet.deductions[2].amountPerUnitGbp = "3"
  result = deductiveCustomsValue(worksheet)
  assert.equal(result.netUnit.fixed(2), "75.00"); assert.equal(result.value.fixed(2), "15000.00")
  const data = input(); data.costs = []; data.items[0].valuationMethod = "4"; data.items[0].deductiveValueWorksheet = worksheet
  assert.equal(calculateDuty(data).lines[0].customsValue, "15000.00"); assert.equal(calculateDuty(data).autoPopulationAllowed, false)
  const draft = scopedDraft(); draft.items = draft.items.slice(0, 1); draft.importAdjustments = []
  draft.items[0].customsValuationMethod = "4"; draft.dutyCalculationSetup.items.one.deductiveValueWorksheet = worksheet
  const saved = JSON.parse(JSON.stringify(draft))
  const mapped = calculationFromDraft(saved, [], ref.retrievedAt)
  assert.deepEqual(mapped.input.items[0].deductiveValueWorksheet, worksheet)
  assert.equal(mapped.result.lines[0].customsValue, "15000.00")
  saved.items[0].customsValuationMethod = "1"
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).input.items[0].deductiveValueWorksheet, undefined)
  for (const mutate of [w => { w.sales[0].unrelatedUkBuyer = false }, w => { w.sales = [] }, w => { w.deductions.pop() }, w => { w.deductions[0].amountPerUnitGbp = "1000" }, w => { w.deductions[3].amountPerUnitGbp = "1" }, w => { w.processedGoods = true }, w => { w.sales.push(w.sales[0]) }]) {
    const changed = JSON.parse(JSON.stringify(worksheet)); mutate(changed); assert.throws(() => deductiveCustomsValue(changed))
  }
  assert.throws(() => deductiveCustomsValue({ ...worksheet, sales: [worksheet.sales[0], { ...worksheet.sales[1], quantity: "40" }] }), /tied greatest/)
})

test("Methods 2 and 3 select the lowest eligible comparable rather than any cheap import", () => {
  const candidate = (id, value, patch = {}) => ({ id, productionCountry: "US", sameProducer: true, sameCommercialLevel: true, quantity: "10", unit: "pieces", acceptedMethod1Entry: "Accepted entry fixture", comparabilityEvidence: "Goods comparison fixture", reasonableTimeEvidence: "Prices unchanged in the relevant period", producerSelectionEvidence: "Producer comparison", acceptedUnitValueGbp: value, commercialUnitAdjustmentGbp: "0", commercialAdjustmentEvidence: "Same commercial terms", deliveryAdjustmentGbp: "0", deliveryAdjustmentEvidence: "Same delivery costs", ...patch })
  const worksheet = { method: "2", productionCountry: "US", quantity: "10", unit: "pieces", method1Unavailable: "No sale", comparables: [candidate("expensive", "12"), candidate("lowest", "10"), candidate("other-producer", "1", { sameProducer: false }), candidate("different-quantity", "2", { quantity: "20" })] }
  const result = comparableCustomsValue(worksheet)
  assert.equal(result.value.fixed(2), "100.00"); assert.equal(result.selectedId, "lowest")
  assert.equal(comparableCustomsValue({ ...worksheet, comparables: [...worksheet.comparables].reverse() }).selectedId, "lowest")
  assert.throws(() => comparableCustomsValue({ ...worksheet, method: "3" }))
  assert.equal(comparableCustomsValue({ ...worksheet, method: "3", method2Unavailable: "No identical goods" }).value.fixed(2), "100.00")
  const adjusted = { ...worksheet, comparables: [candidate("adjusted", "12", { sameCommercialLevel: false, commercialUnitAdjustmentGbp: "-2", deliveryAdjustmentGbp: "5" })] }
  assert.equal(comparableCustomsValue(adjusted).value.fixed(2), "105.00")
  for (const patch of [{ productionCountry: "CN" }, { unit: "kg" }, { acceptedMethod1Entry: "" }, { reasonableTimeEvidence: "" }, { quantity: "0" }, { commercialUnitAdjustmentGbp: "-20" }]) assert.throws(() => comparableCustomsValue({ ...worksheet, comparables: [candidate("invalid", "10", patch)] }))
  assert.throws(() => comparableCustomsValue({ ...worksheet, comparables: [worksheet.comparables[0], worksheet.comparables[0]] }))
  const data = input(); data.costs = []; data.items[0].valuationMethod = "2"; data.items[0].comparableValueWorksheet = worksheet
  assert.equal(calculateDuty(data).lines[0].customsValue, "100.00")
  assert.equal(calculateDuty(data).autoPopulationAllowed, false)
  const draft = scopedDraft(); draft.items = draft.items.slice(0, 1); draft.importAdjustments = []
  draft.items[0].customsValuationMethod = "2"
  draft.dutyCalculationSetup.items.one.comparableValueWorksheet = worksheet
  const saved = JSON.parse(JSON.stringify(draft))
  const savedRun = calculationFromDraft(saved, [], ref.retrievedAt)
  assert.deepEqual(savedRun.input.items[0].comparableValueWorksheet, worksheet)
  assert.equal(savedRun.result.lines[0].customsValue, "100.00")
  saved.items[0].customsValuationMethod = "3"
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).result.totals, null)
  saved.dutyCalculationSetup.items.one.comparableValueWorksheet.method = "3"
  saved.dutyCalculationSetup.items.one.comparableValueWorksheet.method2Unavailable = "No identical goods"
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).result.lines[0].customsValue, "100.00")
  saved.items[0].customsValuationMethod = "1"
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).input.items[0].comparableValueWorksheet, undefined)
})

test("Method 5 builds from evidenced producer costs without re-adding shared freight", () => {
  const worksheet = () => ({ producerAccountsEvidence: "Producer accounts fixture", accountingPrinciplesEvidence: "Accounting principles fixture", usualProfitEvidence: "Same class and export-market comparison fixture", earlierMethodReasons: { 1: "No sale", 2: "No identical goods", 3: "No similar goods" }, method4Decision: { treatment: "method5-first", evidence: "Importer requested order" }, components: computedValueCategories.map(category => ({ category, amount: category === "materials" ? "1000" : category === "border-transport" ? "500" : "0", currency: "GBP", evidence: "Reviewed component fixture" })) })
  const data = input(); data.costs = [cost("vat", "AV", "400", "vat")]
  data.items[0].valuationMethod = "5"; data.items[0].computedValueWorksheet = worksheet()
  let result = calculateDuty(data)
  assert.equal(result.lines[0].customsValue, "1500.00"); assert.equal(result.lines[0].duty, "180.00"); assert.equal(result.lines[0].vat, "416.00")
  assert.equal(result.lines[0].workings.filter(step => step.label.startsWith("Method 5:")).length, 8)
  assert.equal(result.autoPopulationAllowed, false)
  data.costs.push(cost("freight", "AP", "500", "both")); assert.equal(calculateDuty(data).totals, null); data.costs.pop()
  for (const mutate of [w => { w.producerAccountsEvidence = "" }, w => { w.earlierMethodReasons[2] = "" }, w => { w.components.pop() }, w => { w.components[1] = w.components[0] }, w => { w.components[0].evidence = "" }, w => { w.components[0].amount = "-1" }]) {
    const changed = worksheet(); mutate(changed); data.items[0].computedValueWorksheet = changed; assert.equal(calculateDuty(data).totals, null)
  }
  data.items[0].computedValueWorksheet = worksheet()
  const components = data.items[0].computedValueWorksheet.components
  components.find(c => c.category === "border-insurance").includedIn = "border-transport"
  assert.equal(calculateDuty(data).lines[0].customsValue, "1500.00")
  components.find(c => c.category === "border-transport").includedIn = "border-insurance"
  assert.equal(calculateDuty(data).totals, null)
})

test("history keysets preserve microseconds and tie-break IDs without filter injection", () => {
  const id = "00000000-0000-4000-8000-000000000001", createdAt = "2026-09-14T13:14:15.123456+00:00"
  const cursor = `${createdAt}|${id}`
  assert.deepEqual(calculationHistoryCursor(cursor), { createdAt, id })
  assert.equal(calculationHistoryFilter(cursor), `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`)
  const rows = Array.from({ length: 31 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(99 - i).padStart(12, "0")}`, created_at: createdAt }))
  const page = calculationHistoryPage(rows)
  assert.equal(page.history.length, 30); assert.equal(page.nextCursor, `${createdAt}|${rows[29].id}`)
  assert.equal(calculationHistoryPage(rows.slice(30)).nextCursor, null)
  assert.deepEqual(calculationHistoryPage([]), { history: [], nextCursor: null })
  for (const bad of ["", `${cursor}|extra`, `not-a-date|${id}`, `${createdAt}|${id},declaration_id.neq.x`, `2026-09-14T13:14:15.1234567Z|${id}`, `2026-99-99T00:00:00Z|${id}`]) assert.throws(() => calculationHistoryFilter(bad))
})
test("Dexter calculation actions cannot select filing routes or smuggle declaration mutations", () => {
  const args = { target_id: "00000000-0000-4000-8000-000000000001", reason: "Review calculated estimate", path: "/submit", draft: { tax: "0" } }
  const request = customsCalculationActionRequest(CALCULATE_CUSTOMS_ACTION, args)
  assert.match(request.path, /\/calculations$/); assert.deepEqual(request.body, {})
  assert.throws(() => customsCalculationActionRequest("submit_customs_declaration", args))
  assert.throws(() => customsCalculationActionRequest(CALCULATE_CUSTOMS_ACTION, { ...args, target_id: "../submit" }))
  const override = { ...args, calculation_id: args.target_id, item_id: "one", duty: "100.00", vat: "220.00" }
  assert.deepEqual(customsCalculationActionRequest(OVERRIDE_CUSTOMS_CALCULATION_ACTION, override).body, { calculationId: args.target_id, itemId: "one", duty: "100.00", vat: "220.00", reason: args.reason })
  for (const patch of [{ duty: "1e3" }, { vat: "20.001" }, { reason: "" }, { calculation_id: "wrong" }]) assert.throws(() => customsCalculationActionRequest(OVERRIDE_CUSTOMS_CALCULATION_ACTION, { ...override, ...patch }))
})
test("Dexter uses caller authorisation and reports uncertain calculation outcomes without retry", async () => {
  const args = { target_id: "00000000-0000-4000-8000-000000000001", reason: "Review calculated estimate" }
  const connection = { url: "https://fixture.supabase.co", anonKey: "public-fixture", authorization: "Bearer actor-fixture" }
  let calls = 0
  const success = await executeCustomsCalculationAction(CALCULATE_CUSTOMS_ACTION, args, connection, async (url, init) => {
    calls++; assert.equal(url, `${connection.url}/functions/v1/icustoms-api/declarations/${args.target_id}/calculations`)
    assert.equal(init.headers.Authorization, connection.authorization); assert.equal(init.redirect, "error")
    return new Response(JSON.stringify({ id: "audit-fixture", submissionFieldsChanged: false }))
  })
  assert.equal(success.error, null); assert.equal(calls, 1)
  const denied = await executeCustomsCalculationAction(CALCULATE_CUSTOMS_ACTION, args, connection, async () => new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 }))
  assert.equal(denied.error.code, "calculation_403")
  const interrupted = await executeCustomsCalculationAction(CALCULATE_CUSTOMS_ACTION, args, connection, async () => { calls++; throw new Error("connection interrupted") })
  assert.equal(calls, 2); assert.equal(interrupted.error.code, "calculation_result_unknown")
  const unconfirmed = await executeCustomsCalculationAction(CALCULATE_CUSTOMS_ACTION, args, connection, async () => new Response("{}"))
  assert.equal(unconfirmed.error.code, "calculation_result_unknown")
})

test("Mark single-line example: VAT-only adjustment never increases duty", () => {
  const r = calculateDuty(input()); assert.deepEqual(r.issues, []); assert.deepEqual(r.lines[0].issues, [])
  assert.equal(r.lines[0].customsValue, "1500.00"); assert.equal(r.lines[0].vatBase, "2080.00")
  assert.deepEqual(r.totals, { duty: "180.00", vat: "416.00" }); assert.equal(r.autoPopulationAllowed, false)
  assert.equal(r.lines[0].status, "estimate"); assert.deepEqual(certifiedRuleFamilies, [])
  const steps = r.lines[0].workings
  const freight = steps.findIndex(step => step.label.startsWith("AP "))
  const customs = steps.findIndex(step => step.label === "Customs value")
  const vatAddition = steps.findIndex(step => step.label.startsWith("AV "))
  const vatBase = steps.findIndex(step => step.label === "VAT base")
  assert.ok(freight < customs && customs < vatAddition && vatAddition < vatBase)
  assert.equal(steps[freight].amount, "500.00"); assert.equal(steps[vatAddition].amount, "400.00")
})
test("Mark split example reconciles line liabilities and allocation totals", () => {
  const r = calculateDuty(input([item("one", "600"), item("two", "400")]))
  assert.deepEqual(r.lines.map(l => [l.customsValue, l.duty, l.vatBase, l.vat]), [["900.00", "108.00", "1248.00", "249.60"], ["600.00", "72.00", "832.00", "166.40"]])
  assert.deepEqual(r.totals, { duty: "180.00", vat: "416.00" })
  const freight = r.lines[0].allocations.find(cost => cost.code === "AP")
  assert.deepEqual(freight.allocationEvidence, { originalAmount: "500", originalCurrency: "GBP", totalGbp: "500.00", totalExact: { numerator: "500", denominator: "1" }, percentage: "60.00", share: { numerator: "3", denominator: "5" }, eligibleItemIds: ["one", "two"] })
  assert.ok(r.lines[0].workings.some(step => step.label.includes("60.00% of £500.00")))
})
test("Mark revised-rate example records the precision difference instead of hiding it", () => {
  const i = input([item("one", "101400"), item("two", "66120")]); i.items.forEach(it => { it.currency = "USD"; it.measures = [measure("6")] })
  i.rates = [{ ...ref, currency: "USD", rate: "1.341200", direction: "currency_units_per_gbp" }]
  i.costs = [cost("freight", "AP", "14912.01", "both"), cost("vat", "AV", "2200", "vat")]
  const r = calculateDuty(i)
  // This policy yields 84,630.19, whereas the photographed CDS base is 84,630.18.
  assert.equal(r.lines[0].customsValue, "84630.19"); assert.notEqual(r.lines[0].customsValue, "84630.18")
  assert.equal(r.autoPopulationAllowed, false)
  assert.equal(r.lines[0].duty, "5077.81"); assert.equal(r.lines[1].duty, "3311.09")
})
test("Mark precision diagnostic distinguishes matching base stages from the diagram percentage ambiguity", () => {
  const price = Decimal.parse("101400")
  const goods = price.div(Decimal.parse("1.3412"))
  const share = price.div(Decimal.parse("167520"))
  const freight = Decimal.parse("14912.01")
  const charge = cdsPrecisionStage("apportioned-charge", freight.mul(share)).value
  // One observed base is reproduced, not a certification of the whole policy.
  assert.equal(goods.truncate(2).add(charge).fixed(2), "84630.18")
  const twoDecimalPercentageShare = share.mul(Decimal.parse("100")).truncate(2).div(Decimal.parse("100"))
  const diagramCharge = cdsPrecisionStage("apportioned-charge", freight.mul(twoDecimalPercentageShare)).value
  assert.equal(goods.truncate(2).add(diagramCharge).fixed(2), "84630.16")
  assert.equal(cdsPrecisionStage("tax-amount", charge).source.certified, false)
})

test("CDS stages truncate explicitly and retain discarded precision without changing legacy display rounding", () => {
  const amount = Decimal.parse("12.34999")
  assert.equal(cdsPrecisionStage("tax-amount", amount).value.fixed(2), "12.34")
  assert.equal(amount.fixed(2), "12.35")
  assert.equal(cdsPrecisionStage("eu-tariff-exchange-rate", Decimal.parse("0.857299")).value.fixed(4), "0.8572")
  assert.deepEqual(cdsPrecisionStage("tax-amount", amount).discarded, Decimal.parse("0.00999").evidence())
  assert.equal(Decimal.parse("-0.009").truncate(2).fixed(2), "0.00")
  for (const places of [-1, 13, 1.5, NaN, Infinity]) assert.throws(() => amount.truncate(places))
  assert.throws(() => cdsPrecisionStage("tax-amount", Decimal.parse("-1")))
  assert.throws(() => cdsPrecisionStage("unverified-stage", amount))
})

test("CDS charge truncation exposes unallocated pennies instead of silently redistributing them", () => {
  const shares = ["a", "b", "c"].map(itemId => ({ itemId, share: Decimal.parse("1").div(Decimal.parse("3")) }))
  const result = cdsApportionedCharges(Decimal.parse("1"), shares)
  assert.deepEqual(result.lines.map(row => row.value.fixed(2)), ["0.33", "0.33", "0.33"])
  assert.equal(result.unallocated.fixed(2), "0.01")
  assert.equal(result.allocated.add(result.unallocated).fixed(2), "1.00")
  assert.equal(result.source.certified, false)
  assert.deepEqual(cdsApportionedCharges(Decimal.parse("1"), shares.toReversed()).lines.map(row => row.value.fixed(2)), ["0.33", "0.33", "0.33"])
  assert.throws(() => cdsApportionedCharges(Decimal.parse("1"), [shares[0], shares[0]]))
  assert.throws(() => cdsApportionedCharges(Decimal.parse("1"), [{ itemId: "a", share: Decimal.parse("1.01") }]))
  assert.throws(() => cdsApportionedCharges(Decimal.parse("1"), []))
})

test("decimal arithmetic is exact and deterministic across allocation reorderings", () => {
  assert.equal(Decimal.parse("0.1").add(Decimal.parse("0.2")).fixed(2), "0.30")
  assert.equal(Decimal.parse("-0.005").fixed(2), "-0.01")
  const weights = ["c", "a", "b"].map(id => ({ id, value: Decimal.parse("1") }))
  assert.deepEqual(Object.fromEntries(allocate(Decimal.parse("0.01"), weights).map(r => [r.id, r.displayed])), { c: "0.00", a: "0.01", b: "0.00" })
  assert.equal(allocate(Decimal.parse("0.01"), weights.reverse()).find(r => r.id === "a").displayed, "0.01")
  for (const invalid of ["NaN", "Infinity", "1e3", "", "1,000", "0.0000000000001"]) assert.throws(() => Decimal.parse(invalid))
})
test("missing rates, date amendments, and invalid rate directions fail closed", () => {
  const i = input(); i.items[0].currency = "USD"
  assert.equal(calculateDuty(i).totals, null)
  i.rates = [{ ...ref, currency: "USD", rate: "2", direction: "gbp_per_currency" }]
  assert.match(calculateDuty(i).lines[0].issues.join(), /direction/)
  i.rates[0].direction = "currency_units_per_gbp"; i.rates[0].validTo = "2026-09-13"
  assert.equal(calculateDuty(i).totals, null)
  i.rates[0].validTo = "2026-09-30"; const earlier = calculateDuty(i)
  i.rates[0].rate = "4"; assert.notEqual(calculateDuty(i).totals.duty, earlier.totals.duty)
  assert.equal(earlier.lines[0].goodsValue, "500.00")
})
test("already included freight is not added twice; included deductions reduce the base", () => {
  const i = input(); i.costs[0].includedInPrice = true
  assert.equal(calculateDuty(i).lines[0].customsValue, "1000.00")
  i.costs[0].operation = "deduct"; i.costs[0].code = "BA"
  assert.equal(calculateDuty(i).lines[0].customsValue, "500.00")
})
test("airfreight additions and included deductions retain the full VAT cost", () => {
  const additional = input(); additional.costs = [{ ...cost("air", "AR", "300", "both"), airfreightPercentage: "70" }]
  const added = calculateDuty(additional)
  assert.equal(added.lines[0].customsValue, "1210.00")
  assert.equal(added.lines[0].duty, "145.20")
  assert.equal(added.lines[0].vatBase, "1445.20")
  assert.equal(added.lines[0].vat, "289.04")
  assert.deepEqual(added.lines[0].allocations.map(a => [a.effect, a.amount]), [["both", "210.00"], ["vat", "90.00"]])
  assert.ok(added.lines[0].workings.some(s => s.label.includes("70% customs inclusion")))
  const included = input(); included.items[0].goodsValue = "1300"
  included.costs = [{ ...additional.costs[0], code: "BR", operation: "deduct", includedInPrice: true }]
  const deducted = calculateDuty(included)
  assert.equal(deducted.lines[0].customsValue, added.lines[0].customsValue)
  assert.equal(deducted.lines[0].vatBase, added.lines[0].vatBase)
  assert.deepEqual(deducted.totals, added.totals)
  assert.equal(deducted.lines[0].allocations[0].amount, "90.00")
  assert.ok(deducted.lines[0].workings.some(s => s.label.includes("retained in VAT base") && s.amount === "90.00"))
  // HMRC's delivered-departure-airport example keeps the £50 ancillary charges
  // separate from £300 airfreight: 70% × £300 + £50 = £260 customs addition.
  additional.costs.push(cost("handling", "AP", "50", "both"))
  assert.equal(calculateDuty(additional).lines[0].customsValue, "1260.00")
  assert.equal(calculateDuty(additional).autoPopulationAllowed, false)
  additional.costs = [{ ...additional.costs[0], includedInPrice: true }]
  assert.equal(calculateDuty(additional).totals, null)
})
test("airfreight portions stay item-scoped, reconcile by mass and reject mixed air codes", () => {
  const i = input([item("one", "600"), { ...item("two", "400"), grossMass: "3" }])
  i.items[0].grossMass = "1"
  i.costs = [{ ...cost("air", "AS", "300", "both"), basis: "gross_mass", airfreightPercentage: "70" }]
  const result = calculateDuty(i)
  assert.deepEqual(result.lines.map(l => l.customsValue), ["652.50", "557.50"])
  assert.deepEqual(result.lines.map(l => l.vat), ["150.66", "138.38"])
  assert.deepEqual(result.totals, { duty: "145.20", vat: "289.04" })
  i.costs[0].scope = { type: "items", itemIds: ["two"] }
  assert.equal(calculateDuty(i).lines[0].allocations.length, 0)
  i.costs.push({ ...i.costs[0], id: "other-air", code: "BS", operation: "deduct", includedInPrice: true })
  assert.match(calculateDuty(i).issues.join(), /only one airfreight adjustment code/)
})
test("cost scope and gross mass allocations cannot leak to other invoices", () => {
  const i = input([item("one", "600"), { ...item("two", "400"), invoiceId: "other" }])
  i.costs = [{ ...cost("freight", "AQ", "100", "both"), basis: "gross_mass", scope: { type: "invoice", invoiceId: "other" } }]
  const r = calculateDuty(i)
  assert.equal(r.lines[0].customsValue, "600.00"); assert.equal(r.lines[1].customsValue, "500.00")
  i.costs[0].scope = { type: "items", itemIds: ["missing"] }; assert.equal(calculateDuty(i).totals, null)
})
test("duplicate costs, overlaps, mixed bases and zero denominators are rejected", () => {
  const i = input(); i.costs.push({ ...i.costs[0] }); assert.equal(calculateDuty(i).totals, null)
  i.costs[2].id = "another"; assert.match(calculateDuty(i).issues.join(), /overlaps/)
  i.costs.pop(); i.costs[1].code = "AW"; i.costs[1].basis = "gross_mass"; assert.match(calculateDuty(i).issues.join(), /cannot be mixed/)
  i.costs = [i.costs[1]]; i.items[0].grossMass = "0"; assert.equal(calculateDuty(i).totals, null)
})
test("tariff mass and volume conversions remain exact without crossing dimensions", () => {
  for (const [quantity, sourceUnit, targetUnit, expected] of [
    ["1.234567", "TNE", "KGM", "1234.567"], ["250", "GRM", "KGM", "0.25"],
    ["2.5", "KLT", "HLT", "25"], ["1", "MLT", "LTR", "0.001"],
    ["1234.567", "KGM", "TNE", "1.234567"],
  ]) assert.equal(quantityForMeasure({ quantity, sourceUnit, targetUnit }).compare(Decimal.parse(expected)), 0)
  for (const [sourceUnit, targetUnit] of [["TNE", "LTR"], ["KLT", "KGM"], ["NAR", "NPR"], ["KLT", "LPA"]]) {
    assert.throws(() => quantityForMeasure({ quantity: "1", sourceUnit, targetUnit }))
  }
  assert.throws(() => quantityForMeasure({ quantity: "1", sourceUnit: "TNE", targetUnit: "KGM", sourceQualifier: "E", targetQualifier: "N" }))
})

test("specific and compound measure arithmetic uses explicit unit quantities", () => {
  const i = input(); i.costs = []
  i.items[0].measures[0].family = "specific-compound"
  i.items[0].measures[0].components = [{ type: "percent", rate: "5" }, { type: "specific", rate: "2", currency: "GBP", quantity: "30", unit: "kg", per: "10" }]
  assert.equal(calculateDuty(i).lines[0].duty, "56.00")
  assert.ok(calculateDuty(i).lines[0].workings.some(step => step.label.includes("30 kg ÷ 10 kg") && step.amount === "6.00"))
  assert.ok(calculateDuty(i).lines[0].workings.some(step => step.label.includes("customs value × 5%") && step.amount === "50.00"))
  i.items[0].measures[0].minimum = "60"
  assert.equal(calculateDuty(i).lines[0].duty, "60.00")
  assert.ok(calculateDuty(i).lines[0].workings.some(step => step.label.includes("minimum GBP amount") && step.amount === "60.00"))
  delete i.items[0].measures[0].minimum
  i.items[0].measures[0].components[1].currency = "EUR"
  assert.equal(calculateDuty(i).totals, null)
  assert.match(calculateDuty(i).lines[0].issues.join(), /tariff conversion evidence/)
  i.items[0].measures[0].components[1].tariffConversion = {
    recordId: "2299", source: "https://www.trade-tariff.service.gov.uk/xi/api/v2/monetary_exchange_rates",
    purpose: "specific-tariff-duty", fromCurrency: "EUR", toCurrency: "GBP", direction: "GBP-per-EUR",
    rate: "0.8572", calculationDate: i.date, validityStart: "2026-09-01", operationDate: "2026-06-21", certified: false,
  }
  const converted = calculateDuty(i)
  assert.equal(converted.lines[0].duty, "55.14")
  assert.equal(converted.autoPopulationAllowed, false)
  assert.ok(converted.lines[0].workings.some(step => step.label.includes("€2") && step.label.includes("0.8572 GBP/EUR")))
  i.items[0].measures[0].components[1].tariffConversion.calculationDate = "2026-08-14"
  assert.equal(calculateDuty(i).totals, null)
  delete i.items[0].measures[0].components[1].currency
  assert.equal(calculateDuty(i).totals, null)
  i.items[0].measures[0].components[1].currency = "GBP"
  i.items[0].measures[0].components[1].per = "0"; assert.equal(calculateDuty(i).totals, null)
})
test("identified Alcohol Duty follows HMRC penny truncation without changing ordinary duty rounding", () => {
  const i = input(); i.costs = []
  i.items[0].measures = [{ ...measure(), family: "excise", calculationBasis: "alcohol-duty", taxType: "X01", source: "https://www.gov.uk/guidance/work-out-how-much-alcohol-duty-you-need-to-pay", reference: "hmrc-beer-example-2026", components: [{ type: "specific", rate: "22.58", currency: "GBP", quantity: "360.99", unit: "LPA", per: "1" }] }]
  const result = calculateDuty(i)
  assert.equal(result.lines[0].duty, "8151.15")
  assert.ok(result.lines[0].workings.some(step => step.label.includes("Alcohol Duty rounded down")))
  assert.equal(result.autoPopulationAllowed, false)
  i.items[0].measures[0].components[0].rate = "1.999"
  i.items[0].measures[0].components[0].quantity = "1"
  assert.equal(calculateDuty(i).lines[0].duty, "1.99")
  delete i.items[0].measures[0].calculationBasis
  assert.equal(calculateDuty(i).lines[0].duty, "2.00")
  i.items[0].measures[0].calculationBasis = "alcohol-duty"
  i.items[0].measures[0].components[0].unit = "LTR"
  assert.equal(calculateDuty(i).totals, null)
  i.items[0].measures[0].components[0].unit = "LPA"
  i.items[0].measures[0].family = "gb-standard"
  assert.equal(calculateDuty(i).totals, null)
})
test("pure-alcohol quantities retain original volume, evidenced strength and exact conversion", () => {
  const q = { quantity: "4297.5", sourceUnit: "LTR", targetUnit: "LPA", alcoholByVolume: "8.4", strengthEvidence: "Product ABV certificate fixture" }
  assert.equal(quantityForMeasure(q).fixed(2), "360.99")
  assert.equal(quantityForMeasure({ ...q, quantity: "42.975", sourceUnit: "HLT" }).fixed(2), "360.99")
  for (const patch of [{ alcoholByVolume: "" }, { alcoholByVolume: "101" }, { alcoholByVolume: "-1" }, { strengthEvidence: "" }, { sourceQualifier: "E", targetQualifier: "E" }]) assert.throws(() => quantityForMeasure({ ...q, ...patch }))
  const components = tariffComponents([{ attributes: { duty_expression_id: "01", duty_amount: "22.58", monetary_unit_code: "GBP", measurement_unit_code: "LPA" } }], [{ quantity: q.quantity, unit: q.sourceUnit, evidence: "Container volume record fixture", alcoholByVolume: q.alcoholByVolume, strengthEvidence: q.strengthEvidence }])
  assert.equal(components[0].quantity, "4297.5")
  assert.equal(components[0].strengthEvidence, q.strengthEvidence)
  assert.equal(components[0].quantityEvidence, "Container volume record fixture")
  const i = input(); i.costs = []; i.items[0].measures = [{ ...measure(), family: "excise", calculationBasis: "alcohol-duty", taxType: "X01", components }]
  const result = calculateDuty(i)
  assert.equal(result.lines[0].duty, "8151.15")
  assert.ok(result.lines[0].workings.some(step => step.label.includes("8.4% ABV")))
  assert.equal(result.autoPopulationAllowed, false)
})
test("historic rules or precision policies require recalculation without rewriting history", () => {
  const current = calculateDuty(input())
  assert.equal(current.version, CALCULATION_VERSION)
  assert.equal(current.precisionPolicy, PRECISION_POLICY)
  assert.equal(calculationUsesCurrentRules(current), true)
  const historic = { ...current, version: "2026-09-14.2" }
  const before = JSON.stringify(historic)
  for (const result of [historic, { ...current, precisionPolicy: "old-precision" }, { date: current.date }, null, undefined]) assert.equal(calculationUsesCurrentRules(result), false)
  assert.equal(JSON.stringify(historic), before)
})
test("official additive components decode structured rates and require evidenced quantities", () => {
  const percent = { attributes: { duty_expression_id: "01", duty_amount: "4", monetary_unit_code: null, measurement_unit_code: null, measurement_unit_qualifier_code: null } }
  const specific = { attributes: { duty_expression_id: "04", duty_amount: "7.8", monetary_unit_code: "GBP", measurement_unit_code: "DTN", measurement_unit_qualifier_code: "E" } }
  const quantity = { quantity: "250", unit: "KGM", qualifier: "E", evidence: "Drained net weight certificate fixture" }
  const components = tariffComponents([specific, percent], [quantity])
  const i = input(); i.costs = []; i.items[0].measures[0].family = "specific-compound"; i.items[0].measures[0].components = components
  assert.equal(calculateDuty(i).lines[0].duty, "59.50")
  assert.equal(calculateDuty(i).autoPopulationAllowed, false)
  for (const quantities of [[], [{ ...quantity, evidence: "" }], [{ ...quantity, qualifier: "G" }], [quantity, { ...quantity, unit: "DTN", quantity: "2.5" }]]) assert.throws(() => tariffComponents([percent, specific], quantities), /evidenced quantity/)
  for (const patch of [{ duty_expression_id: "12" }, { monetary_unit_code: "EUR" }, { duty_amount: "-1" }, { duty_amount: "not a number" }]) assert.throws(() => tariffComponents([percent, { attributes: { ...specific.attributes, ...patch } }], [quantity]))
  assert.throws(() => tariffComponents([percent, percent], []), /one base/)
  assert.throws(() => tariffComponents([specific], [quantity]), /one base/)
  assert.throws(() => tariffComponents([percent], Array.from({ length: 21 }, () => quantity)), /20 tariff quantities/)
  assert.deepEqual(tariffComponents([percent], []), [{ type: "percent", rate: "4" }])
})
test("official compound maximum compares the complete bound, independent of response order", () => {
  // UK Tariff Data Standard illustrative white-chocolate formula, not a live rate:
  // 9.1% + GBP45.1/DTN MAX 18.9% + GBP16.5/DTN.
  const row = (id, rate, specific = false) => ({ attributes: { duty_expression_id: id, duty_amount: rate, ...(specific ? { monetary_unit_code: "GBP", measurement_unit_code: "DTN" } : {}) } })
  const rows = [row("19", "16.5", true), row("04", "45.1", true), row("17", "18.9"), row("01", "9.1")]
  const quantities = [{ quantity: "100", unit: "KGM", evidence: "Illustrative weight evidence" }]
  const formula = tariffFormula(rows, quantities)
  assert.equal(formula.components.length, 2)
  assert.equal(formula.bounds[0].components.length, 2)
  for (const [value, duty, vat, applied] of [["100", "35.40", "27.08", "applied"], ["1000", "136.10", "227.22", "not applied"]]) {
    const i = input([item("one", value)]); i.costs = []
    Object.assign(i.items[0].measures[0], formula, { family: "specific-compound" })
    const result = calculateDuty(JSON.parse(JSON.stringify(i)))
    assert.equal(result.lines[0].duty, duty)
    assert.equal(result.lines[0].vat, vat)
    assert.ok(result.lines[0].workings.some(step => step.label.includes(`maximum comparison ${applied}`)))
    assert.equal(result.autoPopulationAllowed, false)
  }
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  snapshot.measures[0].components = rows
  const draft = { direction: "import", invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "one", invoiceHeaderId: "invoice", itemPrice: "100", grossMass: "100", procedureCode: "4000", customsValuationMethod: "1", preferenceCode: "100", commodityCode: tariffRequest.code, nonPreferentialOrigin: tariffRequest.origin }], dutyCalculationSetup: { jurisdiction: "GB", items: { one: { tariffQuantities: quantities } } } }
  draft.customsConversionDate = tariffRequest.date
  const adapted = calculationFromDraft(draft, [], ref.retrievedAt, { one: snapshot })
  assert.deepEqual(adapted.result.issues, [])
  assert.equal(adapted.input.items[0].measures[0].family, "specific-compound")
  assert.deepEqual(adapted.input.items[0].measures[0].bounds, formula.bounds)
  assert.equal(calculateDuty(adapted.input).lines[0].duty, "35.40")
})
test("structured tariff minimum keeps exact threshold arithmetic and rejects conflicting rules", () => {
  const rows = ["01", "15"].map((code, index) => ({ attributes: { duty_expression_id: code, duty_amount: index ? "1.49" : "1" } }))
  const i = input([item("one", "1")]); i.costs = []
  Object.assign(i.items[0].measures[0], tariffFormula(rows, []))
  const result = calculateDuty(i)
  const step = result.lines[0].workings.find(step => step.label.includes("minimum comparison applied"))
  assert.deepEqual(step.exact, { numerator: "149", denominator: "10000" })
  assert.equal(result.lines[0].duty, "0.01")
  i.items[0].measures[0].maximum = "1"
  assert.match(calculateDuty(i).lines[0].issues.join(), /structured tariff bound/)
  delete i.items[0].measures[0].maximum
  i.items[0].measures[0].bounds[0].components = []
  assert.match(calculateDuty(i).lines[0].issues.join(), /comparison and components/)
  for (const code of ["02", "12", "99"]) assert.throws(() => tariffFormula([...rows, { attributes: { duty_expression_id: code, duty_amount: "1" } }], []), /own formula/)
  assert.throws(() => tariffFormula([...rows, rows[1]], []), /twice/)
  assert.throws(() => tariffFormula([rows[1]], []), /one base/)
  assert.throws(() => tariffFormula([rows[0], { attributes: { duty_expression_id: "17", duty_amount: "1", monetary_unit_code: "EUR", measurement_unit_code: "DTN" } }], []), /GBP/)
})
test("contract conversion separates fixed GBP payment from GBP invoice reconversion", () => {
  const worksheet = { invoiceId: "invoice", basis: "foreign-invoice-gbp-payment", foreignCurrency: "USD", fixedRate: "1.5", direction: "currency_units_per_gbp", sellerPaymentCurrency: "GBP", contractReference: "Contract fixture", fixedRateClauseEvidence: "Fixed conversion clause fixture", sellerPaymentEvidence: "GBP settlement agreement fixture", validFrom: "2026-09-01", validTo: "2026-09-30" }
  const hmrc = (amount, currency) => { assert.equal(currency, "USD"); return Decimal.parse(amount).div(Decimal.parse("1.2")) }
  assert.equal(contractGoodsValue(worksheet, { id: "invoice", currency: "USD", amount: "150" }, "2026-09-14", () => assert.fail("Fixed GBP payment does not use HMRC rate")).value.fixed(2), "100.00")
  const reconversion = contractGoodsValue({ ...worksheet, basis: "gbp-invoice-reconversion" }, { id: "invoice", currency: "GBP", amount: "100.001" }, "2026-09-14", hmrc)
  assert.deepEqual(reconversion.foreignAmount, { numerator: "300003", denominator: "2000" })
  assert.deepEqual(reconversion.value.evidence(), { numerator: "100001", denominator: "800" })
  for (const patch of [{ invoiceId: "another" }, { validTo: "2026-08-31" }, { validFrom: "2026-09-15" }, { foreignCurrency: "GBP" }, { direction: "gbp_per_currency_unit" }, { sellerPaymentCurrency: "USD" }, { fixedRateClauseEvidence: "" }, { sellerPaymentEvidence: "" }, { contractReference: "" }, { fixedRate: "0" }, { fixedRate: "-1" }, { basis: "letter-of-credit" }]) assert.throws(() => contractGoodsValue({ ...worksheet, ...patch }, { id: "invoice", currency: "USD", amount: "150" }, "2026-09-14", hmrc))
  assert.throws(() => contractGoodsValue(worksheet, { id: "invoice", currency: "EUR", amount: "150" }, "2026-09-14", hmrc), /currency/)
  const i = input([item("one", "100")]); i.items[0].contractConversion = { ...worksheet, basis: "gbp-invoice-reconversion" }
  i.rates = [{ ...ref, currency: "USD", rate: "1.2", direction: "currency_units_per_gbp" }]
  i.costs = [{ ...cost("freight", "AP", "120", "both"), currency: "USD" }]
  const result = calculateDuty(JSON.parse(JSON.stringify(i)))
  assert.equal(result.lines[0].goodsValue, "125.00")
  assert.equal(result.lines[0].customsValue, "225.00")
  assert.equal(result.lines[0].duty, "27.00")
  assert.equal(result.lines[0].vat, "50.40")
  assert.match(result.lines[0].workings[0].label, /dated HMRC rate/)
  assert.equal(result.autoPopulationAllowed, false)
  i.rates = []
  assert.match(calculateDuty(i).lines[0].issues.join(), /exchange rate/)
})
test("saved invoice contract rates remain invoice-scoped and reconcile the letter-of-credit rate", () => {
  const worksheet = id => ({ invoiceId: id, basis: "foreign-invoice-gbp-payment", foreignCurrency: "USD", fixedRate: id === "a" ? "2" : "1.25", direction: "currency_units_per_gbp", sellerPaymentCurrency: "GBP", contractReference: "Contract fixture", fixedRateClauseEvidence: "Fixed conversion clause fixture", sellerPaymentEvidence: "GBP settlement agreement fixture", validFrom: "2026-09-01", validTo: "2026-09-30" })
  const draft = { direction: "import", customsConversionDate: "2026-09-14", invoiceHeaders: ["a", "b"].map(id => ({ id, currency: "USD", letterOfCreditExchangeRate: worksheet(id).fixedRate })), items: ["a", "b"].map(id => ({ id, invoiceHeaderId: id, itemPrice: "1000", grossMass: "1", procedureCode: "4000", customsValuationMethod: "1", preferenceCode: "100" })), dutyCalculationSetup: { jurisdiction: "GB", invoices: { a: { contractConversion: worksheet("a") }, b: { contractConversion: worksheet("b") } }, items: { a: { dutyRate: "12", vatRate: "20", evidence: "Rate fixture" }, b: { dutyRate: "12", vatRate: "20", evidence: "Rate fixture" } } } }
  const result = calculationFromDraft(JSON.parse(JSON.stringify(draft)), [], ref.retrievedAt)
  assert.deepEqual(result.result.lines.map(line => line.goodsValue), ["500.00", "800.00"])
  assert.deepEqual(result.result.lines.map(line => line.duty), ["60.00", "96.00"])
  assert.equal(result.input.items[0].contractConversion.invoiceId, "a")
  draft.invoiceHeaders[0].letterOfCreditExchangeRate = "3"
  assert.match(calculationFromDraft(draft, [], ref.retrievedAt).result.issues.join(), /differs from/)
  draft.invoiceHeaders[0].currency = "GBP"
  draft.dutyCalculationSetup.invoices.a.contractConversion.basis = "gbp-invoice-reconversion"
  draft.dutyCalculationSetup.invoices.a.contractConversion.foreignCurrency = "EUR"
  assert.deepEqual(calculationCurrencies(draft), ["USD", "EUR"])
})
test("NI risk evaluates the three-point boundary and complete dated rates, not a chosen tariff", () => {
  const duty = percentage => ({ basis: "ad-valorem-only", percentage, date: "2026-09-14", reference: "Reviewed complete rate fixture", allApplicableMeasuresIncluded: true })
  const facts = { date: "2026-09-14", movement: "rest-of-world-to-NI", movementEvidence: "Movement fixture", importerEori: "XI123", processing: { basis: "not-processed", evidence: "Goods purpose fixture" }, ukDuty: duty("6"), euDuty: duty("9"), euTradeRemedy: false, tradeRemedyEvidence: "Reviewed tariff measures fixture", ukims: { reference: "Authorisation fixture", eori: "XI123", validFrom: "2026-09-01", revoked: false }, endUse: "NI", endUseEvidence: "End-consumer agreement fixture" }
  assert.equal(determineNiRisk(facts).status, "at-risk")
  const equivalent = (numerator, denominator = "1") => ({ basis: "equivalent-duty", dutyGbp: { numerator, denominator }, customsValueGbp: { numerator: "1000", denominator: "1" }, valuationReference: "shared-value", date: facts.date, reference: "Complete duty fixture", allApplicableMeasuresIncluded: true })
  const equivalentFacts = { ...facts, ukDuty: equivalent("60"), euDuty: equivalent("90") }
  for (const invalid of [{ numerator: 90, denominator: "1" }, { numerator: "90", denominator: 1 }, { numerator: "9e1", denominator: "1" }]) assert.equal(determineNiRisk({ ...equivalentFacts, euDuty: { ...equivalentFacts.euDuty, dutyGbp: invalid } }).status, "needs-information")
  const allocated = input()
  allocated.jurisdiction = "NI"; allocated.movement = "rest-of-world-to-NI"
  allocated.items[0].niRiskInput = equivalentFacts
  const mismatchedValue = calculateDuty(allocated)
  assert.equal(mismatchedValue.totals, null)
  assert.match(mismatchedValue.lines[0].issues.join(), /fully allocated customs value/)
  const consistent = structuredClone(allocated)
  for (const side of ["ukDuty", "euDuty"]) consistent.items[0].niRiskInput[side].customsValueGbp.numerator = "1500"
  // Difference 30 / 1500 = two points: UKIMS selects UK duty of £60.
  assert.match(calculateDuty(consistent).lines[0].issues.join(), /selected NI duty does not match/)
  consistent.items[0].measures[0].components[0].rate = "4"
  const matched = calculateDuty(consistent)
  assert.equal(matched.lines[0].duty, "60.00")
  assert.equal(matched.lines[0].niRiskDecision.status, "not-at-risk")
  assert.equal(matched.autoPopulationAllowed, false)
  assert.equal(determineNiRisk(equivalentFacts).status, "at-risk")
  assert.equal(determineNiRisk({ ...equivalentFacts, euDuty: equivalent("89999999", "1000000") }).status, "not-at-risk")
  assert.equal(determineNiRisk({ ...equivalentFacts, euDuty: equivalent("59"), ukims: undefined }).status, "not-at-risk")
  for (const patch of [{ valuationReference: "other-value" }, { customsValueGbp: { numerator: "999", denominator: "1" } }, { customsValueGbp: { numerator: "0", denominator: "1" } }, { dutyGbp: { numerator: "90", denominator: "0" } }]) assert.equal(determineNiRisk({ ...equivalentFacts, euDuty: { ...equivalentFacts.euDuty, ...patch } }).status, "needs-information")
  facts.euDuty = duty("8.999999")
  assert.equal(determineNiRisk(facts).status, "not-at-risk")
  assert.equal(determineNiRisk(facts).certified, false)
  assert.equal(determineNiRisk({ ...facts, ukims: undefined }).status, "needs-information")
  const wrongEori = { ...facts, importerEori: "FR123456789", ukims: { ...facts.ukims, eori: "FR123456789" } }
  assert.equal(determineNiRisk(wrongEori).status, "needs-information")
  assert.match(determineNiRisk(wrongEori).reasons.join(" "), /GB or XI EORI/)
  for (const eu of ["6", "5.99999"]) assert.equal(determineNiRisk({ ...facts, euDuty: duty(eu), ukims: undefined }).status, "not-at-risk")
  for (const patch of [{ basis: "specific" }, { date: "2026-09-13" }, { allApplicableMeasuresIncluded: false }, { reference: "" }, { percentage: "-1" }]) assert.equal(determineNiRisk({ ...facts, euDuty: { ...facts.euDuty, ...patch } }).status, "needs-information")
  for (const patch of [{ eori: "another-importer" }, { validFrom: "2026-09-15" }, { validTo: "2026-09-13" }, { revoked: true }]) assert.equal(determineNiRisk({ ...facts, ukims: { ...facts.ukims, ...patch } }).status, "needs-information")
  assert.equal(determineNiRisk({ ...facts, endUse: "UK" }).status, "at-risk")
  assert.equal(determineNiRisk({ ...facts, euTradeRemedy: true }).status, "at-risk")
  assert.equal(determineNiRisk({ ...facts, movement: "GB-to-NI", endUse: "UK" }).status, "not-at-risk")
  assert.equal(determineNiRisk({ ...facts, movement: "GB-to-NI", euDuty: duty("0"), ukims: undefined }).status, "not-at-risk")
  assert.equal(determineNiRisk({ ...facts, movement: "EU-to-NI" }).status, "needs-information")
  assert.equal(determineNiRisk({ ...facts, date: "2025-09-14" }).status, "needs-information")
})
test("NI processing checks do not confuse a turnover threshold or pending quota with eligibility", () => {
  const facts = { date: "2026-09-14", movement: "GB-to-NI", movementEvidence: "Movement fixture", importerEori: "XI123", euDuty: { basis: "ad-valorem-only", percentage: "0", date: "2026-09-14", reference: "Complete rate fixture", allApplicableMeasuresIncluded: true } }
  const check = processing => determineNiRisk({ ...facts, processing: { evidence: "Processing evidence fixture", ...processing } })
  assert.equal(check({ basis: "unconfirmed" }).status, "needs-information")
  assert.equal(check({ basis: "approved-purpose", purpose: "", endUse: "NI", subsequentEntities: 0 }).status, "needs-information")
  assert.equal(check({ basis: "turnover", annualTurnoverGbp: "1999999.99", financialYearEvidence: "Accounts fixture" }).status, "not-at-risk")
  assert.equal(check({ basis: "turnover", annualTurnoverGbp: "2000000", financialYearEvidence: "Accounts fixture" }).status, "needs-information")
  assert.equal(check({ basis: "ineligible" }).status, "at-risk")
  for (const purpose of ["construction", "health-care", "non-profit", "animal-feed"]) {
    const p = { basis: "approved-purpose", purpose, endUse: "NI", subsequentEntities: 1, permanentStructure: true, noSubsequentSale: true }
    assert.equal(check(p).status, "not-at-risk")
    assert.equal(check({ ...p, subsequentEntities: 2 }).status, "needs-information")
    assert.equal(check({ ...p, endUse: "UK" }).status, "needs-information")
  }
  assert.equal(check({ basis: "approved-purpose", purpose: "food", endUse: "UK", subsequentEntities: 2 }).status, "not-at-risk")
  assert.equal(check({ basis: "uk-meat-quota", product: "beef", allocationConfirmed: false, quotaReference: "Quota request fixture" }).status, "needs-information")
})
test("tariff quantity conversion preserves dimensions, exact fractions and weight qualifiers", () => {
  assert.equal(quantityForMeasure({ quantity: "250", sourceUnit: "KGM", targetUnit: "DTN", sourceQualifier: "E", targetQualifier: "E" }).fixed(2), "2.50")
  assert.equal(quantityForMeasure({ quantity: "1.25", sourceUnit: "HLT", targetUnit: "LTR" }).fixed(2), "125.00")
  assert.deepEqual(quantityForMeasure({ quantity: "0.01", sourceUnit: "LTR", targetUnit: "HLT" }).evidence(), { numerator: "1", denominator: "10000" })
  for (const pair of [["KGM", "LTR"], ["LTR", "LPA"], ["UNKNOWN", "KGM"]]) assert.throws(() => quantityForMeasure({ quantity: "100", sourceUnit: pair[0], targetUnit: pair[1] }))
  assert.throws(() => quantityForMeasure({ quantity: "250", sourceUnit: "KGM", targetUnit: "DTN", targetQualifier: "E" }), /qualifier/)
  const i = input(); i.costs = []
  i.items[0].measures[0].components = [{ type: "specific", rate: "7.8", currency: "GBP", quantity: "250", quantityUnit: "KGM", quantityQualifier: "E", unit: "DTN", unitQualifier: "E", per: "1" }]
  assert.equal(calculateDuty(i).lines[0].duty, "19.50")
  assert.ok(calculateDuty(i).lines[0].workings.some(step => step.label.includes("250 KGM → 2.500000 DTN")))
  i.items[0].measures[0].components[0].quantityQualifier = "G"
  assert.equal(calculateDuty(i).totals, null)
  i.items[0].measures[0].components = [{ type: "specific", rate: "2", currency: "GBP", quantity: "0.125", quantityUnit: "TNE", unit: "KGM", per: "1" }]
  const tonnes = calculateDuty(i)
  assert.equal(tonnes.lines[0].duty, "250.00")
  assert.equal(tonnes.lines[0].vat, "250.00")
  assert.ok(tonnes.lines[0].workings.some(step => step.label.includes("0.125 TNE → 125.000000 KGM")))
  assert.equal(tonnes.autoPopulationAllowed, false)
  i.items[0].measures[0].components[0].quantityUnit = "KLT"
  assert.equal(calculateDuty(i).totals, null)
})
test("NI combines EU duty with separately sourced UK excise without changing the duty jurisdiction", () => {
  const i = input(); i.costs = []; i.jurisdiction = "NI"; i.movement = "rest-of-world-to-NI"; i.riskStatus = "at-risk"; i.niTariff = "EU"; i.niTreatmentEvidence = "Reviewed movement fixture"
  i.items[0].measures[0].jurisdiction = "EU"
  // X01 is a synthetic tax identity, not a claim about a live CDS excise code.
  i.items[0].measures.push({ ...measure(), reference: "uk-excise-worked-fixture", jurisdiction: "UK", family: "excise", taxType: "X01", components: [{ type: "specific", rate: "2", currency: "GBP", quantity: "5", unit: "LPA", per: "1" }] })
  const result = calculateDuty(i)
  assert.equal(result.lines[0].duty, "130.00"); assert.equal(result.lines[0].vatBase, "1130.00"); assert.equal(result.lines[0].vat, "226.00")
  assert.equal(result.autoPopulationAllowed, false)
  i.items[0].measures[1].jurisdiction = "EU"
  assert.equal(calculateDuty(i).totals, null)
  assert.match(calculateDuty(i).lines[0].issues.join(), /Excise requires evidenced UK/)
  i.items[0].measures[1].jurisdiction = "UK"; i.items[0].measures[0].jurisdiction = "UK"
  assert.equal(calculateDuty(i).totals, null)
})
test("NI requires a treatment decision and matching jurisdiction, never destination inference", () => {
  const i = input(); i.jurisdiction = "NI"
  assert.equal(calculateDuty(i).totals, null)
  i.riskStatus = "at-risk"; i.niTariff = "EU"; i.niTreatmentEvidence = "Reference decision"; i.movement = "rest-of-world-to-NI"
  assert.equal(calculateDuty(i).totals, null)
  i.items[0].measures[0].jurisdiction = "EU"
  assert.equal(calculateDuty(i).autoPopulationAllowed, false)
  assert.equal(calculateDuty(i).lines[0].status, "estimate")
  i.movement = "EU-to-NI"; assert.equal(calculateDuty(i).totals, null)
  i.movement = "GB-to-NI"; assert.equal(calculateDuty(i).totals, null)
  i.movement = "rest-of-world-to-NI"; i.riskStatus = "not-at-risk"
  assert.match(calculateDuty(i).issues.join(), /conflict/)
})
test("declaration liability totals retain tax types and all payment dispositions", () => {
  const data = input(["payable", "suspended", "relieved", "secured"].map(disposition => {
    const row = item(disposition, "100")
    row.measures[0].disposition = disposition
    if (disposition !== "payable") {
      row.procedureEvidence = "Synthetic liability-event evidence"
      row.vatTreatment = { disposition, evidence: "Synthetic VAT treatment evidence", reference: ref, includedTaxReferences: [{ source: row.measures[0].source, reference: row.measures[0].reference }] }
    }
    return row
  }))
  data.costs = []
  const result = calculateDuty(data)
  assert.deepEqual(result.totals, { duty: "12.00", vat: "22.40" })
  assert.deepEqual(result.liabilityTotals, {
    taxes: ["payable", "relieved", "secured", "suspended"].map(disposition => ({ taxType: "A00", disposition, amount: "12.00" })),
    vat: ["payable", "relieved", "secured", "suspended"].map(disposition => ({ disposition, amount: "22.40" })),
    payableTaxRoundingDifference: "0.00",
  })
  data.items.reverse()
  assert.deepEqual(calculateDuty(data).liabilityTotals, result.liabilityTotals)
  data.items[0].vatRate = ""
  assert.equal(calculateDuty(data).liabilityTotals, undefined)
  const draft = scopedDraft(); delete draft.dutyCalculationSetup.costs["import-freight"].evidence
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt).result.liabilityTotals, undefined)
})

test("liability totals expose rather than conceal estimate rounding differences", () => {
  const data = input([item("one", "0.05")]); data.costs = []
  data.items[0].measures = [measure("10"), { ...measure("10"), reference: "second-measure" }]
  const result = calculateDuty(data)
  assert.equal(result.totals.duty, "0.01")
  assert.equal(result.liabilityTotals.taxes[0].amount, "0.02")
  assert.equal(result.liabilityTotals.payableTaxRoundingDifference, "-0.01")
  assert.equal(result.autoPopulationAllowed, false)
})

test("evidenced VAT suspension retains liability separately from payable amounts", () => {
  const i = input(); i.costs = []
  i.items[0].measures[0].disposition = "suspended"
  i.items[0].procedureEvidence = "Warehouse entry and authorisation fixture, not certification"
  i.items[0].vatTreatment = { disposition: "suspended", evidence: "VAT suspension eligibility fixture", reference: { ...ref, source: "https://www.gov.uk/guidance/special-procedure-customs-warehousing/introduction", reference: "warehouse-vat-entry" }, includedTaxReferences: [{ source: i.items[0].measures[0].source, reference: i.items[0].measures[0].reference }] }
  const result = calculateDuty(i)
  assert.deepEqual(result.totals, { duty: "0.00", vat: "0.00" })
  assert.equal(result.lines[0].vatBase, "1120.00")
  assert.deepEqual(result.lines[0].vatLiability, { amount: "224.00", disposition: "suspended", treatmentReference: "warehouse-vat-entry" })
  assert.equal(result.lines[0].taxes[0].amount, "120.00")
  assert.equal(result.lines[0].taxes[0].disposition, "suspended")
  assert.equal(result.autoPopulationAllowed, false)
  const assessment = { itemId: "one", currency: "GBP", duty: "0.00", vat: "0.00", customsValue: "1000.00", vatBase: "1120.00", taxes: [{ taxType: "A00", disposition: "suspended", amount: "120.00" }] }
  assert.equal(compareAssessment(result, [assessment])[0].status, "incomplete")
  const matched = { ...assessment, vatLiability: { amount: "224.00", disposition: "suspended" } }
  assert.equal(compareAssessment(result, [matched])[0].status, "matched")
  assert.equal(compareAssessment(result, [{ ...matched, vatLiability: { amount: "224.00", disposition: "relieved" } }])[0].status, "cds-difference")
  assert.equal(compareAssessment(result, [{ ...matched, vatLiability: { amount: "223.99", disposition: "suspended" } }])[0].status, "cds-difference")
  assert.throws(() => compareAssessment(result, [{ ...matched, vatLiability: { amount: "224.001", disposition: "suspended" } }]))
  for (const patch of [{ evidence: "" }, { disposition: "postponed" }, { includedTaxReferences: [{ source: "missing", reference: "missing" }] }, { reference: { ...i.items[0].vatTreatment.reference, validTo: "2026-09-13" } }]) {
    const altered = structuredClone(i); Object.assign(altered.items[0].vatTreatment, patch)
    assert.equal(calculateDuty(altered).totals, null)
  }
  delete i.items[0].procedureEvidence
  assert.equal(calculateDuty(i).totals, null)
})
test("preference, quota, procedure and alternative values need evidence", () => {
  for (const family of ["preference", "quota", "special-procedure"]) {
    const i = input(); i.items[0].families = [family]; assert.equal(calculateDuty(i).totals, null)
  }
  const i = input(); i.items[0].valuationMethod = "2"; assert.equal(calculateDuty(i).totals, null)
  i.items[0].alternativeCustomsValue = "2000"; i.items[0].valuationEvidence = "Comparable import valuation worksheet"
  assert.equal(calculateDuty(i).totals, null)
  assert.match(calculateDuty(i).lines[0].issues.join(), /comparable-import worksheet/)
})
test("measure-derived treatments cannot bypass evidence or double-count a tariff charge", () => {
  for (const family of ["preference", "quota", "special-procedure"]) {
    const i = input(); i.items[0].measures[0].family = family
    assert.equal(calculateDuty(i).totals, null)
  }
  const i = input(); i.items[0].measures.push({ ...i.items[0].measures[0] })
  assert.match(calculateDuty(i).lines[0].issues.join(), /more than once/)
  assert.equal(calculateDuty(i).totals, null)
  i.items[0].measures.pop(); delete i.items[0].measures[0].includedInVatBase
  assert.match(calculateDuty(i).lines[0].issues.join(), /VAT base/)
  assert.equal(calculateDuty(i).totals, null)
})
test("assessed liability is independent of payment presentation; comparisons have no hidden tolerance", () => {
  const r = calculateDuty(input())
  assert.equal(compareAssessment(r, [{ itemId: "one", duty: "180.00", vat: "416.01" }])[0].status, "cds-difference")
  assert.equal(compareAssessment(r, [])[0].status, "incomplete")
  assert.throws(() => compareAssessment(r, [{ itemId: "foreign", duty: "0", vat: "0" }]))
})
test("CDS reconciliation includes tax bases and never hides sub-penny input precision", () => {
  const r = calculateDuty(input())
  const assessment = { itemId: "one", duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", currency: "GBP", taxes: [{ taxType: "A00", disposition: "payable", amount: "180.00" }] }
  assert.equal(compareAssessment(r, [assessment])[0].status, "matched")
  const unconfirmedCurrency = compareAssessment(r, [{ ...assessment, currency: undefined }])[0]
  assert.equal(unconfirmedCurrency.status, "incomplete")
  assert.deepEqual(unconfirmedCurrency.missingFields, ["currency"])
  const mismatch = compareAssessment(r, [{ ...assessment, customsValue: "1499.99" }])[0]
  assert.equal(mismatch.status, "cds-difference"); assert.equal(mismatch.customsValueDifference, "-0.01")
  const incomplete = compareAssessment(r, [{ itemId: "one", duty: "180", vat: "416" }])[0]
  assert.equal(incomplete.status, "incomplete"); assert.deepEqual(incomplete.missingFields, ["customsValue", "vatBase", "taxes", "currency"])
  for (const duty of ["180.001", "-1", "NaN", "1e2", ""]) assert.throws(() => compareAssessment(r, [{ ...assessment, duty }]))
  assert.throws(() => compareAssessment(r, [{ ...assessment, currency: "USD" }]))
  assert.throws(() => compareAssessment(r, [assessment, assessment]))
})

test("assessment matches require unambiguous calculated items with no unresolved validation", () => {
  const result = calculateDuty(input())
  const row = { itemId: "one", currency: "GBP", duty: "180", vat: "416", customsValue: "1500", vatBase: "2080", taxes: [{ taxType: "A00", disposition: "payable", amount: "180" }] }
  for (const invalidate of [
    r => { r.issues.push("Unresolved source evidence") },
    r => { r.lines[0].issues.push("Missing valuation evidence") },
    r => { r.lines[0].status = "needs-information" },
  ]) {
    const invalid = structuredClone(result); invalidate(invalid)
    const comparison = compareAssessment(invalid, [row])[0]
    assert.equal(comparison.status, "incomplete")
    assert.ok(comparison.missingFields.includes("validatedCalculation"))
    const changed = compareAssessment(invalid, [{ ...row, vat: "416.01" }])[0]
    assert.equal(changed.status, "cds-difference")
    assert.equal(changed.vatDifference, "0.01")
    assert.ok(changed.missingFields.includes("validatedCalculation"))
    assert.equal(compareDeclarationAssessment(invalid, [row], { currency: "GBP", duty: "180", vat: "416" }).complete, false)
  }
  assert.throws(() => compareAssessment({ ...result, lines: [result.lines[0], result.lines[0]] }, [row]), /Duplicate calculated item/)
})

test("declaration assessment totals reconcile to complete item evidence without hiding differences", () => {
  const r = calculateDuty(input())
  const row = { itemId: "one", duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", currency: "GBP", taxes: [{ taxType: "A00", disposition: "payable", amount: "180.00" }] }
  const totals = { duty: "180.00", vat: "416.00", currency: "GBP" }
  const original = JSON.stringify([r, row, totals])
  assert.equal(compareDeclarationAssessment(r, [row], totals).status, "matched")
  assert.equal(compareDeclarationAssessment(r, [row], totals).complete, true)
  const mismatch = compareDeclarationAssessment(r, [row], { ...totals, vat: "416.01" })
  assert.equal(mismatch.status, "cds-difference")
  assert.equal(mismatch.differences.assessedVatToItems, "0.01")
  const missing = compareDeclarationAssessment(r, [], totals)
  assert.equal(missing.status, "incomplete")
  assert.equal(missing.complete, false)
  const partialDifference = compareDeclarationAssessment(r, [{ ...row, vat: "416.01", vatBase: undefined }], totals)
  assert.equal(partialDifference.status, "cds-difference")
  assert.equal(partialDifference.complete, false)
  assert.equal(mismatch.complete, true)
  assert.equal(missing.assessedItemTotals, null)
  assert.deepEqual(missing.missingItemIds, ["one"])
  assert.equal(compareDeclarationAssessment(r, [row]).status, "incomplete")
  assert.equal(compareDeclarationAssessment(r, [{ ...row, currency: undefined }], totals).status, "incomplete")
  assert.equal(compareDeclarationAssessment({ ...r, issues: ["Unresolved evidence"] }, [row], totals).status, "incomplete")
  assert.throws(() => compareDeclarationAssessment(r, [row], { ...totals, vat: "416.001" }))
  assert.throws(() => compareDeclarationAssessment(r, [row], { ...totals, currency: "USD" }))
  assert.equal(JSON.stringify([r, row, totals]), original)
  const split = calculateDuty(input([item("one", "600"), item("two", "400")]))
  const splitRows = [
    { ...row, duty: "108.00", vat: "249.60", customsValue: "900.00", vatBase: "1248.00", taxes: [{ taxType: "A00", disposition: "payable", amount: "108.00" }] },
    { ...row, itemId: "two", duty: "72.00", vat: "166.40", customsValue: "600.00", vatBase: "832.00", taxes: [{ taxType: "A00", disposition: "payable", amount: "72.00" }] },
  ]
  assert.equal(compareDeclarationAssessment(split, splitRows.toReversed(), totals).status, "matched")
  assert.deepEqual(compareDeclarationAssessment(split, splitRows.slice(0, 1), totals).missingItemIds, ["two"])
  assert.throws(() => compareDeclarationAssessment(split, [splitRows[0], splitRows[0]], totals))
})
test("reconciliation cannot hide different tax types or liability dispositions behind equal totals", () => {
  const data = input()
  data.items[0].measures = [measure("6"), { ...measure("6"), taxType: "A30", reference: "second-measure" }]
  const result = calculateDuty(data)
  const row = { itemId: "one", currency: "GBP", duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", taxes: [
    { taxType: "A00", disposition: "payable", amount: "90.00" }, { taxType: "A30", disposition: "payable", amount: "90.00" },
  ] }
  assert.equal(compareAssessment(result, [row])[0].status, "matched")
  assert.equal(compareAssessment(result, [{ ...row, taxes: undefined }])[0].status, "incomplete")
  const wrongType = compareAssessment(result, [{ ...row, taxes: [{ taxType: "A00", disposition: "payable", amount: "180.00" }] }])[0]
  assert.equal(wrongType.status, "cds-difference"); assert.equal(wrongType.dutyDifference, "0.00")
  assert.equal(wrongType.taxDifferences.find(t => t.taxType === "A30").assessed, null)
  const wrongDisposition = compareAssessment(result, [{ ...row, taxes: row.taxes.map(t => ({ ...t, disposition: "suspended" })) }])[0]
  assert.equal(wrongDisposition.status, "cds-difference"); assert.match(wrongDisposition.issues.join(), /does not reconcile/)
  for (const taxes of [[row.taxes[0], row.taxes[0]], [{ ...row.taxes[0], amount: "90.001" }], [{ ...row.taxes[0], taxType: "B00" }], [{ ...row.taxes[0], disposition: "deferred" }]]) assert.throws(() => compareAssessment(result, [{ ...row, taxes }]))
})
test("reconciliation groups multiple measures of one tax type without losing suspended liabilities", () => {
  const data = input()
  data.items[0].measures = [measure("6"), { ...measure("6"), reference: "second-measure" }, { ...measure("2"), reference: "suspended-measure", disposition: "suspended" }]
  const result = calculateDuty(data)
  const row = { itemId: "one", currency: "GBP", duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", taxes: [
    { taxType: "A00", disposition: "payable", amount: "180.00" }, { taxType: "A00", disposition: "suspended", amount: "30.00" },
  ] }
  assert.equal(compareAssessment(result, [row])[0].status, "matched")
  assert.equal(compareAssessment(result, [{ ...row, taxes: row.taxes.slice(0, 1) }])[0].status, "cds-difference")
})
test("draft adapter uses linked invoice currency, requires source evidence, and never assumes zero VAT", () => {
  const draft = { direction: "import", customsConversionDate: "2026-09-14", invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "one", invoiceHeaderId: "invoice", itemPrice: "1000", currency: "USD", grossMass: "1", procedureCode: "4000", customsValuationMethod: "1", preferenceCode: "100" }], dutyCalculationSetup: { jurisdiction: "GB", items: { one: { dutyRate: "12", vatRate: "20", evidence: "Reviewed example" } } } }
  const r = calculationFromDraft(draft, [], ref.retrievedAt)
  assert.equal(r.input.items[0].currency, "GBP"); assert.equal(r.result.lines[0].duty, "120.00")
  draft.dutyCalculationSetup.items.one.vatRate = ""; assert.equal(calculationFromDraft(draft, [], ref.retrievedAt).result.totals, null)
})

function scopedDraft() {
  return {
    direction: "import", customsConversionDate: "2026-09-14",
    invoiceHeaders: [{ id: "a", currency: "GBP" }, { id: "b", currency: "GBP" }],
    items: ["one", "two"].map((id, index) => ({ id, invoiceHeaderId: index ? "b" : "a", itemPrice: "100", grossMass: "1", procedureCode: "4000", customsValuationMethod: "1", preferenceCode: "100", valuationAdjustments: [] })),
    importAdjustments: [{ id: "import-freight", code: "AP", amount: "50", currency: "GBP" }],
    dutyCalculationSetup: { jurisdiction: "GB", items: Object.fromEntries(["one", "two"].map(id => [id, { dutyRate: "10", vatRate: "20", evidence: "Fixture only" }])), costs: { "import-freight": { evidence: "Invoice freight", includedInPrice: false, scope: { type: "invoice", invoiceId: "b" } } } },
  }
}
test("an incomplete specialist item keeps its allocation share without hiding valid item estimates", () => {
  const draft = scopedDraft()
  draft.items[0].itemPrice = "600"; draft.items[1].itemPrice = "400"
  draft.items[1].procedureCode = "5300"
  draft.importAdjustments = [{ id: "import-freight", code: "AP", amount: "500", currency: "GBP" }, { id: "import-vat", code: "AV", amount: "400", currency: "GBP" }]
  draft.dutyCalculationSetup.items.one.dutyRate = "12"
  draft.dutyCalculationSetup.items.two.dutyRate = "12"
  draft.dutyCalculationSetup.costs = Object.fromEntries(["import-freight", "import-vat"].map(id => [id, { evidence: "Synthetic shared cost", includedInPrice: false, scope: { type: "declaration" } }]))
  const before = structuredClone(draft)
  const run = calculationFromDraft(draft, [], ref.retrievedAt).result
  assert.equal(run.lines[0].status, "estimate", JSON.stringify(run))
  assert.equal(run.lines[0].duty, "108.00")
  assert.equal(run.lines[0].vat, "249.60")
  assert.equal(run.lines[0].allocations.find(row => row.code === "AP").amount, "300.00")
  assert.equal(run.lines[1].status, "needs-information")
  assert.equal(run.lines[1].duty, undefined)
  assert.ok(run.lines[1].issues.some(issue => issue.includes("specialist treatment")))
  assert.equal(run.lines[1].allocations.find(row => row.code === "AP").amount, "200.00")
  assert.equal(run.totals, null, "A partial result must not masquerade as a declaration total")
  assert.equal(run.liabilityTotals, undefined)
  assert.equal(run.autoPopulationAllowed, false)
  assert.deepEqual(draft, before)
  draft.items[1].itemPrice = ""
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt).result.lines[0].duty, undefined, "Unknown shared allocation denominators still block affected calculations")
  draft.items[1].itemPrice = "400"
  draft.dutyCalculationSetup.costs["import-freight"].includedInPrice = undefined
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt).result.lines[0].duty, undefined, "Ambiguous shared costs remain declaration-wide")
})

test("warehouse entry preserves suspended estimates and rejects incomplete or mismatched treatment", () => {
  const draft = scopedDraft()
  draft.declarationCategory = "H2"; draft.declarationType = "A"
  draft.warehouseType = "U"; draft.warehouseIdentifier = "warehouse-fixture"
  draft.authorisationCategory = "CWP"; draft.authorisationIdentifier = "GB123456789000"
  draft.items.forEach(item => { item.procedureCode = "7100"; item.additionalProcedureCode = "000" })
  draft.dutyCalculationSetup.warehouseEntry = {
    event: "entry", warehouseCountry: "GB", warehouseIdentifier: "warehouse-fixture", authorisationNumber: "CWP-fixture",
    holderEori: "GB123456789000", validFrom: "2026-09-01", validTo: "2026-09-30",
    activeAuthorisationEvidence: "Active decision fixture", goodsCoveredEvidence: "Both goods covered by decision fixture",
    entryConditionsEvidence: "Entry without delay, unchanged goods; conditions reviewed fixture", securityReviewEvidence: "Security conditions reviewed fixture",
    representation: "agent", agentApprovalEvidence: "Written holder approval fixture", declarationCopyEvidence: "Holder copy arrangement fixture",
  }
  const before = JSON.stringify(draft)
  const run = calculationFromDraft(JSON.parse(before), [], ref.retrievedAt)
  assert.deepEqual(run.result.issues, [])
  assert.deepEqual(run.result.totals, { duty: "0.00", vat: "0.00" })
  assert.deepEqual(run.result.lines.map(line => line.taxes[0].amount), ["10.00", "15.00"])
  assert.deepEqual(run.result.lines.map(line => line.vatLiability.amount), ["22.00", "33.00"])
  assert.ok(run.result.lines.every(line => line.taxes[0].disposition === "suspended" && line.vatLiability.disposition === "suspended" && line.status === "estimate"))
  assert.equal(run.result.autoPopulationAllowed, false)
  assert.ok(run.input.items[0].procedureEvidence.includes("Recalculate on release"))
  assert.equal(JSON.stringify(draft), before)
  const context = { direction: "import", jurisdiction: "GB", date: "2026-09-14", retrievedAt: ref.retrievedAt,
    category: "H2", declarationType: "A", warehouseType: "U", warehouseIdentifier: "warehouse-fixture",
    procedures: ["7100"], additionalProcedures: ["000"], preference: "100",
    holders: [{ category: "CWP", identifier: "GB123456789000" }] }
  const compound = item("compound", "1000")
  compound.measures[0].family = "specific-compound"
  compound.measures[0].components = [{ type: "percent", rate: "5" }, { type: "specific", rate: "2", currency: "GBP", quantity: "30", unit: "KGM", per: "10" }]
  compound.measures[0].minimum = "60"
  const compoundBefore = JSON.stringify(compound)
  const suspended = warehouseEntryEstimate(compound, context, draft.dutyCalculationSetup.warehouseEntry)
  assert.deepEqual(suspended.issues, [])
  assert.equal(JSON.stringify(compound), compoundBefore)
  const estimate = input([suspended.item]); estimate.costs = []
  const calculated = calculateDuty(estimate)
  assert.deepEqual(calculated.totals, { duty: "0.00", vat: "0.00" })
  assert.equal(calculated.lines[0].taxes[0].amount, "60.00")
  assert.equal(calculated.lines[0].taxes[0].disposition, "suspended")
  assert.equal(calculated.lines[0].vatLiability.amount, "212.00")
  assert.equal(calculated.lines[0].vatLiability.disposition, "suspended")
  assert.equal(calculated.autoPopulationAllowed, false)
  estimate.items[0].measures[0].components[1].quantity = ""
  assert.equal(calculateDuty(estimate).totals, null)
  const remedy = structuredClone(compound); remedy.measures[0].family = "trade-remedy"
  assert.ok(warehouseEntryEstimate(remedy, context, draft.dutyCalculationSetup.warehouseEntry).issues.length)
  for (const mutate of [
    d => { d.direction = "export" }, d => { d.dutyCalculationSetup.jurisdiction = "NI" },
    d => { d.declarationCategory = "H1" }, d => { d.declarationType = "C" },
    d => { d.warehouseType = "S" }, d => { d.warehouseIdentifier = "other" },
    d => { d.authorisationIdentifier = "decision-number-not-eori" },
    d => { d.items[1].procedureCode = "4000" }, d => { d.items[0].additionalProcedureCodes = [{ code: "1VW" }] },
    d => { d.items[0].preferenceCode = "300" }, d => { d.customsConversionDate = "2026-08-31" },
    d => { delete d.dutyCalculationSetup.warehouseEntry },
    d => { d.dutyCalculationSetup.warehouseEntry.event = "release" },
    d => { d.dutyCalculationSetup.warehouseEntry.representation = "" },
    d => { d.dutyCalculationSetup.warehouseEntry.warehouseCountry = "XI" },
    d => { d.dutyCalculationSetup.warehouseEntry.validTo = "2026-09-13" },
    d => { d.dutyCalculationSetup.warehouseEntry.validFrom = "2026-02-30" },
    ...["activeAuthorisationEvidence", "goodsCoveredEvidence", "entryConditionsEvidence", "securityReviewEvidence", "agentApprovalEvidence", "declarationCopyEvidence", "authorisationNumber"].map(key => d => { d.dutyCalculationSetup.warehouseEntry[key] = " " }),
  ]) {
    const changed = structuredClone(draft); mutate(changed)
    const rejected = calculationFromDraft(changed, [], ref.retrievedAt).result
    assert.equal(rejected.totals, null)
    assert.equal(rejected.autoPopulationAllowed, false)
    if (changed.items[0].preferenceCode === "300") {
      assert.equal(rejected.lines[0].duty, undefined)
      assert.equal(rejected.lines[0].vatLiability, undefined)
      assert.equal(rejected.lines[1].status, "estimate")
      assert.equal(rejected.lines[1].taxes[0].disposition, "suspended")
      assert.equal(rejected.lines[1].vatLiability.disposition, "suspended")
    } else assert.ok(rejected.lines.every(line => line.vatLiability === undefined && line.duty === undefined))
  }
  const publicWarehouse = structuredClone(draft)
  publicWarehouse.warehouseType = "R"; publicWarehouse.authorisationCategory = ""; publicWarehouse.authorisationIdentifier = ""
  publicWarehouse.additionalAuthorisationHolders = [{ id: "holder", category: "CW1", identifier: "GB123456789000" }]
  publicWarehouse.dutyCalculationSetup.warehouseEntry.representation = "holder"
  delete publicWarehouse.dutyCalculationSetup.warehouseEntry.agentApprovalEvidence
  delete publicWarehouse.dutyCalculationSetup.warehouseEntry.declarationCopyEvidence
  assert.deepEqual(calculationFromDraft(publicWarehouse, [], ref.retrievedAt).result.totals, { duty: "0.00", vat: "0.00" })
})
test("monetary additions require valuation evidence and retain invoice or item attribution", () => {
  for (const code of ["AB", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AL"]) {
    const draft = scopedDraft()
    draft.importAdjustments = [{ id: "monetary-cost", code, amount: "50", currency: "USD" }]
    draft.dutyCalculationSetup.costs = { "monetary-cost": { evidence: "Cost document fixture", valuationBasisEvidence: "Reviewed dutiable portion attributable to these goods fixture", includedInPrice: false, scope: { type: "invoice", invoiceId: "b" } } }
    const rates = [{ ...ref, currency: "USD", rate: "2", direction: "currency_units_per_gbp" }]
    let run = calculationFromDraft(JSON.parse(JSON.stringify(draft)), rates, ref.retrievedAt)
    assert.deepEqual(run.result.issues, [])
    assert.deepEqual(run.result.lines.map(line => line.customsValue), ["100.00", "125.00"])
    assert.deepEqual(run.result.totals, { duty: "22.50", vat: code === "AI" ? "44.50" : "49.50" })
    assert.match(run.input.costs[0].evidence, /Valuation basis:/)
    assert.equal(run.result.autoPopulationAllowed, false)
    for (const key of ["evidence", "valuationBasisEvidence"]) {
      const missing = structuredClone(draft); missing.dutyCalculationSetup.costs["monetary-cost"][key] = ""
      assert.equal(calculationFromDraft(missing, rates, ref.retrievedAt).result.totals, null)
    }
    draft.dutyCalculationSetup.costs["monetary-cost"].includedInPrice = true
    assert.deepEqual(calculationFromDraft(draft, rates, ref.retrievedAt).result.lines.map(line => line.customsValue), ["100.00", "100.00"])
    draft.dutyCalculationSetup.costs["monetary-cost"].includedInPrice = false
    draft.items[1].valuationAdjustments = [{ id: "direct", code, amount: "50", currency: "USD" }]
    const rowId = calculationCostRows(draft).find(row => row.itemId === "two").id
    draft.dutyCalculationSetup.costs[rowId] = draft.dutyCalculationSetup.costs["monetary-cost"]
    assert.equal(calculationFromDraft(draft, rates, ref.retrievedAt).result.totals, null)
    draft.importAdjustments = []
    run = calculationFromDraft(draft, rates, ref.retrievedAt)
    assert.deepEqual(run.result.totals, { duty: "22.50", vat: code === "AI" ? "44.50" : "49.50" })
    assert.equal(run.result.lines[1].allocations[0].basis, "direct")
  }
})

test("mass-based freight can coexist with value-based packing without relaxing freight code rules", () => {
  const data = input([item("one", "600"), item("two", "400")])
  data.items[1].grossMass = "3"
  data.costs = [{ ...cost("freight", "AQ", "400", "both"), basis: "gross_mass" }, cost("packing", "AD", "100", "both")]
  let result = calculateDuty(data)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.lines.map(line => line.customsValue), ["760.00", "740.00"])
  assert.deepEqual(result.totals, { duty: "180.00", vat: "336.00" })
  data.costs.push(cost("vat", "AV", "100", "vat"))
  assert.equal(calculateDuty(data).totals, null)
  data.costs.pop()
  data.costs[0].code = "AP"
  result = calculateDuty(data)
  assert.equal(result.totals, null)
  assert.ok(result.issues.some(issue => issue.includes("requires value allocation")))
})

test("discount deductions require current entitlement and do not repeat an invoice reduction", () => {
  const draft = scopedDraft()
  draft.importAdjustments = [{ id: "discount", code: "BH", amount: "20", currency: "GBP" }]
  draft.dutyCalculationSetup.costs = { discount: { evidence: "Discount invoice fixture", includedInPrice: true, scope: { type: "invoice", invoiceId: "b" }, discount: {
    kind: "early-payment", agreedOn: "2026-09-01", contractReference: "Contract fixture", goodsEntitlementEvidence: "Current goods fixture", commercialBasisEvidence: "Normal trade terms fixture", relatesOnlyToSelectedGoods: true,
    paymentStatus: "unpaid", availableUntil: "2026-09-14", tradePracticeEvidence: "Sector terms fixture",
  } } }
  let run = calculationFromDraft(JSON.parse(JSON.stringify(draft)), [], ref.retrievedAt)
  assert.deepEqual(run.result.totals, { duty: "18.00", vat: "39.60" })
  assert.deepEqual(run.result.lines.map(line => line.customsValue), ["100.00", "80.00"])
  for (const patch of [{ kind: "" }, { paymentStatus: "" }, { agreedOn: "2026-09-15" }, { agreedOn: "2026-02-30" }, { availableUntil: "2026-09-13" }, { tradePracticeEvidence: "" }, { relatesOnlyToSelectedGoods: false }, { paymentStatus: "full" }, { paymentStatus: "discounted", paymentEvidence: "" }]) {
    const invalid = structuredClone(draft); Object.assign(invalid.dutyCalculationSetup.costs.discount.discount, patch)
    assert.equal(calculationFromDraft(invalid, [], ref.retrievedAt).result.totals, null)
  }
  draft.dutyCalculationSetup.costs.discount.includedInPrice = false
  assert.deepEqual(calculationFromDraft(draft, [], ref.retrievedAt).result.totals, { duty: "20.00", vat: "44.00" })
  draft.dutyCalculationSetup.costs.discount.includedInPrice = true
  Object.assign(draft.dutyCalculationSetup.costs.discount.discount, { paymentStatus: "discounted", paymentEvidence: "Bank confirmation fixture", availableUntil: "2026-09-13" })
  run = calculationFromDraft(draft, [], ref.retrievedAt)
  assert.deepEqual(run.result.totals, { duty: "18.00", vat: "39.60" })
  assert.equal(run.result.autoPopulationAllowed, false)
})

test("official website links do not promote operator rates into official tax evidence", () => {
  const candidate = item("one", "100")
  assert.equal(hasOfficialTaxEvidence(candidate), false)
  candidate.measures = candidate.measures.map(value => ({ ...value, provenance: "official-snapshot" }))
  assert.equal(hasOfficialTaxEvidence(candidate), false)
  candidate.vatReference = { ...candidate.vatReference, provenance: "official-snapshot" }
  assert.equal(hasOfficialTaxEvidence(candidate), true)
  candidate.measures.push({ ...candidate.measures[0], taxType: "A30", provenance: "operator" })
  assert.equal(hasOfficialTaxEvidence(candidate), false)
  const draft = scopedDraft()
  draft.dutyCalculationSetup.items.one = { ...draft.dutyCalculationSetup.items.one, provenance: "official-snapshot" }
  const saved = calculationFromDraft(draft, [], ref.retrievedAt)
  assert.ok(saved.input.items.every(value => value.measures.every(tax => tax.provenance === "operator") && value.vatReference.provenance === "operator"))
  assert.equal(saved.result.autoPopulationAllowed, false)
})

test("agreed incidental expenses apply consignment minima and evidence instead of invoice counts", () => {
  const worksheet = { method: "national", consignmentReference: "consignment-fixture", scopeEvidence: "All goods in consignment fixture", noDuplicateCostsConfirmed: true, internationalMovement: true, terminatesInUk: true, borderFreightSeparatedEvidence: "Border freight invoice fixture", group: "air", weightKg: "10", weightEvidence: "Chargeable weight fixture" }
  for (const [group, weightKg, amount] of [["air", "10", "100.00"], ["air", "300", "120.00"], ["groupage", "500", "170.00"], ["groupage", "2000", "260.00"], ["full-load", "", "550.00"]]) {
    assert.equal(vatIncidentalExpenses({ ...worksheet, group, weightKg }, "2026-09-14").amount.fixed(2), amount)
  }
  for (const patch of [{ internationalMovement: false }, { terminatesInUk: false }, { borderFreightSeparatedEvidence: "" }, { noDuplicateCostsConfirmed: false }, { weightKg: "0" }, { group: "courier" }]) assert.throws(() => vatIncidentalExpenses({ ...worksheet, ...patch }, "2026-09-14"))
  const draft = scopedDraft()
  draft.importAdjustments.push({ id: "import-vat", code: "AV", currency: "GBP", amount: "100" })
  draft.dutyCalculationSetup.costs["import-vat"] = { evidence: "Consignment expenses fixture", includedInPrice: false, vatExpense: worksheet }
  let run = calculationFromDraft(structuredClone(draft), [], ref.retrievedAt)
  assert.deepEqual(run.result.totals, { duty: "25.00", vat: "75.00" })
  assert.ok(run.input.items.every(item => item.families.includes("vat-expenses")))
  assert.match(run.input.costs.find(cost => cost.code === "AV").evidence, /minimum £100 per consignment/)
  assert.equal(run.result.autoPopulationAllowed, false)
  draft.importAdjustments.at(-1).amount = "200"
  run = calculationFromDraft(draft, [], ref.retrievedAt)
  assert.equal(run.result.totals, null)
  assert.equal(run.result.liabilityTotals, undefined)
  const individual = { ...worksheet, method: "individual", agreement: { reference: "HMRC agreement fixture", validFrom: "2026-09-01", validTo: "2026-09-30", importerEvidence: "Importer fixture", applicabilityEvidence: "Covered consignment fixture", amountGbp: "125", workingsEvidence: "Agreed calculation fixture" } }
  assert.equal(vatIncidentalExpenses(individual, "2026-09-14").amount.fixed(2), "125.00")
  assert.throws(() => vatIncidentalExpenses(individual, "2026-10-01"))
  assert.throws(() => vatIncidentalExpenses({ ...individual, agreement: { ...individual.agreement, workingsEvidence: "" } }, "2026-09-14"))
})

test("returning to actual VAT expenses preserves inactive agreement evidence without applying it", () => {
  const draft = scopedDraft()
  draft.importAdjustments.push({ id: "import-vat", code: "AV", currency: "GBP", amount: "75" })
  const savedWorksheet = { method: "actual", consignmentReference: "retained-consignment", scopeEvidence: "retained-scope", noDuplicateCostsConfirmed: false, group: "air", weightKg: "300", agreement: { reference: "expired agreement", validFrom: "2020-01-01", validTo: "2020-12-31", importerEvidence: "retained importer", applicabilityEvidence: "retained conditions", amountGbp: "200", workingsEvidence: "retained workings" } }
  draft.dutyCalculationSetup.costs["import-vat"] = { evidence: "Actual expenses invoice", includedInPrice: false, vatExpense: savedWorksheet }
  const before = JSON.stringify(draft)
  const run = calculationFromDraft(draft, [], ref.retrievedAt)
  assert.deepEqual(run.result.totals, { duty: "25.00", vat: "70.00" })
  assert.equal(JSON.stringify(draft), before)
  assert.ok(run.input.items.every(item => !item.families.includes("vat-expenses")))
  const restored = JSON.parse(before)
  restored.dutyCalculationSetup.costs["import-vat"].vatExpense.method = "individual"
  assert.equal(calculationFromDraft(restored, [], ref.retrievedAt).result.totals, null)
  assert.equal(restored.dutyCalculationSetup.costs["import-vat"].vatExpense.agreement.reference, "expired agreement")
})

test("percentage discounts use full linked item prices and retain entitlement gates", () => {
  const draft = scopedDraft()
  draft.importAdjustments.push({ id: "discount", code: "BI", amount: "10", currency: "EUR" })
  draft.dutyCalculationSetup.costs.discount = {
    evidence: "Invoice discount fixture", includedInPrice: true, fullItemPriceBasisConfirmed: true,
    scope: { type: "invoice", invoiceId: "b" },
    discount: { kind: "earned", agreedOn: "2026-09-01", contractReference: "Contract fixture", goodsEntitlementEvidence: "Current goods fixture", commercialBasisEvidence: "Quantity terms fixture", relatesOnlyToSelectedGoods: true, paymentStatus: "unpaid" },
  }
  const run = () => calculationFromDraft(structuredClone(draft), [], ref.retrievedAt).result
  let result = run()
  // Invoice b has £100 goods and £50 freight: discount is £10, not £15.
  assert.deepEqual(result.lines.map(line => line.customsValue), ["100.00", "140.00"])
  assert.deepEqual(result.totals, { duty: "24.00", vat: "52.80" })
  assert.equal(result.lines[1].allocations.find(row => row.code === "BI").allocationEvidence.itemPricePercentage, "10")
  assert.equal(result.autoPopulationAllowed, false)
  draft.dutyCalculationSetup.costs.discount.fullItemPriceBasisConfirmed = false
  assert.equal(run().totals, null)
  draft.dutyCalculationSetup.costs.discount.fullItemPriceBasisConfirmed = true
  draft.dutyCalculationSetup.costs.discount.discount.paymentStatus = "full"
  assert.equal(run().totals, null)
  draft.dutyCalculationSetup.costs.discount.discount.paymentStatus = "unpaid"
  draft.dutyCalculationSetup.costs.discount.includedInPrice = false
  assert.deepEqual(run().totals, { duty: "25.00", vat: "55.00" })
})

test("freight cannot mask excessive individual or combined goods discounts", () => {
  for (const discounts of [
    [{ ...cost("discount", "BH", "101", "both"), operation: "deduct", includedInPrice: true }],
    [{ ...cost("discount", "BI", "101", "both"), currency: "", percentageOfItemPrice: true, operation: "deduct", includedInPrice: true }],
    [{ ...cost("money", "BH", "60", "both"), operation: "deduct", includedInPrice: true }, { ...cost("percent", "BI", "50", "both"), currency: "", percentageOfItemPrice: true, operation: "deduct", includedInPrice: true }],
  ]) {
    const data = input([item("one", "100")])
    data.costs = [cost("freight", "AP", "500", "both"), ...discounts]
    const result = calculateDuty(data)
    assert.equal(result.totals, null)
    assert.equal(result.lines[0].duty, undefined)
    assert.ok(result.lines[0].issues.some(issue => issue.includes("Discounts exceed")))
    assert.equal(result.autoPopulationAllowed, false)
  }
})

test("percentage additions use exact item prices rather than freight or rounded currency totals", () => {
  for (const code of ["AC", "AX", "AZ", "AM"]) {
    const data = input([item("one", "600"), item("two", "800")])
    data.items[1].currency = "USD"
    data.rates = [{ ...ref, currency: "USD", rate: "2", direction: "currency_units_per_gbp" }]
    data.costs = [cost("freight", "AP", "500", "both"), { ...cost("percentage", code, "5.00", code === "AM" ? "customs" : "both"), currency: "", percentageOfItemPrice: true }]
    const run = calculateDuty(data)
    assert.deepEqual(run.lines.map(line => line.customsValue), ["930.00", "620.00"])
    assert.deepEqual(run.totals, { duty: "186.00", vat: code === "AM" ? "337.20" : "347.20" })
    assert.equal(run.lines[0].allocations[1].allocationEvidence.itemPricePercentage, "5.00")
    assert.ok(run.lines[0].workings.some(step => step.label.includes("5.00% of this item's goods price")))
    for (const patch of [{ percentageOfItemPrice: false }, { currency: "GBP" }, { basis: "gross_mass" }, { amount: "5.001" }, { amount: "-5" }]) {
      const invalid = structuredClone(data); Object.assign(invalid.costs[1], patch)
      assert.equal(calculateDuty(invalid).totals, null)
    }
    const draft = scopedDraft(); draft.importAdjustments = [{ id: "percentage", code, amount: "7.5", currency: "EUR" }]
    draft.invoiceHeaders[1].currency = "USD"
    draft.dutyCalculationSetup.costs = { percentage: { evidence: "Royalty/assist contract fixture", valuationBasisEvidence: "Dutiable portion and full price basis reviewed fixture", includedInPrice: false, fullItemPriceBasisConfirmed: true, scope: { type: "invoice", invoiceId: "b" } } }
    const rates = [{ ...ref, currency: "USD", rate: "3", direction: "currency_units_per_gbp" }]
    assert.deepEqual(calculationCurrencies(draft), ["USD"])
    const saved = calculationFromDraft(JSON.parse(JSON.stringify(draft)), rates, ref.retrievedAt)
    assert.equal(saved.input.costs[0].currency, "")
    assert.equal(saved.result.lines[0].allocations.length, 0)
    assert.deepEqual(saved.result.lines[1].allocations[0].exact, { numerator: "5", denominator: "2" })
    assert.deepEqual(saved.result.totals, { duty: "13.58", vat: code === "AM" ? "29.38" : "29.88" })
    delete draft.dutyCalculationSetup.costs.percentage.fullItemPriceBasisConfirmed
    assert.equal(calculationFromDraft(draft, rates, ref.retrievedAt).result.totals, null)
  }
})

test("royalties affect customs but are excluded from import VAT whether included or additional", () => {
  for (const code of ["AI", "AM"]) {
    const data = input(); data.costs = [{ ...cost("royalty", code, code === "AI" ? "100" : "10", "customs"), currency: code === "AI" ? "GBP" : "", percentageOfItemPrice: code === "AM" }]
    let result = calculateDuty(data)
    assert.equal(result.lines[0].customsValue, "1100.00")
    assert.deepEqual(result.totals, { duty: "132.00", vat: "226.40" })
    data.costs[0].includedInPrice = true
    result = calculateDuty(data)
    assert.equal(result.lines[0].customsValue, "1000.00")
    assert.equal(result.lines[0].vatBase, "1020.00")
    assert.deepEqual(result.totals, { duty: "120.00", vat: "204.00" })
    assert.equal(result.lines[0].allocations[0].effect, "vat")
    assert.equal(result.lines[0].allocations[0].operation, "deduct")
    data.costs[0].effect = "both"
    assert.equal(calculateDuty(data).totals, null)
  }
})

test("saved included surface freight is deducted for duty but retained for VAT", () => {
  for (const code of ["BA", "BU"]) {
    const draft = scopedDraft()
    draft.importAdjustments[0].code = code
    draft.importAdjustments[0].id = "surface-cost"
    draft.dutyCalculationSetup.costs["surface-cost"] = draft.dutyCalculationSetup.costs["import-freight"]
    draft.dutyCalculationSetup.costs["import-freight"].includedInPrice = true
    const run = calculationFromDraft(JSON.parse(JSON.stringify(draft)), [], ref.retrievedAt)
    assert.equal(run.input.costs[0].effect, "customs")
    assert.deepEqual(run.result.issues, [])
    assert.deepEqual(run.result.lines.map(line => line.customsValue), ["100.00", "50.00"])
    assert.deepEqual(run.result.lines.map(line => line.duty), ["10.00", "5.00"])
    assert.deepEqual(run.result.lines.map(line => line.vatBase), ["110.00", "105.00"])
    assert.deepEqual(run.result.lines.map(line => line.vat), ["22.00", "21.00"])
    assert.deepEqual(run.result.totals, { duty: "15.00", vat: "43.00" })
    assert.ok(run.result.lines[1].workings.some(step => step.label.includes("retained in VAT base") && step.amount === "50.00"))
    assert.equal(run.result.autoPopulationAllowed, false)
    // Weight apportionment must not wipe out a lower-value item's customs base.
    if (code === "BU") {
      draft.importAdjustments[0].amount = "200"
      draft.dutyCalculationSetup.costs["import-freight"].scope = { type: "declaration" }
      assert.equal(calculationFromDraft(draft, [], ref.retrievedAt).result.totals, null)
    }
  }
})
test("saved airfreight inputs retain full amounts while splitting customs and VAT", () => {
  for (const code of ["AR", "AS", "BR", "BS"]) {
    const draft = scopedDraft(), included = code.startsWith("B")
    draft.importAdjustments[0].code = code
    draft.importAdjustments[0].id = code === "AR" ? "import-air" : "air-cost"
    draft.dutyCalculationSetup.costs[draft.importAdjustments[0].id] = draft.dutyCalculationSetup.costs["import-freight"]
    draft.importAdjustments[0].amount = "300"
    draft.items[1].itemPrice = included ? "1300" : "1000"
    Object.assign(draft.dutyCalculationSetup.costs["import-freight"], { includedInPrice: included, airfreightPercentage: "70" })
    const run = calculationFromDraft(JSON.parse(JSON.stringify(draft)), [], ref.retrievedAt)
    assert.equal(run.input.costs[0].amount, "300")
    assert.deepEqual(run.result.issues, [])
    assert.equal(run.result.lines[1].customsValue, "1210.00")
    assert.equal(run.result.lines[1].vatBase, "1421.00")
    assert.equal(run.result.lines[1].vat, "284.20")
    assert.equal(run.result.lines[0].allocations.length, 0)
    assert.equal(draft.importAdjustments[0].amount, "300")
  }
})
test("provider preflight rejects malformed or oversized drafts before reference work", () => {
  const draft = scopedDraft()
  assert.deepEqual(calculationPreflight(draft), [])
  for (const items of [undefined, [], Array.from({ length: 1001 }, (_, index) => ({ ...draft.items[0], id: String(index) }))]) assert.match(calculationPreflight({ ...draft, items }).join(), /1,000/)
  assert.match(calculationPreflight({ ...draft, items: [draft.items[0], draft.items[0]] }).join(), /unique reference/)
  assert.match(calculationPreflight({ ...draft, invoiceHeaders: [draft.invoiceHeaders[0], draft.invoiceHeaders[0]] }).join(), /unique invoice/)
  assert.match(calculationPreflight({ ...draft, items: [{ ...draft.items[0], invoiceHeaderId: "missing" }] }).join(), /Link every item/)
  assert.match(calculationPreflight({ ...draft, direction: "export" }).join(), /import liabilities/)
  assert.match(calculationPreflight({ ...draft, dutyCalculationSetup: {} }).join(), /Great Britain/)
  draft.items[0].valuationAdjustments = Array.from({ length: 100 }, (_, index) => ({ id: String(index), code: "AK", amount: "1", currency: "GBP" }))
  assert.match(calculationPreflight(draft).join(), /99 populated/)
  draft.items[0].valuationAdjustments.forEach(row => { row.amount = "" })
  assert.deepEqual(calculationPreflight(draft), [])
})
test("saved Method 5 worksheets retain item identity and independent cost currencies", () => {
  const draft = scopedDraft(); draft.items = draft.items.slice(0, 1); draft.importAdjustments = []
  draft.items[0].customsValuationMethod = "5"
  draft.dutyCalculationSetup.items.one.computedValueWorksheet = {
    producerAccountsEvidence: "Producer accounts", accountingPrinciplesEvidence: "Local accounting principles", usualProfitEvidence: "Comparable producer profit",
    earlierMethodReasons: { 1: "No sale", 2: "No identical goods", 3: "No similar goods" }, method4Decision: { treatment: "method5-first", evidence: "Importer request" },
    components: computedValueCategories.map(category => ({ category, amount: category === "materials" ? "1000" : category === "border-transport" ? "500" : "0", currency: "USD", evidence: "Producer cost evidence" })),
  }
  const saved = JSON.parse(JSON.stringify(draft))
  assert.deepEqual(calculationCurrencies(saved), ["USD"])
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).result.totals, null)
  const run = calculationFromDraft(saved, [{ ...ref, currency: "USD", rate: "2", direction: "currency_units_per_gbp" }], ref.retrievedAt)
  assert.equal(run.result.lines[0].customsValue, "750.00")
  assert.equal(run.result.lines[0].duty, "75.00")
  assert.deepEqual(run.input.items[0].computedValueWorksheet, saved.dutyCalculationSetup.items.one.computedValueWorksheet)
  saved.items[0].customsValuationMethod = "1"
  assert.deepEqual(calculationCurrencies(saved), [])
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt).input.items[0].computedValueWorksheet, undefined)
})
test("saved invoice and selected-item cost scope survives serialisation without leaking", () => {
  const draft = scopedDraft()
  const calculate = () => calculationFromDraft(JSON.parse(JSON.stringify(draft)), [], ref.retrievedAt).result
  assert.deepEqual(calculate().lines.map(l => l.customsValue), ["100.00", "150.00"])
  draft.dutyCalculationSetup.costs["import-freight"].scope = { type: "items", itemIds: ["one"] }
  assert.deepEqual(calculate().lines.map(l => l.customsValue), ["150.00", "100.00"])
  for (const scope of [{ type: "invoice", invoiceId: "deleted" }, { type: "items", itemIds: ["deleted"] }, { type: "items", itemIds: [] }]) {
    draft.dutyCalculationSetup.costs["import-freight"].scope = scope
    assert.equal(calculate().totals, null)
    assert.match(calculate().issues.join(), /scope is no longer valid/)
  }
})
test("saved item costs remain on their own line and cannot duplicate header adjustments", () => {
  const draft = scopedDraft(); draft.importAdjustments = []
  draft.items.forEach(i => { i.valuationAdjustments = [{ id: "same-row-id", code: "AK", amount: "10", currency: "GBP" }] })
  const rows = calculationCostRows(draft)
  assert.equal(new Set(rows.map(r => r.id)).size, 2)
  for (const row of rows) draft.dutyCalculationSetup.costs[row.id] = { evidence: "Insurance invoice", includedInPrice: false, scope: { type: "declaration" } }
  const r = calculationFromDraft(draft, [], ref.retrievedAt)
  assert.deepEqual(r.input.costs.map(c => c.scope), [{ type: "items", itemIds: ["one"] }, { type: "items", itemIds: ["two"] }])
  assert.deepEqual(r.result.lines.map(l => l.customsValue), ["110.00", "110.00"])
  draft.importAdjustments = [{ id: "import-insurance", code: "AK", amount: "20", currency: "GBP" }]
  draft.dutyCalculationSetup.costs["import-insurance"] = { evidence: "Header insurance", includedInPrice: false }
  const duplicate = calculationFromDraft(draft, [], ref.retrievedAt).result
  assert.equal(duplicate.totals, null); assert.match(duplicate.issues.join(), /both header and item level/)
})

const tariffRequest = { code: "8536909500", origin: "CN", date: "2026-09-14", dataset: "uk" }

test("NI standard selection separates EU duties from the UK VAT graph without dropping excise or additional EU duties", () => {
  const uk = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const xi = parseTariffSnapshot(tariffFixture(), { ...tariffRequest, dataset: "xi" }, ref.retrievedAt)
  const baseline = xi.measures[0]
  const alternative = (id, typeCode, preferenceCode) => ({ ...baseline, id, typeCode, preferenceCode, conditions: [{ id: "proof", type: "measure_condition", attributes: {} }] })
  xi.measures.push(alternative("preference", "142", "300"), alternative("airworthiness", "119", "119"), alternative("end-use", "117", "140"))
  uk.measures.push(alternative("uk-remedy", "551", undefined))
  const before = JSON.stringify([xi, uk])
  const select = () => standardTariffSelection(xi, uk, [], { jurisdiction: "NI", preferenceCode: "100" })
  assert.deepEqual(select().issues, [])
  assert.equal(select().duty.id, baseline.id)
  assert.equal(select().notClaimed.length, 3)
  assert.equal(JSON.stringify([xi, uk]), before)
  uk.measures.at(-1).excise = true
  assert.equal(select().duty, null, "UK excise must still be resolved")
  uk.measures.at(-1).excise = false
  uk.measures.at(-1).typeCode = "unknown"
  assert.equal(select().duty, null, "Unknown UK fiscal measures must not be assumed to be customs duty")
  uk.measures.at(-1).typeCode = "551"
  for (const typeCode of ["107", "551", "696", "unknown"]) {
    xi.measures.push({ ...baseline, id: "additional", typeCode })
    assert.equal(select().duty, null, `EU measure ${typeCode} cannot be discarded`)
    xi.measures.pop()
  }
  xi.measures.at(-1).preferenceCode = undefined
  assert.equal(select().duty, null, "An uncorrelated relief remains unresolved")
})

test("XI supplementary unit import is non-monetary only for the exact expression-99 shape", () => {
  const uk = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const xi = parseTariffSnapshot(tariffFixture(), { ...tariffRequest, dataset: "xi" }, ref.retrievedAt)
  const unit = { ...xi.measures[0], id: "unit", typeCode: "110", components: [{ id: "quantity", type: "measure_component", attributes: { duty_expression_id: "99", duty_amount: null, measurement_unit_code: "NAR" } }] }
  xi.measures.push(unit)
  assert.ok(standardTariffSelection(xi, uk).duty)
  unit.components[0].attributes.duty_amount = "3"
  assert.equal(standardTariffSelection(xi, uk).duty, null)
})

test("temporary low-value exclusion requires dated non-distance-sale evidence and the exact official measure shape", () => {
  const request = { ...tariffRequest, date: "2026-09-15" }
  const uk = parseTariffSnapshot(tariffFixture(), request, ref.retrievedAt)
  const xi = parseTariffSnapshot(tariffFixture(), { ...request, dataset: "xi" }, ref.retrievedAt)
  const low = { ...xi.measures[0], id: "low-value", typeCode: "107", components: [{ id: "fee", type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: "3", monetary_unit_code: "EUR" } }] }
  xi.measures.push(low)
  const review = { basis: "not-distance-sale", reviewDate: request.date, consignmentReference: "Consignment fixture", evidence: "Synthetic contract review" }
  const select = (r = review) => standardTariffSelection(xi, uk, [], { jurisdiction: "NI", preferenceCode: "100", lowValueExclusion: r })
  assert.deepEqual(select().issues, [])
  assert.match(select().notClaimed[0].reason, /Consignment fixture.*Synthetic contract review/)
  for (const change of [{ basis: "distance-sale" }, { reviewDate: "2026-09-14" }, { reviewDate: "2026-09-16" }, { consignmentReference: " " }, { evidence: "" }]) assert.equal(select({ ...review, ...change }).duty, null)
  for (const attrs of [{ duty_amount: "4" }, { monetary_unit_code: "GBP" }, { measurement_unit_code: "NAR" }, { duty_expression_id: "99" }]) {
    const original = { ...low.components[0].attributes }
    Object.assign(low.components[0].attributes, attrs)
    assert.equal(select().duty, null)
    low.components[0].attributes = original
  }
  low.conditions.push({ id: "condition", type: "measure_condition", attributes: {} })
  assert.equal(select().duty, null)
})

test("NI normal release after total TA relief uses release-date official measures and preserves B00/B05", () => {
  const request = { ...tariffRequest, date: "2026-09-15" }, retrieved = "2026-09-15T12:00:00Z"
  const uk = parseTariffSnapshot(tariffFixture(), request, retrieved)
  const xiRaw = tariffFixture(); xiRaw.included.find(row => row.id === "duty-component").attributes.duty_amount = "12"
  const xi = parseTariffSnapshot(xiRaw, { ...request, dataset: "xi" }, retrieved)
  xi.measures = xi.measures.filter(measure => !measure.vat)
  const review = { event: "normal-release", priorRelief: "total", entryDate: "2025-03-01", entryReference: "Synthetic original TA", entryItemReference: "1", authorisationEvidence: "Synthetic compliant authorisation/discharge", goodsIdentityEvidence: "Synthetic goods identity", releaseValuationEvidence: "Synthetic release sale, includes original costs", releaseRiskEvidence: "Synthetic EU at-risk review at release", noPreviousTaxPaidConfirmed: true, noProcessingConfirmed: true }
  const draft = { direction: "import", declarationCategory: "H1", declarationType: "A", customsConversionDate: request.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "one", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10", customsValuationMethod: "1", procedureCode: "4053", preferenceCode: "100", additionalProcedureCode: "000", commodityCode: request.code, nonPreferentialOrigin: request.origin }], dutyCalculationSetup: { jurisdiction: "NI", movement: "rest-of-world-to-NI", riskStatus: "at-risk", niTariff: "EU", niTreatmentEvidence: "Synthetic reviewed release treatment", niTemporaryRelease: { one: review } } }
  const run = value => calculationFromDraft(value, [], retrieved, { one: xi }, { one: uk })
  const before = structuredClone(draft), result = run(draft)
  assert.deepEqual(result.result.issues, [])
  assert.equal(result.result.lines[0].customsValue, "1000.00")
  assert.equal(result.result.lines[0].duty, "120.00")
  assert.equal(result.result.lines[0].vat, "224.00")
  assert.deepEqual(result.result.lines[0].vatTaxes.map(tax => [tax.taxType, tax.amount]), [["B00", "200.00"], ["B05", "24.00"]])
  assert.match(result.input.items[0].procedureEvidence, /release calculation date 2026-09-15/)
  assert.equal(result.result.autoPopulationAllowed, false)
  assert.deepEqual(draft, before)
  for (const change of [
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.priorRelief = "partial" },
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.event = "breach" },
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.noPreviousTaxPaidConfirmed = false },
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.noProcessingConfirmed = false },
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.releaseRiskEvidence = "" },
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.entryDate = "2027-01-01" },
    d => { d.dutyCalculationSetup.niTemporaryRelease.one.entryDate = "2025-02-30" },
    d => { delete d.dutyCalculationSetup.niTemporaryRelease },
    d => { d.declarationCategory = "H5" },
    d => { d.declarationType = "Z" },
    d => { d.items[0].additionalProcedureCode = "F01" },
    d => { d.dutyCalculationSetup.riskStatus = "not-at-risk" },
  ]) { const changed = structuredClone(draft); change(changed); assert.equal(run(changed).result.totals, null) }
  const manual = structuredClone(draft); manual.dutyCalculationSetup.items = { one: { dutyRate: "12", vatRate: "20", evidence: "Operator rate" } }
  assert.equal(calculationFromDraft(manual, [], retrieved).result.totals, null)
})

function tariffFixture() {
  const included = []
  for (const [id, typeCode, rate, vat] of [["duty", "103", 6, false], ["vat", "305", 20, true]]) {
    const links = {}
    for (const [name, type, resourceId, attributes] of [
      ["measure_type", "measure_type", typeCode, { description: vat ? "VAT" : "Third country duty" }],
      ["geographical_area", "geographical_area", `${id}-area`, {}],
      ["duty_expression", "duty_expression", `${id}-expression`, { base: `${rate} %` }],
      ["measure_components", "measure_component", `${id}-component`, { duty_expression_id: "01", duty_amount: rate }],
    ]) {
      included.push({ id: resourceId, type, attributes })
      links[name] = { data: name === "measure_components" ? [{ id: resourceId, type }] : { id: resourceId, type } }
    }
    included.push({ id, type: "measure", attributes: { import: true, effective_start_date: "2026-01-01", effective_end_date: null, vat }, relationships: links })
  }
  return { data: { id: "commodity", type: "commodity", attributes: { goods_nomenclature_item_id: tariffRequest.code, declarable: true, validity_start_date: "2020-01-01" }, relationships: { import_measures: { data: [{ type: "measure", id: "duty" }, { type: "measure", id: "vat" }] } } }, included }
}
test("official tariff retains raw source, selects structured percentages and rejects graph mismatches", () => {
  const raw = tariffFixture(), snapshot = parseTariffSnapshot(raw, tariffRequest, ref.retrievedAt)
  assert.equal(snapshot.raw, raw); assert.equal(standardTariffSelection(snapshot).duty.percentage, "6")
  assert.equal(standardTariffSelection(snapshot).vat.percentage, "20")
  assert.equal(new URL(snapshot.sourceUrl).searchParams.get("filter[geographical_area_id]"), "CN")
  assert.equal(new URL(snapshot.sourceUrl).searchParams.get("as_of"), tariffRequest.date)
  raw.included.push(raw.included[0]); assert.throws(() => parseTariffSnapshot(raw, tariffRequest, ref.retrievedAt), /duplicate/)
  assert.throws(() => tariffUrl({ ...tariffRequest, dataset: "evil" }))
})
test("tariff validity rejects malformed expiry evidence and respects inclusive boundaries", () => {
  const parse = raw => parseTariffSnapshot(raw, tariffRequest, ref.retrievedAt)
  for (const invalid of [false, 20260930, {}, [], "not a date", "2026-02-30", "2026-09-14garbage", "2026-09-14T99:00:00Z"]) {
    const commodity = tariffFixture(); commodity.data.attributes.validity_end_date = invalid
    assert.throws(() => parse(commodity), /invalid validity date/)
    const measure = tariffFixture(); measure.included.find(row => row.type === "measure").attributes.effective_end_date = invalid
    assert.throws(() => parse(measure), /invalid validity date/)
  }
  for (const end of [undefined, null, "", tariffRequest.date, `${tariffRequest.date}T00:00:00.000Z`]) {
    const raw = tariffFixture(); raw.data.attributes.validity_end_date = end
    const duty = raw.included.find(row => row.type === "measure")
    duty.attributes.effective_start_date = tariffRequest.date
    duty.attributes.effective_end_date = end
    assert.equal(standardTariffSelection(parse(raw)).issues.length, 0)
  }
  const expired = tariffFixture()
  expired.included.find(row => row.type === "measure").attributes.effective_end_date = "2026-09-13"
  assert.throws(() => parse(expired), /outside the requested date/)
})
test("tariff audit stores repeated responses once without merging amendments or losing item links", () => {
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const items = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`item-${index}`, snapshot]))
  const evidence = retainTariffEvidence(items, { "item-0": snapshot })
  assert.equal(evidence.snapshots.length, 1)
  assert.equal(Object.keys(evidence.dutyByItem).length, 1000)
  assert.deepEqual(evidence.vatByItem["item-0"], evidence.dutyByItem["item-0"])
  assert.deepEqual(evidence.snapshots[0].snapshot.raw, snapshot.raw)
  assert.ok(JSON.stringify(evidence).length < JSON.stringify(items).length / 10)
  const amended = structuredClone(snapshot)
  amended.measures[0].percentage = "7"
  const distinct = retainTariffEvidence({ a: snapshot, b: amended, c: { error: "Reference unavailable" } }, {})
  assert.equal(distinct.snapshots.length, 2)
  assert.notEqual(distinct.dutyByItem.a.snapshotId, distinct.dutyByItem.b.snapshotId)
  assert.equal(distinct.dutyByItem.c.error, "Reference unavailable")
  const restored = JSON.parse(JSON.stringify(distinct))
  assert.equal(restored.snapshots.find(row => row.id === restored.dutyByItem.b.snapshotId).snapshot.measures[0].percentage, "7")
  assert.equal(retainTariffEvidence(undefined, {}).dutyByItem, null)
})
test("official selection does not omit additional fiscal or conditional measures", () => {
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  snapshot.measures.push({ ...snapshot.measures[0], id: "remedy", typeCode: "551", description: "Anti-dumping duty" })
  assert.equal(standardTariffSelection(snapshot).duty, null)
  snapshot.measures.pop(); snapshot.measures[0].conditions.push({ id: "required", type: "condition", attributes: {} })
  assert.equal(standardTariffSelection(snapshot).duty, null)
})
test("explicit GB preference 100 excludes an unclaimed preference but never an additional tax", () => {
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  snapshot.measures.push({ ...snapshot.measures[0], id: "preference", typeCode: "142", percentage: "0", description: "Tariff preference" })
  const selection = (jurisdiction = "GB", preferenceCode = "100") => standardTariffSelection(snapshot, snapshot, [], { jurisdiction, preferenceCode })
  assert.equal(standardTariffSelection(snapshot).duty, null)
  assert.equal(selection().duty.id, "duty")
  assert.match(selection().notClaimed[0].reason, /not claimed/)
  assert.equal(selection("GB", "300").duty, null)
  assert.equal(selection("NI").duty, null)
  for (const typeCode of ["696", "651", "652", "551", "143", "unknown"]) {
    snapshot.measures.push({ ...snapshot.measures[0], id: "additional", typeCode })
    assert.equal(selection().duty, null)
    snapshot.measures.pop()
  }
  snapshot.measures[0].conditions.push({ id: "required", type: "condition", attributes: {} })
  assert.equal(selection().duty, null)
})
test("full-rate GB duty leaves explicitly mapped preferential quotas unclaimed without dropping safeguards", () => {
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const quota = { ...snapshot.measures[0], id: "optional-quota", typeCode: "143", preferenceCode: "320", orderNumber: { id: "090001", type: "quota_order_number", attributes: {} }, conditions: [{ id: "origin-proof", type: "measure_condition", attributes: {} }] }
  snapshot.measures.push(quota)
  const select = () => standardTariffSelection(snapshot, snapshot, [], { jurisdiction: "GB", preferenceCode: "100" })
  assert.equal(select().duty.id, "duty")
  assert.ok(select().notClaimed.some(row => row.id === quota.id))
  assert.equal(snapshot.measures.at(-1), quota)
  for (const typeCode of ["696", "651", "652", "551"]) {
    snapshot.measures.push({ ...quota, id: "additional-duty", typeCode })
    assert.equal(select().duty, null)
    snapshot.measures.pop()
  }
  quota.preferenceCode = "unknown"
  assert.equal(select().duty, null)
})
test("ordinary GB duty retains but does not claim conditional airworthiness relief", () => {
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const relief = { ...snapshot.measures[0], id: "airworthiness", typeCode: "119", description: "Airworthiness tariff suspension", conditions: [{ id: "certificate", type: "measure_condition", attributes: {} }] }
  snapshot.measures.push(relief)
  const select = (jurisdiction = "GB", preferenceCode = "100") => standardTariffSelection(snapshot, snapshot, [], { jurisdiction, preferenceCode })
  assert.equal(select().duty.id, "duty")
  assert.match(select().notClaimed[0].reason, /airworthiness suspension not claimed/)
  assert.equal(snapshot.measures.at(-1), relief)
  assert.equal(relief.conditions.length, 1)
  assert.equal(standardTariffSelection(snapshot).duty, null)
  assert.equal(select("GB", "119").duty, null)
  assert.equal(select("NI").duty, null)
  relief.unresolved = ["missing:certificate"]
  assert.match(select().issues.join(), /unresolved measure evidence/)
  relief.unresolved = []
  snapshot.measures[0].conditions = relief.conditions
  assert.equal(select().duty, null)
})
test("saved item quantities drive official specific duties without borrowing another item's quantity", () => {
  const raw = tariffFixture()
  Object.assign(raw.included.find(row => row.id === "duty-component").attributes, { duty_amount: "26", monetary_unit_code: "GBP", measurement_unit_code: "HLT" })
  const snapshot = parseTariffSnapshot(raw, tariffRequest, ref.retrievedAt)
  assert.match(standardTariffSelection(snapshot).issues.join(), /evidenced quantity for HLT/)
  const draft = { direction: "import", customsConversionDate: tariffRequest.date, invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "one", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "1", procedureCode: "4000", customsValuationMethod: "1", preferenceCode: "100", commodityCode: tariffRequest.code, nonPreferentialOrigin: tariffRequest.origin }], dutyCalculationSetup: { jurisdiction: "GB", items: { one: { tariffQuantities: [{ quantity: "250", unit: "LTR", evidence: "Packing list volume fixture" }] } } } }
  const saved = JSON.parse(JSON.stringify(draft))
  const result = calculationFromDraft(saved, [], ref.retrievedAt, { one: snapshot })
  assert.equal(result.result.lines[0].duty, "65.00")
  assert.equal(result.result.lines[0].vat, "213.00")
  assert.equal(result.input.items[0].measures[0].family, "specific-compound")
  assert.equal(result.result.autoPopulationAllowed, false)
  saved.dutyCalculationSetup.items.other = saved.dutyCalculationSetup.items.one
  delete saved.dutyCalculationSetup.items.one
  assert.equal(calculationFromDraft(saved, [], ref.retrievedAt, { one: snapshot }).result.totals, null)
  snapshot.measures[0].conditions.push({ id: "condition", type: "measure_condition", attributes: {} })
  assert.equal(standardTariffSelection(snapshot, snapshot, draft.dutyCalculationSetup.items.one.tariffQuantities).duty, null)
})
test("incomplete additional tax references cannot disappear from the estimate", () => {
  const snapshot = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  snapshot.measures.push({ ...snapshot.measures[0], id: "excise", typeCode: "306", excise: true, series: "Q", components: [], percentage: null })
  assert.equal(standardTariffSelection(snapshot).duty, null)
  snapshot.measures[2] = { ...snapshot.measures[2], excise: false, series: "C", typeCode: "551" }
  assert.equal(standardTariffSelection(snapshot).duty, null)
  snapshot.measures[2] = { ...snapshot.measures[2], series: "", typeCode: "unknown", unresolved: ["missing:component"] }
  assert.match(standardTariffSelection(snapshot).issues.join(), /unresolved measure evidence/)
  const raw = tariffFixture()
  delete raw.included.find(r => r.id === "duty" && r.type === "measure").relationships.measure_type
  const missingType = parseTariffSnapshot(raw, tariffRequest, ref.retrievedAt)
  assert.ok(missingType.measures[0].unresolved.includes("required:measure_type"))
  assert.equal(standardTariffSelection(missingType).duty, null)
})
test("NI duty and VAT preserve distinct datasets and reject mismatched or missing source evidence", () => {
  const uk = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const xiRaw = tariffFixture()
  xiRaw.included.find(row => row.id === "duty-component").attributes.duty_amount = 12
  const xi = parseTariffSnapshot(xiRaw, { ...tariffRequest, dataset: "xi" }, ref.retrievedAt)
  xi.measures = xi.measures.filter(m => !m.vat)
  assert.equal(standardTariffSelection(xi).duty, null)
  assert.equal(standardTariffSelection(xi, uk).duty.percentage, "12")
  assert.equal(standardTariffSelection(xi, uk).vat.percentage, "20")
  const draft = scopedDraft(); draft.importAdjustments = []
  draft.dutyCalculationSetup = { jurisdiction: "NI", riskStatus: "at-risk", niTariff: "EU", movement: "rest-of-world-to-NI", niTreatmentEvidence: "Synthetic treatment decision, not legal certification" }
  draft.items.forEach(i => { i.commodityCode = tariffRequest.code; i.nonPreferentialOrigin = tariffRequest.origin })
  const dutySources = { one: xi, two: xi }, vatSources = { one: uk, two: uk }
  const calculated = calculationFromDraft(draft, [], ref.retrievedAt, dutySources, vatSources)
  assert.deepEqual(calculated.result.issues, [])
  assert.equal(calculated.result.lines[0].duty, "12.00")
  assert.equal(calculated.result.lines[0].vat, "22.40")
  assert.equal(calculated.result.autoPopulationAllowed, false)
  assert.match(calculated.input.items[0].measures[0].source, /\/xi\//)
  assert.match(calculated.input.items[0].vatReference.source, /\/uk\//)
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt, dutySources).result.totals, null)
  const wrongOrigin = { ...uk, request: { ...uk.request, origin: "US" } }
  assert.equal(standardTariffSelection(xi, wrongOrigin).duty, null)
  draft.dutyCalculationSetup.niTariff = "UK"
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt, dutySources, vatSources).result.totals, null)
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt, vatSources).input.items[0].measures[0].jurisdiction, "UK")
})
test("saved NI specific-duty drafts compare official measures after freight allocation", () => {
  const snapshot = (dataset, rate) => {
    const raw = tariffFixture()
    Object.assign(raw.included.find(row => row.id === "duty-component").attributes, { duty_amount: rate, monetary_unit_code: "GBP", measurement_unit_code: "KGM" })
    const parsed = parseTariffSnapshot(raw, { ...tariffRequest, dataset }, ref.retrievedAt)
    if (dataset === "xi") parsed.measures = parsed.measures.filter(measure => !measure.vat)
    return parsed
  }
  const uk = snapshot("uk", "2"), xi = snapshot("xi", "3")
  const facts = { movementEvidence: "Transport fixture", processing: { basis: "not-processed", evidence: "Unprocessed goods fixture" }, ukims: { eori: "XI123", reference: "UKIMS fixture", validFrom: "2026-09-01", revoked: false }, endUse: "NI", endUseEvidence: "Consumer fixture" }
  const draft = { direction: "import", customsConversionDate: tariffRequest.date, importerEori: "XI123", invoiceHeaders: [{ id: "invoice", currency: "GBP" }],
    items: [{ id: "one", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "30", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "100", commodityCode: tariffRequest.code, nonPreferentialOrigin: tariffRequest.origin }],
    importAdjustments: [{ id: "import-freight", code: "AP", amount: "500", currency: "GBP" }],
    dutyCalculationSetup: { jurisdiction: "NI", movement: "rest-of-world-to-NI", items: { one: { niRiskFacts: facts, tariffQuantities: [{ quantity: "30", unit: "KGM", evidence: "Packing list fixture" }] } }, costs: { "import-freight": { evidence: "Freight invoice fixture", includedInPrice: false } } },
  }
  const before = JSON.stringify(draft)
  const calculated = calculationFromDraft(draft, [], ref.retrievedAt, { one: xi }, { one: uk })
  assert.deepEqual(calculated.result.issues, [])
  assert.equal(calculated.result.lines[0].customsValue, "1500.00")
  assert.equal(calculated.result.lines[0].niRiskDecision.status, "not-at-risk")
  assert.equal(calculated.result.lines[0].duty, "60.00")
  assert.equal(calculated.result.lines[0].vat, "312.00")
  assert.ok(calculated.result.lines[0].niComparisonWorkings.eu.length)
  assert.equal(calculated.input.items[0].measures.length, 0)
  assert.ok(calculated.input.items[0].niDutyComparison)
  assert.equal(JSON.stringify(draft), before)
  assert.equal(calculated.result.autoPopulationAllowed, false)
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt, { one: xi }).result.totals, null)
  draft.importAdjustments = []
  const noFreight = calculationFromDraft(draft, [], ref.retrievedAt, { one: xi }, { one: uk })
  assert.equal(noFreight.result.lines[0].niRiskDecision.status, "at-risk")
  assert.equal(noFreight.result.lines[0].duty, "90.00")
})
test("NI paired references derive each item's tariff without changing its shared-cost allocation", () => {
  const uk = parseTariffSnapshot(tariffFixture(), tariffRequest, ref.retrievedAt)
  const raw = tariffFixture(); raw.included.find(row => row.id === "duty-component").attributes.duty_amount = "8"
  const xi = parseTariffSnapshot(raw, { ...tariffRequest, dataset: "xi" }, ref.retrievedAt)
  xi.measures = xi.measures.filter(measure => !measure.vat)
  const facts = { movementEvidence: "Transport evidence fixture", processing: { basis: "not-processed", evidence: "Unprocessed goods fixture" }, ukims: { eori: "XI123", reference: "UKIMS authorisation fixture", validFrom: "2026-09-01", revoked: false }, endUse: "NI", endUseEvidence: "NI final-use fixture" }
  const context = { date: tariffRequest.date, movement: "rest-of-world-to-NI", importerEori: "XI123", preferenceCode: "100" }
  const choice = selectNiImportTariff(uk, xi, facts, context)
  assert.deepEqual(choice.issues, [])
  assert.equal(choice.selectedSnapshot, uk)
  assert.match(choice.riskInput.euDuty.reference, /\/xi\//)
  const draft = scopedDraft(); draft.importerEori = "XI123"
  draft.items.forEach(item => { item.commodityCode = tariffRequest.code; item.nonPreferentialOrigin = tariffRequest.origin })
  Object.assign(draft.dutyCalculationSetup, { jurisdiction: "NI", movement: "rest-of-world-to-NI", riskStatus: "not-at-risk", niTariff: "UK" })
  draft.dutyCalculationSetup.items = { one: { niRiskFacts: facts }, two: { niRiskFacts: { ...facts, endUse: "other" } } }
  const calculated = calculationFromDraft(JSON.parse(JSON.stringify(draft)), [], ref.retrievedAt, { one: xi, two: xi }, { one: uk, two: uk })
  assert.deepEqual(calculated.result.issues, [])
  assert.deepEqual(calculated.result.lines.map(line => line.niRiskDecision.status), ["not-at-risk", "at-risk"])
  assert.deepEqual(calculated.input.items.map(item => item.measures[0].jurisdiction), ["UK", "EU"])
  assert.deepEqual(calculated.result.lines.map(line => line.duty), ["6.00", "12.00"])
  assert.deepEqual(calculated.result.totals, { duty: "18.00", vat: "53.60" })
  assert.equal(calculated.result.autoPopulationAllowed, false)
  assert.ok(calculated.input.items.every(item => item.vatReference.source.includes("/uk/")))
  draft.importerEori = "XI456"
  assert.match(calculationFromDraft(draft, [], ref.retrievedAt, { one: xi, two: xi }, { one: uk, two: uk }).result.issues.join(), /importer EORI/)
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt, { one: xi, two: xi }).result.totals, null)
  assert.match(selectNiImportTariff(uk, xi, facts, { ...context, preferenceCode: "300" }).issues.join(), /claimed preference/)
  assert.match(selectNiImportTariff(uk, { ...xi, request: { ...xi.request, origin: "US" } }, facts, context).issues.join(), /matching UK and XI/)
  xi.measures.push({ ...xi.measures[0], id: "remedy", typeCode: "551" })
  assert.match(selectNiImportTariff(uk, xi, facts, context).issues.join(), /Additional/)
})
test("NI preferential comparison requires separate UK and EU proof and retains both rate bases", () => {
  const make = (dataset, rate) => {
    const raw = tariffFixture()
    raw.included.find(row => row.id === "duty-component").attributes.duty_amount = rate
    const snapshot = parseTariffSnapshot(raw, { ...tariffRequest, dataset }, ref.retrievedAt)
    if (dataset === "xi") snapshot.measures = snapshot.measures.filter(m => !m.vat)
    const duty = snapshot.measures.find(m => m.typeCode === "103")
    Object.assign(duty, { typeCode: "142", preferenceCode: "300", legalActs: [{ id: `synthetic-${dataset}-agreement`, type: "legal_act", attributes: {} }] })
    return snapshot
  }
  const uk = make("uk", "0"), xi = make("xi", "4")
  const proof = dataset => ({ preferenceCode: "300", dataset, origin: tariffRequest.origin, validFrom: tariffRequest.date, validTo: tariffRequest.date, proofReference: `Synthetic ${dataset} origin proof`, originRulesEvidence: `Synthetic ${dataset} agreement review`, transportEvidence: "Synthetic non-alteration review" })
  const facts = { movementEvidence: "Synthetic overseas route", processing: { basis: "not-processed", evidence: "Synthetic no processing" }, endUse: "NI", endUseEvidence: "Synthetic final use" }
  const context = { date: tariffRequest.date, movement: "rest-of-world-to-NI", importerEori: "XI123", preferenceCode: "300", pairedPreferences: { uk: proof("uk"), xi: proof("xi") } }
  const before = JSON.stringify({ uk, xi, facts, context })
  const selected = selectNiImportTariff(uk, xi, facts, context)
  assert.deepEqual(selected.issues, [])
  assert.equal(selected.decision.status, "at-risk")
  assert.equal(selected.selectedSnapshot, xi)
  const prepared = prepareNiDutyComparison(uk, xi, facts, context, [])
  assert.equal(prepared.comparison.uk.components[0].rate, "0")
  assert.equal(prepared.comparison.eu.components[0].rate, "4")
  assert.ok(prepared.comparison.uk.evidence.some(value => value.includes("Synthetic uk origin proof")))
  assert.ok(prepared.comparison.eu.evidence.some(value => value.includes("Synthetic xi origin proof")))
  assert.equal(JSON.stringify({ uk, xi, facts, context }), before)
  const draft = scopedDraft()
  draft.importerEori = "XI123"
  draft.items.forEach(item => Object.assign(item, { commodityCode: tariffRequest.code, nonPreferentialOrigin: tariffRequest.origin, preferentialOrigin: tariffRequest.origin, preferenceCode: "300" }))
  Object.assign(draft.dutyCalculationSetup, { jurisdiction: "NI", movement: "rest-of-world-to-NI", rateSource: "official", items: { one: { niRiskFacts: facts }, two: { niRiskFacts: facts } }, niPreferences: { one: context.pairedPreferences, two: context.pairedPreferences } })
  const savedBefore = JSON.stringify(draft)
  const saved = calculationFromDraft(draft, [], ref.retrievedAt, { one: xi, two: xi }, { one: uk, two: uk })
  assert.deepEqual(saved.result.issues, [])
  assert.deepEqual(saved.result.lines.map(line => line.duty), ["4.00", "6.00"])
  assert.deepEqual(saved.result.totals, { duty: "10.00", vat: "52.00" })
  assert.deepEqual(saved.result.preferenceOptions.filter(row => row.itemId === "one").map(row => row.dataset).sort(), ["uk", "xi"])
  assert.ok(saved.input.items.every(item => item.preferenceEvidence.includes("Synthetic xi origin proof") && item.preferenceEvidence.includes("Synthetic uk origin proof")))
  assert.equal(JSON.stringify(draft), savedBefore)
  assert.equal(saved.result.autoPopulationAllowed, false)
  delete draft.dutyCalculationSetup.niPreferences.one
  assert.equal(calculationFromDraft(draft, [], ref.retrievedAt, { one: xi, two: xi }, { one: uk, two: uk }).result.totals, null)
  for (const pairedPreferences of [undefined, { uk: proof("uk") }, { uk: proof("uk"), xi: proof("uk") }, { uk: proof("uk"), xi: { ...proof("xi"), proofReference: "" } }, { uk: proof("uk"), xi: { ...proof("xi"), validTo: "2020-01-01" } }]) {
    assert.ok(selectNiImportTariff(uk, xi, facts, { ...context, pairedPreferences }).issues.length)
    assert.throws(() => prepareNiDutyComparison(uk, xi, facts, { ...context, pairedPreferences }, []))
  }
  assert.match(selectNiImportTariff(uk, xi, facts, { ...context, preferenceCode: "100" }).issues.join(), /Remove or update/)
  // HMRC NI mismatch: DE 4/17 remains UK, EUPRF carries the EU code.
  for (const fullRateDataset of ["uk", "xi"]) {
    const mixedUk = make("uk", fullRateDataset === "uk" ? "4" : "0")
    const mixedXi = make("xi", fullRateDataset === "xi" ? "4" : "0")
    Object.assign((fullRateDataset === "uk" ? mixedUk : mixedXi).measures.find(m => m.typeCode === "142"), { typeCode: "103", preferenceCode: undefined })
    const mixedDraft = scopedDraft()
    mixedDraft.headerAdditionalInformationCode = "NIIMP"
    const ukCode = fullRateDataset === "uk" ? "100" : "300", xiCode = fullRateDataset === "xi" ? "100" : "300"
    const review = fullRateDataset === "uk" ? { xi: proof("xi") } : { uk: proof("uk") }
    mixedDraft.items.forEach(item => Object.assign(item, { commodityCode: tariffRequest.code, nonPreferentialOrigin: tariffRequest.origin, preferentialOrigin: tariffRequest.origin, preferenceCode: ukCode, additionalInformationStatements: [{ id: "eu-code", statementCode: "EUPRF", statementDescription: xiCode }] }))
    Object.assign(mixedDraft.dutyCalculationSetup, { jurisdiction: "NI", movement: "rest-of-world-to-NI", rateSource: "official", items: { one: { niRiskFacts: facts }, two: { niRiskFacts: facts } }, niPreferences: { one: review, two: review } })
    const original = JSON.stringify(mixedDraft)
    const run = () => calculationFromDraft(mixedDraft, [], ref.retrievedAt, { one: mixedXi, two: mixedXi }, { one: mixedUk, two: mixedUk })
    const mixed = run()
    assert.deepEqual(mixed.result.issues, [])
    assert.deepEqual(mixed.result.lines.map(line => line.duty), ["4.00", "6.00"])
    assert.equal(mixed.result.lines[0].niRiskDecision.status, fullRateDataset === "uk" ? "not-at-risk" : "at-risk")
    assert.deepEqual(mixed.result.preferenceOptions.map(row => row.dataset), fullRateDataset === "uk" ? ["xi", "xi"] : ["uk", "uk"])
    assert.equal(mixed.result.autoPopulationAllowed, false)
    assert.equal(JSON.stringify(mixedDraft), original)
    delete mixedDraft.headerAdditionalInformationCode
    assert.equal(run().result.totals, null, "EUPRF without NIIMP cannot silently select another tariff")
    mixedDraft.headerAdditionalInformationCode = "NIIMP"
    mixedDraft.items[0].additionalInformationStatements.push({ id: "duplicate", statementCode: "EUPRF", statementDescription: xiCode })
    assert.equal(run().result.totals, null, "Duplicate statements must not be first-wins")
  }
  xi.measures.push({ ...xi.measures[0], id: "unresolved-remedy", typeCode: "551", preferenceCode: undefined })
  assert.ok(selectNiImportTariff(uk, xi, facts, context).issues.length, "Preference must not discard additional duties")
})

test("NI preference-code resolver rejects incomplete, foreign and quota overrides", () => {
  const item = { jurisdiction: "NI", preferenceCode: "300", headerAdditionalInformationCode: "NIIMP", additionalInformationStatements: [{ statementCode: "EUPRF", statementDescription: "100" }] }
  assert.deepEqual(niPreferenceCodes(item), { uk: "300", xi: "100", issues: [] })
  assert.deepEqual(niPreferenceCodes({ ...item, additionalInformationStatements: [] }), { uk: "300", xi: "300", issues: [] })
  for (const override of [{ jurisdiction: "GB" }, { headerAdditionalInformationCode: "" }, { preferenceCode: "320" }, { additionalInformationStatements: [{ statementCode: "EUPRF", statementDescription: "100 300" }] }, { additionalInformationStatements: [{ statementCode: "EUPRF", statementDescription: "" }] }, { additionalInformationStatements: [{ statementCode: "EUPRF", statementDescription: "320" }] }]) assert.ok(niPreferenceCodes({ ...item, ...override }).issues.length)
  assert.deepEqual(niPreferenceCodes({ ...item, headerAdditionalInformationCode: "", additionalInformationStatements: [...item.additionalInformationStatements, { statementCode: "NIIMP" }] }).issues, [])
})

test("NI percentage and specific comparisons use the item's evidenced UK VAT choice", () => {
  for (const specific of [false, true]) {
    const snapshot = (dataset, rate) => {
      const raw = tariffFixture()
      Object.assign(raw.included.find(row => row.id === "duty-component").attributes, { duty_amount: rate, ...(specific ? { monetary_unit_code: "GBP", measurement_unit_code: "KGM" } : {}) })
      const parsed = parseTariffSnapshot(raw, { ...tariffRequest, dataset }, ref.retrievedAt)
      if (dataset === "xi") parsed.measures = parsed.measures.filter(m => !m.vat)
      return parsed
    }
    const uk = snapshot("uk", specific ? "2" : "4"), xi = snapshot("xi", specific ? "3" : "8")
    const standardVat = uk.measures.find(m => m.vat)
    for (const [code, rate] of [["VATZ", "0"], ["VATR", "5"]]) uk.measures.push({ ...structuredClone(standardVat), id: code, percentage: rate, additionalCode: { id: code, type: "additional_code", attributes: { code } }, components: [{ id: code, type: "measure_component", attributes: { duty_expression_id: "01", duty_amount: rate } }] })
    const facts = { movementEvidence: "Synthetic overseas transport", processing: { basis: "not-processed", evidence: "Synthetic unprocessed goods" }, ukims: { eori: "XI123", reference: "Synthetic UKIMS", validFrom: "2026-09-01", revoked: false }, endUse: "NI", endUseEvidence: "Synthetic final use" }
    const draft = { direction: "import", customsConversionDate: tariffRequest.date, importerEori: "XI123", invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "one", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "30", customsValuationMethod: "1", procedureCode: "4000", preferenceCode: "100", commodityCode: tariffRequest.code, nonPreferentialOrigin: tariffRequest.origin }], dutyCalculationSetup: { jurisdiction: "NI", movement: "rest-of-world-to-NI", items: { one: { niRiskFacts: facts, tariffQuantities: [{ quantity: "30", unit: "KGM", evidence: "Synthetic packing list" }] } } } }
    const run = () => calculationFromDraft(draft, [], ref.retrievedAt, { one: xi }, { one: uk })
    const standard = run()
    assert.deepEqual(standard.result.issues, [])
    assert.equal(standard.result.lines[0].vat, specific ? "218.00" : "216.00")
    draft.items[0].nationalCode = "VATZ"
    assert.equal(run().result.totals, null, "Zero rate cannot bypass eligibility review")
    draft.dutyCalculationSetup.vatReviews = { one: { code: "VATZ", evidence: "Synthetic eligible product review" } }
    const before = JSON.stringify(draft), zero = run()
    assert.deepEqual(zero.result.issues, [])
    assert.equal(zero.result.lines[0].vat, "0.00")
    assert.equal(zero.input.items[0].vatReference.reference, "VATZ")
    assert.ok(zero.input.items[0].vatReference.source.includes("/uk/"))
    const measures = specific ? Object.values(zero.input.items[0].niDutyComparison).filter(m => m.evidence) : zero.input.items[0].measures
    assert.ok(measures.every(m => m.evidence.some(e => e.includes("Synthetic eligible product review"))))
    assert.equal(JSON.stringify(draft), before)
    draft.items[0].nationalCode = "VATR"
    assert.equal(run().result.totals, null, "Changed codes invalidate previous evidence")
    draft.dutyCalculationSetup.vatReviews.one.code = "VATR"
    assert.equal(run().result.lines[0].vat, specific ? "54.50" : "54.00")
    draft.items[0].additionalNationalCodes = [{ code: "VATZ" }]
    assert.equal(run().result.totals, null, "Conflicting VAT codes are blocked")
    assert.equal(zero.result.autoPopulationAllowed, false)
  }
})
test("managed tariff client renews authentication once and never returns credentials in evidence", async () => {
  let tokens = 0, calls = 0
  const client = createTariffClient({ clientId: "fixture-client", clientSecret: "fixture-secret" }, async (url, init) => {
    if (url.includes("oauth2/token")) { tokens++; return new Response(JSON.stringify({ access_token: `fixture-token-${tokens}`, expires_in: 86400 })) }
    calls++; assert.equal(init.redirect, "error"); assert.match(init.headers.Authorization, /^Bearer fixture-token-/)
    return calls === 1 ? new Response("", { status: 401 }) : new Response(JSON.stringify(tariffFixture()))
  })
  const result = await client(tariffRequest)
  assert.equal(tokens, 2); assert.equal(calls, 2)
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|fixture-token/)
  await client(tariffRequest); assert.equal(tokens, 2)
})
