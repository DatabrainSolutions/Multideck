import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../../multideck.client/src/lib/freight-field-policy.ts', import.meta.url), 'utf8')
const transformed = transformSync(source, { loader: 'ts', format: 'esm' }).code
const { freightFieldPolicy, freightTransportField, freightRouteOperationalFields } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`)

test('Quote and Booking field policy covers Air, Sea, Road and Rail in every direction', () => {
  const directions = ['Import', 'Export', 'Domestic', 'Cross trade']
  const modes = [
    { mode: 'Air', key: 'air', reference: 'Air waybill', transport: 'flightNumber' },
    { mode: 'Sea', key: 'sea', reference: 'Bill of lading', transport: 'vessel' },
    { mode: 'Road', key: 'road', reference: 'CMR / consignment note', transport: 'vehicleRegistration' },
    { mode: 'Rail', key: 'rail', reference: 'CIM / consignment note', transport: 'railService' },
  ]
  for (const direction of directions) for (const { mode, key, reference, transport } of modes) {
    const quote = freightFieldPolicy({ mode, direction, stage: 'draft' })
    const booking = freightFieldPolicy({ mode, direction, stage: 'booking' })
    assert.equal(quote.mode, key, `${mode} ${direction}`)
    assert.equal(booking.transportReference, reference, `${mode} ${direction}`)
    assert.equal(freightTransportField(mode).field, transport, `${mode} ${direction}`)
    assert.equal(quote.customs, direction !== 'Domestic', `${mode} ${direction}`)
    assert.equal(booking.customs, direction !== 'Domestic', `${mode} ${direction}`)
    assert.equal(quote.chargeableWeight, mode === 'Air', `${mode} ${direction}`)
    assert.equal(booking.chargeableWeight, mode === 'Air', `${mode} ${direction}`)
    assert.equal(quote.hblMode, mode === 'Sea', `${mode} ${direction}`)
    assert.equal(booking.uld, mode === 'Air', `${mode} ${direction}`)
    assert.equal(booking.vehicle, mode === 'Road', `${mode} ${direction}`)
    assert.equal(booking.wagon, mode === 'Rail', `${mode} ${direction}`)
    assert.ok(freightRouteOperationalFields(mode).length > 0, `${mode} ${direction}`)
  }
})

test('A mixed service retains leg-specific fields without silently changing the overall mode', () => {
  const policy = freightFieldPolicy({ mode: 'Air', direction: 'Import', stage: 'booking', legModes: ['Road', 'Air'] })
  assert.equal(policy.air, true)
  assert.equal(policy.road, true)
  assert.equal(policy.sea, false)
  assert.equal(policy.routingModeMismatch, false)
  assert.equal(policy.chargeableWeight, true)
})
