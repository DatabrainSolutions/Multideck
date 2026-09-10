export type TaskAgentStatus =
  | 'queued'
  | 'scheduled'
  | 'waiting'
  | 'working'
  | 'ready'
  | 'needs_input'
  | 'failed'
  | 'cancelled'
  | 'completed'
export type TaskAgent = {
  id: string
  task_id: string
  conversation_id: string
  title: string
  name: string
  icon: number | null
  status: TaskAgentStatus
  summary: string
  instruction: string
  time_zone: string
  due_at: string | null
  outcome: 'deliver_result' | 'send_email' | 'apply_changes' | null
  message_id: string | null
  result_revision: number
  viewed_revision: number
  version: number
  updated_at: string
  taskStatus: 'open' | 'completed'
  scheduledDate: string
}
export const taskAgentStatus: Record<TaskAgentStatus, string> = {
  queued: 'Queued',
  scheduled: 'Scheduled',
  waiting: 'Waiting for an event',
  working: 'Working',
  ready: 'Ready to review',
  needs_input: 'Needs input',
  failed: 'Could not finish',
  cancelled: 'Stopped',
  completed: 'Done',
}
export function agentHasUpdate(agent: TaskAgent) {
  return (
    agent.result_revision > agent.viewed_revision &&
    ['ready', 'needs_input', 'failed', 'completed'].includes(agent.status)
  )
}
export function sidebarTaskAgents(
  agents: TaskAgent[],
  openConversationId: string | null = null,
) {
  const rank = (a: TaskAgent) =>
    agentHasUpdate(a)
      ? ['failed', 'needs_input'].includes(a.status)
        ? 0
        : 1
      : 2
  return agents
    .filter(
      (a) =>
        a.status === 'working' ||
        agentHasUpdate(a) ||
        (a.conversation_id === openConversationId &&
          a.result_revision > 0 &&
          ['ready', 'needs_input', 'failed', 'completed'].includes(a.status)),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.updated_at.localeCompare(a.updated_at) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
}
export function taskAgentUrl(agent: Pick<TaskAgent, 'conversation_id'>) {
  return `/agent-dexter?conversation=${encodeURIComponent(agent.conversation_id)}`
}
