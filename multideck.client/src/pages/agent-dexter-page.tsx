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
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
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
  type DexterSpecialistId,
} from "@/components/multideck/agent-dexter-components"
import {
  DexterActionApproval,
  type DexterActionDecision,
} from "@/components/multideck/dexter-action-approval"
import { defaultDexterModelId, type DexterModelId } from "@/data/dexter-models"
import {
  customerMentionItems,
  defaultDexterMentionItems,
  leadMentionItems,
  mergeDexterMentionItems,
} from "@/data/dexter-mentions"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import { ProgressiveBlur } from "@/components/multideck/progressive-blur"
import { StatusPill } from "@/components/multideck/status-pill"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useLanguage } from "@/i18n/language-provider"
import {
  getDexterConversation,
  sendDexterMessage,
  streamDexterMessage,
  type DexterConversation,
  type DexterMessage,
  type DexterPendingAction,
} from "@/lib/dexter-api"
import {
  conversationBranchFor,
  responseGroupsFor,
} from "@/lib/dexter-conversation-branches"
import {
  announceDexterConversationsChanged,
  DEXTER_CONVERSATIONS_CHANGED_EVENT,
  DEXTER_NEW_CONVERSATION_EVENT,
  DEXTER_SELECT_CONVERSATION_EVENT,
  type DexterConversationsChangedDetail,
} from "@/lib/dexter-navigation"
import { listCustomers } from "@/lib/customer-api"
import { listLeads } from "@/lib/lead-api"
import { listDeals, type ApiDeal } from "@/lib/deal-api"
import { readRecentWorkContext } from "@/lib/recent-work-context"
import type { AuthUserSummary } from "@/lib/auth-user"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"

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

function retainStreamingAssistantId(
  conversation: DexterConversation,
  streamingMessageId: string,
) {
  const assistantIndex = [...conversation.messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "assistant")?.index

  if (assistantIndex === undefined) return conversation

  return {
    ...conversation,
    messages: conversation.messages.map((message, index) =>
      index === assistantIndex
        ? {
            ...message,
            id: streamingMessageId,
            serverId: message.serverId ?? message.id,
          }
        : message,
    ),
  }
}

function dexterMessageServerId(message: DexterMessage) {
  return message.serverId ?? message.id
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
          icon={Sparkles}
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
          <table>{children}</table>
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
        <table>
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

      <div className="md-dexter-markdown__records">
        {rows.map((row, rowIndex) => (
          <div
            key={`${row[0] || "record"}-${rowIndex}`}
            className="md-dexter-markdown__record"
            role="group"
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
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
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
  onSelectResponse,
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
  onRetryMessage: (message: DexterMessage) => void
  onSelectResponse: (userMessageId: string, assistantMessageId: string) => void
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

  function assistantMessageView(
    message: DexterMessage,
    options?: {
      versionIndex?: number
      versionCount?: number
      userMessageId?: string
    },
  ) {
    const isStreamingMessage = message.id === streamingMessageId
    const reasoning = isStreamingMessage
      ? reasoningContent || message.reasoningSummary || ""
      : message.reasoningSummary || ""
    const versionIndex = options?.versionIndex ?? 0
    const versionCount = options?.versionCount ?? 1

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
          {message.content.trim() ? (
            <DexterMarkdown
              content={message.content}
              isStreaming={isStreamingMessage}
            />
          ) : null}
          {message.pendingAction && message.id === latestMessageId ? (
            <DexterActionApproval
              action={message.pendingAction}
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
          {options?.userMessageId && versionCount > 1 ? (
            <motion.div
              layout
              className="mt-3 flex items-center gap-1 text-[11.5px] text-[var(--md-subtle)]"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={messageTransition}
              role="group"
              aria-label={`${t("Response version")} ${versionIndex + 1} / ${versionCount}`}
            >
              <button
                type="button"
                className="grid size-7 place-items-center rounded-full transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)] disabled:opacity-35"
                aria-label={t("Previous response")}
                title={t("Previous response")}
                disabled={versionIndex === 0}
                onClick={() => {
                  const responses = responsesByUserId.get(options.userMessageId!) ?? []
                  const previous = responses[versionIndex - 1]
                  if (previous) onSelectResponse(options.userMessageId!, previous.id)
                }}
              >
                <ChevronLeft className="size-3.5 rtl:rotate-180" strokeWidth={1.6} aria-hidden="true" />
              </button>
              <span className="min-w-8 text-center tabular-nums">
                {versionIndex + 1}/{versionCount}
              </span>
              <button
                type="button"
                className="grid size-7 place-items-center rounded-full transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)] disabled:opacity-35"
                aria-label={t("Next response")}
                title={t("Next response")}
                disabled={versionIndex === versionCount - 1}
                onClick={() => {
                  const responses = responsesByUserId.get(options.userMessageId!) ?? []
                  const next = responses[versionIndex + 1]
                  if (next) onSelectResponse(options.userMessageId!, next.id)
                }}
              >
                <ChevronRight className="size-3.5 rtl:rotate-180" strokeWidth={1.6} aria-hidden="true" />
              </button>
            </motion.div>
          ) : null}
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
                      <motion.button
                        type="button"
                        className="grid size-7 place-items-center rounded-full text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-surface-2)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={t("Retry response")}
                        title={t("Retry response")}
                        disabled={isWorking}
                        whileTap={shouldReduceMotion || isWorking ? undefined : { scale: 0.9 }}
                        onClick={() => onRetryMessage(message)}
                      >
                        <motion.span
                          animate={{ rotate: isRetrying && !shouldReduceMotion ? 180 : 0 }}
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
                        >
                          <RefreshCw className="size-3.5" strokeWidth={1.55} aria-hidden="true" />
                        </motion.span>
                      </motion.button>
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
                  {assistantMessageView(selectedResponse, {
                    versionIndex: selectedResponseIndex,
                    versionCount: responses.length,
                    userMessageId: message.id,
                  })}
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
            <span>
              <strong>{t("Dexter could not answer")}</strong>
              <br />
              {t(error)}
            </span>
          </div>
        </MessageScroller.Item>
      ) : null}
    </MessageScroller.Content>
  )
}

export function AgentDexterPage({
  currentUser,
  profilePhotoUrl,
}: {
  currentUser: AuthUserSummary | null
  profilePhotoUrl: string | null
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [stage, setStage] = useState<"landing" | "conversation">("landing")
  const [isSending, setIsSending] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [liveReasoning, setLiveReasoning] = useState("")
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachmentQuery, setAttachmentQuery] = useState("")
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set())
  const [mentionItems, setMentionItems] = useState<DexterMentionItem[]>(defaultDexterMentionItems)
  const [recentDeals, setRecentDeals] = useState<ApiDeal[]>([])
  const [composerMentions, setComposerMentions] = useState<DexterMentionItem[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState<DexterMonitor | null>(null)
  const [isMonitorRailCollapsed, setIsMonitorRailCollapsed] = useState(true)
  const [composerInset, setComposerInset] = useState(202)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(false)
  const pendingScrollToLatestRef = useRef(false)
  const isScrollingToLatestRef = useRef(false)
  const jumpScrollTimeoutRef = useRef<number | null>(null)
  const liveReasoningRef = useRef("")
  const actionDecisionInFlightRef = useRef<string | null>(null)
  const promptSubmissionInFlightRef = useRef(false)
  const attachedItems = useAttachedItems(selectedAttachmentIds)
  const attachedContextItems = useMemo(
    () => [...attachedItems, ...composerMentions],
    [attachedItems, composerMentions],
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
  const isWorking = isSending || isLoadingConversation
  // The watcher rail is not modal — it sits over the thread and stays usable
  // alongside it — so opening a watcher must not dim what is behind it.
  const hasFocusOverlay = showAttachments
  const recommendedAttachmentIds =
    selectedSpecialistId === "customer" || selectedSpecialistId === "analytics"
      ? ["marlow", "md-22414", "ci-rev2"]
      : ["md-22455", "md-22479", "northwind", "co-cn"]
  useEffect(() => {
    if (stage === "conversation") {
      window.scrollTo(0, 0)
    }
  }, [stage])

  useEffect(() => {
    let active = true

    Promise.allSettled([listCustomers(), listLeads(), listDeals()]).then(([customerResult, leadResult, dealResult]) => {
      if (!active) return
      setMentionItems(mergeDexterMentionItems(
        customerResult.status === "fulfilled" ? customerMentionItems(customerResult.value) : [],
        leadResult.status === "fulfilled" ? leadMentionItems(leadResult.value) : [],
        defaultDexterMentionItems,
      ))
      setRecentDeals(dealResult.status === "fulfilled" ? dealResult.value : [])
    })

    return () => {
      active = false
    }
  }, [])

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
      setComposerInset(node.offsetHeight)
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

  function addAttachment(id: string) {
    setSelectedAttachmentIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  async function submitPrompt(prompt = composerValue, specialistId = selectedSpecialistId) {
    const message = prompt.trim()
    if (!message || isWorking || promptSubmissionInFlightRef.current) return
    promptSubmissionInFlightRef.current = true

    const previousConversation = activeConversation
    const previousBranchMessages = conversationBranchFor(
      previousConversation?.messages ?? [],
      selectedResponseMessageIds,
    )
    const parentResponseMessage = [...previousBranchMessages]
      .reverse()
      .find((item) => item.role === "assistant")
    const pendingMessage: DexterMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      specialist: specialistId,
      parentResponseMessageId: parentResponseMessage
        ? dexterMessageServerId(parentResponseMessage)
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

    pendingScrollToLatestRef.current = true
    setActiveConversation(pendingConversation)
    setStage("conversation")
    setIsSending(true)
    liveReasoningRef.current = ""
    setLiveReasoning("")
    setStreamingMessageId(assistantStreamMessage.id)
    setError(null)
    setActionDecisionError(null)
    setShowAttachments(false)
    setShowJumpToLatest(false)

    try {
      const conversation = await streamDexterMessage({
        conversationId: previousConversation?.id || null,
        parentResponseMessageId: parentResponseMessage
          ? dexterMessageServerId(parentResponseMessage)
          : null,
        historyMessageIds: previousBranchMessages.map(dexterMessageServerId),
        message,
        specialist: specialistId,
        model: selectedModelId,
        locale: language,
        accessMode,
        attachments: [...new Map(
          [
            ...attachedItems.map((attachment) => ({
              id: attachment.id,
              type: attachment.type,
              title: attachment.title,
            })),
            ...composerMentions.map((mention) => ({
              id: mention.id.startsWith(`${mention.type}:`)
                ? mention.id.slice(mention.type.length + 1)
                : mention.id,
              type: mention.type,
              title: mention.title,
            })),
          ].map((item) => [`${item.type}:${item.id}`, item]),
        ).values()],
      }, {
        onAnswerDelta: (delta) => {
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
          liveReasoningRef.current += delta
          setLiveReasoning(liveReasoningRef.current)
        },
      })
      setActiveConversation(retainStreamingAssistantId(conversation, assistantStreamMessage.id))
      announceDexterConversationsChanged()
      setComposerValue("")
      setComposerMentions([])
      setSelectedAttachmentIds(new Set())
    } catch (requestError) {
      setActiveConversation((current) => {
        const base = current ?? pendingConversation
        const streamingMessage = base.messages.find((item) => item.id === assistantStreamMessage.id)
        if (!streamingMessage?.content.trim() && !liveReasoningRef.current.trim()) {
          return previousConversation ?? {
            ...pendingConversation,
            messages: [pendingMessage],
          }
        }

        return {
          ...base,
          messages: base.messages.map((item) =>
            item.id === assistantStreamMessage.id
              ? { ...item, reasoningSummary: liveReasoningRef.current || null }
              : item,
          ),
        }
      })
      setError(requestError instanceof Error ? requestError.message : t("Dexter could not answer this request."))
    } finally {
      promptSubmissionInFlightRef.current = false
      setIsSending(false)
      setStreamingMessageId(null)
    }
  }

  async function retryPrompt(userMessage: DexterMessage) {
    if (
      !activeConversation?.id ||
      userMessage.role !== "user" ||
      userMessage.id.startsWith("pending-") ||
      isWorking
    ) {
      return
    }

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
    const retryHistoryMessageIds = (
      retryMessageIndex >= 0
        ? visibleBranchMessages.slice(0, retryMessageIndex)
        : []
    ).map(dexterMessageServerId)
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
    setActionDecisionError(null)
    setShowAttachments(false)

    try {
      const conversation = await streamDexterMessage({
        conversationId: previousConversation.id,
        retryMessageId: dexterMessageServerId(userMessage),
        historyMessageIds: retryHistoryMessageIds,
        message: userMessage.content,
        specialist: specialistId,
        model: selectedModelId,
        locale: language,
        accessMode,
        attachments: [],
      }, {
        onAnswerDelta: (delta) => {
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
          liveReasoningRef.current += delta
          setLiveReasoning(liveReasoningRef.current)
        },
      })

      setActiveConversation(retainStreamingAssistantId(conversation, assistantStreamMessage.id))
      announceDexterConversationsChanged()
    } catch (requestError) {
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
              ? { ...item, reasoningSummary: liveReasoningRef.current || null }
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
    const previousBranchMessages = conversationBranchFor(
      previousConversation.messages,
      selectedResponseMessageIds,
    )
    const parentResponseMessage = [...previousBranchMessages]
      .reverse()
      .find((item) => item.role === "assistant")
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
          ? dexterMessageServerId(parentResponseMessage)
          : null,
        historyMessageIds: previousBranchMessages.map(dexterMessageServerId),
        message: `${decisionLabel}: ${action.title}`,
        specialist: selectedSpecialistId,
        model: selectedModelId,
        locale: language,
        accessMode,
        approvedAction: decision === "approve"
          ? { action: action.action, arguments: action.arguments }
          : null,
        actionDecision: decision,
        attachments: [],
      })
      setActiveConversation(conversation)
      announceDexterConversationsChanged()
    } catch (requestError) {
      setActionDecisionError({
        actionId: action.id,
        message: requestError instanceof Error
          ? requestError.message
          : t("Dexter could not apply this decision."),
      })
    } finally {
      actionDecisionInFlightRef.current = null
      setPendingActionDecision(null)
      setIsSending(false)
    }
  }

  async function handleHistorySelect(id: string) {
    setStage("conversation")
    setConversationRenderKey(`dexter-conversation-${id}`)
    setIsLoadingConversation(true)
    setError(null)
    setActionDecisionError(null)
    setPendingActionDecision(null)
    try {
      pendingScrollToLatestRef.current = true
      setSelectedResponseMessageIds({})
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
    setStage("landing")
    setActiveConversation(null)
    setSelectedResponseMessageIds({})
    setRetryingMessageId(null)
    setConversationRenderKey(`dexter-new-conversation-${Date.now()}`)
    setError(null)
    setActionDecisionError(null)
    setPendingActionDecision(null)
    actionDecisionInFlightRef.current = null
    setComposerValue("")
    setComposerMentions([])
    setSelectedAttachmentIds(new Set())
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
            <div className="pointer-events-auto absolute end-[var(--md-page-stack-gap)] top-[18px] z-30">
              <HeaderAction
                icon={Sparkles}
                label={t("Watchers")}
                onClick={toggleWatchers}
                expanded={!isMonitorRailCollapsed}
              />
            </div>

            <div className="mx-auto flex w-full max-w-[850px] flex-1 flex-col justify-center px-[var(--md-page-stack-gap)] py-[clamp(48px,8vw,64px)]">
              <motion.div
                className="mx-auto mb-[var(--md-page-section-gap)] text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={mdMotion.page}
              >
                <div className="flex items-center justify-center gap-3">
                  <DexterBrandMark className="size-6 shrink-0" />
                  <h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)] sm:text-[30px]">
                    What can I help you with today?
                  </h1>
                </div>
                <p className="mt-4 text-[15px] text-[var(--md-text)]">
                  Bookings, customers, documents, rates - or hand me the whole job.
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
                  contextUsedTokens={contextUsedTokens}
                  contextMaxTokens={DEXTER_CONTEXT_WINDOW_TOKENS}
                  attachments={attachedItems}
                  mentionItems={mentionItems}
                  selectedMentions={composerMentions}
                  onChange={setComposerValue}
                  onMentionsChange={setComposerMentions}
                  onOpenAttachments={() => setShowAttachments((value) => !value)}
                  onSelectSpecialist={setSelectedSpecialistId}
                  onSelectModel={setSelectedModelId}
                  onAccessModeChange={setAccessMode}
                  onRemoveAttachment={(id) => toggleAttachment(id)}
                  onSend={(prompt) => void submitPrompt(prompt)}
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
                      onClose={() => setShowAttachments(false)}
                      className="mt-4"
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {!showAttachments && !isSending ? (
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
              ) : null}
            </div>

            <div className="hidden items-center justify-center gap-[clamp(32px,6vw,64px)] px-[var(--md-page-pad)] pb-[var(--md-page-pad)] text-[13px] text-[var(--md-text)] lg:flex">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[var(--md-green)]" />
                Watching 4 things for you - Maersk on-time fell 7% overnight
                <button type="button" className="font-medium text-[var(--md-accent)]">
                  View
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
            className="grid h-screen min-h-[680px] grid-cols-1 overflow-hidden bg-[var(--md-bg)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={mdMotion.smooth}
          >
            {/* The veils are mounted here, as siblings of the scroller: `backdrop-filter`
          samples what is painted below it in its own backdrop root, and any
          animated ancestor — a transform, an opacity under 1 — would start a new
          root and leave them blind. */}
            {/* The conversation deliberately continues behind the watcher rail.
          The rail is contextual glass rather than a layout column, so opening it
          never reflows or re-centres the thread beneath it. */}
            <MessageScroller.Provider
              key={conversationRenderKey}
              defaultScrollPosition="end"
              scrollMargin={88}
            >
              <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
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
                        mentionItems={mentionItems}
                        currentUser={currentUser}
                        profilePhotoUrl={profilePhotoUrl}
                        selectedResponseMessageIds={selectedResponseMessageIds}
                        retryingMessageId={retryingMessageId}
                        error={error}
                        pendingActionDecision={pendingActionDecision}
                        actionDecisionError={actionDecisionError}
                        onActionDecision={(action, decision) => void handleActionDecision(action, decision)}
                        onRetryMessage={(message) => void retryPrompt(message)}
                        onSelectResponse={(userMessageId, assistantMessageId) => {
                          setSelectedResponseMessageIds((current) => ({
                            ...current,
                            [userMessageId]: assistantMessageId,
                          }))
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
                  className="absolute inset-x-0 bottom-0 z-20 bg-[var(--md-bg)] px-[var(--md-page-stack-gap)] pb-[var(--md-page-stack-gap)] pt-[var(--md-gap-lg)]"
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
                        contextUsedTokens={contextUsedTokens}
                        contextMaxTokens={DEXTER_CONTEXT_WINDOW_TOKENS}
                        attachments={attachedItems}
                        mentionItems={mentionItems}
                        selectedMentions={composerMentions}
                        onChange={setComposerValue}
                        onMentionsChange={setComposerMentions}
                        onOpenAttachments={() => setShowAttachments((value) => !value)}
                        onSelectSpecialist={setSelectedSpecialistId}
                        onSelectModel={setSelectedModelId}
                        onAccessModeChange={setAccessMode}
                        onRemoveAttachment={(id) => toggleAttachment(id)}
                        onSend={(prompt) => void submitPrompt(prompt)}
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
        onSelectMonitor={(monitor) => setSelectedMonitor((current) => (current?.title === monitor.title ? null : monitor))}
        onCloseDetail={() => setSelectedMonitor(null)}
        onAsk={() => {
          setComposerValue("Watch for any customer-critical movement on Northwind bookings this week.")
          setSelectedSpecialistId("ops")
        }}
      />
    </LayoutGroup>
  )
}
