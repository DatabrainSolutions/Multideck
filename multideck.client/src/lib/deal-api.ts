import { apiFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type ApiDealOption = {
  code: string
  name: string
  description: string | null
}

export type ApiDealConversionOptions = {
  opportunityTypes: ApiDealOption[]
}

export type ConvertLeadToDealInput = {
  name: string
  opportunityTypeCode: string
  primaryContactId: string | null
  expectedCloseDate: string
  expectedValueAmount: number | null
  expectedMarginAmount: number | null
  currencyCode: string | null
  probabilityPct: number
  modeCode: string | null
  directionCode: string | null
  originName: string | null
  destinationName: string | null
  tradeLane: string | null
  serviceInterest: string | null
  customerNeed: string
  valueProposition: string | null
  nextActionDueAt: string
  conversionNotes: string | null
}

export type ApiDeal = {
  id: string
  organisationId: string
  companyName: string
  sourceLeadId: string
  name: string
  pipelineId: string
  pipelineName: string
  pipelineStageId: string
  pipelineStageName: string
  opportunityTypeCode: string
  opportunityTypeName: string
  stageCode: string
  stageName: string
  statusCode: string
  statusName: string
  primaryContactId: string | null
  primaryContactName: string | null
  ownerId: string | null
  ownerName: string | null
  expectedCloseDate: string | null
  expectedValueAmount: number | null
  expectedMarginAmount: number | null
  currencyCode: string | null
  probabilityPct: number | null
  modeCode: string | null
  directionCode: string | null
  originName: string | null
  destinationName: string | null
  tradeLane: string | null
  serviceInterest: string | null
  customerNeed: string | null
  valueProposition: string | null
  nextActionDueAt: string | null
  createdAt: string
  wasAlreadyConverted: boolean
}

export class DealApiError extends Error {}

async function authorizedDealRequest(path: string, init?: RequestInit) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new DealApiError("Sign in again to manage CRM deals.")

  try {
    return await apiFetch(path, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    throw new DealApiError("The CRM service could not be reached. Try again.", { cause: error })
  }
}

async function readDealResponse<T>(response: Response, fallback: string) {
  if (response.ok) return response.json() as Promise<T>

  let message = fallback
  try {
    const problem = await response.json()
    message = problem.detail || problem.title || message
  } catch {
    // Keep the product-safe fallback when the server does not return ProblemDetails.
  }
  throw new DealApiError(message)
}

export async function getDealConversionOptions() {
  const response = await authorizedDealRequest("/api/v1/crm/deals/conversion-options")
  return readDealResponse<ApiDealConversionOptions>(response, "Deal options could not be loaded.")
}

export async function convertLeadToDeal(leadId: string, input: ConvertLeadToDealInput) {
  const response = await authorizedDealRequest(`/api/v1/crm/deals/from-lead/${encodeURIComponent(leadId)}`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  return readDealResponse<ApiDeal>(response, "This lead could not be converted.")
}

export async function listDeals() {
  const response = await authorizedDealRequest("/api/v1/crm/deals")
  return readDealResponse<ApiDeal[]>(response, "CRM deals could not be loaded.")
}

export async function moveDealStage(dealId: string, pipelineId: string, pipelineStageId: string) {
  const response = await authorizedDealRequest(`/api/v1/crm/deals/${encodeURIComponent(dealId)}/stage`, {
    method: "PUT",
    body: JSON.stringify({ pipelineId, pipelineStageId }),
  })
  return readDealResponse<ApiDeal>(response, "This deal could not be moved.")
}
