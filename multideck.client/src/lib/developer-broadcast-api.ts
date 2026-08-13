import { edgeFetch } from "@/lib/api"

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
  history: BroadcastHistoryItem[]
  deliveryProvider: "resend"
  deliveryConfigured: boolean
  sender: { from: string; replyTo: string }
}

type BroadcastPreview = { audience: Required<Pick<BroadcastAudience, "mode" | "departmentIds" | "userIds">> & { departmentNames: string[]; selectedCount: number; recipientCount: number; excludedCount: number }; recipients: BroadcastRecipient[]; emailPreview: { html: string; text: string } | null }

async function responseJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const payload = await response.json().catch(() => null) as { detail?: string } | null
  throw new Error(payload?.detail || "The broadcast request could not be completed.")
}

export async function getBroadcastState(accessToken: string) {
  return responseJson<BroadcastState>(await edgeFetch("developer-broadcasts", "", accessToken))
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
