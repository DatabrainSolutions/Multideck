import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import {
  BarChart3,
  Handshake,
  Mail,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  Star,
  TriangleAlert,
  Zap,
} from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"
import { getTimeZoneOffsetMinutes, useMinuteTick } from "@/lib/clock"
import { cityQueues } from "@/data/operational-data"
import { createEmptyFilterQuery } from "@/lib/advanced-filters"
import { getBookingDetailPath } from "@/components/multideck/booking-components"
import { HomeDexterLauncher } from "@/components/multideck/home-dexter-launcher"
import {
  HomeDeckAction,
  HomeDeckEmpty,
  HomeDeckPanel,
  HomeDeckRow,
  HomeDeckTile,
  homeDeckRowButtonClass,
} from "@/components/multideck/home-deck-panel"
import type { HomePromptSuggestion } from "@/components/multideck/home-prompt-rail"
import { TodoCompletionControl } from "@/components/multideck/todo-components"
import { getDefaultDateRange } from "@/components/multideck/date-picker"
import { loadDashboardOverview, type DashboardOverviewReadModel } from "@/lib/dashboard-api"
import { dashboardPriorityBucket, type DashboardPriorityItem } from "@/lib/dashboard-live-data"
import { listLiveBookingsPage, type LiveBooking } from "@/lib/application-data-api"
import { listTodoTasks, updateTodoTask, type TodoTask } from "@/lib/todo-api"
import { loadHomeFollowUps, type HomeFollowUp } from "@/lib/home-follow-ups"
import { formatFollowUpRecommendation } from "@/lib/follow-up-recommendation"
import { readRecentWorkContext } from "@/lib/recent-work-context"
import { useStarredJobs } from "@/lib/starred-jobs"
import type { AuthUserSummary } from "@/lib/auth-user"

/** The working day every clock-off countdown is measured against, per region. */
const dayStartHour = 8
const dayEndHour = 17
const deckRowLimit = 5
const clockOffLimit = 8
/** The register's own ceiling. A star outside this page would not be found. */
const myJobsLimit = 50
const suggestionLimit = 3

const todoEmptyPhrases = [
  "All clear.",
  "Nothing to do.",
  "You’re all caught up.",
  "Nothing waiting today.",
  "Today is clear.",
] as const

/**
 * The deck leaves as one gesture rather than four modules each deciding for
 * themselves. Children stagger left to right, so the exit reads as the screen
 * being swept clear ahead of the conversation.
 */
const deckVariants = {
  visible: { transition: { staggerChildren: 0.04 } },
  hidden: { transition: { staggerChildren: 0.045 } },
}

const deckModuleVariants = {
  visible: { opacity: 1, y: 0, transition: mdMotion.enter },
  hidden: { opacity: 0, y: 14, transition: mdMotion.exit },
}

function formatGap(minutes: number) {
  const absolute = Math.max(0, Math.round(minutes))
  if (absolute < 60) return `${absolute}m`
  const hours = Math.floor(absolute / 60)
  const remainder = absolute % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}

function formatWait(milliseconds: number) {
  const days = Math.floor(milliseconds / 86_400_000)
  if (days >= 1) return `${days}d`
  const hours = Math.floor(milliseconds / 3_600_000)
  if (hours >= 1) return `${hours}h`
  return `${Math.max(1, Math.floor(milliseconds / 60_000))}m`
}

/**
 * How close a region is to going quiet. Red is "say it now or it waits until
 * tomorrow", amber is the hour's notice before that, grey is everything with
 * time left in it — including regions that are already closed, because there is
 * nothing urgent about a day that has not started.
 */
type ClockOffUrgency = "imminent" | "soon" | "steady"

const clockOffImminentMinutes = 30
const clockOffSoonMinutes = 60

const clockOffDotClass: Record<ClockOffUrgency, string> = {
  imminent: "bg-[var(--md-red)]",
  soon: "bg-[var(--md-amber)]",
  steady: "bg-[var(--md-line-strong)]",
}

const clockOffTileClass: Record<ClockOffUrgency, string> = {
  imminent: "bg-[color-mix(in_srgb,var(--md-red)_14%,var(--md-deck-surface))]",
  soon: "bg-[color-mix(in_srgb,var(--md-amber)_14%,var(--md-deck-surface))]",
  steady: "",
}

const clockOffGapClass: Record<ClockOffUrgency, string> = {
  imminent: "text-[var(--md-red)]",
  soon: "text-[var(--md-amber)]",
  steady: "text-[var(--md-text)]",
}

type ClockOffRow = {
  code: string
  city: string
  /** Minutes until this region opens, or closes if it is already working. */
  minutes: number
  open: boolean
  urgency: ClockOffUrgency
  waiting: number
}

/**
 * Home. One prompt, the prompts worth starting from, and the four short lists
 * an operator wants before they write anything: what is on their list today,
 * the jobs they keep close, who is waiting on a reply, and who is about to stop
 * answering.
 *
 * Writing a prompt changes nothing. Sending clears the deck and drops the
 * composer to the position it holds in a conversation, and hands over from
 * there, so opening a thread is one continuous movement rather than a page
 * swap.
 */
export function HomePage({
  navigate,
  currentUser,
}: {
  navigate: (path: string) => void
  currentUser: AuthUserSummary | null
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const now = useMinuteTick()
  const [docked, setDocked] = useState(false)
  const [overview, setOverview] = useState<DashboardOverviewReadModel | null>(null)
  const [bookings, setBookings] = useState<LiveBooking[]>([])
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([])
  const [todoLoadState, setTodoLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [todoEmptyPhraseIndex] = useState(() => Math.floor(Math.random() * todoEmptyPhrases.length))
  const [followUps, setFollowUps] = useState<HomeFollowUp[]>([])
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const [jobScope, setJobScope] = useState<"starred" | "all">("starred")
  const { isStarred, toggleStar } = useStarredJobs(currentUser?.id)
  const recentWork = useMemo(() => readRecentWorkContext(), [])
  const operatorCode = currentUser?.initials ?? ""
  const todayTaskDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  useEffect(() => {
    const controller = new AbortController()
    loadDashboardOverview("today", getDefaultDateRange(), controller.signal)
      .then(setOverview)
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // Read the whole register rather than just your own jobs: a booking you
    // starred to keep an eye on is often somebody else's to run.
    listLiveBookingsPage({
      scope: "All Jobs",
      operatorCode,
      filterQuery: createEmptyFilterQuery(),
      limit: myJobsLimit,
      offset: 0,
    }, controller.signal)
      .then((page) => setBookings(page.rows))
      .catch(() => undefined)
    return () => controller.abort()
  }, [operatorCode])

  useEffect(() => {
    const controller = new AbortController()
    // The To Do workspace owns this list. Home shows today's open tasks and can
    // tick one off; everything else about them belongs on /to-do.
    setTodoLoadState("loading")
    listTodoTasks(todayTaskDate, controller.signal)
      .then((tasks) => {
        if (controller.signal.aborted) return
        setTodoTasks(tasks)
        setTodoLoadState("ready")
      })
      .catch(() => {
        if (!controller.signal.aborted) setTodoLoadState("error")
      })
    return () => controller.abort()
  }, [todayTaskDate])

  useEffect(() => {
    const controller = new AbortController()
    loadHomeFollowUps(deckRowLimit, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setFollowUps(rows)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const operatorName = currentUser?.name ?? overview?.operatorName ?? null
  const openTasks = useMemo(() => todoTasks.filter((task) => task.status === "open"), [todoTasks])

  /** The operator's own priority work, which is what the prompts are built
      from — separate to the To Do list, which they write themselves. */
  const priorityItems = useMemo<DashboardPriorityItem[]>(
    () => overview?.priorityMineItems?.length ? overview.priorityMineItems : overview?.priorityItems ?? [],
    [overview],
  )

  const dueTodayCount = useMemo(
    () => priorityItems.filter((item) => dashboardPriorityBucket(item.dueAt, now.getTime()) !== "later").length,
    [now, priorityItems],
  )

  const starredJobs = useMemo(
    () => bookings.filter((booking) => isStarred(booking.id, booking.isFavourite)),
    [bookings, isStarred],
  )

  /** Starred first, then the jobs recorded against this operator. */
  const ownJobs = useMemo(
    () => bookings.filter((booking) => booking.owner === operatorCode && !isStarred(booking.id, booking.isFavourite)),
    [bookings, isStarred, operatorCode],
  )

  const visibleJobs = useMemo(() => {
    if (jobScope === "starred" && starredJobs.length) return starredJobs
    return [...starredJobs, ...ownJobs]
  }, [jobScope, ownJobs, starredJobs])

  const clockOffRows = useMemo<ClockOffRow[]>(() => {
    const rows = cityQueues.map((city) => {
      const cityOffset = getTimeZoneOffsetMinutes(now, city.timeZone)
      const cityHour = (now.getUTCHours() + now.getUTCMinutes() / 60 + cityOffset / 60 + 24) % 24
      const open = cityHour >= dayStartHour && cityHour < dayEndHour
      const queue = overview?.clockQueues?.[city.code]

      const minutes = (open ? dayEndHour - cityHour : (dayStartHour - cityHour + 24) % 24) * 60

      return {
        code: city.code,
        city: city.city,
        minutes,
        open,
        urgency: !open
          ? "steady" as const
          : minutes <= clockOffImminentMinutes
            ? "imminent" as const
            : minutes <= clockOffSoonMinutes
              ? "soon" as const
              : "steady" as const,
        // Only work needing a person counts here. Open RFQs are a workload
        // figure and would make every region look busy.
        waiting: queue ? queue.needAction + queue.readyToQuote : 0,
      }
    })

    // Whoever stops answering first leads. Regions already closed appear only
    // when fewer than five are still working, and say when they come back.
    const working = rows.filter((row) => row.open).sort((a, b) => a.minutes - b.minutes)
    const resting = rows.filter((row) => !row.open).sort((a, b) => a.minutes - b.minutes)
    return [...working, ...resting].slice(0, clockOffLimit)
  }, [now, overview])

  const standfirst = useMemo(() => {
    if (!overview) return undefined
    if (dueTodayCount === 1) return t("One job needs you before today's cutoff.")
    if (dueTodayCount > 1) return t("{count} jobs need you before today's cutoff.").replace("{count}", String(dueTodayCount))
    if (overview.counts.readyQuotes > 0) {
      return t("Nothing is overdue. {count} quotes are ready to send.").replace("{count}", String(overview.counts.readyQuotes))
    }
    return t("Nothing is waiting on you right now.")
  }, [dueTodayCount, overview, t])

  /** Prompts built from this operator's own records, so Dexter never has to
      guess what the suggestion was about. */
  const suggestions = useMemo<HomePromptSuggestion[]>(() => {
    const leadItem = priorityItems[0]
    const waiting = followUps[0]
    const built: HomePromptSuggestion[] = []

    if (dueTodayCount > 1) {
      built.push({
        id: "triage",
        title: t("Work through what is due before cutoff"),
        prompt: t("Take my queue for today in deadline order and tell me exactly what to do on each one."),
        meta: t("{count} due").replace("{count}", String(dueTodayCount)),
        icon: Zap,
        specialistId: "ops",
      })
    }

    if (leadItem) {
      built.push({
        id: `lead-${leadItem.id}`,
        title: t("Pick up {reference} for {customer}")
          .replace("{reference}", leadItem.reference)
          .replace("{customer}", leadItem.customer),
        prompt: t("Review {reference} for {customer} — {task}. Tell me the next action and draft it.")
          .replace("{reference}", leadItem.reference)
          .replace("{customer}", leadItem.customer)
          .replace("{task}", t(leadItem.task)),
        meta: t(leadItem.status),
        icon: leadItem.kind === "exception" ? TriangleAlert : ReceiptText,
        specialistId: leadItem.kind === "exception" ? "ops" : "sales",
      })
    }

    if (waiting) {
      const recommendation = formatFollowUpRecommendation(waiting.recommendationCode, t)
      built.push({
        id: `follow-${waiting.threadId ?? `${waiting.recordType}-${waiting.recordId ?? waiting.name}`}`,
        title: `${recommendation} · ${waiting.name}`,
        prompt: t("Review the conversation with {name} ({address}) about “{subject}”. The recommended next action is: {action}. Help me complete it.")
          .replace("{name}", waiting.name)
          .replace("{address}", waiting.address ?? t("No email address recorded"))
          .replace("{subject}", waiting.subject)
          .replace("{action}", recommendation),
        meta: t("waiting {gap}").replace("{gap}", formatWait(waiting.waitingFor)),
        icon: Mail,
        specialistId: "customer",
      })
    }

    if ((overview?.counts.readyQuotes ?? 0) > 0) {
      built.push({
        id: "ready-quotes",
        title: t("Send the quotes that are ready"),
        prompt: t("Show me every quote that is ready to send, check each one, and draft the covering email."),
        meta: t("{count} ready").replace("{count}", String(overview?.counts.readyQuotes ?? 0)),
        icon: PackageCheck,
        specialistId: "sales",
      })
    }

    if (recentWork?.type === "booking") {
      built.push({
        id: `recent-${recentWork.recordId}`,
        title: t("Chase what is missing on {reference}").replace("{reference}", recentWork.recordId),
        prompt: t("Check what information is still missing on booking {reference} and help me chase it up.")
          .replace("{reference}", recentWork.recordId),
        icon: Handshake,
        specialistId: "ops",
      })
    }

    built.push(
      {
        id: "at-risk",
        title: t("Review the bookings most at risk"),
        prompt: t("Show me the bookings most at risk right now and what I should do next on each."),
        icon: BarChart3,
        specialistId: "analytics",
      },
      {
        id: "customer-update",
        title: t("Draft the customer update that is overdue"),
        prompt: t("Draft an update for the customer who most needs one today."),
        icon: MessageCircle,
        specialistId: "customer",
      },
    )

    return built.slice(0, suggestionLimit)
  }, [dueTodayCount, followUps, overview, priorityItems, recentWork, t])

  /**
   * Ticking a task off Home writes to the same list the To Do workspace uses.
   * The tick gets its full confirmation beat before the row clears. A failed
   * write leaves the task in place rather than briefly pretending it is done.
   */
  const completeTask = useCallback(async (task: TodoTask) => {
    if (completingTaskId) return
    setCompletingTaskId(task.id)
    const completionBeat = shouldReduceMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 260))
    try {
      const [updated] = await Promise.all([
        updateTodoTask(task.id, { status: "completed" }),
        completionBeat,
      ])
      setTodoTasks((current) => current.map((row) => row.id === task.id ? updated : row))
    } catch {
      await completionBeat
    } finally {
      setCompletingTaskId(null)
    }
  }, [completingTaskId, shouldReduceMotion])

  const deck: { id: string; module: ReactNode }[] = [
    {
      id: "todo",
      module: (
        <HomeDeckPanel
          title="To do"
          count={openTasks.length}
          action={<HomeDeckAction onClick={() => navigate("/to-do")}>{t("Open")}</HomeDeckAction>}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {todoLoadState === "ready" && openTasks.length ? openTasks.slice(0, deckRowLimit).map((task, index) => (
              <motion.div
                key={task.id}
                layout={!shouldReduceMotion}
                exit={shouldReduceMotion ? undefined : { opacity: 0, x: 8 }}
                transition={mdMotion.exit}
              >
                <HomeDeckRow index={index}>
                  <div className="flex items-center gap-1">
                    <TodoCompletionControl
                      className="size-7"
                      checked={completingTaskId === task.id}
                      busy={completingTaskId === task.id}
                      label={`${t("Mark done")}: ${task.title}`}
                      onChange={() => void completeTask(task)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] leading-4 text-[var(--md-ink)]" dir="auto">
                      {task.title}
                    </span>
                    {task.priority === "urgent" || task.priority === "high" ? (
                      <span className="shrink-0 text-[11px] leading-4 text-[var(--md-amber)]">
                        {t(task.priority === "urgent" ? "Urgent" : "High")}
                      </span>
                    ) : null}
                  </div>
                </HomeDeckRow>
              </motion.div>
            )) : todoLoadState === "loading" ? (
              <HomeDeckEmpty>{t("Checking today’s list…")}</HomeDeckEmpty>
            ) : todoLoadState === "error" ? (
              <HomeDeckEmpty>{t("Your To Do list couldn’t be loaded.")}</HomeDeckEmpty>
            ) : (
              <HomeDeckEmpty>{t(todoEmptyPhrases[todoEmptyPhraseIndex])}</HomeDeckEmpty>
            )}
          </AnimatePresence>
        </HomeDeckPanel>
      ),
    },
    {
      id: "jobs",
      module: (
        <HomeDeckPanel
          title="My jobs"
          count={starredJobs.length}
          action={bookings.length ? (
            <HomeDeckAction onClick={() => setJobScope((scope) => (scope === "starred" ? "all" : "starred"))}>
              {jobScope === "starred" && starredJobs.length ? t("All") : t("Starred")}
            </HomeDeckAction>
          ) : null}
        >
          {visibleJobs.length ? visibleJobs.slice(0, deckRowLimit).map((booking, index) => {
            const starred = isStarred(booking.id, booking.isFavourite)

            return (
              <HomeDeckRow key={booking.id} index={index}>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-pressed={starred}
                    aria-label={`${starred ? t("Unstar") : t("Star")} ${booking.id}`}
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full transition-[color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a22)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
                      starred ? "text-[var(--md-amber)]" : "text-[var(--md-subtle)] hover:text-[var(--md-ink)]",
                    )}
                    onClick={() => void toggleStar(booking.id, booking.isFavourite).catch(() => {
                      toast.error(t("The job star could not be saved. Try again."))
                    })}
                  >
                    <Star className={cn("size-3.5", starred && "fill-current")} strokeWidth={1.4} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={homeDeckRowButtonClass}
                    onClick={() => navigate(getBookingDetailPath(booking.id))}
                  >
                    <span className="shrink-0 text-[12.5px] font-medium leading-4 tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
                      {booking.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] leading-4 text-[var(--md-subtle)]">
                      {booking.customer}
                    </span>
                  </button>
                </div>
              </HomeDeckRow>
            )
          }) : (
            <HomeDeckEmpty>{t("Star a booking to keep it here. Jobs you own appear once you are recorded as their operator.")}</HomeDeckEmpty>
          )}
        </HomeDeckPanel>
      ),
    },
    {
      id: "follow-ups",
      module: (
        <HomeDeckPanel
          title="Who needs following up"
          count={followUps.length}
          action={<HomeDeckAction onClick={() => navigate("/inbox")}>{t("Inbox")}</HomeDeckAction>}
        >
          {followUps.length ? followUps.map((person, index) => (
            <HomeDeckRow key={person.threadId} index={index}>
              <button
                type="button"
                className={`${homeDeckRowButtonClass} items-start`}
                onClick={() => {
                  if (person.threadId && person.mailboxId) {
                    const thread = new URLSearchParams({ mailbox: person.mailboxId, thread: person.threadId })
                    navigate(`/inbox?${thread.toString()}`)
                    return
                  }
                  if (person.recordType === "lead" && person.recordId) navigate(`/crm/leads/${person.recordId}`)
                  else if (person.recordType === "contact" && person.recordId) navigate(`/crm/contacts/${person.recordId}`)
                  else if (person.recordType === "account" && person.recordId) navigate(`/crm/accounts/${person.recordId}`)
                  else if (person.recordType === "deal" && person.recordId) navigate(`/crm/deals/${person.recordId}`)
                  else if (person.recordType === "quote" && person.recordId) navigate(`/quotes/${person.recordId}`)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]" dir="auto">
                    {person.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-4 text-[var(--md-subtle)]" dir="auto">
                    {formatFollowUpRecommendation(person.recommendationCode, t)}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] leading-4 tabular-nums text-[var(--md-subtle)]" dir="ltr">
                  {formatWait(person.waitingFor)}
                </span>
              </button>
            </HomeDeckRow>
          )) : (
            <HomeDeckEmpty>{t("Nobody needs a follow-up right now. New replies and due CRM actions will appear here.")}</HomeDeckEmpty>
          )}
        </HomeDeckPanel>
      ),
    },
    {
      id: "clocks",
      module: (
        // Each region is its own container rather than a list inside a panel:
        // these are five independent clocks, not five rows of one thing.
        <HomeDeckPanel variant="bare" title="Clocking off">
          {clockOffRows.map((row, index) => (
            <HomeDeckTile key={row.code} index={index} className={clockOffTileClass[row.urgency]}>
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 translate-y-[-1px] rounded-full", clockOffDotClass[row.urgency])}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]">
                  {row.city}
                </span>
                {row.waiting ? (
                  <span className="shrink-0 text-[11px] leading-4 tabular-nums text-[var(--md-subtle)]" dir="ltr">
                    {row.waiting}
                  </span>
                ) : null}
                <span className={cn("shrink-0 text-[11.5px] leading-4 tabular-nums", clockOffGapClass[row.urgency])}>
                  {row.open
                    ? t("closes in {gap}").replace("{gap}", formatGap(row.minutes))
                    : t("opens in {gap}").replace("{gap}", formatGap(row.minutes))}
                </span>
              </div>
            </HomeDeckTile>
          ))}
        </HomeDeckPanel>
      ),
    },
  ]

  return (
    <div className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--md-bg)]">
      <div
        className={cn(
          "relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-[var(--md-page-stack-gap)] md-scrollbar",
          docked
            ? "pb-[max(var(--md-page-stack-gap),env(safe-area-inset-bottom))] pt-[var(--md-gap-lg)]"
            : "py-[clamp(28px,5vw,48px)]",
        )}
      >
        {/* Auto margins rather than `justify-center`: a centred flex column
            clips its own top once the content is taller than the viewport, and
            the greeting is the first thing that would go. */}
        <div className={cn("mx-auto w-full", docked ? "mt-auto max-w-none" : "my-auto max-w-[980px]")}>
          <HomeDexterLauncher
            className="max-w-none"
            operatorName={operatorName}
            standfirst={standfirst}
            suggestions={suggestions}
            docked={docked}
            onDockedChange={setDocked}
            navigate={navigate}
          />

          {/* Sending is the only thing that clears the deck, and `popLayout`
              takes it out of the flow the instant it starts leaving — so the
              modules stagger away while the composer travels down the page,
              rather than after it. */}
          <AnimatePresence mode="popLayout" initial={false}>
            {docked ? null : (
              <motion.div
                key="home-deck"
                className="mt-[var(--md-gap-xl)] grid grid-cols-2 gap-3 border-t border-[var(--md-line)] pt-[var(--md-gap-xl)] lg:grid-cols-4"
                variants={shouldReduceMotion ? undefined : deckVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                {deck.map(({ id, module }) => (
                  <motion.div
                    key={id}
                    className="aspect-[3/4] min-w-0"
                    variants={shouldReduceMotion ? undefined : deckModuleVariants}
                    style={{ willChange: "transform, opacity" }}
                  >
                    {module}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
