import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = readFileSync(new URL('../src/lib/booking-cargo-allocations.ts', import.meta.url), 'utf8')
const { analyseCargoAllocations, remainingForAllocation, bookingCargoAllocationPayload, newBookingCargoAllocation } =
  await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const cargo = [{ id: id(1), description: 'Machine parts', packageQuantity: '10', grossWeightKg: '1000.5', volumeCbm: '14.25' }]
const equipment = [{ id: id(2), type: '40GP', verifiedGrossMassKg: '1700' }, { id: id(3), type: '20GP' }]
const routes = [{ id: id(4) }, { id: id(5) }]
const line = (change = {}) => ({ id: id(6), cargoId: id(1), containerId: id(2), routeId: null, packageQuantity: '6', grossWeightKg: '600.25', volumeCbm: '8.125', notes: null, archived: false, ...change })
const analyse = lines => analyseCargoAllocations(cargo, equipment, routes, lines)

test('split cargo: explicit remaining quantities preserve exact decimals and do not mutate source data', () => {
  const first = line(), second = line({ id: id(7), containerId: id(3), packageQuantity: null, grossWeightKg: null, volumeCbm: null })
  const before = structuredClone({ cargo, equipment, first, second })
  assert.deepEqual(analyse([first, second]).balances[0].remaining, { packageQuantity: null, grossWeightKg: null, volumeCbm: null })
  const filled = { ...second, ...remainingForAllocation(cargo, [first, second], second) }
  assert.equal(filled.packageQuantity, '4')
  assert.equal(filled.grossWeightKg, '400.25')
  assert.equal(filled.volumeCbm, '6.125')
  assert.deepEqual(analyse([first, filled]).balances[0].remaining, { packageQuantity: '0', grossWeightKg: '0', volumeCbm: '0' })
  assert.deepEqual({ cargo, equipment, first, second }, before)
})

test('unknown source/other allocation quantities cannot erase an operator-entered value', () => {
  const goods = [{ ...cargo[0], packageQuantity: null, pieces: '', grossWeightKg: '1000.5', volumeCbm: null }]
  const target = line({ volumeCbm: '4.125' })
  const remaining = remainingForAllocation(goods, [target], target)
  assert.deepEqual(remaining, { grossWeightKg: '1000.5' })
  assert.equal({ ...target, ...remaining }.volumeCbm, '4.125')
  assert.deepEqual(remainingForAllocation(cargo, [line({ id: id(8), packageQuantity: null, grossWeightKg: null, volumeCbm: null }), target], target), {})
})

test('decimal boundaries, grouped source values, zero and known partial over-allocation', () => {
  const huge = [{ ...cargo[0], packageQuantity: '999999999999.999999', grossWeightKg: '9999999999999999.99', volumeCbm: '1,234.000001' }]
  const target = line({ packageQuantity: '0', grossWeightKg: '0', volumeCbm: '0' })
  assert.deepEqual(remainingForAllocation(huge, [target], target), { packageQuantity: '999999999999.999999', grossWeightKg: '9999999999999999.99', volumeCbm: '1234.000001' })
  assert.equal(analyse([line({ packageQuantity: '11' }), line({ id: id(7), containerId: id(3), packageQuantity: null })]).issues.some(x => x.field === 'packageQuantity'), true)
  for (const value of ['-1', 'NaN', '1e2', '0.0000001', '1000000000000', '1,000']) {
    assert.equal(analyse([line({ packageQuantity: value })]).issues.some(x => x.field === 'packageQuantity'), true, value)
  }
  assert.equal(analyse([line({ grossWeightKg: '0.001' })]).issues.some(x => x.field === 'grossWeightKg'), true)
  assert.equal(analyse([line({ packageQuantity: '0.0000000', grossWeightKg: '0.000', volumeCbm: '0' })]).issues.length, 0)
  assert.equal(analyseCargoAllocations([{ ...cargo[0], packageQuantity: null, pieces: '7' }], equipment, routes, [line()]).balances[0].remaining.packageQuantity, '1')
})

test('same goods on successive legs balance independently, but whole journey cannot overlap a leg', () => {
  const first = line({ routeId: id(4), packageQuantity: '10', grossWeightKg: '1000.5', volumeCbm: '14.25' })
  const second = { ...first, id: id(7), routeId: id(5) }
  assert.equal(analyse([first, second]).issues.length, 0)
  assert.equal(analyse([first, second]).balances.length, 2)
  assert.deepEqual(remainingForAllocation(cargo, [first, second], second), { packageQuantity: '10', grossWeightKg: '1000.5', volumeCbm: '14.25' })
  assert.equal(analyse([line(), second]).issues.some(x => x.field === 'routeId'), true)
})

test('identities, removed members, duplicate slots and notes are validated before save', () => {
  for (const change of [{ cargoId: id(99) }, { containerId: id(99) }, { routeId: id(99) }, { archived: true }, { id: 'unsaved' }, { notes: 'x'.repeat(2001) }]) {
    assert.ok(analyse([line(change)]).issues.length, JSON.stringify(change))
  }
  assert.ok(analyse([line(), line()]).issues.some(x => x.field === 'cargoId'))
  assert.ok(analyse([line(), line({ id: id(7) })]).issues.some(x => x.field === 'containerId'))
  assert.equal(analyse([line({ notes: '📦'.repeat(2000) })]).issues.length, 0)
  assert.ok(analyseCargoAllocations([], equipment, routes, [line()]).issues.some(x => x.field === 'cargoId'))
  assert.ok(analyseCargoAllocations(cargo, [], routes, [line()]).issues.some(x => x.field === 'containerId'))
  assert.match(newBookingCargoAllocation().id, /^[0-9a-f-]{36}$/)
})

test('save payload distinguishes missing capability, empty plan and explicit removal; pins saved Job timestamp', () => {
  const workspace = allocations => ({ booking: { jobId: id(10), updatedAt: '2026-09-06T10:00:00Z' }, cargoAllocationState: { jobId: id(10), allocations } })
  const baseline = workspace([line()])
  const before = structuredClone(baseline)
  const payload = bookingCargoAllocationPayload(baseline, baseline)
  assert.equal(payload.expectedUpdatedAt, before.booking.updatedAt)
  assert.equal('archived' in payload.cargoAllocations[0], false)
  assert.equal(payload.cargoAllocations[0].grossWeightKg, '600.25')
  assert.deepEqual(bookingCargoAllocationPayload(workspace([]), baseline), { cargoAllocations: [], expectedUpdatedAt: before.booking.updatedAt })
  assert.deepEqual(bookingCargoAllocationPayload(workspace([]), workspace([])), {})
  assert.deepEqual(bookingCargoAllocationPayload({ booking: baseline.booking }, baseline), {})
  assert.throws(() => bookingCargoAllocationPayload(baseline, { booking: baseline.booking }), /Reload/)
  assert.throws(() => bookingCargoAllocationPayload({ ...baseline, booking: { jobId: id(11) } }, baseline), /Reload/)
  assert.deepEqual(baseline, before)
})

const parentSource = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
const saveStart = parentSource.indexOf('  async function saveDetails() {')
assert.ok(saveStart > 0)
const saveSource = stripTypeScriptTypes(parentSource.slice(saveStart, parentSource.indexOf('  async function sendToCustoms()', saveStart)))
const realSave = new Function('deps', `const {draftBooking,draftWorkspace,detailsDirty,savingDetails,loadedRecord,toast,t,setAllocationValidationAttempt,analyseCargoAllocations,asRecord,bookingQuoteHandoff,recordText,bookingLookups,currentUser,calculatedDirectionForBooking,setSavingDetails,saveBookingWorkflow,bookingCargoAllocationPayload,bookingModeKey,setLiveJobStarred,applySavedWorkspace}=deps; ${saveSource}; return saveDetails()`)

test('actual Booking save handler sends allocation plan with cargo and preserves draft on stale failure', async () => {
  const workspace = { booking: { jobId: id(10), updatedAt: '2026-09-06T10:00:00Z' }, cargo, containers: equipment, routes, parties: [], cargoAllocationState: { jobId: id(10), allocations: [line()] } }
  const before = structuredClone(workspace), calls = [], busy = [], notices = []
  let applied = 0, attempts = 0
  const deps = {
    draftBooking: { mode: 'OCEAN', value: '', status: 'On track', direction: 'Export' }, draftWorkspace: workspace, detailsDirty: true, savingDetails: false,
    loadedRecord: { workspace, booking: {} }, toast: { error: (...args) => notices.push(args), success: (...args) => notices.push(args) }, t: value => value,
    setAllocationValidationAttempt: updater => { attempts = updater(attempts) }, analyseCargoAllocations,
    asRecord: value => value ?? {}, bookingQuoteHandoff: () => ({ quote: {} }), recordText: (value, key) => value[key] ?? '', bookingLookups: null, currentUser: null,
    calculatedDirectionForBooking: () => 'export', setSavingDetails: value => busy.push(value), bookingCargoAllocationPayload, bookingModeKey: value => value?.toLowerCase() ?? '',
    setLiveJobStarred: () => assert.fail('Must not toggle unrelated favourite'), applySavedWorkspace: () => { applied++ },
    saveBookingWorkflow: async (jobId, payload) => { calls.push({ jobId, payload });throw new Error('Booking changed since review. Reload before saving.') },
  }
  await realSave(deps)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.expectedUpdatedAt, workspace.booking.updatedAt)
  assert.equal(calls[0].payload.cargoAllocations[0].id, id(6))
  assert.deepEqual(calls[0].payload.cargo, cargo)
  assert.deepEqual(calls[0].payload.containers, equipment)
  assert.deepEqual(busy, [true, false])
  assert.match(notices[0][1].description, /changed since review/)
  assert.equal(applied, 0)
  assert.deepEqual(workspace, before)
  deps.draftWorkspace = { ...workspace, cargoAllocationState: { ...workspace.cargoAllocationState, allocations: [line({ packageQuantity: '11' })] } }
  await realSave(deps)
  assert.equal(calls.length, 1)
  assert.equal(attempts, 1)
  deps.draftWorkspace = { ...workspace, cargoAllocationState: { ...workspace.cargoAllocationState, allocations: [] } }
  deps.saveBookingWorkflow = async (_job, payload) => { assert.deepEqual(payload.cargoAllocations, []);return workspace }
  await realSave(deps)
  assert.equal(applied, 1)
  assert.equal(notices.at(-1)[0], 'Booking changes saved')
})
