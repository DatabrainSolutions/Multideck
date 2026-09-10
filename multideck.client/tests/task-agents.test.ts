import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sidebarTaskAgents,
  agentHasUpdate,
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
    ['3', '2', '4'],
  )
  assert.deepEqual(
    rows.map((a) => a.id),
    ['1', '2', '3', '4', '5'],
  )
})
test('viewed output stays while its conversation is open, then leaves the sidebar', () => {
  const viewed = agent('1', 'ready'),
    unread = agent('2', 'ready', true)
  assert.equal(agentHasUpdate(viewed), false)
  assert.deepEqual(
    sidebarTaskAgents([viewed, unread], 'conversation-1').map((a) => a.id),
    ['2', '1'],
  )
  assert.deepEqual(
    sidebarTaskAgents([viewed, unread]).map((a) => a.id),
    ['2'],
  )
})
test('new revisions resurface the same agent, while ordinary completion does not invent an update', () => {
  const done = agent('1', 'completed')
  assert.deepEqual(sidebarTaskAgents([done]), [])
  assert.equal(
    sidebarTaskAgents([{ ...done, result_revision: 2 }])[0].id,
    done.id,
  )
})
