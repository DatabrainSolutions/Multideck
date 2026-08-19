import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type ScreeningOutcome = "clear" | "possible_match" | "match" | "unavailable"

export type ScreeningListStatus = {
  loaded: boolean
  sourceCode?: string
  sourceName?: string
  publisher?: string
  snapshotId?: string | null
  downloadedAt?: string | null
  checkedAt?: string | null
  lastAttemptAt?: string | null
  lastSuccessAt?: string | null
  lastError?: string | null
  entryCount?: number
  groupCount?: number
  stale?: boolean
}

export type ScreeningMatch = {
  id?: string
  groupId: string
  listedName: string
  matchKind: "exact" | "similar"
  score: number
  regime: string | null
  groupType: string | null
  listedOn: string | null
  ukRef: string | null
  country: string | null
  listingNotes?: string | null
}

export type ScreeningCheck = {
  id: string
  subjectName: string
  country?: string | null
  orgId?: string | null
  outcome: ScreeningOutcome
  matchCount: number
  totalCount?: number
  listStale: boolean
  listAgeHours: number | null
  createdAt: string
  matches?: ScreeningMatch[]
}

export type ScreeningWorkspace = {
  list: ScreeningListStatus
  checks: ScreeningCheck[]
}

export class ScreeningApiError extends Error {}

async function screeningRequest(path: string, init: RequestInit = {}) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new ScreeningApiError("Sign in again to use party screening.")
  const response = await edgeFetch("screening", path, session.access_token, init)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const body = await response.json()
      message = body.detail || body.message || message
    } catch {
      /* keep status text */
    }
    throw new ScreeningApiError(message)
  }
  if (response.status === 204) return null
  return response.json()
}

export async function getScreeningWorkspace(orgId?: string) {
  const query = orgId?.trim() ? `?orgId=${encodeURIComponent(orgId.trim())}` : ""
  return screeningRequest(query) as Promise<ScreeningWorkspace>
}

export async function runScreeningCheck(input: { subjectName: string; country?: string | null; orgId?: string | null }) {
  return screeningRequest("checks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<ScreeningCheck>
}

export async function getScreeningCheck(checkId: string) {
  return screeningRequest(`checks/${encodeURIComponent(checkId)}`) as Promise<ScreeningCheck>
}

export async function refreshScreeningList() {
  return screeningRequest("refresh", { method: "POST" }) as Promise<{ list: ScreeningListStatus }>
}
