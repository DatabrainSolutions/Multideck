import test from 'node:test'
import assert from 'node:assert/strict'
import { createLiveCalculationRequest, customsPreviewInput } from '../src/lib/customs-live-calculation.ts'

test('a newer preview wins even when the old transport ignores abort', async () => {
  const pending = []
  const runner = createLiveCalculationRequest((input, signal) => new Promise(resolve => pending.push({ input, signal, resolve })))
  const results = [], errors = []
  const first = runner.run({ itemPrice: '10' }, v => results.push(v), e => errors.push(e))
  const second = runner.run({ itemPrice: '20' }, v => results.push(v), e => errors.push(e))
  assert.equal(pending[0].signal.aborted, true)
  pending[1].resolve('new')
  await second
  pending[0].resolve('old')
  await first
  assert.deepEqual(results, ['new'])
  assert.deepEqual(errors, [])
})

test('cancelling on edits or unmount suppresses late errors without retrying', async () => {
  let fail, calls = 0
  const runner = createLiveCalculationRequest(() => { calls++; return new Promise((_resolve, reject) => { fail = reject }) })
  const errors = []
  const operation = runner.run({}, () => assert.fail('No result expected'), e => errors.push(e))
  runner.cancel()
  fail(new Error('Old request failed'))
  await operation
  assert.equal(calls, 1)
  assert.deepEqual(errors, [])
})

test('current errors remain recoverable and only an explicit run retries', async () => {
  let calls = 0
  const runner = createLiveCalculationRequest(async () => { calls++; throw new Error('Offline') })
  const errors = []
  await runner.run({}, () => assert.fail(), e => errors.push(e.message))
  assert.deepEqual(errors, ['Offline'])
  assert.equal(calls, 1)
})

test('invoice, item, cost and territory changes affect preview; unrelated notes do not', () => {
  const source = { direction: 'import', invoiceHeaders: [{ id: 'invoice', currency: 'GBP' }], items: [{ id: 'item', itemPrice: '10' }], dutyCalculationSetup: { jurisdiction: 'GB' }, importAdjustments: [], internalNotes: 'private note', importerEmail: 'private contact' }
  const before = customsPreviewInput(source)
  assert.deepEqual(customsPreviewInput({ ...source, internalNotes: 'other note' }), before)
  assert.equal('importerEmail' in before, false)
  for (const change of [{ items: [{ id: 'item', itemPrice: '20' }] }, { invoiceHeaders: [{ id: 'invoice', currency: 'USD' }] }, { importAdjustments: [{ amount: '5' }] }, { dutyCalculationSetup: { jurisdiction: 'NI' } }]) assert.notDeepEqual(customsPreviewInput({ ...source, ...change }), before)
})
