import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sidebarTaskAgents,
  agentHasUpdate,
  isSidebarTaskAgent,
  type TaskAgent,
} from '../src/lib/task-agents.ts'
const agent = (
  id: string,
  status: TaskAgent['status'],
  unread = false,
): TaskAgent => ({
  id,
  task_id: id,
  conversation_id: `conversation-${id}`,
  name: 'Harper',
  icon: 1,
  title: 'Prepare a brief',
  status,
  summary: '',
  instruction: 'Prepare a brief',
  time_zone: 'Europe/London',
  due_at: null,
  outcome: 'deliver_result',
  message_id: id,
  result_revision: 1,
  viewed_revision: unread ? 0 : 1,
  version: 1,
  updated_at: `2026-09-10T12:00:0${id}Z`,
  taskStatus: 'open',
  scheduledDate: '2026-09-10',
})
test('at most three visible rows, prioritising actionable updates without changing source order', () => {
  const rows = [
    agent('1', 'working'),
    agent('2', 'ready', true),
    agent('3', 'needs_input', true),
    agent('4', 'working'),
    agent('5', 'scheduled'),
  ]
  assert.deepEqual(
    sidebarTaskAgents(rows).map((a) => a.id),
    ['2', '4', '1'],
  )
  assert.deepEqual(
    rows.map((a) => a.id),
    ['1', '2', '3', '4', '5'],
  )
})
test('viewing a ready brief removes it without needing to leave the conversation', () => {
  const ready = agent('1', 'ready', true)
  assert.deepEqual(sidebarTaskAgents([ready]), [ready])
  const viewed = { ...ready, viewed_revision: ready.result_revision }
  assert.equal(agentHasUpdate(viewed), false)
  assert.deepEqual(sidebarTaskAgents([viewed]), [])
  assert.deepEqual(sidebarTaskAgents([{ ...viewed, status: 'completed', taskStatus: 'completed' }]), [])
})
test('immediate queued and working tasks remain visible independently of the current route', () => {
  for (const status of ['working', 'queued'] as const) {
    const row = agent('1', status)
    assert.deepEqual(sidebarTaskAgents([row]), [row])
  }
})
test('unsupported, blocked, failed, stopped and completed agents stay out even with unread responses', () => {
  for (const status of ['needs_input', 'failed', 'cancelled', 'completed'] as const) {
    const row = agent('1', status, true)
    assert.equal(isSidebarTaskAgent(row), false)
    assert.deepEqual(sidebarTaskAgents([row]), [])
  }
})
test('a follow-up resurfaces the agent and its new result only until viewed', () => {
  const done = { ...agent('1', 'completed'), taskStatus: 'completed' as const }
  assert.deepEqual(sidebarTaskAgents([done]), [])
  const resumed = { ...done, status: 'queued' as const, taskStatus: 'open' as const }
  assert.deepEqual(sidebarTaskAgents([resumed]), [resumed])
  const fresh = { ...resumed, status: 'ready' as const, result_revision: 2 }
  assert.deepEqual(sidebarTaskAgents([fresh]), [fresh])
  assert.deepEqual(sidebarTaskAgents([{ ...fresh, viewed_revision: 2 }]), [])
})
test('View all counts exactly the eligible agents, not hidden blockers or viewed results', () => {
  const rows = [agent('1', 'working'), agent('2', 'queued'), agent('3', 'scheduled'), agent('4', 'ready', true), agent('5', 'needs_input', true), agent('6', 'ready')]
  assert.equal(rows.filter(isSidebarTaskAgent).length, 3)
  assert.equal(sidebarTaskAgents(rows).length, 3)
  assert.equal([agent('1', 'needs_input'), agent('2', 'ready')].filter(isSidebarTaskAgent).length, 0)
})

test('scheduled and event-waiting work stays hidden until it starts, then retains the unseen response', () => {
  for (const status of ['scheduled', 'waiting'] as const) {
    const pending = { ...agent('1', status, true), due_at: '2026-09-15T08:00:00Z' }
    assert.deepEqual(sidebarTaskAgents([pending]), [])
    const working = { ...pending, status: 'working' as const }
    assert.deepEqual(sidebarTaskAgents([working]), [working])
    const ready = { ...working, status: 'ready' as const }
    assert.deepEqual(sidebarTaskAgents([ready]), [ready])
    assert.deepEqual(sidebarTaskAgents([{ ...ready, viewed_revision: ready.result_revision }]), [])
  }
})
