import assert from 'node:assert/strict'
import test from 'node:test'
import { cargoHandlingMissing, readCargoHandling } from '../src/lib/cargo-handling.ts'
import { newQuoteCargoLine, readQuoteCargoLines } from '../src/lib/quote-cargo.ts'

test('new lines have no inherited selections and per-line handling survives reload', () => {
  const first = newQuoteCargoLine()
  first.handlingDetailsJson = JSON.stringify({ hazardous: { tbc: true, details: {} } })
  first.isHazardous = true
  const second = newQuoteCargoLine()
  assert.equal(second.handlingDetailsJson, '')
  assert.equal(second.isHazardous, false)
  assert.equal(readQuoteCargoLines([first, second])?.[0].handlingDetailsJson, first.handlingDetailsJson)
})
test('every TBC selection remains unresolved for Booking', () => {
  for (const kind of ['hazardous', 'temperatureControlled', 'oversized', 'fragile', 'foodGrade']) {
    assert.equal(cargoHandlingMissing(readCargoHandling(JSON.stringify({ [kind]: { tbc: true, details: {} } })), {}).length, 1)
  }
})
test('temperature, dimensions and description requirements must be supplied, not zero or TBC', () => {
  const temperature = { temperatureControlled: { tbc: false, details: { setPoint: '-18', unit: 'C', notes: '' } } }
  assert.deepEqual(cargoHandlingMissing(temperature, {}), [])
  assert.equal(cargoHandlingMissing({ temperatureControlled: { ...temperature.temperatureControlled, details: { setPoint: '', unit: 'C' } } }, {}).length, 1)
  assert.equal(cargoHandlingMissing({ temperatureControlled: { ...temperature.temperatureControlled, details: { setPoint: '-18', unit: 'C', notes: 'Ventilation TBC' } } }, {}).length, 1)
  assert.deepEqual(cargoHandlingMissing({ oversized: { tbc: false, details: {} } }, { length: '100', width: '80', height: '90' }), [])
  assert.equal(cargoHandlingMissing({ oversized: { tbc: false, details: {} } }, { length: '0', width: '80', height: '90' }).length, 1)
  assert.equal(cargoHandlingMissing({ fragile: { tbc: false, details: {} } }, { description: 'TBC' }).length, 1)
})
test('unknown or malformed detail fields are never silently discarded', () => {
  for (const input of ['[]', 'null', '{"unknown":{}}', '{"hazardous":{"tbc":"false","details":{}}}', '{"hazardous":{"tbc":false,"details":{"privateField":"x"}}}']) assert.throws(() => readCargoHandling(input))
})
