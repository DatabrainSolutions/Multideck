import type { DexterModelId } from "@/data/dexter-models"
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
}

export type DexterAccessMode = "approve" | "full"

export type DexterPendingAction = {
  id: string
  action: string
  title: string
  description: string
  arguments: Record<string, unknown>
  changes: Array<{ field: string; value: string }>
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

export type DexterUsage = {
  periodStart: string
  periodEnd: string
  includedActionsLimit: number
  actionsUsed: number
  trackedActions: number
  conversationCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  trend: DexterUsageTrendPoint[]
  recentEntries: DexterUsageEntry[]
}

export type DexterMessageAttachment = {
  id: string
  type: string
  title: string
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
  accessMode: DexterAccessMode
  approvedAction?: {
    action: string
    arguments: Record<string, unknown>
  } | null
  actionDecision?: "approve" | "decline" | null
  attachments: DexterMessageAttachment[]
}

export class DexterApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DexterApiError"
  }
}

type DexterFunctionErrorBody = {
  code?: unknown
  message?: unknown
}

async function dexterFunctionError(error: unknown, fallback: string) {
  let message = fallback

  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as DexterFunctionErrorBody
      if (typeof body.message === "string" && body.message.trim()) message = body.message
    } catch {
      // Keep the safe product-facing fallback when the function response is not JSON.
    }
  } else if (error instanceof Error && error.message.trim()) {
    message = error.message
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
  },
) {
  const onAnswerDelta = typeof handlers === "function" ? handlers : handlers.onAnswerDelta
  const onReasoningDelta = typeof handlers === "function" ? undefined : handlers.onReasoningDelta
  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new DexterApiError("Sign in again to use Agent Dexter.")
  }
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) {
    throw new DexterApiError("Agent Dexter is not connected to this workspace.")
  }

  const response = await fetch(`${supabaseFunctionsUrl}/agent-dexter`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      apikey: supabasePublicApiKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operation: "message", stream: true, ...input }),
  })
  if (!response.ok) {
    const fallback = "Dexter could not open the response stream."
    try {
      const body = await response.clone().json() as DexterFunctionErrorBody
      throw new DexterApiError(typeof body.message === "string" ? body.message : fallback)
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
    } else if ("type" in payload && payload.type === "complete" && "conversation" in payload) {
      completed = payload.conversation as DexterConversation
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
}
