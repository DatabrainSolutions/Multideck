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
  hasCustomsDraft: boolean
  provider: ICustomsSubmissionState | null
}

export type ICustomsWorkspaceState = {
  declaration: ICustomsDeclarationState
  connection: ICustomsConnectionState
}

export type ICustomsValidation = {
  ready: boolean
  issues: string[]
}

type ProviderMutationResult = {
  declaration: ICustomsDeclarationState
  idempotentReplay: boolean
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

export function submitICustomsDeclaration(declarationId: string, idempotencyKey: string) {
  return request<ProviderMutationResult>(`/declarations/${encodeURIComponent(declarationId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirm: true, idempotencyKey }),
  })
}

export function refreshICustomsDeclaration(declarationId: string) {
  return request<{ declaration: ICustomsDeclarationState }>(`/declarations/${encodeURIComponent(declarationId)}/refresh`, { method: "POST" })
}
