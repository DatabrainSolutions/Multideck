import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareNiDutyMeasures } from '../functions/_shared/customs-ni-duty-comparison.mts'
import { Decimal } from '../functions/_shared/customs-calculation-decimal.mts'
import { selectTariffExchangeRate } from '../functions/_shared/customs-tariff-exchange-rate.mts'
import { calculateDuty } from '../functions/_shared/customs-duty-calculation.mts'

const facts = { date: '2026-09-14', movement: 'rest-of-world-to-NI', movementEvidence: 'Synthetic route', processing: { basis: 'not-processed', evidence: 'Synthetic end use' }, importerEori: 'XI123', euTradeRemedy: false, tradeRemedyEvidence: 'Complete synthetic measure review', ukims: { reference: 'Synthetic UKIMS', eori: 'XI123', validFrom: '2026-09-01', revoked: false }, endUse: 'NI', endUseEvidence: 'Synthetic consumer' }
const measure = (jurisdiction, rate) => ({ taxType: 'A00', family: 'specific-compound', jurisdiction, source: 'https://api.trade-tariff.service.gov.uk/', reference: jurisdiction, provenance: 'official-snapshot', validFrom: '2026-09-01', validTo: '2026-09-30', retrievedAt: '2026-09-14T12:00:00Z', evidence: ['Synthetic complete measure'], components: [{ type: 'specific', currency: 'GBP', rate, quantity: '30', unit: 'KGM', per: '1' }], includedInVatBase: true, disposition: 'payable' })
test('engine compares after freight allocation and preserves input plus both workings', () => {
  const input = { date: facts.date, jurisdiction: 'NI', movement: facts.movement, rates: [],
    items: [{ id: 'one', invoiceId: 'invoice', goodsValue: '1000', currency: 'GBP', grossMass: '30', valuationMethod: '1', families: ['ni'], measures: [], vatRate: '20', vatReference: measure('UK', '0'), niDutyComparison: { uk: measure('UK', '2'), eu: measure('EU', '3'), facts } }],
    costs: [{ id: 'freight', code: 'AP', amount: '500', currency: 'GBP', evidence: 'Synthetic freight', scope: { type: 'declaration' }, basis: 'value', includedInPrice: false, effect: 'both', operation: 'add' }],
  }
  const before = JSON.stringify(input), result = calculateDuty(input)
  assert.equal(result.lines[0].customsValue, '1500.00')
  assert.equal(result.lines[0].niRiskDecision.status, 'not-at-risk')
  assert.equal(result.lines[0].duty, '60.00')
  assert.equal(result.lines[0].vat, '312.00')
  assert.ok(result.lines[0].niComparisonWorkings.uk.length && result.lines[0].niComparisonWorkings.eu.length)
  assert.equal(JSON.stringify(input), before)
  input.costs = []
  const withoutFreight = calculateDuty(input)
  assert.equal(withoutFreight.lines[0].niRiskDecision.status, 'at-risk')
  assert.equal(withoutFreight.lines[0].duty, '90.00')
  input.items[0].measures = [measure('UK', '2')]
  assert.match(calculateDuty(input).lines[0].issues.join(), /not both/)
})
test('same exact customs value drives both specific duties and the three-point boundary', () => {
  const uk = measure('UK', '2'), eu = measure('EU', '3'), before = JSON.stringify([uk, eu, facts])
  const result = compareNiDutyMeasures(uk, eu, Decimal.parse('1000'), 'value-1', facts)
  assert.equal(result.decision.status, 'at-risk')
  assert.equal(result.selectedMeasure, eu)
  assert.deepEqual(result.riskInput.ukDuty.dutyGbp, { numerator: '60', denominator: '1' })
  assert.deepEqual(result.riskInput.euDuty.dutyGbp, { numerator: '90', denominator: '1' })
  assert.equal(JSON.stringify([uk, eu, facts]), before)
  assert.equal(compareNiDutyMeasures(uk, eu, Decimal.parse('1500'), 'value-2', facts).decision.status, 'not-at-risk')
})
test('EUR conversion is shared with final duty arithmetic and incomplete evidence is rejected', () => {
  const uk = measure('UK', '2'), eu = measure('EU', '3')
  eu.components[0].currency = 'EUR'
  eu.components[0].tariffConversion = selectTariffExchangeRate({ data: [{ id: 'rate', type: 'monetary_exchange_rate', attributes: { child_monetary_unit_code: 'GBP', exchange_rate: '0.8572', validity_start_date: '2026-09-01', operation_date: '2026-09-01' } }] }, facts.date)
  const result = compareNiDutyMeasures(uk, eu, Decimal.parse('1000'), 'value', facts)
  assert.equal(result.decision.status, 'not-at-risk')
  assert.ok(result.workings.eu.some(step => step.label.includes('0.8572 GBP/EUR')))
  for (const patch of [{ provenance: 'operator' }, { jurisdiction: 'UK' }, { disposition: 'suspended' }, { validTo: '2026-09-13' }, { family: 'preference' }]) assert.throws(() => compareNiDutyMeasures(uk, { ...eu, ...patch }, Decimal.parse('1000'), 'value', facts))
  assert.throws(() => compareNiDutyMeasures(uk, eu, Decimal.parse('0'), 'value', facts))
})

test('NI at-risk reporting separates EU duty and VAT without changing liability', () => {
  const tax = { ...measure('EU', '12'), components: [{ type: 'percent', rate: '12' }] }
  const input = { date: facts.date, jurisdiction: 'NI', movement: facts.movement, riskStatus: 'at-risk', niTariff: 'EU', niTreatmentEvidence: 'Synthetic explicit at-risk review', rates: [], costs: [{ id: 'vat-cost', code: 'AV', amount: '400', currency: 'GBP', evidence: 'Synthetic VAT-only cost', scope: { type: 'declaration' }, basis: 'value', includedInPrice: false, effect: 'vat', operation: 'add' }], items: [{ id: 'one', invoiceId: 'invoice', goodsValue: '1000', currency: 'GBP', grossMass: '30', valuationMethod: '1', families: ['ni'], measures: [tax], vatRate: '20', vatReference: measure('UK', '0') }] }
  const before = JSON.stringify(input), result = calculateDuty(input), line = result.lines[0]
  assert.deepEqual(result.totals, { duty: '120.00', vat: '304.00' })
  assert.equal(line.taxes[0].taxType, 'A50')
  assert.deepEqual(line.vatTaxes.map(({ taxType, base, amount }) => ({ taxType, base, amount })), [{ taxType: 'B00', base: '1400.00', amount: '280.00' }, { taxType: 'B05', base: '120.00', amount: '24.00' }])
  assert.equal(result.liabilityTotals.vatByTaxType.find(row => row.taxType === 'B05').amount, '24.00')
  assert.equal(result.liabilityTotals.payableVatRoundingDifference, '0.00')
  assert.ok(line.workings.some(step => step.label.startsWith('A50:')))
  assert.ok(line.workings.some(step => step.label.startsWith('B05:')))
  assert.equal(JSON.stringify(input), before)
  for (const [uk, ni] of [['A20', 'A70'], ['A30', 'A80'], ['A35', 'A85'], ['A40', 'A90'], ['A45', 'A95']]) {
    tax.taxType = uk
    tax.family = 'trade-remedy'
    tax.disposition = ['A35', 'A45'].includes(uk) ? 'secured' : 'payable'
    assert.equal(calculateDuty(input).lines[0].taxes[0].taxType, ni)
    if (tax.disposition === 'secured') {
      assert.equal(calculateDuty(input).totals.duty, '0.00')
      assert.equal(calculateDuty(input).lines[0].vatTaxes.find(row => row.taxType === 'B05').amount, '0.00')
      tax.disposition = 'payable'
      assert.match(calculateDuty(input).lines[0].issues.join(), /must be secured/)
    }
  }
  tax.disposition = 'payable'
  tax.taxType = 'A10'
  assert.equal(calculateDuty(input).totals, null, 'Unknown EU reporting codes require a dedicated mapping')
  tax.taxType = 'A00'; tax.jurisdiction = 'UK'
  input.riskStatus = 'not-at-risk'; input.niTariff = 'UK'
  const uk = calculateDuty(input)
  assert.equal(uk.lines[0].taxes[0].taxType, 'A00')
  assert.equal(uk.lines[0].vatTaxes, undefined)
})

test('NI VAT row rounding remains visible and never silently redistributes a penny', () => {
  const input = { date: facts.date, jurisdiction: 'NI', movement: facts.movement, riskStatus: 'at-risk', niTariff: 'EU', niTreatmentEvidence: 'Synthetic at-risk evidence', rates: [], costs: [], items: [{ id: 'one', invoiceId: 'invoice', goodsValue: '0.03', currency: 'GBP', grossMass: '1', valuationMethod: '1', families: ['ni'], measures: [{ ...measure('EU', '0'), components: [{ type: 'percent', rate: '100' }] }], vatRate: '20', vatReference: measure('UK', '0') }] }
  const result = calculateDuty(input)
  assert.deepEqual(result.totals, { duty: '0.03', vat: '0.01' })
  assert.deepEqual(result.lines[0].vatTaxes.map(row => row.amount), ['0.01', '0.01'])
  assert.deepEqual(result.lines[0].vatTaxes.map(row => row.exact), [{ numerator: '3', denominator: '500' }, { numerator: '3', denominator: '500' }])
  assert.equal(result.lines[0].vatTaxRoundingDifference, '-0.01')
  assert.equal(result.liabilityTotals.payableVatRoundingDifference, '-0.01')
  assert.equal(result.autoPopulationAllowed, false)
  input.items[0].vatRate = '0'
  assert.deepEqual(calculateDuty(input).lines[0].vatTaxes.map(row => row.amount), ['0.00', '0.00'])
})
