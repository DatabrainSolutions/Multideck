import test from 'node:test'
import assert from 'node:assert/strict'
import { createCustomsCalculationRunner } from '../src/lib/customs-calculation-runner.ts'

test('calculation waits for a confirmed save and shares an in-flight operation', async () => {
  let release
  const saved = new Promise(resolve => { release = resolve })
  const calls = []
  const run = createCustomsCalculationRunner(async () => { calls.push('save'); await saved }, async () => { calls.push('calculate'); return { id: 'audit' } })
  const first = run(), second = run()
  assert.equal(first, second)
  await Promise.resolve()
  assert.deepEqual(calls, ['save'])
  release()
  assert.deepEqual(await first, { id: 'audit' })
  assert.deepEqual(calls, ['save', 'calculate'])
})

test('a failed or superseded save prevents calculation; an explicit retry can recover', async () => {
  let saved = false, calculations = 0
  const run = createCustomsCalculationRunner(async () => { if (!saved) throw new Error('Unsaved changes') }, async () => ++calculations)
  await assert.rejects(run(), /Unsaved changes/)
  assert.equal(calculations, 0)
  saved = true
  assert.equal(await run(), 1)
})

test('an uncertain calculation response is not automatically retried', async () => {
  let calls = 0
  const run = createCustomsCalculationRunner(async () => {}, async () => { calls++; throw new Error('Connection lost') })
  await assert.rejects(run(), /Connection lost/)
  assert.equal(calls, 1)
})
