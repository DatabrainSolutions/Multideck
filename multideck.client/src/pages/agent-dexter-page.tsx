import { useEffect, useMemo, useState } from "react"
import { AlertCircle, BarChart3, History as HistoryIcon, Pause, Share2, ShieldCheck, Sparkles } from "lucide-react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  DexterAttachmentPalette,
  DexterBrandMark,
  DexterHistoryList,
  DexterMonitorStack,
  DexterMonitorDetailSheet,
  DexterPromptComposer,
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
import { cn } from "@/lib/utils"
import { mdMotion } from "@/lib/motion"
import { useLanguage } from "@/i18n/language-provider"
import {
  getDexterConversation,
  listDexterConversations,
  sendDexterMessage,
  type DexterConversation,
  type DexterConversationSummary,
  type DexterMessage,
} from "@/lib/dexter-api"

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
  title,
  isWorking,
  selectedSpecialistId,
  historyCount,
  onOpenHistory,
  watchersCollapsed,
  onToggleWatchers,
}: {
  title: string
  isWorking: boolean
  selectedSpecialistId: DexterSpecialistId
  historyCount: number
  onOpenHistory: () => void
  watchersCollapsed?: boolean
  onToggleWatchers?: () => void
}) {
  const { t } = useLanguage()
  const specialist = specialistById(selectedSpecialistId)
  const RouteIcon = selectedSpecialistId === "analytics" ? BarChart3 : ShieldCheck

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-[var(--md-gap-lg)] border-b border-[rgba(11,20,19,0.07)] px-[var(--md-page-stack-gap)] py-[var(--md-gap-lg)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{title}</h1>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[rgba(14,125,116,0.1)] px-3 text-[12px] font-medium text-[var(--md-accent)]">
            <span className="size-1.5 rounded-full bg-[var(--md-accent)]" />
            {isWorking ? t("Working") : t("Ready")}
          </span>
        </div>
        <p className="mt-1 flex items-start gap-2 text-[13px] leading-5 text-[var(--md-text)]">
          <RouteIcon className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.2} />
          <span>{t("Warehouse operations")} - {specialist.name} - {t("read-only access")}</span>
          <span className="sr-only">Selected specialist: {specialist.name}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white lg:hidden" onClick={onOpenHistory}>
          <HistoryIcon data-icon="inline-start" strokeWidth={1.2} />
          <span className="hidden sm:inline">{t("Previous conversations")}</span>
          {historyCount > 0 ? <span className="rounded-full bg-[var(--md-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">{historyCount}</span> : null}
        </Button>
        {watchersCollapsed ? (
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white" onClick={onToggleWatchers}>
            <Sparkles data-icon="inline-start" strokeWidth={1.2} />
            Show watchers
          </Button>
        ) : null}
        <Button variant="ghost" className="hidden h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white sm:inline-flex">
          <Pause data-icon="inline-start" strokeWidth={1.2} />
          Pause
        </Button>
        <Button variant="ghost" className="hidden h-9 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white sm:inline-flex">
          <Share2 data-icon="inline-start" strokeWidth={1.2} />
          Share
        </Button>
      </div>
    </header>
  )
}

function ConversationStream({
  messages,
  isWorking,
  error,
  wide = false,
}: {
  messages: DexterMessage[]
  isWorking: boolean
  error: string | null
  wide?: boolean
}) {
  const { t } = useLanguage()
  const streamWidth = wide ? "max-w-[920px]" : "max-w-[720px]"

  return (
    <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-[var(--md-page-stack-gap)] px-[var(--md-page-stack-gap)] py-[var(--md-page-section-gap)]", streamWidth)}>
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="ms-auto max-w-[620px] whitespace-pre-wrap rounded-[var(--md-radius-xl)] bg-[rgba(213,228,225,0.72)] px-5 py-4 text-[15px] leading-6 text-[var(--md-ink)]">
            {message.content}
          </div>
        ) : message.role === "assistant" ? (
          <div key={message.id} className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4">
            <DexterBrandMark className="mt-1" />
            <div className="min-w-0">
              <p className="text-[12px] text-[var(--md-subtle)]">Dexter</p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[var(--md-ink)]">{message.content}</p>
            </div>
          </div>
        ) : null,
      )}

      {isWorking ? (
        <div className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4" role="status">
          <DexterBrandMark className="mt-1" />
          <div className="min-w-0 pt-2">
            <p className="text-[12px] text-[var(--md-subtle)]">{t("Dexter is checking warehouse operations...")}</p>
            <div className="mt-3 flex gap-1.5" aria-hidden>
              {[0, 1, 2].map((index) => (
                <motion.span key={index} className="size-1.5 rounded-full bg-[var(--md-accent)]" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.16 }} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.07)] px-4 py-3 text-[13px] leading-5 text-[var(--md-red)] shadow-[0_0_0_1px_rgba(209,78,78,0.14)]" role="alert">
          <AlertCircle className="mt-0.5 size-4" strokeWidth={1.4} />
          <span><strong>{t("Dexter could not answer")}</strong><br />{t(error)}</span>
        </div>
      ) : null}
    </div>
  )
}

export function AgentDexterPage() {
  const { language, t } = useLanguage()
  const [stage, setStage] = useState<"landing" | "conversation">("landing")
  const [isSending, setIsSending] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<DexterConversationSummary[]>([])
  const [activeConversation, setActiveConversation] = useState<DexterConversation | null>(null)
  const [composerValue, setComposerValue] = useState("")
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<DexterSpecialistId>("auto")
  const [showSpecialists, setShowSpecialists] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [attachmentQuery, setAttachmentQuery] = useState("")
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set())
  const [selectedMonitor, setSelectedMonitor] = useState<DexterMonitor | null>(null)
  const [isMonitorRailCollapsed, setIsMonitorRailCollapsed] = useState(false)
  const selectedSpecialist = specialistById(selectedSpecialistId)
  const attachedItems = useAttachedItems(selectedAttachmentIds)
  const isWorking = isSending || isLoadingConversation
  const hasFocusOverlay = showHistory || showAttachments || (stage === "conversation" && showSpecialists) || selectedMonitor !== null
  const recommendedAttachmentIds = selectedSpecialistId === "customer" || selectedSpecialistId === "analytics"
    ? ["marlow", "md-22414", "ci-rev2"]
    : ["md-22455", "md-22479", "northwind", "co-cn"]
  const historyItems = useMemo<DexterHistoryItem[]>(
    () => conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
    })),
    [conversations],
  )

  useEffect(() => {
    if (stage === "conversation") {
      window.scrollTo(0, 0)
    }
  }, [stage])

  useEffect(() => {
    let cancelled = false
    void listDexterConversations()
      .then((items) => {
        if (!cancelled) setConversations(items)
      })
      .catch(() => {
        if (!cancelled) setConversations([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false)
      })

    return () => {
      cancelled = true
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

  async function submitPrompt(prompt = composerValue, specialistId = selectedSpecialistId) {
    const message = prompt.trim()
    if (!message || isWorking) return

    const previousConversation = activeConversation
    const pendingMessage: DexterMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    }
    const pendingConversation: DexterConversation = previousConversation?.id
      ? { ...previousConversation, messages: [...previousConversation.messages, pendingMessage] }
      : {
          id: "",
          title: message.length > 100 ? `${message.slice(0, 99).trimEnd()}…` : message,
          summary: "",
          updatedAt: pendingMessage.createdAt,
          messages: [pendingMessage],
        }

    setActiveConversation(pendingConversation)
    setStage("conversation")
    setIsSending(true)
    setError(null)
    setShowSpecialists(false)
    setShowAttachments(false)
    window.scrollTo(0, 0)

    try {
      const conversation = await sendDexterMessage({
        conversationId: previousConversation?.id || null,
        message,
        specialist: specialistId,
        attachments: attachedItems.map((attachment) => ({ id: attachment.id, type: attachment.type, title: attachment.title })),
      })
      setActiveConversation(conversation)
      setConversations((items) => [
        { id: conversation.id, title: conversation.title, summary: conversation.summary, updatedAt: conversation.updatedAt },
        ...items.filter((item) => item.id !== conversation.id),
      ])
      setComposerValue("")
      setSelectedAttachmentIds(new Set())
    } catch (requestError) {
      setActiveConversation(previousConversation ?? pendingConversation)
      setError(requestError instanceof Error ? requestError.message : t("Dexter could not answer this request."))
    } finally {
      setIsSending(false)
    }
  }

  async function handleHistorySelect(id: string) {
    setShowHistory(false)
    setStage("conversation")
    setIsLoadingConversation(true)
    setError(null)
    try {
      setActiveConversation(await getDexterConversation(id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("This conversation could not be loaded."))
    } finally {
      setIsLoadingConversation(false)
    }
  }

  function handleSuggestion(prompt: string, specialistId: DexterSpecialistId) {
    setComposerValue(prompt)
    setSelectedSpecialistId(specialistId)
    void submitPrompt(prompt, specialistId)
  }

  function startNewConversation() {
    setShowHistory(false)
    setStage("landing")
    setActiveConversation(null)
    setError(null)
    setComposerValue("")
    setSelectedAttachmentIds(new Set())
    setSelectedSpecialistId("auto")
  }

  function openHistory() {
    setShowAttachments(false)
    setShowSpecialists(false)
    setSelectedMonitor(null)
    setShowHistory(true)
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
              setShowHistory(false)
              setSelectedMonitor(null)
            }}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {showHistory ? (
          <motion.div
            key="dexter-history-panel"
            className="fixed inset-y-4 end-4 z-30 w-[min(390px,calc(100vw-32px))]"
            initial={{ opacity: 0, x: language === "ar" ? -24 : 24, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: language === "ar" ? -18 : 18, scale: 0.99 }}
            transition={mdMotion.panel}
            style={{ willChange: "transform, opacity" }}
          >
            <DexterHistoryList
              variant="panel"
              items={historyItems}
              activeId={activeConversation?.id ?? ""}
              isLoading={isLoadingHistory}
              onSelect={(id) => void handleHistorySelect(id)}
              onNew={startNewConversation}
              onClose={() => setShowHistory(false)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        {stage === "landing" ? (
          <motion.div
            key="dexter-landing"
            className="relative grid h-screen min-h-[680px] grid-cols-1 overflow-hidden bg-[var(--md-bg)] lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1, transition: { duration: 0.01 } }}
            transition={mdMotion.page}
          >
        <motion.div
          className="hidden h-full min-h-0 lg:block"
          initial={{ x: language === "ar" ? 22 : -22, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ ...mdMotion.page, delay: 0.04 }}
          style={{ willChange: "transform, opacity" }}
        >
          <DexterHistoryList
            items={historyItems}
            activeId=""
            isLoading={isLoadingHistory}
            onSelect={(id) => void handleHistorySelect(id)}
            onNew={startNewConversation}
          />
        </motion.div>

        <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
        <Button
          type="button"
          variant="ghost"
          className="absolute start-[var(--md-page-stack-gap)] top-[var(--md-page-stack-gap)] z-10 h-9 rounded-full bg-white/58 px-3 text-[13px] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-white lg:hidden"
          onClick={openHistory}
        >
          <HistoryIcon data-icon="inline-start" strokeWidth={1.2} />
          {t("History")}
          {historyItems.length > 0 ? <span className="rounded-full bg-[var(--md-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">{historyItems.length}</span> : null}
        </Button>
        <div className="mx-auto flex w-full max-w-[850px] flex-1 flex-col justify-center px-[var(--md-page-stack-gap)] py-[clamp(48px,8vw,64px)]">
          {!isSending ? (
            <motion.div
              className="mx-auto mb-[var(--md-page-section-gap)] text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={mdMotion.page}
            >
              <Sparkles className="mx-auto size-8 text-[var(--md-accent)]" strokeWidth={1.2} />
              <h1 className="mt-[var(--md-page-section-gap)] text-[24px] font-medium leading-tight text-[var(--md-ink)] sm:text-[30px]">{t("What can I help you with today?")}</h1>
              <p className="mt-4 text-[15px] text-[var(--md-text)]">{t("Orders, inventory, warehouse tasks, and exceptions - ask Dexter what needs attention.")}</p>
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
              onSend={() => void submitPrompt()}
              disabled={isWorking}
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

          {!showSpecialists && !showAttachments && !isSending ? (
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

        <div className="hidden items-center justify-center px-[var(--md-page-pad)] pb-[var(--md-page-pad)] text-[13px] text-[var(--md-text)] lg:flex">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--md-green)]" />
            Watching 4 things for you - Maersk on-time fell 7% overnight
            <button type="button" className="font-medium text-[var(--md-accent)]">View</button>
          </span>
        </div>
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
        className="hidden h-full min-h-0 lg:block"
        initial={{ x: -22, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...mdMotion.page, delay: 0.06 }}
        style={{ willChange: "transform, opacity" }}
      >
        <DexterHistoryList
          items={historyItems}
          activeId={activeConversation?.id ?? ""}
          isLoading={isLoadingHistory}
          onSelect={(id) => void handleHistorySelect(id)}
          onNew={startNewConversation}
        />
      </motion.div>

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
        <motion.div
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...mdMotion.page, delay: 0.08 }}
        >
          <DexterPageHeader
            title={activeConversation?.title ?? t("Warehouse conversation")}
            isWorking={isWorking}
            selectedSpecialistId={selectedSpecialistId}
            historyCount={historyItems.length}
            onOpenHistory={openHistory}
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
          <ConversationStream messages={activeConversation?.messages ?? []} isWorking={isWorking} error={error} wide={isMonitorRailCollapsed} />
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
                onSend={() => void submitPrompt()}
                disabled={isWorking}
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
            className="hidden h-full min-h-0 lg:block"
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
