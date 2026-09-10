import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBackgroundOutcome } from '../functions/agent-dexter/background-task.ts'
const options = {
  phase: 'discover',
  now: Date.parse('2026-09-10T12:00:00Z'),
  watchIds: new Set(['saved-watch']),
  hasPending: false,
}
const result = {
  status: 'ready',
  outcome: 'deliver_result',
  summary: 'Brief with sources',
  run_at: null,
  watch_id: null,
}
test('prepared changes cannot be presented as delivered work', () => {
  assert.throws(
    () => validateBackgroundOutcome(result, { ...options, hasPending: true }),
    /pending change/,
  )
  assert.equal(
    validateBackgroundOutcome(
      { ...result, outcome: 'send_email' },
      { ...options, hasPending: true },
    ).outcome,
    'send_email',
  )
  assert.equal(
    validateBackgroundOutcome(result, {
      ...options,
      hasPending: true,
      draftOnly: true,
    }).outcome,
    'deliver_result',
  )
  assert.throws(
    () =>
      validateBackgroundOutcome(result, {
        ...options,
        hasPending: true,
        draftOnly: true,
        incompleteDraft: true,
      }),
    /verified recipient/,
  )
})
test('time scheduling requires timezone, future time and discovery phase', () => {
  assert.throws(
    () =>
      validateBackgroundOutcome(
        { ...result, status: 'scheduled', run_at: '2026-09-09T10:00:00Z' },
        options,
      ),
    /future/,
  )
  assert.throws(
    () =>
      validateBackgroundOutcome(
        { ...result, status: 'scheduled', run_at: '2026-09-12T10:00:00' },
        options,
      ),
    /timezone/,
  )
  assert.throws(
    () =>
      validateBackgroundOutcome(
        { ...result, status: 'scheduled', run_at: '2026-09-12T10:00:00Z' },
        { ...options, phase: 'execute' },
      ),
    /discovery/,
  )
  assert.equal(
    validateBackgroundOutcome(
      { ...result, status: 'scheduled', run_at: '2026-09-12T10:00:00+01:00' },
      options,
    ).status,
    'scheduled',
  )
})
test('event delegation needs a watch actually created by this run', () => {
  assert.throws(
    () =>
      validateBackgroundOutcome(
        { ...result, status: 'waiting', watch_id: 'invented-watch' },
        options,
      ),
    /exact event/,
  )
  assert.equal(
    validateBackgroundOutcome(
      { ...result, status: 'waiting', watch_id: 'saved-watch' },
      options,
    ).status,
    'waiting',
  )
  assert.throws(
    () => validateBackgroundOutcome({ ...result, summary: '' }, options),
    /useful result/,
  )
})
