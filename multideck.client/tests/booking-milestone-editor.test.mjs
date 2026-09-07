import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../package.json', import.meta.url))
const { buildSync, transformSync } = require('esbuild')
const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../src/lib/booking-milestone-editor.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' }).outputFiles[0].text
const { milestoneDraft, milestoneChanges, milestoneTimeLabel, milestoneHistoryChanges, MilestoneInputError } = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`)
const types = [{ code: 'departed' }]
const original = { id: 'event', routeId: 'leg', type: 'departed', status: 'planned', operatorEditable: true, recordedMode: 'Sea', plannedAt: '2026-09-18T00:30:45.123456+05:30', estimatedAt: '2026-09-18T20:00:00Z', actualAt: null, location: '  Original location  ', locationUnlocode: 'gbfxt', externalReference: '', notes: null }
const draft = item => ({ ...milestoneDraft(item), reason: 'Verified operator correction' })

test('unchanged evidence is omitted, including microseconds, offsets and original text', () => {
  const input = draft(original)
  assert.equal(input.plannedAt, '2026-09-17T19:00:45')
  assert.deepEqual(milestoneChanges(input, types, original, 'Sea'), {})
  assert.deepEqual(milestoneChanges({ ...input, notes: '  Reviewed  ' }, types, original, 'Sea'), { notes: 'Reviewed' })
})
test('completion changes only actual time and status; explicit clears do not repopulate other dates', () => {
  const input = { ...draft(original), actualAt: '2026-09-18T20:15', status: 'completed' }
  assert.deepEqual(milestoneChanges(input, types, original, 'Sea'), { status: 'completed', actualAt: '2026-09-18T20:15:00Z' })
  assert.deepEqual(milestoneChanges({ ...draft(original), estimatedAt: '' }, types, original, 'Sea'), { estimatedAt: null })
  assert.throws(() => milestoneChanges({ ...draft(original), status: 'completed' }, types, original, 'Sea'), error => error.field === 'actualAt')
})
test('active dictionary, reason, status and real UTC date validation precede save', () => {
  const input = { ...draft(), type: 'departed' }
  assert.deepEqual(milestoneChanges(input, types), { status: 'planned' })
  for (const type of ['', 'unknown', 'customs_released']) assert.throws(() => milestoneChanges({ ...input, type }, [...types, { code: 'customs_released' }]), error => error.field === 'type')
  for (const reason of ['', '  ', 'x'.repeat(2001)]) assert.throws(() => milestoneChanges({ ...input, reason }, types), error => error.field === 'reason')
  for (const status of ['voided', 'unknown']) assert.throws(() => milestoneChanges({ ...input, status }, types), error => error.field === 'status')
  for (const plannedAt of ['2026-02-30T12:30', '2026-09-18', '2026-09-18T24:00', 'bad']) assert.throws(() => milestoneChanges({ ...input, plannedAt }, types), error => error.field === 'plannedAt')
})
test('old-mode evidence can only be voided without changing or normalising its saved values', () => {
  assert.deepEqual(milestoneChanges({ ...draft(original), status: 'voided' }, types, original, 'Air'), { status: 'voided' })
  assert.throws(() => milestoneChanges({ ...draft(original), notes: 'repurpose' }, types, original, 'Air'), /leg mode changed/)
  assert.throws(() => milestoneChanges({ ...draft(original), status: 'voided', plannedAt: '' }, types, original, 'Air'), /leg mode changed/)
  for (const item of [{ ...original, operatorEditable: false }, { ...original, status: 'voided' }]) assert.throws(() => milestoneChanges(draft(item), types, item, 'Sea'), /read-only/)
})
test('explicit text edits normalise only requested fields and enforce length', () => {
  assert.deepEqual(milestoneChanges({ ...draft(original), locationUnlocode: ' nlrtm ' }, types, original, 'Sea'), { locationUnlocode: 'NLRTM' })
  assert.throws(() => milestoneChanges({ ...draft(original), notes: 'x'.repeat(8001) }, types, original, 'Sea'), error => error.field === 'notes')
})
test('both English variants show UTC and retain fine precision; malformed saved dates remain visible', () => {
  for (const locale of ['en-GB', 'en-US']) {
    assert.match(milestoneTimeLabel(original.plannedAt, locale), /19:00:45\.123456 UTC$/)
    assert.equal(milestoneTimeLabel(null, locale), 'Not recorded')
    assert.match(milestoneTimeLabel('2026-09-18', locale), /needs review: 2026-09-18/)
  }
  assert.notEqual(milestoneTimeLabel(original.plannedAt, 'en-GB'), milestoneTimeLabel(original.plannedAt, 'en-US'))
})
test('inline audit exposes only known changed fields; clears and empty history are distinct', () => {
  const rows = milestoneHistoryChanges({ before: { plannedAt: original.plannedAt, notes: 'old', status: 'planned' }, after: { plannedAt: original.plannedAt, notes: null, status: 'completed', secret: 'not an operational field', location: { malformed: true } } })
  assert.deepEqual(rows.map(row => [row.key, row.before, row.after]), [['notes', 'old', null], ['status', 'planned', 'completed']])
  assert.deepEqual(milestoneHistoryChanges(null), [])
  assert.deepEqual(milestoneHistoryChanges({ before: {}, after: { plannedAt: null, notes: null } }), [])
})

// Execute the actual TSX submit handler. DOM/hook plumbing and API transport are
// declared boundaries; this does not substitute for the real browser or backend.
const source = readFileSync(new URL('../src/components/multideck/booking-route-milestones.tsx', import.meta.url), 'utf8')
const start = source.indexOf('onSubmit={async event => {') + 'onSubmit={async event => {'.length
assert.ok(start > 30)
const end = source.indexOf('\n        }}>', start)
assert.ok(end > start)
const callback = transformSync(`async function submit(event) {${source.slice(start, end)}\n}`, { loader: 'ts' }).code
const execute = new Function('context', 'event', `with (context) { ${callback}; return submit(event); }`)
function submitFixture() {
  const state = { errors: [], messages: [], saves: [], applied: [], busy: false, closed: false }
  const route = { id: 'leg', updatedAt: 'route-stamp', mode: 'Sea' }
  const saved = { booking: { jobId: 'booking', updatedAt: 'new-stamp' }, routes: [route] }
  const props = { bookingId: 'booking', bookingUpdatedAt: 'booking-stamp', route, editable: true, onSaved: value => state.applied.push(value), save: async payload => { state.saves.push(payload); return saved } }
  const context = {
    props, route, types, canEdit: true, t: value => value, milestoneChanges, MilestoneInputError,
    editing: { id: 'event', bookingId: 'booking', routeId: 'leg', stamp: 'booking-stamp', routeStamp: 'route-stamp', draft: { ...draft(), type: 'departed', notes: 'Observed event' } },
    inFlight: { current: false }, mounted: { current: true }, latest: { current: props },
    setError: value => { if (value) state.errors.push(value) }, setErrorField: value => { state.errorField = value },
    setBusy: value => { state.busy = value }, setMessage: value => state.messages.push(value), setEditing: value => { state.closed = value === null },
  }
  return { context, state, saved, run: () => execute(context, { preventDefault() {}, currentTarget: { querySelector: () => null } }) }
}
test('actual submit binds the exact saved Booking, leg and optimistic tokens', async () => {
  const ui = submitFixture(); await ui.run()
  assert.deepEqual(ui.state.saves, [{ id: 'event', routeId: 'leg', type: 'departed', expectedUpdatedAt: 'booking-stamp', expectedRouteUpdatedAt: 'route-stamp', expectedMilestoneUpdatedAt: null, changes: { status: 'planned', notes: 'Observed event' }, reason: 'Verified operator correction' }])
  assert.deepEqual(ui.state.applied, [ui.saved]); assert.equal(ui.state.closed, true); assert.equal(ui.state.busy, false)
})
test('dirty parent, changed exact identity and stale review refuse before sending', async () => {
  for (const change of [ui => { ui.context.canEdit = false }, ui => { ui.context.props.bookingId = 'other' }, ui => { ui.context.route.id = 'other-leg' }, ui => { ui.context.props.bookingUpdatedAt = 'new' }, ui => { ui.context.route.updatedAt = 'new' }]) {
    const ui = submitFixture(); change(ui); await ui.run()
    assert.equal(ui.state.saves.length, 0); assert.equal(ui.state.applied.length, 0); assert.equal(ui.state.closed, false); assert.match(ui.state.errors[0], /changed/)
  }
})
test('API rejection preserves the draft, explains failure and permits another attempt', async () => {
  const ui = submitFixture(), initial = structuredClone(ui.context.editing.draft)
  ui.context.props.save = async () => { throw new Error('This milestone changed. Reload before making a correction.') }
  await ui.run()
  assert.deepEqual(ui.context.editing.draft, initial); assert.equal(ui.state.closed, false); assert.equal(ui.context.inFlight.current, false); assert.equal(ui.state.busy, false)
  assert.match(ui.state.errors[0], /Reload/)
})
test('in-flight guard prevents duplicate submission and rejects late responses against a changed view', async () => {
  const ui = submitFixture(); let resolve
  ui.context.props.save = payload => { ui.state.saves.push(payload); return new Promise(done => { resolve = done }) }
  const pending = ui.run(); await ui.run(); assert.equal(ui.state.saves.length, 1)
  ui.context.latest.current = { ...ui.context.props, disabledReason: 'Unsaved Booking changes' }
  resolve(ui.saved); await pending
  assert.equal(ui.state.applied.length, 0); assert.equal(ui.state.closed, false); assert.match(ui.state.errors[0], /saved, but this view changed/)
})
test('unmounted editors and wrong-Booking responses never replace the visible workspace', async () => {
  const unmounted = submitFixture(); unmounted.context.props.save = async () => { unmounted.context.mounted.current = false; return unmounted.saved }; await unmounted.run()
  assert.equal(unmounted.state.applied.length, 0)
  const wrong = submitFixture(); wrong.context.props.save = async () => ({ booking: { jobId: 'other' } }); await wrong.run()
  assert.equal(wrong.state.applied.length, 0); assert.match(wrong.state.errors[0], /different Booking/)
})
