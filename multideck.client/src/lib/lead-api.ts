import { callCrmMutation, callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
import { fallbackEngagementSignal, getCrmEngagementSignals, type CrmEngagementSignal } from "@/lib/crm-engagement"
import type { FollowUpRecommendationCode } from "@/lib/follow-up-recommendation"
import { getSupabaseSession, supabase } from "@/lib/supabase"

export type ApiLead = {
  id: string
  editVersion: number
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
  engagementSignal?: CrmEngagementSignal
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
  recordType: "lead" | "contact" | "account" | "deal" | "quote" | "unmatched"
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
  /** Optional during a migration rollout; the client uses a safe generic action until the RPC is upgraded. */
  recommendationCode?: FollowUpRecommendationCode
}

export type CrmFollowUpData = {
  generatedAt: string
  cadence: { firstFollowUpDays: number; secondFollowUpDays: number }
  summary: { total: number; repliesDue: number; awaitingReply: number; notInCrm: number }
  items: CrmFollowUpOpportunity[]
}

export type CrmTransferUser = { id: string; name: string; email: string; isCurrentUser: boolean }

export type CrmTransferUsersPage = {
  rows: CrmTransferUser[]
  total: number
  limit: number
  offset: number
  currentUser: CrmTransferUser | null
}

export type CrmTransferUsersPageInput = {
  search?: string
  excludeUserId?: string | null
  limit?: number
  offset?: number
}

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

export type CrmRegisterSort = { id: string; direction: "asc" | "desc" }

export type LeadRegisterPage = {
  rows: ApiLead[]
  total: number
  summary: {
    leads: number
    open: number
    converted: number
    disqualified: number
    unassigned: number
    dueFollowUps: number
    valued: number
    recent: number
    qualified: number
    estimatedValue: number
  }
  facets: {
    statuses: Array<{ code: string; name: string }>
    sources: Array<{ code: string; name: string }>
    ratings: Array<{ code: string; name: string }>
    owners: Array<{ id: string; name: string }>
    hasUnassigned: boolean
  }
}

export type LeadRegisterInput = {
  search?: string
  statusCode?: string
  ownerId?: string
  unassigned?: boolean
  sourceCode?: string
  ratingCode?: string
  followUpScope?: "overdue" | "scheduled" | "unscheduled"
  valueScope?: "valued" | "unvalued"
  openOnly?: boolean
  sort?: CrmRegisterSort | null
  limit: number
  offset: number
}

function missingRegisterRpc(error: { code?: string; message?: string }) {
  return ["42883", "PGRST202"].includes(error.code ?? "")
    || /schema cache.*function|function .* does not exist|could not find the function/i.test(error.message ?? "")
}

function leadRegisterFallback(rows: ApiLead[], input: LeadRegisterInput): LeadRegisterPage {
  const term = input.search?.trim().toLocaleLowerCase() ?? ""
  const base = rows
  const filtered = base.filter((lead) => {
    if (term && ![
      lead.companyName, lead.primaryContactName, lead.primaryContactEmail, lead.sourceName, lead.ownerName,
      lead.tradeLane, lead.serviceInterest,
    ].some((value) => value?.toLocaleLowerCase().includes(term))) return false
    if (input.statusCode && lead.statusCode !== input.statusCode) return false
    if (input.ownerId && lead.ownerId !== input.ownerId) return false
    if (input.unassigned && lead.ownerId !== null) return false
    if (input.sourceCode && lead.sourceCode !== input.sourceCode) return false
    if (input.ratingCode && lead.ratingCode !== input.ratingCode) return false
    const followUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : null
    if (input.followUpScope === "overdue" && (!lead.isOpen || followUp === null || followUp >= Date.now())) return false
    if (input.followUpScope === "scheduled" && followUp === null) return false
    if (input.followUpScope === "unscheduled" && followUp !== null) return false
    const valued = lead.valueAmount !== null || lead.openOpportunityCount > 0
    if (input.valueScope === "valued" && !valued) return false
    if (input.valueScope === "unvalued" && valued) return false
    if (input.openOnly && (!lead.isOpen || lead.isConverted || lead.isDisqualified)) return false
    return true
  })
  const sort = input.sort?.id ?? "lead"
  const direction = input.sort?.direction === "desc" ? -1 : 1
  const compare = (left: ApiLead, right: ApiLead) => {
    const value = (row: ApiLead) => {
      if (sort === "status") return row.statusName
      if (sort === "owner") return row.ownerName ?? ""
      if (sort === "source") return row.sourceName
      if (sort === "rating") return row.ratingName
      if (sort === "last-activity") return row.lastActivityAt ?? ""
      if (sort === "next-follow-up") return row.nextFollowUpAt ?? ""
      if (sort === "created") return row.createdAt
      if (sort === "value") return row.valueAmount ?? -Infinity
      return row.companyName
    }
    const first = value(left)
    const second = value(right)
    const comparison = typeof first === "number" && typeof second === "number"
      ? first - second
      : String(first).localeCompare(String(second))
    return (comparison || left.id.localeCompare(right.id)) * direction
  }
  const ordered = [...filtered].sort(compare)
  const offset = Math.max(0, input.offset)
  const limit = Math.max(1, Math.min(input.limit, 100))
  const pageRows = ordered.slice(offset, offset + limit)
  const countDue = base.filter((lead) => lead.isOpen && lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() <= Date.now()).length
  const pair = (values: Array<{ code: string; name: string }>) => Array.from(new Map(values.map((item) => [item.code, item])).values()).sort((a, b) => a.name.localeCompare(b.name))
  return {
    rows: pageRows,
    total: filtered.length,
    summary: {
      leads: base.length,
      open: base.filter((lead) => lead.isOpen).length,
      converted: base.filter((lead) => lead.isConverted).length,
      disqualified: base.filter((lead) => lead.isDisqualified).length,
      unassigned: base.filter((lead) => lead.ownerId === null).length,
      dueFollowUps: countDue,
      valued: base.filter((lead) => lead.valueAmount !== null || lead.openOpportunityCount > 0).length,
      recent: base.filter((lead) => Date.now() - new Date(lead.createdAt).getTime() <= 30 * 86_400_000).length,
      qualified: base.filter((lead) => (lead.qualificationScore ?? -1) >= 70).length,
      estimatedValue: base.reduce((sum, lead) => sum + (lead.valueAmount ?? 0), 0),
    },
    facets: {
      statuses: pair(base.map((lead) => ({ code: lead.statusCode, name: lead.statusName }))),
      sources: pair(base.map((lead) => ({ code: lead.sourceCode, name: lead.sourceName }))),
      ratings: pair(base.map((lead) => ({ code: lead.ratingCode, name: lead.ratingName }))),
      owners: Array.from(new Map(base.filter((lead) => lead.ownerId && lead.ownerName).map((lead) => [lead.ownerId!, { id: lead.ownerId!, name: lead.ownerName! }])).values()).sort((a, b) => a.name.localeCompare(b.name)),
      hasUnassigned: base.some((lead) => lead.ownerId === null),
    },
  }
}

async function fetchLeadRegisterPage(input: LeadRegisterInput) {
  if (!supabase) throw new LeadApiError("Supabase is not configured for this workspace.")
  const args = {
    p_search: input.search?.trim() || null,
    p_status_code: input.statusCode || null,
    p_owner_id: input.ownerId || null,
    p_unassigned: Boolean(input.unassigned),
    p_source_code: input.sourceCode || null,
    p_rating_code: input.ratingCode || null,
    p_follow_up_scope: input.followUpScope || null,
    p_value_scope: input.valueScope || null,
    p_open_only: Boolean(input.openOnly),
    p_sort: input.sort?.id ?? "lead",
    p_direction: input.sort?.direction ?? "asc",
    p_limit: input.limit,
    p_offset: input.offset,
  }
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000)
  try {
    const { data, error } = await supabase.rpc("multideck_crm_lead_register_page", args).abortSignal(controller.signal)
    if (!error) return data as LeadRegisterPage
    if (missingRegisterRpc(error)) throw new LeadApiError("CRM lead paging is still being prepared. Try again shortly.")
    if (error.code === "42501" || error.code === "22023" || error.code === "P0002") throw new LeadApiError(error.message)
    throw new LeadApiError("CRM leads could not be loaded.")
  } catch (error) {
    if (error instanceof LeadApiError) throw error
    throw new LeadApiError("CRM leads could not be loaded. Check your connection and try again.")
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function listLeadsPage(input: LeadRegisterInput, options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new LeadApiError("Sign in again to view CRM leads.")
  const cacheKey = `leads:page:${JSON.stringify(input)}`
  return readCachedCrmResource(
    session.user.id,
    cacheKey,
    async () => {
      const page = await fetchLeadRegisterPage(input)
      try {
        const signals = await getCrmEngagementSignals({ leadIds: page.rows.map((lead) => lead.id) })
        return { ...page, rows: page.rows.map((lead) => ({ ...lead, engagementSignal: signals.leads.get(lead.id) ?? fallbackEngagementSignal(lead.id, lead.lastActivityAt) })) }
      } catch (error) {
        console.warn("Lead engagement temperature fell back to last-activity recency.", error)
        return { ...page, rows: page.rows.map((lead) => ({ ...lead, engagementSignal: fallbackEngagementSignal(lead.id, lead.lastActivityAt) })) }
      }
    },
    options,
  )
}

export async function getLead(leadId: string) {
  return callCrmRpc<ApiLeadDetail>(
    "multideck_crm_get_lead_essential",
    { p_lead_id: leadId },
    "This lead may have been removed or you may no longer have access.",
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
export async function updateLead(leadId: string, input: UpdateLeadInput, expectedVersion: number) {
  const lead = await callCrmMutation<ApiLead>(
    "multideck_crm_update_lead",
    { p_lead_id: leadId, p_expected_version: expectedVersion, p_input: input },
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
  const lead = await callCrmMutation<ApiLead>(
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

async function fetchCrmTransferUsersPage(input: CrmTransferUsersPageInput) {
  if (!supabase) throw new LeadApiError("Supabase is not configured for this workspace.")
  const limit = Math.max(1, Math.min(input.limit ?? 25, 50))
  const offset = Math.max(0, input.offset ?? 0)
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000)
  try {
    const { data, error } = await supabase.rpc("multideck_crm_transfer_users_page", {
      p_search: input.search?.trim() || null,
      p_exclude_user_id: input.excludeUserId || null,
      p_limit: limit,
      p_offset: offset,
    }).abortSignal(controller.signal)
    if (!error) return data as CrmTransferUsersPage
    if (!missingRegisterRpc(error)) {
      if (error.code === "42501" || error.code === "22023") throw new LeadApiError(error.message)
      throw new LeadApiError("CRM users could not be loaded.")
    }

    throw new LeadApiError("CRM user search is still being prepared. Try again shortly.")
  } catch (error) {
    if (error instanceof LeadApiError || error instanceof CrmSupabaseError) throw error
    throw new LeadApiError("CRM users could not be loaded. Check your connection and try again.")
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function listCrmTransferUsersPage(input: CrmTransferUsersPageInput, options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new LeadApiError("Sign in again to manage lead ownership.")
  const normalized = {
    search: input.search?.trim() ?? "",
    excludeUserId: input.excludeUserId ?? null,
    limit: Math.max(1, Math.min(input.limit ?? 25, 50)),
    offset: Math.max(0, input.offset ?? 0),
  }
  return readCachedCrmResource(
    session.user.id,
    `transfer-users:page:${JSON.stringify(normalized)}`,
    () => fetchCrmTransferUsersPage(normalized),
    options,
  )
}

export async function listLeadTransferRequests(leadId?: string) {
  return callCrmRpc<CrmLeadTransferRequest[]>("multideck_crm_list_transfer_requests", { p_lead_id: leadId || null }, "Lead transfer requests could not be loaded.", "Sign in again to manage lead ownership.")
}

export async function requestLeadTransfer(leadId: string, note?: string) {
  return callCrmMutation<CrmLeadTransferRequest>("multideck_crm_request_lead_transfer", { p_lead_id: leadId, p_note: note?.trim() || null }, "This ownership request could not be created.", "Sign in again to manage lead ownership.")
}

export async function decideLeadTransfer(requestId: string, decision: "approved" | "declined", reason?: string) {
  return callCrmMutation<ApiLead | CrmLeadTransferRequest>("multideck_crm_decide_lead_transfer", { p_request_id: requestId, p_decision: decision, p_reason: reason?.trim() || null }, "This ownership request could not be updated.", "Sign in again to manage lead ownership.")
}

export async function cancelLeadTransfer(requestId: string) {
  return callCrmMutation<CrmLeadTransferRequest>("multideck_crm_cancel_lead_transfer", { p_request_id: requestId }, "This ownership request could not be cancelled.", "Sign in again to manage lead ownership.")
}

export async function transferLead(leadId: string, targetUserId: string, reason?: string) {
  const lead = await callCrmMutation<ApiLead>("multideck_crm_transfer_lead", { p_lead_id: leadId, p_target_user_id: targetUserId, p_reason: reason?.trim() || null }, "This lead could not be transferred.", "Sign in again to manage lead ownership.")
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["leads:"])
  return lead
}
