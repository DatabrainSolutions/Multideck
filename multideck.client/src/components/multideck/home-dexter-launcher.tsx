import { useCallback, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { FileText, MessageSquareText, Radar } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdEaseOut, mdMotion, reduceMotion } from "@/lib/motion"
import { useMinuteTick } from "@/lib/clock"
import {
  DexterPromptComposer,
  defaultDexterSpecialists,
  type DexterAccessMode,
  type DexterAttachment,
  type DexterMentionItem,
  type DexterSlashCommand,
  type DexterSpecialistId,
} from "@/components/multideck/agent-dexter-components"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import { HomePromptRail, type HomePromptSuggestion } from "@/components/multideck/home-prompt-rail"
import { dexterMentionSnapshot } from "@/data/dexter-mentions"
import { defaultDexterModelId, type DexterModelId } from "@/data/dexter-models"
import { setDexterAccessMode, uploadDexterDocument, type DexterUploadedDocument } from "@/lib/dexter-api"
import { useDexterMentionSources } from "@/lib/dexter-mention-sources"
import { rememberDexterHomeHandoff } from "@/lib/dexter-home-handoff"

/** Roughly four characters per token, matching the estimate the workspace uses. */
const charactersPerToken = 4
const contextWindowTokens = 128_000
const maxUploadedDocuments = 3
/** How long the composer takes to travel from Home's centre to its conversation position. */
const dockTravelMs = 300

export type HomeGreetingPart = "welcome" | "morning" | "afternoon" | "evening"

/**
 * Which part of the day the operator is in, on their own clock. Freight runs
 * through the night, so the hours before dawn get their own greeting rather
 * than being called morning three hours early.
 */
export function greetingPartForHour(hour: number): HomeGreetingPart {
  if (hour >= 5 && hour < 12) return "morning"
  if (hour >= 12 && hour < 18) return "afternoon"
  if (hour >= 18 && hour < 23) return "evening"
  return "welcome"
}

const greetingCopy: Record<HomeGreetingPart, { withName: string; withoutName: string }> = {
  morning: { withName: "Good morning, {name}", withoutName: "Good morning" },
  afternoon: { withName: "Good afternoon, {name}", withoutName: "Good afternoon" },
  evening: { withName: "Good evening, {name}", withoutName: "Good evening" },
  welcome: { withName: "Welcome back, {name}", withoutName: "Welcome back" },
}

/** The name the operator would use for themselves, not their record name. */
function firstName(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? ""
  return first.length > 1 ? first : ""
}

export function HomeDexterLauncher({
  operatorName,
  /** One honest line about the day, built from live work. */
  standfirst,
  /** Prompts drawn from this operator's own records, not a generic menu. */
  suggestions = [],
  /**
   * True only once a prompt has been sent. Writing one changes nothing on the
   * screen: an operator mid-sentence should never have the page rearrange
   * around them, and half a prompt is not a decision to leave Home.
   */
  docked,
  onDockedChange,
  navigate,
  className,
}: {
  operatorName: string | null
  standfirst?: string
  suggestions?: HomePromptSuggestion[]
  docked: boolean
  onDockedChange: (docked: boolean) => void
  navigate: (path: string) => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const now = useMinuteTick()
  const [value, setValue] = useState("")
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<DexterSpecialistId>("auto")
  const [selectedModelId, setSelectedModelId] = useState<DexterModelId>(defaultDexterModelId)
  const [accessMode, setAccessMode] = useState<DexterAccessMode>("approve")
  const [pendingAccessMode, setPendingAccessMode] = useState<DexterAccessMode | null>(null)
  const [fullAccessGrantId, setFullAccessGrantId] = useState<string | null>(null)
  const [isAccessModeChanging, setIsAccessModeChanging] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [mentions, setMentions] = useState<DexterMentionItem[]>([])
  const [uploadedDocuments, setUploadedDocuments] = useState<DexterUploadedDocument[]>([])
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)
  const [isHandingOver, setIsHandingOver] = useState(false)
  /** The @ picker's register reads wait until the composer is actually used. */
  const [composerTouched, setComposerTouched] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handoverPendingRef = useRef(false)
  const clientSessionIdRef = useRef(crypto.randomUUID())
  const accessModeInFlightRef = useRef(false)
  const { mentionItems } = useDexterMentionSources(composerTouched)

  const greeting = useMemo(() => {
    const part = greetingPartForHour(now.getHours())
    const name = firstName(operatorName)
    return name
      ? t(greetingCopy[part].withName).replace("{name}", name)
      : t(greetingCopy[part].withoutName)
  }, [now, operatorName, t])

  const attachments = useMemo<DexterAttachment[]>(() => uploadedDocuments.map((document) => ({
    id: document.id,
    type: "uploaded_document" as const,
    title: document.fileName,
    meta: `${Math.max(1, Math.ceil(document.sizeBytes / 1024)).toLocaleString()} KB`,
    tone: "teal" as const,
    icon: FileText,
  })), [uploadedDocuments])

  // The same estimate the workspace shows, so the meter does not jump the
  // moment the prompt lands in Dexter.
  const contextUsedTokens = useMemo(() => {
    const contextCost = [...attachments, ...mentions]
      .reduce((total, item) => total + Math.ceil((item.title.length + (item.meta?.length ?? 0)) / charactersPerToken) + 24, 0)
    return Math.ceil(value.length / charactersPerToken) + contextCost
  }, [attachments, mentions, value])

  const slashCommands = useMemo<DexterSlashCommand[]>(() => [
    { id: "mode:chat", command: "/chat", label: "Chat", description: "Investigate or complete work.", group: "mode", icon: MessageSquareText, selected: true },
    { id: "mode:watch", command: "/watch", label: "Watch", description: "Alert you when workspace records change.", group: "mode", icon: Radar },
  ], [])

  /**
   * Dexter's workspace is a separate chunk. Fetch it while the prompt is still
   * being written, so the handover never waits on a network round trip and the
   * composer lands in the conversation without a blank frame between them.
   */
  const prepareWorkspace = useCallback(() => {
    setComposerTouched(true)
    void import("@/pages/agent-dexter-page")
  }, [])

  const openWorkspace = useCallback(() => {
    if (!handoverPendingRef.current) return
    handoverPendingRef.current = false
    navigate("/agent-dexter")
  }, [navigate])

  /**
   * Sending is one movement, not a page change. The composer drops to the
   * position it will hold in the conversation, and only once it is there does
   * the workspace take over — so the prompt the operator wrote is still under
   * their cursor when the thread opens.
   */
  const handOver = useCallback((prompt: string, specialistId: DexterSpecialistId = selectedSpecialistId) => {
    const message = prompt.trim()
    if (!message || isHandingOver) return
    setIsHandingOver(true)
    rememberDexterHomeHandoff({
      prompt: message,
      specialistId,
      modelId: selectedModelId,
      accessMode,
      fullAccessGrantId,
      clientSessionId: clientSessionIdRef.current,
      mentions: mentions.map(dexterMentionSnapshot),
      uploadedDocuments,
    })

    if (shouldReduceMotion) {
      navigate("/agent-dexter")
      return
    }

    handoverPendingRef.current = true
    onDockedChange(true)
    // A layout animation that never runs — an interrupted transition, a hidden
    // tab — must not strand the prompt on Home.
    window.setTimeout(openWorkspace, dockTravelMs + 80)
  }, [
    accessMode,
    fullAccessGrantId,
    isHandingOver,
    mentions,
    navigate,
    onDockedChange,
    openWorkspace,
    selectedModelId,
    selectedSpecialistId,
    shouldReduceMotion,
    uploadedDocuments,
  ])

  async function handleAccessModeChange(mode: DexterAccessMode) {
    if (mode === accessMode || accessModeInFlightRef.current) return
    const previousMode = accessMode
    const previousGrantId = fullAccessGrantId
    accessModeInFlightRef.current = true
    setComposerError(null)
    setPendingAccessMode(mode)
    setIsAccessModeChanging(true)
    try {
      const access = await setDexterAccessMode({
        conversationId: null,
        clientSessionId: clientSessionIdRef.current,
        mode,
      })
      setAccessMode(access.mode)
      setFullAccessGrantId(access.grantId)
    } catch (error) {
      setAccessMode(previousMode)
      setFullAccessGrantId(previousGrantId)
      setComposerError(error instanceof Error ? error.message : t("Dexter could not secure that access mode."))
    } finally {
      accessModeInFlightRef.current = false
      setPendingAccessMode(null)
      setIsAccessModeChanging(false)
    }
  }

  async function handleDocumentUpload(files: File[]) {
    if (isUploadingDocument || files.length === 0) return
    const remaining = maxUploadedDocuments - uploadedDocuments.length
    if (remaining <= 0) {
      setComposerError(t("You can attach up to three computer files to one request."))
      return
    }
    const selected = files.slice(0, remaining)
    const truncated = files.length > remaining
    setIsUploadingDocument(true)
    setComposerError(truncated ? t("Only the first three files were selected.") : null)
    const results = await Promise.allSettled(selected.map((file) => uploadDexterDocument(file)))
    const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
    if (uploaded.length) {
      setUploadedDocuments((current) => {
        const byId = new Map(current.map((document) => [document.id, document]))
        for (const document of uploaded) byId.set(document.id, document)
        return [...byId.values()].slice(0, maxUploadedDocuments)
      })
    }
    if (failed) {
      setComposerError(failed.reason instanceof Error ? failed.reason.message : t("Dexter could not upload that document."))
    }
    setIsUploadingDocument(false)
  }

  /**
   * Watch mode has its own composer and its own rail, both of which live in the
   * workspace. Home opens it there rather than half-supporting it here.
   */
  function openWatchMode() {
    setValue("")
    navigate("/agent-dexter")
  }

  function handleChange(next: string) {
    if (next.trim().toLowerCase() === "/watch") {
      openWatchMode()
      return
    }
    setValue(next)
  }

  return (
    <div className={cn("mx-auto flex w-full flex-col", className)}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.csv,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ""
          if (files.length) void handleDocumentUpload(files)
        }}
      />

      <AnimatePresence initial={false}>
        {docked ? null : (
          <motion.div
            key="home-greeting"
            className="mx-auto mb-[var(--md-page-section-gap)] max-w-[46ch] text-center"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={reduceMotion(shouldReduceMotion, mdMotion.panel)}
          >
            <div className="flex items-center justify-center gap-3">
              <DexterBrandMark className="size-6 shrink-0" />
              <h1
                className="text-[24px] font-medium leading-tight tracking-[-0.01em] text-[var(--md-ink)] sm:text-[30px]"
                style={{ textWrap: "balance" }}
              >
                {greeting}
              </h1>
            </div>
            {standfirst ? (
              <p className="mt-4 text-[15px] leading-[1.5] text-[var(--md-text)]" style={{ textWrap: "pretty" }}>
                {standfirst}
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The composer is the one object that survives the whole journey. It
          travels from the middle of Home to the foot of the conversation, and
          Motion animates that layout change rather than fading a second copy in
          somewhere else. */}
      <motion.div
        layout={!shouldReduceMotion}
        layoutDependency={docked}
        className="relative z-30"
        // A tween rather than a spring: the handover is timed against this
        // travel, so it has to finish when it says it will.
        transition={{ duration: dockTravelMs / 1000, ease: mdEaseOut }}
        style={{ willChange: "transform" }}
        onLayoutAnimationComplete={openWorkspace}
        onFocusCapture={prepareWorkspace}
        onPointerDownCapture={prepareWorkspace}
      >
        <DexterPromptComposer
          value={value}
          specialists={defaultDexterSpecialists}
          selectedSpecialistId={selectedSpecialistId}
          selectedModelId={selectedModelId}
          accessMode={accessMode}
          pendingAccessMode={pendingAccessMode}
          contextUsedTokens={contextUsedTokens}
          contextMaxTokens={contextWindowTokens}
          attachments={attachments}
          commands={slashCommands}
          mentionItems={mentionItems}
          selectedMentions={mentions}
          onChange={handleChange}
          onMentionsChange={setMentions}
          onUnavailableMention={(mention) => {
            if (mention.unavailableRoute) navigate(mention.unavailableRoute)
          }}
          onOpenAttachments={() => {
            setComposerError(null)
            fileInputRef.current?.click()
          }}
          attachmentActionLabel="Upload files"
          onSelectSpecialist={setSelectedSpecialistId}
          onSelectModel={setSelectedModelId}
          onAccessModeChange={(mode) => void handleAccessModeChange(mode)}
          isAccessModeChanging={isAccessModeChanging}
          onCommand={(command) => {
            if (command.id === "mode:watch") openWatchMode()
          }}
          onRemoveAttachment={(id) => setUploadedDocuments((current) => current.filter((document) => document.id !== id))}
          onSend={(prompt) => handOver(prompt ?? value)}
          isSending={isHandingOver || isUploadingDocument}
        />
      </motion.div>

      <AnimatePresence initial={false}>
        {docked || !suggestions.length ? null : (
          <motion.div
            key="home-prompt-rail"
            className="mt-[var(--md-gap-xl)]"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
            transition={reduceMotion(shouldReduceMotion, mdMotion.panel)}
          >
            <HomePromptRail
              suggestions={suggestions}
              onPick={(prompt, specialistId) => {
                setSelectedSpecialistId(specialistId)
                handOver(prompt, specialistId)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {composerError ? (
          <motion.p
            key="home-composer-error"
            role="alert"
            className="mt-3 text-center text-[12.5px] leading-[1.45] text-[var(--md-red)]"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion(shouldReduceMotion, mdMotion.panel)}
          >
            {composerError}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
