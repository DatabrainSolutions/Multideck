import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectTariffExchangeRate, convertEuroTariffAmount } from '../functions/_shared/customs-tariff-exchange-rate.mts'
import { Decimal } from '../functions/_shared/customs-calculation-decimal.mts'

const record = (month, rate = '0.8572') => ({ id: month, type: 'monetary_exchange_rate', attributes: { child_monetary_unit_code: 'GBP', exchange_rate: rate, operation_date: '2026-06-21', validity_start_date: `2026-${month}-01T00:00:00.000Z` } })
test('small duty rates retain precision until the final amount is rounded', () => {
  const reference = selectTariffExchangeRate({ data: [record('09')] }, '2026-09-14')
  // Rounding the converted per-unit rate to pennies would incorrectly give zero.
  const euroAmount = Decimal.parse('0.0001').mul(Decimal.parse('1000000'))
  assert.equal(convertEuroTariffAmount(euroAmount, reference, '2026-09-14').fixed(2), '85.72')
  const thirds = Decimal.parse('1').div(Decimal.parse('3'))
  assert.equal(convertEuroTariffAmount(thirds, reference, '2026-09-14').mul(Decimal.parse('3')).compare(Decimal.parse('0.8572')), 0)
})
test('invoice conversion, swapped direction and stale evidence cannot price tariff amounts', () => {
  const reference = selectTariffExchangeRate({ data: [record('09')] }, '2026-09-14')
  for (const patch of [
    { purpose: 'invoice-goods' }, { direction: 'EUR-per-GBP' },
    { source: 'https://www.trade-tariff.service.gov.uk/exchange_rates/monthly' },
    { fromCurrency: 'GBP', toCurrency: 'EUR' }, { calculationDate: '2026-09-13' },
    { validityStart: '2026-08-01' }, { rate: '0' },
  ]) assert.throws(() => convertEuroTariffAmount(Decimal.parse('100'), { ...reference, ...patch }, '2026-09-14'))
  assert.throws(() => convertEuroTariffAmount(Decimal.parse('100'), undefined, '2026-09-14'), /own dated/)
})
test('selects the requested month, preserving exact rate and direction without mutation', () => {
  const payload = { data: [record('10', '0.9'), record('09'), record('08', '0.8')] }
  const before = JSON.stringify(payload)
  const selected = selectTariffExchangeRate(payload, '2026-09-14')
  assert.equal(selected.recordId, '09')
  assert.equal(selected.rate, '0.8572')
  assert.equal(selected.direction, 'GBP-per-EUR')
  assert.equal(selected.certified, false)
  assert.equal(JSON.stringify(payload), before)
})
test('missing months and ambiguous amendments never fall back to latest', () => {
  assert.throws(() => selectTariffExchangeRate({ data: [record('10')] }, '2026-09-14'), /different month's/)
  assert.throws(() => selectTariffExchangeRate({ data: [record('09'), record('09', '0.9')] }, '2026-09-14'), /amendment/)
})
test('rejects malformed dates, rate precision loss, missing identity and wrong currency', () => {
  for (const rate of ['0', '-1', 'NaN', '1e-2', 0.8572]) assert.throws(() => selectTariffExchangeRate({ data: [record('09', rate)] }, '2026-09-14'), /positive exact decimal/)
  for (const patch of [{ validity_start_date: '2026-09-31' }, { validity_start_date: '2026-09-20' }, { operation_date: '2026-02-30' }]) {
    const row = record('09'); Object.assign(row.attributes, patch)
    assert.throws(() => selectTariffExchangeRate({ data: [row] }, '2026-09-14'), /invalid dates/)
  }
  const row = record('09'); row.attributes.child_monetary_unit_code = 'USD'
  assert.throws(() => selectTariffExchangeRate({ data: [row] }, '2026-09-14'), /No tariff/)
  assert.throws(() => selectTariffExchangeRate({ data: [{ ...record('09'), id: '' }] }, '2026-09-14'), /identification/)
  assert.throws(() => selectTariffExchangeRate({ data: [] }, '2026-02-30'), /valid tariff conversion date/)
  assert.throws(() => selectTariffExchangeRate({}, '2026-09-14'), /no rate records/)
})
