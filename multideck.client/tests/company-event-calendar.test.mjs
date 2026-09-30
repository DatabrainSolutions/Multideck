import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = readFileSync(new URL('../src/lib/company-event-calendar.ts', import.meta.url), 'utf8')
const stripped = stripTypeScriptTypes(source, { mode: 'strip' })
const { companyEventsForCalendar } = await import(`data:text/javascript;base64,${Buffer.from(stripped).toString('base64')}`)
const event = { id: 'event-1', title: 'Team event', status: 'published', myRsvp: { status: 'going' }, startsAt: '2026-10-03T15:00:00Z', endsAt: '2026-10-03T17:00:00Z', timezone: 'Europe/Athens', location: 'Leeds', details: 'Details' }
const project = (events) => companyEventsForCalendar(events, '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')

test('Going adds one source-linked read-only event; changed details are reflected without a duplicate', () => {
  const [entry] = project([event])
  assert.equal(entry.companyEventId, event.id)
  assert.equal(entry.id, 'company-event:event-1')
  assert.equal(entry.canEdit, false)
  assert.equal(entry.canRespond, false)
  assert.equal(entry.timeZone, 'Europe/Athens')
  const changed = project([{ ...event, title: 'Changed title', startsAt: '2026-10-04T15:00:00Z', endsAt: '2026-10-04T17:00:00Z', location: 'York' }])
  assert.equal(changed.length, 1)
  assert.equal(changed[0].id, entry.id)
  assert.equal(changed[0].title, 'Changed title')
  assert.equal(changed[0].location, 'York')
})

test('Maybe, Not going, cancelled, drafts and unavailable events are removed', () => {
  for (const status of ['maybe', 'not_going']) assert.deepEqual(project([{ ...event, myRsvp: { status } }]), [])
  for (const status of ['draft', 'cancelled', 'archived']) assert.deepEqual(project([{ ...event, status }]), [])
  assert.deepEqual(project([{ ...event, myRsvp: null }]), [])
  assert.deepEqual(project([]), [])
})

test('only overlapping dates show; unknown end time is not invented', () => {
  assert.deepEqual(project([{ ...event, startsAt: '2026-10-08T00:00:00Z', endsAt: '2026-10-08T02:00:00Z' }]), [])
  assert.deepEqual(project([{ ...event, startsAt: '2026-09-30T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' }]), [])
  assert.equal(project([{ ...event, startsAt: '2026-09-30T00:00:00Z', endsAt: '2026-10-02T00:00:00Z' }]).length, 1)
  assert.equal(project([{ ...event, endsAt: null }])[0].endAt, event.startsAt)
  assert.deepEqual(project([{ ...event, startsAt: 'invalid' }]), [])
})
