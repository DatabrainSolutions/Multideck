import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../package.json', import.meta.url))
const { buildSync, transformSync } = require('esbuild')
const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../src/lib/booking-dangerous-goods-editor.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' }).outputFiles[0].text
const { dangerousGoodsDraft, dangerousGoodsChanges, DangerousGoodsInputError } = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`)
const original = { id: 'evidence', cargoId: 'cargo', source: 'operator', status: 'recorded', operatorEditable: true, updatedAt: 'record-stamp',
  unNumber: '1234', properShippingName: ' Original supplied text ', sourceReference: 'Source', marinePollutant: null, limitedQuantity: false }
const draft = record => ({ ...dangerousGoodsDraft(record), reason: 'Synthetic evidence' })

test('DG draft retains unknown versus No and does not normalise unedited source text', () => {
  const input = draft(original)
  assert.equal(input.marinePollutant, '')
  assert.equal(input.limitedQuantity, 'no')
  assert.deepEqual(dangerousGoodsChanges(input, original), {})
  assert.deepEqual(dangerousGoodsChanges({ ...input, marinePollutant: 'no', limitedQuantity: '' }, original), { marinePollutant: false, limitedQuantity: null })
  assert.deepEqual(dangerousGoodsChanges({ ...input, notes: ' New supplied context ' }, original), { notes: 'New supplied context' })
})
test('DG validation identifies required source, identity, reason and malformed flags', () => {
  assert.throws(() => dangerousGoodsChanges({ ...draft(), unNumber: '1234' }), error => error.field === 'sourceReference')
  assert.throws(() => dangerousGoodsChanges({ ...draft(), sourceReference: 'Source' }), error => error.field === 'unNumber')
  assert.throws(() => dangerousGoodsChanges({ ...draft(original), reason: '' }, original), error => error.field === 'reason')
  assert.throws(() => dangerousGoodsChanges({ ...draft(original), marinePollutant: 'false' }, original), error => error.field === 'marinePollutant')
  assert.throws(() => dangerousGoodsChanges({ ...draft(original), class: 'x'.repeat(21) }, original), error => error.field === 'class')
})
test('DG void retains evidence and legacy records cannot be edited', () => {
  assert.deepEqual(dangerousGoodsChanges({ ...draft(original), status: 'voided', notes: 'Do not write' }, original), { status: 'voided' })
  assert.throws(() => dangerousGoodsChanges({ ...draft(), status: 'voided' }), error => error.field === 'status')
  assert.throws(() => dangerousGoodsChanges(draft(original), { ...original, source: 'legacy' }), /read-only/)
})

// Execute the actual submit handler. Hooks/DOM/API transport are explicit
// fixtures; Chrome component checks and PostgreSQL independently cover those layers.
const source = readFileSync(new URL('../src/components/multideck/booking-dangerous-goods.tsx', import.meta.url), 'utf8')
const start = source.indexOf('onSubmit={async event => {') + 'onSubmit={async event => {'.length
const end = source.indexOf('\n          }}>', start)
assert.ok(start > 30 && end > start)
const callback = transformSync(`async function submit(event) {${source.slice(start, end)}\n}`, { loader: 'ts' }).code
const execute = new Function('context', 'event', `with (context) { ${callback}; return submit(event); }`)
function fixture() {
  const state = { saves: [], applied: [], errors: [], closed: false, busy: false }
  const props = { bookingId: 'booking', bookingUpdatedAt: 'booking-stamp', cargo: { id: 'cargo', updatedAt: 'cargo-stamp' }, editable: true,
    onSaved: value => state.applied.push(value), save: async payload => { state.saves.push(payload); return { booking: { jobId: 'booking' }, documents: ['Original'] } } }
  const context = { props, canEdit: true, t: value => value, dangerousGoodsChanges, DangerousGoodsInputError,
    editing: { id: 'evidence', bookingId: 'booking', cargoId: 'cargo', stamp: 'booking-stamp', cargoStamp: 'cargo-stamp', original,
      draft: { ...draft(original), marinePollutant: 'no' } }, inFlight: { current: false }, mounted: { current: true }, latest: { current: props },
    setError: value => { if (value) state.errors.push(value) }, setErrorField: value => { state.errorField = value },
    setBusy: value => { state.busy = value }, setMessage: value => { state.message = value }, setEditing: value => { state.closed = value === null } }
  return { state, context, run: () => execute(context, { preventDefault() {} }) }
}
test('DG actual submit binds cargo, identity, all timestamps and exact changed fields', async () => {
  const ui = fixture(); await ui.run()
  assert.deepEqual(ui.state.saves, [{ id: 'evidence', cargoId: 'cargo', expectedUpdatedAt: 'booking-stamp', expectedCargoUpdatedAt: 'cargo-stamp',
    expectedRecordUpdatedAt: 'record-stamp', changes: { marinePollutant: false }, reason: 'Synthetic evidence' }])
  assert.equal(ui.state.closed, true)
  assert.deepEqual(ui.state.applied[0].documents, ['Original'])
})
test('DG dirty parent, changed identity or stale timestamps prevent submission', async () => {
  for (const change of [ui => { ui.context.canEdit = false }, ui => { ui.context.props.cargo.id = 'other' },
    ui => { ui.context.props.bookingUpdatedAt = 'stale' }, ui => { ui.context.props.cargo.updatedAt = 'stale' }]) {
    const ui = fixture(); change(ui); await ui.run()
    assert.equal(ui.state.saves.length, 0); assert.equal(ui.state.closed, false); assert.match(ui.state.errors[0], /changed/)
  }
})
test('DG API rejection retains draft and releases busy state for recovery', async () => {
  const ui = fixture(), input = structuredClone(ui.context.editing.draft)
  ui.context.props.save = async () => { throw new Error('Stale record: reload') }
  await ui.run()
  assert.deepEqual(ui.context.editing.draft, input); assert.equal(ui.state.closed, false)
  assert.equal(ui.state.busy, false); assert.equal(ui.context.inFlight.current, false)
  assert.match(ui.state.errors[0], /reload/)
})
test('DG duplicate submit and late response never overwrite a changed workspace', async () => {
  const ui = fixture(); let resolve
  ui.context.props.save = () => new Promise(done => { resolve = done })
  const first = ui.run(); await ui.run()
  assert.equal(ui.context.inFlight.current, true)
  ui.context.props.bookingUpdatedAt = 'new-state'
  resolve({ booking: { jobId: 'booking' } }); await first
  assert.equal(ui.state.applied.length, 0); assert.equal(ui.state.closed, false)
  assert.match(ui.state.errors[0], /workspace changed/)
})
test('DG response from another Booking is rejected without discarding the draft', async () => {
  const ui = fixture()
  ui.context.props.save = async () => ({ booking: { jobId: 'other-booking' } })
  await ui.run()
  assert.equal(ui.state.applied.length, 0); assert.equal(ui.state.closed, false)
  assert.match(ui.state.errors[0], /different Booking/)
})
