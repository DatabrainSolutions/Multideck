import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../functions/_shared/provisional-cancellation-policy.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const context = vm.createContext({ exports: {} })
vm.runInContext(compiled, context)
const plan = context.exports.planProvisionalCancellation
const state = { status: 'draft', planningChargeCount: 0, hasFinancialRecords: false, cancellation: null }
const cancel = { action: 'cancel', reason: 'Customer postponed shipment' }

test('empty provisional cancellation remains non-financial and produces an audit intent', () => {
  const result = plan(state, cancel)
  assert.equal(result.status, 'cancelled')
  assert.equal(result.financialReportingEligible, false)
  assert.equal(result.event, 'provisional_cancelled')
  assert.equal(result.decision, null)
  assert.equal(state.status, 'draft')
})
test('planning charges require an explicit decision', () => {
  assert.throws(() => plan({ ...state, planningChargeCount: 2 }, cancel), /Keep or Discard/)
  for (const decision of ['keep', 'discard']) {
    const result = plan({ ...state, planningChargeCount: 2 }, { ...cancel, decision })
    assert.equal(result.chargeAction, decision === 'keep' ? 'retain-inactive' : 'archive-discarded')
    assert.equal(result.financialReportingEligible, false)
  }
})
test('reopening preserves both charge decisions, returns draft and requires price/date review', () => {
  for (const decision of ['keep', 'discard', null]) {
    const result = plan({ ...state, status: 'cancelled', cancellation: { origin: 'provisional', decision } }, { action: 'reopen', reason: 'Customer returned' })
    assert.equal(result.status, 'draft')
    assert.equal(result.chargeAction, 'preserve')
    assert.equal(result.decision, decision)
    assert.equal(result.reviewPricesAndDates, true)
    assert.equal(result.financialReportingEligible, false)
  }
})
test('financial activity cannot be hidden or discarded by either action', () => {
  for (const action of ['cancel', 'reopen']) assert.throws(() => plan({ ...state, hasFinancialRecords: true }, { ...cancel, action }), /Finance review/)
})
test('completed, active, archived and unrecorded cancellations are not reopened', () => {
  for (const status of ['open', 'complete', 'closed', 'archived', 'cancelled']) {
    assert.throws(() => plan({ ...state, status }, { action: 'reopen', reason: 'Retry' }), /recorded provisional/)
    assert.throws(() => plan({ ...state, status }, cancel), /Only Provisional/)
  }
})
test('invalid decisions, missing reasons and invalid counts fail closed', () => {
  assert.throws(() => plan(state, { ...cancel, decision: 'delete' }), /Keep or Discard/)
  assert.throws(() => plan(state, { ...cancel, reason: ' ' }), /reason/)
  for (const planningChargeCount of [-1, 0.5, NaN]) assert.throws(() => plan({ ...state, planningChargeCount }, cancel), /count/)
  assert.throws(() => plan({ ...state, status: 'cancelled', cancellation: { origin: 'provisional', decision: 'discard' } }, { action: 'reopen', reason: 'Retry', decision: 'keep' }), /cannot change/)
})
