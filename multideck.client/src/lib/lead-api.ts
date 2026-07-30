import { apiFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type ApiLead = {
  id: string
  companyName: string
  initials: string
  primaryContactName: string | null
  primaryContactEmail: string | null
  countryCode: string | null
  sourceCode: string
  sourceName: string
  ownerId: string | null
  ownerName: string | null
  ownerInitials: string | null
  statusCode: string
  statusName: string
  isOpen: boolean
  isConverted: boolean
  isDisqualified: boolean
  ratingCode: string
  ratingName: string
  qualificationScore: number | null
  qualificationCriteriaMet: number
  conversionProbability: number | null
  lastActivityAt: string | null
  lastActivitySubject: string | null
  nextFollowUpAt: string | null
  createdAt: string
  valueAmount: number | null
  valueCurrencyCode: string | null
  valueContext: string | null
  tradeLane: string | null
  serviceInterest: string | null
  openOpportunityCount: number
}

export type ApiLeadCompany = {
  organisationId: string | null
  email: string | null
  website: string | null
  phone: string | null
  address: string | null
}

export type ApiLeadContact = {
  id: string
  name: string | null
  initials: string
  roleCode: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  lastContactAt: string | null
}

export type ApiLeadActivity = {
  id: string
  typeCode: string
  subject: string
  summary: string | null
  activityAt: string
}

type ApiLeadDetailResponse = {
  lead: ApiLead
  company: ApiLeadCompany
  contacts: ApiLeadContact[]
  activities: ApiLeadActivity[]
}

export type ApiLeadDetail = ApiLead & {
  company: ApiLeadCompany
  contacts: ApiLeadContact[]
  activities: ApiLeadActivity[]
}

export class LeadApiError extends Error {}

async function readLeadResponse<T>(response: Response, fallback: string) {
  if (response.ok) return response.json() as Promise<T>

  let message = `${response.status} ${response.statusText}`.trim()
  try {
    const problem = await response.json()
    message = problem.detail || problem.title || message
  } catch {
    // Keep the HTTP status fallback for non-JSON failures.
  }
  throw new LeadApiError(message || fallback)
}

async function authorizedLeadRequest(path: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new LeadApiError("Sign in again to view CRM leads.")

  try {
    return await apiFetch(path, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch (error) {
    throw new LeadApiError(
      "The CRM service could not be reached. Check that the local API is running and try again.",
      { cause: error },
    )
  }
}

export async function listLeads(search?: string) {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""
  const response = await authorizedLeadRequest(`/api/v1/crm/leads${query}`)
  return readLeadResponse<ApiLead[]>(response, "We could not load CRM leads.")
}

export async function getLead(leadId: string) {
  const response = await authorizedLeadRequest(`/api/v1/crm/leads/${encodeURIComponent(leadId)}`)
  const detail = await readLeadResponse<ApiLeadDetailResponse>(response, "We could not load this lead.")
  return {
    ...detail.lead,
    company: detail.company,
    contacts: detail.contacts,
    activities: detail.activities,
  } satisfies ApiLeadDetail
}
