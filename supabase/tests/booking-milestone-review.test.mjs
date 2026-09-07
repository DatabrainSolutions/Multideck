import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { requiresExplicitActionApproval } from '../functions/agent-dexter/email-approval.mjs'
const source = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/booking-milestone-review.ts', import.meta.url), 'utf8'))
const { bookingMilestoneActionReview } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const args = { target_id: 'booking', route_id: 'leg-two', milestone_id: 'milestone', type: 'departed',
  expected_updated_at: '2026-09-07T08:00:00Z', expected_route_updated_at: '2026-09-07T07:00:00Z',
  expected_milestone_updated_at: '2026-09-07T06:00:00Z', reason: 'Dispatcher confirmed',
  changes: [{ field: 'actualAt', value: '2026-09-01T10:30:45.123456+01:00' }, { field: 'status', value: 'completed' }] }
const record = { sourceTable: 'Job_RouteMilestones', recordId: 'milestone', bookingId: 'booking', routeId: 'leg-two', type: 'departed', name: 'Departed',
  bookingReference: 'TEST1', legNumber: 2, mode: 'sea', recordedMode: 'sea', source: 'operator', operatorEditable: true,
  bookingUpdatedAt: args.expected_updated_at, routeUpdatedAt: args.expected_route_updated_at, updatedAt: args.expected_milestone_updated_at,
  status: 'planned', plannedAt: '2026-09-01T09:00:00Z', estimatedAt: null, actualAt: null, notes: null, locationUnlocode: 'GBFXT' }
const review = (argPatch = {}, recordPatch = {}, locale = 'en-GB') => bookingMilestoneActionReview(
  new Map([['milestone', { ...record, ...recordPatch }]]), { ...args, ...argPatch }, locale)

test('Exact milestone review preserves independent times, microseconds and English variants across modes', () => {
  for (const mode of ['sea', 'air', 'road', 'rail']) for (const locale of ['en-GB', 'en-US']) {
    const result = review({}, { mode, recordedMode: mode }, locale)
    assert.equal(result.title, `Correct TEST1 · Leg 2 · ${mode[0].toUpperCase() + mode.slice(1)} · Departed`)
    assert.equal(result.changes.length, 2)
    assert.equal(result.changes[0].before, null)
    assert.match(result.changes[0].after, /10:30:45\.123456 UTC\+01:00$/)
    assert.match(result.changes[0].after, locale === 'en-GB' ? /^1 Sept 2026/ : /^Sep 1, 2026/)
    assert.deepEqual(result.changes[1], { field: 'Status', before: 'Planned', after: 'Completed', value: 'Completed', beforeKnown: true, kind: 'changed' })
    assert.match(result.description, /accepted Quote, route dates and other milestones remain unchanged/)
  }
})

test('New milestone needs current leg and dictionary evidence and explicitly reviews its default status', () => {
  const createArgs = { ...args, milestone_id: null, expected_milestone_updated_at: null, changes: [{ field: 'plannedAt', value: '2026-09-01T09:00Z' }] }
  const route = { ...record, sourceTable: 'Job_Routing', recordId: args.route_id, updatedAt: args.expected_updated_at }
  const type = { recordId: 'departed', code: 'departed', name: 'Departed', sourceTable: 'sys_JobMilestoneTypes' }
  const records = new Map([[args.route_id, route], ['departed', type]])
  const result = bookingMilestoneActionReview(records, createArgs, 'en-GB')
  assert.equal(result.title, 'Record TEST1 · Leg 2 · Sea · Departed')
  assert.deepEqual(result.changes.map(change => [change.field, change.after]), [['Milestone', 'Departed'], ['Planned time', '1 Sept 2026 at 09:00 UTC'], ['Status', 'Planned']])
  assert.throws(() => bookingMilestoneActionReview(new Map([[args.route_id, route]]), createArgs, 'en-GB'), /current/)
  assert.throws(() => bookingMilestoneActionReview(records, { ...createArgs, expected_milestone_updated_at: 'old' }, 'en-GB'), /active operational/)
  records.set('departed', { ...type, sourceTable: 'fabricated' })
  assert.throws(() => bookingMilestoneActionReview(records, createArgs, 'en-GB'), /active operational/)
})

test('Wrong identities, source, stale tokens, missing before evidence and provider rows cannot produce approval', () => {
  for (const patch of [{ recordId: 'other' }, { bookingId: 'other' }, { routeId: 'other' }, { type: 'arrived' }, { source: 'provider' },
    { sourceTable: 'Job_Header' }, { operatorEditable: false }, { updatedAt: 'old' }, { bookingUpdatedAt: 'old' }, { routeUpdatedAt: 'old' },
    { name: undefined }, { legNumber: 0 }, { bookingReference: '' }, { actualAt: undefined }]) assert.throws(() => review({}, patch))
  for (const key of ['expected_updated_at', 'expected_route_updated_at', 'expected_milestone_updated_at']) assert.throws(() => review({ [key]: undefined }))
  assert.throws(() => review({ changes: [{ field: 'cost', value: '100' }] }), /available milestone/)
  assert.throws(() => review({ changes: [{ field: 'notes', value: 'a' }, { field: 'notes', value: 'b' }] }), /one explicit/)
})

test('Incomplete completion and invalid dates/status/clears are rejected; explicit clears retain before evidence', () => {
  assert.throws(() => review({ changes: [{ field: 'status', value: 'completed' }] }), /actual event time/)
  for (const value of ['2026-09-01', '2026-09-01T10:00', '2026-02-30T10:00Z', '2026-09-01T24:00Z', '2026-09-01T10:00+14:01', 'infinity', 42, undefined]) {
    assert.throws(() => review({ changes: [{ field: 'actualAt', value }] }))
  }
  for (const value of [null, '', 'invented']) assert.throws(() => review({ changes: [{ field: 'status', value }] }))
  const change = review({ changes: [{ field: 'plannedAt', value: null }] }).changes[0]
  assert.deepEqual(change, { field: 'Planned time', before: '1 Sept 2026 at 09:00:00 UTC', after: null, value: null, beforeKnown: true, kind: 'removed' })
})

test('Old-mode evidence can only be voided, with retained history explicitly explained', () => {
  assert.throws(() => review({}, { mode: 'air', recordedMode: 'sea' }), /leg mode changed/)
  const result = review({ changes: [{ field: 'status', value: 'voided' }] }, { mode: 'air', recordedMode: 'sea' })
  assert.match(result.description, /recorded under sea; voiding retains it/)
  assert.equal(result.changes[0].after, 'Voided')
})

test('Approval is mandatory in both modes and cannot use model-supplied before values or alter source evidence', () => {
  for (const mode of ['approve', 'full']) assert.equal(requiresExplicitActionApproval('record_booking_milestone', mode), true)
  const before = structuredClone(record), original = structuredClone(args)
  const result = review({ before: 'Fabricated', targetLabel: 'Wrong Booking' })
  assert.equal(result.changes[0].before, null)
  assert.match(result.title, /TEST1/)
  assert.deepEqual(record, before); assert.deepEqual(args, original)
})
