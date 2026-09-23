import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../../multideck.client/src/lib/booking-planning-charges.ts', import.meta.url), 'utf8')
const context = vm.createContext({ exports: {}, TextEncoder })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
const { readBookingPlanningChargeSet: read, bookingPlanningEditorRows: editor, bookingPlanningSavePayload: save } = context.exports
const { readBookingPlanningWorkspace: workspace } = context.exports
const job = '11111111-1111-4111-8111-111111111111'
const row = { id: 'aaaaaaaa-1111-4111-8111-111111111111', code: 'FRT', description: 'Sea freight', cost: 120, sell: 250, costCurrency: 'EUR', sellCurrency: 'USD', costRoe: 1.2, sellRoe: 1.25, quantity: 3, calculationBasis: 'container' }
const raw = (rows = [row]) => ({ job_id: job, revision: 7, base_currency: 'GBP', rows })
const plain = value => JSON.parse(JSON.stringify(value))

test('read/edit/save retains saved amounts, currency, rates, quantity and revision', () => {
  const set = read(raw(), job)
  const rows = editor(set)
  assert.equal(rows[0].costRoeSource, 'manual')
  assert.equal(rows[0].sellRoeSource, 'manual')
  assert.equal(rows[0].cost / rows[0].costRoe, 100)
  assert.equal(rows[0].sell / rows[0].sellRoe, 200)
  assert.deepEqual(plain(save(set, rows)), { jobId: job, expectedRevision: 7, baseCurrency: 'GBP', rows: [row] })
  assert.deepEqual(plain(set.rows), [row], 'The read snapshot is not mutated by editing')
})

test('UI-derived totals and supplied identity never become stored charge fields', () => {
  const set = read(raw(), job)
  const payload = save(set, [{ ...editor(set)[0], baseCost: 999, baseSell: 888, profit: 777, caller_auth_user_id: 'spoof' }])
  assert.deepEqual(plain(payload.rows), [row])
  assert.equal('caller_auth_user_id' in payload, false)
})

test('missing/corrupt responses never turn into an empty working plan', () => {
  for (const value of [null, {}, { ...raw(), rows: null }, { ...raw(), revision: '7' }, { ...raw(), revision: -1 }, { ...raw(), revision: Number.MAX_SAFE_INTEGER + 1 }, { ...raw(), base_currency: '' }, { ...raw(), job_id: '22222222-2222-4222-8222-222222222222' }]) {
    assert.throws(() => read(value, job))
  }
})

test('discarded empty set remains empty on read and save, without snapshot resurrection', () => {
  const set = read({ ...raw([]), revision: 8, discardedHistory: [row] }, job)
  assert.deepEqual(plain(editor(set)), [])
  assert.deepEqual(plain(save(set, editor(set)).rows), [])
  const fresh = { ...row, id: 'bbbbbbbb-1111-4111-8111-111111111111' }
  assert.deepEqual(plain(save(set, [fresh]).rows), [fresh])
})

test('malformed values and unsupported parties fail rather than silently changing data', () => {
  for (const patch of [{ cost: NaN }, { sell: Infinity }, { cost: -1 }, { cost: '120' }, { costRoe: 0 }, { sellRoe: -1 }, { quantity: -1 }, { description: ' ' }, { description: 'x'.repeat(241) }, { code: 'x'.repeat(81) }, { costCurrency: 'eur' }, { costCurrency: 'GBP' }, { calculationBasis: {} }, { id: 'bad' }, { supplierId: 'bad' }, { customerId: 42 }]) {
    assert.throws(() => read(raw([{ ...row, ...patch }]), job), JSON.stringify(patch))
  }
  assert.throws(() => read(raw([row, { ...row, id: row.id.toUpperCase() }]), job))
  assert.throws(() => read(raw(Array.from({ length: 201 }, () => row)), job))
})

test('zero amounts/quantity remain zero and an unset editor quantity defaults to one', () => {
  const set = read(raw([{ ...row, cost: 0, sell: 0, quantity: 0 }]), job)
  assert.equal(save(set, editor(set)).rows[0].quantity, 0)
  assert.equal(save(set, [{ ...editor(set)[0], quantity: null }]).rows[0].quantity, 1)
  assert.equal(save(set, editor(set)).rows[0].sell, 0)
})

test('workspace decoding distinguishes unsupported, read-only and editable responses', () => {
  assert.deepEqual(plain(workspace({ supported: false }, job)), { supported: false })
  const response = { supported: true, editable: true, blockedReason: null, chargeSet: raw(), parties: [], currencies: [
    { code: 'GBP', name: 'Pound', symbol: 'GBP', decimalPlaces: 2 },
  ], bookingUpdatedAt: '2026-09-19T10:00:00.123456+00:00' }
  assert.equal(workspace(response, job).chargeSet.revision, 7)
  assert.equal(workspace(response, job).bookingUpdatedAt, response.bookingUpdatedAt)
  assert.equal(workspace({ ...response, editable: false, blockedReason: 'Choose a legal entity', chargeSet: null }, job).chargeSet, null)
  for (const patch of [{ chargeSet: null }, { supported: null }, { editable: 'true' }, { blockedReason: 'Blocked' }, { currencies: [] }, { bookingUpdatedAt: 'invalid' }, { currencies: [{ ...response.currencies[0], decimalPlaces: -1 }] }]) {
    assert.throws(() => workspace({ ...response, ...patch }, job))
  }
})

test('party IDs survive read/edit/save without being inferred from names', () => {
  const withParties = { ...row, supplierId: job, customerId: null }
  const set = read(raw([withParties]), job)
  assert.deepEqual(plain(save(set, editor(set)).rows), [withParties])
})
