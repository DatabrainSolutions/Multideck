import { useEffect } from 'react'
import type { TaskAgent } from './task-agents'
import { controlTaskAgent } from './task-agent-store'

/** Reading the actual latest result, not fetching it, acknowledges delivery. */
export function useTaskResultViewed(
  agent: TaskAgent | undefined,
  renderedMessageIds: string[],
) {
  const rendered = Boolean(
    agent &&
    (agent.message_id
      ? renderedMessageIds.includes(agent.message_id)
      : agent.status === 'failed'),
  )
  useEffect(() => {
    if (!agent || !rendered || agent.result_revision <= agent.viewed_revision)
      return
    const node = document.querySelector(
      agent.message_id
        ? `[data-task-message-id="${CSS.escape(agent.message_id)}"]`
        : `[data-task-agent-id="${CSS.escape(agent.id)}"]`,
    )
    if (!node) return
    let visible = false,
      disposed = false,
      pending = false
    const mark = () => {
      if (
        disposed ||
        pending ||
        !visible ||
        document.visibilityState !== 'visible'
      )
        return
      pending = true
      void controlTaskAgent(agent, 'view').catch(() => {
        pending = false
      })
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting)
        mark()
      },
      { threshold: 0 },
    )
    observer.observe(node)
    document.addEventListener('visibilitychange', mark)
    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', mark)
    }
  }, [
    agent?.id,
    agent?.message_id,
    agent?.result_revision,
    agent?.viewed_revision,
    rendered,
  ])
}
