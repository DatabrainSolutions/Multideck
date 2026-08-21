import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type ICustomsConnectionState = {
  configured: boolean
  environment: "sandbox" | "production"
}

export type ICustomsSubmissionState = {
  status: string
  mrn: string | null
  lrn: string | null
  errorMessage: string | null
  issues: ICustomsProviderIssue[]
  attemptCount: number
  submittedAt: string | null
  acknowledgedAt: string | null
  completedAt: string | null
  updatedAt: string | null
}

export type ICustomsProviderIssue = {
  code: string
  message: string
  explanation: string | null
  dataElement: string | null
  elementName: string | null
  itemNumber: number | null
}

export type ICustomsDeclarationState = {
  id: string
  reference: string | null
  status: string
  correlationId: string | null
  hasCustomsDraft: boolean
  document: {
    available: boolean
    documentId: string | null
    fileName: string | null
    receivedAt: string | null
    mimeType: string | null
  }
  provider: ICustomsSubmissionState | null
}

export type ICustomsWorkspaceState = {
  declaration: ICustomsDeclarationState
  connection: ICustomsConnectionState
}

export type ICustomsCommoditySuggestion = {
  code: string
  description: string
  confidence: number | null
}

export type ICustomsCommodityCertificate = {
  code: string
  category: string
  type: string
  description: string
  guidance: string
  statement: string | null
  referenceRequired: boolean
  action: string | null
}

export type ICustomsCommodityDetail = {
  code: string
  description: string
  declarable: boolean
  validFrom: string | null
  validTo: string | null
  dutyRate: string | null
  vatOptions: Array<{ code: string; label: string; rate: string | null }>
  certificates: ICustomsCommodityCertificate[]
}

export type ICustomsValidation = {
  ready: boolean
  issues: string[]
}

type ProviderMutationResult = {
  declaration: ICustomsDeclarationState
  idempotentReplay: boolean
}

type CommoditySearchResponse = { suggestions: ICustomsCommoditySuggestion[]; source: string }
type CommodityDetailResponse = { detail: ICustomsCommodityDetail; source: string }

const COMMODITY_CACHE_TTL_MS = 15 * 60 * 1000
const commoditySearchCache = new Map<string, { expiresAt: number; value: CommoditySearchResponse }>()
const commodityDetailCache = new Map<string, { expiresAt: number; value: CommodityDetailResponse }>()
const pendingCommoditySearches = new Map<string, Promise<CommoditySearchResponse>>()
const pendingCommodityDetails = new Map<string, Promise<CommodityDetailResponse>>()

function cachedCommodityValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
  const cached = cache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return cached.value
}

export class ICustomsApiError extends Error {
  constructor(message: string, public issues: string[] = []) {
    super(message)
  }
}

async function parseError(response: Response) {
  try {
    const payload = await response.json() as { detail?: string; message?: string; issues?: unknown }
    return new ICustomsApiError(
      payload.detail || payload.message || `Customs service request failed (${response.status}).`,
      Array.isArray(payload.issues) ? payload.issues.filter((issue): issue is string => typeof issue === "string") : [],
    )
  } catch {
    return new ICustomsApiError(`Customs service request failed (${response.status}).`)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new ICustomsApiError("Sign in again to use the customs service.")
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set("Content-Type", "application/json")
  const response = await edgeFetch("icustoms-api", path, session.access_token, { ...init, headers })
  if (!response.ok) throw await parseError(response)
  return response.json() as Promise<T>
}

export function getICustomsDeclarationState(declarationId: string) {
  return request<ICustomsWorkspaceState>(`/declarations/${encodeURIComponent(declarationId)}`)
}

export function validateICustomsDeclaration(declarationId: string) {
  return request<ICustomsValidation>(`/declarations/${encodeURIComponent(declarationId)}/validate`, { method: "POST" })
}

export function saveICustomsProviderDraft(declarationId: string, idempotencyKey: string) {
  return request<ProviderMutationResult>(`/declarations/${encodeURIComponent(declarationId)}/provider-draft`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  })
}

export function startICustomsProviderDraft(declarationId: string, idempotencyKey: string) {
  return request<ProviderMutationResult>(`/declarations/${encodeURIComponent(declarationId)}/provider-draft-start`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  })
}

export function deleteICustomsProviderDraft(declarationId: string) {
  return request<{ deleted: true; providerDeleted: boolean }>(`/declarations/${encodeURIComponent(declarationId)}/provider-draft`, {
    method: "DELETE",
  })
}

export function submitICustomsDeclaration(declarationId: string, idempotencyKey: string) {
  return request<ProviderMutationResult>(`/declarations/${encodeURIComponent(declarationId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirm: true, idempotencyKey }),
  })
}

export function refreshICustomsDeclaration(declarationId: string) {
  return request<{ declaration: ICustomsDeclarationState }>(`/declarations/${encodeURIComponent(declarationId)}/refresh`, { method: "POST" })
}

export function searchICustomsCommodities(query: string, country = "GB") {
  const key = `${country.toUpperCase()}:${query.trim().toLocaleLowerCase("en-GB")}`
  const cached = cachedCommodityValue(commoditySearchCache, key)
  if (cached) return Promise.resolve(cached)
  const pending = pendingCommoditySearches.get(key)
  if (pending) return pending
  const search = request<CommoditySearchResponse>("/commodities/search", {
    method: "POST",
    body: JSON.stringify({ query, country }),
  }).then((value) => {
    commoditySearchCache.set(key, { expiresAt: Date.now() + COMMODITY_CACHE_TTL_MS, value })
    return value
  }).finally(() => {
    pendingCommoditySearches.delete(key)
  })
  pendingCommoditySearches.set(key, search)
  return search
}

export function getICustomsCommodityDetails(commodityCode: string, direction: "import" | "export") {
  const key = `${direction}:${commodityCode.replace(/\D/g, "")}`
  const cached = cachedCommodityValue(commodityDetailCache, key)
  if (cached) return Promise.resolve(cached)
  const pending = pendingCommodityDetails.get(key)
  if (pending) return pending
  const details = request<CommodityDetailResponse>("/commodities/details", {
    method: "POST",
    body: JSON.stringify({ commodityCode, direction }),
  }).then((value) => {
    commodityDetailCache.set(key, { expiresAt: Date.now() + COMMODITY_CACHE_TTL_MS, value })
    return value
  }).finally(() => {
    pendingCommodityDetails.delete(key)
  })
  pendingCommodityDetails.set(key, details)
  return details
}
