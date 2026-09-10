import { DEXTER_SELECT_CONVERSATION_EVENT } from '@/lib/dexter-navigation'
import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  Clock,
  CirclePause,
  RotateCcw,
} from '@/components/icons/hugeicons'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/multideck/status-pill'
import { useLanguage } from '@/i18n/language-provider'
import { cn } from '@/lib/utils'
import { mdMotion, reduceMotion } from '@/lib/motion'
import {
  type TaskAgent,
  taskAgentStatus,
  sidebarTaskAgents,
  taskAgentUrl,
  agentHasUpdate,
} from '@/lib/task-agents'
import { useTaskAgents, controlTaskAgent } from '@/lib/task-agent-store'

const sidebarStatusTone = {
  queued: 'neutral', scheduled: 'neutral', waiting: 'amber', working: 'amber',
  ready: 'green', needs_input: 'amber', failed: 'red', cancelled: 'neutral', completed: 'green',
} as const
const sidebarStatusLabel = { ...taskAgentStatus, ready: 'Ready', waiting: 'Waiting', failed: 'Failed' }

const iconViews = [
  '30 55 385 390',
  '445 45 375 390',
  '863 52 355 391',
  '52 462 360 340',
  '447 458 370 357',
  '861 474 365 334',
  '48 825 365 360',
  '462 827 342 356',
  '866 815 363 370',
]
export function TaskAgentIcon({
  icon,
  className,
}: {
  icon: number | null
  className?: string
}) {
  return (
    <span aria-hidden="true" className={cn('block size-9 shrink-0', className)}>
      {icon === null ? (
        <Clock className="size-full p-2 text-[var(--md-subtle)]" />
      ) : (
        <svg
          className="size-full scale-[0.6] overflow-hidden"
          viewBox={iconViews[icon] ?? iconViews[0]}
        >
          <image
            href="/assets/agents/agent-icons.png"
            width="1254"
            height="1254"
          />
        </svg>
      )}
    </span>
  )
}
export function TaskAgentStack({
  agents,
  collapsed = false,
  onOpen,
  onViewAll,
  openConversationId = null,
}: {
  agents: TaskAgent[]
  collapsed?: boolean
  onOpen: (agent: TaskAgent) => void
  onViewAll: () => void
  openConversationId?: string | null
}) {
  const { t } = useLanguage()
  const reduced = Boolean(useReducedMotion())
  const visible = sidebarTaskAgents(agents, openConversationId)
  const outstanding = agents.filter(
    (a) => !['cancelled', 'completed'].includes(a.status) || agentHasUpdate(a),
  ).length
  if (!visible.length && !outstanding) return null
  return (
    <section aria-label={t('Your task agents')} className="mb-2 min-w-0 border-t border-[var(--md-line)] pt-[var(--md-gap-md)]">
      <div className="divide-y divide-[var(--md-line)]">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((agent) => (
            <motion.div
              key={agent.id}
              layout="position"
              initial={reduced ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: -3,
                transition: reduceMotion(reduced, mdMotion.exit),
              }}
              transition={reduceMotion(reduced, mdMotion.fast)}
            >
              <button
                type="button"
                title={`${agent.name} · ${agent.title} · ${t(taskAgentStatus[agent.status])}`}
                aria-label={`${agent.name}: ${agent.title}. ${t(taskAgentStatus[agent.status])}`}
                onClick={() => onOpen(agent)}
                className={cn(
                  'group flex min-h-12 w-full items-center gap-2 rounded-[var(--md-radius-md)] px-1 py-1.5 text-start transition-[background-color,transform] duration-200 ease-out hover:bg-[var(--md-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] motion-reduce:transform-none',
                  collapsed && 'justify-center',
                )}
              >
                <span className="relative">
                  <TaskAgentIcon icon={agent.icon} />
                  {agentHasUpdate(agent) ? (
                    <span className="absolute end-0 top-0 size-1.5 rounded-full bg-[var(--md-accent)]" />
                  ) : null}
                </span>
                {!collapsed ? (
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <span className="block truncate text-[12px] font-medium leading-[14px] text-[var(--md-ink)]">{agent.name}</span>
                    <span className="flex min-w-0 items-center justify-between gap-1.5">
                      <span className="min-w-0 truncate text-[11px] leading-[18px] text-[var(--md-text)]">
                        {agent.title.trim().split(/\s+/u).slice(0, 3).join(' ')}
                      </span>
                      <StatusPill
                        tone={sidebarStatusTone[agent.status]}
                        indicator={false}
                        className={cn('h-[18px] border-[color-mix(in_srgb,currentColor_22%,transparent)]! px-1.5 py-0 text-[10px] leading-none', sidebarStatusTone[agent.status] === 'neutral' && 'bg-transparent text-[var(--md-subtle)]')}
                      >
                        {t(sidebarStatusLabel[agent.status])}
                      </StatusPill>
                    </span>
                  </span>
                ) : null}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={onViewAll}
        title={t('View all task agents')}
        aria-label={t('View all task agents')}
        className="mt-1 flex min-h-8 w-full items-center justify-center gap-1 rounded-[var(--md-radius-md)] px-2 text-[11px] text-[var(--md-subtle)] transition-[background-color,transform] duration-200 ease-out hover:bg-[var(--md-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] motion-reduce:transform-none"
      >
        {collapsed ? (
          <ArrowRight className="size-3.5" />
        ) : (
          <>
            {t('View all')}
            <span className="tabular-nums">{outstanding}</span>
            <ArrowRight className="size-3" />
          </>
        )}
      </button>
    </section>
  )
}
export function SidebarTaskAgents({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate: (path: string) => void
}) {
  const { agents } = useTaskAgents()
  const conversation =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('conversation')
  return (
    <TaskAgentStack
      agents={agents}
      collapsed={collapsed}
      openConversationId={conversation}
      onOpen={(a) => {
        const alreadyOpen = window.location.pathname === '/agent-dexter'
        onNavigate(taskAgentUrl(a))
        if (alreadyOpen)
          window.dispatchEvent(
            new CustomEvent(DEXTER_SELECT_CONVERSATION_EVENT, {
              detail: { id: a.conversation_id },
            }),
          )
      }}
      onViewAll={() => onNavigate('/to-do?view=dexter')}
    />
  )
}
export function TaskAgentControls({ agent, onControl = controlTaskAgent }: {
  agent: TaskAgent
  onControl?: typeof controlTaskAgent
}) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scheduleId = useId()
  const [scheduling, setScheduling] = useState(false)
  async function schedule(runAt: string) {
    setBusy(true)
    setError(null)
    try {
      const date = new Date(runAt)
      if (
        !runAt ||
        !Number.isFinite(date.getTime()) ||
        date.getTime() <= Date.now()
      )
        throw new Error(t('Choose a future date and time.'))
      await onControl(agent, 'reschedule', undefined, date.toISOString())
      setScheduling(false)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('This task could not be scheduled.'),
      )
    } finally {
      setBusy(false)
    }
  }
  async function act(operation: 'cancel' | 'retry') {
    setBusy(true)
    setError(null)
    try {
      await onControl(agent, operation)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('This task could not be updated.'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" className="text-[12px] text-[var(--md-subtle)]">
        {t(taskAgentStatus[agent.status])}
      </span>
      {['failed', 'needs_input', 'cancelled'].includes(agent.status) ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void act('retry')}
        >
          <RotateCcw className="size-3.5" />
          {t('Try again')}
        </Button>
      ) : null}
      {['working', 'queued', 'scheduled', 'waiting'].includes(agent.status) ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void act('cancel')}
        >
          <CirclePause className="size-3.5" />
          {t('Stop')}
        </Button>
      ) : null}
      {['scheduled', 'queued', 'cancelled'].includes(agent.status) ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setScheduling(!scheduling)}
          aria-expanded={scheduling}
        >
          <Clock className="size-3.5" />
          {t('Change time')}
        </Button>
      ) : null}
      {scheduling ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void schedule(
              String(new FormData(event.currentTarget).get('runAt') ?? ''),
            )
          }}
          className="flex w-full flex-wrap items-end gap-2"
        >
          <label
            htmlFor={scheduleId}
            className="grid gap-1 text-[12px] text-[var(--md-text)]"
          >
            {t('Work on this task at')}
            <input
              id={scheduleId}
              type="datetime-local"
              required
              name="runAt"
              className="min-h-9 rounded-[var(--md-radius-md)] border border-[var(--md-line)] bg-[var(--md-surface)] px-2 text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy}>
            {t('Schedule')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setScheduling(false)}
          >
            {t('Cancel')}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-[12px] text-[var(--md-red)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
