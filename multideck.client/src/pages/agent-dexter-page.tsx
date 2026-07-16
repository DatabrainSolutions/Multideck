import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, BarChart3, Pause, Share2, ShieldCheck, Sparkles } from "lucide-react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  DexterAttachmentPalette,
  DexterChecklistCard,
  DexterCustomerSnapshot,
  DexterHistoryList,
  DexterMonitorStack,
  DexterMonitorDetailSheet,
  DexterPromptComposer,
  DexterRiskTable,
  DexterSpecialistChip,
  DexterSpecialistMenu,
  DexterSpecialistPicker,
  DexterSuggestionGrid,
  defaultDexterAttachments,
  defaultDexterSpecialists,
  type DexterAttachment,
  type DexterHistoryItem,
  type DexterMonitor,
  type DexterSpecialistId,
} from "@/components/multideck/agent-dexter-components"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"

const historyItems: DexterHistoryItem[] = [
  { id: "customs-risk", title: "At-risk customs this week", summary: "4 flagged - drafts ready for review", time: "11:42" },
  { id: "marlow-qbr", title: "Marlow Apparel - QBR prep", summary: "Snapshot, talking points, agenda draft", time: "10:05" },
  { id: "daily", title: "Daily briefing - 11 Jun", summary: "Quiet night. 23 in transit, 2 need you.", time: "07:00" },
  { id: "rates", title: "Compare rates - Yantian to Felixstowe", summary: "3 carriers - ONE wins on direct and on-time", time: "Yesterday" },
  { id: "maersk", title: "Why is Maersk slipping?", summary: "On-time fell from 94% to 87% over 60d", time: "Yesterday" },
  { id: "refund", title: "Refund analysis - May demurrage", summary: "Owed EUR 4,820 across 6 containers", time: "Jun 4" },
]

const monitors: DexterMonitor[] = [
  {
    title: "Berth queue - MD-22479",
    body: "Watching Rotterdam congestion. Re-pings if ETA shifts more than 6h.",
    meta: "since Wed 09:18",
    detail: "last ping 36 min ago",
    tone: "amber",
  },
  {
    title: "Doc parse confidence < 80%",
    body: "Any document Dexter is not sure about gets flagged for review.",
    meta: "always on",
    detail: "1 today - CO-CN-44128",
    tone: "blue",
  },
  {
    title: "Quote response - Q-1882",
    body: "Northwind GmbH has not replied. Follow-up drafts after 48h of silence.",
    meta: "since Mon 14:22",
    detail: "next check Wed 14:22",
    tone: "teal",
  },
  {
    title: "Carrier on-time degradation",
    body: "If any carrier drops 5%+ vs trailing 90 days, it is raised here.",
    meta: "always on",
    detail: "Maersk fell 7% last week",
    tone: "red",
  },
]

function specialistById(id: DexterSpecialistId) {
  return defaultDexterSpecialists.find((specialist) => specialist.id === id) ?? defaultDexterSpecialists[0]
}

function useAttachedItems(selectedAttachmentIds: Set<string>) {
  return useMemo(
    () => defaultDexterAttachments.filter((attachment) => selectedAttachmentIds.has(attachment.id)),
    [selectedAttachmentIds],
  )
}

function DexterPageHeader({
  conversationMode,
  selectedSpecialistId,
  watchersCollapsed,
  onToggleWatchers,
}: {
  conversationMode: "customs" | "customer"
  selectedSpecialistId: DexterSpecialistId
  watchersCollapsed?: boolean
  onToggleWatchers?: () => void
}) {
  const specialist = specialistById(selectedSpecialistId)
  const copy =
    conversationMode === "customer"
      ? {
          title: "Marlow Apparel - QBR prep",
          route: "Routed to Analytics & reporting - 1 attached context - reads bookings, comms, invoices",
          icon: BarChart3,
        }
      : {
          title: "At-risk customs this week",
          route: "Routed to Customs & compliance - read access to bookings, documents, comms - writes need approval",
          icon: ShieldCheck,
        }

  const RouteIcon = copy.icon

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-[var(--md-gap-lg)] border-b border-[rgba(11,20,19,0.07)] px-[var(--md-page-stack-gap)] py-[var(--md-gap-lg)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{copy.title}</h1>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[rgba(14,125,116,0.1)] px-3 text-[12px] font-medium text-[var(--md-accent)]">
            <span className="size-1.5 rounded-full bg-[var(--md-accent)]" />
            Working
          </span>
        </div>
        <p className="mt-1 flex items-start gap-2 text-[13px] leading-5 text-[var(--md-text)]">
          <RouteIcon className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.2} />
          <span>{copy.route}</span>
          <span className="sr-only">Selected specialist: {specialist.name}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {watchersCollapsed ? (
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white" onClick={onToggleWatchers}>
            <Sparkles data-icon="inline-start" strokeWidth={1.2} />
            Show watchers
          </Button>
        ) : null}
        <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white">
          <Pause data-icon="inline-start" strokeWidth={1.2} />
          Pause
        </Button>
        <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white">
          <Share2 data-icon="inline-start" strokeWidth={1.2} />
          Share
        </Button>
      </div>
    </header>
  )
}

function ConversationStream({
  conversationMode,
  wide = false,
}: {
  conversationMode: "customs" | "customer"
  wide?: boolean
}) {
  const streamWidth = wide ? "max-w-[920px]" : "max-w-[720px]"

  if (conversationMode === "customer") {
    return (
      <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-[var(--md-page-stack-gap)] px-[var(--md-page-stack-gap)] py-[var(--md-page-section-gap)]", streamWidth)}>
        <div className="ml-auto max-w-[620px] rounded-[var(--md-radius-xl)] bg-[rgba(213,228,225,0.72)] px-5 py-4 text-[15px] leading-6 text-[var(--md-ink)]">
          <DexterSpecialistChip specialist={specialistById("customer")} />
          <span className="ml-2">Prep me for Thursday's QBR with Sandra - what should I know, and what should we ask for?</span>
        </div>

        <div className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4">
          <DexterBrandMark className="mt-1" />
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--md-subtle)]">Dexter - Analytics & reporting - 10:05</p>
            <p className="mt-3 text-[15px] leading-6 text-[var(--md-ink)]">Here is where Marlow stands going into Thursday.</p>
            <div className="mt-4">
              <DexterCustomerSnapshot />
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4">
          <DexterBrandMark className="mt-1" />
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--md-subtle)]">Dexter</p>
            <p className="mt-3 text-[15px] leading-6 text-[var(--md-ink)]">Three things worth raising:</p>
            <div className="mt-4 overflow-hidden rounded-[var(--md-radius-xl)] bg-[rgba(251,253,253,0.72)] shadow-[var(--md-shadow-line)]">
              {[
                ["1", "Volumes are stepping up", "Sandra mentioned AW26 may run 20% above forecast. Propose locking Q4 capacity now - rates favour early commitment."],
                ["2", "On-time recovered", "After the April dip, the last 8 weeks averaged 96%. Worth claiming credit - it was the reroute via Felixstowe."],
                ["3", "One open hold", "MD-22414 - CI / packing list mismatch. Resolution drafted; clearing it before Thursday makes the story clean."],
              ].map(([index, title, body]) => (
                <div key={title} className="grid grid-cols-[28px_1fr] gap-3 border-b border-[rgba(11,20,19,0.05)] px-5 py-4 last:border-b-0">
                  <span className="grid size-5 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[11px] font-medium text-[var(--md-accent)]">{index}</span>
                  <div>
                    <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-[var(--md-page-stack-gap)] px-[var(--md-page-stack-gap)] py-[var(--md-page-section-gap)]", streamWidth)}>
      <div className="ml-auto max-w-[620px] rounded-[var(--md-radius-xl)] bg-[rgba(213,228,225,0.72)] px-5 py-4 text-[15px] leading-6 text-[var(--md-ink)]">
        Find bookings at risk of customs delay this week, and draft notifications to the customers.
      </div>

      <div className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4">
        <DexterBrandMark className="mt-1" />
        <div className="min-w-0">
          <p className="text-[12px] text-[var(--md-subtle)]">Dexter - Customs & compliance - 11:42</p>
          <p className="mt-3 text-[15px] leading-6 text-[var(--md-ink)]">I will work through this in four steps.</p>
          <div className="mt-4">
            <DexterChecklistCard
              items={[
                { label: "Pull open bookings arriving this week - 23 found.", done: true },
                { label: "Cross-check HS codes against active regulations and recent holds.", done: true },
                { label: "Pull each customer's preferred contact and recent tone.", done: true },
                { label: "Draft notifications and surface them for approval." },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4">
        <DexterBrandMark className="mt-1" />
        <div className="min-w-0">
          <p className="text-[12px] text-[var(--md-subtle)]">Dexter</p>
          <p className="mt-3 text-[15px] leading-6 text-[var(--md-ink)]">
            <strong>Four bookings</strong> have elevated customs risk - one already on hold, three flagged by rule checks.
          </p>
          <div className="mt-4">
            <DexterRiskTable />
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentDexterPage() {
  const [stage, setStage] = useState<"landing" | "conversation">("landing")
  const [isLaunchingConversation, setIsLaunchingConversation] = useState(false)
  const [composerValue, setComposerValue] = useState("")
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<DexterSpecialistId>("auto")
  const [showSpecialists, setShowSpecialists] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachmentQuery, setAttachmentQuery] = useState("")
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set())
  const [activeHistoryId, setActiveHistoryId] = useState("customs-risk")
  const [conversationMode, setConversationMode] = useState<"customs" | "customer">("customs")
  const [selectedMonitor, setSelectedMonitor] = useState<DexterMonitor | null>(null)
  const [isMonitorRailCollapsed, setIsMonitorRailCollapsed] = useState(false)
  const launchTimeoutRef = useRef<number | null>(null)
  const selectedSpecialist = specialistById(selectedSpecialistId)
  const attachedItems = useAttachedItems(selectedAttachmentIds)
  const hasFocusOverlay = showAttachments || (stage === "conversation" && showSpecialists) || selectedMonitor !== null
  const recommendedAttachmentIds =
    conversationMode === "customer"
      ? ["marlow", "md-22414", "ci-rev2"]
      : ["md-22455", "md-22479", "northwind", "co-cn"]

  useEffect(() => {
    if (stage === "conversation") {
      window.scrollTo(0, 0)
    }
  }, [stage])

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current !== null) {
        window.clearTimeout(launchTimeoutRef.current)
      }
    }
  }, [])

  function toggleAttachment(id: string) {
    setSelectedAttachmentIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addAttachment(id: string) {
    setSelectedAttachmentIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  function startConversation(mode?: "customs" | "customer") {
    const nextMode =
      mode ??
      (selectedAttachmentIds.has("marlow") || selectedSpecialistId === "analytics" || composerValue.toLowerCase().includes("qbr")
        ? "customer"
        : "customs")

    setConversationMode(nextMode)
    setActiveHistoryId(nextMode === "customer" ? "marlow-qbr" : "customs-risk")
    window.scrollTo(0, 0)
    setIsLaunchingConversation(true)
    setShowSpecialists(false)
    setShowAttachments(false)
    if (launchTimeoutRef.current !== null) {
      window.clearTimeout(launchTimeoutRef.current)
    }
    launchTimeoutRef.current = window.setTimeout(() => {
      setStage("conversation")
      setIsLaunchingConversation(false)
      launchTimeoutRef.current = null
    }, 140)
  }

  function handleHistorySelect(id: string) {
    setActiveHistoryId(id)
    setConversationMode(id === "marlow-qbr" ? "customer" : "customs")
    setStage("conversation")
  }

  function handleSuggestion(prompt: string, specialistId: DexterSpecialistId) {
    setComposerValue(prompt)
    setSelectedSpecialistId(specialistId)
    if (specialistId === "analytics") {
      setSelectedAttachmentIds(new Set(["marlow"]))
      startConversation("customer")
    } else {
      startConversation("customs")
    }
  }

  return (
    <LayoutGroup>
      <AnimatePresence initial={false}>
        {hasFocusOverlay ? (
          <motion.div
            key="dexter-focus-overlay"
            className="fixed inset-0 z-20 bg-[rgba(11,20,19,0.22)] backdrop-blur-[7px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={mdMotion.smooth}
            onClick={() => {
              setShowAttachments(false)
              setShowSpecialists(false)
              setSelectedMonitor(null)
            }}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        {stage === "landing" ? (
          <motion.div
            key="dexter-landing"
            className="relative flex min-h-[calc(100vh)] flex-col overflow-hidden bg-[var(--md-bg)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1, transition: { duration: 0.01 } }}
            transition={mdMotion.page}
          >
        <div className="mx-auto flex w-full max-w-[850px] flex-1 flex-col justify-center px-[var(--md-page-stack-gap)] py-[clamp(48px,8vw,64px)]">
          {!isLaunchingConversation ? (
            <motion.div
              className="mx-auto mb-[var(--md-page-section-gap)] text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={mdMotion.page}
            >
              <div className="flex items-center justify-center gap-3">
                <DexterBrandMark className="size-6 shrink-0" />
                <h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)] sm:text-[30px]">What can I help you with today?</h1>
              </div>
              <p className="mt-4 text-[15px] text-[var(--md-text)]">Bookings, customers, documents, rates - or hand me the whole job.</p>
            </motion.div>
          ) : null}

          <motion.div
            layoutId="dexter-composer"
            className="relative z-30"
            transition={mdMotion.spring}
            style={{ willChange: "transform" }}
          >
            <DexterPromptComposer
              value={composerValue}
              selectedSpecialist={selectedSpecialist}
              attachments={attachedItems}
              onChange={setComposerValue}
              onOpenAttachments={() => setShowAttachments((value) => !value)}
              onOpenSpecialists={() => setShowSpecialists((value) => !value)}
              onRemoveAttachment={(id) => toggleAttachment(id)}
              onSend={() => startConversation()}
            />
          </motion.div>

          <AnimatePresence initial={false}>
            {showSpecialists ? (
              <motion.div
                key="specialists-landing"
                className="relative z-30"
                layout
                initial={{ opacity: 0, y: -6, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.985 }}
                transition={mdMotion.panel}
                style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
              >
                <DexterSpecialistPicker
                  specialists={defaultDexterSpecialists}
                  selectedId={selectedSpecialistId}
                  onSelect={(id) => {
                    setSelectedSpecialistId(id)
                    setShowSpecialists(false)
                  }}
                  className="mt-4"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showAttachments ? (
              <motion.div
                key="attachments-landing"
                className="relative z-30"
                layout
                initial={{ opacity: 0, y: -6, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.985 }}
                transition={mdMotion.panel}
                style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
              >
                <DexterAttachmentPalette
                  query={attachmentQuery}
                  items={defaultDexterAttachments}
                  selectedIds={selectedAttachmentIds}
                  recommendedIds={recommendedAttachmentIds}
                  onQueryChange={setAttachmentQuery}
                  onToggle={addAttachment}
                  onClose={() => setShowAttachments(false)}
                  className="mt-4"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!showSpecialists && !showAttachments && !isLaunchingConversation ? (
            <motion.div
              className="mt-[var(--md-gap-xl)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={mdMotion.panel}
            >
              <DexterSuggestionGrid onPick={handleSuggestion} />
            </motion.div>
          ) : null}
        </div>

        <div className="hidden items-center justify-center gap-[clamp(32px,6vw,64px)] px-[var(--md-page-pad)] pb-[var(--md-page-pad)] text-[13px] text-[var(--md-text)] lg:flex">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--md-green)]" />
            Watching 4 things for you - Maersk on-time fell 7% overnight
            <button type="button" className="font-medium text-[var(--md-accent)]">View</button>
          </span>
          <button type="button" className="font-medium text-[var(--md-text)]">
            Recent: At-risk customs this week <ArrowRight className="inline size-3" strokeWidth={1.2} />
          </button>
        </div>
      </motion.div>
        ) : (
          <motion.div
            key="dexter-conversation"
            className={cn(
              "grid h-screen min-h-[680px] grid-cols-1 overflow-hidden bg-[var(--md-bg)] transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isMonitorRailCollapsed
                ? "lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)]"
                : "lg:grid-cols-[290px_minmax(0,1fr)_340px] xl:grid-cols-[310px_minmax(0,1fr)_360px]",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={mdMotion.smooth}
          >
      <motion.div
        className="h-full min-h-0"
        initial={{ x: -22, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...mdMotion.page, delay: 0.06 }}
        style={{ willChange: "transform, opacity" }}
      >
        <DexterHistoryList
          items={historyItems}
          activeId={activeHistoryId}
          onSelect={handleHistorySelect}
          onNew={() => {
            setStage("landing")
            setComposerValue("")
            setSelectedAttachmentIds(new Set())
            setSelectedSpecialistId("auto")
          }}
        />
      </motion.div>

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
        <motion.div
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...mdMotion.page, delay: 0.08 }}
        >
          <DexterPageHeader
            conversationMode={conversationMode}
            selectedSpecialistId={selectedSpecialistId}
            watchersCollapsed={isMonitorRailCollapsed}
            onToggleWatchers={() => setIsMonitorRailCollapsed(false)}
          />
        </motion.div>
        <motion.div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[170px] md-scrollbar"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...mdMotion.page, delay: 0.12 }}
        >
          <ConversationStream conversationMode={conversationMode} wide={isMonitorRailCollapsed} />
        </motion.div>
        <motion.div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--md-bg)] via-[var(--md-bg)]/96 to-transparent px-[var(--md-page-stack-gap)] pb-[var(--md-page-stack-gap)] pt-[var(--md-page-section-gap)]"
          initial={false}
          animate={{ y: 0, opacity: 1 }}
          transition={mdMotion.smooth}
        >
          <div className={cn("relative mx-auto w-full transition-[max-width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", isMonitorRailCollapsed ? "max-w-[920px]" : "max-w-[720px]")}>
            <motion.div
              layoutId="dexter-composer"
              className="relative z-30"
              transition={mdMotion.spring}
              style={{ willChange: "transform" }}
            >
              <DexterPromptComposer
                compact
                value={composerValue}
                selectedSpecialist={selectedSpecialist}
                attachments={attachedItems}
                onChange={setComposerValue}
                onOpenAttachments={() => setShowAttachments((value) => !value)}
                onOpenSpecialists={() => setShowSpecialists((value) => !value)}
                onRemoveAttachment={(id) => toggleAttachment(id)}
                onSend={() => startConversation()}
                className="shadow-[0_0_0_1px_rgba(14,125,116,0.42),0_16px_38px_rgba(42,52,50,0.16)]"
              />
            </motion.div>

            <AnimatePresence initial={false}>
              {showAttachments ? (
                <motion.div
                  key="attachments-conversation"
                  className="fixed bottom-[168px] left-1/2 z-40 w-[min(860px,calc(100vw-48px))] -translate-x-1/2 lg:left-[calc(var(--md-sidebar-width)+(100vw-var(--md-sidebar-width))/2)] lg:w-[min(860px,calc(100vw-var(--md-sidebar-width)-48px))]"
                  initial={{ opacity: 0, y: 14, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={mdMotion.panel}
                  style={{ willChange: "transform, opacity" }}
                >
                  <DexterAttachmentPalette
                    query={attachmentQuery}
                    items={defaultDexterAttachments}
                    selectedIds={selectedAttachmentIds}
                    recommendedIds={recommendedAttachmentIds}
                    onQueryChange={setAttachmentQuery}
                    onToggle={addAttachment}
                    onClose={() => setShowAttachments(false)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {showSpecialists ? (
                <motion.div
                  key="specialists-conversation"
                  className="absolute bottom-[168px] left-0 z-40"
                  initial={{ opacity: 0, y: 14, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={mdMotion.panel}
                  style={{ willChange: "transform, opacity" }}
                >
                  <DexterSpecialistMenu
                    specialists={defaultDexterSpecialists}
                    selectedId={selectedSpecialistId}
                    onSelect={(id) => {
                      setSelectedSpecialistId(id)
                      setShowSpecialists(false)
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      <AnimatePresence initial={false}>
        {!isMonitorRailCollapsed ? (
          <motion.div
            className="h-full min-h-0"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ ...mdMotion.panel, delay: 0.02 }}
            style={{ willChange: "transform, opacity" }}
          >
            <DexterMonitorStack
              monitors={monitors}
              onCollapse={() => setIsMonitorRailCollapsed(true)}
              onSelectMonitor={(monitor) => setSelectedMonitor(monitor)}
              onAsk={() => {
                setComposerValue("Watch for any customer-critical movement on Northwind bookings this week.")
                setShowSpecialists(true)
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {selectedMonitor ? (
          <motion.div
            key="monitor-detail"
            className="fixed inset-y-0 right-0 z-50 w-[min(580px,calc(100vw-24px))]"
            initial={{ x: 42, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 42, opacity: 0 }}
            transition={mdMotion.panel}
            style={{ willChange: "transform, opacity" }}
          >
            <DexterMonitorDetailSheet monitor={selectedMonitor} floating={false} onClose={() => setSelectedMonitor(null)} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </LayoutGroup>
  )
}
