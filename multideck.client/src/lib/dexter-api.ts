import { apiFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type DexterConversationSummary = {
  id: string
  title: string
  summary: string
  updatedAt: string
}

export type DexterMessage = {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  createdAt: string
}

export type DexterConversation = DexterConversationSummary & {
  messages: DexterMessage[]
}

export type DexterMessageAttachment = {
  id: string
  type: string
  title: string
}

export type SendDexterMessageInput = {
  conversationId?: string | null
  message: string
  specialist: string
  attachments: DexterMessageAttachment[]
}

export class DexterApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DexterApiError"
  }
}

async function requestDexter<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new DexterApiError("Sign in again to use Agent Dexter.")
  }

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${session.access_token}`)
  if (init.body !== undefined) headers.set("Content-Type", "application/json")

  const response = await apiFetch(path, { ...init, headers })
  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      throw new DexterApiError(problem.detail || problem.title || problem.message || fallback)
    } catch (error) {
      if (error instanceof DexterApiError) throw error
      throw new DexterApiError(fallback)
    }
  }

  return response.json() as Promise<T>
}

export function listDexterConversations() {
  return requestDexter<DexterConversationSummary[]>("/api/v1/agent-dexter/conversations")
}

export function getDexterConversation(conversationId: string) {
  return requestDexter<DexterConversation>(`/api/v1/agent-dexter/conversations/${conversationId}`)
}

export function sendDexterMessage(input: SendDexterMessageInput) {
  return requestDexter<DexterConversation>("/api/v1/agent-dexter/messages", {
    method: "POST",
    body: JSON.stringify(input),
  })
}
