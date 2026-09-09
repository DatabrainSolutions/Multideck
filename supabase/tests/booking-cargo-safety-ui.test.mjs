import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { bookingCargoSource as source, mutateBookingCargo as mutate, bookingCargoHandlingSummary, bookingCargoOtherHandling, bookingCargoSafetyConflict } from './booking-cargo-client-fixture.mjs'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { transformSync } = require('esbuild')

test('real Booking mutation writes boolean false, preserves identities and detailed evidence', () => {
  const cargo = { id: crypto.randomUUID(), description: 'Second line', isHazardous: true, isTemperatureControlled: true,
    knownCargo: 'Hazardous; Temperature controlled; Fragile', cargoData: { dangerousGoods: [{ unNumber: '1234' }], internalNotes: 'Retained' } }
  const original = { cargo: [{ id: crypto.randomUUID(), description: 'First line' }, cargo], quoteSnapshot: { accepted: true } }
  const after = mutate(original, 1, 'isHazardous', 'No')
  assert.equal(after.cargo[1].isHazardous, false)
  assert.equal(after.cargo[1].cargoData.isHazardous, false)
  assert.equal(after.cargo[1].isTemperatureControlled, true)
  assert.equal(after.cargo[1].knownCargo, 'Temperature controlled; Fragile')
  assert.equal(after.cargo[1].id, cargo.id)
  assert.equal(after.cargo[1].cargoData.dangerousGoods, cargo.cargoData.dangerousGoods)
  assert.equal(after.cargo[0], original.cargo[0])
  assert.equal(after.quoteSnapshot, original.quoteSnapshot)
  assert.equal(original.cargo[1].isHazardous, true)
  assert.equal(mutate(after, 1, 'isHazardous', 'Yes').cargo[1].knownCargo, 'Hazardous; Temperature controlled; Fragile')
})

test('other handling cannot clear confirmed or unconfirmed safety requirements', () => {
  for (const flag of [true, undefined]) {
    const original = { cargo: [{ description: 'Goods', isHazardous: flag, knownCargo: 'Hazardous; Oversized' }] }
    const after = mutate(original, 0, 'knownCargo', 'Food grade')
    assert.equal(after.cargo[0].knownCargo, 'Hazardous; Food grade')
    assert.equal(after.cargo[0].isHazardous, flag)
    assert.equal(bookingCargoOtherHandling(after.cargo[0].knownCargo), 'Food grade')
  }
})

test('legacy safety text stays visible for review rather than becoming a guessed flag', () => {
  const legacy = { description: 'Goods', cargoData: { cargoData: { knownCargo: 'Hazardous; Temperature controlled; Oversized' } } }
  assert.equal(bookingCargoHandlingSummary(legacy), 'Hazardous; Temperature controlled; Oversized')
  assert.equal(bookingCargoSafetyConflict(legacy, 'Hazardous'), true)
  assert.equal(bookingCargoSafetyConflict({ isHazardous: false }, 'Hazardous'), true)
  assert.equal(bookingCargoSafetyConflict({ isHazardous: true }, 'Hazardous'), false)
  assert.equal(bookingCargoSafetyConflict({}, 'Non-hazardous'), false)
  assert.equal(bookingCargoOtherHandling('Hazardous | Sensitive consignment; Temperature controlled'), 'Sensitive consignment')
})

test('invalid flags and stale row indices cannot mutate or create a phantom cargo line', () => {
  const original = { cargo: [{ description: 'Goods', isHazardous: true }] }
  for (const value of ['false', 'true', '', 'unknown', true, false, null]) assert.equal(mutate(original, 0, 'isHazardous', value), original)
  for (const index of [-1, 1, 0.5]) assert.equal(mutate(original, index, 'isHazardous', 'No'), original)
  assert.equal(mutate(null, 0, 'isHazardous', 'No'), null)
})

test('real safety field expressions show true, false and missing distinctly', () => {
  for (const key of ['isHazardous', 'isTemperatureControlled']) {
    const field = source.split('\n').find(line => line.includes('<BookingCargoWiseField label=') && line.includes(`typeof cargo?.${key}`))
    assert.ok(field)
    const code = transformSync(`function render(cargo) { const cargoIndex=1; const editCargo=()=>({editable:!!cargo});return (${field}) }`, { loader: 'tsx', jsxFactory: 'React.createElement' }).code
    const render = new Function('React', 'BookingCargoWiseField', `${code};return render`)( { createElement: (_, props) => props }, () => {})
    assert.equal(render({ [key]: true }).value, 'Yes')
    assert.equal(render({ [key]: false }).value, 'No')
    assert.equal(render({}).value, '')
    assert.equal(render({}).placeholder, 'Not recorded')
    assert.equal(render({}).emptyValue, 'Not recorded')
    assert.equal(render(undefined).editable, false)
  }
})
