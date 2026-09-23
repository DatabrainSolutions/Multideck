import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useReducedMotion } from "motion/react"
import { toast } from "sonner"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Link2,
  Tag,
  MoreHorizontal,
  Trash2,
} from "@/components/icons/hugeicons"
import { TodoCompletionControl, TodoPriorityPicker, TodoPriorityPill } from "@/components/multideck/todo-components"
import { rememberDexterTodoHandoff } from '@/lib/dexter-navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import {
  createTodoTask,
  deleteTodoTask,
  listTodoTasks,
  openTodoDexterChat,
  updateTodoTask,
  type TodoPriority,
  type TodoStatus,
  type TodoTask,
} from "@/lib/todo-api"

const emptyStateCopy = [
  { today: "You’re all clear for today.", day: "This day is all clear.", detail: "Add a task above when something needs your attention." },
  { today: "Nothing waiting here.", day: "Nothing waiting here.", detail: "Use the field above to plan the next thing." },
  { today: "Today is wide open.", day: "This day is wide open.", detail: "Add the first task when this day needs a plan." },
  { today: "No loose ends today.", day: "No loose ends on this day.", detail: "When something comes up, add it above." },
] as const

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function validDateKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) || localDateKey(date) !== value ? null : value
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`)
}

function shiftedDate(value: string, days: number) {
  const date = dateFromKey(value)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function initialDate() {
  if (typeof window === "undefined") return localDateKey()
  return validDateKey(new URLSearchParams(window.location.search).get("date")) ?? localDateKey()
}

function replaceTodoUrl(date: string) {
  if (typeof window === "undefined") return
  const query = new URLSearchParams({ date })
  window.history.replaceState({}, "", `/to-do?${query}`)
}

function displayDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateFromKey(value))
}

export function ToDoPage({ operatorName }: { operatorName?: string | null }) {
  const [deletingTask, setDeletingTask] = useState<Pick<TodoTask, 'id' | 'title'>|null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string|null>(null)
  const [handingOff, setHandingOff] = useState<string|null>(null)
  const [handoffError, setHandoffError] = useState<{id:string;message:string}|null>(null)
  const { language, t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const quickInputRef = useRef<HTMLInputElement>(null)
  const quickFocusFrameRef = useRef<number | null>(null)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [tasks, setTasks] = useState<TodoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [quickTitle, setQuickTitle] = useState("")
  const [quickPriority, setQuickPriority] = useState<TodoPriority | "">("")
  const [adding, setAdding] = useState(false)
  const [quickError, setQuickError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [busyTaskIds, setBusyTaskIds] = useState<Set<string>>(() => new Set())
  const [heldTaskGroups, setHeldTaskGroups] = useState<Record<string, TodoStatus>>({})
  const [emptyStateIndex] = useState(() => Math.floor(Math.random() * emptyStateCopy.length))

  const dayTasks = useMemo(() => tasks.filter(task => task.scheduledDate === selectedDate), [tasks, selectedDate])
  const openTasks = useMemo(() => dayTasks.filter((task) => (heldTaskGroups[task.id] ?? task.status) === "open"), [heldTaskGroups,dayTasks])
  const completedTasks = useMemo(() => dayTasks.filter((task) => (heldTaskGroups[task.id] ?? task.status) === "completed"), [heldTaskGroups,dayTasks])
  const today = localDateKey()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  const firstName = operatorName?.trim().split(/\s+/)[0]
  useEffect(() => {
    const syncView = () => {
      const query = new URLSearchParams(window.location.search)
      setSelectedDate(validDateKey(query.get('date')) ?? localDateKey())
    }
    window.addEventListener('popstate', syncView)
    return () => window.removeEventListener('popstate', syncView)
  }, [])

  async function handOff(task: TodoTask) {
    if (handingOff) return
    setHandingOff(task.id); setHandoffError(null)
    try {
      const result = await openTodoDexterChat(task.id)
      setTasks(current => current.map(item => item.id === task.id
        ? { ...item, dexterConversationId: result.conversationId } : item))
      if (result.isNew) {
        const references = task.links.map(link => `${link.label}: ${link.url}`).join('\n')
        rememberDexterTodoHandoff(result.conversationId,
          `Help me with this task from my To Do list: ${task.title}${references ? `\nRelevant links:\n${references}` : ''}`)
      }
      openAgent(`/agent-dexter?conversation=${encodeURIComponent(result.conversationId)}`)
    } catch(error) {setHandoffError({id:task.id,message:error instanceof Error?error.message:t('This task could not be handed off. Try again.')})}
    finally {setHandingOff(null)}
  }

  async function deleteTask() {
    if (!deletingTask || deleteBusy) return
    setDeleteBusy(true); setDeleteError(null)
    try {
      const deleted = await deleteTodoTask(deletingTask.id)
      if (!deleted) throw new Error(t('This task could not be deleted. Try again.'))
      setTasks(current => current.filter(task => task.id !== deletingTask.id))
      setDeletingTask(null)
      setAnnouncement(t('Task deleted.'))
    } catch(error) { setDeleteError(error instanceof Error ? error.message : t('This task could not be deleted. Try again.')) }
    finally { setDeleteBusy(false) }
  }

  function openAgent(path: string) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    setTasks([])
    setHeldTaskGroups({})
    void listTodoTasks(selectedDate, controller.signal).then(result => {
      if (!controller.signal.aborted) setTasks(result)
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(t("Unable to load tasks. Check your connection and try again."))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [reloadToken, selectedDate, t])

  useEffect(() => {
    const focusQuickEntry = () => {
      quickInputRef.current?.focus({ preventScroll: false })
      quickInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    return subscribeTopBarAction(topBarActionEvents.createTodoTask, focusQuickEntry)
  }, [])

  useEffect(() => () => {
    if (quickFocusFrameRef.current !== null) window.cancelAnimationFrame(quickFocusFrameRef.current)
  }, [])

  const chooseDate = useCallback((nextDate: string) => {
    if (!validDateKey(nextDate) || nextDate === selectedDate) return
    setSelectedDate(nextDate)
    replaceTodoUrl(nextDate)
  }, [selectedDate])

  async function addTask(event: FormEvent) {
    event.preventDefault()
    const submittedTitle = event.currentTarget instanceof HTMLFormElement
      ? String(new FormData(event.currentTarget).get("title") ?? "")
      : quickTitle
    const title = submittedTitle.trim()
    if (!title || adding) return
    setAdding(true)
    setQuickError(null)
    try {
      const task = await createTodoTask({ title, scheduledDate: selectedDate, priority: quickPriority || null })
      setTasks((current) => [...current, task])
      setQuickTitle("")
      setQuickPriority("")
      setAnnouncement(t("Task added"))
    } catch {
      setQuickError(t("Unable to add task. Check your connection and try again."))
    } finally {
      setAdding(false)
      if (quickFocusFrameRef.current !== null) window.cancelAnimationFrame(quickFocusFrameRef.current)
      quickFocusFrameRef.current = window.requestAnimationFrame(() => {
        quickFocusFrameRef.current = null
        quickInputRef.current?.focus()
      })
    }
  }

  async function toggleTask(task: TodoTask, completed: boolean) {
    if (busyTaskIds.has(task.id)) return
    const previous = task
    const optimistic: TodoTask = { ...task, status: completed ? "completed" : "open", completedAt: completed ? new Date().toISOString() : null }
    const minimumFeedback = shouldReduceMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 260))
    setBusyTaskIds((current) => new Set(current).add(task.id))
    setHeldTaskGroups((current) => ({ ...current,[task.id]:task.status }))
    setTasks((current) => current.map((item) => item.id === task.id ? optimistic : item))
    try {
      const [updated] = await Promise.all([
        updateTodoTask(task.id, { status: optimistic.status }),
        minimumFeedback,
      ])
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item))
    } catch {
      await minimumFeedback
      setTasks((current) => current.map((item) => item.id === task.id ? previous : item))
      toast.error(t("Unable to save task. Check your connection and try again."))
    } finally {
      setHeldTaskGroups((current) => { const next = { ...current }; delete next[task.id]; return next })
      setBusyTaskIds((current) => { const next = new Set(current); next.delete(task.id); return next })
    }
  }

  function renderTaskGroup(title: string, rows: TodoTask[]) {
    if (rows.length === 0) return null
    return (
      <section aria-label={t(title)} className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--md-line)] px-1 pb-2">
          <h2 className="text-[12px] font-medium text-[var(--md-text)]">{t(title)}</h2>
          <span className="text-[11px] tabular-nums text-[var(--md-subtle)]">{rows.length}</span>
        </div>
        <div className="min-w-0 divide-y divide-[var(--md-line)]">
          {rows.map((task) => {
            const completed = task.status === "completed"
            return (
              <div key={task.id} className="group/task flex min-h-[66px] min-w-0 items-start gap-2 py-2.5 sm:items-center">
                <div data-i18n-skip className="min-w-0 flex-1 px-1 text-start">
                  <TodoCompletionControl
                    checked={completed}
                    busy={busyTaskIds.has(task.id)}
                    label={`${t(completed ? "Reopen task" : "Mark task complete")}: ${task.title}`}
                    title={task.title}
                    onChange={(next) => void toggleTask(task, next)}
                    className="w-full"
                  />
                  <div className="ps-[34px]">
                  {task.dexterConversationId ? <button type="button" onClick={() => openAgent(`/agent-dexter?conversation=${encodeURIComponent(task.dexterConversationId!)}`)} className="mt-1 inline-flex min-h-7 items-center rounded-[var(--md-radius-sm)] text-[11px] text-[var(--md-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">{t('Open Dexter conversation')}</button> : null}
                  {handoffError?.id === task.id ? <p role="alert" className="mt-1 text-[12px] text-[var(--md-red)]">{handoffError.message}</p> : null}
                  {task.tags.length || task.links.length ? (
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--md-subtle)]">
                      {task.tags.length ? <span className="inline-flex items-center gap-1"><Tag className="size-3" />{task.tags.map((tag) => tag.label).join(" · ")}</span> : null}
                      {task.links.length ? <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{task.links.length}</span> : null}
                    </span>
                  ) : null}
                  </div>
                </div>
                {task.priority ? <TodoPriorityPill priority={task.priority} className="mt-1 shrink-0 sm:mt-0" /> : null}
                {!completed && !task.dexterConversationId ? <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 shrink-0 px-2 text-[11px] text-[var(--md-subtle)] hover:text-[var(--md-accent)] active:scale-[0.98] motion-reduce:transform-none sm:mt-0" disabled={handingOff!==null} onClick={()=>void handOff(task)}>{t(handingOff===task.id?'Opening Dexter…':'Hand to Dexter')}</Button> : null}
                <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="mt-1 size-8 shrink-0 text-[var(--md-subtle)] sm:mt-0" onClick={event => { deleteTriggerRef.current = event.currentTarget }} aria-label={t('Task options: {title}').replace('{title}',task.title)}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={()=>{setDeleteError(null);setDeletingTask(task)}}><Trash2 className="size-4"/>{t('Delete task')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <main className="md-page">
      <div className="mx-auto w-full max-w-[900px] pb-[var(--md-page-bottom-pad)]">
        <header className="flex flex-col gap-4 border-b border-[var(--md-line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)]">{t(greeting)}{firstName ? <>, <span data-i18n-skip dir="auto">{firstName}</span></> : null}</h1></div>
          <div className="flex min-h-10 items-center self-start rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)] sm:self-auto">
            <Button type="button" variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Previous day")} onClick={() => chooseDate(shiftedDate(selectedDate,-1))}><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
            <label className="relative grid h-8 min-w-[164px] cursor-pointer place-items-center rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-ink)] hover:bg-[var(--md-hover)]">
              <span>{selectedDate === today ? t("Today") : displayDate(selectedDate,language)}</span>
              <input type="date" value={selectedDate} aria-label={t("Choose date")} className="absolute inset-0 cursor-pointer opacity-0" dir="ltr" onChange={(event) => chooseDate(event.target.value)} />
            </label>
            <Button type="button" variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Next day")} onClick={() => chooseDate(shiftedDate(selectedDate,1))}><ChevronRight className="size-4 rtl:rotate-180" /></Button>
          </div>
        </header>

        {selectedDate !== today ? (
          <div className="mt-3 flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => chooseDate(today)}><CalendarDays className="size-3.5" />{t("Today")}</Button></div>
        ) : null}

        <form className="mt-6" onSubmit={(event) => void addTask(event)}>
          <div className="flex flex-col gap-2 rounded-[var(--md-radius-xl)] bg-transparent p-1 transition-colors duration-200 focus-within:bg-[var(--md-field-bg)] sm:flex-row sm:items-center">
            <Input
              ref={quickInputRef}
              name="title"
              value={quickTitle}
              maxLength={240}
              placeholder={t("Add a task for this day")}
              aria-label={t("Add a task for this day")}
              aria-describedby="todo-quick-error"
              aria-invalid={Boolean(quickError)}
              autoComplete="off"
              className="h-10 flex-1 rounded-[var(--md-radius-lg)] border-0 bg-transparent px-2 text-base shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:text-[14px]"
              style={{ borderWidth: 0, boxShadow: "none", outline: "none" }}
              dir="auto"
              disabled={adding}
              onChange={(event) => setQuickTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }}
            />
            <TodoPriorityPicker value={quickPriority} ariaLabel={t("Priority")} className="rounded-[var(--md-radius-lg)]" onValueChange={setQuickPriority} />
            <Button type="submit" className="h-8 rounded-[var(--md-radius-lg)]" disabled={!quickTitle.trim() || adding}>{t("Add task")}</Button>
          </div>
          <div className="mt-2 flex min-h-5 items-start justify-between gap-3 px-1">
            {quickError ? <p id="todo-quick-error" role="alert" className="text-end text-[11px] leading-5 text-[var(--md-red)]">{quickError}</p> : <span id="todo-quick-error" />}
          </div>
        </form>

        <div className="mt-7 grid min-w-0 gap-7">
          {loading ? (
            <div role="status" aria-label={t("Loading your tasks…")} className="grid gap-0 divide-y divide-[var(--md-line)] border-y border-[var(--md-line)]">
              {[0,1,2].map((index) => <div key={index} className="flex min-h-[66px] items-center gap-3 py-3"><span className="size-6 animate-pulse rounded-full bg-[var(--md-surface-tint)] motion-reduce:animate-none" /><span className="h-3 w-[min(70%,420px)] animate-pulse rounded-full bg-[var(--md-surface-tint)] motion-reduce:animate-none" /></div>)}
            </div>
          ) : null}
          {!loading && loadError ? (
            <div role="alert" className="border-y border-[var(--md-line)] py-10 text-center">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{loadError}</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>
            </div>
          ) : null}
          {!loading && !loadError && dayTasks.length === 0 ? (
            <div className="py-12 text-center">
              <EmptyStateIllustration variant="tasks" />
              <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(selectedDate === today ? emptyStateCopy[emptyStateIndex].today : emptyStateCopy[emptyStateIndex].day)}</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(emptyStateCopy[emptyStateIndex].detail)}</p>
            </div>
          ) : null}
          {!loading && !loadError ? renderTaskGroup("Open tasks",openTasks) : null}
          {!loading && !loadError ? renderTaskGroup("Completed tasks",completedTasks) : null}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <Dialog open={Boolean(deletingTask)} onOpenChange={open=>{if(!open&&!deleteBusy)setDeletingTask(null)}}><DialogContent className="sm:max-w-[440px]" showCloseButton={!deleteBusy} onCloseAutoFocus={event => { event.preventDefault(); deleteTriggerRef.current?.focus() }}><DialogHeader><DialogTitle>{t('Delete task?')}</DialogTitle><DialogDescription>{t('This removes the task. Its Dexter conversation stays in chat history.')}</DialogDescription></DialogHeader><p data-i18n-skip className="text-[13px] text-[var(--md-ink)]">{deletingTask?.title}</p>{deleteError?<p role="alert" className="text-[12px] text-[var(--md-red)]">{deleteError}</p>:null}<DialogFooter><Button variant="ghost" disabled={deleteBusy} onClick={()=>setDeletingTask(null)}>{t('Cancel')}</Button><Button variant="destructive" disabled={deleteBusy} onClick={()=>void deleteTask()}>{t(deleteBusy?'Deleting…':'Delete task')}</Button></DialogFooter></DialogContent></Dialog>
    </main>
  )
}
