import { useSyncExternalStore } from 'react'
import {
  supabase,
  getSupabaseSession,
  authenticatedAccessChangedEvent,
} from './supabase'
import type { TaskAgent } from './task-agents'

type State = {
  agents: TaskAgent[]
  enabled: boolean
  loading: boolean
  error: string | null
}
let state: State = { agents: [], enabled: false, loading: true, error: null }
const listeners = new Set<() => void>()
let generation = 0,
  pending: Promise<void> | null = null,
  reload = false
let disconnect: (() => void) | null = null
function publish(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn())
}
export async function refreshTaskAgents(): Promise<void> {
  if (pending) {
    reload = true
    return pending
  }
  const current = generation
  pending = (async () => {
    try {
      if (!supabase || !(await getSupabaseSession())?.user) {
        if (current === generation)
          publish({ agents: [], enabled: false, loading: false, error: null })
        return
      }
      const { data, error } = await supabase.rpc('multideck_task_workspace')
      if (error) {
        if (['PGRST202', '42883'].includes(error.code)) {
          if (current === generation)
            publish({ agents: [], enabled: false, loading: false, error: null })
          return
        }
        throw error
      }
      if (current === generation)
        publish({
          agents: Array.isArray(data?.assignments) ? data.assignments : [],
          enabled: data?.enabled === true,
          loading: false,
          error: null,
        })
    } catch {
      if (current === generation)
        publish({
          loading: false,
          error:
            'Task updates could not be loaded. Check your connection and try again.',
        })
    }
  })().finally(() => {
    pending = null
    if (reload) {
      reload = false
      void refreshTaskAgents()
    }
  })
  return pending
}
function connect() {
  const changed = () => {
    if (document.visibilityState === 'visible') void refreshTaskAgents()
  }
  const channel = supabase
    ?.channel(`task-agents-${generation}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'AI_DexterTaskAssignments' },
      changed,
    )
    .subscribe()
  const timer = window.setInterval(changed, 30_000)
  window.addEventListener('focus', changed)
  window.addEventListener('online', changed)
  document.addEventListener('visibilitychange', changed)
  void refreshTaskAgents()
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', changed)
    window.removeEventListener('online', changed)
    document.removeEventListener('visibilitychange', changed)
    if (channel) void supabase?.removeChannel(channel)
  }
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  if (listeners.size === 1) disconnect = connect()
  return () => {
    listeners.delete(fn)
    if (!listeners.size) {
      disconnect?.()
      disconnect = null
    }
  }
}
if (typeof window !== 'undefined')
  window.addEventListener(authenticatedAccessChangedEvent, () => {
    generation++
    publish({ agents: [], enabled: false, loading: true, error: null })
    disconnect?.()
    disconnect = listeners.size ? connect() : null
  })
export function useTaskAgents() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Tasks are not connected to this workspace.')
  const { data, error } = await supabase.rpc(name, args)
  if (error)
    throw new Error(
      /schema cache|does not exist/i.test(error.message)
        ? 'Background tasks are not available in this workspace yet.'
        : /failed to fetch|network|load failed/i.test(error.message)
          ? 'Your task could not be updated. Check your connection and try again.'
          : error.message,
    )
  await refreshTaskAgents()
  return data as TaskAgent
}
export function handoffTask(id: string, instruction?: string) {
  return rpc('multideck_task_handoff', {
    p_task_id: id,
    p_instruction: instruction ?? null,
    p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}
export function controlTaskAgent(
  agent: TaskAgent,
  operation: 'cancel' | 'retry' | 'resume' | 'followup' | 'reschedule' | 'view',
  input?: string,
  runAt?: string,
) {
  return rpc('multideck_task_control', {
    p_id: agent.id,
    p_operation: operation,
    p_version: agent.version,
    p_input: input ?? null,
    p_revision: operation === 'view' ? agent.result_revision : null,
    p_run_at: runAt ?? null,
  })
}
