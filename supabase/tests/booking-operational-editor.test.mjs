import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
function load(path, imports = {}) {
  const context = vm.createContext({ exports: {}, TextEncoder, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`)
    return imports[name]
  } })
  vm.runInContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports
}
const planning = load('../../multideck.client/src/lib/booking-planning-charges.ts')
const { readOperationalCharges: read, operationalEditorRows: editor, operationalChargeSavePayload: save } = load('../../multideck.client/src/lib/booking-operational-charges.ts', { './booking-planning-charges': planning })
const { parseOperationalChargeSave: parse, parseAction } = load('../functions/bookings-workflow/core.ts')
const job = '11111111-1111-4111-8111-111111111111', id = 'aaaaaaaa-1111-4111-8111-111111111111'
const row = { id, code: 'FRT', description: 'Freight', cost: 100, sell: 150, costCurrency: 'GBP', sellCurrency: 'GBP', costRoe: 1, sellRoe: 1, quantity: 1, calculationBasis: 'fixed', supplierId: null, customerId: null }
const raw = () => ({ supported: true, jobId: job, editable: true, blockedReason: null, baseCurrency: 'GBP', bookingUpdatedAt: '2026-09-21T12:00:00.000Z',
  currencies: [{ code: 'GBP', name: 'Pound sterling', symbol: '£', decimalPlaces: 2 }], parties: [],
  lines: [{ id, values: row, snapshot: { JobCostingLine_ID: id, Job_ID: job, untouched: 'preserve' }, blockedReason: null }] })
const plain = value => JSON.parse(JSON.stringify(value))
test('an absent pending Quote review is a successful empty state, not an API failure', async () => {
  const chargeModule = load('../../multideck.client/src/lib/booking-operational-charges.ts', { './booking-planning-charges': planning })
  let response = { data: null, error: null }
  const api = load('../../multideck.client/src/lib/booking-workflow-api.ts', {
    '@/lib/supabase': { supabase: { functions: { invoke: async () => response } } },
    '@/lib/booking-planning-charges': planning,
    '@/lib/booking-operational-charges': chargeModule,
  })
  assert.equal(await api.getBookingQuoteChargeReview(job), null)
  response = { data: undefined, error: null }
  await assert.rejects(api.getBookingQuoteChargeReview(job), /could not be loaded/)
})
test('operational editor emits only changed lines with full concurrency snapshots', () => {
  const workspace = read(raw(), job), rows = editor(workspace)
  assert.deepEqual(plain(save(workspace, rows, 'No changes').operations), [])
  const payload = save(workspace, [{ ...rows[0], cost: 125, sell: 175, baseCost: 999, caller_auth_user_id: 'spoof' }], 'Price agreed')
  assert.equal(payload.operations[0].action, 'update')
  assert.equal(payload.operations[0].before.untouched, 'preserve')
  assert.equal(payload.operations[0].after.cost, 125)
  assert.equal(payload.operations[0].after.baseCost, undefined)
  assert.equal(payload.operations[0].after.caller_auth_user_id, undefined)
  assert.equal(workspace.lines[0].values.cost, 100)
})
test('add and remove are separate audited decisions, never a full-table replacement', () => {
  const workspace = read(raw(), job)
  const payload = save(workspace, [{ ...row, id: 'bbbbbbbb-1111-4111-8111-111111111111' }], 'Changed service')
  assert.deepEqual(plain(payload.operations.map(op => op.action)), ['remove', 'add'])
  assert.equal(payload.operations[0].before.JobCostingLine_ID, id)
  assert.equal(payload.operations[1].before, undefined)
})
test('protected and unreadable historic rows remain untouched', () => {
  const source = raw(); source.lines[0].blockedReason = 'Financial evidence exists'
  const workspace = read(source, job)
  assert.throws(() => save(workspace, [], 'Remove'))
  assert.throws(() => save(workspace, [{ ...row, cost: 125 }], 'Edit'))
  source.lines[0].values = { ...row, costCurrency: null }
  const historic = read(source, job)
  assert.deepEqual(plain(editor(historic)), [])
  assert.deepEqual(plain(save(historic, [], 'Preserve').operations), [])
})
test('corrupt, foreign and duplicate identities fail closed', () => {
  for (const source of [null, {}, { ...raw(), jobId: id }, { ...raw(), lines: [...raw().lines, ...raw().lines] }, { ...raw(), editable: true, baseCurrency: null }]) assert.throws(() => read(source, job))
  assert.deepEqual(plain(read({ supported: false }, job)), { supported: false })
})
test('Edge parser allowlists the new actions and never trusts body identity', () => {
  assert.equal(parseAction('operational-charges'), 'operational-charges')
  const payload = save(read(raw(), job), [], 'Remove')
  assert.equal(parse({ ...payload, caller_auth_user_id: 'spoof' }).caller_auth_user_id, undefined)
  for (const input of [{ ...payload, expectedUpdatedAt: 'yesterday' }, { ...payload, operations: [...payload.operations, ...payload.operations] }, { ...payload, operations: [{ ...payload.operations[0], action: 'restore' }] }]) assert.throws(() => parse(input))
})
