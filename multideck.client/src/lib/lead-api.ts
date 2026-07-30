import { callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"

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

export type ApiLeadDetail = ApiLead & {
  company: ApiLeadCompany
  contacts: ApiLeadContact[]
  activities: ApiLeadActivity[]
}

export class LeadApiError extends CrmSupabaseError {}

export async function listLeads(search?: string) {
  return callCrmRpc<ApiLead[]>(
    "multideck_crm_list_leads",
    { p_search: search?.trim() || null },
    "We could not load CRM leads.",
    "Sign in again to view CRM leads.",
  )
}

export async function getLead(leadId: string) {
  return callCrmRpc<ApiLeadDetail>(
    "multideck_crm_get_lead",
    { p_lead_id: leadId },
    "We could not load this lead.",
    "Sign in again to view CRM leads.",
  )
}
