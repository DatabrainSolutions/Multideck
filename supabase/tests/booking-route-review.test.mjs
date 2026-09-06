import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/booking-route-review.ts', import.meta.url), 'utf8'))
const { bookingRouteActionReview } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const args = { target_id: 'test-booking', route_id: 'second-leg', field: 'cargoCutoffAt', value: '2026-09-18T10:30:45.123456+01:00',
  expected_updated_at: '2026-09-06T10:00:00Z', expected_route_updated_at: '2026-09-06T09:00:00Z', reason: 'Test only' }
const record = { sourceTable: 'Job_Routing', recordId: args.route_id, bookingId: args.target_id, bookingReference: 'TEST1', legNumber: 2,
  mode: 'sea', updatedAt: args.expected_updated_at, routeUpdatedAt: args.expected_route_updated_at, cargoCutoffAt: null }
const review = (argPatch = {}, recordPatch = {}, locale = 'en-GB') => bookingRouteActionReview(new Map([[args.route_id, { ...record, ...recordPatch }]]), { ...args, ...argPatch }, locale)

test('Review identifies the actual leg and preserves timezone and microseconds in both English variants', () => {
  for (const [locale, day] of [['en-GB', '18 Sept 2026'], ['en-US', 'Sep 18, 2026']]) {
    const result = review({}, {}, locale)
    assert.equal(result.title, 'Edit TEST1 · Leg 2 · Sea')
    assert.match(result.description, /Only this field will change/)
    assert.deepEqual(result.changes, [{ field: 'Cargo cut-off', before: null, beforeKnown: true, kind: 'added',
      after: `${day} at 10:30:45.123456 UTC+01:00`, value: `${day} at 10:30:45.123456 UTC+01:00` }])
  }
})

test('Explicit null/blank clear retains the saved before value; absence is never guessed to mean blank', () => {
  for (const value of [null, '', '  ']) {
    const change = review({ value }, { cargoCutoffAt: '2026-09-17T23:30:00-07:00' }).changes[0]
    assert.equal(change.before, '17 Sept 2026 at 23:30:00 UTC-07:00')
    assert.equal(change.after, null)
    assert.equal(change.kind, 'removed')
    assert.equal(change.beforeKnown, true)
  }
  assert.throws(() => review({ value: undefined }), /text value/)
  assert.throws(() => review({}, { cargoCutoffAt: undefined }), /text value/)
})

test('Wrong scope, leg, Booking, stale timestamps and incomplete evidence cannot produce an approval card', () => {
  for (const patch of [{ sourceTable: 'Job_Header' }, { recordId: 'first-leg' }, { bookingId: 'other-booking' },
    { updatedAt: 'old' }, { routeUpdatedAt: 'old' }, { bookingReference: '' }, { legNumber: 0 }, { mode: '' }]) {
    assert.throws(() => review({}, patch), /exact current/)
  }
  const missing = { ...record }; delete missing.cargoCutoffAt
  assert.throws(() => bookingRouteActionReview(new Map([[args.route_id, missing]]), args, 'en-GB'), /exact current/)
  assert.throws(() => review({ expected_updated_at: undefined }, { updatedAt: undefined }), /exact current/)
  assert.throws(() => review({ expected_route_updated_at: undefined }, { routeUpdatedAt: undefined }), /exact current/)
  assert.throws(() => review({ field: 'costAmount' }), /available routing field/)
})

test('Mode-specific routing fields follow the leg, and text values remain text', () => {
  for (const [field, mode] of [['vessel', 'sea'], ['voyageNumber', 'sea'], ['flightNumber', 'air'],
    ['vehicleRegistration', 'road'], ['trailerNumber', 'courier'], ['railService', 'rail']]) {
    const result = review({ field, value: ' ABC 42 ' }, { mode, [field]: 'Previous' })
    assert.equal(result.changes[0].before, 'Previous')
    assert.equal(result.changes[0].after, 'ABC 42')
    assert.throws(() => review({ field, value: 'ABC 42' }, { mode: 'warehouse', [field]: null }), /leg mode/)
  }
  assert.throws(() => review({ field: 'vgmCutoffAt' }, { mode: 'air', vgmCutoffAt: null }), /leg mode/)
})

test('Calendar-invalid and timezone-free deadlines are rejected before review; planned date-only means midnight UTC', () => {
  for (const value of ['2026-09-18', '2026-09-18T10:30', '2026-02-30T10:30:00Z', '0000-01-01T10:30:00Z',
    '2026-09-18T25:30Z', '2026-09-18T10:60Z', '2026-09-18T10:30:60Z', '2026-09-18T10:30+14:01',
    '2026-09-18T10:30+01:60', '2026-09-18T10:30+15:00', {}, 42]) assert.throws(() => review({ value }))
  assert.equal(review({ field: 'plannedDepartureAt', value: '2026-09-18' }, { plannedDepartureAt: null }).changes[0].after,
    '18 Sept 2026 at 00:00 UTC')
})

test('Model-supplied before values, labels or provenance cannot replace the domain read or alter input', () => {
  const input = { ...args, before: 'Fabricated', targetLabel: 'Other Booking', _document_evidence: { before: 'Fabricated' } }
  const original = structuredClone(input), saved = structuredClone(record)
  const result = bookingRouteActionReview(new Map([[args.route_id, record]]), input, 'en-GB')
  assert.equal(result.changes[0].before, null)
  assert.equal(result.title, 'Edit TEST1 · Leg 2 · Sea')
  assert.deepEqual(input, original)
  assert.deepEqual(record, saved)
})
