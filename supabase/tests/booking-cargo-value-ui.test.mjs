import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Execute the production field expression and fallback helper, not a second
// implementation. These are client mapping tests, not database/browser proof.
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../../multideck.client/src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
const helper = source.slice(source.indexOf('  const cargoValue ='), source.indexOf('  const cargoData =', source.indexOf('  const cargoValue =')))
const field = source.split('\n').find(line => line.includes('<BookingCargoWiseAmountField label="Cargo line value"'))
assert.ok(helper.includes('return') && field, 'Locate the real cargo value boundary')
const { code } = transformSync(`
  function renderField(cargo, cargoIndex, editable, onCargoChange) {
    const facts = { goodsValue: '60000', goodsValueCurrency: 'GBP' };
    const valueCurrency = 'USD';
    const currencyOptions = [];
    const value = (record, key, fallback = '') => String(record[key] ?? fallback);
    ${helper}
    return (${field});
  }
`, { loader: 'tsx', jsxFactory: 'React.createElement' })
const renderField = new Function('React', 'BookingCargoWiseAmountField', `${code}; return renderField`)(
  { createElement: (_component, props) => props }, () => {},
)

test('missing or cleared line values never inherit shipment or Booking values', () => {
  for (const index of [0, 1, 2]) {
    for (const cargo of [{}, { declaredValue: null, declaredValueCurrency: null }, { declaredValue: '', declaredValueCurrency: '' }]) {
      const field = renderField(cargo, index, true, () => {})
      assert.equal(field.amount, '')
      assert.equal(field.currency, '')
    }
  }
})

test('each saved allocation, zero and currency remains independent', () => {
  const lines = [
    { declaredValue: '1234.5678', declaredValueCurrency: 'EUR' },
    { declaredValue: 0, declaredValueCurrency: 'GBP' },
    { declaredValue: 400, declaredValueCurrency: null },
  ]
  assert.deepEqual(lines.map((cargo, index) => {
    const field = renderField(cargo, index, true, () => {})
    return [field.amount, field.currency]
  }), [['1234.5678', 'EUR'], ['0', 'GBP'], ['400', '']])
})

test('edits target the selected cargo only; no-line and read-only views are not editable', () => {
  const changes = []
  const field = renderField({ declaredValue: 400, declaredValueCurrency: 'GBP' }, 2, true, (...args) => changes.push(args))
  field.onAmountChange('450')
  field.onCurrencyChange('EUR')
  assert.deepEqual(changes, [[2, 'declaredValue', '450'], [2, 'declaredValueCurrency', 'EUR']])
  assert.equal(renderField(undefined, 0, true, () => {}).editable, false)
  assert.equal(renderField({ declaredValue: 10 }, 0, false, () => {}).editable, false)
})

const formatSource = source.slice(source.indexOf('function bookingQuoteSyncValue('), source.indexOf('function BookingQuoteSyncReviewPanel('))
const { code: formatCode } = transformSync(formatSource, { loader: 'ts' })
const formatCargoField = new Function(`${formatCode}; return bookingQuoteCargoFieldValue`)()

test('whole-line comparisons distinguish absent lines, missing fields and explicit zero or false', () => {
  for (const language of ['en-GB', 'en-US']) {
    assert.equal(formatCargoField(null, 'grossWeightKg', language), 'No cargo line')
    assert.equal(formatCargoField({}, 'grossWeightKg', language), 'Not recorded')
    assert.equal(formatCargoField({ grossWeightKg: null }, 'grossWeightKg', language), 'Not recorded')
    assert.equal(formatCargoField({ grossWeightKg: 0 }, 'grossWeightKg', language), '0')
    assert.equal(formatCargoField({ isHazardous: false }, 'isHazardous', language), 'No')
    assert.equal(formatCargoField({ isHazardous: true }, 'isHazardous', language), 'Yes')
  }
})

test('approval comparisons retain precise measurements and full descriptions', () => {
  const description = 'Long operational description '.repeat(200)
  for (const language of ['en-GB', 'en-US']) {
    assert.equal(formatCargoField({ volumeCbm: 1.234567 }, 'volumeCbm', language), '1.234567')
    assert.equal(formatCargoField({ grossWeightKg: 0.000001 }, 'grossWeightKg', language), '0.000001')
    assert.equal(formatCargoField({ description }, 'description', language), description)
  }
})
