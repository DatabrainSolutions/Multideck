import type { DexterModelId } from "@/data/dexter-models"
import type { AutomationAction, AutomationCondition } from "@/data/contact-card-data"
import { retainStreamedEmailAttachments } from "@/lib/dexter-streamed-attachments"
import {
  getSupabaseSession,
  supabase,
  supabaseFunctionsUrl,
  supabasePublicApiKey,
} from "@/lib/supabase"

export type DexterConversationSummary = {
  id: string
  title: string
  summary: string
  updatedAt: string
}

export type DexterMessage = {
  id: string
  serverId?: string | null
  role: "user" | "assistant" | "system" | "tool"
  content: string
  createdAt: string
  specialist?: string | null
  pendingAction?: DexterPendingAction | null
  reasoningSummary?: string | null
  responseToUserMessageId?: string | null
  responseVersion?: number | null
  parentResponseMessageId?: string | null
  emailAttachments?: DexterEmailAttachment[]
  emailDraft?: DexterEmailDraft | null
  attachments?: DexterMessageAttachment[]
}

export type DexterEmailDraftAddress = {
  address: string
  displayName: string | null
}

export type DexterEmailDraftDelivery = {
  status: "draft" | "creating_draft" | "draft_created" | "sending" | "queued" | "sent" | "failed"
  sendRequestId?: string | null
  messageId?: string | null
  threadId?: string | null
  updatedAt?: string | null
}

export type DexterEmailDraft = {
  id: string
  requestedAction: "create_draft" | "send"
  mode: "new" | "reply" | "reply_all" | "forward"
  mailboxId: string | null
  sourceMessageId: string | null
  threadId: string | null
  to: DexterEmailDraftAddress[]
  cc: DexterEmailDraftAddress[]
  bcc: DexterEmailDraftAddress[]
  subject: string
  bodyText: string
  trackOpens: boolean
  delivery: DexterEmailDraftDelivery
}

export type InboxDexterDraftInput = {
  mode: DexterEmailDraft["mode"]
  sourceMessageId: string | null
  to: DexterEmailDraftAddress[]
  cc: DexterEmailDraftAddress[]
  bcc: DexterEmailDraftAddress[]
  subject: string
  bodyText: string
  locale: string
}

export type DexterEmailAttachment = {
  id: string
  provider: "gmail" | "outlook"
  mailboxId: string
  threadId: string
  messageId: string
  subject: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sourceUrl: string
  limitation?: string | null
}

export type DexterAccessMode = "approve" | "full"

export type DexterFullAccessGrant = {
  mode: DexterAccessMode
  grantId: string | null
  expiresAt: string | null
}

export type DexterPendingAction = {
  id: string
  title: string
  description: string
  changes: DexterActionChange[]
}

export type DexterActionChange = {
  field: string
  /** Legacy fallback retained for approvals saved before field-level diffs. */
  value: string
  before?: string | null
  after?: string | null
  beforeKnown?: boolean
  kind?: "added" | "removed" | "changed"
}

export type DexterConversation = DexterConversationSummary & {
  messages: DexterMessage[]
}

export type DexterUsageTrendPoint = {
  weekStart: string
  actions: number
  tokens: number
}

export type DexterUsageEntry = {
  id: string
  title: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  createdAt: string
}

export type DexterModelUsage = {
  model: DexterModelId
  providerModel: string
  reasoningEffort: "low" | "medium" | "high" | "xhigh"
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type DexterUsage = {
  periodStart: string
  periodEnd: string
  planCode: "25" | "50" | "75" | "enterprise"
  currency: "GBP"
  includedUsageGbp: number
  usageGbp: number
  includedUsageRemainingGbp: number
  includedUsagePercent: number
  extraUsageConfigured: boolean
  billingReady: boolean
  extraUsageEnabled: boolean
  extraUsageGbp: number
  extraUsageLimitGbp: number | null
  extraUsageRemainingGbp: number | null
  usageStatus: "unused" | "included" | "near_limit" | "extra_usage" | "paused" | "extra_limit_reached"
  usageAllowed: boolean
  /** Legacy action allowance retained while older tenant functions roll forward. */
  includedActionsLimit: number
  actionsUsed: number
  trackedActions: number
  conversationCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  modelBreakdown: DexterModelUsage[]
  trend: DexterUsageTrendPoint[]
  recentEntries: DexterUsageEntry[]
}

export type DexterMessageAttachment = {
  id: string
  type: string
  title: string
  provider?: "gmail" | "outlook"
  mailboxId?: string
  threadId?: string
  messageId?: string
  subject?: string
  fileName?: string
  mimeType?: string
  sizeBytes?: number
  sourceUrl?: string
}

export type DexterUploadedDocument = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

export type DexterWatchEmailContext = {
  kind: "email"
  availability: "available" | "removed" | "reconnect_required" | "unavailable"
  messageId: string
  threadId: string
  mailboxId: string
  provider: "gmail" | "outlook"
  senderName: string
  senderEmail: string
  subject: string
  receivedAt: string
  preview: string
  sourceUrl: string
  attachments: DexterEmailAttachment[]
  unavailableReason?: string | null
}

export type DexterWatchEvent = {
  id: string
  title: string
  body: string
  changed: Record<string, unknown>
  context?: DexterWatchEmailContext | null
  action?: DexterPendingAction | null
  readAt?: string | null
  createdAt: string
}

export type DexterWatch = {
  id: string
  title: string
  summary: string
  capability: "warehouse" | "leads" | "deals" | "quotes" | "email"
  status: "active" | "paused"
  targetLabel?: string | null
  rule: { field: string; operator: string; value?: string }
  action?: DexterPendingAction | null
  createdAt: string
  updatedAt: string
  lastEvaluatedAt?: string | null
  lastTriggeredAt?: string | null
  triggerCount: number
  healthStatus?: "starting" | "healthy" | "degraded" | "error"
  lastSourceCheckAt?: string | null
  lastSuccessfulCheckAt?: string | null
  healthMessage?: string | null
  latestEvent?: DexterWatchEvent | null
}

export type CreateDexterWatchResult =
  | { status: "created"; message: string; watch: DexterWatch }
  | { status: "clarification" | "unsupported"; message: string }

export type DexterAutomationProposal = {
  summary: string
  conditions: AutomationCondition[]
  actions: AutomationAction[]
}

export type SendDexterMessageInput = {
  conversationId?: string | null
  retryMessageId?: string | null
  parentResponseMessageId?: string | null
  historyMessageIds?: string[]
  message: string
  specialist: string
  model: DexterModelId
  locale: string
  clientSessionId: string
  fullAccessGrantId?: string | null
  preparedActionId?: string | null
  actionDecision?: "approve" | "decline" | null
  attachments: DexterMessageAttachment[]
}

export class DexterApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DexterApiError"
  }
}

const DEXTER_STREAM_TIMEOUT_MS = 120_000

function dexterConnectionError(error: unknown) {
  if (error instanceof DexterApiError) return error
  if (error instanceof Error && error.name === "AbortError") return error
  if (
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|fetch failed|networkerror|network request failed/i.test(error.message))
  ) {
    return new DexterApiError("Dexter could not reach the workspace service. Check your connection and retry.")
  }
  return error
}

export async function uploadDexterDocument(file: File) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new DexterApiError("Sign in again to upload a document to Dexter.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) {
    throw new DexterApiError("Dexter document uploads are not connected to this workspace.")
  }
  const form = new FormData()
  form.append("file", file, file.name)
  const response = await fetch(`${supabaseFunctionsUrl}/dexter-file-upload`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      apikey: supabasePublicApiKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: form,
  })
  if (!response.ok) {
    const fallback = "Dexter could not upload that document."
    try {
      const body = await response.json() as DexterFunctionErrorBody
      throw new DexterApiError(typeof body.message === "string" && body.message.trim() ? body.message : fallback)
    } catch (error) {
      if (error instanceof DexterApiError) throw error
      throw new DexterApiError(fallback)
    }
  }
  const body = await response.json() as { upload?: DexterUploadedDocument }
  if (!body.upload?.id || !body.upload.fileName) throw new DexterApiError("Dexter could not finish that upload.")
  return body.upload
}

type DexterFunctionErrorBody = {
  code?: unknown
  message?: unknown
}

async function dexterFunctionError(error: unknown, fallback: string) {
  let message = fallback
  let code = ""

  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as DexterFunctionErrorBody
      if (typeof body.code === "string") code = body.code.trim().toLowerCase()
      if (typeof body.message === "string" && body.message.trim()) message = body.message
    } catch {
      // Keep the safe product-facing fallback when the function response is not JSON.
    }
  } else if (error instanceof Error && error.message.trim()) {
    message = error.message
  }

  if (/failed to fetch|fetch failed|failed to send a request|networkerror|network request failed/i.test(message)) {
    message = "Dexter could not reach the workspace service. Check your connection and retry."
  }
  if (code === "invalid_operation") {
    message = "Refresh Multideck before continuing so Dexter can securely finish this request."
  }

  return new DexterApiError(message)
}

async function invokeDexter<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  if (!supabase) {
    throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  }

  const { data, error } = await supabase.functions.invoke<T>("agent-dexter", { body })
  if (error) throw await dexterFunctionError(error, fallback)
  if (data === null || data === undefined) throw new DexterApiError(fallback)
  return data
}

export async function listDexterConversations() {
  const result = await invokeDexter<{ conversations: DexterConversationSummary[] }>(
    { operation: "list-conversations" },
    "Dexter's conversation history is unavailable.",
  )
  return result.conversations
}

export async function getDexterConversation(conversationId: string) {
  const result = await invokeDexter<{ conversation: DexterConversation }>(
    { operation: "get-conversation", conversationId },
    "This conversation could not be loaded.",
  )
  return result.conversation
}

export async function getDexterUsage() {
  const result = await invokeDexter<{ usage: DexterUsage }>(
    { operation: "usage" },
    "Dexter usage is unavailable.",
  )
  return result.usage
}

export async function renameDexterConversation(conversationId: string, title: string) {
  const result = await invokeDexter<{ conversation: DexterConversationSummary }>(
    { operation: "rename-conversation", conversationId, title },
    "This conversation could not be renamed.",
  )
  return result.conversation
}

export async function deleteDexterConversation(conversationId: string) {
  await invokeDexter<{ deleted: true }>(
    { operation: "delete-conversation", conversationId },
    "This conversation could not be deleted.",
  )
}

export async function setDexterAccessMode(input: {
  conversationId: string | null
  clientSessionId: string
  mode: DexterAccessMode
}) {
  const result = await invokeDexter<{ access: DexterFullAccessGrant }>(
    { operation: "set-access-mode", ...input },
    "Dexter could not secure that access mode.",
  )
  return result.access
}

export async function recordDexterEmailDraftDelivery(messageId: string, sendRequestId: string) {
  if (!supabase) throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  const { data, error } = await supabase.rpc("multideck_dexter_record_email_draft_delivery", {
    p_message_id: messageId,
    p_send_request_id: sendRequestId,
  })
  if (error) throw new DexterApiError("The email was sent, but Dexter could not save its delivery status. Refresh the conversation to check it.")
  if (!data || typeof data !== "object") throw new DexterApiError("Dexter could not confirm the saved delivery status.")
  return data as DexterEmailDraftDelivery
}

export async function recordDexterProviderDraftDelivery(messageId: string, draftMessageId: string) {
  if (!supabase) throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  const { data, error } = await supabase.rpc("multideck_dexter_record_provider_draft_delivery", {
    p_message_id: messageId,
    p_draft_message_id: draftMessageId,
  })
  if (error) throw new DexterApiError("The provider draft was created, but Dexter could not save its status. Refresh the conversation to check it.")
  if (!data || typeof data !== "object") throw new DexterApiError("Dexter could not confirm the provider draft status.")
  return data as DexterEmailDraftDelivery
}

export async function duplicateSentDexterEmailDraft(messageId: string) {
  if (!supabase) throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  const { data, error } = await supabase.rpc("multideck_dexter_duplicate_sent_email_draft", {
    p_message_id: messageId,
  })
  if (error || !data || typeof data !== "object") {
    throw new DexterApiError("Dexter could not create an editable copy of this sent email.")
  }
  const result = data as { messageId?: unknown; draft?: unknown }
  if (typeof result.messageId !== "string" || !result.draft || typeof result.draft !== "object") {
    throw new DexterApiError("Dexter could not confirm the editable email copy.")
  }
  return { messageId: result.messageId, draft: result.draft as DexterEmailDraft }
}

export async function refineDexterEmailDraft(input: {
  messageId: string
  instruction: string
  draft: DexterEmailDraft
  selection: { start: number; end: number } | null
}) {
  if (!supabase) throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  const { data, error } = await supabase.functions.invoke<{ draft: DexterEmailDraft }>(
    "dexter-email-refine",
    { body: input },
  )
  if (error) {
    throw await dexterFunctionError(
      error,
      "Dexter could not refine this draft. Your current wording is unchanged.",
    )
  }
  if (!data?.draft || typeof data.draft !== "object") {
    throw new DexterApiError("Dexter could not confirm the refined draft.")
  }
  return data.draft
}

/**
 * Drafts directly inside Inbox without creating a hidden Dexter conversation.
 * The server re-authorises reply context and returns wording only; the normal
 * Inbox controls remain responsible for saving and sending.
 */
export async function prepareInboxDexterDraft(input: InboxDexterDraftInput) {
  if (!supabase) throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  const { data, error } = await supabase.functions.invoke<{
    draft: { subject: string; bodyText: string }
    model: string
    reasoningEffort: "low"
    personalised: boolean
  }>("dexter-email-compose", { body: input })
  if (error) {
    throw await dexterFunctionError(
      error,
      "Dexter could not draft this email. Your current wording is unchanged.",
    )
  }
  if (!data?.draft || typeof data.draft.subject !== "string" || typeof data.draft.bodyText !== "string") {
    throw new DexterApiError("Dexter could not confirm the email draft.")
  }
  return data
}

export async function updateDexterEmailDraft(messageId: string, draft: DexterEmailDraft) {
  if (!supabase) throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  const { data, error } = await supabase.rpc("multideck_dexter_update_email_draft", {
    p_message_id: messageId,
    p_draft: draft,
  })
  if (error || !data || typeof data !== "object") {
    throw new DexterApiError("Dexter could not save the email draft. Keep this conversation open and try again.")
  }
  return data as DexterEmailDraft
}

export async function refreshDexterPreparedEmailAction(messageId: string, preparedActionId: string) {
  await invokeDexter<{ refreshed: true }>(
    { operation: "refresh-prepared-email", messageId, preparedActionId },
    "Dexter could not secure the latest email edits. Nothing was sent or created.",
  )
}

export async function listDexterWatches() {
  const result = await invokeDexter<{ watches: DexterWatch[] }>(
    { operation: "list-watches" },
    "Dexter's watches are unavailable.",
  )
  return result.watches
}

export async function createDexterWatch(input: {
  message: string
  locale: string
  attachments: DexterMessageAttachment[]
}) {
  return invokeDexter<CreateDexterWatchResult>(
    { operation: "create-watch", ...input },
    "Dexter could not set up that watch.",
  )
}

export async function proposeContactCardAutomation(input: {
  cardId: string
  message: string
  locale: string
}) {
  const result = await invokeDexter<{ proposal: Omit<DexterAutomationProposal, "conditions" | "actions"> & {
    conditions: Omit<AutomationCondition, "id" | "enabled">[]
    actions: Omit<AutomationAction, "id" | "enabled">[]
  } }>(
    { operation: "propose-contact-card-automation", ...input },
    "Dexter could not suggest automation steps.",
  )

  return {
    summary: result.proposal.summary,
    conditions: result.proposal.conditions.map((condition) => ({ ...condition, id: crypto.randomUUID(), enabled: true })),
    actions: result.proposal.actions.map((action) => ({ ...action, id: crypto.randomUUID(), enabled: true })),
  } satisfies DexterAutomationProposal
}

export async function setDexterWatchStatus(watchId: string, status: "active" | "paused") {
  await invokeDexter<{ updated: true }>(
    { operation: "set-watch-status", watchId, status },
    "That watch could not be updated.",
  )
}

export async function deleteDexterWatch(watchId: string) {
  await invokeDexter<{ deleted: true }>(
    { operation: "delete-watch", watchId },
    "That watch could not be deleted.",
  )
}

export async function sendDexterMessage(input: SendDexterMessageInput) {
  const result = await invokeDexter<{ conversation: DexterConversation }>(
    { operation: "message", ...input },
    "Dexter could not answer this request.",
  )
  return result.conversation
}

export async function streamDexterMessage(
  input: SendDexterMessageInput,
  handlers: ((delta: string) => void) | {
    onAnswerDelta?: (delta: string) => void
    onReasoningDelta?: (delta: string) => void
    onPendingAction?: (action: DexterPendingAction) => void
    onEmailAttachment?: (attachment: DexterEmailAttachment) => void
  },
  signal?: AbortSignal,
  // Declared explicitly: `completed` is only ever assigned inside the event
  // closure, which control-flow analysis cannot see, so an inferred return type
  // collapses to `never` at the call site.
): Promise<DexterConversation> {
  if (signal?.aborted) throw new DOMException("The Dexter request was cancelled.", "AbortError")
  const onAnswerDelta = typeof handlers === "function" ? handlers : handlers.onAnswerDelta
  const onReasoningDelta = typeof handlers === "function" ? undefined : handlers.onReasoningDelta
  const onPendingAction = typeof handlers === "function" ? undefined : handlers.onPendingAction
  const onEmailAttachment = typeof handlers === "function" ? undefined : handlers.onEmailAttachment
  const session = await getSupabaseSession()
  if (signal?.aborted) throw new DOMException("The Dexter request was cancelled.", "AbortError")
  if (!session?.access_token) {
    throw new DexterApiError("Sign in again to use Agent Dexter.")
  }
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) {
    throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  }

  const requestController = new AbortController()
  let timedOut = false
  const forwardAbort = () => requestController.abort(signal?.reason)
  signal?.addEventListener("abort", forwardAbort, { once: true })
  const timeout = window.setTimeout(() => {
    timedOut = true
    requestController.abort()
  }, DEXTER_STREAM_TIMEOUT_MS)

  const requestBody = JSON.stringify({ operation: "message", stream: true, ...input })
  const openStream = (accessToken: string) => fetch(`${supabaseFunctionsUrl}/agent-dexter`, {
    method: "POST",
    signal: requestController.signal,
    headers: {
      Accept: "text/event-stream",
      apikey: supabasePublicApiKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: requestBody,
  })

  try {
    let response = await openStream(session.access_token)

    // A long-lived Dexter tab can cross an access-token boundary between
    // sequential sends. A 401 is safe to retry once because the function has
    // rejected the request before processing it; every other failure remains
    // an explicit operator retry so a write can never be replayed implicitly.
    if (response.status === 401 && !requestController.signal.aborted && supabase) {
      const { data, error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError || !data.session?.access_token) {
        throw new DexterApiError("Your session has expired. Sign in again to use Agent Dexter.")
      }
      response = await openStream(data.session.access_token)
    }

    if (!response.ok) {
      const fallback = response.status === 401
        ? "Your session has expired. Sign in again to use Agent Dexter."
        : "Dexter could not open the response stream."
      try {
        const body = await response.clone().json() as DexterFunctionErrorBody
        throw new DexterApiError(typeof body.message === "string" && body.message.trim() ? body.message : fallback)
      } catch (error) {
        if (error instanceof DexterApiError) throw error
        throw new DexterApiError(fallback)
      }
    }
    if (!response.body) {
      throw new DexterApiError("Dexter's response stream could not be opened.")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let completed: DexterConversation | null = null
    const streamedEmailAttachments = new Map<string, DexterEmailAttachment>()

    const processEvent = (eventBlock: string) => {
      const lines = eventBlock.split("\n")
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
      if (!data) return

      let payload: unknown
      try {
        payload = JSON.parse(data)
      } catch {
        return
      }
      if (typeof payload !== "object" || payload === null) return

      if ("type" in payload && payload.type === "delta" && "delta" in payload && typeof payload.delta === "string") {
        onAnswerDelta?.(payload.delta)
      } else if ("type" in payload && payload.type === "reasoning_delta" && "delta" in payload && typeof payload.delta === "string") {
        onReasoningDelta?.(payload.delta)
      } else if (
        "type" in payload &&
        payload.type === "pending_action" &&
        "pendingAction" in payload &&
        typeof payload.pendingAction === "object" &&
        payload.pendingAction !== null
      ) {
        onPendingAction?.(payload.pendingAction as DexterPendingAction)
      } else if (
        "type" in payload &&
        payload.type === "email_attachment" &&
        "attachment" in payload &&
        typeof payload.attachment === "object" &&
        payload.attachment !== null
      ) {
        const attachment = payload.attachment as DexterEmailAttachment
        streamedEmailAttachments.set(attachment.id, attachment)
        onEmailAttachment?.(attachment)
      } else if ("type" in payload && payload.type === "complete" && "conversation" in payload) {
        completed = retainStreamedEmailAttachments(
          payload.conversation as DexterConversation,
          [...streamedEmailAttachments.values()],
        )
      } else if ("type" in payload && payload.type === "error") {
        const message = "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "Dexter's response was interrupted. Try again in a moment."
        throw new DexterApiError(message)
      }
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n")

        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          processEvent(buffer.slice(0, boundary))
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf("\n\n")
        }

        if (done) break
      }
      if (buffer.trim()) processEvent(buffer)
    } finally {
      reader.releaseLock()
    }

    if (!completed) {
      throw new DexterApiError("Dexter's response ended before it was saved.")
    }
    return completed
  } catch (error) {
    if (signal?.aborted) throw new DOMException("The Dexter request was cancelled.", "AbortError")
    if (timedOut) {
      throw new DexterApiError("Dexter took too long to answer. Your message is safe — retry when you are ready.")
    }
    throw dexterConnectionError(error)
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener("abort", forwardAbort)
  }
}
