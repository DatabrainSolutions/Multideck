import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import {
  MessageScroller,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@shadcn/react/message-scroller"
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Mail,
  MessageSquareText,
  Radar,
  RefreshCw,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  DexterAttachmentPalette,
  DexterMentionText,
  DexterWatchRail,
  DexterPromptComposer,
  DexterSuggestionGrid,
  defaultDexterAttachments,
  defaultDexterSpecialists,
  type DexterAttachment,
  type DexterAccessMode,
  type DexterMentionItem,
  type DexterMonitor,
  type DexterSlashCommand,
  type DexterSpecialistId,
} from "@/components/multideck/agent-dexter-components"
import {
  DexterActionApproval,
  type DexterActionDecision,
} from "@/components/multideck/dexter-action-approval"
import { defaultDexterModelId, type DexterModelId } from "@/data/dexter-models"
import {
  customsDeclarationMentionItems,
  customerMentionItems,
  dealMentionItems,
  defaultDexterMentionItems,
  emailMentionItems,
  leadMentionItems,
  mergeDexterMentionItems,
} from "@/data/dexter-mentions"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import { DexterEmailAttachmentCard } from "@/components/multideck/dexter-email-attachment-card"
import { DexterEmailComposeCard } from "@/components/multideck/dexter-email-compose-card"
import { WatchModeAurora } from "@/components/multideck/aurora-background"
import { DexterInlineCitation, isDexterCitationUrl } from "@/components/multideck/dexter-inline-citation"
import { ProgressiveBlur } from "@/components/multideck/progressive-blur"
import { StatusPill } from "@/components/multideck/status-pill"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useLanguage } from "@/i18n/language-provider"
import {
  createDexterWatch,
  deleteDexterWatch,
  getDexterConversation,
  listDexterWatches,
  setDexterAccessMode,
  setDexterWatchStatus,
  sendDexterMessage,
  streamDexterMessage,
  uploadDexterDocument,
  type DexterUploadedDocument,
  type DexterConversation,
  type DexterEmailAttachment,
  type DexterEmailDraft,
  type DexterWatchEmailContext,
  type DexterMessage,
  type DexterPendingAction,
  type SendDexterMessageInput,
  type DexterWatch,
} from "@/lib/dexter-api"
import { supabase } from "@/lib/supabase"
import { takeGeneratedDocumentForDexter } from "@/lib/generated-document-handoff"
import {
  conversationBranchFor,
  responseGroupsFor,
} from "@/lib/dexter-conversation-branches"
import {
  announceDexterConversationsChanged,
  DEXTER_CONVERSATIONS_CHANGED_EVENT,
  DEXTER_NEW_CONVERSATION_EVENT,
  DEXTER_SELECT_CONVERSATION_EVENT,
  readDexterConversationIdFromLocation,
  rememberOpenDexterConversation,
  shouldReuseDexterConversation,
  takeDexterConversationHandoff,
  takeDexterTaskHandoff,
  type DexterConversationsChangedDetail,
} from "@/lib/dexter-navigation"
import { listCustomers } from "@/lib/customer-api"
import { listStandaloneExportDrafts } from "@/lib/customs-drafts-api"
import { listLeads } from "@/lib/lead-api"
import { listDeals, type ApiDeal } from "@/lib/deal-api"
import { listDexterEmailContextSources } from "@/lib/inbox-api"
import { readRecentWorkContext } from "@/lib/recent-work-context"
import type { AuthUserSummary } from "@/lib/auth-user"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { readableWatchEvent, readableWatchSummary } from "@/lib/dexter-watch-copy"

const DEXTER_CONTEXT_WINDOW_TOKENS = 128_000
const DEXTER_JUMP_TO_LATEST_DISTANCE = 180
const MotionMessageScrollerViewport = motion.create(MessageScroller.Viewport)

function estimateContextTokens(
  messages: DexterMessage[],
  draft: string,
  attachments: Array<Pick<DexterAttachment, "title" | "meta">>,
) {
  const messageCharacters = messages.reduce(
    (total, message) => total + Array.from(message.content).length,
    0,
  )
  const attachmentCharacters = attachments.reduce(
    (total, attachment) => total + Array.from(`${attachment.title} ${attachment.meta}`).length,
    0,
  )
  const draftCharacters = Array.from(draft).length
  const messageOverhead = messages.length * 4

  return Math.ceil((messageCharacters + attachmentCharacters + draftCharacters) / 4) + messageOverhead
}

function specialistById(id: DexterSpecialistId) {
  return defaultDexterSpecialists.find((specialist) => specialist.id === id) ?? defaultDexterSpecialists[0]
}

function isDexterSpecialistId(value: string | null | undefined): value is DexterSpecialistId {
  return value === "auto" ||
    value === "customs" ||
    value === "customer" ||
    value === "sales" ||
    value === "ops" ||
    value === "analytics"
}

function dexterMessageServerId(message: DexterMessage) {
  return message.serverId ?? message.id
}

const DEXTER_PERSISTED_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function persistedDexterMessageId(message: DexterMessage) {
  const messageId = dexterMessageServerId(message)
  return DEXTER_PERSISTED_MESSAGE_ID.test(messageId) ? messageId : null
}

function persistedDexterMessageIds(messages: DexterMessage[]) {
  return messages.flatMap((message) => {
    const messageId = persistedDexterMessageId(message)
    return messageId ? [messageId] : []
  })
}

function latestPersistedAssistantMessage(messages: DexterMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && persistedDexterMessageId(message))
}

type DexterComposerDraftSnapshot = {
  value: string
  mentions: DexterMentionItem[]
  attachmentIds: Set<string>
  emailAttachments: DexterEmailAttachment[]
  emailUpdates: DexterWatchEmailContext[]
  uploadedDocuments: DexterUploadedDocument[]
}

type FailedDexterPrompt = {
  input: SendDexterMessageInput
  previousConversation: DexterConversation | null
  pendingMessage: DexterMessage
  assistantMessageId: string
  draft: DexterComposerDraftSnapshot
}

function appendEmailAttachment(
  message: DexterMessage,
  attachment: DexterEmailAttachment,
): DexterMessage {
  const current = message.emailAttachments ?? []
  if (current.some((item) => item.id === attachment.id)) return message
  return { ...message, emailAttachments: [...current, attachment] }
}

function trailMessagesFor(messages: DexterMessage[]) {
  return messages.filter((message) => message.role === "user")
}

function useAttachedItems(selectedAttachmentIds: Set<string>) {
  return useMemo(
    () => defaultDexterAttachments.filter((attachment) => selectedAttachmentIds.has(attachment.id)),
    [selectedAttachmentIds],
  )
}

/** An action that keeps its label folded away until the pointer arrives. */
function HeaderAction({
  icon: Icon,
  label,
  onClick,
  expanded,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      className="md-dexter-header-action text-[12.5px] font-medium"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="md-dexter-header-action__label" aria-hidden="true">
        {label}
      </span>
    </button>
  )
}

/**
 * Name and role, and nothing else — no bar, no border, no status chip. The band
 * behind it is the caller's progressive blur veil, so a reply scrolling past
 * loses its contrast and dissolves under the title rather than running into a
 * hard edge.
 *
 * The title crossfades on a blur rather than being replaced, because switching
 * conversations already moves the whole column and a snapping headline is the
 * one thing that would make that read as a page load.
 */
function DexterConversationHeader({
  title,
  isWorking,
  selectedSpecialistId,
  watchersOpen,
  onToggleWatchers,
}: {
  title: string
  isWorking: boolean
  selectedSpecialistId: DexterSpecialistId
  watchersOpen: boolean
  onToggleWatchers?: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const specialist = specialistById(selectedSpecialistId)
  const RoleIcon = specialist.icon

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 px-[var(--md-page-stack-gap)] pt-[18px]">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {isWorking ? (
              <motion.span
                key="dexter-live"
                aria-hidden="true"
                className="md-dexter-live-dot shrink-0"
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.4, width: 0 }}
                animate={{ opacity: 1, scale: 1, width: 6 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.4, width: 0 }}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
              />
            ) : null}
          </AnimatePresence>
          <span className="relative inline-grid min-w-0 flex-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.h1
                key={title}
                className="min-w-0 truncate text-[15px] font-medium leading-6 text-[var(--md-ink)]"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 5, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -5, filter: "blur(4px)" }}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter)}
              >
                {title}
              </motion.h1>
            </AnimatePresence>
          </span>
        </div>
        <p className="mt-px flex min-w-0 items-center gap-1.5 text-[12px] leading-5 text-[var(--md-subtle)]">
          <RoleIcon className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t(specialist.name)}</span>
          <span className="sr-only">{isWorking ? t("Working") : t("Ready")}</span>
        </p>
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center gap-0.5">
        <HeaderAction
          icon={Radar}
          label={t("Watchers")}
          onClick={onToggleWatchers}
          expanded={watchersOpen}
        />
      </div>
    </div>
  )
}

function DexterReasoningDisclosure({
  content,
  isStreaming,
}: {
  content: string
  isStreaming: boolean
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const hasReasoning = content.trim().length > 0
  if (!isStreaming && !hasReasoning) return null

  return (
    <div className="max-w-[680px]">
      <AnimatePresence initial={false}>
        {isStreaming ? (
          <motion.div
            key="thinking"
            className="flex min-h-8 items-center py-1 text-[12.5px] font-medium text-[var(--md-text)]"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
            role="status"
            aria-live="polite"
          >
            {shouldReduceMotion ? (
              <span>{t("Thinking")}</span>
            ) : (
              <Shimmer duration={1.2} spread={2}>{t("Thinking")}</Shimmer>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasReasoning ? (
          <motion.div
            key="reasoning"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -3 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter)}
          >
            <Reasoning
              defaultOpen={isStreaming}
              isStreaming={isStreaming}
              className="mb-0 py-1 data-[state=open]:pb-6"
              data-reasoning-state={isStreaming ? "streaming" : "complete"}
            >
              <ReasoningTrigger
                className="min-h-8 text-[12.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]"
                getThinkingMessage={() => (
                  <span>{isStreaming ? t("Reasoning") : t("Reasoning summary")}</span>
                )}
              />
              <ReasoningContent className="mt-3 text-[13px] leading-5 text-[var(--md-text)]">
                {content}
              </ReasoningContent>
            </Reasoning>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function normaliseDexterMarkdown(content: string) {
  const lines = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const standaloneBold = line.trim().match(/^\*\*([^*]+)\*\*$/)
      return standaloneBold ? `## ${standaloneBold[1].trim()}` : line
    })

  const contentIndexes = lines.flatMap((line, index) => line.trim() ? [index] : [])
  const firstContentIndex = contentIndexes[0]
  const firstLine = firstContentIndex === undefined ? "" : lines[firstContentIndex].trim()
  const hasExplicitTitle = lines.some((line) => /^#\s+/.test(line.trim()))
  const looksLikePlainTitle =
    contentIndexes.length >= 3 &&
    firstLine.length > 0 &&
    firstLine.length <= 72 &&
    firstLine.split(/\s+/).length <= 9 &&
    !/^(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s|```)/.test(firstLine) &&
    !/[.!?:;,]$/.test(firstLine)

  if (!hasExplicitTitle && looksLikePlainTitle && firstContentIndex !== undefined) {
    lines[firstContentIndex] = `# ${firstLine}`
  }

  const labelValuePattern = /^([\p{L}\p{N}][\p{L}\p{N}\s/&()_-]{0,48}):\s+(.+)$/u
  const output: string[] = []

  for (let index = 0; index < lines.length;) {
    const current = lines[index].trim()
    const nextLine = lines[index + 1]?.trim() ?? ""
    const plainRunIsQuoted = /^[“"'‘]/.test(nextLine)
    let plainRunEnd = index + 1

    while (plainRunEnd < lines.length) {
      const candidate = lines[plainRunEnd].trim()
      const isQuoted = /^[“"'‘]/.test(candidate)
      const isMarkdown = /^(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s|```)/.test(candidate)

      if (
        !candidate ||
        isMarkdown ||
        candidate.endsWith(":") ||
        labelValuePattern.test(candidate) ||
        isQuoted !== plainRunIsQuoted
      ) {
        break
      }
      plainRunEnd += 1
    }

    const plainRunLength = plainRunEnd - (index + 1)
    const introducesPlainList =
      current.endsWith(":") &&
      !labelValuePattern.test(current) &&
      plainRunLength >= 3

    if (introducesPlainList) {
      if (output.at(-1)?.trim()) output.push("")
      if (current.length <= 48) {
        output.push(`## ${current.slice(0, -1).trim()}`, "")
      } else {
        output.push(lines[index], "")
      }
      for (let itemIndex = index + 1; itemIndex < plainRunEnd; itemIndex += 1) {
        output.push(`- ${lines[itemIndex].trim()}`)
      }
      output.push("")
      index = plainRunEnd
      continue
    }

    let labelledRunEnd = index

    while (labelledRunEnd < lines.length && labelValuePattern.test(lines[labelledRunEnd].trim())) {
      labelledRunEnd += 1
    }

    if (labelledRunEnd - index >= 2) {
      if (output.at(-1)?.trim()) output.push("")
      for (let labelledIndex = index; labelledIndex < labelledRunEnd; labelledIndex += 1) {
        const match = lines[labelledIndex].trim().match(labelValuePattern)
        if (match) output.push(`- **${match[1].trim()}:** ${match[2].trim()}`)
      }
      output.push("")
      index = labelledRunEnd
      continue
    }

    const nextRunLength = (() => {
      let end = index + 1
      while (end < lines.length && labelValuePattern.test(lines[end].trim())) end += 1
      return end - (index + 1)
    })()
    const looksLikeSectionLabel =
      current.endsWith(":") &&
      current.length <= 64 &&
      !/^(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s)/.test(current) &&
      nextRunLength >= 2

    if (looksLikeSectionLabel) {
      if (output.at(-1)?.trim()) output.push("")
      output.push(`## ${current.slice(0, -1).trim()}`, "")
    } else {
      output.push(lines[index])
    }
    index += 1
  }

  const blockStartPattern = /^(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s|```|~~~|\|)/
  const thematicBreakPattern = /^(?:-{3,}|_{3,}|\*{3,})$/
  const spacedOutput: string[] = []
  let inCodeFence = false

  output.forEach((line, index) => {
    const trimmed = line.trim()
    const next = output[index + 1]?.trim() ?? ""
    const startsFence = /^(?:```|~~~)/.test(trimmed)

    spacedOutput.push(line)

    if (startsFence) {
      inCodeFence = !inCodeFence
      return
    }
    if (inCodeFence || !trimmed || !next) return

    const isPlainLine =
      !blockStartPattern.test(trimmed) &&
      !thematicBreakPattern.test(trimmed)
    const nextIsPlainLine =
      !blockStartPattern.test(next) &&
      !thematicBreakPattern.test(next)

    if (isPlainLine && nextIsPlainLine) {
      spacedOutput.push("")
    }
  })

  return spacedOutput
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type DexterMarkdownAstNode = {
  tagName?: string
  value?: string
  children?: DexterMarkdownAstNode[]
}

function readDexterMarkdownText(node: DexterMarkdownAstNode | undefined): string {
  if (!node) return ""
  if (typeof node.value === "string") return node.value
  return (node.children ?? []).map((child) => readDexterMarkdownText(child)).join("").trim()
}

function readDexterTableCells(row: DexterMarkdownAstNode | undefined) {
  return (row?.children ?? [])
    .filter((child) => child.tagName === "th" || child.tagName === "td")
    .map((cell) => readDexterMarkdownText(cell))
}

function isDexterNumericColumn(header: string, values: string[]) {
  const numericHeader = /\b(amount|cost|margin|price|probability|qty|quantity|rate|revenue|total|units?|value|volume|weight)\b/i
  const numericValue = /^\s*(?:[£€$¥]\s*)?[-+]?\d[\d,.]*(?:\s*%)?\s*$/
  return numericHeader.test(header) || (values.length > 0 && values.every((value) => !value || numericValue.test(value)))
}

function findDexterTableColumn(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header.trim())))
}

const dexterLeadColumnPatterns = {
  lead: [/\blead\b/i, /\bcompany\b/i, /unternehmen|firma/i, /entreprise|prospect/i, /الشركة|العميل المحتمل/],
  route: [/\broute\b/i, /\blane\b/i, /strecke/i, /itinéraire|trajet/i, /المسار/],
  status: [/\bstatus\b/i, /\bstage\b/i, /phase/i, /statut|étape/i, /الحالة|المرحلة/],
  service: [/\bservice\b/i, /dienstleistung/i, /الخدمة/],
  value: [/\bvalue\b/i, /\bamount\b/i, /wert|betrag/i, /valeur|montant/i, /القيمة|المبلغ/],
  action: [
    /\bnext action\b/i,
    /\bfollow-up\b/i,
    /nächste.*aktion|nachverfolg/i,
    /prochaine.*action|suivi/i,
    /الإجراء التالي|المتابعة/,
  ],
}

function DexterTableValue({
  kind,
  value,
}: {
  kind: "text" | "status" | "action"
  value: string
}) {
  if (!value) return <bdi>—</bdi>
  if (kind === "status") {
    return (
      <StatusPill tone="neutral" className="max-w-full">
        <bdi className="truncate">{value}</bdi>
      </StatusPill>
    )
  }
  return <bdi>{value}</bdi>
}

function DexterMarkdownTable({
  children,
  node,
}: {
  children: ReactNode
  node?: DexterMarkdownAstNode
}) {
  const head = (node?.children ?? []).find((child) => child.tagName === "thead")
  const body = (node?.children ?? []).find((child) => child.tagName === "tbody")
  const headerRow = (head?.children ?? []).find((child) => child.tagName === "tr")
  const headers = readDexterTableCells(headerRow)
  const rows = (body?.children ?? [])
    .filter((child) => child.tagName === "tr")
    .map((row) => readDexterTableCells(row))
    .filter((row) => row.some(Boolean))

  if (!headers.length || !rows.length) {
    return (
      <div className="md-dexter-markdown__table-wrap my-4 w-full max-w-[1120px] overflow-hidden rounded-[var(--md-radius-lg)]">
        <div className="md-dexter-markdown__table-scroll md-scrollbar">
          <table className="md-dexter-markdown__table">{children}</table>
        </div>
      </div>
    )
  }

  const leadColumnIndexes = Object.fromEntries(
    Object.entries(dexterLeadColumnPatterns)
      .map(([key, patterns]) => [key, findDexterTableColumn(headers, patterns)]),
  ) as Record<keyof typeof dexterLeadColumnPatterns, number>
  const isLeadTable = Object.values(leadColumnIndexes).every((index) => index >= 0)
  const columns = headers.map((header, index) => ({
    header,
    numeric: isDexterNumericColumn(header, rows.map((row) => row[index] ?? "")),
    kind: isLeadTable && index === leadColumnIndexes.status
      ? "status" as const
      : isLeadTable && index === leadColumnIndexes.action
        ? "action" as const
        : "text" as const,
  }))
  const isDense = columns.length >= 6
  const hasVerboseCells = rows.some((row) => row.some((value) => value.length > 56))

  return (
    <div
      className={cn(
        "md-dexter-markdown__table-wrap my-4 w-full max-w-[1120px] overflow-hidden rounded-[var(--md-radius-lg)]",
        isDense && "md-dexter-markdown__table-wrap--dense",
        isLeadTable && "md-dexter-markdown__table-wrap--leads",
        hasVerboseCells && "md-dexter-markdown__table-wrap--verbose",
      )}
    >
      <div className="md-dexter-markdown__table-scroll md-scrollbar">
        <table className="md-dexter-markdown__table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={`${column.header}-${index}`}
                  scope="col"
                  data-align={column.numeric ? "numeric" : undefined}
                  className={cn(
                    "bg-[var(--md-surface-soft)] px-3 py-2.5 text-start align-middle text-[11.75px] font-medium leading-[1.3] whitespace-nowrap text-[var(--md-subtle)]",
                    "border-b border-[var(--md-line-strong)]",
                    index > 0 && "border-s border-s-[var(--md-line)]",
                    column.numeric && "min-w-28 text-end",
                    index === columns.length - 1 && "min-w-[142px]",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${row[0] || "row"}-${rowIndex}`}>
                {columns.map((column, columnIndex) => {
                  const value = row[columnIndex] ?? ""
                  return (
                    <td
                      key={`${column.header}-${columnIndex}`}
                      data-align={column.numeric ? "numeric" : undefined}
                      data-kind={column.kind}
                      data-overdue={column.kind === "action" && /\boverdue\b/i.test(value) ? "true" : undefined}
                      title={value.length > 48 ? value : undefined}
                      className={cn(
                        "px-3 py-2.5 text-start align-middle text-[13px] leading-[1.48] text-[var(--md-ink)]",
                        rowIndex < rows.length - 1 && "border-b border-[var(--md-line-strong)]",
                        columnIndex > 0 && "border-s border-s-[var(--md-line)]",
                        columnIndex === 0 && "font-semibold",
                        column.numeric && "min-w-28 text-end whitespace-nowrap tabular-nums",
                        columnIndex === columns.length - 1 && "min-w-[142px]",
                      )}
                    >
                      <DexterTableValue kind={column.kind} value={value} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md-dexter-markdown__records" role="list">
        {rows.map((row, rowIndex) => (
          <div
            key={`${row[0] || "record"}-${rowIndex}`}
            className="md-dexter-markdown__record"
            role="listitem"
            aria-label={`${headers[0]}: ${row[0] || "—"}`}
          >
            <div className="md-dexter-markdown__record-primary">
              <span>{headers[0]}</span>
              <strong><bdi>{row[0] || "—"}</bdi></strong>
            </div>
            <dl>
              {columns.slice(1).map((column, columnIndex) => {
                const value = row[columnIndex + 1] ?? ""
                return (
                  <div
                    key={`${column.header}-${columnIndex}`}
                    data-align={column.numeric ? "numeric" : undefined}
                    data-kind={column.kind}
                    data-overdue={column.kind === "action" && /\boverdue\b/i.test(value) ? "true" : undefined}
                  >
                    <dt>{column.header}</dt>
                    <dd><DexterTableValue kind={column.kind} value={value} /></dd>
                  </div>
                )
              })}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

function DexterMarkdown({
  content,
  isStreaming,
}: {
  content: string
  isStreaming: boolean
}) {
  return (
    <article
      className={cn("md-dexter-markdown w-full min-w-0", isStreaming && "md-dexter-markdown--streaming")}
      aria-live={isStreaming ? "polite" : undefined}
      aria-atomic={isStreaming ? "false" : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 dir="auto" className="md-dexter-markdown__h1 mt-0 mb-4 max-w-[30ch] text-[clamp(24px,2vw,28px)] font-medium leading-[1.16] tracking-[-0.028em] text-[var(--md-ink)]">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 dir="auto" className="md-dexter-markdown__h2 mt-[1.9rem] mb-[0.68rem] text-[19px] font-medium leading-[1.3] tracking-[-0.018em] text-[var(--md-ink)]">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 dir="auto" className="md-dexter-markdown__h3 mt-6 mb-2 text-[16px] font-medium leading-[1.4] tracking-[-0.008em] text-[var(--md-ink)]">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h5 dir="auto" className="md-dexter-markdown__h4 mt-4 mb-1.5 text-[13px] font-medium leading-[1.45] text-[var(--md-text)]">
              {children}
            </h5>
          ),
          p: ({ children }) => (
            <p dir="auto" className="my-4 max-w-[68ch] whitespace-normal text-pretty first:mt-0 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul dir="auto" className="my-4 max-w-[70ch] list-disc space-y-2 ps-[1.35rem] first:mt-0 last:mb-0 marker:text-[var(--md-accent)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol dir="auto" className="my-4 max-w-[70ch] list-decimal space-y-2 ps-[1.35rem] first:mt-0 last:mb-0 marker:text-[var(--md-accent)]">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote dir="auto" className="my-5 max-w-[68ch] rounded-e-[var(--md-radius-md)] border-s-2 border-[var(--md-accent-a36)] bg-[var(--md-accent-a08)] px-4 py-3 text-[var(--md-text)] first:mt-0 last:mb-0">
              {children}
            </blockquote>
          ),
          a: ({ children, href, title }) => isDexterCitationUrl(href) ? (
            <DexterInlineCitation href={href} title={title ?? undefined}>
              {children}
            </DexterInlineCitation>
          ) : (
            <span>{children}</span>
          ),
          table: ({ children, node }) => (
            <DexterMarkdownTable node={node} children={children} />
          ),
        }}
      >
        {normaliseDexterMarkdown(content)}
      </ReactMarkdown>
    </article>
  )
}

function getDexterTrailPreview(content: string) {
  const normalised = content.replace(/\s+/g, " ").trim()
  const sentenceEnd = normalised.search(/[.!?](?:\s|$)/)
  const firstSentence = sentenceEnd >= 0
    ? normalised.slice(0, sentenceEnd + 1)
    : normalised
  const titleLimit = 52
  const titleWordBreak = firstSentence.lastIndexOf(" ", titleLimit)
  const titleBreak = firstSentence.length > titleLimit
    ? titleWordBreak > 0 ? titleWordBreak : titleLimit
    : firstSentence.length
  const title = `${firstSentence.slice(0, titleBreak).trim()}${titleBreak < firstSentence.length ? "…" : ""}`
  const body = sentenceEnd >= 0
    ? normalised.slice(sentenceEnd + 1).trim()
    : ""

  return {
    title: title || normalised,
    body,
  }
}

function DexterConversationTrail({
  messages,
  scrollMessages,
  bottomOffset = 40,
}: {
  messages: DexterMessage[]
  scrollMessages: DexterMessage[]
  bottomOffset?: number
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [previewOffset, setPreviewOffset] = useState<number | null>(null)
  const trailRef = useRef<HTMLElement>(null)
  const { scrollToMessage } = useMessageScroller()
  const { end: canScrollTowardsEnd } = useMessageScrollerScrollable()
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()
  const visibleMessageIdSet = useMemo(() => new Set(visibleMessageIds), [visibleMessageIds])
  const messageIdSet = useMemo(() => new Set(messages.map((message) => message.id)), [messages])
  const currentScrollMessageId = currentAnchorId ?? visibleMessageIds[0] ?? null
  const currentScrollMessageIndex = currentScrollMessageId
    ? scrollMessages.findIndex((message) => message.id === currentScrollMessageId)
    : -1
  const currentVisibleMessageId = currentScrollMessageIndex >= 0
    ? scrollMessages
        .slice(0, currentScrollMessageIndex + 1)
        .reverse()
        .find((message) => message.role === "user" && messageIdSet.has(message.id))?.id ?? null
    : null
  const highlightedMessageId = canScrollTowardsEnd
    ? currentVisibleMessageId
    : messages.at(-1)?.id ?? null
  const activeMessageId = hoveredMessageId ?? focusedMessageId
  const activeMessageIndex = activeMessageId
    ? messages.findIndex((message) => message.id === activeMessageId)
    : -1
  const activeMessage = activeMessageIndex >= 0 ? messages[activeMessageIndex] : null
  const activePreview = activeMessage ? getDexterTrailPreview(activeMessage.content) : null

  if (messages.length <= 5) return null

  function positionPreview(button: HTMLButtonElement) {
    const trail = trailRef.current
    if (!trail) return

    const trailBounds = trail.getBoundingClientRect()
    const buttonBounds = button.getBoundingClientRect()
    const buttonCentre = buttonBounds.top - trailBounds.top + buttonBounds.height / 2
    const cardClearance = Math.min(84, trailBounds.height / 2)
    setPreviewOffset(Math.min(
      trailBounds.height - cardClearance,
      Math.max(cardClearance, buttonCentre),
    ))
  }

  return (
    <nav
      ref={trailRef}
      aria-label={t("Conversation trail")}
      className="pointer-events-none absolute start-2 top-[88px] z-[32] hidden w-16 md:block"
      style={{ bottom: bottomOffset }}
      onPointerLeave={() => setHoveredMessageId(null)}
    >
      <div className="pointer-events-auto flex h-full flex-col justify-center gap-[3px] overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.map((message, index) => {
          const isCurrent = highlightedMessageId === message.id
          const isVisible = visibleMessageIdSet.has(message.id)
          const interactionDistance = activeMessageIndex >= 0
            ? Math.abs(index - activeMessageIndex)
            : null
          const label = `${t("Jump to message")} ${index + 1}`
          const waveScale = interactionDistance === 0
            ? 1
            : interactionDistance === 1
              ? 0.72
              : interactionDistance === 2
                ? 0.5
                : interactionDistance === 3
                  ? 0.34
                  : 0.2
          const targetScale = interactionDistance === null ? 0.2 : waveScale
          const targetEndCapOffset = 38 * targetScale - 2
          const targetOpacity = interactionDistance === 0
            ? 0.94
            : interactionDistance === 1
              ? 0.76
              : interactionDistance === 2
                ? 0.56
                : interactionDistance === 3
                  ? 0.4
                  : isVisible
                    ? 0.5
                    : 0.26
          const waveDepth = Math.min(interactionDistance ?? 0, 3)

          return (
            <motion.button
              key={message.id}
              type="button"
              aria-label={label}
              aria-current={isCurrent ? "location" : undefined}
              className="flex h-4 w-16 shrink-0 items-center justify-start rounded-[var(--md-radius-sm)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)]"
              onPointerEnter={(event) => {
                setHoveredMessageId(message.id)
                positionPreview(event.currentTarget)
              }}
              onFocus={(event) => {
                setFocusedMessageId(message.id)
                positionPreview(event.currentTarget)
              }}
              onBlur={() => setFocusedMessageId(null)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
              onClick={() => scrollToMessage(message.id, {
                align: "start",
                behavior: shouldReduceMotion ? "auto" : "smooth",
              })}
            >
              <motion.span
                aria-hidden="true"
                className={cn(
                  "relative block h-0.5 w-[38px] text-[var(--md-ink)]",
                )}
                initial={false}
                animate={{ opacity: targetOpacity }}
                transition={shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.12 }}
              >
                <motion.span
                  className="absolute inset-y-0 start-0 w-full rounded-full bg-current"
                  initial={false}
                  animate={{ scaleX: targetScale }}
                  style={{
                    transformOrigin: direction === "rtl" ? "right center" : "left center",
                  }}
                  transition={shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: interactionDistance === null ? 460 : 560 - waveDepth * 56,
                        damping: 32,
                        mass: 0.52 + waveDepth * 0.06,
                      }}
                />
                <span className="absolute start-0 top-0 size-0.5 rounded-full bg-current" />
                <motion.span
                  className="absolute start-0 top-0 size-0.5 rounded-full bg-current"
                  initial={false}
                  animate={{
                    x: direction === "rtl" ? -targetEndCapOffset : targetEndCapOffset,
                  }}
                  transition={shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: interactionDistance === null ? 460 : 560 - waveDepth * 56,
                        damping: 32,
                        mass: 0.52 + waveDepth * 0.06,
                    }}
                />
                {isCurrent ? (
                  <motion.span
                    layout
                    layoutId={shouldReduceMotion ? undefined : "dexter-conversation-trail-current"}
                    className="pointer-events-none absolute inset-0 text-[var(--md-accent)]"
                    style={{ filter: "drop-shadow(0 0 3px var(--md-accent-a42))" }}
                    transition={shouldReduceMotion
                      ? { duration: 0 }
                      : {
                          layout: {
                            type: "spring",
                            stiffness: 520,
                            damping: 42,
                            mass: 0.65,
                          },
                        }}
                  >
                    <motion.span
                      className="absolute inset-y-0 start-0 w-full rounded-full bg-current"
                      initial={false}
                      animate={{ scaleX: targetScale }}
                      style={{
                        transformOrigin: direction === "rtl" ? "right center" : "left center",
                      }}
                      transition={shouldReduceMotion
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: interactionDistance === null ? 460 : 560 - waveDepth * 56,
                            damping: 32,
                            mass: 0.52 + waveDepth * 0.06,
                          }}
                    />
                    <span className="absolute start-0 top-0 size-0.5 rounded-full bg-current" />
                    <motion.span
                      className="absolute start-0 top-0 size-0.5 rounded-full bg-current"
                      initial={false}
                      animate={{
                        x: direction === "rtl" ? -targetEndCapOffset : targetEndCapOffset,
                      }}
                      transition={shouldReduceMotion
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: interactionDistance === null ? 460 : 560 - waveDepth * 56,
                            damping: 32,
                            mass: 0.52 + waveDepth * 0.06,
                          }}
                    />
                  </motion.span>
                ) : null}
              </motion.span>
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {activeMessage && activePreview && previewOffset !== null ? (
          <motion.aside
            className="absolute start-[58px] w-[min(320px,calc(100vw-104px))] -translate-y-1/2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-lift)]"
            initial={shouldReduceMotion ? { opacity: 0 } : {
              opacity: 0,
              scale: 0.97,
              x: direction === "rtl" ? 8 : -8,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              top: previewOffset,
              x: 0,
            }}
            exit={shouldReduceMotion ? { opacity: 0 } : {
              opacity: 0,
              scale: 0.98,
              x: direction === "rtl" ? 5 : -5,
            }}
            transition={shouldReduceMotion
              ? { duration: 0.08 }
              : {
                  opacity: { duration: 0.14 },
                  scale: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                  top: { type: "spring", stiffness: 430, damping: 34, mass: 0.7 },
                  x: { type: "spring", stiffness: 440, damping: 32, mass: 0.6 },
                }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={activeMessage.id}
                initial={shouldReduceMotion ? false : { opacity: 0, x: direction === "rtl" ? 4 : -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, x: direction === "rtl" ? -3 : 3 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
              >
                <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">
                  {activeMessage.role === "user" ? t("You") : "Dexter"} · {activeMessageIndex + 1}/{messages.length}
                </p>
                <p className="mt-1.5 line-clamp-2 text-[14px] font-medium leading-5 text-[var(--md-ink)]">
                  {activePreview.title}
                </p>
                {activePreview.body ? (
                  <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-[var(--md-text)]">
                    {activePreview.body}
                  </p>
                ) : null}
                <p className="mt-3 text-[11.5px] text-[var(--md-subtle)]">{t("Select to jump")}</p>
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </nav>
  )
}

function ConversationStream({
  messages,
  isWorking,
  streamingMessageId,
  reasoningContent,
  mentionItems,
  currentUser,
  profilePhotoUrl,
  selectedResponseMessageIds,
  retryingMessageId,
  error,
  pendingActionDecision,
  actionDecisionError,
  onActionDecision,
  onRetryMessage,
  onRetryError,
  onDismissError,
  onSelectResponse,
  onEmailDraftChange,
}: {
  messages: DexterMessage[]
  isWorking: boolean
  streamingMessageId: string | null
  reasoningContent: string
  mentionItems: DexterMentionItem[]
  currentUser: AuthUserSummary | null
  profilePhotoUrl: string | null
  selectedResponseMessageIds: Record<string, string>
  retryingMessageId: string | null
  error: string | null
  pendingActionDecision: { actionId: string; decision: DexterActionDecision } | null
  actionDecisionError: { actionId: string; message: string } | null
  onActionDecision: (action: DexterPendingAction, decision: DexterActionDecision) => void
  onRetryMessage?: (message: DexterMessage) => void
  onRetryError?: () => void
  onDismissError: () => void
  onSelectResponse: (userMessageId: string, assistantMessageId: string) => void
  onEmailDraftChange: (messageId: string, draft: DexterEmailDraft) => void
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [copyErrorMessageId, setCopyErrorMessageId] = useState<string | null>(null)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const userMessageOffset = direction === "rtl" ? -14 : 14
  const messageTransition = reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter)
  const { responsesByUserId, pairedAssistantIds } = useMemo(
    () => responseGroupsFor(messages),
    [messages],
  )
  const visibleMessages = useMemo(
    () => conversationBranchFor(messages, selectedResponseMessageIds),
    [messages, selectedResponseMessageIds],
  )
  const latestMessageId = visibleMessages.at(-1)?.id
  const firstName = useMemo(() => {
    const displayName = currentUser?.name?.trim()
    if (displayName) return displayName.split(/\s+/)[0]
    const emailName = currentUser?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim()
    if (emailName) return emailName.split(/\s+/)[0]
    return t("You")
  }, [currentUser?.email, currentUser?.name, t])
  const roleSwitchesByMessage = useMemo(() => {
    const markers = new Map<string, DexterSpecialistId>()
    let previousSpecialist: DexterSpecialistId | null = null

    visibleMessages.forEach((message) => {
      if (message.role !== "user" || !isDexterSpecialistId(message.specialist)) return
      if (previousSpecialist && message.specialist !== previousSpecialist) {
        markers.set(message.id, message.specialist)
      }
      previousSpecialist = message.specialist
    })

    return markers
  }, [visibleMessages])

  useEffect(() => () => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current)
    }
  }, [])

  async function copyMessage(message: DexterMessage) {
    setCopyErrorMessageId(null)
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current))
        copyResetTimeoutRef.current = null
      }, 1_800)
    } catch {
      setCopiedMessageId(null)
      setCopyErrorMessageId(message.id)
    }
  }

  function assistantMessageView(message: DexterMessage) {
    const isStreamingMessage = message.id === streamingMessageId
    const reasoning = isStreamingMessage
      ? reasoningContent || message.reasoningSummary || ""
      : message.reasoningSummary || ""
    const isAwaitingFirstResponse = isStreamingMessage &&
      !reasoning.trim() &&
      !message.content.trim() &&
      !(message.emailAttachments?.length) &&
      !message.pendingAction

    return (
      <motion.div
        key={message.id}
        layout="position"
        className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, y: -3, filter: "blur(3px)" }}
        transition={messageTransition}
      >
        <DexterBrandMark className="mt-1" />
        <div className="min-w-0">
          <DexterReasoningDisclosure
            content={reasoning}
            isStreaming={isStreamingMessage}
          />
          <AnimatePresence initial={false} mode="popLayout">
            {isAwaitingFirstResponse ? (
              <motion.div
                key="dexter-preparing-response"
                className="py-1.5"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 5, filter: "blur(5px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: "blur(4px)" }}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                role="status"
                aria-live="polite"
              >
                <p className="text-[12px] text-[var(--md-subtle)]">
                  {t("Dexter is checking your connected workspace data...")}
                </p>
                <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
                  {[0, 1, 2].map((index) => (
                    <motion.span
                      key={index}
                      className="size-1.5 rounded-full bg-[var(--md-accent)]"
                      animate={shouldReduceMotion ? { opacity: 0.55 } : { opacity: [0.25, 1, 0.25] }}
                      transition={shouldReduceMotion ? { duration: 0 } : {
                        duration: 1.1,
                        repeat: Infinity,
                        delay: index * 0.13,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {message.content.trim() ? (
            <DexterMarkdown
              content={message.content}
              isStreaming={isStreamingMessage}
            />
          ) : null}
          {message.emailAttachments?.length ? (
            <div className="mt-3 grid gap-2" aria-label={t("Email attachments")}>
              {message.emailAttachments.map((attachment) => (
                <DexterEmailAttachmentCard key={attachment.id} attachment={attachment} />
              ))}
            </div>
          ) : null}
          {message.emailDraft ? (
            <div className="w-full lg:w-1/2">
              <DexterEmailComposeCard
                messageId={dexterMessageServerId(message)}
                draft={message.emailDraft}
                preparedActionId={message.pendingAction?.id ?? null}
                preparedActionPending={pendingActionDecision?.actionId === message.pendingAction?.id}
                preparedActionError={actionDecisionError?.actionId === message.pendingAction?.id ? actionDecisionError?.message ?? null : null}
                onPreparedActionDecision={message.pendingAction
                  ? () => onActionDecision(message.pendingAction!, "approve")
                  : undefined}
                onDraftChange={(draft) => onEmailDraftChange(message.id, draft)}
              />
            </div>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {message.pendingAction && !message.emailDraft && message.id === latestMessageId ? (
              <DexterActionApproval
                key={message.pendingAction.id}
                action={message.pendingAction}
                isPreparing={isStreamingMessage}
                pendingDecision={
                  pendingActionDecision?.actionId === message.pendingAction.id
                    ? pendingActionDecision.decision
                    : null
                }
                error={
                  actionDecisionError?.actionId === message.pendingAction.id
                    ? actionDecisionError.message
                    : null
                }
                onDecision={(decision) => onActionDecision(message.pendingAction!, decision)}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    )
  }

  return (
    <MessageScroller.Content
      aria-busy={isWorking}
      className="mx-auto flex min-h-full w-full min-w-0 flex-col gap-[var(--md-page-stack-gap)] px-[var(--md-page-pad)] py-[var(--md-page-section-gap)]"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleMessages.flatMap((message) => {
          if (message.role === "assistant" && pairedAssistantIds.has(message.id)) {
            return []
          }

          const switchedToSpecialist = roleSwitchesByMessage.get(message.id)
          const switchItem = switchedToSpecialist ? (
            <MessageScroller.Item
              key={`role-switch-${message.id}-${switchedToSpecialist}`}
              className="min-w-0 shrink-0"
            >
              <motion.div
                className="mx-auto flex w-full max-w-[760px] items-center gap-3"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 7, filter: "blur(5px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: 4, filter: "blur(3px)" }}
                transition={messageTransition}
                role="status"
              >
                <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-gradient-to-r from-transparent to-[var(--md-line)] rtl:bg-gradient-to-l" />
                <span className="shrink-0 text-[11.5px] font-medium text-[var(--md-subtle)]">
                  {t("Switched to role")} <span className="text-[var(--md-text)]">{t(specialistById(switchedToSpecialist).name)}</span>
                </span>
                <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-gradient-to-l from-transparent to-[var(--md-line)] rtl:bg-gradient-to-r" />
              </motion.div>
            </MessageScroller.Item>
          ) : null

          if (message.role === "user") {
            const responses = responsesByUserId.get(message.id) ?? []
            const selectedResponseId = selectedResponseMessageIds[message.id]
            const selectedResponse = responses.find((response) => response.id === selectedResponseId)
              ?? responses.at(-1)
            const selectedResponseIndex = selectedResponse
              ? responses.findIndex((response) => response.id === selectedResponse.id)
              : -1
            const isCopied = copiedMessageId === message.id
            const isRetrying = retryingMessageId === message.id
            const canRetryMessage = Boolean(persistedDexterMessageId(message))

            const userItem = (
              <MessageScroller.Item
                key={message.id}
                messageId={message.id}
                scrollAnchor
                className="min-w-0 shrink-0 [contain-intrinsic-size:auto_8rem] [content-visibility:auto]"
              >
                <motion.div
                  layout="position"
                  className="group/user ms-auto grid w-full max-w-[680px] grid-cols-[minmax(0,1fr)_32px] gap-3 rounded-[var(--md-radius-lg)] px-2 py-2"
                  initial={shouldReduceMotion ? false : {
                    opacity: 0,
                    x: userMessageOffset,
                    filter: "blur(6px)",
                  }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  transition={messageTransition}
                >
                  <div className="min-w-0 text-end">
                    <p className="mb-1 text-[11.5px] font-medium text-[var(--md-subtle)]">
                      {firstName}
                    </p>
                    <div className="whitespace-pre-wrap text-[15px] leading-6 text-[var(--md-ink)]">
                      <DexterMentionText text={message.content} items={mentionItems} />
                    </div>
                    {responses.length > 1 && selectedResponseIndex >= 0 ? (
                      <motion.div
                        layout
                        className="mt-2 flex items-center justify-end gap-1 text-[11.5px] text-[var(--md-subtle)]"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={messageTransition}
                        role="group"
                        aria-label={`${t("Attempt version")} ${selectedResponseIndex + 1} / ${responses.length}`}
                      >
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)] disabled:opacity-35"
                          aria-label={t("Previous attempt")}
                          title={t("Previous attempt")}
                          disabled={selectedResponseIndex === 0}
                          onClick={() => {
                            const previous = responses[selectedResponseIndex - 1]
                            if (previous) onSelectResponse(message.id, previous.id)
                          }}
                        >
                          <ChevronLeft className="size-3.5 rtl:rotate-180" strokeWidth={1.6} aria-hidden="true" />
                        </button>
                        <span className="min-w-8 text-center tabular-nums">
                          {selectedResponseIndex + 1}/{responses.length}
                        </span>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)] disabled:opacity-35"
                          aria-label={t("Next attempt")}
                          title={t("Next attempt")}
                          disabled={selectedResponseIndex === responses.length - 1}
                          onClick={() => {
                            const next = responses[selectedResponseIndex + 1]
                            if (next) onSelectResponse(message.id, next.id)
                          }}
                        >
                          <ChevronRight className="size-3.5 rtl:rotate-180" strokeWidth={1.6} aria-hidden="true" />
                        </button>
                      </motion.div>
                    ) : null}
                    <div className="md-dexter-user-actions pointer-events-none mt-1 flex h-7 translate-y-1 items-center justify-end gap-0.5 opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/user:pointer-events-auto group-hover/user:translate-y-0 group-hover/user:opacity-100 group-focus-within/user:pointer-events-auto group-focus-within/user:translate-y-0 group-focus-within/user:opacity-100">
                      <motion.button
                        type="button"
                        className="relative grid size-7 place-items-center rounded-full text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]"
                        aria-label={isCopied ? t("Message copied") : t("Copy message")}
                        title={isCopied ? t("Message copied") : t("Copy message")}
                        whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
                        onClick={() => void copyMessage(message)}
                      >
                        <motion.span
                          className="absolute grid place-items-center"
                          animate={{
                            opacity: isCopied ? 0 : 1,
                            scale: isCopied ? 0.72 : 1,
                            rotate: isCopied ? -18 : 0,
                          }}
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                        >
                          <Copy className="size-3.5" strokeWidth={1.55} aria-hidden="true" />
                        </motion.span>
                        <motion.span
                          className="absolute grid place-items-center text-[var(--md-green)]"
                          animate={{
                            opacity: isCopied ? 1 : 0,
                            scale: isCopied ? 1 : 0.72,
                            rotate: isCopied ? 0 : 18,
                          }}
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                        >
                          <Check className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        </motion.span>
                      </motion.button>
                      {onRetryMessage ? (
                        <motion.button
                          type="button"
                          className="grid size-7 place-items-center rounded-full text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)] disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={t("Retry response")}
                          title={t("Retry response")}
                          disabled={isWorking || !canRetryMessage}
                          whileTap={shouldReduceMotion || isWorking || !canRetryMessage ? undefined : { scale: 0.9 }}
                          onClick={() => onRetryMessage(message)}
                        >
                          <motion.span
                            animate={{ rotate: isRetrying && !shouldReduceMotion ? 180 : 0 }}
                            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
                          >
                            <RefreshCw className="size-3.5" strokeWidth={1.55} aria-hidden="true" />
                          </motion.span>
                        </motion.button>
                      ) : null}
                    </div>
                    <span className="sr-only" aria-live="polite">
                      {isCopied ? t("Message copied") : null}
                      {copyErrorMessageId === message.id ? t("Could not copy message") : null}
                    </span>
                  </div>
                  <Avatar className="mt-0.5 size-8 bg-[var(--md-surface-2)]">
                    {profilePhotoUrl ? (
                      <AvatarImage src={profilePhotoUrl} alt="" />
                    ) : null}
                    <AvatarFallback className="bg-[var(--md-surface-2)] text-[10px] font-medium text-[var(--md-text)]">
                      {currentUser?.initials || firstName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
              </MessageScroller.Item>
            )

            const responseItem = selectedResponse ? (
              <MessageScroller.Item
                key={`response-${message.id}`}
                messageId={selectedResponse.id}
                scrollAnchor
                className="min-w-0 shrink-0 [contain-intrinsic-size:auto_12rem] [content-visibility:auto]"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {assistantMessageView(selectedResponse)}
                </AnimatePresence>
              </MessageScroller.Item>
            ) : null

            return [switchItem, userItem, responseItem].filter(
              (item): item is ReactElement => item !== null,
            )
          }

          const messageItem = (
            <MessageScroller.Item
              key={message.id}
              messageId={message.id}
              scrollAnchor
              className="min-w-0 shrink-0 [contain-intrinsic-size:auto_12rem] [content-visibility:auto]"
            >
              {message.role === "assistant" ? assistantMessageView(message) : null}
            </MessageScroller.Item>
          )

          return switchItem ? [switchItem, messageItem] : [messageItem]
        })}
      </AnimatePresence>

      {isWorking && !streamingMessageId && !pendingActionDecision ? (
        <MessageScroller.Item className="min-w-0 shrink-0">
          <div className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] gap-4" role="status" aria-live="polite">
            <DexterBrandMark className="mt-1" />
            <div className="min-w-0 pt-2">
              <p className="text-[12px] text-[var(--md-subtle)]">{t("Dexter is checking your connected workspace data...")}</p>
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {[0, 1, 2].map((index) => (
                  <motion.span
                    key={index}
                    className="size-1.5 rounded-full bg-[var(--md-accent)]"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: index * 0.16,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </MessageScroller.Item>
      ) : null}

      {error ? (
        <MessageScroller.Item className="min-w-0 shrink-0">
          <div
            className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.07)] px-4 py-3 text-[13px] leading-5 text-[var(--md-red)] shadow-[0_0_0_1px_rgba(209,78,78,0.14)]"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4" strokeWidth={1.4} />
            <div className="min-w-0">
              <p>
                <strong>{t("Dexter could not answer")}</strong>
                <br />
                {t(error)}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {onRetryError ? (
                  <motion.button
                    type="button"
                    className="min-h-10 rounded-[var(--md-radius-md)] bg-[var(--md-red)] px-3.5 font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isWorking}
                    whileTap={shouldReduceMotion || isWorking ? undefined : { scale: 0.97 }}
                    onClick={onRetryError}
                  >
                    {t("Retry")}
                  </motion.button>
                ) : null}
                <motion.button
                  type="button"
                  className="min-h-10 rounded-[var(--md-radius-md)] px-3.5 font-medium text-[var(--md-text)] transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]"
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  onClick={onDismissError}
                >
                  {t("Dismiss")}
                </motion.button>
              </div>
            </div>
          </div>
        </MessageScroller.Item>
      ) : null}
    </MessageScroller.Content>
  )
}

export function AgentDexterPage({
  currentUser,
  profilePhotoUrl,
  navigate,
}: {
  currentUser: AuthUserSummary | null
  profilePhotoUrl: string | null
  navigate: (path: string) => void
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const initialConversationIdRef = useRef(readDexterConversationIdFromLocation())
  const [stage, setStage] = useState<"landing" | "conversation">(
    initialConversationIdRef.current ? "conversation" : "landing",
  )
  const [dexterMode, setDexterMode] = useState<"chat" | "watch">("chat")
  const [watches, setWatches] = useState<DexterWatch[]>([])
  const [isSending, setIsSending] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [liveReasoning, setLiveReasoning] = useState("")
  const [isLoadingConversation, setIsLoadingConversation] = useState(Boolean(initialConversationIdRef.current))
  const [error, setError] = useState<string | null>(null)
  const [failedPrompt, setFailedPrompt] = useState<FailedDexterPrompt | null>(null)
  const [pendingActionDecision, setPendingActionDecision] = useState<{
    actionId: string
    decision: DexterActionDecision
  } | null>(null)
  const [actionDecisionError, setActionDecisionError] = useState<{
    actionId: string
    message: string
  } | null>(null)
  const [activeConversation, setActiveConversation] = useState<DexterConversation | null>(null)
  const [selectedResponseMessageIds, setSelectedResponseMessageIds] = useState<Record<string, string>>({})
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null)
  const [conversationRenderKey, setConversationRenderKey] = useState("dexter-new-conversation")
  const [composerValue, setComposerValue] = useState("")
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<DexterSpecialistId>("auto")
  const [selectedModelId, setSelectedModelId] = useState<DexterModelId>(defaultDexterModelId)
  const [accessMode, setAccessMode] = useState<DexterAccessMode>("approve")
  const [pendingAccessMode, setPendingAccessMode] = useState<DexterAccessMode | null>(null)
  const [fullAccessGrantId, setFullAccessGrantId] = useState<string | null>(null)
  const [isAccessModeChanging, setIsAccessModeChanging] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachmentQuery, setAttachmentQuery] = useState("")
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set())
  const [composerEmailAttachments, setComposerEmailAttachments] = useState<DexterEmailAttachment[]>([])
  const [composerEmailUpdates, setComposerEmailUpdates] = useState<DexterWatchEmailContext[]>([])
  const [composerUploadedDocuments, setComposerUploadedDocuments] = useState<DexterUploadedDocument[]>([])
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [mentionItems, setMentionItems] = useState<DexterMentionItem[]>(defaultDexterMentionItems)
  const [recentDeals, setRecentDeals] = useState<ApiDeal[]>([])
  const [composerMentions, setComposerMentions] = useState<DexterMentionItem[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState<DexterMonitor | null>(null)
  const [isMonitorRailCollapsed, setIsMonitorRailCollapsed] = useState(true)
  const [composerInset, setComposerInset] = useState(202)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const computerFileInputRef = useRef<HTMLInputElement>(null)
  const stickToBottomRef = useRef(false)
  const pendingScrollToLatestRef = useRef(false)
  const isScrollingToLatestRef = useRef(false)
  const jumpScrollTimeoutRef = useRef<number | null>(null)
  const liveReasoningRef = useRef("")
  const actionDecisionInFlightRef = useRef<string | null>(null)
  const dexterClientSessionIdRef = useRef(crypto.randomUUID())
  const accessModeRequestVersionRef = useRef(0)
  const accessModeRequestInFlightRef = useRef(false)
  const promptSubmissionInFlightRef = useRef(false)
  const activePromptAbortControllerRef = useRef<AbortController | null>(null)
  const conversationIntentRef = useRef({
    id: initialConversationIdRef.current,
    version: 0,
  })
  const attachedItems = useAttachedItems(selectedAttachmentIds)
  const generatedDocumentHandoffRef = useRef(false)
  const taskHandoffRef = useRef(false)

  useEffect(() => () => {
    activePromptAbortControllerRef.current?.abort()
    activePromptAbortControllerRef.current = null
    promptSubmissionInFlightRef.current = false
  }, [])

  useEffect(() => {
    if (taskHandoffRef.current) return
    taskHandoffRef.current = true
    const prompt = takeDexterTaskHandoff()
    if (!prompt) return
    setDexterMode("chat")
    setComposerValue(prompt)
  }, [])

  useEffect(() => {
    if (generatedDocumentHandoffRef.current) return
    generatedDocumentHandoffRef.current = true
    const handoff = takeGeneratedDocumentForDexter()
    if (!handoff) return
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete("generated-document")
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
    setComposerValue(t("Help me with this generated document for job {jobNumber}.").replace("{jobNumber}", handoff.jobNumber))
    setIsUploadingDocument(true)
    void uploadDexterDocument(new File([handoff.blob], handoff.fileName, { type: handoff.mimeType }))
      .then((document) => setComposerUploadedDocuments([document]))
      .catch((handoffError) => setUploadError(handoffError instanceof Error ? handoffError.message : t("Dexter could not upload that document.")))
      .finally(() => setIsUploadingDocument(false))
  }, [t])
  const watchMentionItems = useMemo(() => mentionItems.filter((mention) => {
    if (mention.type === "email") return true
    if (!(["booking", "lead", "deal", "declaration", "quote"] as const).includes(mention.type as "booking" | "lead" | "deal" | "declaration" | "quote")) return false
    const rawId = mention.id.startsWith(`${mention.type}:`)
      ? mention.id.slice(mention.type.length + 1)
      : mention.id
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)
  }), [mentionItems])
  const composerMentionItems = dexterMode === "watch" ? watchMentionItems : mentionItems
  const slashCommands = useMemo<DexterSlashCommand[]>(() => {
    return [
      { id: "mode:chat", command: "/chat", label: "Chat", description: "Investigate or complete work.", group: "mode", icon: MessageSquareText, selected: dexterMode === "chat" },
      { id: "mode:watch", command: "/watch", label: "Watch", description: "Alert you when workspace records change.", group: "mode", icon: Radar, selected: dexterMode === "watch" },
    ]
  }, [dexterMode])
  const composerAttachmentItems = useMemo<DexterAttachment[]>(() => [
    ...attachedItems,
    ...composerEmailAttachments.map((attachment) => ({
      id: attachment.id,
      type: "email_attachment" as const,
      title: attachment.fileName,
      meta: attachment.subject,
      tone: "teal" as const,
      icon: FileText,
    })),
    ...composerEmailUpdates.map((context) => ({
      id: context.messageId,
      type: "email_update" as const,
      title: context.subject || t("No subject"),
      meta: [context.senderName || context.senderEmail, new Date(context.receivedAt).toLocaleString()].filter(Boolean).join(" · "),
      tone: "teal" as const,
      icon: Mail,
    })),
    ...composerUploadedDocuments.map((document) => ({
      id: document.id,
      type: "uploaded_document" as const,
      title: document.fileName,
      meta: `${Math.max(1, Math.ceil(document.sizeBytes / 1024)).toLocaleString()} KB`,
      tone: "teal" as const,
      icon: FileText,
    })),
  ], [attachedItems, composerEmailAttachments, composerEmailUpdates, composerUploadedDocuments, t])
  const attachedContextItems = useMemo(
    () => [...composerAttachmentItems, ...composerMentions],
    [composerAttachmentItems, composerMentions],
  )
  const branchMessages = useMemo(
    () => conversationBranchFor(activeConversation?.messages ?? [], selectedResponseMessageIds),
    [activeConversation?.messages, selectedResponseMessageIds],
  )
  const trailMessages = useMemo(
    () => trailMessagesFor(branchMessages),
    [branchMessages],
  )
  const contextUsedTokens = useMemo(
    () => estimateContextTokens(branchMessages, composerValue, attachedContextItems),
    [attachedContextItems, branchMessages, composerValue],
  )
  const isWorking = isSending || isLoadingConversation || isAccessModeChanging
  // The watcher rail is not modal — it sits over the thread and stays usable
  // alongside it — so opening a watcher must not dim what is behind it.
  const hasFocusOverlay = showAttachments
  const recommendedAttachmentIds =
    selectedSpecialistId === "customer" || selectedSpecialistId === "analytics"
      ? ["marlow", "md-22414", "ci-rev2"]
      : ["md-22455", "md-22479", "northwind", "co-cn"]

  const monitors = useMemo<DexterMonitor[]>(() => watches.map((watch) => ({
    id: watch.id,
    title: watch.title,
    body: readableWatchSummary(watch, t),
    // Status word and tone are no longer mapped here: the rail and its detail
    // pane derive both from the watch itself, so they cannot drift apart.
    detail: watch.healthMessage
      ? t(watch.healthMessage)
      : readableWatchEvent(watch, t) || (watch.triggerCount ? `${watch.triggerCount} ${t("alerts")}` : t("No alerts yet")),
    status: watch.status,
    capability: watch.capability,
    targetLabel: watch.targetLabel,
    ruleLabel: readableWatchSummary(watch, t),
    triggerCount: watch.triggerCount,
    lastTriggeredAt: watch.lastTriggeredAt,
    healthStatus: watch.healthStatus,
    lastSourceCheckAt: watch.lastSourceCheckAt,
    lastSuccessfulCheckAt: watch.lastSuccessfulCheckAt,
    healthMessage: watch.healthMessage,
    latestEvent: watch.latestEvent ?? null,
    action: watch.latestEvent?.action ?? watch.action ?? null,
  })), [t, watches])

  useEffect(() => {
    setSelectedMonitor((current) => {
      if (!current?.id) return current
      return monitors.find((monitor) => monitor.id === current.id) ?? null
    })
  }, [monitors])

  async function refreshWatches() {
    try {
      setWatches(await listDexterWatches())
    } catch (watchError) {
      console.error("Dexter watches could not be loaded.", watchError)
    }
  }

  useEffect(() => {
    void refreshWatches()
    const client = supabase
    if (!client) return
    const channel = client
      .channel("dexter-watches-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "AI_DexterWatches" }, () => void refreshWatches())
      .on("postgres_changes", { event: "*", schema: "public", table: "AI_DexterWatchEvents" }, () => void refreshWatches())
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [])
  useEffect(() => {
    if (stage === "conversation") {
      window.scrollTo(0, 0)
    }
  }, [stage])

  useEffect(() => {
    let active = true

    Promise.allSettled([
      listCustomers(),
      listLeads(),
      listDeals(),
      listStandaloneExportDrafts(),
      listDexterEmailContextSources(),
    ]).then(([customerResult, leadResult, dealResult, declarationResult, emailResult]) => {
      if (!active) return
      setMentionItems(mergeDexterMentionItems(
        customerResult.status === "fulfilled" ? customerMentionItems(customerResult.value) : [],
        leadResult.status === "fulfilled" ? leadMentionItems(leadResult.value) : [],
        dealResult.status === "fulfilled" ? dealMentionItems(dealResult.value) : [],
        declarationResult.status === "fulfilled" ? customsDeclarationMentionItems(declarationResult.value) : [],
        emailResult.status === "fulfilled"
          ? emailMentionItems(emailResult.value)
          : emailMentionItems(null, true),
        defaultDexterMentionItems.filter((mention) => mention.type !== "email"),
      ))
      setRecentDeals(dealResult.status === "fulfilled" ? dealResult.value : [])
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setComposerMentions((current) => current.filter((mention) => {
      const latest = composerMentionItems.find((candidate) => candidate.id === mention.id)
      return !latest?.disabled
    }))
  }, [composerMentionItems])

  useEffect(() => {
    if (!selectedMonitor?.id) return
    const refreshed = monitors.find((monitor) => monitor.id === selectedMonitor.id)
    setSelectedMonitor(refreshed ?? null)
  }, [monitors, selectedMonitor?.id])

  useEffect(() => {
    const requestedWatchId = new URLSearchParams(window.location.search).get("watch")
    if (!requestedWatchId) return
    const requestedMonitor = monitors.find((monitor) => monitor.id === requestedWatchId)
    if (!requestedMonitor) return
    setSelectedMonitor(requestedMonitor)
    setIsMonitorRailCollapsed(false)
  }, [monitors])

  const recentWorkContext = useMemo(() => readRecentWorkContext(), [])
  const personalisedDeal = useMemo(() => {
    if (recentWorkContext?.type !== "deal") return null
    return [...recentDeals]
      .filter((deal) => !["won", "lost", "closed"].includes(deal.statusCode.toLowerCase()))
      .sort((left, right) => {
        const leftTime = Date.parse(left.createdAt)
        const rightTime = Date.parse(right.createdAt)
        return rightTime - leftTime
      })[0] ?? null
  }, [recentDeals, recentWorkContext])

  // The composer floats over the stream and grows with the prompt, so the depth
  // it covers is measured rather than assumed: it sets the scroll clearance under
  // the last reply and the point the bottom veil hands content over at. A guessed
  // constant leaves either a strip of sharp text under the composer's edge or a
  // reply that cannot be scrolled clear of it.
  useLayoutEffect(() => {
    const node = composerRef.current
    if (!node || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      const stream = streamRef.current
      // Remember the intent before the padding changes: if the operator was
      // reading the newest reply, they should still be reading it afterwards.
      stickToBottomRef.current = Boolean(stream && stream.scrollHeight - stream.scrollTop - stream.clientHeight < 140)
      // The first observer tick can arrive while Motion is still laying out the
      // composer and briefly report zero. Never collapse the stream clearance:
      // a tall inline response (for example an email draft) must always scroll
      // fully above the floating prompt.
      setComposerInset(Math.max(node.offsetHeight, 202))
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [stage])

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return
    stickToBottomRef.current = false
    const stream = streamRef.current
    if (stream) stream.scrollTop = stream.scrollHeight
  }, [composerInset])

  // A sent prompt is a new point of attention. Even when the operator was
  // reading much earlier in the thread, the just-sent message must be visible
  // immediately so the streamed answer has a stable place to arrive.
  useLayoutEffect(() => {
    if (stage !== "conversation" || !pendingScrollToLatestRef.current) return

    const stream = streamRef.current
    if (!stream) return

    pendingScrollToLatestRef.current = false
    stream.scrollTop = stream.scrollHeight
    stickToBottomRef.current = true
    setShowJumpToLatest(false)
  }, [activeConversation?.id, activeConversation?.messages.length, stage])

  useEffect(() => () => {
    if (jumpScrollTimeoutRef.current !== null) {
      window.clearTimeout(jumpScrollTimeoutRef.current)
    }
  }, [])

  function updateJumpToLatestVisibility(stream = streamRef.current) {
    if (!stream || isScrollingToLatestRef.current) return

    const distanceFromLatest = Math.max(
      0,
      stream.scrollHeight - stream.scrollTop - stream.clientHeight,
    )
    const revealDistance = Math.max(
      DEXTER_JUMP_TO_LATEST_DISTANCE,
      stream.clientHeight * 0.2,
    )
    setShowJumpToLatest(distanceFromLatest > revealDistance)
  }

  function handleConversationScroll(event: React.UIEvent<HTMLDivElement>) {
    updateJumpToLatestVisibility(event.currentTarget)
  }

  function scrollToLatest(animate = true) {
    const stream = streamRef.current
    setShowJumpToLatest(false)
    stickToBottomRef.current = true

    if (!stream) {
      pendingScrollToLatestRef.current = true
      return
    }

    if (!animate || shouldReduceMotion) {
      isScrollingToLatestRef.current = false
      stream.scrollTop = stream.scrollHeight
      return
    }

    isScrollingToLatestRef.current = true
    if (jumpScrollTimeoutRef.current !== null) {
      window.clearTimeout(jumpScrollTimeoutRef.current)
    }

    stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" })
    jumpScrollTimeoutRef.current = window.setTimeout(() => {
      isScrollingToLatestRef.current = false
      jumpScrollTimeoutRef.current = null
      updateJumpToLatestVisibility()
    }, 560)
  }

  function toggleAttachment(id: string) {
    setSelectedAttachmentIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSlashCommand(command: DexterSlashCommand) {
    if (command.id === "mode:chat") {
      enterDexterMode("chat")
      return
    }
    if (command.id === "mode:watch") {
      enterDexterMode("watch")
      return
    }
  }

  function addAttachment(id: string) {
    setSelectedAttachmentIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  function enterDexterMode(mode: "chat" | "watch", preserveDraft = false) {
    setDexterMode(mode)
    if (!preserveDraft) {
      setComposerValue("")
      setComposerMentions([])
    }
    if (mode === "watch") {
      setStage("landing")
    }
  }

  function attachWatchFiles(attachments: DexterEmailAttachment[]) {
    if (!attachments.length) return
    setComposerEmailAttachments((current) => {
      const byId = new Map(current.map((attachment) => [attachment.id, attachment]))
      for (const attachment of attachments) byId.set(attachment.id, attachment)
      return [...byId.values()]
    })
    enterDexterMode("chat", true)
    setSelectedMonitor(null)
    setIsMonitorRailCollapsed(true)
    window.requestAnimationFrame(() => {
      composerRef.current?.querySelector<HTMLElement>(".md-dexter-mention-editor")?.focus()
      document.querySelector<HTMLElement>(".md-dexter-mention-editor")?.focus()
    })
  }

  function attachWatchUpdate(context: DexterWatchEmailContext) {
    setComposerEmailUpdates((current) => {
      const byId = new Map(current.map((item) => [item.messageId, item]))
      byId.set(context.messageId, context)
      return [...byId.values()]
    })
    setComposerEmailAttachments((current) => {
      const byId = new Map(current.map((attachment) => [attachment.id, attachment]))
      for (const attachment of context.attachments) if (!attachment.limitation) byId.set(attachment.id, attachment)
      return [...byId.values()]
    })
    enterDexterMode("chat", true)
    setSelectedMonitor(null)
    setIsMonitorRailCollapsed(true)
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".md-dexter-mention-editor")?.focus())
  }

  function composerMessageAttachments() {
    return [...new Map([
      ...attachedItems.map((attachment) => ({ id: attachment.id, type: attachment.type, title: attachment.title })),
      ...composerMentions.map((mention) => ({
        id: mention.id.startsWith(`${mention.type}:`) ? mention.id.slice(mention.type.length + 1) : mention.id,
        type: mention.type,
        title: mention.title,
      })),
      ...composerEmailAttachments.map((attachment) => ({
        id: attachment.id,
        type: "email_attachment",
        title: attachment.fileName,
        provider: attachment.provider,
        mailboxId: attachment.mailboxId,
        threadId: attachment.threadId,
        messageId: attachment.messageId,
        subject: attachment.subject,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        sourceUrl: attachment.sourceUrl,
      })),
      ...composerEmailUpdates.map((context) => ({
        id: context.messageId,
        type: "email_update",
        title: context.subject || "Email update",
        provider: context.provider,
        mailboxId: context.mailboxId,
        threadId: context.threadId,
        messageId: context.messageId,
        subject: context.subject,
        sourceUrl: context.sourceUrl,
      })),
      ...composerUploadedDocuments.map((document) => ({
        id: document.id,
        type: "uploaded_document",
        title: document.fileName,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
      })),
    ].map((item) => [`${item.type}:${item.id}`, item])).values()]
  }

  async function handleDocumentUpload(files: File[]) {
    if (isUploadingDocument || files.length === 0) return
    const remaining = 3 - composerUploadedDocuments.length
    if (remaining <= 0) {
      setUploadError(t("You can attach up to three computer files to one request."))
      return
    }
    const selected = files.slice(0, remaining)
    const selectionWasTruncated = files.length > remaining
    setIsUploadingDocument(true)
    setUploadError(selectionWasTruncated ? t("Only the first three files were selected.") : null)
    const results = await Promise.allSettled(selected.map((file) => uploadDexterDocument(file)))
    const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
    if (uploaded.length) {
      setComposerUploadedDocuments((current) => {
        const byId = new Map(current.map((document) => [document.id, document]))
        for (const document of uploaded) byId.set(document.id, document)
        return [...byId.values()].slice(0, 3)
      })
      if (!failed && !selectionWasTruncated) setShowAttachments(false)
    }
    if (failed) {
      setUploadError(failed.reason instanceof Error ? failed.reason.message : t("Dexter could not upload that document."))
    }
    setIsUploadingDocument(false)
  }

  function handleComposerAttachmentAction() {
    if (dexterMode === "chat") {
      setShowAttachments(false)
      setUploadError(null)
      computerFileInputRef.current?.click()
      return
    }
    setShowAttachments((value) => !value)
  }

  function handleComposerChange(value: string) {
    const command = value.trim().toLowerCase()
    const matchedCommand = slashCommands.find((item) => item.command.toLowerCase() === command)
    if (matchedCommand && !matchedCommand.disabled) {
      setComposerValue("")
      handleSlashCommand(matchedCommand)
      return
    }
    setComposerValue(value)
  }

  async function submitPrompt(
    prompt = composerValue,
    specialistId = selectedSpecialistId,
    failedRetry?: FailedDexterPrompt,
  ) {
    const message = (failedRetry?.input.message ?? prompt).trim()
    if (!message || isWorking || promptSubmissionInFlightRef.current) return
    const matchedCommand = failedRetry
      ? undefined
      : slashCommands.find((item) => item.command.toLowerCase() === message.toLowerCase())
    if (matchedCommand && !matchedCommand.disabled) {
      handleSlashCommand(matchedCommand)
      return
    }
    promptSubmissionInFlightRef.current = true

    if (dexterMode === "watch") {
      const messageAttachments = composerMessageAttachments()
      const createdAt = new Date().toISOString()
      const pendingMessage: DexterMessage = {
        id: `watch-pending-${Date.now()}`,
        role: "user",
        content: message,
        createdAt,
        specialist: specialistId,
        attachments: messageAttachments,
      }
      const assistantStreamMessage: DexterMessage = {
        id: `watch-streaming-${Date.now()}`,
        role: "assistant",
        content: "",
        createdAt,
        specialist: specialistId,
        responseToUserMessageId: pendingMessage.id,
        responseVersion: 1,
      }
      const pendingConversation: DexterConversation = {
        id: "",
        title: message.length > 100 ? `${message.slice(0, 99).trimEnd()}…` : message,
        summary: "",
        updatedAt: createdAt,
        messages: [pendingMessage, assistantStreamMessage],
      }
      const pendingDraft = {
        value: composerValue,
        mentions: composerMentions,
        attachmentIds: selectedAttachmentIds,
        emailAttachments: composerEmailAttachments,
        emailUpdates: composerEmailUpdates,
        uploadedDocuments: composerUploadedDocuments,
      }
      pendingScrollToLatestRef.current = true
      setActiveConversation(pendingConversation)
      setStage("conversation")
      setIsSending(true)
      liveReasoningRef.current = ""
      setLiveReasoning("")
      setStreamingMessageId(assistantStreamMessage.id)
      setError(null)
      setActionDecisionError(null)
      setComposerValue("")
      setComposerMentions([])
      setSelectedAttachmentIds(new Set())
      setComposerEmailAttachments([])
      setComposerEmailUpdates([])
      setComposerUploadedDocuments([])
      setShowAttachments(false)
      try {
        const result = await createDexterWatch({
          message,
          locale: language,
          attachments: messageAttachments,
        })
        setActiveConversation({
          ...pendingConversation,
          messages: [
            pendingMessage,
            { ...assistantStreamMessage, content: result.message },
          ],
        })
        if (result.status === "created") {
          setWatches((current) => [result.watch, ...current.filter((watch) => watch.id !== result.watch.id)])
          setIsMonitorRailCollapsed(false)
        }
      } catch (watchError) {
        setComposerValue(pendingDraft.value)
        setComposerMentions(pendingDraft.mentions)
        setSelectedAttachmentIds(pendingDraft.attachmentIds)
        setComposerEmailAttachments(pendingDraft.emailAttachments)
        setComposerEmailUpdates(pendingDraft.emailUpdates)
        setComposerUploadedDocuments(pendingDraft.uploadedDocuments)
        setActiveConversation({
          ...pendingConversation,
          messages: [
            pendingMessage,
            {
              ...assistantStreamMessage,
              content: watchError instanceof Error
                ? watchError.message
                : t("Dexter could not set up that watch."),
            },
          ],
        })
      } finally {
        promptSubmissionInFlightRef.current = false
        setIsSending(false)
        setStreamingMessageId(null)
      }
      return
    }

    const submissionIntent = conversationIntentRef.current
    const retryConversation = failedRetry?.previousConversation?.id &&
      activeConversation?.id === failedRetry.previousConversation.id
      ? {
          ...activeConversation,
          messages: activeConversation.messages.filter(
            (item) => item.id !== failedRetry.pendingMessage.id && item.id !== failedRetry.assistantMessageId,
          ),
        }
      : failedRetry?.previousConversation ?? null
    const previousConversation = failedRetry
      ? retryConversation
      : shouldReuseDexterConversation(activeConversation?.id, submissionIntent.id)
        ? activeConversation
        : null
    const previousBranchMessages = conversationBranchFor(
      previousConversation?.messages ?? [],
      selectedResponseMessageIds,
    )
    const parentResponseMessage = latestPersistedAssistantMessage(previousBranchMessages)
    const messageAttachments = failedRetry?.input.attachments ?? composerMessageAttachments()
    const draft: DexterComposerDraftSnapshot = failedRetry?.draft ?? {
      value: composerValue,
      mentions: composerMentions,
      attachmentIds: new Set(selectedAttachmentIds),
      emailAttachments: composerEmailAttachments,
      emailUpdates: composerEmailUpdates,
      uploadedDocuments: composerUploadedDocuments,
    }
    const pendingMessage: DexterMessage = failedRetry?.pendingMessage ?? {
      id: `pending-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      specialist: specialistId,
      attachments: messageAttachments,
      parentResponseMessageId: parentResponseMessage
        ? persistedDexterMessageId(parentResponseMessage)
        : null,
    }
    const assistantStreamMessage: DexterMessage = {
      id: `streaming-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      specialist: specialistId,
      responseToUserMessageId: pendingMessage.id,
      responseVersion: 1,
    }
    const pendingConversation: DexterConversation = previousConversation?.id
      ? {
          ...previousConversation,
          messages: [...previousConversation.messages, pendingMessage, assistantStreamMessage],
        }
      : {
          id: "",
          title: message.length > 100 ? `${message.slice(0, 99).trimEnd()}…` : message,
          summary: "",
          updatedAt: pendingMessage.createdAt,
          messages: [pendingMessage, assistantStreamMessage],
        }
    const requestInput: SendDexterMessageInput = failedRetry
      ? {
          ...failedRetry.input,
          conversationId: previousConversation?.id || null,
          parentResponseMessageId: parentResponseMessage
            ? persistedDexterMessageId(parentResponseMessage)
            : null,
          historyMessageIds: persistedDexterMessageIds(previousBranchMessages),
        }
      : {
          conversationId: previousConversation?.id || null,
          parentResponseMessageId: parentResponseMessage
            ? persistedDexterMessageId(parentResponseMessage)
            : null,
          historyMessageIds: persistedDexterMessageIds(previousBranchMessages),
          message,
          specialist: specialistId,
          model: selectedModelId,
          locale: language,
          clientSessionId: dexterClientSessionIdRef.current,
          fullAccessGrantId,
          attachments: messageAttachments,
        }

    pendingScrollToLatestRef.current = true
    setActiveConversation(pendingConversation)
    setStage("conversation")
    setIsSending(true)
    liveReasoningRef.current = ""
    setLiveReasoning("")
    setStreamingMessageId(assistantStreamMessage.id)
    setError(null)
    setFailedPrompt(null)
    setActionDecisionError(null)
    if (!failedRetry || composerValue === failedRetry.draft.value) {
      setComposerValue("")
      setComposerMentions([])
      setSelectedAttachmentIds(new Set())
      setComposerEmailAttachments([])
      setComposerEmailUpdates([])
      setComposerUploadedDocuments([])
    }
    setShowAttachments(false)
    setShowJumpToLatest(false)

    const requestController = new AbortController()
    activePromptAbortControllerRef.current = requestController

    try {
      const conversation = await streamDexterMessage(requestInput, {
        onAnswerDelta: (delta) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          const stream = streamRef.current
          const shouldFollow = !stream || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 220

          setActiveConversation((current) => {
            const base = current ?? pendingConversation
            const existingIndex = base.messages.findIndex((item) => item.id === assistantStreamMessage.id)
            if (existingIndex < 0) {
              return {
                ...base,
                messages: [...base.messages, { ...assistantStreamMessage, content: delta }],
              }
            }

            return {
              ...base,
              messages: base.messages.map((item, index) =>
                index === existingIndex ? { ...item, content: item.content + delta } : item,
              ),
            }
          })

          if (shouldFollow) {
            window.requestAnimationFrame(() => {
              if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
            })
          }
        },
        onReasoningDelta: (delta) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          liveReasoningRef.current += delta
          setLiveReasoning(liveReasoningRef.current)
        },
        onEmailAttachment: (attachment) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          setActiveConversation((current) => {
            const base = current ?? pendingConversation
            return {
              ...base,
              messages: base.messages.map((item) =>
                item.id === assistantStreamMessage.id
                  ? appendEmailAttachment(item, attachment)
                  : item,
              ),
            }
          })
        },
        onPendingAction: (pendingAction) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          setActiveConversation((current) => {
            const base = current ?? pendingConversation
            return {
              ...base,
              messages: base.messages.map((item) =>
                item.id === assistantStreamMessage.id ? { ...item, pendingAction } : item,
              ),
            }
          })
        },
      }, requestController.signal)
      if (conversationIntentRef.current.version !== submissionIntent.version) return
      conversationIntentRef.current = { id: conversation.id, version: submissionIntent.version }
      setActiveConversation(conversation)
      rememberOpenDexterConversation(conversation.id)
      announceDexterConversationsChanged()
      setFailedPrompt(null)
    } catch (requestError) {
      if (
        conversationIntentRef.current.version !== submissionIntent.version ||
        (requestError instanceof Error && requestError.name === "AbortError")
      ) {
        return
      }
      setActiveConversation((current) => {
        const base = current ?? pendingConversation
        const streamingMessage = base.messages.find((item) => item.id === assistantStreamMessage.id)
        if (!streamingMessage?.content.trim() && !liveReasoningRef.current.trim()) {
          return {
            ...base,
            messages: base.messages.filter((item) => item.id !== assistantStreamMessage.id),
          }
        }

        return {
          ...base,
            messages: base.messages.map((item) =>
              item.id === assistantStreamMessage.id
                ? { ...item, pendingAction: null, reasoningSummary: liveReasoningRef.current || null }
                : item,
          ),
        }
      })
      setFailedPrompt({
        input: requestInput,
        previousConversation,
        pendingMessage,
        assistantMessageId: assistantStreamMessage.id,
        draft,
      })
      setComposerValue((current) => current.trim() ? current : draft.value)
      setComposerMentions((current) => current.length ? current : draft.mentions)
      setSelectedAttachmentIds((current) => current.size ? current : new Set(draft.attachmentIds))
      setComposerEmailAttachments((current) => current.length ? current : draft.emailAttachments)
      setComposerEmailUpdates((current) => current.length ? current : draft.emailUpdates)
      setComposerUploadedDocuments((current) => current.length ? current : draft.uploadedDocuments)
      setError(requestError instanceof Error ? requestError.message : t("Dexter could not answer this request."))
    } finally {
      if (activePromptAbortControllerRef.current !== requestController) return
      activePromptAbortControllerRef.current = null
      promptSubmissionInFlightRef.current = false
      setIsSending(false)
      setStreamingMessageId(null)
    }
  }

  async function retryPrompt(userMessage: DexterMessage) {
    const retryMessageId = persistedDexterMessageId(userMessage)
    if (
      !activeConversation?.id ||
      userMessage.role !== "user" ||
      !retryMessageId ||
      isWorking ||
      promptSubmissionInFlightRef.current
    ) {
      return
    }

    promptSubmissionInFlightRef.current = true
    const submissionIntent = conversationIntentRef.current
    const previousConversation = activeConversation
    const responses = responseGroupsFor(previousConversation.messages).responsesByUserId.get(userMessage.id) ?? []
    const previousSelectedResponseId =
      selectedResponseMessageIds[userMessage.id] ?? responses.at(-1)?.id
    const visibleBranchMessages = conversationBranchFor(
      previousConversation.messages,
      selectedResponseMessageIds,
    )
    const retryMessageIndex = visibleBranchMessages.findIndex(
      (message) => message.id === userMessage.id,
    )
    const retryHistoryMessages = (
      retryMessageIndex >= 0
        ? visibleBranchMessages.slice(0, retryMessageIndex)
        : []
    )
    const retryHistoryMessageIds = persistedDexterMessageIds(retryHistoryMessages)
    const specialistId = isDexterSpecialistId(userMessage.specialist)
      ? userMessage.specialist
      : selectedSpecialistId
    const assistantStreamMessage: DexterMessage = {
      id: `streaming-retry-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      specialist: specialistId,
      responseToUserMessageId: userMessage.id,
      responseVersion: responses.length + 1,
    }

    setActiveConversation({
      ...previousConversation,
      messages: [...previousConversation.messages, assistantStreamMessage],
    })
    setSelectedResponseMessageIds((current) => ({
      ...current,
      [userMessage.id]: assistantStreamMessage.id,
    }))
    setRetryingMessageId(userMessage.id)
    setIsSending(true)
    liveReasoningRef.current = ""
    setLiveReasoning("")
    setStreamingMessageId(assistantStreamMessage.id)
    setError(null)
    setFailedPrompt(null)
    setActionDecisionError(null)
    setShowAttachments(false)
    setShowJumpToLatest(false)

    const requestController = new AbortController()
    activePromptAbortControllerRef.current = requestController

    try {
      const conversation = await streamDexterMessage({
        conversationId: previousConversation.id,
        retryMessageId,
        historyMessageIds: retryHistoryMessageIds,
        message: userMessage.content,
        specialist: specialistId,
        model: selectedModelId,
        locale: language,
        clientSessionId: dexterClientSessionIdRef.current,
        fullAccessGrantId,
        attachments: userMessage.attachments ?? [],
      }, {
        onAnswerDelta: (delta) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          setActiveConversation((current) => {
            const base = current ?? previousConversation
            const existingIndex = base.messages.findIndex((item) => item.id === assistantStreamMessage.id)
            if (existingIndex < 0) {
              return {
                ...base,
                messages: [...base.messages, { ...assistantStreamMessage, content: delta }],
              }
            }

            return {
              ...base,
              messages: base.messages.map((item, index) =>
                index === existingIndex ? { ...item, content: item.content + delta } : item,
              ),
            }
          })
        },
        onReasoningDelta: (delta) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          liveReasoningRef.current += delta
          setLiveReasoning(liveReasoningRef.current)
        },
        onEmailAttachment: (attachment) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          setActiveConversation((current) => {
            const base = current ?? previousConversation
            return {
              ...base,
              messages: base.messages.map((item) =>
                item.id === assistantStreamMessage.id
                  ? appendEmailAttachment(item, attachment)
                  : item,
              ),
            }
          })
        },
        onPendingAction: (pendingAction) => {
          if (conversationIntentRef.current.version !== submissionIntent.version) return
          setActiveConversation((current) => {
            const base = current ?? previousConversation
            return {
              ...base,
              messages: base.messages.map((item) =>
                item.id === assistantStreamMessage.id ? { ...item, pendingAction } : item,
              ),
            }
          })
        },
      }, requestController.signal)

      if (conversationIntentRef.current.version !== submissionIntent.version) return
      setActiveConversation(conversation)
      const acknowledgedResponse = responseGroupsFor(conversation.messages)
        .responsesByUserId.get(retryMessageId)
        ?.at(-1)
      if (acknowledgedResponse) {
        setSelectedResponseMessageIds((current) => ({
          ...current,
          [retryMessageId]: acknowledgedResponse.id,
        }))
      }
      announceDexterConversationsChanged()
      setFailedPrompt(null)
    } catch (requestError) {
      if (
        conversationIntentRef.current.version !== submissionIntent.version ||
        (requestError instanceof Error && requestError.name === "AbortError")
      ) {
        return
      }
      setActiveConversation((current) => {
        const base = current ?? previousConversation
        const streamingMessage = base.messages.find((item) => item.id === assistantStreamMessage.id)
        if (!streamingMessage?.content.trim() && !liveReasoningRef.current.trim()) {
          return previousConversation
        }

        return {
          ...base,
            messages: base.messages.map((item) =>
              item.id === assistantStreamMessage.id
                ? { ...item, pendingAction: null, reasoningSummary: liveReasoningRef.current || null }
                : item,
          ),
        }
      })
      setSelectedResponseMessageIds((current) => {
        const next = { ...current }
        if (next[userMessage.id] === assistantStreamMessage.id) {
          if (previousSelectedResponseId) next[userMessage.id] = previousSelectedResponseId
          else delete next[userMessage.id]
        }
        return next
      })
      setError(requestError instanceof Error ? requestError.message : t("Dexter could not answer this request."))
    } finally {
      if (activePromptAbortControllerRef.current !== requestController) return
      activePromptAbortControllerRef.current = null
      promptSubmissionInFlightRef.current = false
      setRetryingMessageId(null)
      setIsSending(false)
      setStreamingMessageId(null)
    }
  }

  async function handleActionDecision(action: DexterPendingAction, decision: DexterActionDecision) {
    if (
      !activeConversation?.id ||
      isWorking ||
      actionDecisionInFlightRef.current !== null
    ) {
      return
    }

    const previousConversation = activeConversation
    const submissionIntent = conversationIntentRef.current
    const previousBranchMessages = conversationBranchFor(
      previousConversation.messages,
      selectedResponseMessageIds,
    )
    const parentResponseMessage = latestPersistedAssistantMessage(previousBranchMessages)
    const decisionLabel = decision === "approve" ? t("Approve") : t("Deny")
    actionDecisionInFlightRef.current = action.id
    setPendingActionDecision({ actionId: action.id, decision })
    setActionDecisionError(null)
    setIsSending(true)
    liveReasoningRef.current = ""
    setLiveReasoning("")
    setError(null)
    setShowJumpToLatest(false)

    try {
      const conversation = await sendDexterMessage({
        conversationId: previousConversation.id,
        parentResponseMessageId: parentResponseMessage
          ? persistedDexterMessageId(parentResponseMessage)
          : null,
        historyMessageIds: persistedDexterMessageIds(previousBranchMessages),
        message: `${decisionLabel}: ${action.title}`,
        specialist: selectedSpecialistId,
        model: selectedModelId,
        locale: language,
        clientSessionId: dexterClientSessionIdRef.current,
        fullAccessGrantId,
        preparedActionId: action.id,
        actionDecision: decision,
        attachments: [],
      })
      if (conversationIntentRef.current.version !== submissionIntent.version) return
      setActiveConversation(conversation)
      announceDexterConversationsChanged()
    } catch (requestError) {
      if (conversationIntentRef.current.version !== submissionIntent.version) return
      setActionDecisionError({
        actionId: action.id,
        message: requestError instanceof Error
          ? requestError.message
          : t("Dexter could not apply this decision."),
      })
    } finally {
      if (conversationIntentRef.current.version === submissionIntent.version) {
        actionDecisionInFlightRef.current = null
        setPendingActionDecision(null)
        setIsSending(false)
      }
    }
  }

  async function handleAccessModeChange(mode: DexterAccessMode) {
    if (mode === accessMode || isWorking || accessModeRequestInFlightRef.current) return
    const previousMode = accessMode
    const previousGrantId = fullAccessGrantId
    const requestVersion = accessModeRequestVersionRef.current + 1
    accessModeRequestVersionRef.current = requestVersion
    accessModeRequestInFlightRef.current = true
    const conversationVersion = conversationIntentRef.current.version
    setError(null)
    setPendingAccessMode(mode)
    setIsAccessModeChanging(true)
    try {
      const access = await setDexterAccessMode({
        conversationId: activeConversation?.id || null,
        clientSessionId: dexterClientSessionIdRef.current,
        mode,
      })
      if (
        accessModeRequestVersionRef.current !== requestVersion ||
        conversationIntentRef.current.version !== conversationVersion
      ) return
      setAccessMode(access.mode)
      setFullAccessGrantId(access.grantId)
    } catch (requestError) {
      if (
        accessModeRequestVersionRef.current !== requestVersion ||
        conversationIntentRef.current.version !== conversationVersion
      ) return
      setAccessMode(previousMode)
      setFullAccessGrantId(previousGrantId)
      setError(requestError instanceof Error ? requestError.message : t("Dexter could not secure that access mode."))
    } finally {
      if (accessModeRequestVersionRef.current === requestVersion) {
        accessModeRequestInFlightRef.current = false
        setPendingAccessMode(null)
        setIsAccessModeChanging(false)
      }
    }
  }

  async function handleHistorySelect(id: string) {
    activePromptAbortControllerRef.current?.abort()
    activePromptAbortControllerRef.current = null
    promptSubmissionInFlightRef.current = false
    const intent = { id, version: conversationIntentRef.current.version + 1 }
    conversationIntentRef.current = intent
    accessModeRequestVersionRef.current += 1
    accessModeRequestInFlightRef.current = false
    dexterClientSessionIdRef.current = crypto.randomUUID()
    setPendingAccessMode(null)
    setIsAccessModeChanging(false)
    setAccessMode("approve")
    setFullAccessGrantId(null)
    setStage("conversation")
    rememberOpenDexterConversation(id)
    setConversationRenderKey(`dexter-conversation-${id}`)
    setIsLoadingConversation(true)
    setError(null)
    setFailedPrompt(null)
    setActionDecisionError(null)
    setPendingActionDecision(null)
    setIsSending(false)
    setRetryingMessageId(null)
    actionDecisionInFlightRef.current = null
    setStreamingMessageId(null)
    try {
      pendingScrollToLatestRef.current = true
      setSelectedResponseMessageIds({})
      const conversation = await getDexterConversation(id)
      if (conversationIntentRef.current.version !== intent.version) return
      setActiveConversation(conversation)
    } catch (requestError) {
      if (conversationIntentRef.current.version !== intent.version) return
      setError(requestError instanceof Error ? requestError.message : t("This conversation could not be loaded."))
    } finally {
      if (conversationIntentRef.current.version === intent.version) setIsLoadingConversation(false)
    }
  }

  function handleSuggestion(prompt: string, specialistId: DexterSpecialistId) {
    setComposerValue(prompt)
    setSelectedSpecialistId(specialistId)
    void submitPrompt(prompt, specialistId)
  }

  function startNewConversation() {
    activePromptAbortControllerRef.current?.abort()
    activePromptAbortControllerRef.current = null
    promptSubmissionInFlightRef.current = false
    conversationIntentRef.current = {
      id: null,
      version: conversationIntentRef.current.version + 1,
    }
    accessModeRequestVersionRef.current += 1
    accessModeRequestInFlightRef.current = false
    dexterClientSessionIdRef.current = crypto.randomUUID()
    setPendingAccessMode(null)
    setIsAccessModeChanging(false)
    setAccessMode("approve")
    setFullAccessGrantId(null)
    setStage("landing")
    rememberOpenDexterConversation(null)
    setActiveConversation(null)
    setSelectedResponseMessageIds({})
    setRetryingMessageId(null)
    setConversationRenderKey(`dexter-new-conversation-${Date.now()}`)
    setError(null)
    setFailedPrompt(null)
    setActionDecisionError(null)
    setPendingActionDecision(null)
    actionDecisionInFlightRef.current = null
    setIsSending(false)
    setIsLoadingConversation(false)
    setStreamingMessageId(null)
    liveReasoningRef.current = ""
    setLiveReasoning("")
    setComposerValue("")
    setComposerMentions([])
    setSelectedAttachmentIds(new Set())
    setComposerEmailAttachments([])
    setComposerEmailUpdates([])
    setComposerUploadedDocuments([])
    setUploadError(null)
    setSelectedSpecialistId("auto")
    setShowJumpToLatest(false)
  }

  function toggleWatchers() {
    if (!isMonitorRailCollapsed) setSelectedMonitor(null)
    setIsMonitorRailCollapsed((collapsed) => !collapsed)
  }

  function collapseWatchers() {
    setIsMonitorRailCollapsed(true)
    setSelectedMonitor(null)
  }

  useEffect(() => {
    const startNew = () => startNewConversation()
    const selectConversation = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (id) void handleHistorySelect(id)
    }
    const syncConversationChange = (event: Event) => {
      const detail = (event as CustomEvent<DexterConversationsChangedDetail>).detail
      if (!detail?.id || activeConversation?.id !== detail.id) return
      if (detail.action === "delete") {
        startNewConversation()
      } else if (detail.action === "rename" && detail.title) {
        setActiveConversation((current) => current ? { ...current, title: detail.title! } : current)
      }
    }

    // A conversation started by the summon overlay is waiting to be adopted, so
    // "Open in full" lands on the thread the operator was already reading.
    const handoffId = takeDexterConversationHandoff()
    const refreshConversationId = initialConversationIdRef.current
    initialConversationIdRef.current = null
    if (handoffId) void handleHistorySelect(handoffId)
    else if (refreshConversationId) void handleHistorySelect(refreshConversationId)

    window.addEventListener(DEXTER_NEW_CONVERSATION_EVENT, startNew)
    window.addEventListener(DEXTER_SELECT_CONVERSATION_EVENT, selectConversation)
    window.addEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, syncConversationChange)
    return () => {
      window.removeEventListener(DEXTER_NEW_CONVERSATION_EVENT, startNew)
      window.removeEventListener(DEXTER_SELECT_CONVERSATION_EVENT, selectConversation)
      window.removeEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, syncConversationChange)
    }
  }, [activeConversation?.id])

  return (
    <LayoutGroup>
      <input
        ref={computerFileInputRef}
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
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={mdMotion.page}
          >
            <WatchModeAurora active={dexterMode === "watch"} />
            <div className="pointer-events-auto absolute end-[var(--md-page-stack-gap)] top-[18px] z-30">
              <HeaderAction
                icon={Radar}
                label={t("Watchers")}
                onClick={toggleWatchers}
                expanded={!isMonitorRailCollapsed}
              />
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-[850px] flex-1 flex-col justify-center px-[var(--md-page-stack-gap)] py-[clamp(48px,8vw,64px)]">
              <motion.div
                className="mx-auto mb-[var(--md-page-section-gap)] text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={mdMotion.page}
              >
                <div className="flex items-center justify-center gap-3">
                  <DexterBrandMark className="size-6 shrink-0" />
                  <h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)] sm:text-[30px]">
                    {t(dexterMode === "watch" ? "What do you want me to watch?" : "What can I help you with today?")}
                  </h1>
                </div>
                <p className="mt-4 text-[15px] text-[var(--md-text)]">
                  {t(dexterMode === "watch"
                    ? "Describe the record and the change that matters. Type /chat to return."
                    : "Bookings, customers, documents, rates - or hand me the whole job.")}
                </p>
              </motion.div>

              <motion.div
                layoutId="dexter-composer"
                // Only the stage change may move this box. Without the gate, every
                // unrelated re-render — collapsing the watch rail, which retimes the
                // column widths in CSS — makes Motion measure a box mid-transition and
                // spring the composer across the page to a position it never had.
                layoutDependency={stage}
                className="relative z-30"
                transition={mdMotion.spring}
                style={{ willChange: "transform" }}
              >
                <DexterPromptComposer
                  value={composerValue}
                  specialists={defaultDexterSpecialists}
                  selectedSpecialistId={selectedSpecialistId}
                  selectedModelId={selectedModelId}
                  accessMode={accessMode}
                  pendingAccessMode={pendingAccessMode}
                  mode={dexterMode}
                  contextUsedTokens={contextUsedTokens}
                  contextMaxTokens={DEXTER_CONTEXT_WINDOW_TOKENS}
                  attachments={composerAttachmentItems}
                  commands={slashCommands}
                  mentionItems={composerMentionItems}
                  selectedMentions={composerMentions}
                  placeholder={dexterMode === "watch" ? "Describe the change, or @ the record to watch" : undefined}
                  onChange={handleComposerChange}
                  onMentionsChange={setComposerMentions}
                  onUnavailableMention={(mention) => {
                    if (mention.unavailableRoute) navigate(mention.unavailableRoute)
                  }}
                  onOpenAttachments={handleComposerAttachmentAction}
                  attachmentActionLabel={dexterMode === "chat" ? "Upload files" : "Attach context"}
                  onSelectSpecialist={setSelectedSpecialistId}
                  onSelectModel={setSelectedModelId}
                  onAccessModeChange={(mode) => void handleAccessModeChange(mode)}
                  isAccessModeChanging={isAccessModeChanging}
                  onCommand={handleSlashCommand}
                  onRemoveAttachment={(id) => {
                    if (composerUploadedDocuments.some((document) => document.id === id)) {
                      setComposerUploadedDocuments((current) => current.filter((document) => document.id !== id))
                      return
                    }
                    if (composerEmailUpdates.some((context) => context.messageId === id)) {
                      setComposerEmailUpdates((current) => current.filter((context) => context.messageId !== id))
                      return
                    }
                    if (composerEmailAttachments.some((attachment) => attachment.id === id)) {
                      setComposerEmailAttachments((current) => current.filter((attachment) => attachment.id !== id))
                    } else toggleAttachment(id)
                  }}
                  onSend={(prompt) => void submitPrompt(prompt)}
                  isSending={isWorking}
                />
              </motion.div>

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
                    style={{
                      transformOrigin: "top center",
                      willChange: "transform, opacity",
                    }}
                  >
                    <DexterAttachmentPalette
                      query={attachmentQuery}
                      items={defaultDexterAttachments}
                      selectedIds={selectedAttachmentIds}
                      recommendedIds={recommendedAttachmentIds}
                      onQueryChange={setAttachmentQuery}
                      onToggle={addAttachment}
                      onUploadFiles={dexterMode === "chat" ? (files) => void handleDocumentUpload(files) : undefined}
                      isUploading={isUploadingDocument}
                      uploadError={uploadError}
                      onClose={() => setShowAttachments(false)}
                      className="mt-4"
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {!showAttachments && !isSending && dexterMode === "chat" ? (
                <motion.div
                  className="mt-[var(--md-gap-xl)]"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={mdMotion.panel}
                >
                  <DexterSuggestionGrid
                    onPick={handleSuggestion}
                    dealName={personalisedDeal?.name}
                    bookingId={recentWorkContext?.type === "booking" ? recentWorkContext.recordId : null}
                  />
                </motion.div>
              ) : !showAttachments && !isSending ? (
                <div className="mt-[var(--md-gap-xl)] flex flex-wrap justify-center gap-2" aria-label={t("Recommended actions")}>
                  {[
                    t("Alert me when a live quote becomes accepted."),
                    t("Watch for new emails mentioning a customs hold."),
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="group inline-flex min-h-9 max-w-full items-center rounded-full bg-[var(--md-surface)] px-3.5 py-2 text-start text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:-translate-y-px hover:bg-[var(--md-surface-raised)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a22)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)] active:translate-y-0 motion-reduce:transform-none"
                      onClick={() => setComposerValue(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="relative z-10 hidden items-center justify-center gap-[clamp(32px,6vw,64px)] px-[var(--md-page-pad)] pb-[var(--md-page-pad)] text-[13px] text-[var(--md-text)] lg:flex">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[var(--md-green)]" />
                {watches.length
                  ? `${t("Watching for you")}: ${watches.filter((watch) => watch.status === "active").length} ${t("active")}`
                  : t("Nothing is being watched yet")}
                <button type="button" className="font-medium text-[var(--md-accent)]" onClick={() => setIsMonitorRailCollapsed(false)}>
                  {t("View")}
                </button>
              </span>
              <button type="button" className="font-medium text-[var(--md-text)]">
                Recent: At-risk customs this week <ArrowRight className="inline size-3" strokeWidth={1.2} />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dexter-conversation"
            className="grid h-[100dvh] min-h-0 grid-cols-1 overflow-hidden bg-[var(--md-bg)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={mdMotion.smooth}
          >
            <WatchModeAurora active={dexterMode === "watch"} />
            {/* The veils are mounted here, as siblings of the scroller: `backdrop-filter`
          samples what is painted below it in its own backdrop root, and any
          animated ancestor — a transform, an opacity under 1 — would start a new
          root and leave them blind. */}
            {/* The conversation deliberately continues behind the watcher rail.
          The rail is contextual glass rather than a layout column, so opening it
          never reflows or re-centres the thread beneath it. */}
            <MessageScroller.Provider
              key={conversationRenderKey}
              autoScroll
              defaultScrollPosition="end"
              scrollMargin={88}
            >
              <main className="relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden">
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <MotionMessageScrollerViewport
                      ref={streamRef}
                      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-[76px] md-scrollbar"
                      style={{ paddingBottom: composerInset + 24 }}
                      onScroll={handleConversationScroll}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...mdMotion.page, delay: 0.12 }}
                    >
                      <ConversationStream
                        messages={activeConversation?.messages ?? []}
                        isWorking={isWorking}
                        streamingMessageId={streamingMessageId}
                        reasoningContent={liveReasoning}
                        mentionItems={composerMentionItems}
                        currentUser={currentUser}
                        profilePhotoUrl={profilePhotoUrl}
                        selectedResponseMessageIds={selectedResponseMessageIds}
                        retryingMessageId={retryingMessageId}
                        error={error}
                        pendingActionDecision={pendingActionDecision}
                        actionDecisionError={actionDecisionError}
                        onActionDecision={(action, decision) => void handleActionDecision(action, decision)}
                        onRetryMessage={dexterMode === "chat" ? (message) => void retryPrompt(message) : undefined}
                        onRetryError={failedPrompt ? () => void submitPrompt(
                          failedPrompt.input.message,
                          isDexterSpecialistId(failedPrompt.input.specialist)
                            ? failedPrompt.input.specialist
                            : selectedSpecialistId,
                          failedPrompt,
                        ) : undefined}
                        onDismissError={() => {
                          setError(null)
                          setFailedPrompt(null)
                        }}
                        onSelectResponse={(userMessageId, assistantMessageId) => {
                          setSelectedResponseMessageIds((current) => ({
                            ...current,
                            [userMessageId]: assistantMessageId,
                          }))
                        }}
                        onEmailDraftChange={(messageId, draft) => {
                          setActiveConversation((current) => current ? {
                            ...current,
                            messages: current.messages.map((message) => message.id === messageId
                              ? { ...message, emailDraft: draft }
                              : message),
                          } : current)
                        }}
                      />
                    </MotionMessageScrollerViewport>

                    {trailMessages.length > 5 ? (
                      <DexterConversationTrail
                        messages={trailMessages}
                        scrollMessages={branchMessages}
                        bottomOffset={composerInset + 36}
                      />
                    ) : null}
                  </MessageScroller.Root>

                  <ProgressiveBlur edge="top" height={132} />
                  {/* Handed over at the composer's own top edge, less a few pixels of overlap
            so no seam shows through its rounded corners. */}
                  <ProgressiveBlur edge="bottom" height={116} offset={Math.max(composerInset - 40, 0)} />

                <AnimatePresence initial={false}>
                  {showJumpToLatest && !showAttachments ? (
                    <motion.div
                      key="dexter-jump-to-latest"
                      className="pointer-events-none absolute inset-x-0 z-[35] flex justify-center"
                      style={{ bottom: composerInset + 12 }}
                      initial={shouldReduceMotion ? false : {
                        opacity: 0,
                        y: 14,
                        scale: 0.9,
                        filter: "blur(8px)",
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        filter: "blur(0px)",
                      }}
                      exit={shouldReduceMotion ? undefined : {
                        opacity: 0,
                        y: 9,
                        scale: 0.92,
                        filter: "blur(6px)",
                      }}
                      transition={reduceMotion(shouldReduceMotion, mdMotion.enter)}
                    >
                      <motion.button
                        type="button"
                        className="md-dexter-jump-to-latest pointer-events-auto grid size-11 place-items-center rounded-full text-[var(--md-ink)]"
                        aria-label={t("Jump to latest message")}
                        title={t("Jump to latest message")}
                        whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                        onClick={() => scrollToLatest(true)}
                      >
                        <ArrowDown className="size-[18px]" strokeWidth={1.55} aria-hidden="true" />
                      </motion.button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <DexterConversationHeader
                  title={activeConversation?.title || t("Dexter conversation")}
                  isWorking={isWorking}
                  selectedSpecialistId={selectedSpecialistId}
                  watchersOpen={!isMonitorRailCollapsed}
                  onToggleWatchers={toggleWatchers}
                />

                <motion.div
                  ref={composerRef}
                  className="absolute inset-x-0 bottom-0 z-20 bg-[var(--md-bg)] px-[var(--md-page-stack-gap)] pb-[max(var(--md-page-stack-gap),env(safe-area-inset-bottom))] pt-[var(--md-gap-lg)]"
                  initial={false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={mdMotion.smooth}
                >
                  <div className="relative mx-auto w-full">
                    <motion.div
                      layoutId="dexter-composer"
                      layoutDependency={stage}
                      className="relative z-30"
                      transition={mdMotion.spring}
                      style={{ willChange: "transform" }}
                    >
                      <DexterPromptComposer
                        compact
                        value={composerValue}
                        specialists={defaultDexterSpecialists}
                        selectedSpecialistId={selectedSpecialistId}
                        selectedModelId={selectedModelId}
                        accessMode={accessMode}
                        pendingAccessMode={pendingAccessMode}
                        mode={dexterMode}
                        contextUsedTokens={contextUsedTokens}
                        contextMaxTokens={DEXTER_CONTEXT_WINDOW_TOKENS}
                        attachments={composerAttachmentItems}
                        commands={slashCommands}
                        mentionItems={composerMentionItems}
                        selectedMentions={composerMentions}
                        onChange={handleComposerChange}
                        onMentionsChange={setComposerMentions}
                        onUnavailableMention={(mention) => {
                          if (mention.unavailableRoute) navigate(mention.unavailableRoute)
                        }}
                        onOpenAttachments={handleComposerAttachmentAction}
                        attachmentActionLabel={dexterMode === "chat" ? "Upload files" : "Attach context"}
                        onSelectSpecialist={setSelectedSpecialistId}
                        onSelectModel={setSelectedModelId}
                        onAccessModeChange={(mode) => void handleAccessModeChange(mode)}
                        isAccessModeChanging={isAccessModeChanging}
                        onCommand={handleSlashCommand}
                        onRemoveAttachment={(id) => {
                          if (composerUploadedDocuments.some((document) => document.id === id)) {
                            setComposerUploadedDocuments((current) => current.filter((document) => document.id !== id))
                            return
                          }
                          if (composerEmailUpdates.some((context) => context.messageId === id)) {
                            setComposerEmailUpdates((current) => current.filter((context) => context.messageId !== id))
                            return
                          }
                          if (composerEmailAttachments.some((attachment) => attachment.id === id)) {
                            setComposerEmailAttachments((current) => current.filter((attachment) => attachment.id !== id))
                          } else toggleAttachment(id)
                        }}
                        onSend={(prompt) => void submitPrompt(prompt)}
                        isSending={isWorking}
                        className="shadow-[0_0_0_1px_var(--md-accent-a42),0_16px_38px_rgba(42,52,50,0.16)]"
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
                            onUploadFiles={dexterMode === "chat" ? (files) => void handleDocumentUpload(files) : undefined}
                            isUploading={isUploadingDocument}
                            uploadError={uploadError}
                            onClose={() => setShowAttachments(false)}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
                </div>
              </main>
            </MessageScroller.Provider>

          </motion.div>
        )}
      </AnimatePresence>

      <DexterWatchRail
        monitors={monitors}
        activeMonitor={selectedMonitor}
        collapsed={isMonitorRailCollapsed}
        onCollapse={collapseWatchers}
        // Picking the open watcher again closes its pane instead of re-opening it,
        // so the card is a toggle and the rail always has a way back.
        onSelectMonitor={(monitor) => setSelectedMonitor((current) => (current?.id && current.id === monitor.id ? null : monitor))}
        onCloseDetail={() => setSelectedMonitor(null)}
        onAsk={() => {
          enterDexterMode("watch")
          setIsMonitorRailCollapsed(true)
        }}
        onSetStatus={(monitor, status) => {
          if (!monitor.id) return
          void setDexterWatchStatus(monitor.id, status)
            .then(() => refreshWatches())
            .catch((watchError) => setError(watchError instanceof Error ? watchError.message : t("That watch could not be updated.")))
        }}
        onDelete={(monitor) => {
          if (!monitor.id || !window.confirm(t("Delete this watch? Its previous alerts will also be removed."))) return
          void deleteDexterWatch(monitor.id)
            .then(() => {
              setSelectedMonitor(null)
              return refreshWatches()
            })
            .catch((watchError) => setError(watchError instanceof Error ? watchError.message : t("That watch could not be deleted.")))
        }}
        onAskEvent={(monitor) => {
          const context = monitor.latestEvent?.context
          if (context?.kind !== "email" || context.availability !== "available") return
          attachWatchUpdate(context)
        }}
        onAskAttachment={(attachment) => attachWatchFiles([attachment])}
      />
    </LayoutGroup>
  )
}
