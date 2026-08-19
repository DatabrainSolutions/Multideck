import { callCrmMutation, callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
import { getSupabaseSession, supabase } from "@/lib/supabase"

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
  editVersion: number
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
  isWon?: boolean
  wonAt?: string | null
  isCustomer?: boolean
  customerOrgId?: string | null
}

export class DealApiError extends CrmSupabaseError {}

export type DealRegisterSort = { id: string; direction: "asc" | "desc" }

export type DealRegisterPage = {
  rows: ApiDeal[]
  total: number
  summary: {
    deals: number
    open: number
    won: number
    lost: number
    unassigned: number
    pipelineValue: number
    weightedPipelineValue: number
    byStage: Array<{ id: string; name: string; count: number; value: number }>
  }
  facets: {
    pipelines: Array<{ id: string; name: string }>
    stages: Array<{ id: string; name: string; pipelineId: string }>
    statuses: Array<{ code: string; name: string }>
    owners: Array<{ id: string; name: string }>
    hasUnassigned: boolean
  }
}

export type DealRegisterInput = {
  search?: string
  statusCode?: string
  pipelineId?: string
  pipelineStageId?: string
  ownerId?: string
  unassigned?: boolean
  openOnly?: boolean
  sort?: DealRegisterSort | null
  limit: number
  offset: number
}

function missingDealRegisterRpc(error: { code?: string; message?: string }) {
  return ["42883", "PGRST202"].includes(error.code ?? "")
    || /schema cache.*function|function .* does not exist|could not find the function/i.test(error.message ?? "")
}

function dealRegisterFallback(rows: ApiDeal[], input: DealRegisterInput): DealRegisterPage {
  const term = input.search?.trim().toLocaleLowerCase() ?? ""
  const base = rows
  const filtered = base.filter((deal) => {
    if (term && ![
      deal.name, deal.companyName, deal.pipelineName, deal.pipelineStageName, deal.statusName, deal.ownerName,
    ].some((value) => value?.toLocaleLowerCase().includes(term))) return false
    if (input.statusCode && deal.statusCode !== input.statusCode) return false
    if (input.pipelineId && deal.pipelineId !== input.pipelineId) return false
    if (input.pipelineStageId && deal.pipelineStageId !== input.pipelineStageId) return false
    if (input.ownerId && deal.ownerId !== input.ownerId) return false
    if (input.unassigned && deal.ownerId !== null) return false
    if (input.openOnly && (deal.isWon || deal.wonAt || deal.statusCode.toLowerCase() === "lost")) return false
    return true
  })
  const sort = input.sort?.id ?? "deal"
  const direction = input.sort?.direction === "desc" ? -1 : 1
  const compare = (left: ApiDeal, right: ApiDeal) => {
    const value = (row: ApiDeal) => {
      if (sort === "company") return row.companyName
      if (sort === "pipeline") return row.pipelineName
      if (sort === "stage") return row.pipelineStageName
      if (sort === "status") return row.statusName
      if (sort === "owner") return row.ownerName ?? ""
      if (sort === "close-date") return row.expectedCloseDate ?? ""
      if (sort === "value") return row.expectedValueAmount ?? -Infinity
      if (sort === "created") return row.createdAt
      return row.name
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
  const byStage = Array.from(new Map(filtered.map((deal) => [deal.pipelineStageId, {
    id: deal.pipelineStageId,
    name: deal.pipelineStageName,
    count: 0,
    value: 0,
  }])).values())
  for (const deal of filtered) {
    const stage = byStage.find((item) => item.id === deal.pipelineStageId)
    if (stage) {
      stage.count += 1
      stage.value += deal.expectedValueAmount ?? 0
    }
  }
  const pair = (values: Array<{ code: string; name: string }>) => Array.from(new Map(values.map((item) => [item.code, item])).values()).sort((a, b) => a.name.localeCompare(b.name))
  return {
    rows: ordered.slice(offset, offset + limit),
    total: filtered.length,
    summary: {
      deals: filtered.length,
      open: filtered.filter((deal) => !deal.isWon && !deal.wonAt && deal.statusCode.toLowerCase() !== "lost").length,
      won: filtered.filter((deal) => deal.isWon || Boolean(deal.wonAt)).length,
      lost: filtered.filter((deal) => deal.statusCode.toLowerCase() === "lost").length,
      unassigned: filtered.filter((deal) => deal.ownerId === null).length,
      pipelineValue: filtered.filter((deal) => !deal.isWon && !deal.wonAt && deal.statusCode.toLowerCase() !== "lost").reduce((sum, deal) => sum + (deal.expectedValueAmount ?? 0), 0),
      weightedPipelineValue: filtered.filter((deal) => !deal.isWon && !deal.wonAt && deal.statusCode.toLowerCase() !== "lost").reduce((sum, deal) => sum + ((deal.expectedValueAmount ?? 0) * (deal.probabilityPct ?? 0) / 100), 0),
      byStage,
    },
    facets: {
      pipelines: Array.from(new Map(base.map((deal) => [deal.pipelineId, { id: deal.pipelineId, name: deal.pipelineName }])).values()).sort((a, b) => a.name.localeCompare(b.name)),
      stages: Array.from(new Map(base.map((deal) => [deal.pipelineStageId, { id: deal.pipelineStageId, name: deal.pipelineStageName, pipelineId: deal.pipelineId }])).values()).sort((a, b) => a.name.localeCompare(b.name)),
      statuses: pair(base.map((deal) => ({ code: deal.statusCode, name: deal.statusName }))),
      owners: Array.from(new Map(base.filter((deal) => deal.ownerId && deal.ownerName).map((deal) => [deal.ownerId!, { id: deal.ownerId!, name: deal.ownerName! }])).values()).sort((a, b) => a.name.localeCompare(b.name)),
      hasUnassigned: base.some((deal) => deal.ownerId === null),
    },
  }
}

async function fetchDealRegisterPage(input: DealRegisterInput) {
  if (!supabase) throw new DealApiError("Supabase is not configured for this workspace.")
  const args = {
    p_search: input.search?.trim() || null,
    p_status_code: input.statusCode || null,
    p_pipeline_id: input.pipelineId || null,
    p_pipeline_stage_id: input.pipelineStageId || null,
    p_owner_id: input.ownerId || null,
    p_unassigned: Boolean(input.unassigned),
    p_open_only: Boolean(input.openOnly),
    p_sort: input.sort?.id ?? "deal",
    p_direction: input.sort?.direction ?? "asc",
    p_limit: input.limit,
    p_offset: input.offset,
  }
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000)
  try {
    const { data, error } = await supabase.rpc("multideck_crm_deal_register_page", args).abortSignal(controller.signal)
    if (!error) return data as DealRegisterPage
    if (missingDealRegisterRpc(error)) throw new DealApiError("CRM deal paging is still being prepared. Try again shortly.")
    if (error.code === "42501" || error.code === "22023" || error.code === "P0002") throw new DealApiError(error.message)
    throw new DealApiError("CRM deals could not be loaded.")
  } catch (error) {
    if (error instanceof DealApiError) throw error
    throw new DealApiError("CRM deals could not be loaded. Check your connection and try again.")
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function listDealsPage(input: DealRegisterInput, options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new DealApiError("Sign in again to manage CRM deals.")
  const cacheKey = `deals:page:${JSON.stringify(input)}`
  return readCachedCrmResource(
    session.user.id,
    cacheKey,
    () => fetchDealRegisterPage(input),
    options,
  )
}

export async function getDealConversionOptions() {
  return callCrmRpc<ApiDealConversionOptions>(
    "multideck_crm_deal_conversion_options",
    undefined,
    "Deal options could not be loaded.",
    "Sign in again to manage CRM deals.",
  )
}

export async function convertLeadToDeal(leadId: string, input: ConvertLeadToDealInput) {
  const deal = await callCrmMutation<ApiDeal>(
    "multideck_crm_convert_lead",
    { p_lead_id: leadId, p_input: input },
    "This lead could not be converted.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["leads:", "deals:"])
  return deal
}

export async function getDeal(dealId: string, options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new DealApiError("Sign in again to view CRM deals.")
  return readCachedCrmResource(session.user.id, `deal-detail:${dealId}`, async () => {
    if (!supabase) throw new DealApiError("Supabase is not configured for this workspace.")
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000)
    try {
      const { data, error } = await supabase
        .rpc("multideck_crm_get_deal_essential", { p_deal_id: dealId })
        .abortSignal(controller.signal)
      if (!error && data) return data as ApiDeal
      if (error && missingDealRegisterRpc(error)) throw new DealApiError("CRM deal details are still being prepared. Try again shortly.")
      if (error?.code === "42501" || error?.code === "P0002") throw new DealApiError(error.message)
      throw new DealApiError("This deal may have been removed or you may no longer have access.")
    } catch (error) {
      if (error instanceof DealApiError) throw error
      throw new DealApiError("This deal could not be loaded. Check your connection and try again.")
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }, options)
}

export type UpdateDealInput = Partial<{
  name: string
  primaryContactId: string | null
  ownerId: string | null
  expectedCloseDate: string | null
  expectedValueAmount: number | null
  expectedMarginAmount: number | null
  currencyCode: string | null
  modeCode: string | null
  directionCode: string | null
  originName: string | null
  destinationName: string | null
  tradeLane: string | null
  serviceInterest: string | null
  customerNeed: string | null
  valueProposition: string | null
  nextActionDueAt: string | null
}>

/**
 * Writes only the keys given. One inline field can save on its own without the
 * client having to send — and risk overwriting — every neighbouring value.
 */
export async function updateDeal(dealId: string, input: UpdateDealInput, expectedVersion: number) {
  const deal = await callCrmMutation<ApiDeal>(
    "multideck_crm_update_deal",
    { p_deal_id: dealId, p_expected_version: expectedVersion, p_input: input },
    "This deal could not be saved.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["deals:", `deal-detail:${dealId}`])
  return deal
}

export async function moveDealStage(dealId: string, pipelineId: string, pipelineStageId: string) {
  const deal = await callCrmMutation<ApiDeal>(
    "multideck_crm_move_deal_stage",
    {
      p_deal_id: dealId,
      p_pipeline_id: pipelineId,
      p_pipeline_stage_id: pipelineStageId,
    },
    "This deal could not be moved.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["deals:", `deal-detail:${dealId}`])
  return deal
}

export async function markDealWon(dealId: string, pipelineStageId: string, reason?: string) {
  const deal = await callCrmMutation<ApiDeal>(
    "multideck_crm_win_deal",
    { p_deal_id: dealId, p_pipeline_stage_id: pipelineStageId, p_reason: reason?.trim() || null },
    "This deal could not be converted into a customer.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["accounts:", "deals:", `deal-detail:${dealId}`])
  return deal
}
