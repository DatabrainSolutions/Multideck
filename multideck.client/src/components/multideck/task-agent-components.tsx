import { DEXTER_SELECT_CONVERSATION_EVENT, readDexterConversationIdFromLocation } from '@/lib/dexter-navigation'
import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  Clock,
  CirclePause,
  RotateCcw,
} from '@/components/icons/hugeicons'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/i18n/language-provider'
import { cn } from '@/lib/utils'
import { mdMotion, reduceMotion } from '@/lib/motion'
import {
  type TaskAgent,
  taskAgentStatus,
  sidebarTaskAgents,
  taskAgentUrl,
  isSidebarTaskAgent,
} from '@/lib/task-agents'
import { useTaskAgents, controlTaskAgent } from '@/lib/task-agent-store'

const sidebarStatusTone = {
  queued: 'neutral', scheduled: 'neutral', waiting: 'amber', working: 'amber',
  ready: 'green', needs_input: 'red', failed: 'red', cancelled: 'neutral', completed: 'green',
} as const
const sidebarStatusDot = {
  neutral: 'bg-[var(--md-subtle)]',
  amber: 'bg-[var(--md-amber)]',
  green: 'bg-[var(--md-green)]',
  red: 'bg-[var(--md-red)]',
} as const

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
}: {
  agents: TaskAgent[]
  collapsed?: boolean
  onOpen: (agent: TaskAgent) => void
  onViewAll: () => void
}) {
  const { t } = useLanguage()
  const reduced = Boolean(useReducedMotion())
  const visible = sidebarTaskAgents(agents)
  const outstanding = agents.filter(isSidebarTaskAgent).length
  if (!visible.length && !outstanding) return null
  return (
    <section data-collapsed={collapsed} aria-label={t('Your task agents')} className="task-agent-stack mb-2 min-w-0 border-t-[0.5px] border-[var(--md-line)] pt-[var(--md-gap-md)]">
      <div className="task-agent-stack-items divide-y-[0.5px] divide-[var(--md-line)]">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((agent) => (
            <motion.div
              key={agent.id}
              className="task-agent-stack-item"
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
                data-tone={sidebarStatusTone[agent.status]}
                title={`${agent.name} · ${agent.title} · ${t(taskAgentStatus[agent.status])}`}
                aria-label={`${agent.name}: ${agent.title}. ${t(taskAgentStatus[agent.status])}`}
                onClick={() => onOpen(agent)}
                className={cn(
                  'task-agent-stack-button group flex min-h-12 w-full items-center gap-2 rounded-[var(--md-radius-xl)] px-1 py-1.5 text-start transition-[background-color,transform] duration-200 ease-out hover:bg-[var(--md-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] motion-reduce:transform-none',
                  collapsed && 'justify-center',
                )}
              >
                <TaskAgentIcon icon={agent.icon} className="task-agent-stack-icon" />
                {!collapsed ? (
                  <>
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <span className="block truncate text-[12px] font-medium leading-[14px] text-[var(--md-ink)]">{agent.name}</span>
                    <span className="task-agent-stack-subtitle min-w-0 truncate text-[11px] leading-[18px] text-[var(--md-text)]">
                      {agent.title.trim().split(/\s+/u).slice(0, 4).join(' ')}
                    </span>
                  </span>
                  <span
                    role="img"
                    aria-label={t(taskAgentStatus[agent.status])}
                    title={t(taskAgentStatus[agent.status])}
                    className={cn('task-agent-stack-dot size-1.5 shrink-0 rounded-full', sidebarStatusDot[sidebarStatusTone[agent.status]])}
                  />
                  </>
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
        className="task-agent-stack-all mt-1 flex min-h-8 w-full items-center justify-center gap-1 rounded-[var(--md-radius-md)] px-2 text-[11px] text-[var(--md-subtle)] transition-[background-color,transform] duration-200 ease-out hover:bg-[var(--md-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] motion-reduce:transform-none"
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
  return (
    <TaskAgentStack
      agents={agents}
      collapsed={collapsed}
      onOpen={(a) => {
        const alreadyOpen = window.location.pathname === '/agent-dexter'
        if (alreadyOpen && readDexterConversationIdFromLocation() === a.conversation_id) return
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
  const { t, language } = useLanguage()
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
  async function act(operation: 'cancel' | 'retry' | 'resume') {
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
        {agent.status === 'scheduled' && agent.due_at ? ` · ${new Date(agent.due_at).toLocaleString(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}` : ''}
      </span>
      {agent.status === 'scheduled' ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act('resume')}>
          <ArrowRight className="size-3.5" />
          {t('Do now')}
        </Button>
      ) : null}
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
              defaultValue={agent.due_at ? (() => {
                const date = new Date(agent.due_at)
                return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
              })() : ''}
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
