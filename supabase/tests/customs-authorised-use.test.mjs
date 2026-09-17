import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseTariffSnapshot, standardTariffSelection } from '../functions/_shared/customs-tariff-reference.mts'
import { calculationFromDraft } from '../functions/_shared/customs-calculation-draft.mts'

const raw = JSON.parse(readFileSync(new URL('./fixtures/customs-authorised-oil-cn-20260915.json', import.meta.url), 'utf8'))
const request = { code: '1512191000', origin: 'CN', date: '2026-09-15', dataset: 'uk' }
const snapshot = () => parseTariffSnapshot(structuredClone(raw), request, '2026-09-15T01:00:00Z')
const review = () => ({ commodity: request.code, origin: 'CN', dataset: 'uk', measureId: '20284505', validFrom: '2026-01-01', validTo: '2026-12-31', completionDueDate: '2026-12-31', authorisationReference: 'GBEUSQA001', authorisationEvidence: 'Synthetic authorisation fixture, not a genuine authorisation', prescribedUseEvidence: 'Synthetic technical use only, not foodstuffs for human consumption', supervisionEvidence: 'Synthetic stock records and authorised-use completion controls' })
const treatment = () => ({ jurisdiction: 'GB', preferenceCode: '140', nationalCodes: [], authorisedUseReview: review(), authorisedUseDocuments: [{ code: 'N990', reference: 'GBEUSQA001' }] })

test('official N990 branch selects authorised-use duty independently of VAT and retains the full graph', () => {
  const source = snapshot(), before = structuredClone(source)
  const result = standardTariffSelection(source, source, [], treatment())
  assert.deepEqual(result.issues, [])
  assert.equal(result.duty.id, '20284505')
  assert.equal(result.vat.percentage, '20')
  assert.match(result.authorisedUseEvidence, /Completion is not confirmed/)
  assert.ok(result.notClaimed.some(row => row.id === '20121770'))
  assert.deepEqual(source, before)
})

test('missing or stale authorisation, waiver and changed conditions cannot select the reduced rate', () => {
  for (const change of [
    t => { delete t.authorisedUseReview },
    t => { t.authorisedUseReview.validTo = '2026-08-31' },
    t => { t.authorisedUseReview.completionDueDate = '2026-08-31' },
    t => { t.authorisedUseReview.prescribedUseEvidence = '' },
    t => { t.authorisedUseDocuments[0].reference = 'GBEUSOTHER' },
    t => { t.authorisedUseDocuments[0].status = 'XW' },
    t => { t.jurisdiction = 'NI' },
  ]) {
    const source = snapshot(), t = treatment(); change(t)
    assert.equal(standardTariffSelection(source, source, [], t).duty, null)
  }
  const source = snapshot(), selected = source.measures.find(row => row.id === '20284505')
  selected.conditions[0].attributes.condition_duty_amount = 5
  assert.equal(standardTariffSelection(source, source, [], treatment()).duty, null)
})

test('authorised use does not suppress unreviewed excise or additional fiscal measures', () => {
  for (const typeCode of ['306', '551', '651', '652', '696', '464']) {
    const source = snapshot()
    source.measures.push({ ...structuredClone(source.measures.find(row => row.id === '20284505')), id: 'extra-tax', typeCode, excise: typeCode === '306', conditions: [], preferenceCode: undefined })
    assert.equal(standardTariffSelection(source, source, [], treatment()).duty, null, typeCode)
  }
  const source = snapshot()
  source.measures.push({ ...structuredClone(source.measures.find(row => row.id === '20284505')), id: 'end-use-condition', typeCode: '464', series: 'O', components: [], preferenceCode: undefined })
  assert.equal(standardTariffSelection(source, source, [], treatment()).duty, null, 'condition-only end-use control must remain a blocker')
})

test('GB 4400 invoice estimate keeps VAT, original fields and supervision evidence separate', () => {
  const source = snapshot()
  const draft = { direction: 'import', declarationCategory: 'H1', declarationType: 'A', customsConversionDate: request.date,
    invoiceHeaders: [{ id: 'invoice', currency: 'GBP' }],
    items: [{ id: 'item', invoiceHeaderId: 'invoice', commodityCode: request.code, nonPreferentialOrigin: 'CN', procedureCode: '4400', additionalProcedureCode: '000', preferenceCode: '140', customsValuationMethod: '1', itemPrice: '1000', grossMass: '10', additionalDocumentCategory: 'N', additionalDocumentType: '990', additionalDocumentId: 'GBEUSQA001' }],
    dutyCalculationSetup: { jurisdiction: 'GB', rateSource: 'official', authorisedUses: { item: review() } },
  }
  const before = structuredClone(draft)
  const result = calculationFromDraft(draft, [], '2026-09-15T01:00:00Z', { item: source })
  assert.deepEqual(result.result.totals, { duty: '0.00', vat: '200.00' })
  assert.equal(result.result.autoPopulationAllowed, false)
  assert.deepEqual(draft, before)
  draft.items[0].additionalProcedureCode = '1SW'
  assert.equal(calculationFromDraft(draft, [], '2026-09-15T01:00:00Z', { item: source }).result.totals, null)
})
