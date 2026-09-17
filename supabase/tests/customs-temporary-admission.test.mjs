import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const { buildSync } = require("esbuild")
const built = buildSync({ entryPoints: [new URL("../functions/_shared/customs-temporary-admission.mts", import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
const module = { exports: {} }; new Function("module", "exports", built)(module, module.exports)
const { temporaryAdmissionDutyLedger: ledger, temporaryAdmissionReleaseBalance: release } = module.exports
const fixture = () => ({ jurisdiction: "GB", event: "entry", entryAssessmentId: "entry-fixture", entryItemId: "item-1", entryDutyGbp: "1000", fullAuthorisationEvidence: "Fixture authorisation", eligibilityEvidence: "Fixture eligibility review", periodEvidence: "First chargeable period", chargeableMonths: 1, previouslyAssessedDutyGbp: "0", previousAssessmentEvidence: "Entry event: no prior TA assessment" })
const draftBuilt = buildSync({ entryPoints: [new URL("../functions/_shared/customs-calculation-draft.mts", import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
const draftModule = { exports: {} }; new Function("module", "exports", draftBuilt)(draftModule, draftModule.exports)
const { calculationFromDraft } = draftModule.exports

test("saved item worksheets produce retained duty workings without populating tax totals", () => {
  const draft = { direction: "import", customsConversionDate: "2026-09-15", invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "1", customsValuationMethod: "1", procedureCode: "5300", preferenceCode: "100" }], dutyCalculationSetup: { jurisdiction: "GB", movement: "rest-of-world-to-GB", temporaryAdmission: { item: fixture() }, items: { item: { dutyRate: "12", vatRate: "20", evidence: "Fixture rates" } } } }
  const saved = JSON.parse(JSON.stringify(draft))
  let result = calculationFromDraft(saved, [], "2026-09-15T12:00:00Z").result
  assert.equal(result.temporaryAdmissionLedgers[0].itemId, "item")
  assert.equal(result.temporaryAdmissionLedgers[0].result.additionalDuty.displayedGbp, "30.00")
  assert.equal(result.totals, null)
  assert.equal(result.lines[0].duty, undefined)
  assert.equal(result.autoPopulationAllowed, false)
  assert.deepEqual(saved, draft)
  for (const mutate of [d => { d.direction = "export" }, d => { d.dutyCalculationSetup.jurisdiction = "NI" }, d => { d.items[0].procedureCode = "4000" }, d => { d.dutyCalculationSetup.temporaryAdmission.item.event = "discharge" }, d => { d.dutyCalculationSetup.temporaryAdmission.item.entryAssessmentId = "" }]) {
    const changed = structuredClone(draft); mutate(changed)
    result = calculationFromDraft(changed, [], "2026-09-15T12:00:00Z").result
    assert.equal(result.temporaryAdmissionLedgers[0].result, null)
    assert.ok(result.temporaryAdmissionLedgers[0].issues.length)
  }
  saved.items[0].procedureCode = "4053"
  saved.dutyCalculationSetup.temporaryAdmission.item = { ...fixture(), event: "discharge", chargeableMonths: 4, previouslyAssessedDutyGbp: "30" }
  result = calculationFromDraft(saved, [], "2026-09-15T12:00:00Z").result
  assert.equal(result.temporaryAdmissionLedgers[0].result, null)
  assert.match(result.temporaryAdmissionLedgers[0].issues.join(), /release liability less revenue already paid/)
  saved.dutyCalculationSetup.temporaryAdmissionRelease = { item: { jurisdiction: "GB", procedure: "4053", entryReference: "Synthetic entry", entryItemReference: "1", authorisationEvidence: "Synthetic authority", releaseAssessmentReference: "Synthetic release assessment", taxes: [{ taxType: "A00", releaseLiabilityGbp: "1000", previouslyPaidGbp: "120", paymentEvidence: "Synthetic receipt" }] } }
  result = calculationFromDraft(saved, [], "2026-09-15T12:00:00Z").result
  assert.equal(result.temporaryAdmissionReleases[0].result.taxes[0].remaining.displayedGbp, "880.00")
  assert.equal(result.totals, null)
  assert.equal(result.autoPopulationAllowed, false)
  saved.items[0].procedureCode = "4000"
  assert.equal(calculationFromDraft(saved, [], "2026-09-15T12:00:00Z").result.temporaryAdmissionReleases[0].result, null)
  // Deleted items cannot leave a phantom ledger attached to the declaration.
  saved.items = []
  assert.equal(calculationFromDraft(saved, [], "2026-09-15T12:00:00Z").result.temporaryAdmissionLedgers, undefined)
  assert.equal(calculationFromDraft(saved, [], "2026-09-15T12:00:00Z").result.temporaryAdmissionReleases, undefined)
})

test("entry duty and later balance remain separate from VAT and payment timing", () => {
  const entry = ledger(fixture())
  assert.equal(entry.additionalDuty.displayedGbp, "30.00")
  assert.equal(entry.vat, null)
  assert.equal(entry.autoPopulationAllowed, false)
  const discharge = ledger({ ...fixture(), event: "discharge", chargeableMonths: 4, previouslyAssessedDutyGbp: "30" })
  assert.equal(discharge.cumulativeDuty.displayedGbp, "120.00")
  assert.equal(discharge.additionalDuty.displayedGbp, "90.00")
})

test("4053 release reconciles each assessed tax against payments, not monthly partial duty", () => {
  const input = { jurisdiction: "GB", procedure: "4053", entryReference: "Synthetic entry", entryItemReference: "1", authorisationEvidence: "Synthetic authorisation", releaseAssessmentReference: "Synthetic release assessment", taxes: [
    { taxType: "A00", releaseLiabilityGbp: "1000", previouslyPaidGbp: "120", paymentEvidence: "Synthetic duty payment" },
    { taxType: "B00", releaseLiabilityGbp: "2200", previouslyPaidGbp: "2100", paymentEvidence: "Synthetic VAT payment" },
  ] }
  const before = JSON.stringify(input), result = release(input)
  assert.deepEqual(result.taxes.map(row => row.remaining.displayedGbp), ["880.00", "100.00"])
  assert.equal(result.autoPopulationAllowed, false)
  assert.equal(JSON.stringify(input), before)
  input.taxes[0].previouslyPaidGbp = "999"
  assert.equal(result.input.taxes[0].previouslyPaidGbp, "120")
  for (const patch of [{ jurisdiction: "NI" }, { procedure: "4453" }, { entryReference: "" }, { taxes: [] }, { taxes: [input.taxes[0], input.taxes[0]] }, { taxes: [{ ...input.taxes[0], previouslyPaidGbp: "1001" }] }, { taxes: [{ ...input.taxes[0], releaseLiabilityGbp: "-1" }] }, { taxes: [{ ...input.taxes[0], paymentEvidence: "" }] }]) assert.throws(() => release({ ...input, ...patch }))
})

test("duty is capped without inventing refunds or rounding intermediate amounts", () => {
  const capped = ledger({ ...fixture(), event: "discharge", chargeableMonths: 34, previouslyAssessedDutyGbp: "990" })
  assert.equal(capped.cumulativeDuty.displayedGbp, "1000.00")
  assert.equal(capped.additionalDuty.displayedGbp, "10.00")
  assert.equal(capped.cappedAtFullDuty, true)
  assert.deepEqual(ledger({ ...fixture(), entryDutyGbp: "0.01" }).additionalDuty.exact, { numerator: "3", denominator: "10000" })
  assert.throws(() => ledger({ ...fixture(), event: "discharge", previouslyAssessedDutyGbp: "31" }), /exceeds/)
})

test("release payment reconciliation never silently rounds entered evidence", () => {
  const input = { jurisdiction: "GB", procedure: "4053", entryReference: "Synthetic entry", entryItemReference: "1", authorisationEvidence: "Synthetic authorisation", releaseAssessmentReference: "Synthetic assessment", taxes: [{ taxType: "A00", releaseLiabilityGbp: "10.0100", previouslyPaidGbp: "0.010", paymentEvidence: "Synthetic payment" }] }
  const result = release(input)
  assert.equal(result.taxes[0].remaining.displayedGbp, "10.00")
  assert.equal(result.input.taxes[0].releaseLiabilityGbp, "10.0100")
  for (const field of ["releaseLiabilityGbp", "previouslyPaidGbp"]) {
    const changed = structuredClone(input)
    changed.taxes[0][field] = "0.001"
    const before = structuredClone(changed)
    assert.throws(() => release(changed), /fractions of a penny/)
    assert.deepEqual(changed, before)
  }
})

test("NI partial relief uses the retained entry basis and a discharge ledger, not GB entry collection", () => {
  const input = { ...fixture(), jurisdiction: "NI", event: "discharge", entryDutyGbp: "720", chargeableMonths: 3, niEntryBasisEvidence: "Synthetic retained XI assessment and GBP basis, no exchange conversion required" }
  const result = ledger(input)
  assert.equal(result.additionalDuty.displayedGbp, "64.80")
  assert.equal(result.ruleVersion, "ni-ta-partial-discharge-ledger-v1")
  assert.match(result.source, /taxation-customs.ec.europa.eu/)
  assert.equal(result.autoPopulationAllowed, false)
  assert.equal(result.vat, null)
  assert.throws(() => ledger({ ...input, event: "entry" }), /GB first-month/)
  assert.throws(() => ledger({ ...input, niEntryBasisEvidence: "" }), /tariff, risk and currency/)
  const draft = { direction: "import", customsConversionDate: "2026-09-15", invoiceHeaders: [{ id: "invoice", currency: "GBP" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "12000", grossMass: "1", customsValuationMethod: "1", procedureCode: "7153", preferenceCode: "100" }], dutyCalculationSetup: { jurisdiction: "NI", temporaryAdmission: { item: input }, items: { item: { dutyRate: "6", vatRate: "20", evidence: "Synthetic rates" } } } }
  const before = structuredClone(draft)
  const saved = calculationFromDraft(draft, [], "2026-09-15T12:00:00Z").result
  assert.equal(saved.temporaryAdmissionLedgers[0].result.additionalDuty.displayedGbp, "64.80")
  assert.equal(saved.totals, null)
  assert.deepEqual(draft, before)
  for (const procedureCode of ["4053", "4253", "4453"]) {
    const releaseDraft = structuredClone(draft); releaseDraft.items[0].procedureCode = procedureCode
    assert.match(calculationFromDraft(releaseDraft, [], "2026-09-15T12:00:00Z").result.temporaryAdmissionLedgers[0].issues.join(), /monthly partial-relief balance is not the release amount/)
  }
  draft.dutyCalculationSetup.jurisdiction = "GB"
  assert.match(calculationFromDraft(draft, [], "2026-09-15T12:00:00Z").result.temporaryAdmissionLedgers[0].issues.join(), /jurisdiction differs/)
})

test("missing evidence, invalid periods and other jurisdictions cannot imply relief", () => {
  for (const patch of [{ jurisdiction: "NI" }, { event: "release" }, { chargeableMonths: 0 }, { chargeableMonths: 1.5 }, { chargeableMonths: 2 }, { entryDutyGbp: "0" }, { previouslyAssessedDutyGbp: "-1" }, { entryAssessmentId: "" }, { eligibilityEvidence: "" }, { fullAuthorisationEvidence: "" }, { periodEvidence: "" }, { previousAssessmentEvidence: "" }]) {
    assert.throws(() => ledger({ ...fixture(), ...patch }))
  }
})
