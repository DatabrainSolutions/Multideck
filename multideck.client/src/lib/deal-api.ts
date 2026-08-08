import { callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
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
  isWon?: boolean
  wonAt?: string | null
  isCustomer?: boolean
  customerOrgId?: string | null
}

export class DealApiError extends CrmSupabaseError {}

export async function getDealConversionOptions() {
  return callCrmRpc<ApiDealConversionOptions>(
    "multideck_crm_deal_conversion_options",
    undefined,
    "Deal options could not be loaded.",
    "Sign in again to manage CRM deals.",
  )
}

export async function convertLeadToDeal(leadId: string, input: ConvertLeadToDealInput) {
  const deal = await callCrmRpc<ApiDeal>(
    "multideck_crm_convert_lead",
    { p_lead_id: leadId, p_input: input },
    "This lead could not be converted.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["leads:", "deals:"])
  return deal
}

export async function listDeals(options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new DealApiError("Sign in again to manage CRM deals.")
  return readCachedCrmResource(
    session.user.id,
    "deals:list",
    () => callCrmRpc<ApiDeal[]>(
      "multideck_crm_list_deals_essential",
      undefined,
      "CRM deals could not be loaded.",
      "Sign in again to manage CRM deals.",
    ),
    options,
  )
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
export async function updateDeal(dealId: string, input: UpdateDealInput) {
  const deal = await callCrmRpc<ApiDeal>(
    "multideck_crm_update_deal",
    { p_deal_id: dealId, p_input: input },
    "This deal could not be saved.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["deals:"])
  return deal
}

export async function moveDealStage(dealId: string, pipelineId: string, pipelineStageId: string) {
  const deal = await callCrmRpc<ApiDeal>(
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
  if (session) invalidateCrmResources(session.user.id, ["deals:"])
  return deal
}

export async function markDealWon(dealId: string, pipelineStageId: string, reason?: string) {
  const deal = await callCrmRpc<ApiDeal>(
    "multideck_crm_win_deal",
    { p_deal_id: dealId, p_pipeline_stage_id: pipelineStageId, p_reason: reason?.trim() || null },
    "This deal could not be converted into a customer.",
    "Sign in again to manage CRM deals.",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["accounts:", "deals:"])
  return deal
}
