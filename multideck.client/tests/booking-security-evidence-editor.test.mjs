import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../package.json', import.meta.url))
const { buildSync, transformSync } = require('esbuild')
const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../src/lib/booking-security-evidence-editor.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' }).outputFiles[0].text
const { securityEvidenceDraft, securityEvidenceChanges, SecurityEvidenceInputError } = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`)
const original = { id: 'evidence', cargoId: 'cargo', source: 'operator', recordStatus: 'recorded', operatorEditable: true, updatedAt: 'record-stamp',
  securityStatus: ' Supplied status ', screeningMethod: null, screenedAt: '2026-09-07T10:30:00.123456Z', sourceReference: ' Source ', notes: null }
const draft = record => ({ ...securityEvidenceDraft(record), reason: 'Synthetic evidence' })

test('screening exact source, unedited precision, omission and explicit clears', () => {
  const input = draft(original)
  assert.deepEqual(securityEvidenceChanges(input, original), {})
  assert.deepEqual(securityEvidenceChanges({ ...input, notes: ' Exact note ' }, original), { notes: ' Exact note ' })
  assert.deepEqual(securityEvidenceChanges({ ...input, screenedAt: '' }, original), { screenedAt: null })
})
test('screening requires supplied evidence and source without inventing clearance', () => {
  assert.throws(() => securityEvidenceChanges({ ...draft(), securityStatus: 'Supplied' }), e => e.field === 'sourceReference')
  assert.throws(() => securityEvidenceChanges({ ...draft(), sourceReference: 'Source' }), e => e.field === 'securityStatus')
  assert.throws(() => securityEvidenceChanges({ ...draft(original), reason: '' }, original), e => e.field === 'reason')
  assert.throws(() => securityEvidenceChanges({ ...draft(original), screeningMethod: 'x'.repeat(81) }, original), e => e.field === 'screeningMethod')
})
test('screening UTC entry validates dates and preserves clear semantics', () => {
  assert.deepEqual(securityEvidenceChanges({ ...draft(original), screenedAt: '2026-09-08T11:30' }, original), { screenedAt: '2026-09-08T11:30:00Z' })
  for (const time of ['bad', '2026-02-30T10:00', '2026-09-07']) {
    assert.throws(() => securityEvidenceChanges({ ...draft(original), screenedAt: time }, original), e => e.field === 'screenedAt')
  }
})
test('screening void retains source values and retired records stay read-only', () => {
  assert.deepEqual(securityEvidenceChanges({ ...draft(original), recordStatus: 'voided', notes: 'Do not write' }, original), { recordStatus: 'voided' })
  assert.throws(() => securityEvidenceChanges({ ...draft(), recordStatus: 'voided' }), e => e.field === 'recordStatus')
  assert.throws(() => securityEvidenceChanges(draft(original), { ...original, recordStatus: 'voided', operatorEditable: false }), /read-only/)
})

// Execute the actual submit handler. Hooks/DOM/API transport are explicit
// fixtures; Chrome component checks and PostgreSQL independently cover those layers.
const source = readFileSync(new URL('../src/components/multideck/booking-security-evidence.tsx', import.meta.url), 'utf8')
const start = source.indexOf('onSubmit={async event => {') + 'onSubmit={async event => {'.length
const end = source.indexOf('\n          }}>', start)
assert.ok(start > 30 && end > start)
const callback = transformSync(`async function submit(event) {${source.slice(start, end)}\n}`, { loader: 'ts' }).code
const execute = new Function('context', 'event', `with (context) { ${callback}; return submit(event); }`)
function fixture() {
  const state = { saves: [], applied: [], errors: [], closed: false, busy: false }
  const props = { bookingId: 'booking', bookingUpdatedAt: 'booking-stamp', cargo: { id: 'cargo', updatedAt: 'cargo-stamp' }, editable: true,
    onSaved: value => state.applied.push(value), save: async payload => { state.saves.push(payload); return { booking: { jobId: 'booking' }, documents: ['Original'] } } }
  const context = { props, canEdit: true, t: value => value, securityEvidenceChanges, SecurityEvidenceInputError,
    editing: { id: 'evidence', bookingId: 'booking', cargoId: 'cargo', stamp: 'booking-stamp', cargoStamp: 'cargo-stamp', original,
      draft: { ...draft(original), screeningMethod: ' Updated supplied method ' } }, inFlight: { current: false }, mounted: { current: true }, latest: { current: props },
    setError: value => { if (value) state.errors.push(value) }, setErrorField: value => { state.errorField = value },
    setBusy: value => { state.busy = value }, setMessage: value => { state.message = value }, setEditing: value => { state.closed = value === null } }
  return { state, context, run: () => execute(context, { preventDefault() {} }) }
}
test('Screening actual submit binds cargo, identity, all timestamps and exact changed fields', async () => {
  const ui = fixture(); await ui.run()
  assert.deepEqual(ui.state.saves, [{ id: 'evidence', cargoId: 'cargo', expectedUpdatedAt: 'booking-stamp', expectedCargoUpdatedAt: 'cargo-stamp',
    expectedRecordUpdatedAt: 'record-stamp', changes: { screeningMethod: ' Updated supplied method ' }, reason: 'Synthetic evidence' }])
  assert.equal(ui.state.closed, true)
  assert.deepEqual(ui.state.applied[0].documents, ['Original'])
})
test('Screening dirty parent, changed identity or stale timestamps prevent submission', async () => {
  for (const change of [ui => { ui.context.canEdit = false }, ui => { ui.context.props.cargo.id = 'other' },
    ui => { ui.context.props.bookingUpdatedAt = 'stale' }, ui => { ui.context.props.cargo.updatedAt = 'stale' }]) {
    const ui = fixture(); change(ui); await ui.run()
    assert.equal(ui.state.saves.length, 0); assert.equal(ui.state.closed, false); assert.match(ui.state.errors[0], /changed/)
  }
})
test('Screening API rejection retains draft and releases busy state for recovery', async () => {
  const ui = fixture(), input = structuredClone(ui.context.editing.draft)
  ui.context.props.save = async () => { throw new Error('Stale record: reload') }
  await ui.run()
  assert.deepEqual(ui.context.editing.draft, input); assert.equal(ui.state.closed, false)
  assert.equal(ui.state.busy, false); assert.equal(ui.context.inFlight.current, false)
  assert.match(ui.state.errors[0], /reload/)
})
test('Screening duplicate submit and late response never overwrite a changed workspace', async () => {
  const ui = fixture(); let resolve
  ui.context.props.save = () => new Promise(done => { resolve = done })
  const first = ui.run(); await ui.run()
  assert.equal(ui.context.inFlight.current, true)
  ui.context.props.bookingUpdatedAt = 'new-state'
  resolve({ booking: { jobId: 'booking' } }); await first
  assert.equal(ui.state.applied.length, 0); assert.equal(ui.state.closed, false)
  assert.match(ui.state.errors[0], /workspace changed/)
})
test('Screening response from another Booking is rejected without discarding the draft', async () => {
  const ui = fixture()
  ui.context.props.save = async () => ({ booking: { jobId: 'other-booking' } })
  await ui.run()
  assert.equal(ui.state.applied.length, 0); assert.equal(ui.state.closed, false)
  assert.match(ui.state.errors[0], /different Booking/)
})
