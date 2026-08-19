import { edgeFetch } from "@/lib/api"
import { readCachedRegisterPage } from "@/lib/application-data-api"

export type BroadcastAudienceMode = "all" | "departments" | "users"

export type BroadcastDepartment = { id: string; name: string; isActive: boolean }
export type BroadcastUser = {
  id: string
  name: string
  email: string
  authUserId: string | null
  accessStatus: string | null
  departments: BroadcastDepartment[]
}

export type BroadcastAudience = {
  mode: BroadcastAudienceMode
  departmentIds: string[]
  departmentNames?: string[]
  userIds: string[]
  selectedCount?: number
  recipientCount?: number
  excludedCount?: number
}

export type BroadcastRecipient = BroadcastUser & { status: "ready" | "excluded"; exclusionReason: string | null }

export type BroadcastHistoryItem = {
  id: string
  subject: string
  body: string
  audienceMode: BroadcastAudienceMode
  audience: BroadcastAudience
  status: "draft" | "sending" | "sent" | "partially_failed" | "failed"
  idempotencyKey: string
  recipientCount: number
  excludedCount: number
  deliveredCount: number
  failedCount: number
  deliveryMode: "live" | null
  error: string | null
  createdAt: string
  sentAt: string | null
}

export type BroadcastState = {
  departments: BroadcastDepartment[]
  users: BroadcastUser[]
  usersDeferred?: boolean
  history: BroadcastHistoryItem[]
  historyTotal?: number
  historyOffset?: number
  historyLimit?: number
  historyHasMore?: boolean
  deliveryProvider: "resend"
  deliveryConfigured: boolean
  sender: { from: string; replyTo: string }
}

export type BroadcastUserPage = {
  rows: BroadcastUser[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  compatibilityMode?: boolean
}

type BroadcastPreview = { audience: Required<Pick<BroadcastAudience, "mode" | "departmentIds" | "userIds">> & { departmentNames: string[]; selectedCount: number; recipientCount: number; excludedCount: number }; recipients: BroadcastRecipient[]; emailPreview: { html: string; text: string } | null }

async function responseJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const payload = await response.json().catch(() => null) as { detail?: string } | null
  throw new Error(payload?.detail || "The broadcast request could not be completed.")
}

export async function getBroadcastState(
  accessToken: string,
  input: { historyLimit?: number; historyOffset?: number } = {},
) {
  const historyLimit = Math.max(1, Math.min(Math.trunc(input.historyLimit ?? 20), 50))
  const historyOffset = Math.max(0, Math.min(Math.trunc(input.historyOffset ?? 0), 1_000_000))
  const raw = await responseJson<BroadcastState>(await edgeFetch(
    "developer-broadcasts",
    `?historyLimit=${historyLimit}&historyOffset=${historyOffset}`,
    accessToken,
  ))
  const allHistory = Array.isArray(raw.history) ? raw.history : []
  if (!Number.isFinite(Number(raw.historyTotal)) || raw.usersDeferred !== true) {
    throw new Error("Paged broadcast history and user search are still being prepared. Try again shortly.")
  }
  return {
    ...raw,
    users: [],
    history: allHistory,
    historyTotal: Math.max(allHistory.length, Number(raw.historyTotal)),
    historyOffset: Number.isFinite(Number(raw.historyOffset)) ? Math.max(0, Number(raw.historyOffset)) : historyOffset,
    historyLimit: Number.isFinite(Number(raw.historyLimit)) ? Math.max(1, Number(raw.historyLimit)) : historyLimit,
    historyHasMore: raw.historyHasMore === true,
  }
}

export async function listBroadcastUsersPage(
  accessToken: string,
  input: { query?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
) {
  const query = input.query?.trim().slice(0, 200) ?? ""
  const limit = Math.max(1, Math.min(Math.trunc(input.limit ?? 25), 50))
  const offset = Math.max(0, Math.min(Math.trunc(input.offset ?? 0), 1_000_000))
  const resource = `broadcast:user-page:${query.toLocaleLowerCase()}:${limit}:${offset}`
  return readCachedRegisterPage(accessToken, resource, async (requestSignal) => {
    const path = `/users?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`
    const result = await responseJson<{ userPage: BroadcastUserPage }>(await edgeFetch(
      "developer-broadcasts",
      path,
      accessToken,
      { signal: requestSignal },
    ))
    const rows = Array.isArray(result.userPage?.rows) ? result.userPage.rows : []
    return {
      ...result.userPage,
      rows,
      total: Math.max(rows.length, Number(result.userPage?.total) || 0),
      offset: Number.isFinite(Number(result.userPage?.offset)) ? Math.max(0, Number(result.userPage.offset)) : offset,
      limit: Number.isFinite(Number(result.userPage?.limit)) ? Math.max(1, Number(result.userPage.limit)) : limit,
      hasMore: result.userPage?.hasMore === true,
    }
  }, signal)
}

export async function previewBroadcastAudience(accessToken: string, audience: BroadcastAudience, message?: { subject: string; body: string }) {
  return responseJson<BroadcastPreview>(await edgeFetch("developer-broadcasts", "/preview", accessToken, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience, ...message }),
  }))
}

export async function draftBroadcastWithAI(accessToken: string, payload: { direction: string; subject: string; body: string }) {
  return responseJson<{ draft: { subject: string; body: string }; model: "gpt-5.6-luna" }>(await edgeFetch("developer-broadcasts", "/ai-draft", accessToken, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }))
}

export async function saveBroadcastDraft(accessToken: string, payload: { id?: string; subject: string; body: string; audience: BroadcastAudience }) {
  return responseJson<{ draft: BroadcastHistoryItem; preview: BroadcastPreview }>(await edgeFetch("developer-broadcasts", "/drafts", accessToken, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }))
}

export async function sendBroadcast(accessToken: string, draft: BroadcastHistoryItem) {
  return responseJson<{ alreadyProcessed: boolean; broadcast: BroadcastHistoryItem }>(await edgeFetch("developer-broadcasts", `/send/${draft.id}`, accessToken, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: true, idempotencyKey: draft.idempotencyKey }),
  }))
}
