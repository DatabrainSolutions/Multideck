import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundTaskInstructions, validateBackgroundOutcome } from '../functions/agent-dexter/background-task.ts'

test('task-date scheduling uses the operator local day across UTC midnight', () => {
  const context = { now: '2026-09-10T23:33:00Z', time_zone: 'Europe/London', phase: 'discover', scheduledDate: '2026-09-11', instruction: 'Turn those priorities into a checklist.' }
  assert.match(backgroundTaskInstructions(context), /timezone: 2026-09-11/)
  assert.match(backgroundTaskInstructions(context), /not a future scheduling instruction/)
  assert.match(backgroundTaskInstructions({ ...context, scheduledDate: '2026-09-12' }), /selected task date is in the future/)
  assert.match(backgroundTaskInstructions({ ...context, now: '2026-09-11T01:00:00Z', time_zone: 'America/Los_Angeles', scheduledDate: '2026-09-10' }), /not a future scheduling instruction/)
})
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
    /already authorised to execute now/,
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

Deno.test('Do now and due runs override the original execution time while keeping the research date', () => {
 const instructions = backgroundTaskInstructions({ phase: 'execute', now: '2026-09-11T00:00:00Z', time_zone: 'Europe/London', scheduledDate: '2026-09-12', instruction: 'Tomorrow at 09:00 summarise my meetings' })
 if (!instructions.includes('EXECUTE NOW') || !instructions.includes('overrides any future execution time') || !instructions.includes('Keep the requested subject/date')) throw new Error('Missing execution override')
 try {
  validateBackgroundOutcome({status:'scheduled',summary:'Schedule later',run_at:'2026-09-12T08:00:00Z'}, {phase:'execute',now:Date.parse('2026-09-11T00:00:00Z'),watchIds:new Set(),hasPending:false})
  throw new Error('Execution rescheduled')
 } catch (error) {
  if (!(error instanceof Error) || !error.message.includes('Return the requested result now')) throw error
 }
})

Deno.test('delayed execution preserves the original relative-date anchor', () => {
 const instructions=backgroundTaskInstructions({phase:'execute',now:'2026-09-12T08:00:00Z',instructionReceivedAt:'2026-09-11T00:00:00Z',time_zone:'Europe/London',scheduledDate:'2026-09-11',instruction:'Tomorrow at 09:00 summarise my meetings'})
 assert.match(instructions,/Original request received at: 2026-09-11T00:00:00Z/)
 assert.match(instructions,/never from a later execution\/retry date/)
})
