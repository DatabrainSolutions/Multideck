import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBookingChargeReview, planBookingChargeDecisions } from '../functions/_shared/booking-charge-review.mts'

const values = (cost, sell, description = 'Freight') => ({ cost, sell, description, costCurrency: 'GBP', sellCurrency: 'GBP', supplierId: 'supplier-a' })
function fixture() {
  return { token: 'server-revision-1', current: [
    { id: 'booking-q1', origin: 'quote', quoteLineId: 'q1', values: values(100, 150) },
    { id: 'booking-manual', origin: 'booking', values: values(20, 40, 'Extra handling') },
  ], proposed: [{ id: 'q1', values: values(125, 175) }], removed: [] }
}
test('an unselected review never changes any charge', () => {
  const input = fixture(), before = structuredClone(input)
  assert.deepEqual(planBookingChargeDecisions(input, input.token, []).operations, [])
  assert.deepEqual(input, before)
})
test('replace retains the Booking line identity and includes all before/after fields', () => {
  const input = fixture()
  input.proposed[0].values = { ...values(125, 175, 'Revised freight'), supplierId: 'supplier-b', costCurrency: 'EUR', costRoe: 1.2 }
  const result = planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'replace' }])
  assert.equal(result.operations.length, 1)
  assert.equal(result.operations[0].bookingLineId, 'booking-q1')
  assert.deepEqual(result.operations[0].after, input.proposed[0].values)
  assert.deepEqual(result.audit[0].before, input.current[0].values)
})
test('Booking-added charges cannot be replaced or removed by Quote updates', () => {
  const input = fixture()
  for (const action of ['replace', 'remove']) assert.throws(() => planBookingChargeDecisions(input, input.token, [{ key: 'booking:booking-manual', action }]), /Booking-added/)
})
test('Quote omission requires an explicit removal; keep is audited', () => {
  const input = fixture(); input.proposed = []
  assert.equal(buildBookingChargeReview(input)[0].kind, 'remove')
  assert.equal(planBookingChargeDecisions(input, input.token, []).operations.length, 0)
  const keep = planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'keep' }])
  assert.equal(keep.operations.length, 0)
  assert.deepEqual(keep.audit[0].before, keep.audit[0].after)
  assert.equal(planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'remove' }]).operations[0].after, null)
})
test('discarded lines cannot return through add or replace, only explicit restore', () => {
  const input = fixture(); input.current = [input.current[1]]
  input.removed = [{ quoteLineId: 'q1', values: values(100, 150) }]
  assert.equal(buildBookingChargeReview(input)[1].kind, 'restore')
  for (const action of ['add', 'replace']) assert.throws(() => planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action }]), /explicit action/)
  assert.equal(planBookingChargeDecisions(input, input.token, []).operations.length, 0)
  assert.equal(planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'restore' }]).operations[0].action, 'restore')
})
test('financially protected lines stay unchanged but can explicitly be kept', () => {
  const input = fixture(); input.current[0].protectionReason = 'Linked to a financial document; correction required.'
  assert.throws(() => planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'replace' }]), /correction required/)
  assert.equal(planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'keep' }]).operations.length, 0)
})
test('legacy unmapped rows are preserved and unmatched additions cannot duplicate them', () => {
  const input = fixture(); input.current[0] = { id: 'legacy', origin: 'unknown', values: values(100, 150) }
  assert.equal(buildBookingChargeReview(input)[0].kind, 'preserve')
  assert.throws(() => planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'add' }]), /missing origins/)
})
test('stale, duplicate, unknown and incompatible decisions fail closed', () => {
  const input = fixture(), decision = { key: 'quote:q1', action: 'replace' }
  assert.throws(() => planBookingChargeDecisions(input, 'old-token', [decision]), /changed/)
  assert.throws(() => planBookingChargeDecisions(input, input.token, [decision, decision]), /duplicate/)
  assert.throws(() => planBookingChargeDecisions(input, input.token, [{ key: 'other', action: 'keep' }]), /not part/)
  assert.throws(() => planBookingChargeDecisions(input, input.token, [{ key: 'quote:q1', action: 'delete-all' }]), /explicit action/)
})
test('ambiguous source identities never use price, description or row position as a match', () => {
  const input = fixture()
  input.current.push({ ...input.current[0], id: 'another-booking-line' })
  assert.throws(() => buildBookingChargeReview(input), /duplicate/)
  input.current.pop(); input.current[0].quoteLineId = undefined
  assert.throws(() => buildBookingChargeReview(input), /no reliable source/)
})
test('an active and removed identity cannot coexist', () => {
  const input = fixture(); input.removed = [{ quoteLineId: 'q1', values: values(100, 150) }]
  assert.throws(() => buildBookingChargeReview(input), /both active and removed/)
})
