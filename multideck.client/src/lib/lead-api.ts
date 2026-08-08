import { callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
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
  pendingTransfer?: CrmLeadTransferRequest | null
  marketingOptIn?: boolean
  marketingConsentSource?: string | null
  marketingConsentUpdatedAt?: string | null
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
  marketingOptIn?: boolean
  marketingConsentSource?: string | null
  marketingConsentUpdatedAt?: string | null
}

export type ApiLeadActivity = {
  id: string
  typeCode: string
  subject: string
  summary: string | null
  activityAt: string
}

export type ApiLeadDetail = ApiLead & {
  address?: {
    line1?: string
    line2?: string
    townCity?: string
    countyState?: string
    postZipCode?: string
    countryCode?: string
  } | null
  company: ApiLeadCompany
  contacts: ApiLeadContact[]
  activities: ApiLeadActivity[]
}

export type CrmDashboardFollowUp = {
  id: string
  companyName: string
  decisionMaker: string | null
  email: string | null
  location: string | null
  lastContactAt: string | null
  previousConversation: string | null
  laneContext: string | null
  nextActionAt: string | null
  stage: string
  opportunityValue: number | null
  currencyCode: string
  contactAgeDays: number | null
  neverContacted: boolean
}

export type CrmDashboardData = {
  summary: {
    openLeads: number
    staleLeads: number
    openDeals: number
    pipelineValue: number
    currencyCode: string
    dueFollowUps: number
  }
  areas: Array<{ key: string; label: string; count: number }>
  followUps: CrmDashboardFollowUp[]
  pipeline: Array<{ stageId: string; stage: string; pipeline: string; count: number; value: number; currencyCode: string | null }>
  activity: Array<{ id: string; leadId: string | null; dealId: string | null; subject: string; summary: string | null; at: string }>
}

export type CrmFollowUpReason = "reply_due" | "first_follow_up" | "second_follow_up" | "scheduled_due" | "never_contacted"

export type CrmFollowUpOpportunity = {
  id: string
  source: "email" | "activity"
  threadId: string | null
  mailboxId: string | null
  recordType: "lead" | "contact" | "account" | "unmatched"
  recordId: string | null
  companyName: string | null
  personName: string | null
  email: string | null
  subject: string
  context: string | null
  lastActivityAt: string
  lastDirection: "inbound" | "outbound" | null
  reasonCode: CrmFollowUpReason
  dueAt: string
  daysWaiting: number
  stage: string
  location: string | null
  canCreate: boolean
  outboundAttempts: number
}

export type CrmFollowUpData = {
  generatedAt: string
  cadence: { firstFollowUpDays: number; secondFollowUpDays: number }
  summary: { total: number; repliesDue: number; awaitingReply: number; notInCrm: number }
  items: CrmFollowUpOpportunity[]
}

export type CrmTransferUser = { id: string; name: string; email: string; isCurrentUser: boolean }

export type CrmLeadTransferRequest = {
  id: string
  leadId: string
  leadName: string
  requesterId: string
  requesterName: string
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  status: "pending" | "approved" | "declined" | "cancelled" | "superseded"
  requestNote: string | null
  decisionReason: string | null
  requestedAt: string
  decidedAt: string | null
  canDecide: boolean
}

export class LeadApiError extends CrmSupabaseError {}

export async function listLeads(search?: string, options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new LeadApiError("Sign in again to view CRM leads.")
  const normalizedSearch = search?.trim() ?? ""
  return readCachedCrmResource(
    session.user.id,
    `leads:${normalizedSearch.toLocaleLowerCase()}`,
    () => callCrmRpc<ApiLead[]>(
      "multideck_crm_list_leads_essential",
      { p_search: normalizedSearch || null },
      "Unable to load CRM leads. Check your connection and try again.",
      "Sign in again to view CRM leads.",
    ),
    options,
  )
}

export async function getLead(leadId: string) {
  return callCrmRpc<ApiLeadDetail>(
    "multideck_crm_get_lead_essential",
    { p_lead_id: leadId },
    "Unable to load this lead. Check your connection and try again.",
    "Sign in again to view CRM leads.",
  )
}

export type UpdateLeadInput = Partial<{
  companyName: string
  primaryContactName: string | null
  primaryContactEmail: string | null
  countryCode: string | null
  tradeLane: string | null
  serviceInterest: string | null
  valueAmount: number | null
  valueCurrencyCode: string | null
  nextFollowUpAt: string | null
}>

/**
 * Writes only the keys given, so one inline field saves on its own without the
 * client having to send — and risk overwriting — every neighbouring value.
 */
export async function updateLead(leadId: string, input: UpdateLeadInput) {
  const lead = await callCrmRpc<ApiLead>(
    "multideck_crm_update_lead",
    { p_lead_id: leadId, p_input: input },
    "This lead could not be saved.",
    "Sign in again to manage CRM leads.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["leads:"])
  return lead
}

export async function getCrmDashboard(inactivityDays: 30 | 90 | 180, area?: string | null) {
  return callCrmRpc<CrmDashboardData>(
    "multideck_crm_get_dashboard",
    { p_inactivity_days: inactivityDays, p_area: area || null },
    "The CRM dashboard could not be loaded.",
    "Sign in again to view the CRM dashboard.",
  )
}

export async function getCrmFollowUpOpportunities(area?: string | null) {
  return callCrmRpc<CrmFollowUpData>(
    "multideck_crm_get_follow_up_opportunities",
    { p_area: area || null },
    "Follow-up opportunities could not be loaded.",
    "Sign in again to review follow-up opportunities.",
  )
}

export async function createFollowUpLead(input: {
  email: string
  personName?: string | null
  companyName?: string | null
  threadId?: string | null
  address?: {
    line1?: string | null
    line2?: string | null
    townCity?: string | null
    countyState?: string | null
    postZipCode?: string | null
    countryCode?: string | null
  } | null
}) {
  const lead = await callCrmRpc<ApiLead>(
    "multideck_crm_create_follow_up_lead",
    {
      p_email: input.email,
      p_person_name: input.personName || null,
      p_company_name: input.companyName || null,
      p_thread_id: input.threadId || null,
      p_address: input.address || {},
    },
    "This lead could not be created.",
    "Sign in again to create this lead.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["leads:"])
  return lead
}

export async function listCrmTransferUsers() {
  return callCrmRpc<CrmTransferUser[]>("multideck_crm_list_transfer_users", undefined, "CRM users could not be loaded.", "Sign in again to manage lead ownership.")
}

export async function listLeadTransferRequests(leadId?: string) {
  return callCrmRpc<CrmLeadTransferRequest[]>("multideck_crm_list_transfer_requests", { p_lead_id: leadId || null }, "Lead transfer requests could not be loaded.", "Sign in again to manage lead ownership.")
}

export async function requestLeadTransfer(leadId: string, note?: string) {
  return callCrmRpc<CrmLeadTransferRequest>("multideck_crm_request_lead_transfer", { p_lead_id: leadId, p_note: note?.trim() || null }, "This ownership request could not be created.", "Sign in again to manage lead ownership.")
}

export async function decideLeadTransfer(requestId: string, decision: "approved" | "declined", reason?: string) {
  return callCrmRpc<ApiLead | CrmLeadTransferRequest>("multideck_crm_decide_lead_transfer", { p_request_id: requestId, p_decision: decision, p_reason: reason?.trim() || null }, "This ownership request could not be updated.", "Sign in again to manage lead ownership.")
}

export async function cancelLeadTransfer(requestId: string) {
  return callCrmRpc<CrmLeadTransferRequest>("multideck_crm_cancel_lead_transfer", { p_request_id: requestId }, "This ownership request could not be cancelled.", "Sign in again to manage lead ownership.")
}

export async function transferLead(leadId: string, targetUserId: string, reason?: string) {
  const lead = await callCrmRpc<ApiLead>("multideck_crm_transfer_lead", { p_lead_id: leadId, p_target_user_id: targetUserId, p_reason: reason?.trim() || null }, "This lead could not be transferred.", "Sign in again to manage lead ownership.")
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["leads:"])
  return lead
}
